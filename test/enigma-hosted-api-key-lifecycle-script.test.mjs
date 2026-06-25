import { readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOSTED_API_KEY_LIFECYCLE_PACKET_SCHEMA,
  HOSTED_API_KEY_LIFECYCLE_RELEASE_TARGET,
  buildHostedApiKeyLifecyclePacket,
  parseEvidenceRef,
} from '../scripts/build-hosted-api-key-lifecycle.mjs';
import { validateApiKeyLifecyclePacket } from '../packages/hosted-cloud/src/index.js';

const rotateEvidenceKeys = ['current_key_metadata', 'next_key_metadata', 'rotation_policy', 'audit_log'];

function providedRotateEvidenceRefs() {
  return rotateEvidenceKeys.map((key) => `${key}=provided:evidence:api-key:rotate:${key}:2026-06-25`);
}

function corePacketFromScriptPacket(packet) {
  const { boundary, ...corePacket } = packet;
  return corePacket;
}

test('hosted API key lifecycle script packet is blocked by default', () => {
  const packet = buildHostedApiKeyLifecyclePacket({
    tenant: 'tenant_alpha',
    subject: 'subject-ref-1',
    operation: 'audit',
    generatedAt: '2026-06-25T00:00:00.000Z',
  });

  assert.equal(packet.schema, HOSTED_API_KEY_LIFECYCLE_PACKET_SCHEMA);
  assert.equal(packet.release_target, HOSTED_API_KEY_LIFECYCLE_RELEASE_TARGET);
  assert.match(packet.readiness.status, /blocked/);
  assert.equal(packet.readiness.customer_api_keys_live, false);
  assert.equal(packet.readiness.evidence_validation_only, true);
  assert.equal(packet.readiness.no_external_provider_calls, true);
  assert.equal(packet.readiness.actual_key_issuance, false);
  assert.equal(packet.boundary.deploys_or_calls_external_providers, false);
  assert.equal(packet.boundary.sensitive_material_written, false);
  assert.equal(packet.public_safety_guarantees.api_key_material_absent, true);
  assert.ok(packet.readiness.missing_evidence_refs.length > 0);
  assert.equal(validateApiKeyLifecyclePacket(corePacketFromScriptPacket(packet)), true);
});

test('hosted API key lifecycle script becomes live-ready only with evidence and operator approval', () => {
  const packet = buildHostedApiKeyLifecyclePacket({
    tenant: 'tenant_alpha',
    subject: 'subject-ref-1',
    operation: 'rotate',
    generatedAt: '2026-06-25T00:00:00.000Z',
    evidenceRefs: providedRotateEvidenceRefs(),
    operatorApprovalRef: 'approval:hosted-api-key-lifecycle:2026-06-25',
  });

  assert.equal(packet.readiness.status, 'operator_approved_api_key_lifecycle_evidence');
  assert.equal(packet.readiness.customer_api_keys_live, true);
  assert.equal(packet.customer_api_keys_live, true);
  assert.equal(packet.readiness.lifecycle_evidence_complete, true);
  assert.equal(packet.readiness.operator_approval_provided, true);
  assert.deepEqual(packet.readiness.missing_evidence_refs, []);
  assert.deepEqual(packet.readiness.external_blockers, []);
  assert.equal(packet.boundary.evidence_validation_only, true);
  assert.equal(packet.boundary.provider_wiring_performed, false);
  assert.equal(validateApiKeyLifecyclePacket(corePacketFromScriptPacket(packet)), true);
});

test('hosted API key lifecycle script rejects unsafe evidence refs and malformed operation surfaces', () => {
  assert.throws(() => parseEvidenceRef('current_key_metadata=provided:api key material'), /non-public hosted-cloud material/);
  assert.throws(() => parseEvidenceRef('next_key_metadata=provided:provider response body'), /non-public hosted-cloud material/);
  assert.throws(() => parseEvidenceRef('rotation_policy=provided:token ROI is guaranteed'), /non-public hosted-cloud material/);
  assert.throws(() => parseEvidenceRef('audit_log=provided:provider deletion is proven'), /non-public hosted-cloud material/);
  assert.throws(() => parseEvidenceRef('audit_log=provided:model forgetting is proven'), /non-public hosted-cloud material/);
  assert.throws(() => parseEvidenceRef('unknown=provided:evidence:unknown'), /evidence key must be one of/);
  assert.throws(() => buildHostedApiKeyLifecyclePacket({ operation: 'mint' }), /operation must be issue, rotate, revoke, or audit/);
  assert.throws(() => buildHostedApiKeyLifecyclePacket({ operation: 'audit', evidenceRefs: ['rotation_policy=provided:evidence:wrong-operation'] }), /not required for audit/);
});

test('hosted API key lifecycle CLI writes public-safe packet output', async () => {
  const outPath = `.hosted-api-key-lifecycle-${Date.now()}-${Math.random().toString(16).slice(2)}.json`;
  try {
    const evidenceArgs = providedRotateEvidenceRefs().flatMap((ref) => ['--evidence-ref', ref]);
    const run = spawnSync(process.execPath, [
      'scripts/build-hosted-api-key-lifecycle.mjs',
      '--tenant', 'tenant_alpha',
      '--subject', 'subject-ref-1',
      '--operation', 'rotate',
      '--scope', 'vault.read',
      '--operator-approval-ref', 'approval:hosted-api-key-lifecycle:2026-06-25',
      ...evidenceArgs,
      '--out', outPath,
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
      windowsHide: true,
    });

    assert.equal(run.status, 0, run.stderr);
    assert.doesNotMatch(run.stdout, /Bearer|PRIVATE KEY|sk-|raw memory|provider response|token ROI|api key secret/i);
    const stdoutPacket = JSON.parse(run.stdout);
    const filePacket = JSON.parse(await readFile(outPath, 'utf8'));
    assert.equal(stdoutPacket.schema, HOSTED_API_KEY_LIFECYCLE_PACKET_SCHEMA);
    assert.equal(filePacket.schema, HOSTED_API_KEY_LIFECYCLE_PACKET_SCHEMA);
    assert.equal(filePacket.customer_api_keys_live, true);
    assert.equal(filePacket.boundary.deploys_or_calls_external_providers, false);
    assert.equal(filePacket.boundary.sensitive_material_written, false);
    assert.equal(validateApiKeyLifecyclePacket(corePacketFromScriptPacket(filePacket)), true);
  } finally {
    await rm(outPath, { force: true });
  }
});
