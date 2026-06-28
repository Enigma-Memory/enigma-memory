import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createImportBatchReceipt,
  createImportPreview,
  importChatGptExport,
  importClaudeMemory,
  importTextMemoryList,
} from '../packages/importers/src/index.js';
import { main } from '../apps/cli/bin/enigma.mjs';

const NOW = '2026-06-28T12:00:00.000Z';
const PRIVATE_MEMORY = 'private launch-code phrase remains local and is never in the preview';

test('import preview summarizes candidates without returning plaintext', () => {
  const report = importChatGptExport({
    complete: true,
    memories: [{ id: 'm1', memory: PRIVATE_MEMORY, confidence: 'high', kind: 'preference' }],
  }, { now: NOW });

  const preview = createImportPreview(report, { now: NOW });
  const serialized = JSON.stringify(preview);

  assert.equal(preview.schema, 'enigma.import_preview.v1');
  assert.equal(preview.generated_at, NOW);
  assert.equal(preview.report_count, 1);
  assert.equal(preview.candidate_count, 1);
  assert.deepEqual(preview.importers, ['importChatGptExport']);
  assert.deepEqual(preview.source_types, ['chatgpt_export']);
  assert.equal(preview.private_plaintext_boundary.raw_plaintext_returned, false);
  assert.equal(preview.private_plaintext_boundary.default_action, 'preview_only');
  assert.equal(preview.private_plaintext_boundary.write_requires_explicit_approval, true);
  assert.equal(preview.import_decision, 'needs_review');
  assert.equal(preview.primary_action.id, 'review_import_candidates');
  assert.equal(preview.primary_action.requires_explicit_approval, true);
  assert.equal(preview.preview_receipt.schema, 'enigma.import_preview_receipt.v1');
  assert.equal(preview.preview_receipt.preview_ref, `ref:import-preview:${preview.preview_id}`);
  assert.equal(preview.preview_receipt.raw_plaintext_returned, false);
  assert.equal(preview.preview_receipt.vault_write_performed, false);
  assert.equal(preview.candidates[0].candidate_ref.startsWith('ref:import-candidate:cand_'), true);
  assert.equal(preview.candidates[0].content_commitment.startsWith('sha256:'), true);
  assert.equal(preview.candidates[0].metadata_commitment.startsWith('sha256:'), true);
  assert.equal(preview.candidates[0].recommended_action, 'review_before_import');
  assert.equal(serialized.includes(PRIVATE_MEMORY), false);
  assert.equal(serialized.includes('memory_candidates'), false);
  assert.equal(serialized.includes('content":"'), false);
});

test('import preview combines reports and keeps action counts public-safe', () => {
  const chatgpt = importChatGptExport({
    complete: true,
    memories: [{ id: 'stable', memory: 'prefers local-first proof receipts', confidence: 'high', kind: 'preference', limitations: [] }],
    limitations: [],
  }, { now: NOW });
  chatgpt.limitations = [];
  chatgpt.memory_candidates[0].limitations = [];

  const claude = importClaudeMemory({
    complete: false,
    memories: [{ id: 'needs-review', memory: 'review this imported note before keeping it', confidence: 'low' }],
  }, { now: NOW });

  const preview = createImportPreview({ reports: [claude, chatgpt] }, { now: NOW });

  assert.equal(preview.report_count, 2);
  assert.equal(preview.candidate_count, 2);
  assert.deepEqual(preview.importers, ['importClaudeMemory', 'importChatGptExport']);
  assert.deepEqual(preview.source_types, ['claude_memory', 'chatgpt_export']);
  assert.equal(preview.counts.confidence.high, 1);
  assert.equal(preview.counts.confidence.low, 1);
  assert.equal(preview.counts.recommended_actions.ready_for_import, 1);
  assert.equal(preview.counts.recommended_actions.review_before_import, 1);
  assert.equal(preview.import_decision, 'needs_review');
  assert.equal(preview.primary_action.id, 'review_import_candidates');
  assert.equal(preview.preview_receipt.ready_for_import_count, 1);
  assert.equal(preview.preview_receipt.review_before_import_count, 1);
  assert.equal(preview.roots.report_root.startsWith('sha256:'), true);
  assert.equal(preview.roots.candidate_preview_root.startsWith('sha256:'), true);
  assert.equal(preview.roots.content_commitment_root.startsWith('sha256:'), true);
});

test('import preview exposes approve action only when every candidate is ready', () => {
  const report = importChatGptExport({
    complete: true,
    memories: [{ id: 'ready', memory: 'stable preference candidate', confidence: 'high', kind: 'preference', limitations: [] }],
    limitations: [],
  }, { now: NOW });
  report.limitations = [];
  report.memory_candidates[0].limitations = [];

  const preview = createImportPreview(report, { now: NOW });

  assert.equal(preview.import_decision, 'ready_for_import');
  assert.equal(preview.primary_action.id, 'approve_import');
  assert.equal(preview.primary_action.writes_vault, true);
  assert.equal(preview.preview_receipt.ready_for_import_count, 1);
  assert.equal(preview.preview_receipt.review_before_import_count, 0);
});

test('import preview groups duplicate candidate commitments without raw content', () => {
  const report = importTextMemoryList('- Same memory\n- Same memory\n- Different memory', {
    now: NOW,
    complete: true,
  });
  const preview = createImportPreview(report, { now: NOW });
  const serialized = JSON.stringify(preview);

  assert.equal(preview.candidate_count, 3);
  assert.equal(preview.import_decision, 'needs_review');
  assert.equal(preview.primary_action.id, 'review_import_candidates');
  assert.equal(preview.duplicate_groups.length, 1);
  assert.equal(preview.duplicate_groups[0].candidate_count, 2);
  assert.equal(preview.counts.dedupe.duplicate_group_count, 1);
  assert.equal(preview.counts.dedupe.duplicate_candidate_count, 2);
  assert.equal(preview.counts.dedupe.unique_content_count, 2);
  assert.equal(preview.preview_receipt.duplicate_group_count, 1);
  assert.equal(preview.candidates[0].is_duplicate, true);
  assert.equal(preview.candidates[1].duplicate_group_ref, preview.candidates[0].duplicate_group_ref);
  assert.equal(preview.candidates[2].is_duplicate, false);
  assert.equal(serialized.includes('Same memory'), false);
  assert.equal(serialized.includes('Different memory'), false);
});

test('text memory list importer supports curated txt and markdown without provider caveats', () => {
  const report = importTextMemoryList('- Prefers local-only memory\n2. Wants receipts before sharing\n# Project note', {
    now: NOW,
    complete: true,
  });
  const preview = createImportPreview(report, { now: NOW });

  assert.equal(report.schema, 'enigma.import_report.v1');
  assert.equal(report.importer, 'importTextMemoryList');
  assert.equal(report.source_type, 'curated_text');
  assert.equal(report.complete, true);
  assert.equal(report.recognized_candidate_count, 3);
  assert.equal(report.memory_candidates[0].content, 'Prefers local-only memory');
  assert.equal(report.memory_candidates[1].content, 'Wants receipts before sharing');
  assert.equal(report.memory_candidates[2].content, 'Project note');
  assert.equal(preview.import_decision, 'ready_for_import');
  assert.equal(preview.primary_action.id, 'approve_import');
  assert.equal(JSON.stringify(preview).includes('Prefers local-only memory'), false);
});

test('import preview handles empty input as a safe preview-only artifact', () => {
  const preview = createImportPreview(null, { now: NOW });

  assert.equal(preview.schema, 'enigma.import_preview.v1');
  assert.equal(preview.report_count, 0);
  assert.equal(preview.candidate_count, 0);
  assert.deepEqual(preview.candidates, []);
  assert.deepEqual(preview.counts.recommended_actions, { ready_for_import: 0, review_before_import: 0 });
  assert.equal(preview.private_plaintext_boundary.raw_plaintext_returned, false);
  assert.equal(preview.import_decision, 'empty');
  assert.equal(preview.primary_action.id, 'choose_import_file');
  assert.equal(preview.preview_receipt.candidate_count, 0);
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

test('CLI import prints a public-safe preview and redacts local paths', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-import-preview-cli-'));
  const source = join(dir, 'chatgpt-export.json');
  const out = join(dir, 'raw-report.json');
  await writeFile(source, `${JSON.stringify({ complete: true, memories: [{ id: 'm1', memory: PRIVATE_MEMORY, confidence: 'high' }] })}\n`, 'utf8');

  const io = makeIo();
  assert.equal(await main(['import', 'chatgpt', '--file', source, '--out', out], io.io), 0, io.stderr());
  const stdout = io.stdout();
  const preview = io.json();
  const rawReport = JSON.parse(await readFile(out, 'utf8'));

  assert.equal(preview.schema, 'enigma.import_preview.v1');
  assert.equal(preview.source_file, '<source-file>');
  assert.equal(preview.source_file_redacted, true);
  assert.equal(preview.raw_report_written, true);
  assert.equal(preview.report_out, '<out>');
  assert.equal(preview.claim_boundaries.raw_memory_printed, false);
  assert.equal(preview.preview_receipt.schema, 'enigma.import_preview_receipt.v1');
  assert.equal(preview.primary_action.requires_explicit_approval, true);
  assert.equal(stdout.includes(PRIVATE_MEMORY), false);
  assert.equal(stdout.includes(dir), false);
  assert.equal(rawReport.memory_candidates[0].content, PRIVATE_MEMORY);
});

test('CLI text import previews curated notes without raw note output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-import-text-preview-cli-'));
  const source = join(dir, 'memories.md');
  const note = 'Prefers import previews before vault writes';
  await writeFile(source, `- ${note}\n`, 'utf8');

  const io = makeIo();
  assert.equal(await main(['import', 'text', '--file', source, '--complete'], io.io), 0, io.stderr());
  const stdout = io.stdout();
  const preview = io.json();

  assert.equal(preview.schema, 'enigma.import_preview.v1');
  assert.deepEqual(preview.source_types, ['curated_text']);
  assert.equal(preview.import_decision, 'ready_for_import');
  assert.equal(preview.primary_action.id, 'approve_import');
  assert.equal(preview.vault_write_performed, false);
  assert.equal(stdout.includes(note), false);
  assert.equal(stdout.includes(dir), false);
});

test('CLI text import with write-vault returns sanitized batch receipt', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-import-text-write-cli-'));
  const bundle = join(dir, 'bundle.json');
  const reportOut = join(dir, 'raw-report.json');
  const source = join(dir, 'memories.md');
  const note = 'Vault write receipt should hide this note';
  await writeFile(source, `- ${note}\n`, 'utf8');

  const quickstart = makeIo();
  assert.equal(await main(['quickstart', '--bundle', bundle, '--overwrite'], quickstart.io), 0, quickstart.stderr());

  const io = makeIo();
  assert.equal(await main(['import', 'text', '--file', source, '--complete', '--write-vault', '--bundle', bundle, '--out', reportOut], io.io), 0, io.stderr());
  const stdout = io.stdout();
  const preview = io.json();

  assert.equal(preview.vault_write_performed, true);
  assert.equal(preview.import_batch_receipt.schema, 'enigma.import_batch_receipt.v1');
  assert.equal(preview.import_batch_receipt.write_count, 1);
  assert.equal(preview.import_batch_receipt.writes[0].write_ref.startsWith('ref:import-write:'), true);
  assert.equal(preview.import_batch_receipt.writes[0].memory_addr_commitment.startsWith('sha256:'), true);
  assert.equal(preview.import_batch_receipt.writes[0].receipt_hash.startsWith('sha256:'), true);
  assert.equal(preview.import_batch_receipt.claim_boundaries.raw_memory_returned, false);
  assert.equal(preview.import_batch_receipt.rollback_boundary.tombstone_or_undo_requires_local_vault_access, true);
  assert.equal(stdout.includes(note), false);
  assert.equal(stdout.includes(dir), false);

  const rollback = makeIo();
  assert.equal(await main(['import', 'rollback', '--file', reportOut, '--bundle', bundle, '--now', NOW], rollback.io), 0, rollback.stderr());
  const rollbackStdout = rollback.stdout();
  const rollbackReceipt = rollback.json();
  assert.equal(rollbackReceipt.schema, 'enigma.import_rollback_receipt.v1');
  assert.equal(rollbackReceipt.requested_write_count, 1);
  assert.equal(rollbackReceipt.tombstoned_count, 1);
  assert.equal(rollbackReceipt.skipped_count, 0);
  assert.equal(rollbackReceipt.tombstones[0].memory_addr_commitment, preview.import_batch_receipt.writes[0].memory_addr_commitment);
  assert.equal(rollbackReceipt.tombstones[0].receipt_hash.startsWith('sha256:'), true);
  assert.equal(rollbackReceipt.claim_boundaries.raw_memory_returned, false);
  assert.equal(rollbackStdout.includes(note), false);
  assert.equal(rollbackStdout.includes(dir), false);

  const rollbackAgain = makeIo();
  assert.equal(await main(['import', 'rollback', '--file', reportOut, '--bundle', bundle, '--now', NOW], rollbackAgain.io), 0, rollbackAgain.stderr());
  const secondReceipt = rollbackAgain.json();
  assert.equal(secondReceipt.tombstoned_count, 0);
  assert.equal(secondReceipt.skipped_count, 1);
  assert.equal(secondReceipt.skipped[0].reason_code, 'already_tombstoned');
});

test('import batch receipt handles preview-only reports without raw content', () => {
  const report = importTextMemoryList('- Receipt preview only', { now: NOW, complete: true });
  const receipt = createImportBatchReceipt(report, { now: NOW });
  const serialized = JSON.stringify(receipt);

  assert.equal(receipt.schema, 'enigma.import_batch_receipt.v1');
  assert.equal(receipt.write_count, 0);
  assert.equal(receipt.claim_boundaries.raw_memory_returned, false);
  assert.equal(serialized.includes('Receipt preview only'), false);
});
