import { createHash } from 'node:crypto';

export const HOSTED_CLOUD_USER_ACCOUNT_SCHEMA = 'enigma.hosted_cloud.user_account.v1';
export const HOSTED_CLOUD_TENANT_SCHEMA = 'enigma.hosted_cloud.tenant.v1';
export const HOSTED_CLOUD_VAULT_SCHEMA = 'enigma.hosted_cloud.vault.v1';
export const HOSTED_CLOUD_API_KEY_SCHEMA = 'enigma.hosted_cloud.api_key.v1';
export const HOSTED_CLOUD_USAGE_BILLING_SCHEMA = 'enigma.hosted_cloud.usage_billing_record.v1';
export const HOSTED_CLOUD_DASHBOARD_SCHEMA = 'enigma.hosted_cloud.dashboard_summary.v1';
export const HOSTED_CLOUD_BACKUP_DRILL_SCHEMA = 'enigma.hosted_cloud.backup_drill.v1';
export const HOSTED_CLOUD_INCIDENT_SLA_SCHEMA = 'enigma.hosted_cloud.incident_sla_refs.v1';

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
const FORBIDDEN_KEY_RE = /(?:^|_)(?:raw_?memory|plaintext|plain_text|prompt|prompts|completion|completions|message_body|transcript|conversation|provider_?response|response_?body|credential|credentials|secret|password|private_?key|bearer|access_token|refresh_token|token_value|api_key_value|api_secret|token_?roi|token_?profit|roi_claim|profit_claim|provider_?deletion|provider_?erasure|model_?forgetting|model_?erasure)(?:$|_)/iu;
const SECRET_VALUE_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|raw memory|private prompt|provider response|full transcript|decrypted memory)/iu;
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
