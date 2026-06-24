import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  PRODUCTION_DEPENDENCY_REPORT_SCHEMA,
  buildProductionDependencyReport,
} from '../scripts/build-production-dependency-report.mjs';

const execFileAsync = promisify(execFile);

function goalAudit(overrides = {}) {
  return {
    schema: 'enigma.goal_completion_audit.v1',
    complete: false,
    go_live_ready: false,
    release_posture: 'static_site_live_with_blocked_hosted_backend',
    deliverables: [
      { id: 'live-domain-current-site', ok: true, evidence: ['https://enigmamemory.com/'], blockers: [] },
      { id: 'whitepaper-math-diagrams', ok: true, evidence: ['docs/enigma-memory-technical-whitepaper.md', 'release audit gate whitepaper-claims-validator'], blockers: [] },
      { id: 'cloudflare-credentials-present', ok: false, evidence: ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'], blockers: ['CLOUDFLARE_API_TOKEN and/or CLOUDFLARE_ACCOUNT_ID absent from current environment'] },
      { id: 'hosted-backend-live', ok: false, evidence: ['npm run infrastructure:readiness'], blockers: ['hosted missing refs: 25'] },
      { id: 'operator-acceptance-go', ok: false, evidence: ['npm run production:acceptance'], blockers: ['operator acceptance decision blocked'] },
    ],
    next_actions: [
      { id: 'provision-hosted-backend', owner: 'operator', command: 'npm run infrastructure:readiness -- --manifest <completed>', evidence: 'hosted refs' },
      { id: 'complete-operator-acceptance', owner: 'operator', command: 'npm run production:acceptance -- --packet <completed-packet.json>', evidence: 'operator go' },
    ],
    ...overrides,
  };
}

function releaseAudit(overrides = {}) {
  return {
    schema: 'enigma.release_audit.v1',
    ok: true,
    required_failed: [],
    gates: [
      { name: 'npm-check', ok: true, required: true },
      { name: 'npm-test', ok: true, required: true },
      { name: 'whitepaper-claims-validator', ok: true, required: false },
    ],
    ...overrides,
  };
}

function workerInspect(overrides = {}) {
  return {
    schema: 'enigma.cloudflare_worker_inspection_result.v1',
    ok: true,
    worker_permission_ready: false,
    permission_blockers: ['Cloudflare Worker service visibility is blocked by token/account permission'],
    ...overrides,
  };
}

function whitepaper(overrides = {}) {
  return {
    schema: 'enigma.whitepaper_claims_result.v1',
    ok: true,
    blockers: [],
    ...overrides,
  };
}

function cloudflareCredentials(overrides = {}) {
  return {
    schema: 'enigma.cloudflare_credentials_result.v1',
    ok: false,
    credentials_present: false,
    present_keys: [],
    blockers: ['CLOUDFLARE_API_TOKEN absent from current environment'],
    token_value_printed: false,
    account_id_printed: false,
    ...overrides,
  };
}

function edgeDeploy(overrides = {}) {
  return {
    schema: 'enigma.edge_backend_deployment.v1',
    ok: true,
    status: 'deployed',
    execute: true,
    provision_secrets: true,
    service_count: 2,
    services: [
      { service: 'relay', worker_name: 'enigma-relay', hostname: 'relay.enigmamemory.com', deployed: true },
      { service: 'gateway', worker_name: 'enigma-gateway', hostname: 'gateway.enigmamemory.com', deployed: true },
    ],
    blockers: [],
    ...overrides,
  };
}


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
        probes: { livez: { status_code: 200 }, readyz: { status_code: 503 } },
      },
      gateway: {
        service: 'enigma-gateway',
        hostname: 'gateway.enigmamemory.com',
        dns: { ok: true, a_record_count: 2 },
        probes: { livez: { status_code: 200 }, readyz: { status_code: 503 } },
      },
    },
    blockers: [],
    ...overrides,
  };
}

function storageBootstrap(overrides = {}) {
  return {
    schema: 'enigma.cloudflare_storage_bootstrap.v1',
    ok: true,
    status: 'accepted',
    execute: true,
    resource_count: 3,
    observed_resource_count: 3,
    created_resource_count: 0,
    resources: [
      { kind: 'd1_database', name: 'enigma-memory-production-ledger', ref: 'cloudflare-d1://enigma-memory-production-ledger', observed: true },
      { kind: 'kv_namespace', name: 'enigma-memory-production-relay-audit', ref: 'cloudflare-kv://enigma-memory-production-relay-audit', observed: true },
      { kind: 'kv_namespace', name: 'enigma-memory-production-gateway-audit', ref: 'cloudflare-kv://enigma-memory-production-gateway-audit', observed: true },
    ],
    blockers: [],
    ...overrides,
  };
}



test('production dependency report summarizes launch blockers without overclaiming', () => {
  const report = buildProductionDependencyReport({
    goalAudit: goalAudit(),
    releaseAudit: releaseAudit(),
    workerInspect: workerInspect(),
    whitepaper: whitepaper(),
  }, { generated_at: '2026-06-24T00:00:00.000Z' });
  assert.equal(report.schema, PRODUCTION_DEPENDENCY_REPORT_SCHEMA);
  assert.equal(report.status, 'blocked');
  assert.equal(report.launch_ready, false);
  assert.equal(report.goal_complete, false);
  const groups = new Map(report.groups.map((item) => [item.name, item]));
  assert.equal(groups.get('release_gates').ready, true);
  assert.equal(groups.get('whitepaper_claims').ready, true);
  assert.equal(groups.get('cloudflare_credentials').ready, false);
  assert.equal(groups.get('cloudflare_worker_permission').ready, false);
  assert.equal(groups.get('hosted_backend_live').ready, false);
  assert.equal(groups.get('operator_acceptance').ready, false);
  assert.match(report.blockers.join('\n'), /hosted missing refs|operator acceptance|Worker service visibility|CLOUDFLARE_API_TOKEN/);
  const actionIds = report.next_actions.map((item) => item.id);
  assert.ok(actionIds.includes('generate-operator-evidence-starter'));
  assert.ok(actionIds.indexOf('generate-operator-evidence-starter') < actionIds.indexOf('generate-backend-env-kit'));
  assert.ok(actionIds.indexOf('generate-operator-evidence-starter') < actionIds.indexOf('complete-operator-acceptance'));
});

test('production dependency report surfaces edge backend deployment evidence', () => {
  const report = buildProductionDependencyReport({
    goalAudit: goalAudit(),
    releaseAudit: releaseAudit(),
    workerInspect: workerInspect({ worker_permission_ready: true, permission_blockers: [] }),
    whitepaper: whitepaper(),
    edgeDeploy: edgeDeploy(),
  }, { generated_at: '2026-06-24T00:00:00.000Z' });
  const groups = new Map(report.groups.map((item) => [item.name, item]));
  assert.equal(groups.get('edge_backend_deployment').ready, true);
  assert.equal(groups.get('hosted_backend_live').ready, false);
  assert.match(groups.get('edge_backend_deployment').evidence.join('\n'), /relay\.enigmamemory\.com/);
  assert.equal(report.launch_ready, false);

  const blocked = buildProductionDependencyReport({
    goalAudit: goalAudit(),
    releaseAudit: releaseAudit(),
    workerInspect: workerInspect(),
    whitepaper: whitepaper(),
    edgeDeploy: edgeDeploy({ status: 'planned', blockers: ['dry-run only'] }),
  }, { generated_at: '2026-06-24T00:00:00.000Z' });
  assert.match(blocked.blockers.join('\n'), /edge_backend_deployment: dry-run only/);
});

test('production dependency report surfaces ready edge backend bootstrap separately from hosted readiness', () => {
  const report = buildProductionDependencyReport({
    goalAudit: goalAudit(),
    releaseAudit: releaseAudit(),
    workerInspect: workerInspect({ worker_permission_ready: true, permission_blockers: [] }),
    whitepaper: whitepaper(),
    edgeLive: edgeLive(),
  }, { generated_at: '2026-06-24T00:00:00.000Z' });
  const groups = new Map(report.groups.map((item) => [item.name, item]));
  assert.equal(groups.get('edge_backend_bootstrap').ready, true);
  assert.equal(groups.get('hosted_backend_live').ready, false);
  assert.equal(report.launch_ready, false);
  assert.match(groups.get('edge_backend_bootstrap').evidence.join('\n'), /relay\.enigmamemory\.com\/livez/);
  assert.doesNotMatch(report.blockers.join('\n'), /edge_backend_bootstrap/);
});

test('production dependency report blocks unsafe or failed edge bootstrap evidence', () => {
  const failed = buildProductionDependencyReport({
    goalAudit: goalAudit(),
    releaseAudit: releaseAudit(),
    workerInspect: workerInspect({ worker_permission_ready: true, permission_blockers: [] }),
    whitepaper: whitepaper(),
    edgeLive: edgeLive({ ok: false, blockers: ['relay readyz did not fail closed'] }),
  }, { generated_at: '2026-06-24T00:00:00.000Z' });
  const failedGroups = new Map(failed.groups.map((item) => [item.name, item]));
  assert.equal(failedGroups.get('edge_backend_bootstrap').ready, false);
  assert.match(failed.blockers.join('\n'), /edge_backend_bootstrap: relay readyz did not fail closed/);

  assert.throws(() => buildProductionDependencyReport({
    goalAudit: goalAudit(),
    releaseAudit: releaseAudit(),
    workerInspect: workerInspect(),
    whitepaper: whitepaper(),
    edgeLive: edgeLive({ services: { relay: { account_id: 'not-public' } } }),
  }), /not allowed|non-public/);
});

test('production dependency report surfaces Cloudflare storage bootstrap as non-readiness evidence', () => {
  const report = buildProductionDependencyReport({
    goalAudit: goalAudit(),
    releaseAudit: releaseAudit(),
    workerInspect: workerInspect({ worker_permission_ready: true, permission_blockers: [] }),
    whitepaper: whitepaper(),
    storageBootstrap: storageBootstrap(),
  }, { generated_at: '2026-06-24T00:00:00.000Z' });
  const groups = new Map(report.groups.map((item) => [item.name, item]));
  assert.equal(groups.get('cloudflare_storage_bootstrap').ready, true);
  assert.equal(groups.get('hosted_backend_live').ready, false);
  assert.match(groups.get('cloudflare_storage_bootstrap').evidence.join('\n'), /cloudflare-d1:\/\/enigma-memory-production-ledger/);
  assert.equal(report.launch_ready, false);

  const blocked = buildProductionDependencyReport({
    goalAudit: goalAudit(),
    releaseAudit: releaseAudit(),
    workerInspect: workerInspect(),
    whitepaper: whitepaper(),
    storageBootstrap: storageBootstrap({ ok: false, blockers: ['planned only'] }),
  }, { generated_at: '2026-06-24T00:00:00.000Z' });
  assert.match(blocked.blockers.join('\n'), /cloudflare_storage_bootstrap: planned only/);
});

test('production dependency report keeps Cloudflare credentials as a first-class blocker', () => {
  const report = buildProductionDependencyReport({
    goalAudit: goalAudit({
      complete: true,
      go_live_ready: false,
      deliverables: [
        { id: 'live-domain-current-site', ok: true, evidence: ['https://enigmamemory.com/'], blockers: [] },
        { id: 'whitepaper-math-diagrams', ok: true, evidence: ['docs/enigma-memory-technical-whitepaper.md', 'release audit gate whitepaper-claims-validator'], blockers: [] },
        { id: 'cloudflare-credentials-present', ok: false, evidence: ['CLOUDFLARE_API_TOKEN'], blockers: ['credential absent'] },
        { id: 'hosted-backend-live', ok: true, evidence: ['npm run infrastructure:readiness'], blockers: [] },
        { id: 'operator-acceptance-go', ok: true, evidence: ['npm run production:acceptance'], blockers: [] },
      ],
    }),
    releaseAudit: releaseAudit(),
    workerInspect: workerInspect({ worker_permission_ready: true, permission_blockers: [] }),
    whitepaper: whitepaper(),
  }, { generated_at: '2026-06-24T00:00:00.000Z' });
  const credentials = report.groups.find((item) => item.name === 'cloudflare_credentials');
  assert.equal(credentials.ready, false);
  assert.match(credentials.blockers.join('\n'), /credential absent/);
  assert.equal(report.status, 'blocked');
  assert.equal(report.launch_ready, false);
});

test('production dependency report can use credential validator evidence', () => {
  const report = buildProductionDependencyReport({
    goalAudit: goalAudit(),
    releaseAudit: releaseAudit(),
    workerInspect: workerInspect(),
    whitepaper: whitepaper(),
    cloudflareCredentials: cloudflareCredentials({
      ok: true,
      credentials_present: true,
      present_keys: ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'],
      blockers: [],
    }),
  }, { generated_at: '2026-06-24T00:00:00.000Z' });
  const credentials = report.groups.find((item) => item.name === 'cloudflare_credentials');
  assert.equal(credentials.ready, true);
  assert.equal(credentials.next_command, null);
  assert.equal(report.groups.find((item) => item.name === 'release_gates').next_command, null);
  assert.match(credentials.evidence.join('\\n'), /production:cloudflare-credentials/);
  assert.doesNotMatch(JSON.stringify(report), /Bearer|PRIVATE KEY|account-fixture|11112222333344445555666677778888/i);
});

test('production dependency report prioritizes optional Worker probe before hosted provisioning when not ready', () => {
  const report = buildProductionDependencyReport({
    goalAudit: goalAudit({
      next_actions: [
        { id: 'generate-backend-env-kit', owner: 'operator-or-reviewer', command: 'backend env', evidence: 'backend kit' },
        { id: 'optional-standalone-worker-probe', owner: 'operator-or-ai-with-token', command: 'deploy probe', evidence: 'probe evidence' },
        { id: 'complete-operator-acceptance', owner: 'operator', command: 'acceptance', evidence: 'operator go' },
      ],
    }),
    releaseAudit: releaseAudit(),
    workerInspect: workerInspect({ status: 'blocked', worker_permission_ready: false, permission_blockers: ['missing worker'] }),
    whitepaper: whitepaper(),
    cloudflareCredentials: cloudflareCredentials({
      ok: true,
      credentials_present: true,
      present_keys: ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'],
      blockers: [],
    }),
  }, { generated_at: '2026-06-24T00:00:00.000Z' });
  assert.equal(report.next_actions[0].id, 'optional-standalone-worker-probe');
  assert.equal(report.next_actions[1].id, 'generate-operator-evidence-starter');
});

test('production dependency report adds Worker probe action when permission evidence is missing', () => {
  const report = buildProductionDependencyReport({
    goalAudit: goalAudit({
      next_actions: [
        { id: 'generate-backend-env-kit', owner: 'operator-or-reviewer', command: 'backend env', evidence: 'backend kit' },
        { id: 'provision-hosted-backend', owner: 'operator', command: 'provision refs', evidence: 'hosted refs' },
      ],
    }),
    releaseAudit: releaseAudit(),
    workerInspect: workerInspect({ status: 'blocked', worker_permission_ready: false, permission_blockers: ['missing worker'] }),
    whitepaper: whitepaper(),
    cloudflareCredentials: cloudflareCredentials({
      ok: true,
      credentials_present: true,
      present_keys: ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'],
      blockers: [],
    }),
  }, { generated_at: '2026-06-24T00:00:00.000Z' });
  const action = report.next_actions[0];
  assert.equal(action.id, 'optional-standalone-worker-probe');
  assert.match(action.command, /production:hosted-probe/);
  assert.match(action.command, /workers inspect-probe/);
  assert.match(action.evidence, /permission evidence only/);
});

test('production dependency report drops completed Worker probe next action', () => {
  const report = buildProductionDependencyReport({
    goalAudit: goalAudit({
      next_actions: [
        { id: 'optional-standalone-worker-probe', owner: 'operator-or-ai-with-token', command: 'deploy probe', evidence: 'probe evidence' },
        { id: 'provision-hosted-backend', owner: 'operator', command: 'provision refs', evidence: 'hosted refs' },
        { id: 'complete-operator-acceptance', owner: 'operator', command: 'acceptance', evidence: 'operator go' },
        { id: 'generate-operator-evidence-starter', owner: 'operator-or-reviewer', command: 'starter', evidence: 'starter evidence' },
      ],
    }),
    releaseAudit: releaseAudit(),
    workerInspect: workerInspect({ worker_permission_ready: true, permission_blockers: [] }),
    whitepaper: whitepaper(),
    cloudflareCredentials: cloudflareCredentials({
      ok: true,
      credentials_present: true,
      present_keys: ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'],
      blockers: [],
    }),
  }, { generated_at: '2026-06-24T00:00:00.000Z' });
  assert.deepEqual(report.next_actions.map((item) => item.id), [
    'generate-operator-evidence-starter',
    'generate-backend-env-kit',
    'provision-hosted-backend',
    'complete-operator-acceptance',
  ]);
});

test('production dependency report requires whitepaper release-audit gate', () => {
  const report = buildProductionDependencyReport({
    goalAudit: goalAudit(),
    releaseAudit: releaseAudit({ gates: [{ name: 'npm-check', ok: true, required: true }] }),
    workerInspect: workerInspect({ worker_permission_ready: true, permission_blockers: [] }),
    whitepaper: whitepaper(),
  }, { generated_at: '2026-06-24T00:00:00.000Z' });
  const whitepaperGroup = report.groups.find((item) => item.name === 'whitepaper_claims');
  assert.equal(whitepaperGroup.ready, false);
  assert.match(whitepaperGroup.blockers.join('\n'), /whitepaper-claims-validator/);
});

test('production dependency report rejects unsafe evidence', () => {
  assert.throws(() => buildProductionDependencyReport({
    goalAudit: goalAudit({ account_id: '11112222333344445555666677778888' }),
    releaseAudit: releaseAudit(),
    workerInspect: workerInspect(),
    whitepaper: whitepaper(),
  }), /not allowed|non-public/);
  assert.throws(() => buildProductionDependencyReport({
    goalAudit: goalAudit(),
    releaseAudit: releaseAudit(),
    workerInspect: workerInspect({ bearer: 'Bearer abcdefghijklmnopqrstuvwxyz' }),
    whitepaper: whitepaper(),
  }), /not allowed|non-public/);
});

test('production dependency report CLI writes blocked public-safe JSON with exit 1', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-dependency-report-'));
  const paths = {
    goal: join(dir, 'goal.json'),
    release: join(dir, 'release.json'),
    worker: join(dir, 'worker.json'),
    whitepaper: join(dir, 'whitepaper.json'),
    credentials: join(dir, 'credentials.json'),
    out: join(dir, 'report.json'),
  };
  await writeFile(paths.goal, `${JSON.stringify(goalAudit(), null, 2)}\n`, 'utf8');
  await writeFile(paths.release, `${JSON.stringify(releaseAudit(), null, 2)}\n`, 'utf8');
  await writeFile(paths.worker, `${JSON.stringify(workerInspect(), null, 2)}\n`, 'utf8');
  await writeFile(paths.whitepaper, `${JSON.stringify(whitepaper(), null, 2)}\n`, 'utf8');
  await writeFile(paths.credentials, `${JSON.stringify(cloudflareCredentials(), null, 2)}\n`, 'utf8');
  let error;
  try {
    await execFileAsync(process.execPath, [
      'scripts/build-production-dependency-report.mjs',
      '--goal-audit', paths.goal,
      '--release-audit', paths.release,
      '--worker-inspect', paths.worker,
      '--whitepaper', paths.whitepaper,
      '--cloudflare-credentials', paths.credentials,
      '--out', paths.out,
    ], { cwd: process.cwd(), timeout: 10000, windowsHide: true });
  } catch (caught) {
    error = caught;
  }
  assert.equal(error?.code, 1);
  assert.equal(error.stderr, '');
  const stdoutReport = JSON.parse(error.stdout);
  const fileReport = JSON.parse(await readFile(paths.out, 'utf8'));
  assert.deepEqual(fileReport, stdoutReport);
  assert.equal(stdoutReport.schema, PRODUCTION_DEPENDENCY_REPORT_SCHEMA);
  assert.equal(stdoutReport.launch_ready, false);
  assert.doesNotMatch(error.stdout, /Bearer|PRIVATE KEY|sk-[A-Za-z0-9_-]{16,}|11112222333344445555666677778888|C:\\Users\\/i);
});
