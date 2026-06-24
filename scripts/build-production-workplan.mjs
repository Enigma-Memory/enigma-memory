#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { groupHostedRefsByWorkstream } from './hosted-ref-workstreams.mjs';

export const PRODUCTION_WORKPLAN_SCHEMA = 'enigma.production_workplan.v1';

const SECRET_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|sk-[A-Za-z0-9_-]{16,}|https?:\/\/[^\s/@]+:[^\s/@]+@|AKIA[0-9A-Z]{16})/iu;
const LOCAL_PATH_RE = /(?<![A-Za-z])(?:[A-Za-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+|\/(?:Users|home)\/[^\s"']+)/u;

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    dependencies: null,
    operatorAcceptance: null,
    hostedRefCatalog: null,
    out: null,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const readValue = () => {
      const value = argv[index + 1];
      if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) throw new Error(`${token} requires a value`);
      index += 1;
      return value;
    };
    if (token === '--dependencies') out.dependencies = readValue();
    else if (token === '--operator-acceptance' || token === '--operatorAcceptance') out.operatorAcceptance = readValue();
    else if (token === '--hosted-ref-catalog' || token === '--hostedRefCatalog') out.hostedRefCatalog = readValue();
    else if (token === '--out') out.out = readValue();
    else if (token === '--help' || token === '-h') out.help = true;
    else throw new Error(`Unknown production workplan option: ${token}`);
  }
  return out;
}

function usage() {
  return 'Usage: node scripts/build-production-workplan.mjs --dependencies <production-dependencies.json> [--operator-acceptance <result.json>] [--hosted-ref-catalog <catalog.json>] [--out <file>]\n\nBuilds a public-safe ordered launch workplan from current dependency and operator evidence.\n';
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read ${label}`);
  }
}

function assertPublicSafe(value, label = 'production workplan') {
  const text = JSON.stringify(value);
  if (SECRET_RE.test(text)) throw new Error(`${label} contains secret-looking material`);
  if (LOCAL_PATH_RE.test(text)) throw new Error(`${label} contains a local path`);
}

function requireObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  assertPublicSafe(value, label);
  return value;
}

function groupsByName(dependencyReport) {
  return new Map((Array.isArray(dependencyReport.groups) ? dependencyReport.groups : []).map((group) => [group.name, group]));
}

function groupStatus(groups, name) {
  const group = groups.get(name) ?? {};
  return {
    ready: group.ready === true,
    blocker_count: Number.isFinite(group.blocker_count) ? group.blocker_count : (Array.isArray(group.blockers) ? group.blockers.length : 0),
    blockers: Array.isArray(group.blockers) ? group.blockers : [],
    evidence: Array.isArray(group.evidence) ? group.evidence : [],
    next_command: typeof group.next_command === 'string' ? group.next_command : null,
  };
}

function actionById(dependencyReport, id) {
  return (Array.isArray(dependencyReport.next_actions) ? dependencyReport.next_actions : []).find((item) => item?.id === id) ?? null;
}

function actionSummary(action) {
  if (!action) return null;
  return {
    id: action.id,
    owner: action.owner ?? 'operator',
    command: action.command ?? null,
    evidence: action.evidence ?? null,
  };
}

function missingHostedRefs(hostedGroup) {
  return hostedGroup.blockers
    .map((item) => /^missing refs\.([A-Za-z0-9_:-]+)$/u.exec(item))
    .filter(Boolean)
    .map((match) => match[1]);
}

function declaredHostedMissingRefCount(hostedGroup, refs) {
  const declared = hostedGroup.blockers
    .map((item) => /^hosted missing refs: (\d+)$/u.exec(item))
    .find(Boolean);
  return declared ? Number(declared[1]) : refs.length;
}

function missingHostedEndpointRefs(hostedGroup) {
  return hostedGroup.blockers
    .map((item) => /^missing (relay|gateway|operator_acceptance)\.ref$/u.exec(item))
    .filter(Boolean)
    .map((match) => `${match[1]}.ref`);
}

function catalogHostedRefKeys(hostedRefCatalog) {
  const refs = hostedRefCatalog?.refs;
  return refs && typeof refs === 'object' ? Object.keys(refs) : [];
}

function expandedMissingHostedRefs(hostedGroup, hostedRefCatalog, blockerRefs, declaredMissingRefCount) {
  const catalogRefs = catalogHostedRefKeys(hostedRefCatalog);
  if (declaredMissingRefCount > blockerRefs.length
    && catalogRefs.length >= declaredMissingRefCount
    && blockerRefs.every((ref) => catalogRefs.includes(ref))) {
    return catalogRefs.slice(0, declaredMissingRefCount);
  }
  return blockerRefs;
}

function hostedStateBlockers(hostedGroup) {
  return hostedGroup.blockers.filter((item) => item === 'hosted_live_ready is false' || item === 'operator acceptance decision is pending');
}

function hostedCatalogFor(refs, hostedRefCatalog) {
  const catalog = hostedRefCatalog?.refs && typeof hostedRefCatalog.refs === 'object' ? hostedRefCatalog.refs : {};
  return Object.fromEntries(refs.map((ref) => {
    const entry = catalog[ref] ?? {};
    return [ref, {
      purpose: typeof entry.purpose === 'string' ? entry.purpose : `Provide verified hosted evidence for ${ref}.`,
      env_names: Array.isArray(entry.env_names) ? entry.env_names : [],
      evidence_command: typeof entry.evidence_command === 'string' ? entry.evidence_command : 'Attach operator evidence and rerun production:manifest.',
      accepted_refs: Array.isArray(entry.accepted_refs) ? entry.accepted_refs : [],
    }];
  }));
}


function operatorBreakdownFromGroup(operatorGroup, operatorAcceptance) {
  const out = {};
  for (const blocker of operatorGroup.blockers) {
    const match = /^operator blockers ([A-Za-z0-9_:-]+): (\d+)$/u.exec(blocker);
    if (match) out[match[1]] = Number(match[2]);
  }
  if (Object.keys(out).length > 0) return out;
  if (operatorAcceptance?.blocker_breakdown && typeof operatorAcceptance.blocker_breakdown === 'object' && !Array.isArray(operatorAcceptance.blocker_breakdown)) {
    return operatorAcceptance.blocker_breakdown;
  }
  return out;
}

function makePhase({ id, title, ready, owner, prerequisites = [], blockers = [], commands = [], evidence = [], details = {} }) {
  return {
    id,
    title,
    ready: ready === true,
    owner,
    prerequisites,
    blocker_count: blockers.length,
    blockers,
    commands: commands.filter(Boolean),
    evidence,
    details,
  };
}

export function validateProductionWorkplanGraph(phases) {
  const ids = new Set();
  const errors = [];
  for (const phase of phases) {
    if (ids.has(phase.id)) errors.push(`duplicate phase id ${phase.id}`);
    ids.add(phase.id);
  }
  const inbound = new Map(phases.map((phase) => [phase.id, new Set()]));
  const outgoing = new Map(phases.map((phase) => [phase.id, []]));
  for (const phase of phases) {
    for (const prerequisite of phase.prerequisites) {
      if (prerequisite === phase.id) {
        errors.push(`phase ${phase.id} depends on itself`);
        continue;
      }
      if (!ids.has(prerequisite)) {
        errors.push(`phase ${phase.id} has unknown prerequisite ${prerequisite}`);
        continue;
      }
      inbound.get(phase.id).add(prerequisite);
      outgoing.get(prerequisite).push(phase.id);
    }
  }
  if (errors.length > 0) throw new Error(`Invalid production workplan graph: ${errors.join('; ')}`);
  const queue = phases.filter((phase) => inbound.get(phase.id).size === 0).map((phase) => phase.id);
  const executionOrder = [];
  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index];
    executionOrder.push(id);
    for (const target of outgoing.get(id)) {
      const targetInbound = inbound.get(target);
      targetInbound.delete(id);
      if (targetInbound.size === 0) queue.push(target);
    }
  }
  if (executionOrder.length !== phases.length) {
    const unresolved = phases.filter((phase) => !executionOrder.includes(phase.id)).map((phase) => phase.id);
    throw new Error(`Invalid production workplan graph: cycle involving ${unresolved.join(', ')}`);
  }
  return executionOrder;
}

export function buildProductionWorkplan(inputs = {}, options = {}) {
  const dependencyReport = requireObject(inputs.dependencyReport, 'dependency report');
  if (dependencyReport.schema !== 'enigma.production_dependency_report.v1') throw new Error('dependency report schema mismatch');
  const operatorAcceptance = inputs.operatorAcceptance === undefined || inputs.operatorAcceptance === null ? null : requireObject(inputs.operatorAcceptance, 'operator acceptance result');
  const hostedRefCatalog = inputs.hostedRefCatalog === undefined || inputs.hostedRefCatalog === null ? null : requireObject(inputs.hostedRefCatalog, 'hosted ref catalog');
  if (operatorAcceptance !== null && operatorAcceptance.schema !== 'enigma.operator_acceptance_result.v1') throw new Error('operator acceptance schema mismatch');
  if (hostedRefCatalog !== null && hostedRefCatalog.schema !== 'enigma.operator_hosted_ref_catalog.v1') throw new Error('hosted ref catalog schema mismatch');

  const groups = groupsByName(dependencyReport);
  const credentials = groupStatus(groups, 'cloudflare_credentials');
  const worker = groupStatus(groups, 'cloudflare_worker_permission');
  const hosted = groupStatus(groups, 'hosted_backend_live');
  const operator = groupStatus(groups, 'operator_acceptance');
  const release = groupStatus(groups, 'release_gates');
  const staticSite = groupStatus(groups, 'static_site');
  const whitepaper = groupStatus(groups, 'whitepaper_claims');
  const blockerRefs = missingHostedRefs(hosted);
  const declaredMissingRefCount = declaredHostedMissingRefCount(hosted, blockerRefs);
  const refs = expandedMissingHostedRefs(hosted, hostedRefCatalog, blockerRefs, declaredMissingRefCount);
  const endpointRefs = missingHostedEndpointRefs(hosted);
  const stateBlockers = hostedStateBlockers(hosted);

  const phases = [
    makePhase({
      id: 'cloudflare_credentials',
      title: 'Create and inject Cloudflare deployment credentials',
      ready: credentials.ready,
      owner: 'operator',
      blockers: credentials.blockers,
      commands: [credentials.next_command, actionSummary(actionById(dependencyReport, 'create-cloudflare-token'))?.command, 'npm run production:cloudflare-credentials -- --out .enigma/cloudflare-credentials-current.json'],
      evidence: credentials.evidence,
      details: { token_value_must_not_be_shared: true, required_env_keys: ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'] },
    }),
    makePhase({
      id: 'cloudflare_worker_permission',
      title: 'Verify Cloudflare Worker visibility and optional hosted probe deploy path',
      ready: worker.ready,
      owner: 'operator-or-ai-with-token',
      prerequisites: ['cloudflare_credentials'],
      blockers: worker.blockers,
      commands: [worker.next_command, actionSummary(actionById(dependencyReport, 'optional-standalone-worker-probe'))?.command],
      evidence: worker.evidence,
      details: { standalone_probe_is_not_hosted_backend_evidence: true },
    }),
    makePhase({
      id: 'release_gates',
      title: 'Keep local release, whitepaper, static-site, and package gates green',
      ready: release.ready && staticSite.ready && whitepaper.ready,
      owner: 'operator-or-reviewer',
      prerequisites: [],
      blockers: [...release.blockers, ...staticSite.blockers, ...whitepaper.blockers],
      commands: [release.next_command, staticSite.next_command, whitepaper.next_command],
      evidence: [...release.evidence, ...staticSite.evidence, ...whitepaper.evidence],
      details: { release_gates_ready: release.ready, static_site_ready: staticSite.ready, whitepaper_ready: whitepaper.ready },
    }),
    makePhase({
      id: 'hosted_backend_refs',
      title: 'Provision relay/gateway and required hosted evidence refs',
      ready: hosted.ready,
      owner: 'operator',
      prerequisites: ['cloudflare_credentials'],
      blockers: hosted.blockers,
      commands: [actionSummary(actionById(dependencyReport, 'generate-operator-evidence-starter'))?.command, actionSummary(actionById(dependencyReport, 'generate-backend-env-kit'))?.command, actionSummary(actionById(dependencyReport, 'provision-hosted-backend'))?.command, hosted.next_command, actionSummary(actionById(dependencyReport, 'validate-hosted-backend-live-evidence'))?.command],
      evidence: hosted.evidence,
      details: {
        missing_ref_count: declaredMissingRefCount,
        listed_missing_ref_count: refs.length,
        blocker_listed_missing_ref_count: blockerRefs.length,
        unlisted_missing_ref_count: Math.max(0, declaredMissingRefCount - refs.length),
        missing_refs: refs,
        missing_ref_groups: groupHostedRefsByWorkstream(refs),
        missing_endpoint_refs: endpointRefs,
        hosted_state_blockers: stateBlockers,
        hosted_ref_catalog: hostedCatalogFor(refs, hostedRefCatalog),
      },
    }),
    makePhase({
      id: 'operator_acceptance',
      title: 'Complete operator acceptance packet with go decision and zero blockers',
      ready: operator.ready,
      owner: 'operator-or-reviewer',
      prerequisites: ['hosted_backend_refs', 'release_gates'],
      blockers: operator.blockers,
      commands: [actionSummary(actionById(dependencyReport, 'generate-operator-evidence-starter'))?.command, operator.next_command, actionSummary(actionById(dependencyReport, 'complete-operator-acceptance'))?.command],
      evidence: operator.evidence,
      details: {
        decision: operatorAcceptance?.decision ?? null,
        blocker_breakdown: operatorBreakdownFromGroup(operator, operatorAcceptance),
      },
    }),
    makePhase({
      id: 'final_release_verification',
      title: 'Rerun release gates and goal/dependency audits after external blockers clear',
      ready: dependencyReport.launch_ready === true,
      owner: 'operator-or-reviewer',
      prerequisites: ['cloudflare_credentials', 'cloudflare_worker_permission', 'hosted_backend_refs', 'operator_acceptance', 'release_gates'],
      blockers: dependencyReport.launch_ready === true ? [] : ['launch_ready is false'],
      commands: [release.next_command, staticSite.next_command, whitepaper.next_command, 'npm run production:goal-audit -- --site <public-site-dir> --domain enigmamemory.com --release-audit .enigma/release-audit-current.json', 'npm run production:dependencies -- --goal-audit .enigma/goal-audit-current.json --release-audit .enigma/release-audit-current.json --worker-inspect .enigma/worker-inspect-validation-current.json --whitepaper .enigma/whitepaper-claims-current.json --cloudflare-credentials .enigma/cloudflare-credentials-current.json --edge-deploy .enigma/edge-backend-deployment-current.json --edge-live .enigma/edge-backend-bootstrap-live-current.json --storage-bootstrap .enigma/cloudflare-storage-bootstrap-current.json'],
      evidence: [...release.evidence, ...staticSite.evidence, ...whitepaper.evidence],
      details: { goal_complete: dependencyReport.goal_complete === true, launch_ready: dependencyReport.launch_ready === true },
    }),
  ];
  const executionOrder = validateProductionWorkplanGraph(phases);

  const firstBlocked = phases.find((phase) => phase.ready !== true) ?? null;
  const report = {
    schema: PRODUCTION_WORKPLAN_SCHEMA,
    generated_at: options.generated_at ?? new Date().toISOString(),
    status: firstBlocked === null ? 'ready' : 'blocked',
    launch_ready: dependencyReport.launch_ready === true,
    dependency_status: dependencyReport.status,
    blocked_phase_count: phases.filter((phase) => phase.ready !== true).length,
    phase_count: phases.length,
    next_phase_id: firstBlocked?.id ?? null,
    execution_order: executionOrder,
    phases,
    evidence_inputs: {
      dependency_generated_at: dependencyReport.generated_at ?? null,
      operator_acceptance_generated_at: operatorAcceptance?.generated_at ?? null,
      hosted_ref_catalog_generated_at: hostedRefCatalog?.generated_at ?? null,
    },
    claim_boundary: [
      'This workplan is an ordered public-safe execution plan generated from current evidence; it does not create accounts, deploy infrastructure, approve operators, or certify launch readiness.',
      'Token values, account ids, credential-bearing URLs, raw memory, prompts, transcripts, provider responses, and private key material must stay outside this artifact.',
      'launch_ready:true requires every phase to be ready and the dependency report to be launch_ready:true with direct current evidence.',
    ],
  };
  assertPublicSafe(report);
  return report;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) return { text: usage(), status: 0 };
  if (!args.dependencies) throw new Error('--dependencies is required');
  const report = buildProductionWorkplan({
    dependencyReport: await readJson(args.dependencies, 'dependency report'),
    operatorAcceptance: args.operatorAcceptance ? await readJson(args.operatorAcceptance, 'operator acceptance result') : null,
    hostedRefCatalog: args.hostedRefCatalog ? await readJson(args.hostedRefCatalog, 'hosted ref catalog') : null,
  });
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (args.out) {
    await mkdir(dirname(args.out), { recursive: true });
    await writeFile(args.out, json, 'utf8');
  }
  return { text: json, status: report.launch_ready ? 0 : 1 };
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then(({ text, status }) => {
    process.stdout.write(text);
    process.exitCode = status;
  }).catch((error) => {
    process.stdout.write(`${JSON.stringify({ schema: PRODUCTION_WORKPLAN_SCHEMA, status: 'blocked', launch_ready: false, blockers: [error.message] }, null, 2)}\n`);
    process.exitCode = 1;
  });
}
