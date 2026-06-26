#!/usr/bin/env node
import https from 'node:https';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HOSTED_BACKEND_LIVE_EVIDENCE_SCHEMA,
  HOSTED_BACKEND_LIVE_RESULT_SCHEMA,
  REQUIRED_REF_KEYS,
  validateHostedBackendLiveEvidence,
} from './validate-hosted-backend-live.mjs';

export const HOSTED_BACKEND_LIVE_COLLECTION_SCHEMA = 'enigma.hosted_backend_live_collection.v1';

const REQUIRED_PROBES = Object.freeze(['relay_livez', 'relay_readyz', 'gateway_livez', 'gateway_readyz']);
const CLAIM_BOUNDARY = Object.freeze([
  'This collector performs public HTTPS health probes and assembles evidence; it does not deploy infrastructure, mutate DNS, create credentials, or approve operator acceptance.',
  'Collected evidence is accepted only if validate-hosted-backend-live also accepts it.',
  'Probe response bodies must be public-safe readiness JSON and must not contain tokens, prompts, transcripts, provider responses, raw memory, or personal contact data.',
]);
const SAFE_PROBE_FIELD_NAMES = new Set(['evidence_refs', 'kms_or_secret_custody']);

function sha256(text) {
  return `sha256:${createHash('sha256').update(String(text)).digest('hex')}`;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function readFlag(flags, key, fallback = null) {
  return flags.has(key) ? flags.get(key) : fallback;
}

function parsePublicHealthUrl(value, label) {
  if (!nonEmptyString(value)) throw new Error(`${label} is required`);
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error(`${label} must use https`);
  if (url.username || url.password) throw new Error(`${label} must not include credentials`);
  if (url.search || url.hash) throw new Error(`${label} must not include query strings or fragments`);
  if (url.pathname !== '/livez' && url.pathname !== '/readyz') throw new Error(`${label} must end in /livez or /readyz`);
  return url.toString();
}

function endpointFromBase(value, endpoint, label) {
  if (!nonEmptyString(value)) throw new Error(`${label} is required`);
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error(`${label} must use https`);
  if (url.username || url.password) throw new Error(`${label} must not include credentials`);
  url.pathname = endpoint;
  url.search = '';
  url.hash = '';
  return url.toString();
}

async function readJsonFile(path) {
  return JSON.parse(await readFile(resolve(path), 'utf8'));
}

async function maybeReadJsonFile(path) {
  return nonEmptyString(path) ? readJsonFile(path) : null;
}

function redactProbeBody(value, path = 'probe.body') {
  const forbidden = /(?:token|api[_-]?key|secret|password|passwd|pwd|private[_-]?key|prompt|completion|transcript|embedding|provider[_-]?response|raw[_-]?memory|plaintext|cookie|session)/iu;
  const secretValue = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16})/iu;
  if (typeof value === 'string') {
    if (secretValue.test(value)) throw new Error(`${path} contains secret-looking data`);
    return value;
  }
  if (Array.isArray(value)) return value.map((item, index) => redactProbeBody(item, `${path}[${index}]`));
  if (!isPlainObject(value)) return value;
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.test(key) && !SAFE_PROBE_FIELD_NAMES.has(key) && !REQUIRED_REF_KEYS.includes(key)) throw new Error(`probe body field ${key} is not allowed in hosted backend evidence`);
    redactProbeBody(child, `${path}.${key}`);
  }
  return value;
}

export function localSimulationLoopbackFetch(url, init = {}) {
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol !== 'https:' || (host !== 'sim.enigmamemory.com' && !host.endsWith('.sim.enigmamemory.com'))) {
    throw new Error('--local-simulation-loopback only supports https://*.sim.enigmamemory.com simulation probes');
  }
  const request = {
    hostname: '127.0.0.1',
    port: parsed.port || 443,
    path: `${parsed.pathname}${parsed.search}`,
    method: init.method || 'GET',
    headers: init.headers,
    rejectUnauthorized: false,
    servername: parsed.hostname,
  };
  return new Promise((resolve, reject) => {
    const req = https.request(request, (res) => {
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

async function fetchProbe(url, { fetchImpl = globalThis.fetch, observedAt }) {
  if (typeof fetchImpl !== 'function') throw new Error('global fetch is not available in this Node runtime');
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    redirect: 'manual',
  });
  const statusCode = Number(response.status ?? 0);
  const responseUrl = typeof response.url === 'string' && response.url.length > 0 ? response.url : url;
  if (response.redirected === true || responseUrl !== url || (statusCode >= 300 && statusCode <= 399)) {
    throw new Error(`hosted backend probe ${url} must not redirect`);
  }
  const text = typeof response.text === 'function' ? await response.text() : '';
  let body = null;
  try {
    body = text.trim().length === 0 ? {} : JSON.parse(text);
  } catch {
    body = { ok: false, parse_error: 'response was not JSON' };
  }
  return {
    url,
    status_code: Number(response.status ?? 0),
    body: redactProbeBody(body),
    observed_at: observedAt,
    response_hash: sha256(text),
  };
}

function buildProbeUrls(options) {
  const relayBaseUrl = options.relayBaseUrl ?? options.relayUrl ?? null;
  const gatewayBaseUrl = options.gatewayBaseUrl ?? options.gatewayUrl ?? null;
  return {
    relay_livez: options.relayLivezUrl ? parsePublicHealthUrl(options.relayLivezUrl, 'relay_livez_url') : endpointFromBase(relayBaseUrl, '/livez', 'relay_url'),
    relay_readyz: options.relayReadyzUrl ? parsePublicHealthUrl(options.relayReadyzUrl, 'relay_readyz_url') : endpointFromBase(relayBaseUrl, '/readyz', 'relay_url'),
    gateway_livez: options.gatewayLivezUrl ? parsePublicHealthUrl(options.gatewayLivezUrl, 'gateway_livez_url') : endpointFromBase(gatewayBaseUrl, '/livez', 'gateway_url'),
    gateway_readyz: options.gatewayReadyzUrl ? parsePublicHealthUrl(options.gatewayReadyzUrl, 'gateway_readyz_url') : endpointFromBase(gatewayBaseUrl, '/readyz', 'gateway_url'),
  };
}

function buildEnvironment(options) {
  if (isPlainObject(options.environment)) return options.environment;
  return {
    environment_id: options.environmentId,
    domain: options.domain,
    cloud_provider: options.cloudProvider,
    region: options.region,
    owner: options.owner,
    status: options.environmentStatus ?? 'observed',
  };
}

function buildOperatorAcceptance(options) {
  if (isPlainObject(options.operatorAcceptance)) return options.operatorAcceptance;
  return {
    decision: options.operatorDecision ?? 'blocked',
    packet_ref: options.operatorPacketRef,
    approved_at: options.operatorApprovedAt,
    approved_by: options.operatorApprovedBy,
  };
}

function validateRefsShape(refs) {
  if (!isPlainObject(refs)) throw new Error('--refs-json must contain an object');
  return Object.fromEntries(REQUIRED_REF_KEYS.map((key) => [key, refs[key] ?? '']));
}

export async function collectHostedBackendLiveEvidence(options = {}) {
  const observedAt = options.observed_at ?? options.observedAt ?? new Date().toISOString();
  const probeUrls = buildProbeUrls(options);
  const probeEntries = await Promise.all(REQUIRED_PROBES.map(async (key) => [key, await fetchProbe(probeUrls[key], { fetchImpl: options.fetchImpl, observedAt })]));
  const evidence = {
    schema: HOSTED_BACKEND_LIVE_EVIDENCE_SCHEMA,
    observed_at: observedAt,
    environment: buildEnvironment(options),
    refs: validateRefsShape(options.refs),
    probes: Object.fromEntries(probeEntries),
    operator_acceptance: buildOperatorAcceptance(options),
    claim_boundary: {
      hosted_backend_live: true,
      public_site_live: false,
      cloudflare_credentials_claim: false,
      token_roi_claim: false,
      provider_deletion_claim: false,
      model_forgetting_claim: false,
    },
  };
  const validation = validateHostedBackendLiveEvidence(evidence, { generated_at: observedAt });
  return {
    schema: HOSTED_BACKEND_LIVE_COLLECTION_SCHEMA,
    generated_at: observedAt,
    ok: validation.ok,
    evidence,
    validation,
    probe_summary: Object.fromEntries(Object.entries(evidence.probes).map(([key, probe]) => [key, { url: probe.url, status_code: probe.status_code, response_hash: probe.response_hash }])),
    claim_boundary: [...CLAIM_BOUNDARY],
  };
}

function parseArgs(argv) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      flags.set('help', true);
      continue;
    }
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);
    const name = arg.slice(2);
    if (name === 'local-simulation-loopback') {
      flags.set(name, true);
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
    flags.set(name, value);
    index += 1;
  }
  return flags;
}

function usage() {
  return `Usage: node scripts/collect-hosted-backend-live-evidence.mjs --relay-url <https-base> --gateway-url <https-base> --refs-json <refs.json> --domain <domain> --environment-id <id> --cloud-provider <provider> --region <region> --owner <owner> --operator-decision go --operator-packet-ref <ref> --operator-approved-at <iso> --operator-approved-by <name> [--out <collection.json>] [--evidence-out <evidence.json>] [--local-simulation-loopback]\n\nCollects public HTTPS /livez and /readyz evidence for relay and gateway, then validates it with validate-hosted-backend-live. It never sends credentials and does not deploy infrastructure. The --local-simulation-loopback flag is restricted to https://*.sim.enigmamemory.com local simulation probes with self-signed TLS and must not be used as production evidence.\n`;
}

async function runCli(argv = process.argv.slice(2), { fetchImpl = globalThis.fetch } = {}) {
  const flags = parseArgs(argv);
  if (flags.get('help')) {
    process.stdout.write(usage());
    return 0;
  }
  const refsPath = readFlag(flags, 'refs-json');
  if (!nonEmptyString(refsPath)) throw new Error('--refs-json is required');
  const refs = await readJsonFile(refsPath);
  const environment = await maybeReadJsonFile(readFlag(flags, 'environment-json'));
  const operatorAcceptance = await maybeReadJsonFile(readFlag(flags, 'operator-acceptance-json'));
  const selectedFetchImpl = flags.get('local-simulation-loopback') === true ? localSimulationLoopbackFetch : fetchImpl;
  const collection = await collectHostedBackendLiveEvidence({
    relayBaseUrl: readFlag(flags, 'relay-url'),
    gatewayBaseUrl: readFlag(flags, 'gateway-url'),
    relayLivezUrl: readFlag(flags, 'relay-livez-url'),
    relayReadyzUrl: readFlag(flags, 'relay-readyz-url'),
    gatewayLivezUrl: readFlag(flags, 'gateway-livez-url'),
    gatewayReadyzUrl: readFlag(flags, 'gateway-readyz-url'),
    refs,
    environment,
    environmentId: readFlag(flags, 'environment-id'),
    domain: readFlag(flags, 'domain'),
    cloudProvider: readFlag(flags, 'cloud-provider'),
    region: readFlag(flags, 'region'),
    owner: readFlag(flags, 'owner'),
    environmentStatus: readFlag(flags, 'environment-status', 'observed'),
    operatorAcceptance,
    operatorDecision: readFlag(flags, 'operator-decision', 'blocked'),
    operatorPacketRef: readFlag(flags, 'operator-packet-ref'),
    operatorApprovedAt: readFlag(flags, 'operator-approved-at'),
    operatorApprovedBy: readFlag(flags, 'operator-approved-by'),
    observed_at: readFlag(flags, 'observed-at') ?? new Date().toISOString(),
    fetchImpl: selectedFetchImpl,
  });
  const collectionJson = `${JSON.stringify(collection, null, 2)}\n`;
  const evidenceJson = `${JSON.stringify(collection.evidence, null, 2)}\n`;
  const out = readFlag(flags, 'out');
  if (out) {
    const outPath = resolve(out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, collectionJson, 'utf8');
  }
  const evidenceOut = readFlag(flags, 'evidence-out');
  if (evidenceOut) {
    const evidencePath = resolve(evidenceOut);
    await mkdir(dirname(evidencePath), { recursive: true });
    await writeFile(evidencePath, evidenceJson, 'utf8');
  }
  process.stdout.write(collectionJson);
  return collection.ok ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runCli().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
