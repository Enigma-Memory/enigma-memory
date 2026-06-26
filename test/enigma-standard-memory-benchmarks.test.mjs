import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import {
  STANDARD_MEMORY_BENCHMARK_PROTOCOL_PLAN_SCHEMA,
  STANDARD_MEMORY_BENCHMARK_SUITE_SCHEMA,
  buildStandardBenchmarkDryRunPlan,
  buildStandardBenchmarkProtocolPlan,
  parseLocomoDataset,
  parseLongMemEvalDataset,
  runStandardMemoryBenchmarkSuite,
  runStandardMemoryBenchmarkSuiteFromFiles,
} from '../scripts/run-standard-memory-benchmarks.mjs';
import { buildBenchmarkProofRelease } from '../scripts/build-benchmark-proof-release.mjs';

const LOCOMO_SENTINELS = [
  'violet-penguin-door',
  'amber-otter-safe',
  'Which private paired facts matter?',
  'private paired answer',
];

const LONGMEMEVAL_SENTINELS = [
  'cedar-invoice-folder',
  'silver-lantern-value',
  'Where is the cedar invoice stored?',
  'private longmem answer',
];

const LOCOMO_FIXTURE = [
  {
    sample_id: 'synthetic-locomo-1',
    conversation: {
      session_1: [
        { speaker: 'speaker_a', dia_id: '1', text: 'violet-penguin-door alpha preference record' },
        { speaker: 'speaker_b', dia_id: '2', text: 'unrelated lunch note' },
      ],
      session_2: [
        { speaker: 'speaker_a', dia_id: '1', text: 'amber-otter-safe beta update record' },
      ],
    },
    qa: [
      {
        question: 'Which private paired facts matter for alpha beta?',
        answer: 'private paired answer',
        evidence: ['D1:1; D2:1'],
        category: 'multi-hop',
      },
      {
        question: 'Which single alpha fact matters?',
        answer: 'private single answer',
        evidence: ['D1:1'],
        category: 'single-hop',
      },
    ],
  },
];

const LONGMEMEVAL_FIXTURE = [
  {
    question_id: 'lm-1',
    question_type: 'single-session-user',
    question: 'Where is the cedar invoice stored?',
    answer: 'private longmem answer',
    answer_session_ids: ['s1'],
    haystack_session_ids: ['s0', 's1'],
    haystack_sessions: [
      [{ role: 'user', content: 'ordinary unrelated note' }],
      [{ role: 'assistant', content: 'cedar-invoice-folder silver-lantern-value', has_answer: true }],
    ],
  },
  {
    question_id: 'lm-2_abs',
    question_type: 'abs',
    question: 'Where is the missing comet value?',
    answer: 'no answer',
    answer_session_ids: [],
    haystack_session_ids: ['s2'],
    haystack_sessions: [
      [{ role: 'user', content: 'ordinary non-answer note' }],
    ],
  },
];

const LOCOMO_RELEVANCE_FIXTURE = [
  {
    sample_id: 'synthetic-locomo-relevance',
    conversation: {
      session_1: [
        { speaker: 'speaker_a', dia_id: '1', text: 'cook' },
        { speaker: 'speaker_b', dia_id: '2', text: 'parking note' },
      ],
      session_2: [
        { speaker: 'speaker_b', dia_id: '1', text: 'window' },
      ],
    },
    qa: [
      {
        question: 'Who was cooking?',
        answer: 'private stem answer',
        evidence: ['D1:1'],
        category: 'single-hop',
      },
      {
        question: 'What did speaker_b mention in session 2?',
        answer: 'private session answer',
        evidence: ['D2:1'],
        category: 'single-hop',
      },
    ],
  },
];

const LONGMEMEVAL_RELEVANCE_FIXTURE = [
  {
    question_id: 'lm-role-relevance',
    question_type: 'single-session',
    question: 'What did the user say in session blue?',
    answer: 'private role answer',
    answer_session_ids: ['blue'],
    haystack_session_ids: ['noise', 'blue'],
    haystack_sessions: [
      [{ role: 'assistant', content: 'ordinary unrelated note' }],
      [{ role: 'user', content: 'brief response marker', has_answer: true }],
    ],
  },
  {
    question_id: 'lm-phrase-relevance',
    question_type: 'single-session',
    question: 'Where was blue garden marker?',
    answer: 'private phrase answer',
    answer_session_ids: ['phrase_evidence'],
    haystack_session_ids: ['phrase_evidence', 'phrase_noise'],
    haystack_sessions: [
      [{ role: 'assistant', content: 'blue garden marker', has_answer: true }],
      [{ role: 'assistant', content: 'garden note says blue item marker elsewhere' }],
    ],
  },
];

function serialize(value) {
  return JSON.stringify(value, null, 2);
}

function methodById(row, id) {
  return Object.fromEntries(row.methods.map((method) => [method.id, method]))[id];
}

test('standard benchmark parses LoCoMo sessions and semicolon evidence labels', () => {
  const parsed = parseLocomoDataset(LOCOMO_FIXTURE);

  assert.equal(parsed.records.length, 3);
  assert.deepEqual([...parsed.queries[0].evidence_dialog_ids].sort(), ['D1:1', 'D2:1']);
  assert.deepEqual([...parsed.queries[1].evidence_dialog_ids], ['D1:1']);
});

test('standard benchmark parses LongMemEval evidence turns, sessions, and abstention ids', () => {
  const parsed = parseLongMemEvalDataset(LONGMEMEVAL_FIXTURE);

  assert.equal(parsed.records.length, 3);
  assert.deepEqual([...parsed.queries[0].evidence_turn_ids], ['s1:0']);
  assert.deepEqual([...parsed.queries[0].evidence_session_ids], ['s1']);
  assert.equal(parsed.queries[0].abstention, false);
  assert.equal(parsed.queries[1].abstention, true);
});

test('standard benchmark suite scores official-dataset retrieval proxies without raw text leakage', () => {
  const report = runStandardMemoryBenchmarkSuite({
    generated_at: '2026-06-25T00:00:00.000Z',
    locomoData: LOCOMO_FIXTURE,
    longMemEvalData: LONGMEMEVAL_FIXTURE,
    top_k: 2,
  });

  assert.equal(report.schema, STANDARD_MEMORY_BENCHMARK_SUITE_SCHEMA);
  assert.equal(report.schema, 'enigma.standard_memory_benchmark_suite.v1');
  assert.equal(report.public_safe, true);
  assert.equal(report.benchmark_boundaries.external_provider_calls, false);
  assert.equal(report.benchmark_boundaries.llm_answer_accuracy_scored, false);
  assert.equal(report.benchmark_boundaries.retrieval_evidence_proxy_scored, true);
  assert.deepEqual(report.datasets.map((row) => row.id), ['locomo', 'longmemeval']);
  assert.deepEqual(report.local_methods.map((row) => row.id), ['full_context', 'recency_last_n', 'keyword_filter', 'enigma_relevance']);

  const text = serialize(report);
  for (const sentinel of [...LOCOMO_SENTINELS, ...LONGMEMEVAL_SENTINELS]) {
    assert.doesNotMatch(text, new RegExp(sentinel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
  }
  assert.doesNotMatch(text, /"content"\s*:/u);
  assert.doesNotMatch(text, /"question"\s*:/u);
  assert.doesNotMatch(text, /"answer"\s*:/u);
  assert.doesNotMatch(text, /benchmark leadership|provider deletion|model forgetting/iu);
  assert.equal(report.command_boundaries.network_calls_made, false);
  assert.equal(report.command_boundaries.provider_api_calls_made, false);
  assert.equal(report.command_boundaries.api_spend_possible, false);
  assert.equal(report.command_boundaries.mem0_adapter_run, false);
  assert.equal(report.command_boundaries.gold_labels_used_for_retrieval, false);
  assert.equal(report.command_boundaries.gold_labels_used_for_scoring, true);
  assert.equal(report.apples_to_apples_controls.same_top_k_for_all_methods, true);
  assert.equal(report.apples_to_apples_controls.local_deterministic_methods_only, true);
  assert.equal(report.relevance_logic.gold_labels_used_for_retrieval, false);
  assert.deepEqual(report.external_competitor_adapters.map((row) => row.id), ['mem0']);
  assert.equal(report.external_competitor_adapters[0].scores_included, false);
  assert.equal(report.external_competitor_adapters[0].can_run_in_this_harness, false);
  assert.equal(Object.prototype.hasOwnProperty.call(report.external_competitor_adapters[0], 'recall'), false);
});

test('standard benchmark dry run prints offline plan without scores or dataset reads', () => {
  const plan = buildStandardBenchmarkDryRunPlan({
    generated_at: '2026-06-25T00:00:00.000Z',
    locomo: 'locomo10.json',
    longmemeval: 'longmemeval_s_cleaned.json',
    max_locomo_qa: 10,
    max_longmemeval_items: 11,
    top_k: 4,
  });

  assert.equal(plan.schema, 'enigma.standard_memory_benchmark_plan.v1');
  assert.equal(plan.public_safe, true);
  assert.equal(plan.dry_run, true);
  assert.equal(plan.top_k, 4);
  assert.deepEqual(plan.datasets_planned.map((row) => row.local_file_name), ['locomo10.json', 'longmemeval_s_cleaned.json']);
  assert.deepEqual(plan.datasets_planned.map((row) => row.sample_limit), [10, 11]);
  assert.equal(plan.command_boundaries.dataset_files_read_from_local_disk, false);
  assert.equal(plan.command_boundaries.benchmark_scores_included, false);
  assert.equal(plan.command_boundaries.provider_api_calls_made, false);
  assert.equal(plan.command_boundaries.api_spend_possible, false);
  assert.equal(plan.command_boundaries.mem0_adapter_run, false);
  assert.equal(plan.command_boundaries.gold_labels_used_for_retrieval, false);
  assert.equal(plan.command_boundaries.gold_labels_used_for_scoring, false);
  assert.equal(plan.apples_to_apples_controls.same_top_k_for_all_methods, true);
  assert.deepEqual(plan.external_competitor_adapters.map((row) => row.id), ['mem0']);
  assert.equal(plan.external_competitor_adapters[0].scores_included, false);
  assert.equal(plan.external_competitor_adapters[0].can_run_in_this_harness, false);
});
test('standard benchmark gives Enigma lower or equal tokens than full context at nonzero recall', () => {
  const report = runStandardMemoryBenchmarkSuite({
    generated_at: '2026-06-25T00:00:00.000Z',
    locomoData: LOCOMO_FIXTURE,
    longMemEvalData: LONGMEMEVAL_FIXTURE,
    top_k: 2,
  });
  const locomo = report.datasets.find((row) => row.id === 'locomo');
  const longmemeval = report.datasets.find((row) => row.id === 'longmemeval');

  const locomoFull = methodById(locomo, 'full_context');
  const locomoEnigma = methodById(locomo, 'enigma_relevance');
  assert.ok(locomoEnigma.evidence_hit_at_k > 0);
  assert.ok(locomoEnigma.estimated_prompt_tokens.total <= locomoFull.estimated_prompt_tokens.total);
  assert.ok(locomoEnigma.selected_memory_count.total <= locomoFull.selected_memory_count.total);

  const longFull = methodById(longmemeval, 'full_context');
  const longEnigma = methodById(longmemeval, 'enigma_relevance');
  assert.ok(longEnigma.turn_evidence_hit_at_k > 0);
  assert.ok(longEnigma.session_evidence_hit_at_k > 0);
  assert.equal(longEnigma.abstention_questions, 1);
  assert.equal(longEnigma.abstention_correct, 1);
  assert.ok(longEnigma.estimated_prompt_tokens.total <= longFull.estimated_prompt_tokens.total);
  assert.ok(longEnigma.selected_memory_count.total <= longFull.selected_memory_count.total);

  for (const row of report.datasets.flatMap((dataset) => dataset.methods)) {
    assert.equal(row.local_method_only, true);
    assert.equal(row.external_provider_called, false);
    assert.equal(row.retrieval_proxy_only, true);
    assert.equal(typeof row.latency.p50_ms, 'number');
    assert.equal(typeof row.latency.p95_ms, 'number');
  }
});

test('standard benchmark enhanced relevance can hit evidence that keyword filtering misses', () => {
  const report = runStandardMemoryBenchmarkSuite({
    generated_at: '2026-06-25T00:00:00.000Z',
    locomoData: LOCOMO_RELEVANCE_FIXTURE,
    longMemEvalData: LONGMEMEVAL_RELEVANCE_FIXTURE,
    top_k: 1,
  });
  const locomo = report.datasets.find((row) => row.id === 'locomo');
  const longmemeval = report.datasets.find((row) => row.id === 'longmemeval');

  const locomoFull = methodById(locomo, 'full_context');
  const locomoKeyword = methodById(locomo, 'keyword_filter');
  const locomoEnigma = methodById(locomo, 'enigma_relevance');
  assert.equal(locomoKeyword.evidence_hit_at_k, 0);
  assert.equal(locomoEnigma.evidence_hit_at_k, 1);
  assert.equal(locomoEnigma.exact_evidence_coverage, 1);
  assert.ok(locomoEnigma.estimated_prompt_tokens.total <= locomoFull.estimated_prompt_tokens.total);

  const longFull = methodById(longmemeval, 'full_context');
  const longKeyword = methodById(longmemeval, 'keyword_filter');
  const longEnigma = methodById(longmemeval, 'enigma_relevance');
  assert.equal(longKeyword.turn_evidence_hit_at_k, 0);
  assert.equal(longKeyword.session_evidence_hit_at_k, 0);
  assert.equal(longEnigma.turn_evidence_hit_at_k, 1);
  assert.equal(longEnigma.session_evidence_hit_at_k, 1);
  assert.equal(longEnigma.exact_turn_evidence_coverage, 1);
  assert.equal(longEnigma.exact_session_evidence_coverage, 1);
  assert.ok(longEnigma.estimated_prompt_tokens.total <= longFull.estimated_prompt_tokens.total);
});

test('standard benchmark suite reads downloaded dataset files from local paths', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-standard-bench-'));
  try {
    const locomoPath = join(dir, 'locomo10.json');
    const longPath = join(dir, 'longmemeval_s_cleaned.json');
    await writeFile(locomoPath, JSON.stringify(LOCOMO_FIXTURE), 'utf8');
    await writeFile(longPath, JSON.stringify(LONGMEMEVAL_FIXTURE), 'utf8');

    const report = await runStandardMemoryBenchmarkSuiteFromFiles({
      generated_at: '2026-06-25T00:00:00.000Z',
      locomo: locomoPath,
      longmemeval: longPath,
      top_k: 2,
    });

    assert.equal(report.schema, STANDARD_MEMORY_BENCHMARK_SUITE_SCHEMA);
    assert.deepEqual(report.datasets.map((row) => row.local_file_name), ['locomo10.json', 'longmemeval_s_cleaned.json']);
    for (const row of report.datasets) assert.match(row.input_sha256, /^[a-f0-9]{64}$/u);
    assert.equal(methodById(report.datasets[0], 'enigma_relevance').evidence_hit_at_k, 1);
    assert.equal(methodById(report.datasets[1], 'enigma_relevance').abstention_correctness, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('standard benchmark LongMemEval sample mode limits local-file parsing without raw text leakage', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-standard-bench-'));
  try {
    const skippedRawText = 'trailing-only-ultraviolet-key';
    const locomoPath = join(dir, 'locomo10.json');
    const longPath = join(dir, 'longmemeval_s_cleaned.json');
    const locomoBody = JSON.stringify(LOCOMO_FIXTURE);
    const body = JSON.stringify([
      ...LONGMEMEVAL_FIXTURE,
      {
        question_id: 'lm-3',
        question_type: 'single-session-user',
        question: 'Where does the trailing-only-ultraviolet-key appear?',
        answer: 'private skipped longmem answer',
        answer_session_ids: ['s3'],
        haystack_session_ids: ['s3'],
        haystack_sessions: [
          [{ role: 'assistant', content: skippedRawText, has_answer: true }],
        ],
      },
    ]);
    await writeFile(locomoPath, locomoBody, 'utf8');
    await writeFile(longPath, body, 'utf8');

    const report = await runStandardMemoryBenchmarkSuiteFromFiles({
      generated_at: '2026-06-25T00:00:00.000Z',
      locomo: locomoPath,
      longmemeval: longPath,
      max_locomo_qa: 1,
      max_longmemeval_items: 1,
      top_k: 2,
    });

    assert.equal(report.datasets.length, 2);
    const locomo = report.datasets.find((row) => row.id === 'locomo');
    const dataset = report.datasets.find((row) => row.id === 'longmemeval');
    assert.equal(locomo.question_count, 1);
    assert.equal(dataset.question_count, 1);
    assert.equal(dataset.item_count, 1);
    assert.equal(dataset.record_count, 2);
    assert.equal(dataset.input_sha256, createHash('sha256').update(body).digest('hex'));
    assert.equal(methodById(dataset, 'enigma_relevance').abstention_questions, 0);

    const text = serialize(report);
    assert.doesNotMatch(text, new RegExp(skippedRawText, 'u'));
    for (const sentinel of [...LOCOMO_SENTINELS, ...LONGMEMEVAL_SENTINELS]) {
      assert.doesNotMatch(text, new RegExp(sentinel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
    }
    assert.doesNotMatch(text, /"content"\s*:/u);
    assert.doesNotMatch(text, /"question"\s*:/u);
    assert.doesNotMatch(text, /"answer"\s*:/u);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

const PROTOCOL_PLAN_OPTIONS = {
  generated_at: '2026-06-26T00:00:00.000Z',
  locomo: 'locomo10.json',
  longmemeval: 'longmemeval_s_cleaned.json',
  max_locomo_qa: 25,
  max_longmemeval_items: 25,
  top_k: 4,
};

test('standard benchmark protocol plan records full-answer readiness without network or providers', () => {
  const plan = buildStandardBenchmarkProtocolPlan(PROTOCOL_PLAN_OPTIONS);

  assert.equal(plan.schema, STANDARD_MEMORY_BENCHMARK_PROTOCOL_PLAN_SCHEMA);
  assert.equal(plan.schema, 'enigma.standard_memory_benchmark_protocol_plan.v1');
  assert.equal(plan.public_safe, true);
  assert.equal(plan.protocol_plan, true);
  assert.equal(plan.dry_run, true);
  assert.equal(plan.top_k, 4);
  assert.deepEqual(plan.datasets_planned.map((row) => row.id), ['locomo', 'longmemeval']);
  assert.ok(plan.category_set.includes('multi-session QA'));
  assert.ok(plan.category_set.includes('abstention'));
  assert.equal(plan.answerer.model_ref, 'model:answerer-not-selected');
  assert.equal(plan.judge.model_ref, 'model:judge-not-selected');
  assert.equal(plan.answerer.fixed, false);
  assert.equal(plan.judge.fixed, false);
  assert.equal(plan.prompt_refs.length, 2);
  assert.equal(plan.protocol_refs.length, 1);
  assert.ok(plan.competitor_adapter_refs.includes('adapter:mem0@not-pinned'));

  assert.equal(plan.protocol_boundaries.network_required, false);
  assert.equal(plan.protocol_boundaries.provider_calls_made, false);
  assert.equal(plan.protocol_boundaries.answers_generated, false);
  assert.equal(plan.protocol_boundaries.judged, false);
  assert.equal(plan.protocol_boundaries.competitor_adapters_run, false);
  assert.equal(plan.protocol_boundaries.api_spend_possible, false);
  assert.equal(plan.command_boundaries.network_calls_made, false);
  assert.equal(plan.command_boundaries.provider_api_calls_made, false);
  assert.equal(plan.command_boundaries.api_spend_possible, false);
  assert.equal(plan.command_boundaries.mem0_adapter_run, false);
  assert.equal(plan.benchmark_boundaries.llm_answer_accuracy_scored, false);
  assert.equal(plan.benchmark_boundaries.retrieval_evidence_proxy_scored, false);
  assert.equal(plan.benchmark_boundaries.external_provider_calls, false);
  assert.deepEqual(plan.external_competitor_adapters.map((row) => row.id), ['mem0']);
  assert.equal(plan.external_competitor_adapters[0].scores_included, false);
  assert.ok(Array.isArray(plan.cost_estimate_inputs.dataset_sample_limits));
  assert.equal(plan.cost_estimate_inputs.budget_cap_set, false);

  const text = serialize(plan);
  for (const sentinel of [...LOCOMO_SENTINELS, ...LONGMEMEVAL_SENTINELS]) {
    assert.doesNotMatch(text, new RegExp(sentinel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
  }
  assert.doesNotMatch(text, /"content"\s*:/u);
  assert.doesNotMatch(text, /"question"\s*:/u);
  assert.doesNotMatch(text, /"answer"\s*:/u);
  assert.doesNotMatch(text, /provider deletion|model forgetting|benchmark leadership/iu);
  assert.ok(plan.review_rules.length > 0);
  assert.ok(plan.non_claims.length > 0);
});

test('standard benchmark protocol plan binds pinned refs and is deterministic', () => {
  const base = { ...PROTOCOL_PLAN_OPTIONS, answerer_ref: 'model:answerer@2026-06-01', judge_ref: 'model:judge@2026-06-01', protocol_ref: 'protocol:full-answer@v1' };
  const plan = buildStandardBenchmarkProtocolPlan(base);

  assert.equal(plan.answerer.model_ref, 'model:answerer@2026-06-01');
  assert.equal(plan.judge.model_ref, 'model:judge@2026-06-01');
  assert.equal(plan.answerer.fixed, true);
  assert.equal(plan.judge.fixed, true);
  assert.equal(plan.protocol_controls.prompts_fixed, true);
  assert.equal(plan.protocol_controls.same_answerer_model_for_all_rows, true);

  const again = serialize(buildStandardBenchmarkProtocolPlan(base));
  assert.equal(serialize(plan), again);

  assert.throws(() => buildStandardBenchmarkProtocolPlan({ locomo: 'l.json', answerer_ref: 'Bad Ref With Spaces' }), /answerer_ref/u);
});

test('protocol plan proof release accepts the readiness report but rejects raw answers, prompts, provider responses, and competitor scores', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-protocol-proof-'));
  try {
    const planPath = join(dir, 'protocol-plan.json');
    await writeFile(planPath, `${JSON.stringify(buildStandardBenchmarkProtocolPlan(PROTOCOL_PLAN_OPTIONS), null, 2)}\n`, 'utf8');
    const baseArgs = {
      report: planPath,
      datasetRef: 'dataset:locomo-longmemeval@reviewed',
      runnerRef: 'runner:run-standard-memory-benchmarks.mjs@protocol-plan',
      packageRef: 'enigma-memory@0.1.17',
      scores: [],
    };

    const release = await buildBenchmarkProofRelease(baseArgs, { generated_at: '2026-06-26T00:00:00.000Z' });
    assert.equal(release.report_schema, STANDARD_MEMORY_BENCHMARK_PROTOCOL_PLAN_SCHEMA);
    const tampered = async (mutate) => {
      const badPath = join(dir, 'tampered.json');
      const body = JSON.parse(await readFile(planPath, 'utf8'));
      await writeFile(badPath, `${JSON.stringify(mutate(body), null, 2)}\n`, 'utf8');
      return buildBenchmarkProofRelease({ ...baseArgs, report: badPath }, { generated_at: '2026-06-26T00:00:00.000Z' });
    };
    assert.equal(release.manifest.claim_boundaries.provider_answer_accuracy_claim, false);
    assert.equal(release.manifest.claim_boundaries.competitor_performance_claim, false);
    assert.equal(release.manifest.claim_boundaries.benchmark_leadership_claim === undefined || release.manifest.claim_boundaries.benchmark_leadership_claim === false, true);
    assert.equal(release.manifest.claim_boundaries.raw_memory_included, false);
    assert.equal(release.manifest.claim_boundaries.prompts_included, false);
    assert.equal(release.manifest.claim_boundaries.provider_responses_included, false);

    await assert.rejects(() => tampered((r) => ({ ...r, raw_answers: ['a private generated answer'] })), /raw_answers/u);
    await assert.rejects(() => tampered((r) => ({ ...r, generated_answer: 'model answered privately' })), /generated_answer/u);
    await assert.rejects(() => tampered((r) => ({ ...r, prompts: ['you are a helpful assistant'] })), /prompts/u);
    await assert.rejects(() => tampered((r) => ({ ...r, provider_responses: [{ content: 'resp' }] })), /provider_responses/u);
    await assert.rejects(() => tampered((r) => ({ ...r, external_competitor_adapters: [{ id: 'mem0', name: 'Mem0', scores_included: false, recall: 0.9 }] })), /recall/u);
    await assert.rejects(() => tampered((r) => ({ ...r, protocol_boundaries: { ...r.protocol_boundaries, answers_generated: true } })), /answers_generated/u);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
