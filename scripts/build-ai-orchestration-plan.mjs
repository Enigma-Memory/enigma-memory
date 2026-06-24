#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const AI_ORCHESTRATION_PLAN_SCHEMA = 'enigma.ai_orchestration_plan.v1';

const SECRET_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|sk-[A-Za-z0-9_-]{16,}|cf-[A-Za-z0-9_-]{12,}|https?:\/\/[^\s/@]+:[^\s/@]+@|AKIA[0-9A-Z]{16}|\b[0-9a-f]{32}\b|(?:api[_-]?key|api[_-]?token|access[_-]?token|refresh[_-]?token|secret|password|private[_-]?key|token)\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{16,})/iu;
const LOCAL_PATH_RE = /(?<![A-Za-z])(?:[A-Za-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+|\/(?:Users|home)\/[^\s"']+)/u;

function parseArgs(argv = process.argv.slice(2)) {
  const out = { statusBoard: null, out: null, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const readValue = () => {
      const value = argv[index + 1];
      if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) throw new Error(`${token} requires a value`);
      index += 1;
      return value;
    };
    if (token === '--status-board' || token === '--statusBoard') out.statusBoard = readValue();
    else if (token === '--out') out.out = readValue();
    else if (token === '--help' || token === '-h') out.help = true;
    else throw new Error(`Unknown AI orchestration option: ${token}`);
  }
  return out;
}

function usage() {
  return 'Usage: node scripts/build-ai-orchestration-plan.mjs --status-board <production-status-board.json> [--out <file>]\n\nBuilds a public-safe AI/operator orchestration plan from the current production status board.\n';
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw new Error(`Unable to read ${label}`);
  }
}

function assertPublicSafe(value, label = 'AI orchestration plan') {
  const text = JSON.stringify(value);
  if (SECRET_RE.test(text)) throw new Error(`${label} contains secret-looking material`);
  if (LOCAL_PATH_RE.test(text)) throw new Error(`${label} contains a local path`);
}

function requireObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  assertPublicSafe(value, label);
  return value;
}

function compactCommands(values, limit = 4) {
  const out = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    if (typeof value !== 'string' || value.length === 0 || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= limit) break;
  }
  return out;
}

function phaseById(statusBoard, id) {
  const phases = Array.isArray(statusBoard.blocked_phases) ? statusBoard.blocked_phases : [];
  return phases.find((phase) => phase.id === id) ?? null;
}

function groupByName(statusBoard, name) {
  const groups = Array.isArray(statusBoard.blocked_groups) ? statusBoard.blocked_groups : [];
  return groups.find((group) => group.name === name) ?? null;
}

function blockersFor(item) {
  return Array.isArray(item?.blockers) ? item.blockers.slice(0, 8) : [];
}

function commandsFor(item) {
  if (Array.isArray(item?.commands)) return compactCommands(item.commands, 5);
  if (typeof item?.next_command === 'string') return [item.next_command];
  return [];
}

function buildLane({ id, role, model, charter, owns, waits_for = [], commands = [], blockers = [], acceptance = [] }) {
  return {
    id,
    role,
    model,
    charter,
    owns,
    waits_for,
    blocker_count: blockers.length,
    blockers,
    commands: compactCommands(commands, 6),
    acceptance,
  };
}

function buildRoleLanes(statusBoard) {
  const credentialPhase = phaseById(statusBoard, 'cloudflare_credentials') ?? groupByName(statusBoard, 'cloudflare_credentials');
  const workerPhase = phaseById(statusBoard, 'cloudflare_worker_permission') ?? groupByName(statusBoard, 'cloudflare_worker_permission');
  const hostedPhase = phaseById(statusBoard, 'hosted_backend_refs') ?? groupByName(statusBoard, 'hosted_backend_live');
  const operatorPhase = phaseById(statusBoard, 'operator_acceptance') ?? groupByName(statusBoard, 'operator_acceptance');
  const finalPhase = phaseById(statusBoard, 'final_release_verification');
  return [
    buildLane({
      id: 'human_operator_credentials',
      role: 'Human operator',
      model: 'human-controlled Cloudflare/account owner',
      charter: 'Create or inject credentials out-of-band without pasting secrets into chat, then rerun credential and status evidence.',
      owns: ['cloudflare_credentials'],
      blockers: blockersFor(credentialPhase),
      commands: commandsFor(credentialPhase),
      acceptance: ['production:cloudflare-credentials reports credentials_present:true', 'No token values, account ids, local paths, or contact data appear in artifacts.'],
    }),
    buildLane({
      id: 'gpt55_architecture',
      role: 'Architecture and structure planner',
      model: 'GPT-5.5',
      charter: 'Keep the end-to-end production graph coherent, claim-bounded, and testable while external credentials and hosted refs are supplied.',
      owns: ['execution_order', 'claim_boundaries', 'status_board', 'workplan'],
      waits_for: ['human_operator_credentials'],
      blockers: [...blockersFor(workerPhase), ...blockersFor(hostedPhase)].slice(0, 8),
      commands: ['npm run production:status -- --goal-audit .enigma/goal-audit-current.json --dependencies .enigma/production-dependencies-current.json --workplan .enigma/production-workplan-current.json --out .enigma/production-status-board-current.json', 'npm run production:workplan -- --dependencies .enigma/production-dependencies-current.json --operator-acceptance .enigma/operator-acceptance-template-result.json --hosted-ref-catalog .enigma/operator-evidence-starter/hosted-ref-catalog.json --out .enigma/production-workplan-current.json'],
      acceptance: ['Status board has fresh_input_evidence:true.', 'Workplan execution_order covers every phase and has no cycles.', 'No broad completion claim is emitted while external blockers remain.'],
    }),
    buildLane({
      id: 'kimi_coding',
      role: 'Fast implementation lane',
      model: 'Kimi coding agent',
      charter: 'Implement the exact next production code, validator, deploy-script, or artifact change selected by the architecture lane; no design drift or compatibility shims.',
      owns: ['worker_permission_probe', 'hosted_backend_refs', 'operator_evidence_starter', 'validator_scripts'],
      waits_for: ['gpt55_architecture', 'human_operator_credentials'],
      blockers: [...blockersFor(workerPhase), ...blockersFor(hostedPhase)].slice(0, 8),
      commands: [...commandsFor(workerPhase), ...commandsFor(hostedPhase)].slice(0, 6),
      acceptance: ['Targeted tests for changed files pass.', 'Release audit optional gate for the changed artifact passes.', 'Generated artifacts remain public-safe.'],
    }),
    buildLane({
      id: 'gpt55_review',
      role: 'Production reviewer',
      model: 'GPT-5.5 reviewer',
      charter: 'Review Kimi-coded changes for security, completeness, claim boundaries, and operator usability before final gates are rerun.',
      owns: ['security_review', 'release_gate_review', 'operator_acceptance_review'],
      waits_for: ['kimi_coding'],
      blockers: blockersFor(operatorPhase),
      commands: commandsFor(operatorPhase),
      acceptance: ['No secrets, raw memory, personal data, account IDs, or local paths in public artifacts.', 'Operator acceptance blocker breakdown is zero before go-live.', 'Review findings are resolved or explicitly represented as blockers.'],
    }),
    buildLane({
      id: 'final_verification',
      role: 'Release verification lane',
      model: 'automation plus reviewer',
      charter: 'Rerun all current gates and regenerate status artifacts after external blockers clear.',
      owns: ['release_audit', 'goal_audit', 'dependency_report', 'status_board'],
      waits_for: ['gpt55_review', 'human_operator_credentials'],
      blockers: blockersFor(finalPhase),
      commands: commandsFor(finalPhase),
      acceptance: ['npm run check passes.', 'npm test passes.', 'npm run release:audit passes with required_failed:[]', 'production:status reports launch_ready:true only with fresh current inputs.'],
    }),
  ];
}

function buildWaves(statusBoard, lanes) {
  const laneById = new Map(lanes.map((lane) => [lane.id, lane]));
  return [
    {
      id: 'wave_1_external_access',
      objective: 'Resolve external account and credential blockers without exposing secrets.',
      lanes: ['human_operator_credentials'].filter((id) => laneById.has(id)),
      acceptance: ['Cloudflare credentials are available only out-of-band and validated by production:cloudflare-credentials.'],
    },
    {
      id: 'wave_2_architecture_and_coding',
      objective: 'Architect, implement, and verify the next production-hardening slice against current blockers.',
      lanes: ['gpt55_architecture', 'kimi_coding'].filter((id) => laneById.has(id)),
      acceptance: ['Changed scripts/tests/docs pass targeted checks before review.'],
    },
    {
      id: 'wave_3_review_and_acceptance',
      objective: 'Review the implementation and complete operator acceptance evidence only with real hosted refs.',
      lanes: ['gpt55_review'].filter((id) => laneById.has(id)),
      acceptance: ['Operator acceptance remains blocked unless decision is go and blockers are zero.'],
    },
    {
      id: 'wave_4_final_release',
      objective: 'Rerun final gates and regenerate status after all external blockers clear.',
      lanes: ['final_verification'].filter((id) => laneById.has(id)),
      acceptance: ['production:status, production:dependencies, and goal audit all report launch_ready:true with fresh evidence.'],
    },
  ];
}

export function buildAiOrchestrationPlan(inputs = {}, options = {}) {
  const statusBoard = requireObject(inputs.statusBoard, 'production status board');
  if (statusBoard.schema !== 'enigma.production_status_board.v1') throw new Error('production status board schema mismatch');
  const lanes = buildRoleLanes(statusBoard);
  const plan = {
    schema: AI_ORCHESTRATION_PLAN_SCHEMA,
    generated_at: options.generated_at ?? new Date().toISOString(),
    status: statusBoard.launch_ready === true ? 'ready' : 'blocked',
    launch_ready: statusBoard.launch_ready === true,
    source_status_board_generated_at: statusBoard.generated_at ?? null,
    source_status_next_phase_id: statusBoard.next_phase_id ?? null,
    source_status_fresh_input_evidence: statusBoard.fresh_input_evidence === true,
    next_phase_details: statusBoard.next_phase?.details ?? null,
    orchestration_mode: 'human_secret_custody_plus_ai_architecture_coding_review',
    role_lane_count: lanes.length,
    wave_count: 4,
    lanes,
    waves: buildWaves(statusBoard, lanes),
    non_delegable_controls: [
      'Cloudflare token values, account ids, registrar purchases, payments, 2FA, CAPTCHAs, and legal approvals stay human-controlled unless explicitly and safely provided out-of-band.',
      'No AI lane may mark the goal complete without fresh goal/dependency/workplan evidence and launch_ready:true.',
      'No lane may paste secrets, personal information, raw memory, prompts, transcripts, provider responses, or private keys into public artifacts.',
    ],
    claim_boundary: [
      'This artifact orchestrates work from existing production status evidence; it does not invoke external AI systems, create accounts, deploy infrastructure, approve operators, or certify launch readiness.',
      'Kimi/GPT role labels are execution lanes and review responsibilities, not proof that an external model has already performed the work.',
      'Launch readiness remains false until status, dependency, goal, hosted, and operator evidence all prove readiness with fresh current inputs.',
    ],
  };
  assertPublicSafe(plan);
  return plan;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) return { text: usage(), status: 0 };
  if (!args.statusBoard) throw new Error('--status-board is required');
  const plan = buildAiOrchestrationPlan({ statusBoard: await readJson(args.statusBoard, 'production status board') });
  const json = `${JSON.stringify(plan, null, 2)}\n`;
  if (args.out) {
    await mkdir(dirname(args.out), { recursive: true });
    await writeFile(args.out, json, 'utf8');
  }
  return { text: json, status: plan.launch_ready ? 0 : 1 };
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then(({ text, status }) => {
    process.stdout.write(text);
    process.exitCode = status;
  }).catch((error) => {
    process.stdout.write(`${JSON.stringify({ schema: AI_ORCHESTRATION_PLAN_SCHEMA, status: 'blocked', launch_ready: false, blockers: [error.message] }, null, 2)}\n`);
    process.exitCode = 1;
  });
}
