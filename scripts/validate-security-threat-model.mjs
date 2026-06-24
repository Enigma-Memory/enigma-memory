#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SECURITY_THREAT_MODEL_REVIEW_SCHEMA = 'enigma.security_threat_model_review.v1';
export const SECURITY_THREAT_MODEL_RESULT_SCHEMA = 'enigma.security_threat_model_result.v1';

export const REQUIRED_ASSET_IDS = Object.freeze([
  'local_vault',
  'mcp_server',
  'native_host',
  'relay',
  'gateway',
  'optimizer',
  'metering',
  'settlement',
  'public_site',
  'domain_tls',
  'kms_custody',
  'durable_storage',
  'siem_export',
  'backup_restore',
]);

export const REQUIRED_BOUNDARY_IDS = Object.freeze([
  'local_device',
  'browser_extension',
  'mcp_client',
  'provider_page',
  'relay_api',
  'gateway_api',
  'operator_admin',
  'cloud_provider',
  'public_site',
]);

export const REQUIRED_NON_CLAIM_IDS = Object.freeze([
  'provider_deletion',
  'model_forgetting',
  'token_roi_profit_equity',
  'compliance_certification',
  'tamper_proof_hardware',
  'provider_invoice_savings',
]);

const ACCEPTED_STATUSES = new Set(['approved', 'accepted', 'go', 'verified']);
const ACCEPTED_RISK_STATUSES = new Set(['mitigated', 'accepted', 'transferred', 'blocked']);
const SECRET_VALUE_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@|raw memory|private prompt|full transcript|decrypted capsule|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16})/iu;
const FORBIDDEN_KEY_RE = /(?:password|passwd|pwd|token|api[_-]?key|private[_-]?key|secret|raw[_-]?memory|plaintext|plain[_-]?text|prompt|completion|transcript|provider[_-]?response|cookie|session)/iu;
const SAFE_FIELD_NAMES = new Set(['token_roi_profit_equity']);

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

function assertNoSensitivePayload(value, path = 'threat_model') {
  if (typeof value === 'string') {
    if (!/\.(claim_boundary\[\d+\]|blockers\[\d+\]\.message)$/.test(path) && SECRET_VALUE_RE.test(value)) throw new Error(`${path} contains secret-looking data`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSensitivePayload(item, `${path}[${index}]`));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (FORBIDDEN_KEY_RE.test(key) && !SAFE_FIELD_NAMES.has(key) && !/^result\.blockers\[\d+\]\.message$/.test(childPath)) throw new Error(`${childPath} is not allowed in security threat model evidence`);
    assertNoSensitivePayload(child, childPath);
  }
}

function statusAccepted(value) {
  return typeof value === 'string' && ACCEPTED_STATUSES.has(value.trim().toLowerCase());
}

function validateMetadata(metadata, blockers) {
  if (!isPlainObject(metadata)) {
    blockers.push(blocker('metadata is required', 'metadata'));
    return;
  }
  for (const field of ['review_id', 'environment', 'tenant', 'owner', 'reviewer', 'approved_at', 'approval_ref', 'status']) {
    if (!nonEmptyString(metadata[field])) blockers.push(blocker(`metadata.${field} is required`, `metadata.${field}`));
  }
  if (!statusAccepted(metadata.status)) blockers.push(blocker('metadata.status must be approved/accepted/go/verified', 'metadata.status'));
  if (!isoLike(metadata.approved_at)) blockers.push(blocker('metadata.approved_at must be ISO time', 'metadata.approved_at'));
}

function validateRefs(refs, blockers) {
  if (!isPlainObject(refs)) {
    blockers.push(blocker('source_refs object is required', 'source_refs'));
    return false;
  }
  for (const field of ['security_policy_ref', 'threat_model_ref', 'public_api_ref', 'operator_acceptance_ref']) {
    if (!nonEmptyString(refs[field])) blockers.push(blocker(`source_refs.${field} is required`, `source_refs.${field}`));
  }
  return true;
}

function validateIdCoverage(entries, requiredIds, kind, blockers) {
  if (!Array.isArray(entries)) {
    blockers.push(blocker(`${kind} must be an array`, kind));
    return { checked: 0, covered: 0 };
  }
  const ids = new Set();
  entries.forEach((entry, index) => {
    const path = `${kind}[${index}]`;
    if (!isPlainObject(entry)) {
      blockers.push(blocker(`${kind} entry must be object`, path));
      return;
    }
    if (!nonEmptyString(entry.id)) blockers.push(blocker(`${path}.id is required`, `${path}.id`));
    else ids.add(entry.id);
    for (const field of ['owner', 'evidence_ref', 'status']) {
      if (!nonEmptyString(entry[field])) blockers.push(blocker(`${path}.${field} is required`, `${path}.${field}`));
    }
    if (!statusAccepted(entry.status)) blockers.push(blocker(`${path}.status must be approved/accepted/go/verified`, `${path}.status`));
  });
  for (const id of requiredIds) if (!ids.has(id)) blockers.push(blocker(`${kind} must include ${id}`, kind));
  return { checked: entries.length, covered: requiredIds.filter((id) => ids.has(id)).length };
}

function validateRisks(risks, blockers) {
  if (!Array.isArray(risks) || risks.length === 0) {
    blockers.push(blocker('risks must be non-empty array', 'risks'));
    return { checked: 0, mitigated: 0, accepted: 0, blocked: 0 };
  }
  let mitigated = 0;
  let accepted = 0;
  let blocked = 0;
  risks.forEach((risk, index) => {
    const path = `risks[${index}]`;
    if (!isPlainObject(risk)) {
      blockers.push(blocker('risk entry must be object', path));
      return;
    }
    for (const field of ['id', 'asset_id', 'boundary_id', 'adversary', 'abuse_case', 'control_ref', 'evidence_ref', 'owner', 'status']) {
      if (!nonEmptyString(risk[field])) blockers.push(blocker(`${path}.${field} is required`, `${path}.${field}`));
    }
    const status = String(risk.status ?? '').trim().toLowerCase();
    if (!ACCEPTED_RISK_STATUSES.has(status)) blockers.push(blocker(`${path}.status must be mitigated/accepted/transferred/blocked`, `${path}.status`));
    if (status === 'mitigated') mitigated += 1;
    if (status === 'accepted' || status === 'transferred') accepted += 1;
    if (status === 'blocked') blocked += 1;
    if (!Array.isArray(risk.tests) || risk.tests.length === 0 || risk.tests.some((test) => !nonEmptyString(test))) blockers.push(blocker(`${path}.tests must be non-empty string array`, `${path}.tests`));
  });
  if (blocked > 0) blockers.push(blocker('threat model contains blocked risks', 'risks'));
  return { checked: risks.length, mitigated, accepted, blocked };
}

function validateNonClaims(nonClaims, blockers) {
  if (!Array.isArray(nonClaims)) {
    blockers.push(blocker('non_claims must be an array', 'non_claims'));
    return { checked: 0, covered: 0 };
  }
  const ids = new Set();
  nonClaims.forEach((entry, index) => {
    const path = `non_claims[${index}]`;
    if (!isPlainObject(entry)) {
      blockers.push(blocker('non-claim entry must be object', path));
      return;
    }
    if (!nonEmptyString(entry.id)) blockers.push(blocker(`${path}.id is required`, `${path}.id`));
    else ids.add(entry.id);
    if (entry.claimed !== false) blockers.push(blocker(`${path}.claimed must be false`, `${path}.claimed`));
    if (!nonEmptyString(entry.evidence_ref)) blockers.push(blocker(`${path}.evidence_ref is required`, `${path}.evidence_ref`));
  });
  for (const id of REQUIRED_NON_CLAIM_IDS) if (!ids.has(id)) blockers.push(blocker(`non_claims must include ${id}`, 'non_claims'));
  return { checked: nonClaims.length, covered: REQUIRED_NON_CLAIM_IDS.filter((id) => ids.has(id)).length };
}

function validateReviewCadence(cadence, blockers) {
  if (!isPlainObject(cadence)) {
    blockers.push(blocker('review_cadence object is required', 'review_cadence'));
    return false;
  }
  for (const field of ['next_review_at', 'trigger_ref', 'owner']) {
    if (!nonEmptyString(cadence[field])) blockers.push(blocker(`review_cadence.${field} is required`, `review_cadence.${field}`));
  }
  if (!isoLike(cadence.next_review_at)) blockers.push(blocker('review_cadence.next_review_at must be ISO time', 'review_cadence.next_review_at'));
  return true;
}

export function validateSecurityThreatModel(review, options = {}) {
  if (!isPlainObject(review)) throw new Error('security threat model review must be an object');
  assertNoSensitivePayload(review);
  const blockers = [];
  if (review.schema !== SECURITY_THREAT_MODEL_REVIEW_SCHEMA) blockers.push(blocker('schema mismatch', 'schema'));
  validateMetadata(review.metadata, blockers);
  const sourceRefs = validateRefs(review.source_refs, blockers);
  const assets = validateIdCoverage(review.assets, REQUIRED_ASSET_IDS, 'assets', blockers);
  const boundaries = validateIdCoverage(review.trust_boundaries, REQUIRED_BOUNDARY_IDS, 'trust_boundaries', blockers);
  const risks = validateRisks(review.risks, blockers);
  const nonClaims = validateNonClaims(review.non_claims, blockers);
  const cadence = validateReviewCadence(review.review_cadence, blockers);
  const result = {
    schema: SECURITY_THREAT_MODEL_RESULT_SCHEMA,
    generated_at: options.generated_at ?? options.generatedAt ?? new Date(0).toISOString(),
    ok: blockers.length === 0,
    status: blockers.length === 0 ? 'accepted' : 'blocked',
    blockers,
    checked: {
      source_refs: sourceRefs,
      required_assets: REQUIRED_ASSET_IDS.length,
      assets_covered: assets.covered,
      assets: assets.checked,
      required_boundaries: REQUIRED_BOUNDARY_IDS.length,
      boundaries_covered: boundaries.covered,
      boundaries: boundaries.checked,
      risks: risks.checked,
      mitigated_risks: risks.mitigated,
      accepted_risks: risks.accepted,
      blocked_risks: risks.blocked,
      required_non_claims: REQUIRED_NON_CLAIM_IDS.length,
      non_claims_covered: nonClaims.covered,
      review_cadence: cadence,
    },
    claim_boundary: [
      'Security threat model validation checks declared review evidence only; it is not SOC 2, HIPAA, GDPR, penetration-test, or compliance certification evidence.',
      'A pass result does not claim provider deletion, model forgetting, token ROI/profit/equity, tamper-proof hardware, or provider invoice savings.',
      'Threat model artifacts must not include raw memory, prompts, transcripts, provider responses, credentials, private keys, cookies, or sessions.',
    ],
  };
  assertNoSensitivePayload(result, 'result');
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
  const reviewPath = getFlag(flags, ['review', 'threat-model', 'in']);
  if (typeof reviewPath !== 'string' || reviewPath.trim() === '') throw new Error('--review <path> is required');
  const review = JSON.parse(await readFile(resolve(reviewPath), 'utf8'));
  const result = validateSecurityThreatModel(review, { generated_at: new Date().toISOString() });
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
