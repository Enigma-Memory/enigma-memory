import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  LEGAL_COMPLIANCE_APPROVAL_RESULT_SCHEMA,
  LEGAL_COMPLIANCE_APPROVAL_SCHEMA,
  REQUIRED_NO_CLAIM_IDS,
  REQUIRED_REVIEW_AREAS,
  validateLegalComplianceApproval,
} from '../scripts/validate-legal-compliance-approval.mjs';

const execFileAsync = promisify(execFile);

function reviewArea(area) {
  return {
    owner: `${area}-owner`,
    evidence_ref: `ticket://legal/${area}/approved`,
    status: 'approved',
  };
}

function noClaim(claimId) {
  return {
    claim_id: claimId,
    decision: 'no_claim',
    scope: `External materials must not make the ${claimId} claim without separate written approval.`,
    evidence_ref: `policy://claim-boundary/${claimId}`,
  };
}

function completeApproval() {
  return {
    schema: LEGAL_COMPLIANCE_APPROVAL_SCHEMA,
    metadata: {
      approval_id: 'legal-approval-fixture',
      environment: 'production-fixture',
      tenant: 'enigma-fixture',
      legal_owner: 'legal-owner-fixture',
      privacy_owner: 'privacy-owner-fixture',
      reviewer: 'legal-reviewer-fixture',
      approved_at: '2026-06-23T12:00:00.000Z',
      approval_ref: 'ticket://legal/approved',
      status: 'approved',
    },
    decision: 'approved',
    review_areas: Object.fromEntries(REQUIRED_REVIEW_AREAS.map((area) => [area, reviewArea(area)])),
    reviewed_statements: [
      {
        statement_id: 'receipt-boundary',
        text: 'Enigma receipts verify Enigma-mediated state transitions under declared software and policy boundaries.',
        scope: 'public documentation and operator packet',
        evidence_ref: 'docs://operator-acceptance-packet#claim-boundary',
        status: 'approved',
      },
      {
        statement_id: 'compliance-no-claim',
        text: 'No compliance status is claimed by the local package, demo, or static public website.',
        scope: 'public documentation and launch collateral',
        evidence_ref: 'policy://claim-boundary/compliance_status',
        status: 'no_claim',
      },
    ],
    no_claims: REQUIRED_NO_CLAIM_IDS.map(noClaim),
    publication_controls: {
      publication_ref: 'docs://public-api-reference',
      allowed_channels: ['docs', 'operator_packet'],
      claims_owner: 'legal-owner-fixture',
      withdrawal_path_ref: 'runbook://legal/withdraw-public-claim',
      last_review_expires_at: '2026-09-23T12:00:00.000Z',
    },
  };
}

test('legal compliance validator accepts complete claim-bounded approval', () => {
  const result = validateLegalComplianceApproval(completeApproval(), { generated_at: '2026-06-23T12:00:00.000Z' });
  assert.equal(result.schema, LEGAL_COMPLIANCE_APPROVAL_RESULT_SCHEMA);
  assert.equal(result.ok, true);
  assert.equal(result.decision, 'approved');
  assert.deepEqual(result.blockers, []);
  assert.equal(result.checked.review_areas, REQUIRED_REVIEW_AREAS.length);
  assert.equal(result.checked.approved_statements, 1);
  assert.equal(result.checked.no_claim_statements, 1);
  assert.equal(result.checked.required_no_claims, REQUIRED_NO_CLAIM_IDS.length);
  assert.equal(result.checked.supplied_no_claims, REQUIRED_NO_CLAIM_IDS.length);
});

test('legal compliance validator blocks risky approved claims and missing no-claim categories', () => {
  const approval = completeApproval();
  approval.reviewed_statements[0].text = 'ENIGMA token holders get guaranteed ROI, revenue share, and best in the world compliance status.';
  approval.no_claims = approval.no_claims.filter((entry) => entry.claim_id !== 'compliance_status');
  approval.publication_controls.allowed_channels = [];
  const result = validateLegalComplianceApproval(approval);
  assert.equal(result.ok, false);
  assert.equal(result.decision, 'blocked');
  const messages = result.blockers.map((entry) => entry.message).join('\n');
  assert.match(messages, /overclaim/i);
  assert.match(messages, /compliance_status/);
  assert.match(messages, /allowed_channels/);
});

test('legal compliance validator rejects secrets and raw memory', () => {
  const withSecret = completeApproval();
  withSecret.publication_controls.publication_ref = 'https://user:password@example.invalid/legal';
  assert.throws(() => validateLegalComplianceApproval(withSecret), /secret|raw-memory/i);

  const withBadField = completeApproval();
  withBadField.review_areas.privacy.raw_memory = 'private prompt';
  assert.throws(() => validateLegalComplianceApproval(withBadField), /forbidden field|secret|raw-memory/i);
});

test('legal compliance CLI returns blocked result for unsafe approved claims', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-legal-compliance-'));
  const approval = completeApproval();
  approval.reviewed_statements[0].text = 'Enigma proves provider deletion and model forgetting for every imported source.';
  const path = join(dir, 'approval.json');
  await writeFile(path, `${JSON.stringify(approval, null, 2)}\n`, 'utf8');
  const result = await execFileAsync(process.execPath, [
    'scripts/validate-legal-compliance-approval.mjs',
    '--approval',
    path,
  ], { cwd: process.cwd(), timeout: 10000, windowsHide: true }).catch((error) => error);
  assert.equal(result.code, 1);
  assert.equal(result.stderr, '');
  const output = JSON.parse(result.stdout);
  assert.equal(output.schema, LEGAL_COMPLIANCE_APPROVAL_RESULT_SCHEMA);
  assert.equal(output.ok, false);
  assert.match(JSON.stringify(output.blockers), /overclaim/i);
  assert.doesNotMatch(result.stdout, /Bearer\s+[A-Za-z0-9._~+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@/i);
});
