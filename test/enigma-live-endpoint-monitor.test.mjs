import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LIVE_ENDPOINTS,
  LIVE_ENDPOINT_MONITOR_SCHEMA,
  UsageError,
  assertPublicSafeMonitorJson,
  monitorLiveEndpoints,
  normalizeEndpoint,
} from '../scripts/monitor-live-endpoints.mjs';

function fakeResponse({ status = 200, contentType = 'application/json', json = { ok: true } } = {}) {
  return {
    status,
    headers: new Map([['content-type', contentType]]),
    clone() {
      return fakeResponse({ status, contentType, json });
    },
    async json() {
      return json;
    },
  };
}

fakeResponse.headerGet = function headerGet(map) {
  return {
    get(name) {
      return map.get(String(name).toLowerCase()) ?? null;
    },
  };
};

function responseWithHeaders(input) {
  const response = fakeResponse(input);
  response.headers = fakeResponse.headerGet(response.headers);
  return response;
}

test('live endpoint monitor defaults cover public site and ready endpoints', () => {
  assert.deepEqual(DEFAULT_LIVE_ENDPOINTS.map((endpoint) => endpoint.name), ['public_site', 'relay_readyz', 'gateway_readyz']);
  for (const [index, endpoint] of DEFAULT_LIVE_ENDPOINTS.entries()) {
    const normalized = normalizeEndpoint(endpoint, index);
    assert.equal(normalized.method, 'GET');
    assert.equal(normalized.url.startsWith('https://'), true);
    assert.deepEqual(normalized.expected_status, [200]);
  }
});

test('live endpoint monitor rejects unsafe endpoint URLs', () => {
  assert.throws(() => normalizeEndpoint({ name: 'bad_scheme', url: 'http://enigmamemory.com/' }), /must use https/);
  assert.throws(() => normalizeEndpoint({ name: 'creds', url: 'https://user:pass@enigmamemory.com/readyz' }), /credentials/);
  assert.throws(() => normalizeEndpoint({ name: 'query', url: 'https://relay.enigmamemory.com/readyz?token=abc' }), /query strings or fragments/);
  assert.throws(() => normalizeEndpoint({ name: 'local', url: 'https://127.0.0.1/readyz' }), /private network/);
  assert.throws(() => normalizeEndpoint({ name: 'bad name', url: 'https://enigmamemory.com/' }), UsageError);
});

test('live endpoint monitor handles fake fetch timeout and network errors', async () => {
  const packet = await monitorLiveEndpoints({
    generated_at: '2026-06-24T00:00:00.000Z',
    timeout_ms: 1,
    endpoints: [
      { name: 'timeout_probe', url: 'https://timeout.enigmamemory.com/readyz' },
      { name: 'network_probe', url: 'https://network.enigmamemory.com/readyz' },
    ],
    async fetchImpl(url) {
      if (url.includes('timeout')) return new Promise(() => {});
      throw new Error('UPSTREAM_TEST_DETAIL_SHOULD_NOT_ESCAPE');
    },
    nowMs: () => 10,
  });

  assert.equal(packet.schema, LIVE_ENDPOINT_MONITOR_SCHEMA);
  assert.equal(packet.summary.ok, false);
  assert.equal(packet.results[0].status, 'timeout');
  assert.equal(packet.results[0].error.code, 'TIMEOUT');
  assert.equal(packet.results[1].status, 'network_error');
  assert.equal(packet.results[1].error.code, 'FETCH_ERROR');
  assert.doesNotMatch(JSON.stringify(packet), /UPSTREAM_TEST_DETAIL_SHOULD_NOT_ESCAPE/);
});

test('live endpoint monitor emits public-safe JSON without response bodies by default', async () => {
  const packet = await monitorLiveEndpoints({
    generated_at: '2026-06-24T00:00:00.000Z',
    endpoints: [{ name: 'relay_readyz', url: 'https://relay.enigmamemory.com/readyz' }],
    async fetchImpl() {
      return responseWithHeaders({ json: { ok: true, service: 'enigma-relay', credential_placeholder: '<redacted-test-value>', prompt: 'PRIVATE_PROMPT_TEST_ONLY' } });
    },
    nowMs: () => 20,
  });

  assert.equal(packet.summary.ok, true);
  assert.equal(packet.results[0].ok, true);
  assert.equal(Object.hasOwn(packet.results[0], 'safe_summary'), false);
  assert.doesNotMatch(JSON.stringify(packet), /redacted-test-value|PRIVATE_PROMPT_TEST_ONLY|response_body|raw_body/i);
  assertPublicSafeMonitorJson(packet);
});

test('live endpoint monitor safe summary is allowlisted and redacted', async () => {
  const packet = await monitorLiveEndpoints({
    generated_at: '2026-06-24T00:00:00.000Z',
    include_safe_summary: true,
    endpoints: [{ name: 'gateway_readyz', url: 'https://gateway.enigmamemory.com/readyz' }],
    async fetchImpl() {
      return responseWithHeaders({
        json: {
          ok: true,
          service: 'enigma-gateway',
          checks: [{ name: 'storage', ok: true }],
          missing_evidence_refs: [],
          provider_payload: '<redacted-provider-payload>',
        },
      });
    },
    nowMs: () => 30,
  });

  assert.equal(packet.results[0].safe_summary.ok, true);
  assert.equal(packet.results[0].safe_summary.service, 'enigma-gateway');
  assert.equal(packet.results[0].safe_summary.checks_count, 1);
  assert.equal(packet.results[0].safe_summary.missing_evidence_refs_count, 0);
  assert.doesNotMatch(JSON.stringify(packet), /provider_payload|redacted-provider-payload/);
  assertPublicSafeMonitorJson(packet);
});

test('live endpoint monitor dry-run validates endpoints without fetching', async () => {
  let called = false;
  const packet = await monitorLiveEndpoints({
    generated_at: '2026-06-24T00:00:00.000Z',
    dry_run: true,
    endpoints: [{ name: 'public_site', url: 'https://enigmamemory.com/' }],
    fetchImpl() {
      called = true;
      throw new Error('fetch must not run');
    },
  });

  assert.equal(called, false);
  assert.equal(packet.dry_run, true);
  assert.equal(packet.results[0].status, 'skipped');
  assert.equal(packet.summary.skipped, 1);
});
