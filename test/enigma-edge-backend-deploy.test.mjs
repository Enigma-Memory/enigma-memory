import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EDGE_BACKEND_DEPLOYMENT_SCHEMA,
  deployEdgeBackendWorkers,
  edgeWorkerWranglerToml,
  publicVarsFromRefs,
  sanitizeDeployOutput,
} from '../scripts/deploy-edge-backend-workers.mjs';

function jsonResponse(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

async function fakeFetch(url) {
  if (url.includes('/storage/kv/namespaces')) {
    return jsonResponse({ success: true, result: [
      { title: 'enigma-memory-production-relay-audit', id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      { title: 'enigma-memory-production-gateway-audit', id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
    ] });
  }
  if (url.includes('/d1/database')) {
    return jsonResponse({ success: true, result: [{ name: 'enigma-memory-production-ledger', uuid: '11111111-2222-3333-4444-555555555555' }] });
  }
  throw new Error(`unexpected ${url}`);
}

async function sourceDir() {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-edge-deploy-test-'));
  await mkdir(join(dir, 'relay'), { recursive: true });
  await mkdir(join(dir, 'gateway'), { recursive: true });
  await writeFile(join(dir, 'relay', 'worker.mjs'), 'export default { fetch() { return new Response("ok"); } };\n', 'utf8');
  await writeFile(join(dir, 'gateway', 'worker.mjs'), 'export default { fetch() { return new Response("ok"); } };\n', 'utf8');
  return dir;
}

test('edge backend deploy dry-run plans public-safe binding deployment', async () => {
  const result = await deployEdgeBackendWorkers({
    apiToken: 'test-token',
    accountId: 'test-account',
    execute: false,
    generated_at: '2026-06-24T00:00:00.000Z',
    fetchImpl: fakeFetch,
  });
  assert.equal(result.schema, EDGE_BACKEND_DEPLOYMENT_SCHEMA);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'planned');
  assert.equal(result.execute, false);
  assert.equal(result.service_count, 2);
  assert.equal(result.services.every((service) => service.deployed === false), true);
  assert.equal(result.services.every((service) => service.resources.every((resource) => resource.id_redacted === true)), true);
  assert.doesNotMatch(JSON.stringify(result), /test-token|test-account|aaaaaaaaaaaaaaaa|11111111-2222/);
});

test('edge backend deploy execute uses temp TOML and redacts public artifact', async () => {
  const dir = await sourceDir();
  const secretValues = [];
  const execCalls = [];
  try {
    const result = await deployEdgeBackendWorkers({
      apiToken: 'test-token',
      accountId: 'test-account',
      execute: true,
      provisionSecrets: true,
      sourceDir: dir,
      generated_at: '2026-06-24T00:00:00.000Z',
      fetchImpl: fakeFetch,
      execFileImpl: async (_command, args) => {
        execCalls.push(args.join(' '));
        return { stdout: 'Current Version ID: 11111111-2222-3333-4444-555555555555\nKV aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n', stderr: '' };
      },
      secretPutImpl: async ({ secretName, secretValue }) => {
        secretValues.push(secretValue);
        return { stdout: `Uploaded secret ${secretName}\n`, stderr: '' };
      },
      env: {},
    });
    assert.equal(result.ok, true);
    assert.equal(result.status, 'deployed');
    assert.equal(result.services.every((service) => service.deployed === true), true);
    assert.equal(result.services.flatMap((service) => service.secrets).every((secret) => secret.provisioned === true && secret.value_returned === false), true);
    assert.equal(execCalls.length, 2);
    for (const value of secretValues) assert.doesNotMatch(JSON.stringify(result), new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(JSON.stringify(result), /11111111-2222-3333-4444-555555555555|aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa|test-token|test-account/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('edge backend deploy helpers produce binding TOML and sanitize CLI output', () => {
  const toml = edgeWorkerWranglerToml({
    service: { workerName: 'enigma-relay', hostname: 'relay.enigmamemory.com', kvBinding: 'ENIGMA_RELAY_AUDIT_KV' },
    ledgerDatabaseId: '11111111-2222-3333-4444-555555555555',
    kvNamespaceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    publicVars: publicVarsFromRefs({ backend_host: 'evidence://backend', dns_tls: 'evidence://tls' }, { operatorDecision: 'go' }),
  });
  assert.match(toml, /custom_domain = true/);
  assert.match(toml, /ENIGMA_LEDGER_DB/);
  assert.match(toml, /ENIGMA_RELAY_AUDIT_KV/);
  assert.match(toml, /\[vars\]/);
  assert.match(toml, /ENIGMA_BACKEND_HOST_REF = "evidence:\/\/backend"/);
  assert.match(toml, /ENIGMA_OPERATOR_ACCEPTANCE_DECISION = "go"/);
  const sanitized = sanitizeDeployOutput('Bearer abcdefghijklmnop Current Version ID: 11111111-2222-3333-4444-555555555555 https://enigma-relay.foo.workers.dev aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.doesNotMatch(sanitized, /abcdefghijklmnop|11111111-2222|foo\.workers|aaaaaaaaaaaaaaaa/);
  assert.match(sanitized, /Bearer <redacted>/);
});

test('edge backend deploy CLI help documents dry-run and redaction', () => {
  const run = spawnSync(process.execPath, ['scripts/deploy-edge-backend-workers.mjs', '--help'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Dry-run by default/);
  assert.match(run.stdout, /prints no token, account id, resource id, or secret value/);
});
