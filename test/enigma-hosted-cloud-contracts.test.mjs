import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOSTED_CLOUD_API_KEY_SCHEMA,
  HOSTED_CLOUD_BACKUP_DRILL_SCHEMA,
  HOSTED_CLOUD_CUSTOMER_LIFECYCLE_PACKET_SCHEMA,
  HOSTED_CLOUD_CUSTOMER_LIFECYCLE_PHASES,
  HOSTED_CLOUD_DASHBOARD_SCHEMA,
  HOSTED_CLOUD_EXTERNAL_BLOCKERS,
  HOSTED_CLOUD_INCIDENT_SLA_SCHEMA,
  HOSTED_CLOUD_TENANT_SCHEMA,
  HOSTED_CLOUD_USAGE_BILLING_SCHEMA,
  HOSTED_CLOUD_USER_ACCOUNT_SCHEMA,
  HOSTED_CLOUD_VAULT_SCHEMA,
  buildApiKeyContract,
  buildBackupDrillContract,
  buildCustomerLifecyclePacket,
  buildDashboardSummary,
  buildHostedVaultContract,
  buildIncidentSlaRefs,
  buildTenantContract,
  buildUsageBillingRecord,
  buildUserAccountContract,
  validateApiKeyContract,
  validateBackupDrillContract,
  validateCustomerLifecyclePacket,
  validateDashboardSummary,
  validateHostedVaultContract,
  validateIncidentSlaRefs,
  validateTenantContract,
  validateUsageBillingRecord,
  validateUserAccountContract,
} from '../packages/hosted-cloud/src/index.js';

const generatedAt = '2026-06-25T00:00:00.000Z';
const issuedAt = '2026-06-25T00:00:00.000Z';
const performedAt = '2026-06-25T01:00:00.000Z';

function evidenceRefs(status = 'blocked_external_dependency') {
  return Object.fromEntries(HOSTED_CLOUD_EXTERNAL_BLOCKERS.map((key) => [
    key,
    {
      ref: status === 'provided' ? `evidence:${key}:2026-06-25` : `blocked:${key}:2026-06-25`,
      status,
      blocker: status === 'provided' ? undefined : `${key} remains externally blocked`,
    },
  ]));
}

function baseTenant(overrides = {}) {
  return {
    tenant_id: 'tenant_alpha',
    tenant_ref: 'tenant-ref-alpha',
    policy_ref: 'policy-ref-alpha',
    retention_policy_ref: 'retention-ref-alpha',
    data_residency_ref: 'residency-ref-alpha',
    generated_at: generatedAt,
    operator_evidence_refs: evidenceRefs(),
    ...overrides,
  };
}

function lifecycleEvidenceRefs(status = 'blocked_external_dependency') {
  return Object.fromEntries(HOSTED_CLOUD_CUSTOMER_LIFECYCLE_PHASES
    .filter((phase) => phase !== 'operator_go_live')
    .map((phase) => [
      phase,
      {
        ref: status === 'provided' ? `evidence:lifecycle:${phase}:2026-06-25` : `blocked:lifecycle:${phase}:2026-06-25`,
        status,
        blocker: status === 'provided' ? undefined : `${phase} remains externally blocked`,
      },
    ]));
}

function lifecycleContracts(status = 'blocked_external_dependency') {
  const operator_evidence_refs = evidenceRefs(status);
  const account = buildUserAccountContract({
    tenant_id: 'tenant_alpha',
    subject_ref: 'subject-ref-1',
    auth_provider_user_ref: 'auth-user-ref-1',
    roles: ['admin', 'viewer'],
    generated_at: generatedAt,
    operator_evidence_refs,
  });
  const tenant = buildTenantContract(baseTenant({ operator_evidence_refs }));
  const hosted_vault = buildHostedVaultContract({
    tenant_id: 'tenant_alpha',
    vault_ref: 'vault-ref-alpha',
    storage_ref: 'storage-ref-alpha',
    kms_key_ref: 'kms-ref-alpha',
    backup_policy_ref: 'backup-policy-ref-alpha',
    retention_policy_ref: 'retention-ref-alpha',
    generated_at: generatedAt,
    operator_evidence_refs,
  });
  const api_key = buildApiKeyContract({
    tenant_id: 'tenant_alpha',
    subject_ref: 'subject-ref-1',
    key_fingerprint: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    scopes: ['vault.read', 'usage.read'],
    issued_at: issuedAt,
    rotation_ref: 'rotation-ref-alpha',
    generated_at: generatedAt,
    operator_evidence_refs,
  });
  const billing = buildUsageBillingRecord({
    tenant_id: 'tenant_alpha',
    period_start: '2026-06-01T00:00:00.000Z',
    period_end: '2026-07-01T00:00:00.000Z',
    billing_provider_customer_ref: 'billing-customer-ref-alpha',
    usage_aggregate_ref: 'usage-aggregate-ref-alpha',
    metered_event_count: 12,
    billable_units: 34,
    amount_due_minor_units: 1234,
    generated_at: generatedAt,
    operator_evidence_refs,
  });
  const backup_drill = buildBackupDrillContract({
    tenant_id: 'tenant_alpha',
    vault_ref: 'vault-ref-alpha',
    performed_at: performedAt,
    backup_snapshot_ref: 'backup-snapshot-ref-alpha',
    restore_evidence_ref: 'restore-evidence-ref-alpha',
    rpo_minutes: 15,
    rto_minutes: 60,
    generated_at: generatedAt,
    operator_evidence_refs,
  });
  const incident_sla = buildIncidentSlaRefs({
    tenant_id: 'tenant_alpha',
    incident_response_ref: 'incident-response-ref-alpha',
    sla_policy_ref: 'sla-policy-ref-alpha',
    support_owner_ref: 'support-owner-ref-alpha',
    escalation_policy_ref: 'escalation-policy-ref-alpha',
    status_page_ref: 'status-page-ref-alpha',
    generated_at: generatedAt,
    operator_evidence_refs,
  });
  const dashboard = buildDashboardSummary({
    tenant_id: 'tenant_alpha',
    generated_at: generatedAt,
    account_count: 1,
    active_api_key_count: 1,
    hosted_vault_count: 1,
    billing_period_ref: billing.billing_record_id,
    open_incident_count: 0,
    backup_drill_ref: backup_drill.backup_drill_id,
    incident_sla_ref: incident_sla.incident_sla_id,
    operator_evidence_refs,
  });
  return { account, tenant, vault: hosted_vault, api_key, billing, dashboard, backup: backup_drill, incident_sla };
}

test('hosted cloud builders create contract-only blocked artifacts for every product surface', () => {
  const account = buildUserAccountContract({
    tenant_id: 'tenant_alpha',
    subject_ref: 'subject-ref-1',
    auth_provider_user_ref: 'auth-user-ref-1',
    roles: ['admin', 'viewer'],
    generated_at: generatedAt,
    operator_evidence_refs: evidenceRefs(),
  });
  const tenant = buildTenantContract(baseTenant());
  const vault = buildHostedVaultContract({
    tenant_id: 'tenant_alpha',
    vault_ref: 'vault-ref-alpha',
    storage_ref: 'storage-ref-alpha',
    kms_key_ref: 'kms-ref-alpha',
    backup_policy_ref: 'backup-policy-ref-alpha',
    retention_policy_ref: 'retention-ref-alpha',
    generated_at: generatedAt,
    operator_evidence_refs: evidenceRefs(),
  });
  const apiKey = buildApiKeyContract({
    tenant_id: 'tenant_alpha',
    subject_ref: 'subject-ref-1',
    key_fingerprint: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    scopes: ['vault.read', 'usage.read'],
    issued_at: issuedAt,
    rotation_ref: 'rotation-ref-alpha',
    generated_at: generatedAt,
    operator_evidence_refs: evidenceRefs(),
  });
  const billing = buildUsageBillingRecord({
    tenant_id: 'tenant_alpha',
    period_start: '2026-06-01T00:00:00.000Z',
    period_end: '2026-07-01T00:00:00.000Z',
    billing_provider_customer_ref: 'billing-customer-ref-alpha',
    usage_aggregate_ref: 'usage-aggregate-ref-alpha',
    metered_event_count: 12,
    billable_units: 34,
    amount_due_minor_units: 1234,
    generated_at: generatedAt,
    operator_evidence_refs: evidenceRefs(),
  });
  const backup = buildBackupDrillContract({
    tenant_id: 'tenant_alpha',
    vault_ref: 'vault-ref-alpha',
    performed_at: performedAt,
    backup_snapshot_ref: 'backup-snapshot-ref-alpha',
    restore_evidence_ref: 'restore-evidence-ref-alpha',
    rpo_minutes: 15,
    rto_minutes: 60,
    generated_at: generatedAt,
    operator_evidence_refs: evidenceRefs(),
  });
  const incidentSla = buildIncidentSlaRefs({
    tenant_id: 'tenant_alpha',
    incident_response_ref: 'incident-response-ref-alpha',
    sla_policy_ref: 'sla-policy-ref-alpha',
    support_owner_ref: 'support-owner-ref-alpha',
    escalation_policy_ref: 'escalation-policy-ref-alpha',
    status_page_ref: 'status-page-ref-alpha',
    generated_at: generatedAt,
    operator_evidence_refs: evidenceRefs(),
  });
  const dashboard = buildDashboardSummary({
    tenant_id: 'tenant_alpha',
    generated_at: generatedAt,
    account_count: 1,
    active_api_key_count: 1,
    hosted_vault_count: 1,
    billing_period_ref: billing.billing_record_id,
    open_incident_count: 0,
    backup_drill_ref: backup.backup_drill_id,
    incident_sla_ref: incidentSla.incident_sla_id,
    operator_evidence_refs: evidenceRefs(),
  });

  assert.equal(account.schema, HOSTED_CLOUD_USER_ACCOUNT_SCHEMA);
  assert.equal(tenant.schema, HOSTED_CLOUD_TENANT_SCHEMA);
  assert.equal(vault.schema, HOSTED_CLOUD_VAULT_SCHEMA);
  assert.equal(apiKey.schema, HOSTED_CLOUD_API_KEY_SCHEMA);
  assert.equal(billing.schema, HOSTED_CLOUD_USAGE_BILLING_SCHEMA);
  assert.equal(dashboard.schema, HOSTED_CLOUD_DASHBOARD_SCHEMA);
  assert.equal(backup.schema, HOSTED_CLOUD_BACKUP_DRILL_SCHEMA);
  assert.equal(incidentSla.schema, HOSTED_CLOUD_INCIDENT_SLA_SCHEMA);

  for (const contract of [account, tenant, vault, apiKey, billing, dashboard, backup, incidentSla]) {
    assert.equal(contract.readiness.contract_ready, true);
    assert.equal(contract.readiness.no_external_provider_calls, true);
    assert.equal(contract.readiness.external_wiring_ready, false);
    assert.equal(contract.readiness.hosted_cloud_sellable, false);
    assert.equal(contract.readiness.external_blockers.length, HOSTED_CLOUD_EXTERNAL_BLOCKERS.length);
    assert.match(contract.contract_hash, /^sha256:[a-f0-9]{64}$/);
  }

  assert.equal(vault.custody_boundary.opaque_records_only, true);
  assert.equal(apiKey.key_material_boundary.key_material_in_contract, false);
  assert.equal(billing.billing_boundary.external_invoice_required, true);
  assert.equal(backup.recovery_boundary.external_backup_system_required, true);
  assert.equal(incidentSla.incident_boundary.support_owner_required, true);
  assert.throws(() => validateUserAccountContract({ ...account, controls: { ...account.controls, stores_provider_payloads: true } }), /must be false/);
  assert.throws(() => validateHostedVaultContract({ ...vault, custody_boundary: { ...vault.custody_boundary, provider_payloads_allowed: true } }), /must be false/);
  assert.throws(() => validateApiKeyContract({ ...apiKey, key_material_boundary: { ...apiKey.key_material_boundary, key_material_in_contract: true } }), /must be false/);
  assert.throws(() => validateUsageBillingRecord({ ...billing, billing_boundary: { ...billing.billing_boundary, financial_outcome_claim: true } }), /must be false/);
  assert.throws(() => validateIncidentSlaRefs({ ...incidentSla, incident_boundary: { ...incidentSla.incident_boundary, support_owner_required: false } }), /must be true/);
});

test('hosted cloud validators accept provided external evidence refs without making service claims', () => {
  const tenant = buildTenantContract(baseTenant({ operator_evidence_refs: evidenceRefs('provided') }));
  assert.equal(tenant.readiness.external_wiring_ready, true);
  assert.equal(tenant.readiness.hosted_cloud_sellable, false);
  assert.equal(tenant.readiness.selling_gate, 'requires_operator_go_live_approval');
  assert.equal(validateTenantContract(tenant), true);
});

test('hosted cloud validators reject raw memory, prompts, provider responses, and credentials', () => {
  const account = buildUserAccountContract({
    tenant_id: 'tenant_alpha',
    subject_ref: 'subject-ref-1',
    auth_provider_user_ref: 'auth-user-ref-1',
    generated_at: generatedAt,
    operator_evidence_refs: evidenceRefs(),
  });
  assert.throws(() => validateUserAccountContract({ ...account, raw_memory: 'customer plaintext' }), /not allowed/);
  assert.throws(() => validateUserAccountContract({ ...account, prompt: 'private prompt: summarize this' }), /not allowed/);
  assert.throws(() => validateUserAccountContract({ ...account, provider_response: { id: 'resp_1' } }), /not allowed/);
  assert.throws(() => validateUserAccountContract({ ...account, notes: 'decrypted memory payload' }), /credential-looking/);
});

test('hosted cloud validators reject forbidden financial and provider-side claims', () => {
  const billing = buildUsageBillingRecord({
    tenant_id: 'tenant_alpha',
    period_start: '2026-06-01T00:00:00.000Z',
    period_end: '2026-07-01T00:00:00.000Z',
    billing_provider_customer_ref: 'billing-customer-ref-alpha',
    usage_aggregate_ref: 'usage-aggregate-ref-alpha',
    metered_event_count: 12,
    billable_units: 34,
    amount_due_minor_units: 1234,
    generated_at: generatedAt,
    operator_evidence_refs: evidenceRefs(),
  });
  assert.throws(() => validateUsageBillingRecord({ ...billing, claim: 'token ROI is guaranteed' }), /forbidden hosted-cloud claim/);
  assert.throws(() => validateUsageBillingRecord({ ...billing, claim: 'guaranteed savings for every customer' }), /forbidden hosted-cloud claim/);
  assert.throws(() => validateUsageBillingRecord({ ...billing, claim: 'provider deletion is proven' }), /forbidden hosted-cloud claim/);
  assert.throws(() => validateUsageBillingRecord({ ...billing, claim: 'model forgetting is proven' }), /forbidden hosted-cloud claim/);
  assert.throws(() => validateUsageBillingRecord({ ...billing, token_roi_claim: true }), /not allowed/);
  assert.throws(() => validateUsageBillingRecord({ ...billing, provider_deletion_claim: true }), /not allowed/);
  assert.throws(() => validateUsageBillingRecord({ ...billing, model_forgetting_claim: true }), /not allowed/);
});

test('hosted cloud validators reject missing operator evidence refs across surfaces', () => {
  const vault = buildHostedVaultContract({
    tenant_id: 'tenant_alpha',
    vault_ref: 'vault-ref-alpha',
    storage_ref: 'storage-ref-alpha',
    kms_key_ref: 'kms-ref-alpha',
    backup_policy_ref: 'backup-policy-ref-alpha',
    retention_policy_ref: 'retention-ref-alpha',
    generated_at: generatedAt,
    operator_evidence_refs: evidenceRefs(),
  });
  const missingTopLevel = { ...vault };
  delete missingTopLevel.operator_evidence_refs;
  assert.throws(() => validateHostedVaultContract(missingTopLevel), /operator_evidence_refs must be present/);

  const missingOneRef = structuredClone(vault);
  delete missingOneRef.operator_evidence_refs.billing_provider;
  assert.throws(() => validateHostedVaultContract(missingOneRef), /operator_evidence_refs\.billing_provider must be present/);

  const mismatchedReadiness = structuredClone(vault);
  mismatchedReadiness.readiness.external_blockers = [];
  assert.throws(() => validateHostedVaultContract(mismatchedReadiness), /readiness\.external_blockers/);
});

test('hosted cloud validators cover dashboard, backup drill, incident refs, and api key contracts', () => {
  const apiKey = buildApiKeyContract({
    tenant_id: 'tenant_alpha',
    subject_ref: 'subject-ref-1',
    key_fingerprint: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    scopes: ['vault.read'],
    issued_at: issuedAt,
    rotation_ref: 'rotation-ref-alpha',
    generated_at: generatedAt,
    operator_evidence_refs: evidenceRefs(),
  });
  const backup = buildBackupDrillContract({
    tenant_id: 'tenant_alpha',
    vault_ref: 'vault-ref-alpha',
    performed_at: performedAt,
    backup_snapshot_ref: 'backup-snapshot-ref-alpha',
    restore_evidence_ref: 'restore-evidence-ref-alpha',
    rpo_minutes: 15,
    rto_minutes: 60,
    generated_at: generatedAt,
    operator_evidence_refs: evidenceRefs(),
  });
  const incidentSla = buildIncidentSlaRefs({
    tenant_id: 'tenant_alpha',
    incident_response_ref: 'incident-response-ref-alpha',
    sla_policy_ref: 'sla-policy-ref-alpha',
    support_owner_ref: 'support-owner-ref-alpha',
    escalation_policy_ref: 'escalation-policy-ref-alpha',
    status_page_ref: 'status-page-ref-alpha',
    generated_at: generatedAt,
    operator_evidence_refs: evidenceRefs(),
  });
  const dashboard = buildDashboardSummary({
    tenant_id: 'tenant_alpha',
    generated_at: generatedAt,
    account_count: 1,
    active_api_key_count: 1,
    hosted_vault_count: 1,
    billing_period_ref: 'billing-ref-alpha',
    open_incident_count: 0,
    backup_drill_ref: backup.backup_drill_id,
    incident_sla_ref: incidentSla.incident_sla_id,
    operator_evidence_refs: evidenceRefs(),
  });

  assert.equal(validateApiKeyContract(apiKey), true);
  assert.equal(validateBackupDrillContract(backup), true);
  assert.equal(validateIncidentSlaRefs(incidentSla), true);
  assert.equal(validateDashboardSummary(dashboard), true);
  assert.throws(() => validateApiKeyContract({ ...apiKey, api_key_value: 'not-key-material' }), /not allowed/);
  assert.throws(() => validateBackupDrillContract({ ...backup, recovery_boundary: { ...backup.recovery_boundary, restore_operator_verified: 'yes' } }), /restore_operator_verified/);
  assert.throws(() => validateIncidentSlaRefs({ ...incidentSla, support_owner_ref: '' }), /support_owner_ref/);
  assert.throws(() => validateDashboardSummary({ ...dashboard, account_count: -1 }), /account_count/);
});

test('hosted customer lifecycle packet is blocked by default', () => {
  const packet = buildCustomerLifecyclePacket({
    tenant_id: 'tenant_alpha',
    domain: 'cloud.enigmamemory.example',
    environment: 'production',
    generated_at: generatedAt,
  });

  assert.equal(packet.schema, HOSTED_CLOUD_CUSTOMER_LIFECYCLE_PACKET_SCHEMA);
  assert.deepEqual(packet.lifecycle_phases.map(({ phase }) => phase), HOSTED_CLOUD_CUSTOMER_LIFECYCLE_PHASES);
  assert.equal(packet.hosted_cloud_sellable, false);
  assert.equal(packet.readiness.hosted_cloud_sellable, false);
  assert.match(packet.readiness.status, /blocked/);
  assert.equal(packet.missing_surface_refs.length, 8);
  assert.ok(packet.missing_evidence_refs.length >= HOSTED_CLOUD_EXTERNAL_BLOCKERS.length);
  assert.equal(packet.guarantees.customer_content_absent, true);
  assert.equal(packet.guarantees.auth_material_absent, true);
  assert.equal(packet.guarantees.provider_payloads_absent, true);
  assert.equal(packet.public_safety_guarantees.customer_content_absent, true);
  assert.equal(packet.public_safety_guarantees.auth_material_absent, true);
  assert.equal(validateCustomerLifecyclePacket(packet), true);
});

test('hosted customer lifecycle packet validates complete refs with operator go-live approval', () => {
  const packet = buildCustomerLifecyclePacket({
    tenant_id: 'tenant_alpha',
    domain: 'cloud.enigmamemory.example',
    environment: 'production',
    generated_at: generatedAt,
    contracts: lifecycleContracts('provided'),
    required_evidence_refs: lifecycleEvidenceRefs('provided'),
    operator_go_live_ref: 'approval:hosted-cloud-go-live:2026-06-25',
  });

  assert.equal(packet.schema, HOSTED_CLOUD_CUSTOMER_LIFECYCLE_PACKET_SCHEMA);
  assert.deepEqual(packet.lifecycle_phases.map(({ phase }) => phase), HOSTED_CLOUD_CUSTOMER_LIFECYCLE_PHASES);
  assert.deepEqual(packet.missing_surface_refs, []);
  assert.deepEqual(packet.missing_evidence_refs, []);
  assert.deepEqual(packet.external_blockers, []);
  assert.equal(packet.operator_go_live_ref, 'approval:hosted-cloud-go-live:2026-06-25');
  assert.equal(packet.readiness.status, 'operator_approved_evidence_packet');
  assert.equal(packet.readiness.hosted_cloud_sellable, true);
  assert.equal(packet.hosted_cloud_sellable, true);
  assert.equal(validateCustomerLifecyclePacket(packet), true);
});

test('hosted customer lifecycle packet is unsellable without operator go-live approval', () => {
  const packet = buildCustomerLifecyclePacket({
    tenant_id: 'tenant_alpha',
    domain: 'cloud.enigmamemory.example',
    environment: 'production',
    generated_at: generatedAt,
    contracts: lifecycleContracts('provided'),
    required_evidence_refs: lifecycleEvidenceRefs('provided'),
  });

  assert.deepEqual(packet.missing_surface_refs, []);
  assert.deepEqual(packet.missing_evidence_refs, []);
  assert.equal(packet.operator_go_live_ref, null);
  assert.equal(packet.readiness.operator_go_live_approved, false);
  assert.equal(packet.readiness.hosted_cloud_sellable, false);
  assert.equal(packet.hosted_cloud_sellable, false);
  assert.equal(validateCustomerLifecyclePacket(packet), true);
});

test('hosted customer lifecycle packet rejects raw memory, secrets, provider payloads, and forbidden claims', () => {
  const packet = buildCustomerLifecyclePacket({
    tenant_id: 'tenant_alpha',
    domain: 'cloud.enigmamemory.example',
    environment: 'production',
    generated_at: generatedAt,
    contracts: lifecycleContracts('provided'),
    required_evidence_refs: lifecycleEvidenceRefs('provided'),
    operator_go_live_ref: 'approval:hosted-cloud-go-live:2026-06-25',
  });

  for (const [key, value, pattern] of [
    ['raw_memory', 'customer plaintext memory', /not allowed/],
    ['plaintext_prompt', 'private prompt: summarize this customer account', /not allowed/],
    ['provider_response', { id: 'resp_1', output: 'provider response body' }, /not allowed/],
    ['api_key_value', 'not-key-material', /not allowed/],
    ['credential_note', 'decrypted memory payload', /not allowed|credential-looking/],
    ['secret_material', 'api key secret material', /not allowed|credential-looking/],
    ['financial_claim', 'token ROI is guaranteed', /forbidden hosted-cloud claim/],
    ['provider_deletion_claim', 'provider deletion is proven', /not allowed|forbidden hosted-cloud claim/],
    ['model_forgetting_claim', 'model forgetting is proven', /not allowed|forbidden hosted-cloud claim/],
  ]) {
    assert.throws(() => validateCustomerLifecyclePacket({ ...packet, [key]: value }), pattern);
  }
});

test('hosted customer lifecycle packet rejects missing lifecycle surfaces', () => {
  const packet = buildCustomerLifecyclePacket({
    tenant_id: 'tenant_alpha',
    domain: 'cloud.enigmamemory.example',
    environment: 'production',
    generated_at: generatedAt,
    contracts: lifecycleContracts('provided'),
    required_evidence_refs: lifecycleEvidenceRefs('provided'),
    operator_go_live_ref: 'approval:hosted-cloud-go-live:2026-06-25',
  });
  const missingDashboard = structuredClone(packet);
  delete missingDashboard.contracts.dashboard;

  assert.throws(() => validateCustomerLifecyclePacket(missingDashboard), /contracts\.dashboard|missing_surface_refs/);
});
