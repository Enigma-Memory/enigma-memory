import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MEMORY_BENCHMARK_SUITE_SCHEMA,
  runMemoryBenchmarkSuite,
} from '../scripts/run-memory-benchmarks.mjs';

const NOW = '2026-06-25T00:00:00.000Z';
const RAW_FIXTURE_SENTINELS = [
  'ember orange',
  'eu-west-3',
  'Iris',
  'Rowan',
  '11:30',
  'glass-raven',
  'canonical dashboard accent color',
  'default hosted smoke-test region',
  'pager owner',
  'keynote moved',
];

function publicText(value) {
  return JSON.stringify(value, null, 2);
}

function assertLatencyShape(report) {
  for (const name of ['remember', 'import', 'context', 'export', 'verify']) {
    const row = report.metrics.latency[name];
    assert.ok(row, `missing ${name} latency row`);
    assert.ok(Number.isInteger(row.samples), `${name} sample count must be integer`);
    assert.ok(row.samples > 0, `${name} sample count must be positive`);
    for (const field of ['p50_ms', 'p95_ms', 'min_ms', 'max_ms']) {
      assert.equal(typeof row[field], 'number', `${name}.${field} must be numeric`);
      assert.ok(row[field] >= 0, `${name}.${field} must be nonnegative`);
    }
    assert.ok(row.p95_ms >= row.min_ms, `${name} p95 must be at least min`);
    assert.ok(row.max_ms >= row.p50_ms, `${name} max must be at least p50`);
  }
}

test('memory benchmark suite produces deterministic local fixture metrics', () => {
  const first = runMemoryBenchmarkSuite({ generated_at: NOW });
  const second = runMemoryBenchmarkSuite({ generated_at: NOW });

  assert.equal(first.schema, MEMORY_BENCHMARK_SUITE_SCHEMA);
  assert.equal(first.schema, 'enigma.memory_benchmark_suite.v1');
  assert.equal(first.public_safe, true);
  assert.equal(first.fixture.session_count, 3);
  assert.equal(first.fixture.has_updates, true);
  assert.equal(first.fixture.has_temporal_questions, true);
  assert.equal(first.fixture.has_abstention_questions, true);
  assert.equal(first.fixture.has_duplicate_candidates, true);

  assert.deepEqual(first.metrics.qa, second.metrics.qa);
  assert.deepEqual(first.metrics.context_token_reduction, second.metrics.context_token_reduction);
  assert.deepEqual(first.metrics.duplicate_removal, second.metrics.duplicate_removal);
  assert.equal(first.metrics.qa.question_count, 5);
  assert.equal(first.metrics.qa.exact_answer_questions, 4);
  assert.equal(first.metrics.qa.exact_answer_correct, 4);
  assert.equal(first.metrics.qa.exact_answer_recall, 1);
  assert.equal(first.metrics.qa.abstention_questions, 1);
  assert.equal(first.metrics.qa.abstention_correct, 1);
  assert.equal(first.metrics.qa.abstention_correctness, 1);
  assert.equal(first.metrics.duplicate_removal.duplicate_candidates_removed, 1);
  assert.ok(first.metrics.context_token_reduction.full_context_baseline_tokens >= first.metrics.context_token_reduction.enigma_context_pack_tokens);
  assert.equal(first.metrics.context_token_reduction.provider_invoice_savings_claim, false);
  assert.equal(first.metrics.context_token_reduction.roi_claim, false);
});

test('memory benchmark report is public-safe and excludes raw fixture memory plaintext', () => {
  const report = runMemoryBenchmarkSuite({ generated_at: NOW });
  const serialized = publicText(report);

  assert.equal(report.fixture.raw_private_memory_plaintext_included, false);
  assert.equal(report.metrics.qa.public_question_text_included, false);
  assert.equal(report.metrics.qa.public_answer_text_included, false);
  for (const sentinel of RAW_FIXTURE_SENTINELS) {
    assert.doesNotMatch(serialized, new RegExp(sentinel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
  }
  assert.doesNotMatch(serialized, /"content"\s*:/u);
  assert.doesNotMatch(serialized, /provides\s+guaranteed\s+savings|delivers\s+investment\s+return|proves\s+benchmark\s+leadership/iu);
});

test('memory benchmark latency fields are present and nonnegative', () => {
  const report = runMemoryBenchmarkSuite({ generated_at: NOW });
  assertLatencyShape(report);
  assert.equal(report.operations_measured.latency_clock, 'performance.now');
  assert.equal(report.metrics.verification.bundle_verify_ok, true);
  assert.equal(report.metrics.verification.context_pack_verify_valid, true);
});

test('memory benchmark reports local baseline comparison rows', () => {
  const report = runMemoryBenchmarkSuite({ generated_at: NOW });
  const rows = report.metrics.local_baseline_comparisons;
  assert.deepEqual(report.local_baseline_comparisons, rows);

  assert.deepEqual(rows.map((row) => row.id), ['full_context', 'recency_last_n', 'keyword_filter', 'enigma_context_pack']);
  for (const row of rows) {
    assert.equal(row.baseline, row.id);
    assert.equal(row.local_fixture_only, true);
    assert.equal(row.external_provider_called, false);
    assert.equal(row.deterministic_fixture, true);
    assert.equal(row.question_count, 5);
    assert.equal(row.exact_answer_questions, 4);
    assert.equal(row.abstention_questions, 1);
    assert.equal(row.abstention_correct, 1);
    assert.equal(row.abstention_correctness, 1);
    assert.equal(row.public_question_text_included, false);
    assert.equal(row.public_answer_text_included, false);
    assert.equal(typeof row.estimated_prompt_tokens.total, 'number');
    assert.ok(row.estimated_prompt_tokens.total > 0);
    assert.match(row.estimated_prompt_tokens.estimator, /deterministic local estimator/u);
    assert.equal(Number.isInteger(row.latency.samples), true);
    assert.equal(row.latency.samples, 5);
    assert.equal(typeof row.latency.p50_ms, 'number');
    assert.equal(typeof row.latency.p95_ms, 'number');
    assert.ok(row.latency.p50_ms >= 0);
    assert.ok(row.latency.p95_ms >= 0);
  }

  const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
  assert.equal(byId.full_context.exact_answer_recall, 1);
  assert.equal(byId.full_context.recall, byId.full_context.exact_answer_recall);
  assert.ok(byId.recency_last_n.exact_answer_recall < byId.full_context.exact_answer_recall);
  assert.equal(byId.keyword_filter.exact_answer_recall, 1);
  assert.equal(byId.enigma_context_pack.exact_answer_recall, 1);
  assert.equal(byId.enigma_context_pack.duplicate_removal.applicable, true);
  assert.equal(byId.enigma_context_pack.duplicate_removal.max_duplicate_candidates_removed, 1);
  assert.equal(byId.full_context.duplicate_removal.applicable, false);
});

test('memory benchmark lists external adapter requirements without fake scores', () => {
  const report = runMemoryBenchmarkSuite({ generated_at: NOW });
  const expectedIds = [
    'claude_memory_tool',
    'langgraph_memory',
    'letta_memgpt',
    'mem0',
    'openai_native_memory',
    'zep',
  ];

  assert.deepEqual(report.external_competitor_adapters.map((row) => row.id).sort(), expectedIds);
  for (const row of report.external_competitor_adapters) {
    assert.match(row.status, /not_run_requires_credentials_or_runtime/u);
    assert.equal(row.can_run_in_this_harness, false);
    assert.equal(row.scores_included, false);
    assert.match(row.official_doc, /^https:\/\//u);
    assert.ok(Array.isArray(row.required_artifacts));
    assert.ok(row.required_artifacts.length >= 3);
    assert.match(row.boundary_reason, /no .*score|no .*claim|not .*available|does not/iu);
    assert.equal(Object.prototype.hasOwnProperty.call(row, 'exact_answer_recall'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(row, 'abstention_correctness'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(row, 'estimated_prompt_tokens'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(row, 'latency'), false);
  }

  assert.ok(report.public_claims_allowed.some((claim) => /local Enigma memory fixture/u.test(claim)));
  assert.ok(report.public_claims_allowed.some((claim) => /withholds third-party scores/u.test(claim)));
});

test('memory benchmark states citations, boundaries, and same-boundary provider profile rows', () => {
  const report = runMemoryBenchmarkSuite({ generated_at: NOW });
  const citationIds = report.citations.map((citation) => citation.id).sort();
  assert.deepEqual(citationIds, ['letta-memory-benchmarks', 'locomo', 'longmemeval']);
  for (const citation of report.citations) {
    assert.match(citation.url, /^https:\/\//u);
    assert.match(citation.boundary, /harness|fixture|local|benchmark/iu);
  }

  assert.equal(report.benchmark_boundaries.local_only, true);
  assert.equal(report.benchmark_boundaries.credentials_required, false);
  assert.equal(report.benchmark_boundaries.external_downloads_required, false);
  assert.equal(report.benchmark_boundaries.external_provider_calls, false);
  assert.equal(report.benchmark_boundaries.provider_deletion_claim, false);
  assert.equal(report.benchmark_boundaries.model_forgetting_claim, false);
  assert.equal(report.benchmark_boundaries.roi_or_provider_invoice_savings_claim, false);
  assert.equal(report.benchmark_boundaries.compliance_certification_claim, false);
  assert.ok(report.benchmark_boundaries.claim_boundary.some((line) => /provider deletion|model forgetting/iu.test(line)));

  assert.deepEqual(report.cross_provider_profiles.map((row) => row.profile), ['chatgpt', 'claude', 'kimi', 'cursor', 'local-llm']);
  for (const row of report.cross_provider_profiles) {
    assert.equal(row.provider_runtime_observed, false);
    assert.equal(row.external_provider_called, false);
    assert.equal(row.same_enigma_context_pack_boundary, true);
    assert.equal(row.scores_included, false);
    assert.equal(row.not_external_competitor_score, true);
    assert.equal(row.boundary.max_estimated_tokens, 512);
    assert.equal(row.boundary.purpose, 'memory_benchmark_context_pack');
    assert.ok(row.memory_count > 0);
    assert.equal(row.duplicate_candidates_removed, 1);
  }
});
