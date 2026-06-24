import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOSTED_READINESS_REQUIRED_DEPENDENCIES,
  PRODUCTION_DEPENDENCY_EVIDENCE_SCHEMA,
  PRODUCTION_DEPENDENCY_KEYS,
  assertNoSecretEvidence,
  missingProductionDependencies,
  normalizeDependencyEvidence,
  normalizeEvidenceRef,
  readinessEvidenceRefs,
} from '../packages/adapters/src/index.js';
import * as adapterPackage from '@enigma-ai/enigma/adapters';

const OBSERVED_AT = '2026-06-23T12:00:00.000Z';

function completeEvidence() {
  return Object.fromEntries(HOSTED_READINESS_REQUIRED_DEPENDENCIES.map((key) => [key, {
    status: key === 'operator_acceptance' ? 'go' : 'verified',
    provider: 'fixture',
    ref: `fixture://${key}/verified`,
    observed_at: OBSERVED_AT,
    metadata: { environment: 'test', immutable: true },
  }]));
}

test('adapter package export mirrors direct source export', () => {
  assert.equal(adapterPackage.PRODUCTION_DEPENDENCY_EVIDENCE_SCHEMA, PRODUCTION_DEPENDENCY_EVIDENCE_SCHEMA);
  assert.equal(typeof adapterPackage.normalizeDependencyEvidence, 'function');
  assert.ok(PRODUCTION_DEPENDENCY_KEYS.includes('durable_storage'));
  assert.ok(PRODUCTION_DEPENDENCY_KEYS.includes('service_settlement'));
  assert.ok(PRODUCTION_DEPENDENCY_KEYS.includes('public_site_security'));
  assert.ok(HOSTED_READINESS_REQUIRED_DEPENDENCIES.includes('public_site_security'));
  assert.ok(PRODUCTION_DEPENDENCY_KEYS.includes('security_threat_model'));
  assert.ok(HOSTED_READINESS_REQUIRED_DEPENDENCIES.includes('security_threat_model'));
  assert.ok(HOSTED_READINESS_REQUIRED_DEPENDENCIES.includes('legal_compliance_approval'));
});

test('normalizes safe production dependency references without secrets', () => {
  const evidence = normalizeDependencyEvidence(completeEvidence(), { generated_at: OBSERVED_AT });
  assert.equal(evidence.schema, PRODUCTION_DEPENDENCY_EVIDENCE_SCHEMA);
  assert.equal(evidence.ok, true);
  assert.deepEqual(evidence.missing_keys, []);
  assert.equal(evidence.evidence.durable_storage.ref, 'fixture://durable_storage/verified');
  assertNoSecretEvidence(evidence);
  const refs = readinessEvidenceRefs(evidence.evidence);
  assert.equal(refs.backend_host, 'fixture://backend_host/verified');
});

test('declared or absent required dependency refs keep hosted readiness incomplete', () => {
  const partial = completeEvidence();
  delete partial.backup_restore;
  partial.monitoring = { status: 'declared', provider: 'fixture', ref: 'fixture://monitoring/planned', observed_at: OBSERVED_AT };
  const evidence = normalizeDependencyEvidence(partial, { generated_at: OBSERVED_AT });
  assert.equal(evidence.ok, false);
  assert.deepEqual([...evidence.missing_keys].sort(), ['backup_restore', 'monitoring'].sort());
  assert.deepEqual([...missingProductionDependencies(evidence.evidence)].sort(), ['backup_restore', 'monitoring'].sort());
  assert.match(evidence.claim_boundary.join(' '), /hosted_live_ready remains false/i);
});

test('rejects secret-looking refs fields and values', () => {
  assert.throws(
    () => normalizeEvidenceRef({ ref: 'https://user:password@example.invalid/db', status: 'verified' }, { key: 'durable_storage', observed_at: OBSERVED_AT }),
    /URL credentials|secret/i,
  );
  assert.throws(
    () => normalizeEvidenceRef({ ref: 'fixture://safe', status: 'verified', metadata: { token: 'abc' } }, { key: 'backend_host', observed_at: OBSERVED_AT }),
    /forbidden secret/i,
  );
  assert.throws(
    () => normalizeEvidenceRef({ ref: 'Bearer secret_token_value_12345', status: 'verified' }, { key: 'runtime_auth', observed_at: OBSERVED_AT }),
    /secret/i,
  );
  assert.throws(
    () => assertNoSecretEvidence({ public: { raw_memory: 'customer note' } }),
    /forbidden secret|raw memory/i,
  );
});

test('fails closed on unknown keys and invalid public metadata', () => {
  assert.throws(
    () => normalizeDependencyEvidence({ unknown_dependency: 'fixture://x' }, { generated_at: OBSERVED_AT }),
    /Unknown production dependency key/,
  );
  assert.throws(
    () => normalizeEvidenceRef({ ref: 'fixture://x', status: 'done' }, { key: 'backend_host', observed_at: OBSERVED_AT }),
    /status is unsupported/,
  );
  assert.throws(
    () => normalizeEvidenceRef({ ref: 'fixture://x', status: 'verified', metadata: { nested: { ref: 'x' } } }, { key: 'backend_host', observed_at: OBSERVED_AT }),
    /primitive public value/,
  );
});
