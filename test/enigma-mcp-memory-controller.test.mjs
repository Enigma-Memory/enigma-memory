import test from 'node:test';
import assert from 'node:assert/strict';

import mcpServer, {
  handlers,
  toolDescriptors,
  enigma_consent_grant,
  enigma_memory_weather,
  enigma_private_bubble,
  enigma_recall_veto,
  handleJsonRpcRequest,
} from '../packages/mcp-server/src/index.js';

const NOW = '2099-06-28T12:00:00.000Z';
const LATER = '2099-06-28T12:05:00.000Z';
const RAW_PRIVATE_MEMORY = 'private launch-code phrase stays local only';
const RAW_MEMORY_FIELD = ['raw', 'memory'].join('_');

const MEMORY_CONTROLLER_TOOLS = Object.freeze([
  'enigma_memory_weather',
  'enigma_recall_veto',
  'enigma_consent_grant',
  'enigma_private_bubble',
]);
const EXPECTED_TOOL_ANNOTATIONS = Object.freeze({
  enigma_memory_weather: Object.freeze({
    title: 'Show Memory Weather',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  }),
  enigma_recall_veto: Object.freeze({
    title: 'Check Recall Boundary',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  }),
  enigma_consent_grant: Object.freeze({
    title: 'Create Consent Grant',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  }),
  enigma_private_bubble: Object.freeze({
    title: 'Open or Close Private Bubble',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  }),
});
const EXPECTED_INPUT_DESCRIPTION = 'Use opaque refs, counts, timestamps, and reason codes only; never send raw memory, prompts, transcripts, provider output, local paths, secrets, or account/customer identifiers.';

function descriptor(name) {
  return toolDescriptors.find((tool) => tool.name === name);
}

function assertNoRawPayload(value) {
  const serialized = JSON.stringify(value);
  assert.equal(serialized.includes(RAW_PRIVATE_MEMORY), false);
  assert.equal(serialized.includes('provider_response'), false);
  assert.equal(serialized.includes('sk-'), false);
}

function assertBoundary(value) {
  assert.equal(value.public_payload_only, true);
  assert.equal(value.memory_payload_absent, true);
  assert.equal(value.prompt_payload_absent, true);
  assert.equal(value.transcript_payload_absent, true);
  assert.equal(value.embedding_payload_absent, true);
  assert.equal(value.provider_output_absent, true);
  assert.equal(value.secret_material_absent, true);
  assert.equal(value.device_path_absent, true);
  assert.equal(value.account_identifier_absent, true);
  assert.equal(value.customer_identifier_absent, true);
  assert.equal(value.evidence_refs_only, true);
  assert.equal(value.provider_deletion_claim, false);
  assert.equal(value.model_forgetting_claim, false);
  assert.equal(value.provider_native_memory_control_claim, false);
  assert.equal(value.compliance_certification_claim, false);
}

test('MCP Memory Controller tools are listed, handled, and exported with strict schemas', async () => {
  for (const name of MEMORY_CONTROLLER_TOOLS) {
    const tool = descriptor(name);
    assert.ok(tool, `${name} descriptor missing`);
    assert.equal(tool.inputSchema.type, 'object');
    assert.equal(tool.inputSchema.description, EXPECTED_INPUT_DESCRIPTION);
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.equal(tool.outputSchema.type, 'object');
    assert.equal(tool.outputSchema.additionalProperties, false);
    assert.deepEqual(tool.annotations, EXPECTED_TOOL_ANNOTATIONS[name]);
    assert.equal(typeof handlers[name], 'function');
    assert.equal(typeof mcpServer.handlers[name], 'function');
    assert.equal(typeof mcpServer[name], 'function');
  }

  const listResponse = await handleJsonRpcRequest({
    jsonrpc: '2.0',
    id: 'tools-list',
    method: 'tools/list',
  });
  const listedTools = new Map(listResponse.result.tools.map((tool) => [tool.name, tool]));
  for (const name of MEMORY_CONTROLLER_TOOLS) {
    assert.equal(listedTools.has(name), true);
    assert.deepEqual(listedTools.get(name).annotations, EXPECTED_TOOL_ANNOTATIONS[name]);
  }

  assert.equal(descriptor('enigma_recall_veto').inputSchema.properties.grant.additionalProperties, false);
  assert.equal(descriptor('enigma_recall_veto').inputSchema.properties.grants.items.additionalProperties, false);
  assert.equal(descriptor('enigma_recall_veto').inputSchema.properties.revoked_grant_refs.items.type, 'string');
  assert.equal(descriptor('enigma_context_pack').inputSchema.properties.revoked_grant_refs.items.pattern, descriptor('enigma_recall_veto').inputSchema.properties.revoked_grant_refs.items.pattern);
  assert.equal(descriptor('enigma_private_bubble').inputSchema.properties.bubble.additionalProperties, false);
  assert.equal(descriptor('enigma_memory_weather').inputSchema.properties.tiles.items.additionalProperties, false);
});

test('MCP Memory Controller handlers return public-safe controller artifacts only', async () => {
  const grant = await enigma_consent_grant({
    app_ref: 'ref:app:notes',
    purpose_ref: 'ref:purpose:briefing',
    operation: 'recall_context',
    memory_zone_ref: 'ref:zone:work',
    issued_at: NOW,
    expires_at: LATER,
    policy_ref: 'ref:policy:jit',
    proof_refs: ['ref:proof:grant'],
    receipt_refs: ['ref:receipt:grant'],
  });
  assert.equal(grant.schema, 'enigma.memory_controller_grant.v1');
  assert.deepEqual(grant.operations, ['recall_context']);
  assert.deepEqual(grant.memory_zone_refs, ['ref:zone:work']);
  assertBoundary(grant);

  const recall = await enigma_recall_veto({
    grant,
    app_ref: 'ref:app:notes',
    purpose_ref: 'ref:purpose:briefing',
    operation: 'recall_context',
    memory_zone_ref: 'ref:zone:work',
    candidate_count: 2,
    sensitive_count: 0,
    tombstone_count: 0,
    policy_ref: 'ref:policy:jit',
    proof_refs: ['ref:proof:recall'],
    receipt_refs: ['ref:receipt:recall'],
  });
  assert.equal(recall.schema, 'enigma.recall_veto_decision.v1');
  assert.equal(recall.decision, 'allow');
  assert.equal(recall.safe_to_share, true);
  assert.deepEqual(recall.grant_refs, [grant.grant_ref]);
  assertBoundary(recall);

  const recallFromGrantArray = await enigma_recall_veto({
    grants: [grant],
    app_ref: 'ref:app:notes',
    purpose_ref: 'ref:purpose:briefing',
    operation: 'recall_context',
    memory_zone_ref: 'ref:zone:work',
    candidate_count: 1,
    policy_ref: 'ref:policy:jit',
    proof_refs: ['ref:proof:recall-array'],
    receipt_refs: ['ref:receipt:recall-array'],
  });
  assert.equal(recallFromGrantArray.decision, 'allow');
  assertBoundary(recallFromGrantArray);

  const revokedRecall = await enigma_recall_veto({
    grants: [grant],
    revoked_grant_refs: [grant.grant_ref],
    app_ref: 'ref:app:notes',
    purpose_ref: 'ref:purpose:briefing',
    operation: 'recall_context',
    memory_zone_ref: 'ref:zone:work',
    candidate_count: 1,
    policy_ref: 'ref:policy:jit',
    proof_refs: ['ref:proof:recall-revoked'],
    receipt_refs: ['ref:receipt:recall-revoked'],
  });
  assert.equal(revokedRecall.decision, 'deny');
  assert.equal(revokedRecall.safe_to_share, false);
  assert.deepEqual(revokedRecall.grant_refs, [grant.grant_ref]);
  assert.ok(revokedRecall.reason_codes.includes('policy_denies_recall'));
  assertBoundary(revokedRecall);

  const weather = await enigma_memory_weather({
    generated_at: NOW,
    tiles: [{ tile_ref: 'ref:tile:recall', status: 'needs_review', metric: 'recent_vetoes', count: 1, evidence_refs: ['ref:evidence:recall'] }],
    issue_codes: ['veto_rate_elevated'],
    evidence_refs: ['ref:evidence:recall'],
  });
  assert.equal(weather.schema, 'enigma.memory_weather_report.v1');
  assert.equal(weather.status, 'needs_attention');
  assert.equal(weather.next_action, 'ask_for_consent');
  assert.deepEqual(weather.evidence_refs, ['ref:evidence:recall']);
  assertBoundary(weather);

  const bubble = await enigma_private_bubble({
    action: 'open',
    app_ref: 'ref:app:notes',
    purpose_ref: 'ref:purpose:draft',
    candidate_count: 3,
    started_at: NOW,
    receipt_refs: ['ref:receipt:bubble-open'],
  });
  assert.equal(bubble.schema, 'enigma.private_memory_bubble.v1');
  assert.equal(bubble.status, 'open');
  assert.equal(bubble.candidate_count, 3);
  assertBoundary(bubble);

  const kept = await enigma_private_bubble({
    action: 'keep',
    bubble,
    closed_at: LATER,
    kept_count: 2,
    receipt_refs: ['ref:receipt:bubble-keep'],
  });
  assert.equal(kept.status, 'kept');
  assert.equal(kept.kept_count, 2);
  assert.equal(kept.discarded_count, 1);
  assertBoundary(kept);

  assertNoRawPayload({ grant, recall, recallFromGrantArray, weather, bubble, kept });
});

test('MCP Memory Controller JSON-RPC tool calls return structured public-safe content', async () => {
  const response = await handleJsonRpcRequest({
    jsonrpc: '2.0',
    id: 'weather-1',
    method: 'tools/call',
    params: {
      name: 'enigma_memory_weather',
      arguments: {
        generated_at: NOW,
        tiles: [{ tile_ref: 'ref:tile:receipts', status: 'blocked', metric: 'receipt_coverage', count: 1, evidence_refs: ['ref:evidence:receipt'] }],
      },
    },
  });

  assert.equal(response.jsonrpc, '2.0');
  assert.equal(response.id, 'weather-1');
  assert.equal(response.result.isError, false);
  assert.equal(response.result.structuredContent.schema, 'enigma.memory_weather_report.v1');
  assert.equal(response.result.structuredContent.status, 'storm_warning');
  assertBoundary(response.result.structuredContent);
  assertNoRawPayload(response);
});

test('MCP Memory Controller tools reject additional properties before execution', async () => {
  const response = await handleJsonRpcRequest({
    jsonrpc: '2.0',
    id: 'weather-extra',
    method: 'tools/call',
    params: {
      name: 'enigma_memory_weather',
      arguments: { generated_at: NOW, extra: true },
    },
  });

  assert.equal(response.error.code, -32602);
  assert.match(response.error.message, /unsupported properties/u);
});

test('MCP Memory Controller tools reject raw public fields fail-closed', async () => {
  const response = await handleJsonRpcRequest({
    jsonrpc: '2.0',
    id: 'recall-raw',
    method: 'tools/call',
    params: {
      name: 'enigma_recall_veto',
      arguments: {
        app_ref: 'ref:app:notes',
        purpose_ref: 'ref:purpose:briefing',
        operation: 'recall_context',
        memory_zone_ref: 'ref:zone:work',
        [RAW_MEMORY_FIELD]: RAW_PRIVATE_MEMORY,
      },
    },
  });

  assert.equal(response.error.code, -32602);
  assert.match(response.error.message, /unsafe public fields/u);
  assertNoRawPayload(response);
});

test('MCP Memory Controller revocation refs must be public refs', async () => {
  const response = await handleJsonRpcRequest({
    jsonrpc: '2.0',
    id: 'recall-bad-revoked-ref',
    method: 'tools/call',
    params: {
      name: 'enigma_recall_veto',
      arguments: {
        revoked_grant_refs: ['not-a-public-ref'],
        app_ref: 'ref:app:notes',
        purpose_ref: 'ref:purpose:briefing',
        operation: 'recall_context',
        memory_zone_ref: 'ref:zone:work',
      },
    },
  });

  assert.equal(response.error.code, -32602);
  assert.match(response.error.message, /revoked_grant_refs must be an array of unique public refs/u);
  assertNoRawPayload(response);
});
