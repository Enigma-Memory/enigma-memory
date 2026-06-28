import test from 'node:test';
import assert from 'node:assert/strict';

const RAW_MEMORY = 'private launch-code phrase must not leave local memory';
const RAW_PROMPT = 'prompt: summarize the customer transcript';
const RAW_TRANSCRIPT = 'transcript: user said the secret token is abc123';
const RAW_PROVIDER_RESPONSE = 'provider_response: model returned private content';
const RAW_LOCAL_PATH = 'C:\\Users\\Alice\\AppData\\Local\\Enigma\\memory.db';

async function importDesktop() {
  return import('../apps/desktop/src/app.js');
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

  assert.equal(next.sequence, initial.sequence);
  assert.deepEqual(next.memoryDrive, initial.memoryDrive);
  assert.deepEqual(after, before);
  assert.match(next.notice, /Unknown action/);
  assertPublicSafe(after);
});
