#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
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
  },
  {
    action_id: 'approve_public_safe_release_packet',
    blocker_id: 'BLOCKER-PUBLIC-SAFE-RELEASE-PACKET',
    summary: 'Approve the public-safe release packet after claim-boundary review.',
    owner_ref: 'ref:role:release-owner',
  },
  {
    action_id: 'publish_npm_0_1_19',
    blocker_id: 'BLOCKER-NPM-0.1.19-PUBLISH',
    summary: 'Publish enigma-memory 0.1.19 through the trusted npm workflow after the release PR is merged.',
    owner_ref: 'ref:role:release-owner',
  },
  {
    action_id: 'complete_signing_identities',
    blocker_id: 'BLOCKER-APPLE-MICROSOFT-SIGNING-IDENTITIES',
    summary: 'Finish Apple/Microsoft signing identity setup and signing secret custody evidence.',
    owner_ref: 'ref:role:release-engineer',
  },
  {
    action_id: 'produce_signed_desktop_artifacts',
    blocker_id: 'BLOCKER-WINDOWS-SIGNED-ARTIFACT',
    summary: 'Produce signed Windows desktop artifact evidence.',
    owner_ref: 'ref:role:release-engineer',
  },
  {
    action_id: 'produce_notarized_macos_artifacts',
    blocker_id: 'BLOCKER-MACOS-NOTARIZED-ARTIFACT',
    summary: 'Produce signed, notarized, and stapled macOS artifact evidence.',
    owner_ref: 'ref:role:release-engineer',
  },
  {
    action_id: 'rehearse_update_rollback',
    blocker_id: 'BLOCKER-UPDATE-ROLLBACK-REHEARSAL',
    summary: 'Run signed update verification and rollback rehearsal evidence.',
    owner_ref: 'ref:role:release-engineer',
  },
  {
    action_id: 'run_clean_machine_qa',
    blocker_id: 'BLOCKER-CLEAN-MACHINE-QA',
    summary: 'Run clean-machine Windows/macOS install, first-run, connector, proof, offline, update, diagnostics, and uninstall QA.',
    owner_ref: 'ref:role:qa-owner',
  },
  {
    action_id: 'record_support_dry_run',
    blocker_id: 'BLOCKER-SUPPORT-DRY-RUN',
    summary: 'Record the public-safe support dry-run summary evidence item.',
    owner_ref: 'ref:role:beta-support',
  },
]);

export function buildRankedNextActions(blockers) {
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
      };
    })
    .filter(Boolean);
}

function usage() {
  return `Usage: node scripts/run-public-beta-qa-matrix.mjs [--json|--plain] [--out <path>]\n\nGenerates a public-safe ${PUBLIC_BETA_QA_MATRIX_SCHEMA} report from repository files only, including ranked next_actions for release owners.\n`;
}

function readArg(argv, index, flag) {
  if (index >= argv.length || argv[index].startsWith('--')) throw new Error(`Missing value for ${flag}`);
  return argv[index];
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = { json: false, plain: false, out: null };
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
  if (!result.ok) throw new Error(`public beta QA matrix is not public-safe: ${result.errors.join('; ')}`);
}

export async function inspectPublicBetaQaInputs() {
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
    mcpbConnectionPlan,
    mcpbHealth,
  };
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

  return [
    scenario({
      scenario_id: 'BETA-INSTALL-001',
      title: 'Fresh desktop install',
      status: hasDesktopBundle ? 'blocked' : 'missing',
      evidence_refs: [REFS.tauriBundle, REFS.desktopReleaseWorkflow, REFS.qaScenarios, REFS.signingPlan],
      blocker_refs: [cleanMachine, windowsSignedArtifact, macosNotarizedArtifact],
      issue_codes: ['clean-machine-evidence-missing', 'signed-artifact-evidence-missing'],
    }),
    scenario({
      scenario_id: 'BETA-FIRST-001',
      title: 'Fresh first run',
      status: firstRunUiPresent && serviceContractPresent ? 'blocked' : 'missing',
      evidence_refs: [REFS.wizardUi, REFS.helpUi, REFS.serviceCommands, REFS.libCommands, REFS.qaScenarios],
      blocker_refs: [cleanMachine],
      issue_codes: ['clean-machine-first-run-missing'],
    }),
    scenario({
      scenario_id: 'BETA-CLIENT-CLAUDE-001',
      title: 'Claude Desktop connect path',
      status: claudeMcpbStaticReady ? 'blocked' : 'missing',
      evidence_refs: [REFS.mcpbHelpers, REFS.serviceCommands, REFS.wizardUi, REFS.qaSupport],
      blocker_refs: [cleanMachine, releaseApproval],
      issue_codes: ['claude-manual-evidence-missing'],
    }),
    scenario({
      scenario_id: 'BETA-CLIENT-001',
      title: 'No supported client installed',
      status: serviceContractPresent ? 'blocked' : 'missing',
      evidence_refs: [REFS.serviceCommands, REFS.wizardUi, REFS.qaScenarios, REFS.qaSupport],
      blocker_refs: [cleanMachine],
      issue_codes: ['no-client-clean-machine-evidence-missing'],
    }),
    scenario({
      scenario_id: 'BETA-CLIENT-002',
      title: 'One supported client installed',
      status: claudeMcpbStaticReady && serviceContractPresent ? 'blocked' : 'missing',
      evidence_refs: [REFS.mcpbHelpers, REFS.serviceCommands, REFS.wizardUi, REFS.qaScenarios],
      blocker_refs: [cleanMachine, releaseApproval],
      issue_codes: ['one-client-manual-evidence-missing'],
    }),
    scenario({
      scenario_id: 'BETA-CLIENT-003',
      title: 'Existing unrelated MCP settings',
      status: serviceContractPresent ? 'blocked' : 'missing',
      evidence_refs: [REFS.mcpbHelpers, REFS.serviceCommands, REFS.qaScenarios, REFS.qaSupport],
      blocker_refs: [cleanMachine, releaseApproval],
      issue_codes: ['sibling-settings-manual-evidence-missing'],
    }),
    scenario({
      scenario_id: 'BETA-PROOF-001',
      title: 'Proof summary',
      status: proofStaticPresent ? 'blocked' : 'missing',
      evidence_refs: [REFS.wizardUi, REFS.helpUi, REFS.coreLedgerHelpers, REFS.qaScenarios],
      blocker_refs: [cleanMachine],
      issue_codes: ['proof-summary-evidence-missing'],
    }),
    scenario({
      scenario_id: 'BETA-OFFLINE-001',
      title: 'Offline launch',
      status: offlineStaticPresent ? 'blocked' : 'missing',
      evidence_refs: [REFS.serviceCommands, REFS.updateCommands, REFS.wizardUi, REFS.qaScenarios],
      blocker_refs: [cleanMachine],
      issue_codes: ['offline-relaunch-evidence-missing'],
    }),
    scenario({
      scenario_id: 'BETA-CONFIG-001',
      title: 'Config recovery',
      status: configRecoveryStaticPresent ? 'blocked' : 'missing',
      evidence_refs: [REFS.serviceCommands, REFS.wizardUi, REFS.qaSupport],
      blocker_refs: configRecoveryStaticPresent ? [cleanMachine] : [configRecovery],
      issue_codes: [configRecoveryStaticPresent ? 'config-recovery-manual-evidence-missing' : 'config-recovery-surface-missing'],
    }),
    scenario({
      scenario_id: 'BETA-CONFIG-002',
      title: 'Corrupted third-party client config',
      status: configRecoveryStaticPresent ? 'blocked' : 'missing',
      evidence_refs: [REFS.mcpbHelpers, REFS.serviceCommands, REFS.wizardUi, REFS.qaSupport],
      blocker_refs: configRecoveryStaticPresent ? [cleanMachine] : [configRecovery],
      issue_codes: [configRecoveryStaticPresent ? 'third-party-config-manual-evidence-missing' : 'third-party-config-recovery-surface-missing'],
    }),
    scenario({
      scenario_id: 'BETA-DIAG-001',
      title: 'Diagnostic bundle preview',
      status: diagnosticsStaticPresent ? 'blocked' : 'missing',
      evidence_refs: [REFS.diagnosticsCommands, REFS.wizardUi, REFS.qaScenarios, REFS.qaSupport],
      blocker_refs: [cleanMachine, supportDryRun],
      issue_codes: ['diagnostics-support-dry-run-missing'],
    }),
    scenario({
      scenario_id: 'BETA-CRASH-001',
      title: 'Crash before opt-in',
      status: crashStaticPresent ? 'blocked' : 'missing',
      evidence_refs: [REFS.crashCommands, REFS.wizardUi, REFS.qaScenarios],
      blocker_refs: [cleanMachine, supportDryRun],
      issue_codes: ['crash-reporting-manual-evidence-missing'],
    }),
    scenario({
      scenario_id: 'BETA-SIGNING-WINDOWS-001',
      title: 'Windows signing evidence',
      status: windowsSigningConfigured ? 'pending' : 'blocked',
      evidence_refs: [REFS.tauriBundle, REFS.desktopReleaseWorkflow, REFS.signingSetup, REFS.productionStatus],
      blocker_refs: [windowsSignedArtifact, signingIdentities],
      issue_codes: ['windows-signing-evidence-missing'],
    }),
    scenario({
      scenario_id: 'BETA-SIGNING-MACOS-001',
      title: 'macOS signing and notarization evidence',
      status: macosSigningConfigured ? 'pending' : 'blocked',
      evidence_refs: [REFS.tauriBundle, REFS.desktopReleaseWorkflow, REFS.signingSetup, REFS.productionStatus],
      blocker_refs: [macosNotarizedArtifact, signingIdentities],
      issue_codes: ['macos-notarization-evidence-missing'],
    }),
    scenario({
      scenario_id: 'BETA-UPDATE-001',
      title: 'Signed update and rollback evidence',
      status: updaterConfigured && updateSignerPresent ? 'blocked' : 'missing',
      evidence_refs: [REFS.tauriUpdater, REFS.updateCommands, REFS.desktopReleaseWorkflow, REFS.updateSignerScript, REFS.signingPlan],
      blocker_refs: [updateRollback, signingIdentities],
      issue_codes: ['update-rollback-rehearsal-missing'],
    }),
    scenario({
      scenario_id: 'BETA-NPM-001',
      title: 'npm package availability evidence',
      status: inputs.packageVersion === REQUIRED_PUBLIC_BETA_VERSION && npmWorkflowReady ? 'pending' : 'blocked',
      evidence_refs: [REFS.packageVersion, REFS.npmPublishWorkflow, REFS.qaSupport],
      blocker_refs: [npmPublish],
      issue_codes: ['npm-required-version-unpublished'],
    }),
    scenario({
      scenario_id: 'BETA-MERGE-001',
      title: 'Release PR approval, merge, and reviewer approval evidence',
      status: 'blocked',
      evidence_refs: [REFS.roadmap, REFS.releaseChecklist, REFS.qaSupport],
      blocker_refs: [releaseApproval, publicSafePacket],
      issue_codes: ['release-approval-evidence-missing', 'reviewer-approval-evidence-missing'],
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
  const inputs = await inspectPublicBetaQaInputs();
  const scenarios = buildScenarioRows(inputs);
  const counts = statusCounts(scenarios);
  const blockers = collectBlockers(scenarios);
  const nextActions = buildRankedNextActions(blockers);
  const readyForPublicBeta = scenarios.every((row) => row.status === 'pass');
  const ledgerSummary = summarizePublicLaunchEvidence(scenarios.map((row) => ledgerEntry(row, generatedAt)));
  const report = {
    schema: PUBLIC_BETA_QA_MATRIX_SCHEMA,
    generated_at: generatedAt,
    version: inputs.packageVersion ?? 'unknown',
    required_public_beta_version: REQUIRED_PUBLIC_BETA_VERSION,
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
  for (const action of actions) lines.push(`Next: ${action.action_id} — ${action.summary}`);
  lines.push('Boundary: local repository evidence matrix only; no PR approval, merge, npm publication, signed installer, clean-machine install, hosted service, provider deletion, model behavior, benchmark superiority, token ROI, or compliance claims.');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  const report = await buildPublicBetaQaMatrix();
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
