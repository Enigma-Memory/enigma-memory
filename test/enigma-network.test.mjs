import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { handleJsonRpcRequest, startStdioServer } from '../packages/mcp-server/src/index.js';
import { createRelayStore, pushRelayRecord, runMeshDemo } from '../packages/mesh/src/index.js';
import { createEnterprisePolicy, createGatewayDecision, evaluateEnterprisePolicy, verifyGatewayDecision, runEnterpriseDemo } from '../packages/enterprise/src/index.js';
import { canonicalize, generateSigningKeyPair, sha256Hex, signPayload } from '../packages/core/src/index.js';
import {
  createRelayState,
  handleRelayRequest,
  hydrateRelayState,
  loadRelayStateFromFile,
  saveRelayStateToFile,
  serializeRelayState,
} from '../apps/relay/src/server.mjs';
import {
  createGatewayState,
  handleGatewayRequest,
  hydrateGatewayState,
  loadGatewayStateFromFile,
  saveGatewayStateToFile,
  serializeGatewayState,
} from '../apps/gateway/src/server.mjs';

const HOSTED_SHARED_READINESS_REFS = Object.freeze({
  network_access_policy_ref: 'network-policy-ref',
  kms_custody_ref: 'kms-custody-ref',
  tenant_policy_approval_ref: 'tenant-policy-ref',
  usage_metering_ref: 'usage-metering-ref',
  service_settlement_ref: 'service-settlement-ref',
  monitoring_alerting_ref: 'monitoring-alerting-ref',
  public_site_security_ref: 'public-site-security-ref',
  security_threat_model_ref: 'security-threat-model-ref',
  legal_compliance_ref: 'legal-compliance-ref',
  support_sla_ref: 'support-sla-ref',
  incident_drill_ref: 'incident-drill-ref',
  backup_restore_drill_ref: 'backup-restore-drill-ref',
});

const HOSTED_SHARED_READINESS_CHECKS = Object.freeze([
  'network_access_policy',
  'kms_custody',
  'tenant_policy_approval',
  'usage_metering',
  'service_settlement',
  'monitoring_alerting',
  'public_site_security',
  'security_threat_model',
  'legal_compliance_approval',
  'support_sla',
  'incident_drill',
  'backup_restore_drill',
]);

function toolResult(response) {
  assert.equal(response?.jsonrpc, '2.0');
  assert.equal(response?.error, undefined);
  assert.equal(response.result?.isError, false);
  const structured = response.result?.structuredContent;
  if (structured !== undefined) return structured;
  const text = response.result?.content?.find((item) => item.type === 'text')?.text;
  assert.equal(typeof text, 'string');
  return JSON.parse(text);
}

async function callTool(id, name, args = {}) {
  const response = await handleJsonRpcRequest({
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name, arguments: args },
  });
  return { response, result: toolResult(response) };
}

async function callRelay(state, method, url, body = {}, headers = {}) {
  const request = Readable.from([Buffer.from(JSON.stringify(body))]);
  request.method = method;
  request.url = url;
  request.headers = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  const chunks = [];
  const response = {
    statusCode: undefined,
    writeHead(statusCode) {
      this.statusCode = statusCode;
    },
    end(chunk) {
      if (chunk !== undefined) chunks.push(String(chunk));
    },
  };
  await handleRelayRequest(state, request, response);
  return { status: response.statusCode, body: JSON.parse(chunks.join('')) };
}

function relayRequestHash(method, url, body = undefined) {
  const parsed = new URL(url, 'http://127.0.0.1');
  const request = {
    method: String(method).toUpperCase(),
    path: parsed.pathname,
    query: [...parsed.searchParams.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue)
    ),
  };
  if (body !== undefined) request.body = body;
  return `sha256:${sha256Hex(canonicalize(request))}`;
}

function relayAuthHeaders(state, pairing, client, operation, method, url, body = undefined) {
  const payload = {
    schema: 'enigma.relay_client_authorization.v1',
    relay_node_id: state.node.node_id,
    pairing_id: pairing.pairing_id,
    operation,
    request_hash: relayRequestHash(method, url, body),
  };
  return {
    'x-enigma-pairing-id': pairing.pairing_id,
    'x-enigma-client-signature': signPayload(payload, client.privateKey),
  };
}

async function pairRelayClient(state) {
  const client = generateSigningKeyPair({ key_id: 'relay-client-test-key' });
  const challengeResponse = await callRelay(state, 'POST', '/pairing/challenge', { public_key: client.publicKey });
  assert.equal(challengeResponse.status, 201);
  const { signature: _relaySignature, ...challenge } = challengeResponse.body.challenge;
  const completionResponse = await callRelay(state, 'POST', '/pairing/complete', {
    challenge_id: challenge.challenge_id,
    public_key: client.publicKey,
    client_signature: signPayload(challenge, client.privateKey),
  });
  assert.equal(completionResponse.status, 201);
  return { client, pairing: completionResponse.body.pairing };
}

function assertNoOwnKeysDeep(value, forbiddenKeys, context) {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) assertNoOwnKeysDeep(item, forbiddenKeys, context);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    assert.equal(forbiddenKeys.includes(key), false, `${context} leaked ${key}`);
    assertNoOwnKeysDeep(child, forbiddenKeys, context);
  }
}

function assertHealthPayloadSafe(payload, context) {
  assert.equal(payload !== null && typeof payload === 'object' && !Array.isArray(payload), true, `${context} must be a JSON object`);
  const forbiddenKeyForms = new Set([
    'rawmemory',
    'plaintext',
    'plaintextmemory',
    'prompt',
    'response',
    'body',
    'text',
    'content',
    'privatekey',
    'secret',
    'token',
    'credential',
  ]);
  const assertNoForbiddenKeys = (value) => {
    if (value === null || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const item of value) assertNoForbiddenKeys(item);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      assert.equal(forbiddenKeyForms.has(String(key).toLowerCase().replace(/[^a-z0-9]/g, '')), false, `${context} leaked ${key}`);
      assertNoForbiddenKeys(child);
    }
  };
  assertNoForbiddenKeys(payload);
  assert.doesNotMatch(JSON.stringify(payload), /private launch-code|raw memory must not leave|gateway-local-demo-key|PRIVATE_KEY|VAULT_KEY/i);
}

function assertReadinessMentions(body, requiredPatterns, context) {
  const serialized = JSON.stringify(body);
  for (const pattern of requiredPatterns) {
    assert.match(serialized, pattern, `${context} missing ${pattern}`);
  }
}

function assertReadinessCheck(body, checkName, expectedOk, context) {
  assert.equal(Array.isArray(body.checks), true, `${context} must include checks`);
  const check = body.checks.find((item) => item?.check === checkName);
  assert.ok(check, `${context} missing readiness check ${checkName}`);
  assert.equal(check.ok, expectedOk, `${context} ${checkName} mismatch`);
  return check;
}

test('relay livez and readyz stay JSON safe and non-mutating in local mode', async () => {
  const state = createRelayState({ allowUnauthenticated: true, now: '1970-01-01T00:00:00.000Z' });
  const before = JSON.stringify(serializeRelayState(state));

  const livez = await callRelay(state, 'GET', '/livez');
  assert.equal(livez.status, 200);
  assert.equal(livez.body.ok, true);
  assertHealthPayloadSafe(livez.body, 'relay /livez');

  const readyz = await callRelay(state, 'GET', '/readyz');
  assert.equal(readyz.status, 200);
  assert.equal(readyz.body.ok, true);
  assertHealthPayloadSafe(readyz.body, 'relay /readyz');

  assert.equal(JSON.stringify(serializeRelayState(state)), before);
});

test('gateway livez and readyz stay JSON safe and non-mutating in local mode', async () => {
  const state = createGatewayState();
  const before = {
    gateway_id: state.gateway_id,
    policy_hash: state.policy.policy_hash,
    siem_events: state.siem_events.length,
    expose_internal: state.expose_internal,
  };

  const livez = await handleGatewayRequest(state, { method: 'GET', url: '/livez' });
  assert.equal(livez.status, 200);
  assert.equal(livez.body.ok, true);
  assertHealthPayloadSafe(livez.body, 'gateway /livez');

  const readyz = await handleGatewayRequest(state, { method: 'GET', url: '/readyz' });
  assert.equal(readyz.status, 200);
  assert.equal(readyz.body.ok, true);
  assertHealthPayloadSafe(readyz.body, 'gateway /readyz');

  assert.deepEqual({
    gateway_id: state.gateway_id,
    policy_hash: state.policy.policy_hash,
    siem_events: state.siem_events.length,
    expose_internal: state.expose_internal,
  }, before);
});

test('relay production-like readyz fails closed when external dependencies are missing', async () => {
  const state = createRelayState({ mode: 'production', now: '1970-01-01T00:00:00.000Z' });
  const before = JSON.stringify(serializeRelayState(state));

  const readyz = await callRelay(state, 'GET', '/readyz');
  assert.equal(readyz.status, 503);
  assert.equal(readyz.body.ok, false);
  assertHealthPayloadSafe(readyz.body, 'relay production /readyz');
  assertReadinessMentions(readyz.body, [
    /backend[_-]?host/i,
    /DNS|TLS/i,
    /runtime[_-]?auth|paired[_-]?client/i,
    /durable[_-]?storage/i,
    /\bKMS\b|kms[_-]?signer|signer/i,
    /SIEM|audit/i,
    /backup/i,
    /monitoring|alerting/i,
    /operator[_-]?acceptance/i,
  ], 'relay production /readyz');
  for (const checkName of ['backend_host', 'dns_tls', 'runtime_auth', 'durable_storage', 'kms_or_secrets_manager', 'siem_or_audit_sink', 'backup_target', 'monitoring', ...HOSTED_SHARED_READINESS_CHECKS, 'operator_acceptance', 'production_evidence_refs']) {
    assertReadinessCheck(readyz.body, checkName, false, 'relay production /readyz');
  }

  const productionReadyState = createRelayState({
    mode: 'production',
    now: '1970-01-01T00:00:00.000Z',
    backend_host_ref: 'relay-backend-host-ref',
    dns_tls_ref: 'relay-dns-tls-ref',
    runtime_auth_ref: 'relay-runtime-auth-ref',
    durable_storage: { kind: 'postgres', ref: 'relay-durable-store' },
    kms_ref: 'relay-kms-key-ref',
    siem_ref: 'relay-siem-sink-ref',
    backup_target: 'relay-backup-target-ref',
    monitoring_ref: 'relay-monitoring-ref',
    ...HOSTED_SHARED_READINESS_REFS,
    operator_acceptance: { decision: 'go', status: 'go', ref: 'relay-operator-acceptance-ref' },
  });
  const productionReadyz = await callRelay(productionReadyState, 'GET', '/readyz');
  assert.equal(productionReadyz.status, 200);
  assert.equal(productionReadyz.body.ok, true);
  assertHealthPayloadSafe(productionReadyz.body, 'relay configured production /readyz');
  assert.equal(productionReadyz.body.checks.every((check) => check.ok === true), true);
  assert.equal(productionReadyz.body.evidence_refs.durable_storage, 'relay-durable-store');
  assert.equal(productionReadyz.body.evidence_refs.runtime_auth, 'relay-runtime-auth-ref');
  assert.deepEqual(productionReadyz.body.missing_evidence_refs, []);

  const missingBackupState = createRelayState({
    mode: 'production',
    now: '1970-01-01T00:00:00.000Z',
    backend_host_ref: 'relay-backend-host-ref',
    dns_tls_ref: 'relay-dns-tls-ref',
    runtime_auth_ref: 'relay-runtime-auth-ref',
    durable_storage: { kind: 'postgres', ref: 'relay-durable-store' },
    kms_ref: 'relay-kms-key-ref',
    siem_ref: 'relay-siem-sink-ref',
    monitoring_ref: 'relay-monitoring-ref',
    ...HOSTED_SHARED_READINESS_REFS,
    operator_acceptance: { decision: 'go', status: 'go', ref: 'relay-operator-acceptance-ref' },
  });
  const missingBackupReadyz = await callRelay(missingBackupState, 'GET', '/readyz');
  assert.equal(missingBackupReadyz.status, 503);
  assert.equal(missingBackupReadyz.body.ok, false);
  assertReadinessCheck(missingBackupReadyz.body, 'backup_target', false, 'relay missing backup /readyz');


  assert.equal(JSON.stringify(serializeRelayState(state)), before);
});

test('gateway production-like readyz fails closed when external dependencies are missing', async () => {
  const state = createGatewayState({ mode: 'production' });
  const before = {
    gateway_id: state.gateway_id,
    policy_hash: state.policy.policy_hash,
    siem_events: state.siem_events.length,
    expose_internal: state.expose_internal,
  };

  const readyz = await handleGatewayRequest(state, { method: 'GET', url: '/readyz' });
  assert.equal(readyz.status, 503);
  assert.equal(readyz.body.ok, false);
  assertHealthPayloadSafe(readyz.body, 'gateway production /readyz');
  assertReadinessMentions(readyz.body, [
    /backend[_-]?host/i,
    /DNS|TLS/i,
    /durable[_-]?storage|local[_-]?state|in[_-]?memory/i,
    /\bKMS\b|kms[_-]?signer|signer/i,
    /SIEM|audit/i,
    /backup/i,
    /monitoring|alerting/i,
    /operator[_-]?acceptance/i,
    /admin[_-]?auth/i,
    /data[_-]?plane[_-]?auth/i,
    /expose[_-]?internal/i,
  ], 'gateway production /readyz');
  assertReadinessCheck(readyz.body, 'expose_internal_disabled', true, 'gateway production /readyz');
  for (const checkName of ['backend_host', 'dns_tls', 'state_not_local_in_memory', 'admin_auth', 'data_plane_auth', 'durable_storage', 'kms_or_signer_ref', 'siem_or_audit_sink', 'backup_target', 'monitoring', ...HOSTED_SHARED_READINESS_CHECKS, 'operator_acceptance', 'production_evidence_refs']) {
    assertReadinessCheck(readyz.body, checkName, false, 'gateway production /readyz');
  }

  const productionReadyOptions = {
    mode: 'production',
    backend_host_ref: 'gateway-backend-host-ref',
    dns_tls_ref: 'gateway-dns-tls-ref',
    durable_storage: { kind: 'postgres', ref: 'gateway-durable-store' },
    state_backend: { kind: 'postgres', ref: 'gateway-state-store' },
    kms_ref: 'gateway-kms-key-ref',
    siem_ref: 'gateway-siem-sink-ref',
    backup_target: 'gateway-backup-target-ref',
    monitoring_ref: 'gateway-monitoring-ref',
    admin_auth_ref: 'gateway-admin-auth-ref',
    data_plane_auth_ref: 'gateway-data-plane-auth-ref',
    ...HOSTED_SHARED_READINESS_REFS,
    operator_acceptance: { decision: 'go', status: 'go', ref: 'gateway-operator-acceptance-ref' },
  };
  const productionReadyGateway = createGatewayState(productionReadyOptions);
  const productionReadyz = await handleGatewayRequest(productionReadyGateway, { method: 'GET', url: '/readyz' });
  assert.equal(productionReadyz.status, 200);
  assert.equal(productionReadyz.body.ok, true);
  assertHealthPayloadSafe(productionReadyz.body, 'gateway configured production /readyz');
  assert.equal(productionReadyz.body.checks.every((check) => check.ok === true), true);
  assert.equal(productionReadyz.body.evidence_refs.durable_storage, 'gateway-durable-store');
  assert.equal(productionReadyz.body.evidence_refs.admin_auth, 'gateway-admin-auth-ref');
  assert.deepEqual(productionReadyz.body.missing_evidence_refs, []);

  const missingDataPlaneAuthGateway = createGatewayState({
    ...productionReadyOptions,
    data_plane_auth_ref: null,
  });
  const missingDataPlaneAuthReadyz = await handleGatewayRequest(missingDataPlaneAuthGateway, { method: 'GET', url: '/readyz' });
  assert.equal(missingDataPlaneAuthReadyz.status, 503);
  assert.equal(missingDataPlaneAuthReadyz.body.ok, false);
  assertReadinessCheck(missingDataPlaneAuthReadyz.body, 'data_plane_auth', false, 'gateway missing data-plane auth /readyz');

  const internalExposureGateway = createGatewayState({
    ...productionReadyOptions,
    expose_internal: true,
  });
  const internalExposureReadyz = await handleGatewayRequest(internalExposureGateway, { method: 'GET', url: '/readyz' });
  assert.equal(internalExposureReadyz.status, 503);
  assert.equal(internalExposureReadyz.body.ok, false);
  assertReadinessCheck(internalExposureReadyz.body, 'expose_internal_disabled', false, 'gateway internal exposure /readyz');


  assert.deepEqual({
    gateway_id: state.gateway_id,
    policy_hash: state.policy.policy_hash,
    siem_events: state.siem_events.length,
    expose_internal: state.expose_internal,
  }, before);
});

test('gateway production routes require bearer-hash admin and data-plane auth', async () => {
  const adminToken = 'admin-route-token-fixture';
  const dataToken = 'data-route-token-fixture';
  const baseOptions = {
    mode: 'production',
    backend_host_ref: 'gateway-backend-host-ref',
    dns_tls_ref: 'gateway-dns-tls-ref',
    durable_storage: { kind: 'postgres', ref: 'gateway-durable-store' },
    state_backend: { kind: 'postgres', ref: 'gateway-state-store' },
    kms_ref: 'gateway-kms-key-ref',
    siem_ref: 'gateway-siem-sink-ref',
    backup_target: 'gateway-backup-target-ref',
    monitoring_ref: 'gateway-monitoring-ref',
    admin_auth_ref: 'gateway-admin-auth-ref',
    data_plane_auth_ref: 'gateway-data-plane-auth-ref',
    operator_acceptance: { decision: 'go', status: 'go', ref: 'gateway-operator-acceptance-ref' },
  };
  const state = createGatewayState({
    ...baseOptions,
    admin_auth_bearer_sha256: `sha256:${sha256Hex(adminToken)}`,
    data_plane_auth_bearer_sha256: sha256Hex(dataToken),
  });

  const unauthenticatedPolicy = await handleGatewayRequest(state, { method: 'GET', url: '/policy' });
  assert.equal(unauthenticatedPolicy.status, 401);
  assert.equal(unauthenticatedPolicy.body.error.code, 'GATEWAY_AUTH_REQUIRED');
  assert.doesNotMatch(JSON.stringify(unauthenticatedPolicy.body), /admin-route-token-fixture|sha256:[a-f0-9]{64}/);

  const wrongPolicy = await handleGatewayRequest(state, {
    method: 'GET',
    url: '/policy',
    headers: { authorization: 'Bearer wrong-token' },
  });
  assert.equal(wrongPolicy.status, 403);
  assert.equal(wrongPolicy.body.error.code, 'GATEWAY_AUTH_DENIED');

  const authenticatedPolicy = await handleGatewayRequest(state, {
    method: 'GET',
    url: '/policy',
    headers: { authorization: `Bearer ${adminToken}` },
  });
  assert.equal(authenticatedPolicy.status, 200);
  assert.equal(authenticatedPolicy.body.ok, true);

  const dataRequest = {
    request: {
      operation: 'retrieve',
      provider: 'kimi',
      model: 'kimi-k2',
      region: 'us-east-1',
      purpose: 'support_retrieval',
      sensitivity: 'internal',
      memory_addr: 'addr_gateway_auth_fixture',
    },
  };
  const unauthenticatedDecision = await handleGatewayRequest(state, {
    method: 'POST',
    url: '/gateway/decision',
    body: dataRequest,
  });
  assert.equal(unauthenticatedDecision.status, 401);
  assert.equal(unauthenticatedDecision.body.error.reason_codes[0], 'DATA_PLANE_AUTH_REQUIRED');

  const authenticatedDecision = await handleGatewayRequest(state, {
    method: 'POST',
    url: '/gateway/decision',
    headers: { Authorization: `Bearer ${dataToken}` },
    body: dataRequest,
  });
  assert.equal(authenticatedDecision.status, 200);
  assert.equal(authenticatedDecision.body.verification.ok, true);
  assert.doesNotMatch(JSON.stringify(authenticatedDecision.body), /data-route-token-fixture|addr_gateway_auth_fixture/);

  const missingHashState = createGatewayState(baseOptions);
  const missingHashPolicy = await handleGatewayRequest(missingHashState, {
    method: 'GET',
    url: '/policy',
    headers: { authorization: `Bearer ${adminToken}` },
  });
  assert.equal(missingHashPolicy.status, 503);
  assert.equal(missingHashPolicy.body.error.code, 'GATEWAY_AUTH_NOT_CONFIGURED');
});

test('MCP lists tools and initializes/remembers through JSON-RPC', async () => {
  const list = await handleJsonRpcRequest({ jsonrpc: '2.0', id: 'tools', method: 'tools/list' });
  assert.equal(list.jsonrpc, '2.0');
  assert.equal(list.id, 'tools');
  const names = list.result.tools.map((tool) => tool.name);
  assert.ok(names.includes('enigma_init'));
  assert.ok(names.includes('enigma_next_action'));
  assert.ok(names.includes('enigma_remember'));
  assert.ok(names.includes('enigma_search'));
  assert.ok(names.includes('enigma_import_preview'));
  assert.ok(names.includes('enigma_import_approve'));
  assert.ok(names.includes('enigma_context_pack'));
  const contextPackTool = list.result.tools.find((tool) => tool.name === 'enigma_context_pack');
  assert.equal(contextPackTool.inputSchema.properties.revoked_grant_refs.items.pattern.startsWith('^ref:'), true);
  assert.ok(names.includes('enigma_delete'));
  assert.ok(names.includes('enigma_verify_receipts'));
  assert.ok(names.includes('enigma_meter_usage'));
  assert.ok(names.includes('enigma_settlement_job'));
  assert.ok(names.includes('enigma_settlement_capacity'));
  assert.ok(names.includes('enigma_settlement_quote'));
  assert.ok(names.includes('enigma_settlement_receipt'));
  assert.ok(names.includes('enigma_settlement_verify'));
  assert.ok(names.includes('enigma_settlement_batch'));
  const previewText = 'mcp import preview private sentinel';
  const importPreview = await callTool('import-preview', 'enigma_import_preview', {
    text: `- ${previewText}\n- ${previewText}`,
    complete: true,
    now: '2026-06-28T13:30:00.000Z',
  });
  assert.equal(importPreview.result.schema, 'enigma.import_preview.v1');
  assert.equal(importPreview.result.mcp_tool, 'enigma_import_preview');
  assert.equal(importPreview.result.vault_write_performed, false);
  assert.match(importPreview.result.approval_token, /^ref:import-approval:/);
  assert.equal(importPreview.result.import_decision, 'needs_review');
  assert.equal(importPreview.result.duplicate_groups.length, 1);
  assert.equal(importPreview.result.claim_boundaries.raw_memory_returned, false);
  assert.doesNotMatch(JSON.stringify(importPreview.response), /mcp import preview private sentinel/);
  const unapprovedImport = await callTool('import-approve-unapproved', 'enigma_import_approve', {
    text: previewText,
    complete: true,
    approved: false,
  });
  assert.equal(unapprovedImport.result.schema, 'enigma.import_approval_blocked.v1');
  assert.equal(unapprovedImport.result.reason_code, 'explicit_approval_required');
  assert.equal(unapprovedImport.result.vault_write_performed, false);
  const missingTokenImport = await callTool('import-approve-missing-token', 'enigma_import_approve', {
    text: previewText,
    complete: true,
    approved: true,
  });
  assert.equal(missingTokenImport.result.schema, 'enigma.import_approval_blocked.v1');
  assert.equal(missingTokenImport.result.reason_code, 'approval_token_required');
  assert.equal(missingTokenImport.result.vault_write_performed, false);
  assert.doesNotMatch(JSON.stringify(missingTokenImport.response), /mcp import preview private sentinel/);
  assert.doesNotMatch(JSON.stringify(unapprovedImport.response), /mcp import preview private sentinel/);

  const tempRoot = process.env.TEMP ?? process.env.TMP ?? '.';
  const dir = `${tempRoot}/enigma-network-${process.pid}-${Date.now()}`;
  const bundlePath = `${dir}/bundle.json`;
    const missingNext = await callTool('next-missing-bundle', 'enigma_next_action', { bundlePath });
    assert.equal(missingNext.result.schema, 'enigma.next_action.v1');
    assert.equal(missingNext.result.state, 'setup_needed');
    assert.equal(missingNext.result.primary_action.tool, 'enigma_init');
    assert.doesNotMatch(JSON.stringify(missingNext.response), new RegExp(dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  try {
    const { resolve } = await import('node:path');
    const initialized = await callTool('init', 'enigma_init', { bundlePath });
    assert.equal(initialized.result.ok, true);
    assert.equal(initialized.result.created, true);
    assert.equal(initialized.result.schema, 'enigma.vault_bundle.v1');
    assert.equal(typeof initialized.result.bundlePath, 'string');
    assert.equal(resolve(initialized.result.bundlePath), resolve(bundlePath));

    const emptyNext = await callTool('next-empty-bundle', 'enigma_next_action', { bundlePath });
    assert.equal(emptyNext.result.state, 'needs_first_memory');
    assert.equal(emptyNext.result.primary_action.tool, 'enigma_remember');
    assert.equal(emptyNext.result.lanes.memory_inventory.status, 'empty');

    const duplicatePreview = await callTool('import-preview-duplicate', 'enigma_import_preview', {
      text: '- duplicate mcp import note\n- duplicate mcp import note',
      complete: true,
    });
    const duplicateApproval = await callTool('import-approve-duplicate-blocked', 'enigma_import_approve', {
      bundlePath,
      text: '- duplicate mcp import note\n- duplicate mcp import note',
      complete: true,
      approved: true,
      approval_token: duplicatePreview.result.approval_token,
    });
    assert.equal(duplicateApproval.result.schema, 'enigma.import_approval_blocked.v1');
    assert.equal(duplicateApproval.result.reason_code, 'review_required_before_write');
    assert.equal(duplicateApproval.result.vault_write_performed, false);
    assert.doesNotMatch(JSON.stringify(duplicateApproval.response), /duplicate mcp import note/);

    const approvalPreview = await callTool('import-preview-approval', 'enigma_import_preview', {
      text: '- approved mcp import private note',
      complete: true,
      now: '2026-06-28T13:45:00.000Z',
    });
    const approvedImport = await callTool('import-approve-write', 'enigma_import_approve', {
      bundlePath,
      text: '- approved mcp import private note',
      complete: true,
      approved: true,
      approval_token: approvalPreview.result.approval_token,
      now: '2026-06-28T13:45:00.000Z',
    });

    const postImportNext = await callTool('next-after-approved-import', 'enigma_next_action', { bundlePath });
    assert.equal(postImportNext.result.lanes.memory_inventory.active_count, 1);
    assert.ok(initialized.result.bundlePath.endsWith('bundle.json'));
    assert.equal(typeof initialized.result.vault_id, 'string');
    assert.ok(initialized.result.vault_id.length > 0);


    const secretText = 'network plaintext sentinel must not leak';
    const remembered = await callTool('remember', 'enigma_remember', {
      bundlePath,
      text: secretText,
      purpose: 'integration_test',
      tags: ['network'],
      metadata: { case: 'mcp-json-rpc' },
    });
    assert.equal(remembered.result.ok, true);
    assert.equal(typeof remembered.result.memory_addr, 'string');
    assert.ok(remembered.result.memory_addr.length > 0);
    assert.equal(typeof remembered.result.receipt_id, 'string');
    assert.doesNotMatch(JSON.stringify(remembered.response), /network plaintext sentinel/);

    const populatedNext = await callTool('next-populated-bundle', 'enigma_next_action', { bundlePath });
    assert.equal(populatedNext.result.state, 'ready_for_app_connection');
    assert.equal(populatedNext.result.primary_action.id, 'connect_ai_app');
    assert.equal(populatedNext.result.lanes.memory_inventory.active_count, 2);
    assert.doesNotMatch(JSON.stringify(populatedNext.response), /network plaintext sentinel/);

    const searched = await callTool('search', 'enigma_search', { bundlePath, query: 'plaintext sentinel', limit: 1 });
    assert.ok(Array.isArray(searched.result.memories));
    assert.ok(searched.result.memories.length >= 1);
    assert.ok(Array.isArray(searched.result.receipts));

    const context = await callTool('context-pack', 'enigma_context_pack', { bundlePath, query: 'plaintext sentinel', purpose: 'integration_test', limit: 1 });
    assert.ok(Array.isArray(context.result.memories));
    assert.ok(context.result.memories.length >= 1);
    assert.ok(Array.isArray(context.result.retrieval_receipts ?? context.result.receipts));

    const blockedContext = await callTool('context-pack-blocked-by-grant', 'enigma_context_pack', {
      bundlePath,
      query: 'plaintext sentinel',
      purpose: 'integration_test',
      limit: 1,
      require_grant: true,
      app_ref: 'ref:app:mcp-test',
      purpose_ref: 'ref:purpose:integration-test',
      memory_zone_ref: 'ref:zone:default',
    });
    assert.equal(blockedContext.result.schema, 'enigma.context_pack_recall_blocked.v1');
    assert.equal(blockedContext.result.context_pack_returned, false);
    assert.equal(blockedContext.result.recall_veto.safe_to_share, false);
    assert.doesNotMatch(JSON.stringify(blockedContext.result), /network plaintext sentinel/);

    const grant = await callTool('context-pack-consent-grant', 'enigma_consent_grant', {
      app_ref: 'ref:app:mcp-test',
      purpose_ref: 'ref:purpose:integration-test',
      operation: 'recall_context',
      memory_zone_ref: 'ref:zone:default',
      issued_at: '2099-06-28T12:00:00.000Z',
      expires_at: '2099-06-28T12:05:00.000Z',
    });
    const gatedContext = await callTool('context-pack-allowed-by-grant', 'enigma_context_pack', {
      bundlePath,
      query: 'plaintext sentinel',
      purpose: 'integration_test',
      limit: 1,
      require_grant: true,
      grant: grant.result,
      app_ref: 'ref:app:mcp-test',
      purpose_ref: 'ref:purpose:integration-test',
      memory_zone_ref: 'ref:zone:default',
    });
    assert.ok(Array.isArray(gatedContext.result.memories));
    assert.ok(gatedContext.result.memories.length >= 1);
    assert.equal(gatedContext.result.memory_controller.context_pack_returned, true);
    assert.equal(gatedContext.result.memory_controller.recall_veto.safe_to_share, true);
    assert.deepEqual(gatedContext.result.memory_controller.recall_veto.grant_refs, [grant.result.grant_ref]);

    const revokedGatedContext = await callTool('context-pack-revoked-grant-ref', 'enigma_context_pack', {
      bundlePath,
      query: 'plaintext sentinel',
      purpose: 'integration_test',
      limit: 1,
      require_grant: true,
      grant: grant.result,
      revoked_grant_refs: [grant.result.grant_ref],
      app_ref: 'ref:app:mcp-test',
      purpose_ref: 'ref:purpose:integration-test',
      memory_zone_ref: 'ref:zone:default',
    });
    assert.equal(revokedGatedContext.result.schema, 'enigma.context_pack_recall_blocked.v1');
    assert.equal(revokedGatedContext.result.context_pack_returned, false);
    assert.equal(revokedGatedContext.result.recall_veto.decision, 'deny');
    assert.deepEqual(revokedGatedContext.result.recall_veto.grant_refs, [grant.result.grant_ref]);
    assert.ok(revokedGatedContext.result.recall_veto.reason_codes.includes('policy_denies_recall'));
    assert.doesNotMatch(JSON.stringify(revokedGatedContext.result), /network plaintext sentinel/);

    const expiredGrant = await callTool('context-pack-expired-consent-grant', 'enigma_consent_grant', {
      app_ref: 'ref:app:mcp-test',
      purpose_ref: 'ref:purpose:integration-test',
      operation: 'recall_context',
      memory_zone_ref: 'ref:zone:default',
      issued_at: '2026-01-01T00:00:00.000Z',
      expires_at: '2026-01-01T00:00:01.000Z',
    });
    const expiredContext = await callTool('context-pack-expired-grant', 'enigma_context_pack', {
      bundlePath,
      query: 'plaintext sentinel',
      purpose: 'integration_test',
      limit: 1,
      require_grant: true,
      grant: expiredGrant.result,
      app_ref: 'ref:app:mcp-test',
      purpose_ref: 'ref:purpose:integration-test',
      memory_zone_ref: 'ref:zone:default',
    });
    assert.equal(expiredContext.result.schema, 'enigma.context_pack_recall_blocked.v1');
    assert.equal(expiredContext.result.context_pack_returned, false);
    assert.equal(expiredContext.result.recall_veto.safe_to_share, false);
    assert.ok(expiredContext.result.recall_veto.reason_codes.includes('grant_expired'));
    assert.doesNotMatch(JSON.stringify(expiredContext.result), /network plaintext sentinel/);

    const optimizedContext = await callTool('optimized-context-pack', 'enigma_context_pack', {
      bundlePath,
      query: 'plaintext sentinel',
      purpose: 'integration_test',
      limit: 1,
      optimize: true,
      price_per_million_tokens: 2.5,
      currency: 'USD',
    });
    assert.equal(optimizedContext.result.optimization_plan.schema, 'enigma.memory_optimization_plan.v1');
    assert.equal(optimizedContext.result.optimization_receipts.length, optimizedContext.result.memory_addresses.length);
    assert.doesNotMatch(JSON.stringify(optimizedContext.result.optimization_plan), /network plaintext sentinel/);

    const usage = await callTool('meter-usage', 'enigma_meter_usage', {
      tenant_id: 'tenant-mcp',
      meter_id: 'mcp-meter',
      provider: 'openai',
      model: 'gpt-5.5',
      timestamp: '2026-06-23T12:00:00.000Z',
      prompt_tokens: 1200,
      completion_tokens: 300,
      memory_baseline_tokens: 1200,
      memory_optimized_tokens: 420,
      price_per_million_tokens: 2,
    });
    assert.equal(usage.result.schema, 'enigma.usage_event.v1');
    assert.equal(usage.result.usage.memory_savings_tokens, 780);
    assert.equal(usage.result.settlement_boundary.token_roi_claim, false);

    const aggregateUsage = await callTool('meter-aggregate', 'enigma_meter_usage', {
      events: [usage.result],
      tenant_id: 'tenant-mcp',
      meter_id: 'mcp-meter',
      generated_at: '2026-06-23T12:30:00.000Z',
    });
    assert.equal(aggregateUsage.result.schema, 'enigma.usage_aggregate.v1');
    assert.equal(aggregateUsage.result.event_count, 1);
    assert.equal(aggregateUsage.result.totals.memory_savings_tokens, 780);

    const settlementJob = await callTool('settlement-job', 'enigma_settlement_job', {
      tenant_id: 'tenant-mcp',
      job_type: 'context.pack',
      memory_commitment_root: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      policy_hash: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      usage_event_hash: usage.result.event_hash,
      requested_at: '2026-06-23T12:00:00.000Z',
      expires_at: '2026-06-23T12:10:00.000Z',
      max_price_amount: 5,
      payment_asset: 'USDC',
    });
    assert.equal(settlementJob.result.schema, 'enigma.permissionless_memory_job.v1');
    assert.equal(settlementJob.result.access_boundary.raw_memory_on_chain, false);

    const settlementCapacity = await callTool('settlement-capacity', 'enigma_settlement_capacity', {
      operator_id: 'operator-mcp',
      accelerator_class: 'consumer_gpu',
      hardware_ref: 'hardware://operator-mcp/rtx-4090-slot-1',
      region: 'us-central',
      model_family: 'memory-optimizer',
      model_refs: ['glm-5.2-memory-optimizer'],
      observed_at: '2026-06-23T12:00:00.000Z',
      expires_at: '2026-06-23T12:05:00.000Z',
      vram_gb: 24,
      max_context_window_tokens: 131072,
      available_context_tokens_per_minute: 900000,
      p95_latency_ms: 180,
      price_per_million_context_tokens: 0.42,
      asset: 'USDC',
      capacity_ref: 'capacity://operator-mcp/consumer-gpu/slot-1',
      terms_ref: 'terms://enigma/mcp-consumer-gpu-memory',
    });
    assert.equal(settlementCapacity.result.schema, 'enigma.consumer_gpu_capacity_profile.v1');
    assert.equal(settlementCapacity.result.service_boundary.raw_memory_access_required, false);

    const settlementQuote = await callTool('settlement-quote', 'enigma_settlement_quote', {
      job: settlementJob.result,
      operator_id: 'operator-mcp',
      service_kind: 'memory_optimizer',
      quoted_at: '2026-06-23T12:01:00.000Z',
      expires_at: '2026-06-23T12:09:00.000Z',
      price_amount: 0.42,
      asset: 'USDC',
      capacity_profile: settlementCapacity.result,
      terms_ref: 'terms://enigma/mcp-settlement',
    });
    assert.equal(settlementQuote.result.schema, 'enigma.operator_service_quote.v1');
    assert.equal(settlementQuote.result.job_hash, settlementJob.result.job_hash);

    const settlementReceipt = await callTool('settlement-receipt', 'enigma_settlement_receipt', {
      job: settlementJob.result,
      quote: settlementQuote.result,
      completed_at: '2026-06-23T12:04:00.000Z',
      settled_amount: 0.4,
      settlement_ref: 'settlement://mcp/receipt',
      service_receipt_ref: 'receipt://gateway/mcp/hash-only',
    });
    assert.equal(settlementReceipt.result.schema, 'enigma.service_settlement_receipt.v1');
    assert.equal(settlementReceipt.result.settlement_boundary.token_roi_claim, false);

    const settlementVerified = await callTool('settlement-verify', 'enigma_settlement_verify', {
      job: settlementJob.result,
      quote: settlementQuote.result,
      receipt: settlementReceipt.result,
    });
    assert.equal(settlementVerified.result.ok, true);

    const settlementBatch = await callTool('settlement-batch', 'enigma_settlement_batch', {
      receipts: [settlementReceipt.result],
      asset: 'USDC',
      batch_ref: 'batch://mcp/settlement',
      generated_at: '2026-06-23T12:30:00.000Z',
    });
    assert.equal(settlementBatch.result.schema, 'enigma.settlement_batch.v1');
    assert.equal(settlementBatch.result.receipt_count, 1);

    const resource = await handleJsonRpcRequest({
      jsonrpc: '2.0',
      id: 'passport-summary',
      method: 'resources/read',
      params: { uri: 'enigma://passport/summary', bundlePath },
    });
    assert.equal(resource.error, undefined);
    const summary = JSON.parse(resource.result.contents[0].text);
    assert.equal(summary.ok, true);
    assert.equal(summary.counts.memory_objects, 2);

    const prompt = await handleJsonRpcRequest({
      jsonrpc: '2.0',
      id: 'standard-prompt',
      method: 'prompts/get',
      params: { name: 'enigma_standard_memory_prompt', arguments: { question: 'What should I know?', purpose: 'integration_test' } },
    });
    assert.equal(prompt.error, undefined);
    assert.equal(prompt.result.messages[0].content.type, 'text');
    assert.match(prompt.result.messages[0].content.text, /integration_test/);

    const deleted = await callTool('delete', 'enigma_delete', { bundlePath, memory_addr: remembered.result.memory_addr, reason: 'integration-test-cleanup' });
    assert.equal(deleted.result.ok, true);
    assert.equal(deleted.result.memory_addr, remembered.result.memory_addr);

    const verified = await callTool('verify', 'enigma_verify_receipts', { bundlePath });
    assert.equal(verified.result.ok, true);

    const { readFile, writeFile } = await import('node:fs/promises');
    const truncatedPath = `${dir}/truncated-bundle.json`;
    const truncated = JSON.parse(await readFile(bundlePath, 'utf8'));
    truncated.receipts = truncated.receipts.slice(0, -1);
    await writeFile(truncatedPath, JSON.stringify(truncated), 'utf8');
    const truncatedResponse = await handleJsonRpcRequest({
      jsonrpc: '2.0',
      id: 'verify-truncated',
      method: 'tools/call',
      params: { name: 'enigma_verify_receipts', arguments: { bundlePath: truncatedPath } },
    });
    assert.equal(truncatedResponse.error, undefined);
    assert.equal(truncatedResponse.result.isError, true);
    const truncatedVerified = truncatedResponse.result.structuredContent;
    assert.equal(truncatedVerified.ok, false);
    assert.match(JSON.stringify(truncatedVerified.errors), /BUNDLE_RECEIPT_LOG_ROOT_MISMATCH|BUNDLE_SEQUENCE_MISMATCH/);
  } finally {
    const { rm } = await import('node:fs/promises');
    await rm(dir, { recursive: true, force: true });
  }
});

test('MCP JSON-RPC hardening returns typed errors and preserves notification semantics', async () => {
  const rawSentinel = 'json-rpc raw memory sentinel must not leak';
  const supported = await handleJsonRpcRequest({
    jsonrpc: '2.0',
    id: 'init-supported',
    method: 'initialize',
    params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: {} },
  });
  assert.equal(supported.error, undefined);
  assert.equal(supported.result.protocolVersion, '2024-11-05');

  const unsupported = await handleJsonRpcRequest({
    jsonrpc: '2.0',
    id: 'init-unsupported',
    method: 'initialize',
    params: { protocolVersion: rawSentinel },
  });
  assert.equal(unsupported.error.code, -32602);
  assert.deepEqual(unsupported.error.data.supportedProtocolVersions, ['2024-11-05']);
  assert.doesNotMatch(JSON.stringify(unsupported), /json-rpc raw memory sentinel/);

  const invalidId = await handleJsonRpcRequest({ jsonrpc: '2.0', id: { nested: true }, method: 'ping' });
  assert.equal(invalidId.id, null);
  assert.equal(invalidId.error.code, -32600);
  const invalidStringId = await handleJsonRpcRequest({ jsonrpc: '2.0', id: rawSentinel, method: 'ping' });
  assert.equal(invalidStringId.id, null);
  assert.equal(invalidStringId.error.code, -32600);
  assert.doesNotMatch(JSON.stringify(invalidStringId), /json-rpc raw memory sentinel/);
  const invalidEnvelope = await handleJsonRpcRequest({ jsonrpc: '2.0' });
  assert.equal(invalidEnvelope.id, null);
  assert.equal(invalidEnvelope.error.code, -32600);


  const unknownMethod = await handleJsonRpcRequest({ jsonrpc: '2.0', id: 'unknown-method', method: rawSentinel });
  assert.equal(unknownMethod.error.code, -32601);
  assert.doesNotMatch(JSON.stringify(unknownMethod), /json-rpc raw memory sentinel/);

  assert.equal(await handleJsonRpcRequest({ jsonrpc: '2.0', method: 'ping' }), undefined);
  assert.equal(await handleJsonRpcRequest([{ jsonrpc: '2.0', method: 'ping' }]), undefined);
  const batch = await handleJsonRpcRequest([
    { jsonrpc: '2.0', method: 'ping' },
    { jsonrpc: '2.0', id: 'batch-ping', method: 'ping' },
  ]);
  assert.deepEqual(batch, [{ jsonrpc: '2.0', id: 'batch-ping', result: {} }]);
  const tempRoot = process.env.TEMP ?? process.env.TMP ?? '.';
  const notificationDir = `${tempRoot}/enigma-network-notification-${process.pid}-${Date.now()}`;
  const notificationBundle = `${notificationDir}/bundle.json`;
  try {
    const toolNotification = await handleJsonRpcRequest({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: 'enigma_init', arguments: { bundlePath: notificationBundle } },
    });
    assert.equal(toolNotification, undefined);
    const { access, rm } = await import('node:fs/promises');
    await access(notificationBundle);
    await rm(notificationDir, { recursive: true, force: true });
  } finally {
    const { rm } = await import('node:fs/promises');
    await rm(notificationDir, { recursive: true, force: true });
  }

  for (const request of [
    { jsonrpc: '2.0', id: 'init-extra-param', method: 'initialize', params: { protocolVersion: '2024-11-05', unsupported: rawSentinel } },
    { jsonrpc: '2.0', id: 'tools-list-extra-param', method: 'tools/list', params: { unexpected: rawSentinel } },
    { jsonrpc: '2.0', id: 'params-array', method: 'tools/call', params: [] },
    { jsonrpc: '2.0', id: 'unknown-tool', method: 'tools/call', params: { name: rawSentinel, arguments: {} } },
    { jsonrpc: '2.0', id: 'missing-required', method: 'tools/call', params: { name: 'enigma_remember', arguments: {} } },
    { jsonrpc: '2.0', id: 'extra-arg', method: 'tools/call', params: { name: 'enigma_init', arguments: { bundle_path: rawSentinel } } },
    { jsonrpc: '2.0', id: 'extra-tool-call-param', method: 'tools/call', params: { name: 'enigma_init', arguments: {}, unexpected: rawSentinel } },
    { jsonrpc: '2.0', id: 'bad-array', method: 'tools/call', params: { name: 'enigma_remember', arguments: { text: 'ok', tags: ['ok', 7] } } },
    { jsonrpc: '2.0', id: 'bad-search-limit', method: 'tools/call', params: { name: 'enigma_search', arguments: { limit: 0 } } },
    { jsonrpc: '2.0', id: 'bad-context-limit', method: 'tools/call', params: { name: 'enigma_context_pack', arguments: { limit: 51 } } },
    { jsonrpc: '2.0', id: 'bad-context-revoked-ref', method: 'tools/call', params: { name: 'enigma_context_pack', arguments: { revoked_grant_refs: ['not-a-public-ref'] } } },
    { jsonrpc: '2.0', id: 'unknown-resource', method: 'resources/read', params: { uri: rawSentinel } },
    { jsonrpc: '2.0', id: 'extra-resource-param', method: 'resources/read', params: { uri: 'enigma://passport/summary', unexpected: rawSentinel } },
    { jsonrpc: '2.0', id: 'extra-prompt-argument', method: 'prompts/get', params: { name: 'enigma_standard_memory_prompt', arguments: { question: 'ok', unexpected: rawSentinel } } },
    { jsonrpc: '2.0', id: 'unknown-prompt', method: 'prompts/get', params: { name: rawSentinel } },
  ]) {
    const response = await handleJsonRpcRequest(request);
    assert.equal(response.error.code, -32602, request.id);
    assert.doesNotMatch(JSON.stringify(response), /json-rpc raw memory sentinel/, request.id);
  }

  const operationalFailure = await handleJsonRpcRequest({
    jsonrpc: '2.0',
    id: 'tool-operational-failure',
    method: 'tools/call',
    params: { name: 'enigma_verify_receipts', arguments: { bundlePath: rawSentinel } },
  });
  assert.equal(operationalFailure.error, undefined);
  assert.equal(operationalFailure.result.isError, true);
  assert.doesNotMatch(JSON.stringify(operationalFailure), /json-rpc raw memory sentinel/);

  const templates = await handleJsonRpcRequest({ jsonrpc: '2.0', id: 'templates', method: 'resources/templates/list' });
  assert.deepEqual(templates.result, { resourceTemplates: [] });
});

test('MCP stdio server remains newline JSON-RPC compatible', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  let stdout = '';
  output.on('data', (chunk) => {
    stdout += chunk.toString('utf8');
  });

  const server = startStdioServer({ input, output, errorOutput: { write() {} } });
  input.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'ping' })}\n`);
  input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 'ping', method: 'ping' })}\n`);
  input.write('{not-json}\n');
  input.end();
  await server.done;

  const responses = stdout.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  assert.deepEqual(responses, [
    { jsonrpc: '2.0', id: 'ping', result: {} },
    { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
  ]);
});

test('mesh demo succeeds and relay rejects plaintext records', () => {
  const demo = runMeshDemo();
  assert.equal(demo.ok, true);
  assert.equal(typeof demo.node?.node_id, 'string');
  assert.ok(demo.node.node_id.length > 0);
  assert.equal(typeof demo.node?.trust_descriptor?.public_key, 'string');
  assert.ok(demo.node.trust_descriptor.public_key.length > 0);
  assert.equal(demo.capsule?.ok, true);
  assert.equal(demo.witness?.ok, true);
  assert.equal(typeof demo.relay?.record_id, 'string');
  assert.ok(demo.relay.record_id.length > 0);
  assert.equal(demo.relay.rejected_plaintext, true);
  assert.equal(demo.federation?.ok, true);
  assert.equal(demo.no_plaintext_leakage, true);

  const store = createRelayStore();
  assert.throws(
    () => pushRelayRecord(store, {
      record_id: 'relay:plaintext-test',
      capsule_id: 'capsule:test',
      plaintext: 'do not relay raw memory',
    }),
    /plaintext/i,
  );
});

test('relay stores only payload hashes and rejects disguised plaintext payloads', () => {
  const store = createRelayStore();
  assert.throws(
    () => pushRelayRecord(store, {
      record_id: 'relay:disguised-plaintext',
      capsule_id: 'capsule:test',
      opaque_encrypted_record: 'please remember this prompt as raw memory',
    }),
    /encrypted envelope|commitment/i,
  );
  assert.throws(
    () => pushRelayRecord(store, {
      record_id: 'relay:disguised-with-hash',
      capsule_id: 'capsule:test',
      encrypted_payload_hash: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
      opaque_encrypted_record: 'conversation transcript: raw memory',
    }),
    /encrypted envelope|commitment/i,
  );

  const accepted = pushRelayRecord(store, {
    record_id: 'relay:encrypted-envelope',
    capsule_id: 'capsule:test',
    opaque_encrypted_record: 'age1-valid-ciphertext-envelope',
  });
  assert.equal(accepted.payload_storage, 'hash_only');
  assert.match(accepted.encrypted_payload_hash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(Object.prototype.hasOwnProperty.call(accepted, 'opaque_encrypted_record'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(store.records.get(accepted.record_id), 'opaque_encrypted_record'), false);
});

test('relay endpoint rejects disguised plaintext opaque payloads', async () => {
  const state = createRelayState({ allowUnauthenticated: true });
  const response = await callRelay(state, 'POST', '/relay/push', {
    record_id: 'relay:endpoint-disguised',
    capsule_id: 'capsule:test',
    encrypted_payload_hash: 'sha256:2222222222222222222222222222222222222222222222222222222222222222',
    opaque_encrypted_record: 'prompt: copy this raw memory into the relay',
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.ok, false);
  assert.match(response.body.error, /encrypted envelope|commitment/i);

  const opaqueEnvelope = 'age1relayciphertextsentinel';
  const accepted = await callRelay(state, 'POST', '/relay/push', {
    record_id: 'relay:endpoint-encrypted',
    capsule_id: 'capsule:test',
    opaque_encrypted_record: opaqueEnvelope,
  });
  assert.equal(accepted.status, 201);
  assert.equal(accepted.body.record.payload_storage, 'hash_only');
  assert.equal(Object.prototype.hasOwnProperty.call(accepted.body.record, 'opaque_encrypted_record'), false);
  assert.doesNotMatch(JSON.stringify(accepted.body), /relayciphertextsentinel/);

  const pulled = await callRelay(state, 'GET', `/relay/pull?id=${encodeURIComponent(accepted.body.record.record_id)}`);
  assert.equal(pulled.status, 200);
  assert.equal(Object.prototype.hasOwnProperty.call(pulled.body.record, 'opaque_encrypted_record'), false);
  assert.doesNotMatch(JSON.stringify(pulled.body), /relayciphertextsentinel/);
});

test('relay endpoints require paired signatures unless explicitly in local demo mode', async () => {
  const state = createRelayState({ now: '1970-01-01T00:00:00.000Z' });
  const pushBody = {
    record_id: 'relay:auth-required',
    capsule_id: 'capsule:auth',
    opaque_encrypted_record: 'age1authrequiredciphertext',
  };
  const denied = await callRelay(state, 'POST', '/relay/push', pushBody);
  assert.equal(denied.status, 400);
  assert.match(denied.body.error, /authorization required/i);

  const demoState = createRelayState({ allowUnauthenticated: true });
  const demoHealth = await callRelay(demoState, 'GET', '/health');
  assert.equal(demoHealth.body.health.authorization.mode, 'unauthenticated_local_demo');
  const demoPush = await callRelay(demoState, 'POST', '/relay/push', {
    record_id: 'relay:demo-public',
    capsule_id: 'capsule:demo',
    opaque_encrypted_record: 'age1demopublicciphertext',
  });
  assert.equal(demoPush.status, 201);
  assert.equal(demoPush.body.authorization.mode, 'unauthenticated_local_demo');
  assert.equal(demoPush.body.authorization.authenticated, false);

  const { client, pairing } = await pairRelayClient(state);
  const pushHeaders = relayAuthHeaders(state, pairing, client, 'relay.push', 'POST', '/relay/push', pushBody);
  const accepted = await callRelay(state, 'POST', '/relay/push', pushBody, pushHeaders);
  assert.equal(accepted.status, 201);
  assert.equal(accepted.body.authorization.mode, 'paired_client_signature');
  assert.equal(accepted.body.authorization.authenticated, true);

  const pullUrl = `/relay/pull?id=${encodeURIComponent(accepted.body.record.record_id)}`;
  const deniedPull = await callRelay(state, 'GET', pullUrl);
  assert.equal(deniedPull.status, 400);
  assert.match(deniedPull.body.error, /authorization required/i);
  const tamperedHeaders = relayAuthHeaders(state, pairing, client, 'relay.push', 'GET', pullUrl);
  const tampered = await callRelay(state, 'GET', pullUrl, {}, tamperedHeaders);
  assert.equal(tampered.status, 400);
  assert.match(tampered.body.error, /signature mismatch/i);

  const pullHeaders = relayAuthHeaders(state, pairing, client, 'relay.pull', 'GET', pullUrl);
  const pulled = await callRelay(state, 'GET', pullUrl, {}, pullHeaders);
  assert.equal(pulled.status, 200);
  assert.equal(pulled.body.record.record_id, accepted.body.record.record_id);

  const witnessBody = {
    subject_node_id: 'subject:auth',
    epoch: 1,
    receipt_log_root: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    active_set_root: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  };
  const deniedWitness = await callRelay(state, 'POST', '/witness/checkpoint', witnessBody);
  assert.equal(deniedWitness.status, 400);
  assert.match(deniedWitness.body.error, /authorization required/i);

  const witnessHeaders = relayAuthHeaders(state, pairing, client, 'witness.checkpoint', 'POST', '/witness/checkpoint', witnessBody);
  const checkpoint = await callRelay(state, 'POST', '/witness/checkpoint', witnessBody, witnessHeaders);
  assert.equal(checkpoint.status, 201);
  assert.equal(checkpoint.body.authorization.mode, 'paired_client_signature');
  assert.equal(checkpoint.body.verification.ok, true);
});


test('relay witness rejects mismatched roots and continuity breaks', async () => {
  const state = createRelayState({ now: '1970-01-01T00:00:00.000Z', allowUnauthenticated: true });
  const mismatched = await callRelay(state, 'POST', '/witness/checkpoint', {
    subject_node_id: 'subject:demo',
    epoch: 1,
    receipt_log_root: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    active_set_root: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    checkpoint_root: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
  });
  assert.equal(mismatched.status, 400);
  assert.equal(mismatched.body.ok, false);
  assert.match(mismatched.body.error, /checkpoint_root/i);

  const first = await callRelay(state, 'POST', '/witness/checkpoint', {
    subject_node_id: 'subject:demo',
    epoch: 1,
    receipt_log_root: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    active_set_root: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  });
  assert.equal(first.status, 201);
  assert.equal(first.body.verification.ok, true);


  const nonMonotonic = await callRelay(state, 'POST', '/witness/checkpoint', {
    subject_node_id: 'subject:demo',
    epoch: 1,
    receipt_log_root: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    active_set_root: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  });
  assert.equal(nonMonotonic.status, 400);
  assert.equal(nonMonotonic.body.ok, false);
  assert.match(nonMonotonic.body.error, /epoch/i);
  const brokenContinuity = await callRelay(state, 'POST', '/witness/checkpoint', {
    subject_node_id: 'subject:demo',
    epoch: 2,
    receipt_log_root: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    active_set_root: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    previous_witness_hash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
  });
  assert.equal(brokenContinuity.status, 400);
  assert.equal(brokenContinuity.body.ok, false);
  assert.match(brokenContinuity.body.error, /continuity/i);
});

test('relay file state persists opaque records witness log and pairings fail-closed', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'enigma-relay-state-'));
  try {
    const file = join(directory, 'relay-state.json');
    const state = createRelayState({ now: '1970-01-01T00:00:00.000Z' });
    const { client, pairing } = await pairRelayClient(state);
    const pendingClient = generateSigningKeyPair({ key_id: 'relay-pending-client-test-key' });
    const pending = await callRelay(state, 'POST', '/pairing/challenge', { public_key: pendingClient.publicKey });
    assert.equal(pending.status, 201);

    const pushBody = {
      record_id: 'relay:persisted-record',
      capsule_id: 'capsule:persisted',
      opaque_encrypted_record: 'age1persistedrelayciphertext',
    };
    const pushed = await callRelay(
      state,
      'POST',
      '/relay/push',
      pushBody,
      relayAuthHeaders(state, pairing, client, 'relay.push', 'POST', '/relay/push', pushBody),
    );
    assert.equal(pushed.status, 201);
    assert.equal(pushed.body.record.payload_storage, 'hash_only');

    const witnessBody = {
      subject_node_id: 'subject:persisted',
      epoch: 1,
      receipt_log_root: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      active_set_root: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    };
    const witnessed = await callRelay(
      state,
      'POST',
      '/witness/checkpoint',
      witnessBody,
      relayAuthHeaders(state, pairing, client, 'witness.checkpoint', 'POST', '/witness/checkpoint', witnessBody),
    );
    assert.equal(witnessed.status, 201);
    assert.equal(witnessed.body.verification.ok, true);

    const saved = await saveRelayStateToFile(state, file);
    const fileSnapshot = JSON.parse(readFileSync(file, 'utf8'));
    assert.deepEqual(fileSnapshot, saved);
    assert.equal(fileSnapshot.schema, 'enigma.relay_state.v1');
    assert.equal(fileSnapshot.relay_store.metadata.record_count, 1);
    assert.equal(fileSnapshot.completed_pairings.length, 1);
    assert.equal(fileSnapshot.witness_log.length, 1);
    assert.equal(Object.prototype.hasOwnProperty.call(fileSnapshot, 'pairingChallenges'), false);
    assert.equal(JSON.stringify(fileSnapshot).includes(pending.body.challenge.challenge_id), false);
    assertNoOwnKeysDeep(fileSnapshot, ['body', 'opaque_encrypted_record', 'plaintext', 'nonce'], 'relay state snapshot');

    const loaded = await loadRelayStateFromFile(file, { now: '1970-01-01T00:01:00.000Z' });
    assert.equal(loaded.pairingChallenges.size, 0);
    assert.equal(loaded.pairings.has(pairing.pairing_id), true);

    const pullUrl = `/relay/pull?id=${encodeURIComponent(pushed.body.record.record_id)}`;
    const pulled = await callRelay(
      loaded,
      'GET',
      pullUrl,
      {},
      relayAuthHeaders(loaded, pairing, client, 'relay.pull', 'GET', pullUrl),
    );
    assert.equal(pulled.status, 200);
    assert.equal(pulled.body.record.encrypted_payload_hash, pushed.body.record.encrypted_payload_hash);
    assert.equal(Object.prototype.hasOwnProperty.call(pulled.body.record, 'opaque_encrypted_record'), false);

    const nextWitnessBody = {
      subject_node_id: 'subject:persisted',
      epoch: 2,
      receipt_log_root: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      active_set_root: 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      previous_witness_hash: witnessed.body.checkpoint.witness_hash,
    };
    const continuedWitness = await callRelay(
      loaded,
      'POST',
      '/witness/checkpoint',
      nextWitnessBody,
      relayAuthHeaders(loaded, pairing, client, 'witness.checkpoint', 'POST', '/witness/checkpoint', nextWitnessBody),
    );
    assert.equal(continuedWitness.status, 201);
    assert.equal(continuedWitness.body.verification.ok, true);

    const secondPushBody = {
      record_id: 'relay:persisted-record-after-reload',
      capsule_id: 'capsule:persisted',
      opaque_encrypted_record: 'age1persistedrelayciphertextafterreload',
    };
    const secondPushed = await callRelay(
      loaded,
      'POST',
      '/relay/push',
      secondPushBody,
      relayAuthHeaders(loaded, pairing, client, 'relay.push', 'POST', '/relay/push', secondPushBody),
    );
    assert.equal(secondPushed.status, 201);
    assert.equal(loaded.relayStore.records.size, 2);

    const tamperedWitness = serializeRelayState(loaded);
    tamperedWitness.witness_log[0].witness_hash = 'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    assert.throws(() => hydrateRelayState(tamperedWitness), /witness checkpoint hash mismatch/i);

    const malformedSchema = serializeRelayState(loaded);
    malformedSchema.schema = 'enigma.relay_state.v0';
    assert.throws(() => hydrateRelayState(malformedSchema), /schema mismatch/i);

    const malformedVersion = serializeRelayState(loaded);
    malformedVersion.version = 2;
    assert.throws(() => hydrateRelayState(malformedVersion), /version mismatch/i);

    const injected = serializeRelayState(loaded);
    injected.relay_records[0].body = 'raw memory should fail closed';
    assert.throws(() => hydrateRelayState(injected), /plaintext-looking/i);
    const injectedFile = join(directory, 'relay-state-injected.json');
    writeFileSync(injectedFile, `${JSON.stringify(injected)}\n`, 'utf8');
    await assert.rejects(() => loadRelayStateFromFile(injectedFile), /plaintext-looking/i);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('enterprise demo succeeds and policy denies disallowed regions and legal hold deletes', () => {
  const demo = runEnterpriseDemo();
  assert.equal(demo.allow_retrieval?.allowed, true);
  assert.ok(demo.allow_retrieval.reason_codes.includes('ALLOW'));
  assert.equal(demo.deny_disallowed_region?.allowed, false);
  assert.ok(demo.deny_disallowed_region.reason_codes.includes('REGION_DENIED'));
  assert.equal(demo.deny_legal_hold_delete?.allowed, false);
  assert.ok(demo.deny_legal_hold_delete.reason_codes.includes('LEGAL_HOLD_DELETE_DENIED'));
  assert.equal(demo.verification?.ok, true);
  assert.equal(demo.siem_event?.decision, 'deny');
  assert.ok(Array.isArray(demo.siem_event.reason_codes));
  assert.doesNotMatch(JSON.stringify(demo.siem_event), /plaintext|raw memory|secret memory/i);

  const policy = createEnterprisePolicy({
    allowed_providers: ['provider-a'],
    allowed_models: ['model-a'],
    allowed_purposes: ['integration_test'],
    allowed_regions: ['us-east-1'],
    legal_holds: ['mem:test:held'],
  });
  const regionDenied = evaluateEnterprisePolicy(policy, {
    operation: 'retrieve',
    provider: 'provider-a',
    model: 'model-a',
    region: 'eu-west-1',
    purpose: 'integration_test',
    sensitivity: 'internal',
  });
  assert.equal(regionDenied.allowed, false);
  assert.equal(regionDenied.decision, 'deny');
  assert.ok(regionDenied.reason_codes.includes('REGION_DENIED'));

  const legalHoldDenied = evaluateEnterprisePolicy(policy, {
    operation: 'delete',
    provider: 'provider-a',
    model: 'model-a',
    region: 'us-east-1',
    purpose: 'integration_test',
    sensitivity: 'internal',
    memory_addr: 'mem:test:held',
  });
  assert.equal(legalHoldDenied.allowed, false);
  assert.equal(legalHoldDenied.decision, 'deny');
  assert.ok(legalHoldDenied.reason_codes.includes('LEGAL_HOLD_DELETE_DENIED'));
});

test('enterprise policies deny missing, unknown, and disallowed operations', () => {
  const policy = createEnterprisePolicy({
    allowed_operations: ['retrieve'],
    allowed_providers: ['provider-a'],
    allowed_models: ['model-a'],
    allowed_purposes: ['integration_test'],
    allowed_regions: ['us-east-1'],
  });
  const base = {
    provider: 'provider-a',
    model: 'model-a',
    region: 'us-east-1',
    purpose: 'integration_test',
    sensitivity: 'internal',
  };

  const missing = evaluateEnterprisePolicy(policy, base);
  assert.equal(missing.allowed, false);
  assert.ok(missing.reason_codes.includes('OPERATION_UNKNOWN'));

  const disallowed = evaluateEnterprisePolicy(policy, { ...base, operation: 'export_raw_memory' });
  assert.equal(disallowed.allowed, false);
  assert.ok(disallowed.reason_codes.includes('OPERATION_DENIED'));
});

test('gateway rejects nested plaintext keys and minimizes public proof fields', async () => {
  const state = createGatewayState();
  const plaintext = await handleGatewayRequest(state, {
    method: 'POST',
    url: '/gateway/evaluate',
    body: {
      request: {
        operation: 'retrieve',
        provider: 'kimi',
        model: 'kimi-k2',
        region: 'us-east-1',
        purpose: 'support_retrieval',
        sensitivity: 'internal',
        nested: { raw_memory: 'must not cross the gateway' },
      },
    },
  });
  assert.equal(plaintext.status, 400);
  assert.ok(plaintext.body.error.reason_codes.includes('MEMORY_PLAINTEXT_FORBIDDEN'));

  const policyResponse = await handleGatewayRequest(state, { method: 'GET', url: '/policy' });
  assert.equal(policyResponse.status, 200);
  assert.equal(policyResponse.body.internal, false);
  assert.match(policyResponse.body.policy.kms_hash, /^sha256:[a-f0-9]{64}$/);
  assertNoOwnKeysDeep(policyResponse.body.policy, ['kms', 'key_id', 'key_version', 'evidence_hash'], 'public policy response');
  assert.doesNotMatch(JSON.stringify(policyResponse.body), /gateway-local-demo-key|gateway_local_kms/);

  const decisionResponse = await handleGatewayRequest(state, {
    method: 'POST',
    url: '/gateway/decision',
    body: {
      request: {
        operation: 'retrieve',
        provider: 'kimi',
        model: 'kimi-k2',
        region: 'us-east-1',
        purpose: 'support_retrieval',
        sensitivity: 'internal',
        memory_addr: 'addr_public_proof_secret',
      },
    },
  });
  assert.equal(decisionResponse.status, 200);
  assert.equal(decisionResponse.body.verification.ok, true);
  const denylist = ['memory_addr', 'key_evidence', 'operation', 'provider', 'model', 'region', 'purpose', 'sensitivity'];
  assertNoOwnKeysDeep(decisionResponse.body, denylist, 'gateway decision response');
  for (const field of ['memory_addr_hash', 'operation_hash', 'provider_hash', 'model_hash', 'region_hash', 'purpose_hash', 'sensitivity_hash', 'key_evidence_hash']) {
    assert.match(decisionResponse.body.decision[field], /^sha256:[a-f0-9]{64}$/, `decision missing ${field}`);
    assert.match(decisionResponse.body.siem_event[field], /^sha256:[a-f0-9]{64}$/, `SIEM missing ${field}`);
  }
  assert.doesNotMatch(JSON.stringify(decisionResponse.body), /addr_public_proof_secret|support_retrieval|us-east-1|kimi-k2|internal/);

  const exportResponse = await handleGatewayRequest(state, { method: 'GET', url: '/siem/export' });
  assert.equal(exportResponse.status, 200);
  assert.equal(exportResponse.body.event_count, 1);
  assert.doesNotMatch(JSON.stringify(exportResponse.body.events), /addr_public_proof_secret|support_retrieval|us-east-1|kimi-k2|internal/);
  assertNoOwnKeysDeep(exportResponse.body, denylist, 'SIEM export response');

  const internalState = createGatewayState({ exposeInternal: true });
  const internalDecision = await handleGatewayRequest(internalState, {
    method: 'POST',
    url: '/gateway/decision',
    body: {
      request: {
        operation: 'retrieve',
        provider: 'kimi',
        model: 'kimi-k2',
        region: 'us-east-1',
        purpose: 'support_retrieval',
        sensitivity: 'internal',
      },
    },
  });
  assert.equal(internalDecision.status, 200);
  assert.equal(internalDecision.body.evaluation.operation, 'retrieve');
  assert.equal(internalDecision.body.evaluation.provider, 'kimi');
  assert.equal(internalDecision.body.evaluation.model, 'kimi-k2');
});

test('gateway decision verification requires pinned trusted key material', () => {
  const signingKeyPair = generateSigningKeyPair({ key_id: 'gateway-test-key' });
  const policy = createEnterprisePolicy({
    allowed_operations: ['retrieve'],
    allowed_providers: ['provider-a'],
    allowed_models: ['model-a'],
    allowed_purposes: ['integration_test'],
    allowed_regions: ['us-east-1'],
  });
  const request = {
    operation: 'retrieve',
    provider: 'provider-a',
    model: 'model-a',
    region: 'us-east-1',
    purpose: 'integration_test',
    sensitivity: 'internal',
    memory_addr: 'addr_gateway_verification',
  };
  const decision = createGatewayDecision({ policy, request, signingKeyPair });

  const untrusted = verifyGatewayDecision({ decision, policy });
  assert.equal(untrusted.ok, false);
  assert.ok(untrusted.errors.includes('TRUSTED_PUBLIC_KEY_REQUIRED'));

  const pinned = verifyGatewayDecision({
    decision,
    policy,
    trustedPublicKey: signingKeyPair.publicKey,
    trustedKeyId: signingKeyPair.key_id,
  });
  assert.equal(pinned.ok, true);
});

test('gateway file-backed state reloads policy decisions and minimized SIEM', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'enigma-gateway-state-'));
  try {
    const state = createGatewayState({ gateway_id: 'gateway_persistence_test' });
    const policy = createEnterprisePolicy({
      policy_id: 'policy_gateway_persistence',
      tenant_id: 'tenant_gateway_persistence',
      allowed_operations: ['retrieve'],
      allowed_providers: ['provider-persistence'],
      allowed_models: ['model-persistence'],
      allowed_regions: ['antarctica-local-1'],
      allowed_purposes: ['persistence_test'],
      denied_sensitivities: ['secret'],
    });
    const policyUpdate = await handleGatewayRequest(state, {
      method: 'PUT',
      url: '/policy',
      body: { policy },
    });
    assert.equal(policyUpdate.status, 200);
    assert.equal(policyUpdate.body.policy_hash, policy.policy_hash);

    const request = {
      operation: 'retrieve',
      provider: 'provider-persistence',
      model: 'model-persistence',
      region: 'antarctica-local-1',
      purpose: 'persistence_test',
      sensitivity: 'internal',
      memory_addr: 'addr_gateway_persistence_plaintext_must_not_persist',
      subject_id: 'subject_gateway_persistence_plaintext_must_not_persist',
    };
    const firstDecision = await handleGatewayRequest(state, {
      method: 'POST',
      url: '/gateway/decision',
      body: { request },
    });
    assert.equal(firstDecision.status, 200);
    assert.equal(firstDecision.body.verification.ok, true);
    assert.equal(state.siem_events.length, 1);

    const statePath = join(tempDir, 'gateway-state.json');
    const saved = saveGatewayStateToFile(state, statePath);
    assert.equal(saved.schema, 'enigma.gateway_state.v1');
    assert.equal(saved.gateway_id, 'gateway_persistence_test');
    assert.equal(saved.policy.policy_hash, policy.policy_hash);
    assert.equal(saved.siem_events.length, 1);
    assert.equal(saved.expose_internal, false);

    const rawSnapshot = readFileSync(statePath, 'utf8');
    assert.doesNotMatch(rawSnapshot, /addr_gateway_persistence_plaintext_must_not_persist/);
    assert.doesNotMatch(rawSnapshot, /subject_gateway_persistence_plaintext_must_not_persist/);
    assert.doesNotMatch(rawSnapshot, /"memory_addr"\s*:/);
    assert.doesNotMatch(rawSnapshot, /"subject_id"\s*:/);

    const reloaded = loadGatewayStateFromFile(statePath);
    assert.equal(reloaded.gateway_id, state.gateway_id);
    assert.equal(reloaded.policy.policy_hash, policy.policy_hash);
    assert.equal(reloaded.signingKeyPair.publicKey, state.signingKeyPair.publicKey);
    assert.equal(reloaded.siem_events.length, 1);
    assert.equal(reloaded.expose_internal, false);

    const exportResponse = await handleGatewayRequest(reloaded, { method: 'GET', url: '/siem/export' });
    assert.equal(exportResponse.status, 200);
    assert.equal(exportResponse.body.event_count, 1);
    assert.doesNotMatch(JSON.stringify(exportResponse.body.events), /addr_gateway_persistence_plaintext_must_not_persist/);

    const secondDecision = await handleGatewayRequest(reloaded, {
      method: 'POST',
      url: '/gateway/decision',
      body: { request: { ...request, memory_addr: 'addr_gateway_after_reload' } },
    });
    assert.equal(secondDecision.status, 200);
    const pinned = verifyGatewayDecision({
      decision: secondDecision.body.decision,
      policy: reloaded.policy,
      trustedPublicKey: reloaded.signingKeyPair.publicKey,
      trustedKeyId: reloaded.signingKeyPair.key_id,
    });
    assert.equal(pinned.ok, true);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('gateway state hydration fails closed for malformed or plaintext-looking snapshots', async () => {
  const state = createGatewayState({ exposeInternal: true });
  await handleGatewayRequest(state, {
    method: 'POST',
    url: '/gateway/decision',
    body: {
      request: {
        operation: 'retrieve',
        provider: 'kimi',
        model: 'kimi-k2',
        region: 'us-east-1',
        purpose: 'support_retrieval',
        sensitivity: 'internal',
        memory_addr: 'addr_gateway_plaintext_reject',
      },
    },
  });
  const snapshot = serializeGatewayState(state);

  assert.equal(hydrateGatewayState({ ...snapshot, expose_internal: false }).expose_internal, false);
  assert.equal(hydrateGatewayState({ ...snapshot, expose_internal: false }, { exposeInternal: true }).expose_internal, true);
  assert.equal(hydrateGatewayState(snapshot).expose_internal, true);

  assert.throws(() => hydrateGatewayState({ ...snapshot, body: 'raw request body must fail closed' }), /gateway state invalid/);
  assert.throws(() => hydrateGatewayState({ ...snapshot, schema: 'enigma.gateway_state.v0' }), /gateway state invalid/);
  assert.throws(
    () => hydrateGatewayState({ ...snapshot, policy: { ...snapshot.policy, policy_hash: `sha256:${'0'.repeat(64)}` } }),
    /gateway state invalid/
  );
  assert.throws(
    () => hydrateGatewayState({ ...snapshot, signing_key: { ...snapshot.signing_key, private_key: 'not a private key' } }),
    /gateway state invalid/
  );
  assert.throws(
    () => hydrateGatewayState({ ...snapshot, siem_events: [{ ...snapshot.siem_events[0], memory_addr: 'addr_plaintext' }] }),
    /gateway state invalid/
  );
  assert.throws(
    () => hydrateGatewayState({ ...snapshot, siem_events: [{ schema: 'enigma.enterprise_siem_event.v1', body: 'raw SIEM body' }] }),
    /gateway state invalid/
  );
});

test('CLI command functions import without side effects', async () => {
  const originalWrite = process.stdout.write;
  let importOutput = '';
  process.stdout.write = function write(chunk, ...args) {
    importOutput += String(chunk);
    if (typeof args.at(-1) === 'function') args.at(-1)();
    return true;
  };
  let cli;
  try {
    cli = await import(`../apps/cli/bin/enigma.mjs?side-effect=${Date.now()}`);
  } finally {
    process.stdout.write = originalWrite;
  }
  assert.equal(importOutput, '');
  assert.equal(typeof cli.main, 'function');
  assert.equal(typeof cli.mcpServeCommand, 'function');
  assert.equal(typeof cli.meshDemoCommand, 'function');
  assert.equal(typeof cli.enterpriseDemoCommand, 'function');

  let output = '';
  const io = { stdout: { write(chunk) { output += chunk; } }, stderr: { write() {} } };
  assert.equal(await cli.meshDemoCommand(new Map(), io), 0);
  assert.equal(JSON.parse(output).ok, true);

  output = '';
  assert.equal(await cli.enterpriseDemoCommand(new Map(), io), 0);
  assert.equal(JSON.parse(output).verification.ok, true);

  output = '';
  assert.equal(await cli.main(['mesh', 'demo'], io), 0);
  assert.equal(JSON.parse(output).ok, true);

  output = '';
  assert.equal(await cli.main(['enterprise', 'demo'], io), 0);
  assert.equal(JSON.parse(output).verification.ok, true);
});
