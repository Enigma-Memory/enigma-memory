import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { CLEAN_MACHINE_SMOKE_PLAN_SCHEMA, CLEAN_MACHINE_SMOKE_SCHEMA, buildCleanMachineSmokePlan, publicSafePath, renderSmokePlain, renderSmokePlanPlain, runSmoke } from '../scripts/run-clean-machine-smoke.mjs';

const execFileAsync = promisify(execFile);
const SCRIPT = resolve('scripts/run-clean-machine-smoke.mjs');

test('clean-machine public path labels do not expose local absolute paths', () => {
  assert.equal(publicSafePath('C:\\Users\\Alice\\AppData\\Local\\Enigma Memory\\app.exe', '<app-binary-path>'), '<app-binary-path>');
  assert.equal(publicSafePath('/home/alice/.config/enigma-desktop', '<memory-drive-data-path>'), '<memory-drive-data-path>');
  assert.equal(publicSafePath('/Applications/Enigma Memory.app', '<app-binary-path>'), '<app-binary-path>');
  assert.equal(publicSafePath('relative/report.json', '<local-path>'), 'relative/report.json');
});

test('clean-machine smoke report is public-safe even when local checks fail', async () => {
  const previousManifestUrl = process.env.UPDATER_MANIFEST_URL;
  process.env.UPDATER_MANIFEST_URL = 'http://127.0.0.1:9/manifest.json';
  try {
    const report = await runSmoke();
    const serialized = JSON.stringify(report);

    assert.equal(report.schema, CLEAN_MACHINE_SMOKE_SCHEMA);
    const pkg = JSON.parse(await readFile('package.json', 'utf8'));
    assert.equal(report.app_version, pkg.version);
    assert.equal(report.summary.total, 6);
    assert.equal(report.summary.healthy, report.summary.counts.fail === 0);
    assert.doesNotMatch(serialized, /C:\\Users\\|\/home\/|\/tmp\/|AppData\\Local/i);
    assert.doesNotMatch(serialized, /raw memory|prompt:|transcript:|provider_response|api[_-]?key|password/i);
    assert.ok(report.scenarios.every((scenario) => ['pass', 'fail', 'skip'].includes(scenario.status)));
    assert.ok(report.scenarios.some((scenario) => scenario.scenario_id === 'SMOKE-MEMORY-DRIVE-001' && scenario.name === 'Memory Drive data directory exists'));
    assert.equal(serialized.includes('Local vault'), false);
  } finally {
    if (previousManifestUrl === undefined) {
      delete process.env.UPDATER_MANIFEST_URL;
    } else {
      process.env.UPDATER_MANIFEST_URL = previousManifestUrl;
    }
  }
});

test('clean-machine smoke plain output is readable and path-redacted', async () => {
  const previousManifestUrl = process.env.UPDATER_MANIFEST_URL;
  process.env.UPDATER_MANIFEST_URL = 'http://127.0.0.1:9/manifest.json';
  try {
    const report = await runSmoke();
    const plain = renderSmokePlain(report);

    assert.match(plain, /^Enigma clean-machine smoke\n/);
    assert.match(plain, /Status: Needs attention|Status: Ready/);
    assert.match(plain, /Scenarios: 6/);
    assert.match(plain, /Scenario: SMOKE-INSTALL-001/);
    assert.match(plain, /Boundary: local clean-machine smoke evidence only/);
    assert.match(plain, /Scenario: SMOKE-MEMORY-DRIVE-001/);
    assert.doesNotMatch(plain, /SMOKE-VAULT|Local vault/i);
    assert.doesNotMatch(plain, /^\s*\{/);
    assert.doesNotMatch(plain, /C:\\Users\\|\/home\/|\/tmp\/|AppData\\Local/i);
    assert.doesNotMatch(plain, /raw_memory|prompt:|transcript:|provider_response|api[_-]?key|password/i);
  } finally {
    if (previousManifestUrl === undefined) {
      delete process.env.UPDATER_MANIFEST_URL;
    } else {
      process.env.UPDATER_MANIFEST_URL = previousManifestUrl;
    }
  }
});


test('clean-machine smoke CLI writes public-safe report', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-clean-machine-smoke-'));
  const out = join(dir, 'smoke.json');
  const { stdout, stderr } = await execFileAsync(process.execPath, [SCRIPT, '--json', '--out', out], {
    windowsHide: true,
    env: { ...process.env, UPDATER_MANIFEST_URL: 'http://127.0.0.1:9/manifest.json' },
  });

  assert.equal(stderr.trim(), '');
  const printed = JSON.parse(stdout);
  const written = JSON.parse(await readFile(out, 'utf8'));
  assert.deepEqual(printed, written);
  assert.equal(printed.schema, CLEAN_MACHINE_SMOKE_SCHEMA);
  assert.equal(JSON.stringify(printed).includes(dir), false);
});

test('clean-machine smoke CLI plain stdout writes JSON evidence separately', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-clean-machine-smoke-plain-'));
  const out = join(dir, 'smoke.json');
  const { stdout, stderr } = await execFileAsync(process.execPath, [SCRIPT, '--plain', '--out', out], {
    windowsHide: true,
    env: { ...process.env, UPDATER_MANIFEST_URL: 'http://127.0.0.1:9/manifest.json' },
  });

  assert.equal(stderr.trim(), '');
  assert.match(stdout, /^Enigma clean-machine smoke\n/);
  assert.match(stdout, /Boundary: local clean-machine smoke evidence only/);
  assert.doesNotMatch(stdout, /^\s*\{/);
  const written = JSON.parse(await readFile(out, 'utf8'));
  assert.equal(written.schema, CLEAN_MACHINE_SMOKE_SCHEMA);
  assert.equal(stdout.includes(dir), false);
  assert.equal(stdout.includes(out), false);
});

test('clean-machine smoke dry-run plan is public-safe and non-inspecting', () => {
  const plan = buildCleanMachineSmokePlan(new Date('2026-06-23T12:00:00.000Z'));
  const plain = renderSmokePlanPlain(plan);
  const serialized = JSON.stringify(plan);

  assert.equal(plan.schema, CLEAN_MACHINE_SMOKE_PLAN_SCHEMA);
  assert.equal(plan.safety.dry_run, true);
  assert.equal(plan.safety.system_inspection_performed, false);
  assert.equal(plan.safety.network_performed, false);
  assert.equal(plan.safety.release_action_performed, false);
  assert.match(plan.command, /npm run production:clean-machine-smoke -- --plain --out \.enigma\/public-beta\/clean-machine-smoke\.json/);
  assert.deepEqual(plan.steps.map((step) => step.step_id), [
    'install_desktop_app',
    'first_run_default_setup',
    'create_memory_drive',
    'connect_or_skip_client',
    'run_health_check',
    'export_public_safe_report',
  ]);
  assert.match(plan.steps.find((step) => step.step_id === 'create_memory_drive')?.expected_evidence ?? '', /Memory Drive data check/);
  assert.match(plan.steps.find((step) => step.step_id === 'first_run_default_setup')?.action ?? '', /default local setup path/);
  assert.match(plan.steps.find((step) => step.step_id === 'first_run_default_setup')?.expected_evidence ?? '', /pass\/fail notes only/);
  assert.deepEqual(plan.next_actions.map((action) => action.id), [
    'review_manual_steps',
    'run_real_smoke_after_review',
  ]);
  assert.equal(plan.next_actions.find((action) => action.id === 'run_real_smoke_after_review').command, 'npm run production:clean-machine-smoke -- --plain --out .enigma/public-beta/clean-machine-smoke.json');
  assert.doesNotMatch(serialized, /local vault/i);
  assert.match(plain, /^Enigma clean-machine smoke plan\n/);
  assert.match(plain, /Step: install_desktop_app/);
  assert.match(plain, /Step: first_run_default_setup/);
  assert.match(plain, /Action: .*default local setup path/);
  assert.match(plain, /Evidence: .*pass\/fail notes only/);
  assert.match(plain, /Next action: review_manual_steps/);
  assert.match(plain, /Next command: npm run production:clean-machine-smoke -- --plain --out \.enigma\/public-beta\/clean-machine-smoke\.json/);
  assert.match(plain, /Boundary: plan only/);
  assert.doesNotMatch(plain, /^\s*\{/);
  assert.doesNotMatch(serialized, /C:\\Users\\|\/home\/|\/tmp\/|AppData\\Local/i);
  assert.doesNotMatch(serialized, /raw_memory|prompt:|transcript:|provider_response|api[_-]?key|password/i);
});

test('clean-machine smoke CLI dry-run writes plan without probing machine', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-clean-machine-smoke-plan-'));
  const out = join(dir, 'plan.json');
  const { stdout, stderr } = await execFileAsync(process.execPath, [SCRIPT, '--dry-run', '--plain', '--out', out], {
    windowsHide: true,
    env: { ...process.env, UPDATER_MANIFEST_URL: 'http://127.0.0.1:9/manifest.json' },
  });

  assert.equal(stderr.trim(), '');
  assert.match(stdout, /^Enigma clean-machine smoke plan\n/);
  assert.match(stdout, /no system inspection, network action, release action/);
  const written = JSON.parse(await readFile(out, 'utf8'));
  assert.equal(written.schema, CLEAN_MACHINE_SMOKE_PLAN_SCHEMA);
  assert.equal(written.safety.network_performed, false);
  assert.equal(stdout.includes(dir), false);
  assert.equal(stdout.includes(out), false);
});
