export const TRAY_MODEL_SCHEMA = 'enigma.desktop.tray_model.v1';
export const TRAY_MENU_SCHEMA = 'enigma.desktop.tray_menu.v1';

export const TRAY_ACTION_TYPES = Object.freeze({
  STATUS: 'tray/status',
  QUICKSTART: 'tray/quickstart',
  CONNECT_CLIENTS: 'tray/connect-clients',
  OPEN_DOCS: 'tray/open-docs',
  RUN_DIAGNOSTICS: 'tray/run-diagnostics',
  QUIT: 'tray/quit',
});

const DEFAULT_DOCS_URL = 'https://docs.enigmaprotocol.net/docs/install';
const STATUS_VALUES = Object.freeze(new Set(['not-installed', 'ready', 'needs-setup', 'running', 'degraded', 'offline']));
const DIAGNOSTIC_VALUES = Object.freeze(new Set(['idle', 'queued', 'running', 'passed', 'failed']));
const CLIENTS = Object.freeze([
  Object.freeze({ id: 'claude-desktop', label: 'Claude Desktop', kind: 'mcp-client' }),
  Object.freeze({ id: 'cursor', label: 'Cursor', kind: 'mcp-client' }),
  Object.freeze({ id: 'vscode', label: 'VS Code', kind: 'mcp-client' }),
  Object.freeze({ id: 'browser-bridge', label: 'Browser bridge', kind: 'extension' }),
]);

function cleanString(value) {
  return String(value ?? '').trim();
}

function normalizeStatus(value) {
  const status = cleanString(value);
  return STATUS_VALUES.has(status) ? status : 'needs-setup';
}

function normalizeDiagnostics(value) {
  const status = cleanString(value);
  return DIAGNOSTIC_VALUES.has(status) ? status : 'idle';
}

function normalizeClients(value) {
  const requested = Array.isArray(value) ? value : [];
  const seen = new Set();
  const known = new Map(CLIENTS.map((client) => [client.id, client]));
  const clients = [];
  for (const item of requested) {
    const id = cleanString(typeof item === 'string' ? item : item?.id);
    const connected = typeof item === 'string' || item?.connected === true;
    if (!known.has(id) || seen.has(id) || !connected) continue;
    seen.add(id);
    clients.push({ ...known.get(id), connected: true });
  }
  for (const client of CLIENTS) {
    if (!seen.has(client.id)) clients.push({ ...client, connected: false });
  }
  return clients;
}

function menuItem(id, label, action, options = {}) {
  return Object.freeze({
    id,
    label,
    action,
    enabled: options.enabled !== false,
    checked: options.checked === true,
    role: cleanString(options.role) || 'item',
    honest_boundary: cleanString(options.honest_boundary),
  });
}

function action(type, payload = {}) {
  return Object.freeze({ type, ...payload });
}

export function createTrayState(options = {}) {
  const status = normalizeStatus(options.status);
  const clients = normalizeClients(options.connectedClients ?? options.clients);
  const connectedCount = clients.filter((client) => client.connected).length;
  return Object.freeze({
    schema: TRAY_MODEL_SCHEMA,
    model_only: true,
    native_tray_started: false,
    status,
    status_label: statusLabel(status),
    quickstart_available: options.quickstartAvailable !== false,
    clients: Object.freeze(clients.map((client) => Object.freeze({ ...client }))),
    connected_client_count: connectedCount,
    docs_url: cleanString(options.docsUrl) || DEFAULT_DOCS_URL,
    diagnostics: Object.freeze({
      status: normalizeDiagnostics(options.diagnosticsStatus),
      last_result: cleanString(options.diagnosticsResult),
    }),
    quit_requested: options.quitRequested === true,
  });
}

export function statusLabel(status) {
  switch (normalizeStatus(status)) {
    case 'ready':
      return 'Ready';
    case 'running':
      return 'Running';
    case 'degraded':
      return 'Needs attention';
    case 'offline':
      return 'Offline';
    case 'not-installed':
      return 'Not installed';
    default:
      return 'Needs setup';
  }
}

export function createTrayMenu(state = createTrayState()) {
  const model = state?.schema === TRAY_MODEL_SCHEMA ? state : createTrayState(state);
  return Object.freeze({
    schema: TRAY_MENU_SCHEMA,
    model_only: true,
    native_tray_started: false,
    status: model.status,
    items: Object.freeze([
      menuItem('status', `Status: ${model.status_label}`, TRAY_ACTION_TYPES.STATUS, {
        enabled: false,
        honest_boundary: 'Local tray status is an application model snapshot, not cryptographic proof.',
      }),
      menuItem('quickstart', 'Run quickstart', TRAY_ACTION_TYPES.QUICKSTART, {
        enabled: model.quickstart_available && model.status !== 'running',
        honest_boundary: 'Emits an intent to run the existing quickstart command; this module does not execute commands.',
      }),
      menuItem('connect-clients', `Connect clients (${model.connected_client_count})`, TRAY_ACTION_TYPES.CONNECT_CLIENTS, {
        honest_boundary: 'Opens client-connection intent only; no MCP client is configured by this pure model.',
      }),
      menuItem('open-docs', 'Open install docs', TRAY_ACTION_TYPES.OPEN_DOCS, {
        honest_boundary: 'Emits a docs URL intent only; this module does not launch a browser.',
      }),
      menuItem('run-diagnostics', diagnosticsLabel(model.diagnostics.status), TRAY_ACTION_TYPES.RUN_DIAGNOSTICS, {
        enabled: model.diagnostics.status !== 'running',
        honest_boundary: 'Emits diagnostics intent only; the caller owns command execution and evidence capture.',
      }),
      menuItem('separator-before-quit', '—', '', { enabled: false, role: 'separator' }),
      menuItem('quit', 'Quit Enigma tray', TRAY_ACTION_TYPES.QUIT, {
        honest_boundary: 'Emits quit intent only; host application owns process shutdown.',
      }),
    ]),
  });
}

function diagnosticsLabel(status) {
  switch (normalizeDiagnostics(status)) {
    case 'queued':
      return 'Diagnostics queued';
    case 'running':
      return 'Diagnostics running';
    case 'passed':
      return 'Run diagnostics (last passed)';
    case 'failed':
      return 'Run diagnostics (last failed)';
    default:
      return 'Run diagnostics';
  }
}

export function trayStatus(status) {
  return action(TRAY_ACTION_TYPES.STATUS, { status: normalizeStatus(status) });
}

export function runQuickstart(options = {}) {
  return action(TRAY_ACTION_TYPES.QUICKSTART, { bundle: cleanString(options.bundle) || '<bundle-path>', overwrite: options.overwrite !== false });
}

export function connectClients(clientIds = []) {
  return action(TRAY_ACTION_TYPES.CONNECT_CLIENTS, { clients: normalizeClients(clientIds).filter((client) => client.connected).map((client) => client.id) });
}

export function openDocs(url = DEFAULT_DOCS_URL) {
  return action(TRAY_ACTION_TYPES.OPEN_DOCS, { url: cleanString(url) || DEFAULT_DOCS_URL });
}

export function runDiagnostics(scope = 'local') {
  return action(TRAY_ACTION_TYPES.RUN_DIAGNOSTICS, { scope: cleanString(scope) || 'local' });
}

export function quitTray() {
  return action(TRAY_ACTION_TYPES.QUIT, { quit_requested: true });
}

export function reduceTrayState(state = createTrayState(), requestedAction = {}) {
  const model = state?.schema === TRAY_MODEL_SCHEMA ? state : createTrayState(state);
  const type = cleanString(requestedAction.type);
  switch (type) {
    case TRAY_ACTION_TYPES.STATUS:
      return createTrayState({ ...model, status: requestedAction.status });
    case TRAY_ACTION_TYPES.QUICKSTART:
      return createTrayState({ ...model, status: 'running', diagnosticsStatus: model.diagnostics.status });
    case TRAY_ACTION_TYPES.CONNECT_CLIENTS:
      return createTrayState({ ...model, connectedClients: requestedAction.clients });
    case TRAY_ACTION_TYPES.OPEN_DOCS:
      return createTrayState({ ...model, docsUrl: requestedAction.url });
    case TRAY_ACTION_TYPES.RUN_DIAGNOSTICS:
      return createTrayState({ ...model, diagnosticsStatus: 'queued' });
    case TRAY_ACTION_TYPES.QUIT:
      return createTrayState({ ...model, quitRequested: true });
    default:
      return model;
  }
}

export function trayActionIntent(requestedAction = {}) {
  const type = cleanString(requestedAction.type);
  switch (type) {
    case TRAY_ACTION_TYPES.STATUS:
      return Object.freeze({ kind: 'status', status: normalizeStatus(requestedAction.status), side_effect: false });
    case TRAY_ACTION_TYPES.QUICKSTART:
      return Object.freeze({ kind: 'quickstart', command: 'enigma', args: ['quickstart', '--bundle', '<bundle-path>', '--overwrite'], side_effect: 'caller-owned' });
    case TRAY_ACTION_TYPES.CONNECT_CLIENTS:
      return Object.freeze({ kind: 'connect_clients', clients: normalizeClients(requestedAction.clients).filter((client) => client.connected).map((client) => client.id), side_effect: 'caller-owned' });
    case TRAY_ACTION_TYPES.OPEN_DOCS:
      return Object.freeze({ kind: 'open_docs', url: cleanString(requestedAction.url) || DEFAULT_DOCS_URL, side_effect: 'caller-owned' });
    case TRAY_ACTION_TYPES.RUN_DIAGNOSTICS:
      return Object.freeze({ kind: 'run_diagnostics', command: 'enigma', args: ['doctor'], side_effect: 'caller-owned' });
    case TRAY_ACTION_TYPES.QUIT:
      return Object.freeze({ kind: 'quit', side_effect: 'caller-owned' });
    default:
      return Object.freeze({ kind: 'unknown', side_effect: false });
  }
}

export const trayActions = Object.freeze({
  trayStatus,
  runQuickstart,
  connectClients,
  openDocs,
  runDiagnostics,
  quitTray,
});
