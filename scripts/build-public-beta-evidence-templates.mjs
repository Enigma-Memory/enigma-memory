#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { verifyPublicSafeArtifact } from '../packages/core/src/index.js';
import { buildPublicBetaEvidenceManifest } from './build-public-beta-evidence-manifest.mjs';
import { buildCleanMachineSmokePlan } from './run-clean-machine-smoke.mjs';
import { SUPPORT_DRY_RUN_COLLECTION_GUIDANCE } from './build-support-dry-run-summary.mjs';
import { REQUIRED_PUBLIC_BETA_VERSION } from './run-public-beta-qa-matrix.mjs';

export const PUBLIC_BETA_EVIDENCE_TEMPLATES_SCHEMA = 'enigma.public_beta_evidence_templates.v1';

const DEFAULT_OUT_DIR = '.enigma/public-beta';
const TEMPLATE_FILES = Object.freeze({
  cleanMachineSmoke: 'clean-machine-smoke.json',
  cleanMachineSmokePlan: 'clean-machine-smoke-plan.json',
  supportDryRunDiagnostics: 'support-dry-run-diagnostics.json',
  supportDryRunCrash: 'support-dry-run-crash.json',
  registryInstall: 'registry-install.json',
  desktopReleaseEvidence: 'desktop-release-evidence.json',
  productionHandoffPacket: 'production-handoff-packet.json',
  evidenceManifest: 'evidence-manifest.json',
});

function usage() {
  return `Usage: node scripts/build-public-beta-evidence-templates.mjs [--out-dir <relative-dir>] [--overwrite] [--plain|--json]\n\nWrites public-safe starter evidence files for npm run public-beta:review. Templates are blockers by design: they tell a release owner what to replace with real review, npm, signing, desktop, clean-machine, and support dry-run evidence without performing PR approval, merge, npm publish, signing, upload, or network actions.\n`;
}

function readArg(argv, index, flag) {
  if (index >= argv.length || argv[index].startsWith('--')) throw new Error(`Missing value for ${flag}`);
  return argv[index];
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = { outDir: DEFAULT_OUT_DIR, overwrite: false, plain: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--out-dir') {
      options.outDir = readArg(argv, i + 1, arg);
      i += 1;
    } else if (arg === '--overwrite') options.overwrite = true;
    else if (arg === '--plain' || arg === '--text' || arg === '--format=text') options.plain = true;
    else if (arg === '--json' || arg === '--format=json') options.plain = false;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function publicRelativePath(value, label) {
  const raw = String(value ?? '').trim();
  if (!raw) throw new Error(`${label} is required.`);
  if (isAbsolute(raw) || /^[A-Za-z]:[\\/]/u.test(raw)) throw new Error(`${label} must be a relative repository-local path.`);
  const normalized = normalize(raw).replace(/\\/g, '/');
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) throw new Error(`${label} must not escape the repository.`);
  if (/\0|\r|\n/u.test(normalized)) throw new Error(`${label} contains a control character.`);
  if (/(?:bearer\s+|token\s*[=:]|password\s*[=:]|api[_-]?key\s*[=:]|npm_|ghp_|sk-)/iu.test(normalized)) throw new Error(`${label} must not contain credential-shaped text.`);
  return normalized;
}

function templateBoundary() {
  return 'Template only. Replace placeholders with public-safe evidence after the real action is complete. This file performs no PR approval, merge, npm publication, signing, upload, network request, provider action, benchmark claim, token ROI claim, compliance claim, or hosted-service claim.';
}

function buildProductionHandoffTemplate(generatedAt) {
  return {
    schema: 'enigma.production_handoff_packet.v1',
    evidence_status: 'template_only',
    generated_at: generatedAt,
    release_version: REQUIRED_PUBLIC_BETA_VERSION,
    go_live_ready: false,
    blockers: [
      'release-pr-review-missing',
      'release-pr-merge-missing',
      'public-safe-release-packet-approval-missing',
    ],
    release_pr: {
      pr_ref: 'TBD-public-pr-ref',
      reviewer_approval_ref: 'TBD-public-review-ref',
      merge_ref: 'TBD-public-merge-ref',
      approval_status: 'pending',
    },
    public_safe_release_packet_approval: {
      status: 'pending',
      release_packet_ref: 'TBD-public-release-packet-ref',
      claim_boundary_reviewer_ref: 'TBD-claim-boundary-reviewer-ref',
      approval_ref: 'TBD-public-approval-ref',
      approved_at: 'TBD-date',
    },
    release_audit: { ok: false, evidence_ref: 'TBD-release-audit-ref' },
    operator_acceptance: { ok: false, evidence_ref: 'TBD-operator-acceptance-ref' },
    local_static_artifact_ready: false,
    next_actions: [
      {
        id: 'record_release_pr_review',
        collect: 'Public PR ref, reviewer approval ref, approval status approved.',
        required_fields: ['release_pr.pr_ref', 'release_pr.reviewer_approval_ref', 'release_pr.approval_status'],
      },
      {
        id: 'record_release_pr_merge',
        collect: 'Public merge ref after branch protection and reviewer approval complete.',
        required_fields: ['release_pr.merge_ref'],
      },
      {
        id: 'record_public_safe_release_packet_approval',
        collect: 'Release packet ref, claim-boundary reviewer ref, approval ref, approval status approved, and approval date.',
        required_fields: [
          'public_safe_release_packet_approval.status',
          'public_safe_release_packet_approval.release_packet_ref',
          'public_safe_release_packet_approval.claim_boundary_reviewer_ref',
          'public_safe_release_packet_approval.approval_ref',
          'public_safe_release_packet_approval.approved_at',
        ],
      },
    ],
    claim_boundary: templateBoundary(),
  };
}

function registryInstallEvidenceCommand() {
  return `npm install --prefix <temp-prefix> enigma-memory@${REQUIRED_PUBLIC_BETA_VERSION}`;
}

function buildRegistryInstallTemplate(generatedAt) {
  return {
    schema: 'enigma.registry_install_verifier.v1',
    evidence_status: 'template_only',
    generated_at: generatedAt,
    ok: false,
    mode: 'pending_execute',
    execute: false,
    skip_network: true,
    package: {
      name: 'enigma-memory',
      version: REQUIRED_PUBLIC_BETA_VERSION,
      registry_ref: 'TBD-public-registry-package-ref',
    },
    install: {
      command: registryInstallEvidenceCommand(),
      result: 'pending',
      evidence_ref: 'TBD-public-install-result-ref',
    },
    next_actions: [
      {
        id: 'record_public_npm_publish',
        collect: 'Public registry package ref for the exact required version after trusted publish completes.',
        required_fields: ['package.registry_ref'],
      },
      {
        id: 'run_temp_prefix_registry_install',
        collect: 'Run the temp-prefix install command only after public npm publish evidence exists.',
        command: registryInstallEvidenceCommand(),
        required_fields: ['install.result', 'install.evidence_ref'],
      },
    ],
    claim_boundary: templateBoundary(),
  };
}

function buildDesktopReleaseTemplate(generatedAt) {
  return {
    schema: 'enigma.desktop_release_evidence.v1',
    evidence_status: 'template_only',
    generated_at: generatedAt,
    release_version: REQUIRED_PUBLIC_BETA_VERSION,
    blockers: [
      'signing-identity-readiness-missing',
      'windows-signed-desktop-artifact-missing',
      'macos-notarized-desktop-artifact-missing',
      'update-rollback-rehearsal-missing',
    ],
    signing_identities: {
      apple_status: 'pending',
      microsoft_status: 'pending',
      custody_approval_ref: 'TBD-signing-custody-approval-ref',
    },
    installers: [
      {
        platform: 'windows',
        present: false,
        artifact_name: 'TBD-windows-installer-filename',
        path: 'TBD-windows-installer-filename',
        sha256: 'TBD-windows-public-sha256',
        signature: {
          status: 'file_present_unverified',
          evidence_ref: 'TBD-windows-signature-verification-ref',
          evidence_ref_required: true,
        },
        download_ref: 'TBD-windows-download-ref',
      },
      {
        platform: 'macos',
        present: false,
        artifact_name: 'TBD-macos-installer-filename',
        path: 'TBD-macos-installer-filename',
        sha256: 'TBD-macos-public-sha256',
        signature: {
          status: 'file_present_unverified',
          evidence_ref: 'TBD-macos-signature-verification-ref',
          evidence_ref_required: true,
        },
        notarization: {
          status: 'not_observed',
          evidence_ref: 'TBD-macos-notarization-ref',
          evidence_ref_required: true,
        },
        stapling: {
          status: 'not_observed',
          evidence_ref: 'TBD-macos-stapling-ref',
          evidence_ref_required: true,
        },
        download_ref: 'TBD-macos-download-ref',
      },
    ],
    manifest: {
      signature: { status: 'pending', evidence_ref: 'TBD-update-signature-ref' },
    },
    update_rollback: {
      status: 'not_run',
      evidence_ref: 'TBD-rollback-rehearsal-ref',
      evidence_ref_required: true,
    },
    next_actions: [
      {
        id: 'record_signing_identity_custody',
        collect: 'Apple and Microsoft signing identity readiness plus custody approval public ref.',
        required_fields: ['signing_identities.apple_status', 'signing_identities.microsoft_status', 'signing_identities.custody_approval_ref'],
      },
      {
        id: 'record_windows_signed_artifact',
        collect: 'Windows installer filename, public SHA-256, verified signature status, signature evidence ref, and download ref.',
        required_fields: ['installers[windows].present', 'installers[windows].artifact_name', 'installers[windows].sha256', 'installers[windows].signature.status', 'installers[windows].signature.evidence_ref', 'installers[windows].download_ref'],
      },
      {
        id: 'record_macos_signed_notarized_artifact',
        collect: 'macOS installer filename, public SHA-256, verified signature, accepted notarization, stapling evidence, and download ref.',
        required_fields: ['installers[macos].present', 'installers[macos].artifact_name', 'installers[macos].sha256', 'installers[macos].signature.status', 'installers[macos].notarization.status', 'installers[macos].stapling.status', 'installers[macos].download_ref'],
      },
      {
        id: 'record_update_manifest_signature',
        collect: 'Updater manifest signature verification evidence.',
        required_fields: ['manifest.signature.status', 'manifest.signature.evidence_ref'],
      },
      {
        id: 'record_update_rollback_rehearsal',
        collect: 'Signed update rollback rehearsal status and public evidence ref.',
        required_fields: ['update_rollback.status', 'update_rollback.evidence_ref'],
      },
    ],
    claim_boundary: templateBoundary(),
  };
}

function buildCleanMachineSmokeTemplate(generatedAt) {
  return {
    schema: 'enigma.clean_machine_smoke.v1',
    evidence_status: 'template_only',
    generated_at: generatedAt,
    app_version: REQUIRED_PUBLIC_BETA_VERSION,
    summary: {
      healthy: false,
      status: 'pending_real_clean_machine_run',
      pending_checks: [
        'install',
        'first_run',
        'connector',
        'proof_activity',
        'offline_mode',
        'diagnostics',
        'uninstall',
      ],
    },
    safety: {
      template_only: true,
      system_inspection_performed: false,
      network_performed: false,
      release_action_performed: false,
      local_paths_included: false,
      memory_text_included: false,
    },
    claim_boundary: templateBoundary(),
  };
}

function cleanMachineSmokePlanCommand(outPath) {
  return `npm run production:clean-machine-smoke -- --dry-run --plain --out ${outPath}`;
}

function cleanMachineSmokeEvidenceCommand(outPath) {
  return `npm run production:clean-machine-smoke -- --plain --out ${outPath}`;
}

function supportDryRunReplacementCommand({ preset, outPath }) {
  return `npm run production:support-dry-run -- --preset ${preset} --triage-result <observed-result> --bundle-privacy-check-status <observed-status> --out ${outPath}`;
}

function buildSupportDryRunTemplate({ generatedAt, scenarioId, issueCode, preset, outPath }) {
  return {
    schema: 'enigma.support_dry_run_summary.v1',
    evidence_status: 'template_only',
    evidence_item_id: 'EV-P10-SUPPORT-DRY-RUN-SUMMARY',
    generated_at: generatedAt,
    scenario_id: scenarioId,
    issue_code: issueCode,
    triage_result: 'blocked',
    bundle_privacy_check_status: 'blocked',
    support_owner_ref: 'ref:role:beta-support',
    replacement_command: supportDryRunReplacementCommand({ preset, outPath }),
    collection_guidance: SUPPORT_DRY_RUN_COLLECTION_GUIDANCE,
    support_artifact_note: 'Optional: add --support-artifact <redacted-support-artifact.json> only after the artifact passes public-safe review; the summary records its hash and allowlisted status fields only.',
    privacy_review: {
      status: 'blocked',
      reviewer_ref: 'ref:role:beta-support',
      issue_codes: ['EVIDENCE-NEEDS-SUPPORT-RUN'],
    },
    privacy_scan: {
      schema: 'enigma.support_privacy_scan.v1',
      status: 'hold',
      checked_categories: [
        'memory_bodies',
        'user_inputs',
        'dialogue_records',
        'provider_outputs',
        'storage_locations',
        'auth_material',
        'owner_refs',
        'settings_snapshots',
        'raw_logs',
      ],
      detected_private_field_count: 0,
      redacted_private_field_count: 9,
      support_artifact_attached: false,
      local_paths_hidden: true,
      public_safe_summary_only: true,
    },
    claim_review: {
      status: 'blocked',
      reviewer_ref: 'ref:role:beta-support',
      issue_codes: ['EVIDENCE-NEEDS-SUPPORT-RUN'],
    },
    support_artifact_snapshot: null,
    claim_boundary: templateBoundary(),
  };
}

function assertPublicSafe(name, artifact) {
  const safety = verifyPublicSafeArtifact(artifact);
  if (!safety.ok) throw new Error(`${name} template is not public-safe: ${safety.errors.join('; ')}`);
}

function buildArtifacts(outDirLabel, generatedAt) {
  const cleanMachineSmoke = `${outDirLabel}/${TEMPLATE_FILES.cleanMachineSmoke}`;
  const cleanMachineSmokePlan = `${outDirLabel}/${TEMPLATE_FILES.cleanMachineSmokePlan}`;
  const supportDryRunDiagnostics = `${outDirLabel}/${TEMPLATE_FILES.supportDryRunDiagnostics}`;
  const supportDryRunCrash = `${outDirLabel}/${TEMPLATE_FILES.supportDryRunCrash}`;
  const registryInstall = `${outDirLabel}/${TEMPLATE_FILES.registryInstall}`;
  const desktopReleaseEvidence = `${outDirLabel}/${TEMPLATE_FILES.desktopReleaseEvidence}`;
  const productionHandoffPacket = `${outDirLabel}/${TEMPLATE_FILES.productionHandoffPacket}`;
  const evidenceManifest = `${outDirLabel}/${TEMPLATE_FILES.evidenceManifest}`;
  const artifacts = [
    {
      evidence_item_id: 'EV-P10-CLEAN-MACHINE-SMOKE',
      path: cleanMachineSmoke,
      artifact: buildCleanMachineSmokeTemplate(generatedAt),
    },
    {
      evidence_item_id: 'EV-P10-CLEAN-MACHINE-SMOKE-PLAN',
      path: cleanMachineSmokePlan,
      artifact: buildCleanMachineSmokePlan(new Date(generatedAt)),
    },
    {
      evidence_item_id: 'EV-P10-SUPPORT-DRY-RUN-SUMMARY',
      path: supportDryRunDiagnostics,
      artifact: buildSupportDryRunTemplate({
        generatedAt,
        scenarioId: 'BETA-DIAG-001',
        issueCode: 'DIAG-BUNDLE-PREVIEWED',
        preset: 'diagnostics',
        outPath: supportDryRunDiagnostics,
      }),
    },
    {
      evidence_item_id: 'EV-P10-SUPPORT-DRY-RUN-SUMMARY',
      path: supportDryRunCrash,
      artifact: buildSupportDryRunTemplate({
        generatedAt,
        scenarioId: 'BETA-CRASH-001',
        issueCode: 'CRASH-REPORTING-MANUAL-EVIDENCE',
        preset: 'crash',
        outPath: supportDryRunCrash,
      }),
    },
    {
      evidence_item_id: 'EV-P10-REGISTRY-INSTALL',
      path: registryInstall,
      artifact: buildRegistryInstallTemplate(generatedAt),
    },
    {
      evidence_item_id: 'EV-P10-DESKTOP-RELEASE-EVIDENCE',
      path: desktopReleaseEvidence,
      artifact: buildDesktopReleaseTemplate(generatedAt),
    },
    {
      evidence_item_id: 'EV-P10-PRODUCTION-HANDOFF-PACKET',
      path: productionHandoffPacket,
      artifact: buildProductionHandoffTemplate(generatedAt),
    },
  ];
  const manifest = buildPublicBetaEvidenceManifest({
    cleanMachineSmoke,
    cleanMachineSmokePlan,
    registryInstall,
    desktopReleaseEvidence,
    productionHandoffPacket,
    supportDryRun: [supportDryRunDiagnostics, supportDryRunCrash],
  }, generatedAt);
  artifacts.push({
    evidence_item_id: 'EV-P10-PUBLIC-BETA-EVIDENCE-MANIFEST',
    path: evidenceManifest,
    artifact: manifest,
  });
  for (const { evidence_item_id: evidenceItemId, artifact } of artifacts) assertPublicSafe(evidenceItemId, artifact);
  return { artifacts, evidenceManifest };
}

async function writeJsonFile(path, artifact, overwrite) {
  await mkdir(dirname(path), { recursive: true });
  const content = `${JSON.stringify(artifact, null, 2)}\n`;
  try {
    await writeFile(path, content, { encoding: 'utf8', flag: overwrite ? 'w' : 'wx' });
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error(`${path} already exists. Re-run with --overwrite only if you intentionally replace this evidence template.`);
    throw error;
  }
}

export async function buildPublicBetaEvidenceTemplates(options = {}, now = new Date()) {
  const outDir = publicRelativePath(options.outDir ?? DEFAULT_OUT_DIR, 'out_dir').replace(/\/$/u, '');
  const generatedAt = now.toISOString();
  const { artifacts, evidenceManifest } = buildArtifacts(outDir, generatedAt);
  for (const entry of artifacts) {
    await writeJsonFile(resolve(entry.path), entry.artifact, Boolean(options.overwrite));
  }
  const supportDryRunDiagnostics = `${outDir}/${TEMPLATE_FILES.supportDryRunDiagnostics}`;
  const cleanMachineSmoke = `${outDir}/${TEMPLATE_FILES.cleanMachineSmoke}`;
  const cleanMachineSmokePlan = `${outDir}/${TEMPLATE_FILES.cleanMachineSmokePlan}`;
  const supportDryRunCrash = `${outDir}/${TEMPLATE_FILES.supportDryRunCrash}`;
  const report = {
    schema: PUBLIC_BETA_EVIDENCE_TEMPLATES_SCHEMA,
    generated_at: generatedAt,
    out_dir: outDir,
    evidence_manifest: evidenceManifest,
    files: artifacts.map((entry) => ({
      evidence_item_id: entry.evidence_item_id,
      path: entry.path,
      schema: entry.artifact.schema,
      evidence_status: entry.artifact.evidence_status ?? 'path_manifest',
    })),
    next_commands: [
      cleanMachineSmokePlanCommand(cleanMachineSmokePlan),
      cleanMachineSmokeEvidenceCommand(cleanMachineSmoke),
      `npm run public-beta:advisor -- --evidence-manifest ${evidenceManifest}`,
      supportDryRunReplacementCommand({ preset: 'diagnostics', outPath: supportDryRunDiagnostics }),
      supportDryRunReplacementCommand({ preset: 'crash', outPath: supportDryRunCrash }),
      'Replace template files with real public-safe evidence as each action completes.',
    ],
    safety: {
      template_only: true,
      release_action_performed: false,
      network_performed: false,
      local_paths_included: false,
      raw_private_content_included: false,
    },
    registry_install_guidance: {
      when: 'after_public_npm_publish_evidence_exists',
      command: registryInstallEvidenceCommand(),
      evidence_template: `${outDir}/${TEMPLATE_FILES.registryInstall}`,
    },
    desktop_release_guidance: {
      evidence_template: `${outDir}/${TEMPLATE_FILES.desktopReleaseEvidence}`,
      required_statuses: [
        'windows.signature.status=verified with evidence_ref',
        'macos.signature.status=verified with evidence_ref',
        'macos.notarization.status=accepted with evidence_ref',
        'macos.stapling.status=stapled with evidence_ref',
        'manifest.signature.status=verified',
        'update_rollback.status=pass with evidence_ref',
      ],
    },
    production_handoff_guidance: {
      evidence_template: `${outDir}/${TEMPLATE_FILES.productionHandoffPacket}`,
      required_statuses: [
        'release_pr.approval_status=approved with reviewer_approval_ref',
        'release_pr.merge_ref is a public ref',
        'public_safe_release_packet_approval.status=approved',
        'public_safe_release_packet_approval.release_packet_ref is a public ref',
        'public_safe_release_packet_approval.claim_boundary_reviewer_ref is a public ref',
        'public_safe_release_packet_approval.approval_ref is a public ref',
        'public_safe_release_packet_approval.approved_at=YYYY-MM-DD or ISO timestamp',
      ],
    },
    support_dry_run_collection_guidance: SUPPORT_DRY_RUN_COLLECTION_GUIDANCE,
    claim_boundary: templateBoundary(),
  };
  assertPublicSafe('public beta evidence template report', report);
  return report;
}

export function renderPublicBetaEvidenceTemplatesPlain(report) {
  const lines = [
    'Enigma public beta evidence templates',
    `Evidence manifest: ${report.evidence_manifest}`,
    `Files: ${Array.isArray(report.files) ? report.files.length : 0}`,
  ];
  for (const file of Array.isArray(report.files) ? report.files : []) {
    lines.push(`Template: ${file.evidence_item_id} -> ${file.path}`);
  }
  if (report.support_dry_run_collection_guidance) {
    lines.push(`Support dry-run triage values: ${report.support_dry_run_collection_guidance.triage_result_values.join(', ')}`);
    lines.push(`Support dry-run privacy statuses: ${report.support_dry_run_collection_guidance.bundle_privacy_check_status_values.join(', ')}`);
    lines.push(`Support dry-run collection steps: ${report.support_dry_run_collection_guidance.collection_steps.join(', ')}`);
  }
  for (const command of Array.isArray(report.next_commands) ? report.next_commands : []) {
    lines.push(`Next: ${command}`);
  }
  if (report.registry_install_guidance) {
    lines.push(`Registry install after npm publish: ${report.registry_install_guidance.command}`);
    lines.push(`Registry install evidence template: ${report.registry_install_guidance.evidence_template}`);
  }
  if (report.desktop_release_guidance) {
    lines.push(`Desktop release evidence template: ${report.desktop_release_guidance.evidence_template}`);
    lines.push(`Desktop release required statuses: ${report.desktop_release_guidance.required_statuses.join('; ')}`);
  }
  if (report.production_handoff_guidance) {
    lines.push(`Production handoff evidence template: ${report.production_handoff_guidance.evidence_template}`);
    lines.push(`Production handoff required statuses: ${report.production_handoff_guidance.required_statuses.join('; ')}`);
  }
  lines.push('Boundary: templates only; no PR approval, merge, npm publish, signing, upload, network action, provider action, hosted service, benchmark, token ROI, or compliance claim.');
  return `${lines.join('\n')}\n`;
}

async function main() {
  try {
    const options = parseArgs();
    if (options.help) {
      process.stdout.write(usage());
      return 0;
    }
    const report = await buildPublicBetaEvidenceTemplates(options);
    process.stdout.write(options.plain ? renderPublicBetaEvidenceTemplatesPlain(report) : `${JSON.stringify(report, null, 2)}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${error?.message ?? error}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
