import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildProductionBackendEnvKit, PRODUCTION_BACKEND_ENV_KIT_SCHEMA, HOSTED_BACKEND_REF_MAP_SCHEMA, renderProductionBackendEnvKitPlain } from '../scripts/build-production-backend-env-kit.mjs';
import { createRelayState, handleRelayRequest } from '../apps/relay/src/server.mjs';
import { createGatewayState, handleGatewayRequest } from '../apps/gateway/src/server.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const SCRIPT = 'scripts/build-production-backend-env-kit.mjs';

async function readGenerated(root, relativePath) {
  return readFile(join(root, ...relativePath.split('/')), 'utf8');
}

async function assertFile(root, relativePath) {
  const info = await stat(join(root, ...relativePath.split('/')));
  assert.equal(info.isFile(), true, `${relativePath} should be a file`);
}

function assertNoCredentialMaterial(text, outDir) {
  assert.equal(text.includes(outDir), false, 'generated output must not include local out-dir path');
  assert.doesNotMatch(text, /Bearer\s+[A-Za-z0-9._~+/=-]{8,}|Basic\s+[A-Za-z0-9+/=-]{8,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|sk-[A-Za-z0-9_-]{12,}|AKIA[0-9A-Z]{16}/u);
  assert.doesNotMatch(text, /CLOUDFLARE_ACCOUNT_ID|account-fixture|password|passwd|pwd/iu);
  assert.doesNotMatch(text, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/iu);
}

function parseEnvTemplate(text) {
  return Object.fromEntries(text.split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => {
      const eq = line.indexOf('=');
      assert.notEqual(eq, -1, `env line must contain equals: ${line}`);
      return [line.slice(0, eq), line.slice(eq + 1)];
    }));
}

function filledEnv(template) {
  const digest = `sha256:${'1'.repeat(64)}`;
  return Object.fromEntries(Object.entries(template).map(([key, value]) => {
    if (key === 'ENIGMA_OPERATOR_ACCEPTANCE_DECISION') return [key, 'go'];
    if (key.endsWith('_BEARER_SHA256')) return [key, digest];
    if (/^<operator-required-/u.test(value)) return [key, `evidence:${key.toLowerCase()}`];
    return [key, value];
  }));
}

async function withIsolatedEnigmaEnv(env, fn) {
  const saved = new Map();
  const keys = new Set([...Object.keys(process.env).filter((key) => key === 'NODE_ENV' || key.startsWith('ENIGMA_')), ...Object.keys(env)]);
  for (const key of keys) {
    saved.set(key, process.env[key]);
    delete process.env[key];
  }
  Object.assign(process.env, env);
  try {
    return await fn();
  } finally {
    for (const key of keys) {
      if (saved.get(key) === undefined) delete process.env[key];
      else process.env[key] = saved.get(key);
    }
  }
}

function relayReadyz() {
  let status = 0;
  let body = '';
  const res = {
    writeHead(code) {
      status = code;
    },
    end(payload) {
      body = payload;
    },
  };
  return handleRelayRequest(createRelayState(), { method: 'GET', url: '/readyz' }, res).then(() => ({ status, body: JSON.parse(body) }));
}

test('production backend env kit writes blocked public-safe templates', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'enigma-backend-env-kit-'));
  try {
    const run = spawnSync(process.execPath, [
      SCRIPT,
      '--out-dir', outDir,
      '--domain', 'example.invalid',
      '--tenant', 'tenant-alpha',
      '--environment', 'production',
    ], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      windowsHide: true,
    });

    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stderr, '');
    const stdout = JSON.parse(run.stdout);
    assert.equal(stdout.schema, PRODUCTION_BACKEND_ENV_KIT_SCHEMA);
    assert.equal(stdout.launch_ready, false);
    assert.equal(stdout.out_dir, '<production-backend-env-kit-output>');
    assertNoCredentialMaterial(run.stdout, outDir);

    for (const relativePath of [
      'operator-env/relay.production.env',
      'operator-env/gateway.production.env',
      'operator-secrets/placeholder-manifest.json',
      'hosted-ref-map.json',
      'PRODUCTION_BACKEND_ENV_KIT_SUMMARY.json',
    ]) {
      await assertFile(outDir, relativePath);
    }

    const relay = await readGenerated(outDir, 'operator-env/relay.production.env');
    const gateway = await readGenerated(outDir, 'operator-env/gateway.production.env');
    assert.match(relay, /^ENIGMA_BACKEND_MODE=production$/m);
    assert.match(relay, /^ENIGMA_READINESS_FAIL_CLOSED=true$/m);
    assert.match(relay, /^ENIGMA_REQUIRE_EXTERNAL_STORAGE=true$/m);
    assert.match(relay, /^ENIGMA_REQUIRE_EXTERNAL_KMS=true$/m);
    assert.match(relay, /^ENIGMA_KMS_KEY_REF=<operator-required-enigma-kms-key-ref>$/m);
    assert.match(relay, /^ENIGMA_RELAY_DEPLOYMENT_REF=<operator-required-enigma-relay-deployment-ref>$/m);
    assert.match(relay, /^ENIGMA_DISABLE_LOCAL_DEMO_FALLBACK=true$/m);
    assert.match(relay, /^ENIGMA_RELAY_BACKEND_HOST_REF=<operator-required-enigma-relay-backend-host-ref>$/m);
    assert.match(relay, /^ENIGMA_OPERATOR_ACCEPTANCE_DECISION=<operator-required-go-decision>$/m);
    assert.match(relay, /^ENIGMA_SIEM_REF=<operator-required-enigma-siem-ref>$/m);
    assert.match(gateway, /^ENIGMA_READINESS_FAIL_CLOSED=true$/m);
    assert.match(gateway, /^ENIGMA_REQUIRE_SIEM_EXPORT=true$/m);
    assert.match(gateway, /^ENIGMA_REQUIRE_EXTERNAL_STORAGE=true$/m);
    assert.match(gateway, /^ENIGMA_KMS_KEY_REF=<operator-required-enigma-kms-key-ref>$/m);
    assert.match(gateway, /^ENIGMA_GATEWAY_ADMIN_AUTH_REF=<operator-required-enigma-gateway-admin-auth-ref>$/m);
    assert.match(gateway, /^ENIGMA_GATEWAY_DEPLOYMENT_REF=<operator-required-enigma-gateway-deployment-ref>$/m);
    assert.match(gateway, /^ENIGMA_GATEWAY_DATA_PLANE_AUTH_REF=<operator-required-enigma-gateway-data-plane-auth-ref>$/m);
    assert.match(gateway, /^ENIGMA_GATEWAY_STORAGE_REF=<operator-required-enigma-gateway-storage-ref>$/m);
    assert.match(gateway, /^ENIGMA_EXTERNAL_STORAGE_DSN_FILE=\/run\/secrets\/external_storage_dsn$/m);
    assert.match(gateway, /^ENIGMA_SIEM_REF=<operator-required-enigma-siem-ref>$/m);

    const refMap = JSON.parse(await readGenerated(outDir, 'hosted-ref-map.json'));
    assert.equal(refMap.schema, HOSTED_BACKEND_REF_MAP_SCHEMA);
    assert.equal(refMap.status, 'blocked_until_operator_refs_are_verified');
    assert.equal(refMap.required_ref_count, 25);
    assert.ok(refMap.refs.backend_host.env_names.includes('ENIGMA_BACKEND_HOST_REF'));
    assert.ok(refMap.refs.network_access_policy.env_names.includes('ENIGMA_NETWORK_ACCESS_POLICY_REF'));
    assert.ok(refMap.refs.admin_auth.env_names.includes('ENIGMA_GATEWAY_ADMIN_AUTH_REF'));
    assert.ok(refMap.refs.relay_deployment.env_names.includes('ENIGMA_RELAY_DEPLOYMENT_REF'));
    assert.ok(refMap.refs.gateway_deployment.env_names.includes('ENIGMA_GATEWAY_DEPLOYMENT_REF'));

    const placeholderManifest = JSON.parse(await readGenerated(outDir, 'operator-secrets/placeholder-manifest.json'));
    assert.equal(placeholderManifest.status, 'placeholder_manifest_only');
    assert.ok(placeholderManifest.entries.every((entry) => entry.placeholder.startsWith('<operator-provided-')));
    assert.ok(placeholderManifest.entries.every((entry) => entry.file.startsWith('operator-secrets/')));
    assert.ok(placeholderManifest.entries.find((entry) => entry.id === 'external_storage_dsn')?.used_by.includes('gateway'));

    const summaryText = await readGenerated(outDir, 'PRODUCTION_BACKEND_ENV_KIT_SUMMARY.json');
    const summary = JSON.parse(summaryText);
    assert.equal(summary.schema, PRODUCTION_BACKEND_ENV_KIT_SCHEMA);
    assert.equal(summary.launch_ready, false);
    assert.equal(summary.hosted_live_ready, false);
    assert.equal(summary.deployment_performed, false);
    assert.equal(summary.target.domain, 'example.invalid');
    assert.equal(summary.loopback_boundary.includes('127.0.0.1'), true);
    assert.ok(summary.public_claim_boundary.some((item) => item.includes('not hosted backend evidence')));
    assert.ok(summary.next_validation_commands.includes('npm run production:manifests'));
    assert.ok(summary.next_validation_commands.some((command) => command.includes('--out <evidence-dir>/hosted-backend-live-collection.json')));
    assert.ok(summary.next_validation_commands.some((command) => command.includes('--evidence-out <evidence-dir>/hosted-backend-live.json')));
    assert.ok(summary.next_validation_commands.includes('npm run production:hosted-live -- --evidence <evidence-dir>/hosted-backend-live.json'));

    const allGeneratedText = [run.stdout, relay, gateway, JSON.stringify(refMap), JSON.stringify(placeholderManifest), summaryText].join('\n');
    assert.doesNotMatch(summaryText, /token|account|personal|secret/iu);
    assertNoCredentialMaterial(allGeneratedText, outDir);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test('production backend env kit plain output is readable and claim-bounded', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'enigma-backend-env-kit-plain-'));
  try {
    const run = spawnSync(process.execPath, [
      SCRIPT,
      '--out-dir', outDir,
      '--domain', 'example.invalid',
      '--tenant', 'tenant-alpha',
      '--environment', 'production',
      '--plain',
    ], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      windowsHide: true,
    });

    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stderr, '');
    assert.match(run.stdout, /^Enigma production backend env kit\n/);
    assert.match(run.stdout, /Status: Needs attention/);
    assert.match(run.stdout, /Launch ready: no/);
    assert.match(run.stdout, /Output written: yes/);
    assert.match(run.stdout, /File role: relay operator-env template/);
    assert.match(run.stdout, /Boundary: public-safe backend env template kit only/);
    assert.doesNotMatch(run.stdout, /^\s*\{/);
    assertNoCredentialMaterial(run.stdout, outDir);

    const summary = JSON.parse(await readGenerated(outDir, 'PRODUCTION_BACKEND_ENV_KIT_SUMMARY.json'));
    const rendered = renderProductionBackendEnvKitPlain(summary);
    assert.match(rendered, /^Enigma production backend env kit\n/);
    assert.match(rendered, /Output written: no/);
    assert.doesNotMatch(rendered, /^\s*\{/);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test('production backend env kit templates satisfy runtime readiness after operator fill', async () => {
  const kit = buildProductionBackendEnvKit({
    domain: 'example.invalid',
    tenant: 'tenant-alpha',
    environment: 'production',
    generated_at: '2026-06-24T00:00:00.000Z',
  });
  const relayEnv = filledEnv(parseEnvTemplate(kit.files['operator-env/relay.production.env']));
  const gatewayEnv = filledEnv(parseEnvTemplate(kit.files['operator-env/gateway.production.env']));

  await withIsolatedEnigmaEnv(relayEnv, async () => {
    const readiness = await relayReadyz();
    assert.equal(readiness.status, 200);
    assert.equal(readiness.body.ok, true);
    assert.deepEqual(readiness.body.missing_evidence_refs, []);
  });

  await withIsolatedEnigmaEnv(gatewayEnv, async () => {
    const readiness = await handleGatewayRequest(createGatewayState(), { method: 'GET', url: '/readyz' });
    assert.equal(readiness.status, 200);
    assert.equal(readiness.body.ok, true);
    assert.deepEqual(readiness.body.missing_evidence_refs, []);
  });
});

test('production backend env kit rejects unknown options', () => {
  const run = spawnSync(process.execPath, [SCRIPT, '--out-dir', 'ignored', '--unknown-option'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    windowsHide: true,
  });

  assert.equal(run.status, 1);
  assert.match(run.stderr, /Unknown production backend env kit option: --unknown-option/);
  assert.equal(run.stdout, '');
});

test('production backend env kit is exposed by package scripts and files', async () => {
  const pkg = JSON.parse(await readFile(resolve(PROJECT_ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['production:backend-env'], 'node scripts/build-production-backend-env-kit.mjs');
  assert.ok(pkg.files.includes('scripts/build-production-backend-env-kit.mjs'));
});
