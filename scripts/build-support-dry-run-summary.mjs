#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPublicSafeArtifact } from '../packages/core/src/index.js';

export const SUPPORT_DRY_RUN_SUMMARY_SCHEMA = 'enigma.support_dry_run_summary.v1';
export const SUPPORT_DRY_RUN_EVIDENCE_ITEM_ID = 'EV-P10-SUPPORT-DRY-RUN-SUMMARY';

const TRIAGE_RESULTS = new Set(['resolved', 'needs_user_action', 'escalated', 'release_blocker', 'blocked']);
const PRIVACY_CHECK_STATUSES = new Set(['pass', 'fail', 'blocked', 'not_applicable']);
const SCENARIO_RE = /^(?:BETA|GA)-[A-Z0-9-]+-\d{3}$/u;
const ISSUE_CODE_RE = /^[A-Z][A-Z0-9]+-[A-Z0-9-]+$/u;
const OWNER_REF_RE = /^ref:role:[A-Za-z0-9._~:@#?=&%+-]{1,96}$/u;
const SECRET_OR_PRIVATE_TEXT_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]+|ghp_[A-Za-z0-9_]{16,}|npm_[A-Za-z0-9_-]{24,}|api[_-]?key\s*[=:]|password\s*[=:]|token\s*[=:]|raw[_ -]?memory|prompt|transcript|provider[_ -]?response|account[_ -]?id|customer[_ -]?id|C:[\\/](?:Users|Windows|ProgramData|Program Files)[\\/]|\/(?:Users|home|tmp|var|private|mnt|Volumes)\/)/iu;
const SUPPORT_ARTIFACT_SCHEMAS = new Set(['enigma.support_summary.v1', 'enigma.diagnostics.v1']);
const PUBLIC_VALUE_RE = /^[A-Za-z0-9][A-Za-z0-9._~:@#?=&%+/-]{0,159}$/u;

function usage() {
  return `Usage: node scripts/build-support-dry-run-summary.mjs --scenario-id <id> --issue-code <code> --triage-result <result> --bundle-privacy-check-status <status> --support-owner-ref <ref:role:...> [--support-artifact <redacted-json>] [--out <path>] [--json]\n\nBuilds a public-safe ${SUPPORT_DRY_RUN_SUMMARY_SCHEMA} artifact for the public beta support dry-run evidence item.\n`;
}

function readArg(argv, index, flag) {
  if (index >= argv.length || argv[index].startsWith('--')) throw new Error(`Missing value for ${flag}`);
  return argv[index];
}

export function parseSupportDryRunArgs(argv = process.argv.slice(2)) {
  const options = { json: false, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--scenario-id' || arg === '--scenarioId') {
      options.scenario_id = readArg(argv, i + 1, arg);
      i += 1;
    } else if (arg === '--issue-code' || arg === '--issueCode') {
      options.issue_code = readArg(argv, i + 1, arg);
      i += 1;
    } else if (arg === '--triage-result' || arg === '--triageResult') {
      options.triage_result = readArg(argv, i + 1, arg);
      i += 1;
    } else if (arg === '--bundle-privacy-check-status' || arg === '--bundlePrivacyCheckStatus') {
      options.bundle_privacy_check_status = readArg(argv, i + 1, arg);
      i += 1;
    } else if (arg === '--support-owner-ref' || arg === '--supportOwnerRef') {
      options.support_owner_ref = readArg(argv, i + 1, arg);
      i += 1;
    } else if (arg === '--generated-at' || arg === '--generatedAt') {
      options.generated_at = readArg(argv, i + 1, arg);
      i += 1;
    } else if (arg === '--support-artifact' || arg === '--supportArtifact') {
      options.support_artifact = readArg(argv, i + 1, arg);
      i += 1;
    } else if (arg === '--out') {
      options.out = readArg(argv, i + 1, '--out');
      i += 1;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function requiredString(options, key) {
  const value = options[key];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing required ${key}`);
  if (SECRET_OR_PRIVATE_TEXT_RE.test(value)) throw new Error(`${key} is not public-safe`);
  return value;
}

function normalizeGeneratedAt(value) {
  if (value === undefined || value === null || value === '') return new Date().toISOString();
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new Error('generated_at must be an ISO timestamp');
  return new Date(Date.parse(value)).toISOString();
}

function publicSafeString(value, field, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || value.length > 160 || SECRET_OR_PRIVATE_TEXT_RE.test(value) || !PUBLIC_VALUE_RE.test(value)) {
    throw new Error(`${field} is not public-safe`);
  }
  return value;
}

function publicSafeBoolean(value) {
  return value === true;
}

function publicSafeStringList(value, field) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map((item, index) => publicSafeString(item, `${field}[${index}]`)).filter(Boolean);
}

export function buildSupportArtifactSnapshot(artifact) {
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) throw new Error('support artifact must be a JSON object');
  const safety = verifyPublicSafeArtifact(artifact);
  if (!safety.ok) throw new Error(`support artifact is not public-safe: ${safety.errors.join('; ')}`);
  const schema = publicSafeString(artifact.schema, 'support_artifact.schema');
  if (!SUPPORT_ARTIFACT_SCHEMAS.has(schema)) throw new Error('support artifact schema is not supported');

  const snapshot = {
    schema,
    artifact_hash: safety.public_hash,
  };

  if (typeof artifact.ok === 'boolean') snapshot.ok = artifact.ok;

  if (schema === 'enigma.support_summary.v1') {
    const setupState = publicSafeString(artifact.setup_state ?? artifact.setup_status?.state, 'support_artifact.setup_state', 'unknown');
    snapshot.setup_state = setupState;
    const supportCode = publicSafeString(artifact.support_code, 'support_artifact.support_code', null);
    if (supportCode) snapshot.support_code = supportCode;
    snapshot.issue_codes = publicSafeStringList(artifact.issue_codes ?? artifact.setup_status?.reasons, 'support_artifact.issue_codes');
    snapshot.redaction = {
      raw_memory_included: publicSafeBoolean(artifact.redaction?.raw_memory_included),
      prompts_included: publicSafeBoolean(artifact.redaction?.prompts_included),
      transcripts_included: publicSafeBoolean(artifact.redaction?.transcripts_included),
      credentials_included: publicSafeBoolean(artifact.redaction?.credentials_included),
      provider_responses_included: publicSafeBoolean(artifact.redaction?.provider_responses_included),
      local_paths_redacted: artifact.redaction?.local_paths_redacted !== false,
    };
  } else {
    snapshot.memory_drive_status = publicSafeString(artifact.memory_drive_status, 'support_artifact.memory_drive_status', 'unknown');
    snapshot.service_running = publicSafeBoolean(artifact.service_running);
    snapshot.issue_codes = publicSafeStringList(artifact.issue_codes, 'support_artifact.issue_codes');
  }

  const claimBoundaries = artifact.claim_boundaries ?? {};
  snapshot.claim_boundaries = {
    provider_deletion_proof: publicSafeBoolean(claimBoundaries.provider_deletion_proof),
    model_forgetting_proof: publicSafeBoolean(claimBoundaries.model_forgetting_proof),
    hosted_saas_live: publicSafeBoolean(claimBoundaries.hosted_saas_live),
  };

  const snapshotSafety = verifyPublicSafeArtifact(snapshot);
  if (!snapshotSafety.ok) throw new Error(`support artifact snapshot is not public-safe: ${snapshotSafety.errors.join('; ')}`);
  return snapshot;
}

export async function readSupportArtifactSnapshot(path) {
  let raw;
  try {
    raw = await readFile(resolve(path), 'utf8');
  } catch {
    throw new Error('support artifact could not be read');
  }
  let artifact;
  try {
    artifact = JSON.parse(raw);
  } catch {
    throw new Error('support artifact must be valid JSON');
  }
  return buildSupportArtifactSnapshot(artifact);
}

export function buildSupportDryRunSummary(options = {}) {
  const scenarioId = requiredString(options, 'scenario_id');
  const issueCode = requiredString(options, 'issue_code');
  const triageResult = requiredString(options, 'triage_result');
  const bundlePrivacyCheckStatus = requiredString(options, 'bundle_privacy_check_status');
  const supportOwnerRef = requiredString(options, 'support_owner_ref');

  if (!SCENARIO_RE.test(scenarioId)) throw new Error('scenario_id must be a beta or GA scenario id');
  if (!ISSUE_CODE_RE.test(issueCode)) throw new Error('issue_code must use the support-code taxonomy');
  if (!TRIAGE_RESULTS.has(triageResult)) throw new Error('triage_result is not supported');
  if (!PRIVACY_CHECK_STATUSES.has(bundlePrivacyCheckStatus)) throw new Error('bundle_privacy_check_status is not supported');
  if (!OWNER_REF_RE.test(supportOwnerRef)) throw new Error('support_owner_ref must be an opaque role ref');

  const summary = {
    schema: SUPPORT_DRY_RUN_SUMMARY_SCHEMA,
    evidence_item_id: SUPPORT_DRY_RUN_EVIDENCE_ITEM_ID,
    generated_at: normalizeGeneratedAt(options.generated_at),
    scenario_id: scenarioId,
    issue_code: issueCode,
    triage_result: triageResult,
    bundle_privacy_check_status: bundlePrivacyCheckStatus,
    support_owner_ref: supportOwnerRef,
    privacy_review: {
      status: bundlePrivacyCheckStatus === 'pass' ? 'pass' : 'hold',
      raw_logs_included: false,
      screenshots_included: false,
      transcripts_included: false,
      credentials_included: false,
      account_identifiers_included: false,
      local_absolute_paths_included: false,
    },
    public_safe_fields: [
      'scenario_id',
      'issue_code',
      'triage_result',
      'bundle_privacy_check_status',
      'support_owner_ref',
    ],
    omitted_private_fields: [
      'raw_logs',
      'screenshots',
      'transcripts',
      'credentials',
      'account_identifiers',
      'owner_names',
      'local_absolute_paths',
      'raw_support_artifacts',
    ],
    advisory_effect: 'Reviewable support dry-run evidence only; clean-machine, signing, release, approval, and public-beta gates remain governed by the QA matrix and release-owner checklist.',
    claim_boundaries: {
      public_beta_ready: false,
      production_ready: false,
      provider_deletion_proof: false,
      model_forgetting_proof: false,
      hosted_saas_live: false,
      compliance_certification: false,
    },
  };
  const supportArtifact = options.support_artifact_snapshot
    ?? (options.support_artifact && typeof options.support_artifact === 'object' && !Array.isArray(options.support_artifact)
      ? buildSupportArtifactSnapshot(options.support_artifact)
      : null);
  if (supportArtifact) {
    summary.support_artifact = supportArtifact;
    summary.public_safe_fields.push('support_artifact');
  }

  const safety = verifyPublicSafeArtifact(summary);
  if (!safety.ok) throw new Error(`support dry-run summary is not public-safe: ${safety.errors.join('; ')}`);
  return summary;
}

export async function runSupportDryRunSummary(argv = process.argv.slice(2), io = { stdout: process.stdout, stderr: process.stderr }) {
  const options = parseSupportDryRunArgs(argv);
  if (options.help) {
    io.stdout.write(usage());
    return 0;
  }
  if (options.support_artifact && typeof options.support_artifact === 'string') {
    options.support_artifact_snapshot = await readSupportArtifactSnapshot(options.support_artifact);
  }
  const summary = buildSupportDryRunSummary(options);
  if (options.out) {
    const out = resolve(options.out);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  }
  io.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  return summary.bundle_privacy_check_status === 'pass' ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    process.exitCode = await runSupportDryRunSummary();
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ schema: SUPPORT_DRY_RUN_SUMMARY_SCHEMA, ok: false, error: { code: 'SUPPORT_DRY_RUN_ERROR', message: error.message } }, null, 2)}\n`);
    process.exitCode = 2;
  }
}
