import {
  createHash,
  createHmac,
  createPublicKey,
  generateKeyPairSync,
  sign as ed25519Sign,
  verify as ed25519Verify
} from 'node:crypto';

export const SHA256_PREFIX = 'sha256:';
export const EMPTY_MERKLE_ROOT = `${SHA256_PREFIX}${sha256Hex('enigma.merkle.empty.v1')}`;

const RECEIPT_SCHEMA = 'enigma.receipt.v1';
const CHECKPOINT_SCHEMA = 'enigma.state_checkpoint.v1';
const ED25519 = 'Ed25519';
const GENESIS = 'GENESIS';
const ROOT_RE = /^sha256:[a-f0-9]{64}$/;
const HASH_RE = /^[a-f0-9]{64}$/;
const RECEIPT_TOP_LEVEL_FIELDS = new Set([
  'schema',
  'receipt_id',
  'event_hash',
  'operation',
  'tenant_id',
  'subject_id',
  'memory_addr',
  'source_addr',
  'provider',
  'model',
  'policy_id',
  'sequence',
  'previous_receipt_hash',
  'active_set_root',
  'receipt_log_root',
  'timestamp',
  'signer',
  'signature'
]);
const RECEIPT_SIGNATURE_FIELDS = new Set(['alg', 'value']);
const RECEIPT_PUBLIC_PLAINTEXT_KEYS = new Set(['body', 'content', 'plaintext', 'text', 'memory', 'prompt', 'response', 'raw_memory']);

export function canonicalize(value) {
  return canonicalizeValue(value, new WeakSet());
}

function canonicalizeValue(value, seen) {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError('canonical JSON cannot encode non-finite numbers');
      return JSON.stringify(Object.is(value, -0) ? 0 : value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'undefined':
    case 'function':
    case 'symbol':
    case 'bigint':
      throw new TypeError(`canonical JSON cannot encode ${typeof value}`);
    case 'object':
      break;
    default:
      throw new TypeError(`canonical JSON cannot encode ${typeof value}`);
  }

  if (seen.has(value)) throw new TypeError('canonical JSON cannot encode circular structures');
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const items = new Array(value.length);
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          throw new TypeError('canonical JSON cannot encode sparse arrays');
        }
        items[index] = canonicalizeValue(value[index], seen);
      }
      return `[${items.join(',')}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('canonical JSON only accepts plain objects, arrays, and primitives');
    }

    const keys = Object.keys(value).sort();
    const fields = new Array(keys.length);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      fields[index] = `${JSON.stringify(key)}:${canonicalizeValue(value[key], seen)}`;
    }
    return `{${fields.join(',')}}`;
  } finally {
    seen.delete(value);
  }
}

export function sha256Hex(value) {
  return createHash('sha256').update(bytesForHash(value)).digest('hex');
}

export function hmacSha256Hex(keyOrArgs, value) {
  const args = isPlainRecord(keyOrArgs) && Object.prototype.hasOwnProperty.call(keyOrArgs, 'key')
    ? keyOrArgs
    : { key: keyOrArgs, value };
  if (args.key === undefined) throw new TypeError('hmacSha256Hex requires a key');
  return createHmac('sha256', bytesForKey(args.key)).update(bytesForHash(args.value)).digest('hex');
}

export function generateSigningKeyPair(options = {}) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  const key_id = options.key_id ?? options.keyId ?? `ed25519:${sha256Hex(publicKey).slice(0, 32)}`;
  return {
    alg: ED25519,
    key_id,
    signer: { key_id, alg: ED25519 },
    publicKey,
    privateKey
  };
}

export function signPayload(payloadOrArgs, maybePrivateKey) {
  const args = isPlainRecord(payloadOrArgs) && Object.prototype.hasOwnProperty.call(payloadOrArgs, 'payload')
    ? payloadOrArgs
    : { payload: payloadOrArgs, privateKey: maybePrivateKey };
  if (args.privateKey === undefined) throw new TypeError('signPayload requires a privateKey');
  const signature = ed25519Sign(null, bytesForSigning(args.payload), args.privateKey);
  return signature.toString('base64url');
}

export function verifySignature(payloadOrArgs, maybeSignature, maybePublicKey) {
  const args = isPlainRecord(payloadOrArgs) && Object.prototype.hasOwnProperty.call(payloadOrArgs, 'payload')
    ? payloadOrArgs
    : { payload: payloadOrArgs, signature: maybeSignature, publicKey: maybePublicKey };
  if (args.publicKey === undefined || args.signature === undefined) return false;
  try {
    return ed25519Verify(null, bytesForSigning(args.payload), args.publicKey, decodeSignature(args.signature));
  } catch {
    return false;
  }
}

export function receiptHash(receipt) {
  return prefixedSha256(canonicalize(receipt));
}

export function createReceipt(receiptOrArgs, maybeOptions = {}) {
  const options = normalizeCreateReceiptArgs(receiptOrArgs, maybeOptions);
  const source = options.event ?? options;
  const sequence = requiredInteger(options.sequence ?? source.sequence, 'sequence');
  const previous_receipt_hash = normalizePreviousHash(
    options.previous_receipt_hash ?? options.previousReceiptHash ?? (sequence === 0 ? GENESIS : undefined)
  );
  const event_hash = normalizeSha256Root(options.event_hash ?? options.eventHash ?? source.event_hash ?? eventHash(source), 'event_hash');
  const active_set_root = normalizeSha256Root(options.active_set_root ?? options.activeSetRoot ?? EMPTY_MERKLE_ROOT, 'active_set_root');
  const receipt_log_root = normalizeSha256Root(options.receipt_log_root ?? options.receiptLogRoot ?? EMPTY_MERKLE_ROOT, 'receipt_log_root');
  const operation = requiredString(options.operation ?? source.operation, 'operation');
  const timestamp = requiredString(options.timestamp ?? source.timestamp ?? new Date().toISOString(), 'timestamp');
  const signer = normalizeSigner(options.signer, options.key_id ?? options.keyId, options.privateKey);

  const body = {
    schema: RECEIPT_SCHEMA,
    event_hash,
    operation,
    tenant_id: requiredString(options.tenant_id ?? options.tenantId ?? source.tenant_id ?? source.tenantId, 'tenant_id'),
    subject_id: requiredString(options.subject_id ?? options.subjectId ?? source.subject_id ?? source.subjectId, 'subject_id'),
    sequence,
    previous_receipt_hash,
    active_set_root,
    receipt_log_root,
    timestamp,
    signer
  };

  copyOptional(body, options, source, 'memory_addr', 'memoryAddr');
  copyOptional(body, options, source, 'source_addr', 'sourceAddr');
  copyOptional(body, options, source, 'provider', 'provider');
  copyOptional(body, options, source, 'model', 'model');
  copyOptional(body, options, source, 'policy_id', 'policyId');

  const receipt_id = options.receipt_id ?? options.receiptId ?? `rcpt_${sha256Hex(canonicalize(orderReceiptFields({ ...body, receipt_id: '' }))).slice(0, 32)}`;
  const unsigned = orderReceiptFields({ ...body, receipt_id });
  const signature = options.signature ?? {
    alg: ED25519,
    value: signPayload({ payload: unsigned, privateKey: options.privateKey })
  };
  return orderReceiptFields({ ...unsigned, signature: normalizeReceiptSignature(signature) });
}

export function verifyReceipt(receiptOrArgs, maybePublicKey, maybeOptions = {}) {
  const { receipt, options } = normalizeVerifyReceiptArgs(receiptOrArgs, maybePublicKey, maybeOptions);
  const errors = [];

  if (!isPlainRecord(receipt)) {
    return verificationResult(false, ['receipt must be an object']);
  }

  validateReceiptShape(receipt, errors);

  if (receipt.schema !== RECEIPT_SCHEMA) errors.push('schema mismatch');
  if (!isPlainRecord(receipt.signer) || receipt.signer.alg !== ED25519 || !receipt.signer.key_id) errors.push('signer mismatch');
  if (!isPlainRecord(receipt.signature) || receipt.signature.alg !== ED25519 || !receipt.signature.value) errors.push('signature missing');
  if (!Number.isInteger(receipt.sequence) || receipt.sequence < 0) errors.push('sequence must be a non-negative integer');
  if (!ROOT_RE.test(receipt.event_hash ?? '')) errors.push('event_hash must be a sha256 root');
  if (!ROOT_RE.test(receipt.active_set_root ?? '')) errors.push('active_set_root must be a sha256 root');
  if (!ROOT_RE.test(receipt.receipt_log_root ?? '')) errors.push('receipt_log_root must be a sha256 root');
  if (!isPreviousHash(receipt.previous_receipt_hash)) errors.push('previous_receipt_hash mismatch');

  const expectedSigner = options.expectedSignerKeyId ?? options.expectedSigner ?? options.signer_key_id;
  if (expectedSigner !== undefined && receipt.signer?.key_id !== expectedSigner) errors.push('wrong signer');

  try {
    const derivedId = deriveReceiptId(receipt);
    if (receipt.receipt_id !== derivedId) errors.push('receipt_id mismatch');
  } catch {
    errors.push('receipt_id mismatch');
  }

  const publicKey = resolvePublicKey(receipt.signer?.key_id, options);
  if (publicKey === undefined) {
    errors.push('missing public key');
  } else {
    try {
      if (!verifySignature({ payload: unsignedReceipt(receipt), signature: receipt.signature, publicKey })) {
        errors.push('signature mismatch');
      }
    } catch {
      errors.push('signature mismatch');
    }
  }

  const ok = errors.length === 0;
  return verificationResult(ok, errors, { receipt_hash: safeReceiptHash(receipt), signer_key_id: receipt.signer?.key_id });
}

export function verifyReceiptChain(receiptsOrArgs, maybeOptions = {}) {
  const options = Array.isArray(receiptsOrArgs) ? maybeOptions : receiptsOrArgs ?? {};
  const receipts = Array.isArray(receiptsOrArgs) ? receiptsOrArgs : options.receipts;
  const errors = [];

  if (!Array.isArray(receipts)) return verificationResult(false, ['receipts must be an array']);

  const expectedStartSequence = options.startSequence ?? options.expectedStartSequence ?? 0;
  let expectedPrevious = options.previous_receipt_hash ?? options.previousReceiptHash ?? (expectedStartSequence === 0 ? GENESIS : undefined);
  if (expectedPrevious === undefined) errors.push('previous receipt hash is required for non-genesis chain segments');

  const hashes = [];
  for (let index = 0; index < receipts.length; index += 1) {
    const receipt = receipts[index];
    const verified = verifyReceipt({ receipt, ...options });
    if (!verified.ok) {
      for (const error of verified.errors) errors.push(`receipt ${index}: ${error}`);
    }

    const expectedSequence = expectedStartSequence + index;
    if (receipt?.sequence !== expectedSequence) {
      errors.push(`receipt ${index}: sequence gap or reorder`);
    }
    if (expectedPrevious !== undefined && receipt?.previous_receipt_hash !== expectedPrevious) {
      errors.push(`receipt ${index}: previous hash mismatch`);
    }

    const hash = safeReceiptHash(receipt);
    hashes.push(hash);
    expectedPrevious = hash;
  }

  const receiptLogRoot = new MerkleSet(hashes).root();
  const expectedRoot = options.expectedReceiptLogRoot ?? options.receiptLogRoot ?? options.receipt_log_root;
  if (expectedRoot !== undefined && normalizeSha256Root(expectedRoot, 'expectedReceiptLogRoot') !== receiptLogRoot) {
    errors.push('receipt log root mismatch');
  }

  if (options.verifyEmbeddedReceiptLogRoot === true) {
    const prefix = new MerkleSet();
    const startingRoot = options.previousReceiptLogRoot ?? options.previous_receipt_log_root ?? options.startReceiptLogRoot ?? options.start_receipt_log_root;
    if (startingRoot !== undefined) {
      const normalizedStartingRoot = normalizeSha256Root(startingRoot, 'previousReceiptLogRoot');
      if (normalizedStartingRoot !== prefix.root()) errors.push('embedded receipt_log_root start root mismatch');
    }
    for (let index = 0; index < receipts.length; index += 1) {
      const priorRoot = prefix.root();
      if (receipts[index]?.receipt_log_root !== priorRoot) {
        errors.push(`receipt ${index}: embedded receipt_log_root mismatch`);
      }
      prefix.insert(hashes[index]);
    }
  }

  const activeSetRoot = receipts.length > 0 ? receipts[receipts.length - 1].active_set_root : EMPTY_MERKLE_ROOT;
  const expectedActiveRoot = options.expectedActiveSetRoot ?? options.activeSetRoot ?? options.active_set_root;
  if (expectedActiveRoot !== undefined && normalizeSha256Root(expectedActiveRoot, 'expectedActiveSetRoot') !== activeSetRoot) {
    errors.push('active set root mismatch');
  }

  if (Array.isArray(options.expectedReceiptHashes)) {
    if (options.expectedReceiptHashes.length !== hashes.length) {
      errors.push('receipt hash list length mismatch');
    }
    const length = Math.min(options.expectedReceiptHashes.length, hashes.length);
    for (let index = 0; index < length; index += 1) {
      if (options.expectedReceiptHashes[index] !== hashes[index]) errors.push(`receipt ${index}: receipt hash mismatch`);
    }
  }

  return verificationResult(errors.length === 0, errors, {
    receipt_log_root: receiptLogRoot,
    active_set_root: activeSetRoot,
    receipt_hashes: hashes
  });
}

export class MerkleSet {
  constructor(values = []) {
    this._values = new Set();
    for (const value of values) this.insert(value);
  }

  insert(value) {
    this._values.add(normalizeLeafValue(value));
    return this;
  }

  delete(value) {
    return this._values.delete(normalizeLeafValue(value));
  }

  has(value) {
    return this._values.has(normalizeLeafValue(value));
  }

  root() {
    return merkleRoot(this._sortedValues());
  }

  values() {
    return this._sortedValues();
  }

  proveMembership(value) {
    const leaf = normalizeLeafValue(value);
    const values = this._sortedValues();
    const index = values.indexOf(leaf);
    if (index === -1) throw new RangeError('value is not a member of the MerkleSet');
    return membershipProof(values, index);
  }

  verifyMembership(proof, expectedRoot = proof?.root) {
    return MerkleSet.verifyMembership(proof, expectedRoot);
  }

  proveNonMembership(value) {
    const leaf = normalizeLeafValue(value);
    const values = this._sortedValues();
    if (values.includes(leaf)) throw new RangeError('value is already a member of the MerkleSet');
    const insertion = lowerBound(values, leaf);
    const predecessor = insertion > 0 ? membershipProof(values, insertion - 1) : null;
    const successor = insertion < values.length ? membershipProof(values, insertion) : null;
    return {
      type: 'non_membership',
      value: leaf,
      size: values.length,
      root: merkleRoot(values),
      predecessor,
      successor
    };
  }

  verifyNonMembership(proof, expectedRoot = proof?.root) {
    return MerkleSet.verifyNonMembership(proof, expectedRoot);
  }

  static verifyMembership(proof, expectedRoot = proof?.root) {
    if (!isPlainRecord(proof) || proof.type !== 'membership' || typeof proof.value !== 'string') return false;
    if (!Number.isInteger(proof.index) || proof.index < 0) return false;
    if (!Number.isInteger(proof.size) || proof.size <= proof.index) return false;
    if (!Array.isArray(proof.siblings)) return false;
    let current = merkleLeafHash(proof.value);
    for (const sibling of proof.siblings) {
      if (!isPlainRecord(sibling) || !HASH_RE.test(sibling.hash ?? '')) return false;
      if (sibling.position === 'left') current = merkleNodeHash(sibling.hash, current);
      else if (sibling.position === 'right') current = merkleNodeHash(current, sibling.hash);
      else return false;
    }
    const root = `${SHA256_PREFIX}${current}`;
    return root === proof.root && root === expectedRoot;
  }

  static verifyNonMembership(proof, expectedRoot = proof?.root) {
    if (!isPlainRecord(proof) || proof.type !== 'non_membership' || typeof proof.value !== 'string') return false;
    if (!Number.isInteger(proof.size) || proof.size < 0) return false;
    if (proof.root !== expectedRoot) return false;
    if (proof.size === 0) return proof.predecessor === null && proof.successor === null && proof.root === EMPTY_MERKLE_ROOT;

    const predecessor = proof.predecessor;
    const successor = proof.successor;
    if (predecessor === null && successor === null) return false;

    if (predecessor !== null) {
      if (!MerkleSet.verifyMembership(predecessor, proof.root)) return false;
      if (!(predecessor.value < proof.value)) return false;
    }
    if (successor !== null) {
      if (!MerkleSet.verifyMembership(successor, proof.root)) return false;
      if (!(proof.value < successor.value)) return false;
    }
    if (predecessor !== null && successor !== null) return predecessor.index + 1 === successor.index && predecessor.size === proof.size && successor.size === proof.size;
    if (predecessor === null) return successor.index === 0 && successor.size === proof.size;
    return predecessor.index === proof.size - 1 && predecessor.size === proof.size;
  }

  _sortedValues() {
    return Array.from(this._values).sort();
  }
}

export function createCheckpoint(checkpointOrArgs = {}, maybeOptions = {}) {
  const options = { ...(isPlainRecord(checkpointOrArgs) ? checkpointOrArgs : {}), ...maybeOptions };
  const signer = normalizeSigner(options.signer, options.key_id ?? options.keyId, options.privateKey);
  const body = {
    schema: CHECKPOINT_SCHEMA,
    tenant_hash: rootFromHashable(options.tenant_hash ?? options.tenantHash, options.tenant_id ?? options.tenantId ?? 'tenant'),
    owner_scope_hash: rootFromHashable(options.owner_scope_hash ?? options.ownerScopeHash, options.owner_scope ?? options.ownerScope ?? 'owner'),
    epoch: requiredInteger(options.epoch ?? options.sequence ?? 0, 'epoch'),
    active_memory_root: normalizeSha256Root(options.active_memory_root ?? options.activeMemoryRoot ?? options.active_set_root ?? options.activeSetRoot ?? EMPTY_MERKLE_ROOT, 'active_memory_root'),
    deleted_memory_root: normalizeSha256Root(options.deleted_memory_root ?? options.deletedMemoryRoot ?? EMPTY_MERKLE_ROOT, 'deleted_memory_root'),
    receipt_log_root: normalizeSha256Root(options.receipt_log_root ?? options.receiptLogRoot ?? EMPTY_MERKLE_ROOT, 'receipt_log_root'),
    key_registry_root: normalizeSha256Root(options.key_registry_root ?? options.keyRegistryRoot ?? EMPTY_MERKLE_ROOT, 'key_registry_root'),
    policy_registry_root: normalizeSha256Root(options.policy_registry_root ?? options.policyRegistryRoot ?? EMPTY_MERKLE_ROOT, 'policy_registry_root'),
    previous_checkpoint_hash: normalizePreviousHash(options.previous_checkpoint_hash ?? options.previousCheckpointHash ?? GENESIS),
    issued_at: requiredString(options.issued_at ?? options.issuedAt ?? options.timestamp ?? new Date().toISOString(), 'issued_at')
  };
  if (options.witness_policy ?? options.witnessPolicy) body.witness_policy = options.witness_policy ?? options.witnessPolicy;

  const checkpoint_id = options.checkpoint_id ?? options.checkpointId ?? `chk_${sha256Hex(canonicalize(body)).slice(0, 32)}`;
  const unsigned = orderCheckpointFields({ ...body, checkpoint_id });
  const signatures = options.signatures ?? [{
    alg: ED25519,
    key_id: signer.key_id,
    value: signPayload({ payload: unsigned, privateKey: options.privateKey })
  }];
  return orderCheckpointFields({ ...unsigned, signatures });
}

export function verifyCheckpoint(checkpointOrArgs, maybePublicKeys, maybeOptions = {}) {
  const options = isPlainRecord(checkpointOrArgs) && Object.prototype.hasOwnProperty.call(checkpointOrArgs, 'checkpoint')
    ? checkpointOrArgs
    : { checkpoint: checkpointOrArgs, publicKeys: maybePublicKeys, ...maybeOptions };
  const checkpoint = options.checkpoint;
  const errors = [];

  if (!isPlainRecord(checkpoint)) return verificationResult(false, ['checkpoint must be an object']);
  if (checkpoint.schema !== CHECKPOINT_SCHEMA) errors.push('schema mismatch');
  for (const field of ['tenant_hash', 'owner_scope_hash', 'active_memory_root', 'deleted_memory_root', 'receipt_log_root', 'key_registry_root', 'policy_registry_root']) {
    if (!ROOT_RE.test(checkpoint[field] ?? '')) errors.push(`${field} must be a sha256 root`);
  }
  if (!isPreviousHash(checkpoint.previous_checkpoint_hash)) errors.push('previous checkpoint hash mismatch');
  if (!Number.isInteger(checkpoint.epoch) || checkpoint.epoch < 0) errors.push('epoch must be a non-negative integer');
  if (!Array.isArray(checkpoint.signatures) || checkpoint.signatures.length === 0) errors.push('signatures missing');

  const unsigned = unsignedCheckpoint(checkpoint);
  for (const signature of checkpoint.signatures ?? []) {
    const publicKey = resolvePublicKey(signature.key_id, options);
    if (signature.alg !== ED25519 || !signature.key_id || !signature.value) {
      errors.push('checkpoint signature malformed');
    } else if (publicKey === undefined) {
      errors.push(`missing public key for ${signature.key_id}`);
    } else if (!verifySignature({ payload: unsigned, signature, publicKey })) {
      errors.push(`checkpoint signature mismatch for ${signature.key_id}`);
    }
  }

  const expectedReceiptLogRoot = options.expectedReceiptLogRoot ?? options.receiptLogRoot;
  if (expectedReceiptLogRoot !== undefined && checkpoint.receipt_log_root !== normalizeSha256Root(expectedReceiptLogRoot, 'expectedReceiptLogRoot')) {
    errors.push('receipt log root mismatch');
  }
  const expectedActiveRoot = options.expectedActiveMemoryRoot ?? options.activeMemoryRoot ?? options.activeSetRoot;
  if (expectedActiveRoot !== undefined && checkpoint.active_memory_root !== normalizeSha256Root(expectedActiveRoot, 'expectedActiveMemoryRoot')) {
    errors.push('active memory root mismatch');
  }

  return verificationResult(errors.length === 0, errors, { checkpoint_hash: prefixedSha256(canonicalize(checkpoint)) });
}

export function createMemoryAddress(args = {}, maybeValue, maybeOptions = {}) {
  const options = isPlainRecord(args) && (Object.prototype.hasOwnProperty.call(args, 'secret') || Object.prototype.hasOwnProperty.call(args, 'key'))
    ? args
    : { secret: args, value: maybeValue, ...maybeOptions };
  const secret = options.secret ?? options.key;
  if (secret === undefined) throw new TypeError('createMemoryAddress requires a secret key');
  const payload = {
    namespace: options.namespace ?? 'memory',
    tenant_id: options.tenant_id ?? options.tenantId ?? null,
    subject_id: options.subject_id ?? options.subjectId ?? null,
    value: options.value ?? options.plaintext ?? options.content ?? options.components ?? null
  };
  const digest = hmacSha256Hex({ key: secret, value: payload });
  const prefix = options.prefix ?? 'mem';
  return `${prefix}:hmac-sha256:${digest}`;
}

function bytesForHash(value) {
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value) || ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return value;
  return canonicalize(value);
}

function bytesForKey(value) {
  if (typeof value === 'string' || Buffer.isBuffer(value) || ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return value;
  return canonicalize(value);
}

function bytesForSigning(payload) {
  return Buffer.from(typeof payload === 'string' ? payload : canonicalize(payload));
}

function decodeSignature(signature) {
  const value = isPlainRecord(signature) ? signature.value : signature;
  if (typeof value !== 'string') throw new TypeError('signature must be a string');
  return Buffer.from(value, value.includes('+') || value.includes('/') ? 'base64' : 'base64url');
}

function prefixedSha256(value) {
  return `${SHA256_PREFIX}${sha256Hex(value)}`;
}

function normalizeSha256Root(value, field) {
  if (typeof value !== 'string') throw new TypeError(`${field} must be a sha256 root`);
  if (ROOT_RE.test(value)) return value;
  if (HASH_RE.test(value)) return `${SHA256_PREFIX}${value}`;
  throw new TypeError(`${field} must be a sha256 root`);
}

function normalizePreviousHash(value) {
  if (value === GENESIS) return GENESIS;
  return normalizeSha256Root(value, 'previous hash');
}

function isPreviousHash(value) {
  return value === GENESIS || ROOT_RE.test(value ?? '');
}

function normalizeSigner(signer, keyId, privateKey) {
  if (isPlainRecord(signer)) {
    return { key_id: requiredString(signer.key_id ?? signer.keyId, 'signer.key_id'), alg: signer.alg ?? ED25519 };
  }
  if (keyId !== undefined) return { key_id: requiredString(keyId, 'signer.key_id'), alg: ED25519 };
  if (privateKey !== undefined) {
    const publicKey = createPublicKey(privateKey).export({ type: 'spki', format: 'pem' });
    return { key_id: `ed25519:${sha256Hex(publicKey).slice(0, 32)}`, alg: ED25519 };
  }
  throw new TypeError('signer or key_id is required');
}

function normalizeReceiptSignature(signature) {
  if (!isPlainRecord(signature)) throw new TypeError('signature must be an object');
  return { alg: signature.alg ?? ED25519, value: requiredString(signature.value, 'signature.value') };
}

function normalizeCreateReceiptArgs(receiptOrArgs, maybeOptions) {
  if (isPlainRecord(receiptOrArgs) && (Object.prototype.hasOwnProperty.call(receiptOrArgs, 'event') || Object.prototype.hasOwnProperty.call(receiptOrArgs, 'privateKey'))) {
    return receiptOrArgs;
  }
  return { ...maybeOptions, event: receiptOrArgs };
}

function normalizeVerifyReceiptArgs(receiptOrArgs, maybePublicKey, maybeOptions) {
  if (isPlainRecord(receiptOrArgs) && Object.prototype.hasOwnProperty.call(receiptOrArgs, 'receipt')) {
    return { receipt: receiptOrArgs.receipt, options: receiptOrArgs };
  }
  return { receipt: receiptOrArgs, options: { publicKey: maybePublicKey, ...maybeOptions } };
}

function eventHash(event) {
  const safeEvent = { ...event };
  delete safeEvent.privateKey;
  delete safeEvent.signer;
  delete safeEvent.signature;
  return prefixedSha256(canonicalize(safeEvent));
}

function copyOptional(target, options, source, snake, camel) {
  const value = options[snake] ?? options[camel] ?? source[snake] ?? source[camel];
  if (value !== undefined) target[snake] = value;
}

function orderReceiptFields(receipt) {
  const ordered = {};
  for (const field of [
    'schema',
    'receipt_id',
    'event_hash',
    'operation',
    'tenant_id',
    'subject_id',
    'memory_addr',
    'source_addr',
    'provider',
    'model',
    'policy_id',
    'sequence',
    'previous_receipt_hash',
    'active_set_root',
    'receipt_log_root',
    'timestamp',
    'signer',
    'signature'
  ]) {
    if (receipt[field] !== undefined) ordered[field] = receipt[field];
  }
  return ordered;
}

function unsignedReceipt(receipt) {
  const { signature, ...unsigned } = receipt;
  return orderReceiptFields(unsigned);
}

function validateReceiptShape(receipt, errors) {
  for (const key of Object.keys(receipt)) {
    if (!RECEIPT_TOP_LEVEL_FIELDS.has(key)) errors.push(`unknown receipt field: ${key}`);
    if (RECEIPT_PUBLIC_PLAINTEXT_KEYS.has(key)) errors.push(`receipt must not contain public plaintext field: ${key}`);
  }
  if (isPlainRecord(receipt.signature)) {
    for (const key of Object.keys(receipt.signature)) {
      if (!RECEIPT_SIGNATURE_FIELDS.has(key)) errors.push(`unknown signature field: ${key}`);
    }
  }
}

function deriveReceiptId(receipt) {
  const { receipt_id, signature, ...body } = receipt;
  return `rcpt_${sha256Hex(canonicalize(orderReceiptFields({ ...withoutUndefinedFields(body), receipt_id: '' }))).slice(0, 32)}`;
}

function safeReceiptHash(receipt) {
  try {
    return receiptHash(receipt);
  } catch {
    return `${SHA256_PREFIX}${'0'.repeat(64)}`;
  }
}

function merkleRoot(values) {
  if (values.length === 0) return EMPTY_MERKLE_ROOT;
  let level = values.map(merkleLeafHash);
  while (level.length > 1) level = nextMerkleLevel(level);
  return `${SHA256_PREFIX}${level[0]}`;
}

function nextMerkleLevel(level) {
  const next = [];
  for (let index = 0; index < level.length; index += 2) {
    next.push(index + 1 < level.length ? merkleNodeHash(level[index], level[index + 1]) : level[index]);
  }
  return next;
}

function merkleLeafHash(value) {
  return sha256Hex(`enigma.merkle.leaf.v1\0${value}`);
}

function merkleNodeHash(left, right) {
  return sha256Hex(`enigma.merkle.node.v1\0${left}\0${right}`);
}

function membershipProof(values, index) {
  const value = values[index];
  const siblings = [];
  let level = values.map(merkleLeafHash);
  let cursor = index;
  while (level.length > 1) {
    const siblingIndex = cursor % 2 === 0 ? cursor + 1 : cursor - 1;
    if (siblingIndex < level.length) {
      siblings.push({ position: siblingIndex < cursor ? 'left' : 'right', hash: level[siblingIndex] });
    }
    level = nextMerkleLevel(level);
    cursor = Math.floor(cursor / 2);
  }
  return { type: 'membership', value, index, size: values.length, root: merkleRoot(values), siblings };
}

function lowerBound(values, value) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (values[mid] < value) low = mid + 1;
    else high = mid;
  }
  return low;
}

function normalizeLeafValue(value) {
  return typeof value === 'string' ? value : canonicalize(value);
}

function rootFromHashable(root, fallbackValue) {
  if (root !== undefined) return normalizeSha256Root(root, 'root');
  return prefixedSha256(canonicalize(fallbackValue));
}

function orderCheckpointFields(checkpoint) {
  const ordered = {
    schema: checkpoint.schema,
    checkpoint_id: checkpoint.checkpoint_id,
    tenant_hash: checkpoint.tenant_hash,
    owner_scope_hash: checkpoint.owner_scope_hash,
    epoch: checkpoint.epoch,
    active_memory_root: checkpoint.active_memory_root,
    deleted_memory_root: checkpoint.deleted_memory_root,
    receipt_log_root: checkpoint.receipt_log_root,
    key_registry_root: checkpoint.key_registry_root,
    policy_registry_root: checkpoint.policy_registry_root,
    previous_checkpoint_hash: checkpoint.previous_checkpoint_hash
  };
  if (checkpoint.witness_policy !== undefined) ordered.witness_policy = checkpoint.witness_policy;
  ordered.issued_at = checkpoint.issued_at;
  if (checkpoint.signatures !== undefined) ordered.signatures = checkpoint.signatures;
  return ordered;
}

function unsignedCheckpoint(checkpoint) {
  const { signatures, ...unsigned } = checkpoint;
  return orderCheckpointFields(unsigned);
}

function resolvePublicKey(keyId, options) {
  if (options.publicKey !== undefined) return options.publicKey;
  const publicKeys = options.publicKeys ?? options.keyring ?? options.keys;
  if (publicKeys === undefined || keyId === undefined) return undefined;
  if (publicKeys instanceof Map) return publicKeys.get(keyId);
  if (typeof publicKeys === 'function') return publicKeys(keyId);
  if (isPlainRecord(publicKeys)) return publicKeys[keyId];
  return undefined;
}

function verificationResult(ok, errors, extra = {}) {
  return { ok, valid: ok, errors, ...extra };
}

function requiredString(value, field) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${field} is required`);
  return value;
}

function requiredInteger(value, field) {
  if (!Number.isInteger(value) || value < 0) throw new TypeError(`${field} must be a non-negative integer`);
  return value;
}

function withoutUndefinedFields(record) {
  const cleaned = {};
  for (const key of Object.keys(record)) {
    if (record[key] !== undefined) cleaned[key] = record[key];
  }
  return cleaned;
}

function isPlainRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
