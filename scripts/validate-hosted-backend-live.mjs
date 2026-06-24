#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HOSTED_BACKEND_LIVE_EVIDENCE_SCHEMA = 'enigma.hosted_backend_live_evidence.v1';
export const HOSTED_BACKEND_LIVE_RESULT_SCHEMA = 'enigma.hosted_backend_live_result.v1';

export const REQUIRED_REF_KEYS = Object.freeze([
  'backend_host',
  'dns_tls',
  'durable_storage',
  'kms_or_secret_custody',
  'backup_restore',
  'monitoring',
  'siem_or_log_sink',
  'operator_acceptance',
  'runtime_auth',
  'admin_auth',
  'data_plane_auth',
  'network_access_policy',
  'kms_custody',
  'tenant_policy_approval',
  'usage_metering',
  'service_settlement',
  'monitoring_alerting',
  'public_site_security',
  'security_threat_model',
  'legal_compliance_approval',
  'support_sla',
  'incident_drill',
  'backup_restore_drill',
  'relay_deployment',
  'gateway_deployment',
]);

const REQUIRED_PROBES = Object.freeze(['relay_livez', 'relay_readyz', 'gateway_livez', 'gateway_readyz']);
const ACCEPTED_STATUSES = new Set(['observed', 'verified', 'go', 'accepted']);
const SECRET_VALUE_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@|raw memory|private prompt|full transcript|decrypted capsule|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16})/iu;
const FORBIDDEN_KEY_RE = /(?:password|passwd|pwd|token|api[_-]?key|private[_-]?key|secret|raw[_-]?memory|plaintext|plain[_-]?text|prompt|completion|transcript|embedding|provider[_-]?response|cookie|session)/iu;
const TEMPLATE_PLACEHOLDER_RE = /<[^<>\r\n]+>/u;
const SAFE_FIELD_NAMES = new Set(['cloudflare_token_policy_ref', 'token_policy_ref', 'token_value_printed', 'kms_or_secret_custody', 'token_roi_claim', 'cloudflare_credentials_claim', 'provider_deletion_claim']);

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

function assertNoSensitivePayload(value, path = 'hosted_backend_live') {
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
    if (FORBIDDEN_KEY_RE.test(key) && !SAFE_FIELD_NAMES.has(key) && !/^result\.blockers\[\d+\]\.message$/.test(childPath)) throw new Error(`${childPath} is not allowed in hosted backend live evidence`);
    assertNoSensitivePayload(child, childPath);
  }
}

function collectTemplatePlaceholderBlockers(value, blockers, path = 'hosted_backend_live') {
  if (typeof value === 'string') {
    if (TEMPLATE_PLACEHOLDER_RE.test(value)) blockers.push(blocker(`${path} must not contain unresolved template placeholders`, path));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectTemplatePlaceholderBlockers(item, blockers, `${path}[${index}]`));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) collectTemplatePlaceholderBlockers(child, blockers, `${path}.${key}`);
}

function normalizeDomain(value) {
  if (!nonEmptyString(value)) return null;
  const domain = value.trim().toLowerCase().replace(/\.$/, '');
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain) ? domain : null;
}

function isPrivateHost(hostname) {
  const host = String(hostname ?? '').toLowerCase();
  return host === 'localhost'
    || host.endsWith('.localhost')
    || host === '127.0.0.1'
    || host === '0.0.0.0'
    || host === '::1'
    || /^10\./.test(host)
    || /^192\.168\./.test(host)
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
}

function httpsHealthUrl(value, path, blockers) {
  if (!nonEmptyString(value)) {
    blockers.push(blocker(`${path} is required`, path));
    return null;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') blockers.push(blocker(`${path} must use https`, path));
    if (url.username || url.password) blockers.push(blocker(`${path} must not include credentials`, path));
    if (url.search || url.hash) blockers.push(blocker(`${path} must not include query strings or fragments`, path));
    if (isPrivateHost(url.hostname)) blockers.push(blocker(`${path} must not target localhost or private network host`, path));
    if (url.pathname !== '/livez' && url.pathname !== '/readyz') blockers.push(blocker(`${path} must use /livez or /readyz`, path));
    return url;
  } catch {
    blockers.push(blocker(`${path} must be a valid URL`, path));
    return null;
  }
}

function statusAccepted(value) {
  return typeof value === 'string' && ACCEPTED_STATUSES.has(value.trim().toLowerCase());
}

function validateRefs(refs, blockers) {
  if (!isPlainObject(refs)) {
    blockers.push(blocker('refs object is required', 'refs'));
    return { present: 0, missing: REQUIRED_REF_KEYS.length };
  }
  let present = 0;
  for (const key of REQUIRED_REF_KEYS) {
    if (!nonEmptyString(refs[key])) blockers.push(blocker(`refs.${key} is required`, `refs.${key}`));
    else present += 1;
  }
  return { present, missing: REQUIRED_REF_KEYS.length - present };
}

function validateEnvironment(environment, blockers) {
  if (!isPlainObject(environment)) {
    blockers.push(blocker('environment object is required', 'environment'));
    return { domain: null };
  }
  const domain = normalizeDomain(environment.domain);
  if (!domain) blockers.push(blocker('environment.domain must be a valid domain', 'environment.domain'));
  for (const field of ['environment_id', 'cloud_provider', 'region', 'owner', 'status']) {
    if (!nonEmptyString(environment[field])) blockers.push(blocker(`environment.${field} is required`, `environment.${field}`));
  }
  if (!statusAccepted(environment.status)) blockers.push(blocker('environment.status must be observed/verified/go/accepted', 'environment.status'));
  return { domain };
}

function expectedServiceForProbe(expectedName) {
  return expectedName.startsWith('relay_') ? 'enigma-relay' : 'enigma-gateway';
}

function validateProbe(probe, expectedName, domain, blockers) {
  const path = `probes.${expectedName}`;
  if (!isPlainObject(probe)) {
    blockers.push(blocker(`${path} object is required`, path));
    return false;
  }
  const url = httpsHealthUrl(probe.url, `${path}.url`, blockers);
  if (url && domain) {
    const hostname = url.hostname.toLowerCase();
    if (hostname !== domain && !hostname.endsWith(`.${domain}`)) blockers.push(blocker(`${path}.url host must be the domain or a subdomain`, `${path}.url`));
    if (expectedName.endsWith('livez') && url.pathname !== '/livez') blockers.push(blocker(`${path}.url must end in /livez`, `${path}.url`));
    if (expectedName.endsWith('readyz') && url.pathname !== '/readyz') blockers.push(blocker(`${path}.url must end in /readyz`, `${path}.url`));
  }
  if (!Number.isSafeInteger(probe.status_code) || probe.status_code !== 200) blockers.push(blocker(`${path}.status_code must be 200`, `${path}.status_code`));
  if (!isPlainObject(probe.body)) blockers.push(blocker(`${path}.body object is required`, `${path}.body`));
  else {
    const expectedService = expectedServiceForProbe(expectedName);
    if (probe.body.hosted_probe_only === true || probe.body.pages_edge_probe_only === true) {
      blockers.push(blocker(`${path}.body must not be an edge-probe-only payload`, `${path}.body`));
    }
    if (probe.body.service !== expectedService) blockers.push(blocker(`${path}.body.service must be ${expectedService}`, `${path}.body.service`));
    if (probe.body.ok !== true) blockers.push(blocker(`${path}.body.ok must be true`, `${path}.body.ok`));
    if (expectedName.endsWith('readyz')) {
      if (Array.isArray(probe.body.missing_evidence_refs) && probe.body.missing_evidence_refs.length !== 0) blockers.push(blocker(`${path}.body.missing_evidence_refs must be empty`, `${path}.body.missing_evidence_refs`));
      if (Array.isArray(probe.body.checks) && probe.body.checks.some((check) => check?.ok !== true)) blockers.push(blocker(`${path}.body.checks must all be ok`, `${path}.body.checks`));
    }
  }
  if (!isoLike(probe.observed_at)) blockers.push(blocker(`${path}.observed_at must be ISO time`, `${path}.observed_at`));
  if (!nonEmptyString(probe.response_hash) || !/^sha256:[a-f0-9]{64}$/i.test(probe.response_hash)) blockers.push(blocker(`${path}.response_hash must be sha256:<64 hex>`, `${path}.response_hash`));
  return true;
}

function validateProbes(probes, domain, blockers) {
  if (!isPlainObject(probes)) {
    blockers.push(blocker('probes object is required', 'probes'));
    return { covered: 0 };
  }
  let covered = 0;
  for (const name of REQUIRED_PROBES) {
    if (validateProbe(probes[name], name, domain, blockers)) covered += 1;
  }
  return { covered };
}

function validateOperator(operatorAcceptance, blockers) {
  if (!isPlainObject(operatorAcceptance)) {
    blockers.push(blocker('operator_acceptance object is required', 'operator_acceptance'));
    return false;
  }
  if (operatorAcceptance.decision !== 'go') blockers.push(blocker('operator_acceptance.decision must be go', 'operator_acceptance.decision'));
  if (!nonEmptyString(operatorAcceptance.packet_ref)) blockers.push(blocker('operator_acceptance.packet_ref is required', 'operator_acceptance.packet_ref'));
  if (!isoLike(operatorAcceptance.approved_at)) blockers.push(blocker('operator_acceptance.approved_at must be ISO time', 'operator_acceptance.approved_at'));
  if (!nonEmptyString(operatorAcceptance.approved_by)) blockers.push(blocker('operator_acceptance.approved_by is required', 'operator_acceptance.approved_by'));
  return true;
}

function validateClaimBoundary(boundary, blockers) {
  if (!isPlainObject(boundary)) {
    blockers.push(blocker('claim_boundary object is required', 'claim_boundary'));
    return;
  }
  const required = ['hosted_backend_live', 'public_site_live', 'cloudflare_credentials_claim', 'token_roi_claim', 'provider_deletion_claim', 'model_forgetting_claim'];
  for (const field of required) if (typeof boundary[field] !== 'boolean') blockers.push(blocker(`claim_boundary.${field} must be boolean`, `claim_boundary.${field}`));
  if (boundary.hosted_backend_live !== true) blockers.push(blocker('claim_boundary.hosted_backend_live must be true', 'claim_boundary.hosted_backend_live'));
  for (const field of required.filter((item) => item !== 'hosted_backend_live')) {
    if (boundary[field] !== false) blockers.push(blocker(`claim_boundary.${field} must be false`, `claim_boundary.${field}`));
  }
}

export function validateHostedBackendLiveEvidence(evidence, options = {}) {
  if (!isPlainObject(evidence)) throw new Error('hosted backend live evidence must be an object');
  assertNoSensitivePayload(evidence);
  const blockers = [];
  collectTemplatePlaceholderBlockers(evidence, blockers);
  if (evidence.schema !== HOSTED_BACKEND_LIVE_EVIDENCE_SCHEMA) blockers.push(blocker('schema mismatch', 'schema'));
  if (!isoLike(evidence.observed_at)) blockers.push(blocker('observed_at must be ISO time', 'observed_at'));
  const env = validateEnvironment(evidence.environment, blockers);
  const refs = validateRefs(evidence.refs, blockers);
  const probes = validateProbes(evidence.probes, env.domain, blockers);
  validateOperator(evidence.operator_acceptance, blockers);
  validateClaimBoundary(evidence.claim_boundary, blockers);
  const result = {
    schema: HOSTED_BACKEND_LIVE_RESULT_SCHEMA,
    generated_at: options.generated_at ?? options.generatedAt ?? new Date(0).toISOString(),
    ok: blockers.length === 0,
    status: blockers.length === 0 ? 'accepted' : 'blocked',
    blockers,
    checked: {
      domain: env.domain,
      required_refs: REQUIRED_REF_KEYS.length,
      refs_present: refs.present,
      refs_missing: refs.missing,
      required_probes: REQUIRED_PROBES.length,
      probes_covered: probes.covered,
      operator_decision: evidence.operator_acceptance?.decision ?? null,
    },
    claim_boundary: [
      'Hosted backend live validation checks supplied evidence only; it does not deploy infrastructure, mutate Cloudflare, create DNS records, or generate credentials.',
      'A pass result requires public HTTPS /livez and /readyz probe evidence for relay and gateway plus all required production refs and operator acceptance go.',
      'Credentials, bearer tokens, API tokens, private memory payloads, prompts, transcripts, provider responses, and personal contact data must remain outside hosted backend live evidence.',
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
    if (eq !== -1) flags.set(arg.slice(2), arg.slice(eq + 1));
    else if (!argv[index + 1] || argv[index + 1].startsWith('--')) flags.set(arg.slice(2), true);
    else {
      flags.set(arg.slice(2), argv[index + 1]);
      index += 1;
    }
  }
  return flags;
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), 'utf8'));
}

async function runCli(argv = process.argv.slice(2)) {
  const flags = parseArgs(argv);
  if (flags.has('help') || !flags.has('evidence')) {
    const help = 'Usage: node scripts/validate-hosted-backend-live.mjs --evidence <hosted-backend-live.json> [--out <result.json>]\n';
    if (flags.has('help')) {
      process.stdout.write(help);
      return 0;
    }
    process.stderr.write(help);
    return 2;
  }
  const evidence = await readJson(flags.get('evidence'));
  const result = validateHostedBackendLiveEvidence(evidence, { generated_at: new Date().toISOString() });
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (flags.has('out')) {
    const outPath = resolve(flags.get('out'));
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, json, 'utf8');
  }
  process.stdout.write(json);
  return result.ok ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    process.exitCode = await runCli();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(`${JSON.stringify({ schema: HOSTED_BACKEND_LIVE_RESULT_SCHEMA, ok: false, status: 'error', error: { message } }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
