import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { REQUIRED_REF_KEYS } from '../scripts/validate-hosted-backend-live.mjs';
import { HOSTED_REF_DRAFT_SCHEMA, buildHostedRefDraft } from '../scripts/build-hosted-ref-draft.mjs';

function edgeLive(overrides = {}) {
  return {
    schema: 'enigma.edge_backend_bootstrap_live_evidence.v1',
    ok: true,
    launch_ready: false,
    hosted_backend_live_ready: false,
    domain: 'enigmamemory.com',
    service_count: 2,
    services: {
      relay: {
        service: 'enigma-relay',
        hostname: 'relay.enigmamemory.com',
        dns: { ok: true, a_record_count: 2 },
        probes: {
          livez: { status_code: 200, body: { service: 'enigma-relay' } },
          readyz: { status_code: 503, body: { missing_evidence_ref_count: REQUIRED_REF_KEYS.length } },
        },
      },
      gateway: {
        service: 'enigma-gateway',
        hostname: 'gateway.enigmamemory.com',
        dns: { ok: true, a_record_count: 2 },
        probes: {
          livez: { status_code: 200, body: { service: 'enigma-gateway' } },
          readyz: { status_code: 503, body: { missing_evidence_ref_count: REQUIRED_REF_KEYS.length } },
        },
      },
    },
    blockers: [],
    ...overrides,
  };
}

test('hosted ref draft converts edge bootstrap into partial non-complete refs', () => {
  const draft = buildHostedRefDraft({ edgeLive: edgeLive() }, { generated_at: '2026-06-24T00:00:00.000Z' });
  assert.equal(draft.schema, HOSTED_REF_DRAFT_SCHEMA);
  assert.equal(draft.complete, false);
  assert.equal(draft.launch_ready, false);
  assert.equal(draft.hosted_backend_live_ready, false);
  assert.equal(draft.partial_ref_count, 4);
  assert.equal(draft.complete_ref_count, 0);
  assert.deepEqual(Object.keys(draft.partial_refs).sort(), ['backend_host', 'dns_tls', 'gateway_deployment', 'relay_deployment']);
  assert.equal(draft.partial_refs.relay_deployment.status, 'partial_edge_bootstrap_only');
  assert.equal(draft.partial_refs.relay_deployment.complete, false);
  assert.equal(draft.remaining_refs.length, REQUIRED_REF_KEYS.length - 4);
  assert.equal(draft.still_incomplete_refs.length, REQUIRED_REF_KEYS.length);
  assert.ok(draft.acceptance_rule.includes('Do not feed partial_refs'));
  assert.ok(draft.missing_ref_groups.deployment.includes('relay_deployment'));
});

test('hosted ref draft stays blocked when edge bootstrap evidence is incomplete', () => {
  const draft = buildHostedRefDraft({ edgeLive: edgeLive({ ok: false }) }, { generated_at: '2026-06-24T00:00:00.000Z' });
  assert.equal(draft.status, 'blocked_no_edge_bootstrap_evidence');
  assert.equal(draft.partial_ref_count, 0);
  assert.equal(draft.remaining_refs.length, REQUIRED_REF_KEYS.length);
  assert.equal(draft.still_incomplete_refs.length, REQUIRED_REF_KEYS.length);
});

test('hosted ref draft rejects non-public fields and wrong schema', () => {
  assert.throws(() => buildHostedRefDraft({ edgeLive: { ...edgeLive(), schema: 'wrong' } }), /schema mismatch/);
  assert.throws(() => buildHostedRefDraft({ edgeLive: edgeLive({ token: 'not-public' }) }), /not allowed/);
});

test('hosted ref draft CLI writes redacted summary output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-hosted-ref-draft-'));
  try {
    const edgePath = join(dir, 'edge-live.json');
    const outPath = join(dir, 'hosted-ref-draft.json');
    await import('node:fs/promises').then(({ writeFile }) => writeFile(edgePath, `${JSON.stringify(edgeLive(), null, 2)}\n`, 'utf8'));
    const run = spawnSync(process.execPath, ['scripts/build-hosted-ref-draft.mjs', '--edge-live', edgePath, '--out', outPath], {
      cwd: process.cwd(),
      encoding: 'utf8',
      windowsHide: true,
    });
    assert.equal(run.status, 0, run.stderr);
    const summary = JSON.parse(run.stdout);
    assert.equal(summary.schema, HOSTED_REF_DRAFT_SCHEMA);
    assert.equal(summary.out, '<hosted-ref-draft-output>');
    assert.equal(summary.complete, false);
    assert.equal(summary.partial_ref_count, 4);
    const draft = JSON.parse(await readFile(outPath, 'utf8'));
    assert.equal(draft.schema, HOSTED_REF_DRAFT_SCHEMA);
    assert.doesNotMatch(run.stdout, /enigma-hosted-ref-draft-|Bearer|PRIVATE KEY|sk-/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
