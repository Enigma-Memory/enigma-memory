import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MerkleSet,
  canonicalize,
  deriveNullifier,
  isNullifier,
  isSha256Root,
  merkleSetRoot,
  publicSafeHash,
  scanPublicSafeFields,
  createMerkleProof,
  createMerkleRoot,
  sha256Hex,
  sha256Root,
  verifyMerkleMembershipProof,
  verifyMerkleNonMembershipProof,
  verifyPublicSafeArtifact,
  verifyNullifier,
  verifyMerkleProof,
  verifyPublicSafeHash,
  verifySha256Root,
  createMerkleMembershipProof,
  createMerkleNonMembershipProof,
} from '../packages/core/src/index.js';

test('public-safe hash helpers are canonical, deterministic, and sha256-prefixed', () => {
  const first = { schema: 'enigma.boundary_artifact.v1', count: 2, roots: ['sha256:'.concat('a'.repeat(64))] };
  const second = { roots: ['sha256:'.concat('a'.repeat(64))], count: 2, schema: 'enigma.boundary_artifact.v1' };
  const expected = `sha256:${sha256Hex(canonicalize(first))}`;

  assert.equal(sha256Root(first), expected);
  assert.equal(publicSafeHash(first), expected);
  assert.equal(publicSafeHash(second), expected);
  assert.equal(isSha256Root(expected), true);
  assert.equal(isSha256Root(expected.slice('sha256:'.length)), false);
  assert.equal(verifySha256Root(expected).ok, true);
  assert.equal(verifySha256Root(expected.slice('sha256:'.length)).ok, false);
});

test('public-safe scanner reports paths without echoing forbidden plaintext', () => {
  const artifact = {
    schema: 'enigma.boundary_artifact.v1',
    prompt: 'delete this secret memory',
    evidence_ref: 'C:\\Users\\Alice\\vault.json',
    token_ref: 'sk_live_should_not_escape_from_scan',
    claim: 'provider deletion proven',
  };

  const result = scanPublicSafeFields(artifact);
  assert.equal(result.ok, false);
  assert.deepEqual(result.forbidden_paths.sort(), ['$.claim', '$.evidence_ref', '$.prompt', '$.token_ref'].sort());
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /delete this secret memory/);
  assert.doesNotMatch(serialized, /Alice/);
  assert.doesNotMatch(serialized, /sk_live_should_not_escape/);
  assert.doesNotMatch(serialized, /provider deletion proven/);
});

test('Merkle helper exports match MerkleSet roots and verify membership boundaries', () => {
  const values = ['mem:hmac-sha256:'.concat('b'.repeat(64)), 'mem:hmac-sha256:'.concat('a'.repeat(64)), 'mem:hmac-sha256:'.concat('c'.repeat(64))];
  const expectedRoot = new MerkleSet(values).root();
  const proof = createMerkleMembershipProof(values, values[1]);
  const absence = createMerkleNonMembershipProof(values, 'mem:hmac-sha256:'.concat('d'.repeat(64)));

  assert.equal(merkleSetRoot(values), expectedRoot);
  assert.equal(createMerkleRoot(values), expectedRoot);
  assert.equal(verifyMerkleProof(createMerkleProof(values, values[1]), expectedRoot), true);
  assert.equal(verifyMerkleMembershipProof(proof, expectedRoot), true);
  assert.equal(verifyMerkleMembershipProof(proof, 'sha256:'.concat('0'.repeat(64))), false);
  assert.equal(verifyMerkleNonMembershipProof(absence, expectedRoot), true);
  assert.equal(verifyMerkleNonMembershipProof(absence, 'sha256:'.concat('0'.repeat(64))), false);
});

test('nullifier derivation is deterministic, scoped, and value-blind', () => {
  const first = deriveNullifier({ secret: 'test-nullifier-secret', scope: 'receipt-chain', value: 'raw memory that must not appear' });
  const second = deriveNullifier({ secret: 'test-nullifier-secret', scope: 'receipt-chain', value: 'raw memory that must not appear' });
  const changed = deriveNullifier({ secret: 'test-nullifier-secret', scope: 'quarantine', value: 'raw memory that must not appear' });

  assert.equal(first, second);
  assert.notEqual(first, changed);
  assert.equal(isNullifier(first), true);
  assert.equal(verifyNullifier(first).ok, true);
  assert.equal(verifyNullifier(first.slice('nullifier:'.length)).ok, false);
  assert.doesNotMatch(first, /raw memory/);
});

test('public artifact verifier returns only public hashes for safe artifacts', () => {
  const artifact = {
    schema: 'enigma.memory_boundary_checkpoint.v1',
    generated_at: '2026-06-27T00:00:00.000Z',
    active_root: 'sha256:'.concat('1'.repeat(64)),
    tombstone_root: 'sha256:'.concat('2'.repeat(64)),
    selected_count: 3,
    public_safe: true,
    signer_ref: 'signer:local-test',
  };

  const result = verifyPublicSafeArtifact(artifact, { strictStrings: true });
  assert.equal(result.ok, true);
  assert.equal(result.public_hash, publicSafeHash(artifact, { strictStrings: true }));
  assert.equal(isSha256Root(result.public_hash), true);
  assert.equal(verifyPublicSafeHash(artifact, result.public_hash, { strictStrings: true }).ok, true);
  assert.equal(verifyPublicSafeHash(artifact, 'sha256:'.concat('0'.repeat(64)), { strictStrings: true }).ok, false);
});
