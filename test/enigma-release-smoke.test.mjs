import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const PROJECT_ROOT_PATH = fileURLToPath(new URL('../', import.meta.url));
const CLI_ENTRYPOINT = 'apps/cli/bin/enigma.mjs';
const PRIVATE_MEMORY_URL = new URL('./fixtures/private-memory.txt', import.meta.url);
const JSON_OUTPUT_LIMIT = 1024 * 1024;
const PACKAGE_JSON_URL = new URL('../package.json', import.meta.url);
const BROWSER_NATIVE_BRIDGE_URL = new URL('../apps/browser-extension/src/native-bridge.js', import.meta.url);
const NATIVE_HOST_NAME = 'com.enigma.native_host';
const NATIVE_HOST_BIN_NAME = 'enigma-native-host';
const NATIVE_HOST_BIN_REL = 'apps/native-host/bin/enigma-native-host.mjs';
const RELEASE_PROVENANCE_SCHEMA = 'enigma.release_provenance.v1';
const RELEASE_PROVENANCE_SCRIPT = 'scripts/release-provenance.mjs';
const RELEASE_AUDIT_SCRIPT = 'scripts/release-audit.mjs';
const CLOUDFLARE_OPS_SCRIPT = 'scripts/cloudflare-ops.mjs';
const INFRASTRUCTURE_READINESS_SCHEMA = 'enigma.infrastructure_readiness.v1';
const INFRASTRUCTURE_READINESS_MANIFEST_SCHEMA = 'enigma.infrastructure_readiness_manifest.v1';
const INFRASTRUCTURE_READINESS_SCRIPT = 'scripts/infrastructure-readiness.mjs';
const INFRASTRUCTURE_READINESS_MANIFEST_SCHEMA_PATH = 'specs/infrastructure-readiness-manifest-v1.schema.json';
const REVIEW_PACKET_SCHEMA = 'enigma.review_packet.v1';
const REVIEW_PACKET_MANIFEST = 'REVIEW_PACKET_MANIFEST.json';
const REVIEW_PACKET_EMBEDDED_ENV = 'ENIGMA_REVIEW_PACKET_EMBEDDED';
const SHA256_PREFIXED_DIGEST = /^sha256:[0-9a-f]{64}$/;
const PRIVATE_PUBLIC_SITE_COLLATERAL_PATH = /(?:^|\/)(?:private|internal|launch-code|investor|token(?:omics)?|sales|marketing|funnel|community|social|adoption|objections|faq|whitepaper)[^/]*\.(?:md|html|json)$/i;
const LOCAL_BUNDLE_LOG_OR_SECRET_PATH = /(?:^|\/)(?:\.env(?:\.|$)|env\.local$|secrets?|credentials?|tokens?|api[-_]?keys?|private[-_]?keys?|\.enigma|enigma[-_]?bundle|vault[-_]?bundle|bundle\.json|logs?|npm-debug\.log|yarn-error\.log|pnpm-debug\.log)(?:\/|$|[._-])/i;
const PRIVATE_REVIEW_PACKET_COLLATERAL_PATH = /(?:^|\/)(?:\d+[_-])?(?:private|internal|launch-code|executive|investor|partner|sales|marketing|funnel|community|social|adoption|objections|faq|pitch|demo[-_]?scripts?|content[-_]?calendar|brand[-_]?messaging)[^/]*\.(?:html|json|md|txt)$/i;
const REVIEW_PACKET_TEXT_FILE = /\.(?:css|csv|html|js|json|md|mjs|svg|txt|xml|ya?ml)$/i;
const NATIVE_HOST_MANIFEST_RELS = Object.freeze([
  'apps/native-host/manifests/com.enigma.native_host.chrome.json',
  'apps/native-host/manifests/com.enigma.native_host.edge.json',
  'apps/native-host/manifests/com.enigma.native_host.firefox.json',
]);
const NATIVE_HOST_MANIFEST_GENERATION_CASES = Object.freeze([
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
    extensionId: 'enigma-release-smoke@example.invalid',
    allowlistKey: 'allowed_extensions',
    expectedAllowlist: ['enigma-release-smoke@example.invalid'],
  },
]);
const PUBLIC_SITE_PREFLIGHT_SCHEMA = 'enigma.public_site_preflight.v1';
const PUBLIC_SITE_PACKAGE_PATH = fileURLToPath(new URL('../../github-upload/enigma-memory-site/', import.meta.url));
const PUBLIC_SITE_PREFLIGHT_SCRIPT_PATH = join(PUBLIC_SITE_PACKAGE_PATH, 'scripts', 'preflight_public_site.py');
const PUBLIC_SITE_DEFAULT_PATH = join(PUBLIC_SITE_PACKAGE_PATH, '_public_site');
const NATIVE_HOST_DOC_RELS = Object.freeze([
  'README.md',
  'apps/browser-extension/README.md',
  'docs/install-anywhere.md',
  'docs/production-release-checklist.md',
  'docs/public-api-reference.md',
]);
const RAW_MEMORY_EXAMPLE_FIELD = /"(?:raw_memory|plaintext|prompt|response|memory)"\s*:\s*"[^"]+"/i;
const LOCAL_ENV_KEYS = Object.freeze([
  'PATH',
  'Path',
  'PATHEXT',
  'SystemRoot',
  'WINDIR',
  'windir',
  'TEMP',
  'TMP',
  'TMPDIR',
  'HOME',
  'USERPROFILE',
]);
const CLOUD_CREDENTIAL_KEY = /(?:API[_-]?KEY|TOKEN|SECRET|CREDENTIAL|OPENAI|ANTHROPIC|GOOGLE|GEMINI|AWS_|AZURE_|CLOUDFLARE|MOONSHOT|KIMI)/i;
const PUBLIC_PLAINTEXT_FIELD = /"(?:body|text|content|plaintext|raw_memory|prompt|response|memory)"\s*:/;

function localOnlyEnv() {
  const env = { NO_COLOR: '1', FORCE_COLOR: '0' };
  for (const key of LOCAL_ENV_KEYS) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  return env;
}

const RELEASE_SMOKE_ENV = Object.freeze(localOnlyEnv());

async function withTempDir(prefix, fn) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function runCli(args, expectedStatus = 0) {
  let result;
  try {
    result = await execFileAsync(process.execPath, [CLI_ENTRYPOINT, ...args], {
      cwd: PROJECT_ROOT_PATH,
      env: RELEASE_SMOKE_ENV,
      maxBuffer: JSON_OUTPUT_LIMIT,
      windowsHide: true,
    });
    result = { status: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    result = {
      status: Number.isInteger(error.code) ? error.code : 1,
      stdout: String(error.stdout ?? ''),
      stderr: String(error.stderr ?? ''),
    };
  }

  assert.equal(result.status, expectedStatus, `CLI exited with ${result.status}, expected ${expectedStatus}`);
  assert.equal(result.stderr.trim(), '', 'CLI should not write stderr during release smoke');
  return result;
}

async function runCliJson(args, expectedStatus = 0) {
  const result = await runCli(args, expectedStatus);
  const stdout = result.stdout.trim();
  assert.notEqual(stdout, '', 'CLI produced no JSON stdout');
  try {
    return JSON.parse(stdout);
  } catch {
    assert.fail('CLI stdout was not parseable JSON');
  }
}

function assertNoPublicMemoryLeak(value, privateMemory) {
  const encoded = typeof value === 'string' ? value : JSON.stringify(value);
  assert.equal(encoded.includes(privateMemory), false, 'public proof artifact exposed private fixture memory');
  assert.equal(PUBLIC_PLAINTEXT_FIELD.test(encoded), false, 'public proof artifact exposed a plaintext-shaped field');
}

function assertNoSentinelLeaks(value, sentinels) {
  const encoded = typeof value === 'string' ? value : JSON.stringify(value);
  for (const sentinel of sentinels) {
    assert.equal(encoded.includes(sentinel), false, `JSON output leaked sentinel ${sentinel}`);
  }
}

function projectUrl(rel) {
  return new URL(`../${rel}`, import.meta.url);
}

async function readProjectText(rel) {
  return readFile(projectUrl(rel), 'utf8');
}

function packageFilesCover(pkg, rel) {
  const normalizedRel = String(rel).replace(/\\/g, '/').replace(/^\.\//, '');
  return pkg.files.some((entry) => {
    const normalizedEntry = String(entry).replace(/\\/g, '/').replace(/^\.\//, '');
    if (normalizedEntry.endsWith('/')) {
      return normalizedRel.startsWith(normalizedEntry);
    }
    return normalizedEntry === normalizedRel;
  });
}

function assertGeneratedNativeHostManifest(manifest, { browser, hostPath, allowlistKey, expectedAllowlist }) {
  assert.equal(manifest.name, NATIVE_HOST_NAME, `${browser} manifest must use the bridge host name`);
  assert.equal(manifest.type, 'stdio', `${browser} manifest must be a stdio native messaging host`);
  assert.equal(manifest.path, hostPath, `${browser} manifest must preserve the absolute host path`);
  assert.equal(typeof manifest.description, 'string', `${browser} manifest must include a description`);
  assert.deepEqual(manifest[allowlistKey], expectedAllowlist, `${browser} manifest must scope the expected browser allowlist`);

  const otherAllowlistKey = allowlistKey === 'allowed_origins' ? 'allowed_extensions' : 'allowed_origins';
  assert.equal(Object.hasOwn(manifest, otherAllowlistKey), false, `${browser} manifest must not include both browser allowlist shapes`);
}


async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function assertReleaseProvenanceOutput(provenance, pkg) {
  assert.equal(provenance.schema, RELEASE_PROVENANCE_SCHEMA);
  assert.equal(provenance.package?.name, pkg.name);
  assert.equal(provenance.package?.version, pkg.version);
  assert.equal(provenance.package?.bins?.[NATIVE_HOST_BIN_NAME], NATIVE_HOST_BIN_REL);
  assert.match(provenance.root_hash, SHA256_PREFIXED_DIGEST);
  assert.ok(Array.isArray(provenance.files), 'local provenance must include file hash records');
  assert.equal(provenance.files.length, provenance.counts?.files, 'local provenance count must match file records');
  assert.ok(provenance.files.length > 0, 'local provenance must include packaged files');
  for (const file of provenance.files) {
    assert.equal(PRIVATE_PUBLIC_SITE_COLLATERAL_PATH.test(file.path), false, `provenance included private/internal public collateral path ${file.path}`);
    assert.equal(LOCAL_BUNDLE_LOG_OR_SECRET_PATH.test(file.path), false, `provenance included local bundle/log/secret path ${file.path}`);
    assert.match(file.sha256, SHA256_PREFIXED_DIGEST, `${file.path} must have a sha256-prefixed hash`);
  }
}

async function assertReviewPacketFiles(outDir, manifest) {
  assert.equal(manifest.schema, REVIEW_PACKET_SCHEMA);
  assert.match(manifest.claim_boundary, /not npm publication/i);
  assert.match(manifest.claim_boundary, /not .*live Cloudflare deployment/i);
  assert.ok(Array.isArray(manifest.files), 'review packet manifest must include file records');
  assert.ok(manifest.files.length > 0, 'review packet manifest must include evidence files');
  const paths = new Set();
  for (const file of manifest.files) {
    assert.equal(typeof file.path, 'string');
    assert.equal(PRIVATE_REVIEW_PACKET_COLLATERAL_PATH.test(file.path), false, `review packet included private/internal collateral path ${file.path}`);
    assert.equal(LOCAL_BUNDLE_LOG_OR_SECRET_PATH.test(file.path), false, `review packet included local bundle/log/secret path ${file.path}`);
    assert.match(file.sha256, SHA256_PREFIXED_DIGEST, `${file.path} must have a sha256-prefixed hash`);
    paths.add(file.path);
    const text = REVIEW_PACKET_TEXT_FILE.test(file.path) ? await readFile(join(outDir, file.path), 'utf8') : '';
    if (text) {
      assert.doesNotMatch(text, RAW_MEMORY_EXAMPLE_FIELD, `${file.path} must not contain raw-memory-like JSON examples`);
      assert.equal(text.includes('private launch-code phrase must not leave local memory'), false, `${file.path} must not contain the private memory sentinel`);
    } else {
      await readFile(join(outDir, file.path));
    }
  }
  for (const rel of ['evidence/local-provenance.json', 'evidence/release-audit.json', 'package/npm-pack-dry-run.json']) {
    assert.equal(paths.has(rel), true, `review packet must include ${rel}`);
  }
  const manifestText = await readFile(join(outDir, REVIEW_PACKET_MANIFEST), 'utf8');
  assert.doesNotMatch(manifestText, PRIVATE_REVIEW_PACKET_COLLATERAL_PATH);
  assert.doesNotMatch(manifestText, RAW_MEMORY_EXAMPLE_FIELD);
}

function reviewPacketCommandRunner() {
  return async (_command, args) => {
    const joinedArgs = args.join(' ');
    if (joinedArgs.includes('release-provenance.mjs')) {
      const outPath = args[args.indexOf('--out') + 1];
      const rootHash = `sha256:${'1'.repeat(64)}`;
      const provenance = {
        schema: RELEASE_PROVENANCE_SCHEMA,
        counts: { files: 1, specs: 0, tests: 0 },
        root_hash: rootHash,
        files: [{ path: 'README.md', bytes: 1, sha256: `sha256:${'2'.repeat(64)}` }],
      };
      await writeFile(outPath, `${JSON.stringify(provenance, null, 2)}\n`, 'utf8');
      return { stdout: `${JSON.stringify({ ok: true, path: outPath, file_count: 1, root_hash: rootHash })}\n`, stderr: '' };
    }
    if (joinedArgs.includes('release-audit.mjs')) {
      return { stdout: `${JSON.stringify({ schema: 'enigma.release_audit.v1', ok: true, required_failed: [], gates: [{ name: 'review-packet-embedded-boundary', ok: true, status: 0 }] })}\n`, stderr: '' };
    }
    if (args.includes('pack') || joinedArgs.includes('npm pack --dry-run --json --ignore-scripts')) {
      return { stdout: `${JSON.stringify([{ filename: 'enigma-memory-0.1.2.tgz', files: [{ path: 'README.md' }] }])}\n`, stderr: '' };
    }
    throw new Error(`Unexpected review packet command: ${joinedArgs}`);
  };
}




test('release smoke exercises local CLI path without leaking private memory into public proof artifacts', async () => {
  const strippedCredentialKeys = Object.keys(RELEASE_SMOKE_ENV).filter((key) => CLOUD_CREDENTIAL_KEY.test(key));
  assert.deepEqual(strippedCredentialKeys, [], 'release smoke env should not carry provider or cloud credentials');

  const privateMemory = (await readFile(PRIVATE_MEMORY_URL, 'utf8')).trimEnd();
  assert.notEqual(privateMemory, '', 'private memory fixture must not be empty');

  await withTempDir('enigma-release-smoke-', async (dir) => {
    const bundlePath = join(dir, 'bundle.json');
    const exportPath = join(dir, 'public-proof.json');

    const init = await runCliJson([
      'init',
      '--bundle', bundlePath,
      '--subject', 'release-smoke-subject',
      '--display-name', 'Release Smoke Subject',
    ]);
    assert.equal(init.ok, true);
    assert.equal(init.schema, 'enigma.vault_bundle.v1');

    const remembered = await runCliJson([
      'remember',
      '--bundle', bundlePath,
      '--text-file', fileURLToPath(PRIVATE_MEMORY_URL),
      '--purpose', 'release_smoke_private_fixture',
      '--tags', 'release-smoke,local-only',
    ]);
    assert.equal(remembered.ok, true);
    assert.equal(typeof remembered.memory_addr, 'string');
    assert.equal(typeof remembered.receipt_id, 'string');

    const context = await runCliJson([
      'context',
      '--bundle', bundlePath,
      '--query', 'release smoke local context',
      '--purpose', 'release_smoke_context',
      '--limit', '1',
    ]);
    assert.equal(context.schema, 'enigma.context_pack.v1');
    assert.equal(context.memory_addresses.includes(remembered.memory_addr), true);
    assert.ok(Array.isArray(context.receipts));
    assert.ok(context.receipts.length >= 2);

    const exported = await runCliJson([
      'export',
      '--bundle', bundlePath,
      '--out', exportPath,
    ]);
    assert.equal(exported.ok, true);
    assert.equal(exported.export, exportPath);
    assert.ok(exported.receipt_count >= 1);

    const exportedPublicProofText = await readFile(exportPath, 'utf8');
    assertNoPublicMemoryLeak(exportedPublicProofText, privateMemory);
    const exportedPublicProof = JSON.parse(exportedPublicProofText);
    assert.equal(exportedPublicProof.schema, 'enigma.vault_bundle.v1');
    assertNoPublicMemoryLeak(exportedPublicProof.memory_objects, privateMemory);
    assertNoPublicMemoryLeak(exportedPublicProof.receipts, privateMemory);

    const verification = await runCliJson([
      'verify',
      '--bundle', exportPath,
    ]);
    assert.equal(verification.ok, true);
    assert.equal(verification.schema, 'enigma.verification_report.v1');
    assert.ok(verification.receipt_count >= exported.receipt_count);
    assertNoPublicMemoryLeak(verification, privateMemory);

    const boundary = await runCliJson(['boundary', 'run'], 1);
    assert.equal(boundary.schema, 'enigma.boundary_simulation.v1');
    assert.equal(boundary.status, 'FAIL');
    assert.ok(boundary.rows.some((row) => row.verdict === 'FAIL'));
    assertNoPublicMemoryLeak(boundary.commitments, privateMemory);

    const relay = await runCliJson(['relay', 'demo']);
    assert.equal(relay.ok, true);
    assert.equal(relay.pushed_opaque_record, true);
    assert.equal(relay.rejected_plaintext_record, true);
    assertNoPublicMemoryLeak(relay, privateMemory);

    const gateway = await runCliJson(['gateway', 'demo']);
    assert.equal(gateway.ok, true);
    assert.equal(gateway.denied_disallowed_region, true);
    assert.equal(gateway.denied_legal_hold_delete, true);
    assert.equal(gateway.siem_event_plaintext_minimized, true);
    assertNoPublicMemoryLeak(gateway.siem_export, privateMemory);
  });
});

test('local provenance command writes release evidence and audit gate validates it', async () => {
  const pkg = JSON.parse(await readFile(PACKAGE_JSON_URL, 'utf8'));
  await withTempDir('enigma-release-provenance-', async (dir) => {
    const outPath = join(dir, 'release-provenance.json');
    const { stdout, stderr } = await execFileAsync(process.execPath, [RELEASE_PROVENANCE_SCRIPT, '--out', outPath], {
      cwd: PROJECT_ROOT_PATH,
      env: RELEASE_SMOKE_ENV,
      maxBuffer: JSON_OUTPUT_LIMIT,
      windowsHide: true,
    });
    assert.equal(stderr.trim(), '');
    const summary = JSON.parse(stdout);
    assert.equal(summary.ok, true);
    assert.equal(summary.path, outPath);
    assert.match(summary.root_hash, SHA256_PREFIXED_DIGEST);

    const provenance = JSON.parse(await readFile(outPath, 'utf8'));
    assertReleaseProvenanceOutput(provenance, pkg);
    assert.equal(summary.file_count, provenance.counts.files);
    assert.equal(summary.root_hash, provenance.root_hash);

    const { runLocalProvenanceGate, runReleaseAudit, validateLocalProvenanceDocument } = await import('../scripts/release-audit.mjs');
    const gate = await runLocalProvenanceGate();
    assert.equal(gate.name, 'local-provenance');
    assert.equal(gate.required, true);
    assert.equal(gate.ok, true, gate.error?.message ?? 'local provenance gate failed');
    assert.match(gate.command, /scripts[/\\]release-provenance\.mjs --out /);
    assert.equal(gate.evidence.schema, RELEASE_PROVENANCE_SCHEMA);
    assert.ok(gate.evidence.file_count > 0);
    assert.match(gate.evidence.root_hash, SHA256_PREFIXED_DIGEST);
    assert.doesNotMatch(gate.command, /C:\\Users\\|C:\\Program Files\\/i);
    assert.match(gate.evidence.summary_path, /^<temp>\//);
    assert.doesNotMatch(gate.evidence.summary_path, /C:\\Users\\/i);
    assert.match(runReleaseAudit.toString(), /runLocalProvenanceGate\(\)/);
    assert.throws(
      () => validateLocalProvenanceDocument({ ...provenance, files: provenance.files.slice(1) }, summary),
      /file count/i,
    );
    assert.throws(
      () => validateLocalProvenanceDocument({ ...provenance, root_hash: `sha256:${'0'.repeat(64)}` }, { ...summary, root_hash: `sha256:${'0'.repeat(64)}` }),
      /root hash/i,
    );
  });
});

test('review packet builder writes local evidence with private collateral and raw memory excluded', async () => {
  const { buildReviewPacket } = await import('../scripts/build-review-packet.mjs');
  const { runReleaseAudit, validateReviewPacketManifest } = await import('../scripts/release-audit.mjs');

  await withTempDir('enigma-review-packet-smoke-', async (dir) => {
    const previousNpmExecPath = process.env.npm_execpath;
    process.env.npm_execpath = 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js';
    try {
      const outDir = join(dir, 'packet');
      const manifest = await buildReviewPacket({
        out: outDir,
        now: '2026-06-23T00:00:00.000Z',
        env: { [REVIEW_PACKET_EMBEDDED_ENV]: '1' },
        commandRunner: reviewPacketCommandRunner(),
      });

      await assertReviewPacketFiles(outDir, manifest);
      assert.deepEqual((await validateReviewPacketManifest(manifest, outDir)).schema, REVIEW_PACKET_SCHEMA);
      await assert.rejects(
        () => validateReviewPacketManifest({ ...manifest, schema: 'wrong.schema' }, outDir),
        /schema/i,
      );
      await assert.rejects(
        () => validateReviewPacketManifest({ ...manifest, files: [{ ...manifest.files[0], sha256: 'not-sha256' }, ...manifest.files.slice(1)] }, outDir),
        /sha256/i,
      );
      await assert.rejects(
        () => validateReviewPacketManifest({ ...manifest, files: [...manifest.files, { path: 'site/internal-launch-code.md', sha256: `sha256:${'3'.repeat(64)}` }] }, outDir),
        /private|internal/i,
      );
      assert.equal(manifest.directories.evidence, true);
      assert.equal(manifest.directories.package, true);
      assert.ok(manifest.commands.some((command) => command.name === 'local-provenance' && command.output === 'evidence/local-provenance.json'));
      assert.ok(manifest.commands.some((command) => command.name === 'release-audit' && command.output === 'evidence/release-audit.json'));
      const packCommand = manifest.commands.find((command) => command.name === 'npm-pack-dry-run-json' && command.output === 'package/npm-pack-dry-run.json');
      assert.ok(packCommand);
      assert.match(packCommand.command, /node "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli\.js" pack --dry-run --json --ignore-scripts/);
      assert.match(runReleaseAudit.toString(), /runReviewPacketGate\(\)/);
    } finally {
      if (previousNpmExecPath === undefined) delete process.env.npm_execpath;
      else process.env.npm_execpath = previousNpmExecPath;
    }
  });
});

test('infrastructure readiness smoke wiring is packaged and release-audit optional', async () => {
  const tokenSentinel = 'infra_smoke_token_must_not_appear';
  const contactSentinel = 'infra-smoke-contact@example.invalid';
  const rawMemorySentinel = 'infra smoke raw memory must not appear';
  const pkg = JSON.parse(await readFile(PACKAGE_JSON_URL, 'utf8'));
  assert.equal(pkg.scripts?.['infrastructure:readiness'], `node ${INFRASTRUCTURE_READINESS_SCRIPT}`);
  assert.equal(packageFilesCover(pkg, INFRASTRUCTURE_READINESS_SCRIPT), true);
  assert.equal(packageFilesCover(pkg, INFRASTRUCTURE_READINESS_MANIFEST_SCHEMA_PATH), true);

  const {
    INFRASTRUCTURE_READINESS_SCHEMA: readinessSchema,
    INFRASTRUCTURE_READINESS_MANIFEST_SCHEMA: manifestSchema,
    parseInfrastructureReadinessArgs,
    validateInfrastructureReadinessManifest,
    runInfrastructureReadiness,
  } = await import('../scripts/infrastructure-readiness.mjs');
  assert.equal(readinessSchema, INFRASTRUCTURE_READINESS_SCHEMA);
  assert.equal(manifestSchema, INFRASTRUCTURE_READINESS_MANIFEST_SCHEMA);

  const manifest = {
    schema: INFRASTRUCTURE_READINESS_MANIFEST_SCHEMA,
    mode: 'contract-only',
    public_site: { url: 'https://public.example.invalid/' },
    cloudflare_pages: { project_url: 'https://enigma.pages.dev/' },
    relay: { url: 'https://relay.example.invalid/readyz' },
    gateway: { url: 'https://gateway.example.invalid/readyz' },
    refs: {
      relay: 'relay-contract#reviewed',
      gateway: 'gateway-contract#reviewed',
      backend_host: 'backend-host-runbook#ready',
      dns_tls: 'dns-tls-runbook#ready',
      durable_storage: 'storage-runbook#ready',
      kms: 'kms-runbook#ready',
      siem: 'siem-runbook#ready',
      backup: 'backup-runbook#ready',
      kms_or_secret_custody: 'kms-runbook#ready',
      siem_or_log_sink: 'siem-runbook#ready',
      backup_restore: 'backup-runbook#ready',
      monitoring: 'monitoring-runbook#ready',
      runtime_auth: 'runtime-auth-runbook#ready',
      admin_auth: 'admin-auth-runbook#ready',
      data_plane_auth: 'data-plane-auth-runbook#ready',
      operator_acceptance: 'operator-acceptance#contract',
    },
    operator_acceptance: { decision: 'go' },
    external_blockers: [],
    claim_boundary: [
      'Contract-only readiness smoke evidence does not prove hosted relay, gateway, KMS, storage, SIEM, backup, operator, or token readiness.',
      'Hosted readiness requires separately observed public dependencies and operator acceptance.',
    ],
  };
  assert.equal((await validateInfrastructureReadinessManifest(manifest)).schema, INFRASTRUCTURE_READINESS_MANIFEST_SCHEMA);

  await withTempDir('enigma-infra-smoke-', async (dir) => {
    const manifestPath = join(dir, 'readiness-manifest.json');
    await writeFile(manifestPath, JSON.stringify(manifest), 'utf8');
    const command = parseInfrastructureReadinessArgs(['--manifest', manifestPath], {
      CLOUDFLARE_API_TOKEN: tokenSentinel,
    });
    const output = await runInfrastructureReadiness(command, {
      env: { CLOUDFLARE_API_TOKEN: tokenSentinel },
      now: new Date('2026-06-23T00:00:00.000Z'),
      fetchImpl: async () => {
        throw new Error('contract-only readiness smoke must not perform live fetches');
      },
    });
    assert.equal(output.schema, INFRASTRUCTURE_READINESS_SCHEMA);
    assert.equal(output.credentials_required, false);
    assert.deepEqual(output.credentials_used, { cloudflare_api_token: false });
    assert.equal(output.readiness.contract_ready, true);
    assert.equal(output.readiness.hosted_live_ready, false);
    assert.deepEqual(output.claim_boundary, manifest.claim_boundary);
    assertNoSentinelLeaks(output, [tokenSentinel, contactSentinel, rawMemorySentinel]);
  });

  const { runInfrastructureReadinessGate, runReleaseAudit } = await import('../scripts/release-audit.mjs');
  assert.equal(typeof runInfrastructureReadinessGate, 'function');
  assert.match(runReleaseAudit.toString(), /runInfrastructureReadinessGate\(\)/);
  const previousManifestEnv = process.env.ENIGMA_INFRASTRUCTURE_READINESS_MANIFEST;
  const previousLiveEnv = process.env.ENIGMA_INFRASTRUCTURE_READINESS_LIVE;
  delete process.env.ENIGMA_INFRASTRUCTURE_READINESS_MANIFEST;
  delete process.env.ENIGMA_INFRASTRUCTURE_READINESS_LIVE;
  try {
    const gate = await runInfrastructureReadinessGate();
    assert.equal(gate.name, 'infrastructure-readiness');
    assert.equal(gate.ok, true, gate.error?.message ?? 'infrastructure readiness gate failed');
    assert.equal(gate.status, 0);
    assert.equal(gate.evidence.generated_manifest, true);
    assert.equal(gate.evidence.generated_manifest_source, 'production-readiness-manifest-builder');
    assert.equal(gate.evidence.readiness.contract_ready, true);
    assert.equal(gate.evidence.readiness.hosted_live_ready, false);
    assert.equal(gate.evidence.credentials_required, false);
    assert.equal(gate.evidence.credentials_used.cloudflare_api_token, false);
    assert.match(gate.command, /<generated-production-readiness-manifest>/);
    assert.doesNotMatch(JSON.stringify(gate), /Bearer|Basic|PRIVATE KEY|password|raw memory/i);
  } finally {
    if (previousManifestEnv === undefined) delete process.env.ENIGMA_INFRASTRUCTURE_READINESS_MANIFEST;
    else process.env.ENIGMA_INFRASTRUCTURE_READINESS_MANIFEST = previousManifestEnv;
    if (previousLiveEnv === undefined) delete process.env.ENIGMA_INFRASTRUCTURE_READINESS_LIVE;
    else process.env.ENIGMA_INFRASTRUCTURE_READINESS_LIVE = previousLiveEnv;
  }
  const auditSource = await readProjectText(RELEASE_AUDIT_SCRIPT);
  assert.match(auditSource, /requireJsonField\([\s\S]{0,160}['"]claim_boundary['"][\s\S]{0,600}Array\.isArray/, 'release audit must accept claim_boundary arrays from readiness output');
  assert.match(auditSource, /function operatorAcceptanceDecision\([^)]*\)\s*\{[\s\S]{0,800}(?:checkValues|Object\.values|Array\.isArray)/, 'release audit must scan readiness checks for operator acceptance decisions');
});

test('native host release artifacts are package-visible and claim-bounded', async () => {
  const pkg = JSON.parse(await readFile(PACKAGE_JSON_URL, 'utf8'));
  const nativeHostBinTarget = NATIVE_HOST_BIN_REL;
  assert.equal(pkg.bin?.[NATIVE_HOST_BIN_NAME], nativeHostBinTarget, 'package bin must expose the native host');
  assert.equal(packageFilesCover(pkg, NATIVE_HOST_BIN_REL), true, 'native host bin must be included in the package file list');

  const bridgeSource = await readFile(BROWSER_NATIVE_BRIDGE_URL, 'utf8');
  assert.match(bridgeSource, new RegExp(`const\\s+NATIVE_HOST\\s*=\\s*['"]${NATIVE_HOST_NAME.replace(/\./g, '\\.')}['"]`));

  const nativeHostSource = await readProjectText(NATIVE_HOST_BIN_REL);
  assert.match(nativeHostSource.split(/\r?\n/, 1)[0], /^#!\/usr\/bin\/env node$/);
  assert.match(nativeHostSource, /enigma\.native\.browser\.v1/);
  assert.match(nativeHostSource, /enigma\.browser\.context\.response/);
  assert.doesNotMatch(nativeHostSource, RAW_MEMORY_EXAMPLE_FIELD);

  for (const manifestRel of NATIVE_HOST_MANIFEST_RELS) {
    const manifestText = await readProjectText(manifestRel);
    const manifest = JSON.parse(manifestText);
    assert.equal(manifest.name, NATIVE_HOST_NAME, `${manifestRel} must use the bridge host name`);
    assert.equal(manifest.type, 'stdio', `${manifestRel} must be a stdio native messaging host`);
    assert.equal(typeof manifest.path, 'string', `${manifestRel} must declare a native host path`);
    assert.match(manifest.path.replace(/\\/g, '/'), /enigma-native-host(?:\.mjs)?(?:\.cmd)?$/);
    const allowedOrigins = Array.isArray(manifest.allowed_origins) ? manifest.allowed_origins : [];
    const allowedExtensions = Array.isArray(manifest.allowed_extensions) ? manifest.allowed_extensions : [];
    assert.equal(allowedOrigins.length > 0 || allowedExtensions.length > 0, true, `${manifestRel} must scope allowed extensions/origins`);
    assert.equal(allowedOrigins.length > 0 && allowedExtensions.length > 0, false, `${manifestRel} must use one browser allowlist shape`);
    assert.equal(JSON.stringify(manifest).includes(NATIVE_HOST_BIN_NAME), true, `${manifestRel} must point at the package bin`);
    assert.doesNotMatch(manifestText, RAW_MEMORY_EXAMPLE_FIELD);
  }

  for (const docRel of NATIVE_HOST_DOC_RELS) {
    const doc = await readProjectText(docRel);
    assert.equal(doc.includes(NATIVE_HOST_NAME), true, `${docRel} must name the native messaging host`);
    assert.equal(doc.includes('private launch-code phrase must not leave local memory'), false, `${docRel} must not include private fixture text`);
    assert.doesNotMatch(doc, RAW_MEMORY_EXAMPLE_FIELD, `${docRel} must not include raw-memory JSON examples`);
  }
});

test('native host manifest generator emits browser-specific manifests and rejects relative host paths', async () => {
  await withTempDir('enigma-native-manifest-smoke-', async (dir) => {
    const hostPath = join(dir, process.platform === 'win32' ? 'enigma-native-host.cmd' : 'enigma-native-host');

    for (const testCase of NATIVE_HOST_MANIFEST_GENERATION_CASES) {
      const manifest = await runCliJson([
        'native-host',
        'manifest',
        '--browser',
        testCase.browser,
        '--host-path',
        hostPath,
        '--extension-id',
        testCase.extensionId,
      ]);
      assertGeneratedNativeHostManifest(manifest, { ...testCase, hostPath });
      assert.doesNotMatch(JSON.stringify(manifest), RAW_MEMORY_EXAMPLE_FIELD);
    }

    const fileModeCase = NATIVE_HOST_MANIFEST_GENERATION_CASES[2];
    const outPath = join(dir, 'com.enigma.native_host.firefox.json');
    const writeResult = await runCliJson([
      'native-host',
      'manifest',
      '--browser',
      fileModeCase.browser,
      '--host-path',
      hostPath,
      '--extension-id',
      fileModeCase.extensionId,
      '--out',
      outPath,
    ]);
    assert.equal(writeResult.ok, true);
    assert.equal(writeResult.path, outPath);
    assertGeneratedNativeHostManifest(JSON.parse(await readFile(outPath, 'utf8')), { ...fileModeCase, hostPath });

    for (const testCase of NATIVE_HOST_MANIFEST_GENERATION_CASES) {
      const failure = await runCliJson([
        'native-host',
        'manifest',
        '--browser',
        testCase.browser,
        '--host-path',
        'relative/enigma-native-host',
        '--extension-id',
        testCase.extensionId,
      ], 2);
      assert.equal(failure.ok, false);
      assert.match(JSON.stringify(failure.error), /absolute/i);
    }
  });
});


test('Cloudflare ops CLI stays local and dry-run without credentials', async () => {
  const cloudflareEnv = { ...RELEASE_SMOKE_ENV, CLOUDFLARE_ACCOUNT_ID: 'account-for-local-smoke' };
  const tokenSentinel = 'cf_smoke_token_must_not_appear';
  const {
    isValidDomainName,
    buildCloudflareRequestPlan,
    buildWranglerPagesDeployPlan,
    parseCloudflareOpsCommand,
    runCloudflareOpsCommand,
  } = await import('../scripts/cloudflare-ops.mjs');

  assert.equal(isValidDomainName('example.dev'), true);
  assert.equal(isValidDomainName('bad_domain.dev'), false);
  const parsedRegister = parseCloudflareOpsCommand([
    'registrar',
    'register',
    '--domain',
    'example.dev',
    '--max-price-usd',
    '10.11',
    '--confirm-domain',
    'example.dev',
    '--confirm-registration-cost',
    '10.11',
    '--i-understand-this-charges-my-payment-method',
  ], cloudflareEnv);
  assert.equal(parsedRegister.execute, false);
  assert.equal(buildCloudflareRequestPlan({ operation: 'registrar.register', accountId: cloudflareEnv.CLOUDFLARE_ACCOUNT_ID, domain: parsedRegister.domain }).tokenPrinted, false);
  const userTokenVerifyPlan = buildCloudflareRequestPlan({ operation: 'token.verify' });
  assert.equal(userTokenVerifyPlan.tokenScope, 'user');
  assert.match(userTokenVerifyPlan.url, /\/user\/tokens\/verify$/);
  const accountTokenVerifyPlan = buildCloudflareRequestPlan({ operation: 'token.verify', accountId: cloudflareEnv.CLOUDFLARE_ACCOUNT_ID });
  assert.equal(accountTokenVerifyPlan.tokenScope, 'account');
  assert.match(accountTokenVerifyPlan.url, new RegExp(`/accounts/${cloudflareEnv.CLOUDFLARE_ACCOUNT_ID}/tokens/verify$`));
  assert.throws(
    () => parseCloudflareOpsCommand([
      'registrar',
      'register',
      '--domain',
      'example.dev',
      '--max-price-usd',
      '10.11',
      '--confirm-domain',
      'other.dev',
      '--confirm-registration-cost',
      '10.11',
      '--i-understand-this-charges-my-payment-method',
    ], cloudflareEnv),
    /confirm-domain/,
  );
  assert.throws(
    () => parseCloudflareOpsCommand([
      'registrar',
      'register',
      '--domain',
      'example.dev',
      '--max-price-usd',
      '10.11',
      '--confirm-domain',
      'example.dev',
      '--confirm-registration-cost',
      '10.11',
    ], cloudflareEnv),
    /charges-my-payment-method/,
  );
  const parsedPages = parseCloudflareOpsCommand(['pages', 'deploy', '--site', '_public_site', '--project-name', 'enigma-memory']);
  assert.equal(parsedPages.execute, false);
  assert.equal(buildWranglerPagesDeployPlan(parsedPages).dryRun, true);
  const parsedPagesVerify = parseCloudflareOpsCommand(['pages', 'verify', '--url', 'https://enigma.pages.dev/', '--project-name', 'enigma-memory', '--cloudflare-live', 'auto']);
  assert.equal(parsedPagesVerify.kind, 'pages.verify');
  assert.equal(parsedPagesVerify.url, 'https://enigma.pages.dev/');
  assert.equal(parsedPagesVerify.projectName, 'enigma-memory');

  const { stdout: helpStdout, stderr: helpStderr } = await execFileAsync(process.execPath, [CLOUDFLARE_OPS_SCRIPT, '--help'], {
    cwd: PROJECT_ROOT_PATH,
    env: { ...cloudflareEnv, CLOUDFLARE_API_TOKEN: tokenSentinel },
    maxBuffer: JSON_OUTPUT_LIMIT,
    windowsHide: true,
  });
  assert.equal(helpStderr.trim(), '');
  assert.match(helpStdout, /Usage: node scripts\/cloudflare-ops\.mjs <command> \[options\]/);
  assert.match(helpStdout, /dry-run plans unless --execute is provided/i);
  assert.match(helpStdout, /token is never printed/i);
  assert.equal(helpStdout.includes(tokenSentinel), false);
  assert.match(helpStdout, /pages verify --url <https-url>/i);
  assert.match(helpStdout, /without\s+Authorization/i);

  const { stdout: registerStdout, stderr: registerStderr } = await execFileAsync(process.execPath, [
    CLOUDFLARE_OPS_SCRIPT,
    'registrar',
    'register',
    '--domain',
    'example.dev',
    '--max-price-usd',
    '10.11',
    '--confirm-domain',
    'example.dev',
    '--confirm-registration-cost',
    '10.11',
    '--i-understand-this-charges-my-payment-method',
  ], {
    cwd: PROJECT_ROOT_PATH,
    env: { ...cloudflareEnv, CLOUDFLARE_API_TOKEN: tokenSentinel },
    maxBuffer: JSON_OUTPUT_LIMIT,
    windowsHide: true,
  });
  assert.equal(registerStderr.trim(), '');
  const registerPlan = JSON.parse(registerStdout);
  assert.equal(registerPlan.operation, 'registrar.register');
  assert.equal(registerPlan.dryRun, true);
  assert.equal(registerPlan.execute, false);
  assert.equal(registerPlan.safety.requiresExecute, true);
  assert.equal(registerPlan.safety.requiresFreshAvailabilityCheckBeforeExecute, true);
  assert.equal(registerPlan.safety.requiresExactDomainConfirmation, true);
  assert.equal(registerPlan.safety.requiresExactPriceConfirmation, true);
  assert.equal(registerPlan.checkPlan.tokenPrinted, false);
  assert.equal(registerPlan.registerPlan.tokenPrinted, false);
  assert.equal(JSON.stringify(registerPlan).includes(tokenSentinel), false);

  const { stdout: pagesStdout, stderr: pagesStderr } = await execFileAsync(process.execPath, [
    CLOUDFLARE_OPS_SCRIPT,
    'pages',
    'deploy',
    '--site',
    '_public_site',
    '--project-name',
    'enigma-memory',
  ], {
    cwd: PROJECT_ROOT_PATH,
    env: { ...cloudflareEnv, CLOUDFLARE_API_TOKEN: tokenSentinel },
    maxBuffer: JSON_OUTPUT_LIMIT,
    windowsHide: true,
  });
  assert.equal(pagesStderr.trim(), '');
  const pagesPlan = JSON.parse(pagesStdout);
  assert.equal(pagesPlan.operation, 'pages.deploy');
  assert.equal(pagesPlan.dryRun, true);
  assert.equal(pagesPlan.execute, false);
  assert.equal(pagesPlan.plan.tokenPrinted, false);
  assert.match(pagesPlan.claimBoundary, /no Cloudflare Pages deployment was executed/);
  assert.equal(JSON.stringify(pagesPlan).includes(tokenSentinel), false);

  const authHeader = (headers) => headers?.Authorization ?? headers?.authorization ?? (typeof headers?.get === 'function' ? headers.get('Authorization') : undefined);
  const rawMemorySentinel = 'cloudflare pages verify raw memory must not appear';
  const contactSentinel = 'cloudflare-pages-contact@example.invalid';
  const pagesVerifyWithoutCreds = await runCloudflareOpsCommand(parsedPagesVerify, {
    env: RELEASE_SMOKE_ENV,
    fetchImpl: async (url, init = {}) => {
      assert.equal(String(url), 'https://enigma.pages.dev/');
      assert.equal(authHeader(init.headers), undefined, 'public Pages verification must not send Authorization');
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'text/html' },
        text: async () => `<!doctype html><html><body>${contactSentinel}${rawMemorySentinel}</body></html>`,
      };
    },
  });
  assert.equal(pagesVerifyWithoutCreds.json.operation, 'pages.verify');
  assert.equal(pagesVerifyWithoutCreds.json.readiness.public_live_ready, true);
  assert.equal(pagesVerifyWithoutCreds.json.checks.cloudflare_live.skipped, true);
  assert.equal(pagesVerifyWithoutCreds.json.credentials_required, false);
  assert.equal(pagesVerifyWithoutCreds.json.credentials_used, false);
  assertNoSentinelLeaks(pagesVerifyWithoutCreds, [tokenSentinel, contactSentinel, rawMemorySentinel]);

  const pagesVerifyWithCreds = await runCloudflareOpsCommand(parsedPagesVerify, {
    env: { ...RELEASE_SMOKE_ENV, CLOUDFLARE_API_TOKEN: tokenSentinel, CLOUDFLARE_ACCOUNT_ID: cloudflareEnv.CLOUDFLARE_ACCOUNT_ID },
    fetchImpl: async (url, init = {}) => {
      const urlText = String(url);
      if (urlText === 'https://enigma.pages.dev/') {
        assert.equal(authHeader(init.headers), undefined, 'public Pages verification must stay unauthenticated with credentials present');
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'text/html' },
          text: async () => `<!doctype html><html><body>${contactSentinel}${rawMemorySentinel}</body></html>`,
        };
      }
      assert.match(urlText, /api\.cloudflare\.com\/client\/v4/);
      assert.match(urlText, new RegExp(`/accounts/${cloudflareEnv.CLOUDFLARE_ACCOUNT_ID}/pages/projects/enigma-memory$`));
      assert.equal(authHeader(init.headers), `Bearer ${tokenSentinel}`);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          success: true,
          result: {
            status: 'active',
            name: 'enigma-memory',
            subdomain: 'enigma.pages.dev',
            domains: ['enigma.pages.dev'],
            canonical_deployment: { url: 'https://enigma.pages.dev/' },
            raw_memory: rawMemorySentinel,
          },
          contact: contactSentinel,
          raw_memory: rawMemorySentinel,
        }),
      };
    },
  });
  assert.equal(pagesVerifyWithCreds.json.operation, 'pages.verify');
  assert.equal(pagesVerifyWithCreds.json.readiness.public_live_ready, true);
  assert.equal(pagesVerifyWithCreds.json.readiness.cloudflare_observed, true);
  assert.equal(pagesVerifyWithCreds.json.checks.cloudflare_live.ok, true);
  assert.equal(pagesVerifyWithCreds.json.credentials_used, true);
  assertNoSentinelLeaks(pagesVerifyWithCreds, [tokenSentinel, contactSentinel, rawMemorySentinel]);

  await assert.rejects(
    () => execFileAsync(process.execPath, [
      CLOUDFLARE_OPS_SCRIPT,
      'registrar',
      'check',
      '--domain',
      'bad_domain.dev',
    ], {
      cwd: PROJECT_ROOT_PATH,
      env: { ...cloudflareEnv, CLOUDFLARE_API_TOKEN: tokenSentinel },
      maxBuffer: JSON_OUTPUT_LIMIT,
      windowsHide: true,
    }),
    (error) => {
      assert.match(error.stderr, /valid DNS domain name/);
      assert.equal(String(error.stderr).includes(tokenSentinel), false);
      assert.equal(String(error.stdout).includes(tokenSentinel), false);
      return true;
    },
  );

  const { runCloudflareOpsHelpGate, runInfrastructureReadinessGate, runReleaseAudit } = await import('../scripts/release-audit.mjs');
  const gate = await runCloudflareOpsHelpGate();
  assert.equal(gate.name, 'cloudflare-ops-help');
  assert.equal(gate.required, false);
  assert.equal(gate.ok, true, gate.error?.message ?? 'Cloudflare ops help gate failed');
  assert.match(gate.command, /cloudflare-ops\.mjs --help/);
  assert.equal(gate.evidence.dry_run_default_documented, true);
  assert.equal(gate.evidence.token_not_printed_documented, true);
  assert.equal(typeof runInfrastructureReadinessGate, 'function');
  assert.match(runReleaseAudit.toString(), /runCloudflareOpsHelpGate\(\)/);
  assert.match(runReleaseAudit.toString(), /runInfrastructureReadinessGate\(\)/);
});

test('public site preflight runs locally when the built website artifact exists', async (t) => {
  if (!(await pathExists(PUBLIC_SITE_PREFLIGHT_SCRIPT_PATH)) || !(await pathExists(PUBLIC_SITE_DEFAULT_PATH))) {
    t.skip(`public-site preflight artifact absent: ${PUBLIC_SITE_DEFAULT_PATH}`);
    return;
  }

  const python = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
  const { stdout, stderr } = await execFileAsync(python, ['scripts/preflight_public_site.py', '--site', '_public_site'], {
    cwd: PUBLIC_SITE_PACKAGE_PATH,
    env: RELEASE_SMOKE_ENV,
    maxBuffer: JSON_OUTPUT_LIMIT,
    windowsHide: true,
  });
  assert.equal(stderr.trim(), '');
  const preflight = JSON.parse(stdout);
  assert.equal(preflight.schema, PUBLIC_SITE_PREFLIGHT_SCHEMA);
  assert.equal(preflight.ok, true);
  assert.equal(typeof preflight.site, 'string');
  assert.equal(typeof preflight.checked_counts, 'object');
  assert.equal(preflight.checked_counts.pages_edge_worker, 1);
  assert.equal(Array.isArray(preflight.warnings), true);
  assert.deepEqual(preflight.blockers, []);
});

test('native host install-plan CLI previews registration targets without writes', async () => {
  await withTempDir('enigma-native-install-plan-smoke-', async (dir) => {
    const homePath = join(dir, 'home');
    const chromeManifestPath = join(dir, 'com.enigma.native_host.chrome.json');
    const edgeManifestPath = join(dir, 'com.enigma.native_host.edge.json');

    const chromePlan = await runCliJson([
      'native-host',
      'install-plan',
      '--browser',
      'chrome',
      '--manifest',
      chromeManifestPath,
      '--os',
      'windows',
      '--home',
      homePath,
    ]);
    assert.equal(chromePlan.host_name, NATIVE_HOST_NAME);
    assert.equal(chromePlan.browser, 'chrome');
    assert.equal(chromePlan.os, 'windows');
    assert.equal(chromePlan.manifest_source, chromeManifestPath);
    assert.equal(chromePlan.writes_performed, false);
    assert.equal(chromePlan.firefox_manifest_directory, null);
    assert.equal(chromePlan.target_manifest_paths.length, 1);
    assert.match(chromePlan.target_manifest_paths[0], /Google\\Chrome\\User Data\\NativeMessagingHosts\\com\.enigma\.native_host\.json$/);
    assert.deepEqual(chromePlan.registry_command_preview, [
      `reg add "HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${NATIVE_HOST_NAME}" /ve /t REG_SZ /d "${chromePlan.target_manifest_paths[0]}" /f`,
    ]);
    assert.equal(JSON.stringify(chromePlan).includes('private launch-code phrase must not leave local memory'), false);
    assert.doesNotMatch(JSON.stringify(chromePlan), RAW_MEMORY_EXAMPLE_FIELD);

    const edgePlan = await runCliJson([
      'native-host',
      'install-plan',
      '--browser',
      'edge',
      '--manifest',
      edgeManifestPath,
      '--os',
      'windows',
      '--home',
      homePath,
    ]);
    assert.equal(edgePlan.writes_performed, false);
    assert.match(edgePlan.target_manifest_paths[0], /Microsoft\\Edge\\User Data\\NativeMessagingHosts\\com\.enigma\.native_host\.json$/);
    assert.deepEqual(edgePlan.registry_command_preview, [
      `reg add "HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${NATIVE_HOST_NAME}" /ve /t REG_SZ /d "${edgePlan.target_manifest_paths[0]}" /f`,
    ]);

    const firefoxPlan = await runCliJson([
      'native-host',
      'install-plan',
      '--browser',
      'firefox',
      '--manifest',
      '/home/enigma/com.enigma.native_host.firefox.json',
      '--os',
      'linux',
      '--home',
      '/home/enigma',
    ]);
    assert.equal(firefoxPlan.browser, 'firefox');
    assert.equal(firefoxPlan.writes_performed, false);
    assert.deepEqual(firefoxPlan.registry_command_preview, []);
    assert.equal(firefoxPlan.firefox_manifest_directory, '/home/enigma/.mozilla/native-messaging-hosts');
    assert.deepEqual(firefoxPlan.target_manifest_paths, ['/home/enigma/.mozilla/native-messaging-hosts/com.enigma.native_host.json']);
    assert.doesNotMatch(JSON.stringify(firefoxPlan), RAW_MEMORY_EXAMPLE_FIELD);

    const failure = await runCliJson([
      'native-host',
      'install-plan',
      '--browser',
      'chrome',
      '--manifest',
      'relative/com.enigma.native_host.json',
      '--os',
      'windows',
      '--home',
      homePath,
    ], 2);
    assert.equal(failure.ok, false);
    assert.match(failure.error.message, /manifestPath must be an absolute path/);
  });
});

test('release smoke statically checks deploy manifests remain local-safe and claim-bounded', async () => {
  const dockerfile = await readProjectText('Dockerfile');
  const localCompose = await readProjectText('docker-compose.yml');
  const productionCompose = await readProjectText('deploy/docker-compose.production.example.yml');
  const kubernetes = await readProjectText('deploy/kubernetes/enigma-backend.example.yaml');
  const productionArchitecture = await readProjectText('docs/production-backend-architecture.md');
  const publicApiReference = await readProjectText('docs/public-api-reference.md');
  const secretValuePattern = /(?:ENIGMA_(?:TOKEN|SECRET|KEY|PASSWORD)|PRIVATE_KEY|VAULT_KEY|API[_-]?KEY|ACCESS[_-]?TOKEN|CLIENT[_-]?SECRET|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY)/i;
  const requiredHostedRefs = [
    'ENIGMA_NETWORK_ACCESS_POLICY_REF',
    'ENIGMA_KMS_CUSTODY_REF',
    'ENIGMA_TENANT_POLICY_APPROVAL_REF',
    'ENIGMA_USAGE_METERING_REF',
    'ENIGMA_SERVICE_SETTLEMENT_REF',
    'ENIGMA_MONITORING_ALERTING_REF',
    'ENIGMA_PUBLIC_SITE_SECURITY_REF',
    'ENIGMA_SECURITY_THREAT_MODEL_REF',
    'ENIGMA_LEGAL_COMPLIANCE_APPROVAL_REF',
    'ENIGMA_SUPPORT_SLA_REF',
    'ENIGMA_INCIDENT_DRILL_REF',
    'ENIGMA_BACKUP_RESTORE_DRILL_REF',
    'ENIGMA_BACKUP_TARGET',
    'ENIGMA_OPERATOR_ACCEPTANCE_DECISION',
  ];

  assert.match(dockerfile, /USER node/);
  assert.doesNotMatch(dockerfile, secretValuePattern);
  assert.match(localCompose, /read_only:\s*true/);
  assert.doesNotMatch(localCompose, secretValuePattern);
  assert.match(productionCompose, /healthcheck:/);
  assert.match(productionCompose, /\/livez/);
  assert.match(productionCompose, /\/readyz/);
  assert.doesNotMatch(productionCompose, secretValuePattern);

  for (const service of ['relay', 'gateway']) {
    const match = productionCompose.match(new RegExp(`^  ${service}:\\n(?:    [^\\n]*\\n|\\n)+`, 'm'));
    assert.ok(match, `production docker compose missing ${service} service`);
    assert.match(match[0], /(?:^|\n)\s+user:\s*(?:"?node"?|"?[1-9][0-9]{2,}:?[0-9]*"?)/);
    assert.match(match[0], /read_only:\s*true/);
    assert.match(match[0], /cap_drop:\s*(?:\[\s*"?ALL"?\s*\]|\n\s*-\s*ALL)/);
    assert.match(match[0], /no-new-privileges:true/);
    assert.match(match[0], /\/livez/);
    assert.match(match[0], /\/readyz/);
    assert.match(match[0], /ENIGMA_BACKEND_MODE:\s*"?production"?/);
    assert.match(match[0], /ENIGMA_DISABLE_LOCAL_DEMO_FALLBACK:\s*"?true"?/);
    assert.match(match[0], /ENIGMA_READINESS_FAIL_CLOSED:\s*"?true"?/);
    assert.doesNotMatch(match[0], secretValuePattern);
    for (const requiredRef of requiredHostedRefs) assert.match(match[0], new RegExp(requiredRef), `${service} compose missing ${requiredRef}`);
  }

  assert.match(kubernetes, /kind:\s*NetworkPolicy/);
  assert.match(kubernetes, /name:\s*enigma-default-deny/);
  assert.match(kubernetes, /runAsNonRoot:\s*true/);
  assert.match(kubernetes, /readOnlyRootFilesystem:\s*true/);
  assert.match(kubernetes, /readinessProbe:[\s\S]*path:\s*\/readyz/);
  assert.match(kubernetes, /livenessProbe:[\s\S]*path:\s*\/livez/);
  assert.match(kubernetes, /ENIGMA_BACKEND_MODE:\s*"?production"?/);
  assert.match(kubernetes, /ENIGMA_DISABLE_LOCAL_DEMO_FALLBACK:\s*"?true"?/);
  assert.match(kubernetes, /ENIGMA_READINESS_FAIL_CLOSED:\s*"?true"?/);
  for (const requiredRef of requiredHostedRefs) assert.match(kubernetes, new RegExp(requiredRef), `Kubernetes manifest missing ${requiredRef}`);
  assert.doesNotMatch(kubernetes, secretValuePattern);
  const publicIngress = kubernetes.match(/name:\s*enigma-public[\s\S]*?(?=\n---)/);
  assert.ok(publicIngress, 'Kubernetes manifest must keep a distinct public ingress');
  assert.doesNotMatch(publicIngress[0], /path:\s*\/\s*\n\s*pathType:\s*(?:Prefix|ImplementationSpecific)/i);
  assert.doesNotMatch(publicIngress[0], /path:\s*\/(?:admin|relay|gateway|api|records|decision|delete)\b/i);
  assert.match(publicIngress[0], /path:\s*\/readyz\s*\n\s*pathType:\s*Exact/i);
  assert.match(publicIngress[0], /path:\s*\/livez\s*\n\s*pathType:\s*Exact/i);
  const publicIngressPaths = [...publicIngress[0].matchAll(/path:\s*([^\s]+)/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(publicIngressPaths)].sort(), ['/livez', '/readyz']);
  assert.match(productionArchitecture, /static Cloudflare Pages\/GitHub collateral can be live/i);
  assert.match(productionArchitecture, /relay\/gateway production backend remains blocked/i);
  assert.match(productionArchitecture, /default-deny network-policy/i);
  assert.match(publicApiReference, /Hosted\/BYOC|hosted|BYOC/i);
  assert.match(publicApiReference, /durable storage/i);
  assert.match(publicApiReference, /\bKMS\b|secrets/i);
  assert.match(publicApiReference, /monitoring|SIEM|backups/i);
  assert.match(publicApiReference, /operator acceptance|before|Until those prerequisites/i);
});
