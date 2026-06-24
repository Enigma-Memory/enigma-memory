import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  CLOUDFLARE_WORKER_INSPECTION_RESULT_SCHEMA,
  validateCloudflareWorkerInspection,
} from '../scripts/validate-cloudflare-worker-inspect.mjs';

const execFileAsync = promisify(execFile);

function blockedInspection(overrides = {}) {
  return {
    schema: 'enigma.cloudflare_ops.v1',
    operation: 'workers.inspect-probe',
    ok: false,
    execute: true,
    mutates_cloudflare: false,
    service_name: 'enigma-hosted-probe',
    service_observed: false,
    status: 403,
    plan: {
      operation: 'workers.service',
      method: 'GET',
      url: 'https://api.cloudflare.com/client/v4/accounts/<account-id>/workers/services/enigma-hosted-probe',
      requiresToken: true,
      tokenPrinted: false,
      tokenScope: 'account',
    },
    response: {
      status: 403,
      payload: {
        success: false,
        errors: [{ code: 10000, message: 'Authentication error' }],
        messages: [],
        result: null,
      },
    },
    tokenPrinted: false,
    blockers: ['Worker service observation failed: Cloudflare API request failed with HTTP 403'],
    claimBoundary: 'Worker service inspection is non-mutating.',
    ...overrides,
  };
}

function readyInspection() {
  return {
    ...blockedInspection(),
    ok: true,
    service_observed: true,
    status: 200,
    response: {
      status: 200,
      payload: { success: true, errors: [], messages: [], result: { service: 'enigma-hosted-probe' } },
    },
    blockers: [],
  };
}

function missingServiceInspection() {
  return blockedInspection({
    status: 404,
    response: {
      status: 404,
      payload: {
        success: false,
        errors: [{ code: 10090, message: 'This Worker does not exist on this account.' }],
        messages: [],
        result: null,
      },
    },
    blockers: ['Worker service observation failed: Cloudflare API request failed with HTTP 404'],
  });
}

test('Worker inspection validator accepts redacted 403 diagnostic as blocked permission evidence', () => {
  const result = validateCloudflareWorkerInspection(blockedInspection(), { generated_at: '2026-06-24T00:00:00.000Z' });
  assert.equal(result.schema, CLOUDFLARE_WORKER_INSPECTION_RESULT_SCHEMA);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'accepted');
  assert.equal(result.worker_permission_ready, false);
  assert.equal(result.cloudflare_error_code, 10000);
  assert.match(result.permission_blockers.join('\n'), /token\/account permission/);
  assert.equal(result.checked.account_id_redacted, true);
});

test('Worker inspection validator marks 2xx visible service as permission ready only', () => {
  const result = validateCloudflareWorkerInspection(readyInspection(), { generated_at: '2026-06-24T00:00:00.000Z' });
  assert.equal(result.ok, true);
  assert.equal(result.worker_permission_ready, true);
  assert.deepEqual(result.permission_blockers, []);
  assert.match(result.claim_boundary.join('\n'), /does not prove the hosted relay\/gateway infrastructure is live/);
});

test('Worker inspection validator treats redacted 404 as permission-ready missing service evidence', () => {
  const result = validateCloudflareWorkerInspection(missingServiceInspection(), { generated_at: '2026-06-24T00:00:00.000Z' });
  assert.equal(result.ok, true);
  assert.equal(result.worker_permission_ready, true);
  assert.equal(result.service_observed, false);
  assert.equal(result.service_missing, true);
  assert.equal(result.cloudflare_error_code, 10090);
  assert.deepEqual(result.permission_blockers, []);
});

test('Worker inspection validator rejects unsafe or inconsistent evidence', () => {
  assert.throws(() => validateCloudflareWorkerInspection(blockedInspection({
    plan: { ...blockedInspection().plan, url: 'https://api.cloudflare.com/client/v4/accounts/11112222333344445555666677778888/workers/services/enigma-hosted-probe' },
  })), /non-public diagnostic material/);
  assert.throws(() => validateCloudflareWorkerInspection(blockedInspection({ token: 'Bearer abcdefghijklmnopqrstuvwxyz' })), /not allowed|non-public/);
  const inconsistent = readyInspection();
  inconsistent.service_observed = false;
  const result = validateCloudflareWorkerInspection(inconsistent, { generated_at: '2026-06-24T00:00:00.000Z' });
  assert.equal(result.ok, false);
  assert.match(result.blockers.map((item) => item.message).join('\n'), /ok:true requires/);
});

test('Worker inspection validator CLI writes public-safe JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-worker-inspect-validator-'));
  const evidencePath = join(dir, 'worker-inspect.json');
  const outPath = join(dir, 'worker-inspect-result.json');
  await writeFile(evidencePath, `${JSON.stringify(blockedInspection(), null, 2)}\n`, 'utf8');
  const run = await execFileAsync(process.execPath, [
    'scripts/validate-cloudflare-worker-inspect.mjs',
    '--evidence', evidencePath,
    '--out', outPath,
  ], { cwd: process.cwd(), timeout: 10000, windowsHide: true });
  assert.equal(run.stderr, '');
  const stdoutResult = JSON.parse(run.stdout);
  const fileResult = JSON.parse(await readFile(outPath, 'utf8'));
  assert.equal(stdoutResult.schema, CLOUDFLARE_WORKER_INSPECTION_RESULT_SCHEMA);
  assert.deepEqual(fileResult, stdoutResult);
  assert.equal(stdoutResult.worker_permission_ready, false);
  assert.doesNotMatch(run.stdout, /11112222333344445555666677778888|Bearer|PRIVATE KEY|sk-|C:\\Users\\/i);
});

test('Worker inspection validator CLI redacts local paths on read errors', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-worker-inspect-missing-'));
  const missingEvidence = join(dir, 'missing-worker-inspect.json');
  const result = await execFileAsync(process.execPath, [
    'scripts/validate-cloudflare-worker-inspect.mjs',
    '--evidence', missingEvidence,
  ], { cwd: process.cwd(), timeout: 10000, windowsHide: true }).catch((error) => error);
  assert.equal(result.code, 2);
  assert.equal(result.stdout, '');
  assert.doesNotMatch(result.stderr, new RegExp(missingEvidence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(result.stderr, /enigma-worker-inspect-missing-/);
});
