#!/usr/bin/env node
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { createRelayServer } from '../apps/relay/src/server.mjs';
import { createGatewayServer } from '../apps/gateway/src/server.mjs';

export const BACKEND_READINESS_SMOKE_SCHEMA = 'enigma.backend_readiness_smoke.v1';

const SECRET_OUTPUT_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@|raw memory|private prompt|full transcript|decrypted capsule|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16})/iu;
const SHARED_READINESS_REFS = Object.freeze({
  network_access_policy_ref: 'network-policy-smoke-ref',
  kms_custody_ref: 'kms-custody-smoke-ref',
  tenant_policy_approval_ref: 'tenant-policy-smoke-ref',
  usage_metering_ref: 'usage-metering-smoke-ref',
  service_settlement_ref: 'service-settlement-smoke-ref',
  monitoring_alerting_ref: 'monitoring-alerting-smoke-ref',
  public_site_security_ref: 'public-site-security-smoke-ref',
  security_threat_model_ref: 'security-threat-model-smoke-ref',
  legal_compliance_ref: 'legal-compliance-smoke-ref',
  support_sla_ref: 'support-sla-smoke-ref',
  incident_drill_ref: 'incident-drill-smoke-ref',
  backup_restore_drill_ref: 'backup-restore-drill-smoke-ref',
});

function parseArgs(argv = process.argv.slice(2)) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help') return { help: true };
    if (!arg.startsWith('--')) continue;
    if (!argv[index + 1] || argv[index + 1].startsWith('--')) flags.set(arg.slice(2), true);
    else {
      flags.set(arg.slice(2), argv[index + 1]);
      index += 1;
    }
  }
  return { help: false, flags };
}

function usage() {
  return `Usage: node scripts/run-backend-readiness-smoke.mjs [--host 127.0.0.1]\n\nStarts in-process relay/gateway HTTP servers on loopback ephemeral ports, probes /livez and /readyz,\nand verifies fail-closed production readiness plus a fully referenced production-ready local fixture.\nIt does not expose admin/data routes, provision cloud resources, or prove hosted live infrastructure.\n`;
}

function listen(server, host) {
  return new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    server.once('error', onError);
    server.listen(0, host, () => {
      server.off('error', onError);
      resolve(server.address());
    });
  });
}

async function close(server) {
  if (!server.listening) return;
  server.close();
  await once(server, 'close');
}

async function getJson(baseUrl, path) {
  const response = await fetch(`${baseUrl}${path}`, { method: 'GET', headers: { accept: 'application/json' } });
  const text = await response.text();
  if (SECRET_OUTPUT_RE.test(text)) throw new Error(`${baseUrl}${path} emitted secret-looking output`);
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${baseUrl}${path} did not return JSON`);
  }
  return { status: response.status, body, byte_count: Buffer.byteLength(text) };
}

function missingCount(body) {
  return Array.isArray(body?.missing_evidence_refs) ? body.missing_evidence_refs.length : null;
}

function allChecksOk(body) {
  return Array.isArray(body?.checks) && body.checks.length > 0 && body.checks.every((check) => check.ok === true);
}

function isLoopbackHost(host) {
  return host === '127.0.0.1' || host === '::1' || host === 'localhost';
}

function relayReadyOptions() {
  return {
    mode: 'production',
    now: '1970-01-01T00:00:00.000Z',
    backend_host_ref: 'relay-backend-host-smoke-ref',
    dns_tls_ref: 'relay-dns-tls-smoke-ref',
    runtime_auth_ref: 'relay-runtime-auth-smoke-ref',
    durable_storage: { kind: 'postgres', ref: 'relay-durable-storage-smoke-ref' },
    kms_ref: 'relay-kms-smoke-ref',
    siem_ref: 'relay-siem-smoke-ref',
    backup_target: 'relay-backup-smoke-ref',
    monitoring_ref: 'relay-monitoring-smoke-ref',
    ...SHARED_READINESS_REFS,
    operator_acceptance: { decision: 'go', status: 'go', ref: 'relay-operator-acceptance-smoke-ref' },
  };
}

function gatewayReadyOptions() {
  return {
    mode: 'production',
    backend_host_ref: 'gateway-backend-host-smoke-ref',
    dns_tls_ref: 'gateway-dns-tls-smoke-ref',
    durable_storage: { kind: 'postgres', ref: 'gateway-durable-storage-smoke-ref' },
    state_backend: { kind: 'postgres', ref: 'gateway-state-backend-smoke-ref' },
    kms_ref: 'gateway-kms-smoke-ref',
    siem_ref: 'gateway-siem-smoke-ref',
    backup_target: 'gateway-backup-smoke-ref',
    monitoring_ref: 'gateway-monitoring-smoke-ref',
    admin_auth_ref: 'gateway-admin-auth-smoke-ref',
    data_plane_auth_ref: 'gateway-data-plane-auth-smoke-ref',
    ...SHARED_READINESS_REFS,
    operator_acceptance: { decision: 'go', status: 'go', ref: 'gateway-operator-acceptance-smoke-ref' },
  };
}

async function probeServer({ service, mode, serverFactory, host, expectedReadyStatus, expectedReadyOk }) {
  const server = serverFactory();
  try {
    const address = await listen(server, host);
    const baseUrl = `http://${address.address}:${address.port}`;
    const livez = await getJson(baseUrl, '/livez');
    const readyz = await getJson(baseUrl, '/readyz');
    return {
      service,
      mode,
      bind_host: address.address,
      public_routes_probed: ['/livez', '/readyz'],
      livez_status: livez.status,
      livez_ok: livez.body?.ok === true,
      readyz_status: readyz.status,
      readyz_ok: readyz.body?.ok === true,
      readyz_missing_evidence_ref_count: missingCount(readyz.body),
      readyz_all_checks_ok: allChecksOk(readyz.body),
      ok: livez.status === 200
        && livez.body?.ok === true
        && readyz.status === expectedReadyStatus
        && readyz.body?.ok === expectedReadyOk,
    };
  } finally {
    await close(server);
  }
}

export async function runBackendReadinessSmoke(options = {}) {
  const host = options.host ?? '127.0.0.1';
  if (!isLoopbackHost(host)) throw new Error(`backend readiness smoke host must be loopback-only; received ${host}`);
  const generatedAt = options.generated_at ?? options.generatedAt ?? new Date().toISOString();
  const checks = [];
  checks.push(await probeServer({
    service: 'relay',
    mode: 'production-fail-closed',
    host,
    expectedReadyStatus: 503,
    expectedReadyOk: false,
    serverFactory: () => createRelayServer({ mode: 'production', now: '1970-01-01T00:00:00.000Z' }),
  }));
  checks.push(await probeServer({
    service: 'gateway',
    mode: 'production-fail-closed',
    host,
    expectedReadyStatus: 503,
    expectedReadyOk: false,
    serverFactory: () => createGatewayServer({ mode: 'production' }),
  }));
  checks.push(await probeServer({
    service: 'relay',
    mode: 'production-referenced-fixture',
    host,
    expectedReadyStatus: 200,
    expectedReadyOk: true,
    serverFactory: () => createRelayServer(relayReadyOptions()),
  }));
  checks.push(await probeServer({
    service: 'gateway',
    mode: 'production-referenced-fixture',
    host,
    expectedReadyStatus: 200,
    expectedReadyOk: true,
    serverFactory: () => createGatewayServer(gatewayReadyOptions()),
  }));
  const result = {
    schema: BACKEND_READINESS_SMOKE_SCHEMA,
    generated_at: generatedAt,
    ok: checks.every((check) => check.ok === true) && isLoopbackHost(host),
    check_count: checks.length,
    loopback_only: isLoopbackHost(host),
    checks,
    claim_boundary: [
      'This smoke starts local in-process HTTP servers on loopback ephemeral ports only.',
      'It verifies /livez and /readyz behavior, fail-closed production defaults, and fully referenced production fixture readiness.',
      'It does not prove hosted DNS, TLS, Cloudflare, durable cloud storage, KMS, SIEM, backup, operator acceptance, or customer BYOC infrastructure is live.',
    ],
  };
  if (SECRET_OUTPUT_RE.test(JSON.stringify(result))) throw new Error('backend readiness smoke output appears to contain a secret');
  return result;
}

export async function runCli(argv = process.argv.slice(2), options = {}) {
  const parsed = parseArgs(argv);
  if (parsed.help) return { text: usage() };
  const host = parsed.flags?.get('host') ?? options.host ?? '127.0.0.1';
  return { json: await runBackendReadinessSmoke({ ...options, host }) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await runCli();
    if (result.text) process.stdout.write(result.text);
    else process.stdout.write(`${JSON.stringify(result.json, null, 2)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(`${JSON.stringify({ schema: BACKEND_READINESS_SMOKE_SCHEMA, ok: false, error: { code: 'BACKEND_READINESS_SMOKE_ERROR', message } }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
