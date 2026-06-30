#!/usr/bin/env node
import { execFile as execFileCallback, spawn } from 'node:child_process';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFile = promisify(execFileCallback);
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMMAND_TIMEOUT_MS = 120_000;
const SCHEMA = 'enigma.local_pack_install_smoke.v1';

function usage() {
  return `Usage: node scripts/verify-local-pack-install.mjs [--plain|--json]\n\nPacks the local source package into a temporary tarball, installs that tarball into a temporary npm prefix, runs installed package entrypoints and npm bin shims, then removes the temp directory. No npm publish, npm token, global install, registry install, signing, upload, or network action is performed.\n`;
}

function npmInvocation(args) {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath && npmExecPath.endsWith('.js')) return { command: process.execPath, args: [npmExecPath, ...args] };
  if (process.platform === 'win32') return { command: process.env.ComSpec ?? 'cmd.exe', args: ['/d', '/s', '/c', ['npm', ...args].join(' ')] };
  return { command: 'npm', args };
}

function localOnlyEnv(extra = {}) {
  const blocked = /(?:NPM_TOKEN|NODE_AUTH_TOKEN|GITHUB_TOKEN|GH_TOKEN|CLOUDFLARE|CF_|AWS|AZURE|GCP|GOOGLE|OPENAI|ANTHROPIC|GEMINI|DATABASE_URL|REDIS_URL|SENTRY|STRIPE)/i;
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (blocked.test(key)) continue;
    env[key] = value;
  }
  return { ...env, ...extra, CI: env.CI ?? '1', NO_COLOR: '1' };
}

function parseJsonPayload(stdout) {
  const text = String(stdout).trim();
  if (!text) throw new Error('Expected JSON stdout, received empty output.');
  return JSON.parse(text);
}

async function run(command, args, options = {}) {
  try {
    const result = await execFile(command, args, {
      cwd: options.cwd ?? PROJECT_ROOT,
      env: localOnlyEnv(options.env),
      windowsHide: true,
      timeout: options.timeoutMs ?? COMMAND_TIMEOUT_MS,
      maxBuffer: 32 * 1024 * 1024,
      shell: Boolean(options.shell),
    });
    return { ok: true, status: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      ok: false,
      status: error?.code ?? 1,
      stdout: error?.stdout ?? '',
      stderr: error?.stderr ?? String(error?.message ?? error),
    };
  }
}

function redactLocalPath(value) {
  let text = String(value);
  text = text.replaceAll(PROJECT_ROOT, '<project-root>');
  text = text.replaceAll(tmpdir(), '<temp>');
  if (process.env.USERPROFILE) text = text.replaceAll(process.env.USERPROFILE, '<user-home>');
  if (process.env.HOME) text = text.replaceAll(process.env.HOME, '<home>');
  return text.split(sep).join('/');
}

function assertNoSecretOutput(output, label) {
  if (/(?:npm_[A-Za-z0-9]{8,}|ghp_[A-Za-z0-9]{8,}|sk-[A-Za-z0-9]{8,}|(?:api[_-]?key|password|authorization)\s*[:=]\s*[A-Za-z0-9._~+/=-]{8,}|authorization:\s*bearer)/i.test(output)) {
    throw new Error(`${label} emitted credential-shaped output.`);
  }
}

function summarizeHelp(stdout, expected) {
  const json = parseJsonPayload(stdout);
  if (!String(json.usage ?? '').includes(expected)) throw new Error(`${expected} help did not include expected usage.`);
  return { usage: json.usage };
}

function summarizeCommandHelp(stdout, expectedUsage, expectedCommands = []) {
  const json = parseJsonPayload(stdout);
  if (json.usage !== expectedUsage) throw new Error(`${expectedUsage} help did not include exact expected usage.`);
  const commands = Array.isArray(json.commands) ? json.commands : [];
  for (const command of expectedCommands) {
    if (!commands.includes(command)) throw new Error(`${expectedUsage} help omitted command ${command}.`);
  }
  return { usage: json.usage, commands };
}

function summarizeTestDrive(stdout) {
  const json = parseJsonPayload(stdout);
  if (json.schema !== 'enigma.test_drive.v1') throw new Error('Installed enigma test-drive did not emit enigma.test_drive.v1.');
  if (json.artifacts_written !== false || json.client_configs_written !== false || json.dry_run !== true) throw new Error('Installed enigma test-drive dry-run must not write files.');
  return {
    schema: json.schema,
    dry_run: json.dry_run === true,
    writes_performed: false,
    next_command_count: Array.isArray(json.next_commands) ? json.next_commands.length : 0,
  };
}

async function installedEntrypoint(prefix, relativePath, args, summarize) {
  const entrypoint = join(prefix, 'node_modules', 'enigma-memory', relativePath);
  await access(entrypoint);
  const result = await run(process.execPath, [entrypoint, ...args], { cwd: prefix });
  assertNoSecretOutput(`${result.stdout}\n${result.stderr}`, relativePath);
  if (!result.ok) throw new Error(`${relativePath} failed with status ${result.status}: ${redactLocalPath(result.stderr || result.stdout)}`);
  return {
    entrypoint: relativePath,
    status: result.status,
    evidence: summarize(result.stdout),
  };
}

function installedBinPath(prefix, binName) {
  const command = process.platform === 'win32' ? `${binName}.cmd` : binName;
  return join(prefix, 'node_modules', '.bin', command);
}

function windowsCommandQuote(value) {
  const text = String(value);
  if (!/[\s"&^<>|]/u.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

async function installedBinShim(prefix, binName, args, summarize) {
  const binPath = installedBinPath(prefix, binName);
  await access(binPath);
  const command = process.platform === 'win32' ? `${windowsCommandQuote(binPath)} ${args.map(windowsCommandQuote).join(' ')}`.trim() : binPath;
  const result = process.platform === 'win32'
    ? await run(command, [], { cwd: prefix, shell: true })
    : await run(command, args, { cwd: prefix });
  assertNoSecretOutput(`${result.stdout}\n${result.stderr}`, `bin:${binName}`);
  if (!result.ok) throw new Error(`bin:${binName} failed with status ${result.status}: ${redactLocalPath(result.stderr || result.stdout)}`);
  return {
    bin: binName,
    status: result.status,
    evidence: summarize(result.stdout),
  };
}

function parseJsonLines(output) {
  return String(output)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function responseById(responses, id) {
  return responses.find((response) => response?.id === id);
}

async function installedMcpStdioSmoke(prefix, tempDir) {
  const relativePath = 'packages/mcp-server/bin/enigma-mcp.mjs';
  const entrypoint = join(prefix, 'node_modules', 'enigma-memory', relativePath);
  await access(entrypoint);
  const child = spawn(process.execPath, [entrypoint], {
    cwd: prefix,
    env: localOnlyEnv({ ENIGMA_BUNDLE: join(tempDir, 'mcp-bundle.json') }),
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const requests = [
    { jsonrpc: '2.0', id: 'initialize', method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'enigma-local-pack-install-smoke', version: '0' } } },
    { jsonrpc: '2.0', id: 'tools', method: 'tools/list', params: {} },
    { jsonrpc: '2.0', id: 'resources', method: 'resources/list', params: {} },
    { jsonrpc: '2.0', id: 'prompts', method: 'prompts/list', params: {} },
  ];
  for (const request of requests) child.stdin.write(`${JSON.stringify(request)}\n`);
  child.stdin.end();
  const status = await new Promise((resolveClose, rejectClose) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      rejectClose(new Error('Installed enigma-mcp stdio smoke timed out.'));
    }, COMMAND_TIMEOUT_MS);
    child.once('close', (code) => {
      clearTimeout(timer);
      resolveClose(code ?? 0);
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      rejectClose(error);
    });
  });
  assertNoSecretOutput(`${stdout}\n${stderr}`, relativePath);
  if (status !== 0) throw new Error(`${relativePath} failed with status ${status}: ${redactLocalPath(stderr || stdout)}`);
  const responses = parseJsonLines(stdout);
  const initialize = responseById(responses, 'initialize');
  const tools = responseById(responses, 'tools');
  const resources = responseById(responses, 'resources');
  const prompts = responseById(responses, 'prompts');
  if (initialize?.result?.serverInfo?.name !== 'enigma-mcp-server') throw new Error('Installed enigma-mcp initialize response missing Enigma server info.');
  const toolCount = Array.isArray(tools?.result?.tools) ? tools.result.tools.length : 0;
  const resourceCount = Array.isArray(resources?.result?.resources) ? resources.result.resources.length : 0;
  const promptCount = Array.isArray(prompts?.result?.prompts) ? prompts.result.prompts.length : 0;
  if (toolCount <= 0 || resourceCount <= 0 || promptCount <= 0) throw new Error('Installed enigma-mcp stdio smoke returned empty capabilities.');
  return {
    entrypoint: relativePath,
    status,
    evidence: {
      server: initialize.result.serverInfo.name,
      protocolVersion: initialize.result.protocolVersion,
      tool_count: toolCount,
      resource_count: resourceCount,
      prompt_count: promptCount,
    },
  };
}

export async function runLocalPackInstallSmoke(now = new Date()) {
  const tempDir = await mkdtemp(join(tmpdir(), 'enigma-local-pack-install-'));
  try {
    const pack = npmInvocation(['pack', '--json', '--ignore-scripts', '--pack-destination', tempDir]);
    const packResult = await run(pack.command, pack.args, { cwd: PROJECT_ROOT });
    assertNoSecretOutput(`${packResult.stdout}\n${packResult.stderr}`, 'npm pack');
    if (!packResult.ok) throw new Error(`npm pack failed with status ${packResult.status}: ${redactLocalPath(packResult.stderr || packResult.stdout)}`);
    const packed = parseJsonPayload(packResult.stdout);
    const entry = Array.isArray(packed) ? packed[0] : packed;
    const filename = entry?.filename;
    if (typeof filename !== 'string' || !filename.endsWith('.tgz')) throw new Error('npm pack did not report a .tgz filename.');
    const tarballPath = join(tempDir, basename(filename));
    await access(tarballPath);

    const prefix = join(tempDir, 'prefix');
    const install = npmInvocation(['install', '--prefix', prefix, '--ignore-scripts', tarballPath]);
    const installResult = await run(install.command, install.args, { cwd: tempDir });
    assertNoSecretOutput(`${installResult.stdout}\n${installResult.stderr}`, 'npm install local tarball');
    if (!installResult.ok) throw new Error(`npm install local tarball failed with status ${installResult.status}: ${redactLocalPath(installResult.stderr || installResult.stdout)}`);

    const checks = [];
    checks.push(await installedEntrypoint(prefix, 'apps/cli/bin/enigma.mjs', ['--help'], (stdout) => summarizeHelp(stdout, 'enigma')));
    checks.push(await installedEntrypoint(prefix, 'apps/cli/bin/enigma.mjs', ['test-drive', '--dry-run'], summarizeTestDrive));
    checks.push(await installedEntrypoint(prefix, 'apps/verifier/bin/enigma-verify.mjs', ['--help'], (stdout) => summarizeHelp(stdout, 'enigma-verify')));
    checks.push(await installedEntrypoint(prefix, 'apps/relay/bin/enigma-relay.mjs', ['--help'], (stdout) => summarizeCommandHelp(stdout, 'enigma-relay [demo|serve] [options]', ['demo', 'serve'])));
    checks.push(await installedEntrypoint(prefix, 'apps/gateway/bin/enigma-gateway.mjs', ['--help'], (stdout) => summarizeCommandHelp(stdout, 'enigma-gateway [demo|serve] [options]', ['demo', 'serve'])));
    checks.push(await installedMcpStdioSmoke(prefix, tempDir));
    checks.push(await installedEntrypoint(prefix, 'apps/native-host/bin/enigma-native-host.mjs', ['--help'], (stdout) => summarizeHelp(stdout, 'enigma-native-host')));

    const binShimChecks = [];
    binShimChecks.push(await installedBinShim(prefix, 'enigma', ['--help'], (stdout) => summarizeHelp(stdout, 'enigma')));
    binShimChecks.push(await installedBinShim(prefix, 'enigma', ['test-drive', '--dry-run'], summarizeTestDrive));
    binShimChecks.push(await installedBinShim(prefix, 'enigma-verify', ['--help'], (stdout) => summarizeHelp(stdout, 'enigma-verify')));
    binShimChecks.push(await installedBinShim(prefix, 'enigma-relay', ['--help'], (stdout) => summarizeCommandHelp(stdout, 'enigma-relay [demo|serve] [options]', ['demo', 'serve'])));
    binShimChecks.push(await installedBinShim(prefix, 'enigma-gateway', ['--help'], (stdout) => summarizeCommandHelp(stdout, 'enigma-gateway [demo|serve] [options]', ['demo', 'serve'])));
    binShimChecks.push(await installedBinShim(prefix, 'enigma-native-host', ['--help'], (stdout) => summarizeHelp(stdout, 'enigma-native-host')));

    return {
      schema: SCHEMA,
      generated_at: now.toISOString(),
      ok: true,
      package: {
        name: entry?.name ?? 'enigma-memory',
        version: entry?.version ?? null,
        tarball: basename(filename),
      },
      install: {
        command: 'npm install --prefix <temp-prefix> --ignore-scripts <local-tarball>',
        global_install: false,
        registry_install: false,
        npm_publish: false,
        npm_token_required: false,
        scripts_ignored: true,
      },
      checks,
      bin_shim_checks: binShimChecks,
      safety: {
        temp_dir_removed: true,
        local_paths_included: false,
        credentials_included: false,
        network_required: false,
        signing_required: false,
      },
      claim_boundary: 'Local packed install smoke only. This proves the source package tarball can install into a temporary npm prefix and run selected entrypoints plus npm bin shims locally; it does not prove npm publication, global install safety, signed installers, hosted service readiness, provider behavior, benchmark superiority, token ROI, or compliance.',
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export function renderLocalPackInstallSmokePlain(report) {
  const lines = [
    'Enigma local packed install smoke',
    `OK: ${report.ok ? 'yes' : 'no'}`,
    `Tarball: ${report.package?.tarball ?? '<unknown>'}`,
    `Install: ${report.install?.command ?? '<unknown>'}`,
    `Checks: ${Array.isArray(report.checks) ? report.checks.length : 0}`,
    `Bin shims: ${Array.isArray(report.bin_shim_checks) ? report.bin_shim_checks.length : 0}`,
  ];
  for (const check of Array.isArray(report.checks) ? report.checks : []) {
    lines.push(`Check: ${check.entrypoint}`);
  }
  for (const check of Array.isArray(report.bin_shim_checks) ? report.bin_shim_checks : []) {
    lines.push(`Bin shim: ${check.bin}`);
  }
  lines.push('Boundary: local temp-prefix install smoke only; no npm publish, token, global install, signing, hosted service, provider behavior, benchmark, token ROI, or compliance claim.');
  return `${lines.join('\n')}\n`;
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = { plain: false, help: false };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--plain' || arg === '--text' || arg === '--format=text') options.plain = true;
    else if (arg === '--json' || arg === '--format=json') options.plain = false;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

async function main() {
  try {
    const options = parseArgs();
    if (options.help) {
      process.stdout.write(usage());
      return 0;
    }
    const report = await runLocalPackInstallSmoke();
    process.stdout.write(options.plain ? renderLocalPackInstallSmokePlain(report) : `${JSON.stringify(report, null, 2)}\n`);
    return report.ok ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${error?.message ?? error}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
