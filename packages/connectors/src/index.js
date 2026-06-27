import { access, copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, posix, win32 } from 'node:path';
import { homedir } from 'node:os';
import { canonicalize, MerkleSet, sha256Hex } from '../../core/src/index.js';

const PROFILE_SCHEMA = 'enigma.connector_profile.v1';
const DEFAULT_SERVER_NAME = 'enigma';
const MCP_COMMAND = 'enigma-mcp';
const MCP_CONTAINER_PATH = Object.freeze(['mcpServers']);
const SUPPORTED_PLATFORMS = Object.freeze(['win32', 'darwin', 'linux']);
const TRUST_CARD_SCHEMA = 'enigma.trust_card.v1';

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

function serverEnvFromOptions(options = {}) {
  return options.serverEnv ?? options.server_env ?? options.mcpEnv ?? options.mcp_env;
}

function serverEntryFromOptions(options = {}) {
  const env = {};
  const serverEnv = serverEnvFromOptions(options);
  if (isPlainObject(serverEnv)) {
    for (const [key, value] of Object.entries(serverEnv)) {
      if (value !== undefined && value !== null) env[key] = String(value);
    }
  }
  const bundlePath = String(options.bundlePath ?? options.bundle_path ?? env.ENIGMA_BUNDLE ?? options.env?.ENIGMA_BUNDLE ?? defaultBundlePath(options));
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

function optionFileReader(options = {}) {
  const reader = options.readFile ?? options.read_file ?? options.fs?.readFile ?? options.fileSystem?.readFile;
  if (reader === undefined) return { reader: readFile, thisArg: undefined };
  if (typeof reader !== 'function') throw new Error('Connector readFile option must be a function.');
  return { reader, thisArg: options.fs ?? options.fileSystem };
}

async function readJsonConfig(configPath, options = {}) {
  let text;
  try {
    const { reader, thisArg } = optionFileReader(options);
    text = await reader.call(thisArg, configPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return { exists: false, config: {} };
    throw error;
  }

  let config;
  try {
    config = JSON.parse(text);
  } catch (error) {
    const parseError = new Error(`Cannot parse JSON connector config at ${configPath}: ${error.message}`);
    parseError.code = 'EJSONPARSE';
    throw parseError;
  }
  if (!isPlainObject(config)) {
    const typeError = new Error(`Connector config at ${configPath} must be a JSON object.`);
    typeError.code = 'EJSONTYPE';
    throw typeError;
  }
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
  const { exists, config } = await readJsonConfig(configPath, options);
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
  const { exists, config } = await readJsonConfig(configPath, options);
  const plan = disconnectPlan({ clientId, options: { ...options, configPath }, exists, existingConfig: config, backupPath: null });
  if (exists && plan.changed) {
    plan.backupPath = await unusedBackupPath(configPath, options.now);
    plan.plannedWrites = plannedWritesFor({ dryRun: plan.dryRun, exists, changed: plan.changed, backupPath: plan.backupPath, configPath, nextConfig: plan.config });
  }
  return writePlan(plan, exists);
}

function emptyInstalledState() {
  return {
    installed: false,
    serverEntryExists: false,
    server_entry_exists: false,
    commandOk: false,
    command_ok: false,
    argsOk: false,
    args_ok: false,
    bundleEnvPresent: false,
    bundle_env_present: false,
    bundleEnvOk: false,
    bundle_env_ok: false,
    envOk: false,
    env_ok: false,
  };
}

function installedState(config, profile, serverName, options = {}) {
  const container = ensureContainer(config, profile.server_container_path, false);
  if (!container || !isPlainObject(container[serverName])) return emptyInstalledState();
  const entry = container[serverName];
  const expectedEntry = serverEntryFromOptions(options);
  const actualArgs = Array.isArray(entry.args) ? [...entry.args].map(String) : [];
  const actualEnv = {};
  if (isPlainObject(entry.env)) {
    for (const [key, value] of Object.entries(entry.env)) {
      if (value !== undefined && value !== null) actualEnv[key] = String(value);
    }
  }
  const actualBundlePath = typeof actualEnv.ENIGMA_BUNDLE === 'string' ? actualEnv.ENIGMA_BUNDLE : '';
  const commandOk = entry.command === expectedEntry.command;
  const argsOk = jsonEqual(actualArgs, expectedEntry.args);
  const bundleEnvOk = actualBundlePath === expectedEntry.env.ENIGMA_BUNDLE;
  const envOk = jsonEqual(actualEnv, expectedEntry.env);
  return {
    installed: true,
    serverEntryExists: true,
    server_entry_exists: true,
    commandOk,
    command_ok: commandOk,
    argsOk,
    args_ok: argsOk,
    bundleEnvPresent: actualBundlePath.length > 0,
    bundle_env_present: actualBundlePath.length > 0,
    bundleEnvOk,
    bundle_env_ok: bundleEnvOk,
    envOk,
    env_ok: envOk,
  };
}

function recommendedConnectorAction(exists, state, error) {
  if (error) return 'repair';
  if (!exists) return 'missing_client_config';
  if (!state.installed) return 'connect';
  return state.commandOk && state.argsOk && state.envOk ? 'already_configured' : 'repair';
}

function connectorRepairReasons(exists, state, error) {
  if (error?.code === 'EJSONPARSE') return ['config_json_invalid'];
  if (error?.code === 'EJSONTYPE') return ['config_json_not_object'];
  if (error) return ['config_unreadable'];
  if (!exists) return ['client_config_missing'];
  if (!state.installed) return ['enigma_server_missing'];
  const reasons = [];
  if (!state.commandOk) reasons.push('command_mismatch');
  if (!state.argsOk) reasons.push('args_mismatch');
  if (!state.bundleEnvPresent) reasons.push('bundle_env_missing');
  else if (!state.bundleEnvOk) reasons.push('bundle_env_mismatch');
  else if (!state.envOk) reasons.push('env_mismatch');
  return reasons;
}

function shouldRedactPaths(options = {}) {
  return options.redactPaths === true || options.redact_paths === true || options.redact === true;
}

function redactedPath(path, label, options = {}) {
  return shouldRedactPaths(options) ? `[redacted:${label}]` : path;
}

function redactErrorMessage(message, configPath, options = {}) {
  if (!shouldRedactPaths(options)) return message;
  const candidates = [
    configPath,
    options.homeDir,
    options.home_dir,
    options.bundlePath,
    options.bundle_path,
    options.env?.HOME,
    options.env?.USERPROFILE,
    options.env?.APPDATA,
  ].filter((value) => typeof value === 'string' && value.length > 0);
  let redacted = String(message);
  for (const candidate of candidates) {
    redacted = redacted.split(candidate).join('[redacted:path]');
  }
  return redacted.split('[redacted:path]').join(redactedPath(configPath, 'config_path', options));
}

function publicBundlePlaceholder(platform) {
  return platform === 'win32' ? '%USERPROFILE%\\.enigma\\bundle.json' : '$HOME/.enigma/bundle.json';
}

function publicDefaultConfigPath(clientId, platform) {
  return CLIENT_DEFINITIONS[clientId].default_config_paths[platform];
}

function connectCommandFor(clientId, platform) {
  return `enigma connect ${clientId} --bundle "${publicBundlePlaceholder(platform)}"`;
}

function setupConnectCommandFor(clientId, platform) {
  return `enigma setup --client ${clientId} --write-connectors --bundle "${publicBundlePlaceholder(platform)}" --overwrite`;
}

function installConnectCommandFor(clientId, platform) {
  return `npm install -g enigma-memory && ${setupConnectCommandFor(clientId, platform)}`;
}


function wizardStepsForClient(clientId, platform) {
  const steps = [
    {
      order: 1,
      id: 'install_package',
      title: 'Install the published package first.',
      command: 'npm install -g enigma-memory',
      writes: 'global_npm_package',
    },
    {
      order: 2,
      id: 'create_local_bundle',
      title: 'Create and verify the local Enigma bundle.',
      commands: [
        `enigma quickstart --bundle "${publicBundlePlaceholder(platform)}" --overwrite`,
        `enigma verify --bundle "${publicBundlePlaceholder(platform)}"`,
      ],
      writes: 'local_enigma_bundle',
    },
    {
      order: 3,
      id: 'doctor_client',
      title: 'Inspect the client config before changing it.',
      command: `enigma doctor --client ${clientId}`,
      writes: false,
    },
    {
      order: 4,
      id: 'connect_client',
      title: 'Merge only the Enigma MCP server entry into the client config.',
      command: connectCommandFor(clientId, platform),
      writes: 'client_config_when_user_runs_command',
    },
    {
      order: 5,
      id: 'restart_client',
      title: 'Restart or reload the client so it re-reads MCP settings.',
      writes: false,
    },
  ];
  if (clientId === 'kimi-code') {
    steps.splice(4, 0, {
      order: 5,
      id: 'kimi_gui_path_caveat',
      title: 'If Kimi Code was launched from the GUI and cannot find enigma-mcp, reconnect with an absolute command path.',
      command: `${connectCommandFor(clientId, platform)} --mcp-command "/absolute/path/to/enigma-mcp"`,
      writes: 'client_config_when_user_runs_command',
    });
    for (let index = 5; index < steps.length; index += 1) steps[index].order = index + 1;
  }
  return steps;
}

export function planConnectWizard(clientIdOrOptions = {}, maybeOptions = {}) {
  const options = normalizeOptions(clientIdOrOptions, maybeOptions);
  const selected = options.clientId ?? options.client_id;
  const clientIds = selected ? [normalizeClientId(selected)] : supportedClients;
  const platform = normalizePlatform(options.platform ?? process.platform);
  return {
    ok: true,
    schema: 'enigma.connect_wizard_plan.v1',
    platform,
    writes_performed: false,
    writesPerformed: false,
    clients: clientIds.map((clientId) => ({
      client_id: clientId,
      display_name: CLIENT_DEFINITIONS[clientId].display_name,
      default_config_path: publicDefaultConfigPath(clientId, platform),
      steps: wizardStepsForClient(clientId, platform),
      one_command_install_connect: installConnectCommandFor(clientId, platform),
      setup_connect_command: setupConnectCommandFor(clientId, platform),
      connect_command: connectCommandFor(clientId, platform),
      mcp_config_preview: renderMcpConfig(clientId, { platform, bundlePath: publicBundlePlaceholder(platform) }),
    })),
  };
}

export async function detectClientConnector(clientIdOrOptions = 'generic-mcp', maybeOptions = {}) {
  const options = normalizeOptions(clientIdOrOptions, maybeOptions);
  const clientId = normalizeClientId(options.clientId ?? options.client_id ?? 'generic-mcp');
  const profile = getClientProfile(clientId, options);
  const serverName = String(options.serverName ?? options.server_name ?? profile.server_name);
  const configPath = String(options.configPath ?? options.config_path ?? profile.default_config_path);
  const displayedConfigPath = redactedPath(configPath, 'config_path', options);
  const base = {
    client_id: clientId,
    display_name: profile.display_name,
    platform: profile.platform,
    configPath: displayedConfigPath,
    config_path: displayedConfigPath,
    public_default_config_path: publicDefaultConfigPath(clientId, profile.platform),
    serverName,
    server_name: serverName,
  };

  try {
    const { exists, config } = await readJsonConfig(configPath, options);
    const state = exists ? installedState(config, profile, serverName, options) : emptyInstalledState();
    const action = recommendedConnectorAction(exists, state);
    return {
      ...base,
      ok: action === 'already_configured' || action === 'missing_client_config',
      exists,
      configPathExists: exists,
      config_path_exists: exists,
      ...state,
      action,
      recommendedAction: action,
      recommended_action: action,
      repairReasons: connectorRepairReasons(exists, state),
      repair_reasons: connectorRepairReasons(exists, state),
      wizard: planConnectWizard(clientId, { platform: profile.platform }).clients[0],
    };
  } catch (error) {
    const state = emptyInstalledState();
    const action = recommendedConnectorAction(true, state, error);
    return {
      ...base,
      ok: false,
      exists: true,
      configPathExists: true,
      config_path_exists: true,
      ...state,
      action,
      recommendedAction: action,
      recommended_action: action,
      repairReasons: connectorRepairReasons(true, state, error),
      repair_reasons: connectorRepairReasons(true, state, error),
      parseError: error?.code === 'EJSONPARSE' || error?.code === 'EJSONTYPE',
      parse_error: error?.code === 'EJSONPARSE' || error?.code === 'EJSONTYPE',
      error: redactErrorMessage(error.message, configPath, options),
      wizard: planConnectWizard(clientId, { platform: profile.platform }).clients[0],
    };
  }
}

export async function detectConnectors(clientIdOrOptions = {}, maybeOptions = {}) {
  const options = normalizeOptions(clientIdOrOptions, maybeOptions);
  const selected = options.clientId ?? options.client_id;
  const clientIds = selected ? [normalizeClientId(selected)] : supportedClients;
  const clients = [];
  for (const clientId of clientIds) {
    clients.push(await detectClientConnector(clientId, options));
  }
  return { ok: clients.every((client) => client.ok), clients };
}

export async function doctorConnectors(clientIdOrOptions = {}, maybeOptions = {}) {
  return detectConnectors(clientIdOrOptions, maybeOptions);
}

function sha256Root(value) {
  return `sha256:${sha256Hex(typeof value === 'string' ? value : canonicalize(value))}`;
}

function publicTrustRef(kind, value) {
  return `ref:${kind}:${sha256Hex(typeof value === 'string' ? value : canonicalize(value)).slice(0, 32)}`;
}

function uniqueSortedStrings(values) {
  return [...new Set(values.map(String).filter((value) => value.length > 0))].sort();
}

function connectorTrustBoundary() {
  return {
    public_payload_only: true,
    raw_memory_included: false,
    raw_prompt_included: false,
    raw_transcript_included: false,
    raw_embedding_included: false,
    private_key_included: false,
    credential_included: false,
    local_path_included: false,
    provider_deletion_claim: false,
    model_forgetting_claim: false,
    hosted_saas_ready_claim: false,
  };
}

function connectorTrustEvidenceRefs(clientId, profile) {
  return uniqueSortedStrings([
    publicTrustRef('connector_profile', {
      schema: PROFILE_SCHEMA,
      client_id: clientId,
      display_name: profile.display_name,
      command: profile.command,
      server_name: profile.server_name,
      server_container_path: profile.server_container_path,
    }),
    publicTrustRef('mcp_command', {
      command: profile.command,
      server_name: profile.server_name,
    }),
  ]);
}

export function createConnectorTrustCard(clientIdOrOptions = 'generic-mcp', maybeOptions = {}) {
  const options = normalizeOptions(clientIdOrOptions, maybeOptions);
  const clientId = normalizeClientId(options.clientId ?? options.client_id ?? 'generic-mcp');
  const profile = getClientProfile(clientId, options);
  const generatedAt = String(options.generated_at ?? options.generatedAt ?? options.now ?? new Date().toISOString());
  const evidenceRefs = connectorTrustEvidenceRefs(clientId, profile);
  const claims = [
    {
      claim_id: 'claim:connector.local_mcp_profile',
      claim_type: PROFILE_SCHEMA,
      status: 'supported',
      evidence_refs: [evidenceRefs[0]],
    },
    {
      claim_id: 'claim:connector.public_payload_only',
      claim_type: 'enigma.trust_boundary.v1',
      status: 'supported',
      evidence_refs: [evidenceRefs[1]],
    },
  ];
  const claimIds = claims.map((claim) => claim.claim_id);
  return {
    schema: TRUST_CARD_SCHEMA,
    trust_card_id: `trustcard:connector:${clientId}`,
    generated_at: generatedAt,
    subject: {
      subject_type: 'connector',
      subject_id: `connector:${clientId}`,
      subject_ref: `ref:connector:${clientId}`,
      subject_hash: sha256Root({
        schema: 'enigma.connector_trust_subject.v1',
        client_id: clientId,
        command: profile.command,
        server_name: profile.server_name,
      }),
    },
    posture: options.posture ?? 'reviewed',
    claim_ids: claimIds,
    claims,
    evidence_refs: evidenceRefs,
    roots: {
      claim_root: new MerkleSet(claimIds).root(),
      evidence_root: new MerkleSet(evidenceRefs).root(),
      receipt_chain_root: options.receipt_chain_root ?? options.receiptChainRoot ?? sha256Root({
        schema: 'enigma.connector_trust_card.empty_receipt_chain.v1',
        client_id: clientId,
      }),
    },
    boundary: connectorTrustBoundary(),
  };
}

export function createConnectorTrustCards(options = {}) {
  const selected = options.clientId ?? options.client_id
    ? [normalizeClientId(options.clientId ?? options.client_id)]
    : supportedClients;
  return selected.map((clientId) => createConnectorTrustCard({ ...options, clientId }));
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
  const wizardPlan = planConnectWizard(clientId, { platform: profile.platform }).clients[0];

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
    wizardPlan,
    wizard_plan: wizardPlan,
  };
}
