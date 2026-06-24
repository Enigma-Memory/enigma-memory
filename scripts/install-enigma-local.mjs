#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, resolve as resolvePath } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

export const INSTALLER_SCHEMA = 'enigma.local_installer.v1';
export const REQUIRED_NODE_MAJOR = 24;
export const DEFAULT_BUNDLE_PATH = '.enigma/bundle.json';

const execFileAsync = promisify(execFile);
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_PACKAGE_DIR = resolvePath(dirname(SCRIPT_PATH), '..');
const SAFE_COMMAND_RE = /^[A-Za-z0-9._-]+$/u;

function readRequiredValue(argv, index, flag) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${flag}.`);
  return value;
}

export function usage() {
  return `Usage: node scripts/install-enigma-local.mjs [--dry-run|--execute] [--init-vault] [--bundle <path>]\n\nDry-run is the default. Execute mode runs npm install -g . from the local checkout.\nNo network download command is generated, and vault initialization runs only when --init-vault is present.\n`;
}

export function parseInstallerArgs(argv = process.argv.slice(2)) {
  const options = {
    dryRun: true,
    execute: false,
    initVault: false,
    bundlePath: DEFAULT_BUNDLE_PATH,
    packageDir: DEFAULT_PACKAGE_DIR,
    subject: 'local-user',
    displayName: 'Local user',
  };
  let sawDryRun = false;
  let sawExecute = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--dry-run') {
      sawDryRun = true;
      options.dryRun = true;
      options.execute = false;
    } else if (arg === '--execute') {
      sawExecute = true;
      options.dryRun = false;
      options.execute = true;
    } else if (arg === '--init-vault') {
      options.initVault = true;
    } else if (arg === '--no-init-vault') {
      options.initVault = false;
    } else if (arg === '--bundle') {
      options.bundlePath = readRequiredValue(argv, index, arg);
      index += 1;
    } else if (arg === '--package-dir') {
      options.packageDir = readRequiredValue(argv, index, arg);
      index += 1;
    } else if (arg === '--subject') {
      options.subject = readRequiredValue(argv, index, arg);
      index += 1;
    } else if (arg === '--display-name') {
      options.displayName = readRequiredValue(argv, index, arg);
      index += 1;
    } else {
      throw new Error('Unknown argument.');
    }
  }

  if (sawDryRun && sawExecute) throw new Error('Use either --dry-run or --execute, not both.');
  return options;
}

export function nodeMajor(version) {
  const match = String(version ?? '').trim().match(/^v?(\d+)(?:\.\d+){0,2}(?:[-+].*)?$/u);
  if (!match) throw new Error('Invalid Node version override.');
  return Number(match[1]);
}

export function validateNodeVersion(version = process.versions.node, requiredMajor = REQUIRED_NODE_MAJOR) {
  const major = nodeMajor(version);
  if (!Number.isSafeInteger(major) || major < requiredMajor) {
    throw new Error(`Node >=${requiredMajor} is required for the local Enigma installer.`);
  }
  return { ok: true, required: `>=${requiredMajor}`, current_major: major };
}

function commandForPlatform(base, platform) {
  return platform === 'win32' ? `${base}.cmd` : base;
}

function rejectUnsafeArg(arg, label) {
  const value = String(arg ?? '');
  if (value.length === 0) throw new Error(`${label} must not be empty.`);
  if (value.includes('\0') || value.includes('\n') || value.includes('\r')) throw new Error(`${label} contains an invalid control character.`);
}

export function validateCommandSpec(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error('Installer command spec must be an object.');
  const command = String(spec.command ?? '');
  if (!SAFE_COMMAND_RE.test(command)) throw new Error('Installer command name is not safe.');
  const args = Array.isArray(spec.args) ? spec.args.map(String) : [];
  for (const [index, arg] of args.entries()) rejectUnsafeArg(arg, `Installer command argument ${index}`);

  if (command === 'npm' || command === 'npm.cmd') {
    if (args.length !== 3 || args[0] !== 'install' || args[1] !== '-g' || args[2] !== '.') {
      throw new Error('Installer npm command must be exactly npm install -g .');
    }
    return true;
  }

  if (command === 'enigma' || command === 'enigma.cmd') {
    const bundleIndex = args.indexOf('--bundle');
    if (args[0] !== 'init' || bundleIndex === -1 || bundleIndex + 1 >= args.length) {
      throw new Error('Installer Enigma command must initialize a bundle with --bundle.');
    }
    return true;
  }

  throw new Error('Installer command is not allowlisted.');
}

function publicCommand(command) {
  if (command.step === 'install_package') return { command: 'npm', args: ['install', '-g', '.'] };
  return { command: 'enigma', args: ['init', '--bundle', '<bundle-path>', '--subject', '<subject>', '--display-name', '<display-name>'] };
}

export function buildInstallerPlan(options = {}, runtime = {}) {
  const platform = runtime.platform ?? process.platform;
  const cwd = runtime.cwd ?? process.cwd();
  const requestedPackageDir = String(options.packageDir ?? DEFAULT_PACKAGE_DIR);
  rejectUnsafeArg(requestedPackageDir, 'Package directory');
  const packageDir = resolvePath(requestedPackageDir);
  const requestedBundlePath = String(options.bundlePath ?? DEFAULT_BUNDLE_PATH);
  rejectUnsafeArg(requestedBundlePath, 'Bundle path');
  const bundlePath = isAbsolute(requestedBundlePath) ? resolvePath(requestedBundlePath) : resolvePath(cwd, requestedBundlePath);

  const commands = [
    {
      step: 'install_package',
      command: commandForPlatform('npm', platform),
      args: ['install', '-g', '.'],
      cwd: packageDir,
      mutates_global_state: true,
    },
  ];

  if (options.initVault === true) {
    commands.push({
      step: 'initialize_vault',
      command: commandForPlatform('enigma', platform),
      args: ['init', '--bundle', bundlePath, '--subject', String(options.subject ?? 'local-user'), '--display-name', String(options.displayName ?? 'Local user')],
      cwd: packageDir,
      mutates_local_filesystem: true,
    });
  }

  for (const command of commands) validateCommandSpec(command);

  return {
    dryRun: options.execute === true ? false : true,
    execute: options.execute === true,
    packageDir,
    bundlePath,
    bundlePathKind: requestedBundlePath === DEFAULT_BUNDLE_PATH ? 'default' : (isAbsolute(requestedBundlePath) ? 'absolute' : 'relative'),
    initVault: options.initVault === true,
    commands,
  };
}

function publicCommandRecords(plan, resultByStep = new Map()) {
  return plan.commands.map((command) => {
    const publicSpec = publicCommand(command);
    const runResult = resultByStep.get(command.step);
    return {
      step: command.step,
      command: publicSpec.command,
      args: publicSpec.args,
      status: plan.execute ? (runResult?.ok ? 'executed' : 'pending') : 'preview',
      mutates: command.mutates_global_state === true ? 'global_npm_install' : 'local_bundle_file',
    };
  });
}

function publicOutput(plan, node, commandResults = []) {
  const resultByStep = new Map(commandResults.map((result) => [result.step, result]));
  const commands = publicCommandRecords(plan, resultByStep);
  return {
    schema: INSTALLER_SCHEMA,
    ok: commandResults.every((result) => result.ok !== false),
    mode: plan.execute ? 'execute' : 'dry-run',
    dry_run: plan.dryRun,
    execute: plan.execute,
    public_safe: true,
    node,
    package_source: {
      kind: 'local_checkout',
      install_boundary: 'Runs npm install -g . against the checked-out package only; it does not download Enigma from a registry.',
    },
    bundle: {
      path: '<bundle-path>',
      path_kind: plan.bundlePathKind,
      initialize_requested: plan.initVault,
      initialized: plan.execute && plan.initVault && resultByStep.get('initialize_vault')?.ok === true,
    },
    commands,
    preview: {
      commands,
    },
    safety: {
      default_dry_run: true,
      requires_execute_for_mutation: true,
      shell: false,
      network_download_command: false,
      prints_local_absolute_paths: false,
      prints_secrets: false,
    },
  };
}

async function runCommand(command, execFileImpl) {
  try {
    await execFileImpl(command.command, command.args, { cwd: command.cwd, windowsHide: true });
    return { step: command.step, ok: true };
  } catch {
    throw new Error(`Installer command failed at ${command.step}.`);
  }
}

export async function runInstallEnigmaLocal(argv = process.argv.slice(2), runtime = {}) {
  const options = Array.isArray(argv) ? parseInstallerArgs(argv) : { ...argv };
  const node = validateNodeVersion(options.nodeVersion ?? runtime.nodeVersion ?? process.versions.node);
  const plan = buildInstallerPlan(options, runtime);
  if (plan.dryRun) return publicOutput(plan, node);

  const mkdirImpl = runtime.mkdirImpl ?? mkdir;
  if (options.initVault === true) await mkdirImpl(dirname(plan.bundlePath), { recursive: true });
  const execFileImpl = runtime.execFileImpl ?? execFileAsync;
  const commandResults = [];
  for (const command of plan.commands) {
    commandResults.push(await runCommand(command, execFileImpl));
  }
  return publicOutput(plan, node, commandResults);
}

function safeErrorMessage(error) {
  const message = String(error?.message ?? error);
  if (/^(Missing value|Unknown argument|Use either|Invalid Node version|Node >=|Installer command)/u.test(message)) return message;
  return 'Local Enigma installer failed.';
}

async function main() {
  const args = parseInstallerArgs();
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  const output = await runInstallEnigmaLocal(args);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolvePath(process.argv[1])) {
  main().catch((error) => {
    process.stdout.write(`${JSON.stringify({ schema: INSTALLER_SCHEMA, ok: false, public_safe: true, error: { code: 'LOCAL_INSTALLER_FAILED', message: safeErrorMessage(error) } }, null, 2)}\n`);
    process.exitCode = 1;
  });
}
