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
  createRegistryEntry,
  validateRegistryEntry,
  createRegistryBatch,
  validateRegistryBatch,
  createProofRegistryEntry,
  validateProofRegistryEntry,
  PROOF_NETWORK_REGISTRY_ENTRY_SCHEMA,
  PROOF_NETWORK_REGISTRY_BATCH_SCHEMA,
} from '../packages/proof-network/src/index.js';
import { chainRegisterCommand, chainRegistryCommand } from '../apps/cli/bin/enigma.mjs';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
    runner_ref: 'runner:enigma-standard-memory-benchmark-0.1.17',
    package_ref: 'package:enigma-memory-0.1.17',
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

function registryEntryInput(overrides = {}) {
  return {
    registered_at: GENERATED_AT,
    entry_type: 'benchmark_attestation',
    entry_ref: 'registry-entry://enigma/public/benchmark-1',
    registry_ref: 'registry:memory-drive-marketplace',
    artifact_schema_ref: PROOF_NETWORK_REGISTRY_ENTRY_SCHEMA.replace('registry_entry', 'benchmark_attestation'),
    artifact_hash: ROOT_A,
    digest_refs: [ROOT_A, ROOT_B],
    signer_refs: ['did:key:zpublicattestor'],
    entry_count: 4,
    signature_ref: 'signature:PUBLICTESTREGISTRY000000000000000000000000000',
    ...overrides,
  };
}

function captureIo() {
  const chunks = [];
  return {
    stdout: { write(chunk) { chunks.push(String(chunk)); return true; } },
    stderr: { write() { return true; } },
    text() { return chunks.join(''); },
    json() { return JSON.parse(this.text()); },
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
  assert.equal(attestation.runner_ref, 'runner:enigma-standard-memory-benchmark-0.1.17');
  assert.equal(attestation.package_ref, 'package:enigma-memory-0.1.17');
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

test('proof-network registry entry registers attestations, health reports, and anchor batches under a public-safe index', () => {
  for (const [entryType, schemaRef] of [
    ['anchor_batch', 'enigma.proof_network.anchor_batch.v1'],
    ['benchmark_attestation', 'enigma.proof_network.benchmark_attestation.v1'],
    ['connector_conformance', 'enigma.connector.conformance_attestation.v1'],
    ['health_report', 'enigma.memory_drive_health_report.v1'],
    ['operator_receipt', 'enigma.operator.receipt.v1'],
    ['settlement_job', 'enigma.settlement.job.v1'],
  ]) {
    const entry = createRegistryEntry(registryEntryInput({ entry_type: entryType, artifact_schema_ref: schemaRef }));
    assert.equal(entry.schema, PROOF_NETWORK_REGISTRY_ENTRY_SCHEMA);
    assert.equal(entry.entry_type, entryType);
    assert.match(entry.registry_entry_id, /^pnrg_[a-f0-9]{32}$/);
    assert.equal(entry.transaction_submitted, false);
    assert.equal(entry.raw_memory_on_chain, false);
    assertDigest(entry.artifact_hash);
    assertDigest(entry.digest_root);
    assertDigest(entry.registry_entry_hash);
    expectValidationOk(validateRegistryEntry, entry);
    assertPublicSafeArtifact(entry);
  }

  const entry = createRegistryEntry(registryEntryInput());
  assert.equal(createProofRegistryEntry, createRegistryEntry);
  assert.equal(validateProofRegistryEntry, validateRegistryEntry);
  assert.equal(entry.registry_ref, 'registry:memory-drive-marketplace');
  assert.equal(entry.entry_count, 4);
  assert.deepEqual(entry.digest_refs, [ROOT_A, ROOT_B]);
  assert.equal(entry.digest_root, sha256Json([ROOT_A, ROOT_B]));

  // determinism: same public-safe input yields the same entry hash
  const twin = createRegistryEntry(registryEntryInput());
  assert.equal(twin.registry_entry_hash, entry.registry_entry_hash);
  // key-order independence
  const reordered = createRegistryEntry({
    signature_ref: 'signature:PUBLICTESTREGISTRY000000000000000000000000000',
    digest_refs: [ROOT_A, ROOT_B],
    signer_refs: ['did:key:zpublicattestor'],
    artifact_hash: ROOT_A,
    artifact_schema_ref: 'enigma.proof_network.benchmark_attestation.v1',
    registry_ref: 'registry:memory-drive-marketplace',
    entry_ref: 'registry-entry://enigma/public/benchmark-1',
    entry_type: 'benchmark_attestation',
    entry_count: 4,
    registered_at: GENERATED_AT,
  });
  assert.equal(reordered.registry_entry_hash, entry.registry_entry_hash);

  expectValidationFailure(validateRegistryEntry, { ...entry, digest_root: ROOT_E });
  expectValidationFailure(validateRegistryEntry, { ...entry, registry_entry_hash: ROOT_E });
});

test('proof-network registry batch hashes multiple entries into a deterministic registry root', () => {
  const entryA = createRegistryEntry(registryEntryInput({ entry_ref: 'registry-entry://enigma/public/benchmark-1' }));
  const entryB = createRegistryEntry(registryEntryInput({
    entry_type: 'health_report',
    artifact_schema_ref: 'enigma.memory_drive_health_report.v1',
    artifact_hash: ROOT_B,
    digest_refs: [ROOT_B, ROOT_C],
    entry_ref: 'registry-entry://enigma/public/health-1',
  }));
  const batch = createRegistryBatch({
    entries: [entryA, entryB],
    registry_ref: 'registry:memory-drive-marketplace',
    created_at: '2026-06-26T00:00:00.000Z',
  });

  assert.equal(batch.schema, PROOF_NETWORK_REGISTRY_BATCH_SCHEMA);
  assert.match(batch.registry_batch_id, /^pnrb_[a-f0-9]{32}$/);
  assert.equal(batch.entry_count, 2);
  assert.deepEqual(batch.entry_hashes, [entryA.registry_entry_hash, entryB.registry_entry_hash].sort());
  assert.equal(batch.registry_root, sha256Json(batch.entry_hashes));
  assertDigest(batch.registry_root);
  assertDigest(batch.registry_batch_hash);
  assertLocalPlanningBoundaries(batch);
  expectValidationOk(validateRegistryBatch, batch);
  assertPublicSafeArtifact(batch);

  // registry root is order-independent over the same entry set
  const reordered = createRegistryBatch({ entries: [entryB, entryA], created_at: '2026-06-26T00:00:00.000Z' });
  assert.equal(reordered.registry_root, batch.registry_root);
  assert.deepEqual(reordered.entry_hashes, batch.entry_hashes);

  expectValidationFailure(validateRegistryBatch, { ...batch, entry_count: 3 });
  expectValidationFailure(validateRegistryBatch, { ...batch, registry_root: ROOT_E });
});

test('proof-network registry rejects private payload keys before any artifact is created', () => {
  const forbiddenPayloads = [
    { raw_memory: ROOT_A },
    { prompt: ROOT_A },
    { transcript: ROOT_A },
    { api_key: ROOT_A },
    { private_key: ROOT_A },
    { provider_response: { status_hash: ROOT_C } },
    { nested: { headers: { authorization: `Bearer ${'A'.repeat(32)}` } } },
  ];
  for (const payload of forbiddenPayloads) {
    assert.throws(() => assertNoPrivateProofPayload(payload), /not allowed|secret-looking|private/i);
    assert.throws(() => createRegistryEntry(registryEntryInput(payload)), /not allowed|secret-looking|private/i);
  }
  const entry = createRegistryEntry(registryEntryInput());
  for (const payload of forbiddenPayloads) {
    assert.throws(() => createRegistryBatch({ entries: [entry], ...payload }), /not allowed|secret-looking|private/i);
  }
  // a registry entry carrying private data must fail validation, not pass silently
  const poisoned = JSON.parse(JSON.stringify(entry));
  poisoned.prompt = ROOT_A;
  expectValidationFailure(validateRegistryEntry, poisoned);
});

test('proof-network registry rejects unsupported artifact types and non-registry entries', () => {
  // unsupported entry_type rejected at construction time
  assert.throws(
    () => createRegistryEntry(registryEntryInput({ entry_type: 'unsupported_kind' })),
    /entry_type must be one of/,
  );
  assert.throws(
    () => createRegistryEntry(registryEntryInput({ entry_type: undefined })),
    /entry_type must be one of/,
  );

  // a benchmark attestation is a supported proof-network artifact but not a registry entry
  const attestation = createBenchmarkAttestation(attestationInput());
  assert.throws(
    () => createRegistryBatch({ entries: [attestation] }),
    new RegExp(`must be a ${PROOF_NETWORK_REGISTRY_ENTRY_SCHEMA.replace(/\./g, '\\.')}`),
  );
  // an anchor batch is not a registry entry either
  const anchor = createProofNetworkAnchorBatch(anchorInput());
  assert.throws(
    () => createRegistryBatch({ entries: [anchor] }),
    new RegExp(`must be a ${PROOF_NETWORK_REGISTRY_ENTRY_SCHEMA.replace(/\./g, '\\.')}`),
  );
  // an empty registry batch is rejected
  assert.throws(() => createRegistryBatch({ entries: [] }), /entries must be non-empty/);

  // validation surfaces unsupported entry_type and wrong-schema entries as errors
  const entry = createRegistryEntry(registryEntryInput());
  expectValidationFailure(validateRegistryEntry, { ...entry, entry_type: 'unsupported_kind' });
  expectValidationFailure(validateRegistryBatch, { ...createRegistryBatch({ entries: [entry] }), entries: [attestation] });
});

test('enigma chain register and chain registry emit the public-safe CLI output shape', async () => {
  // register: no --out prints the full registry entry artifact to stdout
  const registerIo = captureIo();
  const registerFlags = new Map([
    ['entry-type', 'benchmark_attestation'],
    ['artifact-hash', ROOT_A],
    ['artifact-schema-ref', 'enigma.proof_network.benchmark_attestation.v1'],
    ['digest-ref', ROOT_B],
    ['signer', 'did:key:zpublicattestor'],
    ['registry-ref', 'registry:memory-drive-marketplace'],
    ['entry-ref', 'registry-entry://enigma/public/cli-1'],
    ['entry-count', '2'],
  ]);
  const registerCode = await chainRegisterCommand(registerFlags, registerIo);
  assert.equal(registerCode, 0);
  const printedEntry = registerIo.json();
  assert.equal(printedEntry.schema, PROOF_NETWORK_REGISTRY_ENTRY_SCHEMA);
  assert.equal(printedEntry.entry_type, 'benchmark_attestation');
  assert.equal(printedEntry.transaction_submitted, false);
  assert.equal(printedEntry.raw_memory_on_chain, false);
  expectValidationOk(validateRegistryEntry, printedEntry);

  // registry: --out writes the batch file and prints the public-safe summary shape
  const tmp = mkdtempSync(join(tmpdir(), 'enigma-registry-cli-'));
  try {
    const entryA = createRegistryEntry(registryEntryInput({ entry_ref: 'registry-entry://enigma/public/cli-1' }));
    const entryB = createRegistryEntry(registryEntryInput({
      entry_type: 'health_report',
      artifact_schema_ref: 'enigma.memory_drive_health_report.v1',
      artifact_hash: ROOT_B,
      digest_refs: [ROOT_B],
      entry_ref: 'registry-entry://enigma/public/cli-2',
    }));
    const entryPathA = join(tmp, 'entry-a.json');
    const entryPathB = join(tmp, 'entry-b.json');
    writeFileSync(entryPathA, JSON.stringify(entryA));
    writeFileSync(entryPathB, JSON.stringify(entryB));
    const batchOut = join(tmp, 'batch.json');

    const registryIo = captureIo();
    const registryFlags = new Map([
      ['entry', [entryPathA, entryPathB]],
      ['registry-ref', 'registry:memory-drive-marketplace'],
      ['out', batchOut],
    ]);
    const registryCode = await chainRegistryCommand(registryFlags, registryIo);
    assert.equal(registryCode, 0);
    const summary = registryIo.json();
    assert.equal(summary.ok, true);
    assert.equal(summary.transaction_submitted, false);
    assert.equal(summary.raw_memory_on_chain, false);
    assert.equal(summary.artifact_type, PROOF_NETWORK_REGISTRY_BATCH_SCHEMA);
    assert.match(summary.registry_batch_id, /^pnrb_[a-f0-9]{32}$/);
    assertDigest(summary.registry_batch_hash);

    const writtenBatch = JSON.parse(readFileSync(batchOut, 'utf8'));
    expectValidationOk(validateRegistryBatch, writtenBatch);
    assert.equal(writtenBatch.registry_root, sha256Json(writtenBatch.entry_hashes));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
