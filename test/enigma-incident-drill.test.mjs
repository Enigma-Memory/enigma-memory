import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  INCIDENT_DRILL_RESULT_SCHEMA,
  INCIDENT_DRILL_SCHEMA,
  validateIncidentDrill,
} from '../scripts/validate-incident-drill.mjs';

const execFileAsync = promisify(execFile);
const BUNDLE_HASH = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function contact(role) {
  return {
    role,
    name: `${role} contact`,
    organization: 'Enigma fixture',
    contact_ref: `pager://${role}/primary`,
    escalation_ref: `runbook://${role}/escalation`,
  };
}

function timelineEvent(event, minutes) {
  return {
    event,
    at: `2026-06-23T12:${String(minutes).padStart(2, '0')}:00.000Z`,
    evidence_ref: `ticket://incident/${event}`,
  };
}

function completeDrill() {
  return {
    schema: INCIDENT_DRILL_SCHEMA,
    metadata: {
      drill_id: 'incident-drill-fixture',
      environment: 'production-fixture',
      tenant: 'enigma-fixture',
      severity: 'sev1',
      started_at: '2026-06-23T12:00:00.000Z',
      completed_at: '2026-06-23T12:35:00.000Z',
      incident_commander: 'incident_commander contact',
    },
    contacts: [
      contact('incident_commander'),
      contact('security'),
      contact('infrastructure'),
      contact('legal_privacy'),
      contact('customer_support'),
    ],
    evidence_preservation: {
      incident_ticket_ref: 'ticket://incident/fixture',
      log_snapshot_ref: 'logs://snapshot/fixture',
      forensic_bundle_ref: 'evidence://bundle/fixture',
      forensic_bundle_hash: BUNDLE_HASH,
      retention_policy_ref: 'policy://retention/fixture',
    },
    communications: {
      internal_channel_ref: 'chat://incident-war-room/fixture',
      customer_notification_ref: 'customer-notice://fixture',
      status_page_ref: 'status://enigma/incident-fixture',
      executive_update_ref: 'exec-update://incident/fixture',
    },
    timeline: [
      timelineEvent('detect', 1),
      timelineEvent('triage', 4),
      timelineEvent('contain', 8),
      timelineEvent('preserve_evidence', 10),
      timelineEvent('notify', 15),
      timelineEvent('recover', 25),
      timelineEvent('postmortem', 35),
    ],
    response_targets: {
      detect_seconds: 60,
      triage_seconds: 240,
      notify_seconds: 900,
      recover_seconds: 1500,
      max_detect_seconds: 120,
      max_triage_seconds: 600,
      max_notify_seconds: 1800,
      max_recover_seconds: 3600,
    },
    result: {
      status: 'pass',
      postmortem_ref: 'postmortem://incident/fixture',
      lessons_learned_ref: 'lessons://incident/fixture',
      followup_owner: 'incident_commander contact',
      followup_due_at: '2026-06-30T12:00:00.000Z',
    },
  };
}

test('incident drill validator accepts complete drill', () => {
  const result = validateIncidentDrill(completeDrill(), { generated_at: '2026-06-23T12:40:00.000Z' });
  assert.equal(result.schema, INCIDENT_DRILL_RESULT_SCHEMA);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'pass');
  assert.deepEqual(result.blockers, []);
  assert.equal(result.checked.contact_roles, 5);
  assert.equal(result.checked.timeline_events, 7);
});

test('incident drill validator blocks missing roles timeline and target breach', () => {
  const drill = completeDrill();
  drill.contacts = drill.contacts.filter((entry) => entry.role !== 'legal_privacy');
  drill.timeline = drill.timeline.filter((entry) => entry.event !== 'notify');
  drill.response_targets.recover_seconds = 4000;
  drill.result.status = 'failed';
  const result = validateIncidentDrill(drill);
  assert.equal(result.ok, false);
  const messages = result.blockers.map((entry) => entry.message).join('\n');
  assert.match(messages, /contact role legal_privacy/);
  assert.match(messages, /timeline event notify/);
  assert.match(messages, /recovery time exceeds maximum/);
  assert.match(messages, /result.status must be pass/);
});

test('incident drill validator rejects secrets and raw memory', () => {
  const withSecret = completeDrill();
  withSecret.communications.internal_channel_ref = 'https://user:password@example.invalid/incident';
  assert.throws(() => validateIncidentDrill(withSecret), /secret|raw-memory/i);

  const withBadField = completeDrill();
  withBadField.evidence_preservation.raw_memory = 'private prompt';
  assert.throws(() => validateIncidentDrill(withBadField), /forbidden field|secret|raw-memory/i);
});

test('incident drill validator CLI returns blocked result for incomplete drill', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-incident-drill-'));
  const drill = completeDrill();
  drill.result.status = 'failed';
  const drillPath = join(dir, 'incident.json');
  await writeFile(drillPath, `${JSON.stringify(drill, null, 2)}\n`, 'utf8');
  const result = await execFileAsync(process.execPath, [
    'scripts/validate-incident-drill.mjs',
    '--drill',
    drillPath,
  ], { cwd: process.cwd(), timeout: 10000, windowsHide: true }).catch((error) => error);
  assert.equal(result.code, 1);
  assert.equal(result.stderr, '');
  const output = JSON.parse(result.stdout);
  assert.equal(output.schema, INCIDENT_DRILL_RESULT_SCHEMA);
  assert.equal(output.ok, false);
  assert.match(JSON.stringify(output.blockers), /result.status must be pass/);
  assert.doesNotMatch(result.stdout, /Bearer\s+[A-Za-z0-9._~+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@/i);
});
