import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import {
  EMPTY_MERKLE_ROOT,
  canonicalize,
  generateSigningKeyPair,
  sha256Hex,
  signPayload,
  verifySignature
} from '../../../packages/core/src/index.js';
import {
  createMeshNode,
  createRelayStore,
  createWitnessCheckpoint,
  pushRelayRecord,
  pullRelayRecord,
  verifyWitnessCheckpoint
} from '../../../packages/mesh/src/index.js';
import {
  normalizeDependencyEvidence,
  readinessEvidenceRefs,
} from '../../../packages/adapters/src/index.js';

const SERVICE_SCHEMA = 'enigma.relay_service.v1';
const PAIRING_CHALLENGE_SCHEMA = 'enigma.pairing_challenge.v1';
const PAIRING_COMPLETION_SCHEMA = 'enigma.pairing_completion.v1';
const CLIENT_AUTH_SCHEMA = 'enigma.relay_client_authorization.v1';
const RELAY_STATE_SCHEMA = 'enigma.relay_state.v1';
const RELAY_STATE_VERSION = 1;
const DEFAULT_NOW = '1970-01-01T00:00:00.000Z';
const DEFAULT_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_JSON_BODY_BYTES = 64 * 1024;
const ROOT_RE = /^sha256:[a-f0-9]{64}$/;
const SIGNATURE_ALG = 'Ed25519';
const RELAY_AUTH_MODES = new Set(['paired_client_signature_required', 'unauthenticated_local_demo']);
const LOCAL_READINESS_MODES = new Set(['local', 'demo', 'development', 'test']);
const PRODUCTION_READINESS_MODES = new Set(['production', 'hosted', 'byoc', 'customer_byoc', 'on_prem', 'onprem']);
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
const LOCAL_STORAGE_KINDS = new Set(['memory', 'in_memory', 'in-memory', 'local', 'file', 'state_file', 'state-file', 'json']);
const DURABLE_STORAGE_KINDS = new Set(['postgres', 'postgresql', 'mysql', 'mariadb', 'database', 'dynamodb', 'r2', 's3', 'gcs', 'azure_blob', 'blob', 'kv', 'foundationdb']);
const FORBIDDEN_PLAINTEXT_KEYS = new Set([
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
  'rawbody',
  'requestbody',
  'rawrequestbody',
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
const RELAY_RECORD_KEYS = new Set([
  'record_id',
  'recordId',
  'capsule_id',
  'capsuleId',
  'encrypted_payload_hash',
  'encryptedPayloadHash',
  'payload_hash',
  'payloadHash',
  'opaque_encrypted_record',
  'opaqueEncryptedRecord',
  'encrypted_payload',
  'encryptedPayload',
  'ciphertext',
  'received_at',
  'receivedAt',
  'expires_at',
  'expiresAt'
]);
const WITNESS_CHECKPOINT_KEYS = new Set([
  'subject_node_id',
  'subjectNodeId',
  'subject',
  'epoch',
  'checkpoint_root',
  'checkpointRoot',
  'receipt_log_root',
  'receiptLogRoot',
  'active_set_root',
  'activeSetRoot',
  'active_memory_root',
  'activeMemoryRoot',
  'previous_witness_hash',
  'previousWitnessHash',
  'issued_at',
  'issuedAt'
]);
const PAIRING_CHALLENGE_KEYS = new Set([
  'public_key',
  'publicKey',
  'client_public_key',
  'clientPublicKey',
  'device_public_key',
  'devicePublicKey',
  'account_public_key',
  'accountPublicKey'
]);
const PAIRING_COMPLETE_KEYS = new Set([
  'challenge_id',
  'challengeId',
  'public_key',
  'publicKey',
  'client_public_key',
  'clientPublicKey',
  'signature',
  'client_signature',
  'clientSignature'
]);
const RELAY_STATE_KEYS = new Set([
  'schema',
  'version',
  'generated_at',
  'node',
  'relay_store',
  'relay_records',
  'witness_log',
  'completed_pairings',
  'authorization'
]);
const RELAY_STATE_NODE_KEYS = new Set([
  'schema',
  'node_id',
  'signer',
  'publicKey',
  'privateKey',
  'trust_descriptor',
  'public_descriptor'
]);
const RELAY_STATE_STORE_KEYS = new Set(['schema', 'store_id', 'node_id', 'created_at', 'metadata']);
const RELAY_STATE_STORE_METADATA_KEYS = new Set(['record_count']);
const RELAY_STATE_AUTHORIZATION_KEYS = new Set(['mode', 'allow_unauthenticated']);
const RELAY_STATE_RECORD_KEYS = new Set([
  'schema',
  'record_id',
  'store_id',
  'capsule_id',
  'encrypted_payload_hash',
  'payload_storage',
  'received_at',
  'expires_at',
  'signature'
]);
const RELAY_STATE_PAIRING_KEYS = new Set([
  'schema',
  'pairing_id',
  'challenge_id',
  'relay_node_id',
  'client_public_key',
  'client_public_key_hash',
  'issued_at',
  'signature'
]);
const SIGNATURE_KEYS = new Set(['alg', 'key_id', 'value']);

function isPlainRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeKeyName(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isForbiddenPlaintextKey(key) {
  return FORBIDDEN_PLAINTEXT_KEYS.has(normalizeKeyName(key));
}

function hasPlaintextLookingField(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => hasPlaintextLookingField(item, seen));
  for (const [key, nested] of Object.entries(value)) {
    if (isForbiddenPlaintextKey(key) && nested !== undefined && nested !== null && nested !== '') return true;
    if (hasPlaintextLookingField(nested, seen)) return true;
  }
  return false;
}

function assertNoPlaintextLookingFields(value, context) {
  if (hasPlaintextLookingField(value)) throw new Error(`${context} contains plaintext-looking memory fields`);
}

function assertPlainRecord(value, context) {
  if (!isPlainRecord(value)) throw new TypeError(`${context} must be a JSON object`);
  return value;
}

function assertOnlyKeys(value, allowed, context) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${context} field ${key} is not allowed`);
  }
}

function assertRoot(value, field) {
  if (typeof value !== 'string' || !ROOT_RE.test(value)) throw new TypeError(`${field} must be a sha256 root`);
  return value;
}

function assertString(value, field) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${field} must be a non-empty string`);
  return value;
}

function assertIsoDate(value, field) {
  const string = assertString(value, field);
  if (Number.isNaN(Date.parse(string))) throw new TypeError(`${field} must be an ISO date string`);
  return string;
}

function signaturePayload(record) {
  const { signature, descriptor_hash, capsule_hash, witness_hash, grant_hash, relay_record_id, ...unsigned } = record;
  return unsigned;
}

function cloneJson(value, context) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    throw new TypeError(`${context} must be JSON serializable`);
  }
}

function assertSignature(signature, context) {
  const record = assertPlainRecord(signature, `${context} signature`);
  assertOnlyKeys(record, SIGNATURE_KEYS, `${context} signature`);
  if (record.alg !== SIGNATURE_ALG) throw new Error(`${context} signature algorithm is not supported`);
  assertString(record.key_id, `${context} signature key_id`);
  assertString(record.value, `${context} signature value`);
  return record;
}

function assertSignedBy(record, publicKey, context) {
  assertSignature(record.signature, context);
  if (!verifySignature({ payload: signaturePayload(record), signature: record.signature, publicKey })) {
    throw new Error(`${context} signature mismatch`);
  }
}

function signedRecordHash(record, hashField) {
  const { [hashField]: _ignored, ...signed } = record;
  return hashValue(signed);
}

function nowIso(state) {
  if (typeof state.now === 'function') return state.now();
  if (typeof state.now === 'string') return state.now;
  return new Date().toISOString();
}

function futureIso(baseIso, ttlMs) {
  const baseMs = Date.parse(baseIso);
  const start = Number.isFinite(baseMs) ? baseMs : Date.now();
  return new Date(start + ttlMs).toISOString();
}

function jsonResponse(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body)
  });
  res.end(body);
}

function ok(payload = {}) {
  return { ok: true, ...payload };
}

function fail(message) {
  return { ok: false, error: message };
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

function relayProductionReadinessFromOptions(options) {
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
      envValue('ENIGMA_BACKEND_HOST_REF', 'ENIGMA_RELAY_BACKEND_HOST_REF', 'ENIGMA_RELAY_DEPLOYMENT_REF')
    ),
    dns_tls: firstDefined(
      options.dns_tls,
      options.dnsTls,
      options.dns_tls_ref,
      options.dnsTlsRef,
      options.tls_ref,
      options.tlsRef,
      envValue('ENIGMA_DNS_TLS_REF', 'ENIGMA_RELAY_DNS_TLS_REF', 'ENIGMA_TLS_REF')
    ),
    durable_storage: firstDefined(
      options.durable_storage,
      options.durableStorage,
      options.storage,
      options.storage_ref,
      options.storageRef,
      envValue('ENIGMA_EXTERNAL_STORAGE_DSN', 'ENIGMA_EXTERNAL_STORAGE_DSN_FILE', 'ENIGMA_EXTERNAL_STORAGE_REF', 'ENIGMA_RELAY_STORAGE_REF', 'ENIGMA_DURABLE_STORAGE_REF')
    ),
    kms_or_secret_custody: firstDefined(
      options.kms_or_secret_custody,
      options.kmsOrSecretCustody,
      options.kms,
      options.kms_ref,
      options.kmsRef,
      options.kmsKeyRef,
      options.kms_key_ref,
      options.secrets_manager,
      options.secretsManager,
      envValue('ENIGMA_KMS_KEY_REF', 'ENIGMA_KMS_REF', 'ENIGMA_EXTERNAL_KMS_REF', 'ENIGMA_SECRETS_MANAGER_REF')
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
      envValue('ENIGMA_MONITORING_REF', 'ENIGMA_RELAY_MONITORING_REF', 'ENIGMA_ALERTING_REF')
    ),
    runtime_auth: firstDefined(
      options.runtime_auth,
      options.runtimeAuth,
      options.runtime_auth_ref,
      options.runtimeAuthRef,
      options.paired_client_auth,
      options.pairedClientAuth,
      options.auth_ref,
      options.authRef,
      envValue('ENIGMA_RUNTIME_AUTH_REF', 'ENIGMA_RELAY_RUNTIME_AUTH_REF', 'ENIGMA_PAIRED_CLIENT_AUTH_REF')
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
      envValue(
        'ENIGMA_EXTERNAL_STORAGE_DSN',
        'ENIGMA_EXTERNAL_STORAGE_DSN_FILE',
        'ENIGMA_EXTERNAL_STORAGE_REF',
        'ENIGMA_EXTERNAL_STORAGE_REF_FILE',
        'ENIGMA_STORAGE_REF',
        'ENIGMA_STORAGE_REF_FILE',
        'ENIGMA_RELAY_STORAGE_REF',
        'ENIGMA_RELAY_STORAGE_REF_FILE',
        'ENIGMA_DURABLE_STORAGE_REF',
        'ENIGMA_DURABLE_STORAGE_REF_FILE',
        'ENIGMA_STATE_BACKEND',
        'ENIGMA_RELAY_STATE_BACKEND'
      )
    )),
    kms_configured: hasConfiguredReference(firstDefined(
      options.kms_configured,
      options.kmsConfigured,
      options.kms,
      options.kms_ref,
      options.kmsRef,
      options.kmsKeyRef,
      options.kms_key_ref,
      options.secrets_manager,
      options.secretsManager,
      envValue(
        'ENIGMA_KMS_KEY_REF',
        'ENIGMA_KMS_KEY_REF_FILE',
        'ENIGMA_KMS_REF',
        'ENIGMA_KMS_REF_FILE',
        'ENIGMA_EXTERNAL_KMS_REF',
        'ENIGMA_EXTERNAL_KMS_REF_FILE',
        'ENIGMA_SECRETS_MANAGER_REF',
        'ENIGMA_SECRETS_MANAGER_REF_FILE'
      )
    )),
    siem_configured: hasConfiguredReference(firstDefined(
      options.siem_configured,
      options.siemConfigured,
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
    )
  };
}

function relayReadinessCheck(check, okValue, missing) {
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

function relayProductionEvidence(state) {
  const evidence = {};
  const add = (key, value, status = 'verified') => {
    const ref = productionEvidenceRef(key, value, status);
    if (ref !== undefined) evidence[key] = ref;
  };
  add('backend_host', readinessValue(state, 'backend_host', 'backendHost', 'backend_host_ref', 'backendHostRef', 'host_ref', 'hostRef', 'deployment_ref', 'deploymentRef'));
  add('dns_tls', readinessValue(state, 'dns_tls', 'dnsTls', 'dns_tls_ref', 'dnsTlsRef', 'tls_ref', 'tlsRef'));
  add('durable_storage', readinessValue(state, 'durable_storage', 'durableStorage', 'storage', 'storage_ref', 'storageRef'));
  add('kms_or_secret_custody', readinessValue(state, 'kms_or_secret_custody', 'kmsOrSecretCustody', 'kms', 'kms_ref', 'kmsRef', 'kms_key_ref', 'kmsKeyRef', 'secrets_manager', 'secretsManager'));
  add('backup_restore', readinessValue(state, 'backup_restore', 'backupRestore', 'backup', 'backup_target', 'backupTarget', 'restore_target', 'restoreTarget'));
  add('monitoring', readinessValue(state, 'monitoring', 'monitoring_ref', 'monitoringRef', 'alerting', 'alerting_ref', 'alertingRef'));
  add('siem_or_log_sink', readinessValue(state, 'siem_or_log_sink', 'siemOrLogSink', 'siem', 'siem_ref', 'siemRef', 'audit_sink', 'auditSink', 'log_sink', 'logSink'));
  add('operator_acceptance', readinessValue(state, 'operator_acceptance', 'operatorAcceptance', 'acceptance', 'go_live', 'goLive'), 'go');
  add('runtime_auth', readinessValue(state, 'runtime_auth', 'runtimeAuth', 'runtime_auth_ref', 'runtimeAuthRef', 'paired_client_auth', 'pairedClientAuth', 'auth_ref', 'authRef'));
  for (const key of SHARED_PRODUCTION_DEPENDENCY_KEYS) add(key, productionDependencyValue(state, key));
  try {
    const normalized = normalizeDependencyEvidence(evidence, {
      generated_at: nowIso(state),
      required_keys: [
        'backend_host',
        'dns_tls',
        'durable_storage',
        'kms_or_secret_custody',
        'backup_restore',
        'monitoring',
        'siem_or_log_sink',
        'operator_acceptance',
        'runtime_auth',
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

function relayReadiness(state) {
  const productionLike = isProductionLikeState(state);
  const localMode = isLocalReadinessMode(state);
  const evidence = productionLike ? relayProductionEvidence(state) : { ok: true, refs: {}, missing_keys: [] };
  const backendHost = hasConfiguredReference(readinessValue(state, 'backend_host', 'backendHost', 'backend_host_ref', 'backendHostRef', 'host_ref', 'hostRef', 'deployment_ref', 'deploymentRef'));
  const dnsTls = hasConfiguredReference(readinessValue(state, 'dns_tls', 'dnsTls', 'dns_tls_ref', 'dnsTlsRef', 'tls_ref', 'tlsRef'));
  const monitoring = hasConfiguredReference(readinessValue(state, 'monitoring', 'monitoring_ref', 'monitoringRef', 'alerting', 'alerting_ref', 'alertingRef'));
  const runtimeAuth = hasConfiguredReference(readinessValue(state, 'runtime_auth', 'runtimeAuth', 'runtime_auth_ref', 'runtimeAuthRef', 'paired_client_auth', 'pairedClientAuth', 'auth_ref', 'authRef'));
  const durableStorage = hasDurableStorage(firstDefined(
    readinessValue(state, 'durable_storage', 'durableStorage', 'storage', 'storage_ref', 'storageRef'),
    readinessValue(state, 'durable_storage_configured')
  ));
  const kms = hasConfiguredReference(firstDefined(
    readinessValue(state, 'kms', 'kms_ref', 'kmsRef', 'kms_key_ref', 'kmsKeyRef', 'secrets_manager', 'secretsManager'),
    readinessValue(state, 'kms_configured')
  ));
  const siem = hasConfiguredReference(firstDefined(
    readinessValue(state, 'siem', 'siem_ref', 'siemRef', 'audit', 'audit_sink', 'auditSink', 'log_sink', 'logSink'),
    readinessValue(state, 'siem_configured')
  ));
  const backup = hasConfiguredReference(firstDefined(
    readinessValue(state, 'backup', 'backup_target', 'backupTarget', 'restore_target', 'restoreTarget'),
    readinessValue(state, 'backup_configured')
  ));
  const operatorAccepted = operatorAcceptanceIsGo(firstDefined(
    readinessValue(state, 'operator_acceptance', 'operatorAcceptance', 'acceptance', 'go_live', 'goLive'),
    readinessValue(state, 'operator_acceptance')
  ));
  const checks = productionLike
    ? [
      relayReadinessCheck('paired_client_auth_required', !unauthenticatedLocalDemoEnabled(state), 'unauthenticated local demo auth must be disabled in production readiness'),
      relayReadinessCheck('backend_host', backendHost, 'production backend host reference is not configured'),
      relayReadinessCheck('dns_tls', dnsTls, 'production DNS/TLS reference is not configured'),
      relayReadinessCheck('runtime_auth', runtimeAuth, 'production paired-client/runtime auth evidence is not configured'),
      relayReadinessCheck('durable_storage', durableStorage, 'production durable storage is not configured'),
      relayReadinessCheck('kms_or_secrets_manager', kms, 'production KMS/secrets-manager reference is not configured'),
      relayReadinessCheck('siem_or_audit_sink', siem, 'production SIEM/audit routing is not configured'),
      relayReadinessCheck('backup_target', backup, 'production backup/restore target is not configured'),
      relayReadinessCheck('monitoring', monitoring, 'production monitoring/alerting reference is not configured'),
      ...SHARED_PRODUCTION_DEPENDENCY_KEYS.map((key) => relayReadinessCheck(key, productionDependencyConfigured(state, key), `production ${key.replaceAll('_', ' ')} evidence is not configured`)),
      relayReadinessCheck('operator_acceptance', operatorAccepted, 'operator acceptance is not go'),
      relayReadinessCheck('production_evidence_refs', evidence.ok, evidence.error ?? 'production dependency evidence refs are incomplete')
    ]
    : [
      relayReadinessCheck('non_production_local_mode', localMode, 'relay readiness is only green for non-production local mode')
    ];
  const missingChecks = checks.filter((check) => check.ok !== true).map((check) => check.check);
  const ready = checks.every((check) => check.ok === true);
  return {
    statusCode: ready ? 200 : 503,
    body: {
      ok: ready,
      service: 'enigma-relay',
      status: ready ? 'ready' : 'not_ready',
      mode: normalizedReadinessMode(state),
      claim_boundary: 'static distribution may be live; relay production backend requires backend host, DNS/TLS, runtime auth, real storage, KMS/secrets, SIEM/audit, backups, monitoring, network policy, KMS custody, tenant policy, usage metering, settlement, public-site security, threat model, legal/compliance, support SLA, incident/restore drills, and operator acceptance',
      checks,
      missing_checks: missingChecks,
      evidence_refs: evidence.refs,
      missing_evidence_refs: evidence.missing_keys,
    }
  };
}

async function readJsonBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_JSON_BODY_BYTES) throw new Error('JSON body too large');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString('utf8');
  if (text.trim().length === 0) return {};
  return JSON.parse(text);
}

function publicKeyFromPairingInput(body) {
  const publicKey = body.public_key ?? body.publicKey ?? body.client_public_key ?? body.clientPublicKey ?? body.device_public_key ?? body.devicePublicKey ?? body.account_public_key ?? body.accountPublicKey;
  if (typeof publicKey !== 'string' || publicKey.length === 0) throw new TypeError('public_key is required');
  return publicKey;
}

function relaySignature(state, payload) {
  return {
    alg: 'Ed25519',
    key_id: state.node.signer.key_id,
    value: signPayload({ payload, privateKey: state.node.privateKey })
  };
}

function hashValue(value) {
  return `sha256:${sha256Hex(typeof value === 'string' ? value : canonicalize(value))}`;
}

function headerValue(req, name) {
  const lower = name.toLowerCase();
  const raw = typeof req.getHeader === 'function' ? req.getHeader(name) : (req.headers?.[lower] ?? req.headers?.[name]);
  if (Array.isArray(raw)) return raw[0];
  return raw === undefined ? undefined : String(raw);
}

function sortedQueryEntries(url) {
  return [...url.searchParams.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) =>
    leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue)
  );
}

function relayRequestHash(method, url, body = undefined) {
  const request = {
    method: String(method).toUpperCase(),
    path: url.pathname,
    query: sortedQueryEntries(url)
  };
  if (body !== undefined) request.body = body;
  return hashValue(request);
}

function relayAuthorizationPayload(state, pairingId, operation, requestHash) {
  return {
    schema: CLIENT_AUTH_SCHEMA,
    relay_node_id: state.node.node_id,
    pairing_id: pairingId,
    operation,
    request_hash: requestHash
  };
}

function requireRelayAuthorization(state, req, operation, requestHash) {
  if (state.allowUnauthenticated === true) {
    return {
      mode: 'unauthenticated_local_demo',
      authenticated: false,
      request_hash: requestHash
    };
  }
  const pairingId = headerValue(req, 'x-enigma-pairing-id');
  const signature = headerValue(req, 'x-enigma-client-signature');
  if (!pairingId || !signature) throw new Error('relay client authorization required');
  const pairing = state.pairings.get(pairingId);
  if (pairing === undefined) throw new Error('unknown relay pairing');
  const payload = relayAuthorizationPayload(state, pairingId, operation, requestHash);
  if (!verifySignature({ payload, signature, publicKey: pairing.client_public_key })) {
    throw new Error('relay client authorization signature mismatch');
  }
  return {
    mode: 'paired_client_signature',
    authenticated: true,
    pairing_id: pairingId,
    client_public_key_hash: pairing.client_public_key_hash,
    request_hash: requestHash
  };
}

function normalizeRelayRecordInput(input) {
  const request = assertPlainRecord(input, 'relay request');
  assertNoPlaintextLookingFields(request, 'relay request');
  const hasRecordEnvelope = Object.prototype.hasOwnProperty.call(request, 'record');
  if (hasRecordEnvelope && Object.keys(request).length !== 1) throw new Error('relay request envelope only allows record');
  const body = assertPlainRecord(hasRecordEnvelope ? request.record : request, 'relay record');
  assertOnlyKeys(body, RELAY_RECORD_KEYS, 'relay record');
  return body;
}

function normalizeWitnessInput(input) {
  const request = assertPlainRecord(input, 'witness request');
  assertNoPlaintextLookingFields(request, 'witness request');
  const hasCheckpointEnvelope = Object.prototype.hasOwnProperty.call(request, 'checkpoint');
  if (hasCheckpointEnvelope && Object.keys(request).length !== 1) throw new Error('witness request envelope only allows checkpoint');
  const body = assertPlainRecord(hasCheckpointEnvelope ? request.checkpoint : request, 'witness checkpoint');
  assertOnlyKeys(body, WITNESS_CHECKPOINT_KEYS, 'witness checkpoint');
  const checkpointRoot = body.checkpoint_root ?? body.checkpointRoot;
  const receiptRoot = body.receipt_log_root ?? body.receiptLogRoot;
  const activeRoot = body.active_set_root ?? body.activeSetRoot ?? body.active_memory_root ?? body.activeMemoryRoot;
  if (checkpointRoot !== undefined) assertRoot(checkpointRoot, 'checkpoint_root');
  if (receiptRoot !== undefined) assertRoot(receiptRoot, 'receipt_log_root');
  if (activeRoot !== undefined) assertRoot(activeRoot, 'active_set_root');
  return body;
}

function createPairingChallenge(state, input) {
  const body = assertPlainRecord(input, 'pairing challenge');
  assertNoPlaintextLookingFields(body, 'pairing challenge');
  assertOnlyKeys(body, PAIRING_CHALLENGE_KEYS, 'pairing challenge');
  const clientPublicKey = publicKeyFromPairingInput(body);
  const issuedAt = nowIso(state);
  const nonce = randomBytes(32).toString('base64url');
  const challenge = {
    schema: PAIRING_CHALLENGE_SCHEMA,
    challenge_id: `pch_${sha256Hex(canonicalize({ clientPublicKey, nonce })).slice(0, 32)}`,
    relay_node_id: state.node.node_id,
    client_public_key: clientPublicKey,
    client_public_key_hash: `sha256:${sha256Hex(clientPublicKey)}`,
    nonce,
    issued_at: issuedAt,
    expires_at: futureIso(issuedAt, state.challengeTtlMs)
  };
  const signed = { ...challenge, signature: relaySignature(state, challenge) };
  state.pairingChallenges.set(challenge.challenge_id, Object.freeze({ challenge, publicKey: clientPublicKey }));
  return signed;
}

function completePairing(state, input) {
  const body = assertPlainRecord(input, 'pairing completion');
  assertNoPlaintextLookingFields(body, 'pairing completion');
  assertOnlyKeys(body, PAIRING_COMPLETE_KEYS, 'pairing completion');
  const challengeId = body.challenge_id ?? body.challengeId;
  if (typeof challengeId !== 'string' || challengeId.length === 0) throw new TypeError('challenge_id is required');
  const pending = state.pairingChallenges.get(challengeId);
  if (pending === undefined) throw new Error('unknown pairing challenge');
  if (Date.parse(pending.challenge.expires_at) <= Date.parse(nowIso(state))) throw new Error('pairing challenge expired');
  const publicKey = publicKeyFromPairingInput(body);
  if (publicKey !== pending.publicKey) throw new Error('pairing public key mismatch');
  const signature = body.client_signature ?? body.clientSignature ?? body.signature;
  if (!verifySignature({ payload: pending.challenge, signature, publicKey })) throw new Error('pairing challenge signature mismatch');
  const issuedAt = nowIso(state);
  const pairing = {
    schema: PAIRING_COMPLETION_SCHEMA,
    pairing_id: `pair_${sha256Hex(canonicalize({ challengeId, publicKey, issuedAt })).slice(0, 32)}`,
    challenge_id: challengeId,
    relay_node_id: state.node.node_id,
    client_public_key: publicKey,
    client_public_key_hash: `sha256:${sha256Hex(publicKey)}`,
    issued_at: issuedAt
  };
  const signed = { ...pairing, signature: relaySignature(state, pairing) };
  state.pairings.set(signed.pairing_id, Object.freeze(signed));
  state.pairingChallenges.delete(challengeId);
  return signed;
}

function serviceHealth(state) {
  return {
    schema: SERVICE_SCHEMA,
    node: {
      node_id: state.node.node_id,
      trust_descriptor: state.node.trust_descriptor
    },
    relay: {
      store_id: state.relayStore.store_id,
      records: state.relayStore.records.size
    },
    witness: {
      checkpoints: state.witnessLog.length
    },
    pairing: {
      pending_challenges: state.pairingChallenges.size,
      completed_pairings: state.pairings.size
    },
    authorization: {
      mode: state.allowUnauthenticated === true ? 'unauthenticated_local_demo' : 'paired_client_signature_required',
      endpoints: ['/relay/push', '/relay/pull', '/witness/checkpoint']
    }
  };
}

function relayAuthorizationMode(state) {
  return state.allowUnauthenticated === true ? 'unauthenticated_local_demo' : 'paired_client_signature_required';
}

function serializeNodeState(node) {
  const trustDescriptor = cloneJson(node.trust_descriptor, 'relay node trust descriptor');
  return {
    schema: node.schema,
    node_id: node.node_id,
    signer: cloneJson(node.signer, 'relay node signer'),
    publicKey: node.publicKey,
    privateKey: node.privateKey,
    trust_descriptor: trustDescriptor,
    public_descriptor: cloneJson(node.public_descriptor ?? trustDescriptor, 'relay node public descriptor')
  };
}

function hydrateNodeState(nodeState) {
  const node = assertPlainRecord(cloneJson(nodeState, 'relay node state'), 'relay node state');
  assertNoPlaintextLookingFields(node, 'relay node state');
  assertOnlyKeys(node, RELAY_STATE_NODE_KEYS, 'relay node state');
  if (node.schema !== 'enigma.mesh_node.v1') throw new Error('relay node schema mismatch');
  assertString(node.node_id, 'relay node node_id');
  assertString(node.publicKey, 'relay node publicKey');
  assertString(node.privateKey, 'relay node privateKey');
  const signer = assertPlainRecord(node.signer, 'relay node signer');
  assertOnlyKeys(signer, new Set(['alg', 'key_id']), 'relay node signer');
  if (signer.alg !== SIGNATURE_ALG) throw new Error('relay node signer algorithm is not supported');
  assertString(signer.key_id, 'relay node signer key_id');

  const descriptor = assertPlainRecord(node.trust_descriptor, 'relay node trust descriptor');
  if (descriptor.schema !== 'enigma.mesh_node.v1') throw new Error('relay node trust descriptor schema mismatch');
  if (descriptor.node_id !== node.node_id) throw new Error('relay node trust descriptor node_id mismatch');
  const descriptorKey = assertPlainRecord(descriptor.key, 'relay node trust descriptor key');
  if (descriptorKey.alg !== SIGNATURE_ALG) throw new Error('relay node trust descriptor key algorithm is not supported');
  if (descriptorKey.key_id !== signer.key_id) throw new Error('relay node signer key_id mismatch');
  if (descriptorKey.public_key !== node.publicKey || descriptor.public_key !== node.publicKey) {
    throw new Error('relay node public key mismatch');
  }
  assertSignedBy(descriptor, node.publicKey, 'relay node trust descriptor');
  assertRoot(descriptor.descriptor_hash, 'relay node trust descriptor descriptor_hash');
  if (descriptor.descriptor_hash !== signedRecordHash(descriptor, 'descriptor_hash')) {
    throw new Error('relay node trust descriptor hash mismatch');
  }
  const keyCheckPayload = { schema: RELAY_STATE_SCHEMA, purpose: 'relay_state_key_check' };
  const keyCheckSignature = signPayload({ payload: keyCheckPayload, privateKey: node.privateKey });
  if (!verifySignature({ payload: keyCheckPayload, signature: keyCheckSignature, publicKey: node.publicKey })) {
    throw new Error('relay node signing material mismatch');
  }

  return Object.freeze({
    schema: node.schema,
    node_id: node.node_id,
    signer: Object.freeze({ ...signer }),
    publicKey: node.publicKey,
    privateKey: node.privateKey,
    trust_descriptor: Object.freeze({ ...descriptor }),
    public_descriptor: Object.freeze({ ...(node.public_descriptor ?? descriptor) })
  });
}

function validateRelayRecord(record, relayStore, node) {
  const relayRecord = assertPlainRecord(cloneJson(record, 'relay record state'), 'relay record state');
  assertNoPlaintextLookingFields(relayRecord, 'relay record state');
  assertOnlyKeys(relayRecord, RELAY_STATE_RECORD_KEYS, 'relay record state');
  if (relayRecord.schema !== 'enigma.relay_record.v1') throw new Error('relay record schema mismatch');
  assertString(relayRecord.record_id, 'relay record record_id');
  if (relayRecord.store_id !== relayStore.store_id) throw new Error('relay record store_id mismatch');
  assertRoot(relayRecord.encrypted_payload_hash, 'relay record encrypted_payload_hash');
  if (relayRecord.payload_storage !== 'hash_only') throw new Error('relay record payload_storage must be hash_only');
  assertIsoDate(relayRecord.received_at, 'relay record received_at');
  if (relayRecord.expires_at !== null) assertIsoDate(relayRecord.expires_at, 'relay record expires_at');
  assertSignedBy(relayRecord, node.publicKey, 'relay record');
  return Object.freeze(relayRecord);
}

function validatePairing(pairing, node) {
  const record = assertPlainRecord(cloneJson(pairing, 'completed pairing state'), 'completed pairing state');
  assertNoPlaintextLookingFields(record, 'completed pairing state');
  assertOnlyKeys(record, RELAY_STATE_PAIRING_KEYS, 'completed pairing state');
  if (record.schema !== PAIRING_COMPLETION_SCHEMA) throw new Error('completed pairing schema mismatch');
  assertString(record.pairing_id, 'completed pairing pairing_id');
  assertString(record.challenge_id, 'completed pairing challenge_id');
  if (record.relay_node_id !== node.node_id) throw new Error('completed pairing relay_node_id mismatch');
  assertString(record.client_public_key, 'completed pairing client_public_key');
  if (record.client_public_key_hash !== `sha256:${sha256Hex(record.client_public_key)}`) {
    throw new Error('completed pairing client_public_key_hash mismatch');
  }
  assertIsoDate(record.issued_at, 'completed pairing issued_at');
  assertSignedBy(record, node.publicKey, 'completed pairing');
  return Object.freeze(record);
}

function validateWitnessLog(witnessLog, node) {
  if (!Array.isArray(witnessLog)) throw new TypeError('relay witness_log must be an array');
  const checkpoints = [];
  let previousWitnessHash = EMPTY_MERKLE_ROOT;
  let previousEpoch = -1;
  for (const checkpointState of witnessLog) {
    const checkpoint = assertPlainRecord(cloneJson(checkpointState, 'witness checkpoint state'), 'witness checkpoint state');
    assertNoPlaintextLookingFields(checkpoint, 'witness checkpoint state');
    assertRoot(checkpoint.witness_hash, 'witness checkpoint witness_hash');
    if (checkpoint.witness_hash !== signedRecordHash(checkpoint, 'witness_hash')) {
      throw new Error('witness checkpoint hash mismatch');
    }
    const verification = verifyWitnessCheckpoint(checkpoint, {
      trustDescriptor: node.trust_descriptor,
      expectedWitnessNodeId: node.node_id,
      expectedReceiptLogRoot: checkpoint.receipt_log_root,
      expectedActiveSetRoot: checkpoint.active_set_root,
      expectedCheckpointRoot: checkpoint.checkpoint_root,
      expectedPreviousWitnessHash: previousWitnessHash,
      minimumEpoch: previousEpoch + 1
    });
    if (!verification.ok) throw new Error(`witness checkpoint state invalid: ${verification.errors.join(', ')}`);
    if (checkpoint.epoch <= previousEpoch) throw new Error('witness checkpoint epochs must increase monotonically');
    checkpoints.push(Object.freeze(checkpoint));
    previousEpoch = checkpoint.epoch;
    previousWitnessHash = checkpoint.witness_hash;
  }
  return checkpoints;
}

function hydrateRelayStoreState(storeState, recordsState, node) {
  const store = assertPlainRecord(cloneJson(storeState, 'relay store state'), 'relay store state');
  assertNoPlaintextLookingFields(store, 'relay store state');
  assertOnlyKeys(store, RELAY_STATE_STORE_KEYS, 'relay store state');
  if (store.schema !== 'enigma.relay_store.v1') throw new Error('relay store schema mismatch');
  assertString(store.store_id, 'relay store store_id');
  if (store.node_id !== node.node_id) throw new Error('relay store node_id mismatch');
  assertIsoDate(store.created_at, 'relay store created_at');
  const metadata = assertPlainRecord(store.metadata, 'relay store metadata');
  assertOnlyKeys(metadata, RELAY_STATE_STORE_METADATA_KEYS, 'relay store metadata');
  if (!Number.isInteger(metadata.record_count) || metadata.record_count < 0) {
    throw new TypeError('relay store metadata record_count must be a non-negative integer');
  }
  if (!Array.isArray(recordsState)) throw new TypeError('relay_records must be an array');
  if (recordsState.length !== metadata.record_count) throw new Error('relay record_count mismatch');
  const relayStore = createRelayStore({
    node,
    store_id: store.store_id,
    node_id: store.node_id,
    created_at: store.created_at
  });
  for (const recordState of recordsState) {
    const record = validateRelayRecord(recordState, relayStore, node);
    if (relayStore.records.has(record.record_id)) throw new Error('duplicate relay record_id in state');
    relayStore.records.set(record.record_id, record);
  }
  return relayStore;
}

function authorizationFromSnapshot(authorization) {
  const record = assertPlainRecord(authorization, 'relay authorization state');
  assertOnlyKeys(record, RELAY_STATE_AUTHORIZATION_KEYS, 'relay authorization state');
  if (!RELAY_AUTH_MODES.has(record.mode)) throw new Error('relay authorization mode is not supported');
  if (typeof record.allow_unauthenticated !== 'boolean') {
    throw new TypeError('relay authorization allow_unauthenticated must be boolean');
  }
  const expectedMode = record.allow_unauthenticated ? 'unauthenticated_local_demo' : 'paired_client_signature_required';
  if (record.mode !== expectedMode) throw new Error('relay authorization mode mismatch');
  return record;
}

export function serializeRelayState(state) {
  if (!isPlainRecord(state) || !isPlainRecord(state.node) || !isPlainRecord(state.relayStore)) {
    throw new TypeError('relay state is required');
  }
  const records = [...state.relayStore.records.values()].map((record) => cloneJson(record, 'relay record state'));
  const witnessLog = state.witnessLog.map((checkpoint) => cloneJson(checkpoint, 'witness checkpoint state'));
  const completedPairings = [...state.pairings.values()].map((pairing) => cloneJson(pairing, 'completed pairing state'));
  const snapshot = {
    schema: RELAY_STATE_SCHEMA,
    version: RELAY_STATE_VERSION,
    generated_at: nowIso(state),
    node: serializeNodeState(state.node),
    relay_store: {
      schema: state.relayStore.schema,
      store_id: state.relayStore.store_id,
      node_id: state.relayStore.node_id,
      created_at: state.relayStore.created_at,
      metadata: {
        record_count: records.length
      }
    },
    relay_records: records,
    witness_log: witnessLog,
    completed_pairings: completedPairings,
    authorization: {
      mode: relayAuthorizationMode(state),
      allow_unauthenticated: state.allowUnauthenticated === true
    }
  };
  assertNoPlaintextLookingFields(snapshot, 'relay state snapshot');
  return snapshot;
}

export function hydrateRelayState(snapshot, options = {}) {
  const stateSnapshot = typeof snapshot === 'string' ? JSON.parse(snapshot) : cloneJson(snapshot, 'relay state snapshot');
  const record = assertPlainRecord(stateSnapshot, 'relay state snapshot');
  assertNoPlaintextLookingFields(record, 'relay state snapshot');
  assertOnlyKeys(record, RELAY_STATE_KEYS, 'relay state snapshot');
  if (record.schema !== RELAY_STATE_SCHEMA) throw new Error('relay state schema mismatch');
  if (record.version !== RELAY_STATE_VERSION) throw new Error('relay state version mismatch');
  assertIsoDate(record.generated_at, 'relay state generated_at');

  const authorization = authorizationFromSnapshot(record.authorization);
  const node = hydrateNodeState(record.node);
  const relayStore = hydrateRelayStoreState(record.relay_store, record.relay_records, node);
  const witnessLog = validateWitnessLog(record.witness_log, node);
  if (!Array.isArray(record.completed_pairings)) throw new TypeError('completed_pairings must be an array');
  const pairings = new Map();
  for (const pairingState of record.completed_pairings) {
    const pairing = validatePairing(pairingState, node);
    if (pairings.has(pairing.pairing_id)) throw new Error('duplicate completed pairing_id in state');
    pairings.set(pairing.pairing_id, pairing);
  }

  const state = createRelayState({
    node,
    relayStore,
    witnessLog,
    now: options.now,
    challengeTtlMs: options.challengeTtlMs,
    allowUnauthenticated: authorization.allow_unauthenticated
  });
  state.pairings = pairings;
  state.pairingChallenges = new Map();
  return state;
}

export async function loadRelayStateFromFile(path, options = {}) {
  const filePath = assertString(path, 'relay state file path');
  let text;
  try {
    text = await readFile(filePath, 'utf8');
  } catch (error) {
    throw new Error(`unable to read relay state file: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
  try {
    return hydrateRelayState(JSON.parse(text), options);
  } catch (error) {
    throw new Error(`relay state file rejected: ${error instanceof Error ? error.message : 'invalid state'}`);
  }
}

function retryableRelayRenameError(error) {
  return error?.code === 'EBUSY' || error?.code === 'EPERM' || error?.code === 'EACCES';
}

async function delayRelayRenameRetry(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function renameRelayStateAtomically(tempPath, filePath) {
  const delays = [10, 25, 50, 100, 200];
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      await rename(tempPath, filePath);
      return;
    } catch (error) {
      if (attempt === delays.length || !retryableRelayRenameError(error)) throw error;
      await delayRelayRenameRetry(delays[attempt]);
    }
  }
}

export async function saveRelayStateToFile(state, path) {
  const filePath = assertString(path, 'relay state file path');
  const snapshot = serializeRelayState(state);
  const tempPath = join(dirname(filePath), `.${basename(filePath)}.${randomBytes(6).toString('hex')}.tmp`);
  try {
    await writeFile(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    await renameRelayStateAtomically(tempPath, filePath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
  return snapshot;
}

export function createRelayState(options = {}) {
  const now = options.now ?? options.created_at ?? options.createdAt;
  const node = options.node ?? createMeshNode({
    role: options.role ?? 'relay_witness',
    capabilities: ['relay_store', 'witness_checkpoint', 'pairing_challenge'],
    endpoints: options.endpoints ?? [],
    created_at: typeof now === 'string' ? now : DEFAULT_NOW
  });
  const state = {
    schema: SERVICE_SCHEMA,
    node,
    relayStore: options.relayStore ?? createRelayStore({ node, created_at: typeof now === 'string' ? now : DEFAULT_NOW }),
    witnessLog: Array.isArray(options.witnessLog) ? [...options.witnessLog] : [],
    pairingChallenges: new Map(),
    pairings: new Map(),
    now: options.now,
    challengeTtlMs: options.challengeTtlMs ?? DEFAULT_CHALLENGE_TTL_MS,
    allowUnauthenticated: options.allowUnauthenticated === true || options.allow_unauthenticated === true
  };
  Object.defineProperties(state, {
    mode: {
      value: firstDefined(readinessModeFromOptions(options), 'local'),
      writable: true,
      configurable: true
    },
    production_readiness: {
      value: relayProductionReadinessFromOptions(options),
      writable: true,
      configurable: true
    }
  });
  return state;
}

export function createRelayServer(options = {}) {
  const state = options.state ?? createRelayState(options);
  const server = createServer((req, res) => {
    handleRelayRequest(state, req, res).catch((error) => {
      jsonResponse(res, 500, fail(error instanceof Error ? error.message : 'relay request failed'));
    });
  });
  server.relayState = state;
  return server;
}

export async function handleRelayRequest(state, req, res) {
  const method = req.method ?? 'GET';
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');

  try {
    if (method === 'GET' && url.pathname === '/health') {
      jsonResponse(res, 200, ok({ health: serviceHealth(state) }));
      return;
    }

    if (method === 'GET' && url.pathname === '/livez') {
      jsonResponse(res, 200, ok({
        service: 'enigma-relay',
        status: 'live',
        process: { pid: process.pid }
      }));
      return;
    }

    if (method === 'GET' && url.pathname === '/readyz') {
      const readiness = relayReadiness(state);
      jsonResponse(res, readiness.statusCode, readiness.body);
      return;
    }

    if (method === 'POST' && url.pathname === '/relay/push') {
      const body = await readJsonBody(req);
      const authorization = requireRelayAuthorization(state, req, 'relay.push', relayRequestHash(method, url, body));
      const record = pushRelayRecord(state.relayStore, normalizeRelayRecordInput(body));
      jsonResponse(res, 201, ok({ record, authorization }));
      return;
    }

    if (method === 'GET' && url.pathname === '/relay/pull') {
      const id = url.searchParams.get('id');
      if (id === null || id.length === 0) {
        jsonResponse(res, 400, fail('id is required'));
        return;
      }
      const authorization = requireRelayAuthorization(state, req, 'relay.pull', relayRequestHash(method, url));
      const record = pullRelayRecord(state.relayStore, id);
      if (record === null) {
        jsonResponse(res, 404, fail('relay record not found'));
        return;
      }
      jsonResponse(res, 200, ok({ record, authorization }));
      return;
    }

    if (method === 'POST' && url.pathname === '/witness/checkpoint') {
      const body = await readJsonBody(req);
      const authorization = requireRelayAuthorization(state, req, 'witness.checkpoint', relayRequestHash(method, url, body));
      const witnessBody = normalizeWitnessInput(body);
      const lastCheckpoint = state.witnessLog.at(-1);
      const suppliedEpoch = witnessBody.epoch;
      const epoch = suppliedEpoch === undefined ? (lastCheckpoint ? lastCheckpoint.epoch + 1 : 0) : suppliedEpoch;
      if (lastCheckpoint && (!Number.isInteger(epoch) || epoch <= lastCheckpoint.epoch)) {
        throw new Error('witness epoch must increase monotonically');
      }
      const expectedPreviousWitnessHash = lastCheckpoint?.witness_hash ?? EMPTY_MERKLE_ROOT;
      const suppliedPreviousWitnessHash = witnessBody.previous_witness_hash ?? witnessBody.previousWitnessHash;
      if (suppliedPreviousWitnessHash !== undefined && assertRoot(suppliedPreviousWitnessHash, 'previous_witness_hash') !== expectedPreviousWitnessHash) {
        throw new Error('previous_witness_hash continuity mismatch');
      }
      const checkpoint = createWitnessCheckpoint({
        ...witnessBody,
        node: state.node,
        witness_node_id: state.node.node_id,
        epoch,
        previous_witness_hash: expectedPreviousWitnessHash,
        receipt_log_root: witnessBody.receipt_log_root ?? witnessBody.receiptLogRoot ?? EMPTY_MERKLE_ROOT,
        active_set_root: witnessBody.active_set_root ?? witnessBody.activeSetRoot ?? witnessBody.active_memory_root ?? witnessBody.activeMemoryRoot ?? EMPTY_MERKLE_ROOT,
        issued_at: witnessBody.issued_at ?? witnessBody.issuedAt ?? nowIso(state)
      });
      const verification = verifyWitnessCheckpoint(checkpoint, {
        trustDescriptor: state.node.trust_descriptor,
        expectedWitnessNodeId: state.node.node_id,
        expectedReceiptLogRoot: checkpoint.receipt_log_root,
        expectedActiveSetRoot: checkpoint.active_set_root,
        expectedCheckpointRoot: checkpoint.checkpoint_root,
        expectedPreviousWitnessHash,
        minimumEpoch: epoch
      });
      if (!verification.ok) throw new Error('witness checkpoint verification failed');
      state.witnessLog.push(Object.freeze({ ...checkpoint }));
      jsonResponse(res, 201, ok({ checkpoint, verification, authorization }));
      return;
    }

    if (method === 'GET' && url.pathname === '/witness/log') {
      jsonResponse(res, 200, ok({ checkpoints: state.witnessLog.map((checkpoint) => ({ ...checkpoint })) }));
      return;
    }

    if (method === 'POST' && url.pathname === '/pairing/challenge') {
      const challenge = createPairingChallenge(state, await readJsonBody(req));
      jsonResponse(res, 201, ok({ challenge }));
      return;
    }

    if (method === 'POST' && url.pathname === '/pairing/complete') {
      const pairing = completePairing(state, await readJsonBody(req));
      jsonResponse(res, 201, ok({ pairing }));
      return;
    }

    jsonResponse(res, 404, fail('unknown relay path'));
  } catch (error) {
    jsonResponse(res, 400, fail(error instanceof Error ? error.message : 'bad relay request'));
  }
}

export function runRelayDemo(options = {}) {
  const state = createRelayState({ now: options.now ?? DEFAULT_NOW });
  const opaquePayload = options.opaque_encrypted_record ?? 'age1-encrypted-demo-capsule-only';
  const relayRecord = pushRelayRecord(state.relayStore, normalizeRelayRecordInput({
    capsule_id: 'cap_demo_relay',
    opaque_encrypted_record: opaquePayload,
    received_at: options.now ?? DEFAULT_NOW
  }));
  const pulled = pullRelayRecord(state.relayStore, relayRecord.record_id);

  let rejectedPlaintext = false;
  try {
    pushRelayRecord(state.relayStore, normalizeRelayRecordInput({
      plaintext: 'demo memory must never enter relay custody',
      opaque_encrypted_record: opaquePayload
    }));
  } catch {
    rejectedPlaintext = true;
  }

  const checkpoint = createWitnessCheckpoint({
    node: state.node,
    witness_node_id: state.node.node_id,
    subject_node_id: 'subject:demo',
    receipt_log_root: EMPTY_MERKLE_ROOT,
    active_set_root: EMPTY_MERKLE_ROOT,
    issued_at: options.now ?? DEFAULT_NOW,
    epoch: 1
  });
  const witnessVerification = verifyWitnessCheckpoint(checkpoint, {
    trustDescriptor: state.node.trust_descriptor,
    expectedWitnessNodeId: state.node.node_id,
    expectedReceiptLogRoot: EMPTY_MERKLE_ROOT,
    expectedActiveSetRoot: EMPTY_MERKLE_ROOT,
    expectedCheckpointRoot: checkpoint.checkpoint_root
  });
  state.witnessLog.push(Object.freeze({ ...checkpoint }));

  const client = generateSigningKeyPair();
  const challenge = createPairingChallenge(state, { public_key: client.publicKey });
  const challengePayload = state.pairingChallenges.get(challenge.challenge_id).challenge;
  const clientSignature = {
    alg: 'Ed25519',
    key_id: client.key_id,
    value: signPayload({ payload: challengePayload, privateKey: client.privateKey })
  };
  const pairing = completePairing(state, {
    challenge_id: challenge.challenge_id,
    public_key: client.publicKey,
    signature: clientSignature
  });

  const relayOpaqueOnly = relayRecord.payload_storage === 'hash_only'
    && typeof relayRecord.encrypted_payload_hash === 'string'
    && pulled?.encrypted_payload_hash === relayRecord.encrypted_payload_hash
    && !hasPlaintextLookingField(relayRecord)
    && !Object.prototype.hasOwnProperty.call(relayRecord, 'opaque_encrypted_record')
    && !Object.prototype.hasOwnProperty.call(relayRecord, 'plaintext');
  const pairingChallengeOk = typeof challenge.challenge_id === 'string';
  const pairingOk = pairingChallengeOk
    && typeof pairing.pairing_id === 'string'
    && pairing.challenge_id === challenge.challenge_id;
  const okValue = Boolean(
    relayRecord.record_id
    && pulled?.record_id === relayRecord.record_id
    && relayOpaqueOnly
    && rejectedPlaintext
    && witnessVerification.ok
    && pairingOk
  );

  return {
    ok: okValue,
    pushed_opaque_record: relayOpaqueOnly,
    relay_record_id: relayRecord.record_id,
    rejected_plaintext_record: rejectedPlaintext,
    witness_checkpoint_verification_ok: witnessVerification.ok,
    pairing_challenge_ok: pairingChallengeOk,
    pairing_complete_ok: pairingOk,
    relay: {
      pushed_opaque_record: relayOpaqueOnly,
      record_id: relayRecord.record_id,
      pulled: pulled?.record_id === relayRecord.record_id,
      rejected_plaintext_record: rejectedPlaintext
    },
    witness: {
      checkpoint_verification_ok: witnessVerification.ok,
      witness_checkpoint_id: checkpoint.witness_checkpoint_id,
      witness_hash: checkpoint.witness_hash
    },
    pairing: {
      challenge_ok: pairingChallengeOk,
      complete_ok: pairingOk,
      challenge_id: challenge.challenge_id,
      pairing_id: pairing.pairing_id
    },
    node: {
      node_id: state.node.node_id,
      trust_descriptor: state.node.trust_descriptor
    }
  };
}
