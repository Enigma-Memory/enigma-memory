#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, relative, join, dirname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildWranglerPagesDeployPlan, CLOUDFLARE_OPS_SCHEMA } from './cloudflare-ops.mjs';
import { validatePublicSiteSecurity, PUBLIC_SITE_SECURITY_RESULT_SCHEMA } from './validate-public-site-security.mjs';
import { applyCloudflareSecretEnvFile } from './cloudflare-secret-env.mjs';

export const CLOUDFLARE_PAGES_RELEASE_PACKET_SCHEMA = 'enigma.cloudflare_pages_release_packet.v1';

const DEFAULT_EXPECT_TITLE = 'Enigma';
const SECRET_OUTPUT_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16})/iu;
const LOCAL_PATH_RE = /(?:(?:[A-Za-z]:[\\/][^\s"']*)|(?:\\\\[^\s"']+)|(?:\/(?:Users|home|tmp|var|private|mnt|Volumes)\/[^\s"']*))/iu;
const PUBLIC_SITE_PLACEHOLDER = '<public-site>';
const NODE_PLACEHOLDER = '<node>';
const NPM_CLI_PLACEHOLDER = '<npm-cli>';

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

function requireString(name, value) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new UsageError(`${name} is required`);
  return value.trim();
}

function parseArgs(argv) {
  const out = {
    site: null,
    projectName: null,
    domain: null,
    liveUrl: null,
    expectTitle: DEFAULT_EXPECT_TITLE,
    out: null,
    envFile: null,
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
    if (token === '--site') out.site = readValue(token);
    else if (token === '--project-name') out.projectName = readValue(token);
    else if (token === '--domain') out.domain = readValue(token);
    else if (token === '--live-url') out.liveUrl = readValue(token);
    else if (token === '--expect-title') out.expectTitle = readValue(token);
    else if (token === '--cloudflare-env-file') out.envFile = readValue(token);
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
  return `Usage: node scripts/build-cloudflare-pages-release-packet.mjs --site <dir> --project-name <name> [options]\n\nOptions:\n  --domain <host>                  Public domain expected for deployment evidence.\n  --live-url <https-url>           Optional non-mutating fetch of the currently live page.\n  --expect-title <text>            Expected text in the live page title. Default: ${DEFAULT_EXPECT_TITLE}.\n  --cloudflare-env-file <path>     Optional local .env-style Cloudflare secret file; values are loaded but never printed.\n  --out <file>                     Write packet JSON evidence.\n  --plain                          Print a human-readable Pages packet summary.\n\nThe packet is public-safe: it contains file hashes, counts, dry-run deploy command metadata,\nsecurity validation results, and optional live observation metadata. It never prints tokens or local paths.\n`;
}

function normalizeRelativePath(root, absolutePath) {
  return relative(root, absolutePath).split(sep).join('/');
}

async function collectStaticFiles(root, current = root, acc = []) {
  const entries = await readdir(current, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const absolute = join(current, entry.name);
    const stat = await lstat(absolute);
    if (stat.isSymbolicLink()) {
      acc.push({ rel: normalizeRelativePath(root, absolute), symlink: true });
      continue;
    }
    if (entry.isDirectory()) {
      await collectStaticFiles(root, absolute, acc);
      continue;
    }
    if (!entry.isFile()) continue;
    const bytes = await readFile(absolute);
    acc.push({
      rel: normalizeRelativePath(root, absolute),
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }
  return acc;
}

function artifactRootHash(files) {
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file.rel);
    hash.update('\0');
    hash.update(String(file.bytes ?? 0));
    hash.update('\0');
    hash.update(file.sha256 ?? 'symlink');
    hash.update('\n');
  }
  return `sha256:${hash.digest('hex')}`;
}

function extractTitle(html) {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/iu.exec(html);
  if (!match) return null;
  return match[1].replace(/\s+/g, ' ').trim().slice(0, 160);
}

function normalizeHost(value) {
  const text = String(value ?? '').trim().toLowerCase().replace(/\.$/, '');
  return text.length === 0 ? null : text;
}

async function observeLivePage({ liveUrl, domain, expectTitle, fetchImpl }) {
  if (typeof liveUrl !== 'string' || liveUrl.trim().length === 0) return null;
  const blockers = [];
  let url;
  try {
    url = new URL(liveUrl);
  } catch {
    return { ok: false, live_url: null, blockers: ['--live-url is not a valid URL'] };
  }
  if (url.protocol !== 'https:') blockers.push('live URL must be HTTPS');
  if (url.username || url.password) blockers.push('live URL must not contain userinfo');
  const expectedDomain = normalizeHost(domain);
  if (expectedDomain !== null && normalizeHost(url.hostname) !== expectedDomain) blockers.push('live URL host does not match --domain');
  if (blockers.length > 0) return { ok: false, live_url: `${url.origin}${url.pathname}`, blockers };

  const response = await fetchImpl(url.toString(), { method: 'GET', headers: { accept: 'text/html,application/xhtml+xml' } });
  const body = await response.text();
  if (SECRET_OUTPUT_RE.test(body)) blockers.push('live page response contains secret-looking text');
  const title = extractTitle(body);
  const status = Number(response.status ?? 0);
  const contentType = typeof response.headers?.get === 'function' ? String(response.headers.get('content-type') ?? '') : '';
  const titleMatched = typeof title === 'string' && title.toLowerCase().includes(String(expectTitle).toLowerCase());
  if (status < 200 || status > 299) blockers.push(`live URL returned HTTP ${Number.isFinite(status) ? status : 'unknown'}`);
  if (!/html/i.test(contentType) && !/^\s*<!doctype html|^\s*<html/i.test(body)) blockers.push('live URL did not return HTML-ish content');
  if (!titleMatched) blockers.push(`live title did not include ${JSON.stringify(expectTitle)}`);
  return {
    ok: blockers.length === 0,
    live_url: `${url.origin}${url.pathname}`,
    status: Number.isFinite(status) ? status : null,
    content_type: contentType || null,
    title,
    title_matched: titleMatched,
    body_bytes_observed: Buffer.byteLength(body),
    authorization_header_sent: false,
    blockers,
  };
}

function redactLocalPath(value, { site }) {
  if (typeof value !== 'string') return value;
  if (value === site) return PUBLIC_SITE_PLACEHOLDER;
  if (!LOCAL_PATH_RE.test(value)) return value;
  if (/[\\/]npm-cli\.js$/iu.test(value)) return NPM_CLI_PLACEHOLDER;
  if (/[\\/]node(?:\.exe)?$/iu.test(value)) return NODE_PLACEHOLDER;
  return '<local-path>';
}

function publicSiteIssuePath(value, { site }) {
  if (typeof value !== 'string' || value.length === 0) return PUBLIC_SITE_PLACEHOLDER;
  const normalized = value.replaceAll('\\', '/');
  const normalizedSite = site.replaceAll('\\', '/');
  if (normalized === normalizedSite) return PUBLIC_SITE_PLACEHOLDER;
  if (normalized.startsWith(`${normalizedSite}/`)) return `${PUBLIC_SITE_PLACEHOLDER}/${normalized.slice(normalizedSite.length + 1)}`;
  return redactLocalPath(value, { site });
}

function formatSecurityBlocker(entry, { site }) {
  const safePath = publicSiteIssuePath(entry?.path, { site });
  const message = redactCliMessage(entry?.message ?? 'security blocker');
  return `${safePath}: ${message}`;
}

function publicDeployPlan(deployPlan, { site }) {
  return {
    schema: CLOUDFLARE_OPS_SCHEMA,
    operation: deployPlan.operation,
    dryRun: deployPlan.dryRun,
    execute: deployPlan.execute,
    command: redactLocalPath(deployPlan.command, { site }),
    args: Array.isArray(deployPlan.args) ? deployPlan.args.map((arg) => redactLocalPath(arg, { site })) : [],
    usesShell: deployPlan.usesShell,
    destructive: deployPlan.destructive,
    tokenPrinted: deployPlan.tokenPrinted,
  };
}


export async function buildCloudflarePagesReleasePacket(input = {}, options = {}) {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const generatedAt = options.generated_at ?? new Date().toISOString();
  const site = resolve(requireString('--site', input.site));
  const projectName = requireString('--project-name', input.projectName);
  const domain = typeof input.domain === 'string' && input.domain.trim().length > 0 ? input.domain.trim().toLowerCase() : null;
  const expectTitle = typeof input.expectTitle === 'string' && input.expectTitle.trim().length > 0 ? input.expectTitle.trim() : DEFAULT_EXPECT_TITLE;
  const deployPlan = buildWranglerPagesDeployPlan({ site, projectName, execute: false });
  const security = await validatePublicSiteSecurity({ site }, { generated_at: generatedAt });
  const files = await collectStaticFiles(site);
  const symlinks = files.filter((file) => file.symlink).map((file) => file.rel);
  const index = files.find((file) => file.rel === 'index.html') ?? null;
  const headers = files.find((file) => file.rel === '_headers') ?? null;
  const rootHash = artifactRootHash(files);
  const live = await observeLivePage({ liveUrl: input.liveUrl, domain, expectTitle, fetchImpl });
  const localBlockers = [];
  if (symlinks.length > 0) localBlockers.push('site artifact contains symlinks');
  if (index === null) localBlockers.push('site artifact is missing index.html');
  if (headers === null) localBlockers.push('site artifact is missing _headers');
  if (security.ok !== true) localBlockers.push(...security.blockers.map((entry) => formatSecurityBlocker(entry, { site })));
  const deploymentBlockers = [];
  if (typeof env.CLOUDFLARE_API_TOKEN !== 'string' || env.CLOUDFLARE_API_TOKEN.length === 0) deploymentBlockers.push('CLOUDFLARE_API_TOKEN is absent; automated Pages deploy cannot execute from this environment');
  if (live !== null && live.ok !== true) deploymentBlockers.push(...live.blockers.map((entry) => `live: ${entry}`));
  return {
    schema: CLOUDFLARE_PAGES_RELEASE_PACKET_SCHEMA,
    generated_at: generatedAt,
    site: PUBLIC_SITE_PLACEHOLDER,
    project_name: projectName,
    domain,
    local_artifact_ready: localBlockers.length === 0,
    automated_deploy_ready: localBlockers.length === 0 && deploymentBlockers.length === 0,
    credential_present: typeof env.CLOUDFLARE_API_TOKEN === 'string' && env.CLOUDFLARE_API_TOKEN.length > 0,
    deploy_plan: publicDeployPlan(deployPlan, { site }),
    artifact: {
      file_count: files.length,
      byte_count: files.reduce((sum, file) => sum + (file.bytes ?? 0), 0),
      root_hash: rootHash,
      index_sha256: index?.sha256 ?? null,
      headers_sha256: headers?.sha256 ?? null,
      symlink_count: symlinks.length,
    },
    security: {
      schema: PUBLIC_SITE_SECURITY_RESULT_SCHEMA,
      ok: security.ok === true,
      status: security.status,
      blocker_count: security.blockers.length,
      checked: security.checked,
    },
    live_observation: live,
    blockers: localBlockers,
    deployment_blockers: deploymentBlockers,
    claim_boundary: [
      'This packet validates a local Cloudflare Pages static artifact and dry-run deploy plan only.',
      'It does not prove a Pages deployment occurred unless the deploy command is executed with credentials and re-verified afterward.',
      'It does not prove hosted relay, gateway, durable storage, KMS, SIEM, backup, operator acceptance, token launch, or customer BYOC readiness.',
    ],
  };
}

export function renderCloudflarePagesReleasePacketPlain(packet) {
  const lines = [
    'Enigma Cloudflare Pages release packet',
    `Status: ${packet.automated_deploy_ready ? 'Ready' : 'Needs attention'}`,
    `Project: ${packet.project_name ?? '<project>'}`,
    `Domain: ${packet.domain ?? '<domain>'}`,
    `Local artifact ready: ${packet.local_artifact_ready ? 'yes' : 'no'}`,
    `Automated deploy ready: ${packet.automated_deploy_ready ? 'yes' : 'no'}`,
    `Credential present: ${packet.credential_present ? 'yes' : 'no'}`,
    `Files: ${packet.artifact?.file_count ?? 0}`,
    `Bytes: ${packet.artifact?.byte_count ?? 0}`,
    `Security: ${packet.security?.ok ? 'ready' : 'blocked'} (${packet.security?.blocker_count ?? 0} blockers)`,
    `Live observation: ${packet.live_observation === null ? 'not requested' : packet.live_observation.ok ? 'ready' : 'blocked'}`,
    `Deployment blockers: ${Array.isArray(packet.deployment_blockers) ? packet.deployment_blockers.length : 0}`,
  ];
  for (const blocker of (Array.isArray(packet.blockers) ? packet.blockers.slice(0, 5) : [])) lines.push(`Local blocker: ${blocker}`);
  for (const blocker of (Array.isArray(packet.deployment_blockers) ? packet.deployment_blockers.slice(0, 5) : [])) lines.push(`Deploy blocker: ${blocker}`);
  lines.push('Boundary: public-safe Cloudflare Pages release packet only; no Cloudflare token, account id, local paths, deploy execution, hosted relay/gateway readiness, durable storage, KMS, SIEM, backups, raw memory, prompts, transcripts, provider responses, provider deletion, model behavior, compliance, benchmark superiority, token ROI, or provider invoice savings claims.');
  return `${lines.join('\n')}\n`;
}


function redactCliMessage(value) {
  return String(value)
    .replace(SECRET_OUTPUT_RE, '[redacted]')
    .replace(LOCAL_PATH_RE, '<local-path>');
}

export async function runCli(argv = process.argv.slice(2), options = {}) {
  const parsed = parseArgs(argv);
  if (parsed.help) return { text: usage() };
  const secretEnv = await applyCloudflareSecretEnvFile(options.env ?? process.env, { path: parsed.envFile ?? undefined, includePath: false });
  const packet = await buildCloudflarePagesReleasePacket(parsed, { ...options, env: secretEnv.env });
  const json = `${JSON.stringify(packet, null, 2)}\n`;
  if (SECRET_OUTPUT_RE.test(json)) throw new Error('release packet output appears to contain a secret');
  if (parsed.out) {
    const outPath = resolve(parsed.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, json, 'utf8');
  }
  return parsed.plain ? { text: renderCloudflarePagesReleasePacketPlain(packet), json: packet } : { json: packet };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await runCli();
    if (result.text) process.stdout.write(result.text);
    else process.stdout.write(`${JSON.stringify(result.json, null, 2)}\n`);
  } catch (error) {
    const message = redactCliMessage(error instanceof UsageError || error instanceof Error ? error.message : String(error));
    process.stdout.write(`${JSON.stringify({ schema: CLOUDFLARE_PAGES_RELEASE_PACKET_SCHEMA, ok: false, error: { code: error instanceof UsageError ? 'USAGE_ERROR' : 'PACKET_ERROR', message } }, null, 2)}\n`);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  }
}
