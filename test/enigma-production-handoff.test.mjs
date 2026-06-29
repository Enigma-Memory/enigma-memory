import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  PRODUCTION_HANDOFF_PACKET_SCHEMA,
  buildProductionHandoffPacket,
  renderProductionHandoffPlain,
} from '../scripts/build-production-handoff-packet.mjs';
import { buildOperatorAcceptancePacket } from '../scripts/build-operator-acceptance-packet.mjs';

const execFileAsync = promisify(execFile);

async function writeSite() {
  const dir = await mkdtemp(join(tmpdir(), 'enigma production handoff site-'));
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


async function readyOperatorAcceptancePacket(options = {}) {
  return await buildOperatorAcceptancePacket({
    complete: true,
    generated_at: '2026-06-24T00:00:00.000Z',
    readiness: readyInfrastructure(),
    ...options,
  });
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

test('production handoff packet summarizes current blockers without secrets', async () => {
  const site = await writeSite();
  const token = 'cf-token-present-but-never-printed';
  const packet = await buildProductionHandoffPacket({
    site,
    projectName: 'enigma-memory',
    domain: 'enigmamemory.com',
    liveUrl: 'https://enigmamemory.com/',
    expectTitle: 'Enigma',
  }, {
    env: { CLOUDFLARE_API_TOKEN: token },
    generated_at: '2026-06-24T00:00:00.000Z',
    fetchImpl: fakeFetch(),
  });

  assert.equal(packet.schema, PRODUCTION_HANDOFF_PACKET_SCHEMA);
  assert.equal(packet.local_static_artifact_ready, true);
  assert.equal(packet.credentials_present.cloudflare_api_token, true);
  assert.equal(packet.go_live_ready, false);
  assert.equal(packet.pages.local_artifact_ready, true);
  assert.equal(packet.pages.automated_deploy_ready, false);
  assert.equal(packet.pages.live_observation.title_matched, false);
  assert.equal(packet.infrastructure.hosted_live_ready, false);
  assert.equal(packet.infrastructure.hosted_required_ref_missing_count, 25);
  assert.equal(packet.operator_acceptance.decision, 'blocked');
  assert.equal(packet.operator_acceptance.blocker_breakdown.metadata, 6);
  assert.equal(packet.operator_acceptance.blocker_breakdown.owners, 11);
  assert.equal(packet.operator_acceptance.blocker_breakdown.evidence, 30);
  assert.equal(packet.operator_acceptance.blocker_breakdown.readiness, 3);
  assert.equal(packet.operator_acceptance.blocker_breakdown.manifest, 2);
  assert.equal(packet.operator_acceptance.blocker_breakdown.release_audit, 2);
  assert.equal(packet.hosted_probe_worker.schema, 'enigma.hosted_probe_worker_bundle.v1');
  assert.equal(packet.hosted_probe_worker.ok, true);
  assert.deepEqual(packet.hosted_probe_worker.default_routes, ['/livez', '/readyz']);
  assert.equal(packet.hosted_probe_worker.mutates_cloudflare, false);
  assert.match(packet.next_actions.map((item) => item.id).join('\n'), /deploy-current-static-site/);
  assert.match(packet.next_actions.map((item) => item.id).join('\n'), /validate-hosted-backend-live-evidence/);
  assert.match(packet.next_actions.map((item) => item.id).join('\n'), /optional-standalone-worker-probe/);
  assert.match(packet.next_actions.map((item) => item.id).join('\n'), /generate-operator-evidence-starter/);
  assert.match(packet.next_actions.find((item) => item.id === 'generate-operator-evidence-starter')?.evidence ?? '', /acceptance-fill-plan\.json/);
  assert.match(packet.next_actions.find((item) => item.id === 'generate-operator-evidence-starter')?.evidence ?? '', /owner-approval-refs\.template\.json/);
  assert.match(packet.next_actions.find((item) => item.id === 'generate-operator-evidence-starter')?.evidence ?? '', /evidence-refs\.template\.json/);
  assert.match(packet.next_actions.find((item) => item.id === 'optional-standalone-worker-probe')?.command ?? '', /workers inspect-probe/);
  assert.doesNotMatch(JSON.stringify(packet.next_actions), /cloudflare:ops -- [^"]* -- --/);
  assert.match(packet.next_actions.find((item) => item.id === 'deploy-current-static-site')?.command ?? '', /cloudflare:pages:stage .*--site \.enigma\/cloudflare-pages\/enigmamemory\.com/);
  assert.match(packet.blockers.join('\n'), /missing refs\.backend_host/);
  assert.doesNotMatch(JSON.stringify(packet), new RegExp(token));
  assert.doesNotMatch(JSON.stringify(packet), /Bearer|PRIVATE KEY|sk-/i);
  assert.equal(packet.project.local_site_path_redacted, true);
  assert.doesNotMatch(JSON.stringify(packet), /enigma production handoff site-/);
});

test('production handoff plain output is readable and claim-bounded', async () => {
  const site = await writeSite();
  const packet = await buildProductionHandoffPacket({
    site,
    projectName: 'enigma-memory',
    domain: 'enigmamemory.com',
    liveUrl: 'https://enigmamemory.com/',
    expectTitle: 'Enigma',
  }, {
    env: { CLOUDFLARE_API_TOKEN: 'cf-token-present-but-never-printed' },
    generated_at: '2026-06-24T00:00:00.000Z',
    fetchImpl: fakeFetch(),
  });
  const plain = renderProductionHandoffPlain(packet);

  assert.match(plain, /^Enigma production handoff\n/);
  assert.match(plain, /Status: Needs attention/);
  assert.match(plain, /Domain: enigmamemory\.com/);
  assert.match(plain, /Go-live ready: no/);
  assert.match(plain, /Blockers: /);
  assert.match(plain, /Next: /);
  assert.match(plain, /Boundary: public-safe production handoff summary only/);
  assert.doesNotMatch(plain, /^\s*\{/);
  assert.doesNotMatch(plain, /cf-token-present|Bearer|PRIVATE KEY|sk-|raw_memory|C:\\Users\\|\/home\/|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/i);
});

test('production handoff next actions omit completed Cloudflare token and static deploy work', async () => {
  const site = await writeSite();
  const packet = await buildProductionHandoffPacket({
    site,
    projectName: 'enigma-memory',
    domain: 'enigmamemory.com',
    liveUrl: 'https://enigmamemory.com/',
    expectTitle: 'Enigma',
  }, {
    env: {
      CLOUDFLARE_API_TOKEN: 'cf-token-present-but-never-printed',
      CLOUDFLARE_ACCOUNT_ID: 'account-id-present',
    },
    generated_at: '2026-06-24T00:00:00.000Z',
    fetchImpl: fakeFetch({ title: 'Enigma — Verifiable AI memory plane' }),
  });
  const actionIds = packet.next_actions.map((item) => item.id).join('\n');
  assert.doesNotMatch(actionIds, /create-cloudflare-token|deploy-current-static-site/);
  assert.match(actionIds, /provision-hosted-backend/);
  assert.match(actionIds, /complete-operator-acceptance/);
  assert.match(actionIds, /generate-operator-evidence-starter/);
  assert.match(packet.next_actions.find((item) => item.id === 'complete-operator-acceptance')?.command ?? '', /production:acceptance:packet/);
  assert.match(packet.next_actions.find((item) => item.id === 'complete-operator-acceptance')?.command ?? '', /--owners-json <evidence-dir>\/owner-approval-refs\.json/);
  assert.match(packet.next_actions.find((item) => item.id === 'complete-operator-acceptance')?.command ?? '', /--evidence-refs <evidence-dir>\/evidence-refs\.json/);
  assert.doesNotMatch(JSON.stringify(packet), /cf-token-present-but-never-printed/);
});

test('production handoff accepts an externally completed operator packet without treating it as hosted backend evidence', async () => {
  const site = await writeSite();
  const operatorAcceptancePacket = await readyOperatorAcceptancePacket({
    packet_id: 'packet-production-go',
  });
  const packet = await buildProductionHandoffPacket({
    site,
    projectName: 'enigma-memory',
    domain: 'enigmamemory.com',
    liveUrl: 'https://enigmamemory.com/',
    expectTitle: 'Enigma',
    operatorAcceptancePacket,
  }, {
    env: {
      CLOUDFLARE_API_TOKEN: 'cf-token-present-but-never-printed',
      CLOUDFLARE_ACCOUNT_ID: 'account-id-present',
    },
    generated_at: '2026-06-24T00:00:00.000Z',
    fetchImpl: fakeFetch({ title: 'Enigma — Verifiable AI memory plane' }),
  });

  assert.equal(packet.operator_acceptance.ok, true);
  assert.equal(packet.operator_acceptance.decision, 'go');
  assert.equal(packet.operator_acceptance.packet_id, 'packet-production-go');
  assert.equal(packet.operator_acceptance.provided_packet, true);
  assert.deepEqual(packet.operator_acceptance.blocker_breakdown, {});
  assert.equal(packet.infrastructure.hosted_live_ready, false);
  const actionIds = packet.next_actions.map((item) => item.id).join('\n');
  assert.doesNotMatch(actionIds, /generate-operator-evidence-starter|complete-operator-acceptance/);
  assert.match(actionIds, /provision-hosted-backend/);
  assert.doesNotMatch(JSON.stringify(packet), /cf-token-present-but-never-printed|Bearer|PRIVATE KEY|sk-/i);
});

test('production handoff keeps final audit required after hosted readiness and operator acceptance', async () => {
  const site = await writeSite();
  const operatorAcceptancePacket = await readyOperatorAcceptancePacket({
    packet_id: 'packet-production-full-go-without-audit',
  });
  const packet = await buildProductionHandoffPacket({
    site,
    projectName: 'enigma-memory',
    domain: 'enigmamemory.com',
    liveUrl: 'https://enigmamemory.com/',
    expectTitle: 'Enigma',
    infrastructureReadiness: readyInfrastructure(),
    operatorAcceptancePacket,
  }, {
    env: {
      CLOUDFLARE_API_TOKEN: 'cf-token-present-but-never-printed',
      CLOUDFLARE_ACCOUNT_ID: 'account-id-present',
    },
    generated_at: '2026-06-24T00:00:00.000Z',
    fetchImpl: fakeFetch({ title: 'Enigma — Verifiable AI memory plane' }),
  });

  assert.equal(packet.go_live_ready, false);
  assert.equal(packet.infrastructure.hosted_live_ready, true);
  assert.equal(packet.infrastructure.provided_readiness, true);
  assert.equal(packet.release_audit.ok, false);
  const actionIds = packet.next_actions.map((item) => item.id).join('\n');
  assert.doesNotMatch(actionIds, /provision-hosted-backend|generate-operator-evidence-starter|complete-operator-acceptance/);
  assert.match(actionIds, /final-release-audit/);
  assert.match(packet.blockers.join('\n'), /release_audit/);
  assert.doesNotMatch(JSON.stringify(packet), /cf-token-present-but-never-printed|Bearer|PRIVATE KEY|sk-/i);
});

test('production handoff can mark go-live ready only with release audit evidence', async () => {
  const site = await writeSite();
  const operatorAcceptancePacket = await readyOperatorAcceptancePacket({
    packet_id: 'packet-production-full-go',
  });
  const packet = await buildProductionHandoffPacket({
    site,
    projectName: 'enigma-memory',
    domain: 'enigmamemory.com',
    liveUrl: 'https://enigmamemory.com/',
    expectTitle: 'Enigma',
    infrastructureReadiness: readyInfrastructure(),
    operatorAcceptancePacket,
    releaseAudit: readyReleaseAudit(),
  }, {
    env: {
      CLOUDFLARE_API_TOKEN: 'cf-token-present-but-never-printed',
      CLOUDFLARE_ACCOUNT_ID: 'account-id-present',
    },
    generated_at: '2026-06-24T00:00:00.000Z',
    fetchImpl: fakeFetch({ title: 'Enigma — Verifiable AI memory plane' }),
  });

  assert.equal(packet.go_live_ready, true);
  assert.equal(packet.infrastructure.hosted_live_ready, true);
  assert.equal(packet.release_audit.ok, true);
  assert.equal(packet.release_audit.required_failed_count, 0);
  assert.ok(packet.release_audit.gate_names.includes('whitepaper-claims-validator'));
  const actionIds = packet.next_actions.map((item) => item.id).join('\n');
  assert.doesNotMatch(actionIds, /provision-hosted-backend|generate-operator-evidence-starter|complete-operator-acceptance|final-release-audit/);
  assert.deepEqual(packet.blockers, []);
  assert.doesNotMatch(JSON.stringify(packet), /cf-token-present-but-never-printed|Bearer|PRIVATE KEY|sk-/i);
});

test('production handoff rejects supplied infrastructure readiness that is blocked or unsafe', async () => {
  const site = await writeSite();
  const operatorAcceptancePacket = await readyOperatorAcceptancePacket({
    packet_id: 'packet-production-unsafe-readiness',
  });
  const blockedReadiness = readyInfrastructure();
  blockedReadiness.ok = false;
  blockedReadiness.readiness.hosted_live_ready = true;
  await assert.rejects(() => buildProductionHandoffPacket({
    site,
    projectName: 'enigma-memory',
    domain: 'enigmamemory.com',
    liveUrl: 'https://enigmamemory.com/',
    expectTitle: 'Enigma',
    infrastructureReadiness: blockedReadiness,
    operatorAcceptancePacket,
  }, {
    env: {
      CLOUDFLARE_API_TOKEN: 'cf-token-present-but-never-printed',
      CLOUDFLARE_ACCOUNT_ID: 'account-id-present',
    },
    generated_at: '2026-06-24T00:00:00.000Z',
    fetchImpl: fakeFetch({ title: 'Enigma — Verifiable AI memory plane' }),
  }), /ok:true/);

  const incompleteChecksReadiness = readyInfrastructure();
  incompleteChecksReadiness.checks = [
    { name: 'hosted.required_refs', ok: true, missing: [], required_count: 25, missing_count: 0 },
  ];
  await assert.rejects(() => buildProductionHandoffPacket({
    site,
    projectName: 'enigma-memory',
    domain: 'enigmamemory.com',
    liveUrl: 'https://enigmamemory.com/',
    expectTitle: 'Enigma',
    infrastructureReadiness: incompleteChecksReadiness,
    operatorAcceptancePacket,
  }, {
    env: {
      CLOUDFLARE_API_TOKEN: 'cf-token-present-but-never-printed',
      CLOUDFLARE_ACCOUNT_ID: 'account-id-present',
    },
    generated_at: '2026-06-24T00:00:00.000Z',
    fetchImpl: fakeFetch({ title: 'Enigma — Verifiable AI memory plane' }),
  }), /missing completed live checks/);

  const secretReadiness = readyInfrastructure();
  secretReadiness.external_blockers = ['inspect https://user:password@example.invalid/logs'];
  await assert.rejects(() => buildProductionHandoffPacket({
    site,
    projectName: 'enigma-memory',
    domain: 'enigmamemory.com',
    liveUrl: 'https://enigmamemory.com/',
    expectTitle: 'Enigma',
    infrastructureReadiness: secretReadiness,
    operatorAcceptancePacket,
  }, {
    env: {
      CLOUDFLARE_API_TOKEN: 'cf-token-present-but-never-printed',
      CLOUDFLARE_ACCOUNT_ID: 'account-id-present',
    },
    generated_at: '2026-06-24T00:00:00.000Z',
    fetchImpl: fakeFetch({ title: 'Enigma — Verifiable AI memory plane' }),
  }), /secret-looking URL credentials/);

  const rawReadiness = readyInfrastructure();
  rawReadiness.external_blockers = ['raw memory: customer note'];
  await assert.rejects(() => buildProductionHandoffPacket({
    site,
    projectName: 'enigma-memory',
    domain: 'enigmamemory.com',
    liveUrl: 'https://enigmamemory.com/',
    expectTitle: 'Enigma',
    infrastructureReadiness: rawReadiness,
    operatorAcceptancePacket,
  }, {
    env: {
      CLOUDFLARE_API_TOKEN: 'cf-token-present-but-never-printed',
      CLOUDFLARE_ACCOUNT_ID: 'account-id-present',
    },
    generated_at: '2026-06-24T00:00:00.000Z',
    fetchImpl: fakeFetch({ title: 'Enigma — Verifiable AI memory plane' }),
  }), /raw-memory material/);
});

test('production handoff rejects completed operator packets with unsafe readiness or public summary values', async () => {
  const site = await writeSite();
  const weakReadiness = readyInfrastructure();
  weakReadiness.readiness.contract_ready = false;
  weakReadiness.checks.push({ name: 'relay.readyz', ok: false });
  const weakOperatorPacket = await readyOperatorAcceptancePacket({
    packet_id: 'packet-weak-operator-readiness',
    readiness: weakReadiness,
  });
  await assert.rejects(() => buildProductionHandoffPacket({
    site,
    projectName: 'enigma-memory',
    domain: 'enigmamemory.com',
    liveUrl: 'https://enigmamemory.com/',
    expectTitle: 'Enigma',
    operatorAcceptancePacket: weakOperatorPacket,
  }, {
    env: {
      CLOUDFLARE_API_TOKEN: 'cf-token-present-but-never-printed',
      CLOUDFLARE_ACCOUNT_ID: 'account-id-present',
    },
    generated_at: '2026-06-24T00:00:00.000Z',
    fetchImpl: fakeFetch({ title: 'Enigma — Verifiable AI memory plane' }),
  }), /readiness\.contract_ready:true|failed checks/);

  const rawOperatorPacket = await readyOperatorAcceptancePacket({
    packet_id: 'plain text customer memory',
  });
  await assert.rejects(() => buildProductionHandoffPacket({
    site,
    projectName: 'enigma-memory',
    domain: 'enigmamemory.com',
    liveUrl: 'https://enigmamemory.com/',
    expectTitle: 'Enigma',
    operatorAcceptancePacket: rawOperatorPacket,
  }, {
    env: {
      CLOUDFLARE_API_TOKEN: 'cf-token-present-but-never-printed',
      CLOUDFLARE_ACCOUNT_ID: 'account-id-present',
    },
    generated_at: '2026-06-24T00:00:00.000Z',
    fetchImpl: fakeFetch({ title: 'Enigma — Verifiable AI memory plane' }),
  }), /operator acceptance summary.*secret or raw-memory material/);
});

test('production handoff packet CLI writes public-safe handoff JSON', async () => {
  const site = await writeSite();
  const outPath = join(await mkdtemp(join(tmpdir(), 'enigma-production-handoff-out-')), 'packet.json');
  const result = await execFileAsync(process.execPath, [
    'scripts/build-production-handoff-packet.mjs',
    '--site', site,
    '--project-name', 'enigma-memory',
    '--domain', 'enigmamemory.com',
    '--live-url', 'data:text/html,%3Ctitle%3EEnigma%20%E2%80%94%20Verifiable%20AI%20memory%20plane%3C%2Ftitle%3E',
    '--out', outPath,
  ], {
    cwd: process.cwd(),
    env: { ...process.env, CLOUDFLARE_API_TOKEN: '' },
    timeout: 15000,
    windowsHide: true,
  });
  assert.equal(result.stderr, '');
  const stdoutPacket = JSON.parse(result.stdout);
  const filePacket = JSON.parse(await readFile(outPath, 'utf8'));
  assert.equal(stdoutPacket.schema, PRODUCTION_HANDOFF_PACKET_SCHEMA);
  assert.equal(filePacket.project.domain, 'enigmamemory.com');
  assert.equal(stdoutPacket.local_static_artifact_ready, true);
  assert.equal(stdoutPacket.credentials_present.cloudflare_api_token, false);
  assert.equal(stdoutPacket.go_live_ready, false);
  assert.equal(stdoutPacket.hosted_probe_worker.ok, true);
  assert.equal(stdoutPacket.hosted_probe_worker.required_env_ref_count, 17);
  assert.equal(stdoutPacket.pages.live_observation.ok, false);
  assert.match(stdoutPacket.blockers.join('\n'), /live URL must be HTTPS/);
  assert.match(stdoutPacket.blockers.join('\n'), /CLOUDFLARE_API_TOKEN is absent|missing refs\.backend_host/);
  assert.doesNotMatch(result.stdout, /Bearer|PRIVATE KEY|sk-/i);
  assert.doesNotMatch(result.stdout, /enigma-production-handoff-out-|enigma production handoff site-/i);
});

test('production handoff CLI writes JSON while printing plain output', async () => {
  const site = await writeSite();
  const dir = await mkdtemp(join(tmpdir(), 'enigma-production-handoff-plain-'));
  const outPath = join(dir, 'packet.json');
  const result = await execFileAsync(process.execPath, [
    'scripts/build-production-handoff-packet.mjs',
    '--site', site,
    '--project-name', 'enigma-memory',
    '--domain', 'enigmamemory.com',
    '--live-url', 'data:text/html,%3Ctitle%3EEnigma%20%E2%80%94%20Verifiable%20AI%20memory%20plane%3C%2Ftitle%3E',
    '--out', outPath,
    '--plain',
  ], {
    cwd: process.cwd(),
    env: { ...process.env, CLOUDFLARE_API_TOKEN: '' },
    timeout: 15000,
    windowsHide: true,
  });
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /^Enigma production handoff\n/);
  assert.match(result.stdout, /Status: Needs attention/);
  assert.match(result.stdout, /Boundary: public-safe production handoff summary only/);
  assert.doesNotMatch(result.stdout, /^\s*\{/);
  assert.equal(result.stdout.includes(dir), false);
  assert.equal(result.stdout.includes(outPath), false);
  const filePacket = JSON.parse(await readFile(outPath, 'utf8'));
  assert.equal(filePacket.schema, PRODUCTION_HANDOFF_PACKET_SCHEMA);
  assert.equal(filePacket.go_live_ready, false);
});

test('production handoff CLI redacts unreadable packet paths from errors', async () => {
  const site = await writeSite();
  const missingPacketPath = join(tmpdir(), 'enigma-production-missing-packet', 'operator-packet.json');
  await assert.rejects(async () => execFileAsync(process.execPath, [
    'scripts/build-production-handoff-packet.mjs',
    '--site', site,
    '--project-name', 'enigma-memory',
    '--domain', 'enigmamemory.com',
    '--operator-acceptance-packet', missingPacketPath,
  ], {
    cwd: process.cwd(),
    env: { ...process.env, CLOUDFLARE_API_TOKEN: '' },
    timeout: 15000,
    windowsHide: true,
  }), (error) => {
    assert.match(error.stdout, /operator acceptance packet JSON could not be read/);
    assert.equal(JSON.parse(error.stdout).error.code, 'USAGE_ERROR');
    assert.doesNotMatch(error.stdout, /enigma-production-missing-packet|operator-packet\.json|enigma production handoff site-/i);
    return true;
  });
});

test('production handoff loads supplied packet path before live fetch', async () => {
  const site = await writeSite();
  const missingPacketPath = join(tmpdir(), 'enigma-production-fetch-order-missing-packet', 'operator-packet.json');
  await assert.rejects(() => buildProductionHandoffPacket({
    site,
    projectName: 'enigma-memory',
    domain: 'enigmamemory.com',
    liveUrl: 'https://enigmamemory.com/',
    expectTitle: 'Enigma',
    operatorAcceptancePacket: missingPacketPath,
  }, {
    env: {},
    generated_at: '2026-06-24T00:00:00.000Z',
    fetchImpl: async () => {
      throw new Error('live fetch should not run before packet read');
    },
  }), (error) => {
    assert.match(error.message, /operator acceptance packet JSON could not be read/);
    assert.doesNotMatch(error.message, /enigma-production-fetch-order-missing-packet|operator-packet\.json|enigma production handoff site-/i);
    return true;
  });
});

test('production handoff CLI accepts a completed operator packet path without leaking packet contents', async () => {
  const site = await writeSite();
  const dir = await mkdtemp(join(tmpdir(), 'enigma-production-handoff-operator-packet-'));
  const operatorPacketPath = join(dir, 'operator-packet.json');
  const operatorAcceptancePacket = await readyOperatorAcceptancePacket({
    packet_id: 'packet-production-cli-go',
  });
  await writeFile(operatorPacketPath, `${JSON.stringify(operatorAcceptancePacket, null, 2)}\n`, 'utf8');
  const result = await execFileAsync(process.execPath, [
    'scripts/build-production-handoff-packet.mjs',
    '--site', site,
    '--project-name', 'enigma-memory',
    '--domain', 'enigmamemory.com',
    '--live-url', 'data:text/html,%3Ctitle%3EEnigma%20%E2%80%94%20Verifiable%20AI%20memory%20plane%3C%2Ftitle%3E',
    '--operator-acceptance-packet', operatorPacketPath,
  ], {
    cwd: process.cwd(),
    env: { ...process.env, CLOUDFLARE_API_TOKEN: '' },
    timeout: 15000,
    windowsHide: true,
  });
  assert.equal(result.stderr, '');
  const stdoutPacket = JSON.parse(result.stdout);
  assert.equal(stdoutPacket.operator_acceptance.ok, true);
  assert.equal(stdoutPacket.operator_acceptance.packet_id, 'packet-production-cli-go');
  assert.equal(stdoutPacket.operator_acceptance.provided_packet, true);
  assert.deepEqual(stdoutPacket.operator_acceptance.blocker_breakdown, {});
  assert.doesNotMatch(stdoutPacket.next_actions.map((item) => item.id).join('\n'), /generate-operator-evidence-starter|complete-operator-acceptance/);
  assert.equal(stdoutPacket.infrastructure.hosted_live_ready, false);
  assert.equal(stdoutPacket.pages.live_observation.ok, false);
  assert.match(stdoutPacket.blockers.join('\n'), /live URL must be HTTPS/);
  assert.doesNotMatch(result.stdout, /Bearer|PRIVATE KEY|sk-|Enigma operator fixture|ticket:\/\/security_owner\/approval/i);
  assert.doesNotMatch(result.stdout, /enigma-production-handoff-operator-packet-|enigma production handoff site-/i);
});
