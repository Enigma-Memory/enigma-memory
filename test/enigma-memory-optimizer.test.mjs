import test from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import {
  MEMORY_OPTIMIZATION_PRODUCT_THESIS,
  MEMORY_OPTIMIZATION_PLAN_SCHEMA,
  MEMORY_ACCESS_RECEIPT_SCHEMA,
  estimateTextTokens,
  estimateTokenCost,
  createMemoryOptimizationPlan,
  createMemoryAccessReceipt,
  assertNoRawMemoryOutput,
} from '../packages/optimizer/src/index.js';
import * as optimizerPackage from '@enigma-ai/enigma/optimizer';
import { runMemoryOptimizationBenchmark } from '../scripts/memory-optimization-benchmark.mjs';

const NOW = '2026-06-23T12:00:00.000Z';
const PRICING = { price_per_million_tokens: 2.5, currency: 'USD' };

const MEMORY_A = 'Project Atlas uses a private launch codename and the PASSWORD_LIKE_TEST_SENTINEL must never be emitted.';
const MEMORY_B = 'Project Atlas keeps raw customer notes inside the local vault boundary only.';
const MEMORY_C = 'Do not repeat claims like token ROI, provider forgetting, or a fixed 70% discount from this local note.';
const PROMPT = 'Summarize the Project Atlas operating context without exposing private vault notes.';
const FORBIDDEN_OUTPUT_PATTERNS = [
  /PASSWORD_LIKE_TEST_SENTINEL/u,
  /Project Atlas uses a private launch codename/u,
  /raw customer notes inside the local vault boundary only/u,
  /Summarize the Project Atlas operating context without exposing private vault notes/u,
  /token\s+roi|investment\s+return|revenue\s+share|profit\s+share|token\s+price/u,
  /provider(?:-native)?\s+(?:forgetting|deletion)|model\s+forget(?:s|ting)?|semantic\s+forgetting/u,
  /\b\d{1,2}(?:\.\d+)?%\s+(?:discount|savings|cheaper|cost\s+reduction)\b/u,
];

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function stringifyForLeakCheck(value) {
  return JSON.stringify(value, null, 2);
}

function assertNoForbiddenClaims(value) {
  const serialized = stringifyForLeakCheck(value);
  for (const pattern of FORBIDDEN_OUTPUT_PATTERNS) {
    assert.doesNotMatch(serialized, pattern);
  }
}

function assertNoFixedDiscountFields(value) {
  const visit = (node, path = '') => {
    if (!node || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node)) {
      const childPath = path === '' ? key : `${path}.${key}`;
      if (typeof child === 'number' && /(?:^|_)discount(?:_|$)|discount_?pct|discount_?percent/i.test(key)) {
        assert.fail(`unsupported fixed discount field at ${childPath}`);
      }
      visit(child, childPath);
    }
  };
  visit(value);
}

function candidateHashes(plan) {
  const serialized = stringifyForLeakCheck(plan);
  const hashes = [...serialized.matchAll(/sha256:[a-f0-9]{64}/gu)].map((match) => match[0]);
  return new Set(hashes);
}

function contentHash(text) {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

function round6(value) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function itemByContent(plan, text) {
  const hash = contentHash(text);
  const item = plan.items.find((candidate) => candidate.content_hash === hash);
  assert.ok(item, `missing optimized item for ${hash}`);
  return item;
}

function numericValues(value, keyPattern) {
  const found = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node)) {
      if (typeof child === 'number' && keyPattern.test(key)) found.push(child);
      visit(child);
    }
  };
  visit(value);
  return found;
}


function buildPlan(overrides = {}) {
  return createMemoryOptimizationPlan({
    reference_time: NOW,
    pricing: PRICING,
    prompt: PROMPT,
    candidates: [
      { address: 'mem-a', content: MEMORY_A, importance: 1, last_accessed_at: NOW },
      { address: 'mem-a-duplicate', content: MEMORY_A, importance: 0.1, last_accessed_at: '2026-01-01T00:00:00.000Z' },
      { address: 'mem-b', content: MEMORY_B, importance: 0, last_accessed_at: null },
      { address: 'mem-c', content: MEMORY_C, importance: 0.5, last_accessed_at: '2026-06-01T00:00:00.000Z' },
    ],
    ...overrides,
  });
}

test('package optimizer export mirrors the direct source export', () => {
  assert.equal(optimizerPackage.createMemoryOptimizationPlan, createMemoryOptimizationPlan);
  assert.equal(optimizerPackage.createMemoryAccessReceipt, createMemoryAccessReceipt);
  assert.equal(optimizerPackage.estimateTextTokens, estimateTextTokens);
  assert.equal(optimizerPackage.estimateTokenCost, estimateTokenCost);
  assert.equal(optimizerPackage.assertNoRawMemoryOutput, assertNoRawMemoryOutput);
  assert.equal(optimizerPackage.MEMORY_OPTIMIZATION_PRODUCT_THESIS, MEMORY_OPTIMIZATION_PRODUCT_THESIS);
  assert.equal(optimizerPackage.MEMORY_OPTIMIZATION_PLAN_SCHEMA, MEMORY_OPTIMIZATION_PLAN_SCHEMA);
  assert.equal(optimizerPackage.MEMORY_ACCESS_RECEIPT_SCHEMA, MEMORY_ACCESS_RECEIPT_SCHEMA);
});

test('token and cost estimates are deterministic and derived from explicit pricing', () => {
  const firstTokens = estimateTextTokens(MEMORY_A);
  const secondTokens = estimateTextTokens(MEMORY_A);
  assert.equal(firstTokens, secondTokens);
  assert.equal(Number.isInteger(firstTokens), true);
  assert.ok(firstTokens > 0);

  const firstCost = estimateTokenCost({ tokens: firstTokens, price_per_million_tokens: PRICING.price_per_million_tokens });
  const secondCost = estimateTokenCost({ tokens: firstTokens, price_per_million_tokens: PRICING.price_per_million_tokens });
  assert.deepEqual(firstCost, secondCost);
  assert.equal(firstCost.estimated_cost, (firstTokens / 1_000_000) * PRICING.price_per_million_tokens);

  const cheaperInput = estimateTokenCost({ tokens: firstTokens, price_per_million_tokens: 1.25 });
  assert.equal(cheaperInput.estimated_cost, firstCost.estimated_cost / 2);
});

test('optimization plan is deterministic, deduplicates candidates, and preserves tier evidence', () => {
  const first = buildPlan();
  const second = buildPlan();
  assert.equal(stableStringify(first), stableStringify(second));

  const hashes = candidateHashes(first);
  assert.ok(hashes.has(contentHash(MEMORY_A)));
  assert.ok(hashes.has(contentHash(MEMORY_B)));
  assert.ok(hashes.has(contentHash(MEMORY_C)));
  assert.equal(candidateHashes(second).has(contentHash(MEMORY_A)), true);
  assert.equal(candidateHashes(second).has(contentHash(MEMORY_B)), true);
  assert.equal(candidateHashes(second).has(contentHash(MEMORY_C)), true);

  assert.equal(first.totals.input_candidates, 4);
  assert.equal(first.totals.deduped_candidates, 3);
  assert.equal(first.totals.duplicates_removed, 1);
  assert.equal(first.items.length, 3);
  assert.equal(first.tiers.hot.length, 1);
  assert.equal(first.tiers.warm.length, 1);
  assert.equal(first.tiers.proof_only.length, 1);
  assert.equal(itemByContent(first, MEMORY_A).tier, 'hot');
  assert.equal(itemByContent(first, MEMORY_B).tier, 'proof_only');
  assert.equal(itemByContent(first, MEMORY_C).tier, 'warm');
  const expectedSavings = round6(((first.baseline_prompt_tokens - first.optimized_prompt_tokens) / first.baseline_prompt_tokens) * 100);
  assert.equal(first.savings_pct, expectedSavings);
  assert.equal(first.baseline_cost, estimateTokenCost({ tokens: first.baseline_prompt_tokens, ...PRICING }).estimated_cost);
  assert.equal(first.optimized_cost, estimateTokenCost({ tokens: first.optimized_prompt_tokens, ...PRICING }).estimated_cost);
  assert.match(stringifyForLeakCheck(first), /dedup/i);
});

test('plans and access receipts never expose raw memory plaintext or unsupported claims', () => {
  const plan = buildPlan();
  const hotReceipt = createMemoryAccessReceipt({
    timestamp: NOW,
    plan,
    pricing: PRICING,
    item: itemByContent(plan, MEMORY_A),
  });
  const proofOnlyReceipt = createMemoryAccessReceipt({
    timestamp: NOW,
    plan,
    pricing: PRICING,
    item: itemByContent(plan, MEMORY_B),
  });

  assert.doesNotThrow(() => assertNoRawMemoryOutput(plan));
  assert.doesNotThrow(() => assertNoRawMemoryOutput(hotReceipt));
  assert.doesNotThrow(() => assertNoRawMemoryOutput(proofOnlyReceipt));
  assertNoForbiddenClaims(plan);
  assertNoForbiddenClaims(hotReceipt);
  assertNoForbiddenClaims(proofOnlyReceipt);
  assertNoFixedDiscountFields({ plan, hotReceipt, proofOnlyReceipt });

  const planTokens = numericValues(plan, /tokens?/iu);
  const receiptTokens = numericValues([hotReceipt, proofOnlyReceipt], /tokens?/iu);
  assert.ok(planTokens.some((value) => value > 0));
  assert.ok(receiptTokens.some((value) => value > 0));
  assert.equal(hotReceipt.content_hash, contentHash(MEMORY_A));
  assert.equal(proofOnlyReceipt.content_hash, contentHash(MEMORY_B));
  assert.equal(hotReceipt.estimated_cost, estimateTokenCost({ tokens: hotReceipt.estimated_prompt_tokens, ...PRICING }).estimated_cost);
  assert.equal(proofOnlyReceipt.estimated_cost, estimateTokenCost({ tokens: proofOnlyReceipt.estimated_prompt_tokens, ...PRICING }).estimated_cost);
  assert.throws(() => assertNoRawMemoryOutput({ content: MEMORY_A }));
  assert.throws(() => assertNoRawMemoryOutput({ prompt: PROMPT }));
});

test('permissionless boundary is access, settlement, and receipt anchoring only', () => {
  const plan = buildPlan();
  const receipt = createMemoryAccessReceipt({
    timestamp: NOW,
    plan,
    pricing: PRICING,
    item: itemByContent(plan, MEMORY_A),
  });
  const combined = stringifyForLeakCheck({ thesis: MEMORY_OPTIMIZATION_PRODUCT_THESIS, plan, receipt });

  assert.match(combined, /permissionless/i);
  assert.match(combined, /access/i);
  assert.match(combined, /settlement|receipt anchoring|anchoring/i);
  assert.doesNotMatch(combined, /decentralization\s+for\s+decentralization|ideological\s+decentralization/i);
  assert.deepEqual(receipt.access_boundary, {
    permissionless_access: true,
    settlement: 'external_or_offline_receipt_settlement',
    proof_anchor: 'content_hash_and_commitment_only',
    decentralized_storage_claim: false,
  });
  assertNoForbiddenClaims({ thesis: MEMORY_OPTIMIZATION_PRODUCT_THESIS, plan, receipt });
  assertNoFixedDiscountFields({ thesis: MEMORY_OPTIMIZATION_PRODUCT_THESIS, plan, receipt });
});
test('memory optimization benchmark emits public-safe measured fixture evidence', () => {
  const report = runMemoryOptimizationBenchmark({ generated_at: NOW, price_per_million_tokens: 2.5 });
  assert.equal(report.schema, 'enigma.memory_optimization_benchmark.v1');
  assert.equal(report.corpus.public_candidate_text_included, false);
  assert.equal(report.result.duplicate_candidates_removed, 1);
  assert.ok(report.result.baseline_prompt_tokens >= report.result.optimized_prompt_tokens);
  assert.equal(report.optimization_receipts.length, report.optimization_plan.items.length);
  assert.equal(report.strategy_comparison.schema, 'enigma.memory_strategy_comparison.v1');
  assert.deepEqual(report.strategy_comparison.strategies.map((item) => item.id), [
    'full_context_unverified',
    'deduped_full_context_unreceipted',
    'enigma_receipted_plan',
  ]);
  assert.equal(report.strategy_comparison.strategies.at(-1).access_receipts, true);
  assert.equal(report.strategy_comparison.strategies.at(-1).proof_boundary, true);
  assert.equal(report.strategy_comparison.enigma_vs_full_context.provider_invoice_savings_claim, false);
  assert.equal(report.strategy_comparison.enigma_vs_full_context.universal_discount_claim, false);
  assertNoForbiddenClaims(report);
  assertNoFixedDiscountFields(report);
  assert.doesNotMatch(stringifyForLeakCheck(report), /Project policy|Cost claims|Blockchain is|Support escalation|Old context/);
  assert.doesNotMatch(stringifyForLeakCheck(report), /\"content_hash\"\\s*:/);
  assert.match(stringifyForLeakCheck(report), /claim_boundary/);
});


test('schemas describe plaintext-minimized optimizer artifacts', () => {
  assert.equal(MEMORY_OPTIMIZATION_PLAN_SCHEMA?.type, 'object');
  assert.equal(MEMORY_ACCESS_RECEIPT_SCHEMA?.type, 'object');
  assertNoForbiddenClaims(MEMORY_OPTIMIZATION_PLAN_SCHEMA);
  assertNoForbiddenClaims(MEMORY_ACCESS_RECEIPT_SCHEMA);
  assertNoFixedDiscountFields({ MEMORY_OPTIMIZATION_PLAN_SCHEMA, MEMORY_ACCESS_RECEIPT_SCHEMA });

  const schemaText = stringifyForLeakCheck({ MEMORY_OPTIMIZATION_PLAN_SCHEMA, MEMORY_ACCESS_RECEIPT_SCHEMA });
  assert.match(schemaText, /hash|commitment/i);
  assert.match(schemaText, /token/i);
  assert.doesNotMatch(schemaText, /raw[_ -]?plaintext|raw[_ -]?content|memory[_ -]?plaintext/i);
});
