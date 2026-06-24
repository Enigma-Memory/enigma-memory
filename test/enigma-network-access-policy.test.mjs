import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  NETWORK_ACCESS_POLICY_RESULT_SCHEMA,
  NETWORK_ACCESS_POLICY_SCHEMA,
  REQUIRED_PRIVATE_ROUTES,
  REQUIRED_PUBLIC_PROBES,
  validateNetworkAccessPolicy,
} from '../scripts/validate-network-access-policy.mjs';

const execFileAsync = promisify(execFile);

function publicProbe(name) {
  const service = name.startsWith('relay') ? 'relay' : 'gateway';
  const path = name.endsWith('livez') ? '/livez' : '/readyz';
  return {
    name,
    service,
    method: 'GET',
    path,
    public: true,
    tls_required: true,
    rate_limit_ref: `rate-limit://public/${name}`,
    owner: 'network-owner',
  };
}

function privateRoute(name) {
  const routePath = {
    relay_records_write: '/relay/records',
    gateway_admin_policy: '/policy',
    gateway_data_plane_evaluate: '/gateway/evaluate',
    gateway_data_plane_decision: '/gateway/decision',
    gateway_siem_export: '/siem/export',
  }[name];
  const method = name === 'gateway_admin_policy' || name === 'gateway_siem_export' ? 'GET' : 'POST';
  return {
    name,
    service: name.startsWith('relay') ? 'relay' : 'gateway',
    method,
    path: routePath,
    public: false,
    tls_required: true,
    network_ref: `network://private/${name}`,
    auth_mode: 'bearer_hash',
    auth_config_ref: `secret-manager-ref://hash-only/${name}`,
    audit_ref: `audit://network/${name}`,
    owner: 'network-owner',
  };
}

function completePolicy() {
  return {
    schema: NETWORK_ACCESS_POLICY_SCHEMA,
    metadata: {
      policy_id: 'network-policy-fixture',
      environment: 'production-fixture',
      tenant: 'enigma-fixture',
      owner: 'network-owner',
      approved_at: '2026-06-23T12:00:00.000Z',
      approval_ref: 'ticket://network/approved',
      status: 'approved',
    },
    network_zones: {
      public_ingress_ref: 'ingress://public/enigma',
      private_admin_network_ref: 'network://private/admin',
      private_data_plane_network_ref: 'network://private/data-plane',
      egress_policy_ref: 'egress://default-deny/enigma',
      waf_or_rate_limit_ref: 'waf://enigma/public-probes',
      tls_policy_ref: 'tls://enigma/managed-cert',
      owner: 'network-owner',
    },
    public_endpoints: REQUIRED_PUBLIC_PROBES.map(publicProbe),
    private_routes: REQUIRED_PRIVATE_ROUTES.map(privateRoute),
    limits: {
      max_request_bytes: 1048576,
      max_requests_per_minute: 600,
      body_timeout_seconds: 15,
      enforcement_ref: 'gateway://limits/enforced',
    },
    egress: {
      default_denied: true,
      policy_ref: 'egress://default-deny/enigma',
      allowed_destinations: [
        {
          name: 'siem',
          destination_ref: 'siem://approved/sink',
          purpose: 'plaintext-minimized audit delivery',
          owner: 'siem-owner',
          sensitive_content_allowed: false,
        },
      ],
    },
    break_glass: {
      approval_ref: 'ticket://break-glass/approved',
      audit_ref: 'audit://break-glass/session-log',
      owner: 'security-owner',
      expiry_policy_ref: 'policy://break-glass/expiry',
      max_session_seconds: 1800,
      enabled_without_approval: false,
    },
    no_token_values_in_policy: true,
  };
}

test('network access validator accepts fail-closed production policy', () => {
  const result = validateNetworkAccessPolicy(completePolicy(), { generated_at: '2026-06-23T12:00:00.000Z' });
  assert.equal(result.schema, NETWORK_ACCESS_POLICY_RESULT_SCHEMA);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'accepted');
  assert.deepEqual(result.blockers, []);
  assert.equal(result.checked.public_probes_covered, REQUIRED_PUBLIC_PROBES.length);
  assert.equal(result.checked.private_routes_covered, REQUIRED_PRIVATE_ROUTES.length);
  assert.equal(result.checked.egress_destinations, 1);
});

test('network access validator blocks public admin paths and unauthenticated private routes', () => {
  const policy = completePolicy();
  policy.public_endpoints[0].path = '/policy';
  policy.private_routes[0].public = true;
  policy.private_routes[1].auth_mode = 'none';
  policy.egress.default_denied = false;
  policy.no_token_values_in_policy = false;
  const result = validateNetworkAccessPolicy(policy);
  assert.equal(result.ok, false);
  const messages = result.blockers.map((entry) => entry.message).join('\n');
  assert.match(messages, /\/livez or \/readyz/);
  assert.match(messages, /private admin or data-plane/);
  assert.match(messages, /public must be false/);
  assert.match(messages, /auth_mode/);
  assert.match(messages, /default_denied/);
  assert.match(messages, /no_token_values_in_policy/);
});

test('network access validator rejects secrets and raw memory', () => {
  const withSecret = completePolicy();
  withSecret.network_zones.public_ingress_ref = 'https://user:password@example.invalid/ingress';
  assert.throws(() => validateNetworkAccessPolicy(withSecret), /secret|raw-memory/i);

  const withBadField = completePolicy();
  withBadField.private_routes[0].raw_memory = 'private prompt';
  assert.throws(() => validateNetworkAccessPolicy(withBadField), /forbidden field|secret|raw-memory/i);
});

test('network access CLI returns blocked result for missing private route', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-network-access-'));
  const policy = completePolicy();
  policy.private_routes = policy.private_routes.filter((route) => route.name !== 'gateway_data_plane_decision');
  const path = join(dir, 'network-policy.json');
  await writeFile(path, `${JSON.stringify(policy, null, 2)}\n`, 'utf8');
  const result = await execFileAsync(process.execPath, [
    'scripts/validate-network-access-policy.mjs',
    '--policy',
    path,
  ], { cwd: process.cwd(), timeout: 10000, windowsHide: true }).catch((error) => error);
  assert.equal(result.code, 1);
  assert.equal(result.stderr, '');
  const output = JSON.parse(result.stdout);
  assert.equal(output.schema, NETWORK_ACCESS_POLICY_RESULT_SCHEMA);
  assert.equal(output.ok, false);
  assert.match(JSON.stringify(output.blockers), /gateway_data_plane_decision/);
  assert.doesNotMatch(result.stdout, /Bearer\s+[A-Za-z0-9._~+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@/i);
});
