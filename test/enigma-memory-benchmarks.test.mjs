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
    assert.equal(row.boundary.max_estimated_tokens, 512);
    assert.equal(row.boundary.purpose, 'memory_benchmark_context_pack');
    assert.ok(row.memory_count > 0);
    assert.equal(row.duplicate_candidates_removed, 1);
  }
});
