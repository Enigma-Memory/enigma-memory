import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import {
  PRODUCTION_MANIFEST_RESULT_SCHEMA,
  validateKubernetesBackendManifestText,
  validateProductionComposeManifestText,
  validateProductionManifestFiles,
} from '../scripts/validate-production-manifests.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const COMPOSE_PATH = resolve(PROJECT_ROOT, 'deploy/docker-compose.production.example.yml');
const KUBERNETES_PATH = resolve(PROJECT_ROOT, 'deploy/kubernetes/enigma-backend.example.yaml');

async function loadFixtures() {
  const [compose, kubernetes] = await Promise.all([
    readFile(COMPOSE_PATH, 'utf8'),
    readFile(KUBERNETES_PATH, 'utf8'),
  ]);
  return { compose, kubernetes };
}

test('production manifest validator accepts fail-closed reference manifests', async () => {
  const result = await validateProductionManifestFiles({
    composePath: COMPOSE_PATH,
    kubernetesPath: KUBERNETES_PATH,
    generated_at: '2026-06-23T00:00:00.000Z',
  });

  assert.equal(result.schema, PRODUCTION_MANIFEST_RESULT_SCHEMA);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'accepted');
  assert.equal(result.compose.path, 'deploy/docker-compose.production.example.yml');
  assert.equal(result.kubernetes.path, 'deploy/kubernetes/enigma-backend.example.yaml');
  assert.doesNotMatch(JSON.stringify(result), /[A-Za-z]:\\\\|[A-Za-z]:\//);
  assert.equal(result.compose.public_ports_loopback_only, true);
  assert.equal(result.compose.hosted_readiness_ref_count, result.compose.required_hosted_ref_count);
  assert.equal(result.kubernetes.public_readyz_paths, 2);
  assert.equal(result.kubernetes.public_livez_paths, 2);
  assert.equal(result.kubernetes.private_admin_ingress_class, true);
  assert.equal(result.kubernetes.default_deny_network_policy, true);
  assert.equal(result.kubernetes.backup_placeholder_fail_closed, true);
  assert.deepEqual(result.blockers, []);
  assert.ok(result.claim_boundary.some((item) => item.includes('not hosted backend readiness')));
});

test('production compose validation blocks public ports mutable tags and missing readiness refs', async () => {
  const { compose } = await loadFixtures();
  const unsafe = compose
    .replace('image: ghcr.io/enigma-ai/enigma:operator-pinned-digest-required', 'image: ghcr.io/enigma-ai/enigma:latest')
    .replace('"127.0.0.1:8787:8787"', '"8787:8787"')
    .replace(/\n\s+ENIGMA_SERVICE_SETTLEMENT_REF: operator-required-service-settlement-ref/g, '')
    .replace('\n      ENIGMA_SIEM_REF: operator-required-siem-ref', '');

  const result = validateProductionComposeManifestText(unsafe, { path: 'unsafe-compose.yml' });

  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((item) => item.path === 'compose.services.relay.ports[0]'));
  assert.ok(result.blockers.some((item) => item.path === 'compose.services.relay.image'));
  assert.ok(result.blockers.some((item) => item.message.includes('ENIGMA_SERVICE_SETTLEMENT_REF')));
  assert.ok(result.blockers.some((item) => item.path === 'compose.services.relay.environment.ENIGMA_SIEM_REF'));
});

test('production compose validation rejects additional public port mappings', async () => {
  const { compose } = await loadFixtures();
  const unsafe = compose.replace('      - "127.0.0.1:8787:8787"', '      - "127.0.0.1:8787:8787"\n      - "8798:8798"');

  const result = validateProductionComposeManifestText(unsafe, { path: 'unsafe-compose.yml' });

  assert.equal(result.ok, false);
  assert.equal(result.public_ports_loopback_only, false);
  assert.ok(result.blockers.some((item) => item.path === 'compose.services.relay.ports[1]'));
});

test('kubernetes manifest validation blocks public data-plane ingress and non-exact paths', async () => {
  const { kubernetes } = await loadFixtures();
  const unsafe = kubernetes
    .replace('path: /readyz\n            pathType: Exact', 'path: /gateway\n            pathType: Prefix')
    .replace('kubernetes.io/ingress.class: operator-selected-private-ingress-class', 'kubernetes.io/ingress.class: public');

  const result = validateKubernetesBackendManifestText(unsafe, { path: 'unsafe-kubernetes.yaml' });

  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((item) => item.path === 'kubernetes.ingress.enigma-public.pathType'));
  assert.ok(result.blockers.some((item) => item.path === 'kubernetes.ingress.enigma-public.paths'));
  assert.ok(result.blockers.some((item) => item.path === 'kubernetes.ingress.enigma-admin.class'));
});

test('kubernetes manifest validation rejects additional public ingresses', async () => {
  const { kubernetes } = await loadFixtures();
  const unsafe = `${kubernetes}
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: enigma-public-extra
  namespace: enigma-backend
  annotations:
    kubernetes.io/ingress.class: operator-selected-public-ingress-class
spec:
  rules:
    - host: gateway.example.invalid
      http:
        paths:
          - path: /gateway
            pathType: Prefix
            backend:
              service:
                name: enigma-gateway
                port:
                  name: http
`;

  const result = validateKubernetesBackendManifestText(unsafe, { path: 'unsafe-kubernetes.yaml' });

  assert.equal(result.ok, false);
  assert.equal(result.public_prefix_paths, 1);
  assert.equal(result.public_admin_or_data_paths, 1);
  assert.ok(result.blockers.some((item) => item.path === 'kubernetes.ingress.enigma-public-extra'));
});

test('production manifest validator CLI writes public-safe JSON and returns blocked for unsafe manifests', async () => {
  const { compose, kubernetes } = await loadFixtures();
  const dir = await mkdtemp(join(tmpdir(), 'enigma-production-manifest-test-'));
  try {
    const composePath = join(dir, 'compose.yml');
    const kubernetesPath = join(dir, 'kubernetes.yaml');
    const outPath = join(dir, 'result.json');
    await writeFile(composePath, compose.replace('ENIGMA_READINESS_FAIL_CLOSED: "true"', 'ENIGMA_READINESS_FAIL_CLOSED: "false"'), 'utf8');
    await writeFile(kubernetesPath, kubernetes, 'utf8');

    const { spawnSync } = await import('node:child_process');
    const run = spawnSync(process.execPath, ['scripts/validate-production-manifests.mjs', '--compose', composePath, '--kubernetes', kubernetesPath, '--out', outPath, '--generated-at', '2026-06-23T00:00:00.000Z'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    });

    assert.equal(run.status, 1);
    const stdout = JSON.parse(run.stdout);
    const written = JSON.parse(await readFile(outPath, 'utf8'));
    assert.equal(stdout.schema, PRODUCTION_MANIFEST_RESULT_SCHEMA);
    assert.equal(stdout.ok, false);
    assert.equal(written.status, 'blocked');
    assert.equal(stdout.compose.path, '<external-compose-manifest>');
    assert.equal(stdout.kubernetes.path, '<external-kubernetes-manifest>');
    assert.equal(/Bearer\s+|sk-[A-Za-z0-9_-]{16,}|PRIVATE KEY/.test(run.stdout), false);
    assert.ok(stdout.blockers.some((item) => item.path === 'compose.services.relay.environment.ENIGMA_READINESS_FAIL_CLOSED'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('production manifest validator inputs are packaged and copied into review packets', async () => {
  const [packageJson, packetBuilder] = await Promise.all([
    readFile(resolve(PROJECT_ROOT, 'package.json'), 'utf8'),
    readFile(resolve(PROJECT_ROOT, 'scripts/build-review-packet.mjs'), 'utf8'),
  ]);

  for (const rel of ['deploy/docker-compose.production.example.yml', 'deploy/kubernetes/enigma-backend.example.yaml']) {
    assert.ok(packageJson.includes(rel), `${rel} must be included in package files`);
    assert.ok(packetBuilder.includes(rel), `${rel} must be included in review packet sources`);
  }
});
