import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  existingEvidenceOptionsFromManifest,
  parseArgs,
  renderPublicBetaReviewPlain,
  runCli,
  runPublicBetaReview,
} from '../scripts/run-public-beta-review.mjs';

test('public beta review parser defaults to one-command plain review', () => {
  assert.deepEqual(parseArgs([]), { outDir: '.enigma/public-beta', plain: true, json: false, help: false });
  assert.deepEqual(parseArgs(['--json', '--out-dir', '.out/review']), { outDir: '.out/review', plain: false, json: true, help: false });
  assert.throws(() => parseArgs(['--out-dir']), /Missing value/);
});

test('public beta review writes generated support dry-run blockers and keeps external blockers explicit', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-public-beta-review-'));
  try {
    const result = await runPublicBetaReview({ outDir: dir });
    assert.equal(result.schema, 'enigma.public_beta_review.v1');
    assert.equal(result.ok, true);
    assert.equal(result.public_safe, true);
    assert.equal(result.evidence_files_used, 2);
    assert.equal(result.generated_evidence_files, 2);
    assert.equal(result.generated_plan_files, 1);
    assert.deepEqual(result.generated_evidence_items, ['EV-P10-SUPPORT-DRY-RUN-SUMMARY']);
    assert.equal(result.matrix.advisor_decision, 'hold');
    assert.equal(result.matrix.summary.ready_for_public_beta, false);
    assert.equal(result.matrix.next_actions.some((action) => action.action_id === 'record_support_dry_run'), true);
    assert.equal(result.safety.release_action_performed, false);
    assert.equal(result.safety.network_performed, false);
    assert.equal(result.safety.generated_support_dry_run_public_safe, true);
    assert.equal(result.safety.generated_clean_machine_plan_public_safe, true);
    assert.equal(result.paths.manifest, '<public-beta-evidence-manifest>');
    assert.equal(result.paths.matrix, '<public-beta-qa-matrix>');

    const manifest = JSON.parse(await readFile(join(dir, 'evidence-manifest.json'), 'utf8'));
    const diagnosticSupport = JSON.parse(await readFile(join(dir, 'support-dry-run-diagnostics.json'), 'utf8'));
    const crashSupport = JSON.parse(await readFile(join(dir, 'support-dry-run-crash.json'), 'utf8'));
    const cleanMachinePlan = JSON.parse(await readFile(join(dir, 'clean-machine-smoke-plan.json'), 'utf8'));
    const matrix = JSON.parse(await readFile(join(dir, 'qa-matrix.json'), 'utf8'));
    assert.equal(manifest.schema, 'enigma.public_beta_evidence_manifest.v1');
    assert.equal(manifest.clean_machine_smoke_plan, '.enigma/public-beta/clean-machine-smoke-plan.json');
    assert.equal(diagnosticSupport.schema, 'enigma.support_dry_run_summary.v1');
    assert.equal(diagnosticSupport.scenario_id, 'BETA-DIAG-001');
    assert.equal(diagnosticSupport.triage_result, 'blocked');
    assert.equal(diagnosticSupport.bundle_privacy_check_status, 'blocked');
    assert.equal(diagnosticSupport.privacy_review.status, 'hold');
    assert.equal(crashSupport.schema, 'enigma.support_dry_run_summary.v1');
    assert.equal(crashSupport.scenario_id, 'BETA-CRASH-001');
    assert.equal(crashSupport.triage_result, 'blocked');
    assert.equal(crashSupport.bundle_privacy_check_status, 'blocked');
    assert.equal(crashSupport.privacy_review.status, 'hold');
    assert.equal(cleanMachinePlan.schema, 'enigma.clean_machine_smoke_plan.v1');
    assert.equal(cleanMachinePlan.safety.network_performed, false);
    assert.equal(cleanMachinePlan.safety.system_inspection_performed, false);
    assert.equal(matrix.schema, 'enigma.public_beta_qa_matrix.v1');
    assert.equal(matrix.advisor_decision, 'hold');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('public beta review aligns template and advisor commands with relative out-dir', async () => {
  const dir = `.enigma/public-beta-review-relative-${process.pid}-${Date.now()}`;
  try {
    const result = await runPublicBetaReview({ outDir: dir });
    const plain = renderPublicBetaReviewPlain(result);
    assert.equal(result.template_command, `npm run public-beta:evidence-templates -- --out-dir ${dir} --plain`);
    assert.equal(result.matrix.evidence_manifest, `${dir}/evidence-manifest.json`);
    assert.equal(result.matrix.next_actions.find((action) => action.action_id === 'approve_merge_release_pr').collect_next.target_file, `${dir}/production-handoff-packet.json`);
    assert.equal(result.matrix.next_actions.find((action) => action.action_id === 'publish_npm_0_1_19').collect_next.target_file, `${dir}/registry-install.json`);
    assert.match(plain, new RegExp(`Templates: npm run public-beta:evidence-templates -- --out-dir ${dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} --plain`));
    assert.match(plain, new RegExp(`Collect: npm run public-beta:evidence-manifest -- --out ${dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/evidence-manifest\\.json --plain`));
    assert.match(plain, new RegExp(`Review: npm run public-beta:advisor -- --evidence-manifest ${dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/evidence-manifest\\.json`));
    assert.match(plain, new RegExp(`Collect next: approve_merge_release_pr .* into ${dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/production-handoff-packet\\.json`));
    assert.match(plain, new RegExp(`Collect next: publish_npm_0_1_19 .* into ${dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/registry-install\\.json`));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('public beta review plain output is bounded and path-redacted', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-public-beta-review-'));
  try {
    let stdout = '';
    const code = await runCli(['--out-dir', dir], { stdout: { write: (chunk) => { stdout += chunk; } } });
    assert.equal(code, 0);
    assert.match(stdout, /^Enigma public beta review\n/);
    assert.match(stdout, /Decision: HOLD/);
    assert.match(stdout, /Enigma public beta QA advisor/);
    assert.match(stdout, /Generated support dry-runs: 2/);
    assert.match(stdout, /Generated clean-machine plan: 1/);
    assert.match(stdout, /Templates: npm run public-beta:evidence-templates -- --out-dir \.enigma\/public-beta --plain/);
    assert.match(stdout, /record_support_dry_run/);
    assert.match(stdout, /Boundary: one-command local review only/);
    assert.doesNotMatch(stdout, /^\s*\{/);
    assert.equal(stdout.includes(dir), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('public beta review uses only existing evidence files from manifest', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-public-beta-review-'));
  try {
    const smoke = join(dir, 'smoke.json');
    await import('node:fs/promises').then(({ writeFile }) => writeFile(smoke, '{}\n', 'utf8'));
    const options = await existingEvidenceOptionsFromManifest({
      clean_machine_smoke: smoke,
      registry_install: join(dir, 'missing-registry.json'),
      support_dry_run: [join(dir, 'missing-support.json')],
    });
    assert.equal(options.cleanMachineSmoke, smoke);
    assert.equal(options.registryInstall, undefined);
    assert.deepEqual(options.supportDryRun, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
