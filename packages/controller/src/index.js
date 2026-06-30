import { canonicalize, sha256Hex, MerkleSet, verifyPublicSafeArtifact } from '../../core/src/index.js';

export const CONSENT_GRANT_SCHEMA = 'enigma.memory_controller_grant.v1';
export const MEMORY_CONTROLLER_GRANT_SCHEMA = CONSENT_GRANT_SCHEMA;
export const RECALL_VETO_DECISION_SCHEMA = 'enigma.recall_veto_decision.v1';
export const PRIVATE_MEMORY_BUBBLE_SCHEMA = 'enigma.private_memory_bubble.v1';
export const MEMORY_WEATHER_REPORT_SCHEMA = 'enigma.memory_weather_report.v1';

const DEFAULT_NOW = '1970-01-01T00:00:00.000Z';
const DEFAULT_GRANT_TTL_SECONDS = 300;
const ID_HASH_LENGTH = 32;
const PUBLIC_REF_RE = /^ref:[A-Za-z0-9][A-Za-z0-9._~:@#?=&%+-]{0,255}$/u;
const SHA256_REF_RE = /^sha256:[a-f0-9]{64}$/u;
const GRANT_OPERATIONS = new Set([
  'read_local',
  'write_local',
  'recall_context',
  'withhold_context',
  'share_context',
  'open_private_bubble',
  'close_private_bubble',
  'delete_local',
  'connector_access'
]);
const GRANT_STATUSES = new Set(['active', 'expired', 'revoked']);
const RECALL_DECISIONS = new Set(['allow', 'ask', 'deny']);
const RECALL_REASON_CODES = new Set([
  'grant_missing',
  'grant_expired',
  'purpose_mismatch',
  'zone_not_allowed',
  'sensitivity_blocked',
  'tombstone_present',
  'private_bubble_open',
  'policy_requires_ask',
  'policy_denies_recall',
  'candidate_limit_exceeded'
]);
const BUBBLE_CLOSE_OUTCOMES = new Set(['keep', 'discard']);
const BUBBLE_STATUSES = new Set(['open', 'kept', 'discarded', 'expired']);
const WEATHER_STATUSES = new Set(['sunny', 'needs_attention', 'storm_warning']);
const WEATHER_METRICS = new Set([
  'active_grants',
  'expiring_grants',
  'recent_vetoes',
  'open_private_bubbles',
  'tombstone_pressure',
  'sensitive_candidates',
  'receipt_coverage'
]);
const WEATHER_ISSUE_CODES = new Set([
  'grant_expiring',
  'grant_missing',
  'policy_attention_needed',
  'veto_rate_elevated',
  'private_bubble_open',
  'receipt_gap',
  'tombstone_pressure',
  'sensitive_candidate_pressure'
]);
const WEATHER_NEXT_ACTIONS = new Set(['none', 'review_grants', 'review_policy', 'ask_for_consent', 'close_private_bubbles', 'inspect_receipts']);
const STORM_TILE_STATUSES = new Set(['storm_warning', 'blocked', 'fail', 'revoked', 'expired', 'unsafe_export', 'unsafe', 'tombstone', 'sensitive']);
const ATTENTION_TILE_STATUSES = new Set(['needs_attention', 'warning', 'needs_review', 'offline', 'pending', 'missing', 'ask']);
const EXTRA_FORBIDDEN_KEY_RE = /(?:^|_)(?:account|account_id|customer|customer_id|customer_identifier|provider_response|signing_secret|private_data|memory_payload|local_absolute_path)$/u;

const BOUNDARY_FIELDS = Object.freeze({
  public_payload_only: true,
  memory_payload_absent: true,
  prompt_payload_absent: true,
  transcript_payload_absent: true,
  embedding_payload_absent: true,
  provider_output_absent: true,
  secret_material_absent: true,
  device_path_absent: true,
  account_identifier_absent: true,
  customer_identifier_absent: true,
  evidence_refs_only: true,
  provider_deletion_claim: false,
  model_forgetting_claim: false,
  provider_native_memory_control_claim: false,
  compliance_certification_claim: false
});

const BOUNDARY_JSON_PROPERTIES = Object.freeze(Object.fromEntries(
  Object.entries(BOUNDARY_FIELDS).map(([field, value]) => [field, { const: value }])
));
const PUBLIC_REF_JSON_SCHEMA = Object.freeze({ type: 'string', pattern: PUBLIC_REF_RE.source });
const SHA256_DIGEST_JSON_SCHEMA = Object.freeze({ type: 'string', pattern: SHA256_REF_RE.source });

const CONSENT_GRANT_FIELDS = Object.freeze([
  'schema',
  'app_ref',
  'purpose_ref',
  'operations',
  'memory_zone_refs',
  'issued_at',
  'expires_at',
  'status',
  'grant_ref',
  'policy_ref',
  'proof_refs',
  'receipt_refs',
  ...Object.keys(BOUNDARY_FIELDS)
]);
const CONSENT_GRANT_FIELD_SET = new Set(CONSENT_GRANT_FIELDS);

export const CONSENT_GRANT_JSON_SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://schemas.enigma.ai/memory-controller-grant-v1.schema.json',
  title: 'Enigma Memory Controller Grant v1',
  type: 'object',
  required: [...CONSENT_GRANT_FIELDS],
  additionalProperties: false,
  properties: {
    schema: { const: CONSENT_GRANT_SCHEMA },
    app_ref: { $ref: '#/$defs/publicRef' },
    purpose_ref: { $ref: '#/$defs/publicRef' },
    operations: { type: 'array', minItems: 1, items: { $ref: '#/$defs/grantOperation' }, uniqueItems: true },
    memory_zone_refs: { type: 'array', minItems: 1, items: { $ref: '#/$defs/publicRef' }, uniqueItems: true },
    issued_at: { type: 'string', format: 'date-time' },
    expires_at: { type: 'string', format: 'date-time' },
    status: { type: 'string', enum: [...GRANT_STATUSES] },
    grant_ref: { $ref: '#/$defs/publicRef' },
    policy_ref: { $ref: '#/$defs/publicRef' },
    proof_refs: { type: 'array', minItems: 1, items: { $ref: '#/$defs/publicRef' }, uniqueItems: true },
    receipt_refs: { type: 'array', minItems: 1, items: { $ref: '#/$defs/publicRef' }, uniqueItems: true },
    ...BOUNDARY_JSON_PROPERTIES
  },
  $defs: {
    publicRef: PUBLIC_REF_JSON_SCHEMA,
    grantOperation: { type: 'string', enum: [...GRANT_OPERATIONS] }
  }
});

export const RECALL_VETO_DECISION_JSON_SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://schemas.enigma.ai/recall-veto-decision-v1.schema.json',
  title: 'Enigma Recall Veto Decision v1',
  type: 'object',
  required: ['schema', 'request_ref', 'app_ref', 'policy_ref', 'decision', 'reason_codes', 'candidate_count', 'sensitive_count', 'tombstone_count', 'grant_refs', 'proof_refs', 'receipt_refs', 'safe_to_share', ...Object.keys(BOUNDARY_FIELDS)],
  allOf: [
    {
      if: { properties: { decision: { const: 'allow' } }, required: ['decision'] },
      then: { properties: { safe_to_share: { const: true } } }
    },
    {
      if: { properties: { decision: { enum: ['ask', 'deny'] } }, required: ['decision'] },
      then: { properties: { reason_codes: { minItems: 1 }, safe_to_share: { const: false } } }
    }
  ],
  additionalProperties: false,
  properties: {
    schema: { const: RECALL_VETO_DECISION_SCHEMA },
    request_ref: { $ref: '#/$defs/publicRef' },
    app_ref: { $ref: '#/$defs/publicRef' },
    policy_ref: { $ref: '#/$defs/publicRef' },
    decision: { type: 'string', enum: [...RECALL_DECISIONS] },
    reason_codes: { type: 'array', items: { $ref: '#/$defs/reasonCode' }, uniqueItems: true },
    candidate_count: { type: 'integer', minimum: 0 },
    sensitive_count: { type: 'integer', minimum: 0 },
    tombstone_count: { type: 'integer', minimum: 0 },
    grant_refs: { type: 'array', items: { $ref: '#/$defs/publicRef' }, uniqueItems: true },
    proof_refs: { type: 'array', minItems: 1, items: { $ref: '#/$defs/publicRef' }, uniqueItems: true },
    receipt_refs: { type: 'array', minItems: 1, items: { $ref: '#/$defs/publicRef' }, uniqueItems: true },
    safe_to_share: { type: 'boolean' },
    ...BOUNDARY_JSON_PROPERTIES
  },
  $defs: {
    publicRef: PUBLIC_REF_JSON_SCHEMA,
    reasonCode: { type: 'string', enum: [...RECALL_REASON_CODES] }
  }
});

export const PRIVATE_MEMORY_BUBBLE_JSON_SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://schemas.enigma.ai/scoped-memory-bubble-v1.schema.json',
  title: 'Enigma Scoped Memory Bubble v1',
  type: 'object',
  required: ['schema', 'bubble_ref', 'app_refs', 'purpose_ref', 'status', 'started_at', 'closed_at', 'candidate_count', 'kept_count', 'discarded_count', 'receipt_refs', 'bubble_root', ...Object.keys(BOUNDARY_FIELDS)],
  additionalProperties: false,
  properties: {
    schema: { const: PRIVATE_MEMORY_BUBBLE_SCHEMA },
    bubble_ref: { $ref: '#/$defs/publicRef' },
    app_refs: { type: 'array', minItems: 1, items: { $ref: '#/$defs/publicRef' }, uniqueItems: true },
    purpose_ref: { $ref: '#/$defs/publicRef' },
    status: { type: 'string', enum: [...BUBBLE_STATUSES] },
    started_at: { type: 'string', format: 'date-time' },
    closed_at: { type: ['string', 'null'], format: 'date-time' },
    candidate_count: { type: 'integer', minimum: 0 },
    kept_count: { type: 'integer', minimum: 0 },
    discarded_count: { type: 'integer', minimum: 0 },
    receipt_refs: { type: 'array', minItems: 1, items: { $ref: '#/$defs/publicRef' }, uniqueItems: true },
    bubble_root: { $ref: '#/$defs/sha256Digest' },
    ...BOUNDARY_JSON_PROPERTIES
  },
  $defs: {
    sha256Digest: SHA256_DIGEST_JSON_SCHEMA,
    publicRef: PUBLIC_REF_JSON_SCHEMA
  }
});

export const MEMORY_WEATHER_REPORT_JSON_SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://schemas.enigma.ai/memory-weather-report-v1.schema.json',
  title: 'Enigma Memory Weather Report v1',
  type: 'object',
  required: ['schema', 'status', 'generated_at', 'tiles', 'issue_codes', 'next_action', 'evidence_refs', ...Object.keys(BOUNDARY_FIELDS)],
  allOf: [
    {
      if: { properties: { status: { const: 'sunny' } }, required: ['status'] },
      then: { properties: { issue_codes: { maxItems: 0 }, next_action: { const: 'none' } } }
    },
    {
      if: { properties: { status: { enum: ['needs_attention', 'storm_warning'] } }, required: ['status'] },
      then: { properties: { issue_codes: { minItems: 1 } } }
    }
  ],
  additionalProperties: false,
  properties: {
    schema: { const: MEMORY_WEATHER_REPORT_SCHEMA },
    status: { type: 'string', enum: [...WEATHER_STATUSES] },
    generated_at: { type: 'string', format: 'date-time' },
    tiles: { type: 'array', minItems: 1, items: { $ref: '#/$defs/weatherTile' }, uniqueItems: true },
    issue_codes: { type: 'array', items: { $ref: '#/$defs/issueCode' }, uniqueItems: true },
    next_action: { $ref: '#/$defs/nextAction' },
    evidence_refs: { type: 'array', minItems: 1, items: { $ref: '#/$defs/publicRef' }, uniqueItems: true },
    ...BOUNDARY_JSON_PROPERTIES
  },
  $defs: {
    publicRef: PUBLIC_REF_JSON_SCHEMA,
    weatherTile: {
      type: 'object',
      required: ['tile_ref', 'status', 'metric', 'count', 'evidence_refs'],
      additionalProperties: false,
      properties: {
        tile_ref: { $ref: '#/$defs/publicRef' },
        status: { type: 'string', enum: [...WEATHER_STATUSES] },
        metric: { $ref: '#/$defs/tileMetric' },
        count: { type: 'integer', minimum: 0 },
        evidence_refs: { type: 'array', minItems: 1, items: { $ref: '#/$defs/publicRef' }, uniqueItems: true }
      }
    },
    tileMetric: { type: 'string', enum: [...WEATHER_METRICS] },
    issueCode: { type: 'string', enum: [...WEATHER_ISSUE_CODES] },
    nextAction: { type: 'string', enum: [...WEATHER_NEXT_ACTIONS] }
  }
});

export function createConsentGrant(options = {}) {
  assertPlainRecord(options, 'options');
  const issuedAt = normalizeDateTime(options.issued_at ?? options.issuedAt ?? options.now ?? DEFAULT_NOW, 'issued_at');
  const expiresAt = normalizeDateTime(options.expires_at ?? options.expiresAt ?? addSeconds(issuedAt, normalizeTtl(options.ttl_seconds ?? options.ttlSeconds ?? DEFAULT_GRANT_TTL_SECONDS, 'ttl_seconds')), 'expires_at');
  const body = {
    schema: CONSENT_GRANT_SCHEMA,
    app_ref: normalizePublicRef(options.app_ref ?? options.appRef ?? 'ref:app:unspecified', 'app_ref'),
    purpose_ref: normalizePublicRef(options.purpose_ref ?? options.purposeRef ?? 'ref:purpose:unspecified', 'purpose_ref'),
    operations: normalizeOperations(options.operations ?? (options.operation === undefined ? ['recall_context'] : [options.operation])),
    memory_zone_refs: normalizePublicRefArray(options.memory_zone_refs ?? options.memoryZoneRefs ?? (options.memory_zone_ref === undefined ? ['ref:zone:default'] : [options.memory_zone_ref]), 'memory_zone_refs'),
    issued_at: issuedAt,
    expires_at: expiresAt,
    status: normalizeGrantStatus(options.status ?? 'active'),
    grant_ref: '',
    policy_ref: normalizePublicRef(options.policy_ref ?? options.policyRef ?? 'ref:policy:default', 'policy_ref'),
    proof_refs: [],
    receipt_refs: [],
    ...BOUNDARY_FIELDS
  };
  body.grant_ref = normalizePublicRef(options.grant_ref ?? options.grantRef ?? makePublicRef('grant', body, ['grant_ref', 'proof_refs', 'receipt_refs']), 'grant_ref');
  body.proof_refs = normalizeNonEmptyPublicRefArray(options.proof_refs ?? options.proofRefs ?? [makePublicRef('proof', body, ['proof_refs', 'receipt_refs'])], 'proof_refs');
  body.receipt_refs = normalizeNonEmptyPublicRefArray(options.receipt_refs ?? options.receiptRefs ?? [makePublicRef('receipt', body, ['receipt_refs'])], 'receipt_refs');
  return assertMemoryControllerPublicSafe(body);
}

export function verifyConsentGrant(grant, options = {}) {
  const errors = [];
  const reasonCodes = [];
  const warnings = [];
  let publicHash = null;

  if (!isPlainRecord(grant)) {
    return verification(false, ['GRANT_NOT_OBJECT'], ['GRANT_NOT_OBJECT'], warnings, null);
  }

  const publicSafe = scanMemoryControllerPublicSafe(grant);
  if (!publicSafe.ok) {
    errors.push('NON_PUBLIC_SAFE_ARTIFACT');
    reasonCodes.push('NON_PUBLIC_SAFE_ARTIFACT');
  } else {
    publicHash = publicSafe.public_hash;
  }

  for (const key of Object.keys(grant)) {
    if (!CONSENT_GRANT_FIELD_SET.has(key)) {
      errors.push(`UNKNOWN_FIELD:${key}`);
      reasonCodes.push('BAD_SHAPE');
    }
  }

  if (grant.schema !== CONSENT_GRANT_SCHEMA) push(errors, reasonCodes, 'BAD_SCHEMA');
  if (!isPublicRef(grant.app_ref)) push(errors, reasonCodes, 'BAD_APP_REF');
  if (!isPublicRef(grant.purpose_ref)) push(errors, reasonCodes, 'BAD_PURPOSE_REF');
  if (!isOperationArray(grant.operations)) push(errors, reasonCodes, 'BAD_OPERATIONS');
  if (!isPublicRefArray(grant.memory_zone_refs, true)) push(errors, reasonCodes, 'BAD_MEMORY_ZONE_REFS');
  if (!isDateTime(grant.issued_at)) push(errors, reasonCodes, 'BAD_ISSUED_AT');
  if (!isDateTime(grant.expires_at)) push(errors, reasonCodes, 'BAD_EXPIRES_AT');
  if (!GRANT_STATUSES.has(grant.status)) push(errors, reasonCodes, 'BAD_STATUS');
  if (!isPublicRef(grant.grant_ref)) push(errors, reasonCodes, 'BAD_GRANT_REF');
  if (!isPublicRef(grant.policy_ref)) push(errors, reasonCodes, 'BAD_POLICY_REF');
  if (!isPublicRefArray(grant.proof_refs, true)) push(errors, reasonCodes, 'BAD_PROOF_REFS');
  if (!isPublicRefArray(grant.receipt_refs, true)) push(errors, reasonCodes, 'BAD_RECEIPT_REFS');
  for (const [field, value] of Object.entries(BOUNDARY_FIELDS)) {
    if (grant[field] !== value) push(errors, reasonCodes, `BAD_${field.toUpperCase()}`);
  }

  const now = normalizeDateTime(options.now ?? DEFAULT_NOW, 'now');
  if (grant.status === 'expired' || (isDateTime(grant.expires_at) && Date.parse(grant.expires_at) <= Date.parse(now))) push(errors, reasonCodes, 'EXPIRED');
  if (grant.status === 'revoked' || options.revoked === true) push(errors, reasonCodes, 'REVOKED');
  if (containsRef(options.revoked_grant_refs ?? options.revokedGrantRefs, grant.grant_ref)) push(errors, reasonCodes, 'REVOKED');

  compareScope(errors, reasonCodes, grant, options);

  return verification(errors.length === 0, errors, reasonCodes, warnings, publicHash);
}

export function createRecallVetoDecision(options = {}) {
  assertPlainRecord(options, 'options');
  const appRef = normalizePublicRef(options.app_ref ?? options.appRef ?? 'ref:app:unspecified', 'app_ref');
  const operation = normalizeOperation(options.operation ?? options.operations?.[0] ?? 'recall_context');
  const memoryZoneRef = normalizePublicRef(options.memory_zone_ref ?? options.memoryZoneRef ?? options.memory_zone_refs?.[0] ?? 'ref:zone:default', 'memory_zone_ref');
  const purposeRef = normalizePublicRef(options.purpose_ref ?? options.purposeRef ?? 'ref:purpose:unspecified', 'purpose_ref');
  const policyRef = normalizePublicRef(options.policy_ref ?? options.policyRef ?? 'ref:policy:default', 'policy_ref');
  const counts = normalizeRecallCounts(options);
  const grant = selectGrant(options.grant ?? null, options.grants ?? [], { app_ref: appRef, operation, memory_zone_ref: memoryZoneRef, purpose_ref: purposeRef, now: options.now ?? DEFAULT_NOW, revoked_grant_refs: options.revoked_grant_refs ?? options.revokedGrantRefs });
  const reasonCodes = [];
  let decision = 'ask';
  let grantRefs = [];

  if (counts.tombstone_count > 0) reasonCodes.push('tombstone_present');
  if (counts.sensitive_count > 0) reasonCodes.push('sensitivity_blocked');
  if (!counts.safe) reasonCodes.push('candidate_limit_exceeded');

  if (reasonCodes.length > 0) {
    decision = 'deny';
  } else if (grant.verification?.ok === true) {
    decision = 'allow';
    grantRefs = [grant.value.grant_ref];
  } else if (grant.verification?.reason_codes?.includes('REVOKED')) {
    decision = 'deny';
    if (isPublicRef(grant.value?.grant_ref)) grantRefs = [grant.value.grant_ref];
    reasonCodes.push('policy_denies_recall');
  } else if (grant.verification?.reason_codes?.includes('EXPIRED')) {
    decision = 'deny';
    if (isPublicRef(grant.value?.grant_ref)) grantRefs = [grant.value.grant_ref];
    reasonCodes.push('grant_expired');
  } else if (grant.verification?.reason_codes?.some((code) => code === 'WRONG_PURPOSE' || code === 'WRONG_OPERATION' || code === 'WRONG_MEMORY_ZONE')) {
    decision = 'ask';
    reasonCodes.push('grant_missing');
  } else {
    decision = 'ask';
    reasonCodes.push('grant_missing');
  }

  const body = {
    schema: RECALL_VETO_DECISION_SCHEMA,
    request_ref: normalizePublicRef(options.request_ref ?? options.requestRef ?? makePublicRef('request', { appRef, operation, memoryZoneRef, purposeRef, counts }), 'request_ref'),
    app_ref: appRef,
    policy_ref: policyRef,
    decision,
    reason_codes: uniqueSorted(normalizeReasonCodes(options.reason_codes ?? options.reasonCodes ?? reasonCodes)),
    candidate_count: counts.candidate_count,
    sensitive_count: counts.sensitive_count,
    tombstone_count: counts.tombstone_count,
    grant_refs: normalizePublicRefArray(options.grant_refs ?? options.grantRefs ?? grantRefs, 'grant_refs'),
    proof_refs: [],
    receipt_refs: [],
    safe_to_share: decision === 'allow',
    ...BOUNDARY_FIELDS
  };
  body.proof_refs = normalizeNonEmptyPublicRefArray(options.proof_refs ?? options.proofRefs ?? [makePublicRef('proof', body, ['proof_refs', 'receipt_refs'])], 'proof_refs');
  body.receipt_refs = normalizeNonEmptyPublicRefArray(options.receipt_refs ?? options.receiptRefs ?? [makePublicRef('receipt', body, ['receipt_refs'])], 'receipt_refs');
  return assertMemoryControllerPublicSafe(body);
}

export function createPrivateMemoryBubble(options = {}) {
  assertPlainRecord(options, 'options');
  const startedAt = normalizeDateTime(options.started_at ?? options.startedAt ?? options.now ?? DEFAULT_NOW, 'started_at');
  const body = {
    schema: PRIVATE_MEMORY_BUBBLE_SCHEMA,
    bubble_ref: '',
    app_refs: normalizeNonEmptyPublicRefArray(options.app_refs ?? options.appRefs ?? (options.app_ref === undefined ? ['ref:app:unspecified'] : [options.app_ref]), 'app_refs'),
    purpose_ref: normalizePublicRef(options.purpose_ref ?? options.purposeRef ?? 'ref:purpose:unspecified', 'purpose_ref'),
    status: 'open',
    started_at: startedAt,
    closed_at: null,
    candidate_count: normalizeCount(options.candidate_count ?? options.candidateCount ?? 0, 'candidate_count'),
    kept_count: 0,
    discarded_count: 0,
    receipt_refs: [],
    bubble_root: '',
    ...BOUNDARY_FIELDS
  };
  body.bubble_ref = normalizePublicRef(options.bubble_ref ?? options.bubbleRef ?? makePublicRef('bubble', body, ['bubble_ref', 'receipt_refs', 'bubble_root']), 'bubble_ref');
  body.receipt_refs = normalizeNonEmptyPublicRefArray(options.receipt_refs ?? options.receiptRefs ?? [makePublicRef('receipt', body, ['receipt_refs', 'bubble_root'])], 'receipt_refs');
  body.bubble_root = merkleRootFor('private_memory_bubble', body, ['bubble_root']);
  return assertMemoryControllerPublicSafe(body);
}

export function closePrivateMemoryBubble(bubble, options = {}) {
  assertPlainRecord(bubble, 'bubble');
  assertPlainRecord(options, 'options');
  assertMemoryControllerPublicSafe(bubble);
  if (bubble.schema !== PRIVATE_MEMORY_BUBBLE_SCHEMA) throw new TypeError('bubble schema mismatch');
  if (bubble.status !== 'open') throw new TypeError('bubble must be open');
  const closedAt = normalizeDateTime(options.closed_at ?? options.closedAt ?? options.now ?? DEFAULT_NOW, 'closed_at');
  const outcome = String(options.outcome ?? options.close_outcome ?? options.closeOutcome ?? 'discard');
  if (!BUBBLE_CLOSE_OUTCOMES.has(outcome)) throw new TypeError('bubble outcome must be keep or discard');
  const keptCount = outcome === 'keep'
    ? normalizeCount(options.kept_count ?? options.keptCount ?? bubble.candidate_count, 'kept_count')
    : 0;
  if (keptCount > bubble.candidate_count) throw new TypeError('kept_count cannot exceed candidate_count');
  const discardedCount = outcome === 'discard'
    ? normalizeCount(options.discarded_count ?? options.discardedCount ?? bubble.candidate_count, 'discarded_count')
    : Math.max(0, bubble.candidate_count - keptCount);
  if (discardedCount > bubble.candidate_count) throw new TypeError('discarded_count cannot exceed candidate_count');
  const closed = {
    ...bubble,
    status: outcome === 'keep' ? 'kept' : 'discarded',
    closed_at: closedAt,
    kept_count: keptCount,
    discarded_count: discardedCount,
    receipt_refs: normalizeNonEmptyPublicRefArray(options.receipt_refs ?? options.receiptRefs ?? bubble.receipt_refs, 'receipt_refs'),
    bubble_root: ''
  };
  closed.bubble_root = merkleRootFor('private_memory_bubble', closed, ['bubble_root']);
  return assertMemoryControllerPublicSafe(closed);
}

export function createMemoryWeatherReport(options = {}) {
  assertPlainRecord(options, 'options');
  const generatedAt = normalizeDateTime(options.generated_at ?? options.generatedAt ?? options.now ?? DEFAULT_NOW, 'generated_at');
  const tiles = normalizeWeatherTiles(options.tiles ?? [{ tile_ref: 'ref:tile:active_grants', status: 'sunny', metric: 'active_grants', count: 0, evidence_refs: ['ref:evidence:weather'] }]);
  const status = normalizeWeatherStatus(options.status ?? rollupWeatherStatus(tiles));
  const inferredIssueCodes = status === 'sunny' ? [] : issueCodesForTiles(tiles);
  const issueCodes = normalizeIssueCodes(options.issue_codes ?? options.issueCodes ?? inferredIssueCodes);
  const nextAction = normalizeNextAction(options.next_action ?? options.nextAction ?? firstNextAction(tiles, status, issueCodes));
  const body = {
    schema: MEMORY_WEATHER_REPORT_SCHEMA,
    status,
    generated_at: generatedAt,
    tiles,
    issue_codes: status === 'sunny' ? [] : issueCodes.length === 0 ? ['policy_attention_needed'] : issueCodes,
    next_action: status === 'sunny' ? 'none' : nextAction,
    evidence_refs: normalizeNonEmptyPublicRefArray(options.evidence_refs ?? options.evidenceRefs ?? evidenceRefsForTiles(tiles), 'evidence_refs'),
    ...BOUNDARY_FIELDS
  };
  return assertMemoryControllerPublicSafe(body);
}

export function assertMemoryControllerPublicSafe(value) {
  const result = scanMemoryControllerPublicSafe(value);
  if (!result.ok) throw new TypeError(`memory controller public-safe scan failed: ${result.errors.join('; ')}`);
  return value;
}

function scanMemoryControllerPublicSafe(value) {
  const core = verifyPublicSafeArtifact(value);
  const extra = [];
  scanExtraForbiddenKeys(value, '$', extra, new WeakSet());
  return {
    ok: core.ok && extra.length === 0,
    errors: [...(core.errors ?? []), ...extra.map((path) => `${path}: field name is not memory-controller public-safe`)],
    forbidden_paths: [...(core.forbidden_paths ?? []), ...extra],
    public_hash: core.ok && extra.length === 0 ? core.public_hash : null
  };
}

function assertPlainRecord(value, name) {
  if (!isPlainRecord(value)) throw new TypeError(`${name} must be an object`);
}

function isPlainRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function normalizeRequiredString(value, field) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${field} must be a non-empty string`);
  return value;
}

function normalizePublicRef(value, field) {
  const ref = normalizeRequiredString(value, field);
  if (!PUBLIC_REF_RE.test(ref)) throw new TypeError(`${field} must be a public ref`);
  return ref;
}

function normalizeOperation(value) {
  const operation = normalizeRequiredString(value, 'operation');
  if (!GRANT_OPERATIONS.has(operation)) throw new TypeError('operation is not supported');
  return operation;
}

function normalizeOperations(value) {
  if (!Array.isArray(value)) throw new TypeError('operations must be an array');
  const operations = uniqueSorted(value.map((item) => normalizeOperation(item)));
  if (operations.length === 0) throw new TypeError('operations must not be empty');
  return operations;
}

function normalizePublicRefArray(value, field) {
  if (!Array.isArray(value)) throw new TypeError(`${field} must be an array`);
  return uniqueSorted(value.map((item, index) => normalizePublicRef(item, `${field}[${index}]`)));
}

function normalizeNonEmptyPublicRefArray(value, field) {
  const refs = normalizePublicRefArray(value, field);
  if (refs.length === 0) throw new TypeError(`${field} must not be empty`);
  return refs;
}

function normalizeCount(value, field) {
  if (!Number.isInteger(value) || value < 0) throw new TypeError(`${field} must be a non-negative integer`);
  return value;
}

function normalizeTtl(value, field) {
  if (!Number.isInteger(value) || value <= 0) throw new TypeError(`${field} must be a positive integer`);
  return value;
}

function normalizeDateTime(value, field) {
  if (typeof value !== 'string' || !isDateTime(value)) throw new TypeError(`${field} must be an ISO date-time string`);
  return new Date(value).toISOString();
}

function isDateTime(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value) && !Number.isNaN(Date.parse(value));
}

function addSeconds(dateTime, seconds) {
  return new Date(Date.parse(dateTime) + seconds * 1000).toISOString();
}

function containsRef(values, ref) {
  if (values === undefined || values === null || ref === undefined) return false;
  if (values instanceof Set) return values.has(ref);
  return Array.isArray(values) && values.includes(ref);
}

function push(errors, reasonCodes, code) {
  errors.push(code);
  reasonCodes.push(code);
}

function compareScope(errors, reasonCodes, grant, options) {
  const expectedOperations = [...(Array.isArray(options.operations) ? options.operations : []), ...(options.operation === undefined ? [] : [options.operation])];
  const expectedMemoryZoneRefs = [...(Array.isArray(options.memory_zone_refs) ? options.memory_zone_refs : Array.isArray(options.memoryZoneRefs) ? options.memoryZoneRefs : []), ...(options.memory_zone_ref === undefined && options.memoryZoneRef === undefined ? [] : [options.memory_zone_ref ?? options.memoryZoneRef])];
  const expected = [
    ['app_ref', options.app_ref ?? options.appRef, 'WRONG_APP'],
    ['purpose_ref', options.purpose_ref ?? options.purposeRef, 'WRONG_PURPOSE']
  ];
  for (const [field, value, code] of expected) {
    if (value !== undefined && grant[field] !== value) push(errors, reasonCodes, code);
  }
  if (expectedOperations.some((operation) => !Array.isArray(grant.operations) || !grant.operations.includes(operation))) push(errors, reasonCodes, 'WRONG_OPERATION');
  if (expectedMemoryZoneRefs.some((memoryZoneRef) => !Array.isArray(grant.memory_zone_refs) || !grant.memory_zone_refs.includes(memoryZoneRef))) push(errors, reasonCodes, 'WRONG_MEMORY_ZONE');
}

function verification(ok, errors, reasonCodes, warnings, publicHash) {
  return {
    ok,
    status: ok ? 'active' : 'fail_closed',
    errors: uniqueSorted(errors),
    reason_codes: uniqueSorted(reasonCodes),
    warnings,
    public_hash: publicHash
  };
}

function normalizeRecallCounts(options) {
  const candidateCount = normalizeCount(options.candidate_count ?? options.candidateCount ?? 0, 'candidate_count');
  const tombstoneCount = normalizeCount(options.tombstone_count ?? options.tombstoneCount ?? 0, 'tombstone_count');
  const sensitiveCount = normalizeCount(options.sensitive_count ?? options.sensitiveCount ?? 0, 'sensitive_count');
  const safe = tombstoneCount <= candidateCount && sensitiveCount <= candidateCount;
  return { candidate_count: candidateCount, tombstone_count: tombstoneCount, sensitive_count: sensitiveCount, safe };
}

function selectGrant(primaryGrant, grants, scope) {
  const candidates = [];
  if (primaryGrant !== null && primaryGrant !== undefined) candidates.push(primaryGrant);
  if (Array.isArray(grants)) candidates.push(...grants);
  let firstVerification = null;
  let firstGrant = null;
  for (const grant of candidates) {
    const verificationResult = verifyConsentGrant(grant, scope);
    if (firstVerification === null) {
      firstVerification = verificationResult;
      firstGrant = grant;
    }
    if (verificationResult.ok) return { value: grant, verification: verificationResult };
  }
  return { value: firstGrant, verification: firstVerification };
}

function normalizeGrantStatus(value) {
  const status = normalizeRequiredString(value, 'status');
  if (!GRANT_STATUSES.has(status)) throw new TypeError('status is not supported');
  return status;
}

function normalizeReasonCodes(value) {
  if (!Array.isArray(value)) throw new TypeError('reason_codes must be an array');
  return value.map((item, index) => {
    const code = normalizeRequiredString(item, `reason_codes[${index}]`);
    if (!RECALL_REASON_CODES.has(code)) throw new TypeError(`reason_codes[${index}] is not supported`);
    return code;
  });
}

function normalizeWeatherTiles(value) {
  if (!Array.isArray(value)) throw new TypeError('tiles must be an array');
  if (value.length === 0) throw new TypeError('tiles must not be empty');
  return value.map((tile, index) => {
    assertPlainRecord(tile, `tiles[${index}]`);
    const status = normalizeTileStatus(tile.status ?? 'sunny');
    const metric = normalizeWeatherMetric(tile.metric ?? metricFromTileRef(tile.tile_ref ?? tile.tileRef));
    return {
      tile_ref: normalizePublicRef(tile.tile_ref ?? tile.tileRef ?? `ref:tile:${index}`, `tiles[${index}].tile_ref`),
      status,
      metric,
      count: normalizeCount(tile.count ?? 0, `tiles[${index}].count`),
      evidence_refs: normalizePublicRefArray(tile.evidence_refs ?? tile.evidenceRefs ?? [], `tiles[${index}].evidence_refs`)
    };
  });
}

function normalizeTileStatus(status) {
  const value = String(status);
  if (WEATHER_STATUSES.has(value)) return value;
  if (STORM_TILE_STATUSES.has(value)) return 'storm_warning';
  if (ATTENTION_TILE_STATUSES.has(value)) return 'needs_attention';
  return 'needs_attention';
}

function normalizeWeatherStatus(status) {
  const value = String(status);
  if (!WEATHER_STATUSES.has(value)) throw new TypeError('status is not supported');
  return value;
}

function normalizeWeatherMetric(metric) {
  const value = normalizeRequiredString(metric, 'metric');
  if (!WEATHER_METRICS.has(value)) throw new TypeError('metric is not supported');
  return value;
}

function normalizeIssueCodes(value) {
  if (!Array.isArray(value)) throw new TypeError('issue_codes must be an array');
  return uniqueSorted(value.map((item, index) => {
    const code = normalizeRequiredString(item, `issue_codes[${index}]`);
    if (!WEATHER_ISSUE_CODES.has(code)) throw new TypeError(`issue_codes[${index}] is not supported`);
    return code;
  }));
}

function normalizeNextAction(value) {
  const action = normalizeRequiredString(value, 'next_action');
  if (!WEATHER_NEXT_ACTIONS.has(action)) throw new TypeError('next_action is not supported');
  return action;
}

function rollupWeatherStatus(tiles) {
  for (const tile of tiles) if (tile.status === 'storm_warning') return 'storm_warning';
  for (const tile of tiles) if (tile.status === 'needs_attention') return 'needs_attention';
  return 'sunny';
}

function issueCodesForTiles(tiles) {
  const issues = [];
  for (const tile of tiles) {
    if (tile.status === 'sunny') continue;
    issues.push(issueCodeForMetric(tile.metric));
  }
  return uniqueSorted(issues);
}

function issueCodeForMetric(metric) {
  if (metric === 'expiring_grants') return 'grant_expiring';
  if (metric === 'recent_vetoes') return 'veto_rate_elevated';
  if (metric === 'open_private_bubbles') return 'private_bubble_open';
  if (metric === 'tombstone_pressure') return 'tombstone_pressure';
  if (metric === 'sensitive_candidates') return 'sensitive_candidate_pressure';
  if (metric === 'receipt_coverage') return 'receipt_gap';
  return 'policy_attention_needed';
}

function firstNextAction(tiles, status, issueCodes) {
  if (status === 'sunny') return 'none';
  if (issueCodes.includes('private_bubble_open')) return 'close_private_bubbles';
  if (issueCodes.includes('receipt_gap')) return 'inspect_receipts';
  if (issueCodes.includes('grant_expiring') || issueCodes.includes('grant_missing')) return 'review_grants';
  if (issueCodes.includes('policy_attention_needed')) return 'review_policy';
  const stormTile = tiles.find((tile) => tile.status === 'storm_warning');
  if (stormTile?.metric === 'open_private_bubbles') return 'close_private_bubbles';
  return 'ask_for_consent';
}

function evidenceRefsForTiles(tiles) {
  const refs = uniqueSorted(tiles.flatMap((tile) => tile.evidence_refs));
  return refs.length === 0 ? ['ref:evidence:weather'] : refs;
}

function metricFromTileRef(tileRef) {
  if (typeof tileRef === 'string') {
    for (const metric of WEATHER_METRICS) if (tileRef.includes(metric)) return metric;
  }
  return 'active_grants';
}

function merkleRootFor(kind, value, omittedFields) {
  const omitted = new Set(omittedFields);
  const leaves = Object.keys(value)
    .filter((key) => !omitted.has(key))
    .sort()
    .map((key) => canonicalize({ kind, key, value: value[key] }));
  return new MerkleSet(leaves).root();
}

function makePublicRef(kind, value, omittedFields = []) {
  const omitted = new Set(omittedFields);
  const body = {};
  for (const key of Object.keys(value).sort()) {
    if (!omitted.has(key)) body[key] = value[key];
  }
  return `ref:${kind}:${sha256Hex(canonicalize(body)).slice(0, ID_HASH_LENGTH)}`;
}

function isPublicRef(value) {
  return typeof value === 'string' && PUBLIC_REF_RE.test(value);
}

function isPublicRefArray(value, minOne = false) {
  return Array.isArray(value) && (!minOne || value.length > 0) && new Set(value).size === value.length && value.every(isPublicRef);
}

function isOperationArray(value) {
  return Array.isArray(value) && value.length > 0 && new Set(value).size === value.length && value.every((operation) => GRANT_OPERATIONS.has(operation));
}

function scanExtraForbiddenKeys(value, path, forbiddenPaths, seen) {
  if (value === null || typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        scanExtraForbiddenKeys(value[index], `${path}[${index}]`, forbiddenPaths, seen);
      }
      return;
    }
    for (const key of Object.keys(value)) {
      const normalized = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
      const childPath = `${path}.${key}`;
      if (EXTRA_FORBIDDEN_KEY_RE.test(normalized)) forbiddenPaths.push(childPath);
      scanExtraForbiddenKeys(value[key], childPath, forbiddenPaths, seen);
    }
  } finally {
    seen.delete(value);
  }
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}
