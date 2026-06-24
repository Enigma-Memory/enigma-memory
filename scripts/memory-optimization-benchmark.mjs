#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import {
  createMemoryAccessReceipt,
  createMemoryOptimizationPlan,
  estimateTextTokens,
} from '../packages/optimizer/src/index.js';

export const MEMORY_OPTIMIZATION_BENCHMARK_SCHEMA = 'enigma.memory_optimization_benchmark.v1';

const DEFAULT_PRICE_PER_MILLION_TOKENS = 2.5;

function parseArgs(argv = process.argv.slice(2)) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      flags.set(arg.slice(2, eq), arg.slice(eq + 1));
    } else if (!argv[index + 1] || argv[index + 1].startsWith('--')) {
      flags.set(arg.slice(2), true);
    } else {
      flags.set(arg.slice(2), argv[index + 1]);
      index += 1;
    }
  }
  return flags;
}

function getFlag(flags, names, fallback = undefined) {
  for (const name of names) if (flags.has(name)) return flags.get(name);
  return fallback;
}

function sha256Like(label) {
  let hash = 0;
  for (let index = 0; index < label.length; index += 1) hash = (hash * 31 + label.charCodeAt(index)) >>> 0;
  return `sha256:${String(hash.toString(16)).padStart(64, '0').slice(0, 64)}`;
}

function fixtureCandidates() {
  const rows = [
    ['mem_auth_policy', 'Project policy: admin routes stay private; public routes expose only readyz and livez.', 0.92],
    ['mem_auth_policy_duplicate', 'Project policy: admin routes stay private; public routes expose only readyz and livez.', 0.7],
    ['mem_cost_boundary', 'Cost claims must be estimate-bound: no universal discount, benchmark lead, or invoice claim without commands and results.', 0.86],
    ['mem_chain_boundary', 'Blockchain is for access, settlement, and proof anchoring only; raw memory never goes on-chain.', 0.82],
    ['mem_support_note', 'Support escalation uses observed facts only and does not claim provider deletion or model forgetting.', 0.58],
    ['mem_old_context', 'Old context can stay proof-only when the task does not need full text.', 0.18],
  ];
  return rows.map(([address, content, importance], index) => ({
    address,
    content,
    importance,
    last_accessed_at: `2026-06-23T12:0${Math.min(index, 5)}:00.000Z`,
    metadata: {
      fixture: 'optimizer-benchmark',
      order: index,
      content_commitment: sha256Like(`${address}:${content.length}`),
    },
  }));
}

function publicItem(item) {
  const out = { ...item };
  if (out.content_hash !== undefined) {
    delete out.content_hash;
    out.content_hash_redacted = true;
  }
  return out;
}

function publicPlan(plan) {
  const tiers = {};
  for (const [tier, items] of Object.entries(plan.tiers ?? {})) tiers[tier] = items.map(publicItem);
  return {
    ...plan,
    tiers,
    items: plan.items.map(publicItem),
  };
}

function publicReceipt(receipt) {
  const out = { ...receipt };
  if (out.content_hash !== undefined) {
    delete out.content_hash;
    out.content_hash_redacted = true;
  }
  return out;
}


function comparativeBaselines(plan, candidates, pricing) {
  const seen = new Set();
  let dedupedFullContextTokens = 0;
  let duplicateCandidatesRemoved = 0;
  for (const candidate of candidates) {
    const content = String(candidate.content ?? '');
    if (seen.has(content)) {
      duplicateCandidatesRemoved += 1;
      continue;
    }
    seen.add(content);
    dedupedFullContextTokens += estimateTextTokens(content);
  }
  const optimizedTokens = plan.optimized_prompt_tokens;
  const baselineTokens = plan.baseline_prompt_tokens;
  return {
    schema: 'enigma.memory_strategy_comparison.v1',
    strategies: [
      {
        id: 'full_context_unverified',
        prompt_tokens: baselineTokens,
        estimated_cost: (baselineTokens / 1_000_000) * pricing.price_per_million_tokens,
        duplicate_candidates_removed: 0,
        access_receipts: false,
        proof_boundary: false,
        public_candidate_text_included: false,
      },
      {
        id: 'deduped_full_context_unreceipted',
        prompt_tokens: dedupedFullContextTokens,
        estimated_cost: (dedupedFullContextTokens / 1_000_000) * pricing.price_per_million_tokens,
        duplicate_candidates_removed: duplicateCandidatesRemoved,
        access_receipts: false,
        proof_boundary: false,
        public_candidate_text_included: false,
      },
      {
        id: 'enigma_receipted_plan',
        prompt_tokens: optimizedTokens,
        estimated_cost: (optimizedTokens / 1_000_000) * pricing.price_per_million_tokens,
        duplicate_candidates_removed: plan.totals.duplicates_removed,
        access_receipts: true,
        proof_boundary: true,
        public_candidate_text_included: false,
      },
    ],
    enigma_vs_full_context: {
      prompt_token_delta: baselineTokens - optimizedTokens,
      prompt_token_reduction_pct: baselineTokens === 0 ? 0 : Number((((baselineTokens - optimizedTokens) / baselineTokens) * 100).toFixed(6)),
      access_receipts_added: true,
      raw_text_publication_removed: true,
      provider_invoice_savings_claim: false,
      universal_discount_claim: false,
    },
    claim_boundary: [
      'Strategy comparison is computed on a repository fixture only.',
      'Lower prompt_tokens is a local estimator result, not a provider invoice or universal discount claim.',
      'Unreceipted strategies may use fewer tokens but do not provide Enigma receipt/proof boundaries.',
    ],
  };
}
export function runMemoryOptimizationBenchmark(options = {}) {
  const generatedAt = options.generated_at ?? options.generatedAt ?? new Date().toISOString();
  const pricing = {
    currency: options.currency ?? 'USD',
    price_per_million_tokens: Number(options.price_per_million_tokens ?? options.pricePerMillionTokens ?? DEFAULT_PRICE_PER_MILLION_TOKENS),
  };
  if (!Number.isFinite(pricing.price_per_million_tokens) || pricing.price_per_million_tokens < 0) {
    throw new Error('price_per_million_tokens must be a non-negative number');
  }
  const plan = createMemoryOptimizationPlan({
    candidates: fixtureCandidates(),
    prompt: 'Prepare the production memory-layer launch answer with security and claim boundaries.',
    pricing,
    now: '2026-06-23T12:06:00.000Z',
  });
  const receipts = plan.items.map((item, index) => createMemoryAccessReceipt({
    item,
    plan,
    timestamp: generatedAt,
    sequence: index,
    pricing,
  }));
  const report = {
    schema: MEMORY_OPTIMIZATION_BENCHMARK_SCHEMA,
    generated_at: generatedAt,
    corpus: {
      name: 'enigma.optimizer.fixture.v1',
      private_candidate_count: fixtureCandidates().length,
      public_candidate_text_included: false,
    },
    strategy_comparison: comparativeBaselines(plan, fixtureCandidates(), pricing),
    method: {
      tokenizer: 'estimateTextTokens deterministic local estimator',
      planner: 'createMemoryOptimizationPlan',
      pricing_input: pricing,
      claim_boundary: [
        'This is a fixture benchmark for repository behavior only.',
        'savings_pct is estimated prompt-token reduction for these inputs, not provider invoice savings.',
        'No external-deletion, external-forgetting, crypto-return, compliance, or universal-discount claim is made.',
      ],
    },
    result: {
      baseline_prompt_tokens: plan.baseline_prompt_tokens,
      optimized_prompt_tokens: plan.optimized_prompt_tokens,
      savings_pct: plan.savings_pct,
      baseline_cost: plan.baseline_cost,
      optimized_cost: plan.optimized_cost,
      duplicate_candidates_removed: plan.totals.duplicates_removed,
      deduped_candidates: plan.totals.deduped_candidates,
      tiers: Object.fromEntries(Object.entries(plan.tiers).map(([tier, items]) => [tier, items.length])),
    },
    optimization_plan: publicPlan(plan),
    optimization_receipts: receipts.map(publicReceipt),
  };
  const serialized = JSON.stringify(report);
  if (/Project policy|Cost claims|Blockchain is|Support escalation|Old context/i.test(serialized)) {
    throw new Error('benchmark report leaked private fixture text');
  }
  return report;
}

async function main() {
  const flags = parseArgs();
  const report = runMemoryOptimizationBenchmark({
    price_per_million_tokens: getFlag(flags, ['price-per-million-tokens', 'pricePerMillionTokens'], DEFAULT_PRICE_PER_MILLION_TOKENS),
    currency: getFlag(flags, ['currency'], 'USD'),
  });
  const out = getFlag(flags, ['out']);
  if (out && out !== true) {
    const path = resolve(String(out));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    process.stdout.write(`${JSON.stringify({ ok: true, schema: report.schema, out: path, result: report.result }, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const modulePath = fileURLToPath(import.meta.url);
if (invokedPath === modulePath) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
