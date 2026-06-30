import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertImmuneIngressPublicSafe,
  createImmuneIngressReport,
} from '../packages/importers/src/index.js';
import {
  assertMcpImmuneIngressPublicSafe,
  createMcpImmuneIngressReport,
  enigma_immune_ingress,
  handleJsonRpcRequest,
} from '../packages/mcp-server/src/index.js';

const NOW = '2026-01-01T00:00:00.000Z';
const RAW = 'private launch-code phrase stays inside quarantine only';
const TOKEN = 'sk-1234567890123456';
const LOCAL_PATH = 'C:\\Users\\alice-secret-vault\\memory.json';

function assertNoRawPayload(report) {
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes(RAW), false);
  assert.equal(serialized.includes(TOKEN), false);
  assert.equal(serialized.includes('alice-secret-vault'), false);
}

test('immune ingress report quarantines forbidden public fields without copying raw payloads', () => {
  const report = createImmuneIngressReport({
    candidates: [{
      content: RAW,
      metadata: {
        api_key: TOKEN,
        provider_response: `provider echoed ${RAW}`,
        raw_prompt: RAW,
        token_value: TOKEN,
        embedding: [0.1, 0.2],
        local_ref: LOCAL_PATH,
        claim: 'This proves provider deletion and makes models forget.',
      },
    }],
  }, { now: NOW, source_type: 'import_batch' });

  assert.equal(report.schema, 'enigma.immune_scan_report.v1');
  assert.deepEqual(Object.keys(report).sort(), [
    'antigen_envelope_refs',
    'counts',
    'detector_ids',
    'findings',
    'generated_at',
    'private_payload_detected',
    'public_payload_only',
    'quarantine_refs',
    'report_id',
    'roots',
    'scan_root',
    'schema',
    'status',
  ]);
  assert.equal(report.status.ok, false);
  assert.equal(report.status.quarantine_decision, 'quarantine');
  assert.equal(report.counts.candidate_count, 1);
  assert.equal(report.counts.quarantined_candidate_count, 1);
  assert.equal(report.counts.accepted_candidate_count, 0);
  assert.ok(report.counts.antigen_count >= 9);
  assert.equal(report.private_payload_detected, true);
  assert.equal(report.public_payload_only, true);
  assert.ok(report.detector_ids.includes('enigma.detector.forbidden_field.raw_public_payload.v1'));
  assert.ok(report.detector_ids.includes('enigma.detector.forbidden_field.secret_or_credential.v1'));
  assert.ok(report.detector_ids.includes('enigma.detector.forbidden_field.provider_response.v1'));
  assert.ok(report.detector_ids.includes('enigma.detector.forbidden_field.embedding.v1'));
  assert.ok(report.detector_ids.includes('enigma.detector.secret_value.v1'));
  assert.ok(report.detector_ids.includes('enigma.detector.local_path_value.v1'));
  assert.ok(report.detector_ids.includes('enigma.detector.forbidden_claim_value.v1'));
  assert.match(report.scan_root, /^sha256:[a-f0-9]{64}$/u);
  assert.match(report.roots.candidate_root, /^sha256:[a-f0-9]{64}$/u);
  assert.match(report.roots.quarantine_root, /^sha256:[a-f0-9]{64}$/u);
  assert.match(report.roots.antigen_root, /^sha256:[a-f0-9]{64}$/u);
  assert.ok(report.antigen_envelope_refs.every((ref) => /^antigen_[a-f0-9]{32}$/u.test(ref)));
  assert.ok(report.quarantine_refs.every((ref) => /^candidate_[a-f0-9]{32}$/u.test(ref)));
  assert.deepEqual(Object.keys(report.findings[0]).sort(), [
    'antigen_count',
    'antigen_refs',
    'antigen_root',
    'detector_ids',
    'finding_ref',
    'risk',
    'status',
    'subject_ref',
  ]);
  assert.ok(report.findings[0].antigen_refs.every((ref) => /^antigen_[a-f0-9]{32}$/u.test(ref)));
  assert.match(report.findings[0].finding_ref, /^finding_[a-f0-9]{32}$/u);
  assert.match(report.findings[0].subject_ref, /^candidate_[a-f0-9]{32}$/u);
  assert.equal(report.findings[0].status, 'quarantined');
  assert.equal(report.findings[0].risk, 'high');
  assertNoRawPayload(report);
});

test('immune ingress report accepts public-safe roots refs counts and false boundary bits', () => {
  const report = createImmuneIngressReport([{
    schema: 'enigma.memory_candidate_public_projection.v1',
    candidate_id: 'cand_public_ref',
    content_hash: `sha256:${'a'.repeat(64)}`,
    source_ref: 'opaque_source_ref',
    prompt_tokens: 12,
    completion_tokens: 0,
    contains_private_plaintext: false,
    provider_deletion_claim: false,
  }], { now: NOW });

  assert.equal(report.status.ok, true);
  assert.equal(report.status.quarantine_decision, 'accept');
  assert.equal(report.counts.antigen_count, 0);
  assert.equal(report.detector_ids.length, 0);
  assert.equal(report.findings.length, 0);
});

test('immune ingress fail-closed helper throws sanitized quarantine errors', () => {
  assert.throws(
    () => assertImmuneIngressPublicSafe([{ text: RAW, credential: TOKEN }], { now: NOW }),
    (error) => {
      assert.equal(error.name, 'ImmuneIngressQuarantineError');
      assert.equal(error.report.status.ok, false);
      assertNoRawPayload(error.report);
      assert.equal(String(error.message).includes(RAW), false);
      assert.equal(String(error.message).includes(TOKEN), false);
      return true;
    },
  );
});

test('MCP immune ingress wrapper scans supplied candidate objects without enabling default blocking', async () => {
  const report = createMcpImmuneIngressReport({
    candidate: { message: RAW },
    generated_at: NOW,
  });

  assert.equal(report.status.ok, false);
  assert.equal(report.counts.quarantined_candidate_count, 1);
  assertNoRawPayload(report);
  assert.throws(
    () => assertMcpImmuneIngressPublicSafe({ candidate: { prompt: RAW }, now: NOW }),
    { name: 'ImmuneIngressQuarantineError' },
  );
  const toolReport = await enigma_immune_ingress({ candidate: { raw_prompt: RAW }, now: NOW });
  assert.equal(toolReport.status.ok, false);
  assertNoRawPayload(toolReport);

  const rpcResponse = await handleJsonRpcRequest({
    jsonrpc: '2.0',
    id: 'immune-1',
    method: 'tools/call',
    params: {
      name: 'enigma_immune_ingress',
      arguments: { candidate: { raw_prompt: RAW }, now: NOW },
    },
  });
  assert.equal(rpcResponse.result.structuredContent.status.ok, false);
  assertNoRawPayload(rpcResponse);
});
