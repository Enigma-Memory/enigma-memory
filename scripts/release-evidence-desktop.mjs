#!/usr/bin/env node
// Enigma Memory — public-safe desktop release evidence packet generator.
// Produces artifact hashes, manifest hash, manifest signature status, signing
// identity placeholders, blockers, and next steps. Never reads signing keys or
// local bundle data.

import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyManifestSignature } from './sign-update-manifest.mjs';

const SCHEMA = 'enigma.desktop_release_evidence.v1';
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');

const SECRET_RE = /(?:bearer\s+[A-Za-z0-9._~+/=-]+|ghp_[A-Za-z0-9_]{16,}|npm_[A-Za-z0-9_-]{24,}|api[_-]?key\s*[=:]|password\s*[=:]|token\s*[=:])/iu;
const WINDOWS_ABSOLUTE_RE = /[A-Za-z]:\\(?:Users|tmp|Temp|Windows|ProgramData|Program Files)\\/u;
const POSIX_ABSOLUTE_RE = /(?:^|[\s"'`=:(])\/(?:Users|home|tmp|var|private|mnt|Volumes)\//u;
const CONTROL_RE = /[\0\r]/u;

function usage() {
  return `Usage: node scripts/release-evidence-desktop.mjs [options]

Options:
  --windows-installer <path>   Path to the signed Windows installer (.exe/.msix).
  --macos-installer <path>     Path to the signed/notarized macOS installer (.dmg/.pkg).
  --manifest <path>            Path to the Tauri updater manifest (manifest.json).
  --manifest-sig <path>        Path to the detached manifest signature file.
                               Defaults to <manifest>.sig.
  --artifacts-dir <dir>        Directory with additional release artifacts to hash.
  --out <path>                 Output path for the evidence JSON (default: dist/desktop-release-evidence.json).
  --write                      Persist the evidence file (default is dry-run).
  --dry-run                    Print the full public-safe evidence packet to stdout.
  --help, -h                   Show this help.

Generates a public-safe desktop release evidence packet. Dry-run is the default;
use --write to persist the evidence file. When no signed installers are present,
the packet records placeholder/missing entries so the script can run without
real release artifacts.
`;
}

function readArg(argv, index, flag) {
  if (index >= argv.length || argv[index].startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return argv[index];
}

export function parseArgs(argv = process.argv.slice(2)) {
  let windowsInstaller = null;
  let macosInstaller = null;
  let manifest = null;
  let manifestSig = null;
  let artifactsDir = null;
  let out = 'dist/desktop-release-evidence.json';
  let write = false;
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--windows-installer') {
      windowsInstaller = readArg(argv, i + 1, '--windows-installer');
      i += 1;
    } else if (arg === '--macos-installer') {
      macosInstaller = readArg(argv, i + 1, '--macos-installer');
      i += 1;
    } else if (arg === '--manifest') {
      manifest = readArg(argv, i + 1, '--manifest');
      i += 1;
    } else if (arg === '--manifest-sig') {
      manifestSig = readArg(argv, i + 1, '--manifest-sig');
      i += 1;
    } else if (arg === '--artifacts-dir') {
      artifactsDir = readArg(argv, i + 1, '--artifacts-dir');
      i += 1;
    } else if (arg === '--out') {
      out = readArg(argv, i + 1, '--out');
      i += 1;
    } else if (arg === '--write') {
      write = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return {
    windowsInstaller,
    macosInstaller,
    manifest,
    manifestSig,
    artifactsDir,
    out,
    write,
    dryRun,
  };
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
    records.push({
      name: entry,
      path: normalizeRel(path.relative(ROOT, full)),
      bytes: stat.size,
      sha256: sha256File(full),
    });
  }
  return records;
}

function readPackageVersion() {
  try {
    const pkgPath = path.join(ROOT, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return pkg.version ?? null;
  } catch {
    return null;
  }
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

function readManifestSignature(manifestPath, explicitSigPath) {
  if (!manifestPath) {
    return { signature_file_present: false, status: 'no_manifest_path' };
  }
  const sigPath = explicitSigPath || `${manifestPath}.sig`;
  const full = path.resolve(sigPath);
  const rel = normalizeRel(path.relative(ROOT, full));
  if (!fs.existsSync(full)) {
    return { signature_file: rel, signature_file_present: false, status: 'missing' };
  }
  const text = fs.readFileSync(full, 'utf8');
  let record;
  try {
    record = JSON.parse(text);
  } catch {
    return { signature_file: rel, signature_file_present: true, status: 'invalid_json' };
  }
  let verified = null;
  try {
    const result = verifyManifestSignature(manifestPath, record);
    verified = result.valid === true;
  } catch {
    verified = false;
  }
  return {
    signature_file: rel,
    signature_file_present: true,
    public_key: record.public_key ?? null,
    key_algorithm: record.key_algorithm ?? null,
    status: verified ? 'verified' : 'present_not_verified',
  };
}

function azureSigningEvidence() {
  const accountName = process.env.AZURE_CODESIGN_ACCOUNT_NAME || null;
  const certProfileName = process.env.AZURE_CODESIGN_CERT_PROFILE_NAME || null;
  const endpoint = process.env.AZURE_CODESIGN_ENDPOINT || null;
  const configured = typeof accountName === 'string' && accountName.length > 0;
  return {
    configured,
    account_name: accountName,
    cert_profile_name: certProfileName,
    endpoint,
    client_id_present: typeof process.env.AZURE_CLIENT_ID === 'string' && process.env.AZURE_CLIENT_ID.length > 0,
    tenant_id_present: typeof process.env.AZURE_TENANT_ID === 'string' && process.env.AZURE_TENANT_ID.length > 0,
    status: configured ? 'configured' : 'pending_azure_setup',
  };
}

function appleSigningEvidence() {
  const teamId = process.env.APPLE_TEAM_ID || null;
  const configured = typeof teamId === 'string' && teamId.length > 0;
  return {
    configured,
    team_id: teamId,
    certificate_present: typeof process.env.APPLE_CERTIFICATE === 'string' && process.env.APPLE_CERTIFICATE.length > 0,
    status: configured ? 'configured' : 'pending_apple_enrollment',
  };
}

function updaterSigningEvidence() {
  return {
    public_key: '<ed25519-public-key-hex-placeholder>',
    key_custody: 'placeholder: private key loaded from CI secret at release time, never committed',
    status: 'placeholder: signing key not present in source',
  };
}

function signingEvidence() {
  return {
    windows: azureSigningEvidence(),
    macos: appleSigningEvidence(),
    updater: updaterSigningEvidence(),
  };
}

function recordInstaller(platform, filePath) {
  const method = platform === 'windows' ? 'Azure Artifact Signing' : 'Apple Developer ID + Notary';
  const configured = platform === 'windows'
    ? typeof process.env.AZURE_CODESIGN_ACCOUNT_NAME === 'string' && process.env.AZURE_CODESIGN_ACCOUNT_NAME.length > 0
    : typeof process.env.APPLE_TEAM_ID === 'string' && process.env.APPLE_TEAM_ID.length > 0;
  if (!filePath) {
    return {
      platform,
      present: false,
      path: null,
      sha256: null,
      bytes: null,
      signature: { status: 'missing_artifact', method, configured },
    };
  }
  const full = path.resolve(filePath);
  if (!fs.existsSync(full)) {
    return {
      platform,
      present: false,
      path: normalizeRel(path.relative(ROOT, full)),
      sha256: null,
      bytes: null,
      signature: { status: 'missing_artifact', method, configured },
    };
  }
  const stat = fs.lstatSync(full);
  if (stat.isSymbolicLink() || stat.isDirectory()) {
    return {
      platform,
      present: false,
      path: normalizeRel(path.relative(ROOT, full)),
      sha256: null,
      bytes: null,
      signature: { status: 'not_a_file', method, configured },
    };
  }
  return {
    platform,
    present: true,
    path: normalizeRel(path.relative(ROOT, full)),
    sha256: sha256File(full),
    bytes: stat.size,
    signature: { status: 'file_present_unverified', method, configured },
  };
}

function deriveBlockersAndNextSteps({ manifest, manifestSignature, windows, macos, signing }) {
  const blockers = [];
  const nextSteps = [];

  if (!windows.present) {
    blockers.push('No Windows installer (.exe/.msix) artifact found or provided.');
    nextSteps.push('Build the Windows installer and pass --windows-installer <path>.');
  } else if (!signing.windows.configured) {
    blockers.push('Windows installer is present but Azure Artifact Signing is not configured in the environment.');
    nextSteps.push('Set AZURE_CODESIGN_ACCOUNT_NAME, AZURE_CODESIGN_CERT_PROFILE_NAME, and AZURE_CODESIGN_ENDPOINT in CI secrets.');
  }

  if (!macos.present) {
    blockers.push('No macOS installer (.dmg/.pkg) artifact found or provided.');
    nextSteps.push('Build the macOS installer and pass --macos-installer <path>.');
  } else if (!signing.macos.configured) {
    blockers.push('macOS installer is present but Apple Developer ID Team ID is not configured in the environment.');
    nextSteps.push('Set APPLE_TEAM_ID and related signing secrets in CI secrets.');
  }

  if (!manifest) {
    blockers.push('No updater manifest provided or found.');
    nextSteps.push('Build the Tauri app and pass --manifest <manifest.json>.');
  } else if (!manifestSignature.signature_file_present) {
    blockers.push('Updater manifest detached signature file is missing.');
    nextSteps.push('Run node scripts/sign-update-manifest.mjs --manifest <manifest.json> --write before release.');
  } else if (manifestSignature.status !== 'verified') {
    blockers.push('Updater manifest signature file is present but could not be verified against the manifest.');
    nextSteps.push('Regenerate the manifest signature with the matching Ed25519 key.');
  }

  if (blockers.length === 0) {
    nextSteps.push('All required signed artifacts and manifest evidence are present; proceed to release audit.');
  }

  return { blockers, nextSteps };
}

function claimBoundaryChecklist() {
  return [
    { id: 'no-secrets-in-source', claim: 'No signing keys, certificates, or tokens are committed to source control.', required: true, status: 'claimed' },
    { id: 'no-raw-memory-in-artifacts', claim: 'Desktop artifacts and manifests do not contain raw memory, prompts, or transcripts.', required: true, status: 'claimed' },
    { id: 'no-absolute-paths', claim: 'Public evidence and manifests do not embed absolute local paths.', required: true, status: 'claimed' },
    { id: 'signing-placeholders', claim: 'Code-signing identities are placeholders or non-secret CI env names; real secrets are injected only in CI release jobs.', required: true, status: 'claimed' },
    { id: 'manifest-signed', claim: 'Update manifest is signed with an Ed25519 key before distribution.', required: true, status: 'pending-release' },
    { id: 'installer-notarized', claim: 'macOS app is notarized and stapled before distribution.', required: true, status: 'pending-real-identity' },
    { id: 'installer-signed-windows', claim: 'Windows installer is signed with a trusted code-signing certificate before distribution.', required: true, status: 'pending-real-identity' },
    { id: 'reproducible-build', claim: 'Release build is reproducible and evidenced by artifact hashes.', required: true, status: 'pending-release' },
  ];
}

export function buildDesktopReleaseEvidence(options = {}) {
  const artifacts = collectArtifacts(options.artifactsDir || 'dist/desktop-artifacts');
  const manifest = readManifest(options.manifest);
  const manifestSignature = readManifestSignature(options.manifest, options.manifestSig);
  const windows = recordInstaller('windows', options.windowsInstaller);
  const macos = recordInstaller('macos', options.macosInstaller);
  const signing = signingEvidence();
  const { blockers, nextSteps } = deriveBlockersAndNextSteps({ manifest, manifestSignature, windows, macos, signing });
  const evidenceId = randomBytes(16).toString('hex');

  const record = {
    schema: SCHEMA,
    evidence_id: evidenceId,
    generated_at: new Date().toISOString(),
    release_version: options.version ?? readPackageVersion(),
    claim_boundary: 'Public desktop release evidence only. No signing keys, certificates, raw memory, or local paths.',
    manifest: manifest ? { ...manifest, signature: manifestSignature } : null,
    installers: [windows, macos],
    artifacts,
    artifact_count: artifacts.length,
    signing_evidence: signing,
    claim_boundary_checklist: claimBoundaryChecklist(),
    blockers,
    next_steps: nextSteps,
    notes: [
      'This packet is produced by scripts/release-evidence-desktop.mjs and is safe for public release.',
      'Real signing identities are intentionally omitted; CI release jobs inject them as secrets.',
      'Installer signature verification is a placeholder until platform-specific signature tools are invoked in CI.',
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
  const outRel = normalizeRel(path.relative(ROOT, path.resolve(args.out)));
  const summary = {
    schema: record.schema,
    evidence_id: record.evidence_id,
    generated_at: record.generated_at,
    release_version: record.release_version,
    artifact_count: record.artifact_count,
    manifest: record.manifest,
    installers: record.installers,
    signing_evidence: record.signing_evidence,
    blockers: record.blockers,
    next_steps: record.next_steps,
    out: outRel,
    wrote: args.write,
  };
  if (args.dryRun) {
    console.log(JSON.stringify(record, null, 2));
  } else {
    console.log(JSON.stringify(summary, null, 2));
  }
  if (args.write) {
    const written = writeEvidence(args.out, record);
    console.log(JSON.stringify({ written: normalizeRel(path.relative(ROOT, written)) }, null, 2));
  }
}

if (process.argv[1] === SCRIPT_PATH) {
  await runReleaseEvidenceDesktop();
}
