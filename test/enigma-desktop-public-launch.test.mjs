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
  assert.equal(model.dashboard.memory_controller.memory_weather.primary_action.id, 'review_grants');
  assert.equal(model.dashboard.memory_controller.recall_approval.primary_action.id, 'review_recall');
  assert.equal(model.dashboard.memory_controller.recall_approval.secondary_actions[0].label, 'Approve this local recall');
  assert.equal(model.dashboard.memory_controller.recall_approval.secondary_actions[1].label, 'Keep not shared');
  assertControllerPrimitiveContracts(model.dashboard.memory_controller);
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

test('desktop Tauri dashboard exposes Memory Controller consumer controls', async () => {
  const [wizard, help, styles] = await Promise.all([
    readDesktopUiFile('wizard.js'),
    readDesktopUiFile('help.js'),
    readDesktopUiFile('styles.css'),
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
  assert.match(help, /just-in-time consent/i);
  assert.match(help, /Setup has six short steps/i);
  assert.match(wizard, /Read it like a traffic light/i);
  assert.match(help, /Read the section like a traffic light/i);
  assert.match(help, /Review alone never shares memory/i);
  assert.match(help, /local review space/i);
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
  const [home, download, help, onboardingUx] = await Promise.all([
    readWebsiteFile('index.html'),
    readWebsiteFile('download.html'),
    readWebsiteFile('help/index.html'),
    readFile(new URL('../docs/public-launch/consumer-onboarding-ux.md', import.meta.url), 'utf8'),
  ]);
  const publicWebsite = `${home}\n${download}\n${help}`;
  const funnelSpec = `${publicWebsite}\n${onboardingUx}`;

  assert.match(home, /Download the desktop app/);
  assert.match(home, /Create your Memory Drive/);
  assert.match(home, /Connect an AI app/);
  assert.match(download, /After the download/);
  assert.match(download, /open Enigma Memory/i);
  assert.match(help, /Start here/);
  assert.match(help, /You should not need Node, npm, terminal commands, or JSON edits/);
  assert.match(onboardingUx, /Download the desktop app → create your Memory Drive → connect a supported AI app/);
  assert.match(funnelSpec, /Public copy must not imply signed distribution is complete until release evidence proves it/);
  assertPublicSafe(publicWebsite);
});
