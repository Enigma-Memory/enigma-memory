import { createHash } from 'node:crypto';

export const PROOF_NETWORK_ANCHOR_BATCH_SCHEMA = 'enigma.proof_network.anchor_batch.v1';
export const PROOF_NETWORK_CAPABILITY_GRANT_SCHEMA = 'enigma.proof_network.capability_grant.v1';
export const PROOF_NETWORK_CAPABILITY_REVOCATION_SCHEMA = 'enigma.proof_network.capability_revocation.v1';
export const PROOF_NETWORK_BENCHMARK_ATTESTATION_SCHEMA = 'enigma.proof_network.benchmark_attestation.v1';
export const PROOF_NETWORK_PACKET_SCHEMA = 'enigma.proof_network.packet.v1';
export const PROOF_NETWORK_REGISTRY_ENTRY_SCHEMA = 'enigma.proof_network.registry_entry.v1';
export const PROOF_NETWORK_REGISTRY_BATCH_SCHEMA = 'enigma.proof_network.registry_batch.v1';

export const ANCHOR_BATCH_SCHEMA = PROOF_NETWORK_ANCHOR_BATCH_SCHEMA;
export const CAPABILITY_GRANT_SCHEMA = PROOF_NETWORK_CAPABILITY_GRANT_SCHEMA;
export const CAPABILITY_REVOCATION_SCHEMA = PROOF_NETWORK_CAPABILITY_REVOCATION_SCHEMA;
export const BENCHMARK_ATTESTATION_SCHEMA = PROOF_NETWORK_BENCHMARK_ATTESTATION_SCHEMA;
export const PACKET_SCHEMA = PROOF_NETWORK_PACKET_SCHEMA;
export const REGISTRY_ENTRY_SCHEMA = PROOF_NETWORK_REGISTRY_ENTRY_SCHEMA;
export const REGISTRY_BATCH_SCHEMA = PROOF_NETWORK_REGISTRY_BATCH_SCHEMA;

export const PROOF_NETWORK_SCHEMAS = Object.freeze({
  anchor_batch: PROOF_NETWORK_ANCHOR_BATCH_SCHEMA,
  capability_grant: PROOF_NETWORK_CAPABILITY_GRANT_SCHEMA,
  capability_revocation: PROOF_NETWORK_CAPABILITY_REVOCATION_SCHEMA,
  benchmark_attestation: PROOF_NETWORK_BENCHMARK_ATTESTATION_SCHEMA,
  packet: PROOF_NETWORK_PACKET_SCHEMA,
  registry_entry: PROOF_NETWORK_REGISTRY_ENTRY_SCHEMA,
  registry_batch: PROOF_NETWORK_REGISTRY_BATCH_SCHEMA,
});

const SHA256_PREFIX = 'sha256:';
const REF_RE = /^[a-z0-9][a-z0-9._:/@+-]{2,191}$/u;
const ROOT_RE = /^sha256:[a-f0-9]{64}$/u;
const SIGNATURE_REF_RE = /^(?:ed25519|secp256k1|signature):[A-Za-z0-9._~+/=-]{16,256}$/u;
const SCOPE_RE = /^[a-z][a-z0-9._:-]{1,63}$/u;
const SAFE_BOOLEAN_BOUNDARIES = Object.freeze({
  transaction_submitted: false,
  raw_memory_on_chain: false,
  provider_deletion_claim: false,
  model_forgetting_claim: false,
  hosted_saas_claim: false,
});
const SAFE_FIELD_NAMES = new Set(Object.keys(SAFE_BOOLEAN_BOUNDARIES));
const FORBIDDEN_KEY_RE = /(?:^|_)(?:raw|plaintext|plain_text|prompt|prompts|message|messages|text|content|document|documents|transcript|transcripts|completion|completions|embedding|embeddings|acl|acl_body|access_control_list|provider_response|provider_responses|response_body|credential|credentials|api_key|secret|password|private_key|seed|seed_phrase|mnemonic|tenant_name|customer_name|organization_name|org_name)(?:$|_)/iu;
const SECRET_VALUE_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|(?:seed phrase|mnemonic phrase|raw memory|private prompt|full transcript|provider response|embedding vector))/iu;
const SUPPORTED_ARTIFACT_SCHEMAS = new Set(Object.values(PROOF_NETWORK_SCHEMAS));
const REGISTRY_ENTRY_TYPES = Object.freeze(new Set([
  'anchor_batch',
  'benchmark_attestation',
  'connector_conformance',
  'health_report',
  'operator_receipt',
  'settlement_job',
]));

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertJsonValue(value, path = 'value') {
  if (value === null) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonValue(item, `${path}[${index}]`));
    return;
  }
  switch (typeof value) {
    case 'string':
    case 'number':
    case 'boolean':
      if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError(`${path} must be finite`);
      return;
    case 'object':
      if (!isPlainObject(value)) throw new TypeError(`${path} must be JSON-serializable`);
      for (const [key, child] of Object.entries(value)) {
        if (child === undefined) throw new TypeError(`${path}.${key} must not be undefined`);
        assertJsonValue(child, `${path}.${key}`);
      }
      return;
    default:
      throw new TypeError(`${path} must be JSON-serializable`);
  }
}

function canonicalize(value) {
  assertJsonValue(value);
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
    return out;
  }
  return value;
}

export function assertNoPrivateProofPayload(value, path = 'proof') {
  if (typeof value === 'string') {
    if (SECRET_VALUE_RE.test(value)) throw new TypeError(`${path} contains private or secret-looking data`);
    return value;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPrivateProofPayload(item, `${path}[${index}]`));
    return value;
  }
  if (!isPlainObject(value)) return value;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEY_RE.test(key) && !SAFE_FIELD_NAMES.has(key)) throw new TypeError(`${path}.${key} is not allowed in proof-network artifacts`);
    if (SAFE_FIELD_NAMES.has(key) && child !== false) throw new TypeError(`${path}.${key} must be false`);
    assertNoPrivateProofPayload(child, `${path}.${key}`);
  }
  return value;
}

export function sha256Json(value) {
  assertNoPrivateProofPayload(value);
  return `${SHA256_PREFIX}${createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex')}`;
}

function requiredObject(value, field) {
  if (!isPlainObject(value)) throw new TypeError(`${field} must be an object`);
  return value;
}

function requiredString(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError(`${field} must be a non-empty string`);
  return value.trim();
}

function optionalString(value, fallback, field) {
  if (value === undefined || value === null || value === '') return fallback;
  return requiredString(value, field);
}

function publicRef(value, field) {
  const string = requiredString(value, field);
  if (!REF_RE.test(string)) throw new TypeError(`${field} must be an opaque public ref`);
  return string;
}

function optionalPublicRef(value, fallback, field) {
  if (value === undefined || value === null || value === '') return fallback;
  return publicRef(value, field);
}

function digestRef(value, field) {
  const string = requiredString(value, field);
  if (!ROOT_RE.test(string)) throw new TypeError(`${field} must be a sha256-prefixed digest`);
  return string;
}

function optionalDigestRef(value, fallback, field) {
  if (value === undefined || value === null || value === '') return fallback;
  return digestRef(value, field);
}

function refFromDigest(prefix, digest) {
  return `${prefix}:${digest.slice(SHA256_PREFIX.length, SHA256_PREFIX.length + 32)}`;
}


function signatureRef(value, field) {
  const string = requiredString(value, field);
  if (!SIGNATURE_REF_RE.test(string)) throw new TypeError(`${field} must be an opaque signature ref`);
  return string;
}

function optionalSignatureRef(value, fallback, field) {
  if (value === undefined || value === null || value === '') return fallback;
  return signatureRef(value, field);
}

function isoTimestamp(value, field, fallback = '1970-01-01T00:00:00.000Z') {
  const timestamp = optionalString(value, fallback, field);
  if (Number.isNaN(Date.parse(timestamp))) throw new TypeError(`${field} must be ISO-parseable`);
  return timestamp;
}

function nonNegativeInteger(value, field, fallback = 0) {
  const number = Number(value ?? fallback);
  if (!Number.isInteger(number) || number < 0) throw new TypeError(`${field} must be a non-negative integer`);
  return number;
}

function positiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new TypeError(`${field} must be a positive integer`);
  return number;
}

function publicScopes(value, field) {
  const scopes = Array.isArray(value) ? value : [value];
  if (scopes.length === 0 || scopes.length > 32) throw new TypeError(`${field} must contain 1-32 scopes`);
  return Object.freeze([...new Set(scopes.map((scope, index) => {
    const string = requiredString(scope, `${field}[${index}]`);
    if (!SCOPE_RE.test(string)) throw new TypeError(`${field}[${index}] must be a public scope token`);
    return string;
  }))].sort());
}

function digestArray(value, field, { min = 1, max = 64 } = {}) {
  const list = Array.isArray(value) ? value : [value];
  if (list.length < min || list.length > max) throw new TypeError(`${field} must contain ${min}-${max} digest refs`);
  return Object.freeze(list.map((item, index) => digestRef(item, `${field}[${index}]`)));
}

function publicRefArray(value, field, { min = 0, max = 64 } = {}) {
  const list = value === undefined || value === null ? [] : (Array.isArray(value) ? value : [value]);
  if (list.length < min || list.length > max) throw new TypeError(`${field} must contain ${min}-${max} refs`);
  return Object.freeze(list.map((item, index) => publicRef(item, `${field}[${index}]`)).sort());
}

function arrayInput(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}


function commitmentKind(value) {
  const kind = optionalString(value, 'memory_root', 'kind');
  if (!SCOPE_RE.test(kind)) throw new TypeError('kind must be a public scope token');
  return kind;
}

function normalizeCommitment(item, index) {
  if (typeof item === 'string') {
    return Object.freeze({ kind: 'memory_root', root: digestRef(item, `roots[${index}]`) });
  }
  const object = requiredObject(item, `commitments[${index}]`);
  const commitment = {
    kind: commitmentKind(object.kind),
    root: digestRef(object.root ?? object.commitment_root ?? object.commitmentRoot, `commitments[${index}].root`),
  };
  const ref = object.ref ?? object.public_ref ?? object.publicRef;
  if (ref !== undefined && ref !== null && ref !== '') commitment.ref = publicRef(ref, `commitments[${index}].ref`);
  const count = object.count ?? object.leaf_count ?? object.leafCount;
  if (count !== undefined && count !== null) commitment.count = positiveInteger(count, `commitments[${index}].count`);
  return Object.freeze(commitment);
}

function normalizeCommitments(input) {
  const raw = firstDefined(
    input.commitments,
    input.memory_roots,
    input.memoryRoots,
    input.roots,
    input.commitment_roots,
    input.commitmentRoots,
    input.event_roots,
    input.eventRoots,
  );
  const refs = publicRefArray(input.refs ?? input.artifact_refs ?? input.artifactRefs, 'refs', { min: 0, max: 64 });
  const list = arrayInput(raw).map((item, index) => {
    if (typeof item === 'string' && refs[index]) return { kind: 'memory_root', root: item, ref: refs[index] };
    return item;
  });
  if (list.length === 0 || raw === undefined || raw === null) throw new TypeError('commitments must be non-empty');
  return Object.freeze(list.map(normalizeCommitment).sort(compareCommitments));
}

function compareCommitments(a, b) {
  return `${a.kind}:${a.root}:${a.ref ?? ''}`.localeCompare(`${b.kind}:${b.root}:${b.ref ?? ''}`);
}

function freezeArtifact(body, idField, hashField, prefix) {
  const hash = sha256Json(body);
  const artifact = Object.freeze({ ...body, [idField]: `${prefix}_${hash.slice(SHA256_PREFIX.length, SHA256_PREFIX.length + 32)}`, [hashField]: hash });
  assertNoPrivateProofPayload(artifact);
  return artifact;
}

function bodyWithoutIdentity(artifact, idField, hashField) {
  const { [idField]: _id, [hashField]: _hash, ...body } = artifact;
  return body;
}

function requireSafeBoundaries(artifact, errors, path = 'artifact') {
  for (const [key, expected] of Object.entries(SAFE_BOOLEAN_BOUNDARIES)) {
    if (artifact?.[key] !== expected) errors.push(`${path}.${key} must be ${expected}`);
  }
}

function collectValidation(validate) {
  const errors = [];
  try {
    validate(errors);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return Object.freeze({ ok: errors.length === 0, valid: errors.length === 0, errors: Object.freeze(errors) });
}

function validateIdentity(artifact, errors, idField, hashField, prefix) {
  const body = bodyWithoutIdentity(artifact, idField, hashField);
  const expectedHash = sha256Json(body);
  const expectedId = `${prefix}_${expectedHash.slice(SHA256_PREFIX.length, SHA256_PREFIX.length + 32)}`;
  if (artifact[hashField] !== expectedHash) errors.push(`${hashField} mismatch`);
  if (artifact[idField] !== expectedId) errors.push(`${idField} mismatch`);
}

function artifactHash(artifact, index) {
  switch (artifact?.schema) {
    case PROOF_NETWORK_ANCHOR_BATCH_SCHEMA:
      return requiredString(artifact.anchor_batch_hash, `artifacts[${index}].anchor_batch_hash`);
    case PROOF_NETWORK_CAPABILITY_GRANT_SCHEMA:
      return requiredString(artifact.capability_grant_hash, `artifacts[${index}].capability_grant_hash`);
    case PROOF_NETWORK_CAPABILITY_REVOCATION_SCHEMA:
      return requiredString(artifact.capability_revocation_hash, `artifacts[${index}].capability_revocation_hash`);
    case PROOF_NETWORK_BENCHMARK_ATTESTATION_SCHEMA:
      return requiredString(artifact.benchmark_attestation_hash, `artifacts[${index}].benchmark_attestation_hash`);
    case PROOF_NETWORK_PACKET_SCHEMA:
      return requiredString(artifact.proof_network_packet_hash, `artifacts[${index}].proof_network_packet_hash`);
    case PROOF_NETWORK_REGISTRY_ENTRY_SCHEMA:
      return requiredString(artifact.registry_entry_hash, `artifacts[${index}].registry_entry_hash`);
    case PROOF_NETWORK_REGISTRY_BATCH_SCHEMA:
      return requiredString(artifact.registry_batch_hash, `artifacts[${index}].registry_batch_hash`);
    default:
      throw new TypeError(`artifacts[${index}] has unsupported schema`);
  }
}

function validateSupportedArtifact(artifact) {
  switch (artifact?.schema) {
    case PROOF_NETWORK_ANCHOR_BATCH_SCHEMA:
      return validateProofNetworkAnchorBatch(artifact);
    case PROOF_NETWORK_CAPABILITY_GRANT_SCHEMA:
      return validateCapabilityGrant(artifact);
    case PROOF_NETWORK_CAPABILITY_REVOCATION_SCHEMA:
      return validateCapabilityRevocation(artifact);
    case PROOF_NETWORK_BENCHMARK_ATTESTATION_SCHEMA:
      return validateBenchmarkAttestation(artifact);
    case PROOF_NETWORK_PACKET_SCHEMA:
      return validateProofNetworkPacket(artifact);
    case PROOF_NETWORK_REGISTRY_ENTRY_SCHEMA:
      return validateRegistryEntry(artifact);
    case PROOF_NETWORK_REGISTRY_BATCH_SCHEMA:
      return validateRegistryBatch(artifact);
    default:
      return Object.freeze({ ok: false, valid: false, errors: Object.freeze(['unsupported artifact schema']) });
  }
}

export function createProofNetworkAnchorBatch(input = {}) {
  requiredObject(input, 'input');
  assertNoPrivateProofPayload(input, 'input');
  const commitments = normalizeCommitments(input);
  const commitmentRoot = sha256Json(commitments);
  const body = {
    schema: PROOF_NETWORK_ANCHOR_BATCH_SCHEMA,
    generated_at: isoTimestamp(input.generated_at ?? input.generatedAt ?? input.created_at ?? input.createdAt, 'generated_at'),
    anchor_ref: optionalPublicRef(input.anchor_ref ?? input.anchorRef ?? input.batch_ref ?? input.batchRef, refFromDigest('anchor', commitmentRoot), 'anchor_ref'),
    chain: optionalPublicRef(input.chain ?? input.network ?? input.public_chain_ref ?? input.publicChainRef, 'solana', 'chain'),
    cluster_ref: optionalPublicRef(input.cluster_ref ?? input.clusterRef ?? input.cluster, 'solana:mainnet-ready', 'cluster_ref'),
    commitment_count: commitments.length,
    root_count: commitments.length,
    commitment_root: commitmentRoot,
    commitments,
    solana_ready_anchor: Object.freeze({
      payload_hash: commitmentRoot,
      account_derivation_ref: `proofnet:${commitmentRoot.slice(SHA256_PREFIX.length, SHA256_PREFIX.length + 32)}`,
      instruction_ref: optionalPublicRef(input.instruction_ref ?? input.instructionRef, 'proof-network-anchor-batch-v1', 'instruction_ref'),
      opaque_payload_only: true,
    }),
    ...SAFE_BOOLEAN_BOUNDARIES,
  };
  return freezeArtifact(body, 'anchor_batch_id', 'anchor_batch_hash', 'pna');
}

export function validateProofNetworkAnchorBatch(batch) {
  return collectValidation((errors) => {
    requiredObject(batch, 'batch');
    assertNoPrivateProofPayload(batch, 'batch');
    if (batch.schema !== PROOF_NETWORK_ANCHOR_BATCH_SCHEMA) errors.push(`schema must be ${PROOF_NETWORK_ANCHOR_BATCH_SCHEMA}`);
    requireSafeBoundaries(batch, errors, 'batch');
    isoTimestamp(batch.generated_at, 'generated_at');
    publicRef(batch.anchor_ref, 'anchor_ref');
    publicRef(batch.chain, 'chain');
    publicRef(batch.cluster_ref, 'cluster_ref');
    const commitments = normalizeCommitments({ commitments: batch.commitments });
    if (batch.commitment_count !== commitments.length) errors.push('commitment_count mismatch');
    if (batch.root_count !== undefined && batch.root_count !== commitments.length) errors.push('root_count mismatch');
    const expectedRoot = sha256Json(commitments);
    if (batch.commitment_root !== expectedRoot) errors.push('commitment_root mismatch');
    if (batch.solana_ready_anchor?.payload_hash !== expectedRoot) errors.push('solana_ready_anchor.payload_hash mismatch');
    if (batch.solana_ready_anchor?.opaque_payload_only !== true) errors.push('solana_ready_anchor.opaque_payload_only must be true');
    publicRef(batch.solana_ready_anchor?.instruction_ref, 'solana_ready_anchor.instruction_ref');
    validateIdentity(batch, errors, 'anchor_batch_id', 'anchor_batch_hash', 'pna');
  });
}

export function createCapabilityGrant(input = {}) {
  requiredObject(input, 'input');
  assertNoPrivateProofPayload(input, 'input');
  const resourceRoots = digestArray(input.resource_roots ?? input.resourceRoots ?? input.scope_hashes ?? input.scopeHashes ?? input.scope_roots ?? input.scopeRoots ?? input.policy_hash ?? input.policyHash ?? input.policy_root ?? input.policyRoot ?? input.proof_root ?? input.proofRoot ?? input.roots, 'resource_roots', { min: 1, max: 64 });
  const resourceRoot = sha256Json(resourceRoots);
  const grantRef = optionalPublicRef(input.grant_ref ?? input.grantRef, refFromDigest('grant', resourceRoot), 'grant_ref');
  const body = {
    schema: PROOF_NETWORK_CAPABILITY_GRANT_SCHEMA,
    issued_at: isoTimestamp(input.issued_at ?? input.issuedAt, 'issued_at'),
    expires_at: isoTimestamp(input.expires_at ?? input.expiresAt, 'expires_at', '2100-01-01T00:00:00.000Z'),
    grant_ref: grantRef,
    issuer_ref: publicRef(input.issuer_ref ?? input.issuerRef, 'issuer_ref'),
    subject_ref: publicRef(input.subject_ref ?? input.subjectRef, 'subject_ref'),
    audience_ref: optionalPublicRef(input.audience_ref ?? input.audienceRef, 'audience:proof-network', 'audience_ref'),
    scopes: publicScopes(input.scopes ?? input.scope ?? input.capability_scope ?? input.capabilityScope ?? input.capability, 'scopes'),
    resource_root: resourceRoot,
    resource_roots: resourceRoots,
    max_uses: nonNegativeInteger(input.max_uses ?? input.maxUses, 'max_uses', 0),
    nonce_hash: optionalDigestRef(input.nonce_hash ?? input.nonceHash, sha256Json({ grant_ref: grantRef, resource_roots: resourceRoots }), 'nonce_hash'),
    ...((input.signature_ref ?? input.signatureRef) ? { signature_ref: signatureRef(input.signature_ref ?? input.signatureRef, 'signature_ref') } : {}),
    ...SAFE_BOOLEAN_BOUNDARIES,
  };
  if (Date.parse(body.expires_at) <= Date.parse(body.issued_at)) throw new RangeError('expires_at must be after issued_at');
  return freezeArtifact(body, 'capability_grant_id', 'capability_grant_hash', 'png');
}

export function validateCapabilityGrant(grant) {
  return collectValidation((errors) => {
    requiredObject(grant, 'grant');
    assertNoPrivateProofPayload(grant, 'grant');
    if (grant.schema !== PROOF_NETWORK_CAPABILITY_GRANT_SCHEMA) errors.push(`schema must be ${PROOF_NETWORK_CAPABILITY_GRANT_SCHEMA}`);
    requireSafeBoundaries(grant, errors, 'grant');
    isoTimestamp(grant.issued_at, 'issued_at');
    isoTimestamp(grant.expires_at, 'expires_at');
    if (Date.parse(grant.expires_at) <= Date.parse(grant.issued_at)) errors.push('expires_at must be after issued_at');
    publicRef(grant.grant_ref, 'grant_ref');
    publicRef(grant.issuer_ref, 'issuer_ref');
    publicRef(grant.subject_ref, 'subject_ref');
    publicRef(grant.audience_ref, 'audience_ref');
    const resourceRoots = digestArray(grant.resource_roots, 'resource_roots', { min: 1, max: 64 });
    if (grant.resource_root !== sha256Json(resourceRoots)) errors.push('resource_root mismatch');
    publicScopes(grant.scopes, 'scopes');
    nonNegativeInteger(grant.max_uses, 'max_uses');
    digestRef(grant.nonce_hash, 'nonce_hash');
    if (grant.signature_ref !== undefined) signatureRef(grant.signature_ref, 'signature_ref');
    validateIdentity(grant, errors, 'capability_grant_id', 'capability_grant_hash', 'png');
  });
}

export function createCapabilityRevocation(input = {}) {
  requiredObject(input, 'input');
  assertNoPrivateProofPayload(input, 'input');
  const grantHash = digestRef(input.grant_hash ?? input.grantHash, 'grant_hash');
  const nullifierRoot = optionalDigestRef(input.nullifier_root ?? input.nullifierRoot ?? input.nullifier_hash ?? input.nullifierHash, sha256Json({ grant_hash: grantHash, reason_ref: input.reason_ref ?? input.reasonRef ?? input.revocation_reason ?? input.revocationReason ?? 'reason:unspecified' }), 'nullifier_root');
  const revocationRef = optionalPublicRef(input.revocation_ref ?? input.revocationRef, refFromDigest('revocation', grantHash), 'revocation_ref');
  const grantId = optionalPublicRef(input.grant_id ?? input.grantId, refFromDigest('grant', grantHash), 'grant_id');
  const nullifierRef = optionalPublicRef(input.nullifier_ref ?? input.nullifierRef, refFromDigest('nullifier', nullifierRoot), 'nullifier_ref');
  const body = {
    schema: PROOF_NETWORK_CAPABILITY_REVOCATION_SCHEMA,
    revoked_at: isoTimestamp(input.revoked_at ?? input.revokedAt, 'revoked_at'),
    revocation_ref: revocationRef,
    grant_id: grantId,
    grant_hash: grantHash,
    issuer_ref: optionalPublicRef(input.issuer_ref ?? input.issuerRef, 'issuer:proof-network', 'issuer_ref'),
    reason_ref: optionalPublicRef(input.reason_ref ?? input.reasonRef ?? input.revocation_reason ?? input.revocationReason, 'reason:unspecified', 'reason_ref'),
    nullifier_ref: nullifierRef,
    nullifier_root: nullifierRoot,
    ...((input.signature_ref ?? input.signatureRef) ? { signature_ref: signatureRef(input.signature_ref ?? input.signatureRef, 'signature_ref') } : {}),
    ...SAFE_BOOLEAN_BOUNDARIES,
  };
  return freezeArtifact(body, 'capability_revocation_id', 'capability_revocation_hash', 'pnr');
}

export function validateCapabilityRevocation(revocation) {
  return collectValidation((errors) => {
    requiredObject(revocation, 'revocation');
    assertNoPrivateProofPayload(revocation, 'revocation');
    if (revocation.schema !== PROOF_NETWORK_CAPABILITY_REVOCATION_SCHEMA) errors.push(`schema must be ${PROOF_NETWORK_CAPABILITY_REVOCATION_SCHEMA}`);
    requireSafeBoundaries(revocation, errors, 'revocation');
    isoTimestamp(revocation.revoked_at, 'revoked_at');
    publicRef(revocation.revocation_ref, 'revocation_ref');
    publicRef(revocation.grant_id, 'grant_id');
    digestRef(revocation.grant_hash, 'grant_hash');
    publicRef(revocation.issuer_ref, 'issuer_ref');
    publicRef(revocation.reason_ref, 'reason_ref');
    publicRef(revocation.nullifier_ref, 'nullifier_ref');
    digestRef(revocation.nullifier_root, 'nullifier_root');
    if (revocation.signature_ref !== undefined) signatureRef(revocation.signature_ref, 'signature_ref');
    validateIdentity(revocation, errors, 'capability_revocation_id', 'capability_revocation_hash', 'pnr');
  });
}

export function createBenchmarkAttestation(input = {}) {
  requiredObject(input, 'input');
  assertNoPrivateProofPayload(input, 'input');
  const reportHash = digestRef(input.report_hash ?? input.reportHash ?? input.report_file_hash ?? input.reportFileHash, 'report_hash');
  const metricRoots = digestArray(input.metric_roots ?? input.metricRoots ?? input.metrics_hash ?? input.metricsHash ?? input.result_roots ?? input.resultRoots ?? input.score_refs ?? input.scoreRefs ?? reportHash, 'metric_roots', { min: 1, max: 64 });
  const body = {
    schema: PROOF_NETWORK_BENCHMARK_ATTESTATION_SCHEMA,
    attested_at: isoTimestamp(input.attested_at ?? input.attestedAt ?? input.generated_at ?? input.generatedAt ?? input.created_at ?? input.createdAt, 'attested_at'),
    benchmark_ref: optionalPublicRef(input.benchmark_ref ?? input.benchmarkRef, 'benchmark:memory-v1', 'benchmark_ref'),
    dataset_ref: publicRef(input.dataset_ref ?? input.datasetRef, 'dataset_ref'),
    runner_ref: publicRef(input.runner_ref ?? input.runnerRef, 'runner_ref'),
    package_ref: publicRef(input.package_ref ?? input.packageRef, 'package_ref'),
    report_hash: reportHash,
    metric_root: sha256Json(metricRoots),
    metric_roots: metricRoots,
    sample_count: nonNegativeInteger(input.sample_count ?? input.sampleCount, 'sample_count', 0),
    run_count: positiveInteger(input.run_count ?? input.runCount ?? 1, 'run_count'),
    ...((input.signature_ref ?? input.signatureRef) ? { signature_ref: signatureRef(input.signature_ref ?? input.signatureRef, 'signature_ref') } : {}),
    ...SAFE_BOOLEAN_BOUNDARIES,
  };
  return freezeArtifact(body, 'benchmark_attestation_id', 'benchmark_attestation_hash', 'pnb');
}

export function validateBenchmarkAttestation(attestation) {
  return collectValidation((errors) => {
    requiredObject(attestation, 'attestation');
    assertNoPrivateProofPayload(attestation, 'attestation');
    if (attestation.schema !== PROOF_NETWORK_BENCHMARK_ATTESTATION_SCHEMA) errors.push(`schema must be ${PROOF_NETWORK_BENCHMARK_ATTESTATION_SCHEMA}`);
    requireSafeBoundaries(attestation, errors, 'attestation');
    isoTimestamp(attestation.attested_at, 'attested_at');
    publicRef(attestation.benchmark_ref, 'benchmark_ref');
    publicRef(attestation.dataset_ref, 'dataset_ref');
    publicRef(attestation.runner_ref, 'runner_ref');
    publicRef(attestation.package_ref, 'package_ref');
    digestRef(attestation.report_hash, 'report_hash');
    const metricRoots = digestArray(attestation.metric_roots, 'metric_roots', { min: 1, max: 64 });
    if (attestation.metric_root !== sha256Json(metricRoots)) errors.push('metric_root mismatch');
    nonNegativeInteger(attestation.sample_count, 'sample_count');
    positiveInteger(attestation.run_count, 'run_count');
    if (attestation.signature_ref !== undefined) signatureRef(attestation.signature_ref, 'signature_ref');
    validateIdentity(attestation, errors, 'benchmark_attestation_id', 'benchmark_attestation_hash', 'pnb');
  });
}

export function createProofNetworkPacket(input = {}) {
  requiredObject(input, 'input');
  assertNoPrivateProofPayload(input, 'input');
  const artifacts = Object.freeze([
    ...arrayInput(input.artifacts),
    ...arrayInput(input.anchor_batch ?? input.anchorBatch),
    ...arrayInput(input.anchor_batches ?? input.anchorBatches),
    ...arrayInput(input.capability_grants ?? input.capabilityGrants),
    ...arrayInput(input.grants),
    ...arrayInput(input.capability_revocations ?? input.capabilityRevocations),
    ...arrayInput(input.revocations),
    ...arrayInput(input.benchmark_attestations ?? input.benchmarkAttestations),
    ...arrayInput(input.attestations),
  ]);
  if (artifacts.length === 0) throw new TypeError('artifacts must be non-empty');
  if (artifacts.length > 128) throw new TypeError('artifacts must contain at most 128 entries');
  const validatedArtifacts = Object.freeze(artifacts.map((artifact, index) => {
    requiredObject(artifact, `artifacts[${index}]`);
    if (!SUPPORTED_ARTIFACT_SCHEMAS.has(artifact.schema) || artifact.schema === PROOF_NETWORK_PACKET_SCHEMA) throw new TypeError(`artifacts[${index}] has unsupported schema`);
    const validation = validateSupportedArtifact(artifact);
    if (!validation.ok) throw new TypeError(`artifacts[${index}] is invalid: ${validation.errors.join('; ')}`);
    return Object.freeze(artifact);
  }));
  const artifactHashes = Object.freeze(validatedArtifacts.map(artifactHash).sort());
  const artifactRoot = sha256Json(artifactHashes);
  const body = {
    schema: PROOF_NETWORK_PACKET_SCHEMA,
    created_at: isoTimestamp(input.created_at ?? input.createdAt ?? input.generated_at ?? input.generatedAt, 'created_at'),
    packet_ref: optionalPublicRef(input.packet_ref ?? input.packetRef, refFromDigest('packet', artifactRoot), 'packet_ref'),
    artifact_count: validatedArtifacts.length,
    artifact_root: artifactRoot,
    artifact_hashes: artifactHashes,
    artifacts: validatedArtifacts,
    ...SAFE_BOOLEAN_BOUNDARIES,
  };
  return freezeArtifact(body, 'proof_network_packet_id', 'proof_network_packet_hash', 'pnp');
}

export function validateProofNetworkPacket(packet) {
  return collectValidation((errors) => {
    requiredObject(packet, 'packet');
    assertNoPrivateProofPayload(packet, 'packet');
    if (packet.schema !== PROOF_NETWORK_PACKET_SCHEMA) errors.push(`schema must be ${PROOF_NETWORK_PACKET_SCHEMA}`);
    requireSafeBoundaries(packet, errors, 'packet');
    isoTimestamp(packet.created_at, 'created_at');
    publicRef(packet.packet_ref, 'packet_ref');
    const artifacts = Array.isArray(packet.artifacts) ? packet.artifacts : [];
    if (artifacts.length === 0 || artifacts.length > 128) errors.push('artifacts must contain 1-128 entries');
    const artifactHashes = [];
    for (const [index, artifact] of artifacts.entries()) {
      requiredObject(artifact, `artifacts[${index}]`);
      if (artifact.schema === PROOF_NETWORK_PACKET_SCHEMA) {
        errors.push(`artifacts[${index}] must not be a nested packet`);
        continue;
      }
      const validation = validateSupportedArtifact(artifact);
      if (!validation.ok) errors.push(`artifacts[${index}] is invalid: ${validation.errors.join('; ')}`);
      artifactHashes.push(artifactHash(artifact, index));
    }
    artifactHashes.sort();
    if (packet.artifact_count !== artifacts.length) errors.push('artifact_count mismatch');
    if (packet.artifact_root !== sha256Json(artifactHashes)) errors.push('artifact_root mismatch');
    if (JSON.stringify(packet.artifact_hashes) !== JSON.stringify(artifactHashes)) errors.push('artifact_hashes mismatch');
    validateIdentity(packet, errors, 'proof_network_packet_id', 'proof_network_packet_hash', 'pnp');
  });
}

function registryEntryType(value, field = 'entry_type') {
  const type = optionalString(value, undefined, field);
  if (type === undefined || !REGISTRY_ENTRY_TYPES.has(type)) {
    throw new TypeError(`${field} must be one of ${[...REGISTRY_ENTRY_TYPES].join(', ')}`);
  }
  return type;
}

export function createRegistryEntry(input = {}) {
  requiredObject(input, 'input');
  assertNoPrivateProofPayload(input, 'input');
  const entryType = registryEntryType(input.entry_type ?? input.entryType ?? input.type, 'entry_type');
  const artifactHash = digestRef(input.artifact_hash ?? input.artifactHash ?? input.digest_ref ?? input.digestRef, 'artifact_hash');
  const artifactSchemaRef = publicRef(input.artifact_schema_ref ?? input.artifactSchemaRef ?? input.schema_ref ?? input.schemaRef, 'artifact_schema_ref');
  const digestRefs = digestArray(input.digest_refs ?? input.digestRefs ?? input.digest_roots ?? input.digestRoots ?? input.roots ?? artifactHash, 'digest_refs', { min: 1, max: 64 });
  const signerRefs = publicRefArray(input.signer_refs ?? input.signerRefs ?? input.signer_ref ?? input.signerRef, 'signer_refs', { min: 0, max: 64 });
  const entryRef = optionalPublicRef(input.entry_ref ?? input.entryRef, refFromDigest('registry-entry', artifactHash), 'entry_ref');
  const body = {
    schema: PROOF_NETWORK_REGISTRY_ENTRY_SCHEMA,
    registered_at: isoTimestamp(input.registered_at ?? input.registeredAt ?? input.created_at ?? input.createdAt ?? input.generated_at ?? input.generatedAt, 'registered_at'),
    entry_type: entryType,
    entry_ref: entryRef,
    registry_ref: optionalPublicRef(input.registry_ref ?? input.registryRef ?? input.marketplace_ref ?? input.marketplaceRef, 'registry:memory-drive-marketplace', 'registry_ref'),
    artifact_schema_ref: artifactSchemaRef,
    artifact_hash: artifactHash,
    digest_root: sha256Json(digestRefs),
    digest_refs: digestRefs,
    signer_refs: signerRefs,
    entry_count: nonNegativeInteger(input.entry_count ?? input.entryCount ?? input.count, 'entry_count', 1),
    ...((input.signature_ref ?? input.signatureRef) ? { signature_ref: signatureRef(input.signature_ref ?? input.signatureRef, 'signature_ref') } : {}),
    ...SAFE_BOOLEAN_BOUNDARIES,
  };
  return freezeArtifact(body, 'registry_entry_id', 'registry_entry_hash', 'pnrg');
}

export function validateRegistryEntry(entry) {
  return collectValidation((errors) => {
    requiredObject(entry, 'entry');
    assertNoPrivateProofPayload(entry, 'entry');
    if (entry.schema !== PROOF_NETWORK_REGISTRY_ENTRY_SCHEMA) errors.push(`schema must be ${PROOF_NETWORK_REGISTRY_ENTRY_SCHEMA}`);
    requireSafeBoundaries(entry, errors, 'entry');
    isoTimestamp(entry.registered_at, 'registered_at');
    if (!REGISTRY_ENTRY_TYPES.has(entry.entry_type)) errors.push(`entry_type must be one of ${[...REGISTRY_ENTRY_TYPES].join(', ')}`);
    publicRef(entry.entry_ref, 'entry_ref');
    publicRef(entry.registry_ref, 'registry_ref');
    publicRef(entry.artifact_schema_ref, 'artifact_schema_ref');
    digestRef(entry.artifact_hash, 'artifact_hash');
    const digestRefs = digestArray(entry.digest_refs, 'digest_refs', { min: 1, max: 64 });
    if (entry.digest_root !== sha256Json(digestRefs)) errors.push('digest_root mismatch');
    publicRefArray(entry.signer_refs, 'signer_refs', { min: 0, max: 64 });
    nonNegativeInteger(entry.entry_count, 'entry_count');
    if (entry.signature_ref !== undefined) signatureRef(entry.signature_ref, 'signature_ref');
    validateIdentity(entry, errors, 'registry_entry_id', 'registry_entry_hash', 'pnrg');
  });
}

export function createRegistryBatch(input = {}) {
  requiredObject(input, 'input');
  assertNoPrivateProofPayload(input, 'input');
  const entries = Object.freeze(arrayInput(input.entries ?? input.registry_entries ?? input.registryEntries).map((entry, index) => {
    requiredObject(entry, `entries[${index}]`);
    if (entry.schema !== PROOF_NETWORK_REGISTRY_ENTRY_SCHEMA) throw new TypeError(`entries[${index}] must be a ${PROOF_NETWORK_REGISTRY_ENTRY_SCHEMA}`);
    const validation = validateRegistryEntry(entry);
    if (!validation.ok) throw new TypeError(`entries[${index}] is invalid: ${validation.errors.join('; ')}`);
    return Object.freeze(entry);
  }));
  if (entries.length === 0) throw new TypeError('entries must be non-empty');
  if (entries.length > 128) throw new TypeError('entries must contain at most 128 entries');
  const entryHashes = Object.freeze(entries.map((entry) => requiredString(entry.registry_entry_hash, 'entries.registry_entry_hash')).sort());
  const registryRoot = sha256Json(entryHashes);
  const body = {
    schema: PROOF_NETWORK_REGISTRY_BATCH_SCHEMA,
    created_at: isoTimestamp(input.created_at ?? input.createdAt ?? input.generated_at ?? input.generatedAt, 'created_at'),
    registry_ref: optionalPublicRef(input.registry_ref ?? input.registryRef ?? input.marketplace_ref ?? input.marketplaceRef, refFromDigest('registry-batch', registryRoot), 'registry_ref'),
    entry_count: entries.length,
    registry_root: registryRoot,
    entry_hashes: entryHashes,
    entries,
    ...SAFE_BOOLEAN_BOUNDARIES,
  };
  return freezeArtifact(body, 'registry_batch_id', 'registry_batch_hash', 'pnrb');
}

export function validateRegistryBatch(batch) {
  return collectValidation((errors) => {
    requiredObject(batch, 'batch');
    assertNoPrivateProofPayload(batch, 'batch');
    if (batch.schema !== PROOF_NETWORK_REGISTRY_BATCH_SCHEMA) errors.push(`schema must be ${PROOF_NETWORK_REGISTRY_BATCH_SCHEMA}`);
    requireSafeBoundaries(batch, errors, 'batch');
    isoTimestamp(batch.created_at, 'created_at');
    publicRef(batch.registry_ref, 'registry_ref');
    const entries = Array.isArray(batch.entries) ? batch.entries : [];
    if (entries.length === 0 || entries.length > 128) errors.push('entries must contain 1-128 entries');
    const entryHashes = [];
    for (const [index, entry] of entries.entries()) {
      requiredObject(entry, `entries[${index}]`);
      if (entry.schema !== PROOF_NETWORK_REGISTRY_ENTRY_SCHEMA) {
        errors.push(`entries[${index}] must be a ${PROOF_NETWORK_REGISTRY_ENTRY_SCHEMA}`);
        continue;
      }
      const validation = validateRegistryEntry(entry);
      if (!validation.ok) errors.push(`entries[${index}] is invalid: ${validation.errors.join('; ')}`);
      entryHashes.push(requiredString(entry.registry_entry_hash, `entries[${index}].registry_entry_hash`));
    }
    entryHashes.sort();
    if (batch.entry_count !== entries.length) errors.push('entry_count mismatch');
    if (batch.registry_root !== sha256Json(entryHashes)) errors.push('registry_root mismatch');
    if (JSON.stringify(batch.entry_hashes) !== JSON.stringify(entryHashes)) errors.push('entry_hashes mismatch');
    validateIdentity(batch, errors, 'registry_batch_id', 'registry_batch_hash', 'pnrb');
  });
}

export const createProofRegistryEntry = createRegistryEntry;
export const validateProofRegistryEntry = validateRegistryEntry;
export const createProofRegistryBatch = createRegistryBatch;
export const validateProofRegistryBatch = validateRegistryBatch;
