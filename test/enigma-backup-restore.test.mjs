import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  BACKUP_RESTORE_DRILL_RESULT_SCHEMA,
  BACKUP_RESTORE_DRILL_SCHEMA,
  validateBackupRestoreDrill,
} from '../scripts/validate-backup-restore-drill.mjs';

const execFileAsync = promisify(execFile);
const SNAPSHOT_HASH = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const VERIFIER_HASH = 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function completeDrill() {
  return {
    schema: BACKUP_RESTORE_DRILL_SCHEMA,
    metadata: {
      drill_id: 'backup-drill-fixture',
      environment: 'production-fixture',
      tenant: 'enigma-fixture',
      storage_engine: 'postgres',
      started_at: '2026-06-23T12:00:00.000Z',
      completed_at: '2026-06-23T12:10:00.000Z',
      operator: 'operator-fixture',
      backup_owner: 'backup-owner-fixture',
      restore_owner: 'restore-owner-fixture',
    },
    backup: {
      backup_ref: 'backup://snapshot/fixture',
      scope_ref: 'scope://tenant/enigma-fixture',
      storage_ref: 'postgres://cluster/ref-without-credentials',
      kms_or_secret_custody_ref: 'kms://key/ref-without-secret',
      source_snapshot_hash: SNAPSHOT_HASH,
      source_row_count: 42,
    },
    restore: {
      restore_ref: 'restore://run/fixture',
      target_ref: 'postgres://restore-target/ref-without-credentials',
      restore_started_at: '2026-06-23T12:03:00.000Z',
      restore_completed_at: '2026-06-23T12:09:00.000Z',
      restored_snapshot_hash: SNAPSHOT_HASH,
      restored_row_count: 42,
    },
    verification: {
      status: 'pass',
      verifier_ref: 'verifier://output/fixture',
      verifier_output_hash: VERIFIER_HASH,
    },
    rpo_rto: {
      rpo_seconds: 120,
      rto_seconds: 360,
      max_rpo_seconds: 300,
      max_rto_seconds: 900,
    },
  };
}

test('backup restore validator accepts complete matching drill', () => {
  const result = validateBackupRestoreDrill(completeDrill(), { generated_at: '2026-06-23T12:11:00.000Z' });
  assert.equal(result.schema, BACKUP_RESTORE_DRILL_RESULT_SCHEMA);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'pass');
  assert.deepEqual(result.blockers, []);
});

test('backup restore validator blocks mismatched restore and RTO breach', () => {
  const drill = completeDrill();
  drill.restore.restored_snapshot_hash = 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
  drill.restore.restored_row_count = 41;
  drill.rpo_rto.rto_seconds = 901;
  const result = validateBackupRestoreDrill(drill);
  assert.equal(result.ok, false);
  assert.equal(result.status, 'blocked');
  const messages = result.blockers.map((entry) => entry.message).join('\n');
  assert.match(messages, /restored snapshot hash/);
  assert.match(messages, /restored row count/);
  assert.match(messages, /RTO exceeds maximum/);
});

test('backup restore validator rejects secrets and raw memory', () => {
  const withCreds = completeDrill();
  withCreds.backup.storage_ref = 'https://user:password@db.example.invalid/enigma';
  assert.throws(() => validateBackupRestoreDrill(withCreds), /secret|raw-memory/i);

  const withBadField = completeDrill();
  withBadField.verification.raw_memory = 'private prompt';
  assert.throws(() => validateBackupRestoreDrill(withBadField), /forbidden field|secret|raw-memory/i);
});

test('backup restore validator CLI returns blocked result for incomplete drill', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-backup-drill-'));
  const drill = completeDrill();
  drill.verification.status = 'failed';
  const drillPath = join(dir, 'drill.json');
  await writeFile(drillPath, `${JSON.stringify(drill, null, 2)}\n`, 'utf8');
  const result = await execFileAsync(process.execPath, [
    'scripts/validate-backup-restore-drill.mjs',
    '--drill',
    drillPath,
  ], { cwd: process.cwd(), timeout: 10000, windowsHide: true }).catch((error) => error);
  assert.equal(result.code, 1);
  assert.equal(result.stderr, '');
  const output = JSON.parse(result.stdout);
  assert.equal(output.schema, BACKUP_RESTORE_DRILL_RESULT_SCHEMA);
  assert.equal(output.ok, false);
  assert.match(JSON.stringify(output.blockers), /verification.status must be pass/);
  assert.doesNotMatch(result.stdout, /Bearer\s+[A-Za-z0-9._~+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@/i);
});
