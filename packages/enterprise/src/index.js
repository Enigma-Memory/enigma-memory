import { createPublicKey, randomUUID } from 'node:crypto';
import {
  createMemoryAddress,
  generateSigningKeyPair,
  sha256Hex,
  signPayload,
  verifySignature,
} from '../../core/src/index.js';

const POLICY_SCHEMA = 'enigma.enterprise_policy.v1';
const EVALUATION_SCHEMA = 'enigma.enterprise_policy_evaluation.v1';
const GATEWAY_DECISION_SCHEMA = 'enigma.gateway_decision.v1';
const SIEM_EVENT_SCHEMA = 'enigma.enterprise_siem_event.v1';
const DEFAULT_CREATED_AT = '1970-01-01T00:00:00.000Z';
const DEFAULT_ACTIVE_ROOT = `sha256:${sha256Hex('enigma.enterprise.empty_active_root.v1')}`;
const SHA256_PREFIX = 'sha256:';

function isPlainRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nowIso(now) {
  if (now instanceof Date) return now.toISOString();
  if (typeof now === 'string') return new Date(now).toISOString();
  return new Date().toISOString();
}

function uniqueStrings(value) {
  const input = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  return [...new Set(input.map((item) => String(item)).filter((item) => item.length > 0))].sort();
}

function positiveInteger(value, fallback) {
  const number = Number(value ?? fallback);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function stableStringify(value) {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('stable JSON cannot encode non-finite numbers');
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  if (isPlainRecord(value)) {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  throw new TypeError(`stable JSON cannot encode ${typeof value}`);
}

function hashValue(value) {
  return `${SHA256_PREFIX}${sha256Hex(typeof value === 'string' ? value : stableStringify(value))}`;
}

function keyIdFromPublicKey(publicKey) {
  return `ed25519:${sha256Hex(publicKey).slice(0, 32)}`;
}

function publicKeyFromPrivateKey(privateKey) {
  return createPublicKey(privateKey).export({ type: 'spki', format: 'pem' });
}

function withoutUndefinedFields(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function normalizeKms(options = {}) {
  const kms = options.kms ?? options.kmsMetadata ?? {};
  return withoutUndefinedFields({
    provider: kms.provider ?? options.kms_provider ?? options.kmsProvider ?? 'customer_kms',
    key_id: kms.key_id ?? kms.keyId ?? options.kms_key_id ?? options.kmsKeyId,
    key_version: kms.key_version ?? kms.keyVersion ?? options.kms_key_version ?? options.kmsKeyVersion,
    region: kms.region ?? options.kms_region ?? options.kmsRegion,
    evidence_hash: kms.evidence_hash ?? kms.evidenceHash ?? (kms.evidence ? hashValue(kms.evidence) : undefined),
  });
}

function normalizeLegalHolds(value) {
  const holds = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  return holds
    .map((hold, index) => {
      if (typeof hold === 'string') {
        return {
          hold_id: `hold_${String(index + 1).padStart(3, '0')}`,
          memory_addr: hold,
          status: 'active',
        };
      }
      if (!isPlainRecord(hold)) return undefined;
      return withoutUndefinedFields({
        hold_id: String(hold.hold_id ?? hold.holdId ?? `hold_${String(index + 1).padStart(3, '0')}`),
        memory_addr: hold.memory_addr ?? hold.memoryAddr,
        memory_id: hold.memory_id ?? hold.memoryId,
        subject_id: hold.subject_id ?? hold.subjectId,
        scope_hash: hold.scope_hash ?? hold.scopeHash ?? (hold.scope ? hashValue(hold.scope) : undefined),
        reason_code: hold.reason_code ?? hold.reasonCode,
        status: hold.status ?? (hold.active === false ? 'released' : 'active'),
      });
    })
    .filter(Boolean)
    .sort((left, right) => stableStringify(left).localeCompare(stableStringify(right)));
}

function policyForHash(policy) {
  const { policy_hash, policyHash, ...rest } = policy ?? {};
  return rest;
}

function hashPolicy(policy) {
  if (!isPlainRecord(policy)) return hashValue({ schema: POLICY_SCHEMA, invalid: true });
  return hashValue(policyForHash(policy));
}

function includes(list, value) {
  return list.includes(String(value ?? ''));
}

function activeLegalHoldMatches(hold, request) {
  if (hold.status && hold.status !== 'active') return false;
  const memoryAddr = request.memory_addr ?? request.memoryAddr;
  const memoryId = request.memory_id ?? request.memoryId;
  const subjectId = request.subject_id ?? request.subjectId;
  if (hold.memory_addr && memoryAddr && hold.memory_addr === memoryAddr) return true;
  if (hold.memory_id && memoryId && hold.memory_id === memoryId) return true;
  if (hold.subject_id && subjectId && hold.subject_id === subjectId) return true;
  return false;
}

function sanitizeKeyEvidence(value = {}) {
  const evidence = value.key_evidence ?? value.keyEvidence ?? value;
  if (!isPlainRecord(evidence)) return {};
  return withoutUndefinedFields({
    provider: evidence.provider,
    key_id: evidence.key_id ?? evidence.keyId,
    key_version: evidence.key_version ?? evidence.keyVersion,
    region: evidence.region,
    evidence_hash: evidence.evidence_hash ?? evidence.evidenceHash ?? (evidence.evidence ? hashValue(evidence.evidence) : undefined),
  });
}

function unsignedGatewayDecision(decision) {
  const { signature, signer, public_key, publicKey, verification_key, verificationKey, ...unsigned } = decision;
  return unsigned;
}

function requestFromArgs(args = {}) {
  return withoutUndefinedFields({
    ...(isPlainRecord(args.request) ? args.request : {}),
    operation: args.operation ?? args.request?.operation,
    provider: args.provider ?? args.request?.provider,
    model: args.model ?? args.request?.model,
    region: args.region ?? args.request?.region,
    purpose: args.purpose ?? args.request?.purpose,
    sensitivity: args.sensitivity ?? args.request?.sensitivity,
    memory_addr: args.memory_addr ?? args.memoryAddr ?? args.request?.memory_addr ?? args.request?.memoryAddr,
    memory_id: args.memory_id ?? args.memoryId ?? args.request?.memory_id ?? args.request?.memoryId,
    subject_id: args.subject_id ?? args.subjectId ?? args.request?.subject_id ?? args.request?.subjectId,
    legal_hold_delete: args.legal_hold_delete ?? args.legalHoldDelete ?? args.request?.legal_hold_delete ?? args.request?.legalHoldDelete,
  });
}

export function createEnterprisePolicy(options = {}) {
  const createdAt = options.created_at ?? options.createdAt ?? nowIso(options.now ?? DEFAULT_CREATED_AT);
  const policy = {
    schema: POLICY_SCHEMA,
    policy_id: options.policy_id ?? options.policyId ?? `policy_${randomUUID()}`,
    tenant_id: options.tenant_id ?? options.tenantId ?? 'tenant_local',
    mode: options.mode ?? 'byoc',
    created_at: createdAt,
    updated_at: options.updated_at ?? options.updatedAt ?? createdAt,
    default_action: 'deny_unknown',
    public_proof: options.public_proof ?? options.publicProof ?? 'hash_only',
    allowed_operations: uniqueStrings(options.allowed_operations ?? options.allowedOperations ?? ['retrieve', 'remember', 'write', 'delete']),
    allowed_providers: uniqueStrings(options.allowed_providers ?? options.allowedProviders),
    allowed_models: uniqueStrings(options.allowed_models ?? options.allowedModels),
    allowed_regions: uniqueStrings(options.allowed_regions ?? options.allowedRegions),
    denied_sensitivities: uniqueStrings(options.denied_sensitivities ?? options.sensitivity_deny_list ?? options.deniedSensitivities ?? options.sensitivityDenyList),
    allowed_purposes: uniqueStrings(options.allowed_purposes ?? options.purpose_allow_list ?? options.allowedPurposes ?? options.purposeAllowList),
    legal_holds: normalizeLegalHolds(options.legal_holds ?? options.legalHolds),
    retention_days: positiveInteger(options.retention_days ?? options.retentionDays, 365),
    kms: normalizeKms(options),
    provider_native_memory: 'cache_only',
  };
  return { ...policy, policy_hash: hashPolicy(policy) };
}

export function evaluateEnterprisePolicy(policy, request = {}) {
  const evaluatedAt = nowIso(request.now);
  const reasonCodes = [];

  if (!isPlainRecord(policy) || policy.schema !== POLICY_SCHEMA) {
    return {
      schema: EVALUATION_SCHEMA,
      allowed: false,
      allow: false,
      decision: 'deny',
      reason_codes: ['POLICY_INVALID'],
      policy_hash: hashPolicy(policy),
      evaluated_at: evaluatedAt,
    };
  }

  const allowedOperations = uniqueStrings(policy.allowed_operations ?? policy.allowedOperations);
  const allowedProviders = uniqueStrings(policy.allowed_providers ?? policy.allowedProviders);
  const allowedModels = uniqueStrings(policy.allowed_models ?? policy.allowedModels);
  const allowedRegions = uniqueStrings(policy.allowed_regions ?? policy.allowedRegions);
  const allowedPurposes = uniqueStrings(policy.allowed_purposes ?? policy.allowedPurposes);
  const deniedSensitivities = uniqueStrings(policy.denied_sensitivities ?? policy.sensitivity_deny_list ?? policy.deniedSensitivities ?? policy.sensitivityDenyList);
  const legalHolds = normalizeLegalHolds(policy.legal_holds ?? policy.legalHolds);

  const operation = request.operation === undefined || request.operation === null || request.operation === '' ? undefined : String(request.operation);
  const provider = request.provider;
  const model = request.model;
  const region = request.region;
  const purpose = request.purpose;
  const sensitivity = request.sensitivity;

  if (!operation) reasonCodes.push('OPERATION_UNKNOWN');
  else if (allowedOperations.length === 0 || !includes(allowedOperations, operation)) reasonCodes.push('OPERATION_DENIED');
  if (!provider) reasonCodes.push('PROVIDER_UNKNOWN');
  else if (allowedProviders.length === 0 || !includes(allowedProviders, provider)) reasonCodes.push('PROVIDER_DENIED');

  if (!model) reasonCodes.push('MODEL_UNKNOWN');
  else if (allowedModels.length === 0 || !includes(allowedModels, model)) reasonCodes.push('MODEL_DENIED');

  if (!region) reasonCodes.push('REGION_UNKNOWN');
  else if (allowedRegions.length === 0 || !includes(allowedRegions, region)) reasonCodes.push('REGION_DENIED');

  if (!purpose) reasonCodes.push('PURPOSE_UNKNOWN');
  else if (allowedPurposes.length === 0 || !includes(allowedPurposes, purpose)) reasonCodes.push('PURPOSE_DENIED');

  if (!sensitivity) reasonCodes.push('SENSITIVITY_UNKNOWN');
  else if (includes(deniedSensitivities, sensitivity)) reasonCodes.push('SENSITIVITY_DENIED');

  if ((operation === 'delete' || request.legal_hold_delete === true || request.legalHoldDelete === true) && legalHolds.some((hold) => activeLegalHoldMatches(hold, request))) {
    reasonCodes.push('LEGAL_HOLD_DELETE_DENIED');
  } else if (request.legal_hold_delete === true || request.legalHoldDelete === true) {
    reasonCodes.push('LEGAL_HOLD_DELETE_DENIED');
  }

  const allowed = reasonCodes.length === 0;
  const decision = allowed ? 'allow' : 'deny';
  const memoryAddr = request.memory_addr ?? request.memoryAddr;
  return withoutUndefinedFields({
    schema: EVALUATION_SCHEMA,
    allowed,
    allow: allowed,
    decision,
    reason_codes: allowed ? ['ALLOW'] : reasonCodes,
    policy_id: policy.policy_id,
    policy_hash: hashPolicy(policy),
    evaluated_at: evaluatedAt,
    operation,
    provider,
    model,
    region,
    purpose,
    sensitivity,
    memory_addr_hash: memoryAddr ? hashValue(memoryAddr) : undefined,
  });
}

export function minimizeEnterpriseEvaluation(evaluation = {}) {
  return withoutUndefinedFields({
    schema: evaluation.schema,
    allowed: evaluation.allowed,
    allow: evaluation.allow,
    decision: evaluation.decision,
    reason_codes: evaluation.reason_codes,
    policy_id: evaluation.policy_id,
    policy_hash: evaluation.policy_hash,
    evaluated_at: evaluation.evaluated_at,
    memory_addr_hash: evaluation.memory_addr_hash,
    operation_hash: evaluation.operation_hash ?? (evaluation.operation ? hashValue(evaluation.operation) : undefined),
    provider_hash: evaluation.provider_hash ?? (evaluation.provider ? hashValue(evaluation.provider) : undefined),
    model_hash: evaluation.model_hash ?? (evaluation.model ? hashValue(evaluation.model) : undefined),
    region_hash: evaluation.region_hash ?? (evaluation.region ? hashValue(evaluation.region) : undefined),
    purpose_hash: evaluation.purpose_hash ?? (evaluation.purpose ? hashValue(evaluation.purpose) : undefined),
    sensitivity_hash: evaluation.sensitivity_hash ?? (evaluation.sensitivity ? hashValue(evaluation.sensitivity) : undefined),
  });
}

export function minimizeEnterprisePolicy(policy = {}) {
  return {
    schema: policy.schema,
    policy_id: policy.policy_id,
    tenant_id: policy.tenant_id,
    mode: policy.mode,
    default_action: policy.default_action,
    provider_native_memory: policy.provider_native_memory,
    public_proof: policy.public_proof,
    policy_hash: policy.policy_hash,
    created_at: policy.created_at,
    updated_at: policy.updated_at,
    retention_days: policy.retention_days,
    constraints: {
      allowed_operations: Array.isArray(policy.allowed_operations) ? policy.allowed_operations.length : 0,
      allowed_providers: Array.isArray(policy.allowed_providers) ? policy.allowed_providers.length : 0,
      allowed_models: Array.isArray(policy.allowed_models) ? policy.allowed_models.length : 0,
      allowed_regions: Array.isArray(policy.allowed_regions) ? policy.allowed_regions.length : 0,
      allowed_purposes: Array.isArray(policy.allowed_purposes) ? policy.allowed_purposes.length : 0,
      denied_sensitivities: Array.isArray(policy.denied_sensitivities) ? policy.denied_sensitivities.length : 0,
      legal_holds: Array.isArray(policy.legal_holds) ? policy.legal_holds.length : 0,
    },
    kms_hash: hashValue(policy.kms ?? {}),
  };
}

export function createGatewayDecision(args = {}) {
  if (!isPlainRecord(args.policy)) throw new TypeError('createGatewayDecision requires policy');
  const request = requestFromArgs(args);
  const evaluation = args.evaluation ?? evaluateEnterprisePolicy(args.policy, request);
  const keyPair = args.signingKeyPair ?? args.keyPair ?? (args.privateKey ? undefined : generateSigningKeyPair({ key_id: args.key_id ?? args.keyId }));
  const privateKey = args.privateKey ?? keyPair?.privateKey;
  if (!privateKey) throw new TypeError('createGatewayDecision requires privateKey or signingKeyPair');
  const publicKey = args.publicKey ?? args.public_key ?? keyPair?.publicKey ?? publicKeyFromPrivateKey(privateKey);
  const signer = args.signer ?? keyPair?.signer ?? { key_id: args.key_id ?? args.keyId ?? keyIdFromPublicKey(publicKey), alg: 'Ed25519' };
  const memoryAddr = request.memory_addr ?? request.memoryAddr;
  const issuedAt = args.issued_at ?? args.issuedAt ?? nowIso(args.now);
  const keyEvidence = sanitizeKeyEvidence(args.key_evidence ?? args.keyEvidence ?? args.policy.kms);
  const policyHash = hashPolicy(args.policy);
  const operation = evaluation.operation ?? request.operation;
  const provider = request.provider ?? evaluation.provider;
  const model = request.model ?? evaluation.model;
  const region = request.region ?? evaluation.region;
  const purpose = request.purpose ?? evaluation.purpose;
  const sensitivity = request.sensitivity ?? evaluation.sensitivity;
  const unsigned = withoutUndefinedFields({
    schema: GATEWAY_DECISION_SCHEMA,
    decision_id: args.decision_id ?? args.decisionId ?? `gwd_${randomUUID()}`,
    issued_at: issuedAt,
    gateway_id: args.gateway_id ?? args.gatewayId ?? 'gateway_local',
    tenant_id: args.policy.tenant_id,
    policy_id: args.policy.policy_id,
    policy_hash: policyHash,
    memory_addr_hash: memoryAddr ? hashValue(memoryAddr) : undefined,
    operation_hash: operation ? hashValue(operation) : undefined,
    provider_hash: provider ? hashValue(provider) : undefined,
    model_hash: model ? hashValue(model) : undefined,
    region_hash: region ? hashValue(region) : undefined,
    purpose_hash: purpose ? hashValue(purpose) : undefined,
    sensitivity_hash: sensitivity ? hashValue(sensitivity) : undefined,
    decision: evaluation.decision,
    allowed: evaluation.allowed,
    reason_codes: evaluation.reason_codes,
    active_root: args.active_root ?? args.activeRoot ?? DEFAULT_ACTIVE_ROOT,
    key_evidence_hash: Object.keys(keyEvidence).length > 0 ? hashValue(keyEvidence) : undefined,
    request_hash: hashValue(request),
    evaluation_hash: hashValue(evaluation),
  });
  return {
    ...unsigned,
    signer: { key_id: signer.key_id, alg: signer.alg ?? 'Ed25519' },
    signature: {
      alg: 'Ed25519',
      key_id: signer.key_id,
      value: signPayload(stableStringify(unsigned), privateKey),
    },
    public_key: publicKey,
  };
}

export function verifyGatewayDecision(args = {}, maybePolicy, maybePublicKey) {
  const decision = args.schema === GATEWAY_DECISION_SCHEMA ? args : args.decision;
  const policy = maybePolicy ?? args.policy;
  const publicKey = maybePublicKey ?? args.trustedPublicKey ?? args.trusted_public_key ?? args.publicKey ?? args.public_key;
  const trustedKeyId = args.trustedKeyId ?? args.trusted_key_id;
  const errors = [];
  if (!isPlainRecord(decision) || decision.schema !== GATEWAY_DECISION_SCHEMA) errors.push('DECISION_INVALID');
  if (isPlainRecord(decision) && decision.policy_hash !== hashPolicy(policy)) errors.push('POLICY_HASH_MISMATCH');
  if (!publicKey) errors.push('TRUSTED_PUBLIC_KEY_REQUIRED');
  if (trustedKeyId !== undefined && decision?.signer?.key_id !== trustedKeyId) errors.push('TRUSTED_KEY_ID_MISMATCH');
  const signature = decision?.signature?.value ?? decision?.signature;
  if (!signature) errors.push('SIGNATURE_MISSING');
  if (errors.length === 0 && !verifySignature(stableStringify(unsignedGatewayDecision(decision)), signature, publicKey)) errors.push('SIGNATURE_INVALID');
  const ok = errors.length === 0;
  return {
    ok,
    valid: ok,
    errors,
    policy_hash: isPlainRecord(policy) ? hashPolicy(policy) : undefined,
    decision_id: decision?.decision_id,
    signer: decision?.signer,
  };
}

export function exportSiemEvent(args = {}) {
  const decision = args.schema === GATEWAY_DECISION_SCHEMA ? args : args.decision;
  const evaluation = args.schema === EVALUATION_SCHEMA ? args : args.evaluation;
  const policy = args.policy;
  const source = decision ?? evaluation ?? {};
  const provider = source.provider ?? args.provider;
  const model = source.model ?? args.model;
  const region = source.region ?? args.region;
  const purpose = source.purpose ?? args.purpose;
  const sensitivity = source.sensitivity ?? args.sensitivity;
  return withoutUndefinedFields({
    schema: SIEM_EVENT_SCHEMA,
    event_id: args.event_id ?? args.eventId ?? `siem_${randomUUID()}`,
    emitted_at: args.emitted_at ?? args.emittedAt ?? nowIso(args.now),
    tenant_id: source.tenant_id ?? policy?.tenant_id,
    gateway_id: source.gateway_id,
    policy_id: source.policy_id ?? policy?.policy_id,
    policy_hash: source.policy_hash ?? (policy ? hashPolicy(policy) : undefined),
    decision_id: source.decision_id,
    decision: source.decision,
    allowed: source.allowed,
    reason_codes: source.reason_codes ?? [],
    operation_hash: source.operation_hash ?? (source.operation ? hashValue(source.operation) : undefined),
    memory_addr_hash: source.memory_addr_hash ?? (source.memory_addr ? hashValue(source.memory_addr) : undefined),
    active_root: source.active_root,
    key_evidence_hash: source.key_evidence_hash ?? (source.key_evidence ? hashValue(source.key_evidence) : undefined),
    provider_hash: source.provider_hash ?? (provider ? hashValue(provider) : undefined),
    model_hash: source.model_hash ?? (model ? hashValue(model) : undefined),
    region_hash: source.region_hash ?? (region ? hashValue(region) : undefined),
    purpose_hash: source.purpose_hash ?? (purpose ? hashValue(purpose) : undefined),
    sensitivity_hash: source.sensitivity_hash ?? (sensitivity ? hashValue(sensitivity) : undefined),
  });
}

export function runEnterpriseDemo(options = {}) {
  const signingKeyPair = generateSigningKeyPair({ key_id: 'enterprise-demo-key' });
  const memoryAddr = createMemoryAddress({
    secret: options.address_key ?? 'enterprise-demo-address-key',
    tenant_id: 'tenant_acme',
    subject_id: 'employee_123',
    value: 'enterprise-demo-source-object',
  });
  const activeRoot = hashValue(['active', memoryAddr]);
  const policy = createEnterprisePolicy({
    policy_id: 'policy_acme_prod',
    tenant_id: 'tenant_acme',
    mode: 'byoc',
    allowed_providers: ['anthropic', 'kimi'],
    allowed_models: ['claude-3-5-sonnet', 'kimi-k2'],
    allowed_regions: ['eu-central-1', 'us-east-1'],
    allowed_purposes: ['agent_context', 'support_retrieval'],
    denied_sensitivities: ['restricted', 'secret'],
    legal_holds: [memoryAddr],
    retention_days: 365,
    kms: {
      provider: 'aws_kms',
      key_id: 'arn:aws:kms:us-east-1:111122223333:key/demo',
      key_version: 'k-17',
      region: 'us-east-1',
    },
    now: DEFAULT_CREATED_AT,
  });
  const baseRequest = {
    operation: 'retrieve',
    provider: 'anthropic',
    model: 'claude-3-5-sonnet',
    region: 'us-east-1',
    purpose: 'support_retrieval',
    sensitivity: 'internal',
    memory_addr: memoryAddr,
  };
  const allowRetrieval = evaluateEnterprisePolicy(policy, baseRequest);
  const denyDisallowedRegion = evaluateEnterprisePolicy(policy, { ...baseRequest, region: 'ap-south-1' });
  const denyLegalHoldDelete = evaluateEnterprisePolicy(policy, { ...baseRequest, operation: 'delete' });
  const gatewayDecision = createGatewayDecision({
    policy,
    request: baseRequest,
    evaluation: allowRetrieval,
    active_root: activeRoot,
    signingKeyPair,
  });
  const verification = verifyGatewayDecision({ decision: gatewayDecision, policy, publicKey: signingKeyPair.publicKey });
  const siemEvent = exportSiemEvent({
    policy,
    decision: createGatewayDecision({
      policy,
      request: { ...baseRequest, region: 'ap-south-1' },
      evaluation: denyDisallowedRegion,
      active_root: activeRoot,
      signingKeyPair,
    }),
  });
  return {
    policy,
    allow_retrieval: allowRetrieval,
    deny_disallowed_region: denyDisallowedRegion,
    deny_legal_hold_delete: denyLegalHoldDelete,
    siem_event: siemEvent,
    gateway_decision: gatewayDecision,
    verification,
  };
}

export default {
  createEnterprisePolicy,
  evaluateEnterprisePolicy,
  createGatewayDecision,
  verifyGatewayDecision,
  minimizeEnterpriseEvaluation,
  minimizeEnterprisePolicy,
  exportSiemEvent,
  runEnterpriseDemo,
};
