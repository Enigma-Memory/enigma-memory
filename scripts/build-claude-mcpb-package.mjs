#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClaudeDesktopMcpbManifest } from '../packages/connectors/src/index.js';
import { createDeterministicZip } from './package-browser-extension.mjs';

export const CLAUDE_MCPB_PACKAGE_SCHEMA = 'enigma.claude_desktop_mcpb_package.v1';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(dirname(SCRIPT_PATH), '..');
const DEFAULT_MCPB = '.enigma/claude/enigma-memory.mcpb';
const RUNTIME_FILES = Object.freeze([
  'apps/verifier/bin/enigma-verify.mjs',
  'packages/controller/src/index.js',
  'packages/core/src/index.js',
  'packages/importers/src/index.js',
  'packages/mcp-server/bin/enigma-mcp.mjs',
  'packages/mcp-server/src/index.js',
  'packages/mesh/src/index.js',
  'packages/metering/src/index.js',
  'packages/optimizer/src/index.js',
  'packages/passport/src/index.js',
  'packages/settlement/src/index.js',
  'packages/vault/src/index.js',
]);

function usage() {
  return 'Usage: node scripts/build-claude-mcpb-package.mjs [--mcpb <path>] [--out <path>] [--version <semver>]\n\nBuilds a deterministic Claude Desktop .mcpb package containing manifest.json and the local Enigma MCP node runtime source. No install, network, signing, or provider launch is performed.\n';
}

function readValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}.`);
  return value;
}

export function parseClaudeMcpbPackageArgs(argv = process.argv.slice(2)) {
  const options = { mcpb: DEFAULT_MCPB, out: null, version: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--mcpb') { options.mcpb = readValue(argv, i, arg); i += 1; }
    else if (arg === '--out') { options.out = readValue(argv, i, arg); i += 1; }
    else if (arg === '--version') { options.version = readValue(argv, i, arg); i += 1; }
    else throw new Error('Unknown argument.');
  }
  return options;
}

function sha256(buffer) {
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
}


async function readPackageVersion() {
  const pkg = JSON.parse(await readFile(resolve(PROJECT_ROOT, 'package.json'), 'utf8'));
  return pkg.version;
}

function assertPublicPackagePath(path) {
  if (!path || path.startsWith('/') || path.includes('\\') || path.includes('..')) throw new Error('Package paths must be relative POSIX paths.');
}

async function runtimeEntries() {
  const files = [];
  for (const rel of RUNTIME_FILES) {
    assertPublicPackagePath(rel);
    const buffer = await readFile(resolve(PROJECT_ROOT, rel));
    files.push({ path: rel, buffer, size: buffer.byteLength, sha256: sha256(buffer) });
  }
  return files;
}

export async function buildClaudeMcpbPackage(options = {}) {
  if (options.help) return { help: usage() };
  const version = options.version ?? await readPackageVersion();
  const manifest = createClaudeDesktopMcpbManifest({ version });
  const manifestBuffer = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const files = [
    { path: 'manifest.json', buffer: manifestBuffer, size: manifestBuffer.byteLength, sha256: sha256(manifestBuffer) },
    ...await runtimeEntries(),
  ].sort((a, b) => a.path.localeCompare(b.path));
  const zip = createDeterministicZip(files);
  const mcpbPath = resolve(PROJECT_ROOT, options.mcpb ?? DEFAULT_MCPB);
  await mkdir(dirname(mcpbPath), { recursive: true });
  await writeFile(mcpbPath, zip);
  const report = {
    schema: CLAUDE_MCPB_PACKAGE_SCHEMA,
    ok: true,
    public_safe: true,
    manifest: {
      manifest_version: manifest.manifest_version,
      name: manifest.name,
      version: manifest.version,
      server_type: manifest.server.type,
      entry_point: manifest.server.entry_point,
      user_config_keys: Object.keys(manifest.user_config ?? {}).sort(),
    },
    package: {
      mcpb_path: '<mcpb-output>',
      mcpb_sha256: sha256(zip),
      file_count: files.length,
      deterministic_order: files.map((file) => file.path),
      total_bytes: files.reduce((sum, file) => sum + file.size, 0),
      install_performed: false,
      provider_launched: false,
      network_performed: false,
    },
    files: files.map((file) => ({ path: file.path, size: file.size, sha256: file.sha256 })),
    claim_boundaries: {
      local_package_artifact_only: true,
      claude_installed: false,
      claude_connected: false,
      provider_deletion_proof: false,
      model_forgetting_proof: false,
    },
  };
  if (options.out) {
    const outPath = resolve(PROJECT_ROOT, options.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  return report;
}

async function main() {
  try {
    const result = await buildClaudeMcpbPackage(parseClaudeMcpbPackageArgs());
    if (result.help) process.stdout.write(result.help);
    else process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ schema: CLAUDE_MCPB_PACKAGE_SCHEMA, ok: false, public_safe: true, error: { code: 'CLAUDE_MCPB_PACKAGE_BLOCKED', message: error instanceof Error ? error.message : 'Package build failed.' } }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
