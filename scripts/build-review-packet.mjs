#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFile = promisify(execFileCallback);
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT = '.enigma-review-packet';
const SCHEMA = 'enigma.review_packet.v1';
const COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const RAW_MEMORY_SENTINEL = 'private launch-code phrase must not leave local memory';
const REVIEW_DOCS = Object.freeze([
  'README.md',
  'SECURITY.md',
  'docs/release-evidence-2026-06-23.md',
  'docs/security-threat-model.md',
  'docs/public-api-reference.md',
  'docs/operator-acceptance-packet.md',
  'docs/release-provenance-and-sbom.md',
  'launch/02_WHITEPAPER.md',
  'docs/competitive-memory-analysis.md',
]);
const REVIEW_SOURCE_FILES = Object.freeze([
  'apps/cli/bin/enigma.mjs',
  'apps/gateway/src/server.mjs',
  'apps/relay/src/server.mjs',
  'packages/adapters/src/index.js',
  'packages/adapters/PACKAGE_CONTRACT.md',
  'packages/mcp-server/src/index.js',
  'packages/metering/src/index.js',
  'packages/metering/PACKAGE_CONTRACT.md',
  'packages/optimizer/src/index.js',
  'packages/settlement/src/index.js',
  'packages/settlement/PACKAGE_CONTRACT.md',
  'packages/storage/src/index.js',
  'packages/storage/PACKAGE_CONTRACT.md',
  'deploy/docker-compose.production.example.yml',
  'deploy/kubernetes/enigma-backend.example.yaml',
  'scripts/build-operator-acceptance-packet.mjs',
  'scripts/build-production-readiness-manifest.mjs',
  'scripts/build-production-storage-migration.mjs',
  'scripts/cloudflare-secret-env.mjs',
  'scripts/build-cloudflare-pages-release-packet.mjs',
  'scripts/build-cloudflare-token-policy.mjs',
  'scripts/build-cloudflare-token-request.mjs',
  'scripts/build-production-handoff-packet.mjs',
  'scripts/build-goal-completion-audit.mjs',
  'scripts/run-backend-readiness-smoke.mjs',
  'scripts/validate-hosted-backend-live.mjs',
  'scripts/collect-hosted-backend-live-evidence.mjs',
  'scripts/build-hosted-probe-worker.mjs',
  'scripts/validate-production-manifests.mjs',
  'scripts/validate-backup-restore-drill.mjs',
  'scripts/validate-incident-drill.mjs',
  'scripts/validate-kms-custody.mjs',
  'scripts/validate-legal-compliance-approval.mjs',
  'scripts/validate-monitoring-alerting.mjs',
  'scripts/validate-network-access-policy.mjs',
  'scripts/validate-operator-acceptance.mjs',
  'scripts/validate-support-sla.mjs',
  'scripts/validate-tenant-policy-approval.mjs',
  'scripts/validate-usage-metering.mjs',
  'scripts/validate-service-settlement.mjs',
  'scripts/validate-public-site-security.mjs',
  'scripts/validate-domain-tls.mjs',
  'scripts/validate-security-threat-model.mjs',
  'test/enigma-adapters.test.mjs',
  'test/enigma-kms-custody.test.mjs',
  'test/enigma-legal-compliance.test.mjs',
  'test/enigma-metering.test.mjs',
  'test/enigma-monitoring-alerting.test.mjs',
  'test/enigma-network-access-policy.test.mjs',
  'test/enigma-network.test.mjs',
  'test/enigma-operator-acceptance.test.mjs',
  'test/enigma-settlement.test.mjs',
  'test/enigma-storage.test.mjs',
  'test/enigma-tenant-policy-approval.test.mjs',
  'test/enigma-usage-metering.test.mjs',
  'test/enigma-service-settlement.test.mjs',
  'test/enigma-public-site-security.test.mjs',
  'test/enigma-cloudflare-pages-packet.test.mjs',
  'test/enigma-cloudflare-secret-env.test.mjs',
  'test/enigma-cloudflare-token-policy.test.mjs',
  'test/enigma-cloudflare-token-request.test.mjs',
  'test/enigma-production-handoff.test.mjs',
  'test/enigma-goal-completion-audit.test.mjs',
  'test/enigma-backend-readiness-smoke.test.mjs',
  'test/enigma-hosted-backend-live.test.mjs',
  'test/enigma-hosted-backend-collector.test.mjs',
  'test/enigma-hosted-probe-worker.test.mjs',
  'test/enigma-production-manifests.test.mjs',
  'test/enigma-domain-tls.test.mjs',
  'test/enigma-security-threat-model.test.mjs',
]);
const CLAIM_BOUNDARY = 'Local hand-review evidence only: this packet is not npm publication, live Cloudflare deployment, hosted/BYOC readiness, legal approval, signed provenance, compliance status, or proof that external providers deleted or forgot data.';
const SECRET_OR_LOCAL_ARTIFACT_PATH = /(?:^|\/)(?:\.env(?:\.|$)|env\.local$|secrets?|credentials?|tokens?|api[-_]?keys?|private[-_]?keys?|private[-_]?local[-_]?memory|\.enigma|enigma[-_]?bundle|vault[-_]?bundle|local[-_]?bundle|bundle\.json|raw[-_]?memory|logs?|npm-debug\.log|yarn-error\.log|pnpm-debug\.log)(?:\/|$|[._-])|\.(?:log|pem|key|p12|pfx|jks|keystore)(?:\.|$)/i;
const PRIVATE_OR_INTERNAL_COLLATERAL_PATH = /(?:^|\/)(?:00_LAUNCH_README|05_SOLANA_TOKEN_LAUNCH_RUNBOOK|09_PITCH_DECK_OUTLINE|10_INVESTOR_AND_PARTNER_MEMO|11_ENTERPRISE_SALES_PLAYBOOK|17_LAUNCH_CHECKLIST|REVIEW_PACKET_MANIFEST|release-audit|local-provenance|npm-pack-dry-run)(?:\.(?:html|json|md|txt)|$)/i;
const TEXT_FILE = /\.(?:css|csv|html|js|json|md|mjs|svg|txt|xml|yml|yaml)$/i;

function normalizeRel(rel) {
  return String(rel).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/');
}

function npmInvocation(args) {
  const label = ['npm', ...args].join(' ');
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath && npmExecPath.endsWith('.js')) {
    return { command: process.execPath, args: [npmExecPath, ...args], label };
  }
  if (process.platform === 'win32') {
    return { command: process.env.ComSpec ?? 'cmd.exe', args: ['/d', '/s', '/c', label], label };
  }
  return { command: 'npm', args, label };
}

function localOnlyEnv(extra = {}) {
  const keep = ['PATH', 'Path', 'PATHEXT', 'SYSTEMROOT', 'SystemRoot', 'WINDIR', 'ComSpec', 'HOME', 'USERPROFILE', 'TMP', 'TEMP', 'TMPDIR'];
  const env = {};
  for (const key of keep) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return {
    ...env,
    CI: '1',
    npm_config_audit: 'false',
    npm_config_fund: 'false',
    npm_config_update_notifier: 'false',
    ...extra,
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out') {
      if (options.out !== undefined) throw new Error('--out may only be provided once');
      const value = argv[index + 1];
      if (!value) throw new Error('--out requires a directory path');
      options.out = value;
      index += 1;
    } else if (arg === '--public-site') {
      if (options.publicSite !== undefined) throw new Error('--public-site may only be provided once');
      const value = argv[index + 1];
      if (!value) throw new Error('--public-site requires a directory path');
      options.publicSite = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function packetTimestamp(now = new Date()) {
  if (typeof now === 'string') return new Date(now).toISOString();
  if (now instanceof Date) return now.toISOString();
  throw new Error('now must be a Date or ISO timestamp string');
}

function resolveOutputDir(out = DEFAULT_OUT) {
  const resolved = path.resolve(PROJECT_ROOT, out);
  const projectRootLower = PROJECT_ROOT.toLowerCase();
  const resolvedLower = resolved.toLowerCase();
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const dangerousRoots = new Set([
    path.parse(resolved).root.toLowerCase(),
    PROJECT_ROOT.toLowerCase(),
    home ? path.resolve(home).toLowerCase() : '',
  ].filter(Boolean));
  if (dangerousRoots.has(resolvedLower)) throw new Error(`Refusing to replace unsafe review packet output: ${resolved}`);
  if (projectRootLower.startsWith(`${resolvedLower}${path.sep}`)) throw new Error(`Refusing to place review packet at a parent of the project root: ${resolved}`);
  return resolved;
}

function safePacketPath(packetRoot, rel) {
  const normalized = normalizeRel(rel);
  if (!normalized || normalized.startsWith('../') || path.isAbsolute(normalized)) throw new Error(`Unsafe packet path: ${rel}`);
  const resolved = path.resolve(packetRoot, normalized);
  if (resolved !== packetRoot && !resolved.startsWith(`${packetRoot}${path.sep}`)) throw new Error(`Unsafe packet path escapes output: ${rel}`);
  return resolved;
}

function sourcePath(rel) {
  const normalized = normalizeRel(rel);
  if (!normalized || normalized.startsWith('../') || path.isAbsolute(normalized)) throw new Error(`Unsafe source path: ${rel}`);
  const resolved = path.resolve(PROJECT_ROOT, normalized);
  if (resolved !== PROJECT_ROOT && !resolved.startsWith(`${PROJECT_ROOT}${path.sep}`)) throw new Error(`Unsafe source path escapes project root: ${rel}`);
  return resolved;
}

function shouldDenyCopy(rel) {
  const normalized = normalizeRel(rel);
  if (normalized === 'launch/token-metadata.template.json' || normalized === 'site/launch/token-metadata.template.json') return false;
  if (normalized === 'evidence/local-provenance.json' || normalized === 'evidence/release-audit.json' || normalized === 'package/npm-pack-dry-run.json') return false;
  return SECRET_OR_LOCAL_ARTIFACT_PATH.test(normalized) || PRIVATE_OR_INTERNAL_COLLATERAL_PATH.test(normalized);
}

function assertCopyContentAllowed(full, rel) {
  if (!TEXT_FILE.test(rel)) return;
  const text = fs.readFileSync(full, 'utf8');
  if (text.includes(RAW_MEMORY_SENTINEL)) throw new Error(`${rel} contains the private raw-memory sentinel`);
}

function copyFileIntoPacket(packetRoot, sourceFull, destRel) {
  const normalizedDest = normalizeRel(destRel);
  if (shouldDenyCopy(normalizedDest)) throw new Error(`Refusing to copy denied review packet path: ${normalizedDest}`);
  assertCopyContentAllowed(sourceFull, normalizedDest);
  const destFull = safePacketPath(packetRoot, normalizedDest);
  fs.mkdirSync(path.dirname(destFull), { recursive: true });
  fs.copyFileSync(sourceFull, destFull);
  return normalizedDest;
}

function copyExistingDocs(packetRoot) {
  const copied = [];
  const skipped = [];
  for (const rel of REVIEW_DOCS) {
    const full = sourcePath(rel);
    if (!fs.existsSync(full)) {
      skipped.push(rel);
      continue;
    }
    const destRel = `docs/${normalizeRel(rel)}`;
    copied.push(copyFileIntoPacket(packetRoot, full, destRel));
  }
  return { copied, skipped };
}

function copyReviewSourceFiles(packetRoot) {
  const copied = [];
  const skipped = [];
  for (const rel of REVIEW_SOURCE_FILES) {
    const normalized = normalizeRel(rel);
    const full = sourcePath(normalized);
    if (!fs.existsSync(full)) {
      skipped.push(normalized);
      continue;
    }
    const destRel = `source/${normalized}`;
    copied.push(copyFileIntoPacket(packetRoot, full, destRel));
  }
  return { copied, skipped };
}

function collectSourceFiles(root, dir = root, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = normalizeRel(path.relative(root, full));
    if (entry.isSymbolicLink()) {
      out.push({ rel, denied: true, reason: 'symbolic links are not copied into review packets' });
    } else if (entry.isDirectory()) {
      if (shouldDenyCopy(`${rel}/`)) out.push({ rel: `${rel}/`, denied: true, reason: 'denied private/local artifact path' });
      else collectSourceFiles(root, full, out);
    } else if (entry.isFile()) {
      if (shouldDenyCopy(rel)) out.push({ rel, denied: true, reason: 'denied private/local artifact path' });
      else out.push({ rel, full, denied: false });
    }
  }
  return out;
}

function copyPublicSite(packetRoot, publicSite) {
  if (!publicSite) return { copied: [], denied: [], source: null };
  const sourceRoot = path.resolve(PROJECT_ROOT, publicSite);
  if (!fs.existsSync(sourceRoot) || !fs.statSync(sourceRoot).isDirectory()) throw new Error(`--public-site must point to an existing directory: ${publicSite}`);
  const copied = [];
  const denied = [];
  for (const entry of collectSourceFiles(sourceRoot)) {
    if (entry.denied) {
      denied.push({ path: entry.rel, reason: entry.reason });
      continue;
    }
    try {
      copied.push(copyFileIntoPacket(packetRoot, entry.full, `site/${entry.rel}`));
    } catch (error) {
      denied.push({ path: entry.rel, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return { copied, denied, source: sourceRoot };
}

function publicSiteSummary(site) {
  return {
    provided: site.source !== null,
    copied: site.copied,
    denied_count: site.denied.length,
  };
}

function displayOutputDir(packetRoot) {
  const rel = normalizeRel(path.relative(PROJECT_ROOT, packetRoot));
  if (!rel || rel.startsWith('../') || shouldDenyCopy(rel)) return '<review-packet-output>';
  return rel;
}

function sha256File(full) {
  const hash = createHash('sha256');
  hash.update(fs.readFileSync(full));
  return `sha256:${hash.digest('hex')}`;
}

function packetFiles(packetRoot) {
  return collectSourceFiles(packetRoot)
    .filter((entry) => !entry.denied && entry.rel !== 'REVIEW_PACKET_MANIFEST.json')
    .map((entry) => ({
      path: entry.rel,
      bytes: fs.statSync(entry.full).size,
      sha256: sha256File(entry.full),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function parseJsonOrNull(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function summarizeJson(value) {
  if (value === null || typeof value !== 'object') return {};
  const summary = {};
  for (const key of ['schema', 'ok', 'file_count', 'root_hash']) {
    if (Object.hasOwn(value, key)) summary[key] = value[key];
  }
  if (value.counts && typeof value.counts === 'object') summary.counts = value.counts;
  if (Array.isArray(value.required_failed)) summary.required_failed = value.required_failed;
  if (Array.isArray(value.gates)) {
    summary.gates = value.gates.map((gate) => ({ name: gate.name, ok: gate.ok, status: gate.status ?? null }));
  }
  if (Array.isArray(value) && value[0] && typeof value[0] === 'object') {
    summary.entries = value.length;
    summary.files = Array.isArray(value[0].files) ? value[0].files.length : undefined;
  }
  return summary;
}

async function invokeCommand(commandRunner, command, args, options) {
  if (commandRunner) return commandRunner(command, args, options);
  return execFile(command, args, options);
}

function shellArgLabel(value) {
  const text = String(value);
  if (text.length === 0) return '""';
  if (!/[\s"]/u.test(text)) return text;
  return `"${text.replace(/"/gu, '\\"')}"`;
}

function commandSummaryLabel(command, args) {
  const binary = command === process.execPath ? 'node' : (path.basename(command).toLowerCase().startsWith('npm') ? 'npm' : command);
  return [binary, ...args].map(shellArgLabel).join(' ');
}



async function runCommand({ name, command, args, outputRel, packetRoot, expectedJson = true, env = {}, commandRunner = null }) {
  const started = Date.now();
  const outputFull = safePacketPath(packetRoot, outputRel);
  fs.mkdirSync(path.dirname(outputFull), { recursive: true });
  const record = {
    name,
    command: commandSummaryLabel(command, args),
    ok: false,
    status: null,
    signal: null,
    duration_ms: 0,
    output: normalizeRel(outputRel),
    stdout_bytes: 0,
    stderr_bytes: 0,
    summary: {},
  };
  let stdout = '';
  let stderr = '';
  try {
    const result = await invokeCommand(commandRunner, command, args, {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(env),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    stdout = result.stdout;
    stderr = result.stderr;
    record.ok = true;
    record.status = 0;
  } catch (error) {
    stdout = String(error.stdout ?? '');
    stderr = String(error.stderr ?? '');
    record.status = Number.isInteger(error.code) ? error.code : null;
    record.signal = error.signal ?? null;
    record.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'COMMAND_FAILED'),
      message: error.message,
    };
  } finally {
    record.duration_ms = Date.now() - started;
    record.stdout_bytes = Buffer.byteLength(stdout);
    record.stderr_bytes = Buffer.byteLength(stderr);
  }

  const parsed = parseJsonOrNull(stdout);
  if (parsed !== null) {
    fs.writeFileSync(outputFull, `${JSON.stringify(parsed, null, 2)}\n`);
    record.summary = summarizeJson(parsed);
  } else if (expectedJson) {
    const diagnostic = {
      schema: 'enigma.review_packet.command_failure.v1',
      command: record.command,
      status: record.status,
      signal: record.signal,
      stdout_bytes: record.stdout_bytes,
      stderr_bytes: record.stderr_bytes,
      error: record.error ?? { code: 'INVALID_JSON', message: 'Command did not emit JSON on stdout' },
    };
    fs.writeFileSync(outputFull, `${JSON.stringify(diagnostic, null, 2)}\n`);
    record.ok = false;
    record.summary = { schema: diagnostic.schema };
    record.error ??= diagnostic.error;
  } else {
    fs.writeFileSync(outputFull, stdout);
  }
  return record;
}

async function writeProvenance(packetRoot, env, commandRunner = null) {
  const outputRel = 'evidence/local-provenance.json';
  const outputFull = safePacketPath(packetRoot, outputRel);
  fs.mkdirSync(path.dirname(outputFull), { recursive: true });
  const command = process.execPath;
  const args = ['scripts/release-provenance.mjs', '--out', outputFull];
  const started = Date.now();
  const record = {
    name: 'local-provenance',
    command: ['node', 'scripts/release-provenance.mjs', '--out', outputRel].join(' '),
    ok: false,
    status: null,
    signal: null,
    duration_ms: 0,
    output: outputRel,
    stdout_bytes: 0,
    stderr_bytes: 0,
    summary: {},
  };
  let stdout = '';
  let stderr = '';
  try {
    const result = await invokeCommand(commandRunner, command, args, {
      cwd: PROJECT_ROOT,
      env: localOnlyEnv(env),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    stdout = result.stdout;
    stderr = result.stderr;
    record.ok = true;
    record.status = 0;
  } catch (error) {
    stdout = String(error.stdout ?? '');
    stderr = String(error.stderr ?? '');
    record.status = Number.isInteger(error.code) ? error.code : null;
    record.signal = error.signal ?? null;
    record.error = {
      code: error.killed ? 'COMMAND_TIMEOUT' : (error.code ?? 'COMMAND_FAILED'),
      message: error.message,
    };
  } finally {
    record.duration_ms = Date.now() - started;
    record.stdout_bytes = Buffer.byteLength(stdout);
    record.stderr_bytes = Buffer.byteLength(stderr);
  }
  const provenance = fs.existsSync(outputFull) ? parseJsonOrNull(fs.readFileSync(outputFull, 'utf8')) : null;
  if (provenance !== null) {
    record.summary = summarizeJson(provenance);
  } else {
    const diagnostic = {
      schema: 'enigma.review_packet.command_failure.v1',
      command: record.command,
      status: record.status,
      signal: record.signal,
      stdout_bytes: record.stdout_bytes,
      stderr_bytes: record.stderr_bytes,
      error: record.error ?? { code: 'MISSING_PROVENANCE_JSON', message: 'release-provenance did not write JSON evidence' },
    };
    fs.writeFileSync(outputFull, `${JSON.stringify(diagnostic, null, 2)}\n`);
    record.ok = false;
    record.summary = { schema: diagnostic.schema };
    record.error ??= diagnostic.error;
  }
  return record;
}

async function writeReleaseAudit(packetRoot, env, commandRunner = null) {
  return runCommand({
    name: 'release-audit',
    command: process.execPath,
    args: ['scripts/release-audit.mjs'],
    outputRel: 'evidence/release-audit.json',
    packetRoot,
    env: { ...env, ENIGMA_REVIEW_PACKET_EMBEDDED: '1' },
    commandRunner,
  });
}

async function writePackMetadata(packetRoot, env, commandRunner = null) {
  const npm = npmInvocation(['pack', '--dry-run', '--json', '--ignore-scripts']);
  return runCommand({
    name: 'npm-pack-dry-run-json',
    command: npm.command,
    args: npm.args,
    outputRel: 'package/npm-pack-dry-run.json',
    packetRoot,
    env,
    commandRunner,
  });
}

function blockersFrom(commands, copyResults) {
  const blockers = [];
  for (const command of commands) {
    if (!command.ok) blockers.push({ kind: 'command', name: command.name, detail: command.error?.message ?? `status ${command.status}` });
    if (Array.isArray(command.summary.required_failed) && command.summary.required_failed.length > 0) {
      blockers.push({ kind: 'release-audit', name: command.name, detail: `required gates failed: ${command.summary.required_failed.join(', ')}` });
    }
  }
  if (copyResults.denied.length > 0) {
    blockers.push({ kind: 'denied-site-copy', count: copyResults.denied.length, detail: 'denied public site paths were excluded from the review packet' });
  }
  return blockers.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function ensureCleanOutput(packetRoot) {
  fs.rmSync(packetRoot, { recursive: true, force: true });
  fs.mkdirSync(packetRoot, { recursive: true });
}

export async function buildReviewPacket(options = {}) {
  const packetRoot = resolveOutputDir(options.out ?? DEFAULT_OUT);
  const generatedAt = packetTimestamp(options.now ?? new Date());
  ensureCleanOutput(packetRoot);

  const sources = copyReviewSourceFiles(packetRoot);
  const docs = copyExistingDocs(packetRoot);
  const site = copyPublicSite(packetRoot, options.publicSite);
  const env = options.env ?? {};
  const commandRunner = options.commandRunner ?? null;
  const commands = [
    await writeProvenance(packetRoot, env, commandRunner),
    await writeReleaseAudit(packetRoot, env, commandRunner),
    await writePackMetadata(packetRoot, env, commandRunner),
  ];
  const blockers = blockersFrom(commands, site);
  const manifest = {
    schema: SCHEMA,
    generated_at: generatedAt,
    claim_boundary: CLAIM_BOUNDARY,
    output_dir: displayOutputDir(packetRoot),
    directories: {
      source: sources.copied.length > 0,
      evidence: fs.existsSync(safePacketPath(packetRoot, 'evidence')),
      docs: docs.copied.length > 0,
      package: fs.existsSync(safePacketPath(packetRoot, 'package')),
      site: site.copied.length > 0,
    },
    sources,
    commands,
    docs,
    site: publicSiteSummary(site),
    blockers,
    files: packetFiles(packetRoot),
  };
  const manifestFull = safePacketPath(packetRoot, 'REVIEW_PACKET_MANIFEST.json');
  fs.writeFileSync(manifestFull, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const manifest = await buildReviewPacket(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify({ ok: true, path: path.join(manifest.output_dir, 'REVIEW_PACKET_MANIFEST.json'), blockers: manifest.blockers.length }, null, 2)}\n`);
    process.exitCode = manifest.blockers.length === 0 ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
