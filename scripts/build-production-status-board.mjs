#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PRODUCTION_STATUS_BOARD_SCHEMA = 'enigma.production_status_board.v1';

const SECRET_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|sk-[A-Za-z0-9_-]{16,}|https?:\/\/[^\s/@]+:[^\s/@]+@|AKIA[0-9A-Z]{16})/iu;
const LOCAL_PATH_RE = /(?<![A-Za-z])(?:[A-Za-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+|\/(?:Users|home)\/[^\s"']+)/u;

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    goalAudit: null,
    dependencies: null,
    workplan: null,
    out: null,
    help: false,
    plain: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const readValue = () => {
      const value = argv[index + 1];
      if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) throw new Error(`${token} requires a value`);
      index += 1;
      return value;
    };
    if (token === '--goal-audit' || token === '--goalAudit') out.goalAudit = readValue();
    else if (token === '--dependencies') out.dependencies = readValue();
    else if (token === '--workplan') out.workplan = readValue();
    else if (token === '--out') out.out = readValue();
    else if (token === '--help' || token === '-h') out.help = true;
    else if (token === '--plain' || token === '--text' || token === '--format=text' || (token === '--format' && argv[index + 1] === 'text')) {
      out.plain = true;
      if (token === '--format') index += 1;
    }
    else throw new Error(`Unknown production status board option: ${token}`);
  }
  return out;
}

function usage() {
  return 'Usage: node scripts/build-production-status-board.mjs --goal-audit <goal.json> --dependencies <dependencies.json> --workplan <workplan.json> [--out <file>] [--plain]\n\nBuilds a public-safe launch status board from current goal, dependency, and workplan evidence. --plain prints a human-readable summary while --out preserves JSON evidence.\n';
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw new Error(`Unable to read ${label}`);
  }
}

function assertPublicSafe(value, label = 'production status board') {
  const text = JSON.stringify(value);
  if (SECRET_RE.test(text)) throw new Error(`${label} contains secret-looking material`);
  if (LOCAL_PATH_RE.test(text)) throw new Error(`${label} contains a local path`);
}

function requireObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  assertPublicSafe(value, label);
  return value;
}

function limitedList(values, limit) {
  return Array.isArray(values) ? values.slice(0, limit) : [];
}

function uniqueLimitedList(values, limit) {
  const out = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= limit) break;
  }
  return out;
}

function omittedCount(values, limit) {
  return Math.max(0, (Array.isArray(values) ? values.length : 0) - limit);
}

function summarizePhaseDetails(details) {
  if (details === null || typeof details !== 'object' || Array.isArray(details)) return null;
  const summary = {};
  for (const key of ['missing_ref_count', 'listed_missing_ref_count', 'blocker_listed_missing_ref_count', 'unlisted_missing_ref_count']) {
    if (Number.isFinite(details[key])) summary[key] = details[key];
  }
  if (Array.isArray(details.missing_refs)) summary.missing_refs = limitedList(details.missing_refs, 30);
  if (details.missing_ref_groups && typeof details.missing_ref_groups === 'object' && !Array.isArray(details.missing_ref_groups)) {
    summary.missing_ref_groups = Object.fromEntries(Object.entries(details.missing_ref_groups)
      .filter(([, refs]) => Array.isArray(refs))
      .map(([group, refs]) => [group, limitedList(refs, 30)]));
  }
  if (Array.isArray(details.missing_endpoint_refs)) summary.missing_endpoint_refs = limitedList(details.missing_endpoint_refs, 10);
  if (Array.isArray(details.hosted_state_blockers)) summary.hosted_state_blockers = limitedList(details.hosted_state_blockers, 10);
  return Object.keys(summary).length > 0 ? summary : null;
}

function summarizeGroup(group) {
  return {
    name: group.name,
    ready: group.ready === true,
    blocker_count: Number.isFinite(group.blocker_count) ? group.blocker_count : (Array.isArray(group.blockers) ? group.blockers.length : 0),
    blockers: limitedList(group.blockers, 8),
    omitted_blocker_count: omittedCount(group.blockers, 8),
    next_command: typeof group.next_command === 'string' ? group.next_command : null,
  };
}

function summarizePhase(phase) {
  const details = summarizePhaseDetails(phase.details);
  return {
    id: phase.id,
    title: phase.title,
    ready: phase.ready === true,
    owner: phase.owner,
    prerequisites: Array.isArray(phase.prerequisites) ? phase.prerequisites : [],
    blocker_count: Number.isFinite(phase.blocker_count) ? phase.blocker_count : (Array.isArray(phase.blockers) ? phase.blockers.length : 0),
    blockers: limitedList(phase.blockers, 8),
    omitted_blocker_count: omittedCount(phase.blockers, 8),
    commands: limitedList(phase.commands, 5),
    ...(details ? { details } : {}),
  };
}

function summarizeDeliverable(deliverable) {
  return {
    id: deliverable.id,
    ok: deliverable.ok === true,
    requirement: deliverable.requirement,
    blocker_count: Array.isArray(deliverable.blockers) ? deliverable.blockers.length : 0,
    blockers: limitedList(deliverable.blockers, 8),
    omitted_blocker_count: omittedCount(deliverable.blockers, 8),
  };
}

function groupMap(dependencies) {
  return new Map((Array.isArray(dependencies.groups) ? dependencies.groups : []).map((group) => [group.name, group]));
}

function phaseMap(workplan) {
  return new Map((Array.isArray(workplan.phases) ? workplan.phases : []).map((phase) => [phase.id, phase]));
}

function checkExecutionOrder(workplan) {
  const phases = Array.isArray(workplan.phases) ? workplan.phases : [];
  const ids = new Set(phases.map((phase) => phase.id));
  const order = Array.isArray(workplan.execution_order) ? workplan.execution_order : [];
  return {
    present: order.length > 0,
    covers_all_phases: order.length === ids.size && order.every((id) => ids.has(id)),
    next_phase_order_index: workplan.next_phase_id === null ? null : order.indexOf(workplan.next_phase_id),
  };
}

function inputFreshness(inputs, options = {}) {
  const staleAfterSeconds = Number.isFinite(options.staleAfterSeconds) ? options.staleAfterSeconds : 900;
  const asOfMs = typeof options.asOf === 'string' ? Date.parse(options.asOf) : NaN;
  const entries = [
    ['goal_audit', inputs.goalAudit?.generated_at],
    ['dependencies', inputs.dependencies?.generated_at],
    ['workplan', inputs.workplan?.generated_at],
    ['workplan.dependencies', inputs.workplan?.evidence_inputs?.dependency_generated_at],
    ['workplan.operator_acceptance', inputs.workplan?.evidence_inputs?.operator_acceptance_generated_at],
    ['workplan.hosted_ref_catalog', inputs.workplan?.evidence_inputs?.hosted_ref_catalog_generated_at],
  ].map(([name, generatedAt]) => {
    const time = typeof generatedAt === 'string' ? Date.parse(generatedAt) : NaN;
    return {
      name,
      generated_at: typeof generatedAt === 'string' ? generatedAt : null,
      valid: Number.isFinite(time),
      epoch_ms: Number.isFinite(time) ? time : null,
    };
  });
  const validTimes = entries.filter((entry) => entry.valid).map((entry) => entry.epoch_ms);
  const latest = validTimes.length > 0 ? Math.max(...validTimes) : null;
  const oldest = validTimes.length > 0 ? Math.min(...validTimes) : null;
  const maxSkewSeconds = latest === null || oldest === null ? null : Math.round((latest - oldest) / 1000);
  const latestAgeSeconds = latest === null || !Number.isFinite(asOfMs) ? null : Math.round((asOfMs - latest) / 1000);
  return {
    stale_after_seconds: staleAfterSeconds,
    as_of: Number.isFinite(asOfMs) ? new Date(asOfMs).toISOString() : null,
    valid_input_count: validTimes.length,
    missing_or_invalid_inputs: entries.filter((entry) => !entry.valid).map((entry) => entry.name),
    latest_generated_at: latest === null ? null : new Date(latest).toISOString(),
    oldest_generated_at: oldest === null ? null : new Date(oldest).toISOString(),
    max_skew_seconds: maxSkewSeconds,
    latest_age_seconds: latestAgeSeconds,
    stale: validTimes.length !== entries.length
      || !Number.isFinite(asOfMs)
      || (maxSkewSeconds !== null && maxSkewSeconds > staleAfterSeconds)
      || (latestAgeSeconds !== null && latestAgeSeconds > staleAfterSeconds),
  };
}

function blockedExternalGroups(groups) {
  return ['cloudflare_credentials', 'cloudflare_worker_permission', 'hosted_backend_live', 'operator_acceptance']
    .map((name) => groups.get(name))
    .filter(Boolean)
    .map(summarizeGroup)
    .filter((group) => group.ready !== true);
}

export function buildProductionStatusBoard(inputs = {}, options = {}) {
  const goalAudit = requireObject(inputs.goalAudit, 'goal audit');
  const dependencies = requireObject(inputs.dependencies, 'dependency report');
  const workplan = requireObject(inputs.workplan, 'production workplan');
  if (goalAudit.schema !== 'enigma.goal_completion_audit.v1') throw new Error('goal audit schema mismatch');
  if (dependencies.schema !== 'enigma.production_dependency_report.v1') throw new Error('dependency report schema mismatch');
  if (workplan.schema !== 'enigma.production_workplan.v1') throw new Error('production workplan schema mismatch');

  const groups = groupMap(dependencies);
  const phases = phaseMap(workplan);
  const blockedGroups = (Array.isArray(dependencies.groups) ? dependencies.groups : []).filter((group) => group.ready !== true).map(summarizeGroup);
  const blockedPhases = (Array.isArray(workplan.phases) ? workplan.phases : []).filter((phase) => phase.ready !== true).map(summarizePhase);
  const blockedDeliverables = (Array.isArray(goalAudit.deliverables) ? goalAudit.deliverables : []).filter((deliverable) => deliverable.ok !== true).map(summarizeDeliverable);
  const nextPhase = workplan.next_phase_id ? phases.get(workplan.next_phase_id) : null;
  const firstBlockedGroup = blockedGroups[0] ?? null;
  const executionOrder = Array.isArray(workplan.execution_order) ? workplan.execution_order : [];
  const localReady = ['static_site', 'release_gates', 'whitepaper_claims'].every((name) => groups.get(name)?.ready === true);
  const generatedAt = options.generated_at ?? new Date().toISOString();
  const freshness = inputFreshness({ goalAudit, dependencies, workplan }, { asOf: generatedAt });
  const completeWithFreshEvidence = goalAudit.complete === true && dependencies.launch_ready === true && workplan.launch_ready === true && freshness.stale === false;
  const launchReadyWithFreshEvidence = goalAudit.go_live_ready === true && dependencies.launch_ready === true && workplan.launch_ready === true && freshness.stale === false;
  const report = {
    schema: PRODUCTION_STATUS_BOARD_SCHEMA,
    generated_at: generatedAt,
    status: completeWithFreshEvidence ? 'ready' : 'blocked',
    launch_ready: launchReadyWithFreshEvidence,
    goal_complete: goalAudit.complete === true,
    local_package_ready: localReady,
    fresh_input_evidence: freshness.stale === false,
    release_posture: goalAudit.release_posture ?? dependencies.release_posture ?? null,
    ready_group_count: (Array.isArray(dependencies.groups) ? dependencies.groups : []).filter((group) => group.ready === true).length,
    blocked_group_count: blockedGroups.length,
    ready_phase_count: (Array.isArray(workplan.phases) ? workplan.phases : []).filter((phase) => phase.ready === true).length,
    blocked_phase_count: blockedPhases.length,
    blocked_deliverable_count: blockedDeliverables.length,
    next_phase: nextPhase ? summarizePhase(nextPhase) : null,
    next_phase_id: nextPhase?.id ?? null,
    first_blocked_group: firstBlockedGroup,
    execution_order: executionOrder,
    execution_order_check: checkExecutionOrder(workplan),
    input_freshness: freshness,
    blocked_groups: blockedGroups,
    blocked_phases: blockedPhases,
    blocked_deliverables: blockedDeliverables,
    external_blockers: blockedExternalGroups(groups),
    immediate_operator_queue: uniqueLimitedList([
      ...(nextPhase?.commands ?? []),
      ...(firstBlockedGroup?.next_command ? [firstBlockedGroup.next_command] : []),
    ], 6),
    evidence_inputs: {
      goal_audit_generated_at: goalAudit.generated_at ?? null,
      dependency_generated_at: dependencies.generated_at ?? null,
      workplan_generated_at: workplan.generated_at ?? null,
      workplan_dependency_generated_at: workplan.evidence_inputs?.dependency_generated_at ?? null,
      workplan_operator_acceptance_generated_at: workplan.evidence_inputs?.operator_acceptance_generated_at ?? null,
      workplan_hosted_ref_catalog_generated_at: workplan.evidence_inputs?.hosted_ref_catalog_generated_at ?? null,
    },
    claim_boundary: [
      'This status board summarizes already-generated evidence; it does not create credentials, deploy infrastructure, approve operators, or certify launch readiness.',
      'launch_ready:true requires the goal audit, dependency report, and workplan to all be ready with direct current evidence.',
      'Cloudflare token values, account ids, credential-bearing URLs, raw memory, prompts, transcripts, provider responses, and private keys must never appear in this artifact.',
    ],
  };
  assertPublicSafe(report);
  return report;
}

export function renderProductionStatusBoardPlain(report) {
  const lines = [
    'Enigma production status board',
    `Status: ${report.status ?? 'blocked'}`,
    `Launch ready: ${report.launch_ready ? 'yes' : 'no'}`,
    `Goal complete: ${report.goal_complete ? 'yes' : 'no'}`,
    `Local package ready: ${report.local_package_ready ? 'yes' : 'no'}`,
    `Fresh evidence: ${report.fresh_input_evidence ? 'yes' : 'no'}`,
    `Ready groups: ${report.ready_group_count ?? 0}`,
    `Blocked groups: ${report.blocked_group_count ?? 0}`,
    `Ready phases: ${report.ready_phase_count ?? 0}`,
    `Blocked phases: ${report.blocked_phase_count ?? 0}`,
    `Blocked deliverables: ${report.blocked_deliverable_count ?? 0}`,
    `Next phase: ${report.next_phase_id ?? 'none'}`,
  ];
  for (const command of Array.isArray(report.immediate_operator_queue) ? report.immediate_operator_queue.slice(0, 5) : []) lines.push(`Next: ${command}`);
  for (const blocker of Array.isArray(report.external_blockers) ? report.external_blockers.slice(0, 5) : []) lines.push(`External blocker: ${blocker.name} — ${blocker.blocker_count ?? 0} blockers`);
  lines.push('Boundary: public-safe status summary only; no credentials, deploys, infrastructure approval, launch certification, raw memory, local paths, account ids, provider responses, provider deletion, model behavior, hosted service, compliance, benchmark superiority, token ROI, or provider invoice savings claims.');
  return `${lines.join('\n')}\n`;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) return { text: usage(), status: 0 };
  if (!args.goalAudit) throw new Error('--goal-audit is required');
  if (!args.dependencies) throw new Error('--dependencies is required');
  if (!args.workplan) throw new Error('--workplan is required');
  const report = buildProductionStatusBoard({
    goalAudit: await readJson(args.goalAudit, 'goal audit'),
    dependencies: await readJson(args.dependencies, 'dependency report'),
    workplan: await readJson(args.workplan, 'production workplan'),
  });
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (args.out) {
    await mkdir(dirname(args.out), { recursive: true });
    await writeFile(args.out, json, 'utf8');
  }
  return { text: args.plain ? renderProductionStatusBoardPlain(report) : json, status: report.launch_ready ? 0 : 1 };
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then(({ text, status }) => {
    process.stdout.write(text);
    process.exitCode = status;
  }).catch((error) => {
    process.stdout.write(`${JSON.stringify({ schema: PRODUCTION_STATUS_BOARD_SCHEMA, status: 'blocked', launch_ready: false, blockers: [error.message] }, null, 2)}\n`);
    process.exitCode = 1;
  });
}
