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
  'test-passed': { badge: 'Test passed', body: 'Local connector config is present and points at the Enigma bundle. Provider apps may still need a restart.' },
  skipped: { badge: 'Skipped', body: 'This app will not use Enigma yet.' },
  error: { badge: 'Needs attention', body: 'Enigma can try a public-safe repair without displaying config contents.' },
};

const tauri = window.__TAURI__;
const invoke = tauri?.core?.invoke;
const isMock = typeof invoke !== 'function';
const WIZARD_STORAGE_KEY = 'enigma.desktop.first_run_resume.v1';
const MAX_WIZARD_STEP = 6;

const PUBLIC_UNSAFE_TEXT_RE = /(?:prompt:|transcript:|provider[_\s-]*response|secret|token|password|private[_\s-]*key|[A-Za-z]:[\\/]|\/(?:Users|home|var|tmp|private|Volumes)\/|memory\.db|customer[_\s-]*(?:id|identifier)|account[_\s-]*id)/i;


let currentStep = 0;
let clients = [];
let health = {};
let diagnostics = {};
let update = {};
let crashReporting = {};
let serviceStatus = {};
let serviceLogs = [];
let controllerUi = {
  grantsReviewed: false,
  recallDecision: 'ask',
  recallReviewOpen: false,
  privateBubbleOpen: false,
  privateBubbleTouched: false,
};
let importSandbox = {
  preview: null,
  result: null,
  error: null,
  rollback: null,
  pendingText: '',
};
let proofActivity = {};
let supportSummary = {};
let connectionPreview = null;
let claudeMcpbHandoff = null;
let dashboardHydration = { status: 'idle', error: null, last_updated: null };

let busy = false;

function $(selector) {
  return document.querySelector(selector);
}

function setStatus(text) {
  const el = $('#status');
  if (el) el.textContent = text;
}

function safeWizardStep(value) {
  const step = Number(value);
  if (!Number.isInteger(step)) return 0;
  return Math.min(MAX_WIZARD_STEP, Math.max(0, step));
}

function safeControllerUi(value = {}) {
  const decision = ['ask', 'allow', 'deny'].includes(value.recallDecision) ? value.recallDecision : 'ask';
  return {
    grantsReviewed: value.grantsReviewed === true,
    recallDecision: decision,
    recallReviewOpen: value.recallReviewOpen === true,
    privateBubbleOpen: value.privateBubbleOpen === true,
    privateBubbleTouched: value.privateBubbleTouched === true,
  };
}

function restoreWizardResumeState() {
  try {
    const raw = window.localStorage?.getItem(WIZARD_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    currentStep = safeWizardStep(parsed.currentStep);
    controllerUi = safeControllerUi(parsed.controllerUi);
  } catch (_) {
    currentStep = 0;
    controllerUi = safeControllerUi();
  }
}

function persistWizardResumeState() {
  try {
    window.localStorage?.setItem(WIZARD_STORAGE_KEY, JSON.stringify({
      currentStep: safeWizardStep(currentStep),
      controllerUi: safeControllerUi(controllerUi),
    }));
  } catch (_) {
    // Resume state is best-effort and contains only public-safe UI state.
  }
}

async function mockInvoke(cmd, args = {}) {
  await new Promise((r) => setTimeout(r, 350));
  switch (cmd) {
    case 'create_vault':
    case 'get_health':
      return {
        memory_drive_status: 'ready',
        health_status: 'healthy',
        connected_app_count: clients.filter((c) => c.status === 'connected').length,
        proof_status: proofActivity.proof_status || (clients.some((c) => c.status === 'connected') ? 'has_receipts' : 'empty'),
        proof_activity: proofActivity,
        update_status: update.status || 'current',
        diagnostics_status: diagnostics.status || 'passed',
        offline_ready: serviceStatus?.running === true,
        issue_codes: [],
        memory_controller: {
          memory_weather_report: {
            status: controllerUi.grantsReviewed ? 'sunny' : 'needs_attention',
            summary: controllerUi.grantsReviewed
              ? 'Apps still ask before Enigma shares local memory.'
              : 'Review app permissions before a connected app receives memory.',
            next_action: controllerUi.grantsReviewed ? 'open_private_bubble' : 'review_grants',
          },
          consent_grant: {
            status: clients.some((c) => c.status === 'connected') ? 'active' : 'missing',
            label: controllerUi.grantsReviewed ? 'App permissions reviewed locally' : 'Connected apps must ask first',
          },
          recall_veto_decision: {
            decision: controllerUi.recallDecision,
            label: controllerUi.recallDecision === 'allow'
              ? 'Approved for this local request'
              : controllerUi.recallDecision === 'deny'
                ? 'Kept not shared locally'
                : 'Waiting for your approval',
            share_status: controllerUi.recallDecision === 'allow'
              ? 'Approved only for this local request'
              : controllerUi.recallDecision === 'deny'
                ? 'Not shared for this local request'
                : 'Not shared until you approve',
          },
          private_memory_bubble: {
            status: controllerUi.privateBubbleOpen ? 'open' : 'closed',
            label: controllerUi.privateBubbleOpen ? 'Private bubble open' : 'Private bubble closed',
            summary: controllerUi.privateBubbleOpen
              ? 'Draft memory stays inside this local bubble.'
              : 'Open a local bubble when you want to review memory before sharing.',
          },
        },
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
    case 'get_claude_mcpb_handoff':
      return {
        ok: true,
        schema: 'enigma.desktop_claude_mcpb_handoff.v1',
        client_id: 'claude-desktop',
        display_name: 'Claude Desktop',
        preferred_path: 'mcpb_extension',
        writes_performed: false,
        automatic_config_write: false,
        connection_plan: {
          schema: 'enigma.claude_desktop_mcpb_connection_plan.v1',
          preferred_path: 'mcpb_extension',
          automatic_config_write: false,
          install_handoff: {
            artifact: '.mcpb',
            user_confirms_in_claude: true,
            enigma_writes_claude_config: false,
          },
        },
        health: {
          schema: 'enigma.claude_desktop_mcpb_health.v1',
          status: 'not_installed',
        },
        next_action: {
          id: 'install_mcpb',
          label: 'Install Claude extension',
        },
        claim_boundaries: {
          local_handoff_only: true,
          enigma_writes_claude_config: false,
          provider_launched: false,
        },
      };
    case 'repair_client_config': {
      const c = clients.find((c) => c.id === args.id);
      if (c) c.status = 'restart-needed';
      return { id: args.id, status: 'restart-needed', action: 'safe-reset', public_safe: true };
    }
    case 'test_client_config': {
      const c = clients.find((c) => c.id === args.id);
      if (c) c.status = 'connected';
      return {
        id: args.id,
        ok: true,
        status: 'test-passed',
        test_result_summary: { ok: true, parse_ok: true, entry_present: true, entry_correct: true, bundle_ok: true, restart_needed: false },
        claim_boundaries: { local_config_only: true, provider_launched: false },
      };
    }
    case 'get_proof_activity':
      return {
        ok: true,
        schema: 'enigma.desktop_proof_activity.v1',
        proof_status: clients.some((c) => c.status === 'connected') ? 'has_receipts' : 'empty',
        receipt_count: clients.some((c) => c.status === 'connected') ? 3 : 0,
        active_memory_count: 1,
        tombstoned_memory_count: 0,
        verifier_status: 'not_run',
        evidence_status: 'local_counts_and_roots_only',
        redaction: {
          raw_memory_included: false,
          prompts_included: false,
          transcripts_included: false,
          credentials_included: false,
          provider_responses_included: false,
          local_paths_redacted: true,
        },
        privacy_scan: {
          schema: 'enigma.desktop_public_export_privacy_scan.v1',
          status: 'pass',
          export_allowed: true,
          local_paths_denied: true,
          credentials_denied: true,
        },
        export_allowed: true,
        claim_boundaries: {
          local_enigma_events_only: true,
          provider_deletion_proof: false,
          model_forgetting_proof: false,
          hosted_saas_live: false,
        },
      };
    case 'export_proof_activity':
      return {
        exported: true,
        schema: 'enigma.desktop_proof_activity_export.v1',
        path: '<proof-activity-file>',
        local_paths_hidden: true,
        raw_memory_hidden: true,
        shareable_by_default: false,
        privacy_scan: {
          schema: 'enigma.desktop_public_export_privacy_scan.v1',
          status: 'pass',
          export_allowed: true,
        },
        export_allowed: true,
      };
    case 'rollback_client_config': {
      const c = clients.find((c) => c.id === args.id);
      if (c) c.status = 'ready';
      return { id: args.id, status: 'ready', action: 'rollback', restored: true, public_safe: true };
    }
    case 'preview_import_text': {
      const text = String(args.text || '');
      const candidateCount = text.split(/\r?\n+/).map((line) => line.trim()).filter(Boolean).length;
      return {
        schema: 'enigma.import_preview.v1',
        candidate_count: candidateCount,
        import_decision: candidateCount > 0 ? 'ready_for_import' : 'empty',
        counts: { dedupe: { duplicate_group_count: 0 } },
        preview_receipt: {
          schema: 'enigma.import_preview_receipt.v1',
          candidate_count: candidateCount,
          duplicate_group_count: 0,
          raw_plaintext_returned: false,
          vault_write_performed: false,
        },
        private_plaintext_boundary: { raw_plaintext_returned: false, write_requires_explicit_approval: true },
      };
    }
    case 'approve_import_text': {
      const text = String(args.text || '');
      const candidateCount = text.split(/\r?\n+/).map((line) => line.trim()).filter(Boolean).length;
      return {
        schema: 'enigma.import_preview.v1',
        candidate_count: candidateCount,
        vault_write_performed: true,
        rollback_available: true,
        rollback_ref: 'latest-import-sandbox-batch',
        raw_report_path_redacted: true,
        import_batch_receipt: {
          schema: 'enigma.import_batch_receipt.v1',
          candidate_count: candidateCount,
          raw_plaintext_returned: false,
        },
        claim_boundaries: { raw_memory_printed: false, provider_deletion_proof: false, model_forgetting_proof: false },
      };
    }
    case 'rollback_import_text': {
      return {
        schema: 'enigma.import_rollback_receipt.v1',
        ok: true,
        rollback_ref: 'latest-import-sandbox-batch',
        requested_write_count: 1,
        tombstoned_count: 1,
        skipped_count: 0,
        raw_report_path_redacted: true,
        claim_boundaries: { local_enigma_vault_only: true, raw_memory_returned: false },
        desktop_surface: {
          schema: 'enigma.desktop_import_rollback_surface.v1',
          local_paths_hidden: true,
          raw_memory_hidden: true,
        },
      };
    }
    case 'get_support_summary':
      return {
        ok: true,
        schema: 'enigma.support_summary.v1',
        support_code: 'ref:support-summary:mock',
        setup_status: { state: 'ready', reasons: [] },
        next_action: { id: 'open_status', label: 'Open status' },
        diagnostics: {
          bundle_initialized_ok: true,
          connector_summary: { ready: clients.filter((c) => c.status === 'connected').length, needs_repair: 0 },
        },
        issue_codes: [],
        redaction: {
          raw_memory_included: false,
          prompts_included: false,
          transcripts_included: false,
          credentials_included: false,
          provider_responses_included: false,
          local_paths_redacted: true,
        },
        claim_boundaries: {
          local_enigma_status_only: true,
          provider_deletion_proof: false,
          model_forgetting_proof: false,
          hosted_saas_live: false,
        },
        desktop_surface: {
          schema: 'enigma.desktop_support_summary_surface.v1',
          local_paths_hidden: true,
          raw_memory_hidden: true,
          shareable_by_default: false,
          privacy_scan_status: 'pass',
          export_allowed: true,
        },
        privacy_scan: {
          schema: 'enigma.desktop_public_export_privacy_scan.v1',
          status: 'pass',
          export_allowed: true,
          local_paths_denied: true,
          credentials_denied: true,
        },
        export_allowed: true,
      };
    case 'export_support_summary':
      return {
        exported: true,
        schema: 'enigma.desktop_support_summary_export.v1',
        path: '<support-summary-file>',
        local_paths_hidden: true,
        raw_memory_hidden: true,
        shareable_by_default: false,
        privacy_scan: {
          schema: 'enigma.desktop_public_export_privacy_scan.v1',
          status: 'pass',
          export_allowed: true,
        },
        export_allowed: true,
      };
    case 'get_diagnostics':
      return { status: 'passed', summary: 'Local checks completed.', issue_codes: [] };
    case 'export_diagnostics':
      return { exported: true, path: '<redacted-path>' };
    case 'check_update':
      return { status: 'current', current_version: '0.1.19', available_version: '0.1.19' };
    case 'start_service':
    case 'get_service_status':
      return { running: true, pid: 12345, restarts: 0, uptime_secs: 0 };
    case 'stop_service':
      return { running: false, pid: 0, restarts: 0, uptime_secs: 0 };
    case 'get_service_logs':
      return ['[mock] service started', '[mock] ready'];
    case 'create_memory_drive':
      return { ok: true, memory_drive_status: 'ready', health_status: 'healthy', offline_ready: serviceStatus?.running === true };
    case 'get_memory_drive_status':
      return { memory_drive_status: 'ready', health_status: 'healthy' };
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

function safePublicLabel(value, fallback, max = 120) {
  const text = String(value ?? '').trim();
  if (!text || PUBLIC_UNSAFE_TEXT_RE.test(text)) return fallback;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function controllerRecord(...records) {
  return records.find((record) => record && typeof record === 'object') || {};
}

function controllerStatus(value, allowed, fallback) {
  const status = String(value || '').replace(/_/g, '-').toLowerCase();
  return allowed.includes(status) ? status : fallback;
}

function controllerActionFrom(nextAction, weatherStatus) {
  const action = String(nextAction || '').replace(/-/g, '_').toLowerCase();
  if (action === 'close_private_bubbles') return { label: 'Close private bubble', action: 'close-private-bubble' };
  if (action === 'review_grants' || action === 'ask_for_consent') return { label: 'Review app permissions', action: 'review-grants' };
  if (action === 'review_policy' || action === 'inspect_receipts') return { label: 'Review recall', action: 'review-recall' };
  if (weatherStatus === 'storm-warning') return { label: 'Review recall', action: 'review-recall' };
  if (weatherStatus === 'needs-attention') return { label: 'Review app permissions', action: 'review-grants' };
  return controllerUi.privateBubbleOpen
    ? { label: 'Close private bubble', action: 'close-private-bubble' }
    : { label: 'Open private bubble', action: 'open-private-bubble' };
}

function getMemoryControllerView() {
  const source = controllerRecord(health.memory_controller, health.memoryController, health.controller);
  const weather = controllerRecord(source.memory_weather_report, source.weather_report, source.weather, health.memory_weather_report);
  const grant = controllerRecord(source.consent_grant, source.grant, source.app_permissions, health.consent_grant);
  const recall = controllerRecord(source.recall_veto_decision, source.recall, health.recall_veto_decision);
  const bubble = controllerRecord(source.private_memory_bubble, source.privateBubble, health.private_memory_bubble);
  const connectedCount = Number(health.connected_app_count ?? clients.filter((client) => normalizeClientStatus(client) === 'connected').length);
  const issueCodes = Array.isArray(health.issue_codes) ? health.issue_codes : [];
  const proofStatus = String(health.proof_status || '').toLowerCase();
  const derivedWeatherStatus = issueCodes.length
    ? 'needs_attention'
    : proofStatus === 'failed' || proofStatus === 'error'
      ? 'storm_warning'
      : connectedCount > 0 || proofStatus === 'active' || proofStatus === 'checked'
        ? 'sunny'
        : 'needs_attention';
  const rawWeather = controllerUi.grantsReviewed ? 'sunny' : weather.status || source.status || health.memory_weather_status || derivedWeatherStatus;
  const weatherStatus = controllerStatus(rawWeather, ['sunny', 'needs-attention', 'storm-warning'], 'needs-attention');
  const weatherLabels = {
    sunny: 'Clear',
    'needs-attention': 'Needs review',
    'storm-warning': 'Sharing paused',
  };
  const weatherAction = controllerActionFrom(controllerUi.grantsReviewed ? 'open_private_bubble' : weather.next_action || source.next_action, weatherStatus);
  const grantStatus = controllerUi.grantsReviewed ? (connectedCount > 0 ? 'active' : 'missing') : controllerStatus(grant.status || health.consent_grant_status || (connectedCount > 0 ? 'active' : 'missing'), ['active', 'expired', 'revoked', 'missing'], connectedCount > 0 ? 'active' : 'missing');
  const localRecallDecision = controllerUi.recallDecision && controllerUi.recallDecision !== 'ask' ? controllerUi.recallDecision : undefined;
  const recallDecision = localRecallDecision || controllerStatus(recall.decision || health.recall_decision || 'ask', ['allow', 'ask', 'deny'], 'ask');
  const rawBubbleStatus = controllerUi.privateBubbleTouched ? (controllerUi.privateBubbleOpen ? 'open' : 'closed') : bubble.status || (controllerUi.privateBubbleOpen ? 'open' : 'closed');
  const bubbleStatus = controllerStatus(rawBubbleStatus, ['open', 'closed', 'kept', 'discarded', 'expired'], controllerUi.privateBubbleOpen ? 'open' : 'closed');
  const recallReviewOpen = controllerUi.recallReviewOpen === true;
  const recallPrimaryAction = recallReviewOpen
    ? recallDecision === 'allow'
      ? { label: 'Keep not shared', action: 'deny-recall' }
      : { label: 'Approve this local recall', action: 'approve-recall' }
    : { label: 'Review recall', action: 'review-recall' };
  const recallSecondaryActions = recallReviewOpen && recallDecision !== 'deny'
    ? [{ label: 'Keep not shared', action: 'deny-recall' }]
    : [];

  return {
    weather: {
      status: weatherStatus,
      label: safePublicLabel(controllerUi.grantsReviewed ? 'Clear' : weather.label, weatherLabels[weatherStatus]),
      summary: safePublicLabel(controllerUi.grantsReviewed ? 'App permissions were reviewed locally. Enigma still asks before sharing memory.' : weather.summary, weatherStatus === 'sunny' ? 'Local checks are clear. Enigma still asks before sharing memory.' : 'Review local permissions before a connected app receives memory.'),
      action: weatherAction,
    },
    grant: {
      status: grantStatus,
      label: safePublicLabel(controllerUi.grantsReviewed ? 'App permissions reviewed locally' : grant.label, grantStatus === 'active' ? 'Connected apps must ask first' : 'No app has permission yet'),
      summary: safePublicLabel(grant.summary, 'App permissions decide which local apps may ask Enigma for context.'),
      action: { label: 'Review app permissions', action: 'review-grants' },
    },
    recall: {
      status: recallDecision,
      label: safePublicLabel(localRecallDecision === 'allow' ? 'Approved for this local request' : localRecallDecision === 'deny' ? 'Kept not shared locally' : recall.label, recallDecision === 'allow' ? 'Approved for this local request' : recallDecision === 'deny' ? 'Kept not shared locally' : recallReviewOpen ? 'Reviewing local recall' : 'Waiting for your approval'),
      summary: safePublicLabel(localRecallDecision === 'allow' ? 'Approved only for this local request.' : localRecallDecision === 'deny' ? 'Not shared for this local request.' : recall.share_status || recall.summary, recallDecision === 'allow' ? 'Approved only for this local request.' : recallDecision === 'deny' ? 'Not shared for this local request.' : recallReviewOpen ? 'Review is open. Nothing is shared until you choose Approve.' : 'Not shared until you approve.'),
      action: recallPrimaryAction,
      secondary_actions: recallSecondaryActions,
    },
    bubble: {
      status: bubbleStatus,
      label: safePublicLabel(controllerUi.privateBubbleTouched ? (bubbleStatus === 'open' ? 'Private bubble open' : 'Private bubble closed') : bubble.label, bubbleStatus === 'open' ? 'Private bubble open' : 'Private bubble closed'),
      summary: safePublicLabel(controllerUi.privateBubbleTouched ? (bubbleStatus === 'open' ? 'Draft memory stays local while you decide.' : 'Private bubble closed locally. Nothing has been shared.') : bubble.summary, bubbleStatus === 'open' ? 'Draft memory stays local while you decide.' : 'Open a local bubble to review memory before sharing.'),
      action: bubbleStatus === 'open'
        ? { label: 'Close private bubble', action: 'close-private-bubble' }
        : { label: 'Open private bubble', action: 'open-private-bubble' },
    },
  };
}

function renderControllerTile(title, item) {
  const secondaryActions = Array.isArray(item.secondary_actions)
    ? item.secondary_actions.map((action) => secondaryButton(action.label, action.action)).join('')
    : '';
  return `
    <div class="controller-tile">
      <div class="controller-tile__heading">
        <dt>${escapeHtml(title)}</dt>
        <span class="status-pill ${escapeHtml(item.status)}">${escapeHtml(item.label)}</span>
      </div>
      <dd>${escapeHtml(item.summary)}</dd>
      <div class="controller-tile__actions">
        ${primaryButton(item.action.label, item.action.action)}
        ${secondaryActions}
      </div>
    </div>
  `;
}

function renderMemoryControllerSection() {
  const controller = getMemoryControllerView();
  return `
    <section class="dashboard-section memory-controller" aria-labelledby="memory-controller-title">
      <div class="memory-controller__intro">
        <p class="eyebrow">Memory Controller</p>
        <h2 id="memory-controller-title">What can be shared right now?</h2>
        <p>Enigma shows the local decision before any connected app receives context. The controller can approve recall, keep memory not shared, or hold it in a private bubble while you decide.</p>
        <div class="memory-controller__plain-language" role="note">
          <strong>Read it like a traffic light:</strong> Clear means local checks found no issue and you still approve each app request. Needs review means check permissions. Sharing paused means fix the warning before Enigma shares local context.
        </div>
      </div>
      <dl class="memory-controller-grid">
        ${renderControllerTile('Memory Weather', controller.weather)}
        ${renderControllerTile('App permissions', controller.grant)}
        ${renderControllerTile('Recall approval', controller.recall)}
        ${renderControllerTile('Private memory bubble', controller.bubble)}
      </dl>
    </section>
  `;
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
      <button type="button" class="link" data-action="test-connection" data-id="${id}">Test connection</button>
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
      <button type="button" class="link" data-action="test-connection" data-id="${id}">Test connection</button>
      <button type="button" class="link" data-action="rollback" data-id="${id}">Rollback</button>
    `;
  }
  const actionLabel = status === 'skipped' ? 'Connect later' : 'Preview connection';
  const claudeHandoff = client.id === 'claude-desktop'
    ? `<button type="button" class="link" data-action="claude-mcpb-handoff" data-id="${id}">Claude extension handoff</button>`
    : '';
  return `<button type="button" class="link" data-action="connect" data-id="${id}">${escapeHtml(actionLabel)}</button>${claudeHandoff}`;
}

function renderConnectionPreview(client) {
  if (!connectionPreview || connectionPreview.id !== client.id) return '';
  const plan = connectionPreview.plan && typeof connectionPreview.plan === 'object' ? connectionPreview.plan : {};
  const changed = plan.changed === false ? 'No config change needed' : 'Config change planned';
  const restart = plan.restart_guidance ? `Restart: ${safePublicLabel(plan.restart_guidance, 'Restart the app after approval.')}` : 'Restart: app may need a restart after approval.';
  return `
    <div class="connection-preview">
      <p class="note"><strong>Review first.</strong> ${escapeHtml(changed)}. Writes performed: ${plan.writes_performed === true ? 'yes' : 'no'}.</p>
      <p class="note">${escapeHtml(restart)}</p>
      <div class="client-actions">
        <button type="button" class="client-primary" data-action="approve-connect" data-id="${escapeHtml(client.id)}">Approve connection</button>
        <button type="button" class="link" data-action="cancel-connect-preview" data-id="${escapeHtml(client.id)}">Cancel</button>
      </div>
    </div>
  `;
}

function renderClaudeMcpbHandoff(client) {
  if (!claudeMcpbHandoff || client.id !== 'claude-desktop') return '';
  const plan = claudeMcpbHandoff.connection_plan && typeof claudeMcpbHandoff.connection_plan === 'object' ? claudeMcpbHandoff.connection_plan : {};
  const health = claudeMcpbHandoff.health && typeof claudeMcpbHandoff.health === 'object' ? claudeMcpbHandoff.health : {};
  return `
    <div class="connection-preview claude-mcpb-handoff">
      <p class="note"><strong>Claude-first path.</strong> Preferred install: ${escapeHtml(claudeMcpbHandoff.preferred_path || 'mcpb_extension')}. Writes performed: ${claudeMcpbHandoff.writes_performed === true ? 'yes' : 'no'}.</p>
      <p class="note">Claude confirms install: ${plan.install_handoff?.user_confirms_in_claude === true ? 'yes' : 'review required'} · Enigma writes Claude config: ${plan.install_handoff?.enigma_writes_claude_config === true ? 'yes' : 'no'} · Status: ${escapeHtml(health.status || 'not_installed')}</p>
      <p class="note">Next: ${escapeHtml(claudeMcpbHandoff.next_action?.label || 'Install Claude extension')}</p>
    </div>
  `;
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
              ${renderConnectionPreview(client)}
              ${renderClaudeMcpbHandoff(client)}
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

function renderImportSandboxSection() {
  const preview = importSandbox.preview;
  const result = importSandbox.result;
  const rollback = importSandbox.rollback;
  const previewCount = preview?.candidate_count ?? preview?.preview_receipt?.candidate_count ?? 0;
  const duplicateCount = preview?.counts?.dedupe?.duplicate_group_count ?? preview?.preview_receipt?.duplicate_group_count ?? 0;
  const resultCount = result?.import_batch_receipt?.candidate_count ?? result?.candidate_count ?? 0;
  const rollbackCount = rollback?.tombstoned_count ?? 0;
  const rollbackAvailable = result?.rollback_available === true;
  return `
    <section class="dashboard-section import-sandbox" aria-labelledby="import-sandbox-title">
      <p class="eyebrow">Import Sandbox</p>
      <h2 id="import-sandbox-title">Bring memories in safely</h2>
      <p>Paste plain text or Markdown, preview counts and duplicate groups, then approve one local write. Raw text stays inside this local screen and is cleared after approval.</p>
      <textarea id="import-sandbox-text" rows="5" placeholder="One memory per line. Example: I prefer concise setup steps."></textarea>
      <div class="button-row">
        ${primaryButton('Preview import', 'preview-import-text')}
        <button type="button" class="secondary" data-action="approve-import-text" ${preview ? '' : 'disabled'}>Approve preview</button>
        <button type="button" class="secondary" data-action="rollback-import-text" ${rollbackAvailable ? '' : 'disabled'}>Rollback last import</button>
        ${secondaryButton('Clear import', 'clear-import-text')}
      </div>
      ${preview ? `<p class="note">Preview ready: ${escapeHtml(String(previewCount))} candidates, ${escapeHtml(String(duplicateCount))} duplicate groups, decision ${escapeHtml(preview.import_decision || 'unknown')}.</p>` : ''}
      ${result ? `<p class="note">Import written locally: ${escapeHtml(String(resultCount))} candidates. Batch receipt returned without raw memory text. Rollback is available from the latest local import report.</p>` : ''}
      ${rollback ? `<p class="note">Rollback complete: ${escapeHtml(String(rollbackCount))} local memories tombstoned. Rollback receipt returned without raw memory text.</p>` : ''}
      ${importSandbox.error ? `<p class="note">Import needs attention: ${escapeHtml(importSandbox.error)}</p>` : ''}
      <p class="note">Import and rollback receipts prove Enigma-local vault activity only. They do not prove changes outside Enigma or model behavior changes.</p>
    </section>
  `;
}

function publicExportScanStatus(surface = {}) {
  const scan = surface.privacy_scan && typeof surface.privacy_scan === 'object' ? surface.privacy_scan : {};
  const status = scan.status || (surface.export_allowed ? 'pass' : 'not_checked');
  return {
    status,
    exportAllowed: scan.export_allowed === true || surface.export_allowed === true,
  };
}

function renderProofActivitySection() {
  const activity = proofActivity?.schema ? proofActivity : health.proof_activity || {};
  const receiptCount = activity.receipt_count ?? 0;
  const activeCount = activity.active_memory_count ?? 0;
  const tombstoneCount = activity.tombstoned_memory_count ?? 0;
  const verifierStatus = activity.verifier_status || 'not_run';
  const evidenceStatus = activity.evidence_status || 'local_counts_and_roots_only';
  const scan = publicExportScanStatus(activity);
  const exported = activity.exported?.schema === 'enigma.desktop_proof_activity_export.v1';
  return `
    <section class="dashboard-section proof-activity" aria-labelledby="proof-activity-title">
      <p class="eyebrow">Proof Activity</p>
      <h2 id="proof-activity-title">What Enigma can prove locally</h2>
      <p>Review local receipt counts, Memory Drive roots, and verifier state without exposing memory text, prompts, transcripts, provider responses, or local paths.</p>
      <div class="dashboard-grid">
        <div class="metric"><dt>Receipts</dt><dd>${escapeHtml(String(receiptCount))}</dd></div>
        <div class="metric"><dt>Active memories</dt><dd>${escapeHtml(String(activeCount))}</dd></div>
        <div class="metric"><dt>Tombstones</dt><dd>${escapeHtml(String(tombstoneCount))}</dd></div>
        <div class="metric"><dt>Verifier</dt><dd>${escapeHtml(verifierStatus)}</dd></div>
      </div>
      <p class="note">Evidence status: ${escapeHtml(evidenceStatus)}. Privacy scan: ${escapeHtml(scan.status)}. This is Enigma-controlled local evidence only; it does not prove outside-provider changes or model behavior changes.</p>
      ${exported ? `<p class="note">Proof activity export ready. File location is hidden in this view.</p>` : ''}
      <div class="button-row">
        ${primaryButton('Refresh proof activity', 'refresh-proof-activity')}
        <button type="button" class="secondary" data-action="export-proof-activity" ${activity.schema && scan.exportAllowed ? '' : 'disabled'}>Export proof activity</button>
      </div>
    </section>
  `;
}

function renderSupportSummarySection() {
  const summary = supportSummary?.schema ? supportSummary : {};
  const setupState = summary.setup_status?.state || 'not collected';
  const issueCount = Array.isArray(summary.issue_codes) ? summary.issue_codes.length : 0;
  const nextLabel = summary.next_action?.label || 'Collect support summary';
  const supportCode = summary.support_code || 'not collected';
  const scan = publicExportScanStatus(summary);
  const exported = summary.exported?.schema === 'enigma.desktop_support_summary_export.v1';
  return `
    <section class="dashboard-section support-summary" aria-labelledby="support-summary-title">
      <p class="eyebrow">Support summary</p>
      <h2 id="support-summary-title">Shareable status without private memory</h2>
      <p>Collect a public-safe support summary with setup state, issue count, next action, and redaction flags. It never includes raw memory, prompts, transcripts, credentials, provider responses, or local paths.</p>
      <div class="dashboard-grid">
        <div class="metric"><dt>Setup state</dt><dd>${escapeHtml(setupState)}</dd></div>
        <div class="metric"><dt>Issue codes</dt><dd>${escapeHtml(String(issueCount))}</dd></div>
        <div class="metric"><dt>Next action</dt><dd>${escapeHtml(nextLabel)}</dd></div>
        <div class="metric"><dt>Support code</dt><dd>${escapeHtml(supportCode)}</dd></div>
      </div>
      <p class="note">Local Enigma status only. Privacy scan: ${escapeHtml(scan.status)}. Summary sharing is explicit; Enigma does not claim outside-provider changes, model behavior changes, or hosted service readiness.</p>
      ${exported ? `<p class="note">Support summary export ready. File location is hidden in this view.</p>` : ''}
      <div class="button-row">
        ${primaryButton('Collect support summary', 'collect-support-summary')}
        <button type="button" class="secondary" data-action="export-support-summary" ${summary.schema && scan.exportAllowed ? '' : 'disabled'}>Export support summary</button>
      </div>
    </section>
  `;
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

function normalizeMemoryDriveStatus(status) {
  const value = String(status || 'unknown').toLowerCase();
  if (value === 'healthy' || value === 'ready') return 'ready';
  if (value === 'watch' || value === 'degraded' || value === 'critical') return 'ready';
  if (value === 'missing' || value === 'creating' || value === 'error') return value;
  return 'unknown';
}

function dashboardNextAction({ memoryDriveStatus, offlineReady, serviceRunning, updateAvailable }) {
  if (memoryDriveStatus !== 'ready') {
    return { label: 'Create Memory Drive', action: 'create-vault-action', reason: 'Create the local encrypted Memory Drive before importing or connecting apps.' };
  }
  if (!serviceRunning) {
    return { label: 'Start engine', action: 'start-service', reason: 'Start the bundled local service so connected apps can talk to Enigma.' };
  }
  if (!offlineReady) {
    return { label: 'Run health check', action: 'run-health', reason: 'Check local vault, privacy guardrails, and app connection readiness.' };
  }
  if (Number(health.connected_app_count ?? 0) === 0) {
    return { label: 'Connect apps', action: 'detect-clients', reason: 'Find Claude, Cursor, or another supported app and connect it without editing JSON.' };
  }
  if (diagnostics?.status === 'needs-review' || diagnostics?.status === 'error') {
    return { label: 'Run diagnostics', action: 'run-diagnostics', reason: 'Create a public-safe support summary before asking for help.' };
  }
  if (updateAvailable) {
    return { label: 'Check for updates', action: 'check-update', reason: 'A local desktop update may be available.' };
  }
  return { label: 'Review proof activity', action: 'run-health', reason: 'Memory Drive is ready. Review receipts and proof status when you want assurance.' };
}

function renderNextActionSection(action) {
  return `
    <section class="dashboard-section next-action" aria-labelledby="next-action-title">
      <p class="eyebrow">One next step</p>
      <h2 id="next-action-title">${escapeHtml(action.label)}</h2>
      <p>${escapeHtml(action.reason)}</p>
      <p class="note">This is local Enigma status only. No raw memory, local paths, provider responses, or outside-Enigma control claims are shown.</p>
      <div class="button-row">
        ${primaryButton(action.label, action.action)}
      </div>
    </section>
  `;
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
  const memoryDriveStatus = normalizeMemoryDriveStatus(health.memory_drive_status);
  const offlineReady = serviceRunning && health.offline_ready === true;
  const nextAction = dashboardNextAction({ memoryDriveStatus, offlineReady, serviceRunning, updateAvailable });

  return renderCard(`
    <p class="eyebrow">Memory health</p>
    <h1>Health dashboard</h1>
    <p>A simple check that your vault, app connections, and privacy checks are working.</p>
    <div class="dashboard-grid">
      <div class="metric"><dt>Memory Drive</dt><dd>${escapeHtml(memoryDriveStatus)}</dd></div>
      <div class="metric"><dt>Health</dt><dd>${escapeHtml(health.health_status || 'unknown')}</dd></div>
      <div class="metric"><dt>Connected apps</dt><dd>${escapeHtml(String(health.connected_app_count ?? 0))}</dd></div>
      <div class="metric"><dt>Proof activity</dt><dd>${escapeHtml(health.proof_status || 'idle')}</dd></div>
      <div class="metric"><dt>Update status</dt><dd>${escapeHtml(updateStatus)}</dd></div>
      <div class="metric"><dt>Diagnostics</dt><dd>${escapeHtml(health.diagnostics_status || 'idle')}</dd></div>
      <div class="metric"><dt>Offline ready</dt><dd>${offlineReady ? 'Yes' : 'No'}</dd></div>
    </div>
    <div class="metric">
      <dt>Issue codes</dt>
      <ul class="issue-list">${issueTags}</ul>
    </div>

    ${renderNextActionSection(nextAction)}

    ${renderMemoryControllerSection()}
    ${renderProofActivitySection()}
    ${renderImportSandboxSection()}


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
    ${renderSupportSummarySection()}

    <div class="dashboard-section">
      <h2>Update check</h2>
      <p>Current version: ${escapeHtml(update?.current_version || '0.1.19')}</p>
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
  `, 'memoryController');
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
  persistWizardResumeState();
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


function settledValue(result, fallback) {
  return result.status === 'fulfilled' ? result.value : fallback;
}

async function hydrateDashboardState() {
  dashboardHydration = { status: 'refreshing', error: null, last_updated: dashboardHydration.last_updated };
  const [
    clientsResult,
    healthResult,
    serviceResult,
    logsResult,
    diagnosticsResult,
    updateResult,
    proofResult,
    crashResult,
  ] = await Promise.allSettled([
    call('detect_clients'),
    call('get_health'),
    call('get_service_status'),
    call('get_service_logs', { limit: 100 }),
    call('get_diagnostics'),
    call('check_update'),
    call('get_proof_activity'),
    call('get_crash_reporting_status'),
  ]);

  clients = settledValue(clientsResult, clients);
  health = settledValue(healthResult, health);
  serviceStatus = settledValue(serviceResult, serviceStatus);
  serviceLogs = settledValue(logsResult, serviceLogs);
  diagnostics = settledValue(diagnosticsResult, diagnostics);
  update = settledValue(updateResult, update);
  proofActivity = settledValue(proofResult, health.proof_activity?.schema ? health.proof_activity : proofActivity);
  crashReporting.status = settledValue(crashResult, crashReporting.status);
  health.proof_status = proofActivity?.proof_status || health.proof_status;
  health.proof_activity = proofActivity;
  dashboardHydration = { status: 'ready', error: null, last_updated: new Date().toISOString() };
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
      currentStep = 1;
      render();
      setStatus('Choose where Enigma keeps your private vault.');
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
      setStatus('Preparing a path-redacted connection preview...');
      try {
        connectionPreview = await call('preview_client_config', { id });
        busy = false;
        render();
        setStatus('Review the connection preview, then approve before Enigma writes anything.');
      } catch (_) {
        connectionPreview = null;
        busy = false;
        render();
        setStatus('Connection preview could not complete. No config details were shown.');
      }
      return;
    }
    case 'claude-mcpb-handoff': {
      busy = true;
      setStatus('Preparing Claude extension handoff...');
      try {
        claudeMcpbHandoff = await call('get_claude_mcpb_handoff');
        busy = false;
        render();
        setStatus('Claude extension handoff ready. Enigma did not write Claude config.');
      } catch (_) {
        claudeMcpbHandoff = null;
        busy = false;
        render();
        setStatus('Claude extension handoff could not load. No config was written.');
      }
      return;
    }
    case 'approve-connect': {
      const id = event.currentTarget.dataset.id;
      connectionPreview = null;
      await runClientCommand({
        command: 'connect_client',
        args: { id },
        pending: 'Writing approved connection...',
        success: 'Connection updated. Restart the app if it asks.',
        failure: 'Connection could not complete. No config details were shown.',
      });
      return;
    }
    case 'cancel-connect-preview':
      connectionPreview = null;
      render();
      setStatus('Connection preview cancelled. No config was written.');
      return;
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
    case 'test-connection': {
      const id = event.currentTarget.dataset.id;
      await runClientCommand({
        command: 'test_client_config',
        args: { id },
        pending: 'Testing local connector...',
        success: 'Local connector test complete. If the app is open, restart it before using the connection.',
        failure: 'Connector test could not complete. No config details were shown.',
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
    case 'preview-import-text': {
      const text = $('#import-sandbox-text')?.value || '';
      busy = true;
      importSandbox.error = null;
      setStatus('Previewing import...');
      try {
        const preview = await call('preview_import_text', { text });
        importSandbox = { preview, result: null, rollback: null, error: null, pendingText: text };
        setStatus('Preview ready. Review counts before approval.');
      } catch (_) {
        importSandbox = { preview: null, result: null, rollback: null, error: 'Preview failed without exposing text.', pendingText: '' };
        setStatus('Preview failed. Raw text was not shown.');
      }
      busy = false;
      render();
      return;
    }
    case 'approve-import-text': {
      if (!importSandbox.preview || !importSandbox.pendingText) {
        setStatus('Preview an import before approving it.');
        return;
      }
      busy = true;
      importSandbox.error = null;
      setStatus('Writing import locally...');
      try {
        const result = await call('approve_import_text', { text: importSandbox.pendingText });
        importSandbox = { preview: null, result, rollback: null, error: null, pendingText: '' };
        health = await call('get_health');
        proofActivity = health.proof_activity?.schema ? health.proof_activity : await call('get_proof_activity');
        setStatus('Import written locally. Batch receipt and rollback are available.');
      } catch (_) {
        importSandbox = { ...importSandbox, error: 'Approval failed without exposing text.' };
        setStatus('Approval failed. Raw text was not shown.');
      }
      busy = false;
      render();
      return;
    }
    case 'rollback-import-text': {
      if (!importSandbox.result?.rollback_available) {
        setStatus('Approve an import before rolling it back.');
        return;
      }
      if (!confirm('Rollback the latest Import Sandbox write? This tombstones Enigma-local memories only.')) {
        return;
      }
      busy = true;
      importSandbox.error = null;
      setStatus('Rolling back latest import locally...');
      try {
        const rollback = await call('rollback_import_text');
        importSandbox = { preview: null, result: null, rollback, error: null, pendingText: '' };
        health = await call('get_health');
        proofActivity = health.proof_activity?.schema ? health.proof_activity : await call('get_proof_activity');
        setStatus('Import rollback complete. Receipt returned without raw memory.');
      } catch (_) {
        importSandbox = { ...importSandbox, error: 'Rollback failed without exposing text.' };
        setStatus('Rollback failed. Raw text was not shown.');
      }
      busy = false;
      render();
      return;
    }
    case 'clear-import-text':
      importSandbox = { preview: null, result: null, rollback: null, error: null, pendingText: '' };
      render();
      setStatus('Import text cleared from this screen.');
      return;
    case 'refresh-proof-activity': {
      busy = true;
      setStatus('Refreshing proof activity...');
      proofActivity = await call('get_proof_activity');
      health.proof_status = proofActivity.proof_status || health.proof_status;
      health.proof_activity = proofActivity;
      busy = false;
      render();
      setStatus('Proof activity refreshed without exposing raw memory.');
      return;
    }
    case 'export-proof-activity': {
      if (!proofActivity?.schema) {
        setStatus('Refresh proof activity before exporting it.');
        return;
      }
      if (!confirm('Export a public-safe proof activity JSON file? No raw memory or local paths will be included.')) {
        return;
      }
      busy = true;
      setStatus('Exporting public-safe proof activity...');
      try {
        const exported = await call('export_proof_activity', { approve: true });
        proofActivity = { ...proofActivity, exported };
        health.proof_activity = proofActivity;
        setStatus('Proof activity exported. The file location is hidden in this view.');
      } catch (_) {
        proofActivity = { ...proofActivity, export_error: 'privacy_scan_blocked' };
        setStatus('Proof activity export blocked by the desktop privacy scan.');
      }
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
      proofActivity = health.proof_activity?.schema ? health.proof_activity : await call('get_proof_activity');
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
      busy = true;
      setStatus('Refreshing dashboard...');
      render();
      await hydrateDashboardState();
      busy = false;
      render();
      setStatus('Dashboard refreshed with current local status.');
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
    case 'collect-support-summary': {
      busy = true;
      setStatus('Collecting public-safe support summary...');
      supportSummary = await call('get_support_summary');
      busy = false;
      render();
      setStatus('Support summary collected without raw memory or local paths.');
      return;
    }
    case 'export-support-summary': {
      if (!supportSummary?.schema) {
        setStatus('Collect a support summary before exporting it.');
        return;
      }
      if (!confirm('Export a public-safe support summary JSON file? No raw memory or local paths will be included.')) {
        return;
      }
      busy = true;
      setStatus('Exporting public-safe support summary...');
      try {
        const exported = await call('export_support_summary', { approve: true });
        supportSummary = { ...supportSummary, exported };
        setStatus('Support summary exported. The file location is hidden in this view.');
      } catch (_) {
        supportSummary = { ...supportSummary, export_error: 'privacy_scan_blocked' };
        setStatus('Support summary export blocked by the desktop privacy scan.');
      }
      busy = false;
      render();
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
    case 'review-grants':
      controllerUi.grantsReviewed = true;
      render();
      setStatus('App permissions reviewed locally. Connected apps still ask before Enigma shares context.');
      return;
    case 'open-private-bubble':
      controllerUi.privateBubbleOpen = true;
      controllerUi.privateBubbleTouched = true;
      render();
      setStatus('Private memory bubble opened locally. Nothing has been shared.');
      return;
    case 'close-private-bubble':
      controllerUi.privateBubbleOpen = false;
      controllerUi.privateBubbleTouched = true;
      render();
      setStatus('Private memory bubble closed locally. Nothing has been shared.');
      return;
    case 'review-recall':
      controllerUi.recallReviewOpen = true;
      render();
      setStatus('Recall review opened. Nothing has been shared.');
      return;
    case 'approve-recall':
      controllerUi.recallDecision = 'allow';
      controllerUi.recallReviewOpen = false;
      render();
      setStatus('Recall approved for this local request only.');
      return;
    case 'deny-recall':
      controllerUi.recallDecision = 'deny';
      controllerUi.recallReviewOpen = false;
      render();
      setStatus('Recall kept not shared for this local request.');
      return;
    default:
      return;
  }
}

async function init() {
  restoreWizardResumeState();
  render();
  if (currentStep === 6) {
    setStatus('Refreshing dashboard...');
    await hydrateDashboardState();
    render();
    setStatus('Dashboard refreshed with current local status.');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
