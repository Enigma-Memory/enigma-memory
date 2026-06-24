#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIRED_REF_KEYS } from './validate-hosted-backend-live.mjs';

export const EDGE_BACKEND_WORKER_BUNDLE_SCHEMA = 'enigma.edge_backend_worker_bundle.v1';

const COMPATIBILITY_DATE = '2026-06-24';
const SERVICE_CONFIGS = Object.freeze({
  relay: Object.freeze({
    kind: 'relay',
    service: 'enigma-relay',
    workerName: 'enigma-relay',
    hostPrefix: 'relay',
    privateRoutes: Object.freeze(['/relay/records', '/pairing/challenge', '/pairing/complete']),
  }),
  gateway: Object.freeze({
    kind: 'gateway',
    service: 'enigma-gateway',
    workerName: 'enigma-gateway',
    hostPrefix: 'gateway',
    privateRoutes: Object.freeze(['/policy', '/gateway/evaluate', '/gateway/decision', '/siem/export']),
  }),
});
export const EDGE_BACKEND_REF_ENV_NAMES = Object.freeze({
  backend_host: Object.freeze(['ENIGMA_BACKEND_HOST_REF']),
  dns_tls: Object.freeze(['ENIGMA_DNS_TLS_REF', 'ENIGMA_TLS_REF']),
  durable_storage: Object.freeze(['ENIGMA_DURABLE_STORAGE_REF', 'ENIGMA_EXTERNAL_STORAGE_REF']),
  kms_or_secret_custody: Object.freeze(['ENIGMA_KMS_KEY_REF', 'ENIGMA_KMS_REF', 'ENIGMA_SECRETS_MANAGER_REF']),
  backup_restore: Object.freeze(['ENIGMA_BACKUP_TARGET_REF', 'ENIGMA_RESTORE_TARGET_REF']),
  monitoring: Object.freeze(['ENIGMA_MONITORING_REF']),
  siem_or_log_sink: Object.freeze(['ENIGMA_SIEM_REF', 'ENIGMA_AUDIT_SINK_REF', 'ENIGMA_LOG_SINK_REF']),
  operator_acceptance: Object.freeze(['ENIGMA_OPERATOR_ACCEPTANCE_REF', 'ENIGMA_OPERATOR_ACCEPTANCE_EVIDENCE_URI']),
  runtime_auth: Object.freeze(['ENIGMA_RUNTIME_AUTH_REF']),
  admin_auth: Object.freeze(['ENIGMA_ADMIN_AUTH_REF', 'ENIGMA_GATEWAY_ADMIN_AUTH_REF']),
  data_plane_auth: Object.freeze(['ENIGMA_DATA_PLANE_AUTH_REF', 'ENIGMA_GATEWAY_DATA_PLANE_AUTH_REF']),
  network_access_policy: Object.freeze(['ENIGMA_NETWORK_ACCESS_POLICY_REF', 'ENIGMA_NETWORK_POLICY_REF']),
  kms_custody: Object.freeze(['ENIGMA_KMS_CUSTODY_REF', 'ENIGMA_KEY_CUSTODY_REF']),
  tenant_policy_approval: Object.freeze(['ENIGMA_TENANT_POLICY_APPROVAL_REF', 'ENIGMA_TENANT_POLICY_REF']),
  usage_metering: Object.freeze(['ENIGMA_USAGE_METERING_REF', 'ENIGMA_METERING_REF']),
  service_settlement: Object.freeze(['ENIGMA_SERVICE_SETTLEMENT_REF', 'ENIGMA_SETTLEMENT_REF']),
  monitoring_alerting: Object.freeze(['ENIGMA_MONITORING_ALERTING_REF', 'ENIGMA_ALERTING_EVIDENCE_REF']),
  public_site_security: Object.freeze(['ENIGMA_PUBLIC_SITE_SECURITY_REF', 'ENIGMA_SITE_SECURITY_REF']),
  security_threat_model: Object.freeze(['ENIGMA_SECURITY_THREAT_MODEL_REF', 'ENIGMA_THREAT_MODEL_REF']),
  legal_compliance_approval: Object.freeze(['ENIGMA_LEGAL_COMPLIANCE_REF', 'ENIGMA_LEGAL_APPROVAL_REF', 'ENIGMA_LEGAL_COMPLIANCE_APPROVAL_REF']),
  support_sla: Object.freeze(['ENIGMA_SUPPORT_SLA_REF']),
  incident_drill: Object.freeze(['ENIGMA_INCIDENT_DRILL_REF']),
  backup_restore_drill: Object.freeze(['ENIGMA_BACKUP_RESTORE_DRILL_REF']),
  relay_deployment: Object.freeze(['ENIGMA_RELAY_DEPLOYMENT_REF']),
  gateway_deployment: Object.freeze(['ENIGMA_GATEWAY_DEPLOYMENT_REF']),
});
const CLAIM_BOUNDARY = Object.freeze([
  'Edge backend Workers provide public HTTPS liveness/readiness and fail-closed private-route boundaries for urgent bootstrap only.',
  'Readiness is true only when operator-supplied evidence refs and operator acceptance are configured; the Worker does not create storage, KMS, SIEM, backups, legal approval, or acceptance evidence.',
  'Private data-plane routes remain closed by default; raw memory, prompts, transcripts, provider responses, credentials, and private keys must not be returned by these Workers.',
]);

const SECRET_VALUE_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16})/iu;

function sha256(text) {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

function domainFrom(options) {
  const domain = String(options.domain ?? 'enigmamemory.com').trim().toLowerCase().replace(/\.$/, '');
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain)) throw new Error('--domain must be a valid DNS domain');
  return domain;
}

function wranglerToml(config, domain) {
  return `name = "${config.workerName}"
main = "worker.mjs"
compatibility_date = "${COMPATIBILITY_DATE}"
workers_dev = false
routes = [
  { pattern = "${config.hostPrefix}.${domain}", custom_domain = true }
]

[observability]
enabled = false
`;
}

export function edgeBackendWorkerSource(configInput, options = {}) {
  const config = typeof configInput === 'string' ? SERVICE_CONFIGS[configInput] : configInput;
  if (!config) throw new Error('service kind must be relay or gateway');
  const requiredRefs = JSON.stringify(REQUIRED_REF_KEYS, null, 2);
  const refEnvNames = JSON.stringify(EDGE_BACKEND_REF_ENV_NAMES, null, 2);
  const boundary = JSON.stringify(CLAIM_BOUNDARY, null, 2);
  const privateRoutes = JSON.stringify(config.privateRoutes, null, 2);
  const generatedAt = JSON.stringify(options.generated_at ?? options.generatedAt ?? new Date(0).toISOString());
  return `const SERVICE_KIND = ${JSON.stringify(config.kind)};
const SERVICE_NAME = ${JSON.stringify(config.service)};
const GENERATED_AT = ${generatedAt};
const REQUIRED_REFS = ${requiredRefs};
const REF_ENV_NAMES = ${refEnvNames};
const PRIVATE_ROUTES = ${privateRoutes};
const CLAIM_BOUNDARY = ${boundary};

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'permissions-policy': 'interest-cohort=()'
    }
  });
}

function hasValue(env, name) {
  return typeof env?.[name] === 'string' && env[name].trim().length > 0 && !/^<[^<>]+>$/.test(env[name].trim());
}

function envValue(env, names) {
  for (const name of names) if (hasValue(env, name)) return env[name].trim();
  return null;
}

function configuredRefKeys(env) {
  return REQUIRED_REFS.filter((key) => envValue(env, REF_ENV_NAMES[key] || []));
}

function configuredRefs(env) {
  return Object.fromEntries(REQUIRED_REFS.map((key) => [key, envValue(env, REF_ENV_NAMES[key] || [])]).filter(([, value]) => value !== null));
}



function bindingHas(binding, methods) {
  return binding && methods.every((method) => typeof binding[method] === 'function');
}

async function storageBindingCheck(env) {
  const ledger = env?.ENIGMA_LEDGER_DB;
  const auditBindingName = SERVICE_KIND === 'relay' ? 'ENIGMA_RELAY_AUDIT_KV' : 'ENIGMA_GATEWAY_AUDIT_KV';
  const audit = env?.[auditBindingName];
  const ledgerDatabaseBound = bindingHas(ledger, ['prepare']);
  const auditNamespaceBound = bindingHas(audit, ['get', 'put']);
  let ledgerReadOk = false;
  let auditReadOk = false;
  let auditWriteOk = false;
  if (ledgerDatabaseBound) {
    try {
      const row = await ledger.prepare('SELECT 1 AS ok').first();
      ledgerReadOk = row?.ok === 1 || row?.ok === true || row?.OK === 1;
    } catch {
      ledgerReadOk = false;
    }
  }
  if (auditNamespaceBound) {
    try {
      await audit.put('__enigma_bootstrap_readiness__', SERVICE_NAME + ':ok', { expirationTtl: 60 });
      auditWriteOk = true;
      const value = await audit.get('__enigma_bootstrap_readiness__');
      auditReadOk = value === SERVICE_NAME + ':ok';
    } catch {
      auditWriteOk = false;
      auditReadOk = false;
    }
  }
  return {
    name: 'storage_bindings',
    ok: ledgerReadOk && auditWriteOk && auditReadOk,
    ledger_database_bound: ledgerDatabaseBound,
    audit_namespace_bound: auditNamespaceBound,
    ledger_read_ok: ledgerReadOk,
    audit_read_ok: auditReadOk,
    audit_write_ok: auditWriteOk,
    audit_binding: auditBindingName
  };
}

function secretCustodyCheck(env) {
  const sentinelBound = hasValue(env, 'ENIGMA_BOOTSTRAP_SECRET_SENTINEL');
  const hmacBound = hasValue(env, 'ENIGMA_READINESS_HMAC_KEY');
  return { name: 'secret_custody_binding', ok: sentinelBound && hmacBound, sentinel_bound: sentinelBound, readiness_hmac_bound: hmacBound, value_returned: false };
}
async function readiness(env) {
  const configured = configuredRefKeys(env);
  const refs = configuredRefs(env);
  const missing = REQUIRED_REFS.filter((key) => !configured.includes(key));
  const decision = typeof env?.ENIGMA_OPERATOR_ACCEPTANCE_DECISION === 'string' ? env.ENIGMA_OPERATOR_ACCEPTANCE_DECISION.trim().toLowerCase() : '';
  const decisionOk = decision === 'go';
  const storageCheck = await storageBindingCheck(env);
  const secretCheck = secretCustodyCheck(env);
  const ok = missing.length === 0 && decisionOk && storageCheck.ok && secretCheck.ok;
  return {
    ok,
    service: SERVICE_NAME,
    service_kind: SERVICE_KIND,
    runtime: 'cloudflare-workers',
    generated_at: GENERATED_AT,
    status: ok ? 'ready' : 'blocked',
    evidence_refs: refs,
    evidence_ref_count: configured.length,
    missing_evidence_refs: missing,
    checks: [
      { name: 'production_evidence_refs', ok: missing.length === 0, required_count: REQUIRED_REFS.length, present_count: configured.length, missing_count: missing.length },
      { name: 'operator_acceptance', ok: decisionOk, expected: 'go', observed: decisionOk ? 'go' : 'missing_or_not_go' },
      storageCheck,
      secretCheck,
      { name: 'private_routes_fail_closed', ok: true, route_count: PRIVATE_ROUTES.length }
    ],
    claim_boundary: CLAIM_BOUNDARY
  };
}

function error(code, message) {
  return { ok: false, service: SERVICE_NAME, error: { code, message }, claim_boundary: CLAIM_BOUNDARY };
}

function plaintextLooking(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return /raw memory|private prompt|full transcript|decrypted capsule|provider response/iu.test(value);
  if (typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => plaintextLooking(item, seen));
  for (const [key, nested] of Object.entries(value)) {
    if (/(?:raw[_-]?memory|plaintext|prompt|completion|transcript|provider[_-]?response|secret|password|token|cookie)/iu.test(key)) return true;
    if (plaintextLooking(nested, seen)) return true;
  }
  return false;
}

async function bodyIsUnsafe(request) {
  if (request.method === 'GET' || request.method === 'HEAD') return false;
  const text = await request.clone().text();
  if (text.length > 65536) return true;
  if (text.length === 0) return false;
  try { return plaintextLooking(JSON.parse(text)); } catch { return true; }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'POST') return json(error('METHOD_NOT_ALLOWED', 'Only GET, HEAD, and POST are allowed.'), 405);
    if (url.pathname === '/livez') return json({ ok: true, service: SERVICE_NAME, service_kind: SERVICE_KIND, runtime: 'cloudflare-workers', claim_boundary: CLAIM_BOUNDARY });
    if (url.pathname === '/readyz') {
      const body = await readiness(env);
      return json(body, body.ok ? 200 : 503);
    }
    if (PRIVATE_ROUTES.includes(url.pathname)) {
      if (await bodyIsUnsafe(request)) return json(error('PLAINTEXT_REJECTED', 'Request body is not accepted by the public edge bootstrap.'), 400);
      return json(error('PRIVATE_ROUTE_CLOSED', 'Private data-plane route is closed in the public edge bootstrap until full operator deployment is complete.'), 503);
    }
    return json(error('NOT_FOUND', 'Use /livez or /readyz for public health checks.'), 404);
  }
};
`;
}

export function validateEdgeBackendWorkerSource(source, configInput) {
  const config = typeof configInput === 'string' ? SERVICE_CONFIGS[configInput] : configInput;
  const text = String(source ?? '');
  const blockers = [];
  if (!config) blockers.push({ path: 'service', message: 'service kind must be relay or gateway' });
  if (!text.includes(`const SERVICE_NAME = ${JSON.stringify(config?.service)}`)) blockers.push({ path: 'source.service', message: 'worker must declare the expected service name' });
  if (!text.includes("url.pathname === '/livez'")) blockers.push({ path: 'source.livez', message: 'worker must route /livez' });
  if (!text.includes("url.pathname === '/readyz'")) blockers.push({ path: 'source.readyz', message: 'worker must route /readyz' });
  if (!text.includes('PRIVATE_ROUTE_CLOSED')) blockers.push({ path: 'source.private_routes', message: 'worker must fail closed for private routes' });
  if (text.includes('hosted_probe_only') || text.includes('pages_edge_probe_only')) blockers.push({ path: 'source.claim', message: 'edge backend worker must not masquerade as probe-only payload' });
  if (SECRET_VALUE_RE.test(text)) blockers.push({ path: 'source.secret', message: 'worker source contains secret-looking literal' });
  for (const key of REQUIRED_REF_KEYS) if (!text.includes(key)) blockers.push({ path: `source.refs.${key}`, message: `worker source missing ${key}` });
  return {
    ok: blockers.length === 0,
    blockers,
    service: config?.service ?? null,
    source_hash: sha256(text),
    required_ref_count: REQUIRED_REF_KEYS.length,
  };
}

export function buildEdgeBackendWorkerBundle(options = {}) {
  const domain = domainFrom(options);
  const services = {};
  for (const config of Object.values(SERVICE_CONFIGS)) {
    const source = edgeBackendWorkerSource(config, options);
    services[config.kind] = {
      service: config.service,
      worker_name: config.workerName,
      hostname: `${config.hostPrefix}.${domain}`,
      default_routes: ['/livez', '/readyz'],
      private_routes: [...config.privateRoutes],
      validation: validateEdgeBackendWorkerSource(source, config),
      files: {
        'worker.mjs': source,
        'wrangler.toml': wranglerToml(config, domain),
      },
      deploy_command: `npx wrangler deploy --config ${config.kind}/wrangler.toml`,
    };
  }
  const ok = Object.values(services).every((service) => service.validation.ok);
  return {
    schema: EDGE_BACKEND_WORKER_BUNDLE_SCHEMA,
    generated_at: options.generated_at ?? options.generatedAt ?? new Date().toISOString(),
    ok,
    domain,
    compatibility_date: COMPATIBILITY_DATE,
    services,
    claim_boundary: [...CLAIM_BOUNDARY],
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = { outDir: null, domain: 'enigmamemory.com' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out-dir') out.outDir = argv[++index];
    else if (arg === '--domain') out.domain = argv[++index];
    else if (arg === '--help') out.help = true;
    else throw new Error(`unknown argument ${arg}`);
  }
  return out;
}

function usage() {
  return 'Usage: node scripts/build-edge-backend-workers.mjs --out-dir <dir> [--domain enigmamemory.com]\n\nBuilds public-safe Cloudflare Worker relay/gateway health backends for urgent edge bootstrap. It creates no cloud resources and does not prove production readiness.\n';
}

async function main() {
  const args = parseArgs();
  if (args.help || !args.outDir) {
    process.stdout.write(usage());
    process.exitCode = args.help ? 0 : 1;
    return;
  }
  const bundle = buildEdgeBackendWorkerBundle({ domain: args.domain });
  const outDir = resolve(args.outDir);
  await mkdir(outDir, { recursive: true });
  for (const [kind, service] of Object.entries(bundle.services)) {
    const serviceDir = join(outDir, kind);
    await mkdir(serviceDir, { recursive: true });
    for (const [filename, text] of Object.entries(service.files)) await writeFile(join(serviceDir, filename), text, 'utf8');
  }
  const manifest = {
    ...bundle,
    services: Object.fromEntries(Object.entries(bundle.services).map(([kind, service]) => [kind, { ...service, files: Object.keys(service.files) }])),
  };
  await writeFile(join(outDir, 'EDGE_BACKEND_WORKERS_MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ ok: bundle.ok, schema: bundle.schema, out_dir: '<edge-backend-workers-output>', services: Object.keys(bundle.services), claim_boundary: bundle.claim_boundary }, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${error?.message ?? String(error)}\n`);
    process.exitCode = 1;
  });
}
