#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HOSTED_PROBE_WORKER_BUNDLE_SCHEMA = 'enigma.hosted_probe_worker_bundle.v1';

export const REQUIRED_WORKER_ENV_REFS = Object.freeze([
  'ENIGMA_BACKEND_HOST_REF',
  'ENIGMA_DNS_TLS_REF',
  'ENIGMA_DURABLE_STORAGE_REF',
  'ENIGMA_KMS_CUSTODY_REF',
  'ENIGMA_BACKUP_RESTORE_REF',
  'ENIGMA_MONITORING_ALERTING_REF',
  'ENIGMA_SIEM_LOG_SINK_REF',
  'ENIGMA_OPERATOR_ACCEPTANCE_REF',
  'ENIGMA_NETWORK_ACCESS_POLICY_REF',
  'ENIGMA_TENANT_POLICY_APPROVAL_REF',
  'ENIGMA_USAGE_METERING_REF',
  'ENIGMA_SERVICE_SETTLEMENT_REF',
  'ENIGMA_SECURITY_THREAT_MODEL_REF',
  'ENIGMA_LEGAL_COMPLIANCE_APPROVAL_REF',
  'ENIGMA_SUPPORT_SLA_REF',
  'ENIGMA_INCIDENT_DRILL_REF',
  'ENIGMA_PUBLIC_SITE_SECURITY_REF',
]);

const WORKER_CLAIM_BOUNDARY = Object.freeze([
  'This Worker is a hosted public HTTPS probe harness, not the relay/gateway data plane.',
  'It proves only that the edge route can fail closed and expose /livez and /readyz shape without secrets.',
  'It must not be used as hosted backend live evidence unless real relay/gateway/storage/KMS/SIEM/backup/operator refs and probes are supplied separately.',
]);

const SECRET_VALUE_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|raw memory|private prompt|full transcript|decrypted capsule)/iu;

function sha256(text) {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

export function hostedProbeWorkerSource(options = {}) {
  const serviceName = options.serviceName ?? 'enigma-hosted-probe';
  const requiredRefs = JSON.stringify(REQUIRED_WORKER_ENV_REFS, null, 2);
  const boundary = JSON.stringify(WORKER_CLAIM_BOUNDARY, null, 2);
  return `const SERVICE_NAME = ${JSON.stringify(serviceName)};
const REQUIRED_REFS = ${requiredRefs};
const CLAIM_BOUNDARY = ${boundary};

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    },
  });
}

function hasValue(env, key) {
  return typeof env?.[key] === 'string' && env[key].trim().length > 0;
}

function readiness(env) {
  const missing = REQUIRED_REFS.filter((key) => !hasValue(env, key));
  const decision = typeof env?.ENIGMA_OPERATOR_ACCEPTANCE_DECISION === 'string' ? env.ENIGMA_OPERATOR_ACCEPTANCE_DECISION.trim().toLowerCase() : '';
  const decisionOk = decision === 'go';
  return {
    ok: missing.length === 0 && decisionOk,
    service: SERVICE_NAME,
    hosted_probe_only: true,
    missing_evidence_refs: missing,
    checks: [
      { id: 'required_refs', ok: missing.length === 0, missing_count: missing.length, required_count: REQUIRED_REFS.length },
      { id: 'operator_acceptance_decision', ok: decisionOk, expected: 'go', observed: decisionOk ? 'go' : 'missing_or_not_go' },
    ],
    claim_boundary: CLAIM_BOUNDARY,
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== 'GET' && request.method !== 'HEAD') return json({ ok: false, error: 'method_not_allowed' }, 405);
    if (url.pathname === '/livez') {
      return json({ ok: true, service: SERVICE_NAME, hosted_probe_only: true, claim_boundary: CLAIM_BOUNDARY });
    }
    if (url.pathname === '/readyz') {
      const body = readiness(env);
      return json(body, body.ok ? 200 : 503);
    }
    return json({ ok: false, error: 'not_found', allowed_paths: ['/livez', '/readyz'] }, 404);
  },
};
`;
}

export function validateHostedProbeWorkerSource(source) {
  const blockers = [];
  const text = String(source ?? '');
  if (!text.includes("url.pathname === '/livez'")) blockers.push({ path: 'source', message: 'worker must route /livez' });
  if (!text.includes("url.pathname === '/readyz'")) blockers.push({ path: 'source', message: 'worker must route /readyz' });
  if (!text.includes('missing_evidence_refs')) blockers.push({ path: 'source', message: 'worker must expose missing evidence refs on /readyz' });
  if (!text.includes('hosted_probe_only: true')) blockers.push({ path: 'source', message: 'worker must mark hosted_probe_only true' });
  if (!text.includes('status,') || !text.includes('body.ok ? 200 : 503')) blockers.push({ path: 'source', message: 'worker readyz must fail closed with 503 until complete' });
  if (SECRET_VALUE_RE.test(text)) blockers.push({ path: 'source', message: 'worker source contains secret-looking literal' });
  for (const ref of REQUIRED_WORKER_ENV_REFS) if (!text.includes(ref)) blockers.push({ path: `source.${ref}`, message: `worker missing required ref ${ref}` });
  return {
    ok: blockers.length === 0,
    blockers,
    required_ref_count: REQUIRED_WORKER_ENV_REFS.length,
    source_hash: sha256(text),
  };
}

export function buildHostedProbeWorkerBundle(options = {}) {
  const source = hostedProbeWorkerSource(options);
  const validation = validateHostedProbeWorkerSource(source);
  return {
    schema: HOSTED_PROBE_WORKER_BUNDLE_SCHEMA,
    generated_at: options.generated_at ?? options.generatedAt ?? new Date().toISOString(),
    ok: validation.ok,
    worker_name: options.workerName ?? 'enigma-hosted-probe',
    entrypoint: 'worker.mjs',
    required_env_refs: [...REQUIRED_WORKER_ENV_REFS],
    validation,
    deployment_plan: {
      runtime: 'cloudflare-workers',
      entrypoint: 'worker.mjs',
      default_routes: ['/livez', '/readyz'],
      mutates_cloudflare: false,
      command_hint: 'wrangler deploy worker.mjs --name enigma-hosted-probe',
    },
    claim_boundary: [...WORKER_CLAIM_BOUNDARY],
    files: {
      'worker.mjs': source,
      'README.md': `# Enigma hosted probe Worker\n\nThis package is a Cloudflare Workers public HTTPS probe harness for Enigma backend readiness. It is not the relay/gateway data plane. It exposes /livez and /readyz, fails closed until required refs and operator acceptance are configured, and never returns secret values.\n`,
    },
  };
}

function parseArgs(argv) {
  const out = { outDir: null, generated_at: null };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--out-dir') out.outDir = argv[++index];
    else if (token === '--generated-at') out.generated_at = argv[++index];
    else if (token === '--help' || token === '-h') out.help = true;
    else throw new Error(`Unknown argument: ${token}`);
  }
  return out;
}

function help() {
  return `Usage: node scripts/build-hosted-probe-worker.mjs [--out-dir <dir>]\n\nBuilds a public-safe Cloudflare Worker probe artifact for /livez and fail-closed /readyz.\nThis does not deploy Cloudflare resources or prove hosted backend readiness.\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(help());
    return 0;
  }
  const bundle = buildHostedProbeWorkerBundle(options);
  if (options.outDir) {
    const outDir = resolve(options.outDir);
    await mkdir(outDir, { recursive: true });
    await Promise.all(Object.entries(bundle.files).map(async ([rel, body]) => {
      const outPath = join(outDir, rel);
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, body, 'utf8');
    }));
    const manifest = { ...bundle, files: Object.fromEntries(Object.entries(bundle.files).map(([rel, body]) => [rel, { bytes: Buffer.byteLength(body), sha256: sha256(body) }])) };
    await writeFile(join(outDir, 'HOSTED_PROBE_WORKER_MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
    return bundle.ok ? 0 : 1;
  }
  const publicBundle = { ...bundle, files: Object.fromEntries(Object.entries(bundle.files).map(([rel, body]) => [rel, { bytes: Buffer.byteLength(body), sha256: sha256(body) }])) };
  process.stdout.write(`${JSON.stringify(publicBundle, null, 2)}\n`);
  return bundle.ok ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
