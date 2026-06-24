#!/usr/bin/env node
import { createHash } from 'node:crypto';
import https from 'node:https';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIRED_REF_KEYS } from './validate-hosted-backend-live.mjs';

export const EDGE_BACKEND_BOOTSTRAP_EVIDENCE_SCHEMA = 'enigma.edge_backend_bootstrap_live_evidence.v1';

const SERVICES = Object.freeze([
  Object.freeze({ kind: 'relay', service: 'enigma-relay', hostPrefix: 'relay' }),
  Object.freeze({ kind: 'gateway', service: 'enigma-gateway', hostPrefix: 'gateway' }),
]);

const CLAIM_BOUNDARY = Object.freeze([
  'This evidence proves only public Cloudflare edge reachability and fail-closed readiness for the relay/gateway bootstrap Workers.',
  'It is not hosted backend production readiness until /readyz is backed by real storage, KMS, SIEM/log sink, backup/restore, auth, operator acceptance, and hosted-live validation evidence.',
  'The collector sends no credentials and must not record tokens, account ids, raw memory, prompts, transcripts, provider responses, or private keys.',
]);

const SECRET_LOOKING_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16})/iu;

function sha256(text) {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

function domainFrom(value = 'enigmamemory.com') {
  const domain = String(value).trim().toLowerCase().replace(/\.$/, '');
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain)) throw new Error('--domain must be a valid DNS domain');
  return domain;
}

function publicBodySummary(body) {
  const missing = Array.isArray(body?.missing_evidence_refs) ? body.missing_evidence_refs : [];
  const checks = Array.isArray(body?.checks) ? body.checks : [];
  const secretCheck = checks.find((check) => check?.name === 'secret_custody_binding');
  const storageCheck = checks.find((check) => check?.name === 'storage_bindings');
  return {
    ok: body?.ok === true,
    service: typeof body?.service === 'string' ? body.service : null,
    service_kind: typeof body?.service_kind === 'string' ? body.service_kind : null,
    runtime: typeof body?.runtime === 'string' ? body.runtime : null,
    missing_evidence_ref_count: missing.length,
    missing_ref_set_complete: missing.length === REQUIRED_REF_KEYS.length && REQUIRED_REF_KEYS.every((key) => missing.includes(key)),
    checks_all_ok: checks.length > 0 ? checks.every((check) => check?.ok === true) : null,
    storage_bindings_ok: storageCheck ? storageCheck.ok === true : null,
    storage_ledger_database_bound: storageCheck ? storageCheck.ledger_database_bound === true : null,
    storage_audit_namespace_bound: storageCheck ? storageCheck.audit_namespace_bound === true : null,
    storage_ledger_read_ok: storageCheck ? storageCheck.ledger_read_ok === true : null,
    storage_audit_read_ok: storageCheck ? storageCheck.audit_read_ok === true : null,
    storage_audit_write_ok: storageCheck ? storageCheck.audit_write_ok === true : null,
    custody_binding_ok: secretCheck ? secretCheck.ok === true : null,
    custody_sentinel_bound: secretCheck ? secretCheck.sentinel_bound === true : null,
    custody_readiness_hmac_bound: secretCheck ? secretCheck.readiness_hmac_bound === true : null,
    credential_value_returned: secretCheck ? secretCheck.value_returned === true : null,
    claim_boundary_count: Array.isArray(body?.claim_boundary) ? body.claim_boundary.length : 0,
  };
}

function assertPublicSafe(value, path = 'body', seen = new WeakSet()) {
  if (value === null || value === undefined) return;
  if (typeof value === 'string') {
    if (SECRET_LOOKING_RE.test(value)) throw new Error(`${path} contains secret-looking material`);
    return;
  }
  if (typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertPublicSafe(item, `${path}[${index}]`, seen));
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (/(?:token|password|secret|cookie|account[_-]?id|raw[_-]?memory|prompt|transcript|provider[_-]?response|private[_-]?key)/iu.test(key)) throw new Error(`${path}.${key} is not allowed in public edge evidence`);
    assertPublicSafe(nested, `${path}.${key}`, seen);
  }
}

async function resolveAWithDoh(hostname, fetchImpl = fetch) {
  const response = await fetchImpl(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`, {
    headers: { accept: 'application/dns-json' },
  });
  if (!response.ok) throw new Error(`DNS-over-HTTPS request failed for ${hostname}: ${response.status}`);
  const body = await response.json();
  assertPublicSafe(body, 'dns');
  const answers = Array.isArray(body.Answer) ? body.Answer : [];
  const aRecords = answers.filter((answer) => answer?.type === 1 && typeof answer.data === 'string').map((answer) => answer.data);
  return {
    hostname,
    resolver: 'cloudflare-dns-over-https',
    status: body.Status,
    ok: body.Status === 0 && aRecords.length > 0,
    a_record_count: aRecords.length,
    ips: aRecords,
  };
}

function requestJsonViaEdgeIp(url, ips) {
  return new Promise((resolveRequest) => {
    const parsed = new URL(url);
    const ip = ips[0];
    if (!ip) {
      resolveRequest({ status_code: 0, error: 'NO_A_RECORD' });
      return;
    }
    const req = https.request({
      hostname: parsed.hostname,
      path: `${parsed.pathname}${parsed.search}`,
      method: 'GET',
      servername: parsed.hostname,
      headers: { host: parsed.hostname },
      lookup: (_hostname, options, callback) => options?.all ? callback(null, [{ address: ip, family: 4 }]) : callback(null, ip, 4),
      timeout: 10_000,
    }, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { text += chunk; });
      response.on('end', () => {
        let body;
        try { body = JSON.parse(text); } catch { body = { parse_error: true, text: text.slice(0, 120) }; }
        resolveRequest({ status_code: response.statusCode ?? 0, body, response_hash: sha256(text), bytes: Buffer.byteLength(text) });
      });
    });
    req.on('error', (error) => resolveRequest({ status_code: 0, error: error.code || error.message }));
    req.on('timeout', () => { req.destroy(); resolveRequest({ status_code: 0, error: 'TIMEOUT' }); });
    req.end();
  });
}

function validateProbe(service, path, probe) {
  const body = probe.body ?? {};
  const summary = publicBodySummary(body);
  const blockers = [];
  if (probe.status_code !== (path === '/livez' ? 200 : 503)) blockers.push(`${service.kind}${path} status ${probe.status_code}`);
  if (summary.service !== service.service) blockers.push(`${service.kind}${path} service mismatch`);
  if (summary.service_kind !== service.kind) blockers.push(`${service.kind}${path} kind mismatch`);
  if (summary.runtime !== 'cloudflare-workers') blockers.push(`${service.kind}${path} runtime mismatch`);
  if (path === '/livez' && summary.ok !== true) blockers.push(`${service.kind}${path} ok must be true`);
  if (path === '/readyz') {
    if (body?.ok !== false) blockers.push(`${service.kind}${path} must be fail-closed ok:false`);
    if (summary.missing_evidence_ref_count !== REQUIRED_REF_KEYS.length) blockers.push(`${service.kind}${path} must list all missing hosted refs`);
    if (summary.missing_ref_set_complete !== true) blockers.push(`${service.kind}${path} missing ref set incomplete`);
  }
  return { ok: blockers.length === 0, blockers, summary };
}

export async function collectEdgeBackendBootstrapEvidence(options = {}) {
  const domain = domainFrom(options.domain ?? 'enigmamemory.com');
  const generatedAt = options.generated_at ?? options.generatedAt ?? new Date().toISOString();
  const fetchImpl = options.fetchImpl ?? fetch;
  const requestJsonImpl = options.requestJsonImpl ?? requestJsonViaEdgeIp;
  const services = {};
  const blockers = [];

  for (const service of SERVICES) {
    const hostname = `${service.hostPrefix}.${domain}`;
    const dns = await resolveAWithDoh(hostname, fetchImpl);
    const serviceProbes = {};
    if (!dns.ok) blockers.push(`${service.kind} DNS A record missing`);
    for (const path of ['/livez', '/readyz']) {
      const url = `https://${hostname}${path}`;
      const probe = await requestJsonImpl(url, dns.ips, { service, path, hostname });
      assertPublicSafe(probe.body ?? {}, `${service.kind}${path}.body`);
      const validation = validateProbe(service, path, probe);
      blockers.push(...validation.blockers);
      serviceProbes[path.slice(1)] = {
        url,
        status_code: probe.status_code,
        ok: validation.ok,
        response_hash: probe.response_hash ?? null,
        bytes: probe.bytes ?? null,
        body: validation.summary,
        error: probe.error ?? null,
        blockers: validation.blockers,
      };
    }
    services[service.kind] = {
      service: service.service,
      hostname,
      dns: { hostname: dns.hostname, resolver: dns.resolver, status: dns.status, ok: dns.ok, a_record_count: dns.a_record_count },
      probes: serviceProbes,
    };
  }

  return {
    schema: EDGE_BACKEND_BOOTSTRAP_EVIDENCE_SCHEMA,
    generated_at: generatedAt,
    ok: blockers.length === 0,
    launch_ready: false,
    hosted_backend_live_ready: false,
    domain,
    service_count: SERVICES.length,
    required_ref_count: REQUIRED_REF_KEYS.length,
    services,
    blockers,
    claim_boundary: [...CLAIM_BOUNDARY],
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = { domain: 'enigmamemory.com', output: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--domain') out.domain = argv[++index];
    else if (arg === '--out') out.output = argv[++index];
    else if (arg === '--help') out.help = true;
    else throw new Error(`unknown argument ${arg}`);
  }
  return out;
}

function usage() {
  return 'Usage: node scripts/collect-edge-backend-bootstrap-evidence.mjs [--domain enigmamemory.com] [--out edge-backend-bootstrap-live.json]\n\nCollects public-safe relay/gateway edge bootstrap evidence. It sends no credentials, deploys nothing, and never certifies hosted production readiness.\n';
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  const evidence = await collectEdgeBackendBootstrapEvidence({ domain: args.domain });
  if (args.output) await writeFile(resolve(args.output), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ ok: evidence.ok, schema: evidence.schema, launch_ready: evidence.launch_ready, hosted_backend_live_ready: evidence.hosted_backend_live_ready, service_count: evidence.service_count, blocker_count: evidence.blockers.length, out: args.output ? '<edge-backend-bootstrap-evidence-output>' : null }, null, 2)}\n`);
  if (!evidence.ok) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${error?.message ?? String(error)}\n`);
    process.exitCode = 1;
  });
}
