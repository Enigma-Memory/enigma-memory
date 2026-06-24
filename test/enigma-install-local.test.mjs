import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INSTALLER_SCHEMA,
  parseInstallerArgs,
  runInstallEnigmaLocal,
  validateCommandSpec,
  validateNodeVersion,
} from '../scripts/install-enigma-local.mjs';

test('local installer defaults to dry-run and previews local commands only', async () => {
  let executed = false;
  const result = await runInstallEnigmaLocal(['--init-vault', '--bundle', './vault/bundle.json'], {
    nodeVersion: '24.1.0',
    platform: 'linux',
    cwd: '/operator/private/enigma',
    execFileImpl: async () => {
      executed = true;
      throw new Error('dry-run must not execute commands');
    },
  });

  assert.equal(executed, false);
  assert.equal(result.schema, INSTALLER_SCHEMA);
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'dry-run');
  assert.equal(result.dry_run, true);
  assert.equal(result.execute, false);
  assert.equal(result.bundle.initialize_requested, true);
  assert.equal(result.bundle.initialized, false);
  assert.deepEqual(result.commands.map((command) => command.step), ['install_package', 'initialize_vault']);
  assert.deepEqual(result.preview.commands.map((command) => command.step), ['install_package', 'initialize_vault']);
  assert.deepEqual(result.preview.commands, result.commands);
  assert.deepEqual(result.commands[0], {
    step: 'install_package',
    command: 'npm',
    args: ['install', '-g', '.'],
    status: 'preview',
    mutates: 'global_npm_install',
  });
  assert.deepEqual(result.commands[1].args, ['init', '--bundle', '<bundle-path>', '--subject', '<subject>', '--display-name', '<display-name>']);
  assert.equal(result.safety.requires_execute_for_mutation, true);
  assert.equal(result.safety.network_download_command, false);
});

test('local installer execute mode is injectable for tests without global install', async () => {
  const calls = [];
  const result = await runInstallEnigmaLocal(['--execute', '--init-vault', '--bundle', './vault/bundle.json'], {
    nodeVersion: '24.0.0',
    platform: 'linux',
    cwd: '/operator/private/enigma',
    mkdirImpl: async () => undefined,
    execFileImpl: async (command, args, options) => {
      calls.push({ command, args, cwd: options.cwd, windowsHide: options.windowsHide });
      return { stdout: 'Bearer should-not-be-copied-to-output', stderr: 'local absolute path should not be copied' };
    },
  });

  assert.equal(result.mode, 'execute');
  assert.equal(result.bundle.initialized, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].command, 'npm');
  assert.deepEqual(calls[0].args, ['install', '-g', '.']);
  assert.equal(calls[0].windowsHide, true);
  assert.equal(calls[1].command, 'enigma');
  assert.equal(calls[1].args[0], 'init');
  assert.ok(calls[1].args.includes('--bundle'));
  assert.equal(JSON.stringify(result).includes('Bearer should-not-be-copied-to-output'), false);
});

test('local installer rejects invalid Node versions and unsafe commands', () => {
  assert.throws(() => validateNodeVersion('23.11.0'), /Node >=24/);
  assert.throws(() => validateNodeVersion('not-a-version'), /Invalid Node version/);
  assert.throws(() => parseInstallerArgs(['--dry-run', '--execute']), /either --dry-run or --execute/);
  assert.throws(() => validateCommandSpec({ command: 'curl', args: ['https://example.invalid/install.sh'] }), /allowlisted/);
  assert.throws(() => validateCommandSpec({ command: 'npm', args: ['install', '-g', '@enigma-ai/enigma'] }), /exactly npm install -g \./);
  assert.throws(() => validateCommandSpec({ command: 'enigma', args: ['init', '--bundle', 'bad\npath'] }), /control character/);
});

test('local installer output is public-safe even with operator-supplied paths', async () => {
  const result = await runInstallEnigmaLocal([
    '--init-vault',
    '--bundle', 'C:\\Users\\Alice\\secret-token\\bundle.json',
    '--subject', 'alice@example.invalid',
    '--display-name', 'Alice Secret',
  ], {
    platform: 'win32',
    nodeVersion: '24.2.0',
    cwd: 'C:\\Users\\Alice\\enigma',
    execFileImpl: async () => {
      throw new Error('dry-run must not execute commands');
    },
  });

  const serialized = JSON.stringify(result);
  assert.equal(result.public_safe, true);
  assert.equal(result.commands[0].command, 'npm');
  assert.equal(result.preview.commands[0].command, 'npm');
  assert.deepEqual(result.preview.commands, result.commands);
  assert.equal(result.commands[1].command, 'enigma');
  assert.equal(result.preview.commands[1].command, 'enigma');
  assert.deepEqual(result.commands[1].args, ['init', '--bundle', '<bundle-path>', '--subject', '<subject>', '--display-name', '<display-name>']);
  assert.equal(result.bundle.path, '<bundle-path>');
  assert.doesNotMatch(serialized, /Alice|secret-token|alice@example|C:\\Users/i);
  assert.doesNotMatch(serialized, /Bearer|password|token_value/i);
});
