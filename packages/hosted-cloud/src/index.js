import { createHash } from 'node:crypto';

export const HOSTED_CLOUD_USER_ACCOUNT_SCHEMA = 'enigma.hosted_cloud.user_account.v1';
export const HOSTED_CLOUD_TENANT_SCHEMA = 'enigma.hosted_cloud.tenant.v1';
export const HOSTED_CLOUD_VAULT_SCHEMA = 'enigma.hosted_cloud.vault.v1';
export const HOSTED_CLOUD_API_KEY_SCHEMA = 'enigma.hosted_cloud.api_key.v1';
export const HOSTED_CLOUD_USAGE_BILLING_SCHEMA = 'enigma.hosted_cloud.usage_billing_record.v1';
export const HOSTED_CLOUD_DASHBOARD_SCHEMA = 'enigma.hosted_cloud.dashboard_summary.v1';
export const HOSTED_CLOUD_BACKUP_DRILL_SCHEMA = 'enigma.hosted_cloud.backup_drill.v1';
export const HOSTED_CLOUD_INCIDENT_SLA_SCHEMA = 'enigma.hosted_cloud.incident_sla_refs.v1';
export const HOSTED_CLOUD_CUSTOMER_LIFECYCLE_PACKET_SCHEMA = 'enigma.hosted_cloud.customer_lifecycle_packet.v1';
export const HOSTED_CLOUD_API_KEY_LIFECYCLE_PACKET_SCHEMA = 'enigma.hosted_cloud.api_key_lifecycle_packet.v1';

export const HOSTED_CLOUD_EXTERNAL_BLOCKERS = Object.freeze([
  'auth_provider',
  'billing_provider',
  'legal_docs',
  'data_processing_terms',
  'support_ownership',
  'external_security_review',
]);

const SHA256_PREFIX = 'sha256:';
const PROVIDED = 'provided';
const BLOCKED = 'blocked_external_dependency';
const EVIDENCE_STATUSES = new Set([PROVIDED, BLOCKED]);
const HOSTED_CLOUD_CONTRACT_READY = Object.freeze({
  contract_ready: true,
  integration_kind: 'contract_validator_only',
  no_external_provider_calls: true,
});
const BLOCKER_LABELS = Object.freeze({
  auth_provider: 'Auth provider is not wired.',
  billing_provider: 'Billing provider is not wired.',
  legal_docs: 'Hosted legal documents are not approved.',
  data_processing_terms: 'Data processing terms are not approved.',
  support_ownership: 'Support ownership is not assigned.',
  external_security_review: 'External security review is not complete.',
});

export const HOSTED_CLOUD_CUSTOMER_LIFECYCLE_PHASES = Object.freeze([
  'account',
  'tenant',
  'vault',
  'api_key',
  'billing',
  'dashboard',
  'backup',
  'incident_sla',
  'support',
  'monitoring',
  'legal',
  'security_review',
  'operator_go_live',
]);
const CUSTOMER_LIFECYCLE_CONTRACT_PHASES = Object.freeze([
  'account',
  'tenant',
  'vault',
  'api_key',
  'billing',
  'dashboard',
  'backup',
  'incident_sla',
]);
const CUSTOMER_LIFECYCLE_REQUIRED_EVIDENCE_PHASES = Object.freeze(HOSTED_CLOUD_CUSTOMER_LIFECYCLE_PHASES.filter((phase) => phase !== 'operator_go_live'));
export const HOSTED_CLOUD_API_KEY_LIFECYCLE_OPERATIONS = Object.freeze(['issue', 'rotate', 'revoke', 'audit']);
export const HOSTED_CLOUD_API_KEY_LIFECYCLE_PHASES = Object.freeze([
  'current_key_metadata',
  'next_key_metadata',
  'revoked_key_metadata',
  'issue_policy',
  'rotation_policy',
  'revocation_policy',
  'audit_log',
]);
const API_KEY_LIFECYCLE_OPERATION_PHASES = Object.freeze({
  issue: Object.freeze(['next_key_metadata', 'issue_policy', 'audit_log']),
  rotate: Object.freeze(['current_key_metadata', 'next_key_metadata', 'rotation_policy', 'audit_log']),
  revoke: Object.freeze(['current_key_metadata', 'revoked_key_metadata', 'revocation_policy', 'audit_log']),
  audit: Object.freeze(['current_key_metadata', 'audit_log']),
});
const API_KEY_LIFECYCLE_KEY_SLOTS = Object.freeze(['current', 'next', 'revoked']);
const CUSTOMER_LIFECYCLE_BLOCKER_LABELS = Object.freeze({
  account: 'Hosted account contract evidence is not provided.',
  tenant: 'Hosted tenant contract evidence is not provided.',
  vault: 'Hosted vault contract evidence is not provided.',
  api_key: 'Hosted API key metadata evidence is not provided.',
  billing: 'Hosted billing evidence is not provided.',
  dashboard: 'Hosted dashboard evidence is not provided.',
  backup: 'Hosted backup drill evidence is not provided.',
  incident_sla: 'Hosted incident/SLA evidence is not provided.',
  support: 'Hosted support ownership evidence is not provided.',
  monitoring: 'Hosted monitoring evidence is not provided.',
  legal: 'Hosted legal approval evidence is not provided.',
  security_review: 'Hosted security review evidence is not provided.',
  operator_go_live: 'Explicit operator go-live approval is not provided.',
});
const API_KEY_LIFECYCLE_BLOCKER_LABELS = Object.freeze({
  current_key_metadata: 'Current hosted API key metadata evidence is not provided.',
  next_key_metadata: 'Next hosted API key metadata evidence is not provided.',
  revoked_key_metadata: 'Revoked hosted API key metadata evidence is not provided.',
  issue_policy: 'Hosted API key issue policy evidence is not provided.',
  rotation_policy: 'Hosted API key rotation policy evidence is not provided.',
  revocation_policy: 'Hosted API key revocation policy evidence is not provided.',
  audit_log: 'Hosted API key lifecycle audit evidence is not provided.',
  operator_approval: 'Explicit public-safe operator API key lifecycle approval is not provided.',
});
const API_KEY_SECRET_MATERIAL_KEY_RE = /(?:^|_)(?:raw_?api_?key|raw_?key|plaintext_?api_?key|plain_text_?api_?key|plaintext_?key|plain_text_?key|api_?key_?value|key_?value|key_?material|secret_?key|key_?secret|value)(?:$|_)/iu;
const FORBIDDEN_KEY_RE = /(?:^|_)(?:raw_?memory|plaintext|plain_text|prompt|prompts|completion|completions|message_body|transcript|conversation|provider_?response|response_?body|credential|credentials|secret|password|private_?key|bearer|access_token|refresh_token|token_value|api_key_value|api_secret|token_?roi|token_?profit|roi_claim|profit_claim|provider_?deletion|provider_?erasure|model_?forgetting|model_?erasure)(?:$|_)/iu;
const SECRET_VALUE_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|\b(?:raw memory|plaintext prompts?|plain text prompts?|private prompts?|provider responses?|full transcript|decrypted memory|credentials?|secrets?|passwords?|private keys?|api key secret|api secrets?|access tokens?|refresh tokens?|token values?|credential material)\b)/iu;
const FORBIDDEN_CLAIM_RE = /(?:token\s+(?:roi|profit|return|investment|price)|(?:roi|profit|return)\s+(?:from|on)\s+token|guaranteed\s+(?:savings|profit|return)|provider(?:-side|\s+side)?\s+(?:deletion|erasure)|model\s+(?:forgetting|forgot|erasure)|makes?\s+models?\s+forget|deleted\s+from\s+every\s+provider)/iu;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name} must be a non-empty string`);
  return value;
}

function stringOrDefault(value, fallback) {
  return typeof value === 'string' && value.trim() !== '' ? value : fallback;
}

function optionalString(value, name) {
  if (value === undefined || value === null) return undefined;
  return requiredString(value, name);
}

function requiredBoolean(value, name) {
  if (typeof value !== 'boolean') throw new TypeError(`${name} must be a boolean`);
  return value;
}

function requiredTrue(value, name) {
  if (requiredBoolean(value, name) !== true) throw new TypeError(`${name} must be true`);
  return true;
}

function requiredFalse(value, name) {
  if (requiredBoolean(value, name) !== false) throw new TypeError(`${name} must be false`);
  return false;
}

function nonNegativeInteger(value, name) {
  if (!Number.isInteger(value) || value < 0) throw new TypeError(`${name} must be a non-negative integer`);
  return value;
}

function nonNegativeNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new TypeError(`${name} must be a non-negative number`);
  return value;
}

function isoTimestamp(value, name = 'timestamp') {
  const timestamp = requiredString(value, name);
  if (Number.isNaN(Date.parse(timestamp))) throw new TypeError(`${name} must be an ISO timestamp`);
  return timestamp;
}

function stringArray(value, name) {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  return value.map((item, index) => requiredString(item, `${name}[${index}]`));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function hashValue(value) {
  return `${SHA256_PREFIX}${createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex')}`;
}

function contractId(prefix, body) {
  return `${prefix}_${hashValue(body).slice(SHA256_PREFIX.length, SHA256_PREFIX.length + 24)}`;
}

function deepFreeze(value) {
  if (!isPlainObject(value) && !Array.isArray(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function assertNoForbiddenPayload(value, path = 'hosted_cloud') {
  if (typeof value === 'string') {
    if (SECRET_VALUE_RE.test(value)) throw new TypeError(`${path} contains raw, provider, or credential-looking data`);
    if (FORBIDDEN_CLAIM_RE.test(value)) throw new TypeError(`${path} contains a forbidden hosted-cloud claim`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenPayload(item, `${path}[${index}]`));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEY_RE.test(key)) throw new TypeError(`${path}.${key} is not allowed in hosted-cloud contracts`);
    assertNoForbiddenPayload(child, `${path}.${key}`);
  }
}

function evidenceRefFor(key, value) {
  const fallback = { ref: `blocked:${key}`, status: BLOCKED, blocker: BLOCKER_LABELS[key] };
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') return { ref: requiredString(value, `operator_evidence_refs.${key}`), status: PROVIDED };
  if (!isPlainObject(value)) throw new TypeError(`operator_evidence_refs.${key} must be a string or object`);
  const status = stringOrDefault(value.status, PROVIDED);
  if (!EVIDENCE_STATUSES.has(status)) throw new TypeError(`operator_evidence_refs.${key}.status is invalid`);
  const ref = requiredString(value.ref, `operator_evidence_refs.${key}.ref`);
  const refRecord = { ref, status };
  const owner = optionalString(value.owner, `operator_evidence_refs.${key}.owner`);
  const blocker = optionalString(value.blocker, `operator_evidence_refs.${key}.blocker`);
  if (owner) refRecord.owner = owner;
  if (status === BLOCKED) refRecord.blocker = blocker ?? BLOCKER_LABELS[key];
  return refRecord;
}

function normalizeOperatorEvidenceRefs(input = {}) {
  const refs = isPlainObject(input) ? input : {};
  return Object.fromEntries(HOSTED_CLOUD_EXTERNAL_BLOCKERS.map((key) => [key, evidenceRefFor(key, refs[key])]));
}

function validateOperatorEvidenceRefs(contract) {
  if (!isPlainObject(contract.operator_evidence_refs)) throw new TypeError('operator_evidence_refs must be present');
  for (const key of HOSTED_CLOUD_EXTERNAL_BLOCKERS) {
    const ref = contract.operator_evidence_refs[key];
    if (!isPlainObject(ref)) throw new TypeError(`operator_evidence_refs.${key} must be present`);
    requiredString(ref.ref, `operator_evidence_refs.${key}.ref`);
    if (!EVIDENCE_STATUSES.has(ref.status)) throw new TypeError(`operator_evidence_refs.${key}.status is invalid`);
    if (ref.status === BLOCKED) requiredString(ref.blocker, `operator_evidence_refs.${key}.blocker`);
  }
}

function externalBlockers(operatorEvidenceRefs) {
  return HOSTED_CLOUD_EXTERNAL_BLOCKERS
    .filter((key) => operatorEvidenceRefs[key].status !== PROVIDED)
    .map((key) => ({ key, ref: operatorEvidenceRefs[key].ref, blocker: operatorEvidenceRefs[key].blocker }));
}

function readinessFrom(operatorEvidenceRefs) {
  const blockers = externalBlockers(operatorEvidenceRefs);
  return {
    ...HOSTED_CLOUD_CONTRACT_READY,
    external_wiring_ready: blockers.length === 0,
    hosted_cloud_sellable: false,
    selling_gate: blockers.length === 0 ? 'requires_operator_go_live_approval' : 'blocked_until_external_wiring_and_approvals',
    external_blockers: blockers,
  };
}

function withContractIdentity(body, prefix, idKey) {
  const id = body[idKey] ?? contractId(prefix, body);
  return deepFreeze({ ...body, [idKey]: id, contract_hash: hashValue({ ...body, [idKey]: id }) });
}

function validateBase(contract, schema) {
  if (!isPlainObject(contract)) throw new TypeError('contract must be an object');
  assertNoForbiddenPayload(contract, 'contract');
  if (contract.schema !== schema) throw new TypeError(`schema must be ${schema}`);
  validateOperatorEvidenceRefs(contract);
  if (!isPlainObject(contract.readiness)) throw new TypeError('readiness must be present');
  if (contract.readiness.contract_ready !== true) throw new TypeError('readiness.contract_ready must be true');
  if (contract.readiness.no_external_provider_calls !== true) throw new TypeError('readiness.no_external_provider_calls must be true');
  if (contract.readiness.hosted_cloud_sellable !== false) throw new TypeError('readiness.hosted_cloud_sellable must remain false in contract artifacts');
  const expectedBlockers = externalBlockers(contract.operator_evidence_refs);
  if (contract.readiness.external_wiring_ready !== (expectedBlockers.length === 0)) {
    throw new TypeError('readiness.external_wiring_ready must match operator_evidence_refs');
  }
  if (contract.readiness.selling_gate !== (expectedBlockers.length === 0 ? 'requires_operator_go_live_approval' : 'blocked_until_external_wiring_and_approvals')) {
    throw new TypeError('readiness.selling_gate must match operator_evidence_refs');
  }
  if (!Array.isArray(contract.readiness.external_blockers)) throw new TypeError('readiness.external_blockers must be an array');
  if (contract.readiness.external_blockers.length !== expectedBlockers.length) {
    throw new TypeError('readiness.external_blockers must match operator_evidence_refs');
  }
  expectedBlockers.forEach((blocker, index) => {
    if (contract.readiness.external_blockers[index]?.key !== blocker.key || contract.readiness.external_blockers[index]?.ref !== blocker.ref) {
      throw new TypeError('readiness.external_blockers must match operator_evidence_refs');
    }
  });
  requiredString(contract.contract_hash, 'contract_hash');
  return true;
}

function baseFields(input, generatedAtName = 'generated_at') {
  const operatorEvidenceRefs = normalizeOperatorEvidenceRefs(input.operator_evidence_refs ?? input.operatorEvidenceRefs);
  return {
    operator_evidence_refs: operatorEvidenceRefs,
    readiness: readinessFrom(operatorEvidenceRefs),
    [generatedAtName]: isoTimestamp(input[generatedAtName] ?? input.generatedAt, generatedAtName),
  };
}

export function buildUserAccountContract(input = {}) {
  if (!isPlainObject(input)) throw new TypeError('buildUserAccountContract requires an options object');
  assertNoForbiddenPayload(input, 'input');
  const body = {
    schema: HOSTED_CLOUD_USER_ACCOUNT_SCHEMA,
    account_id: stringOrDefault(input.account_id ?? input.accountId, undefined),
    tenant_id: requiredString(input.tenant_id ?? input.tenantId, 'tenant_id'),
    subject_ref: requiredString(input.subject_ref ?? input.subjectRef, 'subject_ref'),
    auth_provider_user_ref: requiredString(input.auth_provider_user_ref ?? input.authProviderUserRef, 'auth_provider_user_ref'),
    account_state: stringOrDefault(input.account_state ?? input.accountState, 'pending_external_auth'),
    roles: stringArray(input.roles ?? ['member'], 'roles'),
    controls: {
      stores_personal_profile: false,
      stores_provider_payloads: false,
      stores_auth_material: false,
    },
    ...baseFields(input),
  };
  const contract = withContractIdentity(body, 'hcuacct', 'account_id');
  validateUserAccountContract(contract);
  return contract;
}

export function validateUserAccountContract(contract) {
  validateBase(contract, HOSTED_CLOUD_USER_ACCOUNT_SCHEMA);
  requiredString(contract.account_id, 'account_id');
  requiredString(contract.tenant_id, 'tenant_id');
  requiredString(contract.subject_ref, 'subject_ref');
  requiredString(contract.auth_provider_user_ref, 'auth_provider_user_ref');
  stringArray(contract.roles, 'roles');
  requiredFalse(contract.controls.stores_personal_profile, 'controls.stores_personal_profile');
  requiredFalse(contract.controls.stores_provider_payloads, 'controls.stores_provider_payloads');
  requiredFalse(contract.controls.stores_auth_material, 'controls.stores_auth_material');
  return true;
}

export function buildTenantContract(input = {}) {
  if (!isPlainObject(input)) throw new TypeError('buildTenantContract requires an options object');
  assertNoForbiddenPayload(input, 'input');
  const body = {
    schema: HOSTED_CLOUD_TENANT_SCHEMA,
    tenant_id: requiredString(input.tenant_id ?? input.tenantId, 'tenant_id'),
    tenant_ref: requiredString(input.tenant_ref ?? input.tenantRef, 'tenant_ref'),
    plan_code: stringOrDefault(input.plan_code ?? input.planCode, 'contract_only'),
    lifecycle_state: stringOrDefault(input.lifecycle_state ?? input.lifecycleState, 'blocked_external_wiring'),
    region: stringOrDefault(input.region, 'operator_selected'),
    policy_ref: requiredString(input.policy_ref ?? input.policyRef, 'policy_ref'),
    retention_policy_ref: requiredString(input.retention_policy_ref ?? input.retentionPolicyRef, 'retention_policy_ref'),
    data_residency_ref: requiredString(input.data_residency_ref ?? input.dataResidencyRef, 'data_residency_ref'),
    ...baseFields(input),
  };
  const contract = withContractIdentity(body, 'hctenant', 'tenant_id');
  validateTenantContract(contract);
  return contract;
}

export function validateTenantContract(contract) {
  validateBase(contract, HOSTED_CLOUD_TENANT_SCHEMA);
  requiredString(contract.tenant_id, 'tenant_id');
  requiredString(contract.tenant_ref, 'tenant_ref');
  requiredString(contract.policy_ref, 'policy_ref');
  requiredString(contract.retention_policy_ref, 'retention_policy_ref');
  requiredString(contract.data_residency_ref, 'data_residency_ref');
  return true;
}

export function buildHostedVaultContract(input = {}) {
  if (!isPlainObject(input)) throw new TypeError('buildHostedVaultContract requires an options object');
  assertNoForbiddenPayload(input, 'input');
  const body = {
    schema: HOSTED_CLOUD_VAULT_SCHEMA,
    vault_id: stringOrDefault(input.vault_id ?? input.vaultId, undefined),
    tenant_id: requiredString(input.tenant_id ?? input.tenantId, 'tenant_id'),
    vault_ref: requiredString(input.vault_ref ?? input.vaultRef, 'vault_ref'),
    storage_ref: requiredString(input.storage_ref ?? input.storageRef, 'storage_ref'),
    kms_key_ref: requiredString(input.kms_key_ref ?? input.kmsKeyRef, 'kms_key_ref'),
    backup_policy_ref: requiredString(input.backup_policy_ref ?? input.backupPolicyRef, 'backup_policy_ref'),
    retention_policy_ref: requiredString(input.retention_policy_ref ?? input.retentionPolicyRef, 'retention_policy_ref'),
    custody_boundary: {
      opaque_records_only: true,
      content_minimized: true,
      provider_payloads_allowed: false,
    },
    ...baseFields(input),
  };
  const contract = withContractIdentity(body, 'hcvault', 'vault_id');
  validateHostedVaultContract(contract);
  return contract;
}

export function validateHostedVaultContract(contract) {
  validateBase(contract, HOSTED_CLOUD_VAULT_SCHEMA);
  requiredString(contract.vault_id, 'vault_id');
  requiredString(contract.tenant_id, 'tenant_id');
  requiredString(contract.vault_ref, 'vault_ref');
  requiredString(contract.storage_ref, 'storage_ref');
  requiredString(contract.kms_key_ref, 'kms_key_ref');
  requiredString(contract.backup_policy_ref, 'backup_policy_ref');
  requiredString(contract.retention_policy_ref, 'retention_policy_ref');
  requiredTrue(contract.custody_boundary.opaque_records_only, 'custody_boundary.opaque_records_only');
  requiredTrue(contract.custody_boundary.content_minimized, 'custody_boundary.content_minimized');
  requiredFalse(contract.custody_boundary.provider_payloads_allowed, 'custody_boundary.provider_payloads_allowed');
  return true;
}

export function buildApiKeyContract(input = {}) {
  if (!isPlainObject(input)) throw new TypeError('buildApiKeyContract requires an options object');
  assertNoForbiddenPayload(input, 'input');
  const body = {
    schema: HOSTED_CLOUD_API_KEY_SCHEMA,
    api_key_id: stringOrDefault(input.api_key_id ?? input.apiKeyId, undefined),
    tenant_id: requiredString(input.tenant_id ?? input.tenantId, 'tenant_id'),
    subject_ref: requiredString(input.subject_ref ?? input.subjectRef, 'subject_ref'),
    key_fingerprint: requiredString(input.key_fingerprint ?? input.keyFingerprint, 'key_fingerprint'),
    scopes: stringArray(input.scopes ?? [], 'scopes'),
    issued_at: isoTimestamp(input.issued_at ?? input.issuedAt, 'issued_at'),
    expires_at: optionalString(input.expires_at ?? input.expiresAt, 'expires_at'),
    rotation_ref: requiredString(input.rotation_ref ?? input.rotationRef, 'rotation_ref'),
    key_material_boundary: {
      key_material_in_contract: false,
      fingerprint_only: true,
    },
    ...baseFields(input),
  };
  if (body.expires_at) isoTimestamp(body.expires_at, 'expires_at');
  const contract = withContractIdentity(body, 'hcak', 'api_key_id');
  validateApiKeyContract(contract);
  return contract;
}

export function validateApiKeyContract(contract) {
  validateBase(contract, HOSTED_CLOUD_API_KEY_SCHEMA);
  requiredString(contract.api_key_id, 'api_key_id');
  requiredString(contract.tenant_id, 'tenant_id');
  requiredString(contract.subject_ref, 'subject_ref');
  requiredString(contract.key_fingerprint, 'key_fingerprint');
  stringArray(contract.scopes, 'scopes');
  isoTimestamp(contract.issued_at, 'issued_at');
  if (contract.expires_at !== undefined) isoTimestamp(contract.expires_at, 'expires_at');
  requiredString(contract.rotation_ref, 'rotation_ref');
  requiredFalse(contract.key_material_boundary.key_material_in_contract, 'key_material_boundary.key_material_in_contract');
  requiredTrue(contract.key_material_boundary.fingerprint_only, 'key_material_boundary.fingerprint_only');
  return true;
}

export function buildUsageBillingRecord(input = {}) {
  if (!isPlainObject(input)) throw new TypeError('buildUsageBillingRecord requires an options object');
  assertNoForbiddenPayload(input, 'input');
  const body = {
    schema: HOSTED_CLOUD_USAGE_BILLING_SCHEMA,
    billing_record_id: stringOrDefault(input.billing_record_id ?? input.billingRecordId, undefined),
    tenant_id: requiredString(input.tenant_id ?? input.tenantId, 'tenant_id'),
    period_start: isoTimestamp(input.period_start ?? input.periodStart, 'period_start'),
    period_end: isoTimestamp(input.period_end ?? input.periodEnd, 'period_end'),
    billing_provider_customer_ref: requiredString(input.billing_provider_customer_ref ?? input.billingProviderCustomerRef, 'billing_provider_customer_ref'),
    usage_aggregate_ref: requiredString(input.usage_aggregate_ref ?? input.usageAggregateRef, 'usage_aggregate_ref'),
    metered_event_count: nonNegativeInteger(input.metered_event_count ?? input.meteredEventCount, 'metered_event_count'),
    billable_units: nonNegativeNumber(input.billable_units ?? input.billableUnits, 'billable_units'),
    currency: stringOrDefault(input.currency, 'USD'),
    amount_due_minor_units: nonNegativeInteger(input.amount_due_minor_units ?? input.amountDueMinorUnits, 'amount_due_minor_units'),
    invoicing_state: stringOrDefault(input.invoicing_state ?? input.invoicingState, 'blocked_external_billing'),
    billing_boundary: {
      estimates_only_until_provider_wired: true,
      external_invoice_required: true,
      financial_outcome_claim: false,
    },
    ...baseFields(input),
  };
  const contract = withContractIdentity(body, 'hcbill', 'billing_record_id');
  validateUsageBillingRecord(contract);
  return contract;
}

export function validateUsageBillingRecord(contract) {
  validateBase(contract, HOSTED_CLOUD_USAGE_BILLING_SCHEMA);
  requiredString(contract.billing_record_id, 'billing_record_id');
  requiredString(contract.tenant_id, 'tenant_id');
  isoTimestamp(contract.period_start, 'period_start');
  isoTimestamp(contract.period_end, 'period_end');
  requiredString(contract.billing_provider_customer_ref, 'billing_provider_customer_ref');
  requiredString(contract.usage_aggregate_ref, 'usage_aggregate_ref');
  nonNegativeInteger(contract.metered_event_count, 'metered_event_count');
  nonNegativeNumber(contract.billable_units, 'billable_units');
  nonNegativeInteger(contract.amount_due_minor_units, 'amount_due_minor_units');
  requiredTrue(contract.billing_boundary.estimates_only_until_provider_wired, 'billing_boundary.estimates_only_until_provider_wired');
  requiredTrue(contract.billing_boundary.external_invoice_required, 'billing_boundary.external_invoice_required');
  requiredFalse(contract.billing_boundary.financial_outcome_claim, 'billing_boundary.financial_outcome_claim');
  return true;
}

export function buildDashboardSummary(input = {}) {
  if (!isPlainObject(input)) throw new TypeError('buildDashboardSummary requires an options object');
  assertNoForbiddenPayload(input, 'input');
  const operatorEvidenceRefs = normalizeOperatorEvidenceRefs(input.operator_evidence_refs ?? input.operatorEvidenceRefs);
  const readiness = readinessFrom(operatorEvidenceRefs);
  const body = {
    schema: HOSTED_CLOUD_DASHBOARD_SCHEMA,
    dashboard_id: stringOrDefault(input.dashboard_id ?? input.dashboardId, undefined),
    tenant_id: requiredString(input.tenant_id ?? input.tenantId, 'tenant_id'),
    generated_at: isoTimestamp(input.generated_at ?? input.generatedAt, 'generated_at'),
    account_count: nonNegativeInteger(input.account_count ?? input.accountCount, 'account_count'),
    active_api_key_count: nonNegativeInteger(input.active_api_key_count ?? input.activeApiKeyCount, 'active_api_key_count'),
    hosted_vault_count: nonNegativeInteger(input.hosted_vault_count ?? input.hostedVaultCount, 'hosted_vault_count'),
    billing_period_ref: requiredString(input.billing_period_ref ?? input.billingPeriodRef, 'billing_period_ref'),
    open_incident_count: nonNegativeInteger(input.open_incident_count ?? input.openIncidentCount, 'open_incident_count'),
    backup_drill_ref: requiredString(input.backup_drill_ref ?? input.backupDrillRef, 'backup_drill_ref'),
    incident_sla_ref: requiredString(input.incident_sla_ref ?? input.incidentSlaRef, 'incident_sla_ref'),
    operator_evidence_refs: operatorEvidenceRefs,
    readiness,
  };
  const contract = withContractIdentity(body, 'hcdash', 'dashboard_id');
  validateDashboardSummary(contract);
  return contract;
}

export function validateDashboardSummary(contract) {
  validateBase(contract, HOSTED_CLOUD_DASHBOARD_SCHEMA);
  requiredString(contract.dashboard_id, 'dashboard_id');
  requiredString(contract.tenant_id, 'tenant_id');
  isoTimestamp(contract.generated_at, 'generated_at');
  nonNegativeInteger(contract.account_count, 'account_count');
  nonNegativeInteger(contract.active_api_key_count, 'active_api_key_count');
  nonNegativeInteger(contract.hosted_vault_count, 'hosted_vault_count');
  requiredString(contract.billing_period_ref, 'billing_period_ref');
  nonNegativeInteger(contract.open_incident_count, 'open_incident_count');
  requiredString(contract.backup_drill_ref, 'backup_drill_ref');
  requiredString(contract.incident_sla_ref, 'incident_sla_ref');
  return true;
}

export function buildBackupDrillContract(input = {}) {
  if (!isPlainObject(input)) throw new TypeError('buildBackupDrillContract requires an options object');
  assertNoForbiddenPayload(input, 'input');
  const body = {
    schema: HOSTED_CLOUD_BACKUP_DRILL_SCHEMA,
    backup_drill_id: stringOrDefault(input.backup_drill_id ?? input.backupDrillId, undefined),
    tenant_id: requiredString(input.tenant_id ?? input.tenantId, 'tenant_id'),
    vault_ref: requiredString(input.vault_ref ?? input.vaultRef, 'vault_ref'),
    performed_at: isoTimestamp(input.performed_at ?? input.performedAt, 'performed_at'),
    backup_snapshot_ref: requiredString(input.backup_snapshot_ref ?? input.backupSnapshotRef, 'backup_snapshot_ref'),
    restore_evidence_ref: requiredString(input.restore_evidence_ref ?? input.restoreEvidenceRef, 'restore_evidence_ref'),
    rpo_minutes: nonNegativeInteger(input.rpo_minutes ?? input.rpoMinutes, 'rpo_minutes'),
    rto_minutes: nonNegativeInteger(input.rto_minutes ?? input.rtoMinutes, 'rto_minutes'),
    drill_state: stringOrDefault(input.drill_state ?? input.drillState, 'blocked_until_operator_run'),
    recovery_boundary: {
      restore_operator_verified: input.restore_operator_verified === true || input.restoreOperatorVerified === true,
      external_backup_system_required: true,
    },
    ...baseFields(input),
  };
  const contract = withContractIdentity(body, 'hcbackup', 'backup_drill_id');
  validateBackupDrillContract(contract);
  return contract;
}

export function validateBackupDrillContract(contract) {
  validateBase(contract, HOSTED_CLOUD_BACKUP_DRILL_SCHEMA);
  requiredString(contract.backup_drill_id, 'backup_drill_id');
  requiredString(contract.tenant_id, 'tenant_id');
  requiredString(contract.vault_ref, 'vault_ref');
  isoTimestamp(contract.performed_at, 'performed_at');
  requiredString(contract.backup_snapshot_ref, 'backup_snapshot_ref');
  requiredString(contract.restore_evidence_ref, 'restore_evidence_ref');
  nonNegativeInteger(contract.rpo_minutes, 'rpo_minutes');
  nonNegativeInteger(contract.rto_minutes, 'rto_minutes');
  requiredBoolean(contract.recovery_boundary.restore_operator_verified, 'recovery_boundary.restore_operator_verified');
  requiredTrue(contract.recovery_boundary.external_backup_system_required, 'recovery_boundary.external_backup_system_required');
  return true;
}

export function buildIncidentSlaRefs(input = {}) {
  if (!isPlainObject(input)) throw new TypeError('buildIncidentSlaRefs requires an options object');
  assertNoForbiddenPayload(input, 'input');
  const body = {
    schema: HOSTED_CLOUD_INCIDENT_SLA_SCHEMA,
    incident_sla_id: stringOrDefault(input.incident_sla_id ?? input.incidentSlaId, undefined),
    tenant_id: requiredString(input.tenant_id ?? input.tenantId, 'tenant_id'),
    incident_response_ref: requiredString(input.incident_response_ref ?? input.incidentResponseRef, 'incident_response_ref'),
    sla_policy_ref: requiredString(input.sla_policy_ref ?? input.slaPolicyRef, 'sla_policy_ref'),
    support_owner_ref: requiredString(input.support_owner_ref ?? input.supportOwnerRef, 'support_owner_ref'),
    escalation_policy_ref: requiredString(input.escalation_policy_ref ?? input.escalationPolicyRef, 'escalation_policy_ref'),
    status_page_ref: requiredString(input.status_page_ref ?? input.statusPageRef, 'status_page_ref'),
    generated_at: isoTimestamp(input.generated_at ?? input.generatedAt, 'generated_at'),
    incident_boundary: {
      customer_commitment_requires_approved_sla: true,
      support_owner_required: true,
      external_review_required: true,
    },
    operator_evidence_refs: normalizeOperatorEvidenceRefs(input.operator_evidence_refs ?? input.operatorEvidenceRefs),
  };
  body.readiness = readinessFrom(body.operator_evidence_refs);
  const contract = withContractIdentity(body, 'hcsla', 'incident_sla_id');
  validateIncidentSlaRefs(contract);
  return contract;
}

export function validateIncidentSlaRefs(contract) {
  validateBase(contract, HOSTED_CLOUD_INCIDENT_SLA_SCHEMA);
  requiredString(contract.incident_sla_id, 'incident_sla_id');
  requiredString(contract.tenant_id, 'tenant_id');
  requiredString(contract.incident_response_ref, 'incident_response_ref');
  requiredString(contract.sla_policy_ref, 'sla_policy_ref');
  requiredString(contract.support_owner_ref, 'support_owner_ref');
  requiredString(contract.escalation_policy_ref, 'escalation_policy_ref');
  requiredString(contract.status_page_ref, 'status_page_ref');
  isoTimestamp(contract.generated_at, 'generated_at');
  requiredTrue(contract.incident_boundary.customer_commitment_requires_approved_sla, 'incident_boundary.customer_commitment_requires_approved_sla');
  requiredTrue(contract.incident_boundary.support_owner_required, 'incident_boundary.support_owner_required');
  requiredTrue(contract.incident_boundary.external_review_required, 'incident_boundary.external_review_required');
  return true;
}

function lifecycleContractIdKey(phase) {
  switch (phase) {
    case 'account': return 'account_id';
    case 'tenant': return 'tenant_id';
    case 'vault': return 'vault_id';
    case 'api_key': return 'api_key_id';
    case 'billing': return 'billing_record_id';
    case 'dashboard': return 'dashboard_id';
    case 'backup': return 'backup_drill_id';
    case 'incident_sla': return 'incident_sla_id';
    default: throw new TypeError(`unknown lifecycle phase: ${phase}`);
  }
}

function lifecycleContractSource(input, aliases) {
  if (isPlainObject(input.contracts)) {
    for (const alias of aliases) {
      if (input.contracts[alias] !== undefined) return input.contracts[alias];
    }
  }
  for (const alias of aliases) {
    if (input[alias] !== undefined) return input[alias];
  }
  return undefined;
}

function buildOrValidateLifecycleContract(phase, source) {
  if (source === undefined || source === null) return null;
  if (!isPlainObject(source)) throw new TypeError(`contracts.${phase} must be an object`);
  switch (phase) {
    case 'account':
      if (source.schema === HOSTED_CLOUD_USER_ACCOUNT_SCHEMA) {
        validateUserAccountContract(source);
        return source;
      }
      return buildUserAccountContract(source);
    case 'tenant':
      if (source.schema === HOSTED_CLOUD_TENANT_SCHEMA) {
        validateTenantContract(source);
        return source;
      }
      return buildTenantContract(source);
    case 'vault':
      if (source.schema === HOSTED_CLOUD_VAULT_SCHEMA) {
        validateHostedVaultContract(source);
        return source;
      }
      return buildHostedVaultContract(source);
    case 'api_key':
      if (source.schema === HOSTED_CLOUD_API_KEY_SCHEMA) {
        validateApiKeyContract(source);
        return source;
      }
      return buildApiKeyContract(source);
    case 'billing':
      if (source.schema === HOSTED_CLOUD_USAGE_BILLING_SCHEMA) {
        validateUsageBillingRecord(source);
        return source;
      }
      return buildUsageBillingRecord(source);
    case 'dashboard':
      if (source.schema === HOSTED_CLOUD_DASHBOARD_SCHEMA) {
        validateDashboardSummary(source);
        return source;
      }
      return buildDashboardSummary(source);
    case 'backup':
      if (source.schema === HOSTED_CLOUD_BACKUP_DRILL_SCHEMA) {
        validateBackupDrillContract(source);
        return source;
      }
      return buildBackupDrillContract(source);
    case 'incident_sla':
      if (source.schema === HOSTED_CLOUD_INCIDENT_SLA_SCHEMA) {
        validateIncidentSlaRefs(source);
        return source;
      }
      return buildIncidentSlaRefs(source);
    default:
      throw new TypeError(`unknown lifecycle phase: ${phase}`);
  }
}

function lifecycleContractsFrom(input) {
  return {
    account: buildOrValidateLifecycleContract('account', lifecycleContractSource(input, ['account', 'user_account', 'userAccount', 'account_contract', 'accountContract', 'user_account_contract', 'userAccountContract'])),
    tenant: buildOrValidateLifecycleContract('tenant', lifecycleContractSource(input, ['tenant', 'tenant_contract', 'tenantContract'])),
    vault: buildOrValidateLifecycleContract('vault', lifecycleContractSource(input, ['vault', 'hosted_vault', 'hostedVault', 'vault_contract', 'vaultContract', 'hosted_vault_contract', 'hostedVaultContract'])),
    api_key: buildOrValidateLifecycleContract('api_key', lifecycleContractSource(input, ['api_key', 'apiKey', 'api_key_contract', 'apiKeyContract'])),
    billing: buildOrValidateLifecycleContract('billing', lifecycleContractSource(input, ['billing', 'usage_billing_record', 'usageBillingRecord', 'billing_record', 'billingRecord', 'billing_contract', 'billingContract'])),
    dashboard: buildOrValidateLifecycleContract('dashboard', lifecycleContractSource(input, ['dashboard', 'dashboard_summary', 'dashboardSummary', 'dashboard_contract', 'dashboardContract'])),
    backup: buildOrValidateLifecycleContract('backup', lifecycleContractSource(input, ['backup', 'backup_drill', 'backupDrill', 'backup_contract', 'backupContract', 'backup_drill_contract', 'backupDrillContract'])),
    incident_sla: buildOrValidateLifecycleContract('incident_sla', lifecycleContractSource(input, ['incident_sla', 'incidentSla', 'incident_sla_refs', 'incidentSlaRefs', 'incident_sla_contract', 'incidentSlaContract'])),
  };
}

function explicitLifecycleEvidenceRefs(input) {
  const refs = input.required_evidence_refs ?? input.requiredEvidenceRefs ?? input.lifecycle_evidence_refs ?? input.lifecycleEvidenceRefs ?? input.evidence_refs ?? input.evidenceRefs ?? input.operator_evidence_refs ?? input.operatorEvidenceRefs;
  if (refs === undefined || refs === null) return {};
  if (!isPlainObject(refs)) throw new TypeError('required_evidence_refs must be an object');
  return refs;
}

function requirePublicSafeLifecycleRef(value, name) {
  const ref = requiredString(value, name);
  assertNoForbiddenPayload(ref, name);
  if (ref.startsWith('blocked:')) throw new TypeError(`${name} must be a public-safe evidence ref, not a blocker ref`);
  return ref;
}

function lifecycleEvidenceRefFor(key, value) {
  const fallback = { ref: `blocked:${key}`, status: BLOCKED, blocker: CUSTOMER_LIFECYCLE_BLOCKER_LABELS[key] };
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') return { ref: requirePublicSafeLifecycleRef(value, `required_evidence_refs.${key}`), status: PROVIDED };
  if (!isPlainObject(value)) throw new TypeError(`required_evidence_refs.${key} must be a string or object`);
  const status = stringOrDefault(value.status, PROVIDED);
  if (!EVIDENCE_STATUSES.has(status)) throw new TypeError(`required_evidence_refs.${key}.status is invalid`);
  const ref = status === PROVIDED
    ? requirePublicSafeLifecycleRef(value.ref, `required_evidence_refs.${key}.ref`)
    : requiredString(value.ref, `required_evidence_refs.${key}.ref`);
  assertNoForbiddenPayload(ref, `required_evidence_refs.${key}.ref`);
  const evidence = { ref, status };
  const owner = optionalString(value.owner, `required_evidence_refs.${key}.owner`);
  const blocker = optionalString(value.blocker, `required_evidence_refs.${key}.blocker`);
  if (owner) evidence.owner = owner;
  if (status === BLOCKED) evidence.blocker = blocker ?? CUSTOMER_LIFECYCLE_BLOCKER_LABELS[key];
  return evidence;
}

function contractEvidenceRef(phase, contract) {
  if (!contract) return lifecycleEvidenceRefFor(phase, undefined);
  const idKey = lifecycleContractIdKey(phase);
  return {
    ref: requiredString(contract.contract_hash, `contracts.${phase}.contract_hash`),
    status: PROVIDED,
    contract_schema: requiredString(contract.schema, `contracts.${phase}.schema`),
    contract_id: requiredString(contract[idKey], `contracts.${phase}.${idKey}`),
  };
}

function lifecycleEvidenceRefsFrom(input, contracts) {
  const explicitRefs = explicitLifecycleEvidenceRefs(input);
  const evidenceRefs = {};
  for (const phase of CUSTOMER_LIFECYCLE_REQUIRED_EVIDENCE_PHASES) {
    evidenceRefs[phase] = explicitRefs[phase] === undefined && CUSTOMER_LIFECYCLE_CONTRACT_PHASES.includes(phase)
      ? contractEvidenceRef(phase, contracts[phase])
      : lifecycleEvidenceRefFor(phase, explicitRefs[phase]);
  }
  return evidenceRefs;
}

function operatorGoLiveRefFromInput(input) {
  const value = input.operator_go_live_ref ?? input.operatorGoLiveRef;
  if (value === undefined || value === null) return null;
  return requirePublicSafeLifecycleRef(value, 'operator_go_live_ref');
}

function operatorGoLiveRefFromPacket(packet) {
  if (!Object.prototype.hasOwnProperty.call(packet, 'operator_go_live_ref')) throw new TypeError('operator_go_live_ref must be present');
  if (packet.operator_go_live_ref === null) return null;
  return requirePublicSafeLifecycleRef(packet.operator_go_live_ref, 'operator_go_live_ref');
}

function missingLifecycleEvidenceRefs(requiredEvidenceRefs) {
  return CUSTOMER_LIFECYCLE_REQUIRED_EVIDENCE_PHASES
    .filter((phase) => requiredEvidenceRefs[phase].status !== PROVIDED)
    .map((phase) => ({
      key: phase,
      ref: requiredEvidenceRefs[phase].ref,
      blocker: requiredEvidenceRefs[phase].blocker ?? CUSTOMER_LIFECYCLE_BLOCKER_LABELS[phase],
    }));
}

function lifecycleContractExternalBlockers(contracts) {
  if (!isPlainObject(contracts)) return [];
  const blockers = [];
  for (const phase of CUSTOMER_LIFECYCLE_CONTRACT_PHASES) {
    const contract = contracts[phase];
    if (!isPlainObject(contract) || !Array.isArray(contract.readiness?.external_blockers)) continue;
    for (const blocker of contract.readiness.external_blockers) {
      blockers.push({
        key: `${phase}.${requiredString(blocker.key, `contracts.${phase}.readiness.external_blockers.key`)}`,
        ref: requiredString(blocker.ref, `contracts.${phase}.readiness.external_blockers.ref`),
        blocker: stringOrDefault(blocker.blocker, CUSTOMER_LIFECYCLE_BLOCKER_LABELS[phase]),
      });
    }
  }
  return blockers;
}

function customerLifecycleExternalBlockers(requiredEvidenceRefs, operatorGoLiveRef, contracts = null) {
  const blockers = missingLifecycleEvidenceRefs(requiredEvidenceRefs).concat(lifecycleContractExternalBlockers(contracts));
  if (operatorGoLiveRef === null) {
    blockers.push({
      key: 'operator_go_live',
      ref: 'blocked:operator_go_live',
      blocker: CUSTOMER_LIFECYCLE_BLOCKER_LABELS.operator_go_live,
    });
  }
  return blockers;
}

function missingLifecycleSurfaceRefs(contracts) {
  return CUSTOMER_LIFECYCLE_CONTRACT_PHASES
    .filter((phase) => contracts[phase] === null)
    .map((phase) => ({
      key: phase,
      ref: `blocked:${phase}`,
      blocker: CUSTOMER_LIFECYCLE_BLOCKER_LABELS[phase],
    }));
}

function customerLifecycleReadiness(requiredEvidenceRefs, operatorGoLiveRef, contracts = null) {
  const missingEvidenceRefs = missingLifecycleEvidenceRefs(requiredEvidenceRefs);
  const contractBlockers = lifecycleContractExternalBlockers(contracts);
  const externalLifecycleBlockers = customerLifecycleExternalBlockers(requiredEvidenceRefs, operatorGoLiveRef, contracts);
  const sellable = missingEvidenceRefs.length === 0 && contractBlockers.length === 0 && operatorGoLiveRef !== null;
  return {
    ...HOSTED_CLOUD_CONTRACT_READY,
    status: sellable ? 'operator_approved_evidence_packet' : 'blocked_lifecycle_evidence_or_operator_go_live',
    evidence_validation_only: true,
    lifecycle_evidence_complete: missingEvidenceRefs.length === 0,
    operator_go_live_approved: operatorGoLiveRef !== null,
    external_wiring_ready: externalLifecycleBlockers.length === 0,
    hosted_cloud_sellable: sellable,
    selling_gate: sellable ? 'evidence_complete_operator_go_live_approved' : 'blocked_until_lifecycle_evidence_and_operator_go_live',
    external_blockers: externalLifecycleBlockers,
    missing_evidence_refs: missingEvidenceRefs,
  };
}

function lifecyclePhaseRows(requiredEvidenceRefs, contracts, operatorGoLiveRef) {
  return HOSTED_CLOUD_CUSTOMER_LIFECYCLE_PHASES.map((phase) => {
    if (phase === 'operator_go_live') {
      return {
        phase,
        evidence_ref: operatorGoLiveRef ?? 'blocked:operator_go_live',
        evidence_status: operatorGoLiveRef === null ? BLOCKED : PROVIDED,
        ready: operatorGoLiveRef !== null,
        blocker: operatorGoLiveRef === null ? CUSTOMER_LIFECYCLE_BLOCKER_LABELS.operator_go_live : undefined,
      };
    }
    const evidence = requiredEvidenceRefs[phase];
    const row = {
      phase,
      evidence_ref: evidence.ref,
      evidence_status: evidence.status,
      ready: evidence.status === PROVIDED,
    };
    if (evidence.status === BLOCKED) row.blocker = evidence.blocker ?? CUSTOMER_LIFECYCLE_BLOCKER_LABELS[phase];
    if (CUSTOMER_LIFECYCLE_CONTRACT_PHASES.includes(phase) && contracts[phase]) {
      row.contract_schema = contracts[phase].schema;
      row.contract_id = contracts[phase][lifecycleContractIdKey(phase)];
      row.contract_hash = contracts[phase].contract_hash;
    }
    return row;
  });
}

function customerLifecycleSafetyGuarantees() {
  return {
    opaque_reference_only: true,
    customer_content_absent: true,
    sensitive_text_absent: true,
    auth_material_absent: true,
    provider_payloads_absent: true,
    financial_outcome_claim_absent: true,
    remote_erasure_claim_absent: true,
  };
}

function validateCustomerLifecycleSafetyGuarantees(guarantees) {
  if (!isPlainObject(guarantees)) throw new TypeError('public_safety_guarantees must be present');
  requiredTrue(guarantees.opaque_reference_only, 'public_safety_guarantees.opaque_reference_only');
  requiredTrue(guarantees.customer_content_absent, 'public_safety_guarantees.customer_content_absent');
  requiredTrue(guarantees.sensitive_text_absent, 'public_safety_guarantees.sensitive_text_absent');
  requiredTrue(guarantees.auth_material_absent, 'public_safety_guarantees.auth_material_absent');
  requiredTrue(guarantees.provider_payloads_absent, 'public_safety_guarantees.provider_payloads_absent');
  requiredTrue(guarantees.financial_outcome_claim_absent, 'public_safety_guarantees.financial_outcome_claim_absent');
  requiredTrue(guarantees.remote_erasure_claim_absent, 'public_safety_guarantees.remote_erasure_claim_absent');
}

function assertSameLifecycleArray(actual, expected, name) {
  if (!Array.isArray(actual)) throw new TypeError(`${name} must be an array`);
  if (JSON.stringify(canonicalize(actual)) !== JSON.stringify(canonicalize(expected))) throw new TypeError(`${name} must match required_evidence_refs and operator_go_live_ref`);
}

function validateCustomerLifecycleEvidenceRefs(requiredEvidenceRefs) {
  if (!isPlainObject(requiredEvidenceRefs)) throw new TypeError('required_evidence_refs must be present');
  for (const phase of CUSTOMER_LIFECYCLE_REQUIRED_EVIDENCE_PHASES) {
    if (!Object.prototype.hasOwnProperty.call(requiredEvidenceRefs, phase)) throw new TypeError(`required_evidence_refs.${phase} must be present`);
    const evidence = lifecycleEvidenceRefFor(phase, requiredEvidenceRefs[phase]);
    requiredEvidenceRefs[phase] = evidence;
  }
  return requiredEvidenceRefs;
}

function validateCustomerLifecycleContracts(contracts) {
  if (!isPlainObject(contracts)) throw new TypeError('contracts must be present');
  for (const phase of CUSTOMER_LIFECYCLE_CONTRACT_PHASES) {
    if (!Object.prototype.hasOwnProperty.call(contracts, phase)) throw new TypeError(`contracts.${phase} must be present; missing_surface_refs must match contracts`);
    const contract = contracts[phase];
    if (contract === null) continue;
    if (!isPlainObject(contract)) throw new TypeError(`contracts.${phase} must be an object or null`);
    switch (phase) {
      case 'account':
        validateUserAccountContract(contract);
        break;
      case 'tenant':
        validateTenantContract(contract);
        break;
      case 'vault':
        validateHostedVaultContract(contract);
        break;
      case 'api_key':
        validateApiKeyContract(contract);
        break;
      case 'billing':
        validateUsageBillingRecord(contract);
        break;
      case 'dashboard':
        validateDashboardSummary(contract);
        break;
      case 'backup':
        validateBackupDrillContract(contract);
        break;
      case 'incident_sla':
        validateIncidentSlaRefs(contract);
        break;
      default:
        throw new TypeError(`unknown lifecycle phase: ${phase}`);
    }
  }
}

function validateCustomerLifecycleReadiness(readiness, expected) {
  if (!isPlainObject(readiness)) throw new TypeError('readiness must be present');
  requiredTrue(readiness.contract_ready, 'readiness.contract_ready');
  if (readiness.integration_kind !== HOSTED_CLOUD_CONTRACT_READY.integration_kind) throw new TypeError('readiness.integration_kind must remain contract_validator_only');
  requiredTrue(readiness.no_external_provider_calls, 'readiness.no_external_provider_calls');
  requiredTrue(readiness.evidence_validation_only, 'readiness.evidence_validation_only');
  if (readiness.status !== expected.status) throw new TypeError('readiness.status must match lifecycle evidence and operator go-live approval');
  if (readiness.lifecycle_evidence_complete !== expected.lifecycle_evidence_complete) throw new TypeError('readiness.lifecycle_evidence_complete must match required_evidence_refs');
  if (readiness.operator_go_live_approved !== expected.operator_go_live_approved) throw new TypeError('readiness.operator_go_live_approved must match operator_go_live_ref');
  if (readiness.external_wiring_ready !== expected.external_wiring_ready) throw new TypeError('readiness.external_wiring_ready must match blockers');
  if (readiness.hosted_cloud_sellable !== expected.hosted_cloud_sellable) throw new TypeError('readiness.hosted_cloud_sellable must match lifecycle evidence and operator go-live approval');
  if (readiness.selling_gate !== expected.selling_gate) throw new TypeError('readiness.selling_gate must match lifecycle evidence and operator go-live approval');
  assertSameLifecycleArray(readiness.external_blockers, expected.external_blockers, 'readiness.external_blockers');
  assertSameLifecycleArray(readiness.missing_evidence_refs, expected.missing_evidence_refs, 'readiness.missing_evidence_refs');
}

export function buildCustomerLifecyclePacket(input = {}) {
  if (!isPlainObject(input)) throw new TypeError('buildCustomerLifecyclePacket requires an options object');
  assertNoForbiddenPayload(input, 'input');
  const contracts = lifecycleContractsFrom(input);
  const requiredEvidenceRefs = lifecycleEvidenceRefsFrom(input, contracts);
  const operatorGoLiveRef = operatorGoLiveRefFromInput(input);
  const missingSurfaceRefs = missingLifecycleSurfaceRefs(contracts);
  const readiness = customerLifecycleReadiness(requiredEvidenceRefs, operatorGoLiveRef, contracts);
  const body = {
    schema: HOSTED_CLOUD_CUSTOMER_LIFECYCLE_PACKET_SCHEMA,
    packet_id: stringOrDefault(input.packet_id ?? input.packetId, undefined),
    generated_at: isoTimestamp(input.generated_at ?? input.generatedAt, 'generated_at'),
    contracts,
    required_evidence_refs: requiredEvidenceRefs,
    lifecycle_phases: lifecyclePhaseRows(requiredEvidenceRefs, contracts, operatorGoLiveRef),
    missing_surface_refs: missingSurfaceRefs,
    external_blockers: readiness.external_blockers,
    missing_evidence_refs: readiness.missing_evidence_refs,
    operator_go_live_ref: operatorGoLiveRef,
    readiness,
    hosted_cloud_sellable: readiness.hosted_cloud_sellable,
    guarantees: customerLifecycleSafetyGuarantees(),
    public_safety_guarantees: customerLifecycleSafetyGuarantees(),
  };
  const packet = withContractIdentity(body, 'hcclp', 'packet_id');
  validateCustomerLifecyclePacket(packet);
  return packet;
}

export function validateCustomerLifecyclePacket(packet) {
  if (!isPlainObject(packet)) throw new TypeError('packet must be an object');
  assertNoForbiddenPayload(packet, 'packet');
  if (packet.schema !== HOSTED_CLOUD_CUSTOMER_LIFECYCLE_PACKET_SCHEMA) throw new TypeError(`schema must be ${HOSTED_CLOUD_CUSTOMER_LIFECYCLE_PACKET_SCHEMA}`);
  requiredString(packet.packet_id, 'packet_id');
  isoTimestamp(packet.generated_at, 'generated_at');
  requiredString(packet.contract_hash, 'contract_hash');
  validateCustomerLifecycleContracts(packet.contracts);
  if (!isPlainObject(packet.required_evidence_refs)) throw new TypeError('required_evidence_refs must be present');
  const requiredEvidenceRefs = validateCustomerLifecycleEvidenceRefs({ ...packet.required_evidence_refs });
  const operatorGoLiveRef = operatorGoLiveRefFromPacket(packet);
  const expectedReadiness = customerLifecycleReadiness(requiredEvidenceRefs, operatorGoLiveRef, packet.contracts);
  const expectedPhases = lifecyclePhaseRows(requiredEvidenceRefs, packet.contracts, operatorGoLiveRef);
  assertSameLifecycleArray(packet.lifecycle_phases, expectedPhases, 'lifecycle_phases');
  assertSameLifecycleArray(packet.external_blockers, expectedReadiness.external_blockers, 'external_blockers');
  assertSameLifecycleArray(packet.missing_surface_refs, missingLifecycleSurfaceRefs(packet.contracts), 'missing_surface_refs');
  assertSameLifecycleArray(packet.missing_evidence_refs, expectedReadiness.missing_evidence_refs, 'missing_evidence_refs');
  validateCustomerLifecycleReadiness(packet.readiness, expectedReadiness);
  if (packet.hosted_cloud_sellable !== expectedReadiness.hosted_cloud_sellable) throw new TypeError('hosted_cloud_sellable must match readiness.hosted_cloud_sellable');
  validateCustomerLifecycleSafetyGuarantees(packet.guarantees ?? packet.public_safety_guarantees);
  return true;
}

function assertNoApiKeySecretMaterial(value, path = 'api_key_lifecycle') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoApiKeySecretMaterial(item, `${path}[${index}]`));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const allowedBoundaryKey = key === 'key_material_boundary' || key === 'key_material_in_contract' || key === 'api_key_material_absent';
    const keyMetadataContext = /(?:^|\.)(?:current|next|revoked|current_key|currentKey|current_api_key|currentApiKey|next_key|nextKey|next_api_key|nextApiKey|revoked_key|revokedKey|revoked_api_key|revokedApiKey|key_contracts\.(?:current|next|revoked)|keyContracts\.(?:current|next|revoked)|key_metadata_contracts\.(?:current|next|revoked)|keyMetadataContracts\.(?:current|next|revoked)|contracts\.(?:current|next|revoked))$/u.test(path);
    const bareSecretKey = key === 'api_key' || key === 'apiKey' || (keyMetadataContext && key === 'key');
    if (!allowedBoundaryKey && (bareSecretKey || API_KEY_SECRET_MATERIAL_KEY_RE.test(key))) {
      throw new TypeError(`${path}.${key} is not allowed in API key lifecycle packets`);
    }
    assertNoApiKeySecretMaterial(child, `${path}.${key}`);
  }
}

function apiKeyLifecycleOperation(input) {
  const operation = requiredString(input.operation, 'operation');
  if (!HOSTED_CLOUD_API_KEY_LIFECYCLE_OPERATIONS.includes(operation)) {
    throw new TypeError(`operation must be one of ${HOSTED_CLOUD_API_KEY_LIFECYCLE_OPERATIONS.join(', ')}`);
  }
  return operation;
}

function apiKeyLifecycleRequiredPhases(operation) {
  return API_KEY_LIFECYCLE_OPERATION_PHASES[operation];
}

function apiKeyLifecycleSlotAliases(slot) {
  switch (slot) {
    case 'current':
      return ['current', 'current_key', 'currentKey', 'current_api_key', 'currentApiKey', 'current_key_contract', 'currentKeyContract', 'current_api_key_contract', 'currentApiKeyContract'];
    case 'next':
      return ['next', 'next_key', 'nextKey', 'next_api_key', 'nextApiKey', 'next_key_contract', 'nextKeyContract', 'next_api_key_contract', 'nextApiKeyContract'];
    case 'revoked':
      return ['revoked', 'revoked_key', 'revokedKey', 'revoked_api_key', 'revokedApiKey', 'revoked_key_contract', 'revokedKeyContract', 'revoked_api_key_contract', 'revokedApiKeyContract'];
    default:
      throw new TypeError(`unknown API key lifecycle slot: ${slot}`);
  }
}

function apiKeyLifecycleContractSource(input, slot) {
  const aliases = apiKeyLifecycleSlotAliases(slot);
  const contractCollections = [
    input.key_contracts,
    input.keyContracts,
    input.key_metadata_contracts,
    input.keyMetadataContracts,
    input.contracts,
  ];
  for (const collection of contractCollections) {
    if (!isPlainObject(collection)) continue;
    for (const alias of aliases) {
      if (collection[alias] !== undefined) return collection[alias];
    }
  }
  for (const alias of aliases) {
    if (input[alias] !== undefined) return input[alias];
  }
  return undefined;
}

function validateApiKeyLifecycleContractTenantSubject(contract, tenantId, subjectRef, name) {
  if (contract.tenant_id !== tenantId) throw new TypeError(`${name}.tenant_id must match packet tenant_id`);
  if (contract.subject_ref !== subjectRef) throw new TypeError(`${name}.subject_ref must match packet subject_ref`);
}

function buildOrValidateApiKeyLifecycleContract(slot, source, tenantId, subjectRef, generatedAt) {
  if (source === undefined || source === null) return null;
  if (!isPlainObject(source)) throw new TypeError(`key_contracts.${slot} must be an object`);
  const name = `key_contracts.${slot}`;
  if (source.schema === HOSTED_CLOUD_API_KEY_SCHEMA) {
    validateApiKeyContract(source);
    validateApiKeyLifecycleContractTenantSubject(source, tenantId, subjectRef, name);
    return source;
  }
  const contract = buildApiKeyContract({
    ...source,
    tenant_id: source.tenant_id ?? source.tenantId ?? tenantId,
    subject_ref: source.subject_ref ?? source.subjectRef ?? subjectRef,
    generated_at: source.generated_at ?? source.generatedAt ?? generatedAt,
  });
  validateApiKeyLifecycleContractTenantSubject(contract, tenantId, subjectRef, name);
  return contract;
}

function apiKeyLifecycleContractsFrom(input, tenantId, subjectRef, generatedAt) {
  return Object.fromEntries(API_KEY_LIFECYCLE_KEY_SLOTS.map((slot) => [
    slot,
    buildOrValidateApiKeyLifecycleContract(slot, apiKeyLifecycleContractSource(input, slot), tenantId, subjectRef, generatedAt),
  ]));
}

function explicitApiKeyLifecycleEvidenceRefs(input) {
  const refs = input.required_evidence_refs ?? input.requiredEvidenceRefs ?? input.api_key_evidence_refs ?? input.apiKeyEvidenceRefs ?? input.lifecycle_evidence_refs ?? input.lifecycleEvidenceRefs ?? input.evidence_refs ?? input.evidenceRefs;
  if (refs === undefined || refs === null) return {};
  if (!isPlainObject(refs)) throw new TypeError('required_evidence_refs must be an object');
  return refs;
}

function apiKeyLifecycleEvidenceRefFor(phase, value) {
  const fallback = { ref: `blocked:${phase}`, status: BLOCKED, blocker: API_KEY_LIFECYCLE_BLOCKER_LABELS[phase] };
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') return { ref: requirePublicSafeLifecycleRef(value, `required_evidence_refs.${phase}`), status: PROVIDED };
  if (!isPlainObject(value)) throw new TypeError(`required_evidence_refs.${phase} must be a string or object`);
  const status = stringOrDefault(value.status, PROVIDED);
  if (!EVIDENCE_STATUSES.has(status)) throw new TypeError(`required_evidence_refs.${phase}.status is invalid`);
  const ref = status === PROVIDED
    ? requirePublicSafeLifecycleRef(value.ref, `required_evidence_refs.${phase}.ref`)
    : requiredString(value.ref, `required_evidence_refs.${phase}.ref`);
  assertNoForbiddenPayload(ref, `required_evidence_refs.${phase}.ref`);
  assertNoApiKeySecretMaterial(ref, `required_evidence_refs.${phase}.ref`);
  const evidence = { ref, status };
  const owner = optionalString(value.owner, `required_evidence_refs.${phase}.owner`);
  const blocker = optionalString(value.blocker, `required_evidence_refs.${phase}.blocker`);
  const contractSchema = optionalString(value.contract_schema, `required_evidence_refs.${phase}.contract_schema`);
  const contractId = optionalString(value.contract_id, `required_evidence_refs.${phase}.contract_id`);
  if (owner) evidence.owner = owner;
  if (contractSchema) evidence.contract_schema = contractSchema;
  if (contractId) evidence.contract_id = contractId;
  if (status === BLOCKED) evidence.blocker = blocker ?? API_KEY_LIFECYCLE_BLOCKER_LABELS[phase];
  return evidence;
}

function apiKeyLifecycleSlotForPhase(phase) {
  switch (phase) {
    case 'current_key_metadata':
      return 'current';
    case 'next_key_metadata':
      return 'next';
    case 'revoked_key_metadata':
      return 'revoked';
    default:
      return null;
  }
}

function apiKeyLifecycleContractEvidenceRef(phase, contract) {
  if (!contract) return apiKeyLifecycleEvidenceRefFor(phase, undefined);
  return {
    ref: requiredString(contract.contract_hash, `key_contracts.${apiKeyLifecycleSlotForPhase(phase)}.contract_hash`),
    status: PROVIDED,
    contract_schema: requiredString(contract.schema, `key_contracts.${apiKeyLifecycleSlotForPhase(phase)}.schema`),
    contract_id: requiredString(contract.api_key_id, `key_contracts.${apiKeyLifecycleSlotForPhase(phase)}.api_key_id`),
  };
}

function apiKeyLifecycleEvidenceRefsFrom(input, operation, keyContracts) {
  const explicitRefs = explicitApiKeyLifecycleEvidenceRefs(input);
  const requiredPhases = apiKeyLifecycleRequiredPhases(operation);
  const evidenceRefs = {};
  for (const phase of requiredPhases) {
    const slot = apiKeyLifecycleSlotForPhase(phase);
    evidenceRefs[phase] = explicitRefs[phase] === undefined && slot !== null
      ? apiKeyLifecycleContractEvidenceRef(phase, keyContracts[slot])
      : apiKeyLifecycleEvidenceRefFor(phase, explicitRefs[phase]);
  }
  return evidenceRefs;
}

function apiKeyLifecycleOperatorApprovalRefFromInput(input) {
  const value = input.operator_approval_ref ?? input.operatorApprovalRef ?? input.operator_go_live_ref ?? input.operatorGoLiveRef;
  if (value === undefined || value === null) return null;
  return requirePublicSafeLifecycleRef(value, 'operator_approval_ref');
}

function apiKeyLifecycleOperatorApprovalRefFromPacket(packet) {
  if (!Object.prototype.hasOwnProperty.call(packet, 'operator_approval_ref')) throw new TypeError('operator_approval_ref must be present');
  if (packet.operator_approval_ref === null) return null;
  return requirePublicSafeLifecycleRef(packet.operator_approval_ref, 'operator_approval_ref');
}

function missingApiKeyLifecycleEvidenceRefs(requiredEvidenceRefs, operation) {
  return apiKeyLifecycleRequiredPhases(operation)
    .filter((phase) => requiredEvidenceRefs[phase].status !== PROVIDED)
    .map((phase) => ({
      key: phase,
      ref: requiredEvidenceRefs[phase].ref,
      blocker: requiredEvidenceRefs[phase].blocker ?? API_KEY_LIFECYCLE_BLOCKER_LABELS[phase],
    }));
}

function apiKeyLifecycleExternalBlockers(requiredEvidenceRefs, operation, operatorApprovalRef) {
  const blockers = missingApiKeyLifecycleEvidenceRefs(requiredEvidenceRefs, operation);
  if (operatorApprovalRef === null) {
    blockers.push({
      key: 'operator_approval',
      ref: 'blocked:operator_approval',
      blocker: API_KEY_LIFECYCLE_BLOCKER_LABELS.operator_approval,
    });
  }
  return blockers;
}

function apiKeyLifecycleReadiness(operation, requiredEvidenceRefs, operatorApprovalRef) {
  const missingEvidenceRefs = missingApiKeyLifecycleEvidenceRefs(requiredEvidenceRefs, operation);
  const externalLifecycleBlockers = apiKeyLifecycleExternalBlockers(requiredEvidenceRefs, operation, operatorApprovalRef);
  const evidenceApproved = missingEvidenceRefs.length === 0 && operatorApprovalRef !== null;
  return {
    ...HOSTED_CLOUD_CONTRACT_READY,
    operation,
    status: evidenceApproved ? 'operator_approved_api_key_lifecycle_evidence' : 'blocked_api_key_lifecycle_evidence_or_operator_approval',
    evidence_validation_only: true,
    no_provider_wiring: true,
    actual_key_issuance: false,
    lifecycle_evidence_complete: missingEvidenceRefs.length === 0,
    operator_approval_provided: operatorApprovalRef !== null,
    external_wiring_ready: externalLifecycleBlockers.length === 0,
    customer_api_keys_live: evidenceApproved,
    live_readiness_gate: evidenceApproved ? 'evidence_complete_operator_approved' : 'blocked_until_lifecycle_evidence_and_operator_approval',
    external_blockers: externalLifecycleBlockers,
    missing_evidence_refs: missingEvidenceRefs,
  };
}

function apiKeyLifecycleKeyMetadataRefs(operation, requiredEvidenceRefs) {
  const requiredPhases = apiKeyLifecycleRequiredPhases(operation);
  return Object.fromEntries(API_KEY_LIFECYCLE_KEY_SLOTS.map((slot) => {
    const phase = `${slot}_key_metadata`;
    return [slot, requiredPhases.includes(phase) ? requiredEvidenceRefs[phase] : null];
  }));
}

function apiKeyLifecycleEvents(operation, requiredEvidenceRefs, keyContracts) {
  return apiKeyLifecycleRequiredPhases(operation).map((phase) => {
    const evidence = requiredEvidenceRefs[phase];
    const event = {
      operation,
      phase,
      evidence_ref: evidence.ref,
      evidence_status: evidence.status,
      ready: evidence.status === PROVIDED,
    };
    if (evidence.status === BLOCKED) event.blocker = evidence.blocker ?? API_KEY_LIFECYCLE_BLOCKER_LABELS[phase];
    const slot = apiKeyLifecycleSlotForPhase(phase);
    if (slot !== null && keyContracts[slot]) {
      event.key_slot = slot;
      event.contract_schema = keyContracts[slot].schema;
      event.contract_id = keyContracts[slot].api_key_id;
      event.contract_hash = keyContracts[slot].contract_hash;
    }
    return event;
  });
}

function apiKeyLifecycleSafetyGuarantees() {
  return {
    opaque_reference_only: true,
    customer_content_absent: true,
    sensitive_text_absent: true,
    auth_material_absent: true,
    api_key_material_absent: true,
    provider_payloads_absent: true,
    provider_wiring_absent: true,
    evidence_validation_only: true,
    actual_key_issuance_absent: true,
    financial_outcome_claim_absent: true,
    remote_erasure_claim_absent: true,
  };
}

function validateApiKeyLifecycleSafetyGuarantees(guarantees) {
  if (!isPlainObject(guarantees)) throw new TypeError('public_safety_guarantees must be present');
  requiredTrue(guarantees.opaque_reference_only, 'public_safety_guarantees.opaque_reference_only');
  requiredTrue(guarantees.customer_content_absent, 'public_safety_guarantees.customer_content_absent');
  requiredTrue(guarantees.sensitive_text_absent, 'public_safety_guarantees.sensitive_text_absent');
  requiredTrue(guarantees.auth_material_absent, 'public_safety_guarantees.auth_material_absent');
  requiredTrue(guarantees.api_key_material_absent, 'public_safety_guarantees.api_key_material_absent');
  requiredTrue(guarantees.provider_payloads_absent, 'public_safety_guarantees.provider_payloads_absent');
  requiredTrue(guarantees.provider_wiring_absent, 'public_safety_guarantees.provider_wiring_absent');
  requiredTrue(guarantees.evidence_validation_only, 'public_safety_guarantees.evidence_validation_only');
  requiredTrue(guarantees.actual_key_issuance_absent, 'public_safety_guarantees.actual_key_issuance_absent');
  requiredTrue(guarantees.financial_outcome_claim_absent, 'public_safety_guarantees.financial_outcome_claim_absent');
  requiredTrue(guarantees.remote_erasure_claim_absent, 'public_safety_guarantees.remote_erasure_claim_absent');
}

function validateApiKeyLifecycleContracts(keyContracts, tenantId, subjectRef) {
  if (!isPlainObject(keyContracts)) throw new TypeError('key_contracts must be present');
  for (const slot of API_KEY_LIFECYCLE_KEY_SLOTS) {
    if (!Object.prototype.hasOwnProperty.call(keyContracts, slot)) throw new TypeError(`key_contracts.${slot} must be present`);
    const contract = keyContracts[slot];
    if (contract === null) continue;
    if (!isPlainObject(contract)) throw new TypeError(`key_contracts.${slot} must be an object or null`);
    validateApiKeyContract(contract);
    validateApiKeyLifecycleContractTenantSubject(contract, tenantId, subjectRef, `key_contracts.${slot}`);
  }
}

function validateApiKeyLifecycleEvidenceRefs(requiredEvidenceRefs, operation) {
  if (!isPlainObject(requiredEvidenceRefs)) throw new TypeError('required_evidence_refs must be present');
  const expectedPhases = apiKeyLifecycleRequiredPhases(operation);
  for (const phase of Object.keys(requiredEvidenceRefs)) {
    if (!expectedPhases.includes(phase)) throw new TypeError(`required_evidence_refs.${phase} is not required for ${operation}`);
  }
  const normalized = {};
  for (const phase of expectedPhases) {
    if (!Object.prototype.hasOwnProperty.call(requiredEvidenceRefs, phase)) throw new TypeError(`required_evidence_refs.${phase} must be present`);
    normalized[phase] = apiKeyLifecycleEvidenceRefFor(phase, requiredEvidenceRefs[phase]);
  }
  return normalized;
}

function assertSameLifecycleObject(actual, expected, name) {
  if (!isPlainObject(actual)) throw new TypeError(`${name} must be an object`);
  if (JSON.stringify(canonicalize(actual)) !== JSON.stringify(canonicalize(expected))) throw new TypeError(`${name} must match API key lifecycle evidence`);
}

function validateApiKeyLifecycleReadiness(readiness, expected) {
  if (!isPlainObject(readiness)) throw new TypeError('readiness must be present');
  requiredTrue(readiness.contract_ready, 'readiness.contract_ready');
  if (readiness.integration_kind !== HOSTED_CLOUD_CONTRACT_READY.integration_kind) throw new TypeError('readiness.integration_kind must remain contract_validator_only');
  requiredTrue(readiness.no_external_provider_calls, 'readiness.no_external_provider_calls');
  if (readiness.operation !== expected.operation) throw new TypeError('readiness.operation must match operation');
  if (readiness.status !== expected.status) throw new TypeError('readiness.status must match API key lifecycle evidence and operator approval');
  requiredTrue(readiness.evidence_validation_only, 'readiness.evidence_validation_only');
  requiredTrue(readiness.no_provider_wiring, 'readiness.no_provider_wiring');
  requiredFalse(readiness.actual_key_issuance, 'readiness.actual_key_issuance');
  if (readiness.lifecycle_evidence_complete !== expected.lifecycle_evidence_complete) throw new TypeError('readiness.lifecycle_evidence_complete must match required_evidence_refs');
  if (readiness.operator_approval_provided !== expected.operator_approval_provided) throw new TypeError('readiness.operator_approval_provided must match operator_approval_ref');
  if (readiness.external_wiring_ready !== expected.external_wiring_ready) throw new TypeError('readiness.external_wiring_ready must match blockers');
  if (readiness.customer_api_keys_live !== expected.customer_api_keys_live) throw new TypeError('readiness.customer_api_keys_live must match lifecycle evidence and operator approval');
  if (readiness.live_readiness_gate !== expected.live_readiness_gate) throw new TypeError('readiness.live_readiness_gate must match lifecycle evidence and operator approval');
  assertSameLifecycleArray(readiness.external_blockers, expected.external_blockers, 'readiness.external_blockers');
  assertSameLifecycleArray(readiness.missing_evidence_refs, expected.missing_evidence_refs, 'readiness.missing_evidence_refs');
}

export function buildApiKeyLifecyclePacket(input = {}) {
  if (!isPlainObject(input)) throw new TypeError('buildApiKeyLifecyclePacket requires an options object');
  assertNoForbiddenPayload(input, 'input');
  assertNoApiKeySecretMaterial(input, 'input');
  const tenantId = requiredString(input.tenant_id ?? input.tenantId, 'tenant_id');
  const subjectRef = requiredString(input.subject_ref ?? input.subjectRef, 'subject_ref');
  const generatedAt = isoTimestamp(input.generated_at ?? input.generatedAt, 'generated_at');
  const operation = apiKeyLifecycleOperation(input);
  const keyContracts = apiKeyLifecycleContractsFrom(input, tenantId, subjectRef, generatedAt);
  const requiredEvidenceRefs = apiKeyLifecycleEvidenceRefsFrom(input, operation, keyContracts);
  const operatorApprovalRef = apiKeyLifecycleOperatorApprovalRefFromInput(input);
  const readiness = apiKeyLifecycleReadiness(operation, requiredEvidenceRefs, operatorApprovalRef);
  const body = {
    schema: HOSTED_CLOUD_API_KEY_LIFECYCLE_PACKET_SCHEMA,
    packet_id: stringOrDefault(input.packet_id ?? input.packetId, undefined),
    generated_at: generatedAt,
    tenant_id: tenantId,
    subject_ref: subjectRef,
    operation,
    key_contracts: keyContracts,
    key_metadata_refs: apiKeyLifecycleKeyMetadataRefs(operation, requiredEvidenceRefs),
    lifecycle_events: apiKeyLifecycleEvents(operation, requiredEvidenceRefs, keyContracts),
    required_evidence_refs: requiredEvidenceRefs,
    external_blockers: readiness.external_blockers,
    missing_evidence_refs: readiness.missing_evidence_refs,
    operator_approval_ref: operatorApprovalRef,
    readiness,
    customer_api_keys_live: readiness.customer_api_keys_live,
    guarantees: apiKeyLifecycleSafetyGuarantees(),
    public_safety_guarantees: apiKeyLifecycleSafetyGuarantees(),
  };
  const packet = withContractIdentity(body, 'hcaklp', 'packet_id');
  validateApiKeyLifecyclePacket(packet);
  return packet;
}

export function validateApiKeyLifecyclePacket(packet) {
  if (!isPlainObject(packet)) throw new TypeError('packet must be an object');
  assertNoForbiddenPayload(packet, 'packet');
  assertNoApiKeySecretMaterial(packet, 'packet');
  if (packet.schema !== HOSTED_CLOUD_API_KEY_LIFECYCLE_PACKET_SCHEMA) throw new TypeError(`schema must be ${HOSTED_CLOUD_API_KEY_LIFECYCLE_PACKET_SCHEMA}`);
  requiredString(packet.packet_id, 'packet_id');
  isoTimestamp(packet.generated_at, 'generated_at');
  requiredString(packet.contract_hash, 'contract_hash');
  const tenantId = requiredString(packet.tenant_id, 'tenant_id');
  const subjectRef = requiredString(packet.subject_ref, 'subject_ref');
  const operation = apiKeyLifecycleOperation(packet);
  validateApiKeyLifecycleContracts(packet.key_contracts, tenantId, subjectRef);
  const requiredEvidenceRefs = validateApiKeyLifecycleEvidenceRefs(packet.required_evidence_refs, operation);
  const operatorApprovalRef = apiKeyLifecycleOperatorApprovalRefFromPacket(packet);
  const expectedReadiness = apiKeyLifecycleReadiness(operation, requiredEvidenceRefs, operatorApprovalRef);
  assertSameLifecycleObject(packet.key_metadata_refs, apiKeyLifecycleKeyMetadataRefs(operation, requiredEvidenceRefs), 'key_metadata_refs');
  assertSameLifecycleArray(packet.lifecycle_events, apiKeyLifecycleEvents(operation, requiredEvidenceRefs, packet.key_contracts), 'lifecycle_events');
  assertSameLifecycleArray(packet.external_blockers, expectedReadiness.external_blockers, 'external_blockers');
  assertSameLifecycleArray(packet.missing_evidence_refs, expectedReadiness.missing_evidence_refs, 'missing_evidence_refs');
  validateApiKeyLifecycleReadiness(packet.readiness, expectedReadiness);
  if (packet.customer_api_keys_live !== expectedReadiness.customer_api_keys_live) throw new TypeError('customer_api_keys_live must match readiness.customer_api_keys_live');
  validateApiKeyLifecycleSafetyGuarantees(packet.guarantees ?? packet.public_safety_guarantees);
  validateApiKeyLifecycleSafetyGuarantees(packet.public_safety_guarantees ?? packet.guarantees);
  return true;
}
