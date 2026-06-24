import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  createOperatorServiceQuote,
  createPermissionlessMemoryJob,
  createServiceSettlementReceipt,
  createSettlementBatch,
} from '../packages/settlement/src/index.js';
import { SERVICE_SETTLEMENT_RESULT_SCHEMA, validateServiceSettlement } from '../scripts/validate-service-settlement.mjs';

const execFileAsync = promisify(execFile);

const ROOT_A = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ROOT_B = 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const ROOT_C = 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';

function fixture() {
  const job = createPermissionlessMemoryJob({
    tenant_id: 'tenant-a',
    job_type: 'context.pack',
    memory_commitment_root: ROOT_A,
    policy_hash: ROOT_B,
    usage_event_hash: ROOT_C,
    requested_at: '2026-06-23T12:00:00.000Z',
    expires_at: '2026-06-23T12:10:00.000Z',
    max_price_amount: 5,
    payment_asset: 'USDC',
  });
  const quote = createOperatorServiceQuote({
    job,
    operator_id: 'operator-a',
    service_kind: 'gateway',
    quoted_at: '2026-06-23T12:01:00.000Z',
    expires_at: '2026-06-23T12:09:00.000Z',
    price_amount: 3,
    asset: 'USDC',
    capacity_ref: 'capacity://operator-a/gateway/slot-1',
    terms_ref: 'terms://enigma/service-v1',
  });
  const receipt = createServiceSettlementReceipt({
    job,
    quote,
    completed_at: '2026-06-23T12:04:00.000Z',
    settled_amount: 2.5,
    settlement_ref: 'settlement://ledger/a',
    service_receipt_ref: 'receipt://gateway/decision/hash-only',
  });
  const batch = createSettlementBatch({
    receipts: [receipt],
    asset: 'USDC',
    batch_ref: 'batch://settlement/fixture',
    generated_at: '2026-06-23T12:30:00.000Z',
  });
  return { job, quote, receipt, batch };
}

test('service settlement validator accepts complete job quote receipt and batch', () => {
  const packet = fixture();
  const result = validateServiceSettlement(packet, { generated_at: '2026-06-23T12:00:00.000Z' });
  assert.equal(result.schema, SERVICE_SETTLEMENT_RESULT_SCHEMA);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'accepted');
  assert.deepEqual(result.blockers, []);
  assert.equal(result.checked.invariant, true);
  assert.equal(result.checked.max_price_amount, 5);
  assert.equal(result.checked.quote_price_amount, 3);
  assert.equal(result.checked.settled_amount, 2.5);
  assert.equal(result.checked.receipt_count, 1);
});

test('service settlement validator blocks broken linkage and claim boundaries', () => {
  const packet = structuredClone(fixture());
  packet.receipt.usage_event_hash = ROOT_A;
  packet.receipt.settled_price.amount = 4;
  packet.receipt.settlement_boundary.token_roi_claim = true;
  packet.quote.accountability_boundary.raw_memory_access_required = true;
  const result = validateServiceSettlement(packet);
  assert.equal(result.ok, false);
  const messages = result.blockers.map((entry) => entry.message).join('\n');
  assert.match(messages, /usage event reference mismatch|hash mismatch/i);
  assert.match(messages, /settlement amount exceeds quote|settled_amount|invariant/i);
  assert.match(messages, /token_roi_claim/);
  assert.match(messages, /raw_memory_access_required/);
});

test('service settlement validator rejects secrets and raw payload fields', () => {
  const packet = fixture();
  assert.throws(() => validateServiceSettlement({ ...packet, prompt: 'private prompt' }), /not allowed|secret/i);
  assert.throws(() => validateServiceSettlement({ ...packet, receipt: { ...packet.receipt, settlement_ref: 'https://user:password@example.invalid/settle' } }), /secret/i);
});

test('service settlement CLI returns blocked result for unsafe receipt', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-service-settlement-'));
  const packet = structuredClone(fixture());
  packet.batch.receipt_hashes = [];
  packet.receipt.settlement_boundary.provider_deletion_claim = true;
  const path = join(dir, 'settlement.json');
  await writeFile(path, `${JSON.stringify(packet, null, 2)}\n`, 'utf8');
  const result = await execFileAsync(process.execPath, [
    'scripts/validate-service-settlement.mjs',
    '--settlement',
    path,
  ], { cwd: process.cwd(), timeout: 10000, windowsHide: true }).catch((error) => error);
  assert.equal(result.code, 1);
  assert.equal(result.stderr, '');
  const output = JSON.parse(result.stdout);
  assert.equal(output.schema, SERVICE_SETTLEMENT_RESULT_SCHEMA);
  assert.equal(output.ok, false);
  assert.match(JSON.stringify(output.blockers), /provider_deletion_claim|receipt_hashes/);
  assert.doesNotMatch(result.stdout, /Bearer\s+[A-Za-z0-9._~+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@/i);
});
