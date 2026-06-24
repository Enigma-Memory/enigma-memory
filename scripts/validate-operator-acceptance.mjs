#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const OPERATOR_ACCEPTANCE_PACKET_SCHEMA = 'enigma.operator_acceptance_packet.v1';
export const OPERATOR_ACCEPTANCE_RESULT_SCHEMA = 'enigma.operator_acceptance_result.v1';

export const REQUIRED_PACKET_METADATA = Object.freeze([
  'packet_id',
  'customer_or_tenant',
  'deployment_mode',
  'environment',
  'target_regions',
  'requested_go_live_date',
  'evidence_repository',
  'packet_owner',
  'last_updated',
  'decision',
]);

export const REQUIRED_OWNER_ROLES = Object.freeze([
  'business_owner',
  'enigma_operator_owner',
  'customer_infrastructure_owner',
  'security_owner',
  'legal_privacy_owner',
  'incident_commander',
  'support_sla_owner',
  'tenant_policy_owner',
  'backup_restore_owner',
  'kms_secrets_owner',
  'siem_log_owner',
]);

export const REQUIRED_EVIDENCE_ITEMS = Object.freeze([
  'infrastructure_readiness_json',
  'deployment_manifests',
  'runtime_auth_and_operator_access',
  'network_access_policy',
  'domain_tls_and_public_endpoint_checks',
  'durable_storage',
  'kms_signer_key_refs',
  'kms_custody',
  'tenant_policy',
  'tenant_policy_approval',
  'runtime_health_and_readiness_json',
  'hosted_backend_live_evidence',
  'gateway_allow_deny_checks',
  'usage_metering',
  'service_settlement',
  'public_site_security',
  'security_threat_model',
  'cloudflare_pages_release_packet',
  'cloudflare_token_policy',
  'production_handoff_packet',
  'goal_completion_audit',
  'relay_plaintext_rejection',
  'witness_checkpoint_minimization',
  'audit_outbox_siem',
  'monitoring_alerting',
  'offline_verification',
  'backup_restore_rehearsal',
  'incident_drill',
  'support_sla',
  'legal_compliance_approval',
]);

const GO_DECISIONS = new Set(['go']);
const ACCEPTED_STATUSES = new Set(['complete', 'go', 'accepted', 'verified', 'approved']);
const SECRET_VALUE_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|raw memory|private prompt|full transcript|decrypted capsule)/iu;
const SECRET_KEY_RE = /(?:password|passwd|pwd|token|api[_-]?key|private[_-]?key|secret|raw[_-]?memory|plaintext|plain[_-]?text|prompt|completion|transcript|embedding|provider[_-]?response)/iu;
const TEMPLATE_PLACEHOLDER_RE = /<[^<>\r\n]+>/u;
const SAFE_SECRET_NAMED_KEYS = new Set(['kms_secrets_owner', 'relay_plaintext_rejection', 'kms_or_secret_custody', 'cloudflare_token_policy', 'goal_completion_audit', 'production_manifests', 'required_secret_count']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}
function assertNoSecretPacketData(value, path = 'packet') {
  if (typeof value === 'string') {
    if (!/\.claim_boundary\[\d+\]$/.test(path) && SECRET_VALUE_RE.test(value)) throw new Error(`${path} contains secret or raw-memory-looking data`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecretPacketData(item, `${path}[${index}]`));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY_RE.test(key) && !SAFE_SECRET_NAMED_KEYS.has(key)) throw new Error(`${path}.${key} uses a forbidden evidence field name`);
    assertNoSecretPacketData(child, `${path}.${key}`);
  }
}

function collectTemplatePlaceholderBlockers(value, blockers, path = 'packet') {
  if (typeof value === 'string') {
    if (TEMPLATE_PLACEHOLDER_RE.test(value)) blockers.push(blocker(`${path} must not contain unresolved template placeholders`, path));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectTemplatePlaceholderBlockers(item, blockers, `${path}[${index}]`));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) collectTemplatePlaceholderBlockers(child, blockers, `${path}.${key}`);
}

function statusComplete(value) {
  return typeof value === 'string' && ACCEPTED_STATUSES.has(value.trim().toLowerCase());
}

function evidenceRefComplete(item) {
  return isPlainObject(item) && nonEmptyString(item.ref) && statusComplete(item.status);
}

function ownerComplete(owner) {
  return isPlainObject(owner)
    && nonEmptyString(owner.name)
    && nonEmptyString(owner.organization)
    && nonEmptyString(owner.approval_ref)
    && statusComplete(owner.approval_status);
}

function blocker(message, path) {
  return { message, path };
}

function blockerBreakdown(blockers) {
  const categories = {
    metadata: 0,
    owners: 0,
    evidence: 0,
    readiness: 0,
    manifest: 0,
    storage: 0,
    release_audit: 0,
    production_manifests: 0,
    other: 0,
  };
  for (const item of blockers) {
    const root = String(item?.path ?? '').split('.')[0];
    if (Object.hasOwn(categories, root)) categories[root] += 1;
    else categories.other += 1;
  }
  return Object.fromEntries(Object.entries(categories).filter(([, count]) => count > 0));
}

export function validateOperatorAcceptancePacket(packet, options = {}) {
  if (!isPlainObject(packet)) throw new Error('operator acceptance packet must be an object');
  assertNoSecretPacketData(packet);
  const blockers = [];
  collectTemplatePlaceholderBlockers(packet, blockers);
  const warnings = [];
  if (packet.schema !== OPERATOR_ACCEPTANCE_PACKET_SCHEMA) blockers.push(blocker('packet schema mismatch', 'schema'));
  const metadata = packet.metadata;
  if (!isPlainObject(metadata)) blockers.push(blocker('metadata object is required', 'metadata'));
  else {
    for (const field of REQUIRED_PACKET_METADATA) {
      if (!nonEmptyString(metadata[field])) blockers.push(blocker(`metadata.${field} is required`, `metadata.${field}`));
    }
    if (!GO_DECISIONS.has(String(metadata.decision ?? '').toLowerCase())) blockers.push(blocker('metadata.decision must be go for live acceptance', 'metadata.decision'));
    if (!['hosted', 'byoc', 'on-prem-air-gapped', 'on_prem_air_gapped'].includes(String(metadata.deployment_mode ?? '').toLowerCase())) warnings.push(blocker('deployment_mode is not a recognized hosted/BYOC/on-prem value', 'metadata.deployment_mode'));
  }

  const owners = packet.owners;
  if (!isPlainObject(owners)) blockers.push(blocker('owners object is required', 'owners'));
  else {
    for (const role of REQUIRED_OWNER_ROLES) {
      if (!ownerComplete(owners[role])) blockers.push(blocker(`owner ${role} must include name organization approval_ref and complete approval_status`, `owners.${role}`));
    }
  }

  const evidence = packet.evidence;
  if (!isPlainObject(evidence)) blockers.push(blocker('evidence object is required', 'evidence'));
  else {
    for (const key of REQUIRED_EVIDENCE_ITEMS) {
      if (!evidenceRefComplete(evidence[key])) blockers.push(blocker(`evidence.${key} must include ref and complete status`, `evidence.${key}`));
    }
  }

  const readiness = packet.readiness;
  if (!isPlainObject(readiness)) blockers.push(blocker('readiness object is required', 'readiness'));
  else {
    if (readiness.schema !== 'enigma.infrastructure_readiness.v1') blockers.push(blocker('readiness.schema must be enigma.infrastructure_readiness.v1', 'readiness.schema'));
    if (readiness.ok !== true) blockers.push(blocker('readiness.ok must be true', 'readiness.ok'));
    if (readiness.readiness?.hosted_live_ready !== true) blockers.push(blocker('readiness.hosted_live_ready must be true', 'readiness.readiness.hosted_live_ready'));
    if (!Array.isArray(readiness.external_blockers) || readiness.external_blockers.length !== 0) blockers.push(blocker('readiness.external_blockers must be empty', 'readiness.external_blockers'));
  }

  const manifest = packet.manifest;
  if (!isPlainObject(manifest)) blockers.push(blocker('manifest object is required', 'manifest'));
  else {
    if (manifest.schema !== 'enigma.infrastructure_readiness_manifest.v1') blockers.push(blocker('manifest schema mismatch', 'manifest.schema'));
    if (manifest.operator_acceptance?.decision !== 'go') blockers.push(blocker('manifest operator decision must be go', 'manifest.operator_acceptance.decision'));
    if (!Array.isArray(manifest.external_blockers) || manifest.external_blockers.length !== 0) blockers.push(blocker('manifest external_blockers must be empty', 'manifest.external_blockers'));
  }

  const storage = packet.storage;
  if (!isPlainObject(storage)) blockers.push(blocker('storage object is required', 'storage'));
  else {
    if (storage.schema !== 'enigma.production_storage_migration_artifact.v1') blockers.push(blocker('storage schema must be enigma.production_storage_migration_artifact.v1', 'storage.schema'));
    if (storage.contract?.engine !== 'postgres') blockers.push(blocker('storage contract engine must be postgres', 'storage.contract.engine'));
    if (!Array.isArray(storage.contract?.tables) || storage.contract.tables.length < 8) blockers.push(blocker('storage contract tables are incomplete', 'storage.contract.tables'));
  }

  const releaseAudit = packet.release_audit;
  if (!isPlainObject(releaseAudit)) blockers.push(blocker('release_audit object is required', 'release_audit'));
  else {
    if (releaseAudit.schema !== 'enigma.release_audit.v1') blockers.push(blocker('release_audit schema mismatch', 'release_audit.schema'));
    if (releaseAudit.ok !== true) blockers.push(blocker('release_audit.ok must be true', 'release_audit.ok'));
    if (Array.isArray(releaseAudit.required_failed) && releaseAudit.required_failed.length !== 0) blockers.push(blocker('release_audit.required_failed must be empty', 'release_audit.required_failed'));
  }

  const productionManifests = packet.production_manifests;
  if (!isPlainObject(productionManifests)) blockers.push(blocker('production_manifests object is required', 'production_manifests'));
  else {
    if (productionManifests.schema !== 'enigma.production_manifest_result.v1') blockers.push(blocker('production_manifests schema mismatch', 'production_manifests.schema'));
    if (productionManifests.ok !== true) blockers.push(blocker('production_manifests.ok must be true', 'production_manifests.ok'));
    if (productionManifests.status !== 'accepted') blockers.push(blocker('production_manifests.status must be accepted', 'production_manifests.status'));
    if (!Array.isArray(productionManifests.blockers) || productionManifests.blockers.length !== 0) blockers.push(blocker('production_manifests.blockers must be empty', 'production_manifests.blockers'));
  }

  const result = {
    schema: OPERATOR_ACCEPTANCE_RESULT_SCHEMA,
    generated_at: options.generated_at ?? options.generatedAt ?? new Date(0).toISOString(),
    ok: blockers.length === 0,
    decision: blockers.length === 0 ? 'go' : 'blocked',
    blockers,
    blocker_breakdown: blockerBreakdown(blockers),
    warnings,
    checked: {
      metadata_fields: REQUIRED_PACKET_METADATA.length,
      owner_roles: REQUIRED_OWNER_ROLES.length,
      evidence_items: REQUIRED_EVIDENCE_ITEMS.length,
      readiness_required: true,
      storage_required: true,
      release_audit_required: true,
      production_manifests_required: true,
    },
    claim_boundary: [
      'Operator acceptance validation checks evidence shape and no-go blockers only; it does not create cloud resources or verify secrets.',
      'A go result requires target-environment readiness evidence with hosted_live_ready true and no external blockers.',
      'Secret values and raw memory must remain outside packets, manifests, logs, docs, and chat.',
    ],
  };
  assertNoSecretPacketData(result, 'result');
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
  const packetPath = getFlag(flags, ['packet', 'in']);
  if (!nonEmptyString(packetPath)) throw new Error('--packet <path> is required');
  const packet = JSON.parse(await readFile(resolve(packetPath), 'utf8'));
  const result = validateOperatorAcceptancePacket(packet, { generated_at: new Date().toISOString() });
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
