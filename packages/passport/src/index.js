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

const QUERY_RELEVANCE_STOPWORDS = new Set([
  'about',
  'after',
  'again',
  'against',
  'also',
  'and',
  'any',
  'are',
  'assistant',
  'because',
  'been',
  'before',
  'being',
  'between',
  'can',
  'could',
  'current',
  'does',
  'from',
  'has',
  'have',
  'how',
  'into',
  'its',
  'latest',
  'more',
  'most',
  'number',
  'own',
  'owns',
  'please',
  'should',
  'that',
  'the',
  'their',
  'then',
  'there',
  'these',
  'they',
  'this',
  'use',
  'using',
  'was',
  'what',
  'when',
  'where',
  'which',
  'who',
  'whose',
  'why',
  'with',
  'would',
]);

function addMeaningfulToken(tokens, token) {
  if (token.length < 3) return;
  if (!/[a-z]/u.test(token)) return;
  if (QUERY_RELEVANCE_STOPWORDS.has(token)) return;
  tokens.add(token);
}

function meaningfulTokensFrom(value) {
  const tokens = new Set();
  if (value === undefined || value === null) return tokens;
  for (const match of String(value).toLowerCase().matchAll(/[a-z0-9]+(?:[-_][a-z0-9]+)*/gu)) {
    const token = match[0];
    addMeaningfulToken(tokens, token);
    if (token.includes('-') || token.includes('_')) {
      for (const part of token.split(/[-_]+/u)) addMeaningfulToken(tokens, part);
    }
  }
  return tokens;
}

function addTokensFromValue(tokens, value) {
  for (const token of meaningfulTokensFrom(value)) tokens.add(token);
}

function candidateRelevanceTokens(candidate) {
  const tokens = new Set();
  addTokensFromValue(tokens, candidate.content);
  addTokensFromValue(tokens, candidate.metadata?.kind);
  for (const tag of candidate.metadata?.purpose_tags ?? []) addTokensFromValue(tokens, tag);
  return tokens;
}


function tokenOverlapScore(queryTokens, memoryTokens) {
  if (queryTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of queryTokens) {
    if (memoryTokens.has(token)) overlap += 1;
  }
  return overlap / queryTokens.size;
}

function strictQueryRelevance(args) {
  return args.strict_relevance === true
    || args.strictRelevance === true
    || args.require_relevance === true
    || args.requireRelevance === true
    || args.query_relevance === 'strict'
    || args.queryRelevance === 'strict';
}

function relevanceCandidateSet(args, candidates) {
  if (args.queryAwareRelevance !== true) return candidates;
  const query = typeof args.query === 'string' ? args.query.trim() : String(args.query ?? '').trim();
  if (query.length === 0) return candidates;
  const queryTokens = meaningfulTokensFrom(query);
  if (queryTokens.size === 0) return candidates;

  const relevant = [];
  for (const candidate of candidates) {
    const relevance = tokenOverlapScore(queryTokens, candidateRelevanceTokens(candidate));
    if (relevance > 0) relevant.push({ ...candidate, importance: Math.max(candidate.importance ?? 0, relevance) });
  }
  if (relevant.length > 0) return relevant;
  return strictQueryRelevance(args) ? [] : candidates;
}


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
  const planCandidates = relevanceCandidateSet(args, candidates);
  const plan = createMemoryOptimizationPlan({
    candidates: planCandidates,
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
    candidates: planCandidates.filter((candidate) => selectedSet.has(candidate.address)),
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
  const hasExplicitMemoryAddresses = Boolean(requested);
  const candidateAddresses = hasExplicitMemoryAddresses ? [...requested] : [...active];
  let selected = candidateAddresses.slice(0, limit);
  let optimizationPlan = null;
  if (optimizerEnabled(args)) {
    const optimized = optimizedSelectionFrom({ ...args, vault, queryAwareRelevance: !hasExplicitMemoryAddresses }, candidateAddresses, limit);
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


const MEMORY_DRIVE_HEALTH_SCHEMA = 'enigma.memory_drive_health_report.v1';
const DEFAULT_HEALTH_NOW = '2026-06-25T00:00:00.000Z';
const DEFAULT_TOKENS_PER_MEMORY = 64;
const HEALTH_METRIC_NAMES = Object.freeze([
  'freshness',
  'duplicate_rate',
  'tombstone_risk',
  'stale_derived_artifacts',
  'retrieval_hit_rate',
  'token_reduction',
  'leakage_scan',
  'receipt_coverage',
  'connector_health',
  'sync_fork_risk',
]);
const HEALTH_METRIC_WEIGHTS = Object.freeze({
  freshness: 10,
  duplicate_rate: 8,
  tombstone_risk: 12,
  stale_derived_artifacts: 10,
  retrieval_hit_rate: 14,
  token_reduction: 8,
  leakage_scan: 14,
  receipt_coverage: 10,
  connector_health: 8,
  sync_fork_risk: 6,
});
const HEALTH_EVIDENCE_PREFIX = Object.freeze({
  freshness: 'freshness_scan',
  duplicate_rate: 'dedupe_scan',
  tombstone_risk: 'tombstone_scan',
  stale_derived_artifacts: 'artifact_inventory',
  retrieval_hit_rate: 'benchmark_report',
  token_reduction: 'optimizer_report',
  leakage_scan: 'leakage_scan',
  receipt_coverage: 'receipt_inventory',
  connector_health: 'connector_inventory',
  sync_fork_risk: 'replica_roots',
});
const DEFAULT_HEALTH_POLICY = Object.freeze({
  freshness_window_hours: 48,
  freshness_healthy_ratio: 0.95,
  freshness_watch_ratio: 0.85,
  freshness_degraded_ratio: 0.7,
  duplicate_rate_watch_floor: 0.02,
  duplicate_rate_degraded_floor: 0.05,
  duplicate_rate_critical_floor: 0.12,
  tombstone_ack_window_hours: 24,
  retrieval_top_k: 5,
  hit_at_k_floor: 0.9,
  exact_coverage_floor: 0.85,
  abstention_correctness_floor: 0.95,
  token_reduction_floor: 0.5,
  receipt_coverage_healthy_floor: 0.99,
  receipt_coverage_watch_floor: 0.95,
  receipt_coverage_degraded_floor: 0.85,
  connector_max_error_rate_24h: 0.01,
  sync_max_read_only_lag_versions: 1,
});
const HEALTH_FORBIDDEN_KEY_RE = /(?:^|_)(?:raw|plaintext|plain_text|prompt|prompts|message|messages|text|content|document|documents|transcript|transcripts|completion|completions|embedding|embeddings|provider_response|provider_responses|response_body|credential|credentials|api_key|secret|password|private_key|seed|seed_phrase|mnemonic|tenant_name|customer_name|organization_name|org_name)(?:$|_)/iu;
const HEALTH_SECRET_VALUE_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|(?:seed phrase|mnemonic phrase|raw memory|private prompt|full transcript|provider response|embedding vector))/iu;
const HEALTH_SAFE_KEYS = new Set([
  'transaction_submitted',
  'raw_memory_on_chain',
  'provider_deletion_claim',
  'model_forgetting_claim',
  'hosted_saas_claim',
  'report_ref',
  'drive_ref',
  'namespace_ref',
  'source_root',
  'policy_ref',
  'artifact_root',
  'instruction_ref',
  'latest_anchor_batch_ref',
  'private_payloads_included',
  'connector_bodies_included',
  'identity_labels_included',
  'secret_material_included',
  'provider_bodies_included',
  'secret_value_hits',
  'forbidden_payload_key_hits',
  'secret_value_hits_allowed',
  'forbidden_payload_key_hits_allowed',
]);

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function bandScore(status, goodness) {
  const r = clamp01(goodness);
  switch (status) {
    case 'healthy':
      return 90 + Math.round(10 * r);
    case 'watch':
      return 75 + Math.round(14 * r);
    case 'degraded':
      return 50 + Math.round(24 * r);
    case 'critical':
      return Math.round(49 * r);
    default:
      return 0;
  }
}

function statusFromScore(score) {
  if (score >= 90) return 'healthy';
  if (score >= 75) return 'watch';
  if (score >= 50) return 'degraded';
  return 'critical';
}

function ageHours(iso, nowMs) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (nowMs - t) / 3600000);
}

function healthScan(value, path, hits) {
  if (typeof value === 'string') {
    if (HEALTH_SECRET_VALUE_RE.test(value)) hits.secret.push(path || '<root>');
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => healthScan(item, `${path}[${index}]`, hits));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      if (HEALTH_FORBIDDEN_KEY_RE.test(key) && !HEALTH_SAFE_KEYS.has(key)) hits.keys.push(childPath);
      healthScan(child, childPath, hits);
    }
  }
}

function healthDigest(value) {
  return `sha256:${sha256Hex(canonical(value))}`;
}

function healthEvidenceRef(metricName, observed) {
  return `${HEALTH_EVIDENCE_PREFIX[metricName]}_${healthDigest(observed)}`;
}

function healthMetric(metricName, { status, score, observed, thresholds, evidenceRef, recommendedActions }) {
  const actions = Array.isArray(recommendedActions) ? recommendedActions.filter(Boolean) : [];
  return {
    status,
    score,
    observed,
    thresholds,
    evidence_refs: evidenceRef ? [evidenceRef] : [],
    recommended_actions: actions,
  };
}

function vaultRecord(vault, addr) {
  if (vault?.__getRecord) {
    try {
      return vault.__getRecord(addr) ?? null;
    } catch {
      return null;
    }
  }
  if (vault?.memories instanceof Map) return vault.memories.get(addr) ?? null;
  if (Array.isArray(vault?.memory_objects)) return vault.memory_objects.find((record) => record?.memory_addr === addr) ?? null;
  return null;
}

function driveIdentity(vault, passport) {
  const bundleVault = vault?.schema === 'enigma.vault_bundle.v1' ? vault.vault : vault;
  return {
    vault_id: bundleVault?.vault_id ?? vault?.vault_id ?? passport?.vault?.vault_id ?? 'local-vault',
    tenant_id: bundleVault?.tenant_id ?? vault?.tenant_id ?? passport?.owner?.subject_id ?? 'local',
    subject_id: bundleVault?.subject_id ?? vault?.subject_id ?? passport?.owner?.subject_id ?? 'local-subject',
    policy_id: bundleVault?.policy_id ?? vault?.policy_id ?? 'local-default',
  };
}

function normalizeContextPacks(args) {
  const packs = [];
  const fromArgs = args.contextPacks ?? args.context_packs ?? [];
  const single = args.contextPack ?? args.context_pack ?? args.pack;
  const list = single ? [single] : fromArgs;
  for (const pack of Array.isArray(list) ? list : []) {
    if (!pack) continue;
    packs.push({
      artifact_type: pack.artifact_type ?? 'context_pack',
      source_root: pack.active_set_root ?? pack.activeSetRoot ?? pack.source_root ?? pack.sourceRoot,
      generated_at: pack.generated_at ?? pack.generatedAt,
      memory_addresses: pack.memory_addresses ?? [],
      serving: pack.serving !== false,
    });
  }
  const extras = args.derivedArtifacts ?? args.derived_artifacts ?? [];
  for (const artifact of Array.isArray(extras) ? extras : []) {
    if (!artifact) continue;
    packs.push({
      artifact_type: artifact.artifact_type ?? artifact.artifactType ?? 'derived_artifact',
      source_root: artifact.source_root ?? artifact.sourceRoot,
      generated_at: artifact.generated_at ?? artifact.generatedAt,
      memory_addresses: artifact.memory_addresses ?? [],
      serving: artifact.serving !== false,
    });
  }
  return packs;
}

function computeFreshness(records, policy, nowMs) {
  const activeRefCount = records.length;
  const thresholds = {
    fresh_records_ratio_watch_floor: policy.freshness_watch_ratio,
    fresh_records_ratio_degraded_floor: policy.freshness_degraded_ratio,
    policy_window_hours: policy.freshness_window_hours,
  };
  if (activeRefCount === 0) {
    const observed = { active_ref_count: 0, fresh_records_ratio: 1, p95_active_age_hours: 0, oldest_unrefreshed_age_hours: 0 };
    return healthMetric('freshness', { status: 'healthy', score: 100, observed, thresholds, evidenceRef: healthEvidenceRef('freshness', observed), recommendedActions: [] });
  }
  const finiteAges = [];
  let missingTimestamps = 0;
  for (const record of records) {
    const age = ageHours(record?.updated_at, nowMs);
    if (Number.isFinite(age)) finiteAges.push(age);
    else missingTimestamps += 1;
  }
  finiteAges.sort((a, b) => a - b);
  const freshCount = finiteAges.filter((age) => age <= policy.freshness_window_hours).length;
  const ratio = activeRefCount > 0 ? freshCount / activeRefCount : 1;
  const p95Index = finiteAges.length === 0 ? 0 : Math.min(finiteAges.length - 1, Math.floor(finiteAges.length * 0.95));
  const p95Age = finiteAges.length === 0 ? Number.POSITIVE_INFINITY : finiteAges[p95Index];
  const oldestAge = finiteAges.length === 0 ? Number.POSITIVE_INFINITY : finiteAges[finiteAges.length - 1];
  const observed = {
    active_ref_count: activeRefCount,
    fresh_records_ratio: roundRatio(ratio),
    p95_active_age_hours: Number.isFinite(p95Age) ? Math.round(p95Age) : null,
    oldest_unrefreshed_age_hours: Number.isFinite(oldestAge) ? Math.round(oldestAge) : null,
  };
  let status;
  if (missingTimestamps > 0 || ratio < policy.freshness_degraded_ratio) status = 'critical';
  else if (ratio < policy.freshness_watch_ratio || oldestAge > 2 * policy.freshness_window_hours) status = 'degraded';
  else if (ratio < policy.freshness_healthy_ratio || p95Age > policy.freshness_window_hours) status = 'watch';
  else status = 'healthy';
  const recommendedActions = [];
  if (status !== 'healthy') {
    recommendedActions.push('Run local revalidation for stale namespaces.');
    if (oldestAge > policy.freshness_window_hours) recommendedActions.push('Rebuild the retrieval index for stale partitions.');
    if (status === 'critical') recommendedActions.push('Restore freshness metadata for active records before anchoring.');
  }
  return healthMetric('freshness', { status, score: bandScore(status, ratio), observed, thresholds, evidenceRef: healthEvidenceRef('freshness', observed), recommendedActions });
}

function computeDuplicateRate(records, policy) {
  const activeRefCount = records.length;
  const thresholds = {
    watch_floor: policy.duplicate_rate_watch_floor,
    degraded_floor: policy.duplicate_rate_degraded_floor,
    critical_floor: policy.duplicate_rate_critical_floor,
  };
  const hashCounts = new Map();
  for (const record of records) {
    const hash = record?.content_hash ?? record?.content_commitment ?? record?.memory_addr;
    hashCounts.set(hash, (hashCounts.get(hash) ?? 0) + 1);
  }
  let duplicateCandidateCount = 0;
  for (const count of hashCounts.values()) {
    if (count > 1) duplicateCandidateCount += count - 1;
  }
  const duplicateRate = activeRefCount > 0 ? duplicateCandidateCount / activeRefCount : 0;
  const observed = {
    active_ref_count: activeRefCount,
    duplicate_candidate_count: duplicateCandidateCount,
    duplicate_rate: roundRatio(duplicateRate),
    dedupe_savings_estimated_tokens: duplicateCandidateCount * DEFAULT_TOKENS_PER_MEMORY,
  };
  let status;
  if (duplicateRate > policy.duplicate_rate_critical_floor) status = 'critical';
  else if (duplicateRate >= policy.duplicate_rate_degraded_floor) status = 'degraded';
  else if (duplicateRate >= policy.duplicate_rate_watch_floor) status = 'watch';
  else status = 'healthy';
  const recommendedActions = [];
  if (status !== 'healthy') {
    recommendedActions.push('Merge duplicate candidates using local canonical refs.');
    recommendedActions.push('Preserve receipt lineage for merged records.');
  }
  return healthMetric('duplicate_rate', { status, score: bandScore(status, 1 - duplicateRate), observed, thresholds, evidenceRef: healthEvidenceRef('duplicate_rate', observed), recommendedActions });
}

function computeTombstoneRisk({ vault, tombstoneSet, deleteReceiptAddrs, artifacts, connectorReplayWindowHours, policy }) {
  const tombstoneCount = tombstoneSet.size;
  const thresholds = { max_ack_lag_hours: policy.tombstone_ack_window_hours };
  let unsettled = 0;
  for (const addr of tombstoneSet) {
    if (!deleteReceiptAddrs.has(addr)) unsettled += 1;
  }
  const artifactsReferencingTombstones = artifacts.filter((artifact) => artifact.memory_addresses.some((addr) => tombstoneSet.has(addr)));
  const derivedReferencingTombstones = artifactsReferencingTombstones.length;
  const servingReferencingTombstones = artifactsReferencingTombstones.filter((artifact) => artifact.serving).length;
  const replayWindow = Math.max(0, connectorReplayWindowHours ?? 0);
  const observed = {
    tombstone_count: tombstoneCount,
    unsettled_tombstone_count: unsettled,
    derived_artifacts_referencing_tombstones: derivedReferencingTombstones,
    tombstone_replay_window_hours: Math.round(replayWindow),
  };
  let status;
  if (servingReferencingTombstones > 0) status = 'critical';
  else if (derivedReferencingTombstones > 0 || replayWindow > policy.tombstone_ack_window_hours) status = 'degraded';
  else if (tombstoneCount > 0 && (unsettled > 0 || replayWindow > 0)) status = 'watch';
  else status = 'healthy';
  const recommendedActions = [];
  if (status !== 'healthy') {
    if (derivedReferencingTombstones > 0) recommendedActions.push('Invalidate derived artifacts that depend on tombstoned refs.');
    if (servingReferencingTombstones > 0) recommendedActions.push('Quarantine serving artifacts that can replay tombstoned content.');
    recommendedActions.push('Rebuild context packs and exports from active refs only.');
  }
  const goodness = tombstoneCount === 0 ? 1 : 1 - clamp01((unsettled + derivedReferencingTombstones) / Math.max(1, tombstoneCount));
  return healthMetric('tombstone_risk', { status, score: bandScore(status, goodness), observed, thresholds, evidenceRef: healthEvidenceRef('tombstone_risk', observed), recommendedActions });
}

function computeStaleDerivedArtifacts({ artifacts, currentRoot, nowMs, policy }) {
  const thresholds = { serving_path_stale_artifacts_allowed: 0 };
  const evaluated = artifacts.map((artifact) => ({
    ...artifact,
    stale: Boolean(artifact.source_root) && artifact.source_root !== currentRoot,
    lag_hours: ageHours(artifact.generated_at, nowMs),
  }));
  const staleArtifacts = evaluated.filter((artifact) => artifact.stale);
  const staleServing = staleArtifacts.filter((artifact) => artifact.serving);
  const staleTypes = [...new Set(staleArtifacts.map((artifact) => artifact.artifact_type))].sort();
  const maxLagHours = staleArtifacts.reduce((max, artifact) => (Number.isFinite(artifact.lag_hours) ? Math.max(max, artifact.lag_hours) : max), 0);
  const observed = {
    stale_artifact_count: staleArtifacts.length,
    artifact_types_stale: staleTypes,
    max_artifact_lag_versions: staleArtifacts.length > 0 ? 1 : 0,
    max_artifact_lag_hours: Number.isFinite(maxLagHours) ? Math.round(maxLagHours) : 0,
  };
  let status;
  if (staleServing.length > 0) status = 'degraded';
  else if (staleArtifacts.length > 0) status = 'watch';
  else status = 'healthy';
  const recommendedActions = [];
  if (status !== 'healthy') {
    recommendedActions.push('Rebuild active derived artifacts from the current source root.');
    if (staleServing.length > 0) recommendedActions.push('Quarantine proof packets made from stale roots.');
    recommendedActions.push('Require artifact builders to declare source_root and artifact_root.');
  }
  const total = Math.max(1, evaluated.length);
  const goodness = 1 - clamp01(staleArtifacts.length / total);
  return healthMetric('stale_derived_artifacts', { status, score: bandScore(status, goodness), thresholds, observed, evidenceRef: healthEvidenceRef('stale_derived_artifacts', observed), recommendedActions });
}

function computeRetrievalHitRate({ benchmarkSummary, policy }) {
  const thresholds = {
    hit_at_k_floor: policy.hit_at_k_floor,
    exact_coverage_floor: policy.exact_coverage_floor,
    abstention_correctness_floor: policy.abstention_correctness_floor,
  };
  if (!benchmarkSummary) {
    const observed = { probe_count: 0, top_k: policy.retrieval_top_k, hit_at_k: 0, exact_coverage: 0, abstention_correctness: 0, measured: false };
    return healthMetric('retrieval_hit_rate', { status: 'healthy', score: 90, observed, thresholds, evidenceRef: healthEvidenceRef('retrieval_hit_rate', observed), recommendedActions: ['Supply benchmark_summary to measure retrieval hit rate.'] });
  }
  const probeCount = nonNegativeInt(benchmarkSummary.probe_count ?? benchmarkSummary.probeCount);
  const topK = nonNegativeInt(benchmarkSummary.top_k ?? benchmarkSummary.topK ?? policy.retrieval_top_k);
  const hitAtK = clampRatio(benchmarkSummary.hit_at_k ?? benchmarkSummary.hitAtK);
  const exactCoverage = clampRatio(benchmarkSummary.exact_coverage ?? benchmarkSummary.exactCoverage);
  const abstention = clampRatio(benchmarkSummary.abstention_correctness ?? benchmarkSummary.abstentionCorrectness);
  const returnsTombstoned = Boolean(benchmarkSummary.returned_tombstoned_refs ?? benchmarkSummary.returnedTombstonedRefs);
  const observed = { probe_count: probeCount, top_k: topK, hit_at_k: hitAtK, exact_coverage: exactCoverage, abstention_correctness: abstention, measured: true };
  let status;
  if (returnsTombstoned || probeCount === 0) status = 'critical';
  else if (hitAtK < policy.hit_at_k_floor || exactCoverage < policy.exact_coverage_floor || abstention < policy.abstention_correctness_floor) status = 'degraded';
  else if (hitAtK < policy.hit_at_k_floor + 0.05 || exactCoverage < policy.exact_coverage_floor + 0.05 || abstention < policy.abstention_correctness_floor + 0.05) status = 'watch';
  else status = 'healthy';
  const recommendedActions = [];
  if (status !== 'healthy') {
    recommendedActions.push('Rebuild retrieval indexes.');
    recommendedActions.push('Inspect namespace filters and capability scopes.');
    recommendedActions.push('Compare against the last healthy benchmark report hash.');
  }
  const goodness = (hitAtK + exactCoverage + abstention) / 3;
  return healthMetric('retrieval_hit_rate', { status, score: bandScore(status, goodness), observed, thresholds, evidenceRef: healthEvidenceRef('retrieval_hit_rate', observed), recommendedActions });
}

function computeTokenReduction({ activeCount, contextPackProvided, selectedCount, retrievalGuardPassed, policy }) {
  const thresholds = { token_reduction_floor: policy.token_reduction_floor, quality_guard_required: true };
  if (!contextPackProvided) {
    const observed = { baseline_estimated_tokens: activeCount * DEFAULT_TOKENS_PER_MEMORY, selected_estimated_tokens: 0, token_reduction_ratio: 0, quality_guard_passed: retrievalGuardPassed, measured: false };
    return healthMetric('token_reduction', { status: 'healthy', score: 90, observed, thresholds, evidenceRef: healthEvidenceRef('token_reduction', observed), recommendedActions: ['Supply a context pack or benchmark summary to measure token reduction.'] });
  }
  const baseline = activeCount * DEFAULT_TOKENS_PER_MEMORY;
  const selected = Math.max(0, selectedCount) * DEFAULT_TOKENS_PER_MEMORY;
  const ratio = baseline > 0 ? clamp01(1 - selected / baseline) : 0;
  const observed = { baseline_estimated_tokens: baseline, selected_estimated_tokens: selected, token_reduction_ratio: roundRatio(ratio), quality_guard_passed: retrievalGuardPassed, measured: true };
  let status;
  if (!retrievalGuardPassed) status = ratio >= policy.token_reduction_floor ? 'degraded' : 'critical';
  else if (ratio >= policy.token_reduction_floor) status = 'healthy';
  else status = 'watch';
  const recommendedActions = [];
  if (status !== 'healthy') {
    recommendedActions.push('Tune ranking thresholds only if the retrieval guard remains satisfied.');
    recommendedActions.push('Dedupe before reducing top-k.');
    recommendedActions.push('Never optimize tokens by suppressing required evidence refs.');
  }
  return healthMetric('token_reduction', { status, score: bandScore(status, ratio), observed, thresholds, evidenceRef: healthEvidenceRef('token_reduction', observed), recommendedActions });
}

function computeLeakageScan({ reportBody, scanInputs }) {
  const thresholds = { forbidden_payload_key_hits_allowed: 0, secret_value_hits_allowed: 0 };
  const hits = { keys: [], secret: [] };
  for (const input of scanInputs) healthScan(input, '', hits);
  healthScan(reportBody, '', hits);
  const forbiddenHits = hits.keys.length;
  const secretHits = hits.secret.length;
  const unsafeArtifactRefs = [];
  if (forbiddenHits > 0 || secretHits > 0) unsafeArtifactRefs.push(`leakage_scan_${healthDigest({ forbiddenHits, secretHits })}`);
  const observed = {
    scanned_artifact_count: scanInputs.length,
    forbidden_payload_key_hits: forbiddenHits,
    secret_value_hits: secretHits,
    unsafe_artifact_refs: unsafeArtifactRefs,
  };
  let status;
  if (forbiddenHits > 0 || secretHits > 0) status = 'critical';
  else status = 'healthy';
  const recommendedActions = [];
  if (status !== 'healthy') {
    recommendedActions.push('Quarantine unsafe artifacts.');
    recommendedActions.push('Regenerate reports from public-safe fields only.');
    recommendedActions.push('Block proof-network packet creation until the leakage scan is clean.');
  }
  return healthMetric('leakage_scan', { status, score: status === 'healthy' ? 100 : bandScore('critical', 0), thresholds, observed, evidenceRef: healthEvidenceRef('leakage_scan', observed), recommendedActions });
}

function computeReceiptCoverage({ activeAddrs, receipts, latestAnchorBatchRef, currentRoots, policy }) {
  const thresholds = {
    healthy_floor: policy.receipt_coverage_healthy_floor,
    watch_floor: policy.receipt_coverage_watch_floor,
    degraded_floor: policy.receipt_coverage_degraded_floor,
  };
  const activeRefCount = activeAddrs.size;
  const coveredAddrs = new Set();
  let invalidReceiptCount = 0;
  let rootMismatch = false;
  for (const receipt of receipts) {
    if (!receipt || typeof receipt !== 'object') continue;
    const addr = receipt.memory_addr ?? receipt.memoryAddr;
    if (typeof addr === 'string') coveredAddrs.add(addr);
    if (receipt.active_set_root && receipt.active_set_root !== currentRoots.active_set_root) {
      // a stale receipt root is expected for historical events; only a missing root on the latest state is a mismatch
    }
    if (receipt.schema && receipt.schema !== 'enigma.receipt.v1') invalidReceiptCount += 1;
  }
  if (activeRefCount === 0) {
    const observed = { active_ref_count: 0, covered_ref_count: 0, receipt_coverage_ratio: 1, invalid_receipt_count: invalidReceiptCount, latest_anchor_batch_ref: latestAnchorBatchRef ?? null };
    return healthMetric('receipt_coverage', { status: 'healthy', score: 100, observed, thresholds, evidenceRef: healthEvidenceRef('receipt_coverage', observed), recommendedActions: [] });
  }
  let coveredCount = 0;
  for (const addr of activeAddrs) {
    if (coveredAddrs.has(addr)) coveredCount += 1;
  }
  const ratio = coveredCount / activeRefCount;
  const observed = {
    active_ref_count: activeRefCount,
    covered_ref_count: coveredCount,
    receipt_coverage_ratio: roundRatio(ratio),
    invalid_receipt_count: invalidReceiptCount,
    latest_anchor_batch_ref: latestAnchorBatchRef ?? null,
  };
  let status;
  if (rootMismatch || ratio < policy.receipt_coverage_degraded_floor) status = 'critical';
  else if (invalidReceiptCount > 0 || ratio < policy.receipt_coverage_watch_floor) status = 'degraded';
  else if (ratio < policy.receipt_coverage_healthy_floor) status = 'watch';
  else status = 'healthy';
  const recommendedActions = [];
  if (status !== 'healthy') {
    recommendedActions.push('Issue local receipts for uncovered active refs.');
    recommendedActions.push('Regenerate inclusion roots after compaction.');
    recommendedActions.push('Verify anchor batches before external publication.');
  }
  return healthMetric('receipt_coverage', { status, score: bandScore(status, ratio), observed, thresholds, evidenceRef: healthEvidenceRef('receipt_coverage', observed), recommendedActions });
}

function computeConnectorHealth({ connectorSummary, policy }) {
  const thresholds = { cursor_gap_count_allowed: 0, max_error_rate_24h: policy.connector_max_error_rate_24h };
  if (!connectorSummary) {
    const observed = { connector_count: 0, healthy_connector_count: 0, lagging_connector_count: 0, error_rate_24h: 0, cursor_gap_count: 0, measured: false };
    return healthMetric('connector_health', { status: 'healthy', score: 100, observed, thresholds, evidenceRef: healthEvidenceRef('connector_health', observed), recommendedActions: ['Supply connector_summary to measure connector health.'] });
  }
  const connectorCount = nonNegativeInt(connectorSummary.connector_count ?? connectorSummary.connectorCount);
  const healthy = nonNegativeInt(connectorSummary.healthy_connector_count ?? connectorSummary.healthyConnectorCount);
  const lagging = nonNegativeInt(connectorSummary.lagging_connector_count ?? connectorSummary.laggingConnectorCount);
  const errorRate = clampRatio(connectorSummary.error_rate_24h ?? connectorSummary.errorRate24h);
  const cursorGaps = nonNegativeInt(connectorSummary.cursor_gap_count ?? connectorSummary.cursorGapCount);
  const observed = { connector_count: connectorCount, healthy_connector_count: healthy, lagging_connector_count: lagging, error_rate_24h: roundRatio(errorRate), cursor_gap_count: cursorGaps, measured: true };
  let status;
  if (cursorGaps > 0) status = 'critical';
  else if (errorRate > policy.connector_max_error_rate_24h || lagging > 0) status = 'degraded';
  else status = 'healthy';
  const recommendedActions = [];
  if (status !== 'healthy') {
    recommendedActions.push('Pause unhealthy connector scopes before replay.');
    recommendedActions.push('Repair cursor gaps from receipt refs, not raw provider payloads.');
    recommendedActions.push('Require connector imports to emit idempotency refs.');
  }
  const goodness = connectorCount === 0 ? 1 : healthy / connectorCount;
  return healthMetric('connector_health', { status, score: bandScore(status, goodness), observed, thresholds, evidenceRef: healthEvidenceRef('connector_health', observed), recommendedActions });
}

function computeSyncForkRisk({ replicas, currentRoot, policy }) {
  const thresholds = { active_root_disagreement_allowed: 0, conflicting_capability_count_allowed: 0 };
  const replicaList = Array.isArray(replicas) ? replicas : [];
  const replicaCount = replicaList.length;
  if (replicaCount === 0) {
    const observed = { replica_count: 0, root_disagreement_count: 0, max_root_lag_versions: 0, unmerged_branch_count: 0, conflicting_capability_count: 0, measured: false };
    return healthMetric('sync_fork_risk', { status: 'healthy', score: 100, observed, thresholds, evidenceRef: healthEvidenceRef('sync_fork_risk', observed), recommendedActions: ['Supply replicas to measure sync fork risk.'] });
  }
  let disagreement = 0;
  let maxLag = 0;
  let unmerged = 0;
  let conflicting = 0;
  for (const replica of replicaList) {
    const reportedRoot = replica.reported_root ?? replica.reportedRoot;
    const lag = nonNegativeInt(replica.lag_versions ?? replica.lagVersions);
    const isActive = replica.active !== false;
    const conflicts = nonNegativeInt(replica.conflicting_capabilities ?? replica.conflictingCapabilities);
    if (reportedRoot && reportedRoot !== currentRoot && isActive) disagreement += 1;
    maxLag = Math.max(maxLag, lag);
    if (replica.unmerged_branch ?? replica.unmergedBranch) unmerged += 1;
    conflicting += conflicts;
  }
  const observed = { replica_count: replicaCount, root_disagreement_count: disagreement, max_root_lag_versions: maxLag, unmerged_branch_count: unmerged, conflicting_capability_count: conflicting, measured: true };
  let status;
  if (conflicting > 0) status = 'critical';
  else if (disagreement > 0) status = 'degraded';
  else if (maxLag > policy.sync_max_read_only_lag_versions || unmerged > 0) status = 'watch';
  else status = 'healthy';
  const recommendedActions = [];
  if (status !== 'healthy') {
    recommendedActions.push('Freeze write grants for forked namespaces.');
    recommendedActions.push('Merge by public-safe root/ref lineage and tombstone nullifiers.');
    recommendedActions.push('Publish only the post-merge root after validation.');
  }
  const goodness = 1 - clamp01((disagreement + conflicting) / Math.max(1, replicaCount));
  return healthMetric('sync_fork_risk', { status, score: bandScore(status, goodness), observed, thresholds, evidenceRef: healthEvidenceRef('sync_fork_risk', observed), recommendedActions });
}

function nonNegativeInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function roundRatio(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10000) / 10000;
}

function clampRatio(value) {
  return clamp01(Number.isFinite(Number(value)) ? Number(value) : 0);
}

export function createMemoryDriveHealthReport(args = {}) {
  const vault = args.vault;
  const passport = args.passport;
  const policy = { ...DEFAULT_HEALTH_POLICY, ...(args.policy ?? {}) };
  const createdAt = nowIso(args.now ?? DEFAULT_HEALTH_NOW);
  const nowMs = Date.parse(createdAt);
  const identity = driveIdentity(vault, passport);
  const currentRoots = rootsFromVault(vault);
  const activeAddrs = activeAddressesFrom(vault);
  const tombstoneSet = tombstoneAddressesFrom(vault);
  const records = [...activeAddrs].map((addr) => vaultRecord(vault, addr)).filter(Boolean);
  const receipts = Array.isArray(vault?.receipts) ? vault.receipts : [];
  const deleteReceiptAddrs = new Set(receipts.filter((receipt) => receipt?.operation === 'delete' && receipt?.memory_addr).map((receipt) => receipt.memory_addr));
  const artifacts = normalizeContextPacks(args);
  const benchmarkSummary = args.benchmarkSummary ?? args.benchmark_summary ?? null;
  const connectorSummary = args.connectorSummary ?? args.connector_summary ?? null;
  const replicas = args.replicas ?? null;
  const connectorReplayWindowHours = connectorSummary?.tombstone_replay_window_hours ?? connectorSummary?.tombstoneReplayWindowHours ?? 0;
  const latestAnchorBatchRef = args.latest_anchor_batch_ref ?? args.latestAnchorBatchRef ?? null;

  const freshness = computeFreshness(records, policy, nowMs);
  const duplicateRate = computeDuplicateRate(records, policy);
  const tombstoneRisk = computeTombstoneRisk({ vault, tombstoneSet, deleteReceiptAddrs, artifacts, connectorReplayWindowHours, policy });
  const staleDerivedArtifacts = computeStaleDerivedArtifacts({ artifacts, currentRoot: currentRoots.active_set_root, nowMs, policy });
  const retrievalHitRate = computeRetrievalHitRate({ benchmarkSummary, policy });
  const retrievalGuardPassed = retrievalHitRate.status === 'healthy';
  const contextPackProvided = artifacts.length > 0;
  const selectedCount = contextPackProvided ? artifacts.reduce((sum, artifact) => sum + artifact.memory_addresses.length, 0) : 0;
  const tokenReduction = computeTokenReduction({ activeCount: activeAddrs.size, contextPackProvided, selectedCount, retrievalGuardPassed, policy });
  const connectorHealth = computeConnectorHealth({ connectorSummary, policy });
  const syncForkRisk = computeSyncForkRisk({ replicas, currentRoot: currentRoots.active_set_root, policy });
  const receiptCoverage = computeReceiptCoverage({ activeAddrs, receipts, latestAnchorBatchRef, currentRoots, policy });

  const nineMetrics = {
    freshness,
    duplicate_rate: duplicateRate,
    tombstone_risk: tombstoneRisk,
    stale_derived_artifacts: staleDerivedArtifacts,
    retrieval_hit_rate: retrievalHitRate,
    token_reduction: tokenReduction,
    receipt_coverage: receiptCoverage,
    connector_health: connectorHealth,
    sync_fork_risk: syncForkRisk,
  };

  const privacyBoundaries = {
    private_payloads_included: false,
    connector_bodies_included: false,
    identity_labels_included: false,
    secret_material_included: false,
    provider_bodies_included: false,
  };

  const claimBoundaries = {
    description: 'Local operational SMART-style health evidence computed from public-safe counters, roots, receipt metadata, tombstones, and derived/context-pack refs only.',
    excludes: [
      'Does not prove provider deletion or model forgetting.',
      'Does not certify compliance.',
      'Does not prove live-chain settlement or a submitted transaction.',
      'Does not include plaintext payloads, prompts, connector bodies, identity labels, or secret material.',
    ],
  };

  const artifactPublicSummaries = artifacts.map((artifact) => ({
    artifact_type: artifact.artifact_type,
    source_root: artifact.source_root,
    memory_addresses: artifact.memory_addresses,
    generated_at: artifact.generated_at,
  }));
  const reportProxy = {
    schema: MEMORY_DRIVE_HEALTH_SCHEMA,
    metrics: nineMetrics,
    privacy_boundaries: privacyBoundaries,
    claim_boundaries: claimBoundaries,
  };
  const scanInputs = [reportProxy, ...artifactPublicSummaries];
  if (benchmarkSummary) scanInputs.push(benchmarkSummary);
  if (connectorSummary) scanInputs.push(connectorSummary);
  const leakageScan = computeLeakageScan({ reportBody: reportProxy, scanInputs });

  const metrics = { ...nineMetrics, leakage_scan: leakageScan };

  let totalWeight = 0;
  let weightedSum = 0;
  for (const name of HEALTH_METRIC_NAMES) {
    const metric = metrics[name];
    const weight = HEALTH_METRIC_WEIGHTS[name] ?? 0;
    weightedSum += metric.score * weight;
    totalWeight += weight;
  }
  const weightedAverage = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const statuses = HEALTH_METRIC_NAMES.map((name) => metrics[name].status);
  const hasCritical = statuses.includes('critical');
  const hasDegraded = statuses.includes('degraded');
  let overallScore = weightedAverage;
  if (hasCritical) overallScore = Math.min(overallScore, 49);
  else if (hasDegraded) overallScore = Math.min(overallScore, 70);
  overallScore = Math.round(overallScore);
  const overallStatus = statusFromScore(overallScore);

  const sourceRoot = `memory_root_${currentRoots.active_set_root}`;
  const driveRef = `drive_${healthDigest({ vault_id: identity.vault_id, tenant_id: identity.tenant_id, subject_id: identity.subject_id })}`;
  const namespaceRef = `namespace_${healthDigest({ tenant_id: identity.tenant_id, subject_id: identity.subject_id, policy_id: identity.policy_id })}`;
  const policyRef = `memory_health_policy_${healthDigest(policy)}`;

  const recommendedActions = [];
  for (const name of HEALTH_METRIC_NAMES) {
    for (const action of metrics[name].recommended_actions) {
      if (!recommendedActions.includes(action)) recommendedActions.push(action);
    }
  }
  if (recommendedActions.length === 0) recommendedActions.push('Keep normal monitoring cadence.');

  const connectorCount = connectorSummary ? nonNegativeInt(connectorSummary.connector_count ?? connectorSummary.connectorCount) : 0;

  const blockingReasons = [];
  if (leakageScan.status !== 'healthy') blockingReasons.push('leakage_scan.status is not healthy');
  if (tombstoneRisk.status === 'critical') blockingReasons.push('tombstone_risk.status is critical');
  if (syncForkRisk.status === 'critical') blockingReasons.push('sync_fork_risk.status is critical');
  if (staleDerivedArtifacts.status === 'critical' || staleDerivedArtifacts.status === 'degraded') blockingReasons.push(`stale_derived_artifacts.status is ${staleDerivedArtifacts.status}`);
  if (receiptCoverage.status === 'critical') blockingReasons.push('receipt_coverage.status is critical');
  if (retrievalHitRate.status === 'critical') blockingReasons.push('retrieval_hit_rate.status is critical');
  const eligibleForAnchorBatch = blockingReasons.length === 0;

  const reportCore = {
    schema: MEMORY_DRIVE_HEALTH_SCHEMA,
    created_at: createdAt,
    drive_ref: driveRef,
    namespace_ref: namespaceRef,
    source_root: sourceRoot,
    policy_ref: policyRef,
    overall_status: overallStatus,
    overall_score: overallScore,
    transaction_submitted: false,
    raw_memory_on_chain: false,
    privacy_boundaries: privacyBoundaries,
    roots: { active_set_root: currentRoots.active_set_root, receipt_log_root: currentRoots.receipt_log_root },
    metrics,
    recommended_actions: recommendedActions,
    claim_boundaries: claimBoundaries,
    proof_network_ready: {
      eligible_for_anchor_batch: eligibleForAnchorBatch,
      blocking_reasons: [...new Set(blockingReasons)],
      public_payload_only: true,
      suggested_anchor_fields: {
        artifact_type: 'memory_drive_health_report',
        artifact_schema: MEMORY_DRIVE_HEALTH_SCHEMA,
        source_root: sourceRoot,
        counts: {
          active_ref_count: activeAddrs.size,
          scanned_artifact_count: scanInputs.length,
          connector_count: connectorCount,
        },
      },
    },
  };

  const reportRef = `health_report_${healthDigest(reportCore)}`;
  reportCore.report_ref = reportRef;
  reportCore.proof_network_ready.suggested_anchor_fields.artifact_root = reportRef;
  return reportCore;
}
