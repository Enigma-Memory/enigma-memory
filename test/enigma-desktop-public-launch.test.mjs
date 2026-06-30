import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CONSENT_GRANT_SCHEMA,
  MEMORY_WEATHER_REPORT_SCHEMA,
  PRIVATE_MEMORY_BUBBLE_SCHEMA,
  RECALL_VETO_DECISION_SCHEMA,
  assertMemoryControllerPublicSafe,
} from '../packages/controller/src/index.js';

const RAW_MEMORY = 'private launch-code phrase must not leave local memory';
const RAW_PROMPT = 'prompt: summarize the customer transcript';
const RAW_TRANSCRIPT = 'transcript: user said the secret token is abc123';
const RAW_PROVIDER_RESPONSE = 'provider_response: model returned private content';
const RAW_LOCAL_PATH = 'C:\\Users\\Alice\\AppData\\Local\\Enigma\\memory.db';

async function importDesktop() {
  return import('../apps/desktop/src/app.js');
}

async function readDesktopUiFile(name) {
  return readFile(new URL(`../apps/desktop-tauri/ui/${name}`, import.meta.url), 'utf8');
}
async function readDesktopShellFile(name) {
  return readFile(new URL(`../apps/desktop/src/${name}`, import.meta.url), 'utf8');
}
async function readDesktopContract() {
  return readFile(new URL('../apps/desktop/DESKTOP_CONTRACT.md', import.meta.url), 'utf8');
}


async function readDesktopTauriSource(name) {
  return readFile(new URL(`../apps/desktop-tauri/src/${name}`, import.meta.url), 'utf8');
}

async function readWebsiteFile(name) {
  return readFile(new URL(`../website/${name}`, import.meta.url), 'utf8');
}

function assertControllerPrimitiveContracts(controller) {
  assert.equal(CONSENT_GRANT_SCHEMA, 'enigma.memory_controller_grant.v1');
  assert.equal(MEMORY_WEATHER_REPORT_SCHEMA, 'enigma.memory_weather_report.v1');
  assert.equal(PRIVATE_MEMORY_BUBBLE_SCHEMA, 'enigma.private_memory_bubble.v1');
  assert.equal(RECALL_VETO_DECISION_SCHEMA, 'enigma.recall_veto_decision.v1');
  assert.equal(assertMemoryControllerPublicSafe(controller), controller);
}

function assertPublicSafe(value) {
  const text = JSON.stringify(value);
  assert.doesNotMatch(text, /private launch-code phrase/i);
  assert.doesNotMatch(text, /prompt:/i);
  assert.doesNotMatch(text, /transcript:/i);
  assert.doesNotMatch(text, /provider_response:/i);
  assert.doesNotMatch(text, /secret token/i);
  assert.doesNotMatch(text, /secret-token-value/i);
  assert.doesNotMatch(text, /C:\\\\Users\\\\Alice/i);
  assert.doesNotMatch(text, /provider deletion/i);
  assert.doesNotMatch(text, /model forgetting|make a model forget/i);
  assert.doesNotMatch(text, /provider-native memory control/i);
  assert.doesNotMatch(text, /compliance certification/i);
  assert.doesNotMatch(text, /hosted readiness/i);
  assert.doesNotMatch(text, /chain submission/i);
}

test('desktop first-run defaults to Memory Drive home dashboard', async () => {
  const { createDesktopState, renderDesktopModel, renderMemoryDriveDashboard } = await importDesktop();

  const state = createDesktopState();
  const model = renderDesktopModel(state);
  const dashboard = renderMemoryDriveDashboard(state);

  assert.equal(state.activeScreen, 'home');
  assert.equal(model.activeScreen, 'home');
  assert.equal(model.navigation[0].id, 'home');
  assert.equal(model.navigation[0].label, 'Memory Drive');
  assert.equal(model.navigation[2].id, 'support');
  assert.equal(model.navigation[2].label, 'Support report');
  assert.equal(model.screens.home.title, 'Memory Drive dashboard');
  assert.equal(model.dashboard.next_action.id, 'create_memory_drive');
  assert.equal(model.dashboard.next_action.label, 'Create Memory Drive');
  assert.equal(model.dashboard.next_action.schema, 'enigma.desktop.next_action.v1');
  assert.equal(model.dashboard.next_action.state, 'setup_needed');
  assert.equal(model.dashboard.next_action.primary_action.id, 'create_memory_drive');
  assert.equal(model.dashboard.next_action.claim_boundaries.raw_memory_returned, false);
  assert.equal(model.dashboard.next_action.claim_boundaries.local_paths_returned, false);
  assert.equal(dashboard.memory_drive_status, 'missing');
  assert.ok(model.dashboard.issue_codes.includes('MEMORY_DRIVE_MISSING'));
  assert.equal(dashboard.support_report_ready, false);
  assert.equal(dashboard.support_report_status, 'not-run');
  assert.equal(model.dashboard.memory_controller.schema, 'enigma.desktop.memory_controller_summary.v1');
  assert.equal(model.dashboard.memory_controller.memory_weather.label, 'Needs review');
  assert.equal(model.dashboard.memory_controller.app_permissions.label, 'No app has permission yet');
  assert.equal(model.dashboard.memory_controller.recall_approval.summary, 'Not shared until you approve.');
  assert.equal(model.dashboard.memory_controller.recall_approval.secondary_actions[0].id, 'approve_recall');
  assert.equal(model.dashboard.memory_controller.recall_approval.secondary_actions[1].id, 'deny_recall');
  assert.equal(model.dashboard.memory_controller.private_memory_bubble.primary_action.id, 'open_private_bubble');
  assertControllerPrimitiveContracts(model.dashboard.memory_controller);
  assert.equal(model.dashboard.import_sandbox.schema, 'enigma.desktop.import_sandbox_summary.v1');
  assert.equal(model.dashboard.import_sandbox.status, 'needs_memory_drive');
  assert.equal(model.dashboard.import_sandbox.primary_action.id, 'create_memory_drive');
  assert.equal(model.dashboard.import_sandbox.receipt_boundaries.raw_memory_returned, false);
  assert.equal(model.dashboard.import_sandbox.receipt_boundaries.provider_deletion_proof, false);
  assert.equal(model.screens.support.schema, 'enigma.desktop.support_report.v1');
  assert.equal(model.screens.support.primary_action.id, 'collect_support_report');
  assert.equal(model.screens.support.privacy_boundaries.raw_memory_returned, false);
  assert.equal(model.screens.support.privacy_boundaries.local_paths_returned, false);
  assert.equal(model.screens.support.privacy_scan.schema, 'enigma.support_privacy_scan.v1');
  assert.equal(model.screens.support.privacy_scan.status, 'not_run');
  assert.ok(model.screens.support.privacy_scan.checked_categories.includes('raw_logs'));
});

test('static desktop shell mirrors Memory Controller, Import Sandbox, and Support Report cards', async () => {
  const shell = await readDesktopShellFile('index.html');
  const contract = await readDesktopContract();
  const homeBlock = shell.match(/function renderHomeScreen\(screen\) \{[\s\S]*?\n\}/)?.[0] || '';
  const importSandboxBlock = shell.match(/function renderImportSandboxHtml\(sandbox\) \{[\s\S]*?function renderScreen/s)?.[0] || '';
  const supportBlock = shell.match(/function renderSupportScreen\(screen\) \{[\s\S]*?function renderVaultScreen/s)?.[0] || '';

  assert.match(shell, /function selectMemoryControllerSummary/);
  assert.match(shell, /function selectImportSandboxSummary/);
  assert.match(shell, /function renderSupportReportModel/);
  assert.match(shell, /function supportReportClipboardText/);
  assert.match(shell, /memory_controller: memoryController/);
  assert.match(shell, /import_sandbox: importSandbox/);
  assert.match(shell, /support: diagnostics/);
  assert.match(shell, /support_report_ready: supportReportReady/);
  assert.match(homeBlock, /Support report/);
  assert.match(shell, /Support report/);
  assert.match(shell, /renderSupportScreen\(model\.screens\.support\)/);
  assert.match(homeBlock, /Memory Controller/);
  assert.match(homeBlock, /Import Sandbox/);
  assert.match(homeBlock, /renderImportSandboxHtml\(dashboard\.import_sandbox\)/);
  assert.match(importSandboxBlock, /Provider-side proof/);
  assert.match(contract, /support_report_ready/);
  assert.match(contract, /support_report_status/);
  assert.match(importSandboxBlock, /Model-state proof/);
  assert.match(supportBlock, /Copyable safe report/);
  assert.match(supportBlock, /Privacy boundaries/);
  assert.match(supportBlock, /No raw memory, prompts, transcripts, provider responses, credentials, tokens, private keys, account identifiers, customer identifiers, raw logs, complete settings, or local paths/);
  assert.match(shell, /The shell reports local setup only; provider logs and model behavior require provider evidence/);
  assert.doesNotMatch(homeBlock, /provider deletion|model forgetting|provider-native memory control/i);
  assert.doesNotMatch(supportBlock, /provider deletion|model forgetting|provider-native memory control/i);
});

test('desktop create Memory Drive action prepares consumer dashboard without raw paths', async () => {
  const { createDesktopState, desktopReducer, createMemoryDrive, renderDesktopModel } = await importDesktop();

  const state = desktopReducer(createDesktopState(), createMemoryDrive({
    now: '2026-06-28T00:00:00.000Z',
    label: 'Memory Drive',
    local_path: RAW_LOCAL_PATH,
    body: RAW_MEMORY,
  }));
  const model = renderDesktopModel(state);

  assert.equal(state.activeScreen, 'home');
  assert.equal(state.memoryDrive.status, 'ready');
  assert.equal(state.vault.status, 'ready');
  assert.equal(model.dashboard.memory_drive_status, 'ready');
  assert.equal(model.dashboard.next_action.id, 'start_service');
  assert.equal(model.dashboard.next_action.schema, 'enigma.desktop.next_action.v1');
  assert.equal(model.dashboard.next_action.state, 'service_needed');
  assert.match(model.dashboard.next_action.plain_summary, /Start local service/);
  assert.equal(model.dashboard.memory_controller.memory_weather.primary_action.id, 'review_grants');
  assert.equal(model.dashboard.memory_controller.recall_approval.primary_action.id, 'review_recall');
  assert.equal(model.dashboard.memory_controller.recall_approval.secondary_actions[0].label, 'Approve this local recall');
  assert.equal(model.dashboard.memory_controller.recall_approval.secondary_actions[1].label, 'Keep not shared');
  assertControllerPrimitiveContracts(model.dashboard.memory_controller);
  assert.equal(model.dashboard.import_sandbox.status, 'ready');
  assert.equal(model.dashboard.import_sandbox.primary_action.id, 'preview_import');
  assert.equal(model.dashboard.import_sandbox.secondary_actions[1].id, 'rollback_import');
  assert.equal(model.dashboard.import_sandbox.receipt_boundaries.batch_receipt, 'write_refs_and_receipt_hashes_only');
  assertPublicSafe(model.dashboard);
});

test('desktop dashboard exposes one primary fix-it action', async () => {
  const {
    createDesktopState,
    desktopReducer,
    createMemoryDrive,
    updateDesktopService,
    updateDesktopHealth,
    renderMemoryDriveDashboard,
  } = await importDesktop();

  let state = desktopReducer(createDesktopState(), createMemoryDrive({ now: '2026-06-28T00:01:00.000Z' }));
  state = desktopReducer(state, updateDesktopService({ status: 'running', issue_codes: [] }, { now: '2026-06-28T00:02:00.000Z' }));
  state = desktopReducer(state, updateDesktopHealth({
    status: 'fix-needed',
    issue_codes: ['APP_PERMISSION_MISSING', 'DIAGNOSTICS_STALE'],
    prompt: RAW_PROMPT,
  }, { now: '2026-06-28T00:03:00.000Z' }));

  const dashboard = renderMemoryDriveDashboard(state);
  assert.equal(Array.isArray(dashboard.next_action), false);
  assert.equal(dashboard.next_action.id, 'fix_health');
  assert.equal(dashboard.next_action.label, 'Fix Memory Drive health');
  assert.ok(dashboard.issue_codes.includes('APP_PERMISSION_MISSING'));
  assert.equal(Array.isArray(dashboard.memory_controller.memory_weather.primary_action), false);
  assert.equal(dashboard.memory_controller.app_permissions.primary_action.id, 'review_grants');
  assert.equal(dashboard.memory_controller.recall_approval.primary_action.id, 'review_recall');
  assert.equal(dashboard.memory_controller.recall_approval.secondary_actions[0].id, 'approve_recall');
  assertControllerPrimitiveContracts(dashboard.memory_controller);
  assert.equal(dashboard.memory_controller.private_memory_bubble.primary_action.id, 'open_private_bubble');
  assert.ok(dashboard.issue_codes.includes('DIAGNOSTICS_STALE'));
  assertPublicSafe(dashboard);
});

test('desktop dashboard routes to support report before app connection', async () => {
  const {
    createDesktopState,
    desktopReducer,
    createMemoryDrive,
    updateDesktopService,
    updateDesktopHealth,
    updateDesktopDiagnostics,
    renderMemoryDriveDashboard,
  } = await importDesktop();

  let state = desktopReducer(createDesktopState(), createMemoryDrive({ now: '2026-06-28T00:04:00.000Z' }));
  state = desktopReducer(state, updateDesktopService({ status: 'running', issue_codes: [] }, { now: '2026-06-28T00:05:00.000Z' }));
  state = desktopReducer(state, updateDesktopHealth({ status: 'healthy', issue_codes: [] }, { now: '2026-06-28T00:06:00.000Z' }));

  const needsSupport = renderMemoryDriveDashboard(state);
  assert.equal(needsSupport.offline_ready, true);
  assert.equal(needsSupport.support_report_ready, false);
  assert.equal(needsSupport.next_action.id, 'collect_support_report');
  assert.equal(needsSupport.next_action.state, 'support_report_needed');
  assert.equal(needsSupport.next_action.primary_action.screen, 'support');
  assert.equal(needsSupport.next_action.reason, 'A safe support report is not ready yet.');

  state = desktopReducer(state, updateDesktopDiagnostics({
    status: 'ready',
    support_report_ready: true,
    safe_summary: ['Local service reachable'],
    issue_codes: [],
  }, { now: '2026-06-28T00:07:00.000Z' }));

  const ready = renderMemoryDriveDashboard(state);
  assert.equal(ready.support_report_ready, true);
  assert.equal(ready.support_report_status, 'ready');
  assert.equal(ready.next_action.id, 'connect_app');
  assertPublicSafe(needsSupport);
  assertPublicSafe(ready);
});


test('desktop public dashboard omits raw memory, prompts, transcripts, tokens, paths, and provider responses', async () => {
  const {
    createDesktopState,
    desktopReducer,
    createMemoryDrive,
    updateDesktopService,
    updateDesktopDiagnostics,
    updateProofActivity,
    updateDesktopUpdateStatus,
    renderDesktopModel,
    renderMemoryDriveDashboard,
  } = await importDesktop();

  let state = desktopReducer(createDesktopState(), createMemoryDrive({ now: '2026-06-28T00:04:00.000Z', path: RAW_LOCAL_PATH }));
  state = desktopReducer(state, updateDesktopService({ status: 'running', issue_codes: [] }, { now: '2026-06-28T00:05:00.000Z' }));
  state = desktopReducer(state, updateDesktopDiagnostics({
    status: 'ready',
    support_report_ready: true,
    issue_codes: ['SAFE_REPORT_READY'],
    safe_summary: ['Local service reachable', RAW_LOCAL_PATH, RAW_PROMPT, RAW_TRANSCRIPT, RAW_PROVIDER_RESPONSE, RAW_MEMORY],
    token: 'secret-token-value',
  }, { now: '2026-06-28T00:06:00.000Z' }));
  state = desktopReducer(state, updateProofActivity({
    status: 'checked',
    receipt_count: 2,
    provider_response: RAW_PROVIDER_RESPONSE,
    transcript: RAW_TRANSCRIPT,
  }, { now: '2026-06-28T00:07:00.000Z' }));
  state = desktopReducer(state, updateDesktopUpdateStatus({
    status: 'current',
    version: '1.0.0',
    path: RAW_LOCAL_PATH,
  }, { now: '2026-06-28T00:08:00.000Z' }));

  const model = renderDesktopModel(state);
  const dashboard = renderMemoryDriveDashboard(state);
  assert.equal(model.dashboard.schema, 'enigma.desktop.memory_drive_dashboard.v1');
  assert.equal(dashboard.offline_ready, true);
  assert.equal(dashboard.support_report_ready, true);
  assert.equal(dashboard.support_report_status, 'ready');
  assert.equal(dashboard.memory_controller.memory_weather.status, 'sunny');
  assert.equal(dashboard.memory_controller.app_permissions.status, 'missing');
  assert.equal(dashboard.memory_controller.recall_approval.summary, 'Not shared until you approve.');
  assert.equal(dashboard.memory_controller.recall_approval.secondary_actions[1].id, 'deny_recall');
  assertControllerPrimitiveContracts(dashboard.memory_controller);
  assert.equal(model.screens.diagnostics.safe_summary.length, 1);
  assert.deepEqual(model.screens.diagnostics.safe_summary, ['Local service reachable']);
  assert.equal(model.screens.support.support_report_ready, true);
  assert.match(model.screens.support.report_id, /^support_/);
  assert.deepEqual(model.screens.support.shareable_summary, ['Local service reachable']);
  assert.equal(model.screens.support.primary_action.id, 'copy_support_report');
  assert.equal(model.screens.support.privacy_boundaries.provider_responses_returned, false);
  assert.equal(model.screens.support.privacy_scan.status, 'pass');
  assert.equal(model.screens.support.privacy_scan.detected_private_field_count, 0);
  assert.ok(model.screens.support.privacy_scan.checked_categories.includes('auth_material'));
  assert.equal(model.screens.support.privacy_boundaries.tokens_returned, false);
  assert.equal(model.screens.support.privacy_boundaries.private_keys_returned, false);
  assert.equal(model.screens.support.privacy_boundaries.raw_logs_returned, false);
  assertPublicSafe(model);
  assertPublicSafe(model.dashboard);
  assertPublicSafe(model.screens.home);
  assertPublicSafe(model.screens.setup);
  assertPublicSafe(model.screens.diagnostics);
  assertPublicSafe(model.screens.support);
});

test('desktop unknown public-launch action fails closed', async () => {
  const { createDesktopState, desktopReducer, renderMemoryDriveDashboard } = await importDesktop();

  const initial = createDesktopState();
  const before = renderMemoryDriveDashboard(initial);
  const next = desktopReducer(initial, {
    type: 'desktop/provider-response',
    provider_response: RAW_PROVIDER_RESPONSE,
    transcript: RAW_TRANSCRIPT,
    path: RAW_LOCAL_PATH,
  });
  const after = renderMemoryDriveDashboard(next);

  assert.equal(next, initial);
  assert.equal(next.sequence, initial.sequence);
  assert.deepEqual(next.memoryDrive, initial.memoryDrive);
  assert.deepEqual(after, before);
  assertPublicSafe(after);
});

test('desktop release metadata matches prepared public beta package version', async () => {
  const [packageJsonText, tauriConfigText, cargoToml, cargoLock, wizard] = await Promise.all([
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
    readFile(new URL('../apps/desktop-tauri/tauri.conf.json', import.meta.url), 'utf8'),
    readFile(new URL('../apps/desktop-tauri/Cargo.toml', import.meta.url), 'utf8'),
    readFile(new URL('../apps/desktop-tauri/Cargo.lock', import.meta.url), 'utf8'),
    readDesktopUiFile('wizard.js'),
  ]);
  const packageJson = JSON.parse(packageJsonText);
  const tauriConfig = JSON.parse(tauriConfigText);
  assert.equal(packageJson.version, '0.1.19');
  assert.equal(tauriConfig.version, packageJson.version);
  assert.match(cargoToml, new RegExp(`^version = "${packageJson.version}"$`, 'm'));
  assert.match(cargoLock, new RegExp(`name = "enigma-desktop-tauri"\\nversion = "${packageJson.version}"`));
  assert.match(wizard, /current_version: '0\.1\.19'/);
  assert.match(wizard, /\|\| '0\.1\.19'/);
});

test('desktop Tauri dashboard exposes Memory Controller and Import Sandbox consumer controls', async () => {
  const [wizard, help, styles, tauriService, tauriLib] = await Promise.all([
    readDesktopUiFile('wizard.js'),
    readDesktopUiFile('help.js'),
    readDesktopUiFile('styles.css'),
    readDesktopTauriSource('commands/service.rs'),
    readDesktopTauriSource('lib.rs'),
  ]);
  const ui = `${wizard}\n${help}\n${styles}`;
  const runHealthBlock = wizard.match(/case 'run-health': \{[\s\S]*?return;\n    \}/)?.[0] || '';
  const approveImportBlock = wizard.match(/case 'approve-import-text': \{[\s\S]*?return;\n    \}/)?.[0] || '';
  const renderClientActionsBlock = wizard.match(/function renderClientActions\(client, status\) \{[\s\S]*?\n\}/)?.[0] || '';
  const renderDashboardBlock = wizard.match(/function renderDashboard\(\) \{[\s\S]*?\n\}/)?.[0] || '';
  const dashboardNextActionBlock = wizard.match(/function dashboardNextAction\(\{[\s\S]*?\n\}/)?.[0] || '';
  const safeWizardStepBlock = wizard.match(/function safeWizardStep\(value\) \{[\s\S]*?\n\}/)?.[0] || '';
  const renderReadyBlock = wizard.match(/function renderReady\(\) \{[\s\S]*?\n\}/)?.[0] || '';
  const renderBlock = wizard.match(/function render\(\) \{[\s\S]*?\n\}/)?.[0] || '';

  assert.match(wizard, /Install this app, then select Scan apps/);
  assert.match(wizard, /Connection needs repair/);
  assert.doesNotMatch(renderClientActionsBlock, /disabled>Unavailable/);
  assert.doesNotMatch(wizard, /unrelated MCP settings|Malformed config|Local connector config|connector is malformed|malformed connector settings|config details|config was written|config change|Writes performed|Advanced config preview|Claude config|config JSON/);
  assert.match(help, /The app's other connection settings are preserved/);
  assert.doesNotMatch(help, /MCP settings|client config is malformed/);
  assert.match(wizard, /Memory Controller/);
  assert.match(wizard, /Memory Weather/);
  assert.match(wizard, /App permissions/);
  assert.match(wizard, /Recall approval/);
  assert.match(wizard, /Private memory bubble/);
  assert.match(wizard, /Not shared until you approve/);
  assert.match(wizard, /primaryButton\(item\.action\.label, item\.action\.action\)/);
  assert.match(wizard, /review-grants/);
  assert.match(wizard, /open-private-bubble/);
  assert.match(wizard, /close-private-bubble/);
  assert.match(wizard, /review-recall/);
  assert.match(wizard, /approve-recall/);
  assert.match(wizard, /deny-recall/);
  assert.match(wizard, /recallReviewOpen = true/);
  assert.doesNotMatch(wizard, /recallReviewed = true/);
  assert.match(wizard, /One next step/);
  assert.match(wizard, /dashboardNextAction/);
  assert.match(wizard, /renderNextActionSection/);
  assert.match(wizard, /normalizeMemoryDriveStatus/);
  assert.match(wizard, /offlineReady = serviceRunning && health\.offline_ready === true/);
  assert.match(wizard, /dashboardNextAction\(\{ memoryDriveStatus, offlineReady, serviceRunning, updateAvailable \}\)/);
  assert.doesNotMatch(wizard.match(/case 'create-vault': \{[\s\S]*?return;\n    \}/)?.[0] || '', /call\('create_vault'\)/);
  assert.doesNotMatch(wizard, /choose-location|Choose a different location|Location chooser would open here/);
  assert.match(wizard, /WIZARD_STORAGE_KEY/);
  assert.match(wizard, /restoreWizardResumeState/);
  assert.match(wizard, /persistWizardResumeState/);
  assert.match(wizard, /safeWizardStep/);
  assert.match(wizard, /let readyGate = \{ status: 'not_checked'/);
  assert.match(safeWizardStepBlock, /return bounded === 5 \? 4 : bounded/);
  assert.match(renderReadyBlock, /Ready is shown only after the current Memory Drive health check and local engine check pass/);
  assert.match(wizard, /function readyGateFromCurrentState/);
  assert.match(wizard, /function readyGatePassed/);
  assert.match(renderBlock, /currentStep === 5/);
  assert.match(renderBlock, /readyGatePassed\(\)/);
  assert.match(renderBlock, /currentStep = 4/);
  assert.match(runHealthBlock, /readyGate = readyGateFromCurrentState\('Health check passed for the current Memory Drive and local engine\.'\)/);
  assert.doesNotMatch(wizard.match(/function persistWizardResumeState\(\) \{[\s\S]*?\n\}/)?.[0] || '', /pendingText|local absolute|raw memory/i);
  assert.match(wizard, /No raw memory, local paths, provider responses, or outside-Enigma control claims/);
  assert.match(wizard, /Import Sandbox/);
  assert.match(wizard, /Paste plain text or Markdown/);
  assert.match(wizard, /duplicate groups/);
  assert.match(wizard, /Batch receipt returned without raw memory text/);
  assert.match(wizard, /preview-import-text/);
  assert.match(wizard, /approve-import-text/);
  assert.match(wizard, /clear-import-text/);
  assert.match(wizard, /rollback-import-text/);
  assert.match(wizard, /Rollback last import/);
  assert.match(wizard, /copy-import-receipt/);
  assert.match(wizard, /Copy import receipt/);
  assert.match(wizard, /publicImportReceiptClipboardText/);
  assert.match(wizard, /Import receipt copied without raw memory or local paths/);
  assert.match(wizard.match(/function publicImportReceiptClipboardText\(result = null, rollback = null\) \{[\s\S]*?\n\}/)?.[0] || '', /Enigma import batch receipt/);
  assert.match(wizard.match(/function publicImportReceiptClipboardText\(result = null, rollback = null\) \{[\s\S]*?\n\}/)?.[0] || '', /Enigma import rollback receipt/);
  assert.match(wizard, /importReady = preview\?\.import_decision === 'ready_for_import'/);
  assert.match(wizard, /\$\{escapeHtml\(importSandbox\.pendingText \|\| ''\)\}<\/textarea>/);
  assert.match(wizard, /Review required before writing/);
  assert.match(approveImportBlock, /importSandbox\.preview\.import_decision !== 'ready_for_import'/);
  assert.ok(approveImportBlock.indexOf("import_decision !== 'ready_for_import'") < approveImportBlock.indexOf("call('approve_import_text'"));
  assert.match(wizard, /Import rollback complete/);
  assert.match(wizard, /test-connection/);
  assert.match(wizard, /test_client_config/);
  assert.match(wizard, /App connection test complete/);
  assert.match(tauriService, /pub async fn test_client_config/);
  assert.match(tauriService, /provider_launched": false/);
  assert.match(tauriLib, /commands::service::test_client_config/);
  assert.match(wizard, /Preview connection/);
  assert.match(wizard, /preview_client_config/);
  assert.match(wizard, /Approve connection/);
  assert.match(wizard, /approve-connect/);
  assert.match(wizard.match(/case 'connect': \{[\s\S]*?return;\n    \}/)?.[0] || '', /preview_client_config/);
  assert.doesNotMatch(wizard.match(/case 'connect': \{[\s\S]*?return;\n    \}/)?.[0] || '', /connect_client/);
  assert.match(wizard.match(/case 'approve-connect': \{[\s\S]*?return;\n    \}/)?.[0] || '', /connect_client/);
  assert.match(tauriService, /pub async fn preview_client_config/);
  assert.match(tauriService, /preview_connect/);
  assert.match(tauriService, /ConnectOptions::dry_run/);
  assert.match(tauriService, /"writes_performed": false/);
  assert.match(wizard, /Preview disconnect/);
  assert.match(wizard, /preview_disconnect_client/);
  assert.match(wizard, /Approve disconnect/);
  assert.match(wizard, /disconnect-preview/);
  assert.match(wizard.match(/case 'disconnect': \{[\s\S]*?return;\n    \}/)?.[0] || '', /preview_disconnect_client/);
  assert.doesNotMatch(wizard.match(/case 'disconnect': \{[\s\S]*?return;\n    \}/)?.[0] || '', /call\('disconnect_client'/);
  assert.match(wizard.match(/case 'approve-disconnect': \{[\s\S]*?return;\n    \}/)?.[0] || '', /disconnect_client/);
  assert.match(tauriService, /pub async fn preview_disconnect_client/);
  assert.match(tauriService, /preview_disconnect/);
  assert.match(tauriService, /"removes_only_enigma_entry": true/);
  assert.match(tauriLib, /commands::service::preview_disconnect_client/);
  assert.match(wizard, /Claude extension handoff/);
  assert.match(wizard, /claude-mcpb-handoff/);
  assert.match(wizard, /get_claude_mcpb_handoff/);
  assert.match(wizard, /Enigma did not write Claude settings/);
  assert.match(wizard, /enigma\.desktop_claude_mcpb_handoff\.v1/);
  assert.match(wizard, /Connect with Claude extension/);
  assert.match(wizard, /Advanced setup preview/);
  assert.ok(renderClientActionsBlock.indexOf('claude-mcpb-handoff') < renderClientActionsBlock.indexOf('Advanced setup preview'));
  assert.match(wizard, /Remove or disable later/);
  assert.match(wizard, /Return here and run Test connection/);
  assert.match(wizard, /If the extension path is unavailable, use Advanced setup preview/);
  assert.match(wizard, /Open the Enigma Claude extension package in Claude Desktop, then test the connection/);
  assert.match(wizard, /Enigma does not write Claude settings for this extension handoff/);
  assert.match(wizard, /claudeMcpbClipboardText/);
  assert.match(wizard, /data-action="copy-claude-steps"/);
  assert.match(wizard, /Copy Claude install steps/);
  assert.match(wizard, /Claude install steps copied without local paths or setup files/);
  assert.match(wizard.match(/function claudeMcpbClipboardText\(handoff = \{\}\) \{[\s\S]*?\n\}/)?.[0] || '', /No local paths, setup files, provider responses, raw memory/);
  assert.doesNotMatch(wizard, /Config fallback test/);
  assert.match(tauriService, /pub async fn get_claude_mcpb_handoff/);
  assert.match(tauriService, /create_claude_desktop_mcpb_connection_plan/);
  assert.match(tauriService, /create_claude_desktop_mcpb_manifest/);
  assert.match(tauriService, /"preferred_path": "mcpb_extension"/);
  assert.match(tauriService, /"enigma_writes_claude_config": false/);
  assert.match(tauriLib, /commands::service::get_claude_mcpb_handoff/);
  assert.match(tauriLib, /commands::service::preview_client_config/);
  assert.match(styles, /connection-preview/);
  assert.match(wizard, /hydrateDashboardState/);
  assert.match(wizard, /Promise\.allSettled/);
  assert.match(wizard, /call\('get_health'\)/);
  assert.match(wizard, /call\('get_service_status'\)/);
  assert.doesNotMatch(wizard, /call\('get_service_logs'/);
  assert.match(wizard, /call\('get_diagnostics'\)/);
  assert.match(wizard, /call\('check_update'\)/);
  assert.match(wizard, /currentStep === 6/);
  assert.match(dashboardNextActionBlock, /action: 'refresh-proof-activity'/);
  assert.match(renderDashboardBlock, /Local engine/);
  assert.match(renderDashboardBlock, /Collect support summary/);
  assert.doesNotMatch(renderDashboardBlock, /log-view|Refresh logs|Shutdown service|\bpid\b|Uptime|Restarts|Stop engine|Engine service/i);
  assert.doesNotMatch(wizard, /case 'view-logs'|case 'shutdown'|case 'stop-service'/);
  assert.doesNotMatch(styles, /log-view/);
  assert.match(runHealthBlock, /call\('start_service'\)/);
  assert.match(runHealthBlock, /health = await call\('get_health'\);[\s\S]*serviceStatus = await call\('start_service'\);[\s\S]*health = await call\('get_health'\);/);
  assert.ok(runHealthBlock.indexOf("call('start_service')") < runHealthBlock.indexOf('currentStep = 5'));
  assert.match(wizard.match(/case 'go-dashboard': \{[\s\S]*?return;\n    \}/)?.[0] || '', /hydrateDashboardState/);
  assert.match(wizard.match(/async function init\(\) \{[\s\S]*?\n\}/)?.[0] || '', /hydrateDashboardState/);
  assert.match(tauriService, /pub async fn preview_import_text/);
  assert.match(tauriService, /pub async fn approve_import_text/);
  assert.match(tauriService, /import-sandbox-/);
  assert.match(tauriService, /pub async fn rollback_import_text/);
  assert.match(tauriService, /enigma\.desktop_import_rollback_surface\.v1/);
  assert.match(tauriLib, /commands::service::preview_import_text/);
  assert.match(tauriLib, /commands::service::approve_import_text/);
  assert.match(tauriLib, /commands::service::rollback_import_text/);
  assert.match(wizard, /Proof Activity/);
  assert.match(wizard, /What Enigma can prove locally/);
  assert.match(wizard, /refresh-proof-activity/);
  assert.match(wizard, /export-proof-activity/);
  assert.match(wizard, /Export proof activity/);
  assert.match(wizard, /copy-proof-summary/);
  assert.match(wizard, /Copy proof summary/);
  assert.match(wizard, /publicProofClipboardText/);
  assert.match(wizard, /Proof summary copied/);
  assert.match(wizard, /Proof counts and roots remain visible/);
  assert.match(wizard, /Proof activity exported/);
  assert.match(wizard, /enigma\.desktop_proof_activity\.v1/);
  assert.match(tauriService, /pub async fn get_proof_activity/);
  assert.match(tauriService, /local_counts_and_roots_only/);
  assert.match(wizard, /`Verifier: \$\{activity\.verifier_status \|\| 'not_run'\}`/);
  assert.match(wizard, /`Evidence: \$\{activity\.evidence_status \|\| 'local_counts_and_roots_only'\}`/);
  assert.match(wizard, /Not-shared\/tombstoned local memories/);
  assert.match(wizard, /provider non-use/);
  assert.match(tauriService, /provider_non_use_proof": false/);
  assert.match(tauriService, /pub async fn export_proof_activity/);
  assert.match(tauriService, /enigma\.desktop_proof_activity_export\.v1/);
  assert.match(tauriLib, /commands::service::get_proof_activity/);
  assert.match(tauriLib, /commands::service::export_proof_activity/);
  assert.match(wizard, /publicExportScanStatus/);
  assert.match(wizard, /Privacy scan:/);
  assert.match(wizard, /privacy_scan_blocked/);
  assert.match(tauriService, /desktop_public_export_privacy_scan/);
  assert.match(tauriService, /ensure_desktop_public_export_allowed/);
  assert.match(tauriService, /enigma\.desktop_public_export_privacy_scan\.v1/);
  assert.match(tauriService, /detected_private_field_count/);
  assert.match(tauriService, /tokens_denied/);
  assert.match(tauriService, /account_identifiers_denied/);
  assert.match(tauriService, /raw_logs_denied/);
  assert.match(tauriService, /Desktop export privacy scan blocked/);
  assert.match(wizard, /Support summary/);
  assert.match(wizard, /Shareable status without private memory/);
  assert.match(wizard, /collect-support-summary/);
  assert.match(wizard, /copy-support-code/);
  assert.match(wizard, /Copy support code/);
  assert.match(wizard, /copy-support-summary/);
  assert.match(wizard, /Copy support summary/);
  assert.match(wizard, /publicSupportClipboardText/);
  assert.match(wizard, /Support summary copied without raw memory, app settings, or local paths/);
  assert.match(wizard.match(/function publicSupportClipboardText\(summary = \{\}\) \{[\s\S]*?\n\}/)?.[0] || '', /no raw memory, prompts, transcripts, credentials, tokens, private keys, account identifiers, customer identifiers, raw logs, provider responses, complete app settings, or local paths/);
  assert.match(wizard, /navigator\.clipboard\.writeText/);
  assert.match(wizard, /Support code copied/);
  assert.match(wizard, /Clipboard copy is unavailable/);
  assert.match(wizard, /export-support-summary/);
  assert.match(wizard, /Export support summary/);
  assert.match(wizard, /Support summary exported/);
  assert.match(wizard, /get_support_summary/);
  assert.match(tauriService, /pub async fn get_support_summary/);
  assert.match(tauriService, /enigma\.desktop_support_summary_surface\.v1/);
  assert.match(tauriService, /pub async fn export_support_summary/);
  assert.match(tauriService, /enigma\.desktop_support_summary_export\.v1/);
  assert.match(tauriLib, /commands::service::get_support_summary/);
  assert.match(tauriLib, /commands::service::export_support_summary/);
  assert.match(tauriService, /privacy_scan_status/);
  assert.match(tauriService, /export_allowed/);
  assert.match(tauriService, /connector_card_status/);
  assert.match(tauriService, /recommended_action/);
  assert.match(tauriService, /repair_reasons/);
  assert.match(tauriService, /parse_error/);
  assert.match(tauriService, /restart_guidance/);
  assert.match(help, /just-in-time consent/i);
  assert.match(help, /Setup has six short steps/i);
  assert.match(wizard, /Read it like a traffic light/i);
  assert.match(help, /Read the section like a traffic light/i);
  assert.match(help, /Review alone never shares memory/i);
  assert.match(help, /local review space/i);
  assert.match(help, /Import Sandbox previews text, Markdown, and provider exports/i);
  assert.match(styles, /memory-controller-grid/);
  assert.match(styles, /memory-controller__plain-language/);
  assert.match(styles, /controller-tile__actions/);
  assert.doesNotMatch(ui, /provider-side control/i);
  assert.doesNotMatch(ui, /provider deletion/i);
  assert.doesNotMatch(ui, /model forgetting|make a model forget/i);
  assert.doesNotMatch(ui, /provider-native memory control/i);
  assert.doesNotMatch(ui, /compliance certification/i);
  assert.doesNotMatch(ui, /hosted readiness/i);
  assert.doesNotMatch(ui, /chain submission/i);
  assert.doesNotMatch(ui, /private launch-code phrase/i);
  assert.doesNotMatch(ui, /C:\\\\Users\\\\Alice/i);
  assert.doesNotMatch(ui, /abc123/i);
  assert.doesNotMatch(ui, /summarize the customer transcript/i);
  assert.doesNotMatch(ui, /secret token/i);
  assert.doesNotMatch(ui, /model returned private content/i);
});

test('public website explains consumer install path without unsupported claims', async () => {
  const [home, download, setup, privacy, proofs, vaultNotReady, websiteStyles, help, launchStatus, installGuide, macosInstall, windowsInstall, connectApps, claudeConnect, cursorConnect, otherClients, troubleshooting, clientNotDetected, removalGuide, faq, developerCli, readme, installAnywhere, clientConnectors, developerEcosystem, publicApiReference, onboardingUx, qaSmokeScenarios, codeSigningSetup, productionReadinessStatus, supportPlaybooks] = await Promise.all([
    readWebsiteFile('index.html'),
    readWebsiteFile('download.html'),
    readWebsiteFile('setup.html'),
    readWebsiteFile('privacy.html'),
    readWebsiteFile('proofs.html'),
    readWebsiteFile('help/troubleshooting/vault-not-ready.html'),
    readWebsiteFile('styles.css'),
    readWebsiteFile('help/index.html'),
    readWebsiteFile('launch-status.html'),
    readWebsiteFile('help/install.html'),
    readWebsiteFile('help/install/macos.html'),
    readWebsiteFile('help/install/windows.html'),
    readWebsiteFile('help/connect-apps.html'),
    readWebsiteFile('help/connect-apps/claude-desktop.html'),
    readWebsiteFile('help/connect-apps/cursor.html'),
    readWebsiteFile('help/connect-apps/other-supported-clients.html'),
    readWebsiteFile('help/troubleshooting.html'),
    readWebsiteFile('help/troubleshooting/client-not-detected.html'),
    readWebsiteFile('help/remove-enigma.html'),
    readWebsiteFile('faq.html'),
    readWebsiteFile('developers/cli.html'),
    readFile(new URL('../README.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/install-anywhere.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/client-connectors.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/developer-ecosystem.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/public-api-reference.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/public-launch/consumer-onboarding-ux.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/public-launch/qa-smoke-scenarios.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/public-launch/code-signing-setup.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/public-launch/production-readiness-status.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/public-launch/support-playbooks.md', import.meta.url), 'utf8'),
  ]);
  const publicProofDocs = (await Promise.all([
    readFile(new URL('../docs/demo-proof-network.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/developer-proof-quickstart.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/proof-network-demo-video-script.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/proof-network-launch-plan.md', import.meta.url), 'utf8'),
  ])).join('\n');
  const publicWebsite = `${home}\n${download}\n${setup}\n${privacy}\n${proofs}\n${vaultNotReady}\n${help}\n${launchStatus}\n${installGuide}\n${macosInstall}\n${windowsInstall}\n${connectApps}\n${claudeConnect}\n${cursorConnect}\n${otherClients}\n${troubleshooting}\n${clientNotDetected}\n${removalGuide}\n${faq}`;
  const funnelSpec = `${publicWebsite}\n${onboardingUx}`;
  const vaultBeforeAdvanced = vaultNotReady.slice(0, vaultNotReady.indexOf('Advanced command-line repair'));
  const installAnywhereDefault = installAnywhere.slice(0, installAnywhere.indexOf('## Advanced path: install with npm'));

  assert.match(home, /Check installer status/);
  assert.doesNotMatch(home, /Download the desktop app/);
  assert.match(home, /Signed installers are not ready yet/);
  assert.match(home, /Create your Memory Drive/);
  assert.match(home, /Connect an AI app/);
  assert.match(download, /Signed installers are not ready yet/);
  assert.match(download, /Windows signed installer is not ready yet/);
  assert.match(download, /Signed Windows and macOS installers are not ready yet/);
  assert.match(download, /When you have an installer/);
  assert.match(download, /open Enigma Memory/i);
  assert.doesNotMatch(download, /Azure Artifact Signing|eligible paid Azure subscription|free\/trial\/sponsored/i);
  assert.doesNotMatch(download, /signed installers are ready|signed-ready|download-ready/i);
  assert.match(setup, /Four screens\. No terminal\. No JSON\./);
  assert.match(setup, /Create Memory Drive/);
  assert.doesNotMatch(setup, /Create local vault/);
  assert.match(setup, /Preview, then approve/);
  assert.match(qaSmokeScenarios, /Wizard creates\/detects the Memory Drive/);
  assert.match(qaSmokeScenarios, /Memory Drive behavior/);
  assert.match(qaSmokeScenarios, /preserving Memory Drive and connector settings/);
  assert.doesNotMatch(qaSmokeScenarios, /local vault|kept vault|preserving vault/i);
  assert.match(setup, /Enigma shows what it will change before you approve/);
  assert.match(setup, /Memory Drive dashboard/);
  assert.doesNotMatch(setup, /connection boundary|local client config|Enigma-controlled vault|local app location|manual MCP JSON/i);
  assert.doesNotMatch(publicWebsite, /local vault|vault bundle|Create local vault|local app location/i);
  assert.match(home, /Memory Drive and app connections are ready/);
  assert.match(setup, /private Memory Drive on this computer/);
  assert.match(setup, /whether your Memory Drive and connections are ready/);
  assert.doesNotMatch(publicWebsite, /Where is my vault|Vault not ready|Repair vault|raw vault files|your vault|vault and app connections|vault and connections/i);
  assert.match(readme, /Enigma creates a local Memory Drive/);
  assert.match(readme, /canonical Memory Drive on your device/);
  assert.match(readme, /Memory Drive state, receipts, checkpoints/);
  assert.doesNotMatch(readme.slice(0, readme.indexOf('## Developer CLI')), /local vault|canonical vault|Enigma-controlled vault/i);
  assert.doesNotMatch(developerCli, /--overwrite/);
  assert.match(developerCli, /enigma claude-mcpb package --plain/);
  assert.match(websiteStyles, /setup-map/);
  assert.doesNotMatch(readme, /setup --bundle "\$ENIGMA_BUNDLE_FILE" --client auto --connect-installed --overwrite/);
  assert.match(readme, /enigma quickstart --bundle "\$ENIGMA_BUNDLE_FILE"/);
  assert.match(readme, /enigma claude-mcpb package --plain/);
  assert.doesNotMatch(installAnywhere, /setup --client auto --connect-installed --overwrite/);
  assert.doesNotMatch(installAnywhereDefault, /canonical vault|local vault|vault bundle|Enigma-controlled local app location/i);
  assert.match(installAnywhereDefault, /If Gatekeeper appears, stop and check launch status again/);
  assert.match(installAnywhereDefault, /If SmartScreen appears, cancel the prompt and check launch status again/);
  assert.doesNotMatch(installAnywhereDefault, /right-click and choose Open|More info, then Run anyway|click More info/i);
  assert.match(supportPlaybooks, /cancel the SmartScreen prompt and check the Enigma launch-status page/);
  assert.match(supportPlaybooks, /stop at the Gatekeeper prompt and check the Enigma launch-status page/);
  assert.doesNotMatch(supportPlaybooks, /right-click it and choose|More info.*Run anyway|click \*\*More info\*\*/i);
  assert.match(installAnywhere, /enigma quickstart --bundle \.\/\.enigma\/bundle\.json/);
  assert.match(installAnywhere, /enigma claude-mcpb package --plain/);
  assert.doesNotMatch(clientConnectors, /setup --client auto --connect-installed --overwrite/);
  assert.match(clientConnectors, /Preview one intended client first/);
  assert.match(clientConnectors, /enigma claude-mcpb package/);
  assert.doesNotMatch(developerEcosystem, /setup --client auto --connect-installed --overwrite/);
  assert.doesNotMatch(developerEcosystem, /npx enigma setup --overwrite/);
  assert.match(developerEcosystem, /enigma quickstart --bundle \.\/\.enigma\/bundle\.json/);
  assert.match(developerEcosystem, /enigma claude-mcpb package --plain/);
  assert.doesNotMatch(publicApiReference, /quickstart --bundle \.\/\.enigma\/bundle\.json --overwrite/);
  assert.doesNotMatch(publicProofDocs, /test-drive --overwrite/);
  assert.doesNotMatch(publicProofDocs, /test-drive\s+\\\n\s+--out-dir [^\n]+\\\n\s+--overwrite/);
  assert.match(publicProofDocs, /npx --yes --package enigma-memory enigma test-drive/);
  assert.match(publicApiReference, /enigma quickstart --bundle \.\/\.enigma\/bundle\.json/);
  assert.match(publicApiReference, /enigma claude-mcpb package --plain/);
  assert.match(publicApiReference, /enigma connect cursor --bundle \.\/\.enigma\/bundle\.json --dry-run/);
  assert.match(faq, /help\/troubleshooting\/vault-not-ready\.html/);
  assert.match(faq, /Memory Drive not ready guide/);
  assert.match(faq, /Restore from backup, Safe reset/);
  assert.doesNotMatch(faq, /Run Repair vault|Vault not ready|Where is my vault/);
  assert.match(troubleshooting, /Create Memory Drive/);
  assert.match(troubleshooting, /Repair Memory Drive/);
  assert.doesNotMatch(troubleshooting, /Create local vault|local vault bundle|Repair vault/);
  assert.match(vaultNotReady, /Memory Drive not ready/);
  assert.match(vaultNotReady, /repair buttons inside the desktop app/);
  assert.match(vaultNotReady, /Advanced command-line repair/);
  assert.ok(vaultNotReady.indexOf('<strong>Repair Memory Drive</strong>') < vaultNotReady.indexOf('Advanced command-line repair'));
  assert.doesNotMatch(vaultNotReady, /Repair vault|Enigma vault|cannot open the vault|whether the vault/);
  assert.doesNotMatch(vaultBeforeAdvanced, /readable|writable|app data folder|corrupted|app config/i);
  assert.match(websiteStyles, /first-run-map/);
  assert.match(help, /Start here/);
  assert.match(help, /You should not need Node, npm, terminal commands, or JSON edits/);
  assert.match(launchStatus, /How this page stays public-safe/);
  assert.doesNotMatch(launchStatus, /GitHub Releases|code-signing-setup|production-readiness-status/);
  assert.match(launchStatus, /Windows trusted installer/);
  assert.match(launchStatus, /General consumer download/);
  assert.doesNotMatch(launchStatus, /Azure|Artifact Signing|free\/trial\/sponsored|eligible paid subscription|Public Trust|repository custody path/i);
  for (const scenarioId of ['BETA-CLIENT-CLAUDE-001', 'BETA-SIGNING-WINDOWS-001', 'BETA-SIGNING-MACOS-001', 'BETA-UPDATE-001', 'BETA-NPM-001', 'BETA-MERGE-001']) {
    assert.match(qaSmokeScenarios, new RegExp(scenarioId));
  }
  assert.doesNotMatch(qaSmokeScenarios, /GA-UPDATE-001/);
  assert.match(codeSigningSetup, /do not by themselves prove that SmartScreen/);
  assert.doesNotMatch(codeSigningSetup, /prevent SmartScreen warnings/);
  assert.match(productionReadinessStatus, /public beta and GA blockers/);
  assert.match(productionReadinessStatus, /9\/9 pass/);
  assert.match(productionReadinessStatus, /696\/696 pass/);
  assert.match(installGuide, /when your platform is marked ready/);
  assert.match(macosInstall, /when signing is ready/);
  assert.match(windowsInstall, /when signing is ready/);
  assert.doesNotMatch(publicWebsite, /Download the (macOS|Windows) installer from the/);
  assert.match(connectApps, /See setup walkthrough/);
  assert.doesNotMatch(connectApps, /Open Connections in Enigma/);
  assert.match(otherClients, /Desktop-detected path/);
  assert.match(otherClients, /Preview connection/);
  assert.match(connectApps, /No supported apps found yet/);
  assert.match(connectApps, /Continue without apps/);
  assert.match(connectApps, /Do not use manual settings unless support asks/);
  assert.match(clientNotDetected, /No supported apps found yet/);
  assert.match(clientNotDetected, /Continue without apps/);
  assert.match(clientNotDetected, /If an installed app is missing/);
  assert.match(connectApps, /local helper/);
  assert.match(claudeConnect, /advanced manual settings/);
  assert.match(claudeConnect, /Claude Desktop Extension \(\.mcpb\)/);
  assert.match(claudeConnect, /Settings → Extensions/);
  assert.match(claudeConnect, /Enigma does not write Claude settings for this extension handoff/);
  assert.match(claudeConnect, /enigma_support_summary/);
  assert.match(claudeConnect, /enigma_next_action/);
  assert.match(claudeConnect, /Disconnect Claude Desktop/);
  assert.doesNotMatch(claudeConnect, /previews the settings change|click <strong>Connect<\/strong>|Review the preview of the settings change/);
  assert.match(cursorConnect, /connection change in plain language/);
  assert.match(otherClients, /advanced compatible apps/);
  assert.match(troubleshooting, /settings area/);
  assert.match(clientNotDetected, /advanced manual settings/);
  assert.doesNotMatch(publicWebsite, /MCP settings change|MCP entry|MCP JSON|local MCP server|Manual MCP configuration|client config directory|complete client config files/i);
  assert.match(help, /Remove Enigma safely/);
  assert.match(removalGuide, /Remove Enigma without losing your Memory Drive by accident/);
  assert.match(removalGuide, /Disconnecting Enigma from an app affects Enigma-controlled local connector setup only/);
  assert.match(removalGuide, /Full removal is separate and destructive/);
  assert.match(faq, /safe removal guide/);
  assert.match(onboardingUx, /Download the desktop app → create your Memory Drive → connect a supported AI app/);
  assert.match(funnelSpec, /Public copy must not imply signed distribution is complete until release evidence proves it/);
  assertPublicSafe(publicWebsite);
});
