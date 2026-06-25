import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { main } from '../apps/cli/bin/enigma.mjs';
import { platformDefaultConfigPath } from '../packages/connectors/src/index.js';

const DEFAULT_SETUP_CLIENTS = Object.freeze(['generic-mcp', 'claude-desktop', 'cursor', 'kimi-code']);
const CONNECTOR_ENV_KEYS = Object.freeze(['HOME', 'USERPROFILE', 'APPDATA']);

function connectorFixtureEnv(dir) {
  const home = join(dir, 'home');
  return {
    HOME: home,
    USERPROFILE: home,
    APPDATA: join(dir, 'appdata'),
  };
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function withConnectorFixtureEnv(dir, callback) {
  const nextEnv = connectorFixtureEnv(dir);
  const previousEnv = Object.fromEntries(CONNECTOR_ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(nextEnv)) process.env[key] = value;
  try {
    return await callback(nextEnv);
  } finally {
    for (const key of CONNECTOR_ENV_KEYS) {
      if (previousEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousEnv[key];
      }
    }
  }
}

function makeIo() {
  let stdout = '';
  let stderr = '';
  return {
    io: {
      stdout: { write: (chunk) => { stdout += chunk; } },
      stderr: { write: (chunk) => { stderr += chunk; } },
    },
    stdout: () => stdout,
    stderr: () => stderr,
    json: () => JSON.parse(stdout),
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

test('setup default creates local Memory Passport artifacts without connector writes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-setup-default-'));
  const previousCwd = process.cwd();
  process.chdir(dir);
  try {
    const io = makeIo();
    assert.equal(await main(['setup', '--overwrite'], io.io), 0, io.stderr());
    const summary = io.json();

    assert.equal(summary.ok, true);
    assert.equal(summary.schema, 'enigma.setup.v1');
    assert.equal(summary.bundle, '.enigma/bundle.json');
    assert.equal(summary.context_pack, '.enigma/context-pack.json');
    assert.equal(summary.export, '.enigma/export.json');
    assert.equal(summary.verify_report, '.enigma/verify-report.json');
    assert.equal(summary.artifacts_written, true);
    assert.equal(summary.client_configs_written, false);
    assert.deepEqual(summary.selected_clients, ['generic-mcp', 'claude-desktop', 'cursor', 'kimi-code']);
    assert.equal(summary.provider_native_memory_canonical, false);
    assert.equal(summary.claim_boundaries.provider_native_memory_canonical, false);
    assert.equal(summary.memory_plaintext_echoed, false);
    assert.equal(summary.verify_ok, true);
    assert.equal(summary.memory_count, 1);
    assert.equal(summary.context_item_count, 1);
    assert.ok(summary.next_commands.some((command) => command.startsWith('enigma search ')));
    assert.ok(summary.next_commands.some((command) => command.startsWith('enigma context ')));
    assert.ok(summary.next_commands.some((command) => command.startsWith('enigma verify ')));
    assert.ok(summary.next_commands.some((command) => command.startsWith('enigma connect generic-mcp ') && command.endsWith(' --dry-run')));
    assert.equal(summary.connectors.length, 4);
    assert.equal(summary.connectors.every((connector) => connector.connect_plan.dry_run === true), true);
    assert.equal(summary.checks.npm.ok, true);
    assert.equal(summary.checks.vault_path.ok, true);
    assert.equal(summary.checks.vault_path.path, '.enigma/bundle.json');
    assert.equal(JSON.stringify(summary).includes(dir), false);

    assert.equal((await readJson(join(dir, '.enigma', 'bundle.json'))).schema, 'enigma.vault_bundle.v1');
    assert.equal((await readJson(join(dir, '.enigma', 'context-pack.json'))).schema, 'enigma.context_pack.v1');
    assert.equal((await readJson(join(dir, '.enigma', 'export.json'))).schema, 'enigma.vault_bundle.v1');
    assert.equal((await readJson(join(dir, '.enigma', 'verify-report.json'))).ok, true);
  } finally {
    process.chdir(previousCwd);
  }
});

test('setup fails closed when an artifact already exists', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-setup-existing-'));
  const bundlePath = join(dir, 'bundle.json');
  await writeFile(bundlePath, '{}\n', 'utf8');

  const io = makeIo();
  assert.equal(await main(['setup', '--bundle', bundlePath, '--out-dir', dir], io.io), 2);
  const summary = io.json();
  assert.equal(summary.ok, false);
  assert.equal(summary.error.code, 'CLI_ERROR');
  assert.match(summary.error.message, /already exists/);
  assert.equal(JSON.stringify(summary).includes(dir), false);
  assert.equal(await readFile(bundlePath, 'utf8'), '{}\n');
});

test('setup dry-run plans without writing local artifacts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-setup-dry-run-'));
  const bundlePath = join(dir, 'bundle.json');
  const io = makeIo();

  assert.equal(await main(['setup', '--bundle', bundlePath, '--out-dir', dir, '--dry-run'], io.io), 0, io.stderr());
  const summary = io.json();
  assert.equal(summary.ok, true);
  assert.equal(summary.dry_run, true);
  assert.equal(summary.artifacts_written, false);
  assert.equal(summary.client_configs_written, false);
  assert.equal(JSON.stringify(summary).includes(dir), false);
  assert.equal(summary.connectors.every((connector) => connector.connect_plan.dry_run === true), true);
  await assert.rejects(() => readFile(bundlePath, 'utf8'), /ENOENT/);
  await assert.rejects(() => readFile(join(dir, 'context-pack.json'), 'utf8'), /ENOENT/);
  await assert.rejects(() => readFile(join(dir, 'export.json'), 'utf8'), /ENOENT/);
  await assert.rejects(() => readFile(join(dir, 'verify-report.json'), 'utf8'), /ENOENT/);
});

test('setup selected clients accepts comma-separated and repeated client options', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-setup-clients-'));
  const bundlePath = join(dir, 'bundle.json');
  const io = makeIo();

  assert.equal(await main(['setup', '--bundle', bundlePath, '--out-dir', dir, '--client', 'cursor,kimi-code', '--client', 'claude-desktop', '--overwrite'], io.io), 0, io.stderr());
  const summary = io.json();
  assert.deepEqual(summary.selected_clients, ['cursor', 'kimi-code', 'claude-desktop']);
  assert.deepEqual(summary.connectors.map((connector) => connector.client_id), ['cursor', 'kimi-code', 'claude-desktop']);
  assert.equal(summary.connectors.some((connector) => connector.client_id === 'generic-mcp'), false);
  for (const connector of summary.connectors) {
    assert.equal(connector.mcp_config_snippet.mcpServers.enigma.command, 'enigma-mcp');
    assert.equal(connector.mcp_config_snippet.mcpServers.enigma.env.ENIGMA_BUNDLE, '<bundle-path>');
    assert.match(connector.connect_command, new RegExp(`^enigma connect ${connector.client_id} --bundle `));
    assert.equal(JSON.stringify(summary).includes(dir), false);
  }
});

test('setup --client auto falls back to default setup clients when no client config exists', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-setup-auto-empty-'));

  await withConnectorFixtureEnv(dir, async () => {
    const defaultConfigPaths = DEFAULT_SETUP_CLIENTS.map((clientId) => platformDefaultConfigPath(clientId));
    const io = makeIo();
    assert.equal(await main(['setup', '--bundle', join(dir, 'bundle.json'), '--out-dir', dir, '--client', 'auto', '--overwrite'], io.io), 0, io.stderr());
    const summary = io.json();

    assert.equal(summary.ok, true);
    assert.equal(summary.client_configs_written, false);
    assert.equal(summary.client_selection.auto, true);
    assert.equal(summary.client_selection.fallback_used, true);
    assert.deepEqual(summary.selected_clients, DEFAULT_SETUP_CLIENTS);
    assert.deepEqual(summary.client_selection.selected.map((client) => client.client_id), DEFAULT_SETUP_CLIENTS);
    assert.equal(summary.client_selection.selected.every((client) => client.reason === 'default_fallback_no_client_configs_detected'), true);
    assert.deepEqual(summary.connectors.map((connector) => connector.client_id), DEFAULT_SETUP_CLIENTS);
    assert.equal(summary.connectors.every((connector) => connector.connect_plan.dry_run === true), true);
    assert.ok(Array.isArray(summary.skipped_clients));
    for (const skipped of summary.skipped_clients) {
      assert.equal(typeof skipped.client_id, 'string');
      assert.equal(typeof skipped.reason, 'string');
    }
    for (const configPath of defaultConfigPaths) {
      assert.equal(await pathExists(configPath), false, `${configPath} must not be created`);
    }
    assert.equal(JSON.stringify(summary).includes(dir), false);
  });
});

test('setup --connect-installed skips missing default client configs without creating them', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-setup-connect-installed-empty-'));

  await withConnectorFixtureEnv(dir, async () => {
    const defaultConfigPaths = DEFAULT_SETUP_CLIENTS.map((clientId) => platformDefaultConfigPath(clientId));
    const io = makeIo();
    assert.equal(await main(['setup', '--bundle', join(dir, 'bundle.json'), '--out-dir', dir, '--connect-installed', '--overwrite'], io.io), 0, io.stderr());
    const summary = io.json();

    assert.equal(summary.ok, true);
    assert.equal(summary.connect_installed, true);
    assert.equal(summary.connector_write_mode, 'installed_only');
    assert.equal(summary.client_config_write_requested, true);
    assert.equal(summary.client_configs_written, false);
    assert.deepEqual(summary.selected_clients, DEFAULT_SETUP_CLIENTS);
    assert.deepEqual(summary.connectors.map((connector) => connector.client_id), DEFAULT_SETUP_CLIENTS);
    for (const connector of summary.connectors) {
      assert.equal(connector.write_selected, false);
      assert.equal(connector.write_skipped_reason, 'client_config_missing');
      assert.equal(connector.connect_plan.dry_run, true);
      assert.equal(connector.connect_plan.writes_performed, false);
    }
    for (const configPath of defaultConfigPaths) {
      assert.equal(await pathExists(configPath), false, `${configPath} must not be created`);
    }
    assert.equal(JSON.stringify(summary).includes(dir), false);
  });
});

test('setup --connect-installed writes only the installed selected client config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-setup-connect-installed-cursor-'));

  await withConnectorFixtureEnv(dir, async () => {
    const cursorConfigPath = platformDefaultConfigPath('cursor');
    await mkdir(dirname(cursorConfigPath), { recursive: true });
    await writeFile(cursorConfigPath, `${JSON.stringify({ mcpServers: { sibling: { command: 'sibling-mcp' } } }, null, 2)}\n`, 'utf8');
    const missingDefaultConfigPaths = DEFAULT_SETUP_CLIENTS
      .filter((clientId) => clientId !== 'cursor')
      .map((clientId) => platformDefaultConfigPath(clientId));

    const bundlePath = join(dir, 'bundle.json');
    const io = makeIo();
    assert.equal(await main(['setup', '--bundle', bundlePath, '--out-dir', dir, '--connect-installed', '--overwrite'], io.io), 0, io.stderr());
    const summary = io.json();

    assert.equal(summary.ok, true);
    assert.equal(summary.client_configs_written, true);
    assert.deepEqual(summary.selected_clients, ['cursor']);
    assert.equal(summary.connect_installed, true);
    assert.equal(summary.connector_write_mode, 'installed_only');
    assert.equal(summary.client_config_write_requested, true);
    assert.equal(summary.client_selection.fallback_used, false);
    assert.deepEqual(summary.client_selection.selected.map((client) => client.client_id), ['cursor']);
    assert.equal(summary.connectors[0].write_selected, true);
    assert.equal(summary.connectors[0].write_skipped_reason, null);
    assert.deepEqual(summary.connectors.map((connector) => connector.client_id), ['cursor']);
    assert.equal(summary.connectors[0].connect_plan.dry_run, false);
    assert.equal(summary.connectors[0].connect_plan.writes_performed, true);
    assert.deepEqual(summary.connectors[0].connect_plan.planned_writes.map((write) => write.type), ['write']);

    const writtenConfig = JSON.parse(await readFile(cursorConfigPath, 'utf8'));
    assert.equal(writtenConfig.mcpServers.sibling.command, 'sibling-mcp');
    assert.equal(writtenConfig.mcpServers.enigma.command, 'enigma-mcp');
    assert.equal(writtenConfig.mcpServers.enigma.env.ENIGMA_BUNDLE, bundlePath);
    for (const configPath of missingDefaultConfigPaths) {
      assert.equal(await pathExists(configPath), false, `${configPath} must not be created`);
    }
    const skippedByClient = new Map(summary.skipped_clients.map((client) => [client.client_id, client]));
    for (const clientId of DEFAULT_SETUP_CLIENTS.filter((id) => id !== 'cursor')) {
      const skipped = skippedByClient.get(clientId);
      assert.ok(skipped, `${clientId} should explain why connector write was skipped`);
      assert.match(skipped.reason, /missing|not found|client_config_missing/i);
    }
    assert.equal(JSON.stringify(summary).includes(dir), false);
  });
});

test('setup memory file input does not echo plaintext to stdout', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-setup-memory-file-'));
  const memoryPath = join(dir, 'memory.txt');
  const privateMemory = 'private setup phrase must never be echoed';
  await writeFile(memoryPath, privateMemory, 'utf8');

  const io = makeIo();
  assert.equal(await main(['setup', '--bundle', join(dir, 'bundle.json'), '--out-dir', dir, '--memory-file', memoryPath, '--overwrite'], io.io), 0, io.stderr());
  assert.equal(io.stdout().includes(privateMemory), false);
  const summary = io.json();
  assert.equal(JSON.stringify(summary).includes(dir), false);
  assert.equal(summary.memory_source, 'memory_file');
  assert.equal(JSON.stringify(summary).includes(privateMemory), false);
});

test('doctor reports first-run diagnostics without echoing local paths', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-doctor-diagnostics-'));
  const bundlePath = join(dir, 'bundle.json');
  const configPath = join(dir, 'missing-client-config.json');
  const previousUserAgent = process.env.npm_config_user_agent;
  process.env.npm_config_user_agent = 'npm/10.9.0 node/v24.0.0 win32 x64 workspaces/false';
  try {
    const io = makeIo();
    assert.equal(await main(['doctor', '--bundle', bundlePath, '--client', 'generic-mcp', '--config', configPath], io.io), 0, io.stderr());
    const stdout = io.stdout();
    const summary = io.json();

    assert.equal(stdout.includes(dir), false);
    assert.equal(summary.npm.detected, true);
    assert.equal(summary.npm.version, '10.9.0');
    assert.equal(summary.vault_path.ok, true);
    assert.equal(summary.vault_path.path, '<bundle-path>');
    assert.equal(summary.vault_path.parent, '<bundle-dir>');
    assert.equal(summary.vault_path.writable, true);
    assert.equal(summary.bundle_default_path.resolved, '<bundle-path>');
    assert.deepEqual(summary.connectors.clients.map((client) => client.config_path), ['[redacted:config_path]']);
    assert.ok(summary.next_commands.some((command) => command.startsWith('enigma setup ')));
    assert.ok(summary.next_commands.some((command) => command.startsWith('enigma connect generic-mcp ')));
  } finally {
    if (previousUserAgent === undefined) {
      delete process.env.npm_config_user_agent;
    } else {
      process.env.npm_config_user_agent = previousUserAgent;
    }
  }
});
