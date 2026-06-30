#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildPublicBetaEvidenceManifest } from './build-public-beta-evidence-manifest.mjs';
import { buildSupportDryRunSummary } from './build-support-dry-run-summary.mjs';
import { buildPublicBetaQaMatrix, renderPublicBetaQaPlain } from './run-public-beta-qa-matrix.mjs';
import { buildCleanMachineSmokePlan } from './run-clean-machine-smoke.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const GENERATED_SUPPORT_DRY_RUNS = Object.freeze([
  {
    fileName: 'support-dry-run-diagnostics.json',
    scenario_id: 'BETA-DIAG-001',
    issue_code: 'DIAG-BUNDLE-PREVIEWED',
    triage_result: 'blocked',
    bundle_privacy_check_status: 'blocked',
    support_owner_ref: 'ref:role:beta-support',
  },
  {
    fileName: 'support-dry-run-crash.json',
    scenario_id: 'BETA-CRASH-001',
    issue_code: 'CRASH-REPORTING-MANUAL-EVIDENCE',
    triage_result: 'blocked',
    bundle_privacy_check_status: 'blocked',
    support_owner_ref: 'ref:role:beta-support',
  },
]);
const DEFAULT_OUT_DIR = '.enigma/public-beta';

function usage() {
  return `Usage: node scripts/run-public-beta-review.mjs [--out-dir <path>] [--plain|--json]\n\nRuns the local public beta Advisor with one command. It writes a path-only evidence manifest, generated public-safe support dry-run summaries, a public-safe clean-machine smoke collection plan, and a public-safe QA matrix, then prints a bounded human Advisor summary. Missing external evidence files are treated as blockers, not fatal script errors.\n\nOutputs:\n  <out-dir>/evidence-manifest.json\n  <out-dir>/support-dry-run-diagnostics.json\n  <out-dir>/support-dry-run-crash.json\n  <out-dir>/clean-machine-smoke-plan.json\n  <out-dir>/qa-matrix.json\n\nNo PR approval, merge, npm publish, signing, upload, provider launch, or network action is performed.\n`;
}

function readArg(argv, index, flag) {
  if (index >= argv.length || argv[index].startsWith('--')) throw new Error(`Missing value for ${flag}`);
  return argv[index];
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    outDir: DEFAULT_OUT_DIR,
    plain: true,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--out-dir') {
      options.outDir = readArg(argv, i + 1, arg);
      i += 1;
    } else if (arg === '--plain' || arg === '--text' || arg === '--format=text' || (arg === '--format' && argv[i + 1] === 'text')) {
      options.plain = true;
      options.json = false;
      if (arg === '--format') i += 1;
    } else if (arg === '--json' || arg === '--format=json' || (arg === '--format' && argv[i + 1] === 'json')) {
      options.json = true;
      options.plain = false;
      if (arg === '--format') i += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

async function exists(path) {
  try {
    await access(resolve(path));
    return true;
  } catch (_) {
    return false;
  }
}

async function readJsonOrNull(path) {
  try {
    return JSON.parse(await readFile(resolve(path), 'utf8'));
  } catch {
    return null;
  }
}

function isRefreshableGeneratedSupportPlaceholder(existing, spec) {
  return existing?.schema === 'enigma.support_dry_run_summary.v1'
    && existing?.evidence_item_id === 'EV-P10-SUPPORT-DRY-RUN-SUMMARY'
    && existing?.scenario_id === spec.scenario_id
    && existing?.issue_code === spec.issue_code
    && existing?.triage_result === 'blocked'
    && existing?.bundle_privacy_check_status === 'blocked'
    && existing?.support_owner_ref === spec.support_owner_ref
    && existing?.support_artifact === undefined
    && existing?.support_artifact_snapshot === undefined
    && existing?.privacy_scan?.schema !== 'enigma.support_privacy_scan.v1';
}

function isRepositoryRelativePath(value) {
  const normalized = String(value ?? '').replace(/\\/g, '/');
  return normalized.length > 0
    && !isAbsolute(normalized)
    && !/^[A-Za-z]:\//u.test(normalized)
    && normalized !== '..'
    && !normalized.startsWith('../')
    && !normalized.includes('/../')
    && !/[\0\r\n]/u.test(normalized);
}

function joinPathLabel(dir, fileName) {
  const cleanDir = String(dir || DEFAULT_OUT_DIR).replace(/\\/g, '/').replace(/\/+$/u, '');
  return `${cleanDir || '.'}/${fileName}`;
}

function uniqueList(values) {
  return [...new Set(values.filter(Boolean))];
}

function generatedSupportDryRunPaths(outDir) {
  return GENERATED_SUPPORT_DRY_RUNS.map((spec) => joinPathLabel(outDir, spec.fileName));
}

async function writeGeneratedSupportDryRunSummaries(paths) {
  const counts = { written: 0, preserved: 0, refreshed: 0 };
  for (let index = 0; index < GENERATED_SUPPORT_DRY_RUNS.length; index += 1) {
    const spec = GENERATED_SUPPORT_DRY_RUNS[index];
    const out = paths[index];
    const summary = buildSupportDryRunSummary(spec);
    await mkdir(dirname(resolve(out)), { recursive: true });
    try {
      await writeFile(resolve(out), `${JSON.stringify(summary, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
      counts.written += 1;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const existing = await readJsonOrNull(out);
      if (isRefreshableGeneratedSupportPlaceholder(existing, spec)) {
        await writeFile(resolve(out), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
        counts.refreshed += 1;
        continue;
      }
      counts.preserved += 1;
    }
  }
  return counts;
}

export async function existingEvidenceOptionsFromManifest(manifest) {
  const options = {
    supportDryRun: [],
  };
  if (manifest.clean_machine_smoke && await exists(manifest.clean_machine_smoke)) options.cleanMachineSmoke = manifest.clean_machine_smoke;
  if (manifest.registry_install && await exists(manifest.registry_install)) options.registryInstall = manifest.registry_install;
  if (manifest.desktop_release_evidence && await exists(manifest.desktop_release_evidence)) options.desktopReleaseEvidence = manifest.desktop_release_evidence;
  if (manifest.production_handoff_packet && await exists(manifest.production_handoff_packet)) options.productionHandoffPacket = manifest.production_handoff_packet;
  for (const path of Array.isArray(manifest.support_dry_run) ? manifest.support_dry_run : []) {
    if (await exists(path)) options.supportDryRun.push(path);
  }
  return options;
}

export function renderPublicBetaReviewPlain(result) {
  const lines = [
    'Enigma public beta review',
    `Decision: ${String(result.matrix.advisor_decision ?? 'hold').toUpperCase()}`,
    `Manifest: written to ${result.paths.manifest}`,
    `QA matrix: written to ${result.paths.matrix}`,
    `Evidence files used: ${result.evidence_files_used}`,
    `Generated support dry-runs: ${result.generated_evidence_files ?? 0}`,
    ...(result.refreshed_evidence_files ? [`Refreshed stale generated support placeholders: ${result.refreshed_evidence_files}`] : []),
    ...(result.preserved_evidence_files ? [`Preserved existing support evidence files: ${result.preserved_evidence_files}`] : []),
    `Generated clean-machine plan: ${result.generated_plan_files ?? 0}`,
    `Templates: ${result.template_command ?? 'npm run public-beta:evidence-templates -- --out-dir .enigma/public-beta --plain'}`,
    '',
    renderPublicBetaQaPlain(result.matrix).trim(),
    'Boundary: one-command local review only; no PR approval, merge, npm publication, signed installer, hosted service, provider deletion, model behavior, benchmark superiority, token ROI, compliance, upload, or network claims.',
  ];
  return `${lines.join('\n')}\n`;
}

export async function runPublicBetaReview(options = {}) {
  const outDir = String(options.outDir || DEFAULT_OUT_DIR);
  const normalizedOutDir = outDir.replace(/\\/g, '/').replace(/\/+$/u, '');
  const manifestPath = `${normalizedOutDir}/evidence-manifest.json`;
  const matrixPath = `${normalizedOutDir}/qa-matrix.json`;
  const supportDryRunPaths = generatedSupportDryRunPaths(normalizedOutDir);
  const repositoryRelativeOutDir = isRepositoryRelativePath(normalizedOutDir);
  const cleanMachineSmokePlanPath = joinPathLabel(normalizedOutDir, 'clean-machine-smoke-plan.json');
  const manifest = buildPublicBetaEvidenceManifest({
    out: manifestPath,
    cleanMachineSmoke: repositoryRelativeOutDir ? joinPathLabel(normalizedOutDir, 'clean-machine-smoke.json') : undefined,
    cleanMachineSmokePlan: repositoryRelativeOutDir ? cleanMachineSmokePlanPath : undefined,
    supportDryRun: repositoryRelativeOutDir ? supportDryRunPaths : undefined,
    registryInstall: repositoryRelativeOutDir ? joinPathLabel(normalizedOutDir, 'registry-install.json') : undefined,
    desktopReleaseEvidence: repositoryRelativeOutDir ? joinPathLabel(normalizedOutDir, 'desktop-release-evidence.json') : undefined,
    productionHandoffPacket: repositoryRelativeOutDir ? joinPathLabel(normalizedOutDir, 'production-handoff-packet.json') : undefined,
  });

  await mkdir(resolve(outDir), { recursive: true });
  await mkdir(dirname(resolve(manifestPath)), { recursive: true });
  const supportDryRunWrites = await writeGeneratedSupportDryRunSummaries(supportDryRunPaths);
  await writeFile(resolve(cleanMachineSmokePlanPath), `${JSON.stringify(buildCleanMachineSmokePlan(), null, 2)}\n`, 'utf8');
  await writeFile(resolve(manifestPath), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const manifestEvidenceOptions = repositoryRelativeOutDir ? await existingEvidenceOptionsFromManifest(manifest) : { supportDryRun: [] };
  const evidenceOptions = {
    ...manifestEvidenceOptions,
    supportDryRun: uniqueList([...(manifestEvidenceOptions.supportDryRun || []), ...supportDryRunPaths]),
  };
  const matrixOptions = repositoryRelativeOutDir
    ? { evidenceManifest: manifestPath }
    : evidenceOptions;
  const matrix = await buildPublicBetaQaMatrix(matrixOptions);
  const evidenceFilesUsed = [
    evidenceOptions.cleanMachineSmoke,
    evidenceOptions.registryInstall,
    evidenceOptions.desktopReleaseEvidence,
    evidenceOptions.productionHandoffPacket,
    ...(evidenceOptions.supportDryRun || []),
  ].filter(Boolean).length;
  const result = {
    schema: 'enigma.public_beta_review.v1',
    ok: true,
    public_safe: true,
    paths: {
      manifest: '<public-beta-evidence-manifest>',
      matrix: '<public-beta-qa-matrix>',
    },
    evidence_files_used: evidenceFilesUsed,
    generated_evidence_files: supportDryRunWrites.written,
    preserved_evidence_files: supportDryRunWrites.preserved,
    refreshed_evidence_files: supportDryRunWrites.refreshed,
    generated_plan_files: 1,
    generated_evidence_items: ['EV-P10-SUPPORT-DRY-RUN-SUMMARY'],
    template_command: `npm run public-beta:evidence-templates -- --out-dir ${repositoryRelativeOutDir ? normalizedOutDir : DEFAULT_OUT_DIR} --plain`,
    matrix,
    safety: {
      release_action_performed: false,
      network_performed: false,
      artifact_contents_embedded_in_manifest: false,
      generated_support_dry_run_public_safe: true,
      generated_clean_machine_plan_public_safe: true,
      local_paths_hidden_in_stdout: true,
    },
    claim_boundary: 'Local public beta review only. It does not approve PRs, merge branches, publish npm, sign installers, upload artifacts, launch hosted services, prove provider deletion, or prove model behavior.',
  };

  await writeFile(resolve(matrixPath), `${JSON.stringify(matrix, null, 2)}\n`, 'utf8');
  return result;
}

export async function runCli(argv = process.argv.slice(2), io = { stdout: process.stdout }) {
  const options = parseArgs(argv);
  if (options.help) {
    io.stdout.write(usage());
    return 0;
  }
  const result = await runPublicBetaReview(options);
  io.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : renderPublicBetaReviewPlain(result));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await runCli();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
