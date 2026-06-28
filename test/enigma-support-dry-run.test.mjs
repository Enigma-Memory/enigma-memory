import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import {
  buildSupportDryRunSummary,
  parseSupportDryRunArgs,
  SUPPORT_DRY_RUN_EVIDENCE_ITEM_ID,
  SUPPORT_DRY_RUN_SUMMARY_SCHEMA,
} from '../scripts/build-support-dry-run-summary.mjs';

const execFileAsync = promisify(execFile);
const SCRIPT = resolve('scripts/build-support-dry-run-summary.mjs');
const BASE = Object.freeze({
  scenario_id: 'BETA-DIAG-001',
  issue_code: 'DIAG-BUNDLE-PREVIEWED',
  triage_result: 'needs_user_action',
  bundle_privacy_check_status: 'pass',
  support_owner_ref: 'ref:role:beta-support',
  generated_at: '2026-06-28T12:00:00.000Z',
});

test('support dry-run summary is public-safe and claim-bounded', () => {
  const summary = buildSupportDryRunSummary(BASE);
  const serialized = JSON.stringify(summary);

  assert.equal(summary.schema, SUPPORT_DRY_RUN_SUMMARY_SCHEMA);
  assert.equal(summary.evidence_item_id, SUPPORT_DRY_RUN_EVIDENCE_ITEM_ID);
  assert.equal(summary.scenario_id, 'BETA-DIAG-001');
  assert.equal(summary.issue_code, 'DIAG-BUNDLE-PREVIEWED');
  assert.equal(summary.triage_result, 'needs_user_action');
  assert.equal(summary.bundle_privacy_check_status, 'pass');
  assert.equal(summary.support_owner_ref, 'ref:role:beta-support');
  assert.equal(summary.privacy_review.status, 'pass');
  assert.equal(summary.privacy_review.raw_logs_included, false);
  assert.equal(summary.privacy_review.transcripts_included, false);
  assert.equal(summary.privacy_review.local_absolute_paths_included, false);
  assert.equal(summary.claim_boundaries.public_beta_ready, false);
  assert.equal(summary.claim_boundaries.production_ready, false);
  assert.equal(summary.claim_boundaries.provider_deletion_proof, false);
  assert.doesNotMatch(serialized, /raw memory|prompt:|transcript:|C:\\Users|\/home\//i);
});

test('support dry-run summary rejects unsafe inputs before output', () => {
  assert.throws(
    () => buildSupportDryRunSummary({ ...BASE, issue_code: 'DIAG-BUNDLE-PREVIEWED C:\\Users\\Alice' }),
    /issue_code is not public-safe/,
  );
  assert.throws(
    () => buildSupportDryRunSummary({ ...BASE, support_owner_ref: 'Alice Example' }),
    /support_owner_ref must be an opaque role ref/,
  );
  assert.throws(
    () => buildSupportDryRunSummary({ ...BASE, triage_result: 'shipped' }),
    /triage_result is not supported/,
  );
});

test('support dry-run CLI writes the same public-safe JSON artifact', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-support-dry-run-'));
  const out = join(dir, 'summary.json');

  const { stdout, stderr } = await execFileAsync(process.execPath, [
    SCRIPT,
    '--scenario-id', BASE.scenario_id,
    '--issue-code', BASE.issue_code,
    '--triage-result', BASE.triage_result,
    '--bundle-privacy-check-status', BASE.bundle_privacy_check_status,
    '--support-owner-ref', BASE.support_owner_ref,
    '--generated-at', BASE.generated_at,
    '--out', out,
    '--json',
  ], { windowsHide: true });

  assert.equal(stderr.trim(), '');
  const printed = JSON.parse(stdout);
  const written = JSON.parse(await readFile(out, 'utf8'));
  assert.deepEqual(printed, written);
  assert.equal(printed.schema, SUPPORT_DRY_RUN_SUMMARY_SCHEMA);
  assert.equal(JSON.stringify(printed).includes(dir), false);
});

test('support dry-run argument parser recognizes required fields', () => {
  const parsed = parseSupportDryRunArgs([
    '--scenario-id', BASE.scenario_id,
    '--issue-code', BASE.issue_code,
    '--triage-result', BASE.triage_result,
    '--bundle-privacy-check-status', BASE.bundle_privacy_check_status,
    '--support-owner-ref', BASE.support_owner_ref,
    '--json',
  ]);

  assert.equal(parsed.scenario_id, BASE.scenario_id);
  assert.equal(parsed.issue_code, BASE.issue_code);
  assert.equal(parsed.triage_result, BASE.triage_result);
  assert.equal(parsed.bundle_privacy_check_status, BASE.bundle_privacy_check_status);
  assert.equal(parsed.support_owner_ref, BASE.support_owner_ref);
  assert.equal(parsed.json, true);
});
