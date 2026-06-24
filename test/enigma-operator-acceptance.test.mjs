import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  OPERATOR_ACCEPTANCE_PACKET_SCHEMA,
  OPERATOR_ACCEPTANCE_RESULT_SCHEMA,
  REQUIRED_EVIDENCE_ITEMS,
  REQUIRED_OWNER_ROLES,
  REQUIRED_PACKET_METADATA,
  validateOperatorAcceptancePacket,
} from '../scripts/validate-operator-acceptance.mjs';
import { buildProductionReadinessManifest } from '../scripts/build-production-readiness-manifest.mjs';
import { buildOperatorAcceptancePacket } from '../scripts/build-operator-acceptance-packet.mjs';
import { buildOperatorEvidenceStarter, OPERATOR_EVIDENCE_FILL_PLAN_SCHEMA, OPERATOR_EVIDENCE_STARTER_SCHEMA, OPERATOR_HOSTED_REF_CATALOG_SCHEMA, OPERATOR_HOSTED_REF_WORKSTREAMS_SCHEMA } from '../scripts/build-operator-evidence-starter.mjs';
import { buildProductionStorageMigrationArtifact } from '../scripts/build-production-storage-migration.mjs';
import { validateProductionManifestFiles } from '../scripts/validate-production-manifests.mjs';
import { HOSTED_BACKEND_LIVE_EVIDENCE_SCHEMA, REQUIRED_REF_KEYS, validateHostedBackendLiveEvidence } from '../scripts/validate-hosted-backend-live.mjs';
import { collectHostedBackendLiveEvidence } from '../scripts/collect-hosted-backend-live-evidence.mjs';

const execFileAsync = promisify(execFile);

const SECRET_OR_CREDENTIAL_RE = /Bearer\s+[A-Za-z0-9._~+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@/i;

function collectPlaceholderStrings(value, out = []) {
  if (typeof value === 'string') {
    if (value.includes('<') || value.includes('>')) out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPlaceholderStrings(item, out);
    return out;
  }
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) collectPlaceholderStrings(child, out);
  }
  return out;
}

function owner(role) {
  return {
    name: `${role} owner`,
    organization: 'Enigma fixture',
    approval_status: 'approved',
    approval_ref: `ticket://${role}/approval`,
  };
}

function evidence(key) {
  return {
    status: 'verified',
    ref: `evidence://${key}/verified`,
    owner: `${key} owner`,
  };
}

async function completeManifest() {
  return buildProductionReadinessManifest({
    env: {
      ENIGMA_PUBLIC_SITE_URL: 'https://enigmamemory.com/',
      CLOUDFLARE_ACCOUNT_ID: 'account-fixture',
      ENIGMA_RELAY_READY_URL: 'https://relay.enigmamemory.com/readyz',
      ENIGMA_GATEWAY_READY_URL: 'https://gateway.enigmamemory.com/readyz',
      ENIGMA_RELAY_DEPLOYMENT_REF: 'relay-deploy#acceptance',
      ENIGMA_GATEWAY_DEPLOYMENT_REF: 'gateway-deploy#acceptance',
      ENIGMA_BACKEND_HOST_REF: 'backend-host#acceptance',
      ENIGMA_DNS_TLS_REF: 'dns-tls#acceptance',
      ENIGMA_DURABLE_STORAGE_REF: 'storage#acceptance',
      ENIGMA_KMS_KEY_REF: 'kms#acceptance',
      ENIGMA_BACKUP_TARGET_REF: 'backup#acceptance',
      ENIGMA_MONITORING_REF: 'monitoring#acceptance',
      ENIGMA_SIEM_REF: 'siem#acceptance',
      ENIGMA_RUNTIME_AUTH_REF: 'runtime-auth#acceptance',
      ENIGMA_ADMIN_AUTH_REF: 'admin-auth#acceptance',
      ENIGMA_DATA_PLANE_AUTH_REF: 'data-plane-auth#acceptance',
      ENIGMA_OPERATOR_ACCEPTANCE_REF: 'operator-acceptance#acceptance',
      ENIGMA_NETWORK_ACCESS_POLICY_REF: 'network-policy#acceptance',
      ENIGMA_KMS_CUSTODY_REF: 'kms-custody#acceptance',
      ENIGMA_TENANT_POLICY_APPROVAL_REF: 'tenant-policy#acceptance',
      ENIGMA_USAGE_METERING_REF: 'usage-metering#acceptance',
      ENIGMA_SERVICE_SETTLEMENT_REF: 'service-settlement#acceptance',
      ENIGMA_MONITORING_ALERTING_REF: 'monitoring-alerting#acceptance',
      ENIGMA_PUBLIC_SITE_SECURITY_REF: 'public-site-security#acceptance',
      ENIGMA_SECURITY_THREAT_MODEL_REF: 'security-threat-model#acceptance',
      ENIGMA_LEGAL_COMPLIANCE_REF: 'legal-compliance#acceptance',
      ENIGMA_SUPPORT_SLA_REF: 'support-sla#acceptance',
      ENIGMA_INCIDENT_DRILL_REF: 'incident-drill#acceptance',
      ENIGMA_BACKUP_RESTORE_DRILL_REF: 'backup-restore-drill#acceptance',
      ENIGMA_OPERATOR_DECISION: 'go',
    },
    argv: [],
  });
}

async function completePacket() {
  const owners = Object.fromEntries(REQUIRED_OWNER_ROLES.map((role) => [role, owner(role)]));
  const evidenceMap = Object.fromEntries(REQUIRED_EVIDENCE_ITEMS.map((key) => [key, evidence(key)]));
  return {
    schema: OPERATOR_ACCEPTANCE_PACKET_SCHEMA,
    metadata: {
      packet_id: 'packet-2026-06-23-fixture',
      customer_or_tenant: 'enigma-fixture-tenant',
      deployment_mode: 'hosted',
      environment: 'production',
      target_regions: 'us-east-1',
      requested_go_live_date: '2026-06-23',
      evidence_repository: 'ticket://operator-acceptance/fixture',
      packet_owner: 'operator owner',
      last_updated: '2026-06-23T12:00:00.000Z',
      decision: 'go',
    },
    owners,
    evidence: evidenceMap,
    readiness: {
      schema: 'enigma.infrastructure_readiness.v1',
      ok: true,
      readiness: {
        contract_ready: true,
        public_live_ready: true,
        cloudflare_observed: true,
        hosted_live_ready: true,
      },
      external_blockers: [],
    },
    manifest: await completeManifest(),
    storage: buildProductionStorageMigrationArtifact({ argv: [] }),
    release_audit: {
      schema: 'enigma.release_audit.v1',
      ok: true,
      required_failed: [],
    },
    production_manifests: await validateProductionManifestFiles({ generated_at: '2026-06-23T12:00:00.000Z' }),
  };
}

test('operator acceptance validator accepts complete go packet', async () => {
  const packet = await completePacket();
  const result = validateOperatorAcceptancePacket(packet, { generated_at: '2026-06-23T12:00:00.000Z' });
  assert.equal(result.schema, OPERATOR_ACCEPTANCE_RESULT_SCHEMA);
  assert.equal(result.ok, true);
  assert.equal(result.decision, 'go');
  assert.deepEqual(result.blockers, []);
  assert.equal(result.checked.metadata_fields, REQUIRED_PACKET_METADATA.length);
  assert.equal(result.checked.owner_roles, REQUIRED_OWNER_ROLES.length);
  assert.equal(result.checked.evidence_items, REQUIRED_EVIDENCE_ITEMS.length);
  assert.equal(result.checked.production_manifests_required, true);
  assert.equal(packet.production_manifests.status, 'accepted');
  for (const key of ['network_access_policy', 'kms_custody', 'tenant_policy_approval', 'usage_metering', 'service_settlement', 'public_site_security', 'security_threat_model', 'monitoring_alerting']) {
    assert.equal(REQUIRED_EVIDENCE_ITEMS.includes(key), true, `${key} must be required acceptance evidence`);
    assert.equal(packet.evidence[key]?.status, 'verified', `${key} complete packet evidence must be verified`);
  }
});

test('operator acceptance packet builder assembles go packet from operator refs without complete fixture mode', async () => {
  const base = await completePacket();
  const ownerRefs = Object.fromEntries(REQUIRED_OWNER_ROLES.map((role) => [role, `ticket://${role}/approval`]));
  const evidenceRefs = Object.fromEntries(REQUIRED_EVIDENCE_ITEMS.map((key) => [key, `evidence://${key}/operator-filled`]));
  const packet = await buildOperatorAcceptancePacket({
    decision: 'go',
    customerOrTenant: 'enigma-memory',
    targetRegions: 'global',
    requestedGoLiveDate: '2026-06-24',
    evidenceRepository: 'operator-evidence-repository',
    packetOwner: 'operator',
    lastUpdated: '2026-06-24T00:00:00.000Z',
    owners: ownerRefs,
    evidenceRefs,
    readiness: base.readiness,
    manifest: base.manifest,
    storage: base.storage,
    releaseAudit: base.release_audit,
    productionManifests: base.production_manifests,
  });
  const result = validateOperatorAcceptancePacket(packet, { generated_at: '2026-06-24T00:00:00.000Z' });
  assert.equal(result.ok, true);
  assert.equal(packet.owners.security_owner.organization, 'operator-provided');
  assert.equal(packet.evidence.hosted_backend_live_evidence.status, 'verified');
  assert.equal(packet.evidence.hosted_backend_live_evidence.ref, 'evidence://hosted_backend_live_evidence/operator-filled');
});

test('operator acceptance packet CLI validates owner and evidence ref files', async () => {
  const base = await completePacket();
  const dir = await mkdtemp(join(tmpdir(), 'enigma-operator-packet-inputs-'));
  const ownersPath = join(dir, 'owners.json');
  const evidenceRefsPath = join(dir, 'evidence-refs.json');
  const readinessPath = join(dir, 'readiness.json');
  const manifestPath = join(dir, 'manifest.json');
  const storagePath = join(dir, 'storage.json');
  const releaseAuditPath = join(dir, 'release-audit.json');
  const productionManifestsPath = join(dir, 'production-manifests.json');
  const outPath = join(dir, 'operator-acceptance.json');
  await writeFile(ownersPath, JSON.stringify(Object.fromEntries(REQUIRED_OWNER_ROLES.map((role) => [role, `ticket://${role}/approval`])), null, 2), 'utf8');
  await writeFile(evidenceRefsPath, JSON.stringify(Object.fromEntries(REQUIRED_EVIDENCE_ITEMS.map((key) => [key, `evidence://${key}/operator-filled`])), null, 2), 'utf8');
  await writeFile(readinessPath, JSON.stringify(base.readiness, null, 2), 'utf8');
  await writeFile(manifestPath, JSON.stringify(base.manifest, null, 2), 'utf8');
  await writeFile(storagePath, JSON.stringify(base.storage, null, 2), 'utf8');
  await writeFile(releaseAuditPath, JSON.stringify(base.release_audit, null, 2), 'utf8');
  await writeFile(productionManifestsPath, JSON.stringify(base.production_manifests, null, 2), 'utf8');
  const run = await execFileAsync(process.execPath, [
    'scripts/build-operator-acceptance-packet.mjs',
    '--out', outPath,
    '--validate',
    '--decision', 'go',
    '--tenant', 'enigma-memory',
    '--target-regions', 'global',
    '--requested-go-live-date', '2026-06-24',
    '--evidence-repository', 'operator-evidence-repository',
    '--packet-owner', 'operator',
    '--last-updated', '2026-06-24T00:00:00.000Z',
    '--owners-json', ownersPath,
    '--evidence-refs', evidenceRefsPath,
    '--readiness', readinessPath,
    '--manifest', manifestPath,
    '--storage', storagePath,
    '--release-audit', releaseAuditPath,
    '--production-manifests', productionManifestsPath,
  ], { cwd: process.cwd(), timeout: 10000, windowsHide: true });
  assert.equal(run.stderr, '');
  const summary = JSON.parse(run.stdout);
  assert.equal(summary.ok, true);
  assert.equal(summary.validation, 'go');
  assert.equal(summary.out, '<operator-acceptance-packet-output>');
  assert.doesNotMatch(run.stdout, /[A-Z]:\\|\/tmp\/|\/Users\//);
  const written = JSON.parse(await readFile(outPath, 'utf8'));
  assert.equal(written.schema, OPERATOR_ACCEPTANCE_PACKET_SCHEMA);
  assert.equal(written.evidence.hosted_backend_live_evidence.ref, 'evidence://hosted_backend_live_evidence/operator-filled');
  const validation = validateOperatorAcceptancePacket(written, { generated_at: '2026-06-24T00:00:00.000Z' });
  assert.equal(validation.ok, true);
});

test('operator acceptance validator blocks incomplete evidence and readiness', async () => {
  const packet = await completePacket();
  delete packet.owners.security_owner.approval_ref;
  packet.evidence.backup_restore_rehearsal.status = 'pending';
  packet.readiness.readiness.hosted_live_ready = false;
  packet.metadata.decision = 'blocked';
  packet.production_manifests = { schema: 'enigma.production_manifest_result.v1', ok: false, status: 'blocked', blockers: [{ message: 'unsafe public port', path: 'compose.services.relay.ports[1]' }] };
  const result = validateOperatorAcceptancePacket(packet);
  assert.equal(result.ok, false);
  assert.equal(result.decision, 'blocked');
  const messages = result.blockers.map((entry) => entry.message).join('\n');
  assert.match(messages, /metadata\.decision must be go/);
  assert.match(messages, /security_owner/);
  assert.match(messages, /backup_restore_rehearsal/);
  assert.match(messages, /hosted_live_ready/);
  assert.match(messages, /production_manifests/);
  assert.equal(result.blocker_breakdown.metadata, 1);
  assert.equal(result.blocker_breakdown.owners, 1);
  assert.equal(result.blocker_breakdown.evidence, 1);
  assert.equal(result.blocker_breakdown.readiness, 1);
  assert.equal(result.blocker_breakdown.production_manifests, 3);
});

test('operator acceptance validator rejects secrets and raw memory in packet', async () => {
  const packet = await completePacket();
  packet.evidence.runtime_auth_and_operator_access.ref = 'Bearer secret_token_value_123456789';
  assert.throws(() => validateOperatorAcceptancePacket(packet), /secret|raw-memory/i);

  const packetWithBadField = await completePacket();
  packetWithBadField.evidence.audit_outbox_siem.raw_memory = 'private prompt';
  assert.throws(() => validateOperatorAcceptancePacket(packetWithBadField), /forbidden evidence field|secret|raw-memory/i);
});

test('operator acceptance validator blocks unresolved template placeholders', async () => {
  const packet = await completePacket();
  packet.owners.security_owner.approval_ref = '<operator-provided-security_owner-approval-ref>';
  packet.evidence.hosted_backend_live_evidence.ref = '<operator-provided-hosted_backend_live_evidence-evidence-ref>';
  const result = validateOperatorAcceptancePacket(packet, { generated_at: '2026-06-24T00:00:00.000Z' });
  assert.equal(result.ok, false);
  const messages = result.blockers.map((entry) => `${entry.path}: ${entry.message}`).join('\n');
  assert.match(messages, /owners\.security_owner\.approval_ref must not contain unresolved template placeholders/);
  assert.match(messages, /evidence\.hosted_backend_live_evidence\.ref must not contain unresolved template placeholders/);
});

test('operator acceptance CLI returns blocked status for incomplete packet', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-operator-acceptance-'));
  const packet = await completePacket();
  packet.manifest.external_blockers = ['missing refs.monitoring'];
  const packetPath = join(dir, 'packet.json');
  await writeFile(packetPath, `${JSON.stringify(packet, null, 2)}\n`, 'utf8');
  const result = await execFileAsync(process.execPath, [
    'scripts/validate-operator-acceptance.mjs',
    '--packet',
    packetPath,
  ], { cwd: process.cwd(), timeout: 10000, windowsHide: true }).catch((error) => error);
  assert.equal(result.code, 1);
  assert.equal(result.stderr, '');
  const output = JSON.parse(result.stdout);
  assert.equal(output.schema, OPERATOR_ACCEPTANCE_RESULT_SCHEMA);
  assert.equal(output.ok, false);
  assert.match(JSON.stringify(output.blockers), /manifest external_blockers/);
  assert.equal(output.blocker_breakdown.manifest, 1);
  assert.doesNotMatch(result.stdout, /Bearer|PRIVATE KEY|https?:\/\/[^\s/@]+:[^\s/@]+@/i);
});

test('operator acceptance packet builder emits blocked template and complete fixture', async () => {
  const template = await buildOperatorAcceptancePacket({ argv: [] });
  assert.equal(template.schema, OPERATOR_ACCEPTANCE_PACKET_SCHEMA);
  assert.equal(template.metadata.decision, 'blocked');
  const templateValidation = validateOperatorAcceptancePacket(template);
  assert.equal(templateValidation.ok, false);
  assert.match(JSON.stringify(templateValidation.blockers), /metadata\\.customer_or_tenant|owners|evidence/);

  const complete = await buildOperatorAcceptancePacket({ argv: ['--complete-fixture'] });
  assert.equal(complete.metadata.decision, 'go');
  const result = validateOperatorAcceptancePacket(complete);
  assert.equal(result.ok, true);
  assert.equal(result.decision, 'go');
});

test('operator acceptance packet builder CLI writes validated complete fixture', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-operator-packet-builder-'));
  const out = join(dir, 'packet.json');
  const run = await execFileAsync(process.execPath, [
    'scripts/build-operator-acceptance-packet.mjs',
    '--complete-fixture',
    '--validate',
    '--out',
    out,
  ], { cwd: process.cwd(), timeout: 10000, windowsHide: true });
  assert.equal(run.stderr, '');
  assert.match(run.stdout, /\"ok\": true/);
  const summary = JSON.parse(run.stdout);
  assert.equal(summary.out, '<operator-acceptance-packet-output>');
  assert.doesNotMatch(run.stdout, /[A-Z]:\\|\/tmp\/|\/Users\//);
  const written = JSON.parse(await readFile(out, 'utf8'));
  assert.equal(written.schema, OPERATOR_ACCEPTANCE_PACKET_SCHEMA);
  const validation = validateOperatorAcceptancePacket(written, { generated_at: '2026-06-24T00:00:00.000Z' });
  assert.equal(validation.schema, OPERATOR_ACCEPTANCE_RESULT_SCHEMA);
  assert.equal(validation.ok, true);
  assert.doesNotMatch(run.stdout + JSON.stringify(written), /Bearer\s+[A-Za-z0-9._~+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@/i);
});

test('operator evidence starter emits public-safe fillable operator bundle', async () => {
  const starter = await buildOperatorEvidenceStarter({
    argv: ['--domain', 'enigmamemory.com', '--project-name', 'enigma-memory', '--tenant', 'tenant-fixture'],
    generated_at: '2026-06-24T00:00:00.000Z',
  });
  assert.equal(starter.schema, OPERATOR_EVIDENCE_STARTER_SCHEMA);
  assert.equal(starter.status, 'blocked_until_operator_evidence');
  assert.equal(starter.domain, 'enigmamemory.com');
  assert.equal(starter.tenant, 'tenant-fixture');
  assert.equal(starter.counts.hosted_ref_count, REQUIRED_REF_KEYS.length);
  assert.equal(starter.counts.hosted_ref_count, 25);
  assert.equal(Object.keys(starter.hosted_required_refs).length, REQUIRED_REF_KEYS.length);
  assert.deepEqual(Object.keys(starter.hosted_required_refs), REQUIRED_REF_KEYS);
  for (const [key, value] of Object.entries(starter.hosted_required_refs)) {
    assert.equal(typeof value, 'string', `${key} hosted ref template value must be collector-compatible`);
    assert.equal(value, `<operator-provided-${key}-evidence-ref>`);
  }
  assert.equal(starter.hosted_ref_catalog.schema, OPERATOR_HOSTED_REF_CATALOG_SCHEMA);
  assert.equal(starter.hosted_ref_catalog.generated_at, '2026-06-24T00:00:00.000Z');
  assert.equal(starter.hosted_ref_catalog.required_ref_count, starter.counts.hosted_ref_count);
  assert.equal(starter.counts.hosted_ref_catalog_count, starter.counts.hosted_ref_count);
  assert.match(starter.hosted_ref_catalog.refs.backend_host.evidence_command, /production:manifests/);
  assert.match(starter.hosted_ref_catalog.refs.dns_tls.evidence_command, /production:domain/);
  assert.match(starter.hosted_ref_catalog.refs.operator_acceptance.evidence_command, /production:acceptance/);
  assert.ok(starter.hosted_ref_catalog.refs.runtime_auth.env_names.includes('ENIGMA_RUNTIME_AUTH_REF'));
  assert.ok(starter.hosted_ref_catalog.refs.relay_deployment.env_names.includes('ENIGMA_RELAY_DEPLOYMENT_REF'));
  assert.ok(starter.hosted_ref_catalog.refs.gateway_deployment.env_names.includes('ENIGMA_GATEWAY_DEPLOYMENT_REF'));
  assert.equal(starter.hosted_ref_workstreams.schema, OPERATOR_HOSTED_REF_WORKSTREAMS_SCHEMA);
  assert.equal(starter.hosted_ref_workstreams.required_ref_count, REQUIRED_REF_KEYS.length);
  assert.deepEqual(starter.hosted_ref_workstreams.workstreams.deployment.refs.map((entry) => entry.key), ['backend_host', 'dns_tls', 'durable_storage', 'relay_deployment', 'gateway_deployment']);
  assert.equal(starter.hosted_ref_workstreams.workstreams.security.ref_count, 8);
  assert.equal(starter.readiness_manifest.schema, 'enigma.infrastructure_readiness_manifest.v1');
  assert.match(starter.readiness_manifest.external_blockers.join('\\n'), /operator evidence starter/);
  assert.equal(starter.operator_acceptance_packet.schema, OPERATOR_ACCEPTANCE_PACKET_SCHEMA);
  assert.deepEqual(Object.keys(starter.owner_approval_refs_template), REQUIRED_OWNER_ROLES);
  assert.equal(starter.owner_approval_refs_template.security_owner, '<operator-provided-security_owner-approval-ref>');
  assert.deepEqual(Object.keys(starter.evidence_refs_template), REQUIRED_EVIDENCE_ITEMS);
  assert.equal(starter.evidence_refs_template.hosted_backend_live_evidence, '<operator-provided-hosted_backend_live_evidence-evidence-ref>');
  assert.equal(validateOperatorAcceptancePacket(starter.operator_acceptance_packet).ok, false);
  assert.match(starter.commands.build_goal_audit, /--release-audit/);
  assert.match(starter.commands.build_readiness_manifest, /production:manifest/);
  assert.doesNotMatch(starter.commands.build_readiness_manifest, /production:readiness-manifest/);
  assert.match(starter.commands.build_storage_migration, /production:storage/);
  assert.match(starter.commands.build_storage_migration, /production-storage-migration\.json/);
  assert.match(starter.commands.collect_hosted_live, /--out <evidence-dir>\/hosted-backend-live-collection\.json/);
  assert.match(starter.commands.collect_hosted_live, /--evidence-out <evidence-dir>\/hosted-backend-live\.json/);
  assert.match(starter.commands.validate_hosted_live, /--evidence <evidence-dir>\/hosted-backend-live\.json/);
  assert.match(starter.commands.build_operator_packet, /--owners-json <evidence-dir>\/owner-approval-refs\.json/);
  assert.match(starter.commands.build_operator_packet, /--evidence-refs <evidence-dir>\/evidence-refs\.json/);
  assert.match(starter.commands.build_operator_packet, /--production-manifests <evidence-dir>\/production-manifests\.json/);
  assert.equal(starter.acceptance_fill_plan.schema, OPERATOR_EVIDENCE_FILL_PLAN_SCHEMA);
  assert.deepEqual(starter.acceptance_fill_plan.accepted_values.metadata.decision, ['go']);
  assert.deepEqual(starter.acceptance_fill_plan.accepted_values.owners.approval_status, ['approved']);
  assert.deepEqual(starter.acceptance_fill_plan.accepted_values.evidence.status, ['verified']);
  assert.equal(starter.acceptance_fill_plan.required_owner_roles.length, REQUIRED_OWNER_ROLES.length);
  assert.equal(starter.acceptance_fill_plan.required_evidence_items.length, REQUIRED_EVIDENCE_ITEMS.length);
  assert.equal(starter.counts.acceptance_fill_step_count, starter.acceptance_fill_plan.fill_order.length);
  assert.doesNotMatch(JSON.stringify(starter), SECRET_OR_CREDENTIAL_RE);
  const hostedLiveTemplate = starter.hosted_backend_live_evidence_template;
  assert.equal(hostedLiveTemplate.schema, HOSTED_BACKEND_LIVE_EVIDENCE_SCHEMA);
  assert.equal(hostedLiveTemplate.observed_at, '<hosted-live-observed-at-iso8601>');
  assert.deepEqual(Object.keys(hostedLiveTemplate.environment), ['domain', 'environment_id', 'cloud_provider', 'region', 'owner', 'status']);
  assert.equal(hostedLiveTemplate.environment.domain, 'enigmamemory.com');
  assert.equal(Object.keys(hostedLiveTemplate.refs).length, REQUIRED_REF_KEYS.length);
  assert.deepEqual(Object.keys(hostedLiveTemplate.refs), REQUIRED_REF_KEYS);
  assert.equal(hostedLiveTemplate.refs.relay_deployment, '<operator-provided-relay_deployment-evidence-ref>');
  assert.equal(hostedLiveTemplate.refs.gateway_deployment, '<operator-provided-gateway_deployment-evidence-ref>');
  assert.deepEqual(Object.keys(hostedLiveTemplate.probes), ['relay_livez', 'relay_readyz', 'gateway_livez', 'gateway_readyz']);
  assert.equal(hostedLiveTemplate.probes.relay_livez.url, 'https://relay.enigmamemory.com/livez');
  assert.equal(hostedLiveTemplate.probes.relay_readyz.url, 'https://relay.enigmamemory.com/readyz');
  assert.equal(hostedLiveTemplate.probes.gateway_livez.url, 'https://gateway.enigmamemory.com/livez');
  assert.equal(hostedLiveTemplate.probes.gateway_readyz.url, 'https://gateway.enigmamemory.com/readyz');
  assert.equal(hostedLiveTemplate.operator_acceptance.decision, 'go');
  assert.equal(hostedLiveTemplate.operator_acceptance.packet_ref, '<operator-acceptance-packet-ref>');
  assert.equal(hostedLiveTemplate.operator_acceptance.approved_at, '<operator-acceptance-approved-at-iso8601>');
  assert.equal(hostedLiveTemplate.operator_acceptance.approved_by, '<operator-acceptance-approver-role>');
  assert.equal(hostedLiveTemplate.claim_boundary.hosted_backend_live, true);
  assert.equal(hostedLiveTemplate.claim_boundary.public_site_live, false);
  assert.equal(hostedLiveTemplate.claim_boundary.cloudflare_credentials_claim, false);
  assert.equal(hostedLiveTemplate.claim_boundary.token_roi_claim, false);
  assert.equal(hostedLiveTemplate.claim_boundary.provider_deletion_claim, false);
  assert.equal(hostedLiveTemplate.claim_boundary.model_forgetting_claim, false);
  for (const value of Object.values(hostedLiveTemplate.claim_boundary)) assert.equal(typeof value, 'boolean');
  for (const placeholder of collectPlaceholderStrings(hostedLiveTemplate)) {
    assert.match(placeholder, /^(?:sha256:)?<[a-z0-9_-]+>$/);
    assert.doesNotMatch(placeholder, /bearer|password|private-key|api-key|account-id|token|cookie|session|raw-memory|prompt|transcript|provider-response|decrypted|[A-Z]:\\|\/Users\//i);
  }
  const hostedLiveTemplateValidation = validateHostedBackendLiveEvidence(hostedLiveTemplate);
  assert.equal(hostedLiveTemplateValidation.ok, false);
  assert.match(JSON.stringify(hostedLiveTemplateValidation.blockers), /observed_at|response_hash|approved_at/);
  assert.equal(starter.acceptance_fill_plan.generated_files.hosted_ref_catalog, 'hosted-ref-catalog.json');
  assert.equal(starter.acceptance_fill_plan.generated_files.hosted_live_evidence_template, 'hosted-backend-live.template.json');
  assert.equal(starter.acceptance_fill_plan.generated_files.hosted_live_collection, 'hosted-backend-live-collection.json');
  assert.equal(starter.acceptance_fill_plan.generated_files.hosted_live_evidence, 'hosted-backend-live.json');
  assert.equal(starter.acceptance_fill_plan.generated_files.owner_approval_refs_template, 'owner-approval-refs.template.json');
  assert.equal(starter.acceptance_fill_plan.generated_files.evidence_refs_template, 'evidence-refs.template.json');
  assert.equal(starter.acceptance_fill_plan.hosted_ref_catalog.schema, OPERATOR_HOSTED_REF_CATALOG_SCHEMA);
  assert.equal(starter.acceptance_fill_plan.hosted_ref_catalog.required_ref_count, starter.counts.hosted_ref_count);
});

test('operator evidence starter refs feed hosted live collector without hand-authored schema JSON', async () => {
  const starter = await buildOperatorEvidenceStarter({ domain: 'enigmamemory.com', tenant: 'enigma-memory', environment: 'production', projectName: 'enigma-memory' });
  const refs = Object.fromEntries(Object.keys(starter.hosted_required_refs).map((key) => [key, `${key}#operator-filled-evidence`]));
  const responseBodyFor = (url) => {
    const service = String(url).includes('relay.') ? 'enigma-relay' : 'enigma-gateway';
    if (String(url).endsWith('/readyz')) {
      return { ok: true, service, missing_evidence_refs: [], checks: [{ name: 'production_evidence_refs', ok: true, ref: 'readiness#operator-filled-evidence' }] };
    }
    return { ok: true, service };
  };
  const collection = await collectHostedBackendLiveEvidence({
    relayUrl: 'https://relay.enigmamemory.com',
    gatewayUrl: 'https://gateway.enigmamemory.com',
    refs,
    domain: 'enigmamemory.com',
    environmentId: 'enigma-memory-production',
    cloudProvider: 'operator-cloud',
    region: 'global',
    owner: 'operator',
    operatorDecision: 'go',
    operatorPacketRef: 'operator-acceptance#go',
    operatorApprovedAt: '2026-06-24T00:00:00.000Z',
    operatorApprovedBy: 'operator',
    observedAt: '2026-06-24T00:00:00.000Z',
    fetchImpl: async (url) => new Response(JSON.stringify(responseBodyFor(url)), { status: 200, headers: { 'content-type': 'application/json' } }),
  });
  assert.equal(collection.ok, true);
  assert.equal(collection.validation.ok, true);
  assert.deepEqual(Object.keys(collection.evidence.refs), REQUIRED_REF_KEYS);
  assert.doesNotMatch(JSON.stringify(collection.evidence), /<operator-provided|<hosted-live|Bearer|PRIVATE KEY/i);
});

test('operator evidence starter CLI writes redacted bundle summary', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-operator-evidence-starter-'));
  const outDir = join(dir, 'starter');
  const run = await execFileAsync(process.execPath, [
    'scripts/build-operator-evidence-starter.mjs',
    '--out-dir',
    outDir,
    '--domain',
    'enigmamemory.com',
    '--tenant',
    'tenant-fixture',
  ], { cwd: process.cwd(), timeout: 10000, windowsHide: true });
  assert.equal(run.stderr, '');
  const summary = JSON.parse(run.stdout);
  assert.equal(summary.ok, true);
  assert.equal(summary.schema, OPERATOR_EVIDENCE_STARTER_SCHEMA);
  assert.equal(summary.out_dir, '<operator-evidence-starter-output>');
  assert.equal(summary.file_count, 11);
  assert.ok(summary.generated_files.includes('hosted-backend-live.template.json'));
  assert.equal(summary.generated_files.length, summary.file_count);
  const starter = JSON.parse(await readFile(join(outDir, 'OPERATOR_EVIDENCE_STARTER.json'), 'utf8'));
  const refs = JSON.parse(await readFile(join(outDir, 'hosted-refs.template.json'), 'utf8'));
  const commands = JSON.parse(await readFile(join(outDir, 'commands.json'), 'utf8'));
  const fillPlan = JSON.parse(await readFile(join(outDir, 'acceptance-fill-plan.json'), 'utf8'));
  const catalog = JSON.parse(await readFile(join(outDir, 'hosted-ref-catalog.json'), 'utf8'));
  const workstreams = JSON.parse(await readFile(join(outDir, 'hosted-ref-workstreams.json'), 'utf8'));
  const hostedLiveTemplate = JSON.parse(await readFile(join(outDir, 'hosted-backend-live.template.json'), 'utf8'));
  const ownerApprovalRefs = JSON.parse(await readFile(join(outDir, 'owner-approval-refs.template.json'), 'utf8'));
  const evidenceRefs = JSON.parse(await readFile(join(outDir, 'evidence-refs.template.json'), 'utf8'));
  assert.equal(starter.schema, OPERATOR_EVIDENCE_STARTER_SCHEMA);
  assert.equal(Object.keys(refs).length, REQUIRED_REF_KEYS.length);
  assert.deepEqual(Object.keys(refs), REQUIRED_REF_KEYS);
  assert.equal(Object.keys(refs).length, 25);
  for (const [key, value] of Object.entries(refs)) {
    assert.equal(typeof value, 'string', `${key} hosted ref template value must be collector-compatible`);
    assert.equal(value, `<operator-provided-${key}-evidence-ref>`);
  }
  assert.deepEqual(Object.keys(ownerApprovalRefs), REQUIRED_OWNER_ROLES);
  assert.equal(ownerApprovalRefs.security_owner, '<operator-provided-security_owner-approval-ref>');
  assert.deepEqual(Object.keys(evidenceRefs), REQUIRED_EVIDENCE_ITEMS);
  assert.equal(evidenceRefs.hosted_backend_live_evidence, '<operator-provided-hosted_backend_live_evidence-evidence-ref>');
  assert.match(commands.validate_operator_acceptance, /production:acceptance/);
  assert.match(commands.build_readiness_manifest, /production:manifest/);
  assert.doesNotMatch(commands.build_readiness_manifest, /production:readiness-manifest/);
  assert.match(commands.build_storage_migration, /production:storage/);
  assert.match(commands.build_storage_migration, /production-storage-migration\.json/);
  assert.match(commands.collect_hosted_live, /--out <evidence-dir>\/hosted-backend-live-collection\.json/);
  assert.match(commands.collect_hosted_live, /--evidence-out <evidence-dir>\/hosted-backend-live\.json/);
  assert.match(commands.build_operator_packet, /--owners-json <evidence-dir>\/owner-approval-refs\.json/);
  assert.match(commands.build_operator_packet, /--evidence-refs <evidence-dir>\/evidence-refs\.json/);
  assert.match(commands.build_operator_packet, /--production-manifests <evidence-dir>\/production-manifests\.json/);
  assert.match(commands.validate_hosted_live, /--evidence <evidence-dir>\/hosted-backend-live\.json/);
  assert.equal(fillPlan.schema, OPERATOR_EVIDENCE_FILL_PLAN_SCHEMA);
  assert.equal(fillPlan.required_metadata.length, REQUIRED_PACKET_METADATA.length);
  assert.equal(fillPlan.required_owner_roles.length, REQUIRED_OWNER_ROLES.length);
  assert.equal(fillPlan.required_evidence_items.length, REQUIRED_EVIDENCE_ITEMS.length);
  assert.equal(fillPlan.generated_files.owner_approval_refs_template, 'owner-approval-refs.template.json');
  assert.equal(fillPlan.generated_files.evidence_refs_template, 'evidence-refs.template.json');
  assert.match(fillPlan.fill_order.join('\\n'), /validate_operator_acceptance/);
  assert.doesNotMatch(run.stdout, new RegExp(outDir.replace(/[\\^$.*+?()[\\]{}|]/g, '\\\\$&')));
  assert.equal(catalog.schema, OPERATOR_HOSTED_REF_CATALOG_SCHEMA);
  assert.match(catalog.generated_at, /^20\d\d-/);
  assert.equal(catalog.required_ref_count, Object.keys(refs).length);
  assert.match(catalog.refs.public_site_security.evidence_command, /production:site/);
  assert.match(catalog.refs.service_settlement.evidence_command, /production:settlement/);
  assert.match(catalog.refs.relay_deployment.evidence_command, /production:manifests/);
  assert.match(catalog.refs.gateway_deployment.evidence_command, /production:manifests/);
  assert.equal(workstreams.schema, OPERATOR_HOSTED_REF_WORKSTREAMS_SCHEMA);
  assert.equal(workstreams.required_ref_count, Object.keys(refs).length);
  assert.deepEqual(workstreams.workstreams.deployment.refs.map((entry) => entry.key), ['backend_host', 'dns_tls', 'durable_storage', 'relay_deployment', 'gateway_deployment']);
  assert.equal(workstreams.workstreams.commercial.ref_count, 2);
  assert.deepEqual(fillPlan.hosted_ref_catalog.ref_keys, Object.keys(catalog.refs));
  assert.equal(hostedLiveTemplate.schema, HOSTED_BACKEND_LIVE_EVIDENCE_SCHEMA);
  assert.equal(Object.keys(hostedLiveTemplate.refs).length, REQUIRED_REF_KEYS.length);
  assert.deepEqual(Object.keys(hostedLiveTemplate.refs), REQUIRED_REF_KEYS);
  assert.equal(hostedLiveTemplate.refs.relay_deployment, '<operator-provided-relay_deployment-evidence-ref>');
  assert.equal(hostedLiveTemplate.refs.gateway_deployment, '<operator-provided-gateway_deployment-evidence-ref>');
  assert.deepEqual(Object.keys(hostedLiveTemplate.probes), ['relay_livez', 'relay_readyz', 'gateway_livez', 'gateway_readyz']);
  assert.equal(hostedLiveTemplate.operator_acceptance.decision, 'go');
  assert.equal(hostedLiveTemplate.claim_boundary.hosted_backend_live, true);
  for (const value of Object.values(hostedLiveTemplate.claim_boundary)) assert.equal(typeof value, 'boolean');
  assert.equal(fillPlan.generated_files.hosted_live_evidence_template, 'hosted-backend-live.template.json');
  assert.equal(fillPlan.generated_files.hosted_live_collection, 'hosted-backend-live-collection.json');
  assert.equal(fillPlan.generated_files.hosted_live_evidence, 'hosted-backend-live.json');
  for (const placeholder of collectPlaceholderStrings(hostedLiveTemplate)) {
    assert.match(placeholder, /^(?:sha256:)?<[a-z0-9_-]+>$/);
    assert.doesNotMatch(placeholder, /bearer|password|private-key|api-key|account-id|token|cookie|session|raw-memory|prompt|transcript|provider-response|decrypted|[A-Z]:\\|\/Users\//i);
  }
  assert.doesNotMatch(run.stdout + JSON.stringify(starter) + JSON.stringify(refs) + JSON.stringify(hostedLiveTemplate) + JSON.stringify(fillPlan) + JSON.stringify(catalog), SECRET_OR_CREDENTIAL_RE);
});
