#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createClaudeDesktopMcpbConnectionPlan,
  createClaudeDesktopMcpbHealth,
  createClaudeDesktopMcpbManifest,
} from '../packages/connectors/src/index.js';
import {
  summarizePublicLaunchEvidence,
  verifyPublicSafeArtifact,
} from '../packages/core/src/index.js';

export const PUBLIC_BETA_QA_MATRIX_SCHEMA = 'enigma.public_beta_qa_matrix.v1';
export const REQUIRED_PUBLIC_BETA_VERSION = '0.1.19';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(SCRIPT_PATH), '..');
const STATUS_VALUES = new Set(['pass', 'fail', 'blocked', 'missing', 'pending']);

const REFS = Object.freeze({
  packageVersion: 'ref:repo:package.json#version',
  packageFiles: 'ref:repo:package.json#files',
  tauriBundle: 'ref:repo:apps.desktop-tauri.tauri.conf.json#bundle',
  tauriUpdater: 'ref:repo:apps.desktop-tauri.tauri.conf.json#updater',
  desktopReleaseWorkflow: 'ref:repo:github.workflows.desktop-release.yml',
  desktopBuildWorkflow: 'ref:repo:github.workflows.desktop-build.yml',
  npmPublishWorkflow: 'ref:repo:github.workflows.npm-publish.yml',
  wizardUi: 'ref:repo:apps.desktop-tauri.ui.wizard.js',
  helpUi: 'ref:repo:apps.desktop-tauri.ui.help.js',
  desktopIndex: 'ref:repo:apps.desktop-tauri.ui.index.html',
  serviceCommands: 'ref:repo:apps.desktop-tauri.src.commands.service.rs',
  diagnosticsCommands: 'ref:repo:apps.desktop-tauri.src.commands.diagnostics.rs',
  crashCommands: 'ref:repo:apps.desktop-tauri.src.commands.crash.rs',
  updateCommands: 'ref:repo:apps.desktop-tauri.src.commands.update.rs',
  libCommands: 'ref:repo:apps.desktop-tauri.src.lib.rs#invoke-handler',
  mcpbHelpers: 'ref:repo:packages.connectors.src.index.js#mcpb-helpers',
  coreLedgerHelpers: 'ref:repo:packages.core.src.index.js#public-launch-ledger',
  roadmap: 'ref:repo:docs.public-launch.workflowz-execution-roadmap.md#p10',
  qaScenarios: 'ref:repo:docs.public-launch.qa-smoke-scenarios.md#beta',
  qaSupport: 'ref:repo:docs.public-launch.qa-support-observability.md#automated-matrix',
  releaseChecklist: 'ref:repo:docs.public-launch.release-owner-checklist.md#hold-conditions',
  signingPlan: 'ref:repo:docs.public-launch.trust-signing-release.md#public-beta-blockers',
  signingSetup: 'ref:repo:docs.public-launch.code-signing-setup.md#external-blockers',
  productionStatus: 'ref:repo:docs.public-launch.production-readiness-status.md#blockers',
  releaseEvidenceScript: 'ref:repo:scripts.release-evidence-desktop.mjs',
  updateSignerScript: 'ref:repo:scripts.sign-update-manifest.mjs',
  supportDryRunScript: 'ref:repo:scripts.build-support-dry-run-summary.mjs',
});

const BLOCKERS = Object.freeze({
  cleanMachine: {
    blocker_id: 'BLOCKER-CLEAN-MACHINE-QA',
    status: 'blocked',
    evidence_refs: [REFS.qaScenarios, REFS.qaSupport],
  },
  supportDryRun: {
    blocker_id: 'BLOCKER-SUPPORT-DRY-RUN',
    status: 'blocked',
    evidence_refs: [REFS.qaSupport, REFS.releaseChecklist, REFS.supportDryRunScript],
    missing_evidence_items: [
      {
        evidence_item_id: 'EV-P10-SUPPORT-DRY-RUN-SUMMARY',
        evidence_kind: 'public-safe support dry-run summary',
        required_fields: [
          'scenario_id',
          'issue_code',
          'triage_result',
          'bundle_privacy_check_status',
          'support_owner_ref',
        ],
        notes: 'Record support triage outcomes only; omit raw logs, screenshots, transcripts, credentials, account identifiers, owner names, and local absolute paths.',
      },
    ],
  },
  windowsSignedArtifact: {
    blocker_id: 'BLOCKER-WINDOWS-SIGNED-ARTIFACT',
    status: 'blocked',
    evidence_refs: [REFS.tauriBundle, REFS.desktopReleaseWorkflow, REFS.signingPlan, REFS.productionStatus],
  },
  macosNotarizedArtifact: {
    blocker_id: 'BLOCKER-MACOS-NOTARIZED-ARTIFACT',
    status: 'blocked',
    evidence_refs: [REFS.tauriBundle, REFS.desktopReleaseWorkflow, REFS.signingPlan, REFS.productionStatus],
  },
  signingIdentities: {
    blocker_id: 'BLOCKER-APPLE-MICROSOFT-SIGNING-IDENTITIES',
    status: 'blocked',
    evidence_refs: [REFS.signingSetup, REFS.releaseChecklist, REFS.desktopReleaseWorkflow],
  },
  updateRollback: {
    blocker_id: 'BLOCKER-UPDATE-ROLLBACK-REHEARSAL',
    status: 'blocked',
    evidence_refs: [REFS.tauriUpdater, REFS.updateCommands, REFS.updateSignerScript, REFS.signingPlan],
  },
  npmPublish: {
    blocker_id: 'BLOCKER-NPM-0.1.19-PUBLISH',
    status: 'blocked',
    evidence_refs: [REFS.packageVersion, REFS.npmPublishWorkflow, REFS.releaseChecklist],
  },
  releaseApproval: {
    blocker_id: 'BLOCKER-PR-APPROVAL-MERGE-REVIEWER-APPROVAL',
    status: 'blocked',
    evidence_refs: [REFS.roadmap, REFS.releaseChecklist, REFS.qaSupport],
  },
  publicSafePacket: {
    blocker_id: 'BLOCKER-PUBLIC-SAFE-RELEASE-PACKET',
    status: 'blocked',
    evidence_refs: [REFS.releaseEvidenceScript, REFS.releaseChecklist, REFS.signingPlan],
  },
  configRecovery: {
    blocker_id: 'BLOCKER-CONFIG-RECOVERY-EVIDENCE',
    status: 'missing',
    evidence_refs: [REFS.serviceCommands, REFS.qaSupport],
  },
});

const NEXT_ACTION_ORDER = Object.freeze([
  {
    action_id: 'approve_merge_release_pr',
    blocker_id: 'BLOCKER-PR-APPROVAL-MERGE-REVIEWER-APPROVAL',
    summary: 'Get release PR approval, reviewer approval, and merge evidence before publishing or announcing beta.',
    owner_ref: 'ref:role:release-owner',
    collect_next: {
      evidence_item_id: 'EV-P10-PRODUCTION-HANDOFF-PACKET',
      manifest_field: 'production_handoff_packet',
      target_file: '.enigma/public-beta/production-handoff-packet.json',
      collect: 'release PR ref or URL, reviewer approval ref, merge ref, public-safe release packet approval ref, and approval date',
    },
  },
  {
    action_id: 'approve_public_safe_release_packet',
    blocker_id: 'BLOCKER-PUBLIC-SAFE-RELEASE-PACKET',
    summary: 'Approve the public-safe release packet after claim-boundary review.',
    owner_ref: 'ref:role:release-owner',
    collect_next: {
      evidence_item_id: 'EV-P10-PUBLIC-SAFE-RELEASE-PACKET-APPROVAL',
      manifest_field: 'production_handoff_packet',
      target_file: '.enigma/public-beta/production-handoff-packet.json',
      collect: 'release-packet ref, claim-boundary reviewer ref, approval ref, approval status, and date',
    },
  },
  {
    action_id: 'publish_npm_0_1_19',
    blocker_id: 'BLOCKER-NPM-0.1.19-PUBLISH',
    summary: 'Publish enigma-memory 0.1.19 through the trusted npm workflow after the release PR is merged.',
    owner_ref: 'ref:role:release-owner',
    collect_next: {
      evidence_item_id: 'EV-P10-REGISTRY-INSTALL',
      manifest_field: 'registry_install',
      target_file: '.enigma/public-beta/registry-install.json',
      collect: 'npm package version, registry package ref, install command used, and public-safe install result',
    },
  },
  {
    action_id: 'complete_signing_identities',
    blocker_id: 'BLOCKER-APPLE-MICROSOFT-SIGNING-IDENTITIES',
    summary: 'Finish Apple/Microsoft signing identity setup and signing secret custody evidence.',
    owner_ref: 'ref:role:release-engineer',
    collect_next: {
      evidence_item_id: 'EV-P10-SIGNING-IDENTITY-READINESS',
      manifest_field: 'desktop_release_evidence',
      target_file: '.enigma/public-beta/desktop-release-evidence.json',
      collect: 'Apple and Microsoft signing identity readiness refs plus signing custody approval ref',
    },
  },
  {
    action_id: 'produce_signed_desktop_artifacts',
    blocker_id: 'BLOCKER-WINDOWS-SIGNED-ARTIFACT',
    summary: 'Produce signed Windows desktop artifact evidence.',
    owner_ref: 'ref:role:release-engineer',
    collect_next: {
      evidence_item_id: 'EV-P10-WINDOWS-SIGNED-DESKTOP-ARTIFACT',
      manifest_field: 'desktop_release_evidence',
      target_file: '.enigma/public-beta/desktop-release-evidence.json',
      collect: 'Windows artifact filename, version, public checksum, signature.status verified, signature evidence_ref, and download ref',
    },
  },
  {
    action_id: 'produce_notarized_macos_artifacts',
    blocker_id: 'BLOCKER-MACOS-NOTARIZED-ARTIFACT',
    summary: 'Produce signed, notarized, and stapled macOS artifact evidence.',
    owner_ref: 'ref:role:release-engineer',
    collect_next: {
      evidence_item_id: 'EV-P10-MACOS-NOTARIZED-DESKTOP-ARTIFACT',
      manifest_field: 'desktop_release_evidence',
      target_file: '.enigma/public-beta/desktop-release-evidence.json',
      collect: 'macOS artifact filename, version, public checksum, signature.status verified, signature evidence_ref, notarization accepted ref, stapling ref, and download ref',
    },
  },
  {
    action_id: 'rehearse_update_rollback',
    blocker_id: 'BLOCKER-UPDATE-ROLLBACK-REHEARSAL',
    summary: 'Run signed update verification and rollback rehearsal evidence.',
    owner_ref: 'ref:role:release-engineer',
    collect_next: {
      evidence_item_id: 'EV-P10-UPDATE-ROLLBACK-REHEARSAL',
      manifest_field: 'desktop_release_evidence',
      target_file: '.enigma/public-beta/desktop-release-evidence.json',
      collect: 'signed update verification result, update_rollback.status pass, rollback evidence_ref, updater manifest ref, and operator approval ref',
    },
  },
  {
    action_id: 'run_clean_machine_qa',
    blocker_id: 'BLOCKER-CLEAN-MACHINE-QA',
    summary: 'Run clean-machine Windows/macOS install, first-run, connector, proof, offline, update, diagnostics, and uninstall QA.',
    owner_ref: 'ref:role:qa-owner',
    collect_next: {
      evidence_item_id: 'EV-P10-CLEAN-MACHINE-SMOKE',
      manifest_field: 'clean_machine_smoke',
      target_file: '.enigma/public-beta/clean-machine-smoke.json',
      collect: 'clean-machine smoke JSON from the generated plan after install, first-run, connector, proof, offline, diagnostics, and uninstall checks',
    },
  },
  {
    action_id: 'record_support_dry_run',
    blocker_id: 'BLOCKER-SUPPORT-DRY-RUN',
    summary: 'Record the public-safe support dry-run summary evidence item.',
    owner_ref: 'ref:role:beta-support',
    collect_next: {
      evidence_item_id: 'EV-P10-SUPPORT-DRY-RUN-SUMMARY',
      manifest_field: 'support_dry_run',
      target_file: '.enigma/public-beta/support-dry-run-<scenario>.json',
      collect: 'scenario id, issue code, triage result, privacy-check status, and support owner ref',
    },
  },
]);

function publicRelativeEvidenceTarget(value) {
  const raw = String(value ?? '').trim();
  if (!raw || isAbsolute(raw) || /^[A-Za-z]:[\\/]/u.test(raw)) return null;
  const normalized = normalize(raw).replace(/\\/g, '/');
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) return null;
  if (/\0|\r|\n/u.test(normalized)) return null;
  return normalized;
}

function collectTargetForField(collectNext, evidenceTargets = {}) {
  if (!collectNext?.manifest_field) return collectNext?.target_file ?? null;
  const value = evidenceTargets[collectNext.manifest_field];
  if (Array.isArray(value)) {
    for (const item of value) {
      const target = publicRelativeEvidenceTarget(item);
      if (target) return target;
    }
    return collectNext.target_file;
  }
  return publicRelativeEvidenceTarget(value) ?? collectNext.target_file;
}

function resolveCollectNext(collectNext, evidenceTargets = {}) {
  if (!collectNext) return null;
  return {
    ...collectNext,
    target_file: collectTargetForField(collectNext, evidenceTargets),
  };
}


export function buildRankedNextActions(blockers, evidenceTargets = {}) {
  const byId = new Map(blockers.map((blocker) => [blocker.blocker_id, blocker]));
  return NEXT_ACTION_ORDER
    .map((action, index) => {
      const blocker = byId.get(action.blocker_id);
      if (!blocker) return null;
      return {
        priority: index + 1,
        action_id: action.action_id,
        blocker_id: action.blocker_id,
        status: blocker.status,
        summary: action.summary,
        owner_ref: action.owner_ref,
        scenario_ids: blocker.scenario_ids,
        evidence_refs: blocker.evidence_refs,
        missing_evidence_items: blocker.missing_evidence_items ?? [],
        collect_next: resolveCollectNext(action.collect_next, evidenceTargets),
      };
    })
    .filter(Boolean);
}

function usage() {
  return `Usage: node scripts/run-public-beta-qa-matrix.mjs [--json|--plain] [--out <path>] [--evidence-manifest <path>] [--clean-machine-smoke <path>] [--support-dry-run <path>] [--registry-install <path>] [--desktop-release-evidence <path>] [--production-handoff-packet <path>]\n\nGenerates a public-safe ${PUBLIC_BETA_QA_MATRIX_SCHEMA} report from repository files plus optional public-safe QA evidence artifacts, including ranked next_actions for release owners.\n`;
}

function readArg(argv, index, flag) {
  if (index >= argv.length || argv[index].startsWith('--')) throw new Error(`Missing value for ${flag}`);
  return argv[index];
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = { json: false, plain: false, out: null, evidenceManifest: null, cleanMachineSmoke: null, supportDryRun: [], registryInstall: null, desktopReleaseEvidence: null, productionHandoffPacket: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--plain' || arg === '--text' || arg === '--format=text' || (arg === '--format' && argv[i + 1] === 'text')) {
      options.plain = true;
      if (arg === '--format') i += 1;
    } else if (arg === '--out') {
      options.out = readArg(argv, i + 1, '--out');
      i += 1;
    } else if (arg === '--evidence-manifest') {
      options.evidenceManifest = readArg(argv, i + 1, '--evidence-manifest');
      i += 1;
    } else if (arg === '--clean-machine-smoke') {
      options.cleanMachineSmoke = readArg(argv, i + 1, '--clean-machine-smoke');
      i += 1;
    } else if (arg === '--support-dry-run') {
      options.supportDryRun.push(readArg(argv, i + 1, '--support-dry-run'));
      i += 1;
    } else if (arg === '--registry-install') {
      options.registryInstall = readArg(argv, i + 1, '--registry-install');
      i += 1;
    } else if (arg === '--desktop-release-evidence') {
      options.desktopReleaseEvidence = readArg(argv, i + 1, '--desktop-release-evidence');
      i += 1;
    } else if (arg === '--production-handoff-packet') {
      options.productionHandoffPacket = readArg(argv, i + 1, '--production-handoff-packet');
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (options.json && options.plain) throw new Error('Choose only one output format: --json or --plain.');
  return options;
}

async function readRepoText(rel) {
  try {
    return await readFile(resolve(ROOT, rel), 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

async function readRepoJson(rel) {
  const text = await readRepoText(rel);
  if (text === null) return null;
  return JSON.parse(text);
}

async function readPublicEvidenceJson(path, expectedSchema) {
  if (!path) return null;
  let artifact;
  try {
    artifact = JSON.parse(await readFile(resolve(String(path)), 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
  if (artifact?.schema !== expectedSchema) {
    throw new Error(`Evidence artifact schema mismatch: expected ${expectedSchema}.`);
  }
  const safety = verifyPublicSafeArtifact(artifact);
  if (!safety.ok) {
    throw new Error(`Evidence artifact is not public-safe: ${safety.errors.join('; ')}`);
  }
  return artifact;
}

async function readPublicEvidenceJsonList(paths, expectedSchema) {
  const list = Array.isArray(paths) ? paths : [];
  return Promise.all(list.map((p) => readPublicEvidenceJson(p, expectedSchema)));
}

export function normalizeEvidenceManifest(manifest = null) {
  const empty = {
    cleanMachineSmoke: null,
    supportDryRun: [],
    registryInstall: null,
    desktopReleaseEvidence: null,
    productionHandoffPacket: null,
  };
  if (manifest === null || manifest === undefined) return empty;
  if (manifest?.schema !== 'enigma.public_beta_evidence_manifest.v1') {
    throw new Error('Evidence manifest schema mismatch: expected enigma.public_beta_evidence_manifest.v1.');
  }
  const supportDryRun = manifest.support_dry_run ?? manifest.supportDryRun ?? [];
  return {
    cleanMachineSmoke: manifest.clean_machine_smoke ?? manifest.cleanMachineSmoke ?? null,
    supportDryRun: Array.isArray(supportDryRun) ? supportDryRun : [supportDryRun].filter(Boolean),
    registryInstall: manifest.registry_install ?? manifest.registryInstall ?? null,
    desktopReleaseEvidence: manifest.desktop_release_evidence ?? manifest.desktopReleaseEvidence ?? null,
    productionHandoffPacket: manifest.production_handoff_packet ?? manifest.productionHandoffPacket ?? null,
  };
}

export function mergeEvidenceOptions(options = {}, manifest = null) {
  const normalized = normalizeEvidenceManifest(manifest);
  return {
    ...options,
    cleanMachineSmoke: options.cleanMachineSmoke ?? normalized.cleanMachineSmoke,
    supportDryRun: [...normalized.supportDryRun, ...(Array.isArray(options.supportDryRun) ? options.supportDryRun : [])],
    registryInstall: options.registryInstall ?? normalized.registryInstall,
    desktopReleaseEvidence: options.desktopReleaseEvidence ?? normalized.desktopReleaseEvidence,
    productionHandoffPacket: options.productionHandoffPacket ?? normalized.productionHandoffPacket,
  };
}

async function readEvidenceManifest(path) {
  if (!path) return null;
  return JSON.parse(await readFile(resolve(String(path)), 'utf8'));
}

function hasText(text, needle) {
  return typeof text === 'string' && text.includes(needle);
}

function hasAllText(text, needles) {
  return needles.every((needle) => hasText(text, needle));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function scenario({ scenario_id, title, status, evidence_refs, blocker_refs = [], issue_codes = [] }) {
  if (!STATUS_VALUES.has(status)) throw new Error(`Invalid scenario status for ${scenario_id}: ${status}`);
  return {
    scenario_id,
    title,
    status,
    evidence_refs: unique(evidence_refs).sort(),
    blocker_refs: unique(blocker_refs).sort(),
    issue_codes: unique(issue_codes).sort(),
  };
}

function statusCounts(rows) {
  const counts = { pass: 0, fail: 0, blocked: 0, missing: 0, pending: 0 };
  for (const row of rows) counts[row.status] += 1;
  return counts;
}

function ledgerEntry(row, generatedAt) {
  return {
    phase_id: row.scenario_id.startsWith('EV-P9-') ? 'P9' : 'P10',
    scenario_id: row.scenario_id,
    owner_ref: 'ref:role:public-beta-qa',
    status: row.status,
    advisor_decision: row.status === 'pass' ? 'ship' : 'hold',
    evidence_refs: row.evidence_refs,
    privacy_review: {
      status: 'pass',
      reviewer_ref: 'ref:role:public-beta-qa',
      evidence_ref_count: row.evidence_refs.length,
      issue_codes: [],
    },
    claim_review: {
      status: 'pass',
      reviewer_ref: 'ref:role:public-beta-qa',
      evidence_ref_count: row.evidence_refs.length,
      issue_codes: [],
    },
    rollback_ready: row.status === 'pass',
    support_owner_ref: 'ref:role:beta-support',
    release_owner_ref: 'ref:role:release-owner',
    signing_owner_ref: 'ref:role:signing-owner',
    updated_at: generatedAt,
    issue_codes: row.issue_codes,
  };
}

function collectBlockers(rows) {
  const byId = new Map();
  for (const row of rows) {
    for (const blockerId of row.blocker_refs) {
      const definition = Object.values(BLOCKERS).find((candidate) => candidate.blocker_id === blockerId);
      const existing = byId.get(blockerId) ?? {
        blocker_id: blockerId,
        status: definition?.status ?? row.status,
        scenario_ids: [],
        evidence_refs: definition?.evidence_refs ?? [],
        missing_evidence_items: definition?.missing_evidence_items ?? [],
      };
      existing.scenario_ids.push(row.scenario_id);
      byId.set(blockerId, existing);
    }
  }
  return [...byId.values()]
    .map((blocker) => {
      const missingEvidenceItems = [...blocker.missing_evidence_items]
        .sort((left, right) => left.evidence_item_id.localeCompare(right.evidence_item_id));
      const mapped = {
        blocker_id: blocker.blocker_id,
        status: blocker.status,
        scenario_ids: unique(blocker.scenario_ids).sort(),
        evidence_refs: unique(blocker.evidence_refs).sort(),
      };
      if (missingEvidenceItems.length > 0) mapped.missing_evidence_items = missingEvidenceItems;
      return mapped;
    })
    .sort((left, right) => left.blocker_id.localeCompare(right.blocker_id));
}

function publicSafeAssert(report) {
  const result = verifyPublicSafeArtifact(report);
  if (!result.ok) throw new Error(`Public beta QA matrix is not public-safe: ${result.errors.join('; ')}`);
}

export async function inspectPublicBetaQaInputs(options = {}) {
  const evidenceOptions = mergeEvidenceOptions(options, await readEvidenceManifest(options.evidenceManifest));
  const cleanMachineSmoke = await readPublicEvidenceJson(evidenceOptions.cleanMachineSmoke, 'enigma.clean_machine_smoke.v1');
  const supportDryRunSummaries = await readPublicEvidenceJsonList(evidenceOptions.supportDryRun, 'enigma.support_dry_run_summary.v1');
  const registryInstall = await readPublicEvidenceJson(evidenceOptions.registryInstall, 'enigma.registry_install_verifier.v1');
  const desktopReleaseEvidence = await readPublicEvidenceJson(evidenceOptions.desktopReleaseEvidence, 'enigma.desktop_release_evidence.v1');
  const productionHandoffPacket = await readPublicEvidenceJson(evidenceOptions.productionHandoffPacket, 'enigma.production_handoff_packet.v1');
  const [
    packageJson,
    tauriConfig,
    wizardUi,
    helpUi,
    desktopIndex,
    serviceCommands,
    diagnosticsCommands,
    crashCommands,
    updateCommands,
    libCommands,
    desktopReleaseWorkflow,
    desktopBuildWorkflow,
    npmPublishWorkflow,
    roadmap,
    qaScenarios,
    qaSupport,
    releaseChecklist,
    signingPlan,
    signingSetup,
    productionStatus,
    releaseEvidenceScript,
    updateSignerScript,
  ] = await Promise.all([
    readRepoJson('package.json'),
    readRepoJson('apps/desktop-tauri/tauri.conf.json'),
    readRepoText('apps/desktop-tauri/ui/wizard.js'),
    readRepoText('apps/desktop-tauri/ui/help.js'),
    readRepoText('apps/desktop-tauri/ui/index.html'),
    readRepoText('apps/desktop-tauri/src/commands/service.rs'),
    readRepoText('apps/desktop-tauri/src/commands/diagnostics.rs'),
    readRepoText('apps/desktop-tauri/src/commands/crash.rs'),
    readRepoText('apps/desktop-tauri/src/commands/update.rs'),
    readRepoText('apps/desktop-tauri/src/lib.rs'),
    readRepoText('.github/workflows/desktop-release.yml'),
    readRepoText('.github/workflows/desktop-build.yml'),
    readRepoText('.github/workflows/npm-publish.yml'),
    readRepoText('docs/public-launch/workflowz-execution-roadmap.md'),
    readRepoText('docs/public-launch/qa-smoke-scenarios.md'),
    readRepoText('docs/public-launch/qa-support-observability.md'),
    readRepoText('docs/public-launch/release-owner-checklist.md'),
    readRepoText('docs/public-launch/trust-signing-release.md'),
    readRepoText('docs/public-launch/code-signing-setup.md'),
    readRepoText('docs/public-launch/production-readiness-status.md'),
    readRepoText('scripts/release-evidence-desktop.mjs'),
    readRepoText('scripts/sign-update-manifest.mjs'),
  ]);

  const packageVersion = typeof packageJson?.version === 'string' ? packageJson.version : null;
  const mcpbManifest = createClaudeDesktopMcpbManifest({ version: packageVersion ?? '0.0.0' });
  const mcpbConnectionPlan = createClaudeDesktopMcpbConnectionPlan({ platform: 'win32' });
  const mcpbHealth = createClaudeDesktopMcpbHealth({ mcpbInstalled: true });

  return {
    packageJson,
    packageVersion,
    tauriConfig,
    wizardUi,
    helpUi,
    desktopIndex,
    serviceCommands,
    diagnosticsCommands,
    crashCommands,
    updateCommands,
    libCommands,
    desktopReleaseWorkflow,
    desktopBuildWorkflow,
    npmPublishWorkflow,
    roadmap,
    qaScenarios,
    qaSupport,
    releaseChecklist,
    signingPlan,
    signingSetup,
    productionStatus,
    releaseEvidenceScript,
    updateSignerScript,
    mcpbManifest,
    supportDryRunSummaries,
    cleanMachineSmoke,
    registryInstall,
    desktopReleaseEvidence,
    productionHandoffPacket,
    evidenceTargets: {
      clean_machine_smoke: evidenceOptions.cleanMachineSmoke,
      support_dry_run: evidenceOptions.supportDryRun,
      registry_install: evidenceOptions.registryInstall,
      desktop_release_evidence: evidenceOptions.desktopReleaseEvidence,
      production_handoff_packet: evidenceOptions.productionHandoffPacket,
    },
    mcpbConnectionPlan,
    mcpbHealth,
  };
}

function isPublicEvidenceRef(value) {
  return typeof value === 'string' && /^(ref:[A-Za-z0-9._:/#-]+|https:\/\/[^\s]+)$/u.test(value);
}

function publicSafeReleasePacketApprovalReady(packet) {
  const approval = packet?.public_safe_release_packet_approval;
  return approval?.status === 'approved'
    && isPublicEvidenceRef(approval.release_packet_ref)
    && isPublicEvidenceRef(approval.claim_boundary_reviewer_ref)
    && isPublicEvidenceRef(approval.approval_ref)
    && typeof approval.approved_at === 'string'
    && /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/u.test(approval.approved_at);
}

function hasPublicEvidenceRef(value) {
  return isPublicEvidenceRef(value?.evidence_ref);
}

export function buildScenarioRows(inputs) {
  const tauriTargets = inputs.tauriConfig?.bundle?.targets ?? [];
  const hasDesktopBundle = inputs.tauriConfig?.bundle?.active === true
    && ['msi', 'nsis', 'dmg', 'app'].every((target) => tauriTargets.includes(target));
  const windowsSigningConfigured = Boolean(inputs.tauriConfig?.bundle?.windows?.certificateThumbprint);
  const macosSigningConfigured = Boolean(inputs.tauriConfig?.bundle?.macOS?.signingIdentity)
    && Boolean(inputs.tauriConfig?.bundle?.macOS?.providerShortName);
  const updaterConfigured = inputs.tauriConfig?.plugins?.updater?.active === true
    && Array.isArray(inputs.tauriConfig?.plugins?.updater?.endpoints)
    && typeof inputs.tauriConfig?.plugins?.updater?.pubkey === 'string'
    && inputs.tauriConfig.plugins.updater.pubkey.length > 0;
  const firstRunUiPresent = hasAllText(inputs.wizardUi, [
    'Create my Memory Drive',
    'Find my apps',
    'Connect your AI apps',
    'Run health check',
    'Your Memory Drive is ready',
  ]) && hasText(inputs.desktopIndex, './wizard.js');
  const serviceContractPresent = hasAllText(inputs.serviceCommands, [
    'create_vault',
    'detect_clients',
    'connect_client',
    'get_health',
    'offline_ready',
  ]) && hasText(inputs.libCommands, 'commands::service::get_health');
  const claudeMcpbStaticReady = inputs.mcpbManifest?.schema === 'enigma.claude_desktop_mcpb_manifest.v1'
    && inputs.mcpbConnectionPlan?.preferred_path === 'mcpb_extension'
    && inputs.mcpbConnectionPlan?.automatic_config_write === false
    && inputs.mcpbHealth?.ready_requires_test_evidence === true;
  const proofStaticPresent = hasText(inputs.wizardUi, 'Proof activity') && hasText(inputs.helpUi, 'Proof artifacts can show hashes');
  const offlineStaticPresent = hasText(inputs.serviceCommands, 'offline_ready') && hasText(inputs.updateCommands, '"offline"');
  const configRecoveryCommandSurfacePresent = hasAllText(inputs.serviceCommands, ['repair_client', 'rollback_client'])
    && (hasText(inputs.serviceCommands, 'malformed') || hasText(inputs.serviceCommands, 'backup'));
  const configRecoveryUiSurfacePresent = hasAllText(inputs.wizardUi, ['safe reset', 'restore'])
    || hasAllText(inputs.wizardUi, ['Safe reset', 'Restore'])
    || hasAllText(inputs.wizardUi, ['Repair connection', 'Roll back'])
    || hasAllText(inputs.wizardUi, ['Repair connection', 'Rollback']);
  const configRecoveryStaticPresent = configRecoveryCommandSurfacePresent && configRecoveryUiSurfacePresent;
  const diagnosticsStaticPresent = hasAllText(inputs.diagnosticsCommands, [
    'FORBIDDEN_KEYS',
    'export_diagnostics',
    'approve',
    'redact_path',
  ]) && hasText(inputs.wizardUi, 'Export bundle');
  const crashStaticPresent = hasAllText(inputs.crashCommands, [
    'init_panic_hook',
    'opt-in required',
    'pending-crash-reports',
  ]) && hasText(inputs.wizardUi, 'Crash reporting');
  const npmWorkflowReady = hasText(inputs.npmPublishWorkflow, 'npm publish --access public --provenance');
  const releaseEvidenceScriptPresent = typeof inputs.releaseEvidenceScript === 'string';
  const updateSignerPresent = typeof inputs.updateSignerScript === 'string' && hasText(inputs.desktopReleaseWorkflow, 'Sign update manifest');

  const cleanMachine = BLOCKERS.cleanMachine.blocker_id;
  const supportDryRun = BLOCKERS.supportDryRun.blocker_id;
  const windowsSignedArtifact = BLOCKERS.windowsSignedArtifact.blocker_id;
  const macosNotarizedArtifact = BLOCKERS.macosNotarizedArtifact.blocker_id;
  const signingIdentities = BLOCKERS.signingIdentities.blocker_id;
  const updateRollback = BLOCKERS.updateRollback.blocker_id;
  const npmPublish = BLOCKERS.npmPublish.blocker_id;
  const releaseApproval = BLOCKERS.releaseApproval.blocker_id;
  const publicSafePacket = BLOCKERS.publicSafePacket.blocker_id;
  const configRecovery = BLOCKERS.configRecovery.blocker_id;
  const cleanMachineEvidenceReady = inputs.cleanMachineSmoke?.schema === 'enigma.clean_machine_smoke.v1'
    && inputs.cleanMachineSmoke?.summary?.healthy === true
    && inputs.cleanMachineSmoke?.app_version === REQUIRED_PUBLIC_BETA_VERSION;
  const cleanMachineEvidenceRefs = cleanMachineEvidenceReady ? ['ref:evidence:clean-machine-smoke'] : [];
  const withCleanMachineEvidence = (refs) => [...refs, ...cleanMachineEvidenceRefs];
  const cleanMachineBlockers = (...rest) => (cleanMachineEvidenceReady ? rest : [cleanMachine, ...rest]);
  const supportEvidenceReadyFor = (scenarioId) => (Array.isArray(inputs.supportDryRunSummaries) ? inputs.supportDryRunSummaries : [])
    .some((summary) => summary?.schema === 'enigma.support_dry_run_summary.v1'
      && summary?.evidence_item_id === 'EV-P10-SUPPORT-DRY-RUN-SUMMARY'
      && summary?.scenario_id === scenarioId
      && summary?.bundle_privacy_check_status === 'pass'
      && summary?.privacy_review?.status === 'pass'
      && !['blocked', 'release_blocker'].includes(summary?.triage_result));
  const withSupportEvidence = (scenarioId, refs) => (supportEvidenceReadyFor(scenarioId)
    ? [...refs, `ref:evidence:support-dry-run:${scenarioId}`]
    : refs);
  const supportDryRunBlockers = (scenarioId, ...rest) => (supportEvidenceReadyFor(scenarioId) ? rest : [supportDryRun, ...rest]);
  const supportDryRunIssues = (scenarioId, missingCode, ...rest) => (supportEvidenceReadyFor(scenarioId) ? rest : [missingCode, ...rest]);
  const cleanMachineIssues = (missingCode, ...rest) => (cleanMachineEvidenceReady ? rest : [missingCode, ...rest]);
  const cleanMachineStatus = (staticReady) => (staticReady ? (cleanMachineEvidenceReady ? 'pass' : 'blocked') : 'missing');
  const statusFromBlockers = (staticReady, blockers) => (staticReady ? (blockers.length === 0 ? 'pass' : 'blocked') : 'missing');
  const registryInstallEvidenceReady = inputs.registryInstall?.schema === 'enigma.registry_install_verifier.v1'
    && inputs.registryInstall?.ok === true
    && inputs.registryInstall?.mode === 'execute'
    && inputs.registryInstall?.execute === true
    && inputs.registryInstall?.skip_network === false
    && inputs.registryInstall?.package?.name === (inputs.packageJson?.name ?? 'enigma-memory')
    && inputs.registryInstall?.package?.version === REQUIRED_PUBLIC_BETA_VERSION;
  const desktopInstallers = Array.isArray(inputs.desktopReleaseEvidence?.installers)
    ? inputs.desktopReleaseEvidence.installers
    : [];
  const windowsInstallerReady = desktopInstallers.some((installer) => installer?.platform === 'windows'
    && installer?.present === true
    && installer?.signature?.status === 'verified'
    && hasPublicEvidenceRef(installer.signature));
  const macosInstallerReady = desktopInstallers.some((installer) => installer?.platform === 'macos'
    && installer?.present === true
    && installer?.signature?.status === 'verified'
    && hasPublicEvidenceRef(installer.signature)
    && installer?.notarization?.status === 'accepted'
    && hasPublicEvidenceRef(installer.notarization)
    && installer?.stapling?.status === 'stapled'
    && hasPublicEvidenceRef(installer.stapling));
  const updateRollbackReady = inputs.desktopReleaseEvidence?.update_rollback?.status === 'pass'
    && hasPublicEvidenceRef(inputs.desktopReleaseEvidence.update_rollback);
  const desktopReleaseEvidenceReady = inputs.desktopReleaseEvidence?.schema === 'enigma.desktop_release_evidence.v1'
    && inputs.desktopReleaseEvidence?.release_version === REQUIRED_PUBLIC_BETA_VERSION
    && Array.isArray(inputs.desktopReleaseEvidence?.blockers)
    && inputs.desktopReleaseEvidence.blockers.length === 0
    && windowsInstallerReady
    && macosInstallerReady
    && updateRollbackReady
    && inputs.desktopReleaseEvidence?.manifest?.signature?.status === 'verified';
  const desktopReleaseEvidenceRefs = desktopReleaseEvidenceReady ? ['ref:evidence:desktop-release'] : [];
  const desktopReleaseBlockers = (...rest) => (desktopReleaseEvidenceReady ? rest : [windowsSignedArtifact, macosNotarizedArtifact, ...rest]);
  const productionHandoffPacketReady = inputs.productionHandoffPacket?.schema === 'enigma.production_handoff_packet.v1'
    && inputs.productionHandoffPacket?.go_live_ready === true
    && Array.isArray(inputs.productionHandoffPacket?.blockers)
    && inputs.productionHandoffPacket.blockers.length === 0
    && inputs.productionHandoffPacket?.release_audit?.ok === true
    && inputs.productionHandoffPacket?.operator_acceptance?.ok === true
    && inputs.productionHandoffPacket?.local_static_artifact_ready === true
    && publicSafeReleasePacketApprovalReady(inputs.productionHandoffPacket);
  const productionHandoffRefs = productionHandoffPacketReady ? ['ref:evidence:production-handoff-packet'] : [];
  const releasePacketBlockers = productionHandoffPacketReady ? [releaseApproval] : [releaseApproval, publicSafePacket];
  const releasePacketIssues = productionHandoffPacketReady ? ['release-approval-evidence-missing', 'reviewer-approval-evidence-missing'] : ['release-approval-evidence-missing', 'reviewer-approval-evidence-missing', 'public-safe-release-packet-approval-missing'];

  const desktopReleaseIssues = (...rest) => (desktopReleaseEvidenceReady ? rest : ['signed-artifact-evidence-missing', ...rest]);

  const registryEvidenceRefs = registryInstallEvidenceReady ? ['ref:evidence:registry-install'] : [];

  const diagnosticSupportBlockers = cleanMachineBlockers(...supportDryRunBlockers('BETA-DIAG-001'));
  const diagnosticSupportIssues = [
    ...cleanMachineIssues('clean-machine-diagnostics-evidence-missing'),
    ...supportDryRunIssues('BETA-DIAG-001', 'diagnostics-support-dry-run-missing'),
  ];
  const crashSupportBlockers = cleanMachineBlockers(...supportDryRunBlockers('BETA-CRASH-001'));
  const crashSupportIssues = [
    ...cleanMachineIssues('clean-machine-crash-evidence-missing'),
    ...supportDryRunIssues('BETA-CRASH-001', 'crash-reporting-manual-evidence-missing'),
  ];
  const installBlockers = cleanMachineBlockers(...desktopReleaseBlockers());
  const installIssues = [
    ...cleanMachineIssues('clean-machine-evidence-missing'),
    ...desktopReleaseIssues(),
  ];


  return [
    scenario({
      scenario_id: 'BETA-INSTALL-001',
      title: 'Fresh desktop install',
      status: statusFromBlockers(hasDesktopBundle || desktopReleaseEvidenceReady, installBlockers),
      evidence_refs: withCleanMachineEvidence([REFS.tauriBundle, REFS.desktopReleaseWorkflow, REFS.qaScenarios, REFS.signingPlan, ...desktopReleaseEvidenceRefs]),
      blocker_refs: installBlockers,
      issue_codes: installIssues,
    }),
    scenario({
      scenario_id: 'BETA-FIRST-001',
      title: 'Fresh first run',
      status: cleanMachineStatus(firstRunUiPresent && serviceContractPresent),
      evidence_refs: withCleanMachineEvidence([REFS.wizardUi, REFS.helpUi, REFS.serviceCommands, REFS.libCommands, REFS.qaScenarios]),
      blocker_refs: cleanMachineBlockers(),
      issue_codes: cleanMachineIssues('clean-machine-first-run-missing'),
    }),
    scenario({
      scenario_id: 'BETA-CLIENT-CLAUDE-001',
      title: 'Claude Desktop connect path',
      status: claudeMcpbStaticReady ? 'blocked' : 'missing',
      evidence_refs: withCleanMachineEvidence([REFS.mcpbHelpers, REFS.serviceCommands, REFS.wizardUi, REFS.qaSupport]),
      blocker_refs: cleanMachineBlockers(releaseApproval),
      issue_codes: ['claude-manual-evidence-missing'],
    }),
    scenario({
      scenario_id: 'BETA-CLIENT-001',
      title: 'No supported client installed',
      status: cleanMachineStatus(serviceContractPresent),
      evidence_refs: withCleanMachineEvidence([REFS.serviceCommands, REFS.wizardUi, REFS.qaScenarios, REFS.qaSupport]),
      blocker_refs: cleanMachineBlockers(),
      issue_codes: cleanMachineIssues('no-client-clean-machine-evidence-missing'),
    }),
    scenario({
      scenario_id: 'BETA-CLIENT-002',
      title: 'One supported client installed',
      status: claudeMcpbStaticReady && serviceContractPresent ? 'blocked' : 'missing',
      evidence_refs: withCleanMachineEvidence([REFS.mcpbHelpers, REFS.serviceCommands, REFS.wizardUi, REFS.qaScenarios]),
      blocker_refs: cleanMachineBlockers(releaseApproval),
      issue_codes: ['one-client-manual-evidence-missing'],
    }),
    scenario({
      scenario_id: 'BETA-CLIENT-003',
      title: 'Existing unrelated MCP settings',
      status: serviceContractPresent ? 'blocked' : 'missing',
      evidence_refs: withCleanMachineEvidence([REFS.mcpbHelpers, REFS.serviceCommands, REFS.qaScenarios, REFS.qaSupport]),
      blocker_refs: cleanMachineBlockers(releaseApproval),
      issue_codes: ['sibling-settings-manual-evidence-missing'],
    }),
    scenario({
      scenario_id: 'BETA-PROOF-001',
      title: 'Proof summary',
      status: cleanMachineStatus(proofStaticPresent),
      evidence_refs: withCleanMachineEvidence([REFS.wizardUi, REFS.helpUi, REFS.coreLedgerHelpers, REFS.qaScenarios]),
      blocker_refs: cleanMachineBlockers(),
      issue_codes: cleanMachineIssues('proof-summary-evidence-missing'),
    }),
    scenario({
      scenario_id: 'BETA-OFFLINE-001',
      title: 'Offline launch',
      status: cleanMachineStatus(offlineStaticPresent),
      evidence_refs: withCleanMachineEvidence([REFS.serviceCommands, REFS.updateCommands, REFS.wizardUi, REFS.qaScenarios]),
      blocker_refs: cleanMachineBlockers(),
      issue_codes: cleanMachineIssues('offline-relaunch-evidence-missing'),
    }),
    scenario({
      scenario_id: 'BETA-CONFIG-001',
      title: 'Config recovery',
      status: configRecoveryStaticPresent ? (cleanMachineEvidenceReady ? 'pass' : 'blocked') : 'missing',
      evidence_refs: withCleanMachineEvidence([REFS.serviceCommands, REFS.wizardUi, REFS.qaSupport]),
      blocker_refs: configRecoveryStaticPresent ? cleanMachineBlockers() : [configRecovery],
      issue_codes: configRecoveryStaticPresent ? cleanMachineIssues('config-recovery-manual-evidence-missing') : ['config-recovery-surface-missing'],
    }),
    scenario({
      scenario_id: 'BETA-CONFIG-002',
      title: 'Corrupted third-party client config',
      status: configRecoveryStaticPresent ? (cleanMachineEvidenceReady ? 'pass' : 'blocked') : 'missing',
      evidence_refs: withCleanMachineEvidence([REFS.mcpbHelpers, REFS.serviceCommands, REFS.wizardUi, REFS.qaSupport]),
      blocker_refs: configRecoveryStaticPresent ? cleanMachineBlockers() : [configRecovery],
      issue_codes: configRecoveryStaticPresent ? cleanMachineIssues('third-party-config-manual-evidence-missing') : ['third-party-config-recovery-surface-missing'],
    }),
    scenario({
      scenario_id: 'BETA-DIAG-001',
      title: 'Diagnostic bundle preview',
      status: statusFromBlockers(diagnosticsStaticPresent, diagnosticSupportBlockers),
      evidence_refs: withSupportEvidence('BETA-DIAG-001', withCleanMachineEvidence([REFS.diagnosticsCommands, REFS.wizardUi, REFS.qaScenarios, REFS.qaSupport])),
      blocker_refs: diagnosticSupportBlockers,
      issue_codes: diagnosticSupportIssues,
    }),
    scenario({
      scenario_id: 'BETA-CRASH-001',
      title: 'Crash before opt-in',
      status: statusFromBlockers(crashStaticPresent, crashSupportBlockers),
      evidence_refs: withSupportEvidence('BETA-CRASH-001', withCleanMachineEvidence([REFS.crashCommands, REFS.wizardUi, REFS.qaScenarios])),
      blocker_refs: crashSupportBlockers,
      issue_codes: crashSupportIssues,
    }),
    scenario({
      scenario_id: 'BETA-SIGNING-WINDOWS-001',
      title: 'Windows signing evidence',
      status: desktopReleaseEvidenceReady ? 'pass' : (windowsSigningConfigured ? 'pending' : 'blocked'),
      evidence_refs: [REFS.tauriBundle, REFS.desktopReleaseWorkflow, REFS.signingSetup, REFS.productionStatus, ...desktopReleaseEvidenceRefs],
      blocker_refs: desktopReleaseEvidenceReady ? [] : [windowsSignedArtifact, signingIdentities],
      issue_codes: desktopReleaseEvidenceReady ? [] : ['windows-signing-evidence-missing'],
    }),
    scenario({
      scenario_id: 'BETA-SIGNING-MACOS-001',
      title: 'macOS signing and notarization evidence',
      status: desktopReleaseEvidenceReady ? 'pass' : (macosSigningConfigured ? 'pending' : 'blocked'),
      evidence_refs: [REFS.tauriBundle, REFS.desktopReleaseWorkflow, REFS.signingSetup, REFS.productionStatus, ...desktopReleaseEvidenceRefs],
      blocker_refs: desktopReleaseEvidenceReady ? [] : [macosNotarizedArtifact, signingIdentities],
      issue_codes: desktopReleaseEvidenceReady ? [] : ['macos-notarization-evidence-missing'],
    }),
    scenario({
      scenario_id: 'BETA-UPDATE-001',
      title: 'Signed update and rollback evidence',
      status: desktopReleaseEvidenceReady ? 'pass' : (updaterConfigured && updateSignerPresent ? 'blocked' : 'missing'),
      evidence_refs: [REFS.tauriUpdater, REFS.updateCommands, REFS.desktopReleaseWorkflow, REFS.updateSignerScript, REFS.signingPlan, ...desktopReleaseEvidenceRefs],
      blocker_refs: desktopReleaseEvidenceReady ? [] : [updateRollback, signingIdentities],
      issue_codes: desktopReleaseEvidenceReady ? [] : ['update-rollback-rehearsal-missing'],
    }),
    scenario({
      scenario_id: 'BETA-NPM-001',
      title: 'npm package availability evidence',
      status: registryInstallEvidenceReady ? 'pass' : (inputs.packageVersion === REQUIRED_PUBLIC_BETA_VERSION && npmWorkflowReady ? 'pending' : 'blocked'),
      evidence_refs: [REFS.packageVersion, REFS.npmPublishWorkflow, REFS.qaSupport, ...registryEvidenceRefs],
      blocker_refs: registryInstallEvidenceReady ? [] : [npmPublish],
      issue_codes: registryInstallEvidenceReady ? [] : ['npm-required-version-unpublished'],
    }),
    scenario({
      scenario_id: 'BETA-MERGE-001',
      title: 'Release PR approval, merge, and reviewer approval evidence',
      status: 'blocked',
      evidence_refs: [REFS.roadmap, REFS.releaseChecklist, REFS.qaSupport, ...productionHandoffRefs],
      blocker_refs: releasePacketBlockers,
      issue_codes: releasePacketIssues,
    }),
    scenario({
      scenario_id: 'EV-P9-WINDOWS-SIGNING-OBSERVED',
      title: 'Observed Windows signing artifact evidence',
      status: windowsSigningConfigured ? 'pending' : 'blocked',
      evidence_refs: [REFS.tauriBundle, REFS.desktopReleaseWorkflow, REFS.releaseEvidenceScript, REFS.releaseChecklist],
      blocker_refs: [windowsSignedArtifact, signingIdentities],
      issue_codes: ['windows-signed-artifact-missing'],
    }),
    scenario({
      scenario_id: 'EV-P9-MACOS-NOTARIZED-STAPLED',
      title: 'Observed macOS notarized and stapled artifact evidence',
      status: macosSigningConfigured ? 'pending' : 'blocked',
      evidence_refs: [REFS.tauriBundle, REFS.desktopReleaseWorkflow, REFS.releaseEvidenceScript, REFS.releaseChecklist],
      blocker_refs: [macosNotarizedArtifact, signingIdentities],
      issue_codes: ['macos-notarized-artifact-missing'],
    }),
    scenario({
      scenario_id: 'EV-P9-UPDATE-ROLLBACK',
      title: 'Update verification and rollback rehearsal evidence',
      status: updaterConfigured && updateSignerPresent ? 'blocked' : 'missing',
      evidence_refs: [REFS.tauriUpdater, REFS.updateCommands, REFS.updateSignerScript, REFS.releaseChecklist],
      blocker_refs: [updateRollback],
      issue_codes: ['update-rollback-evidence-missing'],
    }),
    scenario({
      scenario_id: 'EV-P9-PUBLIC-SAFE-RELEASE-PACKET',
      title: 'Approved public-safe release packet evidence',
      status: releaseEvidenceScriptPresent ? 'blocked' : 'missing',
      evidence_refs: [REFS.releaseEvidenceScript, REFS.releaseChecklist, REFS.signingPlan],
      blocker_refs: [publicSafePacket, releaseApproval],
      issue_codes: ['public-safe-release-packet-approval-missing'],
    }),
  ];
}
export async function buildPublicBetaQaMatrix(options = {}) {
  const generatedAt = options.generated_at ?? options.generatedAt ?? new Date().toISOString();
  const inputs = await inspectPublicBetaQaInputs(options);
  const scenarios = buildScenarioRows(inputs);
  const counts = statusCounts(scenarios);
  const blockers = collectBlockers(scenarios);
  const nextActions = buildRankedNextActions(blockers, inputs.evidenceTargets);
  const readyForPublicBeta = scenarios.every((row) => row.status === 'pass');
  const ledgerSummary = summarizePublicLaunchEvidence(scenarios.map((row) => ledgerEntry(row, generatedAt)));
  const evidenceManifestRef = publicRelativeEvidenceTarget(options.evidenceManifest) ?? '.enigma/public-beta/evidence-manifest.json';
  const report = {
    schema: PUBLIC_BETA_QA_MATRIX_SCHEMA,
    generated_at: generatedAt,
    version: inputs.packageVersion ?? 'unknown',
    required_public_beta_version: REQUIRED_PUBLIC_BETA_VERSION,
    evidence_manifest: evidenceManifestRef,
    advisor_decision: readyForPublicBeta ? 'ship' : 'hold',
    summary: {
      total_scenarios: scenarios.length,
      status_counts: counts,
      ready_for_public_beta: readyForPublicBeta,
      ledger_total_entries: ledgerSummary.total_entries,
      ledger_status_counts: ledgerSummary.status_counts,
    },
    blockers,
    next_actions: nextActions,
    scenarios,
  };
  publicSafeAssert(report);
  return report;
}

export function renderPublicBetaQaPlain(report) {
  const counts = report.summary?.status_counts ?? {};
  const lines = [
    'Enigma public beta QA advisor',
    `Decision: ${String(report.advisor_decision ?? 'hold').toUpperCase()}`,
    `Version: ${report.version ?? 'unknown'} / required ${report.required_public_beta_version ?? 'unknown'}`,
    `Ready for public beta: ${report.summary?.ready_for_public_beta ? 'yes' : 'no'}`,
    `Scenarios: ${report.summary?.total_scenarios ?? 0}`,
    `Pass: ${counts.pass ?? 0}`,
    `Blocked: ${counts.blocked ?? 0}`,
    `Pending: ${counts.pending ?? 0}`,
    `Missing: ${counts.missing ?? 0}`,
    `Fail: ${counts.fail ?? 0}`,
  ];
  const actions = Array.isArray(report.next_actions) ? report.next_actions.slice(0, 5) : [];
  for (const action of actions) {
    lines.push(`Next: ${action.action_id} — ${action.summary}`);
    if (action.collect_next?.target_file && action.collect_next?.collect) {
      lines.push(`Collect next: ${action.action_id} — ${action.collect_next.evidence_item_id} into ${action.collect_next.target_file}: ${action.collect_next.collect}`);
    }
  }
  const internalEvidenceActions = (Array.isArray(report.next_actions) ? report.next_actions : [])
    .filter((action) => action.owner_ref === 'ref:role:qa-owner' || action.owner_ref === 'ref:role:beta-support');
  if (internalEvidenceActions.length > 0) {
    lines.push('Internal QA/support evidence to collect now:');
    for (const action of internalEvidenceActions) {
      lines.push(`Internal: ${action.action_id} — ${action.summary}`);
      if (action.collect_next?.target_file && action.collect_next?.collect) {
        lines.push(`Collect internal: ${action.action_id} — ${action.collect_next.evidence_item_id} into ${action.collect_next.target_file}: ${action.collect_next.collect}`);
      }
    }
  }
  const patchableEvidence = (Array.isArray(report.next_actions) ? report.next_actions : [])
    .flatMap((action) => (Array.isArray(action.missing_evidence_items) ? action.missing_evidence_items : [])
      .map((item) => ({ action, item })));
  if (patchableEvidence.length > 0) {
    lines.push('Patchable evidence:');
    for (const { action, item } of patchableEvidence) {
      lines.push(`Evidence: ${action.action_id} — ${item.evidence_item_id} (${item.evidence_kind})`);
      if (Array.isArray(item.required_fields) && item.required_fields.length > 0) {
        lines.push(`Fields: ${item.required_fields.join(', ')}`);
      }
    }
  }
  if (!report.summary?.ready_for_public_beta) {
    const evidenceManifest = publicRelativeEvidenceTarget(report.evidence_manifest) ?? '.enigma/public-beta/evidence-manifest.json';
    lines.push(`Collect: npm run public-beta:evidence-manifest -- --out ${evidenceManifest} --plain`);
    lines.push(`Review: npm run public-beta:advisor -- --evidence-manifest ${evidenceManifest}`);
  }
  lines.push('Boundary: local repository and supplied public-safe evidence matrix only; no PR approval, merge, npm publication, signed installer, hosted service, provider deletion, model behavior, benchmark superiority, token ROI, or compliance claims.');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  const report = await buildPublicBetaQaMatrix(options);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (options.out) {
    const outPath = resolve(options.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, json, 'utf8');
    return;
  }
  process.stdout.write(options.plain ? renderPublicBetaQaPlain(report) : json);
}

if (process.argv[1] === SCRIPT_PATH) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
