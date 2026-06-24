import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createEnterprisePolicy } from '../packages/enterprise/src/index.js';
import {
  TENANT_POLICY_APPROVAL_RESULT_SCHEMA,
  TENANT_POLICY_APPROVAL_SCHEMA,
  validateTenantPolicyApproval,
} from '../scripts/validate-tenant-policy-approval.mjs';

const execFileAsync = promisify(execFile);

function enterprisePolicy() {
  return createEnterprisePolicy({
    policy_id: 'tenant-policy-fixture',
    tenant_id: 'enigma-fixture',
    mode: 'byoc',
    created_at: '2026-06-23T12:00:00.000Z',
    updated_at: '2026-06-23T12:00:00.000Z',
    allowed_operations: ['retrieve', 'remember', 'write', 'delete'],
    allowed_providers: ['openai', 'anthropic'],
    allowed_models: ['gpt-5.5', 'claude-opus'],
    allowed_regions: ['us'],
    denied_sensitivities: ['restricted'],
    allowed_purposes: ['user_memory', 'operator_review'],
    legal_holds: ['legal-hold-fixture'],
    retention_days: 365,
    kms: { key_ref: 'kms://tenant-policy/key-ref' },
  });
}

function completeApproval() {
  const policy = enterprisePolicy();
  return {
    schema: TENANT_POLICY_APPROVAL_SCHEMA,
    metadata: {
      approval_id: 'tenant-policy-approval-fixture',
      environment: 'production-fixture',
      tenant: 'enigma-fixture',
      owner: 'tenant-policy-owner',
      approved_at: '2026-06-23T12:00:00.000Z',
      approval_ref: 'ticket://tenant-policy/approved',
      status: 'approved',
    },
    enterprise_policy: policy,
    approval: {
      policy_owner: 'tenant-policy-owner',
      approver: 'security-owner',
      approval_ref: 'ticket://tenant-policy/approved',
      approved_at: '2026-06-23T12:00:00.000Z',
      rollback_policy_hash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      rollback_ref: 'policy://tenant-policy/rollback',
      status: 'approved',
    },
    retention_deletion: {
      retention_days: policy.retention_days,
      tombstone_receipt_required: true,
      legal_hold_delete_blocks: true,
      provider_deletion_claimed: false,
      tombstone_receipt_ref: 'receipt://tenant-policy/tombstone-required',
      legal_hold_policy_ref: 'policy://tenant-policy/legal-hold',
      audit_route_ref: 'audit://tenant-policy/deletion',
      retention_policy_ref: 'policy://tenant-policy/retention',
    },
    audit_controls: {
      gateway_decision_required: true,
      siem_event_required: true,
      minimized_events_only: true,
      gateway_decision_ref: 'gateway://decision/required',
      siem_event_ref: 'siem://event/required',
      evidence_retention_ref: 'policy://audit/evidence-retention',
      review_ref: 'review://audit/tenant-policy',
    },
    change_control: {
      change_ticket_ref: 'ticket://change/tenant-policy',
      canary_ref: 'deploy://canary/tenant-policy',
      rollback_ref: 'deploy://rollback/tenant-policy',
      emergency_freeze_ref: 'runbook://freeze/tenant-policy',
      owner: 'tenant-policy-owner',
      force_push_allowed: false,
    },
  };
}

test('tenant policy validator accepts complete policy approval', () => {
  const result = validateTenantPolicyApproval(completeApproval(), { generated_at: '2026-06-23T12:00:00.000Z' });
  assert.equal(result.schema, TENANT_POLICY_APPROVAL_RESULT_SCHEMA);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'accepted');
  assert.deepEqual(result.blockers, []);
  assert.equal(result.checked.enterprise_policy, true);
  assert.match(result.checked.policy_hash, /^sha256:[0-9a-f]{64}$/);
});

test('tenant policy validator blocks unsafe policy posture', () => {
  const approval = completeApproval();
  approval.enterprise_policy.default_action = 'allow';
  approval.enterprise_policy.provider_native_memory = 'persistent';
  approval.retention_deletion.provider_deletion_claimed = true;
  approval.audit_controls.minimized_events_only = false;
  approval.change_control.force_push_allowed = true;
  const result = validateTenantPolicyApproval(approval);
  assert.equal(result.ok, false);
  const messages = result.blockers.map((entry) => entry.message).join('\n');
  assert.match(messages, /deny_unknown/);
  assert.match(messages, /cache_only/);
  assert.match(messages, /provider_deletion_claimed/);
  assert.match(messages, /minimized_events_only/);
  assert.match(messages, /force_push_allowed/);
});

test('tenant policy validator rejects secrets and raw memory', () => {
  const withSecret = completeApproval();
  withSecret.approval.approval_ref = 'https://user:password@example.invalid/policy';
  assert.throws(() => validateTenantPolicyApproval(withSecret), /secret|raw-memory/i);

  const withBadField = completeApproval();
  withBadField.enterprise_policy.raw_memory = 'private prompt';
  assert.throws(() => validateTenantPolicyApproval(withBadField), /forbidden field|secret|raw-memory/i);
});

test('tenant policy CLI returns blocked result for invalid approval', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-tenant-policy-'));
  const approval = completeApproval();
  approval.retention_deletion.retention_days = 7;
  const path = join(dir, 'tenant-policy.json');
  await writeFile(path, `${JSON.stringify(approval, null, 2)}\n`, 'utf8');
  const result = await execFileAsync(process.execPath, [
    'scripts/validate-tenant-policy-approval.mjs',
    '--approval',
    path,
  ], { cwd: process.cwd(), timeout: 10000, windowsHide: true }).catch((error) => error);
  assert.equal(result.code, 1);
  assert.equal(result.stderr, '');
  const output = JSON.parse(result.stdout);
  assert.equal(output.schema, TENANT_POLICY_APPROVAL_RESULT_SCHEMA);
  assert.equal(output.ok, false);
  assert.match(JSON.stringify(output.blockers), /retention_days/);
  assert.doesNotMatch(result.stdout, /Bearer\s+[A-Za-z0-9._~+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@/i);
});
