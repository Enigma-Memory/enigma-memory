#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildProductionReadinessManifest } from './build-production-readiness-manifest.mjs';
import { buildProductionStorageMigrationArtifact } from './build-production-storage-migration.mjs';
import { validateProductionManifestFiles } from './validate-production-manifests.mjs';
import {
  OPERATOR_ACCEPTANCE_PACKET_SCHEMA,
  REQUIRED_EVIDENCE_ITEMS,
  REQUIRED_OWNER_ROLES,
  validateOperatorAcceptancePacket,
} from './validate-operator-acceptance.mjs';

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

function getFlag(flags, names, fallback = undefined) {
  for (const name of names) if (flags.has(name)) return flags.get(name);
  return fallback;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function completeStatus(complete) {
  return complete ? 'verified' : 'pending';
}

function owner(role, complete, override = null) {
  if (isPlainObject(override)) {
    return {
      name: String(override.name ?? (complete ? `${role} owner` : '')),
      organization: String(override.organization ?? (complete ? 'Enigma operator fixture' : '')),
      approval_status: String(override.approval_status ?? override.status ?? (complete ? 'approved' : 'pending')),
      approval_ref: String(override.approval_ref ?? override.ref ?? (complete ? `ticket://${role}/approval` : '')),
    };
  }
  if (typeof override === 'string' && override.trim().length > 0) {
    return {
      name: `${role} owner`,
      organization: 'operator-provided',
      approval_status: 'approved',
      approval_ref: override.trim(),
    };
  }
  return {
    name: complete ? `${role} owner` : '',
    organization: complete ? 'Enigma operator fixture' : '',
    approval_status: complete ? 'approved' : 'pending',
    approval_ref: complete ? `ticket://${role}/approval` : '',
  };
}

function evidenceItem(key, complete, override = null) {
  if (isPlainObject(override)) {
    return {
      status: String(override.status ?? (complete ? 'verified' : 'pending')),
      ref: String(override.ref ?? ''),
      owner: String(override.owner ?? (complete ? `${key} owner` : '')),
    };
  }
  if (typeof override === 'string' && override.trim().length > 0) {
    return {
      status: 'verified',
      ref: override.trim(),
      owner: `${key} owner`,
    };
  }
  return {
    status: completeStatus(complete),
    ref: complete ? `evidence://${key}/verified` : '',
    owner: complete ? `${key} owner` : '',
  };
}

function ownersFromOverrides(overrides, complete) {
  const source = isPlainObject(overrides) ? overrides : {};
  return Object.fromEntries(REQUIRED_OWNER_ROLES.map((role) => [role, owner(role, complete, source[role])]));
}

function evidenceFromOverrides(overrides, complete) {
  const source = isPlainObject(overrides) ? overrides : {};
  return Object.fromEntries(REQUIRED_EVIDENCE_ITEMS.map((key) => [key, evidenceItem(key, complete, source[key])]));
}

async function readJsonFile(path) {
  if (!path || path === true) return undefined;
  return JSON.parse(await readFile(resolve(String(path)), 'utf8'));
}

function fixtureReadiness(complete) {
  return {
    schema: 'enigma.infrastructure_readiness.v1',
    ok: complete,
    mode: complete ? 'live' : 'contract',
    readiness: {
      contract_ready: complete,
      public_live_ready: complete,
      cloudflare_observed: complete,
      hosted_live_ready: complete,
    },
    checks: complete ? [
      { name: 'manifest.secret_scan', ok: true },
      { name: 'manifest.schema', ok: true, manifest_schema: 'enigma.infrastructure_readiness_manifest.v1' },
      { name: 'readiness.contract', ok: true, missing: [] },
      { name: 'hosted.required_refs', ok: true, missing: [], required_count: 25, missing_count: 0 },
      { name: 'operator_acceptance.decision', ok: true, decision: 'go' },
      { name: 'external_blockers.manifest', ok: true, count: 0 },
      { name: 'hosted.allow_localhost_boundary', ok: true, allow_localhost: false, hosted_live_ready: false, reason: null },
      { name: 'public_site.live', ok: true, status: 200, expected_status: 200, expected_text_matched: true },
      { name: 'relay.live', ok: true, status: 200, has_refs: true, local_demo: false, internal: false },
      { name: 'gateway.live', ok: true, status: 200, has_refs: true, local_demo: false, internal: false },
      { name: 'cloudflare.observation', ok: true, mode: 'required', observed: true, skipped: false, required: true, hosted_readiness_required: true },
    ] : [
      { name: 'hosted.required_refs', ok: false, missing: ['backend_host'], required_count: 25, missing_count: 25 },
    ],
    external_blockers: complete ? [] : ['operator acceptance packet is a generated template'],
  };
}

async function defaultManifest(complete) {
  if (!complete) {
    return buildProductionReadinessManifest({
      env: {
        ENIGMA_OPERATOR_DECISION: 'pending',
      },
      argv: ['--external-blocker', 'operator acceptance packet is a generated template'],
    });
  }
  return buildProductionReadinessManifest({
    env: {
      ENIGMA_PUBLIC_SITE_URL: 'https://enigmamemory.com/',
      CLOUDFLARE_ACCOUNT_ID: 'account-fixture',
      ENIGMA_RELAY_READY_URL: 'https://relay.enigmamemory.com/readyz',
      ENIGMA_GATEWAY_READY_URL: 'https://gateway.enigmamemory.com/readyz',
      ENIGMA_RELAY_DEPLOYMENT_REF: 'relay-deploy#acceptance-builder',
      ENIGMA_GATEWAY_DEPLOYMENT_REF: 'gateway-deploy#acceptance-builder',
      ENIGMA_BACKEND_HOST_REF: 'backend-host#acceptance-builder',
      ENIGMA_DNS_TLS_REF: 'dns-tls#acceptance-builder',
      ENIGMA_DURABLE_STORAGE_REF: 'storage#acceptance-builder',
      ENIGMA_KMS_KEY_REF: 'kms#acceptance-builder',
      ENIGMA_BACKUP_TARGET_REF: 'backup#acceptance-builder',
      ENIGMA_MONITORING_REF: 'monitoring#acceptance-builder',
      ENIGMA_SIEM_REF: 'siem#acceptance-builder',
      ENIGMA_RUNTIME_AUTH_REF: 'runtime-auth#acceptance-builder',
      ENIGMA_ADMIN_AUTH_REF: 'admin-auth#acceptance-builder',
      ENIGMA_DATA_PLANE_AUTH_REF: 'data-plane-auth#acceptance-builder',
      ENIGMA_OPERATOR_ACCEPTANCE_REF: 'operator-acceptance#acceptance-builder',
      ENIGMA_NETWORK_ACCESS_POLICY_REF: 'network-policy#acceptance-builder',
      ENIGMA_KMS_CUSTODY_REF: 'kms-custody#acceptance-builder',
      ENIGMA_TENANT_POLICY_APPROVAL_REF: 'tenant-policy#acceptance-builder',
      ENIGMA_USAGE_METERING_REF: 'usage-metering#acceptance-builder',
      ENIGMA_SERVICE_SETTLEMENT_REF: 'service-settlement#acceptance-builder',
      ENIGMA_MONITORING_ALERTING_REF: 'monitoring-alerting#acceptance-builder',
      ENIGMA_PUBLIC_SITE_SECURITY_REF: 'public-site-security#acceptance-builder',
      ENIGMA_SECURITY_THREAT_MODEL_REF: 'security-threat-model#acceptance-builder',
      ENIGMA_LEGAL_COMPLIANCE_REF: 'legal-compliance#acceptance-builder',
      ENIGMA_SUPPORT_SLA_REF: 'support-sla#acceptance-builder',
      ENIGMA_INCIDENT_DRILL_REF: 'incident-drill#acceptance-builder',
      ENIGMA_BACKUP_RESTORE_DRILL_REF: 'backup-restore-drill#acceptance-builder',
      ENIGMA_OPERATOR_DECISION: 'go',
    },
    argv: [],
  });
}

function defaultReleaseAudit(complete) {
  return {
    schema: 'enigma.release_audit.v1',
    ok: complete,
    required_failed: complete ? [] : ['generated acceptance packet template has not run release audit'],
  };
}

export async function buildOperatorAcceptancePacket(options = {}) {
  const flags = options.flags instanceof Map ? options.flags : parseArgs(options.argv ?? []);
  const complete = options.complete === true || getFlag(flags, ['complete-fixture', 'completeFixture']) === true;
  const decision = String(getFlag(flags, ['decision'], options.decision ?? (complete ? 'go' : 'blocked')));
  const ownerOverrides = await readJsonFile(getFlag(flags, ['owners', 'owners-json', 'ownersJson'])) ?? options.owners ?? options.ownerOverrides;
  const evidenceOverrides = await readJsonFile(getFlag(flags, ['evidence', 'evidence-json', 'evidenceJson', 'evidence-refs', 'evidenceRefs'])) ?? options.evidence ?? options.evidenceRefs ?? options.evidenceOverrides;
  const owners = ownersFromOverrides(ownerOverrides, complete);
  const evidence = evidenceFromOverrides(evidenceOverrides, complete);
  const readiness = await readJsonFile(getFlag(flags, ['readiness'])) ?? options.readiness ?? fixtureReadiness(complete);
  const manifest = await readJsonFile(getFlag(flags, ['manifest'])) ?? options.manifest ?? await defaultManifest(complete);
  const storage = await readJsonFile(getFlag(flags, ['storage'])) ?? options.storage ?? buildProductionStorageMigrationArtifact({ argv: [] });
  const releaseAudit = await readJsonFile(getFlag(flags, ['release-audit', 'releaseAudit'])) ?? options.release_audit ?? options.releaseAudit ?? defaultReleaseAudit(complete);
  const productionManifests = await readJsonFile(getFlag(flags, ['production-manifests', 'productionManifests'])) ?? options.production_manifests ?? options.productionManifests ?? await validateProductionManifestFiles();
  return {
    schema: OPERATOR_ACCEPTANCE_PACKET_SCHEMA,
    metadata: {
      packet_id: String(getFlag(flags, ['packet-id', 'packetId'], options.packet_id ?? options.packetId ?? `packet-${complete ? 'fixture' : 'template'}`)),
      customer_or_tenant: String(getFlag(flags, ['tenant', 'customer'], options.customer_or_tenant ?? options.customerOrTenant ?? (complete ? 'enigma-fixture-tenant' : ''))),
      deployment_mode: String(getFlag(flags, ['deployment-mode', 'deploymentMode'], options.deployment_mode ?? options.deploymentMode ?? 'hosted')),
      environment: String(getFlag(flags, ['environment'], options.environment ?? 'production')),
      target_regions: String(getFlag(flags, ['target-regions', 'targetRegions'], options.target_regions ?? options.targetRegions ?? (complete ? 'us-east-1' : ''))),
      requested_go_live_date: String(getFlag(flags, ['requested-go-live-date', 'requestedGoLiveDate'], options.requested_go_live_date ?? options.requestedGoLiveDate ?? (complete ? '2026-06-23' : ''))),
      evidence_repository: String(getFlag(flags, ['evidence-repository', 'evidenceRepository'], options.evidence_repository ?? options.evidenceRepository ?? (complete ? 'ticket://operator-acceptance/fixture' : ''))),
      packet_owner: String(getFlag(flags, ['packet-owner', 'packetOwner'], options.packet_owner ?? options.packetOwner ?? (complete ? 'operator owner' : ''))),
      last_updated: String(getFlag(flags, ['last-updated', 'lastUpdated'], options.last_updated ?? options.lastUpdated ?? new Date(0).toISOString())),
      decision,
    },
    owners,
    evidence,
    readiness,
    manifest,
    storage,
    release_audit: releaseAudit,
    production_manifests: productionManifests,
    claim_boundary: [
      'Generated packets are templates unless every owner/evidence item is complete and validator output is go.',
      'This builder does not create cloud resources, run production probes, approve go-live, or verify secrets.',
      'Do not paste raw memory, bearer tokens, private keys, DSNs with credentials, prompts, transcripts, or decrypted content into packet fields.',
    ],
  };
}

async function main() {
  const flags = parseArgs();
  const packet = await buildOperatorAcceptancePacket({ flags });
  const result = getFlag(flags, ['validate']) === true ? validateOperatorAcceptancePacket(packet) : null;
  const out = getFlag(flags, ['out']);
  const packetText = `${JSON.stringify(packet, null, 2)}\n`;
  if (out && out !== true) {
    const outPath = resolve(String(out));
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, packetText, 'utf8');
    process.stdout.write(`${JSON.stringify({ ok: true, out: '<operator-acceptance-packet-output>', schema: packet.schema, decision: packet.metadata.decision, validation: result?.decision ?? null, blocker_count: result?.blockers?.length ?? null }, null, 2)}\n`);
    return;
  }
  process.stdout.write(result === null ? packetText : `${JSON.stringify({ packet, validation: result }, null, 2)}\n`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.name ?? 'Error'}: ${error.message}\n`);
    process.exitCode = 1;
  });
}
