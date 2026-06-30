import test from 'node:test';
import assert from 'node:assert/strict';

import {
  detectClientConnector,
  detectConnectors,
  planConnectWizard,
  supportedClients,
} from '../packages/connectors/src/index.js';

function missingFile(path) {
  const error = new Error(`ENOENT: no such file, open '${path}'`);
  error.code = 'ENOENT';
  return error;
}

function readFileFrom(files) {
  return async (path) => {
    if (!Object.hasOwn(files, path)) throw missingFile(path);
    return files[path];
  };
}

function connectorConfig({ bundlePath, command = 'enigma-mcp', args = [] } = {}) {
  return JSON.stringify({
    theme: 'dark',
    mcpServers: {
      sibling: { command: 'sibling-mcp' },
      enigma: {
        command,
        args,
        env: bundlePath === undefined ? {} : { ENIGMA_BUNDLE: bundlePath },
      },
    },
  });
}

test('connector detection resolves supported client config paths across platforms with injectable readers', async () => {
  const fixtures = [
    {
      platform: 'win32',
      clientId: 'claude-desktop',
      homeDir: 'C:\\Users\\Casey',
      env: {
        USERPROFILE: 'C:\\Users\\Casey',
        APPDATA: 'C:\\Users\\Casey\\AppData\\Roaming',
      },
      configPath: 'C:\\Users\\Casey\\AppData\\Roaming\\Claude\\claude_desktop_config.json',
      bundlePath: 'C:\\Users\\Casey\\.enigma\\bundle.json',
    },
    {
      platform: 'darwin',
      clientId: 'cursor',
      homeDir: '/Users/casey',
      env: { HOME: '/Users/casey' },
      configPath: '/Users/casey/.cursor/mcp.json',
      bundlePath: '/Users/casey/.enigma/bundle.json',
    },
    {
      platform: 'linux',
      clientId: 'roo',
      homeDir: '/home/casey',
      env: { HOME: '/home/casey' },
      configPath: '/home/casey/.config/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json',
      bundlePath: '/home/casey/.enigma/bundle.json',
    },
  ];

  for (const fixture of fixtures) {
    const configured = await detectClientConnector(fixture.clientId, {
      platform: fixture.platform,
      homeDir: fixture.homeDir,
      env: fixture.env,
      bundlePath: fixture.bundlePath,
      readFile: readFileFrom({ [fixture.configPath]: connectorConfig({ bundlePath: fixture.bundlePath }) }),
    });

    assert.equal(configured.configPath, fixture.configPath);
    assert.equal(configured.configPathExists, true);
    assert.equal(configured.installed, true);
    assert.equal(configured.commandOk, true);
    assert.equal(configured.argsOk, true);
    assert.equal(configured.bundleEnvOk, true);
    assert.equal(configured.recommended_action, 'already_configured');

    const missing = await detectClientConnector(fixture.clientId, {
      platform: fixture.platform,
      homeDir: fixture.homeDir,
      env: fixture.env,
      bundlePath: fixture.bundlePath,
      readFile: readFileFrom({}),
    });

    assert.equal(missing.configPath, fixture.configPath);
    assert.equal(missing.configPathExists, false);
    assert.equal(missing.installed, false);
    assert.equal(missing.recommended_action, 'missing_client_config');
    assert.deepEqual(missing.repair_reasons, ['client_config_missing']);
  }
});

test('connector detection recommends connect or repair without overwriting unrelated settings', async () => {
  const configPath = '/home/casey/.config/enigma/mcp.json';
  const bundlePath = '/home/casey/.enigma/bundle.json';
  const baseOptions = {
    platform: 'linux',
    homeDir: '/home/casey',
    env: { HOME: '/home/casey' },
    bundlePath,
  };

  const missingServer = await detectClientConnector('generic-mcp', {
    ...baseOptions,
    readFile: readFileFrom({ [configPath]: JSON.stringify({ mcpServers: { sibling: { command: 'safe' } } }) }),
  });
  assert.equal(missingServer.configPathExists, true);
  assert.equal(missingServer.installed, false);
  assert.equal(missingServer.recommended_action, 'connect');
  assert.deepEqual(missingServer.repair_reasons, ['enigma_server_missing']);

  const wrongCommand = await detectClientConnector('generic-mcp', {
    ...baseOptions,
    readFile: readFileFrom({ [configPath]: connectorConfig({ bundlePath, command: 'node' }) }),
  });
  assert.equal(wrongCommand.installed, true);
  assert.equal(wrongCommand.commandOk, false);
  assert.equal(wrongCommand.bundleEnvOk, true);
  assert.equal(wrongCommand.recommended_action, 'repair');
  assert.deepEqual(wrongCommand.repair_reasons, ['command_mismatch']);

  const wrongBundle = await detectClientConnector('generic-mcp', {
    ...baseOptions,
    readFile: readFileFrom({ [configPath]: connectorConfig({ bundlePath: '/home/casey/other-bundle.json' }) }),
  });
  assert.equal(wrongBundle.commandOk, true);
  assert.equal(wrongBundle.bundleEnvOk, false);
  assert.equal(wrongBundle.recommended_action, 'repair');
  assert.deepEqual(wrongBundle.repair_reasons, ['bundle_env_mismatch']);

  const extraEnv = await detectClientConnector('generic-mcp', {
    ...baseOptions,
    readFile: readFileFrom({
      [configPath]: JSON.stringify({
        mcpServers: {
          enigma: {
            command: 'enigma-mcp',
            args: [],
            env: { ENIGMA_BUNDLE: bundlePath, EXTRA_ENV: 'unexpected' },
          },
        },
      }),
    }),
  });
  assert.equal(extraEnv.bundleEnvOk, true);
  assert.equal(extraEnv.envOk, false);
  assert.equal(extraEnv.recommended_action, 'repair');
  assert.deepEqual(extraEnv.repair_reasons, ['env_mismatch']);
});

test('connector detection handles corrupt JSON and redacts local paths on request', async () => {
  const homeDir = '/Users/Private Operator';
  const configPath = '/Users/Private Operator/Library/Application Support/Kimi Code/mcp.json';
  const bundlePath = '/Users/Private Operator/.enigma/secret-bundle.json';

  const corrupt = await detectClientConnector('kimi-code', {
    platform: 'darwin',
    homeDir,
    env: { HOME: homeDir },
    bundlePath,
    readFile: readFileFrom({ [configPath]: '{"mcpServers":' }),
  });
  assert.equal(corrupt.recommended_action, 'repair');
  assert.equal(corrupt.parse_error, true);
  assert.match(corrupt.error, /Cannot parse JSON connector config/);

  const redacted = await detectClientConnector('kimi-code', {
    platform: 'darwin',
    homeDir,
    env: { HOME: homeDir },
    bundlePath,
    redactPaths: true,
    readFile: readFileFrom({ [configPath]: '{"mcpServers":' }),
  });
  const publicJson = JSON.stringify(redacted);
  assert.equal(redacted.configPath, '[redacted:config_path]');
  assert.equal(redacted.recommended_action, 'repair');
  assert.equal(publicJson.includes(homeDir), false);
  assert.equal(publicJson.includes('secret-bundle'), false);
});

test('connector detection and wizard planner cover all supported clients with public-safe commands', async () => {
  const bundlePath = '/home/casey/.enigma/bundle.json';
  const configPath = '/home/casey/.config/enigma/mcp.json';
  const all = await detectConnectors({
    platform: 'linux',
    homeDir: '/home/casey',
    env: { HOME: '/home/casey' },
    clientId: 'generic-mcp',
    bundlePath,
    readFile: readFileFrom({ [configPath]: connectorConfig({ bundlePath }) }),
  });
  assert.equal(all.ok, true);
  assert.equal(all.clients.length, 1);
  assert.equal(all.clients[0].recommended_action, 'already_configured');
  assert.equal(all.clients[0].wizard.steps[0].command, 'npm install -g enigma-memory');

  const plan = planConnectWizard({ platform: 'linux' });
  assert.deepEqual(plan.clients.map((client) => client.client_id), supportedClients);
  assert.equal(plan.writes_performed, false);
  for (const client of plan.clients) {
    assert.equal(client.steps[0].command, 'npm install -g enigma-memory');
    if (client.client_id === 'claude-desktop') {
      assert.deepEqual(client.steps.map((step) => step.id), [
        'install_package',
        'create_local_bundle',
        'package_claude_mcpb',
        'install_claude_mcpb',
        'test_claude_mcpb',
        'advanced_config_fallback',
      ]);
      assert.equal(client.connect_command, 'enigma claude-mcpb package --plain');
      assert.match(client.one_command_install_connect, /enigma claude-mcpb package --plain/);
      assert.doesNotMatch(client.one_command_install_connect, /connect claude-desktop/);
      assert.equal(client.mcp_config_preview, null);
      assert.equal(client.mcpb_connection_plan.preferred_path, 'mcpb_extension');
      assert.equal(client.advanced_fallback_connect_command, 'enigma connect claude-desktop --bundle "$HOME/.enigma/bundle.json" --dry-run');
      continue;
    }
    assert.equal(client.steps[2].command, `enigma doctor --client ${client.client_id}`);
    assert.match(client.steps.find((step) => step.id === 'connect_client').command, new RegExp(`enigma connect ${client.client_id} .* --dry-run`));
    assert.match(client.steps.find((step) => step.id === 'connect_client').title, /Preview the app connection/);
    assert.equal(client.steps.find((step) => step.id === 'connect_client').writes, false);
    assert.match(client.one_command_install_connect, new RegExp(`npm install -g enigma-memory && enigma quickstart .* && enigma connect ${client.client_id} .* --dry-run`));
    assert.doesNotMatch(client.one_command_install_connect, /setup --client|--write-connectors|--overwrite/);
    assert.equal(client.mcp_config_preview.mcpServers.enigma.command, 'enigma-mcp');
  }
  const kimi = plan.clients.find((client) => client.client_id === 'kimi-code');
  assert.ok(kimi.steps.some((step) => step.id === 'kimi_gui_path_caveat' && step.command.includes('--mcp-command "/absolute/path/to/enigma-mcp"')));
});
