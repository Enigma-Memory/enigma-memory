import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { CLEAN_MACHINE_SMOKE_SCHEMA, publicSafePath, runSmoke } from '../scripts/run-clean-machine-smoke.mjs';

const execFileAsync = promisify(execFile);
const SCRIPT = resolve('scripts/run-clean-machine-smoke.mjs');

test('clean-machine public path labels do not expose local absolute paths', () => {
  assert.equal(publicSafePath('C:\\Users\\Alice\\AppData\\Local\\Enigma Memory\\app.exe', '<app-binary-path>'), '<app-binary-path>');
  assert.equal(publicSafePath('/home/alice/.config/enigma-desktop', '<vault-dir>'), '<vault-dir>');
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
    assert.equal(report.summary.total, 6);
    assert.equal(report.summary.healthy, report.summary.counts.fail === 0);
    assert.doesNotMatch(serialized, /C:\\Users\\|\/home\/|\/tmp\/|AppData\\Local/i);
    assert.doesNotMatch(serialized, /raw memory|prompt:|transcript:|provider_response|api[_-]?key|password/i);
    assert.ok(report.scenarios.every((scenario) => ['pass', 'fail', 'skip'].includes(scenario.status)));
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
