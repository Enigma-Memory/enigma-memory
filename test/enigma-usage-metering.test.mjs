import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createUsageEvent, aggregateUsageEvents } from '../packages/metering/src/index.js';
import { USAGE_METERING_RESULT_SCHEMA, validateUsageMetering } from '../scripts/validate-usage-metering.mjs';

const execFileAsync = promisify(execFile);

function event() {
  return createUsageEvent({
    tenant_id: 'tenant-a',
    meter_id: 'production-meter',
    provider: 'openai',
    model: 'gpt-5.5',
    timestamp: '2026-06-23T12:00:00.000Z',
    prompt_tokens: 1200,
    completion_tokens: 300,
    memory_baseline_tokens: 1200,
    memory_optimized_tokens: 420,
    price_per_million_tokens: 2,
  });
}

test('usage metering validator accepts usage event and aggregate artifacts', () => {
  const usageEvent = event();
  const eventResult = validateUsageMetering(usageEvent, { generated_at: '2026-06-23T12:00:00.000Z' });
  assert.equal(eventResult.schema, USAGE_METERING_RESULT_SCHEMA);
  assert.equal(eventResult.ok, true);
  assert.equal(eventResult.status, 'accepted');
  assert.equal(eventResult.checked.event_count, 1);
  assert.equal(eventResult.checked.memory_savings_tokens, 780);

  const aggregate = aggregateUsageEvents({ events: [usageEvent], tenant_id: 'tenant-a', generated_at: '2026-06-23T12:30:00.000Z' });
  const aggregateResult = validateUsageMetering(aggregate);
  assert.equal(aggregateResult.ok, true);
  assert.equal(aggregateResult.checked.aggregate_schema, 'enigma.usage_aggregate.v1');
  assert.equal(aggregateResult.checked.event_count, 1);
  assert.equal(aggregateResult.checked.memory_savings_tokens, 780);
});

test('usage metering validator aggregates event arrays before accepting', () => {
  const usageEvent = event();
  const result = validateUsageMetering({
    events: [usageEvent],
    tenant_id: 'tenant-a',
    meter_id: 'production-meter',
    generated_at: '2026-06-23T12:30:00.000Z',
  });
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'events');
  assert.equal(result.checked.aggregate_schema, 'enigma.usage_aggregate.v1');
  assert.equal(result.checked.memory_savings_tokens, 780);
});

test('usage metering validator blocks impossible math and unsafe claims', () => {
  const usageEvent = structuredClone(event());
  usageEvent.usage.memory_savings_tokens = 999;
  usageEvent.settlement_boundary.token_roi_claim = true;
  const result = validateUsageMetering(usageEvent);
  assert.equal(result.ok, false);
  const messages = result.blockers.map((entry) => entry.message).join('\n');
  assert.match(messages, /memory_savings_tokens/);
  assert.match(messages, /token_roi_claim/);
});

test('usage metering validator rejects secrets and raw payload fields', () => {
  const usageEvent = event();
  assert.throws(() => validateUsageMetering({ ...usageEvent, prompt: 'private prompt' }), /not allowed|secret/i);
  assert.throws(() => validateUsageMetering({ ...usageEvent, meter_id: 'Bearer abcdefghijklmnopqrstuvwxyz' }), /secret/i);
});

test('usage metering CLI returns blocked result for bad aggregate', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-usage-metering-'));
  const aggregate = aggregateUsageEvents({ events: [event()], tenant_id: 'tenant-a', generated_at: '2026-06-23T12:30:00.000Z' });
  aggregate.event_hashes.push('not-a-hash');
  const path = join(dir, 'usage.json');
  await writeFile(path, `${JSON.stringify(aggregate, null, 2)}\n`, 'utf8');
  const result = await execFileAsync(process.execPath, [
    'scripts/validate-usage-metering.mjs',
    '--metering',
    path,
  ], { cwd: process.cwd(), timeout: 10000, windowsHide: true }).catch((error) => error);
  assert.equal(result.code, 1);
  assert.equal(result.stderr, '');
  const output = JSON.parse(result.stdout);
  assert.equal(output.schema, USAGE_METERING_RESULT_SCHEMA);
  assert.equal(output.ok, false);
  assert.match(JSON.stringify(output.blockers), /event_hashes/);
  assert.doesNotMatch(result.stdout, /Bearer\s+[A-Za-z0-9._~+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@/i);
});
