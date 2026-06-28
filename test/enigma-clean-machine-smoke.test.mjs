import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));

async function runSmoke(args = []) {
  const { stdout } = await execFileAsync(process.execPath, ['scripts/run-clean-machine-smoke.mjs', '--json', ...args], {
    cwd: PROJECT_ROOT,
    timeout: 30000,
    windowsHide: true,
  });
  return JSON.parse(stdout);
}

test('clean-machine smoke report uses the expected schema', async () => {
  const report = await runSmoke();
  assert.equal(report.schema, 'enigma.clean_machine_smoke.v1');
  assert.match(report.generated_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  assert.equal(typeof report.app_version, 'string');
  assert.equal(typeof report.platform, 'string');
  assert.equal(typeof report.arch, 'string');
});

test('clean-machine smoke summary matches scenario statuses', async () => {
  const report = await runSmoke();
  assert.ok(Array.isArray(report.scenarios));
  assert.ok(report.scenarios.length > 0);

  const counts = { pass: 0, fail: 0, skip: 0 };
  for (const scenario of report.scenarios) {
    assert.ok(['pass', 'fail', 'skip'].includes(scenario.status), `${scenario.scenario_id} has invalid status ${scenario.status}`);
    counts[scenario.status] += 1;
  }

  assert.deepEqual(report.summary.counts, counts);
  assert.equal(report.summary.total, report.scenarios.length);
  assert.equal(typeof report.summary.healthy, 'boolean');
});

test('clean-machine smoke evidence is public-safe', async () => {
  const report = await runSmoke();
  const text = JSON.stringify(report);
  assert.ok(!text.includes(os.homedir()), 'report must not contain the real home directory');
  assert.ok(!/[A-Za-z]:\\Users\\[^\\]+/.test(text), 'report must not contain real Windows user profile paths');
});

test('clean-machine smoke can write report to a file', async () => {
  const tmpFile = path.join(os.tmpdir(), `enigma-smoke-test-${Date.now()}.json`);
  await runSmoke(['--out', tmpFile]);
  try {
    const written = await readFile(tmpFile, 'utf8');
    const parsed = JSON.parse(written);
    assert.equal(parsed.schema, 'enigma.clean_machine_smoke.v1');
  } finally {
    await unlink(tmpFile).catch(() => {});
  }
});
