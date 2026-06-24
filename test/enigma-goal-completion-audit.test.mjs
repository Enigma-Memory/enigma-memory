import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  GOAL_COMPLETION_AUDIT_SCHEMA,
  buildGoalCompletionAudit,
} from '../scripts/build-goal-completion-audit.mjs';
import { buildOperatorAcceptancePacket } from '../scripts/build-operator-acceptance-packet.mjs';

const execFileAsync = promisify(execFile);

async function writeSite() {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-goal-audit-site-'));
  await mkdir(join(dir, 'assets'), { recursive: true });
  await writeFile(join(dir, '_headers'), `/*\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'\n`, 'utf8');
  await writeFile(join(dir, 'index.html'), '<!doctype html><html><head><title>Enigma Memory</title><link rel="stylesheet" href="/style.css"></head><body><script src="/app.js"></script></body></html>\n', 'utf8');
  await writeFile(join(dir, 'style.css'), 'body{font-family:system-ui,sans-serif}\n', 'utf8');
  await writeFile(join(dir, 'app.js'), 'document.body.dataset.ready="true";\n', 'utf8');
  await writeFile(join(dir, 'assets/logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>\n', 'utf8');
  return dir;
}

function fakeFetch({ title = 'Engram — legacy page' } = {}) {
  return async () => ({
    status: 200,
    headers: { get: (name) => name.toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null },
    text: async () => `<!doctype html><html><head><title>${title}</title></head><body>legacy</body></html>`,
  });
}

function readyInfrastructure() {
  return {
    schema: 'enigma.infrastructure_readiness.v1',
    ok: true,
    mode: 'live',
    readiness: {
      contract_ready: true,
      public_live_ready: true,
      cloudflare_observed: true,
      hosted_live_ready: true,
    },
    checks: [
      { name: 'manifest.secret_scan', ok: true },
      { name: 'manifest.schema', ok: true },
      { name: 'readiness.contract', ok: true, missing: [] },
      { name: 'hosted.required_refs', ok: true, missing: [], required_count: 25, missing_count: 0 },
      { name: 'operator_acceptance.decision', ok: true, decision: 'go' },
      { name: 'external_blockers.manifest', ok: true, count: 0 },
      { name: 'hosted.allow_localhost_boundary', ok: true, allow_localhost: false },
      { name: 'public_site.live', ok: true, status: 200 },
      { name: 'relay.live', ok: true, status: 200, has_refs: true },
      { name: 'gateway.live', ok: true, status: 200, has_refs: true },
      { name: 'cloudflare.observation', ok: true, mode: 'required', observed: true },
    ],
    external_blockers: [],
    claim_boundary: ['Readiness summary contains no raw memory plaintext.'],
  };
}

function readyReleaseAudit() {
  return {
    schema: 'enigma.release_audit.v1',
    generated_at: '2026-06-24T00:00:00.000Z',
    ok: true,
    local_only: {
      docker_required: false,
      cloud_credentials_required: false,
      npm_publish_credentials_required: false,
      live_website_required: false,
    },
    required_failed: [],
    gates: [
      { name: 'npm-check', required: true, ok: true },
      { name: 'npm-test', required: true, ok: true },
      { name: 'whitepaper-claims-validator', required: false, ok: true },
      { name: 'release-audit', required: true, ok: true },
    ],
  };
}

async function readyOperatorAcceptancePacket(options = {}) {
  return await buildOperatorAcceptancePacket({
    complete: true,
    generated_at: '2026-06-24T00:00:00.000Z',
    readiness: readyInfrastructure(),
    ...options,
  });
}

test('goal completion audit preserves broad objective and remains blocked without live evidence', async () => {
  const site = await writeSite();
  const audit = await buildGoalCompletionAudit({
    site,
    projectName: 'enigma-memory',
    domain: 'enigmamemory.com',
    liveUrl: 'https://enigmamemory.com/',
    expectTitle: 'Enigma',
    accountId: 'account-fixture',
    objective: 'original objective stays intact',
  }, {
    env: {},
    generated_at: '2026-06-24T00:00:00.000Z',
    fetchImpl: fakeFetch(),
  });

  assert.equal(audit.schema, GOAL_COMPLETION_AUDIT_SCHEMA);
  assert.equal(audit.objective, 'original objective stays intact');
  assert.equal(audit.complete, false);
  assert.equal(audit.go_live_ready, false);
  assert.equal(audit.local_static_artifact_ready, true);
  const byId = new Map(audit.deliverables.map((item) => [item.id, item]));
  assert.equal(byId.get('orchestration-master-plan').ok, true);
  assert.equal(byId.get('whitepaper-math-diagrams').ok, true);
  assert.equal(byId.get('secure-static-site-artifact').ok, true);
  assert.equal(byId.get('local-backend-readiness-smoke').ok, true);
  assert.equal(byId.get('hosted-live-evidence-contract').ok, true);
  assert.equal(byId.get('live-domain-current-site').ok, false);
  assert.equal(byId.get('cloudflare-credentials-present').ok, false);
  assert.equal(byId.get('hosted-backend-live').ok, false);
  assert.equal(byId.get('operator-acceptance-go').ok, false);
  assert.match(byId.get('operator-acceptance-go').blockers.join('\n'), /operator blockers metadata: 6/);
  assert.match(byId.get('operator-acceptance-go').blockers.join('\n'), /operator blockers evidence: 30/);
  assert.match(audit.blockers.join('\n'), /live-domain-current-site/);
  assert.equal(audit.backend_readiness_smoke.ok, true);
  assert.equal(audit.backend_readiness_smoke.check_count, 4);
  assert.match(audit.blockers.join('\n'), /CLOUDFLARE_API_TOKEN/);
  assert.match(audit.blockers.join('\n'), /hosted_live_ready is false/);
  assert.match(audit.blockers.join('\n'), /missing refs\.relay_deployment/);
  assert.match(audit.blockers.join('\n'), /missing refs\.gateway_deployment/);
  assert.doesNotMatch(JSON.stringify(audit), /Bearer|PRIVATE KEY|sk-/i);
});


test('goal completion audit suppresses optional Worker probe action when Worker inspection is ready', async () => {
  const site = await writeSite();
  const dir = await mkdtemp(join(tmpdir(), 'enigma-goal-worker-inspect-'));
  const workerInspectPath = join(dir, 'worker-inspect.json');
  await writeFile(workerInspectPath, JSON.stringify({
    schema: 'enigma.cloudflare_worker_inspection_result.v1',
    worker_permission_ready: true,
  }, null, 2), 'utf8');
  const audit = await buildGoalCompletionAudit({
    site,
    domain: 'enigmamemory.com',
    liveUrl: 'https://enigmamemory.com/',
    expectTitle: 'Enigma',
    workerInspect: workerInspectPath,
  }, {
    env: { CLOUDFLARE_API_TOKEN: 'token', CLOUDFLARE_ACCOUNT_ID: 'account' },
    fetchImpl: fakeFetch({ title: 'Enigma — Verifiable AI memory plane' }),
    generated_at: '2026-06-24T00:00:00.000Z',
  });
  assert.equal(audit.next_actions.some((action) => action.id === 'optional-standalone-worker-probe'), false);
});
test('goal completion audit distinguishes live static site from hosted backend completion', async () => {
  const site = await writeSite();
  const audit = await buildGoalCompletionAudit({
    site,
    projectName: 'enigma-memory',
    domain: 'enigmamemory.com',
    liveUrl: 'https://enigmamemory.com/',
    expectTitle: 'Enigma',
    accountId: 'account-fixture',
  }, {
    env: {
      CLOUDFLARE_API_TOKEN: 'cf-token-present-but-never-printed',
      CLOUDFLARE_ACCOUNT_ID: 'account-fixture',
    },
    generated_at: '2026-06-24T00:00:00.000Z',
    fetchImpl: fakeFetch({ title: 'Enigma — Verifiable AI memory plane' }),
  });

  assert.equal(audit.release_posture, 'static_site_live_with_blocked_hosted_backend');
  assert.equal(audit.complete, false);
  const actionIds = audit.next_actions.map((item) => item.id).join('\n');
  assert.doesNotMatch(actionIds, /create-cloudflare-token|deploy-current-static-site/);
  assert.match(actionIds, /provision-hosted-backend/);
  assert.doesNotMatch(JSON.stringify(audit), /cf-token-present-but-never-printed/);
});

test('goal completion audit can consume completed operator packet while keeping hosted backend blocked', async () => {
  const site = await writeSite();
  const operatorAcceptancePacket = await readyOperatorAcceptancePacket({
    packet_id: 'packet-goal-audit-go',
  });
  const audit = await buildGoalCompletionAudit({
    site,
    projectName: 'enigma-memory',
    domain: 'enigmamemory.com',
    liveUrl: 'https://enigmamemory.com/',
    expectTitle: 'Enigma',
    accountId: 'account-fixture',
    operatorAcceptancePacket,
  }, {
    env: {
      CLOUDFLARE_API_TOKEN: 'cf-token-present-but-never-printed',
      CLOUDFLARE_ACCOUNT_ID: 'account-fixture',
    },
    generated_at: '2026-06-24T00:00:00.000Z',
    fetchImpl: fakeFetch({ title: 'Enigma — Verifiable AI memory plane' }),
  });

  const byId = new Map(audit.deliverables.map((item) => [item.id, item]));
  assert.equal(byId.get('operator-acceptance-go').ok, true);
  assert.equal(byId.get('hosted-backend-live').ok, false);
  assert.equal(audit.complete, false);
  assert.equal(audit.release_posture, 'static_site_live_with_blocked_hosted_backend');
  const actionIds = audit.next_actions.map((item) => item.id).join('\n');
  assert.doesNotMatch(actionIds, /complete-operator-acceptance/);
  assert.match(actionIds, /provision-hosted-backend/);
  assert.doesNotMatch(JSON.stringify(audit), /cf-token-present-but-never-printed|Bearer|PRIVATE KEY|sk-/i);
});

test('goal completion audit can complete only when hosted readiness, operator packet, and release audit are supplied', async () => {
  const site = await writeSite();
  const operatorAcceptancePacket = await readyOperatorAcceptancePacket({
    packet_id: 'packet-goal-full-go',
  });
  const audit = await buildGoalCompletionAudit({
    site,
    projectName: 'enigma-memory',
    domain: 'enigmamemory.com',
    liveUrl: 'https://enigmamemory.com/',
    expectTitle: 'Enigma',
    accountId: 'account-fixture',
    infrastructureReadiness: readyInfrastructure(),
    operatorAcceptancePacket,
    releaseAudit: readyReleaseAudit(),
  }, {
    env: {
      CLOUDFLARE_API_TOKEN: 'cf-token-present-but-never-printed',
      CLOUDFLARE_ACCOUNT_ID: 'account-fixture',
    },
    generated_at: '2026-06-24T00:00:00.000Z',
    fetchImpl: fakeFetch({ title: 'Enigma — Verifiable AI memory plane' }),
  });

  const byId = new Map(audit.deliverables.map((item) => [item.id, item]));
  assert.equal(byId.get('operator-acceptance-go').ok, true);
  assert.equal(byId.get('hosted-backend-live').ok, true);
  assert.equal(byId.get('release-audit-current').ok, true);
  assert.equal(byId.get('whitepaper-math-diagrams').ok, true);
  assert.equal(audit.complete, true);
  assert.equal(audit.release_posture, 'complete');
  assert.deepEqual(audit.next_actions, []);
  assert.doesNotMatch(JSON.stringify(audit), /cf-token-present-but-never-printed|Bearer|PRIVATE KEY|sk-/i);
});

test('goal completion audit rejects unsafe supplied infrastructure readiness instead of completing', async () => {
  const site = await writeSite();
  const operatorAcceptancePacket = await readyOperatorAcceptancePacket({
    packet_id: 'packet-goal-unsafe-readiness',
  });
  const blockedReadiness = readyInfrastructure();
  blockedReadiness.readiness.hosted_live_ready = true;
  blockedReadiness.checks.push({ name: 'relay.readyz', ok: false });
  await assert.rejects(() => buildGoalCompletionAudit({
    site,
    projectName: 'enigma-memory',
    domain: 'enigmamemory.com',
    liveUrl: 'https://enigmamemory.com/',
    expectTitle: 'Enigma',
    accountId: 'account-fixture',
    infrastructureReadiness: blockedReadiness,
    operatorAcceptancePacket,
  }, {
    env: {
      CLOUDFLARE_API_TOKEN: 'cf-token-present-but-never-printed',
      CLOUDFLARE_ACCOUNT_ID: 'account-fixture',
    },
    generated_at: '2026-06-24T00:00:00.000Z',
    fetchImpl: fakeFetch({ title: 'Enigma — Verifiable AI memory plane' }),
  }), /failed checks/);
});

test('goal completion audit rejects unsafe operator readiness and objective text', async () => {
  const site = await writeSite();
  const weakReadiness = readyInfrastructure();
  weakReadiness.readiness.contract_ready = false;
  const weakOperatorPacket = await readyOperatorAcceptancePacket({
    packet_id: 'packet-goal-weak-readiness',
    readiness: weakReadiness,
  });
  await assert.rejects(() => buildGoalCompletionAudit({
    site,
    projectName: 'enigma-memory',
    domain: 'enigmamemory.com',
    liveUrl: 'https://enigmamemory.com/',
    expectTitle: 'Enigma',
    accountId: 'account-fixture',
    operatorAcceptancePacket: weakOperatorPacket,
  }, {
    env: {
      CLOUDFLARE_API_TOKEN: 'cf-token-present-but-never-printed',
      CLOUDFLARE_ACCOUNT_ID: 'account-fixture',
    },
    generated_at: '2026-06-24T00:00:00.000Z',
    fetchImpl: fakeFetch({ title: 'Enigma — Verifiable AI memory plane' }),
  }), /readiness\.contract_ready:true/);

  await assert.rejects(() => buildGoalCompletionAudit({
    site,
    projectName: 'enigma-memory',
    domain: 'enigmamemory.com',
    liveUrl: 'https://enigmamemory.com/',
    expectTitle: 'Enigma',
    accountId: 'account-fixture',
    objective: 'ship private prompt transcript',
  }, {
    env: {},
    generated_at: '2026-06-24T00:00:00.000Z',
    fetchImpl: fakeFetch(),
  }), /goal completion audit\.objective.*raw-memory material/);
});

test('goal completion audit CLI writes public-safe JSON', async () => {
  const site = await writeSite();
  const outPath = join(await mkdtemp(join(tmpdir(), 'enigma-goal-audit-out-')), 'audit.json');
  const result = await execFileAsync(process.execPath, [
    'scripts/build-goal-completion-audit.mjs',
    '--site', site,
    '--project-name', 'enigma-memory',
    '--domain', 'enigmamemory.com',
    '--account-id', 'account-fixture',
    '--out', outPath,
  ], {
    cwd: process.cwd(),
    env: { ...process.env, CLOUDFLARE_API_TOKEN: '' },
    timeout: 15000,
    windowsHide: true,
  });
  assert.equal(result.stderr, '');
  const stdoutAudit = JSON.parse(result.stdout);
  const fileAudit = JSON.parse(await readFile(outPath, 'utf8'));
  assert.equal(stdoutAudit.schema, GOAL_COMPLETION_AUDIT_SCHEMA);
  assert.equal(fileAudit.schema, GOAL_COMPLETION_AUDIT_SCHEMA);
  assert.equal(stdoutAudit.complete, false);
  assert.equal(stdoutAudit.release_posture, 'local_package_artifact_ready_with_blocked_live_infrastructure');
  assert.match(stdoutAudit.next_actions.map((item) => item.id).join('\n'), /final-release-audit/);
  assert.doesNotMatch(result.stdout, /Bearer|PRIVATE KEY|sk-/i);
  assert.doesNotMatch(result.stdout, /enigma-goal-audit-site-/i);
});

test('goal completion audit CLI redacts unreadable packet paths from errors', async () => {
  const site = await writeSite();
  const missingPacketPath = join(tmpdir(), 'enigma-goal-audit-missing-packet', 'operator-packet.json');
  await assert.rejects(async () => execFileAsync(process.execPath, [
    'scripts/build-goal-completion-audit.mjs',
    '--site', site,
    '--project-name', 'enigma-memory',
    '--domain', 'enigmamemory.com',
    '--account-id', 'account-fixture',
    '--operator-acceptance-packet', missingPacketPath,
  ], {
    cwd: process.cwd(),
    env: { ...process.env, CLOUDFLARE_API_TOKEN: '' },
    timeout: 15000,
    windowsHide: true,
  }), (error) => {
    assert.match(error.stdout, /operator acceptance packet JSON could not be read/);
    assert.doesNotMatch(error.stdout, /enigma-goal-audit-missing-packet|operator-packet\.json|enigma-goal-audit-site-/i);
    return true;
  });
});

test('goal completion audit CLI accepts completed operator packet path without completing hosted backend', async () => {
  const site = await writeSite();
  const dir = await mkdtemp(join(tmpdir(), 'enigma-goal-audit-operator-packet-'));
  const operatorPacketPath = join(dir, 'operator-packet.json');
  const operatorAcceptancePacket = await readyOperatorAcceptancePacket({
    packet_id: 'packet-goal-cli-go',
  });
  await writeFile(operatorPacketPath, `${JSON.stringify(operatorAcceptancePacket, null, 2)}\n`, 'utf8');
  const result = await execFileAsync(process.execPath, [
    'scripts/build-goal-completion-audit.mjs',
    '--site', site,
    '--project-name', 'enigma-memory',
    '--domain', 'enigmamemory.com',
    '--account-id', 'account-fixture',
    '--live-url', 'data:text/html,%3Ctitle%3EEnigma%20%E2%80%94%20Verifiable%20AI%20memory%20plane%3C%2Ftitle%3E',
    '--operator-acceptance-packet', operatorPacketPath,
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CLOUDFLARE_API_TOKEN: 'cf-token-present-but-never-printed',
      CLOUDFLARE_ACCOUNT_ID: 'account-fixture',
    },
    timeout: 15000,
    windowsHide: true,
  });
  assert.equal(result.stderr, '');
  const audit = JSON.parse(result.stdout);
  const byId = new Map(audit.deliverables.map((item) => [item.id, item]));
  assert.equal(byId.get('operator-acceptance-go').ok, true);
  assert.equal(byId.get('hosted-backend-live').ok, false);
  assert.equal(audit.complete, false);
  assert.doesNotMatch(audit.next_actions.map((item) => item.id).join('\n'), /complete-operator-acceptance/);
  assert.match(audit.next_actions.map((item) => item.id).join('\n'), /provision-hosted-backend/);
  assert.doesNotMatch(result.stdout, /cf-token-present-but-never-printed|Bearer|PRIVATE KEY|sk-|Enigma operator fixture|ticket:\/\/security_owner\/approval/i);
  assert.doesNotMatch(result.stdout, /enigma-goal-audit-operator-packet-|enigma-goal-audit-site-/i);
});

test('goal completion audit CLI accepts readiness, operator packet, and release audit paths without leaking local paths', async () => {
  const site = await writeSite();
  const dir = await mkdtemp(join(tmpdir(), 'enigma-goal-audit-complete-inputs-'));
  const operatorPacketPath = join(dir, 'operator-packet.json');
  const infrastructureReadinessPath = join(dir, 'infrastructure-readiness.json');
  const releaseAuditPath = join(dir, 'release-audit.json');
  const operatorAcceptancePacket = await readyOperatorAcceptancePacket({
    packet_id: 'packet-goal-cli-full-go',
  });
  await writeFile(operatorPacketPath, `${JSON.stringify(operatorAcceptancePacket, null, 2)}\n`, 'utf8');
  await writeFile(infrastructureReadinessPath, `${JSON.stringify(readyInfrastructure(), null, 2)}\n`, 'utf8');
  await writeFile(releaseAuditPath, `${JSON.stringify(readyReleaseAudit(), null, 2)}\n`, 'utf8');
  const result = await execFileAsync(process.execPath, [
    'scripts/build-goal-completion-audit.mjs',
    '--site', site,
    '--project-name', 'enigma-memory',
    '--domain', 'enigmamemory.com',
    '--account-id', 'account-fixture',
    '--live-url', 'data:text/html,%3Ctitle%3EEnigma%20%E2%80%94%20Verifiable%20AI%20memory%20plane%3C%2Ftitle%3E',
    '--infrastructure-readiness', infrastructureReadinessPath,
    '--operator-acceptance-packet', operatorPacketPath,
    '--release-audit', releaseAuditPath,
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CLOUDFLARE_API_TOKEN: 'cf-token-present-but-never-printed',
      CLOUDFLARE_ACCOUNT_ID: 'account-fixture',
    },
    timeout: 15000,
    windowsHide: true,
  });
  assert.equal(result.stderr, '');
  const audit = JSON.parse(result.stdout);
  assert.equal(audit.complete, false);
  assert.notEqual(audit.release_posture, 'complete');
  assert.match(audit.blockers.join('\n'), /live-domain-current-site|live URL/);
  assert.doesNotMatch(result.stdout, /cf-token-present-but-never-printed|Bearer|PRIVATE KEY|sk-|Enigma operator fixture|ticket:\/\/security_owner\/approval/i);
  assert.doesNotMatch(result.stdout, /enigma-goal-audit-complete-inputs-|enigma-goal-audit-site-/i);
});
