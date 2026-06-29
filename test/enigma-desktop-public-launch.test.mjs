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
  assert.equal(dashboard.memory_controller.memory_weather.status, 'sunny');
  assert.equal(dashboard.memory_controller.app_permissions.status, 'missing');
  assert.equal(dashboard.memory_controller.recall_approval.summary, 'Not shared until you approve.');
  assert.equal(dashboard.memory_controller.recall_approval.secondary_actions[1].id, 'deny_recall');
  assertControllerPrimitiveContracts(dashboard.memory_controller);
  assert.equal(model.screens.diagnostics.safe_summary.length, 1);
  assert.deepEqual(model.screens.diagnostics.safe_summary, ['Local service reachable']);
  assertPublicSafe(model);
  assertPublicSafe(model.dashboard);
  assertPublicSafe(model.screens.home);
  assertPublicSafe(model.screens.setup);
  assertPublicSafe(model.screens.diagnostics);
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
  assert.match(wizard, /WIZARD_STORAGE_KEY/);
  assert.match(wizard, /restoreWizardResumeState/);
  assert.match(wizard, /persistWizardResumeState/);
  assert.match(wizard, /safeWizardStep/);
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
  assert.match(wizard, /Import rollback complete/);
  assert.match(wizard, /test-connection/);
  assert.match(wizard, /test_client_config/);
  assert.match(wizard, /Local connector test complete/);
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
  assert.match(wizard, /Enigma did not write Claude config/);
  assert.match(wizard, /enigma\.desktop_claude_mcpb_handoff\.v1/);
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
  assert.match(wizard, /call\('get_service_logs'/);
  assert.match(wizard, /call\('get_diagnostics'\)/);
  assert.match(wizard, /call\('check_update'\)/);
  assert.match(wizard, /currentStep === 6/);
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
  assert.match(tauriService, /Desktop export privacy scan blocked/);
  assert.match(wizard, /Support summary/);
  assert.match(wizard, /Shareable status without private memory/);
  assert.match(wizard, /collect-support-summary/);
  assert.match(wizard, /copy-support-code/);
  assert.match(wizard, /Copy support code/);
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
  const [home, download, setup, websiteStyles, help, launchStatus, installGuide, macosInstall, windowsInstall, connectApps, otherClients, removalGuide, faq, developerCli, readme, installAnywhere, clientConnectors, onboardingUx] = await Promise.all([
    readWebsiteFile('index.html'),
    readWebsiteFile('download.html'),
    readWebsiteFile('setup.html'),
    readWebsiteFile('styles.css'),
    readWebsiteFile('help/index.html'),
    readWebsiteFile('launch-status.html'),
    readWebsiteFile('help/install.html'),
    readWebsiteFile('help/install/macos.html'),
    readWebsiteFile('help/install/windows.html'),
    readWebsiteFile('help/connect-apps.html'),
    readWebsiteFile('help/connect-apps/other-supported-clients.html'),
    readWebsiteFile('help/remove-enigma.html'),
    readWebsiteFile('faq.html'),
    readWebsiteFile('developers/cli.html'),
    readFile(new URL('../README.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/install-anywhere.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/client-connectors.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/public-launch/consumer-onboarding-ux.md', import.meta.url), 'utf8'),
  ]);
  const publicWebsite = `${home}\n${download}\n${setup}\n${help}\n${launchStatus}\n${installGuide}\n${macosInstall}\n${windowsInstall}\n${connectApps}\n${otherClients}\n${removalGuide}\n${faq}`;
  const funnelSpec = `${publicWebsite}\n${onboardingUx}`;

  assert.match(home, /Download the desktop app/);
  assert.match(home, /Create your Memory Drive/);
  assert.match(home, /Connect an AI app/);
  assert.match(download, /After the download/);
  assert.match(download, /open Enigma Memory/i);
  assert.match(setup, /Four screens\. No terminal\. No JSON\./);
  assert.match(setup, /Create Memory Drive/);
  assert.match(setup, /Preview, then approve/);
  assert.match(setup, /Memory Drive dashboard/);
  assert.doesNotMatch(developerCli, /--overwrite/);
  assert.match(developerCli, /enigma connect claude-desktop --bundle \.\/\.enigma\/bundle\.json --dry-run/);
  assert.match(websiteStyles, /setup-map/);
  assert.doesNotMatch(readme, /setup --bundle "\$ENIGMA_BUNDLE_FILE" --client auto --connect-installed --overwrite/);
  assert.match(readme, /enigma quickstart --bundle "\$ENIGMA_BUNDLE_FILE"/);
  assert.match(readme, /enigma connect claude-desktop --bundle "\$ENIGMA_BUNDLE_FILE" --dry-run/);
  assert.doesNotMatch(installAnywhere, /setup --client auto --connect-installed --overwrite/);
  assert.match(installAnywhere, /enigma quickstart --bundle \.\/\.enigma\/bundle\.json/);
  assert.match(installAnywhere, /enigma connect claude-desktop --bundle \.\/\.enigma\/bundle\.json --dry-run/);
  assert.doesNotMatch(clientConnectors, /setup --client auto --connect-installed --overwrite/);
  assert.match(clientConnectors, /Preview one intended client first/);
  assert.match(clientConnectors, /enigma connect claude-desktop --dry-run/);
  assert.match(websiteStyles, /first-run-map/);
  assert.match(help, /Start here/);
  assert.match(help, /You should not need Node, npm, terminal commands, or JSON edits/);
  assert.match(launchStatus, /How this page stays public-safe/);
  assert.doesNotMatch(launchStatus, /GitHub Releases|code-signing-setup|production-readiness-status/);
  assert.match(installGuide, /when your platform is marked ready/);
  assert.match(macosInstall, /when signing is ready/);
  assert.match(windowsInstall, /when signing is ready/);
  assert.doesNotMatch(publicWebsite, /Download the (macOS|Windows) installer from the/);
  assert.match(connectApps, /See setup walkthrough/);
  assert.doesNotMatch(connectApps, /Open Connections in Enigma/);
  assert.match(otherClients, /Desktop-detected path/);
  assert.match(otherClients, /Preview connection/);
  assert.match(help, /Remove Enigma safely/);
  assert.match(removalGuide, /Remove Enigma without losing your local vault by accident/);
  assert.match(removalGuide, /Disconnecting Enigma from an app affects Enigma-controlled local connector setup only/);
  assert.match(removalGuide, /Full removal is separate and destructive/);
  assert.match(faq, /safe removal guide/);
  assert.match(onboardingUx, /Download the desktop app → create your Memory Drive → connect a supported AI app/);
  assert.match(funnelSpec, /Public copy must not imply signed distribution is complete until release evidence proves it/);
  assertPublicSafe(publicWebsite);
});
