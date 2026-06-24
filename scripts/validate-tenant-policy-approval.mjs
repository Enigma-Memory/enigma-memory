#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TENANT_POLICY_APPROVAL_SCHEMA = 'enigma.tenant_policy_approval.v1';
export const TENANT_POLICY_APPROVAL_RESULT_SCHEMA = 'enigma.tenant_policy_approval_result.v1';

const ENTERPRISE_POLICY_SCHEMA = 'enigma.enterprise_policy.v1';
const ACCEPTED_STATUSES = new Set(['approved', 'accepted', 'go', 'verified']);
const SHA256_PREFIXED_DIGEST = /^sha256:[0-9a-f]{64}$/;
const SECRET_VALUE_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@|raw memory|private prompt|full transcript|decrypted capsule|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16})/iu;
const SECRET_KEY_RE = /(?:password|passwd|pwd|token|api[_-]?key|private[_-]?key|secret|raw[_-]?memory|plaintext|plain[_-]?text|prompt|completion|transcript|embedding|provider[_-]?response)/iu;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function isoLike(value) {
  return nonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

function blocker(message, path) {
  return { message, path };
}

function assertNoSecrets(value, path = 'tenant_policy') {
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

function nonEmptyStringArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every(nonEmptyString);
}

function validateMetadata(metadata, blockers) {
  if (!isPlainObject(metadata)) {
    blockers.push(blocker('metadata is required', 'metadata'));
    return;
  }
  for (const field of ['approval_id', 'environment', 'tenant', 'owner', 'approved_at', 'approval_ref', 'status']) {
    if (!nonEmptyString(metadata[field])) blockers.push(blocker(`metadata.${field} is required`, `metadata.${field}`));
  }
  if (!statusAccepted(metadata.status)) blockers.push(blocker('metadata.status must be approved/accepted/go/verified', 'metadata.status'));
  if (!isoLike(metadata.approved_at)) blockers.push(blocker('metadata.approved_at must be ISO time', 'metadata.approved_at'));
}

function validateEnterprisePolicy(policy, blockers) {
  if (!isPlainObject(policy)) {
    blockers.push(blocker('enterprise_policy object is required', 'enterprise_policy'));
    return false;
  }
  if (policy.schema !== ENTERPRISE_POLICY_SCHEMA) blockers.push(blocker('enterprise_policy.schema must be enigma.enterprise_policy.v1', 'enterprise_policy.schema'));
  for (const field of ['policy_id', 'tenant_id', 'mode', 'created_at', 'updated_at', 'policy_hash']) {
    if (!nonEmptyString(policy[field])) blockers.push(blocker(`enterprise_policy.${field} is required`, `enterprise_policy.${field}`));
  }
  if (!SHA256_PREFIXED_DIGEST.test(String(policy.policy_hash ?? ''))) blockers.push(blocker('enterprise_policy.policy_hash must be sha256-prefixed digest', 'enterprise_policy.policy_hash'));
  if (policy.default_action !== 'deny_unknown') blockers.push(blocker('enterprise_policy.default_action must be deny_unknown', 'enterprise_policy.default_action'));
  if (policy.provider_native_memory !== 'cache_only') blockers.push(blocker('enterprise_policy.provider_native_memory must be cache_only', 'enterprise_policy.provider_native_memory'));
  if (policy.public_proof !== 'hash_only') blockers.push(blocker('enterprise_policy.public_proof must be hash_only', 'enterprise_policy.public_proof'));
  if (!positiveInteger(policy.retention_days)) blockers.push(blocker('enterprise_policy.retention_days must be positive integer', 'enterprise_policy.retention_days'));
  for (const field of ['allowed_operations', 'allowed_providers', 'allowed_models', 'allowed_regions', 'allowed_purposes', 'denied_sensitivities']) {
    if (!nonEmptyStringArray(policy[field])) blockers.push(blocker(`enterprise_policy.${field} must be non-empty string array`, `enterprise_policy.${field}`));
  }
  if (!Array.isArray(policy.legal_holds)) blockers.push(blocker('enterprise_policy.legal_holds must be an array', 'enterprise_policy.legal_holds'));
  return true;
}

function validateApproval(approval, blockers) {
  if (!isPlainObject(approval)) {
    blockers.push(blocker('approval object is required', 'approval'));
    return false;
  }
  for (const field of ['policy_owner', 'approver', 'approval_ref', 'approved_at', 'rollback_policy_hash', 'rollback_ref', 'status']) {
    if (!nonEmptyString(approval[field])) blockers.push(blocker(`approval.${field} is required`, `approval.${field}`));
  }
  if (!statusAccepted(approval.status)) blockers.push(blocker('approval.status must be approved/accepted/go/verified', 'approval.status'));
  if (!isoLike(approval.approved_at)) blockers.push(blocker('approval.approved_at must be ISO time', 'approval.approved_at'));
  if (!SHA256_PREFIXED_DIGEST.test(String(approval.rollback_policy_hash ?? ''))) blockers.push(blocker('approval.rollback_policy_hash must be sha256-prefixed digest', 'approval.rollback_policy_hash'));
  return true;
}

function validateRetentionDeletion(retention, policy, blockers) {
  if (!isPlainObject(retention)) {
    blockers.push(blocker('retention_deletion object is required', 'retention_deletion'));
    return false;
  }
  for (const field of ['tombstone_receipt_ref', 'legal_hold_policy_ref', 'audit_route_ref', 'retention_policy_ref']) {
    if (!nonEmptyString(retention[field])) blockers.push(blocker(`retention_deletion.${field} is required`, `retention_deletion.${field}`));
  }
  if (!positiveInteger(retention.retention_days)) blockers.push(blocker('retention_deletion.retention_days must be positive integer', 'retention_deletion.retention_days'));
  if (isPlainObject(policy) && positiveInteger(policy.retention_days) && retention.retention_days !== policy.retention_days) blockers.push(blocker('retention_deletion.retention_days must match enterprise_policy.retention_days', 'retention_deletion.retention_days'));
  if (retention.tombstone_receipt_required !== true) blockers.push(blocker('retention_deletion.tombstone_receipt_required must be true', 'retention_deletion.tombstone_receipt_required'));
  if (retention.legal_hold_delete_blocks !== true) blockers.push(blocker('retention_deletion.legal_hold_delete_blocks must be true', 'retention_deletion.legal_hold_delete_blocks'));
  if (retention.provider_deletion_claimed !== false) blockers.push(blocker('retention_deletion.provider_deletion_claimed must be false', 'retention_deletion.provider_deletion_claimed'));
  return true;
}

function validateAuditControls(audit, blockers) {
  if (!isPlainObject(audit)) {
    blockers.push(blocker('audit_controls object is required', 'audit_controls'));
    return false;
  }
  for (const field of ['gateway_decision_ref', 'siem_event_ref', 'evidence_retention_ref', 'review_ref']) {
    if (!nonEmptyString(audit[field])) blockers.push(blocker(`audit_controls.${field} is required`, `audit_controls.${field}`));
  }
  if (audit.gateway_decision_required !== true) blockers.push(blocker('audit_controls.gateway_decision_required must be true', 'audit_controls.gateway_decision_required'));
  if (audit.siem_event_required !== true) blockers.push(blocker('audit_controls.siem_event_required must be true', 'audit_controls.siem_event_required'));
  if (audit.minimized_events_only !== true) blockers.push(blocker('audit_controls.minimized_events_only must be true', 'audit_controls.minimized_events_only'));
  return true;
}

function validateChangeControl(change, blockers) {
  if (!isPlainObject(change)) {
    blockers.push(blocker('change_control object is required', 'change_control'));
    return false;
  }
  for (const field of ['change_ticket_ref', 'canary_ref', 'rollback_ref', 'emergency_freeze_ref', 'owner']) {
    if (!nonEmptyString(change[field])) blockers.push(blocker(`change_control.${field} is required`, `change_control.${field}`));
  }
  if (change.force_push_allowed !== false) blockers.push(blocker('change_control.force_push_allowed must be false', 'change_control.force_push_allowed'));
  return true;
}

export function validateTenantPolicyApproval(packet, options = {}) {
  if (!isPlainObject(packet)) throw new Error('tenant policy approval must be an object');
  assertNoSecrets(packet);
  const blockers = [];
  if (packet.schema !== TENANT_POLICY_APPROVAL_SCHEMA) blockers.push(blocker('schema mismatch', 'schema'));
  validateMetadata(packet.metadata, blockers);
  const policyOk = validateEnterprisePolicy(packet.enterprise_policy, blockers);
  const approvalOk = validateApproval(packet.approval, blockers);
  const retentionOk = validateRetentionDeletion(packet.retention_deletion, packet.enterprise_policy, blockers);
  const auditOk = validateAuditControls(packet.audit_controls, blockers);
  const changeOk = validateChangeControl(packet.change_control, blockers);

  const result = {
    schema: TENANT_POLICY_APPROVAL_RESULT_SCHEMA,
    generated_at: options.generated_at ?? options.generatedAt ?? new Date(0).toISOString(),
    ok: blockers.length === 0,
    status: blockers.length === 0 ? 'accepted' : 'blocked',
    blockers,
    checked: {
      enterprise_policy: policyOk,
      approval: approvalOk,
      retention_deletion: retentionOk,
      audit_controls: auditOk,
      change_control: changeOk,
      policy_hash: isPlainObject(packet.enterprise_policy) ? packet.enterprise_policy.policy_hash ?? null : null,
    },
    claim_boundary: [
      'Tenant policy approval validation checks declared policy approval shape only; it does not deploy policy, mutate tenant state, or prove hosted readiness.',
      'Provider-native memory must remain cache_only and provider deletion must not be claimed by tenant policy evidence.',
      'Secrets, raw memory, prompts, transcripts, provider responses, decrypted content, credentials, and private key material must remain outside tenant policy artifacts.',
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
  const policyPath = getFlag(flags, ['approval', 'policy', 'in']);
  if (!nonEmptyString(policyPath)) throw new Error('--approval <path> is required');
  const packet = JSON.parse(await readFile(resolve(String(policyPath)), 'utf8'));
  const result = validateTenantPolicyApproval(packet, { generated_at: new Date().toISOString() });
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
