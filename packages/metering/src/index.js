import { createHash } from 'node:crypto';

export const USAGE_EVENT_SCHEMA = 'enigma.usage_event.v1';
export const USAGE_AGGREGATE_SCHEMA = 'enigma.usage_aggregate.v1';
export const USAGE_METERING_PRODUCT_THESIS = 'Centralized high-performance memory service with permissionless access and settlement receipts; usage metering is deterministic, content-minimized, and does not claim token ROI or provider invoice savings.';

const SHA256_PREFIX = 'sha256:';
const SAFE_METRIC_KEYS = new Set([
  'prompt_tokens',
  'completion_tokens',
  'input_tokens',
  'output_tokens',
  'baseline_prompt_tokens',
  'optimized_prompt_tokens',
  'memory_baseline_tokens',
  'memory_optimized_tokens',
  'memory_savings_tokens',
  'billable_prompt_tokens',
  'billable_completion_tokens',
  'total_prompt_tokens',
  'total_completion_tokens',
  'total_memory_baseline_tokens',
  'total_memory_optimized_tokens',
  'total_memory_savings_tokens',
]);
const FORBIDDEN_KEY_RE = /(?:^|_)(?:raw|plaintext|plain_text|prompt|prompts|message|messages|text|content|document|documents|transcript|response|responses|provider_response|response_body|credential|credentials|api_key|secret|password|private_key)(?:$|_)/iu;
const SECRET_VALUE_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@|raw memory|private prompt|full transcript|decrypted capsule|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16})/iu;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name} must be a non-empty string`);
  return value.trim();
}

function stringOrDefault(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return requiredString(String(value), 'string');
}

function nonNegativeInteger(value, name) {
  const number = Number(value ?? 0);
  if (!Number.isSafeInteger(number) || number < 0) throw new TypeError(`${name} must be a non-negative integer`);
  return number;
}

function nonNegativeNumber(value, name) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) throw new TypeError(`${name} must be a non-negative number`);
  return number;
}

function isoTimestamp(value) {
  const timestamp = stringOrDefault(value, new Date(0).toISOString());
  if (Number.isNaN(Date.parse(timestamp))) throw new TypeError('timestamp must be ISO-parseable');
  return timestamp;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
    return out;
  }
  return value;
}

function hashValue(value) {
  return `${SHA256_PREFIX}${createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex')}`;
}

function eventIdFrom(body) {
  return `uevt_${hashValue(body).slice(SHA256_PREFIX.length, SHA256_PREFIX.length + 32)}`;
}

function aggregateIdFrom(body) {
  return `uagg_${hashValue(body).slice(SHA256_PREFIX.length, SHA256_PREFIX.length + 32)}`;
}

function assertNoSensitivePayload(value, path = 'metering') {
  if (typeof value === 'string') {
    if (!/\.claim_boundary\[\d+\]$/.test(path) && SECRET_VALUE_RE.test(value)) throw new TypeError(`${path} contains secret-looking data`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSensitivePayload(item, `${path}[${index}]`));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEY_RE.test(key) && !SAFE_METRIC_KEYS.has(key)) throw new TypeError(`${path}.${key} is not allowed in metering artifacts`);
    assertNoSensitivePayload(child, `${path}.${key}`);
  }
}

function normalizePricing(input = {}) {
  const pricing = isPlainObject(input.pricing) ? input.pricing : input;
  const inputPrice = nonNegativeNumber(
    pricing.input_price_per_million_tokens ?? pricing.inputPricePerMillionTokens ?? pricing.price_per_million_tokens ?? pricing.pricePerMillionTokens,
    'input_price_per_million_tokens'
  );
  const outputPrice = nonNegativeNumber(
    pricing.output_price_per_million_tokens ?? pricing.outputPricePerMillionTokens ?? pricing.price_per_million_tokens ?? pricing.pricePerMillionTokens,
    'output_price_per_million_tokens'
  );
  return Object.freeze({
    currency: stringOrDefault(pricing.currency, 'USD'),
    input_price_per_million_tokens: inputPrice,
    output_price_per_million_tokens: outputPrice,
  });
}

function costFor({ promptTokens, completionTokens, pricing }) {
  return ((promptTokens / 1_000_000) * pricing.input_price_per_million_tokens)
    + ((completionTokens / 1_000_000) * pricing.output_price_per_million_tokens);
}

export function createUsageEvent(input = {}) {
  if (!isPlainObject(input)) throw new TypeError('createUsageEvent requires an options object');
  assertNoSensitivePayload(input, 'input');
  const tenantId = requiredString(input.tenant_id ?? input.tenantId, 'tenant_id');
  const meterId = requiredString(input.meter_id ?? input.meterId ?? 'default', 'meter_id');
  const provider = requiredString(input.provider, 'provider');
  const model = requiredString(input.model, 'model');
  const operation = requiredString(input.operation ?? 'memory.inference', 'operation');
  const timestamp = isoTimestamp(input.timestamp ?? input.created_at ?? input.createdAt);
  const promptTokens = nonNegativeInteger(input.prompt_tokens ?? input.promptTokens ?? input.input_tokens ?? input.inputTokens, 'prompt_tokens');
  const completionTokens = nonNegativeInteger(input.completion_tokens ?? input.completionTokens ?? input.output_tokens ?? input.outputTokens, 'completion_tokens');
  const memoryBaselineTokens = nonNegativeInteger(input.memory_baseline_tokens ?? input.memoryBaselineTokens ?? input.baseline_prompt_tokens ?? input.baselinePromptTokens ?? promptTokens, 'memory_baseline_tokens');
  const memoryOptimizedTokens = nonNegativeInteger(input.memory_optimized_tokens ?? input.memoryOptimizedTokens ?? input.optimized_prompt_tokens ?? input.optimizedPromptTokens ?? promptTokens, 'memory_optimized_tokens');
  if (memoryOptimizedTokens > memoryBaselineTokens) throw new RangeError('memory_optimized_tokens must be <= memory_baseline_tokens');
  const pricing = normalizePricing(input.pricing ?? input);
  const memorySavingsTokens = memoryBaselineTokens - memoryOptimizedTokens;
  const costBeforeMemory = costFor({ promptTokens: memoryBaselineTokens, completionTokens, pricing });
  const costAfterMemory = costFor({ promptTokens: memoryOptimizedTokens, completionTokens, pricing });
  const eventBody = {
    schema: USAGE_EVENT_SCHEMA,
    product_thesis: USAGE_METERING_PRODUCT_THESIS,
    tenant_id: tenantId,
    meter_id: meterId,
    provider,
    model,
    operation,
    timestamp,
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      memory_baseline_tokens: memoryBaselineTokens,
      memory_optimized_tokens: memoryOptimizedTokens,
      memory_savings_tokens: memorySavingsTokens,
      billable_prompt_tokens: memoryOptimizedTokens,
      billable_completion_tokens: completionTokens,
    },
    pricing,
    estimated_cost: {
      currency: pricing.currency,
      cost_before_memory: costBeforeMemory,
      cost_after_memory: costAfterMemory,
      estimated_memory_credit: costBeforeMemory - costAfterMemory,
    },
    settlement_boundary: {
      permissionless_access: true,
      settlement: 'external_or_offline_receipt_settlement',
      proof_anchor: 'usage_hash_and_memory_commitments_only',
      decentralized_inference_claim: false,
      token_roi_claim: false,
      provider_invoice_savings_claim: false,
    },
  };
  const event = Object.freeze({ ...eventBody, event_id: eventIdFrom(eventBody), event_hash: hashValue(eventBody) });
  assertNoSensitivePayload(event, 'event');
  return event;
}

function requireUsageEvent(event, index) {
  if (!isPlainObject(event) || event.schema !== USAGE_EVENT_SCHEMA) throw new TypeError(`events[${index}] must be an enigma usage event`);
  assertNoSensitivePayload(event, `events[${index}]`);
  return event;
}

function addTotals(target, usage, cost) {
  target.prompt_tokens += usage.prompt_tokens;
  target.completion_tokens += usage.completion_tokens;
  target.memory_baseline_tokens += usage.memory_baseline_tokens;
  target.memory_optimized_tokens += usage.memory_optimized_tokens;
  target.memory_savings_tokens += usage.memory_savings_tokens;
  target.cost_before_memory += cost.cost_before_memory;
  target.cost_after_memory += cost.cost_after_memory;
  target.estimated_memory_credit += cost.estimated_memory_credit;
}

function emptyTotals(currency) {
  return {
    currency,
    prompt_tokens: 0,
    completion_tokens: 0,
    memory_baseline_tokens: 0,
    memory_optimized_tokens: 0,
    memory_savings_tokens: 0,
    cost_before_memory: 0,
    cost_after_memory: 0,
    estimated_memory_credit: 0,
  };
}

export function aggregateUsageEvents(input = {}) {
  const args = Array.isArray(input) ? { events: input } : input;
  if (!isPlainObject(args)) throw new TypeError('aggregateUsageEvents requires an options object or event array');
  const events = Array.isArray(args.events) ? args.events.map(requireUsageEvent) : [];
  if (events.length === 0) throw new TypeError('events must be non-empty');
  const currency = events[0].estimated_cost.currency;
  const tenantId = args.tenant_id ?? args.tenantId ?? (events.every((event) => event.tenant_id === events[0].tenant_id) ? events[0].tenant_id : 'mixed');
  const totals = emptyTotals(currency);
  const groups = new Map();
  for (const event of events) {
    if (event.estimated_cost.currency !== currency) throw new TypeError('all events must use the same currency');
    addTotals(totals, event.usage, event.estimated_cost);
    const key = `${event.provider}\u0000${event.model}`;
    if (!groups.has(key)) groups.set(key, { provider: event.provider, model: event.model, event_count: 0, totals: emptyTotals(currency) });
    const group = groups.get(key);
    group.event_count += 1;
    addTotals(group.totals, event.usage, event.estimated_cost);
  }
  const aggregateBody = {
    schema: USAGE_AGGREGATE_SCHEMA,
    product_thesis: USAGE_METERING_PRODUCT_THESIS,
    tenant_id: requiredString(tenantId, 'tenant_id'),
    meter_id: stringOrDefault(args.meter_id ?? args.meterId, 'aggregate'),
    generated_at: isoTimestamp(args.generated_at ?? args.generatedAt),
    event_count: events.length,
    event_hashes: events.map((event) => event.event_hash),
    totals,
    by_provider_model: Array.from(groups.values()).sort((a, b) => (a.provider + a.model).localeCompare(b.provider + b.model)),
    claim_boundary: [
      'Estimated memory credit is deterministic metering math over supplied usage events, not a provider invoice guarantee.',
      'No token ROI, token profit, decentralized inference, provider-side deletion, model forgetting, or compliance certification claim is made.',
      'Usage events contain counts, commitments, and hashes only; raw prompts, completions, provider responses, transcripts, credentials, and decrypted memory are forbidden.',
    ],
  };
  const aggregate = Object.freeze({ ...aggregateBody, aggregate_id: aggregateIdFrom(aggregateBody), aggregate_hash: hashValue(aggregateBody) });
  assertNoSensitivePayload(aggregate, 'aggregate');
  return aggregate;
}
