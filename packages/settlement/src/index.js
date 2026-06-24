import { createHash } from 'node:crypto';

export const PERMISSIONLESS_MEMORY_JOB_SCHEMA = 'enigma.permissionless_memory_job.v1';
export const CONSUMER_GPU_CAPACITY_PROFILE_SCHEMA = 'enigma.consumer_gpu_capacity_profile.v1';
export const OPERATOR_SERVICE_QUOTE_SCHEMA = 'enigma.operator_service_quote.v1';
export const SERVICE_SETTLEMENT_RECEIPT_SCHEMA = 'enigma.service_settlement_receipt.v1';
export const SETTLEMENT_BATCH_SCHEMA = 'enigma.settlement_batch.v1';

export const SETTLEMENT_PRODUCT_THESIS = 'Use permissionless rails for access, service accountability, and settlement while keeping raw memory and hot-path optimization centralized or BYOC-controlled.';
export const CONSUMER_GPU_MEMORY_MARKET_THESIS = 'Use consumer and workstation GPU operators for priced memory-optimization capacity only when they can prove bounded service receipts; do not decentralize raw memory or claim provider-wide discounts without measured evidence.';

const SHA256_PREFIX = 'sha256:';
const ROOT_RE = /^sha256:[a-f0-9]{64}$/;
const ACCEPTED_JOB_TYPES = new Set(['memory.read', 'memory.write', 'memory.delete', 'context.pack', 'relay.store', 'witness.checkpoint', 'gateway.evaluate']);
const ACCEPTED_SERVICE_KINDS = new Set(['relay', 'witness', 'gateway', 'memory_optimizer', 'settlement_gateway']);
const ACCEPTED_ASSETS = new Set(['USD', 'USDC', 'SOL', 'ENIGMA', 'CREDITS']);
const ACCEPTED_ACCELERATOR_CLASSES = new Set(['consumer_gpu', 'workstation_gpu', 'edge_gpu']);
const ACCEPTED_MODEL_FAMILIES = new Set(['small-context', 'medium-context', 'long-context', 'embedding', 'reranker', 'memory-optimizer']);
const FORBIDDEN_KEY_RE = /(?:^|_)(?:raw|plaintext|plain_text|prompt|prompts|message|messages|text|content|document|documents|transcript|response|responses|provider_response|response_body|credential|credentials|api_key|secret|password|private_key|seed|mnemonic)(?:$|_)/iu;
const SECRET_VALUE_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@|raw memory|private prompt|full transcript|decrypted capsule|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16})/iu;
const SAFE_FIELD_NAMES = new Set(['raw_memory_on_chain', 'raw_memory_in_job', 'raw_memory_in_receipt', 'raw_memory_access_required']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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

function digest(value) {
  return `${SHA256_PREFIX}${createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex')}`;
}

function requiredString(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError(`${field} must be a non-empty string`);
  return value.trim();
}

function optionalString(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return requiredString(String(value), 'string');
}

function nonNegativeNumber(value, field) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) throw new TypeError(`${field} must be a non-negative number`);
  return number;
}

function positiveNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new TypeError(`${field} must be a positive number`);
  return number;
}

function positiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new TypeError(`${field} must be a positive integer`);
  return number;
}

function boundedStringArray(value, field, { max = 8 } = {}) {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) throw new TypeError(`${field} must be a non-empty array with at most ${max} entries`);
  return Object.freeze(value.map((item, index) => requiredString(item, `${field}[${index}]`)));
}

function isoTimestamp(value, field, fallback = new Date(0).toISOString()) {
  const timestamp = optionalString(value, fallback);
  if (Number.isNaN(Date.parse(timestamp))) throw new TypeError(`${field} must be ISO-parseable`);
  return timestamp;
}

function root(value, field) {
  const string = requiredString(value, field);
  if (!ROOT_RE.test(string)) throw new TypeError(`${field} must be a sha256-prefixed digest`);
  return string;
}

function asset(value, field = 'asset') {
  const string = requiredString(value, field).toUpperCase();
  if (!ACCEPTED_ASSETS.has(string)) throw new TypeError(`${field} is not an accepted settlement asset`);
  return string;
}

function assertNoSensitivePayload(value, path = 'settlement') {
  if (typeof value === 'string') {
    if (!/\.(claim_boundary\[\d+\]|product_thesis)$/.test(path) && SECRET_VALUE_RE.test(value)) throw new TypeError(`${path} contains secret-looking data`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSensitivePayload(item, `${path}[${index}]`));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEY_RE.test(key) && !SAFE_FIELD_NAMES.has(key)) throw new TypeError(`${path}.${key} is not allowed in settlement artifacts`);
    assertNoSensitivePayload(child, `${path}.${key}`);
  }
}

function jobIdFrom(body) {
  return `pjob_${digest(body).slice(SHA256_PREFIX.length, SHA256_PREFIX.length + 32)}`;
}

function quoteIdFrom(body) {
  return `quote_${digest(body).slice(SHA256_PREFIX.length, SHA256_PREFIX.length + 32)}`;
}

function receiptIdFrom(body) {
  return `settle_${digest(body).slice(SHA256_PREFIX.length, SHA256_PREFIX.length + 32)}`;
}

function batchIdFrom(body) {
  return `batch_${digest(body).slice(SHA256_PREFIX.length, SHA256_PREFIX.length + 32)}`;
}

export function createPermissionlessMemoryJob(input = {}) {
  if (!isPlainObject(input)) throw new TypeError('createPermissionlessMemoryJob requires an options object');
  assertNoSensitivePayload(input, 'input');
  const jobType = requiredString(input.job_type ?? input.jobType, 'job_type');
  if (!ACCEPTED_JOB_TYPES.has(jobType)) throw new TypeError('job_type is not accepted');
  const maxPriceAmount = positiveNumber(input.max_price_amount ?? input.maxPriceAmount, 'max_price_amount');
  const paymentAsset = asset(input.payment_asset ?? input.paymentAsset, 'payment_asset');
  const body = {
    schema: PERMISSIONLESS_MEMORY_JOB_SCHEMA,
    product_thesis: SETTLEMENT_PRODUCT_THESIS,
    tenant_id: requiredString(input.tenant_id ?? input.tenantId, 'tenant_id'),
    job_type: jobType,
    memory_commitment_root: root(input.memory_commitment_root ?? input.memoryCommitmentRoot, 'memory_commitment_root'),
    policy_hash: root(input.policy_hash ?? input.policyHash, 'policy_hash'),
    usage_event_hash: root(input.usage_event_hash ?? input.usageEventHash, 'usage_event_hash'),
    requested_at: isoTimestamp(input.requested_at ?? input.requestedAt, 'requested_at'),
    expires_at: isoTimestamp(input.expires_at ?? input.expiresAt, 'expires_at', '2100-01-01T00:00:00.000Z'),
    max_price: {
      amount: maxPriceAmount,
      asset: paymentAsset,
    },
    access_boundary: {
      permissionless_submission: true,
      raw_memory_on_chain: false,
      raw_memory_in_job: false,
      centralized_or_byoc_hot_path: true,
      token_roi_claim: false,
      provider_invoice_savings_claim: false,
    },
  };
  if (Date.parse(body.expires_at) <= Date.parse(body.requested_at)) throw new RangeError('expires_at must be after requested_at');
  const job = Object.freeze({ ...body, job_id: jobIdFrom(body), job_hash: digest(body) });
  assertNoSensitivePayload(job, 'job');
  return job;
}

export function createConsumerGpuCapacityProfile(input = {}) {
  if (!isPlainObject(input)) throw new TypeError('createConsumerGpuCapacityProfile requires an options object');
  assertNoSensitivePayload(input, 'input');
  const acceleratorClass = requiredString(input.accelerator_class ?? input.acceleratorClass, 'accelerator_class');
  if (!ACCEPTED_ACCELERATOR_CLASSES.has(acceleratorClass)) throw new TypeError('accelerator_class is not accepted');
  const modelFamily = requiredString(input.model_family ?? input.modelFamily, 'model_family');
  if (!ACCEPTED_MODEL_FAMILIES.has(modelFamily)) throw new TypeError('model_family is not accepted');
  const priceAmount = positiveNumber(input.price_per_million_context_tokens ?? input.pricePerMillionContextTokens, 'price_per_million_context_tokens');
  const profileAsset = asset(input.asset ?? input.settlement_asset ?? input.settlementAsset, 'asset');
  const body = {
    schema: CONSUMER_GPU_CAPACITY_PROFILE_SCHEMA,
    product_thesis: CONSUMER_GPU_MEMORY_MARKET_THESIS,
    operator_id: requiredString(input.operator_id ?? input.operatorId, 'operator_id'),
    accelerator_class: acceleratorClass,
    hardware_ref: requiredString(input.hardware_ref ?? input.hardwareRef, 'hardware_ref'),
    region: requiredString(input.region, 'region'),
    model_family: modelFamily,
    model_refs: boundedStringArray(input.model_refs ?? input.modelRefs, 'model_refs', { max: 12 }),
    observed_at: isoTimestamp(input.observed_at ?? input.observedAt, 'observed_at'),
    expires_at: isoTimestamp(input.expires_at ?? input.expiresAt, 'expires_at', '2100-01-01T00:00:00.000Z'),
    capacity: {
      vram_gb: positiveNumber(input.vram_gb ?? input.vramGb, 'vram_gb'),
      max_context_window_tokens: positiveInteger(input.max_context_window_tokens ?? input.maxContextWindowTokens, 'max_context_window_tokens'),
      available_context_tokens_per_minute: positiveInteger(input.available_context_tokens_per_minute ?? input.availableContextTokensPerMinute, 'available_context_tokens_per_minute'),
      p95_latency_ms: positiveNumber(input.p95_latency_ms ?? input.p95LatencyMs, 'p95_latency_ms'),
    },
    price_per_million_context_tokens: {
      amount: priceAmount,
      asset: profileAsset,
    },
    service_boundary: {
      permissionless_discovery: true,
      permissionless_settlement: true,
      centralized_operator_hot_path: true,
      raw_memory_access_required: false,
      decentralization_claim: false,
      provider_discount_claim: false,
      measured_receipt_required: true,
    },
    capacity_ref: requiredString(input.capacity_ref ?? input.capacityRef, 'capacity_ref'),
    terms_ref: requiredString(input.terms_ref ?? input.termsRef, 'terms_ref'),
  };
  if (Date.parse(body.expires_at) <= Date.parse(body.observed_at)) throw new RangeError('capacity expires_at must be after observed_at');
  const profile = Object.freeze({ ...body, capacity_profile_hash: digest(body) });
  assertNoSensitivePayload(profile, 'capacity_profile');
  return profile;
}

export function createOperatorServiceQuote(input = {}) {
  if (!isPlainObject(input)) throw new TypeError('createOperatorServiceQuote requires an options object');
  assertNoSensitivePayload(input, 'input');
  const job = input.job;
  if (!isPlainObject(job) || job.schema !== PERMISSIONLESS_MEMORY_JOB_SCHEMA) throw new TypeError('job must be an Enigma permissionless memory job');
  const serviceKind = requiredString(input.service_kind ?? input.serviceKind, 'service_kind');
  if (!ACCEPTED_SERVICE_KINDS.has(serviceKind)) throw new TypeError('service_kind is not accepted');
  const priceAmount = positiveNumber(input.price_amount ?? input.priceAmount, 'price_amount');
  const quoteAsset = asset(input.asset ?? input.payment_asset ?? input.paymentAsset ?? job.max_price.asset, 'asset');
  if (quoteAsset !== job.max_price.asset) throw new TypeError('quote asset must match job max_price asset');
  if (priceAmount > job.max_price.amount) throw new RangeError('quote price exceeds job max_price');
  const capacityProfile = input.capacity_profile ?? input.capacityProfile ?? null;
  const body = {
    schema: OPERATOR_SERVICE_QUOTE_SCHEMA,
    product_thesis: SETTLEMENT_PRODUCT_THESIS,
    job_id: job.job_id,
    job_hash: job.job_hash,
    tenant_id: job.tenant_id,
    operator_id: requiredString(input.operator_id ?? input.operatorId, 'operator_id'),
    service_kind: serviceKind,
    quoted_at: isoTimestamp(input.quoted_at ?? input.quotedAt, 'quoted_at'),
    expires_at: isoTimestamp(input.expires_at ?? input.expiresAt, 'expires_at', job.expires_at),
    price: {
      amount: priceAmount,
      asset: quoteAsset,
    },
    capacity_ref: capacityProfile ? requiredString(capacityProfile.capacity_ref, 'capacity_profile.capacity_ref') : requiredString(input.capacity_ref ?? input.capacityRef, 'capacity_ref'),
    terms_ref: requiredString(input.terms_ref ?? input.termsRef, 'terms_ref'),
    accountability_boundary: {
      service_receipt_required: true,
      raw_memory_access_required: false,
      operator_controls_hot_path: false,
      token_profit_claim: false,
    },
  };
  if (capacityProfile !== null) {
    if (!isPlainObject(capacityProfile) || capacityProfile.schema !== CONSUMER_GPU_CAPACITY_PROFILE_SCHEMA) throw new TypeError('capacity_profile must be an Enigma consumer GPU capacity profile');
    if (serviceKind !== 'memory_optimizer') throw new TypeError('capacity_profile quotes must use service_kind memory_optimizer');
    if (capacityProfile.operator_id !== body.operator_id) throw new TypeError('capacity_profile operator must match quote operator');
    if (capacityProfile.price_per_million_context_tokens.asset !== quoteAsset) throw new TypeError('capacity_profile asset must match quote asset');
    body.capacity_ref = capacityProfile.capacity_ref;
    body.capacity_profile_hash = capacityProfile.capacity_profile_hash;
    body.consumer_gpu_boundary = capacityProfile.service_boundary;
  }
  if (Date.parse(body.expires_at) <= Date.parse(body.quoted_at)) throw new RangeError('quote expires_at must be after quoted_at');
  const quote = Object.freeze({ ...body, quote_id: quoteIdFrom(body), quote_hash: digest(body) });
  assertNoSensitivePayload(quote, 'quote');
  return quote;
}

export function createServiceSettlementReceipt(input = {}) {
  if (!isPlainObject(input)) throw new TypeError('createServiceSettlementReceipt requires an options object');
  assertNoSensitivePayload(input, 'input');
  const job = input.job;
  const quote = input.quote;
  if (!isPlainObject(job) || job.schema !== PERMISSIONLESS_MEMORY_JOB_SCHEMA) throw new TypeError('job must be an Enigma permissionless memory job');
  if (!isPlainObject(quote) || quote.schema !== OPERATOR_SERVICE_QUOTE_SCHEMA) throw new TypeError('quote must be an Enigma operator service quote');
  if (quote.job_hash !== job.job_hash || quote.job_id !== job.job_id) throw new TypeError('quote must reference job');
  const settledAmount = nonNegativeNumber(input.settled_amount ?? input.settledAmount ?? quote.price.amount, 'settled_amount');
  if (settledAmount > quote.price.amount) throw new RangeError('settled_amount exceeds quoted price');
  const body = {
    schema: SERVICE_SETTLEMENT_RECEIPT_SCHEMA,
    product_thesis: SETTLEMENT_PRODUCT_THESIS,
    job_id: job.job_id,
    job_hash: job.job_hash,
    quote_id: quote.quote_id,
    quote_hash: quote.quote_hash,
    tenant_id: job.tenant_id,
    operator_id: quote.operator_id,
    service_kind: quote.service_kind,
    completed_at: isoTimestamp(input.completed_at ?? input.completedAt, 'completed_at'),
    usage_event_hash: job.usage_event_hash,
    memory_commitment_root: job.memory_commitment_root,
    policy_hash: job.policy_hash,
    settled_price: {
      amount: settledAmount,
      asset: quote.price.asset,
    },
    settlement_ref: requiredString(input.settlement_ref ?? input.settlementRef, 'settlement_ref'),
    service_receipt_ref: requiredString(input.service_receipt_ref ?? input.serviceReceiptRef, 'service_receipt_ref'),
    settlement_boundary: {
      permissionless_access: true,
      raw_memory_on_chain: false,
      raw_memory_in_receipt: false,
      provider_invoice_savings_claim: false,
      token_roi_claim: false,
      token_profit_claim: false,
      model_forgetting_claim: false,
      provider_deletion_claim: false,
    },
  };
  const receipt = Object.freeze({ ...body, settlement_receipt_id: receiptIdFrom(body), settlement_receipt_hash: digest(body) });
  assertNoSensitivePayload(receipt, 'receipt');
  return receipt;
}

export function verifyServiceSettlementReceipt(input = {}) {
  const errors = [];
  const job = input.job;
  const quote = input.quote;
  const receipt = input.receipt;
  try {
    assertNoSensitivePayload(input, 'verification');
  } catch (error) {
    errors.push(error.message);
  }
  if (!isPlainObject(job) || job.schema !== PERMISSIONLESS_MEMORY_JOB_SCHEMA) errors.push('job schema mismatch');
  if (!isPlainObject(quote) || quote.schema !== OPERATOR_SERVICE_QUOTE_SCHEMA) errors.push('quote schema mismatch');
  if (!isPlainObject(receipt) || receipt.schema !== SERVICE_SETTLEMENT_RECEIPT_SCHEMA) errors.push('receipt schema mismatch');
  if (errors.length === 0) {
    if (receipt.job_hash !== job.job_hash || receipt.job_id !== job.job_id) errors.push('receipt job reference mismatch');
    if (receipt.quote_hash !== quote.quote_hash || receipt.quote_id !== quote.quote_id) errors.push('receipt quote reference mismatch');
    if (quote.job_hash !== job.job_hash || quote.job_id !== job.job_id) errors.push('quote job reference mismatch');
    if (receipt.usage_event_hash !== job.usage_event_hash) errors.push('usage event reference mismatch');
    if (receipt.memory_commitment_root !== job.memory_commitment_root) errors.push('memory commitment reference mismatch');
    if (receipt.policy_hash !== job.policy_hash) errors.push('policy hash reference mismatch');
    if (receipt.settled_price.asset !== quote.price.asset) errors.push('settlement asset mismatch');
    if (receipt.settled_price.amount > quote.price.amount) errors.push('settlement amount exceeds quote');
    if (receipt.settlement_boundary?.raw_memory_on_chain !== false) errors.push('receipt must not put raw memory on-chain');
    if (receipt.settlement_boundary?.token_roi_claim !== false) errors.push('receipt must not claim token ROI');
    const { settlement_receipt_id: _id, settlement_receipt_hash: _hash, ...receiptBody } = receipt;
    if (receipt.settlement_receipt_id !== receiptIdFrom(receiptBody)) errors.push('settlement receipt id mismatch');
    if (receipt.settlement_receipt_hash !== digest(receiptBody)) errors.push('settlement receipt hash mismatch');
  }
  return Object.freeze({ ok: errors.length === 0, valid: errors.length === 0, errors });
}

export function createSettlementBatch(input = {}) {
  if (!isPlainObject(input)) throw new TypeError('createSettlementBatch requires an options object');
  assertNoSensitivePayload(input, 'input');
  const receipts = Array.isArray(input.receipts) ? input.receipts : [];
  if (receipts.length === 0) throw new TypeError('receipts must be non-empty');
  const assetName = asset(input.asset ?? receipts[0]?.settled_price?.asset, 'asset');
  let total = 0;
  const operatorTotals = new Map();
  for (const [index, receipt] of receipts.entries()) {
    if (!isPlainObject(receipt) || receipt.schema !== SERVICE_SETTLEMENT_RECEIPT_SCHEMA) throw new TypeError(`receipts[${index}] must be a service settlement receipt`);
    assertNoSensitivePayload(receipt, `receipts[${index}]`);
    if (receipt.settled_price.asset !== assetName) throw new TypeError('all receipts must use the batch asset');
    total += receipt.settled_price.amount;
    operatorTotals.set(receipt.operator_id, (operatorTotals.get(receipt.operator_id) ?? 0) + receipt.settled_price.amount);
  }
  const body = {
    schema: SETTLEMENT_BATCH_SCHEMA,
    product_thesis: SETTLEMENT_PRODUCT_THESIS,
    generated_at: isoTimestamp(input.generated_at ?? input.generatedAt, 'generated_at'),
    batch_ref: requiredString(input.batch_ref ?? input.batchRef, 'batch_ref'),
    asset: assetName,
    receipt_count: receipts.length,
    receipt_hashes: receipts.map((receipt) => receipt.settlement_receipt_hash),
    total_settled_amount: total,
    operator_totals: Array.from(operatorTotals, ([operator_id, amount]) => ({ operator_id, amount, asset: assetName })).sort((a, b) => a.operator_id.localeCompare(b.operator_id)),
    claim_boundary: [
      'Settlement batches aggregate service receipts only; they are not investment, profit, yield, equity, or provider invoice evidence.',
      'Permissionless access means open job submission/settlement boundary, not decentralized raw-memory inference.',
      'Raw memory, prompts, transcripts, provider responses, credentials, keys, seed phrases, and decrypted content are forbidden in settlement artifacts.',
    ],
  };
  const batch = Object.freeze({ ...body, batch_id: batchIdFrom(body), batch_hash: digest(body) });
  assertNoSensitivePayload(batch, 'batch');
  return batch;
}
