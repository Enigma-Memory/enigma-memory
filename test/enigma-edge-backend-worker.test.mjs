import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { REQUIRED_REF_KEYS } from '../scripts/validate-hosted-backend-live.mjs';
import {
  EDGE_BACKEND_REF_ENV_NAMES,
  EDGE_BACKEND_WORKER_BUNDLE_SCHEMA,
  buildEdgeBackendWorkerBundle,
  validateEdgeBackendWorkerSource,
} from '../scripts/build-edge-backend-workers.mjs';

function workerModuleUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}

function kvMock() {
  const store = new Map();
  return {
    async get(key) { return store.get(key) ?? null; },
    async put(key, value) { store.set(key, value); },
  };
}

function completeEnv() {
  const env = Object.fromEntries(REQUIRED_REF_KEYS.map((key) => [EDGE_BACKEND_REF_ENV_NAMES[key][0], `ref://${key}/edge-worker-test` ]));
  env.ENIGMA_OPERATOR_ACCEPTANCE_DECISION = 'go';
  env.ENIGMA_LEDGER_DB = { prepare() { return { async first() { return { ok: 1 }; } }; } };
  env.ENIGMA_RELAY_AUDIT_KV = kvMock();
  env.ENIGMA_GATEWAY_AUDIT_KV = kvMock();
  env.ENIGMA_BOOTSTRAP_SECRET_SENTINEL = 'test-secret-sentinel';
  env.ENIGMA_READINESS_HMAC_KEY = 'test-readiness-hmac';
  return env;
}

test('edge backend worker bundle builds relay and gateway custom-domain configs', () => {
  const bundle = buildEdgeBackendWorkerBundle({ domain: 'enigmamemory.com', generated_at: '2026-06-24T00:00:00.000Z' });
  assert.equal(bundle.schema, EDGE_BACKEND_WORKER_BUNDLE_SCHEMA);
  assert.equal(bundle.ok, true);
  assert.deepEqual(Object.keys(bundle.services).sort(), ['gateway', 'relay']);
  assert.equal(bundle.services.relay.hostname, 'relay.enigmamemory.com');
  assert.match(bundle.services.relay.files['wrangler.toml'], /pattern = "relay\.enigmamemory\.com"/);
  assert.match(bundle.services.relay.files['wrangler.toml'], /custom_domain = true/);
  assert.match(bundle.services.relay.files['wrangler.toml'], /workers_dev = false/);
  assert.doesNotMatch(bundle.services.relay.files['wrangler.toml'], /relay\.enigmamemory\.com\/\*/);
  assert.match(bundle.services.gateway.files['wrangler.toml'], /pattern = "gateway\.enigmamemory\.com"/);
  assert.doesNotMatch(bundle.services.relay.files['worker.mjs'], /hosted_probe_only|pages_edge_probe_only|Bearer\s+|sk-[A-Za-z0-9_-]{16,}|PRIVATE KEY/);
  assert.match(bundle.services.relay.validation.source_hash, /^sha256:[a-f0-9]{64}$/);
});

test('edge backend worker source validator rejects probe-only or secret-looking variants', () => {
  const bundle = buildEdgeBackendWorkerBundle({ generated_at: '2026-06-24T00:00:00.000Z' });
  const probeOnly = bundle.services.relay.files['worker.mjs'].replace('runtime: \'cloudflare-workers\'', 'hosted_probe_only: true');
  const probeOnlyResult = validateEdgeBackendWorkerSource(probeOnly, 'relay');
  assert.equal(probeOnlyResult.ok, false);
  assert.ok(probeOnlyResult.blockers.some((item) => item.message.includes('probe-only')));

  const secretLooking = `${bundle.services.gateway.files['worker.mjs']}\nconst bad = 'Bearer abcdefghijklmnopqrstuvwxyz';`;
  const secretResult = validateEdgeBackendWorkerSource(secretLooking, 'gateway');
  assert.equal(secretResult.ok, false);
  assert.ok(secretResult.blockers.some((item) => item.message.includes('secret-looking')));
});

test('edge backend relay and gateway health routes fail closed without evidence refs', async () => {
  const bundle = buildEdgeBackendWorkerBundle({ generated_at: '2026-06-24T00:00:00.000Z' });
  for (const [kind, service] of Object.entries(bundle.services)) {
    const mod = await import(workerModuleUrl(service.files['worker.mjs']));
    const live = await mod.default.fetch(new Request(`https://${service.hostname}/livez`), {});
    assert.equal(live.status, 200);
    const liveBody = await live.json();
    assert.equal(liveBody.ok, true);
    assert.equal(liveBody.service, kind === 'relay' ? 'enigma-relay' : 'enigma-gateway');

    const ready = await mod.default.fetch(new Request(`https://${service.hostname}/readyz`), {});
    assert.equal(ready.status, 503);
    const readyBody = await ready.json();
    assert.equal(readyBody.ok, false);
    assert.equal(readyBody.service, kind === 'relay' ? 'enigma-relay' : 'enigma-gateway');
    assert.equal(readyBody.missing_evidence_refs.length, REQUIRED_REF_KEYS.length);
    assert.equal('hosted_probe_only' in readyBody, false);
  }
});

test('edge backend readyz passes only with refs and operator go decision', async () => {
  const bundle = buildEdgeBackendWorkerBundle({ generated_at: '2026-06-24T00:00:00.000Z' });
  for (const service of Object.values(bundle.services)) {
    const mod = await import(workerModuleUrl(service.files['worker.mjs']));
    const response = await mod.default.fetch(new Request(`https://${service.hostname}/readyz`), completeEnv());
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.evidence_ref_count, REQUIRED_REF_KEYS.length);
    assert.deepEqual(body.missing_evidence_refs, []);
    assert.equal(body.checks.every((check) => check.ok === true), true);
  }
});

test('edge backend private routes stay closed and reject plaintext-looking bodies', async () => {
  const bundle = buildEdgeBackendWorkerBundle({ generated_at: '2026-06-24T00:00:00.000Z' });
  const gateway = await import(workerModuleUrl(bundle.services.gateway.files['worker.mjs']));
  const closed = await gateway.default.fetch(new Request('https://gateway.enigmamemory.com/gateway/decision', { method: 'POST', body: JSON.stringify({ request: { operation: 'retrieve' } }) }), completeEnv());
  assert.equal(closed.status, 503);
  assert.equal((await closed.json()).error.code, 'PRIVATE_ROUTE_CLOSED');

  const unsafe = await gateway.default.fetch(new Request('https://gateway.enigmamemory.com/gateway/decision', { method: 'POST', body: JSON.stringify({ prompt: 'private prompt must stay out' }) }), completeEnv());
  assert.equal(unsafe.status, 400);
  assert.equal((await unsafe.json()).error.code, 'PLAINTEXT_REJECTED');
});

test('edge backend worker CLI writes relay and gateway worker files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-edge-backend-workers-'));
  try {
    const run = spawnSync(process.execPath, ['scripts/build-edge-backend-workers.mjs', '--out-dir', dir, '--domain', 'enigmamemory.com'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      windowsHide: true,
    });
    assert.equal(run.status, 0, run.stderr);
    const manifest = JSON.parse(await readFile(join(dir, 'EDGE_BACKEND_WORKERS_MANIFEST.json'), 'utf8'));
    assert.equal(manifest.schema, EDGE_BACKEND_WORKER_BUNDLE_SCHEMA);
    assert.equal(manifest.ok, true);
    assert.deepEqual(Object.keys(manifest.services).sort(), ['gateway', 'relay']);
    assert.match(await readFile(join(dir, 'relay', 'worker.mjs'), 'utf8'), /SERVICE_NAME = "enigma-relay"/);
    assert.match(await readFile(join(dir, 'gateway', 'wrangler.toml'), 'utf8'), /pattern = "gateway\.enigmamemory\.com"/);
    assert.match(await readFile(join(dir, 'gateway', 'wrangler.toml'), 'utf8'), /custom_domain = true/);
    assert.doesNotMatch(await readFile(join(dir, 'gateway', 'wrangler.toml'), 'utf8'), /gateway\.enigmamemory\.com\/\*/);
    assert.doesNotMatch(run.stdout, /enigma-edge-backend-workers-|Bearer\s+[A-Za-z0-9._~+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|sk-[A-Za-z0-9_-]{16,}/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
