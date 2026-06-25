import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOSTED_CUSTOMER_LIFECYCLE_EVIDENCE_KEYS,
  HOSTED_CUSTOMER_LIFECYCLE_PACKET_SCHEMA,
  HOSTED_CUSTOMER_LIFECYCLE_RELEASE_TARGET,
  buildHostedCustomerLifecyclePacket,
  parseEvidenceRef,
} from '../scripts/build-hosted-customer-lifecycle.mjs';
import { validateCustomerLifecyclePacket } from '../packages/hosted-cloud/src/index.js';

function providedEvidenceRefs() {
  return HOSTED_CUSTOMER_LIFECYCLE_EVIDENCE_KEYS.map((key) => `${key}=provided:evidence:${key}:2026-06-25`);
}

test('hosted customer lifecycle script packet is blocked by default', () => {
  const packet = buildHostedCustomerLifecyclePacket({
    tenant: 'tenant_alpha',
    domain: 'cloud.enigmamemory.example',
    environment: 'production',
    generatedAt: '2026-06-25T00:00:00.000Z',
  });

  assert.equal(packet.schema, HOSTED_CUSTOMER_LIFECYCLE_PACKET_SCHEMA);
  assert.equal(packet.release_target, HOSTED_CUSTOMER_LIFECYCLE_RELEASE_TARGET);
  assert.match(packet.readiness.status, /blocked/);
  assert.equal(packet.readiness.hosted_cloud_sellable, false);
  assert.equal(packet.readiness.evidence_validation_only, true);
  assert.equal(packet.readiness.no_external_provider_calls, true);
  assert.equal(packet.guarantees.customer_content_absent, true);
  assert.equal(packet.guarantees.auth_material_absent, true);
  assert.equal(packet.boundary.deploys_or_calls_external_providers, false);
  assert.equal(packet.boundary.sensitive_material_written, false);
  assert.ok(packet.readiness.missing_evidence_refs.length > 0);
  assert.equal(Object.keys(packet.evidence_refs).length, HOSTED_CUSTOMER_LIFECYCLE_EVIDENCE_KEYS.length);
  assert.equal(validateCustomerLifecyclePacket(packet), true);
});

test('hosted customer lifecycle script packet becomes sellable only with complete evidence and go-live ref', () => {
  const packet = buildHostedCustomerLifecyclePacket({
    tenant: 'tenant_alpha',
    domain: 'cloud.enigmamemory.example',
    environment: 'production',
    generatedAt: '2026-06-25T00:00:00.000Z',
    evidenceRefs: providedEvidenceRefs(),
    operatorGoLiveRef: 'approval:hosted-cloud-go-live:2026-06-25',
  });

  assert.equal(packet.readiness.status, 'operator_approved_evidence_packet');
  assert.equal(packet.readiness.hosted_cloud_sellable, true);
  assert.equal(packet.readiness.lifecycle_evidence_complete, true);
  assert.equal(packet.readiness.operator_go_live_approved, true);
  assert.deepEqual(packet.readiness.missing_evidence_refs, []);
  assert.deepEqual(packet.readiness.external_blockers, []);
  assert.equal(packet.boundary.aggregates_contract_validators_only, true);
  assert.equal(validateCustomerLifecyclePacket(packet), true);
});

test('hosted customer lifecycle script stays unsellable without go-live approval', () => {
  const packet = buildHostedCustomerLifecyclePacket({
    tenant: 'tenant_alpha',
    domain: 'cloud.enigmamemory.example',
    environment: 'production',
    generatedAt: '2026-06-25T00:00:00.000Z',
    evidenceRefs: providedEvidenceRefs(),
  });

  assert.match(packet.readiness.status, /blocked/);
  assert.equal(packet.readiness.hosted_cloud_sellable, false);
  assert.equal(packet.readiness.lifecycle_evidence_complete, true);
  assert.equal(packet.readiness.operator_go_live_approved, false);
  assert.deepEqual(packet.readiness.missing_evidence_refs, []);
  assert.equal(validateCustomerLifecyclePacket(packet), true);
});

test('hosted customer lifecycle script rejects unsafe evidence refs and claims', () => {
  assert.throws(() => parseEvidenceRef('tenant=provided:decrypted memory payload'), /non-public hosted-cloud material/);
  assert.throws(() => parseEvidenceRef('billing=provided:token ROI is guaranteed'), /non-public hosted-cloud material/);
  assert.throws(() => parseEvidenceRef('hosted_vault=provided:provider deletion is proven'), /non-public hosted-cloud material/);
  assert.throws(() => parseEvidenceRef('dashboard=provided:model forgetting is proven'), /non-public hosted-cloud material/);
  assert.throws(() => parseEvidenceRef('user_account=provided:provider response body'), /non-public hosted-cloud material/);
  assert.throws(() => parseEvidenceRef('unknown=provided:evidence:unknown'), /evidence key must be one of/);
});

test('hosted customer lifecycle CLI writes public-safe packet output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-hosted-customer-lifecycle-'));
  try {
    const outPath = join(dir, 'hosted-customer-lifecycle.json');
    const evidenceArgs = providedEvidenceRefs().flatMap((ref) => ['--evidence-ref', ref]);
    const run = spawnSync(process.execPath, [
      'scripts/build-hosted-customer-lifecycle.mjs',
      '--tenant', 'tenant_alpha',
      '--domain', 'cloud.enigmamemory.example',
      '--environment', 'production',
      '--operator-go-live-ref', 'approval:hosted-cloud-go-live:2026-06-25',
      ...evidenceArgs,
      '--out', outPath,
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
      windowsHide: true,
    });

    assert.equal(run.status, 0, run.stderr);
    assert.doesNotMatch(run.stdout, /Bearer|PRIVATE KEY|sk-|raw memory|provider response|token ROI/i);
    const stdoutPacket = JSON.parse(run.stdout);
    const filePacket = JSON.parse(await readFile(outPath, 'utf8'));
    assert.equal(stdoutPacket.schema, HOSTED_CUSTOMER_LIFECYCLE_PACKET_SCHEMA);
    assert.equal(filePacket.schema, HOSTED_CUSTOMER_LIFECYCLE_PACKET_SCHEMA);
    assert.equal(filePacket.readiness.hosted_cloud_sellable, true);
    assert.equal(filePacket.boundary.deploys_or_calls_external_providers, false);
    assert.equal(validateCustomerLifecyclePacket(filePacket), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
