#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PRODUCTION_DEPENDENCY_REPORT_SCHEMA = 'enigma.production_dependency_report.v1';

const SECRET_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|sk-[A-Za-z0-9_-]{16,}|https?:\/\/[^\s/@]+:[^\s/@]+@|\b[0-9a-f]{32}\b|[A-Z]:\\Users\\|\/Users\/|\/home\/|raw memory|private prompt|full transcript|decrypted capsule)/iu;
const FORBIDDEN_KEY_RE = /(?:password|api[_-]?key|private[_-]?key|secret|token|account[_-]?id|raw[_-]?memory|plaintext|prompt|transcript|provider[_-]?response|cookie|session)/iu;
const SAFE_KEY_RE = /^(?:tokenPrinted|token_printed|token_policy_ready|cloudflare_token_policy|account_id_redacted|account_id_printed|token_value_printed|raw_memory_on_chain)$/u;
const SAFE_METRIC_KEY_RE = /(?:^token_roi_claim$|^token_value_printed$|^tokenPrinted$|^token_printed$|^token_created$|tokens$|token_count$|prompt_count$|_present$|_findings$)/iu;

function assertPublicSafe(value, path = 'dependency_report') {
  if (typeof value === 'string') {
    if (SECRET_RE.test(value)) throw new Error(`${path} contains non-public material`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertPublicSafe(item, `${path}[${index}]`));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const safeMetric = SAFE_METRIC_KEY_RE.test(key) && (typeof child === 'number' || typeof child === 'boolean');
    if (FORBIDDEN_KEY_RE.test(key) && !SAFE_KEY_RE.test(key) && !safeMetric) throw new Error(`${path}.${key} is not allowed in public dependency report`);
    assertPublicSafe(child, `${path}.${key}`);
  }
}

function requireObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  assertPublicSafe(value, label);
  return value;
}

function requirePlainObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function requireEdgeLiveEvidence(value) {
  const edgeLive = requirePlainObject(value, 'edge_live');
  const { claim_boundary: _claimBoundary, ...publicFields } = edgeLive;
  assertPublicSafe(publicFields, 'edge_live');
  return edgeLive;
}

function requireStorageBootstrapEvidence(value) {
  const storage = requirePlainObject(value, 'storage_bootstrap');
  const { claim_boundary: _claimBoundary, cost_boundary: _costBoundary, ...publicFields } = storage;
  assertPublicSafe(publicFields, 'storage_bootstrap');
  return storage;
}

function requireEdgeDeploymentEvidence(value) {
  const deployment = requirePlainObject(value, 'edge_deploy');
  const { claim_boundary: _claimBoundary, cost_boundary: _costBoundary, provision_secrets: _provisionSecrets, secret_values_printed: _secretValuesPrinted, tokenPrinted: _tokenPrinted, token_printed: _tokenPrintedSnake, accountIdPrinted: _accountIdPrinted, account_id_printed: _accountIdPrintedSnake, resourceIdsPrinted: _resourceIdsPrinted, resource_ids_printed: _resourceIdsPrintedSnake, services, ...rest } = deployment;
  const publicFields = { ...rest, services: Array.isArray(services) ? services.map(({ secrets: _secrets, ...service }) => service) : services };
  assertPublicSafe(publicFields, 'edge_deploy');
  return deployment;
}



async function readJson(path, label) {
  const parsed = JSON.parse(await readFile(resolve(path), 'utf8'));
  if (label === 'release_audit') return requirePlainObject(parsed, label);
  if (label === 'edge_deploy') return requireEdgeDeploymentEvidence(parsed);
  if (label === 'edge_live') return requireEdgeLiveEvidence(parsed);
  if (label === 'storage_bootstrap') return requireStorageBootstrapEvidence(parsed);
  return requireObject(parsed, label);
}

function byId(deliverables = []) {
  const out = new Map();
  for (const item of Array.isArray(deliverables) ? deliverables : []) {
    if (typeof item?.id === 'string') out.set(item.id, item);
  }
  return out;
}

function group(name, ready, evidence, blockers, nextCommand) {
  const isReady = ready === true;
  return {
    name,
    ready: isReady,
    evidence: evidence.filter(Boolean),
    blocker_count: blockers.length,
    blockers: blockers.slice(0, 40),
    next_command: isReady ? null : nextCommand,
  };
}

function firstActionIndex(actions, ids) {
  const wanted = new Set(ids);
  return actions.findIndex((item) => wanted.has(item?.id));
}

function orderedNextActions(actions) {
  const priority = new Map([
    ['generate-operator-evidence-starter', 10],
    ['optional-standalone-worker-probe', 5],
    ['generate-backend-env-kit', 20],
    ['provision-hosted-backend', 30],
    ['validate-hosted-backend-live-evidence', 40],
    ['complete-operator-acceptance', 50],
  ]);
  return actions
    .map((action, index) => ({ action, index }))
    .sort((left, right) => {
      const leftPriority = priority.get(left.action?.id) ?? (100 + left.index);
      const rightPriority = priority.get(right.action?.id) ?? (100 + right.index);
      return leftPriority - rightPriority || left.index - right.index;
    })
    .map((entry) => entry.action);
}

export function buildProductionDependencyReport(inputs = {}, options = {}) {
  const goalAudit = requireObject(inputs.goalAudit, 'goal_audit');
  const releaseAudit = requirePlainObject(inputs.releaseAudit, 'release_audit');
  const workerInspect = requireObject(inputs.workerInspect, 'worker_inspect');
  const whitepaper = requireObject(inputs.whitepaper, 'whitepaper');
  const credentialEvidence = inputs.cloudflareCredentials === undefined || inputs.cloudflareCredentials === null
    ? null
    : requireObject(inputs.cloudflareCredentials, 'cloudflare_credentials');
  if (goalAudit.schema !== 'enigma.goal_completion_audit.v1') throw new Error('goal audit schema mismatch');
  if (releaseAudit.schema !== 'enigma.release_audit.v1') throw new Error('release audit schema mismatch');
  if (workerInspect.schema !== 'enigma.cloudflare_worker_inspection_result.v1') throw new Error('worker inspect schema mismatch');
  if (whitepaper.schema !== 'enigma.whitepaper_claims_result.v1') throw new Error('whitepaper schema mismatch');
  if (credentialEvidence !== null && credentialEvidence.schema !== 'enigma.cloudflare_credentials_result.v1') throw new Error('Cloudflare credential schema mismatch');
  const edgeDeploy = inputs.edgeDeploy === undefined || inputs.edgeDeploy === null
    ? null
    : requireEdgeDeploymentEvidence(inputs.edgeDeploy);
  if (edgeDeploy !== null && edgeDeploy.schema !== 'enigma.edge_backend_deployment.v1') throw new Error('edge deploy schema mismatch');
  const edgeLive = inputs.edgeLive === undefined || inputs.edgeLive === null
    ? null
    : requireEdgeLiveEvidence(inputs.edgeLive);
  const storageBootstrap = inputs.storageBootstrap === undefined || inputs.storageBootstrap === null
    ? null
    : requireStorageBootstrapEvidence(inputs.storageBootstrap);
  if (storageBootstrap !== null && storageBootstrap.schema !== 'enigma.cloudflare_storage_bootstrap.v1') throw new Error('storage bootstrap schema mismatch');
  if (edgeLive !== null && edgeLive.schema !== 'enigma.edge_backend_bootstrap_live_evidence.v1') throw new Error('edge live schema mismatch');

  const deliverables = byId(goalAudit.deliverables);
  const hosted = deliverables.get('hosted-backend-live');
  const operator = deliverables.get('operator-acceptance-go');
  const liveSite = deliverables.get('live-domain-current-site');
  const whitepaperDeliverable = deliverables.get('whitepaper-math-diagrams');
  const cloudflareCredentials = credentialEvidence ?? deliverables.get('cloudflare-credentials-present');
  const releaseGateNames = new Set(Array.isArray(releaseAudit.gates) ? releaseAudit.gates.map((gate) => gate?.name).filter((name) => typeof name === 'string') : []);
  assertPublicSafe([...releaseGateNames], 'release_audit.gate_names');
  const groups = [
    group(
      'static_site',
      liveSite?.ok === true,
      liveSite?.evidence ?? [],
      liveSite?.blockers ?? ['live domain evidence missing'],
      'npm run production:goal-audit -- --site <public-site-dir> --domain enigmamemory.com --release-audit .enigma/release-audit-current.json',
    ),
    group(
      'release_gates',
      releaseAudit.ok === true && Array.isArray(releaseAudit.required_failed) && releaseAudit.required_failed.length === 0,
      ['npm run check', 'npm test', 'npm run release:audit'],
      Array.isArray(releaseAudit.required_failed) ? releaseAudit.required_failed.map(String) : ['release audit required_failed missing'],
      'npm run check && npm test && npm run release:audit -- --out .enigma/release-audit-current.json',
    ),
    group(
      'whitepaper_claims',
      whitepaper.ok === true && whitepaperDeliverable?.ok === true && releaseGateNames.has('whitepaper-claims-validator'),
      ['npm run production:whitepaper', 'release audit gate whitepaper-claims-validator'],
      [
        ...(whitepaper.blockers ?? []),
        ...(whitepaperDeliverable?.blockers ?? []),
        ...(releaseGateNames.has('whitepaper-claims-validator') ? [] : ['release audit missing whitepaper-claims-validator gate']),
      ],
      'npm run production:whitepaper -- --file docs/enigma-memory-technical-whitepaper.md --out .enigma/whitepaper-claims-current.json',
    ),
    group(
      'cloudflare_credentials',
      credentialEvidence !== null ? credentialEvidence.credentials_present === true : cloudflareCredentials?.ok === true,
      credentialEvidence !== null ? ['npm run production:cloudflare-credentials', ...(credentialEvidence.present_keys ?? [])] : (cloudflareCredentials?.evidence ?? ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']),
      credentialEvidence !== null ? credentialEvidence.blockers ?? [] : (cloudflareCredentials?.blockers ?? ['Cloudflare credential deliverable missing']),
      'Inject CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID out-of-band, then rerun production:cloudflare-credentials, production:goal-audit, and production:dependencies.',
    ),
    group(
      'cloudflare_worker_permission',
      workerInspect.worker_permission_ready === true,
      ['npm run cloudflare:ops -- workers inspect-probe --out .enigma/worker-inspect-current.json', 'npm run production:worker-inspect -- --evidence .enigma/worker-inspect-current.json'],
      workerInspect.worker_permission_ready === true ? [] : (workerInspect.permission_blockers ?? ['Worker permission not ready']),
      'Fix Cloudflare token/account Workers Scripts scope, then rerun worker inspect and deploy-probe.',
    ),
    ...(edgeDeploy === null ? [] : [group(
      'edge_backend_deployment',
      edgeDeploy.ok === true && edgeDeploy.status === 'deployed',
      [
        'npm run production:edge-deploy',
        ...((edgeDeploy.services ?? []).map((service) => service.hostname).filter(Boolean)),
      ],
      edgeDeploy.ok === true && edgeDeploy.status === 'deployed' ? [] : (edgeDeploy.blockers ?? ['edge backend deployment missing or not deployed']),
      'npm run production:edge-deploy -- --execute --provision-secrets --out .enigma/edge-backend-deployment-current.json',
    )]),
    ...(edgeLive === null ? [] : [group(
      'edge_backend_bootstrap',
      edgeLive.ok === true,
      [
        'npm run production:edge-live',
        'https://relay.enigmamemory.com/livez',
        'https://gateway.enigmamemory.com/livez',
      ],
      edgeLive.ok === true ? [] : (edgeLive.blockers ?? ['edge backend bootstrap evidence missing or blocked']),
      'npm run production:edge-live -- --domain enigmamemory.com --out .enigma/edge-backend-bootstrap-live-current.json',
    )]),
    ...(storageBootstrap === null ? [] : [group(
      'cloudflare_storage_bootstrap',
      storageBootstrap.ok === true,
      [
        'npm run production:storage-bootstrap',
        ...((storageBootstrap.resources ?? []).map((resource) => resource.ref).filter(Boolean)),
      ],
      storageBootstrap.ok === true ? [] : (storageBootstrap.blockers ?? ['cloudflare storage bootstrap missing or blocked']),
      'npm run production:storage-bootstrap -- --execute --out .enigma/cloudflare-storage-bootstrap-current.json',
    )]),
    group(
      'hosted_backend_live',
      hosted?.ok === true,
      hosted?.evidence ?? [],
      hosted?.blockers ?? ['hosted backend deliverable missing'],
      'Provision relay/gateway/storage/KMS/SIEM/backup refs, then run infrastructure:readiness -- --live --cloudflare-live required.',
    ),
    group(
      'operator_acceptance',
      operator?.ok === true,
      operator?.evidence ?? [],
      operator?.blockers ?? ['operator acceptance deliverable missing'],
      'npm run production:acceptance:packet -- --out <evidence-dir>/operator-acceptance-packet.json --owners-json <evidence-dir>/owner-approval-refs.json --evidence-refs <evidence-dir>/evidence-refs.json --readiness <evidence-dir>/infrastructure-readiness-live.json --manifest <evidence-dir>/infrastructure-readiness-manifest.json --storage <evidence-dir>/production-storage-migration.json --release-audit .enigma/release-audit-current.json --production-manifests <evidence-dir>/production-manifests.json --decision go --tenant <tenant-id> --target-regions <regions> --requested-go-live-date <date> --evidence-repository <evidence-repository> --packet-owner <operator> --validate && npm run production:acceptance -- --packet <evidence-dir>/operator-acceptance-packet.json',
    ),
  ];
  const blockers = groups.flatMap((item) => item.blockers.map((text) => `${item.name}: ${text}`));
  const readyGroupNames = new Set(groups.filter((item) => item.ready === true).map((item) => item.name));
  const skippedActionIds = new Set([
    ...(readyGroupNames.has('cloudflare_worker_permission') ? ['optional-standalone-worker-probe'] : []),
  ]);
  const nextActions = Array.isArray(goalAudit.next_actions)
    ? goalAudit.next_actions.filter((item) => !skippedActionIds.has(item?.id)).map((item) => ({ id: item.id, owner: item.owner, command: item.command, evidence: item.evidence }))
    : [];
  if (!readyGroupNames.has('cloudflare_worker_permission') && !nextActions.some((item) => item.id === 'optional-standalone-worker-probe')) {
    nextActions.push({
      id: 'optional-standalone-worker-probe',
      owner: 'operator-or-ai-with-token',
      command: 'npm run production:hosted-probe -- --out-dir <probe-worker-dir> && npm run cloudflare:ops -- workers deploy-probe --script <probe-worker-dir>/worker.mjs --name enigma-hosted-probe --execute && npm run cloudflare:ops -- workers inspect-probe --name enigma-hosted-probe --out .enigma/worker-inspect-current.json && npm run production:worker-inspect -- --evidence .enigma/worker-inspect-current.json',
      evidence: '.enigma/worker-inspect-current.json accepted by production:worker-inspect; this is permission evidence only, not hosted backend readiness',
    });
  }
  if (!readyGroupNames.has('hosted_backend_live') && !nextActions.some((item) => item.id === 'generate-backend-env-kit')) {
    const insertAt = nextActions.findIndex((item) => item.id === 'provision-hosted-backend');
    const backendEnvAction = {
      id: 'generate-backend-env-kit',
      owner: 'operator-or-reviewer',
      command: 'npm run production:backend-env -- --out-dir <backend-env-kit-dir> --domain enigmamemory.com --tenant <tenant-id> --environment production',
      evidence: '<backend-env-kit-dir>/PRODUCTION_BACKEND_ENV_KIT_SUMMARY.json plus private operator-env/operator-secrets filled outside public artifacts',
    };
    if (insertAt >= 0) nextActions.splice(insertAt, 0, backendEnvAction);
    else nextActions.push(backendEnvAction);
  }
  if (operator?.ok !== true && !nextActions.some((item) => item.id === 'generate-operator-evidence-starter')) {
    const insertAt = firstActionIndex(nextActions, ['generate-backend-env-kit', 'provision-hosted-backend', 'validate-hosted-backend-live-evidence', 'complete-operator-acceptance']);
    const starterAction = {
      id: 'generate-operator-evidence-starter',
      owner: 'operator-or-reviewer',
      command: 'npm run production:evidence-starter -- --out-dir <evidence-dir> --domain enigmamemory.com --tenant <tenant-id>',
      evidence: '<evidence-dir>/hosted-refs.template.json, hosted-backend-live.template.json, owner-approval-refs.template.json, evidence-refs.template.json, hosted-backend-live-collection.json/hosted-backend-live.json flow, acceptance-fill-plan.json, plus production:acceptance:packet and production:acceptance validation',
    };
    if (insertAt >= 0) nextActions.splice(insertAt, 0, starterAction);
    else nextActions.push(starterAction);
  }
  const report = {
    schema: PRODUCTION_DEPENDENCY_REPORT_SCHEMA,
    generated_at: options.generated_at ?? options.generatedAt ?? new Date(0).toISOString(),
    status: blockers.length === 0 ? 'ready' : 'blocked',
    launch_ready: blockers.length === 0 && goalAudit.complete === true && goalAudit.go_live_ready === true,
    goal_complete: goalAudit.complete === true,
    release_posture: goalAudit.release_posture ?? null,
    group_count: groups.length,
    blocked_group_count: groups.filter((item) => item.ready !== true).length,
    groups,
    blockers,
    next_actions: orderedNextActions(nextActions),
    claim_boundary: [
      'This report is a public-safe dependency tracker. It does not create accounts, provision infrastructure, deploy Workers, or certify launch readiness.',
      'launch_ready:true requires the goal audit to be complete and every dependency group to be ready with direct evidence.',
      'Blocked groups are intentional until hosted relay/gateway evidence and operator acceptance go exist.',
    ],
  };
  assertPublicSafe(report);
  return report;
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    goalAudit: '.enigma/goal-audit-current.json',
    releaseAudit: '.enigma/release-audit-current.json',
    workerInspect: '.enigma/worker-inspect-result-current.json',
    whitepaper: '.enigma/whitepaper-claims-current.json',
    cloudflareCredentials: null,
    edgeLive: null,
    edgeDeploy: null,
    storageBootstrap: null,
    out: null,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') { out.help = true; continue; }
    const readValue = () => {
      const value = argv[index + 1];
      if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) throw new Error(`${token} requires a value`);
      index += 1;
      return value;
    };
    if (token === '--goal-audit') out.goalAudit = readValue();
    else if (token === '--release-audit') out.releaseAudit = readValue();
    else if (token === '--worker-inspect') out.workerInspect = readValue();
    else if (token === '--whitepaper') out.whitepaper = readValue();
    else if (token === '--cloudflare-credentials') out.cloudflareCredentials = readValue();
    else if (token === '--edge-deploy') out.edgeDeploy = readValue();
    else if (token === '--edge-live') out.edgeLive = readValue();
    else if (token === '--storage-bootstrap') out.storageBootstrap = readValue();
    else if (token === '--out') out.out = readValue();
    else throw new Error(`unknown option ${token}`);
  }
  return out;
}

function usage() {
  return 'Usage: node scripts/build-production-dependency-report.mjs --goal-audit <goal.json> --release-audit <release.json> --worker-inspect <worker-result.json> --whitepaper <whitepaper-result.json> [--cloudflare-credentials <credentials-result.json>] [--edge-deploy <edge-backend-deployment.json>] [--edge-live <edge-backend-bootstrap-live.json>] [--storage-bootstrap <cloudflare-storage-bootstrap.json>] [--out <file>]\\n\\nBuilds a public-safe launch dependency report from current evidence artifacts.\\n';
}

async function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) return { text: usage(), code: 0 };
  const report = buildProductionDependencyReport({
    goalAudit: await readJson(args.goalAudit, 'goal_audit'),
    releaseAudit: await readJson(args.releaseAudit, 'release_audit'),
    workerInspect: await readJson(args.workerInspect, 'worker_inspect'),
    whitepaper: await readJson(args.whitepaper, 'whitepaper'),
    cloudflareCredentials: args.cloudflareCredentials ? await readJson(args.cloudflareCredentials, 'cloudflare_credentials') : null,
    edgeDeploy: args.edgeDeploy ? await readJson(args.edgeDeploy, 'edge_deploy') : null,
    edgeLive: args.edgeLive ? await readJson(args.edgeLive, 'edge_live') : null,
    storageBootstrap: args.storageBootstrap ? await readJson(args.storageBootstrap, 'storage_bootstrap') : null,
  }, { generated_at: new Date().toISOString() });
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (args.out) {
    const outPath = resolve(args.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, json, 'utf8');
  }
  return { text: json, code: report.launch_ready ? 0 : 1 };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const { text, code } = await runCli();
    process.stdout.write(text);
    process.exitCode = code;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
