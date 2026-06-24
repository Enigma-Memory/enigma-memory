import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  MONITORING_ALERTING_RESULT_SCHEMA,
  MONITORING_ALERTING_SCHEMA,
  REQUIRED_ALERT_SIGNALS,
  REQUIRED_SYNTHETIC_CHECKS,
  validateMonitoringAlerting,
} from '../scripts/validate-monitoring-alerting.mjs';

const execFileAsync = promisify(execFile);

function alert(signal) {
  return {
    name: signal,
    description: `${signal} alert`,
    query_ref: `monitor://query/${signal}`,
    threshold: `${signal} threshold`,
    severity: signal.includes('failure') || signal.includes('5xx') ? 'sev1' : 'sev2',
    window_seconds: 300,
    notify_ref: `pager://alerts/${signal}`,
    runbook_ref: `runbook://alerts/${signal}`,
    owner: 'observability-owner',
    enabled: true,
  };
}

function synthetic(name) {
  return {
    name,
    endpoint_ref: `https-check://${name}`,
    frequency_seconds: 60,
    expected_status: 200,
    owner: 'observability-owner',
    alert_ref: `monitor://alert/${name}`,
    enabled: true,
  };
}

function completeMonitoring() {
  return {
    schema: MONITORING_ALERTING_SCHEMA,
    metadata: {
      monitoring_id: 'monitoring-fixture',
      environment: 'production-fixture',
      tenant: 'enigma-fixture',
      owner: 'observability-owner',
      approved_at: '2026-06-23T12:00:00.000Z',
      approval_ref: 'ticket://monitoring/approved',
      status: 'approved',
    },
    observability_stack: {
      metrics_ref: 'metrics://enigma/production-fixture',
      logs_ref: 'logs://enigma/production-fixture',
      dashboard_ref: 'dashboard://enigma/overview',
      alert_manager_ref: 'pager://enigma/alert-manager',
      retention_days: 30,
      owner: 'observability-owner',
    },
    alerts: REQUIRED_ALERT_SIGNALS.map(alert),
    synthetics: REQUIRED_SYNTHETIC_CHECKS.map(synthetic),
    routing: {
      paging_policy_ref: 'pager://policy/enigma-sev-routing',
      on_call_ref: 'pager://schedule/enigma-primary',
      escalation_ref: 'runbook://monitoring/escalation',
      incident_runbook_ref: 'runbook://incident/sev1',
      status_page_ref: 'status://enigma/public',
    },
    content_minimization: {
      policy_ref: 'policy://logs/content-minimization',
      sensitive_content_in_logs: false,
      sample_export_ref: 'logs://sample/minimized-export',
      sample_export_hash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    },
  };
}

test('monitoring validator accepts complete alerting evidence', () => {
  const result = validateMonitoringAlerting(completeMonitoring(), { generated_at: '2026-06-23T12:00:00.000Z' });
  assert.equal(result.schema, MONITORING_ALERTING_RESULT_SCHEMA);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'accepted');
  assert.deepEqual(result.blockers, []);
  assert.equal(result.checked.alert_signals_covered, REQUIRED_ALERT_SIGNALS.length);
  assert.equal(result.checked.synthetic_checks_covered, REQUIRED_SYNTHETIC_CHECKS.length);
  assert.equal(result.checked.content_minimization, true);
});

test('monitoring validator blocks missing required signal, disabled alert, and bad synthetic', () => {
  const monitoring = completeMonitoring();
  monitoring.alerts = monitoring.alerts.filter((entry) => entry.name !== 'storage_failure');
  monitoring.alerts[0].enabled = false;
  monitoring.alerts[1].window_seconds = 0;
  monitoring.synthetics[0].expected_status = 500;
  monitoring.content_minimization.sensitive_content_in_logs = true;
  const result = validateMonitoringAlerting(monitoring);
  assert.equal(result.ok, false);
  const messages = result.blockers.map((entry) => entry.message).join('\n');
  assert.match(messages, /storage_failure/);
  assert.match(messages, /enabled/);
  assert.match(messages, /window_seconds/);
  assert.match(messages, /expected_status/);
  assert.match(messages, /sensitive_content_in_logs/);
});

test('monitoring validator rejects secrets and raw memory', () => {
  const withSecret = completeMonitoring();
  withSecret.routing.on_call_ref = 'https://user:password@example.invalid/oncall';
  assert.throws(() => validateMonitoringAlerting(withSecret), /secret|raw-memory/i);

  const withBadField = completeMonitoring();
  withBadField.observability_stack.raw_memory = 'private prompt';
  assert.throws(() => validateMonitoringAlerting(withBadField), /forbidden field|secret|raw-memory/i);
});

test('monitoring CLI returns blocked result for incomplete alerting evidence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-monitoring-alerting-'));
  const monitoring = completeMonitoring();
  monitoring.alerts = monitoring.alerts.filter((entry) => entry.name !== 'certificate_expiry');
  const path = join(dir, 'monitoring.json');
  await writeFile(path, `${JSON.stringify(monitoring, null, 2)}\n`, 'utf8');
  const result = await execFileAsync(process.execPath, [
    'scripts/validate-monitoring-alerting.mjs',
    '--monitoring',
    path,
  ], { cwd: process.cwd(), timeout: 10000, windowsHide: true }).catch((error) => error);
  assert.equal(result.code, 1);
  assert.equal(result.stderr, '');
  const output = JSON.parse(result.stdout);
  assert.equal(output.schema, MONITORING_ALERTING_RESULT_SCHEMA);
  assert.equal(output.ok, false);
  assert.match(JSON.stringify(output.blockers), /certificate_expiry/);
  assert.doesNotMatch(result.stdout, /Bearer\s+[A-Za-z0-9._~+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@/i);
});
