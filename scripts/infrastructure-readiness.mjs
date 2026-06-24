#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const INFRASTRUCTURE_READINESS_SCHEMA = 'enigma.infrastructure_readiness.v1';
export const INFRASTRUCTURE_READINESS_MANIFEST_SCHEMA = 'enigma.infrastructure_readiness_manifest.v1';

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';

const HELP_TEXT = `Usage: node scripts/infrastructure-readiness.mjs --manifest <path> [--live] [--cloudflare-live off|auto|required] [--allow-localhost]

Emits one JSON document describing Enigma infrastructure readiness.
Default contract-only mode performs no network checks and never claims hosted live readiness.

Options:
  --manifest <path>              Readiness manifest JSON.
  --live                         Run manifest-requested public/relay/gateway live checks using fetch.
  --cloudflare-live <mode>       off, auto, or required. Defaults to off.
  --allow-localhost              Permit localhost/private URLs in manifests and live checks.
  --help                         Emit JSON containing this help text.

Environment for optional Cloudflare observation:
  CLOUDFLARE_API_TOKEN           Used only for Cloudflare API endpoints; never printed.
  CLOUDFLARE_ACCOUNT_ID          Optional account id when manifest omits cloudflare.account_id.
`;

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

const SECRET_KEY_PATTERN = /(?:^(?:token|pat)$|authorization|bearer|cookie|credential|password|passwd|private[_-]?key|client[_-]?secret|secret|raw[_-]?memory|plaintext|plain[_-]?text|prompt|completion|transcript|provider[_-]?response|(?:api|access|auth|bearer|refresh|id|session|oauth|jwt|github|gitlab|cloudflare|cloudflare[_-]?api|cloudflare[_-]?access)[_-]?(?:key|token))/i;
const SAFE_SECRET_NAMED_KEYS = new Set(['kms_or_secret_custody']);
const SECRET_VALUE_PATTERNS = [
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/,
  /\b(?:sk|rk)-[A-Za-z0-9_-]{20,}\b/,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*\b/i,
  /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
];
const URL_CANDIDATE_PATTERN = /\b[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s"'<>]+/g;
const ALLOWED_REF_KEYS = new Set([
  'relay',
  'gateway',
  'relay_deployment',
  'relay_ref',
  'gateway_deployment',
  'gateway_ref',
  'backend_host',
  'dns_tls',
  'durable_storage',
  'kms',
  'kms_or_secret_custody',
  'siem_or_log_sink',
  'backup_restore',
  'monitoring',
  'runtime_auth',
  'admin_auth',
  'data_plane_auth',
  'siem',
  'backup',
  'operator_acceptance',
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
  'token_approval',
]);
const HOSTED_REQUIRED_REF_GROUPS = Object.freeze([
  ['backend_host'],
  ['dns_tls'],
  ['durable_storage'],
  ['kms_or_secret_custody', 'kms'],
  ['siem_or_log_sink', 'siem'],
  ['backup_restore', 'backup'],
  ['monitoring'],
  ['runtime_auth'],
  ['admin_auth'],
  ['data_plane_auth'],
  ['network_access_policy'],
  ['kms_custody'],
  ['tenant_policy_approval'],
  ['usage_metering'],
  ['service_settlement'],
  ['monitoring_alerting'],
  ['public_site_security'],
  ['security_threat_model'],
  ['legal_compliance_approval'],
  ['support_sla'],
  ['incident_drill'],
  ['backup_restore_drill'],
]);


function safeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function requireObject(name, value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new UsageError(`${name} must be an object`);
  }
  return value;
}

function asOptionalObject(name, value) {
  if (value === undefined || value === null) return null;
  return requireObject(name, value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizedString(value) {
  return nonEmptyString(value) ? value.trim() : null;
}

function stringArray(value, name, { defaultValue = [] } = {}) {
  if (value === undefined || value === null) return defaultValue;
  if (!Array.isArray(value)) throw new UsageError(`${name} must be an array of strings`);
  const result = [];
  for (const [index, item] of value.entries()) {
    if (!nonEmptyString(item)) throw new UsageError(`${name}[${index}] must be a non-empty string`);
    result.push(item.trim());
  }
  return result;
}

function boolValue(value, name, defaultValue = false) {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value !== 'boolean') throw new UsageError(`${name} must be a boolean`);
  return value;
}

function intValue(value, name, defaultValue = null) {
  if (value === undefined || value === null) return defaultValue;
  if (!Number.isInteger(value)) throw new UsageError(`${name} must be an integer`);
  return value;
}

function looksLikeSecretValue(value) {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (text.length === 0) return false;
  return SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(text));
}

function looksLikeCredentialBearingUrl(value) {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (text.length === 0) return false;
  URL_CANDIDATE_PATTERN.lastIndex = 0;
  for (let match = URL_CANDIDATE_PATTERN.exec(text); match !== null; match = URL_CANDIDATE_PATTERN.exec(text)) {
    try {
      const parsed = new URL(match[0]);
      if (parsed.username !== '' || parsed.password !== '') return true;
    } catch {
      return true;
    }
  }
  return false;
}

export function assertNoSecretMaterial(value, { path = '$' } = {}) {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      assertNoSecretMaterial(item, { path: `${path}[${index}]` });
    }
    return true;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      const childPath = `${path}.${key}`;
      if (SECRET_KEY_PATTERN.test(key) && !SAFE_SECRET_NAMED_KEYS.has(key)) {
        throw new UsageError(`secret-looking manifest key rejected at ${childPath}`);
      }
      assertNoSecretMaterial(item, { path: childPath });
    }
    return true;
  }
  if (looksLikeCredentialBearingUrl(value)) {
    throw new UsageError(`secret-looking URL credentials rejected at ${path}`);
  }
  if (looksLikeSecretValue(value)) {
    throw new UsageError(`secret-looking manifest value rejected at ${path}`);
  }
  return true;
}

function parseUrlField(value, name, { allowLocalhost }) {
  if (value === undefined || value === null) return null;
  if (!nonEmptyString(value)) throw new UsageError(`${name} must be a non-empty URL string`);
  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new UsageError(`${name} must be a valid URL`);
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw new UsageError(`${name} must not include URL userinfo`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new UsageError(`${name} must use http or https`);
  }
  const localOrPrivate = isLocalOrPrivateHostname(parsed.hostname);
  if (localOrPrivate && !allowLocalhost) {
    throw new UsageError(`${name} points to localhost or private infrastructure; pass --allow-localhost only for local demos`);
  }
  if (parsed.protocol !== 'https:' && !(allowLocalhost && localOrPrivate)) {
    throw new UsageError(`${name} must use https unless --allow-localhost is explicitly permitting a localhost/private demo URL`);
  }
  return parsed.href;
}

function isLocalOrPrivateHostname(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host === '::1' || host === '::' || host === '0.0.0.0') return true;
  if (host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (/^(?:fc|fd)[0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host)) return true;
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) return true;
  const [a, b] = octets;
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
}

function urlHostname(value) {
  if (!nonEmptyString(value)) return null;
  try {
    return new URL(value).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  } catch {
    return null;
  }
}

function isLocalOrPrivateUrl(value) {
  const hostname = urlHostname(value);
  return hostname !== null && isLocalOrPrivateHostname(hostname);
}

function assertPublicProbePath(value, name) {
  const parsed = new URL(value);
  if (isLocalOrPrivateHostname(parsed.hostname)) return;
  if (parsed.search || parsed.hash) {
    throw new UsageError(`${name} public live check URL must not include query strings or fragments`);
  }
  if (parsed.pathname !== '/readyz' && parsed.pathname !== '/livez') {
    throw new UsageError(`${name} public live check URL must use /readyz or /livez`);
  }
}

function normalizeEndpoint(root, name, options) {
  const value = asOptionalObject(name, root);
  if (value === null) return null;
  const url = parseUrlField(value.url ?? value.ready_url ?? value.health_url ?? value.live_url, `${name}.url`, options);
  const readyUrl = parseUrlField(value.ready_url, `${name}.ready_url`, options);
  const healthUrl = parseUrlField(value.health_url, `${name}.health_url`, options);
  const liveUrl = parseUrlField(value.live_url, `${name}.live_url`, options);
  const fetchUrl = liveUrl ?? readyUrl ?? healthUrl ?? url;
  const expectedStatus = intValue(value.expected_status, `${name}.expected_status`, 200);
  if (expectedStatus < 100 || expectedStatus > 599) throw new UsageError(`${name}.expected_status must be an HTTP status code`);
  if ((name === 'relay' || name === 'gateway') && fetchUrl !== null) assertPublicProbePath(fetchUrl, name);
  return {
    url,
    ready_url: readyUrl,
    health_url: healthUrl,
    live_url: liveUrl,
    fetch_url: fetchUrl,
    expected_status: expectedStatus,
    expected_text: stringArray(value.expected_text, `${name}.expected_text`),
    required: boolValue(value.required, `${name}.required`, false),
    ref: normalizedString(value.ref ?? value.reference ?? value.deployment_ref),
    unauthenticated_local_demo: boolValue(value.unauthenticated_local_demo, `${name}.unauthenticated_local_demo`, false),
    internal: boolValue(value.internal, `${name}.internal`, false),
  };
}

function normalizeGithub(root, options) {
  const value = asOptionalObject('github', root);
  if (value === null) return null;
  const repository = normalizedString(value.repository ?? value.repo ?? value.repository_full_name);
  const url = parseUrlField(value.url ?? value.repository_url, 'github.url', options);
  if (repository !== null && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new UsageError('github.repository must use owner/name form');
  }
  return {
    repository,
    url,
    ref: normalizedString(value.ref ?? value.commit ?? value.release_ref),
    pages_branch: normalizedString(value.pages_branch),
    workflow_ref: normalizedString(value.workflow_ref),
  };
}

function normalizeCloudflare(root, options) {
  const value = asOptionalObject('cloudflare', root);
  if (value === null) return null;
  return {
    account_id: normalizedString(value.account_id),
    project_name: normalizedString(value.project_name ?? value.pages_project ?? value.pages_project_name),
    pages_url: parseUrlField(value.pages_url ?? value.project_url, 'cloudflare.pages_url', options),
    custom_domains: stringArray(value.custom_domains, 'cloudflare.custom_domains'),
    ref: normalizedString(value.ref ?? value.deployment_ref),
  };
}

function normalizeOperatorAcceptance(root) {
  const value = asOptionalObject('operator_acceptance', root);
  if (value === null) return { decision: 'pending', ref: null, owner: null };
  const rawDecision = normalizedString(value.decision ?? value.status) ?? 'pending';
  const decision = rawDecision === 'no_go' ? 'no-go' : rawDecision;
  if (!['go', 'no-go', 'pending'].includes(decision)) {
    throw new UsageError('operator_acceptance.decision must be go, no-go, or pending');
  }
  return {
    decision,
    ref: normalizedString(value.ref ?? value.packet_ref ?? value.evidence_ref),
    owner: normalizedString(value.owner),
  };
}

function normalizeRefs(value) {
  if (value === undefined || value === null) return {};
  const refs = requireObject('refs', value);
  const result = {};
  for (const [key, item] of Object.entries(refs)) {
    if (!ALLOWED_REF_KEYS.has(key)) throw new UsageError(`refs.${key} is not supported by the readiness manifest schema`);
    if (item === undefined || item === null) continue;
    if (!nonEmptyString(item)) throw new UsageError(`refs.${key} must be a non-empty string`);
    const ref = item.trim();
    assertNoSecretMaterial(ref, { path: `refs.${key}` });
    result[key] = ref;
  }
  return result;
}

function normalizeClaimBoundary(value) {
  if (value === undefined || value === null) throw new UsageError('claim_boundary must be a non-empty string or array of strings');
  if (Array.isArray(value)) {
    const items = stringArray(value, 'claim_boundary');
    if (items.length === 0) throw new UsageError('claim_boundary must not be empty');
    return items;
  }
  if (!nonEmptyString(value)) throw new UsageError('claim_boundary must be a non-empty string or array of strings');
  return [value.trim()];
}

export function validateInfrastructureReadinessManifest(value, { allowLocalhost = false } = {}) {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  assertNoSecretMaterial(parsed);
  const root = requireObject('manifest', parsed);
  if (root.schema !== INFRASTRUCTURE_READINESS_MANIFEST_SCHEMA) {
    throw new UsageError(`manifest.schema must be ${INFRASTRUCTURE_READINESS_MANIFEST_SCHEMA}`);
  }
  const options = { allowLocalhost };
  const externalBlockers = stringArray(root.external_blockers, 'external_blockers');
  const cloudflareSource = root.cloudflare ?? root.cloudflare_pages;
  return {
    schema: INFRASTRUCTURE_READINESS_MANIFEST_SCHEMA,
    name: normalizedString(root.name),
    public_site: normalizeEndpoint(root.public_site, 'public_site', options),
    github: normalizeGithub(root.github, options),
    cloudflare: normalizeCloudflare(cloudflareSource, options),
    relay: normalizeEndpoint(root.relay, 'relay', options),
    gateway: normalizeEndpoint(root.gateway, 'gateway', options),
    refs: normalizeRefs(root.refs),
    operator_acceptance: normalizeOperatorAcceptance(root.operator_acceptance),
    external_blockers: externalBlockers,
    claim_boundary: normalizeClaimBoundary(root.claim_boundary),
  };
}

export function parseInfrastructureReadinessArgs(argv = []) {
  const command = {
    manifestPath: null,
    live: false,
    cloudflareLive: 'off',
    allowLocalhost: false,
    help: false,
    liveChecks: null,
    operatorDecision: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      command.help = true;
      continue;
    }
    if (arg === '--live') {
      command.live = true;
      continue;
    }
    if (arg === '--mode') {
      const value = argv[index + 1];
      if (value === 'hosted-live') command.live = true;
      else if (value === 'contract-only') command.live = false;
      else throw new UsageError('--mode must be contract-only or hosted-live');
      index += 1;
      continue;
    }
    if (arg === '--live-checks') {
      const value = argv[index + 1];
      if (!nonEmptyString(value)) throw new UsageError('--live-checks requires a comma-separated list');
      command.liveChecks = value.split(',').map((item) => item.trim()).filter(Boolean);
      index += 1;
      continue;
    }
    if (arg === '--operator-decision') {
      const value = argv[index + 1];
      if (!['go', 'no-go', 'no_go', 'pending'].includes(value)) throw new UsageError('--operator-decision must be go, no-go, no_go, or pending');
      command.operatorDecision = value === 'no_go' ? 'no-go' : value;
      index += 1;
      continue;
    }
    if (arg === '--allow-localhost') {
      command.allowLocalhost = true;
      continue;
    }
    if (arg === '--manifest') {
      const value = argv[index + 1];
      if (!nonEmptyString(value)) throw new UsageError('--manifest requires a path');
      command.manifestPath = value;
      index += 1;
      continue;
    }
    if (arg === '--cloudflare-live') {
      const value = argv[index + 1];
      if (!['off', 'auto', 'required'].includes(value)) throw new UsageError('--cloudflare-live must be off, auto, or required');
      command.cloudflareLive = value;
      index += 1;
      continue;
    }
    throw new UsageError(`unknown option: ${arg}`);
  }
  if (!command.help && command.manifestPath === null) throw new UsageError('--manifest is required');
  return command;
}

function hasRef(value) {
  return nonEmptyString(value);
}

function endpointRef(endpoint, refs, endpointName) {
  return endpoint?.ref ?? refs[endpointName] ?? refs[`${endpointName}_deployment`] ?? refs[`${endpointName}_ref`] ?? null;
}

function anyRef(refs, names) {
  for (const name of names) {
    if (hasRef(refs[name])) return true;
  }
  return false;
}

function contractFindings(manifest) {
  const missing = [];
  if (!hasRef(manifest.public_site?.url)) missing.push('public_site.url');
  if (manifest.cloudflare === null || (!hasRef(manifest.cloudflare.project_name) && !hasRef(manifest.cloudflare.pages_url))) {
    missing.push('cloudflare.project_name_or_pages_url');
  }
  if (manifest.claim_boundary.length === 0) missing.push('claim_boundary');
  return missing;
}

function hostedFindings(manifest) {
  const missing = [];
  if (!hasRef(endpointRef(manifest.relay, manifest.refs, 'relay'))) missing.push('relay.ref');
  if (!hasRef(endpointRef(manifest.gateway, manifest.refs, 'gateway'))) missing.push('gateway.ref');
  const requiredRefGroups = HOSTED_REQUIRED_REF_GROUPS;
  for (const names of requiredRefGroups) {
    if (!anyRef(manifest.refs, names)) missing.push(`refs.${names[0]}`);
  }
  if (!hasRef(manifest.operator_acceptance.ref ?? manifest.refs.operator_acceptance)) missing.push('operator_acceptance.ref');
  return missing;
}

function addCheck(checks, name, ok, details = {}) {
  const check = { name, ok: ok === true, ...details };
  checks.push(check);
  return check.ok;
}

function buildFetchError(error) {
  return error?.message ?? String(error);
}

async function fetchPublicText(url, { fetchImpl }) {
  if (typeof fetchImpl !== 'function') throw new UsageError('fetch implementation is required for --live');
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: { accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1' },
    redirect: 'follow',
  });
  const text = typeof response.text === 'function' ? await response.text() : '';
  return { status: response.status, ok: response.ok === true || (response.status >= 200 && response.status < 400), text };
}

async function fetchJsonEndpoint(url, { fetchImpl }) {
  if (typeof fetchImpl !== 'function') throw new UsageError('fetch implementation is required for --live');
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: { accept: 'application/json' },
    redirect: 'manual',
  });
  const statusCode = Number(response.status ?? 0);
  const responseUrl = typeof response.url === 'string' && response.url.length > 0 ? response.url : url;
  if (response.redirected === true || responseUrl !== url || (statusCode >= 300 && statusCode <= 399)) {
    throw new UsageError(`public JSON endpoint ${url} must not redirect`);
  }
  let payload = null;
  const contentType = typeof response.headers?.get === 'function' ? response.headers.get('content-type') ?? '' : '';
  if (typeof response.json === 'function' && (contentType.includes('json') || statusCode !== 204)) {
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
  }
  return { status: statusCode, ok: response.ok === true || (statusCode >= 200 && statusCode < 300), payload };
}

function responseHasRefs(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return false;
  if (hasRef(payload.ref) || hasRef(payload.version) || hasRef(payload.build_ref) || hasRef(payload.deployment_ref) || hasRef(payload.release_ref) || hasRef(payload.provenance_ref)) return true;
  const refs = payload.refs;
  if (refs !== null && typeof refs === 'object' && !Array.isArray(refs)) {
    return Object.values(refs).some((value) => hasRef(value));
  }
  return false;
}

function refsCoverHostedDependencies(refs) {
  if (refs === null || typeof refs !== 'object' || Array.isArray(refs)) return false;
  return HOSTED_REQUIRED_REF_GROUPS.every((group) => group.some((key) => hasRef(refs[key])));
}

function checksAllOk(payload) {
  return Array.isArray(payload?.checks) && payload.checks.length > 0 && payload.checks.every((check) => check?.ok === true);
}

function hostedReadyShapeOk(payload, expectedService) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return false;
  assertNoSecretMaterial(payload, { path: `${expectedService}.readyz` });
  if (payload.unauthenticated_local_demo === true || payload.internal === true) return false;
  if (payload.service !== expectedService) return false;
  if (payload.ok !== true || payload.status !== 'ready') return false;
  if (!checksAllOk(payload)) return false;
  if (!Array.isArray(payload.missing_evidence_refs) || payload.missing_evidence_refs.length !== 0) return false;
  return refsCoverHostedDependencies(payload.evidence_refs);
}

function relayShapeOk(payload) {
  return hostedReadyShapeOk(payload, 'enigma-relay');
}

function gatewayShapeOk(payload) {
  return hostedReadyShapeOk(payload, 'enigma-gateway');
}

function cloudflareHostValue(value) {
  if (!nonEmptyString(value)) return null;
  const hostname = value.includes('://') ? urlHostname(value) : value.trim().toLowerCase();
  return hostname === null || hostname === '' ? null : hostname.replace(/^\[|\]$/g, '');
}

function collectCloudflareProjectHosts(projectPayload) {
  const result = projectPayload?.result;
  const hosts = new Set();
  const add = (value) => {
    const hostname = cloudflareHostValue(value);
    if (hostname !== null) hosts.add(hostname);
  };
  add(result?.subdomain);
  for (const domain of Array.isArray(result?.domains) ? result.domains : []) add(domain);
  for (const deployment of [result?.latest_deployment, result?.canonical_deployment]) {
    add(deployment?.url);
    for (const alias of Array.isArray(deployment?.aliases) ? deployment.aliases : []) add(alias);
  }
  return hosts;
}

function cloudflareProjectMatchesDeclared(manifest, projectPayload) {
  const hosts = collectCloudflareProjectHosts(projectPayload);
  const expectedPagesHost = urlHostname(manifest.cloudflare?.pages_url);
  const expectedDomains = manifest.cloudflare?.custom_domains ?? [];
  const pagesUrlOk = expectedPagesHost === null || hosts.has(expectedPagesHost);
  const domainsOk = expectedDomains.every((domain) => {
    const hostname = cloudflareHostValue(domain);
    return hostname !== null && hosts.has(hostname);
  });
  return { pagesUrlOk, domainsOk, host_count: hosts.size };
}

async function cloudflareJson(fetchImpl, path, headers) {
  const response = await fetchImpl(`${CLOUDFLARE_API_BASE}${path}`, { method: 'GET', headers });
  let payload = null;
  try {
    payload = typeof response.json === 'function' ? await response.json() : null;
  } catch {
    payload = null;
  }
  const ok = (response.ok === true || (response.status >= 200 && response.status < 300)) && payload?.success !== false;
  return { response, payload, ok };
}

async function observeCloudflare(manifest, { env, fetchImpl, mode }) {
  if (mode === 'off') return { observed: false, required: false, ok: true, credentialsUsed: false, skipped: true, reason: 'cloudflare-live off' };
  const token = env.CLOUDFLARE_API_TOKEN;
  const accountId = manifest.cloudflare?.account_id ?? env.CLOUDFLARE_ACCOUNT_ID ?? null;
  const projectName = manifest.cloudflare?.project_name ?? null;
  if (!nonEmptyString(token)) {
    return { observed: false, required: mode === 'required', ok: mode !== 'required', credentialsUsed: false, skipped: true, reason: 'CLOUDFLARE_API_TOKEN not provided' };
  }
  if (typeof fetchImpl !== 'function') throw new UsageError('fetch implementation is required for Cloudflare live observation');
  const headers = { authorization: `Bearer ${token}`, accept: 'application/json' };
  const accountScopedToken = nonEmptyString(accountId);
  const tokenScope = accountScopedToken ? 'account' : 'user';
  const tokenVerifyPath = accountScopedToken
    ? `/accounts/${encodeURIComponent(accountId)}/tokens/verify`
    : '/user/tokens/verify';
  const tokenCheck = await cloudflareJson(fetchImpl, tokenVerifyPath, headers);
  const tokenOk = tokenCheck.ok;
  let accountOk = true;
  let accountStatus = null;
  if (nonEmptyString(accountId)) {
    const accountCheck = await cloudflareJson(fetchImpl, `/accounts/${encodeURIComponent(accountId)}`, headers);
    accountStatus = accountCheck.response.status;
    accountOk = accountCheck.ok;
  }
  let projectOk = true;
  let projectStatus = null;
  let pagesUrlOk = true;
  let domainsOk = true;
  let projectHostCount = 0;
  let domainsStatus = null;
  let projectReason = null;
  const declaredPagesEvidence = nonEmptyString(manifest.cloudflare?.pages_url) || (manifest.cloudflare?.custom_domains ?? []).length > 0;
  const canCheckProject = nonEmptyString(accountId) && nonEmptyString(projectName);
  if (canCheckProject) {
    const projectCheck = await cloudflareJson(fetchImpl, `/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(projectName)}`, headers);
    projectStatus = projectCheck.response.status;
    projectOk = projectCheck.ok && projectCheck.payload?.result?.name === projectName;
    const declared = cloudflareProjectMatchesDeclared(manifest, projectCheck.payload);
    pagesUrlOk = declared.pagesUrlOk;
    domainsOk = declared.domainsOk;
    projectHostCount = declared.host_count;
    const expectedDomains = manifest.cloudflare?.custom_domains ?? [];
    if (expectedDomains.length > 0 && !domainsOk) {
      const domainsCheck = await cloudflareJson(fetchImpl, `/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(projectName)}/domains`, headers);
      domainsStatus = domainsCheck.response.status;
      const domainHosts = new Set();
      for (const domain of Array.isArray(domainsCheck.payload?.result) ? domainsCheck.payload.result : []) {
        for (const value of [domain?.name, domain?.hostname, domain?.domain]) {
          const hostname = cloudflareHostValue(value);
          if (hostname !== null) domainHosts.add(hostname);
        }
      }
      domainsOk = domainsCheck.ok && expectedDomains.every((domain) => {
        const hostname = cloudflareHostValue(domain);
        return hostname !== null && domainHosts.has(hostname);
      });
      projectHostCount += domainHosts.size;
    }
  } else if (declaredPagesEvidence) {
    projectOk = false;
    projectReason = 'Cloudflare Pages project observation requires account_id and project_name';
  }
  return {
    observed: tokenOk && accountOk && projectOk && pagesUrlOk && domainsOk,
    required: mode === 'required',
    ok: tokenOk && accountOk && projectOk && pagesUrlOk && domainsOk,
    credentialsUsed: true,
    token_status: tokenCheck.response.status,
    token_scope: tokenScope,
    account_checked: nonEmptyString(accountId),
    account_status: accountStatus,
    project_status: projectStatus,
    domains_status: domainsStatus,
    project_checked: canCheckProject,
    pages_url_matched: pagesUrlOk,
    custom_domains_matched: domainsOk,
    project_host_count: projectHostCount,
    reason: projectReason,
  };
}

async function runPublicSiteCheck(manifest, checks, options) {
  const site = manifest.public_site;
  if (site?.fetch_url === null || site === null) {
    addCheck(checks, 'public_site.live', false, { skipped: true, reason: 'public_site.url missing' });
    return false;
  }
  try {
    const response = await fetchPublicText(site.fetch_url, options);
    const statusOk = response.status === site.expected_status || (site.expected_status === 200 && response.status >= 200 && response.status < 400);
    const textOk = site.expected_text.every((needle) => response.text.includes(needle));
    return addCheck(checks, 'public_site.live', response.ok && statusOk && textOk, {
      status: response.status,
      expected_status: site.expected_status,
      expected_text_matched: textOk,
    });
  } catch (error) {
    addCheck(checks, 'public_site.live', false, { error: buildFetchError(error) });
    return false;
  }
}

async function runEndpointShapeCheck(name, endpoint, checks, options, shapeOk) {
  if (endpoint === null || endpoint.fetch_url === null) {
    addCheck(checks, `${name}.live`, false, { skipped: true, reason: `${name}.url missing` });
    return false;
  }
  if (endpoint.unauthenticated_local_demo === true) {
    addCheck(checks, `${name}.live`, false, { reason: 'unauthenticated_local_demo is not hosted readiness evidence' });
    return false;
  }
  if (endpoint.internal === true) {
    addCheck(checks, `${name}.live`, false, { reason: 'internal endpoint is not public hosted readiness evidence' });
    return false;
  }
  try {
    const response = await fetchJsonEndpoint(endpoint.fetch_url, options);
    const ok = response.ok && shapeOk(response.payload);
    return addCheck(checks, `${name}.live`, ok, {
      status: response.status,
      has_refs: responseHasRefs(response.payload),
      local_demo: response.payload?.unauthenticated_local_demo === true,
      internal: response.payload?.internal === true,
    });
  } catch (error) {
    addCheck(checks, `${name}.live`, false, { error: buildFetchError(error) });
    return false;
  }
}

function isReadinessCommand(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && (Object.hasOwn(value, 'manifestPath') || Object.hasOwn(value, 'manifest'));
}

function manifestFromCommand(command, readFileImpl) {
  if (command.manifest !== undefined) return command.manifest;
  if (!nonEmptyString(command.manifestPath)) throw new UsageError('--manifest is required');
  return JSON.parse(readFileImpl(command.manifestPath, 'utf8'));
}

function applyCommandOverrides(manifest, command) {
  if (!nonEmptyString(command.operatorDecision)) return manifest;
  return {
    ...manifest,
    operator_acceptance: {
      ...(manifest.operator_acceptance ?? {}),
      decision: command.operatorDecision,
    },
  };
}

export async function runInfrastructureReadiness(manifestInput, options = {}) {
  const commandInput = isReadinessCommand(manifestInput) ? manifestInput : null;
  const {
    live: optionLive,
    cloudflareLive: optionCloudflareLive,
    allowLocalhost: optionAllowLocalhost,
    env = process.env,
    fetchImpl = globalThis.fetch,
    readFileImpl = readFileSync,
    now = new Date(),
  } = options;
  const live = optionLive ?? commandInput?.live ?? false;
  const cloudflareLive = optionCloudflareLive ?? commandInput?.cloudflareLive ?? 'off';
  const allowLocalhost = optionAllowLocalhost ?? commandInput?.allowLocalhost ?? false;
  if (!['off', 'auto', 'required'].includes(cloudflareLive)) throw new UsageError('cloudflareLive must be off, auto, or required');

  const rawManifest = commandInput === null ? manifestInput : applyCommandOverrides(manifestFromCommand(commandInput, readFileImpl), commandInput);
  const manifest = validateInfrastructureReadinessManifest(rawManifest, { allowLocalhost });
  const checks = [];
  addCheck(checks, 'manifest.secret_scan', true);
  addCheck(checks, 'manifest.schema', true, { manifest_schema: INFRASTRUCTURE_READINESS_MANIFEST_SCHEMA });

  const missingContractRefs = contractFindings(manifest);
  const missingHostedRefs = hostedFindings(manifest);
  const contractReady = addCheck(checks, 'readiness.contract', missingContractRefs.length === 0, { missing: missingContractRefs });
  addCheck(checks, 'hosted.required_refs', missingHostedRefs.length === 0, { missing: missingHostedRefs, required_count: HOSTED_REQUIRED_REF_GROUPS.length + 3, missing_count: missingHostedRefs.length });
  const operatorGo = addCheck(checks, 'operator_acceptance.decision', manifest.operator_acceptance.decision === 'go', { decision: manifest.operator_acceptance.decision });
  const manifestBlockersClear = addCheck(checks, 'external_blockers.manifest', manifest.external_blockers.length === 0, { count: manifest.external_blockers.length });
  const localhostAllowed = addCheck(checks, 'hosted.allow_localhost_boundary', allowLocalhost !== true, {
    allow_localhost: allowLocalhost === true,
    hosted_live_ready: false,
    reason: allowLocalhost === true ? '--allow-localhost is local/demo evidence only' : null,
  });

  let publicLiveReady = false;
  let relayLiveReady = false;
  let gatewayLiveReady = false;
  let cloudflareObserved = false;
  let credentialsUsedCloudflare = false;

  if (live === true) {
    publicLiveReady = await runPublicSiteCheck(manifest, checks, { fetchImpl });
    relayLiveReady = await runEndpointShapeCheck('relay', manifest.relay, checks, { fetchImpl }, relayShapeOk);
    gatewayLiveReady = await runEndpointShapeCheck('gateway', manifest.gateway, checks, { fetchImpl }, gatewayShapeOk);
    const cloudflare = await observeCloudflare(manifest, { env, fetchImpl, mode: cloudflareLive });
    credentialsUsedCloudflare = cloudflare.credentialsUsed;
    cloudflareObserved = cloudflare.observed;
    const cloudflareReadinessOk = cloudflare.ok === true && cloudflare.observed === true;
    addCheck(checks, 'cloudflare.observation', cloudflareReadinessOk, {
      mode: cloudflareLive,
      observed: cloudflare.observed,
      skipped: cloudflare.skipped === true,
      required: cloudflare.required,
      hosted_readiness_required: true,
      account_checked: cloudflare.account_checked === true,
      project_checked: cloudflare.project_checked === true,
      pages_url_matched: cloudflare.pages_url_matched !== false,
      custom_domains_matched: cloudflare.custom_domains_matched !== false,
      token_status: cloudflare.token_status ?? null,
      token_scope: cloudflare.token_scope ?? null,
      account_status: cloudflare.account_status ?? null,
      project_status: cloudflare.project_status ?? null,
      domains_status: cloudflare.domains_status ?? null,
      reason: cloudflare.reason ?? null,
    });
  } else {
    addCheck(checks, 'network.live_checks', true, { skipped: true, reason: 'contract-only mode performs no network checks' });
    addCheck(checks, 'hosted.live_boundary', true, { hosted_live_ready: false, reason: 'contract-only mode cannot prove hosted live readiness' });
  }

  const externalBlockers = [...manifest.external_blockers];
  for (const missing of missingContractRefs) externalBlockers.push(`missing ${missing}`);
  for (const missing of missingHostedRefs) externalBlockers.push(`missing ${missing}`);
  if (!operatorGo) externalBlockers.push(`operator acceptance decision is ${manifest.operator_acceptance.decision}`);
  if (manifest.relay?.unauthenticated_local_demo === true) externalBlockers.push('relay unauthenticated_local_demo is not hosted readiness evidence');
  if (manifest.gateway?.internal === true) externalBlockers.push('gateway internal:true is not hosted readiness evidence');
  if (manifest.relay?.internal === true) externalBlockers.push('relay internal:true is not hosted readiness evidence');
  if (manifest.gateway?.unauthenticated_local_demo === true) externalBlockers.push('gateway unauthenticated_local_demo is not hosted readiness evidence');
  if (allowLocalhost === true) externalBlockers.push('--allow-localhost was used; localhost/private demo URLs cannot prove hosted live readiness');
  if ([manifest.public_site, manifest.relay, manifest.gateway].some((endpoint) => isLocalOrPrivateUrl(endpoint?.fetch_url)) || isLocalOrPrivateUrl(manifest.github?.url) || isLocalOrPrivateUrl(manifest.cloudflare?.pages_url)) {
    externalBlockers.push('localhost/private manifest URL cannot prove hosted live readiness');
  }
  if (live === true && !relayLiveReady) externalBlockers.push('relay live readiness check did not pass');
  if (live === true && !gatewayLiveReady) externalBlockers.push('gateway live readiness check did not pass');
  const cloudflareObservationCheck = checks.find((check) => check.name === 'cloudflare.observation');
  const cloudflareObservationOk = cloudflareObservationCheck?.ok === true;
  const cloudflareObservedOk = live !== true || cloudflareObserved === true;
  const cloudflareCredentialedOk = !(live === true && cloudflareLive !== 'off' && credentialsUsedCloudflare === true && !cloudflareObservationOk);
  const cloudflareRequiredOk = cloudflareLive !== 'required' || cloudflareObservationOk;
  if (live === true && !cloudflareObservedOk) externalBlockers.push('Cloudflare live observation did not complete');
  if (!cloudflareCredentialedOk) externalBlockers.push('credentialed Cloudflare observation did not pass');
  if (cloudflareLive === 'required' && !cloudflareRequiredOk) externalBlockers.push('required Cloudflare observation did not pass');

  const hostedLiveReady = allowLocalhost !== true
    && localhostAllowed
    && live === true
    && contractReady
    && publicLiveReady
    && relayLiveReady
    && gatewayLiveReady
    && cloudflareObservedOk
    && cloudflareCredentialedOk
    && cloudflareRequiredOk
    && operatorGo
    && manifestBlockersClear
    && externalBlockers.length === 0;

  const ok = live === true
    ? contractReady && publicLiveReady && relayLiveReady && gatewayLiveReady && cloudflareObservedOk && cloudflareCredentialedOk && cloudflareRequiredOk && operatorGo && manifestBlockersClear && externalBlockers.length === 0
    : contractReady;

  return {
    schema: INFRASTRUCTURE_READINESS_SCHEMA,
    ok,
    generated_at: now.toISOString(),
    mode: live === true ? 'live' : 'contract',
    credentials_required: false,
    credentials_used: {
      cloudflare_api_token: credentialsUsedCloudflare,
    },
    readiness: {
      contract_ready: contractReady,
      public_live_ready: live === true ? publicLiveReady : false,
      cloudflare_observed: cloudflareObserved,
      hosted_live_ready: hostedLiveReady,
    },
    checks,
    external_blockers: [...new Set(externalBlockers)],
    claim_boundary: manifest.claim_boundary,
  };
}

export function infrastructureReadinessHelpText() {
  return HELP_TEXT;
}

async function main(argv = process.argv.slice(2), env = process.env) {
  try {
    const command = parseInfrastructureReadinessArgs(argv);
    if (command.help) {
      process.stdout.write(safeJson({
        schema: INFRASTRUCTURE_READINESS_SCHEMA,
        ok: true,
        mode: 'help',
        credentials_required: false,
        credentials_used: { cloudflare_api_token: false },
        help: infrastructureReadinessHelpText(),
      }));
      return 0;
    }
    const result = await runInfrastructureReadiness(command, {
      env,
    });
    process.stdout.write(safeJson(result));
    return result.ok ? 0 : 1;
  } catch (error) {
    const message = error instanceof UsageError ? error.message : (error?.message ?? String(error));
    process.stderr.write(safeJson({
      schema: INFRASTRUCTURE_READINESS_SCHEMA,
      ok: false,
      error: message,
      credentials_required: false,
      credentials_used: { cloudflare_api_token: false },
    }));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
