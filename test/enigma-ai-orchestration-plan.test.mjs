import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  AI_ORCHESTRATION_PLAN_SCHEMA,
  buildAiOrchestrationPlan,
  renderAiOrchestrationPlanPlain,
} from '../scripts/build-ai-orchestration-plan.mjs';

const execFileAsync = promisify(execFile);

function statusBoard(overrides = {}) {
  return {
    schema: 'enigma.production_status_board.v1',
    generated_at: '2026-06-24T00:00:00.000Z',
    status: 'blocked',
    launch_ready: false,
    fresh_input_evidence: true,
    next_phase_id: 'cloudflare_credentials',
    next_phase: {
      id: 'hosted_backend_refs',
      details: {
        missing_ref_count: 25,
        missing_refs: ['backend_host', 'relay_deployment', 'gateway_deployment'],
        missing_ref_groups: { deployment: ['backend_host', 'relay_deployment', 'gateway_deployment'] },
        missing_endpoint_refs: ['relay.ref', 'gateway.ref', 'operator_acceptance.ref'],
      },
    },
    blocked_groups: [
      { name: 'cloudflare_credentials', ready: false, blocker_count: 2, blockers: ['CLOUDFLARE_API_TOKEN absent from current environment', 'CLOUDFLARE_ACCOUNT_ID absent from current environment'], next_command: 'Inject CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID out-of-band.' },
      { name: 'cloudflare_worker_permission', ready: false, blocker_count: 1, blockers: ['Cloudflare Worker service visibility is blocked by token/account permission'], next_command: 'Fix Cloudflare token/account Workers Scripts scope.' },
      { name: 'hosted_backend_live', ready: false, blocker_count: 29, blockers: ['hosted_live_ready is false', 'hosted missing refs: 25'], next_command: 'Provision relay/gateway/storage/KMS/SIEM/backup refs.' },
      { name: 'operator_acceptance', ready: false, blocker_count: 8, blockers: ['operator acceptance decision blocked', '54 operator blockers'], next_command: 'Complete operator acceptance packet with decision go and zero blockers.' },
    ],
    blocked_phases: [
      { id: 'cloudflare_credentials', title: 'Create and inject Cloudflare deployment credentials', ready: false, owner: 'operator', blockers: ['CLOUDFLARE_API_TOKEN absent from current environment', 'CLOUDFLARE_ACCOUNT_ID absent from current environment'], commands: ['npm run production:cloudflare-credentials'] },
      { id: 'cloudflare_worker_permission', title: 'Verify Cloudflare Worker visibility', ready: false, owner: 'operator-or-ai-with-token', blockers: ['Cloudflare Worker service visibility is blocked by token/account permission'], commands: ['npm run cloudflare:ops -- workers inspect-probe'] },
      { id: 'hosted_backend_refs', title: 'Provision hosted refs', ready: false, owner: 'operator', blockers: ['hosted_live_ready is false', 'hosted missing refs: 25'], commands: ['npm run production:hosted-live -- --evidence <hosted-backend-live.json>'] },
      { id: 'operator_acceptance', title: 'Complete operator acceptance', ready: false, owner: 'operator-or-reviewer', blockers: ['operator acceptance decision blocked', '54 operator blockers'], commands: ['npm run production:acceptance -- --packet <completed-packet.json>'] },
      { id: 'final_release_verification', title: 'Final release verification', ready: false, owner: 'operator-or-reviewer', blockers: ['launch_ready is false'], commands: ['npm run check && npm test && npm run release:audit'] },
    ],
    ...overrides,
  };
}

test('AI orchestration plan maps current blockers to role lanes and waves', () => {
  const plan = buildAiOrchestrationPlan({ statusBoard: statusBoard() }, { generated_at: '2026-06-24T00:01:00.000Z' });
  assert.equal(plan.schema, AI_ORCHESTRATION_PLAN_SCHEMA);
  assert.equal(plan.status, 'blocked');
  assert.equal(plan.launch_ready, false);
  assert.equal(plan.source_status_next_phase_id, 'cloudflare_credentials');
  assert.equal(plan.source_status_fresh_input_evidence, true);
  assert.equal(plan.role_lane_count, 5);
  assert.equal(plan.wave_count, 4);
  assert.equal(plan.next_phase_details.missing_ref_count, 25);
  assert.deepEqual(plan.next_phase_details.missing_refs, ['backend_host', 'relay_deployment', 'gateway_deployment']);
  assert.deepEqual(plan.next_phase_details.missing_ref_groups.deployment, ['backend_host', 'relay_deployment', 'gateway_deployment']);
  const lanes = new Map(plan.lanes.map((lane) => [lane.id, lane]));
  assert.equal(lanes.get('gpt55_architecture').model, 'GPT-5.5');
  assert.equal(lanes.get('kimi_coding').model, 'Kimi coding agent');
  assert.ok(lanes.get('kimi_coding').waits_for.includes('human_operator_credentials'));
  assert.match(lanes.get('human_operator_credentials').commands.join('\n'), /production:cloudflare-credentials/);
  assert.match(plan.waves.map((wave) => wave.id).join('\n'), /wave_4_final_release/);
  assert.match(plan.non_delegable_controls.join('\n'), /Cloudflare token values/);
  assert.doesNotMatch(JSON.stringify(plan), /Bearer\s+[A-Za-z0-9._~+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|sk-[A-Za-z0-9_-]{16,}/i);
});

test('AI orchestration plan plain output is Workflowz-readable and claim-bounded', () => {
  const plan = buildAiOrchestrationPlan({ statusBoard: statusBoard() }, { generated_at: '2026-06-24T00:01:00.000Z' });
  const plain = renderAiOrchestrationPlanPlain(plan);

  assert.match(plain, /^Enigma AI orchestration plan\n/);
  assert.match(plain, /Status: blocked/);
  assert.match(plain, /Launch ready: no/);
  assert.match(plain, /Role lanes: 5/);
  assert.match(plain, /Wave: wave_1_external_access/);
  assert.match(plain, /Lane: human_operator_credentials/);
  assert.match(plain, /Boundary: public-safe orchestration summary only/);
  assert.doesNotMatch(plain, /^\s*\{/);
  assert.doesNotMatch(plain, /Bearer\s+[A-Za-z0-9._~+/=-]{12,}|C:\\Users\\|\/home\/|raw_memory|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/i);
});

test('AI orchestration plan rejects unsafe source status evidence', () => {
  assert.throws(() => buildAiOrchestrationPlan({
    statusBoard: statusBoard({ blocked_groups: [{ name: 'cloudflare_credentials', blockers: ['Bearer abcdefghijklmnopqrstuvwxyz'] }] }),
  }), /secret-looking|secret/i);
  assert.throws(() => buildAiOrchestrationPlan({
    statusBoard: statusBoard({ blocked_groups: [{ name: 'cloudflare_credentials', blockers: ['CLOUDFLARE_API_TOKEN=abcdefghijklmnopqrstuvwxyz012345'] }] }),
  }), /secret-looking|secret/i);
  assert.throws(() => buildAiOrchestrationPlan({
    statusBoard: statusBoard({ blocked_groups: [{ name: 'cloudflare_credentials', blockers: ['CLOUDFLARE_ACCOUNT_ID=0123456789abcdef0123456789abcdef'] }] }),
  }), /secret-looking|secret/i);
});

test('AI orchestration plan CLI writes blocked public-safe JSON with exit 1', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-ai-orchestration-'));
  const paths = {
    status: join(dir, 'status.json'),
    out: join(dir, 'orchestration.json'),
  };
  await writeFile(paths.status, `${JSON.stringify(statusBoard(), null, 2)}\n`, 'utf8');
  await assert.rejects(
    () => execFileAsync(process.execPath, [
      'scripts/build-ai-orchestration-plan.mjs',
      '--status-board', paths.status,
      '--out', paths.out,
    ], { cwd: process.cwd(), timeout: 10000, windowsHide: true }),
    (error) => {
      assert.equal(error.code, 1);
      const stdout = JSON.parse(error.stdout);
      assert.equal(stdout.schema, AI_ORCHESTRATION_PLAN_SCHEMA);
      assert.equal(stdout.source_status_next_phase_id, 'cloudflare_credentials');
      assert.doesNotMatch(error.stdout, new RegExp(dir.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')));
      return true;
    },
  );
  const written = JSON.parse(await readFile(paths.out, 'utf8'));
  assert.equal(written.role_lane_count, 5);
});

test('AI orchestration plan CLI writes JSON evidence while printing plain output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-ai-orchestration-plain-'));
  const paths = {
    status: join(dir, 'status.json'),
    out: join(dir, 'orchestration.json'),
  };
  await writeFile(paths.status, `${JSON.stringify(statusBoard(), null, 2)}\n`, 'utf8');
  await assert.rejects(
    () => execFileAsync(process.execPath, [
      'scripts/build-ai-orchestration-plan.mjs',
      '--status-board', paths.status,
      '--out', paths.out,
      '--plain',
    ], { cwd: process.cwd(), timeout: 10000, windowsHide: true }),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stdout, /^Enigma AI orchestration plan\n/);
      assert.match(error.stdout, /Wave: wave_1_external_access/);
      assert.match(error.stdout, /Boundary: public-safe orchestration summary only/);
      assert.doesNotMatch(error.stdout, /^\s*\{/);
      assert.equal(error.stdout.includes(dir), false);
      assert.equal(error.stdout.includes(paths.out), false);
      return true;
    },
  );
  const written = JSON.parse(await readFile(paths.out, 'utf8'));
  assert.equal(written.schema, AI_ORCHESTRATION_PLAN_SCHEMA);
  assert.equal(written.role_lane_count, 5);
});
