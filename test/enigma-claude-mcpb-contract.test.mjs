import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createClaudeDesktopMcpbConnectionPlan,
  createClaudeDesktopMcpbHealth,
  createClaudeDesktopMcpbManifest,
  planConnectWizard,
} from '../packages/connectors/src/index.js';

const PRIVATE_STRINGS = [
  'C:\\Users\\Casey',
  '/Users/casey',
  '/home/casey',
  'claude_desktop_config.json',
  'mcpServers',
  'secret-token',
  'private signing key',
  'raw transcript',
];

function assertPublicSafe(value) {
  const serialized = JSON.stringify(value);
  for (const privateString of PRIVATE_STRINGS) {
    assert.equal(serialized.includes(privateString), false, `leaked ${privateString}`);
  }
}

test('Claude Desktop mcpb manifest is public-safe command metadata only', () => {
  const manifest = createClaudeDesktopMcpbManifest({
    version: '1.2.3',
    platform: 'win32',
    homeDir: 'C:\\Users\\Casey',
    configPath: 'C:\\Users\\Casey\\AppData\\Roaming\\Claude\\claude_desktop_config.json',
    serverEnv: {
      ENIGMA_BUNDLE: 'C:\\Users\\Casey\\.enigma\\bundle.json',
      SECRET_TOKEN: 'secret-token',
    },
  });

  assert.equal(manifest.schema, 'enigma.claude_desktop_mcpb_manifest.v1');
  assert.equal(manifest.manifest_version, '0.3');
  assert.equal(manifest.name, 'enigma-memory');
  assert.equal(manifest.display_name, 'Enigma Memory');
  assert.equal(manifest.version, '1.2.3');
  assert.equal(manifest.server.command.name, 'enigma-mcp');
  assert.equal(manifest.server.type, 'binary');
  assert.equal(manifest.server.mcp_config.command, 'enigma-mcp');
  assert.deepEqual(manifest.server.mcp_config.environment_names, ['ENIGMA_BUNDLE']);
  assert.equal(Object.hasOwn(manifest.server.mcp_config, 'env'), false);
  assert.deepEqual(manifest.server.environment_names, ['ENIGMA_BUNDLE']);
  assert.deepEqual(manifest.supported_platforms, ['win32', 'darwin', 'linux']);
  assert.equal(manifest.public_safety.raw_config_body_included, false);
  assert.equal(manifest.public_safety.local_absolute_path_included, false);
  assert.equal(manifest.claim_boundary.provider_deletion_claim, false);
  assert.equal(manifest.claim_boundary.model_forgetting_claim, false);
  assert.equal(manifest.claim_boundary.provider_native_memory_control_claim, false);
  assertPublicSafe(manifest);
});

test('Claude Desktop mcpb connection plan orders states and keeps manual JSON advanced-only', () => {
  const plan = createClaudeDesktopMcpbConnectionPlan({ platform: 'darwin' });

  assert.equal(plan.schema, 'enigma.claude_desktop_mcpb_connection_plan.v1');
  assert.equal(plan.client_id, 'claude-desktop');
  assert.equal(plan.platform, 'darwin');
  assert.deepEqual(plan.states.map((state) => state.id), [
    'detect',
    'preview',
    'consent',
    'install_handoff',
    'restart',
    'test',
    'ready',
  ]);
  assert.deepEqual(plan.states.map((state) => state.order), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(plan.writes_performed, false);
  assert.equal(plan.automatic_config_write, false);
  assert.equal(plan.default_manual_json_fallback, false);
  assert.equal(plan.install_handoff.enigma_writes_claude_config, false);
  assert.equal(plan.bridge_pairing.scope, 'current_os_user');
  assert.equal(plan.bridge_pairing.pairing_secret_in_manifest, false);
  assert.equal(plan.bridge_pairing.raw_local_service_endpoint_included, false);
  assert.equal(plan.fallback_boundaries.manual_json.default, false);
  assert.equal(plan.fallback_boundaries.manual_json.audience, 'advanced');
  assert.equal(plan.fallback_boundaries.manual_json.requires_explicit_selection, true);
  assertPublicSafe(plan);
});

test('Claude Desktop mcpb plan does not change existing config-writing wizard behavior', () => {
  const wizard = planConnectWizard('claude-desktop', { platform: 'linux' }).clients[0];

  assert.equal(wizard.connect_command, 'enigma connect claude-desktop --bundle "$HOME/.enigma/bundle.json"');
  assert.equal(wizard.mcp_config_preview.mcpServers.enigma.command, 'enigma-mcp');
});

test('Claude Desktop mcpb health fails closed until test evidence exists', () => {
  const missing = createClaudeDesktopMcpbHealth();
  assert.equal(missing.status, 'not_installed');
  assert.equal(missing.connected, false);

  const installed = createClaudeDesktopMcpbHealth({ mcpbInstalled: true });
  assert.equal(installed.status, 'mcpb_ready');
  assert.equal(installed.state, 'mcpb_ready');
  assert.equal(installed.connected, false);
  assert.equal(installed.ok, false);
  assert.equal(installed.test_evidence_present, false);

  const restart = createClaudeDesktopMcpbHealth({ mcpbInstalled: true, restartRequired: true });
  assert.equal(restart.status, 'restart_required');
  assert.equal(restart.connected, false);

  const testing = createClaudeDesktopMcpbHealth({ mcpbInstalled: true, testing: true });
  assert.equal(testing.status, 'testing');
  assert.equal(testing.connected, false);

  const failed = createClaudeDesktopMcpbHealth({
    mcpbInstalled: true,
    testEvidence: { status: 'failed' },
    repairReasons: ['bridge_unreachable', 'C:\\Users\\Casey\\secret'],
  });
  assert.equal(failed.status, 'repair_required');
  assert.equal(failed.connected, false);
  assert.deepEqual(failed.repair_reasons, ['bridge_unreachable']);
  assert.equal(failed.ok, false);
  assert.equal(failed.test_evidence_present, true);
  assertPublicSafe(failed);

  const ready = createClaudeDesktopMcpbHealth({ mcpbInstalled: true, testEvidence: { status: 'passed' } });
  assert.equal(ready.status, 'ready');
  assert.equal(ready.connected, true);
  assert.equal(ready.test_evidence_present, true);
  assert.equal(ready.ok, true);
  assert.equal(ready.ready, true);

  const advanced = createClaudeDesktopMcpbHealth({ advancedFallback: true, mcpbInstalled: true, testEvidence: true });
  assert.equal(advanced.status, 'advanced_fallback');
  assert.equal(advanced.connected, false);
});
