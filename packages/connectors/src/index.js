import { access, copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, posix, win32 } from 'node:path';
import { homedir } from 'node:os';

const PROFILE_SCHEMA = 'enigma.connector_profile.v1';
const DEFAULT_SERVER_NAME = 'enigma';
const MCP_COMMAND = 'enigma-mcp';
const MCP_CONTAINER_PATH = Object.freeze(['mcpServers']);
const SUPPORTED_PLATFORMS = Object.freeze(['win32', 'darwin', 'linux']);

const CLIENT_DEFINITIONS = Object.freeze({
  'claude-desktop': Object.freeze({
    display_name: 'Claude Desktop',
    description: 'Anthropic Claude Desktop MCP server configuration.',
    default_config_paths: Object.freeze({
      win32: '%APPDATA%\\Claude\\claude_desktop_config.json',
      darwin: '$HOME/Library/Application Support/Claude/claude_desktop_config.json',
      linux: '$HOME/.config/Claude/claude_desktop_config.json',
    }),
  }),
  cursor: Object.freeze({
    display_name: 'Cursor',
    description: 'Cursor global MCP configuration.',
    default_config_paths: Object.freeze({
      win32: '%USERPROFILE%\\.cursor\\mcp.json',
      darwin: '$HOME/.cursor/mcp.json',
      linux: '$HOME/.cursor/mcp.json',
    }),
  }),
  'kimi-code': Object.freeze({
    display_name: 'Kimi Code',
    description: 'Kimi Code MCP configuration.',
    default_config_paths: Object.freeze({
      win32: '%APPDATA%\\Kimi Code\\mcp.json',
      darwin: '$HOME/Library/Application Support/Kimi Code/mcp.json',
      linux: '$HOME/.config/kimi-code/mcp.json',
    }),
  }),
  'vscode-cline': Object.freeze({
    display_name: 'VS Code Cline',
    description: 'Cline extension MCP settings for VS Code.',
    default_config_paths: Object.freeze({
      win32: '%APPDATA%\\Code\\User\\globalStorage\\saoudrizwan.claude-dev\\settings\\cline_mcp_settings.json',
      darwin: '$HOME/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json',
      linux: '$HOME/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json',
    }),
  }),
  roo: Object.freeze({
    display_name: 'Roo Code',
    description: 'Roo Code extension MCP settings for VS Code.',
    default_config_paths: Object.freeze({
      win32: '%APPDATA%\\Code\\User\\globalStorage\\rooveterinaryinc.roo-cline\\settings\\mcp_settings.json',
      darwin: '$HOME/Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json',
      linux: '$HOME/.config/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json',
    }),
  }),
  opencode: Object.freeze({
    display_name: 'OpenCode',
    description: 'OpenCode local MCP configuration.',
    default_config_paths: Object.freeze({
      win32: '%APPDATA%\\opencode\\opencode.json',
      darwin: '$HOME/Library/Application Support/opencode/opencode.json',
      linux: '$HOME/.config/opencode/opencode.json',
    }),
  }),
  'generic-mcp': Object.freeze({
    display_name: 'Generic MCP Client',
    description: 'Portable MCP config using the standard mcpServers object.',
    default_config_paths: Object.freeze({
      win32: '%APPDATA%\\Enigma\\mcp.json',
      darwin: '$HOME/Library/Application Support/Enigma/mcp.json',
      linux: '$HOME/.config/enigma/mcp.json',
    }),
  }),
});

export const supportedClients = Object.freeze(Object.keys(CLIENT_DEFINITIONS));

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function jsonEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (!jsonEqual(left[index], right[index])) return false;
    }
    return true;
  }
  if (isPlainObject(left) || isPlainObject(right)) {
    if (!isPlainObject(left) || !isPlainObject(right)) return false;
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;
    for (const key of leftKeys) {
      if (!Object.hasOwn(right, key) || !jsonEqual(left[key], right[key])) return false;
    }
    return true;
  }
  return false;
}

function normalizeOptions(clientIdOrOptions, maybeOptions = {}) {
  if (typeof clientIdOrOptions === 'string') return { ...maybeOptions, clientId: clientIdOrOptions };
  return { ...(clientIdOrOptions ?? {}) };
}

function normalizeClientId(value) {
  const clientId = String(value ?? 'generic-mcp');
  if (!Object.hasOwn(CLIENT_DEFINITIONS, clientId)) {
    throw new Error(`Unsupported Enigma connector client: ${clientId}`);
  }
  return clientId;
}

function normalizePlatform(value = process.platform) {
  const platform = String(value);
  if (!SUPPORTED_PLATFORMS.includes(platform)) {
    throw new Error(`Unsupported connector platform: ${platform}`);
  }
  return platform;
}

function envValue(env, name) {
  return typeof env?.[name] === 'string' && env[name].length > 0 ? env[name] : undefined;
}

function mcpCommandFromOptions(options = {}) {
  return String(options.mcpCommand ?? options.mcp_command ?? options.command ?? MCP_COMMAND);
}

function homeForPlatform(platform, options = {}) {
  if (typeof options.homeDir === 'string' && options.homeDir.length > 0) return options.homeDir;
  const env = options.env ?? process.env;
  if (platform === 'win32') {
    const userProfile = envValue(env, 'USERPROFILE');
    if (userProfile) return userProfile;
    const homeDrive = envValue(env, 'HOMEDRIVE');
    const homePath = envValue(env, 'HOMEPATH');
    if (homeDrive && homePath) return `${homeDrive}${homePath}`;
  } else {
    const home = envValue(env, 'HOME');
    if (home) return home;
  }
  const fallback = homedir();
  if (fallback) return fallback;
  throw new Error(`Cannot resolve home directory for ${platform}. Pass homeDir or configPath explicitly.`);
}

function appDataForPlatform(platform, options = {}) {
  const env = options.env ?? process.env;
  const home = homeForPlatform(platform, options);
  if (platform === 'win32') return envValue(env, 'APPDATA') ?? win32.join(home, 'AppData', 'Roaming');
  if (platform === 'darwin') return posix.join(home, 'Library', 'Application Support');
  return posix.join(home, '.config');
}

function joinForPlatform(platform, ...segments) {
  return platform === 'win32' ? win32.join(...segments) : posix.join(...segments);
}

function defaultBundlePath(options = {}) {
  const platform = normalizePlatform(options.platform ?? process.platform);
  return joinForPlatform(platform, homeForPlatform(platform, options), '.enigma', 'bundle.json');
}

function pathDirectory(path) {
  if (/^[A-Za-z]:[\\/]/.test(path) || path.includes('\\')) return win32.dirname(path);
  return dirname(path);
}

function defaultConfigPathFor(clientId, platform, options = {}) {
  const home = homeForPlatform(platform, options);
  const appData = appDataForPlatform(platform, options);
  const codeStorage = platform === 'win32'
    ? win32.join(appData, 'Code', 'User', 'globalStorage')
    : posix.join(appData, 'Code', 'User', 'globalStorage');

  switch (clientId) {
    case 'claude-desktop':
      return joinForPlatform(platform, appData, 'Claude', 'claude_desktop_config.json');
    case 'cursor':
      return joinForPlatform(platform, home, '.cursor', 'mcp.json');
    case 'kimi-code':
      return platform === 'linux'
        ? joinForPlatform(platform, appData, 'kimi-code', 'mcp.json')
        : joinForPlatform(platform, appData, 'Kimi Code', 'mcp.json');
    case 'vscode-cline':
      return joinForPlatform(platform, codeStorage, 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json');
    case 'roo':
      return joinForPlatform(platform, codeStorage, 'rooveterinaryinc.roo-cline', 'settings', 'mcp_settings.json');
    case 'opencode':
      return joinForPlatform(platform, appData, 'opencode', 'opencode.json');
    case 'generic-mcp':
      return platform === 'linux'
        ? joinForPlatform(platform, appData, 'enigma', 'mcp.json')
        : joinForPlatform(platform, appData, 'Enigma', 'mcp.json');
    default:
      throw new Error(`Unsupported Enigma connector client: ${clientId}`);
  }
}

export function platformDefaultConfigPath(clientIdOrOptions = 'generic-mcp', maybeOptions = {}) {
  const options = normalizeOptions(clientIdOrOptions, maybeOptions);
  const clientId = normalizeClientId(options.clientId ?? options.client_id);
  const platform = normalizePlatform(options.platform ?? process.platform);
  return defaultConfigPathFor(clientId, platform, options);
}

export function getClientProfile(clientIdOrOptions = 'generic-mcp', maybeOptions = {}) {
  const options = normalizeOptions(clientIdOrOptions, maybeOptions);
  const clientId = normalizeClientId(options.clientId ?? options.client_id);
  const platform = normalizePlatform(options.platform ?? process.platform);
  const definition = CLIENT_DEFINITIONS[clientId];
  return Object.freeze({
    schema: PROFILE_SCHEMA,
    client_id: clientId,
    display_name: definition.display_name,
    description: definition.description,
    platforms: SUPPORTED_PLATFORMS,
    default_config_path: platformDefaultConfigPath(clientId, options),
    default_config_paths: { ...definition.default_config_paths },
    config_format: 'json',
    server_container_path: [...MCP_CONTAINER_PATH],
    server_name: DEFAULT_SERVER_NAME,
    command: MCP_COMMAND,
    required_env: Object.freeze(['ENIGMA_BUNDLE']),
    platform,
  });
}

function serverEntryFromOptions(options = {}) {
  const env = {};
  if (isPlainObject(options.env)) {
    for (const [key, value] of Object.entries(options.env)) {
      if (value !== undefined && value !== null) env[key] = String(value);
    }
  }
  const bundlePath = String(options.bundlePath ?? options.bundle_path ?? env.ENIGMA_BUNDLE ?? defaultBundlePath(options));
  env.ENIGMA_BUNDLE = bundlePath;
  return {
    command: mcpCommandFromOptions(options),
    args: Array.isArray(options.args) ? [...options.args].map(String) : [],
    env,
  };
}

function ensureContainer(config, path, create) {
  let cursor = config;
  for (const segment of path) {
    if (!isPlainObject(cursor)) throw new Error(`Invalid connector config: ${segment} parent is not an object.`);
    if (cursor[segment] === undefined) {
      if (!create) return undefined;
      cursor[segment] = {};
    }
    if (!isPlainObject(cursor[segment])) throw new Error(`Invalid connector config: ${segment} is not an object.`);
    cursor = cursor[segment];
  }
  return cursor;
}

function applyServer(config, profile, serverName, serverEntry) {
  const next = cloneJson(config);
  const container = ensureContainer(next, profile.server_container_path, true);
  container[serverName] = cloneJson(serverEntry);
  return next;
}

function removeServer(config, profile, serverName) {
  const next = cloneJson(config);
  const container = ensureContainer(next, profile.server_container_path, false);
  if (!container || !Object.hasOwn(container, serverName)) return next;
  delete container[serverName];
  return next;
}

function stringifyConfig(config) {
  return `${JSON.stringify(config, null, 2)}\n`;
}

function timestampSuffix(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  const value = date.getTime();
  if (!Number.isFinite(value)) throw new Error('Invalid connector backup timestamp.');
  return date.toISOString().replace(/[:.]/g, '');
}

function backupPathFor(configPath, now) {
  return `${configPath}.bak.${timestampSuffix(now)}`;
}

async function unusedBackupPath(configPath, now) {
  const base = backupPathFor(configPath, now);
  for (let index = 0; index < 1000; index += 1) {
    const candidate = index === 0 ? base : `${base}.${index}`;
    try {
      await access(candidate);
    } catch (error) {
      if (error?.code === 'ENOENT') return candidate;
      throw error;
    }
  }
  throw new Error(`Cannot allocate backup path for ${configPath}.`);
}

async function readJsonConfig(configPath) {
  let text;
  try {
    text = await readFile(configPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return { exists: false, config: {} };
    throw error;
  }

  let config;
  try {
    config = JSON.parse(text);
  } catch (error) {
    throw new Error(`Cannot parse JSON connector config at ${configPath}: ${error.message}`);
  }
  if (!isPlainObject(config)) throw new Error(`Connector config at ${configPath} must be a JSON object.`);
  return { exists: true, config };
}

function plannedWritesFor({ dryRun, exists, changed, backupPath, configPath, nextConfig }) {
  if (!dryRun || !changed) return [];
  const writes = [];
  if (exists && backupPath) writes.push({ type: 'backup', from: configPath, path: backupPath });
  writes.push({ type: 'write', path: configPath, content: stringifyConfig(nextConfig) });
  return writes;
}

function connectPlan({ clientId, options, exists, existingConfig, backupPath }) {
  const profile = getClientProfile(clientId, options);
  const serverName = String(options.serverName ?? options.server_name ?? profile.server_name);
  const serverEntry = serverEntryFromOptions(options);
  const nextConfig = applyServer(existingConfig, profile, serverName, serverEntry);
  const changed = !jsonEqual(existingConfig, nextConfig);
  const dryRun = options.dryRun === true || options.dry_run === true;
  const configPath = String(options.configPath ?? options.config_path ?? profile.default_config_path);
  const effectiveBackupPath = exists && changed ? backupPath : null;
  return {
    ok: true,
    action: 'connect',
    client_id: profile.client_id,
    configPath,
    serverName,
    changed,
    dryRun,
    backupPath: effectiveBackupPath,
    plannedWrites: plannedWritesFor({ dryRun, exists, changed, backupPath: effectiveBackupPath, configPath, nextConfig }),
    config: nextConfig,
    generatedJson: stringifyConfig(nextConfig),
  };
}

function disconnectPlan({ clientId, options, exists, existingConfig, backupPath }) {
  const profile = getClientProfile(clientId, options);
  const serverName = String(options.serverName ?? options.server_name ?? profile.server_name);
  const nextConfig = removeServer(existingConfig, profile, serverName);
  const changed = !jsonEqual(existingConfig, nextConfig);
  const dryRun = options.dryRun === true || options.dry_run === true;
  const configPath = String(options.configPath ?? options.config_path ?? profile.default_config_path);
  const effectiveBackupPath = exists && changed ? backupPath : null;
  return {
    ok: true,
    action: 'disconnect',
    client_id: profile.client_id,
    configPath,
    serverName,
    changed,
    dryRun,
    backupPath: effectiveBackupPath,
    plannedWrites: plannedWritesFor({ dryRun, exists, changed, backupPath: effectiveBackupPath, configPath, nextConfig }),
    config: nextConfig,
    generatedJson: stringifyConfig(nextConfig),
  };
}

async function writePlan(plan, originalExists) {
  if (!plan.changed || plan.dryRun) return plan;
  await mkdir(pathDirectory(plan.configPath), { recursive: true });
  const tempPath = `${plan.configPath}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}`;
  try {
    await writeFile(tempPath, plan.generatedJson, 'utf8');
    if (originalExists && plan.backupPath) await copyFile(plan.configPath, plan.backupPath);
    await rename(tempPath, plan.configPath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
  return plan;
}

export function renderMcpConfig(clientIdOrOptions = 'generic-mcp', maybeOptions = {}) {
  const options = normalizeOptions(clientIdOrOptions, maybeOptions);
  const profile = getClientProfile(options.clientId ?? options.client_id ?? 'generic-mcp', options);
  const serverName = String(options.serverName ?? options.server_name ?? profile.server_name);
  const config = {};
  const container = ensureContainer(config, profile.server_container_path, true);
  container[serverName] = serverEntryFromOptions(options);
  return config;
}

export async function connectClient(clientIdOrOptions = 'generic-mcp', maybeOptions = {}) {
  const options = normalizeOptions(clientIdOrOptions, maybeOptions);
  const clientId = normalizeClientId(options.clientId ?? options.client_id);
  const configPath = String(options.configPath ?? options.config_path ?? platformDefaultConfigPath(clientId, options));
  const { exists, config } = await readJsonConfig(configPath);
  const plan = connectPlan({ clientId, options: { ...options, configPath }, exists, existingConfig: config, backupPath: null });
  if (exists && plan.changed) {
    plan.backupPath = await unusedBackupPath(configPath, options.now);
    plan.plannedWrites = plannedWritesFor({ dryRun: plan.dryRun, exists, changed: plan.changed, backupPath: plan.backupPath, configPath, nextConfig: plan.config });
  }
  return writePlan(plan, exists);
}

export async function disconnectClient(clientIdOrOptions = 'generic-mcp', maybeOptions = {}) {
  const options = normalizeOptions(clientIdOrOptions, maybeOptions);
  const clientId = normalizeClientId(options.clientId ?? options.client_id);
  const configPath = String(options.configPath ?? options.config_path ?? platformDefaultConfigPath(clientId, options));
  const { exists, config } = await readJsonConfig(configPath);
  const plan = disconnectPlan({ clientId, options: { ...options, configPath }, exists, existingConfig: config, backupPath: null });
  if (exists && plan.changed) {
    plan.backupPath = await unusedBackupPath(configPath, options.now);
    plan.plannedWrites = plannedWritesFor({ dryRun: plan.dryRun, exists, changed: plan.changed, backupPath: plan.backupPath, configPath, nextConfig: plan.config });
  }
  return writePlan(plan, exists);
}

function installedState(config, profile, serverName, options = {}) {
  const container = ensureContainer(config, profile.server_container_path, false);
  if (!container || !isPlainObject(container[serverName])) return { installed: false, commandOk: false, bundleEnvOk: false };
  const entry = container[serverName];
  return {
    installed: true,
    commandOk: entry.command === mcpCommandFromOptions(options),
    bundleEnvOk: typeof entry.env?.ENIGMA_BUNDLE === 'string' && entry.env.ENIGMA_BUNDLE.length > 0,
  };
}

export async function doctorConnectors(clientIdOrOptions = {}, maybeOptions = {}) {
  const options = normalizeOptions(clientIdOrOptions, maybeOptions);
  const selected = options.clientId ?? options.client_id;
  const clientIds = selected ? [normalizeClientId(selected)] : supportedClients;
  const clients = [];

  for (const clientId of clientIds) {
    const profile = getClientProfile(clientId, options);
    const serverName = String(options.serverName ?? options.server_name ?? profile.server_name);
    const configPath = String(options.configPath ?? options.config_path ?? profile.default_config_path);
    try {
      const { exists, config } = await readJsonConfig(configPath);
      const state = exists ? installedState(config, profile, serverName, options) : { installed: false, commandOk: false, bundleEnvOk: false };
      clients.push({
        client_id: clientId,
        ok: !exists || (state.installed && state.commandOk && state.bundleEnvOk),
        exists,
        configPath,
        serverName,
        ...state,
      });
    } catch (error) {
      clients.push({
        client_id: clientId,
        ok: false,
        exists: true,
        configPath,
        serverName,
        error: error.message,
      });
    }
  }

  return { ok: clients.every((client) => client.ok), clients };
}

export function runConnectorDemo(input = {}) {
  const options = { ...input, clientId: input.clientId ?? input.client_id ?? 'generic-mcp' };
  const clientId = normalizeClientId(options.clientId);
  const profile = getClientProfile(clientId, options);
  const bundlePath = String(options.bundlePath ?? options.bundle_path ?? joinForPlatform(profile.platform, homeForPlatform(profile.platform, options), '.enigma-demo', 'bundle.json'));
  const demoOptions = {
    ...options,
    bundlePath,
    configPath: options.configPath ?? options.config_path ?? joinForPlatform(profile.platform, homeForPlatform(profile.platform, options), '.enigma-demo', `${clientId}.json`),
    now: options.now ?? '2026-01-01T00:00:00.000Z',
  };
  const sampleConfig = renderMcpConfig(clientId, demoOptions);
  const firstConnect = connectPlan({
    clientId,
    options: demoOptions,
    exists: false,
    existingConfig: {},
    backupPath: null,
  });
  const idempotentReconnect = connectPlan({
    clientId,
    options: demoOptions,
    exists: true,
    existingConfig: firstConnect.config,
    backupPath: backupPathFor(demoOptions.configPath, demoOptions.now),
  });
  const disconnectResult = disconnectPlan({
    clientId,
    options: demoOptions,
    exists: true,
    existingConfig: firstConnect.config,
    backupPath: backupPathFor(demoOptions.configPath, demoOptions.now),
  });
  const generatedJson = stringifyConfig(sampleConfig);

  return {
    ok: true,
    supportedClients: [...supportedClients],
    supported_clients: [...supportedClients],
    sampleConfig,
    sample_config: sampleConfig,
    firstConnect,
    idempotentReconnect,
    idempotentReconnectResult: idempotentReconnect,
    disconnectResult,
    disconnect: disconnectResult,
    generatedJson,
    generatedJSON: generatedJson,
  };
}
