export const PRODUCTION_DEPENDENCY_EVIDENCE_SCHEMA = 'enigma.production_dependency_evidence.v1';

export const PRODUCTION_DEPENDENCY_KEYS = Object.freeze([
  'backend_host',
  'dns_tls',
  'durable_storage',
  'kms_or_secret_custody',
  'backup_restore',
  'monitoring',
  'siem_or_log_sink',
  'operator_acceptance',
  'runtime_auth',
  'admin_auth',
  'data_plane_auth',
  'network_access_policy',
  'kms_custody',
  'tenant_policy_approval',
  'usage_metering',
  'service_settlement',
  'monitoring_alerting',
  'public_site_security',
  'security_threat_model',
  'legal_compliance_approval',
  'support_sla',
  'incident_drill',
  'backup_restore_drill',
]);

export const HOSTED_READINESS_REQUIRED_DEPENDENCIES = Object.freeze([
  'backend_host',
  'dns_tls',
  'durable_storage',
  'kms_or_secret_custody',
  'backup_restore',
  'monitoring',
  'siem_or_log_sink',
  'operator_acceptance',
  'runtime_auth',
  'network_access_policy',
  'kms_custody',
  'tenant_policy_approval',
  'usage_metering',
  'service_settlement',
  'monitoring_alerting',
  'public_site_security',
  'security_threat_model',
  'legal_compliance_approval',
  'support_sla',
  'incident_drill',
  'backup_restore_drill',
]);
const KEY_SET = new Set(PRODUCTION_DEPENDENCY_KEYS);
const SAFE_STATUS = new Set(['declared', 'observed', 'verified', 'go']);
const SECRET_FIELD_RE = /(?:password|passwd|pwd|token|api[_-]?key|private[_-]?key|client[_-]?secret|raw[_-]?memory|plaintext|plain[_-]?text|prompt|completion|transcript|cookie|session)/iu;
const SECRET_VALUE_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{16,})/u;
const URL_WITH_CREDENTIALS_RE = /^[a-z][a-z0-9+.-]*:\/\/[^\s/@]+:[^\s/@]+@/iu;
const RAW_MEMORY_VALUE_RE = /(?:raw memory|private prompt|full transcript|decrypted capsule|customer note|launch-code phrase)/iu;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertDependencyKey(key) {
  if (!KEY_SET.has(key)) throw new Error(`Unknown production dependency key: ${key}`);
}

function assertSafeString(value, path) {
  if (typeof value !== 'string') return;
  if (SECRET_VALUE_RE.test(value)) throw new Error(`Production evidence ${path} appears to contain a secret.`);
  if (URL_WITH_CREDENTIALS_RE.test(value)) throw new Error(`Production evidence ${path} must not contain URL credentials.`);
  if (RAW_MEMORY_VALUE_RE.test(value)) throw new Error(`Production evidence ${path} appears to contain raw memory.`);
}

export function assertNoSecretEvidence(value, path = 'evidence') {
  if (typeof value === 'string') {
    assertSafeString(value, path);
    return true;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecretEvidence(item, `${path}[${index}]`));
    return true;
  }
  if (!isPlainObject(value)) return true;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (SECRET_FIELD_RE.test(key)) throw new Error(`Production evidence ${childPath} uses a forbidden secret/plaintext field name.`);
    assertNoSecretEvidence(child, childPath);
  }
  return true;
}

function safeString(value, field, maxLength = 512) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new Error(`${field} must be a string.`);
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error(`${field} must be non-empty.`);
  if (trimmed.length > maxLength) throw new Error(`${field} is too long for public readiness evidence.`);
  assertSafeString(trimmed, field);
  return trimmed;
}

function safeMetadata(metadata) {
  if (metadata === undefined || metadata === null) return {};
  if (!isPlainObject(metadata)) throw new Error('metadata must be an object when provided.');
  assertNoSecretEvidence(metadata, 'metadata');
  const out = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!/^[a-z][a-z0-9_.-]{0,63}$/iu.test(key)) throw new Error(`metadata key ${key} is not safe for public evidence.`);
    if (typeof value === 'string') out[key] = safeString(value, `metadata.${key}`, 256);
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    else if (typeof value === 'boolean') out[key] = value;
    else if (Array.isArray(value) && value.every((item) => typeof item === 'string')) out[key] = value.map((item, index) => safeString(item, `metadata.${key}[${index}]`, 128));
    else throw new Error(`metadata.${key} must be a primitive public value.`);
  }
  return out;
}

export function normalizeEvidenceRef(input, options = {}) {
  const key = options.key ?? input?.key;
  assertDependencyKey(key);
  const source = typeof input === 'string' ? { ref: input } : input;
  if (!isPlainObject(source)) throw new Error(`Production dependency ${key} evidence must be a string or object.`);
  assertNoSecretEvidence(source, key);
  const status = source.status ?? options.status ?? 'declared';
  if (!SAFE_STATUS.has(status)) throw new Error(`Production dependency ${key} status is unsupported.`);
  const ref = safeString(source.ref ?? source.arn ?? source.url ?? source.id, `${key}.ref`);
  const provider = safeString(source.provider ?? options.provider ?? 'operator', `${key}.provider`, 80);
  const observedAt = safeString(source.observed_at ?? source.observedAt ?? options.observed_at ?? options.observedAt ?? new Date(0).toISOString(), `${key}.observed_at`, 64);
  if (Number.isNaN(Date.parse(observedAt))) throw new Error(`Production dependency ${key} observed_at must be an ISO timestamp.`);
  return Object.freeze({
    key,
    status,
    provider,
    ref,
    observed_at: observedAt,
    metadata: safeMetadata(source.metadata),
  });
}

export function normalizeDependencyEvidence(evidence = {}, options = {}) {
  if (!isPlainObject(evidence)) throw new Error('Production dependency evidence must be an object.');
  const normalized = {};
  for (const key of Object.keys(evidence).sort()) {
    assertDependencyKey(key);
    normalized[key] = normalizeEvidenceRef(evidence[key], { key, observed_at: options.observed_at ?? options.observedAt });
  }
  const requiredKeys = options.required_keys ?? options.requiredKeys ?? HOSTED_READINESS_REQUIRED_DEPENDENCIES;
  const missing_keys = missingProductionDependencies(normalized, requiredKeys);
  return Object.freeze({
    schema: PRODUCTION_DEPENDENCY_EVIDENCE_SCHEMA,
    generated_at: safeString(options.generated_at ?? options.generatedAt ?? new Date(0).toISOString(), 'generated_at', 64),
    ok: missing_keys.length === 0,
    evidence: Object.freeze(normalized),
    missing_keys: Object.freeze(missing_keys),
    claim_boundary: Object.freeze([
      'Production dependency evidence is public-safe reference material only.',
      'It is not secret custody, backup restore, monitoring delivery, operator acceptance, or hosted readiness by itself.',
      'hosted_live_ready remains false until runtime probes and operator acceptance also pass.',
    ]),
  });
}

export function missingProductionDependencies(evidence = {}, requiredKeys = HOSTED_READINESS_REQUIRED_DEPENDENCIES) {
  if (!isPlainObject(evidence)) throw new Error('evidence must be an object.');
  const missing = [];
  for (const key of requiredKeys) {
    assertDependencyKey(key);
    const item = evidence[key];
    if (!item || item.status === 'declared') missing.push(key);
  }
  return missing;
}

export function readinessEvidenceRefs(evidence = {}) {
  if (!isPlainObject(evidence)) throw new Error('evidence must be an object.');
  const refs = {};
  for (const key of Object.keys(evidence).sort()) {
    const normalized = normalizeEvidenceRef(evidence[key], { key });
    refs[key] = normalized.ref;
  }
  assertNoSecretEvidence(refs, 'readiness_refs');
  return Object.freeze(refs);
}
