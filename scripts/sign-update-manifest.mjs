#!/usr/bin/env node
// Enigma Memory — Tauri/desktop update manifest signer.
// Signs an update manifest with an Ed25519 key supplied via UPDATE_SIGNING_KEY.
// Emits a detached signature file and never embeds the signing key in output.

import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA = 'enigma.desktop_update_signature.v1';
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');

const SECRET_RE = /(?:bearer\s+[A-Za-z0-9._~+/=-]+|ghp_[A-Za-z0-9_]{16,}|npm_[A-Za-z0-9_-]{24,}|api[_-]?key\s*[=:]|password\s*[=:]|token\s*[=:])/iu;
const WINDOWS_ABSOLUTE_RE = /[A-Za-z]:\\(?:Users|tmp|Temp|Windows|ProgramData|Program Files)\\/u;
const POSIX_ABSOLUTE_RE = /(?:^|[\s"'`=:(])\/(?:Users|home|tmp|var|private|mnt|Volumes)\//u;
const CONTROL_RE = /[\0\r]/u;

function usage() {
  return `Usage: node scripts/sign-update-manifest.mjs --manifest <path> [--out <path>]

Signs a Tauri/desktop update manifest with an Ed25519 key from the UPDATE_SIGNING_KEY
environment variable. Writes a detached signature file. Dry-run (no writes) is the default;
use --write to persist the signature file.
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
  let out = null;
  let write = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--manifest') {
      manifest = readArg(argv, i + 1, '--manifest');
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
  if (!manifest) {
    throw new Error('--manifest is required');
  }
  return { manifest, out: out || `${manifest}.sig`, write };
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

function readPrivateKey() {
  const raw = process.env.UPDATE_SIGNING_KEY;
  if (!raw || raw.trim().length === 0) {
    throw new Error('UPDATE_SIGNING_KEY environment variable is required');
  }
  const key = raw.trim();

  // secret-scan:approved — matches the PEM header sentinel to detect env-var key format, not a real key.
  if (key.includes('-----BEGIN PRIVATE KEY-----')) {
    const pem = key.replace(/\\n/g, '\n');
    return createPrivateKey(pem);
  }

  // Hex-encoded PKCS#8 DER (48 bytes = 96 hex chars).
  if (/^[a-f0-9]{96}$/i.test(key)) {
    return createPrivateKey({ key: Buffer.from(key, 'hex'), format: 'der', type: 'pkcs8' });
  }

  // Raw 32-byte seed (64 hex chars); reconstruct Ed25519 PKCS#8 DER.
  if (/^[a-f0-9]{64}$/i.test(key)) {
    const prefix = Buffer.from('302e020100300506032b657004220420', 'hex');
    const seed = Buffer.from(key, 'hex');
    return createPrivateKey({ key: Buffer.concat([prefix, seed]), format: 'der', type: 'pkcs8' });
  }

  throw new Error('UPDATE_SIGNING_KEY must be an Ed25519 private key in PEM, hex DER (96 chars), or hex seed (64 chars) format');
}

function canonicalManifest(manifestPath) {
  const full = path.resolve(manifestPath);
  if (!fs.existsSync(full)) {
    throw new Error(`Manifest not found: ${manifestPath}`);
  }
  const text = fs.readFileSync(full, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`Manifest is not valid JSON: ${error.message}`);
  }
  // Canonical representation for stable signatures.
  return { text: `${JSON.stringify(parsed, Object.keys(parsed).sort(), 2)}\n`, parsed };
}

export function signManifest(manifestPath, privateKey) {
  const { text, parsed } = canonicalManifest(manifestPath);
  assertPublicSafe(text, 'manifest');
  const signature = sign(null, Buffer.from(text, 'utf8'), privateKey);
  const publicKey = createPublicKey(privateKey);
  const publicKeyDer = publicKey.export({ type: 'spki', format: 'der' });
  // Ed25519 SPKI: 30 2a 30 05 06 03 2b 65 70 03 21 00 <32-byte raw public key>
  const publicKeyRaw = publicKeyDer.slice(12);
  return {
    schema: SCHEMA,
    manifest_hash: createHash('sha256').update(text, 'utf8').digest('hex'),
    signature: signature.toString('base64'),
    public_key: publicKeyRaw.toString('hex'),
    key_algorithm: 'Ed25519',
    signed_at: new Date().toISOString(),
    version: parsed.version ?? null,
  };
}

export function verifyManifestSignature(manifestPath, signatureRecord) {
  const { text } = canonicalManifest(manifestPath);
  const publicKeyRaw = Buffer.from(signatureRecord.public_key, 'hex');
  // Reconstruct SPKI DER from raw Ed25519 public key.
  const prefix = Buffer.from('302a300506032b6570032100', 'hex');
  const publicKey = createPublicKey({ key: Buffer.concat([prefix, publicKeyRaw]), format: 'der', type: 'spki' });
  const signature = Buffer.from(signatureRecord.signature, 'base64');
  const expectedHash = createHash('sha256').update(text, 'utf8').digest('hex');
  if (expectedHash !== signatureRecord.manifest_hash) {
    throw new Error('Manifest hash does not match the signed record');
  }
  const ok = verify(null, Buffer.from(text, 'utf8'), publicKey, signature);
  return { valid: ok, public_key: signatureRecord.public_key, manifest_hash: expectedHash };
}

function writeSignature(outPath, record) {
  const publicSafe = JSON.stringify(record, null, 2);
  assertPublicSafe(publicSafe, 'signature record');
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(outPath, `${publicSafe}\n`, 'utf8');
}

export async function runSignUpdateManifest(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const manifestRel = path.relative(ROOT, path.resolve(args.manifest));
  const outRel = path.relative(ROOT, path.resolve(args.out));
  const privateKey = readPrivateKey();
  const record = signManifest(args.manifest, privateKey);
  const verification = verifyManifestSignature(args.manifest, record);
  if (!verification.valid) {
    throw new Error('Self-verification of the signature failed');
  }
  console.log(JSON.stringify({
    manifest: manifestRel,
    out: outRel,
    wrote: args.write,
    schema: record.schema,
    manifest_hash: record.manifest_hash,
    public_key: record.public_key,
    key_algorithm: record.key_algorithm,
    signed_at: record.signed_at,
  }, null, 2));
  if (args.write) {
    writeSignature(args.out, record);
  }
}

if (process.argv[1] === SCRIPT_PATH) {
  await runSignUpdateManifest();
}
