#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PRODUCTION_MANIFEST_RESULT_SCHEMA = 'enigma.production_manifest_result.v1';

const REQUIRED_HOSTED_ENV_REF_SPECS = Object.freeze([
  { id: 'ENIGMA_BACKEND_HOST_REF', pattern: /\bENIGMA_(?:BACKEND_HOST_REF|RELAY_BACKEND_HOST_REF|GATEWAY_BACKEND_HOST_REF|RELAY_DEPLOYMENT_REF|GATEWAY_DEPLOYMENT_REF)\b/ },
  { id: 'ENIGMA_DNS_TLS_REF', pattern: /\bENIGMA_(?:DNS_TLS_REF|TLS_REF|RELAY_DNS_TLS_REF|GATEWAY_DNS_TLS_REF)\b/ },
  { id: 'ENIGMA_DURABLE_STORAGE_REF', pattern: /\bENIGMA_(?:DURABLE_STORAGE_REF|EXTERNAL_STORAGE_REF|EXTERNAL_STORAGE_DSN|EXTERNAL_STORAGE_DSN_FILE|RELAY_STORAGE_REF|GATEWAY_STORAGE_REF)\b/ },
  { id: 'ENIGMA_KMS_KEY_REF', pattern: /\bENIGMA_(?:KMS_KEY_REF|KMS_KEY_REF_FILE|KMS_REF|EXTERNAL_KMS_REF|GATEWAY_SIGNER_REF|GATEWAY_SIGNING_KEY_FILE|RELAY_SIGNING_KEY_FILE)\b/ },
  { id: 'ENIGMA_MONITORING_REF', pattern: /\bENIGMA_(?:MONITORING_REF|RELAY_MONITORING_REF|GATEWAY_MONITORING_REF)\b/ },
  { id: 'ENIGMA_BACKUP_TARGET', pattern: /\bENIGMA_BACKUP_TARGET(?:_REF|_URI|_URI_FILE)\b/ },
  { id: 'ENIGMA_NETWORK_ACCESS_POLICY_REF', pattern: /\bENIGMA_NETWORK_ACCESS_POLICY_REF\b/ },
  { id: 'ENIGMA_KMS_CUSTODY_REF', pattern: /\bENIGMA_KMS_CUSTODY_REF\b/ },
  { id: 'ENIGMA_TENANT_POLICY_APPROVAL_REF', pattern: /\bENIGMA_TENANT_POLICY_APPROVAL_REF\b/ },
  { id: 'ENIGMA_USAGE_METERING_REF', pattern: /\bENIGMA_USAGE_METERING_REF\b/ },
  { id: 'ENIGMA_SERVICE_SETTLEMENT_REF', pattern: /\bENIGMA_SERVICE_SETTLEMENT_REF\b/ },
  { id: 'ENIGMA_MONITORING_ALERTING_REF', pattern: /\bENIGMA_MONITORING_ALERTING_REF\b/ },
  { id: 'ENIGMA_SIEM_REF', pattern: /\bENIGMA_(?:SIEM_REF|AUDIT_SINK_REF|LOG_SINK_REF|SIEM_EXPORT_ENDPOINT(?:_FILE)?)\b/ },
  { id: 'ENIGMA_PUBLIC_SITE_SECURITY_REF', pattern: /\bENIGMA_PUBLIC_SITE_SECURITY_REF\b/ },
  { id: 'ENIGMA_SECURITY_THREAT_MODEL_REF', pattern: /\bENIGMA_SECURITY_THREAT_MODEL_REF\b/ },
  { id: 'ENIGMA_LEGAL_COMPLIANCE_APPROVAL_REF', pattern: /\bENIGMA_LEGAL_COMPLIANCE_APPROVAL_REF\b/ },
  { id: 'ENIGMA_SUPPORT_SLA_REF', pattern: /\bENIGMA_SUPPORT_SLA_REF\b/ },
  { id: 'ENIGMA_INCIDENT_DRILL_REF', pattern: /\bENIGMA_INCIDENT_DRILL_REF\b/ },
  { id: 'ENIGMA_BACKUP_RESTORE_DRILL_REF', pattern: /\bENIGMA_BACKUP_RESTORE_DRILL_REF\b/ },
  { id: 'ENIGMA_OPERATOR_ACCEPTANCE_DECISION', pattern: /\bENIGMA_OPERATOR_ACCEPTANCE_DECISION\b/ },
]);

export const REQUIRED_HOSTED_ENV_REFS = Object.freeze(REQUIRED_HOSTED_ENV_REF_SPECS.map((item) => item.id));

const SECRET_VALUE_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|raw memory|private prompt|full transcript|decrypted capsule)/iu;

const CLAIM_BOUNDARY = Object.freeze([
  'This validator checks production-shaped backend manifests for fail-closed safety gates and required public-safe refs only.',
  'Passing manifests are not hosted backend readiness until deployed endpoints, storage, KMS, SIEM, backup, monitoring, legal, support, and operator acceptance evidence are verified.',
  'Manifest files and validator output must not contain token values, private keys, DSNs with embedded credentials, prompts, transcripts, decrypted capsules, or raw memory.',
]);


function publicManifestPath(path, label) {
  const rel = relative(process.cwd(), path).replace(/\\/g, '/');
  if (rel.length > 0 && !rel.startsWith('../') && rel !== '..' && !/^[A-Za-z]:\//u.test(rel)) return rel;
  return `<external-${label}-manifest>`;
}
function blocker(message, path) {
  return { message, path };
}

function include(text, needle) {
  return text.includes(needle);
}

function requireInclude(text, needle, path, blockers, message) {
  if (!include(text, needle)) blockers.push(blocker(message ?? `missing ${needle}`, path));
}

function assertNoSecretValues(text, path, blockers) {
  const match = SECRET_VALUE_RE.exec(text);
  if (match) blockers.push(blocker('manifest contains secret-looking or raw-memory-looking literal', path));
}

function requiredHostedEnvRefCoverage(text) {
  const present = REQUIRED_HOSTED_ENV_REF_SPECS.filter((spec) => spec.pattern.test(text)).map((spec) => spec.id);
  const missing = REQUIRED_HOSTED_ENV_REF_SPECS.filter((spec) => !present.includes(spec.id)).map((spec) => spec.id);
  return { present, missing };
}

function serviceBlock(text, service) {
  const servicePattern = new RegExp(`\\n  ${service}:\\n([\\s\\S]*?)(?=\\n  [a-z][a-z0-9_-]*:\\n|\\nsecrets:\\n|$)`);
  return servicePattern.exec(text)?.[1] ?? null;
}

function composePortEntries(block) {
  const match = /ports:\s*\n((?:\s*-\s+"[^"]+"\s*\n?)+)/.exec(block);
  if (!match) return null;
  return [...match[1].matchAll(/-\s+"([^"]+)"/g)].map((item) => item[1]);
}

function isLoopbackPortMapping(value) {
  return /^127\.0\.0\.1:\d+:\d+$/.test(value);
}

function composeServiceChecks(text, service, blockers) {
  const block = serviceBlock(text, service);
  if (!block) {
    blockers.push(blocker(`compose missing ${service} service`, `compose.services.${service}`));
    return { service, ok: false, hosted_readiness_ref_count: 0 };
  }

  requireInclude(block, 'NODE_ENV: production', `compose.services.${service}.environment.NODE_ENV`, blockers, `${service} must set NODE_ENV production`);
  requireInclude(block, 'ENIGMA_BACKEND_MODE: production', `compose.services.${service}.environment.ENIGMA_BACKEND_MODE`, blockers, `${service} must set backend production mode`);
  requireInclude(block, 'ENIGMA_DISABLE_LOCAL_DEMO_FALLBACK: "true"', `compose.services.${service}.environment.ENIGMA_DISABLE_LOCAL_DEMO_FALLBACK`, blockers, `${service} must disable local demo fallback`);
  requireInclude(block, 'ENIGMA_REQUIRE_OPERATOR_ACCEPTANCE_EVIDENCE: "true"', `compose.services.${service}.environment.ENIGMA_REQUIRE_OPERATOR_ACCEPTANCE_EVIDENCE`, blockers, `${service} must require operator acceptance evidence`);
  requireInclude(block, 'ENIGMA_READINESS_FAIL_CLOSED: "true"', `compose.services.${service}.environment.ENIGMA_READINESS_FAIL_CLOSED`, blockers, `${service} must fail closed for readiness`);
  requireInclude(block, 'read_only: true', `compose.services.${service}.read_only`, blockers, `${service} must use read_only filesystem`);
  requireInclude(block, 'user: "1000:1000"', `compose.services.${service}.user`, blockers, `${service} must run as non-root fixed uid/gid`);
  requireInclude(block, 'cap_drop: ["ALL"]', `compose.services.${service}.cap_drop`, blockers, `${service} must drop all Linux capabilities`);
  requireInclude(block, 'no-new-privileges:true', `compose.services.${service}.security_opt`, blockers, `${service} must set no-new-privileges`);
  requireInclude(block, 'tmpfs:', `compose.services.${service}.tmpfs`, blockers, `${service} must use explicit tmpfs for writable temp`);
  requireInclude(block, '/livez', `compose.services.${service}.healthcheck`, blockers, `${service} healthcheck must probe /livez`);
  requireInclude(block, '/readyz', `compose.services.${service}.healthcheck`, blockers, `${service} healthcheck must probe /readyz`);
  const portEntries = composePortEntries(block);
  if (!portEntries || portEntries.length === 0) {
    blockers.push(blocker(`${service} must declare loopback-only compose port mapping`, `compose.services.${service}.ports`));
  } else {
    portEntries.forEach((entry, index) => {
      if (!isLoopbackPortMapping(entry)) blockers.push(blocker(`${service} port mapping ${entry} must bind to 127.0.0.1 only`, `compose.services.${service}.ports[${index}]`));
    });
  }
  if (/image:\s*[^\n]*:(?:latest|dev|main)\b/.test(block)) blockers.push(blocker(`${service} image must not use mutable latest/dev/main tag`, `compose.services.${service}.image`));
  const refs = requiredHostedEnvRefCoverage(block);
  for (const name of refs.missing) blockers.push(blocker(`${service} missing hosted readiness ref ${name}`, `compose.services.${service}.environment.${name}`));
  return { service, ok: refs.missing.length === 0, hosted_readiness_ref_count: refs.present.length };
}

export function validateProductionComposeManifestText(text, options = {}) {
  const blockers = [];
  assertNoSecretValues(text, 'compose', blockers);
  const relay = composeServiceChecks(text, 'relay', blockers);
  const gateway = composeServiceChecks(text, 'gateway', blockers);
  requireInclude(text, 'ENIGMA_REQUIRE_EXTERNAL_STORAGE: "true"', 'compose.services.relay.environment.ENIGMA_REQUIRE_EXTERNAL_STORAGE', blockers, 'relay must require external storage');
  requireInclude(text, 'ENIGMA_REQUIRE_EXTERNAL_KMS: "true"', 'compose.environment.ENIGMA_REQUIRE_EXTERNAL_KMS', blockers, 'compose services must require external KMS');
  requireInclude(text, 'ENIGMA_REQUIRE_SIEM_EXPORT: "true"', 'compose.services.gateway.environment.ENIGMA_REQUIRE_SIEM_EXPORT', blockers, 'gateway must require SIEM export');
  for (const secret of ['relay_signing_key', 'gateway_signing_key', 'external_storage_dsn', 'kms_key_ref', 'backup_target_uri', 'siem_export_endpoint', 'operator_acceptance_evidence_uri']) {
    if (!new RegExp(`\\n  ${secret}:\\n\\s+file:\\s+\\./operator-secrets/`).test(text)) blockers.push(blocker(`compose secret ${secret} must reference operator-secrets file`, `compose.secrets.${secret}`));
  }
  const allRefs = requiredHostedEnvRefCoverage(text);
  for (const name of allRefs.missing) blockers.push(blocker(`compose manifest missing hosted readiness ref ${name}`, `compose.environment.${name}`));
  return {
    path: options.path ?? null,
    ok: blockers.length === 0,
    blockers,
    relay,
    gateway,
    relay_fail_closed: true,
    gateway_fail_closed: true,
    public_ports_loopback_only: blockers.every((item) => !item.path.startsWith('compose.services.') || !item.path.includes('.ports')),
    hosted_readiness_ref_count: allRefs.present.length,
    required_hosted_ref_count: REQUIRED_HOSTED_ENV_REFS.length,
    required_secret_count: 7,
  };
}

function documentsOfKind(text, kind) {
  return text.split(/^---\s*$/m).filter((item) => new RegExp(`\\bkind:\\s*${kind}\\b`).test(item));
}

function documentName(document) {
  return /\bname:\s*([^\s]+)/.exec(document)?.[1] ?? '<unnamed>';
}

function ingressBlock(text, name) {
  return documentsOfKind(text, 'Ingress').find((item) => documentName(item) === name);
}

function documentBlock(text, kind, name) {
  return documentsOfKind(text, kind).find((item) => documentName(item) === name);
}

function deploymentBlock(text, name) {
  return documentBlock(text, 'Deployment', name);
}

function isPrivateIngress(document) {
  return /operator-selected-private-ingress-class/.test(document);
}

function ingressPaths(document) {
  return [...document.matchAll(/path:\s*(\/[^\s]+)/g)].map((match) => match[1]);
}

function validatePublicIngressDocument(document, pathBase, blockers) {
  const paths = ingressPaths(document);
  const pathSet = new Set(paths);
  if (/pathType:\s*Prefix\b/.test(document)) blockers.push(blocker('public ingress must not use Prefix path routing', `${pathBase}.pathType`));
  if (/path:\s*\/(?:$|\s)/.test(document)) blockers.push(blocker('public ingress must not expose root path', `${pathBase}.paths`));
  if (/path:\s*\/(?:relay|witness|pairing|gateway|policy|siem|admin|data)\b/i.test(document)) blockers.push(blocker('public ingress must not expose admin or data-plane paths', `${pathBase}.paths`));
  if (paths.length !== 4 || pathSet.size !== 2 || !pathSet.has('/readyz') || !pathSet.has('/livez')) blockers.push(blocker('public ingress must expose only relay/gateway /readyz and /livez paths', `${pathBase}.paths`));
  const exactPathMatches = [...document.matchAll(/path:\s*(\/[^\s]+)\s*\n\s*pathType:\s*Exact\b/g)].map((match) => match[1]);
  if (exactPathMatches.length !== paths.length) blockers.push(blocker('public ingress health paths must all use Exact pathType', `${pathBase}.pathType`));
  return paths;
}

function k8sDeploymentChecks(text, name, blockers) {
  const block = deploymentBlock(text, name);
  if (!block) {
    blockers.push(blocker(`kubernetes missing ${name} deployment`, `kubernetes.deployments.${name}`));
    return { name, ok: false };
  }
  requireInclude(block, 'replicas: 2', `kubernetes.deployments.${name}.replicas`, blockers, `${name} must request at least two replicas in the reference manifest`);
  requireInclude(block, 'automountServiceAccountToken: false', `kubernetes.deployments.${name}.automountServiceAccountToken`, blockers, `${name} must disable service-account token automount`);
  requireInclude(block, 'runAsNonRoot: true', `kubernetes.deployments.${name}.securityContext.runAsNonRoot`, blockers, `${name} must run as non-root`);
  requireInclude(block, 'readOnlyRootFilesystem: true', `kubernetes.deployments.${name}.securityContext.readOnlyRootFilesystem`, blockers, `${name} must use a read-only root filesystem`);
  requireInclude(block, 'drop: ["ALL"]', `kubernetes.deployments.${name}.securityContext.capabilities`, blockers, `${name} must drop all capabilities`);
  requireInclude(block, 'readinessProbe:', `kubernetes.deployments.${name}.readinessProbe`, blockers, `${name} must define readiness probe`);
  requireInclude(block, 'livenessProbe:', `kubernetes.deployments.${name}.livenessProbe`, blockers, `${name} must define liveness probe`);
  requireInclude(block, 'optional: false', `kubernetes.deployments.${name}.secrets`, blockers, `${name} secret refs must be required`);
  if (/image:\s*[^\n]*:(?:latest|dev|main)\b/.test(block)) blockers.push(blocker(`${name} image must not use mutable latest/dev/main tag`, `kubernetes.deployments.${name}.image`));
  return { name, ok: true };
}

export function validateKubernetesBackendManifestText(text, options = {}) {
  const blockers = [];
  assertNoSecretValues(text, 'kubernetes', blockers);
  const ingressDocs = documentsOfKind(text, 'Ingress');
  const publicIngress = ingressBlock(text, 'enigma-public');
  const privateIngress = ingressBlock(text, 'enigma-admin');
  if (!publicIngress) blockers.push(blocker('kubernetes missing enigma-public ingress', 'kubernetes.ingress.enigma-public'));
  if (!privateIngress) blockers.push(blocker('kubernetes missing enigma-admin ingress', 'kubernetes.ingress.enigma-admin'));

  const publicIngressDocs = ingressDocs.filter((document) => !isPrivateIngress(document));
  let publicIngressPaths = [];
  let publicPrefixPaths = 0;
  let publicAdminOrDataPaths = 0;
  for (const document of publicIngressDocs) {
    const name = documentName(document);
    const pathBase = `kubernetes.ingress.${name}`;
    if (name !== 'enigma-public') blockers.push(blocker(`unexpected public ingress ${name}; public ingress must be enigma-public only`, pathBase));
    const paths = validatePublicIngressDocument(document, pathBase, blockers);
    if (name === 'enigma-public') publicIngressPaths = paths;
    if (/pathType:\s*Prefix\b/.test(document)) publicPrefixPaths += 1;
    if (/path:\s*\/(?:relay|witness|pairing|gateway|policy|siem|admin|data)\b/i.test(document)) publicAdminOrDataPaths += 1;
  }
  if (privateIngress && !isPrivateIngress(privateIngress)) blockers.push(blocker('private admin ingress must stay on private ingress class placeholder', 'kubernetes.ingress.enigma-admin.class'));

  requireInclude(text, 'pod-security.kubernetes.io/enforce: restricted', 'kubernetes.namespace.pod-security', blockers, 'namespace must enforce restricted pod security');
  requireInclude(text, 'kind: NetworkPolicy', 'kubernetes.networkPolicy', blockers, 'manifest must define NetworkPolicy');
  requireInclude(text, 'name: enigma-default-deny', 'kubernetes.networkPolicy.defaultDeny', blockers, 'manifest must include default-deny NetworkPolicy');
  requireInclude(text, 'name: enigma-allow-required-egress-placeholders', 'kubernetes.networkPolicy.egress', blockers, 'manifest must include explicit egress placeholder NetworkPolicy');
  requireInclude(text, 'kind: CronJob', 'kubernetes.backup.cronJob', blockers, 'manifest must include backup CronJob placeholder');
  requireInclude(text, 'echo backup target must be wired by operator; exit 1', 'kubernetes.backup.cronJob.failClosed', blockers, 'backup CronJob placeholder must fail closed until wired');
  requireInclude(text, 'kind: PodDisruptionBudget', 'kubernetes.pdb', blockers, 'manifest must include PodDisruptionBudget');
  const relay = k8sDeploymentChecks(text, 'enigma-relay', blockers);
  const gateway = k8sDeploymentChecks(text, 'enigma-gateway', blockers);
  const refs = requiredHostedEnvRefCoverage(text);
  for (const name of refs.missing) blockers.push(blocker(`kubernetes manifest missing hosted readiness ref ${name}`, `kubernetes.config.${name}`));

  return {
    path: options.path ?? null,
    ok: blockers.length === 0,
    blockers,
    relay,
    gateway,
    public_readyz_paths: publicIngressPaths.filter((path) => path === '/readyz').length,
    public_livez_paths: publicIngressPaths.filter((path) => path === '/livez').length,
    public_prefix_paths: publicPrefixPaths,
    public_admin_or_data_paths: publicAdminOrDataPaths,
    private_admin_ingress_class: Boolean(privateIngress && isPrivateIngress(privateIngress)),
    default_deny_network_policy: include(text, 'name: enigma-default-deny'),
    backup_placeholder_fail_closed: include(text, 'echo backup target must be wired by operator; exit 1'),
    hosted_readiness_ref_count: refs.present.length,
    required_hosted_ref_count: REQUIRED_HOSTED_ENV_REFS.length,
  };
}

export async function validateProductionManifestFiles(options = {}) {
  const composePath = resolve(options.composePath ?? options.compose ?? 'deploy/docker-compose.production.example.yml');
  const kubernetesPath = resolve(options.kubernetesPath ?? options.kubernetes ?? 'deploy/kubernetes/enigma-backend.example.yaml');
  const [composeText, kubernetesText] = await Promise.all([
    readFile(composePath, 'utf8'),
    readFile(kubernetesPath, 'utf8'),
  ]);
  const compose = validateProductionComposeManifestText(composeText, { path: publicManifestPath(composePath, 'compose') });
  const kubernetes = validateKubernetesBackendManifestText(kubernetesText, { path: publicManifestPath(kubernetesPath, 'kubernetes') });
  const blockers = [
    ...compose.blockers.map((item) => ({ ...item, source: 'compose' })),
    ...kubernetes.blockers.map((item) => ({ ...item, source: 'kubernetes' })),
  ];
  return {
    schema: PRODUCTION_MANIFEST_RESULT_SCHEMA,
    generated_at: options.generated_at ?? options.generatedAt ?? new Date().toISOString(),
    ok: blockers.length === 0,
    status: blockers.length === 0 ? 'accepted' : 'blocked',
    compose,
    kubernetes,
    blockers,
    claim_boundary: [...CLAIM_BOUNDARY],
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--compose') options.composePath = argv[++index];
    else if (arg === '--kubernetes') options.kubernetesPath = argv[++index];
    else if (arg === '--out') options.out = argv[++index];
    else if (arg === '--generated-at') options.generated_at = argv[++index];
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function help() {
  return `Usage: node scripts/validate-production-manifests.mjs [--compose <path>] [--kubernetes <path>] [--out <path>]\n\nValidates production-shaped backend deploy manifests without reading secrets or contacting providers.\nDefaults:\n  --compose deploy/docker-compose.production.example.yml\n  --kubernetes deploy/kubernetes/enigma-backend.example.yaml\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(help());
    return 0;
  }
  const result = await validateProductionManifestFiles(options);
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (options.out) {
    const out = resolve(options.out);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, json, 'utf8');
  }
  process.stdout.write(json);
  return result.ok ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
