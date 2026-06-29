#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { verifyPublicSafeArtifact } from '../packages/core/src/index.js';
import { buildPublicBetaEvidenceManifest } from './build-public-beta-evidence-manifest.mjs';
import { REQUIRED_PUBLIC_BETA_VERSION } from './run-public-beta-qa-matrix.mjs';

export const PUBLIC_BETA_EVIDENCE_TEMPLATES_SCHEMA = 'enigma.public_beta_evidence_templates.v1';

const DEFAULT_OUT_DIR = '.enigma/public-beta';
const TEMPLATE_FILES = Object.freeze({
  cleanMachineSmoke: 'clean-machine-smoke.json',
  registryInstall: 'registry-install.json',
  desktopReleaseEvidence: 'desktop-release-evidence.json',
  productionHandoffPacket: 'production-handoff-packet.json',
  evidenceManifest: 'evidence-manifest.json',
});

function usage() {
  return `Usage: node scripts/build-public-beta-evidence-templates.mjs [--out-dir <relative-dir>] [--overwrite] [--plain|--json]\n\nWrites public-safe starter evidence files for npm run public-beta:review. Templates are blockers by design: they tell a release owner what to replace with real review, npm, signing, desktop, and clean-machine evidence without performing PR approval, merge, npm publish, signing, upload, or network actions.\n`;
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
    public_safe_release_packet: {
      packet_ref: 'TBD-public-release-packet-ref',
      reviewer_ref: 'TBD-claim-boundary-reviewer-ref',
      approval_status: 'pending',
      approval_date: 'TBD-date',
    },
    release_audit: { ok: false, evidence_ref: 'TBD-release-audit-ref' },
    operator_acceptance: { ok: false, evidence_ref: 'TBD-operator-acceptance-ref' },
    local_static_artifact_ready: false,
    claim_boundary: templateBoundary(),
  };
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
      command: `npm install enigma-memory@${REQUIRED_PUBLIC_BETA_VERSION}`,
      result: 'pending',
      evidence_ref: 'TBD-public-install-result-ref',
    },
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
        public_checksum: 'TBD-windows-public-sha256',
        signature_verification_result: 'pending',
        download_ref: 'TBD-windows-download-ref',
      },
      {
        platform: 'macos',
        present: false,
        artifact_name: 'TBD-macos-installer-filename',
        public_checksum: 'TBD-macos-public-sha256',
        notarization_result: 'pending',
        stapling_result: 'pending',
        download_ref: 'TBD-macos-download-ref',
      },
    ],
    manifest: {
      signature: { status: 'pending', evidence_ref: 'TBD-update-signature-ref' },
      rollback_rehearsal: { status: 'pending', evidence_ref: 'TBD-rollback-rehearsal-ref' },
    },
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

function assertPublicSafe(name, artifact) {
  const safety = verifyPublicSafeArtifact(artifact);
  if (!safety.ok) throw new Error(`${name} template is not public-safe: ${safety.errors.join('; ')}`);
}

function buildArtifacts(outDirLabel, generatedAt) {
  const cleanMachineSmoke = `${outDirLabel}/${TEMPLATE_FILES.cleanMachineSmoke}`;
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
    registryInstall,
    desktopReleaseEvidence,
    productionHandoffPacket,
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
      `npm run public-beta:advisor -- --evidence-manifest ${evidenceManifest}`,
      'Replace template files with real public-safe evidence as each action completes.',
    ],
    safety: {
      template_only: true,
      release_action_performed: false,
      network_performed: false,
      local_paths_included: false,
      raw_private_content_included: false,
    },
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
  for (const command of Array.isArray(report.next_commands) ? report.next_commands : []) {
    lines.push(`Next: ${command}`);
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
