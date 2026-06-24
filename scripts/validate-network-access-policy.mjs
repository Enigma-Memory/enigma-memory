#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const NETWORK_ACCESS_POLICY_SCHEMA = 'enigma.network_access_policy.v1';
export const NETWORK_ACCESS_POLICY_RESULT_SCHEMA = 'enigma.network_access_policy_result.v1';

export const REQUIRED_PUBLIC_PROBES = Object.freeze([
  'relay_livez',
  'relay_readyz',
  'gateway_livez',
  'gateway_readyz',
]);

export const REQUIRED_PRIVATE_ROUTES = Object.freeze([
  'relay_records_write',
  'gateway_admin_policy',
  'gateway_data_plane_evaluate',
  'gateway_data_plane_decision',
  'gateway_siem_export',
]);

const ACCEPTED_STATUSES = new Set(['approved', 'accepted', 'go', 'verified']);
const ALLOWED_PUBLIC_PROBE_PATHS = new Set(['/livez', '/readyz']);
const ALLOWED_PRIVATE_AUTH_MODES = new Set(['bearer_hash', 'mtls', 'private_ingress', 'zero_trust_access']);
const SECRET_VALUE_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@|raw memory|private prompt|full transcript|decrypted capsule|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16})/iu;
const SECRET_KEY_RE = /(?:password|passwd|pwd|token|api[_-]?key|private[_-]?key|secret|raw[_-]?memory|plaintext|plain[_-]?text|prompt|completion|transcript|embedding|provider[_-]?response)/iu;
const SAFE_FIELD_NAMES = new Set(['no_token_values_in_policy']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function positiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isoLike(value) {
  return nonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

function blocker(message, path) {
  return { message, path };
}

function assertNoSecrets(value, path = 'network_policy') {
  if (typeof value === 'string') {
    if (!/\.claim_boundary\[\d+\]$/.test(path) && SECRET_VALUE_RE.test(value)) throw new Error(`${path} contains secret or raw-memory-looking data`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecrets(item, `${path}[${index}]`));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY_RE.test(key) && !SAFE_FIELD_NAMES.has(key)) throw new Error(`${path}.${key} uses a forbidden field name`);
    assertNoSecrets(child, `${path}.${key}`);
  }
}

function statusAccepted(value) {
  return typeof value === 'string' && ACCEPTED_STATUSES.has(value.trim().toLowerCase());
}

function validateMetadata(metadata, blockers) {
  if (!isPlainObject(metadata)) {
    blockers.push(blocker('metadata is required', 'metadata'));
    return;
  }
  for (const field of ['policy_id', 'environment', 'tenant', 'owner', 'approved_at', 'approval_ref', 'status']) {
    if (!nonEmptyString(metadata[field])) blockers.push(blocker(`metadata.${field} is required`, `metadata.${field}`));
  }
  if (!statusAccepted(metadata.status)) blockers.push(blocker('metadata.status must be approved/accepted/go/verified', 'metadata.status'));
  if (!isoLike(metadata.approved_at)) blockers.push(blocker('metadata.approved_at must be ISO time', 'metadata.approved_at'));
}

function validateZones(zones, blockers) {
  if (!isPlainObject(zones)) {
    blockers.push(blocker('network_zones object is required', 'network_zones'));
    return false;
  }
  for (const field of ['public_ingress_ref', 'private_admin_network_ref', 'private_data_plane_network_ref', 'egress_policy_ref', 'waf_or_rate_limit_ref', 'tls_policy_ref', 'owner']) {
    if (!nonEmptyString(zones[field])) blockers.push(blocker(`network_zones.${field} is required`, `network_zones.${field}`));
  }
  return true;
}

function validatePublicEndpoints(endpoints, blockers) {
  if (!Array.isArray(endpoints)) {
    blockers.push(blocker('public_endpoints array is required', 'public_endpoints'));
    return { checked: 0, requiredCovered: 0 };
  }
  const names = new Set();
  endpoints.forEach((endpoint, index) => {
    const path = `public_endpoints[${index}]`;
    if (!isPlainObject(endpoint)) {
      blockers.push(blocker('public endpoint must be object', path));
      return;
    }
    for (const field of ['name', 'service', 'method', 'path', 'rate_limit_ref', 'owner']) {
      if (!nonEmptyString(endpoint[field])) blockers.push(blocker(`${path}.${field} is required`, `${path}.${field}`));
    }
    if (nonEmptyString(endpoint.name)) names.add(endpoint.name);
    if (endpoint.public !== true) blockers.push(blocker(`${path}.public must be true`, `${path}.public`));
    if (endpoint.tls_required !== true) blockers.push(blocker(`${path}.tls_required must be true`, `${path}.tls_required`));
    if (String(endpoint.method ?? '').toUpperCase() !== 'GET') blockers.push(blocker(`${path}.method must be GET`, `${path}.method`));
    if (!ALLOWED_PUBLIC_PROBE_PATHS.has(endpoint.path)) blockers.push(blocker(`${path}.path must be /livez or /readyz only`, `${path}.path`));
    if (/admin|policy|siem|gateway\/evaluate|gateway\/decision|relay\/records/i.test(String(endpoint.path ?? ''))) blockers.push(blocker(`${path}.path exposes private admin or data-plane route`, `${path}.path`));
  });
  for (const probe of REQUIRED_PUBLIC_PROBES) {
    if (!names.has(probe)) blockers.push(blocker(`public_endpoints must include ${probe}`, 'public_endpoints'));
  }
  return { checked: endpoints.length, requiredCovered: REQUIRED_PUBLIC_PROBES.filter((probe) => names.has(probe)).length };
}

function validatePrivateRoutes(routes, blockers) {
  if (!Array.isArray(routes)) {
    blockers.push(blocker('private_routes array is required', 'private_routes'));
    return { checked: 0, requiredCovered: 0 };
  }
  const names = new Set();
  routes.forEach((route, index) => {
    const path = `private_routes[${index}]`;
    if (!isPlainObject(route)) {
      blockers.push(blocker('private route must be object', path));
      return;
    }
    for (const field of ['name', 'service', 'method', 'path', 'network_ref', 'auth_mode', 'auth_config_ref', 'audit_ref', 'owner']) {
      if (!nonEmptyString(route[field])) blockers.push(blocker(`${path}.${field} is required`, `${path}.${field}`));
    }
    if (nonEmptyString(route.name)) names.add(route.name);
    if (route.public !== false) blockers.push(blocker(`${path}.public must be false`, `${path}.public`));
    if (route.tls_required !== true) blockers.push(blocker(`${path}.tls_required must be true`, `${path}.tls_required`));
    if (!ALLOWED_PRIVATE_AUTH_MODES.has(String(route.auth_mode ?? '').toLowerCase())) blockers.push(blocker(`${path}.auth_mode must be bearer_hash/mtls/private_ingress/zero_trust_access`, `${path}.auth_mode`));
  });
  for (const route of REQUIRED_PRIVATE_ROUTES) {
    if (!names.has(route)) blockers.push(blocker(`private_routes must include ${route}`, 'private_routes'));
  }
  return { checked: routes.length, requiredCovered: REQUIRED_PRIVATE_ROUTES.filter((route) => names.has(route)).length };
}

function validateLimits(limits, blockers) {
  if (!isPlainObject(limits)) {
    blockers.push(blocker('limits object is required', 'limits'));
    return false;
  }
  for (const field of ['max_request_bytes', 'max_requests_per_minute', 'body_timeout_seconds']) {
    if (!positiveNumber(limits[field])) blockers.push(blocker(`limits.${field} must be positive number`, `limits.${field}`));
  }
  if (!nonEmptyString(limits.enforcement_ref)) blockers.push(blocker('limits.enforcement_ref is required', 'limits.enforcement_ref'));
  return true;
}

function validateEgress(egress, blockers) {
  if (!isPlainObject(egress)) {
    blockers.push(blocker('egress object is required', 'egress'));
    return { checked: 0 };
  }
  if (egress.default_denied !== true) blockers.push(blocker('egress.default_denied must be true', 'egress.default_denied'));
  if (!nonEmptyString(egress.policy_ref)) blockers.push(blocker('egress.policy_ref is required', 'egress.policy_ref'));
  const destinations = egress.allowed_destinations;
  if (!Array.isArray(destinations) || destinations.length === 0) {
    blockers.push(blocker('egress.allowed_destinations array is required', 'egress.allowed_destinations'));
    return { checked: 0 };
  }
  destinations.forEach((destination, index) => {
    const path = `egress.allowed_destinations[${index}]`;
    if (!isPlainObject(destination)) {
      blockers.push(blocker('allowed destination must be object', path));
      return;
    }
    for (const field of ['name', 'destination_ref', 'purpose', 'owner']) {
      if (!nonEmptyString(destination[field])) blockers.push(blocker(`${path}.${field} is required`, `${path}.${field}`));
    }
    if (destination.sensitive_content_allowed !== false) blockers.push(blocker(`${path}.sensitive_content_allowed must be false`, `${path}.sensitive_content_allowed`));
  });
  return { checked: destinations.length };
}

function validateBreakGlass(breakGlass, blockers) {
  if (!isPlainObject(breakGlass)) {
    blockers.push(blocker('break_glass object is required', 'break_glass'));
    return false;
  }
  for (const field of ['approval_ref', 'audit_ref', 'owner', 'expiry_policy_ref']) {
    if (!nonEmptyString(breakGlass[field])) blockers.push(blocker(`break_glass.${field} is required`, `break_glass.${field}`));
  }
  if (!positiveNumber(breakGlass.max_session_seconds)) blockers.push(blocker('break_glass.max_session_seconds must be positive number', 'break_glass.max_session_seconds'));
  if (breakGlass.enabled_without_approval !== false) blockers.push(blocker('break_glass.enabled_without_approval must be false', 'break_glass.enabled_without_approval'));
  return true;
}

export function validateNetworkAccessPolicy(policy, options = {}) {
  if (!isPlainObject(policy)) throw new Error('network access policy must be an object');
  assertNoSecrets(policy);
  const blockers = [];
  if (policy.schema !== NETWORK_ACCESS_POLICY_SCHEMA) blockers.push(blocker('schema mismatch', 'schema'));
  validateMetadata(policy.metadata, blockers);
  const zonesOk = validateZones(policy.network_zones, blockers);
  const publicEndpoints = validatePublicEndpoints(policy.public_endpoints, blockers);
  const privateRoutes = validatePrivateRoutes(policy.private_routes, blockers);
  const limitsOk = validateLimits(policy.limits, blockers);
  const egress = validateEgress(policy.egress, blockers);
  const breakGlassOk = validateBreakGlass(policy.break_glass, blockers);
  if (policy.no_token_values_in_policy !== true) blockers.push(blocker('no_token_values_in_policy must be true', 'no_token_values_in_policy'));

  const result = {
    schema: NETWORK_ACCESS_POLICY_RESULT_SCHEMA,
    generated_at: options.generated_at ?? options.generatedAt ?? new Date(0).toISOString(),
    ok: blockers.length === 0,
    status: blockers.length === 0 ? 'accepted' : 'blocked',
    blockers,
    checked: {
      zones: zonesOk,
      required_public_probes: REQUIRED_PUBLIC_PROBES.length,
      public_probes_covered: publicEndpoints.requiredCovered,
      public_endpoints: publicEndpoints.checked,
      required_private_routes: REQUIRED_PRIVATE_ROUTES.length,
      private_routes_covered: privateRoutes.requiredCovered,
      private_routes: privateRoutes.checked,
      limits: limitsOk,
      egress_destinations: egress.checked,
      break_glass: breakGlassOk,
    },
    claim_boundary: [
      'Network access validation checks declared network policy shape only; it does not configure firewalls, ingress, DNS, WAF, identity providers, or cloud networks.',
      'Public endpoint acceptance is limited to /livez and /readyz probes; admin and data-plane routes must remain private and authenticated.',
      'Secrets, bearer values, private keys, raw memory, prompts, transcripts, provider responses, decrypted content, and credentials must remain outside network policy artifacts.',
    ],
  };
  assertNoSecrets(result, 'result');
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
  const policyPath = getFlag(flags, ['policy', 'in']);
  if (!nonEmptyString(policyPath)) throw new Error('--policy <path> is required');
  const policy = JSON.parse(await readFile(resolve(String(policyPath)), 'utf8'));
  const result = validateNetworkAccessPolicy(policy, { generated_at: new Date().toISOString() });
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
