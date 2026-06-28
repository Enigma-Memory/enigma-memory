import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONSENT_GRANT_SCHEMA,
  MEMORY_CONTROLLER_GRANT_SCHEMA,
  RECALL_VETO_DECISION_SCHEMA,
  PRIVATE_MEMORY_BUBBLE_SCHEMA,
  MEMORY_WEATHER_REPORT_SCHEMA,
  createConsentGrant,
  verifyConsentGrant,
  createRecallVetoDecision,
  createPrivateMemoryBubble,
  closePrivateMemoryBubble,
  createMemoryWeatherReport,
  assertMemoryControllerPublicSafe
} from '../packages/controller/src/index.js';

const NOW = '2026-06-28T12:00:00.000Z';
const LATER = '2026-06-28T12:05:00.000Z';
const UNSAFE_MEMORY_FIELD = ['raw', 'memory'].join('_');
const UNSAFE_IDENTITY_FIELD = ['account', 'id'].join('_');

const BOUNDARY_KEYS = Object.freeze([
  'public_payload_only',
  'memory_payload_absent',
  'prompt_payload_absent',
  'transcript_payload_absent',
  'embedding_payload_absent',
  'provider_output_absent',
  'secret_material_absent',
  'device_path_absent',
  'account_identifier_absent',
  'customer_identifier_absent',
  'evidence_refs_only',
  'provider_deletion_claim',
  'model_forgetting_claim',
  'provider_native_memory_control_claim',
  'compliance_certification_claim'
]);

function grantOptions(overrides = {}) {
  return {
    issued_at: NOW,
    expires_at: LATER,
    app_ref: 'ref:app:notes',
    purpose_ref: 'ref:purpose:briefing',
    operations: ['recall_context', 'read_local'],
    memory_zone_refs: ['ref:zone:work', 'ref:zone:archive'],
    policy_ref: 'ref:policy:jit-consent',
    proof_refs: ['ref:proof:grant'],
    receipt_refs: ['ref:receipt:grant'],
    ...overrides
  };
}

function assertBoundaryBooleans(value) {
  for (const key of BOUNDARY_KEYS) assert.equal(Object.hasOwn(value, key), true, `${key} missing`);
  assert.equal(value.public_payload_only, true);
  assert.equal(value.memory_payload_absent, true);
  assert.equal(value.prompt_payload_absent, true);
  assert.equal(value.transcript_payload_absent, true);
  assert.equal(value.embedding_payload_absent, true);
  assert.equal(value.provider_output_absent, true);
  assert.equal(value.secret_material_absent, true);
  assert.equal(value.device_path_absent, true);
  assert.equal(value.account_identifier_absent, true);
  assert.equal(value.customer_identifier_absent, true);
  assert.equal(value.evidence_refs_only, true);
  assert.equal(value.provider_deletion_claim, false);
  assert.equal(value.model_forgetting_claim, false);
  assert.equal(value.provider_native_memory_control_claim, false);
  assert.equal(value.compliance_certification_claim, false);
}

test('consent grants use schema fields and verify array scopes', () => {
  const grant = createConsentGrant(grantOptions());
  assert.equal(grant.schema, CONSENT_GRANT_SCHEMA);
  assert.equal(CONSENT_GRANT_SCHEMA, MEMORY_CONTROLLER_GRANT_SCHEMA);
  assert.deepEqual(Object.keys(grant).sort(), [
    ...BOUNDARY_KEYS,
    'app_ref',
    'expires_at',
    'grant_ref',
    'issued_at',
    'memory_zone_refs',
    'operations',
    'policy_ref',
    'proof_refs',
    'purpose_ref',
    'receipt_refs',
    'schema',
    'status'
  ].sort());
  assert.equal(grant.status, 'active');
  assert.deepEqual(grant.operations, ['read_local', 'recall_context'].sort());
  assert.deepEqual(grant.memory_zone_refs, ['ref:zone:archive', 'ref:zone:work']);
  assertBoundaryBooleans(grant);

  assert.equal(verifyConsentGrant(grant, grantOptions({ operation: 'recall_context', memory_zone_ref: 'ref:zone:work' })).ok, true);
  assert.deepEqual(
    verifyConsentGrant(grant, grantOptions({ app_ref: 'ref:app:other', operation: 'recall_context', memory_zone_ref: 'ref:zone:work' })).reason_codes,
    ['WRONG_APP']
  );
  assert.ok(verifyConsentGrant(grant, grantOptions({ operation: 'write_local', memory_zone_ref: 'ref:zone:work' })).reason_codes.includes('WRONG_OPERATION'));
  assert.ok(verifyConsentGrant(grant, grantOptions({ operation: 'recall_context', memory_zone_ref: 'ref:zone:other' })).reason_codes.includes('WRONG_MEMORY_ZONE'));
  assert.ok(verifyConsentGrant(grant, grantOptions({ now: LATER, operation: 'recall_context', memory_zone_ref: 'ref:zone:work' })).reason_codes.includes('EXPIRED'));
  assert.ok(verifyConsentGrant({ ...grant, status: 'revoked' }, grantOptions({ operation: 'recall_context', memory_zone_ref: 'ref:zone:work' })).reason_codes.includes('REVOKED'));
  assert.ok(verifyConsentGrant({ ...grant, [UNSAFE_MEMORY_FIELD]: 'ref:blocked' }, grantOptions()).reason_codes.includes('NON_PUBLIC_SAFE_ARTIFACT'));
});

test('recall veto decisions emit schema counts, refs, safety, and lower-case reasons', () => {
  const grant = createConsentGrant(grantOptions());
  const covered = createRecallVetoDecision({ ...grantOptions(), grant, operation: 'recall_context', memory_zone_ref: 'ref:zone:work', candidate_count: 2 });
  assert.equal(covered.schema, RECALL_VETO_DECISION_SCHEMA);
  assert.deepEqual(Object.keys(covered).sort(), [
    ...BOUNDARY_KEYS,
    'app_ref',
    'candidate_count',
    'decision',
    'grant_refs',
    'policy_ref',
    'proof_refs',
    'reason_codes',
    'receipt_refs',
    'request_ref',
    'safe_to_share',
    'schema',
    'sensitive_count',
    'tombstone_count'
  ].sort());
  assert.equal(covered.decision, 'allow');
  assert.equal(covered.safe_to_share, true);
  assert.deepEqual(covered.reason_codes, []);
  assert.deepEqual(covered.grant_refs, [grant.grant_ref]);
  assert.equal(covered.candidate_count, 2);
  assert.equal(covered.sensitive_count, 0);
  assert.equal(covered.tombstone_count, 0);
  assertBoundaryBooleans(covered);

  const missing = createRecallVetoDecision({ ...grantOptions(), operation: 'recall_context', memory_zone_ref: 'ref:zone:work', candidate_count: 1 });
  assert.equal(missing.decision, 'ask');
  assert.equal(missing.safe_to_share, false);
  assert.deepEqual(missing.reason_codes, ['grant_missing']);

  const uncoveredZone = createRecallVetoDecision({ ...grantOptions(), grant, operation: 'recall_context', memory_zone_ref: 'ref:zone:other', candidate_count: 1 });
  assert.equal(uncoveredZone.decision, 'ask');
  assert.equal(uncoveredZone.safe_to_share, false);
  assert.deepEqual(uncoveredZone.reason_codes, ['grant_missing']);

  const tombstone = createRecallVetoDecision({ ...grantOptions(), grant, operation: 'recall_context', memory_zone_ref: 'ref:zone:work', candidate_count: 2, tombstone_count: 1 });
  assert.equal(tombstone.decision, 'deny');
  assert.equal(tombstone.safe_to_share, false);
  assert.deepEqual(tombstone.reason_codes, ['tombstone_present']);

  const expired = createRecallVetoDecision({ ...grantOptions({ now: '2026-06-28T12:10:00.000Z' }), grant, operation: 'recall_context', memory_zone_ref: 'ref:zone:work', candidate_count: 1 });
  assert.equal(expired.decision, 'deny');
  assert.ok(expired.reason_codes.includes('grant_expired'));

  const revoked = createRecallVetoDecision({ ...grantOptions(), grant: { ...grant, status: 'revoked' }, operation: 'recall_context', memory_zone_ref: 'ref:zone:work', candidate_count: 1 });
  assert.equal(revoked.decision, 'deny');
  assert.ok(revoked.reason_codes.includes('policy_denies_recall'));
});

test('private memory bubbles open and close with schema counts', () => {
  const bubble = createPrivateMemoryBubble({
    started_at: NOW,
    app_refs: ['ref:app:notes', 'ref:app:writer'],
    purpose_ref: 'ref:purpose:temporary',
    candidate_count: 3,
    receipt_refs: ['ref:receipt:bubble-open']
  });
  assert.equal(bubble.schema, PRIVATE_MEMORY_BUBBLE_SCHEMA);
  assert.deepEqual(Object.keys(bubble).sort(), [
    ...BOUNDARY_KEYS,
    'app_refs',
    'bubble_ref',
    'bubble_root',
    'candidate_count',
    'closed_at',
    'discarded_count',
    'kept_count',
    'purpose_ref',
    'receipt_refs',
    'schema',
    'started_at',
    'status'
  ].sort());
  assert.equal(bubble.status, 'open');
  assert.equal(bubble.closed_at, null);
  assert.equal(bubble.candidate_count, 3);
  assert.equal(bubble.kept_count, 0);
  assert.equal(bubble.discarded_count, 0);
  assert.match(bubble.bubble_root, /^sha256:[a-f0-9]{64}$/u);
  assertBoundaryBooleans(bubble);

  const kept = closePrivateMemoryBubble(bubble, { closed_at: LATER, outcome: 'keep', kept_count: 2, receipt_refs: ['ref:receipt:bubble-keep'] });
  assert.equal(kept.status, 'kept');
  assert.equal(kept.kept_count, 2);
  assert.equal(kept.discarded_count, 1);
  assert.equal(kept.closed_at, LATER);
  assert.equal(bubble.status, 'open');

  const discarded = closePrivateMemoryBubble(bubble, { closed_at: LATER, outcome: 'discard' });
  assert.equal(discarded.status, 'discarded');
  assert.equal(discarded.kept_count, 0);
  assert.equal(discarded.discarded_count, 3);
});

test('memory weather reports emit schema tiles, issue codes, and next actions', () => {
  const sunny = createMemoryWeatherReport({
    generated_at: NOW,
    tiles: [{ tile_ref: 'ref:tile:vault', status: 'sunny', metric: 'active_grants', count: 1, evidence_refs: ['ref:evidence:vault'] }]
  });
  assert.equal(sunny.schema, MEMORY_WEATHER_REPORT_SCHEMA);
  assert.deepEqual(Object.keys(sunny).sort(), [
    ...BOUNDARY_KEYS,
    'evidence_refs',
    'generated_at',
    'issue_codes',
    'next_action',
    'schema',
    'status',
    'tiles'
  ].sort());
  assert.equal(sunny.status, 'sunny');
  assert.deepEqual(sunny.issue_codes, []);
  assert.equal(sunny.next_action, 'none');
  assert.deepEqual(sunny.evidence_refs, ['ref:evidence:vault']);
  assertBoundaryBooleans(sunny);

  const storm = createMemoryWeatherReport({
    generated_at: NOW,
    tiles: [
      { tile_ref: 'ref:tile:vault', status: 'sunny', metric: 'active_grants', count: 1, evidence_refs: ['ref:evidence:vault'] },
      { tile_ref: 'ref:tile:recall', status: 'needs_review', metric: 'recent_vetoes', count: 2, evidence_refs: ['ref:evidence:recall'] },
      { tile_ref: 'ref:tile:receipts', status: 'blocked', metric: 'receipt_coverage', count: 1, evidence_refs: ['ref:evidence:receipt'] }
    ]
  });
  assert.equal(storm.status, 'storm_warning');
  assert.equal(storm.next_action, 'inspect_receipts');
  assert.deepEqual(storm.issue_codes, ['receipt_gap', 'veto_rate_elevated']);
  assert.deepEqual(storm.tiles.map((tile) => tile.status), ['sunny', 'needs_attention', 'storm_warning']);
});

test('memory controller public-safe guard rejects unsafe field names', () => {
  assert.throws(
    () => assertMemoryControllerPublicSafe({ schema: 'enigma.test_artifact.v1', [UNSAFE_MEMORY_FIELD]: 'ref:blocked' }),
    /public-safe scan failed/
  );
  assert.throws(
    () => assertMemoryControllerPublicSafe({ schema: 'enigma.test_artifact.v1', [UNSAFE_IDENTITY_FIELD]: 'ref:blocked' }),
    /public-safe scan failed/
  );
});
