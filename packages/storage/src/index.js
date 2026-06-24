export const PRODUCTION_STORAGE_SCHEMA = 'enigma.production_storage_contract.v1';
export const POSTGRES_MIGRATION_SCHEMA = 'enigma.postgres_migration.v1';
export const PRODUCTION_STORAGE_OPERATION_SCHEMA = 'enigma.production_storage_sql_operation.v1';

export const PRODUCTION_STORAGE_TABLES = Object.freeze([
  'enigma_schema_migrations',
  'relay_records',
  'relay_witness_checkpoints',
  'relay_pairings',
  'gateway_policy_versions',
  'gateway_decisions',
  'gateway_siem_events',
  'readiness_evidence_refs',
]);

const FORBIDDEN_STORAGE_SQL_RE = /\b(prompt|completion|transcript|plaintext|raw_memory|memory_text|decrypted|embedding_vector|provider_response_body|api_key|token|password|private_key)\b/i;
const FORBIDDEN_PUBLIC_VALUE_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@|raw memory|private prompt|full transcript|decrypted capsule)/iu;

function assertNoForbiddenPublicValue(value, path = 'storage') {
  if (typeof value === 'string') {
    if (FORBIDDEN_PUBLIC_VALUE_RE.test(value)) throw new Error(`${path} contains secret or plaintext-looking material`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenPublicValue(item, `${path}[${index}]`));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (/prompt|completion|transcript|plaintext|raw[_-]?memory|memory[_-]?text|decrypted|embedding|provider[_-]?response|api[_-]?key|token|password|private[_-]?key/i.test(key)) {
        throw new Error(`${path}.${key} uses a forbidden storage evidence field`);
      }
      assertNoForbiddenPublicValue(child, `${path}.${key}`);
    }
  }
}

function sql(strings, ...values) {
  let out = '';
  for (let index = 0; index < strings.length; index += 1) {
    out += strings[index];
    if (index < values.length) out += values[index];
  }
  return out.trim();
}

export function postgresProductionSchemaSql(options = {}) {
  const schemaName = options.schema ?? options.schemaName ?? 'enigma';
  if (!/^[a-z_][a-z0-9_]{0,62}$/i.test(schemaName)) throw new Error('schema name must be a safe SQL identifier');
  const q = (name) => `"${schemaName}"."${name}"`;
  const text = sql`
CREATE SCHEMA IF NOT EXISTS "${schemaName}";

CREATE TABLE IF NOT EXISTS ${q('enigma_schema_migrations')} (
  migration_id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now(),
  checksum text NOT NULL CHECK (checksum ~ '^sha256:[a-f0-9]{64}$')
);

CREATE TABLE IF NOT EXISTS ${q('relay_records')} (
  record_id text PRIMARY KEY,
  store_id text NOT NULL,
  capsule_id text NOT NULL,
  encrypted_payload_hash text NOT NULL CHECK (encrypted_payload_hash ~ '^sha256:[a-f0-9]{64}$'),
  payload_storage jsonb NOT NULL,
  received_at timestamptz NOT NULL,
  expires_at timestamptz,
  signature jsonb NOT NULL,
  inserted_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(payload_storage) = 'object'),
  CHECK (jsonb_typeof(signature) = 'object')
);
CREATE INDEX IF NOT EXISTS relay_records_store_received_idx ON ${q('relay_records')} (store_id, received_at DESC);
CREATE INDEX IF NOT EXISTS relay_records_capsule_idx ON ${q('relay_records')} (capsule_id);

CREATE TABLE IF NOT EXISTS ${q('relay_witness_checkpoints')} (
  checkpoint_id text PRIMARY KEY,
  root text NOT NULL CHECK (root ~ '^sha256:[a-f0-9]{64}$'),
  previous_root text CHECK (previous_root ~ '^sha256:[a-f0-9]{64}$'),
  record_count bigint NOT NULL CHECK (record_count >= 0),
  checkpointed_at timestamptz NOT NULL,
  signature jsonb NOT NULL,
  inserted_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(signature) = 'object')
);

CREATE TABLE IF NOT EXISTS ${q('relay_pairings')} (
  pairing_id text PRIMARY KEY,
  challenge_id text NOT NULL,
  relay_node_id text NOT NULL,
  client_public_key_hash text NOT NULL CHECK (client_public_key_hash ~ '^sha256:[a-f0-9]{64}$'),
  issued_at timestamptz NOT NULL,
  signature jsonb NOT NULL,
  inserted_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(signature) = 'object')
);

CREATE TABLE IF NOT EXISTS ${q('gateway_policy_versions')} (
  policy_hash text PRIMARY KEY CHECK (policy_hash ~ '^sha256:[a-f0-9]{64}$'),
  policy jsonb NOT NULL,
  active_from timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  CHECK (jsonb_typeof(policy) = 'object')
);

CREATE TABLE IF NOT EXISTS ${q('gateway_decisions')} (
  decision_id text PRIMARY KEY,
  policy_hash text NOT NULL CHECK (policy_hash ~ '^sha256:[a-f0-9]{64}$'),
  decision_hash text NOT NULL CHECK (decision_hash ~ '^sha256:[a-f0-9]{64}$'),
  decision jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(decision) = 'object')
);
CREATE INDEX IF NOT EXISTS gateway_decisions_policy_idx ON ${q('gateway_decisions')} (policy_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS ${q('gateway_siem_events')} (
  event_id text PRIMARY KEY,
  event_hash text NOT NULL CHECK (event_hash ~ '^sha256:[a-f0-9]{64}$'),
  event jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(event) = 'object')
);

CREATE TABLE IF NOT EXISTS ${q('readiness_evidence_refs')} (
  evidence_key text PRIMARY KEY,
  provider text NOT NULL,
  ref text NOT NULL,
  status text NOT NULL CHECK (status IN ('declared', 'observed', 'verified', 'go')),
  observed_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (jsonb_typeof(metadata) = 'object')
);
`;
  if (FORBIDDEN_STORAGE_SQL_RE.test(text)) throw new Error('Postgres production schema contains forbidden plaintext/secret column names');
  return text;
}

export function buildPostgresMigration(options = {}) {
  const sqlText = postgresProductionSchemaSql(options);
  const migration = {
    schema: POSTGRES_MIGRATION_SCHEMA,
    migration_id: options.migration_id ?? options.migrationId ?? '001_enigma_production_storage',
    engine: 'postgres',
    reversible: false,
    claim_boundary: [
      'This migration defines durable production storage tables only; it does not provision a database or prove hosted readiness.',
      'Tables store hashes, opaque encrypted payload references, minimized decisions, SIEM events, and public-safe readiness refs; raw prompts, transcripts, decrypted memory, provider responses, and secrets are forbidden.',
    ],
    tables: [...PRODUCTION_STORAGE_TABLES],
    sql: sqlText,
  };
  assertNoForbiddenPublicValue(migration, 'migration');
  return migration;
}

export function assertProductionStorageSqlSafe(sqlText) {
  if (typeof sqlText !== 'string' || sqlText.trim().length === 0) throw new Error('SQL text is required');
  if (FORBIDDEN_STORAGE_SQL_RE.test(sqlText)) throw new Error('SQL text contains forbidden plaintext/secret storage fields');
  for (const table of PRODUCTION_STORAGE_TABLES) {
    if (!new RegExp(`CREATE TABLE IF NOT EXISTS [\\s\\S]*${table}`, 'i').test(sqlText)) {
      throw new Error(`SQL text missing table ${table}`);
    }
  }
  if (!/encrypted_payload_hash/i.test(sqlText)) throw new Error('relay storage must use encrypted_payload_hash');
  if (!/client_public_key_hash/i.test(sqlText)) throw new Error('pairing storage must hash client public keys');
  if (!/decision_hash/i.test(sqlText) || !/event_hash/i.test(sqlText)) throw new Error('gateway storage must hash decisions and SIEM events');
  return true;
}

export function productionStorageContract(options = {}) {
  const migration = buildPostgresMigration(options);
  assertProductionStorageSqlSafe(migration.sql);
  return Object.freeze({
    schema: PRODUCTION_STORAGE_SCHEMA,
    engine: 'postgres',
    migration_schema: migration.schema,
    migration_id: migration.migration_id,
    tables: Object.freeze([...migration.tables]),
    required_refs: Object.freeze([
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
    ]),
    claim_boundary: Object.freeze([
      'Storage contract is schema/readiness preparation only, not a live database.',
      'Operators must provision Postgres, KMS/secret custody, backups, monitoring, SIEM/log routing, and auth before hosted_live_ready can be true.',
    ]),
  });
}

function safeSqlIdentifier(value, label = 'identifier') {
  if (typeof value !== 'string' || !/^[a-z_][a-z0-9_]{0,62}$/i.test(value)) {
    throw new Error(`${label} must be a safe SQL identifier`);
  }
  return value;
}

function storageTable(schema, table) {
  safeSqlIdentifier(schema, 'schema');
  if (!PRODUCTION_STORAGE_TABLES.includes(table)) throw new Error(`unknown production storage table: ${table}`);
  return `"${schema}"."${table}"`;
}

function requireNonEmptyString(value, path) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${path} must be a non-empty string`);
  assertNoForbiddenPublicValue(value, path);
  return value;
}

function optionalIsoString(value, path) {
  if (value === undefined || value === null || value === '') return null;
  const text = requireNonEmptyString(value, path);
  if (Number.isNaN(Date.parse(text))) throw new Error(`${path} must be an ISO timestamp`);
  return text;
}

function requireSha256(value, path) {
  const text = requireNonEmptyString(value, path);
  if (!/^sha256:[a-f0-9]{64}$/i.test(text)) throw new Error(`${path} must be a sha256-prefixed digest`);
  return text.toLowerCase();
}

function jsonValue(value, path) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`);
  assertNoForbiddenPublicValue(value, path);
  return JSON.stringify(value);
}

function storageOperation(name, text, values) {
  assertNoForbiddenPublicValue(values, `${name}.values`);
  if (FORBIDDEN_STORAGE_SQL_RE.test(text)) throw new Error(`${name} SQL contains forbidden plaintext/secret fields`);
  return Object.freeze({
    schema: PRODUCTION_STORAGE_OPERATION_SCHEMA,
    engine: 'postgres',
    name,
    text,
    values: Object.freeze([...values]),
    claim_boundary: Object.freeze([
      'This operation is parameterized SQL material only; it does not connect to or mutate a database by itself.',
      'Values must contain hashes, opaque encrypted payload refs, minimized decisions/events, or public-safe refs only.',
    ]),
  });
}

export function buildRelayRecordUpsert(record, options = {}) {
  assertNoForbiddenPublicValue(record, 'relay_record');
  const schema = options.schema ?? options.schemaName ?? 'enigma';
  return storageOperation('relay_records.upsert', `INSERT INTO ${storageTable(schema, 'relay_records')} (
  record_id, store_id, capsule_id, encrypted_payload_hash, payload_storage, received_at, expires_at, signature
) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8::jsonb)
ON CONFLICT (record_id) DO UPDATE SET
  encrypted_payload_hash = EXCLUDED.encrypted_payload_hash,
  payload_storage = EXCLUDED.payload_storage,
  received_at = EXCLUDED.received_at,
  expires_at = EXCLUDED.expires_at,
  signature = EXCLUDED.signature
RETURNING record_id`, [
    requireNonEmptyString(record?.record_id, 'relay_record.record_id'),
    requireNonEmptyString(record?.store_id, 'relay_record.store_id'),
    requireNonEmptyString(record?.capsule_id, 'relay_record.capsule_id'),
    requireSha256(record?.encrypted_payload_hash, 'relay_record.encrypted_payload_hash'),
    jsonValue(record?.payload_storage, 'relay_record.payload_storage'),
    optionalIsoString(record?.received_at, 'relay_record.received_at') ?? new Date(0).toISOString(),
    optionalIsoString(record?.expires_at, 'relay_record.expires_at'),
    jsonValue(record?.signature, 'relay_record.signature'),
  ]);
}

export function buildWitnessCheckpointUpsert(checkpoint, options = {}) {
  assertNoForbiddenPublicValue(checkpoint, 'witness_checkpoint');
  const schema = options.schema ?? options.schemaName ?? 'enigma';
  return storageOperation('relay_witness_checkpoints.upsert', `INSERT INTO ${storageTable(schema, 'relay_witness_checkpoints')} (
  checkpoint_id, root, previous_root, record_count, checkpointed_at, signature
) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
ON CONFLICT (checkpoint_id) DO UPDATE SET
  root = EXCLUDED.root,
  previous_root = EXCLUDED.previous_root,
  record_count = EXCLUDED.record_count,
  checkpointed_at = EXCLUDED.checkpointed_at,
  signature = EXCLUDED.signature
RETURNING checkpoint_id`, [
    requireNonEmptyString(checkpoint?.checkpoint_id, 'witness_checkpoint.checkpoint_id'),
    requireSha256(checkpoint?.root, 'witness_checkpoint.root'),
    checkpoint?.previous_root === undefined || checkpoint?.previous_root === null ? null : requireSha256(checkpoint.previous_root, 'witness_checkpoint.previous_root'),
    Number.isInteger(checkpoint?.record_count) && checkpoint.record_count >= 0 ? checkpoint.record_count : (() => { throw new Error('witness_checkpoint.record_count must be a non-negative integer'); })(),
    optionalIsoString(checkpoint?.checkpointed_at, 'witness_checkpoint.checkpointed_at') ?? new Date(0).toISOString(),
    jsonValue(checkpoint?.signature, 'witness_checkpoint.signature'),
  ]);
}

export function buildRelayPairingUpsert(pairing, options = {}) {
  assertNoForbiddenPublicValue(pairing, 'relay_pairing');
  const schema = options.schema ?? options.schemaName ?? 'enigma';
  return storageOperation('relay_pairings.upsert', `INSERT INTO ${storageTable(schema, 'relay_pairings')} (
  pairing_id, challenge_id, relay_node_id, client_public_key_hash, issued_at, signature
) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
ON CONFLICT (pairing_id) DO UPDATE SET
  challenge_id = EXCLUDED.challenge_id,
  relay_node_id = EXCLUDED.relay_node_id,
  client_public_key_hash = EXCLUDED.client_public_key_hash,
  issued_at = EXCLUDED.issued_at,
  signature = EXCLUDED.signature
RETURNING pairing_id`, [
    requireNonEmptyString(pairing?.pairing_id, 'relay_pairing.pairing_id'),
    requireNonEmptyString(pairing?.challenge_id, 'relay_pairing.challenge_id'),
    requireNonEmptyString(pairing?.relay_node_id, 'relay_pairing.relay_node_id'),
    requireSha256(pairing?.client_public_key_hash, 'relay_pairing.client_public_key_hash'),
    optionalIsoString(pairing?.issued_at, 'relay_pairing.issued_at') ?? new Date(0).toISOString(),
    jsonValue(pairing?.signature, 'relay_pairing.signature'),
  ]);
}

export function buildGatewayPolicyVersionUpsert(policyVersion, options = {}) {
  assertNoForbiddenPublicValue(policyVersion, 'gateway_policy_version');
  const schema = options.schema ?? options.schemaName ?? 'enigma';
  return storageOperation('gateway_policy_versions.upsert', `INSERT INTO ${storageTable(schema, 'gateway_policy_versions')} (
  policy_hash, policy, active_from, retired_at
) VALUES ($1, $2::jsonb, $3, $4)
ON CONFLICT (policy_hash) DO UPDATE SET
  policy = EXCLUDED.policy,
  active_from = EXCLUDED.active_from,
  retired_at = EXCLUDED.retired_at
RETURNING policy_hash`, [
    requireSha256(policyVersion?.policy_hash, 'gateway_policy_version.policy_hash'),
    jsonValue(policyVersion?.policy, 'gateway_policy_version.policy'),
    optionalIsoString(policyVersion?.active_from, 'gateway_policy_version.active_from') ?? new Date(0).toISOString(),
    optionalIsoString(policyVersion?.retired_at, 'gateway_policy_version.retired_at'),
  ]);
}

export function buildGatewayDecisionInsert(decisionRecord, options = {}) {
  assertNoForbiddenPublicValue(decisionRecord, 'gateway_decision');
  const schema = options.schema ?? options.schemaName ?? 'enigma';
  return storageOperation('gateway_decisions.insert', `INSERT INTO ${storageTable(schema, 'gateway_decisions')} (
  decision_id, policy_hash, decision_hash, decision, created_at
) VALUES ($1, $2, $3, $4::jsonb, $5)
ON CONFLICT (decision_id) DO NOTHING
RETURNING decision_id`, [
    requireNonEmptyString(decisionRecord?.decision_id, 'gateway_decision.decision_id'),
    requireSha256(decisionRecord?.policy_hash, 'gateway_decision.policy_hash'),
    requireSha256(decisionRecord?.decision_hash, 'gateway_decision.decision_hash'),
    jsonValue(decisionRecord?.decision, 'gateway_decision.decision'),
    optionalIsoString(decisionRecord?.created_at, 'gateway_decision.created_at') ?? new Date(0).toISOString(),
  ]);
}

export function buildGatewaySiemEventInsert(eventRecord, options = {}) {
  assertNoForbiddenPublicValue(eventRecord, 'gateway_siem_event');
  const schema = options.schema ?? options.schemaName ?? 'enigma';
  return storageOperation('gateway_siem_events.insert', `INSERT INTO ${storageTable(schema, 'gateway_siem_events')} (
  event_id, event_hash, event, created_at
) VALUES ($1, $2, $3::jsonb, $4)
ON CONFLICT (event_id) DO NOTHING
RETURNING event_id`, [
    requireNonEmptyString(eventRecord?.event_id, 'gateway_siem_event.event_id'),
    requireSha256(eventRecord?.event_hash, 'gateway_siem_event.event_hash'),
    jsonValue(eventRecord?.event, 'gateway_siem_event.event'),
    optionalIsoString(eventRecord?.created_at, 'gateway_siem_event.created_at') ?? new Date(0).toISOString(),
  ]);
}

export function buildReadinessEvidenceRefUpsert(evidenceRef, options = {}) {
  assertNoForbiddenPublicValue(evidenceRef, 'readiness_evidence_ref');
  const schema = options.schema ?? options.schemaName ?? 'enigma';
  const status = requireNonEmptyString(evidenceRef?.status, 'readiness_evidence_ref.status');
  if (!['declared', 'observed', 'verified', 'go'].includes(status)) throw new Error('readiness_evidence_ref.status is unsupported');
  return storageOperation('readiness_evidence_refs.upsert', `INSERT INTO ${storageTable(schema, 'readiness_evidence_refs')} (
  evidence_key, provider, ref, status, observed_at, metadata
) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
ON CONFLICT (evidence_key) DO UPDATE SET
  provider = EXCLUDED.provider,
  ref = EXCLUDED.ref,
  status = EXCLUDED.status,
  observed_at = EXCLUDED.observed_at,
  metadata = EXCLUDED.metadata
RETURNING evidence_key`, [
    requireNonEmptyString(evidenceRef?.evidence_key, 'readiness_evidence_ref.evidence_key'),
    requireNonEmptyString(evidenceRef?.provider, 'readiness_evidence_ref.provider'),
    requireNonEmptyString(evidenceRef?.ref, 'readiness_evidence_ref.ref'),
    status,
    optionalIsoString(evidenceRef?.observed_at, 'readiness_evidence_ref.observed_at') ?? new Date(0).toISOString(),
    jsonValue(evidenceRef?.metadata ?? {}, 'readiness_evidence_ref.metadata'),
  ]);
}
