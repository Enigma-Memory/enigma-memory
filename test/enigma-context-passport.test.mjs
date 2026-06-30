import test from 'node:test';
import assert from 'node:assert/strict';
import { createVault, deleteMemory, remember } from '../packages/vault/src/index.js';
import {
  compileContextPack,
  createContextPassport,
  createPassport,
  createProofOfNonUse,
  verifyContextPassport,
  verifyProofOfNonUse,
} from '../packages/passport/src/index.js';

const CONTEXT_PASSPORT_KEYS = [
  'capability_ids',
  'issued_at',
  'omitted_context_root',
  'omitted_count',
  'passport_id',
  'policy_ids',
  'proof_refs',
  'query_commitment',
  'schema',
  'selected_context_root',
  'selected_count',
  'subject_ref',
  'tombstone_context_root',
  'tombstone_count',
];
const PROOF_OF_NON_USE_KEYS = [
  'candidate_count',
  'candidate_set_root',
  'issued_at',
  'omitted_count',
  'omitted_set_root',
  'policy_decision',
  'policy_id',
  'proof_id',
  'query_commitment',
  'receipt_log_root',
  'receipt_refs',
  'schema',
  'selected_count',
  'selected_set_root',
  'subject_ref',
  'tombstone_count',
  'tombstone_set_root',
  'verifier_ref',
  'verifier_status',
];
const ROOT_RE = /^sha256:[a-f0-9]{64}$/;
const PUBLIC_REF_RE = /^(?![A-Za-z]:$)[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function assertNoPrivateText(value) {
  const encoded = JSON.stringify(value);
  assert.doesNotMatch(encoded, /selected raw passport sentinel/);
  assert.doesNotMatch(encoded, /omitted raw passport sentinel/);
  assert.doesNotMatch(encoded, /deleted raw passport sentinel/);
}

async function buildFixture() {
  const vault = createVault({ subjectId: 'subject-context-passport' });
  const selected = await remember({ vault, text: 'selected raw passport sentinel', purpose: 'fixture' });
  await remember({ vault, text: 'omitted raw passport sentinel', purpose: 'fixture' });
  const deleted = await remember({ vault, text: 'deleted raw passport sentinel', purpose: 'fixture' });
  await deleteMemory({ vault, memory_addr: deleted.memory_addr, reason: 'fixture' });
  const passport = createPassport({ vault, now: '2026-06-27T00:00:00.000Z' });
  const contextPack = compileContextPack({
    vault,
    passport,
    memory_addresses: [selected.memory_addr],
    query: 'selected raw passport sentinel',
    limit: 1,
    now: '2026-06-27T00:00:01.000Z',
  });
  return { vault, passport, contextPack };
}

test('context passport and proof of non-use expose roots and refs without memory text', async () => {
  const { vault, passport, contextPack } = await buildFixture();

  const contextPassport = createContextPassport({
    vault,
    passport,
    contextPack,
    capability_ids: ['cap.fixture.context'],
    now: '2026-06-27T00:00:02.000Z',
  });
  assert.equal(contextPassport.schema, 'enigma.context_passport.v1');
  assert.deepEqual(Object.keys(contextPassport).sort(), CONTEXT_PASSPORT_KEYS);
  assert.match(contextPassport.query_commitment, ROOT_RE);
  assert.match(contextPassport.selected_context_root, ROOT_RE);
  assert.match(contextPassport.omitted_context_root, ROOT_RE);
  assert.match(contextPassport.tombstone_context_root, ROOT_RE);
  assert.match(contextPassport.subject_ref, PUBLIC_REF_RE);
  assert.equal(contextPassport.selected_count, 1);
  assert.equal(contextPassport.omitted_count, 1);
  assert.equal(contextPassport.tombstone_count, 1);
  assert.deepEqual(contextPassport.capability_ids, ['cap.fixture.context']);
  assert.ok(contextPassport.policy_ids.length >= 1);
  assert.ok(contextPassport.proof_refs.length >= 2);
  assertNoPrivateText(contextPassport);

  const passportResult = verifyContextPassport({ contextPassport, vault, passport, contextPack });
  assert.equal(passportResult.valid, true, JSON.stringify(passportResult));
  assertNoPrivateText(passportResult);

  const proof = createProofOfNonUse({
    vault,
    passport,
    contextPack,
    policy_decision: 'allow',
    now: '2026-06-27T00:00:03.000Z',
  });
  assert.equal(proof.schema, 'enigma.proof_of_non_use.v1');
  assert.deepEqual(Object.keys(proof).sort(), PROOF_OF_NON_USE_KEYS);
  assert.match(proof.query_commitment, ROOT_RE);
  assert.match(proof.candidate_set_root, ROOT_RE);
  assert.match(proof.selected_set_root, ROOT_RE);
  assert.match(proof.omitted_set_root, ROOT_RE);
  assert.match(proof.tombstone_set_root, ROOT_RE);
  assert.match(proof.subject_ref, PUBLIC_REF_RE);
  assert.equal(proof.candidate_count, 3);
  assert.equal(proof.selected_count, 1);
  assert.equal(proof.omitted_count, 1);
  assert.equal(proof.tombstone_count, 1);
  assert.equal(proof.policy_decision, 'allow');
  assert.equal(proof.verifier_status, 'verified');
  assert.match(proof.receipt_log_root, /^sha256:[a-f0-9]{64}$/);
  assert.match(proof.verifier_ref, /^verifier_[a-f0-9]{32}$/);
  assert.ok(proof.receipt_refs.length >= 2);
  assertNoPrivateText(proof);

  const proofResult = verifyProofOfNonUse({ proof, vault, passport, contextPack });
  assert.equal(proofResult.valid, true, JSON.stringify(proofResult));
  assertNoPrivateText(proofResult);
});

test('context passport and proof verifiers fail closed on root and receipt-ref gaps', async () => {
  const { vault, passport, contextPack } = await buildFixture();
  const contextPassport = createContextPassport({ vault, passport, contextPack, now: '2026-06-27T00:00:04.000Z' });
  const proof = createProofOfNonUse({ vault, passport, contextPack, now: '2026-06-27T00:00:05.000Z' });

  const badSelected = verifyContextPassport({
    contextPassport: { ...contextPassport, selected_context_root: contextPassport.omitted_context_root },
    vault,
    passport,
    contextPack,
  });
  assert.equal(badSelected.valid, false);
  assert.equal(badSelected.verifier_status, 'fail_closed');
  assert.match(badSelected.errors.join('\n'), /selected_context_root mismatch/);

  const badOmittedContext = verifyContextPassport({
    contextPassport: { ...contextPassport, omitted_context_root: contextPassport.selected_context_root },
    vault,
    passport,
    contextPack,
  });
  assert.equal(badOmittedContext.valid, false);
  assert.match(badOmittedContext.errors.join('\n'), /omitted_context_root mismatch/);

  const badTombstone = verifyContextPassport({
    contextPassport: { ...contextPassport, tombstone_context_root: contextPassport.selected_context_root },
    vault,
    passport,
    contextPack,
  });
  assert.equal(badTombstone.valid, false);
  assert.match(badTombstone.errors.join('\n'), /tombstone_context_root mismatch/);

  const missingProofRefs = verifyContextPassport({
    contextPassport: { ...contextPassport, proof_refs: [] },
    vault,
    passport,
    contextPack,
  });
  assert.equal(missingProofRefs.valid, false);
  assert.match(missingProofRefs.errors.join('\n'), /missing proof_refs/);
  const maliciousMissingProofRefs = verifyContextPassport({
    contextPassport: { ...contextPassport, proof_refs: [], text: 'selected raw passport sentinel' },
    vault,
    passport,
    contextPack,
  });
  assert.equal(maliciousMissingProofRefs.valid, false);
  assertNoPrivateText(maliciousMissingProofRefs);

  const badOmitted = verifyProofOfNonUse({
    proof: { ...proof, omitted_set_root: proof.selected_set_root },
    vault,
    passport,
    contextPack,
  });
  assert.equal(badOmitted.valid, false);
  assert.equal(badOmitted.verifier_status, 'fail_closed');
  assert.match(badOmitted.errors.join('\n'), /omitted_set_root mismatch/);

  const missingReceiptRefs = verifyProofOfNonUse({
    proof: { ...proof, receipt_refs: [] },
    vault,
    passport,
    contextPack,
  });
  assert.equal(missingReceiptRefs.valid, false);
  assert.match(missingReceiptRefs.errors.join('\n'), /missing receipt_refs/);
  const maliciousMissingReceiptRefs = verifyProofOfNonUse({
    proof: { ...proof, receipt_refs: [], prompt: 'deleted raw passport sentinel' },
    vault,
    passport,
    contextPack,
  });
  assert.equal(maliciousMissingReceiptRefs.valid, false);
  assertNoPrivateText(maliciousMissingReceiptRefs);
});
