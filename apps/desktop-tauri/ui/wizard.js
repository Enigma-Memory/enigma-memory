/**
 * Enigma Memory desktop onboarding wizard and health dashboard.
 *
 * Runs inside the Tauri shell using `window.__TAURI__.core.invoke`.
 * Falls back to mock responses when opened directly in a browser for smoke tests.
 */

import { renderHelpButton } from './help.js';

const SCREENS = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'vault', label: 'Private vault' },
  { id: 'find-apps', label: 'Find apps' },
  { id: 'connect-apps', label: 'Connect apps' },
  { id: 'health', label: 'Health check' },
  { id: 'ready', label: 'Ready' },
];

const CLIENT_COPY = {
  ready: { badge: 'Ready', body: 'Enigma can connect this app now. A safe reset is available later if the app config changes.' },
  connected: { badge: 'Connected', body: 'This app can ask Enigma for memory. Enigma keeps an app-settings backup when it changes its own entry.' },
  'not-installed': { badge: 'Not installed', body: 'No supported install found.' },
  'restart-needed': { badge: 'Restart needed', body: 'Connection is ready. Restart the app to finish.' },
  'permission-needed': { badge: 'Permission needed', body: 'Your system blocked access to this app\'s settings.' },
  'repair-required': { badge: 'Repair needed', body: 'Safe reset can reapply only the Enigma connector entry while preserving unrelated MCP settings.' },
  malformed: { badge: 'Malformed config', body: 'This app\'s MCP settings look malformed. Restore an Enigma-managed backup or use safe reset to reapply the Enigma entry.' },
  'rollback-available': { badge: 'Backup ready', body: 'Rollback can restore the latest Enigma-managed backup without showing config JSON or local paths.' },
  skipped: { badge: 'Skipped', body: 'This app will not use Enigma yet.' },
  error: { badge: 'Needs attention', body: 'Enigma can try a public-safe repair without displaying config contents.' },
};

const tauri = window.__TAURI__;
const invoke = tauri?.core?.invoke;
const isMock = typeof invoke !== 'function';

let currentStep = 0;
let clients = [];
let health = {};
let diagnostics = {};
let update = {};
let crashReporting = {};
let serviceStatus = {};
let serviceLogs = [];
let busy = false;

function $(selector) {
  return document.querySelector(selector);
}

function setStatus(text) {
  const el = $('#status');
  if (el) el.textContent = text;
}

async function mockInvoke(cmd, args = {}) {
  await new Promise((r) => setTimeout(r, 350));
  switch (cmd) {
    case 'create_vault':
    case 'get_health':
      return {
        memory_drive_status: 'ready',
        connected_app_count: clients.filter((c) => c.status === 'connected').length,
        proof_status: clients.some((c) => c.status === 'connected') ? 'active' : 'idle',
        update_status: update.status || 'current',
        diagnostics_status: diagnostics.status || 'passed',
        offline_ready: true,
        issue_codes: [],
      };
    case 'detect_clients': {
      if (clients.length === 0) {
        clients = [
          { id: 'claude-desktop', name: 'Claude Desktop', status: 'ready' },
          { id: 'cursor', name: 'Cursor', status: 'malformed' },
          { id: 'vscode-cline', name: 'VS Code Cline', status: 'repair-required', rollback_available: true },
        ];
      }
      return clients;
    }
    case 'connect_client': {
      const c = clients.find((c) => c.id === args.id);
      if (c) c.status = 'connected';
      return c || { id: args.id, name: args.id, status: 'connected' };
    }
    case 'disconnect_client': {
      const c = clients.find((c) => c.id === args.id);
      if (c) c.status = 'ready';
      return c || { id: args.id, name: args.id, status: 'ready' };
    }
    case 'repair_client_config': {
      const c = clients.find((c) => c.id === args.id);
      if (c) c.status = 'restart-needed';
      return { id: args.id, status: 'restart-needed', action: 'safe-reset', public_safe: true };
    }
    case 'rollback_client_config': {
      const c = clients.find((c) => c.id === args.id);
      if (c) c.status = 'ready';
      return { id: args.id, status: 'ready', action: 'rollback', restored: true, public_safe: true };
    }
    case 'get_diagnostics':
      return { status: 'passed', summary: 'Local checks completed.', issue_codes: [] };
    case 'export_diagnostics':
      return { exported: true, path: '<redacted-path>' };
    case 'check_update':
      return { status: 'current', current_version: '0.1.18', available_version: '0.1.18' };
    case 'start_service':
    case 'get_service_status':
      return { running: true, pid: 12345, restarts: 0, uptime_secs: 0 };
    case 'stop_service':
      return { running: false, pid: 0, restarts: 0, uptime_secs: 0 };
    case 'get_service_logs':
      return ['[mock] service started', '[mock] ready'];
    case 'create_memory_drive':
      return { ok: true, memory_drive_status: 'ready' };
    case 'get_memory_drive_status':
      return { memory_drive_status: 'ready' };
    case 'shutdown_service':
      return 'service stopped';
    case 'get_crash_reporting_status':
      return crashReporting.status || { enabled: false, endpoint: 'https://enigmamemory.com/telemetry/crash', pending_count: 0 };
    case 'set_crash_reporting_enabled':
      crashReporting.status = { ...crashReporting.status, enabled: args.enabled };
      return { enabled: args.enabled };
    case 'submit_pending_crash_reports':
      return { submitted: crashReporting.status?.pending_count || 0, failed: 0, remaining: 0 };
    default:
      return null;
  }
}

async function call(cmd, args = {}) {
  if (isMock) return mockInvoke(cmd, args);
  return invoke(cmd, args);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderHeader(context = 'welcome') {
  return `
    <header class="app-header">
      <div class="brand"><div class="brand-mark" aria-hidden="true"></div>Enigma Memory</div>
      <div class="app-header__actions">
        <div class="progress">${currentStep < SCREENS.length ? `Step ${currentStep + 1} of ${SCREENS.length} · ${escapeHtml(SCREENS[currentStep].label)}` : 'Dashboard'}</div>
        ${renderHelpButton(context)}
      </div>
    </header>
  `;
}

function renderCard(body, context = 'welcome') {
  return `${renderHeader(context)}<main class="wizard-card">${body}<p id="status" class="status-line" aria-live="polite"></p></main>`;
}

function primaryButton(label, action, opts = {}) {
  return `<button type="button" class="primary" data-action="${escapeHtml(action)}" ${opts.disabled ? 'disabled' : ''}>${escapeHtml(label)}</button>`;
}

function secondaryButton(label, action) {
  return `<button type="button" class="secondary" data-action="${escapeHtml(action)}">${escapeHtml(label)}</button>`;
}

function normalizeClientStatus(client) {
  const raw = String(client?.status || client?.recommended_action || client?.action || 'not-installed')
    .replace(/_/g, '-')
    .toLowerCase();
  const repairReasons = Array.isArray(client?.repair_reasons)
    ? client.repair_reasons
    : Array.isArray(client?.repairReasons)
      ? client.repairReasons
      : [];
  const hasMalformedReason = repairReasons.some((reason) => String(reason).includes('config_json'));
  if (client?.parse_error || client?.malformed_config || hasMalformedReason || raw === 'config-malformed' || raw === 'malformed-config') {
    return 'malformed';
  }
  if (client?.repair_required || raw === 'repair' || raw === 'repair-needed' || repairReasons.length > 0) return 'repair-required';
  if (raw === 'already-configured') return 'connected';
  if (raw === 'connect' || raw === 'missing-client-config') return 'ready';
  if (raw === 'backup-available' || raw === 'restore-available') return 'rollback-available';
  if ((client?.rollback_available || client?.backup_available || client?.backup_id) && !CLIENT_COPY[raw]) {
    return 'rollback-available';
  }
  return CLIENT_COPY[raw] ? raw : 'not-installed';
}

function renderClientActions(client, status) {
  const id = escapeHtml(client.id);
  if (status === 'not-installed') {
    return '<button type="button" class="link" disabled>Unavailable</button>';
  }
  if (status === 'malformed') {
    return `
      <button type="button" class="client-primary" data-action="rollback" data-id="${id}">Restore backup</button>
      <button type="button" class="link" data-action="repair" data-id="${id}">Repair connection</button>
    `;
  }
  if (status === 'repair-required') {
    return `
      <button type="button" class="client-primary" data-action="repair" data-id="${id}">Repair connection</button>
      <button type="button" class="link" data-action="rollback" data-id="${id}">Rollback</button>
    `;
  }
  if (status === 'rollback-available') {
    return `
      <button type="button" class="client-primary" data-action="rollback" data-id="${id}">Rollback</button>
      <button type="button" class="link" data-action="repair" data-id="${id}">Repair connection</button>
    `;
  }
  if (status === 'connected') {
    return `
      <button type="button" class="client-primary" data-action="disconnect" data-id="${id}">Disconnect</button>
      <button type="button" class="link" data-action="repair" data-id="${id}">Repair connection</button>
      <button type="button" class="link" data-action="rollback" data-id="${id}">Rollback</button>
    `;
  }
  const actionLabel = status === 'connected' ? 'Disconnect' : status === 'skipped' ? 'Connect later' : 'Connect';
  const action = status === 'connected' ? 'disconnect' : 'connect';
  return `<button type="button" class="link" data-action="${action}" data-id="${id}">${escapeHtml(actionLabel)}</button>`;
}

function renderClientList(emptyCopy = 'No apps scanned yet.') {
  return clients.length
    ? clients.map((client) => {
        const status = normalizeClientStatus(client);
        const copy = CLIENT_COPY[status] || CLIENT_COPY.error;
        return `
          <div class="client-card">
            <div class="meta">
              <div class="name">${escapeHtml(client.name)}</div>
              <p class="note">${escapeHtml(copy.body)}</p>
            </div>
            <span class="status-pill ${escapeHtml(status)}">${escapeHtml(copy.badge)}</span>
            <div class="client-actions">${renderClientActions(client, status)}</div>
          </div>
        `;
      }).join('')
    : `<p>${escapeHtml(emptyCopy)}</p>`;
}

function renderWelcome() {
  return renderCard(`
    <p class="eyebrow">Step 1 of 6 · Welcome</p>
    <h1>Give your AI apps a private memory</h1>
    <p>Enigma Memory creates a private Memory Drive on this computer. Connected AI apps can ask for helpful facts when you allow it. Your memory is not published during setup.</p>
    <div class="button-row">
      ${primaryButton('Create my Memory Drive', 'create-vault')}
      ${secondaryButton('Learn what stays private', 'toggle-privacy')}
    </div>
    <div id="privacy-disclosure" class="disclosure hidden">
      Setup creates local files for Enigma Memory. It does not delete anything from AI providers, change a model, or publish your memory.
    </div>
  `, 'welcome');
}

function renderVault() {
  return renderCard(`
    <p class="eyebrow">Step 2 of 6 · Private vault</p>
    <h1>Create your private vault</h1>
    <p>This vault stores Enigma Memory data on this computer. You can move it later from Settings.</p>
    <div class="disclosure">
      <strong>Recommended location selected</strong><br>
      Enigma Memory will use your operating system's application data folder.
    </div>
    <div class="button-row">
      ${primaryButton('Create vault', 'create-vault-action')}
      ${secondaryButton('Choose a different location', 'choose-location')}
    </div>
  `, 'vault');
}

function renderFindApps() {
  return renderCard(`
    <p class="eyebrow">Step 3 of 6 · Find apps</p>
    <h1>Find apps Enigma can connect to</h1>
    <p>Enigma can look for supported AI apps on this computer and prepare safe connection steps.</p>
    <div class="button-row">
      ${primaryButton('Find my apps', 'detect-clients')}
      ${secondaryButton('I will connect apps later', 'skip-apps')}
    </div>
  `, 'connections');
}

function renderConnectApps() {
  const list = renderClientList();

  const hasConnected = clients.some((c) => normalizeClientStatus(c) === 'connected');
  const mainAction = hasConnected ? primaryButton('Run health check', 'go-health') : primaryButton('Continue without apps', 'go-health');

  return renderCard(`
    <p class="eyebrow">Step 4 of 6 · Connect apps</p>
    <h1>Connect your AI apps</h1>
    <p>Choose which apps can ask Enigma for memory. You can change this later.</p>
    <div class="disclosure">
      If a connector is malformed, Enigma can restore an Enigma-managed backup, run a safe reset to reapply only the Enigma entry, or rollback the last Enigma change. Config JSON and local paths stay hidden.
    </div>
    <div class="client-list">${list}</div>
    <div class="button-row">
      ${mainAction}
      ${secondaryButton('What does connecting allow?', 'toggle-connection-info')}
    </div>
    <div id="connection-disclosure" class="disclosure hidden">
      Connected apps can ask Enigma for relevant memory. Repair and rollback preserve unrelated MCP settings and do not alter provider memory.
    </div>
  `, 'connections');
}

function renderHealth() {
  return renderCard(`
    <p class="eyebrow">Step 5 of 6 · Health check</p>
    <h1>Check your Memory Drive</h1>
    <p>Enigma will check your vault, privacy guardrails, and app connections.</p>
    <div class="button-row">
      ${primaryButton('Run health check', 'run-health')}
      ${secondaryButton('Open dashboard anyway', 'go-dashboard')}
    </div>
  `, 'health');
}

function renderReady() {
  const appCopy = clients.some((c) => c.status === 'connected') ? 'Apps connected' : 'Apps can be connected later';
  return renderCard(`
    <p class="eyebrow">Step 6 of 6 · Ready</p>
    <h1>Your Memory Drive is ready</h1>
    <p>Enigma is set up on this computer. Connected apps can now ask for helpful memory when you allow it.</p>
    <ul class="checklist">
      <li>Private vault created</li>
      <li>Privacy guardrails checked</li>
      <li>${escapeHtml(appCopy)}</li>
      <li>Dashboard ready</li>
    </ul>
    <p>Next: try asking a connected app to remember a harmless preference, then check that it appears in your dashboard.</p>
    <div class="button-row">
      ${primaryButton('Open dashboard', 'go-dashboard')}
      ${secondaryButton('Explore advanced details', 'go-dashboard')}
    </div>
  `, 'welcome');
}

function renderDashboard() {
  const issueTags = (health.issue_codes?.length ? health.issue_codes : ['none']).map(
    (code) => `<li>${escapeHtml(code)}</li>`
  ).join('');
  const serviceRunning = serviceStatus?.running;
  const serviceAction = serviceRunning ? 'stop-service' : 'start-service';
  const serviceLabel = serviceRunning ? 'Stop engine' : 'Start engine';
  const logsText = serviceLogs?.length ? serviceLogs.slice(-5).join('\n') : 'No logs yet.';
  const updateStatus = update?.status || 'unknown';
  const updateAvailable = update?.available_version && update.available_version !== update.current_version;
  const crashEnabled = crashReporting.status?.enabled ?? false;
  const crashPending = crashReporting.status?.pending_count ?? 0;

  return renderCard(`
    <p class="eyebrow">Memory health</p>
    <h1>Health dashboard</h1>
    <p>A simple check that your vault, app connections, and privacy checks are working.</p>
    <div class="dashboard-grid">
      <div class="metric"><dt>Memory Drive</dt><dd>${escapeHtml(health.memory_drive_status || 'unknown')}</dd></div>
      <div class="metric"><dt>Connected apps</dt><dd>${escapeHtml(String(health.connected_app_count ?? 0))}</dd></div>
      <div class="metric"><dt>Proof activity</dt><dd>${escapeHtml(health.proof_status || 'idle')}</dd></div>
      <div class="metric"><dt>Update status</dt><dd>${escapeHtml(updateStatus)}</dd></div>
      <div class="metric"><dt>Diagnostics</dt><dd>${escapeHtml(health.diagnostics_status || 'idle')}</dd></div>
      <div class="metric"><dt>Offline ready</dt><dd>${health.offline_ready ? 'Yes' : 'No'}</dd></div>
    </div>
    <div class="metric">
      <dt>Issue codes</dt>
      <ul class="issue-list">${issueTags}</ul>
    </div>

    <div class="dashboard-section">
      <h2>App connection recovery</h2>
      <p class="note">Safe reset, restore, and rollback actions recover malformed connector settings without showing config JSON, local paths, or provider responses.</p>
      <div class="client-list">${renderClientList('Run app detection to see recovery options.')}</div>
    </div>

    <div class="dashboard-section">
      <h2>Engine service</h2>
      <p>Status: <strong>${serviceRunning ? 'Running' : 'Stopped'}</strong>
        ${serviceStatus?.pid ? `(pid ${escapeHtml(String(serviceStatus.pid))})` : ''}</p>
      <p class="note">Restarts: ${escapeHtml(String(serviceStatus?.restarts ?? 0))} · Uptime: ${escapeHtml(String(serviceStatus?.uptime_secs ?? 0))}s</p>
      <div class="button-row">
        ${primaryButton(serviceLabel, serviceAction)}
        ${secondaryButton('Refresh logs', 'view-logs')}
      </div>
      <pre class="log-view" aria-label="Recent engine logs">${escapeHtml(logsText)}</pre>
    </div>

    <div class="dashboard-section">
      <h2>Diagnostics bundle</h2>
      <p>${escapeHtml(diagnostics?.summary || 'Run diagnostics to collect public-safe health metadata.')}</p>
      <p class="note">Status: ${escapeHtml(diagnostics?.status || 'idle')}</p>
      <div class="button-row">
        ${primaryButton('Run diagnostics', 'run-diagnostics')}
        ${secondaryButton('Export bundle', 'export-diagnostics')}
      </div>
    </div>

    <div class="dashboard-section">
      <h2>Update check</h2>
      <p>Current version: ${escapeHtml(update?.current_version || '0.1.18')}</p>
      <p>Available version: ${escapeHtml(update?.available_version || 'unknown')}
        ${updateAvailable ? ` <span class="status-pill warning">Update available</span>` : ''}</p>
      <div class="button-row">
        ${primaryButton('Check for updates', 'check-update')}
      </div>
    </div>

    <div class="dashboard-section">
      <h2>Crash reporting</h2>
      <p>Help improve Enigma by sending redacted crash summaries. No memory, wallet, or path data is ever included.</p>
      <p class="note">Status: <strong>${crashEnabled ? 'Opted in' : 'Opted out'}</strong> · Pending reports: ${escapeHtml(String(crashPending))}</p>
      <div class="button-row">
        ${primaryButton(crashEnabled ? 'Opt out' : 'Opt in', 'toggle-crash-reporting')}
        ${crashPending > 0 ? secondaryButton('Send pending reports', 'submit-crash-reports') : ''}
      </div>
    </div>

    <div class="button-row">
      ${primaryButton('Run health check', 'run-health')}
      ${secondaryButton('Shutdown service', 'shutdown')}
    </div>
  `, 'health');
}

function render() {
  const app = $('#app');
  if (!app) return;
  let html = '';
  if (currentStep === 0) html = renderWelcome();
  else if (currentStep === 1) html = renderVault();
  else if (currentStep === 2) html = renderFindApps();
  else if (currentStep === 3) html = renderConnectApps();
  else if (currentStep === 4) html = renderHealth();
  else if (currentStep === 5) html = renderReady();
  else if (currentStep === 6) html = renderDashboard();
  app.innerHTML = html;
  wireEvents();
}

function wireEvents() {
  document.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', handleAction);
  });
}

async function refreshClientState() {
  clients = await call('detect_clients');
  health = await call('get_health');
}

async function runClientCommand({ command, args, pending, success, failure }) {
  busy = true;
  setStatus(pending);
  try {
    await call(command, args);
    await refreshClientState();
    busy = false;
    render();
    setStatus(success);
  } catch (_) {
    busy = false;
    render();
    setStatus(failure);
  }
}

async function handleAction(event) {
  const action = event.currentTarget.dataset.action;
  if (busy) return;

  switch (action) {
    case 'toggle-privacy':
      $('#privacy-disclosure')?.classList.toggle('hidden');
      return;
    case 'toggle-connection-info':
      $('#connection-disclosure')?.classList.toggle('hidden');
      return;
    case 'create-vault': {
      busy = true;
      setStatus('Preparing...');
      const btn = event.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Preparing...';
      health = await call('create_vault');
      busy = false;
      currentStep = 1;
      render();
      setStatus('Checking this computer.');
      return;
    }
    case 'create-vault-action': {
      busy = true;
      setStatus('Creating vault...');
      const btn = event.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Creating vault...';
      health = await call('create_vault');
      busy = false;
      currentStep = 2;
      render();
      return;
    }
    case 'choose-location':
      setStatus('Location chooser would open here.');
      return;
    case 'detect-clients': {
      busy = true;
      setStatus('Looking for supported apps...');
      event.currentTarget.disabled = true;
      clients = await call('detect_clients');
      busy = false;
      currentStep = 3;
      render();
      return;
    }
    case 'skip-apps':
      currentStep = 3;
      render();
      return;
    case 'connect': {
      const id = event.currentTarget.dataset.id;
      await runClientCommand({
        command: 'connect_client',
        args: { id },
        pending: 'Connecting...',
        success: 'Connection updated. Restart the app if it asks.',
        failure: 'Connection could not complete. No config details were shown.',
      });
      return;
    }
    case 'disconnect': {
      const id = event.currentTarget.dataset.id;
      await runClientCommand({
        command: 'disconnect_client',
        args: { id },
        pending: 'Disconnecting...',
        success: 'Connection removed. Unrelated MCP settings were preserved.',
        failure: 'Disconnect could not complete. No config details were shown.',
      });
      return;
    }
    case 'repair': {
      const id = event.currentTarget.dataset.id;
      if (!confirm('Safe reset this connection? Enigma will reapply only its connector entry, preserve unrelated MCP settings, and will not alter provider memory.')) {
        return;
      }
      await runClientCommand({
        command: 'repair_client_config',
        args: { id },
        pending: 'Running safe reset...',
        success: 'Safe reset complete. Restart the app if it asks.',
        failure: 'Safe reset could not complete. No config details were shown.',
      });
      return;
    }
    case 'rollback': {
      const id = event.currentTarget.dataset.id;
      if (!confirm('Rollback to the latest Enigma-managed backup? Enigma will restore the backup it created, preserve unrelated MCP settings where possible, and will not alter provider memory.')) {
        return;
      }
      await runClientCommand({
        command: 'rollback_client_config',
        args: { id },
        pending: 'Restoring backup...',
        success: 'Restore rollback complete. Restart the app if it asks.',
        failure: 'Rollback could not complete. No config details were shown.',
      });
      return;
    }
    case 'go-health':
      currentStep = 4;
      render();
      return;
    case 'run-health': {
      busy = true;
      setStatus('Checking vault...');
      health = await call('get_health');
      serviceStatus = await call('get_service_status');
      serviceLogs = await call('get_service_logs', { limit: 100 });
      diagnostics = await call('get_diagnostics');
      update = await call('check_update');
      health.diagnostics_status = diagnostics.status;
      health.update_status = update.status;
      busy = false;
      if (currentStep === 4) {
        currentStep = 5;
      }
      render();
      return;
    }
    case 'go-dashboard': {
      currentStep = 6;
      clients = await call('detect_clients');
      crashReporting.status = await call('get_crash_reporting_status');
      render();
      return;
    }
    case 'shutdown': {
      busy = true;
      setStatus('Shutting down...');
      await call('shutdown_service');
      health = await call('get_health');
      busy = false;
      render();
      return;
    }
    case 'start-service': {
      busy = true;
      setStatus('Starting engine...');
      serviceStatus = await call('start_service');
      serviceLogs = await call('get_service_logs', { limit: 100 });
      busy = false;
      render();
      setStatus('Engine started.');
      return;
    }
    case 'stop-service': {
      busy = true;
      setStatus('Stopping engine...');
      serviceStatus = await call('stop_service');
      serviceLogs = await call('get_service_logs', { limit: 100 });
      busy = false;
      render();
      setStatus('Engine stopped.');
      return;
    }
    case 'view-logs': {
      busy = true;
      setStatus('Loading logs...');
      serviceLogs = await call('get_service_logs', { limit: 100 });
      busy = false;
      render();
      setStatus('Logs refreshed.');
      return;
    }
    case 'run-diagnostics': {
      busy = true;
      setStatus('Collecting diagnostics...');
      diagnostics = await call('get_diagnostics');
      busy = false;
      render();
      setStatus(diagnostics.summary || 'Diagnostics collected.');
      return;
    }
    case 'export-diagnostics': {
      if (!confirm('Export a redacted diagnostics JSON file? No raw memory or paths will be included.')) {
        return;
      }
      busy = true;
      setStatus('Exporting diagnostics...');
      const result = await call('export_diagnostics', { approve: true });
      diagnostics.exported = result;
      busy = false;
      render();
      setStatus('Diagnostics bundle exported. The file location is hidden in this view.');
      return;
    }
    case 'check-update': {
      busy = true;
      setStatus('Checking for updates...');
      update = await call('check_update');
      health.update_status = update.status;
      busy = false;
      render();
      setStatus(update.status === 'available' ? 'An update is available.' : 'App is up to date.');
      return;
    }
    case 'toggle-crash-reporting': {
      busy = true;
      const next = !(crashReporting.status?.enabled ?? false);
      setStatus(next ? 'Opting in...' : 'Opting out...');
      await call('set_crash_reporting_enabled', { enabled: next });
      crashReporting.status = await call('get_crash_reporting_status');
      busy = false;
      render();
      setStatus(next ? 'Crash reporting enabled.' : 'Crash reporting disabled.');
      return;
    }
    case 'submit-crash-reports': {
      busy = true;
      setStatus('Sending pending crash reports...');
      const result = await call('submit_pending_crash_reports');
      crashReporting.status = await call('get_crash_reporting_status');
      busy = false;
      render();
      setStatus(`Sent ${result.submitted} report(s). ${result.remaining} remaining.`);
      return;
    }
    default:
      return;
  }
}

function init() {
  render();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
