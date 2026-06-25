import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_REGISTRY_VERSION,
  REGISTRY_INSTALL_SCHEMA,
  buildRegistryInstallPlan,
  parseRegistryInstallArgs,
  redactPublicPath,
  registryInstallCliOutput,
  runRegistryInstallVerification,
  summarizeRegistryInstallResult,
  validateCommandSpec,
  validatePackageName,
  validatePackageVersion,
} from '../scripts/verify-registry-install.mjs';

test('registry verifier defaults to public-safe dry-run command planning', async () => {
  let executed = false;
  const result = await runRegistryInstallVerification([], {
    nodeVersion: '24.1.0',
    platform: 'linux',
    cwd: '/operator/private/enigma',
    nodeCommand: '/operator/private/node/bin/node',
    execFileImpl: async () => {
      executed = true;
      throw new Error('dry-run must not execute commands');
    },
  });

  assert.equal(executed, false);
  assert.equal(result.schema, REGISTRY_INSTALL_SCHEMA);
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'dry-run');
  assert.equal(result.dry_run, true);
  assert.equal(result.execute, false);
  assert.equal(result.skip_network, false);
  assert.deepEqual(result.commands.map((command) => command.status), ['preview', 'preview', 'preview', 'preview', 'preview']);
  assert.deepEqual(result.commands[0], {
    step: 'install_package',
    command: 'npm',
    args: ['install', '--prefix', '<temp-prefix>', `enigma-memory@${DEFAULT_REGISTRY_VERSION}`],
    status: 'preview',
    network: true,
  });
  assert.deepEqual(result.commands.slice(1).map((command) => [command.command, command.args]), [
    ['enigma', ['--help']],
    ['enigma', ['doctor']],
    ['enigma-relay', ['demo']],
    ['enigma-gateway', ['demo']],
  ]);
  assert.deepEqual(registryInstallCliOutput(result), result.commands);
  assert.equal(JSON.stringify(result).includes('/operator/private'), false);
});

test('registry verifier skip-network validates the plan without running commands', async () => {
  let calls = 0;
  const result = await runRegistryInstallVerification(['--execute', '--skip-network', '--tmp-dir', '/operator/private/tmp'], {
    nodeVersion: '24.0.0',
    platform: 'linux',
    cwd: '/operator/private/enigma',
    nodeCommand: '/operator/private/node/bin/node',
    execFileImpl: async () => {
      calls += 1;
      throw new Error('skip-network must not execute commands');
    },
  });

  assert.equal(calls, 0);
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'skip-network');
  assert.equal(result.execute, true);
  assert.equal(result.skip_network, true);
  assert.deepEqual(result.commands.map((command) => command.status), ['validated', 'validated', 'validated', 'validated', 'validated']);
  assert.equal(result.safety.skip_network_runs_no_commands, true);
  assert.doesNotMatch(JSON.stringify(result), /operator|private|node\/bin|tmp/u);
});

test('registry verifier validates package names, versions, and command shapes', () => {
  assert.equal(parseRegistryInstallArgs(['--package', '@scope/enigma-memory', '--version', '1.2.3']).packageName, '@scope/enigma-memory');
  assert.equal(validatePackageName('enigma-memory'), 'enigma-memory');
  assert.equal(validatePackageVersion('1.2.3-beta.1+build.5'), '1.2.3-beta.1+build.5');
  assert.throws(() => parseRegistryInstallArgs(['--dry-run', '--execute']), /either --dry-run or --execute/);
  assert.throws(() => parseRegistryInstallArgs(['--package']), /Missing value for --package/);
  assert.throws(() => validatePackageName('Enigma-Memory'), /deterministic npm package name/);
  assert.throws(() => validatePackageName('enigma memory'), /deterministic npm package name/);
  assert.throws(() => validatePackageVersion('latest'), /exact semver/);
  assert.throws(() => validatePackageVersion('1.2'), /exact semver/);
  assert.throws(() => validateCommandSpec({ kind: 'npm_install', command: 'npm', args: ['install', 'enigma-memory'] }), /exactly npm install --prefix/);
  assert.throws(() => validateCommandSpec({ kind: 'bin_check', step: 'check_curl', bin: 'curl', command: 'curl', args: ['https://example.invalid'] }), /allowlisted/);
  assert.equal(redactPublicPath('/operator/private/tmp/bin/enigma', [{ path: '/operator/private/tmp', label: '<temp-prefix>' }]), '<temp-prefix>/bin/enigma');
  assert.equal(redactPublicPath('C:\\Users\\Alice\\AppData\\Local\\Temp'), '<absolute-path>');
});

test('registry verifier execute mode is injectable and never copies command output', async () => {
  const calls = [];
  const result = await runRegistryInstallVerification(['--execute', '--tmp-dir', './registry-smoke'], {
    nodeVersion: '24.2.0',
    platform: 'linux',
    cwd: '/operator/private/enigma',
    nodeCommand: '/operator/private/node/bin/node',
    mkdirImpl: async () => undefined,
    execFileImpl: async (command, args, options) => {
      calls.push({ command, args, windowsHide: options.windowsHide });
      return { stdout: 'raw memory: do not copy', stderr: 'Bearer token_value and /operator/private/enigma' };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, 'execute');
  assert.equal(calls.length, 5);
  assert.equal(calls[0].command, 'npm');
  assert.deepEqual(calls[0].args.slice(0, 2), ['install', '--prefix']);
  assert.equal(calls[0].args[3], `enigma-memory@${DEFAULT_REGISTRY_VERSION}`);
  assert.equal(calls[0].windowsHide, true);
  assert.deepEqual(calls.slice(1).map((call) => call.command), [
    '/operator/private/node/bin/node',
    '/operator/private/node/bin/node',
    '/operator/private/node/bin/node',
    '/operator/private/node/bin/node',
  ]);
  assert.ok(calls[1].args[0].includes('node_modules'));
  assert.ok(calls[1].args[0].includes('apps'));
  assert.deepEqual(calls[1].args.slice(1), ['--help']);
  assert.deepEqual(calls[2].args.slice(1), ['doctor']);
  assert.deepEqual(calls[3].args.slice(1), ['demo']);
  assert.deepEqual(calls[4].args.slice(1), ['demo']);
  assert.deepEqual(result.commands.map((command) => command.status), ['passed', 'passed', 'passed', 'passed', 'passed']);

  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /raw memory|Bearer|token_value|operator|private|node\/bin/u);
});

test('registry verifier summary reports skipped checks after a failed command without leaking paths', () => {
  const plan = buildRegistryInstallPlan({ execute: true, tmpDir: '/operator/private/tmp' }, {
    platform: 'linux',
    cwd: '/operator/private/enigma',
    nodeCommand: '/operator/private/node/bin/node',
  });
  const result = summarizeRegistryInstallResult(plan, [
    { step: 'install_package', ok: true, exitCode: 0, stdout: 'ignored body' },
    { step: 'check_enigma_help', ok: false, exitCode: 1, stderr: '/operator/private/tmp and raw memory' },
  ], { ok: true, required: '>=24', current_major: 24 });

  assert.equal(result.ok, false);
  assert.deepEqual(result.commands.map((command) => command.status), ['passed', 'failed', 'skipped', 'skipped', 'skipped']);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /operator|private|ignored body|raw memory/u);
});
