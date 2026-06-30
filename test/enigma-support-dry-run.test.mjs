import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import {
  buildSupportDryRunSummary,
  buildSupportArtifactSnapshot,
  parseSupportDryRunArgs,
  renderSupportDryRunPlain,
  readSupportArtifactSnapshot,
  SUPPORT_DRY_RUN_COLLECTION_GUIDANCE,
  SUPPORT_DRY_RUN_PRESETS,
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
  assert.equal(summary.privacy_scan.schema, 'enigma.support_privacy_scan.v1');
  assert.equal(summary.privacy_scan.status, 'pass');
  assert.equal(summary.privacy_scan.detected_private_field_count, 0);
  assert.ok(summary.privacy_scan.checked_categories.includes('memory_bodies'));
  assert.deepEqual(summary.collection_guidance.triage_result_values, SUPPORT_DRY_RUN_COLLECTION_GUIDANCE.triage_result_values);
  assert.deepEqual(summary.collection_guidance.bundle_privacy_check_status_values, SUPPORT_DRY_RUN_COLLECTION_GUIDANCE.bundle_privacy_check_status_values);
  assert.deepEqual(summary.collection_guidance.collection_steps, SUPPORT_DRY_RUN_COLLECTION_GUIDANCE.collection_steps);
  assert.equal(summary.collection_guidance.support_artifact_input, 'optional_redacted_allowlisted_json_snapshot_hash_only');
  assert.equal(summary.claim_boundaries.public_beta_ready, false);
  assert.equal(summary.claim_boundaries.production_ready, false);
  assert.equal(summary.claim_boundaries.provider_deletion_proof, false);
  assert.doesNotMatch(serialized, /raw memory|prompt:|transcript:|C:\\Users|\/home\//i);
});

test('support dry-run summary ingests redacted support artifacts only by hash and allowlist', () => {
  const supportArtifact = {
    schema: 'enigma.support_summary.v1',
    ok: false,
    setup_status: { state: 'setup_needed', reasons: ['bundle_missing'] },
    support_code: 'ref:support-summary:abcdef0123456789abcdef0123456789',
    issue_codes: ['bundle_missing', 'connector_missing_bundle'],
    redaction: {
      raw_memory_included: false,
      prompts_included: false,
      transcripts_included: false,
      credentials_included: false,
      provider_responses_included: false,
      local_paths_redacted: true,
    },
    privacy_scan: {
      schema: 'enigma.support_privacy_scan.v1',
      status: 'pass',
      checked_categories: ['memory_bodies', 'user_inputs', 'dialogue_records'],
      detected_private_field_count: 0,
      redacted_private_field_count: 3,
      local_paths_hidden: true,
      public_safe_summary_only: true,
    },
    claim_boundaries: {
      provider_deletion_proof: false,
      model_forgetting_proof: false,
      hosted_saas_live: false,
    },
  };

  const snapshot = buildSupportArtifactSnapshot(supportArtifact);
  const summary = buildSupportDryRunSummary({ ...BASE, support_artifact: supportArtifact });

  assert.equal(snapshot.schema, 'enigma.support_summary.v1');
  assert.match(snapshot.artifact_hash, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(snapshot.issue_codes, ['bundle_missing', 'connector_missing_bundle']);
  assert.equal(summary.support_artifact.artifact_hash, snapshot.artifact_hash);
  assert.equal(summary.support_artifact.setup_state, 'setup_needed');
  assert.equal(summary.support_artifact.redaction.credentials_included, false);
  assert.equal(summary.support_artifact.claim_boundaries.provider_deletion_proof, false);
  assert.equal(snapshot.privacy_scan.status, 'pass');
  assert.equal(summary.support_artifact.privacy_scan.redacted_private_field_count, 3);
  assert.equal(summary.privacy_scan.support_artifact_attached, true);
  assert.equal(JSON.stringify(summary).includes('setup_status'), false);
});

test('support dry-run summary rejects unsafe support artifact content', () => {
  assert.throws(
    () => buildSupportArtifactSnapshot({
      schema: 'enigma.support_summary.v1',
      support_code: 'ref:support-summary:unsafe',
      issue_codes: ['bundle_missing'],
      local_path: 'C:\\Users\\Alice\\bundle.json',
    }),
    /support artifact is not public-safe/,
  );
  assert.throws(
    () => buildSupportArtifactSnapshot({ schema: 'enigma.unknown.v1' }),
    /support artifact schema is not supported/,
  );
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

test('support dry-run plain output is readable and writes JSON evidence separately', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-support-dry-run-plain-'));
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
    '--plain',
  ], { windowsHide: true });

  assert.equal(stderr.trim(), '');
  assert.match(stdout, /^Enigma support dry-run\n/);
  assert.match(stdout, /Status: Ready/);
  assert.match(stdout, /Evidence item: EV-P10-SUPPORT-DRY-RUN-SUMMARY/);
  assert.match(stdout, /Scenario: BETA-DIAG-001/);
  assert.match(stdout, /Bundle privacy check: pass/);
  assert.match(stdout, /Boundary: public-safe support dry-run evidence only/);
  assert.match(stdout, /Privacy scan: pass \(0 finding\(s\), 8 categories checked\)/);
  assert.match(stdout, /Allowed triage values: resolved, needs_user_action, escalated, release_blocker, blocked/);
  assert.match(stdout, /Allowed privacy statuses: pass, fail, blocked, not_applicable/);
  assert.match(stdout, /Collection steps: run_selected_preset_with_observed_triage_result, record_bundle_privacy_check_status_from_redaction_review, attach_redacted_allowlisted_support_artifact_only_when_available, keep_private_material_out_of_public_artifact/);
  assert.match(stdout, /Support artifact: none \(optional_redacted_allowlisted_json_snapshot_hash_only\)/);
  assert.doesNotMatch(stdout, /^\s*\{/);
  assert.equal(stdout.includes(dir), false);
  assert.equal(stdout.includes(out), false);
  const written = JSON.parse(await readFile(out, 'utf8'));
  assert.equal(written.schema, SUPPORT_DRY_RUN_SUMMARY_SCHEMA);
});

test('support dry-run plain renderer summarizes attached artifact by hash only', () => {
  const summary = buildSupportDryRunSummary({
    ...BASE,
    support_artifact: {
      schema: 'enigma.diagnostics.v1',
      app_version: '0.1.19',
      service_running: true,
      memory_drive_status: 'healthy',
      issue_codes: ['DIAG-BUNDLE-PREVIEWED'],
    },
  });
  const plain = renderSupportDryRunPlain(summary);

  assert.match(plain, /^Enigma support dry-run\n/);
  assert.match(plain, /Support artifact: attached by hash/);
  assert.match(plain, /Allowed privacy statuses: pass, fail, blocked, not_applicable/);
  assert.match(plain, /Collection steps: run_selected_preset_with_observed_triage_result/);
  assert.doesNotMatch(plain, /memory_drive_status|service_running|C:\\Users|\/home\/|\/tmp\//i);
});

test('support dry-run CLI reads a redacted support artifact without leaking its path', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-support-artifact-'));
  const artifactPath = join(dir, 'support-summary.json');
  const artifact = {
    schema: 'enigma.diagnostics.v1',
    generated_at: '2026-06-28T12:00:00.000Z',
    app_version: '0.1.19',
    service_running: true,
    memory_drive_status: 'healthy',
    issue_codes: ['DIAG-BUNDLE-PREVIEWED'],
  };
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

  const { stdout, stderr } = await execFileAsync(process.execPath, [
    SCRIPT,
    '--scenario-id', BASE.scenario_id,
    '--issue-code', BASE.issue_code,
    '--triage-result', BASE.triage_result,
    '--bundle-privacy-check-status', BASE.bundle_privacy_check_status,
    '--support-owner-ref', BASE.support_owner_ref,
    '--generated-at', BASE.generated_at,
    '--support-artifact', artifactPath,
    '--json',
  ], { windowsHide: true });

  assert.equal(stderr.trim(), '');
  const printed = JSON.parse(stdout);
  const snapshot = await readSupportArtifactSnapshot(artifactPath);
  assert.equal(printed.support_artifact.schema, 'enigma.diagnostics.v1');
  assert.equal(printed.support_artifact.artifact_hash, snapshot.artifact_hash);
  assert.equal(printed.support_artifact.memory_drive_status, 'healthy');
  assert.equal(printed.support_artifact.service_running, true);
  assert.equal(JSON.stringify(printed).includes(dir), false);
});

test('support dry-run argument parser recognizes required fields', () => {
  const parsed = parseSupportDryRunArgs([
    '--scenario-id', BASE.scenario_id,
    '--issue-code', BASE.issue_code,
    '--triage-result', BASE.triage_result,
    '--bundle-privacy-check-status', BASE.bundle_privacy_check_status,
    '--support-owner-ref', BASE.support_owner_ref,
    '--plain',
    '--support-artifact', 'support-summary.json',
  ]);

  assert.equal(parsed.scenario_id, BASE.scenario_id);
  assert.equal(parsed.issue_code, BASE.issue_code);
  assert.equal(parsed.triage_result, BASE.triage_result);
  assert.equal(parsed.bundle_privacy_check_status, BASE.bundle_privacy_check_status);
  assert.equal(parsed.support_owner_ref, BASE.support_owner_ref);
  assert.equal(parsed.plain, true);
  assert.equal(parsed.support_artifact, 'support-summary.json');
});

test('support dry-run presets fill public defaults without greenwashing privacy', () => {
  const parsed = parseSupportDryRunArgs([
    '--preset', 'diagnostics',
    '--triage-result', 'needs_user_action',
    '--bundle-privacy-check-status', 'blocked',
    '--plain',
  ]);
  const summary = buildSupportDryRunSummary({ ...parsed, generated_at: BASE.generated_at });

  assert.equal(parsed.preset, 'diagnostics');
  assert.equal(parsed.scenario_id, SUPPORT_DRY_RUN_PRESETS.diagnostics.scenario_id);
  assert.equal(parsed.issue_code, SUPPORT_DRY_RUN_PRESETS.diagnostics.issue_code);
  assert.equal(parsed.support_owner_ref, SUPPORT_DRY_RUN_PRESETS.diagnostics.support_owner_ref);
  assert.equal(parsed.triage_result, 'needs_user_action');
  assert.equal(parsed.bundle_privacy_check_status, 'blocked');
  assert.equal(summary.bundle_privacy_check_status, 'blocked');
  assert.equal(summary.privacy_review.status, 'hold');
});

test('support dry-run scenario alias selects matching preset defaults', () => {
  const parsed = parseSupportDryRunArgs([
    '--scenario', 'BETA-CRASH-001',
    '--triage-result', 'blocked',
    '--bundle-privacy-check-status', 'not_applicable',
  ]);

  assert.equal(parsed.preset, 'crash');
  assert.equal(parsed.scenario_id, SUPPORT_DRY_RUN_PRESETS.crash.scenario_id);
  assert.equal(parsed.issue_code, SUPPORT_DRY_RUN_PRESETS.crash.issue_code);
  assert.equal(parsed.support_owner_ref, SUPPORT_DRY_RUN_PRESETS.crash.support_owner_ref);
  assert.equal(parsed.bundle_privacy_check_status, 'not_applicable');
});

test('support dry-run presets reject unsafe or incomplete automation', () => {
  assert.throws(
    () => parseSupportDryRunArgs([
      '--preset', 'unknown',
      '--triage-result', 'blocked',
      '--bundle-privacy-check-status', 'blocked',
    ]),
    /Unsupported support dry-run preset/,
  );
  assert.throws(
    () => parseSupportDryRunArgs([
      '--preset', 'diagnostics',
      '--scenario', 'BETA-CRASH-001',
      '--triage-result', 'blocked',
      '--bundle-privacy-check-status', 'blocked',
    ]),
    /--preset does not match --scenario-id/,
  );
  assert.throws(
    () => buildSupportDryRunSummary(parseSupportDryRunArgs([
      '--preset', 'diagnostics',
      '--bundle-privacy-check-status', 'blocked',
    ])),
    /Missing required triage_result/,
  );
});

test('support dry-run CLI accepts presets while keeping blocked privacy non-green', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-support-dry-run-preset-'));
  const out = join(dir, 'crash-summary.json');
  let failure;

  try {
    await execFileAsync(process.execPath, [
      SCRIPT,
      '--preset', 'crash',
      '--triage-result', 'blocked',
      '--bundle-privacy-check-status', 'blocked',
      '--generated-at', BASE.generated_at,
      '--out', out,
      '--json',
    ], { windowsHide: true });
  } catch (error) {
    failure = error;
  }

  assert.equal(failure?.code, 1);
  assert.equal(failure.stderr.trim(), '');
  const printed = JSON.parse(failure.stdout);
  const written = JSON.parse(await readFile(out, 'utf8'));
  assert.deepEqual(printed, written);
  assert.equal(printed.scenario_id, 'BETA-CRASH-001');
  assert.equal(printed.issue_code, 'CRASH-REPORTING-MANUAL-EVIDENCE');
  assert.equal(printed.bundle_privacy_check_status, 'blocked');
  assert.equal(printed.privacy_review.status, 'hold');
  assert.equal(JSON.stringify(printed).includes(dir), false);
});
