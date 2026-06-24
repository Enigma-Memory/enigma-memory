import {
  EMPTY_MERKLE_ROOT,
  MerkleSet,
  canonicalize,
  generateSigningKeyPair,
  sha256Hex,
  signPayload,
  verifySignature
} from '../../core/src/index.js';

const ED25519 = 'Ed25519';
const NODE_SCHEMA = 'enigma.mesh_node.v1';
const CAPSULE_SCHEMA = 'enigma.capsule_manifest.v1';
const WITNESS_SCHEMA = 'enigma.witness_checkpoint.v1';
const RELAY_RECORD_SCHEMA = 'enigma.relay_record.v1';
const FEDERATION_GRANT_SCHEMA = 'enigma.federation_grant.v1';
const DEFAULT_NOW = '1970-01-01T00:00:00.000Z';
const DEFAULT_EXPIRY = '2100-01-01T00:00:00.000Z';
const ROOT_RE = /^sha256:[a-f0-9]{64}$/;
const HASH_RE = /^[a-f0-9]{64}$/;
const FORBIDDEN_PLAINTEXT_KEYS = new Set([
  'plaintext',
  'plaintextmemory',
  'plainmemory',
  'cleartext',
  'rawmemory',
  'memoryplaintext',
  'memory',
  'memories',
  'text',
  'content',
  'body',
  'prompt',
  'prompttext',
  'completion',
  'message',
  'messagetext',
  'conversation',
  'conversationtext',
  'transcript',
  'transcripttext'
]);
const RELAY_INPUT_KEYS = new Set([
  'record_id',
  'recordId',
  'capsule_id',
  'capsuleId',
  'encrypted_payload_hash',
  'encryptedPayloadHash',
  'payload_hash',
  'payloadHash',
  'opaque_encrypted_record',
  'opaqueEncryptedRecord',
  'encrypted_payload',
  'encryptedPayload',
  'ciphertext',
  'received_at',
  'receivedAt',
  'expires_at',
  'expiresAt'
]);

function isPlainRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(value, field) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${field} is required`);
  return value;
}

function normalizeKeyName(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
}

const ENCRYPTED_PAYLOAD_RE = /^(age1|enc:|encrypted:|ciphertext:|jwe:|xchacha20poly1305:|aes256gcm:|sealed:)[A-Za-z0-9+/_=:.~-]+$/i;
const COMMITMENT_RE = /^(sha256:[a-f0-9]{64}|hmac-sha256:[a-f0-9]{64}|commitment:sha256:[a-f0-9]{64})$/i;

function isForbiddenPlaintextKey(key) {
  return FORBIDDEN_PLAINTEXT_KEYS.has(normalizeKeyName(key));
}

function assertEncryptedEnvelopeOrCommitment(value, field) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${field} must be an encrypted envelope or commitment`);
  if (!ENCRYPTED_PAYLOAD_RE.test(value) && !COMMITMENT_RE.test(value)) {
    throw new Error(`${field} must be an explicit encrypted envelope or commitment`);
  }
}

function hasPlaintextLeak(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => hasPlaintextLeak(item, seen));
  for (const [key, nested] of Object.entries(value)) {
    if (isForbiddenPlaintextKey(key) && nested !== undefined && nested !== null && nested !== '') return true;
    if (hasPlaintextLeak(nested, seen)) return true;
  }
  return false;
}

function assertNoPlaintext(value, context) {
  if (hasPlaintextLeak(value)) throw new Error(`${context} contains plaintext memory fields`);
}

function assertOnlyRelayFields(record) {
  for (const key of Object.keys(record)) {
    if (!RELAY_INPUT_KEYS.has(key)) throw new Error(`relay record field ${key} is not opaque encrypted metadata`);
  }
}

function rootFromValue(value) {
  return `sha256:${sha256Hex(typeof value === 'string' ? value : canonicalize(value))}`;
}

function normalizeRoot(value, field, fallback = EMPTY_MERKLE_ROOT) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string') throw new TypeError(`${field} must be a sha256 root`);
  if (ROOT_RE.test(value)) return value;
  if (HASH_RE.test(value)) return `sha256:${value}`;
  throw new TypeError(`${field} must be a sha256 root`);
}

function compareExpectedRoot(actual, expected, field, errors, message) {
  if (expected === undefined) return;
  try {
    if (actual !== normalizeRoot(expected, field)) errors.push(message);
  } catch {
    errors.push(`${field} must be a sha256 root`);
  }
}

function normalizeHashableRoot(options, names, field) {
  for (const name of names) {
    if (options[name] !== undefined) return normalizeRoot(options[name], field);
  }
  return undefined;
}

function normalizeEncryptedPayloadHash(options) {
  const encrypted = options.encrypted_payload ?? options.encryptedPayload ?? options.opaque_encrypted_record ?? options.opaqueEncryptedRecord ?? options.ciphertext;
  if (encrypted !== undefined) assertEncryptedEnvelopeOrCommitment(encrypted, 'encrypted_payload');
  const explicit = normalizeHashableRoot(options, ['encrypted_payload_hash', 'encryptedPayloadHash', 'payload_hash', 'payloadHash'], 'encrypted_payload_hash');
  if (explicit !== undefined) return explicit;
  if (encrypted === undefined) throw new TypeError('encrypted_payload_hash is required');
  return rootFromValue(encrypted);
}

function arrayOfStrings(value, field, fallback = []) {
  if (value === undefined) return fallback;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.length === 0)) {
    throw new TypeError(`${field} must be an array of strings`);
  }
  return [...value];
}

function dateString(value, field, fallback) {
  const string = requiredString(value ?? fallback, field);
  if (Number.isNaN(Date.parse(string))) throw new TypeError(`${field} must be an ISO date string`);
  return string;
}

function signaturePayload(record) {
  const { signature, descriptor_hash, capsule_hash, witness_hash, grant_hash, ...unsigned } = record;
  return unsigned;
}

function signerFrom(options, fallbackNode) {
  const node = options.node ?? fallbackNode;
  if (node?.privateKey) {
    return {
      key_id: node.signer?.key_id ?? node.trust_descriptor?.key?.key_id,
      privateKey: node.privateKey,
      publicKey: node.publicKey ?? node.trust_descriptor?.key?.public_key,
      node_id: node.node_id
    };
  }
  return {
    key_id: options.key_id ?? options.keyId ?? options.signer?.key_id,
    privateKey: options.privateKey,
    publicKey: options.publicKey,
    node_id: options.node_id ?? options.nodeId
  };
}

function createSignature(unsigned, signer) {
  if (signer.privateKey === undefined) throw new TypeError('privateKey is required');
  const key_id = requiredString(signer.key_id, 'signer.key_id');
  return { alg: ED25519, key_id, value: signPayload({ payload: unsigned, privateKey: signer.privateKey }) };
}

function resolvePublicKey(keyId, options = {}) {
  if (options.publicKey !== undefined) return options.publicKey;
  const node = options.node;
  if (node?.signer?.key_id === keyId && node.publicKey !== undefined) return node.publicKey;
  const descriptor = options.trustDescriptor ?? options.issuerDescriptor ?? options.witnessDescriptor ?? options.descriptor;
  if (descriptor?.key?.key_id === keyId) return descriptor.key.public_key;
  const publicKeys = options.publicKeys ?? options.keyring ?? options.keys;
  if (publicKeys instanceof Map) return publicKeys.get(keyId);
  if (typeof publicKeys === 'function') return publicKeys(keyId);
  if (isPlainRecord(publicKeys)) return publicKeys[keyId];
  return undefined;
}

function verifySignedRecord(record, options, errors) {
  if (!isPlainRecord(record.signature)) {
    errors.push('signature missing');
    return;
  }
  if (record.signature.alg !== ED25519 || typeof record.signature.key_id !== 'string' || typeof record.signature.value !== 'string') {
    errors.push('signature malformed');
    return;
  }
  const expectedKeyId = options.expectedKeyId ?? options.signerKeyId ?? options.key_id ?? options.keyId;
  if (expectedKeyId !== undefined && record.signature.key_id !== expectedKeyId) errors.push('signer mismatch');
  const publicKey = resolvePublicKey(record.signature.key_id, options);
  if (publicKey === undefined) {
    errors.push(`missing public key for ${record.signature.key_id}`);
    return;
  }
  if (!verifySignature({ payload: signaturePayload(record), signature: record.signature, publicKey })) errors.push('signature mismatch');
}

function verificationResult(errors, extra = {}) {
  const ok = errors.length === 0;
  return { ok, valid: ok, errors, ...extra };
}


function createSignedDescriptor({ keyPair, node_id, role, capabilities, trust_roots, endpoints, created_at }) {
  const unsigned = {
    schema: NODE_SCHEMA,
    node_id,
    role,
    key: { alg: ED25519, key_id: keyPair.key_id, public_key: keyPair.publicKey },
    public_key: keyPair.publicKey,
    capabilities,
    trust_roots,
    endpoints,
    created_at
  };
  const signature = createSignature(unsigned, { key_id: keyPair.key_id, privateKey: keyPair.privateKey });
  const signed = { ...unsigned, signature };
  return { ...signed, descriptor_hash: rootFromValue(signed) };
}

export function createMeshNode(options = {}) {
  const keyPair = options.keyPair ?? options.signingKeyPair ?? generateSigningKeyPair(options.keyOptions ?? {});
  const node_id = options.node_id ?? options.nodeId ?? `node_${sha256Hex(keyPair.publicKey).slice(0, 32)}`;
  const created_at = dateString(options.created_at ?? options.createdAt, 'created_at', DEFAULT_NOW);
  const capabilities = arrayOfStrings(options.capabilities, 'capabilities', ['capsule_manifest', 'witness_checkpoint', 'relay_store', 'federation_grant']);
  const trust_roots = arrayOfStrings(options.trust_roots ?? options.trustRoots, 'trust_roots', []);
  const endpoints = arrayOfStrings(options.endpoints, 'endpoints', []);
  const role = options.role ?? 'mesh_node';
  const trust_descriptor = createSignedDescriptor({ keyPair, node_id, role, capabilities, trust_roots, endpoints, created_at });
  return {
    schema: NODE_SCHEMA,
    node_id,
    signer: { alg: ED25519, key_id: keyPair.key_id },
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
    trust_descriptor,
    public_descriptor: trust_descriptor
  };
}

export function createCapsuleManifest(options = {}) {
  assertNoPlaintext(options, 'capsule manifest');
  const signer = signerFrom(options);
  const issuer = requiredString(options.issuer ?? signer.node_id, 'issuer');
  const holder = requiredString(options.holder ?? options.holder_id ?? options.holderId, 'holder');
  const ownerScope = options.owner_scope_hash ?? options.ownerScopeHash ?? rootFromValue(options.owner_scope ?? options.ownerScope ?? holder);
  const encrypted_payload_hash = normalizeEncryptedPayloadHash(options);
  const unsigned = {
    schema: CAPSULE_SCHEMA,
    capsule_id: options.capsule_id ?? options.capsuleId ?? `cap_${sha256Hex(canonicalize({ issuer, holder, ownerScope, encrypted_payload_hash })).slice(0, 32)}`,
    encrypted_payload_hash,
    receipt_log_root: normalizeRoot(options.receipt_log_root ?? options.receiptLogRoot, 'receipt_log_root'),
    active_set_root: normalizeRoot(options.active_set_root ?? options.activeSetRoot ?? options.active_memory_root ?? options.activeMemoryRoot, 'active_set_root'),
    owner_scope_hash: normalizeRoot(ownerScope, 'owner_scope_hash'),
    issuer,
    holder,
    issued_at: dateString(options.issued_at ?? options.issuedAt, 'issued_at', DEFAULT_NOW),
    expires_at: dateString(options.expires_at ?? options.expiresAt, 'expires_at', DEFAULT_EXPIRY)
  };
  const manifest = { ...unsigned, signature: createSignature(unsigned, signer) };
  return { ...manifest, capsule_hash: rootFromValue(manifest) };
}

export function verifyCapsuleManifest(manifest, options = {}) {
  const errors = [];
  if (!isPlainRecord(manifest)) return verificationResult(['capsule manifest must be an object']);
  if (hasPlaintextLeak(manifest)) errors.push('plaintext memory fields present');
  if (manifest.schema !== CAPSULE_SCHEMA) errors.push('schema mismatch');
  for (const field of ['encrypted_payload_hash', 'receipt_log_root', 'active_set_root', 'owner_scope_hash']) {
    if (!ROOT_RE.test(manifest[field] ?? '')) errors.push(`${field} must be a sha256 root`);
  }
  for (const field of ['capsule_id', 'issuer', 'holder', 'issued_at', 'expires_at']) {
    if (typeof manifest[field] !== 'string' || manifest[field].length === 0) errors.push(`${field} is required`);
  }
  compareExpectedRoot(manifest.receipt_log_root, options.expectedReceiptLogRoot, 'expectedReceiptLogRoot', errors, 'receipt log root mismatch');
  compareExpectedRoot(manifest.active_set_root, options.expectedActiveSetRoot, 'expectedActiveSetRoot', errors, 'active set root mismatch');
  compareExpectedRoot(manifest.owner_scope_hash, options.expectedOwnerScopeHash, 'expectedOwnerScopeHash', errors, 'owner scope mismatch');
  if (options.expectedIssuer !== undefined && manifest.issuer !== options.expectedIssuer) errors.push('issuer mismatch');
  if (options.expectedHolder !== undefined && manifest.holder !== options.expectedHolder) errors.push('holder mismatch');
  const now = options.now === undefined ? undefined : Date.parse(options.now);
  if (now !== undefined && Number.isFinite(now) && Date.parse(manifest.expires_at) <= now) errors.push('capsule expired');
  verifySignedRecord(manifest, options, errors);
  return verificationResult(errors, { capsule_hash: rootFromValue(manifest) });
}

export function createWitnessCheckpoint(options = {}) {
  assertNoPlaintext(options, 'witness checkpoint');
  const signer = signerFrom(options);
  const witness_node_id = requiredString(options.witness_node_id ?? options.witnessNodeId ?? signer.node_id, 'witness_node_id');
  const subject_node_id = requiredString(options.subject_node_id ?? options.subjectNodeId ?? options.subject ?? 'subject', 'subject_node_id');
  const receipt_log_root = normalizeRoot(options.receipt_log_root ?? options.receiptLogRoot, 'receipt_log_root');
  const active_set_root = normalizeRoot(options.active_set_root ?? options.activeSetRoot ?? options.active_memory_root ?? options.activeMemoryRoot, 'active_set_root');
  const epoch = options.epoch === undefined ? 0 : options.epoch;
  if (!Number.isInteger(epoch) || epoch < 0) throw new TypeError('epoch must be a non-negative integer');
  const previous_witness_hash = normalizeRoot(options.previous_witness_hash ?? options.previousWitnessHash ?? EMPTY_MERKLE_ROOT, 'previous_witness_hash');
  const computed_checkpoint_root = rootFromValue({ subject_node_id, receipt_log_root, active_set_root, epoch, previous_witness_hash });
  const suppliedCheckpointRoot = options.checkpoint_root ?? options.checkpointRoot;
  const checkpoint_root = suppliedCheckpointRoot === undefined
    ? computed_checkpoint_root
    : normalizeRoot(suppliedCheckpointRoot, 'checkpoint_root');
  if (checkpoint_root !== computed_checkpoint_root) throw new Error('checkpoint_root does not match checkpoint contents');
  const unsigned = {
    schema: WITNESS_SCHEMA,
    witness_checkpoint_id: options.witness_checkpoint_id ?? options.witnessCheckpointId ?? `wit_${sha256Hex(canonicalize({ witness_node_id, subject_node_id, checkpoint_root })).slice(0, 32)}`,
    witness_node_id,
    subject_node_id,
    epoch,
    checkpoint_root,
    receipt_log_root,
    active_set_root,
    previous_witness_hash,
    issued_at: dateString(options.issued_at ?? options.issuedAt, 'issued_at', DEFAULT_NOW)
  };
  const checkpoint = { ...unsigned, signature: createSignature(unsigned, signer) };
  return { ...checkpoint, witness_hash: rootFromValue(checkpoint) };
}

export function verifyWitnessCheckpoint(checkpoint, options = {}) {
  const errors = [];
  if (!isPlainRecord(checkpoint)) return verificationResult(['witness checkpoint must be an object']);
  if (hasPlaintextLeak(checkpoint)) errors.push('plaintext memory fields present');
  if (checkpoint.schema !== WITNESS_SCHEMA) errors.push('schema mismatch');
  for (const field of ['checkpoint_root', 'receipt_log_root', 'active_set_root', 'previous_witness_hash']) {
    if (!ROOT_RE.test(checkpoint[field] ?? '')) errors.push(`${field} must be a sha256 root`);
  }
  if (!Number.isInteger(checkpoint.epoch) || checkpoint.epoch < 0) errors.push('epoch must be a non-negative integer');
  const computedCheckpointRoot = rootFromValue({
    subject_node_id: checkpoint.subject_node_id,
    receipt_log_root: checkpoint.receipt_log_root,
    active_set_root: checkpoint.active_set_root,
    epoch: checkpoint.epoch,
    previous_witness_hash: checkpoint.previous_witness_hash
  });
  if (checkpoint.checkpoint_root !== computedCheckpointRoot) errors.push('checkpoint root mismatch');
  compareExpectedRoot(checkpoint.checkpoint_root, options.expectedCheckpointRoot, 'expectedCheckpointRoot', errors, 'checkpoint root mismatch');
  compareExpectedRoot(checkpoint.receipt_log_root, options.expectedReceiptLogRoot, 'expectedReceiptLogRoot', errors, 'receipt log root mismatch');
  compareExpectedRoot(checkpoint.active_set_root, options.expectedActiveSetRoot, 'expectedActiveSetRoot', errors, 'active set root mismatch');
  compareExpectedRoot(checkpoint.previous_witness_hash, options.expectedPreviousWitnessHash, 'expectedPreviousWitnessHash', errors, 'previous witness hash mismatch');
  if (options.minimumEpoch !== undefined && (!Number.isInteger(options.minimumEpoch) || checkpoint.epoch < options.minimumEpoch)) errors.push('epoch continuity mismatch');
  if (options.expectedWitnessNodeId !== undefined && checkpoint.witness_node_id !== options.expectedWitnessNodeId) errors.push('witness node mismatch');
  verifySignedRecord(checkpoint, options, errors);
  return verificationResult(errors, { witness_hash: rootFromValue(checkpoint) });
}

export function createRelayStore(options = {}) {
  const node = options.node;
  return {
    schema: 'enigma.relay_store.v1',
    store_id: options.store_id ?? options.storeId ?? `relay_${sha256Hex(canonicalize({ node_id: node?.node_id ?? 'local', created_at: options.created_at ?? DEFAULT_NOW })).slice(0, 32)}`,
    node_id: options.node_id ?? options.nodeId ?? node?.node_id ?? 'local',
    created_at: dateString(options.created_at ?? options.createdAt, 'created_at', DEFAULT_NOW),
    records: new Map(),
    node
  };
}

export function pushRelayRecord(store, record = {}) {
  if (!isPlainRecord(store) || !(store.records instanceof Map)) throw new TypeError('relay store is required');
  if (!isPlainRecord(record)) throw new TypeError('relay record must be an object');
  assertNoPlaintext(record, 'relay record');
  assertOnlyRelayFields(record);
  const encrypted_payload_hash = normalizeEncryptedPayloadHash(record);
  const unsigned = {
    schema: RELAY_RECORD_SCHEMA,
    record_id: record.record_id ?? record.recordId ?? `rel_${sha256Hex(canonicalize({ store_id: store.store_id, encrypted_payload_hash })).slice(0, 32)}`,
    store_id: store.store_id,
    capsule_id: record.capsule_id ?? record.capsuleId ?? null,
    encrypted_payload_hash,
    payload_storage: 'hash_only',
    received_at: dateString(record.received_at ?? record.receivedAt, 'received_at', DEFAULT_NOW),
    expires_at: record.expires_at ?? record.expiresAt ? dateString(record.expires_at ?? record.expiresAt, 'expires_at') : null
  };
  const signer = store.node?.privateKey ? signerFrom({}, store.node) : null;
  const relayRecord = signer ? { ...unsigned, signature: createSignature(unsigned, signer) } : unsigned;
  store.records.set(relayRecord.record_id, Object.freeze({ ...relayRecord }));
  return { ...relayRecord, relay_record_id: relayRecord.record_id };
}

export function pullRelayRecord(store, recordRef) {
  if (!isPlainRecord(store) || !(store.records instanceof Map)) throw new TypeError('relay store is required');
  const record_id = typeof recordRef === 'string' ? recordRef : recordRef?.record_id ?? recordRef?.recordId ?? recordRef?.relay_record_id;
  if (typeof record_id !== 'string' || record_id.length === 0) throw new TypeError('record_id is required');
  const record = store.records.get(record_id) ?? null;
  if (record !== null && hasPlaintextLeak(record)) throw new Error('stored relay record contains plaintext memory fields');
  return record === null ? null : { ...record, relay_record_id: record.record_id };
}

export function createFederationGrant(options = {}) {
  assertNoPlaintext(options, 'federation grant');
  const signer = signerFrom(options);
  const subjects = arrayOfStrings(options.subjects ?? options.subject_ids ?? options.subjectIds, 'subjects');
  const operations = arrayOfStrings(options.operations, 'operations');
  const issuer = requiredString(options.issuer ?? signer.node_id, 'issuer');
  const holder = requiredString(options.holder ?? options.holder_id ?? options.holderId, 'holder');
  const unsigned = {
    schema: FEDERATION_GRANT_SCHEMA,
    grant_id: options.grant_id ?? options.grantId ?? `fgr_${sha256Hex(canonicalize({ issuer, holder, subjects, operations, purpose: options.purpose })).slice(0, 32)}`,
    issuer,
    holder,
    subjects: [...subjects].sort(),
    operations: [...operations].sort(),
    purpose: requiredString(options.purpose, 'purpose'),
    issued_at: dateString(options.issued_at ?? options.issuedAt, 'issued_at', DEFAULT_NOW),
    expires_at: dateString(options.expires_at ?? options.expiresAt, 'expires_at', DEFAULT_EXPIRY)
  };
  const grant = { ...unsigned, signature: createSignature(unsigned, signer) };
  return { ...grant, grant_hash: rootFromValue(grant) };
}

export function verifyFederationGrant(grant, options = {}) {
  const errors = [];
  if (!isPlainRecord(grant)) return verificationResult(['federation grant must be an object']);
  if (hasPlaintextLeak(grant)) errors.push('plaintext memory fields present');
  if (grant.schema !== FEDERATION_GRANT_SCHEMA) errors.push('schema mismatch');
  if (!Array.isArray(grant.subjects) || grant.subjects.some((item) => typeof item !== 'string' || item.length === 0)) errors.push('subjects must be strings');
  if (!Array.isArray(grant.operations) || grant.operations.some((item) => typeof item !== 'string' || item.length === 0)) errors.push('operations must be strings');
  for (const field of ['grant_id', 'issuer', 'holder', 'purpose', 'issued_at', 'expires_at']) {
    if (typeof grant[field] !== 'string' || grant[field].length === 0) errors.push(`${field} is required`);
  }
  const expectedSubject = options.expectedSubject ?? options.subject;
  if (expectedSubject !== undefined && !grant.subjects?.includes(expectedSubject)) errors.push('subject not granted');
  const expectedOperation = options.expectedOperation ?? options.operation;
  if (expectedOperation !== undefined && !grant.operations?.includes(expectedOperation)) errors.push('operation not granted');
  if (options.expectedPurpose !== undefined && grant.purpose !== options.expectedPurpose) errors.push('purpose mismatch');
  if (options.expectedIssuer !== undefined && grant.issuer !== options.expectedIssuer) errors.push('issuer mismatch');
  if (options.expectedHolder !== undefined && grant.holder !== options.expectedHolder) errors.push('holder mismatch');
  const now = options.now === undefined ? undefined : Date.parse(options.now);
  if (now !== undefined && Number.isFinite(now) && Date.parse(grant.expires_at) <= now) errors.push('grant expired');
  verifySignedRecord(grant, options, errors);
  return verificationResult(errors, { grant_hash: rootFromValue(grant) });
}

export function runMeshDemo(options = {}) {
  const node = createMeshNode({ created_at: options.now ?? DEFAULT_NOW });
  const holder = options.holder ?? 'holder:demo';
  const activeSet = new MerkleSet(['mem:hmac-sha256:demo-active-address']);
  const receiptLog = new MerkleSet(['sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']);
  const active_set_root = activeSet.root();
  const receipt_log_root = receiptLog.root();
  const encrypted_payload = 'age1-encrypted-demo-capsule-only';
  const capsule = createCapsuleManifest({ node, issuer: node.node_id, holder, encrypted_payload, receipt_log_root, active_set_root, owner_scope: { holder, scope: 'demo' } });
  const capsuleVerification = verifyCapsuleManifest(capsule, {
    trustDescriptor: node.trust_descriptor,
    expectedIssuer: node.node_id,
    expectedHolder: holder,
    expectedReceiptLogRoot: receipt_log_root,
    expectedActiveSetRoot: active_set_root,
    now: options.now ?? DEFAULT_NOW
  });
  const witness = createWitnessCheckpoint({ node, witness_node_id: node.node_id, subject_node_id: holder, receipt_log_root, active_set_root, epoch: 1 });
  const witnessVerification = verifyWitnessCheckpoint(witness, {
    trustDescriptor: node.trust_descriptor,
    expectedWitnessNodeId: node.node_id,
    expectedReceiptLogRoot: receipt_log_root,
    expectedActiveSetRoot: active_set_root
  });
  const relayStore = createRelayStore({ node, created_at: options.now ?? DEFAULT_NOW });
  const relayRecord = pushRelayRecord(relayStore, { capsule_id: capsule.capsule_id, opaque_encrypted_record: encrypted_payload });
  let rejected_plaintext = false;
  try {
    pushRelayRecord(relayStore, { plaintext: 'demo memory must never cross the mesh', opaque_encrypted_record: encrypted_payload });
  } catch {
    rejected_plaintext = true;
  }
  const grant = createFederationGrant({ node, issuer: node.node_id, holder, subjects: [holder], operations: ['capsule.pull', 'witness.verify'], purpose: 'demo federation', expires_at: DEFAULT_EXPIRY });
  const grantVerification = verifyFederationGrant(grant, {
    trustDescriptor: node.trust_descriptor,
    expectedIssuer: node.node_id,
    expectedHolder: holder,
    expectedSubject: holder,
    expectedOperation: 'capsule.pull',
    expectedPurpose: 'demo federation',
    now: options.now ?? DEFAULT_NOW
  });
  const artifacts = { descriptor: node.trust_descriptor, capsule, witness, relayRecord, grant };
  const no_plaintext_leakage = !hasPlaintextLeak(artifacts);
  const ok = capsuleVerification.ok && witnessVerification.ok && grantVerification.ok && Boolean(relayRecord.record_id) && rejected_plaintext && no_plaintext_leakage;
  return {
    ok,
    node: { node_id: node.node_id, trust_descriptor: node.trust_descriptor },
    capsule: { ok: capsuleVerification.ok, capsule_id: capsule.capsule_id },
    witness: { ok: witnessVerification.ok, witness_checkpoint_id: witness.witness_checkpoint_id },
    relay: { record_id: relayRecord.record_id, rejected_plaintext },
    federation: { ok: grantVerification.ok, grant_id: grant.grant_id },
    capsule_verification_ok: capsuleVerification.ok,
    witness_verification_ok: witnessVerification.ok,
    relay_record_id: relayRecord.record_id,
    federation_grant_verification_ok: grantVerification.ok,
    no_plaintext_leakage
  };
}

export default {
  createMeshNode,
  createCapsuleManifest,
  verifyCapsuleManifest,
  createWitnessCheckpoint,
  verifyWitnessCheckpoint,
  createRelayStore,
  pushRelayRecord,
  pullRelayRecord,
  createFederationGrant,
  verifyFederationGrant,
  runMeshDemo
};
