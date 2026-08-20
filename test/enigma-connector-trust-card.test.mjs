import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createConnectorTrustCard,
  createConnectorTrustCards,
} from '../packages/connectors/src/index.js';

const SHA256_RE = /^sha256:[a-f0-9]{64}$/;

function assertPublicSafeTrustCard(card, clientId = 'generic-mcp') {
  assert.equal(card.schema, 'enigma.trust_card.v1');
  assert.equal(card.subject.subject_type, 'connector');
  assert.equal(card.subject.subject_id, `connector:${clientId}`);
  assert.match(card.subject.subject_hash, SHA256_RE);
  assert.equal(card.posture, 'reviewed');
  assert.deepEqual(card.boundary, {
    public_payload_only: true,
    raw_memory_included: false,
    raw_prompt_included: false,
    raw_transcript_included: false,
    raw_embedding_included: false,
    private_key_included: false,
    credential_included: false,
    local_path_included: false,
    provider_deletion_claim: false,
    model_forgetting_claim: false,
    hosted_saas_ready_claim: false,
  });
  assert.match(card.roots.claim_root, SHA256_RE);
  assert.match(card.roots.evidence_root, SHA256_RE);
  assert.match(card.roots.receipt_chain_root, SHA256_RE);
  assert.equal(card.claim_ids.length, 2);
  assert.equal(card.claims.every((claim) => card.claim_ids.includes(claim.claim_id)), true);
  assert.equal(card.evidence_refs.every((ref) => ref.startsWith('ref:')), true);

  const serialized = JSON.stringify(card);
  assert.equal(serialized.includes('C:\\Users'), false);
  assert.equal(serialized.includes('/Users/'), false);
  assert.equal(serialized.includes('/home/'), false);
  assert.equal(serialized.includes('private launch-code phrase'), false);
  assert.equal(serialized.includes('provider deletion'), false);
  assert.equal(serialized.includes('model forgetting'), false);
}

test('connector trust card summarizes connector posture without local paths or payloads', () => {
  const card = createConnectorTrustCard('generic-mcp', {
    platform: 'win32',
    homeDir: 'C:\\Users\\Casey',
    env: { APPDATA: 'C:\\Users\\Casey\\AppData\\Roaming', USERPROFILE: 'C:\\Users\\Casey' },
    now: '2026-06-27T00:00:00.000Z',
  });

  assert.equal(card.generated_at, '2026-06-27T00:00:00.000Z');
  assertPublicSafeTrustCard(card);
});

test('connector trust cards can be generated for every supported client', () => {
  const cards = createConnectorTrustCards({ now: '2026-06-27T00:00:00.000Z' });
  assert.ok(cards.length >= 1);
  assert.equal(cards.every((card) => card.schema === 'enigma.trust_card.v1'), true);
  assert.equal(new Set(cards.map((card) => card.trust_card_id)).size, cards.length);
  for (const card of cards) assertPublicSafeTrustCard(card, card.subject.subject_id.replace(/^connector:/, ''));
});
