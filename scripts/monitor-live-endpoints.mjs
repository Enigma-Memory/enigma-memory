#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

export const LIVE_ENDPOINT_MONITOR_SCHEMA = 'enigma.live_endpoint_monitor.v1';

export const DEFAULT_LIVE_ENDPOINTS = Object.freeze([
  Object.freeze({ name: 'public_site', url: 'https://enigmamemory.com/', expected_status: [200] }),
  Object.freeze({ name: 'relay_readyz', url: 'https://relay.enigmamemory.com/readyz', expected_status: [200] }),
  Object.freeze({ name: 'gateway_readyz', url: 'https://gateway.enigmamemory.com/readyz', expected_status: [200] }),
]);

const DEFAULT_TIMEOUT_MS = 5000;
const MAX_TIMEOUT_MS = 60000;
const SAFE_NAME_RE = /^[a-z][a-z0-9_-]{0,63}$/u;
const SECRET_VALUE_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|cf-[A-Za-z0-9_-]{12,})/iu;

export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

class TimeoutError extends Error {
  constructor() {
    super('Request timed out');
    this.name = 'TimeoutError';
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function toPositiveInteger(value, name, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > max) throw new UsageError(`${name} must be an integer between 1 and ${max}`);
  return parsed;
}

function isPrivateHost(hostname) {
  const host = String(hostname ?? '').toLowerCase();
  return host === 'localhost'
    || host.endsWith('.localhost')
    || host === '127.0.0.1'
    || host === '0.0.0.0'
    || host === '::1'
    || /^10\./u.test(host)
    || /^192\.168\./u.test(host)
    || /^172\.(1[6-9]|2\d|3[0-1])\./u.test(host)
    || /^169\.254\./u.test(host)
    || host === '[::1]';
}

function normalizeExpectedStatus(value, path) {
  const source = value === undefined ? [200] : Array.isArray(value) ? value : [value];
  if (source.length === 0) throw new UsageError(`${path}.expected_status must not be empty`);
  return source.map((entry, index) => {
    const status = Number(entry);
    if (!Number.isInteger(status) || status < 100 || status > 599) throw new UsageError(`${path}.expected_status[${index}] must be an HTTP status code`);
    return status;
  });
}

export function normalizeEndpoint(endpoint, index = 0) {
  const path = `endpoints[${index}]`;
  if (!isPlainObject(endpoint)) throw new UsageError(`${path} must be an object`);
  const name = String(endpoint.name ?? '').trim();
  if (!SAFE_NAME_RE.test(name)) throw new UsageError(`${path}.name must match ${SAFE_NAME_RE.source}`);
  if (!nonEmptyString(endpoint.url)) throw new UsageError(`${path}.url is required`);
  if (SECRET_VALUE_RE.test(endpoint.url)) throw new UsageError(`${path}.url must not contain credentials or token-like values`);
  let parsed;
  try {
    parsed = new URL(endpoint.url.trim());
  } catch {
    throw new UsageError(`${path}.url must be a valid URL`);
  }
  if (parsed.protocol !== 'https:') throw new UsageError(`${path}.url must use https`);
  if (parsed.username || parsed.password) throw new UsageError(`${path}.url must not include credentials`);
  if (parsed.search || parsed.hash) throw new UsageError(`${path}.url must not include query strings or fragments`);
  if (isPrivateHost(parsed.hostname)) throw new UsageError(`${path}.url must not target localhost, link-local, or private network hosts`);

  const method = String(endpoint.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') throw new UsageError(`${path}.method must be GET or HEAD`);

  return {
    name,
    url: parsed.href,
    method,
    expected_status: normalizeExpectedStatus(endpoint.expected_status ?? endpoint.expectedStatus, path),
  };
}

export function normalizeEndpoints(endpoints = DEFAULT_LIVE_ENDPOINTS) {
  if (!Array.isArray(endpoints) || endpoints.length === 0) throw new UsageError('endpoints must be a non-empty array');
  const normalized = endpoints.map((endpoint, index) => normalizeEndpoint(endpoint, index));
  const names = new Set();
  for (const endpoint of normalized) {
    if (names.has(endpoint.name)) throw new UsageError(`duplicate endpoint name ${endpoint.name}`);
    names.add(endpoint.name);
  }
  return normalized;
}

function headerValue(headers, name) {
  if (!headers || typeof headers.get !== 'function') return null;
  const value = headers.get(name);
  return typeof value === 'string' && value.trim().length > 0 ? value.trim().slice(0, 120) : null;
}

function safeJsonSummary(value) {
  if (!isPlainObject(value)) return { payload_kind: Array.isArray(value) ? 'json_array' : 'json_scalar' };
  const summary = { payload_kind: 'json_object' };
  if (typeof value.ok === 'boolean') summary.ok = value.ok;
  if (typeof value.status === 'string' && /^[a-z0-9_.:-]{1,48}$/iu.test(value.status) && !SECRET_VALUE_RE.test(value.status)) summary.status = value.status;
  if (typeof value.service === 'string' && /^[a-z0-9_.:-]{1,80}$/iu.test(value.service) && !SECRET_VALUE_RE.test(value.service)) summary.service = value.service;
  if (Array.isArray(value.checks)) summary.checks_count = value.checks.length;
  if (Array.isArray(value.missing_evidence_refs)) summary.missing_evidence_refs_count = value.missing_evidence_refs.length;
  return summary;
}

async function buildSafeSummary(response) {
  const contentType = headerValue(response.headers, 'content-type');
  const summary = {
    content_type: contentType,
    payload_kind: 'not_read',
  };
  if (!contentType) return summary;
  if (!/\bjson\b/iu.test(contentType)) return { ...summary, payload_kind: 'non_json' };
  const source = typeof response.clone === 'function' ? response.clone() : response;
  if (typeof source.json !== 'function') return { ...summary, payload_kind: 'json_unavailable' };
  try {
    return { ...summary, ...safeJsonSummary(await source.json()) };
  } catch {
    return { ...summary, payload_kind: 'json_unreadable' };
  }
}

function publicSafeError(error) {
  if (error instanceof TimeoutError || error?.name === 'AbortError') {
    return { code: 'TIMEOUT', message: 'Request timed out before the configured deadline.' };
  }
  return { code: 'FETCH_ERROR', message: 'Endpoint fetch failed without exposing upstream payloads.' };
}

async function probeEndpoint(endpoint, options) {
  const fetchImpl = options.fetchImpl;
  const timeoutMs = options.timeoutMs;
  const includeSafeSummary = options.includeSafeSummary === true;
  const nowMs = options.nowMs;
  const started = nowMs();
  const controller = new AbortController();
  let timer;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new TimeoutError());
      }, timeoutMs);
    });
    const response = await Promise.race([
      fetchImpl(endpoint.url, {
        method: endpoint.method,
        redirect: 'manual',
        signal: controller.signal,
      }),
      timeout,
    ]);
    const latencyMs = Math.max(0, Math.round(nowMs() - started));
    const statusCode = Number(response?.status ?? 0);
    const ok = endpoint.expected_status.includes(statusCode);
    const result = {
      name: endpoint.name,
      url: endpoint.url,
      method: endpoint.method,
      expected_status: endpoint.expected_status,
      ok,
      status: ok ? 'ok' : 'http_error',
      http_status: Number.isInteger(statusCode) ? statusCode : null,
      latency_ms: latencyMs,
    };
    if (includeSafeSummary) result.safe_summary = await buildSafeSummary(response);
    return result;
  } catch (error) {
    return {
      name: endpoint.name,
      url: endpoint.url,
      method: endpoint.method,
      expected_status: endpoint.expected_status,
      ok: false,
      status: error instanceof TimeoutError || error?.name === 'AbortError' ? 'timeout' : 'network_error',
      http_status: null,
      latency_ms: Math.max(0, Math.round(nowMs() - started)),
      error: publicSafeError(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

function summarize(results) {
  const total = results.length;
  const passed = results.filter((result) => result.ok === true && result.status !== 'skipped').length;
  const skipped = results.filter((result) => result.status === 'skipped').length;
  const failed = results.filter((result) => result.ok !== true && result.status !== 'skipped').length;
  return {
    ok: failed === 0,
    total,
    passed,
    failed,
    skipped,
  };
}

export function assertPublicSafeMonitorJson(value) {
  const json = JSON.stringify(value);
  if (SECRET_VALUE_RE.test(json)) throw new Error('live endpoint monitor output appears to contain secret-like data');
  if (/response_body|raw_body|set-cookie|authorization/iu.test(json)) throw new Error('live endpoint monitor output contains disallowed response detail');
  return value;
}

export async function monitorLiveEndpoints(input = {}) {
  const endpoints = normalizeEndpoints(input.endpoints ?? DEFAULT_LIVE_ENDPOINTS);
  const timeoutMs = toPositiveInteger(input.timeout_ms ?? input.timeoutMs ?? DEFAULT_TIMEOUT_MS, 'timeout_ms', MAX_TIMEOUT_MS);
  const generatedAt = input.generated_at ?? input.generatedAt ?? new Date().toISOString();
  const includeSafeSummary = input.include_safe_summary === true || input.includeSafeSummary === true;
  const dryRun = input.dry_run === true || input.dryRun === true;
  const nowMs = typeof input.nowMs === 'function' ? input.nowMs : () => performance.now();
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;

  let results;
  if (dryRun) {
    results = endpoints.map((endpoint) => ({
      name: endpoint.name,
      url: endpoint.url,
      method: endpoint.method,
      expected_status: endpoint.expected_status,
      ok: true,
      status: 'skipped',
      http_status: null,
      latency_ms: 0,
    }));
  } else {
    if (typeof fetchImpl !== 'function') throw new UsageError('fetch is not available; provide fetchImpl or run on Node with global fetch');
    results = await Promise.all(endpoints.map((endpoint) => probeEndpoint(endpoint, { fetchImpl, timeoutMs, includeSafeSummary, nowMs })));
  }

  const packet = {
    schema: LIVE_ENDPOINT_MONITOR_SCHEMA,
    generated_at: generatedAt,
    dry_run: dryRun,
    timeout_ms: timeoutMs,
    include_safe_summary: includeSafeSummary,
    summary: summarize(results),
    results,
    claim_boundary: [
      'This packet is point-in-time synthetic monitoring evidence only.',
      'It does not prove provider deletion, model forgetting, compliance certification, or future availability.',
      'It contains no response bodies, account identifiers, credential values, cookies, prompts, memory payloads, or provider payloads.',
    ],
  };
  return assertPublicSafeMonitorJson(packet);
}

function parseEndpointSpec(value) {
  const separator = value.indexOf('=');
  if (separator <= 0 || separator === value.length - 1) throw new UsageError('--endpoint must be name=https://host/path');
  return { name: value.slice(0, separator), url: value.slice(separator + 1) };
}

function parseArgs(argv) {
  const out = {
    endpoints: [],
    config: null,
    out: null,
    timeout_ms: null,
    include_safe_summary: false,
    dry_run: false,
  };
  for (let index = 0; index < argv.length;) {
    const token = argv[index];
    if (token === '--help' || token === '-h') return { help: true };
    if (token === '--dry-run') {
      out.dry_run = true;
      index += 1;
      continue;
    }
    if (token === '--safe-summary') {
      out.include_safe_summary = true;
      index += 1;
      continue;
    }
    const readValue = (name) => {
      if (index + 1 >= argv.length || argv[index + 1].startsWith('--')) throw new UsageError(`${name} requires a value`);
      const value = argv[index + 1];
      index += 2;
      return value;
    };
    if (token === '--endpoint') out.endpoints.push(parseEndpointSpec(readValue(token)));
    else if (token === '--config') out.config = readValue(token);
    else if (token === '--out') out.out = readValue(token);
    else if (token === '--timeout-ms') out.timeout_ms = toPositiveInteger(readValue(token), token, MAX_TIMEOUT_MS);
    else throw new UsageError(`unknown option ${token}`);
  }
  return out;
}

function usage() {
  return `Usage: node scripts/monitor-live-endpoints.mjs [options]\n\nOptions:\n  --dry-run                       Validate the endpoint set and emit skipped results without network probes.\n  --endpoint <name=https://url>   Override defaults; repeat for multiple endpoints. HTTPS only; no query, fragment, or credentials.\n  --config <file>                 Read JSON with {"endpoints":[...],"timeout_ms":5000}.\n  --timeout-ms <ms>               Per-endpoint timeout, 1-${MAX_TIMEOUT_MS}. Default: ${DEFAULT_TIMEOUT_MS}.\n  --safe-summary                  Include a sanitized JSON response summary; never includes raw response bodies.\n  --out <file>                    Write the same public-safe JSON packet to a file.\n  --help                          Print this help.\n\nDefaults: public site, relay /readyz, and gateway /readyz. The script performs no mutations.\nUse --dry-run for repository evidence that must not probe live endpoints.\n`;
}

async function loadConfig(path) {
  const parsed = JSON.parse(await readFile(path, 'utf8'));
  if (!isPlainObject(parsed)) throw new UsageError('--config must point to a JSON object');
  return parsed;
}

export async function runCli(argv = process.argv.slice(2), options = {}) {
  const parsed = parseArgs(argv);
  if (parsed.help) return { text: usage() };
  const config = parsed.config ? await loadConfig(parsed.config) : {};
  const endpoints = parsed.endpoints.length > 0 ? parsed.endpoints : config.endpoints;
  const packet = await monitorLiveEndpoints({
    endpoints: endpoints ?? DEFAULT_LIVE_ENDPOINTS,
    timeout_ms: parsed.timeout_ms ?? config.timeout_ms,
    include_safe_summary: parsed.include_safe_summary || config.include_safe_summary === true,
    dry_run: parsed.dry_run || config.dry_run === true,
    generated_at: options.generated_at ?? options.generatedAt,
    fetchImpl: options.fetchImpl,
    nowMs: options.nowMs,
  });
  const json = `${JSON.stringify(packet, null, 2)}\n`;
  if (parsed.out) {
    const outPath = resolve(parsed.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, json, 'utf8');
  }
  return { json: packet };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await runCli();
    if (result.text) process.stdout.write(result.text);
    else process.stdout.write(`${JSON.stringify(result.json, null, 2)}\n`);
  } catch (error) {
    const message = error instanceof UsageError ? error.message : 'Live endpoint monitor failed without exposing upstream payloads.';
    process.stdout.write(`${JSON.stringify({ schema: LIVE_ENDPOINT_MONITOR_SCHEMA, ok: false, error: { code: error instanceof UsageError ? 'USAGE_ERROR' : 'MONITOR_ERROR', message } }, null, 2)}\n`);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  }
}
