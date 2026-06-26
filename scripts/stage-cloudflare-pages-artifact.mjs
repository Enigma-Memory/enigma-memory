#!/usr/bin/env node
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validatePublicSiteSecurity } from './validate-public-site-security.mjs';

const STAGE_SCHEMA = 'enigma.cloudflare_pages_stage.v1';
const DEFAULT_HEADERS = Object.freeze([
  ['Permissions-Policy', 'camera=(), microphone=(), geolocation=()'],
  ['Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.fontshare.com; font-src 'self' https://fonts.gstatic.com https://api.fontshare.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"],
]);

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = { site: null, out: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--help') out.help = true;
    else if (token === '--site') out.site = argv[++i] ?? null;
    else if (token === '--out') out.out = argv[++i] ?? null;
    else throw new UsageError(`unknown argument: ${token}`);
  }
  if (out.help) return out;
  if (typeof out.site !== 'string' || out.site.trim().length === 0) throw new UsageError('--site is required');
  if (typeof out.out !== 'string' || out.out.trim().length === 0) throw new UsageError('--out is required');
  return out;
}

function usage() {
  return 'Usage: node scripts/stage-cloudflare-pages-artifact.mjs --site <dir> --out <dir>\n\nCopies a static Pages artifact to a local staging directory and overlays required Cloudflare security headers without mutating the source artifact.\n';
}

function headerName(line) {
  const match = String(line).trim().match(/^([^:]+):\s*.+$/u);
  return match ? match[1].trim().toLowerCase() : null;
}

function ensureRequiredHeaders(text) {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n');
  const lines = normalized.length > 0 ? normalized.split('\n') : [];
  let blockStart = -1;
  let insertAt = -1;
  const present = new Set();

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (blockStart === -1) {
      if (trimmed === '/*') {
        blockStart = i;
        insertAt = lines.length;
      }
      continue;
    }
    if (i > blockStart && lines[i] && !lines[i].startsWith(' ') && !lines[i].startsWith('\t')) {
      insertAt = i;
      break;
    }
    const name = headerName(lines[i]);
    if (name) present.add(name);
  }

  const missing = DEFAULT_HEADERS.filter(([name]) => !present.has(name.toLowerCase()));
  if (missing.length === 0) return normalized.endsWith('\n') ? normalized : `${normalized}\n`;
  const additions = missing.map(([name, value]) => `  ${name}: ${value}`);
  if (blockStart === -1) {
    return [`/*`, ...additions, '', normalized].join('\n').replace(/\n*$/u, '\n');
  }
  const nextLines = [...lines];
  nextLines.splice(insertAt, 0, ...additions);
  return nextLines.join('\n').replace(/\n*$/u, '\n');
}

function publicPathLabel(value, placeholder) {
  const text = String(value ?? '');
  return /^(?:[A-Za-z]:[\\/]|\\\\|\/)/u.test(text) ? placeholder : text;
}

function safeErrorMessage(error) {
  return String(error?.message ?? error).replace(/[A-Z]:\\[^\r\n"']+/gi, '<local-path>');
}

export async function stageCloudflarePagesArtifact(input = {}) {
  const source = resolve(String(input.site ?? ''));
  const out = resolve(String(input.out ?? ''));
  const generatedAt = input.generated_at ?? input.generatedAt ?? new Date().toISOString();
  if (source === out) throw new UsageError('--out must be different from --site');
  await rm(out, { recursive: true, force: true });
  await mkdir(dirname(out), { recursive: true });
  await cp(source, out, { recursive: true, dereference: false, force: true, errorOnExist: false });
  const headersPath = resolve(out, '_headers');
  let headers = '';
  try {
    headers = await readFile(headersPath, 'utf8');
  } catch {
    headers = '';
  }
  await writeFile(headersPath, ensureRequiredHeaders(headers), 'utf8');
  const security = await validatePublicSiteSecurity({ site: out }, { generated_at: generatedAt });
  return {
    schema: STAGE_SCHEMA,
    generated_at: generatedAt,
    source_site: '<source-public-site>',
    staged_site: publicPathLabel(input.out, '<staged-public-site>'),
    headers_overlay: {
      file: '_headers',
      ensured: DEFAULT_HEADERS.map(([name]) => name),
      source_mutated: false,
    },
    security: {
      schema: security.schema,
      ok: security.ok,
      status: security.status,
      blocker_count: security.blockers.length,
      blockers: security.blockers,
      checked: security.checked,
    },
    ok: security.ok,
  };
}

async function main() {
  try {
    const args = parseArgs();
    if (args.help) {
      process.stdout.write(usage());
      return 0;
    }
    const result = await stageCloudflarePagesArtifact(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.ok ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${safeErrorMessage(error)}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
