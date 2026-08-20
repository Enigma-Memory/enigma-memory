#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BROWSER_EXTENSION_PACKAGE_SCHEMA = 'enigma.browser_extension_package.v1';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PACKAGE_DIR = resolve(dirname(SCRIPT_PATH), '..');
const DEFAULT_EXTENSION_DIR = resolve(PACKAGE_DIR, 'apps/browser-extension');
const FIXED_DOS_TIME = 0;
const FIXED_DOS_DATE = 33;
const PRIVATE_EXTENSIONS = new Set(['.cer', '.crt', '.db', '.der', '.key', '.kdbx', '.p12', '.pfx', '.pem', '.sqlite']);
const PRIVATE_BASENAMES = new Set([
  '.env',
  '.env.local',
  '.npmrc',
  'credentials',
  'credentials.json',
  'id_ed25519',
  'id_rsa',
  'secrets.json',
]);
const REQUIRED_MANIFEST_VERSION = 3;
const PACKAGE_ROOT_LABEL = 'apps/browser-extension';
const UTF8_FLAG = 0x0800;

let crcTable;

export function usage() {
  return `Usage: node scripts/package-browser-extension.mjs [--extension-dir <path>] [--zip <path>] [--out <path>] [--plain]\n\nValidates the Enigma browser extension directory and emits a deterministic public-safe package manifest.\n--zip writes a deterministic ZIP archive with fixed timestamps and sorted entries. No store submission is performed.\n--plain prints a human-readable, path-redacted summary while --out still writes JSON.\n`;
}

function readRequiredValue(argv, index, flag) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${flag}.`);
  return value;
}

export function parseBrowserExtensionPackageArgs(argv = process.argv.slice(2)) {
  const options = {
    extensionDir: DEFAULT_EXTENSION_DIR,
    zipPath: null,
    outPath: null,
    plain: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--extension-dir') {
      options.extensionDir = readRequiredValue(argv, index, arg);
      index += 1;
    } else if (arg === '--zip') {
      options.zipPath = readRequiredValue(argv, index, arg);
      index += 1;
    } else if (arg === '--out') {
      options.outPath = readRequiredValue(argv, index, arg);
      index += 1;
    } else if (arg === '--plain' || arg === '--text') {
      options.plain = true;
    } else if (arg === '--format') {
      const value = readRequiredValue(argv, index, arg);
      if (value === 'plain' || value === 'text') options.plain = true;
      else if (value !== 'json') throw new Error('Unknown argument.');
      index += 1;
    } else {
      throw new Error('Unknown argument.');
    }
  }

  return options;
}

function normalizeRelativePath(root, fullPath) {
  const rel = relative(root, fullPath).split(sep).join('/');
  if (!rel || rel.startsWith('../') || rel === '..' || isAbsolute(rel)) throw new Error('Extension file escaped the extension root.');
  return rel;
}

async function listFiles(root, dir = root, output = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      await listFiles(root, fullPath, output);
    } else if (entry.isFile()) {
      output.push({ path: fullPath, relativePath: normalizeRelativePath(root, fullPath) });
    } else {
      throw new Error(`Unsupported extension filesystem entry: ${normalizeRelativePath(root, fullPath)}.`);
    }
  }
  return output;
}

function isForbiddenPrivateFile(relativePath) {
  const parts = relativePath.split('/');
  const basename = parts.at(-1).toLowerCase();
  if (basename.endsWith('.map')) return true;
  if (PRIVATE_BASENAMES.has(basename)) return true;
  if (PRIVATE_EXTENSIONS.has(extname(basename))) return true;
  if (parts.some((part) => part.startsWith('.') && part !== '.well-known')) return true;
  return /(^|[._-])(credential|password|private|secret|token)([._-]|$)/iu.test(basename);
}

function sensitiveContentReason(text) {
  if (/sourceMappingURL\s*=/iu.test(text)) return 'source map reference';
  if (/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/u.test(text)) return 'private key material';
  if (/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}/u.test(text)) return 'credential-shaped bearer value';
  if (/\b[A-Za-z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD)[A-Za-z0-9_]*\s*[:=]\s*['"]?[A-Za-z0-9._~+/=-]{12,}/u.test(text)) return 'credential-shaped assignment';
  if (/[A-Za-z]:\\Users\\[^\r\n'"]+/u.test(text)) return 'local Windows user path';
  if (/\/(?:Users|home)\/[A-Za-z0-9._-]+\//u.test(text)) return 'local user path';
  return null;
}

function publicFileHash(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function requireStringArray(value, label) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry.length === 0)) {
    throw new Error(`${label} must be an array of non-empty strings.`);
  }
  return value;
}

function addReferencedFile(files, path) {
  if (typeof path === 'string' && path.length > 0) files.add(path);
}

function addReferencedIconFiles(files, icons) {
  if (!icons || typeof icons !== 'object' || Array.isArray(icons)) return;
  for (const value of Object.values(icons)) addReferencedFile(files, value);
}

function resolvePackageRelativeImport(fromPath, specifier) {
  if (typeof specifier !== 'string' || !specifier.startsWith('.')) return null;
  const baseParts = fromPath.split('/');
  baseParts.pop();
  const resolved = [];
  for (const part of [...baseParts, ...specifier.split('/')]) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (resolved.length === 0) throw new Error(`Referenced extension module escapes package root: ${specifier}.`);
      resolved.pop();
    } else {
      resolved.push(part);
    }
  }
  return resolved.join('/');
}

function addStaticModuleImports(referencedFiles, availableFiles) {
  const queue = [...referencedFiles].filter((file) => /\.(?:mjs|js)$/iu.test(file));
  for (let index = 0; index < queue.length; index += 1) {
    const file = queue[index];
    const record = availableFiles.get(file);
    if (!record) continue;
    const importRe = /(?:import\s+(?:[^'"]+\s+from\s*)?|export\s+[^'"]+\s+from\s*)['"](\.[^'"]+)['"]/gu;
    for (const match of record.text.matchAll(importRe)) {
      const imported = resolvePackageRelativeImport(file, match[1]);
      if (!imported) continue;
      if (!availableFiles.has(imported)) throw new Error(`Referenced extension file is missing: ${imported}.`);
      if (!referencedFiles.has(imported)) {
        referencedFiles.add(imported);
        if (/\.(?:mjs|js)$/iu.test(imported)) queue.push(imported);
      }
    }
  }
}


function validateManifest(manifest, availableFiles) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('Extension manifest must be a JSON object.');
  if (manifest.manifest_version !== REQUIRED_MANIFEST_VERSION) throw new Error('Extension manifest_version must be 3.');
  if (typeof manifest.name !== 'string' || manifest.name.length === 0) throw new Error('Extension manifest name is required.');
  if (typeof manifest.version !== 'string' || !/^\d+\.\d+\.\d+(?:\.\d+)?$/u.test(manifest.version)) throw new Error('Extension manifest version must be a dotted numeric version.');

  const permissions = Array.isArray(manifest.permissions) ? manifest.permissions : [];
  if (!permissions.includes('nativeMessaging')) throw new Error('Extension manifest must request nativeMessaging permission.');
  if (permissions.includes('storage')) throw new Error('Extension manifest must not request browser storage permission.');
  if (JSON.stringify(manifest).includes('chrome.storage.sync')) throw new Error('Extension manifest must not reference sync storage.');

  const referencedFiles = new Set(['manifest.json']);
  if (manifest.background) addReferencedFile(referencedFiles, manifest.background.service_worker);
  if (Array.isArray(manifest.content_scripts)) {
    for (const [index, script] of manifest.content_scripts.entries()) {
      if (!script || typeof script !== 'object') throw new Error(`content_scripts[${index}] must be an object.`);
      for (const file of requireStringArray(script.js ?? [], `content_scripts[${index}].js`)) referencedFiles.add(file);
      for (const file of requireStringArray(script.css ?? [], `content_scripts[${index}].css`)) referencedFiles.add(file);
      requireStringArray(script.matches ?? [], `content_scripts[${index}].matches`);
    }
  }
  if (manifest.action) {
    addReferencedFile(referencedFiles, manifest.action.default_popup);
    addReferencedIconFiles(referencedFiles, manifest.action.default_icon);
  }
  addReferencedIconFiles(referencedFiles, manifest.icons);
  addReferencedFile(referencedFiles, manifest.options_page);
  addReferencedFile(referencedFiles, manifest.devtools_page);
  if (manifest.options_ui) addReferencedFile(referencedFiles, manifest.options_ui.page);
  if (manifest.side_panel) addReferencedFile(referencedFiles, manifest.side_panel.default_path);
  if (Array.isArray(manifest.web_accessible_resources)) {
    for (const resourceGroup of manifest.web_accessible_resources) {
      for (const file of requireStringArray(resourceGroup?.resources ?? [], 'web_accessible_resources.resources')) referencedFiles.add(file);
    }
  }

  addStaticModuleImports(referencedFiles, availableFiles);

  for (const file of referencedFiles) {
    if (file.includes('\\') || file.startsWith('/') || file.startsWith('../') || file.includes('/../')) throw new Error(`Referenced extension file is not package-relative: ${file}.`);
    if (!availableFiles.has(file)) throw new Error(`Referenced extension file is missing: ${file}.`);
    if (isForbiddenPrivateFile(file)) throw new Error(`Referenced extension file is forbidden: ${file}.`);
  }

  return {
    name: manifest.name,
    version: manifest.version,
    manifest_version: manifest.manifest_version,
    minimum_chrome_version: manifest.minimum_chrome_version ?? null,
    permissions: [...permissions].sort(),
    host_permissions_count: Array.isArray(manifest.host_permissions) ? manifest.host_permissions.length : 0,
    referenced_files: [...referencedFiles].sort(),
  };
}

function assertNoSyncStorage(fileRecords) {
  for (const record of fileRecords) {
    if (/\bchrome\.storage\.sync\b/u.test(record.text)) throw new Error(`Extension source must not use sync storage: ${record.path}.`);
  }
}

export async function collectBrowserExtensionPackageFiles(extensionDir = DEFAULT_EXTENSION_DIR) {
  const root = resolve(String(extensionDir));
  const rootStat = await stat(root).catch(() => null);
  if (!rootStat?.isDirectory()) throw new Error('Browser extension directory is missing.');

  const discovered = await listFiles(root);
  const records = [];
  for (const file of discovered) {
    if (isForbiddenPrivateFile(file.relativePath)) throw new Error(`Forbidden private extension file: ${file.relativePath}.`);
    const buffer = await readFile(file.path);
    const text = buffer.toString('utf8');
    const reason = sensitiveContentReason(text);
    if (reason) throw new Error(`Sensitive ${reason} found in ${file.relativePath}.`);
    records.push({
      path: file.relativePath,
      absolutePath: file.path,
      buffer,
      text,
      size: buffer.byteLength,
      sha256: publicFileHash(buffer),
    });
  }
  records.sort((a, b) => a.path.localeCompare(b.path));
  return records;
}

export async function validateBrowserExtensionPackage(extensionDir = DEFAULT_EXTENSION_DIR) {
  const allFiles = await collectBrowserExtensionPackageFiles(extensionDir);
  const availableFiles = new Map(allFiles.map((file) => [file.path, file]));
  const manifestRecord = availableFiles.get('manifest.json');
  if (!manifestRecord) throw new Error('Extension manifest.json is required.');

  let manifest;
  try {
    manifest = JSON.parse(manifestRecord.text);
  } catch {
    throw new Error('Extension manifest.json must be valid JSON.');
  }

  const manifestSummary = validateManifest(manifest, availableFiles);
  const packageFiles = manifestSummary.referenced_files.map((path) => availableFiles.get(path));
  assertNoSyncStorage(packageFiles);
  return { manifest: manifestSummary, files: packageFiles };
}

function crc32(buffer) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function checkedUInt32(value, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) throw new Error(`${label} exceeds ZIP32 limits.`);
  return value;
}

function localFileHeader(fileNameBuffer, file) {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(UTF8_FLAG, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(FIXED_DOS_TIME, 10);
  header.writeUInt16LE(FIXED_DOS_DATE, 12);
  header.writeUInt32LE(file.crc32, 14);
  header.writeUInt32LE(checkedUInt32(file.buffer.byteLength, 'ZIP file size'), 18);
  header.writeUInt32LE(checkedUInt32(file.buffer.byteLength, 'ZIP file size'), 22);
  header.writeUInt16LE(fileNameBuffer.byteLength, 26);
  header.writeUInt16LE(0, 28);
  return header;
}

function centralDirectoryHeader(fileNameBuffer, file, offset) {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(UTF8_FLAG, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(FIXED_DOS_TIME, 12);
  header.writeUInt16LE(FIXED_DOS_DATE, 14);
  header.writeUInt32LE(file.crc32, 16);
  header.writeUInt32LE(checkedUInt32(file.buffer.byteLength, 'ZIP file size'), 20);
  header.writeUInt32LE(checkedUInt32(file.buffer.byteLength, 'ZIP file size'), 24);
  header.writeUInt16LE(fileNameBuffer.byteLength, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(checkedUInt32(offset, 'ZIP file offset'), 42);
  return header;
}

function endOfCentralDirectory(fileCount, centralSize, centralOffset) {
  const footer = Buffer.alloc(22);
  footer.writeUInt32LE(0x06054b50, 0);
  footer.writeUInt16LE(0, 4);
  footer.writeUInt16LE(0, 6);
  footer.writeUInt16LE(fileCount, 8);
  footer.writeUInt16LE(fileCount, 10);
  footer.writeUInt32LE(checkedUInt32(centralSize, 'ZIP central directory size'), 12);
  footer.writeUInt32LE(checkedUInt32(centralOffset, 'ZIP central directory offset'), 16);
  footer.writeUInt16LE(0, 20);
  return footer;
}

export function createDeterministicZip(files) {
  if (!Array.isArray(files) || files.length === 0) throw new Error('ZIP requires at least one extension file.');
  if (files.length > 0xffff) throw new Error('ZIP file count exceeds ZIP32 limits.');

  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of files) {
    const fileNameBuffer = Buffer.from(entry.path, 'utf8');
    const file = { ...entry, crc32: crc32(entry.buffer) };
    const localHeader = localFileHeader(fileNameBuffer, file);
    localParts.push(localHeader, fileNameBuffer, entry.buffer);
    centralParts.push(centralDirectoryHeader(fileNameBuffer, file, offset), fileNameBuffer);
    offset += localHeader.byteLength + fileNameBuffer.byteLength + entry.buffer.byteLength;
  }
  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.byteLength, 0);
  return Buffer.concat([...localParts, ...centralParts, endOfCentralDirectory(files.length, centralSize, centralOffset)]);
}

function publicFileRecords(files) {
  return files.map((file) => ({ path: file.path, size: file.size, sha256: file.sha256 }));
}

function buildPublicReport({ manifest, files, zipBuffer, zipRequested, zipWritten }) {
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  return {
    schema: BROWSER_EXTENSION_PACKAGE_SCHEMA,
    ok: true,
    public_safe: true,
    extension: manifest,
    package: {
      root: PACKAGE_ROOT_LABEL,
      file_count: files.length,
      total_bytes: totalBytes,
      deterministic_order: files.map((file) => file.path),
      zip_compatible_manifest: true,
      zip_requested: zipRequested,
      zip_written: zipWritten,
      zip_path: zipRequested ? '<zip-output>' : null,
      zip_sha256: zipBuffer ? publicFileHash(zipBuffer) : null,
      blocker: null,
    },
    files: publicFileRecords(files),
    checksums: {
      manifest_sha256: files.find((file) => file.path === 'manifest.json')?.sha256 ?? null,
      zip_sha256: zipBuffer ? publicFileHash(zipBuffer) : null,
    },
    safety: {
      source_maps_denied: true,
      private_files_denied: true,
      token_patterns_denied: true,
      local_paths_denied: true,
      sync_storage_denied: true,
      auto_injection_claimed: false,
      store_submission_performed: false,
      external_network_performed: false,
    },
  };
}

function attachPlainPreference(report, plain) {
  Object.defineProperty(report, '__plain', {
    value: Boolean(plain),
    enumerable: false,
    configurable: true,
  });
  return report;
}

function argvRequestsPlain(argv) {
  if (!Array.isArray(argv)) return Boolean(argv?.plain);
  return argv.some((arg, index) => arg === '--plain' || arg === '--text' || (arg === '--format' && (argv[index + 1] === 'plain' || argv[index + 1] === 'text')));
}

export function renderBrowserExtensionPackagePlain(report) {
  const pkg = report?.package && typeof report.package === 'object' ? report.package : {};
  const safety = report?.safety && typeof report.safety === 'object' ? report.safety : {};
  const status = report?.ok ? 'Ready' : 'Blocked';
  const lines = [
    'Enigma browser extension package',
    `Status: ${status}`,
    `Root: ${pkg.root ?? PACKAGE_ROOT_LABEL}`,
    `Files: ${Number.isInteger(pkg.file_count) ? pkg.file_count : 0}`,
  ];
  if (Number.isInteger(pkg.total_bytes)) lines.push(`Bytes: ${pkg.total_bytes}`);
  if (pkg.zip_written) lines.push(`ZIP: written`);
  else if (pkg.zip_requested) lines.push('ZIP: requested but not written');
  else lines.push('ZIP: not requested');
  if (pkg.zip_sha256) lines.push(`ZIP SHA-256: ${pkg.zip_sha256}`);
  if (report?.error?.message) lines.push(`Issue: ${report.error.message}`);
  if (pkg.blocker) lines.push(`Blocker: ${pkg.blocker}`);
  lines.push(`Safety: source maps ${safety.source_maps_denied === false ? 'unchecked' : 'denied'}, private files ${safety.private_files_denied === false ? 'unchecked' : 'denied'}, credential text ${safety.token_patterns_denied === false ? 'unchecked' : 'denied'}, local paths ${safety.local_paths_denied === false ? 'unchecked' : 'denied'}, sync storage ${safety.sync_storage_denied === false ? 'unchecked' : 'denied'}`);
  lines.push('Boundary: local package validation only; no browser-store submission, signing, upload, provider launch, auto-injection, raw memory, local paths, or network claims.');
  return `${lines.join('\n')}\n`;
}


export async function buildBrowserExtensionPackage(options = {}) {
  const extensionDir = options.extensionDir ?? DEFAULT_EXTENSION_DIR;
  const zipPath = options.zipPath ? resolve(String(options.zipPath)) : null;
  const { manifest, files } = await validateBrowserExtensionPackage(extensionDir);
  const zipBuffer = zipPath ? createDeterministicZip(files) : null;
  if (zipPath) {
    await mkdir(dirname(zipPath), { recursive: true });
    await writeFile(zipPath, zipBuffer);
  }
  return buildPublicReport({ manifest, files, zipBuffer, zipRequested: Boolean(zipPath), zipWritten: Boolean(zipPath) });
}

function safePackageErrorMessage(error) {
  const message = String(error?.message ?? error);
  if (/^(Missing value|Unknown argument|Browser extension directory is missing|Extension manifest|Referenced extension file|Forbidden private extension file|Sensitive .* found in|ZIP |content_scripts|web_accessible_resources)/u.test(message)) return message;
  return 'Browser extension package validation failed.';
}

export async function runPackageBrowserExtension(argv = process.argv.slice(2)) {
  const plainRequested = argvRequestsPlain(argv);
  try {
    const options = Array.isArray(argv) ? parseBrowserExtensionPackageArgs(argv) : { ...argv };
    if (options.help) return attachPlainPreference({ help: usage() }, options.plain);
    const report = await buildBrowserExtensionPackage(options);
    if (options.outPath) {
      const outPath = resolve(String(options.outPath));
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    }
    return attachPlainPreference(report, options.plain);
  } catch (error) {
    return attachPlainPreference({
      schema: BROWSER_EXTENSION_PACKAGE_SCHEMA,
      ok: false,
      public_safe: true,
      error: {
        code: 'BROWSER_EXTENSION_PACKAGE_BLOCKED',
        message: safePackageErrorMessage(error),
      },
      package: {
        root: PACKAGE_ROOT_LABEL,
        zip_written: false,
        blocker: 'Fix extension validation errors before writing a browser-extension ZIP.',
      },
      files: [],
      safety: {
        store_submission_performed: false,
        external_network_performed: false,
      },
    }, plainRequested);
  }
}

async function main() {
  const result = await runPackageBrowserExtension();
  if (result.help) {
    process.stdout.write(result.help);
    return;
  }
  process.stdout.write(result.__plain ? renderBrowserExtensionPackagePlain(result) : `${JSON.stringify(result, null, 2)}\n`);
  if (result.ok === false) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(() => {
    process.stdout.write(`${JSON.stringify({ schema: BROWSER_EXTENSION_PACKAGE_SCHEMA, ok: false, public_safe: true, error: { code: 'BROWSER_EXTENSION_PACKAGE_FAILED', message: 'Browser extension package validation failed.' } }, null, 2)}\n`);
    process.exitCode = 1;
  });
}
