import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  BROWSER_EXTENSION_PACKAGE_SCHEMA,
  buildBrowserExtensionPackage,
  renderBrowserExtensionPackagePlain,
  runPackageBrowserExtension,
  validateBrowserExtensionPackage,
} from '../scripts/package-browser-extension.mjs';

async function writeFixtureExtension(options = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-browser-extension-package-'));
  await mkdir(join(dir, 'src'), { recursive: true });
  const manifest = {
    manifest_version: 3,
    name: 'Enigma Local Memory Bridge',
    version: '0.1.0',
    description: 'Explicit user-approved Enigma context insertion with local-only transfer and no browser sync storage.',
    permissions: options.permissions ?? ['nativeMessaging', 'activeTab'],
    host_permissions: ['https://chatgpt.com/*'],
    background: { service_worker: options.background ?? 'src/background.js', type: 'module' },
    content_scripts: [{ matches: ['https://chatgpt.com/*'], js: ['src/content-script.js'], run_at: 'document_idle' }],
    action: { default_title: 'Enigma local memory' },
    minimum_chrome_version: '116',
  };
  await writeFile(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  if (options.writeBackground !== false) await writeFile(join(dir, 'src/background.js'), "import { requestContextPack } from './native-bridge.js';\nvoid requestContextPack;\n", 'utf8');
  await writeFile(join(dir, 'src/native-bridge.js'), 'export function requestContextPack() { return null; }\n', 'utf8');
  await writeFile(join(dir, 'src/content-script.js'), 'document.documentElement.dataset.enigmaMemory = "available";\n', 'utf8');
  if (options.extraFile) await writeFile(join(dir, options.extraFile.path), options.extraFile.body, 'utf8');
  return dir;
}

test('browser extension package validates manifest and static module files', async () => {
  const dir = await writeFixtureExtension();
  const result = await validateBrowserExtensionPackage(dir);

  assert.equal(result.manifest.manifest_version, 3);
  assert.equal(result.manifest.permissions.includes('nativeMessaging'), true);
  assert.deepEqual(result.files.map((file) => file.path), [
    'manifest.json',
    'src/background.js',
    'src/content-script.js',
    'src/native-bridge.js',
  ]);
});

test('browser extension package rejects invalid manifests and forbidden files', async () => {
  const missing = await writeFixtureExtension({ background: 'src/missing.js' });
  await assert.rejects(() => validateBrowserExtensionPackage(missing), /Referenced extension file is missing: src\/missing\.js/);

  const storagePermission = await writeFixtureExtension({ permissions: ['nativeMessaging', 'storage'] });
  await assert.rejects(() => validateBrowserExtensionPackage(storagePermission), /must not request browser storage permission/);

  const sourceMap = await writeFixtureExtension({ extraFile: { path: 'src/background.js.map', body: '{}' } });
  await assert.rejects(() => validateBrowserExtensionPackage(sourceMap), /Forbidden private extension file: src\/background\.js\.map/);

  const privateFile = await writeFixtureExtension({ extraFile: { path: 'src/secret-token.txt', body: 'not packaged\n' } });
  await assert.rejects(() => validateBrowserExtensionPackage(privateFile), /Forbidden private extension file: src\/secret-token\.txt/);
});

test('browser extension package failure output does not leak tokens or local paths', async () => {
  const tokenDir = await writeFixtureExtension({
    extraFile: {
      path: 'src/leaky.js',
      body: 'const value = "Bearer sk_live_should_not_escape";\n',
    },
  });
  const tokenResult = await runPackageBrowserExtension(['--extension-dir', tokenDir]);
  const tokenSerialized = JSON.stringify(tokenResult);

  assert.equal(tokenResult.schema, BROWSER_EXTENSION_PACKAGE_SCHEMA);
  assert.equal(tokenResult.ok, false);
  assert.equal(tokenResult.public_safe, true);
  assert.equal(tokenResult.package.zip_written, false);
  assert.doesNotMatch(tokenSerialized, /sk_live_should_not_escape/i);
  assert.match(tokenResult.error.message, /Sensitive credential-shaped bearer value found in src\/leaky\.js/);

  const pathDir = await writeFixtureExtension({
    extraFile: {
      path: 'src/path-leak.js',
      body: 'const local = "C:\\Users\\Alice\\bundle.json";\n',
    },
  });
  const pathResult = await runPackageBrowserExtension(['--extension-dir', pathDir]);
  const pathSerialized = JSON.stringify(pathResult);

  assert.equal(pathResult.ok, false);
  assert.equal(pathResult.public_safe, true);
  assert.doesNotMatch(pathSerialized, /Alice|C:\\Users|bundle\.json/i);
  assert.match(pathResult.error.message, /Sensitive local Windows user path found in src\/path-leak\.js/);
});

test('browser extension package output and zip checksum are deterministic', async () => {
  const dir = await writeFixtureExtension();
  const outDir = await mkdtemp(join(tmpdir(), 'enigma-browser-extension-zip-'));
  const zipA = join(outDir, 'a.zip');
  const zipB = join(outDir, 'b.zip');

  const manifestA = await buildBrowserExtensionPackage({ extensionDir: dir });
  const manifestB = await buildBrowserExtensionPackage({ extensionDir: dir });
  assert.deepEqual(manifestA, manifestB);
  assert.equal(manifestA.package.zip_written, false);
  assert.equal(manifestA.package.zip_compatible_manifest, true);

  const packageA = await buildBrowserExtensionPackage({ extensionDir: dir, zipPath: zipA });
  const packageB = await buildBrowserExtensionPackage({ extensionDir: dir, zipPath: zipB });
  assert.equal(packageA.package.zip_written, true);
  assert.equal(packageA.package.zip_path, '<zip-output>');
  assert.equal(packageA.package.zip_sha256, packageB.package.zip_sha256);
  assert.deepEqual(await readFile(zipA), await readFile(zipB));

  const plainResult = await runPackageBrowserExtension(['--extension-dir', dir, '--zip', join(outDir, 'plain.zip'), '--plain']);
  const plain = renderBrowserExtensionPackagePlain(plainResult);
  assert.match(plain, /^Enigma browser extension package\n/);
  assert.match(plain, /Status: Ready/);
  assert.match(plain, /ZIP: written/);
  assert.match(plain, /Boundary: local package validation only/);
  assert.doesNotMatch(plain, new RegExp(dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.deepEqual(packageA.package.deterministic_order, [
    'manifest.json',
    'src/background.js',
    'src/content-script.js',
    'src/native-bridge.js',
  ]);
});

test('browser and native-host docs show dry-run MCP setup before manual JSON fallback', async () => {
  const docs = await Promise.all([
    readFile(new URL('../apps/browser-extension/README.md', import.meta.url), 'utf8'),
    readFile(new URL('../apps/native-host/README.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/browser-extension-install.md', import.meta.url), 'utf8'),
    readFile(new URL('../packages/mcp-server/README.md', import.meta.url), 'utf8'),
  ]);
  const mcpContract = await readFile(new URL('../packages/mcp-server/PACKAGE_CONTRACT.md', import.meta.url), 'utf8');
  for (const doc of docs) {
    assert.match(doc, /npm install -g enigma-memory/);
    assert.match(doc, /enigma quickstart --bundle \.\/\.enigma\/bundle\.json/);
    assert.match(doc, /enigma claude-mcpb package --mcpb \.\/\.enigma\/claude\/enigma-memory\.mcpb/);
    assert.match(doc, /enigma connect cursor --bundle \.\/\.enigma\/bundle\.json --dry-run/);
    assert.match(doc, /enigma connect kimi-code --bundle \.\/\.enigma\/bundle\.json --dry-run/);
    assert.match(doc, /enigma connect vscode-cline --bundle \.\/\.enigma\/bundle\.json --dry-run/);
    assert.doesNotMatch(doc, /enigma connect claude-desktop/);
    assert.doesNotMatch(doc, /setup --client .*--overwrite/);
    assert.doesNotMatch(doc, /connect-installed --overwrite/);
  }
  assert.match(mcpContract, /enigma connect <id> --bundle \.\/\.enigma\/bundle\.json --dry-run/);
  assert.doesNotMatch(mcpContract, /setup --client <id> --write-connectors --overwrite/);
});
