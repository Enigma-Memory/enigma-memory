#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CLOUDFLARE_TOKEN_REQUEST_SCHEMA = 'enigma.cloudflare_token_request.v1';

const SECRET_OUTPUT_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|cf-[A-Za-z0-9_-]{12,})/iu;
const MODES = Object.freeze(['pages-deploy', 'pages-observe', 'domain-registrar', 'hosted-probe', 'all']);
const ACCOUNT_SCOPE = 'com.cloudflare.api.account';
const ZONE_SCOPE = 'com.cloudflare.api.account.zone';
const USER_SCOPE = 'com.cloudflare.api.user';

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    mode: 'pages-deploy',
    accountId: null,
    userId: null,
    permissionGroups: null,
    projectName: 'enigma-memory',
    domain: 'enigmamemory.com',
    tokenName: 'enigma-memory-pages-deploy',
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
    else if (token === '--user-id') out.userId = readValue(token);
    else if (token === '--permission-groups') out.permissionGroups = readValue(token);
    else if (token === '--project-name') out.projectName = readValue(token);
    else if (token === '--domain') out.domain = readValue(token);
    else if (token === '--token-name') out.tokenName = readValue(token);
    else if (token === '--out') out.out = readValue(token);
    else if (token === '--plain' || token === '--text' || token === '--format=text' || (token === '--format' && argv[index + 1] === 'text')) {
      out.plain = true;
      index += token === '--format' ? 2 : 1;
    }
    else throw new UsageError(`unknown option ${token}`);
  }
  return out;
}

function usage() {
  return `Usage: node scripts/build-cloudflare-token-request.mjs --permission-groups <json> --account-id <id> [options]\n\nOptions:\n  --mode <pages-deploy|pages-observe|domain-registrar|hosted-probe|all>  Default: pages-deploy.\n  --project-name <name>                                                 Default: enigma-memory.\n  --domain <host>                                                       Default: enigmamemory.com.\n  --token-name <name>                                                   Default: enigma-memory-pages-deploy.\n  --user-id <id>                                                        Only needed if adding user-scoped permissions.\n  --out <file>                                                          Write JSON evidence.\n  --plain                                                               Print a human-readable token request summary.\n\nThis prints a public-safe API-token request body skeleton for the Cloudflare dashboard/API.\nIt lists matched permission group counts and boundaries only; it never creates a token or prints token values.\n`;
}

function requiredText(name, value) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new UsageError(`${name} is required`);
  return value.trim();
}

function normalize(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function includeMode(mode, candidate) {
  return mode === 'all' || mode === candidate;
}

function permissionSpecs(mode) {
  const specs = [];
  if (includeMode(mode, 'pages-observe') || includeMode(mode, 'pages-deploy')) {
    specs.push({
      key: 'account_read',
      access: 'read',
      product: 'Account',
      aliases: ['Account Settings Read', 'Account:Read', 'Account Read'],
      preferred_scope: ACCOUNT_SCOPE,
      reason: 'Confirm account/project ownership before deploy or verify.',
    });
    specs.push({
      key: 'pages_read',
      access: 'read',
      product: 'Cloudflare Pages',
      aliases: ['Cloudflare Pages Read', 'Pages Read'],
      preferred_scope: ACCOUNT_SCOPE,
      reason: 'Read Pages project/custom-domain state during verification.',
    });
  }
  if (includeMode(mode, 'pages-deploy')) {
    specs.push({
      key: 'pages_edit',
      access: 'edit',
      product: 'Cloudflare Pages',
      aliases: ['Cloudflare Pages Edit', 'Cloudflare Pages Write', 'Cloudflare Pages:Edit', 'Pages Edit', 'Pages Write'],
      preferred_scope: ACCOUNT_SCOPE,
      reason: 'Deploy the preflighted static artifact to Cloudflare Pages.',
    });
  }
  if (includeMode(mode, 'domain-registrar')) {
    specs.push({
      key: 'registrar_read',
      access: 'read',
      product: 'Registrar',
      aliases: ['Registrar Read', 'Domain Registration Read', 'Registrar Domains Read'],
      preferred_scope: ACCOUNT_SCOPE,
      reason: 'Search/check domain registration and read registration status.',
    });
    specs.push({
      key: 'registrar_edit',
      access: 'edit',
      product: 'Registrar',
      aliases: ['Registrar Edit', 'Registrar Write', 'Domain Registration Edit', 'Domain Registration Write', 'Registrar Domains Edit', 'Registrar Domains Write'],
      preferred_scope: ACCOUNT_SCOPE,
      reason: 'Register the exact confirmed domain only after charge acknowledgement.',
    });
  }
  if (includeMode(mode, 'hosted-probe')) {
    specs.push({
      key: 'workers_scripts_read',
      access: 'read',
      product: 'Workers Scripts',
      aliases: ['Workers Scripts Read', 'Workers Read', 'Cloudflare Workers Read', 'Workers Script Read'],
      preferred_scope: ACCOUNT_SCOPE,
      reason: 'Observe hosted probe and relay/gateway Worker services before/after deploy.',
    });
    specs.push({
      key: 'workers_scripts_edit',
      access: 'edit',
      product: 'Workers Scripts',
      aliases: ['Workers Scripts Edit', 'Workers Scripts Write', 'Workers Edit', 'Workers Write', 'Cloudflare Workers Edit', 'Cloudflare Workers Write', 'Workers Script Edit'],
      preferred_scope: ACCOUNT_SCOPE,
      reason: 'Deploy the hosted /livez and fail-closed /readyz probe plus relay/gateway edge Workers.',
    });
    specs.push({
      key: 'workers_routes_edit',
      access: 'edit',
      product: 'Workers Routes',
      aliases: ['Workers Routes Edit', 'Workers Routes Write', 'Cloudflare Workers Routes Edit', 'Workers Route Edit'],
      preferred_scope: ZONE_SCOPE,
      reason: 'Attach relay.enigmamemory.com and gateway.enigmamemory.com as Workers Custom Domains without exposing token values.',
    });
  }
  return specs;
}

function extractPermissionGroups(raw) {
  const parsed = Array.isArray(raw) ? raw : (Array.isArray(raw?.result) ? raw.result : raw?.result?.permission_groups);
  if (!Array.isArray(parsed)) throw new UsageError('permission group JSON must be an array or contain result[]');
  return parsed.map((item, index) => {
    if (typeof item?.id !== 'string' || item.id.trim().length === 0) throw new UsageError(`permission group at index ${index} missing id`);
    if (typeof item?.name !== 'string' || item.name.trim().length === 0) throw new UsageError(`permission group at index ${index} missing name`);
    const scopes = Array.isArray(item.scopes) ? item.scopes.filter((scope) => typeof scope === 'string') : [];
    return {
      id: item.id.trim(),
      name: item.name.trim(),
      description: typeof item.description === 'string' ? item.description.trim() : '',
      scopes,
    };
  });
}

function chooseCandidate(candidates, preferredScope) {
  const scoped = candidates.find((candidate) => candidate.scopes.includes(preferredScope));
  return scoped ?? candidates[0] ?? null;
}

function resolvePermissions(groups, specs) {
  const byName = new Map();
  for (const group of groups) {
    const key = normalize(group.name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(group);
  }
  const resolved = [];
  const unresolved = [];
  for (const spec of specs) {
    let match = null;
    for (const alias of spec.aliases) {
      const candidates = byName.get(normalize(alias));
      if (candidates?.length) {
        match = chooseCandidate(candidates, spec.preferred_scope);
        break;
      }
    }
    if (match === null) {
      unresolved.push({ key: spec.key, aliases: spec.aliases, preferred_scope: spec.preferred_scope, reason: spec.reason });
    } else {
      resolved.push({
        key: spec.key,
        id: match.id,
        name: match.name,
        scopes: match.scopes,
        access: spec.access,
        product: spec.product,
        reason: spec.reason,
      });
    }
  }
  return { resolved, unresolved };
}

function resourceForScope(scope, { accountId, userId }) {
  if (scope === ACCOUNT_SCOPE) return { resource: `com.cloudflare.api.account.${accountId}`, value: '*' };
  if (scope === ZONE_SCOPE) return { resource: `com.cloudflare.api.account.${accountId}`, value: { 'com.cloudflare.api.account.zone.*': '*' } };
  if (scope === USER_SCOPE) return userId ? { resource: `com.cloudflare.api.user.${userId}`, value: '*' } : null;
  return null;
}

function policiesForResolved(resolved, context) {
  const buckets = new Map();
  const missingResources = [];
  for (const item of resolved) {
    const scope = item.scopes.includes(ACCOUNT_SCOPE) ? ACCOUNT_SCOPE
      : item.scopes.includes(ZONE_SCOPE) ? ZONE_SCOPE
      : item.scopes.includes(USER_SCOPE) ? USER_SCOPE
      : item.scopes[0];
    const resource = resourceForScope(scope, context);
    if (resource === null) {
      missingResources.push({ key: item.key, id: item.id, name: item.name, scope });
      continue;
    }
    const bucketKey = `${scope}:${JSON.stringify(resource)}`;
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, { scope, resources: { [resource.resource]: resource.value }, permission_groups: [] });
    buckets.get(bucketKey).permission_groups.push({ id: item.id, name: item.name });
  }
  const policies = [...buckets.values()].map((bucket) => ({
    effect: 'allow',
    resources: bucket.resources,
    permission_groups: bucket.permission_groups.sort((a, b) => a.name.localeCompare(b.name)),
  }));
  return { policies, missingResources };
}

async function readPermissionGroups(path) {
  return JSON.parse(await readFile(resolve(path), 'utf8'));
}

export async function buildCloudflareTokenRequest(input = {}) {
  const mode = requiredText('--mode', input.mode ?? 'pages-deploy');
  if (!MODES.includes(mode)) throw new UsageError(`--mode must be one of ${MODES.join(', ')}`);
  const accountId = requiredText('--account-id', input.accountId);
  const tokenName = requiredText('--token-name', input.tokenName ?? 'enigma-memory-pages-deploy');
  const rawGroups = input.permissionGroupsJson ?? await readPermissionGroups(requiredText('--permission-groups', input.permissionGroups));
  const groups = extractPermissionGroups(rawGroups);
  const specs = permissionSpecs(mode);
  const { resolved, unresolved } = resolvePermissions(groups, specs);
  const { policies, missingResources } = policiesForResolved(resolved, { accountId, userId: input.userId });
  const tokenRequest = {
    name: tokenName,
    policies,
  };
  const ok = unresolved.length === 0 && missingResources.length === 0 && policies.length > 0;
  const output = {
    schema: CLOUDFLARE_TOKEN_REQUEST_SCHEMA,
    generated_at: input.generated_at ?? input.generatedAt ?? new Date().toISOString(),
    ok,
    mode,
    account_id: accountId,
    token_name: tokenName,
    required_permission_count: specs.length,
    resolved_permission_count: resolved.length,
    unresolved_permission_count: unresolved.length,
    resolved_permission_groups: resolved,
    unresolved_permission_groups: unresolved,
    missing_resource_bindings: missingResources,
    token_request: tokenRequest,
    create_endpoints: {
      account_owned_token: `/client/v4/accounts/${accountId}/tokens`,
      user_owned_token: '/client/v4/user/tokens',
    },
    mutation_boundaries: {
      token_created: false,
      token_value_printed: false,
      requires_api_tokens_edit_bootstrap_token_for_api_creation: true,
      dashboard_creation_supported: true,
      registrar_register_requires_charge_acknowledgement: includeMode(mode, 'domain-registrar'),
    },
    source_notes: [
      'Cloudflare token policies use permission group ids; permission names are cosmetic and may change.',
      'Account resources use com.cloudflare.api.account.<ACCOUNT_ID>: "*" for account-scoped permissions.',
      'This packet is a request body skeleton only; it does not create a token or prove credentials exist.',
    ],
  };
  const json = JSON.stringify(output);
  if (SECRET_OUTPUT_RE.test(json)) throw new Error('Cloudflare token request output appears to contain a secret');
  return output;
}

export function renderCloudflareTokenRequestPlain(packet) {
  const lines = [
    'Enigma Cloudflare token request',
    `Status: ${packet.ok ? 'Ready' : 'Needs attention'}`,
    `Mode: ${packet.mode ?? '<mode>'}`,
    `Token name: ${packet.token_name ?? '<token-name>'}`,
    `Required permissions: ${packet.required_permission_count ?? 0}`,
    `Resolved permissions: ${packet.resolved_permission_count ?? 0}`,
    `Unresolved permissions: ${packet.unresolved_permission_count ?? 0}`,
    `Policy blocks: ${Array.isArray(packet.token_request?.policies) ? packet.token_request.policies.length : 0}`,
    `Token created: ${packet.mutation_boundaries?.token_created ? 'yes' : 'no'}`,
    `Token value printed: ${packet.mutation_boundaries?.token_value_printed ? 'yes' : 'no'}`,
  ];
  for (const item of (Array.isArray(packet.unresolved_permission_groups) ? packet.unresolved_permission_groups.slice(0, 5) : [])) lines.push(`Missing permission: ${item.key}`);
  for (const item of (Array.isArray(packet.resolved_permission_groups) ? packet.resolved_permission_groups.slice(0, 6) : [])) lines.push(`Resolved: ${item.key} — ${item.name}`);
  lines.push('Next: create the token in Cloudflare only after a release owner reviews the JSON body and stores the generated token in a secret manager.');
  lines.push('Boundary: public-safe Cloudflare token request skeleton only; no API token, credentials, account ids, permission-group secret values, local paths, deploy, domain purchase, Worker deploy, raw memory, prompts, transcripts, provider responses, provider deletion, model behavior, hosted-service certification, compliance, benchmark superiority, token ROI, or provider invoice savings claims.');
  return `${lines.join('\n')}\n`;
}


export async function runCli(argv = process.argv.slice(2), options = {}) {
  const parsed = parseArgs(argv);
  if (parsed.help) return { text: usage() };
  const packet = await buildCloudflareTokenRequest({ ...parsed, generated_at: options.generated_at ?? options.generatedAt });
  const json = `${JSON.stringify(packet, null, 2)}\n`;
  if (parsed.out) {
    const outPath = resolve(parsed.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, json, 'utf8');
  }
  return parsed.plain ? { text: renderCloudflareTokenRequestPlain(packet), json: packet } : { json: packet };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await runCli();
    if (result.text) process.stdout.write(result.text);
    else process.stdout.write(`${JSON.stringify(result.json, null, 2)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(`${JSON.stringify({ schema: CLOUDFLARE_TOKEN_REQUEST_SCHEMA, ok: false, error: { code: error instanceof UsageError ? 'USAGE_ERROR' : 'TOKEN_REQUEST_ERROR', message } }, null, 2)}\n`);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  }
}
