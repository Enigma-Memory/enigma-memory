#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  HOSTED_CLOUD_API_KEY_LIFECYCLE_OPERATIONS,
  HOSTED_CLOUD_API_KEY_LIFECYCLE_PACKET_SCHEMA,
  HOSTED_CLOUD_API_KEY_LIFECYCLE_PHASES,
  buildApiKeyLifecyclePacket,
  validateApiKeyLifecyclePacket,
} from '../packages/hosted-cloud/src/index.js';

export const HOSTED_API_KEY_LIFECYCLE_PACKET_SCHEMA = HOSTED_CLOUD_API_KEY_LIFECYCLE_PACKET_SCHEMA;
export const HOSTED_API_KEY_LIFECYCLE_RELEASE_TARGET = '0.1.12';

const PROVIDED = 'provided';
const BLOCKED = 'blocked_external_dependency';
const ALLOWED_OPERATIONS = new Set(HOSTED_CLOUD_API_KEY_LIFECYCLE_OPERATIONS);
const ALLOWED_STATUSES = new Set([PROVIDED, BLOCKED, 'blocked_missing_evidence']);
const STATUS_ALIASES = Object.freeze({
  blocked: BLOCKED,
  missing: BLOCKED,
  blocked_missing_evidence: BLOCKED,
});

const OPERATION_EVIDENCE_KEYS = Object.freeze({
  issue: Object.freeze(['next_key_metadata', 'issue_policy', 'audit_log']),
  rotate: Object.freeze(['current_key_metadata', 'next_key_metadata', 'rotation_policy', 'audit_log']),
  revoke: Object.freeze(['current_key_metadata', 'revoked_key_metadata', 'revocation_policy', 'audit_log']),
  audit: Object.freeze(['current_key_metadata', 'audit_log']),
});

const ALL_EVIDENCE_KEYS = Object.freeze(HOSTED_CLOUD_API_KEY_LIFECYCLE_PHASES);
const ALL_EVIDENCE_KEY_SET = new Set(ALL_EVIDENCE_KEYS);

const SECRET_VALUE_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|\b(?:raw[\s_-]*memory|plaintext[\s_-]*prompts?|plain[\s_-]*text[\s_-]*prompts?|private[\s_-]*prompts?|provider[\s_-]*responses?|full[\s_-]*transcript|decrypted[\s_-]*memory|credentials?|secrets?|passwords?|private[\s_-]*keys?|api[\s_-]*key[\s_-]*(?:secret|material|value)|api[\s_-]*secrets?|access[\s_-]*tokens?|refresh[\s_-]*tokens?|token[\s_-]*values?|credential[\s_-]*material)\b)/iu;
const FORBIDDEN_CLAIM_RE = /(?:token[\s_-]*(?:roi|profit|return|investment|price)|financial[\s_-]*roi|roi[\s_-]*claim|(?:roi|profit|return)[\s_-]*(?:from|on)[\s_-]*token|guaranteed[\s_-]*(?:savings|profit|return)|provider(?:-side|[\s_-]*side)?[\s_-]*(?:deletion|erasure)|model[\s_-]*(?:forgetting|forgot|erasure)|makes?[\s_-]*models?[\s_-]*forget|deleted[\s_-]*from[\s_-]*every[\s_-]*provider)/iu;
const ABSOLUTE_LOCAL_PATH_RE = /^(?:[A-Za-z]:[\\/]|\\\\|\/(?:Users|home|tmp|var|etc|mnt|Volumes)\b)/u;

function assertPublicSafeString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be a non-empty public ref`);
  const normalized = value.trim();
  if (SECRET_VALUE_RE.test(normalized) || FORBIDDEN_CLAIM_RE.test(normalized) || ABSOLUTE_LOCAL_PATH_RE.test(normalized)) {
    throw new Error(`${label} contains non-public hosted-cloud material`);
  }
  return normalized;
}

function assertRelativeOutFile(value) {
  const out = assertPublicSafeString(value, 'output file');
  if (isAbsolute(out) || ABSOLUTE_LOCAL_PATH_RE.test(out)) throw new Error('output file must be a relative path');
  return out;
}

function normalizeStatus(status) {
  const normalized = STATUS_ALIASES[status] ?? status;
  if (!ALLOWED_STATUSES.has(normalized)) throw new Error('evidence status must be provided, blocked_external_dependency, or blocked_missing_evidence');
  return normalized;
}

function defaultEvidenceRef(key) {
  return {
    status: BLOCKED,
    ref: `blocked:${key}`,
    blocker: `Public-safe ${key.replaceAll('_', ' ')} evidence is not provided.`,
  };
}

function normalizeEvidenceRecord(key, record) {
  const status = normalizeStatus(record.status ?? PROVIDED);
  const ref = assertPublicSafeString(record.ref, 'evidence ref');
  const output = { status, ref };
  if (status !== PROVIDED) output.blocker = record.blocker ?? defaultEvidenceRef(key).blocker;
  return output;
}

export function parseEvidenceRef(value) {
  const raw = assertPublicSafeString(value, 'evidence ref argument');
  const equalsIndex = raw.indexOf('=');
  if (equalsIndex <= 0 || equalsIndex === raw.length - 1) throw new Error('evidence refs must use key=status:ref');
  const key = raw.slice(0, equalsIndex).trim();
  if (!ALL_EVIDENCE_KEY_SET.has(key)) throw new Error(`evidence key must be one of: ${ALL_EVIDENCE_KEYS.join(', ')}`);
  const body = raw.slice(equalsIndex + 1).trim();
  const colonIndex = body.indexOf(':');
  if (colonIndex > 0) {
    const possibleStatus = body.slice(0, colonIndex);
    if (ALLOWED_STATUSES.has(possibleStatus) || STATUS_ALIASES[possibleStatus]) {
      return { key, ...normalizeEvidenceRecord(key, { status: possibleStatus, ref: body.slice(colonIndex + 1) }) };
    }
  }
  return { key, ...normalizeEvidenceRecord(key, { status: PROVIDED, ref: body }) };
}

function evidenceRefsFor(operation, records = []) {
  const requiredKeys = OPERATION_EVIDENCE_KEYS[operation];
  const refs = Object.fromEntries(requiredKeys.map((key) => [key, defaultEvidenceRef(key)]));
  for (const rawRecord of records) {
    const record = typeof rawRecord === 'string' ? parseEvidenceRef(rawRecord) : rawRecord;
    if (!requiredKeys.includes(record.key)) throw new Error(`evidence key ${record.key} is not required for ${operation}`);
    refs[record.key] = normalizeEvidenceRecord(record.key, record);
  }
  return refs;
}

function providedRef(evidenceRefs, key) {
  const evidence = evidenceRefs[key];
  return evidence?.status === PROVIDED ? evidence.ref : null;
}

function fingerprintFromRef(ref, label) {
  if (!ref) return `blocked:${label}`;
  return `sha256:${createHash('sha256').update(`${label}\0${ref}`).digest('hex')}`;
}

function scopeList(scopes = []) {
  if (!Array.isArray(scopes) || scopes.length === 0) return ['blocked:scope'];
  return Object.freeze(scopes.map((scope, index) => assertPublicSafeString(scope, `scope ${index + 1}`)));
}


function keyInputsFor({ operation, tenantId, subjectRef, scopes, generatedAt, evidenceRefs }) {
  const base = { tenant_id: tenantId, subject_ref: subjectRef, scopes, issued_at: generatedAt };
  const currentRef = providedRef(evidenceRefs, 'current_key_metadata');
  const nextRef = providedRef(evidenceRefs, 'next_key_metadata');
  const revokedRef = providedRef(evidenceRefs, 'revoked_key_metadata');
  const issueRef = providedRef(evidenceRefs, 'issue_policy') ?? nextRef;
  const rotationRef = providedRef(evidenceRefs, 'rotation_policy') ?? currentRef;
  const revokeRef = providedRef(evidenceRefs, 'revocation_policy') ?? revokedRef;
  const inputs = {};

  if (operation === 'issue') {
    if (nextRef) inputs.next_key = { ...base, key_fingerprint: fingerprintFromRef(nextRef, 'issue_next_key'), rotation_ref: issueRef ?? 'blocked:issue_policy' };
    return inputs;
  }
  if (operation === 'rotate') {
    if (currentRef) inputs.current_key = { ...base, key_fingerprint: fingerprintFromRef(currentRef, 'rotate_current_key'), rotation_ref: rotationRef ?? 'blocked:rotation_policy' };
    if (nextRef) inputs.next_key = { ...base, key_fingerprint: fingerprintFromRef(nextRef, 'rotate_next_key'), rotation_ref: rotationRef ?? 'blocked:rotation_policy' };
    return inputs;
  }
  if (operation === 'revoke') {
    if (currentRef) inputs.current_key = { ...base, key_fingerprint: fingerprintFromRef(currentRef, 'revoke_current_key'), rotation_ref: revokeRef ?? 'blocked:revocation_policy' };
    if (revokedRef) inputs.revoked_key = { ...base, key_fingerprint: fingerprintFromRef(revokedRef, 'revoke_key'), rotation_ref: revokeRef ?? 'blocked:revocation_policy' };
    return inputs;
  }
  if (currentRef) inputs.current_key = { ...base, key_fingerprint: fingerprintFromRef(currentRef, 'audit_key'), rotation_ref: providedRef(evidenceRefs, 'audit_log') ?? 'blocked:audit_log' };
  return inputs;
}

function scriptBoundary() {
  return {
    public_safe_packet_only: true,
    evidence_validation_only: true,
    provider_wiring_performed: false,
    deploys_or_calls_external_providers: false,
    sensitive_material_written: false,
    customer_api_key_material_written: false,
    customer_content_written: false,
  };
}

export function buildHostedApiKeyLifecyclePacket(options = {}) {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const tenantId = assertPublicSafeString(options.tenant ?? options.tenantId ?? 'blocked:tenant', 'tenant');
  const subjectRef = assertPublicSafeString(options.subject ?? options.subjectRef ?? 'blocked:subject', 'subject');
  const operation = options.operation ?? 'audit';
  if (!ALLOWED_OPERATIONS.has(operation)) throw new Error('operation must be issue, rotate, revoke, or audit');
  const scopes = scopeList(options.scopes ?? options.scope ?? []);
  const evidenceRefs = evidenceRefsFor(operation, options.evidenceRefs ?? []);
  const operatorApprovalRef = options.operatorApprovalRef === undefined
    ? null
    : assertPublicSafeString(options.operatorApprovalRef, 'operator approval ref');
  const packet = buildApiKeyLifecyclePacket({
    tenant_id: tenantId,
    subject_ref: subjectRef,
    generated_at: generatedAt,
    operation,
    ...keyInputsFor({ operation, tenantId, subjectRef, scopes, generatedAt, evidenceRefs }),
    required_evidence_refs: evidenceRefs,
    operator_approval_ref: operatorApprovalRef,
  });
  validateApiKeyLifecyclePacket(packet);
  return {
    ...packet,
    schema: HOSTED_CLOUD_API_KEY_LIFECYCLE_PACKET_SCHEMA,
    release_target: HOSTED_API_KEY_LIFECYCLE_RELEASE_TARGET,
    tenant_id: tenantId,
    subject_ref: subjectRef,
    operation,
    scopes,
    boundary: scriptBoundary(),
  };
}

export function parseArgs(argv) {
  const args = {
    tenant: undefined,
    subject: undefined,
    operation: undefined,
    scopes: [],
    evidenceRefs: [],
    operatorApprovalRef: undefined,
    out: undefined,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }
    const readValue = (name) => {
      index += 1;
      if (index >= argv.length || argv[index].startsWith('--')) throw new Error(`${name} requires a value`);
      return argv[index];
    };
    if (arg === '--tenant') args.tenant = assertPublicSafeString(readValue('--tenant'), 'tenant');
    else if (arg === '--subject') args.subject = assertPublicSafeString(readValue('--subject'), 'subject');
    else if (arg === '--operation') args.operation = assertPublicSafeString(readValue('--operation'), 'operation');
    else if (arg === '--scope') args.scopes.push(assertPublicSafeString(readValue('--scope'), `scope ${args.scopes.length + 1}`));
    else if (arg === '--evidence-ref') args.evidenceRefs.push(parseEvidenceRef(readValue('--evidence-ref')));
    else if (arg === '--operator-approval-ref') args.operatorApprovalRef = assertPublicSafeString(readValue('--operator-approval-ref'), 'operator approval ref');
    else if (arg === '--out') args.out = assertRelativeOutFile(readValue('--out'));
    else throw new Error('unknown option; use --help');
  }
  return args;
}

export function usage() {
  return `Usage: node scripts/build-hosted-api-key-lifecycle.mjs [options]

Build a public-safe hosted API key lifecycle evidence packet. The script validates metadata, fingerprints, and opaque refs only; it does not issue keys, call providers, create accounts, revoke provider credentials, or write secret material.

Options:
  --tenant <id>                         Tenant id. Defaults to blocked:tenant.
  --subject <ref>                       Subject ref. Defaults to blocked:subject.
  --operation <issue|rotate|revoke|audit>
                                         Lifecycle operation. Defaults to audit.
  --scope <scope>                       Repeatable public-safe scope. Defaults to blocked:scope.
  --evidence-ref <key=status:ref>       Repeatable evidence ref. key=<ref> implies provided.
                                         Status: provided, blocked_external_dependency, blocked_missing_evidence.
                                         Keys: ${ALL_EVIDENCE_KEYS.join(', ')}
  --operator-approval-ref <ref>         Operator approval evidence ref.
  --out <file>                          Also write the packet JSON to a relative file path.
  --help                                Show this help.
`;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(usage());
    return 0;
  }
  const packet = buildHostedApiKeyLifecyclePacket(args);
  const json = `${JSON.stringify(packet, null, 2)}\n`;
  if (args.out) {
    try {
      await writeFile(args.out, json, 'utf8');
    } catch {
      throw new Error('failed to write API key lifecycle packet output');
    }
  }
  process.stdout.write(json);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`Error: ${error?.message ?? 'failed to build API key lifecycle packet'}\n`);
    process.exitCode = 1;
  });
}
