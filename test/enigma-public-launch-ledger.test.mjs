import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  addPublicLaunchEvidenceEntry,
  createPublicLaunchEvidenceLedger,
  sha256Hex,
  summarizePublicLaunchEvidence,
} from '../packages/core/src/index.js';

const ISO_NOW = '2026-06-28T00:00:00.000Z';
const LEDGER_SCHEMA_FILE = 'public-launch-evidence-ledger-v1.schema.json';
const FORBIDDEN_PUBLIC_FIELDS = new Set([
  'api_key',
  'authorization',
  'body',
  'credential',
  'credentials',
  'evidence_body',
  'key_material',
  'local_path',
  'password',
  'plaintext',
  'private_key',
  'prompt',
  'provider_response',
  'raw_evidence',
  'raw_memory',
  'secret',
  'text',
  'token',
  'transcript',
]);

async function readLedgerSchema() {
  return JSON.parse(await readFile(new URL(`../specs/${LEDGER_SCHEMA_FILE}`, import.meta.url), 'utf8'));
}

function allowedEntry(overrides = {}) {
  return {
    phase_id: 'EV-P0',
    scenario_id: 'desktop_memory_drive_detect',
    owner_ref: 'ref:owner.launch_ledger',
    status: 'pass',
    advisor_decision: 'ship',
    evidence_refs: ['ref:evidence.desktop_memory_drive_detect'],
    privacy_review: {
      status: 'pass',
      reviewer_ref: 'ref:privacy.launch_reviewer',
      evidence_ref_count: 1,
      issue_codes: [],
    },
    claim_review: {
      status: 'pass',
      reviewer_ref: 'ref:claims.launch_reviewer',
      evidence_ref_count: 1,
      issue_codes: [],
    },
    rollback_ready: true,
    support_owner_ref: 'ref:support.public_beta',
    release_owner_ref: 'ref:release.public_beta',
    signing_owner_ref: 'ref:signing.public_beta',
    updated_at: ISO_NOW,
    issue_codes: [],
    ...overrides,
  };
}

function allowedLedgerArgs(overrides = {}) {
  return {
    ledger_id: 'public_launch_ev_p0',
    generated_at: ISO_NOW,
    phase_owners: [
      {
        phase_id: 'EV-P0',
        owner_ref: 'ref:owner.launch_ledger',
        support_owner_ref: 'ref:support.public_beta',
        release_owner_ref: 'ref:release.public_beta',
        signing_owner_ref: 'ref:signing.public_beta',
      },
    ],
    claim_boundary: {
      version_ref: 'ref:claim_boundary.public_launch_v1',
      allowed_claim_refs: ['ref:claim.memory_drive_local_vault'],
      disallowed_claim_refs: ['ref:claim.provider_native_deletion', 'ref:claim.model_forgetting'],
    },
    privacy_export_allowlist: ['ref:export.status_counts', 'ref:export.public_refs'],
    entries: [allowedEntry()],
    ...overrides,
  };
}

function resolveRef(root, ref) {
  assert.equal(ref.startsWith('#/$defs/'), true, `unexpected non-local ref ${ref}`);
  const name = ref.slice('#/$defs/'.length).replaceAll('~1', '/').replaceAll('~0', '~');
  assert.ok(root.$defs?.[name], `missing $defs entry ${ref}`);
  return root.$defs[name];
}

function validateValue(schema, root, value, path = '$') {
  if (schema.$ref) return validateValue(resolveRef(root, schema.$ref), root, value, path);
  if (Object.hasOwn(schema, 'const')) {
    assert.deepEqual(value, schema.const, `${path} const mismatch`);
    return;
  }
  if (schema.enum) assert.ok(schema.enum.includes(value), `${path} enum mismatch`);

  if (schema.type === 'object') {
    assert.equal(value !== null && typeof value === 'object' && !Array.isArray(value), true, `${path} object expected`);
    for (const field of schema.required ?? []) assert.ok(Object.hasOwn(value, field), `${path}.${field} missing`);
    if (schema.additionalProperties === false) {
      for (const field of Object.keys(value)) assert.ok(Object.hasOwn(schema.properties ?? {}, field), `${path}.${field} is not declared`);
    }
    for (const [field, fieldSchema] of Object.entries(schema.properties ?? {})) {
      if (Object.hasOwn(value, field)) validateValue(fieldSchema, root, value[field], `${path}.${field}`);
    }
    return;
  }

  if (schema.type === 'array') {
    assert.equal(Array.isArray(value), true, `${path} array expected`);
    if (schema.minItems !== undefined) assert.ok(value.length >= schema.minItems, `${path} minItems mismatch`);
    if (schema.uniqueItems === true) assert.equal(new Set(value.map((item) => JSON.stringify(item))).size, value.length, `${path} uniqueItems mismatch`);
    for (let index = 0; index < value.length; index += 1) validateValue(schema.items, root, value[index], `${path}[${index}]`);
    return;
  }

  if (schema.type === 'integer') {
    assert.equal(Number.isInteger(value), true, `${path} integer expected`);
    if (schema.minimum !== undefined) assert.ok(value >= schema.minimum, `${path} minimum mismatch`);
    return;
  }

  if (schema.type === 'boolean') {
    assert.equal(typeof value, 'boolean', `${path} boolean expected`);
    return;
  }

  if (schema.type === 'string') {
    assert.equal(typeof value, 'string', `${path} string expected`);
    if (schema.pattern) assert.match(value, new RegExp(schema.pattern), `${path} pattern mismatch`);
    if (schema.format === 'date-time') assert.match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/, `${path} date-time mismatch`);
  }
}

function collectRefs(schema, refs = []) {
  if (schema === null || typeof schema !== 'object') return refs;
  if (schema.$ref) refs.push(schema.$ref);
  for (const value of Object.values(schema)) collectRefs(value, refs);
  return refs;
}

function collectPropertyNames(schema, root, out = new Set(), seen = new WeakSet()) {
  if (schema.$ref) return collectPropertyNames(resolveRef(root, schema.$ref), root, out, seen);
  if (schema === null || typeof schema !== 'object' || seen.has(schema)) return out;
  seen.add(schema);
  for (const field of Object.keys(schema.properties ?? {})) out.add(field);
  for (const child of Object.values(schema.properties ?? {})) collectPropertyNames(child, root, out, seen);
  if (schema.items) collectPropertyNames(schema.items, root, out, seen);
  for (const child of Object.values(schema.$defs ?? {})) collectPropertyNames(child, root, out, seen);
  return out;
}

function assertThrowsWithoutLeaking(fn, pattern, leakPattern) {
  let message = null;
  try {
    fn();
  } catch (error) {
    message = error.message;
  }
  assert.notEqual(message, null, 'expected function to throw');
  assert.match(message, pattern);
  assert.equal(leakPattern.test(message), false);
}

test('public launch evidence ledger accepts an allowed public-safe entry', async () => {
  const schema = await readLedgerSchema();
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.$id, 'https://schemas.enigma.ai/public-launch-evidence-ledger-v1.schema.json');
  assert.equal(schema.title, 'Enigma Public Launch Evidence Ledger v1');
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(collectRefs(schema).filter((ref) => !ref.startsWith('#/$defs/')), []);
  assert.equal(typeof sha256Hex, 'function');

  const ledger = createPublicLaunchEvidenceLedger(allowedLedgerArgs());
  validateValue(schema, schema, ledger, LEDGER_SCHEMA_FILE);
  assert.deepEqual(ledger, createPublicLaunchEvidenceLedger(allowedLedgerArgs()));

  const withSecondEntry = addPublicLaunchEvidenceEntry(ledger, allowedEntry({ scenario_id: 'dashboard_health_rollup', evidence_refs: ['ref:evidence.dashboard_health_rollup'] }));
  assert.equal(ledger.entries.length, 1);
  assert.equal(withSecondEntry.entries.length, 2);
});

test('public launch evidence summary counts statuses, reviews, issues, and Advisor decisions', () => {
  const summary = summarizePublicLaunchEvidence([
    allowedEntry({ issue_codes: ['ev_p0_passed'] }),
    allowedEntry({
      scenario_id: 'claude_mcpb_pairing',
      status: 'pending',
      advisor_decision: 'not_reviewed',
      evidence_refs: [],
      privacy_review: { status: 'pending', reviewer_ref: 'ref:privacy.launch_reviewer', evidence_ref_count: 0, issue_codes: ['privacy_pending'] },
      claim_review: { status: 'pass', reviewer_ref: 'ref:claims.launch_reviewer', evidence_ref_count: 1, issue_codes: [] },
      rollback_ready: false,
      issue_codes: ['mcpb_pending'],
    }),
  ]);

  assert.equal(summary.total_entries, 2);
  assert.deepEqual(summary.status_counts, { missing: 0, pending: 1, pass: 1, fail: 0, blocked: 0 });
  assert.deepEqual(summary.advisor_decision_counts, { ship: 1, hold: 0, rollback: 0, not_reviewed: 1 });
  assert.deepEqual(summary.privacy_review_counts, { missing: 0, pending: 1, pass: 1, fail: 0, blocked: 0 });
  assert.deepEqual(summary.claim_review_counts, { missing: 0, pending: 0, pass: 2, fail: 0, blocked: 0 });
  assert.equal(summary.rollback_ready_count, 1);
  assert.deepEqual(summary.issue_code_counts, [
    { issue_code: 'ev_p0_passed', count: 1 },
    { issue_code: 'mcpb_pending', count: 1 },
    { issue_code: 'privacy_pending', count: 1 },
  ]);
  assert.equal(summary.advisor_decision, 'not_reviewed');
});

test('public launch evidence ledger fails closed on raw or private fields', async () => {
  const schema = await readLedgerSchema();
  const ledger = createPublicLaunchEvidenceLedger(allowedLedgerArgs());

  assert.throws(() => validateValue(schema, schema, { ...ledger, raw_memory: 'private launch-code phrase' }, LEDGER_SCHEMA_FILE), /raw_memory is not declared/);
  for (const field of collectPropertyNames(schema, schema)) assert.equal(FORBIDDEN_PUBLIC_FIELDS.has(field), false, `${field} must not be declared`);

  assertThrowsWithoutLeaking(
    () => createPublicLaunchEvidenceLedger(allowedLedgerArgs({ entries: [allowedEntry({ raw_evidence: 'private launch-code phrase' })] })),
    /unknown entries\[0\] field: raw_evidence/,
    /private launch-code phrase/
  );
  assertThrowsWithoutLeaking(
    () => createPublicLaunchEvidenceLedger(allowedLedgerArgs({ entries: [allowedEntry({ private_key: 'not public' })] })),
    /unknown entries\[0\] field: private_key/,
    /not public/
  );
  assertThrowsWithoutLeaking(
    () => createPublicLaunchEvidenceLedger(allowedLedgerArgs({ entries: [allowedEntry({ evidence_refs: ['C:\\Users\\Alice\\evidence.json'] })] })),
    /evidence_refs\[0\] must be a public ref/,
    /Alice/
  );
});

test('public launch Advisor holds on required fail blocked or missing evidence', () => {
  for (const status of ['fail', 'blocked', 'missing']) {
    const summary = summarizePublicLaunchEvidence([
      allowedEntry({
        status,
        advisor_decision: 'ship',
        evidence_refs: status === 'missing' ? [] : ['ref:evidence.required_gate'],
        issue_codes: [`${status}_gate`],
      }),
    ]);
    assert.equal(summary.advisor_decision, 'hold', `${status} evidence must hold the launch`);
  }
});
