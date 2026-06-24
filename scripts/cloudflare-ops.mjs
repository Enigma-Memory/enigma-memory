#!/usr/bin/env node
import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { applyCloudflareSecretEnvFileFromArgv, CloudflareSecretEnvError } from './cloudflare-secret-env.mjs';

const execFile = promisify(execFileCallback);

export const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';
export const CLOUDFLARE_OPS_SCHEMA = 'enigma.cloudflare_ops.v1';
export const INFRASTRUCTURE_READINESS_SCHEMA = 'enigma.infrastructure_readiness.v1';
export const INFRASTRUCTURE_READINESS_MANIFEST_SCHEMA = 'enigma.infrastructure_readiness_manifest.v1';


const REGISTRATION_CHARGE_FLAG = '--i-understand-this-charges-my-payment-method';
const HELP_TEXT = `Usage: node scripts/cloudflare-ops.mjs <command> [options]

Safe Cloudflare operations helper. Read-only Cloudflare API commands call Cloudflare
only when a token is present or explicitly required.
Billable registration, Pages deployment, and Worker probe deployment are dry-run plans unless --execute is provided.

Commands:
  token verify [--account-id <id>]
      GET /accounts/:account_id/tokens/verify when an account id is present;
      otherwise GET /user/tokens/verify.
  accounts list
      GET /accounts using CLOUDFLARE_API_TOKEN.

  registrar search --query <q> [--limit n] [--account-id <id>]
      GET /accounts/:account_id/registrar/domain-search.

  registrar check --domain <domain> [--account-id <id>]
      POST /accounts/:account_id/registrar/domain-check.

  registrar register --domain <domain> --max-price-usd <amount> \\
      --confirm-domain <domain> --confirm-registration-cost <amount> \\
      [--registrant-contact-json <path>] ${REGISTRATION_CHARGE_FLAG} [--account-id <id>] [--execute]
      Without --execute, prints the check/register request plan only.
      With --execute, checks current availability and USD price first, requires exact
      domain and price confirmations, then starts registration.
      Optional --registrant-contact-json sends a one-use inline registrant contact;
      command output redacts contact body fields.

  pages deploy --site <dir> --project-name <name> [--execute]
      Without --execute, prints the exact Wrangler deploy plan only.
      With --execute, runs Wrangler through npm exec/npx without printing the token.

  pages verify --url <https-url> --project-name <name> [--domain <host>] \\
      [--account-id <id>] [--cloudflare-live off|auto|required]
      Non-mutating readiness check. Fetches the public HTTPS URL without
      Authorization and verifies 2xx HTML-ish reachability.
      --cloudflare-live off skips credentials; auto uses CLOUDFLARE_API_TOKEN when
      present; required reports not-ready when absent. With credentials plus account
      id, it fetches the declared Pages project and matches project/domain/URL.
      Claim boundary: public Pages reachability plus optional Cloudflare
      token/account/Pages project observation only; no hosted relay/gateway/KMS/storage/SIEM/
      backup/operator/token readiness.

  workers deploy-probe --script <worker.mjs> [--name enigma-hosted-probe] \\
      [--compatibility-date YYYY-MM-DD] [--execute]
      Without --execute, prints the exact Wrangler Worker deploy plan only.
      With --execute, deploys the hosted /livez and fail-closed /readyz probe Worker.
  workers deploy-edge --script <worker.mjs> --name <enigma-relay|enigma-gateway> \\
      --domain <relay.enigmamemory.com|gateway.enigmamemory.com> [--compatibility-date YYYY-MM-DD] [--execute]
      Without --execute, prints the exact Wrangler Worker Custom Domain deploy plan only.
      With --execute, deploys the relay/gateway edge Worker to the named Custom Domain.
  workers inspect-probe [--name enigma-hosted-probe] [--account-id <id>] [--out <file>]
      Non-mutating Cloudflare API check for Worker service visibility and token/account
      permission before a deploy attempt. Output redacts account ids and local paths;
      --out writes the same public-safe JSON for release evidence.

  workers verify-probe --url <https-url> [--expect fail-closed|ready]
      Non-mutating check for a hosted probe Worker. Verifies /livez and /readyz,
      defaulting to fail-closed /readyz until operator evidence refs are configured.

Global options:
  --account-id <id>          Overrides CLOUDFLARE_ACCOUNT_ID for account-scoped API calls.
  --cloudflare-env-file <path>
                             Loads CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, and
                             CLOUDFLARE_PROJECT_NAME from a local .env-style file without
                             printing values. Equivalent env var: CLOUDFLARE_ENV_FILE.
  --help              Show this help.

Environment:
  CLOUDFLARE_ACCOUNT_ID  Account default for registrar commands and Pages verify observation.
  CLOUDFLARE_API_TOKEN   Bearer token for Cloudflare API calls. The token is never printed.
  CLOUDFLARE_ENV_FILE    Optional local .env-style secret file path for Cloudflare keys.
`;

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

function normalizeDomainName(domain) {
  return String(domain ?? '').trim().toLowerCase().replace(/\.$/, '');
}

function normalizeUsdText(cents) {
  return `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

function requireNonEmptyString(name, value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new UsageError(`${name} is required`);
  }
  return value.trim();
}

function requireObject(name, value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new UsageError(`${name} must be an object`);
  }
  return value;
}

export function normalizeRegistrantContact(value) {
  const root = requireObject('registrant contact', value);
  const raw = root.contacts?.registrant ?? root.registrant ?? root;
  const contact = requireObject('registrant contact', raw);
  const postalInfo = requireObject('registrant contact postal_info', contact.postal_info);
  const address = requireObject('registrant contact postal_info.address', postalInfo.address);
  const email = requireNonEmptyString('registrant contact email', contact.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UsageError('registrant contact email must be a valid email address');
  const phone = requireNonEmptyString('registrant contact phone', contact.phone);
  if (!/^\+[0-9][0-9 .-]{5,30}[0-9]$/.test(phone)) {
    throw new UsageError('registrant contact phone must use international format, for example +1.5555555555');
  }
  const name = requireNonEmptyString('registrant contact postal_info.name', postalInfo.name);
  const street = requireNonEmptyString('registrant contact address.street', address.street);
  const city = requireNonEmptyString('registrant contact address.city', address.city);
  const postalCode = requireNonEmptyString('registrant contact address.postal_code', address.postal_code);
  const countryCode = requireNonEmptyString('registrant contact address.country_code', address.country_code).toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) throw new UsageError('registrant contact address.country_code must be an ISO 3166-1 alpha-2 code');
  const state = typeof address.state === 'string' ? address.state.trim() : '';
  if (countryCode === 'US' && state.length === 0) throw new UsageError('registrant contact address.state is required for US contacts');
  const organization = typeof postalInfo.organization === 'string' ? postalInfo.organization.trim() : '';
  return {
    email,
    phone,
    postal_info: {
      name,
      ...(organization.length === 0 ? {} : { organization }),
      address: {
        street,
        city,
        ...(state.length === 0 ? {} : { state }),
        postal_code: postalCode,
        country_code: countryCode,
      },
    },
  };
}

export function loadRegistrantContactJson(path, readFileImpl = readFileSync) {
  const filePath = requireNonEmptyString('--registrant-contact-json', path);
  try {
    return normalizeRegistrantContact(JSON.parse(readFileImpl(filePath, 'utf8')));
  } catch (error) {
    if (error instanceof UsageError) throw error;
    throw new UsageError(`failed to read --registrant-contact-json: ${error?.message ?? String(error)}`);
  }
}

function summarizeRegistrantContact(contact) {
  return {
    provided: true,
    emailProvided: typeof contact.email === 'string' && contact.email.length > 0,
    phoneProvided: typeof contact.phone === 'string' && contact.phone.length > 0,
    postalInfo: {
      nameProvided: typeof contact.postal_info?.name === 'string' && contact.postal_info.name.length > 0,
      organizationProvided: typeof contact.postal_info?.organization === 'string' && contact.postal_info.organization.length > 0,
      countryCode: contact.postal_info?.address?.country_code ?? null,
      stateProvided: typeof contact.postal_info?.address?.state === 'string' && contact.postal_info.address.state.length > 0,
    },
  };
}

const REGISTRAR_CONTACT_OUTPUT_FIELD = /^(?:email|phone|fax|name|street|street1|street2|address_line_1|address_line_2|city|postal_code|postalCode|postcode|zip|zip_code)$/iu;
const SECRET_OUTPUT_VALUE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16})/iu;
const EMAIL_OUTPUT_VALUE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const PHONE_OUTPUT_VALUE = /^\+?[0-9][0-9 .()-]{5,30}[0-9]$/u;
const PROBE_FORBIDDEN_FIELD = /(?:authorization|bearer|cookie|credential|password|passwd|token|secret|api[_-]?key|private[_-]?key|client[_-]?secret|raw[_-]?memory|plaintext|plain[_-]?text|prompt|completion|transcript|provider[_-]?response|email|phone|address|street)/iu;
const PROBE_RAW_VALUE = /(?:raw memory|private prompt|full transcript|decrypted capsule|provider response|customer note|launch-code phrase)/iu;

function assertProbePayloadSafe(value, path = 'payload') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertProbePayloadSafe(item, `${path}[${index}]`));
    return true;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (PROBE_FORBIDDEN_FIELD.test(key)) throw new UsageError(`hosted probe response field ${path}.${key} is not allowed`);
      assertProbePayloadSafe(child, `${path}.${key}`);
    }
    return true;
  }
  if (typeof value === 'string' && (SECRET_OUTPUT_VALUE.test(value) || EMAIL_OUTPUT_VALUE.test(value) || PHONE_OUTPUT_VALUE.test(value) || PROBE_RAW_VALUE.test(value))) {
    throw new UsageError(`hosted probe response value ${path} is not public-safe`);
  }
  return true;
}

function redactScalarOutput(value) {
  if (typeof value !== 'string') return '[redacted]';
  if (value.length === 0) return value;
  return '[redacted]';
}

function redactCloudflareOutputPayload(value) {
  if (Array.isArray(value)) return value.map((item) => redactCloudflareOutputPayload(item));
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'string' && (SECRET_OUTPUT_VALUE.test(value) || EMAIL_OUTPUT_VALUE.test(value) || PHONE_OUTPUT_VALUE.test(value))) {
      return '[redacted]';
    }
    return value;
  }
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    out[key] = REGISTRAR_CONTACT_OUTPUT_FIELD.test(key)
      ? redactScalarOutput(child)
      : redactCloudflareOutputPayload(child);
  }
  return out;
}

function redactCloudflareRequestPlan(plan) {
  if (plan.body?.contacts?.registrant === undefined) return plan;
  return {
    ...plan,
    body: {
      ...plan.body,
      contacts: {
        registrant: summarizeRegistrantContact(plan.body.contacts.registrant),
      },
    },
  };
}

function redactOperationalPayload(value) {
  if (Array.isArray(value)) return value.map((item) => redactOperationalPayload(item));
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'string') {
      if (SECRET_OUTPUT_VALUE.test(value) || EMAIL_OUTPUT_VALUE.test(value) || PHONE_OUTPUT_VALUE.test(value)) return '[redacted]';
      return redactOperationalText(value);
    }
    return value;
  }
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    out[key] = REGISTRAR_CONTACT_OUTPUT_FIELD.test(key)
      ? redactScalarOutput(child)
      : redactOperationalPayload(child);
  }
  return out;
}

function redactPlanOutput(plan) {
  return redactOperationalPayload(plan);
}

function parsePositiveInteger(value, name) {
  const text = requireNonEmptyString(name, value);
  if (!/^\d+$/.test(text)) throw new UsageError(`${name} must be a positive integer`);
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new UsageError(`${name} must be a positive integer`);
  return parsed;
}

function accountIdFrom(command, env) {
  return command.accountId ?? env.CLOUDFLARE_ACCOUNT_ID ?? null;
}

function requireAccountId(command, env) {
  const accountId = accountIdFrom(command, env);
  if (typeof accountId !== 'string' || accountId.trim().length === 0) {
    throw new UsageError('Cloudflare account id is required via --account-id or CLOUDFLARE_ACCOUNT_ID');
  }
  return accountId.trim();
}

function requireApiToken(env) {
  const token = env.CLOUDFLARE_API_TOKEN;
  if (typeof token !== 'string' || token.length === 0) {
    throw new UsageError('CLOUDFLARE_API_TOKEN is required for this Cloudflare API call');
  }
  return token;
}

export function isValidDomainName(domain) {
  const normalized = normalizeDomainName(domain);
  if (normalized.length < 4 || normalized.length > 253) return false;
  if (normalized.includes('..')) return false;
  const labels = normalized.split('.');
  if (labels.length < 2) return false;
  for (const label of labels) {
    if (label.length < 1 || label.length > 63) return false;
    if (!/^[a-z0-9-]+$/.test(label)) return false;
    if (label.startsWith('-') || label.endsWith('-')) return false;
  }
  const tld = labels.at(-1);
  return /^[a-z][a-z0-9-]{1,62}$/.test(tld);
}

export function parseUsdAmount(value, name = 'amount') {
  const text = requireNonEmptyString(name, value);
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(text)) {
    throw new UsageError(`${name} must be a USD amount with at most two decimal places`);
  }
  const [whole, fraction = ''] = text.split('.');
  const cents = (Number(whole) * 100) + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents < 0) throw new UsageError(`${name} is outside the supported USD range`);
  return { cents, usd: cents / 100, text: normalizeUsdText(cents) };
}

export function assertRegistrationPriceGuard({
  domain,
  maxPriceUsd,
  confirmationDomain,
  confirmationCostUsd,
  iUnderstandThisChargesMyPaymentMethod,
  availability,
}) {
  const normalizedDomain = normalizeDomainName(domain);
  if (!isValidDomainName(normalizedDomain)) throw new UsageError('domain must be a valid DNS domain name');
  if (normalizeDomainName(confirmationDomain) !== normalizedDomain) {
    throw new UsageError('--confirm-domain must exactly match --domain after DNS lowercase normalization');
  }
  if (iUnderstandThisChargesMyPaymentMethod !== true) {
    throw new UsageError(`${REGISTRATION_CHARGE_FLAG} is required for domain registration`);
  }

  const maxPrice = parseUsdAmount(maxPriceUsd, '--max-price-usd');
  const confirmedPrice = parseUsdAmount(confirmationCostUsd, '--confirm-registration-cost');

  if (!availability || typeof availability !== 'object') throw new UsageError('current availability result is required before registration');
  const returnedDomain = normalizeDomainName(availability.name ?? availability.domain_name);
  if (returnedDomain !== normalizedDomain) throw new UsageError('availability result domain does not match requested domain');
  if (availability.registrable !== true) {
    const reason = availability.reason ? `: ${availability.reason}` : '';
    throw new UsageError(`domain is not registrable${reason}`);
  }
  const pricing = availability.pricing;
  if (!pricing || pricing.currency !== 'USD') throw new UsageError('registration price must be returned in USD');
  const livePrice = parseUsdAmount(pricing.registration_cost, 'current registration_cost');
  if (livePrice.cents > maxPrice.cents) {
    throw new UsageError(`current registration cost ${livePrice.text} exceeds --max-price-usd ${maxPrice.text}`);
  }
  if (confirmedPrice.cents !== livePrice.cents) {
    throw new UsageError(`--confirm-registration-cost must exactly match current registration cost ${livePrice.text}`);
  }

  return {
    domain: normalizedDomain,
    registrable: true,
    currency: 'USD',
    registrationCostUsd: livePrice.text,
    maxPriceUsd: maxPrice.text,
    confirmedRegistrationCostUsd: confirmedPrice.text,
  };
}

function encodePathSegment(value) {
  return encodeURIComponent(String(value));
}

function makeCloudflareUrl(path, query = null) {
  const url = new URL(path, `${CLOUDFLARE_API_BASE}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export function buildCloudflareRequestPlan({ operation, accountId, query, limit, domain, projectName, registrantContact }) {
  switch (operation) {
    case 'token.verify': {
      const scopedAccountId = accountId ?? null;
      return Object.freeze({
        operation,
        method: 'GET',
        url: scopedAccountId
          ? makeCloudflareUrl(`accounts/${encodePathSegment(scopedAccountId)}/tokens/verify`)
          : makeCloudflareUrl('user/tokens/verify'),
        requiresToken: true,
        tokenPrinted: false,
        tokenScope: scopedAccountId ? 'account' : 'user',
      });
    }
    case 'accounts.list':
      return Object.freeze({
        operation,
        method: 'GET',
        url: makeCloudflareUrl('accounts'),
        requiresToken: true,
        tokenPrinted: false,
      });
    case 'registrar.search': {
      const scopedAccountId = requireNonEmptyString('accountId', accountId);
      const trimmedQuery = requireNonEmptyString('--query', query);
      const parsedLimit = limit === undefined || limit === null ? undefined : parsePositiveInteger(String(limit), '--limit');
      return Object.freeze({
        operation,
        method: 'GET',
        url: makeCloudflareUrl(`accounts/${encodePathSegment(scopedAccountId)}/registrar/domain-search`, {
          q: trimmedQuery,
          ...(parsedLimit === undefined ? {} : { limit: parsedLimit }),
        }),
        requiresToken: true,
        tokenPrinted: false,
      });
    }
    case 'registrar.check': {
      const scopedAccountId = requireNonEmptyString('accountId', accountId);
      const normalizedDomain = normalizeDomainName(domain);
      if (!isValidDomainName(normalizedDomain)) throw new UsageError('--domain must be a valid DNS domain name');
      return Object.freeze({
        operation,
        method: 'POST',
        url: makeCloudflareUrl(`accounts/${encodePathSegment(scopedAccountId)}/registrar/domain-check`),
        body: { domains: [normalizedDomain] },
        requiresToken: true,
        tokenPrinted: false,
      });
    }
    case 'registrar.register': {
      const scopedAccountId = requireNonEmptyString('accountId', accountId);
      const normalizedDomain = normalizeDomainName(domain);
      if (!isValidDomainName(normalizedDomain)) throw new UsageError('--domain must be a valid DNS domain name');
      const normalizedContact = registrantContact === undefined || registrantContact === null
        ? null
        : normalizeRegistrantContact(registrantContact);
      return Object.freeze({
        operation,
        method: 'POST',
        url: makeCloudflareUrl(`accounts/${encodePathSegment(scopedAccountId)}/registrar/registrations`),
        body: {
          domain_name: normalizedDomain,
          ...(normalizedContact === null ? {} : { contacts: { registrant: normalizedContact } }),
        },
        requiresToken: true,
        tokenPrinted: false,
        billable: true,
      });
    }
    case 'registrar.registration-status': {
      const scopedAccountId = requireNonEmptyString('accountId', accountId);
      const normalizedDomain = normalizeDomainName(domain);
      if (!isValidDomainName(normalizedDomain)) throw new UsageError('--domain must be a valid DNS domain name');
      return Object.freeze({
        operation,
        method: 'GET',
        url: makeCloudflareUrl(`accounts/${encodePathSegment(scopedAccountId)}/registrar/registrations/${encodePathSegment(normalizedDomain)}/registration-status`),
        requiresToken: true,
        tokenPrinted: false,
      });
    }
    case 'workers.service': {
      const scopedAccountId = requireNonEmptyString('accountId', accountId);
      const scopedName = requireNonEmptyString('--name', projectName);
      return Object.freeze({
        operation,
        method: 'GET',
        url: makeCloudflareUrl(`accounts/${encodePathSegment(scopedAccountId)}/workers/services/${encodePathSegment(scopedName)}`),
        requiresToken: true,
        tokenPrinted: false,
        tokenScope: 'account',
      });
    }
    case 'pages.project': {
      const scopedAccountId = requireNonEmptyString('accountId', accountId);
      const scopedProjectName = requireNonEmptyString('--project-name', projectName);
      return Object.freeze({
        operation,
        method: 'GET',
        url: makeCloudflareUrl(`accounts/${encodePathSegment(scopedAccountId)}/pages/projects/${encodePathSegment(scopedProjectName)}`),
        requiresToken: true,
        tokenPrinted: false,
        tokenScope: 'account',
      });
    }
    default:
      throw new UsageError(`unsupported Cloudflare operation: ${operation}`);
  }
}

function buildNpmExecInvocation() {
  const envNpmExecPath = process.env.npm_execpath || null;
  const nodeDirNpmExecPath = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const npmExecPath = [envNpmExecPath, nodeDirNpmExecPath].find((candidate) => candidate && existsSync(candidate));
  if (npmExecPath) {
    return {
      command: process.execPath,
      argsPrefix: [npmExecPath, 'exec', '--'],
      usesShell: false,
    };
  }
  return {
    command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    argsPrefix: [],
    usesShell: process.platform === 'win32',
  };
}

export function buildWranglerPagesDeployPlan({ site, projectName, execute = false }) {
  const safeSite = requireNonEmptyString('--site', site);
  const safeProjectName = requireNonEmptyString('--project-name', projectName);
  const npmExec = buildNpmExecInvocation();
  return Object.freeze({
    operation: 'pages.deploy',
    dryRun: execute !== true,
    execute: execute === true,
    command: npmExec.command,
    args: [...npmExec.argsPrefix, 'wrangler', 'pages', 'deploy', safeSite, '--project-name', safeProjectName],
    usesShell: npmExec.usesShell,
    destructive: true,
    tokenPrinted: false,
  });
}

export function buildWranglerWorkerDeployPlan({ script, name = 'enigma-hosted-probe', compatibilityDate = '2026-06-24', execute = false, domain = null, kind = null, operation = kind ?? 'workers.deploy-probe' }) {
  const safeScript = requireNonEmptyString('--script', script);
  const safeName = requireNonEmptyString('--name', name);
  const safeCompatibilityDate = requireNonEmptyString('--compatibility-date', compatibilityDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(safeCompatibilityDate)) throw new UsageError('--compatibility-date must use YYYY-MM-DD');
  const normalizedDomain = domain === null || domain === undefined ? null : normalizeDomainName(domain);
  if (normalizedDomain !== null && !isValidDomainName(normalizedDomain)) throw new UsageError('--domain must be a valid DNS domain name');
  const npmExec = buildNpmExecInvocation();
  const args = [...npmExec.argsPrefix, 'wrangler', 'deploy', safeScript, '--name', safeName, '--compatibility-date', safeCompatibilityDate];
  if (normalizedDomain !== null) args.push('--domain', normalizedDomain);
  return Object.freeze({
    operation,
    dryRun: execute !== true,
    execute: execute === true,
    command: npmExec.command,
    args,
    usesShell: npmExec.usesShell,
    destructive: true,
    tokenPrinted: false,
    claimBoundary: normalizedDomain === null
      ? 'Cloudflare Worker deploys an edge probe only; it is not hosted relay/gateway readiness.'
      : 'Cloudflare Worker Custom Domain deploy proves edge reachability only; it is not hosted relay/gateway production readiness.',
  });
}

function readOption(tokens, index, name) {
  if (index + 1 >= tokens.length || tokens[index + 1].startsWith('--')) throw new UsageError(`${name} requires a value`);
  return [tokens[index + 1], index + 2];
}

function parseOptions(tokens, allowedFlags) {
  const options = {};
  const positionals = [];
  for (let index = 0; index < tokens.length;) {
    const token = tokens[index];
    if (!token.startsWith('--')) {
      positionals.push(token);
      index += 1;
      continue;
    }
    const equalIndex = token.indexOf('=');
    const name = equalIndex === -1 ? token : token.slice(0, equalIndex);
    if (!allowedFlags.has(name)) throw new UsageError(`unknown option ${name}`);
    if (name === '--execute' || name === REGISTRATION_CHARGE_FLAG || name === '--help') {
      if (equalIndex !== -1) throw new UsageError(`${name} does not take a value`);
      options[name] = true;
      index += 1;
      continue;
    }
    if (equalIndex !== -1) {
      const value = token.slice(equalIndex + 1);
      if (value.length === 0) throw new UsageError(`${name} requires a value`);
      options[name] = value;
      index += 1;
      continue;
    }
    const [value, next] = readOption(tokens, index, name);
    options[name] = value;
    index = next;
  }
  return { options, positionals };
}

const GLOBAL_FLAGS = new Set(['--account-id', '--help']);
const REGISTRAR_FLAGS = new Set(['--account-id', '--query', '--limit', '--domain', '--max-price-usd', '--confirm-domain', '--confirm-registration-cost', '--registrant-contact-json', REGISTRATION_CHARGE_FLAG, '--execute', '--help']);
const PAGES_DEPLOY_FLAGS = new Set(['--site', '--project-name', '--execute', '--help']);
const PAGES_VERIFY_FLAGS = new Set(['--url', '--project-name', '--domain', '--account-id', '--cloudflare-live', '--help']);
const WORKERS_DEPLOY_FLAGS = new Set(['--script', '--name', '--domain', '--compatibility-date', '--execute', '--help']);
const WORKERS_VERIFY_FLAGS = new Set(['--url', '--expect', '--help']);
const WORKERS_INSPECT_FLAGS = new Set(['--name', '--account-id', '--out', '--help']);
function stripLeadingGlobalOptions(tokens, env) {
  let accountId = env.CLOUDFLARE_ACCOUNT_ID ?? null;
  let index = 0;
  while (index < tokens.length && tokens[index].startsWith('--')) {
    const token = tokens[index];
    if (token === '--help') return { tokens: ['--help'], env };
    if (token === '--account-id') {
      const [value, next] = readOption(tokens, index, '--account-id');
      accountId = value;
      index = next;
      continue;
    }
    if (token.startsWith('--account-id=')) {
      accountId = token.slice('--account-id='.length);
      if (accountId.length === 0) throw new UsageError('--account-id requires a value');
      index += 1;
      continue;
    }
    throw new UsageError(`unknown global option ${token}`);
  }
  return {
    tokens: tokens.slice(index),
    env: accountId === (env.CLOUDFLARE_ACCOUNT_ID ?? null) ? env : { ...env, CLOUDFLARE_ACCOUNT_ID: accountId },
  };
}


function parseCloudflareLiveMode(value) {
  const mode = value === undefined || value === null ? 'auto' : requireNonEmptyString('--cloudflare-live', value).toLowerCase();
  if (mode !== 'off' && mode !== 'auto' && mode !== 'required') {
    throw new UsageError('--cloudflare-live must be one of: off, auto, required');
  }
  return mode;
}

function rawUrlAuthorityHasUserinfo(rawUrl) {
  const scheme = /^[A-Za-z][A-Za-z\d+.-]*:\/\//.exec(rawUrl);
  if (scheme === null) return false;
  const authorityStart = scheme[0].length;
  let authorityEnd = rawUrl.length;
  const pathStart = rawUrl.indexOf('/', authorityStart);
  if (pathStart !== -1) authorityEnd = pathStart;
  const queryStart = rawUrl.indexOf('?', authorityStart);
  if (queryStart !== -1 && queryStart < authorityEnd) authorityEnd = queryStart;
  const hashStart = rawUrl.indexOf('#', authorityStart);
  if (hashStart !== -1 && hashStart < authorityEnd) authorityEnd = hashStart;
  return rawUrl.lastIndexOf('@', authorityEnd - 1) >= authorityStart;
}

function parsedUrlHasUserinfo(url) {
  return url.username !== '' || url.password !== '';
}

function stripUrlUserinfoFromText(value) {
  let text = String(value);
  for (let pass = 0; pass < 8; pass += 1) {
    const redacted = text.replace(/\b([A-Za-z][A-Za-z\d+.-]*:\/\/)([^/?#\s]*@)([^/?#\s]+)/g, '$1$3');
    if (redacted === text) return text;
    text = redacted;
  }
  return text;
}

function redactOperationalText(value) {
  let text = stripUrlUserinfoFromText(value ?? '');
  text = text.replace(/\/accounts\/[0-9a-f]{32}\b/gi, '/accounts/<account-id>');
  text = text.replace(/\b[0-9a-f]{32}\b/gi, '<hex32>');
  text = text.replace(/[A-Z]:\\Program Files\\nodejs\\[^\r\n\"]+/gi, '<node-runtime-path>');
  text = text.replace(/[A-Z]:\\[^\r\n\"']+/gi, '<local-path>');
  text = text.replace(/\\\\[^\s\"']+/g, '<unc-local-path>');
  text = text.replace(/\/(?:Users|home)\/[^\s\"\']+/gi, '<user-local-path>');
  text = text.replace(/\/(?:tmp|private\/tmp|var\/folders|mnt|Volumes)\/[^\s\"\']+/gi, '<workspace-local-path>');
  text = text.replace(/\bhttps:\/\/([a-z0-9-]+)\.[a-z0-9-]+\.workers\.dev\b/gi, 'https://$1.<workers-subdomain>.workers.dev');
  text = text.replace(/(?:\.\.[\\/])?github-upload[\\/]enigma-memory-site[\\/]_public_site/gi, '<public-site>');
  text = text.replace(/\"[^\"]*wrangler-[^\"]*\\.log\"/gi, '\"<wrangler-log>\"');
  return text;
}

function urlTextHasUserinfo(value) {
  return stripUrlUserinfoFromText(value) !== String(value);
}

function parsePublicHttpsUrl(value) {
  const rawUrl = requireNonEmptyString('--url', value);
  if (rawUrlAuthorityHasUserinfo(rawUrl) || urlTextHasUserinfo(rawUrl)) throw new UsageError('--url must not include username, password, or userinfo');
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UsageError('--url must be a valid HTTPS URL');
  }
  if (parsedUrlHasUserinfo(url)) throw new UsageError('--url must not include username, password, or userinfo');
  if (url.protocol !== 'https:') throw new UsageError('--url must use https://');
  const host = normalizeDomainName(url.hostname);
  if (!isValidDomainName(host)) throw new UsageError('--url must include a valid DNS host');
  url.hash = '';
  return url.toString();
}

function parseOptionalHost(value) {
  if (value === undefined || value === null) return null;
  const host = normalizeDomainName(value);
  if (!isValidDomainName(host)) throw new UsageError('--domain must be a valid DNS host');
  return host;
}

export function parseCloudflareOpsCommand(argv, env = {}) {
  const rawTokens = Array.from(argv ?? []);
  if (rawTokens.length === 0 || rawTokens.includes('--help')) {
    return { kind: 'help', help: HELP_TEXT };
  }

  const leading = stripLeadingGlobalOptions(rawTokens, env);
  const tokens = leading.tokens;
  const commandEnv = leading.env;
  if (tokens.length === 0) return { kind: 'help', help: HELP_TEXT };

  const [group, subcommand, ...rest] = tokens;
  if (group === 'token' && subcommand === 'verify') {
    const { options, positionals } = parseOptions(rest, GLOBAL_FLAGS);
    if (positionals.length > 0) throw new UsageError(`unexpected argument ${positionals[0]}`);
    return { kind: 'token.verify', accountId: options['--account-id'] ?? commandEnv.CLOUDFLARE_ACCOUNT_ID ?? null };
  }

  if (group === 'accounts' && subcommand === 'list') {
    const { options, positionals } = parseOptions(rest, GLOBAL_FLAGS);
    if (positionals.length > 0) throw new UsageError(`unexpected argument ${positionals[0]}`);
    return { kind: 'accounts.list', accountId: options['--account-id'] ?? commandEnv.CLOUDFLARE_ACCOUNT_ID ?? null };
  }

  if (group === 'registrar' && subcommand === 'search') {
    const { options, positionals } = parseOptions(rest, REGISTRAR_FLAGS);
    if (positionals.length > 0) throw new UsageError(`unexpected argument ${positionals[0]}`);
    return {
      kind: 'registrar.search',
      accountId: options['--account-id'] ?? commandEnv.CLOUDFLARE_ACCOUNT_ID ?? null,
      query: requireNonEmptyString('--query', options['--query']),
      limit: options['--limit'] === undefined ? undefined : parsePositiveInteger(options['--limit'], '--limit'),
    };
  }

  if (group === 'registrar' && subcommand === 'check') {
    const { options, positionals } = parseOptions(rest, REGISTRAR_FLAGS);
    if (positionals.length > 0) throw new UsageError(`unexpected argument ${positionals[0]}`);
    const domain = normalizeDomainName(options['--domain']);
    if (!isValidDomainName(domain)) throw new UsageError('--domain must be a valid DNS domain name');
    return {
      kind: 'registrar.check',
      accountId: options['--account-id'] ?? commandEnv.CLOUDFLARE_ACCOUNT_ID ?? null,
      domain,
    };
  }

  if (group === 'registrar' && subcommand === 'register') {
    const { options, positionals } = parseOptions(rest, REGISTRAR_FLAGS);
    if (positionals.length > 0) throw new UsageError(`unexpected argument ${positionals[0]}`);
    const domain = normalizeDomainName(options['--domain']);
    if (!isValidDomainName(domain)) throw new UsageError('--domain must be a valid DNS domain name');
    const confirmationDomain = normalizeDomainName(options['--confirm-domain']);
    if (confirmationDomain !== domain) throw new UsageError('--confirm-domain must exactly match --domain after DNS lowercase normalization');
    if (options[REGISTRATION_CHARGE_FLAG] !== true) {
      throw new UsageError(`${REGISTRATION_CHARGE_FLAG} is required for domain registration`);
    }
    parseUsdAmount(options['--max-price-usd'], '--max-price-usd');
    parseUsdAmount(options['--confirm-registration-cost'], '--confirm-registration-cost');
    return {
      kind: 'registrar.register',
      accountId: options['--account-id'] ?? commandEnv.CLOUDFLARE_ACCOUNT_ID ?? null,
      domain,
      maxPriceUsd: options['--max-price-usd'],
      confirmationDomain,
      confirmationCostUsd: options['--confirm-registration-cost'],
      registrantContactJson: options['--registrant-contact-json'] ?? null,
      iUnderstandThisChargesMyPaymentMethod: true,
      execute: options['--execute'] === true,
    };
  }

  if (group === 'pages' && subcommand === 'deploy') {
    const { options, positionals } = parseOptions(rest, PAGES_DEPLOY_FLAGS);
    if (positionals.length > 0) throw new UsageError(`unexpected argument ${positionals[0]}`);
    return {
      kind: 'pages.deploy',
      site: requireNonEmptyString('--site', options['--site']),
      projectName: requireNonEmptyString('--project-name', options['--project-name']),
      execute: options['--execute'] === true,
    };
  }

  if (group === 'pages' && subcommand === 'verify') {
    const { options, positionals } = parseOptions(rest, PAGES_VERIFY_FLAGS);
    if (positionals.length > 0) throw new UsageError(`unexpected argument ${positionals[0]}`);
    const url = parsePublicHttpsUrl(options['--url']);
    const domain = parseOptionalHost(options['--domain']);
    const urlHost = normalizeDomainName(new URL(url).hostname);
    if (domain !== null && domain !== urlHost) {
      throw new UsageError('--domain must exactly match --url host after DNS lowercase normalization');
    }
    return {
      kind: 'pages.verify',
      url,
      projectName: requireNonEmptyString('--project-name', options['--project-name']),
      domain,
      accountId: options['--account-id'] ?? commandEnv.CLOUDFLARE_ACCOUNT_ID ?? null,
      cloudflareLive: parseCloudflareLiveMode(options['--cloudflare-live']),
    };
  }

  if (group === 'workers' && subcommand === 'deploy-probe') {
    const { options, positionals } = parseOptions(rest, WORKERS_DEPLOY_FLAGS);
    if (positionals.length > 0) throw new UsageError(`unexpected argument ${positionals[0]}`);
    return {
      kind: 'workers.deploy-probe',
      script: requireNonEmptyString('--script', options['--script']),
      name: options['--name'] ?? 'enigma-hosted-probe',
      compatibilityDate: options['--compatibility-date'] ?? '2026-06-24',
      execute: options['--execute'] === true,
    };
  }

  if (group === 'workers' && subcommand === 'deploy-edge') {
    const { options, positionals } = parseOptions(rest, WORKERS_DEPLOY_FLAGS);
    if (positionals.length > 0) throw new UsageError(`unexpected argument ${positionals[0]}`);
    const name = requireNonEmptyString('--name', options['--name']);
    if (name !== 'enigma-relay' && name !== 'enigma-gateway') throw new UsageError('--name must be enigma-relay or enigma-gateway');
    const domain = normalizeDomainName(requireNonEmptyString('--domain', options['--domain']));
    const expectedDomain = name === 'enigma-relay' ? 'relay.enigmamemory.com' : 'gateway.enigmamemory.com';
    if (domain !== expectedDomain) throw new UsageError(`--domain must be ${expectedDomain} for ${name}`);
    return {
      kind: 'workers.deploy-edge',
      script: requireNonEmptyString('--script', options['--script']),
      name,
      domain,
      compatibilityDate: options['--compatibility-date'] ?? '2026-06-24',
      execute: options['--execute'] === true,
    };
  }

  if (group === 'workers' && subcommand === 'inspect-probe') {
    const { options, positionals } = parseOptions(rest, WORKERS_INSPECT_FLAGS);
    if (positionals.length > 0) throw new UsageError(`unexpected argument ${positionals[0]}`);
    return {
      kind: 'workers.inspect-probe',
      name: options['--name'] ?? 'enigma-hosted-probe',
      accountId: options['--account-id'] ?? commandEnv.CLOUDFLARE_ACCOUNT_ID ?? null,
      out: options['--out'] ?? null,
    };
  }

  if (group === 'workers' && subcommand === 'verify-probe') {
    const { options, positionals } = parseOptions(rest, WORKERS_VERIFY_FLAGS);
    if (positionals.length > 0) throw new UsageError(`unexpected argument ${positionals[0]}`);
    const expect = (options['--expect'] ?? 'fail-closed').toLowerCase();
    if (expect !== 'fail-closed' && expect !== 'ready') throw new UsageError('--expect must be fail-closed or ready');
    return {
      kind: 'workers.verify-probe',
      url: parsePublicHttpsUrl(options['--url']),
      expect,
    };
  }

  throw new UsageError(`unknown command: ${tokens.slice(0, 2).join(' ')}`);
}

function safeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function writeJsonOut(outPath, value) {
  if (typeof outPath !== 'string' || outPath.length === 0) return;
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, safeJson(value), 'utf8');
}

async function cloudflareRequest(plan, token, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') throw new UsageError('global fetch is not available in this Node runtime');
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(plan.body === undefined ? {} : { 'Content-Type': 'application/json' }),
  };
  const response = await fetchImpl(plan.url, {
    method: plan.method,
    headers,
    ...(plan.body === undefined ? {} : { body: JSON.stringify(plan.body) }),
  });
  const text = await response.text();
  let payload = null;
  if (text.trim().length > 0) payload = JSON.parse(text);
  if (!response.ok || payload?.success === false) {
    const error = new Error(`Cloudflare API request failed with HTTP ${response.status}`);
    error.payload = payload;
    error.status = response.status;
    throw error;
  }
  return { status: response.status, payload };
}

const PAGES_READINESS_CLAIM_BOUNDARY = 'This proves public Cloudflare Pages reachability and optional Cloudflare token/account/Pages project observation only; it does not prove hosted relay, gateway, KMS, storage, SIEM, backup, operator, or token readiness.';

function responseHeader(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(name) ?? '';
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === lowerName) return Array.isArray(value) ? value.join(', ') : String(value);
  }
  return '';
}

function isHtmlishResponse(contentType, bodyText) {
  const normalizedContentType = String(contentType ?? '').toLowerCase();
  if (normalizedContentType.includes('text/html') || normalizedContentType.includes('application/xhtml+xml')) return true;
  const trimmed = String(bodyText ?? '').trimStart();
  return /^<!doctype\s+html\b/i.test(trimmed) || /^<html(?:\s|>)/i.test(trimmed);
}

function errorMessage(error) {
  return stripUrlUserinfoFromText(error?.message ?? String(error));
}

function credentialErrorMessage(error, token) {
  const message = errorMessage(error);
  return typeof token === 'string' && token.length > 0 ? message.split(token).join('[redacted]') : message;
}

async function publicPagesReachabilityCheck({ url, domain, fetchImpl }) {
  const publicUrl = parsePublicHttpsUrl(url);
  if (typeof fetchImpl !== 'function') throw new UsageError('global fetch is not available in this Node runtime');
  const expectedHost = parseOptionalHost(domain);
  const initialHost = normalizeDomainName(new URL(publicUrl).hostname);
  const blockers = [];
  if (expectedHost !== null && expectedHost !== initialHost) {
    blockers.push('--domain did not match the public URL host');
  }

  let response;
  try {
    response = await fetchImpl(publicUrl, {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
      },
      redirect: 'follow',
    });
  } catch (error) {
    return {
      ok: false,
      method: 'GET',
      url: publicUrl,
      final_url: null,
      status: null,
      https: true,
      final_https: null,
      authorization_header_sent: false,
      content_type: null,
      htmlish: false,
      host: initialHost,
      domain_expected: expectedHost,
      domain_matched: blockers.length === 0,
      blockers: [...blockers, `public Pages URL fetch failed: ${errorMessage(error)}`],
    };
  }

  let bodyText = '';
  try {
    bodyText = typeof response.text === 'function' ? await response.text() : '';
  } catch (error) {
    blockers.push(`public Pages URL body read failed: ${errorMessage(error)}`);
  }

  let finalUrl = typeof response.url === 'string' && response.url.length > 0 ? response.url : publicUrl;
  let reportedFinalUrl = finalUrl;
  let finalHost = initialHost;
  let finalHttps = true;
  try {
    const parsedFinalUrl = new URL(finalUrl);
    const redactedFinalUrl = stripUrlUserinfoFromText(finalUrl);
    if (redactedFinalUrl !== finalUrl || rawUrlAuthorityHasUserinfo(finalUrl) || parsedUrlHasUserinfo(parsedFinalUrl)) {
      blockers.push('public Pages URL final URL included userinfo');
      parsedFinalUrl.username = '';
      parsedFinalUrl.password = '';
      reportedFinalUrl = redactedFinalUrl;
    }
    finalHost = normalizeDomainName(parsedFinalUrl.hostname);
    finalHttps = parsedFinalUrl.protocol === 'https:';
  } catch {
    reportedFinalUrl = null;
    finalHttps = false;
    blockers.push('public Pages URL response reported an invalid final URL');
  }
  const status = Number(response.status ?? 0);
  const statusOk = status >= 200 && status <= 299;
  const contentType = responseHeader(response.headers, 'content-type');
  const htmlish = isHtmlishResponse(contentType, bodyText);
  const domainMatched = expectedHost === null || finalHost === expectedHost;
  if (!statusOk) blockers.push(`public Pages URL returned HTTP ${Number.isFinite(status) ? status : 'unknown'}`);
  if (!finalHttps) blockers.push('public Pages URL final URL did not remain HTTPS');
  if (!htmlish) blockers.push('public Pages URL did not return HTML-ish content');
  if (!domainMatched) blockers.push('public Pages URL final host did not match --domain');

  return {
    ok: blockers.length === 0,
    method: 'GET',
    url: publicUrl,
    final_url: reportedFinalUrl,
    status: Number.isFinite(status) ? status : null,
    https: true,
    final_https: finalHttps,
    authorization_header_sent: false,
    content_type: contentType || null,
    htmlish,
    host: initialHost,
    final_host: finalHost,
    domain_expected: expectedHost,
    domain_matched: domainMatched,
    blockers,
  };
}

function hostedProbeEndpointUrl(baseUrl, endpointPath) {
  const url = new URL(parsePublicHttpsUrl(baseUrl));
  url.pathname = endpointPath;
  url.search = '';
  url.hash = '';
  return url.toString();
}

function publicJsonEndpointErrorMessage(error) {
  const message = errorMessage(error);
  return /not allowed|secret-looking|public-safe|probe body field/i.test(message)
    ? 'public JSON endpoint returned non-public-safe payload'
    : 'public JSON endpoint fetch failed';
}

async function fetchJsonEndpoint({ url, fetchImpl }) {
  if (typeof fetchImpl !== 'function') throw new UsageError('global fetch is not available in this Node runtime');
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      redirect: 'manual',
    });
    const status = Number(response.status ?? 0);
    const responseUrl = typeof response.url === 'string' && response.url.length > 0 ? stripUrlUserinfoFromText(response.url) : url;
    const contentType = responseHeader(response.headers, 'content-type');
    if (response.redirected === true || responseUrl !== url || (status >= 300 && status <= 399)) {
      return {
        ok: false,
        status: Number.isFinite(status) ? status : null,
        url: responseUrl,
        content_type: contentType || null,
        json: false,
        payload: { error: 'public JSON endpoint must not redirect' },
      };
    }
    const text = typeof response.text === 'function' ? await response.text() : '';
    let payload = null;
    try {
      payload = text.trim().length === 0 ? null : JSON.parse(text);
    } catch {
      payload = null;
    }
    if (payload !== null) assertProbePayloadSafe(payload, 'hosted_probe');
    return {
      ok: status >= 200 && status <= 299,
      status: Number.isFinite(status) ? status : null,
      url: responseUrl,
      content_type: contentType || null,
      json: payload !== null,
      payload,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      url: '<hosted-probe-worker-url>',
      content_type: null,
      json: false,
      payload: null,
      error: publicJsonEndpointErrorMessage(error),
    };
  }
}

function summarizeHostedProbePayload(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const checks = Array.isArray(payload.checks) ? payload.checks : null;
  const error = typeof payload.error === 'string' && /redirect/i.test(payload.error)
    ? 'public JSON endpoint must not redirect'
    : null;
  return {
    ok: payload.ok === true ? true : payload.ok === false ? false : null,
    hosted_probe_only: payload.hosted_probe_only === true,
    missing_evidence_ref_count: Array.isArray(payload.missing_evidence_refs) ? payload.missing_evidence_refs.length : null,
    checks_ok: checks === null ? null : checks.every((check) => check?.ok === true),
    error,
  };
}


function redactHostedProbeEndpointResult(result, endpointPath) {
  return {
    ...result,
    url: `<hosted-probe-worker-url>${endpointPath}`,
    payload: summarizeHostedProbePayload(result.payload),
  };
}

export async function verifyHostedProbeWorker(command, { fetchImpl = globalThis.fetch } = {}) {
  const baseUrl = parsePublicHttpsUrl(command.url);
  const expected = command.expect === 'ready' ? 'ready' : 'fail-closed';
  const livez = await fetchJsonEndpoint({ url: hostedProbeEndpointUrl(baseUrl, '/livez'), fetchImpl });
  const readyz = await fetchJsonEndpoint({ url: hostedProbeEndpointUrl(baseUrl, '/readyz'), fetchImpl });
  const blockers = [];
  if (livez.status !== 200 || livez.payload?.ok !== true || livez.payload?.hosted_probe_only !== true) {
    blockers.push('/livez did not return hosted probe ok:true with HTTP 200');
  }
  if (expected === 'ready') {
    const missingRefs = readyz.payload?.missing_evidence_refs;
    const checks = readyz.payload?.checks;
    const checksOk = checks === undefined || (Array.isArray(checks) && checks.every((check) => check?.ok === true));
    if (readyz.status !== 200 || readyz.payload?.ok !== true || readyz.payload?.hosted_probe_only !== true || !Array.isArray(missingRefs) || missingRefs.length !== 0 || !checksOk) {
      blockers.push('/readyz did not return ready ok:true with HTTP 200, hosted_probe_only:true, missing_evidence_refs:[], and all checks ok');
    }
  } else if (readyz.status !== 503 || readyz.payload?.ok !== false || readyz.payload?.hosted_probe_only !== true || !Array.isArray(readyz.payload?.missing_evidence_refs)) {
    blockers.push('/readyz did not fail closed with HTTP 503, ok:false, hosted_probe_only:true, and missing_evidence_refs');
  }
  return redactOperationalPayload({
    schema: CLOUDFLARE_OPS_SCHEMA,
    operation: 'workers.verify-probe',
    ok: blockers.length === 0,
    expected,
    base_url: '<hosted-probe-worker-url>',
    authorization_header_sent: false,
    tokenPrinted: false,
    livez: redactHostedProbeEndpointResult(livez, '/livez'),
    readyz: redactHostedProbeEndpointResult(readyz, '/readyz'),
    blockers,
    claimBoundary: 'Hosted probe Worker verification proves only public /livez and /readyz edge-probe behavior, not relay/gateway hosted readiness.',
  });
}

export async function inspectHostedProbeWorkerService(command, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const token = requireApiToken(env);
  const accountId = requireAccountId(command, env);
  const name = requireNonEmptyString('--name', command.name ?? 'enigma-hosted-probe');
  const plan = buildCloudflareRequestPlan({ operation: 'workers.service', accountId, projectName: name });
  const blockers = [];
  let status = null;
  let serviceObserved = false;
  let payload = null;
  try {
    const response = await cloudflareRequest(plan, token, fetchImpl);
    status = response.status;
    payload = redactOperationalPayload(response.payload);
    serviceObserved = true;
  } catch (error) {
    status = Number.isInteger(error?.status) ? error.status : null;
    payload = error?.payload ? redactOperationalPayload(error.payload) : null;
    blockers.push(`Worker service observation failed: ${credentialErrorMessage(error, token)}`);
  }
  return {
    schema: CLOUDFLARE_OPS_SCHEMA,
    operation: 'workers.inspect-probe',
    ok: blockers.length === 0,
    execute: true,
    mutates_cloudflare: false,
    service_name: name,
    service_observed: serviceObserved,
    status,
    plan: redactPlanOutput(plan),
    response: payload === null ? null : { status, payload },
    tokenPrinted: false,
    blockers,
    claimBoundary: 'Worker service inspection is a non-mutating Cloudflare API visibility and permission check only; it does not deploy the Worker and is not hosted relay/gateway readiness.',
  };
}

function tokenFromEnv(env) {
  const token = env?.CLOUDFLARE_API_TOKEN;
  return typeof token === 'string' && token.trim().length > 0 ? token : null;
}

function normalizeCloudflareProjectUrl(value) {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  if (rawUrlAuthorityHasUserinfo(value) || urlTextHasUserinfo(value)) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (parsedUrlHasUserinfo(url) || url.protocol !== 'https:') return null;
  const host = normalizeDomainName(url.hostname);
  if (!isValidDomainName(host)) return null;
  url.hash = '';
  return url.toString();
}

function cloudflareProjectHostValue(value) {
  const normalizedUrl = normalizeCloudflareProjectUrl(value);
  if (normalizedUrl !== null) return normalizeDomainName(new URL(normalizedUrl).hostname);
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const host = normalizeDomainName(value);
  return isValidDomainName(host) ? host : null;
}

function addCloudflareProjectHost(hosts, value) {
  const host = cloudflareProjectHostValue(value);
  if (host !== null) hosts.add(host);
}

function addCloudflareProjectUrl(urls, hosts, value) {
  const normalizedUrl = normalizeCloudflareProjectUrl(value);
  if (normalizedUrl === null) {
    addCloudflareProjectHost(hosts, value);
    return;
  }
  urls.add(normalizedUrl);
  hosts.add(normalizeDomainName(new URL(normalizedUrl).hostname));
}

function addCloudflareProjectDomainEntry(hosts, urls, entry) {
  if (typeof entry === 'string') {
    addCloudflareProjectUrl(urls, hosts, entry);
    return;
  }
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return;
  for (const field of ['name', 'hostname', 'host', 'domain', 'domain_name', 'url']) {
    addCloudflareProjectUrl(urls, hosts, entry[field]);
  }
}

function collectCloudflarePagesProjectObservation(payload) {
  const result = payload?.result;
  const hosts = new Set();
  const urls = new Set();
  addCloudflareProjectHost(hosts, result?.subdomain);
  for (const domainEntry of Array.isArray(result?.domains) ? result.domains : []) {
    addCloudflareProjectDomainEntry(hosts, urls, domainEntry);
  }
  for (const deployment of [result?.latest_deployment, result?.canonical_deployment, result?.latest, result?.latestDeployment, result?.canonicalDeployment]) {
    if (deployment === null || typeof deployment !== 'object' || Array.isArray(deployment)) continue;
    addCloudflareProjectUrl(urls, hosts, deployment.url);
    for (const alias of Array.isArray(deployment.aliases) ? deployment.aliases : []) {
      addCloudflareProjectUrl(urls, hosts, alias);
    }
    for (const domainEntry of Array.isArray(deployment.domains) ? deployment.domains : []) {
      addCloudflareProjectDomainEntry(hosts, urls, domainEntry);
    }
  }
  return {
    name: typeof result?.name === 'string' ? result.name : null,
    hosts: [...hosts].sort(),
    urls: [...urls].sort(),
  };
}

function evaluateCloudflarePagesProjectObservation({ payload, projectName, url, domain, status }) {
  const expectedProjectName = requireNonEmptyString('--project-name', projectName);
  const expectedUrl = parsePublicHttpsUrl(url);
  const expectedUrlHost = normalizeDomainName(new URL(expectedUrl).hostname);
  const expectedDomain = parseOptionalHost(domain);
  const observed = collectCloudflarePagesProjectObservation(payload);
  const observedHosts = new Set(observed.hosts);
  const observedUrls = new Set(observed.urls);
  const projectNameMatched = observed.name === expectedProjectName;
  const urlMatched = observedUrls.has(expectedUrl) || observedHosts.has(expectedUrlHost);
  const domainMatched = expectedDomain === null || observedHosts.has(expectedDomain);
  const blockers = [];
  if (!projectNameMatched) blockers.push('Cloudflare Pages project name did not match --project-name');
  if (!urlMatched) blockers.push('Cloudflare Pages project URL/domains did not match --url');
  if (!domainMatched) blockers.push('Cloudflare Pages project domains did not include --domain');
  return {
    ok: blockers.length === 0,
    operation: 'pages.project',
    lookup_performed: true,
    status,
    project_name_matched: projectNameMatched,
    url_matched: urlMatched,
    domain_matched: domainMatched,
    observed_project_name: observed.name,
    observed_hosts: observed.hosts,
    observed_urls: observed.urls,
    blockers,
  };
}

async function cloudflareLiveObservationCheck(command, env, fetchImpl) {
  const mode = parseCloudflareLiveMode(command.cloudflareLive);
  const accountId = accountIdFrom(command, env);
  const tokenScope = accountId ? 'account' : 'user';
  if (mode === 'off') {
    return {
      ok: true,
      mode,
      skipped: true,
      credentials_used: false,
      credentials_required_by_mode: false,
      token_present: false,
      account_id_present: accountId !== null,
      token_scope: tokenScope,
      token_printed: false,
      project: null,
      blockers: [],
    };
  }

  const token = tokenFromEnv(env);
  if (token === null) {
    const blockers = mode === 'required' ? ['--cloudflare-live required but CLOUDFLARE_API_TOKEN is absent'] : [];
    return {
      ok: blockers.length === 0,
      mode,
      skipped: true,
      credentials_used: false,
      credentials_required_by_mode: mode === 'required',
      token_present: false,
      account_id_present: accountId !== null,
      token_scope: tokenScope,
      token_printed: false,
      project: null,
      blockers,
    };
  }

  if (accountId !== null && typeof command.projectName === 'string' && command.projectName.trim().length > 0) {
    const projectPlan = buildCloudflareRequestPlan({ operation: 'pages.project', accountId, projectName: command.projectName });
    try {
      const projectResponse = await cloudflareRequest(projectPlan, token, fetchImpl);
      const project = evaluateCloudflarePagesProjectObservation({
        payload: projectResponse.payload,
        projectName: command.projectName,
        url: command.url,
        domain: command.domain,
        status: projectResponse.status,
      });
      return {
        ok: project.ok,
        mode,
        skipped: false,
        credentials_used: true,
        credentials_required_by_mode: mode === 'required',
        token_present: true,
        account_id_present: true,
        token_scope: projectPlan.tokenScope,
        token_printed: false,
        status: projectResponse.status,
        project,
        blockers: project.blockers,
      };
    } catch (error) {
      const project = {
        ok: false,
        operation: 'pages.project',
        lookup_performed: true,
        status: error?.status ?? null,
        project_name_matched: false,
        url_matched: false,
        domain_matched: false,
        observed_project_name: null,
        observed_hosts: [],
        observed_urls: [],
        blockers: [`Cloudflare Pages project observation failed: ${credentialErrorMessage(error, token)}`],
      };
      return {
        ok: false,
        mode,
        skipped: false,
        credentials_used: true,
        credentials_required_by_mode: mode === 'required',
        token_present: true,
        account_id_present: true,
        token_scope: projectPlan.tokenScope,
        token_printed: false,
        status: error?.status ?? null,
        project,
        blockers: project.blockers,
      };
    }
  }

  const blockers = ['Cloudflare Pages project observation requires --account-id with CLOUDFLARE_API_TOKEN'];
  return {
    ok: mode !== 'required',
    mode,
    skipped: true,
    credentials_used: false,
    credentials_required_by_mode: mode === 'required',
    token_present: true,
    account_id_present: false,
    token_scope: tokenScope,
    token_printed: false,
    status: null,
    project: null,
    blockers: mode === 'required' ? blockers : [],
  };
}

export async function verifyCloudflarePagesReadiness(command, {
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (command?.kind !== 'pages.verify') throw new UsageError('verifyCloudflarePagesReadiness requires a pages.verify command');
  const publicUrl = parsePublicHttpsUrl(command.url);
  const domain = parseOptionalHost(command.domain);
  const cloudflareLive = parseCloudflareLiveMode(command.cloudflareLive);
  const projectName = requireNonEmptyString('--project-name', command.projectName);
  const publicUrlCheck = await publicPagesReachabilityCheck({ url: publicUrl, domain, fetchImpl });
  const cloudflareLiveCheck = await cloudflareLiveObservationCheck({ ...command, url: publicUrl, domain, projectName, cloudflareLive }, env, fetchImpl);
  const externalBlockers = [...publicUrlCheck.blockers, ...cloudflareLiveCheck.blockers];
  const contractReady = true;
  const requestedLiveChecksPass = publicUrlCheck.ok && cloudflareLiveCheck.ok;
  const operatorAcceptanceDecision = 'not_assessed';
  const hostedLiveReady = contractReady
    && requestedLiveChecksPass
    && operatorAcceptanceDecision === 'go'
    && externalBlockers.length === 0;

  return {
    schema: INFRASTRUCTURE_READINESS_SCHEMA,
    ok: contractReady && requestedLiveChecksPass && externalBlockers.length === 0,
    generated_at: new Date().toISOString(),
    mode: cloudflareLive,
    operation: 'pages.verify',
    cloudflare_live: cloudflareLive,
    project_name: projectName,
    credentials_required: false,
    credentials_used: cloudflareLiveCheck.credentials_used === true,
    readiness: {
      contract_ready: contractReady,
      public_live_ready: publicUrlCheck.ok,
      cloudflare_observed: cloudflareLiveCheck.credentials_used === true && cloudflareLiveCheck.ok,
      hosted_live_ready: hostedLiveReady,
    },
    checks: {
      command: {
        ok: true,
        project_name_present: true,
        url: publicUrl,
        domain,
        cloudflare_live: cloudflareLive,
      },
      public_url: publicUrlCheck,
      cloudflare_live: cloudflareLiveCheck,
      operator_acceptance: {
        ok: true,
        decision: operatorAcceptanceDecision,
        required_for_hosted_live_ready: true,
      },
    },
    external_blockers: externalBlockers,
    claim_boundary: PAGES_READINESS_CLAIM_BOUNDARY,
  };
}


function firstCheckedDomain(payload, domain) {
  const normalizedDomain = normalizeDomainName(domain);
  const domains = payload?.result?.domains;
  if (!Array.isArray(domains)) throw new UsageError('Cloudflare check response did not include result.domains');
  const match = domains.find((item) => normalizeDomainName(item?.name ?? item?.domain_name) === normalizedDomain);
  if (!match) throw new UsageError('Cloudflare check response did not include the requested domain');
  return match;
}

function assertRegistrationWorkflowState(payload) {
  const state = payload?.result?.state;
  if (state === 'action_required') throw new UsageError('registration stopped: Cloudflare returned action_required');
  if (state === 'failed') throw new UsageError('registration stopped: Cloudflare returned failed');
  if (state === 'blocked') throw new UsageError('registration stopped: Cloudflare returned blocked');
  return state ?? null;
}

async function followInProgressRegistrationOnce({ accountId, domain, token, fetchImpl }) {
  const statusPlan = buildCloudflareRequestPlan({
    operation: 'registrar.registration-status',
    accountId,
    domain,
  });
  const statusResponse = await cloudflareRequest(statusPlan, token, fetchImpl);
  const state = assertRegistrationWorkflowState(statusResponse.payload);
  return {
    plan: statusPlan,
    status: statusResponse.status,
    state,
    payload: statusResponse.payload,
  };
}


function apiPlanOutput(command, env) {
  const accountId = command.kind.startsWith('registrar.') ? requireAccountId(command, env) : accountIdFrom(command, env);
  return buildCloudflareRequestPlan({
    operation: command.kind,
    accountId,
    query: command.query,
    limit: command.limit,
    domain: command.domain,
  });
}

export async function runCloudflareOpsCommand(command, {
  env = process.env,
  fetchImpl = globalThis.fetch,
  execFileImpl = execFile,
} = {}) {
  if (command.kind === 'help') return { text: command.help };

  if (command.kind === 'pages.verify') {
    return { json: await verifyCloudflarePagesReadiness(command, { env, fetchImpl }) };
  }

  if (command.kind === 'workers.verify-probe') {
    return { json: await verifyHostedProbeWorker(command, { fetchImpl }) };
  }

  if (command.kind === 'workers.inspect-probe') {
    return { json: await inspectHostedProbeWorkerService(command, { env, fetchImpl }) };
  }

  if (command.kind === 'pages.deploy') {
    const plan = buildWranglerPagesDeployPlan(command);
    if (!command.execute) {
      return {
        json: {
          schema: CLOUDFLARE_OPS_SCHEMA,
          operation: command.kind,
          dryRun: true,
          execute: false,
          plan: redactPlanOutput(plan),
          claimBoundary: 'Plan only; no Cloudflare Pages deployment was executed.',
        },
      };
    }
    const result = await execFileImpl(plan.command, plan.args, { shell: plan.usesShell === true, windowsHide: true, maxBuffer: 10 * 1024 * 1024, env });
    return {
      json: {
        schema: CLOUDFLARE_OPS_SCHEMA,
        operation: command.kind,
        dryRun: false,
        execute: true,
        plan: redactPlanOutput(plan),
        stdout: redactOperationalText(result.stdout ?? ''),
        stderr: redactOperationalText(result.stderr ?? ''),
        tokenPrinted: false,
      },
    };
  }

  if (command.kind === 'workers.deploy-probe' || command.kind === 'workers.deploy-edge') {
    const plan = buildWranglerWorkerDeployPlan(command);
    if (!command.execute) {
      return {
        json: {
          schema: CLOUDFLARE_OPS_SCHEMA,
          operation: command.kind,
          dryRun: true,
          execute: false,
          plan: redactPlanOutput(plan),
          claimBoundary: command.kind === 'workers.deploy-edge' ? 'Plan only; no relay/gateway edge Worker deployment was executed.' : 'Plan only; no hosted probe Worker deployment was executed.',
        },
      };
    }
    const result = await execFileImpl(plan.command, plan.args, { shell: plan.usesShell === true, windowsHide: true, maxBuffer: 10 * 1024 * 1024, env });
    const safeStdout = redactOperationalText(result.stdout ?? '');
    const safeStderr = redactOperationalText(result.stderr ?? '');
    return {
      json: {
        schema: CLOUDFLARE_OPS_SCHEMA,
        operation: command.kind,
        dryRun: false,
        execute: true,
        plan: redactPlanOutput(plan),
        stdout: safeStdout,
        stderr: safeStderr,
        tokenPrinted: false,
        claimBoundary: plan.claimBoundary,
      },
    };
  }

  if (command.kind === 'registrar.register') {
    const accountId = requireAccountId(command, env);
    const registrantContact = command.registrantContactJson == null ? null : loadRegistrantContactJson(command.registrantContactJson);
    const checkPlan = buildCloudflareRequestPlan({ operation: 'registrar.check', accountId, domain: command.domain });
    const registerPlan = buildCloudflareRequestPlan({ operation: 'registrar.register', accountId, domain: command.domain, registrantContact });
    if (!command.execute) {
      return {
        json: {
          schema: CLOUDFLARE_OPS_SCHEMA,
          operation: command.kind,
          dryRun: true,
          execute: false,
          safety: {
            billable: true,
            requiresExecute: true,
            requiresFreshAvailabilityCheckBeforeExecute: true,
            requiresExactDomainConfirmation: true,
            requiresExactPriceConfirmation: true,
            chargeAcknowledgementFlag: REGISTRATION_CHARGE_FLAG,
          },
          checkPlan: redactPlanOutput(checkPlan),
          registerPlan: redactPlanOutput(redactCloudflareRequestPlan(registerPlan)),
          claimBoundary: 'Plan only; no availability check or domain registration was executed.',
        },
      };
    }

    const token = requireApiToken(env);
    const checkResponse = await cloudflareRequest(checkPlan, token, fetchImpl);
    const availability = firstCheckedDomain(checkResponse.payload, command.domain);
    const guard = assertRegistrationPriceGuard({ ...command, availability });
    const registerResponse = await cloudflareRequest(registerPlan, token, fetchImpl);
    const state = assertRegistrationWorkflowState(registerResponse.payload);
    const statusFollowup = state === 'in_progress'
      ? await followInProgressRegistrationOnce({ accountId, domain: command.domain, token, fetchImpl })
      : null;
    return {
      json: {
        schema: CLOUDFLARE_OPS_SCHEMA,
        operation: command.kind,
        dryRun: false,
        execute: true,
        guard,
        check: { status: checkResponse.status, result: availability },
        registration: { status: registerResponse.status, state, payload: redactOperationalPayload(registerResponse.payload) },
        statusFollowup: statusFollowup === null ? null : { ...statusFollowup, payload: redactOperationalPayload(statusFollowup.payload) },
      },
    };
  }

  const token = requireApiToken(env);
  const plan = apiPlanOutput(command, env);
  const response = await cloudflareRequest(plan, token, fetchImpl);
  return {
    json: {
      schema: CLOUDFLARE_OPS_SCHEMA,
      operation: command.kind,
      dryRun: false,
      execute: true,
      plan: redactPlanOutput(plan),
      response: redactOperationalPayload(response),
    },
  };
}

export function cloudflareOpsHelpText() {
  return HELP_TEXT;
}

async function main(argv = process.argv.slice(2), env = process.env) {
  try {
    const secretEnv = await applyCloudflareSecretEnvFileFromArgv(argv, env, { includePath: false });
    const command = parseCloudflareOpsCommand(secretEnv.argv, secretEnv.env);
    const result = await runCloudflareOpsCommand(command, { env: secretEnv.env });
    if (result.text !== undefined) {
      process.stdout.write(result.text);
      return 0;
    }
    await writeJsonOut(command.out, result.json);
    process.stdout.write(safeJson(result.json));
    return 0;
  } catch (error) {
    const rawMessage = error instanceof UsageError || error instanceof CloudflareSecretEnvError ? error.message : (error?.message ?? String(error));
    const message = redactOperationalText(rawMessage);
    process.stderr.write(`${message}\n`);
    if (error?.payload) process.stderr.write(safeJson({ cloudflare: redactOperationalPayload(error.payload) }));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
