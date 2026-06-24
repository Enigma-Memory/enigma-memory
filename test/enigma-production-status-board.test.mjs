import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  buildProductionStatusBoard,
  PRODUCTION_STATUS_BOARD_SCHEMA,
} from '../scripts/build-production-status-board.mjs';

const execFileAsync = promisify(execFile);

function goalAudit(overrides = {}) {
  return {
    schema: 'enigma.goal_completion_audit.v1',
    generated_at: '2026-06-24T00:00:00.000Z',
    complete: false,
    go_live_ready: false,
    release_posture: 'local_package_artifact_ready_with_blocked_live_infrastructure',
    deliverables: [
      { id: 'whitepaper-math-diagrams', requirement: 'whitepaper', ok: true, blockers: [] },
      { id: 'cloudflare-credentials-present', requirement: 'cloudflare credentials', ok: false, blockers: ['CLOUDFLARE_API_TOKEN absent from current environment'] },
      { id: 'hosted-backend-live', requirement: 'hosted backend live', ok: false, blockers: ['hosted_live_ready is false', 'hosted missing refs: 25'] },
      { id: 'operator-acceptance-go', requirement: 'operator acceptance', ok: false, blockers: ['operator acceptance decision blocked'] },
    ],
    ...overrides,
  };
}

function dependencies(overrides = {}) {
  return {
    schema: 'enigma.production_dependency_report.v1',
    generated_at: '2026-06-24T00:01:00.000Z',
    status: 'blocked',
    launch_ready: false,
    goal_complete: false,
    release_posture: 'local_package_artifact_ready_with_blocked_live_infrastructure',
    groups: [
      { name: 'static_site', ready: true, blockers: [], blocker_count: 0, next_command: 'npm run production:goal-audit -- --site <public-site-dir>' },
      { name: 'release_gates', ready: true, blockers: [], blocker_count: 0, next_command: 'npm run check && npm test && npm run release:audit' },
      { name: 'whitepaper_claims', ready: true, blockers: [], blocker_count: 0, next_command: 'npm run production:whitepaper' },
      { name: 'cloudflare_credentials', ready: false, blockers: ['CLOUDFLARE_API_TOKEN absent from current environment', 'CLOUDFLARE_ACCOUNT_ID absent from current environment'], blocker_count: 2, next_command: 'Inject CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID out-of-band.' },
      { name: 'cloudflare_worker_permission', ready: false, blockers: ['Cloudflare Worker service visibility is blocked by token/account permission'], blocker_count: 1, next_command: 'Fix Cloudflare token/account Workers Scripts scope.' },
      { name: 'hosted_backend_live', ready: false, blockers: ['hosted_live_ready is false', 'hosted missing refs: 25'], blocker_count: 2, next_command: 'Provision relay/gateway/storage/KMS/SIEM/backup refs.' },
      { name: 'operator_acceptance', ready: false, blockers: ['operator acceptance decision blocked'], blocker_count: 1, next_command: 'Complete operator acceptance packet with decision go and zero blockers.' },
    ],
    ...overrides,
  };
}

function workplan(overrides = {}) {
  return {
    schema: 'enigma.production_workplan.v1',
    generated_at: '2026-06-24T00:02:00.000Z',
    status: 'blocked',
    launch_ready: false,
    blocked_phase_count: 5,
    phase_count: 6,
    next_phase_id: 'cloudflare_credentials',
    execution_order: ['cloudflare_credentials', 'release_gates', 'cloudflare_worker_permission', 'hosted_backend_refs', 'operator_acceptance', 'final_release_verification'],
    evidence_inputs: {
      dependency_generated_at: '2026-06-24T00:01:00.000Z',
      operator_acceptance_generated_at: '2026-06-24T00:00:45.000Z',
      hosted_ref_catalog_generated_at: '2026-06-24T00:00:30.000Z',
    },
    phases: [
      { id: 'cloudflare_credentials', title: 'Create and inject Cloudflare deployment credentials', ready: false, owner: 'operator', prerequisites: [], blockers: ['CLOUDFLARE_API_TOKEN absent from current environment'], blocker_count: 1, commands: ['npm run production:cloudflare-credentials'] },
      { id: 'release_gates', title: 'Keep local release gates green', ready: true, owner: 'operator-or-reviewer', prerequisites: [], blockers: [], blocker_count: 0, commands: ['npm run check && npm test && npm run release:audit'] },
      { id: 'cloudflare_worker_permission', title: 'Verify Cloudflare Worker visibility', ready: false, owner: 'operator-or-ai-with-token', prerequisites: ['cloudflare_credentials'], blockers: ['Cloudflare Worker service visibility is blocked by token/account permission'], blocker_count: 1, commands: ['npm run cloudflare:ops -- workers inspect-probe'] },
      { id: 'hosted_backend_refs', title: 'Provision hosted refs', ready: false, owner: 'operator', prerequisites: ['cloudflare_credentials'], blockers: ['hosted_live_ready is false', 'hosted missing refs: 25'], blocker_count: 2, commands: ['npm run production:hosted-live -- --evidence <hosted-backend-live.json>'] },
      { id: 'operator_acceptance', title: 'Complete operator acceptance', ready: false, owner: 'operator-or-reviewer', prerequisites: ['hosted_backend_refs', 'release_gates'], blockers: ['operator acceptance decision blocked'], blocker_count: 1, commands: ['npm run production:acceptance -- --packet <completed-packet.json>'] },
      { id: 'final_release_verification', title: 'Final release verification', ready: false, owner: 'operator-or-reviewer', prerequisites: ['cloudflare_credentials', 'cloudflare_worker_permission', 'hosted_backend_refs', 'operator_acceptance', 'release_gates'], blockers: ['launch_ready is false'], blocker_count: 1, commands: ['npm run production:dependencies'] },
    ],
    ...overrides,
  };
}

test('production status board summarizes current launch posture', () => {
  const board = buildProductionStatusBoard({
    goalAudit: goalAudit(),
    dependencies: dependencies(),
    workplan: workplan(),
  }, { generated_at: '2026-06-24T00:03:00.000Z' });
  assert.equal(board.schema, PRODUCTION_STATUS_BOARD_SCHEMA);
  assert.equal(board.status, 'blocked');
  assert.equal(board.launch_ready, false);
  assert.equal(board.goal_complete, false);
  assert.equal(board.local_package_ready, true);
  assert.equal(board.ready_group_count, 3);
  assert.equal(board.blocked_group_count, 4);
  assert.equal(board.ready_phase_count, 1);
  assert.equal(board.blocked_phase_count, 5);
  assert.equal(board.blocked_deliverable_count, 3);
  assert.equal(board.next_phase.id, 'cloudflare_credentials');
  assert.equal(board.next_phase_id, 'cloudflare_credentials');
  assert.equal(board.first_blocked_group.name, 'cloudflare_credentials');
  assert.deepEqual(board.execution_order_check, { present: true, covers_all_phases: true, next_phase_order_index: 0 });
  assert.deepEqual(board.input_freshness.missing_or_invalid_inputs, []);
  assert.equal(board.input_freshness.max_skew_seconds, 120);
  assert.equal(board.input_freshness.latest_age_seconds, 60);
  assert.equal(board.input_freshness.stale, false);
  assert.equal(board.fresh_input_evidence, true);
  assert.equal(board.evidence_inputs.workplan_dependency_generated_at, '2026-06-24T00:01:00.000Z');
  assert.equal(board.evidence_inputs.workplan_operator_acceptance_generated_at, '2026-06-24T00:00:45.000Z');
  assert.equal(board.evidence_inputs.workplan_hosted_ref_catalog_generated_at, '2026-06-24T00:00:30.000Z');
  assert.equal(board.external_blockers.length, 4);
  assert.match(board.immediate_operator_queue.join('\n'), /production:cloudflare-credentials/);
  assert.equal(new Set(board.immediate_operator_queue).size, board.immediate_operator_queue.length);
  assert.doesNotMatch(JSON.stringify(board), /Bearer\s+[A-Za-z0-9._~+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|sk-[A-Za-z0-9_-]{16,}/i);
});

test('production status board surfaces hosted ref detail summary without full catalog', () => {
  const base = workplan();
  const hostedPhase = {
    id: 'hosted_backend_refs',
    title: 'Provision hosted refs',
    ready: false,
    owner: 'operator',
    prerequisites: ['cloudflare_credentials'],
    blockers: [
      'hosted_live_ready is false',
      'hosted missing refs: 25',
      'missing refs.backend_host',
      'missing refs.dns_tls',
      'missing refs.durable_storage',
      'missing refs.relay_deployment',
      'missing refs.gateway_deployment',
      'missing relay.ref',
      'missing gateway.ref',
    ],
    blocker_count: 9,
    commands: ['npm run production:hosted-live -- --evidence <hosted-backend-live.json>'],
    details: {
      missing_ref_count: 25,
      listed_missing_ref_count: 25,
      blocker_listed_missing_ref_count: 25,
      unlisted_missing_ref_count: 0,
      missing_refs: ['backend_host', 'dns_tls', 'relay_deployment', 'gateway_deployment'],
      missing_ref_groups: { deployment: ['backend_host', 'dns_tls', 'relay_deployment', 'gateway_deployment'] },
      missing_endpoint_refs: ['relay.ref', 'gateway.ref', 'operator_acceptance.ref'],
      hosted_state_blockers: ['hosted_live_ready is false', 'operator acceptance decision is pending'],
      hosted_ref_catalog: { backend_host: { purpose: 'large catalog omitted from status summary' } },
    },
  };
  const board = buildProductionStatusBoard({
    goalAudit: goalAudit(),
    dependencies: dependencies(),
    workplan: workplan({
      ...base,
      next_phase_id: 'hosted_backend_refs',
      phases: base.phases.map((phase) => phase.id === 'hosted_backend_refs' ? hostedPhase : phase),
    }),
  }, { generated_at: '2026-06-24T00:03:00.000Z' });
  assert.equal(board.next_phase.id, 'hosted_backend_refs');
  assert.equal(board.next_phase.omitted_blocker_count, 1);
  assert.equal(board.next_phase.details.missing_ref_count, 25);
  assert.deepEqual(board.next_phase.details.missing_refs, ['backend_host', 'dns_tls', 'relay_deployment', 'gateway_deployment']);
  assert.deepEqual(board.next_phase.details.missing_ref_groups.deployment, ['backend_host', 'dns_tls', 'relay_deployment', 'gateway_deployment']);
  assert.deepEqual(board.next_phase.details.missing_endpoint_refs, ['relay.ref', 'gateway.ref', 'operator_acceptance.ref']);
  assert.equal('hosted_ref_catalog' in board.next_phase.details, false);
});

test('production status board flags stale or invalid input timestamps', () => {
  const board = buildProductionStatusBoard({
    goalAudit: goalAudit({ generated_at: '2026-06-24T00:00:00.000Z' }),
    dependencies: dependencies({ generated_at: '2026-06-24T00:40:00.000Z' }),
    workplan: workplan({ generated_at: 'not-a-date' }),
  }, { generated_at: '2026-06-24T00:41:00.000Z' });
  assert.equal(board.input_freshness.stale, true);
  assert.equal(board.input_freshness.max_skew_seconds, 2400);
  assert.deepEqual(board.input_freshness.missing_or_invalid_inputs, ['workplan']);
});

test('production status board requires nested workplan source timestamps', () => {
  const board = buildProductionStatusBoard({
    goalAudit: goalAudit({ generated_at: '2026-06-24T00:00:00.000Z' }),
    dependencies: dependencies({ generated_at: '2026-06-24T00:00:30.000Z' }),
    workplan: workplan({ generated_at: '2026-06-24T00:00:45.000Z', evidence_inputs: {} }),
  }, { generated_at: '2026-06-24T00:01:00.000Z' });
  assert.equal(board.input_freshness.stale, true);
  assert.deepEqual(board.input_freshness.missing_or_invalid_inputs, [
    'workplan.dependencies',
    'workplan.operator_acceptance',
    'workplan.hosted_ref_catalog',
  ]);
  assert.equal(board.fresh_input_evidence, false);
});

test('production status board does not mark stale ready inputs launch-ready', () => {
  const baseDependencies = dependencies();
  const baseWorkplan = workplan();
  const baseGoal = goalAudit();
  const board = buildProductionStatusBoard({
    goalAudit: goalAudit({
      generated_at: '2026-06-24T00:00:00.000Z',
      complete: true,
      go_live_ready: true,
      deliverables: baseGoal.deliverables.map((deliverable) => ({ ...deliverable, ok: true, blockers: [] })),
    }),
    dependencies: dependencies({
      generated_at: '2026-06-24T00:40:00.000Z',
      status: 'ready',
      launch_ready: true,
      goal_complete: true,
      groups: baseDependencies.groups.map((group) => ({ ...group, ready: true, blockers: [], blocker_count: 0 })),
    }),
    workplan: workplan({
      generated_at: '2026-06-24T00:40:00.000Z',
      status: 'ready',
      launch_ready: true,
      blocked_phase_count: 0,
      next_phase_id: null,
      phases: baseWorkplan.phases.map((phase) => ({ ...phase, ready: true, blockers: [], blocker_count: 0 })),
    }),
  }, { generated_at: '2026-06-24T00:41:00.000Z' });
  assert.equal(board.input_freshness.stale, true);
  assert.equal(board.fresh_input_evidence, false);
  assert.equal(board.status, 'blocked');
  assert.equal(board.launch_ready, false);
  assert.equal(board.next_phase_id, null);
});

test('production status board rejects old all-green inputs with zero skew', () => {
  const baseDependencies = dependencies();
  const baseWorkplan = workplan();
  const baseGoal = goalAudit();
  const oldTimestamp = '2026-06-24T00:00:00.000Z';
  const board = buildProductionStatusBoard({
    goalAudit: goalAudit({
      generated_at: oldTimestamp,
      complete: true,
      go_live_ready: true,
      deliverables: baseGoal.deliverables.map((deliverable) => ({ ...deliverable, ok: true, blockers: [] })),
    }),
    dependencies: dependencies({
      generated_at: oldTimestamp,
      status: 'ready',
      launch_ready: true,
      goal_complete: true,
      groups: baseDependencies.groups.map((group) => ({ ...group, ready: true, blockers: [], blocker_count: 0 })),
    }),
    workplan: workplan({
      generated_at: oldTimestamp,
      status: 'ready',
      launch_ready: true,
      blocked_phase_count: 0,
      next_phase_id: null,
      evidence_inputs: {
        dependency_generated_at: oldTimestamp,
        operator_acceptance_generated_at: oldTimestamp,
        hosted_ref_catalog_generated_at: oldTimestamp,
      },
      phases: baseWorkplan.phases.map((phase) => ({ ...phase, ready: true, blockers: [], blocker_count: 0 })),
    }),
  }, { generated_at: '2026-06-24T00:20:01.000Z' });
  assert.equal(board.input_freshness.max_skew_seconds, 0);
  assert.equal(board.input_freshness.latest_age_seconds, 1201);
  assert.equal(board.input_freshness.stale, true);
  assert.equal(board.fresh_input_evidence, false);
  assert.equal(board.launch_ready, false);
});

test('production status board rejects unsafe source evidence', () => {
  assert.throws(() => buildProductionStatusBoard({
    goalAudit: goalAudit(),
    dependencies: dependencies({ groups: [{ name: 'cloudflare_credentials', ready: false, blockers: ['Bearer abcdefghijklmnopqrstuvwxyz'] }] }),
    workplan: workplan(),
  }), /secret-looking|secret/i);
});

test('production status board CLI writes blocked public-safe JSON with exit 1', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-production-status-'));
  const paths = {
    goal: join(dir, 'goal.json'),
    dependencies: join(dir, 'dependencies.json'),
    workplan: join(dir, 'workplan.json'),
    out: join(dir, 'status.json'),
  };
  await writeFile(paths.goal, `${JSON.stringify(goalAudit(), null, 2)}\n`, 'utf8');
  await writeFile(paths.dependencies, `${JSON.stringify(dependencies(), null, 2)}\n`, 'utf8');
  await writeFile(paths.workplan, `${JSON.stringify(workplan(), null, 2)}\n`, 'utf8');
  await assert.rejects(
    () => execFileAsync(process.execPath, [
      'scripts/build-production-status-board.mjs',
      '--goal-audit', paths.goal,
      '--dependencies', paths.dependencies,
      '--workplan', paths.workplan,
      '--out', paths.out,
    ], { cwd: process.cwd(), timeout: 10000, windowsHide: true }),
    (error) => {
      assert.equal(error.code, 1);
      const stdout = JSON.parse(error.stdout);
      assert.equal(stdout.schema, PRODUCTION_STATUS_BOARD_SCHEMA);
      assert.equal(stdout.next_phase.id, 'cloudflare_credentials');
      assert.doesNotMatch(error.stdout, new RegExp(dir.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')));
      return true;
    },
  );
  const written = JSON.parse(await readFile(paths.out, 'utf8'));
  assert.equal(written.status, 'blocked');
  assert.equal(written.local_package_ready, true);
});
