import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  KMS_CUSTODY_RESULT_SCHEMA,
  KMS_CUSTODY_SCHEMA,
  REQUIRED_CUSTODY_ITEMS,
  validateKmsCustody,
} from '../scripts/validate-kms-custody.mjs';

const execFileAsync = promisify(execFile);

function custodyItem(itemId) {
  return {
    item_id: itemId,
    purpose: `${itemId} custody`,
    manager_ref: `kms://manager/${itemId}`,
    access_policy_ref: `iam://policy/${itemId}`,
    emergency_rotation_ref: `runbook://rotation/${itemId}`,
    owner: 'custody-owner',
    status: 'active',
    rotation_seconds: 7776000,
    last_rotated_at: '2026-06-23T12:00:00.000Z',
    next_rotation_at: '2026-09-21T12:00:00.000Z',
    value_exportable: false,
  };
}

function completeCustody() {
  return {
    schema: KMS_CUSTODY_SCHEMA,
    metadata: {
      custody_id: 'kms-custody-fixture',
      environment: 'production-fixture',
      tenant: 'enigma-fixture',
      owner: 'custody-owner',
      approved_at: '2026-06-23T12:00:00.000Z',
      approval_ref: 'ticket://custody/approved',
      status: 'approved',
    },
    custody_provider: {
      provider_ref: 'kms://provider/enigma-production',
      region: 'us-central-fixture',
      account_ref: 'account://cloud/project-without-credentials',
      access_model_ref: 'iam://least-privilege/enigma-custody',
      audit_log_ref: 'audit://kms/access-log',
      owner: 'custody-owner',
      status: 'active',
    },
    custody_items: REQUIRED_CUSTODY_ITEMS.map(custodyItem),
    signing_controls: {
      algorithm_policy_ref: 'policy://signing/ed25519',
      public_key_registry_ref: 'registry://public-keys/enigma',
      rotation_runbook_ref: 'runbook://signing/rotation',
      verification_runbook_ref: 'runbook://signing/verify-public-keys',
      public_key_published: true,
    },
    operator_access: {
      least_privilege_ref: 'iam://least-privilege/operator',
      dual_control_ref: 'policy://custody/dual-control',
      break_glass_approval_ref: 'ticket://break-glass/custody-approved',
      audit_ref: 'audit://custody/operator-access',
      review_ref: 'review://custody/quarterly',
      dual_control_required: true,
      review_cadence_seconds: 7776000,
    },
    prohibitions: {
      material_in_source: false,
      material_in_chat: false,
      material_in_logs: false,
      artifact_contains_values: false,
      operator_can_export_values: false,
      enforcement_ref: 'policy://custody/no-value-export',
    },
  };
}

test('KMS custody validator accepts complete custody evidence', () => {
  const result = validateKmsCustody(completeCustody(), { generated_at: '2026-06-23T12:00:00.000Z' });
  assert.equal(result.schema, KMS_CUSTODY_RESULT_SCHEMA);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'accepted');
  assert.deepEqual(result.blockers, []);
  assert.equal(result.checked.custody_items_covered, REQUIRED_CUSTODY_ITEMS.length);
  assert.equal(result.checked.signing_controls, true);
  assert.equal(result.checked.operator_access, true);
});

test('KMS custody validator blocks missing item and exportable values', () => {
  const custody = completeCustody();
  custody.custody_items = custody.custody_items.filter((item) => item.item_id !== 'backup_encryption_key');
  custody.custody_items[0].value_exportable = true;
  custody.operator_access.dual_control_required = false;
  custody.prohibitions.material_in_logs = true;
  const result = validateKmsCustody(custody);
  assert.equal(result.ok, false);
  const messages = result.blockers.map((entry) => entry.message).join('\n');
  assert.match(messages, /backup_encryption_key/);
  assert.match(messages, /value_exportable/);
  assert.match(messages, /dual_control_required/);
  assert.match(messages, /material_in_logs/);
});

test('KMS custody validator rejects credential-looking values and forbidden fields', () => {
  const withSecret = completeCustody();
  withSecret.custody_provider.provider_ref = 'https://user:password@example.invalid/kms';
  assert.throws(() => validateKmsCustody(withSecret), /secret|raw-memory/i);

  const withBadField = completeCustody();
  withBadField.custody_items[0].private_key = 'private prompt';
  assert.throws(() => validateKmsCustody(withBadField), /forbidden field|secret|raw-memory/i);
});

test('KMS custody CLI returns blocked result for incomplete custody', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-kms-custody-'));
  const custody = completeCustody();
  custody.signing_controls.public_key_published = false;
  const path = join(dir, 'custody.json');
  await writeFile(path, `${JSON.stringify(custody, null, 2)}\n`, 'utf8');
  const result = await execFileAsync(process.execPath, [
    'scripts/validate-kms-custody.mjs',
    '--custody',
    path,
  ], { cwd: process.cwd(), timeout: 10000, windowsHide: true }).catch((error) => error);
  assert.equal(result.code, 1);
  assert.equal(result.stderr, '');
  const output = JSON.parse(result.stdout);
  assert.equal(output.schema, KMS_CUSTODY_RESULT_SCHEMA);
  assert.equal(output.ok, false);
  assert.match(JSON.stringify(output.blockers), /public_key_published/);
  assert.doesNotMatch(result.stdout, /Bearer\s+[A-Za-z0-9._~+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@/i);
});
