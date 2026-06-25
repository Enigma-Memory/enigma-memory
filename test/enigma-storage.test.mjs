import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildProductionStorageMigrationArtifact } from '../scripts/build-production-storage-migration.mjs';
import {
  POSTGRES_MIGRATION_SCHEMA,
  PRODUCTION_STORAGE_OPERATION_SCHEMA,
  PRODUCTION_STORAGE_SCHEMA,
  PRODUCTION_STORAGE_TABLES,
  assertProductionStorageSqlSafe,
  buildGatewayDecisionInsert,
  buildGatewayPolicyVersionUpsert,
  buildGatewaySiemEventInsert,
  buildPostgresMigration,
  buildReadinessEvidenceRefUpsert,
  buildRelayPairingUpsert,
  buildRelayRecordUpsert,
  buildWitnessCheckpointUpsert,
  postgresProductionSchemaSql,
  productionStorageContract,
} from '../packages/storage/src/index.js';
import * as storagePackage from 'enigma-memory/storage';

const execFileAsync = promisify(execFile);
const DIGEST_A = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const DIGEST_B = 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const DIGEST_C = 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
const SIGNATURE = Object.freeze({ alg: 'Ed25519', key_id: 'fixture-key', value: 'sig_fixture' });

test('storage package export exposes production storage contract', () => {
  assert.equal(storagePackage.PRODUCTION_STORAGE_SCHEMA, PRODUCTION_STORAGE_SCHEMA);
  assert.equal(typeof storagePackage.postgresProductionSchemaSql, 'function');
  assert.ok(PRODUCTION_STORAGE_TABLES.includes('relay_records'));
  assert.ok(PRODUCTION_STORAGE_TABLES.includes('gateway_siem_events'));
});

test('Postgres production schema contains durable relay gateway and readiness tables', () => {
  const sql = postgresProductionSchemaSql({ schema: 'enigma_prod' });
  assertProductionStorageSqlSafe(sql);
  for (const table of PRODUCTION_STORAGE_TABLES) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS "enigma_prod"\."${table}"`, 'i'));
  }
  assert.match(sql, /encrypted_payload_hash text NOT NULL/i);
  assert.match(sql, /client_public_key_hash text NOT NULL/i);
  assert.match(sql, /decision_hash text NOT NULL/i);
  assert.match(sql, /event_hash text NOT NULL/i);
  assert.match(sql, /readiness_evidence_refs/i);
});

test('storage contract and migration stay claim bounded', () => {
  const migration = buildPostgresMigration({ schema: 'enigma', migration_id: '001_fixture' });
  assert.equal(migration.schema, POSTGRES_MIGRATION_SCHEMA);
  assert.equal(migration.migration_id, '001_fixture');
  assert.deepEqual(migration.tables, [...PRODUCTION_STORAGE_TABLES]);
  assert.match(migration.claim_boundary.join(' '), /does not provision a database/i);
  assert.match(migration.claim_boundary.join(' '), /raw prompts, transcripts, decrypted memory/i);

  const contract = productionStorageContract({ schema: 'enigma' });
  assert.equal(contract.schema, PRODUCTION_STORAGE_SCHEMA);
  assert.equal(contract.engine, 'postgres');
  assert.ok(contract.required_refs.includes('durable_storage'));
  assert.ok(contract.required_refs.includes('kms_or_secret_custody'));
  assert.match(contract.claim_boundary.join(' '), /not a live database/i);
});

test('storage schema rejects unsafe SQL and identifiers', () => {
  assert.throws(() => postgresProductionSchemaSql({ schema: 'enigma-prod;drop' }), /safe SQL identifier/);
  assert.throws(() => assertProductionStorageSqlSafe('CREATE TABLE prompt_leaks (raw_memory text);'), /forbidden plaintext|secret/i);
  const incomplete = 'CREATE TABLE IF NOT EXISTS enigma.relay_records (encrypted_payload_hash text);';
  assert.throws(() => assertProductionStorageSqlSafe(incomplete), /missing table/);
});

test('storage schema does not define raw plaintext secret or embedding columns', () => {
  const sql = postgresProductionSchemaSql();
  for (const forbidden of [
    /\bprompt\b/i,
    /\bcompletion\b/i,
    /\btranscript\b/i,
    /\bplaintext\b/i,
    /\braw_memory\b/i,
    /\bmemory_text\b/i,
    /\bdecrypted\b/i,
    /\bembedding_vector\b/i,
    /\bprovider_response_body\b/i,
    /\bapi_key\b/i,
    /\btoken\b/i,
    /\bpassword\b/i,
    /\bprivate_key\b/i,
  ]) {
    assert.doesNotMatch(sql, forbidden);
  }
});

test('storage operation builders emit safe parameterized SQL', () => {
  const relay = buildRelayRecordUpsert({
    record_id: 'record_fixture',
    store_id: 'store_fixture',
    capsule_id: 'capsule_fixture',
    encrypted_payload_hash: DIGEST_A,
    payload_storage: { kind: 'r2', ref: 'r2://bucket/object' },
    received_at: '2026-06-23T12:00:00.000Z',
    signature: SIGNATURE,
  }, { schema: 'enigma_ops' });
  assert.equal(relay.schema, PRODUCTION_STORAGE_OPERATION_SCHEMA);
  assert.match(relay.text, /INSERT INTO "enigma_ops"\."relay_records"/);
  assert.match(relay.text, /\$5::jsonb/);
  assert.equal(relay.values[3], DIGEST_A);
  assert.equal(JSON.parse(relay.values[4]).kind, 'r2');

  const checkpoint = buildWitnessCheckpointUpsert({
    checkpoint_id: 'checkpoint_fixture',
    root: DIGEST_A,
    previous_root: DIGEST_B,
    record_count: 3,
    checkpointed_at: '2026-06-23T12:00:00.000Z',
    signature: SIGNATURE,
  });
  assert.match(checkpoint.text, /relay_witness_checkpoints/);

  const pairing = buildRelayPairingUpsert({
    pairing_id: 'pairing_fixture',
    challenge_id: 'challenge_fixture',
    relay_node_id: 'relay_fixture',
    client_public_key_hash: DIGEST_B,
    issued_at: '2026-06-23T12:00:00.000Z',
    signature: SIGNATURE,
  });
  assert.equal(pairing.values[3], DIGEST_B);

  const policy = buildGatewayPolicyVersionUpsert({
    policy_hash: DIGEST_A,
    policy: { schema: 'enigma.enterprise_policy.v1', policy_id: 'policy_fixture' },
    active_from: '2026-06-23T12:00:00.000Z',
  });
  assert.match(policy.text, /gateway_policy_versions/);

  const decision = buildGatewayDecisionInsert({
    decision_id: 'decision_fixture',
    policy_hash: DIGEST_A,
    decision_hash: DIGEST_B,
    decision: { schema: 'enigma.gateway_decision.v1', decision_id: 'decision_fixture', allowed: true },
    created_at: '2026-06-23T12:00:00.000Z',
  });
  assert.match(decision.text, /ON CONFLICT \(decision_id\) DO NOTHING/);

  const event = buildGatewaySiemEventInsert({
    event_id: 'event_fixture',
    event_hash: DIGEST_C,
    event: { schema: 'enigma.gateway_siem_event.v1', event_id: 'event_fixture', decision_hash: DIGEST_B },
    created_at: '2026-06-23T12:00:00.000Z',
  });
  assert.equal(event.values[1], DIGEST_C);

  const ref = buildReadinessEvidenceRefUpsert({
    evidence_key: 'durable_storage',
    provider: 'postgres',
    ref: 'postgres://cluster/ref-without-credentials',
    status: 'verified',
    observed_at: '2026-06-23T12:00:00.000Z',
    metadata: { environment: 'production' },
  });
  assert.match(ref.text, /readiness_evidence_refs/);

  for (const operation of [relay, checkpoint, pairing, policy, decision, event, ref]) {
    assert.equal(operation.engine, 'postgres');
    assert.doesNotMatch(operation.text, /\bprompt\b|\bcompletion\b|\btranscript\b|\braw_memory\b|\bpassword\b|\bprivate_key\b/i);
    assert.doesNotMatch(JSON.stringify(operation.values), /Bearer|Basic|PRIVATE KEY|raw memory|private prompt|full transcript|decrypted capsule/i);
  }
});

test('storage operation builders reject unsafe payloads and malformed digests', () => {
  assert.throws(() => buildRelayRecordUpsert({
    record_id: 'record_fixture',
    store_id: 'store_fixture',
    capsule_id: 'capsule_fixture',
    encrypted_payload_hash: 'sha256:not-a-digest',
    payload_storage: { kind: 'r2', ref: 'r2://bucket/object' },
    signature: SIGNATURE,
  }), /sha256-prefixed digest/);
  assert.throws(() => buildGatewayDecisionInsert({
    decision_id: 'decision_fixture',
    policy_hash: DIGEST_A,
    decision_hash: DIGEST_B,
    decision: { raw_memory: 'private prompt' },
  }), /forbidden storage evidence|secret|plaintext/i);
  assert.throws(() => buildReadinessEvidenceRefUpsert({
    evidence_key: 'durable_storage',
    provider: 'postgres',
    ref: 'https://user:password@db.example.invalid/enigma',
    status: 'verified',
  }), /secret|plaintext|credentials/i);
  assert.throws(() => buildReadinessEvidenceRefUpsert({
    evidence_key: 'durable_storage',
    provider: 'postgres',
    ref: 'postgres://cluster/ref',
    status: 'complete',
  }), /unsupported/);
});

test('production storage migration script writes JSON and SQL artifacts', async () => {
  const artifact = buildProductionStorageMigrationArtifact({ argv: ['--schema', 'enigma_ops', '--migration-id', '001_ops'] });
  assert.equal(artifact.schema, 'enigma.production_storage_migration_artifact.v1');
  assert.equal(artifact.migration.migration_id, '001_ops');
  assert.equal(artifact.contract.tables.length, PRODUCTION_STORAGE_TABLES.length);
  assertProductionStorageSqlSafe(artifact.migration.sql);

  const dir = await mkdtemp(join(tmpdir(), 'enigma-storage-migration-'));
  const jsonOut = join(dir, 'migration.json');
  const sqlOut = join(dir, 'migration.sql');
  const jsonRun = await execFileAsync(process.execPath, [
    'scripts/build-production-storage-migration.mjs',
    '--schema',
    'enigma_ops',
    '--migration-id',
    '001_ops',
    '--out',
    jsonOut,
  ], { cwd: process.cwd(), timeout: 10000, windowsHide: true });
  assert.equal(jsonRun.stderr, '');
  assert.match(jsonRun.stdout, /\"ok\": true/);
  const jsonArtifact = JSON.parse(await readFile(jsonOut, 'utf8'));
  assert.equal(jsonArtifact.migration.migration_id, '001_ops');

  const sqlRun = await execFileAsync(process.execPath, [
    'scripts/build-production-storage-migration.mjs',
    '--format',
    'sql',
    '--schema',
    'enigma_ops',
    '--out',
    sqlOut,
  ], { cwd: process.cwd(), timeout: 10000, windowsHide: true });
  assert.equal(sqlRun.stderr, '');
  const sql = await readFile(sqlOut, 'utf8');
  assert.match(sql, /CREATE SCHEMA IF NOT EXISTS \"enigma_ops\"/);
  assertProductionStorageSqlSafe(sql);
  assert.doesNotMatch(jsonRun.stdout + sqlRun.stdout + sql, /Bearer|Basic|PRIVATE KEY|raw memory|password/i);
});
