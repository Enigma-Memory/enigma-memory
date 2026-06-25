#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {
  createVault,
  remember,
  updateMemory,
  exportBundle,
  importBundle,
} from '../packages/vault/src/index.js';
import {
  createPassport,
  compileContextPack,
  verifyContextPack,
} from '../packages/passport/src/index.js';
import { createMemoryOptimizationPlan } from '../packages/optimizer/src/index.js';
import { verifyBundle } from '../apps/verifier/bin/enigma-verify.mjs';

export const MEMORY_BENCHMARK_SUITE_SCHEMA = 'enigma.memory_benchmark_suite.v1';

const FIXED_NOW = '2026-06-25T00:00:00.000Z';
const FIXED_VAULT_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
const FIXED_ADDRESS_KEY = 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=';
const CONTEXT_BOUNDARY = Object.freeze({
  optimize: true,
  max_estimated_tokens: 512,
  purpose: 'memory_benchmark_context_pack',
  price_per_million_tokens: 0,
  currency: 'USD',
});

const PROVIDER_PROFILES = Object.freeze(['chatgpt', 'claude', 'kimi', 'cursor', 'local-llm']);

const BENCHMARK_CITATIONS = Object.freeze([
  {
    id: 'locomo',
    title: 'LoCoMo long-term conversational memory benchmark',
    url: 'https://snap-research.github.io/locomo/',
    boundary: 'LoCoMo evaluates long-term conversational memory QA, event summarization, and multimodal generation over long multi-session conversations; this local harness is only a deterministic Enigma operations fixture.',
  },
  {
    id: 'longmemeval',
    title: 'LongMemEval',
    url: 'https://arxiv.org/abs/2410.10813',
    boundary: 'LongMemEval covers information extraction, multi-session reasoning, temporal reasoning, knowledge updates, and abstention; this harness mirrors those task types without downloading external datasets.',
  },
  {
    id: 'letta-memory-benchmarks',
    title: 'Letta memory benchmark boundary note',
    url: 'https://www.letta.com/blog/benchmarking-ai-agent-memory/',
    boundary: 'Agent memory benchmark claims depend on framework, tools, and agent behavior as well as the memory store; this report measures local Enigma package operations only.',
  },
]);

const PRIVATE_FIXTURE = Object.freeze({
  sessions: [
    {
      session_id: 'session_001',
      at: '2026-06-20T09:00:00.000Z',
      events: [
        {
          op: 'remember',
          memory_id: 'fact_accent',
          kind: 'preference',
          content: 'User preference record: canonical dashboard accent color is ember orange.',
          tags: ['profile', 'ui'],
          importance: 0.98,
        },
        {
          op: 'remember',
          memory_id: 'fact_region',
          kind: 'fact',
          content: 'Project handoff record: default hosted smoke-test region is eu-west-3.',
          tags: ['project', 'deployment'],
          importance: 0.9,
        },
      ],
    },
    {
      session_id: 'session_002',
      at: '2026-06-21T10:00:00.000Z',
      events: [
        {
          op: 'remember',
          memory_id: 'fact_pager',
          kind: 'fact',
          content: 'Support routing record: pager owner is Iris until 2026-06-23.',
          tags: ['support', 'temporal'],
          importance: 0.75,
        },
        {
          op: 'remember',
          memory_id: 'fact_keynote',
          kind: 'fact',
          content: 'Conference schedule record: keynote moved from 09:00 to 11:30 on Friday.',
          tags: ['schedule', 'temporal'],
          importance: 0.8,
        },
      ],
    },
    {
      session_id: 'session_003',
      at: '2026-06-24T15:30:00.000Z',
      events: [
        {
          op: 'update',
          memory_id: 'fact_pager',
          content: 'Support routing record: pager owner is Rowan starting 2026-06-24.',
          reason: 'benchmark_knowledge_update',
        },
        {
          op: 'remember',
          memory_id: 'fact_region_duplicate',
          kind: 'fact',
          content: 'Project handoff record: default hosted smoke-test region is eu-west-3.',
          tags: ['project', 'deployment', 'duplicate'],
          importance: 0.2,
        },
        {
          op: 'remember',
          memory_id: 'fact_archive',
          kind: 'fact',
          content: 'Private archive marker: the legacy codename is glass-raven.',
          tags: ['archive'],
          importance: 0.35,
        },
      ],
    },
  ],
  questions: [
    {
      id: 'q_exact_preference',
      category: 'exact_answer',
      query: 'Which dashboard accent color should the assistant use?',
      expected: 'ember orange',
      matcher: /accent color is ([^.]+)\./iu,
    },
    {
      id: 'q_exact_region',
      category: 'exact_answer',
      query: 'Which hosted smoke-test region is the current default?',
      expected: 'eu-west-3',
      matcher: /region is ([^.]+)\./iu,
    },
    {
      id: 'q_temporal_update',
      category: 'temporal_update',
      query: 'Who owns the pager after the latest support routing update?',
      expected: 'Rowan',
      matcher: /pager owner is ([A-Za-z-]+) starting/iu,
    },
    {
      id: 'q_temporal_event',
      category: 'temporal_reasoning',
      query: 'What is the revised keynote time?',
      expected: '11:30',
      matcher: /moved from 09:00 to ([0-9:]+) on Friday/iu,
    },
    {
      id: 'q_abstain_phone',
      category: 'abstention',
      query: 'What phone number should billing use?',
      expected: null,
      matcher: null,
    },
  ],
});

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

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function commitment(value) {
  return `sha256:${sha256(value)}`;
}

function publicFixtureSummary() {
  const events = PRIVATE_FIXTURE.sessions.flatMap((session) => session.events);
  return {
    name: 'enigma.local_multi_session_memory_fixture.v1',
    session_count: PRIVATE_FIXTURE.sessions.length,
    private_event_count: events.length,
    question_count: PRIVATE_FIXTURE.questions.length,
    has_facts: true,
    has_updates: events.some((event) => event.op === 'update'),
    has_temporal_questions: PRIVATE_FIXTURE.questions.some((question) => question.category.includes('temporal')),
    has_abstention_questions: PRIVATE_FIXTURE.questions.some((question) => question.category === 'abstention'),
    has_duplicate_candidates: true,
    cross_provider_profiles: [...PROVIDER_PROFILES],
    raw_private_memory_plaintext_included: false,
    fixture_commitment: commitment(JSON.stringify({
      session_count: PRIVATE_FIXTURE.sessions.length,
      event_count: events.length,
      question_count: PRIVATE_FIXTURE.questions.length,
    })),
  };
}

function timed(samples, name, fn) {
  const start = performance.now();
  const value = fn();
  const elapsed = performance.now() - start;
  samples[name].push(Math.max(0, elapsed));
  return value;
}

function percentile(values, ratio) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function latencySummary(samples) {
  const out = {};
  for (const [operation, values] of Object.entries(samples)) {
    out[operation] = {
      samples: values.length,
      p50_ms: Number(percentile(values, 0.5).toFixed(6)),
      p95_ms: Number(percentile(values, 0.95).toFixed(6)),
      min_ms: Number((values.length ? Math.min(...values) : 0).toFixed(6)),
      max_ms: Number((values.length ? Math.max(...values) : 0).toFixed(6)),
    };
  }
  return out;
}

function makeSamples() {
  return {
    remember: [],
    import: [],
    context: [],
    export: [],
    verify: [],
  };
}

function applyFixtureToVault(vault, samples) {
  const byMemoryId = new Map();
  for (const session of PRIVATE_FIXTURE.sessions) {
    for (const event of session.events) {
      if (event.op === 'remember') {
        const result = timed(samples, 'remember', () => remember({
          vault,
          memory_id: event.memory_id,
          kind: event.kind,
          content: event.content,
          purpose_tags: event.tags,
          confidence: 'benchmark_fixture',
          metadata: {
            benchmark_session_id: session.session_id,
            benchmark_event_kind: event.kind,
            benchmark_importance: event.importance,
            private_fixture_commitment: commitment(event.content),
          },
          source_refs: [{ source_hash: commitment(`${session.session_id}:${event.memory_id}`) }],
          now: session.at,
        }));
        byMemoryId.set(event.memory_id, result.memory_addr);
      } else if (event.op === 'update') {
        const oldAddress = byMemoryId.get(event.memory_id);
        if (!oldAddress) throw new Error(`fixture update references unknown memory_id ${event.memory_id}`);
        const result = timed(samples, 'remember', () => updateMemory({
          vault,
          memory_addr: oldAddress,
          content: event.content,
          reason: event.reason,
          now: session.at,
        }));
        byMemoryId.set(event.memory_id, result.memory_addr);
      } else {
        throw new Error(`unsupported fixture operation ${event.op}`);
      }
    }
  }
  return byMemoryId;
}

function packOptions(profile, overrides = {}) {
  return {
    ...CONTEXT_BOUNDARY,
    ...overrides,
    provider: profile,
    model: `${profile}-benchmark-profile`,
    now: FIXED_NOW,
  };
}

function chooseAnswer(question, pack) {
  if (question.expected === null) return { answer: null, abstained: true, correct: true };
  for (const memory of pack.memories ?? []) {
    const content = typeof memory.content === 'string' ? memory.content : '';
    const match = question.matcher?.exec(content);
    if (match?.[1]) {
      const answer = match[1].trim();
      return { answer, abstained: false, correct: answer === question.expected };
    }
  }
  return { answer: null, abstained: true, correct: false };
}

function scoreQuestions(vault, passport, samples) {
  let exactTotal = 0;
  let exactCorrect = 0;
  let abstainTotal = 0;
  let abstainCorrect = 0;
  const byCategory = new Map();
  let firstOptimizationPlan = null;

  for (const question of PRIVATE_FIXTURE.questions) {
    const pack = timed(samples, 'context', () => compileContextPack({
      vault,
      passport,
      query: question.query,
      context_pack_id: `ctx_benchmark_${question.id}`,
      ...packOptions('local-llm'),
    }));
    if (firstOptimizationPlan === null) firstOptimizationPlan = pack.optimization_plan;
    const result = chooseAnswer(question, pack);
    const current = byCategory.get(question.category) ?? { total: 0, correct: 0 };
    current.total += 1;
    if (result.correct) current.correct += 1;
    byCategory.set(question.category, current);
    if (question.category === 'abstention') {
      abstainTotal += 1;
      if (result.abstained && result.correct) abstainCorrect += 1;
    } else {
      exactTotal += 1;
      if (!result.abstained && result.correct) exactCorrect += 1;
    }
  }

  return {
    firstOptimizationPlan,
    qa: {
      question_count: PRIVATE_FIXTURE.questions.length,
      exact_answer_questions: exactTotal,
      exact_answer_correct: exactCorrect,
      exact_answer_recall: exactTotal === 0 ? 0 : Number((exactCorrect / exactTotal).toFixed(6)),
      abstention_questions: abstainTotal,
      abstention_correct: abstainCorrect,
      abstention_correctness: abstainTotal === 0 ? 0 : Number((abstainCorrect / abstainTotal).toFixed(6)),
      by_category: Object.fromEntries([...byCategory.entries()].map(([category, value]) => [category, {
        total: value.total,
        correct: value.correct,
        accuracy: Number((value.correct / value.total).toFixed(6)),
      }])),
      public_question_text_included: false,
      public_answer_text_included: false,
    },
  };
}

function activeOptimizationPlan(vault, query) {
  const candidates = [];
  for (const memoryAddr of vault.activeAddresses ?? []) {
    const record = vault.__getRecord(memoryAddr);
    if (!record || record.state !== 'active') continue;
    candidates.push({
      address: memoryAddr,
      content: vault.__getPlaintext(memoryAddr),
      importance: typeof record.metadata?.benchmark_importance === 'number' ? record.metadata.benchmark_importance : undefined,
      last_accessed_at: record.updated_at ?? record.created_at,
      metadata: {
        kind: record.kind,
        sensitivity: record.sensitivity,
        purpose_tags: record.purpose_tags ?? [],
      },
    });
  }
  return createMemoryOptimizationPlan({
    candidates,
    prompt: query,
    now: FIXED_NOW,
    price_per_million_tokens: 0,
  });
}

function summarizeContextReduction(plan) {
  const baseline = plan?.baseline_prompt_tokens ?? 0;
  const optimized = plan?.optimized_prompt_tokens ?? 0;
  return {
    full_context_baseline_tokens: baseline,
    enigma_context_pack_tokens: optimized,
    token_delta: baseline - optimized,
    reduction_pct: baseline === 0 ? 0 : Number((((baseline - optimized) / baseline) * 100).toFixed(6)),
    estimator: 'estimateTextTokens deterministic local estimator',
    provider_invoice_savings_claim: false,
    roi_claim: false,
  };
}

function compareProviders(vault, passport, samples) {
  const rows = [];
  const query = 'Use the benchmark memory boundary for a cross-provider profile comparison.';
  const fullPlan = activeOptimizationPlan(vault, query);
  for (const profile of PROVIDER_PROFILES) {
    const pack = timed(samples, 'context', () => compileContextPack({
      vault,
      passport,
      query,
      context_pack_id: `ctx_benchmark_profile_${profile.replace(/[^a-z0-9]+/gu, '_')}`,
      ...packOptions(profile),
    }));
    rows.push({
      profile,
      provider_runtime_observed: false,
      external_provider_called: false,
      same_enigma_context_pack_boundary: true,
      boundary: {
        optimize: CONTEXT_BOUNDARY.optimize,
        max_estimated_tokens: CONTEXT_BOUNDARY.max_estimated_tokens,
        purpose: CONTEXT_BOUNDARY.purpose,
      },
      memory_count: pack.memory_addresses.length,
      retrieval_receipt_count: pack.retrieval_receipts.length,
      injection_receipt_count: pack.injection_receipts.length,
      baseline_prompt_tokens: fullPlan.baseline_prompt_tokens,
      optimized_prompt_tokens: fullPlan.optimized_prompt_tokens,
      duplicate_candidates_removed: fullPlan.totals.duplicates_removed,
    });
  }
  return rows;
}

function verifyContextPackPublic(vault, passport, pack) {
  const publicKey = vault.signingKeyPair?.publicKey;
  return verifyContextPack({ contextPack: pack, vault, passport, publicKey });
}

function assertNoRawFixtureLeak(report) {
  const serialized = JSON.stringify(report);
  for (const session of PRIVATE_FIXTURE.sessions) {
    for (const event of session.events) {
      const secret = event.content;
      if (serialized.includes(secret)) throw new Error('benchmark report leaked raw fixture memory text');
    }
  }
  for (const needle of ['ember orange', 'eu-west-3', 'Iris', 'Rowan', '11:30', 'glass-raven']) {
    if (serialized.includes(needle)) throw new Error(`benchmark report leaked private fixture token: ${needle}`);
  }
  return report;
}

export function runMemoryBenchmarkSuite(options = {}) {
  const generatedAt = options.generated_at ?? options.generatedAt ?? new Date().toISOString();
  const samples = makeSamples();
  const vault = createVault({
    vault_id: 'vault_memory_benchmark_fixture',
    tenant_id: 'benchmark-local',
    subject_id: 'benchmark-subject',
    actor_id: 'benchmark-runner',
    policy_id: 'benchmark-local-policy',
    vault_key: FIXED_VAULT_KEY,
    address_key: FIXED_ADDRESS_KEY,
    now: '2026-06-20T08:00:00.000Z',
  });
  applyFixtureToVault(vault, samples);

  const exported = timed(samples, 'export', () => exportBundle({ vault, now: generatedAt }));
  const imported = timed(samples, 'import', () => importBundle({ bundle: exported, now: generatedAt }));
  const importedVault = imported.vault;
  const passport = createPassport({ vault: importedVault, now: generatedAt });

  const scored = scoreQuestions(importedVault, passport, samples);
  const fullOptimizationPlan = activeOptimizationPlan(importedVault, 'Use the benchmark memory boundary for recall and abstention evaluation.');
  const providerRows = compareProviders(importedVault, passport, samples);
  const verificationBundleResults = [];
  for (let index = 0; index < 5; index += 1) {
    verificationBundleResults.push(timed(samples, 'verify', () => verifyBundle(exported)));
  }
  const proofPack = timed(samples, 'context', () => compileContextPack({
    vault: importedVault,
    passport,
    query: 'Verify the benchmark context pack boundary without publishing private memory.',
    context_pack_id: 'ctx_benchmark_verification_boundary',
    ...packOptions('local-llm'),
  }));
  const contextVerification = timed(samples, 'verify', () => verifyContextPackPublic(importedVault, passport, proofPack));

  const report = {
    schema: MEMORY_BENCHMARK_SUITE_SCHEMA,
    generated_at: generatedAt,
    public_safe: true,
    fixture: publicFixtureSummary(),
    benchmark_boundaries: {
      local_only: true,
      credentials_required: false,
      external_downloads_required: false,
      external_provider_calls: false,
      raw_private_memory_plaintext_included: false,
      provider_deletion_claim: false,
      model_forgetting_claim: false,
      roi_or_provider_invoice_savings_claim: false,
      compliance_certification_claim: false,
      benchmark_leadership_claim: false,
      claim_boundary: [
        'This suite measures deterministic local Enigma fixture operations only.',
        'Cross-provider rows use profile labels and the same Enigma context-pack boundary; they do not call or compare live provider models.',
        'Token reduction is a local estimator result against this fixture, not a provider invoice, ROI, guaranteed savings, or benchmark-leadership claim.',
        'Verification proves Enigma-controlled receipts/bundles/context packs only; it is not provider deletion, provider forgetting, model forgetting, or compliance certification evidence.',
      ],
    },
    citations: BENCHMARK_CITATIONS,
    operations_measured: {
      vault_remember_or_update: true,
      vault_export: true,
      vault_import: true,
      context_pack_retrieval: true,
      optimizer_plan_token_estimates: true,
      bundle_verification: true,
      context_pack_verification: true,
      latency_clock: 'performance.now',
    },
    metrics: {
      qa: scored.qa,
      context_token_reduction: summarizeContextReduction(fullOptimizationPlan),
      duplicate_removal: {
        input_candidates: fullOptimizationPlan.totals.input_candidates,
        deduped_candidates: fullOptimizationPlan.totals.deduped_candidates,
        duplicate_candidates_removed: fullOptimizationPlan.totals.duplicates_removed,
      },
      latency: latencySummary(samples),
      verification: {
        bundle_verify_runs: verificationBundleResults.length,
        bundle_verify_ok: verificationBundleResults.every((result) => result.ok === true),
        context_pack_verify_valid: contextVerification.valid === true,
      },
    },
    cross_provider_profiles: providerRows,
  };

  return assertNoRawFixtureLeak(report);
}

async function main() {
  const flags = parseArgs();
  const report = runMemoryBenchmarkSuite({
    generated_at: getFlag(flags, ['generated-at', 'generated_at'], undefined),
  });
  const out = getFlag(flags, ['out']);
  if (out && out !== true) {
    const path = resolve(String(out));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    process.stdout.write(`${JSON.stringify({ ok: true, schema: report.schema, out: isAbsolute(String(out)) ? '<absolute-path-redacted>' : String(out) }, null, 2)}\n`);
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
