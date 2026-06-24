#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOperatorAcceptancePacket } from './build-operator-acceptance-packet.mjs';
import { buildProductionReadinessManifest } from './build-production-readiness-manifest.mjs';
import { HOSTED_BACKEND_LIVE_EVIDENCE_SCHEMA, REQUIRED_REF_KEYS } from './validate-hosted-backend-live.mjs';
import { REQUIRED_EVIDENCE_ITEMS, REQUIRED_OWNER_ROLES, REQUIRED_PACKET_METADATA } from './validate-operator-acceptance.mjs';
import { groupHostedRefsByWorkstream } from './hosted-ref-workstreams.mjs';

export const OPERATOR_EVIDENCE_STARTER_SCHEMA = 'enigma.operator_evidence_starter.v1';
export const OPERATOR_EVIDENCE_FILL_PLAN_SCHEMA = 'enigma.operator_evidence_fill_plan.v1';
export const OPERATOR_HOSTED_REF_CATALOG_SCHEMA = 'enigma.operator_hosted_ref_catalog.v1';
export const OPERATOR_HOSTED_REF_WORKSTREAMS_SCHEMA = 'enigma.operator_hosted_ref_workstreams.v1';

const HOSTED_REF_KEYS = Object.freeze([...REQUIRED_REF_KEYS]);

function parseArgs(argv = process.argv.slice(2)) {
  const out = { outDir: null, domain: 'enigmamemory.com', projectName: 'enigma-memory', environment: 'production', tenant: 'enigma-memory' };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (typeof value !== 'string' || value.length === 0) throw new Error(`${token} requires a value`);
      index += 1;
      return value;
    };
    if (token === '--out-dir' || token === '--outDir') out.outDir = next();
    else if (token === '--domain') out.domain = next();
    else if (token === '--project-name' || token === '--projectName') out.projectName = next();
    else if (token === '--environment') out.environment = next();
    else if (token === '--tenant') out.tenant = next();
    else if (typeof token === 'string' && token.startsWith('--out-dir=')) out.outDir = token.slice('--out-dir='.length);
    else if (typeof token === 'string' && token.startsWith('--domain=')) out.domain = token.slice('--domain='.length);
    else if (typeof token === 'string' && token.startsWith('--project-name=')) out.projectName = token.slice('--project-name='.length);
    else if (typeof token === 'string' && token.startsWith('--environment=')) out.environment = token.slice('--environment='.length);
    else if (typeof token === 'string' && token.startsWith('--tenant=')) out.tenant = token.slice('--tenant='.length);
    else if (token === '--help' || token === '-h') out.help = true;
    else throw new Error(`Unknown operator evidence starter option: ${token}`);
  }
  return out;
}

function placeholderRef(key) {
  return `<operator-provided-${key}-evidence-ref>`;
}

function operatorOwnerRefPlaceholder(role) {
  return `<operator-provided-${role}-approval-ref>`;
}

function operatorEvidenceRefPlaceholder(item) {
  return `<operator-provided-${item}-evidence-ref>`;
}

function buildOwnerApprovalRefsTemplate() {
  return Object.fromEntries(REQUIRED_OWNER_ROLES.map((role) => [role, operatorOwnerRefPlaceholder(role)]));
}

function buildEvidenceRefsTemplate() {
  return Object.fromEntries(REQUIRED_EVIDENCE_ITEMS.map((item) => [item, operatorEvidenceRefPlaceholder(item)]));
}

function hostedProbeTemplate(service, check, domain) {
  const serviceName = service === 'relay' ? 'enigma-relay' : 'enigma-gateway';
  const body = {
    service: serviceName,
    ok: true,
  };
  if (check === 'readyz') {
    body.missing_evidence_refs = [];
    body.checks = [
      {
        name: '<public-readyz-check-name>',
        ok: true,
        ref: '<operator-provided-readyz-check-evidence-ref>',
      },
    ];
  }
  return {
    url: `https://${service}.${domain}/${check}`,
    status_code: 200,
    body,
    observed_at: '<probe-observed-at-iso8601>',
    response_hash: 'sha256:<operator-provided-response-body-sha256-hex>',
  };
}

function buildHostedBackendLiveEvidenceTemplate({ domain }) {
  return {
    schema: HOSTED_BACKEND_LIVE_EVIDENCE_SCHEMA,
    observed_at: '<hosted-live-observed-at-iso8601>',
    environment: {
      domain,
      environment_id: '<public-environment-id-or-slug>',
      cloud_provider: '<cloud-provider-name>',
      region: '<public-region-code>',
      owner: '<operator-team-or-role>',
      status: 'observed',
    },
    refs: Object.fromEntries(HOSTED_REF_KEYS.map((key) => [key, `<operator-provided-${key}-evidence-ref>`])),
    probes: {
      relay_livez: hostedProbeTemplate('relay', 'livez', domain),
      relay_readyz: hostedProbeTemplate('relay', 'readyz', domain),
      gateway_livez: hostedProbeTemplate('gateway', 'livez', domain),
      gateway_readyz: hostedProbeTemplate('gateway', 'readyz', domain),
    },
    operator_acceptance: {
      decision: 'go',
      packet_ref: '<operator-acceptance-packet-ref>',
      approved_at: '<operator-acceptance-approved-at-iso8601>',
      approved_by: '<operator-acceptance-approver-role>',
    },
    claim_boundary: {
      hosted_backend_live: true,
      public_site_live: false,
      cloudflare_credentials_claim: false,
      token_roi_claim: false,
      provider_deletion_claim: false,
      model_forgetting_claim: false,
    },
  };
}

const HOSTED_REF_CATALOG = Object.freeze({
  backend_host: {
    purpose: 'Relay and gateway production deployment identity.',
    env_names: ['ENIGMA_BACKEND_HOST_REF', 'ENIGMA_RELAY_DEPLOYMENT_REF', 'ENIGMA_GATEWAY_DEPLOYMENT_REF'],
    evidence_command: 'npm run production:manifests',
    accepted_refs: ['deployment ticket', 'container image digest', 'orchestrator rollout id'],
  },
  dns_tls: {
    purpose: 'Public DNS, TLS certificate, and domain ownership evidence.',
    env_names: ['ENIGMA_DNS_TLS_REF', 'ENIGMA_TLS_REF'],
    evidence_command: 'npm run production:domain -- --evidence <domain-tls.json>',
    accepted_refs: ['certificate transparency record', 'DNS provider change ticket', 'domain TLS validation artifact'],
  },
  durable_storage: {
    purpose: 'Durable external storage migration and backup-compatible persistence.',
    env_names: ['ENIGMA_DURABLE_STORAGE_REF', 'ENIGMA_EXTERNAL_STORAGE_REF', 'ENIGMA_RELAY_STORAGE_REF', 'ENIGMA_GATEWAY_STORAGE_REF'],
    evidence_command: 'npm run production:storage -- --out <evidence-dir>/production-storage-migration.json',
    accepted_refs: ['migration artifact', 'database change ticket', 'storage readiness evidence'],
  },
  kms_or_secret_custody: {
    purpose: 'Runtime secret custody without exportable private key material.',
    env_names: ['ENIGMA_KMS_KEY_REF', 'ENIGMA_KMS_REF', 'ENIGMA_SECRETS_MANAGER_REF', 'ENIGMA_GATEWAY_SIGNER_REF'],
    evidence_command: 'npm run production:kms -- --evidence <kms-custody.json>',
    accepted_refs: ['KMS key id reference', 'secrets-manager custody ticket', 'non-exportable signer attestation'],
  },
  backup_restore: {
    purpose: 'Backup target and restore plan coverage for production data.',
    env_names: ['ENIGMA_BACKUP_TARGET_REF', 'ENIGMA_RESTORE_TARGET_REF'],
    evidence_command: 'npm run production:backup-drill -- --evidence <backup-restore-drill.json>',
    accepted_refs: ['backup policy ticket', 'restore target ref', 'backup restore drill artifact'],
  },
  monitoring: {
    purpose: 'Production metrics, synthetics, and operator-visible health coverage.',
    env_names: ['ENIGMA_MONITORING_REF', 'ENIGMA_RELAY_MONITORING_REF', 'ENIGMA_GATEWAY_MONITORING_REF'],
    evidence_command: 'npm run production:monitoring -- --evidence <monitoring-alerting.json>',
    accepted_refs: ['dashboard ref', 'synthetic monitor ref', 'alert routing evidence'],
  },
  siem_or_log_sink: {
    purpose: 'Tamper-resistant operational audit sink without raw memory payload export.',
    env_names: ['ENIGMA_SIEM_REF', 'ENIGMA_AUDIT_SINK_REF', 'ENIGMA_LOG_SINK_REF'],
    evidence_command: 'npm run production:monitoring -- --evidence <monitoring-alerting.json>',
    accepted_refs: ['SIEM sink ticket', 'audit log export evidence', 'log retention policy ref'],
  },
  operator_acceptance: {
    purpose: 'Operator go/no-go packet for the exact tenant, domain, and environment.',
    env_names: ['ENIGMA_OPERATOR_ACCEPTANCE_REF', 'ENIGMA_OPERATOR_ACCEPTANCE_EVIDENCE_URI'],
    evidence_command: 'npm run production:acceptance -- --packet <operator-acceptance-packet.json>',
    accepted_refs: ['operator acceptance packet id', 'approval ticket', 'evidence repository link'],
  },
  runtime_auth: {
    purpose: 'Runtime service authentication for relay/gateway dependencies.',
    env_names: ['ENIGMA_RUNTIME_AUTH_REF', 'ENIGMA_RELAY_RUNTIME_AUTH_REF', 'ENIGMA_PAIRED_CLIENT_AUTH_REF'],
    evidence_command: 'npm run production:network -- --evidence <network-access-policy.json>',
    accepted_refs: ['runtime auth policy ticket', 'paired-client auth evidence', 'access-control review'],
  },
  admin_auth: {
    purpose: 'Administrative control-plane authentication and authorization.',
    env_names: ['ENIGMA_ADMIN_AUTH_REF', 'ENIGMA_GATEWAY_ADMIN_AUTH_REF'],
    evidence_command: 'npm run production:network -- --evidence <network-access-policy.json>',
    accepted_refs: ['admin auth review', 'privileged access ticket', 'control-plane policy ref'],
  },
  data_plane_auth: {
    purpose: 'End-user/data-plane authentication for gateway APIs.',
    env_names: ['ENIGMA_DATA_PLANE_AUTH_REF', 'ENIGMA_GATEWAY_DATA_PLANE_AUTH_REF'],
    evidence_command: 'npm run production:network -- --evidence <network-access-policy.json>',
    accepted_refs: ['data-plane auth review', 'API access policy artifact', 'tenant auth evidence'],
  },
  network_access_policy: {
    purpose: 'Fail-closed public/private route exposure policy.',
    env_names: ['ENIGMA_NETWORK_ACCESS_POLICY_REF', 'ENIGMA_NETWORK_POLICY_REF'],
    evidence_command: 'npm run production:network -- --evidence <network-access-policy.json>',
    accepted_refs: ['network policy artifact', 'ingress review ticket', 'route exposure attestation'],
  },
  kms_custody: {
    purpose: 'KMS custody controls for production keys and signer material.',
    env_names: ['ENIGMA_KMS_CUSTODY_REF', 'ENIGMA_KEY_CUSTODY_REF'],
    evidence_command: 'npm run production:kms -- --evidence <kms-custody.json>',
    accepted_refs: ['KMS custody evidence', 'key-owner approval', 'rotation policy ref'],
  },
  tenant_policy_approval: {
    purpose: 'Tenant-specific retention, region, deletion, and legal-hold policy approval.',
    env_names: ['ENIGMA_TENANT_POLICY_APPROVAL_REF', 'ENIGMA_TENANT_POLICY_REF'],
    evidence_command: 'npm run production:tenant-policy -- --evidence <tenant-policy-approval.json>',
    accepted_refs: ['tenant policy approval', 'region/retention review', 'legal-hold policy ref'],
  },
  usage_metering: {
    purpose: 'Usage metering evidence for memory optimizer/service billing boundaries.',
    env_names: ['ENIGMA_USAGE_METERING_REF', 'ENIGMA_METERING_REF'],
    evidence_command: 'npm run production:usage -- --evidence <usage-metering.json>',
    accepted_refs: ['metering artifact', 'billing telemetry review', 'usage aggregation evidence'],
  },
  service_settlement: {
    purpose: 'Permissionless access settlement receipts without decentralizing raw memory.',
    env_names: ['ENIGMA_SERVICE_SETTLEMENT_REF', 'ENIGMA_SETTLEMENT_REF'],
    evidence_command: 'npm run production:settlement -- --evidence <service-settlement.json>',
    accepted_refs: ['settlement receipt batch', 'quote verification artifact', 'operator settlement ref'],
  },
  monitoring_alerting: {
    purpose: 'Alert coverage, escalation routing, and synthetic probes.',
    env_names: ['ENIGMA_MONITORING_ALERTING_REF', 'ENIGMA_ALERTING_EVIDENCE_REF'],
    evidence_command: 'npm run production:monitoring -- --evidence <monitoring-alerting.json>',
    accepted_refs: ['alert policy artifact', 'on-call route evidence', 'synthetic probe evidence'],
  },
  public_site_security: {
    purpose: 'Static public site security, omission policy, and header validation.',
    env_names: ['ENIGMA_PUBLIC_SITE_SECURITY_REF', 'ENIGMA_SITE_SECURITY_REF'],
    evidence_command: 'npm run production:site -- --site <public-site-dir>',
    accepted_refs: ['public site security result', 'review packet preflight', 'Cloudflare Pages artifact hash'],
  },
  security_threat_model: {
    purpose: 'Reviewed security threat model with no accepted critical blockers.',
    env_names: ['ENIGMA_SECURITY_THREAT_MODEL_REF', 'ENIGMA_THREAT_MODEL_REF'],
    evidence_command: 'npm run production:threat-model -- --evidence <security-threat-model.json>',
    accepted_refs: ['threat model artifact', 'security review approval', 'risk register ticket'],
  },
  legal_compliance_approval: {
    purpose: 'Claim-bounded legal/privacy approval for launch and operator evidence.',
    env_names: ['ENIGMA_LEGAL_COMPLIANCE_REF', 'ENIGMA_LEGAL_APPROVAL_REF', 'ENIGMA_LEGAL_COMPLIANCE_APPROVAL_REF'],
    evidence_command: 'npm run production:legal -- --evidence <legal-compliance-approval.json>',
    accepted_refs: ['legal approval ticket', 'privacy review evidence', 'claim-boundary approval'],
  },
  support_sla: {
    purpose: 'Support ownership, SLO/SLA, escalation, and incident response coverage.',
    env_names: ['ENIGMA_SUPPORT_SLA_REF'],
    evidence_command: 'npm run production:sla -- --evidence <support-sla.json>',
    accepted_refs: ['support SLA document', 'on-call rota ref', 'escalation policy ticket'],
  },
  incident_drill: {
    purpose: 'Incident drill proving roles, timeline, communications, and remediation loop.',
    env_names: ['ENIGMA_INCIDENT_DRILL_REF'],
    evidence_command: 'npm run production:incident-drill -- --evidence <incident-drill.json>',
    accepted_refs: ['incident drill artifact', 'tabletop report', 'postmortem exercise ticket'],
  },
  backup_restore_drill: {
    purpose: 'Restore drill proving RPO/RTO and restored root consistency.',
    env_names: ['ENIGMA_BACKUP_RESTORE_DRILL_REF'],
    evidence_command: 'npm run production:backup-drill -- --evidence <backup-restore-drill.json>',
    accepted_refs: ['restore drill artifact', 'RPO/RTO evidence', 'backup verification ticket'],
  },
  relay_deployment: {
    purpose: 'Relay production deployment rollout evidence for the exact hosted target.',
    env_names: ['ENIGMA_RELAY_DEPLOYMENT_REF', 'ENIGMA_RELAY_BACKEND_HOST_REF'],
    evidence_command: 'npm run production:manifests',
    accepted_refs: ['relay deployment rollout id', 'relay container image digest', 'relay release ticket'],
  },
  gateway_deployment: {
    purpose: 'Gateway production deployment rollout evidence for the exact hosted target.',
    env_names: ['ENIGMA_GATEWAY_DEPLOYMENT_REF', 'ENIGMA_GATEWAY_BACKEND_HOST_REF'],
    evidence_command: 'npm run production:manifests',
    accepted_refs: ['gateway deployment rollout id', 'gateway container image digest', 'gateway release ticket'],
  },
});

function buildHostedRefCatalog({ generatedAt } = {}) {
  return {
    schema: OPERATOR_HOSTED_REF_CATALOG_SCHEMA,
    generated_at: generatedAt ?? null,
    status: 'template_only_blocked_until_verified_refs',
    required_ref_count: HOSTED_REF_KEYS.length,
    refs: Object.fromEntries(HOSTED_REF_KEYS.map((key) => [key, HOSTED_REF_CATALOG[key] ?? {
      purpose: `Operator-provided evidence for ${key}.`,
      env_names: [],
      evidence_command: 'Attach operator evidence and rerun production:manifest.',
      accepted_refs: ['operator approval ticket'],
    }])),
    fill_rule: 'Every hosted ref must resolve to a public-safe evidence URI, ticket id, artifact hash, or approved external reference with status verified before readiness can be live.',
    forbidden_values: ['bearer tokens', 'private keys', 'credential-bearing URLs', 'raw memory', 'prompts', 'transcripts', 'provider responses', 'decrypted content'],
  };
}

function buildHostedRefWorkstreams({ generatedAt, hostedRefCatalog }) {
  const groups = groupHostedRefsByWorkstream(HOSTED_REF_KEYS);
  return {
    schema: OPERATOR_HOSTED_REF_WORKSTREAMS_SCHEMA,
    generated_at: generatedAt ?? null,
    status: 'template_only_blocked_until_verified_refs',
    required_ref_count: HOSTED_REF_KEYS.length,
    workstreams: Object.fromEntries(Object.entries(groups).map(([workstream, refs]) => [workstream, {
      ref_count: refs.length,
      refs: refs.map((key) => {
        const entry = hostedRefCatalog.refs[key] ?? {};
        return {
          key,
          purpose: typeof entry.purpose === 'string' ? entry.purpose : `Operator-provided evidence for ${key}.`,
          env_names: Array.isArray(entry.env_names) ? entry.env_names : [],
          evidence_command: typeof entry.evidence_command === 'string' ? entry.evidence_command : 'Attach operator evidence and rerun production:manifest.',
          accepted_refs: Array.isArray(entry.accepted_refs) ? entry.accepted_refs : [],
          template_value: placeholderRef(key),
        };
      }),
    }])),
    completion_rule: 'Every ref in every workstream must be filled in hosted-refs.json with a public-safe verified evidence reference before hosted-live readiness can pass.',
    claim_boundary: [
      'This workstream checklist is not deployment proof, operator approval, or hosted-live evidence.',
      'Use it to divide external operator evidence collection; do not paste secrets, account ids, credential-bearing URLs, raw memory, prompts, transcripts, provider responses, or private keys.',
    ],
  };
}

function commandPlan({ domain, projectName }) {
  return {
    write_release_audit: 'npm run release:audit -- --out ./.enigma/release-audit-current.json',
    build_readiness_manifest: 'npm run production:manifest -- --out <evidence-dir>/infrastructure-readiness-manifest.json',
    build_storage_migration: 'npm run production:storage -- --out <evidence-dir>/production-storage-migration.json',
    verify_readiness_live: 'npm run infrastructure:readiness -- --manifest <evidence-dir>/infrastructure-readiness-manifest.json --live --cloudflare-live required',
    collect_hosted_live: 'npm run production:hosted-collect -- --relay-url https://relay.<domain> --gateway-url https://gateway.<domain> --refs-json <evidence-dir>/hosted-refs.json --domain <domain> --environment-id <env-id> --cloud-provider <provider> --region <region> --owner <owner> --operator-decision go --operator-packet-ref <operator-packet-ref> --operator-approved-at <iso> --operator-approved-by <operator> --evidence-out <evidence-dir>/hosted-backend-live.json --out <evidence-dir>/hosted-backend-live-collection.json',
    validate_hosted_live: 'npm run production:hosted-live -- --evidence <evidence-dir>/hosted-backend-live.json',
    build_operator_packet: 'npm run production:acceptance:packet -- --out <evidence-dir>/operator-acceptance-packet.json --owners-json <evidence-dir>/owner-approval-refs.json --evidence-refs <evidence-dir>/evidence-refs.json --readiness <evidence-dir>/infrastructure-readiness-live.json --manifest <evidence-dir>/infrastructure-readiness-manifest.json --storage <evidence-dir>/production-storage-migration.json --release-audit ./.enigma/release-audit-current.json --production-manifests <evidence-dir>/production-manifests.json --decision go --tenant <tenant-id> --target-regions <regions> --requested-go-live-date <date> --evidence-repository <evidence-repository> --packet-owner <operator>',
    validate_operator_acceptance: 'npm run production:acceptance -- --packet <operator-acceptance-packet.json>',
    build_handoff: `npm run production:handoff -- --site <public-site-dir> --project-name ${projectName} --domain ${domain} --live-url https://${domain}/ --expect-title Enigma --infrastructure-readiness <infrastructure-readiness-live.json> --operator-acceptance-packet <operator-acceptance-packet.json> --release-audit ./.enigma/release-audit-current.json`,
    build_goal_audit: `npm run production:goal-audit -- --site <public-site-dir> --project-name ${projectName} --domain ${domain} --live-url https://${domain}/ --expect-title Enigma --infrastructure-readiness <infrastructure-readiness-live.json> --operator-acceptance-packet <operator-acceptance-packet.json> --release-audit ./.enigma/release-audit-current.json`,
  };
}

function buildAcceptanceFillPlan({ domain, projectName, environment, tenant, hostedRefCatalog }) {
  return {
    schema: OPERATOR_EVIDENCE_FILL_PLAN_SCHEMA,
    status: 'template_only_blocked_until_filled',
    target: { domain, project_name: projectName, environment, tenant },
    generated_files: {
      hosted_refs_template: 'hosted-refs.template.json',
      hosted_refs_final: 'hosted-refs.json',
      hosted_live_evidence_template: 'hosted-backend-live.template.json',
      hosted_live_collection: 'hosted-backend-live-collection.json',
      hosted_live_evidence: 'hosted-backend-live.json',
      owner_approval_refs_template: 'owner-approval-refs.template.json',
      owner_approval_refs_final: 'owner-approval-refs.json',
      evidence_refs_template: 'evidence-refs.template.json',
      evidence_refs_final: 'evidence-refs.json',
      readiness_manifest_template: 'infrastructure-readiness-manifest.template.json',
      readiness_manifest_final: 'infrastructure-readiness-manifest.json',
      storage_migration_final: 'production-storage-migration.json',
      operator_packet_template: 'operator-acceptance-packet.template.json',
      operator_packet_final: 'operator-acceptance-packet.json',
      hosted_ref_catalog: 'hosted-ref-catalog.json',
      hosted_ref_workstreams: 'hosted-ref-workstreams.json',
    },
    fill_order: [
      'Fill string values in hosted-refs.template.json and save the completed copy as hosted-refs.json.',
      'Use hosted-ref-workstreams.json to assign deployment, security, resilience, operations, governance, and commercial evidence owners without copying the full catalog into status updates.',
      'Use hosted-backend-live.template.json only as the schema reference for public-safe observed hosted live evidence.',
      'Run commands.build_readiness_manifest and commands.build_storage_migration.',
      'Run commands.verify_readiness_live after all required hosted refs point at deployed target-environment evidence.',
      'Run commands.collect_hosted_live after relay/gateway public HTTPS probes are live; it writes hosted-backend-live-collection.json and hosted-backend-live.json.',
      'Run commands.validate_hosted_live against the generated hosted-backend-live.json.',
      'Fill owner-approval-refs.template.json and evidence-refs.template.json with public-safe approval/evidence references.',
      'Build the final operator packet with production:acceptance:packet using --owners-json <evidence-dir>/owner-approval-refs.json, --evidence-refs <evidence-dir>/evidence-refs.json, and the completed readiness/manifest/storage/release evidence files.',
      'Validate operator-acceptance-packet.json with commands.validate_operator_acceptance; any blocker means the packet is still not launch evidence.',
      'Run commands.build_handoff and commands.build_goal_audit only after validate_operator_acceptance returns ok:true.',
    ],
    accepted_values: {
      metadata: { decision: ['go'] },
      owners: { approval_status: ['approved'] },
      evidence: { status: ['verified'] },
    },
    required_metadata: REQUIRED_PACKET_METADATA,
    required_owner_roles: REQUIRED_OWNER_ROLES.map((role) => ({
      role,
      required_fields: ['name', 'organization', 'approval_ref', 'approval_status=approved'],
    })),
    required_evidence_items: REQUIRED_EVIDENCE_ITEMS.map((item) => ({
      item,
      required_fields: ['ref', 'status=verified', 'owner'],
    })),
    hosted_ref_catalog: {
      schema: hostedRefCatalog.schema,
      required_ref_count: hostedRefCatalog.required_ref_count,
      ref_keys: Object.keys(hostedRefCatalog.refs),
    },
    claim_boundary: [
      'This fill plan is not operator approval, hosted-live evidence, or deployment proof.',
      'Refs must point at external evidence artifacts or tickets; never paste bearer tokens, private keys, DSNs with credentials, raw memory, prompts, transcripts, provider responses, or decrypted content.',
      'A go packet is valid only for the exact domain, tenant, environment, and deployed infrastructure named in the packet.',
    ],
  };
}

export async function buildOperatorEvidenceStarter(options = {}) {
  const args = options.args ?? parseArgs(options.argv ?? []);
  const generatedAt = options.generated_at ?? options.generatedAt ?? new Date(0).toISOString();
  const domain = args.domain ?? options.domain ?? 'enigmamemory.com';
  const projectName = args.projectName ?? options.projectName ?? 'enigma-memory';
  const environment = args.environment ?? options.environment ?? 'production';
  const tenant = args.tenant ?? options.tenant ?? 'enigma-memory';
  const hostedRefs = Object.fromEntries(HOSTED_REF_KEYS.map((key) => [key, placeholderRef(key)]));
  const readinessManifest = await buildProductionReadinessManifest({
    env: {
      ENIGMA_PUBLIC_SITE_URL: `https://${domain}/`,
      ENIGMA_CLOUDFLARE_PAGES_PROJECT_NAME: projectName,
      ENIGMA_OPERATOR_DECISION: 'pending',
    },
    argv: ['--external-blocker', 'operator evidence starter has not been completed'],
    generated_at: generatedAt,
  });
  const operatorPacket = await buildOperatorAcceptancePacket({
    decision: 'blocked',
    customer_or_tenant: tenant,
    environment,
    packet_id: `${tenant}-${environment}-starter`,
    evidence_repository: '<operator-evidence-repository-or-ticket>',
    packet_owner: '<operator-owner>',
    last_updated: generatedAt,
  });
  const hostedRefCatalog = buildHostedRefCatalog({ generatedAt });
  const hostedRefWorkstreams = buildHostedRefWorkstreams({ generatedAt, hostedRefCatalog });
  const acceptanceFillPlan = buildAcceptanceFillPlan({ domain, projectName, environment, tenant, hostedRefCatalog });
  const hostedBackendLiveEvidenceTemplate = buildHostedBackendLiveEvidenceTemplate({ domain });
  const ownerApprovalRefsTemplate = buildOwnerApprovalRefsTemplate();
  const evidenceRefsTemplate = buildEvidenceRefsTemplate();
  const starter = {
    schema: OPERATOR_EVIDENCE_STARTER_SCHEMA,
    generated_at: generatedAt,
    status: 'blocked_until_operator_evidence',
    domain,
    project_name: projectName,
    environment,
    tenant,
    hosted_required_refs: hostedRefs,
    hosted_ref_catalog: hostedRefCatalog,
    hosted_ref_workstreams: hostedRefWorkstreams,
    hosted_backend_live_evidence_template: hostedBackendLiveEvidenceTemplate,
    owner_roles: REQUIRED_OWNER_ROLES,
    evidence_items: REQUIRED_EVIDENCE_ITEMS,
    readiness_manifest: readinessManifest,
    operator_acceptance_packet: operatorPacket,
    owner_approval_refs_template: ownerApprovalRefsTemplate,
    evidence_refs_template: evidenceRefsTemplate,
    commands: commandPlan({ domain, projectName }),
    acceptance_fill_plan: acceptanceFillPlan,
    counts: {
      hosted_ref_count: HOSTED_REF_KEYS.length,
      owner_role_count: REQUIRED_OWNER_ROLES.length,
      evidence_item_count: REQUIRED_EVIDENCE_ITEMS.length,
      current_blocker_count: readinessManifest.external_blockers.length,
      acceptance_fill_step_count: acceptanceFillPlan.fill_order.length,
      hosted_ref_catalog_count: hostedRefCatalog.required_ref_count,
      hosted_ref_workstream_count: Object.keys(hostedRefWorkstreams.workstreams).length,
    },
    claim_boundary: [
      'This starter is a public-safe checklist and template bundle, not production readiness evidence.',
      'Do not paste bearer tokens, private keys, DSNs with credentials, raw memory, prompts, transcripts, provider responses, or decrypted content into these files.',
      'Hosted/BYOC remains blocked until live relay/gateway probes, all refs, operator acceptance go, and current release audit evidence validate for the exact environment.',
    ],
  };
  return starter;
}

export async function writeOperatorEvidenceStarter(starter, outDir) {
  if (typeof outDir !== 'string' || outDir.trim().length === 0) throw new Error('--out-dir is required');
  const dir = resolve(outDir);
  await mkdir(dir, { recursive: true });
  const files = {
    'OPERATOR_EVIDENCE_STARTER.json': starter,
    'hosted-refs.template.json': starter.hosted_required_refs,
    'hosted-backend-live.template.json': starter.hosted_backend_live_evidence_template,
    'infrastructure-readiness-manifest.template.json': starter.readiness_manifest,
    'operator-acceptance-packet.template.json': starter.operator_acceptance_packet,
    'owner-approval-refs.template.json': starter.owner_approval_refs_template,
    'evidence-refs.template.json': starter.evidence_refs_template,
    'commands.json': starter.commands,
    'acceptance-fill-plan.json': starter.acceptance_fill_plan,
    'hosted-ref-catalog.json': starter.hosted_ref_catalog,
    'hosted-ref-workstreams.json': starter.hosted_ref_workstreams,
  };
  for (const [name, value] of Object.entries(files)) {
    await writeFile(join(dir, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  }
  return {
    ok: true,
    schema: starter.schema,
    out_dir: '<operator-evidence-starter-output>',
    file_count: Object.keys(files).length,
    generated_files: Object.keys(files),
    hosted_ref_count: starter.counts.hosted_ref_count,
    evidence_item_count: starter.counts.evidence_item_count,
    status: starter.status,
  };
}

function usage() {
  return 'Usage: node scripts/build-operator-evidence-starter.mjs --out-dir <dir> [--domain enigmamemory.com] [--project-name enigma-memory] [--environment production] [--tenant enigma-memory]\n\nWrites public-safe starter JSON files for the operator evidence repository. It creates no cloud resources and does not mark hosted readiness complete.\n';
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  (async () => {
    try {
      const args = parseArgs();
      if (args.help) {
        process.stdout.write(usage());
        return;
      }
      const starter = await buildOperatorEvidenceStarter({ args, generated_at: new Date().toISOString() });
      if (args.outDir) process.stdout.write(`${JSON.stringify(await writeOperatorEvidenceStarter(starter, args.outDir), null, 2)}\n`);
      else process.stdout.write(`${JSON.stringify(starter, null, 2)}\n`);
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    }
  })();
}
