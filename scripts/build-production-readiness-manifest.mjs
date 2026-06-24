#!/usr/bin/env node
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HOSTED_READINESS_REQUIRED_DEPENDENCIES,
  normalizeDependencyEvidence,
  readinessEvidenceRefs,
} from '../packages/adapters/src/index.js';
import { INFRASTRUCTURE_READINESS_MANIFEST_SCHEMA, validateInfrastructureReadinessManifest } from './infrastructure-readiness.mjs';

const GATEWAY_REQUIRED_DEPENDENCIES = Object.freeze([
  'backend_host',
  'dns_tls',
  'durable_storage',
  'kms_or_secret_custody',
  'backup_restore',
  'monitoring',
  'siem_or_log_sink',
  'operator_acceptance',
  'runtime_auth',
  'admin_auth',
  'data_plane_auth',
  'network_access_policy',
  'kms_custody',
  'tenant_policy_approval',
  'usage_metering',
  'service_settlement',
  'monitoring_alerting',
  'public_site_security',
  'security_threat_model',
  'legal_compliance_approval',
  'support_sla',
  'incident_drill',
  'backup_restore_drill',
]);

function parseArgs(argv = process.argv.slice(2)) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      const key = arg.slice(2, eq);
      const value = arg.slice(eq + 1);
      if (flags.has(key)) flags.set(key, [...[].concat(flags.get(key)), value]);
      else flags.set(key, value);
    } else if (!argv[index + 1] || argv[index + 1].startsWith('--')) {
      flags.set(arg.slice(2), true);
    } else {
      const key = arg.slice(2);
      const value = argv[index + 1];
      if (flags.has(key)) flags.set(key, [...[].concat(flags.get(key)), value]);
      else flags.set(key, value);
      index += 1;
    }
  }
  return flags;
}

function getFlag(flags, names, fallback = undefined) {
  for (const name of names) if (flags.has(name)) return flags.get(name);
  return fallback;
}

function firstEnv(env, names) {
  for (const name of names) {
    const value = env?.[name];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function firstConfig(flags, env, flagNames, envNames, fallback = undefined) {
  const flagValue = getFlag(flags, flagNames);
  if (typeof flagValue === 'string' && flagValue.trim().length > 0) return flagValue.trim();
  return firstEnv(env, envNames) ?? fallback;
}

function maybeEndpoint(url, ref = undefined) {
  if (url === undefined && ref === undefined) return undefined;
  const endpoint = {};
  if (url !== undefined) endpoint.url = url;
  if (ref !== undefined) endpoint.ref = ref;
  return endpoint;
}

function refEvidence(ref, provider = 'operator') {
  if (ref === undefined) return undefined;
  return { status: 'verified', provider, ref, observed_at: new Date(0).toISOString() };
}

function collectDependencyEvidence(flags, env) {
  const evidence = {};
  const put = (key, value, provider = 'operator') => {
    const ref = typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
    if (ref !== undefined) evidence[key] = refEvidence(ref, provider);
  };
  put('backend_host', firstConfig(flags, env, ['backend-host-ref', 'backendHostRef'], ['ENIGMA_BACKEND_HOST_REF', 'ENIGMA_RELAY_BACKEND_HOST_REF', 'ENIGMA_GATEWAY_BACKEND_HOST_REF', 'ENIGMA_RELAY_DEPLOYMENT_REF', 'ENIGMA_GATEWAY_DEPLOYMENT_REF']));
  put('dns_tls', firstConfig(flags, env, ['dns-tls-ref', 'dnsTlsRef'], ['ENIGMA_DNS_TLS_REF', 'ENIGMA_RELAY_DNS_TLS_REF', 'ENIGMA_GATEWAY_DNS_TLS_REF', 'ENIGMA_TLS_REF']));
  put('durable_storage', firstConfig(flags, env, ['durable-storage-ref', 'durableStorageRef'], ['ENIGMA_DURABLE_STORAGE_REF', 'ENIGMA_EXTERNAL_STORAGE_REF', 'ENIGMA_EXTERNAL_STORAGE_DSN_FILE', 'ENIGMA_RELAY_STORAGE_REF', 'ENIGMA_GATEWAY_STORAGE_REF']));
  put('kms_or_secret_custody', firstConfig(flags, env, ['kms-ref', 'kmsRef', 'kms-or-secret-custody-ref'], ['ENIGMA_KMS_KEY_REF', 'ENIGMA_KMS_KEY_REF_FILE', 'ENIGMA_KMS_REF', 'ENIGMA_KMS_REF_FILE', 'ENIGMA_EXTERNAL_KMS_REF', 'ENIGMA_EXTERNAL_KMS_REF_FILE', 'ENIGMA_SECRETS_MANAGER_REF', 'ENIGMA_SECRETS_MANAGER_REF_FILE', 'ENIGMA_GATEWAY_SIGNER_REF', 'ENIGMA_GATEWAY_SIGNER_REF_FILE']));
  put('backup_restore', firstConfig(flags, env, ['backup-ref', 'backupRestoreRef'], ['ENIGMA_BACKUP_TARGET_REF', 'ENIGMA_BACKUP_TARGET_URI_FILE', 'ENIGMA_RESTORE_TARGET_REF']));
  put('monitoring', firstConfig(flags, env, ['monitoring-ref', 'monitoringRef'], ['ENIGMA_MONITORING_REF', 'ENIGMA_RELAY_MONITORING_REF', 'ENIGMA_GATEWAY_MONITORING_REF', 'ENIGMA_ALERTING_REF']));
  put('siem_or_log_sink', firstConfig(flags, env, ['siem-ref', 'siemRef', 'log-sink-ref'], ['ENIGMA_SIEM_REF', 'ENIGMA_AUDIT_SINK_REF', 'ENIGMA_LOG_SINK_REF', 'ENIGMA_SIEM_EXPORT_ENDPOINT_FILE']));
  put('runtime_auth', firstConfig(flags, env, ['runtime-auth-ref', 'runtimeAuthRef'], ['ENIGMA_RUNTIME_AUTH_REF', 'ENIGMA_RELAY_RUNTIME_AUTH_REF', 'ENIGMA_PAIRED_CLIENT_AUTH_REF']));
  put('admin_auth', firstConfig(flags, env, ['admin-auth-ref', 'adminAuthRef'], ['ENIGMA_ADMIN_AUTH_REF', 'ENIGMA_GATEWAY_ADMIN_AUTH_REF']));
  put('data_plane_auth', firstConfig(flags, env, ['data-plane-auth-ref', 'dataPlaneAuthRef'], ['ENIGMA_DATA_PLANE_AUTH_REF', 'ENIGMA_GATEWAY_DATA_PLANE_AUTH_REF']));
  put('operator_acceptance', firstConfig(flags, env, ['operator-acceptance-ref', 'operatorAcceptanceRef'], ['ENIGMA_OPERATOR_ACCEPTANCE_REF', 'ENIGMA_OPERATOR_ACCEPTANCE_EVIDENCE_URI', 'ENIGMA_OPERATOR_ACCEPTANCE_EVIDENCE_URI_FILE']));
  put('network_access_policy', firstConfig(flags, env, ['network-access-policy-ref', 'networkAccessPolicyRef'], ['ENIGMA_NETWORK_ACCESS_POLICY_REF', 'ENIGMA_NETWORK_POLICY_REF']));
  put('kms_custody', firstConfig(flags, env, ['kms-custody-ref', 'kmsCustodyRef'], ['ENIGMA_KMS_CUSTODY_REF', 'ENIGMA_KEY_CUSTODY_REF']));
  put('tenant_policy_approval', firstConfig(flags, env, ['tenant-policy-approval-ref', 'tenantPolicyApprovalRef'], ['ENIGMA_TENANT_POLICY_APPROVAL_REF', 'ENIGMA_TENANT_POLICY_REF']));
  put('usage_metering', firstConfig(flags, env, ['usage-metering-ref', 'usageMeteringRef'], ['ENIGMA_USAGE_METERING_REF', 'ENIGMA_METERING_REF']));
  put('service_settlement', firstConfig(flags, env, ['service-settlement-ref', 'serviceSettlementRef'], ['ENIGMA_SERVICE_SETTLEMENT_REF', 'ENIGMA_SETTLEMENT_REF']));
  put('monitoring_alerting', firstConfig(flags, env, ['monitoring-alerting-ref', 'monitoringAlertingRef'], ['ENIGMA_MONITORING_ALERTING_REF', 'ENIGMA_ALERTING_EVIDENCE_REF']));
  put('public_site_security', firstConfig(flags, env, ['public-site-security-ref', 'publicSiteSecurityRef'], ['ENIGMA_PUBLIC_SITE_SECURITY_REF', 'ENIGMA_SITE_SECURITY_REF']));
  put('security_threat_model', firstConfig(flags, env, ['security-threat-model-ref', 'securityThreatModelRef'], ['ENIGMA_SECURITY_THREAT_MODEL_REF', 'ENIGMA_THREAT_MODEL_REF']));
  put('legal_compliance_approval', firstConfig(flags, env, ['legal-compliance-ref', 'legalComplianceRef', 'legal-compliance-approval-ref', 'legalComplianceApprovalRef'], ['ENIGMA_LEGAL_COMPLIANCE_REF', 'ENIGMA_LEGAL_APPROVAL_REF', 'ENIGMA_LEGAL_COMPLIANCE_APPROVAL_REF']));
  put('support_sla', firstConfig(flags, env, ['support-sla-ref', 'supportSlaRef'], ['ENIGMA_SUPPORT_SLA_REF']));
  put('incident_drill', firstConfig(flags, env, ['incident-drill-ref', 'incidentDrillRef'], ['ENIGMA_INCIDENT_DRILL_REF']));
  put('backup_restore_drill', firstConfig(flags, env, ['backup-restore-drill-ref', 'backupRestoreDrillRef'], ['ENIGMA_BACKUP_RESTORE_DRILL_REF']));
  return evidence;
}

function asArray(value) {
  if (value === undefined || value === true) return [];
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

export async function buildProductionReadinessManifest(options = {}) {
  const flags = options.flags instanceof Map ? options.flags : parseArgs(options.argv ?? []);
  const env = options.env ?? process.env;
  const dependencyEvidence = collectDependencyEvidence(flags, env);
  const normalizedEvidence = normalizeDependencyEvidence(dependencyEvidence, {
    generated_at: options.generated_at ?? options.generatedAt ?? new Date(0).toISOString(),
    required_keys: GATEWAY_REQUIRED_DEPENDENCIES,
  });
  const refs = {
    ...readinessEvidenceRefs(normalizedEvidence.evidence),
  };
  const relayRef = firstConfig(flags, env, ['relay-ref', 'relayRef'], ['ENIGMA_RELAY_REF', 'ENIGMA_RELAY_DEPLOYMENT_REF']);
  const gatewayRef = firstConfig(flags, env, ['gateway-ref', 'gatewayRef'], ['ENIGMA_GATEWAY_REF', 'ENIGMA_GATEWAY_DEPLOYMENT_REF']);
  if (relayRef !== undefined) refs.relay = relayRef;
  if (gatewayRef !== undefined) refs.gateway = gatewayRef;
  const operatorDecision = firstConfig(flags, env, ['operator-decision', 'operatorDecision'], ['ENIGMA_OPERATOR_DECISION', 'ENIGMA_OPERATOR_ACCEPTANCE_DECISION'], 'pending');
  const operatorRef = refs.operator_acceptance ?? firstConfig(flags, env, ['operator-acceptance-ref', 'operatorAcceptanceRef'], ['ENIGMA_OPERATOR_ACCEPTANCE_REF', 'ENIGMA_OPERATOR_ACCEPTANCE_EVIDENCE_URI', 'ENIGMA_OPERATOR_ACCEPTANCE_EVIDENCE_URI_FILE']);
  const externalBlockers = asArray(getFlag(flags, ['external-blocker', 'externalBlocker']));
  for (const missing of normalizedEvidence.missing_keys) externalBlockers.push(`missing refs.${missing}`);
  if (operatorDecision !== 'go') externalBlockers.push(`operator acceptance decision is ${operatorDecision}`);
  const publicSiteUrl = firstConfig(flags, env, ['public-site-url', 'publicSiteUrl'], ['ENIGMA_PUBLIC_SITE_URL'], 'https://enigmamemory.com/');
  const cloudflareProjectName = firstConfig(flags, env, ['cloudflare-project-name', 'cloudflareProjectName'], ['CLOUDFLARE_PAGES_PROJECT_NAME', 'ENIGMA_CLOUDFLARE_PAGES_PROJECT_NAME'], 'enigma-memory');
  const cloudflarePagesUrl = firstConfig(flags, env, ['cloudflare-pages-url', 'cloudflarePagesUrl'], ['ENIGMA_CLOUDFLARE_PAGES_URL'], 'https://enigma-memory.pages.dev/');
  const cloudflareAccountId = firstConfig(flags, env, ['cloudflare-account-id', 'cloudflareAccountId'], ['CLOUDFLARE_ACCOUNT_ID']);
  const manifest = {
    schema: INFRASTRUCTURE_READINESS_MANIFEST_SCHEMA,
    name: firstConfig(flags, env, ['name'], ['ENIGMA_READINESS_MANIFEST_NAME'], 'Enigma production readiness manifest'),
    mode: firstConfig(flags, env, ['mode'], ['ENIGMA_READINESS_MODE'], 'hosted-live'),
    public_site: maybeEndpoint(publicSiteUrl),
    cloudflare_pages: {
      project_name: cloudflareProjectName,
      project_url: cloudflarePagesUrl,
      ...(cloudflareAccountId === undefined ? {} : { account_id: cloudflareAccountId }),
    },
    relay: maybeEndpoint(
      firstConfig(flags, env, ['relay-url', 'relayUrl'], ['ENIGMA_RELAY_READY_URL', 'ENIGMA_RELAY_PUBLIC_READY_URL'], 'https://relay.enigmamemory.com/readyz'),
      relayRef
    ),
    gateway: maybeEndpoint(
      firstConfig(flags, env, ['gateway-url', 'gatewayUrl'], ['ENIGMA_GATEWAY_READY_URL', 'ENIGMA_GATEWAY_PUBLIC_READY_URL'], 'https://gateway.enigmamemory.com/readyz'),
      gatewayRef
    ),
    refs,
    operator_acceptance: {
      decision: operatorDecision,
      ...(operatorRef === undefined ? {} : { ref: operatorRef }),
    },
    external_blockers: [...new Set(externalBlockers)],
    claim_boundary: [
      'Generated readiness manifests contain public-safe refs only and never secret values.',
      'This manifest is not hosted backend readiness until live /readyz checks, Cloudflare/project observation, operator acceptance, and external blockers are all clear.',
      'Missing refs remain explicit blockers rather than silent defaults.',
    ],
  };
  return validateInfrastructureReadinessManifest(manifest);
}

async function main() {
  const flags = parseArgs();
  const manifest = await buildProductionReadinessManifest({ flags });
  const out = getFlag(flags, ['out']);
  const text = `${JSON.stringify(manifest, null, 2)}\n`;
  if (out && out !== true) {
    const path = resolve(String(out));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text, 'utf8');
    process.stdout.write(`${JSON.stringify({ ok: true, out: path, schema: manifest.schema, external_blockers: manifest.external_blockers }, null, 2)}\n`);
    return;
  }
  process.stdout.write(text);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.name ?? 'Error'}: ${error.message}\n`);
    process.exitCode = 1;
  });
}
