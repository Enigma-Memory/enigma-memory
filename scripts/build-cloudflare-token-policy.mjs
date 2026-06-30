#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildCloudflareRequestPlan } from './cloudflare-ops.mjs';

export const CLOUDFLARE_TOKEN_POLICY_SCHEMA = 'enigma.cloudflare_token_policy.v1';

const SECRET_OUTPUT_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|cf-[A-Za-z0-9_-]{12,})/iu;
const MODES = Object.freeze(['pages-deploy', 'pages-observe', 'domain-registrar', 'hosted-probe', 'all']);

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

function requireText(name, value) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new UsageError(`${name} is required`);
  return value.trim();
}

function optionalText(value, fallback = null) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function parseArgs(argv) {
  const out = {
    mode: 'pages-deploy',
    accountId: '<cloudflare-account-id>',
    projectName: 'enigma-memory',
    domain: 'enigmamemory.com',
    out: null,
    plain: false,
  };
  for (let index = 0; index < argv.length;) {
    const token = argv[index];
    if (token === '--help') return { help: true };
    const readValue = (name) => {
      if (index + 1 >= argv.length || argv[index + 1].startsWith('--')) throw new UsageError(`${name} requires a value`);
      const value = argv[index + 1];
      index += 2;
      return value;
    };
    if (token === '--mode') out.mode = readValue(token);
    else if (token === '--account-id') out.accountId = readValue(token);
    else if (token === '--project-name') out.projectName = readValue(token);
    else if (token === '--domain') out.domain = readValue(token);
    else if (token === '--out') out.out = readValue(token);
    else if (token === '--plain' || token === '--text' || token === '--format=text' || (token === '--format' && argv[index + 1] === 'text')) {
      out.plain = true;
      if (token === '--format') index += 1;
      index += 1;
    }
    else throw new UsageError(`unknown option ${token}`);
  }
  return out;
}

function usage() {
  return `Usage: node scripts/build-cloudflare-token-policy.mjs [options]\n\nOptions:\n  --mode <pages-deploy|pages-observe|domain-registrar|hosted-probe|all>  Default: pages-deploy.\n  --account-id <id>                                                     Account scope placeholder/default.\n  --project-name <name>                                                 Pages project. Default: enigma-memory.\n  --domain <host>                                                       Domain. Default: enigmamemory.com.\n  --out <file>                                                          Write JSON evidence.\n  --plain                                                               Print a human-readable token policy summary.\n\nThis prints a public-safe API-token policy packet for the Cloudflare dashboard.\nIt lists intended permission groups and endpoints only; it never prints token values.\n`;
}

function permission(id, product, permission_name, access, resource, reason) {
  return { id, product, permission_name, access, resource, reason, operator_must_map_to_permission_group_id: true };
}

function includeMode(mode, candidate) {
  return mode === 'all' || mode === candidate;
}

function plannedApiCalls({ mode, accountId, projectName, domain }) {
  const calls = [];
  calls.push(buildCloudflareRequestPlan({ operation: 'token.verify', accountId }));
  if (includeMode(mode, 'pages-observe') || includeMode(mode, 'pages-deploy')) {
    calls.push(buildCloudflareRequestPlan({ operation: 'pages.project', accountId, projectName }));
  }
  if (includeMode(mode, 'domain-registrar')) {
    calls.push(buildCloudflareRequestPlan({ operation: 'registrar.search', accountId, query: domain, limit: 5 }));
    calls.push(buildCloudflareRequestPlan({ operation: 'registrar.check', accountId, domain }));
    calls.push(buildCloudflareRequestPlan({ operation: 'registrar.register', accountId, domain }));
    calls.push(buildCloudflareRequestPlan({ operation: 'registrar.registration-status', accountId, domain }));
  }
  if (includeMode(mode, 'hosted-probe')) {
    for (const service of ['enigma-hosted-probe', 'enigma-relay', 'enigma-gateway']) {
      calls.push({
        operation: 'workers.service.upsert',
        method: 'PUT',
        path: `/client/v4/accounts/${accountId}/workers/services/${service}`,
        requires_token: true,
        token_printed: false,
        billable: false,
      });
    }
    calls.push({
      operation: 'workers.custom-domains.attach',
      method: 'PUT',
      path: `/client/v4/accounts/${accountId}/workers/domains`,
      requires_token: true,
      token_printed: false,
      billable: false,
    });
    calls.push({
      operation: 'workers.custom-domains.list',
      method: 'GET',
      path: `/client/v4/accounts/${accountId}/workers/domains`,
      requires_token: true,
      token_printed: false,
      billable: false,
    });
  }
  return calls.map((call) => ({
    operation: call.operation,
    method: call.method,
    path: call.path ?? new URL(call.url).pathname,
    requires_token: call.requires_token ?? call.requiresToken === true,
    token_printed: call.token_printed ?? call.tokenPrinted === true,
    billable: call.billable === true,
  }));
}

function permissionPolicy({ mode, accountId, projectName, domain }) {
  const permissions = [
    permission('token_verify', 'User/API Tokens', 'API Tokens Read', 'read', 'own token', 'Verify the token without exposing its value.'),
  ];
  if (includeMode(mode, 'pages-observe')) {
    permissions.push(
      permission('account_read', 'Account', 'Account Settings Read', 'read', `account:${accountId}`, 'Confirm account/project ownership.'),
      permission('pages_read', 'Cloudflare Pages', 'Cloudflare Pages Read', 'read', `account:${accountId}/pages/${projectName}`, 'Observe Pages project and custom-domain state.')
    );
  }
  if (includeMode(mode, 'pages-deploy')) {
    permissions.push(
      permission('account_read', 'Account', 'Account Settings Read', 'read', `account:${accountId}`, 'Confirm account/project ownership.'),
      permission('pages_edit', 'Cloudflare Pages', 'Cloudflare Pages Edit', 'edit', `account:${accountId}/pages/${projectName}`, 'Deploy the preflighted static artifact to Pages.')
    );
  }
  if (includeMode(mode, 'domain-registrar')) {
    permissions.push(
      permission('registrar_read', 'Registrar', 'Registrar Read', 'read', `account:${accountId}/registrar/${domain}`, 'Search/check domain and read registration status.'),
      permission('registrar_edit', 'Registrar', 'Registrar Edit', 'edit', `account:${accountId}/registrar/${domain}`, 'Register the exact confirmed domain after explicit charge acknowledgement.')
    );
  }
  if (includeMode(mode, 'hosted-probe')) {
    permissions.push(
      permission('workers_scripts_read', 'Workers Scripts', 'Workers Scripts Read', 'read', `account:${accountId}/workers/enigma-hosted-probe,enigma-relay,enigma-gateway`, 'Observe hosted probe and relay/gateway Worker services before/after deploy.'),
      permission('workers_scripts_edit', 'Workers Scripts', 'Workers Scripts Edit', 'edit', `account:${accountId}/workers/enigma-hosted-probe,enigma-relay,enigma-gateway`, 'Deploy the hosted probe plus relay/gateway /livez and fail-closed /readyz Workers.'),
      permission('workers_routes_edit', 'Workers Routes', 'Workers Routes Edit', 'edit', `zone:${domain}/workers/custom-domains`, 'Attach relay.enigmamemory.com and gateway.enigmamemory.com as Workers Custom Domains without printing token values.')
    );
  }
  const unique = new Map();
  for (const item of permissions) unique.set(`${item.permission_name}:${item.access}:${item.resource}`, item);
  return [...unique.values()];
}

function environmentContract({ mode }) {
  const env = [
    { name: 'CLOUDFLARE_API_TOKEN', secret: true, required: true, handling: 'Store in a secret manager or process environment only; never paste into chat, docs, or repo files.' },
    { name: 'CLOUDFLARE_ACCOUNT_ID', secret: false, required: true, handling: 'Account id is not a token but still belongs in operator config, not public marketing collateral.' },
  ];
  if (includeMode(mode, 'domain-registrar')) {
    env.push({ name: 'REGISTRANT_CONTACT_JSON', secret: true, required: 'only for registration execution', handling: 'One-use local file; never commit. Command output redacts contact body fields.' });
  }
  return env;
}

export function buildCloudflareTokenPolicy(input = {}) {
  const mode = requireText('--mode', input.mode ?? 'pages-deploy');
  if (!MODES.includes(mode)) throw new UsageError(`--mode must be one of ${MODES.join(', ')}`);
  const accountId = optionalText(input.accountId, '<cloudflare-account-id>');
  const projectName = optionalText(input.projectName, 'enigma-memory');
  const domain = optionalText(input.domain, 'enigmamemory.com');
  const verificationCommands = [
    'npm run cloudflare:ops -- token verify --account-id <account-id>',
    'npm run cloudflare:pages:stage',
    'npm run cloudflare:pages:packet -- --site .enigma/cloudflare-pages/enigmamemory.com --project-name enigma-memory --domain enigmamemory.com --live-url https://enigmamemory.com/ --expect-title "Enigma"',
    'npm run cloudflare:pages:dry-run',
    'npm run cloudflare:pages:deploy',
    'npm run cloudflare:ops -- --cloudflare-env-file <local-secret-file> pages verify --url https://enigmamemory.com/ --project-name enigma-memory --domain enigmamemory.com --cloudflare-live required',
    'npm run production:handoff -- --site .enigma/cloudflare-pages/enigmamemory.com --project-name enigma-memory --domain enigmamemory.com --live-url https://enigmamemory.com/ --expect-title "Enigma"',
  ];
  if (includeMode(mode, 'hosted-probe')) {
    verificationCommands.splice(1, 0, 'npm run cloudflare:ops -- workers inspect-probe --name enigma-hosted-probe');
    verificationCommands.splice(2, 0, 'npm run production:edge-backend -- --out-dir .enigma/edge-backend-workers --domain enigmamemory.com');
  }
  return {
    schema: CLOUDFLARE_TOKEN_POLICY_SCHEMA,
    generated_at: input.generated_at ?? input.generatedAt ?? new Date().toISOString(),
    mode,
    target: {
      account_id: accountId,
      pages_project: projectName,
      domain,
    },
    credential_contract: environmentContract({ mode }),
    permission_groups: permissionPolicy({ mode, accountId, projectName, domain }),
    planned_api_calls: plannedApiCalls({ mode, accountId, projectName, domain }),
    mutation_boundaries: {
      pages_deploy_requires_execute: true,
      registrar_register_requires_execute: true,
      workers_deploy_probe_requires_execute: true,
      registrar_register_requires_charge_acknowledgement: true,
      registrar_register_requires_fresh_price_check: true,
      token_value_printed: false,
      personal_contact_printed: false,
    },
    dashboard_steps: [
      'Cloudflare Dashboard -> My Profile -> API Tokens -> Create Token -> Custom token.',
      'Set account scope to the target account only; do not grant all accounts unless an operator explicitly approves it.',
      'Map each listed permission name to Cloudflare permission-group IDs shown by the dashboard or /user/tokens/permission_groups.',
      'Copy the token directly into a secret manager or process environment as CLOUDFLARE_API_TOKEN; do not paste it into chat.',
      'Run token verify, then the dry-run packet, then execute deploy only after local site preflight/security gates pass.',
    ],
    verification_commands: verificationCommands,
    claim_boundary: [
      'This packet is a least-privilege Cloudflare token policy, not an API token and not proof a token exists.',
      'Permission display names must be mapped to Cloudflare permission_group IDs in the logged-in dashboard or API response.',
      'Pages deployment and domain registration remain dry-run unless --execute and all explicit safety confirmations are supplied.',
      'Worker probe deployment remains dry-run unless --execute is supplied; token policy generation never deploys a Worker.',
    ],
  };
}

export function renderCloudflareTokenPolicyPlain(policy) {
  const lines = [
    'Enigma Cloudflare token policy',
    'Status: Ready',
    `Mode: ${policy.mode ?? '<mode>'}`,
    `Project: ${policy.target?.pages_project ?? '<project>'}`,
    `Domain: ${policy.target?.domain ?? '<domain>'}`,
    `Permission groups: ${Array.isArray(policy.permission_groups) ? policy.permission_groups.length : 0}`,
    `Planned API calls: ${Array.isArray(policy.planned_api_calls) ? policy.planned_api_calls.length : 0}`,
    `Token value printed: ${policy.mutation_boundaries?.token_value_printed ? 'yes' : 'no'}`,
    `Personal contact printed: ${policy.mutation_boundaries?.personal_contact_printed ? 'yes' : 'no'}`,
  ];
  for (const permissionItem of (Array.isArray(policy.permission_groups) ? policy.permission_groups.slice(0, 6) : [])) lines.push(`Permission: ${permissionItem.permission_name} — ${permissionItem.access}`);
  for (const command of (Array.isArray(policy.verification_commands) ? policy.verification_commands.slice(0, 5) : [])) lines.push(`Next: ${command}`);
  lines.push('Boundary: public-safe Cloudflare token policy only; no API token, credentials, account ids, local paths, contact data, deploy, domain purchase, Worker deploy, raw memory, prompts, transcripts, provider responses, provider deletion, model behavior, hosted-service certification, compliance, benchmark superiority, token ROI, or provider invoice savings claims.');
  return `${lines.join('\n')}\n`;
}


export async function runCli(argv = process.argv.slice(2), options = {}) {
  const parsed = parseArgs(argv);
  if (parsed.help) return { text: usage() };
  const packet = buildCloudflareTokenPolicy({ ...parsed, generated_at: options.generated_at ?? options.generatedAt });
  const json = `${JSON.stringify(packet, null, 2)}\n`;
  if (SECRET_OUTPUT_RE.test(json)) throw new Error('Cloudflare token policy output appears to contain a secret');
  if (parsed.out) {
    const outPath = resolve(parsed.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, json, 'utf8');
  }
  return parsed.plain ? { text: renderCloudflareTokenPolicyPlain(packet), json: packet } : { json: packet };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await runCli();
    if (result.text) process.stdout.write(result.text);
    else process.stdout.write(`${JSON.stringify(result.json, null, 2)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(`${JSON.stringify({ schema: CLOUDFLARE_TOKEN_POLICY_SCHEMA, ok: false, error: { code: error instanceof UsageError ? 'USAGE_ERROR' : 'TOKEN_POLICY_ERROR', message } }, null, 2)}\n`);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  }
}
