import { createHash } from 'node:crypto';

const SHA256_PREFIX = 'sha256:';
const HASH_RE = /^(?:sha256:)?[a-f0-9]{64}$/i;
const PLAN_SCHEMA_ID = 'enigma.memory_optimization_plan.v1';
const RECEIPT_SCHEMA_ID = 'enigma.memory_access_receipt.v1';
const DEFAULT_POINTER_TOKENS = 24;
const DEFAULT_PROOF_TOKENS = 8;
const DEFAULT_WARM_RATIO = 0.35;
const TIER_ORDER = Object.freeze(['hot', 'warm', 'cold', 'proof_only']);
const TIER_RANK = Object.freeze({ hot: 0, warm: 1, cold: 2, proof_only: 3 });
const DISALLOWED_PUBLIC_KEYS = new Set([
  'body',
  'candidate',
  'candidates',
  'content',
  'contents',
  'document',
  'documents',
  'message',
  'messages',
  'metadata',
  'plain_text',
  'plaintext',
  'prompt',
  'prompts',
  'raw',
  'raw_content',
  'raw_memory',
  'response',
  'responses',
  'text',
  'transcript',
  'value'
]);
const SAFE_PUBLIC_KEYS = new Set([
  'content_hash',
  'metadata_commitment',
  'commitment',
  'commitments',
  'commitment_scheme',
  'estimated_cost',
  'estimated_tokens',
  'baseline_prompt_tokens',
  'optimized_prompt_tokens',
  'total_estimated_tokens'
]);

export const MEMORY_OPTIMIZATION_PRODUCT_THESIS = 'Centralized high-performance memory optimization service; blockchain and permissionless rails are access, settlement, and proof anchoring boundaries only, not decentralized inference or decentralized memory storage.';

export const MEMORY_OPTIMIZATION_PLAN_SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: PLAN_SCHEMA_ID,
  type: 'object',
  additionalProperties: false,
  required: [
    'schema',
    'product_thesis',
    'plan_id',
    'commitment_scheme',
    'baseline_prompt_tokens',
    'optimized_prompt_tokens',
    'savings_pct',
    'tiers',
    'items',
    'totals'
  ],
  properties: {
    schema: { const: PLAN_SCHEMA_ID },
    product_thesis: { const: MEMORY_OPTIMIZATION_PRODUCT_THESIS },
    plan_id: { type: 'string', pattern: '^mopt_[a-f0-9]{32}$' },
    commitment_scheme: { const: 'sha256-canonical-json-v1' },
    pricing: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['currency', 'price_per_million_tokens'],
          properties: {
            currency: { type: 'string', minLength: 1 },
            price_per_million_tokens: { type: 'number', minimum: 0 }
          }
        }
      ]
    },
    baseline_prompt_tokens: { type: 'integer', minimum: 0 },
    optimized_prompt_tokens: { type: 'integer', minimum: 0 },
    baseline_cost: { anyOf: [{ type: 'null' }, { type: 'number', minimum: 0 }] },
    optimized_cost: { anyOf: [{ type: 'null' }, { type: 'number', minimum: 0 }] },
    savings_pct: { type: 'number', minimum: 0, maximum: 100 },
    tiers: {
      type: 'object',
      additionalProperties: false,
      required: ['hot', 'warm', 'cold', 'proof_only'],
      properties: {
        hot: { type: 'array', items: { $ref: '#/$defs/item' } },
        warm: { type: 'array', items: { $ref: '#/$defs/item' } },
        cold: { type: 'array', items: { $ref: '#/$defs/item' } },
        proof_only: { type: 'array', items: { $ref: '#/$defs/item' } }
      }
    },
    items: { type: 'array', items: { $ref: '#/$defs/item' } },
    totals: {
      type: 'object',
      additionalProperties: false,
      required: ['input_candidates', 'deduped_candidates', 'duplicates_removed', 'total_estimated_tokens'],
      properties: {
        input_candidates: { type: 'integer', minimum: 0 },
        deduped_candidates: { type: 'integer', minimum: 0 },
        duplicates_removed: { type: 'integer', minimum: 0 },
        total_estimated_tokens: { type: 'integer', minimum: 0 }
      }
    }
  },
  $defs: {
    item: {
      type: 'object',
      additionalProperties: false,
      required: ['address', 'content_hash', 'commitment', 'tier', 'estimated_tokens', 'optimized_prompt_tokens'],
      properties: {
        address: { type: 'string', minLength: 1 },
        content_hash: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
        commitment: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
        metadata_commitment: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
        tier: { enum: TIER_ORDER },
        estimated_tokens: { type: 'integer', minimum: 0 },
        optimized_prompt_tokens: { type: 'integer', minimum: 0 }
      }
    }
  }
});

export const MEMORY_ACCESS_RECEIPT_SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: RECEIPT_SCHEMA_ID,
  type: 'object',
  additionalProperties: false,
  required: [
    'schema',
    'product_thesis',
    'receipt_id',
    'operation',
    'commitment_scheme',
    'address',
    'content_hash',
    'commitment',
    'access_boundary'
  ],
  properties: {
    schema: { const: RECEIPT_SCHEMA_ID },
    product_thesis: { const: MEMORY_OPTIMIZATION_PRODUCT_THESIS },
    receipt_id: { type: 'string', pattern: '^mar_[a-f0-9]{32}$' },
    operation: { const: 'memory.access.receipt_anchor' },
    commitment_scheme: { const: 'sha256-canonical-json-v1' },
    address: { type: 'string', minLength: 1 },
    content_hash: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
    commitment: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
    plan_hash: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
    timestamp: { anyOf: [{ type: 'null' }, { type: 'string' }] },
    sequence: { type: 'integer', minimum: 0 },
    estimated_prompt_tokens: { type: 'integer', minimum: 0 },
    estimated_cost: { anyOf: [{ type: 'null' }, { type: 'number', minimum: 0 }] },
    pricing: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['currency', 'price_per_million_tokens'],
          properties: {
            currency: { type: 'string', minLength: 1 },
            price_per_million_tokens: { type: 'number', minimum: 0 }
          }
        }
      ]
    },
    access_boundary: {
      type: 'object',
      additionalProperties: false,
      required: ['permissionless_access', 'settlement', 'proof_anchor', 'decentralized_storage_claim'],
      properties: {
        permissionless_access: { const: true },
        settlement: { const: 'external_or_offline_receipt_settlement' },
        proof_anchor: { const: 'content_hash_and_commitment_only' },
        decentralized_storage_claim: { const: false }
      }
    }
  }
});

export function estimateTextTokens(text) {
  if (text === null || text === undefined) return 0;
  const source = String(text);
  let tokens = 0;
  let inAsciiWord = false;
  let asciiWordLength = 0;

  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    const isAsciiWord = (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95;
    if (isAsciiWord) {
      inAsciiWord = true;
      asciiWordLength += 1;
      continue;
    }
    if (inAsciiWord) {
      tokens += Math.max(1, Math.ceil(asciiWordLength / 4));
      inAsciiWord = false;
      asciiWordLength = 0;
    }
    if (code > 32) tokens += 1;
  }

  if (inAsciiWord) tokens += Math.max(1, Math.ceil(asciiWordLength / 4));
  return tokens;
}

export function estimateTokenCost(tokensOrArgs, maybePricePerMillionTokens) {
  const args = isPlainObject(tokensOrArgs)
    ? tokensOrArgs
    : { tokens: tokensOrArgs, price_per_million_tokens: maybePricePerMillionTokens };
  const tokens = nonNegativeInteger(args.tokens ?? args.prompt_tokens ?? args.input_tokens, 'tokens');
  const price = nonNegativeNumber(
    args.price_per_million_tokens ?? args.pricePerMillionTokens ?? args.input_price_per_million_tokens ?? args.inputPricePerMillionTokens,
    'price_per_million_tokens'
  );
  const currency = stringOrDefault(args.currency, 'USD');
  return Object.freeze({
    tokens,
    currency,
    price_per_million_tokens: price,
    estimated_cost: (tokens / 1_000_000) * price
  });
}

export function createMemoryOptimizationPlan(input = {}) {
  const args = Array.isArray(input) ? { candidates: input } : input;
  if (!isPlainObject(args)) throw new TypeError('createMemoryOptimizationPlan requires an options object or candidate array');
  const candidates = requiredArray(args.candidates, 'candidates');
  const options = normalizePlanOptions(args);
  const inputCandidates = candidates.length;
  const deduped = dedupeCandidates(candidates, options);
  const items = deduped.map((candidate) => planItemFromCandidate(candidate, options));
  items.sort(comparePlanItems);

  const tiers = { hot: [], warm: [], cold: [], proof_only: [] };
  const basePromptTokens = args.prompt_tokens ?? args.promptTokens ?? args.base_prompt_tokens ?? args.basePromptTokens;
  const sharedPromptTokens = basePromptTokens === undefined
    ? estimateTextTokens(args.prompt ?? args.base_prompt ?? args.basePrompt ?? '')
    : nonNegativeInteger(basePromptTokens, 'prompt_tokens');
  let baselinePromptTokens = sharedPromptTokens;
  let optimizedPromptTokens = sharedPromptTokens;
  for (const item of items) {
    baselinePromptTokens += item.estimated_tokens;
    optimizedPromptTokens += item.optimized_prompt_tokens;
    tiers[item.tier].push(item);
  }

  const pricing = normalizePricing(args.pricing ?? args.price ?? args.price_per_million_tokens ?? args.pricePerMillionTokens, false);
  const baselineCost = pricing === null ? null : estimateTokenCost({ tokens: baselinePromptTokens, ...pricing }).estimated_cost;
  const optimizedCost = pricing === null ? null : estimateTokenCost({ tokens: optimizedPromptTokens, ...pricing }).estimated_cost;
  const planBody = {
    schema: PLAN_SCHEMA_ID,
    product_thesis: MEMORY_OPTIMIZATION_PRODUCT_THESIS,
    commitment_scheme: 'sha256-canonical-json-v1',
    pricing,
    baseline_prompt_tokens: baselinePromptTokens,
    optimized_prompt_tokens: optimizedPromptTokens,
    baseline_cost: baselineCost,
    optimized_cost: optimizedCost,
    savings_pct: percentReduction(baselinePromptTokens, optimizedPromptTokens),
    tiers,
    items,
    totals: {
      input_candidates: inputCandidates,
      deduped_candidates: items.length,
      duplicates_removed: inputCandidates - items.length,
      total_estimated_tokens: baselinePromptTokens
    }
  };
  const derivedPlanId = `mopt_${sha256Hex(canonicalize(planBody)).slice(0, 32)}`;
  const plan = {
    ...planBody,
    plan_id: normalizePrefixedId(args.plan_id ?? args.planId ?? derivedPlanId, 'mopt', 'plan_id')
  };
  const ordered = orderPlan(plan);
  assertNoRawMemoryOutput(ordered);
  return ordered;
}

export function createMemoryAccessReceipt(input = {}) {
  if (!isPlainObject(input)) throw new TypeError('createMemoryAccessReceipt requires an options object');
  const source = normalizeReceiptSource(input);
  const pricing = normalizePricing(input.pricing ?? input.price ?? input.price_per_million_tokens ?? input.pricePerMillionTokens, false);
  const estimatedTokens = nonNegativeInteger(
    input.estimated_prompt_tokens ?? input.estimatedTokens ?? input.optimized_prompt_tokens ?? source.optimized_prompt_tokens ?? source.estimated_tokens ?? 0,
    'estimated_prompt_tokens'
  );
  const body = {
    schema: RECEIPT_SCHEMA_ID,
    product_thesis: MEMORY_OPTIMIZATION_PRODUCT_THESIS,
    operation: 'memory.access.receipt_anchor',
    commitment_scheme: 'sha256-canonical-json-v1',
    address: source.address,
    content_hash: source.content_hash,
    commitment: source.commitment ?? commitmentFor({ address: source.address, content_hash: source.content_hash }),
    plan_hash: input.plan_hash ?? input.planHash ?? planHashOrUndefined(input.plan),
    timestamp: input.timestamp ?? input.accessed_at ?? input.accessedAt ?? input.now ?? null,
    sequence: nonNegativeInteger(input.sequence ?? 0, 'sequence'),
    estimated_prompt_tokens: estimatedTokens,
    pricing,
    estimated_cost: pricing === null ? null : estimateTokenCost({ tokens: estimatedTokens, ...pricing }).estimated_cost,
    access_boundary: Object.freeze({
      permissionless_access: true,
      settlement: 'external_or_offline_receipt_settlement',
      proof_anchor: 'content_hash_and_commitment_only',
      decentralized_storage_claim: false
    })
  };
  if (body.plan_hash === undefined) delete body.plan_hash;
  const derivedReceiptId = `mar_${sha256Hex(canonicalize(body)).slice(0, 32)}`;
  const receipt = {
    ...body,
    receipt_id: normalizePrefixedId(input.receipt_id ?? input.receiptId ?? derivedReceiptId, 'mar', 'receipt_id')
  };
  const ordered = orderReceipt(receipt);
  assertNoRawMemoryOutput(ordered);
  return ordered;
}

export function assertNoRawMemoryOutput(value) {
  scanPublicOutput(value, '$', new WeakSet());
  return value;
}

function dedupeCandidates(candidates, options) {
  const byHash = new Map();
  for (let index = 0; index < candidates.length; index += 1) {
    const normalized = normalizeCandidate(candidates[index], index, options);
    const current = byHash.get(normalized.content_hash);
    if (current === undefined || compareCandidatePreference(normalized, current) < 0) {
      byHash.set(normalized.content_hash, normalized);
    }
  }
  return [...byHash.values()];
}

function normalizeCandidate(candidate, index, options) {
  if (!isPlainObject(candidate)) throw new TypeError(`candidate ${index} must be an object`);
  const contentHash = normalizeContentHash(candidate.content_hash ?? candidate.contentHash, candidate.content);
  const address = candidate.address === undefined || candidate.address === null || candidate.address === ''
    ? `mem_${contentHash.slice(SHA256_PREFIX.length, SHA256_PREFIX.length + 16)}`
    : String(candidate.address);
  const metadataCommitment = candidate.metadata === undefined
    ? undefined
    : prefixedSha256(canonicalize(redactForCommitment(candidate.metadata)));
  const estimatedTokens = estimateCandidateTokens(candidate);
  const importance = clamp01(numberOrDefault(candidate.importance, options.defaultImportance));
  const lastAccessedAt = candidate.last_accessed_at ?? candidate.lastAccessedAt ?? null;
  return Object.freeze({
    address,
    content_hash: contentHash,
    metadata_commitment: metadataCommitment,
    estimated_tokens: estimatedTokens,
    importance,
    last_accessed_at: lastAccessedAt === undefined ? null : lastAccessedAt,
    recency_score: recencyScore(lastAccessedAt, options.referenceTimeMs)
  });
}

function planItemFromCandidate(candidate, options) {
  const score = combinedScore(candidate.importance, candidate.recency_score);
  const tier = tierForScore(score, options);
  const body = {
    address: candidate.address,
    content_hash: candidate.content_hash,
    metadata_commitment: candidate.metadata_commitment,
    tier,
    estimated_tokens: candidate.estimated_tokens,
    optimized_prompt_tokens: optimizedTokensForTier(candidate.estimated_tokens, tier, options)
  };
  if (body.metadata_commitment === undefined) delete body.metadata_commitment;
  return Object.freeze({
    ...body,
    commitment: commitmentFor(body)
  });
}

function normalizeReceiptSource(input) {
  const source = input.item ?? input.accessed ?? input.access ?? input.memory ?? input.candidate ?? input;
  if (!isPlainObject(source)) throw new TypeError('receipt source must be an object');
  const contentHash = normalizeContentHash(source.content_hash ?? source.contentHash, source.content);
  const address = requiredString(source.address ?? input.address, 'address');
  const commitment = source.commitment ?? input.commitment;
  return {
    ...source,
    address,
    content_hash: contentHash,
    commitment: commitment === undefined ? undefined : normalizeSha256Root(commitment, 'commitment')
  };
}

function normalizePlanOptions(args) {
  return Object.freeze({
    defaultImportance: clamp01(numberOrDefault(args.default_importance ?? args.defaultImportance, 0.5)),
    referenceTimeMs: referenceTimeMs(args.reference_time ?? args.referenceTime ?? args.now),
    hotThreshold: clamp01(numberOrDefault(args.hot_threshold ?? args.hotThreshold, 0.72)),
    warmThreshold: clamp01(numberOrDefault(args.warm_threshold ?? args.warmThreshold, 0.45)),
    coldThreshold: clamp01(numberOrDefault(args.cold_threshold ?? args.coldThreshold, 0.2)),
    warmTokenRatio: nonNegativeNumber(args.warm_token_ratio ?? args.warmTokenRatio ?? DEFAULT_WARM_RATIO, 'warm_token_ratio'),
    coldPointerTokens: nonNegativeInteger(args.cold_pointer_tokens ?? args.coldPointerTokens ?? DEFAULT_POINTER_TOKENS, 'cold_pointer_tokens'),
    proofOnlyTokens: nonNegativeInteger(args.proof_only_tokens ?? args.proofOnlyTokens ?? DEFAULT_PROOF_TOKENS, 'proof_only_tokens')
  });
}

function normalizePricing(value, required) {
  if (value === undefined || value === null) {
    if (required) throw new TypeError('pricing requires price_per_million_tokens');
    return null;
  }
  if (typeof value === 'number') {
    return Object.freeze({ currency: 'USD', price_per_million_tokens: nonNegativeNumber(value, 'price_per_million_tokens') });
  }
  if (!isPlainObject(value)) throw new TypeError('pricing must be an object or number');
  return Object.freeze({
    currency: stringOrDefault(value.currency, 'USD'),
    price_per_million_tokens: nonNegativeNumber(
      value.price_per_million_tokens ?? value.pricePerMillionTokens ?? value.input_price_per_million_tokens ?? value.inputPricePerMillionTokens,
      'price_per_million_tokens'
    )
  });
}

function estimateCandidateTokens(candidate) {
  const explicit = candidate.estimated_tokens ?? candidate.estimatedTokens ?? candidate.token_count ?? candidate.tokenCount ?? candidate.metadata?.estimated_tokens ?? candidate.metadata?.token_count;
  if (explicit !== undefined) return nonNegativeInteger(explicit, 'estimated_tokens');
  if (candidate.content !== undefined && candidate.content !== null) return estimateTextTokens(candidate.content);
  return 0;
}

function normalizeContentHash(value, content) {
  if (value !== undefined && value !== null && value !== '') return normalizeSha256Root(value, 'content_hash');
  if (content !== undefined && content !== null) return prefixedSha256(String(content));
  throw new TypeError('candidate requires content_hash or local content for hashing');
}

function normalizeSha256Root(value, name) {
  const text = String(value);
  if (!HASH_RE.test(text)) throw new TypeError(`${name} must be a sha256 hash`);
  return text.startsWith(SHA256_PREFIX) ? `${SHA256_PREFIX}${text.slice(SHA256_PREFIX.length).toLowerCase()}` : `${SHA256_PREFIX}${text.toLowerCase()}`;
}

function normalizePrefixedId(value, prefix, name) {
  const text = requiredString(value, name);
  const pattern = new RegExp(`^${prefix}_[a-f0-9]{32}$`);
  if (!pattern.test(text)) throw new TypeError(`${name} must match ${prefix}_[a-f0-9]{32}`);
  return text;
}

function optimizedTokensForTier(tokens, tier, options) {
  if (tier === 'hot') return tokens;
  if (tier === 'warm') return Math.min(tokens, Math.ceil(tokens * options.warmTokenRatio));
  if (tier === 'cold') return Math.min(tokens, options.coldPointerTokens);
  return Math.min(tokens, options.proofOnlyTokens);
}

function tierForScore(score, options) {
  if (score >= options.hotThreshold) return 'hot';
  if (score >= options.warmThreshold) return 'warm';
  if (score >= options.coldThreshold) return 'cold';
  return 'proof_only';
}

function combinedScore(importance, recency) {
  return clamp01((importance * 0.7) + (recency * 0.3));
}

function recencyScore(value, referenceTime) {
  if (value === null || value === undefined || value === '') return 0;
  const accessed = Date.parse(String(value));
  if (!Number.isFinite(accessed)) return 0;
  const ageMs = Math.max(0, referenceTime - accessed);
  const ageDays = ageMs / 86_400_000;
  if (ageDays <= 1) return 1;
  if (ageDays >= 90) return 0;
  return round6(1 - (ageDays / 90));
}

function referenceTimeMs(value) {
  if (value === undefined || value === null || value === '') return Date.UTC(2026, 0, 1, 0, 0, 0, 0);
  const parsed = Date.parse(String(value));
  if (!Number.isFinite(parsed)) throw new TypeError('reference_time must be an ISO timestamp');
  return parsed;
}

function compareCandidatePreference(left, right) {
  const leftScore = combinedScore(left.importance, left.recency_score);
  const rightScore = combinedScore(right.importance, right.recency_score);
  if (leftScore !== rightScore) return rightScore - leftScore;
  if (left.estimated_tokens !== right.estimated_tokens) return right.estimated_tokens - left.estimated_tokens;
  return compareStrings(left.address, right.address);
}

function comparePlanItems(left, right) {
  const tierDiff = TIER_RANK[left.tier] - TIER_RANK[right.tier];
  if (tierDiff !== 0) return tierDiff;
  if (left.optimized_prompt_tokens !== right.optimized_prompt_tokens) return right.optimized_prompt_tokens - left.optimized_prompt_tokens;
  if (left.estimated_tokens !== right.estimated_tokens) return right.estimated_tokens - left.estimated_tokens;
  return compareStrings(left.content_hash, right.content_hash);
}

function planHashOrUndefined(plan) {
  if (plan === undefined || plan === null) return undefined;
  if (typeof plan === 'string') return normalizeSha256Root(plan, 'plan_hash');
  return prefixedSha256(canonicalize(plan));
}

function commitmentFor(value) {
  return prefixedSha256(canonicalize(value));
}

function prefixedSha256(value) {
  return `${SHA256_PREFIX}${sha256Hex(value)}`;
}

function sha256Hex(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function canonicalize(value) {
  return canonicalizeValue(value, new WeakSet());
}

function canonicalizeValue(value, seen) {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('canonical JSON cannot encode non-finite numbers');
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value !== 'object') throw new TypeError(`canonical JSON cannot encode ${typeof value}`);
  if (seen.has(value)) throw new TypeError('canonical JSON cannot encode circular structures');
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const out = new Array(value.length);
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) throw new TypeError('canonical JSON cannot encode sparse arrays');
        out[index] = canonicalizeValue(value[index], seen);
      }
      return `[${out.join(',')}]`;
    }
    if (!isPlainObject(value)) throw new TypeError('canonical JSON only accepts plain objects, arrays, and primitives');
    const keys = Object.keys(value).sort();
    const out = new Array(keys.length);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (value[key] === undefined) throw new TypeError('canonical JSON cannot encode undefined');
      out[index] = `${JSON.stringify(key)}:${canonicalizeValue(value[key], seen)}`;
    }
    return `{${out.join(',')}}`;
  } finally {
    seen.delete(value);
  }
}

function redactForCommitment(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => redactForCommitment(item));
  if (!isPlainObject(value)) return String(value);
  const out = {};
  for (const key of Object.keys(value).sort()) {
    const normalized = normalizePublicKey(key);
    if (DISALLOWED_PUBLIC_KEYS.has(normalized) && !SAFE_PUBLIC_KEYS.has(normalized)) {
      out[key] = prefixedSha256(canonicalize(value[key]));
    } else {
      out[key] = redactForCommitment(value[key]);
    }
  }
  return out;
}

function scanPublicOutput(value, path, seen) {
  if (value === null || value === undefined) return;
  if (typeof value !== 'object') return;
  if (seen.has(value)) throw new TypeError('public output cannot be circular');
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) scanPublicOutput(value[index], `${path}[${index}]`, seen);
      return;
    }
    if (!isPlainObject(value)) throw new TypeError(`public output contains unsupported object at ${path}`);
    for (const [key, child] of Object.entries(value)) {
      const normalized = normalizePublicKey(key);
      if (DISALLOWED_PUBLIC_KEYS.has(normalized) && !SAFE_PUBLIC_KEYS.has(normalized)) {
        throw new TypeError(`public output contains raw memory field at ${path}.${key}`);
      }
      scanPublicOutput(child, `${path}.${key}`, seen);
    }
  } finally {
    seen.delete(value);
  }
}

function normalizePublicKey(key) {
  return String(key).replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
}

function orderPlan(plan) {
  return Object.freeze({
    schema: plan.schema,
    product_thesis: plan.product_thesis,
    plan_id: plan.plan_id,
    commitment_scheme: plan.commitment_scheme,
    pricing: plan.pricing,
    baseline_prompt_tokens: plan.baseline_prompt_tokens,
    optimized_prompt_tokens: plan.optimized_prompt_tokens,
    baseline_cost: plan.baseline_cost,
    optimized_cost: plan.optimized_cost,
    savings_pct: plan.savings_pct,
    tiers: plan.tiers,
    items: plan.items,
    totals: plan.totals
  });
}

function orderReceipt(receipt) {
  const out = {
    schema: receipt.schema,
    product_thesis: receipt.product_thesis,
    receipt_id: receipt.receipt_id,
    operation: receipt.operation,
    commitment_scheme: receipt.commitment_scheme,
    address: receipt.address,
    content_hash: receipt.content_hash,
    commitment: receipt.commitment
  };
  if (receipt.plan_hash !== undefined) out.plan_hash = receipt.plan_hash;
  out.timestamp = receipt.timestamp;
  out.sequence = receipt.sequence;
  out.estimated_prompt_tokens = receipt.estimated_prompt_tokens;
  out.pricing = receipt.pricing;
  out.estimated_cost = receipt.estimated_cost;
  out.access_boundary = receipt.access_boundary;
  return Object.freeze(out);
}

function percentReduction(baseline, optimized) {
  if (baseline === 0) return 0;
  return round6(Math.max(0, Math.min(100, ((baseline - optimized) / baseline) * 100)));
}


function round6(value) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function numberOrDefault(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError('value must be a finite number');
  return number;
}

function nonNegativeInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new TypeError(`${name} must be a non-negative integer`);
  return number;
}

function nonNegativeNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new TypeError(`${name} must be a non-negative number`);
  return number;
}

function requiredArray(value, name) {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  return value;
}

function requiredString(value, name) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${name} must be a non-empty string`);
  return value;
}

function stringOrDefault(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
