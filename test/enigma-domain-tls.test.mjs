import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  DOMAIN_TLS_EVIDENCE_SCHEMA,
  DOMAIN_TLS_RESULT_SCHEMA,
  validateDomainTlsEvidence,
} from '../scripts/validate-domain-tls.mjs';

const execFileAsync = promisify(execFile);

function completeEvidence() {
  return {
    schema: DOMAIN_TLS_EVIDENCE_SCHEMA,
    domain: 'enigmamemory.com',
    public_url: 'https://enigmamemory.com/',
    dns: {
      provider: 'cloudflare',
      zone_ref: 'cloudflare://zone/enigmamemory.com',
      propagation_ref: 'dns-observation://enigmamemory.com/2026-06-23',
      status: 'verified',
      records: [
        {
          type: 'CNAME',
          name: 'enigmamemory.com',
          value_ref: 'pages://enigma-memory.pages.dev',
          status: 'verified',
        },
      ],
    },
    tls: {
      issuer: 'Cloudflare Inc ECC',
      certificate_ref: 'cloudflare-cert://enigmamemory.com/current',
      expires_at: '2026-12-23T12:00:00.000Z',
      renewal_ref: 'cloudflare-managed-renewal://enigmamemory.com',
      alert_ref: 'monitor://certificate-expiry/enigmamemory.com',
      status: 'active',
      subject_alt_names: ['enigmamemory.com', 'www.enigmamemory.com'],
    },
    endpoint: {
      url: 'https://enigmamemory.com/',
      status_code: 200,
      content_type: 'text/html; charset=utf-8',
      observed_at: '2026-06-23T12:00:00.000Z',
      public_site_security_ref: 'public-site-security#accepted',
      security_headers: {
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'DENY',
        'referrer-policy': 'strict-origin-when-cross-origin',
        'permissions-policy': 'camera=(), microphone=(), geolocation=()',
        'content-security-policy': "default-src 'self'",
      },
    },
    claim_boundary: {
      public_endpoint_only: true,
      backend_readiness_claim: false,
      credential_claim: false,
      token_roi_claim: false,
      provider_invoice_savings_claim: false,
    },
  };
}

test('domain TLS validator accepts complete public endpoint evidence', () => {
  const result = validateDomainTlsEvidence(completeEvidence(), {
    generated_at: '2026-06-23T12:00:00.000Z',
    now: '2026-06-23T12:00:00.000Z',
  });
  assert.equal(result.schema, DOMAIN_TLS_RESULT_SCHEMA);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'accepted');
  assert.deepEqual(result.blockers, []);
  assert.equal(result.checked.domain, 'enigmamemory.com');
  assert.equal(result.checked.dns_records, 1);
  assert.equal(result.checked.endpoint_status_code, 200);
});

test('domain TLS validator blocks mismatched hosts weak headers and expired certs', () => {
  const evidence = completeEvidence();
  evidence.public_url = 'http://evil.example.invalid/';
  evidence.endpoint.url = 'https://example.invalid/';
  evidence.endpoint.security_headers['x-content-type-options'] = 'sniff';
  delete evidence.endpoint.security_headers['content-security-policy'];
  evidence.tls.expires_at = '2025-01-01T00:00:00.000Z';
  evidence.claim_boundary.backend_readiness_claim = true;
  const result = validateDomainTlsEvidence(evidence, { now: '2026-06-23T12:00:00.000Z' });
  assert.equal(result.ok, false);
  const messages = result.blockers.map((entry) => entry.message).join('\n');
  assert.match(messages, /https/);
  assert.match(messages, /host must match/);
  assert.match(messages, /expires_at/);
  assert.match(messages, /content-security-policy/);
  assert.match(messages, /x-content-type-options/);
  assert.match(messages, /backend_readiness_claim/);
});

test('domain TLS validator rejects secrets and forbidden evidence fields', () => {
  const withSecret = completeEvidence();
  withSecret.endpoint.url = 'https://user:password@enigmamemory.com/';
  assert.throws(() => validateDomainTlsEvidence(withSecret), /secret|not allowed/i);

  const badField = completeEvidence();
  badField.dns.api_key = 'private prompt';
  assert.throws(() => validateDomainTlsEvidence(badField), /not allowed|secret/i);
});

test('domain TLS CLI returns blocked result for incomplete evidence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-domain-tls-'));
  const evidence = completeEvidence();
  evidence.dns.records = [];
  evidence.endpoint.status_code = 500;
  const path = join(dir, 'domain.json');
  await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  const result = await execFileAsync(process.execPath, [
    'scripts/validate-domain-tls.mjs',
    '--evidence',
    path,
  ], { cwd: process.cwd(), timeout: 10000, windowsHide: true }).catch((error) => error);
  assert.equal(result.code, 1);
  assert.equal(result.stderr, '');
  const output = JSON.parse(result.stdout);
  assert.equal(output.schema, DOMAIN_TLS_RESULT_SCHEMA);
  assert.equal(output.ok, false);
  assert.match(JSON.stringify(output.blockers), /dns\.records|status_code/);
  assert.doesNotMatch(result.stdout, /Bearer\s+[A-Za-z0-9._~+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@/i);
});
