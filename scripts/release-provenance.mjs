#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_ROOT_FILES = Object.freeze(['package.json', 'README.md', 'LICENSE']);
const SCHEMA = 'enigma.release_provenance.v1';
const SECRET_OR_LOCAL_BUNDLE_PATH = /(?:^|\/)(?:\.env(?:\.|$)|env\.local$|secrets?|credentials?|tokens?|api[-_]?keys?|private[-_]?keys?|private[-_]?local[-_]?memory|\.enigma|enigma[-_]?bundle|vault[-_]?bundle|local[-_]?bundle|bundle\.json|logs?|npm-debug\.log|yarn-error\.log|pnpm-debug\.log)(?:\/|$|[._-])|\.log(?:\.|$)/i;
const SECRET_EXTENSION = /\.(?:pem|key|p12|pfx|jks|keystore)(?:\.|$)/i;
const PRIVATE_PUBLIC_SITE_COLLATERAL = /(?:^|\/)(?:\d+[_-])?(?:private|internal|launch-code|executive|investor|partner|token(?:omics)?|sales|marketing|funnel|community|social|adoption|objections|faq|whitepaper|litepaper|pitch|demo[-_]?scripts?|content[-_]?calendar|brand[-_]?messaging)[^/]*\.(?:html|json|md|txt)$/i;
const PUBLIC_SITE_MANIFEST_CANDIDATES = Object.freeze([
  '_public_site/public-site-manifest.json',
  '_public_site/manifest.json',
  '_public_site/launch/manifest.json',
  'public/public-site-manifest.json',
  'public/manifest.json',
  'site/public/public-site-manifest.json',
  'site/public/manifest.json'
]);
const KNOWN_SAFE_PATHS = new Set([
  'scripts/scan-secrets.mjs',
]);


function normalizeRel(rel) {
  return String(rel).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/');
}

function safeProjectPath(rel) {
  const normalized = normalizeRel(rel);
  if (normalized.length === 0 || path.posix.isAbsolute(normalized) || normalized.split('/').includes('..')) {
    throw new Error(`Refusing unsafe package path: ${rel}`);
  }
  assertSafeEvidencePath(normalized);
  const full = path.resolve(PROJECT_ROOT, ...normalized.split('/'));
  const relative = path.relative(PROJECT_ROOT, full);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Refusing path outside project root: ${rel}`);
  return { normalized, full };
}

function assertSafeEvidencePath(rel) {
  const normalized = normalizeRel(rel).replace(/^!+/, '');
  if (KNOWN_SAFE_PATHS.has(normalized)) return;
  if (SECRET_OR_LOCAL_BUNDLE_PATH.test(normalized) || SECRET_EXTENSION.test(normalized) || PRIVATE_PUBLIC_SITE_COLLATERAL.test(normalized)) {
    throw new Error(`Refusing release provenance over sensitive or private path: ${normalized}`);
  }
}
function sortedObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortedObject(value[key])]));
}

function sha256File(full) {
  const hash = createHash('sha256');
  hash.update(fs.readFileSync(full));
  return hash.digest('hex');
}

function collectFiles(rel, out) {
  const { normalized, full } = safeProjectPath(rel);
  if (!fs.existsSync(full)) throw new Error(`Package files entry does not exist: ${normalized}`);
  const stat = fs.lstatSync(full);
  if (stat.isSymbolicLink()) throw new Error(`Refusing symlink in package surface: ${normalized}`);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(full).sort()) collectFiles(`${normalized.replace(/\/$/, '')}/${entry}`, out);
    return out;
  }
  if (stat.isFile()) out.add(normalized);
  return out;
}

function readPackageJson() {
  const packagePath = path.join(PROJECT_ROOT, 'package.json');
  return JSON.parse(fs.readFileSync(packagePath, 'utf8'));
}

function collectPackageSurface(pkg) {
  if (!Array.isArray(pkg.files)) throw new Error('package.json files must be an array');
  const rels = new Set();
  for (const rel of PACKAGE_ROOT_FILES) {
    const { full, normalized } = safeProjectPath(rel);
    if (fs.existsSync(full)) rels.add(normalized);
  }
  for (const rel of pkg.files) {
    if (typeof rel !== 'string' || rel.length === 0) throw new Error('package.json files entries must be non-empty strings');
    collectFiles(rel, rels);
  }
  return [...rels].sort();
}

function fileRecord(rel) {
  const { full } = safeProjectPath(rel);
  const stat = fs.statSync(full);
  return {
    path: rel,
    bytes: stat.size,
    sha256: `sha256:${sha256File(full)}`
  };
}

function countFilesUnder(rel, predicate) {
  const { full } = safeProjectPath(rel);
  if (!fs.existsSync(full)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(full).sort()) {
    const childRel = `${normalizeRel(rel).replace(/\/$/, '')}/${entry}`;
    const childFull = path.join(full, entry);
    const stat = fs.lstatSync(childFull);
    if (stat.isSymbolicLink()) throw new Error(`Refusing symlink while counting: ${childRel}`);
    if (stat.isDirectory()) count += countFilesUnder(childRel, predicate);
    else if (stat.isFile() && predicate(childRel)) count += 1;
  }
  return count;
}

function optionalChecksum(rel) {
  const { normalized, full } = safeProjectPath(rel);
  if (!fs.existsSync(full)) return null;
  const stat = fs.lstatSync(full);
  if (stat.isSymbolicLink()) throw new Error(`Refusing symlink optional evidence: ${normalized}`);
  if (!stat.isFile()) throw new Error(`Optional evidence is not a file: ${normalized}`);
  return fileRecord(normalized);
}

function assertManifestPathStrings(value) {
  if (typeof value === 'string') {
    if (value.includes('/') || value.includes('\\') || /\.(?:css|html|js|json|md|mjs|png|svg|webp|log|pem|key)$/i.test(value)) {
      assertSafeEvidencePath(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertManifestPathStrings(item);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) assertManifestPathStrings(item);
  }
}

function validatePublicSiteManifest(rel) {
  const { full } = safeProjectPath(rel);
  const manifest = JSON.parse(fs.readFileSync(full, 'utf8'));
  assertManifestPathStrings(manifest);
}


function publicSiteManifestChecksum() {
  for (const rel of PUBLIC_SITE_MANIFEST_CANDIDATES) {
    const record = optionalChecksum(rel);
    if (record) {
      validatePublicSiteManifest(record.path);
      return record;
    }
  }
  return null;
}

function rootHash(files) {
  const hash = createHash('sha256');
  for (const file of files) hash.update(`${file.sha256}  ${file.path}\n`, 'utf8');
  return `sha256:${hash.digest('hex')}`;
}

function parseArgs(argv) {
  let out = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out') {
      if (out !== null) throw new Error('--out may only be provided once');
      const value = argv[index + 1];
      if (!value) throw new Error('--out requires a file path');
      out = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { out };
}

function packageSummary(pkg) {
  const bin = sortedObject(pkg.bin ?? {});
  return {
    name: pkg.name,
    version: pkg.version,
    type: pkg.type ?? null,
    engines: sortedObject(pkg.engines ?? {}),
    bin,
    bins: bin,
    exports: sortedObject(pkg.exports ?? {}),
    scripts: sortedObject(pkg.scripts ?? {})
  };
}

function buildProvenance() {
  const pkg = readPackageJson();
  const files = collectPackageSurface(pkg).map(fileRecord);
  const ciWorkflow = optionalChecksum('.github/workflows/ci.yml');
  const publicSiteManifest = publicSiteManifestChecksum();
  const computedRootHash = rootHash(files);
  const specCount = countFilesUnder('specs', (rel) => rel.endsWith('.json'));
  const testCount = countFilesUnder('test', (rel) => rel.endsWith('.test.mjs') || rel.endsWith('.test.js') || rel.endsWith('.test.ts'));
  return {
    schema: SCHEMA,
    evidence: {
      kind: 'local_checksum_provenance',
      claim_boundary: 'Local checksum/SBOM-style package evidence only; unsigned and not a registry, cloud, git, or compliance attestation.',
      external_credentials_required: false,
      git_required: false,
      signed: false,
      registry_attestation: false
    },
    package: packageSummary(pkg),
    counts: {
      files: files.length,
      file_count: files.length,
      specs: specCount,
      spec_count: specCount,
      tests: testCount,
      test_count: testCount
    },
    file_count: files.length,
    spec_count: specCount,
    test_count: testCount,
    ci_workflow: ciWorkflow,
    public_site_manifest: publicSiteManifest,
    root_hash: computedRootHash,
    files
  };
}

function writeJsonFile(outPath, value) {
  const resolved = path.resolve(outPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`);
  return resolved;
}

try {
  const { out } = parseArgs(process.argv.slice(2));
  const provenance = buildProvenance();
  if (out) {
    const written = writeJsonFile(out, provenance);
    process.stdout.write(`${JSON.stringify({ ok: true, path: written, file_count: provenance.counts.files, root_hash: provenance.root_hash })}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(provenance, null, 2)}\n`);
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
