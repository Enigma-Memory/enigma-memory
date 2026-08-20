import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildProductionReadinessManifest, renderProductionReadinessManifestPlain } from '../scripts/build-production-readiness-manifest.mjs';
import { INFRASTRUCTURE_READINESS_MANIFEST_SCHEMA, validateInfrastructureReadinessManifest } from '../scripts/infrastructure-readiness.mjs';

const execFileAsync = promisify(execFile);

const COMPLETE_ENV = Object.freeze({
  ENIGMA_PUBLIC_SITE_URL: 'https://enigmamemory.com/',
  CLOUDFLARE_ACCOUNT_ID: 'account-for-manifest-test',
  ENIGMA_RELAY_READY_URL: 'https://relay.enigmamemory.com/readyz',
  ENIGMA_GATEWAY_READY_URL: 'https://gateway.enigmamemory.com/readyz',
  ENIGMA_RELAY_DEPLOYMENT_REF: 'relay-deploy#manifest-test',
  ENIGMA_GATEWAY_DEPLOYMENT_REF: 'gateway-deploy#manifest-test',
  ENIGMA_BACKEND_HOST_REF: 'backend-host#manifest-test',
  ENIGMA_DNS_TLS_REF: 'dns-tls#manifest-test',
  ENIGMA_DURABLE_STORAGE_REF: 'storage#manifest-test',
  ENIGMA_KMS_KEY_REF: 'kms#manifest-test',
  ENIGMA_BACKUP_TARGET_REF: 'backup#manifest-test',
  ENIGMA_MONITORING_REF: 'monitoring#manifest-test',
  ENIGMA_SIEM_REF: 'siem#manifest-test',
  ENIGMA_RUNTIME_AUTH_REF: 'runtime-auth#manifest-test',
  ENIGMA_ADMIN_AUTH_REF: 'admin-auth#manifest-test',
  ENIGMA_DATA_PLANE_AUTH_REF: 'data-plane-auth#manifest-test',
  ENIGMA_OPERATOR_ACCEPTANCE_REF: 'operator-acceptance#manifest-test',
  ENIGMA_NETWORK_ACCESS_POLICY_REF: 'network-policy#manifest-test',
  ENIGMA_KMS_CUSTODY_REF: 'kms-custody#manifest-test',
  ENIGMA_TENANT_POLICY_APPROVAL_REF: 'tenant-policy#manifest-test',
  ENIGMA_USAGE_METERING_REF: 'usage-metering#manifest-test',
  ENIGMA_SERVICE_SETTLEMENT_REF: 'service-settlement#manifest-test',
  ENIGMA_MONITORING_ALERTING_REF: 'monitoring-alerting#manifest-test',
  ENIGMA_PUBLIC_SITE_SECURITY_REF: 'public-site-security#manifest-test',
  ENIGMA_SECURITY_THREAT_MODEL_REF: 'security-threat-model#manifest-test',
  ENIGMA_LEGAL_COMPLIANCE_APPROVAL_REF: 'legal-compliance#manifest-test',
  ENIGMA_SUPPORT_SLA_REF: 'support-sla#manifest-test',
  ENIGMA_INCIDENT_DRILL_REF: 'incident-drill#manifest-test',
  ENIGMA_BACKUP_RESTORE_DRILL_REF: 'backup-restore-drill#manifest-test',
  ENIGMA_OPERATOR_DECISION: 'go',
});

function serialized(value) {
  return JSON.stringify(value);
}

test('production readiness manifest builder emits complete public-safe refs', async () => {
  const manifest = await buildProductionReadinessManifest({ env: COMPLETE_ENV, argv: [] });
  assert.equal(manifest.schema, INFRASTRUCTURE_READINESS_MANIFEST_SCHEMA);
  assert.equal(manifest.public_site.url, 'https://enigmamemory.com/');
  assert.equal(manifest.relay.url, 'https://relay.enigmamemory.com/readyz');
  assert.equal(manifest.gateway.url, 'https://gateway.enigmamemory.com/readyz');
  assert.equal(manifest.refs.backend_host, 'backend-host#manifest-test');
  assert.equal(manifest.refs.kms_or_secret_custody, 'kms#manifest-test');
  assert.equal(manifest.refs.admin_auth, 'admin-auth#manifest-test');
  assert.equal(manifest.refs.network_access_policy, 'network-policy#manifest-test');
  assert.equal(manifest.refs.service_settlement, 'service-settlement#manifest-test');
  assert.equal(manifest.refs.public_site_security, 'public-site-security#manifest-test');
  assert.equal(manifest.refs.security_threat_model, 'security-threat-model#manifest-test');
  assert.equal(manifest.refs.legal_compliance_approval, 'legal-compliance#manifest-test');
  assert.equal(manifest.operator_acceptance.decision, 'go');
  assert.deepEqual(manifest.external_blockers, []);
  assert.doesNotMatch(serialized(manifest), /Bearer|Basic|PRIVATE KEY|password|raw memory/i);
  const validated = await validateInfrastructureReadinessManifest(manifest);
  assert.equal(validated.schema, INFRASTRUCTURE_READINESS_MANIFEST_SCHEMA);
});

test('production readiness manifest builder accepts KMS file ref aliases used by runtime manifests', async () => {
  const env = { ...COMPLETE_ENV };
  delete env.ENIGMA_KMS_KEY_REF;
  env.ENIGMA_KMS_KEY_REF_FILE = '/run/secrets/kms_key_ref';
  const manifest = await buildProductionReadinessManifest({ env, argv: [] });
  assert.equal(manifest.refs.kms_or_secret_custody, '/run/secrets/kms_key_ref');
  assert.equal(manifest.external_blockers.length, 0);
});

test('production readiness manifest builder keeps missing refs as explicit blockers', async () => {
  const manifest = await buildProductionReadinessManifest({
    env: {
      ENIGMA_PUBLIC_SITE_URL: 'https://enigmamemory.com/',
      ENIGMA_RELAY_READY_URL: 'https://relay.enigmamemory.com/readyz',
      ENIGMA_GATEWAY_READY_URL: 'https://gateway.enigmamemory.com/readyz',
      ENIGMA_OPERATOR_DECISION: 'pending',
    },
    argv: [],
  });
  assert.equal(manifest.operator_acceptance.decision, 'pending');
  assert.ok(manifest.external_blockers.some((blocker) => /missing refs\.backend_host/i.test(blocker)));
  assert.ok(manifest.external_blockers.some((blocker) => /operator acceptance decision is pending/i.test(blocker)));
  assert.equal(manifest.refs.backend_host, undefined);
});

test('production readiness manifest plain output is readable and claim-bounded', async () => {
  const manifest = await buildProductionReadinessManifest({
    env: {
      ENIGMA_PUBLIC_SITE_URL: 'https://enigmamemory.com/',
      ENIGMA_RELAY_READY_URL: 'https://relay.enigmamemory.com/readyz',
      ENIGMA_GATEWAY_READY_URL: 'https://gateway.enigmamemory.com/readyz',
      ENIGMA_OPERATOR_DECISION: 'pending',
    },
    argv: [],
  });
  const plain = renderProductionReadinessManifestPlain(manifest);

  assert.match(plain, /^Enigma production readiness manifest\n/);
  assert.match(plain, /Status: Needs attention/);
  assert.match(plain, /Mode: hosted-live/);
  assert.match(plain, /Dependency refs: /);
  assert.match(plain, /Operator decision: pending/);
  assert.match(plain, /External blockers: /);
  assert.match(plain, /Blocker: missing refs\.backend_host/);
  assert.match(plain, /Boundary: public-safe readiness manifest only/);
  assert.doesNotMatch(plain, /^\s*\{/);
  assert.doesNotMatch(plain, /Bearer|Basic|PRIVATE KEY|password|raw_memory|C:\\Users\\|\/home\/|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/i);
});

test('production readiness manifest builder rejects secret-looking refs', async () => {
  await assert.rejects(
    () => buildProductionReadinessManifest({
      env: {
        ...COMPLETE_ENV,
        ENIGMA_DURABLE_STORAGE_REF: 'https://user:password@db.example.invalid/enigma',
      },
      argv: [],
    }),
    /URL credentials|secret/i,
  );
});

test('production readiness manifest CLI writes validated manifest without printing secrets', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-production-manifest-'));
  const out = join(dir, 'readiness.json');
  const { stdout, stderr } = await execFileAsync(process.execPath, [
    'scripts/build-production-readiness-manifest.mjs',
    '--out',
    out,
  ], {
    cwd: process.cwd(),
    env: { ...process.env, ...COMPLETE_ENV },
    timeout: 10000,
    windowsHide: true,
  });
  assert.equal(stderr, '');
  assert.match(stdout, /"ok": true/);
  const manifest = JSON.parse(await readFile(out, 'utf8'));
  assert.equal(manifest.refs.data_plane_auth, 'data-plane-auth#manifest-test');
  assert.equal(manifest.refs.backup_restore_drill, 'backup-restore-drill#manifest-test');
  assert.equal(manifest.refs.security_threat_model, 'security-threat-model#manifest-test');
  assert.equal(manifest.external_blockers.length, 0);
  assert.doesNotMatch(stdout + serialized(manifest), /Bearer|Basic|PRIVATE KEY|password|raw memory/i);
});

test('production readiness manifest CLI writes JSON while printing plain output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-production-manifest-plain-'));
  const out = join(dir, 'readiness.json');
  const { stdout, stderr } = await execFileAsync(process.execPath, [
    'scripts/build-production-readiness-manifest.mjs',
    '--out',
    out,
    '--plain',
  ], {
    cwd: process.cwd(),
    env: { ...process.env, ...COMPLETE_ENV },
    timeout: 10000,
    windowsHide: true,
  });
  assert.equal(stderr, '');
  assert.match(stdout, /^Enigma production readiness manifest\n/);
  assert.match(stdout, /Status: Ready/);
  assert.match(stdout, /Dependency refs: 23\/23/);
  assert.match(stdout, /Boundary: public-safe readiness manifest only/);
  assert.doesNotMatch(stdout, /^\s*\{/);
  assert.equal(stdout.includes(dir), false);
  assert.equal(stdout.includes(out), false);
  const manifest = JSON.parse(await readFile(out, 'utf8'));
  assert.equal(manifest.schema, INFRASTRUCTURE_READINESS_MANIFEST_SCHEMA);
  assert.equal(manifest.external_blockers.length, 0);
});
