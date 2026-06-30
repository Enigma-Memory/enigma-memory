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
  return 'Usage: node scripts/build-claude-mcpb-package.mjs [--mcpb <path>] [--out <path>] [--version <semver>] [--plain]\n\nBuilds a deterministic Claude Desktop .mcpb package containing manifest.json and the local Enigma MCP node runtime source. No install, network, signing, or provider launch is performed.\n';
}

function readValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}.`);
  return value;
}

export function parseClaudeMcpbPackageArgs(argv = process.argv.slice(2)) {
  const options = { mcpb: DEFAULT_MCPB, out: null, version: null, plain: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--mcpb') { options.mcpb = readValue(argv, i, arg); i += 1; }
    else if (arg === '--out') { options.out = readValue(argv, i, arg); i += 1; }
    else if (arg === '--version') { options.version = readValue(argv, i, arg); i += 1; }
    else if (arg === '--plain' || arg === '--text' || arg === '--format=text') options.plain = true;
    else throw new Error('Unknown argument.');
  }
  return options;
}

function sha256(buffer) {
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
}

export function createClaudeMcpbRuntimePackageJson(version) {
  return {
    name: 'enigma-memory-claude-mcpb-runtime',
    version,
    private: true,
    type: 'module',
    description: 'Minimal package scope for the Enigma Memory Claude MCPB runtime.',
    license: 'MIT',
    enigma: {
      package_scope_only: true,
      scripts_included: false,
      dependencies_included: false,
      local_paths_included: false,
    },
  };
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

export function createClaudeMcpbInstallHandoff() {
  const copyableSteps = [
    {
      id: 'open_mcpb',
      instruction: 'Open Claude Desktop, then open Settings → Extensions.',
    },
    {
      id: 'select_bundle',
      instruction: 'Drag the Enigma .mcpb bundle shown as <mcpb-output> into Extensions, or choose Install/Browse and select it.',
    },
    {
      id: 'select_memory_drive',
      instruction: 'When Claude asks for configuration, choose the local Memory Drive file for Enigma.',
    },
    {
      id: 'restart_claude',
      instruction: 'Restart Claude Desktop so it can load the extension after you approve the install.',
    },
    {
      id: 'test_connection',
      instruction: 'Ask Claude to run read-only Enigma tool enigma_support_summary or enigma_next_action; success is a public-safe Enigma schema response.',
    },
  ];
  const repairActions = [
    'Enable or reinstall Enigma Memory in Claude Settings → Extensions.',
    'Reselect the local Memory Drive file if Claude asks for it again.',
    'Fully quit and reopen Claude Desktop, then rerun the read-only Enigma tool test.',
    'Use enigma connect claude-desktop --dry-run only as an advanced fallback when support asks.',
  ];
  const boundaries = {
    install_performed: false,
    automatic_config_write: false,
    provider_launched: false,
    network_performed: false,
  };
  return {
    title: 'Claude Desktop MCPB install handoff',
    summary: 'Copy these steps when a human is ready to install the reviewed .mcpb package in Claude Desktop.',
    steps: copyableSteps,
    repair_handoff: {
      summary: 'If Claude cannot see Enigma after restart, use these no-write repair steps before any advanced fallback.',
      actions: repairActions,
      automatic_config_write: false,
      advanced_fallback_command: 'enigma connect claude-desktop --dry-run',
    },
    copyable_text: [
      'Claude Desktop MCPB install handoff',
      ...copyableSteps.map((step, index) => `${index + 1}. [${step.id}] ${step.instruction}`),
      'Repair if needed:',
      ...repairActions.map((action, index) => `${index + 1}. ${action}`),
      'Boundaries: install_performed=false; automatic_config_write=false; provider_launched=false; network_performed=false.',
    ].join('\n'),
    boundaries,
  };
}

export function renderClaudeMcpbPackagePlain(report, outWritten = false) {
  const boundaries = report.install_handoff?.boundaries ?? report.package ?? {};
  const lines = [
    'Enigma Claude MCPB package',
    `Status: ${report.ok ? 'Ready' : 'Needs attention'}`,
    `Version: ${report.manifest?.version ?? '<version>'}`,
    `Files: ${report.package?.file_count ?? 0}`,
    `Bytes: ${report.package?.total_bytes ?? 0}`,
    'Package: written to <mcpb-output>',
  ];
  if (outWritten) lines.push('Report: written to <out>');
  lines.push('', 'How to install in Claude Desktop:');
  for (const [index, step] of (report.install_handoff?.steps ?? []).entries()) {
    lines.push(`${index + 1}. [${step.id}] ${step.instruction}`);
  }
  if (report.install_handoff?.repair_handoff?.actions?.length) {
    lines.push('', 'If Claude cannot see Enigma after restart:');
    for (const action of report.install_handoff.repair_handoff.actions) lines.push(`- ${action}`);
  }
  lines.push(
    '',
    'What this command did not do:',
    `- Install performed: ${boundaries.install_performed ? 'yes' : 'no'}`,
    `- Automatic config write: ${boundaries.automatic_config_write ? 'yes' : 'no'}`,
    `- Provider launched: ${boundaries.provider_launched ? 'yes' : 'no'}`,
    `- Network performed: ${boundaries.network_performed ? 'yes' : 'no'}`,
    'Boundary: local Claude MCPB package artifact only; no Claude install, client config writes, provider launch, network calls, raw memory, local paths, provider deletion, model behavior, hosted service, or signing claims.',
  );
  return `${lines.join('\n')}\n`;
}

export async function buildClaudeMcpbPackage(options = {}) {
  if (options.help) return { help: usage() };
  const version = options.version ?? await readPackageVersion();
  const manifest = createClaudeDesktopMcpbManifest({ version });
  const manifestBuffer = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const runtimePackage = createClaudeMcpbRuntimePackageJson(version);
  const runtimePackageBuffer = Buffer.from(`${JSON.stringify(runtimePackage, null, 2)}\n`, 'utf8');
  const files = [
    { path: 'manifest.json', buffer: manifestBuffer, size: manifestBuffer.byteLength, sha256: sha256(manifestBuffer) },
    { path: 'package.json', buffer: runtimePackageBuffer, size: runtimePackageBuffer.byteLength, sha256: sha256(runtimePackageBuffer) },
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
      automatic_config_write: false,
      provider_launched: false,
      network_performed: false,
    },
    runtime_package: {
      path: 'package.json',
      name: runtimePackage.name,
      type: runtimePackage.type,
      private: runtimePackage.private,
      scripts_included: false,
      dependencies_included: false,
      local_paths_included: false,
    },
    files: files.map((file) => ({ path: file.path, size: file.size, sha256: file.sha256 })),
    install_handoff: createClaudeMcpbInstallHandoff(),
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
    const options = parseClaudeMcpbPackageArgs();
    const result = await buildClaudeMcpbPackage(options);
    if (result.help) process.stdout.write(result.help);
    else if (options.plain) process.stdout.write(renderClaudeMcpbPackagePlain(result, Boolean(options.out)));
    else process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ schema: CLAUDE_MCPB_PACKAGE_SCHEMA, ok: false, public_safe: true, error: { code: 'CLAUDE_MCPB_PACKAGE_BLOCKED', message: error instanceof Error ? error.message : 'Package build failed.' } }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
