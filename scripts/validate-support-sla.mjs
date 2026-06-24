#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SUPPORT_SLA_SCHEMA = 'enigma.support_sla.v1';
export const SUPPORT_SLA_RESULT_SCHEMA = 'enigma.support_sla_result.v1';

const SECRET_VALUE_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@|raw memory|private prompt|full transcript|decrypted capsule|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16})/iu;
const SECRET_KEY_RE = /(?:password|passwd|pwd|token|api[_-]?key|private[_-]?key|secret|raw[_-]?memory|plaintext|plain[_-]?text|prompt|completion|transcript|embedding|provider[_-]?response)/iu;
const REQUIRED_SEVERITIES = Object.freeze(['sev1', 'sev2', 'sev3']);
const STATUS_ACCEPTED = new Set(['approved', 'accepted', 'go', 'verified']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function nonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function assertNoSecrets(value, path = 'sla') {
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
    if (SECRET_KEY_RE.test(key)) throw new Error(`${path}.${key} uses a forbidden field name`);
    assertNoSecrets(child, `${path}.${key}`);
  }
}

function blocker(message, path) {
  return { message, path };
}

function isoLike(value) {
  return nonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

export function validateSupportSla(sla, options = {}) {
  if (!isPlainObject(sla)) throw new Error('support SLA must be an object');
  assertNoSecrets(sla);
  const blockers = [];
  if (sla.schema !== SUPPORT_SLA_SCHEMA) blockers.push(blocker('schema mismatch', 'schema'));

  const metadata = sla.metadata;
  if (!isPlainObject(metadata)) blockers.push(blocker('metadata is required', 'metadata'));
  else {
    for (const field of ['sla_id', 'environment', 'tenant', 'owner', 'approved_at', 'approval_ref', 'status']) {
      if (!nonEmptyString(metadata[field])) blockers.push(blocker(`metadata.${field} is required`, `metadata.${field}`));
    }
    if (!STATUS_ACCEPTED.has(String(metadata.status ?? '').toLowerCase())) blockers.push(blocker('metadata.status must be approved/accepted/go/verified', 'metadata.status'));
    if (!isoLike(metadata.approved_at)) blockers.push(blocker('metadata.approved_at must be ISO time', 'metadata.approved_at'));
  }

  const supportHours = sla.support_hours;
  if (!isPlainObject(supportHours)) blockers.push(blocker('support_hours object is required', 'support_hours'));
  else {
    for (const field of ['timezone', 'coverage', 'holiday_policy_ref']) {
      if (!nonEmptyString(supportHours[field])) blockers.push(blocker(`support_hours.${field} is required`, `support_hours.${field}`));
    }
  }

  const severities = sla.severities;
  if (!isPlainObject(severities)) blockers.push(blocker('severities object is required', 'severities'));
  else {
    for (const severity of REQUIRED_SEVERITIES) {
      const item = severities[severity];
      if (!isPlainObject(item)) blockers.push(blocker(`severity ${severity} is required`, `severities.${severity}`));
      else {
        for (const field of ['definition', 'response_seconds', 'update_seconds', 'resolution_target_seconds', 'escalation_ref']) {
          if (field.endsWith('_seconds')) {
            if (!nonNegative(item[field])) blockers.push(blocker(`severities.${severity}.${field} must be non-negative number`, `severities.${severity}.${field}`));
          } else if (!nonEmptyString(item[field])) blockers.push(blocker(`severities.${severity}.${field} is required`, `severities.${severity}.${field}`));
        }
      }
    }
  }

  const channels = sla.channels;
  if (!Array.isArray(channels) || channels.length === 0) blockers.push(blocker('channels array is required', 'channels'));
  else channels.forEach((channel, index) => {
    if (!isPlainObject(channel)) blockers.push(blocker('channel must be object', `channels[${index}]`));
    else {
      for (const field of ['type', 'name', 'ref', 'owner']) {
        if (!nonEmptyString(channel[field])) blockers.push(blocker(`channels[${index}].${field} is required`, `channels[${index}].${field}`));
      }
    }
  });

  const escalation = sla.escalation_matrix;
  if (!Array.isArray(escalation) || escalation.length === 0) blockers.push(blocker('escalation_matrix array is required', 'escalation_matrix'));
  else escalation.forEach((entry, index) => {
    if (!isPlainObject(entry)) blockers.push(blocker('escalation entry must be object', `escalation_matrix[${index}]`));
    else {
      for (const field of ['level', 'owner', 'trigger', 'target_seconds', 'ref']) {
        if (field === 'target_seconds') {
          if (!nonNegative(entry[field])) blockers.push(blocker(`escalation_matrix[${index}].target_seconds must be non-negative number`, `escalation_matrix[${index}].target_seconds`));
        } else if (!nonEmptyString(entry[field])) blockers.push(blocker(`escalation_matrix[${index}].${field} is required`, `escalation_matrix[${index}].${field}`));
      }
    }
  });

  const maintenance = sla.maintenance_window;
  if (!isPlainObject(maintenance)) blockers.push(blocker('maintenance_window object is required', 'maintenance_window'));
  else {
    for (const field of ['cadence', 'window', 'notice_seconds', 'approval_ref']) {
      if (field === 'notice_seconds') {
        if (!nonNegative(maintenance[field])) blockers.push(blocker('maintenance_window.notice_seconds must be non-negative number', 'maintenance_window.notice_seconds'));
      } else if (!nonEmptyString(maintenance[field])) blockers.push(blocker(`maintenance_window.${field} is required`, `maintenance_window.${field}`));
    }
  }

  const result = {
    schema: SUPPORT_SLA_RESULT_SCHEMA,
    generated_at: options.generated_at ?? options.generatedAt ?? new Date(0).toISOString(),
    ok: blockers.length === 0,
    status: blockers.length === 0 ? 'accepted' : 'blocked',
    blockers,
    checked: {
      severities: REQUIRED_SEVERITIES.length,
      channels: Array.isArray(channels) ? channels.length : 0,
      escalation_levels: Array.isArray(escalation) ? escalation.length : 0,
      maintenance_window: isPlainObject(maintenance),
    },
    claim_boundary: [
      'Support SLA validation checks declared evidence shape only; it does not staff a support team or page responders.',
      'A pass result is evidence for the named SLA document and does not prove future response performance.',
      'Secrets, raw memory, prompts, transcripts, provider responses, and decrypted content must remain outside SLA artifacts.',
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
  const slaPath = getFlag(flags, ['sla', 'in']);
  if (!nonEmptyString(slaPath)) throw new Error('--sla <path> is required');
  const sla = JSON.parse(await readFile(resolve(String(slaPath)), 'utf8'));
  const result = validateSupportSla(sla, { generated_at: new Date().toISOString() });
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
