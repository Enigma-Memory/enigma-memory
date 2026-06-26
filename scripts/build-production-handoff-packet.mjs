#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildCloudflarePagesReleasePacket } from './build-cloudflare-pages-release-packet.mjs';
import { buildProductionReadinessManifest } from './build-production-readiness-manifest.mjs';
import {
  assertNoSecretMaterial,
  INFRASTRUCTURE_READINESS_SCHEMA,
  runInfrastructureReadiness,
} from './infrastructure-readiness.mjs';
import { buildOperatorAcceptancePacket } from './build-operator-acceptance-packet.mjs';
import { validateOperatorAcceptancePacket } from './validate-operator-acceptance.mjs';
import { applyCloudflareSecretEnvFile } from './cloudflare-secret-env.mjs';
import { buildHostedProbeWorkerBundle } from './build-hosted-probe-worker.mjs';

export const PRODUCTION_HANDOFF_PACKET_SCHEMA = 'enigma.production_handoff_packet.v1';
const RELEASE_AUDIT_SCHEMA = 'enigma.release_audit.v1';
const COMPLETED_INFRASTRUCTURE_CHECK_NAMES = Object.freeze([
  'manifest.secret_scan',
  'manifest.schema',
  'readiness.contract',
  'hosted.required_refs',
  'operator_acceptance.decision',
  'external_blockers.manifest',
  'hosted.allow_localhost_boundary',
  'public_site.live',
  'relay.live',
  'gateway.live',
  'cloudflare.observation',
]);

const SECRET_OUTPUT_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|cf-[A-Za-z0-9_-]{12,})/iu;
const RAW_OUTPUT_RE = /(?:raw[\s_-]*memory|private[\s_-]*prompt|full[\s_-]*transcript|decrypted[\s_-]*(?:capsule|content)|provider[\s_-]*response|plain[\s_-]*text)/iu;

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

function assertNoUnsafeOutput(name, value) {
  const text = JSON.stringify(value);
  if (SECRET_OUTPUT_RE.test(text) || RAW_OUTPUT_RE.test(text)) throw new Error(`${name} appears to contain secret or raw-memory material`);
}

function assertNoUnsafeMaterial(name, value, path = name) {
  if (typeof value === 'string') {
    if (SECRET_OUTPUT_RE.test(value)) throw new Error(`${path} appears to contain secret material`);
    if (!/\.claim_boundary\[\d+\]$/.test(path) && RAW_OUTPUT_RE.test(value)) throw new Error(`${path} appears to contain raw-memory material`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoUnsafeMaterial(name, item, `${path}[${index}]`));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) assertNoUnsafeMaterial(name, item, `${path}.${key}`);
  }
}

function assertNoSecretOutput(name, value, path = name) {
  if (typeof value === 'string') {
    if (SECRET_OUTPUT_RE.test(value)) throw new Error(`${path} appears to contain secret material`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecretOutput(name, item, `${path}[${index}]`));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) assertNoSecretOutput(name, item, `${path}.${key}`);
  }
}

function optionalText(value, fallback = null) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function shellArg(value) {
  const text = requireText('command argument', value);
  if (/^[A-Za-z0-9_./:@%+=,-]+$/u.test(text)) return text;
  return `"${text.replace(/"/g, '\\"')}"`;
}

function parseArgs(argv) {
  const out = {
    site: null,
    projectName: 'enigma-memory',
    domain: 'enigmamemory.com',
    liveUrl: 'https://enigmamemory.com/',
    expectTitle: 'Enigma',
    out: null,
    envFile: null,
    operatorAcceptancePacket: null,
    infrastructureReadiness: null,
    releaseAudit: null,
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
    else if (token === '--operator-acceptance-packet' || token === '--operatorAcceptancePacket') out.operatorAcceptancePacket = readValue(token);
    else if (token === '--infrastructure-readiness' || token === '--infrastructureReadiness') out.infrastructureReadiness = readValue(token);
    else if (token === '--release-audit' || token === '--releaseAudit') out.releaseAudit = readValue(token);
    else if (token === '--out') out.out = readValue(token);
    else throw new UsageError(`unknown option ${token}`);
  }
  return out;
}

function usage() {
  return `Usage: node scripts/build-production-handoff-packet.mjs --site <dir> [options]\n\nOptions:\n  --project-name <name>             Cloudflare Pages project name. Default: enigma-memory.\n  --domain <host>                   Public domain. Default: enigmamemory.com.\n  --live-url <url>                  Current public URL to observe. Default: https://enigmamemory.com/.\n  --expect-title <text>             Expected live title fragment. Default: Enigma.\n  --infrastructure-readiness <file> Completed infrastructure readiness JSON to summarize.\n  --operator-acceptance-packet <file> Completed operator packet JSON to validate and summarize.\n  --release-audit <file>            Completed enigma.release_audit.v1 JSON proving current release gates.\n  --cloudflare-env-file <path>      Optional local .env-style Cloudflare secret file; values are loaded but never printed.\n  --out <file>                      Write packet JSON to a file and print the same JSON.`;
}

function summarizeInfrastructure(readiness) {
  const checks = Array.isArray(readiness.checks) ? readiness.checks : [];
  const failedChecks = checks.filter((check) => check?.ok !== true);
  const hostedRefs = checks.find((check) => check.name === 'hosted.required_refs') ?? {};
  return {
    schema: readiness.schema,
    ok: readiness.ok === true,
    mode: readiness.mode,
    contract_ready: readiness.readiness?.contract_ready === true,
    hosted_live_ready: readiness.readiness?.hosted_live_ready === true,
    public_live_ready: readiness.readiness?.public_live_ready === true,
    cloudflare_observed: readiness.readiness?.cloudflare_observed === true,
    check_count: checks.length,
    failed_check_count: failedChecks.length,
    failed_checks: failedChecks.slice(0, 20).map((check) => check?.name ?? 'unnamed-check'),
    hosted_required_ref_count: hostedRefs.required_count ?? null,
    hosted_required_ref_missing_count: hostedRefs.missing_count ?? null,
    external_blocker_count: Array.isArray(readiness.external_blockers) ? readiness.external_blockers.length : null,
    external_blockers: Array.isArray(readiness.external_blockers) ? readiness.external_blockers.slice(0, 40) : [],
  };
}

function infrastructureBlockers(summary) {
  const blockers = [];
  if (summary.mode !== 'live') blockers.push(`mode is ${summary.mode}`);
  if (summary.contract_ready !== true) blockers.push('contract_ready is false');
  if (summary.public_live_ready !== true) blockers.push('public_live_ready is false');
  if (summary.cloudflare_observed !== true) blockers.push('cloudflare_observed is false');
  if (summary.hosted_live_ready !== true) blockers.push('hosted_live_ready is false');
  if (typeof summary.hosted_required_ref_missing_count === 'number' && summary.hosted_required_ref_missing_count !== 0) blockers.push(`hosted missing refs: ${summary.hosted_required_ref_missing_count}`);
  for (const name of summary.failed_checks ?? []) blockers.push(`failed check ${name}`);
  for (const item of summary.external_blockers ?? []) blockers.push(item);
  return blockers;
}

function summarizeReleaseAudit(audit) {
  if (audit === null) {
    return {
      schema: RELEASE_AUDIT_SCHEMA,
      ok: false,
      provided_audit: false,
      required_failed_count: null,
      gate_count: null,
      generated_at: null,
    };
  }
  return {
    schema: audit.schema,
    ok: audit.ok === true,
    provided_audit: true,
    required_failed_count: Array.isArray(audit.required_failed) ? audit.required_failed.length : null,
    gate_count: Array.isArray(audit.gates) ? audit.gates.length : null,
    gate_names: Array.isArray(audit.gates) ? audit.gates.map((gate) => gate?.name).filter((name) => typeof name === 'string').slice(0, 80) : [],
    generated_at: typeof audit.generated_at === 'string' ? audit.generated_at : null,
  };
}

function summarizePages(packet) {
  return {
    schema: packet.schema,
    local_artifact_ready: packet.local_artifact_ready === true,
    automated_deploy_ready: packet.automated_deploy_ready === true,
    credential_present: packet.credential_present === true,
    artifact_file_count: packet.artifact?.file_count ?? null,
    artifact_root_hash: packet.artifact?.root_hash ?? null,
    security_blocker_count: packet.security?.blocker_count ?? null,
    deployment_blockers: Array.isArray(packet.deployment_blockers) ? packet.deployment_blockers : [],
    live_observation: packet.live_observation === null ? null : {
      ok: packet.live_observation.ok === true,
      live_url: packet.live_observation.live_url,
      status: packet.live_observation.status,
      title: packet.live_observation.title,
      title_matched: packet.live_observation.title_matched === true,
      blockers: packet.live_observation.blockers ?? [],
    },
  };
}

function buildNextActions({ projectName, domain, credentialsPresent, pages, infrastructure, operatorAcceptance, releaseAudit }) {
  const actions = [];
  const credentialsReady = credentialsPresent?.cloudflare_api_token === true && credentialsPresent?.cloudflare_account_id === true;
  const pagesReady = pages?.automated_deploy_ready === true && pages?.live_observation?.ok === true;
  if (!credentialsReady) {
    actions.push({
      id: 'create-cloudflare-token',
      owner: 'operator',
      command: 'Create or inject CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID with least-privilege Pages access; do not paste token into chat.',
      evidence: 'npm run cloudflare:ops -- token verify --account-id <account-id>',
    });
  }
  if (!pagesReady) {
    actions.push({
      id: 'deploy-current-static-site',
      owner: 'operator-or-ai-with-token',
      command: `npm run cloudflare:pages:stage && npm run cloudflare:ops -- pages deploy --site .enigma/cloudflare-pages/enigmamemory.com --project-name ${shellArg(projectName)} --execute`,
      evidence: `npm run cloudflare:ops -- pages verify --url ${shellArg(`https://${domain}/`)} --project-name ${shellArg(projectName)} --domain ${shellArg(domain)} --cloudflare-live required`,
    });
  }
  if (infrastructure?.hosted_live_ready !== true) {
    actions.push({
      id: 'optional-standalone-worker-probe',
      owner: 'operator-or-ai-with-token',
      command: 'npm run production:hosted-probe -- --out-dir <dir> && npm run cloudflare:ops -- workers inspect-probe --name enigma-hosted-probe && npm run cloudflare:ops -- workers deploy-probe --script <dir>/worker.mjs --name enigma-hosted-probe --execute',
      evidence: 'Cloudflare Worker /livez 200 and /readyz fail-closed until all refs and operator go exist; standalone edge probe only, not relay/gateway live evidence',
    });
    actions.push({
      id: 'provision-hosted-backend',
      owner: 'operator',
      command: 'Deploy relay/gateway using deploy/docker-compose.production.example.yml or deploy/kubernetes/enigma-backend.example.yaml with all ENIGMA_*_REF evidence refs and secrets provided out-of-band.',
      evidence: 'npm run infrastructure:readiness -- --manifest <completed-manifest.json> --live --cloudflare-live required',
    }, {
      id: 'validate-hosted-backend-live-evidence',
      owner: 'operator-or-reviewer',
      command: 'npm run production:hosted-live -- --evidence <hosted-backend-live.json>',
      evidence: 'accepted enigma.hosted_backend_live_result.v1 with four public HTTPS relay/gateway /livez and /readyz probes, all hosted refs, and operator acceptance go',
    });
  }
  if (operatorAcceptance?.ok !== true) {
    actions.push({
      id: 'generate-operator-evidence-starter',
      owner: 'operator-or-reviewer',
      command: `npm run production:evidence-starter -- --out-dir <evidence-dir> --domain ${shellArg(domain)} --tenant <tenant-id>`,
      evidence: '<evidence-dir>/hosted-refs.template.json, hosted-backend-live.template.json, owner-approval-refs.template.json, evidence-refs.template.json, hosted-backend-live-collection.json/hosted-backend-live.json flow, acceptance-fill-plan.json, plus production:acceptance:packet and production:acceptance validation',
    });
    actions.push({
      id: 'complete-operator-acceptance',
      owner: 'operator',
      command: 'npm run production:acceptance:packet -- --out <evidence-dir>/operator-acceptance-packet.json --owners-json <evidence-dir>/owner-approval-refs.json --evidence-refs <evidence-dir>/evidence-refs.json --readiness <evidence-dir>/infrastructure-readiness-live.json --manifest <evidence-dir>/infrastructure-readiness-manifest.json --storage <evidence-dir>/production-storage-migration.json --release-audit .enigma/release-audit-current.json --production-manifests <evidence-dir>/production-manifests.json --decision go --tenant <tenant-id> --target-regions <regions> --requested-go-live-date <date> --evidence-repository <evidence-repository> --packet-owner <operator> --validate && npm run production:acceptance -- --packet <evidence-dir>/operator-acceptance-packet.json',
      evidence: '<evidence-dir>/operator-acceptance-packet.json accepted with decision go and zero blockers',
    });
  }
  if (releaseAudit?.ok !== true) {
    actions.push({
      id: 'final-release-audit',
      owner: 'reviewer',
      command: 'npm run check && npm test && npm run release:audit',
      evidence: 'release audit ok:true and required_failed:[]',
    });
  }
  return actions;
}

async function readJsonInput(path, label) {
  try {
    return JSON.parse(await readFile(resolve(path), 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) throw new UsageError(`${label} JSON is invalid`);
    throw new UsageError(`${label} JSON could not be read`);
  }
}

async function loadOperatorAcceptancePacket(input) {
  if (input.operatorPacket && typeof input.operatorPacket === 'object') return input.operatorPacket;
  if (input.operatorAcceptancePacket && typeof input.operatorAcceptancePacket === 'object') return input.operatorAcceptancePacket;
  const packetPath = optionalText(input.operatorAcceptancePacketPath ?? input.operatorAcceptancePacket, null);
  if (packetPath === null) return null;
  return await readJsonInput(packetPath, 'operator acceptance packet');
}

async function loadInfrastructureReadiness(input) {
  if (input.infrastructureReadiness && typeof input.infrastructureReadiness === 'object') return input.infrastructureReadiness;
  const readinessPath = optionalText(input.infrastructureReadinessPath ?? input.infrastructureReadiness, null);
  if (readinessPath === null) return null;
  return await readJsonInput(readinessPath, 'infrastructure readiness');
}

async function loadReleaseAudit(input) {
  if (input.releaseAudit && typeof input.releaseAudit === 'object') return input.releaseAudit;
  const auditPath = optionalText(input.releaseAuditPath ?? input.releaseAudit, null);
  if (auditPath === null) return null;
  return await readJsonInput(auditPath, 'release audit');
}

function requireInfrastructureReadinessResult(value) {
  if (value === null) return null;
  assertNoSecretMaterial(value, { path: 'infrastructure_readiness' });
  assertNoUnsafeMaterial('infrastructure readiness JSON', value);
  if (value?.schema !== INFRASTRUCTURE_READINESS_SCHEMA) throw new UsageError(`infrastructure readiness JSON must use schema ${INFRASTRUCTURE_READINESS_SCHEMA}`);
  if (value.ok !== true) throw new UsageError('infrastructure readiness JSON must have ok:true');
  if (value.mode !== 'live') throw new UsageError('infrastructure readiness JSON must be live-mode evidence');
  if (value.readiness?.contract_ready !== true) throw new UsageError('infrastructure readiness JSON must have readiness.contract_ready:true');
  if (value.readiness?.public_live_ready !== true) throw new UsageError('infrastructure readiness JSON must have readiness.public_live_ready:true');
  if (value.readiness?.cloudflare_observed !== true) throw new UsageError('infrastructure readiness JSON must have readiness.cloudflare_observed:true');
  if (value.readiness?.hosted_live_ready !== true) throw new UsageError('infrastructure readiness JSON must have readiness.hosted_live_ready:true');
  if (!Array.isArray(value.checks) || value.checks.length === 0) throw new UsageError('infrastructure readiness JSON must include passing checks');
  const checkNames = new Set(value.checks.map((check) => check?.name).filter((name) => typeof name === 'string'));
  const missingChecks = COMPLETED_INFRASTRUCTURE_CHECK_NAMES.filter((name) => !checkNames.has(name));
  if (missingChecks.length > 0) throw new UsageError(`infrastructure readiness JSON missing completed live checks: ${missingChecks.join(', ')}`);
  const failedChecks = value.checks.filter((check) => check?.ok !== true);
  if (failedChecks.length > 0) throw new UsageError('infrastructure readiness JSON must not include failed checks');
  const hostedRefs = value.checks.find((check) => check?.name === 'hosted.required_refs');
  if (hostedRefs?.missing_count !== 0) throw new UsageError('infrastructure readiness JSON must have zero hosted.required_refs missing_count');
  if (!Array.isArray(value.external_blockers) || value.external_blockers.length !== 0) throw new UsageError('infrastructure readiness JSON must have zero external_blockers');
  return value;
}
function requireReleaseAuditResult(value) {
  if (value === null) return null;
  if (value?.schema !== RELEASE_AUDIT_SCHEMA) throw new UsageError(`release audit JSON must use schema ${RELEASE_AUDIT_SCHEMA}`);
  if (value.ok !== true) throw new UsageError('release audit JSON must have ok:true');
  if (!Array.isArray(value.required_failed)) throw new UsageError('release audit JSON must include required_failed array');
  if (value.required_failed.length !== 0) throw new UsageError('release audit JSON must have zero required_failed gates');
  if (!Array.isArray(value.gates) || value.gates.length === 0) throw new UsageError('release audit JSON must include gate evidence');
  return value;
}

export async function buildProductionHandoffPacket(input = {}, options = {}) {
  const env = options.env ?? process.env;
  const generatedAt = options.generated_at ?? options.generatedAt ?? new Date().toISOString();
  const site = resolve(requireText('--site', input.site));
  const projectName = requireText('--project-name', input.projectName ?? 'enigma-memory');
  const domain = optionalText(input.domain, 'enigmamemory.com');
  const liveUrl = optionalText(input.liveUrl, domain ? `https://${domain}/` : null);
  const expectTitle = optionalText(input.expectTitle, 'Enigma');

  const providedInfrastructure = requireInfrastructureReadinessResult(await loadInfrastructureReadiness(input));
  const operatorPacket = await loadOperatorAcceptancePacket(input) ?? await buildOperatorAcceptancePacket({ generated_at: generatedAt });
  assertNoSecretOutput('operator acceptance packet', operatorPacket);
  const operatorAcceptance = validateOperatorAcceptancePacket(operatorPacket, { generated_at: generatedAt });
  if (operatorAcceptance.ok === true) requireInfrastructureReadinessResult(operatorPacket.readiness);
  const providedReleaseAudit = requireReleaseAuditResult(await loadReleaseAudit(input));

  const pages = await buildCloudflarePagesReleasePacket({
    site,
    projectName,
    domain,
    liveUrl,
    expectTitle,
  }, {
    env,
    generated_at: generatedAt,
    fetchImpl: options.fetchImpl ?? globalThis.fetch,
  });

  const infrastructure = providedInfrastructure ?? await runInfrastructureReadiness({
    manifest: await buildProductionReadinessManifest({
      env,
      generated_at: generatedAt,
    }),
  }, {
    env,
    live: false,
    cloudflareLive: 'off',
    now: new Date(generatedAt),
    fetchImpl: options.fetchImpl ?? globalThis.fetch,
  });

  const hostedProbe = buildHostedProbeWorkerBundle({ generated_at: generatedAt });
  const pageSummary = summarizePages(pages);
  const infrastructureSummary = summarizeInfrastructure(infrastructure);
  infrastructureSummary.provided_readiness = providedInfrastructure !== null;
  assertNoUnsafeOutput('infrastructure readiness summary', infrastructureSummary);
  const operatorSummary = {
    schema: operatorAcceptance.schema,
    ok: operatorAcceptance.ok === true,
    decision: operatorAcceptance.decision,
    blocker_count: operatorAcceptance.blockers.length,
    warning_count: operatorAcceptance.warnings.length,
    blocker_breakdown: operatorAcceptance.blocker_breakdown ?? {},
    packet_id: operatorPacket.metadata?.packet_id ?? null,
    provided_packet: (input.operatorPacket && typeof input.operatorPacket === 'object') || (input.operatorAcceptancePacket && typeof input.operatorAcceptancePacket === 'object') || typeof input.operatorAcceptancePacket === 'string' || typeof input.operatorAcceptancePacketPath === 'string',
  };
  assertNoUnsafeOutput('operator acceptance summary', operatorSummary);
  const credentialSummary = {
    cloudflare_api_token: typeof env.CLOUDFLARE_API_TOKEN === 'string' && env.CLOUDFLARE_API_TOKEN.length > 0,
    cloudflare_account_id: typeof env.CLOUDFLARE_ACCOUNT_ID === 'string' && env.CLOUDFLARE_ACCOUNT_ID.length > 0,
  };

  const releaseAuditSummary = summarizeReleaseAudit(providedReleaseAudit);
  assertNoUnsafeOutput('release audit summary', releaseAuditSummary);

  const blockers = [
    ...pageSummary.deployment_blockers.map((item) => `pages: ${item}`),
    ...infrastructureBlockers(infrastructureSummary).map((item) => `infrastructure: ${item}`),
    ...(operatorSummary.ok ? [] : [`operator_acceptance: ${operatorSummary.blocker_count} blockers`]),
    ...(releaseAuditSummary.ok ? [] : ['release_audit: accepted current release audit evidence required']),
  ];

  const packet = {
    schema: PRODUCTION_HANDOFF_PACKET_SCHEMA,
    generated_at: generatedAt,
    project: {
      name: 'Enigma Memory',
      domain,
      cloudflare_pages_project: projectName,
      local_site_path_redacted: true,
    },
    go_live_ready: pageSummary.automated_deploy_ready === true
      && infrastructureSummary.hosted_live_ready === true
      && operatorSummary.ok === true
      && releaseAuditSummary.ok === true,
    local_static_artifact_ready: pageSummary.local_artifact_ready === true,
    credentials_present: credentialSummary,
    pages: pageSummary,
    infrastructure: infrastructureSummary,
    operator_acceptance: operatorSummary,
    release_audit: releaseAuditSummary,
    hosted_probe_worker: {
      schema: hostedProbe.schema,
      ok: hostedProbe.ok,
      worker_name: hostedProbe.worker_name,
      source_hash: hostedProbe.validation.source_hash,
      required_env_ref_count: hostedProbe.required_env_refs.length,
      default_routes: hostedProbe.deployment_plan.default_routes,
      mutates_cloudflare: hostedProbe.deployment_plan.mutates_cloudflare,
      claim_boundary: hostedProbe.claim_boundary,
    },
    next_actions: buildNextActions({ projectName, domain, credentialsPresent: credentialSummary, pages: pageSummary, infrastructure: infrastructureSummary, operatorAcceptance: operatorSummary, releaseAudit: releaseAuditSummary }),
    blockers: [...new Set(blockers)],
    claim_boundary: [
      'This is a handoff packet for production operators and follow-on AI assistants.',
      'It summarizes current local artifacts and blockers without printing tokens, credentials, local paths, raw memory, personal contact data, or provider secrets.',
      'go_live_ready is false until Cloudflare deploy evidence, hosted backend live checks, completed operator acceptance, and release audit evidence are all current and direct.',
    ],
  };
  assertNoUnsafeMaterial('production handoff packet', packet);
  return packet;
}

export async function runCli(argv = process.argv.slice(2), options = {}) {
  const parsed = parseArgs(argv);
  if (parsed.help) return { text: usage() };
  const secretEnv = await applyCloudflareSecretEnvFile(options.env ?? process.env, { path: parsed.envFile ?? undefined, includePath: false });
  const packet = await buildProductionHandoffPacket(parsed, { ...options, env: secretEnv.env });
  const json = `${JSON.stringify(packet, null, 2)}\n`;
  if (SECRET_OUTPUT_RE.test(json)) throw new Error('handoff packet output appears to contain a secret');
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
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(`${JSON.stringify({ schema: PRODUCTION_HANDOFF_PACKET_SCHEMA, ok: false, error: { code: error instanceof UsageError ? 'USAGE_ERROR' : 'HANDOFF_PACKET_ERROR', message } }, null, 2)}\n`);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  }
}
