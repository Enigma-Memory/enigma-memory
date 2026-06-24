import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  SUPPORT_SLA_RESULT_SCHEMA,
  SUPPORT_SLA_SCHEMA,
  validateSupportSla,
} from '../scripts/validate-support-sla.mjs';

const execFileAsync = promisify(execFile);

function severity(definition, response, update, resolution) {
  return {
    definition,
    response_seconds: response,
    update_seconds: update,
    resolution_target_seconds: resolution,
    escalation_ref: `runbook://${definition}/escalation`,
  };
}

function completeSla() {
  return {
    schema: SUPPORT_SLA_SCHEMA,
    metadata: {
      sla_id: 'support-sla-fixture',
      environment: 'production-fixture',
      tenant: 'enigma-fixture',
      owner: 'support-owner-fixture',
      approved_at: '2026-06-23T12:00:00.000Z',
      approval_ref: 'ticket://sla/approved',
      status: 'approved',
    },
    support_hours: {
      timezone: 'America/Chicago',
      coverage: '24x7 sev1, business-hours sev2/sev3',
      holiday_policy_ref: 'policy://support/holiday',
    },
    severities: {
      sev1: severity('sev1', 300, 900, 14400),
      sev2: severity('sev2', 1800, 3600, 86400),
      sev3: severity('sev3', 14400, 86400, 604800),
    },
    channels: [
      { type: 'pager', name: 'primary on-call', ref: 'pager://support/primary', owner: 'support-owner-fixture' },
      { type: 'ticket', name: 'customer support queue', ref: 'ticket://support/queue', owner: 'support-owner-fixture' },
    ],
    escalation_matrix: [
      { level: 'l1', owner: 'support-owner-fixture', trigger: 'initial response missed', target_seconds: 300, ref: 'runbook://support/l1' },
      { level: 'l2', owner: 'incident-commander-fixture', trigger: 'sev1 unresolved', target_seconds: 1800, ref: 'runbook://support/l2' },
    ],
    maintenance_window: {
      cadence: 'weekly',
      window: 'Sunday 02:00-04:00 America/Chicago',
      notice_seconds: 604800,
      approval_ref: 'ticket://maintenance/window-approved',
    },
  };
}

test('support SLA validator accepts complete SLA', () => {
  const result = validateSupportSla(completeSla(), { generated_at: '2026-06-23T12:00:00.000Z' });
  assert.equal(result.schema, SUPPORT_SLA_RESULT_SCHEMA);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'accepted');
  assert.deepEqual(result.blockers, []);
  assert.equal(result.checked.severities, 3);
  assert.equal(result.checked.channels, 2);
  assert.equal(result.checked.escalation_levels, 2);
});

test('support SLA validator blocks missing severity and invalid approval', () => {
  const sla = completeSla();
  delete sla.severities.sev2;
  sla.metadata.status = 'draft';
  sla.maintenance_window.notice_seconds = -1;
  const result = validateSupportSla(sla);
  assert.equal(result.ok, false);
  const messages = result.blockers.map((entry) => entry.message).join('\n');
  assert.match(messages, /metadata.status/);
  assert.match(messages, /severity sev2/);
  assert.match(messages, /notice_seconds/);
});

test('support SLA validator rejects secrets and raw memory', () => {
  const withSecret = completeSla();
  withSecret.channels[0].ref = 'https://user:password@example.invalid/support';
  assert.throws(() => validateSupportSla(withSecret), /secret|raw-memory/i);

  const withBadField = completeSla();
  withBadField.support_hours.raw_memory = 'private prompt';
  assert.throws(() => validateSupportSla(withBadField), /forbidden field|secret|raw-memory/i);
});

test('support SLA CLI returns blocked result for incomplete SLA', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-support-sla-'));
  const sla = completeSla();
  sla.metadata.status = 'pending';
  const path = join(dir, 'sla.json');
  await writeFile(path, `${JSON.stringify(sla, null, 2)}\n`, 'utf8');
  const result = await execFileAsync(process.execPath, [
    'scripts/validate-support-sla.mjs',
    '--sla',
    path,
  ], { cwd: process.cwd(), timeout: 10000, windowsHide: true }).catch((error) => error);
  assert.equal(result.code, 1);
  assert.equal(result.stderr, '');
  const output = JSON.parse(result.stdout);
  assert.equal(output.schema, SUPPORT_SLA_RESULT_SCHEMA);
  assert.equal(output.ok, false);
  assert.match(JSON.stringify(output.blockers), /metadata.status/);
  assert.doesNotMatch(result.stdout, /Bearer\s+[A-Za-z0-9._~+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@/i);
});
