#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIRED_REF_KEYS } from './validate-hosted-backend-live.mjs';

export const PRODUCTION_BACKEND_ENV_KIT_SCHEMA = 'enigma.production_backend_env_kit.v1';
export const HOSTED_BACKEND_REF_MAP_SCHEMA = 'enigma.production_backend_hosted_ref_map.v1';

const DEFAULTS = Object.freeze({
  domain: 'enigmamemory.com',
  tenant: 'enigma-memory',
  environment: 'production',
});
const HOSTED_REF_KEYS = Object.freeze([...REQUIRED_REF_KEYS]);

const HOSTED_REF_ENV_NAMES = Object.freeze({
  backend_host: ['ENIGMA_BACKEND_HOST_REF', 'ENIGMA_RELAY_DEPLOYMENT_REF', 'ENIGMA_GATEWAY_DEPLOYMENT_REF', 'ENIGMA_RELAY_BACKEND_HOST_REF', 'ENIGMA_GATEWAY_BACKEND_HOST_REF'],
  dns_tls: ['ENIGMA_DNS_TLS_REF', 'ENIGMA_TLS_REF', 'ENIGMA_RELAY_DNS_TLS_REF', 'ENIGMA_GATEWAY_DNS_TLS_REF'],
  durable_storage: ['ENIGMA_DURABLE_STORAGE_REF', 'ENIGMA_EXTERNAL_STORAGE_REF', 'ENIGMA_RELAY_STORAGE_REF', 'ENIGMA_GATEWAY_STORAGE_REF', 'ENIGMA_EXTERNAL_STORAGE_DSN_FILE'],
  kms_or_secret_custody: ['ENIGMA_KMS_KEY_REF', 'ENIGMA_KMS_REF', 'ENIGMA_GATEWAY_SIGNER_REF', 'ENIGMA_KMS_KEY_REF_FILE', 'ENIGMA_GATEWAY_SIGNING_KEY_FILE'],
  backup_restore: ['ENIGMA_BACKUP_TARGET_REF', 'ENIGMA_RESTORE_TARGET_REF', 'ENIGMA_BACKUP_TARGET_URI_FILE'],
  monitoring: ['ENIGMA_MONITORING_REF', 'ENIGMA_RELAY_MONITORING_REF', 'ENIGMA_GATEWAY_MONITORING_REF'],
  siem_or_log_sink: ['ENIGMA_SIEM_REF', 'ENIGMA_AUDIT_SINK_REF', 'ENIGMA_LOG_SINK_REF', 'ENIGMA_SIEM_EXPORT_ENDPOINT_FILE'],
  operator_acceptance: ['ENIGMA_OPERATOR_ACCEPTANCE_REF', 'ENIGMA_OPERATOR_ACCEPTANCE_EVIDENCE_URI', 'ENIGMA_OPERATOR_ACCEPTANCE_EVIDENCE_URI_FILE'],
  runtime_auth: ['ENIGMA_RUNTIME_AUTH_REF', 'ENIGMA_RELAY_RUNTIME_AUTH_REF', 'ENIGMA_PAIRED_CLIENT_AUTH_REF'],
  admin_auth: ['ENIGMA_ADMIN_AUTH_REF', 'ENIGMA_GATEWAY_ADMIN_AUTH_REF'],
  data_plane_auth: ['ENIGMA_DATA_PLANE_AUTH_REF', 'ENIGMA_GATEWAY_DATA_PLANE_AUTH_REF'],
  network_access_policy: ['ENIGMA_NETWORK_ACCESS_POLICY_REF', 'ENIGMA_NETWORK_POLICY_REF'],
  kms_custody: ['ENIGMA_KMS_CUSTODY_REF', 'ENIGMA_KEY_CUSTODY_REF'],
  tenant_policy_approval: ['ENIGMA_TENANT_POLICY_APPROVAL_REF', 'ENIGMA_TENANT_POLICY_REF'],
  usage_metering: ['ENIGMA_USAGE_METERING_REF', 'ENIGMA_METERING_REF'],
  service_settlement: ['ENIGMA_SERVICE_SETTLEMENT_REF', 'ENIGMA_SETTLEMENT_REF'],
  monitoring_alerting: ['ENIGMA_MONITORING_ALERTING_REF', 'ENIGMA_ALERTING_EVIDENCE_REF'],
  public_site_security: ['ENIGMA_PUBLIC_SITE_SECURITY_REF', 'ENIGMA_SITE_SECURITY_REF'],
  security_threat_model: ['ENIGMA_SECURITY_THREAT_MODEL_REF', 'ENIGMA_THREAT_MODEL_REF'],
  legal_compliance_approval: ['ENIGMA_LEGAL_COMPLIANCE_APPROVAL_REF', 'ENIGMA_LEGAL_APPROVAL_REF', 'ENIGMA_LEGAL_COMPLIANCE_REF'],
  support_sla: ['ENIGMA_SUPPORT_SLA_REF'],
  incident_drill: ['ENIGMA_INCIDENT_DRILL_REF'],
  backup_restore_drill: ['ENIGMA_BACKUP_RESTORE_DRILL_REF'],
  relay_deployment: ['ENIGMA_RELAY_DEPLOYMENT_REF', 'ENIGMA_RELAY_BACKEND_HOST_REF'],
  gateway_deployment: ['ENIGMA_GATEWAY_DEPLOYMENT_REF', 'ENIGMA_GATEWAY_BACKEND_HOST_REF'],
});

const SECRET_PLACEHOLDERS = Object.freeze([
  {
    id: 'relay_signing_key',
    file: 'operator-secrets/relay-signing-key',
    mounted_as: '/run/secrets/relay_signing_key',
    used_by: ['relay'],
    placeholder: '<operator-provided-relay-signing-key-file>',
  },
  {
    id: 'gateway_signing_key',
    file: 'operator-secrets/gateway-signing-key',
    mounted_as: '/run/secrets/gateway_signing_key',
    used_by: ['gateway'],
    placeholder: '<operator-provided-gateway-signing-key-file>',
  },
  {
    id: 'external_storage_dsn',
    file: 'operator-secrets/external-storage-dsn',
    mounted_as: '/run/secrets/external_storage_dsn',
    used_by: ['relay', 'gateway'],
    placeholder: '<operator-provided-external-storage-dsn-file>',
  },
  {
    id: 'kms_key_ref',
    file: 'operator-secrets/kms-key-ref',
    mounted_as: '/run/secrets/kms_key_ref',
    used_by: ['relay', 'gateway'],
    placeholder: '<operator-provided-kms-key-ref-file>',
  },
  {
    id: 'backup_target_uri',
    file: 'operator-secrets/backup-target-uri',
    mounted_as: '/run/secrets/backup_target_uri',
    used_by: ['relay', 'gateway'],
    placeholder: '<operator-provided-backup-target-uri-file>',
  },
  {
    id: 'siem_export_endpoint',
    file: 'operator-secrets/siem-export-endpoint',
    mounted_as: '/run/secrets/siem_export_endpoint',
    used_by: ['gateway'],
    placeholder: '<operator-provided-siem-export-endpoint-file>',
  },
  {
    id: 'operator_acceptance_evidence_uri',
    file: 'operator-secrets/operator-acceptance-evidence-uri',
    mounted_as: '/run/secrets/operator_acceptance_evidence_uri',
    used_by: ['relay', 'gateway'],
    placeholder: '<operator-provided-operator-acceptance-evidence-uri-file>',
  },
]);

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

function usage() {
  return 'Usage: node scripts/build-production-backend-env-kit.mjs --out-dir <dir> [--domain enigmamemory.com] [--tenant enigma-memory] [--environment production]\n\nWrites public-safe Docker Compose operator-env templates, operator-secrets placeholder manifest, hosted ref map, and blocked summary JSON. It creates no credentials, deploys nothing, and never marks launch ready.\n';
}

function requireValue(argv, index, token) {
  const value = argv[index + 1];
  if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) throw new UsageError(`${token} requires a value`);
  return value;
}

export function parseProductionBackendEnvKitArgs(argv = process.argv.slice(2)) {
  const options = { ...DEFAULTS, outDir: null, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') options.help = true;
    else if (token === '--out-dir' || token === '--outDir') {
      options.outDir = requireValue(argv, index, token);
      index += 1;
    } else if (token === '--domain') {
      options.domain = requireValue(argv, index, token);
      index += 1;
    } else if (token === '--tenant') {
      options.tenant = requireValue(argv, index, token);
      index += 1;
    } else if (token === '--environment') {
      options.environment = requireValue(argv, index, token);
      index += 1;
    } else if (token.startsWith('--out-dir=')) options.outDir = token.slice('--out-dir='.length);
    else if (token.startsWith('--domain=')) options.domain = token.slice('--domain='.length);
    else if (token.startsWith('--tenant=')) options.tenant = token.slice('--tenant='.length);
    else if (token.startsWith('--environment=')) options.environment = token.slice('--environment='.length);
    else throw new UsageError(`Unknown production backend env kit option: ${token}`);
  }
  return normalizeOptions(options);
}

function safeSlug(value, field) {
  if (typeof value !== 'string') throw new UsageError(`${field} must be a string`);
  const trimmed = value.trim();
  if (!/^[a-z0-9][a-z0-9._-]{0,62}$/u.test(trimmed)) throw new UsageError(`${field} must be a lowercase public-safe slug`);
  return trimmed;
}

function safeDomain(value) {
  if (typeof value !== 'string') throw new UsageError('--domain must be a string');
  const trimmed = value.trim().toLowerCase();
  if (trimmed.includes('://') || trimmed.includes('/') || trimmed.includes('@')) throw new UsageError('--domain must be a bare public host name');
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u.test(trimmed)) throw new UsageError('--domain must be a public DNS host name');
  return trimmed;
}

function normalizeOptions(options) {
  return {
    ...options,
    domain: safeDomain(options.domain ?? DEFAULTS.domain),
    tenant: safeSlug(options.tenant ?? DEFAULTS.tenant, '--tenant'),
    environment: safeSlug(options.environment ?? DEFAULTS.environment, '--environment'),
  };
}

function placeholderFor(name) {
  return `<operator-required-${name.toLowerCase().replaceAll('_', '-')}>`;
}

function envLine([name, value]) {
  return `${name}=${value}`;
}

function serviceEnv({ service, domain, tenant, environment }) {
  const common = [
    ['NODE_ENV', 'production'],
    ['ENIGMA_BACKEND_MODE', 'production'],
    ['ENIGMA_TENANT', tenant],
    ['ENIGMA_ENVIRONMENT', environment],
    ['ENIGMA_PUBLIC_SITE_URL', `https://${domain}/`],
    ['ENIGMA_DISABLE_LOCAL_DEMO_FALLBACK', 'true'],
    ['ENIGMA_REQUIRE_OPERATOR_ACCEPTANCE_EVIDENCE', 'true'],
    ['ENIGMA_READINESS_FAIL_CLOSED', 'true'],
    ['ENIGMA_NETWORK_ACCESS_POLICY_REF', placeholderFor('ENIGMA_NETWORK_ACCESS_POLICY_REF')],
    ['ENIGMA_KMS_CUSTODY_REF', placeholderFor('ENIGMA_KMS_CUSTODY_REF')],
    ['ENIGMA_KMS_KEY_REF', placeholderFor('ENIGMA_KMS_KEY_REF')],
    ['ENIGMA_TENANT_POLICY_APPROVAL_REF', placeholderFor('ENIGMA_TENANT_POLICY_APPROVAL_REF')],
    ['ENIGMA_USAGE_METERING_REF', placeholderFor('ENIGMA_USAGE_METERING_REF')],
    ['ENIGMA_SERVICE_SETTLEMENT_REF', placeholderFor('ENIGMA_SERVICE_SETTLEMENT_REF')],
    ['ENIGMA_MONITORING_ALERTING_REF', placeholderFor('ENIGMA_MONITORING_ALERTING_REF')],
    ['ENIGMA_SIEM_REF', placeholderFor('ENIGMA_SIEM_REF')],
    ['ENIGMA_PUBLIC_SITE_SECURITY_REF', placeholderFor('ENIGMA_PUBLIC_SITE_SECURITY_REF')],
    ['ENIGMA_SECURITY_THREAT_MODEL_REF', placeholderFor('ENIGMA_SECURITY_THREAT_MODEL_REF')],
    ['ENIGMA_LEGAL_COMPLIANCE_APPROVAL_REF', placeholderFor('ENIGMA_LEGAL_COMPLIANCE_APPROVAL_REF')],
    ['ENIGMA_SUPPORT_SLA_REF', placeholderFor('ENIGMA_SUPPORT_SLA_REF')],
    ['ENIGMA_INCIDENT_DRILL_REF', placeholderFor('ENIGMA_INCIDENT_DRILL_REF')],
    ['ENIGMA_BACKUP_RESTORE_DRILL_REF', placeholderFor('ENIGMA_BACKUP_RESTORE_DRILL_REF')],
    ['ENIGMA_OPERATOR_ACCEPTANCE_DECISION', '<operator-required-go-decision>'],
    ['ENIGMA_BACKUP_TARGET_URI_FILE', '/run/secrets/backup_target_uri'],
    ['ENIGMA_KMS_KEY_REF_FILE', '/run/secrets/kms_key_ref'],
    ['ENIGMA_OPERATOR_ACCEPTANCE_EVIDENCE_URI_FILE', '/run/secrets/operator_acceptance_evidence_uri'],
  ];
  if (service === 'relay') {
    return [
      ['ENIGMA_SERVICE_ROLE', 'relay'],
      ['ENIGMA_RELAY_PUBLIC_BASE_URL', `https://relay.${domain}`],
      ['ENIGMA_RELAY_READY_URL', `https://relay.${domain}/readyz`],
      ['ENIGMA_RELAY_LIVE_URL', `https://relay.${domain}/livez`],
      ['ENIGMA_REQUIRE_EXTERNAL_STORAGE', 'true'],
      ['ENIGMA_REQUIRE_EXTERNAL_KMS', 'true'],
      ['ENIGMA_RELAY_BACKEND_HOST_REF', placeholderFor('ENIGMA_RELAY_BACKEND_HOST_REF')],
      ['ENIGMA_RELAY_DEPLOYMENT_REF', placeholderFor('ENIGMA_RELAY_DEPLOYMENT_REF')],
      ['ENIGMA_RELAY_DNS_TLS_REF', placeholderFor('ENIGMA_RELAY_DNS_TLS_REF')],
      ['ENIGMA_RELAY_RUNTIME_AUTH_REF', placeholderFor('ENIGMA_RELAY_RUNTIME_AUTH_REF')],
      ['ENIGMA_RELAY_MONITORING_REF', placeholderFor('ENIGMA_RELAY_MONITORING_REF')],
      ['ENIGMA_RELAY_SIGNING_KEY_FILE', '/run/secrets/relay_signing_key'],
      ['ENIGMA_EXTERNAL_STORAGE_DSN_FILE', '/run/secrets/external_storage_dsn'],
      ...common,
    ];
  }
  return [
    ['ENIGMA_SERVICE_ROLE', 'gateway'],
    ['ENIGMA_GATEWAY_PUBLIC_BASE_URL', `https://gateway.${domain}`],
    ['ENIGMA_GATEWAY_READY_URL', `https://gateway.${domain}/readyz`],
    ['ENIGMA_GATEWAY_LIVE_URL', `https://gateway.${domain}/livez`],
    ['ENIGMA_REQUIRE_EXTERNAL_KMS', 'true'],
    ['ENIGMA_REQUIRE_EXTERNAL_STORAGE', 'true'],
    ['ENIGMA_REQUIRE_SIEM_EXPORT', 'true'],
    ['ENIGMA_GATEWAY_BACKEND_HOST_REF', placeholderFor('ENIGMA_GATEWAY_BACKEND_HOST_REF')],
    ['ENIGMA_GATEWAY_DEPLOYMENT_REF', placeholderFor('ENIGMA_GATEWAY_DEPLOYMENT_REF')],
    ['ENIGMA_GATEWAY_DNS_TLS_REF', placeholderFor('ENIGMA_GATEWAY_DNS_TLS_REF')],
    ['ENIGMA_GATEWAY_MONITORING_REF', placeholderFor('ENIGMA_GATEWAY_MONITORING_REF')],
    ['ENIGMA_GATEWAY_STORAGE_REF', placeholderFor('ENIGMA_GATEWAY_STORAGE_REF')],
    ['ENIGMA_GATEWAY_ADMIN_AUTH_REF', placeholderFor('ENIGMA_GATEWAY_ADMIN_AUTH_REF')],
    ['ENIGMA_GATEWAY_DATA_PLANE_AUTH_REF', placeholderFor('ENIGMA_GATEWAY_DATA_PLANE_AUTH_REF')],
    ['ENIGMA_GATEWAY_ADMIN_AUTH_BEARER_SHA256', '<operator-required-admin-bearer-sha256>'],
    ['ENIGMA_GATEWAY_DATA_PLANE_AUTH_BEARER_SHA256', '<operator-required-data-plane-bearer-sha256>'],
    ['ENIGMA_GATEWAY_SIGNING_KEY_FILE', '/run/secrets/gateway_signing_key'],
    ['ENIGMA_SIEM_EXPORT_ENDPOINT_FILE', '/run/secrets/siem_export_endpoint'],
    ['ENIGMA_EXTERNAL_STORAGE_DSN_FILE', '/run/secrets/external_storage_dsn'],
    ...common,
  ];
}

function renderEnvTemplate(service, options) {
  const title = service === 'relay' ? 'Relay' : 'Gateway';
  return [
    `# Enigma ${title} production operator-env template.`,
    '# Public-safe placeholders only; replace values in your private operator environment.',
    '# Docker Compose keeps service ports loopback-bound; public exposure belongs at reviewed HTTPS ingress for /livez and /readyz only.',
    '# These defaults fail closed until external refs, mounted secret files, and operator acceptance are supplied.',
    ...serviceEnv({ service, ...options }).map(envLine),
    '',
  ].join('\n');
}

function buildHostedRefMap() {
  const refs = {};
  for (const key of HOSTED_REF_KEYS) {
    refs[key] = {
      status: 'operator_required',
      value: `<operator-provided-${key.replaceAll('_', '-')}-evidence-ref>`,
      env_names: HOSTED_REF_ENV_NAMES[key] ?? [],
      accepted_ref_types: ['evidence artifact id', 'review ticket id', 'deployment rollout id', 'artifact digest'],
    };
  }
  return {
    schema: HOSTED_BACKEND_REF_MAP_SCHEMA,
    status: 'blocked_until_operator_refs_are_verified',
    required_ref_count: HOSTED_REF_KEYS.length,
    refs,
    fill_rule: 'Every value must be replaced with a public-safe evidence reference before hosted relay/gateway readiness can be claimed.',
    forbidden_values: ['bearer credential values', 'private key material', 'URLs with credentials', 'memory plaintext', 'prompts', 'transcripts', 'provider responses', 'decrypted content'],
  };
}

function buildSecretPlaceholderManifest() {
  return {
    schema: 'enigma.production_backend_secret_placeholders.v1',
    status: 'placeholder_manifest_only',
    compose_directory: 'operator-secrets/',
    entries: SECRET_PLACEHOLDERS,
    handling: [
      'Create each listed file only in the private deployment workspace.',
      'Do not commit filled files, paste values into tickets, or place values in generated public artifacts.',
      'Leave placeholders blocked until an operator-controlled secret store supplies each mounted file.',
    ],
  };
}

function nextValidationCommands({ domain, tenant, environment }) {
  return [
    `npm run production:backend-env -- --out-dir <backend-env-kit-dir> --domain ${domain} --tenant ${tenant} --environment ${environment}`,
    'docker compose -f deploy/docker-compose.production.example.yml config # run in the private deployment workspace after copying filled operator-env templates',
    'npm run production:manifests',
    'npm run infrastructure:readiness -- --manifest <evidence-dir>/infrastructure-readiness-manifest.json --live --cloudflare-live required',
    `npm run production:hosted-collect -- --relay-url https://relay.${domain} --gateway-url https://gateway.${domain} --refs-json <evidence-dir>/hosted-refs.json --domain ${domain} --environment-id ${environment} --cloud-provider <provider> --region <region> --owner <owner> --operator-decision go --operator-packet-ref <operator-packet-ref> --operator-approved-at <iso> --operator-approved-by <operator> --out <evidence-dir>/hosted-backend-live-collection.json --evidence-out <evidence-dir>/hosted-backend-live.json`,
    'npm run production:hosted-live -- --evidence <evidence-dir>/hosted-backend-live.json',
    'npm run production:acceptance -- --packet <operator-acceptance-packet.json>',
  ];
}

export function buildProductionBackendEnvKit(options = {}) {
  const normalized = normalizeOptions({ ...DEFAULTS, ...options });
  const files = {
    'operator-env/relay.production.env': renderEnvTemplate('relay', normalized),
    'operator-env/gateway.production.env': renderEnvTemplate('gateway', normalized),
    'operator-secrets/placeholder-manifest.json': buildSecretPlaceholderManifest(),
    'hosted-ref-map.json': buildHostedRefMap(),
  };
  const summaryPath = 'PRODUCTION_BACKEND_ENV_KIT_SUMMARY.json';
  const summary = {
    schema: PRODUCTION_BACKEND_ENV_KIT_SCHEMA,
    status: 'blocked_template_only',
    hosted_live_ready: false,
    operator_acceptance_ready: false,
    deployment_performed: false,
    launch_ready: false,
    generated_at: options.generated_at ?? options.generatedAt ?? new Date().toISOString(),
    target: {
      domain: normalized.domain,
      tenant: normalized.tenant,
      environment: normalized.environment,
    },
    generated_file_count: Object.keys(files).length + 1,
    generated_file_roles: ['relay operator-env template', 'gateway operator-env template', 'private mount placeholder manifest', 'hosted ref map', 'summary JSON'],
    docker_compose_reference: 'deploy/docker-compose.production.example.yml',
    loopback_boundary: 'Docker Compose reference ports remain bound to 127.0.0.1; public exposure must be an operator-reviewed HTTPS ingress that exposes only /livez and /readyz.',
    public_claim_boundary: [
      'This kit is not hosted backend evidence, operator acceptance, deployment proof, or launch approval.',
      'Relay/gateway public readiness requires real HTTPS probes, verified hosted refs, current manifest validation, and operator acceptance go for this exact target.',
      'Credential values, private key material, memory plaintext, prompts, transcripts, provider responses, and contact data must stay outside generated files.',
    ],
    fail_closed_defaults: [
      'ENIGMA_BACKEND_MODE=production',
      'ENIGMA_DISABLE_LOCAL_DEMO_FALLBACK=true',
      'ENIGMA_REQUIRE_EXTERNAL_STORAGE=true',
      'ENIGMA_REQUIRE_SIEM_EXPORT=true',
      'ENIGMA_REQUIRE_EXTERNAL_KMS=true',
      'ENIGMA_REQUIRE_OPERATOR_ACCEPTANCE_EVIDENCE=true',
      'ENIGMA_READINESS_FAIL_CLOSED=true',
    ],
    next_validation_commands: nextValidationCommands(normalized),
  };
  files[summaryPath] = summary;
  return { ...summary, files };
}

export async function writeProductionBackendEnvKit(kit, outDir) {
  if (typeof outDir !== 'string' || outDir.trim().length === 0) throw new UsageError('--out-dir is required');
  const dir = resolve(outDir);
  await mkdir(dir, { recursive: true });
  for (const [relativePath, value] of Object.entries(kit.files)) {
    const target = join(dir, relativePath);
    await mkdir(dirname(target), { recursive: true });
    const body = typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`;
    await writeFile(target, body, 'utf8');
  }
  return {
    ok: true,
    schema: PRODUCTION_BACKEND_ENV_KIT_SCHEMA,
    out_dir: '<production-backend-env-kit-output>',
    launch_ready: false,
    file_count: Object.keys(kit.files).length,
    generated_file_roles: kit.generated_file_roles,
    next_validation_commands: kit.next_validation_commands,
  };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  (async () => {
    try {
      const args = parseProductionBackendEnvKitArgs();
      if (args.help) {
        process.stdout.write(usage());
        return;
      }
      const kit = buildProductionBackendEnvKit({ ...args, generated_at: new Date().toISOString() });
      process.stdout.write(`${JSON.stringify(await writeProductionBackendEnvKit(kit, args.outDir), null, 2)}\n`);
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    }
  })();
}
