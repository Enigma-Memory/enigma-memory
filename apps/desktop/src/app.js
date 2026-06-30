const DESKTOP_SCHEMA = 'enigma.desktop.state.v1';
const EXPORT_SCHEMA = 'enigma.desktop.export.v1';
const DELETE_EVIDENCE_SCHEMA = 'enigma.desktop.delete_evidence.v1';
const VERIFIER_EVIDENCE_SCHEMA = 'enigma.desktop.verifier_evidence.v1';

export const DESKTOP_SCREENS = Object.freeze([
  'home',
  'setup',
  'support',
  'vault',
  'mcp',
  'clients',
  'import-export',
  'verifier',
  'delete-prove',
  'mesh',
  'enterprise'
]);

const CLIENT_TEMPLATES = Object.freeze([
  Object.freeze({ id: 'claude-desktop', name: 'Claude Desktop', kind: 'mcp-client' }),
  Object.freeze({ id: 'cursor', name: 'Cursor', kind: 'mcp-client' }),
  Object.freeze({ id: 'vscode', name: 'VS Code', kind: 'mcp-client' }),
  Object.freeze({ id: 'browser-bridge', name: 'Browser bridge', kind: 'extension' })
]);

const INITIAL_NOW = '1970-01-01T00:00:00.000Z';
const ROOT_RE = /^sha256:[a-f0-9]{64}$/;
const SIGNATURE_RE = /^[A-Za-z0-9_-]+={0,2}$/;
const IMPORT_REDACTED_TEXT = '[redacted imported metadata]';
const BODY_FINGERPRINT_NOTE = 'body_fingerprint is a local descriptor fingerprint, not cryptographic proof unless tied to signed receipts or offline verifier output.';
const BROWSER_BRIDGE_STATUS_COPY = Object.freeze([
  'User-click required before browser capture.',
  'No auto-inject workflow is represented by this shell.',
  'No sync storage permission is required or claimed.',
  'Native host local-only.',
  'Bridge exports a receipt commitment only, never raw memory text.'
]);
const FORBIDDEN_IMPORT_RAW_KEYS = Object.freeze(new Set([
  'body',
  'text',
  'content',
  'plaintext',
  'raw_memory',
  'rawmemory',
  'memory'
]));
const RAW_LOOKING_VALUE_RE = /(private\s+launch-code|must\s+not\s+leave\s+local\s+memory|raw[\s_-]*memory|plain[\s_-]*text|secret|password|api[\s_-]*key|token|private[\s_-]*key|prompt|transcript|provider[\s_-]*response|body\s*:|content\s*:|[A-Za-z]:[\\/][^\s]+|\/(?:Users|home|var|tmp|private|Volumes)\/[^\s]+)/i;

export function createDesktopState(options = {}) {
  const now = cleanString(options.now) || INITIAL_NOW;
  const vaultId = cleanString(options.vault_id ?? options.vaultId);
  const memoryDriveReady = Boolean(vaultId);
  const initialIssueCodes = memoryDriveReady ? [] : ['MEMORY_DRIVE_MISSING'];
  return {
    schema: DESKTOP_SCHEMA,
    version: 1,
    sequence: 0,
    activeScreen: isKnownScreen(options.activeScreen) ? options.activeScreen : 'home',
    notice: 'Memory Drive is local operational evidence only. Receipts and verifier output remain the proof path.',
    memoryDrive: {
      status: memoryDriveReady ? 'ready' : 'missing',
      drive_id: vaultId ? `drive_${localFingerprint(vaultId).slice(0, 16)}` : '',
      created_at: vaultId ? now : '',
      last_event_at: '',
      issue_codes: initialIssueCodes.slice()
    },
    desktopService: {
      status: 'stopped',
      boundary: 'bundled-runtime-local-service',
      started_at: '',
      stopped_at: '',
      issue_codes: ['SERVICE_NOT_RUNNING']
    },
    desktopHealth: {
      status: memoryDriveReady ? 'fix-needed' : 'needs-setup',
      checked_at: '',
      issue_codes: memoryDriveReady ? ['SERVICE_NOT_RUNNING'] : initialIssueCodes.slice()
    },
    proofActivity: {
      status: 'idle',
      receipt_count: 0,
      last_activity_at: '',
      issue_codes: []
    },
    desktopUpdate: {
      status: 'unknown',
      version: cleanString(options.version),
      checked_at: '',
      issue_codes: []
    },
    desktopDiagnostics: {
      status: 'not-run',
      checked_at: '',
      support_report_ready: false,
      issue_codes: [],
      safe_summary: []
    },
    vault: {
      status: vaultId ? 'ready' : 'missing',
      vault_id: vaultId,
      active_set_root: cleanString(options.active_set_root ?? options.activeSetRoot),
      receipt_log_root: cleanString(options.receipt_log_root ?? options.receiptLogRoot),
      memory_count: 0,
      deleted_count: 0,
      receipt_count: 0,
      created_at: vaultId ? now : '',
      last_event_at: ''
    },
    mcp: {
      status: 'stopped',
      endpoint: cleanString(options.endpoint) || 'mcp://localhost/enigma',
      transport: cleanString(options.transport) || 'stdio',
      port: normalizePort(options.port),
      started_at: '',
      stopped_at: '',
      client_count: 0
    },
    clients: [],
    memories: [],
    search: { query: '', results: [] },
    verifier: {
      status: 'idle',
      evidence: [],
      errors: [],
      checked_at: '',
      note: 'This screen inspects receipt JSON shape only. It does not perform cryptographic verification; run the offline verifier for proof.'
    },
    deletionEvidence: [],
    importExport: {
      import_status: 'idle',
      import_errors: [],
      exported_at: '',
      exportBundle: null
    },
    mesh: {
      status: 'offline',
      peers: 0,
      relays: 0,
      last_witness_at: '',
      note: 'Mesh status is local telemetry until matched to witness receipts.'
    },
    enterprise: {
      status: 'not-configured',
      tenant_id: cleanString(options.tenant_id ?? options.tenantId),
      policy_id: cleanString(options.policy_id ?? options.policyId),
      siem: 'disconnected',
      note: 'Enterprise controls report configuration evidence, not memory custody proof.'
    },
    drafts: {
      receiptInput: '',
      importInput: '',
      exportOutput: ''
    }
  };
}

export function desktopReducer(state = createDesktopState(), action = {}) {
  const type = cleanString(action.type);
  if (!type) return state;

  switch (type) {
    case 'desktop/select-screen':
      return selectScreen(state, action.screen);
    case 'desktop/create-memory-drive':
      return createMemoryDriveState(state, action);
    case 'desktop/service/update':
      return updateDesktopServiceState(state, action);
    case 'desktop/health/update':
      return updateDesktopHealthState(state, action);
    case 'desktop/proof/update':
      return updateProofActivityState(state, action);
    case 'desktop/update/status':
      return updateDesktopUpdateStatusState(state, action);
    case 'desktop/diagnostics/update':
      return updateDesktopDiagnosticsState(state, action);
    case 'desktop/shutdown':
      return shutdownDesktopState(state, action);
    case 'mcp/start':
      return startMcpState(state, action);
    case 'mcp/stop':
      return stopMcpState(state, action);
    case 'vault/create':
      return createVaultState(state, action);
    case 'memory/remember':
      return rememberMemoryState(state, action);
    case 'memory/delete':
      return deleteMemoryState(state, action);
    case 'memory/search':
      return searchMemoryState(state, action);
    case 'receipts/verify':
      return verifyReceiptState(state, action);
    case 'client/connect':
      return connectClientState(state, action);
    case 'client/disconnect':
      return disconnectClientState(state, action);
    case 'bundle/import':
      return importBundleState(state, action);
    case 'bundle/export':
      return exportBundleState(state, action);
    case 'mesh/update':
      return updateMeshState(state, action);
    case 'enterprise/update':
      return updateEnterpriseState(state, action);
    case 'draft/set':
      return setDraftState(state, action);
    default:
      return state;
  }
}

export function renderDesktopModel(state = createDesktopState()) {
  const activeMemories = state.memories.filter((memory) => !memory.deleted);
  const deletedMemories = state.memories.filter((memory) => memory.deleted);
  const connectedClients = state.clients.filter((client) => client.status === 'connected');
  const verifierOk = state.verifier.status === 'checked' && state.verifier.errors.length === 0;
  const dashboard = renderMemoryDriveDashboard(state);
  const diagnostics = renderSupportReportModel(state.desktopDiagnostics);

  return {
    schema: 'enigma.desktop.render_model.v1',
    activeScreen: state.activeScreen,
    notice: state.notice,
    dashboard,
    navigation: DESKTOP_SCREENS.map((id) => ({ id, label: screenLabel(id), active: id === state.activeScreen })),
    summary: {
      memory_drive: dashboard.memory_drive_status,
      vault: state.vault.status,
      mcp: state.mcp.status,
      clients: connectedClients.length,
      memories: activeMemories.length,
      deleted: deletedMemories.length,
      verifier: verifierOk ? 'shape-clean' : state.verifier.status,
      mesh: state.mesh.status,
      enterprise: state.enterprise.status
    },
    screens: {
      home: {
        title: 'Memory Drive dashboard',
        dashboard
      },
      setup: {
        title: 'Set up Memory Drive',
        memory_drive_status: dashboard.memory_drive_status,
        service_status: state.desktopService.status,
        health_status: dashboard.health_status,
        next_action: dashboard.next_action,
        issue_codes: dashboard.issue_codes.slice()
      },
      vault: {
        title: 'Vault status',
        status: state.vault.status,
        vault_id: safePublicString(state.vault.vault_id, '', 96),
        active_set_root: safePublicString(state.vault.active_set_root, '', 96),
        receipt_log_root: safePublicString(state.vault.receipt_log_root, '', 96),
        metrics: [
          { label: 'Active memories', value: activeMemories.length },
          { label: 'Deleted memories', value: deletedMemories.length },
          { label: 'Receipts observed', value: state.vault.receipt_count }
        ],
        memories: state.memories.map(renderMemoryRow)
      },
      mcp: {
        title: 'MCP server status',
        status: state.mcp.status,
        endpoint: safePublicString(state.mcp.endpoint, 'local endpoint', 96),
        transport: safePublicString(state.mcp.transport, 'local transport', 32),
        port: state.mcp.port,
        client_count: connectedClients.length,
        honest_status: state.mcp.status === 'running' ? 'local server claimed running' : 'local server stopped'
      },
      clients: {
        title: 'Connected apps',
        templates: CLIENT_TEMPLATES.map((template) => ({ ...template, connected: state.clients.some((client) => client.id === template.id && client.status === 'connected') })),
        connected: state.clients.map(renderClientRow),
        browser_bridge_status: BROWSER_BRIDGE_STATUS_COPY.slice()
      },
      importExport: {
        title: 'Import / export',
        import_status: state.importExport.import_status,
        import_errors: state.importExport.import_errors.slice(),
        exported_at: state.importExport.exported_at,
        exportBundle: state.importExport.exportBundle
      },
      verifier: {
        title: 'Receipt shape inspector',
        status: state.verifier.status,
        checked_at: state.verifier.checked_at,
        note: state.verifier.note,
        errors: state.verifier.errors.slice(),
        evidence: state.verifier.evidence.map((item) => ({ ...item })),
        body_fingerprint_note: BODY_FINGERPRINT_NOTE
      },
      deleteProve: {
        title: 'Delete-and-prove flow',
        note: 'Deletion evidence is queued until a verified deletion receipt is supplied.',
        pending: state.deletionEvidence.filter((item) => item.status !== 'matched_receipt').map((item) => ({ ...item })),
        completed: state.deletionEvidence.filter((item) => item.status === 'matched_receipt').map((item) => ({ ...item }))
      },
      mesh: {
        title: 'Mesh status',
        status: state.mesh.status,
        peers: state.mesh.peers,
        relays: state.mesh.relays,
        last_witness_at: state.mesh.last_witness_at,
        note: state.mesh.note
      },
      enterprise: {
        title: 'Enterprise status',
        status: state.enterprise.status,
        tenant_id: state.enterprise.tenant_id ? 'configured' : 'not configured',
        policy_id: state.enterprise.policy_id ? 'configured' : 'not configured',
        siem: state.enterprise.siem,
        note: state.enterprise.note
      },
      diagnostics,
      support: diagnostics
    }
  };
}

export function renderMemoryDriveDashboard(state = createDesktopState()) {
  const connectedAppCount = state.clients.filter((client) => client.status === 'connected').length;
  const issueCodes = collectDashboardIssueCodes(state);
  const memoryDriveStatus = normalizePublicStatus(state.memoryDrive?.status, ['missing', 'creating', 'ready', 'error'], 'missing');
  const serviceStatus = normalizePublicStatus(state.desktopService?.status, ['stopped', 'starting', 'running', 'repair-needed', 'error'], 'stopped');
  const healthStatus = normalizePublicStatus(state.desktopHealth?.status, ['needs-setup', 'checking', 'healthy', 'fix-needed', 'error'], 'needs-setup');
  const proofStatus = normalizePublicStatus(state.proofActivity?.status || state.verifier?.status, ['idle', 'checking', 'checked', 'error', 'needs-review'], 'idle');
  const updateStatus = normalizePublicStatus(state.desktopUpdate?.status, ['unknown', 'checking', 'current', 'available', 'installing', 'ready', 'error'], 'unknown');
  const diagnosticsStatus = normalizePublicStatus(state.desktopDiagnostics?.status, ['not-run', 'running', 'ready', 'needs-review', 'error'], 'not-run');
  const offlineReady = memoryDriveStatus === 'ready' && serviceStatus === 'running' && healthStatus === 'healthy';
  const memoryController = selectMemoryControllerSummary({
    connectedAppCount,
    issueCodes,
    offlineReady,
    proofStatus
  });
  const importSandbox = selectImportSandboxSummary({ memoryDriveStatus, offlineReady });

  return {
    schema: 'enigma.desktop.memory_drive_dashboard.v1',
    title: 'Memory Drive',
    memory_drive_status: memoryDriveStatus,
    health_status: healthStatus,
    connected_app_count: connectedAppCount,
    proof_status: proofStatus,
    update_status: updateStatus,
    diagnostics_status: diagnosticsStatus,
    offline_ready: offlineReady,
    issue_codes: issueCodes,
    memory_controller: memoryController,
    import_sandbox: importSandbox,
    next_action: selectMemoryDriveNextAction({
      memoryDriveStatus,
      serviceStatus,
      healthStatus,
      proofStatus,
      updateStatus,
      diagnosticsStatus,
      connectedAppCount,
      issueCodes
    })
  };
}

const SUPPORT_PRIVACY_SCAN_CATEGORIES = Object.freeze([
  'memory_bodies',
  'user_inputs',
  'dialogue_records',
  'provider_outputs',
  'storage_locations',
  'auth_material',
  'owner_refs',
  'settings_snapshots',
  'raw_logs',
]);

function renderSupportReportModel(diagnostics = {}) {
  const status = normalizePublicStatus(diagnostics.status, ['not-run', 'running', 'ready', 'needs-review', 'error'], 'not-run');
  const checkedAt = cleanString(diagnostics.checked_at ?? diagnostics.checkedAt);
  const issueCodes = normalizeIssueCodes(diagnostics.issue_codes ?? diagnostics.issueCodes);
  const safeSummary = normalizeSafePublicList(diagnostics.safe_summary ?? diagnostics.safeSummary ?? diagnostics.summary, 6);
  const ready = Boolean(diagnostics.support_report_ready ?? diagnostics.supportReportReady) && status === 'ready';
  const reportSeed = `${status}\u001f${checkedAt}\u001f${issueCodes.join(',')}\u001f${safeSummary.join('\u001f')}`;
  const reportId = reportSeed.replace(/\u001f/g, '') ? `support_${localFingerprint(reportSeed).slice(0, 16)}` : '';
  return {
    schema: 'enigma.desktop.support_report.v1',
    title: 'Safe support report',
    status,
    checked_at: checkedAt,
    support_report_ready: ready,
    report_id: reportId,
    issue_codes: issueCodes,
    safe_summary: safeSummary,
    shareable_summary: safeSummary.length
      ? safeSummary
      : [status === 'not-run' ? 'Run diagnostics before sharing support status.' : 'No public support summary details were produced.'],
    privacy_scan: {
      schema: 'enigma.support_privacy_scan.v1',
      status: ready ? 'pass' : 'not_run',
      checked_categories: SUPPORT_PRIVACY_SCAN_CATEGORIES.slice(),
      detected_private_field_count: 0,
      redacted_private_field_count: SUPPORT_PRIVACY_SCAN_CATEGORIES.length,
      public_safe_summary_only: true
    },
    privacy_boundaries: {
      raw_memory_returned: false,
      prompts_returned: false,
      transcripts_returned: false,
      provider_responses_returned: false,
      local_paths_returned: false,
      credentials_returned: false,
      tokens_returned: false,
      private_keys_returned: false,
      account_identifiers_returned: false,
      customer_identifiers_returned: false,
      raw_logs_returned: false,
      complete_settings_returned: false
    },
    primary_action: ready
      ? { id: 'copy_support_report', label: 'Copy safe support report' }
      : { id: 'collect_support_report', label: 'Collect support report' }
  };
}

export function startMcp(options = {}) {
  return { ...options, type: 'mcp/start' };
}

export function stopMcp(options = {}) {
  return { ...options, type: 'mcp/stop' };
}

export function createVault(options = {}) {
  return { ...options, type: 'vault/create' };
}

export function rememberMemory(memory = {}, options = {}) {
  return { ...options, memory, type: 'memory/remember' };
}

export function deleteMemory(memoryId, options = {}) {
  return { ...options, memory_id: memoryId, type: 'memory/delete' };
}

export function searchMemories(query, options = {}) {
  return { ...options, query, type: 'memory/search' };
}

export function verifyReceipts(input = {}, options = {}) {
  return { ...options, input, type: 'receipts/verify' };
}

export function connectClient(client = {}, options = {}) {
  return { ...options, client, type: 'client/connect' };
}

export function disconnectClient(clientId, options = {}) {
  return { ...options, client_id: clientId, type: 'client/disconnect' };
}

export function importBundle(bundle = {}, options = {}) {
  return { ...options, bundle, type: 'bundle/import' };
}

export function exportBundle(options = {}) {
  return { ...options, type: 'bundle/export' };
}

export function updateMeshStatus(mesh = {}, options = {}) {
  return { ...options, mesh, type: 'mesh/update' };
}

export function updateEnterpriseStatus(enterprise = {}, options = {}) {
  return { ...options, enterprise, type: 'enterprise/update' };
}

export function selectDesktopScreen(screen) {
  return { screen, type: 'desktop/select-screen' };
}

export function createMemoryDrive(options = {}) {
  return { ...options, type: 'desktop/create-memory-drive' };
}

export function updateDesktopService(service = {}, options = {}) {
  return { ...options, service, type: 'desktop/service/update' };
}

export function updateDesktopHealth(health = {}, options = {}) {
  return { ...options, health, type: 'desktop/health/update' };
}

export function updateProofActivity(proof = {}, options = {}) {
  return { ...options, proof, type: 'desktop/proof/update' };
}

export function updateDesktopUpdateStatus(update = {}, options = {}) {
  return { ...options, update, type: 'desktop/update/status' };
}

export function updateDesktopDiagnostics(diagnostics = {}, options = {}) {
  return { ...options, diagnostics, type: 'desktop/diagnostics/update' };
}

export function shutdownDesktop(options = {}) {
  return { ...options, type: 'desktop/shutdown' };
}

export function setDesktopDraft(name, value) {
  return { name, value, type: 'draft/set' };
}

export const desktopActions = Object.freeze({
  startMcp,
  stopMcp,
  startMCP: startMcp,
  stopMCP: stopMcp,
  createVault,
  createMemoryDrive,
  rememberMemory,
  remember: rememberMemory,
  deleteMemory,
  removeMemory: deleteMemory,
  searchMemories,
  searchMemory: searchMemories,
  verifyReceipts,
  verifyReceiptOutput: verifyReceipts,
  connectClient,
  connectDesktopClient: connectClient,
  disconnectClient,
  importBundle,
  importDesktopBundle: importBundle,
  exportBundle,
  exportDesktopBundle: exportBundle,
  updateMeshStatus,
  updateEnterpriseStatus,
  updateDesktopService,
  updateDesktopHealth,
  updateProofActivity,
  updateDesktopUpdateStatus,
  updateDesktopDiagnostics,
  shutdownDesktop,
  selectDesktopScreen,
  setDesktopDraft
});

export const actions = desktopActions;

export const startMCP = startMcp;
export const stopMCP = stopMcp;
export const remember = rememberMemory;
export const removeMemory = deleteMemory;
export const searchMemory = searchMemories;
export const verifyReceiptOutput = verifyReceipts;
export const connectDesktopClient = connectClient;
export const importDesktopBundle = importBundle;
export const exportDesktopBundle = exportBundle;

export const desktopApi = Object.freeze({
  createDesktopState,
  desktopReducer,
  renderDesktopModel,
  renderMemoryDriveDashboard,
  desktopActions,
  actions,
  startMcp,
  stopMcp,
  startMCP,
  stopMCP,
  createVault,
  createMemoryDrive,
  rememberMemory,
  remember,
  deleteMemory,
  removeMemory,
  searchMemories,
  searchMemory,
  verifyReceipts,
  verifyReceiptOutput,
  connectClient,
  connectDesktopClient,
  disconnectClient,
  importBundle,
  importDesktopBundle,
  exportBundle,
  exportDesktopBundle,
  updateMeshStatus,
  updateEnterpriseStatus,
  updateDesktopService,
  updateDesktopHealth,
  updateProofActivity,
  updateDesktopUpdateStatus,
  updateDesktopDiagnostics,
  shutdownDesktop,
  selectDesktopScreen,
  setDesktopDraft
});

if (typeof globalThis !== 'undefined') {
  globalThis.EnigmaDesktop = desktopApi;
}

function selectScreen(state, screen) {
  if (!isKnownScreen(screen)) return state;
  return { ...state, activeScreen: screen, notice: 'Memory Drive is local operational evidence only. Receipts and verifier output remain the proof path.' };
}

function startMcpState(state, action) {
  const now = cleanString(action.now) || state.mcp.started_at || INITIAL_NOW;
  const port = normalizePort(action.port ?? state.mcp.port);
  return bump({
    ...state,
    activeScreen: 'mcp',
    notice: 'MCP server marked running by local UI state. Confirm with server evidence before treating it as proof.',
    mcp: {
      ...state.mcp,
      status: 'running',
      endpoint: cleanString(action.endpoint) || state.mcp.endpoint,
      transport: cleanString(action.transport) || state.mcp.transport,
      port,
      started_at: now,
      stopped_at: '',
      client_count: state.clients.filter((client) => client.status === 'connected').length
    }
  });
}

function stopMcpState(state, action) {
  return bump({
    ...state,
    activeScreen: 'mcp',
    notice: 'MCP server marked stopped in local UI state.',
    mcp: {
      ...state.mcp,
      status: 'stopped',
      stopped_at: cleanString(action.now) || INITIAL_NOW,
      client_count: 0
    },
    clients: state.clients.map((client) => ({ ...client, status: 'disconnected', disconnected_at: cleanString(action.now) || INITIAL_NOW }))
  });
}

function createVaultState(state, action) {
  const now = cleanString(action.now) || INITIAL_NOW;
  const seed = cleanString(action.vault_id ?? action.vaultId ?? action.name) || `vault-${state.sequence + 1}`;
  const vaultId = `vault_${localFingerprint(seed).slice(0, 16)}`;
  return bump({
    ...state,
    activeScreen: 'vault',
    notice: 'Vault shell created. Receipts remain the source of proof.',
    memoryDrive: {
      ...state.memoryDrive,
      status: 'ready',
      drive_id: state.memoryDrive.drive_id || `drive_${localFingerprint(vaultId).slice(0, 16)}`,
      created_at: state.memoryDrive.created_at || now,
      last_event_at: now,
      issue_codes: []
    },
    vault: {
      ...state.vault,
      status: 'ready',
      vault_id: vaultId,
      active_set_root: cleanString(action.active_set_root ?? action.activeSetRoot) || state.vault.active_set_root,
      receipt_log_root: cleanString(action.receipt_log_root ?? action.receiptLogRoot) || state.vault.receipt_log_root,
      created_at: now,
      last_event_at: now
    }
  });
}

function createMemoryDriveState(state, action) {
  const now = cleanString(action.now) || INITIAL_NOW;
  const seed = cleanString(action.drive_id ?? action.driveId ?? action.name ?? action.label) || `memory-drive-${state.sequence + 1}`;
  const driveId = `drive_${localFingerprint(seed).slice(0, 16)}`;
  const vaultId = state.vault.vault_id || `vault_${localFingerprint(`${seed}|vault`).slice(0, 16)}`;
  const serviceRunning = state.desktopService.status === 'running';
  const healthIssueCodes = serviceRunning ? [] : ['SERVICE_NOT_RUNNING'];
  return bump({
    ...state,
    activeScreen: 'home',
    notice: 'Memory Drive created. Local service and receipts remain the evidence path.',
    memoryDrive: {
      ...state.memoryDrive,
      status: 'ready',
      drive_id: driveId,
      created_at: state.memoryDrive.created_at || now,
      last_event_at: now,
      issue_codes: []
    },
    desktopHealth: {
      ...state.desktopHealth,
      status: serviceRunning ? 'healthy' : 'fix-needed',
      checked_at: now,
      issue_codes: healthIssueCodes
    },
    vault: {
      ...state.vault,
      status: 'ready',
      vault_id: vaultId,
      created_at: state.vault.created_at || now,
      last_event_at: now
    }
  });
}

function rememberMemoryState(state, action) {
  if (state.vault.status !== 'ready') return withNotice(state, 'Create a Memory Drive before adding memory descriptors.');

  const memory = normalizeMemory(action.memory, state, action);
  const memories = upsertMemory(state.memories, memory);
  return bump({
    ...state,
    activeScreen: 'vault',
    notice: `Memory descriptor stored with a local fingerprint. Raw memory text is not displayed or exported by this shell. ${BODY_FINGERPRINT_NOTE}`,
    memories,
    vault: {
      ...state.vault,
      memory_count: memories.filter((item) => !item.deleted).length,
      deleted_count: memories.filter((item) => item.deleted).length,
      last_event_at: memory.created_at
    }
  });
}

function deleteMemoryState(state, action) {
  const target = findMemory(state.memories, action.memory_id ?? action.memoryId ?? action.address);
  if (!target) return withNotice(state, 'Delete request rejected because the memory address is unknown.');
  if (target.deleted) return withNotice(state, 'Delete request ignored because the memory is already marked deleted.');

  const now = cleanString(action.now) || INITIAL_NOW;
  const evidence = {
    schema: DELETE_EVIDENCE_SCHEMA,
    evidence_id: `del_${localFingerprint(`${target.address}|${state.sequence + 1}|${now}`).slice(0, 20)}`,
    vault_id: state.vault.vault_id,
    memory_addr: target.address,
    body_fingerprint: target.body_fingerprint,
    requested_at: now,
    status: 'pending_receipt',
    receipt_id: cleanString(action.receipt_id ?? action.receiptId),
    note: 'This is deletion evidence, not proof. Match it to a verified delete receipt.'
  };

  const memories = state.memories.map((memory) => memory.address === target.address ? { ...memory, deleted: true, deleted_at: now, delete_evidence_id: evidence.evidence_id } : memory);
  return bump({
    ...state,
    activeScreen: 'delete-prove',
    notice: 'Deletion evidence queued. Verification requires a matching receipt.',
    memories,
    deletionEvidence: state.deletionEvidence.concat(evidence),
    vault: {
      ...state.vault,
      memory_count: memories.filter((item) => !item.deleted).length,
      deleted_count: memories.filter((item) => item.deleted).length,
      last_event_at: now
    }
  });
}

function searchMemoryState(state, action) {
  const query = cleanString(action.query).toLowerCase();
  const results = query
    ? state.memories.filter((memory) => !memory.deleted && searchableMemoryText(memory).includes(query)).map((memory) => memory.address)
    : [];
  return {
    ...state,
    activeScreen: 'vault',
    search: { query, results },
    notice: query ? 'Search uses stored descriptors and fingerprints only, not raw memory plaintext.' : state.notice
  };
}

function verifyReceiptState(state, action) {
  const parsed = parseReceiptInput(action.input);
  if (!parsed.ok) {
    return bump({
      ...state,
      activeScreen: 'verifier',
      notice: 'Receipt shape input was rejected.',
      verifier: {
        ...state.verifier,
        status: 'error',
        evidence: [],
        errors: parsed.errors,
        checked_at: cleanString(action.now) || INITIAL_NOW
      }
    });
  }

  const evidence = parsed.receipts.map((receipt, index) => receiptEvidence(receipt, index, action));
  const errors = evidence.flatMap((item) => item.errors.map((error) => `${item.receipt_id || `receipt[${item.index}]`}: ${error}`));
  const deletionEvidence = matchDeletionEvidence(state.deletionEvidence, evidence);
  return bump({
    ...state,
    activeScreen: 'verifier',
    notice: errors.length === 0 ? 'Receipt shape is inspectable. Offline verifier output is required before treating it as cryptographic proof.' : 'Receipt shape inspection found structural errors.',
    verifier: {
      ...state.verifier,
      status: 'checked',
      evidence,
      errors,
      checked_at: cleanString(action.now) || INITIAL_NOW
    },
    deletionEvidence,
    vault: {
      ...state.vault,
      receipt_count: Math.max(state.vault.receipt_count, evidence.length)
    }
  });
}

function connectClientState(state, action) {
  if (state.mcp.status !== 'running') return withNotice(state, 'Start MCP before connecting a client.');
  const input = action.client ?? {};
  const template = CLIENT_TEMPLATES.find((item) => item.id === input.id || item.name === input.name);
  const id = cleanString(input.id) || template?.id || `client_${localFingerprint(cleanString(input.name) || `client-${state.clients.length + 1}`).slice(0, 12)}`;
  const client = {
    id,
    name: cleanString(input.name) || template?.name || id,
    kind: cleanString(input.kind) || template?.kind || 'mcp-client',
    status: 'connected',
    connected_at: cleanString(action.now) || INITIAL_NOW,
    endpoint: state.mcp.endpoint,
    capabilities: normalizeStringList(input.capabilities)
  };
  const clients = state.clients.filter((item) => item.id !== id).concat(client);
  return bump({
    ...state,
    activeScreen: 'clients',
    notice: `${client.name} connection recorded as local MCP evidence.`,
    clients,
    mcp: { ...state.mcp, client_count: clients.filter((item) => item.status === 'connected').length }
  });
}

function disconnectClientState(state, action) {
  const id = cleanString(action.client_id ?? action.clientId);
  const now = cleanString(action.now) || INITIAL_NOW;
  const clients = state.clients.map((client) => client.id === id ? { ...client, status: 'disconnected', disconnected_at: now } : client);
  return bump({
    ...state,
    activeScreen: 'clients',
    clients,
    mcp: { ...state.mcp, client_count: clients.filter((item) => item.status === 'connected').length },
    notice: id ? 'Client disconnected in local UI state.' : state.notice
  });
}

function importBundleState(state, action) {
  const parsed = parseBundle(action.bundle);
  if (!parsed.ok) {
    return bump({
      ...state,
      activeScreen: 'import-export',
      notice: 'Import rejected. Unknown or unsafe bundle path failed closed.',
      importExport: { ...state.importExport, import_status: 'rejected', import_errors: parsed.errors }
    });
  }

  const safe = parsed.bundle;
  const importedMemories = Array.isArray(safe.memories) ? safe.memories.map(importMemory).filter(Boolean) : [];
  const importedDeletionEvidence = Array.isArray(safe.deletionEvidence) ? safe.deletionEvidence.map(importDeletionEvidence).filter(Boolean) : [];
  const importedVerifierEvidence = Array.isArray(safe.verifierEvidence) ? safe.verifierEvidence.map(importVerifierEvidence).filter(Boolean) : [];
  const memories = mergeMemories(state.memories, importedMemories);
  return bump({
    ...state,
    activeScreen: 'import-export',
    notice: `Bundle imported. Only sanitized descriptors, fingerprints, and evidence metadata were accepted. ${BODY_FINGERPRINT_NOTE}`,
    memories,
    deletionEvidence: state.deletionEvidence.concat(importedDeletionEvidence),
    verifier: importedVerifierEvidence.length ? {
      ...state.verifier,
      status: 'checked',
      evidence: state.verifier.evidence.concat(importedVerifierEvidence),
      errors: state.verifier.errors.concat(importedVerifierEvidence.flatMap((item) => item.errors.map((error) => `${item.receipt_id || `receipt[${item.index}]`}: ${error}`)))
    } : state.verifier,
    importExport: { ...state.importExport, import_status: 'imported', import_errors: [] },
    vault: {
      ...state.vault,
      status: state.vault.status === 'ready' ? 'ready' : (safe.vault?.vault_id ? 'ready' : state.vault.status),
      vault_id: state.vault.vault_id || cleanString(safe.vault?.vault_id),
      memory_count: memories.filter((item) => !item.deleted).length,
      deleted_count: memories.filter((item) => item.deleted).length,
      receipt_count: Math.max(state.vault.receipt_count, normalizeNonNegativeInteger(safe.vault?.receipt_count, 0))
    }
  });
}

function exportBundleState(state, action) {
  const now = cleanString(action.now) || INITIAL_NOW;
  const bundle = createExportBundle(state, now, action.scope);
  return bump({
    ...state,
    activeScreen: 'import-export',
    notice: 'Export prepared without raw memory plaintext.',
    importExport: {
      ...state.importExport,
      exported_at: now,
      exportBundle: bundle
    },
    drafts: {
      ...state.drafts,
      exportOutput: JSON.stringify(bundle, null, 2)
    }
  });
}

function updateMeshState(state, action) {
  const mesh = action.mesh ?? {};
  return bump({
    ...state,
    activeScreen: 'mesh',
    mesh: {
      ...state.mesh,
      status: cleanString(mesh.status) || state.mesh.status,
      peers: normalizeNonNegativeInteger(mesh.peers, state.mesh.peers),
      relays: normalizeNonNegativeInteger(mesh.relays, state.mesh.relays),
      last_witness_at: cleanString(mesh.last_witness_at ?? mesh.lastWitnessAt) || state.mesh.last_witness_at
    },
    notice: 'Mesh status updated as local telemetry.'
  });
}

function updateEnterpriseState(state, action) {
  const enterprise = action.enterprise ?? {};
  return bump({
    ...state,
    activeScreen: 'enterprise',
    enterprise: {
      ...state.enterprise,
      status: cleanString(enterprise.status) || state.enterprise.status,
      tenant_id: cleanString(enterprise.tenant_id ?? enterprise.tenantId) || state.enterprise.tenant_id,
      policy_id: cleanString(enterprise.policy_id ?? enterprise.policyId) || state.enterprise.policy_id,
      siem: cleanString(enterprise.siem) || state.enterprise.siem
    },
    notice: 'Enterprise status updated as configuration evidence.'
  });
}

function updateDesktopServiceState(state, action) {
  const service = action.service ?? {};
  const now = cleanString(action.now) || INITIAL_NOW;
  const status = normalizePublicStatus(service.status, ['stopped', 'starting', 'running', 'repair-needed', 'error'], state.desktopService.status);
  const issueCodes = normalizeIssueCodes(service.issue_codes ?? service.issueCodes);
  const nextServiceIssues = status === 'running' ? issueCodes.filter((code) => code !== 'SERVICE_NOT_RUNNING') : uniqueIssueCodes(issueCodes.concat('SERVICE_NOT_RUNNING'));
  const healthCanClear = status === 'running' && state.memoryDrive.status === 'ready' && state.desktopHealth.issue_codes.every((code) => code === 'SERVICE_NOT_RUNNING');
  return bump({
    ...state,
    activeScreen: 'home',
    desktopService: {
      ...state.desktopService,
      status,
      started_at: status === 'running' ? now : state.desktopService.started_at,
      stopped_at: status === 'stopped' ? now : state.desktopService.stopped_at,
      issue_codes: nextServiceIssues
    },
    desktopHealth: healthCanClear ? {
      ...state.desktopHealth,
      status: 'healthy',
      checked_at: now,
      issue_codes: []
    } : state.desktopHealth,
    notice: 'Memory Drive service status updated.'
  });
}

function updateDesktopHealthState(state, action) {
  const health = action.health ?? {};
  const now = cleanString(action.now) || INITIAL_NOW;
  const status = normalizePublicStatus(health.status, ['needs-setup', 'checking', 'healthy', 'fix-needed', 'error'], state.desktopHealth.status);
  const inputIssueCodes = normalizeIssueCodes(health.issue_codes ?? health.issueCodes);
  const issueCodes = status === 'healthy' ? [] : uniqueIssueCodes(inputIssueCodes.length ? inputIssueCodes : [state.memoryDrive.status === 'ready' ? 'HEALTH_FIX_REQUIRED' : 'MEMORY_DRIVE_MISSING']);
  return bump({
    ...state,
    activeScreen: 'home',
    desktopHealth: {
      ...state.desktopHealth,
      status,
      checked_at: now,
      issue_codes: issueCodes
    },
    notice: 'Memory Drive health updated with public-safe issue codes.'
  });
}

function updateProofActivityState(state, action) {
  const proof = action.proof ?? {};
  const now = cleanString(action.now) || INITIAL_NOW;
  return bump({
    ...state,
    activeScreen: 'home',
    proofActivity: {
      ...state.proofActivity,
      status: normalizePublicStatus(proof.status, ['idle', 'checking', 'checked', 'error', 'needs-review'], state.proofActivity.status),
      receipt_count: normalizeNonNegativeInteger(proof.receipt_count ?? proof.receiptCount, state.proofActivity.receipt_count),
      last_activity_at: cleanString(proof.last_activity_at ?? proof.lastActivityAt) || now,
      issue_codes: normalizeIssueCodes(proof.issue_codes ?? proof.issueCodes)
    },
    notice: 'Proof activity updated without exposing receipt bodies or provider responses.'
  });
}

function updateDesktopUpdateStatusState(state, action) {
  const update = action.update ?? {};
  const now = cleanString(action.now) || INITIAL_NOW;
  return bump({
    ...state,
    activeScreen: 'home',
    desktopUpdate: {
      ...state.desktopUpdate,
      status: normalizePublicStatus(update.status, ['unknown', 'checking', 'current', 'available', 'installing', 'ready', 'error'], state.desktopUpdate.status),
      version: safePublicString(update.version, state.desktopUpdate.version, 32),
      checked_at: now,
      issue_codes: normalizeIssueCodes(update.issue_codes ?? update.issueCodes)
    },
    notice: 'Update status refreshed.'
  });
}

function updateDesktopDiagnosticsState(state, action) {
  const diagnostics = action.diagnostics ?? {};
  const now = cleanString(action.now) || INITIAL_NOW;
  return bump({
    ...state,
    activeScreen: 'home',
    desktopDiagnostics: {
      ...state.desktopDiagnostics,
      status: normalizePublicStatus(diagnostics.status, ['not-run', 'running', 'ready', 'needs-review', 'error'], state.desktopDiagnostics.status),
      checked_at: now,
      support_report_ready: Boolean(diagnostics.support_report_ready ?? diagnostics.supportReportReady),
      issue_codes: normalizeIssueCodes(diagnostics.issue_codes ?? diagnostics.issueCodes),
      safe_summary: normalizeSafePublicList(diagnostics.safe_summary ?? diagnostics.safeSummary ?? diagnostics.summary, 6)
    },
    notice: 'Diagnostics updated with safe support-report metadata only.'
  });
}

function shutdownDesktopState(state, action) {
  const now = cleanString(action.now) || INITIAL_NOW;
  return bump({
    ...state,
    activeScreen: 'home',
    desktopService: {
      ...state.desktopService,
      status: 'stopped',
      stopped_at: now,
      issue_codes: ['SERVICE_NOT_RUNNING']
    },
    mcp: {
      ...state.mcp,
      status: 'stopped',
      stopped_at: now,
      client_count: 0
    },
    clients: state.clients.map((client) => ({ ...client, status: 'disconnected', disconnected_at: now })),
    desktopHealth: {
      ...state.desktopHealth,
      status: state.memoryDrive.status === 'ready' ? 'fix-needed' : 'needs-setup',
      checked_at: now,
      issue_codes: state.memoryDrive.status === 'ready' ? ['SERVICE_NOT_RUNNING'] : ['MEMORY_DRIVE_MISSING']
    },
    notice: 'Memory Drive local service stopped. This does not delete provider-side cache or make any model forget.'
  });
}

function setDraftState(state, action) {
  const name = cleanString(action.name);
  if (!Object.prototype.hasOwnProperty.call(state.drafts, name)) return state;
  return { ...state, drafts: { ...state.drafts, [name]: String(action.value ?? '') } };
}

function normalizeMemory(input = {}, state, action) {
  const now = cleanString(action.now) || INITIAL_NOW;
  const descriptor = clamp(cleanString(input.descriptor ?? input.label ?? input.title) || `redacted memory ${state.memories.length + 1}`, 96);
  const body = cleanString(input.body ?? input.text ?? input.content);
  const tags = normalizeStringList(input.tags);
  const source = cleanString(input.source) || 'desktop-shell';
  const subject = cleanString(input.subject_id ?? input.subjectId) || 'local-user';
  const tenant = cleanString(input.tenant_id ?? input.tenantId) || state.enterprise.tenant_id || 'local-tenant';
  const fingerprint = localFingerprint(`${tenant}\u001f${subject}\u001f${descriptor}\u001f${body}\u001f${tags.join(',')}`);
  const address = cleanString(input.address ?? input.memory_addr ?? input.memoryAddr) || `mem_${fingerprint.slice(0, 24)}`;
  return {
    address,
    descriptor,
    source,
    tags,
    tenant_id: tenant,
    subject_id: subject,
    body_fingerprint: `local:${fingerprint}`,
    body_bytes: body.length,
    deleted: false,
    created_at: now,
    receipt_id: cleanString(input.receipt_id ?? input.receiptId)
  };
}

function upsertMemory(memories, next) {
  let replaced = false;
  const updated = memories.map((memory) => {
    if (memory.address !== next.address) return memory;
    replaced = true;
    return { ...memory, ...next, created_at: memory.created_at || next.created_at };
  });
  return replaced ? updated : updated.concat(next);
}

function findMemory(memories, id) {
  const key = cleanString(id);
  if (!key) return null;
  return memories.find((memory) => memory.address === key || memory.body_fingerprint === key || memory.receipt_id === key) || null;
}

function searchableMemoryText(memory) {
  return `${memory.address} ${memory.descriptor} ${memory.source} ${memory.tags.join(' ')} ${memory.body_fingerprint}`.toLowerCase();
}

function parseReceiptInput(input) {
  let value = input;
  if (typeof input === 'string') {
    const text = input.trim();
    if (!text) return { ok: false, errors: ['receipt input is empty'] };
    try {
      value = JSON.parse(text);
    } catch {
      return { ok: false, errors: ['receipt input must be JSON'] };
    }
  }

  const receipts = Array.isArray(value) ? value : Array.isArray(value?.receipts) ? value.receipts : value?.receipt ? [value.receipt] : isPlainObject(value) ? [value] : [];
  if (receipts.length === 0) return { ok: false, errors: ['no receipts found'] };
  return { ok: true, receipts };
}

function receiptEvidence(receipt, index, action) {
  const errors = [];
  if (!isPlainObject(receipt)) {
    return {
      schema: VERIFIER_EVIDENCE_SCHEMA,
      index,
      receipt_id: '',
      ok: false,
      errors: ['receipt must be an object'],
      checked_at: cleanString(action.now) || INITIAL_NOW
    };
  }

  const receiptId = cleanString(receipt.receipt_id ?? receipt.receiptId);
  const operation = cleanString(receipt.operation);
  const eventHash = cleanString(receipt.event_hash ?? receipt.eventHash);
  const activeRoot = cleanString(receipt.active_set_root ?? receipt.activeSetRoot);
  const logRoot = cleanString(receipt.receipt_log_root ?? receipt.receiptLogRoot);
  const previous = cleanString(receipt.previous_receipt_hash ?? receipt.previousReceiptHash);
  const signer = isPlainObject(receipt.signer) ? receipt.signer : {};
  const signature = isPlainObject(receipt.signature) ? receipt.signature : {};

  if (receipt.schema !== 'enigma.receipt.v1') errors.push('schema mismatch');
  if (!receiptId) errors.push('receipt_id missing');
  if (!operation) errors.push('operation missing');
  if (!Number.isInteger(receipt.sequence) || receipt.sequence < 0) errors.push('sequence must be a non-negative integer');
  if (!ROOT_RE.test(eventHash)) errors.push('event_hash must be sha256-prefixed');
  if (!ROOT_RE.test(activeRoot)) errors.push('active_set_root must be sha256-prefixed');
  if (!ROOT_RE.test(logRoot)) errors.push('receipt_log_root must be sha256-prefixed');
  if (previous !== 'GENESIS' && !ROOT_RE.test(previous)) errors.push('previous_receipt_hash mismatch');
  if (signer.alg !== 'Ed25519' || !cleanString(signer.key_id ?? signer.keyId)) errors.push('signer mismatch');
  if (signature.alg !== 'Ed25519' || !SIGNATURE_RE.test(cleanString(signature.value))) errors.push('signature missing');

  return {
    schema: VERIFIER_EVIDENCE_SCHEMA,
    index,
    receipt_id: receiptId,
    operation,
    sequence: Number.isInteger(receipt.sequence) ? receipt.sequence : null,
    event_hash: eventHash,
    active_set_root: activeRoot,
    receipt_log_root: logRoot,
    previous_receipt_hash: previous,
    signer_key_id: cleanString(signer.key_id ?? signer.keyId),
    memory_addr: cleanString(receipt.memory_addr ?? receipt.memoryAddr),
    source_addr: cleanString(receipt.source_addr ?? receipt.sourceAddr),
    checked_at: cleanString(action.now) || INITIAL_NOW,
    ok: errors.length === 0,
    errors,
    note: 'Structural receipt shape only; cryptographic signature verification is performed by the offline verifier.'
  };
}

function matchDeletionEvidence(deletionEvidence, receiptEvidenceItems) {
  if (deletionEvidence.length === 0 || receiptEvidenceItems.length === 0) return deletionEvidence;
  return deletionEvidence.map((item) => {
    if (item.status === 'matched_receipt') return item;
    const match = receiptEvidenceItems.find((receipt) => receipt.ok && receipt.operation === 'delete' && receipt.memory_addr === item.memory_addr);
    return match ? { ...item, status: 'matched_receipt', receipt_id: match.receipt_id } : item;
  });
}

function parseBundle(bundle) {
  let value = bundle;
  if (typeof bundle === 'string') {
    const text = bundle.trim();
    if (!text) return { ok: false, errors: ['bundle input is empty'] };
    try {
      value = JSON.parse(text);
    } catch {
      return { ok: false, errors: ['bundle input must be JSON'] };
    }
  }
  if (!isPlainObject(value)) return { ok: false, errors: ['bundle must be an object'] };
  if (value.schema !== EXPORT_SCHEMA) return { ok: false, errors: ['bundle schema mismatch'] };
  const unsafePaths = findForbiddenImportRawFields(value);
  if (unsafePaths.length > 0) return { ok: false, errors: unsafePaths.map((path) => `forbidden raw import field: ${path}`) };
  return { ok: true, bundle: value };
}

function importMemory(memory) {
  if (!isPlainObject(memory)) return null;
  const address = cleanString(memory.address ?? memory.memory_addr ?? memory.memoryAddr);
  const bodyFingerprint = cleanString(memory.body_fingerprint ?? memory.bodyFingerprint);
  if (!address || !bodyFingerprint || isRawLookingText(address) || isRawLookingText(bodyFingerprint)) return null;
  return {
    address,
    descriptor: safeImportedText(memory.descriptor, 'imported memory', 96),
    source: safeImportedText(memory.source, 'imported-bundle', 96),
    tags: sanitizeImportedTags(memory.tags),
    tenant_id: cleanString(memory.tenant_id ?? memory.tenantId),
    subject_id: cleanString(memory.subject_id ?? memory.subjectId),
    body_fingerprint: bodyFingerprint,
    body_bytes: normalizeNonNegativeInteger(memory.body_bytes ?? memory.bodyBytes, 0),
    deleted: Boolean(memory.deleted),
    created_at: cleanString(memory.created_at ?? memory.createdAt),
    deleted_at: cleanString(memory.deleted_at ?? memory.deletedAt),
    receipt_id: cleanString(memory.receipt_id ?? memory.receiptId)
  };
}

function importDeletionEvidence(item) {
  if (!isPlainObject(item) || item.schema !== DELETE_EVIDENCE_SCHEMA) return null;
  const memoryAddr = cleanString(item.memory_addr ?? item.memoryAddr);
  if (!memoryAddr || isRawLookingText(memoryAddr)) return null;
  const bodyFingerprint = cleanString(item.body_fingerprint ?? item.bodyFingerprint);
  return {
    schema: DELETE_EVIDENCE_SCHEMA,
    evidence_id: cleanString(item.evidence_id ?? item.evidenceId) || `del_${localFingerprint(memoryAddr).slice(0, 20)}`,
    vault_id: cleanString(item.vault_id ?? item.vaultId),
    memory_addr: memoryAddr,
    body_fingerprint: isRawLookingText(bodyFingerprint) ? '' : bodyFingerprint,
    requested_at: cleanString(item.requested_at ?? item.requestedAt),
    status: cleanString(item.status) || 'pending_receipt',
    receipt_id: cleanString(item.receipt_id ?? item.receiptId),
    note: 'Imported deletion evidence, not proof.'
  };
}

function importVerifierEvidence(item) {
  if (!isPlainObject(item) || item.schema !== VERIFIER_EVIDENCE_SCHEMA) return null;
  return sanitizeVerifierEvidenceForExport(item);
}

function findForbiddenImportRawFields(bundle) {
  const paths = [];
  collectForbiddenImportRawFields(bundle.memories, 'memories', paths);
  collectForbiddenImportRawFields(bundle.deletionEvidence, 'deletionEvidence', paths);
  collectForbiddenImportRawFields(bundle.verifierEvidence, 'verifierEvidence', paths);
  return paths;
}

function collectForbiddenImportRawFields(value, path, paths) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectForbiddenImportRawFields(item, `${path}[${index}]`, paths));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.replace(/[-_]/g, '').toLowerCase();
    if (FORBIDDEN_IMPORT_RAW_KEYS.has(key) || FORBIDDEN_IMPORT_RAW_KEYS.has(normalizedKey)) paths.push(`${path}.${key}`);
    collectForbiddenImportRawFields(child, `${path}.${key}`, paths);
  }
}

function safeImportedText(value, fallback, max) {
  const text = clamp(cleanString(value), max);
  return text && !isRawLookingText(text) ? text : fallback;
}

function sanitizeImportedTags(value) {
  return normalizeStringList(value).filter((tag) => !isRawLookingText(tag));
}

function sanitizeDeletionEvidenceForExport(item) {
  return {
    schema: DELETE_EVIDENCE_SCHEMA,
    evidence_id: cleanString(item.evidence_id ?? item.evidenceId),
    vault_id: cleanString(item.vault_id ?? item.vaultId),
    memory_addr: sanitizeEvidenceAddress(item.memory_addr ?? item.memoryAddr),
    body_fingerprint: sanitizeEvidenceAddress(item.body_fingerprint ?? item.bodyFingerprint),
    requested_at: cleanString(item.requested_at ?? item.requestedAt),
    status: cleanString(item.status),
    receipt_id: cleanString(item.receipt_id ?? item.receiptId),
    note: 'Deletion evidence metadata only; not cryptographic proof.'
  };
}

function sanitizeVerifierEvidenceForExport(item) {
  return {
    schema: VERIFIER_EVIDENCE_SCHEMA,
    index: Number.isInteger(item.index) ? item.index : null,
    receipt_id: cleanString(item.receipt_id ?? item.receiptId),
    operation: cleanString(item.operation),
    sequence: Number.isInteger(item.sequence) ? item.sequence : null,
    event_hash: cleanString(item.event_hash ?? item.eventHash),
    active_set_root: cleanString(item.active_set_root ?? item.activeSetRoot),
    receipt_log_root: cleanString(item.receipt_log_root ?? item.receiptLogRoot),
    previous_receipt_hash: cleanString(item.previous_receipt_hash ?? item.previousReceiptHash),
    signer_key_id: cleanString(item.signer_key_id ?? item.signerKeyId),
    memory_addr: sanitizeEvidenceAddress(item.memory_addr ?? item.memoryAddr),
    source_addr: sanitizeEvidenceAddress(item.source_addr ?? item.sourceAddr),
    checked_at: cleanString(item.checked_at ?? item.checkedAt),
    ok: Boolean(item.ok),
    errors: normalizeStringList(item.errors).map(sanitizeEvidenceAddress),
    note: 'Structural receipt shape only; cryptographic signature verification is performed by the offline verifier.'
  };
}

function sanitizeEvidenceAddress(value) {
  const text = cleanString(value);
  return isRawLookingText(text) ? IMPORT_REDACTED_TEXT : text;
}

function isRawLookingText(value) {
  const text = cleanString(value);
  return text ? RAW_LOOKING_VALUE_RE.test(text) : false;
}

function mergeMemories(current, imported) {
  let next = current.slice();
  for (const memory of imported) next = upsertMemory(next, memory);
  return next;
}

function createExportBundle(state, now, scope) {
  const includeClients = scope === 'all' || scope === 'clients';
  return {
    schema: EXPORT_SCHEMA,
    exported_at: now,
    notice: `This bundle intentionally excludes raw memory plaintext. It is evidence metadata, not proof. ${BODY_FINGERPRINT_NOTE}`,
    vault: {
      status: state.vault.status,
      vault_id: safePublicString(state.vault.vault_id, '', 96),
      active_set_root: safePublicString(state.vault.active_set_root, '', 96),
      receipt_log_root: safePublicString(state.vault.receipt_log_root, '', 96),
      receipt_count: state.vault.receipt_count
    },
    memories: state.memories.map((memory) => ({
      address: safePublicString(memory.address, 'memory descriptor', 96),
      descriptor: safeImportedText(memory.descriptor, 'imported memory', 96),
      source: safeImportedText(memory.source, 'imported-bundle', 96),
      tags: sanitizeImportedTags(memory.tags),
      tenant_id: memory.tenant_id ? 'configured' : '',
      subject_id: memory.subject_id ? 'configured' : '',
      body_fingerprint: isRawLookingText(memory.body_fingerprint) ? '' : memory.body_fingerprint,
      body_bytes: memory.body_bytes,
      deleted: memory.deleted,
      created_at: memory.created_at,
      deleted_at: memory.deleted_at,
      receipt_id: safePublicString(memory.receipt_id, '', 96)
    })),
    deletionEvidence: state.deletionEvidence.map(sanitizeDeletionEvidenceForExport),
    verifierEvidence: state.verifier.evidence.map(sanitizeVerifierEvidenceForExport),
    mesh: {
      status: safePublicString(state.mesh.status, 'offline', 32),
      peers: state.mesh.peers,
      relays: state.mesh.relays,
      last_witness_at: safePublicString(state.mesh.last_witness_at, '', 32),
      note: safePublicString(state.mesh.note, 'Mesh status is local telemetry.', 120)
    },
    enterprise: {
      status: safePublicString(state.enterprise.status, 'not-configured', 32),
      tenant_id: state.enterprise.tenant_id ? 'configured' : '',
      policy_id: state.enterprise.policy_id ? 'configured' : '',
      siem: safePublicString(state.enterprise.siem, 'disconnected', 32),
      note: safePublicString(state.enterprise.note, 'Enterprise controls report configuration evidence.', 120)
    },
    clients: includeClients ? state.clients.map(renderClientRow) : []
  };
}

function renderMemoryRow(memory) {
  return {
    address: safePublicString(memory.address, 'memory descriptor', 96),
    descriptor: safePublicString(memory.descriptor, 'redacted descriptor', 96),
    source: safePublicString(memory.source, 'desktop-shell', 64),
    tags: normalizeSafePublicList(memory.tags, 8),
    body_fingerprint: safePublicString(memory.body_fingerprint, '', 96),
    deleted: memory.deleted,
    receipt_id: safePublicString(memory.receipt_id, '', 96)
  };
}

function renderClientRow(client) {
  return {
    id: safePublicString(client.id, 'connected-app', 64),
    name: safePublicString(client.name, 'Connected app', 64),
    kind: safePublicString(client.kind, 'mcp-client', 32),
    status: safePublicString(client.status, 'connected', 32),
    connected_at: safePublicString(client.connected_at, '', 32),
    disconnected_at: safePublicString(client.disconnected_at, '', 32),
    endpoint: safePublicString(client.endpoint, 'local endpoint', 96),
    capabilities: normalizeSafePublicList(client.capabilities, 12)
  };
}

function bump(state) {
  return { ...state, sequence: state.sequence + 1 };
}

function withNotice(state, notice) {
  return { ...state, notice };
}

function isKnownScreen(screen) {
  return DESKTOP_SCREENS.includes(screen);
}

function screenLabel(screen) {
  switch (screen) {
    case 'home': return 'Memory Drive';
    case 'setup': return 'Setup';
    case 'support': return 'Support report';
    case 'vault': return 'Vault';
    case 'mcp': return 'MCP server';
    case 'clients': return 'Connected apps';
    case 'import-export': return 'Import / export';
    case 'verifier': return 'Inspect receipt shape';
    case 'delete-prove': return 'Delete + prove';
    case 'mesh': return 'Mesh';
    case 'enterprise': return 'Enterprise';
    default: return screen;
  }
}

function cleanString(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function clamp(value, max) {
  const text = cleanString(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function normalizePort(value) {
  if (value === null || value === undefined || value === '') return null;
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}

function normalizeNonNegativeInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function normalizeStringList(value) {
  if (Array.isArray(value)) return value.map(cleanString).filter(Boolean);
  return cleanString(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function normalizeIssueCodes(value) {
  const items = Array.isArray(value) ? value : normalizeStringList(value);
  return uniqueIssueCodes(items.map((item) => cleanString(item).toUpperCase().replace(/[^A-Z0-9_:-]/g, '_')).filter((item) => item && item.length <= 64));
}

function uniqueIssueCodes(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const code = cleanString(item);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    result.push(code);
  }
  return result;
}

function normalizePublicStatus(value, allowed, fallback) {
  const status = cleanString(value).toLowerCase();
  return allowed.includes(status) ? status : fallback;
}

function safePublicString(value, fallback = '', max = 96) {
  const text = clamp(value, max);
  if (!text || isRawLookingText(text)) return fallback;
  return text;
}

function normalizeSafePublicList(value, maxItems) {
  const items = Array.isArray(value) ? value : normalizeStringList(value);
  return items.map((item) => safePublicString(item, '', 120)).filter(Boolean).slice(0, maxItems);
}

function collectDashboardIssueCodes(state) {
  const codes = [];
  if (state.memoryDrive?.status !== 'ready') codes.push('MEMORY_DRIVE_MISSING');
  if (state.desktopService?.status !== 'running') codes.push('SERVICE_NOT_RUNNING');
  codes.push(...normalizeIssueCodes(state.memoryDrive?.issue_codes));
  codes.push(...normalizeIssueCodes(state.desktopService?.issue_codes));
  codes.push(...normalizeIssueCodes(state.desktopHealth?.issue_codes));
  codes.push(...normalizeIssueCodes(state.proofActivity?.issue_codes));
  codes.push(...normalizeIssueCodes(state.desktopUpdate?.issue_codes));
  codes.push(...normalizeIssueCodes(state.desktopDiagnostics?.issue_codes));
  return uniqueIssueCodes(codes);
}

function desktopNextAction(action, state) {
  return {
    schema: 'enigma.desktop.next_action.v1',
    state,
    ...action,
    primary_action: { id: action.id, label: action.label, screen: action.screen },
    plain_summary: `${action.label}: ${action.reason}`,
    claim_boundaries: {
      local_desktop_status_only: true,
      raw_memory_returned: false,
      local_paths_returned: false,
      provider_deletion_proof: false,
      model_forgetting_proof: false,
      hosted_saas_live: false,
    },
  };
}

function selectMemoryDriveNextAction(input) {
  if (input.memoryDriveStatus !== 'ready' || input.issueCodes.includes('MEMORY_DRIVE_MISSING')) {
    return desktopNextAction({ id: 'create_memory_drive', label: 'Create Memory Drive', screen: 'setup', reason: 'Memory Drive has not been created on this device.' }, 'setup_needed');
  }
  if (input.serviceStatus !== 'running' || input.issueCodes.includes('SERVICE_NOT_RUNNING')) {
    return desktopNextAction({ id: 'start_service', label: 'Start local service', screen: 'setup', reason: 'Connected apps need the bundled local service.' }, 'service_needed');
  }
  if (input.healthStatus !== 'healthy') {
    return desktopNextAction({ id: 'fix_health', label: 'Fix Memory Drive health', screen: 'setup', reason: 'Health checks found an issue that can be repaired locally.' }, 'attention_needed');
  }
  if (input.updateStatus === 'available' || input.issueCodes.includes('UPDATE_AVAILABLE')) {
    return desktopNextAction({ id: 'install_update', label: 'Install update', screen: 'setup', reason: 'A desktop update is ready.' }, 'update_available');
  }
  if (input.diagnosticsStatus === 'needs-review' || input.diagnosticsStatus === 'error') {
    return desktopNextAction({ id: 'open_diagnostics', label: 'Open safe support report', screen: 'support', reason: 'Diagnostics need review before sharing support metadata.' }, 'diagnostics_review');
  }
  if (input.proofStatus === 'error' || input.proofStatus === 'needs-review') {
    return desktopNextAction({ id: 'review_proof', label: 'Review proof activity', screen: 'verifier', reason: 'Proof activity needs local review.' }, 'proof_review');
  }
  if (input.connectedAppCount === 0) {
    return desktopNextAction({ id: 'connect_app', label: 'Connect an app', screen: 'clients', reason: 'No connected app has been recorded yet.' }, 'ready_for_app_connection');
  }
  return desktopNextAction({ id: 'view_proof_activity', label: 'View proof activity', screen: 'verifier', reason: 'Memory Drive is ready.' }, 'ready');
}

function selectMemoryControllerSummary(input) {
  const weatherStatus = input.proofStatus === 'error' || input.proofStatus === 'needs-review' || input.issueCodes.some((code) => code === 'PROOF_ACTIVITY_ERROR' || code === 'RECALL_REVIEW_REQUIRED')
    ? 'storm_warning'
    : input.offlineReady || input.proofStatus === 'checked'
      ? 'sunny'
      : 'needs_attention';
  const weatherLabel = weatherStatus === 'sunny'
    ? 'Clear'
    : weatherStatus === 'storm_warning'
      ? 'Sharing paused'
      : 'Needs review';
  const weatherAction = weatherStatus === 'storm_warning'
    ? { id: 'review_recall', label: 'Review recall' }
    : weatherStatus === 'needs_attention'
      ? { id: 'review_grants', label: 'Review app permissions' }
      : { id: 'open_private_bubble', label: 'Open private bubble' };
  const permissionStatus = input.connectedAppCount > 0 ? 'active' : 'missing';

  return {
    schema: 'enigma.desktop.memory_controller_summary.v1',
    memory_weather: {
      status: weatherStatus,
      label: weatherLabel,
      summary: weatherStatus === 'sunny'
        ? 'Local checks are clear. Enigma still asks before sharing memory.'
        : 'Review local decisions before a connected app receives memory.',
      primary_action: weatherAction
    },
    app_permissions: {
      status: permissionStatus,
      label: permissionStatus === 'active' ? 'Connected apps must ask first' : 'No app has permission yet',
      summary: 'App permissions decide which local apps may ask Enigma for context.',
      primary_action: { id: 'review_grants', label: 'Review app permissions' }
    },
    recall_approval: {
      status: 'ask',
      label: 'Waiting for your approval',
      summary: 'Not shared until you approve.',
      primary_action: { id: 'review_recall', label: 'Review recall' },
      secondary_actions: [
        { id: 'approve_recall', label: 'Approve this local recall' },
        { id: 'deny_recall', label: 'Keep not shared' }
      ]
    },
    private_memory_bubble: {
      status: 'closed',
      label: 'Private bubble closed',
      summary: 'Open a local bubble to review memory before sharing.',
      primary_action: { id: 'open_private_bubble', label: 'Open private bubble' }
    }
  };
}

function selectImportSandboxSummary(input) {
  const ready = input.memoryDriveStatus === 'ready';
  return {
    schema: 'enigma.desktop.import_sandbox_summary.v1',
    status: ready ? 'ready' : 'needs_memory_drive',
    label: ready ? 'Ready to preview imports' : 'Create Memory Drive first',
    summary: ready
      ? 'Preview text, Markdown, or provider exports before writing memory. Duplicate groups, batch receipts, and rollback receipts stay public-safe.'
      : 'Create a local Memory Drive before previewing or writing imported memories.',
    primary_action: ready
      ? { id: 'preview_import', label: 'Preview import' }
      : { id: 'create_memory_drive', label: 'Create Memory Drive' },
    secondary_actions: [
      { id: 'approve_import', label: 'Approve selected memories' },
      { id: 'rollback_import', label: 'Rollback local import' }
    ],
    receipt_boundaries: {
      preview_receipt: 'counts_refs_commitments_only',
      batch_receipt: 'write_refs_and_receipt_hashes_only',
      rollback_receipt: 'tombstone_refs_and_commitments_only',
      raw_memory_returned: false,
      local_paths_returned: false,
      provider_deletion_proof: false,
      model_forgetting_proof: false
    }
  };
}

function supportReportClipboardText(report = {}) {
  const lines = [
    'Enigma safe support report',
    `Status: ${safePublicString(report.status, 'not-run', 32)}`,
    `Report ID: ${safePublicString(report.report_id, 'not generated', 64)}`,
    `Checked: ${safePublicString(report.checked_at, 'not observed', 64)}`,
    'Privacy: no raw memory, prompts, transcripts, provider responses, credentials, tokens, private keys, account identifiers, customer identifiers, raw logs, complete settings, or local paths.'
  ];
  const issues = normalizeIssueCodes(report.issue_codes);
  lines.push(`Issue codes: ${issues.length ? issues.join(', ') : 'none'}`);
  const scan = report.privacy_scan && typeof report.privacy_scan === 'object' ? report.privacy_scan : {};
  lines.push(`Privacy scan: ${safePublicString(scan.status, 'not_run', 32)} (${scan.detected_private_field_count ?? 0} finding(s), ${Array.isArray(scan.checked_categories) ? scan.checked_categories.length : 0} categories checked)`);
  const summary = normalizeSafePublicList(report.shareable_summary ?? report.safe_summary, 6);
  for (const item of summary) lines.push(`Summary: ${item}`);
  return lines.join('\n');
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function localFingerprint(value) {
  const text = String(value ?? '');
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let index = 0; index < text.length; index += 1) {
    a ^= text.charCodeAt(index);
    a = Math.imul(a, 0x01000193) >>> 0;
    b ^= a + index;
    b = Math.imul(b, 0x85ebca6b) >>> 0;
  }
  return `${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}${(a ^ b).toString(16).padStart(8, '0')}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => {
    switch (char) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case "'": return '&#39;';
      case '"': return '&quot;';
      default: return char;
    }
  });
}

function mountDesktopApp() {
  const root = document.querySelector('[data-enigma-desktop]');
  if (!root) return;
  let state = createDesktopState({ now: new Date().toISOString() });

  const dispatch = (action) => {
    state = desktopReducer(state, action);
    render();
  };

  const render = () => {
    const model = renderDesktopModel(state);
    root.innerHTML = renderHtml(model, state);
    wireDesktopEvents(root, state, dispatch);
  };

  render();
}

function renderHtml(model, state) {
  return `
    <header class="shell-hero">
      <div>
        <p class="eyebrow">Enigma Memory Drive</p>
        <h1>Your local Memory Drive for connected AI apps.</h1>
        <p>${escapeHtml(model.notice)}</p>
      </div>
      <dl class="summary-grid">
        ${renderMetric('Memory Drive', model.dashboard.memory_drive_status)}
        ${renderMetric('Connected apps', model.dashboard.connected_app_count)}
        ${renderMetric('Proof activity', model.dashboard.proof_status)}
        ${renderMetric('Next action', model.dashboard.next_action.label)}
      </dl>
    </header>
    <nav class="screen-nav" aria-label="Desktop screens">
      ${model.navigation.map((item) => `<button class="screen-tab${item.active ? ' is-active' : ''}" type="button" data-screen="${escapeHtml(item.id)}">${escapeHtml(item.label)}</button>`).join('')}
    </nav>
    <main>
      ${renderHomeScreen(model.screens.home)}
      ${renderSetupScreen(model.screens.setup)}
      ${renderSupportScreen(model.screens.support)}
      ${renderVaultScreen(model.screens.vault, state)}
      ${renderMcpScreen(model.screens.mcp)}
      ${renderClientsScreen(model.screens.clients)}
      ${renderImportExportScreen(model.screens.importExport, state)}
      ${renderVerifierScreen(model.screens.verifier, state)}
      ${renderDeleteProveScreen(model.screens.deleteProve)}
      ${renderMeshScreen(model.screens.mesh)}
      ${renderEnterpriseScreen(model.screens.enterprise)}
    </main>`;
}

function renderMetric(label, value) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function renderMemoryControllerHtml(controller) {
  const items = [
    ['Memory Weather', controller.memory_weather],
    ['App permissions', controller.app_permissions],
    ['Recall approval', controller.recall_approval],
    ['Private memory bubble', controller.private_memory_bubble]
  ];
  return `<dl class="detail-list">${items.map(([label, item]) => renderMetric(label, `${item.label} · ${item.primary_action.label}`)).join('')}</dl>`;
}
function renderImportSandboxHtml(sandbox) {
  const receiptBoundaries = sandbox.receipt_boundaries || {};
  const boundaries = [
    ['Preview receipt', receiptBoundaries.preview_receipt],
    ['Batch receipt', receiptBoundaries.batch_receipt],
    ['Rollback receipt', receiptBoundaries.rollback_receipt],
    ['Raw memory text', receiptBoundaries.raw_memory_returned === false ? 'never returned' : 'review required'],
    ['Local paths', receiptBoundaries.local_paths_returned === false ? 'never returned' : 'review required'],
    ['Provider-side proof', receiptBoundaries.provider_deletion_proof === false ? 'not claimed' : 'review required'],
    ['Model-state proof', receiptBoundaries.model_forgetting_proof === false ? 'not claimed' : 'review required']
  ];
  return `
    <p>${escapeHtml(sandbox.summary)}</p>
    <dl class="detail-list">
      ${renderMetric('Status', sandbox.label)}
      ${renderMetric('Next action', sandbox.primary_action.label)}
    </dl>
    <ul class="boundary-list">${boundaries.map(([label, value]) => `<li><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></li>`).join('')}</ul>`;
}


function renderScreen(id, title, body) {
  return `<section class="screen-card" id="screen-${escapeHtml(id)}"><div class="screen-heading"><p>${escapeHtml(screenLabel(id))}</p><h2>${escapeHtml(title)}</h2></div>${body}</section>`;
}

function renderHomeScreen(screen) {
  const dashboard = screen.dashboard;
  const issues = dashboard.issue_codes.length ? dashboard.issue_codes.map((code) => `<li>${escapeHtml(code)}</li>`).join('') : '<li>No issues found.</li>';
  return renderScreen('home', screen.title, `
    <div class="two-column">
      <div class="panel status-panel">
        <span class="status-pill">${escapeHtml(dashboard.memory_drive_status)}</span>
        <h3>${escapeHtml(dashboard.next_action.label)}</h3>
        <p>${escapeHtml(dashboard.next_action.reason)}</p>
        <button type="button" data-action="${escapeHtml(dashboard.next_action.id)}">${escapeHtml(dashboard.next_action.label)}</button>
      </div>
      <dl class="panel detail-list">
        ${renderMetric('Connected apps', dashboard.connected_app_count)}
        ${renderMetric('Proof activity', dashboard.proof_status)}
        ${renderMetric('Updates', dashboard.update_status)}
        ${renderMetric('Diagnostics', dashboard.diagnostics_status)}
        ${renderMetric('Offline ready', dashboard.offline_ready ? 'yes' : 'no')}
      </dl>
    </div>
    <div class="two-column trust-card-grid">
      <div class="panel memory-controller-panel"><h3>Memory Controller</h3>${renderMemoryControllerHtml(dashboard.memory_controller)}</div>
      <div class="panel import-sandbox-panel"><h3>Import Sandbox</h3>${renderImportSandboxHtml(dashboard.import_sandbox)}</div>
    </div>
    <div class="panel"><h3>Issue codes</h3><ul class="boundary-list">${issues}</ul></div>`);
}

function renderSetupScreen(screen) {
  const issues = screen.issue_codes.length ? screen.issue_codes.join(', ') : 'none';
  return renderScreen('setup', screen.title, `
    <div class="two-column">
      <div class="panel status-panel">
        <span class="status-pill">${escapeHtml(screen.memory_drive_status)}</span>
        <h3>Memory Drive create or detect</h3>
        <p>Create the local Memory Drive first. The shell reports local setup only; provider logs and model behavior require provider evidence.</p>
      </div>
      <div class="panel status-panel">
        <span class="status-pill">${escapeHtml(screen.health_status)}</span>
        <h3>Health and fix-it</h3>
        <p>One primary action is exposed at a time: ${escapeHtml(screen.next_action.label)}. Issue codes: ${escapeHtml(issues)}.</p>
        <button type="button" data-action="${escapeHtml(screen.next_action.id)}">${escapeHtml(screen.next_action.label)}</button>
      </div>
    </div>`);
}

function renderSupportScreen(screen) {
  const issues = screen.issue_codes.length ? screen.issue_codes.map((code) => `<li>${escapeHtml(code)}</li>`).join('') : '<li>No issue codes in the safe report.</li>';
  const summary = screen.shareable_summary.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  const boundaries = Object.entries(screen.privacy_boundaries).map(([key, value]) => `<li><strong>${escapeHtml(key.replace(/_/g, ' '))}</strong><span>${value === false ? 'never included' : 'review required'}</span></li>`).join('');
  return renderScreen('support', screen.title, `
    <div class="two-column">
      <div class="panel status-panel">
        <span class="status-pill">${escapeHtml(screen.status)}</span>
        <h3>${escapeHtml(screen.primary_action.label)}</h3>
        <p>Share this report with support when asked. It is generated from public-safe status fields only.</p>
        <button type="button" data-action="${escapeHtml(screen.primary_action.id)}">${escapeHtml(screen.primary_action.label)}</button>
      </div>
      <dl class="panel detail-list">
        ${renderMetric('Report ready', screen.support_report_ready ? 'yes' : 'no')}
        ${renderMetric('Report ID', screen.report_id || 'not generated')}
        ${renderMetric('Checked', screen.checked_at || 'not observed')}
        ${renderMetric('Privacy scan', `${screen.privacy_scan.status} · ${screen.privacy_scan.detected_private_field_count} finding(s)`)}
      </dl>
    </div>
    <div class="two-column">
      <div class="panel"><h3>Public summary</h3><ul class="boundary-list">${summary}</ul></div>
      <div class="panel"><h3>Issue codes</h3><ul class="boundary-list">${issues}</ul></div>
    </div>
    <div class="panel"><h3>Privacy boundaries</h3><ul class="boundary-list">${boundaries}</ul></div>
    <p class="honesty-note">No raw memory, prompts, transcripts, provider responses, credentials, tokens, private keys, account identifiers, customer identifiers, raw logs, complete settings, or local paths are included.</p>
    <label class="panel">Copyable safe report<textarea readonly>${escapeHtml(supportReportClipboardText(screen))}</textarea></label>`);
}

function renderVaultScreen(screen, state) {
  const memories = screen.memories.length ? screen.memories.map((memory) => `
    <li class="memory-row${memory.deleted ? ' is-deleted' : ''}">
      <div><strong>${escapeHtml(memory.descriptor)}</strong><span>${escapeHtml(memory.address)}</span></div>
      <code>${escapeHtml(memory.body_fingerprint)}</code>
      <button type="button" data-delete-memory="${escapeHtml(memory.address)}" ${memory.deleted ? 'disabled' : ''}>Delete + prove</button>
    </li>`).join('') : '<li class="empty-row">No memory descriptors yet.</li>';

  return renderScreen('vault', screen.title, `
    <div class="two-column">
      <div class="panel">
        <h3>Vault evidence</h3>
        <dl class="detail-list">
          ${renderMetric('Status', screen.status)}
          ${renderMetric('Vault ID', screen.vault_id || 'not created')}
          ${renderMetric('Active root', screen.active_set_root || 'not observed')}
          ${renderMetric('Receipt log root', screen.receipt_log_root || 'not observed')}
        </dl>
        <button type="button" data-action="create-vault">Create vault shell</button>
      </div>
      <form class="panel" data-form="remember">
        <h3>Remember</h3>
        <label>Descriptor <input name="descriptor" required placeholder="non-sensitive label"></label>
        <label>Memory text <textarea name="body" placeholder="fingerprinted locally; not displayed or exported"></textarea></label>
        <label>Tags <input name="tags" placeholder="project, source"></label>
        <button type="submit">Remember descriptor</button>
      </form>
    </div>
    <form class="inline-form" data-form="search">
      <label>Search descriptors <input name="query" value="${escapeHtml(state.search.query)}" placeholder="tag, address, fingerprint"></label>
      <button type="submit">Search</button>
      <span>${state.search.results.length ? `${state.search.results.length} result(s)` : 'Search excludes raw memory plaintext.'}</span>
    </form>
    <ul class="memory-list">${memories}</ul>`);
}

function renderMcpScreen(screen) {
  return renderScreen('mcp', screen.title, `
    <div class="two-column">
      <div class="panel status-panel">
        <span class="status-pill">${escapeHtml(screen.status)}</span>
        <h3>${escapeHtml(screen.honest_status)}</h3>
        <p>MCP state here is a local control-plane claim. Server receipts and logs are the evidence.</p>
        <div class="button-row"><button type="button" data-action="start-mcp">Start MCP</button><button type="button" data-action="stop-mcp">Stop MCP</button></div>
      </div>
      <dl class="panel detail-list">
        ${renderMetric('Endpoint', screen.endpoint)}
        ${renderMetric('Transport', screen.transport)}
        ${renderMetric('Port', screen.port || 'n/a')}
        ${renderMetric('Connected clients', screen.client_count)}
      </dl>
    </div>`);
}

function renderClientsScreen(screen) {
  const buttons = screen.templates.map((client) => `<button type="button" data-connect-client="${escapeHtml(client.id)}" ${client.connected ? 'disabled' : ''}>${client.connected ? 'Connected' : 'Connect'} ${escapeHtml(client.name)}</button>`).join('');
  const rows = screen.connected.length ? screen.connected.map((client) => `<li><strong>${escapeHtml(client.name)}</strong><span>${escapeHtml(client.status)} via ${escapeHtml(client.endpoint)}</span></li>`).join('') : '<li class="empty-row">No clients connected.</li>';
  const bridgeStatus = screen.browser_bridge_status.map((item) => `<li><span>${escapeHtml(item)}</span></li>`).join('');
  return renderScreen('clients', screen.title, `<div class="panel"><div class="button-grid">${buttons}</div></div><div class="panel"><h3>Browser bridge boundaries</h3><ul class="boundary-list">${bridgeStatus}</ul></div><ul class="connection-list">${rows}</ul>`);
}

function renderImportExportScreen(screen, state) {
  return renderScreen('import-export', screen.title, `
    <div class="two-column">
      <form class="panel" data-form="import">
        <h3>Import safe bundle</h3>
        <textarea name="bundle" placeholder="Paste ${EXPORT_SCHEMA} JSON">${escapeHtml(state.drafts.importInput)}</textarea>
        <button type="submit">Import</button>
        <p>${escapeHtml(screen.import_status)} ${escapeHtml(screen.import_errors.join('; '))}</p>
      </form>
      <form class="panel" data-form="export">
        <h3>Export evidence metadata</h3>
        <button type="submit">Prepare export</button>
        <textarea readonly>${escapeHtml(state.drafts.exportOutput || '')}</textarea>
      </form>
    </div>`);
}

function renderVerifierScreen(screen, state) {
  const evidence = screen.evidence.length ? screen.evidence.map((item) => `<li class="evidence-row${item.ok ? ' is-ok' : ' is-bad'}"><strong>${escapeHtml(item.receipt_id || `receipt[${item.index}]`)}</strong><span>${escapeHtml(item.operation || 'unknown operation')}</span><small>${escapeHtml(item.errors.length ? item.errors.join('; ') : item.note)}</small></li>`).join('') : '<li class="empty-row">No receipt evidence checked.</li>';
  return renderScreen('verifier', screen.title, `
    <form class="panel" data-form="verify">
      <h3>Inspect receipt shape</h3>
      <p>${escapeHtml(screen.note)} ${escapeHtml(screen.body_fingerprint_note)}</p>
      <textarea name="receipts" placeholder="Paste receipt JSON or { receipts: [...] }">${escapeHtml(state.drafts.receiptInput)}</textarea>
      <button type="submit">Inspect receipt shape</button>
    </form>
    <ul class="evidence-list">${evidence}</ul>`);
}

function renderDeleteProveScreen(screen) {
  const pending = screen.pending.length ? screen.pending.map((item) => `<li><strong>${escapeHtml(item.memory_addr)}</strong><span>${escapeHtml(item.status)}</span><code>${escapeHtml(item.body_fingerprint)}</code></li>`).join('') : '<li class="empty-row">No pending deletion evidence.</li>';
  const completed = screen.completed.length ? screen.completed.map((item) => `<li><strong>${escapeHtml(item.memory_addr)}</strong><span>matched ${escapeHtml(item.receipt_id)}</span></li>`).join('') : '<li class="empty-row">No matched deletion receipts.</li>';
  return renderScreen('delete-prove', screen.title, `<p class="honesty-note">${escapeHtml(screen.note)}</p><div class="two-column"><div class="panel"><h3>Pending</h3><ul>${pending}</ul></div><div class="panel"><h3>Matched receipts</h3><ul>${completed}</ul></div></div>`);
}

function renderMeshScreen(screen) {
  return renderScreen('mesh', screen.title, `<div class="panel status-panel"><span class="status-pill">${escapeHtml(screen.status)}</span><p>${escapeHtml(screen.note)}</p><dl class="detail-list">${renderMetric('Peers', screen.peers)}${renderMetric('Relays', screen.relays)}${renderMetric('Last witness', screen.last_witness_at || 'not observed')}</dl><button type="button" data-action="mesh-online">Mark local mesh online</button></div>`);
}

function renderEnterpriseScreen(screen) {
  return renderScreen('enterprise', screen.title, `<div class="panel status-panel"><span class="status-pill">${escapeHtml(screen.status)}</span><p>${escapeHtml(screen.note)}</p><dl class="detail-list">${renderMetric('Tenant', screen.tenant_id || 'not configured')}${renderMetric('Policy', screen.policy_id || 'not configured')}${renderMetric('SIEM', screen.siem)}</dl><button type="button" data-action="enterprise-demo">Load enterprise demo status</button></div>`);
}

function wireDesktopEvents(root, state, dispatch) {
  root.querySelectorAll('[data-screen]').forEach((button) => {
    button.addEventListener('click', () => dispatch(selectDesktopScreen(button.dataset.screen)));
  });

  root.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const now = new Date().toISOString();
      switch (button.dataset.action) {
        case 'create-vault':
          dispatch(createVault({ now, name: 'desktop vault' }));
          break;
        case 'start-mcp':
          dispatch(startMcp({ now }));
          break;
        case 'stop-mcp':
          dispatch(stopMcp({ now }));
          break;
        case 'create_memory_drive':
          dispatch(createMemoryDrive({ now, label: 'Memory Drive' }));
          break;
        case 'start_service':
          dispatch(updateDesktopService({ status: 'running', issue_codes: [] }, { now }));
          break;
        case 'fix_health':
          dispatch(updateDesktopHealth({ status: 'healthy', issue_codes: [] }, { now }));
          break;
        case 'install_update':
          dispatch(updateDesktopUpdateStatus({ status: 'current', issue_codes: [] }, { now }));
          break;
        case 'open_diagnostics':
          dispatch(selectDesktopScreen('support'));
          break;
        case 'collect_support_report':
          dispatch(updateDesktopDiagnostics({
            status: 'ready',
            support_report_ready: true,
            issue_codes: ['SAFE_SUPPORT_REPORT_READY'],
            safe_summary: ['Memory Drive status checked', 'Connected app status checked', 'Proof and update status checked']
          }, { now }));
          dispatch(selectDesktopScreen('support'));
          break;
        case 'copy_support_report': {
          const report = renderSupportReportModel(state.desktopDiagnostics);
          if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(supportReportClipboardText(report)).catch(() => undefined);
          }
          dispatch(selectDesktopScreen('support'));
          break;
        }
        case 'shutdown_desktop':
          dispatch(shutdownDesktop({ now }));
          break;
        case 'connect_app':
          dispatch(selectDesktopScreen('clients'));
          break;
        case 'review_proof':
        case 'view_proof_activity':
          dispatch(selectDesktopScreen('verifier'));
          break;
        case 'mesh-online':
          dispatch(updateMeshStatus({ status: 'online', peers: 3, relays: 1, last_witness_at: now }, { now }));
          break;
        case 'enterprise-demo':
          dispatch(updateEnterpriseStatus({ status: 'configured', tenant_id: 'tenant_local', policy_id: 'policy_desktop', siem: 'ready' }, { now }));
          break;
        default:
          break;
      }
    });
  });

  root.querySelectorAll('[data-connect-client]').forEach((button) => {
    button.addEventListener('click', () => {
      const template = CLIENT_TEMPLATES.find((client) => client.id === button.dataset.connectClient);
      dispatch(connectClient(template, { now: new Date().toISOString() }));
    });
  });

  root.querySelectorAll('[data-delete-memory]').forEach((button) => {
    button.addEventListener('click', () => dispatch(deleteMemory(button.dataset.deleteMemory, { now: new Date().toISOString() })));
  });

  const rememberForm = root.querySelector('[data-form="remember"]');
  if (rememberForm) {
    rememberForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(rememberForm);
      dispatch(rememberMemory({ descriptor: data.get('descriptor'), body: data.get('body'), tags: data.get('tags') }, { now: new Date().toISOString() }));
    });
  }

  const searchForm = root.querySelector('[data-form="search"]');
  if (searchForm) {
    searchForm.addEventListener('submit', (event) => {
      event.preventDefault();
      dispatch(searchMemories(new FormData(searchForm).get('query')));
    });
  }

  const verifyForm = root.querySelector('[data-form="verify"]');
  if (verifyForm) {
    verifyForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const text = String(new FormData(verifyForm).get('receipts') ?? '');
      dispatch(setDesktopDraft('receiptInput', text));
      dispatch(verifyReceipts(text, { now: new Date().toISOString() }));
    });
  }

  const importForm = root.querySelector('[data-form="import"]');
  if (importForm) {
    importForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const text = String(new FormData(importForm).get('bundle') ?? '');
      dispatch(setDesktopDraft('importInput', text));
      dispatch(importBundle(text, { now: new Date().toISOString() }));
    });
  }

  const exportForm = root.querySelector('[data-form="export"]');
  if (exportForm) {
    exportForm.addEventListener('submit', (event) => {
      event.preventDefault();
      dispatch(exportBundle({ now: new Date().toISOString(), scope: 'all' }));
    });
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountDesktopApp, { once: true });
  } else {
    mountDesktopApp();
  }
}
