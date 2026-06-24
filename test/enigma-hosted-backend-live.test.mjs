import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  HOSTED_BACKEND_LIVE_EVIDENCE_SCHEMA,
  HOSTED_BACKEND_LIVE_RESULT_SCHEMA,
  REQUIRED_REF_KEYS,
  validateHostedBackendLiveEvidence,
} from '../scripts/validate-hosted-backend-live.mjs';

const execFileAsync = promisify(execFile);
const HASH = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function readyBody(service) {
  return {
    ok: true,
    service,
    checks: [{ name: 'production_evidence_refs', ok: true }],
    missing_evidence_refs: [],
  };
}

function fixtureEvidence(overrides = {}) {
  const refs = Object.fromEntries(REQUIRED_REF_KEYS.map((key) => [key, `${key}#fixture`]));
  return {
    schema: HOSTED_BACKEND_LIVE_EVIDENCE_SCHEMA,
    observed_at: '2026-06-24T00:00:00.000Z',
    environment: {
      environment_id: 'prod-enigma-memory',
      domain: 'enigmamemory.com',
      cloud_provider: 'cloudflare+operator-cloud',
      region: 'us-central',
      owner: 'operator',
      status: 'verified',
    },
    refs,
    probes: {
      relay_livez: { url: 'https://relay.enigmamemory.com/livez', status_code: 200, body: { ok: true, service: 'enigma-relay' }, observed_at: '2026-06-24T00:00:00.000Z', response_hash: HASH },
      relay_readyz: { url: 'https://relay.enigmamemory.com/readyz', status_code: 200, body: readyBody('enigma-relay'), observed_at: '2026-06-24T00:00:00.000Z', response_hash: HASH },
      gateway_livez: { url: 'https://gateway.enigmamemory.com/livez', status_code: 200, body: { ok: true, service: 'enigma-gateway' }, observed_at: '2026-06-24T00:00:00.000Z', response_hash: HASH },
      gateway_readyz: { url: 'https://gateway.enigmamemory.com/readyz', status_code: 200, body: readyBody('enigma-gateway'), observed_at: '2026-06-24T00:00:00.000Z', response_hash: HASH },
    },
    operator_acceptance: {
      decision: 'go',
      packet_ref: 'operator-acceptance#go',
      approved_at: '2026-06-24T00:00:00.000Z',
      approved_by: 'operator',
    },
    claim_boundary: {
      hosted_backend_live: true,
      public_site_live: false,
      cloudflare_credentials_claim: false,
      token_roi_claim: false,
      provider_deletion_claim: false,
      model_forgetting_claim: false,
    },
    ...overrides,
  };
}

test('hosted backend live validator accepts complete public-safe evidence', () => {
  const result = validateHostedBackendLiveEvidence(fixtureEvidence(), { generated_at: '2026-06-24T00:00:00.000Z' });
  assert.equal(result.schema, HOSTED_BACKEND_LIVE_RESULT_SCHEMA);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'accepted');
  assert.equal(result.checked.required_refs, REQUIRED_REF_KEYS.length);
  assert.equal(result.checked.refs_missing, 0);
  assert.equal(result.checked.probes_covered, 4);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE KEY|sk-[A-Za-z0-9_-]{16}/i);
});

test('hosted backend live validator blocks missing refs and non-ready probes', () => {
  const evidence = fixtureEvidence();
  delete evidence.refs.security_threat_model;
  evidence.probes.gateway_readyz.status_code = 503;
  evidence.probes.gateway_readyz.body.ok = false;
  evidence.probes.gateway_readyz.body.missing_evidence_refs = ['kms_custody'];
  evidence.operator_acceptance.decision = 'blocked';
  const result = validateHostedBackendLiveEvidence(evidence, { generated_at: '2026-06-24T00:00:00.000Z' });
  assert.equal(result.ok, false);
  const messages = result.blockers.map((entry) => entry.message).join('\n');
  assert.match(messages, /refs\.security_threat_model is required/);
  assert.match(messages, /probes\.gateway_readyz\.status_code must be 200/);
  assert.match(messages, /operator_acceptance\.decision must be go/);
});

test('hosted backend live validator blocks unresolved template placeholders', () => {
  const evidence = fixtureEvidence();
  evidence.refs.backend_host = '<operator-provided-backend_host-evidence-ref>';
  evidence.probes.relay_readyz.body.checks[0].ref = '<operator-provided-readyz-check-evidence-ref>';
  const result = validateHostedBackendLiveEvidence(evidence, { generated_at: '2026-06-24T00:00:00.000Z' });
  assert.equal(result.ok, false);
  const messages = result.blockers.map((entry) => `${entry.path}: ${entry.message}`).join('\n');
  assert.match(messages, /refs\.backend_host must not contain unresolved template placeholders/);
  assert.match(messages, /probes\.relay_readyz\.body\.checks\[0\]\.ref must not contain unresolved template placeholders/);
});

test('hosted backend live validator blocks query-bearing probe URLs', () => {
  const evidence = fixtureEvidence();
  evidence.probes.relay_readyz.url = 'https://relay.enigmamemory.com/readyz?token=abcdef';
  evidence.probes.gateway_livez.url = 'https://gateway.enigmamemory.com/livez#token';
  const result = validateHostedBackendLiveEvidence(evidence, { generated_at: '2026-06-24T00:00:00.000Z' });
  assert.equal(result.ok, false);
  const messages = result.blockers.map((entry) => entry.message).join('\n');
  assert.match(messages, /probes\.relay_readyz\.url must not include query strings or fragments/);
  assert.match(messages, /probes\.gateway_livez\.url must not include query strings or fragments/);
});

test('hosted backend live validator rejects secret-looking payloads', () => {
  const evidence = fixtureEvidence({ bearer: 'Bearer abcdefghijklmnopqrstuvwxyz' });
  assert.throws(() => validateHostedBackendLiveEvidence(evidence), /bearer is not allowed|secret-looking/i);
});

test('hosted backend live validator rejects edge-probe-only and wrong-service payloads', () => {
  const evidence = fixtureEvidence();
  evidence.probes.relay_livez.body = { ok: true, service: 'enigma-pages-edge-probe', pages_edge_probe_only: true };
  evidence.probes.gateway_readyz.body = { ...readyBody('enigma-pages-edge-probe'), hosted_probe_only: true };
  const result = validateHostedBackendLiveEvidence(evidence, { generated_at: '2026-06-24T00:00:00.000Z' });
  assert.equal(result.ok, false);
  const messages = result.blockers.map((entry) => entry.message).join('\n');
  assert.match(messages, /edge-probe-only payload/);
  assert.ok(messages.includes('probes.relay_livez.body.service must be enigma-relay'));
  assert.ok(messages.includes('probes.gateway_readyz.body.service must be enigma-gateway'));
});

test('hosted backend live validator CLI emits result JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-hosted-backend-live-'));
  const evidencePath = join(dir, 'evidence.json');
  const outPath = join(dir, 'result.json');
  await writeFile(evidencePath, JSON.stringify(fixtureEvidence(), null, 2), 'utf8');
  const result = await execFileAsync(process.execPath, [
    'scripts/validate-hosted-backend-live.mjs',
    '--evidence', evidencePath,
    '--out', outPath,
  ], {
    cwd: process.cwd(),
    timeout: 10000,
    windowsHide: true,
  });
  assert.equal(result.stderr, '');
  const stdout = JSON.parse(result.stdout);
  const file = JSON.parse(await readFile(outPath, 'utf8'));
  assert.equal(stdout.schema, HOSTED_BACKEND_LIVE_RESULT_SCHEMA);
  assert.equal(stdout.ok, true);
  assert.equal(file.status, 'accepted');
  assert.doesNotMatch(result.stdout, /PRIVATE KEY|sk-[A-Za-z0-9_-]{16}/i);
});
