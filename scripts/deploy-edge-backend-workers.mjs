#!/usr/bin/env node
import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile as execFileCallback, spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { applyCloudflareSecretEnvFileFromArgv } from './cloudflare-secret-env.mjs';
import { EDGE_BACKEND_REF_ENV_NAMES } from './build-edge-backend-workers.mjs';

const execFile = promisify(execFileCallback);
export const EDGE_BACKEND_DEPLOYMENT_SCHEMA = 'enigma.edge_backend_deployment.v1';

const SERVICES = Object.freeze([
  Object.freeze({ kind: 'relay', workerName: 'enigma-relay', hostname: 'relay.enigmamemory.com', kvBinding: 'ENIGMA_RELAY_AUDIT_KV', kvResourceName: 'enigma-memory-production-relay-audit' }),
  Object.freeze({ kind: 'gateway', workerName: 'enigma-gateway', hostname: 'gateway.enigmamemory.com', kvBinding: 'ENIGMA_GATEWAY_AUDIT_KV', kvResourceName: 'enigma-memory-production-gateway-audit' }),
]);
const LEDGER_DATABASE_NAME = 'enigma-memory-production-ledger';
const SECRET_NAMES = Object.freeze(['ENIGMA_BOOTSTRAP_SECRET_SENTINEL', 'ENIGMA_READINESS_HMAC_KEY']);
const COMPATIBILITY_DATE = '2026-06-24';

function sha256(text) {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

export function sanitizeDeployOutput(text) {
  return String(text ?? '')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/giu, 'Bearer <redacted>')
    .replace(/CLOUDFLARE_API_TOKEN=[^\s]+/giu, 'CLOUDFLARE_API_TOKEN=<redacted>')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu, '<uuid>')
    .replace(/[A-Fa-f0-9]{16,}/g, '<hex>')
    .replace(/https:\/\/([a-z0-9-]+)\.[a-z0-9-]+\.workers\.dev/giu, 'https://$1.<workers-subdomain>.workers.dev');
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

function varsToml(publicVars = {}) {
  const entries = Object.entries(publicVars).filter(([, value]) => typeof value === 'string' && value.trim().length > 0);
  if (entries.length === 0) return '';
  return `[vars]\n${entries.map(([key, value]) => `${key} = ${tomlString(value)}`).join('\n')}\n\n`;
}

export function publicVarsFromRefs(refs = {}, options = {}) {
  const vars = {};
  for (const [refKey, envNames] of Object.entries(EDGE_BACKEND_REF_ENV_NAMES)) {
    const value = refs[refKey];
    if (typeof value === 'string' && value.trim().length > 0) vars[envNames[0]] = value.trim();
  }
  if (options.operatorDecision) vars.ENIGMA_OPERATOR_ACCEPTANCE_DECISION = String(options.operatorDecision);
  return vars;
}


export function edgeWorkerWranglerToml({ service, ledgerDatabaseId, kvNamespaceId, publicVars = {} }) {
  if (!service) throw new Error('service is required');
  if (!ledgerDatabaseId) throw new Error('ledger database id is required');
  if (!kvNamespaceId) throw new Error('KV namespace id is required');
  return `name = "${service.workerName}"
main = "worker.mjs"
compatibility_date = "${COMPATIBILITY_DATE}"
workers_dev = false
routes = [{ pattern = "${service.hostname}", custom_domain = true }]
${varsToml(publicVars)}

[[d1_databases]]
binding = "ENIGMA_LEDGER_DB"
database_name = "${LEDGER_DATABASE_NAME}"
database_id = "${ledgerDatabaseId}"

[[kv_namespaces]]
binding = "${service.kvBinding}"
id = "${kvNamespaceId}"

[observability]
enabled = false
`;
}

async function cloudflareJson(fetchImpl, url, init = {}) {
  const response = await fetchImpl(url, init);
  const payload = await response.json();
  if (!response.ok || payload.success !== true) {
    const error = new Error(`Cloudflare API request failed: ${response.status}`);
    error.status = response.status;
    error.cloudflare_errors = (payload.errors ?? []).map((item) => ({ code: item.code ?? null, message: String(item.message ?? 'Cloudflare API error').slice(0, 160) }));
    throw error;
  }
  return payload;
}

function requireCredential(value, name) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${name} is required`);
  return value.trim();
}

async function listCloudflareResources({ fetchImpl, apiToken, accountId }) {
  const headers = { authorization: `Bearer ${apiToken}`, 'content-type': 'application/json' };
  const [kvPayload, d1Payload] = await Promise.all([
    cloudflareJson(fetchImpl, `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces?per_page=100`, { headers }),
    cloudflareJson(fetchImpl, `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database?per_page=100`, { headers }),
  ]);
  const kvByTitle = new Map((Array.isArray(kvPayload.result) ? kvPayload.result : []).map((namespace) => [namespace.title ?? namespace.name, namespace]));
  const d1ByName = new Map((Array.isArray(d1Payload.result) ? d1Payload.result : []).map((database) => [database.name, database]));
  return { kvByTitle, d1ByName };
}

function findNpmExecCommand() {
  const npmExecPath = [process.env.npm_execpath || null, join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')].find((candidate) => candidate && existsSync(candidate));
  if (npmExecPath) return { command: process.execPath, prefix: [npmExecPath, 'exec', '--'], shell: false };
  return { command: process.platform === 'win32' ? 'npx.cmd' : 'npx', prefix: [], shell: process.platform === 'win32' };
}

async function defaultSecretPut({ command, prefix, shell, env, workerName, secretName, secretValue }) {
  const args = [...prefix, 'wrangler', 'secret', 'put', secretName, '--name', workerName];
  return await new Promise((resolveSecret, reject) => {
    const child = spawn(command, args, { shell, windowsHide: true, env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolveSecret({ stdout, stderr, status: code });
      else reject(Object.assign(new Error(`wrangler secret put failed with status ${code}`), { stdout, stderr, status: code }));
    });
    child.stdin.end(`${secretValue}\n`);
  });
}

function publicServiceSummary(service, resource, execute) {
  return {
    service: service.kind,
    worker_name: service.workerName,
    hostname: service.hostname,
    custom_domain: true,
    worker_source: `${service.kind}/worker.mjs`,
    deployed: execute === true,
    bindings: ['ENIGMA_LEDGER_DB', service.kvBinding],
    resources: [
      { kind: 'd1_database', name: LEDGER_DATABASE_NAME, observed: Boolean(resource.ledgerId), id_redacted: Boolean(resource.ledgerId) },
      { kind: 'kv_namespace', name: service.kvResourceName, observed: Boolean(resource.kvId), id_redacted: Boolean(resource.kvId) },
    ],
    secrets: SECRET_NAMES.map((name) => ({ name, provisioned: false, value_returned: false })),
    stdout_hash: null,
    stderr_hash: null,
  };
}

export async function deployEdgeBackendWorkers(options = {}) {
  const execute = options.execute === true;
  const provisionSecrets = options.provisionSecrets === true;
  const generatedAt = options.generated_at ?? options.generatedAt ?? new Date().toISOString();
  const sourceDir = resolve(options.sourceDir ?? '.enigma/edge-backend-workers-current');
  const cwd = resolve(options.cwd ?? process.cwd());
  const fetchImpl = options.fetchImpl ?? fetch;
  const execFileImpl = options.execFileImpl ?? execFile;
  const secretPutImpl = options.secretPutImpl ?? defaultSecretPut;
  const apiToken = requireCredential(options.apiToken, 'CLOUDFLARE_API_TOKEN');
  const accountId = requireCredential(options.accountId, 'CLOUDFLARE_ACCOUNT_ID');
  const publicVars = publicVarsFromRefs(options.refs ?? {}, { operatorDecision: options.operatorDecision });
  const publicVarCount = Object.keys(publicVars).length;
  const { kvByTitle, d1ByName } = await listCloudflareResources({ fetchImpl, apiToken, accountId });
  const ledger = d1ByName.get(LEDGER_DATABASE_NAME);
  const ledgerId = ledger?.uuid ?? ledger?.id ?? null;
  const blockers = [];
  if (!ledgerId) blockers.push(`${LEDGER_DATABASE_NAME} D1 database missing`);

  const { command, prefix, shell } = findNpmExecCommand();
  const services = [];
  const tempDir = await mkdtemp(join(tmpdir(), 'enigma-edge-deploy-'));
  try {
    for (const service of SERVICES) {
      const kv = kvByTitle.get(service.kvResourceName);
      const kvId = kv?.id ?? null;
      if (!kvId) blockers.push(`${service.kvResourceName} KV namespace missing`);
      const summary = publicServiceSummary(service, { ledgerId, kvId }, execute && Boolean(ledgerId && kvId));
      if (ledgerId && kvId && execute) {
        const serviceDir = join(tempDir, service.kind);
        const toml = edgeWorkerWranglerToml({ service, ledgerDatabaseId: ledgerId, kvNamespaceId: kvId, publicVars });
        await mkdir(serviceDir, { recursive: true });
        await copyFile(join(sourceDir, service.kind, 'worker.mjs'), join(serviceDir, 'worker.mjs'));
        await writeFile(join(serviceDir, 'wrangler.toml'), toml, 'utf8');
        const deploy = await execFileImpl(command, [...prefix, 'wrangler', 'deploy', '--config', join(serviceDir, 'wrangler.toml')], {
          cwd,
          shell,
          windowsHide: true,
          maxBuffer: 10 * 1024 * 1024,
          env: options.env ?? process.env,
        });
        const sanitizedStdout = sanitizeDeployOutput(deploy.stdout ?? '');
        const sanitizedStderr = sanitizeDeployOutput(deploy.stderr ?? '');
        summary.stdout_hash = sha256(sanitizedStdout);
        summary.stderr_hash = sha256(sanitizedStderr);
        if (provisionSecrets) {
          const secrets = [];
          for (const secretName of SECRET_NAMES) {
            const secretValue = `enigma-${service.kind}-${secretName.toLowerCase()}-${randomBytes(32).toString('hex')}`;
            const secret = await secretPutImpl({ command, prefix, shell, env: options.env ?? process.env, workerName: service.workerName, secretName, secretValue });
            const sanitizedSecretOutput = sanitizeDeployOutput(`${secret.stdout ?? ''}\n${secret.stderr ?? ''}`);
            secrets.push({ name: secretName, provisioned: true, value_returned: false, output_hash: sha256(sanitizedSecretOutput) });
          }
          summary.secrets = secrets;
        }
      }
      services.push(summary);
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }

  const ok = blockers.length === 0;
  return {
    schema: EDGE_BACKEND_DEPLOYMENT_SCHEMA,
    generated_at: generatedAt,
    ok,
    status: ok ? (execute ? 'deployed' : 'planned') : 'blocked',
    execute,
    provision_secrets: provisionSecrets,
    domain: 'enigmamemory.com',
    source_dir: '<edge-backend-workers-source>',
    service_count: services.length,
    services,
    public_var_count: publicVarCount,
    blockers,
    launch_ready: false,
    hosted_backend_live_ready: false,
    token_printed: false,
    account_id_printed: false,
    resource_ids_printed: false,
    secret_values_printed: false,
    cost_boundary: 'Uses already-owned Cloudflare Worker/D1/KV primitives; verify billing in Cloudflare before production traffic scale.',
    claim_boundary: [
      'This deploys or plans the relay/gateway edge bootstrap Workers with D1/KV bindings and optional generated Worker secrets.',
      'It does not make hosted_backend_live ready until /readyz has complete hosted refs and operator acceptance go.',
      'The artifact never includes Cloudflare token values, account ids, database ids, namespace ids, secret values, raw memory, prompts, transcripts, provider responses, or private keys.',
    ],
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = { stripped: [], sourceDir: '.enigma/edge-backend-workers-current', output: null, refsJson: null, operatorDecision: null, execute: false, provisionSecrets: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--source-dir') out.sourceDir = argv[++index];
    else if (arg === '--out') out.output = argv[++index];
    else if (arg === '--refs-json') out.refsJson = argv[++index];
    else if (arg === '--operator-decision') out.operatorDecision = argv[++index];
    else if (arg === '--execute') out.execute = true;
    else if (arg === '--provision-secrets') out.provisionSecrets = true;
    else if (arg === '--cloudflare-env-file') {
      out.stripped.push(arg, argv[++index]);
    } else if (arg === '--help') out.help = true;
    else throw new Error(`unknown argument ${arg}`);
  }
  return out;
}

function usage() {
  return 'Usage: node scripts/deploy-edge-backend-workers.mjs [--cloudflare-env-file <file>] [--source-dir .enigma/edge-backend-workers-current] [--refs-json hosted-refs.json --operator-decision go] [--execute] [--provision-secrets] [--out edge-backend-deploy.json]\n\nDeploys or plans relay/gateway Cloudflare edge bootstrap Workers with D1/KV bindings. Dry-run by default; prints no token, account id, resource id, or secret value.\n';
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  const secretEnv = await applyCloudflareSecretEnvFileFromArgv(args.stripped, process.env, { includePath: false });
  const refs = args.refsJson ? JSON.parse(await readFile(resolve(args.refsJson), 'utf8')) : {};
  const result = await deployEdgeBackendWorkers({
    apiToken: secretEnv.env.CLOUDFLARE_API_TOKEN,
    accountId: secretEnv.env.CLOUDFLARE_ACCOUNT_ID,
    execute: args.execute,
    provisionSecrets: args.provisionSecrets,
    sourceDir: args.sourceDir,
    refs,
    operatorDecision: args.operatorDecision,
    env: secretEnv.env,
  });
  if (args.output) await writeFile(resolve(args.output), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ ok: result.ok, schema: result.schema, status: result.status, execute: result.execute, provision_secrets: result.provision_secrets, service_count: result.service_count, blocker_count: result.blockers.length, out: args.output ? '<edge-backend-deploy-output>' : null, tokenPrinted: false, accountIdPrinted: false, resourceIdsPrinted: false, secretValuesPrinted: false }, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${error?.message ?? String(error)}\n`);
    process.exitCode = 1;
  });
}
