import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONSENT_GRANT_SCHEMA,
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

function grantOptions(overrides = {}) {
  return {
    now: NOW,
    expires_at: LATER,
    app_ref: 'app:notes',
    operation: 'recall',
    memory_zone: 'zone:work',
    purpose: 'purpose:briefing',
    policy_refs: ['policy:jit-consent'],
    receipt_refs: ['receipt:grant'],
    ...overrides
  };
}

test('consent grants verify when active and fail closed on mismatches', () => {
  const grant = createConsentGrant(grantOptions());
  assert.equal(grant.schema, CONSENT_GRANT_SCHEMA);
  assert.equal(verifyConsentGrant(grant, grantOptions()).ok, true);
  assert.deepEqual(verifyConsentGrant(grant, grantOptions({ app_ref: 'app:other' })).reason_codes, ['WRONG_APP']);
  assert.ok(verifyConsentGrant(grant, grantOptions({ now: LATER })).reason_codes.includes('EXPIRED'));
  assert.ok(verifyConsentGrant({ ...grant, revoked_at: NOW }, grantOptions()).reason_codes.includes('REVOKED'));
  assert.ok(verifyConsentGrant({ ...grant, purpose: 'purpose:changed' }, grantOptions({ purpose: 'purpose:changed' })).reason_codes.includes('BAD_GRANT_ROOT_COMMITMENT'));
  assert.ok(verifyConsentGrant({ ...grant, [UNSAFE_MEMORY_FIELD]: 'ref:blocked' }, grantOptions()).reason_codes.includes('NON_PUBLIC_SAFE_ARTIFACT'));
});

test('recall veto asks without active grant, denies risky recalls, and allows covered recalls', () => {
  const grant = createConsentGrant(grantOptions());
  const covered = createRecallVetoDecision({ ...grantOptions(), grant, candidate_count: 2, selected_count: 2 });
  assert.equal(covered.schema, RECALL_VETO_DECISION_SCHEMA);
  assert.equal(covered.decision, 'allow');
  assert.equal(covered.selected_count, 2);
  assert.equal(covered.withheld_count, 0);

  const missing = createRecallVetoDecision({ ...grantOptions(), candidate_count: 1 });
  assert.equal(missing.decision, 'ask');
  assert.deepEqual(missing.reason_codes, ['NO_ACTIVE_GRANT']);

  const tombstone = createRecallVetoDecision({ ...grantOptions(), grant, candidate_count: 2, tombstone_count: 1 });
  assert.equal(tombstone.decision, 'deny');
  assert.deepEqual(tombstone.reason_codes, ['TOMBSTONE_MATCH']);
  assert.equal(tombstone.selected_count, 0);

  const expired = createRecallVetoDecision({ ...grantOptions({ now: '2026-06-28T12:10:00.000Z' }), grant, candidate_count: 1 });
  assert.equal(expired.decision, 'deny');
  assert.ok(expired.reason_codes.includes('EXPIRED'));
});

test('private memory bubbles close deterministically as keep or discard', () => {
  const bubble = createPrivateMemoryBubble({
    now: NOW,
    app_ref: 'app:notes',
    memory_zone: 'zone:draft',
    purpose: 'purpose:temporary',
    item_count: 3,
    receipt_refs: ['receipt:bubble-open']
  });
  assert.equal(bubble.schema, PRIVATE_MEMORY_BUBBLE_SCHEMA);
  assert.equal(bubble.status, 'open');

  const kept = closePrivateMemoryBubble(bubble, { now: LATER, outcome: 'keep', promotion_count: 2, receipt_refs: ['receipt:bubble-keep'] });
  assert.equal(kept.status, 'kept');
  assert.equal(kept.promotion_count, 2);
  assert.equal(kept.closed_at, LATER);
  assert.equal(bubble.status, 'open');

  const discarded = closePrivateMemoryBubble(bubble, { now: LATER, outcome: 'discard' });
  assert.equal(discarded.status, 'discarded');
  assert.equal(discarded.promotion_count, 0);
});

test('memory weather reports roll up tiles and emit one next-action ref', () => {
  const sunny = createMemoryWeatherReport({ now: NOW, tiles: [{ tile_ref: 'tile:vault', status: 'sunny', count: 1 }] });
  assert.equal(sunny.schema, MEMORY_WEATHER_REPORT_SCHEMA);
  assert.equal(sunny.overall_status, 'sunny');
  assert.equal(sunny.next_action_ref, 'action:sunny');

  const storm = createMemoryWeatherReport({
    now: NOW,
    tiles: [
      { tile_ref: 'tile:vault', status: 'sunny', count: 1 },
      { tile_ref: 'tile:recall', status: 'needs_review', next_action_ref: 'action:review', count: 2 },
      { tile_ref: 'tile:export', status: 'blocked', next_action_ref: 'action:repair', count: 1 }
    ]
  });
  assert.equal(storm.overall_status, 'storm_warning');
  assert.equal(storm.next_action_ref, 'action:repair');
  assert.deepEqual(storm.status_counts, { sunny: 1, needs_attention: 1, storm_warning: 1 });
});

test('memory controller public-safe guard rejects unsafe field names', () => {
  assert.throws(() => assertMemoryControllerPublicSafe({ schema: 'enigma.test_artifact.v1', [UNSAFE_MEMORY_FIELD]: 'ref:blocked' }), /public-safe scan failed/);
  assert.throws(() => assertMemoryControllerPublicSafe({ schema: 'enigma.test_artifact.v1', [UNSAFE_IDENTITY_FIELD]: 'ref:blocked' }), /public-safe scan failed/);
});
