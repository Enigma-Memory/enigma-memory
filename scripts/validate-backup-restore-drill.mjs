#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BACKUP_RESTORE_DRILL_SCHEMA = 'enigma.backup_restore_drill.v1';
export const BACKUP_RESTORE_DRILL_RESULT_SCHEMA = 'enigma.backup_restore_drill_result.v1';

const SECRET_VALUE_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@|raw memory|private prompt|full transcript|decrypted capsule|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16})/iu;
const SECRET_KEY_RE = /(?:password|passwd|pwd|token|api[_-]?key|private[_-]?key|secret|raw[_-]?memory|plaintext|plain[_-]?text|prompt|completion|transcript|embedding|provider[_-]?response)/iu;
const SAFE_SECRET_NAMED_KEYS = new Set(['kms_or_secret_custody_ref']);
const HASH_RE = /^sha256:[a-f0-9]{64}$/i;
const STATUS_PASS = new Set(['pass', 'passed', 'go', 'verified']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function assertNoSecrets(value, path = 'drill') {
  if (typeof value === 'string') {
    if (!/\.claim_boundary\[\d+\]$/.test(path) && SECRET_VALUE_RE.test(value)) throw new Error(`${path} contains secret or raw-memory-looking data`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecrets(item, `${path}[${index}]`));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY_RE.test(key) && !SAFE_SECRET_NAMED_KEYS.has(key)) throw new Error(`${path}.${key} uses a forbidden field name`);
    assertNoSecrets(child, `${path}.${key}`);
  }
}

function blocker(message, path) {
  return { message, path };
}

function positiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function hashOk(value) {
  return nonEmptyString(value) && HASH_RE.test(value);
}

export function validateBackupRestoreDrill(drill, options = {}) {
  if (!isPlainObject(drill)) throw new Error('backup restore drill must be an object');
  assertNoSecrets(drill);
  const blockers = [];
  if (drill.schema !== BACKUP_RESTORE_DRILL_SCHEMA) blockers.push(blocker('schema mismatch', 'schema'));
  const metadata = drill.metadata;
  if (!isPlainObject(metadata)) blockers.push(blocker('metadata is required', 'metadata'));
  else {
    for (const field of ['drill_id', 'environment', 'tenant', 'storage_engine', 'started_at', 'completed_at', 'operator', 'backup_owner', 'restore_owner']) {
      if (!nonEmptyString(metadata[field])) blockers.push(blocker(`metadata.${field} is required`, `metadata.${field}`));
    }
    if (Number.isNaN(Date.parse(metadata.started_at ?? ''))) blockers.push(blocker('metadata.started_at must be ISO time', 'metadata.started_at'));
    if (Number.isNaN(Date.parse(metadata.completed_at ?? ''))) blockers.push(blocker('metadata.completed_at must be ISO time', 'metadata.completed_at'));
  }
  const backup = drill.backup;
  if (!isPlainObject(backup)) blockers.push(blocker('backup object is required', 'backup'));
  else {
    for (const field of ['backup_ref', 'scope_ref', 'storage_ref', 'kms_or_secret_custody_ref']) {
      if (!nonEmptyString(backup[field])) blockers.push(blocker(`backup.${field} is required`, `backup.${field}`));
    }
    if (!hashOk(backup.source_snapshot_hash)) blockers.push(blocker('backup.source_snapshot_hash must be sha256', 'backup.source_snapshot_hash'));
    if (!positiveNumber(backup.source_row_count)) blockers.push(blocker('backup.source_row_count must be non-negative number', 'backup.source_row_count'));
  }
  const restore = drill.restore;
  if (!isPlainObject(restore)) blockers.push(blocker('restore object is required', 'restore'));
  else {
    for (const field of ['restore_ref', 'target_ref', 'restore_started_at', 'restore_completed_at']) {
      if (!nonEmptyString(restore[field])) blockers.push(blocker(`restore.${field} is required`, `restore.${field}`));
    }
    if (!hashOk(restore.restored_snapshot_hash)) blockers.push(blocker('restore.restored_snapshot_hash must be sha256', 'restore.restored_snapshot_hash'));
    if (!positiveNumber(restore.restored_row_count)) blockers.push(blocker('restore.restored_row_count must be non-negative number', 'restore.restored_row_count'));
  }
  const verification = drill.verification;
  if (!isPlainObject(verification)) blockers.push(blocker('verification object is required', 'verification'));
  else {
    if (!STATUS_PASS.has(String(verification.status ?? '').toLowerCase())) blockers.push(blocker('verification.status must be pass', 'verification.status'));
    if (!hashOk(verification.verifier_output_hash)) blockers.push(blocker('verification.verifier_output_hash must be sha256', 'verification.verifier_output_hash'));
    if (!nonEmptyString(verification.verifier_ref)) blockers.push(blocker('verification.verifier_ref is required', 'verification.verifier_ref'));
  }
  const rpo = drill.rpo_rto;
  if (!isPlainObject(rpo)) blockers.push(blocker('rpo_rto object is required', 'rpo_rto'));
  else {
    if (!positiveNumber(rpo.rpo_seconds)) blockers.push(blocker('rpo_rto.rpo_seconds must be non-negative number', 'rpo_rto.rpo_seconds'));
    if (!positiveNumber(rpo.rto_seconds)) blockers.push(blocker('rpo_rto.rto_seconds must be non-negative number', 'rpo_rto.rto_seconds'));
    if (!positiveNumber(rpo.max_rpo_seconds)) blockers.push(blocker('rpo_rto.max_rpo_seconds must be non-negative number', 'rpo_rto.max_rpo_seconds'));
    if (!positiveNumber(rpo.max_rto_seconds)) blockers.push(blocker('rpo_rto.max_rto_seconds must be non-negative number', 'rpo_rto.max_rto_seconds'));
    if (positiveNumber(rpo.rpo_seconds) && positiveNumber(rpo.max_rpo_seconds) && rpo.rpo_seconds > rpo.max_rpo_seconds) blockers.push(blocker('RPO exceeds maximum', 'rpo_rto.rpo_seconds'));
    if (positiveNumber(rpo.rto_seconds) && positiveNumber(rpo.max_rto_seconds) && rpo.rto_seconds > rpo.max_rto_seconds) blockers.push(blocker('RTO exceeds maximum', 'rpo_rto.rto_seconds'));
  }
  if (isPlainObject(backup) && isPlainObject(restore) && hashOk(backup.source_snapshot_hash) && hashOk(restore.restored_snapshot_hash) && backup.source_snapshot_hash !== restore.restored_snapshot_hash) {
    blockers.push(blocker('restored snapshot hash does not match source snapshot hash', 'restore.restored_snapshot_hash'));
  }
  if (isPlainObject(backup) && isPlainObject(restore) && positiveNumber(backup.source_row_count) && positiveNumber(restore.restored_row_count) && backup.source_row_count !== restore.restored_row_count) {
    blockers.push(blocker('restored row count does not match source row count', 'restore.restored_row_count'));
  }
  const result = {
    schema: BACKUP_RESTORE_DRILL_RESULT_SCHEMA,
    generated_at: options.generated_at ?? options.generatedAt ?? new Date(0).toISOString(),
    ok: blockers.length === 0,
    status: blockers.length === 0 ? 'pass' : 'blocked',
    blockers,
    claim_boundary: [
      'Backup restore drill validation checks declared evidence only; it does not access storage, secrets, or cloud resources.',
      'A pass result is evidence for one named drill and does not prove all future restores.',
      'Raw memory, credentials, private keys, prompts, transcripts, and decrypted content must remain outside drill artifacts.',
    ],
  };
  assertNoSecrets(result, 'result');
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
  const drillPath = getFlag(flags, ['drill', 'in']);
  if (!nonEmptyString(drillPath)) throw new Error('--drill <path> is required');
  const drill = JSON.parse(await readFile(resolve(String(drillPath)), 'utf8'));
  const result = validateBackupRestoreDrill(drill, { generated_at: new Date().toISOString() });
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
