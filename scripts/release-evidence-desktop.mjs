#!/usr/bin/env node
// Enigma Memory — public-safe desktop release evidence packet generator.
// Produces artifact hashes, manifest hash, signing identity placeholders, and a
// claim-boundary checklist. Never reads signing keys or local bundle data.

import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA = 'enigma.desktop_release_evidence.v1';
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');

const SECRET_RE = /(?:bearer\s+[A-Za-z0-9._~+/=-]+|ghp_[A-Za-z0-9_]{16,}|npm_[A-Za-z0-9_-]{24,}|api[_-]?key\s*[=:]|password\s*[=:]|token\s*[=:])/iu;
const WINDOWS_ABSOLUTE_RE = /[A-Za-z]:\\(?:Users|tmp|Temp|Windows|ProgramData|Program Files)\\/u;
const POSIX_ABSOLUTE_RE = /(?:^|[\s"'`=:(])\/(?:Users|home|tmp|var|private|mnt|Volumes)\//u;
const CONTROL_RE = /[\0\r]/u;

function usage() {
  return `Usage: node scripts/release-evidence-desktop.mjs [--manifest <path>] [--artifacts-dir <dir>] [--out <path>] [--write]

Generates a public-safe desktop release evidence packet. Reads artifact files from
--artifacts-dir and a Tauri update manifest from --manifest. Dry-run (no writes) is the
default; use --write to persist the evidence file.
`;
}

function readArg(argv, index, flag) {
  if (index >= argv.length || argv[index].startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return argv[index];
}

export function parseArgs(argv = process.argv.slice(2)) {
  let manifest = null;
  let artifactsDir = null;
  let out = 'dist/desktop-release-evidence.json';
  let write = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--manifest') {
      manifest = readArg(argv, i + 1, '--manifest');
      i += 1;
    } else if (arg === '--artifacts-dir') {
      artifactsDir = readArg(argv, i + 1, '--artifacts-dir');
      i += 1;
    } else if (arg === '--out') {
      out = readArg(argv, i + 1, '--out');
      i += 1;
    } else if (arg === '--write') {
      write = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { manifest, artifactsDir, out, write };
}

function assertPublicSafe(value, label) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (SECRET_RE.test(text)) {
    throw new Error(`${label} contains a possible secret/token pattern`);
  }
  if (WINDOWS_ABSOLUTE_RE.test(text) || POSIX_ABSOLUTE_RE.test(text)) {
    throw new Error(`${label} contains an absolute local path`);
  }
  if (CONTROL_RE.test(text)) {
    throw new Error(`${label} contains control characters`);
  }
}

function sha256File(full) {
  return createHash('sha256').update(fs.readFileSync(full)).digest('hex');
}

function sha256Text(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function normalizeRel(rel) {
  return String(rel).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/');
}

function collectArtifacts(dir) {
  const fullDir = path.resolve(dir);
  if (!fs.existsSync(fullDir)) return [];
  const records = [];
  for (const entry of fs.readdirSync(fullDir).sort()) {
    const full = path.join(fullDir, entry);
    const stat = fs.lstatSync(full);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) continue;
    const rel = normalizeRel(path.relative(ROOT, full));
    records.push({
      name: entry,
      path: rel,
      bytes: stat.size,
      sha256: sha256File(full),
    });
  }
  return records;
}

function readManifest(manifestPath) {
  if (!manifestPath) return null;
  const full = path.resolve(manifestPath);
  if (!fs.existsSync(full)) return null;
  const text = fs.readFileSync(full, 'utf8');
  const parsed = JSON.parse(text);
  return {
    path: normalizeRel(path.relative(ROOT, full)),
    sha256: sha256Text(text),
    version: parsed.version ?? null,
    platforms: parsed.platforms ? Object.keys(parsed.platforms).sort() : [],
  };
}

function signingIdentityPlaceholders() {
  return {
    windows: {
      certificate_thumbprint: '<windows-code-signing-cert-thumbprint>',
      timestamp_url: '<trusted-timestamp-authority-url>',
      store_identity: '<microsoft-store-identity-or-null>',
      status: 'placeholder: no real certificate in CI or source',
    },
    macos: {
      signing_identity: '<apple-developer-id-application-signing-identity>',
      provider_short_name: '<apple-team-provider-short-name>',
      notarization_team_id: '<apple-team-id>',
      status: 'placeholder: no real certificate in CI or source',
    },
    updater: {
      public_key: '<ed25519-public-key-hex-placeholder>',
      key_custody: 'placeholder: key loaded from CI secret at release time, never committed',
      status: 'placeholder: signing key not present in source',
    },
  };
}

function claimBoundaryChecklist() {
  return [
    { id: 'no-secrets-in-source', claim: 'No signing keys, certificates, or tokens are committed to source control.', required: true, status: 'claimed' },
    { id: 'no-raw-memory-in-artifacts', claim: 'Desktop artifacts and manifests do not contain raw memory, prompts, or transcripts.', required: true, status: 'claimed' },
    { id: 'no-absolute-paths', claim: 'Public evidence and manifests do not embed absolute local paths.', required: true, status: 'claimed' },
    { id: 'signing-placeholders', claim: 'Code-signing identities are placeholders; real identities are injected only in CI release jobs.', required: true, status: 'claimed' },
    { id: 'manifest-signed', claim: 'Update manifest is signed with an Ed25519 key before distribution.', required: true, status: 'pending-release' },
    { id: 'installer-notarized', claim: 'macOS app is notarized and stapled before distribution.', required: true, status: 'pending-real-identity' },
    { id: 'installer-signed-windows', claim: 'Windows installer is signed with a trusted code-signing certificate before distribution.', required: true, status: 'pending-real-identity' },
    { id: 'reproducible-build', claim: 'Release build is reproducible and evidenced by artifact hashes.', required: true, status: 'pending-release' },
  ];
}

export function buildDesktopReleaseEvidence(options = {}) {
  const artifacts = collectArtifacts(options.artifactsDir || 'dist/desktop-artifacts');
  const manifest = readManifest(options.manifest);
  const signingIdentities = signingIdentityPlaceholders();
  const checklist = claimBoundaryChecklist();
  const evidenceId = randomBytes(16).toString('hex');

  const record = {
    schema: SCHEMA,
    evidence_id: evidenceId,
    generated_at: new Date().toISOString(),
    claim_boundary: 'Public desktop release evidence only. No signing keys, certificates, raw memory, or local paths.',
    manifest,
    artifacts,
    artifact_count: artifacts.length,
    signing_identities: signingIdentities,
    claim_boundary_checklist: checklist,
    notes: [
      'This packet is produced by scripts/release-evidence-desktop.mjs and is safe for public release.',
      'Real signing identities are intentionally omitted; CI release jobs inject them as secrets.',
    ],
  };

  assertPublicSafe(JSON.stringify(record), 'evidence record');
  return record;
}

function writeEvidence(outPath, record) {
  const resolved = path.resolve(outPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  return resolved;
}

export async function runReleaseEvidenceDesktop(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const record = buildDesktopReleaseEvidence(args);
  const summary = {
    schema: record.schema,
    evidence_id: record.evidence_id,
    generated_at: record.generated_at,
    artifact_count: record.artifact_count,
    manifest: record.manifest,
    out: normalizeRel(path.relative(ROOT, path.resolve(args.out))),
    wrote: args.write,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (args.write) {
    const written = writeEvidence(args.out, record);
    console.log(JSON.stringify({ written }, null, 2));
  }
}

if (process.argv[1] === SCRIPT_PATH) {
  await runReleaseEvidenceDesktop();
}
