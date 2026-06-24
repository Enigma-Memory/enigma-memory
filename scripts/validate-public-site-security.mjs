#!/usr/bin/env node
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PUBLIC_SITE_SECURITY_RESULT_SCHEMA = 'enigma.public_site_security_result.v1';

const TEXT_EXTENSIONS = new Set(['.css', '.html', '.js', '.json', '.md', '.svg', '.txt', '.xml', '.yml', '.yaml', '']);
const BLOCKED_DIR_OR_FILE_RE = /(?:^|[\\/])(?:\.git|\.github|\.env(?:\.|$)|node_modules|__pycache__|private|internal|secrets?|credentials?|api[-_]?keys?|private[-_]?keys?|launch-code|raw[-_]?memory)(?:[\\/]|$|[._-])/iu;
const BLOCKED_EXTENSION_RE = /\.(?:map|pem|key|p12|pfx|jks|keystore|sqlite|sqlite3|db|log)(?:$|\.)/iu;
const SECRET_VALUE_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|"(?:raw_memory|plaintext|prompt|completion|transcript|provider_response|memory)"\s*:\s*"[^"]+")/iu;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/giu;
const PHONE_RE = /(?:\+?1[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b|\b(?:\(\d{3}\)|\d{3}[\s.-])[\s.-]?\d{3}[\s.-]\d{4}\b)/g;
const ADDRESS_RE = /\b\d{2,6}\s+[A-Z][A-Za-z0-9.'-]*(?:\s+[A-Z][A-Za-z0-9.'-]*){0,5}\s+(?:St|Street|Ave|Avenue|Rd|Road|Ln|Lane|Dr|Drive|Ct|Court|Blvd|Boulevard|Way|Trail|Trl|Pkwy|Parkway)\b/gu;
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;
const SOURCE_MAP_RE = /sourceMappingURL\s*=|\.map(?:\?|#|$)/iu;
const EXTERNAL_SCRIPT_RE = /<script\b[^>]*\bsrc=["'](?:https?:)?\/\//giu;
const HREF_SRC_RE = /\b(?:href|src)=["']([^"'#?]+)(?:[?#][^"']*)?["']/giu;
const REQUIRED_HEADERS = Object.freeze({
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': null,
  'content-security-policy': null,
});
const ALLOWED_EMAIL_DOMAINS = new Set(['example.com', 'example.org', 'example.net', 'example.invalid', 'enigma.ai', 'enigmamemory.com']);

function blocker(message, path = null) {
  return path ? { message, path } : { message };
}

function toPosix(path) {
  return path.split(sep).join('/');
}

function inside(base, candidate) {
  const rel = relative(base, candidate);
  return rel === '' || (!rel.startsWith('..') && !resolve(rel).startsWith('..'));
}

async function walk(root, dir = root, out = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(root, full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

async function readText(path) {
  return readFile(path, 'utf8');
}

function parseHeaderFile(text) {
  const headers = new Map();
  let active = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (!rawLine.startsWith(' ') && !rawLine.startsWith('\t')) {
      active = line === '/*' || line === '/';
      continue;
    }
    if (!active) continue;
    const match = line.match(/^([^:]+):\s*(.+)$/);
    if (match) headers.set(match[1].trim().toLowerCase(), match[2].trim());
  }
  return headers;
}

function addHeaderBlockers(headers, blockers) {
  for (const [header, expected] of Object.entries(REQUIRED_HEADERS)) {
    if (!headers.has(header)) {
      blockers.push(blocker(`missing required security header: ${header}`, '_headers'));
      continue;
    }
    if (expected !== null && headers.get(header) !== expected) blockers.push(blocker(`security header ${header} must be ${expected}`, '_headers'));
  }
}

function scanEmail(text, rel, blockers) {
  for (const match of text.matchAll(EMAIL_RE)) {
    const domain = String(match[1] ?? '').toLowerCase();
    if (!ALLOWED_EMAIL_DOMAINS.has(domain)) blockers.push(blocker('public site contains raw email address', rel));
  }
}

function scanText(text, rel, blockers) {
  if (SECRET_VALUE_RE.test(text)) blockers.push(blocker('public site contains secret-looking content', rel));
  if (PHONE_RE.test(text)) blockers.push(blocker('public site contains phone-number-looking content', rel));
  if (ADDRESS_RE.test(text)) blockers.push(blocker('public site contains street-address-looking content', rel));
  if (SSN_RE.test(text)) blockers.push(blocker('public site contains SSN-looking content', rel));
  if (SOURCE_MAP_RE.test(text)) blockers.push(blocker('public site references source maps or sourceMappingURL', rel));
  scanEmail(text, rel, blockers);
  if (EXTERNAL_SCRIPT_RE.test(text)) blockers.push(blocker('public site loads external script', rel));
}

function isIgnoredLink(value) {
  return /^(?:https?:|mailto:|tel:|sms:|data:|blob:|javascript:|#)/iu.test(value) || value === '';
}

function normalizeLink(fromRel, value) {
  if (isIgnoredLink(value)) return null;
  if (value.startsWith('/')) return value.slice(1).replace(/\/+/g, '/');
  const baseParts = fromRel.split('/');
  baseParts.pop();
  const parts = [...baseParts, ...value.split('/')];
  const out = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (out.length === 0) return '__ESCAPE__';
      out.pop();
    } else out.push(part);
  }
  return out.join('/');
}

function existsStatic(rel, fileSet) {
  if (rel === '' || rel === '.') return fileSet.has('index.html');
  if (fileSet.has(rel)) return true;
  if (fileSet.has(`${rel}/index.html`)) return true;
  if (rel.endsWith('/') && fileSet.has(`${rel}index.html`)) return true;
  return false;
}

function scanLinks(text, rel, fileSet, blockers) {
  for (const match of text.matchAll(HREF_SRC_RE)) {
    const normalized = normalizeLink(rel, match[1]);
    if (normalized === null) continue;
    if (normalized === '__ESCAPE__') {
      blockers.push(blocker('public site link escapes site root', rel));
      continue;
    }
    if (!existsStatic(normalized, fileSet)) blockers.push(blocker(`public site local link target is missing: ${match[1]}`, rel));
  }
}

export async function validatePublicSiteSecurity(input = {}, options = {}) {
  const site = resolve(String(input.site ?? input.site_dir ?? input.siteDir ?? '_public_site'));
  const blockers = [];
  let files = [];
  try {
    const stats = await stat(site);
    if (!stats.isDirectory()) blockers.push(blocker('site path must be a directory', site));
    else files = await walk(site);
  } catch (error) {
    blockers.push(blocker(`site path is not readable: ${error.message}`, site));
  }

  const relFiles = files.map((file) => toPosix(relative(site, file))).sort();
  const fileSet = new Set(relFiles);
  if (files.length === 0 && blockers.length === 0) blockers.push(blocker('site directory contains no files', site));
  if (!fileSet.has('index.html')) blockers.push(blocker('public site must include index.html', 'index.html'));
  if (!fileSet.has('_headers')) blockers.push(blocker('public site must include _headers', '_headers'));

  for (const rel of relFiles) {
    if (BLOCKED_DIR_OR_FILE_RE.test(rel) || BLOCKED_EXTENSION_RE.test(rel)) blockers.push(blocker('public site contains forbidden private/generated file path', rel));
    const full = resolve(site, rel);
    if (!inside(site, full)) blockers.push(blocker('public site file escapes site root', rel));
  }

  if (fileSet.has('_headers')) {
    try {
      addHeaderBlockers(parseHeaderFile(await readText(join(site, '_headers'))), blockers);
    } catch (error) {
      blockers.push(blocker(`cannot read _headers: ${error.message}`, '_headers'));
    }
  }

  for (const file of files) {
    const rel = toPosix(relative(site, file));
    const ext = extname(file).toLowerCase();
    if (!TEXT_EXTENSIONS.has(ext)) continue;
    let text;
    try {
      text = await readText(file);
    } catch (error) {
      blockers.push(blocker(`cannot read text file: ${error.message}`, rel));
      continue;
    }
    scanText(text, rel, blockers);
    if (ext === '.html') scanLinks(text, rel, fileSet, blockers);
  }

  const result = {
    schema: PUBLIC_SITE_SECURITY_RESULT_SCHEMA,
    generated_at: options.generated_at ?? options.generatedAt ?? new Date(0).toISOString(),
    ok: blockers.length === 0,
    status: blockers.length === 0 ? 'accepted' : 'blocked',
    site,
    blockers,
    checked: {
      file_count: relFiles.length,
      text_file_count: relFiles.filter((rel) => TEXT_EXTENSIONS.has(extname(rel).toLowerCase())).length,
      has_index: fileSet.has('index.html'),
      has_headers: fileSet.has('_headers'),
      forbidden_path_count: blockers.filter((entry) => /forbidden private\/generated file path/.test(entry.message)).length,
    },
    claim_boundary: [
      'Public site security validation checks the supplied static artifact only; it does not deploy, configure DNS/TLS, or verify Cloudflare runtime headers.',
      'A pass result means this local artifact avoided configured PII, secret, source-map, private-collateral, local-link, and security-header blockers.',
      'Personal contact data, credentials, raw-memory values, prompt/transcript/provider-response JSON values, private launch collateral, and source maps must stay out of the public artifact.',
    ],
  };
  return result;
}

function parseArgs(argv = process.argv.slice(2)) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq !== -1) flags.set(arg.slice(2, eq), arg.slice(eq + 1));
    else if (!argv[index + 1] || argv[index + 1].startsWith('--')) flags.set(arg.slice(2), true);
    else {
      flags.set(arg.slice(2), argv[index + 1]);
      index += 1;
    }
  }
  return flags;
}

function getFlag(flags, names) {
  for (const name of names) if (flags.has(name)) return flags.get(name);
  return undefined;
}

async function main() {
  const flags = parseArgs();
  const site = getFlag(flags, ['site', 'site-dir', 'siteDir']) ?? '_public_site';
  const result = await validatePublicSiteSecurity({ site }, { generated_at: new Date().toISOString() });
  const out = getFlag(flags, ['out']);
  const text = `${JSON.stringify(result, null, 2)}\n`;
  if (out && out !== true) {
    const outPath = resolve(String(out));
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, text, 'utf8');
  }
  process.stdout.write(text);
  process.exitCode = result.ok ? 0 : 1;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.name ?? 'Error'}: ${error.message}\n`);
    process.exitCode = 1;
  });
}
