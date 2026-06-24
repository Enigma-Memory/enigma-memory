#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LEGAL_COMPLIANCE_APPROVAL_SCHEMA = 'enigma.legal_compliance_approval.v1';
export const LEGAL_COMPLIANCE_APPROVAL_RESULT_SCHEMA = 'enigma.legal_compliance_approval_result.v1';

export const REQUIRED_REVIEW_AREAS = Object.freeze([
  'privacy',
  'security',
  'marketing',
  'digital_asset_finance',
  'compliance',
  'data_retention',
  'incident_notification',
]);

export const REQUIRED_NO_CLAIM_IDS = Object.freeze([
  'provider_deletion',
  'model_forgetting',
  'semantic_erasure',
  'imported_source_completeness',
  'token_roi_profit_equity',
  'compliance_status',
  'tamper_proof_hardware',
  'raw_compute_superiority',
  'guaranteed_discount_or_savings',
  'hosted_live_ready_without_operator_evidence',
  'unsupported_market_superlative',
]);

const ACCEPTED_STATUSES = new Set(['approved', 'accepted', 'go', 'verified']);
const APPROVED_STATEMENTS = new Set(['approved', 'accepted', 'go', 'verified']);
const NO_CLAIM_STATUSES = new Set(['no_claim', 'no-claim', 'blocked', 'rejected']);
const ACCEPTED_DECISIONS = new Set(['approved', 'no_claim_only']);
const SECRET_VALUE_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@|raw memory|private prompt|full transcript|decrypted capsule|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16})/iu;
const SECRET_KEY_RE = /(?:password|passwd|pwd|token|api[_-]?key|private[_-]?key|secret|raw[_-]?memory|plaintext|plain[_-]?text|prompt|completion|transcript|embedding|provider[_-]?response)/iu;
const SAFE_FIELD_NAMES = new Set(['digital_asset_finance', 'token_roi_profit_equity', 'provider_deletion']);
const RISKY_APPROVED_CLAIM_RE = /(?:provider[-\s]?side\s+deletion|\bprovider\s+deletion\b|model\s+forgetting|semantic\s+erasure|complete\s+(?:import|source)|imported[-\s]?source\s+completeness|token\s+(?:roi|profit|equity|revenue\s*share)|(?:roi|profit|equity|revenue\s*share)\s+token|(?:SEC|SOC\s*2|HIPAA|GDPR|compliance)\s+(?:certified|approved|compliant|status)|tamper[-\s]?proof|raw\s+compute\s+superiority|(?:guarantee(?:d|s)?|prove(?:n)?|fixed)\s+(?:\d+(?:\.\d+)?%\s+)?(?:discount|savings?|cost\s+reduction)|\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?%\s+(?:discount|cheaper|savings?)|hosted[_\s-]?live[_\s-]?ready|best\s+(?:in|on)\s+(?:the\s+)?world|better\s+than\s+anything|unmatched|unrivaled|never\s+been\s+done)/iu;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isoLike(value) {
  return nonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

function blocker(message, path) {
  return { message, path };
}

function assertNoSecrets(value, path = 'approval') {
  if (typeof value === 'string') {
    if (!/\.claim_boundary\[\d+\]$/.test(path) && SECRET_VALUE_RE.test(value)) throw new Error(`${path} contains secret or raw-memory-looking data`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecrets(item, `${path}[${index}]`));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY_RE.test(key) && !SAFE_FIELD_NAMES.has(key)) throw new Error(`${path}.${key} uses a forbidden field name`);
    assertNoSecrets(child, `${path}.${key}`);
  }
}

function statusAccepted(value) {
  return typeof value === 'string' && ACCEPTED_STATUSES.has(value.trim().toLowerCase());
}

function statementStatusApproved(value) {
  return typeof value === 'string' && APPROVED_STATEMENTS.has(value.trim().toLowerCase());
}

function noClaimStatus(value) {
  return typeof value === 'string' && NO_CLAIM_STATUSES.has(value.trim().toLowerCase());
}

function validateReviewAreas(reviewAreas, blockers) {
  if (!isPlainObject(reviewAreas)) {
    blockers.push(blocker('review_areas object is required', 'review_areas'));
    return 0;
  }
  let checked = 0;
  for (const area of REQUIRED_REVIEW_AREAS) {
    const entry = reviewAreas[area];
    checked += 1;
    if (!isPlainObject(entry)) {
      blockers.push(blocker(`review_areas.${area} is required`, `review_areas.${area}`));
      continue;
    }
    for (const field of ['owner', 'evidence_ref', 'status']) {
      if (!nonEmptyString(entry[field])) blockers.push(blocker(`review_areas.${area}.${field} is required`, `review_areas.${area}.${field}`));
    }
    if (!statusAccepted(entry.status)) blockers.push(blocker(`review_areas.${area}.status must be approved/accepted/go/verified`, `review_areas.${area}.status`));
  }
  return checked;
}

function validateReviewedStatements(statements, decision, blockers) {
  if (!Array.isArray(statements)) {
    blockers.push(blocker('reviewed_statements array is required', 'reviewed_statements'));
    return { checked: 0, approved: 0, noClaim: 0 };
  }
  let approved = 0;
  let noClaim = 0;
  statements.forEach((statement, index) => {
    const path = `reviewed_statements[${index}]`;
    if (!isPlainObject(statement)) {
      blockers.push(blocker('reviewed statement must be object', path));
      return;
    }
    for (const field of ['statement_id', 'text', 'scope', 'evidence_ref', 'status']) {
      if (!nonEmptyString(statement[field])) blockers.push(blocker(`${path}.${field} is required`, `${path}.${field}`));
    }
    const status = String(statement.status ?? '').trim().toLowerCase();
    if (statementStatusApproved(status)) {
      approved += 1;
      if (RISKY_APPROVED_CLAIM_RE.test(String(statement.text ?? ''))) {
        blockers.push(blocker('approved statement contains unsupported or compliance-sensitive overclaim', `${path}.text`));
      }
    } else if (noClaimStatus(status)) {
      noClaim += 1;
    } else {
      blockers.push(blocker(`${path}.status must be approved/accepted/go/verified/no_claim/blocked/rejected`, `${path}.status`));
    }
  });
  if (decision === 'approved' && approved === 0) blockers.push(blocker('approved decision requires at least one approved reviewed_statement', 'reviewed_statements'));
  return { checked: statements.length, approved, noClaim };
}

function validateNoClaims(noClaims, blockers) {
  if (!Array.isArray(noClaims)) {
    blockers.push(blocker('no_claims array is required', 'no_claims'));
    return 0;
  }
  const byId = new Map();
  noClaims.forEach((entry, index) => {
    const path = `no_claims[${index}]`;
    if (!isPlainObject(entry)) {
      blockers.push(blocker('no-claim entry must be object', path));
      return;
    }
    for (const field of ['claim_id', 'decision', 'scope', 'evidence_ref']) {
      if (!nonEmptyString(entry[field])) blockers.push(blocker(`${path}.${field} is required`, `${path}.${field}`));
    }
    if (String(entry.decision ?? '').trim().toLowerCase() !== 'no_claim') blockers.push(blocker(`${path}.decision must be no_claim`, `${path}.decision`));
    if (nonEmptyString(entry.claim_id)) byId.set(entry.claim_id, entry);
  });
  for (const claimId of REQUIRED_NO_CLAIM_IDS) {
    if (!byId.has(claimId)) blockers.push(blocker(`no_claims must include ${claimId}`, 'no_claims'));
  }
  return noClaims.length;
}

function validatePublicationControls(controls, blockers) {
  if (!isPlainObject(controls)) {
    blockers.push(blocker('publication_controls object is required', 'publication_controls'));
    return false;
  }
  for (const field of ['publication_ref', 'claims_owner', 'withdrawal_path_ref', 'last_review_expires_at']) {
    if (!nonEmptyString(controls[field])) blockers.push(blocker(`publication_controls.${field} is required`, `publication_controls.${field}`));
  }
  if (!isoLike(controls.last_review_expires_at)) blockers.push(blocker('publication_controls.last_review_expires_at must be ISO time', 'publication_controls.last_review_expires_at'));
  if (!Array.isArray(controls.allowed_channels) || controls.allowed_channels.length === 0 || !controls.allowed_channels.every(nonEmptyString)) {
    blockers.push(blocker('publication_controls.allowed_channels must be non-empty strings', 'publication_controls.allowed_channels'));
  }
  return true;
}

export function validateLegalComplianceApproval(approval, options = {}) {
  if (!isPlainObject(approval)) throw new Error('legal compliance approval must be an object');
  assertNoSecrets(approval);
  const blockers = [];
  if (approval.schema !== LEGAL_COMPLIANCE_APPROVAL_SCHEMA) blockers.push(blocker('schema mismatch', 'schema'));

  const metadata = approval.metadata;
  let decision = String(approval.decision ?? '').trim().toLowerCase();
  if (!isPlainObject(metadata)) blockers.push(blocker('metadata is required', 'metadata'));
  else {
    for (const field of ['approval_id', 'environment', 'tenant', 'legal_owner', 'privacy_owner', 'reviewer', 'approved_at', 'approval_ref', 'status']) {
      if (!nonEmptyString(metadata[field])) blockers.push(blocker(`metadata.${field} is required`, `metadata.${field}`));
    }
    if (!statusAccepted(metadata.status)) blockers.push(blocker('metadata.status must be approved/accepted/go/verified', 'metadata.status'));
    if (!isoLike(metadata.approved_at)) blockers.push(blocker('metadata.approved_at must be ISO time', 'metadata.approved_at'));
  }

  if (!ACCEPTED_DECISIONS.has(decision)) {
    blockers.push(blocker('decision must be approved or no_claim_only', 'decision'));
    decision = 'blocked';
  }

  const reviewAreasChecked = validateReviewAreas(approval.review_areas, blockers);
  const statements = validateReviewedStatements(approval.reviewed_statements, decision, blockers);
  const noClaimsChecked = validateNoClaims(approval.no_claims, blockers);
  validatePublicationControls(approval.publication_controls, blockers);

  const result = {
    schema: LEGAL_COMPLIANCE_APPROVAL_RESULT_SCHEMA,
    generated_at: options.generated_at ?? options.generatedAt ?? new Date(0).toISOString(),
    ok: blockers.length === 0,
    decision: blockers.length === 0 ? decision : 'blocked',
    blockers,
    checked: {
      review_areas: reviewAreasChecked,
      reviewed_statements: statements.checked,
      approved_statements: statements.approved,
      no_claim_statements: statements.noClaim,
      required_no_claims: REQUIRED_NO_CLAIM_IDS.length,
      supplied_no_claims: noClaimsChecked,
      publication_controls: isPlainObject(approval.publication_controls),
    },
    claim_boundary: [
      'Legal/compliance approval validation checks declared approval shape and overclaim blockers only; it is not legal advice.',
      'Approved statements must not claim provider deletion, model forgetting, compliance certification, token ROI, guaranteed savings, raw compute superiority, unsupported superlatives, or hosted live readiness without separate operator evidence.',
      'Secrets, raw memory, prompts, transcripts, provider responses, decrypted content, and credentials must remain outside legal/compliance artifacts.',
    ],
  };
  assertNoSecrets(result, 'result');
  return result;
}

function parseArgs(argv = process.argv.slice(2)) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq !== -1) flags.set(arg.slice(2, eq), arg.slice(eq + 1));
    else if (!argv[index + 1] || argv[index + 1].startsWith('--')) flags.set(arg.slice(2), true);
    else {
      flags.set(arg.slice(2), argv[index + 1]);
      index += 1;
    }
  }
  return flags;
}

function getFlag(flags, names) {
  for (const name of names) if (flags.has(name)) return flags.get(name);
  return undefined;
}

async function main() {
  const flags = parseArgs();
  const approvalPath = getFlag(flags, ['approval', 'in']);
  if (!nonEmptyString(approvalPath)) throw new Error('--approval <path> is required');
  const approval = JSON.parse(await readFile(resolve(String(approvalPath)), 'utf8'));
  const result = validateLegalComplianceApproval(approval, { generated_at: new Date().toISOString() });
  const out = getFlag(flags, ['out']);
  const text = `${JSON.stringify(result, null, 2)}\n`;
  if (out && out !== true) {
    const outPath = resolve(String(out));
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, text, 'utf8');
  }
  process.stdout.write(text);
  process.exitCode = result.ok ? 0 : 1;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.name ?? 'Error'}: ${error.message}\n`);
    process.exitCode = 1;
  });
}
