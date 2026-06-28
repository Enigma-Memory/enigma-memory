import { createHash, generateKeyPairSync } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { promisify } from 'node:util';
import { buildDesktopReleaseEvidence, parseArgs, runReleaseEvidenceDesktop } from '../scripts/release-evidence-desktop.mjs';
import { signManifest } from '../scripts/sign-update-manifest.mjs';
const execFileAsync = promisify(execFile);
const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const SCRIPT = resolve(PROJECT_ROOT, 'scripts', 'release-evidence-desktop.mjs');
const DEFAULT_TAURI_CONFIG = resolve(PROJECT_ROOT, 'apps', 'desktop-tauri', 'tauri.conf.json');

const SECRET_RE = /(?:bearer\s+[A-Za-z0-9._~+/=-]+|ghp_[A-Za-z0-9_]{16,}|npm_[A-Za-z0-9_-]{24,}|api[_-]?key\s*[=:]|password\s*[=:]|token\s*[=:])/iu;
const WINDOWS_ABSOLUTE_RE = /[A-Za-z]:[\\/](?:Users|tmp|Temp|Windows|ProgramData|Program Files)[\\/]/u;
const POSIX_ABSOLUTE_RE = /(?:^|[\s"'`=:(])\/(?:Users|home|tmp|var|private|mnt|Volumes)\//u;

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'enigma-release-evidence-desktop-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function withTempDirAsync(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'enigma-release-evidence-desktop-'));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function assertPublicSafe(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  assert.doesNotMatch(text, SECRET_RE, 'output contains a possible secret/token pattern');
  assert.doesNotMatch(text, WINDOWS_ABSOLUTE_RE, 'output contains an absolute Windows local path');
  assert.doesNotMatch(text, POSIX_ABSOLUTE_RE, 'output contains an absolute POSIX local path');
}

test('parseArgs recognizes installer, manifest, artifacts-dir, and dry-run flags', () => {
  const args = parseArgs([
    '--windows-installer', 'dist/app.exe',
    '--macos-installer', 'dist/app.dmg',
    '--manifest', 'dist/manifest.json',
    '--manifest-sig', 'dist/manifest.json.sig',
    '--artifacts-dir', 'dist/artifacts',
    '--out', 'dist/evidence.json',
    '--dry-run',
    '--write',
  ]);
  assert.equal(args.windowsInstaller, 'dist/app.exe');
  assert.equal(args.macosInstaller, 'dist/app.dmg');
  assert.equal(args.manifest, 'dist/manifest.json');
  assert.equal(args.manifestSig, 'dist/manifest.json.sig');
  assert.equal(args.artifactsDir, 'dist/artifacts');
  assert.equal(args.out, 'dist/evidence.json');
  assert.equal(args.dryRun, true);
  assert.equal(args.write, true);
});

test('buildDesktopReleaseEvidence dry-run emits valid public-safe JSON without artifacts', () => {
  const record = buildDesktopReleaseEvidence({});
  assert.equal(record.schema, 'enigma.desktop_release_evidence.v1');
  assert.ok(/^[0-9a-f]{32}$/.test(record.evidence_id));
  assert.ok(!Number.isNaN(Date.parse(record.generated_at)));
  assert.equal(record.artifact_count, 0);
  assert.deepEqual(record.artifacts, []);
  assert.equal(record.installers.length, 2);
  assert.equal(record.installers[0].platform, 'windows');
  assert.equal(record.installers[1].platform, 'macos');
  assert.equal(record.installers[0].present, false);
  assert.equal(record.installers[1].present, false);
  assert.ok(record.blockers.length > 0, 'blockers should list missing artifacts');
  assert.ok(record.next_steps.length > 0, 'next steps should guide artifact provision');
  assert.ok(['pending_azure_setup', 'ci_identity_references_present'].includes(record.signing_evidence.windows.status));
  assert.ok(['pending_apple_enrollment', 'ci_identity_reference_present'].includes(record.signing_evidence.macos.status));
  assertPublicSafe(record);
});

test('buildDesktopReleaseEvidence uses repo Tauri updater public key when present', () => {
  if (!existsSync(DEFAULT_TAURI_CONFIG)) return;

  const tauriConfig = JSON.parse(readFileSync(DEFAULT_TAURI_CONFIG, 'utf8'));
  const updater = tauriConfig.plugins?.updater ?? tauriConfig.tauri?.updater ?? null;
  const publicKey = typeof updater?.pubkey === 'string' && updater.pubkey.trim().length > 0
    ? updater.pubkey.trim()
    : null;
  const record = buildDesktopReleaseEvidence({});

  assert.equal(record.signing_evidence.updater.config_path, 'apps/desktop-tauri/tauri.conf.json');
  assert.equal(record.signing_evidence.updater.public_key, publicKey);
  assert.equal(record.signing_evidence.updater.configured, publicKey !== null);
  assert.equal(record.signing_evidence.updater.key_custody, 'CI-secret-only; the private updater key is injected at release time and never written to public evidence.');
  assertPublicSafe(record);
});

test('buildDesktopReleaseEvidence reads updater public key evidence from Tauri config', () => {
  withTempDir((dir) => {
    const tauriConfigPath = join(dir, 'tauri.conf.json');
    const publicKey = 'dGVzdC11cGRhdGVyLXB1YmxpYy1rZXk=';
    writeFileSync(tauriConfigPath, JSON.stringify({
      plugins: {
        updater: {
          active: true,
          dialog: true,
          endpoints: ['{{env:UPDATER_MANIFEST_URL}}'],
          pubkey: publicKey,
        },
      },
    }, null, 2));

    const record = buildDesktopReleaseEvidence({ tauriConfigPath });

    assert.equal(record.signing_evidence.updater.configured, true);
    assert.equal(record.signing_evidence.updater.status, 'configured_from_tauri_config');
    assert.equal(record.signing_evidence.updater.config_path, 'tauri.conf.json');
    assert.equal(record.signing_evidence.updater.source_field, 'plugins.updater.pubkey');
    assert.equal(record.signing_evidence.updater.public_key, publicKey);
    assert.equal(record.signing_evidence.updater.endpoint_count, 1);
    assert.equal(record.signing_evidence.updater.key_custody, 'CI-secret-only; the private updater key is injected at release time and never written to public evidence.');
    assert.doesNotMatch(JSON.stringify(record.signing_evidence.updater), /placeholder/i);
    assertPublicSafe(record);
  });
});

test('buildDesktopReleaseEvidence blocks release when Tauri updater public key is missing', () => {
  withTempDir((dir) => {
    const tauriConfigPath = join(dir, 'tauri.conf.json');
    writeFileSync(tauriConfigPath, JSON.stringify({
      plugins: {
        updater: {
          active: true,
          endpoints: ['{{env:UPDATER_MANIFEST_URL}}'],
        },
      },
    }, null, 2));

    const record = buildDesktopReleaseEvidence({ tauriConfigPath });

    assert.equal(record.signing_evidence.updater.configured, false);
    assert.equal(record.signing_evidence.updater.status, 'missing_public_key');
    assert.equal(record.signing_evidence.updater.public_key, null);
    assert.ok(record.blockers.some((blocker) => blocker.includes('Tauri updater public key')));
    assert.ok(record.next_steps.some((step) => step.includes('apps/desktop-tauri/tauri.conf.json') && step.includes('CI-secret-only')));
    assertPublicSafe(record);
  });
});

test('buildDesktopReleaseEvidence records SHA-256 checksums and signature status for signed installers', async () => {
  await withTempDirAsync(async (dir) => {
    const windowsInstaller = join(dir, 'Enigma-Setup.exe');
    const macosInstaller = join(dir, 'Enigma-1.0.0.dmg');
    const manifestPath = join(dir, 'manifest.json');
    const manifestText = JSON.stringify({ version: '1.0.0', platforms: { 'windows-x86_64': { signature: 'abc' } } }, null, 2);
    writeFileSync(windowsInstaller, Buffer.from('windows installer bytes', 'utf8'));
    writeFileSync(macosInstaller, Buffer.from('macos installer bytes', 'utf8'));
    writeFileSync(manifestPath, manifestText);

    const { privateKey } = generateKeyPairSync('ed25519');
    const sigRecord = signManifest(manifestPath, privateKey);
    writeFileSync(`${manifestPath}.sig`, JSON.stringify(sigRecord, null, 2));

    const record = buildDesktopReleaseEvidence({
      windowsInstaller,
      macosInstaller,
      manifest: manifestPath,
      artifactsDir: dir,
    });

    assert.equal(record.installers[0].present, true);
    assert.equal(record.installers[0].sha256, createHash('sha256').update(Buffer.from('windows installer bytes', 'utf8')).digest('hex'));
    assert.equal(record.installers[0].bytes, Buffer.byteLength('windows installer bytes', 'utf8'));
    assert.equal(record.installers[0].signature.status, 'file_present_unverified');
    assert.equal(record.installers[0].signature.method, 'Azure Artifact Signing');

    assert.equal(record.installers[1].present, true);
    assert.equal(record.installers[1].sha256, createHash('sha256').update(Buffer.from('macos installer bytes', 'utf8')).digest('hex'));
    assert.equal(record.installers[1].signature.status, 'file_present_unverified');
    assert.equal(record.installers[1].signature.method, 'Apple Developer ID + Notary');

    assert.equal(record.manifest.version, '1.0.0');
    assert.equal(record.manifest.sha256, createHash('sha256').update(manifestText, 'utf8').digest('hex'));
    assert.equal(record.manifest.signature.status, 'verified');
    assert.equal(record.manifest.signature.signature_file_present, true);
    assert.ok(record.artifact_count >= 3);

    assertPublicSafe(record);
    assert.equal(record.installers[0].path, 'Enigma-Setup.exe');
    assert.equal(record.installers[1].path, 'Enigma-1.0.0.dmg');
    assert.equal(record.manifest.path, 'manifest.json');
    assert.equal(record.manifest.signature.signature_file, 'manifest.json.sig');
  });
});

test('buildDesktopReleaseEvidence records signing identity presence from env vars without leaking identifiers or secrets', async () => {
  await withTempDirAsync(async (dir) => {
    const previousEnv = { ...process.env };
    process.env.AZURE_CODESIGN_ACCOUNT_NAME = 'enigma-test-account';
    process.env.AZURE_CODESIGN_CERT_PROFILE_NAME = 'enigma-test-profile';
    process.env.AZURE_CODESIGN_ENDPOINT = 'https://eus.codesigning.azure.net';
    process.env.AZURE_CLIENT_ID = 'client-id-value';
    process.env.AZURE_TENANT_ID = 'tenant-id-value';
    process.env.AZURE_CLIENT_SECRET = 'super-secret-should-not-appear';
    process.env.APPLE_TEAM_ID = 'TEAM123456';
    process.env.APPLE_CERTIFICATE = 'base64-cert-value';
    process.env.APPLE_PASSWORD = 'apple-password-secret';

    try {
      const windowsInstaller = join(dir, 'Enigma-Setup.exe');
      const macosInstaller = join(dir, 'Enigma.dmg');
      writeFileSync(windowsInstaller, 'windows');
      writeFileSync(macosInstaller, 'macos');

      const record = buildDesktopReleaseEvidence({
        windowsInstaller,
        macosInstaller,
        version: '0.1.18',
      });

      assert.equal(record.signing_evidence.windows.configured, true);
      assert.equal(record.signing_evidence.windows.account_name_present, true);
      assert.equal(record.signing_evidence.windows.cert_profile_name_present, true);
      assert.equal(record.signing_evidence.windows.endpoint_present, true);
      assert.equal(record.signing_evidence.windows.client_id_present, true);
      assert.equal(record.signing_evidence.windows.tenant_id_present, true);

      assert.equal(record.signing_evidence.macos.configured, true);
      assert.equal(record.signing_evidence.macos.team_id_present, true);
      assert.equal(record.signing_evidence.macos.certificate_present, true);

      assert.equal(record.installers[0].signature.configured, true);
      assert.equal(record.installers[1].signature.configured, true);

      const serialized = JSON.stringify(record);
      assert.doesNotMatch(serialized, /enigma-test-account/);
      assert.doesNotMatch(serialized, /enigma-test-profile/);
      assert.doesNotMatch(serialized, /eus\.codesigning\.azure\.net/);
      assert.doesNotMatch(serialized, /TEAM123456/);
      assert.doesNotMatch(serialized, /super-secret-should-not-appear/);
      assert.doesNotMatch(serialized, /client-id-value/);
      assert.doesNotMatch(serialized, /tenant-id-value/);
      assert.doesNotMatch(serialized, /base64-cert-value/);
      assert.doesNotMatch(serialized, /apple-password-secret/);
      assertPublicSafe(record);
    } finally {
      Object.assign(process.env, previousEnv);
      for (const key of ['AZURE_CODESIGN_ACCOUNT_NAME', 'AZURE_CODESIGN_CERT_PROFILE_NAME', 'AZURE_CODESIGN_ENDPOINT', 'AZURE_CLIENT_ID', 'AZURE_TENANT_ID', 'AZURE_CLIENT_SECRET', 'APPLE_TEAM_ID', 'APPLE_CERTIFICATE', 'APPLE_PASSWORD']) {
        if (!(key in previousEnv)) delete process.env[key];
      }
    }
  });
});

test('buildDesktopReleaseEvidence records missing entries when artifacts are absent', () => {
  const record = buildDesktopReleaseEvidence({
    windowsInstaller: 'does-not-exist.exe',
    macosInstaller: 'does-not-exist.dmg',
    manifest: 'does-not-exist.json',
  });
  assert.equal(record.installers[0].present, false);
  assert.equal(record.installers[1].present, false);
  assert.equal(record.manifest, null);
  assert.ok(record.blockers.some((b) => b.includes('Windows installer')));
  assert.ok(record.blockers.some((b) => b.includes('macOS installer')));
  assert.ok(record.blockers.some((b) => b.includes('updater manifest')));
  assertPublicSafe(record);
});

test('CLI dry-run produces valid public-safe JSON', async () => {
  const { stdout, stderr } = await execFileAsync(process.execPath, [SCRIPT, '--dry-run'], {
    cwd: PROJECT_ROOT,
    windowsHide: true,
  });
  assert.equal(stderr.trim(), '');
  const record = JSON.parse(stdout);
  assert.equal(record.schema, 'enigma.desktop_release_evidence.v1');
  assert.ok(record.blockers.length > 0);
  assertPublicSafe(record);
});

test('CLI with artifacts-dir produces evidence containing artifact hashes', async () => {
  await withTempDirAsync(async (dir) => {
    writeFileSync(join(dir, 'README.txt'), 'hello');
    const { stdout, stderr } = await execFileAsync(process.execPath, [SCRIPT, '--artifacts-dir', dir, '--dry-run'], {
      cwd: PROJECT_ROOT,
      windowsHide: true,
    });
    assert.equal(stderr.trim(), '');
    const record = JSON.parse(stdout);
    assert.equal(record.artifact_count, 1);
    assert.equal(record.artifacts[0].name, 'README.txt');
    assert.equal(record.artifacts[0].sha256, createHash('sha256').update('hello', 'utf8').digest('hex'));
    assertPublicSafe(record);
  });
});

test('runReleaseEvidenceDesktop supports explicit dry-run output', async () => {
  await withTempDirAsync(async (dir) => {
    const out = join(dir, 'evidence.json');
    const originalStdoutWrite = process.stdout.write.bind(process.stdout);
    let captured = '';
    process.stdout.write = (chunk, encoding, callback) => {
      captured += chunk;
      if (typeof callback === 'function') callback();
      return true;
    };
    try {
      await runReleaseEvidenceDesktop(['--out', out, '--dry-run']);
    } finally {
      process.stdout.write = originalStdoutWrite;
    }
    const record = JSON.parse(captured);
    assert.equal(record.schema, 'enigma.desktop_release_evidence.v1');
    assert.equal(existsSync(out), false);
    assertPublicSafe(record);
  });
});
