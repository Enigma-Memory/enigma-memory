import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  buildProductionWorkplan,
  PRODUCTION_WORKPLAN_SCHEMA,
  renderProductionWorkplanPlain,
  validateProductionWorkplanGraph,
} from '../scripts/build-production-workplan.mjs';

const execFileAsync = promisify(execFile);

function dependencyReport(overrides = {}) {
  return {
    schema: 'enigma.production_dependency_report.v1',
    status: 'blocked',
    launch_ready: false,
    generated_at: '2026-06-24T00:00:30.000Z',
    goal_complete: false,
    groups: [
      { name: 'static_site', ready: true, evidence: ['https://enigmamemory.com/', 'Enigma — Verifiable AI memory plane'], blockers: [], blocker_count: 0, next_command: 'npm run production:goal-audit -- --site <public-site-dir>' },
      { name: 'release_gates', ready: true, evidence: ['npm run check', 'npm test', 'npm run release:audit'], blockers: [], blocker_count: 0, next_command: 'npm run check && npm test && npm run release:audit -- --out .enigma/release-audit-current.json' },
      { name: 'whitepaper_claims', ready: true, evidence: ['npm run production:whitepaper'], blockers: [], blocker_count: 0, next_command: 'npm run production:whitepaper -- --out .enigma/whitepaper-claims-current.json' },
      { name: 'cloudflare_credentials', ready: false, evidence: ['npm run production:cloudflare-credentials'], blockers: ['CLOUDFLARE_API_TOKEN absent from current environment', 'CLOUDFLARE_ACCOUNT_ID absent from current environment'], blocker_count: 2, next_command: 'Inject CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID out-of-band.' },
      { name: 'cloudflare_worker_permission', ready: false, evidence: ['npm run production:worker-inspect'], blockers: ['Cloudflare Worker service visibility is blocked by token/account permission'], blocker_count: 1, next_command: 'Fix Cloudflare token/account Workers Scripts scope.' },
      { name: 'hosted_backend_live', ready: false, evidence: ['npm run infrastructure:readiness'], blockers: ['hosted_live_ready is false', 'hosted missing refs: 5', 'missing refs.backend_host', 'missing refs.dns_tls', 'missing refs.durable_storage', 'operator acceptance decision is pending', 'missing relay.ref', 'missing gateway.ref'], blocker_count: 8, next_command: 'Provision relay/gateway/storage/KMS/SIEM/backup refs.' },
      { name: 'operator_acceptance', ready: false, evidence: ['npm run production:acceptance'], blockers: ['operator acceptance decision blocked', '54 operator blockers', 'operator blockers metadata: 6', 'operator blockers owners: 11', 'operator blockers evidence: 30'], blocker_count: 5, next_command: 'Complete operator acceptance packet with decision go and zero blockers.' },
    ],
    next_actions: [
      { id: 'create-cloudflare-token', owner: 'operator', command: 'Create or inject CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID with least-privilege Pages access; do not paste token into chat.', evidence: 'npm run cloudflare:ops -- token verify --account-id <account-id>' },
      { id: 'optional-standalone-worker-probe', owner: 'operator-or-ai-with-token', command: 'npm run production:hosted-probe -- --out-dir <dir>', evidence: 'standalone edge probe only' },
      { id: 'generate-backend-env-kit', owner: 'operator-or-reviewer', command: 'npm run production:backend-env -- --out-dir <backend-env-kit-dir> --domain enigmamemory.com --tenant <tenant-id> --environment production', evidence: '<backend-env-kit-dir>/PRODUCTION_BACKEND_ENV_KIT_SUMMARY.json' },
      { id: 'provision-hosted-backend', owner: 'operator', command: 'Deploy relay/gateway using deploy/docker-compose.production.example.yml or deploy/kubernetes/enigma-backend.example.yaml.', evidence: 'npm run infrastructure:readiness -- --manifest <completed-manifest.json> --live --cloudflare-live required' },
      { id: 'validate-hosted-backend-live-evidence', owner: 'operator-or-reviewer', command: 'npm run production:hosted-live -- --evidence <hosted-backend-live.json>', evidence: 'accepted enigma.hosted_backend_live_result.v1' },
      { id: 'generate-operator-evidence-starter', owner: 'operator-or-reviewer', command: 'npm run production:evidence-starter -- --out-dir <evidence-dir> --domain enigmamemory.com --tenant <tenant-id>', evidence: '<evidence-dir>/acceptance-fill-plan.json' },
      { id: 'complete-operator-acceptance', owner: 'operator', command: 'Complete docs/operator-acceptance-packet.md or generate a completed packet with real evidence, decision go, and zero blockers.', evidence: 'npm run production:acceptance -- --packet <completed-packet.json>' },
    ],
    ...overrides,
  };
}

function hostedRefCatalog() {
  return {
    schema: 'enigma.operator_hosted_ref_catalog.v1',
    generated_at: '2026-06-24T00:00:20.000Z',
    required_ref_count: 5,
    refs: {
      backend_host: { purpose: 'Relay and gateway production deployment identity.', env_names: ['ENIGMA_BACKEND_HOST_REF'], evidence_command: 'npm run production:manifests', accepted_refs: ['deployment ticket'] },
      dns_tls: { purpose: 'Public DNS and TLS evidence.', env_names: ['ENIGMA_DNS_TLS_REF'], evidence_command: 'npm run production:domain -- --evidence <domain-tls.json>', accepted_refs: ['certificate transparency record'] },
      durable_storage: { purpose: 'Durable storage migration.', env_names: ['ENIGMA_DURABLE_STORAGE_REF'], evidence_command: 'npm run production:storage -- --out <evidence-dir>/production-storage-migration.json', accepted_refs: ['migration artifact'] },
      relay_deployment: { purpose: 'Relay rollout.', env_names: ['ENIGMA_RELAY_DEPLOYMENT_REF'], evidence_command: 'npm run production:manifests', accepted_refs: ['relay rollout'] },
      gateway_deployment: { purpose: 'Gateway rollout.', env_names: ['ENIGMA_GATEWAY_DEPLOYMENT_REF'], evidence_command: 'npm run production:manifests', accepted_refs: ['gateway rollout'] },
    },
  };
}

function operatorAcceptance() {
  return {
    schema: 'enigma.operator_acceptance_result.v1',
    generated_at: '2026-06-24T00:00:10.000Z',
    ok: false,
    decision: 'blocked',
    blockers: ['operator acceptance decision blocked'],
    warnings: [],
    blocker_breakdown: { metadata: 6, owners: 11, evidence: 30 },
  };
}

test('production workplan orders blockers into public-safe phases', () => {
  const workplan = buildProductionWorkplan({
    dependencyReport: dependencyReport(),
    operatorAcceptance: operatorAcceptance(),
    hostedRefCatalog: hostedRefCatalog(),
  }, { generated_at: '2026-06-24T00:00:00.000Z' });
  assert.equal(workplan.schema, PRODUCTION_WORKPLAN_SCHEMA);
  assert.equal(workplan.status, 'blocked');
  assert.equal(workplan.launch_ready, false);
  assert.equal(workplan.next_phase_id, 'cloudflare_credentials');
  assert.equal(workplan.phase_count, 6);
  assert.equal(workplan.blocked_phase_count, 5);
  assert.deepEqual(workplan.execution_order, [
    'cloudflare_credentials',
    'release_gates',
    'cloudflare_worker_permission',
    'hosted_backend_refs',
    'operator_acceptance',
    'final_release_verification',
  ]);
  assert.deepEqual(workplan.evidence_inputs, {
    dependency_generated_at: '2026-06-24T00:00:30.000Z',
    operator_acceptance_generated_at: '2026-06-24T00:00:10.000Z',
    hosted_ref_catalog_generated_at: '2026-06-24T00:00:20.000Z',
  });
  const byId = new Map(workplan.phases.map((phase) => [phase.id, phase]));
  for (const phase of workplan.phases) {
    for (const prerequisite of phase.prerequisites) {
      assert.ok(byId.has(prerequisite), `unknown prerequisite ${prerequisite}`);
      assert.notEqual(byId.get(prerequisite).prerequisites.includes(phase.id), true, `${phase.id} must not form a direct prerequisite cycle with ${prerequisite}`);
    }
  }
  assert.deepEqual(byId.get('hosted_backend_refs').prerequisites, ['cloudflare_credentials']);
  assert.equal(byId.get('release_gates').ready, true);
  assert.deepEqual(byId.get('hosted_backend_refs').details.missing_refs, ['backend_host', 'dns_tls', 'durable_storage', 'relay_deployment', 'gateway_deployment']);
  assert.equal(byId.get('hosted_backend_refs').details.missing_ref_count, 5);
  assert.deepEqual(byId.get('hosted_backend_refs').details.missing_ref_groups.deployment, ['backend_host', 'dns_tls', 'durable_storage', 'relay_deployment', 'gateway_deployment']);
  assert.equal(byId.get('hosted_backend_refs').details.listed_missing_ref_count, 5);
  assert.equal(byId.get('hosted_backend_refs').details.blocker_listed_missing_ref_count, 3);
  assert.equal(byId.get('hosted_backend_refs').details.unlisted_missing_ref_count, 0);
  assert.deepEqual(byId.get('hosted_backend_refs').details.missing_endpoint_refs, ['relay.ref', 'gateway.ref']);
  assert.deepEqual(byId.get('hosted_backend_refs').details.hosted_state_blockers, ['hosted_live_ready is false', 'operator acceptance decision is pending']);
  assert.equal(byId.get('hosted_backend_refs').details.hosted_ref_catalog.backend_host.env_names[0], 'ENIGMA_BACKEND_HOST_REF');
  assert.equal(byId.get('hosted_backend_refs').details.hosted_ref_catalog.relay_deployment.env_names[0], 'ENIGMA_RELAY_DEPLOYMENT_REF');
  assert.ok(byId.get('hosted_backend_refs').commands.some((command) => command.includes('production:evidence-starter')));
  assert.ok(byId.get('hosted_backend_refs').commands.some((command) => command.includes('production:backend-env')));
  assert.equal(byId.get('operator_acceptance').details.blocker_breakdown.evidence, 30);
  assert.equal(byId.get('final_release_verification').details.launch_ready, false);
  assert.ok(byId.get('final_release_verification').commands.some((command) => command.includes('--worker-inspect .enigma/worker-inspect-result-current.json')));
  assert.equal(byId.get('final_release_verification').commands.some((command) => command.includes('worker-inspect-validation-current.json')), false);
  assert.doesNotMatch(JSON.stringify(workplan), /Bearer\s+[A-Za-z0-9._~+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|sk-[A-Za-z0-9_-]{16,}/i);
});

test('production workplan plain output is readable and claim-bounded', () => {
  const workplan = buildProductionWorkplan({
    dependencyReport: dependencyReport(),
    operatorAcceptance: operatorAcceptance(),
    hostedRefCatalog: hostedRefCatalog(),
  }, { generated_at: '2026-06-24T00:00:00.000Z' });
  const plain = renderProductionWorkplanPlain(workplan);

  assert.match(plain, /^Enigma production workplan\n/);
  assert.match(plain, /Status: blocked/);
  assert.match(plain, /Launch ready: no/);
  assert.match(plain, /Phases: 6/);
  assert.match(plain, /Blocked phases: 5/);
  assert.match(plain, /Next phase: cloudflare_credentials/);
  assert.match(plain, /Phase: cloudflare_credentials — blocked; 2 blockers/);
  assert.match(plain, /Next: /);
  assert.match(plain, /Boundary: public-safe ordered workplan only/);
  assert.doesNotMatch(plain, /^\s*\{/);
  assert.doesNotMatch(plain, /Bearer\s+[A-Za-z0-9._~+/=-]{12,}|C:\\Users\\|\/home\/|raw_memory|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/i);
});

test('production workplan rejects unsafe input evidence', () => {
  assert.throws(() => buildProductionWorkplan({
    dependencyReport: dependencyReport({ groups: [{ name: 'cloudflare_credentials', ready: false, blockers: ['Bearer abcdefghijklmnopqrstuvwxyz'] }] }),
  }), /secret-looking|secret/i);
});


test('production workplan graph validator rejects unknown prerequisites and cycles', () => {
  assert.throws(() => validateProductionWorkplanGraph([
    { id: 'a', prerequisites: ['missing'] },
  ]), /unknown prerequisite missing/);
  assert.throws(() => validateProductionWorkplanGraph([
    { id: 'a', prerequisites: ['b'] },
    { id: 'b', prerequisites: ['a'] },
  ]), /cycle involving/);
  assert.throws(() => validateProductionWorkplanGraph([
    { id: 'a', prerequisites: [] },
    { id: 'a', prerequisites: [] },
  ]), /duplicate phase id a/);
});
test('production workplan CLI writes blocked public-safe JSON with exit 1', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-production-workplan-'));
  const paths = {
    dependencies: join(dir, 'dependencies.json'),
    acceptance: join(dir, 'acceptance.json'),
    catalog: join(dir, 'catalog.json'),
    out: join(dir, 'workplan.json'),
  };
  await writeFile(paths.dependencies, `${JSON.stringify(dependencyReport(), null, 2)}\n`, 'utf8');
  await writeFile(paths.acceptance, `${JSON.stringify(operatorAcceptance(), null, 2)}\n`, 'utf8');
  await writeFile(paths.catalog, `${JSON.stringify(hostedRefCatalog(), null, 2)}\n`, 'utf8');
  await assert.rejects(
    () => execFileAsync(process.execPath, [
      'scripts/build-production-workplan.mjs',
      '--dependencies', paths.dependencies,
      '--operator-acceptance', paths.acceptance,
      '--hosted-ref-catalog', paths.catalog,
      '--out', paths.out,
    ], { cwd: process.cwd(), timeout: 10000, windowsHide: true }),
    (error) => {
      assert.equal(error.code, 1);
      const stdout = JSON.parse(error.stdout);
      assert.equal(stdout.schema, PRODUCTION_WORKPLAN_SCHEMA);
      assert.equal(stdout.status, 'blocked');
      assert.doesNotMatch(error.stdout, new RegExp(dir.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')));
      return true;
    },
  );
  const written = JSON.parse(await readFile(paths.out, 'utf8'));
  assert.equal(written.next_phase_id, 'cloudflare_credentials');
});

test('production workplan CLI writes JSON evidence while printing plain output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-production-workplan-plain-'));
  const paths = {
    dependencies: join(dir, 'dependencies.json'),
    acceptance: join(dir, 'acceptance.json'),
    catalog: join(dir, 'catalog.json'),
    out: join(dir, 'workplan.json'),
  };
  await writeFile(paths.dependencies, `${JSON.stringify(dependencyReport(), null, 2)}\n`, 'utf8');
  await writeFile(paths.acceptance, `${JSON.stringify(operatorAcceptance(), null, 2)}\n`, 'utf8');
  await writeFile(paths.catalog, `${JSON.stringify(hostedRefCatalog(), null, 2)}\n`, 'utf8');
  await assert.rejects(
    () => execFileAsync(process.execPath, [
      'scripts/build-production-workplan.mjs',
      '--dependencies', paths.dependencies,
      '--operator-acceptance', paths.acceptance,
      '--hosted-ref-catalog', paths.catalog,
      '--out', paths.out,
      '--plain',
    ], { cwd: process.cwd(), timeout: 10000, windowsHide: true }),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stdout, /^Enigma production workplan\n/);
      assert.match(error.stdout, /Status: blocked/);
      assert.match(error.stdout, /Boundary: public-safe ordered workplan only/);
      assert.doesNotMatch(error.stdout, /^\s*\{/);
      assert.equal(error.stdout.includes(dir), false);
      assert.equal(error.stdout.includes(paths.out), false);
      return true;
    },
  );
  const written = JSON.parse(await readFile(paths.out, 'utf8'));
  assert.equal(written.schema, PRODUCTION_WORKPLAN_SCHEMA);
  assert.equal(written.next_phase_id, 'cloudflare_credentials');
});
