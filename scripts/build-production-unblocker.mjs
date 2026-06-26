#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PRODUCTION_UNBLOCKER_SCHEMA = 'enigma.production_unblocker.v1';
export const CURRENT_PUBLIC_PACKAGE_VERSION = '0.1.15';

const STATUS_VALUES = Object.freeze([
  'ready_now',
  'contract_ready',
  'blocked_external_dependency',
  'operator_evidence_required',
]);

const SECRET_VALUE_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|cf-[A-Za-z0-9_-]{12,})/iu;
const LOCAL_PATH_RE = /(?<![A-Za-z])(?:[A-Za-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+|\/(?:Users|home|tmp|var|etc|mnt|Volumes)\/[^\s"']+)/u;
const FORBIDDEN_KEY_RE = /(?:password|passwd|pwd|api[_-]?key|private[_-]?key|secret|token|account[_-]?id|raw[_-]?memory|plaintext|plain[_-]?text|prompt|completion|transcript|embedding|provider[_-]?response|cookie|session|seed|mnemonic|wallet[_-]?private|private[_-]?path|customer[_-]?name|tenant[_-]?name)/iu;
const SAFE_FIELD_NAMES = new Set([
  'credentials_required',
  'credentials_used',
  'requires_credentials',
  'secret_values_printed',
  'transaction_submitted',
  'raw_memory_on_chain',
  'raw_memory_in_public_artifacts',
  'hosted_saas_live',
  'hosted_cloud_live_claim',
  'solana_mainnet_live_claim',
  'solana_transaction_claim',
  'provider_response_claim',
  'model_forgetting_claim',
  'provider_deletion_claim',
  'benchmark_leadership_claim',
  'token_roi_claim',
  'token_profit_claim',
  'provider_invoice_savings_claim',
  'external_provider_called',
]);

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertPublicSafe(value, path = 'production_unblocker') {
  if (typeof value === 'string') {
    if (SECRET_VALUE_RE.test(value)) throw new Error(`${path} contains secret-looking material`);
    if (LOCAL_PATH_RE.test(value)) throw new Error(`${path} contains a local absolute path`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertPublicSafe(item, `${path}[${index}]`));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEY_RE.test(key) && !SAFE_FIELD_NAMES.has(key)) throw new Error(`${path}.${key} is not allowed in public production unblocker input`);
    assertPublicSafe(child, `${path}.${key}`);
  }
}

function publicPackageSummary(packageJson = {}, options = {}) {
  const bins = isPlainObject(packageJson.bin) ? Object.keys(packageJson.bin).sort() : [];
  const sourceVersion = typeof packageJson.version === 'string' ? packageJson.version : null;
  const currentPublicVersion = typeof options.currentPublicVersion === 'string' ? options.currentPublicVersion : CURRENT_PUBLIC_PACKAGE_VERSION;
  return {
    name: typeof packageJson.name === 'string' ? packageJson.name : 'enigma-memory',
    version: sourceVersion,
    source_version: sourceVersion,
    current_public_version: currentPublicVersion,
    node: typeof packageJson.engines?.node === 'string' ? packageJson.engines.node : '>=24',
    bins,
  };
}

const ALLOWED_INPUT_KEYS = new Set(['packageJson', 'currentPublicVersion', 'evidence']);

function assertKnownInputs(inputs) {
  if (!isPlainObject(inputs)) throw new Error('production unblocker inputs must be an object');
  for (const key of Object.keys(inputs)) {
    if (!ALLOWED_INPUT_KEYS.has(key)) throw new Error(`unsupported production unblocker input field: ${key}`);
  }
}


function command(id, purpose, value, options = {}) {
  return {
    id,
    purpose,
    command: value,
    mode: options.mode ?? 'dry_run_or_planning',
    requires_credentials: options.requires_credentials === true,
    mutates_external_systems: options.mutates_external_systems === true,
  };
}

function section(id, title, status, summary, details) {
  if (!STATUS_VALUES.includes(status)) throw new Error(`invalid unblocker status for ${id}`);
  return {
    id,
    title,
    status,
    summary,
    evidence_available: details.evidence_available ?? [],
    blockers: details.blockers ?? [],
    non_claims: details.non_claims ?? [],
    next_commands: details.next_commands ?? [],
  };
}

function buildSections(packageSummary) {
  const packageRef = `${packageSummary.name}@${packageSummary.version ?? '<version>'}`;
  return [
    section(
      'npm_install_readiness',
      'npm install readiness',
      'ready_now',
      'The npm install path is the current supported production install tier; this report distinguishes the current public package from the local source release candidate.',
      {
        evidence_available: [
          `Current public install baseline: ${packageSummary.name}@${packageSummary.current_public_version}.`,
          `Local source release candidate: ${packageSummary.name}@${packageSummary.source_version ?? '<unknown>'}.`,
          `Package metadata requires Node ${packageSummary.node}.`,
          `CLI bins listed in package metadata: ${packageSummary.bins.join(', ') || 'none listed'}.`,
        ],
        blockers: [],
        non_claims: [
          'npm install readiness does not mean the source release candidate has already been published.',
          'Installing the package does not make hosted cloud live.',
          'Installing the package does not submit Solana transactions.',
          'Installing the package does not prove provider deletion, model forgetting, compliance, ROI, or provider invoice savings.',
        ],
        next_commands: [
          command('build-unblocker-report', 'Regenerate this consolidated public-safe unblocker report.', 'npm run production:unblocker -- --out .enigma/production-unblocker.json'),
          command('registry-install-plan-current', 'Validate the current public registry install plan without network install.', `npm run registry:verify -- --package ${packageSummary.name} --version ${packageSummary.current_public_version} --skip-network`),
          command('registry-install-execute-current', 'Collect real current public registry install evidence in an isolated temporary prefix.', `npm run registry:verify -- --package ${packageSummary.name} --version ${packageSummary.current_public_version} --execute`, { mode: 'explicit_execute_network', mutates_external_systems: false }),
          command('registry-install-execute-candidate', 'After release publication only, collect registry install evidence for the local source release candidate.', `npm run registry:verify -- --package ${packageSummary.name} --version ${packageSummary.source_version ?? '<candidate-version>'} --execute`, { mode: 'explicit_execute_network_after_publish', mutates_external_systems: false }),
        ],
      },
    ),
    section(
      'hosted_cloud_external_blockers',
      'Hosted cloud external blockers',
      'blocked_external_dependency',
      'Hosted-cloud package contracts exist, but sellable hosted SaaS remains blocked on real provider wiring, legal/security approvals, operations ownership, and operator go-live evidence.',
      {
        evidence_available: [
          'Hosted-cloud builders and validators can produce public-safe customer lifecycle and API-key lifecycle packets.',
          'Operator evidence starter and backend env kit commands can generate templates and public-safe fill plans.',
        ],
        blockers: [
          'Auth provider, billing provider, legal terms, data-processing terms, support ownership, and external security review evidence are not created by the package.',
          'Hosted relay/gateway/storage/KMS/SIEM/backup/monitoring/domain/TLS evidence must be supplied by an operator.',
          'Operator go-live approval is required before hosted_cloud_sellable can be true.',
        ],
        non_claims: [
          'No hosted account, customer tenant, customer API key, invoice, support ticket, Cloudflare resource, provider resource, or deployment is created by this report.',
          'Contract readiness is not live hosted SaaS readiness.',
        ],
        next_commands: [
          command('operator-evidence-starter', 'Generate public-safe hosted evidence templates and fill order.', 'npm run production:evidence-starter -- --out-dir .enigma/operator-evidence --domain enigmamemory.com --tenant <tenant-id>'),
          command('backend-env-kit', 'Generate the backend environment kit and public summary for operator completion outside public artifacts.', 'npm run production:backend-env -- --out-dir .enigma/backend-env-kit --domain enigmamemory.com --tenant <tenant-id> --environment production'),
          command('hosted-live-validate', 'Validate completed hosted live evidence after real operator refs exist.', 'npm run production:hosted-live -- --evidence .enigma/operator-evidence/hosted-backend-live.json', { mode: 'operator_evidence_validation' }),
          command('hosted-customer-lifecycle', 'Build hosted customer lifecycle contract evidence from public-safe refs.', 'npm run production:hosted-customer -- --tenant <tenant-id> --domain enigmamemory.com --environment production --out .enigma/hosted-customer-lifecycle.json'),
          command('hosted-api-key-lifecycle', 'Build customer API-key lifecycle contract evidence from refs, not key material.', 'npm run production:hosted-api-key -- --tenant <tenant-id> --subject <opaque-subject-ref> --operation issue --out .enigma/hosted-api-key-lifecycle.json'),
        ],
      },
    ),
    section(
      'solana_proof_rail_status',
      'Solana proof rail status',
      'contract_ready',
      'The proof rail is local planning and verification: artifacts are Solana-ready commitments, not submitted transactions or live mainnet infrastructure.',
      {
        evidence_available: [
          'Local chain CLI commands create anchor, grant, revocation, benchmark-attestation, and verification artifacts with transaction_submitted:false.',
          'The proof packet builder hashes benchmark reports and emits public-safe proof-network packets.',
        ],
        blockers: [
          'Devnet/mainnet program deployment, transaction submission, program security review, governance, indexer evidence, and operational ownership are separate external work.',
          'Any future network mutation must be explicit and must not be implied by local planning artifacts.',
        ],
        non_claims: [
          'No Solana transaction is submitted by this report or by default local proof commands.',
          'Raw memory is not placed on-chain.',
          'No token ROI, profit, provider invoice savings, provider deletion, model-forgetting, compliance, or hosted SaaS claim is created by proof artifacts.',
        ],
        next_commands: [
          command('chain-attest-local', 'Create a local benchmark attestation from a reviewed report hash/file and public refs.', `enigma chain attest --report-file .enigma/standard-memory-benchmark-sample.json --dataset-ref sha256:<dataset-manifest-hash> --runner-ref run-standard-memory-benchmarks.mjs@<reviewed-revision> --package-ref ${packageRef} --score retrieval_evidence_proxy=<value-copied-from-report> --out .enigma/standard-memory-benchmark-attestation.json`),
          command('chain-verify-local', 'Verify a local proof-network artifact offline.', 'enigma chain verify --file .enigma/standard-memory-benchmark-attestation.json'),
          command('proof-packet-local', 'Bundle public-safe roots and a benchmark report hash into a local proof packet.', 'npm run proof:packet -- --active-root sha256:<active-root> --receipt-root sha256:<receipt-root> --benchmark-report .enigma/standard-memory-benchmark-sample.json --dataset-hash sha256:<dataset-manifest-hash> --runner-hash sha256:<runner-hash> --operator-ref operator:<public-ref> --out .enigma/proof-network-packet.json'),
        ],
      },
    ),
    section(
      'benchmark_claim_status',
      'Benchmark claim status',
      'operator_evidence_required',
      'Local and official-dataset retrieval/evidence proxy benchmark commands exist; public claims require exact report, dataset manifest, runner/package refs, and claim-boundary review.',
      {
        evidence_available: [
          'The local deterministic memory suite can produce enigma.memory_benchmark_suite.v1 without provider credentials.',
          'The standard runner can score local LoCoMo/LongMemEval files as retrieval/evidence proxy evidence only.',
        ],
        blockers: [
          'Official dataset files and hashes must be collected locally before standard benchmark claims.',
          'Provider answer-accuracy, competitor, leaderboard, savings, compliance, model-forgetting, and provider-deletion claims require separate reviewed runs and are not present by default.',
        ],
        non_claims: [
          'No provider API, hosted memory service, competitor SDK, ChatGPT native memory, or Claude memory tool is called by the local default benchmark paths.',
          'Retrieval/evidence proxy metrics are not LLM answer accuracy or benchmark leadership.',
        ],
        next_commands: [
          command('benchmark-dataset-plan', 'Preview dataset fetches without downloading raw data.', 'npm run benchmark:datasets -- --dry-run'),
          command('benchmark-dataset-download', 'Download supported official datasets and write a public-safe manifest.', 'npm run benchmark:datasets -- --execute --dataset all --out-dir .enigma/benchmarks/datasets --manifest .enigma/benchmarks/dataset-manifest.json', { mode: 'explicit_execute_network' }),
          command('benchmark-standard-sample', 'Run a bounded standard retrieval/evidence proxy benchmark from local dataset files.', 'npm run benchmark:standard -- --locomo .enigma/benchmarks/datasets/locomo10.json --longmemeval .enigma/benchmarks/datasets/longmemeval_s_cleaned.json --max-locomo-qa 25 --max-longmemeval-items 25 --top-k 5 --out .enigma/standard-memory-benchmark-sample.json'),
          command('benchmark-local-suite', 'Run the local deterministic package benchmark suite.', 'npm run benchmark:memory-suite -- --out .enigma/memory-benchmark-suite.json'),
        ],
      },
    ),
    section(
      'installer_distribution_status',
      'Installer distribution status',
      'blocked_external_dependency',
      'npm is the production install tier now; native signed installer distribution remains blocked on external signing, notarization, release runners, and review evidence.',
      {
        evidence_available: [
          'The installer asset generator can produce reviewable source installer assets with dry-run/planning defaults.',
          'Generated source installer assets do not by themselves publish a Homebrew tap, signed Windows executable, or signed/notarized macOS package.',
        ],
        blockers: [
          'Windows distribution needs installer builder selection, code-signing certificate, signing workflow, and release review.',
          'macOS distribution needs package build runner, Developer ID Installer certificate, notarization workflow, and release review.',
          'Homebrew distribution needs a real release archive URL/SHA and tap workflow approval.',
        ],
        non_claims: [
          'No signed native installer exists from this report.',
          'Installer source assets are not a completed OS-native distribution channel.',
        ],
        next_commands: [
          command('installer-assets-preview', 'Preview reviewable installer source assets.', 'npm run installer:assets -- --out-dir dist/installer-assets'),
          command('installer-assets-write', 'Write reviewable installer source assets for release engineering.', 'npm run installer:assets -- --out-dir dist/installer-assets --write', { mode: 'local_write_explicit' }),
        ],
      },
    ),
    section(
      'monitoring_ops_status',
      'Monitoring and operations status',
      'operator_evidence_required',
      'Ops validators and dry-run monitors exist, but production monitoring, alert routing, backup/restore, incident drill, support/SLA, and acceptance evidence must be supplied by operators.',
      {
        evidence_available: [
          'Live endpoint monitoring has a dry-run mode and public-safe endpoint constraints.',
          'Production validators exist for monitoring/alerting, backup/restore drill, incident drill, support/SLA, legal/compliance, network, KMS, usage, settlement, site security, and threat model evidence.',
        ],
        blockers: [
          'Monitoring provider, alert routing, on-call ownership, incident commander, support escalation, backup target, restore rehearsal, and legal/security approvals are external operator evidence.',
          'Public site health is not hosted backend readiness; relay/gateway readiness requires exact live endpoint and operator acceptance evidence.',
        ],
        non_claims: [
          'Dry-run monitoring does not prove future availability or contractual SLA performance.',
          'Validator acceptance of a ref packet is not a compliance certification.',
        ],
        next_commands: [
          command('live-monitor-dry-run', 'Validate default public endpoint monitor configuration without network probes.', 'npm run production:live-monitor:dry-run'),
          command('live-monitor-public-safe', 'Collect live endpoint monitoring evidence only after endpoints are intentionally public and secret-free.', 'npm run production:live-monitor -- --endpoint public_site=https://enigmamemory.com/ --endpoint relay_readyz=https://relay.enigmamemory.com/readyz --endpoint gateway_readyz=https://gateway.enigmamemory.com/readyz --out .enigma/live-endpoint-monitor.json', { mode: 'operator_network_observation' }),
          command('monitoring-validator', 'Validate operator monitoring/alerting evidence packet.', 'npm run production:monitoring -- --monitoring .enigma/operator-evidence/monitoring-alerting.json --out .enigma/monitoring-alerting-result.json', { mode: 'operator_evidence_validation' }),
          command('backup-drill-validator', 'Validate operator backup/restore drill evidence packet.', 'npm run production:backup-drill -- --drill .enigma/operator-evidence/backup-restore-drill.json --out .enigma/backup-restore-drill-result.json', { mode: 'operator_evidence_validation' }),
          command('incident-drill-validator', 'Validate operator incident drill evidence packet.', 'npm run production:incident-drill -- --drill .enigma/operator-evidence/incident-drill.json --out .enigma/incident-drill-result.json', { mode: 'operator_evidence_validation' }),
        ],
      },
    ),
  ];
}

function statusCounts(sections) {
  const counts = Object.fromEntries(STATUS_VALUES.map((status) => [status, 0]));
  for (const item of sections) counts[item.status] += 1;
  return counts;
}

function flattenCommands(sections) {
  return sections.flatMap((item) => item.next_commands.map((entry) => ({ section: item.id, ...entry })));
}

export function buildProductionUnblocker(inputs = {}, options = {}) {
  assertKnownInputs(inputs);
  if (inputs.evidence !== undefined) assertPublicSafe(inputs.evidence, 'production_unblocker.evidence');
  const generatedAt = options.generated_at ?? options.generatedAt ?? new Date().toISOString();
  const packageSummary = publicPackageSummary(inputs.packageJson ?? {}, { currentPublicVersion: inputs.currentPublicVersion ?? options.current_public_version ?? options.currentPublicVersion });
  const sections = buildSections(packageSummary);
  const blockers = sections.flatMap((item) => item.blockers.map((blocker) => ({ section: item.id, status: item.status, blocker })));
  const report = {
    schema: PRODUCTION_UNBLOCKER_SCHEMA,
    generated_at: generatedAt,
    mode: 'dry_run_planning',
    credentials_required: false,
    credentials_used: false,
    mutates_external_systems: false,
    overall_status: blockers.length === 0 ? 'ready_now' : 'blocked_external_dependency',
    package: packageSummary,
    status_legend: {
      ready_now: 'Usable now within the stated local/package boundary.',
      contract_ready: 'Interfaces, validators, or local planning artifacts exist, but live external operation is not claimed.',
      blocked_external_dependency: 'External provider, credential, signing, deployment, legal, security, or operator system is required.',
      operator_evidence_required: 'The repository supplies the command or validator, but an operator must provide current public-safe evidence.',
    },
    status_counts: statusCounts(sections),
    sections,
    go_live_blockers: blockers,
    operator_next_commands: flattenCommands(sections),
    live_claims: {
      hosted_saas_live: false,
      hosted_cloud_live_claim: false,
      solana_mainnet_live_claim: false,
      solana_transaction_claim: false,
      transaction_submitted: false,
      raw_memory_on_chain: false,
      raw_memory_in_public_artifacts: false,
      external_provider_called: false,
      provider_response_claim: false,
      model_forgetting_claim: false,
      provider_deletion_claim: false,
      benchmark_leadership_claim: false,
      token_roi_claim: false,
      token_profit_claim: false,
      provider_invoice_savings_claim: false,
    },
    claim_boundary: [
      'This report is public-safe planning evidence. It does not publish, deploy, create accounts, submit transactions, create credentials, call model providers, or mutate external systems.',
      'ready_now means ready within the named local/package boundary only; it does not imply hosted SaaS, Solana mainnet, benchmark leadership, compliance, provider deletion, model forgetting, ROI, profit, or provider invoice savings.',
      'contract_ready means schemas, validators, CLI planning, or local proof artifacts exist; an operator must still supply external evidence before live or sellable claims.',
      'Commands marked explicit_execute_network or operator_network_observation should only be run by an operator with approval for that environment.',
    ],
  };
  assertPublicSafe(report);
  return report;
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    out: null,
    generatedAt: null,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    const readValue = () => {
      const value = argv[index + 1];
      if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) throw new UsageError(`${token} requires a value`);
      index += 1;
      return value;
    };
    if (token === '--out') args.out = readValue();
    else if (token === '--generated-at' || token === '--generatedAt') args.generatedAt = readValue();
    else throw new UsageError(`unknown production unblocker option: ${token}`);
  }
  return args;
}

function usage() {
  return `Usage: node scripts/build-production-unblocker.mjs [--out <file>] [--generated-at <iso>]

Builds a dependency-free public-safe production unblocker report. The command is dry-run/planning by default: it requires no credentials, does not publish, does not deploy, does not submit Solana transactions, does not call providers, and does not mutate external systems.
`;
}

async function readPackageJson() {
  const packageUrl = new URL('../package.json', import.meta.url);
  try {
    return JSON.parse(await readFile(packageUrl, 'utf8'));
  } catch {
    return {};
  }
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) return { text: usage(), code: 0 };
  const report = buildProductionUnblocker({ packageJson: await readPackageJson() }, { generated_at: args.generatedAt ?? new Date().toISOString() });
  const text = `${JSON.stringify(report, null, 2)}\n`;
  if (args.out) {
    const outPath = resolve(args.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, text, 'utf8');
  }
  return { text, code: 0 };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().then(({ text, code }) => {
    process.stdout.write(text);
    process.exitCode = code;
  }).catch((error) => {
    process.stderr.write(`${error.name ?? 'Error'}: ${error.message ?? 'failed to build production unblocker'}\n`);
    process.exitCode = 2;
  });
}
