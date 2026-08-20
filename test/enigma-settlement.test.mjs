import test from 'node:test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import {
  CONSUMER_GPU_CAPACITY_PROFILE_SCHEMA,
  OPERATOR_SERVICE_QUOTE_SCHEMA,
  PERMISSIONLESS_MEMORY_JOB_SCHEMA,
  SERVICE_SETTLEMENT_RECEIPT_SCHEMA,
  SETTLEMENT_BATCH_SCHEMA,
  createOperatorServiceQuote,
  createConsumerGpuCapacityProfile,
  createPermissionlessMemoryJob,
  createServiceSettlementReceipt,
  createSettlementBatch,
  verifyServiceSettlementReceipt,
} from '../packages/settlement/src/index.js';

const ROOT_A = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ROOT_B = 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const ROOT_C = 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';

function fixtureJob(overrides = {}) {
  return createPermissionlessMemoryJob({
    tenant_id: 'tenant-a',
    job_type: 'context.pack',
    memory_commitment_root: ROOT_A,
    policy_hash: ROOT_B,
    usage_event_hash: ROOT_C,
    requested_at: '2026-06-23T12:00:00.000Z',
    expires_at: '2026-06-23T12:10:00.000Z',
    max_price_amount: 5,
    payment_asset: 'USDC',
    ...overrides,
  });
}

function fixtureQuote(job, overrides = {}) {
  return createOperatorServiceQuote({
    job,
    operator_id: 'operator-a',
    service_kind: 'gateway',
    quoted_at: '2026-06-23T12:01:00.000Z',
    expires_at: '2026-06-23T12:09:00.000Z',
    price_amount: 3,
    asset: 'USDC',
    capacity_ref: 'capacity://operator-a/gateway/slot-1',
    terms_ref: 'terms://enigma/service-v1',
    ...overrides,
  });
}

function fixtureReceipt(job, quote, overrides = {}) {
  return createServiceSettlementReceipt({
    job,
    quote,
    completed_at: '2026-06-23T12:04:00.000Z',
    settled_amount: 2.5,
    settlement_ref: 'settlement://solana-or-ledger/ref-without-key-material',
    service_receipt_ref: 'receipt://gateway/decision/hash-only',
    ...overrides,
  });
}

function fixtureCapacityProfile(overrides = {}) {
  return createConsumerGpuCapacityProfile({
    operator_id: 'operator-a',
    accelerator_class: 'consumer_gpu',
    hardware_ref: 'hardware://operator-a/rtx-4090-slot-7',
    region: 'us-central',
    model_family: 'memory-optimizer',
    model_refs: ['glm-5.2-memory-optimizer'],
    observed_at: '2026-06-23T12:00:00.000Z',
    expires_at: '2026-06-23T12:05:00.000Z',
    vram_gb: 24,
    max_context_window_tokens: 131072,
    available_context_tokens_per_minute: 900000,
    p95_latency_ms: 180,
    price_per_million_context_tokens: 0.42,
    asset: 'USDC',
    capacity_ref: 'capacity://operator-a/consumer-gpu/slot-7',
    terms_ref: 'terms://enigma/consumer-gpu-memory-v1',
    ...overrides,
  });
}

test('settlement protocol creates deterministic permissionless job, quote, and receipt', () => {
  const job = fixtureJob();
  assert.equal(job.schema, PERMISSIONLESS_MEMORY_JOB_SCHEMA);
  assert.equal(job.access_boundary.permissionless_submission, true);
  assert.equal(job.access_boundary.raw_memory_on_chain, false);
  assert.equal(job.access_boundary.token_roi_claim, false);
  assert.match(job.job_id, /^pjob_[a-f0-9]{32}$/);
  assert.match(job.job_hash, /^sha256:[a-f0-9]{64}$/);

  const quote = fixtureQuote(job);
  assert.equal(quote.schema, OPERATOR_SERVICE_QUOTE_SCHEMA);
  assert.equal(quote.job_hash, job.job_hash);
  assert.equal(quote.accountability_boundary.service_receipt_required, true);
  assert.equal(quote.accountability_boundary.token_profit_claim, false);

  const receipt = fixtureReceipt(job, quote);
  assert.equal(receipt.schema, SERVICE_SETTLEMENT_RECEIPT_SCHEMA);
  assert.equal(receipt.job_hash, job.job_hash);
  assert.equal(receipt.quote_hash, quote.quote_hash);
  assert.equal(receipt.settled_price.amount, 2.5);
  assert.equal(receipt.settlement_boundary.provider_invoice_savings_claim, false);
  assert.equal(receipt.settlement_boundary.token_roi_claim, false);
  assert.equal(receipt.settlement_boundary.provider_deletion_claim, false);

  assert.deepEqual(job, fixtureJob());
  assert.equal(verifyServiceSettlementReceipt({ job, quote, receipt }).ok, true);
});

test('consumer GPU capacity profile keeps permissionless access separate from raw memory decentralization', () => {
  const profile = fixtureCapacityProfile();
  assert.equal(profile.schema, CONSUMER_GPU_CAPACITY_PROFILE_SCHEMA);
  assert.equal(profile.product_thesis.includes('consumer'), true);
  assert.equal(profile.service_boundary.permissionless_discovery, true);
  assert.equal(profile.service_boundary.permissionless_settlement, true);
  assert.equal(profile.service_boundary.centralized_operator_hot_path, true);
  assert.equal(profile.service_boundary.raw_memory_access_required, false);
  assert.equal(profile.service_boundary.decentralization_claim, false);
  assert.equal(profile.service_boundary.provider_discount_claim, false);
  assert.match(profile.capacity_profile_hash, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(profile, fixtureCapacityProfile());
});

test('consumer GPU capacity profile can back memory optimizer quotes without provider discount claims', () => {
  const job = fixtureJob({ job_type: 'context.pack', max_price_amount: 1 });
  const profile = fixtureCapacityProfile();
  const quote = fixtureQuote(job, {
    service_kind: 'memory_optimizer',
    price_amount: 0.42,
    capacity_profile: profile,
  });
  assert.equal(quote.capacity_profile_hash, profile.capacity_profile_hash);
  assert.equal(quote.capacity_ref, profile.capacity_ref);
  assert.equal(quote.consumer_gpu_boundary.decentralization_claim, false);
  assert.equal(quote.consumer_gpu_boundary.provider_discount_claim, false);
  assert.throws(() => fixtureQuote(job, {
    service_kind: 'gateway',
    price_amount: 0.42,
    capacity_profile: profile,
  }), /memory_optimizer/);
});

test('settlement protocol blocks over-price quotes and broken receipts', () => {
  const job = fixtureJob({ max_price_amount: 2 });
  assert.throws(() => fixtureQuote(job, { price_amount: 3 }), /exceeds job max_price/);
  assert.throws(() => fixtureQuote(job, { asset: 'USD' }), /asset must match/);

  const validJob = fixtureJob();
  const quote = fixtureQuote(validJob);
  assert.throws(() => fixtureReceipt(validJob, quote, { settled_amount: 4 }), /exceeds quoted price/);

  const receipt = { ...fixtureReceipt(validJob, quote), usage_event_hash: ROOT_A };
  const verification = verifyServiceSettlementReceipt({ job: validJob, quote, receipt });
  assert.equal(verification.ok, false);
  assert.match(verification.errors.join('\n'), /usage event reference mismatch|hash mismatch/);
});

test('settlement protocol aggregates receipts by operator without investment claims', () => {
  const job = fixtureJob();
  const quoteA = fixtureQuote(job, { operator_id: 'operator-a', price_amount: 3 });
  const quoteB = fixtureQuote(job, { operator_id: 'operator-b', price_amount: 2 });
  const receiptA = fixtureReceipt(job, quoteA, { settled_amount: 2.5, settlement_ref: 'settlement://ledger/a' });
  const receiptB = fixtureReceipt(job, quoteB, { settled_amount: 1.5, settlement_ref: 'settlement://ledger/b' });
  const batch = createSettlementBatch({
    receipts: [receiptA, receiptB],
    asset: 'USDC',
    batch_ref: 'batch://settlement/2026-06-23',
    generated_at: '2026-06-23T12:30:00.000Z',
  });
  assert.equal(batch.schema, SETTLEMENT_BATCH_SCHEMA);
  assert.equal(batch.receipt_count, 2);
  assert.equal(batch.total_settled_amount, 4);
  assert.deepEqual(batch.operator_totals.map((entry) => entry.operator_id), ['operator-a', 'operator-b']);
  assert.equal(batch.claim_boundary.some((line) => /not investment/i.test(line)), true);
});

test('settlement protocol rejects raw memory, secrets, private key material, and invalid job types', () => {
  assert.throws(() => fixtureJob({ job_type: 'raw.infer' }), /job_type is not accepted/);
  assert.throws(() => fixtureJob({ prompt: 'private memory should not enter settlement' }), /not allowed/);
  assert.throws(() => fixtureJob({ settlement_ref: 'https://user:password@example.invalid/settle' }), /secret-looking/);
  assert.throws(() => fixtureQuote(fixtureJob(), { private_key: 'private prompt' }), /not allowed/);
  assert.throws(() => fixtureCapacityProfile({ model_family: 'raw.infer' }), /model_family is not accepted/);
  assert.throws(() => fixtureCapacityProfile({ prompt: 'private prompt' }), /not allowed|secret-looking/);
});
function makeIo() {
  let stdout = '';
  let stderr = '';
  return {
    io: {
      stdout: { write: (chunk) => { stdout += chunk; } },
      stderr: { write: (chunk) => { stderr += chunk; } },
    },
    stdout: () => stdout,
    stderr: () => stderr,
    json: () => JSON.parse(stdout),
  };
}

function assertPlainSettlement(stdout, title, dir) {
  assert.match(stdout, new RegExp(`^${title}\\n`));
  assert.match(stdout, /Status: Ready/);
  assert.match(stdout, /Boundary: local settlement/);
  assert.doesNotMatch(stdout, /^\s*\{/);
  assert.equal(stdout.includes(dir), false);
}


test('CLI creates and verifies settlement artifacts', async () => {
  const { main } = await import('../apps/cli/bin/enigma.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'enigma-settlement-cli-'));
  const jobPath = join(dir, 'job.json');
  const quotePath = join(dir, 'quote.json');
  const capacityPath = join(dir, 'capacity.json');
  const receiptPath = join(dir, 'receipt.json');
  const batchInputPath = join(dir, 'receipts.json');

  const jobIo = makeIo();
  assert.equal(await main([
    'settlement',
    'job',
    '--tenant',
    'tenant-a',
    '--job-type',
    'context.pack',
    '--memory-root',
    ROOT_A,
    '--policy-hash',
    ROOT_B,
    '--usage-event-hash',
    ROOT_C,
    '--max-price-amount',
    '5',
    '--payment-asset',
    'USDC',
    '--requested-at',
    '2026-06-23T12:00:00.000Z',
    '--expires-at',
    '2026-06-23T12:10:00.000Z',
    '--out',
    jobPath,
  ], jobIo.io), 0, jobIo.stderr());
  assert.equal(jobIo.json().ok, true);

  const capacityIo = makeIo();
  assert.equal(await main([
    'settlement',
    'capacity',
    '--operator',
    'operator-a',
    '--accelerator-class',
    'consumer_gpu',
    '--hardware-ref',
    'hardware://operator-a/rtx-4090-slot-7',
    '--region',
    'us-central',
    '--model-family',
    'memory-optimizer',
    '--model-ref',
    'glm-5.2-memory-optimizer',
    '--observed-at',
    '2026-06-23T12:00:00.000Z',
    '--expires-at',
    '2026-06-23T12:05:00.000Z',
    '--vram-gb',
    '24',
    '--max-context-window-tokens',
    '131072',
    '--available-context-tokens-per-minute',
    '900000',
    '--p95-latency-ms',
    '180',
    '--price-per-million-context-tokens',
    '0.42',
    '--asset',
    'USDC',
    '--capacity-ref',
    'capacity://operator-a/consumer-gpu/slot-7',
    '--terms-ref',
    'terms://enigma/consumer-gpu-memory-v1',
    '--out',
    capacityPath,
  ], capacityIo.io), 0, capacityIo.stderr());
  assert.equal(capacityIo.json().ok, true);

  const quoteIo = makeIo();
  assert.equal(await main([
    'settlement',
    'quote',
    '--job',
    jobPath,
    '--operator',
    'operator-a',
    '--service-kind',
    'memory_optimizer',
    '--quoted-at',
    '2026-06-23T12:01:00.000Z',
    '--expires-at',
    '2026-06-23T12:09:00.000Z',
    '--price-amount',
    '0.42',
    '--asset',
    'USDC',
    '--capacity-profile',
    capacityPath,
    '--terms-ref',
    'terms://enigma/service-v1',
    '--out',
    quotePath,
  ], quoteIo.io), 0, quoteIo.stderr());
  assert.equal(quoteIo.json().ok, true);

  const receiptIo = makeIo();
  assert.equal(await main([
    'settlement',
    'receipt',
    '--job',
    jobPath,
    '--quote',
    quotePath,
    '--completed-at',
    '2026-06-23T12:04:00.000Z',
    '--settled-amount',
    '0.4',
    '--settlement-ref',
    'settlement://ledger/a',
    '--service-receipt-ref',
    'receipt://gateway/decision/hash-only',
    '--out',
    receiptPath,
  ], receiptIo.io), 0, receiptIo.stderr());
  assert.equal(receiptIo.json().ok, true);

  const verifyIo = makeIo();
  assert.equal(await main(['settlement', 'verify', '--job', jobPath, '--quote', quotePath, '--receipt', receiptPath], verifyIo.io), 0, verifyIo.stderr());
  assert.equal(verifyIo.json().ok, true);

  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
  await writeFile(batchInputPath, `${JSON.stringify([receipt], null, 2)}\n`, 'utf8');
  const batchIo = makeIo();
  assert.equal(await main(['settlement', 'batch', '--receipts', batchInputPath, '--batch-ref', 'batch://settlement/cli', '--asset', 'USDC'], batchIo.io), 0, batchIo.stderr());
  const batch = batchIo.json();
  assert.equal(batch.schema, SETTLEMENT_BATCH_SCHEMA);
  assert.equal(batch.receipt_count, 1);
  assert.equal(batch.total_settled_amount, 0.4);

  const plainJobPath = join(dir, 'job-plain.json');
  const plainJobIo = makeIo();
  assert.equal(await main([
    'settlement', 'job',
    '--tenant', 'tenant-a',
    '--job-type', 'context.pack',
    '--memory-root', ROOT_A,
    '--policy-hash', ROOT_B,
    '--usage-event-hash', ROOT_C,
    '--max-price-amount', '5',
    '--payment-asset', 'USDC',
    '--requested-at', '2026-06-23T12:00:00.000Z',
    '--expires-at', '2026-06-23T12:10:00.000Z',
    '--out', plainJobPath,
    '--plain',
  ], plainJobIo.io), 0, plainJobIo.stderr());
  assertPlainSettlement(plainJobIo.stdout(), 'Enigma settlement job', dir);
  assert.match(plainJobIo.stdout(), /Job: pjob_/);
  assert.match(plainJobIo.stdout(), /Job file: written to <out>/);
  assert.equal(plainJobIo.stdout().includes(plainJobPath), false);

  const plainCapacityPath = join(dir, 'capacity-plain.json');
  const plainCapacityIo = makeIo();
  assert.equal(await main([
    'settlement', 'capacity',
    '--operator', 'operator-a',
    '--accelerator-class', 'consumer_gpu',
    '--hardware-ref', 'hardware://operator-a/rtx-4090-slot-7',
    '--region', 'us-central',
    '--model-family', 'memory-optimizer',
    '--model-ref', 'glm-5.2-memory-optimizer',
    '--observed-at', '2026-06-23T12:00:00.000Z',
    '--expires-at', '2026-06-23T12:05:00.000Z',
    '--vram-gb', '24',
    '--max-context-window-tokens', '131072',
    '--available-context-tokens-per-minute', '900000',
    '--p95-latency-ms', '180',
    '--price-per-million-context-tokens', '0.42',
    '--asset', 'USDC',
    '--capacity-ref', 'capacity://operator-a/consumer-gpu/slot-7',
    '--terms-ref', 'terms://enigma/consumer-gpu-memory-v1',
    '--out', plainCapacityPath,
    '--plain',
  ], plainCapacityIo.io), 0, plainCapacityIo.stderr());
  assertPlainSettlement(plainCapacityIo.stdout(), 'Enigma settlement capacity', dir);
  assert.match(plainCapacityIo.stdout(), /Capacity file: written to <out>/);
  assert.equal(plainCapacityIo.stdout().includes(plainCapacityPath), false);

  const plainQuotePath = join(dir, 'quote-plain.json');
  const plainQuoteIo = makeIo();
  assert.equal(await main([
    'settlement', 'quote',
    '--job', jobPath,
    '--operator', 'operator-a',
    '--service-kind', 'memory_optimizer',
    '--quoted-at', '2026-06-23T12:01:00.000Z',
    '--expires-at', '2026-06-23T12:09:00.000Z',
    '--price-amount', '0.42',
    '--asset', 'USDC',
    '--capacity-profile', capacityPath,
    '--terms-ref', 'terms://enigma/service-v1',
    '--out', plainQuotePath,
    '--plain',
  ], plainQuoteIo.io), 0, plainQuoteIo.stderr());
  assertPlainSettlement(plainQuoteIo.stdout(), 'Enigma settlement quote', dir);
  assert.match(plainQuoteIo.stdout(), /Quote file: written to <out>/);
  assert.equal(plainQuoteIo.stdout().includes(plainQuotePath), false);
  assert.equal(plainQuoteIo.stdout().includes(jobPath), false);
  assert.equal(plainQuoteIo.stdout().includes(capacityPath), false);

  const plainReceiptPath = join(dir, 'receipt-plain.json');
  const plainReceiptIo = makeIo();
  assert.equal(await main([
    'settlement', 'receipt',
    '--job', jobPath,
    '--quote', quotePath,
    '--completed-at', '2026-06-23T12:04:00.000Z',
    '--settled-amount', '0.4',
    '--settlement-ref', 'settlement://ledger/a',
    '--service-receipt-ref', 'receipt://gateway/decision/hash-only',
    '--out', plainReceiptPath,
    '--plain',
  ], plainReceiptIo.io), 0, plainReceiptIo.stderr());
  assertPlainSettlement(plainReceiptIo.stdout(), 'Enigma settlement receipt', dir);
  assert.match(plainReceiptIo.stdout(), /Receipt file: written to <out>/);
  assert.equal(plainReceiptIo.stdout().includes(plainReceiptPath), false);
  assert.equal(plainReceiptIo.stdout().includes(jobPath), false);
  assert.equal(plainReceiptIo.stdout().includes(quotePath), false);

  const plainVerifyIo = makeIo();
  assert.equal(await main(['settlement', 'verify', '--job', jobPath, '--quote', quotePath, '--receipt', receiptPath, '--plain'], plainVerifyIo.io), 0, plainVerifyIo.stderr());
  assertPlainSettlement(plainVerifyIo.stdout(), 'Enigma settlement verify', dir);
  assert.match(plainVerifyIo.stdout(), /Errors: 0/);
  assert.equal(plainVerifyIo.stdout().includes(jobPath), false);
  assert.equal(plainVerifyIo.stdout().includes(quotePath), false);
  assert.equal(plainVerifyIo.stdout().includes(receiptPath), false);

  const plainBatchPath = join(dir, 'batch-plain.json');
  const plainBatchIo = makeIo();
  assert.equal(await main(['settlement', 'batch', '--receipts', batchInputPath, '--batch-ref', 'batch://settlement/plain', '--asset', 'USDC', '--out', plainBatchPath, '--plain'], plainBatchIo.io), 0, plainBatchIo.stderr());
  assertPlainSettlement(plainBatchIo.stdout(), 'Enigma settlement batch', dir);
  assert.match(plainBatchIo.stdout(), /Batch file: written to <out>/);
  assert.match(plainBatchIo.stdout(), /Receipts: 1/);
  assert.equal(plainBatchIo.stdout().includes(batchInputPath), false);
  assert.equal(plainBatchIo.stdout().includes(plainBatchPath), false);
});
