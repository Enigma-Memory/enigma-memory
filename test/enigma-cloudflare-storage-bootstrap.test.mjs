import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { bootstrapCloudflareStorage, CLOUDFLARE_STORAGE_BOOTSTRAP_SCHEMA } from '../scripts/cloudflare-storage-bootstrap.mjs';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function fakeListResponse(url, existing = false) {
  if (url.includes('/storage/kv/namespaces')) {
    return jsonResponse({ success: true, result: existing ? [
      { title: 'enigma-memory-production-relay-audit', id: 'redacted-kv-1' },
      { title: 'enigma-memory-production-gateway-audit', id: 'redacted-kv-2' },
    ] : [], result_info: { total_pages: 1 } });
  }
  if (url.includes('/d1/database')) {
    return jsonResponse({ success: true, result: existing ? [{ name: 'enigma-memory-production-ledger', uuid: 'redacted-d1' }] : [], result_info: { total_pages: 1 } });
  }
  throw new Error(`unexpected ${url}`);
}

test('cloudflare storage bootstrap dry-run plans missing resources without mutation', async () => {
  const calls = [];
  const result = await bootstrapCloudflareStorage({
    apiToken: 'test-token',
    accountId: 'test-account',
    execute: false,
    generated_at: '2026-06-24T00:00:00.000Z',
    fetchImpl: async (url, init = {}) => {
      calls.push({ url, method: init.method ?? 'GET' });
      assert.equal(init.method ?? 'GET', 'GET');
      return fakeListResponse(url, false);
    },
  });
  assert.equal(result.schema, CLOUDFLARE_STORAGE_BOOTSTRAP_SCHEMA);
  assert.equal(result.status, 'planned');
  assert.equal(result.ok, false);
  assert.equal(result.execute, false);
  assert.equal(result.resource_count, 3);
  assert.equal(result.observed_resource_count, 0);
  assert.equal(result.created_resource_count, 0);
  assert.equal(result.blockers.length, 3);
  assert.equal(calls.every((call) => call.method === 'GET'), true);
});

test('cloudflare storage bootstrap execute creates missing D1 and KV resources with ids redacted', async () => {
  const calls = [];
  const result = await bootstrapCloudflareStorage({
    apiToken: 'test-token',
    accountId: 'test-account',
    execute: true,
    generated_at: '2026-06-24T00:00:00.000Z',
    fetchImpl: async (url, init = {}) => {
      calls.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : null });
      if ((init.method ?? 'GET') === 'GET') return fakeListResponse(url, false);
      if (url.includes('/storage/kv/namespaces')) return jsonResponse({ success: true, result: { id: 'new-kv-id', title: JSON.parse(init.body).title } });
      if (url.includes('/d1/database')) return jsonResponse({ success: true, result: { uuid: 'new-d1-id', name: JSON.parse(init.body).name } });
      throw new Error(`unexpected create ${url}`);
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'accepted');
  assert.equal(result.observed_resource_count, 3);
  assert.equal(result.created_resource_count, 3);
  assert.deepEqual(result.resources.map((resource) => resource.id_redacted), [true, true, true]);
  assert.equal(calls.filter((call) => call.method === 'POST').length, 3);
  assert.doesNotMatch(JSON.stringify(result), /new-kv-id|new-d1-id|test-token|test-account/);
});

test('cloudflare storage bootstrap accepts already existing resources', async () => {
  const result = await bootstrapCloudflareStorage({
    apiToken: 'test-token',
    accountId: 'test-account',
    execute: true,
    generated_at: '2026-06-24T00:00:00.000Z',
    fetchImpl: async (url, init = {}) => {
      assert.equal(init.method ?? 'GET', 'GET');
      return fakeListResponse(url, true);
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'accepted');
  assert.equal(result.observed_resource_count, 3);
  assert.equal(result.created_resource_count, 0);
  assert.equal(result.blockers.length, 0);
});

test('cloudflare storage bootstrap CLI help documents dry-run and redaction', () => {
  const run = spawnSync(process.execPath, ['scripts/cloudflare-storage-bootstrap.mjs', '--help'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Dry-run by default/);
  assert.match(run.stdout, /prints no token, account id, database id, or namespace id/);
});
