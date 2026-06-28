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
  ready: { badge: 'Ready', body: 'Enigma can connect this app now.' },
  connected: { badge: 'Connected', body: 'This app can ask Enigma for memory.' },
  'not-installed': { badge: 'Not installed', body: 'No supported install found.' },
  'restart-needed': { badge: 'Restart needed', body: 'Connection is ready. Restart the app to finish.' },
  'permission-needed': { badge: 'Permission needed', body: 'Your system blocked access to this app\'s settings.' },
  skipped: { badge: 'Skipped', body: 'This app will not use Enigma yet.' },
};

const tauri = window.__TAURI__;
const invoke = tauri?.core?.invoke;
const isMock = typeof invoke !== 'function';

let currentStep = 0;
let clients = [];
let health = {};
let diagnostics = {};
let update = {};
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
          { id: 'cursor', name: 'Cursor', status: 'not-installed' },
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
  const list = clients.length
    ? clients.map((client) => {
        const copy = CLIENT_COPY[client.status] || CLIENT_COPY['not-installed'];
        const actionLabel = client.status === 'connected' ? 'Disconnect' : client.status === 'skipped' ? 'Connect later' : 'Connect';
        return `
          <div class="client-card">
            <div class="meta">
              <div class="name">${escapeHtml(client.name)}</div>
              <p class="note">${escapeHtml(copy.body)}</p>
            </div>
            <span class="status-pill ${escapeHtml(client.status)}">${escapeHtml(copy.badge)}</span>
            <button type="button" class="link" data-action="${client.status === 'connected' ? 'disconnect' : 'connect'}" data-id="${escapeHtml(client.id)}">${escapeHtml(actionLabel)}</button>
          </div>
        `;
      }).join('')
    : '<p>No apps scanned yet.</p>';

  const hasConnected = clients.some((c) => c.status === 'connected');
  const mainAction = hasConnected ? primaryButton('Run health check', 'go-health') : primaryButton('Continue without apps', 'go-health');

  return renderCard(`
    <p class="eyebrow">Step 4 of 6 · Connect apps</p>
    <h1>Connect your AI apps</h1>
    <p>Choose which apps can ask Enigma for memory. You can change this later.</p>
    <div class="client-list">${list}</div>
    <div class="button-row">
      ${mainAction}
      ${secondaryButton('What does connecting allow?', 'toggle-connection-info')}
    </div>
    <div id="connection-disclosure" class="disclosure hidden">
      Connected apps can ask Enigma for relevant memory. Enigma still keeps your private vault local. You control which apps are connected.
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
      busy = true;
      setStatus('Connecting...');
      await call('connect_client', { id });
      clients = await call('detect_clients');
      health = await call('get_health');
      busy = false;
      render();
      return;
    }
    case 'disconnect': {
      const id = event.currentTarget.dataset.id;
      busy = true;
      setStatus('Disconnecting...');
      await call('disconnect_client', { id });
      clients = await call('detect_clients');
      health = await call('get_health');
      busy = false;
      render();
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
    case 'go-dashboard':
      currentStep = 6;
      render();
      return;
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
      setStatus(`Diagnostics exported to ${result.path || 'unknown'}.`);
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
