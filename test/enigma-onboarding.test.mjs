import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { main } from '../apps/cli/bin/enigma.mjs';
import { platformDefaultConfigPath } from '../packages/connectors/src/index.js';

const DEFAULT_SETUP_CLIENTS = Object.freeze(['generic-mcp', 'claude-desktop', 'cursor', 'kimi-code', 'vscode-cline']);
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
    assert.deepEqual(summary.selected_clients, DEFAULT_SETUP_CLIENTS);
    assert.equal(summary.provider_native_memory_canonical, false);
    assert.equal(summary.claim_boundaries.provider_native_memory_canonical, false);
    assert.equal(summary.memory_plaintext_echoed, false);
    assert.equal(summary.verify_ok, true);
    assert.equal(summary.memory_count, 1);
    assert.equal(summary.context_item_count, 1);
    assert.ok(summary.next_commands.some((command) => command.startsWith('enigma search ')));
    assert.ok(summary.next_commands.some((command) => command.startsWith('enigma context ')));
    assert.ok(summary.next_commands.some((command) => command.startsWith('enigma export ')));
    assert.ok(summary.next_commands.some((command) => command.startsWith('enigma verify ')));
    assert.ok(summary.next_commands.some((command) => command.startsWith('enigma connect generic-mcp ') && command.endsWith(' --dry-run')));
    assert.equal(summary.connectors.length, DEFAULT_SETUP_CLIENTS.length);
    assert.match(summary.one_command_install_connect.vscode_cline, /^npm install -g enigma-memory && enigma quickstart --bundle .+ && enigma connect vscode-cline .+ --dry-run$/);
    assert.doesNotMatch(summary.one_command_install_connect.vscode_cline, /setup --client|--write-connectors|--overwrite/);
    assert.match(summary.one_command_install_connect.claude_desktop, /enigma claude-mcpb package --plain$/);
    assert.doesNotMatch(summary.one_command_install_connect.claude_desktop, /connect claude-desktop/);
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

test('root help starts with non-overwrite setup, Claude extension package, and dry-run connection preview', async () => {
  const io = makeIo();
  assert.equal(await main(['--help'], io.io), 0, io.stderr());
  const usage = io.json();
  const installCommands = Object.values(usage.install_options).join('\n');

  assert.doesNotMatch(usage.human, /--overwrite/);
  assert.match(usage.human, /enigma quickstart --bundle "\$HOME\/\.enigma\/bundle\.json"/);
  assert.match(usage.human, /enigma claude-mcpb package --plain/);
  assert.match(usage.human, /enigma connect cursor --bundle "\$HOME\/\.enigma\/bundle\.json" --dry-run/);
  assert.doesNotMatch(installCommands, /--overwrite/);
  assert.doesNotMatch(installCommands, /setup --client|--write-connectors/);
  assert.match(installCommands, /enigma quickstart --bundle \.\/\.enigma\/bundle\.json/);
  assert.match(installCommands, /enigma claude-mcpb package --plain/);
  assert.match(installCommands, /enigma connect cursor --bundle \.\/\.enigma\/bundle\.json --dry-run/);
  assert.doesNotMatch(installCommands, /connect claude-desktop/);
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

  const plainIo = makeIo();
  assert.equal(await main(['setup', '--bundle', bundlePath, '--out-dir', dir, '--plain'], plainIo.io), 2);
  assert.match(plainIo.stdout(), /^Enigma setup\n/);
  assert.match(plainIo.stdout(), /Status: Needs attention/);
  assert.match(plainIo.stdout(), /Issue: Quickstart output already exists/);
  assert.match(plainIo.stdout(), /Next: enigma setup --bundle <new-bundle-path> --out-dir <new-empty-out-dir>/);
  assert.doesNotMatch(plainIo.stdout().split('\n').find((line) => line.startsWith('Next:')) ?? '', /--overwrite/);
  assert.match(plainIo.stdout(), /Boundary: local Enigma error summary only/);
  assert.doesNotMatch(plainIo.stdout(), /^\s*\{/);
  assert.equal(plainIo.stdout().includes(dir), false);
  assert.equal(await readFile(bundlePath, 'utf8'), '{}\n');
});

test('setup explains colliding bundle and generated artifact paths', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-setup-collision-'));
  const bundlePath = join(dir, 'context-pack.json');
  const io = makeIo();

  assert.equal(await main(['setup', '--bundle', bundlePath, '--out-dir', dir, '--plain'], io.io), 2);
  const stdout = io.stdout();

  assert.match(stdout, /^Enigma setup\n/);
  assert.match(stdout, /Issue: Quickstart output paths overlap: bundle and context_pack resolve to the same file/);
  assert.match(stdout, /Choose a bundle filename that is not context-pack\.json, export\.json, verify-report\.json/);
  assert.match(stdout, /--bundle <out-dir>\/bundle\.json --out-dir <out-dir>/);
  assert.match(stdout, /Next: enigma setup --bundle <bundle-path> --out-dir <out-dir>/);
  assert.doesNotMatch(stdout, /--overwrite/);
  assert.equal(stdout.includes(dir), false);
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

test('init dry-run prints a public-safe first-run plan without writing artifacts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-init-dry-run-'));
  const bundlePath = join(dir, 'bundle.json');
  const io = makeIo();

  assert.equal(await main(['init', '--bundle', bundlePath, '--out-dir', dir, '--dry-run'], io.io), 0, io.stderr());
  const summary = io.json();
  const serialized = JSON.stringify(summary);

  assert.equal(summary.ok, true);
  assert.equal(summary.command, 'enigma init');
  assert.equal(summary.dry_run, true);
  assert.equal(summary.artifacts_written, false);
  assert.equal(summary.client_configs_written, false);
  assert.equal(summary.provider_credentials_required, false);
  assert.equal(summary.hosted_saas_live, false);
  assert.equal(summary.raw_memory_printed, false);
  assert.equal(summary.solana_required, false);
  assert.equal(summary.browser_extension_required, false);
  assert.equal(summary.bundle, '<bundle-path>');
  assert.equal(summary.out_dir, '<out-dir>');
  assert.equal(serialized.includes(dir), false);
  assert.ok(summary.next_commands[0].startsWith('enigma init --bundle "<bundle-path>" --out-dir "<out-dir>"'));
  assert.doesNotMatch(summary.next_commands[0], /--overwrite/);
  assert.ok(summary.next_commands.some((command) => command.startsWith('enigma remember ')));
  assert.ok(summary.next_commands.some((command) => command === 'enigma import text --file ./memories.md --complete --plain'));
  assert.ok(summary.next_commands.some((command) => command.startsWith('enigma verify ')));
  assert.equal(summary.connectors.every((connector) => connector.connect_plan.dry_run === true), true);
  await assert.rejects(() => readFile(bundlePath, 'utf8'), /ENOENT/);
  await assert.rejects(() => readFile(join(dir, 'context-pack.json'), 'utf8'), /ENOENT/);
  await assert.rejects(() => readFile(join(dir, 'export.json'), 'utf8'), /ENOENT/);
  await assert.rejects(() => readFile(join(dir, 'verify-report.json'), 'utf8'), /ENOENT/);
});

test('init plain dry-run summarizes first run without JSON or local paths', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-init-plain-'));
  const bundlePath = join(dir, 'bundle.json');
  const io = makeIo();

  assert.equal(await main(['init', '--bundle', bundlePath, '--out-dir', dir, '--dry-run', '--plain'], io.io), 0, io.stderr());
  const stdout = io.stdout();

  assert.match(stdout, /^Enigma init\n/);
  assert.match(stdout, /Status: Ready/);
  assert.match(stdout, /Memory Drive: <bundle-path>/);
  assert.match(stdout, /Mode: dry run; no files were written\./);
  assert.match(stdout, /Next: enigma init --bundle "<bundle-path>" --out-dir "<out-dir>"/);
  assert.match(stdout, /Boundary: local Enigma setup only/);
  assert.doesNotMatch(stdout, /^\s*\{/);
  assert.equal(stdout.includes(dir), false);
  assert.equal(stdout.includes(bundlePath), false);
});

test('init execute creates local artifacts without client config writes by default', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-init-execute-'));

  await withConnectorFixtureEnv(dir, async () => {
    const defaultConfigPaths = DEFAULT_SETUP_CLIENTS.map((clientId) => platformDefaultConfigPath(clientId));
    const io = makeIo();
    assert.equal(await main(['init', '--bundle', join(dir, 'bundle.json'), '--out-dir', dir, '--overwrite'], io.io), 0, io.stderr());
    const summary = io.json();

    assert.equal(summary.ok, true);
    assert.equal(summary.artifacts_written, true);
    assert.equal(summary.client_configs_written, false);
    assert.equal(summary.client_config_write_requested, false);
    assert.deepEqual(summary.selected_clients, DEFAULT_SETUP_CLIENTS);
    assert.equal(summary.connectors.every((connector) => connector.connect_plan.dry_run === true), true);
    assert.equal(JSON.stringify(summary).includes(dir), false);
    for (const configPath of defaultConfigPaths) {
      assert.equal(await pathExists(configPath), false, `${configPath} must not be created`);
    }
    assert.equal((await readJson(join(dir, 'bundle.json'))).schema, 'enigma.vault_bundle.v1');
    assert.equal((await readJson(join(dir, 'context-pack.json'))).schema, 'enigma.context_pack.v1');
    assert.equal((await readJson(join(dir, 'export.json'))).schema, 'enigma.vault_bundle.v1');
    assert.equal((await readJson(join(dir, 'verify-report.json'))).ok, true);
  });
});

test('init client selection planning accepts explicit clients without connector writes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-init-clients-'));
  const io = makeIo();

  assert.equal(await main(['init', '--bundle', join(dir, 'bundle.json'), '--out-dir', dir, '--client', 'cursor,kimi-code', '--client', 'claude-desktop', '--dry-run'], io.io), 0, io.stderr());
  const summary = io.json();

  assert.deepEqual(summary.selected_clients, ['cursor', 'kimi-code', 'claude-desktop']);
  assert.deepEqual(summary.connectors.map((connector) => connector.client_id), ['cursor', 'kimi-code', 'claude-desktop']);
  assert.equal(summary.client_configs_written, false);
  assert.equal(summary.connectors.every((connector) => connector.connect_plan.dry_run === true), true);
  assert.ok(summary.next_commands[0].includes('--client cursor'));
  assert.ok(summary.next_commands[0].includes('--client kimi-code'));
  assert.ok(summary.next_commands[0].includes('--client claude-desktop'));
  assert.equal(JSON.stringify(summary).includes(dir), false);
});

test('init memory file input does not echo raw memory', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-init-memory-file-'));
  const memoryPath = join(dir, 'memory.txt');
  const privateMemory = 'private init phrase must never be echoed';
  await writeFile(memoryPath, privateMemory, 'utf8');

  const io = makeIo();
  assert.equal(await main(['init', '--bundle', join(dir, 'bundle.json'), '--out-dir', dir, '--memory-file', memoryPath, '--overwrite'], io.io), 0, io.stderr());
  const stdout = io.stdout();
  const summary = io.json();

  assert.equal(stdout.includes(privateMemory), false);
  assert.equal(summary.memory_source, 'memory_file');
  assert.equal(summary.memory_plaintext_echoed, false);
  assert.equal(summary.raw_memory_printed, false);
  assert.equal(JSON.stringify(summary).includes(privateMemory), false);
  assert.equal(JSON.stringify(summary).includes(dir), false);
});

test('doctor reports first-run diagnostics without echoing local paths', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-doctor-diagnostics-'));
  const bundlePath = join(dir, 'bundle.json');
  const configPath = join(dir, 'missing-client-config.json');
  const previousUserAgent = process.env.npm_config_user_agent;
  process.env.npm_config_user_agent = 'npm/10.9.0 node/v24.0.0 win32 x64 workspaces/false';
  try {
    const io = makeIo();
    assert.equal(await main(['doctor', '--bundle', bundlePath, '--client', 'generic-mcp', '--config', configPath], io.io), 1);
    const stdout = io.stdout();
    const summary = io.json();

    assert.equal(stdout.includes(dir), false);
    assert.equal(summary.npm.detected, true);
    assert.equal(summary.npm.version, '10.9.0');
    assert.equal(summary.vault_path.ok, true);
    assert.equal(summary.vault_path.path, '<bundle-path>');
    assert.equal(summary.vault_path.parent, '<bundle-dir>');
    assert.equal(summary.vault_path.writable, true);
    assert.equal(summary.ok, false);
    assert.equal(summary.setup_status.state, 'setup_needed');
    assert.equal(summary.setup_status.setup_needed, true);
    assert.equal(summary.setup_status.next_command, 'enigma quickstart --bundle "<bundle-path>"');
    assert.match(summary.setup_status.message, /Run quickstart/);
    assert.doesNotMatch(summary.setup_status.message, /writing config/);
    assert.deepEqual(summary.setup_status.reasons, ['bundle_missing']);
    assert.deepEqual(summary.bundle_initialized, {
      ok: false,
      bundle: '<bundle-path>',
      target_exists: false,
      schema: null,
      reason: 'bundle_missing',
      hint: 'Run enigma quickstart --bundle <bundle-path> before using doctor as the final green check.',
    });
    assert.equal(summary.bundle_default_path.resolved, '<bundle-path>');
    assert.deepEqual(summary.connectors.clients.map((client) => client.config_path), ['[redacted:config_path]']);
    assert.ok(summary.next_commands.some((command) => command.startsWith('enigma quickstart ')));
    assert.ok(summary.next_commands.some((command) => command.startsWith('enigma connect generic-mcp ')));
    assert.equal(summary.first_run_hint.bundle, '<bundle-path>');
    assert.equal(summary.first_run_hint.command, 'enigma quickstart --bundle "<bundle-path>"');
    assert.deepEqual(summary.first_run_hint.commands, [
      'enigma quickstart --bundle "<bundle-path>"',
      'enigma doctor --bundle "<bundle-path>" --client generic-mcp',
      'enigma drive health --bundle "<bundle-path>"',
    ]);
    assert.deepEqual(summary.fresh_install_hint, summary.first_run_hint);
    assert.equal(summary.next_commands[0], 'enigma quickstart --bundle "<bundle-path>"');
  } finally {
    if (previousUserAgent === undefined) {
      delete process.env.npm_config_user_agent;
    } else {
      process.env.npm_config_user_agent = previousUserAgent;
    }
  }
});

test('doctor explains invalid bundle recovery without destructive default', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-doctor-invalid-bundle-'));
  const bundlePath = join(dir, 'bundle.json');
  try {
    await writeFile(bundlePath, '{invalid json\n', 'utf8');
    const io = makeIo();
    assert.equal(await main(['doctor', '--bundle', bundlePath], io.io), 1);
    const stdout = io.stdout();
    const summary = io.json();

    assert.equal(stdout.includes(dir), false);
    assert.equal(summary.ok, false);
    assert.equal(summary.setup_status.state, 'setup_needed');
    assert.ok(summary.setup_status.reasons.includes('bundle_json_invalid'));
    assert.equal(summary.setup_status.next_command, 'enigma quickstart --bundle "<new-bundle-path>" --out-dir "<new-empty-out-dir>"');
    assert.equal(summary.bundle_initialized.reason, 'bundle_json_invalid');
    assert.match(summary.bundle_initialized.hint, /enigma quickstart --bundle <new-bundle-path>/);
    assert.match(summary.bundle_initialized.hint, /--overwrite only if you intentionally replace/);
    assert.doesNotMatch(summary.bundle_initialized.hint, /setup with --overwrite|quickstart or setup with --overwrite/);
    assert.equal(summary.first_run_hint.bundle, '<new-bundle-path>');
    assert.equal(summary.first_run_hint.out_dir, '<new-empty-out-dir>');
    assert.equal(summary.first_run_hint.recovery, 'fresh_bundle_non_destructive');
    assert.equal(summary.first_run_hint.command, 'enigma quickstart --bundle "<new-bundle-path>" --out-dir "<new-empty-out-dir>"');
    assert.deepEqual(summary.first_run_hint.commands, [
      'enigma quickstart --bundle "<new-bundle-path>" --out-dir "<new-empty-out-dir>"',
      'enigma doctor --bundle "<new-bundle-path>" --client generic-mcp',
      'enigma drive health --bundle "<new-bundle-path>"',
    ]);
    assert.equal(summary.next_commands[0], 'enigma quickstart --bundle "<new-bundle-path>" --out-dir "<new-empty-out-dir>"');
    assert.equal(summary.next_commands[1], 'enigma doctor --bundle "<new-bundle-path>" --client generic-mcp');
    assert.equal(summary.next_commands[3], 'enigma status --bundle "<new-bundle-path>"');
    assert.doesNotMatch(summary.next_commands.join('\n'), /--overwrite/);
    const plainIo = makeIo();
    assert.equal(await main(['doctor', '--bundle', bundlePath, '--plain'], plainIo.io), 1);
    const plain = plainIo.stdout();
    assert.match(plain, /not a valid Memory Drive bundle/);
    assert.match(plain, /Run: enigma quickstart --bundle "<new-bundle-path>" --out-dir "<new-empty-out-dir>"/);
    assert.match(plain, /Then: enigma doctor --bundle "<new-bundle-path>" --client generic-mcp/);
    assert.equal(plain.includes(dir), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('support summary is public-safe on fresh install and initialized bundles', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-support-summary-'));
  const bundlePath = join(dir, 'bundle.json');
  const configPath = join(dir, 'client-config.json');
  const outPath = join(dir, 'support-summary.json');
  try {
    const freshIo = makeIo();
    assert.equal(await main(['support', 'summary', '--bundle', bundlePath, '--client', 'generic-mcp', '--config', configPath, '--now', '2026-06-28T14:40:00.000Z'], freshIo.io), 0, freshIo.stderr());
    const freshStdout = freshIo.stdout();
    const fresh = freshIo.json();

    assert.equal(fresh.schema, 'enigma.support_summary.v1');
    assert.equal(fresh.setup_status.state, 'setup_needed');
    assert.equal(fresh.next_action.id, 'run_quickstart');
    assert.equal(fresh.next_action.label, 'Create Memory Drive');
    assert.equal(fresh.bundle, '<bundle-path>');
    assert.equal(fresh.redaction.raw_memory_included, false);
    assert.equal(fresh.redaction.local_paths_redacted, true);
    assert.equal(fresh.privacy_scan.schema, 'enigma.support_privacy_scan.v1');
    assert.equal(fresh.privacy_scan.status, 'pass');
    assert.equal(fresh.privacy_scan.detected_private_field_count, 0);
    assert.ok(fresh.privacy_scan.checked_categories.includes('storage_locations'));
    assert.equal(fresh.claim_boundaries.provider_deletion_proof, false);
    assert.equal(freshStdout.includes(dir), false);

    const setupIo = makeIo();
    assert.equal(await main(['quickstart', '--bundle', bundlePath, '--overwrite'], setupIo.io), 0, setupIo.stderr());

    const readyIo = makeIo();
    assert.equal(await main(['support', 'summary', '--bundle', bundlePath, '--client', 'generic-mcp', '--config', configPath, '--out', outPath, '--now', '2026-06-28T14:41:00.000Z'], readyIo.io), 0, readyIo.stderr());
    const readyStdout = readyIo.stdout();
    const ready = readyIo.json();
    const written = JSON.parse(await readFile(outPath, 'utf8'));

    assert.deepEqual(written, ready);
    assert.equal(ready.schema, 'enigma.support_summary.v1');
    assert.equal(ready.first_run_status.schema, 'enigma.first_run_status.v1');
    assert.equal(ready.first_run_status.claim_boundaries.raw_memory_returned, false);
    assert.equal(ready.diagnostics.bundle_initialized_ok, true);
    assert.equal(ready.privacy_scan.schema, 'enigma.support_privacy_scan.v1');
    assert.equal(ready.privacy_scan.public_safe_summary_only, true);
    assert.equal(JSON.stringify(ready).includes('Enigma quickstart demo memory'), false);
    assert.equal(readyStdout.includes(dir), false);
    assert.equal(JSON.stringify(ready).includes(dir), false);

    const plainIo = makeIo();
    assert.equal(await main(['support', 'summary', '--bundle', bundlePath, '--client', 'generic-mcp', '--config', configPath, '--plain', '--now', '2026-06-28T14:42:00.000Z'], plainIo.io), 0, plainIo.stderr());
    assert.match(plainIo.stdout(), /^Enigma support summary\n/);
    assert.match(plainIo.stdout(), /Status: Ready/);
    assert.match(plainIo.stdout(), /Support code: ref:support-summary:/);
    assert.match(plainIo.stdout(), /Redacted: raw memory, prompts, transcripts, credentials, provider responses, local paths/);
    assert.match(plainIo.stdout(), /Privacy scan: pass \(0 finding\(s\), 8 categories checked\)/);
    assert.match(plainIo.stdout(), /Safe to share: support code, setup state, issue count, and next action only/);
    assert.match(plainIo.stdout(), /Boundary: local Enigma support state only/);
    assert.doesNotMatch(plainIo.stdout(), /^\s*\{/);
    assert.equal(plainIo.stdout().includes(dir), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('doctor is green after bundle initialization when connector config is absent', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-doctor-initialized-'));
  const bundlePath = join(dir, 'bundle.json');
  const configPath = join(dir, 'missing-client-config.json');

  const setupIo = makeIo();
  assert.equal(await main(['setup', '--bundle', bundlePath, '--out-dir', dir, '--overwrite'], setupIo.io), 0, setupIo.stderr());

  const io = makeIo();
  assert.equal(await main(['doctor', '--bundle', bundlePath, '--client', 'generic-mcp', '--config', configPath], io.io), 0, io.stderr());
  const stdout = io.stdout();
  const summary = io.json();

  assert.equal(stdout.includes(dir), false);
  assert.equal(summary.ok, true);
  assert.equal(summary.setup_status.state, 'ready');
  assert.equal(summary.setup_status.setup_needed, false);
  assert.equal(summary.setup_status.next_command, null);
  assert.equal(summary.next_commands.some((command) => command.includes('quickstart')), false);
  assert.equal(summary.next_commands[0], 'enigma drive health --bundle "<bundle-path>"');
  assert.equal(summary.next_commands[1], 'enigma status --bundle "<bundle-path>"');
  assert.ok(summary.next_commands.some((command) => command === 'enigma connect generic-mcp --bundle "<bundle-path>" --dry-run'));
  assert.deepEqual(summary.bundle_initialized, {
    ok: true,
    bundle: '<bundle-path>',
    target_exists: true,
    schema: 'enigma.vault_bundle.v1',
    reason: null,
    hint: null,
  });
  assert.deepEqual(summary.connectors.clients.map((client) => client.config_path), ['[redacted:config_path]']);

  const plainIo = makeIo();
  assert.equal(await main(['doctor', '--bundle', bundlePath, '--client', 'generic-mcp', '--config', configPath, '--plain'], plainIo.io), 0, plainIo.stderr());
  const readyPlain = plainIo.stdout();
  assert.match(readyPlain, /Status: Ready/);
  assert.doesNotMatch(readyPlain, /Run: enigma quickstart/);
  assert.match(readyPlain, /Next: enigma drive health --bundle "<bundle-path>"/);
  assert.match(readyPlain, /Next: enigma status --bundle "<bundle-path>"/);
  assert.match(readyPlain, /Next: enigma connect generic-mcp --bundle "<bundle-path>" --dry-run/);
  assert.doesNotMatch(readyPlain, /^\s*\{/);
  assert.equal(readyPlain.includes(dir), false);
});

test('doctor explains connector bundle mismatch as first-run state without local paths', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-doctor-first-run-'));
  const bundlePath = join(dir, 'bundle.json');
  const configPath = join(dir, 'generic-mcp.json');
  const staleBundlePath = join(dir, 'not-initialized', 'bundle.json');
  await writeFile(configPath, `${JSON.stringify({
    mcpServers: {
      enigma: {
        command: 'enigma-mcp',
        args: [],
        env: {
          ENIGMA_BUNDLE: staleBundlePath,
        },
      },
    },
  }, null, 2)}\n`, 'utf8');

  const io = makeIo();
  assert.equal(await main(['doctor', '--bundle', bundlePath, '--client', 'generic-mcp', '--config', configPath], io.io), 1);
  const stdout = io.stdout();
  const summary = io.json();

  assert.equal(stdout.includes(dir), false);
  assert.equal(stdout.includes(staleBundlePath), false);
  assert.equal(summary.ok, false);
  assert.equal(summary.setup_status.state, 'setup_needed');
  assert.equal(summary.setup_status.setup_needed, true);
  assert.deepEqual(summary.setup_status.reasons, ['bundle_missing', 'connector_bundle_env_mismatch']);
  assert.equal(summary.vault_path.path, '<bundle-path>');
  assert.equal(summary.bundle_initialized.ok, false);
  assert.equal(summary.bundle_initialized.reason, 'bundle_missing');
  assert.deepEqual(summary.connectors.clients.map((client) => client.config_path), ['[redacted:config_path]']);
  assert.deepEqual(summary.connectors.clients[0].repair_reasons, ['bundle_env_mismatch']);
  assert.equal(summary.first_run_hint.bundle, '<bundle-path>');
  assert.equal(summary.first_run_hint.command, 'enigma quickstart --bundle "<bundle-path>"');
  assert.deepEqual(summary.first_run_hint.commands, [
    'enigma quickstart --bundle "<bundle-path>"',
    'enigma doctor --bundle "<bundle-path>" --client generic-mcp',
    'enigma drive health --bundle "<bundle-path>"',
  ]);
  assert.equal(JSON.stringify(summary.first_run_hint).includes(dir), false);

  const plainIo = makeIo();
  assert.equal(await main(['doctor', '--bundle', bundlePath, '--client', 'generic-mcp', '--config', configPath, '--plain'], plainIo.io), 1);
  assert.match(plainIo.stdout(), /AI app connection setting points at a missing or different bundle/);
  assert.match(plainIo.stdout(), /preview or repair the app connection/);
  assert.doesNotMatch(plainIo.stdout(), /MCP client config|local client config|JSON/i);
  assert.equal(plainIo.stdout().includes(dir), false);
});

test('doctor plain output gives one readable next action without JSON or paths', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-doctor-plain-'));
  const bundlePath = join(dir, 'bundle.json');
  try {
    const io = makeIo();
    assert.equal(await main(['doctor', '--bundle', bundlePath, '--plain'], io.io), 1);
    const stdout = io.stdout();

    assert.match(stdout, /^Enigma doctor\n/);
    assert.match(stdout, /Status: Needs attention/);
    assert.match(stdout, /Setup: setup_needed/);
    assert.match(stdout, /Why: (?:the target Enigma bundle does not exist yet|the Memory Drive is not ready)/);
    assert.doesNotMatch(stdout, /MCP client config|local client config|JSON/i);
    assert.match(stdout, /Run: enigma quickstart --bundle "<bundle-path>"/);
    assert.match(stdout, /Boundary: local Enigma checks only/);
    assert.doesNotMatch(stdout, /^\s*\{/);
    assert.equal(stdout.includes(dir), false);
    assert.equal(stdout.includes(bundlePath), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('setup plain output summarizes first run without JSON or local paths', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-setup-plain-'));
  const bundlePath = join(dir, 'bundle.json');
  const outDir = join(dir, 'out');
  try {
    const io = makeIo();
    assert.equal(await main(['setup', '--bundle', bundlePath, '--out-dir', outDir, '--overwrite', '--plain'], io.io), 0, io.stderr());
    const stdout = io.stdout();

    assert.match(stdout, /^Enigma setup\n/);
    assert.match(stdout, /Status: Ready/);
    assert.match(stdout, /Memory Drive: <bundle-path>/);
    assert.match(stdout, /Connectors: planned only/);
    assert.match(stdout, /Next: enigma import text --file \.\/memories\.md --complete --plain/);
    assert.doesNotMatch(stdout, /Next: enigma remember --bundle "<bundle-path>" --text-file \.\/memory\.txt/);
    assert.match(stdout, /Boundary: local Enigma setup only/);
    assert.doesNotMatch(stdout, /^\s*\{/);
    assert.equal(stdout.includes(dir), false);
    assert.equal(stdout.includes(bundlePath), false);
    assert.equal(stdout.includes(outDir), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('quickstart plain output summarizes outputs without JSON or local paths', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-quickstart-plain-'));
  const bundlePath = join(dir, 'bundle.json');
  try {
    const io = makeIo();
    assert.equal(await main(['quickstart', '--bundle', bundlePath, '--out-dir', dir, '--overwrite', '--plain'], io.io), 0, io.stderr());
    const stdout = io.stdout();

    assert.match(stdout, /^Enigma quickstart\n/);
    assert.match(stdout, /Status: Ready/);
    assert.match(stdout, /Memory Drive: <bundle-path>/);
    assert.match(stdout, /Receipts: \d+/);
    assert.match(stdout, /Next: enigma verify --export <out-dir>\/export\.json/);
    assert.match(stdout, /Boundary: local Enigma quickstart only/);
    assert.doesNotMatch(stdout, /^\s*\{/);
    assert.equal(stdout.includes(dir), false);
    assert.equal(stdout.includes(bundlePath), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('install plain output summarizes snippets without JSON or local paths', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-install-plain-'));
  const bundlePath = join(dir, 'bundle.json');
  const outPath = join(dir, 'snippets.json');
  try {
    const io = makeIo();
    assert.equal(await main(['install', '--bundle', bundlePath, '--client', 'claude-desktop', '--out', outPath, '--plain'], io.io), 0, io.stderr());
    const stdout = io.stdout();

    assert.match(stdout, /^Enigma install\n/);
    assert.match(stdout, /Status: Ready/);
    assert.match(stdout, /Memory Drive: <bundle-path>/);
    assert.match(stdout, /Clients: 1/);
    assert.match(stdout, /MCP command: enigma-mcp/);
    assert.match(stdout, /Snippets: written to <out>/);
    assert.match(stdout, /Next: enigma claude-mcpb package --plain/);
    assert.match(stdout, /Boundary: local install snippet planning only/);
    assert.doesNotMatch(stdout, /^\s*\{/);
    assert.equal(stdout.includes(dir), false);
    assert.equal(stdout.includes(bundlePath), false);
    assert.equal(stdout.includes(outPath), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('status plain output reports counters without JSON or local paths', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-status-plain-'));
  const bundlePath = join(dir, 'bundle.json');
  const outDir = join(dir, 'out');
  try {
    const setupIo = makeIo();
    assert.equal(await main(['setup', '--bundle', bundlePath, '--out-dir', outDir, '--overwrite'], setupIo.io), 0, setupIo.stderr());

    const io = makeIo();
    assert.equal(await main(['status', '--bundle', bundlePath, '--plain'], io.io), 0, io.stderr());
    const stdout = io.stdout();

    assert.match(stdout, /^Enigma status\n/);
    assert.match(stdout, /Memory Drive: <bundle-path>/);
    assert.match(stdout, /Active memories: \d+/);
    assert.match(stdout, /Receipts: \d+/);
    assert.match(stdout, /Setup: /);
    assert.match(stdout, /Boundary: local Enigma counters and roots only/);
    assert.doesNotMatch(stdout, /^\s*\{/);
    assert.equal(stdout.includes(dir), false);

    const jsonIo = makeIo();
    assert.equal(await main(['status', '--bundle', bundlePath], jsonIo.io), 0, jsonIo.stderr());
    const status = jsonIo.json();
    assert.ok(status.next_recommended_commands.some((command) => command.startsWith('enigma connect <client> ') && command.endsWith(' --dry-run')));
    assert.equal(status.bundle, '<bundle-path>');
    assert.equal(status.connector_readiness.bundle, '<bundle-path>');
    assert.equal(JSON.stringify(status).includes(dir), false);
    assert.equal(stdout.includes(bundlePath), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('drive health plain output reports health without JSON or local paths', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-drive-health-plain-'));
  const bundlePath = join(dir, 'bundle.json');
  const outDir = join(dir, 'out');
  try {
    const setupIo = makeIo();
    assert.equal(await main(['setup', '--bundle', bundlePath, '--out-dir', outDir, '--overwrite'], setupIo.io), 0, setupIo.stderr());

    const io = makeIo();
    assert.equal(await main(['drive', 'health', '--bundle', bundlePath, '--plain'], io.io), 0, io.stderr());
    const stdout = io.stdout();

    assert.match(stdout, /^Enigma drive health\n/);
    assert.match(stdout, /Status: /);
    assert.match(stdout, /Score: /);
    assert.match(stdout, /Receipt coverage: /);
    assert.match(stdout, /Proof network: /);
    assert.match(stdout, /Boundary: local Memory Drive health only/);
    assert.doesNotMatch(stdout, /^\s*\{/);
    assert.equal(stdout.includes(dir), false);
    assert.equal(stdout.includes(bundlePath), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
