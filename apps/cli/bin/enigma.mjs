#!/usr/bin/env node
import { createServer as createHttpServer } from 'node:http';
import { realpathSync } from 'node:fs';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createVault, remember, recall, updateMemory, deleteMemory, exportBundle } from '../../../packages/vault/src/index.js';
import { createPassport, compileContextPack } from '../../../packages/passport/src/index.js';
import { runBoundarySimulation } from '../../../packages/boundary/src/index.js';
import { startStdioServer } from '../../../packages/mcp-server/src/index.js';
import { runMeshDemo } from '../../../packages/mesh/src/index.js';
import { runEnterpriseDemo } from '../../../packages/enterprise/src/index.js';
import { connectClient, disconnectClient, doctorConnectors, getClientProfile, renderMcpConfig, supportedClients } from '../../../packages/connectors/src/index.js';
import { exportEnigmaCapsule, importChatGptExport, importClaudeMemory, importEnigmaCapsule, importLangGraphStore, importLettaAgentFile, importMem0Export, importZepGraphitiExport } from '../../../packages/importers/src/index.js';
import * as relayServer from '../../relay/src/server.mjs';
import * as gatewayServer from '../../gateway/src/server.mjs';
import { verifyBundle } from '../../verifier/bin/enigma-verify.mjs';
import { createNativeHostInstallPlan, createNativeHostManifest } from '../../native-host/bin/enigma-native-host.mjs';
import { aggregateUsageEvents, createUsageEvent } from '../../../packages/metering/src/index.js';
import {
  createConsumerGpuCapacityProfile,
  createOperatorServiceQuote,
  createPermissionlessMemoryJob,
  createServiceSettlementReceipt,
  createSettlementBatch,
  verifyServiceSettlementReceipt,
} from '../../../packages/settlement/src/index.js';

const DEFAULT_BUNDLE = '.enigma/bundle.json';
export const DEFAULT_RELAY_PORT = 8787;
export const DEFAULT_GATEWAY_PORT = 8797;
const PACKAGE_JSON_URL = new URL('../../../package.json', import.meta.url);
const SPECS_URL = new URL('../../../specs/', import.meta.url);
const IMPORTERS = Object.freeze({
  chatgpt: importChatGptExport,
  'chatgpt-export': importChatGptExport,
  chatgpt_export: importChatGptExport,
  claude: importClaudeMemory,
  'claude-memory': importClaudeMemory,
  claude_memory: importClaudeMemory,
  mem0: importMem0Export,
  'mem0-export': importMem0Export,
  mem0_export: importMem0Export,
  letta: importLettaAgentFile,
  'letta-agent': importLettaAgentFile,
  letta_agent: importLettaAgentFile,
  letta_agent_file: importLettaAgentFile,
  langgraph: importLangGraphStore,
  'langgraph-store': importLangGraphStore,
  langgraph_store: importLangGraphStore,
  zep: importZepGraphitiExport,
  graphiti: importZepGraphitiExport,
  'zep-graphiti': importZepGraphitiExport,
  zep_graphiti: importZepGraphitiExport,
  zep_graphiti_export: importZepGraphitiExport,
});

export const REQUIRED_PACKAGE_BINS = Object.freeze(['enigma', 'enigma-verify', 'enigma-mcp', 'enigma-relay', 'enigma-gateway', 'enigma-native-host']);

function parseArgs(argv) {
  const flags = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      flags.set(arg.slice(2, eq), arg.slice(eq + 1));
    } else if (!argv[i + 1] || argv[i + 1].startsWith('--')) {
      flags.set(arg.slice(2), true);
    } else {
      flags.set(arg.slice(2), argv[i + 1]);
      i += 1;
    }
  }
  return flags;
}

function getFlag(flags, names, fallback = undefined) {
  for (const name of names) if (flags.has(name)) return flags.get(name);
  return fallback;
}

function requireFlag(flags, names, label = names[0]) {
  const value = getFlag(flags, names);
  if (value === undefined || value === true || value === '') throw new Error(`Missing required --${label}.`);
  return value;
}

function optionalPositional(value) {
  return value && !String(value).startsWith('--') ? String(value) : undefined;
}

function requireFileArg(flags, names, positional, label = names[0]) {
  const value = getFlag(flags, names);
  if (value !== undefined && value !== true && value !== '') return value;
  if (positional) return positional;
  throw new Error(`Missing required --${label}.`);
}

function parseJson(value, fallback = {}) {
  if (value === undefined || value === true || value === '') return fallback;
  return JSON.parse(value);
}

function parseList(value) {
  if (value === undefined || value === true || value === '') return [];
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function parseOptionalNumber(value) {
  if (value === undefined || value === true || value === '') return undefined;
  return Number(value);
}

function print(value, io) {
  io.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function memoryTextFromFlags(flags) {
  const inlineText = getFlag(flags, ['text', 'memory']);
  const textFile = getFlag(flags, ['text-file', 'textFile', 'memory-file', 'memoryFile']);
  if (inlineText !== undefined && textFile !== undefined) throw new Error('Use either --text or --text-file, not both.');
  if (textFile !== undefined) {
    if (textFile === true || textFile === '') throw new Error('Missing required --text-file.');
    return readFile(resolve(String(textFile)), 'utf8');
  }
  return requireFlag(flags, ['text', 'memory'], 'text');
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readPackageJson() {
  return readJson(PACKAGE_JSON_URL);
}

function packageFileUrl(path) {
  return new URL(`../../../${String(path).replace(/^\.\//, '')}`, import.meta.url);
}

function nodeMajor(version) {
  return Number(String(version).split('.')[0]);
}

function minimumNodeMajor(range) {
  const match = String(range ?? '').match(/>=\s*(\d+)/);
  return match ? Number(match[1]) : 0;
}

async function schemaFiles() {
  return (await readdir(SPECS_URL)).filter((name) => name.endsWith('.schema.json')).sort();
}

function connectorOptions(flags, includeBundle = true) {
  const options = {};
  if (includeBundle) options.bundlePath = resolve(String(getFlag(flags, ['bundle', 'file'], DEFAULT_BUNDLE)));
  const configPath = getFlag(flags, ['config', 'config-path']);
  if (configPath && configPath !== true) options.configPath = resolve(String(configPath));
  const serverName = getFlag(flags, ['server-name']);
  if (serverName && serverName !== true) options.serverName = String(serverName);
  const mcpCommand = getFlag(flags, ['mcp-command', 'command']);
  if (mcpCommand && mcpCommand !== true) options.mcpCommand = String(mcpCommand);
  if (getFlag(flags, ['dry-run', 'dryRun'], false) === true) options.dryRun = true;
  return options;
}

function publicCapsuleImportResult(result) {
  return {
    ...result,
    memory_candidates: Array.isArray(result.memory_candidates)
      ? result.memory_candidates.map(({ content: _content, metadata: _metadata, ...candidate }) => candidate)
      : [],
  };
}

async function ensureBundle(bundlePath, flags = {}) {
  const existed = await fileExists(bundlePath);
  if (existed) return { created: false, bundle: await readJson(bundlePath) };
  const vault = createVault({
    subjectId: String(getFlag(flags, ['subject', 'subject-id'], 'local-user')),
    displayName: String(getFlag(flags, ['display-name', 'name'], 'Local user')),
    passphrase: String(getFlag(flags, ['passphrase'], 'local-development-passphrase')),
  });
  const bundle = await persistState(bundlePath, vault);
  return { created: true, bundle };
}

function listenAddress(server) {
  const address = server.address();
  if (typeof address === 'string') return { path: address };
  return { host: address?.address, port: address?.port, family: address?.family };
}
function requireStringFlag(flags, names, label = names[0]) {
  const value = getFlag(flags, names);
  if (value === undefined) return undefined;
  if (value === true || value === '') throw new Error(`Missing required --${label}.`);
  return String(value);
}

async function loadOrCreateState({ flags, createState, loadStateFromFile, saveStateToFile }) {
  const stateFileFlag = requireStringFlag(flags, ['state-file'], 'state-file');
  if (stateFileFlag === undefined) return { state: createState(), stateFile: undefined };
  const stateFile = resolve(stateFileFlag);
  await mkdir(dirname(stateFile), { recursive: true });
  const state = await fileExists(stateFile) ? await loadStateFromFile(stateFile) : createState();
  await saveStateToFile(state, stateFile);
  return { state, stateFile };
}

function stateMutatingRelayRequest(req) {
  if (String(req.method ?? 'GET').toUpperCase() !== 'POST') return false;
  const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
  return pathname === '/relay/push'
    || pathname === '/witness/checkpoint'
    || pathname === '/pairing/challenge'
    || pathname === '/pairing/complete';
}

function stateMutatingGatewayRequest(req) {
  const method = String(req.method ?? 'GET').toUpperCase();
  const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
  return (method === 'PUT' && pathname === '/policy')
    || (method === 'POST' && (pathname === '/gateway/evaluate' || pathname === '/gateway/decision'));
}

function createPersistentHttpServer({ state, stateFile, io, service, handleRequest, saveStateToFile, stateMutatingRequest }) {
  let pendingSave = Promise.resolve();
  let server;
  const saveState = () => {
    if (stateFile === undefined) return pendingSave;
    pendingSave = pendingSave.catch(() => undefined).then(() => saveStateToFile(state, stateFile));
    pendingSave.catch((error) => {
      io.stderr?.write?.(`${service} state persistence failed: ${error instanceof Error ? error.message : String(error)}\n`);
      server.close();
    });
    return pendingSave;
  };
  server = createHttpServer((req, res) => {
    const shouldSave = stateFile !== undefined && stateMutatingRequest(req);
    Promise.resolve(handleRequest(state, req, res)).then(() => {
      if (shouldSave && res.statusCode < 400) return saveState();
      return undefined;
    }).catch((error) => {
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: { code: 'SERVER_ERROR' } }));
      }
      io.stderr?.write?.(`${service} request failed: ${error instanceof Error ? error.message : String(error)}\n`);
    });
  });
  server.persistState = saveState;
  server.waitForStatePersistence = () => pendingSave;
  return server;
}

async function createServiceServer({ flags, io, service, createState, handleRequest, loadStateFromFile, saveStateToFile, stateMutatingRequest }) {
  const { state, stateFile } = await loadOrCreateState({ flags, createState, loadStateFromFile, saveStateToFile });
  return createPersistentHttpServer({ state, stateFile, io, service, handleRequest, saveStateToFile, stateMutatingRequest });
}


async function serveHttpCommand({ flags, io, service, createServer, defaultPort }) {
  const host = String(getFlag(flags, ['host'], '127.0.0.1'));
  const port = Number(getFlag(flags, ['port'], defaultPort));
  const server = await createServer();
  await new Promise((resolveListen, rejectListen) => {
    const onError = (error) => {
      server.off('listening', onListening);
      rejectListen(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolveListen();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen({ host, port });
  });
  print({ ok: true, service, listening: true, address: listenAddress(server) }, io);
  if (getFlag(flags, ['once'], false) === true) {
    await server.persistState?.();
    await server.waitForStatePersistence?.();
    await new Promise((resolveClose, rejectClose) => server.close((error) => (error ? rejectClose(error) : resolveClose())));
    return 0;
  }
  await new Promise((resolveClose) => server.once('close', resolveClose));
  return 0;
}

function reviveVault(stored) {
  if (stored.schema !== 'enigma.vault_bundle.v1') {
    if (stored.vault?.schema === 'enigma.vault.local.v1') return stored.vault;
    throw new Error(`Unsupported Enigma bundle schema: ${stored.schema ?? '<missing>'}`);
  }
  const signingKeyPair = stored.keyring?.privateKey
    ? { key_id: stored.keyring.signer?.key_id, publicKey: stored.keyring.publicKey, privateKey: stored.keyring.privateKey }
    : undefined;
  const vault = createVault({
    vault_id: stored.vault?.vault_id,
    tenant_id: stored.vault?.tenant_id,
    subject_id: stored.vault?.subject_id,
    actor_id: stored.vault?.actor_id,
    policy_id: stored.vault?.policy_id,
    vault_key: stored.keyring?.vault_key_b64,
    address_key: stored.keyring?.address_key_b64,
    signingKeyPair,
    now: stored.vault?.created_at,
  });
  if (stored.keyring?.signer) vault.signer = stored.keyring.signer;
  vault.created_at = stored.vault?.created_at ?? vault.created_at;
  vault.updated_at = stored.vault?.updated_at ?? vault.updated_at;
  vault.sequence = Number.isInteger(stored.vault?.sequence) ? stored.vault.sequence : 0;
  vault.events = Array.isArray(stored.events) ? stored.events : [];
  vault.receipts = Array.isArray(stored.receipts) ? stored.receipts : [];
  vault.memories = new Map((stored.memory_objects ?? []).map((record) => [record.memory_addr, { ...record }]));
  vault.activeAddresses = new Set(stored.active_memory_addresses ?? []);
  vault.tombstones = new Map((stored.tombstones ?? []).map((tombstone) => [tombstone.memory_addr, tombstone]));
  const roots = vault.__computeRoots();
  vault.active_set_root = roots.active_set_root;
  vault.receipt_log_root = roots.receipt_log_root;
  return vault;
}

async function loadState(bundlePath) {
  const stored = await readJson(bundlePath);
  const vault = reviveVault(stored);
  return { stored, vault, passport: createPassport({ vault }) };
}

async function persistState(bundlePath, vault) {
  const exported = exportBundle({ vault, includePlaintext: false });
  const bundle = exported.bundle ?? exported;
  await writeJson(bundlePath, bundle);
  return bundle;
}

async function initCommand(flags, io) {
  const bundlePath = resolve(String(getFlag(flags, ['bundle', 'file'], DEFAULT_BUNDLE)));
  const vault = createVault({
    subjectId: String(getFlag(flags, ['subject', 'subject-id'], 'local-user')),
    displayName: String(getFlag(flags, ['display-name', 'name'], 'Local user')),
    passphrase: String(getFlag(flags, ['passphrase'], 'local-development-passphrase')),
  });
  const bundle = await persistState(bundlePath, vault);
  print({ ok: true, bundle: bundlePath, schema: bundle.schema, subject_id: bundle.vault?.subject_id }, io);
  return 0;
}

async function rememberCommand(flags, io) {
  const bundlePath = resolve(String(getFlag(flags, ['bundle', 'file'], DEFAULT_BUNDLE)));
  const { vault, passport } = await loadState(bundlePath);
  const result = remember({
    vault,
    passport,
    text: await memoryTextFromFlags(flags),
    purpose: getFlag(flags, ['purpose'], 'user_memory'),
    purpose_tags: parseList(getFlag(flags, ['tags'])),
    metadata: parseJson(getFlag(flags, ['metadata']), {}),
  });
  await persistState(bundlePath, vault);
  print({ ok: true, memory_addr: result.memory_addr, receipt_id: result.receipt?.receipt_id }, io);
  return 0;
}

async function recallCommand(flags, io) {
  const bundlePath = resolve(String(getFlag(flags, ['bundle', 'file'], DEFAULT_BUNDLE)));
  const { vault, passport } = await loadState(bundlePath);
  const result = recall({
    vault,
    passport,
    memory_addr: requireFlag(flags, ['id', 'memory-addr'], 'id'),
    purpose: getFlag(flags, ['purpose'], 'local_recall'),
  });
  await persistState(bundlePath, vault);
  print(result, io);
  return 0;
}

async function updateCommand(flags, io) {
  const bundlePath = resolve(String(getFlag(flags, ['bundle', 'file'], DEFAULT_BUNDLE)));
  const { vault, passport } = await loadState(bundlePath);
  const result = updateMemory({
    vault,
    passport,
    memory_addr: requireFlag(flags, ['id', 'memory-addr'], 'id'),
    text: requireFlag(flags, ['text', 'memory'], 'text'),
    metadata: parseJson(getFlag(flags, ['metadata']), {}),
  });
  await persistState(bundlePath, vault);
  print({ ok: true, old_memory_addr: result.old_memory_addr, memory_addr: result.memory_addr, receipt_id: result.receipt?.receipt_id }, io);
  return 0;
}

async function deleteCommand(flags, io) {
  const bundlePath = resolve(String(getFlag(flags, ['bundle', 'file'], DEFAULT_BUNDLE)));
  const { vault, passport } = await loadState(bundlePath);
  const result = deleteMemory({
    vault,
    passport,
    memory_addr: requireFlag(flags, ['id', 'memory-addr'], 'id'),
    reason: getFlag(flags, ['reason'], 'user_delete'),
  });
  await persistState(bundlePath, vault);
  print({ ok: true, memory_addr: result.memory_addr, receipt_id: result.receipt?.receipt_id }, io);
  return 0;
}

async function contextCommand(flags, io) {
  const bundlePath = resolve(String(getFlag(flags, ['bundle', 'file'], DEFAULT_BUNDLE)));
  const { vault, passport } = await loadState(bundlePath);
  const pack = compileContextPack({
    vault,
    passport,
    query: getFlag(flags, ['query', 'q'], ''),
    purpose: getFlag(flags, ['purpose'], 'local_context'),
    limit: Number(getFlag(flags, ['limit'], 8)),
    optimize: getFlag(flags, ['optimize']) === true || getFlag(flags, ['optimize']) === 'true',
    max_estimated_tokens: parseOptionalNumber(getFlag(flags, ['max-estimated-tokens', 'maxEstimatedTokens'])),
    price_per_million_tokens: parseOptionalNumber(getFlag(flags, ['price-per-million-tokens', 'pricePerMillionTokens'])),
    currency: getFlag(flags, ['currency']),
  });
  await persistState(bundlePath, vault);
  const out = getFlag(flags, ['out']);
  if (out && out !== true) await writeJson(resolve(String(out)), pack);
  print(pack, io);
  return 0;
}

async function exportCommand(flags, io) {
  const bundlePath = resolve(String(getFlag(flags, ['bundle', 'file'], DEFAULT_BUNDLE)));
  const { vault } = await loadState(bundlePath);
  const exported = exportBundle({ vault, includePlaintext: false });
  const bundle = exported.bundle ?? exported;
  await writeJson(bundlePath, bundle);
  const out = resolve(String(getFlag(flags, ['out'], 'enigma-export.json')));
  await writeJson(out, bundle);
  print({ ok: true, export: out, receipt_count: Array.isArray(bundle.receipts) ? bundle.receipts.length : 0 }, io);
  return 0;
}

async function verifyCommand(flags, io) {
  const path = resolve(String(getFlag(flags, ['bundle', 'file', 'export'], DEFAULT_BUNDLE)));
  const report = verifyBundle(await readJson(path));
  print(report, io);
  return report.ok ? 0 : 1;
}

async function boundaryRunCommand(flags, io) {
  const manifestPath = getFlag(flags, ['manifest']);
  const tracePath = getFlag(flags, ['trace']);
  const report = runBoundarySimulation({
    scenario: String(getFlag(flags, ['scenario'], 'committed_crossing')),
    manifest: manifestPath && manifestPath !== true ? await readJson(resolve(String(manifestPath))) : undefined,
    trace: tracePath && tracePath !== true ? await readJson(resolve(String(tracePath))) : undefined,
  });
  print(report, io);
  return report?.ok === false || report?.verdict === 'FAIL' || report?.status === 'FAIL' ? 1 : 0;
}

export async function mcpServeCommand(_flags, io) {
  const server = startStdioServer({
    input: io.stdin ?? process.stdin,
    output: io.stdout ?? process.stdout,
    errorOutput: io.stderr ?? process.stderr,
  });
  if (server?.done) await server.done;
  return 0;
}

export async function meshDemoCommand(_flags, io) {
  print(runMeshDemo(), io);
  return 0;
}

export async function enterpriseDemoCommand(_flags, io) {
  print(runEnterpriseDemo(), io);
  return 0;
}

export async function doctorCommand(flags, io) {
  const packageJson = await readPackageJson();
  const requiredNodeMajor = minimumNodeMajor(packageJson.engines?.node);
  const currentNodeMajor = nodeMajor(process.versions.node);
  const binMap = packageJson.bin && typeof packageJson.bin === 'object' && !Array.isArray(packageJson.bin) ? packageJson.bin : {};
  const binEntries = await Promise.all(REQUIRED_PACKAGE_BINS.map(async (name) => {
    const target = binMap[name];
    const declared = typeof target === 'string' && target.length > 0;
    return {
      name,
      target: declared ? target : null,
      declared,
      exists: declared ? await fileExists(packageFileUrl(target)) : false,
    };
  }));
  const schemas = await schemaFiles();
  const selectedClient = getFlag(flags, ['client']);
  const doctorOptions = selectedClient && selectedClient !== true
    ? { ...connectorOptions(flags), clientId: String(selectedClient) }
    : { ...connectorOptions(flags), clientId: undefined };
  const connectorDoctor = await doctorConnectors(doctorOptions);
  const profile = getClientProfile(String(selectedClient && selectedClient !== true ? selectedClient : 'generic-mcp'), connectorOptions(flags));
  const checks = {
    node: {
      ok: requiredNodeMajor === 0 || currentNodeMajor >= requiredNodeMajor,
      current: process.versions.node,
      required: packageJson.engines?.node ?? null,
    },
    package_bins: {
      ok: binEntries.every((entry) => entry.declared && entry.exists),
      required: REQUIRED_PACKAGE_BINS,
      entries: binEntries,
      missing: binEntries.filter((entry) => !entry.declared).map((entry) => entry.name),
      missing_targets: binEntries.filter((entry) => entry.declared && !entry.exists).map((entry) => entry.name),
    },
    bundle_default_path: {
      ok: DEFAULT_BUNDLE === '.enigma/bundle.json',
      path: DEFAULT_BUNDLE,
      resolved: resolve(String(getFlag(flags, ['bundle', 'file'], DEFAULT_BUNDLE))),
    },
    schemas: {
      ok: schemas.length > 0,
      count: schemas.length,
      files: schemas,
    },
    mcp_command_name: {
      ok: profile.command === 'enigma-mcp',
      command: profile.command,
      expected: 'enigma-mcp',
    },
    connectors: connectorDoctor,
  };
  const ok = Object.values(checks).every((check) => check.ok !== false);
  print({
    ok,
    node: checks.node,
    package_bins: checks.package_bins,
    bundle_default_path: checks.bundle_default_path,
    schema_count: checks.schemas.count,
    schemas: checks.schemas,
    mcp_command_name: checks.mcp_command_name.command,
    connectors: checks.connectors,
    checks,
  }, io);
  return ok ? 0 : 1;
}

export async function installCommand(flags, io) {
  const bundlePath = resolve(String(getFlag(flags, ['bundle', 'file'], DEFAULT_BUNDLE)));
  const bundleState = await ensureBundle(bundlePath, flags);
  const selectedClient = getFlag(flags, ['client']);
  const clients = selectedClient && selectedClient !== true ? [String(selectedClient)] : supportedClients;
  const snippets = {};
  const profiles = [];
  for (const client of clients) {
    snippets[client] = renderMcpConfig(client, { ...connectorOptions(flags), bundlePath });
    profiles.push(getClientProfile(client, { ...connectorOptions(flags), bundlePath }));
  }
  const out = getFlag(flags, ['out']);
  if (out && out !== true) await writeJson(resolve(String(out)), { schema: 'enigma.install_snippets.v1', snippets });
  print({
    ok: true,
    bundle: bundlePath,
    bundle_created: bundleState.created,
    schema: bundleState.bundle.schema,
    mcp_command: connectorOptions(flags).mcpCommand ?? 'enigma-mcp',
    clients: profiles,
    mcp_config_snippets: snippets,
    out: out && out !== true ? resolve(String(out)) : undefined,
  }, io);
  return 0;
}

export async function connectCommand(client, flags, io) {
  if (!client) throw new Error('Missing required client.');
  const result = await connectClient(client, connectorOptions(flags));
  print(result, io);
  return result.ok ? 0 : 1;
}

export async function disconnectCommand(client, flags, io) {
  if (!client) throw new Error('Missing required client.');
  const result = await disconnectClient(client, connectorOptions(flags, false));
  print(result, io);
  return result.ok ? 0 : 1;
}

export async function importCommand(source, flags, io, positionalFile = undefined) {
  if (!source) throw new Error('Missing required import source.');
  const importer = IMPORTERS[String(source).toLowerCase()];
  if (!importer) throw new Error(`Unsupported import source: ${source}`);
  const file = resolve(requireFileArg(flags, ['file', 'source-file', 'path'], positionalFile, 'file'));
  const input = await readFile(file, 'utf8');
  const options = {};
  const now = getFlag(flags, ['now']);
  if (now && now !== true) options.now = String(now);
  const bundlePath = resolve(String(getFlag(flags, ['bundle'], DEFAULT_BUNDLE)));
  let vault;
  if (getFlag(flags, ['write-vault'], false) === true) {
    await ensureBundle(bundlePath, flags);
    ({ vault } = await loadState(bundlePath));
    options.vault = vault;
  }
  const report = importer(input, options);
  if (vault) await persistState(bundlePath, vault);
  const out = getFlag(flags, ['out']);
  if (out && out !== true) await writeJson(resolve(String(out)), report);
  print({ ...report, source_file: file, bundle: vault ? bundlePath : undefined, out: out && out !== true ? resolve(String(out)) : undefined }, io);
  return report.memory_candidates?.length > 0 || report.ok === true ? 0 : 1;
}

export async function capsuleExportCommand(flags, io, positionalFile = undefined) {
  const file = resolve(requireFileArg(flags, ['file', 'report'], positionalFile, 'file'));
  const input = await readJson(file);
  const now = getFlag(flags, ['now']);
  const capsule = exportEnigmaCapsule({
    reports: Array.isArray(input) ? input : (input.reports ?? input.report ?? input),
    memory_candidates: input.memory_candidates ?? input.memoryCandidates,
    now: now && now !== true ? String(now) : undefined,
  });
  const out = resolve(String(getFlag(flags, ['out'], 'enigma-capsule.json')));
  await writeJson(out, capsule);
  print({
    ok: capsule.schema === 'enigma.import_capsule.v1',
    schema: capsule.schema,
    capsule_id: capsule.capsule_id,
    out,
    public_artifacts: capsule.public_artifacts,
    verifier_metadata: capsule.verifier_metadata,
  }, io);
  return 0;
}

export async function capsuleImportCommand(flags, io, positionalFile = undefined) {
  const file = resolve(requireFileArg(flags, ['file', 'capsule'], positionalFile, 'file'));
  const capsule = await readJson(file);
  const bundlePath = resolve(String(getFlag(flags, ['bundle'], DEFAULT_BUNDLE)));
  let vault;
  const options = {};
  const now = getFlag(flags, ['now']);
  if (now && now !== true) options.now = String(now);
  if (getFlag(flags, ['write-vault'], false) === true) {
    await ensureBundle(bundlePath, flags);
    ({ vault } = await loadState(bundlePath));
    options.vault = vault;
  }
  const result = importEnigmaCapsule(capsule, options);
  if (vault) await persistState(bundlePath, vault);
  print({ ...publicCapsuleImportResult(result), source_file: file, bundle: vault ? bundlePath : undefined }, io);
  return result.ok ? 0 : 1;
}

export async function relayDemoCommand(_flags, io) {
  print(relayServer.runRelayDemo(), io);
  return 0;
}

export async function relayServeCommand(flags, io) {
  return serveHttpCommand({
    flags,
    io,
    service: 'enigma-relay',
    createServer: () => createServiceServer({
      flags,
      io,
      service: 'enigma-relay',
      createState: relayServer.createRelayState,
      handleRequest: relayServer.handleRelayRequest,
      loadStateFromFile: relayServer.loadRelayStateFromFile,
      saveStateToFile: relayServer.saveRelayStateToFile,
      stateMutatingRequest: stateMutatingRelayRequest,
    }),
    defaultPort: DEFAULT_RELAY_PORT,
  });
}

export async function gatewayDemoCommand(_flags, io) {
  print(gatewayServer.runGatewayDemo(), io);
  return 0;
}

export async function gatewayServeCommand(flags, io) {
  return serveHttpCommand({
    flags,
    io,
    service: 'enigma-gateway',
    createServer: () => createServiceServer({
      flags,
      io,
      service: 'enigma-gateway',
      createState: gatewayServer.createGatewayState,
      handleRequest: gatewayServer.handleGatewayRequest,
      loadStateFromFile: gatewayServer.loadGatewayStateFromFile,
      saveStateToFile: gatewayServer.saveGatewayStateToFile,
      stateMutatingRequest: stateMutatingGatewayRequest,
    }),
    defaultPort: DEFAULT_GATEWAY_PORT,
  });
}

export async function nativeHostManifestCommand(flags, io) {
  const manifest = createNativeHostManifest({
    browser: requireFlag(flags, ['browser']),
    hostPath: requireFlag(flags, ['host-path', 'hostPath'], 'host-path'),
    extensionId: requireFlag(flags, ['extension-id', 'extensionId'], 'extension-id'),
  });
  if (flags.has('out')) {
    const outPath = resolve(String(requireFlag(flags, ['out'])));
    await writeJson(outPath, manifest);
    print({ ok: true, path: outPath }, io);
  } else {
    print(manifest, io);
  }
  return 0;
}

function defaultNativeHostInstallPlanOs(platform = process.platform) {
  if (platform === 'win32') return 'windows';
  if (platform === 'darwin') return 'macos';
  return 'linux';
}

function defaultNativeHostInstallPlanHome(os) {
  if (os === 'windows') return process.env.USERPROFILE ?? process.env.HOME;
  return process.env.HOME ?? process.env.USERPROFILE;
}

export async function nativeHostInstallPlanCommand(flags, io) {
  const os = String(getFlag(flags, ['os'], defaultNativeHostInstallPlanOs())).toLowerCase();
  const plan = createNativeHostInstallPlan({
    browser: requireFlag(flags, ['browser']),
    manifestPath: requireFlag(flags, ['manifest']),
    os,
    homeDir: getFlag(flags, ['home', 'home-dir', 'homeDir'], defaultNativeHostInstallPlanHome(os)),
  });
  print(plan, io);
  return 0;
}

function numberFlag(flags, names, label = names[0], fallback = undefined) {
  const value = getFlag(flags, names, fallback);
  if (value === undefined) return undefined;
  if (value === true || value === '') throw new Error(`Missing required --${label}.`);
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`--${label} must be a finite number.`);
  return number;
}

function integerFlag(flags, names, label = names[0], fallback = undefined) {
  const number = numberFlag(flags, names, label, fallback);
  if (number === undefined) return undefined;
  if (!Number.isSafeInteger(number)) throw new Error(`--${label} must be an integer.`);
  return number;
}

export async function meterEventCommand(flags, io) {
  const event = createUsageEvent({
    tenant_id: requireFlag(flags, ['tenant', 'tenant-id', 'tenantId'], 'tenant'),
    meter_id: getFlag(flags, ['meter', 'meter-id', 'meterId'], 'default'),
    provider: requireFlag(flags, ['provider']),
    model: requireFlag(flags, ['model']),
    operation: getFlag(flags, ['operation'], 'memory.inference'),
    timestamp: getFlag(flags, ['timestamp', 'created-at', 'createdAt']),
    prompt_tokens: integerFlag(flags, ['prompt-tokens', 'promptTokens', 'input-tokens', 'inputTokens'], 'prompt-tokens', 0),
    completion_tokens: integerFlag(flags, ['completion-tokens', 'completionTokens', 'output-tokens', 'outputTokens'], 'completion-tokens', 0),
    memory_baseline_tokens: integerFlag(flags, ['memory-baseline-tokens', 'memoryBaselineTokens', 'baseline-prompt-tokens', 'baselinePromptTokens'], 'memory-baseline-tokens', 0),
    memory_optimized_tokens: integerFlag(flags, ['memory-optimized-tokens', 'memoryOptimizedTokens', 'optimized-prompt-tokens', 'optimizedPromptTokens'], 'memory-optimized-tokens', 0),
    pricing: {
      currency: getFlag(flags, ['currency'], 'USD'),
      input_price_per_million_tokens: numberFlag(flags, ['input-price-per-million-tokens', 'inputPricePerMillionTokens', 'price-per-million-tokens', 'pricePerMillionTokens'], 'price-per-million-tokens', 0),
      output_price_per_million_tokens: numberFlag(flags, ['output-price-per-million-tokens', 'outputPricePerMillionTokens', 'price-per-million-tokens', 'pricePerMillionTokens'], 'price-per-million-tokens', 0),
    },
  });
  if (flags.has('out')) {
    const outPath = resolve(String(requireFlag(flags, ['out'])));
    await writeJson(outPath, event);
    print({ ok: true, path: outPath, event_id: event.event_id, event_hash: event.event_hash }, io);
  } else {
    print(event, io);
  }
  return 0;
}

export async function meterAggregateCommand(flags, io, positionalFile) {
  const inPath = resolve(String(requireFileArg(flags, ['events', 'in'], positionalFile, 'events')));
  const source = await readJson(inPath);
  const aggregate = aggregateUsageEvents({
    events: Array.isArray(source) ? source : source.events,
    tenant_id: getFlag(flags, ['tenant', 'tenant-id', 'tenantId']),
    meter_id: getFlag(flags, ['meter', 'meter-id', 'meterId'], 'aggregate'),
    generated_at: getFlag(flags, ['generated-at', 'generatedAt']),
  });
  if (flags.has('out')) {
    const outPath = resolve(String(requireFlag(flags, ['out'])));
    await writeJson(outPath, aggregate);
    print({ ok: true, path: outPath, aggregate_id: aggregate.aggregate_id, aggregate_hash: aggregate.aggregate_hash }, io);
  } else {
    print(aggregate, io);
  }
  return 0;
}

export async function settlementJobCommand(flags, io) {
  const job = createPermissionlessMemoryJob({
    tenant_id: requireFlag(flags, ['tenant', 'tenant-id', 'tenantId'], 'tenant'),
    job_type: requireFlag(flags, ['job-type', 'jobType'], 'job-type'),
    memory_commitment_root: requireFlag(flags, ['memory-root', 'memory-commitment-root', 'memoryCommitmentRoot'], 'memory-root'),
    policy_hash: requireFlag(flags, ['policy-hash', 'policyHash'], 'policy-hash'),
    usage_event_hash: requireFlag(flags, ['usage-event-hash', 'usageEventHash'], 'usage-event-hash'),
    requested_at: getFlag(flags, ['requested-at', 'requestedAt']),
    expires_at: requireFlag(flags, ['expires-at', 'expiresAt'], 'expires-at'),
    max_price_amount: numberFlag(flags, ['max-price-amount', 'maxPriceAmount'], 'max-price-amount'),
    payment_asset: getFlag(flags, ['payment-asset', 'paymentAsset', 'asset'], 'USDC'),
  });
  if (flags.has('out')) {
    const outPath = resolve(String(requireFlag(flags, ['out'])));
    await writeJson(outPath, job);
    print({ ok: true, path: outPath, job_id: job.job_id, job_hash: job.job_hash }, io);
  } else {
    print(job, io);
  }
  return 0;
}

export async function settlementCapacityCommand(flags, io) {
  const profile = createConsumerGpuCapacityProfile({
    operator_id: requireFlag(flags, ['operator', 'operator-id', 'operatorId'], 'operator'),
    accelerator_class: requireFlag(flags, ['accelerator-class', 'acceleratorClass'], 'accelerator-class'),
    hardware_ref: requireFlag(flags, ['hardware-ref', 'hardwareRef'], 'hardware-ref'),
    region: requireFlag(flags, ['region'], 'region'),
    model_family: requireFlag(flags, ['model-family', 'modelFamily'], 'model-family'),
    model_refs: parseList(requireFlag(flags, ['model-ref', 'model-refs', 'modelRefs'], 'model-ref')),
    observed_at: getFlag(flags, ['observed-at', 'observedAt']),
    expires_at: requireFlag(flags, ['expires-at', 'expiresAt'], 'expires-at'),
    vram_gb: numberFlag(flags, ['vram-gb', 'vramGb'], 'vram-gb'),
    max_context_window_tokens: numberFlag(flags, ['max-context-window-tokens', 'maxContextWindowTokens'], 'max-context-window-tokens'),
    available_context_tokens_per_minute: numberFlag(flags, ['available-context-tokens-per-minute', 'availableContextTokensPerMinute'], 'available-context-tokens-per-minute'),
    p95_latency_ms: numberFlag(flags, ['p95-latency-ms', 'p95LatencyMs'], 'p95-latency-ms'),
    price_per_million_context_tokens: numberFlag(flags, ['price-per-million-context-tokens', 'pricePerMillionContextTokens'], 'price-per-million-context-tokens'),
    asset: getFlag(flags, ['asset', 'settlement-asset', 'settlementAsset'], 'USDC'),
    capacity_ref: requireFlag(flags, ['capacity-ref', 'capacityRef'], 'capacity-ref'),
    terms_ref: requireFlag(flags, ['terms-ref', 'termsRef'], 'terms-ref'),
  });
  if (flags.has('out')) {
    const outPath = resolve(String(requireFlag(flags, ['out'])));
    await writeJson(outPath, profile);
    print({ ok: true, path: outPath, capacity_profile_hash: profile.capacity_profile_hash }, io);
  } else {
    print(profile, io);
  }
  return 0;
}

export async function settlementQuoteCommand(flags, io) {
  const jobPath = resolve(String(requireFileArg(flags, ['job'], undefined, 'job')));
  const capacityProfilePath = getFlag(flags, ['capacity-profile', 'capacityProfile']);
  const capacityProfile = capacityProfilePath ? await readJson(resolve(String(capacityProfilePath))) : null;
  const job = await readJson(jobPath);
  const quote = createOperatorServiceQuote({
    job,
    operator_id: requireFlag(flags, ['operator', 'operator-id', 'operatorId'], 'operator'),
    service_kind: requireFlag(flags, ['service-kind', 'serviceKind'], 'service-kind'),
    quoted_at: getFlag(flags, ['quoted-at', 'quotedAt']),
    expires_at: requireFlag(flags, ['expires-at', 'expiresAt'], 'expires-at'),
    price_amount: numberFlag(flags, ['price-amount', 'priceAmount'], 'price-amount'),
    asset: getFlag(flags, ['asset', 'payment-asset', 'paymentAsset']),
    capacity_ref: capacityProfile ? capacityProfile.capacity_ref : requireFlag(flags, ['capacity-ref', 'capacityRef'], 'capacity-ref'),
    terms_ref: requireFlag(flags, ['terms-ref', 'termsRef'], 'terms-ref'),
    capacity_profile: capacityProfile,
  });
  if (flags.has('out')) {
    const outPath = resolve(String(requireFlag(flags, ['out'])));
    await writeJson(outPath, quote);
    print({ ok: true, path: outPath, quote_id: quote.quote_id, quote_hash: quote.quote_hash }, io);
  } else {
    print(quote, io);
  }
  return 0;
}

export async function settlementReceiptCommand(flags, io) {
  const job = await readJson(resolve(String(requireFileArg(flags, ['job'], undefined, 'job'))));
  const quote = await readJson(resolve(String(requireFileArg(flags, ['quote'], undefined, 'quote'))));
  const receipt = createServiceSettlementReceipt({
    job,
    quote,
    completed_at: getFlag(flags, ['completed-at', 'completedAt']),
    settled_amount: numberFlag(flags, ['settled-amount', 'settledAmount'], 'settled-amount'),
    settlement_ref: requireFlag(flags, ['settlement-ref', 'settlementRef'], 'settlement-ref'),
    service_receipt_ref: requireFlag(flags, ['service-receipt-ref', 'serviceReceiptRef'], 'service-receipt-ref'),
  });
  if (flags.has('out')) {
    const outPath = resolve(String(requireFlag(flags, ['out'])));
    await writeJson(outPath, receipt);
    print({ ok: true, path: outPath, settlement_receipt_id: receipt.settlement_receipt_id, settlement_receipt_hash: receipt.settlement_receipt_hash }, io);
  } else {
    print(receipt, io);
  }
  return 0;
}

export async function settlementVerifyCommand(flags, io) {
  const job = await readJson(resolve(String(requireFileArg(flags, ['job'], undefined, 'job'))));
  const quote = await readJson(resolve(String(requireFileArg(flags, ['quote'], undefined, 'quote'))));
  const receipt = await readJson(resolve(String(requireFileArg(flags, ['receipt'], undefined, 'receipt'))));
  const result = verifyServiceSettlementReceipt({ job, quote, receipt });
  print(result, io);
  return result.ok ? 0 : 1;
}

export async function settlementBatchCommand(flags, io, positionalFile) {
  const receiptsPath = resolve(String(requireFileArg(flags, ['receipts', 'in'], positionalFile, 'receipts')));
  const source = await readJson(receiptsPath);
  const batch = createSettlementBatch({
    receipts: Array.isArray(source) ? source : source.receipts,
    asset: getFlag(flags, ['asset']),
    batch_ref: requireFlag(flags, ['batch-ref', 'batchRef'], 'batch-ref'),
    generated_at: getFlag(flags, ['generated-at', 'generatedAt']),
  });
  if (flags.has('out')) {
    const outPath = resolve(String(requireFlag(flags, ['out'])));
    await writeJson(outPath, batch);
    print({ ok: true, path: outPath, batch_id: batch.batch_id, batch_hash: batch.batch_hash }, io);
  } else {
    print(batch, io);
  }
  return 0;
}

function usage() {
  return {
    usage: 'enigma <command> [options]',
    commands: [
      'init',
      'doctor',
      'install',
      'connect <client>',
      'disconnect <client>',
      'remember',
      'recall',
      'update',
      'delete',
      'context',
      'export',
      'import <source>',
      'capsule export',
      'capsule import',
      'verify',
      'boundary run',
      'mcp serve',
      'relay demo',
      'relay serve',
      'gateway demo',
      'gateway serve',
      'native-host manifest',
      'native-host install-plan',
      'mesh demo',
      'enterprise demo',
      'meter event',
      'meter aggregate',
      'settlement job',
      'settlement capacity',
      'settlement quote',
      'settlement receipt',
      'settlement verify',
      'settlement batch',
    ],
    connector_options: {
      '--bundle <path>': 'Absolute local Enigma vault bundle path rendered as ENIGMA_BUNDLE.',
      '--config <path>': 'Client MCP JSON config path to read/write.',
      '--server-name <name>': 'MCP server key; defaults to enigma.',
      '--mcp-command <command>': 'Command rendered in MCP config; defaults to enigma-mcp. Alias: --command.',
      '--dry-run': 'Print planned config without writing.',
    },
    remember_options: {
      '--text <text>': 'Inline local memory text. Avoid for private content because argv can be logged by process tooling.',
      '--text-file <path>': 'Read local memory text from a file so private smoke input is not exposed in shell argv. Aliases: --memory-file, --textFile, --memoryFile.',
    },
    native_host: {
      bin: 'enigma-native-host',
      host_name: 'com.enigma.native_host',
      bundle_env: 'ENIGMA_BUNDLE',
      manifests: [
        'apps/native-host/manifests/com.enigma.native_host.chrome.json',
        'apps/native-host/manifests/com.enigma.native_host.edge.json',
        'apps/native-host/manifests/com.enigma.native_host.firefox.json',
      ],
      generator: 'enigma native-host manifest --browser <chrome|edge|firefox> --host-path <absolute path> --extension-id <id> [--out <file>]',
      install_plan: 'enigma native-host install-plan --browser <chrome|edge|firefox> --manifest <absolute path> [--os <windows|macos|linux>] [--home <absolute path>]',
      generator_options: {
        '--browser <chrome|edge|firefox>': 'Browser manifest format to generate or plan.',
        '--host-path <absolute path>': 'Absolute path to the installed enigma-native-host executable.',
        '--extension-id <id>': 'Browser extension id allowed to connect to the native host.',
        '--out <file>': 'Write manifest JSON to a file instead of stdout.',
      },
      install_plan_options: {
        '--browser <chrome|edge|firefox>': 'Browser whose native messaging registration targets should be planned.',
        '--manifest <absolute path>': 'Absolute path to the generated native messaging manifest to register manually.',
        '--os <windows|macos|linux>': 'Target operating system. Defaults to the current operating system.',
        '--home <absolute path>': 'Target user home directory used to compute per-user manifest locations.',
      },
      boundary: 'Browser native messaging returns local context plus receipt summaries only; provider-native memory remains cache only.',
    },
    metering: {
      event: 'enigma meter event --tenant <id> --provider <id> --model <id> --prompt-tokens <n> --completion-tokens <n> --memory-baseline-tokens <n> --memory-optimized-tokens <n> --price-per-million-tokens <n> [--out <file>]',
      aggregate: 'enigma meter aggregate --events <events.json> [--tenant <id>] [--out <file>]',
      boundary: 'Metering artifacts contain counts, hashes, identifiers, pricing inputs, and claim boundaries only; no prompts, completions, provider responses, credentials, token ROI, or provider-invoice savings claim.',
    },
    settlement: {
      job: 'enigma settlement job --tenant <id> --job-type <type> --memory-root <sha256:...> --policy-hash <sha256:...> --usage-event-hash <sha256:...> --max-price-amount <n> --payment-asset <asset> --expires-at <iso> [--out <file>]',
      capacity: 'enigma settlement capacity --operator <id> --accelerator-class <consumer_gpu|workstation_gpu|edge_gpu> --hardware-ref <ref> --region <region> --model-family <family> --model-ref <id[,id]> --vram-gb <n> --max-context-window-tokens <n> --available-context-tokens-per-minute <n> --p95-latency-ms <n> --price-per-million-context-tokens <n> --capacity-ref <ref> --terms-ref <ref> --expires-at <iso> [--asset <asset>] [--out <file>]',
      quote: 'enigma settlement quote --job <job.json> --operator <id> --service-kind <kind> --price-amount <n> --asset <asset> --capacity-ref <ref> --terms-ref <ref> --expires-at <iso> [--capacity-profile <profile.json>] [--out <file>]',
      receipt: 'enigma settlement receipt --job <job.json> --quote <quote.json> --settled-amount <n> --settlement-ref <ref> --service-receipt-ref <ref> [--out <file>]',
      verify: 'enigma settlement verify --job <job.json> --quote <quote.json> --receipt <receipt.json>',
      batch: 'enigma settlement batch --receipts <receipts.json> --batch-ref <ref> [--asset <asset>] [--out <file>]',
      boundary: 'Settlement artifacts contain commitment roots, capacity profiles, hashes, refs, prices, and claim boundaries only; no raw memory, prompts, provider responses, credentials, token ROI/profit, decentralization, or provider-invoice savings claim.',
    },
    relay_gateway_options: {
      '--host <host>': 'Bind host. Defaults to 127.0.0.1.',
      '--port <port>': `Bind port. Defaults to ${DEFAULT_RELAY_PORT} for relay and ${DEFAULT_GATEWAY_PORT} for gateway.`,
      '--state-file <path>': 'Load and persist local relay/gateway demo state as JSON.',
      '--once': 'Start, report the listening address, persist state when configured, then close.',
    },
    kimi_code: {
      gui_path_note: 'GUI-launched Kimi Code may not inherit your shell PATH; pass --mcp-command with an absolute enigma-mcp path when needed.',
      example: 'enigma connect kimi-code --bundle "$HOME/.enigma/bundle.json" --mcp-command "/absolute/path/to/enigma-mcp"',
      tools: ['enigma_init', 'enigma_remember', 'enigma_search', 'enigma_context_pack', 'enigma_delete', 'enigma_verify_receipts'],
    },
    connector_write_behavior: 'Config writes preserve unrelated settings and sibling MCP servers. Existing configs are backed up only when the semantic JSON config changes; reconnecting an identical config is idempotent.',
    claim_boundaries: 'Connectors configure local MCP access to an Enigma bundle. They do not make provider-native memory canonical and do not prove provider deletion or model forgetting.',
    import_sources: Object.keys(IMPORTERS),
    clients: supportedClients,
    bundle: DEFAULT_BUNDLE,
  };
}

export async function main(argv = process.argv.slice(2), io = { stdout: process.stdout, stderr: process.stderr }) {
  const command = argv[0];
  const subcommand = argv[1];
  if (!command || command === '--help' || command === '-h') {
    print(usage(), io);
    return 0;
  }
  const twoPartCommands = ['boundary', 'mcp', 'mesh', 'enterprise', 'capsule', 'relay', 'gateway', 'connect', 'disconnect', 'import', 'native-host', 'meter', 'settlement'];
  const flags = parseArgs(twoPartCommands.includes(command) ? argv.slice(2) : argv.slice(1));
  const positionalFile = optionalPositional(argv[2]);
  if ((flags.has('help') || argv.includes('-h')) && (((command === 'relay' || command === 'gateway') && (subcommand === 'serve' || subcommand === 'demo')) || (command === 'native-host' && (subcommand === 'manifest' || subcommand === 'install-plan')))) {
    print(usage(), io);
    return 0;
  }
  try {
    if (command === 'init') return await initCommand(flags, io);
    if (command === 'doctor') return await doctorCommand(flags, io);
    if (command === 'install') return await installCommand(flags, io);
    if (command === 'connect') return await connectCommand(subcommand, flags, io);
    if (command === 'disconnect') return await disconnectCommand(subcommand, flags, io);
    if (command === 'remember') return await rememberCommand(flags, io);
    if (command === 'recall') return await recallCommand(flags, io);
    if (command === 'update') return await updateCommand(flags, io);
    if (command === 'delete') return await deleteCommand(flags, io);
    if (command === 'context') return await contextCommand(flags, io);
    if (command === 'export') return await exportCommand(flags, io);
    if (command === 'import') return await importCommand(subcommand, flags, io, positionalFile);
    if (command === 'capsule' && subcommand === 'export') return await capsuleExportCommand(flags, io, positionalFile);
    if (command === 'capsule' && subcommand === 'import') return await capsuleImportCommand(flags, io, positionalFile);
    if (command === 'verify') return await verifyCommand(flags, io);
    if (command === 'boundary' && subcommand === 'run') return await boundaryRunCommand(flags, io);
    if (command === 'mcp' && subcommand === 'serve') return await mcpServeCommand(flags, io);
    if (command === 'relay' && subcommand === 'demo') return await relayDemoCommand(flags, io);
    if (command === 'relay' && subcommand === 'serve') return await relayServeCommand(flags, io);
    if (command === 'gateway' && subcommand === 'demo') return await gatewayDemoCommand(flags, io);
    if (command === 'gateway' && subcommand === 'serve') return await gatewayServeCommand(flags, io);
    if (command === 'native-host' && subcommand === 'manifest') return await nativeHostManifestCommand(flags, io);
    if (command === 'meter' && subcommand === 'event') return await meterEventCommand(flags, io);
    if (command === 'meter' && subcommand === 'aggregate') return await meterAggregateCommand(flags, io, positionalFile);
    if (command === 'settlement' && subcommand === 'job') return await settlementJobCommand(flags, io);
    if (command === 'settlement' && subcommand === 'capacity') return await settlementCapacityCommand(flags, io);
    if (command === 'settlement' && subcommand === 'quote') return await settlementQuoteCommand(flags, io);
    if (command === 'settlement' && subcommand === 'receipt') return await settlementReceiptCommand(flags, io);
    if (command === 'settlement' && subcommand === 'verify') return await settlementVerifyCommand(flags, io);
    if (command === 'settlement' && subcommand === 'batch') return await settlementBatchCommand(flags, io, positionalFile);
    if (command === 'native-host' && subcommand === 'install-plan') return await nativeHostInstallPlanCommand(flags, io);
    if (command === 'mesh' && subcommand === 'demo') return await meshDemoCommand(flags, io);
    if (command === 'enterprise' && subcommand === 'demo') return await enterpriseDemoCommand(flags, io);
    throw new Error(`Unknown command: ${[command, subcommand].filter(Boolean).join(' ')}`);
  } catch (error) {
    print({ ok: false, error: { code: 'CLI_ERROR', message: error.message } }, io);
    return 2;
  }
}
function isMainModule(metaUrl) {
  if (!process.argv[1]) return false;
  try {
    return metaUrl === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return metaUrl === pathToFileURL(process.argv[1]).href;
  }
}


if (isMainModule(import.meta.url)) {
  process.exitCode = await main();
}
