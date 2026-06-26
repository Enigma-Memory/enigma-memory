#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createBenchmarkAttestation,
  createProofNetworkPacket,
  sha256Json,
  validateBenchmarkAttestation,
  validateProofNetworkPacket,
} from '../packages/proof-network/src/index.js';

export const BENCHMARK_PROOF_RELEASE_SCHEMA = 'enigma.benchmark_proof_release.v1';
export const SCORE_COMMITMENT_SCHEMA = 'enigma.benchmark_proof_release.score_commitment.v1';
export const DEFAULT_BENCHMARK_PROOF_OUT_DIR = '.enigma/benchmark-proof-release';

const ATTESTATION_FILE = 'benchmark-attestation.json';
const PROOF_PACKET_FILE = 'benchmark-proof-packet.json';
const RELEASE_MANIFEST_FILE = 'benchmark-proof-release.json';
const SHA256_PREFIX = 'sha256:';
const PUBLIC_REF_RE = /^[a-z0-9][a-z0-9._:/@+-]{2,191}$/u;
const SCORE_KEY_RE = /^[a-z][a-z0-9_.:-]{1,63}$/u;
const PRIVATE_REPORT_KEY_RE = /(?:^|_)(?:raw_memory|memory_plaintext|plaintext|plain_text|prompt|prompts|conversation|conversations|message|messages|content|body|payload|payloads|document|documents|transcript|transcripts|completion|completions|embedding|embeddings|provider_response|provider_responses|response_body|credential|credentials|api_key|secret|password|private_key|seed|seed_phrase|mnemonic|tenant_name|customer_name|organization_name|org_name|account_id)(?:$|_)/iu;
const ALLOWED_FALSE_REPORT_KEYS = new Set([
  'raw_private_memory_plaintext_included',
  'raw_question_text_included',
  'raw_answer_text_included',
  'raw_conversation_text_included',
  'public_question_text_included',
  'public_answer_text_included',
  'provider_deletion_claim',
  'model_forgetting_claim',
  'roi_or_provider_invoice_savings_claim',
  'compliance_certification_claim',
  'benchmark_leadership_claim',
  'external_provider_calls',
  'llm_answer_accuracy_scored',
  'credentials_required',
  'raw_benchmark_body_included',
  'report_body_copied',
  'raw_memory_included',
  'prompts_included',
  'transcripts_included',
  'provider_responses_included',
  'provider_answer_accuracy_claim',
  'competitor_performance_claim',
  'solana_submission_claim',
  'roi_or_profit_claim',
  'provider_invoice_savings_claim',
  'hosted_saas_claim',
]);
const ALLOWED_PUBLIC_REPORT_KEYS = new Set([
  'estimated_prompt_tokens',
  'baseline_prompt_tokens',
  'optimized_prompt_tokens',
]);
const SECRET_VALUE_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|(?:seed phrase|mnemonic phrase|raw memory|private prompt|full transcript|provider response|embedding vector))/iu;
const ABSOLUTE_LOCAL_PATH_RE = /^(?:[A-Za-z]:[\\/]|\\\\|\/(?:Users|home|tmp|var|etc|mnt|Volumes)\b)/u;
const CLAIM_SCORE_KEY_RE = /(?:provider|competitor|roi|profit|savings|solana|transaction|answer_accuracy|leaderboard)/iu;
const PROOF_COMPATIBLE_REPORT_SCHEMAS = new Set([
  'enigma.memory_benchmark_suite.v1',
  'enigma.standard_memory_benchmark_suite.v1',
]);
const REQUIRED_FALSE_BOUNDARY_KEYS = Object.freeze([
  'external_provider_calls',
  'llm_answer_accuracy_scored',
  'provider_deletion_claim',
  'model_forgetting_claim',
  'roi_or_provider_invoice_savings_claim',
  'compliance_certification_claim',
  'benchmark_leadership_claim',
]);
const OPTIONAL_FALSE_BOUNDARY_KEYS = Object.freeze([
  'provider_answer_accuracy_claim',
  'competitor_performance_claim',
  'solana_submission_claim',
  'transaction_submitted',
  'roi_or_profit_claim',
  'provider_invoice_savings_claim',
  'hosted_saas_claim',
  'api_calls_made',
  'provider_api_calls_made',
  'network_calls_made',
  'mem0_adapter_run',
  'external_competitor_adapters_run',
]);

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

function readRequiredValue(argv, index, flag) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) throw new UsageError(`${flag} requires a value`);
  return value;
}

function publicString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new UsageError(`${label} must be a non-empty public value`);
  const normalized = value.trim();
  if (SECRET_VALUE_RE.test(normalized)) throw new UsageError(`${label} contains private or secret-looking material`);
  if (ABSOLUTE_LOCAL_PATH_RE.test(normalized)) throw new UsageError(`${label} must not be a local absolute path`);
  return normalized;
}

function pathString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new UsageError(`${label} must be a non-empty path`);
  const normalized = value.trim();
  if (SECRET_VALUE_RE.test(normalized)) throw new UsageError(`${label} contains private or secret-looking material`);
  return normalized;
}

function publicRef(value, label) {
  const normalized = publicString(value, label);
  if (!PUBLIC_REF_RE.test(normalized)) throw new UsageError(`${label} must be a lowercase public ref using letters, numbers, . _ : / @ + or -`);
  return normalized;
}

function parseScore(raw) {
  const normalized = publicString(raw, 'score');
  const equals = normalized.indexOf('=');
  if (equals <= 0 || equals === normalized.length - 1) throw new UsageError('--score must use key=value');
  const key = normalized.slice(0, equals).trim();
  const value = normalized.slice(equals + 1).trim();
  if (!SCORE_KEY_RE.test(key)) throw new UsageError('score key must be lowercase and use letters, numbers, . _ : or -');
  if (CLAIM_SCORE_KEY_RE.test(key)) throw new UsageError('score key must not imply provider accuracy, competitor performance, Solana submission, ROI, savings, profit, or leaderboard claims');
  publicString(value, `score ${key}`);
  return Object.freeze({ key, value });
}

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    report: undefined,
    datasetRef: undefined,
    runnerRef: undefined,
    packageRef: undefined,
    scores: [],
    outDir: DEFAULT_BENCHMARK_PROOF_OUT_DIR,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    const equalsIndex = raw.indexOf('=');
    const flag = equalsIndex > 0 ? raw.slice(0, equalsIndex) : raw;
    const inlineValue = equalsIndex > 0 ? raw.slice(equalsIndex + 1) : undefined;
    const value = () => {
      if (inlineValue !== undefined) return inlineValue;
      const next = readRequiredValue(argv, index, flag);
      index += 1;
      return next;
    };

    if (flag === '--help' || flag === '-h') args.help = true;
    else if (flag === '--report') args.report = pathString(value(), 'report path');
    else if (flag === '--dataset-ref') args.datasetRef = publicRef(value(), 'dataset ref');
    else if (flag === '--runner-ref') args.runnerRef = publicRef(value(), 'runner ref');
    else if (flag === '--package-ref') args.packageRef = publicRef(value(), 'package ref');
    else if (flag === '--score') args.scores.push(parseScore(value()));
    else if (flag === '--out-dir') args.outDir = pathString(value(), 'out dir');
    else throw new UsageError(`unknown option ${raw}; use --help`);
  }

  return Object.freeze({ ...args, scores: Object.freeze(args.scores) });
}

export function usage() {
  return `Usage: node scripts/build-benchmark-proof-release.mjs --report <path> --dataset-ref <ref> --runner-ref <ref> --package-ref <ref> [--score key=value ...] [--out-dir <dir>]

Builds a dependency-free, local benchmark proof release from an existing public-safe benchmark report. The report must use a compatible benchmark schema and explicit offline benchmark boundaries. The report file is parsed for public-safety checks and hashed, but its body and local path are never copied into the attestation or proof packet. The generated artifacts are local benchmark attestation/proof only: no API calls, provider answer-accuracy claims, Mem0 or competitor performance claims, Solana submissions, hosted SaaS claims, ROI/profit/savings claims, raw memory, prompts, transcripts, embeddings, credentials, account ids, private keys, or provider responses are written.
`;
}

function requireArgs(args) {
  const missing = [];
  if (args.report === undefined) missing.push('--report');
  if (args.datasetRef === undefined) missing.push('--dataset-ref');
  if (args.runnerRef === undefined) missing.push('--runner-ref');
  if (args.packageRef === undefined) missing.push('--package-ref');
  if (missing.length > 0) throw new UsageError(`missing required option(s): ${missing.join(', ')}`);
}

function sha256Buffer(buffer) {
  return `${SHA256_PREFIX}${createHash('sha256').update(buffer).digest('hex')}`;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertPublicReportPayload(value, path = 'report') {
  if (typeof value === 'string') {
    if (SECRET_VALUE_RE.test(value)) throw new UsageError(`${path} contains private or secret-looking material`);
    if (ABSOLUTE_LOCAL_PATH_RE.test(value)) throw new UsageError(`${path} contains a local absolute path`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertPublicReportPayload(item, `${path}[${index}]`));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (PRIVATE_REPORT_KEY_RE.test(key) && !ALLOWED_PUBLIC_REPORT_KEYS.has(key)) {
      if (!ALLOWED_FALSE_REPORT_KEYS.has(key) || child !== false) throw new UsageError(`${path}.${key} is not allowed in public benchmark proof artifacts`);
    }
    assertPublicReportPayload(child, `${path}.${key}`);
  }
}

function parseJsonReport(bytes) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new UsageError('report must be valid JSON');
  }
}

function reportSchema(report) {
  if (!isPlainObject(report)) throw new UsageError('report must be a JSON object');
  if (typeof report.schema !== 'string' || report.schema.trim() === '') throw new UsageError('report.schema must be a non-empty string');
  if (!PROOF_COMPATIBLE_REPORT_SCHEMAS.has(report.schema)) throw new UsageError(`report.schema is not proof-release compatible: ${report.schema}`);
  if (report.public_safe !== true) throw new UsageError('report.public_safe must be true');
  assertPublicReportPayload(report);
  assertProofCompatibleBenchmarkBoundaries(report);
  return report.schema;
}

function requireFalseField(row, key, path) {
  if (row[key] !== false) throw new UsageError(`${path}.${key} must be false for a public benchmark proof release`);
}

function assertBoundaryObject(report) {
  if (!isPlainObject(report.benchmark_boundaries)) throw new UsageError('report.benchmark_boundaries must be present for a public benchmark proof release');
  return report.benchmark_boundaries;
}

function assertCommandBoundaries(report) {
  if (report.command_boundaries === undefined) return;
  if (!isPlainObject(report.command_boundaries)) throw new UsageError('report.command_boundaries must be an object when present');
  for (const key of OPTIONAL_FALSE_BOUNDARY_KEYS) {
    if (report.command_boundaries[key] !== undefined && report.command_boundaries[key] !== false) {
      throw new UsageError(`report.command_boundaries.${key} must be false for a public benchmark proof release`);
    }
  }
  if (report.command_boundaries.api_spend_possible !== undefined && report.command_boundaries.api_spend_possible !== false) {
    throw new UsageError('report.command_boundaries.api_spend_possible must be false for a public benchmark proof release');
  }
}

function assertExternalAdaptersUnscored(report) {
  if (!Array.isArray(report.external_competitor_adapters)) return;
  report.external_competitor_adapters.forEach((row, index) => {
    if (!isPlainObject(row)) throw new UsageError(`report.external_competitor_adapters[${index}] must be an object`);
    if (row.scores_included !== false) throw new UsageError(`report.external_competitor_adapters[${index}].scores_included must be false`);
    for (const key of ['recall', 'answer_accuracy', 'latency', 'cost', 'ranking']) {
      if (row[key] !== undefined) throw new UsageError(`report.external_competitor_adapters[${index}].${key} is not allowed without a reviewed adapter run`);
    }
  });
}

function assertProofCompatibleBenchmarkBoundaries(report) {
  const boundaries = assertBoundaryObject(report);
  for (const key of REQUIRED_FALSE_BOUNDARY_KEYS) requireFalseField(boundaries, key, 'report.benchmark_boundaries');
  for (const key of OPTIONAL_FALSE_BOUNDARY_KEYS) {
    if (boundaries[key] !== undefined) requireFalseField(boundaries, key, 'report.benchmark_boundaries');
  }
  if (report.schema === 'enigma.standard_memory_benchmark_suite.v1') {
    if (boundaries.retrieval_evidence_proxy_scored !== true) throw new UsageError('standard benchmark report must set benchmark_boundaries.retrieval_evidence_proxy_scored true');
  }
  if (report.schema === 'enigma.memory_benchmark_suite.v1') {
    if (boundaries.local_only !== true) throw new UsageError('local memory benchmark report must set benchmark_boundaries.local_only true');
  }
  assertCommandBoundaries(report);
  assertExternalAdaptersUnscored(report);
}

function nonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0 ? value : undefined;
}

function sampleCountFromReport(report) {
  if (Array.isArray(report.datasets)) {
    let total = 0;
    for (const row of report.datasets) {
      total += nonNegativeInteger(row?.question_count) ?? nonNegativeInteger(row?.item_count) ?? 0;
    }
    if (total > 0) return total;
  }
  return nonNegativeInteger(report.metrics?.qa?.question_count)
    ?? nonNegativeInteger(report.fixture?.question_count)
    ?? nonNegativeInteger(report.fixture?.session_count)
    ?? 0;
}

function slugRefPart(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9._:/@+-]+/gu, '-').replace(/^-+|-+$/gu, '') || 'benchmark-report';
}

function scoreCommitments(scores, reportHash) {
  if (scores.length === 0) {
    const fallback = Object.freeze({
      schema: SCORE_COMMITMENT_SCHEMA,
      key: 'report_hash_only',
      value: reportHash,
      report_body_copied: false,
    });
    return Object.freeze([{ ...fallback, score_hash: sha256Json(fallback) }]);
  }
  return Object.freeze(scores.map((score) => {
    const body = Object.freeze({
      schema: SCORE_COMMITMENT_SCHEMA,
      key: score.key,
      value: score.value,
      report_body_copied: false,
    });
    return Object.freeze({ ...body, score_hash: sha256Json(body) });
  }));
}

function assertValidation(validation, label) {
  if (validation?.ok !== true) throw new Error(`${label} validation failed: ${(validation?.errors ?? ['unknown error']).join('; ')}`);
}

function releaseManifest({ generatedAt, reportHash, schema, sampleCount, datasetCount, args, commitments, attestation, packet }) {
  const manifest = {
    schema: BENCHMARK_PROOF_RELEASE_SCHEMA,
    generated_at: generatedAt,
    local_benchmark_attestation_only: true,
    api_calls_made: false,
    report: {
      report_hash: reportHash,
      report_schema: schema,
      report_public_safe: true,
      report_body_copied: false,
      report_path_copied: false,
      sample_count: sampleCount,
      dataset_count: datasetCount,
    },
    refs: {
      dataset_ref: args.datasetRef,
      runner_ref: args.runnerRef,
      package_ref: args.packageRef,
    },
    score_commitments: commitments,
    command_boundaries: {
      deterministic_offline_proof_builder: true,
      report_file_hashed_from_local_disk: true,
      network_calls_made: false,
      provider_api_calls_made: false,
      api_spend_possible: false,
      solana_transaction_submitted: false,
      benchmark_scores_generated: false,
      report_body_copied: false,
    },
    claim_boundaries: {
      provider_answer_accuracy_claim: false,
      competitor_performance_claim: false,
      solana_submission_claim: false,
      transaction_submitted: false,
      roi_or_profit_claim: false,
      provider_invoice_savings_claim: false,
      hosted_saas_claim: false,
      raw_benchmark_body_included: false,
      raw_memory_included: false,
      prompts_included: false,
      transcripts_included: false,
      provider_responses_included: false,
    },
    artifacts: {
      attestation_file: ATTESTATION_FILE,
      attestation_hash: attestation.benchmark_attestation_hash,
      proof_packet_file: PROOF_PACKET_FILE,
      proof_packet_hash: packet.proof_network_packet_hash,
    },
  };
  return manifest;
}

function outputLabel(outDir) {
  const normalized = outDir.replace(/\\/gu, '/');
  if (ABSOLUTE_LOCAL_PATH_RE.test(outDir) || normalized.split('/').includes('..')) return '<redacted-out-dir>';
  return normalized;
}

async function readReportBytes(path) {
  try {
    return await readFile(path);
  } catch {
    throw new Error('failed to read benchmark report');
  }
}

export async function buildBenchmarkProofRelease(args, options = {}) {
  requireArgs(args);
  const generatedAt = options.generated_at ?? options.generatedAt ?? new Date().toISOString();
  const bytes = await readReportBytes(args.report);
  const reportHash = sha256Buffer(bytes);
  const report = parseJsonReport(bytes);
  const schema = reportSchema(report);
  const sampleCount = sampleCountFromReport(report);
  const datasetCount = Array.isArray(report.datasets) ? report.datasets.length : 0;
  const commitments = scoreCommitments(args.scores, reportHash);
  const metricRoots = commitments.map((score) => score.score_hash);

  const attestation = createBenchmarkAttestation({
    attested_at: generatedAt,
    benchmark_ref: `benchmark:${slugRefPart(schema)}`,
    dataset_ref: args.datasetRef,
    runner_ref: args.runnerRef,
    package_ref: args.packageRef,
    report_hash: reportHash,
    metric_roots: metricRoots,
    sample_count: sampleCount,
    run_count: 1,
  });
  assertValidation(validateBenchmarkAttestation(attestation), 'benchmark attestation');

  const packet = createProofNetworkPacket({
    attestations: [attestation],
    packet_ref: `benchmark-proof-release:${sha256Json([attestation.benchmark_attestation_hash, reportHash]).slice(SHA256_PREFIX.length, SHA256_PREFIX.length + 32)}`,
    created_at: generatedAt,
  });
  assertValidation(validateProofNetworkPacket(packet), 'proof packet');

  const manifest = releaseManifest({ generatedAt, reportHash, schema, sampleCount, datasetCount, args, commitments, attestation, packet });
  assertPublicReportPayload(manifest, 'manifest');

  return Object.freeze({
    schema: BENCHMARK_PROOF_RELEASE_SCHEMA,
    generated_at: generatedAt,
    report_hash: reportHash,
    report_schema: schema,
    attestation,
    packet,
    manifest,
  });
}

export async function writeBenchmarkProofRelease(release, outDir) {
  const root = resolve(outDir);
  try {
    await mkdir(root, { recursive: true });
    const attestationPath = resolve(root, ATTESTATION_FILE);
    const packetPath = resolve(root, PROOF_PACKET_FILE);
    const manifestPath = resolve(root, RELEASE_MANIFEST_FILE);
    await writeFile(attestationPath, `${JSON.stringify(release.attestation, null, 2)}\n`, 'utf8');
    await writeFile(packetPath, `${JSON.stringify(release.packet, null, 2)}\n`, 'utf8');
    await writeFile(manifestPath, `${JSON.stringify(release.manifest, null, 2)}\n`, 'utf8');
    return Object.freeze({
      attestation_file: basename(attestationPath),
      proof_packet_file: basename(packetPath),
      release_manifest_file: basename(manifestPath),
    });
  } catch {
    throw new Error('failed to write benchmark proof release artifacts');
  }
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(usage());
    return 0;
  }
  const release = await buildBenchmarkProofRelease(args);
  const files = await writeBenchmarkProofRelease(release, args.outDir);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    schema: BENCHMARK_PROOF_RELEASE_SCHEMA,
    out_dir: outputLabel(args.outDir),
    ...files,
    report_hash: release.report_hash,
    report_schema: release.report_schema,
    sample_count: release.manifest.report.sample_count,
    dataset_count: release.manifest.report.dataset_count,
    report_body_copied: false,
    api_calls_made: false,
  }, null, 2)}\n`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${error.name ?? 'Error'}: ${error.message ?? 'failed to build benchmark proof release'}\n`);
    process.exitCode = 1;
  });
}
