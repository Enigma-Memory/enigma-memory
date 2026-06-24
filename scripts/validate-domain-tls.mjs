#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DOMAIN_TLS_EVIDENCE_SCHEMA = 'enigma.domain_tls_evidence.v1';
export const DOMAIN_TLS_RESULT_SCHEMA = 'enigma.domain_tls_result.v1';

const ACCEPTED_STATUS = new Set(['active', 'verified', 'observed', 'go']);
const REQUIRED_SECURITY_HEADERS = Object.freeze([
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
  'permissions-policy',
  'content-security-policy',
]);
const SECRET_VALUE_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@|raw memory|private prompt|full transcript|decrypted capsule|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16})/iu;
const FORBIDDEN_KEY_RE = /(?:password|passwd|pwd|token|api[_-]?key|private[_-]?key|secret|raw[_-]?memory|plaintext|plain[_-]?text|prompt|completion|transcript|provider[_-]?response|cookie|session)/iu;
const SAFE_FIELD_NAMES = new Set(['token_roi_claim', 'provider_invoice_savings_claim', 'credential_claim', 'security_headers']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isoLike(value) {
  return nonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

function blocker(message, path) {
  return { message, path };
}

function assertNoSensitivePayload(value, path = 'domain_tls') {
  if (typeof value === 'string') {
    if (!/\.(claim_boundary\[\d+\]|blockers\[\d+\]\.message)$/.test(path) && SECRET_VALUE_RE.test(value)) throw new Error(`${path} contains secret-looking data`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSensitivePayload(item, `${path}[${index}]`));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (FORBIDDEN_KEY_RE.test(key) && !SAFE_FIELD_NAMES.has(key) && !/^result\.blockers\[\d+\]\.message$/.test(childPath)) throw new Error(`${childPath} is not allowed in domain/TLS evidence`);
    assertNoSensitivePayload(child, childPath);
  }
}

function normalizeDomain(value) {
  if (!nonEmptyString(value)) return null;
  const domain = value.trim().toLowerCase().replace(/\.$/, '');
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain) ? domain : null;
}

function httpsUrl(value, path, blockers) {
  if (!nonEmptyString(value)) {
    blockers.push(blocker(`${path} is required`, path));
    return null;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') blockers.push(blocker(`${path} must use https`, path));
    if (url.username || url.password) blockers.push(blocker(`${path} must not include credentials`, path));
    return url;
  } catch {
    blockers.push(blocker(`${path} must be a valid URL`, path));
    return null;
  }
}

function statusOk(value) {
  return typeof value === 'string' && ACCEPTED_STATUS.has(value.trim().toLowerCase());
}

function validateDns(dns, domain, blockers) {
  if (!isPlainObject(dns)) {
    blockers.push(blocker('dns object is required', 'dns'));
    return { records: 0 };
  }
  for (const field of ['provider', 'zone_ref', 'propagation_ref', 'status']) {
    if (!nonEmptyString(dns[field])) blockers.push(blocker(`dns.${field} is required`, `dns.${field}`));
  }
  if (!statusOk(dns.status)) blockers.push(blocker('dns.status must be active/verified/observed/go', 'dns.status'));
  if (!Array.isArray(dns.records) || dns.records.length === 0) {
    blockers.push(blocker('dns.records must be non-empty array', 'dns.records'));
    return { records: 0 };
  }
  let coveredApexOrWww = false;
  dns.records.forEach((record, index) => {
    const path = `dns.records[${index}]`;
    if (!isPlainObject(record)) {
      blockers.push(blocker('dns record must be object', path));
      return;
    }
    for (const field of ['type', 'name', 'value_ref', 'status']) {
      if (!nonEmptyString(record[field])) blockers.push(blocker(`${path}.${field} is required`, `${path}.${field}`));
    }
    const type = String(record.type ?? '').toUpperCase();
    if (!['A', 'AAAA', 'CNAME', 'ALIAS'].includes(type)) blockers.push(blocker(`${path}.type must be A/AAAA/CNAME/ALIAS`, `${path}.type`));
    if (!statusOk(record.status)) blockers.push(blocker(`${path}.status must be active/verified/observed/go`, `${path}.status`));
    const name = normalizeDomain(record.name);
    if (domain && name && (name === domain || name === `www.${domain}`)) coveredApexOrWww = true;
  });
  if (!coveredApexOrWww) blockers.push(blocker('dns.records must cover apex domain or www domain', 'dns.records'));
  return { records: dns.records.length };
}

function validateTls(tls, domain, blockers, nowMs) {
  if (!isPlainObject(tls)) {
    blockers.push(blocker('tls object is required', 'tls'));
    return false;
  }
  for (const field of ['issuer', 'certificate_ref', 'expires_at', 'renewal_ref', 'alert_ref', 'status']) {
    if (!nonEmptyString(tls[field])) blockers.push(blocker(`tls.${field} is required`, `tls.${field}`));
  }
  if (!statusOk(tls.status)) blockers.push(blocker('tls.status must be active/verified/observed/go', 'tls.status'));
  if (!isoLike(tls.expires_at)) blockers.push(blocker('tls.expires_at must be ISO time', 'tls.expires_at'));
  else if (Date.parse(tls.expires_at) <= nowMs) blockers.push(blocker('tls.expires_at must be in the future', 'tls.expires_at'));
  const names = Array.isArray(tls.subject_alt_names) ? tls.subject_alt_names.map(normalizeDomain).filter(Boolean) : [];
  if (domain && names.length > 0 && !names.includes(domain) && !names.includes(`www.${domain}`)) blockers.push(blocker('tls.subject_alt_names must include apex or www domain', 'tls.subject_alt_names'));
  return true;
}

function validateEndpoint(endpoint, domain, blockers) {
  if (!isPlainObject(endpoint)) {
    blockers.push(blocker('endpoint object is required', 'endpoint'));
    return false;
  }
  const url = httpsUrl(endpoint.url, 'endpoint.url', blockers);
  if (url && domain && url.hostname.toLowerCase() !== domain && url.hostname.toLowerCase() !== `www.${domain}`) blockers.push(blocker('endpoint.url host must match domain or www domain', 'endpoint.url'));
  if (!Number.isSafeInteger(endpoint.status_code) || endpoint.status_code < 200 || endpoint.status_code >= 400) blockers.push(blocker('endpoint.status_code must be 2xx/3xx integer', 'endpoint.status_code'));
  if (!nonEmptyString(endpoint.content_type) || !/html|text\/plain|application\/json/i.test(endpoint.content_type)) blockers.push(blocker('endpoint.content_type must be html/text/json', 'endpoint.content_type'));
  if (!isoLike(endpoint.observed_at)) blockers.push(blocker('endpoint.observed_at must be ISO time', 'endpoint.observed_at'));
  if (!nonEmptyString(endpoint.public_site_security_ref)) blockers.push(blocker('endpoint.public_site_security_ref is required', 'endpoint.public_site_security_ref'));
  const headers = endpoint.security_headers;
  if (!isPlainObject(headers)) blockers.push(blocker('endpoint.security_headers object is required', 'endpoint.security_headers'));
  else {
    const lower = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]));
    for (const header of REQUIRED_SECURITY_HEADERS) {
      if (!lower.has(header)) blockers.push(blocker(`endpoint.security_headers missing ${header}`, 'endpoint.security_headers'));
    }
    if (lower.get('x-content-type-options') && lower.get('x-content-type-options') !== 'nosniff') blockers.push(blocker('x-content-type-options must be nosniff', 'endpoint.security_headers.x-content-type-options'));
    if (lower.get('x-frame-options') && !['DENY', 'SAMEORIGIN'].includes(lower.get('x-frame-options'))) blockers.push(blocker('x-frame-options must be DENY or SAMEORIGIN', 'endpoint.security_headers.x-frame-options'));
  }
  return true;
}

function validateClaimBoundary(boundary, blockers) {
  if (!isPlainObject(boundary)) {
    blockers.push(blocker('claim_boundary object is required', 'claim_boundary'));
    return;
  }
  for (const field of ['public_endpoint_only', 'backend_readiness_claim', 'credential_claim', 'token_roi_claim', 'provider_invoice_savings_claim']) {
    if (typeof boundary[field] !== 'boolean') blockers.push(blocker(`claim_boundary.${field} must be boolean`, `claim_boundary.${field}`));
  }
  if (boundary.public_endpoint_only !== true) blockers.push(blocker('claim_boundary.public_endpoint_only must be true', 'claim_boundary.public_endpoint_only'));
  for (const field of ['backend_readiness_claim', 'credential_claim', 'token_roi_claim', 'provider_invoice_savings_claim']) {
    if (boundary[field] !== false) blockers.push(blocker(`claim_boundary.${field} must be false`, `claim_boundary.${field}`));
  }
}

export function validateDomainTlsEvidence(evidence, options = {}) {
  if (!isPlainObject(evidence)) throw new Error('domain/TLS evidence must be an object');
  assertNoSensitivePayload(evidence);
  const blockers = [];
  if (evidence.schema !== DOMAIN_TLS_EVIDENCE_SCHEMA) blockers.push(blocker('schema mismatch', 'schema'));
  const domain = normalizeDomain(evidence.domain);
  if (!domain) blockers.push(blocker('domain must be a valid domain name', 'domain'));
  const publicUrl = httpsUrl(evidence.public_url ?? evidence.url, 'public_url', blockers);
  if (publicUrl && domain && publicUrl.hostname.toLowerCase() !== domain && publicUrl.hostname.toLowerCase() !== `www.${domain}`) blockers.push(blocker('public_url host must match domain or www domain', 'public_url'));
  const dns = validateDns(evidence.dns, domain, blockers);
  validateTls(evidence.tls, domain, blockers, Date.parse(options.now ?? options.generated_at ?? new Date().toISOString()));
  validateEndpoint(evidence.endpoint, domain, blockers);
  validateClaimBoundary(evidence.claim_boundary, blockers);
  const result = {
    schema: DOMAIN_TLS_RESULT_SCHEMA,
    generated_at: options.generated_at ?? options.generatedAt ?? new Date(0).toISOString(),
    ok: blockers.length === 0,
    status: blockers.length === 0 ? 'accepted' : 'blocked',
    blockers,
    checked: {
      domain: domain ?? null,
      public_url: publicUrl?.href ?? null,
      dns_records: dns.records,
      tls_expires_at: evidence.tls?.expires_at ?? null,
      endpoint_status_code: evidence.endpoint?.status_code ?? null,
      required_security_headers: REQUIRED_SECURITY_HEADERS.length,
    },
    claim_boundary: [
      'Domain/TLS validation checks declared public endpoint evidence only; it does not register domains, mutate DNS, deploy Cloudflare Pages, or prove backend readiness.',
      'A pass result is public-site reachability evidence and does not prove relay/gateway durable storage, KMS, SIEM, backup, operator acceptance, or hosted/BYOC readiness.',
      'Credentials, API tokens, raw memory, prompts, transcripts, provider responses, and personal contact data must remain outside domain/TLS artifacts.',
    ],
  };
  assertNoSensitivePayload(result, 'result');
  return result;
}

function parseArgs(argv = process.argv.slice(2)) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq !== -1) flags.set(arg.slice(2, eq), arg.slice(eq + 1));
    else if (!argv[index + 1] || argv[index + 1].startsWith('--')) flags.set(arg.slice(2), true);
    else {
      flags.set(arg.slice(2), argv[index + 1]);
      index += 1;
    }
  }
  return flags;
}

function getFlag(flags, names) {
  for (const name of names) if (flags.has(name)) return flags.get(name);
  return undefined;
}

async function main() {
  const flags = parseArgs();
  const evidencePath = getFlag(flags, ['evidence', 'domain', 'in']);
  if (typeof evidencePath !== 'string' || evidencePath.trim() === '') throw new Error('--evidence <path> is required');
  const evidence = JSON.parse(await readFile(resolve(evidencePath), 'utf8'));
  const result = validateDomainTlsEvidence(evidence, { generated_at: new Date().toISOString() });
  const out = getFlag(flags, ['out']);
  const text = `${JSON.stringify(result, null, 2)}\n`;
  if (out && out !== true) {
    const outPath = resolve(String(out));
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, text, 'utf8');
  }
  process.stdout.write(text);
  process.exitCode = result.ok ? 0 : 1;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.name ?? 'Error'}: ${error.message}\n`);
    process.exitCode = 1;
  });
}
