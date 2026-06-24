import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  BACKEND_READINESS_SMOKE_SCHEMA,
  runBackendReadinessSmoke,
} from '../scripts/run-backend-readiness-smoke.mjs';

const execFileAsync = promisify(execFile);

test('backend readiness smoke verifies fail-closed and fully referenced fixtures', async () => {
  const result = await runBackendReadinessSmoke({ generated_at: '2026-06-24T00:00:00.000Z' });
  assert.equal(result.schema, BACKEND_READINESS_SMOKE_SCHEMA);
  assert.equal(result.ok, true);
  assert.equal(result.loopback_only, true);
  assert.equal(result.check_count, 4);
  const byKey = new Map(result.checks.map((check) => [`${check.service}:${check.mode}`, check]));
  assert.equal(byKey.get('relay:production-fail-closed').readyz_status, 503);
  assert.equal(byKey.get('gateway:production-fail-closed').readyz_status, 503);
  assert.equal(byKey.get('relay:production-referenced-fixture').readyz_status, 200);
  assert.equal(byKey.get('gateway:production-referenced-fixture').readyz_status, 200);
  assert.equal(byKey.get('relay:production-referenced-fixture').readyz_missing_evidence_ref_count, 0);
  assert.equal(byKey.get('gateway:production-referenced-fixture').readyz_missing_evidence_ref_count, 0);
  assert.ok(result.checks.every((check) => check.public_routes_probed.join(',') === '/livez,/readyz'));
  assert.doesNotMatch(JSON.stringify(result), /Bearer|PRIVATE KEY|sk-|raw memory/i);
});

test('backend readiness smoke rejects non-loopback hosts', async () => {
  await assert.rejects(
    () => runBackendReadinessSmoke({ host: '0.0.0.0', generated_at: '2026-06-24T00:00:00.000Z' }),
    /loopback-only/,
  );
  const result = await execFileAsync(process.execPath, ['scripts/run-backend-readiness-smoke.mjs', '--host', '0.0.0.0'], {
    cwd: process.cwd(),
    timeout: 10000,
    windowsHide: true,
  }).catch((error) => error);
  assert.equal(result.code, 1);
  assert.match(result.stdout, /loopback-only/);
});

test('backend readiness smoke CLI emits public-safe JSON', async () => {
  const result = await execFileAsync(process.execPath, ['scripts/run-backend-readiness-smoke.mjs'], {
    cwd: process.cwd(),
    timeout: 10000,
    windowsHide: true,
  });
  assert.equal(result.stderr, '');
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.schema, BACKEND_READINESS_SMOKE_SCHEMA);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.check_count, 4);
  assert.equal(parsed.checks.filter((check) => check.readyz_status === 503).length, 2);
  assert.equal(parsed.checks.filter((check) => check.readyz_status === 200).length, 2);
  assert.doesNotMatch(result.stdout, /Bearer|PRIVATE KEY|sk-|raw memory/i);
});
