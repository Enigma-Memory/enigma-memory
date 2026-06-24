#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  USAGE_AGGREGATE_SCHEMA,
  USAGE_EVENT_SCHEMA,
  aggregateUsageEvents,
} from '../packages/metering/src/index.js';

export const USAGE_METERING_RESULT_SCHEMA = 'enigma.usage_metering_result.v1';

const SECRET_VALUE_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@|raw memory|private prompt|full transcript|decrypted capsule|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16})/iu;
const FORBIDDEN_KEY_RE = /(?:^|_)(?:raw|plaintext|plain_text|prompt|prompts|message|messages|text|content|document|documents|transcript|response|responses|provider_response|response_body|credential|credentials|api_key|secret|password|private_key|seed|mnemonic)(?:$|_)/iu;
const SAFE_METRIC_KEYS = new Set([
  'prompt_tokens',
  'completion_tokens',
  'memory_baseline_tokens',
  'memory_optimized_tokens',
  'memory_savings_tokens',
  'billable_prompt_tokens',
  'billable_completion_tokens',
  'total_prompt_tokens',
  'total_completion_tokens',
  'total_memory_baseline_tokens',
  'total_memory_optimized_tokens',
  'total_memory_savings_tokens',
]);
const HASH_RE = /^sha256:[0-9a-f]{64}$/;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function blocker(message, path) {
  return { message, path };
}

function assertNoSensitivePayload(value, path = 'usage_metering') {
  if (typeof value === 'string') {
    if (!/\.(claim_boundary\[\d+\]|product_thesis|blockers\[\d+\]\.message)$/.test(path) && SECRET_VALUE_RE.test(value)) throw new Error(`${path} contains secret-looking data`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSensitivePayload(item, `${path}[${index}]`));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (FORBIDDEN_KEY_RE.test(key) && !SAFE_METRIC_KEYS.has(key) && !/^result\.blockers\[\d+\]\.message$/.test(childPath)) throw new Error(`${childPath} is not allowed in usage metering artifacts`);
    assertNoSensitivePayload(child, childPath);
  }
}

function finiteNonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function validUsageEvent(event, blockers, path) {
  if (!isPlainObject(event)) {
    blockers.push(blocker('usage event must be an object', path));
    return false;
  }
  if (event.schema !== USAGE_EVENT_SCHEMA) blockers.push(blocker('usage event schema mismatch', `${path}.schema`));
  if (!HASH_RE.test(String(event.event_hash ?? ''))) blockers.push(blocker('usage event hash must be sha256', `${path}.event_hash`));
  if (!/^uevt_[a-f0-9]{32}$/.test(String(event.event_id ?? ''))) blockers.push(blocker('usage event id must be deterministic uevt hash id', `${path}.event_id`));
  const usage = event.usage;
  if (!isPlainObject(usage)) blockers.push(blocker('usage event usage object is required', `${path}.usage`));
  else {
    for (const field of ['prompt_tokens', 'completion_tokens', 'memory_baseline_tokens', 'memory_optimized_tokens', 'memory_savings_tokens', 'billable_prompt_tokens', 'billable_completion_tokens']) {
      if (!finiteNonNegative(usage[field])) blockers.push(blocker(`${path}.usage.${field} must be non-negative number`, `${path}.usage.${field}`));
    }
    if (finiteNonNegative(usage.memory_baseline_tokens) && finiteNonNegative(usage.memory_optimized_tokens)) {
      if (usage.memory_optimized_tokens > usage.memory_baseline_tokens) blockers.push(blocker('memory_optimized_tokens exceeds baseline', `${path}.usage.memory_optimized_tokens`));
      if (usage.memory_savings_tokens !== usage.memory_baseline_tokens - usage.memory_optimized_tokens) blockers.push(blocker('memory_savings_tokens must equal baseline minus optimized', `${path}.usage.memory_savings_tokens`));
      if (usage.billable_prompt_tokens !== usage.memory_optimized_tokens) blockers.push(blocker('billable_prompt_tokens must equal memory_optimized_tokens', `${path}.usage.billable_prompt_tokens`));
    }
  }
  const settlement = event.settlement_boundary;
  if (!isPlainObject(settlement)) blockers.push(blocker('settlement_boundary is required', `${path}.settlement_boundary`));
  else {
    for (const field of ['token_roi_claim', 'provider_invoice_savings_claim', 'decentralized_inference_claim']) {
      if (settlement[field] !== false) blockers.push(blocker(`${path}.settlement_boundary.${field} must be false`, `${path}.settlement_boundary.${field}`));
    }
    if (settlement.permissionless_access !== true) blockers.push(blocker(`${path}.settlement_boundary.permissionless_access must be true`, `${path}.settlement_boundary.permissionless_access`));
  }
  return true;
}

function validAggregate(aggregate, blockers, path) {
  if (!isPlainObject(aggregate)) {
    blockers.push(blocker('usage aggregate must be an object', path));
    return false;
  }
  if (aggregate.schema !== USAGE_AGGREGATE_SCHEMA) blockers.push(blocker('usage aggregate schema mismatch', `${path}.schema`));
  if (!HASH_RE.test(String(aggregate.aggregate_hash ?? ''))) blockers.push(blocker('usage aggregate hash must be sha256', `${path}.aggregate_hash`));
  if (!/^uagg_[a-f0-9]{32}$/.test(String(aggregate.aggregate_id ?? ''))) blockers.push(blocker('usage aggregate id must be deterministic uagg hash id', `${path}.aggregate_id`));
  if (!Number.isSafeInteger(aggregate.event_count) || aggregate.event_count <= 0) blockers.push(blocker('usage aggregate event_count must be positive integer', `${path}.event_count`));
  if (!Array.isArray(aggregate.event_hashes) || aggregate.event_hashes.length !== aggregate.event_count || aggregate.event_hashes.some((hash) => !HASH_RE.test(String(hash)))) {
    blockers.push(blocker('usage aggregate event_hashes must match event_count and contain sha256 hashes', `${path}.event_hashes`));
  }
  const totals = aggregate.totals;
  if (!isPlainObject(totals)) blockers.push(blocker('usage aggregate totals object is required', `${path}.totals`));
  else {
    for (const field of ['prompt_tokens', 'completion_tokens', 'memory_baseline_tokens', 'memory_optimized_tokens', 'memory_savings_tokens', 'cost_before_memory', 'cost_after_memory', 'estimated_memory_credit']) {
      if (!finiteNonNegative(totals[field])) blockers.push(blocker(`${path}.totals.${field} must be non-negative number`, `${path}.totals.${field}`));
    }
    if (finiteNonNegative(totals.memory_baseline_tokens) && finiteNonNegative(totals.memory_optimized_tokens)) {
      if (totals.memory_optimized_tokens > totals.memory_baseline_tokens) blockers.push(blocker('aggregate optimized tokens exceed baseline', `${path}.totals.memory_optimized_tokens`));
      if (totals.memory_savings_tokens !== totals.memory_baseline_tokens - totals.memory_optimized_tokens) blockers.push(blocker('aggregate memory_savings_tokens must equal baseline minus optimized', `${path}.totals.memory_savings_tokens`));
    }
  }
  if (!Array.isArray(aggregate.claim_boundary) || aggregate.claim_boundary.length === 0) blockers.push(blocker('usage aggregate claim_boundary is required', `${path}.claim_boundary`));
  return true;
}

function normalizeInput(input) {
  if (Array.isArray(input)) return { events: input };
  if (isPlainObject(input) && Array.isArray(input.events)) return { events: input.events, tenant_id: input.tenant_id, meter_id: input.meter_id, generated_at: input.generated_at };
  return { artifact: input };
}

export function validateUsageMetering(input, options = {}) {
  assertNoSensitivePayload(input);
  const normalized = normalizeInput(input);
  const blockers = [];
  let artifact = normalized.artifact;
  let mode = 'artifact';
  let checkedEvents = 0;
  if (normalized.events) {
    mode = 'events';
    normalized.events.forEach((event, index) => validUsageEvent(event, blockers, `events[${index}]`));
    checkedEvents = normalized.events.length;
    if (blockers.length === 0) {
      try {
        artifact = aggregateUsageEvents({
          events: normalized.events,
          tenant_id: normalized.tenant_id,
          meter_id: normalized.meter_id,
          generated_at: normalized.generated_at,
        });
      } catch (error) {
        blockers.push(blocker(error.message, 'events'));
      }
    }
  }
  if (artifact?.schema === USAGE_EVENT_SCHEMA) {
    validUsageEvent(artifact, blockers, 'artifact');
    checkedEvents = Math.max(checkedEvents, 1);
  } else if (artifact?.schema === USAGE_AGGREGATE_SCHEMA) {
    validAggregate(artifact, blockers, 'artifact');
  } else if (!normalized.events) {
    blockers.push(blocker('artifact must be usage event, usage aggregate, or events array', 'artifact.schema'));
  }
  const result = {
    schema: USAGE_METERING_RESULT_SCHEMA,
    generated_at: options.generated_at ?? options.generatedAt ?? new Date(0).toISOString(),
    ok: blockers.length === 0,
    status: blockers.length === 0 ? 'accepted' : 'blocked',
    mode,
    blockers,
    checked: {
      events: checkedEvents,
      aggregate_schema: artifact?.schema === USAGE_AGGREGATE_SCHEMA ? artifact.schema : null,
      event_schema: artifact?.schema === USAGE_EVENT_SCHEMA ? artifact.schema : null,
      memory_savings_tokens: artifact?.usage?.memory_savings_tokens ?? artifact?.totals?.memory_savings_tokens ?? null,
      event_count: artifact?.event_count ?? (artifact?.schema === USAGE_EVENT_SCHEMA ? 1 : 0),
    },
    claim_boundary: [
      'Usage metering validation checks content-minimized Enigma usage math only; it is not a provider invoice guarantee.',
      'A pass result does not claim token ROI, token profit, decentralized inference, provider deletion, model forgetting, or compliance status.',
      'Raw prompts, completions, provider responses, transcripts, decrypted memory, credentials, keys, and seed phrases are forbidden in usage metering artifacts.',
    ],
  };
  assertNoSensitivePayload(result, 'result');
  return result;
}

function parseArgs(argv = process.argv.slice(2)) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq !== -1) flags.set(arg.slice(2, eq), arg.slice(eq + 1));
    else if (!argv[index + 1] || argv[index + 1].startsWith('--')) flags.set(arg.slice(2), true);
    else {
      flags.set(arg.slice(2), argv[index + 1]);
      index += 1;
    }
  }
  return flags;
}

function getFlag(flags, names) {
  for (const name of names) if (flags.has(name)) return flags.get(name);
  return undefined;
}

async function main() {
  const flags = parseArgs();
  const meteringPath = getFlag(flags, ['metering', 'usage', 'in']);
  if (typeof meteringPath !== 'string' || meteringPath.trim() === '') throw new Error('--metering <path> is required');
  const input = JSON.parse(await readFile(resolve(meteringPath), 'utf8'));
  const result = validateUsageMetering(input, { generated_at: new Date().toISOString() });
  const out = getFlag(flags, ['out']);
  const text = `${JSON.stringify(result, null, 2)}\n`;
  if (out && out !== true) {
    const outPath = resolve(String(out));
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, text, 'utf8');
  }
  process.stdout.write(text);
  process.exitCode = result.ok ? 0 : 1;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.name ?? 'Error'}: ${error.message}\n`);
    process.exitCode = 1;
  });
}
