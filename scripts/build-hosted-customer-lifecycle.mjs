#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import {
  HOSTED_CLOUD_API_KEY_SCHEMA,
  HOSTED_CLOUD_BACKUP_DRILL_SCHEMA,
  HOSTED_CLOUD_DASHBOARD_SCHEMA,
  HOSTED_CLOUD_CUSTOMER_LIFECYCLE_PACKET_SCHEMA,
  HOSTED_CLOUD_CUSTOMER_LIFECYCLE_PHASES,
  HOSTED_CLOUD_EXTERNAL_BLOCKERS,
  HOSTED_CLOUD_INCIDENT_SLA_SCHEMA,
  HOSTED_CLOUD_TENANT_SCHEMA,
  HOSTED_CLOUD_USAGE_BILLING_SCHEMA,
  HOSTED_CLOUD_USER_ACCOUNT_SCHEMA,
  HOSTED_CLOUD_VAULT_SCHEMA,
  buildApiKeyContract,
  buildBackupDrillContract,
  buildDashboardSummary,
  buildHostedVaultContract,
  buildIncidentSlaRefs,
  buildTenantContract,
  buildUsageBillingRecord,
  buildUserAccountContract,
  buildCustomerLifecyclePacket,
  validateCustomerLifecyclePacket,
} from '../packages/hosted-cloud/src/index.js';

export const HOSTED_CUSTOMER_LIFECYCLE_PACKET_SCHEMA = HOSTED_CLOUD_CUSTOMER_LIFECYCLE_PACKET_SCHEMA;
export const HOSTED_CUSTOMER_LIFECYCLE_RELEASE_TARGET = '0.1.9';

const PROVIDED = 'provided';
const BLOCKED_MISSING = 'blocked_missing_evidence';
const BLOCKED_EXTERNAL = 'blocked_external_dependency';
const ALLOWED_STATUSES = new Set([PROVIDED, BLOCKED_MISSING, BLOCKED_EXTERNAL]);
const STATUS_ALIASES = Object.freeze({
  blocked: BLOCKED_MISSING,
  missing: BLOCKED_MISSING,
  external: BLOCKED_EXTERNAL,
});

const CONTRACT_EVIDENCE = Object.freeze([
  {
    key: 'user_account',
    label: 'Hosted user account contract',
    schema: HOSTED_CLOUD_USER_ACCOUNT_SCHEMA,
    contractKey: 'user_account',
    idField: 'account_id',
  },
  {
    key: 'tenant',
    label: 'Hosted tenant contract',
    schema: HOSTED_CLOUD_TENANT_SCHEMA,
    contractKey: 'tenant',
    idField: 'tenant_id',
  },
  {
    key: 'hosted_vault',
    label: 'Hosted vault contract',
    schema: HOSTED_CLOUD_VAULT_SCHEMA,
    contractKey: 'hosted_vault',
    idField: 'vault_id',
  },
  {
    key: 'api_key_metadata',
    label: 'API key metadata contract',
    schema: HOSTED_CLOUD_API_KEY_SCHEMA,
    contractKey: 'api_key_metadata',
    idField: 'api_key_id',
  },
  {
    key: 'billing',
    label: 'Usage billing contract',
    schema: HOSTED_CLOUD_USAGE_BILLING_SCHEMA,
    contractKey: 'billing',
    idField: 'billing_record_id',
  },
  {
    key: 'dashboard',
    label: 'Dashboard summary contract',
    schema: HOSTED_CLOUD_DASHBOARD_SCHEMA,
    contractKey: 'dashboard',
    idField: 'dashboard_id',
  },
  {
    key: 'backup_drill',
    label: 'Backup drill contract',
    schema: HOSTED_CLOUD_BACKUP_DRILL_SCHEMA,
    contractKey: 'backup_drill',
    idField: 'backup_drill_id',
  },
  {
    key: 'incident_sla_refs',
    label: 'Incident and SLA refs contract',
    schema: HOSTED_CLOUD_INCIDENT_SLA_SCHEMA,
    contractKey: 'incident_sla_refs',
    idField: 'incident_sla_id',
  },
]);
const CONTRACT_EVIDENCE_KEYS = new Set(CONTRACT_EVIDENCE.map(({ key }) => key));
const EXTERNAL_BLOCKER_KEYS = new Set(HOSTED_CLOUD_EXTERNAL_BLOCKERS);
const ADDITIONAL_LIFECYCLE_EVIDENCE_KEYS = Object.freeze(['monitoring']);
const EVIDENCE_KEY_ALIASES = Object.freeze({
  account: 'user_account',
  vault: 'hosted_vault',
  api_key: 'api_key_metadata',
  backup: 'backup_drill',
  incident_sla: 'incident_sla_refs',
  support: 'support_ownership',
  legal: 'legal_docs',
  security_review: 'external_security_review',
});
export const HOSTED_CUSTOMER_LIFECYCLE_EVIDENCE_KEYS = Object.freeze([
  ...CONTRACT_EVIDENCE.map(({ key }) => key),
  ...HOSTED_CLOUD_EXTERNAL_BLOCKERS,
  ...ADDITIONAL_LIFECYCLE_EVIDENCE_KEYS,
]);
const LIFECYCLE_EVIDENCE_KEY_SET = new Set([
  ...HOSTED_CUSTOMER_LIFECYCLE_EVIDENCE_KEYS,
  ...Object.keys(EVIDENCE_KEY_ALIASES),
]);

const SECRET_VALUE_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|\b(?:raw memory|plaintext prompts?|plain text prompts?|private prompts?|provider responses?|full transcript|decrypted memory|credentials?|secrets?|passwords?|private keys?|api key secret|api secrets?|access tokens?|refresh tokens?|token values?|credential material)\b)/iu;
const FORBIDDEN_CLAIM_RE = /(?:token\s+(?:roi|profit|return|investment|price)|financial\s+roi|roi\s+claim|(?:roi|profit|return)\s+(?:from|on)\s+token|guaranteed\s+(?:savings|profit|return)|provider(?:-side|\s+side)?\s+(?:deletion|erasure)|model\s+(?:forgetting|forgot|erasure)|makes?\s+models?\s+forget|deleted\s+from\s+every\s+provider)/iu;

function assertPublicSafeString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be a non-empty public ref`);
  if (SECRET_VALUE_RE.test(value) || FORBIDDEN_CLAIM_RE.test(value)) {
    throw new Error(`${label} contains non-public hosted-cloud material`);
  }
  return value.trim();
}

function normalizeStatus(status, key) {
  const normalized = STATUS_ALIASES[status] ?? status;
  if (!ALLOWED_STATUSES.has(normalized)) throw new Error('evidence status must be provided, blocked_missing_evidence, or blocked_external_dependency');
  if (EXTERNAL_BLOCKER_KEYS.has(key) && normalized === BLOCKED_MISSING) return BLOCKED_EXTERNAL;
  if (CONTRACT_EVIDENCE_KEYS.has(key) && normalized === BLOCKED_EXTERNAL) return BLOCKED_MISSING;
  return normalized;
}

function defaultEvidenceRef(key) {
  const status = EXTERNAL_BLOCKER_KEYS.has(key) ? BLOCKED_EXTERNAL : BLOCKED_MISSING;
  return {
    key,
    status,
    ref: `blocked:${key}`,
    blocker: EXTERNAL_BLOCKER_KEYS.has(key)
      ? `External ${key.replaceAll('_', ' ')} evidence is not provided.`
      : `Public-safe ${key.replaceAll('_', ' ')} evidence is not provided.`,
  };
}

function normalizeEvidenceRecord(key, record) {
  const status = normalizeStatus(record.status ?? PROVIDED, key);
  const ref = assertPublicSafeString(record.ref, 'evidence ref');
  const output = { key, status, ref };
  if (status !== PROVIDED) output.blocker = record.blocker ?? defaultEvidenceRef(key).blocker;
  return output;
}

export function parseEvidenceRef(value) {
  const raw = assertPublicSafeString(value, 'evidence ref argument');
  const equalsIndex = raw.indexOf('=');
  if (equalsIndex <= 0 || equalsIndex === raw.length - 1) throw new Error('evidence refs must use key=status:ref');
  const rawKey = raw.slice(0, equalsIndex).trim();
  const key = EVIDENCE_KEY_ALIASES[rawKey] ?? rawKey;
  if (!LIFECYCLE_EVIDENCE_KEY_SET.has(rawKey) || !HOSTED_CUSTOMER_LIFECYCLE_EVIDENCE_KEYS.includes(key)) throw new Error(`evidence key must be one of: ${HOSTED_CUSTOMER_LIFECYCLE_EVIDENCE_KEYS.join(', ')}`);
  const body = raw.slice(equalsIndex + 1).trim();
  const colonIndex = body.indexOf(':');
  if (colonIndex > 0) {
    const possibleStatus = body.slice(0, colonIndex);
    if (ALLOWED_STATUSES.has(possibleStatus) || STATUS_ALIASES[possibleStatus]) {
      return normalizeEvidenceRecord(key, { status: possibleStatus, ref: body.slice(colonIndex + 1) });
    }
  }
  return normalizeEvidenceRecord(key, { status: PROVIDED, ref: body });
}

function normalizeEvidenceRefs(records = []) {
  const refs = Object.fromEntries(HOSTED_CUSTOMER_LIFECYCLE_EVIDENCE_KEYS.map((key) => [key, defaultEvidenceRef(key)]));
  for (const rawRecord of records) {
    const record = typeof rawRecord === 'string' ? parseEvidenceRef(rawRecord) : rawRecord;
    refs[record.key] = normalizeEvidenceRecord(record.key, record);
  }
  return refs;
}

function operatorEvidenceRefsFrom(evidenceRefs) {
  return Object.fromEntries(HOSTED_CLOUD_EXTERNAL_BLOCKERS.map((key) => {
    const evidence = evidenceRefs[key];
    if (evidence.status === PROVIDED) return [key, { status: PROVIDED, ref: evidence.ref }];
    return [key, { status: BLOCKED_EXTERNAL, ref: evidence.ref, blocker: evidence.blocker }];
  }));
}

function phaseFor(definition, evidence, contract) {
  return {
    phase: definition.key,
    label: definition.label,
    contract_schema: definition.schema,
    evidence_ref: evidence.ref,
    status: evidence.status === PROVIDED ? 'evidence_ref_provided' : evidence.status,
    contract_id: contract?.[definition.idField] ?? null,
  };
}

function lifecycleReadiness(evidenceRefs, operatorGoLiveRef) {
  const missingEvidenceRefs = Object.values(evidenceRefs)
    .filter((evidence) => evidence.status !== PROVIDED)
    .map(({ key, status, ref, blocker }) => ({ key, status, ref, blocker }));
  const allEvidenceProvided = missingEvidenceRefs.length === 0;
  const operatorGoLiveProvided = typeof operatorGoLiveRef === 'string' && operatorGoLiveRef.length > 0;
  const hostedCloudSellable = allEvidenceProvided && operatorGoLiveProvided;
  const status = hostedCloudSellable
    ? 'operator_approved_evidence_packet'
    : allEvidenceProvided
      ? 'blocked_operator_go_live_approval'
      : 'blocked_missing_evidence';
  return {
    status,
    hosted_cloud_sellable: hostedCloudSellable,
    evidence_validation_only: true,
    provider_wiring_performed: false,
    no_external_provider_calls: true,
    all_evidence_refs_provided: allEvidenceProvided,
    operator_go_live_approval_ref: operatorGoLiveRef ?? 'blocked:operator_go_live_approval',
    operator_go_live_approval_provided: operatorGoLiveProvided,
    missing_evidence_refs: missingEvidenceRefs,
    external_blockers: HOSTED_CLOUD_EXTERNAL_BLOCKERS
      .map((key) => evidenceRefs[key])
      .filter((evidence) => evidence.status !== PROVIDED)
      .map(({ key, ref, blocker }) => ({ key, ref, blocker })),
  };
}

function refFor(evidenceRefs, key) {
  return evidenceRefs[key].ref;
}

function buildContractFragments({ tenantId, generatedAt, evidenceRefs }) {
  const operator_evidence_refs = operatorEvidenceRefsFrom(evidenceRefs);
  const base = { tenant_id: tenantId, generated_at: generatedAt, operator_evidence_refs };
  const tenant = buildTenantContract({
    ...base,
    tenant_ref: refFor(evidenceRefs, 'tenant'),
    policy_ref: refFor(evidenceRefs, 'tenant'),
    retention_policy_ref: refFor(evidenceRefs, 'tenant'),
    data_residency_ref: refFor(evidenceRefs, 'tenant'),
  });
  const userAccount = buildUserAccountContract({
    ...base,
    subject_ref: refFor(evidenceRefs, 'user_account'),
    auth_provider_user_ref: refFor(evidenceRefs, 'auth_provider'),
  });
  const hostedVault = buildHostedVaultContract({
    ...base,
    vault_ref: refFor(evidenceRefs, 'hosted_vault'),
    storage_ref: refFor(evidenceRefs, 'hosted_vault'),
    kms_key_ref: refFor(evidenceRefs, 'hosted_vault'),
    backup_policy_ref: refFor(evidenceRefs, 'backup_drill'),
    retention_policy_ref: refFor(evidenceRefs, 'tenant'),
  });
  const apiKeyMetadata = buildApiKeyContract({
    ...base,
    subject_ref: refFor(evidenceRefs, 'user_account'),
    key_fingerprint: `fingerprint:${refFor(evidenceRefs, 'api_key_metadata')}`,
    issued_at: generatedAt,
    rotation_ref: refFor(evidenceRefs, 'api_key_metadata'),
  });
  const billing = buildUsageBillingRecord({
    ...base,
    period_start: generatedAt,
    period_end: generatedAt,
    billing_provider_customer_ref: refFor(evidenceRefs, 'billing_provider'),
    usage_aggregate_ref: refFor(evidenceRefs, 'billing'),
    metered_event_count: 0,
    billable_units: 0,
    amount_due_minor_units: 0,
  });
  const incidentSlaRefs = buildIncidentSlaRefs({
    ...base,
    incident_response_ref: refFor(evidenceRefs, 'incident_sla_refs'),
    sla_policy_ref: refFor(evidenceRefs, 'incident_sla_refs'),
    support_owner_ref: refFor(evidenceRefs, 'support_ownership'),
    escalation_policy_ref: refFor(evidenceRefs, 'incident_sla_refs'),
    status_page_ref: refFor(evidenceRefs, 'incident_sla_refs'),
  });
  const backupDrill = buildBackupDrillContract({
    ...base,
    vault_ref: hostedVault.vault_ref,
    performed_at: generatedAt,
    backup_snapshot_ref: refFor(evidenceRefs, 'backup_drill'),
    restore_evidence_ref: refFor(evidenceRefs, 'backup_drill'),
    rpo_minutes: 0,
    rto_minutes: 0,
  });
  const dashboard = buildDashboardSummary({
    ...base,
    account_count: 0,
    active_api_key_count: 0,
    hosted_vault_count: 0,
    billing_period_ref: billing.billing_record_id,
    open_incident_count: 0,
    backup_drill_ref: backupDrill.backup_drill_id,
    incident_sla_ref: incidentSlaRefs.incident_sla_id,
  });
  return {
    user_account: userAccount,
    tenant,
    hosted_vault: hostedVault,
    api_key_metadata: apiKeyMetadata,
    billing,
    dashboard,
    backup_drill: backupDrill,
    incident_sla_refs: incidentSlaRefs,
  };
}

function canonicalContractsFrom(contracts) {
  return {
    account: contracts.user_account,
    tenant: contracts.tenant,
    vault: contracts.hosted_vault,
    api_key: contracts.api_key_metadata,
    billing: contracts.billing,
    dashboard: contracts.dashboard,
    backup: contracts.backup_drill,
    incident_sla: contracts.incident_sla_refs,
  };
}

function firstBlockedEvidence(evidenceRefs, keys) {
  for (const key of keys) {
    if (evidenceRefs[key].status !== PROVIDED) return evidenceRefs[key];
  }
  return null;
}

function providedLifecycleEvidence(evidence) {
  return { status: PROVIDED, ref: evidence.ref };
}

function blockedLifecycleEvidence(evidence) {
  return {
    status: BLOCKED_EXTERNAL,
    ref: evidence.ref,
    blocker: evidence.blocker,
  };
}

function coreEvidenceFor(evidenceRefs, phase, keys) {
  const blocked = firstBlockedEvidence(evidenceRefs, keys);
  if (blocked) return blockedLifecycleEvidence(blocked);
  return providedLifecycleEvidence(evidenceRefs[keys[0]]);
}

function coreRequiredEvidenceRefs(evidenceRefs) {
  const refs = {
    account: coreEvidenceFor(evidenceRefs, 'account', ['user_account', 'auth_provider']),
    tenant: coreEvidenceFor(evidenceRefs, 'tenant', ['tenant']),
    vault: coreEvidenceFor(evidenceRefs, 'vault', ['hosted_vault']),
    api_key: coreEvidenceFor(evidenceRefs, 'api_key', ['api_key_metadata']),
    billing: coreEvidenceFor(evidenceRefs, 'billing', ['billing', 'billing_provider']),
    dashboard: coreEvidenceFor(evidenceRefs, 'dashboard', ['dashboard']),
    backup: coreEvidenceFor(evidenceRefs, 'backup', ['backup_drill']),
    incident_sla: coreEvidenceFor(evidenceRefs, 'incident_sla', ['incident_sla_refs']),
    support: coreEvidenceFor(evidenceRefs, 'support', ['support_ownership']),
    monitoring: coreEvidenceFor(evidenceRefs, 'monitoring', ['monitoring']),
    legal: coreEvidenceFor(evidenceRefs, 'legal', ['legal_docs', 'data_processing_terms']),
    security_review: coreEvidenceFor(evidenceRefs, 'security_review', ['external_security_review']),
  };
  return Object.fromEntries(HOSTED_CLOUD_CUSTOMER_LIFECYCLE_PHASES
    .filter((phase) => phase !== 'operator_go_live')
    .map((phase) => [phase, refs[phase]]));
}

function scriptBoundary() {
  return {
    public_safe_packet_only: true,
    aggregates_contract_validators_only: true,
    deploys_or_calls_external_providers: false,
    sensitive_material_written: false,
    customer_content_stored: false,
    provider_wiring_required_elsewhere: true,
  };
}

export function buildHostedCustomerLifecyclePacket(options = {}) {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const tenantId = assertPublicSafeString(options.tenant ?? options.tenantId ?? 'blocked:tenant', 'tenant');
  const domain = assertPublicSafeString(options.domain ?? 'blocked:domain', 'domain');
  const environment = assertPublicSafeString(options.environment ?? 'blocked:environment', 'environment');
  const operatorGoLiveRef = options.operatorGoLiveRef === undefined
    ? null
    : assertPublicSafeString(options.operatorGoLiveRef, 'operator go-live ref');
  const evidenceRefs = normalizeEvidenceRefs(options.evidenceRefs ?? []);
  const contractFragments = buildContractFragments({ tenantId, generatedAt, evidenceRefs });
  const packet = buildCustomerLifecyclePacket({
    generated_at: generatedAt,
    contracts: canonicalContractsFrom(contractFragments),
    required_evidence_refs: coreRequiredEvidenceRefs(evidenceRefs),
    operator_go_live_ref: operatorGoLiveRef,
  });
  validateCustomerLifecyclePacket(packet);
  return {
    ...packet,
    release_target: HOSTED_CUSTOMER_LIFECYCLE_RELEASE_TARGET,
    tenant_id: tenantId,
    domain,
    environment,
    evidence_refs: Object.fromEntries(Object.entries(evidenceRefs).map(([key, value]) => [key, { ...value }])),
    operator_external_evidence_refs: operatorEvidenceRefsFrom(evidenceRefs),
    boundary: scriptBoundary(),
  };
}

export function parseArgs(argv) {
  const args = {
    tenant: undefined,
    domain: undefined,
    environment: undefined,
    operatorGoLiveRef: undefined,
    evidenceRefs: [],
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
    else if (arg === '--domain') args.domain = assertPublicSafeString(readValue('--domain'), 'domain');
    else if (arg === '--environment') args.environment = assertPublicSafeString(readValue('--environment'), 'environment');
    else if (arg === '--operator-go-live-ref') args.operatorGoLiveRef = assertPublicSafeString(readValue('--operator-go-live-ref'), 'operator go-live ref');
    else if (arg === '--evidence-ref') args.evidenceRefs.push(parseEvidenceRef(readValue('--evidence-ref')));
    else if (arg === '--out') args.out = assertPublicSafeString(readValue('--out'), 'output file');
    else throw new Error('unknown option; use --help');
  }
  return args;
}

export function usage() {
  return `Usage: node scripts/build-hosted-customer-lifecycle.mjs [options]

Build a public-safe hosted customer lifecycle packet. This script validates local contract fragments only; it does not deploy, create accounts, call providers, or write secrets.

Options:
  --tenant <id>                    Tenant id. Defaults to blocked:tenant.
  --domain <domain>                Customer domain. Defaults to blocked:domain.
  --environment <env>              Environment label. Defaults to blocked:environment.
  --operator-go-live-ref <ref>     Explicit operator approval evidence ref.
  --evidence-ref <key=status:ref>  Repeatable evidence ref. key=<ref> implies provided.
                                   Status: provided, blocked_missing_evidence, blocked_external_dependency.
                                   Keys: ${HOSTED_CUSTOMER_LIFECYCLE_EVIDENCE_KEYS.join(', ')}
  --out <file>                     Also write the packet JSON to a file.
  --help                           Show this help.
`;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(usage());
    return 0;
  }
  const packet = buildHostedCustomerLifecyclePacket(args);
  const json = `${JSON.stringify(packet, null, 2)}\n`;
  if (args.out) {
    try {
      await writeFile(args.out, json, 'utf8');
    } catch {
      throw new Error('failed to write lifecycle packet output');
    }
  }
  process.stdout.write(json);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`Error: ${error?.message ?? 'failed to build lifecycle packet'}\n`);
    process.exitCode = 1;
  });
}
