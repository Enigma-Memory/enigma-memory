#!/usr/bin/env node
// Enigma Memory — public-safe desktop release evidence packet generator.
// Produces artifact hashes, manifest signature status, signing identity evidence,
// updater public-key provenance, blockers, and next steps. Never reads signing
// keys or local bundle data.

import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyManifestSignature } from './sign-update-manifest.mjs';

const SCHEMA = 'enigma.desktop_release_evidence.v1';
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const DEFAULT_TAURI_CONFIG = path.join(ROOT, 'apps', 'desktop-tauri', 'tauri.conf.json');

const SECRET_RE = /(?:bearer\s+[A-Za-z0-9._~+/=-]+|ghp_[A-Za-z0-9_]{16,}|npm_[A-Za-z0-9_-]{24,}|api[_-]?key\s*[=:]|password\s*[=:]|token\s*[=:])/iu;
const WINDOWS_ABSOLUTE_RE = /[A-Za-z]:[\\/](?:Users|tmp|Temp|Windows|ProgramData|Program Files)[\\/]/u;
const POSIX_ABSOLUTE_RE = /(?:^|[\s"'`=:(])\/(?:Users|home|tmp|var|private|mnt|Volumes)\//u;
const CONTROL_RE = /[\0\r]/u;

function usage() {
  return `Usage: node scripts/release-evidence-desktop.mjs [options]

Options:
  --windows-installer <path>          Path to the signed Windows installer (.exe/.msix).
  --windows-signature-status <status> Public verification status: file_present_unverified or verified.
  --windows-signature-ref <ref>       Public ref/URL for Windows signature verification evidence.
  --macos-installer <path>            Path to the signed/notarized macOS installer (.dmg/.pkg).
  --macos-signature-status <status>   Public verification status: file_present_unverified or verified.
  --macos-signature-ref <ref>         Public ref/URL for macOS signature verification evidence.
  --macos-notarization-status <status> Public notarization status: not_observed, accepted, or rejected.
  --macos-notarization-ref <ref>      Public ref/URL for macOS notarization evidence.
  --macos-stapling-status <status>    Public stapling status: not_observed, stapled, or failed.
  --macos-stapling-ref <ref>          Public ref/URL for macOS stapling evidence.
  --update-rollback-status <status>   Public update rollback rehearsal status: not_run, pass, or fail.
  --update-rollback-ref <ref>         Public ref/URL for update rollback rehearsal evidence.
  --manifest <path>                   Path to the Tauri updater manifest (manifest.json).
  --manifest-sig <path>               Path to the detached manifest signature file.
                                      Defaults to <manifest>.sig.
  --artifacts-dir <dir>               Directory with additional release artifacts to hash.
  --out <path>                        Output path for the evidence JSON (default: dist/desktop-release-evidence.json).
  --write                             Persist the evidence file (default is dry-run).
  --plain                             Print a human-readable, path-redacted summary.
  --dry-run                           Print the full public-safe evidence packet to stdout.
  --help, -h                          Show this help.

Generates a public-safe desktop release evidence packet. Dry-run is the default;
use --write to persist the evidence file. When no verified signed installers are
present, the packet records blockers so templates cannot masquerade as release
evidence.
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
  let windowsSignatureStatus = null;
  let windowsSignatureRef = null;
  let macosInstaller = null;
  let macosSignatureStatus = null;
  let macosSignatureRef = null;
  let macosNotarizationStatus = null;
  let macosNotarizationRef = null;
  let macosStaplingStatus = null;
  let macosStaplingRef = null;
  let updateRollbackStatus = null;
  let updateRollbackRef = null;
  let manifest = null;
  let manifestSig = null;
  let artifactsDir = null;
  let out = 'dist/desktop-release-evidence.json';
  let write = false;
  let plain = false;
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--windows-installer') {
      windowsInstaller = readArg(argv, i + 1, '--windows-installer');
      i += 1;
    } else if (arg === '--windows-signature-status') {
      windowsSignatureStatus = readArg(argv, i + 1, '--windows-signature-status');
      i += 1;
    } else if (arg === '--windows-signature-ref') {
      windowsSignatureRef = readArg(argv, i + 1, '--windows-signature-ref');
      i += 1;
    } else if (arg === '--macos-installer') {
      macosInstaller = readArg(argv, i + 1, '--macos-installer');
      i += 1;
    } else if (arg === '--macos-signature-status') {
      macosSignatureStatus = readArg(argv, i + 1, '--macos-signature-status');
      i += 1;
    } else if (arg === '--macos-signature-ref') {
      macosSignatureRef = readArg(argv, i + 1, '--macos-signature-ref');
      i += 1;
    } else if (arg === '--macos-notarization-status') {
      macosNotarizationStatus = readArg(argv, i + 1, '--macos-notarization-status');
      i += 1;
    } else if (arg === '--macos-notarization-ref') {
      macosNotarizationRef = readArg(argv, i + 1, '--macos-notarization-ref');
      i += 1;
    } else if (arg === '--macos-stapling-status') {
      macosStaplingStatus = readArg(argv, i + 1, '--macos-stapling-status');
      i += 1;
    } else if (arg === '--macos-stapling-ref') {
      macosStaplingRef = readArg(argv, i + 1, '--macos-stapling-ref');
      i += 1;
    } else if (arg === '--update-rollback-status') {
      updateRollbackStatus = readArg(argv, i + 1, '--update-rollback-status');
      i += 1;
    } else if (arg === '--update-rollback-ref') {
      updateRollbackRef = readArg(argv, i + 1, '--update-rollback-ref');
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
    } else if (arg === '--plain' || arg === '--text' || arg === '--format=text' || (arg === '--format' && argv[i + 1] === 'text')) {
      plain = true;
      if (arg === '--format') i += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return {
    windowsInstaller,
    windowsSignatureStatus,
    windowsSignatureRef,
    macosInstaller,
    macosSignatureStatus,
    macosSignatureRef,
    macosNotarizationStatus,
    macosNotarizationRef,
    macosStaplingStatus,
    macosStaplingRef,
    updateRollbackStatus,
    updateRollbackRef,
    manifest,
    manifestSig,
    plain,
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

const PUBLIC_REF_RE = /^(ref:[A-Za-z0-9._:/#-]+|https:\/\/[^\s]+)$/u;
const SIGNATURE_STATUSES = new Set(['file_present_unverified', 'verified']);
const MACOS_NOTARIZATION_STATUSES = new Set(['not_observed', 'accepted', 'rejected']);
const MACOS_STAPLING_STATUSES = new Set(['not_observed', 'stapled', 'failed']);
const UPDATE_ROLLBACK_STATUSES = new Set(['not_run', 'pass', 'fail']);

function readStatus(value, allowed, fallback, label) {
  if (value === null || value === undefined || value === '') return fallback;
  const status = String(value).trim();
  if (!allowed.has(status)) {
    throw new Error(`${label} must be one of: ${[...allowed].join(', ')}`);
  }
  return status;
}

function publicEvidenceRef(value, label) {
  if (value === null || value === undefined || value === '') return null;
  const ref = String(value).trim();
  assertPublicSafe(ref, label);
  if (!PUBLIC_REF_RE.test(ref)) {
    throw new Error(`${label} must be a public ref: ref:* or https://...`);
  }
  return ref;
}

function evidenceStatus(status, evidenceRef, readyStatus, label) {
  const ref = publicEvidenceRef(evidenceRef, `${label} evidence ref`);
  return {
    status,
    evidence_ref: ref,
    evidence_ref_required: status === readyStatus && ref === null,
  };
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

function publicArtifactPath(full) {
  const resolved = path.resolve(full);
  const rel = path.relative(ROOT, resolved);
  if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
    return normalizeRel(rel);
  }
  return normalizeRel(path.basename(resolved));
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
      path: publicArtifactPath(full),
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
    path: publicArtifactPath(full),
    sha256: sha256Text(text),
    version: parsed.version ?? null,
    platforms: parsed.platforms ? Object.keys(parsed.platforms).sort() : [],
  };
}

function readUpdaterConfig(configPath = DEFAULT_TAURI_CONFIG) {
  const full = path.resolve(configPath || DEFAULT_TAURI_CONFIG);
  const configPathPublic = publicArtifactPath(full);
  const base = {
    config_path: configPathPublic,
    config_present: false,
    active: null,
    dialog: null,
    endpoint_count: 0,
    public_key: null,
    public_key_present: false,
    key_algorithm: 'ed25519',
    key_custody: 'CI-secret-only; the private updater key is injected at release time and never written to public evidence.',
  };
  if (!fs.existsSync(full)) {
    return { ...base, status: 'missing_tauri_config' };
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch {
    return { ...base, config_present: true, status: 'invalid_tauri_config' };
  }
  const updater = parsed?.plugins?.updater ?? parsed?.tauri?.updater ?? null;
  const endpoints = Array.isArray(updater?.endpoints) ? updater.endpoints : [];
  const publicKey = typeof updater?.pubkey === 'string' && updater.pubkey.trim().length > 0
    ? updater.pubkey.trim()
    : null;
  const sourceField = updater === parsed?.plugins?.updater
    ? 'plugins.updater.pubkey'
    : updater === parsed?.tauri?.updater ? 'tauri.updater.pubkey' : null;
  return {
    ...base,
    config_present: true,
    active: typeof updater?.active === 'boolean' ? updater.active : null,
    dialog: typeof updater?.dialog === 'boolean' ? updater.dialog : null,
    endpoint_count: endpoints.length,
    public_key: publicKey,
    public_key_present: publicKey !== null,
    source_field: sourceField,
    status: publicKey ? 'configured_from_tauri_config' : 'missing_public_key',
  };
}

function readManifestSignature(manifestPath, explicitSigPath) {
  if (!manifestPath) {
    return { signature_file_present: false, status: 'no_manifest_path' };
  }
  const sigPath = explicitSigPath || `${manifestPath}.sig`;
  const full = path.resolve(sigPath);
  const rel = publicArtifactPath(full);
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
  const accountNamePresent = typeof process.env.AZURE_CODESIGN_ACCOUNT_NAME === 'string' && process.env.AZURE_CODESIGN_ACCOUNT_NAME.length > 0;
  const certProfileNamePresent = typeof process.env.AZURE_CODESIGN_CERT_PROFILE_NAME === 'string' && process.env.AZURE_CODESIGN_CERT_PROFILE_NAME.length > 0;
  const endpointPresent = typeof process.env.AZURE_CODESIGN_ENDPOINT === 'string' && process.env.AZURE_CODESIGN_ENDPOINT.length > 0;
  const configured = accountNamePresent && certProfileNamePresent && endpointPresent;
  return {
    configured,
    account_name_present: accountNamePresent,
    cert_profile_name_present: certProfileNamePresent,
    endpoint_present: endpointPresent,
    client_id_present: typeof process.env.AZURE_CLIENT_ID === 'string' && process.env.AZURE_CLIENT_ID.length > 0,
    tenant_id_present: typeof process.env.AZURE_TENANT_ID === 'string' && process.env.AZURE_TENANT_ID.length > 0,
    status: configured ? 'ci_identity_references_present' : 'pending_azure_setup',
  };
}

function appleSigningEvidence() {
  const teamIdPresent = typeof process.env.APPLE_TEAM_ID === 'string' && process.env.APPLE_TEAM_ID.length > 0;
  return {
    configured: teamIdPresent,
    team_id_present: teamIdPresent,
    certificate_present: typeof process.env.APPLE_CERTIFICATE === 'string' && process.env.APPLE_CERTIFICATE.length > 0,
    status: teamIdPresent ? 'ci_identity_reference_present' : 'pending_apple_enrollment',
  };
}

function updaterSigningEvidence(configPath) {
  const evidence = readUpdaterConfig(configPath);
  return {
    ...evidence,
    configured: evidence.public_key_present,
  };
}

function signingEvidence(options = {}) {
  return {
    windows: azureSigningEvidence(),
    macos: appleSigningEvidence(),
    updater: updaterSigningEvidence(options.tauriConfigPath),
  };
}

function recordInstaller(platform, filePath, options = {}) {
  const method = platform === 'windows' ? 'Azure Artifact Signing' : 'Apple Developer ID + Notary';
  const configured = platform === 'windows'
    ? typeof process.env.AZURE_CODESIGN_ACCOUNT_NAME === 'string' && process.env.AZURE_CODESIGN_ACCOUNT_NAME.length > 0
      && typeof process.env.AZURE_CODESIGN_CERT_PROFILE_NAME === 'string' && process.env.AZURE_CODESIGN_CERT_PROFILE_NAME.length > 0
      && typeof process.env.AZURE_CODESIGN_ENDPOINT === 'string' && process.env.AZURE_CODESIGN_ENDPOINT.length > 0
    : typeof process.env.APPLE_TEAM_ID === 'string' && process.env.APPLE_TEAM_ID.length > 0;
  const missingSignature = { status: 'missing_artifact', method, configured, evidence_ref: null, evidence_ref_required: false };
  const macosIncomplete = platform === 'macos'
    ? {
        notarization: evidenceStatus('not_observed', null, 'accepted', 'macOS notarization'),
        stapling: evidenceStatus('not_observed', null, 'stapled', 'macOS stapling'),
      }
    : {};
  if (!filePath) {
    return {
      platform,
      present: false,
      path: null,
      sha256: null,
      bytes: null,
      signature: missingSignature,
      ...macosIncomplete,
    };
  }
  const full = path.resolve(filePath);
  if (!fs.existsSync(full)) {
    return {
      platform,
      present: false,
      path: publicArtifactPath(full),
      sha256: null,
      bytes: null,
      signature: missingSignature,
      ...macosIncomplete,
    };
  }
  const stat = fs.lstatSync(full);
  if (stat.isSymbolicLink() || stat.isDirectory()) {
    return {
      platform,
      present: false,
      path: publicArtifactPath(full),
      sha256: null,
      bytes: null,
      signature: { status: 'not_a_file', method, configured, evidence_ref: null, evidence_ref_required: false },
      ...macosIncomplete,
    };
  }
  const signatureStatus = readStatus(
    platform === 'windows' ? options.windowsSignatureStatus : options.macosSignatureStatus,
    SIGNATURE_STATUSES,
    'file_present_unverified',
    `${platform} signature status`,
  );
  const signatureRef = platform === 'windows' ? options.windowsSignatureRef : options.macosSignatureRef;
  const installer = {
    platform,
    present: true,
    path: publicArtifactPath(full),
    sha256: sha256File(full),
    bytes: stat.size,
    signature: {
      ...evidenceStatus(signatureStatus, signatureRef, 'verified', `${platform} signature`),
      method,
      configured,
    },
  };
  if (platform === 'macos') {
    installer.notarization = evidenceStatus(
      readStatus(options.macosNotarizationStatus, MACOS_NOTARIZATION_STATUSES, 'not_observed', 'macOS notarization status'),
      options.macosNotarizationRef,
      'accepted',
      'macOS notarization',
    );
    installer.stapling = evidenceStatus(
      readStatus(options.macosStaplingStatus, MACOS_STAPLING_STATUSES, 'not_observed', 'macOS stapling status'),
      options.macosStaplingRef,
      'stapled',
      'macOS stapling',
    );
  }
  return installer;
}

function updateRollbackEvidence(options = {}) {
  return evidenceStatus(
    readStatus(options.updateRollbackStatus, UPDATE_ROLLBACK_STATUSES, 'not_run', 'update rollback status'),
    options.updateRollbackRef,
    'pass',
    'update rollback',
  );
}

function deriveBlockersAndNextSteps({ manifest, manifestSignature, windows, macos, signing, updateRollback }) {
  const blockers = [];
  const nextSteps = [];

  if (!signing.updater.configured) {
    if (signing.updater.status === 'missing_tauri_config') {
      blockers.push('Tauri updater config is missing, so the updater public key cannot be evidenced.');
    } else if (signing.updater.status === 'invalid_tauri_config') {
      blockers.push('Tauri updater config exists but is not valid JSON, so the updater public key cannot be evidenced.');
    } else {
      blockers.push('Tauri updater public key is not configured in tauri.conf.json.');
    }
    nextSteps.push('Add the updater public key to apps/desktop-tauri/tauri.conf.json and keep the matching private key under CI-secret-only custody.');
  }

  if (!windows.present) {
    blockers.push('No Windows installer (.exe/.msix) artifact found or provided.');
    nextSteps.push('Build the Windows installer and pass --windows-installer <path>.');
  } else {
    if (!signing.windows.configured) {
      blockers.push('Windows installer is present but CI evidence does not show Azure Artifact Signing identity references.');
      nextSteps.push('Complete Azure Artifact Signing/Public Trust setup in CI secrets, then provide the signed Windows release artifact.');
    }
    if (windows.signature?.status !== 'verified') {
      blockers.push('Windows installer signature has not been verified from public-safe release evidence.');
      nextSteps.push('Verify the Windows installer signature in CI and pass --windows-signature-status verified with --windows-signature-ref <ref>.');
    } else if (windows.signature.evidence_ref_required) {
      blockers.push('Windows installer signature is marked verified but has no public-safe evidence ref.');
      nextSteps.push('Attach a public-safe Windows signature verification ref with --windows-signature-ref <ref>.');
    }
  }

  if (!macos.present) {
    blockers.push('No macOS installer (.dmg/.pkg) artifact found or provided.');
    nextSteps.push('Build the macOS installer and pass --macos-installer <path>.');
  } else {
    if (!signing.macos.configured) {
      blockers.push('macOS installer is present but CI evidence does not show an Apple Developer ID Team ID reference.');
      nextSteps.push('Store Apple signing credentials in CI secrets, then provide the signed and notarized macOS release artifact.');
    }
    if (macos.signature?.status !== 'verified') {
      blockers.push('macOS installer signature has not been verified from public-safe release evidence.');
      nextSteps.push('Verify the macOS installer signature and pass --macos-signature-status verified with --macos-signature-ref <ref>.');
    } else if (macos.signature.evidence_ref_required) {
      blockers.push('macOS installer signature is marked verified but has no public-safe evidence ref.');
      nextSteps.push('Attach a public-safe macOS signature verification ref with --macos-signature-ref <ref>.');
    }
    if (macos.notarization?.status !== 'accepted') {
      blockers.push('macOS notarization acceptance has not been evidenced.');
      nextSteps.push('Run Apple notarization verification and pass --macos-notarization-status accepted with --macos-notarization-ref <ref>.');
    } else if (macos.notarization.evidence_ref_required) {
      blockers.push('macOS notarization is marked accepted but has no public-safe evidence ref.');
      nextSteps.push('Attach a public-safe notarization evidence ref with --macos-notarization-ref <ref>.');
    }
    if (macos.stapling?.status !== 'stapled') {
      blockers.push('macOS stapling has not been evidenced.');
      nextSteps.push('Verify the notarization ticket is stapled and pass --macos-stapling-status stapled with --macos-stapling-ref <ref>.');
    } else if (macos.stapling.evidence_ref_required) {
      blockers.push('macOS stapling is marked stapled but has no public-safe evidence ref.');
      nextSteps.push('Attach a public-safe stapling evidence ref with --macos-stapling-ref <ref>.');
    }
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

  if (updateRollback.status !== 'pass') {
    blockers.push('Signed update verification and rollback rehearsal have not passed.');
    nextSteps.push('Run the beta-channel update/rollback rehearsal and pass --update-rollback-status pass with --update-rollback-ref <ref>.');
  } else if (updateRollback.evidence_ref_required) {
    blockers.push('Update rollback rehearsal is marked pass but has no public-safe evidence ref.');
    nextSteps.push('Attach a public-safe update rollback rehearsal ref with --update-rollback-ref <ref>.');
  }

  if (blockers.length === 0) {
    nextSteps.push('All required signed artifacts, notarization/stapling, rollback, and manifest evidence are present; proceed to release audit.');
  }

  return { blockers, nextSteps };
}

function claimBoundaryChecklist() {
  return [
    { id: 'no-secrets-in-source', claim: 'No signing keys, certificates, or tokens are committed to source control.', required: true, status: 'claimed' },
    { id: 'no-raw-memory-in-artifacts', claim: 'Desktop artifacts and manifests do not contain raw memory, prompts, or transcripts.', required: true, status: 'claimed' },
    { id: 'no-absolute-paths', claim: 'Public evidence and manifests do not embed absolute local paths.', required: true, status: 'claimed' },
    { id: 'signing-custody', claim: 'Code-signing identities and updater private keys use CI-secret-only custody; public evidence records only public updater keys and non-secret presence booleans.', required: true, status: 'claimed' },
    { id: 'manifest-signed', claim: 'Update manifest is signed with the configured Ed25519 public key before distribution.', required: true, status: 'pending-release' },
    { id: 'installer-notarized', claim: 'macOS app is notarized and stapled before distribution.', required: true, status: 'pending-real-identity' },
    { id: 'installer-signed-windows', claim: 'Windows installer is signed with a trusted code-signing certificate before distribution.', required: true, status: 'pending-real-identity' },
    { id: 'reproducible-build', claim: 'Release build is reproducible and evidenced by artifact hashes.', required: true, status: 'pending-release' },
  ];
}

export function buildDesktopReleaseEvidence(options = {}) {
  const artifacts = collectArtifacts(options.artifactsDir || 'dist/desktop-artifacts');
  const manifest = readManifest(options.manifest);
  const manifestSignature = readManifestSignature(options.manifest, options.manifestSig);
  const windows = recordInstaller('windows', options.windowsInstaller, options);
  const macos = recordInstaller('macos', options.macosInstaller, options);
  const signing = signingEvidence(options);
  const updateRollback = updateRollbackEvidence(options);
  const { blockers, nextSteps } = deriveBlockersAndNextSteps({ manifest, manifestSignature, windows, macos, signing, updateRollback });
  const evidenceId = randomBytes(16).toString('hex');

  const record = {
    schema: SCHEMA,
    evidence_id: evidenceId,
    generated_at: new Date().toISOString(),
    release_version: options.version ?? readPackageVersion(),
    claim_boundary: 'Public desktop release evidence only. No signing keys, certificates, account IDs, raw memory, or local paths.',
    manifest: manifest ? { ...manifest, signature: manifestSignature } : null,
    installers: [windows, macos],
    update_rollback: updateRollback,
    artifacts,
    artifact_count: artifacts.length,
    signing_evidence: signing,
    claim_boundary_checklist: claimBoundaryChecklist(),
    blockers,
    next_steps: nextSteps,
    notes: [
      'This packet is produced by scripts/release-evidence-desktop.mjs and is safe for public release.',
      'Real signing secrets are intentionally omitted; CI release jobs inject private keys and certificates as secrets.',
      'Installer signature, macOS notarization/stapling, and update rollback fields remain blockers until replaced with real public-safe verification evidence.',
    ],
  };

  assertPublicSafe(JSON.stringify(record), 'evidence record');
  return record;
}

export function renderDesktopReleaseEvidencePlain(record, wrote = false) {
  const installerCount = Array.isArray(record.installers) ? record.installers.filter((installer) => installer.present).length : 0;
  const blockers = Array.isArray(record.blockers) ? record.blockers : [];
  const lines = [
    'Enigma desktop release evidence',
    `Status: ${blockers.length === 0 ? 'Ready' : 'Needs attention'}`,
    `Version: ${record.release_version ?? 'unknown'}`,
    `Artifacts: ${record.artifact_count ?? 0}`,
    `Installers present: ${installerCount}`,
    `Updater manifest: ${record.manifest ? 'present' : 'missing'}`,
    `Update rollback: ${record.update_rollback?.status ?? 'not_run'}`,
    `Blockers: ${blockers.length}`,
    `Evidence written: ${wrote ? 'yes' : 'no'}`,
  ];
  for (const blocker of blockers.slice(0, 5)) lines.push(`Blocker: ${blocker}`);
  for (const next of (Array.isArray(record.next_steps) ? record.next_steps.slice(0, 5) : [])) lines.push(`Next: ${next}`);
  lines.push('Boundary: public desktop release evidence only; no signing keys, certificates, account IDs, raw memory, local paths, provider deletion, model behavior, hosted service, signing completion, notarization completion, benchmark superiority, token ROI, or compliance claims.');
  return `${lines.join('\n')}\n`;
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
    update_rollback: record.update_rollback,
    next_steps: record.next_steps,
    out: outRel,
    wrote: args.write,
  };
  if (args.plain) {
    console.log(renderDesktopReleaseEvidencePlain(record, args.write).trimEnd());
  } else if (args.dryRun) {
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
