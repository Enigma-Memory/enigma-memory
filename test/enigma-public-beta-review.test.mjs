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

test('public beta review writes manifest and matrix while treating missing evidence as blockers', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-public-beta-review-'));
  try {
    const result = await runPublicBetaReview({ outDir: dir });
    assert.equal(result.schema, 'enigma.public_beta_review.v1');
    assert.equal(result.ok, true);
    assert.equal(result.public_safe, true);
    assert.equal(result.evidence_files_used, 0);
    assert.equal(result.matrix.advisor_decision, 'hold');
    assert.equal(result.matrix.summary.ready_for_public_beta, false);
    assert.equal(result.safety.release_action_performed, false);
    assert.equal(result.safety.network_performed, false);
    assert.equal(result.paths.manifest, '<public-beta-evidence-manifest>');
    assert.equal(result.paths.matrix, '<public-beta-qa-matrix>');

    const manifest = JSON.parse(await readFile(join(dir, 'evidence-manifest.json'), 'utf8'));
    const matrix = JSON.parse(await readFile(join(dir, 'qa-matrix.json'), 'utf8'));
    assert.equal(manifest.schema, 'enigma.public_beta_evidence_manifest.v1');
    assert.equal(matrix.schema, 'enigma.public_beta_qa_matrix.v1');
    assert.equal(matrix.advisor_decision, 'hold');
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
