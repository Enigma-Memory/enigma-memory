import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  BENCHMARK_PROOF_RELEASE_SCHEMA,
  buildBenchmarkProofRelease,
  parseArgs,
  writeBenchmarkProofRelease,
} from '../scripts/build-benchmark-proof-release.mjs';
import {
  validateBenchmarkAttestation,
  validateProofNetworkPacket,
} from '../packages/proof-network/src/index.js';

const GENERATED_AT = '2026-06-25T00:00:00.000Z';
const DATASET_REF = `sha256:${'a'.repeat(64)}`;
const RUNNER_REF = 'runner:run-standard-memory-benchmarks.mjs@reviewed-2026-06-25';
const PACKAGE_REF = 'enigma-memory@0.1.15';

async function withTempDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-benchmark-proof-release-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function writeReport(dir, report) {
  const path = join(dir, 'benchmark-report.json');
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return path;
}

function publicReport(overrides = {}) {
  return {
    schema: 'enigma.standard_memory_benchmark_suite.v1',
    generated_at: GENERATED_AT,
    public_safe: true,
    top_k: 5,
    benchmark_boundaries: {
      external_provider_calls: false,
      llm_answer_accuracy_scored: false,
      retrieval_evidence_proxy_scored: true,
      raw_question_text_included: false,
      raw_answer_text_included: false,
      raw_conversation_text_included: false,
      provider_deletion_claim: false,
      model_forgetting_claim: false,
      roi_or_provider_invoice_savings_claim: false,
      benchmark_leadership_claim: false,
    },
    metrics: {
      qa: {
        question_count: 3,
      },
    },
    note: 'PUBLIC_MARKER_THAT_MUST_NOT_BE_COPIED',
    ...overrides,
  };
}

function argsFor(reportPath, outDir, extra = []) {
  return parseArgs([
    '--report', reportPath,
    '--dataset-ref', DATASET_REF,
    '--runner-ref', RUNNER_REF,
    '--package-ref', PACKAGE_REF,
    '--out-dir', outDir,
    ...extra,
  ]);
}

test('benchmark proof release hashes the report without copying raw report body', async () => {
  await withTempDir(async (dir) => {
    const reportPath = await writeReport(dir, publicReport());
    const args = argsFor(reportPath, join(dir, 'proof-release'), ['--score', 'retrieval_evidence_proxy=0.75']);

    const release = await buildBenchmarkProofRelease(args, { generated_at: GENERATED_AT });
    const encodedAttestation = JSON.stringify(release.attestation);
    const encodedPacket = JSON.stringify(release.packet);

    assert.equal(release.schema, BENCHMARK_PROOF_RELEASE_SCHEMA);
    assert.match(release.report_hash, /^sha256:[a-f0-9]{64}$/);
    assert.equal(encodedAttestation.includes('PUBLIC_MARKER_THAT_MUST_NOT_BE_COPIED'), false);
    assert.equal(encodedPacket.includes('PUBLIC_MARKER_THAT_MUST_NOT_BE_COPIED'), false);
    assert.equal(encodedPacket.includes(reportPath), false);
    assert.equal(release.manifest.report.report_body_copied, false);
    assert.equal(release.manifest.claim_boundaries.provider_answer_accuracy_claim, false);
    assert.equal(release.manifest.claim_boundaries.competitor_performance_claim, false);
    assert.equal(release.manifest.claim_boundaries.solana_submission_claim, false);
    assert.equal(release.manifest.claim_boundaries.roi_or_profit_claim, false);
  });
});

test('benchmark proof release rejects private benchmark payloads before artifact creation', async () => {
  await withTempDir(async (dir) => {
    const reportPath = await writeReport(dir, publicReport({ raw_memory: 'private fixture memory should never publish' }));
    const args = argsFor(reportPath, join(dir, 'proof-release'));

    await assert.rejects(
      () => buildBenchmarkProofRelease(args, { generated_at: GENERATED_AT }),
      /raw_memory|not allowed|public benchmark proof/i,
    );
  });
});

test('benchmark proof release writes artifacts that verify as proof-network packets', async () => {
  await withTempDir(async (dir) => {
    const outDir = join(dir, 'proof-release');
    const reportPath = await writeReport(dir, publicReport());
    const args = argsFor(reportPath, outDir, ['--score', 'evidence_coverage=0.8', '--score', 'sample_count=3']);

    const release = await buildBenchmarkProofRelease(args, { generated_at: GENERATED_AT });
    const files = await writeBenchmarkProofRelease(release, outDir);
    const attestation = JSON.parse(await readFile(join(outDir, files.attestation_file), 'utf8'));
    const packet = JSON.parse(await readFile(join(outDir, files.proof_packet_file), 'utf8'));
    const manifest = JSON.parse(await readFile(join(outDir, files.release_manifest_file), 'utf8'));

    const attestationValidation = validateBenchmarkAttestation(attestation);
    const packetValidation = validateProofNetworkPacket(packet);
    assert.equal(attestationValidation.ok, true, attestationValidation.errors.join('\n'));
    assert.equal(packetValidation.ok, true, packetValidation.errors.join('\n'));
    assert.equal(packet.artifact_count, 1);
    assert.equal(packet.artifacts[0].benchmark_attestation_hash, attestation.benchmark_attestation_hash);
    assert.equal(manifest.schema, BENCHMARK_PROOF_RELEASE_SCHEMA);
    assert.equal(manifest.report.report_hash, release.report_hash);
    assert.equal(manifest.score_commitments.length, 2);
    assert.equal(manifest.api_calls_made, false);
  });
});
