#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve as resolvePath, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const INSTALLER_ASSET_SCHEMA = 'enigma.installer_assets.v1';
export const INSTALLER_ASSET_PACKAGE = 'enigma-memory';
export const INSTALLER_ASSET_VERSION = '0.1.16';
export const INSTALLER_ASSET_GENERATED_AT = '1970-01-01T00:00:00.000Z';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_OUTPUT_DIR = 'dist/installer-assets';
const SECRET_RE = /(?:bearer\s+[A-Za-z0-9._~+/=-]+|ghp_[A-Za-z0-9_]{16,}|npm_[A-Za-z0-9_-]{24,}|api[_-]?key\s*[=:]|password\s*[=:]|token\s*[=:])/iu;
const WINDOWS_ABSOLUTE_RE = /[A-Za-z]:\\(?:Users|tmp|Temp|Windows|ProgramData|Program Files)\\/u;
const POSIX_ABSOLUTE_RE = /(?:^|[\s"'`=:(])\/(?:Users|home|tmp|var|private|mnt|Volumes)\//u;
const CONTROL_RE = /[\0\r]/u;

function usage() {
  return `Usage: node scripts/build-installer-assets.mjs --out-dir <dir> [--write|--dry-run]\n\nBuilds public-safe source installer assets for enigma-memory. Dry-run is the default and returns the deterministic manifest without writing files.\n`;
}

function readRequiredValue(argv, index, flag) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${flag}.`);
  return value;
}

export function parseInstallerAssetArgs(argv = process.argv.slice(2)) {
  const options = { outDir: DEFAULT_OUTPUT_DIR, dryRun: true, write: false };
  let sawDryRun = false;
  let sawWrite = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--out-dir') {
      options.outDir = readRequiredValue(argv, index, arg);
      index += 1;
    } else if (arg === '--dry-run') {
      sawDryRun = true;
      options.dryRun = true;
      options.write = false;
    } else if (arg === '--write') {
      sawWrite = true;
      options.write = true;
      options.dryRun = false;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (sawDryRun && sawWrite) throw new Error('Use either --dry-run or --write, not both.');
  rejectUnsafeOutputDir(options.outDir);
  return options;
}

function rejectUnsafeOutputDir(value) {
  const text = String(value ?? '');
  if (text.length === 0) throw new Error('Output directory must not be empty.');
  if (CONTROL_RE.test(text) || text.includes('\n')) throw new Error('Output directory contains an invalid control character.');
  if (text.includes('..')) throw new Error('Output directory must not contain parent-directory traversal.');
}

function sha256(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function normalizeAssetPath(path) {
  return path.split('/').filter(Boolean).join('/');
}

function jsonStable(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function asset(path, content, mode = '0644') {
  const normalizedPath = normalizeAssetPath(path);
  assertPublicSafe(content, normalizedPath);
  return Object.freeze({ path: normalizedPath, content, mode, bytes: Buffer.byteLength(content, 'utf8'), sha256: sha256(content) });
}

function compareAssetPath(left, right) {
  if (left.path < right.path) return -1;
  if (left.path > right.path) return 1;
  return 0;
}

function assertPublicSafe(content, label = 'asset') {
  const text = String(content ?? '');
  if (SECRET_RE.test(text)) throw new Error(`${label} contains token-like or secret-like content.`);
  if (WINDOWS_ABSOLUTE_RE.test(text) || POSIX_ABSOLUTE_RE.test(text)) throw new Error(`${label} contains a local absolute path.`);
}

function windowsInstallerScript() {
  return `# Enigma Memory source installer for Windows PowerShell.
# Dry-run is the default; pass -Execute to mutate global npm state and create local setup files.
param(
  [switch]$Execute,
  [string]$Bundle = '.\\.enigma\\bundle.json'
)
$ErrorActionPreference = 'Stop'
$PackageName = '${INSTALLER_ASSET_PACKAGE}'
$NextClientConnect = 'enigma connect <client> --dry-run'

Write-Output 'Enigma Memory Windows installer source asset'
Write-Output 'Default mode: dry-run. No native .exe, code-signing, tokens, or hosted credentials are included.'
Write-Output "Package: $PackageName"
Write-Output "Bundle: $Bundle"

$steps = @(
  'npm install -g enigma-memory',
  'enigma test-drive --dry-run',
  'enigma setup --bundle <bundle> --overwrite',
  'enigma doctor',
  "Next client-connect preview: $NextClientConnect"
)

if (-not $Execute) {
  Write-Output 'Preview only. Re-run with -Execute after reviewing these steps.'
  $steps | ForEach-Object { Write-Output "DRY-RUN: $_" }
  exit 0
}

npm install -g $PackageName
enigma test-drive --dry-run
enigma setup --bundle $Bundle --overwrite
enigma doctor
Write-Output "Next client-connect preview: $NextClientConnect"
`;
}

function linuxInstallerScript() {
  return [
    '#!/usr/bin/env sh',
    '# Enigma Memory source installer for Linux.',
    '# Dry-run is the default; pass --execute to mutate global npm state and create local setup files.',
    'set -eu',
    '',
    'execute=0',
    "bundle='./.enigma/bundle.json'",
    'while [ "$#" -gt 0 ]; do',
    '  case "$1" in',
    '    --execute) execute=1 ;;',
    '    --dry-run) execute=0 ;;',
    '    --bundle) shift; bundle="${1:-}" ;;',
    '    --help|-h)',
    "      printf '%s\\n' 'Usage: ./install-linux.sh [--execute|--dry-run] [--bundle ./.enigma/bundle.json]'",
    '      exit 0',
    '      ;;',
    '    *)',
    '      printf \'%s\\n\' "Unknown argument: $1" >&2',
    '      exit 2',
    '      ;;',
    '  esac',
    '  shift',
    'done',
    '',
    `package='${INSTALLER_ASSET_PACKAGE}'`,
    "next_client_connect='enigma connect <client> --dry-run'",
    "printf '%s\\n' 'Enigma Memory Linux installer source asset'",
    "printf '%s\\n' 'Default mode: dry-run. No native package, signing key, tokens, or hosted credentials are included.'",
    'printf \'%s\\n\' "Package: $package"',
    'printf \'%s\\n\' "Bundle: $bundle"',
    '',
    'if [ "$execute" -ne 1 ]; then',
    "  printf '%s\\n' 'Preview only. Re-run with --execute after reviewing these steps.'",
    "  printf '%s\\n' 'DRY-RUN: npm install -g enigma-memory'",
    "  printf '%s\\n' 'DRY-RUN: enigma test-drive --dry-run'",
    "  printf '%s\\n' 'DRY-RUN: enigma setup --bundle <bundle> --overwrite'",
    "  printf '%s\\n' 'DRY-RUN: enigma doctor'",
    '  printf \'%s\\n\' "DRY-RUN: Next client-connect preview: $next_client_connect"',
    '  exit 0',
    'fi',
    '',
    'npm install -g "$package"',
    'enigma test-drive --dry-run',
    'enigma setup --bundle "$bundle" --overwrite',
    'enigma doctor',
    'printf \'%s\\n\' "Next client-connect preview: $next_client_connect"',
    '',
  ].join('\n');
}

function homebrewFormulaDraft() {
  return `# Draft only. This formula is not submitted to a Homebrew tap by this generator.
# Release engineering must replace the tarball URL and sha256 after a real source archive exists.
# Post-install smoke path:
#   enigma test-drive --dry-run
#   enigma setup --overwrite
#   enigma doctor
#   enigma connect <client> --dry-run
class EnigmaMemory < Formula
  desc "Provider-agnostic AI memory passport and offline-verifiable proof layer"
  homepage "https://github.com/Enigma-Memory/enigma-memory"
  url "https://example.invalid/enigma-memory-${INSTALLER_ASSET_VERSION}.tar.gz"
  sha256 "REPLACE_WITH_RELEASE_TARBALL_SHA256"
  license "Apache-2.0"

  depends_on "node"

  def install
    system "npm", "install", *Language::Node.local_npm_install_args
    bin.install_symlink libexec/"bin/enigma"
    bin.install_symlink libexec/"bin/enigma-verify"
    bin.install_symlink libexec/"bin/enigma-mcp"
    bin.install_symlink libexec/"bin/enigma-relay"
    bin.install_symlink libexec/"bin/enigma-gateway"
    bin.install_symlink libexec/"bin/enigma-native-host"
  end

  test do
    assert_match "enigma", shell_output("#{bin}/enigma --help")
    assert_match "enigma.test_drive.v1", shell_output("#{bin}/enigma test-drive --dry-run")
    assert_match "enigma.setup.v1", shell_output("#{bin}/enigma setup --dry-run")
    shell_output("#{bin}/enigma doctor")
    puts "Next client-connect preview: enigma connect <client> --dry-run"
  end
end
`;
}

function macosPkgReadme() {
  return `# macOS pkgbuild source manifest

This directory is an honest source plan for a future macOS package. It is not a signed .pkg and it does not claim notarization.

Current supported path:

\`\`\`sh
npm install -g ${INSTALLER_ASSET_PACKAGE}
enigma test-drive --dry-run
enigma setup --overwrite
enigma doctor
enigma connect <client> --dry-run
\`\`\`

\`enigma connect <client> --dry-run\` is the next client-connect preview command. Remove \`--dry-run\` only after reviewing the planned client config change.

Blockers before shipping a native .pkg:

- A reproducible package staging tree for the npm-installed command shims.
- macOS pkgbuild/productbuild tooling on a macOS release runner.
- Developer ID Installer certificate, signing identity selection, and notarization workflow.
- Human review that package scripts do not print local absolute paths, credentials, account identifiers, raw memory, or provider transcripts.

The generated JSON manifest in this directory records those blockers explicitly.
`;
}

function macosPkgManifest() {
  return jsonStable({
    schema: 'enigma.macos_pkgbuild_manifest.v1',
    package: INSTALLER_ASSET_PACKAGE,
    version: INSTALLER_ASSET_VERSION,
    generated_native_pkg: false,
    source_only: true,
    package_id: '<reverse-dns-package-id>',
    install_prefix: '<homebrew-or-npm-managed-prefix>',
    commands: [
      ['npm', 'install', '-g', INSTALLER_ASSET_PACKAGE],
      ['enigma', 'test-drive', '--dry-run'],
      ['enigma', 'setup', '--overwrite'],
      ['enigma', 'doctor'],
    ],
    next_client_connect: ['enigma', 'connect', '<client>', '--dry-run'],
    execution_gate: {
      default_mode: 'dry-run',
      mutation_requires: ['--execute', '-Execute'],
    },
    blockers: [
      { code: 'MACOS_PKGBUILD_TOOLING_REQUIRED', message: 'pkgbuild/productbuild must run on a macOS release runner.' },
      { code: 'MACOS_SIGNING_REQUIRED', message: 'A Developer ID Installer certificate and notarization workflow are required before distributing a .pkg.' },
      { code: 'PKG_STAGING_TREE_REQUIRED', message: 'Release engineering must define the staged file layout for command shims and package resources.' },
    ],
  });
}

export function nativeInstallerBlockers(tooling = {}) {
  const windows = [];
  if (tooling.windowsExeBuilderAvailable !== true) windows.push({ code: 'WINDOWS_EXE_BUILDER_REQUIRED', message: 'No Windows .exe builder is configured by this source generator.' });
  if (tooling.windowsCodeSigningAvailable !== true) windows.push({ code: 'WINDOWS_CODE_SIGNING_REQUIRED', message: 'Signed .exe distribution requires a Windows code-signing certificate and signing workflow.' });

  const macos = [];
  if (tooling.pkgbuildAvailable !== true || tooling.productbuildAvailable !== true) macos.push({ code: 'MACOS_PKGBUILD_TOOLING_REQUIRED', message: 'pkgbuild/productbuild are required on a macOS release runner.' });
  if (tooling.macosSigningIdentityAvailable !== true) macos.push({ code: 'MACOS_SIGNING_REQUIRED', message: 'A Developer ID Installer certificate and notarization workflow are required before distributing a .pkg.' });

  return Object.freeze({
    windows_exe: Object.freeze({ generated: false, available: windows.length === 0, blockers: Object.freeze(windows) }),
    macos_pkg: Object.freeze({ generated: false, available: macos.length === 0, blockers: Object.freeze(macos) }),
  });
}

export function buildInstallerAssets(options = {}, runtime = {}) {
  const generatedAt = runtime.generatedAt ?? INSTALLER_ASSET_GENERATED_AT;
  const dryRun = options.write === true || options.dryRun === false ? false : true;
  const assets = [
    asset('install-windows.ps1', windowsInstallerScript()),
    asset('install-linux.sh', linuxInstallerScript(), '0755'),
    asset('homebrew/enigma-memory.rb', homebrewFormulaDraft()),
    asset('macos-pkgbuild/README.md', macosPkgReadme()),
    asset('macos-pkgbuild/manifest.json', macosPkgManifest()),
  ].sort(compareAssetPath);

  const files = assets.map(({ path, mode, bytes, sha256: digest }) => ({ path, mode, bytes, sha256: digest }));
  const manifest = {
    schema: INSTALLER_ASSET_SCHEMA,
    package: INSTALLER_ASSET_PACKAGE,
    version: INSTALLER_ASSET_VERSION,
    generated_at: generatedAt,
    mode: dryRun ? 'dry-run' : 'write',
    dry_run: dryRun,
    public_safe: true,
    output_dir: '<requested-output-dir>',
    npm_install_available_now: true,
    source_assets_only: true,
    generated_native_installers: false,
    files,
    native_installers: nativeInstallerBlockers(runtime.tooling),
    installer_smoke: {
      default_preview_commands: [
        'npm install -g enigma-memory',
        'enigma test-drive --dry-run',
        'enigma setup --overwrite',
        'enigma doctor',
      ],
      next_client_connect: 'enigma connect <client> --dry-run',
      mutation_requires: ['--execute', '-Execute'],
    },
    safety: {
      embeds_tokens: false,
      embeds_local_absolute_paths: false,
      embeds_raw_memory: false,
      embeds_account_ids: false,
      embeds_provider_responses: false,
      embeds_private_keys: false,
      default_dry_run: true,
      requires_write_flag_for_filesystem_mutation: true,
    },
  };
  const manifestContent = jsonStable(manifest);
  assertPublicSafe(manifestContent, 'installer-assets-manifest.json');
  const manifestAsset = asset('installer-assets-manifest.json', manifestContent);

  return Object.freeze({
    ...manifest,
    files: Object.freeze(files),
    assets: Object.freeze([...assets, manifestAsset].sort(compareAssetPath)),
  });
}

async function writeAssets(outDir, assets) {
  const root = resolvePath(outDir);
  for (const item of assets) {
    const target = resolvePath(root, ...item.path.split('/'));
    const rel = relative(root, target);
    if (rel.startsWith('..') || rel === '' || rel.split(sep).includes('..')) throw new Error(`Refusing to write outside output directory: ${item.path}`);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, item.content, { encoding: 'utf8', mode: Number.parseInt(item.mode, 8) });
  }
}

export async function runBuildInstallerAssets(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  try {
    const options = parseInstallerAssetArgs(argv);
    if (options.help) {
      stdout.write(usage());
      return 0;
    }
    const result = buildInstallerAssets(options, io.runtime ?? {});
    if (!result.dry_run) await writeAssets(options.outDir, result.assets);
    const publicResult = { ...result };
    delete publicResult.assets;
    stdout.write(`${jsonStable(publicResult)}`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(`${message}\n`);
    return 2;
  }
}

if (process.argv[1] === SCRIPT_PATH) {
  const code = await runBuildInstallerAssets();
  process.exitCode = code;
}
