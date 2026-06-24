import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOSTED_PROBE_WORKER_BUNDLE_SCHEMA,
  REQUIRED_WORKER_ENV_REFS,
  buildHostedProbeWorkerBundle,
  validateHostedProbeWorkerSource,
} from '../scripts/build-hosted-probe-worker.mjs';

function workerModuleUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}

test('hosted probe worker bundle is public-safe and fail-closed by construction', () => {
  const bundle = buildHostedProbeWorkerBundle({ generated_at: '2026-06-23T00:00:00.000Z' });
  assert.equal(bundle.schema, HOSTED_PROBE_WORKER_BUNDLE_SCHEMA);
  assert.equal(bundle.ok, true);
  assert.equal(bundle.required_env_refs.length, REQUIRED_WORKER_ENV_REFS.length);
  assert.equal(bundle.deployment_plan.mutates_cloudflare, false);
  assert.equal(bundle.deployment_plan.default_routes.includes('/livez'), true);
  assert.equal(bundle.deployment_plan.default_routes.includes('/readyz'), true);
  assert.match(bundle.validation.source_hash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(/Bearer\s+|sk-[A-Za-z0-9_-]{16,}|PRIVATE KEY/.test(bundle.files['worker.mjs']), false);
});

test('hosted probe worker source validator rejects non-fail-closed variants', () => {
  const bundle = buildHostedProbeWorkerBundle({ generated_at: '2026-06-23T00:00:00.000Z' });
  const unsafe = bundle.files['worker.mjs'].replace('body.ok ? 200 : 503', '200');
  const result = validateHostedProbeWorkerSource(unsafe);
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((item) => item.message.includes('fail closed')));
});

test('hosted probe worker /livez is green and /readyz fails closed without refs', async () => {
  const bundle = buildHostedProbeWorkerBundle({ generated_at: '2026-06-23T00:00:00.000Z' });
  const mod = await import(workerModuleUrl(bundle.files['worker.mjs']));
  const live = await mod.default.fetch(new Request('https://probe.enigmamemory.com/livez'), {});
  assert.equal(live.status, 200);
  assert.equal((await live.json()).ok, true);

  const ready = await mod.default.fetch(new Request('https://probe.enigmamemory.com/readyz'), {});
  assert.equal(ready.status, 503);
  const body = await ready.json();
  assert.equal(body.ok, false);
  assert.equal(body.hosted_probe_only, true);
  assert.equal(body.missing_evidence_refs.length, REQUIRED_WORKER_ENV_REFS.length);
});

test('hosted probe worker /readyz passes only with refs and go decision', async () => {
  const bundle = buildHostedProbeWorkerBundle({ generated_at: '2026-06-23T00:00:00.000Z' });
  const mod = await import(workerModuleUrl(bundle.files['worker.mjs']));
  const env = Object.fromEntries(REQUIRED_WORKER_ENV_REFS.map((key) => [key, `ref://${key.toLowerCase()}`]));
  env.ENIGMA_OPERATOR_ACCEPTANCE_DECISION = 'go';
  const response = await mod.default.fetch(new Request('https://probe.enigmamemory.com/readyz'), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.deepEqual(body.missing_evidence_refs, []);
  assert.equal(body.checks.every((check) => check.ok === true), true);
});

test('hosted probe worker CLI writes manifest and worker files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-hosted-probe-worker-'));
  try {
    const run = spawnSync(process.execPath, ['scripts/build-hosted-probe-worker.mjs', '--out-dir', dir, '--generated-at', '2026-06-23T00:00:00.000Z'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      windowsHide: true,
    });
    assert.equal(run.status, 0, run.stderr);
    const manifest = JSON.parse(await readFile(join(dir, 'HOSTED_PROBE_WORKER_MANIFEST.json'), 'utf8'));
    assert.equal(manifest.schema, HOSTED_PROBE_WORKER_BUNDLE_SCHEMA);
    assert.equal(manifest.ok, true);
    assert.equal(manifest.files['worker.mjs'].sha256, manifest.validation.source_hash);
    assert.match(await readFile(join(dir, 'worker.mjs'), 'utf8'), /hosted_probe_only/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
