const DESKTOP_SCHEMA = 'enigma.desktop.state.v1';
const EXPORT_SCHEMA = 'enigma.desktop.export.v1';
const DELETE_EVIDENCE_SCHEMA = 'enigma.desktop.delete_evidence.v1';
const VERIFIER_EVIDENCE_SCHEMA = 'enigma.desktop.verifier_evidence.v1';

export const DESKTOP_SCREENS = Object.freeze([
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
const RAW_LOOKING_VALUE_RE = /(private\s+launch-code|must\s+not\s+leave\s+local\s+memory|raw[\s_-]*memory|plain[\s_-]*text|secret|password|api[\s_-]*key|body\s*:|content\s*:)/i;

export function createDesktopState(options = {}) {
  const now = cleanString(options.now) || INITIAL_NOW;
  const vaultId = cleanString(options.vault_id ?? options.vaultId);
  return {
    schema: DESKTOP_SCHEMA,
    version: 1,
    sequence: 0,
    activeScreen: isKnownScreen(options.activeScreen) ? options.activeScreen : 'vault',
    notice: 'Desktop shell state is operational evidence only. It is not cryptographic proof.',
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
      return withNotice(state, `Unknown action \"${type}\" was rejected.`);
  }
}

export function renderDesktopModel(state = createDesktopState()) {
  const activeMemories = state.memories.filter((memory) => !memory.deleted);
  const deletedMemories = state.memories.filter((memory) => memory.deleted);
  const connectedClients = state.clients.filter((client) => client.status === 'connected');
  const verifierOk = state.verifier.status === 'checked' && state.verifier.errors.length === 0;

  return {
    schema: 'enigma.desktop.render_model.v1',
    activeScreen: state.activeScreen,
    notice: state.notice,
    navigation: DESKTOP_SCREENS.map((id) => ({ id, label: screenLabel(id), active: id === state.activeScreen })),
    summary: {
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
      vault: {
        title: 'Vault status',
        status: state.vault.status,
        vault_id: state.vault.vault_id,
        active_set_root: state.vault.active_set_root,
        receipt_log_root: state.vault.receipt_log_root,
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
        endpoint: state.mcp.endpoint,
        transport: state.mcp.transport,
        port: state.mcp.port,
        client_count: connectedClients.length,
        honest_status: state.mcp.status === 'running' ? 'local server claimed running' : 'local server stopped'
      },
      clients: {
        title: 'Client connections',
        templates: CLIENT_TEMPLATES.map((template) => ({ ...template, connected: state.clients.some((client) => client.id === template.id && client.status === 'connected') })),
        connected: state.clients.map((client) => ({ ...client })),
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
        tenant_id: state.enterprise.tenant_id,
        policy_id: state.enterprise.policy_id,
        siem: state.enterprise.siem,
        note: state.enterprise.note
      }
    }
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

export function setDesktopDraft(name, value) {
  return { name, value, type: 'draft/set' };
}

export const desktopActions = Object.freeze({
  startMcp,
  stopMcp,
  startMCP: startMcp,
  stopMCP: stopMcp,
  createVault,
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
  desktopActions,
  actions,
  startMcp,
  stopMcp,
  startMCP,
  stopMCP,
  createVault,
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
  exportDesktopBundle
});

if (typeof globalThis !== 'undefined') {
  globalThis.EnigmaDesktop = desktopApi;
}

function selectScreen(state, screen) {
  if (!isKnownScreen(screen)) return withNotice(state, 'Unknown screen path rejected.');
  return { ...state, activeScreen: screen, notice: 'Desktop shell state is operational evidence only. It is not cryptographic proof.' };
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

function rememberMemoryState(state, action) {
  if (state.vault.status !== 'ready') return withNotice(state, 'Create a vault before remembering memory.');

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

function setDraftState(state, action) {
  const name = cleanString(action.name);
  if (!Object.prototype.hasOwnProperty.call(state.drafts, name)) return withNotice(state, 'Unknown draft field rejected.');
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
      vault_id: state.vault.vault_id,
      active_set_root: state.vault.active_set_root,
      receipt_log_root: state.vault.receipt_log_root,
      receipt_count: state.vault.receipt_count
    },
    memories: state.memories.map((memory) => ({
      address: memory.address,
      descriptor: safeImportedText(memory.descriptor, 'imported memory', 96),
      source: safeImportedText(memory.source, 'imported-bundle', 96),
      tags: sanitizeImportedTags(memory.tags),
      tenant_id: memory.tenant_id,
      subject_id: memory.subject_id,
      body_fingerprint: isRawLookingText(memory.body_fingerprint) ? '' : memory.body_fingerprint,
      body_bytes: memory.body_bytes,
      deleted: memory.deleted,
      created_at: memory.created_at,
      deleted_at: memory.deleted_at,
      receipt_id: memory.receipt_id
    })),
    deletionEvidence: state.deletionEvidence.map(sanitizeDeletionEvidenceForExport),
    verifierEvidence: state.verifier.evidence.map(sanitizeVerifierEvidenceForExport),
    mesh: { ...state.mesh },
    enterprise: { ...state.enterprise },
    clients: includeClients ? state.clients.map((client) => ({ ...client })) : []
  };
}

function renderMemoryRow(memory) {
  return {
    address: memory.address,
    descriptor: memory.descriptor,
    source: memory.source,
    tags: memory.tags.slice(),
    body_fingerprint: memory.body_fingerprint,
    deleted: memory.deleted,
    receipt_id: memory.receipt_id
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
    case 'vault': return 'Vault';
    case 'mcp': return 'MCP server';
    case 'clients': return 'Clients';
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
        <p class="eyebrow">Enigma desktop scaffold</p>
        <h1>Provider-neutral memory custody, receipts, and MCP control.</h1>
        <p>${escapeHtml(model.notice)}</p>
      </div>
      <dl class="summary-grid">
        ${renderMetric('Vault', model.summary.vault)}
        ${renderMetric('MCP', model.summary.mcp)}
        ${renderMetric('Clients', model.summary.clients)}
        ${renderMetric('Receipt inspector', model.summary.verifier)}
      </dl>
    </header>
    <nav class="screen-nav" aria-label="Desktop screens">
      ${model.navigation.map((item) => `<button class="screen-tab${item.active ? ' is-active' : ''}" type="button" data-screen="${escapeHtml(item.id)}">${escapeHtml(item.label)}</button>`).join('')}
    </nav>
    <main>
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

function renderScreen(id, title, body) {
  return `<section class="screen-card" id="screen-${escapeHtml(id)}"><div class="screen-heading"><p>${escapeHtml(screenLabel(id))}</p><h2>${escapeHtml(title)}</h2></div>${body}</section>`;
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
