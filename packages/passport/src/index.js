import { randomUUID } from 'node:crypto';
import { canonicalize, receiptHash, sha256Hex, verifyReceipt } from '../../core/src/index.js';
import {
  createMemoryAccessReceipt,
  createMemoryOptimizationPlan,
  estimateTextTokens,
} from '../../optimizer/src/index.js';

const PASSPORT_SCHEMA = 'enigma.passport.v1';
const CONTEXT_PACK_SCHEMA = 'enigma.context_pack.v1';
const ZERO_ROOT = `sha256:${'0'.repeat(64)}`;
const ROOT_RE = /^sha256:[a-f0-9]{64}$/;
const PREVIOUS_RECEIPT_RE = /^(GENESIS|sha256:[a-f0-9]{64})$/;
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
const PUBLIC_PLAINTEXT_KEYS = new Set(['body', 'content', 'context', 'contexttext', 'memory', 'memories', 'plain', 'plaintext', 'prompt', 'raw', 'rawmemory', 'rawmemories', 'response', 'text']);
const SOURCE_REF_ROOT_RE = /^sha256:[a-f0-9]{64}$/;
const PUBLIC_KEY_REQUIRED_FOR_CONTEXT_PACK_VERIFICATION = 'PUBLIC_KEY_REQUIRED_FOR_CONTEXT_PACK_VERIFICATION';

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

function sourceRefCommitment(value) {
  return `sha256:${sha256Hex(String(value))}`;
}


function sanitizeSourceRefValue(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return sourceRefCommitment(value);
  if (['number', 'boolean'].includes(typeof value)) return value;
  if (Array.isArray(value)) return value.map(sanitizeSourceRefValue).filter((item) => item !== undefined);
  if (typeof value !== 'object') return undefined;

  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (isSourceRefPlaintextLikeKey(key)) {
      if (item !== undefined && item !== null && ['string', 'number', 'boolean'].includes(typeof item)) {
        out[privateCommitmentKey(key)] = sourceRefCommitment(item);
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
      out.push({ source_hash: sourceRefCommitment(ref) });
      continue;
    }
    const sanitized = sanitizeSourceRefValue(ref);
    if (sanitized !== undefined) out.push(sanitized);
  }
  return out;
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
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`;
}

function nowIso(now) {
  if (now instanceof Date) return now.toISOString();
  if (typeof now === 'string') return new Date(now).toISOString();
  return new Date().toISOString();
}

function rootsFromVault(vault) {
  if (vault?.__computeRoots) return vault.__computeRoots();
  return {
    active_set_root: vault?.active_set_root ?? ZERO_ROOT,
    receipt_log_root: vault?.receipt_log_root ?? ZERO_ROOT,
  };
}

function activeAddressesFrom(input) {
  if (!input) return new Set();
  if (input instanceof Set) return new Set(input);
  if (Array.isArray(input)) return new Set(input);
  if (input.activeAddresses instanceof Set) return new Set(input.activeAddresses);
  if (Array.isArray(input.active_memory_addresses)) return new Set(input.active_memory_addresses);
  if (Array.isArray(input.activeState)) return new Set(input.activeState);
  if (Array.isArray(input.active_memory_addresses)) return new Set(input.active_memory_addresses);
  return new Set();
}

function tombstoneAddressesFrom(input) {
  if (!input) return new Set();
  if (input instanceof Map) return new Set(input.keys());
  if (Array.isArray(input)) return new Set(input.map((item) => item.memory_addr ?? item.memoryAddr ?? item));
  if (input.tombstones instanceof Map) return new Set(input.tombstones.keys());
  if (Array.isArray(input.tombstones)) return new Set(input.tombstones.map((item) => item.memory_addr ?? item.memoryAddr ?? item));
  return new Set();
}

function memoryAddressesFromPack(contextPack) {
  const addresses = new Set(contextPack?.memory_addresses ?? []);
  for (const memory of contextPack?.memories ?? []) {
    if (memory?.memory_addr) addresses.add(memory.memory_addr);
  }
  return [...addresses];
}

function publicMemory(record, content) {
  return {
    memory_addr: record.memory_addr,
    memory_id: record.memory_id,
    subject_id: record.subject_id,
    kind: record.kind,
    sensitivity: record.sensitivity,
    purpose_tags: record.purpose_tags ?? [],
    source_refs: sanitizeSourceRefs(record.source_refs),
    confidence: record.confidence,
    content,
  };
}

function optimizerEnabled(args) {
  return args.optimize === true
    || args.optimize_context === true
    || args.optimizeContext === true
    || args.max_estimated_tokens !== undefined
    || args.maxEstimatedTokens !== undefined
    || args.pricing !== undefined
    || args.price_per_million_tokens !== undefined
    || args.pricePerMillionTokens !== undefined;
}

function contextPackPricing(args) {
  const price = args.pricing ?? args.price ?? args.price_per_million_tokens ?? args.pricePerMillionTokens;
  if (price === undefined || price === null || price === '') return undefined;
  if (typeof price === 'object') return price;
  return {
    price_per_million_tokens: Number(price),
    currency: args.currency ?? 'USD',
  };
}

function optimizationCandidateFrom(vault, memoryAddr) {
  const record = vault.__getRecord(memoryAddr);
  if (!record || record.state !== 'active') return null;
  const content = vault.__getPlaintext(memoryAddr);
  return {
    address: memoryAddr,
    content,
    importance: typeof record.importance === 'number' ? record.importance : typeof record.confidence === 'number' ? record.confidence : undefined,
    last_accessed_at: record.updated_at ?? record.created_at,
    metadata: {
      kind: record.kind,
      sensitivity: record.sensitivity,
      purpose_tags: record.purpose_tags ?? [],
      source_refs: sanitizeSourceRefs(record.source_refs),
    },
  };
}

function optimizedSelectionFrom(args, candidateAddresses, limit) {
  const candidates = [];
  for (const memoryAddr of candidateAddresses) {
    const candidate = optimizationCandidateFrom(args.vault, memoryAddr);
    if (candidate) candidates.push(candidate);
  }
  const plan = createMemoryOptimizationPlan({
    candidates,
    prompt: args.query ?? '',
    pricing: contextPackPricing(args),
    now: args.now,
    default_importance: args.default_importance ?? args.defaultImportance,
  });
  const maxTokensValue = args.max_estimated_tokens ?? args.maxEstimatedTokens;
  const maxTokens = maxTokensValue === undefined ? undefined : Number(maxTokensValue);
  if (maxTokensValue !== undefined && (!Number.isFinite(maxTokens) || maxTokens < 0)) {
    throw new Error('max_estimated_tokens must be a non-negative number');
  }
  const selected = [];
  let tokenBudgetUsed = estimateTextTokens(args.query ?? '');
  for (const item of plan.items) {
    if (selected.length >= limit) break;
    if (Number.isFinite(maxTokens) && tokenBudgetUsed + item.optimized_prompt_tokens > maxTokens) continue;
    selected.push(item.address);
    tokenBudgetUsed += item.optimized_prompt_tokens;
  }
  const selectedSet = new Set(selected);
  const selectedPlan = createMemoryOptimizationPlan({
    candidates: candidates.filter((candidate) => selectedSet.has(candidate.address)),
    prompt: args.query ?? '',
    pricing: contextPackPricing(args),
    now: args.now,
    default_importance: args.default_importance ?? args.defaultImportance,
  });
  return { selected, plan: selectedPlan };
}

function publicContextMemory(memory) {
  return {
    memory_addr: memory?.memory_addr,
    memory_id: memory?.memory_id,
    subject_id: memory?.subject_id,
    kind: memory?.kind,
    sensitivity: memory?.sensitivity,
    purpose_tags: Array.isArray(memory?.purpose_tags) ? [...memory.purpose_tags] : [],
    source_refs: sanitizeSourceRefs(memory?.source_refs),
    confidence: memory?.confidence,
    content_redacted: true,
  };
}

function publicOptimizationItem(item) {
  if (!item || typeof item !== 'object') return item;
  const out = { ...item };
  if (out.content_hash !== undefined) {
    delete out.content_hash;
    out.content_hash_redacted = true;
  }
  return out;
}

function publicOptimizationPlan(plan) {
  if (!plan || typeof plan !== 'object') return null;
  const tiers = {};
  for (const [tier, items] of Object.entries(plan.tiers ?? {})) {
    tiers[tier] = Array.isArray(items) ? items.map(publicOptimizationItem) : [];
  }
  return {
    ...plan,
    tiers,
    items: Array.isArray(plan.items) ? plan.items.map(publicOptimizationItem) : [],
  };
}

function publicOptimizationReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object') return receipt;
  const out = { ...receipt };
  if (out.content_hash !== undefined) {
    delete out.content_hash;
    out.content_hash_redacted = true;
  }
  return out;
}

function publicOptimizationReceipts(receipts) {
  return Array.isArray(receipts) ? receipts.map(publicOptimizationReceipt) : [];
}

function publicContextPack(contextPack) {
  return {
    schema: contextPack.schema,
    context_pack_id: contextPack.context_pack_id,
    passport_id: contextPack.passport_id,
    generated_at: contextPack.generated_at,
    provider: contextPack.provider,
    model: contextPack.model,
    purpose: contextPack.purpose,
    query_redacted: contextPack.query !== undefined,
    memory_addresses: [...(contextPack.memory_addresses ?? [])],
    memories: Array.isArray(contextPack.memories) ? contextPack.memories.map(publicContextMemory) : [],
    receipts: Array.isArray(contextPack.receipts) ? contextPack.receipts.map(publicReceipt) : [],
    retrieval_receipts: Array.isArray(contextPack.retrieval_receipts) ? contextPack.retrieval_receipts.map(publicReceipt) : [],
    injection_receipts: Array.isArray(contextPack.injection_receipts) ? contextPack.injection_receipts.map(publicReceipt) : [],
    active_set_root: contextPack.active_set_root,
    receipt_log_root: contextPack.receipt_log_root,
    receipt_hashes: [...(contextPack.receipt_hashes ?? [])],
    optimization_plan: publicOptimizationPlan(contextPack.optimization_plan),
    optimization_receipts: publicOptimizationReceipts(contextPack.optimization_receipts),
  };
}

function publicReceipt(receipt) {
  return {
    schema: receipt?.schema,
    receipt_id: receipt?.receipt_id,
    event_hash: receipt?.event_hash,
    operation: receipt?.operation,
    tenant_id: receipt?.tenant_id,
    subject_id: receipt?.subject_id,
    memory_addr: receipt?.memory_addr,
    source_addr: receipt?.source_addr,
    provider: receipt?.provider,
    model: receipt?.model,
    policy_id: receipt?.policy_id,
    sequence: receipt?.sequence,
    previous_receipt_hash: receipt?.previous_receipt_hash,
    active_set_root: receipt?.active_set_root,
    receipt_log_root: receipt?.receipt_log_root,
    timestamp: receipt?.timestamp,
    signer: receipt?.signer ? { key_id: receipt.signer.key_id, alg: receipt.signer.alg } : receipt?.signer,
    signature: receipt?.signature ? { alg: receipt.signature.alg, value: receipt.signature.value } : receipt?.signature,
  };
}

function receiptHasPublicShape(receipt) {
  if (!receipt || receipt.schema !== 'enigma.receipt.v1') return false;
  for (const key of Object.keys(receipt)) {
    if (!RECEIPT_TOP_LEVEL_FIELDS.has(key) || PUBLIC_PLAINTEXT_KEYS.has(key)) return false;
  }
  if (!receipt.signer || typeof receipt.signer !== 'object' || Array.isArray(receipt.signer)) return false;
  if (receipt.signer.alg !== 'Ed25519' || typeof receipt.signer.key_id !== 'string' || receipt.signer.key_id.length === 0) return false;
  if (!receipt.signature || typeof receipt.signature !== 'object' || Array.isArray(receipt.signature)) return false;
  if (receipt.signature.alg !== 'Ed25519' || typeof receipt.signature.value !== 'string' || receipt.signature.value.length === 0) return false;
  for (const key of Object.keys(receipt.signature)) {
    if (!RECEIPT_SIGNATURE_FIELDS.has(key)) return false;
  }
  return (
    typeof receipt.receipt_id === 'string'
    && typeof receipt.operation === 'string'
    && typeof receipt.tenant_id === 'string'
    && typeof receipt.subject_id === 'string'
    && Number.isInteger(receipt.sequence)
    && receipt.sequence >= 0
    && ROOT_RE.test(receipt.event_hash ?? '')
    && ROOT_RE.test(receipt.active_set_root ?? '')
    && ROOT_RE.test(receipt.receipt_log_root ?? '')
    && PREVIOUS_RECEIPT_RE.test(receipt.previous_receipt_hash ?? '')
  );
}


function rejectInvalid(errors) {
  if (errors.length === 0) return;
  const error = new Error(`context pack verification failed: ${errors.join('; ')}`);
  error.code = 'ERR_CONTEXT_PACK_INVALID';
  error.errors = errors;
  throw error;
}

function trustedKeyOptions(args = {}) {
  const bundle = args.trustedKeyBundle ?? args.trusted_key_bundle ?? args.trustedBundle ?? args.trusted_bundle ?? args.trustBundle ?? args.trust_bundle ?? args.bundle;
  const descriptor = args.trustDescriptor ?? args.trustedDescriptor ?? args.issuerDescriptor ?? args.descriptor ?? bundle?.trustDescriptor ?? bundle?.descriptor;
  const publicKey = args.publicKey
    ?? args.public_key
    ?? args.trustedPublicKey
    ?? args.trusted_public_key
    ?? descriptor?.public_key
    ?? descriptor?.publicKey
    ?? descriptor?.key?.public_key
    ?? descriptor?.key?.publicKey
    ?? bundle?.publicKey
    ?? bundle?.public_key
    ?? bundle?.key?.public_key
    ?? bundle?.key?.publicKey
    ?? bundle?.signer?.publicKey
    ?? bundle?.signer?.public_key
    ?? bundle?.keyring?.publicKey
    ?? bundle?.keyring?.public_key
    ?? bundle?.keypair?.publicKey
    ?? bundle?.keys?.publicKey;
  if (publicKey !== undefined) return { publicKey };
  const publicKeys = args.publicKeys
    ?? args.public_keys
    ?? args.keyring
    ?? args.keys
    ?? bundle?.publicKeys
    ?? bundle?.public_keys
    ?? bundle?.keyring
    ?? bundle?.keys;
  if (publicKeys !== undefined) return { publicKeys };

  const trustedIssuers = bundle?.trust_bundle?.trusted_issuers ?? bundle?.trust?.trusted_issuers ?? bundle?.trusted_issuers;
  if (!Array.isArray(trustedIssuers)) return undefined;
  const issuerKeys = {};
  for (const issuer of trustedIssuers) {
    const keyId = issuer?.key_id ?? issuer?.keyId ?? issuer?.key?.key_id ?? issuer?.key?.keyId;
    const issuerPublicKey = issuer?.public_key ?? issuer?.publicKey ?? issuer?.key?.public_key ?? issuer?.key?.publicKey;
    if (typeof keyId === 'string' && issuerPublicKey !== undefined) issuerKeys[keyId] = issuerPublicKey;
  }
  return Object.keys(issuerKeys).length > 0 ? { publicKeys: issuerKeys } : undefined;
}

function verifyReceiptBestEffort(receipt, trustOptions) {
  if (!trustOptions) return false;
  try {
    const result = verifyReceipt({ receipt, ...trustOptions });
    return result !== false && result?.ok !== false && result?.valid !== false;
  } catch {
    return false;
  }
}

function invalidContextPackResult(contextPack, errors) {
  const publicPack = publicContextPack(contextPack);
  return {
    valid: false,
    error: errors[0],
    reason: errors[0],
    errors,
    context_pack_id: contextPack.context_pack_id,
    memory_addresses: [...(contextPack.memory_addresses ?? [])],
    public_context_pack: publicPack,
    canonical: canonical(publicPack),
  };
}

function receiptDigest(receipt) {
  try {
    const digest = receiptHash(receipt);
    return String(digest).startsWith('sha256:') ? String(digest) : `sha256:${digest}`;
  } catch {
    return undefined;
  }
}

export function createPassport(args = {}) {
  const vault = args.vault;
  const createdAt = nowIso(args.now);
  const roots = rootsFromVault(vault);
  const activeAddresses = activeAddressesFrom(vault);
  const tombstoneAddresses = tombstoneAddressesFrom(vault);
  return {
    schema: PASSPORT_SCHEMA,
    passport_id: args.passport_id ?? args.passportId ?? `passport_${randomUUID()}`,
    owner: {
      subject_id: args.owner?.subject_id ?? args.subject_id ?? args.subjectId ?? vault?.subject_id ?? 'local-subject',
      display_name: args.owner?.display_name ?? args.display_name ?? args.displayName ?? 'Local user',
      identity_refs: args.owner?.identity_refs ?? args.identity_refs ?? args.identityRefs ?? [],
    },
    created_at: createdAt,
    updated_at: createdAt,
    vault: {
      vault_id: vault?.vault_id ?? args.vault_id ?? args.vaultId ?? 'local-vault',
      encryption: vault?.encryption ?? 'local_aead',
      active_set_root: roots.active_set_root,
      receipt_log_root: roots.receipt_log_root,
    },
    policies: args.policies ?? [vault?.policy_id ?? 'local-default'],
    checkpoints: [
      {
        sequence: vault?.sequence ?? 0,
        active_set_root: roots.active_set_root,
        receipt_log_root: roots.receipt_log_root,
        timestamp: createdAt,
      },
    ],
    active_memory_addresses: [...activeAddresses].sort(),
    tombstone_addresses: [...tombstoneAddresses].sort(),
  };
}

export function compileContextPack(args = {}) {
  const vault = args.vault;
  if (!vault) throw new Error('compileContextPack requires a vault');
  if (!vault.__getRecord || !vault.__getPlaintext || !vault.__recordEvent) {
    throw new Error('compileContextPack requires a live vault created by packages/vault');
  }

  const passport = args.passport ?? createPassport({ vault, now: args.now });
  const requested = args.memory_addresses ?? args.memoryAddresses;
  const active = activeAddressesFrom(vault);
  const tombstones = tombstoneAddressesFrom(vault);
  const limit = Number(args.limit ?? args.max_memories ?? args.maxMemories ?? 12);
  if (!Number.isInteger(limit) || limit < 0) throw new Error('compileContextPack limit must be a non-negative integer');
  const candidateAddresses = requested ? [...requested] : [...active];
  let selected = candidateAddresses.slice(0, limit);
  let optimizationPlan = null;
  if (optimizerEnabled(args)) {
    const optimized = optimizedSelectionFrom({ ...args, vault }, candidateAddresses, limit);
    selected = optimized.selected;
    optimizationPlan = optimized.plan;
  }
  const errors = [];

  for (const memoryAddr of selected) {
    if (tombstones.has(memoryAddr)) errors.push(`memory is tombstoned: ${memoryAddr}`);
    if (!active.has(memoryAddr)) errors.push(`memory is absent from active state: ${memoryAddr}`);
    const record = vault.__getRecord(memoryAddr);
    if (!record || record.state !== 'active') errors.push(`memory record is not active: ${memoryAddr}`);
  }
  rejectInvalid(errors);

  const contextPackId = args.context_pack_id ?? args.contextPackId ?? `ctx_${randomUUID()}`;
  const generatedAt = nowIso(args.now);
  const memories = [];
  const retrievalReceipts = [];
  const injectionReceipts = [];

  for (const memoryAddr of selected) {
    const record = vault.__getRecord(memoryAddr);
    const content = vault.__getPlaintext(memoryAddr);
    memories.push(publicMemory(record, content));

    retrievalReceipts.push(
      vault.__recordEvent({
        operation: 'retrieve',
        memory_addr: memoryAddr,
        provider: args.provider,
        model: args.model,
        purpose: args.purpose,
        actor_id: args.actor_id ?? args.actorId,
        policy_id: args.policy_id ?? args.policyId,
        now: args.now,
        metadata: { context_pack_id: contextPackId, kind: record.kind, sensitivity: record.sensitivity },
      }).receipt,
    );
    injectionReceipts.push(
      vault.__recordEvent({
        operation: 'inject',
        memory_addr: memoryAddr,
        provider: args.provider,
        model: args.model,
        purpose: args.purpose,
        actor_id: args.actor_id ?? args.actorId,
        policy_id: args.policy_id ?? args.policyId,
        now: args.now,
        metadata: { context_pack_id: contextPackId, kind: record.kind, sensitivity: record.sensitivity },
      }).receipt,
    );
  }

  const optimizationReceipts = optimizationPlan === null
    ? []
    : optimizationPlan.items.map((item, index) => createMemoryAccessReceipt({
      item,
      plan: optimizationPlan,
      timestamp: generatedAt,
      sequence: index,
      pricing: optimizationPlan.pricing,
    }));

  const roots = rootsFromVault(vault);
  const contextPack = {
    schema: CONTEXT_PACK_SCHEMA,
    context_pack_id: contextPackId,
    passport_id: passport.passport_id,
    generated_at: generatedAt,
    provider: args.provider ?? 'local',
    model: args.model ?? 'local',
    purpose: args.purpose ?? 'context_injection',
    query: args.query ?? '',
    memory_addresses: selected,
    memories,
    receipts: [...retrievalReceipts, ...injectionReceipts],
    retrieval_receipts: retrievalReceipts,
    injection_receipts: injectionReceipts,
    active_set_root: roots.active_set_root,
    receipt_log_root: roots.receipt_log_root,
    receipt_hashes: [...retrievalReceipts, ...injectionReceipts].map(receiptDigest).filter(Boolean),
    optimization_plan: optimizationPlan,
    optimization_receipts: optimizationReceipts,
  };

  Object.defineProperties(contextPack, {
    contextPack: { value: contextPack, enumerable: false },
    context_pack: { value: contextPack, enumerable: false },
  });
  return contextPack;
}

export function verifyContextPack(args = {}) {
  const contextPack = args.schema === CONTEXT_PACK_SCHEMA ? args : (args.contextPack ?? args.context_pack ?? args.pack);
  if (!contextPack || contextPack.schema !== CONTEXT_PACK_SCHEMA) throw new Error('verifyContextPack requires an enigma.context_pack.v1 pack');
  const passport = args.passport;
  const active = new Set([
    ...activeAddressesFrom(args.active_state ?? args.activeState),
    ...activeAddressesFrom(args.vault),
    ...activeAddressesFrom(passport),
  ]);
  const tombstones = new Set([
    ...tombstoneAddressesFrom(args.tombstones),
    ...tombstoneAddressesFrom(args.vault),
    ...tombstoneAddressesFrom(passport),
    ...(passport?.tombstone_addresses ?? []),
  ]);
  const trustOptions = trustedKeyOptions(args);

  const errors = [];
  if (!trustOptions) errors.push(PUBLIC_KEY_REQUIRED_FOR_CONTEXT_PACK_VERIFICATION);
  for (const memoryAddr of memoryAddressesFromPack(contextPack)) {
    if (tombstones.has(memoryAddr)) errors.push(`memory is tombstoned: ${memoryAddr}`);
    if (!active.has(memoryAddr)) errors.push(`memory is absent from active state: ${memoryAddr}`);
  }

  const receiptOperations = new Map();
  for (const receipt of contextPack.receipts ?? []) {
    if (!receiptHasPublicShape(receipt) || (trustOptions && !verifyReceiptBestEffort(receipt, trustOptions))) errors.push(`receipt failed verification: ${receipt.receipt_id ?? 'unknown'}`);
    if (receipt.memory_addr) {
      const ops = receiptOperations.get(receipt.memory_addr) ?? new Set();
      ops.add(receipt.operation);
      receiptOperations.set(receipt.memory_addr, ops);
    }
  }
  for (const memoryAddr of contextPack.memory_addresses ?? []) {
    const ops = receiptOperations.get(memoryAddr) ?? new Set();
    if (!ops.has('retrieve')) errors.push(`missing retrieve receipt: ${memoryAddr}`);
    if (!ops.has('inject')) errors.push(`missing inject receipt: ${memoryAddr}`);
  }

  if (errors.includes(PUBLIC_KEY_REQUIRED_FOR_CONTEXT_PACK_VERIFICATION)) return invalidContextPackResult(contextPack, errors);
  rejectInvalid(errors);
  const publicPack = publicContextPack(contextPack);
  return {
    valid: true,
    context_pack_id: contextPack.context_pack_id,
    memory_addresses: [...(contextPack.memory_addresses ?? [])],
    public_context_pack: publicPack,
    canonical: canonical(publicPack),
  };
}
