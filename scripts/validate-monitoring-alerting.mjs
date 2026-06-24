#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MONITORING_ALERTING_SCHEMA = 'enigma.monitoring_alerting.v1';
export const MONITORING_ALERTING_RESULT_SCHEMA = 'enigma.monitoring_alerting_result.v1';

export const REQUIRED_ALERT_SIGNALS = Object.freeze([
  'health_probe_failure',
  'latency_slo_breach',
  'http_5xx_rate',
  'signing_failure',
  'policy_load_failure',
  'storage_failure',
  'plaintext_rejection_spike',
  'certificate_expiry',
  'kms_or_secret_access_failure',
  'siem_delivery_failure',
]);

export const REQUIRED_SYNTHETIC_CHECKS = Object.freeze([
  'relay_livez',
  'relay_readyz',
  'gateway_livez',
  'gateway_readyz',
]);

const ACCEPTED_STATUSES = new Set(['approved', 'accepted', 'go', 'verified']);
const ALERT_SEVERITIES = new Set(['sev1', 'sev2', 'sev3', 'sev4']);
const SECRET_VALUE_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@|raw memory|private prompt|full transcript|decrypted capsule|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16})/iu;
const SECRET_KEY_RE = /(?:password|passwd|pwd|token|api[_-]?key|private[_-]?key|secret|raw[_-]?memory|plaintext|plain[_-]?text|prompt|completion|transcript|embedding|provider[_-]?response)/iu;
const SAFE_FIELD_NAMES = new Set(['kms_or_secret_access_failure', 'plaintext_rejection_spike']);
const SHA256_PREFIXED_DIGEST = /^sha256:[0-9a-f]{64}$/;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function positiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isoLike(value) {
  return nonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

function blocker(message, path) {
  return { message, path };
}

function assertNoSecrets(value, path = 'monitoring') {
  if (typeof value === 'string') {
    if (!/\.claim_boundary\[\d+\]$/.test(path) && SECRET_VALUE_RE.test(value)) throw new Error(`${path} contains secret or raw-memory-looking data`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecrets(item, `${path}[${index}]`));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY_RE.test(key) && !SAFE_FIELD_NAMES.has(key)) throw new Error(`${path}.${key} uses a forbidden field name`);
    assertNoSecrets(child, `${path}.${key}`);
  }
}

function statusAccepted(value) {
  return typeof value === 'string' && ACCEPTED_STATUSES.has(value.trim().toLowerCase());
}

function validateMetadata(metadata, blockers) {
  if (!isPlainObject(metadata)) {
    blockers.push(blocker('metadata is required', 'metadata'));
    return;
  }
  for (const field of ['monitoring_id', 'environment', 'tenant', 'owner', 'approved_at', 'approval_ref', 'status']) {
    if (!nonEmptyString(metadata[field])) blockers.push(blocker(`metadata.${field} is required`, `metadata.${field}`));
  }
  if (!statusAccepted(metadata.status)) blockers.push(blocker('metadata.status must be approved/accepted/go/verified', 'metadata.status'));
  if (!isoLike(metadata.approved_at)) blockers.push(blocker('metadata.approved_at must be ISO time', 'metadata.approved_at'));
}

function validateObservabilityStack(stack, blockers) {
  if (!isPlainObject(stack)) {
    blockers.push(blocker('observability_stack object is required', 'observability_stack'));
    return false;
  }
  for (const field of ['metrics_ref', 'logs_ref', 'dashboard_ref', 'alert_manager_ref', 'owner']) {
    if (!nonEmptyString(stack[field])) blockers.push(blocker(`observability_stack.${field} is required`, `observability_stack.${field}`));
  }
  if (!nonNegativeInteger(stack.retention_days) || stack.retention_days < 7) blockers.push(blocker('observability_stack.retention_days must be integer >= 7', 'observability_stack.retention_days'));
  return true;
}

function validateAlerts(alerts, blockers) {
  if (!Array.isArray(alerts)) {
    blockers.push(blocker('alerts array is required', 'alerts'));
    return { checked: 0, requiredCovered: 0 };
  }
  const names = new Set();
  alerts.forEach((alert, index) => {
    const path = `alerts[${index}]`;
    if (!isPlainObject(alert)) {
      blockers.push(blocker('alert must be object', path));
      return;
    }
    for (const field of ['name', 'description', 'query_ref', 'threshold', 'notify_ref', 'runbook_ref', 'owner']) {
      if (!nonEmptyString(alert[field])) blockers.push(blocker(`${path}.${field} is required`, `${path}.${field}`));
    }
    if (nonEmptyString(alert.name)) names.add(alert.name);
    if (!ALERT_SEVERITIES.has(String(alert.severity ?? '').toLowerCase())) blockers.push(blocker(`${path}.severity must be sev1/sev2/sev3/sev4`, `${path}.severity`));
    if (!positiveNumber(alert.window_seconds)) blockers.push(blocker(`${path}.window_seconds must be positive number`, `${path}.window_seconds`));
    if (alert.enabled !== true) blockers.push(blocker(`${path}.enabled must be true`, `${path}.enabled`));
  });
  for (const signal of REQUIRED_ALERT_SIGNALS) {
    if (!names.has(signal)) blockers.push(blocker(`alerts must include ${signal}`, 'alerts'));
  }
  return { checked: alerts.length, requiredCovered: REQUIRED_ALERT_SIGNALS.filter((signal) => names.has(signal)).length };
}

function validateSynthetics(synthetics, blockers) {
  if (!Array.isArray(synthetics)) {
    blockers.push(blocker('synthetics array is required', 'synthetics'));
    return { checked: 0, requiredCovered: 0 };
  }
  const names = new Set();
  synthetics.forEach((check, index) => {
    const path = `synthetics[${index}]`;
    if (!isPlainObject(check)) {
      blockers.push(blocker('synthetic check must be object', path));
      return;
    }
    for (const field of ['name', 'endpoint_ref', 'owner', 'alert_ref']) {
      if (!nonEmptyString(check[field])) blockers.push(blocker(`${path}.${field} is required`, `${path}.${field}`));
    }
    if (nonEmptyString(check.name)) names.add(check.name);
    if (!positiveNumber(check.frequency_seconds)) blockers.push(blocker(`${path}.frequency_seconds must be positive number`, `${path}.frequency_seconds`));
    if (!Number.isSafeInteger(check.expected_status) || check.expected_status < 200 || check.expected_status > 399) blockers.push(blocker(`${path}.expected_status must be 2xx/3xx integer`, `${path}.expected_status`));
    if (check.enabled !== true) blockers.push(blocker(`${path}.enabled must be true`, `${path}.enabled`));
  });
  for (const check of REQUIRED_SYNTHETIC_CHECKS) {
    if (!names.has(check)) blockers.push(blocker(`synthetics must include ${check}`, 'synthetics'));
  }
  return { checked: synthetics.length, requiredCovered: REQUIRED_SYNTHETIC_CHECKS.filter((check) => names.has(check)).length };
}

function validateRouting(routing, blockers) {
  if (!isPlainObject(routing)) {
    blockers.push(blocker('routing object is required', 'routing'));
    return false;
  }
  for (const field of ['paging_policy_ref', 'on_call_ref', 'escalation_ref', 'incident_runbook_ref', 'status_page_ref']) {
    if (!nonEmptyString(routing[field])) blockers.push(blocker(`routing.${field} is required`, `routing.${field}`));
  }
  return true;
}

function validateContentMinimization(contentMinimization, blockers) {
  if (!isPlainObject(contentMinimization)) {
    blockers.push(blocker('content_minimization object is required', 'content_minimization'));
    return false;
  }
  for (const field of ['policy_ref', 'sample_export_ref']) {
    if (!nonEmptyString(contentMinimization[field])) blockers.push(blocker(`content_minimization.${field} is required`, `content_minimization.${field}`));
  }
  if (contentMinimization.sensitive_content_in_logs !== false) blockers.push(blocker('content_minimization.sensitive_content_in_logs must be false', 'content_minimization.sensitive_content_in_logs'));
  if (contentMinimization.sample_export_hash && !SHA256_PREFIXED_DIGEST.test(contentMinimization.sample_export_hash)) blockers.push(blocker('content_minimization.sample_export_hash must be sha256-prefixed digest', 'content_minimization.sample_export_hash'));
  return true;
}

export function validateMonitoringAlerting(monitoring, options = {}) {
  if (!isPlainObject(monitoring)) throw new Error('monitoring alerting evidence must be an object');
  assertNoSecrets(monitoring);
  const blockers = [];
  if (monitoring.schema !== MONITORING_ALERTING_SCHEMA) blockers.push(blocker('schema mismatch', 'schema'));
  validateMetadata(monitoring.metadata, blockers);
  const stackOk = validateObservabilityStack(monitoring.observability_stack, blockers);
  const alerts = validateAlerts(monitoring.alerts, blockers);
  const synthetics = validateSynthetics(monitoring.synthetics, blockers);
  const routingOk = validateRouting(monitoring.routing, blockers);
  const contentOk = validateContentMinimization(monitoring.content_minimization, blockers);

  const result = {
    schema: MONITORING_ALERTING_RESULT_SCHEMA,
    generated_at: options.generated_at ?? options.generatedAt ?? new Date(0).toISOString(),
    ok: blockers.length === 0,
    status: blockers.length === 0 ? 'accepted' : 'blocked',
    blockers,
    checked: {
      required_alert_signals: REQUIRED_ALERT_SIGNALS.length,
      alert_signals_covered: alerts.requiredCovered,
      alerts: alerts.checked,
      required_synthetic_checks: REQUIRED_SYNTHETIC_CHECKS.length,
      synthetic_checks_covered: synthetics.requiredCovered,
      synthetics: synthetics.checked,
      observability_stack: stackOk,
      routing: routingOk,
      content_minimization: contentOk,
    },
    claim_boundary: [
      'Monitoring validation checks declared alerting evidence shape only; it does not create dashboards, pagers, metrics, logs, or certificates.',
      'A pass result is evidence for the named monitoring document and does not prove future uptime or incident response performance.',
      'Metrics, logs, dashboards, alert payloads, and sample exports must not include raw memory, prompts, transcripts, provider responses, decrypted content, secrets, or credentials.',
    ],
  };
  assertNoSecrets(result, 'result');
  return result;
}

function parseArgs(argv = process.argv.slice(2)) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq !== -1) flags.set(arg.slice(2, eq), arg.slice(eq + 1));
    else if (!argv[index + 1] || argv[index + 1].startsWith('--')) flags.set(arg.slice(2), true);
    else {
      flags.set(arg.slice(2), argv[index + 1]);
      index += 1;
    }
  }
  return flags;
}

function getFlag(flags, names) {
  for (const name of names) if (flags.has(name)) return flags.get(name);
  return undefined;
}

async function main() {
  const flags = parseArgs();
  const monitoringPath = getFlag(flags, ['monitoring', 'in']);
  if (!nonEmptyString(monitoringPath)) throw new Error('--monitoring <path> is required');
  const monitoring = JSON.parse(await readFile(resolve(String(monitoringPath)), 'utf8'));
  const result = validateMonitoringAlerting(monitoring, { generated_at: new Date().toISOString() });
  const out = getFlag(flags, ['out']);
  const text = `${JSON.stringify(result, null, 2)}\n`;
  if (out && out !== true) {
    const outPath = resolve(String(out));
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, text, 'utf8');
  }
  process.stdout.write(text);
  process.exitCode = result.ok ? 0 : 1;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.name ?? 'Error'}: ${error.message}\n`);
    process.exitCode = 1;
  });
}
