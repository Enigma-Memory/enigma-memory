import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  createEnterprisePolicy,
  createGatewayDecision,
  evaluateEnterprisePolicy,
  exportSiemEvent,
  minimizeEnterpriseEvaluation,
  minimizeEnterprisePolicy,
  verifyGatewayDecision,
} from '../../../packages/enterprise/src/index.js';
import { canonicalize, generateSigningKeyPair, sha256Hex, signPayload, verifySignature } from '../../../packages/core/src/index.js';
import {
  normalizeDependencyEvidence,
  readinessEvidenceRefs,
} from '../../../packages/adapters/src/index.js';

const GATEWAY_REQUEST_SCHEMA = 'enigma.gateway_request.v1';
const GATEWAY_EXPORT_SCHEMA = 'enigma.gateway_siem_export.v1';
const GATEWAY_STATE_SCHEMA = 'enigma.gateway_state.v1';
const GATEWAY_STATE_VERSION = 1;
const DEFAULT_GATEWAY_ID = 'gateway_local';
const DEFAULT_ACTIVE_ROOT = `sha256:${sha256Hex('enigma.gateway.empty_active_root.v1')}`;
const DEFAULT_BODY_LIMIT = 64 * 1024;
const JSON_HEADERS = Object.freeze({ 'content-type': 'application/json; charset=utf-8' });
const LOCAL_READINESS_MODES = new Set(['local', 'demo', 'development', 'test']);
const PRODUCTION_READINESS_MODES = new Set(['production', 'hosted', 'byoc', 'customer_byoc', 'on_prem', 'onprem']);
const LOCAL_STORAGE_KINDS = new Set(['memory', 'in_memory', 'in-memory', 'local', 'file', 'state_file', 'state-file', 'json']);
const DURABLE_STORAGE_KINDS = new Set(['postgres', 'postgresql', 'mysql', 'mariadb', 'database', 'dynamodb', 'r2', 's3', 'gcs', 'azure_blob', 'blob', 'kv', 'foundationdb']);
const PLAINTEXT_MEMORY_KEYS = new Set([
  'plaintext',
  'plaintextmemory',
  'plainmemory',
  'cleartext',
  'rawmemory',
  'memoryplaintext',
  'memory',
  'memories',
  'text',
  'content',
  'body',
  'prompt',
  'prompttext',
  'completion',
  'message',
  'messagetext',
  'conversation',
  'conversationtext',
  'transcript',
  'transcripttext'
]);
const POLICY_ARRAY_FIELDS = [
  'allowed_operations',
  'allowed_providers',
  'allowed_models',
  'allowed_regions',
  'denied_sensitivities',
  'allowed_purposes',
  'legal_holds',
];
const SHARED_PRODUCTION_DEPENDENCY_ALIASES = Object.freeze({
  network_access_policy: {
    options: ['network_access_policy', 'networkAccessPolicy', 'network_policy', 'networkPolicy', 'network_access_policy_ref', 'networkAccessPolicyRef'],
    env: ['ENIGMA_NETWORK_ACCESS_POLICY_REF', 'ENIGMA_NETWORK_POLICY_REF'],
  },
  kms_custody: {
    options: ['kms_custody', 'kmsCustody', 'key_custody', 'keyCustody', 'kms_custody_ref', 'kmsCustodyRef'],
    env: ['ENIGMA_KMS_CUSTODY_REF', 'ENIGMA_KEY_CUSTODY_REF'],
  },
  tenant_policy_approval: {
    options: ['tenant_policy_approval', 'tenantPolicyApproval', 'tenant_policy', 'tenantPolicy', 'tenant_policy_approval_ref', 'tenantPolicyApprovalRef'],
    env: ['ENIGMA_TENANT_POLICY_APPROVAL_REF', 'ENIGMA_TENANT_POLICY_REF'],
  },
  usage_metering: {
    options: ['usage_metering', 'usageMetering', 'metering', 'metering_ref', 'meteringRef', 'usage_metering_ref', 'usageMeteringRef'],
    env: ['ENIGMA_USAGE_METERING_REF', 'ENIGMA_METERING_REF'],
  },
  service_settlement: {
    options: ['service_settlement', 'serviceSettlement', 'settlement', 'settlement_ref', 'settlementRef', 'service_settlement_ref', 'serviceSettlementRef'],
    env: ['ENIGMA_SERVICE_SETTLEMENT_REF', 'ENIGMA_SETTLEMENT_REF'],
  },
  monitoring_alerting: {
    options: ['monitoring_alerting', 'monitoringAlerting', 'monitoring_alerting_ref', 'monitoringAlertingRef'],
    env: ['ENIGMA_MONITORING_ALERTING_REF'],
  },
  public_site_security: {
    options: ['public_site_security', 'publicSiteSecurity', 'public_site_security_ref', 'publicSiteSecurityRef'],
    env: ['ENIGMA_PUBLIC_SITE_SECURITY_REF', 'ENIGMA_SITE_SECURITY_REF'],
  },
  security_threat_model: {
    options: ['security_threat_model', 'securityThreatModel', 'threat_model', 'threatModel', 'security_threat_model_ref', 'securityThreatModelRef'],
    env: ['ENIGMA_SECURITY_THREAT_MODEL_REF', 'ENIGMA_THREAT_MODEL_REF'],
  },
  legal_compliance_approval: {
    options: ['legal_compliance_approval', 'legalComplianceApproval', 'legal_compliance', 'legalCompliance', 'legal_compliance_ref', 'legalComplianceRef'],
    env: ['ENIGMA_LEGAL_COMPLIANCE_REF', 'ENIGMA_LEGAL_COMPLIANCE_APPROVAL_REF'],
  },
  support_sla: {
    options: ['support_sla', 'supportSla', 'sla', 'sla_ref', 'slaRef', 'support_sla_ref', 'supportSlaRef'],
    env: ['ENIGMA_SUPPORT_SLA_REF', 'ENIGMA_SLA_REF'],
  },
  incident_drill: {
    options: ['incident_drill', 'incidentDrill', 'incident_drill_ref', 'incidentDrillRef'],
    env: ['ENIGMA_INCIDENT_DRILL_REF', 'ENIGMA_INCIDENT_RESPONSE_DRILL_REF'],
  },
  backup_restore_drill: {
    options: ['backup_restore_drill', 'backupRestoreDrill', 'backup_restore_drill_ref', 'backupRestoreDrillRef'],
    env: ['ENIGMA_BACKUP_RESTORE_DRILL_REF', 'ENIGMA_RESTORE_DRILL_REF'],
  },
});
const SHARED_PRODUCTION_DEPENDENCY_KEYS = Object.freeze(Object.keys(SHARED_PRODUCTION_DEPENDENCY_ALIASES));

function isPlainRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function withoutUndefinedFields(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}
function hashValue(value) {
  return `sha256:${sha256Hex(typeof value === 'string' ? value : canonicalize(value))}`;
}

function normalizeSha256Digest(value) {
  if (!nonEmptyString(value)) return null;
  const text = value.trim();
  if (/^sha256:[a-f0-9]{64}$/i.test(text)) return `sha256:${text.slice('sha256:'.length).toLowerCase()}`;
  if (/^[a-f0-9]{64}$/i.test(text)) return `sha256:${text.toLowerCase()}`;
  return null;
}

function bearerTokenHash(token) {
  return `sha256:${sha256Hex(String(token))}`;
}

function headerValue(headers, name) {
  if (headers === undefined || headers === null) return undefined;
  if (typeof headers.get === 'function') return headers.get(name) ?? headers.get(name.toLowerCase()) ?? undefined;
  if (!isPlainRecord(headers)) return undefined;
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() !== lower) continue;
    if (Array.isArray(value)) return value[0];
    return value;
  }
  return undefined;
}

function bearerTokenFromRequest(request) {
  const authorization = headerValue(request?.headers, 'authorization');
  if (!nonEmptyString(authorization)) return null;
  const match = authorization.trim().match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

function normalizeKeyName(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isForbiddenPlaintextKey(key) {
  return PLAINTEXT_MEMORY_KEYS.has(normalizeKeyName(key));
}

function policyHash(policy) {
  const { policy_hash, policyHash, ...rest } = policy ?? {};
  return hashValue(rest);
}



function defaultPolicy(options = {}) {
  return createEnterprisePolicy({
    policy_id: options.policy_id ?? options.policyId ?? 'policy_gateway_default',
    tenant_id: options.tenant_id ?? options.tenantId ?? 'tenant_gateway',
    mode: options.mode ?? 'byoc',
    allowed_providers: options.allowed_providers ?? options.allowedProviders ?? ['anthropic', 'kimi'],
    allowed_models: options.allowed_models ?? options.allowedModels ?? ['claude-3-5-sonnet', 'kimi-k2'],
    allowed_regions: options.allowed_regions ?? options.allowedRegions ?? ['us-east-1', 'eu-central-1'],
    allowed_operations: options.allowed_operations ?? options.allowedOperations ?? ['retrieve', 'remember', 'write', 'delete'],
    allowed_purposes: options.allowed_purposes ?? options.allowedPurposes ?? ['support_retrieval', 'agent_context'],
    denied_sensitivities: options.denied_sensitivities ?? options.deniedSensitivities ?? ['restricted', 'secret'],
    legal_holds: options.legal_holds ?? options.legalHolds ?? [
      { hold_id: 'hold_gateway_demo', memory_id: 'mem_legal_hold', status: 'active', reason_code: 'LEGAL_HOLD' },
    ],
    retention_days: options.retention_days ?? options.retentionDays ?? 365,
    kms: options.kms ?? {
      provider: 'gateway_local_kms',
      key_id: 'gateway-local-demo-key',
      key_version: '1',
      region: 'local',
    },
    now: options.now ?? '1970-01-01T00:00:00.000Z',
  });
}

function validateGatewayPolicy(policy) {
  const errors = [];
  if (!isPlainRecord(policy)) {
    return { ok: false, errors: ['POLICY_NOT_OBJECT'] };
  }
  if (policy.schema !== 'enigma.enterprise_policy.v1') errors.push('POLICY_SCHEMA_INVALID');
  if (policy.default_action !== 'deny_unknown') errors.push('DEFAULT_DENY_REQUIRED');
  if (policy.provider_native_memory !== 'cache_only') errors.push('PROVIDER_NATIVE_MEMORY_CACHE_ONLY_REQUIRED');
  if (typeof policy.policy_id !== 'string' || policy.policy_id.length === 0) errors.push('POLICY_ID_REQUIRED');
  if (typeof policy.tenant_id !== 'string' || policy.tenant_id.length === 0) errors.push('TENANT_ID_REQUIRED');
  for (const field of POLICY_ARRAY_FIELDS) {
    if (!Array.isArray(policy[field])) errors.push(`${field.toUpperCase()}_ARRAY_REQUIRED`);
  }
  if (!isPlainRecord(policy.kms)) errors.push('KMS_REQUIRED');
  if (typeof policy.policy_hash !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(policy.policy_hash)) {
    errors.push('POLICY_HASH_REQUIRED');
  } else if (policy.policy_hash !== policyHash(policy)) {
    errors.push('POLICY_HASH_MISMATCH');
  }
  return { ok: errors.length === 0, errors };
}

function containsPlaintextMemory(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => containsPlaintextMemory(item, seen));
  for (const [key, child] of Object.entries(value)) {
    if (isForbiddenPlaintextKey(key) && child !== undefined && child !== null && child !== '') return true;
    if (containsPlaintextMemory(child, seen)) return true;
  }
  return false;
}

function normalizeGatewayRequest(input = {}) {
  if (!isPlainRecord(input)) {
    return { ok: false, status: 400, errors: ['REQUEST_NOT_OBJECT'] };
  }
  if (containsPlaintextMemory(input)) {
    return { ok: false, status: 400, errors: ['MEMORY_PLAINTEXT_FORBIDDEN'] };
  }
  const source = isPlainRecord(input.request) ? input.request : input;
  if (containsPlaintextMemory(source)) {
    return { ok: false, status: 400, errors: ['MEMORY_PLAINTEXT_FORBIDDEN'] };
  }
  return {
    ok: true,
    request: withoutUndefinedFields({
      schema: source.schema ?? GATEWAY_REQUEST_SCHEMA,
      operation: source.operation,
      provider: source.provider,
      model: source.model,
      region: source.region,
      purpose: source.purpose,
      sensitivity: source.sensitivity,
      memory_addr: source.memory_addr ?? source.memoryAddr,
      memory_id: source.memory_id ?? source.memoryId,
      subject_id: source.subject_id ?? source.subjectId,
      legal_hold_delete: source.legal_hold_delete ?? source.legalHoldDelete,
    }),
  };
}

function unsignedDecision(decision) {
  const { signature, signer, public_key, publicKey, verification_key, verificationKey, ...unsigned } = decision;
  return unsigned;
}

function redactAndResignDecision(decision, state) {
  const { memory_addr, key_evidence, operation, provider, model, region, purpose, sensitivity, ...redacted } = decision;
  const unsigned = unsignedDecision(redacted);
  return {
    ...unsigned,
    signer: redacted.signer,
    signature: {
      alg: 'Ed25519',
      key_id: redacted.signer.key_id,
      value: signPayload(unsigned, state.signingKeyPair.privateKey),
    },
    public_key: redacted.public_key,
  };
}

function createDecisionForRequest(state, request, evaluation) {
  const decision = createGatewayDecision({
    policy: state.policy,
    request,
    evaluation,
    gateway_id: state.gateway_id,
    active_root: state.active_root,
    signingKeyPair: state.signingKeyPair,
  });
  return redactAndResignDecision(decision, state);
}


function publicGatewayEvaluation(state, evaluation) {
  return state.expose_internal === true ? evaluation : minimizeEnterpriseEvaluation(evaluation);
}

function publicGatewayPolicy(state) {
  return state.expose_internal === true ? state.policy : minimizeEnterprisePolicy(state.policy);
}

function sanitizeSiemEvent(event) {
  const { operation, provider, model, region, purpose, sensitivity, memory_addr, key_evidence, ...minimized } = event;
  return minimized;
}

function appendSiemEvent(state, event) {
  const minimized = sanitizeSiemEvent(event);
  state.siem_events.push(minimized);
  return minimized;
}
function siemEventForEvaluation(state, evaluation) {
  return appendSiemEvent(state, exportSiemEvent({ policy: state.policy, evaluation }));
}

function siemEventForDecision(state, decision) {
  return appendSiemEvent(state, exportSiemEvent({ policy: state.policy, decision }));
}

function eventHasPlaintext(event) {
  if (!isPlainRecord(event)) return true;
  return ['provider', 'model', 'region', 'purpose', 'sensitivity', 'memory_addr', 'key_evidence', 'operation'].some((key) =>
    Object.prototype.hasOwnProperty.call(event, key)
  );
}

function failGatewayState(reason) {
  throw new TypeError(`gateway state invalid: ${reason}`);
}

function assertSnapshotKeys(record, allowed, label) {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) failGatewayState(`${label}_FIELD_FORBIDDEN:${key}`);
  }
}

function validateGatewayStateSnapshot(snapshot) {
  if (!isPlainRecord(snapshot)) failGatewayState('SNAPSHOT_NOT_OBJECT');
  assertSnapshotKeys(snapshot, new Set([
    'schema',
    'version',
    'gateway_id',
    'active_root',
    'policy',
    'signing_key',
    'siem_events',
    'expose_internal',
    'generated_at',
  ]), 'SNAPSHOT');
  if (snapshot.schema !== GATEWAY_STATE_SCHEMA) failGatewayState('SNAPSHOT_SCHEMA_INVALID');
  if (snapshot.version !== GATEWAY_STATE_VERSION) failGatewayState('SNAPSHOT_VERSION_INVALID');
  if (typeof snapshot.gateway_id !== 'string' || snapshot.gateway_id.length === 0) failGatewayState('GATEWAY_ID_REQUIRED');
  if (typeof snapshot.active_root !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(snapshot.active_root)) failGatewayState('ACTIVE_ROOT_INVALID');
  if (typeof snapshot.generated_at !== 'string' || Number.isNaN(Date.parse(snapshot.generated_at))) failGatewayState('GENERATED_AT_INVALID');
  if (typeof snapshot.expose_internal !== 'boolean') failGatewayState('EXPOSE_INTERNAL_BOOLEAN_REQUIRED');
  if (containsPlaintextMemory(snapshot)) failGatewayState('SNAPSHOT_PLAINTEXT_FORBIDDEN');
  const policyValidation = validateGatewayPolicy(snapshot.policy);
  if (!policyValidation.ok) failGatewayState(`POLICY_INVALID:${policyValidation.errors.join(',')}`);
  validateGatewaySigningKey(snapshot.signing_key);
  validateGatewaySiemEvents(snapshot.siem_events);
}

function validateGatewaySigningKey(signingKey) {
  if (!isPlainRecord(signingKey)) failGatewayState('SIGNING_KEY_NOT_OBJECT');
  assertSnapshotKeys(signingKey, new Set(['alg', 'key_id', 'public_key', 'private_key']), 'SIGNING_KEY');
  if (signingKey.alg !== 'Ed25519') failGatewayState('SIGNING_KEY_ALG_INVALID');
  if (typeof signingKey.key_id !== 'string' || signingKey.key_id.length === 0) failGatewayState('SIGNING_KEY_ID_REQUIRED');
  if (typeof signingKey.public_key !== 'string' || !signingKey.public_key.includes('BEGIN PUBLIC KEY')) failGatewayState('PUBLIC_KEY_INVALID');
  if (typeof signingKey.private_key !== 'string' || !signingKey.private_key.includes('BEGIN PRIVATE KEY')) failGatewayState('PRIVATE_KEY_INVALID');
  try {
    const probe = { schema: GATEWAY_STATE_SCHEMA, key_id: signingKey.key_id };
    const signature = signPayload(probe, signingKey.private_key);
    if (!verifySignature(probe, signature, signingKey.public_key)) failGatewayState('SIGNING_KEYPAIR_MISMATCH');
  } catch (error) {
    if (error instanceof TypeError && error.message.startsWith('gateway state invalid:')) throw error;
    failGatewayState('SIGNING_KEY_INVALID');
  }
}

function validateGatewaySiemEvents(events) {
  if (!Array.isArray(events)) failGatewayState('SIEM_EVENTS_ARRAY_REQUIRED');
  for (const event of events) {
    if (!isPlainRecord(event)) failGatewayState('SIEM_EVENT_NOT_OBJECT');
    assertSnapshotKeys(event, new Set([
      'schema',
      'event_id',
      'emitted_at',
      'tenant_id',
      'gateway_id',
      'policy_id',
      'policy_hash',
      'decision_id',
      'decision',
      'allowed',
      'reason_codes',
      'operation_hash',
      'memory_addr_hash',
      'active_root',
      'key_evidence_hash',
      'provider_hash',
      'model_hash',
      'region_hash',
      'purpose_hash',
      'sensitivity_hash',
    ]), 'SIEM_EVENT');
    if (eventHasPlaintext(event) || containsPlaintextMemory(event)) failGatewayState('SIEM_EVENT_PLAINTEXT_FORBIDDEN');
  }
}

export function serializeGatewayState(state) {
  if (!isPlainRecord(state)) failGatewayState('STATE_NOT_OBJECT');
  const policyValidation = validateGatewayPolicy(state.policy);
  if (!policyValidation.ok) failGatewayState(`POLICY_INVALID:${policyValidation.errors.join(',')}`);
  const signingKeyPair = state.signingKeyPair;
  const signingKey = {
    alg: signingKeyPair?.alg ?? 'Ed25519',
    key_id: signingKeyPair?.key_id,
    public_key: signingKeyPair?.publicKey,
    private_key: signingKeyPair?.privateKey,
  };
  validateGatewaySigningKey(signingKey);
  validateGatewaySiemEvents(state.siem_events);
  const snapshot = {
    schema: GATEWAY_STATE_SCHEMA,
    version: GATEWAY_STATE_VERSION,
    gateway_id: state.gateway_id,
    active_root: state.active_root,
    policy: state.policy,
    signing_key: signingKey,
    siem_events: state.siem_events.map((event) => ({ ...event })),
    expose_internal: state.expose_internal === true,
    generated_at: new Date().toISOString(),
  };
  validateGatewayStateSnapshot(snapshot);
  return snapshot;
}

export function hydrateGatewayState(snapshot, options = {}) {
  try {
    const parsed = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot;
    validateGatewayStateSnapshot(parsed);
    return createGatewayState({
      gateway_id: parsed.gateway_id,
      active_root: parsed.active_root,
      policy: parsed.policy,
      signingKeyPair: {
        alg: parsed.signing_key.alg,
        key_id: parsed.signing_key.key_id,
        signer: { key_id: parsed.signing_key.key_id, alg: parsed.signing_key.alg },
        publicKey: parsed.signing_key.public_key,
        privateKey: parsed.signing_key.private_key,
      },
      siem_events: parsed.siem_events.map((event) => ({ ...event })),
      expose_internal: parsed.expose_internal === true || options.exposeInternal === true || options.expose_internal === true,
      body_limit: options.body_limit ?? options.bodyLimit,
    });
  } catch (error) {
    if (options.allowDemoReset === true || options.allow_demo_reset === true) {
      return createGatewayState(options.resetOptions ?? {});
    }
    throw error;
  }
}

export function loadGatewayStateFromFile(path, options = {}) {
  try {
    return hydrateGatewayState(readFileSync(path, 'utf8'), options);
  } catch (error) {
    if (options.allowDemoReset === true || options.allow_demo_reset === true) {
      return createGatewayState(options.resetOptions ?? {});
    }
    throw error;
  }
}

export function saveGatewayStateToFile(state, path) {
  const snapshot = serializeGatewayState(state);
  writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  return snapshot;
}

export function createGatewayState(options = {}) {
  const policy = options.policy ?? defaultPolicy(options.policyOptions ?? options);
  const validation = validateGatewayPolicy(policy);
  if (!validation.ok) {
    throw new TypeError(`gateway policy invalid: ${validation.errors.join(',')}`);
  }
  const state = {
    gateway_id: options.gateway_id ?? options.gatewayId ?? DEFAULT_GATEWAY_ID,
    active_root: options.active_root ?? options.activeRoot ?? DEFAULT_ACTIVE_ROOT,
    policy,
    signingKeyPair: options.signingKeyPair ?? generateSigningKeyPair({ key_id: options.key_id ?? options.keyId ?? 'gateway-local-signing-key' }),
    siem_events: Array.isArray(options.siem_events ?? options.siemEvents) ? [...(options.siem_events ?? options.siemEvents)] : [],
    body_limit: Number.isInteger(options.body_limit ?? options.bodyLimit) ? (options.body_limit ?? options.bodyLimit) : DEFAULT_BODY_LIMIT,
    expose_internal: options.exposeInternal === true || options.expose_internal === true,
  };
  Object.defineProperties(state, {
    mode: {
      value: firstDefined(readinessModeFromOptions(options), 'local'),
      writable: true,
      configurable: true
    },
    production_readiness: {
      value: gatewayProductionReadinessFromOptions(options),
      writable: true,
      configurable: true
    }
  });
  return state;
}

function gatewayResponse(status, body, response) {
  const result = { status, headers: JSON_HEADERS, body };
  if (response !== undefined) {
    response.writeHead(status, JSON_HEADERS);
    response.end(JSON.stringify(body));
  }
  return result;
}

async function readJsonBody(request, limit) {
  if (Object.prototype.hasOwnProperty.call(request, 'body')) {
    if (typeof request.body === 'string') return request.body.length === 0 ? {} : JSON.parse(request.body);
    if (Buffer.isBuffer(request.body)) return request.body.byteLength === 0 ? {} : JSON.parse(request.body.toString('utf8'));
    return request.body;
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.byteLength;
    if (total > limit) {
      const error = new Error('REQUEST_BODY_TOO_LARGE');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (total === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function routePath(request) {
  return new URL(request.url ?? '/', 'http://enigma.local').pathname;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizedBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (!nonEmptyString(value)) return undefined;
  switch (value.trim().toLowerCase()) {
    case '1':
    case 'true':
    case 'yes':
    case 'y':
    case 'on':
    case 'enabled':
    case 'required':
    case 'require':
      return true;
    case '0':
    case 'false':
    case 'no':
    case 'n':
    case 'off':
    case 'disabled':
      return false;
    default:
      return undefined;
  }
}

function envValue(...keys) {
  const env = globalThis.process?.env;
  if (!isPlainRecord(env)) return undefined;
  for (const key of keys) {
    const value = env[key];
    if (nonEmptyString(value)) return value;
  }
  return undefined;
}

function envBoolean(...keys) {
  const env = globalThis.process?.env;
  if (!isPlainRecord(env)) return undefined;
  for (const key of keys) {
    const value = normalizedBoolean(env[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function envProductionModeFallback() {
  const nodeEnv = envValue('NODE_ENV');
  return nonEmptyString(nodeEnv) && nodeEnv.trim().toLowerCase() === 'production' ? 'production' : undefined;
}

function readinessFailClosedFromOptions(options) {
  return normalizedBoolean(firstDefined(
    options.readinessFailClosed,
    options.readiness_fail_closed,
    options.failClosed,
    options.fail_closed,
    envBoolean('ENIGMA_READINESS_FAIL_CLOSED', 'ENIGMA_DISABLE_LOCAL_DEMO_FALLBACK')
  ));
}

function readinessModeFromOptions(options) {
  return firstDefined(
    options.mode,
    options.environment,
    options.readinessMode,
    options.readiness_mode,
    envValue('ENIGMA_BACKEND_MODE'),
    readinessFailClosedFromOptions(options) === true ? 'production' : undefined,
    envProductionModeFallback()
  );
}

function productionLikeFromOptions(options) {
  return options.production === true
    || options.productionLike === true
    || options.production_like === true
    || options.hosted === true
    || options.byoc === true
    || readinessFailClosedFromOptions(options) === true;
}

function optionValue(record, ...keys) {
  if (!isPlainRecord(record)) return undefined;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) return record[key];
  }
  return undefined;
}

function readinessRecord(state) {
  const readiness = optionValue(state, 'production_readiness', 'productionReadiness', 'readiness');
  return isPlainRecord(readiness) ? readiness : {};
}

function readinessValue(state, ...keys) {
  const direct = optionValue(state, ...keys);
  if (direct !== undefined) return direct;
  return optionValue(readinessRecord(state), ...keys);
}

function sharedProductionDependencyRefsFromOptions(options) {
  const refs = {};
  for (const key of SHARED_PRODUCTION_DEPENDENCY_KEYS) {
    const aliases = SHARED_PRODUCTION_DEPENDENCY_ALIASES[key];
    refs[key] = firstDefined(
      ...aliases.options.map((name) => options[name]),
      envValue(...aliases.env)
    );
  }
  return refs;
}

function productionDependencyValue(state, key) {
  const aliases = SHARED_PRODUCTION_DEPENDENCY_ALIASES[key];
  return readinessValue(state, key, ...aliases.options);
}

function productionDependencyConfigured(state, key) {
  return hasConfiguredReference(productionDependencyValue(state, key));
}

function normalizedReadinessMode(state) {
  const mode = readinessValue(state, 'mode', 'environment', 'readinessMode', 'readiness_mode');
  return nonEmptyString(mode) ? mode.trim().toLowerCase() : 'local';
}

function isProductionLikeState(state) {
  const mode = normalizedReadinessMode(state);
  return PRODUCTION_READINESS_MODES.has(mode)
    || readinessValue(state, 'production', 'production_like', 'productionLike', 'hosted', 'byoc') === true;
}

function isLocalReadinessMode(state) {
  return LOCAL_READINESS_MODES.has(normalizedReadinessMode(state));
}

function readinessKind(value) {
  if (nonEmptyString(value)) return value.trim().toLowerCase();
  if (!isPlainRecord(value)) return undefined;
  const kind = firstDefined(value.kind, value.type, value.backend, value.driver, value.provider);
  return nonEmptyString(kind) ? kind.trim().toLowerCase() : undefined;
}

function hasConfiguredReference(value) {
  if (value === true) return true;
  if (nonEmptyString(value)) return true;
  if (!isPlainRecord(value)) return false;
  if (value.configured === true || value.enabled === true || value.ready === true) return true;
  return ['ref', 'reference', 'id', 'name', 'uri', 'url', 'arn', 'path', 'target', 'sink', 'key_ref', 'keyRef', 'resource'].some((key) => nonEmptyString(value[key]));
}

function gatewayAuthHash(state, kind) {
  if (kind === 'admin') {
    return normalizeSha256Digest(readinessValue(state, 'admin_auth_bearer_sha256', 'adminAuthBearerSha256', 'admin_bearer_sha256', 'adminBearerSha256'));
  }
  return normalizeSha256Digest(readinessValue(state, 'data_plane_auth_bearer_sha256', 'dataPlaneAuthBearerSha256', 'data_plane_bearer_sha256', 'dataPlaneBearerSha256'));
}

function authorizeGatewayRoute(state, request, kind) {
  if (!isProductionLikeState(state)) return { ok: true };
  const expected = gatewayAuthHash(state, kind);
  if (!expected) {
    return {
      ok: false,
      status: 503,
      code: 'GATEWAY_AUTH_NOT_CONFIGURED',
      reason_codes: [`${kind.toUpperCase()}_AUTH_NOT_CONFIGURED`],
    };
  }
  const token = bearerTokenFromRequest(request);
  if (!nonEmptyString(token)) {
    return {
      ok: false,
      status: 401,
      code: 'GATEWAY_AUTH_REQUIRED',
      reason_codes: [`${kind.toUpperCase()}_AUTH_REQUIRED`],
    };
  }
  if (bearerTokenHash(token) !== expected) {
    return {
      ok: false,
      status: 403,
      code: 'GATEWAY_AUTH_DENIED',
      reason_codes: [`${kind.toUpperCase()}_AUTH_DENIED`],
    };
  }
  return { ok: true };
}

function gatewayAuthResponse(auth, response) {
  return gatewayResponse(auth.status, {
    ok: false,
    error: {
      code: auth.code,
      reason_codes: auth.reason_codes,
    },
  }, response);
}

function hasDurableStorage(value) {
  if (value === true) return true;
  const kind = readinessKind(value);
  if (kind !== undefined) {
    if (LOCAL_STORAGE_KINDS.has(kind)) return false;
    if (DURABLE_STORAGE_KINDS.has(kind)) return true;
  }
  if (nonEmptyString(value)) return !LOCAL_STORAGE_KINDS.has(value.trim().toLowerCase());
  if (!isPlainRecord(value)) return false;
  if (value.durable === true || value.production === true) return true;
  if (value.in_memory === true || value.inMemory === true || value.local === true || value.demo === true) return false;
  return hasConfiguredReference(value);
}

function operatorAcceptanceIsGo(value) {
  if (nonEmptyString(value)) return value.trim().toLowerCase() === 'go';
  if (!isPlainRecord(value)) return false;
  return operatorAcceptanceIsGo(firstDefined(value.status, value.decision, value.state, value.operator_acceptance, value.operatorAcceptance));
}

function unauthenticatedLocalDemoEnabled(state) {
  return state.allowUnauthenticated === true
    || state.allow_unauthenticated === true
    || readinessValue(state, 'unauthenticated_local_demo', 'unauthenticatedLocalDemo') === true;
}

function gatewayProductionReadinessFromOptions(options) {
  return {
    mode: readinessModeFromOptions(options),
    production_like: productionLikeFromOptions(options),
    backend_host: firstDefined(
      options.backend_host,
      options.backendHost,
      options.backend_host_ref,
      options.backendHostRef,
      options.host_ref,
      options.hostRef,
      options.deployment_ref,
      options.deploymentRef,
      envValue('ENIGMA_BACKEND_HOST_REF', 'ENIGMA_GATEWAY_BACKEND_HOST_REF', 'ENIGMA_GATEWAY_DEPLOYMENT_REF')
    ),
    dns_tls: firstDefined(
      options.dns_tls,
      options.dnsTls,
      options.dns_tls_ref,
      options.dnsTlsRef,
      options.tls_ref,
      options.tlsRef,
      envValue('ENIGMA_DNS_TLS_REF', 'ENIGMA_GATEWAY_DNS_TLS_REF', 'ENIGMA_TLS_REF')
    ),
    durable_storage: firstDefined(
      options.durable_storage,
      options.durableStorage,
      options.storage,
      options.storage_ref,
      options.storageRef,
      options.state_backend,
      options.stateBackend,
      options.persistence,
      options.persistence_backend,
      options.persistenceBackend,
      envValue('ENIGMA_EXTERNAL_STORAGE_DSN', 'ENIGMA_EXTERNAL_STORAGE_DSN_FILE', 'ENIGMA_EXTERNAL_STORAGE_REF', 'ENIGMA_GATEWAY_STORAGE_REF', 'ENIGMA_DURABLE_STORAGE_REF', 'ENIGMA_GATEWAY_STATE_BACKEND')
    ),
    kms_or_secret_custody: firstDefined(
      options.kms_or_secret_custody,
      options.kmsOrSecretCustody,
      options.kms,
      options.kms_ref,
      options.kmsRef,
      options.signer_ref,
      options.signerRef,
      options.signing_key_ref,
      options.signingKeyRef,
      options.kmsKeyRef,
      options.kms_key_ref,
      envValue('ENIGMA_KMS_KEY_REF', 'ENIGMA_KMS_REF', 'ENIGMA_EXTERNAL_KMS_REF', 'ENIGMA_GATEWAY_SIGNER_REF')
    ),
    siem_or_log_sink: firstDefined(
      options.siem_or_log_sink,
      options.siemOrLogSink,
      options.siem,
      options.siem_ref,
      options.siemRef,
      options.audit_sink,
      options.auditSink,
      options.log_sink,
      options.logSink,
      envValue('ENIGMA_SIEM_EXPORT_ENDPOINT', 'ENIGMA_SIEM_EXPORT_ENDPOINT_FILE', 'ENIGMA_SIEM_REF', 'ENIGMA_AUDIT_SINK_REF', 'ENIGMA_LOG_SINK_REF')
    ),
    backup_restore: firstDefined(
      options.backup_restore,
      options.backupRestore,
      options.backup,
      options.backup_target,
      options.backupTarget,
      options.restore_target,
      options.restoreTarget,
      envValue('ENIGMA_BACKUP_TARGET_URI', 'ENIGMA_BACKUP_TARGET_URI_FILE', 'ENIGMA_BACKUP_TARGET_REF', 'ENIGMA_RESTORE_TARGET_REF')
    ),
    monitoring: firstDefined(
      options.monitoring,
      options.monitoring_ref,
      options.monitoringRef,
      options.alerting,
      options.alerting_ref,
      options.alertingRef,
      envValue('ENIGMA_MONITORING_REF', 'ENIGMA_GATEWAY_MONITORING_REF', 'ENIGMA_ALERTING_REF')
    ),
    admin_auth: firstDefined(
      options.admin_auth,
      options.adminAuth,
      options.admin_auth_ref,
      options.adminAuthRef,
      envValue('ENIGMA_ADMIN_AUTH_REF', 'ENIGMA_GATEWAY_ADMIN_AUTH_REF')
    ),
    data_plane_auth: firstDefined(
      options.data_plane_auth,
      options.dataPlaneAuth,
      options.data_plane_auth_ref,
      options.dataPlaneAuthRef,
      envValue('ENIGMA_DATA_PLANE_AUTH_REF', 'ENIGMA_GATEWAY_DATA_PLANE_AUTH_REF')
    ),
    ...sharedProductionDependencyRefsFromOptions(options),
    durable_storage_configured: hasDurableStorage(firstDefined(
      options.durable_storage_configured,
      options.durableStorageConfigured,
      options.durable_storage,
      options.durableStorage,
      options.storage,
      options.storage_ref,
      options.storageRef,
      options.state_backend,
      options.stateBackend,
      options.persistence,
      options.persistence_backend,
      options.persistenceBackend,
      envValue(
        'ENIGMA_EXTERNAL_STORAGE_DSN',
        'ENIGMA_EXTERNAL_STORAGE_DSN_FILE',
        'ENIGMA_EXTERNAL_STORAGE_REF',
        'ENIGMA_EXTERNAL_STORAGE_REF_FILE',
        'ENIGMA_STORAGE_REF',
        'ENIGMA_STORAGE_REF_FILE',
        'ENIGMA_GATEWAY_STORAGE_REF',
        'ENIGMA_GATEWAY_STORAGE_REF_FILE',
        'ENIGMA_DURABLE_STORAGE_REF',
        'ENIGMA_DURABLE_STORAGE_REF_FILE',
        'ENIGMA_STATE_BACKEND',
        'ENIGMA_GATEWAY_STATE_BACKEND',
        'ENIGMA_PERSISTENCE_BACKEND',
        'ENIGMA_GATEWAY_PERSISTENCE_BACKEND'
      )
    )),
    kms_or_signer_ref_configured: hasConfiguredReference(firstDefined(
      options.kms_or_signer_ref_configured,
      options.kmsOrSignerRefConfigured,
      options.kms,
      options.kms_ref,
      options.kmsRef,
      options.signer_ref,
      options.signerRef,
      options.signing_key_ref,
      options.signingKeyRef,
      options.kmsKeyRef,
      options.kms_key_ref,
      envValue(
        'ENIGMA_KMS_KEY_REF',
        'ENIGMA_KMS_KEY_REF_FILE',
        'ENIGMA_KMS_REF',
        'ENIGMA_KMS_REF_FILE',
        'ENIGMA_EXTERNAL_KMS_REF',
        'ENIGMA_EXTERNAL_KMS_REF_FILE',
        'ENIGMA_GATEWAY_SIGNING_KEY_REF',
        'ENIGMA_GATEWAY_SIGNING_KEY_FILE',
        'ENIGMA_SIGNING_KEY_REF',
        'ENIGMA_SIGNING_KEY_FILE',
        'ENIGMA_SIGNER_REF',
        'ENIGMA_SIGNER_REF_FILE',
        'ENIGMA_GATEWAY_SIGNER_REF',
        'ENIGMA_GATEWAY_SIGNER_REF_FILE'
      )
    )),
    siem_or_audit_configured: hasConfiguredReference(firstDefined(
      options.siem_or_audit_configured,
      options.siemOrAuditConfigured,
      options.siem,
      options.siem_ref,
      options.siemRef,
      options.audit,
      options.audit_sink,
      options.auditSink,
      options.log_sink,
      options.logSink,
      envValue(
        'ENIGMA_SIEM_EXPORT_ENDPOINT',
        'ENIGMA_SIEM_EXPORT_ENDPOINT_FILE',
        'ENIGMA_SIEM_REF',
        'ENIGMA_SIEM_REF_FILE',
        'ENIGMA_AUDIT_SINK_REF',
        'ENIGMA_AUDIT_SINK_REF_FILE',
        'ENIGMA_LOG_SINK_REF',
        'ENIGMA_LOG_SINK_REF_FILE'
      )
    )),
    backup_configured: hasConfiguredReference(firstDefined(
      options.backup_configured,
      options.backupConfigured,
      options.backup,
      options.backup_target,
      options.backupTarget,
      options.restore_target,
      options.restoreTarget,
      envValue(
        'ENIGMA_BACKUP_TARGET_URI',
        'ENIGMA_BACKUP_TARGET_URI_FILE',
        'ENIGMA_BACKUP_TARGET',
        'ENIGMA_BACKUP_TARGET_FILE',
        'ENIGMA_BACKUP_TARGET_REF',
        'ENIGMA_BACKUP_TARGET_REF_FILE',
        'ENIGMA_RESTORE_TARGET_REF',
        'ENIGMA_RESTORE_TARGET_REF_FILE'
      )
    )),
    admin_auth_configured: hasConfiguredReference(firstDefined(
      options.admin_auth_configured,
      options.adminAuthConfigured,
      options.admin_auth,
      options.adminAuth,
      options.admin_auth_ref,
      options.adminAuthRef,
      envValue(
        'ENIGMA_ADMIN_AUTH_REF',
        'ENIGMA_ADMIN_AUTH_REF_FILE',
        'ENIGMA_ADMIN_AUTH',
        'ENIGMA_ADMIN_AUTH_URI',
        'ENIGMA_GATEWAY_ADMIN_AUTH_REF',
        'ENIGMA_GATEWAY_ADMIN_AUTH_REF_FILE',
        'ENIGMA_GATEWAY_ADMIN_AUTH_URI'
      )
    )),
    admin_auth_bearer_sha256: normalizeSha256Digest(firstDefined(
      options.admin_auth_bearer_sha256,
      options.adminAuthBearerSha256,
      options.admin_bearer_sha256,
      options.adminBearerSha256,
      envValue('ENIGMA_GATEWAY_ADMIN_AUTH_BEARER_SHA256', 'ENIGMA_ADMIN_AUTH_BEARER_SHA256')
    )),
    data_plane_auth_configured: hasConfiguredReference(firstDefined(
      options.data_plane_auth_configured,
      options.dataPlaneAuthConfigured,
      options.data_plane_auth,
      options.dataPlaneAuth,
      options.data_plane_auth_ref,
      options.dataPlaneAuthRef,
      envValue(
        'ENIGMA_DATA_PLANE_AUTH_REF',
        'ENIGMA_DATA_PLANE_AUTH_REF_FILE',
        'ENIGMA_DATA_PLANE_AUTH',
        'ENIGMA_DATA_PLANE_AUTH_URI',
        'ENIGMA_GATEWAY_DATA_PLANE_AUTH_REF',
        'ENIGMA_GATEWAY_DATA_PLANE_AUTH_REF_FILE',
        'ENIGMA_GATEWAY_DATA_PLANE_AUTH_URI'
      )
    )),
    data_plane_auth_bearer_sha256: normalizeSha256Digest(firstDefined(
      options.data_plane_auth_bearer_sha256,
      options.dataPlaneAuthBearerSha256,
      options.data_plane_bearer_sha256,
      options.dataPlaneBearerSha256,
      envValue('ENIGMA_GATEWAY_DATA_PLANE_AUTH_BEARER_SHA256', 'ENIGMA_DATA_PLANE_AUTH_BEARER_SHA256')
    )),
    operator_acceptance: firstDefined(
      options.operator_acceptance,
      options.operatorAcceptance,
      options.acceptance,
      options.go_live,
      options.goLive,
      envValue(
        'ENIGMA_OPERATOR_ACCEPTANCE',
        'ENIGMA_OPERATOR_ACCEPTANCE_DECISION',
        'ENIGMA_GO_LIVE_DECISION',
        'ENIGMA_GO_LIVE'
      )
    ),
    state_backend: firstDefined(
      options.state_backend,
      options.stateBackend,
      options.persistence,
      options.persistence_backend,
      options.persistenceBackend,
      envValue(
        'ENIGMA_STATE_BACKEND',
        'ENIGMA_GATEWAY_STATE_BACKEND',
        'ENIGMA_PERSISTENCE_BACKEND',
        'ENIGMA_GATEWAY_PERSISTENCE_BACKEND',
        'ENIGMA_EXTERNAL_STORAGE_DSN',
        'ENIGMA_EXTERNAL_STORAGE_DSN_FILE'
      )
    )
  };
}

function gatewayReadinessCheck(check, okValue, missing) {
  const ok = okValue === true;
  return ok ? { check, ok: true } : { check, ok: false, missing };
}

function productionEvidenceRef(key, value, status = 'verified') {
  if (value === undefined || value === null || value === false || value === true) return undefined;
  if (nonEmptyString(value)) return { status, provider: 'operator', ref: value };
  if (!isPlainRecord(value)) return undefined;
  const ref = firstDefined(
    value.ref,
    value.reference,
    value.id,
    value.name,
    value.uri,
    value.url,
    value.arn,
    value.path,
    value.target,
    value.sink,
    value.key_ref,
    value.keyRef,
    value.resource
  );
  if (!nonEmptyString(ref)) return undefined;
  return {
    ...value,
    key,
    ref,
    status: value.status ?? status,
    provider: value.provider ?? 'operator',
  };
}

function gatewayProductionEvidence(state) {
  const evidence = {};
  const add = (key, value, status = 'verified') => {
    const ref = productionEvidenceRef(key, value, status);
    if (ref !== undefined) evidence[key] = ref;
  };
  add('backend_host', readinessValue(state, 'backend_host', 'backendHost', 'backend_host_ref', 'backendHostRef', 'host_ref', 'hostRef', 'deployment_ref', 'deploymentRef'));
  add('dns_tls', readinessValue(state, 'dns_tls', 'dnsTls', 'dns_tls_ref', 'dnsTlsRef', 'tls_ref', 'tlsRef'));
  add('durable_storage', readinessValue(state, 'durable_storage', 'durableStorage', 'storage', 'storage_ref', 'storageRef', 'state_backend', 'stateBackend', 'persistence', 'persistence_backend', 'persistenceBackend'));
  add('kms_or_secret_custody', readinessValue(state, 'kms_or_secret_custody', 'kmsOrSecretCustody', 'kms', 'kms_ref', 'kmsRef', 'signer_ref', 'signerRef', 'signing_key_ref', 'signingKeyRef', 'kms_key_ref', 'kmsKeyRef'));
  add('backup_restore', readinessValue(state, 'backup_restore', 'backupRestore', 'backup', 'backup_target', 'backupTarget', 'restore_target', 'restoreTarget'));
  add('monitoring', readinessValue(state, 'monitoring', 'monitoring_ref', 'monitoringRef', 'alerting', 'alerting_ref', 'alertingRef'));
  add('siem_or_log_sink', readinessValue(state, 'siem_or_log_sink', 'siemOrLogSink', 'siem', 'siem_ref', 'siemRef', 'audit_sink', 'auditSink', 'log_sink', 'logSink'));
  add('operator_acceptance', readinessValue(state, 'operator_acceptance', 'operatorAcceptance', 'acceptance', 'go_live', 'goLive'), 'go');
  add('admin_auth', readinessValue(state, 'admin_auth', 'adminAuth', 'admin_auth_ref', 'adminAuthRef'));
  add('data_plane_auth', readinessValue(state, 'data_plane_auth', 'dataPlaneAuth', 'data_plane_auth_ref', 'dataPlaneAuthRef'));
  for (const key of SHARED_PRODUCTION_DEPENDENCY_KEYS) add(key, productionDependencyValue(state, key));
  try {
    const normalized = normalizeDependencyEvidence(evidence, {
      generated_at: new Date(0).toISOString(),
      required_keys: [
        'backend_host',
        'dns_tls',
        'durable_storage',
        'kms_or_secret_custody',
        'backup_restore',
        'monitoring',
        'siem_or_log_sink',
        'operator_acceptance',
        'admin_auth',
        'data_plane_auth',
        ...SHARED_PRODUCTION_DEPENDENCY_KEYS,
      ],
    });
    return {
      ok: normalized.ok,
      refs: readinessEvidenceRefs(normalized.evidence),
      missing_keys: normalized.missing_keys,
    };
  } catch {
    return {
      ok: false,
      refs: {},
      missing_keys: ['production_dependency_evidence'],
      error: 'production dependency evidence refs are invalid or unsafe',
    };
  }
}

function gatewayStateIsLocalOnly(state, durableStorage) {
  const backend = firstDefined(
    readinessValue(state, 'state_backend', 'stateBackend', 'persistence', 'persistence_backend', 'persistenceBackend'),
    readinessValue(state, 'storage', 'durable_storage', 'durableStorage')
  );
  const kind = readinessKind(backend);
  if (kind !== undefined && LOCAL_STORAGE_KINDS.has(kind)) return true;
  return durableStorage !== true;
}

function gatewayKmsOrSignerRefConfigured(state) {
  const signingKeyPair = isPlainRecord(state.signingKeyPair) ? state.signingKeyPair : {};
  return hasConfiguredReference(firstDefined(
    readinessValue(state, 'kms', 'kms_ref', 'kmsRef', 'kms_key_ref', 'kmsKeyRef', 'signer_ref', 'signerRef', 'signing_key_ref', 'signingKeyRef'),
    readinessValue(state, 'kms_or_signer_ref_configured'),
    optionValue(signingKeyPair, 'kms_ref', 'kmsRef', 'kms_key_ref', 'kmsKeyRef', 'signer_ref', 'signerRef', 'signing_key_ref', 'signingKeyRef')
  ));
}

function gatewayReadiness(state) {
  const productionLike = isProductionLikeState(state);
  const evidence = productionLike ? gatewayProductionEvidence(state) : { ok: true, refs: {}, missing_keys: [] };
  const backendHost = hasConfiguredReference(readinessValue(state, 'backend_host', 'backendHost', 'backend_host_ref', 'backendHostRef', 'host_ref', 'hostRef', 'deployment_ref', 'deploymentRef'));
  const dnsTls = hasConfiguredReference(readinessValue(state, 'dns_tls', 'dnsTls', 'dns_tls_ref', 'dnsTlsRef', 'tls_ref', 'tlsRef'));
  const monitoring = hasConfiguredReference(readinessValue(state, 'monitoring', 'monitoring_ref', 'monitoringRef', 'alerting', 'alerting_ref', 'alertingRef'));
  const durableStorage = hasDurableStorage(firstDefined(
    readinessValue(state, 'durable_storage', 'durableStorage', 'storage', 'storage_ref', 'storageRef'),
    readinessValue(state, 'durable_storage_configured')
  ));
  const kmsOrSigner = gatewayKmsOrSignerRefConfigured(state);
  const siemOrAudit = hasConfiguredReference(firstDefined(
    readinessValue(state, 'siem', 'siem_ref', 'siemRef', 'audit', 'audit_sink', 'auditSink', 'log_sink', 'logSink'),
    readinessValue(state, 'siem_or_audit_configured')
  ));
  const backup = hasConfiguredReference(firstDefined(
    readinessValue(state, 'backup', 'backup_target', 'backupTarget', 'restore_target', 'restoreTarget'),
    readinessValue(state, 'backup_configured')
  ));
  const adminAuth = hasConfiguredReference(firstDefined(
    readinessValue(state, 'admin_auth', 'adminAuth', 'admin_auth_ref', 'adminAuthRef'),
    readinessValue(state, 'admin_auth_configured')
  ));
  const dataPlaneAuth = hasConfiguredReference(firstDefined(
    readinessValue(state, 'data_plane_auth', 'dataPlaneAuth', 'data_plane_auth_ref', 'dataPlaneAuthRef'),
    readinessValue(state, 'data_plane_auth_configured')
  ));
  const operatorAccepted = operatorAcceptanceIsGo(firstDefined(
    readinessValue(state, 'operator_acceptance', 'operatorAcceptance', 'acceptance', 'go_live', 'goLive'),
    readinessValue(state, 'operator_acceptance')
  ));
  const checks = productionLike
    ? [
      gatewayReadinessCheck('expose_internal_disabled', state.expose_internal !== true, 'expose_internal must be false in production readiness'),
      gatewayReadinessCheck('unauthenticated_local_demo_disabled', !unauthenticatedLocalDemoEnabled(state), 'unauthenticated local demo mode must be disabled in production readiness'),
      gatewayReadinessCheck('backend_host', backendHost, 'production backend host reference is not configured'),
      gatewayReadinessCheck('dns_tls', dnsTls, 'production DNS/TLS reference is not configured'),
      gatewayReadinessCheck('state_not_local_in_memory', !gatewayStateIsLocalOnly(state, durableStorage), 'gateway production state is local/in-memory only'),
      gatewayReadinessCheck('admin_auth', adminAuth, 'admin authentication is not configured'),
      gatewayReadinessCheck('data_plane_auth', dataPlaneAuth, 'data-plane authentication is not configured'),
      gatewayReadinessCheck('durable_storage', durableStorage, 'production durable storage is not configured'),
      gatewayReadinessCheck('kms_or_signer_ref', kmsOrSigner, 'production KMS/signer reference is not configured'),
      gatewayReadinessCheck('siem_or_audit_sink', siemOrAudit, 'production SIEM/audit routing is not configured'),
      gatewayReadinessCheck('backup_target', backup, 'production backup/restore target is not configured'),
      gatewayReadinessCheck('monitoring', monitoring, 'production monitoring/alerting reference is not configured'),
      ...SHARED_PRODUCTION_DEPENDENCY_KEYS.map((key) => gatewayReadinessCheck(key, productionDependencyConfigured(state, key), `production ${key.replaceAll('_', ' ')} evidence is not configured`)),
      gatewayReadinessCheck('operator_acceptance', operatorAccepted, 'operator acceptance is not go'),
      gatewayReadinessCheck('production_evidence_refs', evidence.ok, evidence.error ?? 'production dependency evidence refs are incomplete')
    ]
    : [
      gatewayReadinessCheck('non_production_local_mode', isLocalReadinessMode(state), 'gateway readiness is only green for non-production local mode')
    ];
  const missingChecks = checks.filter((check) => check.ok !== true).map((check) => check.check);
  const ready = checks.every((check) => check.ok === true);
  return {
    statusCode: ready ? 200 : 503,
    body: {
      ok: ready,
      service: 'enigma-gateway',
      status: ready ? 'ready' : 'not_ready',
      mode: normalizedReadinessMode(state),
      claim_boundary: 'static distribution may be live; gateway production backend requires private ingress, backend host, DNS/TLS, auth, real storage, KMS/signer, SIEM/audit, backups, monitoring, network policy, KMS custody, tenant policy, usage metering, settlement, public-site security, threat model, legal/compliance, support SLA, incident/restore drills, and operator acceptance',
      checks,
      missing_checks: missingChecks,
      evidence_refs: evidence.refs,
      missing_evidence_refs: evidence.missing_keys
    }
  };
}

export async function handleGatewayRequest(state, request, response = undefined) {
  const method = String(request.method ?? 'GET').toUpperCase();
  const path = routePath(request);

  try {
    if (method === 'GET' && path === '/health') {
      return gatewayResponse(200, {
        ok: true,
        service: 'enigma-gateway',
        gateway_id: state.gateway_id,
        policy_id: state.policy.policy_id,
        policy_hash: state.policy.policy_hash,
      }, response);
    }

    if (method === 'GET' && path === '/livez') {
      return gatewayResponse(200, {
        ok: true,
        service: 'enigma-gateway',
        status: 'live',
        process: { pid: process.pid },
      }, response);
    }

    if (method === 'GET' && path === '/readyz') {
      const readiness = gatewayReadiness(state);
      return gatewayResponse(readiness.statusCode, readiness.body, response);
    }

    if (method === 'GET' && path === '/policy') {
      const auth = authorizeGatewayRoute(state, request, 'admin');
      if (!auth.ok) return gatewayAuthResponse(auth, response);
      return gatewayResponse(200, { ok: true, policy: publicGatewayPolicy(state), internal: state.expose_internal === true }, response);
    }

    if (method === 'PUT' && path === '/policy') {
      const auth = authorizeGatewayRoute(state, request, 'admin');
      if (!auth.ok) return gatewayAuthResponse(auth, response);
      const body = await readJsonBody(request, state.body_limit);
      const nextPolicy = isPlainRecord(body?.policy) ? body.policy : body;
      const validation = validateGatewayPolicy(nextPolicy);
      if (!validation.ok) {
        return gatewayResponse(400, { ok: false, error: { code: 'POLICY_INVALID', reason_codes: validation.errors } }, response);
      }
      state.policy = nextPolicy;
      return gatewayResponse(200, { ok: true, policy: publicGatewayPolicy(state), policy_hash: state.policy.policy_hash, internal: state.expose_internal === true }, response);
    }

    if (method === 'POST' && path === '/gateway/evaluate') {
      const auth = authorizeGatewayRoute(state, request, 'data_plane');
      if (!auth.ok) return gatewayAuthResponse(auth, response);
      const body = await readJsonBody(request, state.body_limit);
      const normalized = normalizeGatewayRequest(body);
      if (!normalized.ok) {
        return gatewayResponse(normalized.status, { ok: false, error: { code: 'REQUEST_INVALID', reason_codes: normalized.errors } }, response);
      }
      const evaluation = evaluateEnterprisePolicy(state.policy, normalized.request);
      const siem_event = siemEventForEvaluation(state, evaluation);
      return gatewayResponse(200, { ok: true, evaluation: publicGatewayEvaluation(state, evaluation), siem_event }, response);
    }

    if (method === 'POST' && path === '/gateway/decision') {
      const auth = authorizeGatewayRoute(state, request, 'data_plane');
      if (!auth.ok) return gatewayAuthResponse(auth, response);
      const body = await readJsonBody(request, state.body_limit);
      const normalized = normalizeGatewayRequest(body);
      if (!normalized.ok) {
        return gatewayResponse(normalized.status, { ok: false, error: { code: 'REQUEST_INVALID', reason_codes: normalized.errors } }, response);
      }
      const evaluation = evaluateEnterprisePolicy(state.policy, normalized.request);
      const decision = createDecisionForRequest(state, normalized.request, evaluation);
      const verification = verifyGatewayDecision({ decision, policy: state.policy, publicKey: state.signingKeyPair.publicKey });
      const siem_event = siemEventForDecision(state, decision);
      return gatewayResponse(200, { ok: true, evaluation: publicGatewayEvaluation(state, evaluation), decision, verification, siem_event }, response);
    }

    if (method === 'GET' && path === '/siem/export') {
      const auth = authorizeGatewayRoute(state, request, 'admin');
      if (!auth.ok) return gatewayAuthResponse(auth, response);
      return gatewayResponse(200, {
        ok: true,
        schema: GATEWAY_EXPORT_SCHEMA,
        gateway_id: state.gateway_id,
        event_count: state.siem_events.length,
        events: state.siem_events,
      }, response);
    }

    return gatewayResponse(404, { ok: false, error: { code: 'PATH_DENIED', reason_codes: ['UNKNOWN_PATH_DENIED'] } }, response);
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : error instanceof SyntaxError ? 400 : 500;
    const code = error instanceof SyntaxError ? 'JSON_INVALID' : error.message === 'REQUEST_BODY_TOO_LARGE' ? 'REQUEST_BODY_TOO_LARGE' : 'GATEWAY_ERROR';
    return gatewayResponse(status, { ok: false, error: { code } }, response);
  }
}

export function createGatewayServer(options = {}) {
  const state = options.state ?? createGatewayState(options);
  const server = createServer((request, response) => {
    void handleGatewayRequest(state, request, response);
  });
  server.gatewayState = state;
  return server;
}

export function runGatewayDemo() {
  const state = createGatewayState({ gateway_id: 'gateway_demo' });
  const allowRequest = {
    schema: GATEWAY_REQUEST_SCHEMA,
    operation: 'retrieve',
    provider: 'kimi',
    model: 'kimi-k2',
    region: 'us-east-1',
    purpose: 'support_retrieval',
    sensitivity: 'internal',
    memory_addr: 'addr_demo_committed_memory',
    memory_id: 'mem_allowed',
    subject_id: 'employee_123',
  };
  const allowRetrieval = evaluateEnterprisePolicy(state.policy, allowRequest);
  const denyDisallowedRegion = evaluateEnterprisePolicy(state.policy, { ...allowRequest, region: 'ap-south-1' });
  const denyLegalHoldDelete = evaluateEnterprisePolicy(state.policy, {
    ...allowRequest,
    operation: 'delete',
    memory_id: 'mem_legal_hold',
  });
  const decision = createDecisionForRequest(state, allowRequest, allowRetrieval);
  const verification = verifyGatewayDecision({ decision, policy: state.policy, publicKey: state.signingKeyPair.publicKey });
  const siemEvent = siemEventForDecision(state, createDecisionForRequest(state, { ...allowRequest, region: 'ap-south-1' }, denyDisallowedRegion));
  const siemMinimized = !eventHasPlaintext(siemEvent);
  const ok = allowRetrieval.allowed === true
    && denyDisallowedRegion.allowed === false
    && denyDisallowedRegion.reason_codes.includes('REGION_DENIED')
    && denyLegalHoldDelete.allowed === false
    && denyLegalHoldDelete.reason_codes.includes('LEGAL_HOLD_DELETE_DENIED')
    && verification.ok === true
    && siemMinimized === true;

  return {
    ok,
    allowed_retrieval: allowRetrieval.allowed === true,
    denied_disallowed_region: denyDisallowedRegion.allowed === false && denyDisallowedRegion.reason_codes.includes('REGION_DENIED'),
    denied_legal_hold_delete: denyLegalHoldDelete.allowed === false && denyLegalHoldDelete.reason_codes.includes('LEGAL_HOLD_DELETE_DENIED'),
    signed_decision_verification_ok: verification.ok === true,
    siem_event_plaintext_minimized: siemMinimized,
    signed_decision_verification: verification,
    policy: state.policy,
    evaluations: {
      allow_retrieval: allowRetrieval,
      deny_disallowed_region: denyDisallowedRegion,
      deny_legal_hold_delete: denyLegalHoldDelete,
    },
    allow_retrieval: allowRetrieval,
    deny_disallowed_region: denyDisallowedRegion,
    deny_legal_hold_delete: denyLegalHoldDelete,
    decision,
    gateway_decision: decision,
    siem_export: {
      ok: true,
      schema: GATEWAY_EXPORT_SCHEMA,
      gateway_id: state.gateway_id,
      event_count: state.siem_events.length,
      events: state.siem_events,
    },
    verification,
    siem_event: siemEvent,
  };
}

export default {
  createGatewayState,
  createGatewayServer,
  handleGatewayRequest,
  serializeGatewayState,
  hydrateGatewayState,
  loadGatewayStateFromFile,
  saveGatewayStateToFile,
  runGatewayDemo,
};
