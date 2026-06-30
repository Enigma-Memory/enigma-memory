import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLifecycleRootSummary,
  buildMemoryBoundaryTransactionSummary,
  buildPublicLifecycleReceiptLog,
  createVault,
  deleteMemory,
  exportBundle,
  importBundle,
  recall,
  remember,
  updateMemory,
} from '../packages/vault/src/index.js';

function assertNoRawPublicPayload(value, ...needles) {
  const encoded = JSON.stringify(value);
  for (const needle of needles) {
    assert.equal(encoded.includes(needle), false);
  }
  const stack = [value];
  while (stack.length > 0) {
    const item = stack.pop();
    if (!item || typeof item !== 'object') continue;
    for (const [key, child] of Object.entries(item)) {
      assert.equal(['content', 'plaintext', 'text', 'prompt', 'response'].includes(key), false, `raw payload key leaked: ${key}`);
      stack.push(child);
    }
  }
}

const LIFECYCLE_LOG_KEYS = [
  'active_root',
  'epoch',
  'issued_at',
  'log_id',
  'log_ref',
  'previous_log_root',
  'quarantine_root',
  'receipt_log_root',
  'receipt_refs',
  'schema',
  'signature_ref',
  'signer_ref',
  'subject_ref',
  'tenant_ref',
  'tombstone_root',
].sort();

const RECEIPT_REF_KEYS = [
  'lifecycle_state',
  'previous_receipt_hash',
  'receipt_hash',
  'receipt_ref',
  'sequence',
].sort();


test('memory-boundary vault summaries project lifecycle roots without plaintext', () => {
  const raw = 'vault boundary plaintext sentinel';
  const updatedRaw = 'vault boundary updated plaintext sentinel';
  const vault = createVault({ subjectId: 'subject-boundary-vault', now: '2026-06-27T00:00:00.000Z' });

  const remembered = remember({ vault, text: raw, now: '2026-06-27T00:00:01.000Z' });
  assert.equal(recall({ vault, memory_addr: remembered.memory_addr, now: '2026-06-27T00:00:02.000Z' }).content, raw);
  const updated = updateMemory({ vault, memory_addr: remembered.memory_addr, text: updatedRaw, now: '2026-06-27T00:00:03.000Z' });
  deleteMemory({ vault, memory_addr: updated.memory_addr, reason: 'test-boundary-delete', now: '2026-06-27T00:00:04.000Z' });

  const roots = buildLifecycleRootSummary({ vault });
  assert.equal(roots.schema, 'enigma.lifecycle_root_summary.v1');
  assert.equal(roots.active_count, 0);
  assert.equal(roots.quarantine_count, 0);
  assert.equal(roots.tombstone_count, 2);
  assert.equal(roots.receipt_count, vault.receipts.length);
  assert.match(roots.active_set_root, /^sha256:[a-f0-9]{64}$/);
  assert.match(roots.quarantine_set_root, /^sha256:[a-f0-9]{64}$/);
  assert.match(roots.tombstone_set_root, /^sha256:[a-f0-9]{64}$/);
  assert.match(roots.lifecycle_root, /^sha256:[a-f0-9]{64}$/);
  assertNoRawPublicPayload(roots, raw, updatedRaw);

  const transaction = buildMemoryBoundaryTransactionSummary({ vault });
  assert.equal(transaction.schema, 'enigma.memory_boundary_transaction_summary.v1');
  assert.equal(transaction.operation, 'delete');
  assert.equal(transaction.public_safe, true);
  assert.equal(transaction.lifecycle_root, roots.lifecycle_root);
  assert.match(transaction.receipt_hash, /^sha256:[a-f0-9]{64}$/);
  assertNoRawPublicPayload(transaction, raw, updatedRaw);

  const log = buildPublicLifecycleReceiptLog({ vault, now: '2026-06-27T00:00:05.000Z' });
  assert.equal(log.schema, 'enigma.lifecycle_receipt_log.v1');
  assert.equal(log.receipt_refs.length, vault.receipts.length);
  assert.deepEqual(Object.keys(log).sort(), LIFECYCLE_LOG_KEYS);
  assert.equal(log.tombstone_root, roots.tombstone_set_root);
  assert.match(log.log_ref, /^sha256:[a-f0-9]{64}$/);
  assert.match(log.subject_ref, /^sha256:[a-f0-9]{64}$/);
  assert.equal(log.receipt_refs.every((receipt) => receipt.event === undefined), true);
  assert.equal(log.receipt_refs.every((receipt) => /^sha256:[a-f0-9]{64}$/.test(receipt.receipt_hash)), true);
  assert.equal(log.receipt_refs.every((receipt) => ['active', 'quarantine', 'tombstone'].includes(receipt.lifecycle_state)), true);
  assert.equal(log.receipt_refs.every((receipt) => JSON.stringify(Object.keys(receipt).sort()) === JSON.stringify(RECEIPT_REF_KEYS)), true);
  assertNoRawPublicPayload(log, raw, updatedRaw);
});

test('memory-boundary projections survive vault export and import', () => {
  const raw = 'import export boundary plaintext sentinel';
  const vault = createVault({ subjectId: 'subject-boundary-import', now: '2026-06-27T01:00:00.000Z' });
  const remembered = remember({ vault, text: raw, now: '2026-06-27T01:00:01.000Z' });
  deleteMemory({ vault, memory_addr: remembered.memory_addr, now: '2026-06-27T01:00:02.000Z' });

  const bundle = exportBundle({ vault, now: '2026-06-27T01:00:03.000Z' });
  const imported = importBundle({ bundle, now: '2026-06-27T01:00:04.000Z' });
  const roots = buildLifecycleRootSummary(imported.vault);
  const transaction = buildMemoryBoundaryTransactionSummary({ vault: imported.vault });
  const log = buildPublicLifecycleReceiptLog(imported.vault);

  assert.equal(imported.active_memory_addresses.length, 0);
  assert.equal(roots.tombstone_count, 1);
  assert.equal(transaction.operation, 'import');
  assert.equal(log.receipt_refs.length, imported.vault.receipts.length);
  assert.equal(log.receipt_log_root, roots.receipt_log_root);
  assertNoRawPublicPayload({ roots, transaction, log }, raw);
});
