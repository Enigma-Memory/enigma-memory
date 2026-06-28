import { canonicalize, sha256Hex, MerkleSet, verifyPublicSafeArtifact } from '../../core/src/index.js';

export const CONSENT_GRANT_SCHEMA = 'enigma.consent_grant.v1';
export const RECALL_VETO_DECISION_SCHEMA = 'enigma.recall_veto_decision.v1';
export const PRIVATE_MEMORY_BUBBLE_SCHEMA = 'enigma.private_memory_bubble.v1';
export const MEMORY_WEATHER_REPORT_SCHEMA = 'enigma.memory_weather_report.v1';

const DEFAULT_NOW = '1970-01-01T00:00:00.000Z';
const DEFAULT_GRANT_TTL_SECONDS = 300;
const DEFAULT_BUBBLE_TTL_SECONDS = 900;
const ID_HASH_LENGTH = 32;
const GRANT_OPERATIONS = new Set(['recall', 'read', 'summarize', 'search', 'connect']);
const BUBBLE_CLOSE_OUTCOMES = new Set(['keep', 'discard']);
const WEATHER_STATUSES = new Set(['sunny', 'needs_attention', 'storm_warning']);
const STORM_TILE_STATUSES = new Set(['storm_warning', 'blocked', 'fail', 'revoked', 'expired', 'unsafe_export', 'unsafe', 'tombstone', 'sensitive']);
const ATTENTION_TILE_STATUSES = new Set(['needs_attention', 'warning', 'needs_review', 'offline', 'pending', 'missing', 'ask']);
const EXTRA_FORBIDDEN_KEY_RE = /(?:^|_)(?:account|account_id|customer|customer_id|customer_identifier|provider_response|signing_secret|private_data|memory_payload|local_absolute_path)$/u;

const CONSENT_GRANT_FIELDS = new Set([
  'schema',
  'grant_id',
  'created_at',
  'expires_at',
  'revoked_at',
  'app_ref',
  'operation',
  'memory_zone',
  'purpose',
  'scope_refs',
  'policy_refs',
  'receipt_refs',
  'grant_root',
  'public_safe'
]);

export const CONSENT_GRANT_JSON_SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://schemas.enigma.memory/enigma.consent_grant.v1.json',
  type: 'object',
  additionalProperties: false,
  required: ['schema', 'grant_id', 'created_at', 'expires_at', 'revoked_at', 'app_ref', 'operation', 'memory_zone', 'purpose', 'scope_refs', 'policy_refs', 'receipt_refs', 'grant_root', 'public_safe'],
  properties: {
    schema: { const: CONSENT_GRANT_SCHEMA },
    grant_id: { type: 'string', pattern: '^cgrant_[a-f0-9]{32}$' },
    created_at: { type: 'string', format: 'date-time' },
    expires_at: { type: 'string', format: 'date-time' },
    revoked_at: { type: ['string', 'null'], format: 'date-time' },
    app_ref: { type: 'string' },
    operation: { type: 'string', enum: [...GRANT_OPERATIONS] },
    memory_zone: { type: 'string' },
    purpose: { type: 'string' },
    scope_refs: { type: 'array', items: { type: 'string' } },
    policy_refs: { type: 'array', items: { type: 'string' } },
    receipt_refs: { type: 'array', items: { type: 'string' } },
    grant_root: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
    public_safe: { const: true }
  }
});

export const RECALL_VETO_DECISION_JSON_SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://schemas.enigma.memory/enigma.recall_veto_decision.v1.json',
  type: 'object',
  additionalProperties: false,
  required: ['schema', 'decision_id', 'created_at', 'app_ref', 'operation', 'memory_zone', 'purpose', 'decision', 'reason_codes', 'candidate_count', 'selected_count', 'withheld_count', 'grant_ref', 'decision_root', 'public_safe'],
  properties: {
    schema: { const: RECALL_VETO_DECISION_SCHEMA },
    decision_id: { type: 'string', pattern: '^rveto_[a-f0-9]{32}$' },
    created_at: { type: 'string', format: 'date-time' },
    app_ref: { type: 'string' },
    operation: { type: 'string' },
    memory_zone: { type: 'string' },
    purpose: { type: 'string' },
    decision: { type: 'string', enum: ['allow', 'ask', 'deny'] },
    reason_codes: { type: 'array', items: { type: 'string' } },
    candidate_count: { type: 'integer', minimum: 0 },
    selected_count: { type: 'integer', minimum: 0 },
    withheld_count: { type: 'integer', minimum: 0 },
    grant_ref: { type: ['string', 'null'] },
    decision_root: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
    public_safe: { const: true }
  }
});

export const PRIVATE_MEMORY_BUBBLE_JSON_SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://schemas.enigma.memory/enigma.private_memory_bubble.v1.json',
  type: 'object',
  additionalProperties: false,
  required: ['schema', 'bubble_id', 'created_at', 'expires_at', 'closed_at', 'status', 'app_ref', 'memory_zone', 'purpose', 'item_count', 'promotion_count', 'bubble_root', 'receipt_refs', 'public_safe'],
  properties: {
    schema: { const: PRIVATE_MEMORY_BUBBLE_SCHEMA },
    bubble_id: { type: 'string', pattern: '^bubble_[a-f0-9]{32}$' },
    created_at: { type: 'string', format: 'date-time' },
    expires_at: { type: 'string', format: 'date-time' },
    closed_at: { type: ['string', 'null'], format: 'date-time' },
    status: { type: 'string', enum: ['open', 'kept', 'discarded', 'expired'] },
    app_ref: { type: 'string' },
    memory_zone: { type: 'string' },
    purpose: { type: 'string' },
    item_count: { type: 'integer', minimum: 0 },
    promotion_count: { type: 'integer', minimum: 0 },
    bubble_root: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
    receipt_refs: { type: 'array', items: { type: 'string' } },
    public_safe: { const: true }
  }
});

export const MEMORY_WEATHER_REPORT_JSON_SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://schemas.enigma.memory/enigma.memory_weather_report.v1.json',
  type: 'object',
  additionalProperties: false,
  required: ['schema', 'report_id', 'generated_at', 'overall_status', 'next_action_ref', 'status_counts', 'tiles', 'support_ref', 'report_root', 'public_safe'],
  properties: {
    schema: { const: MEMORY_WEATHER_REPORT_SCHEMA },
    report_id: { type: 'string', pattern: '^weather_[a-f0-9]{32}$' },
    generated_at: { type: 'string', format: 'date-time' },
    overall_status: { type: 'string', enum: [...WEATHER_STATUSES] },
    next_action_ref: { type: 'string' },
    status_counts: {
      type: 'object',
      additionalProperties: false,
      required: ['sunny', 'needs_attention', 'storm_warning'],
      properties: {
        sunny: { type: 'integer', minimum: 0 },
        needs_attention: { type: 'integer', minimum: 0 },
        storm_warning: { type: 'integer', minimum: 0 }
      }
    },
    tiles: { type: 'array' },
    support_ref: { type: 'string' },
    report_root: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
    public_safe: { const: true }
  }
});

export function createConsentGrant(options = {}) {
  assertPlainRecord(options, 'options');
  const createdAt = normalizeDateTime(options.created_at ?? options.createdAt ?? options.now ?? DEFAULT_NOW, 'created_at');
  const expiresAt = normalizeDateTime(options.expires_at ?? options.expiresAt ?? addSeconds(createdAt, normalizeTtl(options.ttl_seconds ?? options.ttlSeconds ?? DEFAULT_GRANT_TTL_SECONDS, 'ttl_seconds')), 'expires_at');
  const body = {
    schema: CONSENT_GRANT_SCHEMA,
    grant_id: '',
    created_at: createdAt,
    expires_at: expiresAt,
    revoked_at: normalizeNullableDateTime(options.revoked_at ?? options.revokedAt ?? null, 'revoked_at'),
    app_ref: normalizeRequiredString(options.app_ref ?? options.appRef, 'app_ref'),
    operation: normalizeOperation(options.operation),
    memory_zone: normalizeRequiredString(options.memory_zone ?? options.memoryZone, 'memory_zone'),
    purpose: normalizeRequiredString(options.purpose, 'purpose'),
    scope_refs: normalizeStringArray(options.scope_refs ?? options.scopeRefs ?? [], 'scope_refs'),
    policy_refs: normalizeStringArray(options.policy_refs ?? options.policyRefs ?? [], 'policy_refs'),
    receipt_refs: normalizeStringArray(options.receipt_refs ?? options.receiptRefs ?? [], 'receipt_refs'),
    grant_root: '',
    public_safe: true
  };
  body.grant_root = merkleRootFor('consent_grant', body, ['grant_id', 'grant_root']);
  body.grant_id = `cgrant_${sha256Hex(canonicalize({ ...body, grant_id: '' })).slice(0, ID_HASH_LENGTH)}`;
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
    if (!CONSENT_GRANT_FIELDS.has(key)) {
      errors.push(`UNKNOWN_FIELD:${key}`);
      reasonCodes.push('BAD_SHAPE');
    }
  }

  if (grant.schema !== CONSENT_GRANT_SCHEMA) push(errors, reasonCodes, 'BAD_SCHEMA');
  if (typeof grant.grant_id !== 'string' || !/^cgrant_[a-f0-9]{32}$/u.test(grant.grant_id)) push(errors, reasonCodes, 'BAD_GRANT_ID');
  if (!isDateTime(grant.created_at)) push(errors, reasonCodes, 'BAD_CREATED_AT');
  if (!isDateTime(grant.expires_at)) push(errors, reasonCodes, 'BAD_EXPIRES_AT');
  if (grant.revoked_at !== null && !isDateTime(grant.revoked_at)) push(errors, reasonCodes, 'BAD_REVOKED_AT');
  if (typeof grant.app_ref !== 'string' || grant.app_ref.length === 0) push(errors, reasonCodes, 'BAD_APP_REF');
  if (!GRANT_OPERATIONS.has(grant.operation)) push(errors, reasonCodes, 'BAD_OPERATION');
  if (typeof grant.memory_zone !== 'string' || grant.memory_zone.length === 0) push(errors, reasonCodes, 'BAD_MEMORY_ZONE');
  if (typeof grant.purpose !== 'string' || grant.purpose.length === 0) push(errors, reasonCodes, 'BAD_PURPOSE');
  if (!isStringArray(grant.scope_refs)) push(errors, reasonCodes, 'BAD_SCOPE_REFS');
  if (!isStringArray(grant.policy_refs)) push(errors, reasonCodes, 'BAD_POLICY_REFS');
  if (!isStringArray(grant.receipt_refs)) push(errors, reasonCodes, 'BAD_RECEIPT_REFS');
  if (typeof grant.grant_root !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(grant.grant_root)) push(errors, reasonCodes, 'BAD_GRANT_ROOT');
  if (grant.public_safe !== true) push(errors, reasonCodes, 'NOT_MARKED_PUBLIC_SAFE');

  const now = normalizeDateTime(options.now ?? DEFAULT_NOW, 'now');
  if (isDateTime(grant.expires_at) && Date.parse(grant.expires_at) <= Date.parse(now)) push(errors, reasonCodes, 'EXPIRED');
  if (grant.revoked_at !== null && grant.revoked_at !== undefined) push(errors, reasonCodes, 'REVOKED');
  if (options.revoked === true) push(errors, reasonCodes, 'REVOKED');
  if (containsRef(options.revoked_grant_ids ?? options.revokedGrantIds, grant.grant_id)) push(errors, reasonCodes, 'REVOKED');

  compareScope(errors, reasonCodes, grant, options);

  return verification(errors.length === 0, errors, reasonCodes, warnings, publicHash);
}

export function createRecallVetoDecision(options = {}) {
  assertPlainRecord(options, 'options');
  const createdAt = normalizeDateTime(options.created_at ?? options.createdAt ?? options.now ?? DEFAULT_NOW, 'created_at');
  const appRef = normalizeRequiredString(options.app_ref ?? options.appRef, 'app_ref');
  const operation = normalizeOperation(options.operation);
  const memoryZone = normalizeRequiredString(options.memory_zone ?? options.memoryZone, 'memory_zone');
  const purpose = normalizeRequiredString(options.purpose, 'purpose');
  const counts = normalizeRecallCounts(options);
  const grant = selectGrant(options.grant ?? null, options.grants ?? [], { app_ref: appRef, operation, memory_zone: memoryZone, purpose, now: createdAt, revoked_grant_ids: options.revoked_grant_ids ?? options.revokedGrantIds });
  const reasonCodes = [];
  let decision = 'ask';
  let grantRef = null;

  if (counts.tombstone_count > 0) reasonCodes.push('TOMBSTONE_MATCH');
  if (counts.sensitive_count > 0) reasonCodes.push('SENSITIVE_MATCH');
  if (!counts.safe) reasonCodes.push('UNSAFE_COUNTS');

  if (reasonCodes.length > 0) {
    decision = 'deny';
  } else if (grant.verification?.ok === true) {
    decision = 'allow';
    grantRef = grant.value.grant_id;
    reasonCodes.push('ACTIVE_GRANT');
  } else if (grant.verification?.reason_codes?.some((code) => code === 'EXPIRED' || code === 'REVOKED')) {
    decision = 'deny';
    grantRef = typeof grant.value?.grant_id === 'string' ? grant.value.grant_id : null;
    for (const code of grant.verification.reason_codes) {
      if (code === 'EXPIRED' || code === 'REVOKED') reasonCodes.push(code);
    }
  } else {
    decision = 'ask';
    reasonCodes.push('NO_ACTIVE_GRANT');
  }

  const selectedCount = decision === 'allow' ? counts.selected_count : 0;
  const body = {
    schema: RECALL_VETO_DECISION_SCHEMA,
    decision_id: '',
    created_at: createdAt,
    app_ref: appRef,
    operation,
    memory_zone: memoryZone,
    purpose,
    decision,
    reason_codes: uniqueSorted(reasonCodes),
    candidate_count: counts.candidate_count,
    selected_count: selectedCount,
    withheld_count: Math.max(0, counts.candidate_count - selectedCount),
    grant_ref: grantRef,
    decision_root: '',
    public_safe: true
  };
  body.decision_root = merkleRootFor('recall_veto_decision', body, ['decision_id', 'decision_root']);
  body.decision_id = `rveto_${sha256Hex(canonicalize({ ...body, decision_id: '' })).slice(0, ID_HASH_LENGTH)}`;
  return assertMemoryControllerPublicSafe(body);
}

export function createPrivateMemoryBubble(options = {}) {
  assertPlainRecord(options, 'options');
  const createdAt = normalizeDateTime(options.created_at ?? options.createdAt ?? options.now ?? DEFAULT_NOW, 'created_at');
  const expiresAt = normalizeDateTime(options.expires_at ?? options.expiresAt ?? addSeconds(createdAt, normalizeTtl(options.ttl_seconds ?? options.ttlSeconds ?? DEFAULT_BUBBLE_TTL_SECONDS, 'ttl_seconds')), 'expires_at');
  const body = {
    schema: PRIVATE_MEMORY_BUBBLE_SCHEMA,
    bubble_id: '',
    created_at: createdAt,
    expires_at: expiresAt,
    closed_at: null,
    status: 'open',
    app_ref: normalizeRequiredString(options.app_ref ?? options.appRef, 'app_ref'),
    memory_zone: normalizeRequiredString(options.memory_zone ?? options.memoryZone, 'memory_zone'),
    purpose: normalizeRequiredString(options.purpose, 'purpose'),
    item_count: normalizeCount(options.item_count ?? options.itemCount ?? 0, 'item_count'),
    promotion_count: 0,
    bubble_root: '',
    receipt_refs: normalizeStringArray(options.receipt_refs ?? options.receiptRefs ?? [], 'receipt_refs'),
    public_safe: true
  };
  body.bubble_root = merkleRootFor('private_memory_bubble', body, ['bubble_id', 'bubble_root']);
  body.bubble_id = `bubble_${sha256Hex(canonicalize({ ...body, bubble_id: '' })).slice(0, ID_HASH_LENGTH)}`;
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
  const promotionCount = outcome === 'keep'
    ? normalizeCount(options.promotion_count ?? options.promotionCount ?? bubble.item_count, 'promotion_count')
    : 0;
  if (promotionCount > bubble.item_count) throw new TypeError('promotion_count cannot exceed item_count');
  const closed = {
    ...bubble,
    closed_at: closedAt,
    status: outcome === 'keep' ? 'kept' : 'discarded',
    promotion_count: promotionCount,
    receipt_refs: normalizeStringArray(options.receipt_refs ?? options.receiptRefs ?? bubble.receipt_refs ?? [], 'receipt_refs'),
    bubble_root: ''
  };
  closed.bubble_root = merkleRootFor('private_memory_bubble', closed, ['bubble_root']);
  return assertMemoryControllerPublicSafe(closed);
}

export function createMemoryWeatherReport(options = {}) {
  assertPlainRecord(options, 'options');
  const generatedAt = normalizeDateTime(options.generated_at ?? options.generatedAt ?? options.now ?? DEFAULT_NOW, 'generated_at');
  const tiles = normalizeWeatherTiles(options.tiles ?? []);
  const statusCounts = { sunny: 0, needs_attention: 0, storm_warning: 0 };
  for (const tile of tiles) statusCounts[tile.status] += 1;
  const overallStatus = statusCounts.storm_warning > 0 ? 'storm_warning' : statusCounts.needs_attention > 0 ? 'needs_attention' : 'sunny';
  const nextActionRef = normalizeRequiredString(
    options.next_action_ref ?? options.nextActionRef ?? firstNextActionRef(tiles, overallStatus),
    'next_action_ref'
  );
  const body = {
    schema: MEMORY_WEATHER_REPORT_SCHEMA,
    report_id: '',
    generated_at: generatedAt,
    overall_status: overallStatus,
    next_action_ref: nextActionRef,
    status_counts: statusCounts,
    tiles,
    support_ref: normalizeRequiredString(options.support_ref ?? options.supportRef ?? `support:${overallStatus}`, 'support_ref'),
    report_root: '',
    public_safe: true
  };
  body.report_root = merkleRootFor('memory_weather_report', body, ['report_id', 'report_root']);
  body.report_id = `weather_${sha256Hex(canonicalize({ ...body, report_id: '' })).slice(0, ID_HASH_LENGTH)}`;
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

function normalizeOperation(value) {
  const operation = normalizeRequiredString(value, 'operation');
  if (!GRANT_OPERATIONS.has(operation)) throw new TypeError('operation is not supported');
  return operation;
}

function normalizeStringArray(value, field) {
  if (!Array.isArray(value)) throw new TypeError(`${field} must be an array`);
  return value.map((item, index) => normalizeRequiredString(item, `${field}[${index}]`));
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

function normalizeNullableDateTime(value, field) {
  if (value === null || value === undefined) return null;
  return normalizeDateTime(value, field);
}

function isDateTime(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value) && !Number.isNaN(Date.parse(value));
}

function addSeconds(dateTime, seconds) {
  return new Date(Date.parse(dateTime) + seconds * 1000).toISOString();
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
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
  const expected = [
    ['app_ref', options.app_ref ?? options.appRef, 'WRONG_APP'],
    ['operation', options.operation, 'WRONG_OPERATION'],
    ['memory_zone', options.memory_zone ?? options.memoryZone, 'WRONG_MEMORY_ZONE'],
    ['purpose', options.purpose, 'WRONG_PURPOSE']
  ];
  for (const [field, value, code] of expected) {
    if (value !== undefined && grant[field] !== value) push(errors, reasonCodes, code);
  }
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
  const selectedCount = normalizeCount(options.selected_count ?? options.selectedCount ?? candidateCount, 'selected_count');
  const tombstoneCount = normalizeCount(options.tombstone_count ?? options.tombstoneCount ?? 0, 'tombstone_count');
  const sensitiveCount = normalizeCount(options.sensitive_count ?? options.sensitiveCount ?? 0, 'sensitive_count');
  const safe = selectedCount <= candidateCount && tombstoneCount <= candidateCount && sensitiveCount <= candidateCount;
  return { candidate_count: candidateCount, selected_count: selectedCount, tombstone_count: tombstoneCount, sensitive_count: sensitiveCount, safe };
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

function normalizeWeatherTiles(value) {
  if (!Array.isArray(value)) throw new TypeError('tiles must be an array');
  return value.map((tile, index) => {
    assertPlainRecord(tile, `tiles[${index}]`);
    const status = normalizeTileStatus(tile.status ?? 'sunny');
    const out = {
      tile_ref: normalizeRequiredString(tile.tile_ref ?? tile.tileRef ?? `tile:${index}`, `tiles[${index}].tile_ref`),
      status,
      count: normalizeCount(tile.count ?? 0, `tiles[${index}].count`)
    };
    const next = tile.next_action_ref ?? tile.nextActionRef;
    if (next !== undefined) out.next_action_ref = normalizeRequiredString(next, `tiles[${index}].next_action_ref`);
    return out;
  });
}

function normalizeTileStatus(status) {
  const value = String(status);
  if (WEATHER_STATUSES.has(value)) return value;
  if (STORM_TILE_STATUSES.has(value)) return 'storm_warning';
  if (ATTENTION_TILE_STATUSES.has(value)) return 'needs_attention';
  return 'needs_attention';
}

function firstNextActionRef(tiles, overallStatus) {
  const wanted = overallStatus === 'storm_warning' ? 'storm_warning' : overallStatus === 'needs_attention' ? 'needs_attention' : 'sunny';
  const tile = tiles.find((item) => item.status === wanted && typeof item.next_action_ref === 'string');
  return tile?.next_action_ref ?? `action:${overallStatus}`;
}

function merkleRootFor(kind, value, omittedFields) {
  const omitted = new Set(omittedFields);
  const leaves = Object.keys(value)
    .filter((key) => !omitted.has(key))
    .sort()
    .map((key) => canonicalize({ kind, key, value: value[key] }));
  return new MerkleSet(leaves).root();
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
