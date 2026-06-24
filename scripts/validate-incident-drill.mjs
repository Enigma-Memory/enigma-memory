#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const INCIDENT_DRILL_SCHEMA = 'enigma.incident_drill.v1';
export const INCIDENT_DRILL_RESULT_SCHEMA = 'enigma.incident_drill_result.v1';

const SECRET_VALUE_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@|raw memory|private prompt|full transcript|decrypted capsule|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16})/iu;
const SECRET_KEY_RE = /(?:password|passwd|pwd|token|api[_-]?key|private[_-]?key|secret|raw[_-]?memory|plaintext|plain[_-]?text|prompt|completion|transcript|embedding|provider[_-]?response)/iu;
const STATUS_PASS = new Set(['pass', 'passed', 'go', 'verified']);
const REQUIRED_CONTACT_ROLES = Object.freeze(['incident_commander', 'security', 'infrastructure', 'legal_privacy', 'customer_support']);
const REQUIRED_TIMELINE_EVENTS = Object.freeze(['detect', 'triage', 'contain', 'preserve_evidence', 'notify', 'recover', 'postmortem']);
const HASH_RE = /^sha256:[a-f0-9]{64}$/i;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function assertNoSecrets(value, path = 'incident') {
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

function iso(value) {
  return nonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

function hashOk(value) {
  return nonEmptyString(value) && HASH_RE.test(value);
}

function nonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function roleSet(contacts) {
  return new Set(Array.isArray(contacts) ? contacts.map((contact) => String(contact?.role ?? '')) : []);
}

function eventSet(events) {
  return new Set(Array.isArray(events) ? events.map((event) => String(event?.event ?? '')) : []);
}

export function validateIncidentDrill(drill, options = {}) {
  if (!isPlainObject(drill)) throw new Error('incident drill must be an object');
  assertNoSecrets(drill);
  const blockers = [];
  if (drill.schema !== INCIDENT_DRILL_SCHEMA) blockers.push(blocker('schema mismatch', 'schema'));

  const metadata = drill.metadata;
  if (!isPlainObject(metadata)) blockers.push(blocker('metadata is required', 'metadata'));
  else {
    for (const field of ['drill_id', 'environment', 'tenant', 'severity', 'started_at', 'completed_at', 'incident_commander']) {
      if (!nonEmptyString(metadata[field])) blockers.push(blocker(`metadata.${field} is required`, `metadata.${field}`));
    }
    if (!iso(metadata.started_at)) blockers.push(blocker('metadata.started_at must be ISO time', 'metadata.started_at'));
    if (!iso(metadata.completed_at)) blockers.push(blocker('metadata.completed_at must be ISO time', 'metadata.completed_at'));
  }

  const contacts = drill.contacts;
  if (!Array.isArray(contacts) || contacts.length === 0) blockers.push(blocker('contacts array is required', 'contacts'));
  else {
    const roles = roleSet(contacts);
    for (const role of REQUIRED_CONTACT_ROLES) if (!roles.has(role)) blockers.push(blocker(`contact role ${role} is required`, `contacts.${role}`));
    contacts.forEach((contact, index) => {
      if (!isPlainObject(contact)) blockers.push(blocker('contact must be object', `contacts[${index}]`));
      else {
        for (const field of ['role', 'name', 'organization', 'contact_ref', 'escalation_ref']) {
          if (!nonEmptyString(contact[field])) blockers.push(blocker(`contacts[${index}].${field} is required`, `contacts[${index}].${field}`));
        }
      }
    });
  }

  const preservation = drill.evidence_preservation;
  if (!isPlainObject(preservation)) blockers.push(blocker('evidence_preservation object is required', 'evidence_preservation'));
  else {
    for (const field of ['incident_ticket_ref', 'log_snapshot_ref', 'forensic_bundle_ref', 'retention_policy_ref']) {
      if (!nonEmptyString(preservation[field])) blockers.push(blocker(`evidence_preservation.${field} is required`, `evidence_preservation.${field}`));
    }
    if (!hashOk(preservation.forensic_bundle_hash)) blockers.push(blocker('evidence_preservation.forensic_bundle_hash must be sha256', 'evidence_preservation.forensic_bundle_hash'));
  }

  const communications = drill.communications;
  if (!isPlainObject(communications)) blockers.push(blocker('communications object is required', 'communications'));
  else {
    for (const field of ['internal_channel_ref', 'customer_notification_ref', 'status_page_ref', 'executive_update_ref']) {
      if (!nonEmptyString(communications[field])) blockers.push(blocker(`communications.${field} is required`, `communications.${field}`));
    }
  }

  const timeline = drill.timeline;
  if (!Array.isArray(timeline) || timeline.length === 0) blockers.push(blocker('timeline array is required', 'timeline'));
  else {
    const events = eventSet(timeline);
    for (const event of REQUIRED_TIMELINE_EVENTS) if (!events.has(event)) blockers.push(blocker(`timeline event ${event} is required`, `timeline.${event}`));
    timeline.forEach((event, index) => {
      if (!isPlainObject(event)) blockers.push(blocker('timeline event must be object', `timeline[${index}]`));
      else {
        if (!nonEmptyString(event.event)) blockers.push(blocker(`timeline[${index}].event is required`, `timeline[${index}].event`));
        if (!iso(event.at)) blockers.push(blocker(`timeline[${index}].at must be ISO time`, `timeline[${index}].at`));
        if (!nonEmptyString(event.evidence_ref)) blockers.push(blocker(`timeline[${index}].evidence_ref is required`, `timeline[${index}].evidence_ref`));
      }
    });
  }

  const targets = drill.response_targets;
  if (!isPlainObject(targets)) blockers.push(blocker('response_targets object is required', 'response_targets'));
  else {
    for (const field of ['detect_seconds', 'triage_seconds', 'notify_seconds', 'recover_seconds', 'max_detect_seconds', 'max_triage_seconds', 'max_notify_seconds', 'max_recover_seconds']) {
      if (!nonNegative(targets[field])) blockers.push(blocker(`response_targets.${field} must be non-negative number`, `response_targets.${field}`));
    }
    const pairs = [
      ['detect_seconds', 'max_detect_seconds', 'detection time exceeds maximum'],
      ['triage_seconds', 'max_triage_seconds', 'triage time exceeds maximum'],
      ['notify_seconds', 'max_notify_seconds', 'notification time exceeds maximum'],
      ['recover_seconds', 'max_recover_seconds', 'recovery time exceeds maximum'],
    ];
    for (const [actual, max, message] of pairs) {
      if (nonNegative(targets[actual]) && nonNegative(targets[max]) && targets[actual] > targets[max]) blockers.push(blocker(message, `response_targets.${actual}`));
    }
  }

  const result = drill.result;
  if (!isPlainObject(result)) blockers.push(blocker('result object is required', 'result'));
  else {
    if (!STATUS_PASS.has(String(result.status ?? '').toLowerCase())) blockers.push(blocker('result.status must be pass', 'result.status'));
    for (const field of ['postmortem_ref', 'lessons_learned_ref', 'followup_owner', 'followup_due_at']) {
      if (!nonEmptyString(result[field])) blockers.push(blocker(`result.${field} is required`, `result.${field}`));
    }
    if (!iso(result.followup_due_at)) blockers.push(blocker('result.followup_due_at must be ISO time', 'result.followup_due_at'));
  }

  const validation = {
    schema: INCIDENT_DRILL_RESULT_SCHEMA,
    generated_at: options.generated_at ?? options.generatedAt ?? new Date(0).toISOString(),
    ok: blockers.length === 0,
    status: blockers.length === 0 ? 'pass' : 'blocked',
    blockers,
    checked: {
      contact_roles: REQUIRED_CONTACT_ROLES.length,
      timeline_events: REQUIRED_TIMELINE_EVENTS.length,
      response_targets: true,
      evidence_preservation: true,
      communications: true,
    },
    claim_boundary: [
      'Incident drill validation checks declared evidence only; it does not page people, access systems, or verify external ticket contents.',
      'A pass result is evidence for one named drill and does not prove future incident performance.',
      'Secret values, raw memory, prompts, transcripts, provider responses, and decrypted content must remain outside drill artifacts.',
    ],
  };
  assertNoSecrets(validation, 'result');
  return validation;
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
  const drillPath = getFlag(flags, ['drill', 'in']);
  if (!nonEmptyString(drillPath)) throw new Error('--drill <path> is required');
  const drill = JSON.parse(await readFile(resolve(String(drillPath)), 'utf8'));
  const result = validateIncidentDrill(drill, { generated_at: new Date().toISOString() });
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
