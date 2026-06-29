import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  INSTALLER_ASSET_SCHEMA,
  buildInstallerAssets,
  nativeInstallerBlockers,
  parseInstallerAssetArgs,
  renderInstallerAssetsPlain,
  runBuildInstallerAssets,
} from '../scripts/build-installer-assets.mjs';
import {
  TRAY_ACTION_TYPES,
  connectClients,
  createTrayMenu,
  createTrayState,
  openDocs,
  quitTray,
  reduceTrayState,
  runDiagnostics,
  runQuickstart,
  trayActionIntent,
  trayStatus,
} from '../apps/desktop/src/tray.js';

const LOCAL_OR_SECRET_RE = /(?:C:\\Users\\|C:\\tmp\\|\/Users\/|\/home\/|\/tmp\/|Bearer\s+|ghp_[A-Za-z0-9_]{16,}|npm_[A-Za-z0-9_-]{24,}|api[_-]?key|password\s*[=:]|token\s*[=:]|raw memory plaintext)/i;

function publicJson(value) {
  const copy = { ...value };
  delete copy.assets;
  return JSON.stringify(copy);
}

function assetByPath(result, path) {
  return result.assets.find((asset) => asset.path === path);
}

function codePointSorted(paths) {
  return [...paths].sort();
}

test('installer asset generator returns deterministic public manifest in dry-run mode', () => {
  const first = buildInstallerAssets({ outDir: 'tmp/private-output' });
  const second = buildInstallerAssets({ outDir: 'another-output' });

  assert.equal(first.schema, INSTALLER_ASSET_SCHEMA);
  assert.equal(first.mode, 'dry-run');
  assert.equal(first.dry_run, true);
  assert.equal(first.public_safe, true);
  assert.equal(first.output_dir, '<requested-output-dir>');
  assert.equal(first.generated_native_installers, false);
  const expectedFilePaths = codePointSorted([
    'homebrew/enigma-memory.rb',
    'install-linux.sh',
    'install-windows.ps1',
    'macos-pkgbuild/README.md',
    'macos-pkgbuild/manifest.json',
  ]);
  assert.deepEqual(first.files, second.files);
  assert.deepEqual(first.files.map((file) => file.path), expectedFilePaths);
  assert.deepEqual(first.assets.map((asset) => asset.path), codePointSorted([...expectedFilePaths, 'installer-assets-manifest.json']));
  assert.deepEqual(first.assets.map((asset) => [asset.path, asset.sha256]), second.assets.map((asset) => [asset.path, asset.sha256]));
  const manifestContent = assetByPath(first, 'installer-assets-manifest.json').content;
  const manifest = JSON.parse(manifestContent);
  assert.equal(manifestContent.includes('"sha256"'), true);
  assert.equal(manifest.output_dir, '<requested-output-dir>');
  assert.equal(manifest.installer_smoke.next_client_connect, 'enigma connect <client> --bundle ./.enigma/bundle.json --dry-run');
  assert.deepEqual(manifest.installer_smoke.mutation_requires, ['--execute', '-Execute']);
  assert.equal(manifest.safety.embeds_account_ids, false);
  assert.equal(manifest.safety.embeds_provider_responses, false);
  assert.equal(manifest.safety.embeds_private_keys, false);
  assert.doesNotMatch(manifestContent, LOCAL_OR_SECRET_RE);
  assert.doesNotMatch(publicJson(first), LOCAL_OR_SECRET_RE);
});

test('installer asset plain output is readable and claim-bounded', () => {
  const result = buildInstallerAssets({ outDir: 'private-output' });
  const publicResult = { ...result };
  delete publicResult.assets;
  const plain = renderInstallerAssetsPlain(publicResult);

  assert.match(plain, /^Enigma installer assets\n/);
  assert.match(plain, /Status: Ready/);
  assert.match(plain, /Version: 0\.1\.19/);
  assert.match(plain, /Mode: dry-run/);
  assert.match(plain, /Native installers generated: no/);
  assert.match(plain, /Source assets only: yes/);
  assert.match(plain, /Asset: install-linux\.sh/);
  assert.match(plain, /Boundary: public-safe source installer assets only/);
  assert.doesNotMatch(plain, /^\s*\{/);
  assert.doesNotMatch(plain, /private-output|C:\\Users\\|\/home\/|raw_memory|api[_-]?key|password/i);
});

test('installer scripts are source installers with safe dry-run defaults', () => {
  const result = buildInstallerAssets();
  const windows = assetByPath(result, 'install-windows.ps1').content;
  const linux = assetByPath(result, 'install-linux.sh').content;
  const formula = assetByPath(result, 'homebrew/enigma-memory.rb').content;
  const macosManifest = JSON.parse(assetByPath(result, 'macos-pkgbuild/manifest.json').content);

  assert.match(windows, /Dry-run is the default/);
  assert.match(windows, /param\(/);
  assert.match(windows, /-Execute/);
  assert.match(windows, /if \(-not \$Execute\)/);
  assert.match(windows, /npm install -g enigma-memory/);
  assert.match(windows, /enigma test-drive --dry-run/);
  assert.match(windows, /enigma quickstart --bundle <bundle>/);
  assert.match(windows, /enigma doctor --bundle <bundle>/);
  assert.match(windows, /\$NextClientConnect = 'enigma connect <client> --bundle <bundle> --dry-run'/);
  assert.doesNotMatch(windows, /Invoke-WebRequest|curl|Start-BitsTransfer|signtool/i);

  assert.match(linux, /Dry-run is the default/);
  assert.match(linux, /--execute/);
  assert.match(linux, /if \[ "\$execute" -ne 1 \]/);
  assert.match(linux, /npm install -g enigma-memory/);
  assert.match(linux, /enigma test-drive --dry-run/);
  assert.match(linux, /enigma quickstart --bundle <bundle>/);
  assert.match(linux, /enigma doctor --bundle <bundle>/);
  assert.match(linux, /Next client-connect preview: \$next_client_connect/);
  assert.doesNotMatch(linux, /curl|wget|sudo|\.deb|\.rpm/i);

  assert.match(formula, /Draft only/);
  assert.match(formula, /REPLACE_WITH_RELEASE_TARBALL_SHA256/);
  assert.match(formula, /enigma test-drive --dry-run/);
  assert.match(formula, /enigma quickstart --bundle \.\/\.enigma\/bundle\.json/);
  assert.match(formula, /enigma doctor --bundle \.\/\.enigma\/bundle\.json/);
  assert.match(formula, /enigma connect <client> --bundle \.\/\.enigma\/bundle\.json --dry-run/);
  assert.doesNotMatch(formula, /enigma setup\b/);
  assert.equal(macosManifest.generated_native_pkg, false);
  assert.equal(macosManifest.source_only, true);
  assert.equal(macosManifest.package_id, '<reverse-dns-package-id>');
  assert.deepEqual(macosManifest.commands, [
    ['npm', 'install', '-g', 'enigma-memory'],
    ['enigma', 'test-drive', '--dry-run'],
    ['enigma', 'quickstart', '--bundle', './.enigma/bundle.json'],
    ['enigma', 'doctor', '--bundle', './.enigma/bundle.json'],
  ]);
  assert.deepEqual(macosManifest.next_client_connect, ['enigma', 'connect', '<client>', '--bundle', './.enigma/bundle.json', '--dry-run']);
  assert.deepEqual(macosManifest.execution_gate.mutation_requires, ['--execute', '-Execute']);
  assert.deepEqual(result.installer_smoke.default_preview_commands, [
    'npm install -g enigma-memory',
    'enigma test-drive --dry-run',
    'enigma quickstart --bundle ./.enigma/bundle.json',
    'enigma doctor --bundle ./.enigma/bundle.json',
  ]);
  assert.equal(result.installer_smoke.next_client_connect, 'enigma connect <client> --bundle ./.enigma/bundle.json --dry-run');
  assert.deepEqual(result.installer_smoke.mutation_requires, ['--execute', '-Execute']);
  for (const asset of result.assets) {
    assert.doesNotMatch(asset.content, /enigma setup --(?:bundle <bundle> )?--overwrite/, asset.path);
  }

  for (const asset of result.assets) assert.doesNotMatch(asset.content, LOCAL_OR_SECRET_RE, asset.path);
});

test('installer assets expose native .exe and .pkg blockers when tooling is absent', () => {
  const blockers = nativeInstallerBlockers({});
  assert.equal(blockers.windows_exe.generated, false);
  assert.equal(blockers.windows_exe.available, false);
  assert.equal(blockers.macos_pkg.generated, false);
  assert.equal(blockers.macos_pkg.available, false);
  assert.deepEqual(blockers.windows_exe.blockers.map((item) => item.code), [
    'WINDOWS_EXE_BUILDER_REQUIRED',
    'WINDOWS_CODE_SIGNING_REQUIRED',
  ]);
  assert.deepEqual(blockers.macos_pkg.blockers.map((item) => item.code), [
    'MACOS_PKGBUILD_TOOLING_REQUIRED',
    'MACOS_SIGNING_REQUIRED',
  ]);

  const result = buildInstallerAssets();
  assert.equal(result.native_installers.windows_exe.available, false);
  assert.equal(result.native_installers.macos_pkg.available, false);
  assert.match(JSON.stringify(result.native_installers), /code-signing|Developer ID Installer|pkgbuild\/productbuild/);
});

test('installer CLI writes requested source assets only with explicit write mode', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-installer-assets-'));
  let stdout = '';
  let stderr = '';
  const dryRunCode = await runBuildInstallerAssets(['--out-dir', dir], {
    stdout: { write: (chunk) => { stdout += chunk; } },
    stderr: { write: (chunk) => { stderr += chunk; } },
  });
  assert.equal(dryRunCode, 0, stderr);
  assert.equal(JSON.parse(stdout).dry_run, true);

  stdout = '';
  stderr = '';
  const writeCode = await runBuildInstallerAssets(['--out-dir', dir, '--write'], {
    stdout: { write: (chunk) => { stdout += chunk; } },
    stderr: { write: (chunk) => { stderr += chunk; } },
  });
  assert.equal(writeCode, 0, stderr);
  const summary = JSON.parse(stdout);
  assert.equal(summary.mode, 'write');

  const manifest = JSON.parse(await readFile(join(dir, 'installer-assets-manifest.json'), 'utf8'));
  assert.equal(manifest.schema, INSTALLER_ASSET_SCHEMA);
  assert.equal(manifest.output_dir, '<requested-output-dir>');
  assert.deepEqual(manifest.files, summary.files);
  assert.equal((await readFile(join(dir, 'install-linux.sh'), 'utf8')).includes('npm install -g enigma-memory'), true);

  let plainStdout = '';
  stderr = '';
  const plainCode = await runBuildInstallerAssets(['--out-dir', dir, '--plain'], {
    stdout: { write: (chunk) => { plainStdout += chunk; } },
    stderr: { write: (chunk) => { stderr += chunk; } },
  });
  assert.equal(plainCode, 0);
  assert.equal(stderr, '');
  assert.match(plainStdout, /^Enigma installer assets\n/);
  assert.match(plainStdout, /Mode: dry-run/);
  assert.match(plainStdout, /Boundary: public-safe source installer assets only/);
  assert.doesNotMatch(plainStdout, /^\s*\{/);
  assert.equal(plainStdout.includes(dir), false);

  assert.throws(() => parseInstallerAssetArgs(['--out-dir', '../leak']), /parent-directory traversal/);
  assert.throws(() => parseInstallerAssetArgs(['--dry-run', '--write']), /either --dry-run or --write/);
});

test('desktop tray module is a pure model of status and menu actions', () => {
  const state = createTrayState({ status: 'ready', connectedClients: ['cursor'], diagnosticsStatus: 'passed' });
  const menu = createTrayMenu(state);

  assert.equal(state.model_only, true);
  assert.equal(state.native_tray_started, false);
  assert.equal(menu.model_only, true);
  assert.equal(menu.native_tray_started, false);
  assert.deepEqual(menu.items.map((item) => item.action), [
    TRAY_ACTION_TYPES.STATUS,
    TRAY_ACTION_TYPES.QUICKSTART,
    TRAY_ACTION_TYPES.CONNECT_CLIENTS,
    TRAY_ACTION_TYPES.OPEN_DOCS,
    TRAY_ACTION_TYPES.RUN_DIAGNOSTICS,
    '',
    TRAY_ACTION_TYPES.QUIT,
  ]);
  assert.equal(menu.items.find((item) => item.id === 'status').enabled, false);
  assert.equal(menu.items.find((item) => item.id === 'connect-clients').label, 'Connect clients (1)');

  assert.deepEqual(trayStatus('offline'), { type: 'tray/status', status: 'offline' });
  assert.deepEqual(runQuickstart({ bundle: './.enigma/bundle.json' }), { type: 'tray/quickstart', bundle: './.enigma/bundle.json', overwrite: true });
  assert.deepEqual(connectClients(['cursor', 'unknown']), { type: 'tray/connect-clients', clients: ['cursor'] });
  assert.deepEqual(openDocs(''), { type: 'tray/open-docs', url: 'https://docs.enigmaprotocol.net/docs/install' });
  assert.deepEqual(runDiagnostics(), { type: 'tray/run-diagnostics', scope: 'local' });
  assert.deepEqual(quitTray(), { type: 'tray/quit', quit_requested: true });

  const next = reduceTrayState(state, connectClients(['claude-desktop', 'browser-bridge']));
  assert.equal(next.connected_client_count, 2);
  assert.equal(reduceTrayState(next, quitTray()).quit_requested, true);
  assert.deepEqual(trayActionIntent(runDiagnostics()), { kind: 'run_diagnostics', command: 'enigma', args: ['doctor'], side_effect: 'caller-owned' });
});
