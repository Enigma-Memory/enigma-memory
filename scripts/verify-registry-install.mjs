#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve as resolvePath } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

export const REGISTRY_INSTALL_SCHEMA = 'enigma.registry_install_verifier.v1';
export const REQUIRED_NODE_MAJOR = 24;

const execFileAsync = promisify(execFile);
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PACKAGE_DIR = resolvePath(dirname(SCRIPT_PATH), '..');
const PACKAGE_JSON = JSON.parse(readFileSync(resolvePath(PACKAGE_DIR, 'package.json'), 'utf8'));
const PACKAGE_BINS = Object.freeze({ ...PACKAGE_JSON.bin });
const PACKAGE_NAME_RE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u;
const PACKAGE_VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const PACKAGE_SPEC_RE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

export const DEFAULT_REGISTRY_PACKAGE = PACKAGE_JSON.name ?? 'enigma-memory';
export const DEFAULT_REGISTRY_VERSION = PACKAGE_JSON.version;
export const REGISTRY_INSTALL_CHECKS = Object.freeze([
  Object.freeze({ step: 'check_enigma_help', bin: 'enigma', args: Object.freeze(['--help']) }),
  Object.freeze({ step: 'check_enigma_doctor', bin: 'enigma', args: Object.freeze(['doctor']) }),
  Object.freeze({ step: 'check_enigma_test_drive_dry_run', bin: 'enigma', args: Object.freeze(['test-drive', '--dry-run']) }),
  Object.freeze({ step: 'check_enigma_relay_demo', bin: 'enigma-relay', args: Object.freeze(['demo']) }),
  Object.freeze({ step: 'check_enigma_gateway_demo', bin: 'enigma-gateway', args: Object.freeze(['demo']) }),
]);

function readRequiredValue(argv, index, flag) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${flag}.`);
  return value;
}

function commandForPlatform(base, platform) {
  return platform === 'win32' ? `${base}.cmd` : base;
}

function rejectControlCharacters(value, label) {
  const text = String(value ?? '');
  if (text.length === 0) throw new Error(`${label} must not be empty.`);
  if (text.includes('\0') || text.includes('\n') || text.includes('\r')) throw new Error(`${label} contains an invalid control character.`);
  return text;
}

export function usage() {
  return `Usage: node scripts/verify-registry-install.mjs [--execute] [--package <name>] [--version <version>] [--tmp-dir <path>] [--skip-network]\n\nDry-run is the default and prints the public-safe planned command set. Execute mode installs the package into a temporary prefix and runs selected installed bin files directly. --skip-network validates the plan without running npm install or installed bins.\n`;
}

export function parseRegistryInstallArgs(argv = process.argv.slice(2)) {
  const options = {
    dryRun: true,
    execute: false,
    packageName: DEFAULT_REGISTRY_PACKAGE,
    packageVersion: DEFAULT_REGISTRY_VERSION,
    tmpDir: undefined,
    skipNetwork: false,
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
    } else if (arg === '--package') {
      options.packageName = readRequiredValue(argv, index, arg);
      index += 1;
    } else if (arg === '--version') {
      options.packageVersion = readRequiredValue(argv, index, arg);
      index += 1;
    } else if (arg === '--tmp-dir') {
      options.tmpDir = readRequiredValue(argv, index, arg);
      index += 1;
    } else if (arg === '--skip-network') {
      options.skipNetwork = true;
    } else {
      throw new Error('Unknown argument.');
    }
  }

  if (sawDryRun && sawExecute) throw new Error('Use either --dry-run or --execute, not both.');
  validatePackageName(options.packageName);
  validatePackageVersion(options.packageVersion);
  if (options.tmpDir !== undefined) rejectControlCharacters(options.tmpDir, 'Temporary directory');
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
    throw new Error(`Node >=${requiredMajor} is required for the registry install verifier.`);
  }
  return { ok: true, required: `>=${requiredMajor}`, current_major: major };
}

export function validatePackageName(name) {
  const value = rejectControlCharacters(name, 'Package name');
  if (!PACKAGE_NAME_RE.test(value)) throw new Error('Package name must be a deterministic npm package name.');
  return value;
}

export function validatePackageVersion(version) {
  const value = rejectControlCharacters(version, 'Package version');
  if (!PACKAGE_VERSION_RE.test(value)) throw new Error('Package version must be an exact semver version.');
  return value;
}

function packageSpec(packageName, packageVersion) {
  return `${validatePackageName(packageName)}@${validatePackageVersion(packageVersion)}`;
}

function packageInstallDirectory(prefix, packageName) {
  const parts = packageName.startsWith('@') ? packageName.split('/') : [packageName];
  return join(prefix, 'node_modules', ...parts);
}

function normalizeSeparators(value) {
  return String(value).replace(/\\/gu, '/');
}

function replaceAllPathForms(value, from, to) {
  if (!from || from.includes('<')) return value;
  const normalizedFrom = normalizeSeparators(from);
  const normalizedValue = normalizeSeparators(value);
  if (normalizedValue === normalizedFrom) return to;
  if (normalizedValue.startsWith(`${normalizedFrom}/`)) return `${to}${normalizedValue.slice(normalizedFrom.length)}`;
  return normalizedValue.split(normalizedFrom).join(to);
}

export function redactPublicPath(value, replacements = []) {
  let redacted = String(value ?? '');
  const sorted = [...replacements]
    .filter((entry) => entry && typeof entry.path === 'string' && entry.path.length > 0)
    .sort((left, right) => right.path.length - left.path.length);
  for (const entry of sorted) redacted = replaceAllPathForms(redacted, entry.path, entry.label);
  redacted = redacted.replace(/[A-Za-z]:[\\/][^\s"'\])},]+/gu, '<absolute-path>');
  redacted = redacted.replace(/(^|[\s"'(\[{:,])\/(?:[^/\s"'\])},]+\/)+[^/\s"'\])},]+/gu, '$1<absolute-path>');
  if (redacted.startsWith('/')) return '<absolute-path>';
  if (redacted.startsWith('\\\\')) return '<absolute-path>';
  return redacted;
}

function publicCommandFor(command) {
  if (command.kind === 'npm_install') {
    return {
      command: 'npm',
      args: ['install', '--prefix', '<temp-prefix>', command.package_spec],
    };
  }
  return {
    command: command.bin,
    args: [...command.bin_args],
  };
}

function npmInstallCommand(platform, nodeCommand, runtime, prefix, spec) {
  const npmCliPath = runtime.npmCliPath ?? process.env.npm_execpath;
  if (platform === 'win32' && typeof npmCliPath === 'string' && npmCliPath.length > 0) {
    return {
      command: nodeCommand,
      args: [npmCliPath, 'install', '--prefix', prefix, spec],
    };
  }
  return {
    command: commandForPlatform('npm', platform),
    args: ['install', '--prefix', prefix, spec],
  };
}

function commandBasename(command) {
  const normalized = normalizeSeparators(command);
  return normalized.slice(normalized.lastIndexOf('/') + 1).toLowerCase();
}

export function buildRegistryInstallPlan(options = {}, runtime = {}) {
  const platform = runtime.platform ?? process.platform;
  const cwd = runtime.cwd ?? process.cwd();
  const packageName = validatePackageName(options.packageName ?? DEFAULT_REGISTRY_PACKAGE);
  const packageVersion = validatePackageVersion(options.packageVersion ?? DEFAULT_REGISTRY_VERSION);
  const spec = packageSpec(packageName, packageVersion);
  const requestedTmpDir = options.tmpDir === undefined ? undefined : rejectControlCharacters(options.tmpDir, 'Temporary directory');
  const prefix = requestedTmpDir === undefined ? (runtime.tmpDir ?? '<temp-prefix>') : (isAbsolute(requestedTmpDir) ? resolvePath(requestedTmpDir) : resolvePath(cwd, requestedTmpDir));
  const installedPackageDir = packageInstallDirectory(prefix, packageName);
  const nodeCommand = String(runtime.nodeCommand ?? process.execPath);
  const installCommand = npmInstallCommand(platform, nodeCommand, runtime, prefix, spec);
  const commands = [
    {
      step: 'install_package',
      kind: 'npm_install',
      command: installCommand.command,
      args: installCommand.args,
      package_spec: spec,
      network: true,
    },
  ];

  for (const check of REGISTRY_INSTALL_CHECKS) {
    const relativeBinPath = PACKAGE_BINS[check.bin];
    if (!relativeBinPath) throw new Error(`Package bin ${check.bin} is not declared.`);
    commands.push({
      step: check.step,
      kind: 'bin_check',
      bin: check.bin,
      command: nodeCommand,
      args: [join(installedPackageDir, relativeBinPath), ...check.args],
      bin_args: [...check.args],
      network: false,
    });
  }

  const plan = {
    packageName,
    packageVersion,
    packageSpec: spec,
    prefix,
    prefixKind: requestedTmpDir === undefined ? 'temporary' : (isAbsolute(requestedTmpDir) ? 'absolute' : 'relative'),
    execute: options.execute === true,
    dryRun: options.execute === true ? false : true,
    skipNetwork: options.skipNetwork === true,
    commands,
  };
  validateRegistryInstallPlan(plan);
  return plan;
}

export function validateCommandSpec(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error('Registry verifier command spec must be an object.');
  const command = rejectControlCharacters(spec.command, 'Command name');
  const args = Array.isArray(spec.args) ? spec.args.map(String) : [];
  for (const [index, arg] of args.entries()) rejectControlCharacters(arg, `Command argument ${index}`);

  if (spec.kind === 'npm_install') {
    const directNpmInstall = (command === 'npm' || command === 'npm.cmd')
      && args.length === 4
      && args[0] === 'install'
      && args[1] === '--prefix'
      && PACKAGE_SPEC_RE.test(args[3]);
    const nodeNpmCliInstall = (commandBasename(command) === 'node' || commandBasename(command) === 'node.exe')
      && args.length === 5
      && args[1] === 'install'
      && args[2] === '--prefix'
      && PACKAGE_SPEC_RE.test(args[4]);
    if (!directNpmInstall && !nodeNpmCliInstall) {
      throw new Error('Registry install command must be exactly npm install --prefix <tmp> <package>@<version>.');
    }
    return true;
  }

  if (spec.kind === 'bin_check') {
    if (!REGISTRY_INSTALL_CHECKS.some((check) => check.step === spec.step && check.bin === spec.bin)) throw new Error('Registry bin check is not allowlisted.');
    if (args.length < 1) throw new Error('Registry bin check must run an installed bin file.');
    return true;
  }

  throw new Error('Registry verifier command is not allowlisted.');
}

export function validateRegistryInstallPlan(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) throw new Error('Registry install plan must be an object.');
  if (plan.commands?.length !== REGISTRY_INSTALL_CHECKS.length + 1) throw new Error('Registry install plan has an unexpected command count.');
  if (plan.commands[0]?.step !== 'install_package' || plan.commands[0]?.kind !== 'npm_install') throw new Error('Registry install plan must begin with package installation.');
  for (const [index, check] of REGISTRY_INSTALL_CHECKS.entries()) {
    const command = plan.commands[index + 1];
    if (command?.step !== check.step || command?.kind !== 'bin_check' || command?.bin !== check.bin) {
      throw new Error('Registry install plan has an unexpected bin check order.');
    }
  }
  for (const command of plan.commands) validateCommandSpec(command);
  return true;
}

function statusForCommand(plan, result) {
  if (plan.skipNetwork) return 'validated';
  if (!plan.execute) return 'preview';
  if (!result) return 'skipped';
  return result.ok === true ? 'passed' : 'failed';
}

export function summarizeRegistryInstallResult(plan, commandResults = [], node = validateNodeVersion()) {
  const resultByStep = new Map(commandResults.map((result) => [result.step, result]));
  const commands = plan.commands.map((command) => {
    const publicSpec = publicCommandFor(command);
    const result = resultByStep.get(command.step);
    const record = {
      step: command.step,
      command: publicSpec.command,
      args: publicSpec.args,
      status: statusForCommand(plan, result),
      network: command.network === true,
    };
    if (result?.exitCode !== undefined) record.exit_code = result.exitCode;
    return record;
  });
  const expectedRuns = plan.execute && !plan.skipNetwork ? plan.commands.length : 0;
  const executedAll = expectedRuns === 0 || commandResults.length === expectedRuns;
  const commandOk = commandResults.every((result) => result.ok === true);
  return {
    schema: REGISTRY_INSTALL_SCHEMA,
    ok: plan.skipNetwork ? true : (!plan.execute || (executedAll && commandOk)),
    mode: plan.skipNetwork ? 'skip-network' : (plan.execute ? 'execute' : 'dry-run'),
    dry_run: plan.dryRun,
    execute: plan.execute,
    skip_network: plan.skipNetwork,
    public_safe: true,
    node,
    package: {
      name: plan.packageName,
      version: plan.packageVersion,
      spec: plan.packageSpec,
    },
    install_prefix: '<temp-prefix>',
    commands,
    safety: {
      default_dry_run: true,
      requires_execute_for_mutation: true,
      skip_network_runs_no_commands: plan.skipNetwork,
      shell: false,
      prints_local_absolute_paths: false,
      prints_response_bodies: false,
      prints_raw_memory: false,
      prints_secrets: false,
    },
  };
}

async function runCommand(command, execFileImpl) {
  try {
    await execFileImpl(command.command, command.args, { windowsHide: true });
    return { step: command.step, ok: true, exitCode: 0 };
  } catch (error) {
    return {
      step: command.step,
      ok: false,
      exitCode: Number.isInteger(error?.code) ? error.code : 1,
    };
  }
}

export async function runRegistryInstallVerification(argv = process.argv.slice(2), runtime = {}) {
  const parsedOptions = Array.isArray(argv) ? parseRegistryInstallArgs(argv) : { ...argv };
  const node = validateNodeVersion(parsedOptions.nodeVersion ?? runtime.nodeVersion ?? process.versions.node);
  const needsTempPrefix = parsedOptions.execute === true && parsedOptions.skipNetwork !== true && parsedOptions.tmpDir === undefined;
  const options = { ...parsedOptions };

  if (needsTempPrefix) {
    const mkdtempImpl = runtime.mkdtempImpl ?? mkdtemp;
    const tmpRoot = runtime.tmpRoot ?? tmpdir();
    options.tmpDir = await mkdtempImpl(join(tmpRoot, 'enigma-registry-install-'));
  }

  const plan = buildRegistryInstallPlan(options, runtime);
  if (plan.skipNetwork || !plan.execute) return summarizeRegistryInstallResult(plan, [], node);

  const mkdirImpl = runtime.mkdirImpl ?? mkdir;
  await mkdirImpl(plan.prefix, { recursive: true });
  const execFileImpl = runtime.execFileImpl ?? execFileAsync;
  const commandResults = [];
  for (const command of plan.commands) {
    const result = await runCommand(command, execFileImpl);
    commandResults.push(result);
    if (result.ok !== true) break;
  }
  return summarizeRegistryInstallResult(plan, commandResults, node);
}

function safeErrorMessage(error) {
  const message = String(error?.message ?? error);
  if (/^(Missing value|Unknown argument|Use either|Invalid Node version|Node >=|Package name|Package version|Temporary directory|Registry verifier|Registry install|Registry bin|Package bin)/u.test(message)) return message;
  return 'Registry install verification failed.';
}

export function registryInstallCliOutput(output) {
  if (output.mode === 'dry-run') return output.commands;
  return output;
}

async function main() {
  const args = parseRegistryInstallArgs();
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  const output = await runRegistryInstallVerification(args);
  process.stdout.write(`${JSON.stringify(registryInstallCliOutput(output), null, 2)}\n`);
  if (output.ok !== true) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolvePath(process.argv[1])) {
  main().catch((error) => {
    process.stdout.write(`${JSON.stringify({ schema: REGISTRY_INSTALL_SCHEMA, ok: false, public_safe: true, error: { code: 'REGISTRY_INSTALL_VERIFICATION_FAILED', message: safeErrorMessage(error) } }, null, 2)}\n`);
    process.exitCode = 1;
  });
}
