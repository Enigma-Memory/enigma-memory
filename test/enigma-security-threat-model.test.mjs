import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  REQUIRED_ASSET_IDS,
  REQUIRED_BOUNDARY_IDS,
  REQUIRED_NON_CLAIM_IDS,
  SECURITY_THREAT_MODEL_RESULT_SCHEMA,
  SECURITY_THREAT_MODEL_REVIEW_SCHEMA,
  validateSecurityThreatModel,
} from '../scripts/validate-security-threat-model.mjs';

const execFileAsync = promisify(execFile);

function entry(id) {
  return {
    id,
    owner: `${id}-owner`,
    evidence_ref: `security://evidence/${id}`,
    status: 'verified',
  };
}

function completeReview() {
  return {
    schema: SECURITY_THREAT_MODEL_REVIEW_SCHEMA,
    metadata: {
      review_id: 'threat-model-fixture',
      environment: 'production-fixture',
      tenant: 'enigma-fixture',
      owner: 'security-owner',
      reviewer: 'security-reviewer',
      approved_at: '2026-06-23T12:00:00.000Z',
      approval_ref: 'ticket://security/threat-model-approved',
      status: 'approved',
    },
    source_refs: {
      security_policy_ref: 'SECURITY.md#current',
      threat_model_ref: 'docs/security-threat-model.md#current',
      public_api_ref: 'docs/public-api-reference.md#current',
      operator_acceptance_ref: 'docs/operator-acceptance-packet.md#current',
    },
    assets: REQUIRED_ASSET_IDS.map(entry),
    trust_boundaries: REQUIRED_BOUNDARY_IDS.map(entry),
    risks: [
      {
        id: 'relay-plaintext-leakage',
        asset_id: 'relay',
        boundary_id: 'relay_api',
        adversary: 'malicious client',
        abuse_case: 'tries to submit memory-bearing payloads',
        control_ref: 'packages/relay/plaintext-rejection',
        evidence_ref: 'test://enigma-network/plaintext-rejection',
        owner: 'relay-owner',
        status: 'mitigated',
        tests: ['test/enigma-network.test.mjs'],
      },
      {
        id: 'public-site-pii-leakage',
        asset_id: 'public_site',
        boundary_id: 'public_site',
        adversary: 'accidental publisher',
        abuse_case: 'publishes personal contact data or private collateral',
        control_ref: 'scripts/validate-public-site-security.mjs',
        evidence_ref: 'test://enigma-public-site-security',
        owner: 'site-owner',
        status: 'mitigated',
        tests: ['test/enigma-public-site-security.test.mjs'],
      },
    ],
    non_claims: REQUIRED_NON_CLAIM_IDS.map((id) => ({
      id,
      claimed: false,
      evidence_ref: `policy://non-claim/${id}`,
    })),
    review_cadence: {
      next_review_at: '2026-09-23T12:00:00.000Z',
      trigger_ref: 'runbook://security/threat-model-trigger',
      owner: 'security-owner',
    },
  };
}

test('security threat model validator accepts complete reviewed model', () => {
  const result = validateSecurityThreatModel(completeReview(), { generated_at: '2026-06-23T12:00:00.000Z' });
  assert.equal(result.schema, SECURITY_THREAT_MODEL_RESULT_SCHEMA);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'accepted');
  assert.deepEqual(result.blockers, []);
  assert.equal(result.checked.assets_covered, REQUIRED_ASSET_IDS.length);
  assert.equal(result.checked.boundaries_covered, REQUIRED_BOUNDARY_IDS.length);
  assert.equal(result.checked.non_claims_covered, REQUIRED_NON_CLAIM_IDS.length);
  assert.equal(result.checked.mitigated_risks, 2);
});

test('security threat model validator blocks missing coverage and blocked risks', () => {
  const review = completeReview();
  review.assets = review.assets.filter((asset) => asset.id !== 'settlement');
  review.trust_boundaries = review.trust_boundaries.filter((boundary) => boundary.id !== 'cloud_provider');
  review.non_claims = review.non_claims.filter((entry) => entry.id !== 'token_roi_profit_equity');
  review.risks[0].status = 'blocked';
  const result = validateSecurityThreatModel(review);
  assert.equal(result.ok, false);
  const messages = result.blockers.map((entry) => entry.message).join('\n');
  assert.match(messages, /settlement/);
  assert.match(messages, /cloud_provider/);
  assert.match(messages, /token_roi_profit_equity/);
  assert.match(messages, /blocked risks/);
});

test('security threat model validator rejects secrets and forbidden fields', () => {
  const withSecret = completeReview();
  withSecret.metadata.approval_ref = 'https://user:password@example.invalid/security';
  assert.throws(() => validateSecurityThreatModel(withSecret), /secret|not allowed/i);

  const badField = completeReview();
  badField.assets[0].raw_memory = 'private prompt';
  assert.throws(() => validateSecurityThreatModel(badField), /not allowed|secret/i);
});

test('security threat model CLI returns blocked result for incomplete model', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-threat-model-'));
  const review = completeReview();
  review.risks = [];
  const path = join(dir, 'threat-model.json');
  await writeFile(path, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
  const result = await execFileAsync(process.execPath, [
    'scripts/validate-security-threat-model.mjs',
    '--review',
    path,
  ], { cwd: process.cwd(), timeout: 10000, windowsHide: true }).catch((error) => error);
  assert.equal(result.code, 1);
  assert.equal(result.stderr, '');
  const output = JSON.parse(result.stdout);
  assert.equal(output.schema, SECURITY_THREAT_MODEL_RESULT_SCHEMA);
  assert.equal(output.ok, false);
  assert.match(JSON.stringify(output.blockers), /risks/);
  assert.doesNotMatch(result.stdout, /Bearer\s+[A-Za-z0-9._~+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@/i);
});
