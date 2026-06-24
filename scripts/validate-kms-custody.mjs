#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const KMS_CUSTODY_SCHEMA = 'enigma.kms_custody.v1';
export const KMS_CUSTODY_RESULT_SCHEMA = 'enigma.kms_custody_result.v1';

export const REQUIRED_CUSTODY_ITEMS = Object.freeze([
  'relay_signing_key',
  'witness_signing_key',
  'gateway_signing_key',
  'gateway_admin_bearer_hash',
  'gateway_data_plane_bearer_hash',
  'database_credential_ref',
  'siem_destination_credential_ref',
  'backup_encryption_key',
  'tls_certificate_key_ref',
]);

const ACCEPTED_STATUSES = new Set(['approved', 'accepted', 'go', 'verified', 'active']);
const SECRET_VALUE_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@|raw memory|private prompt|full transcript|decrypted capsule|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16})/iu;
const SECRET_KEY_RE = /(?:password|passwd|pwd|token|api[_-]?key|private[_-]?key|secret|raw[_-]?memory|plaintext|plain[_-]?text|prompt|completion|transcript|embedding|provider[_-]?response)/iu;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function positiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isoLike(value) {
  return nonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

function blocker(message, path) {
  return { message, path };
}

function assertNoSecrets(value, path = 'custody') {
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
    if (SECRET_KEY_RE.test(key)) throw new Error(`${path}.${key} uses a forbidden field name`);
    assertNoSecrets(child, `${path}.${key}`);
  }
}

function statusAccepted(value) {
  return typeof value === 'string' && ACCEPTED_STATUSES.has(value.trim().toLowerCase());
}

function validateMetadata(metadata, blockers) {
  if (!isPlainObject(metadata)) {
    blockers.push(blocker('metadata is required', 'metadata'));
    return;
  }
  for (const field of ['custody_id', 'environment', 'tenant', 'owner', 'approved_at', 'approval_ref', 'status']) {
    if (!nonEmptyString(metadata[field])) blockers.push(blocker(`metadata.${field} is required`, `metadata.${field}`));
  }
  if (!statusAccepted(metadata.status)) blockers.push(blocker('metadata.status must be approved/accepted/go/verified/active', 'metadata.status'));
  if (!isoLike(metadata.approved_at)) blockers.push(blocker('metadata.approved_at must be ISO time', 'metadata.approved_at'));
}

function validateProvider(provider, blockers) {
  if (!isPlainObject(provider)) {
    blockers.push(blocker('custody_provider object is required', 'custody_provider'));
    return false;
  }
  for (const field of ['provider_ref', 'region', 'account_ref', 'access_model_ref', 'audit_log_ref', 'owner', 'status']) {
    if (!nonEmptyString(provider[field])) blockers.push(blocker(`custody_provider.${field} is required`, `custody_provider.${field}`));
  }
  if (!statusAccepted(provider.status)) blockers.push(blocker('custody_provider.status must be approved/accepted/go/verified/active', 'custody_provider.status'));
  return true;
}

function validateCustodyItems(items, blockers) {
  if (!Array.isArray(items)) {
    blockers.push(blocker('custody_items array is required', 'custody_items'));
    return { checked: 0, requiredCovered: 0 };
  }
  const byId = new Map();
  items.forEach((item, index) => {
    const path = `custody_items[${index}]`;
    if (!isPlainObject(item)) {
      blockers.push(blocker('custody item must be object', path));
      return;
    }
    for (const field of ['item_id', 'purpose', 'manager_ref', 'access_policy_ref', 'emergency_rotation_ref', 'owner', 'status']) {
      if (!nonEmptyString(item[field])) blockers.push(blocker(`${path}.${field} is required`, `${path}.${field}`));
    }
    if (nonEmptyString(item.item_id)) byId.set(item.item_id, item);
    if (!statusAccepted(item.status)) blockers.push(blocker(`${path}.status must be approved/accepted/go/verified/active`, `${path}.status`));
    if (!positiveNumber(item.rotation_seconds)) blockers.push(blocker(`${path}.rotation_seconds must be positive number`, `${path}.rotation_seconds`));
    if (!isoLike(item.last_rotated_at)) blockers.push(blocker(`${path}.last_rotated_at must be ISO time`, `${path}.last_rotated_at`));
    if (!isoLike(item.next_rotation_at)) blockers.push(blocker(`${path}.next_rotation_at must be ISO time`, `${path}.next_rotation_at`));
    if (item.value_exportable !== false) blockers.push(blocker(`${path}.value_exportable must be false`, `${path}.value_exportable`));
  });
  for (const itemId of REQUIRED_CUSTODY_ITEMS) {
    if (!byId.has(itemId)) blockers.push(blocker(`custody_items must include ${itemId}`, 'custody_items'));
  }
  return { checked: items.length, requiredCovered: REQUIRED_CUSTODY_ITEMS.filter((itemId) => byId.has(itemId)).length };
}

function validateSigningControls(controls, blockers) {
  if (!isPlainObject(controls)) {
    blockers.push(blocker('signing_controls object is required', 'signing_controls'));
    return false;
  }
  for (const field of ['algorithm_policy_ref', 'public_key_registry_ref', 'rotation_runbook_ref', 'verification_runbook_ref']) {
    if (!nonEmptyString(controls[field])) blockers.push(blocker(`signing_controls.${field} is required`, `signing_controls.${field}`));
  }
  if (controls.public_key_published !== true) blockers.push(blocker('signing_controls.public_key_published must be true', 'signing_controls.public_key_published'));
  return true;
}

function validateOperatorAccess(access, blockers) {
  if (!isPlainObject(access)) {
    blockers.push(blocker('operator_access object is required', 'operator_access'));
    return false;
  }
  for (const field of ['least_privilege_ref', 'dual_control_ref', 'break_glass_approval_ref', 'audit_ref', 'review_ref']) {
    if (!nonEmptyString(access[field])) blockers.push(blocker(`operator_access.${field} is required`, `operator_access.${field}`));
  }
  if (access.dual_control_required !== true) blockers.push(blocker('operator_access.dual_control_required must be true', 'operator_access.dual_control_required'));
  if (!positiveNumber(access.review_cadence_seconds)) blockers.push(blocker('operator_access.review_cadence_seconds must be positive number', 'operator_access.review_cadence_seconds'));
  return true;
}

function validateProhibitions(prohibitions, blockers) {
  if (!isPlainObject(prohibitions)) {
    blockers.push(blocker('prohibitions object is required', 'prohibitions'));
    return false;
  }
  for (const field of ['material_in_source', 'material_in_chat', 'material_in_logs', 'artifact_contains_values', 'operator_can_export_values']) {
    if (prohibitions[field] !== false) blockers.push(blocker(`prohibitions.${field} must be false`, `prohibitions.${field}`));
  }
  if (!nonEmptyString(prohibitions.enforcement_ref)) blockers.push(blocker('prohibitions.enforcement_ref is required', 'prohibitions.enforcement_ref'));
  return true;
}

export function validateKmsCustody(custody, options = {}) {
  if (!isPlainObject(custody)) throw new Error('KMS custody evidence must be an object');
  assertNoSecrets(custody);
  const blockers = [];
  if (custody.schema !== KMS_CUSTODY_SCHEMA) blockers.push(blocker('schema mismatch', 'schema'));
  validateMetadata(custody.metadata, blockers);
  const providerOk = validateProvider(custody.custody_provider, blockers);
  const items = validateCustodyItems(custody.custody_items, blockers);
  const signingOk = validateSigningControls(custody.signing_controls, blockers);
  const accessOk = validateOperatorAccess(custody.operator_access, blockers);
  const prohibitionsOk = validateProhibitions(custody.prohibitions, blockers);

  const result = {
    schema: KMS_CUSTODY_RESULT_SCHEMA,
    generated_at: options.generated_at ?? options.generatedAt ?? new Date(0).toISOString(),
    ok: blockers.length === 0,
    status: blockers.length === 0 ? 'accepted' : 'blocked',
    blockers,
    checked: {
      provider: providerOk,
      required_custody_items: REQUIRED_CUSTODY_ITEMS.length,
      custody_items_covered: items.requiredCovered,
      custody_items: items.checked,
      signing_controls: signingOk,
      operator_access: accessOk,
      prohibitions: prohibitionsOk,
    },
    claim_boundary: [
      'KMS custody validation checks declared custody evidence shape only; it does not provision KMS, rotate keys, create credentials, or verify cloud IAM.',
      'A pass result requires references and prohibitions only; it must not include key material, credential values, bearer values, private keys, raw memory, prompts, transcripts, provider responses, or decrypted content.',
      'Custody evidence supports production readiness review but does not prove hosted/BYOC infrastructure is live by itself.',
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
  const custodyPath = getFlag(flags, ['custody', 'in']);
  if (!nonEmptyString(custodyPath)) throw new Error('--custody <path> is required');
  const custody = JSON.parse(await readFile(resolve(String(custodyPath)), 'utf8'));
  const result = validateKmsCustody(custody, { generated_at: new Date().toISOString() });
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
