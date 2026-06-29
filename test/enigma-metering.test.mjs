import test from 'node:test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import {
  USAGE_AGGREGATE_SCHEMA,
  USAGE_EVENT_SCHEMA,
  aggregateUsageEvents,
  createUsageEvent,
} from '../packages/metering/src/index.js';

test('usage metering creates deterministic content-minimized memory event', () => {
  const event = createUsageEvent({
    tenant_id: 'tenant-a',
    meter_id: 'memory-prod',
    provider: 'openai',
    model: 'gpt-5.5',
    operation: 'memory.inference',
    timestamp: '2026-06-23T12:00:00.000Z',
    prompt_tokens: 1200,
    completion_tokens: 300,
    memory_baseline_tokens: 1200,
    memory_optimized_tokens: 420,
    pricing: {
      currency: 'USD',
      input_price_per_million_tokens: 2,
      output_price_per_million_tokens: 8,
    },
  });
  assert.equal(event.schema, USAGE_EVENT_SCHEMA);
  assert.equal(event.usage.memory_savings_tokens, 780);
  assert.equal(event.usage.billable_prompt_tokens, 420);
  assert.equal(event.estimated_cost.cost_before_memory, (1200 / 1_000_000) * 2 + (300 / 1_000_000) * 8);
  assert.equal(event.estimated_cost.cost_after_memory, (420 / 1_000_000) * 2 + (300 / 1_000_000) * 8);
  assert.equal(event.settlement_boundary.permissionless_access, true);
  assert.equal(event.settlement_boundary.token_roi_claim, false);
  assert.equal(event.settlement_boundary.provider_invoice_savings_claim, false);
  assert.match(event.event_id, /^uevt_[a-f0-9]{32}$/);
  assert.match(event.event_hash, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(event, createUsageEvent({
    tenant_id: 'tenant-a',
    meter_id: 'memory-prod',
    provider: 'openai',
    model: 'gpt-5.5',
    operation: 'memory.inference',
    timestamp: '2026-06-23T12:00:00.000Z',
    prompt_tokens: 1200,
    completion_tokens: 300,
    memory_baseline_tokens: 1200,
    memory_optimized_tokens: 420,
    pricing: { currency: 'USD', input_price_per_million_tokens: 2, output_price_per_million_tokens: 8 },
  }));
});

test('usage metering aggregates same-currency events by provider and model', () => {
  const first = createUsageEvent({
    tenant_id: 'tenant-a',
    provider: 'openai',
    model: 'gpt-5.5',
    prompt_tokens: 1000,
    completion_tokens: 100,
    memory_baseline_tokens: 1000,
    memory_optimized_tokens: 250,
    price_per_million_tokens: 10,
  });
  const second = createUsageEvent({
    tenant_id: 'tenant-a',
    provider: 'anthropic',
    model: 'claude-opus',
    prompt_tokens: 800,
    completion_tokens: 200,
    memory_baseline_tokens: 800,
    memory_optimized_tokens: 500,
    price_per_million_tokens: 10,
  });
  const aggregate = aggregateUsageEvents({ events: [first, second], generated_at: '2026-06-23T12:00:00.000Z' });
  assert.equal(aggregate.schema, USAGE_AGGREGATE_SCHEMA);
  assert.equal(aggregate.event_count, 2);
  assert.equal(aggregate.totals.memory_baseline_tokens, 1800);
  assert.equal(aggregate.totals.memory_optimized_tokens, 750);
  assert.equal(aggregate.totals.memory_savings_tokens, 1050);
  assert.equal(aggregate.by_provider_model.length, 2);
  assert.equal(aggregate.claim_boundary.some((line) => /not a provider invoice guarantee/i.test(line)), true);
  assert.match(aggregate.aggregate_hash, /^sha256:[a-f0-9]{64}$/);
});

test('usage metering rejects raw content, credential values, and impossible optimization', () => {
  assert.throws(() => createUsageEvent({
    tenant_id: 'tenant-a',
    provider: 'openai',
    model: 'gpt-5.5',
    prompt_tokens: 10,
    completion_tokens: 1,
    memory_baseline_tokens: 10,
    memory_optimized_tokens: 9,
    prompt: 'private memory should not be here',
    price_per_million_tokens: 1,
  }), /not allowed/);

  assert.throws(() => createUsageEvent({
    tenant_id: 'tenant-a',
    provider: 'openai',
    model: 'gpt-5.5',
    prompt_tokens: 10,
    completion_tokens: 1,
    memory_baseline_tokens: 10,
    memory_optimized_tokens: 9,
    meter_id: 'Bearer abcdefghijklmnopqrstuvwxyz',
    price_per_million_tokens: 1,
  }), /secret-looking/);

  assert.throws(() => createUsageEvent({
    tenant_id: 'tenant-a',
    provider: 'openai',
    model: 'gpt-5.5',
    prompt_tokens: 10,
    completion_tokens: 1,
    memory_baseline_tokens: 9,
    memory_optimized_tokens: 10,
    price_per_million_tokens: 1,
  }), /must be <=/);
});

test('usage aggregation rejects mixed currencies and non-events', () => {
  const usd = createUsageEvent({
    tenant_id: 'tenant-a', provider: 'openai', model: 'gpt-5.5', prompt_tokens: 10, completion_tokens: 1, memory_baseline_tokens: 10, memory_optimized_tokens: 5, price_per_million_tokens: 1, pricing: { currency: 'USD', price_per_million_tokens: 1 },
  });
  const eur = createUsageEvent({
    tenant_id: 'tenant-a', provider: 'openai', model: 'gpt-5.5', prompt_tokens: 10, completion_tokens: 1, memory_baseline_tokens: 10, memory_optimized_tokens: 5, pricing: { currency: 'EUR', price_per_million_tokens: 1 },
  });
  assert.throws(() => aggregateUsageEvents([usd, eur]), /same currency/);
  assert.throws(() => aggregateUsageEvents([{ schema: 'not-enigma' }]), /usage event/);
});

function makeIo() {
  let stdout = '';
  let stderr = '';
  return {
    io: {
      stdout: { write: (chunk) => { stdout += chunk; } },
      stderr: { write: (chunk) => { stderr += chunk; } },
    },
    stdout: () => stdout,
    stderr: () => stderr,
    json: () => JSON.parse(stdout),
  };
}

test('CLI emits metering event and aggregate artifacts', async () => {
  const { main } = await import('../apps/cli/bin/enigma.mjs');
  const eventIo = makeIo();
  assert.equal(await main([
    'meter',
    'event',
    '--tenant',
    'tenant-a',
    '--provider',
    'openai',
    '--model',
    'gpt-5.5',
    '--prompt-tokens',
    '1200',
    '--completion-tokens',
    '300',
    '--memory-baseline-tokens',
    '1200',
    '--memory-optimized-tokens',
    '420',
    '--price-per-million-tokens',
    '2',
  ], eventIo.io), 0, eventIo.stderr());
  const event = eventIo.json();
  assert.equal(event.schema, USAGE_EVENT_SCHEMA);
  assert.equal(event.usage.memory_savings_tokens, 780);

  const dir = await mkdtemp(join(tmpdir(), 'enigma-metering-cli-'));
  const eventsPath = join(dir, 'events.json');
  await writeFile(eventsPath, `${JSON.stringify([event], null, 2)}\n`, 'utf8');
  const aggregateIo = makeIo();
  assert.equal(await main(['meter', 'aggregate', '--events', eventsPath, '--tenant', 'tenant-a'], aggregateIo.io), 0, aggregateIo.stderr());
  const aggregate = aggregateIo.json();
  assert.equal(aggregate.schema, USAGE_AGGREGATE_SCHEMA);
  assert.equal(aggregate.event_count, 1);
  assert.equal(aggregate.totals.memory_savings_tokens, 780);
});

test('CLI plain metering output is readable and path-redacted', async () => {
  const { main } = await import('../apps/cli/bin/enigma.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'enigma-metering-plain-'));
  const eventPath = join(dir, 'event.json');
  const eventsPath = join(dir, 'events.json');
  const aggregatePath = join(dir, 'aggregate.json');
  const eventIo = makeIo();

  assert.equal(await main([
    'meter',
    'event',
    '--tenant',
    'tenant-a',
    '--provider',
    'openai',
    '--model',
    'gpt-5.5',
    '--prompt-tokens',
    '1200',
    '--completion-tokens',
    '300',
    '--memory-baseline-tokens',
    '1200',
    '--memory-optimized-tokens',
    '420',
    '--price-per-million-tokens',
    '2',
    '--out',
    eventPath,
    '--plain',
  ], eventIo.io), 0, eventIo.stderr());
  assert.match(eventIo.stdout(), /^Enigma meter event\n/);
  assert.match(eventIo.stdout(), /Status: Ready/);
  assert.match(eventIo.stdout(), /Event: uevt_/);
  assert.match(eventIo.stdout(), /Deterministic memory token delta: 780/);
  assert.match(eventIo.stdout(), /Usage event: written to <out>/);
  assert.match(eventIo.stdout(), /Boundary: local deterministic usage metering only/);
  assert.doesNotMatch(eventIo.stdout(), /^\s*\{/);
  assert.equal(eventIo.stdout().includes(dir), false);
  assert.equal(eventIo.stdout().includes(eventPath), false);

  const event = JSON.parse(await readFile(eventPath, 'utf8'));
  await writeFile(eventsPath, `${JSON.stringify([event], null, 2)}\n`, 'utf8');
  const aggregateIo = makeIo();
  assert.equal(await main([
    'meter',
    'aggregate',
    '--events',
    eventsPath,
    '--tenant',
    'tenant-a',
    '--out',
    aggregatePath,
    '--plain',
  ], aggregateIo.io), 0, aggregateIo.stderr());
  assert.match(aggregateIo.stdout(), /^Enigma meter aggregate\n/);
  assert.match(aggregateIo.stdout(), /Status: Ready/);
  assert.match(aggregateIo.stdout(), /Events: 1/);
  assert.match(aggregateIo.stdout(), /Deterministic memory token delta: 780/);
  assert.match(aggregateIo.stdout(), /Usage aggregate: written to <out>/);
  assert.match(aggregateIo.stdout(), /Boundary: local deterministic aggregate metering only/);
  assert.doesNotMatch(aggregateIo.stdout(), /^\s*\{/);
  assert.equal(aggregateIo.stdout().includes(dir), false);
  assert.equal(aggregateIo.stdout().includes(eventsPath), false);
  assert.equal(aggregateIo.stdout().includes(aggregatePath), false);
});
