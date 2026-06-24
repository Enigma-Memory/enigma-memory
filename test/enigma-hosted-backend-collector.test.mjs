import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOSTED_BACKEND_LIVE_COLLECTION_SCHEMA,
  collectHostedBackendLiveEvidence,
} from '../scripts/collect-hosted-backend-live-evidence.mjs';
import { HOSTED_BACKEND_LIVE_EVIDENCE_SCHEMA, REQUIRED_REF_KEYS } from '../scripts/validate-hosted-backend-live.mjs';

const OBSERVED_AT = '2026-06-24T05:45:00.000Z';

function refs() {
  return Object.fromEntries(REQUIRED_REF_KEYS.map((key) => [key, `${key}-collector-ref#verified`]));
}

function options(overrides = {}) {
  return {
    relayBaseUrl: 'https://relay.enigmamemory.com',
    gatewayBaseUrl: 'https://gateway.enigmamemory.com',
    refs: refs(),
    environmentId: 'prod-us-central',
    domain: 'enigmamemory.com',
    cloudProvider: 'operator-cloud',
    region: 'us-central',
    owner: 'operator',
    environmentStatus: 'verified',
    operatorDecision: 'go',
    operatorPacketRef: 'operator-acceptance#go',
    operatorApprovedAt: OBSERVED_AT,
    operatorApprovedBy: 'operator',
    observed_at: OBSERVED_AT,
    ...overrides,
  };
}

function okFetch() {
  return async (url) => {
    const parsed = new URL(String(url));
    const service = parsed.hostname.startsWith('relay.') ? 'enigma-relay' : 'enigma-gateway';
    const body = parsed.pathname === '/readyz'
      ? { ok: true, service, checks: [{ name: 'production_evidence_refs', ok: true }], missing_evidence_refs: [] }
      : { ok: true, service };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };
}

test('hosted backend collector builds validator-accepted evidence from public probes', async () => {
  const collection = await collectHostedBackendLiveEvidence(options({ fetchImpl: okFetch() }));
  assert.equal(collection.schema, HOSTED_BACKEND_LIVE_COLLECTION_SCHEMA);
  assert.equal(collection.ok, true);
  assert.equal(collection.evidence.schema, HOSTED_BACKEND_LIVE_EVIDENCE_SCHEMA);
  assert.equal(collection.validation.schema, 'enigma.hosted_backend_live_result.v1');
  assert.equal(collection.validation.status, 'accepted');
  assert.equal(collection.validation.checked.refs_missing, 0);
  assert.equal(collection.validation.checked.probes_covered, 4);
  assert.deepEqual(Object.keys(collection.probe_summary).sort(), ['gateway_livez', 'gateway_readyz', 'relay_livez', 'relay_readyz']);
  for (const probe of Object.values(collection.evidence.probes)) assert.match(probe.response_hash, /^sha256:[a-f0-9]{64}$/);
});

test('hosted backend collector preserves blocked validation when readyz is not ready', async () => {
  const collection = await collectHostedBackendLiveEvidence(options({
    fetchImpl: async (url) => {
      const parsed = new URL(String(url));
      const service = parsed.hostname.startsWith('relay.') ? 'enigma-relay' : 'enigma-gateway';
      if (parsed.pathname === '/readyz') {
        return new Response(JSON.stringify({ ok: false, service, checks: [{ name: 'production_evidence_refs', ok: false }], missing_evidence_refs: ['kms_custody'] }), { status: 503, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true, service }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  }));
  assert.equal(collection.ok, false);
  assert.equal(collection.validation.status, 'blocked');
  assert.ok(collection.validation.blockers.some((item) => item.path.includes('readyz.status_code')));
});

test('hosted backend collector blocks Pages edge probe bodies as hosted evidence', async () => {
  const collection = await collectHostedBackendLiveEvidence(options({
    fetchImpl: async (url) => {
      const parsed = new URL(String(url));
      const body = parsed.pathname === '/readyz'
        ? { ok: true, service: 'enigma-pages-edge-probe', pages_edge_probe_only: true, checks: [{ name: 'production_evidence_refs', ok: true }], missing_evidence_refs: [] }
        : { ok: true, service: 'enigma-pages-edge-probe', pages_edge_probe_only: true };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  }));
  assert.equal(collection.ok, false);
  const messages = collection.validation.blockers.map((entry) => entry.message).join('\n');
  assert.match(messages, /edge-probe-only payload/);
  assert.ok(messages.includes('body.service must be enigma-relay') || messages.includes('body.service must be enigma-gateway'));
});

test('hosted backend collector rejects secret-looking probe bodies', async () => {
  await assert.rejects(() => collectHostedBackendLiveEvidence(options({
    fetchImpl: async () => new Response(JSON.stringify({ ok: true, token: 'Bearer abcdefghijklmnopqrstuvwxyz' }), { status: 200, headers: { 'content-type': 'application/json' } }),
  })), /probe body field token is not allowed/);
});

test('hosted backend collector rejects nested secret-looking probe bodies', async () => {
  await assert.rejects(() => collectHostedBackendLiveEvidence(options({
    fetchImpl: async () => new Response(JSON.stringify({ ok: true, checks: [{ name: 'nested', details: { bearer: 'Bearer abcdefghijklmnopqrstuvwxyz' } }] }), { status: 200, headers: { 'content-type': 'application/json' } }),
  })), /bearer is not allowed|secret-looking/);
});

test('hosted backend collector rejects query-bearing custom health URLs', async () => {
  await assert.rejects(() => collectHostedBackendLiveEvidence(options({
    relayReadyzUrl: 'https://relay.enigmamemory.com/readyz?token=abcdef',
    fetchImpl: okFetch(),
  })), /must not include query strings or fragments/);
  await assert.rejects(() => collectHostedBackendLiveEvidence(options({
    gatewayLivezUrl: 'https://gateway.enigmamemory.com/livez#token',
    fetchImpl: okFetch(),
  })), /must not include query strings or fragments/);
});

test('hosted backend collector rejects redirected public probes', async () => {
  await assert.rejects(() => collectHostedBackendLiveEvidence(options({
    fetchImpl: async (_url, init) => {
      assert.equal(init.redirect, 'manual');
      return new Response(JSON.stringify({ ok: true }), {
        status: 302,
        headers: { location: 'https://attacker.example/readyz', 'content-type': 'application/json' },
      });
    },
  })), /must not redirect/);
});

test('hosted backend collector CLI help is public-safe', () => {
  const run = spawnSync(process.execPath, ['scripts/collect-hosted-backend-live-evidence.mjs', '--help'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /Collects public HTTPS/);
  assert.doesNotMatch(run.stdout, /Bearer\s+/);
});

test('hosted backend collector CLI fails closed without refs file', () => {
  const run = spawnSync(process.execPath, ['scripts/collect-hosted-backend-live-evidence.mjs', '--relay-url', 'https://relay.enigmamemory.com', '--gateway-url', 'https://gateway.enigmamemory.com'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /path must be of type string|refs-json/i);
});

test('hosted backend collector CLI writes explicit evidence when supplied files and live fetch are mocked by fixture import', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-hosted-collector-'));
  try {
    const refsPath = join(dir, 'refs.json');
    await writeFile(refsPath, JSON.stringify(refs()), 'utf8');
    const collection = await collectHostedBackendLiveEvidence(options({ refs: JSON.parse(await readFile(refsPath, 'utf8')), fetchImpl: okFetch() }));
    const out = join(dir, 'collection.json');
    const evidence = join(dir, 'evidence.json');
    await writeFile(out, JSON.stringify(collection, null, 2), 'utf8');
    await writeFile(evidence, JSON.stringify(collection.evidence, null, 2), 'utf8');
    assert.equal(JSON.parse(await readFile(out, 'utf8')).ok, true);
    assert.equal(JSON.parse(await readFile(evidence, 'utf8')).schema, HOSTED_BACKEND_LIVE_EVIDENCE_SCHEMA);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
