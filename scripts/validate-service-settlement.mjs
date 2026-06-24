#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OPERATOR_SERVICE_QUOTE_SCHEMA,
  PERMISSIONLESS_MEMORY_JOB_SCHEMA,
  SERVICE_SETTLEMENT_RECEIPT_SCHEMA,
  SETTLEMENT_BATCH_SCHEMA,
  verifyServiceSettlementReceipt,
} from '../packages/settlement/src/index.js';

export const SERVICE_SETTLEMENT_RESULT_SCHEMA = 'enigma.service_settlement_result.v1';

const HASH_RE = /^sha256:[0-9a-f]{64}$/;
const SECRET_VALUE_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@|raw memory|private prompt|full transcript|decrypted capsule|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16})/iu;
const FORBIDDEN_KEY_RE = /(?:^|_)(?:raw|plaintext|plain_text|prompt|prompts|message|messages|text|content|document|documents|transcript|response|responses|provider_response|response_body|credential|credentials|api_key|secret|password|private_key|seed|mnemonic)(?:$|_)/iu;
const SAFE_FIELD_NAMES = new Set(['raw_memory_on_chain', 'raw_memory_in_job', 'raw_memory_in_receipt', 'raw_memory_access_required']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function blocker(message, path) {
  return { message, path };
}

function assertNoSensitivePayload(value, path = 'service_settlement') {
  if (typeof value === 'string') {
    if (!/\.(claim_boundary\[\d+\]|product_thesis|blockers\[\d+\]\.message)$/.test(path) && SECRET_VALUE_RE.test(value)) throw new Error(`${path} contains secret-looking data`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSensitivePayload(item, `${path}[${index}]`));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (FORBIDDEN_KEY_RE.test(key) && !SAFE_FIELD_NAMES.has(key) && !/^result\.blockers\[\d+\]\.message$/.test(childPath)) throw new Error(`${childPath} is not allowed in service settlement artifacts`);
    assertNoSensitivePayload(child, childPath);
  }
}

function finiteNonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function pushHash(blockers, value, path, label = path) {
  if (!HASH_RE.test(String(value ?? ''))) blockers.push(blocker(`${label} must be sha256 hash`, path));
}

function pushString(blockers, value, path, label = path) {
  if (typeof value !== 'string' || value.trim().length === 0) blockers.push(blocker(`${label} must be non-empty string`, path));
}

function validateJob(job, blockers, path) {
  if (!isPlainObject(job)) {
    blockers.push(blocker('job object is required', path));
    return false;
  }
  if (job.schema !== PERMISSIONLESS_MEMORY_JOB_SCHEMA) blockers.push(blocker('job schema mismatch', `${path}.schema`));
  if (!/^pjob_[a-f0-9]{32}$/.test(String(job.job_id ?? ''))) blockers.push(blocker('job_id must be deterministic pjob hash id', `${path}.job_id`));
  pushHash(blockers, job.job_hash, `${path}.job_hash`, 'job_hash');
  pushHash(blockers, job.memory_commitment_root, `${path}.memory_commitment_root`, 'memory_commitment_root');
  pushHash(blockers, job.policy_hash, `${path}.policy_hash`, 'policy_hash');
  pushHash(blockers, job.usage_event_hash, `${path}.usage_event_hash`, 'usage_event_hash');
  pushString(blockers, job.tenant_id, `${path}.tenant_id`, 'tenant_id');
  if (!finiteNonNegative(job.max_price?.amount) || job.max_price.amount <= 0) blockers.push(blocker('job max_price.amount must be positive number', `${path}.max_price.amount`));
  pushString(blockers, job.max_price?.asset, `${path}.max_price.asset`, 'max_price.asset');
  const boundary = job.access_boundary;
  if (!isPlainObject(boundary)) blockers.push(blocker('job access_boundary is required', `${path}.access_boundary`));
  else {
    if (boundary.permissionless_submission !== true) blockers.push(blocker('job permissionless_submission must be true', `${path}.access_boundary.permissionless_submission`));
    for (const field of ['raw_memory_on_chain', 'raw_memory_in_job', 'token_roi_claim', 'provider_invoice_savings_claim']) {
      if (boundary[field] !== false) blockers.push(blocker(`job access_boundary.${field} must be false`, `${path}.access_boundary.${field}`));
    }
    if (boundary.centralized_or_byoc_hot_path !== true) blockers.push(blocker('job centralized_or_byoc_hot_path must be true', `${path}.access_boundary.centralized_or_byoc_hot_path`));
  }
  return true;
}

function validateQuote(quote, job, blockers, path) {
  if (!isPlainObject(quote)) {
    blockers.push(blocker('quote object is required', path));
    return false;
  }
  if (quote.schema !== OPERATOR_SERVICE_QUOTE_SCHEMA) blockers.push(blocker('quote schema mismatch', `${path}.schema`));
  if (!/^quote_[a-f0-9]{32}$/.test(String(quote.quote_id ?? ''))) blockers.push(blocker('quote_id must be deterministic quote hash id', `${path}.quote_id`));
  pushHash(blockers, quote.quote_hash, `${path}.quote_hash`, 'quote_hash');
  pushString(blockers, quote.operator_id, `${path}.operator_id`, 'operator_id');
  pushString(blockers, quote.service_kind, `${path}.service_kind`, 'service_kind');
  if (!finiteNonNegative(quote.price?.amount) || quote.price.amount <= 0) blockers.push(blocker('quote price.amount must be positive number', `${path}.price.amount`));
  pushString(blockers, quote.price?.asset, `${path}.price.asset`, 'price.asset');
  if (isPlainObject(job)) {
    if (quote.job_hash !== job.job_hash || quote.job_id !== job.job_id) blockers.push(blocker('quote must reference job', path));
    if (quote.tenant_id !== job.tenant_id) blockers.push(blocker('quote tenant_id must match job', `${path}.tenant_id`));
    if (quote.price?.asset !== job.max_price?.asset) blockers.push(blocker('quote asset must match job max_price asset', `${path}.price.asset`));
    if (finiteNonNegative(quote.price?.amount) && finiteNonNegative(job.max_price?.amount) && quote.price.amount > job.max_price.amount) blockers.push(blocker('quote price exceeds job max_price', `${path}.price.amount`));
  }
  const boundary = quote.accountability_boundary;
  if (!isPlainObject(boundary)) blockers.push(blocker('quote accountability_boundary is required', `${path}.accountability_boundary`));
  else {
    if (boundary.service_receipt_required !== true) blockers.push(blocker('quote service_receipt_required must be true', `${path}.accountability_boundary.service_receipt_required`));
    for (const field of ['raw_memory_access_required', 'operator_controls_hot_path', 'token_profit_claim']) {
      if (boundary[field] !== false) blockers.push(blocker(`quote accountability_boundary.${field} must be false`, `${path}.accountability_boundary.${field}`));
    }
  }
  return true;
}

function validateReceipt(receipt, job, quote, blockers, path) {
  if (!isPlainObject(receipt)) {
    blockers.push(blocker('receipt object is required', path));
    return false;
  }
  if (receipt.schema !== SERVICE_SETTLEMENT_RECEIPT_SCHEMA) blockers.push(blocker('receipt schema mismatch', `${path}.schema`));
  if (!/^settle_[a-f0-9]{32}$/.test(String(receipt.settlement_receipt_id ?? ''))) blockers.push(blocker('settlement_receipt_id must be deterministic settle hash id', `${path}.settlement_receipt_id`));
  pushHash(blockers, receipt.settlement_receipt_hash, `${path}.settlement_receipt_hash`, 'settlement_receipt_hash');
  pushHash(blockers, receipt.job_hash, `${path}.job_hash`, 'receipt job_hash');
  pushHash(blockers, receipt.quote_hash, `${path}.quote_hash`, 'receipt quote_hash');
  pushHash(blockers, receipt.usage_event_hash, `${path}.usage_event_hash`, 'receipt usage_event_hash');
  pushHash(blockers, receipt.memory_commitment_root, `${path}.memory_commitment_root`, 'receipt memory_commitment_root');
  pushHash(blockers, receipt.policy_hash, `${path}.policy_hash`, 'receipt policy_hash');
  if (!finiteNonNegative(receipt.settled_price?.amount)) blockers.push(blocker('settled_price.amount must be non-negative number', `${path}.settled_price.amount`));
  pushString(blockers, receipt.settled_price?.asset, `${path}.settled_price.asset`, 'settled_price.asset');
  pushString(blockers, receipt.settlement_ref, `${path}.settlement_ref`, 'settlement_ref');
  pushString(blockers, receipt.service_receipt_ref, `${path}.service_receipt_ref`, 'service_receipt_ref');
  const verification = verifyServiceSettlementReceipt({ job, quote, receipt });
  for (const error of verification.errors ?? []) blockers.push(blocker(error, path));
  const boundary = receipt.settlement_boundary;
  if (!isPlainObject(boundary)) blockers.push(blocker('receipt settlement_boundary is required', `${path}.settlement_boundary`));
  else {
    if (boundary.permissionless_access !== true) blockers.push(blocker('receipt permissionless_access must be true', `${path}.settlement_boundary.permissionless_access`));
    for (const field of ['raw_memory_on_chain', 'raw_memory_in_receipt', 'provider_invoice_savings_claim', 'token_roi_claim', 'token_profit_claim', 'model_forgetting_claim', 'provider_deletion_claim']) {
      if (boundary[field] !== false) blockers.push(blocker(`receipt settlement_boundary.${field} must be false`, `${path}.settlement_boundary.${field}`));
    }
  }
  return true;
}

function validateBatch(batch, receipts, blockers, path) {
  if (batch === undefined || batch === null) return false;
  if (!isPlainObject(batch)) {
    blockers.push(blocker('batch must be object when supplied', path));
    return false;
  }
  if (batch.schema !== SETTLEMENT_BATCH_SCHEMA) blockers.push(blocker('batch schema mismatch', `${path}.schema`));
  if (!/^batch_[a-f0-9]{32}$/.test(String(batch.batch_id ?? ''))) blockers.push(blocker('batch_id must be deterministic batch hash id', `${path}.batch_id`));
  pushHash(blockers, batch.batch_hash, `${path}.batch_hash`, 'batch_hash');
  if (!Number.isSafeInteger(batch.receipt_count) || batch.receipt_count <= 0) blockers.push(blocker('batch receipt_count must be positive integer', `${path}.receipt_count`));
  if (!Array.isArray(batch.receipt_hashes) || batch.receipt_hashes.length !== batch.receipt_count || batch.receipt_hashes.some((hash) => !HASH_RE.test(String(hash)))) blockers.push(blocker('batch receipt_hashes must match receipt_count and be sha256 hashes', `${path}.receipt_hashes`));
  if (Array.isArray(receipts) && receipts.length > 0) {
    for (const receipt of receipts) {
      if (!batch.receipt_hashes?.includes(receipt.settlement_receipt_hash)) blockers.push(blocker('batch missing supplied receipt hash', `${path}.receipt_hashes`));
    }
    const expectedTotal = receipts.reduce((sum, receipt) => sum + (receipt.settled_price?.amount ?? 0), 0);
    if (finiteNonNegative(batch.total_settled_amount) && Math.abs(batch.total_settled_amount - expectedTotal) > 1e-9) blockers.push(blocker('batch total_settled_amount must equal supplied receipts', `${path}.total_settled_amount`));
  }
  if (!Array.isArray(batch.claim_boundary) || batch.claim_boundary.length === 0) blockers.push(blocker('batch claim_boundary is required', `${path}.claim_boundary`));
  if (Array.isArray(batch.claim_boundary) && !batch.claim_boundary.some((line) => /not investment|not.*profit|not.*provider invoice/i.test(line))) blockers.push(blocker('batch claim_boundary must reject investment/provider-invoice claims', `${path}.claim_boundary`));
  return true;
}

function normalizeInput(input) {
  if (isPlainObject(input) && (input.job || input.quote || input.receipt || input.batch || input.receipts)) return input;
  return { receipt: input };
}

export function validateServiceSettlement(input, options = {}) {
  assertNoSensitivePayload(input);
  const normalized = normalizeInput(input);
  const blockers = [];
  const job = normalized.job;
  const quote = normalized.quote;
  const receipt = normalized.receipt;
  const receipts = Array.isArray(normalized.receipts) ? normalized.receipts : (receipt ? [receipt] : []);
  validateJob(job, blockers, 'job');
  validateQuote(quote, job, blockers, 'quote');
  validateReceipt(receipt, job, quote, blockers, 'receipt');
  validateBatch(normalized.batch, receipts, blockers, 'batch');
  const result = {
    schema: SERVICE_SETTLEMENT_RESULT_SCHEMA,
    generated_at: options.generated_at ?? options.generatedAt ?? new Date(0).toISOString(),
    ok: blockers.length === 0,
    status: blockers.length === 0 ? 'accepted' : 'blocked',
    blockers,
    checked: {
      job_schema: job?.schema ?? null,
      quote_schema: quote?.schema ?? null,
      receipt_schema: receipt?.schema ?? null,
      batch_schema: normalized.batch?.schema ?? null,
      receipt_count: receipts.length,
      max_price_amount: job?.max_price?.amount ?? null,
      quote_price_amount: quote?.price?.amount ?? null,
      settled_amount: receipt?.settled_price?.amount ?? null,
      asset: receipt?.settled_price?.asset ?? quote?.price?.asset ?? job?.max_price?.asset ?? null,
      invariant: finiteNonNegative(receipt?.settled_price?.amount) && finiteNonNegative(quote?.price?.amount) && finiteNonNegative(job?.max_price?.amount)
        ? receipt.settled_price.amount <= quote.price.amount && quote.price.amount <= job.max_price.amount
        : false,
    },
    claim_boundary: [
      'Service settlement validation checks hash-only Enigma job/quote/receipt linkage and price invariants; it is not investment, profit, yield, or provider invoice evidence.',
      'A pass result does not claim token ROI, token profit, decentralized raw-memory inference, provider deletion, model forgetting, or compliance status.',
      'Raw memory, prompts, completions, transcripts, provider responses, decrypted memory, credentials, private keys, and seed phrases are forbidden in service settlement artifacts.',
    ],
  };
  assertNoSensitivePayload(result, 'result');
  return result;
}

function parseArgs(argv = process.argv.slice(2)) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq !== -1) flags.set(arg.slice(2, eq), arg.slice(eq + 1));
    else if (!argv[index + 1] || argv[index + 1].startsWith('--')) flags.set(arg.slice(2), true);
    else {
      flags.set(arg.slice(2), argv[index + 1]);
      index += 1;
    }
  }
  return flags;
}

function getFlag(flags, names) {
  for (const name of names) if (flags.has(name)) return flags.get(name);
  return undefined;
}

async function main() {
  const flags = parseArgs();
  const settlementPath = getFlag(flags, ['settlement', 'in']);
  if (typeof settlementPath !== 'string' || settlementPath.trim() === '') throw new Error('--settlement <path> is required');
  const input = JSON.parse(await readFile(resolve(settlementPath), 'utf8'));
  const result = validateServiceSettlement(input, { generated_at: new Date().toISOString() });
  const out = getFlag(flags, ['out']);
  const text = `${JSON.stringify(result, null, 2)}\n`;
  if (out && out !== true) {
    const outPath = resolve(String(out));
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, text, 'utf8');
  }
  process.stdout.write(text);
  process.exitCode = result.ok ? 0 : 1;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.name ?? 'Error'}: ${error.message}\n`);
    process.exitCode = 1;
  });
}
