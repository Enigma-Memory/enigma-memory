#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildProductionHandoffPacket } from './build-production-handoff-packet.mjs';
import { buildCloudflareTokenPolicy } from './build-cloudflare-token-policy.mjs';
import { runBackendReadinessSmoke } from './run-backend-readiness-smoke.mjs';
import { HOSTED_BACKEND_LIVE_EVIDENCE_SCHEMA, HOSTED_BACKEND_LIVE_RESULT_SCHEMA, REQUIRED_REF_KEYS } from './validate-hosted-backend-live.mjs';
import { validateProductionManifestFiles } from './validate-production-manifests.mjs';
import { applyCloudflareSecretEnvFile } from './cloudflare-secret-env.mjs';

export const GOAL_COMPLETION_AUDIT_SCHEMA = 'enigma.goal_completion_audit.v1';

const SECRET_OUTPUT_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|cf-[A-Za-z0-9_-]{12,})/iu;
const RAW_OUTPUT_RE = /(?:raw[\s_-]*memory|private[\s_-]*prompt|full[\s_-]*transcript|decrypted[\s_-]*(?:capsule|content)|provider[\s_-]*response|plain[\s_-]*text)/iu;

function assertNoUnsafeOutput(name, value, path = name) {
  if (typeof value === 'string') {
    if (SECRET_OUTPUT_RE.test(value)) throw new Error(`${path} appears to contain secret material`);
    if (!/\.claim_boundary\[\d+\]$/.test(path) && RAW_OUTPUT_RE.test(value)) throw new Error(`${path} appears to contain raw-memory material`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoUnsafeOutput(name, item, `${path}[${index}]`));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) assertNoUnsafeOutput(name, item, `${path}.${key}`);
  }
}

const DEFAULT_OBJECTIVE = 'Build Enigma Memory into a production-grade project with backend infrastructure, tests, professional math/diagram whitepaper, secure public site, deployment/handoff plan, GPT-5.5 architecture/review ownership, and Kimi Code implementation support without unsupported claims.';

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

function expandHostedBackendBlockers(infra) {
  const externalBlockers = Array.isArray(infra?.external_blockers) ? infra.external_blockers : [];
  const blockers = [
    `hosted_live_ready is ${infra?.hosted_live_ready}`,
    `hosted missing refs: ${infra?.hosted_required_ref_missing_count}`,
    ...externalBlockers,
  ];
  const listedRefs = new Set();
  for (const blocker of externalBlockers) {
    const match = typeof blocker === 'string' ? /^missing refs\.([A-Za-z0-9_]+)$/.exec(blocker) : null;
    if (match) listedRefs.add(match[1]);
  }
  const missingCount = Number(infra?.hosted_required_ref_missing_count ?? 0);
  if (missingCount > listedRefs.size) {
    for (const key of REQUIRED_REF_KEYS) {
      if (!listedRefs.has(key)) blockers.push(`missing refs.${key}`);
    }
  }
  return blockers;
}

function parseArgs(argv) {
  const out = {
    site: null,
    projectName: 'enigma-memory',
    domain: 'enigmamemory.com',
    liveUrl: 'https://enigmamemory.com/',
    expectTitle: 'Enigma',
    accountId: '<cloudflare-account-id>',
    objective: DEFAULT_OBJECTIVE,
    out: null,
    envFile: null,
    operatorAcceptancePacket: null,
    infrastructureReadiness: null,
    releaseAudit: null,
    workerInspect: null,
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
    else if (token === '--account-id') out.accountId = readValue(token);
    else if (token === '--objective') out.objective = readValue(token);
    else if (token === '--cloudflare-env-file') out.envFile = readValue(token);
    else if (token === '--operator-acceptance-packet' || token === '--operatorAcceptancePacket') out.operatorAcceptancePacket = readValue(token);
    else if (token === '--infrastructure-readiness' || token === '--infrastructureReadiness') out.infrastructureReadiness = readValue(token);
    else if (token === '--release-audit' || token === '--releaseAudit') out.releaseAudit = readValue(token);
    else if (token === '--worker-inspect' || token === '--workerInspect') out.workerInspect = readValue(token);
    else if (token === '--out') out.out = readValue(token);
    else throw new UsageError(`unknown option ${token}`);
  }
  return out;
}

function usage() {
  return `Usage: node scripts/build-goal-completion-audit.mjs --site <dir> [options]\n\nOptions:\n  --project-name <name>             Cloudflare Pages project. Default: enigma-memory.\n  --domain <host>                   Public domain. Default: enigmamemory.com.\n  --live-url <url>                  Current public URL to observe. Default: https://enigmamemory.com/.\n  --expect-title <text>             Expected live title fragment. Default: Enigma.\n  --account-id <id>                 Cloudflare account id or placeholder for token-policy evidence.\n  --infrastructure-readiness <file> Completed infrastructure readiness JSON to summarize.\n  --operator-acceptance-packet <file> Completed operator packet JSON to validate and summarize.\n  --release-audit <file>            Current release audit JSON to summarize.\n  --worker-inspect <file>           Optional Worker inspection result; ready evidence suppresses the standalone probe action.\n  --cloudflare-env-file <file>      Load local Cloudflare env values without printing the path or values.\n  --objective <text>                Override objective text.\n  --out <file>                      Write audit JSON.\n  --help                            Show this help.\n`;
}

async function readText(path) {
  return await readFile(path, 'utf8');
}

async function readJsonPath(path) {
  if (!path) return null;
  return JSON.parse(await readFile(resolve(path), 'utf8'));
}

function nextActionsForGoalAudit(nextActions, workerInspect) {
  const actions = Array.isArray(nextActions) ? nextActions : [];
  if (workerInspect?.worker_permission_ready === true) return actions.filter((item) => item?.id !== 'optional-standalone-worker-probe');
  return actions;
}

function boolEvidence(ok, evidence, blockers = []) {
  const accepted = ok === true;
  return { ok: accepted, evidence, blockers: accepted ? [] : blockers.filter(Boolean) };
}

function blockerBreakdownLines(prefix, breakdown) {
  if (breakdown === null || typeof breakdown !== 'object' || Array.isArray(breakdown)) return [];
  return Object.entries(breakdown)
    .filter(([, count]) => Number.isFinite(count) && count > 0)
    .map(([name, count]) => `${prefix} ${name}: ${count}`);
}

async function inspectDocs() {
  const masterPlan = await readText(resolve('docs/overnight-build-master-plan.md'));
  const whitepaper = await readText(resolve('docs/enigma-memory-technical-whitepaper.md'));
  const evidence = await readText(resolve('docs/release-evidence-2026-06-23.md'));
  return {
    masterPlan,
    whitepaper,
    evidence,
  };
}

function deliverablesFromEvidence({ docs, handoff, tokenPolicy, backendSmoke, productionManifests }) {
  const pages = handoff.pages ?? {};
  const infra = handoff.infrastructure ?? {};
  const operator = handoff.operator_acceptance ?? {};
  const releaseAudit = handoff.release_audit ?? {};
  const releaseGateNames = new Set(Array.isArray(releaseAudit.gate_names) ? releaseAudit.gate_names : []);
  const deliverables = [];
  deliverables.push({
    id: 'orchestration-master-plan',
    requirement: 'Architecture/review owner and implementation-owner plan exists with claim boundaries and handoff cadence.',
    ...boolEvidence(
      /GPT-5\.5 owns architecture, design, and review/.test(docs.masterPlan) && /Kimi Code owns implementation/.test(docs.masterPlan),
      ['docs/overnight-build-master-plan.md'],
    ),
  });
  deliverables.push({
    id: 'whitepaper-math-diagrams',
    requirement: 'Professional whitepaper contains math and diagrams for the memory layer and its evidence-bounded comparison framework.',
    ...boolEvidence(
      /Memory-layer evaluation framework/.test(docs.whitepaper)
        && /D_E\(X\)/.test(docs.whitepaper)
        && /not a theorem of universal superiority/.test(docs.whitepaper)
        && /```mermaid/.test(docs.whitepaper)
        && (releaseAudit.provided_audit !== true || releaseGateNames.has('whitepaper-claims-validator')),
      ['docs/enigma-memory-technical-whitepaper.md', 'npm run production:whitepaper', 'release audit gate whitepaper-claims-validator'],
      ['whitepaper missing evaluation math, diagram, claim boundary, or current validator evidence'],
    ),
  });
  deliverables.push({
    id: 'local-tests-release-gates',
    requirement: 'Local package/test/release gates are green and documented as current local/package evidence.',
    ...boolEvidence(
      /release audit `ok:true`|release audit `ok: true`|`ok: true`/.test(docs.evidence) && /Full test suite \| PASS/.test(docs.evidence),
      ['docs/release-evidence-2026-06-23.md', 'npm run check && npm test && npm run release:audit'],
      ['release evidence row missing current green gate statement'],
    ),
  });
  deliverables.push({
    id: 'release-audit-current',
    requirement: 'Current release audit evidence is supplied, accepted, and has zero required gate failures.',
    ...boolEvidence(
      releaseAudit.ok === true && releaseAudit.required_failed_count === 0 && Number(releaseAudit.gate_count ?? 0) > 0,
      ['npm run check && npm test && npm run release:audit'],
      ['accepted release audit evidence was not supplied to the handoff packet'],
    ),
  });
  deliverables.push({
    id: 'local-backend-readiness-smoke',
    requirement: 'Relay and gateway loopback HTTP runtime verifies /livez, /readyz fail-closed production defaults, and fully referenced production fixtures.',
    ...boolEvidence(
      backendSmoke.ok === true
        && backendSmoke.check_count === 4
        && backendSmoke.checks?.filter((check) => check.mode === 'production-fail-closed' && check.readyz_status === 503).length === 2
        && backendSmoke.checks?.filter((check) => check.mode === 'production-referenced-fixture' && check.readyz_status === 200 && check.readyz_missing_evidence_ref_count === 0).length === 2,
      ['npm run production:backend-smoke', `${backendSmoke.check_count} checks`],
      ['backend readiness smoke did not prove fail-closed and fully referenced local runtime fixtures'],
    ),
  });
  deliverables.push({
    id: 'production-manifest-validator',
    requirement: 'Production Compose and Kubernetes backend manifests have standalone static validation for fail-closed hosted readiness shape.',
    ...boolEvidence(
      productionManifests.ok === true
        && productionManifests.compose?.public_ports_loopback_only === true
        && productionManifests.kubernetes?.public_readyz_paths === 2
        && productionManifests.kubernetes?.public_livez_paths === 2
        && productionManifests.kubernetes?.private_admin_ingress_class === true,
      ['npm run production:manifests', productionManifests.schema],
      ['production manifests were not accepted by standalone fail-closed validator'],
    ),
  });
  deliverables.push({
    id: 'hosted-live-evidence-contract',
    requirement: 'Hosted backend live evidence has a formal validator/schema requiring public HTTPS relay/gateway probes, all hosted refs, and operator acceptance go.',
    ...boolEvidence(
      HOSTED_BACKEND_LIVE_EVIDENCE_SCHEMA === 'enigma.hosted_backend_live_evidence.v1'
        && HOSTED_BACKEND_LIVE_RESULT_SCHEMA === 'enigma.hosted_backend_live_result.v1'
        && REQUIRED_REF_KEYS.length === 25,
      ['npm run production:hosted-live', 'specs/hosted-backend-live-evidence-v1.schema.json', `${REQUIRED_REF_KEYS.length} refs`],
      ['hosted backend live validator/schema contract missing or incomplete'],
    ),
  });
  deliverables.push({
    id: 'secure-static-site-artifact',
    requirement: 'Current local Enigma public-site artifact is preflighted and security-clean without personal data or secrets.',
    ...boolEvidence(
      pages.local_artifact_ready === true && Number(pages.security_blocker_count ?? 0) === 0,
      ['npm run cloudflare:pages:packet', pages.artifact_root_hash].filter(Boolean),
      ['local static artifact is not ready or has public-site security blockers'],
    ),
  });
  deliverables.push({
    id: 'live-domain-current-site',
    requirement: 'enigmamemory.com serves the current Enigma artifact, not legacy Engram.',
    ...boolEvidence(
      pages.live_observation?.ok === true && pages.live_observation?.title_matched === true,
      [pages.live_observation?.live_url, pages.live_observation?.title].filter(Boolean),
      pages.live_observation?.blockers?.length ? pages.live_observation.blockers : ['live site has not been observed serving the expected Enigma title'],
    ),
  });
  deliverables.push({
    id: 'cloudflare-token-policy',
    requirement: 'Cloudflare API token scope is specified without exposing a token.',
    ...boolEvidence(
      tokenPolicy.permission_groups?.some((item) => item.permission_name === 'Cloudflare Pages Edit')
        && tokenPolicy.permission_groups?.some((item) => item.permission_name === 'Registrar Edit')
        && tokenPolicy.mutation_boundaries?.token_value_printed === false,
      ['npm run cloudflare:token-policy', `${tokenPolicy.permission_groups?.length ?? 0} permissions`],
      ['Cloudflare token policy missing Pages/Registrar scope or token secrecy boundary'],
    ),
  });
  deliverables.push({
    id: 'cloudflare-credentials-present',
    requirement: 'A current Cloudflare API token/account id exists in the execution environment for deploy/verify operations.',
    ...boolEvidence(
      handoff.credentials_present?.cloudflare_api_token === true && handoff.credentials_present?.cloudflare_account_id === true,
      ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'],
      ['CLOUDFLARE_API_TOKEN and/or CLOUDFLARE_ACCOUNT_ID absent from current environment'],
    ),
  });
  deliverables.push({
    id: 'hosted-backend-live',
    requirement: 'Hosted relay/gateway/storage/KMS/SIEM/backup/operator infrastructure is live and directly verified.',
    ...boolEvidence(
      infra.hosted_live_ready === true,
      ['npm run infrastructure:readiness -- --manifest <completed> --live --cloudflare-live required'],
      expandHostedBackendBlockers(infra),
    ),
  });
  deliverables.push({
    id: 'operator-acceptance-go',
    requirement: 'Operator acceptance packet is go with zero blockers for the target environment.',
    ...boolEvidence(
      operator.ok === true && operator.decision === 'go' && operator.blocker_count === 0,
      ['npm run production:acceptance -- --packet <completed-packet.json>'],
      [`operator acceptance decision ${operator.decision}`, `${operator.blocker_count} operator blockers`, ...blockerBreakdownLines('operator blockers', operator.blocker_breakdown)],
    ),
  });
  deliverables.push({
    id: 'unsupported-claims-blocked',
    requirement: '$100B/best-in-world ambition is treated as ambition; collateral does not convert it into unsupported proof, ROI, compliance, or hosted-live claims.',
    ...boolEvidence(
      /unsupported_market_superlative/.test(docs.evidence) || /unsupported superlatives/.test(docs.evidence) || /unsupported launch claim/i.test(docs.masterPlan),
      ['docs/overnight-build-master-plan.md', 'docs/release-evidence-2026-06-23.md'],
      ['claim-boundary evidence missing unsupported-superlative controls'],
    ),
  });
  return deliverables;
}

export async function buildGoalCompletionAudit(input = {}, options = {}) {
  const env = options.env ?? process.env;
  const generatedAt = options.generated_at ?? options.generatedAt ?? new Date().toISOString();
  const site = resolve(requireText('--site', input.site));
  const projectName = requireText('--project-name', input.projectName ?? 'enigma-memory');
  const domain = optionalText(input.domain, 'enigmamemory.com');
  const liveUrl = optionalText(input.liveUrl, domain ? `https://${domain}/` : null);
  const expectTitle = optionalText(input.expectTitle, 'Enigma');
  const accountId = optionalText(input.accountId, '<cloudflare-account-id>');
  const docs = await inspectDocs();
  const handoff = await buildProductionHandoffPacket({ site, projectName, domain, liveUrl, expectTitle, infrastructureReadiness: input.infrastructureReadiness, operatorAcceptancePacket: input.operatorAcceptancePacket, releaseAudit: input.releaseAudit }, {
    env,
    generated_at: generatedAt,
    fetchImpl: options.fetchImpl ?? globalThis.fetch,
  });
  const workerInspect = await readJsonPath(input.workerInspect);
  const tokenPolicy = buildCloudflareTokenPolicy({
    mode: 'all',
    accountId,
    projectName,
    domain,
    generated_at: generatedAt,
  });
  const backendSmoke = await runBackendReadinessSmoke({
    generated_at: generatedAt,
  });
  const productionManifests = await validateProductionManifestFiles({ generated_at: generatedAt });
  const deliverables = deliverablesFromEvidence({ docs, handoff, tokenPolicy, backendSmoke, productionManifests });
  const blockers = deliverables.flatMap((item) => item.ok ? [] : item.blockers.map((blocker) => `${item.id}: ${blocker}`));
  const deliverableById = new Map(deliverables.map((item) => [item.id, item]));
  const staticSiteLive = deliverableById.get('secure-static-site-artifact')?.ok === true
    && deliverableById.get('live-domain-current-site')?.ok === true
    && deliverableById.get('cloudflare-credentials-present')?.ok === true;
  const releasePosture = blockers.length === 0
    ? 'complete'
    : (staticSiteLive ? 'static_site_live_with_blocked_hosted_backend' : 'local_package_artifact_ready_with_blocked_live_infrastructure');
  const audit = {
    schema: GOAL_COMPLETION_AUDIT_SCHEMA,
    generated_at: generatedAt,
    objective: optionalText(input.objective, DEFAULT_OBJECTIVE),
    complete: blockers.length === 0,
    release_posture: releasePosture,
    go_live_ready: handoff.go_live_ready === true,
    local_static_artifact_ready: handoff.local_static_artifact_ready === true,
    backend_readiness_smoke: {
      ok: backendSmoke.ok,
      check_count: backendSmoke.check_count,
      loopback_only: backendSmoke.loopback_only,
    },
    production_manifest_validation: {
      ok: productionManifests.ok,
      status: productionManifests.status,
      blocker_count: productionManifests.blockers.length,
    },
    deliverables,
    blockers,
    next_actions: nextActionsForGoalAudit(handoff.next_actions, workerInspect),
    claim_boundary: [
      'This audit preserves the original objective and maps it to current direct evidence.',
      'complete:false remains expected until hosted backend, operator acceptance, and provider evidence exist; static Cloudflare Pages deploy alone is not enough.',
      'Ambition language is not treated as proof of market value, ROI, compliance status, benchmark leadership, hosted-live readiness, provider deletion, or model forgetting.',
    ],
  };
  assertNoUnsafeOutput('goal completion audit', audit);
  return audit;
}

export async function runCli(argv = process.argv.slice(2), options = {}) {
  const parsed = parseArgs(argv);
  if (parsed.help) return { text: usage() };
  const secretEnv = await applyCloudflareSecretEnvFile(options.env ?? process.env, { path: parsed.envFile ?? undefined, includePath: false });
  const packet = await buildGoalCompletionAudit(parsed, { ...options, env: secretEnv.env });
  const json = `${JSON.stringify(packet, null, 2)}\n`;
  if (SECRET_OUTPUT_RE.test(json)) throw new Error('goal completion audit output appears to contain a secret');
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
    process.stdout.write(`${JSON.stringify({ schema: GOAL_COMPLETION_AUDIT_SCHEMA, ok: false, error: { code: error instanceof UsageError ? 'USAGE_ERROR' : 'GOAL_COMPLETION_AUDIT_ERROR', message } }, null, 2)}\n`);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  }
}
