import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { REQUIRED_REF_KEYS } from '../scripts/validate-hosted-backend-live.mjs';
import {
  EDGE_BACKEND_BOOTSTRAP_EVIDENCE_SCHEMA,
  collectEdgeBackendBootstrapEvidence,
} from '../scripts/collect-edge-backend-bootstrap-evidence.mjs';

function dnsResponse() {
  return new Response(JSON.stringify({ Status: 0, Answer: [{ type: 1, data: '203.0.113.10' }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function liveBody(service, kind) {
  return {
    ok: true,
    service,
    service_kind: kind,
    runtime: 'cloudflare-workers',
    claim_boundary: ['edge bootstrap only'],
  };
}

function readyBody(service, kind, missing = REQUIRED_REF_KEYS) {
  return {
    ok: false,
    service,
    service_kind: kind,
    runtime: 'cloudflare-workers',
    missing_evidence_refs: missing,
    checks: [
      { name: 'production_evidence_refs', ok: false },
      { name: 'operator_acceptance', ok: false },
      { name: 'storage_bindings', ok: true, ledger_database_bound: true, audit_namespace_bound: true, ledger_read_ok: true, audit_write_ok: true, audit_read_ok: true },
      { name: 'secret_custody_binding', ok: true, sentinel_bound: true, readiness_hmac_bound: true, value_returned: false },
      { name: 'private_routes_fail_closed', ok: true },
    ],
    claim_boundary: ['edge bootstrap only'],
  };
}

test('edge backend bootstrap collector accepts livez plus fail-closed readyz', async () => {
  const evidence = await collectEdgeBackendBootstrapEvidence({
    domain: 'enigmamemory.com',
    generated_at: '2026-06-24T00:00:00.000Z',
    fetchImpl: async () => dnsResponse(),
    requestJsonImpl: async (_url, _ips, context) => {
      const body = context.path === '/livez'
        ? liveBody(context.service.service, context.service.kind)
        : readyBody(context.service.service, context.service.kind);
      return { status_code: context.path === '/livez' ? 200 : 503, body, response_hash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', bytes: 128 };
    },
  });

  assert.equal(evidence.schema, EDGE_BACKEND_BOOTSTRAP_EVIDENCE_SCHEMA);
  assert.equal(evidence.ok, true);
  assert.equal(evidence.launch_ready, false);
  assert.equal(evidence.hosted_backend_live_ready, false);
  assert.equal(evidence.service_count, 2);
  assert.equal(evidence.services.relay.dns.a_record_count, 1);
  assert.equal('ips' in evidence.services.relay.dns, false);
  assert.equal(evidence.services.relay.probes.livez.status_code, 200);
  assert.equal(evidence.services.relay.probes.readyz.status_code, 503);
  assert.equal(evidence.services.relay.probes.readyz.body.missing_evidence_ref_count, REQUIRED_REF_KEYS.length);
  assert.equal(evidence.services.relay.probes.readyz.body.storage_bindings_ok, true);
  assert.equal(evidence.services.relay.probes.readyz.body.storage_ledger_database_bound, true);
  assert.equal(evidence.services.relay.probes.readyz.body.storage_ledger_read_ok, true);
  assert.equal(evidence.services.relay.probes.readyz.body.storage_audit_read_ok, true);
  assert.equal(evidence.services.relay.probes.readyz.body.storage_audit_write_ok, true);
  assert.equal(evidence.services.relay.probes.readyz.body.custody_binding_ok, true);
  assert.equal(evidence.services.relay.probes.readyz.body.credential_value_returned, false);
  assert.deepEqual(evidence.blockers, []);
});

test('edge backend bootstrap collector rejects incomplete readyz missing-ref set', async () => {
  const evidence = await collectEdgeBackendBootstrapEvidence({
    domain: 'enigmamemory.com',
    generated_at: '2026-06-24T00:00:00.000Z',
    fetchImpl: async () => dnsResponse(),
    requestJsonImpl: async (_url, _ips, context) => {
      const body = context.path === '/livez'
        ? liveBody(context.service.service, context.service.kind)
        : readyBody(context.service.service, context.service.kind, REQUIRED_REF_KEYS.slice(0, 1));
      return { status_code: context.path === '/livez' ? 200 : 503, body, response_hash: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', bytes: 128 };
    },
  });

  assert.equal(evidence.ok, false);
  assert.ok(evidence.blockers.some((blocker) => blocker.includes('missing ref set incomplete')));
});

test('edge backend bootstrap collector rejects non-public probe fields', async () => {
  await assert.rejects(() => collectEdgeBackendBootstrapEvidence({
    domain: 'enigmamemory.com',
    generated_at: '2026-06-24T00:00:00.000Z',
    fetchImpl: async () => dnsResponse(),
    requestJsonImpl: async (_url, _ips, context) => ({
      status_code: context.path === '/livez' ? 200 : 503,
      body: { ...liveBody(context.service.service, context.service.kind), token: 'not-public' },
      response_hash: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      bytes: 64,
    }),
  }), /token is not allowed/);
});

test('edge backend bootstrap collector CLI documents no-deploy behavior', () => {
  const run = spawnSync(process.execPath, ['scripts/collect-edge-backend-bootstrap-evidence.mjs', '--help'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Collects public-safe relay\/gateway edge bootstrap evidence/);
  assert.match(run.stdout, /deploys nothing/);
});
