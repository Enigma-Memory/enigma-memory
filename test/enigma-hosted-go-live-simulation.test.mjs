import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildOperatorAcceptancePacket } from '../scripts/build-operator-acceptance-packet.mjs';
import https from 'node:https';
import { createServer } from 'node:net';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { collectHostedBackendLiveEvidence } from '../scripts/collect-hosted-backend-live-evidence.mjs';
import {
  HOSTED_BACKEND_LIVE_RESULT_SCHEMA,
  REQUIRED_REF_KEYS,
  validateHostedBackendLiveEvidence,
} from '../scripts/validate-hosted-backend-live.mjs';

// CLAIM BOUNDARY: This test exercises the hosted/BYOC go-live scripts against
// the local production simulation (deploy/docker-compose.local-production-simulation.yml).
// It proves the scripts and validators work together; it does NOT prove a real
// production deployment is ready and must not be used as live go-live evidence.

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const COMPOSE_FILE = 'deploy/docker-compose.local-production-simulation.yml';
const SIM_REFS_PATH = '.enigma/sim-hosted-refs.json';
const SIM_OPERATOR_ACCEPTANCE_PATH = '.enigma/sim-operator-acceptance.json';
function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

function gatewayBearerSha256(secretsDir, name) {
  const token = fs.readFileSync(path.join(secretsDir, name));
  return `sha256:${sha256Hex(token)}`;
}
const SIMULATION_HOST = 'sim.enigmamemory.com';
const SIMULATION_COMPOSE_PROJECT_PREFIX = 'enigma-go-live-sim-';
const SIMULATION_COMPOSE_PROJECT = `${SIMULATION_COMPOSE_PROJECT_PREFIX}${process.pid}-${Date.now().toString(36)}`;
const LEGACY_COMPOSE_PROJECT = 'deploy';
const LEGACY_COMPOSE_CONTAINERS = [
  'deploy-postgres-1',
  'deploy-kms-mock-1',
  'deploy-siem-mock-1',
  'deploy-relay-1',
  'deploy-gateway-1',
  'deploy-tls-proxy-1',
  'deploy_postgres_1',
  'deploy_kms-mock_1',
  'deploy_siem-mock_1',
  'deploy_relay_1',
  'deploy_gateway_1',
  'deploy_tls-proxy_1',
];
const LEGACY_COMPOSE_NETWORK = 'deploy_default';
const LEGACY_COMPOSE_VOLUMES = ['deploy_pgdata', 'deploy_kms-data', 'deploy_siem-data'];

function dockerComposeAvailable() {
  const result = spawnSync('docker', ['compose', 'version'], {
    windowsHide: true,
    encoding: 'utf8',
    shell: false,
  });
  return result.status === 0;
}

function dockerLinuxContainersAvailable() {
  const result = spawnSync('docker', ['info', '--format', '{{.OSType}}'], {
    windowsHide: true,
    encoding: 'utf8',
    shell: false,
  });
  return result.status === 0 && result.stdout.trim() === 'linux';
}

function reserveLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : null;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

function fetchImpl(url, init = {}) {
  const u = new URL(url);
  const options = {
    hostname: '127.0.0.1',
    port: u.port || 443,
    path: `${u.pathname}${u.search}`,
    method: init.method || 'GET',
    headers: init.headers,
    rejectUnauthorized: false,
    servername: u.hostname,
  };
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          statusText: res.statusMessage || '',
          url,
          redirected: false,
          text: async () => text,
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function simulationRefs() {
  return Object.fromEntries(REQUIRED_REF_KEYS.map((key) => [key, `simulation://${key}/verified`]));
}

function composeArgs(projectName, ...args) {
  return ['compose', '-p', projectName, '-f', COMPOSE_FILE, ...args];
}

async function downSimulationCompose(projectName = SIMULATION_COMPOSE_PROJECT, timeout = 120000, env = process.env) {
  await execFileAsync('docker', composeArgs(projectName, 'down', '-v', '--remove-orphans'), {
    cwd: PROJECT_ROOT,
    timeout,
    windowsHide: true,
    env,
  });
}

async function tryDocker(args, timeout = 30000) {
  try {
    await execFileAsync('docker', args, {
      cwd: PROJECT_ROOT,
      timeout,
      windowsHide: true,
    });
  } catch {
    // Best-effort cleanup; missing resources are expected.
  }
}

async function dockerLines(args, timeout = 30000) {
  try {
    const { stdout } = await execFileAsync('docker', args, {
      cwd: PROJECT_ROOT,
      timeout,
      windowsHide: true,
    });
    return stdout.split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

async function cleanupNamedDockerResources(listArgs, removeArgs) {
  const names = await dockerLines(listArgs);
  if (names.length > 0) {
    await tryDocker([...removeArgs, ...names]);
  }
}

async function cleanupStaleSimulationComposeResources() {
  await cleanupNamedDockerResources(
    ['ps', '-aq', '--filter', `name=${SIMULATION_COMPOSE_PROJECT_PREFIX}`],
    ['rm', '-f'],
  );
  await cleanupNamedDockerResources(
    ['network', 'ls', '-q', '--filter', `name=${SIMULATION_COMPOSE_PROJECT_PREFIX}`],
    ['network', 'rm'],
  );
  await cleanupNamedDockerResources(
    ['volume', 'ls', '-q', '--filter', `name=${SIMULATION_COMPOSE_PROJECT_PREFIX}`],
    ['volume', 'rm'],
  );
}

async function cleanupLegacySimulationCompose() {
  try {
    await downSimulationCompose(LEGACY_COMPOSE_PROJECT, 60000);
  } catch {
    // Fall through to exact legacy resource cleanup below.
  }
  await tryDocker(['rm', '-f', ...LEGACY_COMPOSE_CONTAINERS]);
  await tryDocker(['network', 'rm', LEGACY_COMPOSE_NETWORK]);
  await tryDocker(['volume', 'rm', ...LEGACY_COMPOSE_VOLUMES]);
}

test('hosted/BYOC go-live simulation produces accepted live evidence', { timeout: 300000 }, async (t) => {
  if (!dockerComposeAvailable() || !dockerLinuxContainersAvailable()) {
    t.skip('Docker Compose with Linux containers not available');
    return;
  }

  const started = Date.now();
  const relayPort = await reserveLoopbackPort();
  let gatewayPort = await reserveLoopbackPort();
  if (gatewayPort === relayPort) gatewayPort = await reserveLoopbackPort();
  const simSecretsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'enigma-sim-secrets-'));
  const composeEnv = {
    ...process.env,
    ENIGMA_SIM_RELAY_PORT: String(relayPort),
    ENIGMA_SIM_GATEWAY_PORT: String(gatewayPort),
    ENIGMA_SIM_SECRETS_DIR: simSecretsDir,
  };
  const relayUrl = `https://${SIMULATION_HOST}:${relayPort}`;
  const gatewayUrl = `https://${SIMULATION_HOST}:${gatewayPort}`;

  try {
    await cleanupLegacySimulationCompose();
    await cleanupStaleSimulationComposeResources();
    await downSimulationCompose(undefined, undefined, composeEnv);

    await execFileAsync(process.execPath, ['scripts/simulate-production-env.mjs', '--secrets-dir', simSecretsDir], {
      cwd: PROJECT_ROOT,
      timeout: 60000,
      windowsHide: true,
    });
    composeEnv.ENIGMA_GATEWAY_ADMIN_AUTH_BEARER_SHA256 = gatewayBearerSha256(simSecretsDir, 'gateway-admin-auth-bearer');
    composeEnv.ENIGMA_GATEWAY_DATA_PLANE_AUTH_BEARER_SHA256 = gatewayBearerSha256(simSecretsDir, 'gateway-data-plane-auth-bearer');
    await execFileAsync('docker', composeArgs(SIMULATION_COMPOSE_PROJECT, 'up', '--build', '-d'), {
      cwd: PROJECT_ROOT,
      env: composeEnv,
      timeout: 240000,
      windowsHide: true,
    });

    await execFileAsync(process.execPath, ['scripts/wait-for-backend-ready.mjs', '--timeout', '120'], {
      cwd: PROJECT_ROOT,
      env: composeEnv,
      timeout: 150000,
      windowsHide: true,
    });

    const refs = simulationRefs();
    const operatorAcceptance = await buildOperatorAcceptancePacket({
      complete: true,
      packet_id: 'sim-operator-acceptance',
      customer_or_tenant: 'enigma-sim',
      deployment_mode: 'hosted',
      environment: 'local-simulation',
      target_regions: 'local',
      requested_go_live_date: '2026-06-25',
      evidence_repository: 'simulation://enigma-memory/evidence',
      packet_owner: 'enigma-sim',
    });

    const collection = await collectHostedBackendLiveEvidence({
      relayBaseUrl: relayUrl,
      gatewayBaseUrl: gatewayUrl,
      refs,
      environmentId: 'local-simulation',
      domain: 'sim.enigmamemory.com',
      cloudProvider: 'local',
      region: 'local',
      owner: 'enigma-sim',
      operatorDecision: 'go',
      operatorPacketRef: SIM_OPERATOR_ACCEPTANCE_PATH,
      operatorApprovedAt: operatorAcceptance.metadata?.last_updated ?? new Date().toISOString(),
      operatorApprovedBy: 'enigma-sim',
      fetchImpl,
    });

    assert.equal(collection.schema, 'enigma.hosted_backend_live_collection.v1');
    assert.equal(collection.ok, true);

    const validation = validateHostedBackendLiveEvidence(collection.evidence, {
      generated_at: collection.generated_at,
    });

    assert.equal(validation.schema, HOSTED_BACKEND_LIVE_RESULT_SCHEMA);
    assert.equal(validation.ok, true);
    assert.equal(validation.status, 'accepted');
    assert.equal(validation.blockers.length, 0);
    assert.equal(validation.checked.required_refs, REQUIRED_REF_KEYS.length);
    assert.equal(validation.checked.refs_present, REQUIRED_REF_KEYS.length);
    assert.equal(validation.checked.refs_missing, 0);
    assert.equal(validation.checked.required_probes, 4);
    assert.equal(validation.checked.probes_covered, 4);

    assert.doesNotMatch(JSON.stringify(collection), /PRIVATE KEY|sk-[A-Za-z0-9_-]{16}/i);
  } finally {
    try {
      await downSimulationCompose(undefined, undefined, composeEnv);
    } catch {
      // Best-effort cleanup; do not mask the original failure.
    }
    try {
      fs.rmSync(simSecretsDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup of the temporary secrets directory.
    }
  }

  t.diagnostic(`go-live simulation completed in ${Date.now() - started}ms`);
});
