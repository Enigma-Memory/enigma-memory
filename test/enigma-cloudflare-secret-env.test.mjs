import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  CLOUDFLARE_SECRET_ENV_SCHEMA,
  applyCloudflareSecretEnvFileFromArgv,
  loadCloudflareSecretEnvFile,
  parseCloudflareSecretEnvText,
} from '../scripts/cloudflare-secret-env.mjs';
import { CLOUDFLARE_PAGES_RELEASE_PACKET_SCHEMA } from '../scripts/build-cloudflare-pages-release-packet.mjs';
import { buildWranglerWorkerDeployPlan, parseCloudflareOpsCommand, runCloudflareOpsCommand } from '../scripts/cloudflare-ops.mjs';
import { CLOUDFLARE_CREDENTIALS_RESULT_SCHEMA, validateCloudflareCredentials } from '../scripts/validate-cloudflare-credentials.mjs';

const execFileAsync = promisify(execFile);
const SECRET = 'cf_token_test_value_1234567890';


function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
async function writeEnvFile(dir, body = `CLOUDFLARE_API_TOKEN=${SECRET}\nCLOUDFLARE_ACCOUNT_ID=account-fixture\nCLOUDFLARE_PROJECT_NAME=enigma-memory\nIGNORED_KEY=ignored\n`) {
  const file = join(dir, 'cloudflare.env');
  await writeFile(file, body, 'utf8');
  return file;
}

async function writeSite(dir) {
  const site = join(dir, 'site');
  await mkdir(site, { recursive: true });
  await writeFile(join(site, '_headers'), `/*\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'\n`, 'utf8');
  await writeFile(join(site, 'index.html'), '<!doctype html><html><head><title>Enigma — Verifiable AI memory plane</title></head><body>Launch</body></html>\n', 'utf8');
  return site;
}

test('Cloudflare secret env parser loads only allowed keys without exposing values in metadata', () => {
  const parsed = parseCloudflareSecretEnvText(`export CLOUDFLARE_API_TOKEN='${SECRET}'\nCLOUDFLARE_ACCOUNT_ID=account-fixture\nCLOUDFLARE_PROJECT_NAME=enigma-memory\nOTHER_SECRET=ignored\n`);
  assert.equal(parsed.schema, CLOUDFLARE_SECRET_ENV_SCHEMA);
  assert.deepEqual(parsed.present_keys, ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_PROJECT_NAME']);
  assert.deepEqual(parsed.ignored_keys, ['OTHER_SECRET']);
  assert.equal(parsed.values.CLOUDFLARE_API_TOKEN, SECRET);
  assert.doesNotMatch(JSON.stringify({ present_keys: parsed.present_keys, ignored_keys: parsed.ignored_keys }), /cf_token_test_value/);
});

test('Cloudflare secret env loader strips --cloudflare-env-file and merges env for callers', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-cloudflare-env-'));
  const envFile = await writeEnvFile(dir);
  const applied = await applyCloudflareSecretEnvFileFromArgv(['--cloudflare-env-file', envFile, 'pages', 'deploy'], { CLOUDFLARE_ACCOUNT_ID: 'old-account' }, { includePath: false });
  assert.deepEqual(applied.argv, ['pages', 'deploy']);
  assert.equal(applied.env.CLOUDFLARE_API_TOKEN, SECRET);
  assert.equal(applied.env.CLOUDFLARE_ACCOUNT_ID, 'account-fixture');
  assert.equal(applied.source.path, null);
  assert.deepEqual(applied.loaded_keys, ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_PROJECT_NAME']);
});

test('Cloudflare secret env file rejects malformed non-comment lines', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-cloudflare-env-bad-'));
  const envFile = await writeEnvFile(dir, 'CLOUDFLARE_API_TOKEN=ok\nnot-an-assignment\n');
  await assert.rejects(() => loadCloudflareSecretEnvFile(envFile), /invalid env-file line 2/);
});

test('Cloudflare secret env file read errors do not expose local paths', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-cloudflare-env-missing-'));
  const missingFile = join(dir, 'missing-secret.env');
  await assert.rejects(
    () => loadCloudflareSecretEnvFile(missingFile),
    (error) => {
      assert.match(error.message, /could not be read/i);
      assert.doesNotMatch(error.message, new RegExp(missingFile.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')));
      return true;
    },
  );
});

test('Cloudflare credential validator reports presence without secret values or paths', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-cloudflare-credentials-'));
  const envFile = await writeEnvFile(dir);
  const result = await validateCloudflareCredentials({ envFile, env: {} });
  assert.equal(result.schema, CLOUDFLARE_CREDENTIALS_RESULT_SCHEMA);
  assert.equal(result.ok, true);
  assert.equal(result.credentials_present, true);
  assert.equal(result.source_loaded, true);
  assert.deepEqual(result.missing_keys, []);
  assert.deepEqual(result.present_keys, ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']);
  assert.equal(result.token_value_printed, false);
  assert.equal(result.account_id_printed, false);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(envFile.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')));
  assert.doesNotMatch(JSON.stringify(result), new RegExp(SECRET));
  assert.doesNotMatch(JSON.stringify(result), /account-fixture/);
});

test('Cloudflare credential validator CLI exits blocked without credentials', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-cloudflare-credentials-out-'));
  const out = join(dir, 'credentials-result.json');
  await assert.rejects(
    () => execFileAsync(process.execPath, [
      'scripts/validate-cloudflare-credentials.mjs',
      '--out',
      out,
    ], { cwd: process.cwd(), timeout: 10000, windowsHide: true, env: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '', COMSPEC: process.env.COMSPEC ?? '' } }),
    (error) => {
      assert.equal(error.code, 1);
      assert.doesNotMatch(error.stdout, /Bearer|PRIVATE KEY|sk-|account-fixture|enigma-cloudflare-credentials-out-/i);
      const result = JSON.parse(error.stdout);
      assert.equal(result.schema, CLOUDFLARE_CREDENTIALS_RESULT_SCHEMA);
      assert.equal(result.ok, false);
      assert.equal(result.credentials_present, false);
      assert.deepEqual(result.missing_keys, ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']);
      return true;
    },
  );
  const written = JSON.parse(await readFile(out, 'utf8'));
  assert.equal(written.ok, false);
});

test('Cloudflare Pages packet CLI accepts env file without printing token', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-pages-env-file-'));
  const envFile = await writeEnvFile(dir);
  const site = await writeSite(dir);
  const run = await execFileAsync(process.execPath, [
    'scripts/build-cloudflare-pages-release-packet.mjs',
    '--cloudflare-env-file',
    envFile,
    '--site',
    site,
    '--project-name',
    'enigma-memory',
  ], {
    cwd: process.cwd(),
    env: { ...process.env, CLOUDFLARE_API_TOKEN: '', CLOUDFLARE_ACCOUNT_ID: '' },
    timeout: 10000,
    windowsHide: true,
  });
  assert.equal(run.stderr, '');
  const packet = JSON.parse(run.stdout);
  assert.equal(packet.schema, CLOUDFLARE_PAGES_RELEASE_PACKET_SCHEMA);
  assert.equal(packet.credential_present, true);
  assert.equal(packet.automated_deploy_ready, true);
  assert.equal(packet.deploy_plan.tokenPrinted, false);
  assert.doesNotMatch(run.stdout, new RegExp(SECRET));
});

test('Cloudflare ops dry-run accepts env file without printing token', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-cloudflare-ops-env-file-'));
  const envFile = await writeEnvFile(dir);
  const site = await writeSite(dir);
  const run = await execFileAsync(process.execPath, [
    'scripts/cloudflare-ops.mjs',
    '--cloudflare-env-file',
    envFile,
    'pages',
    'deploy',
    '--site',
    site,
    '--project-name',
    'enigma-memory',
  ], {
    cwd: process.cwd(),
    env: { ...process.env, CLOUDFLARE_API_TOKEN: '', CLOUDFLARE_ACCOUNT_ID: '' },
    timeout: 10000,
    windowsHide: true,
  });
  assert.equal(run.stderr, '');
  const output = JSON.parse(run.stdout);
  assert.equal(output.schema, 'enigma.cloudflare_ops.v1');
  assert.equal(output.operation, 'pages.deploy');
  assert.equal(output.dryRun, true);
  assert.equal(output.plan.tokenPrinted, false);
  assert.doesNotMatch(run.stdout, new RegExp(SECRET));
  assert.doesNotMatch(run.stdout, new RegExp(escapeRegExp(site)));
});

test('Cloudflare ops execute path passes loaded env to Wrangler process', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-cloudflare-ops-exec-env-'));
  const site = await writeSite(dir);
  const env = { CLOUDFLARE_API_TOKEN: SECRET, CLOUDFLARE_ACCOUNT_ID: 'account-fixture' };
  const command = parseCloudflareOpsCommand(['pages', 'deploy', '--site', site, '--project-name', 'enigma-memory', '--execute'], env);
  let observedToken = null;
  const result = await runCloudflareOpsCommand(command, {
    env,
    execFileImpl: async (_command, _args, options) => {
      observedToken = options.env.CLOUDFLARE_API_TOKEN;
      return { stdout: `deployed from ${site} at https://enigma-memory.customer-subdomain.workers.dev`, stderr: '' };
    },
  });
  assert.equal(observedToken, SECRET);
  assert.equal(result.json.schema, 'enigma.cloudflare_ops.v1');
  assert.equal(result.json.operation, 'pages.deploy');
  assert.equal(result.json.tokenPrinted, false);
  assert.doesNotMatch(JSON.stringify(result.json), new RegExp(escapeRegExp(site)));
  assert.doesNotMatch(JSON.stringify(result.json), /customer-subdomain/);
});

test('Cloudflare Worker probe deploy defaults to dry-run and never prints token', async () => {
  const command = parseCloudflareOpsCommand([
    'workers',
    'deploy-probe',
    '--script',
    '.enigma/hosted-probe-worker/worker.mjs',
    '--name',
    'enigma-hosted-probe',
  ], {});
  assert.equal(command.kind, 'workers.deploy-probe');
  assert.equal(command.execute, false);
  const plan = buildWranglerWorkerDeployPlan(command);
  assert.equal(plan.dryRun, true);
  assert.equal(plan.tokenPrinted, false);
  assert.ok(plan.args.includes('deploy'));
  assert.ok(plan.args.includes('enigma-hosted-probe'));
  const result = await runCloudflareOpsCommand(command, {
    execFileImpl: async () => {
      throw new Error('Worker deploy must not execute in dry-run mode');
    },
  });
  assert.equal(result.json.schema, 'enigma.cloudflare_ops.v1');
  assert.equal(result.json.operation, 'workers.deploy-probe');
  assert.equal(result.json.dryRun, true);
  assert.equal(result.json.plan.tokenPrinted, false);
});

test('Cloudflare Worker edge deploy plans custom domains without route DNS shortcuts', async () => {
  const command = parseCloudflareOpsCommand([
    'workers',
    'deploy-edge',
    '--script',
    '.enigma/edge-backend-workers/relay/worker.mjs',
    '--name',
    'enigma-relay',
    '--domain',
    'relay.enigmamemory.com',
  ], {});
  assert.equal(command.kind, 'workers.deploy-edge');
  assert.equal(command.execute, false);
  const plan = buildWranglerWorkerDeployPlan(command);
  assert.equal(plan.dryRun, true);
  assert.equal(plan.tokenPrinted, false);
  assert.ok(plan.args.includes('--domain'));
  assert.ok(plan.args.includes('relay.enigmamemory.com'));
  assert.equal(plan.args.includes('--route'), false);
  assert.throws(() => parseCloudflareOpsCommand([
    'workers',
    'deploy-edge',
    '--script',
    '.enigma/edge-backend-workers/relay/worker.mjs',
    '--name',
    'enigma-relay',
    '--domain',
    'gateway.enigmamemory.com',
  ], {}), /--domain must be relay\.enigmamemory\.com/);
  const result = await runCloudflareOpsCommand(command, {
    execFileImpl: async () => {
      throw new Error('Worker edge deploy must not execute in dry-run mode');
    },
  });
  assert.equal(result.json.schema, 'enigma.cloudflare_ops.v1');
  assert.equal(result.json.operation, 'workers.deploy-edge');
  assert.equal(result.json.dryRun, true);
  assert.equal(result.json.plan.tokenPrinted, false);
});
test('Cloudflare Worker probe execute path passes env to Wrangler process', async () => {
  const env = { CLOUDFLARE_API_TOKEN: SECRET, CLOUDFLARE_ACCOUNT_ID: 'account-fixture' };
  const command = parseCloudflareOpsCommand([
    'workers',
    'deploy-probe',
    '--script',
    'D:\\private\\probe\\worker.mjs',
    '--execute',
  ], env);
  let observedToken = null;
  const result = await runCloudflareOpsCommand(command, {
    env,
    execFileImpl: async (_command, args, options) => {
      observedToken = options.env.CLOUDFLARE_API_TOKEN;
      assert.ok(args.includes('deploy'));
      assert.ok(args.includes('--name'));
      return {
        stdout: 'worker deployed /accounts/11112222333344445555666677778888/workers/services/enigma-hosted-probe https://enigma-hosted-probe.customer-subdomain.workers.dev C:\\Sensitive\\out.txt',
        stderr: 'Logs were written to \"\\\\server\\share\\wrangler-2026-06-24.log\" and \"/home/operator/.wrangler/logs/wrangler-2026-06-24.log\"',
      };
    },
  });
  assert.equal(observedToken, SECRET);
  assert.equal(result.json.operation, 'workers.deploy-probe');
  assert.equal(result.json.dryRun, false);
  assert.equal(result.json.tokenPrinted, false);
  assert.doesNotMatch(JSON.stringify(result.json), new RegExp(SECRET));
  assert.doesNotMatch(JSON.stringify(result.json), /11112222333344445555666677778888|D:\\\\private|C:\\\\Sensitive|\\\\\\\\server|\/home\/operator|wrangler-2026-06-24|customer-subdomain/);
});

test('Cloudflare Worker probe inspection is non-mutating and redacts account ids', async () => {
  const env = { CLOUDFLARE_API_TOKEN: SECRET, CLOUDFLARE_ACCOUNT_ID: '11112222333344445555666677778888' };
  const command = parseCloudflareOpsCommand([
    'workers',
    'inspect-probe',
    '--name',
    'enigma-hosted-probe',
  ], env);
  assert.equal(command.kind, 'workers.inspect-probe');
  const outCommand = parseCloudflareOpsCommand(['workers', 'inspect-probe', '--out', 'worker-inspect.json'], env);
  assert.equal(outCommand.kind, 'workers.inspect-probe');
  assert.equal(outCommand.out, 'worker-inspect.json');

  const observed = [];
  const ok = await runCloudflareOpsCommand(command, {
    env,
    fetchImpl: async (url, init) => {
      observed.push({ url, method: init.method, authorization: init.headers.Authorization });
      return new Response(JSON.stringify({ success: true, result: { id: '11112222333344445555666677778888', service: 'enigma-hosted-probe' } }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  assert.equal(observed[0].method, 'GET');
  assert.equal(observed[0].authorization, `Bearer ${SECRET}`);
  assert.equal(ok.json.ok, true);
  assert.equal(ok.json.mutates_cloudflare, false);
  assert.equal(ok.json.service_observed, true);
  assert.doesNotMatch(JSON.stringify(ok.json), /11112222333344445555666677778888|cf_token_test_value/);

  const blocked = await runCloudflareOpsCommand(command, {
    env,
    fetchImpl: async () => new Response(JSON.stringify({ success: false, errors: [{ code: 10000, message: 'Authentication error /accounts/11112222333344445555666677778888/workers/services/enigma-hosted-probe' }] }), { status: 403, headers: { 'content-type': 'application/json' } }),
  });
  assert.equal(blocked.json.ok, false);
  assert.equal(blocked.json.status, 403);
  assert.match(blocked.json.blockers.join('\n'), /Worker service observation failed/);
  assert.doesNotMatch(JSON.stringify(blocked.json), /11112222333344445555666677778888|cf_token_test_value/);
});

test('Cloudflare Worker probe verification accepts fail-closed and ready states', async () => {
  const failClosedCommand = parseCloudflareOpsCommand([
    'workers',
    'verify-probe',
    '--url',
    'https://enigma-hosted-probe.example.workers.dev',
  ], {});
  const failClosed = await runCloudflareOpsCommand(failClosedCommand, {
    fetchImpl: async (url, init = {}) => {
      assert.equal(init.redirect, 'manual');
      const path = new URL(String(url)).pathname;
      if (path === '/livez') {
        return new Response(JSON.stringify({ ok: true, hosted_probe_only: true, self: 'https://enigma-hosted-probe.example.workers.dev/livez' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (path === '/readyz') {
        return new Response(JSON.stringify({ ok: false, hosted_probe_only: true, missing_evidence_refs: ['ENIGMA_BACKEND_HOST_REF'], self: 'https://enigma-hosted-probe.example.workers.dev/readyz' }), { status: 503, headers: { 'content-type': 'application/json' } });
      }
      return new Response('{}', { status: 404 });
    },
  });
  assert.equal(failClosed.json.ok, true);
  assert.equal(failClosed.json.expected, 'fail-closed');
  assert.equal(failClosed.json.authorization_header_sent, false);
  assert.equal(failClosed.json.base_url, '<hosted-probe-worker-url>');
  assert.equal(failClosed.json.livez.url, '<hosted-probe-worker-url>/livez');
  assert.equal(failClosed.json.readyz.url, '<hosted-probe-worker-url>/readyz');
  assert.deepEqual(failClosed.json.livez.payload, { ok: true, hosted_probe_only: true, missing_evidence_ref_count: null, checks_ok: null, error: null });
  assert.deepEqual(failClosed.json.readyz.payload, { ok: false, hosted_probe_only: true, missing_evidence_ref_count: 1, checks_ok: null, error: null });
  assert.doesNotMatch(JSON.stringify(failClosed.json), /example\.workers\.dev/);

  const readyCommand = parseCloudflareOpsCommand([
    'workers',
    'verify-probe',
    '--url',
    'https://enigma-hosted-probe.example.workers.dev',
    '--expect',
    'ready',
  ], {});
  const ready = await runCloudflareOpsCommand(readyCommand, {
    fetchImpl: async (url, init = {}) => {
      assert.equal(init.redirect, 'manual');
      const path = new URL(String(url)).pathname;
      return new Response(JSON.stringify({ ok: true, hosted_probe_only: true, missing_evidence_refs: path === '/readyz' ? [] : undefined, checks: path === '/readyz' ? [{ name: 'production_evidence_refs', ok: true }] : undefined }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  assert.equal(ready.json.ok, true);
  assert.equal(ready.json.expected, 'ready');

  const incompleteReady = await runCloudflareOpsCommand(readyCommand, {
    fetchImpl: async (url, init = {}) => {
      assert.equal(init.redirect, 'manual');
      const path = new URL(String(url)).pathname;
      return new Response(JSON.stringify({ ok: true, hosted_probe_only: true, missing_evidence_refs: path === '/readyz' ? ['ENIGMA_BACKEND_HOST_REF'] : undefined }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  assert.equal(incompleteReady.json.ok, false);
  assert.match(JSON.stringify(incompleteReady.json.blockers), /missing_evidence_refs:\[\]/);

  const secretProbe = await runCloudflareOpsCommand(failClosedCommand, {
    fetchImpl: async () => new Response(JSON.stringify({ ok: true, hosted_probe_only: true, token: 'Bearer abcdefghijklmnopqrstuvwxyz' }), { status: 200, headers: { 'content-type': 'application/json' } }),
  });
  assert.equal(secretProbe.json.ok, false);
  assert.match(JSON.stringify(secretProbe.json), /not allowed|public-safe/);

  const thrownProbe = await runCloudflareOpsCommand(failClosedCommand, {
    fetchImpl: async (url) => {
      throw new Error(`network failure while fetching ${url}`);
    },
  });
  assert.equal(thrownProbe.json.ok, false);
  assert.match(JSON.stringify(thrownProbe.json), /public JSON endpoint fetch failed/);
  assert.doesNotMatch(JSON.stringify(thrownProbe.json), /example\.workers\.dev/);

  const redirectCommand = parseCloudflareOpsCommand([
    'workers',
    'verify-probe',
    '--url',
    'https://enigma-hosted-probe.example.workers.dev',
  ], {});
  const redirected = await runCloudflareOpsCommand(redirectCommand, {
    fetchImpl: async (_url, init = {}) => {
      assert.equal(init.redirect, 'manual');
      return new Response('', { status: 302, headers: { location: 'https://attacker.example/readyz' } });
    },
  });
  assert.equal(redirected.json.ok, false);
  assert.match(JSON.stringify(redirected.json), /must not redirect/);
});
