#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFile as execFileCallback, spawn } from 'node:child_process';
import { access, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { REQUIRED_REF_KEYS as HOSTED_LIVE_REQUIRED_REF_KEYS } from './validate-hosted-backend-live.mjs';
import { REQUIRED_EVIDENCE_ITEMS, REQUIRED_OWNER_ROLES } from './validate-operator-acceptance.mjs';

const execFile = promisify(execFileCallback);
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMMAND_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 300_000;
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const REQUIRED_TOOL_NAMES = Object.freeze([
  'enigma_init',
  'enigma_remember',
  'enigma_search',
  'enigma_context_pack',
  'enigma_delete',
  'enigma_verify_receipts',
  'enigma_meter_usage',
  'enigma_settlement_job',
  'enigma_settlement_quote',
  'enigma_settlement_receipt',
  'enigma_settlement_verify',
  'enigma_settlement_batch',
]);
const CLOUD_OR_PUBLISH_SECRET = /(?:AWS|AZURE|GCP|GOOGLE|CLOUDFLARE|CF_|KUBE|DOCKER|NPM_TOKEN|NODE_AUTH_TOKEN|GITHUB_TOKEN|GH_TOKEN|VERCEL|NETLIFY|OPENAI|ANTHROPIC|GEMINI|SUPABASE|DATABASE_URL|REDIS_URL|SENTRY|DATADOG|STRIPE)/i;
const NATIVE_HOST_NAME = 'com.enigma.native_host';
const NATIVE_HOST_PROTOCOL = 'enigma.native.browser.v1';
const RELEASE_PROVENANCE_SCHEMA = 'enigma.release_provenance.v1';
const REVIEW_PACKET_SCHEMA = 'enigma.review_packet.v1';
const MEMORY_OPTIMIZATION_BENCHMARK_SCHEMA = 'enigma.memory_optimization_benchmark.v1';
const MEMORY_OPTIMIZATION_BENCHMARK_SCRIPT = join(PROJECT_ROOT, 'scripts', 'memory-optimization-benchmark.mjs');
const LOCAL_PACK_INSTALL_SCRIPT = join(PROJECT_ROOT, 'scripts', 'verify-local-pack-install.mjs');
const PRODUCTION_READINESS_MANIFEST_BUILDER_SCRIPT = join(PROJECT_ROOT, 'scripts', 'build-production-readiness-manifest.mjs');
const PRODUCTION_STORAGE_MIGRATION_SCRIPT = join(PROJECT_ROOT, 'scripts', 'build-production-storage-migration.mjs');
const OPERATOR_ACCEPTANCE_VALIDATOR_SCRIPT = join(PROJECT_ROOT, 'scripts', 'validate-operator-acceptance.mjs');
const BACKUP_RESTORE_DRILL_VALIDATOR_SCRIPT = join(PROJECT_ROOT, 'scripts', 'validate-backup-restore-drill.mjs');
const INCIDENT_DRILL_VALIDATOR_SCRIPT = join(PROJECT_ROOT, 'scripts', 'validate-incident-drill.mjs');
const SUPPORT_SLA_VALIDATOR_SCRIPT = join(PROJECT_ROOT, 'scripts', 'validate-support-sla.mjs');
const LEGAL_COMPLIANCE_APPROVAL_VALIDATOR_SCRIPT = join(PROJECT_ROOT, 'scripts', 'validate-legal-compliance-approval.mjs');
const MONITORING_ALERTING_VALIDATOR_SCRIPT = join(PROJECT_ROOT, 'scripts', 'validate-monitoring-alerting.mjs');
const NETWORK_ACCESS_POLICY_VALIDATOR_SCRIPT = join(PROJECT_ROOT, 'scripts', 'validate-network-access-policy.mjs');
const KMS_CUSTODY_VALIDATOR_SCRIPT = join(PROJECT_ROOT, 'scripts', 'validate-kms-custody.mjs');
const TENANT_POLICY_APPROVAL_VALIDATOR_SCRIPT = join(PROJECT_ROOT, 'scripts', 'validate-tenant-policy-approval.mjs');
const USAGE_METERING_VALIDATOR_SCRIPT = join(PROJECT_ROOT, 'scripts', 'validate-usage-metering.mjs');
const SERVICE_SETTLEMENT_VALIDATOR_SCRIPT = join(PROJECT_ROOT, 'scripts', 'validate-service-settlement.mjs');
const PUBLIC_SITE_SECURITY_VALIDATOR_SCRIPT = join(PROJECT_ROOT, 'scripts', 'validate-public-site-security.mjs');
const DOMAIN_TLS_VALIDATOR_SCRIPT = join(PROJECT_ROOT, 'scripts', 'validate-domain-tls.mjs');
const SECURITY_THREAT_MODEL_VALIDATOR_SCRIPT = join(PROJECT_ROOT, 'scripts', 'validate-security-threat-model.mjs');
const REVIEW_PACKET_MANIFEST = 'REVIEW_PACKET_MANIFEST.json';
const REVIEW_PACKET_EMBEDDED_ENV = 'ENIGMA_REVIEW_PACKET_EMBEDDED';
const RAW_MEMORY_SENTINEL = 'private launch-code phrase must not leave local memory';
const SHA256_PREFIXED_DIGEST = /^sha256:[0-9a-f]{64}$/;
const PRIVATE_PUBLIC_SITE_COLLATERAL_PATH = /(?:^|\/)(?:private|internal|launch-code|investor|token(?:omics)?|sales|marketing|funnel|community|social|adoption|objections|faq|whitepaper)[^/]*\.(?:md|html|json)$/i;
const LOCAL_BUNDLE_LOG_OR_SECRET_PATH = /(?:^|\/)(?:\.env(?:\.|$)|env\.local$|secrets?|credentials?|tokens?|api[-_]?keys?|private[-_]?keys?|\.enigma|enigma[-_]?bundle|vault[-_]?bundle|bundle\.json|logs?|npm-debug\.log|yarn-error\.log|pnpm-debug\.log)(?:\/|$|[._-])/i;
const PRIVATE_REVIEW_PACKET_COLLATERAL_PATH = /(?:^|\/)(?:\d+[_-])?(?:private|internal|launch-code|executive|investor|partner|sales|marketing|funnel|community|social|adoption|objections|faq|pitch|demo[-_]?scripts?|content[-_]?calendar|brand[-_]?messaging)[^/]*\.(?:html|json|md|txt)$/i;
const RAW_MEMORY_EXAMPLE_FIELD = /"(?:raw_memory|plaintext|prompt|response|memory)"\s*:\s*"[^"]+"/i;
const NATIVE_HOST_MANIFEST_SMOKES = Object.freeze([
  {
    browser: 'chrome',
    extensionId: 'abcdefghijklmnopabcdefghijklmnop',
    allowlistKey: 'allowed_origins',
    expectedAllowlist: ['chrome-extension://abcdefghijklmnopabcdefghijklmnop/'],
  },
  {
    browser: 'edge',
    extensionId: 'bcdefghijklmnopabcdefghijklmnopa',
    allowlistKey: 'allowed_origins',
    expectedAllowlist: ['chrome-extension://bcdefghijklmnopabcdefghijklmnopa/'],
  },
  {
    browser: 'firefox',
    extensionId: 'enigma-release-audit@example.invalid',
    allowlistKey: 'allowed_extensions',
    expectedAllowlist: ['enigma-release-audit@example.invalid'],
  },
]);
const NATIVE_HOST_INSTALL_PLAN_SMOKES = Object.freeze([
  {
    browser: 'chrome',
    os: 'windows',
    manifestRel: 'apps/native-host/manifests/com.enigma.native_host.chrome.json',
    expectsRegistryPreview: true,
  },
  {
    browser: 'edge',
    os: 'windows',
    manifestRel: 'apps/native-host/manifests/com.enigma.native_host.edge.json',
    expectsRegistryPreview: true,
  },
  {
    browser: 'firefox',
    os: 'windows',
    manifestRel: 'apps/native-host/manifests/com.enigma.native_host.firefox.json',
    expectsFirefoxDirectory: true,
  },
]);
const PUBLIC_SITE_PREFLIGHT_SCHEMA = 'enigma.public_site_preflight.v1';
const PUBLIC_SITE_PACKAGE_ROOT = resolve(PROJECT_ROOT, '..', 'github-upload', 'enigma-memory-site');
const PUBLIC_SITE_PREFLIGHT_SCRIPT = join(PUBLIC_SITE_PACKAGE_ROOT, 'scripts', 'preflight_public_site.py');
const PUBLIC_SITE_DEFAULT_DIR = join(PUBLIC_SITE_PACKAGE_ROOT, '_public_site');
const PUBLIC_SITE_PREFLIGHT_FALLBACK_ROOTS = Object.freeze([
  resolve(PROJECT_ROOT, '..', 'enigmamemory-localhost-mirror'),
]);
const CLOUDFLARE_OPS_SCRIPT = resolve(PROJECT_ROOT, 'scripts', 'cloudflare-ops.mjs');
const CLOUDFLARE_PAGES_RELEASE_PACKET_SCRIPT = resolve(PROJECT_ROOT, 'scripts', 'build-cloudflare-pages-release-packet.mjs');
const CLOUDFLARE_TOKEN_POLICY_SCRIPT = resolve(PROJECT_ROOT, 'scripts', 'build-cloudflare-token-policy.mjs');
const CLOUDFLARE_TOKEN_REQUEST_SCRIPT = resolve(PROJECT_ROOT, 'scripts', 'build-cloudflare-token-request.mjs');
const PRODUCTION_HANDOFF_PACKET_SCRIPT = resolve(PROJECT_ROOT, 'scripts', 'build-production-handoff-packet.mjs');
const GOAL_COMPLETION_AUDIT_SCRIPT = resolve(PROJECT_ROOT, 'scripts', 'build-goal-completion-audit.mjs');
const BACKEND_READINESS_SMOKE_SCRIPT = resolve(PROJECT_ROOT, 'scripts', 'run-backend-readiness-smoke.mjs');
const PRODUCTION_BACKEND_ENV_KIT_SCRIPT = resolve(PROJECT_ROOT, 'scripts', 'build-production-backend-env-kit.mjs');
const HOSTED_BACKEND_LIVE_VALIDATOR_SCRIPT = resolve(PROJECT_ROOT, 'scripts', 'validate-hosted-backend-live.mjs');
const HOSTED_BACKEND_COLLECTOR_SCRIPT = resolve(PROJECT_ROOT, 'scripts', 'collect-hosted-backend-live-evidence.mjs');
const HOSTED_PROBE_WORKER_SCRIPT = resolve(PROJECT_ROOT, 'scripts', 'build-hosted-probe-worker.mjs');
const EDGE_BACKEND_WORKER_SCRIPT = resolve(PROJECT_ROOT, 'scripts', 'build-edge-backend-workers.mjs');
const OPERATOR_EVIDENCE_STARTER_SCRIPT = resolve(PROJECT_ROOT, 'scripts', 'build-operator-evidence-starter.mjs');
const WHITEPAPER_CLAIMS_VALIDATOR_SCRIPT = resolve(PROJECT_ROOT, 'scripts', 'validate-whitepaper-claims.mjs');
const PRODUCTION_DEPENDENCY_REPORT_SCRIPT = resolve(PROJECT_ROOT, 'scripts', 'build-production-dependency-report.mjs');
const PRODUCTION_WORKPLAN_SCRIPT = resolve(PROJECT_ROOT, 'scripts', 'build-production-workplan.mjs');
const PRODUCTION_STATUS_BOARD_SCRIPT = resolve(PROJECT_ROOT, 'scripts', 'build-production-status-board.mjs');
const AI_ORCHESTRATION_PLAN_SCHEMA = 'enigma.ai_orchestration_plan.v1';
const AI_ORCHESTRATION_PLAN_SCRIPT = resolve(PROJECT_ROOT, 'scripts', 'build-ai-orchestration-plan.mjs');
const CLOUDFLARE_WORKER_INSPECT_VALIDATOR_SCRIPT = resolve(PROJECT_ROOT, 'scripts', 'validate-cloudflare-worker-inspect.mjs');
const CLOUDFLARE_CREDENTIALS_VALIDATOR_SCRIPT = resolve(PROJECT_ROOT, 'scripts', 'validate-cloudflare-credentials.mjs');
const CLOUDFLARE_WORKER_INSPECT_CURRENT = resolve(PROJECT_ROOT, '.enigma', 'worker-inspect-current.json');
const PRODUCTION_MANIFEST_VALIDATOR_SCRIPT = resolve(PROJECT_ROOT, 'scripts', 'validate-production-manifests.mjs');
const INFRASTRUCTURE_READINESS_SCHEMA = 'enigma.infrastructure_readiness.v1';
const INFRASTRUCTURE_READINESS_SCRIPT = resolve(PROJECT_ROOT, 'scripts', 'infrastructure-readiness.mjs');
const PRODUCTION_COMPOSE_MANIFEST = resolve(PROJECT_ROOT, 'deploy', 'docker-compose.production.example.yml');
const KUBERNETES_BACKEND_MANIFEST = resolve(PROJECT_ROOT, 'deploy', 'kubernetes', 'enigma-backend.example.yaml');
const ENIGMA_INFRASTRUCTURE_READINESS_MANIFEST = 'ENIGMA_INFRASTRUCTURE_READINESS_MANIFEST';
const ENIGMA_INFRASTRUCTURE_READINESS_LIVE = 'ENIGMA_INFRASTRUCTURE_READINESS_LIVE';
const SECRET_LOOKING_OUTPUT = /(?:Authorization:\s*Bearer\s+[A-Za-z0-9._~+/=-]{8,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|["']?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password|private[_-]?key)["']?\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{16,})/i;
const TEST_FAILURE_SUMMARY_LIMIT = 8;
const TEST_OUTPUT_TAIL_LINE_LIMIT = 18;
const TEST_OUTPUT_TAIL_CHAR_LIMIT = 280;
const REDACTED_DIAGNOSTIC_LINE = '<redacted secret-looking output>';

function npmInvocation(args) {
  const label = commandLabel('npm', args);
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath && npmExecPath.endsWith('.js')) {
    return { command: process.execPath, args: [npmExecPath, ...args], label };
  }
  if (process.platform === 'win32') {
    return { command: process.env.ComSpec ?? 'cmd.exe', args: ['/d', '/s', '/c', label], label };
  }
  return { command: 'npm', args, label };
}

async function nodeTestInvocation() {
  const entries = await readdir(join(PROJECT_ROOT, 'test'), { withFileTypes: true });
  const testFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.mjs'))
    .map((entry) => `test/${entry.name}`)
    .sort();
  if (testFiles.length === 0) throw new Error('No test/*.test.mjs files found.');
  const args = ['--test'];
  if (process.platform === 'win32') args.push('--test-concurrency=1');
  args.push(...testFiles);
  return { command: process.execPath, args, label: 'npm test' };
}

function localOnlyEnv(extra = {}) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (CLOUD_OR_PUBLISH_SECRET.test(key)) continue;
    env[key] = value;
  }
  return {
    ...env,
    ...extra,
    CI: env.CI ?? '1',
    NO_COLOR: '1',
    ENIGMA_RELEASE_AUDIT: 'local',
  };
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceInsensitive(text, needle, replacement) {
  if (typeof needle !== 'string' || needle.length === 0) return text;
  return text.replace(new RegExp(escapeRegex(needle), process.platform === 'win32' ? 'gi' : 'g'), replacement);
}

function scrubLocalPathText(value) {
  let text = String(value);
  text = replaceInsensitive(text, process.execPath, 'node');
  text = replaceInsensitive(text, PUBLIC_SITE_PACKAGE_ROOT, '<public-site-package>');
  text = replaceInsensitive(text, PROJECT_ROOT, '<project-root>');
  text = replaceInsensitive(text, tmpdir(), '<temp>');
  if (process.env.USERPROFILE) text = replaceInsensitive(text, process.env.USERPROFILE, '<user-home>');
  if (process.env.HOME) text = replaceInsensitive(text, process.env.HOME, '<home>');
  return text.split(sep).join('/');
}

function shellQuote(value) {
  const text = scrubLocalPathText(value);
  if (/^[A-Za-z0-9_./:=@%+,-]+$/u.test(text)) return text;
  return `"${text.replace(/(["\\])/g, '\\$1')}"`;
}

function commandLabel(command, args) {
  return [shellQuote(command), ...args.map((arg) => shellQuote(arg))].join(' ');
}

function parseJson(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) throw new Error('Expected JSON output, received empty stdout.');
  return JSON.parse(trimmed);
}

function parseJsonPayload(stdout) {
  try {
    return parseJson(stdout);
  } catch {
    const text = String(stdout);
    const lines = text.split(/\r?\n/);
    const startLine = lines.findIndex((line) => line.trim().startsWith('{'));
    if (startLine === -1) throw new Error('Expected JSON payload in command stdout.');
    return JSON.parse(lines.slice(startLine).join('\n').trim());
  }
}

function lines(value) {
  return String(value).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function tapCounts(output) {
  const counts = {};
  for (const line of lines(output)) {
    const match = line.match(/^#\s+(tests|pass|fail|cancelled|skipped|todo|duration_ms)\s+(.+)$/);
    if (match) counts[match[1]] = match[2];
  }
  return counts;
}

function sanitizeDiagnosticLine(value) {
  const scrubbed = scrubLocalPathText(value)
    .replace(/file:\/\/(?=<(?:project-root|public-site-package|temp|user-home|home)>)/g, '')
    .replace(/[A-Za-z]:\/[^\s'"`),]+/g, '<path>')
    .replace(/(?:file:\/\/)?\/(?:Users|home|tmp|private\/var|var\/folders)\/[^\s'"`),]+/g, '<path>')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '<email>')
    .replace(/\s+/g, ' ')
    .trim();
  if (!scrubbed) return '';
  if (
    SECRET_LOOKING_OUTPUT.test(scrubbed)
    || RAW_MEMORY_EXAMPLE_FIELD.test(scrubbed)
    || scrubbed.includes(RAW_MEMORY_SENTINEL)
  ) return REDACTED_DIAGNOSTIC_LINE;
  return scrubbed.length > TEST_OUTPUT_TAIL_CHAR_LIMIT
    ? `${scrubbed.slice(0, TEST_OUTPUT_TAIL_CHAR_LIMIT - 1)}…`
    : scrubbed;
}

function diagnosticLines(value) {
  return String(value).split(/\r?\n/).map(sanitizeDiagnosticLine).filter(Boolean);
}

function diagnosticMessage(value) {
  return diagnosticLines(value)[0] ?? 'Command failed.';
}

function failingTestNames(output) {
  const names = [];
  for (const line of diagnosticLines(output)) {
    const tapMatch = line.match(/^not ok \d+ - (.+)$/);
    const prettyMatch = line.match(/^✖\s+(.+?)(?:\s+\(\d+(?:\.\d+)?ms\))?$/u);
    const name = tapMatch?.[1] ?? prettyMatch?.[1] ?? null;
    if (!name || names.includes(name)) continue;
    names.push(name);
    if (names.length >= TEST_FAILURE_SUMMARY_LIMIT) break;
  }
  return names;
}

function diagnosticTail(stdout, stderr) {
  const stdoutLines = diagnosticLines(stdout);
  if (stdoutLines.length > 0) {
    return { key: 'stdout_tail', lines: stdoutLines.slice(-TEST_OUTPUT_TAIL_LINE_LIMIT) };
  }
  const stderrLines = diagnosticLines(stderr);
  if (stderrLines.length > 0) {
    return { key: 'stderr_tail', lines: stderrLines.slice(-TEST_OUTPUT_TAIL_LINE_LIMIT) };
  }
  return null;
}

export function summarizeNpmTestFailure(stdout, stderr) {
  const combined = `${stdout}\n${stderr}`;
  const summary = { tap: tapCounts(combined) };
  const failed = failingTestNames(combined);
  const tail = diagnosticTail(stdout, stderr);
  if (failed.length > 0) summary.failing_tests = failed;
  if (tail) summary[tail.key] = tail.lines;
  return summary;
}

function summarizeCheck(stdout) {
  const line = lines(stdout).find((item) => item.includes('enigma check ok')) ?? lines(stdout).at(-1) ?? '';
  return { message: line };
}

function summarizeTests(stdout, stderr) {
  return { tap: tapCounts(`${stdout}\n${stderr}`) };
}

function summarizePack(stdout) {
  const tarball = lines(stdout).find((line) => line.endsWith('.tgz')) ?? null;
  if (!tarball) throw new Error('npm pack --dry-run did not report a .tgz tarball name.');
  return { tarball };
}

function summarizeLocalPackInstall(stdout) {
  const json = parseJson(stdout);
  requireJsonField(json, ['schema'], (value) => value === 'enigma.local_pack_install_smoke.v1', 'Local pack install smoke schema mismatch.');
  requireJsonField(json, ['ok'], (value) => value === true, 'Local pack install smoke did not report ok: true.');
  requireJsonField(json, ['install', 'global_install'], (value) => value === false, 'Local pack install smoke must not use global install.');
  requireJsonField(json, ['install', 'registry_install'], (value) => value === false, 'Local pack install smoke must not use registry install.');
  requireJsonField(json, ['install', 'npm_publish'], (value) => value === false, 'Local pack install smoke must not publish.');
  const checks = requireJsonField(json, ['checks'], Array.isArray, 'Local pack install smoke omitted checks.');
  if (checks.length < 3) throw new Error('Local pack install smoke did not run enough entrypoint checks.');
  return {
    schema: json.schema,
    tarball: json.package?.tarball ?? null,
    temp_prefix_install: json.install?.command === 'npm install --prefix <temp-prefix> --ignore-scripts <local-tarball>',
    check_count: checks.length,
    checked_entrypoints: checks.map((check) => check.entrypoint),
  };
}

function requireJsonField(value, path, predicate, message) {
  let current = value;
  for (const segment of path) current = current?.[segment];
  if (!predicate(current)) throw new Error(message);
  return current;
}

function arraysEqual(left, right) {
  return Array.isArray(left) && left.length === right.length && left.every((value, index) => value === right[index]);
}
function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function isSha256PrefixedDigest(value) {
  return typeof value === 'string' && SHA256_PREFIXED_DIGEST.test(value);
}

function isSafeReleaseProvenancePath(value) {
  return typeof value === 'string'
    && value.length > 0
    && !PRIVATE_PUBLIC_SITE_COLLATERAL_PATH.test(value)
    && !LOCAL_BUNDLE_LOG_OR_SECRET_PATH.test(value);
}

function isSafeReviewPacketPath(value) {
  return typeof value === 'string'
    && value.length > 0
    && !PRIVATE_REVIEW_PACKET_COLLATERAL_PATH.test(value)
    && !LOCAL_BUNDLE_LOG_OR_SECRET_PATH.test(value);
}

function reviewPacketChildEnv(extra = {}) {
  return {
    ...extra,
    [REVIEW_PACKET_EMBEDDED_ENV]: '1',
  };
}

function validateReviewPacketText(rel, text) {
  if (text.includes(RAW_MEMORY_SENTINEL)) throw new Error(`Review packet file ${rel} included the private raw-memory sentinel.`);
  if (RAW_MEMORY_EXAMPLE_FIELD.test(text)) throw new Error(`Review packet file ${rel} included a raw-memory-like JSON example.`);
}

export async function validateReviewPacketManifest(manifest, packetRoot = null) {
  requireJsonField(manifest, ['schema'], (value) => value === REVIEW_PACKET_SCHEMA, 'Review packet schema mismatch.');
  requireJsonField(manifest, ['claim_boundary'], (value) => typeof value === 'string' && /not npm publication/i.test(value), 'Review packet did not preserve local-evidence claim boundary.');
  const files = requireJsonField(manifest, ['files'], Array.isArray, 'Review packet manifest did not include files.');
  if (files.length === 0) throw new Error('Review packet manifest did not include any file evidence.');
  const paths = new Set();
  for (const file of files) {
    const rel = requireJsonField(file, ['path'], isSafeReviewPacketPath, 'Review packet file entry omitted path or included a private/local-only path.');
    requireJsonField(file, ['sha256'], isSha256PrefixedDigest, `Review packet file ${rel} did not include a sha256-prefixed digest.`);
    paths.add(rel);
    if (packetRoot && /\.(?:css|csv|html|js|json|md|mjs|svg|txt|xml|ya?ml)$/i.test(rel)) {
      validateReviewPacketText(rel, await readFile(join(packetRoot, rel), 'utf8'));
    }
  }
  for (const rel of ['evidence/local-provenance.json', 'evidence/release-audit.json', 'package/npm-pack-dry-run.json']) {
    if (!paths.has(rel)) throw new Error(`Review packet manifest omitted required evidence file ${rel}.`);
  }
  if (packetRoot) {
    const manifestText = await readFile(join(packetRoot, REVIEW_PACKET_MANIFEST), 'utf8');
    validateReviewPacketText(REVIEW_PACKET_MANIFEST, manifestText);
  }
  const manifestText = JSON.stringify(manifest);
  if (PRIVATE_REVIEW_PACKET_COLLATERAL_PATH.test(manifestText)) throw new Error('Review packet manifest included a private/internal collateral path.');
  if (manifestText.includes(RAW_MEMORY_SENTINEL) || RAW_MEMORY_EXAMPLE_FIELD.test(manifestText)) throw new Error('Review packet manifest included raw memory evidence.');
  return {
    schema: manifest.schema,
    file_count: files.length,
    evidence_files: ['evidence/local-provenance.json', 'evidence/release-audit.json', 'package/npm-pack-dry-run.json'],
    site_files: files.filter((file) => String(file.path).startsWith('site/')).length,
  };
}

function computeReleaseProvenanceRootHash(files) {
  const hash = createHash('sha256');
  for (const file of files) hash.update(`${file.sha256}  ${file.path}\n`, 'utf8');
  return `sha256:${hash.digest('hex')}`;
}


export function validateLocalProvenanceDocument(provenance, summary = null) {
  requireJsonField(provenance, ['schema'], (value) => value === RELEASE_PROVENANCE_SCHEMA, 'Local provenance schema mismatch.');
  const files = requireJsonField(provenance, ['files'], Array.isArray, 'Local provenance did not include files.');
  const fileCount = requireJsonField(provenance, ['counts', 'files'], isPositiveInteger, 'Local provenance did not include a positive file count.');
  if (files.length !== fileCount) throw new Error('Local provenance file count did not match files array length.');
  const rootHash = requireJsonField(provenance, ['root_hash'], isSha256PrefixedDigest, 'Local provenance root hash was not a sha256-prefixed digest.');
  for (const file of files) {
    requireJsonField(file, ['path'], isSafeReleaseProvenancePath, 'Local provenance file entry omitted path or included a private/local-only path.');
    requireJsonField(file, ['sha256'], isSha256PrefixedDigest, `Local provenance file ${file?.path ?? '<unknown>'} did not include a sha256-prefixed digest.`);
  }
  if (computeReleaseProvenanceRootHash(files) !== rootHash) throw new Error('Local provenance root hash did not match file hash records.');
  if (summary) {
    requireJsonField(summary, ['ok'], (value) => value === true, 'Local provenance summary did not report ok: true.');
    requireJsonField(summary, ['path'], (value) => typeof value === 'string' && value.length > 0, 'Local provenance summary did not include an output path.');
    requireJsonField(summary, ['file_count'], (value) => value === fileCount, 'Local provenance summary file count did not match the evidence file.');
    requireJsonField(summary, ['root_hash'], (value) => value === rootHash, 'Local provenance summary root hash did not match the evidence file.');
  }
  return {
    schema: provenance.schema,
    file_count: fileCount,
    root_hash: rootHash,
    summary_path: typeof summary?.path === 'string' ? scrubLocalPathText(summary.path) : null,
  };
}

export function summarizeLocalProvenance(stdout, provenanceText) {
  return validateLocalProvenanceDocument(parseJson(provenanceText), parseJsonPayload(stdout));
}


function validateNativeHostManifest(json, { browser, allowlistKey, expectedAllowlist, hostPath }) {
  requireJsonField(json, ['name'], (value) => value === NATIVE_HOST_NAME, `${browser} manifest did not include expected native host name.`);
  requireJsonField(json, ['type'], (value) => value === 'stdio', `${browser} manifest did not declare stdio transport.`);
  requireJsonField(json, ['path'], (value) => value === hostPath, `${browser} manifest did not preserve absolute host path.`);
  requireJsonField(json, [allowlistKey], (value) => arraysEqual(value, expectedAllowlist), `${browser} manifest did not include expected browser allowlist.`);
  const otherAllowlistKey = allowlistKey === 'allowed_origins' ? 'allowed_extensions' : 'allowed_origins';
  if (Object.hasOwn(json, otherAllowlistKey)) throw new Error(`${browser} manifest included conflicting allowlist field.`);
  return {
    browser,
    host_name: json.name,
    type: json.type,
    allowlist_key: allowlistKey,
    allowlist_count: json[allowlistKey].length,
  };
}

function validateNativeHostManifestFailure(json, { browser }) {
  requireJsonField(json, ['ok'], (value) => value === false, `${browser} relative-path manifest generation did not fail closed.`);
  requireJsonField(json, ['error', 'message'], (value) => typeof value === 'string' && /absolute/i.test(value), `${browser} relative-path manifest failure did not explain absolute path requirement.`);
  return {
    browser,
    rejected_relative_host_path: true,
    code: json.error?.code ?? null,
  };
}

function validateNativeHostInstallPlan(json, { browser, os, manifestPath, expectsRegistryPreview = false, expectsFirefoxDirectory = false }) {
  requireJsonField(json, ['host_name'], (value) => value === NATIVE_HOST_NAME, `${browser} install plan did not include expected native host name.`);
  requireJsonField(json, ['browser'], (value) => value === browser, `${browser} install plan did not preserve browser.`);
  requireJsonField(json, ['os'], (value) => value === os, `${browser} install plan did not preserve target OS.`);
  requireJsonField(json, ['manifest_source'], (value) => value === manifestPath, `${browser} install plan did not preserve absolute manifest source.`);
  requireJsonField(json, ['writes_performed'], (value) => value === false, `${browser} install plan must not perform host registration writes.`);
  const targetManifestPaths = requireJsonField(json, ['target_manifest_paths'], Array.isArray, `${browser} install plan did not include target manifest paths.`);
  if (targetManifestPaths.length === 0 || targetManifestPaths.some((value) => typeof value !== 'string' || value.length === 0)) {
    throw new Error(`${browser} install plan did not include concrete target manifest paths.`);
  }
  const manualSteps = requireJsonField(json, ['manual_steps'], Array.isArray, `${browser} install plan did not include manual steps.`);
  if (manualSteps.length === 0 || manualSteps.some((value) => typeof value !== 'string' || value.length === 0)) {
    throw new Error(`${browser} install plan did not include concrete manual steps.`);
  }
  if (expectsRegistryPreview) {
    const registryPreview = requireJsonField(json, ['registry_command_preview'], Array.isArray, `${browser} install plan did not include registry command previews.`);
    if (registryPreview.length === 0 || registryPreview.some((value) => typeof value !== 'string' || value.length === 0)) {
      throw new Error(`${browser} install plan did not include concrete registry command previews.`);
    }
  }
  if (expectsFirefoxDirectory) {
    requireJsonField(json, ['firefox_manifest_directory'], (value) => typeof value === 'string' && value.length > 0, 'Firefox install plan did not include a manifest directory.');
  }
  return {
    browser,
    os,
    host_name: json.host_name,
    target_manifest_path_count: targetManifestPaths.length,
    manual_step_count: manualSteps.length,
    registry_preview_count: Array.isArray(json.registry_command_preview) ? json.registry_command_preview.length : 0,
    writes_performed: json.writes_performed,
  };
}

function validateNativeHostInstallPlanFailure(json, { browser }) {
  requireJsonField(json, ['ok'], (value) => value === false, `${browser} relative-manifest install plan did not fail closed.`);
  requireJsonField(json, ['error', 'message'], (value) => typeof value === 'string' && /absolute/i.test(value), `${browser} relative-manifest install plan failure did not explain absolute path requirement.`);
  return {
    browser,
    rejected_relative_manifest_path: true,
    code: json.error?.code ?? null,
  };
}

function validatePublicSitePreflight(json, siteDir) {
  requireJsonField(json, ['schema'], (value) => value === PUBLIC_SITE_PREFLIGHT_SCHEMA, 'Public site preflight schema mismatch.');
  requireJsonField(json, ['ok'], (value) => value === true, 'Public site preflight did not report ok: true.');
  requireJsonField(json, ['site'], (value) => typeof value === 'string' && value.length > 0, 'Public site preflight omitted site path.');
  requireJsonField(json, ['checked_counts'], (value) => value && typeof value === 'object' && !Array.isArray(value), 'Public site preflight omitted checked_counts.');
  requireJsonField(json, ['warnings'], Array.isArray, 'Public site preflight warnings must be an array.');
  const blockers = requireJsonField(json, ['blockers'], Array.isArray, 'Public site preflight blockers must be an array.');
  if (blockers.length !== 0) throw new Error(`Public site preflight reported blockers for ${siteDir}.`);
  return {
    schema: json.schema,
    site: scrubLocalPathText(json.site),
    checked_counts: json.checked_counts,
    warning_count: json.warnings.length,
    blocker_count: blockers.length,
  };
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function runCommandGate(name, command, args, options = {}) {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? COMMAND_TIMEOUT_MS;
  const gate = {
    name,
    required: true,
    command: options.label ?? commandLabel(command, args),
    ok: false,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };

  try {
    const { stdout, stderr } = await execFile(command, args, {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(options.env),
      timeout: timeoutMs,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    gate.status = 0;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    gate.evidence = options.summarize ? await options.summarize(stdout, stderr) : {};
    gate.ok = true;
  } catch (error) {
    if (gate.status !== 0) gate.status = Number.isInteger(error.code) ? error.code : null;
    gate.signal = error.signal ?? null;
    gate.stderr_bytes = Buffer.byteLength(error.stderr ?? '');
    gate.stdout_bytes = Buffer.byteLength(error.stdout ?? '');
    if (options.summarizeFailure) {
      gate.evidence = await options.summarizeFailure(error.stdout ?? '', error.stderr ?? '');
    }
    gate.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'COMMAND_FAILED'),
      message: options.summarizeFailure ? diagnosticMessage(error.message) : error.message,
    };
    if (gate.status === 0) {
      gate.error.code = 'OUTPUT_VALIDATION_FAILED';
    }
  } finally {
    gate.duration_ms = Date.now() - started;
  }

  return gate;
}

async function runJsonCommandStatus(command, args, expectedStatus, validate) {
  const allowedStatuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  const started = Date.now();
  const result = {
    command: commandLabel(command, args),
    ok: false,
    status: null,
    duration_ms: 0,
  };
  let stdout = '';
  let stderr = '';
  try {
    const output = await execFile(command, args, {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    stdout = output.stdout;
    stderr = output.stderr;
    result.status = 0;
    result.signal = null;
  } catch (error) {
    stdout = String(error.stdout ?? '');
    stderr = String(error.stderr ?? '');
    result.status = Number.isInteger(error.code) ? error.code : null;
    result.signal = error.signal ?? null;
    if (error.killed) {
      result.error = { code: 'COMMAND_TIMEOUT', message: error.message };
    }
  }

  result.stderr_bytes = Buffer.byteLength(stderr);
  result.stdout_bytes = Buffer.byteLength(stdout);
  try {
    if (!allowedStatuses.includes(result.status)) {
      throw new Error(`Expected status ${allowedStatuses.join(' or ')}, got ${result.status}`);
    }
    const parsed = parseJson(stdout);
    result.evidence = validate(parsed);
    result.ok = true;
    delete result.error;
  } catch (error) {
    result.error ??= {
      code: allowedStatuses.includes(result.status) ? 'OUTPUT_VALIDATION_FAILED' : 'COMMAND_FAILED',
      message: error.message,
    };
  } finally {
    result.duration_ms = Date.now() - started;
  }
  return result;
}

async function runJsonCommand(command, args, validate) {
  return runJsonCommandStatus(command, args, 0, validate);
}

export async function runDirectBinSmokes() {
  const started = Date.now();
  const node = process.execPath;
  const checks = [];

  checks.push(await runJsonCommand(node, ['apps/cli/bin/enigma.mjs', '--help'], (json) => {
    requireJsonField(json, ['commands'], Array.isArray, 'CLI help did not include command list.');
    return { usage: json.usage, command_count: json.commands.length, has_claim_boundaries: typeof json.claim_boundaries === 'string' };
  }));

  checks.push(await runJsonCommandStatus(node, ['apps/cli/bin/enigma.mjs', 'doctor'], [0, 1], (json) => {
    requireJsonField(json, ['package_bins', 'ok'], (value) => value === true, 'Doctor did not report package_bins ok.');
    requireJsonField(json, ['node', 'ok'], (value) => value === true, 'Doctor did not report node ok.');
    requireJsonField(json, ['schema_count'], (value) => typeof value === 'number' && value > 0, 'Doctor did not report schemas.');
    return { package_bins_ok: json.package_bins?.ok === true, schema_count: json.schema_count, doctor_ok: json.ok === true };
  }));

  checks.push(await runJsonCommand(node, [
    'apps/cli/bin/enigma.mjs',
    'meter',
    'event',
    '--tenant',
    'release-audit',
    '--provider',
    'openai',
    '--model',
    'gpt-5.5',
    '--prompt-tokens',
    '1200',
    '--completion-tokens',
    '300',
    '--memory-baseline-tokens',
    '1200',
    '--memory-optimized-tokens',
    '420',
    '--price-per-million-tokens',
    '2',
  ], (json) => {
    requireJsonField(json, ['schema'], (value) => value === 'enigma.usage_event.v1', 'Meter event did not emit usage event schema.');
    requireJsonField(json, ['settlement_boundary', 'provider_invoice_savings_claim'], (value) => value === false, 'Meter event must not claim provider invoice savings.');
    return {
      schema: json.schema,
      memory_savings_tokens: json.usage?.memory_savings_tokens ?? null,
      token_roi_claim: json.settlement_boundary?.token_roi_claim ?? null,
    };
  }));

  checks.push(await runJsonCommand(node, [
    'apps/cli/bin/enigma.mjs',
    'settlement',
    'job',
    '--tenant',
    'release-audit',
    '--job-type',
    'context.pack',
    '--memory-root',
    'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    '--policy-hash',
    'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    '--usage-event-hash',
    'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    '--max-price-amount',
    '5',
    '--payment-asset',
    'USDC',
    '--requested-at',
    '2026-06-23T12:00:00.000Z',
    '--expires-at',
    '2026-06-23T12:10:00.000Z',
  ], (json) => {
    requireJsonField(json, ['schema'], (value) => value === 'enigma.permissionless_memory_job.v1', 'Settlement job did not emit job schema.');
    requireJsonField(json, ['access_boundary', 'token_roi_claim'], (value) => value === false, 'Settlement job must not claim token ROI.');
    return {
      schema: json.schema,
      job_type: json.job_type,
      raw_memory_on_chain: json.access_boundary?.raw_memory_on_chain ?? null,
    };
  }));

  checks.push(await runJsonCommand(node, ['apps/verifier/bin/enigma-verify.mjs', '--help'], (json) => {
    requireJsonField(json, ['usage'], (value) => typeof value === 'string' && value.includes('enigma-verify'), 'Verifier help did not include usage.');
    return { usage: json.usage };
  }));

  checks.push(await runJsonCommand(node, ['apps/native-host/bin/enigma-native-host.mjs', '--help'], (json) => {
    requireJsonField(json, ['native_host'], (value) => value === NATIVE_HOST_NAME, 'Native host help did not include expected host name.');
    requireJsonField(json, ['protocol'], (value) => value === NATIVE_HOST_PROTOCOL, 'Native host help did not include expected protocol.');
    return { usage: json.usage, native_host: json.native_host, protocol: json.protocol };
  }));

  const nativeHostPath = join(PROJECT_ROOT, 'apps/native-host/bin/enigma-native-host.mjs');
  for (const smoke of NATIVE_HOST_MANIFEST_SMOKES) {
    checks.push(await runJsonCommand(node, [
      'apps/cli/bin/enigma.mjs',
      'native-host',
      'manifest',
      '--browser',
      smoke.browser,
      '--host-path',
      nativeHostPath,
      '--extension-id',
      smoke.extensionId,
    ], (json) => validateNativeHostManifest(json, { ...smoke, hostPath: nativeHostPath })));
    checks.push(await runJsonCommandStatus(node, [
      'apps/cli/bin/enigma.mjs',
      'native-host',
      'manifest',
      '--browser',
      smoke.browser,
      '--host-path',
      'relative/enigma-native-host',
      '--extension-id',
      smoke.extensionId,
    ], 2, (json) => validateNativeHostManifestFailure(json, smoke)));
  }

  checks.push(await runJsonCommand(node, ['apps/relay/bin/enigma-relay.mjs', '--help'], (json) => {
    requireJsonField(json, ['commands'], Array.isArray, 'Relay help did not include commands.');
    return { usage: json.usage, commands: json.commands };
  }));

  checks.push(await runJsonCommand(node, ['apps/relay/bin/enigma-relay.mjs', 'demo'], (json) => {
    requireJsonField(json, ['ok'], (value) => value === true, 'Relay demo did not report ok: true.');
    return { schema: json.schema ?? null, ok: true };
  }));

  checks.push(await runJsonCommand(node, ['apps/gateway/bin/enigma-gateway.mjs', '--help'], (json) => {
    requireJsonField(json, ['commands'], Array.isArray, 'Gateway help did not include commands.');
    return { usage: json.usage, commands: json.commands };
  }));

  checks.push(await runJsonCommand(node, ['apps/gateway/bin/enigma-gateway.mjs', 'demo'], (json) => {
    requireJsonField(json, ['ok'], (value) => value === true, 'Gateway demo did not report ok: true.');
    return { schema: json.schema ?? null, ok: true };
  }));

  return {
    name: 'direct-bin-help-demo-smoke',
    required: true,
    ok: checks.every((check) => check.ok),
    duration_ms: Date.now() - started,
    evidence: { checks },
  };
}

export async function runNativeHostInstallPlanGate() {
  const started = Date.now();
  const tempDir = await mkdtemp(join(tmpdir(), 'enigma-native-host-install-plan-'));
  const gate = {
    name: 'native-host-install-plan',
    required: false,
    command: commandLabel(process.execPath, ['apps/cli/bin/enigma.mjs', 'native-host', 'install-plan', '--browser', '<chrome|edge|firefox>', '--manifest', '<absolute path>', '--os', 'windows', '--home', tempDir]),
    ok: false,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: { checks: [] },
  };

  try {
    const checks = [];
    for (const smoke of NATIVE_HOST_INSTALL_PLAN_SMOKES) {
      const manifestPath = resolve(PROJECT_ROOT, smoke.manifestRel);
      checks.push(await runJsonCommand(process.execPath, [
        'apps/cli/bin/enigma.mjs',
        'native-host',
        'install-plan',
        '--browser',
        smoke.browser,
        '--manifest',
        manifestPath,
        '--os',
        smoke.os,
        '--home',
        tempDir,
      ], (json) => validateNativeHostInstallPlan(json, { ...smoke, manifestPath })));
    }
    checks.push(await runJsonCommandStatus(process.execPath, [
      'apps/cli/bin/enigma.mjs',
      'native-host',
      'install-plan',
      '--browser',
      'chrome',
      '--manifest',
      'relative/native-host.json',
      '--os',
      'windows',
      '--home',
      tempDir,
    ], 2, (json) => validateNativeHostInstallPlanFailure(json, { browser: 'chrome' })));
    gate.status = checks.every((check) => check.status === 0 || check.status === 2) ? 0 : 1;
    gate.evidence = { checks };
    gate.ok = checks.every((check) => check.ok);
    if (!gate.ok) {
      gate.status = 1;
      throw new Error('Native host install-plan command-shape smoke failed.');
    }
  } catch (error) {
    gate.status = gate.status ?? 1;
    gate.error = {
      code: 'NATIVE_HOST_INSTALL_PLAN_FAILED',
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    gate.duration_ms = Date.now() - started;
    await rm(tempDir, { recursive: true, force: true });
  }

  return gate;
}

function parseJsonLines(output) {
  return lines(output).map((line) => JSON.parse(line));
}

function responseById(responses, id) {
  return responses.find((response) => response?.id === id);
}

function validateMcpResponses(responses) {
  const initialize = responseById(responses, 'initialize');
  const tools = responseById(responses, 'tools');
  const resources = responseById(responses, 'resources');
  const prompts = responseById(responses, 'prompts');

  requireJsonField(initialize, ['result', 'serverInfo', 'name'], (value) => value === 'enigma-mcp-server', 'MCP initialize did not return Enigma serverInfo.');
  const toolNames = requireJsonField(tools, ['result', 'tools'], Array.isArray, 'MCP tools/list did not return tools.').map((tool) => tool.name);
  for (const name of REQUIRED_TOOL_NAMES) {
    if (!toolNames.includes(name)) throw new Error(`MCP tools/list missing ${name}.`);
  }
  const resourceUris = requireJsonField(resources, ['result', 'resources'], Array.isArray, 'MCP resources/list did not return resources.').map((resource) => resource.uri);
  if (!resourceUris.includes('enigma://passport/summary')) throw new Error('MCP resources/list missing passport summary resource.');
  const promptNames = requireJsonField(prompts, ['result', 'prompts'], Array.isArray, 'MCP prompts/list did not return prompts.').map((prompt) => prompt.name);
  if (!promptNames.includes('enigma_standard_memory_prompt')) throw new Error('MCP prompts/list missing standard memory prompt.');

  return {
    server: initialize.result.serverInfo.name,
    protocolVersion: initialize.result.protocolVersion,
    tool_count: toolNames.length,
    resource_count: resourceUris.length,
    prompt_count: promptNames.length,
  };
}

async function runMcpStdioSmoke() {
  const started = Date.now();
  const tempDir = await mkdtemp(join(tmpdir(), 'enigma-release-audit-'));
  const gate = {
    name: 'mcp-stdio-smoke',
    required: true,
    command: commandLabel(process.execPath, ['packages/mcp-server/bin/enigma-mcp.mjs']),
    ok: false,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };

  try {
    const child = spawn(process.execPath, ['packages/mcp-server/bin/enigma-mcp.mjs'], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv({ ENIGMA_BUNDLE: join(tempDir, 'bundle.json') }),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    const requests = [
      { jsonrpc: '2.0', id: 'initialize', method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'enigma-release-audit', version: '0' } } },
      { jsonrpc: '2.0', id: 'tools', method: 'tools/list', params: {} },
      { jsonrpc: '2.0', id: 'resources', method: 'resources/list', params: {} },
      { jsonrpc: '2.0', id: 'prompts', method: 'prompts/list', params: {} },
    ];
    for (const request of requests) child.stdin.write(`${JSON.stringify(request)}\n`);
    child.stdin.end();

    const close = new Promise((resolveClose) => {
      child.on('close', (status, signal) => resolveClose({ status, signal }));
    });
    let timeout;
    const timed = await Promise.race([
      close,
      new Promise((resolveTimeout) => {
        timeout = setTimeout(() => {
          child.kill('SIGTERM');
          resolveTimeout({ status: null, signal: 'TIMEOUT' });
        }, COMMAND_TIMEOUT_MS);
      }),
    ]);
    clearTimeout(timeout);

    gate.status = timed.status;
    gate.signal = timed.signal;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    if (timed.status !== 0) throw new Error(`MCP stdio exited with ${timed.status ?? timed.signal}.`);
    if (stderr.trim()) throw new Error('MCP stdio wrote to stderr.');
    gate.evidence = validateMcpResponses(parseJsonLines(stdout));
    gate.ok = true;
  } catch (error) {
    gate.error = { code: 'MCP_STDIO_SMOKE_FAILED', message: error.message };
  } finally {
    gate.duration_ms = Date.now() - started;
    await rm(tempDir, { recursive: true, force: true });
  }

  return gate;
}

export async function runLocalProvenanceGate() {
  const tempDir = await mkdtemp(join(tmpdir(), 'enigma-release-provenance-'));
  try {
    const outPath = join(tempDir, 'release-provenance.json');
    return await runCommandGate('local-provenance', process.execPath, ['scripts/release-provenance.mjs', '--out', outPath], {
      label: commandLabel(process.execPath, ['scripts/release-provenance.mjs', '--out', outPath]),
      summarize: async (stdout) => summarizeLocalProvenance(stdout, await readFile(outPath, 'utf8')),
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function runReviewPacketGate() {
  const started = Date.now();
  const tempDir = await mkdtemp(join(tmpdir(), 'enigma-review-packet-audit-'));
  const gate = {
    name: 'review-packet',
    required: true,
    command: commandLabel(process.execPath, ['scripts/build-review-packet.mjs', '--out', join(tempDir, 'packet')]),
    ok: false,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };

  try {
    const outDir = join(tempDir, 'packet');
    const { buildReviewPacket } = await import(pathToFileURL(resolve(PROJECT_ROOT, 'scripts/build-review-packet.mjs')).href);
    if (typeof buildReviewPacket !== 'function') throw new Error('build-review-packet.mjs did not export buildReviewPacket().');
    const manifest = await buildReviewPacket({
      out: outDir,
      now: '2026-06-23T00:00:00.000Z',
      env: reviewPacketChildEnv(),
    });
    gate.status = 0;
    gate.evidence = await validateReviewPacketManifest(manifest, outDir);
    if (Array.isArray(manifest.blockers) && manifest.blockers.length > 0) throw new Error(`Review packet reported blockers: ${manifest.blockers.length}.`);
    gate.ok = true;
  } catch (error) {
    gate.status = 1;
    gate.error = {
      code: 'REVIEW_PACKET_FAILED',
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    gate.duration_ms = Date.now() - started;
    await rm(tempDir, { recursive: true, force: true });
  }

  return gate;
}

export async function runPublicSitePreflightGate() {
  const started = Date.now();
  const gate = {
    name: 'public-site-preflight',
    required: false,
    command: commandLabel(process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3'), ['scripts/preflight_public_site.py', '--site', '_public_site']),
    ok: true,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };

  try {
    let packageRoot = PUBLIC_SITE_PACKAGE_ROOT;
    let preflightScript = PUBLIC_SITE_PREFLIGHT_SCRIPT;
    let siteDir = PUBLIC_SITE_DEFAULT_DIR;
    let scriptExists = await pathExists(PUBLIC_SITE_PREFLIGHT_SCRIPT);
    let siteExists = await pathExists(PUBLIC_SITE_DEFAULT_DIR);
    if (!scriptExists || !siteExists) {
      for (const candidateRoot of PUBLIC_SITE_PREFLIGHT_FALLBACK_ROOTS) {
        const candidateScript = join(candidateRoot, 'scripts', 'preflight_public_site.py');
        const candidateSite = join(candidateRoot, '_public_site');
        if ((await pathExists(candidateScript)) && (await pathExists(candidateSite))) {
          packageRoot = candidateRoot;
          preflightScript = candidateScript;
          siteDir = candidateSite;
          scriptExists = true;
          siteExists = true;
          break;
        }
      }
    }
    if (!scriptExists || !siteExists) {
      gate.evidence = {
        skipped: true,
        reason: 'Public site preflight package or built site is absent in this local checkout.',
        script: PUBLIC_SITE_PREFLIGHT_SCRIPT,
        site: PUBLIC_SITE_DEFAULT_DIR,
        fallback_roots: PUBLIC_SITE_PREFLIGHT_FALLBACK_ROOTS,
      };
      return gate;
    }

    const python = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
    const { stdout, stderr } = await execFile(python, ['scripts/preflight_public_site.py', '--site', '_public_site'], {
      cwd: packageRoot,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    gate.status = 0;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    gate.stdout_bytes = Buffer.byteLength(stdout);
    gate.evidence = {
      ...validatePublicSitePreflight(parseJson(stdout), siteDir),
      package_root: scrubLocalPathText(packageRoot),
      script: scrubLocalPathText(preflightScript),
    };
    gate.ok = true;
  } catch (error) {
    gate.ok = false;
    gate.status = Number.isInteger(error.code) ? error.code : (gate.status ?? 1);
    gate.signal = error.signal ?? null;
    gate.stderr_bytes = Buffer.byteLength(error.stderr ?? '');
    gate.stdout_bytes = Buffer.byteLength(error.stdout ?? '');
    gate.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'PUBLIC_SITE_PREFLIGHT_FAILED'),
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    gate.duration_ms = Date.now() - started;
  }

  return gate;
}

async function resolvePublicSiteArtifactForAudit() {
  if ((await pathExists(PUBLIC_SITE_DEFAULT_DIR))) {
    return {
      packageRoot: PUBLIC_SITE_PACKAGE_ROOT,
      siteDir: PUBLIC_SITE_DEFAULT_DIR,
    };
  }
  for (const candidateRoot of PUBLIC_SITE_PREFLIGHT_FALLBACK_ROOTS) {
    const candidateSite = join(candidateRoot, '_public_site');
    if (await pathExists(candidateSite)) {
      return {
        packageRoot: candidateRoot,
        siteDir: candidateSite,
      };
    }
  }
  return null;
}

export async function runCloudflarePagesReleasePacketGate() {
  const started = Date.now();
  const gate = {
    name: 'cloudflare-pages-release-packet',
    required: false,
    command: commandLabel(process.execPath, ['scripts/build-cloudflare-pages-release-packet.mjs', '--site', '<public-site>', '--project-name', 'enigma-memory', '--domain', 'enigmamemory.com']),
    ok: true,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };

  try {
    if (!(await pathExists(CLOUDFLARE_PAGES_RELEASE_PACKET_SCRIPT))) {
      gate.evidence = {
        skipped: true,
        reason: 'Cloudflare Pages release packet builder is absent in this local checkout.',
        script: CLOUDFLARE_PAGES_RELEASE_PACKET_SCRIPT,
      };
      return gate;
    }
    const artifact = await resolvePublicSiteArtifactForAudit();
    if (artifact === null) {
      gate.evidence = {
        skipped: true,
        reason: 'Public site artifact is absent in this local checkout.',
        site: PUBLIC_SITE_DEFAULT_DIR,
        fallback_roots: PUBLIC_SITE_PREFLIGHT_FALLBACK_ROOTS,
      };
      return gate;
    }
    const { stdout, stderr } = await execFile(process.execPath, [
      'scripts/build-cloudflare-pages-release-packet.mjs',
      '--site',
      artifact.siteDir,
      '--project-name',
      'enigma-memory',
      '--domain',
      'enigmamemory.com',
    ], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    gate.status = 0;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    gate.stdout_bytes = Buffer.byteLength(stdout);
    const output = `${stdout}\n${stderr}`;
    if (SECRET_LOOKING_OUTPUT.test(output)) throw new Error('Cloudflare Pages release packet output appears to contain a secret.');
    const sitePathNeedles = [artifact.siteDir, artifact.siteDir.replaceAll('\\', '\\\\'), artifact.siteDir.replaceAll('\\', '/')];
    if (sitePathNeedles.some((needle) => output.includes(needle))) throw new Error('Cloudflare Pages release packet output leaked the local site path.');
    const parsed = parseJson(stdout);
    if (parsed.schema !== 'enigma.cloudflare_pages_release_packet.v1') throw new Error('Cloudflare Pages release packet emitted wrong schema.');
    if (parsed.local_artifact_ready !== true) throw new Error('Cloudflare Pages release packet must report local_artifact_ready: true for audit fixture.');
    if (parsed.site !== '<public-site>') throw new Error('Cloudflare Pages release packet must redact the local site path.');
    if (!Array.isArray(parsed.deploy_plan?.args) || !parsed.deploy_plan.args.includes('<public-site>')) throw new Error('Cloudflare Pages release packet deploy plan must redact the local site path.');
    if (parsed.deploy_plan?.tokenPrinted !== false) throw new Error('Cloudflare Pages release packet must not print tokens.');
    gate.evidence = {
      schema: parsed.schema,
      local_artifact_ready: parsed.local_artifact_ready,
      automated_deploy_ready: parsed.automated_deploy_ready,
      credential_present: parsed.credential_present,
      artifact_file_count: parsed.artifact?.file_count ?? null,
      artifact_root_hash: parsed.artifact?.root_hash ?? null,
      security_blocker_count: parsed.security?.blocker_count ?? null,
      deployment_blocker_count: parsed.deployment_blockers?.length ?? null,
      package_root: scrubLocalPathText(artifact.packageRoot),
      site: scrubLocalPathText(artifact.siteDir),
    };
  } catch (error) {
    gate.ok = false;
    gate.status = Number.isInteger(error.code) ? error.code : (gate.status ?? 1);
    gate.signal = error.signal ?? null;
    gate.stderr_bytes = Buffer.byteLength(error.stderr ?? '');
    gate.stdout_bytes = Buffer.byteLength(error.stdout ?? '');
    gate.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'CLOUDFLARE_PAGES_RELEASE_PACKET_FAILED'),
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    gate.duration_ms = Date.now() - started;
  }

  return gate;
}

export async function runProductionHandoffPacketGate() {
  const started = Date.now();
  const gate = {
    name: 'production-handoff-packet',
    required: false,
    command: commandLabel(process.execPath, ['scripts/build-production-handoff-packet.mjs', '--site', '<public-site>', '--project-name', 'enigma-memory', '--domain', 'enigmamemory.com']),
    ok: true,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };

  try {
    if (!(await pathExists(PRODUCTION_HANDOFF_PACKET_SCRIPT))) {
      gate.evidence = {
        skipped: true,
        reason: 'Production handoff packet builder is absent in this local checkout.',
        script: PRODUCTION_HANDOFF_PACKET_SCRIPT,
      };
      return gate;
    }
    const artifact = await resolvePublicSiteArtifactForAudit();
    if (artifact === null) {
      gate.evidence = {
        skipped: true,
        reason: 'Public site artifact is absent in this local checkout.',
        site: PUBLIC_SITE_DEFAULT_DIR,
        fallback_roots: PUBLIC_SITE_PREFLIGHT_FALLBACK_ROOTS,
      };
      return gate;
    }
    const { stdout, stderr } = await execFile(process.execPath, [
      'scripts/build-production-handoff-packet.mjs',
      '--site',
      artifact.siteDir,
      '--project-name',
      'enigma-memory',
      '--domain',
      'enigmamemory.com',
    ], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    gate.status = 0;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    gate.stdout_bytes = Buffer.byteLength(stdout);
    const output = `${stdout}\n${stderr}`;
    if (SECRET_LOOKING_OUTPUT.test(output)) throw new Error('Production handoff packet output appears to contain a secret.');
    const parsed = parseJson(stdout);
    if (parsed.schema !== 'enigma.production_handoff_packet.v1') throw new Error('Production handoff packet emitted wrong schema.');
    if (parsed.local_static_artifact_ready !== true) throw new Error('Production handoff packet must report local_static_artifact_ready: true for audit fixture.');
    if (parsed.go_live_ready !== false) throw new Error('Production handoff packet must not overclaim go_live_ready in local audit.');
    gate.evidence = {
      schema: parsed.schema,
      go_live_ready: parsed.go_live_ready,
      local_static_artifact_ready: parsed.local_static_artifact_ready,
      cloudflare_api_token_present: parsed.credentials_present?.cloudflare_api_token === true,
      pages_deployment_blocker_count: parsed.pages?.deployment_blockers?.length ?? null,
      infrastructure_missing_ref_count: parsed.infrastructure?.hosted_required_ref_missing_count ?? null,
      operator_blocker_count: parsed.operator_acceptance?.blocker_count ?? null,
      blocker_count: parsed.blockers?.length ?? null,
      site: scrubLocalPathText(artifact.siteDir),
    };
  } catch (error) {
    gate.ok = false;
    gate.status = Number.isInteger(error.code) ? error.code : (gate.status ?? 1);
    gate.signal = error.signal ?? null;
    gate.stderr_bytes = Buffer.byteLength(error.stderr ?? '');
    gate.stdout_bytes = Buffer.byteLength(error.stdout ?? '');
    gate.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'PRODUCTION_HANDOFF_PACKET_FAILED'),
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    gate.duration_ms = Date.now() - started;
  }

  return gate;
}

export async function runCloudflareTokenPolicyGate() {
  const started = Date.now();
  const gate = {
    name: 'cloudflare-token-policy',
    required: false,
    command: commandLabel(process.execPath, ['scripts/build-cloudflare-token-policy.mjs', '--mode', 'all', '--account-id', '<account-id>', '--project-name', 'enigma-memory', '--domain', 'enigmamemory.com']),
    ok: true,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };

  try {
    if (!(await pathExists(CLOUDFLARE_TOKEN_POLICY_SCRIPT))) {
      gate.evidence = {
        skipped: true,
        reason: 'Cloudflare token policy builder is absent in this local checkout.',
        script: CLOUDFLARE_TOKEN_POLICY_SCRIPT,
      };
      return gate;
    }
    const { stdout, stderr } = await execFile(process.execPath, [
      'scripts/build-cloudflare-token-policy.mjs',
      '--mode',
      'all',
      '--account-id',
      'account-release-audit',
      '--project-name',
      'enigma-memory',
      '--domain',
      'enigmamemory.com',
    ], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    gate.status = 0;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    gate.stdout_bytes = Buffer.byteLength(stdout);
    const output = `${stdout}\n${stderr}`;
    if (SECRET_LOOKING_OUTPUT.test(output)) throw new Error('Cloudflare token policy output appears to contain a secret.');
    const parsed = parseJson(stdout);
    if (parsed.schema !== 'enigma.cloudflare_token_policy.v1') throw new Error('Cloudflare token policy emitted wrong schema.');
    const permissionNames = (parsed.permission_groups ?? []).map((item) => item.permission_name);
    if (!permissionNames.includes('Cloudflare Pages Edit')) throw new Error('Cloudflare token policy missing Pages edit permission.');
    if (!permissionNames.includes('Registrar Edit')) throw new Error('Cloudflare token policy missing Registrar edit permission.');
    if (parsed.mutation_boundaries?.token_value_printed !== false) throw new Error('Cloudflare token policy must declare token_value_printed:false.');
    gate.evidence = {
      schema: parsed.schema,
      mode: parsed.mode,
      permission_count: permissionNames.length,
      api_call_count: parsed.planned_api_calls?.length ?? null,
      pages_edit_permission: permissionNames.includes('Cloudflare Pages Edit'),
      registrar_edit_permission: permissionNames.includes('Registrar Edit'),
      token_value_printed: parsed.mutation_boundaries?.token_value_printed === true,
      registrar_charge_acknowledgement_required: parsed.mutation_boundaries?.registrar_register_requires_charge_acknowledgement === true,
    };
  } catch (error) {
    gate.ok = false;
    gate.status = Number.isInteger(error.code) ? error.code : (gate.status ?? 1);
    gate.signal = error.signal ?? null;
    gate.stderr_bytes = Buffer.byteLength(error.stderr ?? '');
    gate.stdout_bytes = Buffer.byteLength(error.stdout ?? '');
    gate.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'CLOUDFLARE_TOKEN_POLICY_FAILED'),
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    gate.duration_ms = Date.now() - started;
  }

  return gate;
}

function cloudflarePermissionGroupsFixture() {
  return {
    success: true,
    result: [
      { id: 'account-settings-read-release-audit', name: 'Account Settings Read', scopes: ['com.cloudflare.api.account'] },
      { id: 'cloudflare-pages-read-release-audit', name: 'Cloudflare Pages Read', scopes: ['com.cloudflare.api.account'] },
      { id: 'cloudflare-pages-edit-release-audit', name: 'Cloudflare Pages Edit', scopes: ['com.cloudflare.api.account'] },
      { id: 'registrar-read-release-audit', name: 'Registrar Read', scopes: ['com.cloudflare.api.account'] },
      { id: 'registrar-edit-release-audit', name: 'Registrar Edit', scopes: ['com.cloudflare.api.account'] },
      { id: 'workers-scripts-read-release-audit', name: 'Workers Scripts Read', scopes: ['com.cloudflare.api.account'] },
      { id: 'workers-scripts-edit-release-audit', name: 'Workers Scripts Edit', scopes: ['com.cloudflare.api.account'] },
    ],
  };
}

export async function runCloudflareTokenRequestGate() {
  const started = Date.now();
  const gate = {
    name: 'cloudflare-token-request',
    required: false,
    command: commandLabel(process.execPath, ['scripts/build-cloudflare-token-request.mjs', '--permission-groups', '<permission-groups.json>', '--mode', 'all', '--account-id', '<account-id>']),
    ok: true,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };

  try {
    if (!(await pathExists(CLOUDFLARE_TOKEN_REQUEST_SCRIPT))) {
      gate.evidence = {
        skipped: true,
        reason: 'Cloudflare token request builder is absent in this local checkout.',
        script: CLOUDFLARE_TOKEN_REQUEST_SCRIPT,
      };
      return gate;
    }
    const tempDir = await mkdtemp(join(tmpdir(), 'enigma-cloudflare-token-request-'));
    const permissionGroupsPath = join(tempDir, 'permission-groups.json');
    await writeFile(permissionGroupsPath, JSON.stringify(cloudflarePermissionGroupsFixture(), null, 2), 'utf8');
    const { stdout, stderr } = await execFile(process.execPath, [
      'scripts/build-cloudflare-token-request.mjs',
      '--permission-groups',
      permissionGroupsPath,
      '--mode',
      'all',
      '--account-id',
      'account-release-audit',
      '--token-name',
      'enigma-memory-release-audit',
    ], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    gate.status = 0;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    gate.stdout_bytes = Buffer.byteLength(stdout);
    const output = `${stdout}\n${stderr}`;
    if (SECRET_LOOKING_OUTPUT.test(output)) throw new Error('Cloudflare token request output appears to contain a secret.');
    const parsed = parseJson(stdout);
    if (parsed.schema !== 'enigma.cloudflare_token_request.v1') throw new Error('Cloudflare token request emitted wrong schema.');
    if (parsed.ok !== true) throw new Error('Cloudflare token request fixture must resolve all permission groups.');
    if (parsed.mutation_boundaries?.token_created !== false) throw new Error('Cloudflare token request must not create a token.');
    gate.evidence = {
      schema: parsed.schema,
      ok: parsed.ok,
      mode: parsed.mode,
      required_permission_count: parsed.required_permission_count,
      resolved_permission_count: parsed.resolved_permission_count,
      unresolved_permission_count: parsed.unresolved_permission_count,
      policy_count: parsed.token_request?.policies?.length ?? null,
      token_created: parsed.mutation_boundaries?.token_created === true,
      token_value_printed: parsed.mutation_boundaries?.token_value_printed === true,
    };
  } catch (error) {
    gate.ok = false;
    gate.status = Number.isInteger(error.code) ? error.code : (gate.status ?? 1);
    gate.signal = error.signal ?? null;
    gate.stderr_bytes = Buffer.byteLength(error.stderr ?? '');
    gate.stdout_bytes = Buffer.byteLength(error.stdout ?? '');
    gate.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'CLOUDFLARE_TOKEN_REQUEST_FAILED'),
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    gate.duration_ms = Date.now() - started;
  }

  return gate;
}

export async function runGoalCompletionAuditGate() {
  const started = Date.now();
  const gate = {
    name: 'goal-completion-audit',
    required: false,
    command: commandLabel(process.execPath, ['scripts/build-goal-completion-audit.mjs', '--site', '<public-site>', '--project-name', 'enigma-memory', '--domain', 'enigmamemory.com']),
    ok: true,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };

  try {
    if (!(await pathExists(GOAL_COMPLETION_AUDIT_SCRIPT))) {
      gate.evidence = {
        skipped: true,
        reason: 'Goal completion audit builder is absent in this local checkout.',
        script: GOAL_COMPLETION_AUDIT_SCRIPT,
      };
      return gate;
    }
    const artifact = await resolvePublicSiteArtifactForAudit();
    if (artifact === null) {
      gate.evidence = {
        skipped: true,
        reason: 'Public site artifact is absent in this local checkout.',
        site: PUBLIC_SITE_DEFAULT_DIR,
        fallback_roots: PUBLIC_SITE_PREFLIGHT_FALLBACK_ROOTS,
      };
      return gate;
    }
    const { stdout, stderr } = await execFile(process.execPath, [
      'scripts/build-goal-completion-audit.mjs',
      '--site',
      artifact.siteDir,
      '--project-name',
      'enigma-memory',
      '--domain',
      'enigmamemory.com',
      '--account-id',
      'account-release-audit',
    ], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    gate.status = 0;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    gate.stdout_bytes = Buffer.byteLength(stdout);
    const output = `${stdout}\n${stderr}`;
    if (SECRET_LOOKING_OUTPUT.test(output)) throw new Error('Goal completion audit output appears to contain a secret.');
    const parsed = parseJson(stdout);
    if (parsed.schema !== 'enigma.goal_completion_audit.v1') throw new Error('Goal completion audit emitted wrong schema.');
    if (parsed.complete !== false) throw new Error('Goal completion audit must not report complete in local release audit.');
    if (parsed.local_static_artifact_ready !== true) throw new Error('Goal completion audit must report local static artifact ready.');
    const deliverables = Array.isArray(parsed.deliverables) ? parsed.deliverables : [];
    gate.evidence = {
      schema: parsed.schema,
      complete: parsed.complete,
      release_posture: parsed.release_posture,
      go_live_ready: parsed.go_live_ready,
      local_static_artifact_ready: parsed.local_static_artifact_ready,
      deliverable_count: deliverables.length,
      blocked_deliverable_count: deliverables.filter((item) => item?.ok !== true).length,
      blocker_count: Array.isArray(parsed.blockers) ? parsed.blockers.length : null,
    };
  } catch (error) {
    gate.ok = false;
    gate.status = Number.isInteger(error.code) ? error.code : (gate.status ?? 1);
    gate.signal = error.signal ?? null;
    gate.stderr_bytes = Buffer.byteLength(error.stderr ?? '');
    gate.stdout_bytes = Buffer.byteLength(error.stdout ?? '');
    gate.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'GOAL_COMPLETION_AUDIT_FAILED'),
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    gate.duration_ms = Date.now() - started;
  }

  return gate;
}

export async function runBackendReadinessSmokeGate() {
  const started = Date.now();
  const gate = {
    name: 'backend-readiness-smoke',
    required: false,
    command: commandLabel(process.execPath, ['scripts/run-backend-readiness-smoke.mjs']),
    ok: true,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };

  try {
    if (!(await pathExists(BACKEND_READINESS_SMOKE_SCRIPT))) {
      gate.evidence = {
        skipped: true,
        reason: 'Backend readiness smoke script is absent in this local checkout.',
        script: BACKEND_READINESS_SMOKE_SCRIPT,
      };
      return gate;
    }
    const { stdout, stderr } = await execFile(process.execPath, ['scripts/run-backend-readiness-smoke.mjs'], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    gate.status = 0;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    gate.stdout_bytes = Buffer.byteLength(stdout);
    const output = `${stdout}\n${stderr}`;
    if (SECRET_LOOKING_OUTPUT.test(output)) throw new Error('Backend readiness smoke output appears to contain a secret.');
    const parsed = parseJson(stdout);
    if (parsed.schema !== 'enigma.backend_readiness_smoke.v1') throw new Error('Backend readiness smoke emitted wrong schema.');
    if (parsed.ok !== true) throw new Error('Backend readiness smoke did not pass.');
    const checks = Array.isArray(parsed.checks) ? parsed.checks : [];
    gate.evidence = {
      schema: parsed.schema,
      ok: parsed.ok,
      check_count: parsed.check_count,
      loopback_only: parsed.loopback_only,
      fail_closed_count: checks.filter((check) => check.mode === 'production-fail-closed' && check.readyz_status === 503).length,
      ready_fixture_count: checks.filter((check) => check.mode === 'production-referenced-fixture' && check.readyz_status === 200 && check.readyz_missing_evidence_ref_count === 0).length,
    };
  } catch (error) {
    gate.ok = false;
    gate.status = Number.isInteger(error.code) ? error.code : (gate.status ?? 1);
    gate.signal = error.signal ?? null;
    gate.stderr_bytes = Buffer.byteLength(error.stderr ?? '');
    gate.stdout_bytes = Buffer.byteLength(error.stdout ?? '');
    gate.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'BACKEND_READINESS_SMOKE_FAILED'),
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    gate.duration_ms = Date.now() - started;
  }

  return gate;
}

export async function runProductionBackendEnvKitGate() {
  const started = Date.now();
  const tempDir = await mkdtemp(join(tmpdir(), 'enigma-backend-env-kit-audit-'));
  const outDir = join(tempDir, 'backend-env-kit');
  const gate = {
    name: 'production-backend-env-kit',
    required: false,
    command: commandLabel(process.execPath, ['scripts/build-production-backend-env-kit.mjs', '--out-dir', '<out-dir>', '--domain', 'example.invalid', '--tenant', 'release-audit', '--environment', 'production']),
    ok: true,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };

  try {
    if (!(await pathExists(PRODUCTION_BACKEND_ENV_KIT_SCRIPT))) {
      gate.evidence = {
        skipped: true,
        reason: 'Production backend env kit builder is absent in this local checkout.',
        script: PRODUCTION_BACKEND_ENV_KIT_SCRIPT,
      };
      return gate;
    }
    const { stdout, stderr } = await execFile(process.execPath, [
      'scripts/build-production-backend-env-kit.mjs',
      '--out-dir', outDir,
      '--domain', 'example.invalid',
      '--tenant', 'release-audit',
      '--environment', 'production',
    ], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    gate.status = 0;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    gate.stdout_bytes = Buffer.byteLength(stdout);
    const output = `${stdout}\n${stderr}`;
    if (SECRET_LOOKING_OUTPUT.test(output)) throw new Error('Production backend env kit stdout appears to contain a secret.');
    if (output.includes(tempDir) || output.includes(outDir)) throw new Error('Production backend env kit stdout leaked a local output path.');
    const parsed = parseJson(stdout);
    if (parsed.schema !== 'enigma.production_backend_env_kit.v1') throw new Error('Production backend env kit emitted wrong stdout schema.');
    if (parsed.launch_ready !== false) throw new Error('Production backend env kit must not mark launch ready.');
    if (parsed.out_dir !== '<production-backend-env-kit-output>') throw new Error('Production backend env kit stdout must redact out-dir.');
    const summary = parseJson(await readFile(join(outDir, 'PRODUCTION_BACKEND_ENV_KIT_SUMMARY.json'), 'utf8'));
    const refMap = parseJson(await readFile(join(outDir, 'hosted-ref-map.json'), 'utf8'));
    const relayEnv = await readFile(join(outDir, 'operator-env', 'relay.production.env'), 'utf8');
    const gatewayEnv = await readFile(join(outDir, 'operator-env', 'gateway.production.env'), 'utf8');
    const placeholders = parseJson(await readFile(join(outDir, 'operator-secrets', 'placeholder-manifest.json'), 'utf8'));
    const generatedText = [JSON.stringify(summary), JSON.stringify(refMap), relayEnv, gatewayEnv, JSON.stringify(placeholders)].join('\n');
    if (SECRET_LOOKING_OUTPUT.test(generatedText) || generatedText.includes(tempDir) || generatedText.includes(outDir)) {
      throw new Error('Production backend env kit generated files are not public-safe.');
    }
    if (summary.launch_ready !== false || summary.status !== 'blocked_template_only') throw new Error('Production backend env kit summary must be blocked template-only.');
    if (!relayEnv.includes('ENIGMA_READINESS_FAIL_CLOSED=true') || !relayEnv.includes('ENIGMA_REQUIRE_EXTERNAL_STORAGE=true') || !relayEnv.includes('ENIGMA_SIEM_REF=')) throw new Error('Relay env template is missing fail-closed production defaults or SIEM ref.');
    if (!gatewayEnv.includes('ENIGMA_READINESS_FAIL_CLOSED=true') || !gatewayEnv.includes('ENIGMA_REQUIRE_SIEM_EXPORT=true') || !gatewayEnv.includes('ENIGMA_SIEM_REF=')) throw new Error('Gateway env template is missing fail-closed production defaults or SIEM ref.');
    if (refMap.schema !== 'enigma.production_backend_hosted_ref_map.v1' || refMap.required_ref_count !== HOSTED_LIVE_REQUIRED_REF_KEYS.length) throw new Error('Hosted ref map is incomplete.');
    if (!refMap.refs?.backend_host?.env_names?.includes('ENIGMA_BACKEND_HOST_REF')) throw new Error('Hosted ref map is missing backend host env guidance.');
    if (!Array.isArray(placeholders.entries) || placeholders.entries.length < 7) throw new Error('Secret placeholder manifest is incomplete.');
    gate.evidence = {
      schema: summary.schema,
      status: summary.status,
      launch_ready: summary.launch_ready,
      generated_file_count: parsed.file_count,
      hosted_ref_count: refMap.required_ref_count,
      secret_placeholder_count: placeholders.entries.length,
      relay_fail_closed: relayEnv.includes('ENIGMA_READINESS_FAIL_CLOSED=true'),
      gateway_fail_closed: gatewayEnv.includes('ENIGMA_READINESS_FAIL_CLOSED=true'),
      out_dir_redacted: parsed.out_dir === '<production-backend-env-kit-output>',
    };
  } catch (error) {
    gate.ok = false;
    gate.status = Number.isInteger(error.code) ? error.code : (gate.status ?? 1);
    gate.signal = error.signal ?? null;
    gate.stderr_bytes = Buffer.byteLength(error.stderr ?? '');
    gate.stdout_bytes = Buffer.byteLength(error.stdout ?? '');
    gate.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'PRODUCTION_BACKEND_ENV_KIT_FAILED'),
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    gate.duration_ms = Date.now() - started;
    await rm(tempDir, { recursive: true, force: true });
  }

  return gate;
}

function hostedBackendLiveFixture() {
  const refs = Object.fromEntries([
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
    'relay_deployment',
    'gateway_deployment',
  ].map((key) => [key, `${key}-release-audit#fixture`]));
  const responseHash = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const readyBody = (service) => ({
    ok: true,
    service,
    checks: [{ name: 'production_evidence_refs', ok: true }],
    missing_evidence_refs: [],
  });
  return {
    schema: 'enigma.hosted_backend_live_evidence.v1',
    observed_at: '2026-06-24T00:00:00.000Z',
    environment: {
      environment_id: 'release-audit-fixture',
      domain: 'enigmamemory.com',
      cloud_provider: 'cloudflare+operator-cloud',
      region: 'us-central',
      owner: 'operator',
      status: 'verified',
    },
    refs,
    probes: {
      relay_livez: { url: 'https://relay.enigmamemory.com/livez', status_code: 200, body: { ok: true, service: 'enigma-relay' }, observed_at: '2026-06-24T00:00:00.000Z', response_hash: responseHash },
      relay_readyz: { url: 'https://relay.enigmamemory.com/readyz', status_code: 200, body: readyBody('enigma-relay'), observed_at: '2026-06-24T00:00:00.000Z', response_hash: responseHash },
      gateway_livez: { url: 'https://gateway.enigmamemory.com/livez', status_code: 200, body: { ok: true, service: 'enigma-gateway' }, observed_at: '2026-06-24T00:00:00.000Z', response_hash: responseHash },
      gateway_readyz: { url: 'https://gateway.enigmamemory.com/readyz', status_code: 200, body: readyBody('enigma-gateway'), observed_at: '2026-06-24T00:00:00.000Z', response_hash: responseHash },
    },
    operator_acceptance: {
      decision: 'go',
      packet_ref: 'operator-acceptance-release-audit#fixture',
      approved_at: '2026-06-24T00:00:00.000Z',
      approved_by: 'operator',
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

export async function runHostedBackendLiveValidatorGate() {
  const started = Date.now();
  const gate = {
    name: 'hosted-backend-live-validator',
    required: false,
    command: commandLabel(process.execPath, ['scripts/validate-hosted-backend-live.mjs', '--evidence', '<hosted-backend-live.json>']),
    ok: true,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };

  try {
    if (!(await pathExists(HOSTED_BACKEND_LIVE_VALIDATOR_SCRIPT))) {
      gate.evidence = {
        skipped: true,
        reason: 'Hosted backend live validator is absent in this local checkout.',
        script: HOSTED_BACKEND_LIVE_VALIDATOR_SCRIPT,
      };
      return gate;
    }
    const tempDir = await mkdtemp(join(tmpdir(), 'enigma-hosted-backend-live-'));
    const evidencePath = join(tempDir, 'hosted-backend-live.json');
    await writeFile(evidencePath, JSON.stringify(hostedBackendLiveFixture(), null, 2), 'utf8');
    const { stdout, stderr } = await execFile(process.execPath, ['scripts/validate-hosted-backend-live.mjs', '--evidence', evidencePath], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    gate.status = 0;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    gate.stdout_bytes = Buffer.byteLength(stdout);
    const output = `${stdout}\n${stderr}`;
    if (SECRET_LOOKING_OUTPUT.test(output)) throw new Error('Hosted backend live validator output appears to contain a secret.');
    const parsed = parseJson(stdout);
    if (parsed.schema !== 'enigma.hosted_backend_live_result.v1') throw new Error('Hosted backend live validator emitted wrong schema.');
    if (parsed.ok !== true) throw new Error('Hosted backend live validator fixture must be accepted.');
    gate.evidence = {
      schema: parsed.schema,
      status: parsed.status,
      blocker_count: Array.isArray(parsed.blockers) ? parsed.blockers.length : null,
      required_refs: parsed.checked?.required_refs ?? null,
      refs_missing: parsed.checked?.refs_missing ?? null,
      probes_covered: parsed.checked?.probes_covered ?? null,
      operator_decision: parsed.checked?.operator_decision ?? null,
    };
  } catch (error) {
    gate.ok = false;
    gate.status = Number.isInteger(error.code) ? error.code : (gate.status ?? 1);
    gate.signal = error.signal ?? null;
    gate.stderr_bytes = Buffer.byteLength(error.stderr ?? '');
    gate.stdout_bytes = Buffer.byteLength(error.stdout ?? '');
    gate.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'HOSTED_BACKEND_LIVE_VALIDATOR_FAILED'),
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    gate.duration_ms = Date.now() - started;
  }

  return gate;
}
export async function runHostedBackendCollectorHelpGate() {
  const started = Date.now();
  const gate = {
    name: 'hosted-backend-collector-help',
    required: false,
    command: commandLabel(process.execPath, ['scripts/collect-hosted-backend-live-evidence.mjs', '--help']),
    ok: true,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };

  try {
    if (!(await pathExists(HOSTED_BACKEND_COLLECTOR_SCRIPT))) {
      gate.evidence = {
        skipped: true,
        reason: 'Hosted backend live evidence collector is absent in this local checkout.',
        script: HOSTED_BACKEND_COLLECTOR_SCRIPT,
      };
      return gate;
    }
    const { stdout, stderr } = await execFile(process.execPath, ['scripts/collect-hosted-backend-live-evidence.mjs', '--help'], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    gate.status = 0;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    gate.stdout_bytes = Buffer.byteLength(stdout);
    const output = `${stdout}\n${stderr}`;
    if (SECRET_LOOKING_OUTPUT.test(output)) throw new Error('Hosted backend collector help appears to contain a secret.');
    if (!stdout.includes('Collects public HTTPS /livez and /readyz evidence')) throw new Error('Hosted backend collector help must state public HTTPS probe collection.');
    if (!stdout.includes('It never sends credentials and does not deploy infrastructure')) throw new Error('Hosted backend collector help must state credential/deploy boundary.');
    gate.evidence = {
      usage: true,
      schema: 'enigma.hosted_backend_live_collection.v1',
      sends_credentials: false,
      deploys_infrastructure: false,
    };
  } catch (error) {
    gate.ok = false;
    gate.status = Number.isInteger(error.code) ? error.code : (gate.status ?? 1);
    gate.signal = error.signal ?? null;
    gate.stderr_bytes = Buffer.byteLength(error.stderr ?? '');
    gate.stdout_bytes = Buffer.byteLength(error.stdout ?? '');
    gate.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'HOSTED_BACKEND_COLLECTOR_HELP_FAILED'),
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    gate.duration_ms = Date.now() - started;
  }

  return gate;
}


export async function runHostedProbeWorkerBuilderGate() {
  const started = Date.now();
  const gate = {
    name: 'hosted-probe-worker-builder',
    required: false,
    command: commandLabel(process.execPath, ['scripts/build-hosted-probe-worker.mjs']),
    ok: true,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };

  try {
    if (!(await pathExists(HOSTED_PROBE_WORKER_SCRIPT))) {
      gate.evidence = {
        skipped: true,
        reason: 'Hosted probe Worker builder is absent in this local checkout.',
        script: HOSTED_PROBE_WORKER_SCRIPT,
      };
      return gate;
    }
    const { stdout, stderr } = await execFile(process.execPath, ['scripts/build-hosted-probe-worker.mjs'], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    gate.status = 0;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    gate.stdout_bytes = Buffer.byteLength(stdout);
    const output = `${stdout}\n${stderr}`;
    if (SECRET_LOOKING_OUTPUT.test(output)) throw new Error('Hosted probe Worker output appears to contain a secret.');
    const parsed = parseJson(stdout);
    if (parsed.schema !== 'enigma.hosted_probe_worker_bundle.v1') throw new Error('Hosted probe Worker builder emitted wrong schema.');
    if (parsed.ok !== true) throw new Error('Hosted probe Worker bundle must be accepted.');
    gate.evidence = {
      schema: parsed.schema,
      ok: parsed.ok,
      worker_name: parsed.worker_name,
      required_env_ref_count: Array.isArray(parsed.required_env_refs) ? parsed.required_env_refs.length : null,
      source_hash: parsed.validation?.source_hash ?? null,
      default_routes: parsed.deployment_plan?.default_routes ?? [],
      mutates_cloudflare: parsed.deployment_plan?.mutates_cloudflare ?? null,
    };
  } catch (error) {
    gate.ok = false;
    gate.status = Number.isInteger(error.code) ? error.code : (gate.status ?? 1);
    gate.signal = error.signal ?? null;
    gate.stderr_bytes = Buffer.byteLength(error.stderr ?? '');
    gate.stdout_bytes = Buffer.byteLength(error.stdout ?? '');
    gate.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'HOSTED_PROBE_WORKER_BUILDER_FAILED'),
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    gate.duration_ms = Date.now() - started;
  }

  return gate;
}

export async function runEdgeBackendWorkerBuilderGate() {
  const started = Date.now();
  const tempDir = await mkdtemp(join(tmpdir(), 'enigma-edge-backend-worker-audit-'));
  const outDir = join(tempDir, 'workers');
  const gate = {
    name: 'edge-backend-worker-builder',
    required: false,
    command: commandLabel(process.execPath, ['scripts/build-edge-backend-workers.mjs', '--out-dir', '<out-dir>', '--domain', 'enigmamemory.com']),
    ok: true,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };

  try {
    if (!(await pathExists(EDGE_BACKEND_WORKER_SCRIPT))) {
      gate.evidence = {
        skipped: true,
        reason: 'Edge backend Worker builder is absent in this local checkout.',
        script: EDGE_BACKEND_WORKER_SCRIPT,
      };
      return gate;
    }
    const { stdout, stderr } = await execFile(process.execPath, [
      'scripts/build-edge-backend-workers.mjs',
      '--out-dir', outDir,
      '--domain', 'enigmamemory.com',
    ], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    gate.status = 0;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    gate.stdout_bytes = Buffer.byteLength(stdout);
    const output = `${stdout}\n${stderr}`;
    if (SECRET_LOOKING_OUTPUT.test(output)) throw new Error('Edge backend Worker output appears to contain a secret.');
    const parsed = parseJson(stdout);
    if (parsed.schema !== 'enigma.edge_backend_worker_bundle.v1') throw new Error('Edge backend Worker builder emitted wrong schema.');
    if (parsed.ok !== true) throw new Error('Edge backend Worker bundle must be accepted.');
    if (parsed.out_dir !== '<edge-backend-workers-output>') throw new Error('Edge backend Worker stdout must redact out-dir.');
    const manifest = parseJson(await readFile(join(outDir, 'EDGE_BACKEND_WORKERS_MANIFEST.json'), 'utf8'));
    const relayToml = await readFile(join(outDir, 'relay', 'wrangler.toml'), 'utf8');
    const gatewayToml = await readFile(join(outDir, 'gateway', 'wrangler.toml'), 'utf8');
    const relaySource = await readFile(join(outDir, 'relay', 'worker.mjs'), 'utf8');
    const gatewaySource = await readFile(join(outDir, 'gateway', 'worker.mjs'), 'utf8');
    if (manifest.schema !== 'enigma.edge_backend_worker_bundle.v1') throw new Error('Edge backend Worker manifest emitted wrong schema.');
    if (manifest.ok !== true) throw new Error('Edge backend Worker manifest must be accepted.');
    if (!/custom_domain\s*=\s*true/.test(relayToml) || !/custom_domain\s*=\s*true/.test(gatewayToml)) throw new Error('Edge backend Worker configs must use custom domains.');
    if (/hosted_probe_only|pages_edge_probe_only/.test(`${relaySource}\n${gatewaySource}`)) throw new Error('Edge backend Worker source must not be probe-only payload.');
    gate.evidence = {
      schema: parsed.schema,
      ok: parsed.ok,
      service_count: Array.isArray(parsed.services) ? parsed.services.length : null,
      services: parsed.services,
      custom_domain_configs: /custom_domain\s*=\s*true/.test(relayToml) && /custom_domain\s*=\s*true/.test(gatewayToml),
      workers_dev_disabled: /workers_dev\s*=\s*false/.test(relayToml) && /workers_dev\s*=\s*false/.test(gatewayToml),
      relay_source_hash: manifest.services?.relay?.validation?.source_hash ?? null,
      gateway_source_hash: manifest.services?.gateway?.validation?.source_hash ?? null,
      claim_boundary_count: Array.isArray(parsed.claim_boundary) ? parsed.claim_boundary.length : 0,
      mutates_cloudflare: false,
    };
  } catch (error) {
    gate.ok = false;
    gate.status = Number.isInteger(error.code) ? error.code : (gate.status ?? 1);
    gate.signal = error.signal ?? null;
    gate.stderr_bytes = Buffer.byteLength(error.stderr ?? '');
    gate.stdout_bytes = Buffer.byteLength(error.stdout ?? '');
    gate.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'EDGE_BACKEND_WORKER_BUILDER_FAILED'),
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    gate.duration_ms = Date.now() - started;
    await rm(tempDir, { recursive: true, force: true });
  }

  return gate;
}

export async function runOperatorEvidenceStarterGate() {
  const started = Date.now();
  const tempDir = await mkdtemp(join(tmpdir(), 'enigma-operator-evidence-starter-audit-'));
  const outDir = join(tempDir, 'starter');
  const gate = {
    name: 'operator-evidence-starter',
    required: false,
    command: commandLabel(process.execPath, ['scripts/build-operator-evidence-starter.mjs', '--out-dir', '<out-dir>', '--domain', 'enigmamemory.com', '--tenant', 'release-audit']),
    ok: true,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };

  try {
    if (!(await pathExists(OPERATOR_EVIDENCE_STARTER_SCRIPT))) {
      gate.evidence = {
        skipped: true,
        reason: 'Operator evidence starter builder is absent in this local checkout.',
        script: OPERATOR_EVIDENCE_STARTER_SCRIPT,
      };
      return gate;
    }
    const { stdout, stderr } = await execFile(process.execPath, [
      'scripts/build-operator-evidence-starter.mjs',
      '--out-dir',
      outDir,
      '--domain',
      'enigmamemory.com',
      '--tenant',
      'release-audit',
    ], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    gate.status = 0;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    gate.stdout_bytes = Buffer.byteLength(stdout);
    const output = `${stdout}\n${stderr}`;
    if (SECRET_LOOKING_OUTPUT.test(output)) throw new Error('Operator evidence starter output appears to contain a secret.');
    if (output.includes(outDir)) throw new Error('Operator evidence starter output leaked its local output path.');
    const parsed = parseJson(stdout);
    if (parsed.schema !== 'enigma.operator_evidence_starter.v1') throw new Error('Operator evidence starter emitted wrong schema.');
    if (parsed.status !== 'blocked_until_operator_evidence') throw new Error('Operator evidence starter must remain blocked until operator evidence exists.');
    if (parsed.out_dir !== '<operator-evidence-starter-output>') throw new Error('Operator evidence starter summary must redact out_dir.');
    const starter = parseJson(await readFile(join(outDir, 'OPERATOR_EVIDENCE_STARTER.json'), 'utf8'));
    const refs = parseJson(await readFile(join(outDir, 'hosted-refs.template.json'), 'utf8'));
    const commands = parseJson(await readFile(join(outDir, 'commands.json'), 'utf8'));
    const ownerApprovalRefs = parseJson(await readFile(join(outDir, 'owner-approval-refs.template.json'), 'utf8'));
    const evidenceRefs = parseJson(await readFile(join(outDir, 'evidence-refs.template.json'), 'utf8'));
    const workstreams = parseJson(await readFile(join(outDir, 'hosted-ref-workstreams.json'), 'utf8'));
    const refKeys = Object.keys(refs);
    if (refKeys.length !== HOSTED_LIVE_REQUIRED_REF_KEYS.length) throw new Error('Operator evidence starter hosted refs must match hosted-live required refs.');
    for (const key of HOSTED_LIVE_REQUIRED_REF_KEYS) {
      if (!Object.hasOwn(refs, key)) throw new Error(`Operator evidence starter missing hosted ref ${key}.`);
      if (typeof refs[key] !== 'string') throw new Error(`Operator evidence starter hosted ref ${key} must be a collector-compatible string.`);
    }
    if (!Object.hasOwn(refs, 'relay_deployment') || !Object.hasOwn(refs, 'gateway_deployment')) throw new Error('Operator evidence starter must include relay/gateway deployment refs.');
    if (workstreams.schema !== 'enigma.operator_hosted_ref_workstreams.v1') throw new Error('Operator evidence starter hosted ref workstreams emitted wrong schema.');
    if (workstreams.required_ref_count !== HOSTED_LIVE_REQUIRED_REF_KEYS.length) throw new Error('Operator evidence starter workstreams must cover every hosted-live ref.');
    const workstreamRefs = Object.values(workstreams.workstreams ?? {}).flatMap((entry) => Array.isArray(entry?.refs) ? entry.refs.map((ref) => ref?.key).filter(Boolean) : []);
    for (const key of HOSTED_LIVE_REQUIRED_REF_KEYS) {
      if (!workstreamRefs.includes(key)) throw new Error(`Operator evidence starter workstreams missing hosted ref ${key}.`);
    }
    if (starter.schema !== 'enigma.operator_evidence_starter.v1') throw new Error('Operator evidence starter file emitted wrong schema.');
    if (starter.status !== 'blocked_until_operator_evidence') throw new Error('Operator evidence starter file must stay blocked.');
    if (!commands.build_goal_audit || !String(commands.build_goal_audit).includes('--release-audit')) throw new Error('Operator evidence starter command plan must wire release-audit evidence.');
    if (!commands.collect_hosted_live || !String(commands.collect_hosted_live).includes('--out <evidence-dir>/hosted-backend-live-collection.json')) throw new Error('Operator evidence starter collect command must write hosted live collection output.');
    if (!commands.collect_hosted_live || !String(commands.collect_hosted_live).includes('--evidence-out <evidence-dir>/hosted-backend-live.json')) throw new Error('Operator evidence starter collect command must write hosted live evidence output.');
    if (!commands.validate_hosted_live || !String(commands.validate_hosted_live).includes('--evidence <evidence-dir>/hosted-backend-live.json')) throw new Error('Operator evidence starter validate command must consume hosted live evidence output.');
    if (!commands.build_operator_packet || !String(commands.build_operator_packet).includes('--owners-json <evidence-dir>/owner-approval-refs.json')) throw new Error('Operator evidence starter must wire owner refs into packet builder.');
    if (!commands.build_operator_packet || !String(commands.build_operator_packet).includes('--evidence-refs <evidence-dir>/evidence-refs.json')) throw new Error('Operator evidence starter must wire evidence refs into packet builder.');
    for (const role of REQUIRED_OWNER_ROLES) {
      if (typeof ownerApprovalRefs[role] !== 'string') throw new Error(`Operator evidence starter missing owner approval ref template for ${role}.`);
    }
    for (const item of REQUIRED_EVIDENCE_ITEMS) {
      if (typeof evidenceRefs[item] !== 'string') throw new Error(`Operator evidence starter missing evidence ref template for ${item}.`);
    }
    gate.evidence = {
      schema: parsed.schema,
      status: parsed.status,
      file_count: parsed.file_count,
      hosted_ref_count: refKeys.length,
      evidence_item_count: parsed.evidence_item_count,
      hosted_ref_workstream_count: Object.keys(workstreams.workstreams ?? {}).length,
      out_dir_redacted: parsed.out_dir === '<operator-evidence-starter-output>',
    };
  } catch (error) {
    gate.ok = false;
    gate.status = Number.isInteger(error.code) ? error.code : (gate.status ?? 1);
    gate.signal = error.signal ?? null;
    gate.stderr_bytes = Buffer.byteLength(error.stderr ?? '');
    gate.stdout_bytes = Buffer.byteLength(error.stdout ?? '');
    gate.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'OPERATOR_EVIDENCE_STARTER_FAILED'),
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
    gate.duration_ms = Date.now() - started;
  }

  return gate;
}

export async function runWhitepaperClaimsValidatorGate() {
  const started = Date.now();
  const gate = {
    name: 'whitepaper-claims-validator',
    required: false,
    command: commandLabel(process.execPath, ['scripts/validate-whitepaper-claims.mjs', '--file', 'docs/enigma-memory-technical-whitepaper.md']),
    ok: true,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };
  try {
    if (!(await pathExists(WHITEPAPER_CLAIMS_VALIDATOR_SCRIPT))) {
      gate.evidence = {
        skipped: true,
        reason: 'Whitepaper claims validator is absent in this local checkout.',
      };
      return gate;
    }
    const { stdout, stderr } = await execFile(process.execPath, [
      'scripts/validate-whitepaper-claims.mjs',
      '--file',
      'docs/enigma-memory-technical-whitepaper.md',
    ], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    gate.status = 0;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    gate.stdout_bytes = Buffer.byteLength(stdout);
    const output = `${stdout}\n${stderr}`;
    if (SECRET_LOOKING_OUTPUT.test(output)) throw new Error('Whitepaper claims validator output appears to contain a secret.');
    const parsed = parseJson(stdout);
    if (parsed.schema !== 'enigma.whitepaper_claims_result.v1') throw new Error('Whitepaper claims validator emitted wrong schema.');
    gate.evidence = {
      schema: parsed.schema,
      status: parsed.status,
      displayed_equation_blocks: parsed.counts?.displayed_equation_blocks ?? null,
      mermaid_diagrams: parsed.counts?.mermaid_diagrams ?? null,
      unsupported_absolute_claims: parsed.counts?.unsupported_absolute_claims ?? null,
      blocker_count: Array.isArray(parsed.blockers) ? parsed.blockers.length : null,
    };
  } catch (error) {
    gate.ok = false;
    gate.status = Number.isInteger(error.code) ? error.code : (gate.status ?? 1);
    gate.signal = error.signal ?? null;
    gate.stderr_bytes = Buffer.byteLength(error.stderr ?? '');
    gate.stdout_bytes = Buffer.byteLength(error.stdout ?? '');
    gate.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'WHITEPAPER_CLAIMS_VALIDATOR_FAILED'),
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    gate.duration_ms = Date.now() - started;
  }
  return gate;
}

export async function runCloudflareCredentialsValidatorGate() {
  const started = Date.now();
  const gate = {
    name: 'cloudflare-credentials-validator',
    required: false,
    command: commandLabel(process.execPath, ['scripts/validate-cloudflare-credentials.mjs']),
    ok: true,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };
  try {
    if (!(await pathExists(CLOUDFLARE_CREDENTIALS_VALIDATOR_SCRIPT))) {
      gate.evidence = {
        skipped: true,
        reason: 'Cloudflare credential validator is absent in this local checkout.',
      };
      return gate;
    }
    const { stdout, stderr, status } = await execFile(process.execPath, [
      'scripts/validate-cloudflare-credentials.mjs',
    ], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    }).then((result) => ({ ...result, status: 0 })).catch((error) => {
      if (Number.isInteger(error.code) && error.code === 1 && typeof error.stdout === 'string') {
        return { stdout: error.stdout, stderr: error.stderr ?? '', status: 1 };
      }
      throw error;
    });
    gate.status = status;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    gate.stdout_bytes = Buffer.byteLength(stdout);
    const output = `${stdout}\n${stderr}`;
    if (SECRET_LOOKING_OUTPUT.test(output)) throw new Error('Cloudflare credential validator output appears to contain a secret.');
    const parsed = parseJson(stdout);
    if (parsed.schema !== 'enigma.cloudflare_credentials_result.v1') throw new Error('Cloudflare credential validator emitted wrong schema.');
    if (parsed.token_value_printed !== false || parsed.account_id_printed !== false) throw new Error('Cloudflare credential validator must not print token values or account ids.');
    gate.evidence = {
      schema: parsed.schema,
      credential_ready: parsed.credentials_present === true,
      source_loaded: parsed.source_loaded === true,
      present_key_count: Array.isArray(parsed.present_keys) ? parsed.present_keys.length : null,
      missing_key_count: Array.isArray(parsed.missing_keys) ? parsed.missing_keys.length : null,
      blocker_count: Array.isArray(parsed.blockers) ? parsed.blockers.length : null,
      token_value_printed: parsed.token_value_printed === true,
      account_id_printed: parsed.account_id_printed === true,
    };
  } catch (error) {
    gate.ok = false;
    gate.status = Number.isInteger(error.code) ? error.code : (gate.status ?? 1);
    gate.signal = error.signal ?? null;
    gate.stderr_bytes = Buffer.byteLength(error.stderr ?? '');
    gate.stdout_bytes = Buffer.byteLength(error.stdout ?? '');
    gate.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'CLOUDFLARE_CREDENTIALS_VALIDATOR_FAILED'),
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    gate.duration_ms = Date.now() - started;
  }
  return gate;
}

export async function runCloudflareWorkerInspectValidatorGate() {
  const started = Date.now();
  const gate = {
    name: 'cloudflare-worker-inspect-validator',
    required: false,
    command: commandLabel(process.execPath, ['scripts/validate-cloudflare-worker-inspect.mjs', '--evidence', '<worker-inspect.json>']),
    ok: true,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };

  try {
    if (!(await pathExists(CLOUDFLARE_WORKER_INSPECT_VALIDATOR_SCRIPT))) {
      gate.evidence = {
        skipped: true,
        reason: 'Cloudflare Worker inspect validator is absent in this local checkout.',
      };
      return gate;
    }
    if (!(await pathExists(CLOUDFLARE_WORKER_INSPECT_CURRENT))) {
      gate.evidence = {
        skipped: true,
        reason: 'No current worker-inspect evidence artifact exists; run `npm run cloudflare:ops -- workers inspect-probe --out .enigma/worker-inspect-current.json` after Cloudflare credential changes.',
      };
      return gate;
    }
    const { stdout, stderr } = await execFile(process.execPath, [
      'scripts/validate-cloudflare-worker-inspect.mjs',
      '--evidence',
      CLOUDFLARE_WORKER_INSPECT_CURRENT,
    ], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    gate.status = 0;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    gate.stdout_bytes = Buffer.byteLength(stdout);
    const output = `${stdout}\n${stderr}`;
    if (SECRET_LOOKING_OUTPUT.test(output)) throw new Error('Cloudflare Worker inspect validator output appears to contain a secret.');
    if (output.includes(CLOUDFLARE_WORKER_INSPECT_CURRENT)) throw new Error('Cloudflare Worker inspect validator output leaked the evidence path.');
    const parsed = parseJson(stdout);
    if (parsed.schema !== 'enigma.cloudflare_worker_inspection_result.v1') throw new Error('Cloudflare Worker inspect validator emitted wrong schema.');
    gate.evidence = {
      schema: parsed.schema,
      status: parsed.status,
      worker_permission_ready: parsed.worker_permission_ready === true,
      observed_status: parsed.observed_status ?? null,
      cloudflare_error_code: parsed.cloudflare_error_code ?? null,
      permission_blocker_count: Array.isArray(parsed.permission_blockers) ? parsed.permission_blockers.length : null,
      account_id_redacted: parsed.checked?.account_id_redacted === true,
    };
  } catch (error) {
    gate.ok = false;
    gate.status = Number.isInteger(error.code) ? error.code : (gate.status ?? 1);
    gate.signal = error.signal ?? null;
    gate.stderr_bytes = Buffer.byteLength(error.stderr ?? '');
    gate.stdout_bytes = Buffer.byteLength(error.stdout ?? '');
    gate.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'WORKER_INSPECT_VALIDATOR_FAILED'),
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    gate.duration_ms = Date.now() - started;
  }

  return gate;
}

async function writeDependencyReportFixtureFiles(dir) {
  const goalAudit = {
    schema: 'enigma.goal_completion_audit.v1',
    complete: false,
    go_live_ready: false,
    release_posture: 'static_site_live_with_blocked_hosted_backend',
    deliverables: [
      { id: 'live-domain-current-site', ok: true, evidence: ['https://enigmamemory.com/'], blockers: [] },
      { id: 'whitepaper-math-diagrams', ok: true, evidence: ['docs/enigma-memory-technical-whitepaper.md', 'release audit gate whitepaper-claims-validator'], blockers: [] },
      { id: 'cloudflare-credentials-present', ok: false, evidence: ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'], blockers: ['CLOUDFLARE_API_TOKEN and/or CLOUDFLARE_ACCOUNT_ID absent from current environment'] },
      { id: 'hosted-backend-live', ok: false, evidence: ['npm run infrastructure:readiness'], blockers: ['hosted missing refs: 25'] },
      { id: 'operator-acceptance-go', ok: false, evidence: ['npm run production:acceptance'], blockers: ['operator acceptance decision blocked'] },
    ],
    next_actions: [
      { id: 'provision-hosted-backend', owner: 'operator', command: 'npm run infrastructure:readiness -- --manifest <completed> --live --cloudflare-live required', evidence: 'hosted refs' },
    ],
  };
  const releaseAudit = {
    schema: 'enigma.release_audit.v1',
    ok: true,
    required_failed: [],
    gates: [
      { name: 'npm-check', ok: true, required: true },
      { name: 'npm-test', ok: true, required: true },
      { name: 'whitepaper-claims-validator', ok: true, required: false },
    ],
  };
  const workerInspect = {
    schema: 'enigma.cloudflare_worker_inspection_result.v1',
    ok: true,
    worker_permission_ready: false,
    permission_blockers: ['Cloudflare Worker service visibility is blocked by token/account permission'],
  };
  const whitepaper = {
    schema: 'enigma.whitepaper_claims_result.v1',
    ok: true,
    blockers: [],
  };
  const cloudflareCredentials = {
    schema: 'enigma.cloudflare_credentials_result.v1',
    ok: false,
    credentials_present: false,
    present_keys: [],
    blockers: ['CLOUDFLARE_API_TOKEN absent from current environment', 'CLOUDFLARE_ACCOUNT_ID absent from current environment'],
    token_value_printed: false,
    account_id_printed: false,
  };
  const files = {
    goal: join(dir, 'goal-audit.json'),
    release: join(dir, 'release-audit.json'),
    worker: join(dir, 'worker-inspect.json'),
    whitepaper: join(dir, 'whitepaper.json'),
    cloudflareCredentials: join(dir, 'cloudflare-credentials.json'),
  };
  await writeFile(files.goal, `${JSON.stringify(goalAudit, null, 2)}\n`, 'utf8');
  await writeFile(files.release, `${JSON.stringify(releaseAudit, null, 2)}\n`, 'utf8');
  await writeFile(files.worker, `${JSON.stringify(workerInspect, null, 2)}\n`, 'utf8');
  await writeFile(files.whitepaper, `${JSON.stringify(whitepaper, null, 2)}\n`, 'utf8');
  await writeFile(files.cloudflareCredentials, `${JSON.stringify(cloudflareCredentials, null, 2)}\n`, 'utf8');
  return files;
}

export async function runProductionDependencyReportGate() {
  const started = Date.now();
  const tempDir = await mkdtemp(join(tmpdir(), 'enigma-dependency-report-audit-'));
  const gate = {
    name: 'production-dependency-report',
    required: false,
    command: commandLabel(process.execPath, ['scripts/build-production-dependency-report.mjs', '--goal-audit', '<goal-audit.json>', '--release-audit', '<release-audit.json>', '--worker-inspect', '<worker-inspect.json>', '--whitepaper', '<whitepaper.json>', '--cloudflare-credentials', '<cloudflare-credentials.json>']),
    ok: true,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };
  try {
    if (!(await pathExists(PRODUCTION_DEPENDENCY_REPORT_SCRIPT))) {
      gate.evidence = {
        skipped: true,
        reason: 'Production dependency report builder is absent in this local checkout.',
      };
      return gate;
    }
    const files = await writeDependencyReportFixtureFiles(tempDir);
    const { stdout, stderr } = await execFile(process.execPath, [
      'scripts/build-production-dependency-report.mjs',
      '--goal-audit',
      files.goal,
      '--release-audit',
      files.release,
      '--worker-inspect',
      files.worker,
      '--whitepaper',
      files.whitepaper,
      '--cloudflare-credentials',
      files.cloudflareCredentials,
    ], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    }).catch((error) => {
      if (Number.isInteger(error.code) && error.code === 1 && typeof error.stdout === 'string') return { stdout: error.stdout, stderr: error.stderr ?? '' };
      throw error;
    });
    gate.status = 0;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    gate.stdout_bytes = Buffer.byteLength(stdout);
    const output = `${stdout}\n${stderr}`;
    if (SECRET_LOOKING_OUTPUT.test(output)) throw new Error('Production dependency report output appears to contain a secret.');
    if (output.includes(tempDir)) throw new Error('Production dependency report output leaked a temp path.');
    const parsed = parseJson(stdout);
    if (parsed.schema !== 'enigma.production_dependency_report.v1') throw new Error('Production dependency report emitted wrong schema.');
    gate.evidence = {
      schema: parsed.schema,
      status: parsed.status,
      launch_ready: parsed.launch_ready === true,
      blocked_group_count: parsed.blocked_group_count,
      group_count: parsed.group_count,
    };
  } catch (error) {
    gate.ok = false;
    gate.status = Number.isInteger(error.code) ? error.code : (gate.status ?? 1);
    gate.signal = error.signal ?? null;
    gate.stderr_bytes = Buffer.byteLength(error.stderr ?? '');
    gate.stdout_bytes = Buffer.byteLength(error.stdout ?? '');
    gate.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'PRODUCTION_DEPENDENCY_REPORT_FAILED'),
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
    gate.duration_ms = Date.now() - started;
  }
  return gate;
}

async function writeProductionWorkplanFixtureFiles(dir) {
  const dependencyReport = {
    schema: 'enigma.production_dependency_report.v1',
    status: 'blocked',
    launch_ready: false,
    goal_complete: false,
    groups: [
      { name: 'static_site', ready: true, evidence: ['https://enigmamemory.com/', 'Enigma'], blockers: [], blocker_count: 0, next_command: 'npm run production:goal-audit -- --site <public-site-dir>' },
      { name: 'release_gates', ready: true, evidence: ['npm run check', 'npm test', 'npm run release:audit'], blockers: [], blocker_count: 0, next_command: 'npm run check && npm test && npm run release:audit -- --out .enigma/release-audit-current.json' },
      { name: 'whitepaper_claims', ready: true, evidence: ['npm run production:whitepaper'], blockers: [], blocker_count: 0, next_command: 'npm run production:whitepaper -- --out .enigma/whitepaper-claims-current.json' },
      { name: 'cloudflare_credentials', ready: false, evidence: ['npm run production:cloudflare-credentials'], blockers: ['CLOUDFLARE_API_TOKEN absent from current environment', 'CLOUDFLARE_ACCOUNT_ID absent from current environment'], blocker_count: 2, next_command: 'Inject CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID out-of-band.' },
      { name: 'cloudflare_worker_permission', ready: false, evidence: ['npm run production:worker-inspect'], blockers: ['Cloudflare Worker service visibility is blocked by token/account permission'], blocker_count: 1, next_command: 'Fix Cloudflare token/account Workers Scripts scope.' },
      { name: 'hosted_backend_live', ready: false, evidence: ['npm run infrastructure:readiness'], blockers: ['hosted_live_ready is false', 'missing refs.backend_host'], blocker_count: 2, next_command: 'Provision relay/gateway/storage/KMS/SIEM/backup refs.' },
      { name: 'operator_acceptance', ready: false, evidence: ['npm run production:acceptance'], blockers: ['operator acceptance decision blocked', 'operator blockers evidence: 30'], blocker_count: 2, next_command: 'Complete operator acceptance packet with decision go and zero blockers.' },
    ],
    next_actions: [
      { id: 'create-cloudflare-token', owner: 'operator', command: 'Create or inject CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID with least-privilege Pages access; do not paste token into chat.', evidence: 'npm run cloudflare:ops -- token verify --account-id <account-id>' },
      { id: 'provision-hosted-backend', owner: 'operator', command: 'Deploy relay/gateway using deploy/docker-compose.production.example.yml or deploy/kubernetes/enigma-backend.example.yaml.', evidence: 'npm run infrastructure:readiness -- --manifest <completed-manifest.json> --live --cloudflare-live required' },
      { id: 'generate-operator-evidence-starter', owner: 'operator-or-reviewer', command: 'npm run production:evidence-starter -- --out-dir <evidence-dir> --domain enigmamemory.com --tenant <tenant-id>', evidence: '<evidence-dir>/acceptance-fill-plan.json' },
      { id: 'complete-operator-acceptance', owner: 'operator', command: 'Complete docs/operator-acceptance-packet.md or generate a completed packet with real evidence, decision go, and zero blockers.', evidence: 'npm run production:acceptance -- --packet <completed-packet.json>' },
    ],
  };
  const operatorAcceptance = {
    schema: 'enigma.operator_acceptance_result.v1',
    ok: false,
    decision: 'blocked',
    blockers: ['operator acceptance decision blocked'],
    warnings: [],
    blocker_breakdown: { evidence: 30 },
  };
  const hostedRefCatalog = {
    schema: 'enigma.operator_hosted_ref_catalog.v1',
    refs: {
      backend_host: {
        purpose: 'Relay and gateway production deployment identity.',
        env_names: ['ENIGMA_BACKEND_HOST_REF'],
        evidence_command: 'npm run production:manifests',
        accepted_refs: ['deployment ticket'],
      },
    },
  };
  const files = {
    dependencies: join(dir, 'production-dependencies.json'),
    operatorAcceptance: join(dir, 'operator-acceptance-result.json'),
    hostedRefCatalog: join(dir, 'hosted-ref-catalog.json'),
  };
  await writeFile(files.dependencies, `${JSON.stringify(dependencyReport, null, 2)}\n`, 'utf8');
  await writeFile(files.operatorAcceptance, `${JSON.stringify(operatorAcceptance, null, 2)}\n`, 'utf8');
  await writeFile(files.hostedRefCatalog, `${JSON.stringify(hostedRefCatalog, null, 2)}\n`, 'utf8');
  return files;
}

export async function runProductionWorkplanGate() {
  const started = Date.now();
  const tempDir = await mkdtemp(join(tmpdir(), 'enigma-production-workplan-audit-'));
  const gate = {
    name: 'production-workplan',
    required: false,
    command: commandLabel(process.execPath, ['scripts/build-production-workplan.mjs', '--dependencies', '<production-dependencies.json>', '--operator-acceptance', '<operator-acceptance-result.json>', '--hosted-ref-catalog', '<hosted-ref-catalog.json>']),
    ok: true,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };
  try {
    if (!(await pathExists(PRODUCTION_WORKPLAN_SCRIPT))) {
      gate.evidence = {
        skipped: true,
        reason: 'Production workplan builder is absent in this local checkout.',
      };
      return gate;
    }
    const files = await writeProductionWorkplanFixtureFiles(tempDir);
    const { stdout, stderr, status } = await execFile(process.execPath, [
      'scripts/build-production-workplan.mjs',
      '--dependencies',
      files.dependencies,
      '--operator-acceptance',
      files.operatorAcceptance,
      '--hosted-ref-catalog',
      files.hostedRefCatalog,
    ], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    }).then((result) => ({ ...result, status: 0 })).catch((error) => {
      if (Number.isInteger(error.code) && error.code === 1 && typeof error.stdout === 'string') return { stdout: error.stdout, stderr: error.stderr ?? '', status: 1 };
      throw error;
    });
    gate.status = status;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    gate.stdout_bytes = Buffer.byteLength(stdout);
    const output = `${stdout}\n${stderr}`;
    if (SECRET_LOOKING_OUTPUT.test(output)) throw new Error('Production workplan output appears to contain a secret.');
    const parsed = parseJson(stdout);
    if (parsed.schema !== 'enigma.production_workplan.v1') throw new Error('Production workplan emitted wrong schema.');
    if (!Array.isArray(parsed.execution_order)) throw new Error('Production workplan did not emit execution_order.');
    if (parsed.execution_order.length !== parsed.phase_count) throw new Error('Production workplan execution_order length does not match phase_count.');
    if (parsed.next_phase_id !== null && !parsed.execution_order.includes(parsed.next_phase_id)) throw new Error('Production workplan next_phase_id is not in execution_order.');
    if (!Array.isArray(parsed.phases) || parsed.phases.length !== parsed.phase_count) throw new Error('Production workplan phase_count does not match phases length.');
    const phaseIds = new Set(parsed.phases.map((phase) => phase.id));
    if (phaseIds.size !== parsed.phases.length) throw new Error('Production workplan contains duplicate phase ids.');
    for (const phase of parsed.phases) {
      for (const prerequisite of phase.prerequisites ?? []) {
        if (!phaseIds.has(prerequisite)) throw new Error(`Production workplan phase ${phase.id} has unknown prerequisite ${prerequisite}.`);
      }
    }
    gate.evidence = {
      schema: parsed.schema,
      status: parsed.status,
      launch_ready: parsed.launch_ready === true,
      phase_count: parsed.phase_count,
      blocked_phase_count: parsed.blocked_phase_count,
      next_phase_id: parsed.next_phase_id,
      execution_order_count: parsed.execution_order.length,
      first_execution_phase: parsed.execution_order[0] ?? null,
      next_phase_index: parsed.next_phase_id === null ? null : parsed.execution_order.indexOf(parsed.next_phase_id),
    };
  } catch (error) {
    gate.ok = false;
    gate.status = Number.isInteger(error.code) ? error.code : (gate.status ?? 1);
    gate.signal = error.signal ?? null;
    gate.stderr_bytes = Buffer.byteLength(error.stderr ?? '');
    gate.stdout_bytes = Buffer.byteLength(error.stdout ?? '');
    gate.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'PRODUCTION_WORKPLAN_FAILED'),
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
    gate.duration_ms = Date.now() - started;
  }
  return gate;
}

async function writeProductionStatusBoardFixtureFiles(dir) {
  const files = await writeProductionWorkplanFixtureFiles(dir);
  const workplan = join(dir, 'production-workplan.json');
  const goalAudit = join(dir, 'goal-audit.json');
  const statusBoard = join(dir, 'production-status-board.json');
  await writeFile(goalAudit, `${JSON.stringify({
    schema: 'enigma.goal_completion_audit.v1',
    generated_at: '2026-06-24T00:00:00.000Z',
    complete: false,
    go_live_ready: false,
    release_posture: 'local_package_artifact_ready_with_blocked_live_infrastructure',
    deliverables: [
      { id: 'whitepaper-math-diagrams', requirement: 'whitepaper', ok: true, blockers: [] },
      { id: 'cloudflare-credentials-present', requirement: 'cloudflare credentials', ok: false, blockers: ['CLOUDFLARE_API_TOKEN absent from current environment'] },
    ],
  }, null, 2)}\n`, 'utf8');
  await execFile(process.execPath, [
    'scripts/build-production-workplan.mjs',
    '--dependencies',
    files.dependencies,
    '--operator-acceptance',
    files.operatorAcceptance,
    '--hosted-ref-catalog',
    files.hostedRefCatalog,
    '--out',
    workplan,
  ], {
    cwd: PROJECT_ROOT,
    env: localOnlyEnv(),
    timeout: COMMAND_TIMEOUT_MS,
    maxBuffer: MAX_OUTPUT_BYTES,
    windowsHide: true,
  }).catch((error) => {
    if (Number.isInteger(error.code) && error.code === 1) return error;
    throw error;
  });
  const workplanFixture = parseJson(await readFile(workplan, 'utf8'));
  const fixtureGeneratedAt = workplanFixture.generated_at ?? new Date().toISOString();
  const dependencyFixture = parseJson(await readFile(files.dependencies, 'utf8'));
  dependencyFixture.generated_at = fixtureGeneratedAt;
  await writeFile(files.dependencies, `${JSON.stringify(dependencyFixture, null, 2)}\n`, 'utf8');
  workplanFixture.evidence_inputs = {
    ...(workplanFixture.evidence_inputs ?? {}),
    dependency_generated_at: fixtureGeneratedAt,
    operator_acceptance_generated_at: fixtureGeneratedAt,
    hosted_ref_catalog_generated_at: fixtureGeneratedAt,
  };
  await writeFile(workplan, `${JSON.stringify(workplanFixture, null, 2)}\n`, 'utf8');
  await writeFile(goalAudit, `${JSON.stringify({
    schema: 'enigma.goal_completion_audit.v1',
    generated_at: fixtureGeneratedAt,
    complete: false,
    go_live_ready: false,
    release_posture: 'local_package_artifact_ready_with_blocked_live_infrastructure',
    deliverables: [
      { id: 'whitepaper-math-diagrams', requirement: 'whitepaper', ok: true, blockers: [] },
      { id: 'cloudflare-credentials-present', requirement: 'cloudflare credentials', ok: false, blockers: ['CLOUDFLARE_API_TOKEN absent from current environment'] },
    ],
  }, null, 2)}\n`, 'utf8');
  const { stdout } = await execFile(process.execPath, [
    'scripts/build-production-status-board.mjs',
    '--goal-audit',
    goalAudit,
    '--dependencies',
    files.dependencies,
    '--workplan',
    workplan,
  ], {
    cwd: PROJECT_ROOT,
    env: localOnlyEnv(),
    timeout: COMMAND_TIMEOUT_MS,
    maxBuffer: MAX_OUTPUT_BYTES,
    windowsHide: true,
  }).catch((error) => {
    if (Number.isInteger(error.code) && error.code === 1 && typeof error.stdout === 'string') return { stdout: error.stdout };
    throw error;
  });
  parseJson(stdout);
  await writeFile(statusBoard, stdout, 'utf8');
  return { ...files, workplan, goalAudit, statusBoard };
}

export async function runProductionStatusBoardGate() {
  const started = Date.now();
  const tempDir = await mkdtemp(join(tmpdir(), 'enigma-production-status-audit-'));
  const gate = {
    name: 'production-status-board',
    required: false,
    command: commandLabel(process.execPath, ['scripts/build-production-status-board.mjs', '--goal-audit', '<goal-audit.json>', '--dependencies', '<production-dependencies.json>', '--workplan', '<production-workplan.json>']),
    ok: true,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };
  try {
    if (!(await pathExists(PRODUCTION_STATUS_BOARD_SCRIPT))) {
      gate.evidence = {
        skipped: true,
        reason: 'Production status board builder is absent in this local checkout.',
      };
      return gate;
    }
    const files = await writeProductionWorkplanFixtureFiles(tempDir);
    const workplan = join(tempDir, 'production-workplan.json');
    const goalAudit = join(tempDir, 'goal-audit.json');
    await writeFile(goalAudit, `${JSON.stringify({
      schema: 'enigma.goal_completion_audit.v1',
      generated_at: '2026-06-24T00:00:00.000Z',
      complete: false,
      go_live_ready: false,
      release_posture: 'local_package_artifact_ready_with_blocked_live_infrastructure',
      deliverables: [
        { id: 'whitepaper-math-diagrams', requirement: 'whitepaper', ok: true, blockers: [] },
        { id: 'cloudflare-credentials-present', requirement: 'cloudflare credentials', ok: false, blockers: ['CLOUDFLARE_API_TOKEN absent from current environment'] },
      ],
    }, null, 2)}\n`, 'utf8');
    await execFile(process.execPath, [
      'scripts/build-production-workplan.mjs',
      '--dependencies',
      files.dependencies,
      '--operator-acceptance',
      files.operatorAcceptance,
      '--hosted-ref-catalog',
      files.hostedRefCatalog,
      '--out',
      workplan,
    ], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    }).catch((error) => {
      if (Number.isInteger(error.code) && error.code === 1) return error;
      throw error;
    });
    const workplanFixture = parseJson(await readFile(workplan, 'utf8'));
    const fixtureGeneratedAt = workplanFixture.generated_at ?? new Date().toISOString();
    const dependencyFixture = parseJson(await readFile(files.dependencies, 'utf8'));
    dependencyFixture.generated_at = fixtureGeneratedAt;
    await writeFile(files.dependencies, `${JSON.stringify(dependencyFixture, null, 2)}\n`, 'utf8');
    workplanFixture.evidence_inputs = {
      ...(workplanFixture.evidence_inputs ?? {}),
      dependency_generated_at: fixtureGeneratedAt,
      operator_acceptance_generated_at: fixtureGeneratedAt,
      hosted_ref_catalog_generated_at: fixtureGeneratedAt,
    };
    await writeFile(workplan, `${JSON.stringify(workplanFixture, null, 2)}\n`, 'utf8');
    await writeFile(goalAudit, `${JSON.stringify({
      schema: 'enigma.goal_completion_audit.v1',
      generated_at: fixtureGeneratedAt,
      complete: false,
      go_live_ready: false,
      release_posture: 'local_package_artifact_ready_with_blocked_live_infrastructure',
      deliverables: [
        { id: 'whitepaper-math-diagrams', requirement: 'whitepaper', ok: true, blockers: [] },
        { id: 'cloudflare-credentials-present', requirement: 'cloudflare credentials', ok: false, blockers: ['CLOUDFLARE_API_TOKEN absent from current environment'] },
      ],
    }, null, 2)}\n`, 'utf8');
    const { stdout, stderr, status } = await execFile(process.execPath, [
      'scripts/build-production-status-board.mjs',
      '--goal-audit',
      goalAudit,
      '--dependencies',
      files.dependencies,
      '--workplan',
      workplan,
    ], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    }).then((result) => ({ ...result, status: 0 })).catch((error) => {
      if (Number.isInteger(error.code) && error.code === 1 && typeof error.stdout === 'string') return { stdout: error.stdout, stderr: error.stderr ?? '', status: 1 };
      throw error;
    });
    gate.status = status;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    gate.stdout_bytes = Buffer.byteLength(stdout);
    const output = `${stdout}\n${stderr}`;
    if (SECRET_LOOKING_OUTPUT.test(output)) throw new Error('Production status board output appears to contain a secret.');
    const parsed = parseJson(stdout);
    if (parsed.schema !== 'enigma.production_status_board.v1') throw new Error('Production status board emitted wrong schema.');
    if (parsed.next_phase?.id !== parsed.next_phase_id) throw new Error('Production status board next phase mismatch.');
    if (parsed.execution_order_check?.covers_all_phases !== true) throw new Error('Production status board execution order does not cover all phases.');
    if (parsed.input_freshness?.stale !== false) throw new Error('Production status board fixture inputs should be fresh.');
    gate.evidence = {
      schema: parsed.schema,
      status: parsed.status,
      launch_ready: parsed.launch_ready === true,
      local_package_ready: parsed.local_package_ready === true,
      blocked_group_count: parsed.blocked_group_count,
      blocked_phase_count: parsed.blocked_phase_count,
      next_phase_id: parsed.next_phase_id,
      external_blocker_count: Array.isArray(parsed.external_blockers) ? parsed.external_blockers.length : null,
      execution_order_covers_all_phases: parsed.execution_order_check?.covers_all_phases === true,
      input_freshness_stale: parsed.input_freshness?.stale === true,
      input_freshness_max_skew_seconds: parsed.input_freshness?.max_skew_seconds ?? null,
      input_freshness_latest_age_seconds: parsed.input_freshness?.latest_age_seconds ?? null,
    };
  } catch (error) {
    gate.ok = false;
    gate.status = Number.isInteger(error.code) ? error.code : (gate.status ?? 1);
    gate.signal = error.signal ?? null;
    gate.stderr_bytes = Buffer.byteLength(error.stderr ?? '');
    gate.stdout_bytes = Buffer.byteLength(error.stdout ?? '');
    gate.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'PRODUCTION_STATUS_BOARD_FAILED'),
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
    gate.duration_ms = Date.now() - started;
  }
  return gate;
}

export async function runAiOrchestrationPlanGate() {
  const started = Date.now();
  const tempDir = await mkdtemp(join(tmpdir(), 'enigma-ai-orchestration-audit-'));
  const gate = {
    name: 'ai-orchestration-plan',
    required: false,
    command: commandLabel(process.execPath, ['scripts/build-ai-orchestration-plan.mjs', '--status-board', '<production-status-board.json>']),
    ok: true,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };
  try {
    if (!(await pathExists(PRODUCTION_WORKPLAN_SCRIPT)) || !(await pathExists(PRODUCTION_STATUS_BOARD_SCRIPT)) || !(await pathExists(AI_ORCHESTRATION_PLAN_SCRIPT))) {
      gate.evidence = {
        skipped: true,
        reason: 'AI orchestration plan builder or its production fixture builders are absent in this local checkout.',
      };
      return gate;
    }
    const files = await writeProductionStatusBoardFixtureFiles(tempDir);
    const statusBoard = parseJson(await readFile(files.statusBoard, 'utf8'));
    if (statusBoard.schema !== 'enigma.production_status_board.v1') throw new Error('AI orchestration fixture status board emitted wrong schema.');
    if (statusBoard.fresh_input_evidence !== true || statusBoard.input_freshness?.stale !== false) throw new Error('AI orchestration fixture status board must provide fresh input evidence.');
    if (statusBoard.launch_ready === true) throw new Error('AI orchestration fixture status board must remain blocked.');
    const { stdout, stderr, status } = await execFile(process.execPath, [
      'scripts/build-ai-orchestration-plan.mjs',
      '--status-board',
      files.statusBoard,
    ], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    }).then((result) => ({ ...result, status: 0 })).catch((error) => {
      if (Number.isInteger(error.code) && error.code === 1 && typeof error.stdout === 'string') return { stdout: error.stdout, stderr: error.stderr ?? '', status: 1 };
      throw error;
    });
    gate.status = status;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    gate.stdout_bytes = Buffer.byteLength(stdout);
    if (status !== 1) throw new Error('AI orchestration plan blocked fixture must exit with status 1.');
    const output = `${stdout}\n${stderr}`;
    const tempPathNeedles = [tempDir, tempDir.replaceAll('\\', '\\\\'), tempDir.replaceAll('\\', '/')];
    if (tempPathNeedles.some((needle) => output.toLowerCase().includes(needle.toLowerCase()))) throw new Error('AI orchestration plan output leaked a temporary fixture path.');
    if (SECRET_LOOKING_OUTPUT.test(output)) throw new Error('AI orchestration plan output appears to contain a secret.');
    if (output.includes(RAW_MEMORY_SENTINEL)) throw new Error('AI orchestration plan output leaked raw memory sentinel text.');
    const parsed = parseJson(stdout);
    if (parsed.schema !== AI_ORCHESTRATION_PLAN_SCHEMA) throw new Error('AI orchestration plan emitted wrong schema.');
    if (parsed.status !== 'blocked' || parsed.launch_ready !== false) throw new Error('AI orchestration plan must remain blocked while status board launch_ready is false.');
    if (parsed.source_status_fresh_input_evidence !== true) throw new Error('AI orchestration plan must preserve fresh source status evidence.');
    if (parsed.source_status_board_generated_at !== statusBoard.generated_at) throw new Error('AI orchestration plan source timestamp must match the fixture status board.');
    if (!Array.isArray(parsed.lanes) || parsed.lanes.length !== parsed.role_lane_count || parsed.role_lane_count < 5) throw new Error('AI orchestration plan role_lane_count does not match lanes.');
    if (!Array.isArray(parsed.waves) || parsed.waves.length !== parsed.wave_count || parsed.wave_count !== 4) throw new Error('AI orchestration plan wave_count does not match waves.');
    const laneIds = new Set(parsed.lanes.map((lane) => lane?.id));
    if (!laneIds.has('kimi_coding') || !laneIds.has('gpt55_architecture') || !laneIds.has('gpt55_review')) throw new Error('AI orchestration plan must include Kimi and GPT lane names.');
    const controlText = Array.isArray(parsed.non_delegable_controls) ? parsed.non_delegable_controls.join('\n') : '';
    if (!/Cloudflare token values/i.test(controlText) || !/human-controlled/i.test(controlText) || !/No AI lane may mark the goal complete/i.test(controlText)) throw new Error('AI orchestration plan must preserve non-delegable human control boundaries.');
    const claimBoundary = requireJsonField(
      parsed,
      ['claim_boundary'],
      (value) => Array.isArray(value) && value.length >= 3 && value.every((item) => typeof item === 'string'),
      'AI orchestration plan must emit claim_boundary strings.',
    );
    const claimText = claimBoundary.join('\n');
    if (!/does not invoke external AI systems/i.test(claimText) || !/not proof that an external model/i.test(claimText) || !/Launch readiness remains false/i.test(claimText)) throw new Error('AI orchestration plan claim boundary must prevent overclaiming launch readiness or model execution.');
    gate.evidence = {
      schema: parsed.schema,
      status: parsed.status,
      launch_ready: parsed.launch_ready === true,
      source_status_fresh_input_evidence: parsed.source_status_fresh_input_evidence === true,
      source_status_board_generated_at: parsed.source_status_board_generated_at,
      role_lane_count: parsed.role_lane_count,
      wave_count: parsed.wave_count,
      kimi_lane_present: laneIds.has('kimi_coding'),
      gpt_architecture_lane_present: laneIds.has('gpt55_architecture'),
      gpt_review_lane_present: laneIds.has('gpt55_review'),
      non_delegable_control_count: Array.isArray(parsed.non_delegable_controls) ? parsed.non_delegable_controls.length : null,
      claim_boundary_count: claimBoundary.length,
      temp_path_leaked: false,
    };
  } catch (error) {
    gate.ok = false;
    gate.status = Number.isInteger(error.code) ? error.code : (gate.status ?? 1);
    gate.signal = error.signal ?? null;
    gate.stderr_bytes = Buffer.byteLength(error.stderr ?? '');
    gate.stdout_bytes = Buffer.byteLength(error.stdout ?? '');
    const tempPathNeedles = [tempDir, tempDir.replaceAll('\\', '\\\\'), tempDir.replaceAll('\\', '/')];
    let message = scrubLocalPathText(error instanceof Error ? error.message : String(error));
    for (const needle of tempPathNeedles) message = replaceInsensitive(message, needle, '<temp-fixture>');
    if (SECRET_LOOKING_OUTPUT.test(message)) message = 'AI orchestration plan failed with secret-looking output redacted.';
    if (message.includes(RAW_MEMORY_SENTINEL)) message = 'AI orchestration plan failed with raw-memory sentinel output redacted.';
    gate.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'AI_ORCHESTRATION_PLAN_FAILED'),
      message,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
    gate.duration_ms = Date.now() - started;
  }
  return gate;
}

function validateCloudflareOpsHelp(stdout) {
  const text = String(stdout);
  if (!text.startsWith('Usage: node scripts/cloudflare-ops.mjs <command> [options]')) throw new Error('Cloudflare ops help is missing its usage line.');
  if (!/registrar register --domain <domain>/i.test(text)) throw new Error('Cloudflare ops help must document registrar registration.');
  if (!/pages deploy --site <dir> --project-name <name>/i.test(text)) throw new Error('Cloudflare ops help must document Pages deploy planning.');
  if (!/pages verify\b/i.test(text)) throw new Error('Cloudflare ops help must document Pages verification.');
  if (!/workers deploy-probe --script <worker\.mjs>/i.test(text)) throw new Error('Cloudflare ops help must document Worker probe deploy planning.');
  if (!/workers inspect-probe\b/i.test(text)) throw new Error('Cloudflare ops help must document Worker probe permission inspection.');
  if (!/workers verify-probe --url <https-url>/i.test(text)) throw new Error('Cloudflare ops help must document Worker probe verification.');
  if (!/dry-run plans unless --execute is provided/i.test(text)) throw new Error('Cloudflare ops help must state billable/deploy operations are dry-run by default.');
  if (!/--i-understand-this-charges-my-payment-method/.test(text)) throw new Error('Cloudflare ops help must document the billable registration charge acknowledgement flag.');
  if (!/token is never printed/i.test(text)) throw new Error('Cloudflare ops help must state Cloudflare tokens are never printed.');
  if (/Authorization:\s*Bearer\s+\S+/i.test(text)) throw new Error('Cloudflare ops help must not include bearer token examples.');
  return {
    usage: true,
    registrar_register_documented: true,
    pages_deploy_documented: true,
    pages_verify_documented: true,
    workers_deploy_probe_documented: true,
    workers_inspect_probe_documented: true,
    workers_verify_probe_documented: true,
    dry_run_default_documented: true,
    charge_acknowledgement_documented: true,
    token_not_printed_documented: true,
  };
}

function checkValues(checks) {
  if (Array.isArray(checks)) return checks;
  if (checks && typeof checks === 'object') return Object.values(checks);
  return [];
}

function checkOk(check) {
  if (!check || typeof check !== 'object') return false;
  return check.ok === true || check.passed === true || check.status === 'ok';
}

function isLiveCheck(check) {
  if (!check || typeof check !== 'object') return false;
  if (check.live === true || check.live_requested === true || check.requested_live === true) return true;
  const name = `${check.name ?? ''} ${check.id ?? ''} ${check.kind ?? ''}`;
  return /\blive\b/i.test(name);
}

function requestedLiveChecksPass(checks) {
  const liveChecks = checkValues(checks).filter(isLiveCheck);
  return liveChecks.length > 0 && liveChecks.every(checkOk);
}

function credentialsUsedEmpty(value) {
  if (value === false || value == null) return true;
  if (Array.isArray(value)) return value.length === 0 || value.every(credentialsUsedEmpty);
  if (value && typeof value === 'object') return Object.values(value).every(credentialsUsedEmpty);
  return false;
}

function checkName(check) {
  return `${check?.name ?? ''} ${check?.id ?? ''} ${check?.kind ?? ''}`;
}

function operatorAcceptanceDecision(json) {
  const rawChecks = json.checks && typeof json.checks === 'object' ? json.checks : {};
  const checks = checkValues(rawChecks);
  const operatorCheck = checks.find((check) => /\boperator_acceptance(?:\.decision)?\b/i.test(checkName(check)) || check?.operator_acceptance?.decision !== undefined);
  return json.operator_acceptance?.decision
    ?? json.operator_acceptance_decision
    ?? json.readiness?.operator_acceptance?.decision
    ?? json.readiness?.operator_acceptance_decision
    ?? rawChecks.operator_acceptance?.decision
    ?? rawChecks.operator?.decision
    ?? operatorCheck?.decision
    ?? operatorCheck?.value
    ?? operatorCheck?.details?.decision
    ?? operatorCheck?.details?.operator_acceptance?.decision
    ?? operatorCheck?.operator_acceptance?.decision
    ?? null;
}

function claimBoundaryText(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.join(' ');
  return '';
}

export function validateInfrastructureReadiness(json, stdout, stderr, liveRequested) {
  const output = `${stdout}\n${stderr}`;
  if (SECRET_LOOKING_OUTPUT.test(output)) throw new Error('Infrastructure readiness output appears to contain a secret.');
  requireJsonField(json, ['schema'], (value) => value === INFRASTRUCTURE_READINESS_SCHEMA, 'Infrastructure readiness schema mismatch.');
  requireJsonField(json, ['ok'], (value) => typeof value === 'boolean', 'Infrastructure readiness ok must be a boolean.');
  requireJsonField(json, ['generated_at'], (value) => typeof value === 'string' && !Number.isNaN(Date.parse(value)), 'Infrastructure readiness generated_at must be an ISO timestamp.');
  requireJsonField(json, ['mode'], (value) => typeof value === 'string' && value.length > 0, 'Infrastructure readiness mode is required.');
  requireJsonField(json, ['credentials_required'], (value) => value === false, 'Infrastructure readiness must not require credentials.');
  requireJsonField(json, ['credentials_used'], credentialsUsedEmpty, 'Infrastructure readiness must not use credentials in release audit.');
  const readiness = requireJsonField(json, ['readiness'], (value) => value && typeof value === 'object' && !Array.isArray(value), 'Infrastructure readiness must include readiness object.');
  for (const field of ['contract_ready', 'public_live_ready', 'cloudflare_observed', 'hosted_live_ready']) {
    if (typeof readiness[field] !== 'boolean') throw new Error(`Infrastructure readiness.${field} must be a boolean.`);
  }
  const checks = requireJsonField(json, ['checks'], (value) => value && typeof value === 'object', 'Infrastructure readiness checks must be present.');
  const externalBlockers = requireJsonField(json, ['external_blockers'], Array.isArray, 'Infrastructure readiness external_blockers must be an array.');
  const claimBoundary = requireJsonField(
    json,
    ['claim_boundary'],
    (value) => (typeof value === 'string' && value.length > 0) || (Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string' && item.length > 0)),
    'Infrastructure readiness claim_boundary is required.'
  );
  const claimBoundaryAssertion = claimBoundaryText(claimBoundary);
  if (!/(?:not|no|without|does\s+not|never)\b/i.test(claimBoundaryAssertion) || !/(?:hosted|byoc|relay|gateway|kms|storage|siem|backup|operator|token|credential)/i.test(claimBoundaryAssertion)) {
    throw new Error('Infrastructure readiness claim_boundary must bound hosted/BYOC/token readiness claims.');
  }
  if (readiness.hosted_live_ready === true) {
    if (!liveRequested) throw new Error('Infrastructure readiness must not report hosted_live_ready without an explicit live request.');
    if (readiness.contract_ready !== true) throw new Error('Infrastructure readiness hosted_live_ready requires contract_ready.');
    if (!requestedLiveChecksPass(checks)) throw new Error('Infrastructure readiness hosted_live_ready requires requested live checks to pass.');
    if (String(operatorAcceptanceDecision(json)).toLowerCase() !== 'go') throw new Error('Infrastructure readiness hosted_live_ready requires operator acceptance decision go.');
    if (externalBlockers.length !== 0) throw new Error('Infrastructure readiness hosted_live_ready requires no external blockers.');
  }
  const hostedRequiredRefsCheck = checkValues(checks).find((check) => check.name === 'hosted.required_refs') ?? {};
  return {
    schema: json.schema,
    ok: json.ok,
    mode: json.mode,
    credentials_required: json.credentials_required,
    credentials_used: json.credentials_used,
    readiness: {
      contract_ready: readiness.contract_ready,
      public_live_ready: readiness.public_live_ready,
      cloudflare_observed: readiness.cloudflare_observed,
      hosted_live_ready: readiness.hosted_live_ready,
    },
    check_count: checkValues(checks).length,
    hosted_required_ref_count: hostedRequiredRefsCheck.required_count ?? null,
    hosted_required_ref_missing_count: hostedRequiredRefsCheck.missing_count ?? null,
    external_blocker_count: externalBlockers.length,
    claim_boundary: claimBoundary,
  };
}

export function validateMemoryOptimizationBenchmark(json, stdout, stderr) {
  const output = `${stdout}\n${stderr}`;
  if (SECRET_LOOKING_OUTPUT.test(output)) throw new Error('Memory optimization benchmark output appears to contain a secret.');
  if (/"content_hash"\s*:/i.test(output)) throw new Error('Memory optimization benchmark public output must redact content_hash fields.');
  requireJsonField(json, ['schema'], (value) => value === MEMORY_OPTIMIZATION_BENCHMARK_SCHEMA, 'Memory optimization benchmark schema mismatch.');
  const corpus = requireJsonField(json, ['corpus'], (value) => value && typeof value === 'object' && !Array.isArray(value), 'Memory optimization benchmark corpus is required.');
  requireJsonField(corpus, ['public_candidate_text_included'], (value) => value === false, 'Memory optimization benchmark must not include private candidate text.');
  const method = requireJsonField(json, ['method'], (value) => value && typeof value === 'object' && !Array.isArray(value), 'Memory optimization benchmark method is required.');
  const claimBoundary = requireJsonField(method, ['claim_boundary'], (value) => Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string'), 'Memory optimization benchmark claim_boundary is required.');
  const claimText = claimBoundary.join(' ');
  if (!/fixture benchmark/i.test(claimText) || !/not provider invoice savings/i.test(claimText) || !/No external-deletion/i.test(claimText)) {
    throw new Error('Memory optimization benchmark claim_boundary must bound savings and external-system claims.');
  }
  const result = requireJsonField(json, ['result'], (value) => value && typeof value === 'object' && !Array.isArray(value), 'Memory optimization benchmark result is required.');
  for (const field of ['baseline_prompt_tokens', 'optimized_prompt_tokens', 'savings_pct', 'duplicate_candidates_removed']) {
    if (typeof result[field] !== 'number' || !Number.isFinite(result[field])) throw new Error(`Memory optimization benchmark result.${field} must be numeric.`);
  }
  if (result.optimized_prompt_tokens > result.baseline_prompt_tokens) throw new Error('Memory optimization benchmark optimized tokens must not exceed baseline tokens.');
  if (/\b\d{1,2}(?:\.\d+)?%\s+(?:discount|cheaper|cost\s+reduction)\b/i.test(output)) {
    throw new Error('Memory optimization benchmark must not emit fixed marketing discount claims.');
  }
  return {
    schema: json.schema,
    corpus: corpus.name,
    baseline_prompt_tokens: result.baseline_prompt_tokens,
    optimized_prompt_tokens: result.optimized_prompt_tokens,
    savings_pct: result.savings_pct,
    duplicate_candidates_removed: result.duplicate_candidates_removed,
    claim_boundary: claimBoundary,
  };
}

export async function runMemoryOptimizationBenchmarkGate() {
  const started = Date.now();
  const gate = {
    name: 'memory-optimization-benchmark',
    required: false,
    command: commandLabel(process.execPath, ['scripts/memory-optimization-benchmark.mjs']),
    ok: true,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };

  try {
    if (!(await pathExists(MEMORY_OPTIMIZATION_BENCHMARK_SCRIPT))) {
      gate.evidence = {
        skipped: true,
        reason: 'Memory optimization benchmark helper is absent in this local checkout.',
        script: MEMORY_OPTIMIZATION_BENCHMARK_SCRIPT,
      };
      return gate;
    }
    const { stdout, stderr } = await execFile(process.execPath, ['scripts/memory-optimization-benchmark.mjs'], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    gate.status = 0;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    gate.stdout_bytes = Buffer.byteLength(stdout);
    gate.evidence = validateMemoryOptimizationBenchmark(parseJson(stdout), stdout, stderr);
    gate.ok = true;
  } catch (error) {
    gate.ok = false;
    gate.status = Number.isInteger(error.code) ? error.code : (gate.status ?? 1);
    gate.signal = error.signal ?? null;
    gate.stderr_bytes = Buffer.byteLength(error.stderr ?? '');
    gate.stdout_bytes = Buffer.byteLength(error.stdout ?? '');
    gate.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'MEMORY_OPTIMIZATION_BENCHMARK_FAILED'),
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    gate.duration_ms = Date.now() - started;
  }

  return gate;
}

function productionReadinessManifestFixtureArgs() {
  return [
    '--mode',
    'hosted-live',
    '--public-site-url',
    'https://enigmamemory.com/',
    '--relay-url',
    'https://relay.enigmamemory.com/readyz',
    '--gateway-url',
    'https://gateway.enigmamemory.com/readyz',
    '--relay-ref',
    'relay-release-audit#local',
    '--gateway-ref',
    'gateway-release-audit#local',
    '--backend-host-ref',
    'backend-host-release-audit#local',
    '--dns-tls-ref',
    'dns-tls-release-audit#local',
    '--durable-storage-ref',
    'storage-release-audit#local',
    '--kms-ref',
    'kms-release-audit#local',
    '--backup-ref',
    'backup-release-audit#local',
    '--monitoring-ref',
    'monitoring-release-audit#local',
    '--siem-ref',
    'siem-release-audit#local',
    '--runtime-auth-ref',
    'runtime-auth-release-audit#local',
    '--admin-auth-ref',
    'admin-auth-release-audit#local',
    '--data-plane-auth-ref',
    'data-plane-auth-release-audit#local',
    '--operator-acceptance-ref',
    'operator-release-audit#local',
    '--network-access-policy-ref',
    'network-policy-release-audit#local',
    '--kms-custody-ref',
    'kms-custody-release-audit#local',
    '--tenant-policy-approval-ref',
    'tenant-policy-release-audit#local',
    '--usage-metering-ref',
    'usage-metering-release-audit#local',
    '--service-settlement-ref',
    'service-settlement-release-audit#local',
    '--monitoring-alerting-ref',
    'monitoring-alerting-release-audit#local',
    '--public-site-security-ref',
    'public-site-security-release-audit#local',
    '--security-threat-model-ref',
    'security-threat-model-release-audit#local',
    '--legal-compliance-ref',
    'legal-compliance-release-audit#local',
    '--support-sla-ref',
    'support-sla-release-audit#local',
    '--incident-drill-ref',
    'incident-drill-release-audit#local',
    '--backup-restore-drill-ref',
    'backup-restore-drill-release-audit#local',
    '--operator-decision',
    'go',
  ];
}

export async function runProductionManifestBuilderGate() {
  const started = Date.now();
  const gate = {
    name: 'production-readiness-manifest-builder',
    required: false,
    command: commandLabel(process.execPath, ['scripts/build-production-readiness-manifest.mjs']),
    ok: true,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };

  try {
    if (!(await pathExists(PRODUCTION_READINESS_MANIFEST_BUILDER_SCRIPT))) {
      gate.evidence = {
        skipped: true,
        reason: 'Production readiness manifest builder is absent in this local checkout.',
        script: PRODUCTION_READINESS_MANIFEST_BUILDER_SCRIPT,
      };
      return gate;
    }
    const { stdout, stderr } = await execFile(process.execPath, [
      'scripts/build-production-readiness-manifest.mjs',
      ...productionReadinessManifestFixtureArgs(),
    ], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    gate.status = 0;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    gate.stdout_bytes = Buffer.byteLength(stdout);
    const manifest = parseJson(stdout);
    if (manifest.schema !== 'enigma.infrastructure_readiness_manifest.v1') throw new Error('Production manifest builder emitted wrong schema.');
    if (!manifest.refs || manifest.refs.backend_host !== 'backend-host-release-audit#local') throw new Error('Production manifest builder omitted backend_host ref.');
    if (!manifest.refs.admin_auth || !manifest.refs.data_plane_auth) throw new Error('Production manifest builder omitted private auth refs.');
    if (!manifest.refs.security_threat_model) throw new Error('Production manifest builder omitted security_threat_model ref.');
    if (Array.isArray(manifest.external_blockers) && manifest.external_blockers.length !== 0) throw new Error('Production manifest builder complete fixture must not emit blockers.');
    const output = `${stdout}\n${stderr}`;
    if (SECRET_LOOKING_OUTPUT.test(output)) throw new Error('Production manifest builder output appears to contain a secret.');
    gate.evidence = {
      schema: manifest.schema,
      mode: manifest.mode,
      ref_count: Object.keys(manifest.refs ?? {}).length,
      operator_decision: manifest.operator_acceptance?.decision,
      blockers: manifest.external_blockers?.length ?? null,
    };
    gate.ok = true;
  } catch (error) {
    gate.ok = false;
    gate.status = Number.isInteger(error.code) ? error.code : (gate.status ?? 1);
    gate.signal = error.signal ?? null;
    gate.stderr_bytes = Buffer.byteLength(error.stderr ?? '');
    gate.stdout_bytes = Buffer.byteLength(error.stdout ?? '');
    gate.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'PRODUCTION_MANIFEST_BUILDER_FAILED'),
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    gate.duration_ms = Date.now() - started;
  }

  return gate;
}

export async function runProductionStorageMigrationGate() {
  const started = Date.now();
  const gate = {
    name: 'production-storage-migration',
    required: false,
    command: commandLabel(process.execPath, ['scripts/build-production-storage-migration.mjs']),
    ok: true,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };

  try {
    if (!(await pathExists(PRODUCTION_STORAGE_MIGRATION_SCRIPT))) {
      gate.evidence = {
        skipped: true,
        reason: 'Production storage migration builder is absent in this local checkout.',
        script: PRODUCTION_STORAGE_MIGRATION_SCRIPT,
      };
      return gate;
    }
    const { stdout, stderr } = await execFile(process.execPath, [
      'scripts/build-production-storage-migration.mjs',
      '--schema',
      'enigma_release_audit',
      '--migration-id',
      '001_release_audit_storage',
    ], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    gate.status = 0;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    gate.stdout_bytes = Buffer.byteLength(stdout);
    const artifact = parseJson(stdout);
    if (artifact.schema !== 'enigma.production_storage_migration_artifact.v1') throw new Error('Production storage migration emitted wrong schema.');
    if (artifact.contract?.engine !== 'postgres') throw new Error('Production storage migration must target postgres.');
    if (!Array.isArray(artifact.contract?.tables) || artifact.contract.tables.length < 8) throw new Error('Production storage migration omitted expected tables.');
    if (!/CREATE TABLE IF NOT EXISTS "enigma_release_audit"\."relay_records"/.test(artifact.migration?.sql ?? '')) throw new Error('Production storage migration omitted relay_records SQL.');
    if (SECRET_LOOKING_OUTPUT.test(`${stdout}\n${stderr}`)) throw new Error('Production storage migration output appears to contain a secret.');
    gate.evidence = {
      schema: artifact.schema,
      engine: artifact.contract.engine,
      table_count: artifact.contract.tables.length,
      migration_id: artifact.migration.migration_id,
    };
    gate.ok = true;
  } catch (error) {
    gate.ok = false;
    gate.status = Number.isInteger(error.code) ? error.code : (gate.status ?? 1);
    gate.signal = error.signal ?? null;
    gate.stderr_bytes = Buffer.byteLength(error.stderr ?? '');
    gate.stdout_bytes = Buffer.byteLength(error.stdout ?? '');
    gate.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'PRODUCTION_STORAGE_MIGRATION_FAILED'),
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    gate.duration_ms = Date.now() - started;
  }

  return gate;
}

export async function runOperatorAcceptanceValidatorGate() {
  const started = Date.now();
  const tempDir = await mkdtemp(join(tmpdir(), 'enigma-operator-acceptance-audit-'));
  const packetPath = join(tempDir, 'blocked-packet.json');
  const gate = {
    name: 'operator-acceptance-validator',
    required: false,
    command: commandLabel(process.execPath, ['scripts/validate-operator-acceptance.mjs', '--packet', '<blocked-packet.json>']),
    ok: true,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };

  try {
    if (!(await pathExists(OPERATOR_ACCEPTANCE_VALIDATOR_SCRIPT))) {
      gate.evidence = {
        skipped: true,
        reason: 'Operator acceptance validator is absent in this local checkout.',
        script: OPERATOR_ACCEPTANCE_VALIDATOR_SCRIPT,
      };
      return gate;
    }
    await writeFile(packetPath, `${JSON.stringify({
      schema: 'enigma.operator_acceptance_packet.v1',
      metadata: {
        packet_id: 'release-audit-blocked-fixture',
        customer_or_tenant: 'fixture',
        deployment_mode: 'hosted',
        environment: 'production',
        target_regions: 'us-east-1',
        requested_go_live_date: '2026-06-23',
        evidence_repository: 'ticket://release-audit/operator-acceptance',
        packet_owner: 'operator',
        last_updated: '2026-06-23T12:00:00.000Z',
        decision: 'blocked',
      },
      owners: {},
      evidence: {},
      readiness: {
        schema: 'enigma.infrastructure_readiness.v1',
        ok: false,
        readiness: { hosted_live_ready: false },
        external_blockers: ['release audit fixture is intentionally blocked'],
      },
      manifest: {
        schema: 'enigma.infrastructure_readiness_manifest.v1',
        operator_acceptance: { decision: 'blocked' },
        external_blockers: ['release audit fixture is intentionally blocked'],
      },
      storage: {
        schema: 'enigma.production_storage_migration_artifact.v1',
        contract: { engine: 'postgres', tables: [] },
      },
      release_audit: {
        schema: 'enigma.release_audit.v1',
        ok: true,
        required_failed: [],
      },
    }, null, 2)}\n`, 'utf8');
    const result = await execFile(process.execPath, ['scripts/validate-operator-acceptance.mjs', '--packet', packetPath], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    }).catch((error) => error);
    const stdout = result.stdout ?? '';
    const stderr = result.stderr ?? '';
    gate.status = Number.isInteger(result.code) ? result.code : 0;
    gate.signal = result.signal ?? null;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    gate.stdout_bytes = Buffer.byteLength(stdout);
    const output = `${stdout}\n${stderr}`;
    if (SECRET_LOOKING_OUTPUT.test(output)) throw new Error('Operator acceptance validator output appears to contain a secret.');
    const parsed = parseJson(stdout);
    if (parsed.schema !== 'enigma.operator_acceptance_result.v1') throw new Error('Operator acceptance validator emitted wrong schema.');
    if (parsed.ok !== false || parsed.decision !== 'blocked') throw new Error('Operator acceptance validator blocked fixture must remain blocked.');
    if (!Array.isArray(parsed.blockers) || parsed.blockers.length === 0) throw new Error('Operator acceptance validator must report blockers for incomplete fixture.');
    gate.ok = gate.status === 1;
    gate.evidence = {
      schema: parsed.schema,
      decision: parsed.decision,
      blocker_count: parsed.blockers.length,
      blocked_exit_status: gate.status,
    };
  } catch (error) {
    gate.ok = false;
    gate.status = Number.isInteger(error.code) ? error.code : (gate.status ?? 1);
    gate.signal = error.signal ?? null;
    gate.stderr_bytes = Buffer.byteLength(error.stderr ?? '');
    gate.stdout_bytes = Buffer.byteLength(error.stdout ?? '');
    gate.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'OPERATOR_ACCEPTANCE_VALIDATOR_FAILED'),
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    gate.duration_ms = Date.now() - started;
    await rm(tempDir, { recursive: true, force: true });
  }

  return gate;
}

export async function runBackupRestoreDrillValidatorGate() {
  const started = Date.now();
  const tempDir = await mkdtemp(join(tmpdir(), 'enigma-backup-drill-audit-'));
  const drillPath = join(tempDir, 'backup-drill.json');
  const gate = {
    name: 'backup-restore-drill-validator',
    required: false,
    command: commandLabel(process.execPath, ['scripts/validate-backup-restore-drill.mjs', '--drill', '<backup-drill.json>']),
    ok: true,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };

  try {
    if (!(await pathExists(BACKUP_RESTORE_DRILL_VALIDATOR_SCRIPT))) {
      gate.evidence = {
        skipped: true,
        reason: 'Backup restore drill validator is absent in this local checkout.',
        script: BACKUP_RESTORE_DRILL_VALIDATOR_SCRIPT,
      };
      return gate;
    }
    const snapshot = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    await writeFile(drillPath, `${JSON.stringify({
      schema: 'enigma.backup_restore_drill.v1',
      metadata: {
        drill_id: 'release-audit-backup-drill',
        environment: 'production-fixture',
        tenant: 'release-audit',
        storage_engine: 'postgres',
        started_at: '2026-06-23T12:00:00.000Z',
        completed_at: '2026-06-23T12:10:00.000Z',
        operator: 'operator',
        backup_owner: 'backup-owner',
        restore_owner: 'restore-owner',
      },
      backup: {
        backup_ref: 'backup://release-audit/snapshot',
        scope_ref: 'scope://release-audit',
        storage_ref: 'postgres://cluster/ref-without-credentials',
        kms_or_secret_custody_ref: 'kms://key/ref-without-secret',
        source_snapshot_hash: snapshot,
        source_row_count: 8,
      },
      restore: {
        restore_ref: 'restore://release-audit/run',
        target_ref: 'postgres://restore-target/ref-without-credentials',
        restore_started_at: '2026-06-23T12:02:00.000Z',
        restore_completed_at: '2026-06-23T12:08:00.000Z',
        restored_snapshot_hash: snapshot,
        restored_row_count: 8,
      },
      verification: {
        status: 'pass',
        verifier_ref: 'verifier://release-audit/backup-drill',
        verifier_output_hash: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      },
      rpo_rto: {
        rpo_seconds: 120,
        rto_seconds: 360,
        max_rpo_seconds: 300,
        max_rto_seconds: 900,
      },
    }, null, 2)}\n`, 'utf8');
    const { stdout, stderr } = await execFile(process.execPath, ['scripts/validate-backup-restore-drill.mjs', '--drill', drillPath], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    gate.status = 0;
    gate.signal = null;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    gate.stdout_bytes = Buffer.byteLength(stdout);
    const output = `${stdout}\n${stderr}`;
    if (SECRET_LOOKING_OUTPUT.test(output)) throw new Error('Backup restore drill validator output appears to contain a secret.');
    const parsed = parseJson(stdout);
    if (parsed.schema !== 'enigma.backup_restore_drill_result.v1') throw new Error('Backup restore drill validator emitted wrong schema.');
    if (parsed.ok !== true || parsed.status !== 'pass') throw new Error('Backup restore drill validator fixture must pass.');
    gate.evidence = {
      schema: parsed.schema,
      status: parsed.status,
      blocker_count: parsed.blockers?.length ?? null,
    };
  } catch (error) {
    gate.ok = false;
    gate.status = Number.isInteger(error.code) ? error.code : (gate.status ?? 1);
    gate.signal = error.signal ?? null;
    gate.stderr_bytes = Buffer.byteLength(error.stderr ?? '');
    gate.stdout_bytes = Buffer.byteLength(error.stdout ?? '');
    gate.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'BACKUP_RESTORE_DRILL_VALIDATOR_FAILED'),
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    gate.duration_ms = Date.now() - started;
    await rm(tempDir, { recursive: true, force: true });
  }

  return gate;
}

export async function runIncidentDrillValidatorGate() {
  const started = Date.now();
  const tempDir = await mkdtemp(join(tmpdir(), 'enigma-incident-drill-audit-'));
  const drillPath = join(tempDir, 'incident-drill.json');
  const gate = {
    name: 'incident-drill-validator',
    required: false,
    command: commandLabel(process.execPath, ['scripts/validate-incident-drill.mjs', '--drill', '<incident-drill.json>']),
    ok: true,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };

  try {
    if (!(await pathExists(INCIDENT_DRILL_VALIDATOR_SCRIPT))) {
      gate.evidence = {
        skipped: true,
        reason: 'Incident drill validator is absent in this local checkout.',
        script: INCIDENT_DRILL_VALIDATOR_SCRIPT,
      };
      return gate;
    }
    const contact = (role) => ({
      role,
      name: `${role} contact`,
      organization: 'release-audit',
      contact_ref: `pager://${role}/primary`,
      escalation_ref: `runbook://${role}/escalation`,
    });
    const timeline = (event, minute) => ({
      event,
      at: `2026-06-23T12:${String(minute).padStart(2, '0')}:00.000Z`,
      evidence_ref: `ticket://incident/${event}`,
    });
    await writeFile(drillPath, `${JSON.stringify({
      schema: 'enigma.incident_drill.v1',
      metadata: {
        drill_id: 'release-audit-incident-drill',
        environment: 'production-fixture',
        tenant: 'release-audit',
        severity: 'sev1',
        started_at: '2026-06-23T12:00:00.000Z',
        completed_at: '2026-06-23T12:35:00.000Z',
        incident_commander: 'incident_commander contact',
      },
      contacts: [
        contact('incident_commander'),
        contact('security'),
        contact('infrastructure'),
        contact('legal_privacy'),
        contact('customer_support'),
      ],
      evidence_preservation: {
        incident_ticket_ref: 'ticket://incident/release-audit',
        log_snapshot_ref: 'logs://snapshot/release-audit',
        forensic_bundle_ref: 'evidence://bundle/release-audit',
        forensic_bundle_hash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        retention_policy_ref: 'policy://retention/release-audit',
      },
      communications: {
        internal_channel_ref: 'chat://incident-war-room/release-audit',
        customer_notification_ref: 'customer-notice://release-audit',
        status_page_ref: 'status://enigma/release-audit',
        executive_update_ref: 'exec-update://incident/release-audit',
      },
      timeline: [
        timeline('detect', 1),
        timeline('triage', 4),
        timeline('contain', 8),
        timeline('preserve_evidence', 10),
        timeline('notify', 15),
        timeline('recover', 25),
        timeline('postmortem', 35),
      ],
      response_targets: {
        detect_seconds: 60,
        triage_seconds: 240,
        notify_seconds: 900,
        recover_seconds: 1500,
        max_detect_seconds: 120,
        max_triage_seconds: 600,
        max_notify_seconds: 1800,
        max_recover_seconds: 3600,
      },
      result: {
        status: 'pass',
        postmortem_ref: 'postmortem://incident/release-audit',
        lessons_learned_ref: 'lessons://incident/release-audit',
        followup_owner: 'incident_commander contact',
        followup_due_at: '2026-06-30T12:00:00.000Z',
      },
    }, null, 2)}\n`, 'utf8');
    const { stdout, stderr } = await execFile(process.execPath, ['scripts/validate-incident-drill.mjs', '--drill', drillPath], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    gate.status = 0;
    gate.signal = null;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    gate.stdout_bytes = Buffer.byteLength(stdout);
    const output = `${stdout}\n${stderr}`;
    if (SECRET_LOOKING_OUTPUT.test(output)) throw new Error('Incident drill validator output appears to contain a secret.');
    const parsed = parseJson(stdout);
    if (parsed.schema !== 'enigma.incident_drill_result.v1') throw new Error('Incident drill validator emitted wrong schema.');
    if (parsed.ok !== true || parsed.status !== 'pass') throw new Error('Incident drill validator fixture must pass.');
    gate.evidence = {
      schema: parsed.schema,
      status: parsed.status,
      blocker_count: parsed.blockers?.length ?? null,
      contact_roles: parsed.checked?.contact_roles ?? null,
      timeline_events: parsed.checked?.timeline_events ?? null,
    };
  } catch (error) {
    gate.ok = false;
    gate.status = Number.isInteger(error.code) ? error.code : (gate.status ?? 1);
    gate.signal = error.signal ?? null;
    gate.stderr_bytes = Buffer.byteLength(error.stderr ?? '');
    gate.stdout_bytes = Buffer.byteLength(error.stdout ?? '');
    gate.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'INCIDENT_DRILL_VALIDATOR_FAILED'),
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    gate.duration_ms = Date.now() - started;
    await rm(tempDir, { recursive: true, force: true });
  }

  return gate;
}

export async function runSupportSlaValidatorGate() {
  const started = Date.now();
  const tempDir = await mkdtemp(join(tmpdir(), 'enigma-support-sla-audit-'));
  const slaPath = join(tempDir, 'support-sla.json');
  const gate = {
    name: 'support-sla-validator',
    required: false,
    command: commandLabel(process.execPath, ['scripts/validate-support-sla.mjs', '--sla', '<support-sla.json>']),
    ok: true,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };

  try {
    if (!(await pathExists(SUPPORT_SLA_VALIDATOR_SCRIPT))) {
      gate.evidence = {
        skipped: true,
        reason: 'Support SLA validator is absent in this local checkout.',
        script: SUPPORT_SLA_VALIDATOR_SCRIPT,
      };
      return gate;
    }
    const severity = (name, response, update, resolution) => ({
      definition: name,
      response_seconds: response,
      update_seconds: update,
      resolution_target_seconds: resolution,
      escalation_ref: `runbook://${name}/escalation`,
    });
    await writeFile(slaPath, `${JSON.stringify({
      schema: 'enigma.support_sla.v1',
      metadata: {
        sla_id: 'release-audit-sla',
        environment: 'production-fixture',
        tenant: 'release-audit',
        owner: 'support-owner',
        approved_at: '2026-06-23T12:00:00.000Z',
        approval_ref: 'ticket://sla/approved',
        status: 'approved',
      },
      support_hours: {
        timezone: 'America/Chicago',
        coverage: '24x7 sev1, business-hours sev2/sev3',
        holiday_policy_ref: 'policy://support/holiday',
      },
      severities: {
        sev1: severity('sev1', 300, 900, 14400),
        sev2: severity('sev2', 1800, 3600, 86400),
        sev3: severity('sev3', 14400, 86400, 604800),
      },
      channels: [
        { type: 'pager', name: 'primary on-call', ref: 'pager://support/primary', owner: 'support-owner' },
        { type: 'ticket', name: 'customer support queue', ref: 'ticket://support/queue', owner: 'support-owner' },
      ],
      escalation_matrix: [
        { level: 'l1', owner: 'support-owner', trigger: 'initial response missed', target_seconds: 300, ref: 'runbook://support/l1' },
        { level: 'l2', owner: 'incident-commander', trigger: 'sev1 unresolved', target_seconds: 1800, ref: 'runbook://support/l2' },
      ],
      maintenance_window: {
        cadence: 'weekly',
        window: 'Sunday 02:00-04:00 America/Chicago',
        notice_seconds: 604800,
        approval_ref: 'ticket://maintenance/window-approved',
      },
    }, null, 2)}\n`, 'utf8');
    const { stdout, stderr } = await execFile(process.execPath, ['scripts/validate-support-sla.mjs', '--sla', slaPath], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    gate.status = 0;
    gate.signal = null;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    gate.stdout_bytes = Buffer.byteLength(stdout);
    const output = `${stdout}\n${stderr}`;
    if (SECRET_LOOKING_OUTPUT.test(output)) throw new Error('Support SLA validator output appears to contain a secret.');
    const parsed = parseJson(stdout);
    if (parsed.schema !== 'enigma.support_sla_result.v1') throw new Error('Support SLA validator emitted wrong schema.');
    if (parsed.ok !== true || parsed.status !== 'accepted') throw new Error('Support SLA validator fixture must be accepted.');
    gate.evidence = {
      schema: parsed.schema,
      status: parsed.status,
      blocker_count: parsed.blockers?.length ?? null,
      severities: parsed.checked?.severities ?? null,
      channels: parsed.checked?.channels ?? null,
      escalation_levels: parsed.checked?.escalation_levels ?? null,
    };
  } catch (error) {
    gate.ok = false;
    gate.status = Number.isInteger(error.code) ? error.code : (gate.status ?? 1);
    gate.signal = error.signal ?? null;
    gate.stderr_bytes = Buffer.byteLength(error.stderr ?? '');
    gate.stdout_bytes = Buffer.byteLength(error.stdout ?? '');
    gate.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'SUPPORT_SLA_VALIDATOR_FAILED'),
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    gate.duration_ms = Date.now() - started;
    await rm(tempDir, { recursive: true, force: true });
  }

  return gate;
}

export async function runLegalComplianceApprovalValidatorGate() {
  const started = Date.now();
  const tempDir = await mkdtemp(join(tmpdir(), 'enigma-legal-compliance-audit-'));
  const approvalPath = join(tempDir, 'legal-compliance-approval.json');
  const gate = {
    name: 'legal-compliance-validator',
    required: false,
    command: commandLabel(process.execPath, ['scripts/validate-legal-compliance-approval.mjs', '--approval', '<legal-compliance-approval.json>']),
    ok: true,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };

  try {
    if (!(await pathExists(LEGAL_COMPLIANCE_APPROVAL_VALIDATOR_SCRIPT))) {
      gate.evidence = {
        skipped: true,
        reason: 'Legal/compliance approval validator is absent in this local checkout.',
        script: LEGAL_COMPLIANCE_APPROVAL_VALIDATOR_SCRIPT,
      };
      return gate;
    }
    const reviewAreas = Object.fromEntries([
      'privacy',
      'security',
      'marketing',
      'digital_asset_finance',
      'compliance',
      'data_retention',
      'incident_notification',
    ].map((area) => [area, {
      owner: `${area}-owner`,
      evidence_ref: `ticket://legal/${area}/approved`,
      status: 'approved',
    }]));
    const noClaims = [
      'provider_deletion',
      'model_forgetting',
      'semantic_erasure',
      'imported_source_completeness',
      'token_roi_profit_equity',
      'compliance_status',
      'tamper_proof_hardware',
      'raw_compute_superiority',
      'guaranteed_discount_or_savings',
      'hosted_live_ready_without_operator_evidence',
      'unsupported_market_superlative',
    ].map((claimId) => ({
      claim_id: claimId,
      decision: 'no_claim',
      scope: `External claims must not assert ${claimId} without separate approved evidence.`,
      evidence_ref: `policy://claim-boundary/${claimId}`,
    }));
    await writeFile(approvalPath, `${JSON.stringify({
      schema: 'enigma.legal_compliance_approval.v1',
      metadata: {
        approval_id: 'release-audit-legal-compliance',
        environment: 'production-fixture',
        tenant: 'release-audit',
        legal_owner: 'legal-owner',
        privacy_owner: 'privacy-owner',
        reviewer: 'legal-reviewer',
        approved_at: '2026-06-23T12:00:00.000Z',
        approval_ref: 'ticket://legal/release-audit-approved',
        status: 'approved',
      },
      decision: 'approved',
      review_areas: reviewAreas,
      reviewed_statements: [
        {
          statement_id: 'claim-boundary',
          text: 'Enigma receipts verify Enigma-mediated state transitions under declared software and policy boundaries.',
          scope: 'public documentation and operator packet',
          evidence_ref: 'docs://operator-acceptance-packet#claim-boundary',
          status: 'approved',
        },
        {
          statement_id: 'compliance-no-claim',
          text: 'No compliance status is claimed by the local package, demo, or static public website.',
          scope: 'public documentation and launch collateral',
          evidence_ref: 'policy://claim-boundary/compliance_status',
          status: 'no_claim',
        },
      ],
      no_claims: noClaims,
      publication_controls: {
        publication_ref: 'docs://public-api-reference',
        allowed_channels: ['docs', 'operator_packet'],
        claims_owner: 'legal-owner',
        withdrawal_path_ref: 'runbook://legal/withdraw-public-claim',
        last_review_expires_at: '2026-09-23T12:00:00.000Z',
      },
    }, null, 2)}\n`, 'utf8');
    const { stdout, stderr } = await execFile(process.execPath, ['scripts/validate-legal-compliance-approval.mjs', '--approval', approvalPath], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    gate.status = 0;
    gate.signal = null;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    gate.stdout_bytes = Buffer.byteLength(stdout);
    const output = `${stdout}\n${stderr}`;
    if (SECRET_LOOKING_OUTPUT.test(output)) throw new Error('Legal/compliance approval validator output appears to contain a secret.');
    const parsed = parseJson(stdout);
    if (parsed.schema !== 'enigma.legal_compliance_approval_result.v1') throw new Error('Legal/compliance approval validator emitted wrong schema.');
    if (parsed.ok !== true || parsed.decision !== 'approved') throw new Error('Legal/compliance approval validator fixture must be approved.');
    gate.evidence = {
      schema: parsed.schema,
      decision: parsed.decision,
      blocker_count: parsed.blockers?.length ?? null,
      review_areas: parsed.checked?.review_areas ?? null,
      required_no_claims: parsed.checked?.required_no_claims ?? null,
    };
  } catch (error) {
    gate.ok = false;
    gate.status = Number.isInteger(error.code) ? error.code : (gate.status ?? 1);
    gate.signal = error.signal ?? null;
    gate.stderr_bytes = Buffer.byteLength(error.stderr ?? '');
    gate.stdout_bytes = Buffer.byteLength(error.stdout ?? '');
    gate.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'LEGAL_COMPLIANCE_VALIDATOR_FAILED'),
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    gate.duration_ms = Date.now() - started;
    await rm(tempDir, { recursive: true, force: true });
  }

  return gate;
}

export async function runMonitoringAlertingValidatorGate() {
  const started = Date.now();
  const tempDir = await mkdtemp(join(tmpdir(), 'enigma-monitoring-alerting-audit-'));
  const monitoringPath = join(tempDir, 'monitoring-alerting.json');
  const gate = {
    name: 'monitoring-alerting-validator',
    required: false,
    command: commandLabel(process.execPath, ['scripts/validate-monitoring-alerting.mjs', '--monitoring', '<monitoring-alerting.json>']),
    ok: true,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };

  try {
    if (!(await pathExists(MONITORING_ALERTING_VALIDATOR_SCRIPT))) {
      gate.evidence = {
        skipped: true,
        reason: 'Monitoring/alerting validator is absent in this local checkout.',
        script: MONITORING_ALERTING_VALIDATOR_SCRIPT,
      };
      return gate;
    }
    const alert = (name) => ({
      name,
      description: `${name} alert`,
      query_ref: `monitor://query/${name}`,
      threshold: `${name} threshold`,
      severity: name.includes('failure') || name.includes('5xx') ? 'sev1' : 'sev2',
      window_seconds: 300,
      notify_ref: `pager://alerts/${name}`,
      runbook_ref: `runbook://alerts/${name}`,
      owner: 'observability-owner',
      enabled: true,
    });
    const synthetic = (name) => ({
      name,
      endpoint_ref: `https-check://${name}`,
      frequency_seconds: 60,
      expected_status: 200,
      owner: 'observability-owner',
      alert_ref: `monitor://alert/${name}`,
      enabled: true,
    });
    await writeFile(monitoringPath, `${JSON.stringify({
      schema: 'enigma.monitoring_alerting.v1',
      metadata: {
        monitoring_id: 'release-audit-monitoring',
        environment: 'production-fixture',
        tenant: 'release-audit',
        owner: 'observability-owner',
        approved_at: '2026-06-23T12:00:00.000Z',
        approval_ref: 'ticket://monitoring/approved',
        status: 'approved',
      },
      observability_stack: {
        metrics_ref: 'metrics://enigma/release-audit',
        logs_ref: 'logs://enigma/release-audit',
        dashboard_ref: 'dashboard://enigma/overview',
        alert_manager_ref: 'pager://enigma/alert-manager',
        retention_days: 30,
        owner: 'observability-owner',
      },
      alerts: [
        'health_probe_failure',
        'latency_slo_breach',
        'http_5xx_rate',
        'signing_failure',
        'policy_load_failure',
        'storage_failure',
        'plaintext_rejection_spike',
        'certificate_expiry',
        'kms_or_secret_access_failure',
        'siem_delivery_failure',
      ].map(alert),
      synthetics: [
        'relay_livez',
        'relay_readyz',
        'gateway_livez',
        'gateway_readyz',
      ].map(synthetic),
      routing: {
        paging_policy_ref: 'pager://policy/enigma-sev-routing',
        on_call_ref: 'pager://schedule/enigma-primary',
        escalation_ref: 'runbook://monitoring/escalation',
        incident_runbook_ref: 'runbook://incident/sev1',
        status_page_ref: 'status://enigma/public',
      },
      content_minimization: {
        policy_ref: 'policy://logs/content-minimization',
        sensitive_content_in_logs: false,
        sample_export_ref: 'logs://sample/minimized-export',
        sample_export_hash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
    }, null, 2)}\n`, 'utf8');
    const { stdout, stderr } = await execFile(process.execPath, ['scripts/validate-monitoring-alerting.mjs', '--monitoring', monitoringPath], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    gate.status = 0;
    gate.signal = null;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    gate.stdout_bytes = Buffer.byteLength(stdout);
    const output = `${stdout}\n${stderr}`;
    if (SECRET_LOOKING_OUTPUT.test(output)) throw new Error('Monitoring/alerting validator output appears to contain a secret.');
    const parsed = parseJson(stdout);
    if (parsed.schema !== 'enigma.monitoring_alerting_result.v1') throw new Error('Monitoring/alerting validator emitted wrong schema.');
    if (parsed.ok !== true || parsed.status !== 'accepted') throw new Error('Monitoring/alerting validator fixture must be accepted.');
    gate.evidence = {
      schema: parsed.schema,
      status: parsed.status,
      blocker_count: parsed.blockers?.length ?? null,
      alert_signals_covered: parsed.checked?.alert_signals_covered ?? null,
      synthetic_checks_covered: parsed.checked?.synthetic_checks_covered ?? null,
    };
  } catch (error) {
    gate.ok = false;
    gate.status = Number.isInteger(error.code) ? error.code : (gate.status ?? 1);
    gate.signal = error.signal ?? null;
    gate.stderr_bytes = Buffer.byteLength(error.stderr ?? '');
    gate.stdout_bytes = Buffer.byteLength(error.stdout ?? '');
    gate.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'MONITORING_ALERTING_VALIDATOR_FAILED'),
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    gate.duration_ms = Date.now() - started;
    await rm(tempDir, { recursive: true, force: true });
  }

  return gate;
}

export async function runNetworkAccessPolicyValidatorGate() {
  const started = Date.now();
  const tempDir = await mkdtemp(join(tmpdir(), 'enigma-network-access-audit-'));
  const policyPath = join(tempDir, 'network-access-policy.json');
  const gate = {
    name: 'network-access-policy-validator',
    required: false,
    command: commandLabel(process.execPath, ['scripts/validate-network-access-policy.mjs', '--policy', '<network-access-policy.json>']),
    ok: true,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };

  try {
    if (!(await pathExists(NETWORK_ACCESS_POLICY_VALIDATOR_SCRIPT))) {
      gate.evidence = {
        skipped: true,
        reason: 'Network access policy validator is absent in this local checkout.',
        script: NETWORK_ACCESS_POLICY_VALIDATOR_SCRIPT,
      };
      return gate;
    }
    const publicProbe = (name) => ({
      name,
      service: name.startsWith('relay') ? 'relay' : 'gateway',
      method: 'GET',
      path: name.endsWith('livez') ? '/livez' : '/readyz',
      public: true,
      tls_required: true,
      rate_limit_ref: `rate-limit://public/${name}`,
      owner: 'network-owner',
    });
    const privateRoute = (name) => ({
      name,
      service: name.startsWith('relay') ? 'relay' : 'gateway',
      method: name === 'gateway_admin_policy' || name === 'gateway_siem_export' ? 'GET' : 'POST',
      path: {
        relay_records_write: '/relay/records',
        gateway_admin_policy: '/policy',
        gateway_data_plane_evaluate: '/gateway/evaluate',
        gateway_data_plane_decision: '/gateway/decision',
        gateway_siem_export: '/siem/export',
      }[name],
      public: false,
      tls_required: true,
      network_ref: `network://private/${name}`,
      auth_mode: 'bearer_hash',
      auth_config_ref: `secret-manager-ref://hash-only/${name}`,
      audit_ref: `audit://network/${name}`,
      owner: 'network-owner',
    });
    await writeFile(policyPath, `${JSON.stringify({
      schema: 'enigma.network_access_policy.v1',
      metadata: {
        policy_id: 'release-audit-network-policy',
        environment: 'production-fixture',
        tenant: 'release-audit',
        owner: 'network-owner',
        approved_at: '2026-06-23T12:00:00.000Z',
        approval_ref: 'ticket://network/approved',
        status: 'approved',
      },
      network_zones: {
        public_ingress_ref: 'ingress://public/enigma',
        private_admin_network_ref: 'network://private/admin',
        private_data_plane_network_ref: 'network://private/data-plane',
        egress_policy_ref: 'egress://default-deny/enigma',
        waf_or_rate_limit_ref: 'waf://enigma/public-probes',
        tls_policy_ref: 'tls://enigma/managed-cert',
        owner: 'network-owner',
      },
      public_endpoints: [
        'relay_livez',
        'relay_readyz',
        'gateway_livez',
        'gateway_readyz',
      ].map(publicProbe),
      private_routes: [
        'relay_records_write',
        'gateway_admin_policy',
        'gateway_data_plane_evaluate',
        'gateway_data_plane_decision',
        'gateway_siem_export',
      ].map(privateRoute),
      limits: {
        max_request_bytes: 1048576,
        max_requests_per_minute: 600,
        body_timeout_seconds: 15,
        enforcement_ref: 'gateway://limits/enforced',
      },
      egress: {
        default_denied: true,
        policy_ref: 'egress://default-deny/enigma',
        allowed_destinations: [
          {
            name: 'siem',
            destination_ref: 'siem://approved/sink',
            purpose: 'plaintext-minimized audit delivery',
            owner: 'siem-owner',
            sensitive_content_allowed: false,
          },
        ],
      },
      break_glass: {
        approval_ref: 'ticket://break-glass/approved',
        audit_ref: 'audit://break-glass/session-log',
        owner: 'security-owner',
        expiry_policy_ref: 'policy://break-glass/expiry',
        max_session_seconds: 1800,
        enabled_without_approval: false,
      },
      no_token_values_in_policy: true,
    }, null, 2)}\n`, 'utf8');
    const { stdout, stderr } = await execFile(process.execPath, ['scripts/validate-network-access-policy.mjs', '--policy', policyPath], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    gate.status = 0;
    gate.signal = null;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    gate.stdout_bytes = Buffer.byteLength(stdout);
    const output = `${stdout}\n${stderr}`;
    if (SECRET_LOOKING_OUTPUT.test(output)) throw new Error('Network access policy validator output appears to contain a secret.');
    const parsed = parseJson(stdout);
    if (parsed.schema !== 'enigma.network_access_policy_result.v1') throw new Error('Network access policy validator emitted wrong schema.');
    if (parsed.ok !== true || parsed.status !== 'accepted') throw new Error('Network access policy validator fixture must be accepted.');
    gate.evidence = {
      schema: parsed.schema,
      status: parsed.status,
      blocker_count: parsed.blockers?.length ?? null,
      public_probes_covered: parsed.checked?.public_probes_covered ?? null,
      private_routes_covered: parsed.checked?.private_routes_covered ?? null,
    };
  } catch (error) {
    gate.ok = false;
    gate.status = Number.isInteger(error.code) ? error.code : (gate.status ?? 1);
    gate.signal = error.signal ?? null;
    gate.stderr_bytes = Buffer.byteLength(error.stderr ?? '');
    gate.stdout_bytes = Buffer.byteLength(error.stdout ?? '');
    gate.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'NETWORK_ACCESS_POLICY_VALIDATOR_FAILED'),
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    gate.duration_ms = Date.now() - started;
    await rm(tempDir, { recursive: true, force: true });
  }

  return gate;
}

export async function runKmsCustodyValidatorGate() {
  const started = Date.now();
  const tempDir = await mkdtemp(join(tmpdir(), 'enigma-kms-custody-audit-'));
  const custodyPath = join(tempDir, 'kms-custody.json');
  const gate = {
    name: 'kms-custody-validator',
    required: false,
    command: commandLabel(process.execPath, ['scripts/validate-kms-custody.mjs', '--custody', '<kms-custody.json>']),
    ok: true,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };

  try {
    if (!(await pathExists(KMS_CUSTODY_VALIDATOR_SCRIPT))) {
      gate.evidence = {
        skipped: true,
        reason: 'KMS custody validator is absent in this local checkout.',
        script: KMS_CUSTODY_VALIDATOR_SCRIPT,
      };
      return gate;
    }
    const custodyItem = (itemId) => ({
      item_id: itemId,
      purpose: `${itemId} custody`,
      manager_ref: `kms://manager/${itemId}`,
      access_policy_ref: `iam://policy/${itemId}`,
      emergency_rotation_ref: `runbook://rotation/${itemId}`,
      owner: 'custody-owner',
      status: 'active',
      rotation_seconds: 7776000,
      last_rotated_at: '2026-06-23T12:00:00.000Z',
      next_rotation_at: '2026-09-21T12:00:00.000Z',
      value_exportable: false,
    });
    await writeFile(custodyPath, `${JSON.stringify({
      schema: 'enigma.kms_custody.v1',
      metadata: {
        custody_id: 'release-audit-kms-custody',
        environment: 'production-fixture',
        tenant: 'release-audit',
        owner: 'custody-owner',
        approved_at: '2026-06-23T12:00:00.000Z',
        approval_ref: 'ticket://custody/approved',
        status: 'approved',
      },
      custody_provider: {
        provider_ref: 'kms://provider/enigma-production',
        region: 'us-central-fixture',
        account_ref: 'account://cloud/project-without-credentials',
        access_model_ref: 'iam://least-privilege/enigma-custody',
        audit_log_ref: 'audit://kms/access-log',
        owner: 'custody-owner',
        status: 'active',
      },
      custody_items: [
        'relay_signing_key',
        'witness_signing_key',
        'gateway_signing_key',
        'gateway_admin_bearer_hash',
        'gateway_data_plane_bearer_hash',
        'database_credential_ref',
        'siem_destination_credential_ref',
        'backup_encryption_key',
        'tls_certificate_key_ref',
      ].map(custodyItem),
      signing_controls: {
        algorithm_policy_ref: 'policy://signing/ed25519',
        public_key_registry_ref: 'registry://public-keys/enigma',
        rotation_runbook_ref: 'runbook://signing/rotation',
        verification_runbook_ref: 'runbook://signing/verify-public-keys',
        public_key_published: true,
      },
      operator_access: {
        least_privilege_ref: 'iam://least-privilege/operator',
        dual_control_ref: 'policy://custody/dual-control',
        break_glass_approval_ref: 'ticket://break-glass/custody-approved',
        audit_ref: 'audit://custody/operator-access',
        review_ref: 'review://custody/quarterly',
        dual_control_required: true,
        review_cadence_seconds: 7776000,
      },
      prohibitions: {
        material_in_source: false,
        material_in_chat: false,
        material_in_logs: false,
        artifact_contains_values: false,
        operator_can_export_values: false,
        enforcement_ref: 'policy://custody/no-value-export',
      },
    }, null, 2)}\n`, 'utf8');
    const { stdout, stderr } = await execFile(process.execPath, ['scripts/validate-kms-custody.mjs', '--custody', custodyPath], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    gate.status = 0;
    gate.signal = null;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    gate.stdout_bytes = Buffer.byteLength(stdout);
    const output = `${stdout}\n${stderr}`;
    if (SECRET_LOOKING_OUTPUT.test(output)) throw new Error('KMS custody validator output appears to contain a secret.');
    const parsed = parseJson(stdout);
    if (parsed.schema !== 'enigma.kms_custody_result.v1') throw new Error('KMS custody validator emitted wrong schema.');
    if (parsed.ok !== true || parsed.status !== 'accepted') throw new Error('KMS custody validator fixture must be accepted.');
    gate.evidence = {
      schema: parsed.schema,
      status: parsed.status,
      blocker_count: parsed.blockers?.length ?? null,
      custody_items_covered: parsed.checked?.custody_items_covered ?? null,
      required_custody_items: parsed.checked?.required_custody_items ?? null,
    };
  } catch (error) {
    gate.ok = false;
    gate.status = Number.isInteger(error.code) ? error.code : (gate.status ?? 1);
    gate.signal = error.signal ?? null;
    gate.stderr_bytes = Buffer.byteLength(error.stderr ?? '');
    gate.stdout_bytes = Buffer.byteLength(error.stdout ?? '');
    gate.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'KMS_CUSTODY_VALIDATOR_FAILED'),
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    gate.duration_ms = Date.now() - started;
    await rm(tempDir, { recursive: true, force: true });
  }

  return gate;
}

export async function runTenantPolicyApprovalValidatorGate() {
  const started = Date.now();
  const tempDir = await mkdtemp(join(tmpdir(), 'enigma-tenant-policy-audit-'));
  const approvalPath = join(tempDir, 'tenant-policy-approval.json');
  const gate = {
    name: 'tenant-policy-approval-validator',
    required: false,
    command: commandLabel(process.execPath, ['scripts/validate-tenant-policy-approval.mjs', '--approval', '<tenant-policy-approval.json>']),
    ok: true,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };

  try {
    if (!(await pathExists(TENANT_POLICY_APPROVAL_VALIDATOR_SCRIPT))) {
      gate.evidence = {
        skipped: true,
        reason: 'Tenant policy approval validator is absent in this local checkout.',
        script: TENANT_POLICY_APPROVAL_VALIDATOR_SCRIPT,
      };
      return gate;
    }
    const enterprisePolicy = {
      schema: 'enigma.enterprise_policy.v1',
      policy_id: 'release-audit-tenant-policy',
      tenant_id: 'release-audit',
      mode: 'byoc',
      created_at: '2026-06-23T12:00:00.000Z',
      updated_at: '2026-06-23T12:00:00.000Z',
      default_action: 'deny_unknown',
      public_proof: 'hash_only',
      allowed_operations: ['retrieve', 'remember', 'write', 'delete'],
      allowed_providers: ['openai', 'anthropic'],
      allowed_models: ['gpt-5.5', 'claude-opus'],
      allowed_regions: ['us'],
      denied_sensitivities: ['restricted'],
      allowed_purposes: ['user_memory', 'operator_review'],
      legal_holds: ['legal-hold-fixture'],
      retention_days: 365,
      kms: { key_ref: 'kms://tenant-policy/key-ref' },
      provider_native_memory: 'cache_only',
      policy_hash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    };
    await writeFile(approvalPath, `${JSON.stringify({
      schema: 'enigma.tenant_policy_approval.v1',
      metadata: {
        approval_id: 'release-audit-tenant-policy-approval',
        environment: 'production-fixture',
        tenant: 'release-audit',
        owner: 'tenant-policy-owner',
        approved_at: '2026-06-23T12:00:00.000Z',
        approval_ref: 'ticket://tenant-policy/approved',
        status: 'approved',
      },
      enterprise_policy: enterprisePolicy,
      approval: {
        policy_owner: 'tenant-policy-owner',
        approver: 'security-owner',
        approval_ref: 'ticket://tenant-policy/approved',
        approved_at: '2026-06-23T12:00:00.000Z',
        rollback_policy_hash: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        rollback_ref: 'policy://tenant-policy/rollback',
        status: 'approved',
      },
      retention_deletion: {
        retention_days: 365,
        tombstone_receipt_required: true,
        legal_hold_delete_blocks: true,
        provider_deletion_claimed: false,
        tombstone_receipt_ref: 'receipt://tenant-policy/tombstone-required',
        legal_hold_policy_ref: 'policy://tenant-policy/legal-hold',
        audit_route_ref: 'audit://tenant-policy/deletion',
        retention_policy_ref: 'policy://tenant-policy/retention',
      },
      audit_controls: {
        gateway_decision_required: true,
        siem_event_required: true,
        minimized_events_only: true,
        gateway_decision_ref: 'gateway://decision/required',
        siem_event_ref: 'siem://event/required',
        evidence_retention_ref: 'policy://audit/evidence-retention',
        review_ref: 'review://audit/tenant-policy',
      },
      change_control: {
        change_ticket_ref: 'ticket://change/tenant-policy',
        canary_ref: 'deploy://canary/tenant-policy',
        rollback_ref: 'deploy://rollback/tenant-policy',
        emergency_freeze_ref: 'runbook://freeze/tenant-policy',
        owner: 'tenant-policy-owner',
        force_push_allowed: false,
      },
    }, null, 2)}\n`, 'utf8');
    const { stdout, stderr } = await execFile(process.execPath, ['scripts/validate-tenant-policy-approval.mjs', '--approval', approvalPath], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    gate.status = 0;
    gate.signal = null;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    gate.stdout_bytes = Buffer.byteLength(stdout);
    const output = `${stdout}\n${stderr}`;
    if (SECRET_LOOKING_OUTPUT.test(output)) throw new Error('Tenant policy approval validator output appears to contain a secret.');
    const parsed = parseJson(stdout);
    if (parsed.schema !== 'enigma.tenant_policy_approval_result.v1') throw new Error('Tenant policy approval validator emitted wrong schema.');
    if (parsed.ok !== true || parsed.status !== 'accepted') throw new Error('Tenant policy approval validator fixture must be accepted.');
    gate.evidence = {
      schema: parsed.schema,
      status: parsed.status,
      blocker_count: parsed.blockers?.length ?? null,
      policy_hash: parsed.checked?.policy_hash ?? null,
    };
  } catch (error) {
    gate.ok = false;
    gate.status = Number.isInteger(error.code) ? error.code : (gate.status ?? 1);
    gate.signal = error.signal ?? null;
    gate.stderr_bytes = Buffer.byteLength(error.stderr ?? '');
    gate.stdout_bytes = Buffer.byteLength(error.stdout ?? '');
    gate.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'TENANT_POLICY_APPROVAL_VALIDATOR_FAILED'),
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    gate.duration_ms = Date.now() - started;
    await rm(tempDir, { recursive: true, force: true });
  }

  return gate;
}

export async function runUsageMeteringValidatorGate() {
  const started = Date.now();
  const tempDir = await mkdtemp(join(tmpdir(), 'enigma-usage-metering-audit-'));
  const usagePath = join(tempDir, 'usage-event.json');
  const gate = {
    name: 'usage-metering-validator',
    required: false,
    command: commandLabel(process.execPath, ['scripts/validate-usage-metering.mjs', '--metering', '<usage-event.json>']),
    ok: true,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };

  try {
    if (!(await pathExists(USAGE_METERING_VALIDATOR_SCRIPT))) {
      gate.evidence = {
        skipped: true,
        reason: 'Usage metering validator is absent in this local checkout.',
        script: USAGE_METERING_VALIDATOR_SCRIPT,
      };
      return gate;
    }
    await execFile(process.execPath, [
      'apps/cli/bin/enigma.mjs',
      'meter',
      'event',
      '--tenant',
      'release-audit',
      '--meter',
      'release-audit-meter',
      '--provider',
      'openai',
      '--model',
      'gpt-5.5',
      '--timestamp',
      '2026-06-23T12:00:00.000Z',
      '--prompt-tokens',
      '1200',
      '--completion-tokens',
      '300',
      '--memory-baseline-tokens',
      '1200',
      '--memory-optimized-tokens',
      '420',
      '--price-per-million-tokens',
      '2',
      '--out',
      usagePath,
    ], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    const { stdout, stderr } = await execFile(process.execPath, ['scripts/validate-usage-metering.mjs', '--metering', usagePath], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    gate.status = 0;
    gate.signal = null;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    gate.stdout_bytes = Buffer.byteLength(stdout);
    const output = `${stdout}\n${stderr}`;
    if (SECRET_LOOKING_OUTPUT.test(output)) throw new Error('Usage metering validator output appears to contain a secret.');
    const parsed = parseJson(stdout);
    if (parsed.schema !== 'enigma.usage_metering_result.v1') throw new Error('Usage metering validator emitted wrong schema.');
    if (parsed.ok !== true || parsed.status !== 'accepted') throw new Error('Usage metering validator fixture must be accepted.');
    gate.evidence = {
      schema: parsed.schema,
      status: parsed.status,
      blocker_count: parsed.blockers?.length ?? null,
      event_count: parsed.checked?.event_count ?? null,
      memory_savings_tokens: parsed.checked?.memory_savings_tokens ?? null,
    };
  } catch (error) {
    gate.ok = false;
    gate.status = Number.isInteger(error.code) ? error.code : (gate.status ?? 1);
    gate.signal = error.signal ?? null;
    gate.stderr_bytes = Buffer.byteLength(error.stderr ?? '');
    gate.stdout_bytes = Buffer.byteLength(error.stdout ?? '');
    gate.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'USAGE_METERING_VALIDATOR_FAILED'),
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    gate.duration_ms = Date.now() - started;
    await rm(tempDir, { recursive: true, force: true });
  }

  return gate;
}

export async function runServiceSettlementValidatorGate() {
  const started = Date.now();
  const tempDir = await mkdtemp(join(tmpdir(), 'enigma-service-settlement-audit-'));
  const jobPath = join(tempDir, 'job.json');
  const quotePath = join(tempDir, 'quote.json');
  const receiptPath = join(tempDir, 'receipt.json');
  const receiptsPath = join(tempDir, 'receipts.json');
  const batchPath = join(tempDir, 'batch.json');
  const settlementPath = join(tempDir, 'service-settlement.json');
  const gate = {
    name: 'service-settlement-validator',
    required: false,
    command: commandLabel(process.execPath, ['scripts/validate-service-settlement.mjs', '--settlement', '<service-settlement.json>']),
    ok: true,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };

  try {
    if (!(await pathExists(SERVICE_SETTLEMENT_VALIDATOR_SCRIPT))) {
      gate.evidence = {
        skipped: true,
        reason: 'Service settlement validator is absent in this local checkout.',
        script: SERVICE_SETTLEMENT_VALIDATOR_SCRIPT,
      };
      return gate;
    }
    await execFile(process.execPath, [
      'apps/cli/bin/enigma.mjs',
      'settlement',
      'job',
      '--tenant',
      'release-audit',
      '--job-type',
      'context.pack',
      '--memory-root',
      'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      '--policy-hash',
      'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      '--usage-event-hash',
      'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      '--max-price-amount',
      '5',
      '--payment-asset',
      'USDC',
      '--requested-at',
      '2026-06-23T12:00:00.000Z',
      '--expires-at',
      '2026-06-23T12:10:00.000Z',
      '--out',
      jobPath,
    ], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    await execFile(process.execPath, [
      'apps/cli/bin/enigma.mjs',
      'settlement',
      'quote',
      '--job',
      jobPath,
      '--operator',
      'operator-release-audit',
      '--service-kind',
      'gateway',
      '--quoted-at',
      '2026-06-23T12:01:00.000Z',
      '--expires-at',
      '2026-06-23T12:09:00.000Z',
      '--price-amount',
      '3',
      '--asset',
      'USDC',
      '--capacity-ref',
      'capacity://operator-release-audit/gateway/slot-1',
      '--terms-ref',
      'terms://enigma/service-v1',
      '--out',
      quotePath,
    ], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    await execFile(process.execPath, [
      'apps/cli/bin/enigma.mjs',
      'settlement',
      'receipt',
      '--job',
      jobPath,
      '--quote',
      quotePath,
      '--completed-at',
      '2026-06-23T12:04:00.000Z',
      '--settled-amount',
      '2.5',
      '--settlement-ref',
      'settlement://release-audit/receipt',
      '--service-receipt-ref',
      'receipt://gateway/release-audit/hash-only',
      '--out',
      receiptPath,
    ], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    const job = parseJson(await readFile(jobPath, 'utf8'));
    const quote = parseJson(await readFile(quotePath, 'utf8'));
    const receipt = parseJson(await readFile(receiptPath, 'utf8'));
    await writeFile(receiptsPath, `${JSON.stringify([receipt], null, 2)}\n`, 'utf8');
    await execFile(process.execPath, [
      'apps/cli/bin/enigma.mjs',
      'settlement',
      'batch',
      '--receipts',
      receiptsPath,
      '--batch-ref',
      'batch://release-audit/service-settlement',
      '--asset',
      'USDC',
      '--generated-at',
      '2026-06-23T12:30:00.000Z',
      '--out',
      batchPath,
    ], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    const batch = parseJson(await readFile(batchPath, 'utf8'));
    await writeFile(settlementPath, `${JSON.stringify({ job, quote, receipt, batch }, null, 2)}\n`, 'utf8');
    const { stdout, stderr } = await execFile(process.execPath, ['scripts/validate-service-settlement.mjs', '--settlement', settlementPath], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    gate.status = 0;
    gate.signal = null;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    gate.stdout_bytes = Buffer.byteLength(stdout);
    const output = `${stdout}\n${stderr}`;
    if (SECRET_LOOKING_OUTPUT.test(output)) throw new Error('Service settlement validator output appears to contain a secret.');
    const parsed = parseJson(stdout);
    if (parsed.schema !== 'enigma.service_settlement_result.v1') throw new Error('Service settlement validator emitted wrong schema.');
    if (parsed.ok !== true || parsed.status !== 'accepted') throw new Error('Service settlement validator fixture must be accepted.');
    gate.evidence = {
      schema: parsed.schema,
      status: parsed.status,
      blocker_count: parsed.blockers?.length ?? null,
      invariant: parsed.checked?.invariant ?? null,
      settled_amount: parsed.checked?.settled_amount ?? null,
      asset: parsed.checked?.asset ?? null,
    };
  } catch (error) {
    gate.ok = false;
    gate.status = Number.isInteger(error.code) ? error.code : (gate.status ?? 1);
    gate.signal = error.signal ?? null;
    gate.stderr_bytes = Buffer.byteLength(error.stderr ?? '');
    gate.stdout_bytes = Buffer.byteLength(error.stdout ?? '');
    gate.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'SERVICE_SETTLEMENT_VALIDATOR_FAILED'),
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    gate.duration_ms = Date.now() - started;
    await rm(tempDir, { recursive: true, force: true });
  }

  return gate;
}

export async function runPublicSiteSecurityValidatorGate() {
  const started = Date.now();
  const tempDir = await mkdtemp(join(tmpdir(), 'enigma-public-site-security-audit-'));
  const gate = {
    name: 'public-site-security-validator',
    required: false,
    command: commandLabel(process.execPath, ['scripts/validate-public-site-security.mjs', '--site', '<public-site>']),
    ok: true,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };

  try {
    if (!(await pathExists(PUBLIC_SITE_SECURITY_VALIDATOR_SCRIPT))) {
      gate.evidence = {
        skipped: true,
        reason: 'Public site security validator is absent in this local checkout.',
        script: PUBLIC_SITE_SECURITY_VALIDATOR_SCRIPT,
      };
      return gate;
    }
    await writeFile(join(tempDir, '_headers'), `/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'
`, 'utf8');
    await writeFile(join(tempDir, 'index.html'), '<!doctype html><html><head><title>Enigma Memory</title><link rel="stylesheet" href="/styles.css"></head><body><main><a href="/about.html">About</a><script src="/app.js"></script></main></body></html>\n', 'utf8');
    await writeFile(join(tempDir, 'about.html'), '<!doctype html><html><body><a href="/">Home</a><p>Privacy-first memory infrastructure.</p></body></html>\n', 'utf8');
    await writeFile(join(tempDir, 'styles.css'), 'body{font-family:system-ui,sans-serif}\n', 'utf8');
    await writeFile(join(tempDir, 'app.js'), 'document.documentElement.dataset.enigma="ready";\n', 'utf8');
    const { stdout, stderr } = await execFile(process.execPath, ['scripts/validate-public-site-security.mjs', '--site', tempDir], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    gate.status = 0;
    gate.signal = null;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    gate.stdout_bytes = Buffer.byteLength(stdout);
    const output = `${stdout}\n${stderr}`;
    if (SECRET_LOOKING_OUTPUT.test(output)) throw new Error('Public site security validator output appears to contain a secret.');
    const parsed = parseJson(stdout);
    if (parsed.schema !== 'enigma.public_site_security_result.v1') throw new Error('Public site security validator emitted wrong schema.');
    if (parsed.ok !== true || parsed.status !== 'accepted') throw new Error('Public site security validator fixture must be accepted.');
    gate.evidence = {
      schema: parsed.schema,
      status: parsed.status,
      blocker_count: parsed.blockers?.length ?? null,
      file_count: parsed.checked?.file_count ?? null,
      has_headers: parsed.checked?.has_headers ?? null,
    };
  } catch (error) {
    gate.ok = false;
    gate.status = Number.isInteger(error.code) ? error.code : (gate.status ?? 1);
    gate.signal = error.signal ?? null;
    gate.stderr_bytes = Buffer.byteLength(error.stderr ?? '');
    gate.stdout_bytes = Buffer.byteLength(error.stdout ?? '');
    gate.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'PUBLIC_SITE_SECURITY_VALIDATOR_FAILED'),
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    gate.duration_ms = Date.now() - started;
    await rm(tempDir, { recursive: true, force: true });
  }

  return gate;
}

export async function runDomainTlsValidatorGate() {
  const started = Date.now();
  const tempDir = await mkdtemp(join(tmpdir(), 'enigma-domain-tls-audit-'));
  const evidencePath = join(tempDir, 'domain-tls.json');
  const gate = {
    name: 'domain-tls-validator',
    required: false,
    command: commandLabel(process.execPath, ['scripts/validate-domain-tls.mjs', '--evidence', '<domain-tls.json>']),
    ok: true,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };

  try {
    if (!(await pathExists(DOMAIN_TLS_VALIDATOR_SCRIPT))) {
      gate.evidence = {
        skipped: true,
        reason: 'Domain/TLS validator is absent in this local checkout.',
        script: DOMAIN_TLS_VALIDATOR_SCRIPT,
      };
      return gate;
    }
    await writeFile(evidencePath, `${JSON.stringify({
      schema: 'enigma.domain_tls_evidence.v1',
      domain: 'enigmamemory.com',
      public_url: 'https://enigmamemory.com/',
      dns: {
        provider: 'cloudflare',
        zone_ref: 'cloudflare://zone/enigmamemory.com',
        propagation_ref: 'dns-observation://enigmamemory.com/release-audit',
        status: 'verified',
        records: [
          {
            type: 'CNAME',
            name: 'enigmamemory.com',
            value_ref: 'pages://enigma-memory.pages.dev',
            status: 'verified',
          },
        ],
      },
      tls: {
        issuer: 'Cloudflare Inc ECC',
        certificate_ref: 'cloudflare-cert://enigmamemory.com/current',
        expires_at: '2099-12-23T12:00:00.000Z',
        renewal_ref: 'cloudflare-managed-renewal://enigmamemory.com',
        alert_ref: 'monitor://certificate-expiry/enigmamemory.com',
        status: 'active',
        subject_alt_names: ['enigmamemory.com', 'www.enigmamemory.com'],
      },
      endpoint: {
        url: 'https://enigmamemory.com/',
        status_code: 200,
        content_type: 'text/html; charset=utf-8',
        observed_at: '2026-06-23T12:00:00.000Z',
        public_site_security_ref: 'public-site-security-release-audit#local',
        security_headers: {
          'x-content-type-options': 'nosniff',
          'x-frame-options': 'DENY',
          'referrer-policy': 'strict-origin-when-cross-origin',
          'permissions-policy': 'camera=(), microphone=(), geolocation=()',
          'content-security-policy': "default-src 'self'",
        },
      },
      claim_boundary: {
        public_endpoint_only: true,
        backend_readiness_claim: false,
        credential_claim: false,
        token_roi_claim: false,
        provider_invoice_savings_claim: false,
      },
    }, null, 2)}\n`, 'utf8');
    const { stdout, stderr } = await execFile(process.execPath, ['scripts/validate-domain-tls.mjs', '--evidence', evidencePath], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    gate.status = 0;
    gate.signal = null;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    gate.stdout_bytes = Buffer.byteLength(stdout);
    const output = `${stdout}\n${stderr}`;
    if (SECRET_LOOKING_OUTPUT.test(output)) throw new Error('Domain/TLS validator output appears to contain a secret.');
    const parsed = parseJson(stdout);
    if (parsed.schema !== 'enigma.domain_tls_result.v1') throw new Error('Domain/TLS validator emitted wrong schema.');
    if (parsed.ok !== true || parsed.status !== 'accepted') throw new Error('Domain/TLS validator fixture must be accepted.');
    gate.evidence = {
      schema: parsed.schema,
      status: parsed.status,
      blocker_count: parsed.blockers?.length ?? null,
      domain: parsed.checked?.domain ?? null,
      endpoint_status_code: parsed.checked?.endpoint_status_code ?? null,
    };
  } catch (error) {
    gate.ok = false;
    gate.status = Number.isInteger(error.code) ? error.code : (gate.status ?? 1);
    gate.signal = error.signal ?? null;
    gate.stderr_bytes = Buffer.byteLength(error.stderr ?? '');
    gate.stdout_bytes = Buffer.byteLength(error.stdout ?? '');
    gate.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'DOMAIN_TLS_VALIDATOR_FAILED'),
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    gate.duration_ms = Date.now() - started;
    await rm(tempDir, { recursive: true, force: true });
  }

  return gate;
}

export async function runSecurityThreatModelValidatorGate() {
  const started = Date.now();
  const tempDir = await mkdtemp(join(tmpdir(), 'enigma-threat-model-audit-'));
  const reviewPath = join(tempDir, 'security-threat-model.json');
  const gate = {
    name: 'security-threat-model-validator',
    required: false,
    command: commandLabel(process.execPath, ['scripts/validate-security-threat-model.mjs', '--review', '<security-threat-model.json>']),
    ok: true,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };

  try {
    if (!(await pathExists(SECURITY_THREAT_MODEL_VALIDATOR_SCRIPT))) {
      gate.evidence = {
        skipped: true,
        reason: 'Security threat model validator is absent in this local checkout.',
        script: SECURITY_THREAT_MODEL_VALIDATOR_SCRIPT,
      };
      return gate;
    }
    const assetIds = [
      'local_vault',
      'mcp_server',
      'native_host',
      'relay',
      'gateway',
      'optimizer',
      'metering',
      'settlement',
      'public_site',
      'domain_tls',
      'kms_custody',
      'durable_storage',
      'siem_export',
      'backup_restore',
    ];
    const boundaryIds = [
      'local_device',
      'browser_extension',
      'mcp_client',
      'provider_page',
      'relay_api',
      'gateway_api',
      'operator_admin',
      'cloud_provider',
      'public_site',
    ];
    const nonClaimIds = [
      'provider_deletion',
      'model_forgetting',
      'token_roi_profit_equity',
      'compliance_certification',
      'tamper_proof_hardware',
      'provider_invoice_savings',
    ];
    const entry = (id) => ({
      id,
      owner: `${id}-owner`,
      evidence_ref: `security://release-audit/${id}`,
      status: 'verified',
    });
    await writeFile(reviewPath, `${JSON.stringify({
      schema: 'enigma.security_threat_model_review.v1',
      metadata: {
        review_id: 'release-audit-threat-model',
        environment: 'production-fixture',
        tenant: 'release-audit',
        owner: 'security-owner',
        reviewer: 'security-reviewer',
        approved_at: '2026-06-23T12:00:00.000Z',
        approval_ref: 'ticket://security/threat-model-approved',
        status: 'approved',
      },
      source_refs: {
        security_policy_ref: 'SECURITY.md#current',
        threat_model_ref: 'docs/security-threat-model.md#current',
        public_api_ref: 'docs/public-api-reference.md#current',
        operator_acceptance_ref: 'docs/operator-acceptance-packet.md#current',
      },
      assets: assetIds.map(entry),
      trust_boundaries: boundaryIds.map(entry),
      risks: [
        {
          id: 'relay-plaintext-leakage',
          asset_id: 'relay',
          boundary_id: 'relay_api',
          adversary: 'malicious client',
          abuse_case: 'submits memory-bearing payloads',
          control_ref: 'apps/relay/plaintext-rejection',
          evidence_ref: 'test://enigma-network/plaintext-rejection',
          owner: 'relay-owner',
          status: 'mitigated',
          tests: ['test/enigma-network.test.mjs'],
        },
        {
          id: 'public-site-pii-leakage',
          asset_id: 'public_site',
          boundary_id: 'public_site',
          adversary: 'accidental publisher',
          abuse_case: 'publishes personal contact data or private collateral',
          control_ref: 'scripts/validate-public-site-security.mjs',
          evidence_ref: 'test://enigma-public-site-security',
          owner: 'site-owner',
          status: 'mitigated',
          tests: ['test/enigma-public-site-security.test.mjs'],
        },
      ],
      non_claims: nonClaimIds.map((id) => ({
        id,
        claimed: false,
        evidence_ref: `policy://non-claim/${id}`,
      })),
      review_cadence: {
        next_review_at: '2026-09-23T12:00:00.000Z',
        trigger_ref: 'runbook://security/threat-model-trigger',
        owner: 'security-owner',
      },
    }, null, 2)}\n`, 'utf8');
    const { stdout, stderr } = await execFile(process.execPath, ['scripts/validate-security-threat-model.mjs', '--review', reviewPath], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    gate.status = 0;
    gate.signal = null;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    gate.stdout_bytes = Buffer.byteLength(stdout);
    const output = `${stdout}\n${stderr}`;
    if (SECRET_LOOKING_OUTPUT.test(output)) throw new Error('Security threat model validator output appears to contain a secret.');
    const parsed = parseJson(stdout);
    if (parsed.schema !== 'enigma.security_threat_model_result.v1') throw new Error('Security threat model validator emitted wrong schema.');
    if (parsed.ok !== true || parsed.status !== 'accepted') throw new Error('Security threat model validator fixture must be accepted.');
    gate.evidence = {
      schema: parsed.schema,
      status: parsed.status,
      blocker_count: parsed.blockers?.length ?? null,
      assets_covered: parsed.checked?.assets_covered ?? null,
      boundaries_covered: parsed.checked?.boundaries_covered ?? null,
      risks: parsed.checked?.risks ?? null,
    };
  } catch (error) {
    gate.ok = false;
    gate.status = Number.isInteger(error.code) ? error.code : (gate.status ?? 1);
    gate.signal = error.signal ?? null;
    gate.stderr_bytes = Buffer.byteLength(error.stderr ?? '');
    gate.stdout_bytes = Buffer.byteLength(error.stdout ?? '');
    gate.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'SECURITY_THREAT_MODEL_VALIDATOR_FAILED'),
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    gate.duration_ms = Date.now() - started;
    await rm(tempDir, { recursive: true, force: true });
  }

  return gate;
}

export async function runCloudflareOpsHelpGate() {
  const started = Date.now();
  const gate = {
    name: 'cloudflare-ops-help',
    required: false,
    command: commandLabel(process.execPath, ['scripts/cloudflare-ops.mjs', '--help']),
    ok: true,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };

  try {
    if (!(await pathExists(CLOUDFLARE_OPS_SCRIPT))) {
      gate.evidence = {
        skipped: true,
        reason: 'Cloudflare ops helper is absent in this local checkout.',
        script: CLOUDFLARE_OPS_SCRIPT,
      };
      return gate;
    }

    const { stdout, stderr } = await execFile(process.execPath, ['scripts/cloudflare-ops.mjs', '--help'], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    gate.status = 0;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    gate.stdout_bytes = Buffer.byteLength(stdout);
    gate.evidence = validateCloudflareOpsHelp(stdout);
    gate.ok = true;
  } catch (error) {
    gate.ok = false;
    gate.status = Number.isInteger(error.code) ? error.code : (gate.status ?? 1);
    gate.signal = error.signal ?? null;
    gate.stderr_bytes = Buffer.byteLength(error.stderr ?? '');
    gate.stdout_bytes = Buffer.byteLength(error.stdout ?? '');
    gate.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'CLOUDFLARE_OPS_HELP_FAILED'),
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    gate.duration_ms = Date.now() - started;
  }

  return gate;
}

export async function runInfrastructureReadinessGate() {
  const started = Date.now();
  const requestedManifest = process.env[ENIGMA_INFRASTRUCTURE_READINESS_MANIFEST];
  const liveRequested = process.env[ENIGMA_INFRASTRUCTURE_READINESS_LIVE] === '1';
  let manifest = requestedManifest;
  let generatedManifest = false;
  const gate = {
    name: 'infrastructure-readiness',
    required: false,
    command: commandLabel(process.execPath, [
      'scripts/infrastructure-readiness.mjs',
      ...(requestedManifest ? ['--manifest', requestedManifest] : []),
      ...(liveRequested ? ['--live', '--cloudflare-live', 'off'] : []),
    ]),
    ok: true,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };

  try {
    const scriptExists = await pathExists(INFRASTRUCTURE_READINESS_SCRIPT);
    if (!scriptExists) {
      gate.evidence = {
        skipped: true,
        reason: 'Infrastructure readiness helper is absent in this local checkout.',
        script: INFRASTRUCTURE_READINESS_SCRIPT,
        manifest_env: ENIGMA_INFRASTRUCTURE_READINESS_MANIFEST,
        live_env: ENIGMA_INFRASTRUCTURE_READINESS_LIVE,
      };
      return gate;
    }

    if (!manifest) {
      const builderExists = await pathExists(PRODUCTION_READINESS_MANIFEST_BUILDER_SCRIPT);
      if (!builderExists) {
        gate.evidence = {
          skipped: true,
          reason: `Set ${ENIGMA_INFRASTRUCTURE_READINESS_MANIFEST} or restore the production readiness manifest builder to validate infrastructure readiness.`,
          script: INFRASTRUCTURE_READINESS_SCRIPT,
          manifest_env: ENIGMA_INFRASTRUCTURE_READINESS_MANIFEST,
          live_env: ENIGMA_INFRASTRUCTURE_READINESS_LIVE,
        };
        return gate;
      }
      const tempDir = await mkdtemp(join(tmpdir(), 'enigma-infrastructure-readiness-'));
      const manifestPath = join(tempDir, 'readiness-manifest.json');
      const { stdout: manifestStdout, stderr: manifestStderr } = await execFile(process.execPath, [
        'scripts/build-production-readiness-manifest.mjs',
        ...productionReadinessManifestFixtureArgs(),
      ], {
        cwd: PROJECT_ROOT,
        env: localOnlyEnv(),
        timeout: COMMAND_TIMEOUT_MS,
        maxBuffer: MAX_OUTPUT_BYTES,
        windowsHide: true,
      });
      const manifestOutput = `${manifestStdout}\n${manifestStderr}`;
      if (SECRET_LOOKING_OUTPUT.test(manifestOutput)) throw new Error('Generated readiness manifest output appears to contain a secret.');
      const manifestJson = parseJson(manifestStdout);
      if (manifestJson.schema !== 'enigma.infrastructure_readiness_manifest.v1') throw new Error('Generated readiness manifest emitted wrong schema.');
      await writeFile(manifestPath, manifestStdout, 'utf8');
      manifest = manifestPath;
      generatedManifest = true;
    }

    const args = [
      'scripts/infrastructure-readiness.mjs',
      '--manifest',
      manifest,
      ...(liveRequested ? ['--live', '--cloudflare-live', 'off'] : []),
    ];
    gate.command = commandLabel(process.execPath, [
      'scripts/infrastructure-readiness.mjs',
      '--manifest',
      generatedManifest ? '<generated-production-readiness-manifest>' : manifest,
      ...(liveRequested ? ['--live', '--cloudflare-live', 'off'] : []),
    ]);
    const { stdout, stderr } = await execFile(process.execPath, args, {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    gate.status = 0;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    gate.stdout_bytes = Buffer.byteLength(stdout);
    gate.evidence = validateInfrastructureReadiness(parseJson(stdout), stdout, stderr, liveRequested);
    if (generatedManifest) {
      gate.evidence = {
        ...gate.evidence,
        generated_manifest: true,
        generated_manifest_source: 'production-readiness-manifest-builder',
      };
    }
    gate.ok = gate.evidence.ok === true;
    if (!gate.ok) {
      gate.error = {
        code: 'INFRASTRUCTURE_READINESS_NOT_OK',
        message: 'Infrastructure readiness reported ok: false.',
      };
    }
  } catch (error) {
    gate.ok = false;
    gate.status = Number.isInteger(error.code) ? error.code : (gate.status ?? 1);
    gate.signal = error.signal ?? null;
    gate.stderr_bytes = Buffer.byteLength(error.stderr ?? '');
    gate.stdout_bytes = Buffer.byteLength(error.stdout ?? '');
    const errorOutput = `${error.stdout ?? ''}\n${error.stderr ?? ''}\n${error instanceof Error ? error.message : String(error)}`;
    const secretLookingOutput = SECRET_LOOKING_OUTPUT.test(errorOutput);
    gate.error = {
      code: secretLookingOutput ? 'SECRET_LOOKING_OUTPUT' : (error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'INFRASTRUCTURE_READINESS_FAILED')),
      message: secretLookingOutput
        ? 'Infrastructure readiness output appears to contain a secret and was not included.'
        : (error instanceof Error ? error.message : String(error)),
    };
  } finally {
    gate.duration_ms = Date.now() - started;
  }

  return gate;
}

function requireTextIncludes(text, needle, message) {
  if (!text.includes(needle)) throw new Error(message);
}

const PRODUCTION_MANIFEST_REQUIRED_ENV_REF_SPECS = Object.freeze([
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

function validateRequiredHostedEnvRefs(text, scope) {
  const missing = PRODUCTION_MANIFEST_REQUIRED_ENV_REF_SPECS.filter((spec) => !spec.pattern.test(text)).map((spec) => spec.id);
  if (missing.length > 0) throw new Error(`${scope} missing hosted readiness env refs: ${missing.join(', ')}`);
  return PRODUCTION_MANIFEST_REQUIRED_ENV_REF_SPECS.length;
}

function validateProductionComposeManifest(text) {
  for (const service of ['relay', 'gateway']) {
    const servicePattern = new RegExp(`\\n  ${service}:\\n([\\s\\S]*?)(?=\\n  [a-z][a-z0-9_-]*:\\n|\\nsecrets:\\n|$)`);
    const match = servicePattern.exec(text);
    if (!match) throw new Error(`Production compose manifest missing ${service} service.`);
    const block = match[1];
    requireTextIncludes(block, 'NODE_ENV: production', `${service} production compose service must set NODE_ENV production.`);
    requireTextIncludes(block, 'ENIGMA_BACKEND_MODE: production', `${service} production compose service must set backend production mode.`);
    requireTextIncludes(block, 'ENIGMA_DISABLE_LOCAL_DEMO_FALLBACK: "true"', `${service} production compose service must disable local demo fallback.`);
    requireTextIncludes(block, 'ENIGMA_REQUIRE_OPERATOR_ACCEPTANCE_EVIDENCE: "true"', `${service} production compose service must require operator acceptance evidence.`);
    requireTextIncludes(block, 'ENIGMA_READINESS_FAIL_CLOSED: "true"', `${service} production compose service must fail closed for readiness.`);
    validateRequiredHostedEnvRefs(block, `${service} production compose service`);
    if (!/ports:\s*\n\s*-\s+"127\.0\.0\.1:\d+:\d+"/.test(block)) throw new Error(`${service} production compose service must not publish a public wildcard port.`);
  }
  requireTextIncludes(text, 'ENIGMA_REQUIRE_EXTERNAL_STORAGE: "true"', 'Production relay compose service must require external storage.');
  requireTextIncludes(text, 'ENIGMA_REQUIRE_EXTERNAL_KMS: "true"', 'Production compose services must require external KMS.');
  requireTextIncludes(text, 'ENIGMA_REQUIRE_SIEM_EXPORT: "true"', 'Production gateway compose service must require SIEM export.');
  const hostedReadinessRefCount = validateRequiredHostedEnvRefs(text, 'Production compose manifest');
  return {
    relay_fail_closed: true,
    gateway_fail_closed: true,
    public_ports_loopback_only: true,
    hosted_readiness_ref_count: hostedReadinessRefCount,
  };
}

function ingressBlock(text, name) {
  const document = text
    .split(/^---\s*$/m)
    .find((item) => /\bkind:\s*Ingress\b/.test(item) && new RegExp(`\\bname:\\s*${name}\\b`).test(item));
  if (document === undefined) throw new Error(`Kubernetes manifest missing ${name} ingress.`);
  return document;
}

function validateKubernetesBackendManifest(text) {
  const publicIngress = ingressBlock(text, 'enigma-public');
  const privateIngress = ingressBlock(text, 'enigma-admin');
  if (/pathType:\s*Prefix\b/.test(publicIngress)) throw new Error('Public Kubernetes ingress must not use prefix routing.');
  if (/path:\s*\/(?:$|\s)/.test(publicIngress)) throw new Error('Public Kubernetes ingress must not expose root.');
  if (/path:\s*\/(?:relay|witness|pairing|gateway|policy|siem|admin|data)\b/i.test(publicIngress)) {
    throw new Error('Public Kubernetes ingress must not expose admin or data-plane paths.');
  }
  const publicIngressPaths = [...publicIngress.matchAll(/path:\s*(\/[^\s]+)/g)].map((match) => match[1]);
  const publicIngressPathSet = new Set(publicIngressPaths);
  if (publicIngressPaths.length !== 4 || publicIngressPathSet.size !== 2 || !publicIngressPathSet.has('/readyz') || !publicIngressPathSet.has('/livez')) {
    throw new Error('Public Kubernetes ingress must expose only exact /readyz and /livez health paths.');
  }
  const exactPathMatches = [...publicIngress.matchAll(/path:\s*(\/[^\s]+)\s*\n\s*pathType:\s*Exact\b/g)].map((match) => match[1]);
  const exactPathSet = new Set(exactPathMatches);
  if (exactPathMatches.length !== publicIngressPaths.length || exactPathSet.size !== 2 || !exactPathSet.has('/readyz') || !exactPathSet.has('/livez')) {
    throw new Error('Public Kubernetes health ingress paths must all be Exact.');
  }
  if (!/operator-selected-private-ingress-class/.test(privateIngress)) throw new Error('Private Kubernetes admin ingress must stay on the private ingress class.');
  const hostedReadinessRefCount = validateRequiredHostedEnvRefs(text, 'Kubernetes backend manifest');
  return {
    public_readyz_paths: publicIngressPaths.filter((path) => path === '/readyz').length,
    public_livez_paths: publicIngressPaths.filter((path) => path === '/livez').length,
    public_prefix_paths: 0,
    public_admin_or_data_paths: 0,
    private_admin_ingress_class: true,
    hosted_readiness_ref_count: hostedReadinessRefCount,
  };
}

export async function runProductionManifestValidatorGate() {
  const started = Date.now();
  const gate = {
    name: 'production-manifest-validator',
    required: true,
    command: commandLabel(process.execPath, ['scripts/validate-production-manifests.mjs']),
    ok: false,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };

  try {
    if (!(await pathExists(PRODUCTION_MANIFEST_VALIDATOR_SCRIPT))) {
      throw new Error('Production manifest validator script is absent.');
    }
    const { stdout, stderr } = await execFile(process.execPath, ['scripts/validate-production-manifests.mjs'], {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    gate.status = 0;
    gate.stderr_bytes = Buffer.byteLength(stderr);
    gate.stdout_bytes = Buffer.byteLength(stdout);
    const output = `${stdout}\n${stderr}`;
    if (SECRET_LOOKING_OUTPUT.test(output)) throw new Error('Production manifest validator output appears to contain a secret.');
    const parsed = parseJson(stdout);
    if (parsed.schema !== 'enigma.production_manifest_result.v1') throw new Error('Production manifest validator emitted wrong schema.');
    if (parsed.ok !== true || parsed.status !== 'accepted') throw new Error('Production manifest validator did not accept reference manifests.');
    gate.evidence = {
      schema: parsed.schema,
      status: parsed.status,
      compose_hosted_readiness_ref_count: parsed.compose?.hosted_readiness_ref_count,
      compose_public_ports_loopback_only: parsed.compose?.public_ports_loopback_only,
      kubernetes_public_readyz_paths: parsed.kubernetes?.public_readyz_paths,
      kubernetes_public_livez_paths: parsed.kubernetes?.public_livez_paths,
      kubernetes_private_admin_ingress_class: parsed.kubernetes?.private_admin_ingress_class,
      blocker_count: Array.isArray(parsed.blockers) ? parsed.blockers.length : null,
    };
    gate.ok = true;
  } catch (error) {
    gate.status = Number.isInteger(error.code) ? error.code : (gate.status ?? 1);
    gate.signal = error.signal ?? null;
    gate.stderr_bytes ??= Buffer.byteLength(error.stderr ?? '');
    gate.stdout_bytes ??= Buffer.byteLength(error.stdout ?? '');
    gate.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'PRODUCTION_MANIFEST_VALIDATOR_FAILED'),
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    gate.duration_ms = Date.now() - started;
  }

  return gate;
}

export async function runProductionManifestSafetyGate() {
  const started = Date.now();
  const gate = {
    name: 'production-manifest-safety',
    required: true,
    command: 'static production manifest fail-closed audit',
    ok: false,
    status: null,
    signal: null,
    duration_ms: 0,
    evidence: {},
  };
  try {
    const [composeText, kubernetesText] = await Promise.all([
      readFile(PRODUCTION_COMPOSE_MANIFEST, 'utf8'),
      readFile(KUBERNETES_BACKEND_MANIFEST, 'utf8'),
    ]);
    gate.status = 0;
    gate.evidence = {
      compose: validateProductionComposeManifest(composeText),
      kubernetes: validateKubernetesBackendManifest(kubernetesText),
    };
    gate.ok = true;
  } catch (error) {
    gate.status = 1;
    gate.error = {
      code: 'PRODUCTION_MANIFEST_SAFETY_FAILED',
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    gate.duration_ms = Date.now() - started;
  }
  return gate;
}

function releaseAuditSummary(gates) {
  const requiredFailed = gates.filter((gate) => gate.required && !gate.ok).map((gate) => gate.name);
  return {
    schema: 'enigma.release_audit.v1',
    generated_at: new Date().toISOString(),
    ok: requiredFailed.length === 0,
    required_failed: requiredFailed,
    local_only: {
      docker_required: false,
      cloud_credentials_required: false,
      npm_publish_credentials_required: false,
      live_website_required: false,
    },
    gates,
  };
}

function embeddedReviewPacketAuditGate() {
  return {
    name: 'review-packet-embedded-boundary',
    required: false,
    command: 'embedded review-packet release-audit boundary',
    ok: true,
    status: 0,
    signal: null,
    duration_ms: 0,
    evidence: {
      reason: 'Release audit is running inside review-packet generation; recursive npm/test/pack gates are skipped for this embedded evidence only.',
      full_gate: 'Run scripts/release-audit.mjs without ENIGMA_REVIEW_PACKET_EMBEDDED for the complete required audit.',
    },
  };
}



export async function runReleaseAudit() {
  const gates = [];
  if (process.env[REVIEW_PACKET_EMBEDDED_ENV] === '1') {
    gates.push(await runLocalProvenanceGate());
    gates.push(embeddedReviewPacketAuditGate());
    return releaseAuditSummary(gates);
  }

  const check = npmInvocation(['run', 'check']);
  const test = await nodeTestInvocation();
  const pack = npmInvocation(['pack', '--dry-run']);
  gates.push(await runCommandGate('npm-check', check.command, check.args, { label: check.label, summarize: summarizeCheck }));
  gates.push(await runCommandGate('npm-test', test.command, test.args, { label: test.label, timeoutMs: TEST_TIMEOUT_MS, summarize: summarizeTests, summarizeFailure: summarizeNpmTestFailure }));
  gates.push(await runCommandGate('npm-pack-dry-run', pack.command, pack.args, { label: pack.label, summarize: summarizePack }));
  gates.push(await runCommandGate('local-pack-install-smoke', process.execPath, [LOCAL_PACK_INSTALL_SCRIPT], { label: 'node scripts/verify-local-pack-install.mjs', timeoutMs: TEST_TIMEOUT_MS, summarize: summarizeLocalPackInstall }));
  gates.push(await runDirectBinSmokes());
  gates.push(await runNativeHostInstallPlanGate());
  gates.push(await runLocalProvenanceGate());
  gates.push(await runReviewPacketGate());
  gates.push(await runMcpStdioSmoke());
  gates.push(await runPublicSitePreflightGate());
  gates.push(await runCloudflarePagesReleasePacketGate());
  gates.push(await runProductionHandoffPacketGate());
  gates.push(await runCloudflareTokenPolicyGate());
  gates.push(await runCloudflareTokenRequestGate());
  gates.push(await runGoalCompletionAuditGate());
  gates.push(await runPublicSiteSecurityValidatorGate());
  gates.push(await runDomainTlsValidatorGate());
  gates.push(await runSecurityThreatModelValidatorGate());
  gates.push(await runCloudflareOpsHelpGate());
  gates.push(await runBackendReadinessSmokeGate());
  gates.push(await runProductionBackendEnvKitGate());
  gates.push(await runHostedBackendLiveValidatorGate());
  gates.push(await runHostedBackendCollectorHelpGate());
  gates.push(await runEdgeBackendWorkerBuilderGate());
  gates.push(await runHostedProbeWorkerBuilderGate());
  gates.push(await runOperatorEvidenceStarterGate());
  gates.push(await runWhitepaperClaimsValidatorGate());
  gates.push(await runCloudflareCredentialsValidatorGate());
  gates.push(await runCloudflareWorkerInspectValidatorGate());
  gates.push(await runProductionDependencyReportGate());
  gates.push(await runProductionWorkplanGate());
  gates.push(await runProductionStatusBoardGate());
  gates.push(await runAiOrchestrationPlanGate());
  gates.push(await runProductionManifestValidatorGate());
  gates.push(await runProductionManifestSafetyGate());
  gates.push(await runInfrastructureReadinessGate());
  gates.push(await runProductionManifestBuilderGate());
  gates.push(await runProductionStorageMigrationGate());
  gates.push(await runOperatorAcceptanceValidatorGate());
  gates.push(await runBackupRestoreDrillValidatorGate());
  gates.push(await runIncidentDrillValidatorGate());
  gates.push(await runSupportSlaValidatorGate());
  gates.push(await runLegalComplianceApprovalValidatorGate());
  gates.push(await runMonitoringAlertingValidatorGate());
  gates.push(await runNetworkAccessPolicyValidatorGate());
  gates.push(await runKmsCustodyValidatorGate());
  gates.push(await runTenantPolicyApprovalValidatorGate());
  gates.push(await runMemoryOptimizationBenchmarkGate());

  gates.push(await runUsageMeteringValidatorGate());
  gates.push(await runServiceSettlementValidatorGate());
  return releaseAuditSummary(gates);
}

function readCliValue(argv, index, flag) {
  const value = argv[index + 1];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${flag} requires a value`);
  return value;
}

function parseReleaseAuditCliArgs(argv = process.argv.slice(2)) {
  const out = { out: null, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      out.help = true;
      continue;
    }
    if (token === '--out') {
      out.out = readCliValue(argv, index, token);
      index += 1;
      continue;
    }
    if (typeof token === 'string' && token.startsWith('--out=')) {
      out.out = token.slice('--out='.length);
      if (out.out.length === 0) throw new Error('--out requires a value');
      continue;
    }
    throw new Error(`Unknown release audit option: ${token}`);
  }
  return out;
}

function releaseAuditUsage() {
  return 'Usage: node scripts/release-audit.mjs [--out <file>]\\n\\nRuns local package/demo release gates and prints enigma.release_audit.v1 JSON. --out writes the same public-safe JSON to a file for production handoff or goal-audit ingestion.\\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseReleaseAuditCliArgs();
    if (args.help) {
      process.stdout.write(releaseAuditUsage());
      process.exitCode = 0;
    } else {
      const summary = await runReleaseAudit();
      if (args.out !== null) await writeFile(resolve(args.out), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
      process.exitCode = summary.ok ? 0 : 1;
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
