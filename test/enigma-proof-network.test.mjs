import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertNoPrivateProofPayload,
  sha256Json,
  createProofNetworkAnchorBatch,
  validateProofNetworkAnchorBatch,
  createCapabilityGrant,
  validateCapabilityGrant,
  createCapabilityRevocation,
  validateCapabilityRevocation,
  createBenchmarkAttestation,
  validateBenchmarkAttestation,
  createProofNetworkPacket,
  validateProofNetworkPacket,
} from '../packages/proof-network/src/index.js';

const ROOT_A = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ROOT_B = 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const ROOT_C = 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
const ROOT_D = 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';
const ROOT_E = 'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const GENERATED_AT = '2026-06-25T00:00:00.000Z';
const EXPIRES_AT = '2026-06-26T00:00:00.000Z';

function commitments() {
  return [
    { kind: 'active_set_root', root: ROOT_A, count: 7, ref: 'active-set://public/root-a' },
    { kind: 'benchmark_attestation_root', root: ROOT_B, count: 1, ref: 'benchmark://public/root-b' },
  ];
}

function anchorInput(overrides = {}) {
  return {
    generated_at: GENERATED_AT,
    anchor_ref: 'anchor://enigma/proof-network/public-batch-1',
    chain: 'solana',
    cluster_ref: 'solana:devnet',
    commitments: commitments(),
    instruction_ref: 'proof-network-anchor-batch-v1',
    ...overrides,
  };
}

function grantInput(overrides = {}) {
  return {
    issued_at: GENERATED_AT,
    expires_at: EXPIRES_AT,
    grant_ref: 'grant://enigma/public/grant-1',
    issuer_ref: 'did:key:zpublicissuer',
    subject_ref: 'did:key:zpublicverifier',
    audience_ref: 'audience:proof-network',
    scopes: ['verify_roots', 'verify_packets'],
    resource_roots: [ROOT_A, ROOT_B],
    max_uses: 25,
    nonce_hash: ROOT_C,
    signature_ref: 'signature:PUBLICTESTSIGNATURE000000000000000000000000000000',
    ...overrides,
  };
}

function revocationInput(grant, overrides = {}) {
  return {
    revoked_at: '2026-06-25T12:00:00.000Z',
    revocation_ref: 'revocation://enigma/public/revocation-1',
    grant_id: grant.capability_grant_id,
    grant_hash: grant.capability_grant_hash,
    issuer_ref: grant.issuer_ref,
    reason_ref: 'reason:policy-replaced-by-public-root',
    nullifier_root: ROOT_D,
    signature_ref: 'signature:PUBLICTESTREVOCATION00000000000000000000000000',
    ...overrides,
  };
}

function attestationInput(overrides = {}) {
  return {
    attested_at: GENERATED_AT,
    benchmark_ref: 'benchmark:standard-memory-v1',
    dataset_ref: 'dataset:locomo-public-root-only',
    runner_ref: 'runner:enigma-standard-memory-benchmark-0.1.12',
    package_ref: 'package:enigma-memory-0.1.12',
    report_hash: ROOT_A,
    metric_roots: [ROOT_B, ROOT_C, ROOT_D],
    sample_count: 128,
    run_count: 3,
    signature_ref: 'signature:PUBLICTESTATTESTATION000000000000000000000000',
    ...overrides,
  };
}

function packetInput({ anchor, grant, revocation, attestation }, overrides = {}) {
  return {
    created_at: '2026-06-25T12:30:00.000Z',
    packet_ref: 'packet://enigma/public/aggregate-1',
    artifacts: [anchor, grant, revocation, attestation],
    ...overrides,
  };
}

function expectValidationOk(validate, artifact) {
  const result = validate(artifact);
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(result.valid, true, result.errors.join('\n'));
}

function expectValidationFailure(validate, artifact) {
  const result = validate(artifact);
  assert.equal(result.ok, false);
  assert.equal(result.valid, false);
  assert.equal(result.errors.length > 0, true);
}

function assertDigest(value) {
  assert.match(value, /^sha256:[a-f0-9]{64}$/);
}

function assertLocalPlanningBoundaries(artifact) {
  assert.equal(artifact.transaction_submitted, false);
  assert.equal(artifact.raw_memory_on_chain, false);
  assert.equal(artifact.provider_deletion_claim, false);
  assert.equal(artifact.model_forgetting_claim, false);
  assert.equal(artifact.hosted_saas_claim, false);
}

function assertPublicSafeArtifact(artifact) {
  const encoded = JSON.stringify(artifact);
  assert.equal(encoded.includes('prompt'), false);
  assert.equal(encoded.includes('transcript'), false);
  assert.equal(encoded.includes('api_key'), false);
  assert.equal(encoded.includes('private_key'), false);
  assert.equal(encoded.includes('provider_response'), false);
  assert.equal(encoded.includes('Bearer '), false);
}

test('proof-network creates and validates a Solana-ready anchor batch without raw memory on-chain', () => {
  const batch = createProofNetworkAnchorBatch(anchorInput());

  assert.equal(batch.schema, 'enigma.proof_network.anchor_batch.v1');
  assert.match(batch.anchor_batch_id, /^pna_[a-f0-9]{32}$/);
  assertLocalPlanningBoundaries(batch);
  assert.equal(batch.commitment_count, 2);
  assert.equal(batch.root_count, 2);
  assert.deepEqual(batch.commitments, commitments());
  assertDigest(batch.commitment_root);
  assertDigest(batch.anchor_batch_hash);
  assert.equal(batch.solana_ready_anchor.payload_hash, batch.commitment_root);
  assert.match(batch.solana_ready_anchor.account_derivation_ref, /^proofnet:[a-f0-9]{32}$/);
  assert.equal(batch.solana_ready_anchor.instruction_ref, 'proof-network-anchor-batch-v1');
  assert.equal(batch.solana_ready_anchor.opaque_payload_only, true);
  expectValidationOk(validateProofNetworkAnchorBatch, batch);
  assertPublicSafeArtifact(batch);

  expectValidationFailure(validateProofNetworkAnchorBatch, { ...batch, root_count: 3 });
});

test('proof-network creates and validates scoped capability grants and revocations', () => {
  const grant = createCapabilityGrant(grantInput());

  assert.equal(grant.schema, 'enigma.proof_network.capability_grant.v1');
  assert.match(grant.capability_grant_id, /^png_[a-f0-9]{32}$/);
  assertLocalPlanningBoundaries(grant);
  assert.deepEqual(grant.scopes, ['verify_packets', 'verify_roots']);
  assert.deepEqual(grant.resource_roots, [ROOT_A, ROOT_B]);
  assertDigest(grant.resource_root);
  assertDigest(grant.capability_grant_hash);
  assertDigest(grant.nonce_hash);
  expectValidationOk(validateCapabilityGrant, grant);
  assertPublicSafeArtifact(grant);

  const revocation = createCapabilityRevocation(revocationInput(grant));
  assert.equal(revocation.schema, 'enigma.proof_network.capability_revocation.v1');
  assert.match(revocation.capability_revocation_id, /^pnr_[a-f0-9]{32}$/);
  assert.equal(revocation.grant_id, grant.capability_grant_id);
  assert.equal(revocation.grant_hash, grant.capability_grant_hash);
  assertLocalPlanningBoundaries(revocation);
  assertDigest(revocation.capability_revocation_hash);
  assertDigest(revocation.nullifier_root);
  expectValidationOk(validateCapabilityRevocation, revocation);
  assertPublicSafeArtifact(revocation);

  expectValidationFailure(validateCapabilityGrant, { ...grant, capability_grant_hash: ROOT_E });
  expectValidationFailure(validateCapabilityRevocation, { ...revocation, grant_hash: ROOT_E });
});

test('proof-network creates and validates benchmark attestations from public report and dataset refs only', () => {
  const attestation = createBenchmarkAttestation(attestationInput());

  assert.equal(attestation.schema, 'enigma.proof_network.benchmark_attestation.v1');
  assert.match(attestation.benchmark_attestation_id, /^pnb_[a-f0-9]{32}$/);
  assert.equal(attestation.report_hash, ROOT_A);
  assert.equal(attestation.dataset_ref, 'dataset:locomo-public-root-only');
  assert.equal(attestation.runner_ref, 'runner:enigma-standard-memory-benchmark-0.1.12');
  assert.equal(attestation.package_ref, 'package:enigma-memory-0.1.12');
  assert.deepEqual(attestation.metric_roots, [ROOT_B, ROOT_C, ROOT_D]);
  assertDigest(attestation.metric_root);
  assert.equal(attestation.sample_count, 128);
  assert.equal(attestation.run_count, 3);
  assertLocalPlanningBoundaries(attestation);
  assertDigest(attestation.benchmark_attestation_hash);
  expectValidationOk(validateBenchmarkAttestation, attestation);
  assertPublicSafeArtifact(attestation);

  expectValidationFailure(validateBenchmarkAttestation, { ...attestation, report_hash: ROOT_E });
});

test('proof-network aggregates anchors, grants, revocations, and attestations into a deterministic packet', () => {
  const anchor = createProofNetworkAnchorBatch(anchorInput());
  const grant = createCapabilityGrant(grantInput());
  const revocation = createCapabilityRevocation(revocationInput(grant));
  const attestation = createBenchmarkAttestation(attestationInput());
  const packet = createProofNetworkPacket(packetInput({ anchor, grant, revocation, attestation }));

  assert.equal(packet.schema, 'enigma.proof_network.packet.v1');
  assert.match(packet.proof_network_packet_id, /^pnp_[a-f0-9]{32}$/);
  assert.equal(packet.artifact_count, 4);
  assert.equal(packet.artifacts.length, 4);
  assert.deepEqual(packet.artifact_hashes, [
    anchor.anchor_batch_hash,
    attestation.benchmark_attestation_hash,
    grant.capability_grant_hash,
    revocation.capability_revocation_hash,
  ].sort());
  assertDigest(packet.artifact_root);
  assertDigest(packet.proof_network_packet_hash);
  assertLocalPlanningBoundaries(packet);
  expectValidationOk(validateProofNetworkPacket, packet);
  assertPublicSafeArtifact(packet);

  const reorderedPacket = createProofNetworkPacket({
    artifacts: [attestation, revocation, grant, anchor],
    packet_ref: 'packet://enigma/public/aggregate-1',
    created_at: '2026-06-25T12:30:00.000Z',
  });
  assert.deepEqual(packet.artifact_hashes, reorderedPacket.artifact_hashes);
  assert.equal(packet.artifact_root, reorderedPacket.artifact_root);

  expectValidationFailure(validateProofNetworkPacket, { ...packet, artifact_count: 3 });
});

test('proof-network rejects private payload keys and secret-looking values before artifact creation', () => {
  const forbiddenPayloads = [
    { raw_memory: ROOT_A },
    { prompt: ROOT_A },
    { transcript: ROOT_A },
    { api_key: ROOT_A },
    { private_key: ROOT_A },
    { provider_response: { status_hash: ROOT_C } },
    { nested: { headers: { authorization: `Bearer ${'A'.repeat(32)}` } } },
    { nested: { callback_ref: 'https://public-user:public-pass@example.invalid/proof' } },
  ];

  for (const payload of forbiddenPayloads) {
    assert.throws(() => assertNoPrivateProofPayload(payload), /not allowed|secret-looking|private/i);
    assert.throws(() => createProofNetworkAnchorBatch(anchorInput(payload)), /not allowed|secret-looking|private/i);
    assert.throws(() => createCapabilityGrant(grantInput(payload)), /not allowed|secret-looking|private/i);
    assert.throws(() => createBenchmarkAttestation(attestationInput(payload)), /not allowed|secret-looking|private/i);
  }

  const grant = createCapabilityGrant(grantInput());
  for (const payload of forbiddenPayloads) {
    assert.throws(() => createCapabilityRevocation(revocationInput(grant, payload)), /not allowed|secret-looking|private/i);
  }
});

test('sha256Json is stable across object key order and changes when public refs change', () => {
  const first = sha256Json({
    b: 2,
    a: {
      d: 4,
      c: [3, { y: 'public-y', x: 'public-x' }],
    },
  });
  const second = sha256Json({
    a: {
      c: [3, { x: 'public-x', y: 'public-y' }],
      d: 4,
    },
    b: 2,
  });
  const changed = sha256Json({
    a: {
      c: [3, { x: 'public-x', y: 'public-z' }],
      d: 4,
    },
    b: 2,
  });

  assertDigest(first);
  assert.equal(first, second);
  assert.notEqual(first, changed);

  const anchorA = createProofNetworkAnchorBatch(anchorInput());
  const anchorB = createProofNetworkAnchorBatch({
    instruction_ref: 'proof-network-anchor-batch-v1',
    commitments: [commitments()[1], commitments()[0]],
    cluster_ref: 'solana:devnet',
    chain: 'solana',
    anchor_ref: 'anchor://enigma/proof-network/public-batch-1',
    generated_at: GENERATED_AT,
  });
  assert.deepEqual(anchorA, anchorB);
});
