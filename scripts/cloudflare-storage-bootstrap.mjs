#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyCloudflareSecretEnvFileFromArgv } from './cloudflare-secret-env.mjs';

export const CLOUDFLARE_STORAGE_BOOTSTRAP_SCHEMA = 'enigma.cloudflare_storage_bootstrap.v1';

const STORAGE_RESOURCES = Object.freeze([
  Object.freeze({ kind: 'd1_database', name: 'enigma-memory-production-ledger', purpose: 'durable ledger candidate for memory receipts, metering receipts, and settlement receipts' }),
  Object.freeze({ kind: 'kv_namespace', name: 'enigma-memory-production-relay-audit', purpose: 'relay audit/checkpoint namespace candidate; not raw-memory storage' }),
  Object.freeze({ kind: 'kv_namespace', name: 'enigma-memory-production-gateway-audit', purpose: 'gateway audit/checkpoint namespace candidate; not raw-memory storage' }),
]);

function resourceRef(resource) {
  if (resource.kind === 'd1_database') return `cloudflare-d1://${resource.name}`;
  if (resource.kind === 'kv_namespace') return `cloudflare-kv://${resource.name}`;
  return `cloudflare-storage://${resource.name}`;
}

function requireCredential(value, name) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${name} is required`);
  return value.trim();
}

async function cloudflareJson(fetchImpl, url, init = {}) {
  const response = await fetchImpl(url, init);
  const payload = await response.json();
  if (!response.ok || payload.success !== true) {
    const errors = (payload.errors ?? []).map((error) => ({ code: error.code ?? null, message: String(error.message ?? 'Cloudflare API error').slice(0, 160) }));
    const error = new Error(`Cloudflare API request failed: ${response.status}`);
    error.status = response.status;
    error.errors = errors;
    throw error;
  }
  return payload;
}

async function listAllKvNamespaces({ fetchImpl, accountId, headers }) {
  const namespaces = [];
  let page = 1;
  while (page < 20) {
    const payload = await cloudflareJson(fetchImpl, `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces?per_page=100&page=${page}`, { headers });
    namespaces.push(...(Array.isArray(payload.result) ? payload.result : []));
    const info = payload.result_info ?? {};
    if (!info.total_pages || page >= info.total_pages) break;
    page += 1;
  }
  return namespaces;
}

async function listAllD1Databases({ fetchImpl, accountId, headers }) {
  const databases = [];
  let page = 1;
  while (page < 20) {
    const payload = await cloudflareJson(fetchImpl, `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database?per_page=100&page=${page}`, { headers });
    databases.push(...(Array.isArray(payload.result) ? payload.result : []));
    const info = payload.result_info ?? {};
    if (!info.total_pages || page >= info.total_pages) break;
    page += 1;
  }
  return databases;
}

async function createKvNamespace({ fetchImpl, accountId, headers, title }) {
  const payload = await cloudflareJson(fetchImpl, `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ title }),
  });
  return payload.result ?? {};
}

async function createD1Database({ fetchImpl, accountId, headers, name }) {
  const payload = await cloudflareJson(fetchImpl, `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name }),
  });
  return payload.result ?? {};
}

function summarizeResource(resource, existing, created, error = null) {
  return {
    kind: resource.kind,
    name: resource.name,
    ref: resourceRef(resource),
    purpose: resource.purpose,
    observed: Boolean(existing || created),
    created: Boolean(created),
    planned_only: !existing && !created && !error,
    id_redacted: Boolean(existing?.id || existing?.uuid || created?.id || created?.uuid),
    error: error ? { status: error.status ?? null, errors: error.errors ?? [{ code: null, message: String(error.message ?? error).slice(0, 160) }] } : null,
  };
}

export async function bootstrapCloudflareStorage(options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const execute = options.execute === true;
  const apiToken = requireCredential(options.apiToken, 'CLOUDFLARE_API_TOKEN');
  const accountId = requireCredential(options.accountId, 'CLOUDFLARE_ACCOUNT_ID');
  const headers = { authorization: `Bearer ${apiToken}`, 'content-type': 'application/json' };
  const generatedAt = options.generated_at ?? options.generatedAt ?? new Date().toISOString();
  const resources = [];
  const blockers = [];

  const [kvNamespaces, d1Databases] = await Promise.all([
    listAllKvNamespaces({ fetchImpl, accountId, headers }),
    listAllD1Databases({ fetchImpl, accountId, headers }),
  ]);
  const kvByTitle = new Map(kvNamespaces.map((namespace) => [namespace.title ?? namespace.name, namespace]));
  const d1ByName = new Map(d1Databases.map((database) => [database.name, database]));

  for (const resource of STORAGE_RESOURCES) {
    try {
      const existing = resource.kind === 'kv_namespace' ? kvByTitle.get(resource.name) : d1ByName.get(resource.name);
      if (existing) {
        resources.push(summarizeResource(resource, existing, null));
        continue;
      }
      if (!execute) {
        resources.push(summarizeResource(resource, null, null));
        blockers.push(`${resource.kind}:${resource.name}: planned only; rerun with --execute to create`);
        continue;
      }
      const created = resource.kind === 'kv_namespace'
        ? await createKvNamespace({ fetchImpl, accountId, headers, title: resource.name })
        : await createD1Database({ fetchImpl, accountId, headers, name: resource.name });
      resources.push(summarizeResource(resource, null, created));
    } catch (error) {
      resources.push(summarizeResource(resource, null, null, error));
      blockers.push(`${resource.kind}:${resource.name}: ${error.message ?? String(error)}`);
    }
  }

  const observedCount = resources.filter((resource) => resource.observed).length;
  const createdCount = resources.filter((resource) => resource.created).length;
  return {
    schema: CLOUDFLARE_STORAGE_BOOTSTRAP_SCHEMA,
    generated_at: generatedAt,
    ok: blockers.length === 0,
    execute,
    status: blockers.length === 0 ? 'accepted' : (execute ? 'blocked' : 'planned'),
    launch_ready: false,
    hosted_backend_live_ready: false,
    resource_count: resources.length,
    observed_resource_count: observedCount,
    created_resource_count: createdCount,
    resources,
    blockers,
    cost_boundary: 'Uses Cloudflare account primitives only; verify billing in the Cloudflare dashboard before production scale.',
    claim_boundary: [
      'This artifact can prove Cloudflare storage resources exist or are planned; it does not bind them to relay/gateway code by itself.',
      'Storage existence is not hosted backend readiness until runtime bindings, backup/restore, KMS, SIEM/log sink, monitoring, operator acceptance, and hosted-live validation pass.',
      'Token values, account ids, database ids, namespace ids, raw memory, prompts, transcripts, provider responses, and private keys are never printed.',
    ],
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = { output: null, execute: false, stripped: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out') out.output = argv[++index];
    else if (arg === '--execute') out.execute = true;
    else if (arg === '--help') out.help = true;
    else {
      out.stripped.push(arg);
      if (arg === '--cloudflare-env-file') out.stripped.push(argv[++index]);
      else throw new Error(`unknown argument ${arg}`);
    }
  }
  return out;
}

function usage() {
  return 'Usage: node scripts/cloudflare-storage-bootstrap.mjs [--cloudflare-env-file <file>] [--execute] [--out storage-bootstrap.json]\n\nInspects or creates public-safe Cloudflare D1/KV storage bootstrap resources for Enigma. Dry-run by default; prints no token, account id, database id, or namespace id.\n';
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  const secretEnv = await applyCloudflareSecretEnvFileFromArgv(args.stripped, process.env, { includePath: false });
  const result = await bootstrapCloudflareStorage({
    apiToken: secretEnv.env.CLOUDFLARE_API_TOKEN,
    accountId: secretEnv.env.CLOUDFLARE_ACCOUNT_ID,
    execute: args.execute,
  });
  if (args.output) await writeFile(resolve(args.output), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ ok: result.ok, schema: result.schema, status: result.status, execute: result.execute, resource_count: result.resource_count, observed_resource_count: result.observed_resource_count, created_resource_count: result.created_resource_count, blocker_count: result.blockers.length, out: args.output ? '<cloudflare-storage-bootstrap-output>' : null, tokenPrinted: false, accountIdPrinted: false }, null, 2)}\n`);
  if (!result.ok) process.exitCode = args.execute ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${error?.message ?? String(error)}\n`);
    process.exitCode = 1;
  });
}
