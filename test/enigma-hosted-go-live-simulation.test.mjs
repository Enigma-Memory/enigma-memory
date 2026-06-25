import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { execFile } from 'node:child_process';
import { buildOperatorAcceptancePacket } from '../scripts/build-operator-acceptance-packet.mjs';
import https from 'node:https';
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
const RELAY_URL = 'https://sim.enigmamemory.com:8443';
const GATEWAY_URL = 'https://sim.enigmamemory.com:9443';

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

test('hosted/BYOC go-live simulation produces accepted live evidence', { timeout: 300000 }, async (t) => {
  if (!dockerComposeAvailable() || !dockerLinuxContainersAvailable()) {
    t.skip('Docker Compose with Linux containers not available');
    return;
  }

  const started = Date.now();

  try {
    await execFileAsync(process.execPath, ['scripts/simulate-production-env.mjs'], {
      cwd: PROJECT_ROOT,
      timeout: 60000,
      windowsHide: true,
    });

    await execFileAsync('docker', ['compose', '-f', COMPOSE_FILE, 'up', '--build', '-d'], {
      cwd: PROJECT_ROOT,
      timeout: 240000,
      windowsHide: true,
    });

    await execFileAsync(process.execPath, ['scripts/wait-for-backend-ready.mjs', '--timeout', '120'], {
      cwd: PROJECT_ROOT,
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
      relayBaseUrl: RELAY_URL,
      gatewayBaseUrl: GATEWAY_URL,
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
      await execFileAsync('docker', ['compose', '-f', COMPOSE_FILE, 'down', '-v'], {
        cwd: PROJECT_ROOT,
        timeout: 120000,
        windowsHide: true,
      });
    } catch {
      // Best-effort cleanup; do not mask the original failure.
    }
  }

  t.diagnostic(`go-live simulation completed in ${Date.now() - started}ms`);
});
