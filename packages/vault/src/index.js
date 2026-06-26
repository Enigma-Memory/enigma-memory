import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  pbkdf2Sync,
  randomBytes,
  randomUUID,
  scryptSync,
} from 'node:crypto';
import {
  canonicalize,
  createMemoryAddress,
  createReceipt,
  generateSigningKeyPair,
  MerkleSet,
  hmacSha256Hex,
  receiptHash,
  sha256Hex,
} from '../../core/src/index.js';

const VAULT_SCHEMA = 'enigma.vault.local.v1';
const EVENT_SCHEMA = 'enigma.memory_event.v1';
const MEMORY_DOMAIN = 'enigma.memory.v1';
const ZERO_ROOT = new MerkleSet().root();
const RECEIPT_PLAINTEXT_KEYS = new Set(['content', 'plaintext', 'text', 'memory', 'prompt', 'response']);
const PUBLIC_PLAINTEXT_KEYS = new Set([
  'body',
  'content',
  'context',
  'contexttext',
  'description',
  'memory',
  'memories',
  'note',
  'notes',
  'plain',
  'plaintext',
  'prompt',
  'raw',
  'rawmemory',
  'rawmemories',
  'response',
  'summary',
  'text',
]);
const SAFE_METADATA_DIGEST_RE = /^(?:sha256:)?[a-f0-9]{64}$|^hmac-sha256:[a-f0-9]{64}$/;
const SOURCE_REF_ROOT_RE = /^sha256:[a-f0-9]{64}$/;

export const KEYRING_ENCRYPTED_TYPE = 'local_secret_encrypted';
export const KEYRING_PLAINTEXT_TYPE = 'local_secret';
const DERIVED_KEY_LENGTH = 128; // 32 bytes each: KEK, vaultKey, addressKey, signingSeed
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const PLAINTEXT_KEYRING_WARNING = 'WARNING: This bundle stores vault keys in plaintext. Anyone with file access can decrypt memory contents. Use --passphrase to encrypt the keyring.';
const ENCRYPTED_KEYRING_WARNING = 'Keyring is encrypted with AES-256-GCM; passphrase required on import.';
const DEPRECATION_PLAINTEXT_KEYRING = 'Plaintext keyrings are deprecated; use --passphrase to encrypt new bundles.';
function normalizedPublicKey(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isPlaintextLikeKey(key) {
  return PUBLIC_PLAINTEXT_KEYS.has(normalizedPublicKey(key));
}

function isSourceRefPlaintextLikeKey(key) {
  return isPlaintextLikeKey(key) || normalizedPublicKey(key) === 'value';
}

function privateCommitmentKey(key) {
  return `private_field_${sha256Hex(normalizedPublicKey(key)).slice(0, 12)}_commitment`;
}

function metadataKeyStem(key) {
  const stem = String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  return stem || `field_${sha256Hex(String(key)).slice(0, 12)}`;
}

function metadataCommitmentKey(key) {
  return `${metadataKeyStem(key)}_commitment`;
}

function isMetadataPrimitive(value) {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function isSafeMetadataPrimitive(key, value) {
  const exactKey = String(key);
  if (isPlaintextLikeKey(exactKey)) return false;
  if (exactKey.endsWith('_count')) return typeof value === 'number' && Number.isFinite(value);
  if ((exactKey.endsWith('_commitment') || exactKey.endsWith('_hash')) && typeof value === 'string') return SAFE_METADATA_DIGEST_RE.test(value);
  return false;
}

function commitMetadataValue(out, key, value) {
  out[metadataCommitmentKey(key)] = asSha256(isMetadataPrimitive(value) ? String(value) : canonical(value));
}

function sanitizeSourceRefValue(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return asSha256(value);
  if (['number', 'boolean'].includes(typeof value)) return value;
  if (Array.isArray(value)) return value.map(sanitizeSourceRefValue).filter((item) => item !== undefined);
  if (typeof value !== 'object') return undefined;

  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (isSourceRefPlaintextLikeKey(key)) {
      if (item !== undefined && item !== null && ['string', 'number', 'boolean'].includes(typeof item)) {
        out[privateCommitmentKey(key)] = asSha256(String(item));
      }
      continue;
    }
    if (key === 'source_hash' && typeof item === 'string' && SOURCE_REF_ROOT_RE.test(item)) {
      out[key] = item;
      continue;
    }
    const sanitized = sanitizeSourceRefValue(item);
    if (sanitized !== undefined) out[key] = sanitized;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function sanitizeSourceRefs(refs) {
  if (!Array.isArray(refs)) return [];
  const out = [];
  for (const ref of refs) {
    if (typeof ref === 'string') {
      out.push({ source_hash: asSha256(ref) });
      continue;
    }
    const sanitized = sanitizeSourceRefValue(ref);
    if (sanitized !== undefined) out.push(sanitized);
  }
  return out;
}

function sanitizePublicValue(value) {
  if (Array.isArray(value)) return value.map(sanitizePublicValue);
  if (!value || typeof value !== 'object') return value;

  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (isPlaintextLikeKey(key)) continue;
    if (key === 'metadata') {
      out.metadata = metadata(item);
      continue;
    }
    if (key === 'source_refs' || key === 'sourceRefs') {
      out.source_refs = sanitizeSourceRefs(item);
      continue;
    }
    if (item !== undefined) out[key] = sanitizePublicValue(item);
  }
  return out;
}

function sanitizeImportedEventEntry(entry) {
  if (!entry || typeof entry !== 'object') return undefined;
  const event = sanitizePublicValue(entry.event ?? {});
  const hash = typeof entry.hash === 'string' && SOURCE_REF_ROOT_RE.test(entry.hash) ? entry.hash : asSha256(event);
  return { event, canonical: canonical(event), hash };
}

function sortedStrings(values) {
  return [...values].map(String).sort();
}

function sameStringSet(left, right) {
  const a = sortedStrings(left);
  const b = sortedStrings(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function receiptEvent(receipt) {
  if (!receipt || typeof receipt !== 'object') return undefined;
  return receipt.event && typeof receipt.event === 'object' ? receipt.event : receipt;
}

function deriveReceiptLifecycle(receipts) {
  const active = new Set();
  const tombstones = new Map();
  for (const receipt of receipts) {
    const event = receiptEvent(receipt);
    if (!event) continue;
    if (event.operation === 'create' && event.memory_addr) {
      active.add(event.memory_addr);
      tombstones.delete(event.memory_addr);
    } else if (event.operation === 'update' && event.memory_addr) {
      if (event.source_addr) {
        active.delete(event.source_addr);
        tombstones.set(event.source_addr, {
          schema: 'enigma.deletion_tombstone.v1',
          memory_addr: event.source_addr,
          operation: 'update',
          successor_addr: event.memory_addr,
          tombstoned_at: event.timestamp,
          reason: 'updated',
        });
      }
      active.add(event.memory_addr);
      tombstones.delete(event.memory_addr);
    } else if (event.operation === 'delete' && event.memory_addr) {
      active.delete(event.memory_addr);
      tombstones.set(event.memory_addr, {
        schema: 'enigma.deletion_tombstone.v1',
        memory_addr: event.memory_addr,
        operation: 'delete',
        tombstoned_at: event.timestamp,
        reason: 'deleted',
      });
    }
    if (typeof receipt.active_set_root === 'string' && receipt.active_set_root !== computeSetRoot(active)) {
      throw new Error('importBundle receipt active_set_root mismatch');
    }
  }
  return { active, tombstones };
}

function importedTombstonesByAddress(tombstones) {
  const out = new Map();
  for (const tombstone of Array.isArray(tombstones) ? tombstones : []) {
    if (tombstone?.memory_addr) out.set(tombstone.memory_addr, { ...sanitizePublicValue(tombstone) });
  }
  return out;
}

function reconcileImportedLifecycle(bundle, records, receipts) {
  const derived = deriveReceiptLifecycle(receipts);
  const declaredActive = new Set(Array.isArray(bundle.active_memory_addresses) ? bundle.active_memory_addresses.map(String) : []);
  if (!sameStringSet(declaredActive, derived.active)) throw new Error('importBundle active_memory_addresses do not match receipt-derived state');
  if (bundle.vault?.active_set_root && bundle.vault.active_set_root !== computeSetRoot(derived.active)) {
    throw new Error('importBundle vault active_set_root does not match receipt-derived state');
  }

  const importedTombstones = importedTombstonesByAddress(bundle.tombstones);
  if (!sameStringSet(importedTombstones.keys(), derived.tombstones.keys())) {
    throw new Error('importBundle tombstones do not match receipt-derived state');
  }

  for (const [memoryAddr, tombstone] of derived.tombstones) {
    const imported = importedTombstones.get(memoryAddr);
    if (imported?.operation && imported.operation !== tombstone.operation) {
      throw new Error('importBundle tombstone operation does not match receipt-derived state');
    }
    derived.tombstones.set(memoryAddr, { ...tombstone, ...imported, memory_addr: memoryAddr, operation: tombstone.operation });
  }

  for (const [memoryAddr, record] of records) {
    if (derived.active.has(memoryAddr)) {
      record.state = 'active';
    } else if (derived.tombstones.has(memoryAddr)) {
      record.state = derived.tombstones.get(memoryAddr).operation === 'update' ? 'superseded' : 'tombstoned';
    } else if (record.state === 'active') {
      throw new Error('importBundle memory object active state is not receipt-derived');
    }
  }

  return derived;
}


function canonical(value) {
  try {
    const encoded = canonicalize(value);
    return typeof encoded === 'string' ? encoded : JSON.stringify(encoded);
  } catch {
    return stableStringify(value);
  }
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`;
}

function stripShaPrefix(value) {
  return String(value).startsWith('sha256:') ? String(value).slice(7) : String(value);
}

function asSha256(value) {
  try {
    const digest = sha256Hex(value);
    return String(digest).startsWith('sha256:') ? String(digest) : `sha256:${digest}`;
  } catch {
    return `sha256:${createHash('sha256').update(value).digest('hex')}`;
  }
}

function asHmacSha256(key, value) {
  try {
    const digest = hmacSha256Hex(key, value);
    return stripShaPrefix(digest);
  } catch {
    return createHmac('sha256', key).update(value).digest('hex');
  }
}

function keyBytes(key, label) {
  if (Buffer.isBuffer(key)) {
    if (key.length !== 32) throw new Error(`${label} must be 32 bytes`);
    return Buffer.from(key);
  }
  if (typeof key === 'string') {
    const bytes = Buffer.from(key, 'base64');
    if (bytes.length !== 32) throw new Error(`${label} must decode to 32 bytes`);
    return bytes;
  }
  if (key == null) return randomBytes(32);
  throw new Error(`${label} must be a Buffer or base64 string`);
}

function buildEd25519Pkcs8(seed) {
  if (!Buffer.isBuffer(seed) || seed.length !== 32) throw new Error('Ed25519 seed must be 32 bytes');
  // PKCS#8 PrivateKeyInfo for Ed25519 (OID 1.3.101.112): SEQUENCE { INTEGER 0, AlgorithmIdentifier, OCTET STRING { OCTET STRING seed } }
  return Buffer.from([
    0x30, 0x2e,
      0x02, 0x01, 0x00,
      0x30, 0x05,
        0x06, 0x03, 0x2b, 0x65, 0x70,
      0x04, 0x22,
        0x04, 0x20,
          ...seed,
  ]);
}

function deriveMasterKeyFromPassphrase(passphrase, salt) {
  const normalized = Buffer.from(String(passphrase), 'utf8');
  const saltBuf = typeof salt === 'string' ? Buffer.from(salt, 'base64') : Buffer.from(salt);
  if (saltBuf.length < 8) throw new Error('Salt must be at least 8 bytes');
  try {
    return scryptSync(normalized, saltBuf, DERIVED_KEY_LENGTH);
  } catch {
    return pbkdf2Sync(normalized, saltBuf, 600000, DERIVED_KEY_LENGTH, 'sha256');
  }
}

function deriveKeysFromPassphrase(passphrase, salt) {
  const master = deriveMasterKeyFromPassphrase(passphrase, salt);
  return {
    kek: master.subarray(0, 32),
    vaultKey: master.subarray(32, 64),
    addressKey: master.subarray(64, 96),
    signingSeed: master.subarray(96, 128),
  };
}

function encryptKeyring(plaintextKeyring, kek) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', kek, iv);
  const plaintext = Buffer.from(JSON.stringify(plaintextKeyring), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

export function decryptKeyring(keyring, passphrase) {
  if (keyring?.type !== KEYRING_ENCRYPTED_TYPE) throw new Error('Keyring is not encrypted');
  if (passphrase === undefined || passphrase === null || String(passphrase).length === 0) {
    throw new Error('Encrypted keyring requires passphrase');
  }
  const { kek } = deriveKeysFromPassphrase(passphrase, keyring.salt);
  const decipher = createDecipheriv('aes-256-gcm', kek, Buffer.from(keyring.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(keyring.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(keyring.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  return JSON.parse(plaintext);
}

function signingPair(seed) {
  if (seed !== undefined && seed !== null) {
    try {
      const privateKey = createPrivateKey({ key: buildEd25519Pkcs8(seed), format: 'der', type: 'pkcs8' });
      const publicKey = createPublicKey(privateKey);
      const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
      return {
        key_id: `ed25519:${sha256Hex(publicKeyPem).slice(0, 32)}`,
        publicKey,
        privateKey,
      };
    } catch {
      // Fall through to random signing pair if deterministic construction is unsupported.
    }
  }
  try {
    const pair = generateSigningKeyPair();
    if (pair && typeof pair.then !== 'function') return pair;
  } catch {
    // Fall through to Node's built-in Ed25519 implementation.
  }
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    key_id: `local-ed25519-${randomUUID()}`,
    publicKey,
    privateKey,
  };
}

function signerFor(pair) {
  return {
    key_id: pair?.key_id ?? pair?.keyId ?? `local-ed25519-${randomUUID()}`,
    alg: 'Ed25519',
  };
}

function exportPublicKey(pair) {
  const key = pair?.publicKey;
  if (typeof key === 'string') return key;
  if (key?.export) {
    try {
      return key.export({ type: 'spki', format: 'pem' });
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function exportPrivateKey(pair) {
  const key = pair?.privateKey;
  if (typeof key === 'string') return key;
  if (key?.export) {
    try {
      return key.export({ type: 'pkcs8', format: 'pem' });
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function nowIso(now) {
  if (now instanceof Date) return now.toISOString();
  if (typeof now === 'string') return new Date(now).toISOString();
  return new Date().toISOString();
}

function metadata(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (isMetadataPrimitive(value)) {
      if (isSafeMetadataPrimitive(key, value)) {
        out[key] = value;
      } else {
        commitMetadataValue(out, key, value);
      }
      continue;
    }
    if (Array.isArray(value) || typeof value === 'object') {
      commitMetadataValue(out, key, value);
    }
  }
  return out;
}

function pruneUndefined(value) {
  if (Array.isArray(value)) return value.map((item) => pruneUndefined(item));
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) out[key] = pruneUndefined(item);
    }
    return out;
  }
  return value;
}

function computeSetRoot(values) {
  return new MerkleSet([...values]).root();
}

function computeReceiptLogRootFrom(receipts, pendingHash) {
  const hashes = receipts.map((receipt) => hashReceipt(receipt));
  if (pendingHash) hashes.push(pendingHash);
  return hashes.length === 0 ? ZERO_ROOT : new MerkleSet(hashes).root();
}

function hashReceipt(receipt) {
  try {
    const digest = receiptHash(receipt);
    return String(digest).startsWith('sha256:') ? String(digest) : `sha256:${digest}`;
  } catch {
    return asSha256(canonical(receipt));
  }
}

function receiptArgs(vault, event, eventHash, previousReceiptHash, activeSetRoot, receiptLogRoot) {
  return pruneUndefined({
    event,
    event_hash: eventHash,
    operation: event.operation,
    tenant_id: event.tenant_id,
    subject_id: event.subject_id,
    memory_addr: event.memory_addr,
    source_addr: event.source_addr,
    provider: event.provider,
    model: event.model,
    policy_id: event.policy_id,
    sequence: event.sequence,
    previous_receipt_hash: previousReceiptHash,
    active_set_root: activeSetRoot,
    receipt_log_root: receiptLogRoot,
    timestamp: event.timestamp,
    signer: vault.signer,
    privateKey: vault.signingKeyPair?.privateKey,
  });
}

function buildReceipt(vault, event, eventHash, previousReceiptHash, activeSetRoot, receiptLogRoot) {
  const receipt = createReceipt(receiptArgs(vault, event, eventHash, previousReceiptHash, activeSetRoot, receiptLogRoot));
  if (containsPlaintextMarker(receipt)) throw new Error('receipt must not contain plaintext memory content');
  return pruneUndefined(receipt);
}

function containsPlaintextMarker(value) {
  const encoded = JSON.stringify(value).toLowerCase();
  return ['plaintext', 'content\":', 'text\":'].some((marker) => encoded.includes(marker));
}

function appendEvent(vault, fields) {
  const sequence = vault.sequence;
  const event = pruneUndefined({
    schema: EVENT_SCHEMA,
    event_id: `evt_${randomUUID()}`,
    operation: fields.operation,
    tenant_id: fields.tenant_id ?? vault.tenant_id,
    subject_id: fields.subject_id ?? vault.subject_id,
    actor_id: fields.actor_id ?? vault.actor_id,
    memory_addr: fields.memory_addr,
    source_addr: fields.source_addr,
    provider: fields.provider,
    model: fields.model,
    purpose: fields.purpose,
    timestamp: nowIso(fields.now),
    sequence,
    policy_id: fields.policy_id ?? vault.policy_id,
    decision: fields.decision,
    metadata: metadata(fields.metadata),
  });
  const eventCanonical = canonical(event);
  const eventHash = asSha256(eventCanonical);
  const previousReceiptHash = vault.receipts.length > 0 ? hashReceipt(vault.receipts[vault.receipts.length - 1]) : 'GENESIS';
  const activeSetRoot = computeSetRoot(vault.activeAddresses);
  const priorReceiptLogRoot = computeReceiptLogRootFrom(vault.receipts);
  const receipt = buildReceipt(vault, event, eventHash, previousReceiptHash, activeSetRoot, priorReceiptLogRoot);
  vault.events.push({ event, canonical: eventCanonical, hash: eventHash });
  vault.receipts.push(receipt);
  vault.sequence += 1;
  vault.updated_at = event.timestamp;
  vault.active_set_root = activeSetRoot;
  vault.receipt_log_root = computeReceiptLogRootFrom(vault.receipts);
  return { event, receipt };
}

function memoryAddress(vault, subjectId, memoryId, contentHash) {
  const payload = canonical({ domain: MEMORY_DOMAIN, subject_id: subjectId, memory_id: memoryId, content_hash: contentHash });
  try {
    const addr = createMemoryAddress({
      vault_addr_key: vault.addressKey,
      vaultAddressKey: vault.addressKey,
      key: vault.addressKey,
      value: payload,
      components: { domain: MEMORY_DOMAIN, subject_id: subjectId, memory_id: memoryId, content_hash: contentHash },
      domain: MEMORY_DOMAIN,
      subject_id: subjectId,
      subjectId,
      memory_id: memoryId,
      memoryId,
      content_hash: contentHash,
      contentHash,
    });
    if (typeof addr === 'string' && addr.length > 0) return addr;
  } catch {
    // Local HMAC construction below follows the protocol domain separation.
  }
  return `mem:${asHmacSha256(vault.addressKey, payload)}`;
}

function encryptContent(vault, memoryAddr, plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', vault.vaultKey, iv);
  cipher.setAAD(Buffer.from(memoryAddr));
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    alg: 'AES-256-GCM',
    iv: iv.toString('base64'),
    aad: memoryAddr,
    ciphertext: ciphertext.toString('base64'),
    tag: tag.toString('base64'),
  };
}

function setPlaintextCache(record, plaintext) {
  Object.defineProperty(record, 'plaintext', {
    value: String(plaintext),
    enumerable: false,
    configurable: true,
    writable: true,
  });
  return record.plaintext;
}

function getPlaintextCache(record) {
  if (!Object.prototype.hasOwnProperty.call(record, 'plaintext')) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(record, 'plaintext');
  if (descriptor?.enumerable) {
    delete record.plaintext;
    return undefined;
  }
  return record.plaintext;
}

function decryptContent(vault, record) {
  const cached = getPlaintextCache(record);
  if (cached !== undefined) return cached;
  const encrypted = record.content_ciphertext;
  const decipher = createDecipheriv('aes-256-gcm', vault.vaultKey, Buffer.from(encrypted.iv, 'base64'));
  decipher.setAAD(Buffer.from(encrypted.aad ?? record.memory_addr));
  decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  return setPlaintextCache(record, plaintext);
}

function publicRecord(record) {
  return pruneUndefined(sanitizePublicValue(record));
}

function attachInternals(vault) {
  Object.defineProperties(vault, {
    __recordEvent: { value: (fields) => appendEvent(vault, fields), enumerable: false },
    __getRecord: { value: (memoryAddr) => vault.memories.get(memoryAddr), enumerable: false },
    __getPlaintext: { value: (memoryAddr) => decryptContent(vault, vault.memories.get(memoryAddr)), enumerable: false },
    __computeRoots: {
      value: () => ({
        active_set_root: computeSetRoot(vault.activeAddresses),
        receipt_log_root: computeReceiptLogRootFrom(vault.receipts),
      }),
      enumerable: false,
    },
  });
  return vault;
}

export function createVault(args = {}) {
  const createdAt = nowIso(args.now);
  const passphrase = args.passphrase;
  const salt = args.salt ?? randomBytes(SALT_LENGTH).toString('base64');
  let vaultKey;
  let addressKey;
  let signingSeed;
  let keyringType = KEYRING_PLAINTEXT_TYPE;
  if (passphrase !== undefined && passphrase !== null && String(passphrase).length > 0) {
    const derived = deriveKeysFromPassphrase(passphrase, salt);
    vaultKey = derived.vaultKey;
    addressKey = derived.addressKey;
    signingSeed = derived.signingSeed;
    keyringType = KEYRING_ENCRYPTED_TYPE;
  } else {
    vaultKey = keyBytes(args.vault_key ?? args.vaultKey, 'vault key');
    addressKey = keyBytes(args.address_key ?? args.addressKey, 'address key');
  }
  const signingKeyPair = args.signingKeyPair ?? signingPair(signingSeed);
  const vault = {
    schema: VAULT_SCHEMA,
    vault_id: args.vault_id ?? args.vaultId ?? `vault_${randomUUID()}`,
    tenant_id: args.tenant_id ?? args.tenantId ?? 'local',
    subject_id: args.subject_id ?? args.subjectId ?? 'local-subject',
    actor_id: args.actor_id ?? args.actorId ?? 'local-user',
    policy_id: args.policy_id ?? args.policyId ?? 'local-default',
    created_at: createdAt,
    updated_at: createdAt,
    encryption: 'local_aead',
    key_id: args.key_id ?? args.keyId ?? `vault-key-${randomUUID()}`,
    vaultKey,
    addressKey,
    signingKeyPair,
    signer: args.signer ?? signerFor(signingKeyPair),
    memories: new Map(),
    events: [],
    receipts: [],
    activeAddresses: new Set(),
    tombstones: new Map(),
    sequence: 0,
    active_set_root: ZERO_ROOT,
    receipt_log_root: ZERO_ROOT,
    keyringType,
  };
  return attachInternals(vault);
}

function normalizeImportance(value) {
  if (value === undefined || value === null) return undefined;
  const num = Number(value);
  if (!Number.isFinite(num)) return undefined;
  return Math.max(0, Math.min(1, num));
}

export function remember(args = {}) {
  const vault = args.vault;
  if (!vault) throw new Error('remember requires a vault');
  const plaintext = args.content ?? args.text ?? args.plaintext;
  if (plaintext === undefined || plaintext === null) throw new Error('remember requires content');

  const memoryId = args.memory_id ?? args.memoryId ?? `mem_${randomUUID()}`;
  const subjectId = args.subject_id ?? args.subjectId ?? vault.subject_id;
  const createdAt = nowIso(args.now);
  const contentHash = asSha256(String(plaintext));
  const memoryAddr = memoryAddress(vault, subjectId, memoryId, contentHash);
  if (vault.tombstones.has(memoryAddr)) throw new Error(`memory address is tombstoned: ${memoryAddr}`);

  const record = pruneUndefined({
    schema: 'enigma.memory_object.v1',
    memory_id: memoryId,
    memory_addr: memoryAddr,
    subject_id: subjectId,
    kind: args.kind ?? 'fact',
    content_ciphertext: encryptContent(vault, memoryAddr, plaintext),
    content_hash: contentHash,
    content_commitment: `hmac-sha256:${asHmacSha256(vault.addressKey, contentHash)}`,
    source_refs: sanitizeSourceRefs(args.source_refs ?? args.sourceRefs),
    confidence: args.confidence ?? 'user_confirmed',
    sensitivity: args.sensitivity ?? 'normal',
    purpose_tags: Array.isArray(args.purpose_tags ?? args.purposeTags) ? (args.purpose_tags ?? args.purposeTags) : [],
    retention: args.retention ?? 'durable',
    importance: normalizeImportance(args.importance),
    state: 'active',
    metadata: metadata(args.metadata),
    created_at: createdAt,
    updated_at: createdAt,
  });

  vault.memories.set(memoryAddr, record);
  vault.activeAddresses.add(memoryAddr);
  const { event, receipt } = appendEvent(vault, {
    operation: 'create',
    memory_addr: memoryAddr,
    subject_id: subjectId,
    actor_id: args.actor_id ?? args.actorId,
    policy_id: args.policy_id ?? args.policyId,
    now: args.now,
    metadata: pruneUndefined({
      memory_id: memoryId,
      kind: record.kind,
      sensitivity: record.sensitivity,
      importance: record.importance,
      content_commitment: record.content_commitment,
    }),
  });

  return { memory: publicRecord(record), memory_addr: memoryAddr, event, receipt };
}

export function recall(args = {}) {
  const vault = args.vault;
  const memoryAddr = args.memory_addr ?? args.memoryAddr;
  if (!vault) throw new Error('recall requires a vault');
  if (!memoryAddr) throw new Error('recall requires memory_addr');
  if (vault.tombstones.has(memoryAddr)) throw new Error(`memory is tombstoned: ${memoryAddr}`);
  if (!vault.activeAddresses.has(memoryAddr)) throw new Error(`memory is not active: ${memoryAddr}`);
  const record = vault.memories.get(memoryAddr);
  if (!record || record.state !== 'active') throw new Error(`memory is not active: ${memoryAddr}`);

  const plaintext = decryptContent(vault, record);
  const { event, receipt } = appendEvent(vault, {
    operation: args.operation ?? 'read',
    memory_addr: memoryAddr,
    provider: args.provider,
    model: args.model,
    purpose: args.purpose,
    actor_id: args.actor_id ?? args.actorId,
    policy_id: args.policy_id ?? args.policyId,
    now: args.now,
    metadata: { kind: record.kind, sensitivity: record.sensitivity },
  });

  return { memory: { ...publicRecord(record), content: plaintext }, memory_addr: memoryAddr, content: plaintext, event, receipt };
}

export function updateMemory(args = {}) {
  const vault = args.vault;
  const oldAddr = args.memory_addr ?? args.memoryAddr;
  const plaintext = args.content ?? args.text ?? args.plaintext;
  if (!vault) throw new Error('updateMemory requires a vault');
  if (!oldAddr) throw new Error('updateMemory requires memory_addr');
  if (plaintext === undefined || plaintext === null) throw new Error('updateMemory requires content');
  if (vault.tombstones.has(oldAddr) || !vault.activeAddresses.has(oldAddr)) throw new Error(`memory is not active: ${oldAddr}`);

  const oldRecord = vault.memories.get(oldAddr);
  if (!oldRecord) throw new Error(`unknown memory: ${oldAddr}`);
  oldRecord.state = 'superseded';
  oldRecord.updated_at = nowIso(args.now);
  vault.activeAddresses.delete(oldAddr);

  const contentHash = asSha256(String(plaintext));
  const newAddr = memoryAddress(vault, oldRecord.subject_id, oldRecord.memory_id, contentHash);
  const updatedAt = nowIso(args.now);
  const newRecord = pruneUndefined({
    ...publicRecord(oldRecord),
    memory_addr: newAddr,
    content_ciphertext: encryptContent(vault, newAddr, plaintext),
    content_hash: contentHash,
    content_commitment: `hmac-sha256:${asHmacSha256(vault.addressKey, contentHash)}`,
    state: 'active',
    updated_at: updatedAt,
  });

  vault.memories.set(newAddr, newRecord);
  vault.activeAddresses.add(newAddr);
  const tombstone = {
    schema: 'enigma.deletion_tombstone.v1',
    memory_addr: oldAddr,
    operation: 'update',
    successor_addr: newAddr,
    tombstoned_at: updatedAt,
    reason: args.reason ?? 'updated',
  };
  vault.tombstones.set(oldAddr, tombstone);

  const { event, receipt } = appendEvent(vault, {
    operation: 'update',
    memory_addr: newAddr,
    source_addr: oldAddr,
    actor_id: args.actor_id ?? args.actorId,
    policy_id: args.policy_id ?? args.policyId,
    now: args.now,
    metadata: {
      memory_id: oldRecord.memory_id,
      old_memory_addr: oldAddr,
      content_commitment: newRecord.content_commitment,
    },
  });

  return {
    old_memory_addr: oldAddr,
    memory_addr: newAddr,
    memory: publicRecord(newRecord),
    tombstone,
    event,
    receipt,
  };
}

export function deleteMemory(args = {}) {
  const vault = args.vault;
  const memoryAddr = args.memory_addr ?? args.memoryAddr;
  if (!vault) throw new Error('deleteMemory requires a vault');
  if (!memoryAddr) throw new Error('deleteMemory requires memory_addr');
  if (vault.tombstones.has(memoryAddr)) throw new Error(`memory is already tombstoned: ${memoryAddr}`);
  if (!vault.activeAddresses.has(memoryAddr)) throw new Error(`memory is not active: ${memoryAddr}`);

  const record = vault.memories.get(memoryAddr);
  if (record) {
    record.state = 'tombstoned';
    record.updated_at = nowIso(args.now);
    delete record.plaintext;
  }
  vault.activeAddresses.delete(memoryAddr);
  const tombstone = {
    schema: 'enigma.deletion_tombstone.v1',
    memory_addr: memoryAddr,
    operation: 'delete',
    tombstoned_at: nowIso(args.now),
    reason: args.reason ?? 'user_deleted',
  };
  vault.tombstones.set(memoryAddr, tombstone);

  const { event, receipt } = appendEvent(vault, {
    operation: 'delete',
    memory_addr: memoryAddr,
    actor_id: args.actor_id ?? args.actorId,
    policy_id: args.policy_id ?? args.policyId,
    now: args.now,
    metadata: { reason: tombstone.reason },
  });

  return { memory_addr: memoryAddr, tombstone, event, receipt };
}

function buildKeyring(vault, passphrase) {
  if (passphrase !== undefined && passphrase !== null && String(passphrase).length > 0) {
    const salt = randomBytes(SALT_LENGTH).toString('base64');
    const { kek } = deriveKeysFromPassphrase(passphrase, salt);
    const plaintextKeyring = {
      vault_key_b64: vault.vaultKey.toString('base64'),
      address_key_b64: vault.addressKey.toString('base64'),
      privateKey: exportPrivateKey(vault.signingKeyPair),
    };
    const encrypted = encryptKeyring(plaintextKeyring, kek);
    return {
      type: KEYRING_ENCRYPTED_TYPE,
      warning: ENCRYPTED_KEYRING_WARNING,
      salt,
      iv: encrypted.iv,
      tag: encrypted.tag,
      ciphertext: encrypted.ciphertext,
      signer: vault.signer,
      publicKey: exportPublicKey(vault.signingKeyPair),
    };
  }
  return {
    type: KEYRING_PLAINTEXT_TYPE,
    unencrypted: true,
    warning: PLAINTEXT_KEYRING_WARNING,
    vault_key_b64: vault.vaultKey.toString('base64'),
    address_key_b64: vault.addressKey.toString('base64'),
    signer: vault.signer,
    publicKey: exportPublicKey(vault.signingKeyPair),
    privateKey: exportPrivateKey(vault.signingKeyPair),
  };
}

export function exportBundle(args = {}) {
  const vault = args.vault;
  if (!vault) throw new Error('exportBundle requires a vault');
  const exportReceipt = appendEvent(vault, {
    operation: 'export',
    actor_id: args.actor_id ?? args.actorId,
    policy_id: args.policy_id ?? args.policyId,
    now: args.now,
    metadata: {
      memory_count: vault.memories.size,
      active_count: vault.activeAddresses.size,
      tombstone_count: vault.tombstones.size,
    },
  }).receipt;

  const roots = vault.__computeRoots();
  const bundle = {
    schema: 'enigma.vault_bundle.v1',
    exported_at: nowIso(args.now),
    vault: {
      schema: vault.schema,
      vault_id: vault.vault_id,
      tenant_id: vault.tenant_id,
      subject_id: vault.subject_id,
      actor_id: vault.actor_id,
      policy_id: vault.policy_id,
      created_at: vault.created_at,
      updated_at: vault.updated_at,
      encryption: vault.encryption,
      key_id: vault.key_id,
      active_set_root: roots.active_set_root,
      receipt_log_root: roots.receipt_log_root,
      sequence: vault.sequence,
    },
    keyring: buildKeyring(vault, args.passphrase),
    memory_objects: [...vault.memories.values()].map(publicRecord),
    active_memory_addresses: [...vault.activeAddresses].sort(),
    tombstones: [...vault.tombstones.values()].sort((a, b) => a.memory_addr.localeCompare(b.memory_addr)),
    events: vault.events,
    receipts: vault.receipts,
    export_receipt: exportReceipt,
  };
  Object.defineProperties(bundle, {
    bundle: { value: bundle, enumerable: false },
    canonical: { value: canonical(bundle), enumerable: false },
    receipt: { value: exportReceipt, enumerable: false },
  });
  return bundle;
}

export function importBundle(args = {}) {
  const source = args.schema === 'enigma.vault_bundle.v1' ? args : (args.bundle?.bundle ?? args.bundle ?? args);
  const bundle = typeof source === 'string' ? JSON.parse(source) : source;
  if (!bundle || bundle.schema !== 'enigma.vault_bundle.v1') throw new Error('importBundle requires an enigma.vault_bundle.v1 bundle');
  const warnings = [];
  let vaultKey;
  let addressKey;
  let privateKey;
  const keyring = bundle.keyring;
  if (keyring?.type === KEYRING_ENCRYPTED_TYPE) {
    if (args.passphrase === undefined || args.passphrase === null || String(args.passphrase).length === 0) {
      throw new Error('Encrypted keyring requires passphrase');
    }
    const decrypted = decryptKeyring(keyring, args.passphrase);
    vaultKey = decrypted.vault_key_b64;
    addressKey = decrypted.address_key_b64;
    privateKey = decrypted.privateKey;
  } else {
    if (keyring?.type === KEYRING_PLAINTEXT_TYPE) {
      warnings.push(DEPRECATION_PLAINTEXT_KEYRING);
    }
    vaultKey = keyring?.vault_key_b64;
    addressKey = keyring?.address_key_b64;
    privateKey = keyring?.privateKey;
  }
  const restoredSigningKeyPair = privateKey
    ? {
        key_id: keyring?.signer?.key_id,
        signer: keyring?.signer,
        publicKey: keyring?.publicKey,
        privateKey,
      }
    : undefined;
  const vault = createVault({
    vault_id: bundle.vault?.vault_id,
    tenant_id: bundle.vault?.tenant_id,
    subject_id: bundle.vault?.subject_id,
    actor_id: args.actor_id ?? args.actorId ?? bundle.vault?.actor_id,
    policy_id: bundle.vault?.policy_id,
    vault_key: vaultKey,
    address_key: addressKey,
    signingKeyPair: restoredSigningKeyPair,
    signer: keyring?.signer,
    now: bundle.vault?.created_at,
  });
  vault.created_at = bundle.vault?.created_at ?? vault.created_at;
  vault.updated_at = bundle.vault?.updated_at ?? vault.updated_at;
  vault.sequence = Number.isInteger(bundle.vault?.sequence) ? bundle.vault.sequence : 0;
  vault.events = Array.isArray(bundle.events) ? bundle.events.map(sanitizeImportedEventEntry).filter(Boolean) : [];
  vault.receipts = Array.isArray(bundle.receipts) ? bundle.receipts.map((receipt) => ({
    ...sanitizePublicValue(receipt),
    signer: receipt.signer ? { ...sanitizePublicValue(receipt.signer) } : receipt.signer,
    signature: receipt.signature ? { ...sanitizePublicValue(receipt.signature) } : receipt.signature,
  })) : [];
  vault.memories = new Map();
  for (const record of bundle.memory_objects ?? []) {
    vault.memories.set(record.memory_addr, publicRecord(record));
  }
  const lifecycle = reconcileImportedLifecycle(bundle, vault.memories, vault.receipts);
  vault.activeAddresses = lifecycle.active;
  vault.tombstones = lifecycle.tombstones;
  const roots = vault.__computeRoots();
  vault.active_set_root = roots.active_set_root;
  vault.receipt_log_root = roots.receipt_log_root;
  appendEvent(vault, {
    operation: 'import',
    actor_id: args.actor_id ?? args.actorId,
    policy_id: args.policy_id ?? args.policyId,
    now: args.now,
    metadata: {
      imported_memory_count: vault.memories.size,
      imported_active_count: vault.activeAddresses.size,
      imported_tombstone_count: vault.tombstones.size,
    },
  });
  return { vault, active_memory_addresses: [...vault.activeAddresses].sort(), tombstones: [...vault.tombstones.values()], warnings };

}
