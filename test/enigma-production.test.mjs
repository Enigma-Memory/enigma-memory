import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { webcrypto } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const PROJECT_ROOT_PATH = fileURLToPath(new URL('../', import.meta.url));
const PROJECT_ROOT = new URL('../', import.meta.url);
const PACKAGE_JSON_URL = new URL('../package.json', import.meta.url);
const MANIFEST_URL = new URL('../apps/browser-extension/manifest.json', import.meta.url);
const BROWSER_NATIVE_BRIDGE_URL = new URL('../apps/browser-extension/src/native-bridge.js', import.meta.url);
const BROWSER_BACKGROUND_URL = new URL('../apps/browser-extension/src/background.js', import.meta.url);
const BROWSER_CONTENT_SCRIPT_URL = new URL('../apps/browser-extension/src/content-script.js', import.meta.url);
const DESKTOP_INDEX_URL = new URL('../apps/desktop/src/index.html', import.meta.url);
const NATIVE_HOST_BIN_URL = new URL('../apps/native-host/bin/enigma-native-host.mjs', import.meta.url);
const NATIVE_HOST_BIN_PATH = fileURLToPath(NATIVE_HOST_BIN_URL);
const CLI_BIN_URL = new URL('../apps/cli/bin/enigma.mjs', import.meta.url);
const CI_WORKFLOW_URL = new URL('../.github/workflows/ci.yml', import.meta.url);
const NPM_PUBLISH_WORKFLOW_URL = new URL('../.github/workflows/npm-publish.yml', import.meta.url);
const RAW_MEMORY = 'private launch-code phrase must not leave local memory';
const REQUIRED_BIN_NAMES = Object.freeze(['enigma', 'enigma-verify', 'enigma-mcp', 'enigma-relay', 'enigma-gateway', 'enigma-native-host']);
const NODE_SHEBANG = '#!/usr/bin/env node';
const RELEASE_PROVENANCE_SCHEMA = 'enigma.release_provenance.v1';
const RELEASE_PROVENANCE_SCRIPT = 'scripts/release-provenance.mjs';
const RELEASE_AUDIT_SCRIPT = 'scripts/release-audit.mjs';
const CLOUDFLARE_OPS_SCRIPT = 'scripts/cloudflare-ops.mjs';
const PRODUCTION_WORKPLAN_SCRIPT = 'scripts/build-production-workplan.mjs';
const PRODUCTION_STATUS_BOARD_SCRIPT = 'scripts/build-production-status-board.mjs';
const AI_ORCHESTRATION_PLAN_SCRIPT = 'scripts/build-ai-orchestration-plan.mjs';
const CLOUDFLARE_CREDENTIALS_SCRIPT = 'scripts/validate-cloudflare-credentials.mjs';
const PUBLIC_BETA_QA_MATRIX_SCRIPT = 'scripts/run-public-beta-qa-matrix.mjs';
const CLEAN_MACHINE_SMOKE_SCRIPT = 'scripts/run-clean-machine-smoke.mjs';
const SUPPORT_DRY_RUN_SCRIPT = 'scripts/build-support-dry-run-summary.mjs';
const CLAUDE_MCPB_PACKAGE_SCRIPT = 'scripts/build-claude-mcpb-package.mjs';
const LOCAL_PACK_INSTALL_SCRIPT = 'scripts/verify-local-pack-install.mjs';
const INFRASTRUCTURE_READINESS_SCHEMA = 'enigma.infrastructure_readiness.v1';
const INFRASTRUCTURE_READINESS_MANIFEST_SCHEMA = 'enigma.infrastructure_readiness_manifest.v1';
const INFRASTRUCTURE_READINESS_SCRIPT = 'scripts/infrastructure-readiness.mjs';
const INFRASTRUCTURE_READINESS_MANIFEST_SCHEMA_PATH = 'specs/infrastructure-readiness-manifest-v1.schema.json';
const REVIEW_PACKET_SCHEMA = 'enigma.review_packet.v1';
const REVIEW_PACKET_SCRIPT = 'scripts/build-review-packet.mjs';
const REVIEW_PACKET_MANIFEST = 'REVIEW_PACKET_MANIFEST.json';
const REVIEW_PACKET_EMBEDDED_ENV = 'ENIGMA_REVIEW_PACKET_EMBEDDED';
const SHA256_PREFIXED_DIGEST = /^sha256:[0-9a-f]{64}$/;
const PRIVATE_PUBLIC_SITE_COLLATERAL_PATH = /(?:^|\/)(?:private|internal|launch-code|investor|token(?:omics)?|sales|marketing|funnel|community|social|adoption|objections|faq|whitepaper)[^/]*\.(?:md|html|json)$/i;
const LOCAL_BUNDLE_LOG_OR_SECRET_PATH = /(?:^|\/)(?:\.env(?:\.|$)|env\.local$|secrets?|credentials?|tokens?|api[-_]?keys?|private[-_]?keys?|\.enigma|enigma[-_]?bundle|vault[-_]?bundle|bundle\.json|logs?|npm-debug\.log|yarn-error\.log|pnpm-debug\.log)(?:\/|$|[._-])/i;
const PRIVATE_REVIEW_PACKET_COLLATERAL_PATH = /(?:^|\/)(?:\d+[_-])?(?:private|internal|launch-code|executive|investor|partner|sales|marketing|funnel|community|social|adoption|objections|faq|pitch|demo[-_]?scripts?|content[-_]?calendar|brand[-_]?messaging)[^/]*\.(?:html|json|md|txt)$/i;
const REVIEW_PACKET_TEXT_FILE = /\.(?:css|csv|html|js|json|md|mjs|svg|txt|xml|ya?ml)$/i;
const PRODUCTION_REVIEW_DOCS = Object.freeze([
  'SECURITY.md',
  'docs/security-threat-model.md',
  'docs/public-api-reference.md',
  'docs/operator-acceptance-packet.md',
]);
const INSTALL_ONBOARDING_PACKAGE_DOCS = Object.freeze([
  'docs/install-anywhere.md',
  'docs/client-connectors.md',
]);
const SOURCE_ONLY_README_REFERENCES = Object.freeze([
  'apps/browser-extension/README.md',
  'docs/production-release-checklist.md',
  ...PRODUCTION_REVIEW_DOCS,
]);

async function readJson(urlOrPath) {
  return JSON.parse(await readFile(urlOrPath, 'utf8'));
}

async function importPackage(subpath) {
  const pkg = await readJson(PACKAGE_JSON_URL);
  return import(`${pkg.name}/${subpath}`);
}

async function withTempDir(prefix, fn) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function captureProcessWrites(fn) {
  const originalStdout = process.stdout.write;
  const originalStderr = process.stderr.write;
  let stdout = '';
  let stderr = '';
  process.stdout.write = function writeStdout(chunk, encoding, cb) {
    stdout += Buffer.isBuffer(chunk) ? chunk.toString(typeof encoding === 'string' ? encoding : 'utf8') : String(chunk);
    if (typeof encoding === 'function') encoding();
    if (typeof cb === 'function') cb();
    return true;
  };
  process.stderr.write = function writeStderr(chunk, encoding, cb) {
    stderr += Buffer.isBuffer(chunk) ? chunk.toString(typeof encoding === 'string' ? encoding : 'utf8') : String(chunk);
    if (typeof encoding === 'function') encoding();
    if (typeof cb === 'function') cb();
    return true;
  };
  try {
    const value = await fn();
    return { value, stdout, stderr };
  } finally {
    process.stdout.write = originalStdout;
    process.stderr.write = originalStderr;
  }
}

function makeIo() {
  let stdout = '';
  let stderr = '';
  return {
    io: {
      stdout: { write: (chunk) => { stdout += String(chunk); return true; } },
      stderr: { write: (chunk) => { stderr += String(chunk); return true; } },
    },
    stdout: () => stdout,
    stderr: () => stderr,
    json: () => JSON.parse(stdout),
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCondition(check, label, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(25);
  }
  assert.fail(`${label} did not become true${lastError instanceof Error ? `: ${lastError.message}` : ''}`);
}

function waitForChildJson(child, label, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      child.stdout.off('data', onStdout);
      child.stderr.off('data', onStderr);
      child.off('exit', onExit);
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onStdout = (chunk) => {
      stdout += String(chunk);
      try {
        const parsed = JSON.parse(stdout);
        settled = true;
        cleanup();
        resolve(parsed);
      } catch {
        // Wait for the rest of the pretty-printed JSON object.
      }
    };
    const onStderr = (chunk) => {
      stderr += String(chunk);
    };
    const onExit = (code) => {
      fail(new Error(`${label} exited before reporting JSON: code ${code}, stderr ${stderr}`));
    };
    timer = setTimeout(() => {
      fail(new Error(`${label} did not report JSON within ${timeoutMs}ms; stderr ${stderr}`));
    }, timeoutMs);
    child.stdout.on('data', onStdout);
    child.stderr.on('data', onStderr);
    child.once('exit', onExit);
  });
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill();
  await exited;
}

function assertNoRawMemory(value) {
  const encoded = JSON.stringify(value);
  assert.equal(encoded.includes(RAW_MEMORY), false, encoded);
  assert.equal(/"(body|text|content|plaintext|raw_memory|memory)"\s*:/.test(encoded), false, encoded);
}

function assertNoTextLeak(value, text) {
  assert.equal(JSON.stringify(value).includes(text), false);
}

function assertNoSentinelLeaks(value, sentinels) {
  const encoded = typeof value === 'string' ? value : JSON.stringify(value);
  for (const sentinel of sentinels) {
    assert.equal(encoded.includes(sentinel), false, `JSON output leaked sentinel ${sentinel}`);
  }
}

async function assertRejectsWithSafeMessage(promise, expectedMessage, forbiddenText) {
  try {
    await promise;
    assert.fail('Expected operation to reject.');
  } catch (error) {
    assert.equal(error instanceof Error, true);
    assert.equal(error.message, expectedMessage);
    assertNoTextLeak(error.message, forbiddenText);
    return error;
  }
}

function normalizePackageRel(rel) {
  return String(rel).replace(/\\/g, '/').replace(/^\.\//, '');
}

function packageFilesCover(pkg, rel) {
  const normalizedRel = normalizePackageRel(rel);
  return (pkg.files ?? []).some((entry) => {
    const normalizedEntry = normalizePackageRel(entry);
    return normalizedEntry.endsWith('/')
      ? normalizedRel.startsWith(normalizedEntry)
      : normalizedRel === normalizedEntry || normalizedRel.startsWith(`${normalizedEntry}/`);
  });
}

function assertSafeReleaseProvenancePath(rel) {
  assert.equal(PRIVATE_PUBLIC_SITE_COLLATERAL_PATH.test(rel), false, `release provenance included private/internal public-site collateral path ${rel}`);
  assert.equal(LOCAL_BUNDLE_LOG_OR_SECRET_PATH.test(rel), false, `release provenance included local bundle/log/secret path ${rel}`);
}

function assertSha256PrefixedDigest(value, label) {
  assert.match(value, SHA256_PREFIXED_DIGEST, `${label} must use a sha256: prefixed digest`);
}

function assertReleaseProvenanceDocument(provenance, pkg) {
  assert.equal(provenance.schema, RELEASE_PROVENANCE_SCHEMA);
  assert.equal(provenance.package?.name, pkg.name);
  assert.equal(provenance.package?.version, pkg.version);
  assert.equal(provenance.evidence?.signed, false);
  assert.equal(provenance.evidence?.registry_attestation, false);
  assert.equal(provenance.evidence?.external_credentials_required, false);
  assert.equal(provenance.evidence?.git_required, false);
  for (const binName of REQUIRED_BIN_NAMES) {
    assert.equal(provenance.package?.bins?.[binName], pkg.bin[binName], `release provenance omitted package bin ${binName}`);
  }
  assert.equal(provenance.package?.bins?.['enigma-native-host'], 'apps/native-host/bin/enigma-native-host.mjs');
  assert.ok(Number.isSafeInteger(provenance.counts?.files) && provenance.counts.files > 0, 'release provenance must count packaged files');
  assert.ok(Number.isSafeInteger(provenance.counts?.specs), 'release provenance must count specs');
  assert.ok(Number.isSafeInteger(provenance.counts?.tests), 'release provenance must count tests');
  assert.ok(Array.isArray(provenance.files), 'release provenance must include file records');
  assert.equal(provenance.files.length, provenance.counts.files, 'release provenance file count must match files array');
  assertSha256PrefixedDigest(provenance.root_hash, 'release provenance root_hash');
  for (const file of provenance.files) {
    assert.equal(typeof file.path, 'string', 'release provenance file entries must include paths');
    assertSafeReleaseProvenancePath(file.path);
    assertSha256PrefixedDigest(file.sha256, `release provenance hash for ${file.path}`);
  }
  for (const optionalRecord of [provenance.ci_workflow, provenance.public_site_manifest]) {
    if (!optionalRecord) continue;
    assertSafeReleaseProvenancePath(optionalRecord.path);
    assertSha256PrefixedDigest(optionalRecord.sha256, `release provenance hash for ${optionalRecord.path}`);
  }
}

async function assertReviewPacketDocument(manifest, outDir, { expectSite = false } = {}) {
  assert.equal(manifest.schema, REVIEW_PACKET_SCHEMA);
  assert.match(manifest.claim_boundary, /not npm publication/i);
  assert.match(manifest.claim_boundary, /not .*live Cloudflare deployment/i);
  assert.match(manifest.claim_boundary, /not .*hosted\/BYOC readiness/i);
  assert.ok(Array.isArray(manifest.files), 'review packet manifest must include file records');
  assert.ok(manifest.files.length > 0, 'review packet manifest must include file evidence');
  const paths = new Set();
  for (const file of manifest.files) {
    assert.equal(typeof file.path, 'string');
    assert.equal(PRIVATE_REVIEW_PACKET_COLLATERAL_PATH.test(file.path), false, `review packet included private/internal collateral path ${file.path}`);
    assert.equal(LOCAL_BUNDLE_LOG_OR_SECRET_PATH.test(file.path), false, `review packet included local bundle/log/secret path ${file.path}`);
    assertSha256PrefixedDigest(file.sha256, `review packet hash for ${file.path}`);
    paths.add(file.path);
    if (REVIEW_PACKET_TEXT_FILE.test(file.path)) {
      const text = await readFile(join(outDir, file.path), 'utf8');
      assert.equal(text.includes(RAW_MEMORY), false, `${file.path} must not include raw memory sentinel`);
      assert.doesNotMatch(text, /"(?:raw_memory|plaintext|prompt|response|memory)"\s*:\s*"[^"]+"/i, `${file.path} must not include raw-memory-like JSON examples`);
    } else {
      await readFile(join(outDir, file.path));
    }
  }
  for (const required of ['evidence/local-provenance.json', 'evidence/release-audit.json', 'package/npm-pack-dry-run.json']) {
    assert.equal(paths.has(required), true, `review packet omitted ${required}`);
  }
  assert.equal(manifest.directories?.source, true, 'review packet should include reviewer source files');
  for (const required of [
    'source/packages/metering/src/index.js',
    'source/packages/settlement/src/index.js',
    'source/packages/mcp-server/src/index.js',
    'source/scripts/validate-operator-acceptance.mjs',
    'source/test/enigma-settlement.test.mjs',
  ]) {
    assert.equal(paths.has(required), true, `review packet omitted reviewer source file ${required}`);
  }
  if (expectSite) {
    assert.equal(manifest.directories.site, true, 'review packet should record copied public-site evidence');
    assert.equal(paths.has('site/index.html'), true, 'review packet should include public-site index');
    assert.equal(paths.has('site/assets/app.js'), true, 'review packet should include public-site asset');
  }
  const manifestText = await readFile(join(outDir, REVIEW_PACKET_MANIFEST), 'utf8');
  assert.doesNotMatch(manifestText, PRIVATE_REVIEW_PACKET_COLLATERAL_PATH);
  assert.doesNotMatch(manifestText, /"(?:raw_memory|plaintext|prompt|response|memory)"\s*:\s*"[^"]+"/i);
  assert.equal(manifestText.includes(RAW_MEMORY), false);
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
      return { stdout: `${JSON.stringify([{ filename: 'enigma-memory-0.1.17.tgz', files: [{ path: 'README.md' }] }])}\n`, stderr: '' };
    }
    throw new Error(`Unexpected review packet command: ${joinedArgs}`);
  };
}




async function firstLine(urlOrPath) {
  return (await readFile(urlOrPath, 'utf8')).split(/\r?\n/, 1)[0];
}

async function assertCheckFailsWithPackage(mutator, expectedMessage) {
  const original = JSON.parse(await readFile(PACKAGE_JSON_URL, 'utf8'));
  await withTempDir('enigma-check-package-override-', async (dir) => {
    const broken = structuredClone(original);
    mutator(broken);
    const packageOverridePath = join(dir, 'package.json');
    await writeFile(packageOverridePath, `${JSON.stringify(broken, null, 2)}\n`, 'utf8');
    await assert.rejects(
      execFileAsync(process.execPath, ['scripts/check.mjs'], {
        cwd: PROJECT_ROOT_PATH,
        env: { ...process.env, ENIGMA_CHECK_PACKAGE_JSON_OVERRIDE: packageOverridePath },
      }),
      (error) => {
        assert.match(`${error.stdout ?? ''}\n${error.stderr ?? ''}\n${error.message}`, expectedMessage);
        return true;
      },
    );
  });
}

test('package exports and bins import without side effects', async () => {
  const pkg = await readJson(PACKAGE_JSON_URL);
  assert.notEqual(pkg.private, true);

  const requiredExports = [
    './core',
    './vault',
    './passport',
    './boundary',
    './mcp-server',
    './mesh',
    './enterprise',
    './connectors',
    './importers',
    './relay',
    './gateway',
    './desktop',
  ];
  for (const key of requiredExports) assert.equal(typeof pkg.exports?.[key], 'string', `${key} export missing`);

  assert.deepEqual(Object.keys(pkg.bin ?? {}).sort(), [...REQUIRED_BIN_NAMES].sort());
  for (const name of REQUIRED_BIN_NAMES) {
    const target = pkg.bin[name];
    assert.equal(typeof target, 'string', `${name} bin missing`);
    assert.equal(packageFilesCover(pkg, target), true, `${name} bin target ${target} must be included by package files`);
    assert.equal(await firstLine(new URL(target, PROJECT_ROOT)), NODE_SHEBANG, `${name} bin must have a Node shebang`);
  }
  for (const [key, target] of Object.entries(pkg.exports ?? {})) {
    if (typeof target === 'string') await readFile(new URL(target, PROJECT_ROOT), 'utf8');
    else assert.fail(`${key} export must be a direct string target`);
  }

  const specifiers = Object.keys(pkg.exports)
    .filter((key) => key !== './package.json')
    .map((key) => (key === '.' ? pkg.name : `${pkg.name}/${key.slice(2)}`));
  const originalCwd = process.cwd();
  await withTempDir('enigma-import-side-effects-', async (dir) => {
    process.chdir(dir);
    try {
      for (const specifier of specifiers) {
        const { stdout, stderr } = await captureProcessWrites(() => import(specifier));
        assert.equal(stdout, '', `${specifier} wrote to stdout during import`);
        assert.equal(stderr, '', `${specifier} wrote to stderr during import`);
      }

      for (const target of Object.values(pkg.bin ?? {})) {
        const { stdout, stderr } = await captureProcessWrites(() => import(new URL(target, PROJECT_ROOT)));
        assert.equal(stdout, '', `${target} wrote to stdout during import`);
        assert.equal(stderr, '', `${target} wrote to stderr during import`);
      }
    } finally {
      process.chdir(originalCwd);
    }
    assert.deepEqual(await readdir(dir), []);
  });
});

test('local release provenance records package surface without private collateral paths', async () => {
  const pkg = await readJson(PACKAGE_JSON_URL);
  const { stdout, stderr } = await execFileAsync(process.execPath, [RELEASE_PROVENANCE_SCRIPT], {
    cwd: PROJECT_ROOT_PATH,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  assert.equal(stderr.trim(), '');
  const provenance = JSON.parse(stdout);
  assertReleaseProvenanceDocument(provenance, pkg);

  const { validateLocalProvenanceDocument } = await import('../scripts/release-audit.mjs');
  assert.deepEqual(validateLocalProvenanceDocument(provenance), {
    schema: RELEASE_PROVENANCE_SCHEMA,
    file_count: provenance.counts.files,
    root_hash: provenance.root_hash,
    summary_path: null,
  });
  assert.throws(
    () => validateLocalProvenanceDocument({ ...provenance, root_hash: provenance.root_hash.replace('sha256:', '') }),
    /root hash/i,
  );
});

test('Cloudflare ops helpers are safe-by-default without credentials', async () => {
  const tokenSentinel = 'cf_test_token_must_not_appear';
  const accountId = 'account-for-local-plan-tests';
  const domain = 'Example.Dev';
  const {
    isValidDomainName,
    parseUsdAmount,
    assertRegistrationPriceGuard,
    buildCloudflareRequestPlan,
    buildWranglerPagesDeployPlan,
    parseCloudflareOpsCommand,
    runCloudflareOpsCommand,
    cloudflareOpsHelpText,
    normalizeRegistrantContact,
  } = await import('../scripts/cloudflare-ops.mjs');

  assert.equal(isValidDomainName('enigma-memory.dev'), true);
  assert.equal(isValidDomainName('bad_domain.dev'), false);
  assert.equal(isValidDomainName('-enigma.dev'), false);
  assert.equal(isValidDomainName('enigma'), false);
  assert.deepEqual(parseUsdAmount('10.11', '--max-price-usd'), { cents: 1011, usd: 10.11, text: '10.11' });
  assert.throws(() => parseUsdAmount('10.111', '--max-price-usd'), /two decimal places/);

  const registrantContact = {
    email: 'registrant-contact-sentinel@example.invalid',
    phone: '+1.5555550101',
    postal_info: {
      name: 'Registrant Contact Sentinel',
      organization: 'Example Registrar Org',
      address: {
        street: '123 Sentinel Street',
        city: 'Austin',
        state: 'TX',
        postal_code: '78701',
        country_code: 'us',
      },
    },
  };
  const normalizedContact = normalizeRegistrantContact(registrantContact);
  assert.equal(normalizedContact.postal_info.address.country_code, 'US');
  const contactDir = await mkdtemp(join(tmpdir(), 'enigma-registrant-contact-'));
  const contactPath = join(contactDir, 'contact.json');
  await writeFile(contactPath, JSON.stringify(registrantContact), 'utf8');

  const registerCommand = parseCloudflareOpsCommand([
    'registrar',
    'register',
    '--domain',
    domain,
    '--max-price-usd',
    '10.11',
    '--confirm-domain',
    'example.dev',
    '--confirm-registration-cost',
    '10.11',
    '--registrant-contact-json',
    contactPath,
    '--i-understand-this-charges-my-payment-method',
  ], { CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: tokenSentinel });
  assert.equal(registerCommand.execute, false, 'domain registration must default to dry-run');
  assert.equal(registerCommand.domain, 'example.dev');

  const registerPlan = await runCloudflareOpsCommand(registerCommand, {
    env: { CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: tokenSentinel },
  });
  assert.equal(registerPlan.json.dryRun, true);
  assert.equal(registerPlan.json.execute, false);
  assert.equal(registerPlan.json.safety.billable, true);
  assert.equal(registerPlan.json.safety.requiresExecute, true);
  assert.equal(registerPlan.json.safety.requiresExactDomainConfirmation, true);
  assert.equal(registerPlan.json.safety.requiresExactPriceConfirmation, true);
  assert.equal(registerPlan.json.checkPlan.tokenPrinted, false);
  assert.equal(registerPlan.json.registerPlan.tokenPrinted, false);
  assertNoTextLeak(registerPlan, tokenSentinel);
  assert.equal(registerPlan.json.registerPlan.body.contacts.registrant.emailProvided, true);
  assert.equal(registerPlan.json.registerPlan.body.contacts.registrant.phoneProvided, true);
  assert.equal(registerPlan.json.registerPlan.body.contacts.registrant.postalInfo.countryCode, 'US');
  assertNoTextLeak(registerPlan, registrantContact.email);
  assertNoTextLeak(registerPlan, registrantContact.phone);
  assertNoTextLeak(registerPlan, registrantContact.postal_info.name);
  const rawContactRegisterPlan = buildCloudflareRequestPlan({
    operation: 'registrar.register',
    accountId,
    domain: 'example.dev',
    registrantContact,
  });
  assert.equal(rawContactRegisterPlan.body.contacts.registrant.email, registrantContact.email);

  const availability = {
    name: 'example.dev',
    registrable: true,
    pricing: { currency: 'USD', registration_cost: '10.11' },
  };
  const executeCommand = parseCloudflareOpsCommand([
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
    '--registrant-contact-json',
    contactPath,
    '--i-understand-this-charges-my-payment-method',
    '--execute',
  ], { CLOUDFLARE_ACCOUNT_ID: accountId });
  const fetchPlans = [];
  const executeResult = await runCloudflareOpsCommand(executeCommand, {
    env: { CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: tokenSentinel },
    fetchImpl: async (url, init) => {
      fetchPlans.push({ url, method: init.method });
      assert.equal(init.headers.Authorization, `Bearer ${tokenSentinel}`);
      const isCheck = url.includes('/registrar/domain-check');
      if (!isCheck) {
        const body = JSON.parse(init.body);
        assert.equal(body.contacts.registrant.email, registrantContact.email);
        assert.equal(body.contacts.registrant.phone, registrantContact.phone);
        assert.equal(body.contacts.registrant.postal_info.address.country_code, 'US');
      }
      return {
        ok: true,
        status: isCheck ? 200 : 202,
        text: async () => JSON.stringify(isCheck
          ? { success: true, result: { domains: [availability] } }
          : { success: true, result: { state: 'completed', contacts: { registrant: registrantContact } } }),
      };
    },
  });
  assert.equal(executeResult.json.execute, true);
  assert.equal(executeResult.json.dryRun, false);
  assert.equal(executeResult.json.guard.registrationCostUsd, '10.11');
  assert.deepEqual(fetchPlans.map((plan) => plan.method), ['POST', 'POST']);
  assert.equal(executeResult.json.registration.payload.result.contacts.registrant.email, '[redacted]');
  assertNoTextLeak(executeResult, tokenSentinel);
  assertNoTextLeak(executeResult, registrantContact.email);
  assertNoTextLeak(executeResult, registrantContact.phone);
  assertNoTextLeak(executeResult, registrantContact.postal_info.name);
  await assert.rejects(
    () => runCloudflareOpsCommand({ ...executeCommand, maxPriceUsd: '10.10' }, {
      env: { CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: tokenSentinel },
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: true, result: { domains: [availability] } }),
      }),
    }),
    (error) => {
      assertNoTextLeak({ message: error.message }, tokenSentinel);
      assert.match(error.message, /exceeds --max-price-usd/);
      return true;
    },
  );
  assert.deepEqual(
    assertRegistrationPriceGuard({
      domain: 'example.dev',
      maxPriceUsd: '10.11',
      confirmationDomain: 'example.dev',
      confirmationCostUsd: '10.11',
      iUnderstandThisChargesMyPaymentMethod: true,
      availability,
    }),
    {
      domain: 'example.dev',
      registrable: true,
      currency: 'USD',
      registrationCostUsd: '10.11',
      maxPriceUsd: '10.11',
      confirmedRegistrationCostUsd: '10.11',
    },
  );
  assert.throws(
    () => assertRegistrationPriceGuard({
      domain: 'example.dev',
      maxPriceUsd: '10.11',
      confirmationDomain: 'other.dev',
      confirmationCostUsd: '10.11',
      iUnderstandThisChargesMyPaymentMethod: true,
      availability,
    }),
    /confirm-domain/,
  );
  assert.throws(
    () => assertRegistrationPriceGuard({
      domain: 'example.dev',
      maxPriceUsd: '10.11',
      confirmationDomain: 'example.dev',
      confirmationCostUsd: '10.11',
      iUnderstandThisChargesMyPaymentMethod: false,
      availability,
    }),
    /charges-my-payment-method/,
  );
  assert.throws(
    () => assertRegistrationPriceGuard({
      domain: 'example.dev',
      maxPriceUsd: '10.10',
      confirmationDomain: 'example.dev',
      confirmationCostUsd: '10.11',
      iUnderstandThisChargesMyPaymentMethod: true,
      availability,
    }),
    /exceeds --max-price-usd/,
  );
  assert.throws(
    () => assertRegistrationPriceGuard({
      domain: 'example.dev',
      maxPriceUsd: '10.11',
      confirmationDomain: 'example.dev',
      confirmationCostUsd: '10.10',
      iUnderstandThisChargesMyPaymentMethod: true,
      availability,
    }),
    /exactly match current registration cost/,
  );

  const tokenPlan = buildCloudflareRequestPlan({ operation: 'token.verify' });
  assert.equal(tokenPlan.tokenPrinted, false);
  assertNoTextLeak(tokenPlan, tokenSentinel);
  assert.equal(tokenPlan.tokenScope, 'user');
  assert.match(tokenPlan.url, /\/user\/tokens\/verify$/);
  const accountTokenPlan = buildCloudflareRequestPlan({ operation: 'token.verify', accountId });
  assert.equal(accountTokenPlan.tokenPrinted, false);
  assert.equal(accountTokenPlan.tokenScope, 'account');
  assert.match(accountTokenPlan.url, new RegExp(`/accounts/${accountId}/tokens/verify$`));
  assertNoTextLeak(accountTokenPlan, tokenSentinel);
  assert.throws(
    () => buildCloudflareRequestPlan({ operation: 'registrar.check', accountId, domain: 'not a domain' }),
    /valid DNS domain name/,
  );

  const pagesCommand = parseCloudflareOpsCommand(['pages', 'deploy', '--site', '_public_site', '--project-name', 'enigma-memory']);
  assert.equal(pagesCommand.execute, false, 'Pages deployment must default to plan-only');
  const pagesPlan = buildWranglerPagesDeployPlan(pagesCommand);
  assert.equal(pagesPlan.dryRun, true);
  assert.equal(pagesPlan.execute, false);
  assert.equal(pagesPlan.tokenPrinted, false);
  const pagesOutput = await runCloudflareOpsCommand(pagesCommand, {
    execFileImpl: async () => {
      throw new Error('Pages deploy must not execute in dry-run mode');
    },
  });
  assert.equal(pagesOutput.json.dryRun, true);
  assert.equal(pagesOutput.json.execute, false);
  assert.match(pagesOutput.json.claimBoundary, /no Cloudflare Pages deployment was executed/);
  assertNoTextLeak(pagesOutput, tokenSentinel);

  const authHeader = (headers) => headers?.Authorization ?? headers?.authorization ?? (typeof headers?.get === 'function' ? headers.get('Authorization') : undefined);
  const pagesVerifyCommand = parseCloudflareOpsCommand([
    'pages',
    'verify',
    '--url',
    'https://enigma.pages.dev/',
    '--project-name',
    'enigma-memory',
    '--cloudflare-live',
    'auto',
  ]);
  assert.equal(pagesVerifyCommand.kind, 'pages.verify');
  assert.equal(pagesVerifyCommand.url, 'https://enigma.pages.dev/');
  assert.equal(pagesVerifyCommand.projectName, 'enigma-memory');
  assert.throws(
    () => parseCloudflareOpsCommand([
      'pages',
      'verify',
      '--url',
      'https://credential-user:credential-pass@enigma.pages.dev/',
      '--project-name',
      'enigma-memory',
    ]),
    (error) => {
      assert.doesNotMatch(error.message, /credential-user|credential-pass/);
      assert.match(error.message, /userinfo|username|password/i);
      return true;
    },
  );
  const pagesVerifyWithoutCreds = await runCloudflareOpsCommand(pagesVerifyCommand, {
    env: {},
    fetchImpl: async (url, init = {}) => {
      assert.equal(String(url), 'https://enigma.pages.dev/');
      assert.equal(authHeader(init.headers), undefined, 'Cloudflare Pages public verification fetch must not send Authorization');
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'text/html' },
        text: async () => `<!doctype html><html><body>${RAW_MEMORY}</body></html>`,
      };
    },
  });
  assert.equal(pagesVerifyWithoutCreds.json.operation, 'pages.verify');
  assert.equal(pagesVerifyWithoutCreds.json.readiness.public_live_ready, true);
  assert.equal(pagesVerifyWithoutCreds.json.checks.cloudflare_live.skipped, true);
  assert.equal(pagesVerifyWithoutCreds.json.credentials_required, false);
  assert.equal(pagesVerifyWithoutCreds.json.credentials_used, false);
  assertNoTextLeak(pagesVerifyWithoutCreds, tokenSentinel);
  assertNoRawMemory(pagesVerifyWithoutCreds);

  const pagesVerifyRequests = [];
  const pagesVerifyWithCreds = await runCloudflareOpsCommand(pagesVerifyCommand, {
    env: { CLOUDFLARE_API_TOKEN: tokenSentinel, CLOUDFLARE_ACCOUNT_ID: accountId },
    fetchImpl: async (url, init = {}) => {
      const urlText = String(url);
      pagesVerifyRequests.push({ url: urlText, authorization: authHeader(init.headers) });
      if (urlText === 'https://enigma.pages.dev/') {
        assert.equal(authHeader(init.headers), undefined, 'public Pages fetch must stay unauthenticated even when credentials exist');
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'text/html' },
          text: async () => `<!doctype html><html><body>${registrantContact.email}${RAW_MEMORY}</body></html>`,
        };
      }
      assert.match(urlText, /api\.cloudflare\.com\/client\/v4/);
      assert.equal(authHeader(init.headers), `Bearer ${tokenSentinel}`);
      const payload = {
        success: true,
        result: {
          status: 'active',
          name: 'enigma-memory',
          project_name: 'enigma-memory',
          subdomain: 'enigma.pages.dev',
          domains: ['enigma.pages.dev'],
          canonical_deployment: { url: 'https://enigma.pages.dev/' },
          raw_memory: RAW_MEMORY,
        },
      };
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(payload),
        json: async () => payload,
      };
    },
  });
  assert.equal(pagesVerifyWithCreds.json.operation, 'pages.verify');
  assert.equal(pagesVerifyWithCreds.json.readiness.public_live_ready, true);
  assert.equal(pagesVerifyWithCreds.json.readiness.cloudflare_observed, true);
  assert.equal(pagesVerifyWithCreds.json.checks.cloudflare_live.ok, true);
  assert.equal(pagesVerifyWithCreds.json.credentials_used, true);
  assert.equal(pagesVerifyRequests.some((request) => request.authorization === `Bearer ${tokenSentinel}`), true);
  assertNoTextLeak(pagesVerifyWithCreds, tokenSentinel);
  assertNoTextLeak(pagesVerifyWithCreds, registrantContact.email);
  assertNoRawMemory(pagesVerifyWithCreds);

  const pagesVerifyRequiredWithoutAccount = await runCloudflareOpsCommand(parseCloudflareOpsCommand([
    'pages',
    'verify',
    '--url',
    'https://enigma.pages.dev/',
    '--project-name',
    'enigma-memory',
    '--cloudflare-live',
    'required',
  ]), {
    env: { CLOUDFLARE_API_TOKEN: tokenSentinel },
    fetchImpl: async (url, init = {}) => {
      assert.equal(String(url), 'https://enigma.pages.dev/');
      assert.equal(authHeader(init.headers), undefined, 'public Pages fetch must stay unauthenticated');
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'text/html' },
        text: async () => '<!doctype html><html><body>Enigma public site</body></html>',
      };
    },
  });
  assert.equal(pagesVerifyRequiredWithoutAccount.json.ok, false);
  assert.equal(pagesVerifyRequiredWithoutAccount.json.readiness.cloudflare_observed, false);
  assert.equal(pagesVerifyRequiredWithoutAccount.json.credentials_used, false);
  assert.equal(pagesVerifyRequiredWithoutAccount.json.checks.cloudflare_live.skipped, true);
  assert.match(JSON.stringify(pagesVerifyRequiredWithoutAccount.json.external_blockers), /account-id|account_id|Pages project/i);

  const pagesVerifyProjectMismatchRequests = [];
  const pagesVerifyProjectMismatch = await runCloudflareOpsCommand(parseCloudflareOpsCommand([
    'pages',
    'verify',
    '--url',
    'https://enigma.pages.dev/',
    '--project-name',
    'enigma-memory',
    '--domain',
    'enigma.pages.dev',
    '--cloudflare-live',
    'required',
  ]), {
    env: { CLOUDFLARE_API_TOKEN: tokenSentinel, CLOUDFLARE_ACCOUNT_ID: accountId },
    fetchImpl: async (url, init = {}) => {
      const urlText = String(url);
      if (urlText === 'https://enigma.pages.dev/') {
        assert.equal(authHeader(init.headers), undefined, 'public Pages verification fetch must stay unauthenticated');
        return {
          ok: true,
          status: 200,
          url: 'https://enigma.pages.dev/',
          headers: { get: () => 'text/html' },
          text: async () => '<!doctype html><html><body>Enigma public site</body></html>',
        };
      }
      assert.equal(authHeader(init.headers), `Bearer ${tokenSentinel}`);
      const isPagesProjectLookup = /\/pages(?:\/projects|\/v1)?/i.test(urlText);
      if (isPagesProjectLookup) pagesVerifyProjectMismatchRequests.push(urlText);
      const payload = isPagesProjectLookup
        ? {
          success: true,
          result: {
            name: 'other-pages-project',
            project_name: 'other-pages-project',
            subdomain: 'other-pages-project.pages.dev',
            domains: ['other-pages-project.pages.dev'],
          },
        }
        : {
          success: true,
          result: {
            id: accountId,
            status: 'active',
          },
        };
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(payload),
        json: async () => payload,
      };
    },
  });
  assert.equal(pagesVerifyProjectMismatch.json.readiness.cloudflare_observed, false);
  assert.equal(pagesVerifyProjectMismatch.json.readiness.hosted_live_ready, false);
  assert.equal(pagesVerifyProjectMismatchRequests.some((url) => /pages\/projects|pages\/v1|\/pages/i.test(url)), true);
  assert.match(JSON.stringify(pagesVerifyProjectMismatch.json.external_blockers), /project|domain|url|Pages/i);
  assertNoTextLeak(pagesVerifyProjectMismatch, tokenSentinel);

  const executeWithoutAccount = parseCloudflareOpsCommand([
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
    '--execute',
  ]);
  await assert.rejects(
    () => runCloudflareOpsCommand(executeWithoutAccount, {
      env: { CLOUDFLARE_API_TOKEN: tokenSentinel },
    }),
    (error) => {
      assertNoTextLeak({ message: error.message }, tokenSentinel);
      assert.match(error.message, /CLOUDFLARE_ACCOUNT_ID|--account-id/);
      return true;
    },
  );

  const help = cloudflareOpsHelpText();
  assert.match(help, /pages verify --url <https-url>/i);
  assert.match(help, /without\s+Authorization/i);
  assert.match(help, /dry-run plans unless --execute is provided/i);
  assert.match(help, /token is never printed/i);
  assert.doesNotMatch(help, /Authorization:\s*Bearer\s+\S+/i);
});

test('infrastructure readiness script, schema, and contract-only output are claim-bounded', async () => {
  const tokenSentinel = 'infra_token_must_not_appear_in_json';
  const contactSentinel = 'readiness-contact-sentinel@example.invalid';
  const rawMemorySentinel = 'readiness raw memory sentinel must not appear';
  const pkg = await readJson(PACKAGE_JSON_URL);
  assert.equal(pkg.scripts?.['infrastructure:readiness'], `node ${INFRASTRUCTURE_READINESS_SCRIPT}`);
  assert.equal(packageFilesCover(pkg, INFRASTRUCTURE_READINESS_SCRIPT), true, 'infrastructure readiness script must be packaged');
  assert.equal(packageFilesCover(pkg, INFRASTRUCTURE_READINESS_MANIFEST_SCHEMA_PATH), true, 'readiness manifest schema must be packaged');

  const schema = await readJson(new URL(`../${INFRASTRUCTURE_READINESS_MANIFEST_SCHEMA_PATH}`, import.meta.url));
  assert.match(schema.$id, /infrastructure-readiness-manifest-v1\.schema\.json$/);
  assert.equal(schema.properties?.schema?.const, INFRASTRUCTURE_READINESS_MANIFEST_SCHEMA);
  assert.deepEqual(schema.properties?.claim_boundary?.type, ['string', 'array']);

  const {
    INFRASTRUCTURE_READINESS_SCHEMA: readinessSchema,
    INFRASTRUCTURE_READINESS_MANIFEST_SCHEMA: manifestSchema,
    parseInfrastructureReadinessArgs,
    validateInfrastructureReadinessManifest,
    runInfrastructureReadiness,
    infrastructureReadinessHelpText,
    assertNoSecretMaterial,
  } = await import('../scripts/infrastructure-readiness.mjs');
  assert.equal(readinessSchema, INFRASTRUCTURE_READINESS_SCHEMA);
  assert.equal(manifestSchema, INFRASTRUCTURE_READINESS_MANIFEST_SCHEMA);
  assert.match(infrastructureReadinessHelpText(), /--manifest <path>/i);
  assert.match(infrastructureReadinessHelpText(), /--cloudflare-live off\|auto\|required/i);
  assert.doesNotMatch(infrastructureReadinessHelpText(), /Authorization:\s*Bearer\s+\S+/i);

  const manifest = {
    schema: INFRASTRUCTURE_READINESS_MANIFEST_SCHEMA,
    mode: 'contract-only',
    public_site: { url: 'https://enigma.example.invalid/' },
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
      network_access_policy: 'network-policy-runbook#ready',
      kms_custody: 'kms-custody-runbook#ready',
      tenant_policy_approval: 'tenant-policy-runbook#ready',
      usage_metering: 'usage-metering-runbook#ready',
      service_settlement: 'service-settlement-runbook#ready',
      monitoring_alerting: 'monitoring-alerting-runbook#ready',
      public_site_security: 'public-site-security-runbook#ready',
      security_threat_model: 'security-threat-model-runbook#ready',
      legal_compliance_approval: 'legal-compliance-runbook#ready',
      support_sla: 'support-sla-runbook#ready',
      incident_drill: 'incident-drill-runbook#ready',
      backup_restore_drill: 'backup-restore-drill-runbook#ready',
      operator_acceptance: 'operator-acceptance#contract',
    },
    operator_acceptance: { decision: 'go' },
    claim_boundary: 'Contract-only readiness evidence; not hosted relay, gateway, KMS, storage, SIEM, backup, operator, or token readiness.',
  };
  const validated = await validateInfrastructureReadinessManifest(manifest);
  assert.equal(validated.schema, INFRASTRUCTURE_READINESS_MANIFEST_SCHEMA);

  await withTempDir('enigma-infra-readiness-', async (dir) => {
    const manifestPath = join(dir, 'readiness-manifest.json');
    await writeFile(manifestPath, JSON.stringify(manifest), 'utf8');
    const command = parseInfrastructureReadinessArgs(['--manifest', manifestPath], {
      CLOUDFLARE_API_TOKEN: tokenSentinel,
    });
    const output = await runInfrastructureReadiness(command, {
      env: { CLOUDFLARE_API_TOKEN: tokenSentinel },
      now: new Date('2026-06-23T00:00:00.000Z'),
      fetchImpl: async () => {
        throw new Error('contract-only readiness must not perform live fetches');
      },
    });
    assert.equal(output.schema, INFRASTRUCTURE_READINESS_SCHEMA);
    assert.equal(output.ok, true);
    assert.equal(output.generated_at, '2026-06-23T00:00:00.000Z');
    assert.equal(output.mode, 'contract');
    assert.equal(output.credentials_required, false);
    assert.deepEqual(output.credentials_used, { cloudflare_api_token: false });
    assert.equal(output.readiness.contract_ready, true);
    assert.equal(output.readiness.public_live_ready, false);
    assert.equal(output.readiness.cloudflare_observed, false);
    assert.equal(output.readiness.hosted_live_ready, false);
    assert.ok(Array.isArray(output.checks));
    assert.deepEqual(output.external_blockers, []);
    assert.match(output.claim_boundary.join(' '), /not .*hosted|hosted .*not/i);
    assertNoSentinelLeaks(output, [tokenSentinel, contactSentinel, rawMemorySentinel]);
  });

  for (const key of ['api_token', 'access_token', 'auth_token', 'cloudflare_api_token', 'github_token', 'private_key', 'password']) {
    assert.throws(
      () => assertNoSecretMaterial({ [key]: tokenSentinel }),
      (error) => {
        assertNoSentinelLeaks({ message: error.message }, [tokenSentinel]);
        assert.match(error.message, /secret|token/i);
        return true;
      },
    );
  }
  await assert.rejects(
    async () => validateInfrastructureReadinessManifest({
      ...manifest,
      api_token: tokenSentinel,
      contact_secret: contactSentinel,
      raw_secret_memory: rawMemorySentinel,
    }),
    (error) => {
      assertNoSentinelLeaks({ message: error.message }, [tokenSentinel, contactSentinel, rawMemorySentinel]);
      assert.match(error.message, /secret|raw|private|contact/i);
      return true;
    },
  );

  assert.throws(
    () => validateInfrastructureReadinessManifest({
      ...manifest,
      refs: { ...manifest.refs, durable_storage: 'https://user:password-value@example.invalid/evidence' },
    }),
    (error) => {
      assert.doesNotMatch(error.message, /password-value/);
      assert.match(error.message, /URL credentials|secret/i);
      return true;
    },
  );
});

test('infrastructure readiness live checks use fake fetches and never overclaim hosted readiness', async () => {
  const tokenSentinel = 'infra_live_token_must_not_appear';
  const contactSentinel = 'infra-live-contact@example.invalid';
  const rawMemorySentinel = 'infra live raw memory sentinel must not appear';
  const {
    parseInfrastructureReadinessArgs,
    validateInfrastructureReadinessManifest,
    runInfrastructureReadiness,
  } = await import('../scripts/infrastructure-readiness.mjs');

  const baseManifest = {
    schema: INFRASTRUCTURE_READINESS_MANIFEST_SCHEMA,
    mode: 'hosted-live',
    public_site: { url: 'https://public.example.invalid/' },
    cloudflare_pages: { project_name: 'enigma-memory', project_url: 'https://enigma.pages.dev/', account_id: 'account-for-readiness-live' },
    relay: { url: 'https://relay.example.invalid/readyz', ref: 'relay-deploy#2026-06-23' },
    gateway: { url: 'https://gateway.example.invalid/readyz', ref: 'gateway-deploy#2026-06-23' },
    refs: {
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
      network_access_policy: 'network-policy-runbook#ready',
      kms_custody: 'kms-custody-runbook#ready',
      tenant_policy_approval: 'tenant-policy-runbook#ready',
      usage_metering: 'usage-metering-runbook#ready',
      service_settlement: 'service-settlement-runbook#ready',
      monitoring_alerting: 'monitoring-alerting-runbook#ready',
      public_site_security: 'public-site-security-runbook#ready',
      security_threat_model: 'security-threat-model-runbook#ready',
      legal_compliance_approval: 'legal-compliance-runbook#ready',
      support_sla: 'support-sla-runbook#ready',
      incident_drill: 'incident-drill-runbook#ready',
      backup_restore_drill: 'backup-restore-drill-runbook#ready',
    },
    operator_acceptance: { decision: 'go', ref: 'operator-acceptance#go' },
    external_blockers: [],
    claim_boundary: 'Live checks are bounded to static public reachability plus relay/gateway JSON shape and Cloudflare token observation.',
  };

  for (const [label, override] of [
    ['public_site.url', { public_site: { url: 'http://public.example.invalid/' } }],
    ['cloudflare.pages_url', { cloudflare_pages: { project_url: 'http://enigma.pages.dev/', account_id: 'account-for-readiness-live' } }],
    ['relay.url', { relay: { url: 'http://relay.example.invalid/readyz', ref: 'relay-deploy#2026-06-23' } }],
    ['gateway.url', { gateway: { url: 'http://gateway.example.invalid/readyz', ref: 'gateway-deploy#2026-06-23' } }],
  ]) {
    await assert.rejects(
      async () => validateInfrastructureReadinessManifest({ ...baseManifest, ...override }),
      new RegExp(`https|localhost|${label.replace('.', '\\.')}`, 'i'),
    );
  }

  await assert.rejects(
    async () => validateInfrastructureReadinessManifest({
      ...baseManifest,
      relay: { url: 'https://relay.example.invalid/health', ref: 'relay-deploy#2026-06-23' },
    }),
    /readyz|livez/i,
  );
  await assert.rejects(
    async () => validateInfrastructureReadinessManifest({
      ...baseManifest,
      gateway: { url: 'https://gateway.example.invalid/policy', ref: 'gateway-deploy#2026-06-23' },
    }),
    /readyz|livez/i,
  );
  await assert.rejects(
    async () => validateInfrastructureReadinessManifest({
      ...baseManifest,
      relay: { url: 'https://relay.example.invalid/readyz?token=abcdef', ref: 'relay-deploy#2026-06-23' },
    }),
    /query strings or fragments/i,
  );
  await assert.rejects(
    async () => validateInfrastructureReadinessManifest({
      ...baseManifest,
      gateway: { url: 'https://gateway.example.invalid/livez#token', ref: 'gateway-deploy#2026-06-23' },
    }),
    /query strings or fragments/i,
  );

  async function runManifest(manifest, fetchImpl, env = {}) {
    return withTempDir('enigma-infra-live-', async (dir) => {
      const manifestPath = join(dir, 'readiness-manifest.json');
      await writeFile(manifestPath, JSON.stringify(manifest), 'utf8');
      const command = parseInfrastructureReadinessArgs(['--manifest', manifestPath, '--live', '--cloudflare-live', 'required'], env);
      const output = await runInfrastructureReadiness(command, {
        env,
        now: new Date('2026-06-23T00:00:00.000Z'),
        fetchImpl: async (url, init = {}) => {
          const urlText = String(url);
          if (/api\.cloudflare\.com\/client\/v4/.test(urlText)) {
            assert.equal(authHeader(init.headers), `Bearer ${tokenSentinel}`);
            if (urlText.includes('/tokens/verify')) {
              const expectedAccountId = manifest.cloudflare_pages?.account_id ?? manifest.cloudflare?.account_id ?? null;
              if (expectedAccountId) {
                assert.match(urlText, new RegExp(`/accounts/${expectedAccountId}/tokens/verify$`));
                assert.doesNotMatch(urlText, /\/user\/tokens\/verify$/);
              } else {
                assert.match(urlText, /\/user\/tokens\/verify$/);
              }
            }
            const payload = {
              success: true,
              result: {
                id: 'account-for-readiness-live',
                name: 'enigma-memory',
                project_name: 'enigma-memory',
                subdomain: 'enigma.pages.dev',
                domains: ['enigma.pages.dev'],
                canonical_deployment: { url: 'https://enigma.pages.dev/' },
              },
            };
            return {
              ok: true,
              status: 200,
              headers: { get: () => 'application/json' },
              text: async () => JSON.stringify(payload),
              json: async () => payload,
            };
          }
          return fetchImpl(url, init);
        },
      });
      assertNoSentinelLeaks(output, [tokenSentinel, contactSentinel, rawMemorySentinel]);
      return output;
    });
  }

  const authHeader = (headers) => headers?.Authorization ?? headers?.authorization ?? (typeof headers?.get === 'function' ? headers.get('Authorization') : undefined);
  const readyPayload = (service, refs = baseManifest.refs) => ({
    ok: true,
    service,
    status: 'ready',
    checks: [{ name: 'production_evidence_refs', ok: true }],
    evidence_refs: refs,
    missing_evidence_refs: [],
  });

  const localhostReady = await withTempDir('enigma-infra-localhost-', async (dir) => {
    const manifestPath = join(dir, 'readiness-manifest.json');
    await writeFile(manifestPath, JSON.stringify({
      ...baseManifest,
      public_site: { url: 'http://localhost:4173/' },
      cloudflare_pages: { project_url: 'http://localhost:4173/', account_id: 'local-account' },
      relay: { url: 'http://127.0.0.1:8787/readyz', ref: 'local-relay#demo' },
      gateway: { url: 'http://127.0.0.1:8797/readyz', ref: 'local-gateway#demo' },
      claim_boundary: [
        'Localhost/demo readiness is allowed only for local operator smoke checks.',
        'Localhost/demo readiness is not hosted live readiness evidence.',
      ],
    }), 'utf8');
    const command = parseInfrastructureReadinessArgs(['--manifest', manifestPath, '--live', '--allow-localhost', '--cloudflare-live', 'off']);
    return runInfrastructureReadiness(command, {
      env: {},
      now: new Date('2026-06-23T00:00:00.000Z'),
      fetchImpl: async (url, init = {}) => {
        assert.equal(authHeader(init.headers), undefined, 'localhost readiness smoke must not send Authorization');
        const isJson = String(url).includes('/readyz');
        return {
          ok: true,
          status: 200,
          headers: { get: () => isJson ? 'application/json' : 'text/html' },
          text: async () => '<!doctype html><html><body>local demo</body></html>',
          json: async () => ({ ok: true, refs: { deployment: 'local-demo-ref' } }),
        };
      },
    });
  });
  assert.equal(localhostReady.readiness.public_live_ready, true);
  assert.equal(localhostReady.readiness.hosted_live_ready, false);
  assert.ok(localhostReady.external_blockers.some((blocker) => /localhost|local|private|demo/i.test(String(blocker))));


  const successRequests = [];
  const success = await runManifest(baseManifest, async (url, init = {}) => {
    successRequests.push({ url: String(url), headers: init.headers ?? {} });
    if (String(url).includes('public.example.invalid') || String(url).includes('enigma.pages.dev')) {
      assert.equal(authHeader(init.headers), undefined, 'public and Cloudflare Pages fetches must not send Authorization');
    }
    if (String(url).includes('relay.example.invalid') || String(url).includes('gateway.example.invalid')) {
      assert.equal(init.redirect, 'manual');
      const service = String(url).includes('relay.example.invalid') ? 'enigma-relay' : 'enigma-gateway';
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify(readyPayload(service)),
        json: async () => readyPayload(service),
      };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'text/html' },
      text: async () => `<!doctype html><html><body>${contactSentinel}${rawMemorySentinel}</body></html>`,
      json: async () => ({ ok: true, refs: { deployment: 'live-ref' }, contact: contactSentinel, raw_memory: rawMemorySentinel }),
    };
  }, { CLOUDFLARE_API_TOKEN: tokenSentinel });
  assert.equal(success.ok, true);
  assert.equal(success.readiness.contract_ready, true);
  assert.equal(success.readiness.public_live_ready, true);
  assert.equal(success.readiness.cloudflare_observed, true);
  const cloudflareObservation = success.checks.find((check) => check.name === 'cloudflare.observation');
  assert.equal(cloudflareObservation?.ok, true);
  assert.equal(cloudflareObservation?.token_scope, 'account');
  assert.equal(cloudflareObservation?.account_checked, true);
  assert.equal(cloudflareObservation?.project_checked, true);
  assert.equal(success.readiness.hosted_live_ready, true);
  assert.equal(success.external_blockers.length, 0);
  assert.ok(successRequests.some((request) => request.url.includes('public.example.invalid')));

  const noCloudflareObservation = await withTempDir('enigma-infra-live-no-cloudflare-', async (dir) => {
    const manifestPath = join(dir, 'readiness-manifest.json');
    await writeFile(manifestPath, JSON.stringify(baseManifest), 'utf8');
    const command = parseInfrastructureReadinessArgs(['--manifest', manifestPath, '--live', '--cloudflare-live', 'off']);
    return runInfrastructureReadiness(command, {
      env: {},
      now: new Date('2026-06-23T00:00:00.000Z'),
      fetchImpl: async (url, init = {}) => {
        assert.doesNotMatch(String(url), /api\.cloudflare\.com\/client\/v4/);
        if (String(url).includes('relay.example.invalid') || String(url).includes('gateway.example.invalid')) {
          assert.equal(init.redirect, 'manual');
          const service = String(url).includes('relay.example.invalid') ? 'enigma-relay' : 'enigma-gateway';
          return {
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            text: async () => JSON.stringify(readyPayload(service)),
            json: async () => readyPayload(service),
          };
        }
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'text/html' },
          text: async () => '<!doctype html><html><body>Enigma public site</body></html>',
          json: async () => ({ ok: true }),
        };
      },
    });
  });
  assert.equal(noCloudflareObservation.ok, false);
  assert.equal(noCloudflareObservation.readiness.public_live_ready, true);
  assert.equal(noCloudflareObservation.readiness.cloudflare_observed, false);
  assert.equal(noCloudflareObservation.readiness.hosted_live_ready, false);
  assert.equal(noCloudflareObservation.checks.find((check) => check.name === 'cloudflare.observation')?.ok, false);
  assert.ok(noCloudflareObservation.external_blockers.some((blocker) => /Cloudflare live observation did not complete/.test(String(blocker))));

  const fakeEndpoint = await runManifest(baseManifest, async (url, init = {}) => {
    const urlText = String(url);
    if (urlText.includes('relay.example.invalid') || urlText.includes('gateway.example.invalid')) {
      assert.equal(init.redirect, 'manual');
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify({ ok: true, refs: { deployment: 'fake-ref' } }),
        json: async () => ({ ok: true, refs: { deployment: 'fake-ref' } }),
      };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'text/html' },
      text: async () => '<!doctype html><html><body>ok</body></html>',
      json: async () => ({ ok: true }),
    };
  }, { CLOUDFLARE_API_TOKEN: tokenSentinel });
  assert.equal(fakeEndpoint.readiness.hosted_live_ready, false);

  const sensitiveEndpoint = await runManifest(baseManifest, async (url, init = {}) => {
    const urlText = String(url);
    if (urlText.includes('relay.example.invalid') || urlText.includes('gateway.example.invalid')) {
      assert.equal(init.redirect, 'manual');
      const service = urlText.includes('relay.example.invalid') ? 'enigma-relay' : 'enigma-gateway';
      const payload = readyPayload(service);
      payload.raw_memory = 'private prompt must not echo';
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify(payload),
        json: async () => payload,
      };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'text/html' },
      text: async () => '<!doctype html><html><body>ok</body></html>',
      json: async () => ({ ok: true }),
    };
  }, { CLOUDFLARE_API_TOKEN: tokenSentinel });
  assert.equal(sensitiveEndpoint.readiness.hosted_live_ready, false);
  assert.match(sensitiveEndpoint.checks.map((check) => check.error ?? '').join('\n'), /secret-looking|raw_memory/i);

  const redirectedEndpoint = await runManifest(baseManifest, async (url, init = {}) => {
    const urlText = String(url);
    if (urlText.includes('relay.example.invalid') || urlText.includes('gateway.example.invalid')) {
      assert.equal(init.redirect, 'manual');
      return {
        ok: false,
        status: 302,
        headers: { get: () => '' },
        text: async () => '',
        json: async () => ({}),
      };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'text/html' },
      text: async () => '<!doctype html><html><body>ok</body></html>',
      json: async () => ({ ok: true }),
    };
  }, { CLOUDFLARE_API_TOKEN: tokenSentinel });
  assert.equal(redirectedEndpoint.readiness.hosted_live_ready, false);
  assert.match(redirectedEndpoint.checks.map((check) => check.error ?? '').join('\n'), /must not redirect/);
  const missingThreatModelRefs = { ...baseManifest.refs };
  delete missingThreatModelRefs.security_threat_model;
  const missingThreatModel = await runManifest({
    ...baseManifest,
    refs: missingThreatModelRefs,
  }, async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'text/html' },
    text: async () => '<!doctype html><html><body>Enigma public site</body></html>',
    json: async () => ({ ok: true, refs: { deployment: 'live-ref' } }),
  }), { CLOUDFLARE_API_TOKEN: tokenSentinel });
  assert.equal(missingThreatModel.ok, false);
  assert.equal(missingThreatModel.readiness.contract_ready, true);
  assert.equal(missingThreatModel.readiness.hosted_live_ready, false);
  assert.ok(missingThreatModel.external_blockers.some((blocker) => /refs\.security_threat_model/.test(String(blocker))));


  const accountlessCloudflare = await runManifest({
    ...baseManifest,
    cloudflare_pages: { project_name: 'enigma-memory', project_url: 'https://enigma.pages.dev/' },
  }, async (url, init = {}) => {
    if (String(url).includes('public.example.invalid') || String(url).includes('enigma.pages.dev')) {
      assert.equal(authHeader(init.headers), undefined, 'public and Cloudflare Pages fetches must not send Authorization');
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'text/html' },
      text: async () => '<!doctype html><html><body>Enigma public site</body></html>',
      json: async () => ({ ok: true, refs: { deployment: 'live-ref' } }),
    };
  }, { CLOUDFLARE_API_TOKEN: tokenSentinel });
  assert.equal(accountlessCloudflare.readiness.cloudflare_observed, false);
  assert.equal(accountlessCloudflare.readiness.hosted_live_ready, false);
  assert.ok(accountlessCloudflare.external_blockers.some((blocker) => /Cloudflare|account_id|project/i.test(String(blocker))));

  const relayUnauthenticated = await runManifest(baseManifest, async (url, init = {}) => {
    if (String(url).includes('relay.example.invalid')) assert.equal(authHeader(init.headers), undefined, 'relay readiness fetch must be unauthenticated');
    return {
      ok: !String(url).includes('relay.example.invalid'),
      status: String(url).includes('relay.example.invalid') ? 401 : 200,
      headers: { get: () => String(url).includes('relay.example.invalid') ? 'application/json' : 'text/html' },
      text: async () => `<!doctype html><html><body>${rawMemorySentinel}</body></html>`,
      json: async () => ({ ok: !String(url).includes('relay.example.invalid'), refs: { deployment: 'live-ref' }, raw_memory: rawMemorySentinel }),
    };
  }, { CLOUDFLARE_API_TOKEN: tokenSentinel });
  assert.equal(relayUnauthenticated.readiness.hosted_live_ready, false);
  assert.ok(relayUnauthenticated.checks.some((check) => /relay/i.test(check.name) && check.ok === false));


  const relayInternalShape = await runManifest(baseManifest, async (url) => ({
    ok: true,
    status: 200,
    headers: { get: () => String(url).includes('relay.example.invalid') ? 'application/json' : 'text/html' },
    text: async () => '<!doctype html><html><body>Enigma public site</body></html>',
    json: async () => String(url).includes('relay.example.invalid')
      ? ({ ok: true, refs: { deployment: 'relay-live-ref' }, internal: true })
      : ({ ok: true, refs: { deployment: 'live-ref' } }),
  }), { CLOUDFLARE_API_TOKEN: tokenSentinel });
  assert.equal(relayInternalShape.readiness.hosted_live_ready, false);
  assert.ok(relayInternalShape.checks.some((check) => /relay/i.test(check.name) && check.ok === false && check.internal === true));

  const relayLocalDemoShape = await runManifest(baseManifest, async (url) => ({
    ok: true,
    status: 200,
    headers: { get: () => String(url).includes('relay.example.invalid') ? 'application/json' : 'text/html' },
    text: async () => '<!doctype html><html><body>Enigma public site</body></html>',
    json: async () => String(url).includes('relay.example.invalid')
      ? ({ ok: true, refs: { deployment: 'relay-live-ref' }, unauthenticated_local_demo: true })
      : ({ ok: true, refs: { deployment: 'live-ref' } }),
  }), { CLOUDFLARE_API_TOKEN: tokenSentinel });
  assert.equal(relayLocalDemoShape.readiness.hosted_live_ready, false);
  assert.ok(relayLocalDemoShape.checks.some((check) => /relay/i.test(check.name) && check.ok === false && check.local_demo === true));

  const gatewayInternal = await runManifest(baseManifest, async (url) => ({
    ok: !String(url).includes('gateway.example.invalid'),
    status: String(url).includes('gateway.example.invalid') ? 500 : 200,
    headers: { get: () => String(url).includes('gateway.example.invalid') ? 'application/json' : 'text/html' },
    text: async () => `<!doctype html><html><body>${contactSentinel}</body></html>`,
    json: async () => ({ ok: !String(url).includes('gateway.example.invalid'), refs: { deployment: 'live-ref' }, contact: contactSentinel }),
  }), { CLOUDFLARE_API_TOKEN: tokenSentinel });
  assert.equal(gatewayInternal.readiness.hosted_live_ready, false);
  assert.ok(gatewayInternal.checks.some((check) => /gateway/i.test(check.name) && check.ok === false));

  const gatewayInternalShape = await runManifest(baseManifest, async (url) => ({
    ok: true,
    status: 200,
    headers: { get: () => String(url).includes('gateway.example.invalid') ? 'application/json' : 'text/html' },
    text: async () => '<!doctype html><html><body>Enigma public site</body></html>',
    json: async () => String(url).includes('gateway.example.invalid')
      ? ({ ok: true, refs: { deployment: 'gateway-live-ref' }, internal: true })
      : ({ ok: true, refs: { deployment: 'live-ref' } }),
  }), { CLOUDFLARE_API_TOKEN: tokenSentinel });
  assert.equal(gatewayInternalShape.readiness.hosted_live_ready, false);
  assert.ok(gatewayInternalShape.checks.some((check) => /gateway/i.test(check.name) && check.ok === false && check.internal === true));

  const gatewayLocalDemoShape = await runManifest(baseManifest, async (url) => ({
    ok: true,
    status: 200,
    headers: { get: () => String(url).includes('gateway.example.invalid') ? 'application/json' : 'text/html' },
    text: async () => '<!doctype html><html><body>Enigma public site</body></html>',
    json: async () => String(url).includes('gateway.example.invalid')
      ? ({ ok: true, refs: { deployment: 'gateway-live-ref' }, unauthenticated_local_demo: true })
      : ({ ok: true, refs: { deployment: 'live-ref' } }),
  }), { CLOUDFLARE_API_TOKEN: tokenSentinel });
  assert.equal(gatewayLocalDemoShape.readiness.hosted_live_ready, false);
  assert.ok(gatewayLocalDemoShape.checks.some((check) => /gateway/i.test(check.name) && check.ok === false && check.local_demo === true));


  const pendingDecision = await runManifest({
    ...baseManifest,
    operator_acceptance: { decision: 'pending' },
  }, async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'text/html' },
    text: async () => `<!doctype html><html><body>${rawMemorySentinel}</body></html>`,
    json: async () => ({ ok: true, refs: { deployment: 'live-ref' }, raw_memory: rawMemorySentinel }),
  }), { CLOUDFLARE_API_TOKEN: tokenSentinel });
  assert.equal(pendingDecision.readiness.hosted_live_ready, false);
  assert.ok(pendingDecision.external_blockers.some((blocker) => /operator/i.test(String(blocker))));

  const blocked = await runManifest({
    ...baseManifest,
    external_blockers: ['operator has not cut over public DNS'],
  }, async (url, init = {}) => {
    const urlText = String(url);
    if (urlText.includes('relay.example.invalid') || urlText.includes('gateway.example.invalid')) {
      assert.equal(init.redirect, 'manual');
      const service = urlText.includes('relay.example.invalid') ? 'enigma-relay' : 'enigma-gateway';
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify(readyPayload(service)),
        json: async () => readyPayload(service),
      };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'text/html' },
      text: async () => '<!doctype html><html><body>ok</body></html>',
      json: async () => ({ ok: true }),
    };
  }, { CLOUDFLARE_API_TOKEN: tokenSentinel });
  assert.equal(blocked.readiness.hosted_live_ready, false);
  assert.equal(blocked.external_blockers.length, 1);
});

test('preflight release audit wiring is local-only and documented', async () => {
  const pkg = await readJson(PACKAGE_JSON_URL);
  assert.equal(pkg.scripts?.['release:audit'], `node ${RELEASE_AUDIT_SCRIPT}`);
  assert.equal(packageFilesCover(pkg, RELEASE_AUDIT_SCRIPT), true, 'release audit script must be included in the package file list');
  assert.equal(pkg.scripts?.['cloudflare:ops'], `node ${CLOUDFLARE_OPS_SCRIPT}`);
  assert.equal(packageFilesCover(pkg, CLOUDFLARE_OPS_SCRIPT), true, 'Cloudflare ops script must be included in the package file list');
  assert.equal(pkg.scripts?.['cloudflare:pages:stage'], 'node scripts/stage-cloudflare-pages-artifact.mjs --site ../enigma-deploy --out .enigma/cloudflare-pages/enigmamemory.com');
  assert.equal(packageFilesCover(pkg, 'scripts/stage-cloudflare-pages-artifact.mjs'), true, 'Cloudflare Pages staging script must be included in the package file list');
  assert.equal(pkg.scripts?.['cloudflare:pages:dry-run'], 'node scripts/stage-cloudflare-pages-artifact.mjs --site ../enigma-deploy --out .enigma/cloudflare-pages/enigmamemory.com && node scripts/cloudflare-ops.mjs pages deploy --site .enigma/cloudflare-pages/enigmamemory.com --project-name enigma-memory');
  assert.equal(pkg.scripts?.['cloudflare:pages:deploy'], 'node scripts/stage-cloudflare-pages-artifact.mjs --site ../enigma-deploy --out .enigma/cloudflare-pages/enigmamemory.com && node scripts/cloudflare-ops.mjs pages deploy --site .enigma/cloudflare-pages/enigmamemory.com --project-name enigma-memory --execute');
  assert.equal(pkg.scripts?.['cloudflare:pages:verify'], 'node scripts/cloudflare-ops.mjs pages verify --url https://enigmamemory.com/ --project-name enigma-memory --domain enigmamemory.com --cloudflare-live required');
  assert.equal(pkg.scripts?.['production:workplan'], `node ${PRODUCTION_WORKPLAN_SCRIPT}`);
  assert.equal(packageFilesCover(pkg, PRODUCTION_WORKPLAN_SCRIPT), true, 'production workplan script must be included in the package file list');
  assert.equal(pkg.scripts?.['production:status'], `node ${PRODUCTION_STATUS_BOARD_SCRIPT}`);
  assert.equal(packageFilesCover(pkg, PRODUCTION_STATUS_BOARD_SCRIPT), true, 'production status board script must be included in the package file list');
  assert.equal(pkg.scripts?.['production:orchestration'], `node ${AI_ORCHESTRATION_PLAN_SCRIPT}`);
  assert.equal(packageFilesCover(pkg, AI_ORCHESTRATION_PLAN_SCRIPT), true, 'AI orchestration plan script must be included in the package file list');
  assert.equal(pkg.scripts?.['production:cloudflare-credentials'], `node ${CLOUDFLARE_CREDENTIALS_SCRIPT}`);
  assert.equal(packageFilesCover(pkg, CLOUDFLARE_CREDENTIALS_SCRIPT), true, 'Cloudflare credentials validator must be included in the package file list');
  assert.equal(pkg.scripts?.['public-beta-qa'], `node ${PUBLIC_BETA_QA_MATRIX_SCRIPT} --json`);
  assert.equal(packageFilesCover(pkg, PUBLIC_BETA_QA_MATRIX_SCRIPT), true, 'public beta QA matrix script must be included in the package file list');
  assert.equal(pkg.scripts?.['clean-machine-smoke'], `node ${CLEAN_MACHINE_SMOKE_SCRIPT} --json`);
  assert.equal(packageFilesCover(pkg, CLEAN_MACHINE_SMOKE_SCRIPT), true, 'clean-machine smoke script must be included in the package file list');
  assert.equal(pkg.scripts?.['production:support-dry-run'], `node ${SUPPORT_DRY_RUN_SCRIPT}`);
  assert.equal(packageFilesCover(pkg, SUPPORT_DRY_RUN_SCRIPT), true, 'support dry-run script must be included in the package file list');
  assert.equal(pkg.scripts?.['claude:mcpb:package'], `node ${CLAUDE_MCPB_PACKAGE_SCRIPT}`);
  assert.equal(packageFilesCover(pkg, CLAUDE_MCPB_PACKAGE_SCRIPT), true, 'Claude MCPB package script must be included in the package file list');
  assert.equal(pkg.scripts?.['package:install-smoke'], `node ${LOCAL_PACK_INSTALL_SCRIPT}`);
  assert.equal(packageFilesCover(pkg, LOCAL_PACK_INSTALL_SCRIPT), true, 'local pack install smoke script must be included in the package file list');

  const auditSource = await readFile(new URL(`../${RELEASE_AUDIT_SCRIPT}`, import.meta.url), 'utf8');
  assert.match(auditSource, /nodeTestInvocation/, 'release audit must run the Node test runner directly instead of nesting npm test inside npm run release:audit');
  assert.doesNotMatch(auditSource, /const test = npmInvocation\(\['test'\]\)/, 'release audit must avoid nested npm test lifecycle flake');
  assert.match(auditSource, /\.map\(\(entry\) => `test\/\$\{entry\.name\}`\)/, 'release audit must pass POSIX-style test paths to match npm test across Windows runners');
  assert.match(auditSource, /--test-concurrency=1/, 'release audit must serialize direct test-runner files on Windows to avoid child-process temp-path flake');
  assert.match(auditSource, /local-pack-install-smoke/, 'release audit must include local packed install smoke coverage');
  assert.match(auditSource, /verify-local-pack-install\.mjs/, 'release audit must execute the local packed install verifier');
  assert.match(auditSource, /summarizeLocalPackInstall/, 'release audit must validate local packed install output');
  assert.match(auditSource, /optional_dependencies_omitted/, 'release audit must verify optional dependencies are omitted in local packed install smoke');
  assert.match(auditSource, /offline_mode/, 'release audit must verify npm offline mode in local packed install smoke');
  assert.match(auditSource, /export_specifier_count/, 'release audit must summarize installed package export coverage');
  assert.match(auditSource, /runNativeHostInstallPlanGate/, 'release audit must include native install-plan coverage');
  assert.match(auditSource, /native-host['"],\s*['"]install-plan/, 'release audit must execute the native install-plan command shape');
  assert.match(auditSource, /writes_performed/, 'release audit must validate that install-plan does not write browser or OS registration state');
  assert.match(auditSource, /name:\s*'native-host-install-plan',\s*required:\s*false/, 'native install-plan release-audit gate must be optional/local');
  assert.match(auditSource, /runPublicSitePreflightGate/, 'release audit must include public-site preflight coverage');
  assert.match(auditSource, /name:\s*'public-site-preflight',\s*required:\s*false/, 'public-site preflight must be optional/local in release audit');
  assert.match(auditSource, /pathExists\(PUBLIC_SITE_PREFLIGHT_SCRIPT\)/, 'release audit must check whether the public-site preflight script exists before running it');
  assert.match(auditSource, /pathExists\(PUBLIC_SITE_DEFAULT_DIR\)/, 'release audit must check whether the public-site artifact exists before running it');
  assert.match(auditSource, /skipped:\s*true/, 'release audit must report skipped public-site preflight evidence when absent');
  assert.match(auditSource, /runCloudflarePagesReleasePacketGate/, 'release audit must include Cloudflare Pages release packet coverage');
  assert.match(auditSource, /name:\s*'cloudflare-pages-release-packet',\s*required:\s*false/, 'Cloudflare Pages release packet gate must be optional/local');
  assert.match(auditSource, /sitePathNeedles/, 'Cloudflare Pages release packet gate must check local site path leakage');
  assert.match(auditSource, /parsed\.site !== '<public-site>'/, 'Cloudflare Pages release packet gate must require redacted site path output');
  assert.match(auditSource, /includes\('<public-site>'\)/, 'Cloudflare Pages release packet gate must require redacted deploy-plan site path');
  assert.match(auditSource, /runCloudflareOpsHelpGate/, 'release audit must include Cloudflare ops help coverage');
  assert.match(auditSource, /name:\s*'cloudflare-ops-help',\s*required:\s*false/, 'Cloudflare ops release-audit gate must be optional/local');
  assert.match(auditSource, /cloudflare-ops\.mjs['"],\s*['"]--help/, 'Cloudflare ops release-audit gate must check only help output');
  assert.match(auditSource, /pathExists\(CLOUDFLARE_OPS_SCRIPT\)/, 'release audit must check whether the Cloudflare ops script exists before running help');
  assert.match(auditSource, /env:\s*localOnlyEnv\(\)/, 'Cloudflare ops release-audit gate must strip cloud credentials from its help check');
  assert.match(auditSource, /runProductionBackendEnvKitGate/, 'release audit must include production backend env kit coverage');
  assert.match(auditSource, /name:\s*'production-backend-env-kit',\s*required:\s*false/, 'production backend env kit gate must be optional/local');
  assert.match(auditSource, /build-production-backend-env-kit\.mjs/, 'release audit must execute the backend env kit builder shape');
  assert.match(auditSource, /relay_fail_closed/, 'release audit must validate relay env kit fail-closed defaults');
  assert.match(auditSource, /gateway_fail_closed/, 'release audit must validate gateway env kit fail-closed defaults');
  assert.match(auditSource, /runInfrastructureReadinessGate/, 'release audit must include infrastructure readiness coverage');
  assert.match(auditSource, /name:\s*'infrastructure-readiness',\s*required:\s*false/, 'infrastructure readiness release-audit gate must be optional/local');
  assert.match(auditSource, /infrastructure-readiness\.mjs/, 'release audit must execute the infrastructure readiness script shape');
  assert.match(auditSource, /pathExists\(INFRASTRUCTURE_READINESS_SCRIPT\)/, 'release audit must check whether the infrastructure readiness script exists before running it');
  assert.match(auditSource, /env:\s*localOnlyEnv\(\)/, 'infrastructure readiness release-audit gate must strip cloud credentials');
  assert.match(auditSource, /const claimBoundary = requireJsonField\(\s*json,\s*\[\s*['"]claim_boundary['"]\s*\],[\s\S]*?Array\.isArray\(value\)[\s\S]*?value\.every\(\(item\) => typeof item === ['"]string['"][\s\S]*?claimBoundaryText\(claimBoundary\)/, 'release audit must accept and normalize readiness claim_boundary arrays');
  assert.match(auditSource, /function operatorAcceptanceDecision\([^)]*\)\s*\{[\s\S]{0,800}(?:checkValues|Object\.values|Array\.isArray)/, 'release audit must scan readiness checks for operator acceptance decisions');
  assert.match(auditSource, /runOperatorEvidenceStarterGate/, 'release audit must include operator evidence starter coverage');
  assert.match(auditSource, /name:\s*'operator-evidence-starter',\s*required:\s*false/, 'operator evidence starter gate must be optional/local');
  assert.match(auditSource, /out_dir_redacted/, 'release audit must verify operator evidence starter output path redaction');
  assert.match(auditSource, /runCloudflareWorkerInspectValidatorGate/, 'release audit must include Worker inspection evidence validator coverage');
  assert.match(auditSource, /name:\s*'cloudflare-worker-inspect-validator',\s*required:\s*false/, 'Worker inspect validator gate must be optional/local');
  assert.match(auditSource, /runCloudflareCredentialsValidatorGate/, 'release audit must include Cloudflare credential validator coverage');
  assert.match(auditSource, /name:\s*'cloudflare-credentials-validator',\s*required:\s*false/, 'Cloudflare credentials validator gate must be optional/local');
  assert.match(auditSource, /validate-cloudflare-credentials\.mjs/, 'release audit must execute the Cloudflare credential validator shape');
  assert.match(auditSource, /runProductionDependencyReportGate/, 'release audit must include production dependency report coverage');
  assert.match(auditSource, /name:\s*'production-dependency-report',\s*required:\s*false/, 'production dependency report gate must be optional/local');
  assert.match(auditSource, /runProductionWorkplanGate/, 'release audit must include production workplan coverage');
  assert.match(auditSource, /name:\s*'production-workplan',\s*required:\s*false/, 'production workplan gate must be optional/local');
  assert.match(auditSource, /build-production-workplan\.mjs/, 'release audit must execute production workplan builder shape');
  assert.match(auditSource, /execution_order_count/, 'production workplan gate must summarize execution order evidence');
  assert.match(auditSource, /next_phase_index/, 'production workplan gate must locate next phase in execution order');
  assert.match(auditSource, /unknown prerequisite/, 'production workplan gate must validate graph prerequisites');
  assert.match(auditSource, /runProductionStatusBoardGate/, 'release audit must include production status board coverage');
  assert.match(auditSource, /name:\s*'production-status-board',\s*required:\s*false/, 'production status board gate must be optional/local');
  assert.match(auditSource, /build-production-status-board\.mjs/, 'release audit must execute production status board builder shape');
  assert.match(auditSource, /input_freshness_stale/, 'production status board gate must report input freshness');
  assert.match(auditSource, /input_freshness_latest_age_seconds/, 'production status board gate must report input age');
  assert.match(auditSource, /runAiOrchestrationPlanGate/, 'release audit must include AI orchestration plan coverage');
  assert.match(auditSource, /name:\s*'ai-orchestration-plan',\s*required:\s*false/, 'AI orchestration plan gate must be optional/local');
  assert.match(auditSource, /build-ai-orchestration-plan\.mjs['"],\s*['"]--status-board/, 'release audit must execute AI orchestration plan builder shape');
  assert.match(auditSource, /AI_ORCHESTRATION_PLAN_SCHEMA/, 'AI orchestration plan gate must validate the target schema');
  assert.match(auditSource, /must remain blocked while status board launch_ready is false/, 'AI orchestration plan gate must validate blocked launch readiness');
  assert.match(auditSource, /role_lane_count/, 'AI orchestration plan gate must report role lane count evidence');
  assert.match(auditSource, /wave_count/, 'AI orchestration plan gate must report wave count evidence');
  assert.match(auditSource, /source_status_fresh_input_evidence/, 'AI orchestration plan gate must validate source status freshness');
  assert.match(auditSource, /kimi_coding/, 'AI orchestration plan gate must validate Kimi lane names');
  assert.match(auditSource, /gpt55_architecture/, 'AI orchestration plan gate must validate GPT lane names');
  assert.match(auditSource, /non_delegable_controls/, 'AI orchestration plan gate must validate non-delegable controls');
  assert.match(auditSource, /AI orchestration plan must emit claim_boundary strings/, 'AI orchestration plan gate must validate claim boundaries');
  assert.match(auditSource, /tempPathNeedles/, 'AI orchestration plan gate must check for temporary fixture path leaks');
  assert.match(auditSource, /AI orchestration plan output appears to contain a secret/, 'AI orchestration plan gate must check for secret-looking output');
  assert.doesNotMatch(auditSource, /\bE:[\\/]/i, 'release audit must not require an external E: website path');
  assert.match(auditSource, /--out <file>/, 'release audit CLI must expose --out for handoff/goal-audit ingestion');

  await withTempDir('enigma-release-audit-out-', async (dir) => {
    const outPath = join(dir, 'release-audit.json');
    const run = await execFileAsync(process.execPath, [RELEASE_AUDIT_SCRIPT, '--out', outPath], {
      cwd: PROJECT_ROOT_PATH,
      env: {
        ...process.env,
        [REVIEW_PACKET_EMBEDDED_ENV]: '1',
      },
      timeout: 15000,
      windowsHide: true,
    });
    assert.equal(run.stderr, '');
    const stdoutAudit = JSON.parse(run.stdout);
    const fileAudit = JSON.parse(await readFile(outPath, 'utf8'));
    assert.equal(stdoutAudit.schema, 'enigma.release_audit.v1');
    assert.equal(fileAudit.schema, 'enigma.release_audit.v1');
    assert.deepEqual(fileAudit, stdoutAudit);
    assert.doesNotMatch(run.stdout, new RegExp(outPath.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')));
  });

  const {
    runNativeHostInstallPlanGate,
    runPublicSitePreflightGate,
    runCloudflareOpsHelpGate,
    runInfrastructureReadinessGate,
    runOperatorEvidenceStarterGate,
    runCloudflareWorkerInspectValidatorGate,
    runProductionDependencyReportGate,
    runAiOrchestrationPlanGate,
    validateInfrastructureReadiness,
    runReleaseAudit,
  } = await import('../scripts/release-audit.mjs');
  assert.equal(typeof runNativeHostInstallPlanGate, 'function');
  assert.equal(typeof runPublicSitePreflightGate, 'function');
  assert.equal(typeof runCloudflareOpsHelpGate, 'function');
  assert.equal(typeof runInfrastructureReadinessGate, 'function');
  assert.equal(typeof runOperatorEvidenceStarterGate, 'function');
  assert.equal(typeof runCloudflareWorkerInspectValidatorGate, 'function');
  assert.equal(typeof runProductionDependencyReportGate, 'function');
  assert.equal(typeof runAiOrchestrationPlanGate, 'function');
  assert.equal(typeof validateInfrastructureReadiness, 'function');
  const arrayClaimBoundary = [
    'This local audit does not claim hosted/BYOC/token readiness.',
    'Operator evidence only bounds relay and gateway readiness.',
  ];
  const arrayClaimBoundaryEvidence = validateInfrastructureReadiness({
    schema: INFRASTRUCTURE_READINESS_SCHEMA,
    ok: true,
    generated_at: '2026-06-23T00:00:00.000Z',
    mode: 'hosted-live',
    credentials_required: false,
    credentials_used: false,
    readiness: {
      contract_ready: true,
      public_live_ready: true,
      cloudflare_observed: true,
      hosted_live_ready: true,
    },
    checks: [
      { name: 'public live reachability', ok: true, live: true },
      { name: 'operator_acceptance.decision', ok: true, decision: 'go' },
    ],
    external_blockers: [],
    claim_boundary: arrayClaimBoundary,
  }, '', '', true);
  assert.deepEqual(arrayClaimBoundaryEvidence.claim_boundary, arrayClaimBoundary);
  assert.match(runReleaseAudit.toString(), /runNativeHostInstallPlanGate\(\)/);
  assert.match(runReleaseAudit.toString(), /runPublicSitePreflightGate\(\)/);
  assert.match(runReleaseAudit.toString(), /runCloudflareOpsHelpGate\(\)/);
  assert.match(runReleaseAudit.toString(), /runInfrastructureReadinessGate\(\)/);
  assert.match(runReleaseAudit.toString(), /runOperatorEvidenceStarterGate\(\)/);
  assert.match(runReleaseAudit.toString(), /runCloudflareWorkerInspectValidatorGate\(\)/);
  assert.match(runReleaseAudit.toString(), /runProductionDependencyReportGate\(\)/);
  assert.match(runReleaseAudit.toString(), /runAiOrchestrationPlanGate\(\)/);
  assert.match(runReleaseAudit.toString(), /runProductionStatusBoardGate\(\)[\s\S]*runAiOrchestrationPlanGate\(\)/, 'AI orchestration plan gate must run after production status board gate');

  const operatorEvidenceStarterGate = await runOperatorEvidenceStarterGate();
  assert.equal(operatorEvidenceStarterGate.ok, true);
  assert.equal(operatorEvidenceStarterGate.evidence.schema, 'enigma.operator_evidence_starter.v1');
  assert.equal(operatorEvidenceStarterGate.evidence.status, 'blocked_until_operator_evidence');
  assert.equal(operatorEvidenceStarterGate.evidence.out_dir_redacted, true);

  const workerInspectGate = await runCloudflareWorkerInspectValidatorGate();
  assert.equal(workerInspectGate.ok, true);
  if (workerInspectGate.evidence.skipped !== true) {
    assert.equal(workerInspectGate.evidence.schema, 'enigma.cloudflare_worker_inspection_result.v1');
    assert.equal(typeof workerInspectGate.evidence.worker_permission_ready, 'boolean');
    assert.equal(workerInspectGate.evidence.account_id_redacted, true);
  }

  const dependencyReportGate = await runProductionDependencyReportGate();
  assert.equal(dependencyReportGate.ok, true);
  assert.equal(dependencyReportGate.evidence.schema, 'enigma.production_dependency_report.v1');
  assert.equal(dependencyReportGate.evidence.status, 'blocked');
  assert.equal(dependencyReportGate.evidence.launch_ready, false);

  const docs = Object.fromEntries(
    await Promise.all(
      [
        'apps/native-host/README.md',
        'docs/install-anywhere.md',
        'docs/public-api-reference.md',
        'docs/reviewer-packet.md',
        'docs/release-evidence-2026-06-23.md',
        'docs/cloudflare-token-and-domain-runbook.md',
      ].map(async (rel) => [rel, await readFile(new URL(`../${rel}`, import.meta.url), 'utf8')]),
    ),
  );
  assert.match(docs['apps/native-host/README.md'], /native-host install-plan/i, 'native host docs must point operators to the install-plan preflight');
  assert.match(docs['apps/native-host/README.md'], /writes_performed/i, 'native host docs must state install-plan reports writes_performed without mutating registration state');
  assert.match(docs['docs/install-anywhere.md'], /native-host install-plan/i, 'install docs must include the install-plan preflight');
  assert.match(docs['docs/install-anywhere.md'], /writes_performed/i, 'install docs must state install-plan reports writes_performed without mutating registry state');
  assert.match(docs['docs/public-api-reference.md'], /install-plan/i, 'public API reference must document the native install-plan shape');
  assert.match(docs['docs/reviewer-packet.md'], /public[- ]site preflight/i, 'reviewer packet docs must include public-site preflight evidence');
  assert.match(docs['docs/release-evidence-2026-06-23.md'], /native-host install-plan/i, 'release evidence docs must include native install-plan evidence');
  assert.match(docs['docs/release-evidence-2026-06-23.md'], /public[- ]site preflight/i, 'release evidence docs must include public-site preflight evidence');
  assert.match(docs['docs/cloudflare-token-and-domain-runbook.md'], /Do not paste API tokens into chat/i, 'Cloudflare runbook must forbid pasting tokens into chat');
  assert.match(docs['docs/cloudflare-token-and-domain-runbook.md'], /dry-run registration plan unless `--execute` is present/i, 'Cloudflare runbook must document registration dry-run defaults');
  assert.match(docs['docs/cloudflare-token-and-domain-runbook.md'], /Exact domain name/i, 'Cloudflare runbook must document exact registration domain confirmation boundaries');
});


test('npm publish workflow reuses local pack install smoke before publication', async () => {
  const workflow = await readFile(NPM_PUBLISH_WORKFLOW_URL, 'utf8');
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /npm audit --audit-level=moderate/);
  assert.match(workflow, /Verify local packed install[\s\S]*?npm run package:install-smoke/);
  assert.match(workflow, /Re-run local packed install[\s\S]*?npm run package:install-smoke/);
  assert.match(workflow, /environment:\s*npm-publish/);
  assert.match(workflow, /id-token:\s*write/);
  assert.doesNotMatch(workflow, /NPM_TOKEN|NODE_AUTH_TOKEN/);
});
test('CI blocks moderate dependency advisories and runs packed install smoke', async () => {
  const ciWorkflow = await readFile(CI_WORKFLOW_URL, 'utf8');
  assert.match(ciWorkflow, /name:\s*Run security audit/);
  assert.match(ciWorkflow, /npm audit --audit-level=moderate/);
  assert.match(ciWorkflow, /Verify local packed install[\s\S]*?npm run package:install-smoke/);
  assert.match(ciWorkflow, /Run release audit when available[\s\S]*?npm run release:audit/);
  assert.doesNotMatch(ciWorkflow, /npm audit --audit-level=high/);
});

test('review packet builder and CLI copy safe public-site artifacts and release audit validates the manifest', async () => {
  const pkg = await readJson(PACKAGE_JSON_URL);
  assert.equal(pkg.scripts?.['review:packet'], `node ${REVIEW_PACKET_SCRIPT}`);
  assert.equal(packageFilesCover(pkg, REVIEW_PACKET_SCRIPT), true, 'review packet builder must be included in the package file list');
  const { buildReviewPacket } = await import('../scripts/build-review-packet.mjs');
  assert.equal(typeof buildReviewPacket, 'function');

  await withTempDir('enigma-review-packet-production-', async (dir) => {
    const siteDir = join(dir, 'public-site');
    const assetDir = join(siteDir, 'assets');
    await mkdir(assetDir, { recursive: true });
    await writeFile(join(siteDir, 'index.html'), '<!doctype html><title>Enigma public review</title><main>Local evidence only.</main>\n', 'utf8');
    await writeFile(join(assetDir, 'app.js'), 'window.ENIGMA_PUBLIC_REVIEW = "local-evidence-only";\n', 'utf8');
    await writeFile(join(siteDir, 'internal-launch-code.md'), RAW_MEMORY, 'utf8');
    const outDir = join(dir, 'packet');
    const manifest = await buildReviewPacket({
      out: outDir,
      publicSite: siteDir,
      now: '2026-06-23T00:00:00.000Z',
      env: { [REVIEW_PACKET_EMBEDDED_ENV]: '1' },
      commandRunner: reviewPacketCommandRunner(),
    });
    await assertReviewPacketDocument(manifest, outDir, { expectSite: true });
    assert.deepEqual(manifest.site, {
      provided: true,
      copied: ['site/assets/app.js', 'site/index.html'],
      denied_count: 1,
    });
    assert.deepEqual(manifest.blockers, [{ kind: 'denied-site-copy', count: 1, detail: 'denied public site paths were excluded from the review packet' }]);

    const { runReviewPacketGate, validateReviewPacketManifest } = await import('../scripts/release-audit.mjs');
    assert.equal(typeof runReviewPacketGate, 'function');
    assert.deepEqual(await validateReviewPacketManifest(manifest, outDir), {
      schema: REVIEW_PACKET_SCHEMA,
      file_count: manifest.files.length,
      evidence_files: ['evidence/local-provenance.json', 'evidence/release-audit.json', 'package/npm-pack-dry-run.json'],
      site_files: 2,
    });

    const cliSiteDir = join(dir, 'public-site-cli');
    await mkdir(join(cliSiteDir, 'assets'), { recursive: true });
    await writeFile(join(cliSiteDir, 'index.html'), '<!doctype html><title>Enigma CLI review</title><main>Safe public artifact.</main>\n', 'utf8');
    await writeFile(join(cliSiteDir, 'assets', 'app.js'), 'window.ENIGMA_PUBLIC_REVIEW_CLI = true;\n', 'utf8');
    const cliOutDir = join(dir, 'packet-cli');
    const { stdout, stderr } = await execFileAsync(process.execPath, [REVIEW_PACKET_SCRIPT, '--out', cliOutDir, '--public-site', cliSiteDir], {
      cwd: PROJECT_ROOT_PATH,
      env: { ...process.env, [REVIEW_PACKET_EMBEDDED_ENV]: '1', NO_COLOR: '1', FORCE_COLOR: '0' },
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    });
    assert.equal(stderr.trim(), '');
    const summary = JSON.parse(stdout);
    assert.equal(summary.ok, true);
    assert.equal(summary.blockers, 0);
    const cliManifest = await readJson(join(cliOutDir, REVIEW_PACKET_MANIFEST));
    await assertReviewPacketDocument(cliManifest, cliOutDir, { expectSite: true });
    assert.deepEqual(cliManifest.site, {
      provided: true,
      copied: ['site/assets/app.js', 'site/index.html'],
      denied_count: 0,
    });
  });
});

test('relay and gateway direct bins expose safe help and delegate to CLI command groups', async () => {
  const relayBin = fileURLToPath(new URL('../apps/relay/bin/enigma-relay.mjs', import.meta.url));
  const gatewayBin = fileURLToPath(new URL('../apps/gateway/bin/enigma-gateway.mjs', import.meta.url));
  const { main: relayMain } = await import('../apps/relay/bin/enigma-relay.mjs');
  const { main: gatewayMain } = await import('../apps/gateway/bin/enigma-gateway.mjs');
  const { main: cliMain } = await import('../apps/cli/bin/enigma.mjs');
  const relayState = await import('../apps/relay/src/server.mjs');
  const gatewayState = await import('../apps/gateway/src/server.mjs');

  const rootHelp = makeIo();
  assert.equal(await cliMain(['--help'], rootHelp.io), 0, rootHelp.stderr());
  assert.equal(typeof rootHelp.json().relay_gateway_options['--state-file <path>'], 'string');
  for (const helpArgs of [['relay', 'serve', '--help'], ['gateway', 'serve', '-h']]) {
    const serveHelp = makeIo();
    assert.equal(await cliMain(helpArgs, serveHelp.io), 0, serveHelp.stderr());
    assert.equal(typeof serveHelp.json().relay_gateway_options['--state-file <path>'], 'string');
  }


  for (const flag of ['--help', '-h']) {
    for (const helpArgs of [[flag], ['serve', flag]]) {
      const relayHelpProcess = await execFileAsync(process.execPath, [relayBin, ...helpArgs], { cwd: PROJECT_ROOT_PATH, timeout: 5000 });
      assert.equal(relayHelpProcess.stderr, '');
      const relayHelp = JSON.parse(relayHelpProcess.stdout);
      assert.equal(relayHelp.usage, 'enigma-relay [demo|serve] [options]');
      assert.equal(relayHelp.default_command, 'serve');
      assert.match(relayHelp.serve_options['--port <port>'], /8787/);
      assert.equal(typeof relayHelp.serve_options['--state-file <path>'], 'string');


      const gatewayHelpProcess = await execFileAsync(process.execPath, [gatewayBin, ...helpArgs], { cwd: PROJECT_ROOT_PATH, timeout: 5000 });
      assert.equal(gatewayHelpProcess.stderr, '');
      const gatewayHelp = JSON.parse(gatewayHelpProcess.stdout);
      assert.equal(gatewayHelp.usage, 'enigma-gateway [demo|serve] [options]');
      assert.equal(gatewayHelp.default_command, 'serve');
      assert.match(gatewayHelp.serve_options['--port <port>'], /8797/);
      assert.equal(typeof gatewayHelp.serve_options['--state-file <path>'], 'string');

    }
  }

  const relay = makeIo();
  assert.equal(await relayMain(['demo'], relay.io), 0, relay.stderr());
  assert.equal(relay.json().ok, true);
  const relayServe = makeIo();
  assert.equal(await relayMain(['--once', '--port', '0'], relayServe.io), 0, relayServe.stderr());
  assert.equal(relayServe.json().service, 'enigma-relay');

  const gateway = makeIo();
  assert.equal(await gatewayMain(['demo'], gateway.io), 0, gateway.stderr());
  assert.equal(gateway.json().ok, true);
  const gatewayServe = makeIo();
  assert.equal(await gatewayMain(['--once', '--port', '0'], gatewayServe.io), 0, gatewayServe.stderr());
  assert.equal(gatewayServe.json().service, 'enigma-gateway');
  const gatewayDefaultServe = makeIo();
  assert.equal(await gatewayMain(['--once'], gatewayDefaultServe.io), 0, gatewayDefaultServe.stderr());
  assert.equal(gatewayDefaultServe.json().address.port, 8797);

  await withTempDir('enigma-direct-relay-state-', async (dir) => {
    const stateFile = join(dir, 'relay-state.json');
    const relayOnce = makeIo();
    assert.equal(await relayMain(['--once', '--port', '0', '--state-file', stateFile], relayOnce.io), 0, relayOnce.stderr());
    assert.equal(relayOnce.json().service, 'enigma-relay');
    const snapshot = await readJson(stateFile);
    const hydrated = await relayState.hydrateRelayState(snapshot);
    const serialized = relayState.serializeRelayState(hydrated);
    assert.equal(serialized.schema, snapshot.schema);
  });

  await withTempDir('enigma-direct-gateway-state-', async (dir) => {
    const stateFile = join(dir, 'gateway-state.json');
    const gatewayOnce = makeIo();
    assert.equal(await gatewayMain(['--once', '--port', '0', '--state-file', stateFile], gatewayOnce.io), 0, gatewayOnce.stderr());
    assert.equal(gatewayOnce.json().service, 'enigma-gateway');

    const snapshot = await readJson(stateFile);
    const hydrated = await gatewayState.hydrateGatewayState(snapshot);
    const serialized = gatewayState.serializeGatewayState(hydrated);
    assert.equal(serialized.schema, snapshot.schema);
  });

  await withTempDir('enigma-direct-state-fail-closed-', async (dir) => {
    const relayStateFile = join(dir, 'bad-relay-state.json');
    const gatewayStateFile = join(dir, 'bad-gateway-state.json');
    await writeFile(relayStateFile, '{"schema":"unknown"}\n', 'utf8');
    await writeFile(gatewayStateFile, '{"schema":"unknown"}\n', 'utf8');

    const badRelay = makeIo();
    assert.equal(await relayMain(['--once', '--port', '0', '--state-file', relayStateFile], badRelay.io), 2);
    assert.equal(badRelay.json().ok, false);

    const badGateway = makeIo();
    assert.equal(await gatewayMain(['--once', '--port', '0', '--state-file', gatewayStateFile], badGateway.io), 2);
    assert.equal(badGateway.json().ok, false);
  });

  await withTempDir('enigma-direct-relay-persist-', async (dir) => {
    const stateFile = join(dir, 'relay-state.json');
    await relayState.saveRelayStateToFile(relayState.createRelayState({ allowUnauthenticated: true }), stateFile);
    const child = spawn(process.execPath, [relayBin, '--port', '0', '--state-file', stateFile], { cwd: PROJECT_ROOT_PATH, stdio: ['ignore', 'pipe', 'pipe'] });
    try {
      const started = await waitForChildJson(child, 'enigma-relay');
      const response = await fetch(`http://127.0.0.1:${started.address.port}/relay/push`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ encrypted_payload_hash: `sha256:${'a'.repeat(64)}` }),
      });
      assert.equal(response.status, 201);
      assert.equal((await response.json()).ok, true);
      const snapshot = await waitForCondition(async () => {
        const next = await readJson(stateFile);
        return next.relay_records?.length === 1 ? next : false;
      }, 'relay persisted pushed record');
      const hydrated = await relayState.hydrateRelayState(snapshot);
      assert.equal(relayState.serializeRelayState(hydrated).relay_records.length, 1);
    } finally {
      await stopChild(child);
    }
  });

  await withTempDir('enigma-direct-gateway-persist-', async (dir) => {
    const stateFile = join(dir, 'gateway-state.json');
    const child = spawn(process.execPath, [gatewayBin, '--port', '0', '--state-file', stateFile], { cwd: PROJECT_ROOT_PATH, stdio: ['ignore', 'pipe', 'pipe'] });
    try {
      const started = await waitForChildJson(child, 'enigma-gateway');
      const response = await fetch(`http://127.0.0.1:${started.address.port}/gateway/evaluate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          operation: 'retrieve',
          provider: 'local',
          model: 'demo',
          region: 'local',
          purpose: 'support_retrieval',
          sensitivity: 'internal',
          memory_addr: 'addr_hash_only_demo',
        }),
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).ok, true);
      const snapshot = await waitForCondition(async () => {
        const next = await readJson(stateFile);
        return next.siem_events?.length === 1 ? next : false;
      }, 'gateway persisted SIEM event');
      const hydrated = await gatewayState.hydrateGatewayState(snapshot);
      assert.equal(gatewayState.serializeGatewayState(hydrated).siem_events.length, 1);
    } finally {
      await stopChild(child);
    }
  });
});

test('package README references are included or intentionally source-only', async () => {
  const pkg = await readJson(PACKAGE_JSON_URL);
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');

  assert.equal(packageFilesCover(pkg, 'README.md'), false, 'root README is npm auto-included without a files entry');
  for (const rel of INSTALL_ONBOARDING_PACKAGE_DOCS) {
    assert.equal(readme.includes(rel), true, `${rel} must remain an explicit README reference`);
    assert.equal(packageFilesCover(pkg, rel), true, `${rel} must ship with the npm package for install/onboarding readers`);
  }
  for (const rel of SOURCE_ONLY_README_REFERENCES) {
    assert.equal(readme.includes(rel), true, `${rel} must remain an explicit README reference`);
    assert.equal(packageFilesCover(pkg, rel), false, `${rel} is a source-tree reference, not packaged runtime code`);
  }
});

test('doctor returns ok and install creates bundle and MCP config', async () => {
  const { main } = await import('../apps/cli/bin/enigma.mjs');

  await withTempDir('enigma-production-install-', async (dir) => {
    const bundlePath = join(dir, 'bundle.json');
    const configPath = join(dir, 'mcp.json');

    const install = makeIo();
    assert.equal(await main(['install', '--bundle', bundlePath, '--client', 'generic-mcp', '--out', configPath], install.io), 0, install.stderr());
    const installResult = install.json();
    assert.equal(installResult.ok, true);
    assert.equal(installResult.bundle_created, true);
    assert.equal(installResult.mcp_config_snippets?.['generic-mcp']?.mcpServers?.enigma?.command, 'enigma-mcp');
    const bundle = await readJson(bundlePath);
    assert.equal(typeof bundle, 'object');
    assert.equal(bundle.schema, 'enigma.vault_bundle.v1');

    const config = await readJson(configPath);
    assert.equal(config.schema, 'enigma.install_snippets.v1');
    assert.equal(config.snippets?.['generic-mcp']?.mcpServers?.enigma?.command, 'enigma-mcp');
    assert.equal(config.snippets['generic-mcp'].mcpServers.enigma.env?.ENIGMA_BUNDLE, bundlePath);

    const doctor = makeIo();
    assert.equal(await main(['doctor', '--bundle', bundlePath, '--client', 'generic-mcp', '--config', join(dir, 'missing-client-config.json')], doctor.io), 0, doctor.stderr());
    const doctorResult = doctor.json();
    assert.equal(doctorResult.ok, true);
  });
});

test('doctor fails closed when a required package bin is missing', async () => {
  const original = await readFile(PACKAGE_JSON_URL, 'utf8');
  try {
    const broken = JSON.parse(original);
    delete broken.bin['enigma-relay'];
    await writeFile(PACKAGE_JSON_URL, `${JSON.stringify(broken, null, 2)}\n`, 'utf8');

    const { main } = await import('../apps/cli/bin/enigma.mjs');
    const doctor = makeIo();
    assert.equal(await main(['doctor'], doctor.io), 1, doctor.stderr());
    const result = doctor.json();
    assert.equal(result.ok, false);
    assert.deepEqual(result.package_bins.missing, ['enigma-relay']);
  } finally {
    await writeFile(PACKAGE_JSON_URL, original, 'utf8');
  }
});

test('package check catches missing bins, unsafe bins, and packaged review docs', async () => {
  await assertCheckFailsWithPackage((pkg) => {
    pkg.bin['enigma-relay'] = './apps/relay/bin/missing-enigma-relay.mjs';
  }, /package\.json bin enigma-relay points to a missing file/);

  await assertCheckFailsWithPackage((pkg) => {
    pkg.bin['enigma-relay'] = './scripts/check.mjs';
  }, /package\.json bin enigma-relay must start with #!\/usr\/bin\/env node/);

  await assertCheckFailsWithPackage((pkg) => {
    pkg.files.push('SECURITY.md');
  }, /SECURITY\.md is a source-tree review doc, not packaged runtime code/);
});

test('connector dry-run connect and disconnect produce parseable MCP config JSON', async () => {
  const { connectClient, disconnectClient } = await importPackage('connectors');
  const { main } = await import('../apps/cli/bin/enigma.mjs');

  await withTempDir('enigma-production-connectors-', async (dir) => {
    const bundlePath = join(dir, 'bundle.json');
    const configPath = join(dir, 'client.json');

    const connect = await connectClient('generic-mcp', { bundlePath, configPath, dryRun: true });
    assert.equal(connect.ok, true);
    assert.equal(connect.action, 'connect');
    assert.equal(connect.dryRun, true);
    const connectedConfig = JSON.parse(connect.generatedJson);
    assert.equal(connectedConfig.mcpServers?.enigma?.command, 'enigma-mcp');
    assert.equal(connectedConfig.mcpServers.enigma.env?.ENIGMA_BUNDLE, bundlePath);

    await writeFile(configPath, connect.generatedJson, 'utf8');
    const disconnect = await disconnectClient('generic-mcp', { configPath, dryRun: true });
    assert.equal(disconnect.ok, true);
    assert.equal(disconnect.action, 'disconnect');
    assert.equal(disconnect.dryRun, true);
    const disconnectedConfig = JSON.parse(disconnect.generatedJson);
    assert.equal(disconnectedConfig.mcpServers?.enigma, undefined);

    const cliConfigPath = join(dir, 'cli-client.json');
    const cliConnect = makeIo();
    assert.equal(await main(['connect', 'generic-mcp', '--bundle', bundlePath, '--config', cliConfigPath, '--dry-run'], cliConnect.io), 0, cliConnect.stderr());
    const cliConnectResult = cliConnect.json();
    assert.equal(cliConnectResult.ok, true);
    const cliConnectConfig = JSON.parse(cliConnectResult.generatedJson);
    assert.equal(cliConnectConfig.mcpServers?.enigma?.command, 'enigma-mcp');

    const cliConnectPlain = makeIo();
    assert.equal(await main(['connect', 'generic-mcp', '--bundle', bundlePath, '--config', cliConfigPath, '--dry-run', '--plain'], cliConnectPlain.io), 0, cliConnectPlain.stderr());
    assert.match(cliConnectPlain.stdout(), /^Enigma connect\n/);
    assert.match(cliConnectPlain.stdout(), /Client: generic-mcp/);
    assert.match(cliConnectPlain.stdout(), /Config: <client-config-path>/);
    assert.match(cliConnectPlain.stdout(), /Boundary: local client config only/);
    assert.doesNotMatch(cliConnectPlain.stdout(), /^\s*\{/);
    assert.equal(cliConnectPlain.stdout().includes(dir), false);
    await writeFile(cliConfigPath, cliConnectResult.generatedJson, 'utf8');

    const cliDisconnect = makeIo();
    assert.equal(await main(['disconnect', 'generic-mcp', '--config', cliConfigPath, '--dry-run'], cliDisconnect.io), 0, cliDisconnect.stderr());
    const cliDisconnectResult = cliDisconnect.json();
    assert.equal(cliDisconnectResult.ok, true);
    const cliDisconnectConfig = JSON.parse(cliDisconnectResult.generatedJson);

    const cliDisconnectPlain = makeIo();
    assert.equal(await main(['disconnect', 'generic-mcp', '--config', cliConfigPath, '--dry-run', '--plain'], cliDisconnectPlain.io), 0, cliDisconnectPlain.stderr());
    assert.match(cliDisconnectPlain.stdout(), /^Enigma disconnect\n/);
    assert.match(cliDisconnectPlain.stdout(), /Client: generic-mcp/);
    assert.match(cliDisconnectPlain.stdout(), /Config: <client-config-path>/);
    assert.doesNotMatch(cliDisconnectPlain.stdout(), /^\s*\{/);
    assert.equal(cliDisconnectPlain.stdout().includes(dir), false);
    assert.equal(cliDisconnectConfig.mcpServers?.enigma, undefined);
  });
});

test('connector writes are atomic, semantic, idempotent, and preserve client settings', async () => {
  const { connectClient, disconnectClient, renderMcpConfig } = await importPackage('connectors');
  const { main } = await import('../apps/cli/bin/enigma.mjs');

  await withTempDir('enigma-production-connector-writes-', async (dir) => {
    const bundlePath = join(dir, 'bundle.json');
    const configPath = join(dir, 'client.json');
    const initialConfig = {
      theme: 'dark',
      mcpServers: {
        sibling: {
          command: 'sibling-mcp',
          args: ['--safe'],
          env: { SIBLING_ONLY: '1' },
        },
      },
      clientSettings: { keep: true },
    };
    await writeFile(configPath, `${JSON.stringify(initialConfig, null, 2)}\n`, 'utf8');

    const firstConnect = await connectClient('generic-mcp', {
      bundlePath,
      configPath,
      now: '2026-01-02T03:04:05.006Z',
    });
    assert.equal(firstConnect.ok, true);
    assert.equal(firstConnect.changed, true);
    assert.equal(firstConnect.backupPath, `${configPath}.bak.2026-01-02T030405006Z`);
    assert.equal(firstConnect.config.mcpServers.enigma.command, 'enigma-mcp');
    assert.equal(firstConnect.config.mcpServers.enigma.env.ENIGMA_BUNDLE, bundlePath);
    assert.deepEqual(firstConnect.config.mcpServers.sibling, initialConfig.mcpServers.sibling);
    assert.deepEqual(firstConnect.config.clientSettings, initialConfig.clientSettings);

    const backupConfig = await readJson(firstConnect.backupPath);
    assert.deepEqual(backupConfig, initialConfig);
    const writtenConfig = await readJson(configPath);
    assert.deepEqual(writtenConfig, firstConnect.config);
    assert.deepEqual((await readdir(dir)).filter((name) => name.includes('.tmp.')), []);

    const idempotentConnect = await connectClient('generic-mcp', {
      bundlePath,
      configPath,
      now: '2026-01-02T03:04:05.006Z',
    });
    assert.equal(idempotentConnect.changed, false);
    assert.equal(idempotentConnect.backupPath, null);
    assert.deepEqual(idempotentConnect.plannedWrites, []);
    assert.deepEqual((await readdir(dir)).filter((name) => name.includes('.bak.')), ['client.json.bak.2026-01-02T030405006Z']);

    const reorderedConfig = {
      theme: 'dark',
      mcpServers: {
        sibling: initialConfig.mcpServers.sibling,
        enigma: {
          env: { ENIGMA_BUNDLE: bundlePath },
          args: [],
          command: 'enigma-mcp',
        },
      },
      clientSettings: { keep: true },
    };
    await writeFile(configPath, `${JSON.stringify(reorderedConfig, null, 2)}\n`, 'utf8');
    const semanticConnect = await connectClient('generic-mcp', {
      bundlePath,
      configPath,
      now: '2026-01-02T03:04:05.006Z',
    });
    assert.equal(semanticConnect.changed, false);
    assert.equal(semanticConnect.backupPath, null);
    assert.deepEqual((await readdir(dir)).filter((name) => name.includes('.bak.')), ['client.json.bak.2026-01-02T030405006Z']);

    const semanticDisconnect = await disconnectClient('generic-mcp', {
      configPath,
      now: '2026-01-02T03:04:05.006Z',
    });
    assert.equal(semanticDisconnect.changed, true);
    assert.equal(semanticDisconnect.backupPath, `${configPath}.bak.2026-01-02T030405006Z.1`);
    assert.deepEqual(semanticDisconnect.config, {
      theme: 'dark',
      mcpServers: { sibling: initialConfig.mcpServers.sibling },
      clientSettings: { keep: true },
    });

    const idempotentDisconnect = await disconnectClient('generic-mcp', {
      configPath,
      now: '2026-01-02T03:04:05.006Z',
    });
    assert.equal(idempotentDisconnect.changed, false);
    assert.equal(idempotentDisconnect.backupPath, null);
    assert.deepEqual(idempotentDisconnect.plannedWrites, []);
    assert.deepEqual((await readdir(dir)).filter((name) => name.includes('.bak.')).sort(), [
      'client.json.bak.2026-01-02T030405006Z',
      'client.json.bak.2026-01-02T030405006Z.1',
    ]);

    const commandPath = join(dir, 'bin', 'enigma-mcp.cmd');
    const rendered = renderMcpConfig('kimi-code', { bundlePath, mcpCommand: commandPath });
    assert.equal(rendered.mcpServers.enigma.command, commandPath);
    assert.equal(rendered.mcpServers.enigma.env.ENIGMA_BUNDLE, bundlePath);

    const cliConnect = makeIo();
    assert.equal(await main(['connect', 'kimi-code', '--bundle', bundlePath, '--config', join(dir, 'kimi.json'), '--mcp-command', commandPath, '--dry-run'], cliConnect.io), 0, cliConnect.stderr());
    const cliConnectResult = cliConnect.json();
    assert.equal(cliConnectResult.config.mcpServers.enigma.command, commandPath);

    const cliAlias = makeIo();
    assert.equal(await main(['install', '--bundle', bundlePath, '--client', 'kimi-code', '--command', commandPath], cliAlias.io), 0, cliAlias.stderr());
    const cliAliasResult = cliAlias.json();
    assert.equal(cliAliasResult.mcp_command, commandPath);
    assert.equal(cliAliasResult.mcp_config_snippets['kimi-code'].mcpServers.enigma.command, commandPath);

    const help = makeIo();
    assert.equal(await main(['--help'], help.io), 0, help.stderr());
    const usage = help.json();
    assert.equal(usage.connector_options['--mcp-command <command>'].includes('enigma-mcp'), true);
    assert.equal(usage.kimi_code.tools.includes('enigma_verify_receipts'), true);
    assert.equal(usage.claim_boundaries.includes('provider-native memory canonical'), true);
  });
});

test('MCP resources/list and prompts/list return production descriptors', async () => {
  const { handleJsonRpcRequest } = await importPackage('mcp-server');

  const resources = await handleJsonRpcRequest({ jsonrpc: '2.0', id: 'resources', method: 'resources/list' });
  assert.equal(resources.jsonrpc, '2.0');
  assert.equal(resources.error, undefined);
  assert.ok(resources.result.resources.some((resource) => resource.uri === 'enigma://passport/summary'));

  const prompts = await handleJsonRpcRequest({ jsonrpc: '2.0', id: 'prompts', method: 'prompts/list' });
  assert.equal(prompts.jsonrpc, '2.0');
  assert.equal(prompts.error, undefined);
  assert.ok(prompts.result.prompts.some((prompt) => prompt.name === 'enigma_standard_memory_prompt'));

  await withTempDir('enigma-production-mcp-json-rpc-', async (dir) => {
    const bundlePath = join(dir, 'bundle.json');
    const init = await handleJsonRpcRequest({
      jsonrpc: '2.0',
      id: 'init',
      method: 'tools/call',
      params: { name: 'enigma_init', arguments: { bundlePath } },
    });
    assert.equal(init.error, undefined);
    assert.equal(init.result.isError, false);

    const remember = await handleJsonRpcRequest({
      jsonrpc: '2.0',
      id: 'remember',
      method: 'tools/call',
      params: { name: 'enigma_remember', arguments: { bundlePath, text: RAW_MEMORY, purpose: 'production_mcp_test' } },
    });
    assert.equal(remember.error, undefined);
    assert.equal(remember.result.isError, false);
    assertNoTextLeak(remember, RAW_MEMORY);

    const resource = await handleJsonRpcRequest({
      jsonrpc: '2.0',
      id: 'resource',
      method: 'resources/read',
      params: { uri: 'enigma://passport/summary', bundlePath },
    });
    assert.equal(resource.error, undefined);
    assert.equal(resource.result.contents[0].uri, 'enigma://passport/summary');
    assert.equal(resource.result.contents[0].mimeType, 'application/json');
    assertNoTextLeak(resource, RAW_MEMORY);

    const prompt = await handleJsonRpcRequest({
      jsonrpc: '2.0',
      id: 'prompt',
      method: 'prompts/get',
      params: { name: 'enigma_standard_memory_prompt', arguments: { question: 'release status', purpose: 'production_mcp_test' } },
    });
    assert.equal(prompt.error, undefined);
    assert.equal(prompt.result.messages[0].role, 'user');
    assert.equal(prompt.result.messages[0].content.type, 'text');
  });
});

test('importer demo succeeds with incomplete-source caveats preserved', async () => {
  const { runImporterDemo } = await importPackage('importers');

  const demo = runImporterDemo({ now: '2026-01-01T00:00:00.000Z' });
  assert.equal(demo.ok, true);
  assert.equal(demo.capsule.export_ok, true);
  assert.equal(demo.capsule.import_ok, true);
  for (const importer of Object.values(demo.importers)) {
    assert.equal(importer.ok, true);
    assert.equal(importer.complete, false);
    assert.ok(importer.limitations.length > 0);
    assert.ok(importer.candidate_count > 0);
  }
});

test('importer capsules keep custody roots private and fail closed before vault writes', async () => {
  const { importChatGptExport, exportEnigmaCapsule, importEnigmaCapsule } = await importPackage('importers');
  const { createVault } = await importPackage('vault');
  const { MerkleSet, receiptHash, verifyReceipt } = await importPackage('core');
  const now = '2026-01-01T00:00:00.000Z';

  const sourceVault = createVault({ now });
  const report = importChatGptExport({
    complete: true,
    memories: [{
      id: 'raw-memory',
      memory: RAW_MEMORY,
      text: RAW_MEMORY,
      content: RAW_MEMORY,
      body: RAW_MEMORY,
      raw_memory: RAW_MEMORY
    }]
  }, { vault: sourceVault, now });
  const metadata = report.memory_candidates[0].metadata;
  assertNoTextLeak(metadata, RAW_MEMORY);
  assert.equal(Object.keys(metadata).some((key) => ['memory', 'text', 'content', 'body', 'raw_memory'].includes(key)), false);
  assert.ok(Object.keys(metadata).some((key) => key.endsWith('_commitment')));
  assert.equal(report.completeness, 'explicit_complete');
  assert.equal(report.completeness_evidence.complete, true);

  assert.equal(report.vault_writes.length, 1);
  assert.equal(report.vault_writes[0].receipt_hash, receiptHash(report.vault_writes[0].receipt));
  assert.equal(report.vault_writes[0].receipt.memory_addr, report.vault_writes[0].memory_addr);
  assert.equal(typeof report.vault_writes[0].receipt_public_key, 'string');
  assert.equal(verifyReceipt({
    receipt: report.vault_writes[0].receipt,
    publicKey: report.vault_writes[0].receipt_public_key
  }).ok, true);
  const capsule = exportEnigmaCapsule({ reports: [report], now });
  assert.equal(capsule.manifest.active_set_root, new MerkleSet(report.vault_writes.map((write) => write.memory_addr)).root());
  assert.equal(capsule.manifest.receipt_log_root, new MerkleSet(report.vault_writes.map((write) => write.receipt_hash)).root());
  assert.equal(capsule.verifier_metadata.custody_status, 'vault_write_backed');
  assert.deepEqual(capsule.verifier_metadata.custody_limitation_codes, []);
  assert.equal(capsule.verifier_metadata.canonical_candidate_count, report.vault_writes.length);
  assert.equal(capsule.verifier_metadata.candidate_only_count, 0);
  assertNoTextLeak(capsule.public_artifacts, RAW_MEMORY);
  assertNoTextLeak(capsule.verifier_metadata, RAW_MEMORY);

  const targetVault = createVault({ now });
  const tampered = structuredClone(capsule);
  tampered.verifier_metadata.candidate_count += 1;
  const receiptCountBeforeTamper = targetVault.receipts.length;
  const tamperedImport = importEnigmaCapsule(tampered, {
    vault: targetVault,
    now,
    trustDescriptor: capsule.verifier_metadata.trust_descriptor
  });
  assert.equal(tamperedImport.ok, false);
  assert.equal(tamperedImport.vault_writes.length, 0);
  assert.equal(targetVault.receipts.length, receiptCountBeforeTamper);

  const payloadHashTampered = structuredClone(capsule);
  payloadHashTampered.verifier_metadata.payload_hash = RAW_MEMORY;
  const payloadHashTamperedImport = importEnigmaCapsule(payloadHashTampered, {
    vault: targetVault,
    now,
    trustDescriptor: capsule.verifier_metadata.trust_descriptor
  });
  assert.equal(payloadHashTamperedImport.ok, false);
  assert.equal(payloadHashTamperedImport.payload_hash_ok, false);
  assert.equal(payloadHashTamperedImport.vault_writes.length, 0);
  assert.equal(targetVault.receipts.length, receiptCountBeforeTamper);
  assert.match(payloadHashTamperedImport.limitations.join('\n'), /verifier metadata payload hash mismatch/);
  assertNoTextLeak(payloadHashTamperedImport.limitations, RAW_MEMORY);

  const embeddedOnly = importEnigmaCapsule(capsule, { now });
  assert.equal(embeddedOnly.ok, false);
  assert.match(embeddedOnly.limitations.join('\n'), /trusted descriptor or trust bundle is required/);

  const mismatchedDescriptor = structuredClone(capsule);
  mismatchedDescriptor.verifier_metadata.trust_descriptor = exportEnigmaCapsule({ reports: [report], now: '2026-01-01T00:00:01.000Z' }).verifier_metadata.trust_descriptor;
  const descriptorMismatch = importEnigmaCapsule(mismatchedDescriptor, {
    now,
    trustDescriptor: capsule.verifier_metadata.trust_descriptor
  });
  assert.equal(descriptorMismatch.ok, false);
  assert.match(descriptorMismatch.limitations.join('\n'), /trust descriptor does not match trusted descriptor/);

  const conflictReport = structuredClone(report);
  conflictReport.completeness = 'partial_or_unknown';
  const conflictCapsule = exportEnigmaCapsule({ reports: [conflictReport], now });
  const conflictVault = createVault({ now });
  const conflictImport = importEnigmaCapsule(conflictCapsule, {
    vault: conflictVault,
    now,
    trustDescriptor: conflictCapsule.verifier_metadata.trust_descriptor
  });
  assert.equal(conflictImport.ok, false);
  assert.equal(conflictImport.vault_writes.length, 0);
  assert.equal(conflictVault.receipts.length, 0);

  const candidateOnlyReport = importChatGptExport({
    complete: false,
    memories: [{ id: 'candidate-only', memory: 'candidate-only memory stays noncanonical' }]
  }, { now });
  const candidateOnlyCapsule = exportEnigmaCapsule({ reports: [candidateOnlyReport], now });
  assert.equal(candidateOnlyCapsule.manifest.active_set_root, new MerkleSet([]).root());
  assert.equal(candidateOnlyCapsule.verifier_metadata.custody_status, 'candidate_only_noncanonical');
  assert.deepEqual(candidateOnlyCapsule.verifier_metadata.custody_limitation_codes, ['candidate_only_without_vault_write']);
  assert.equal(candidateOnlyCapsule.verifier_metadata.candidate_only_count, 1);

  const forgedHashOnlyReport = structuredClone(report);
  forgedHashOnlyReport.vault_writes = forgedHashOnlyReport.vault_writes.map((write) => {
    const forged = { ...write, receipt_hash: `sha256:${'f'.repeat(64)}` };
    delete forged.receipt;
    return forged;
  });
  const forgedHashOnlyCapsule = exportEnigmaCapsule({ reports: [forgedHashOnlyReport], now });
  assert.equal(forgedHashOnlyCapsule.manifest.active_set_root, new MerkleSet([]).root());
  assert.equal(forgedHashOnlyCapsule.manifest.receipt_log_root, new MerkleSet([]).root());
  assert.equal(forgedHashOnlyCapsule.verifier_metadata.custody_status, 'candidate_only_noncanonical');
  assert.deepEqual(forgedHashOnlyCapsule.verifier_metadata.custody_limitation_codes, [
    'candidate_only_without_vault_write',
    'vault_write_receipt_missing'
  ]);
  assert.equal(forgedHashOnlyCapsule.verifier_metadata.canonical_candidate_count, 0);
  assert.equal(forgedHashOnlyCapsule.verifier_metadata.candidate_only_count, 1);

  const forgedReceiptReport = structuredClone(report);
  forgedReceiptReport.vault_writes = forgedReceiptReport.vault_writes.map((write) => {
    const receipt = {
      ...write.receipt,
      signature: { ...write.receipt.signature, value: 'a'.repeat(88) }
    };
    return { ...write, receipt, receipt_hash: receiptHash(receipt) };
  });
  const forgedReceiptCapsule = exportEnigmaCapsule({ reports: [forgedReceiptReport], now });
  assert.equal(forgedReceiptCapsule.manifest.active_set_root, new MerkleSet([]).root());
  assert.equal(forgedReceiptCapsule.manifest.receipt_log_root, new MerkleSet([]).root());
  assert.equal(forgedReceiptCapsule.verifier_metadata.custody_status, 'candidate_only_noncanonical');
  assert.deepEqual(forgedReceiptCapsule.verifier_metadata.custody_limitation_codes, [
    'candidate_only_without_vault_write',
    'vault_write_receipt_unverified'
  ]);
  assert.equal(forgedReceiptCapsule.verifier_metadata.canonical_candidate_count, 0);
  assert.equal(forgedReceiptCapsule.verifier_metadata.candidate_only_count, 1);

  await withTempDir('enigma-capsule-plain-', async (dir) => {
    const { main: cliMain } = await import(`${CLI_BIN_URL.href}?capsulePlain=${Date.now()}`);
    const reportPath = join(dir, 'report.json');
    const capsulePath = join(dir, 'capsule.json');
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    const exported = makeIo();
    assert.equal(await cliMain(['capsule', 'export', '--file', reportPath, '--out', capsulePath, '--plain'], exported.io), 0, exported.stderr());
    assert.match(exported.stdout(), /^Enigma capsule export\n/);
    assert.match(exported.stdout(), /Status: Ready/);
    assert.match(exported.stdout(), /Capsule file: written to <out>/);
    assert.match(exported.stdout(), /Boundary: public-safe local import capsule export only/);
    assert.doesNotMatch(exported.stdout(), /^\s*\{/);
    assert.equal(exported.stdout().includes(dir), false);
    assert.equal(exported.stdout().includes(reportPath), false);
    assert.equal(exported.stdout().includes(capsulePath), false);
    assertNoTextLeak(exported.stdout(), RAW_MEMORY);

    const imported = makeIo();
    assert.equal(await cliMain(['capsule', 'import', '--file', capsulePath, '--plain'], imported.io), 1, imported.stderr());
    assert.match(imported.stdout(), /^Enigma capsule import\n/);
    assert.match(imported.stdout(), /Status: Needs attention/);
    assert.match(imported.stdout(), /Memory Drive: not written/);
    assert.match(imported.stdout(), /Boundary: public-safe local import capsule verification only/);
    assert.doesNotMatch(imported.stdout(), /^\s*\{/);
    assert.equal(imported.stdout().includes(dir), false);
    assert.equal(imported.stdout().includes(capsulePath), false);
    assertNoTextLeak(imported.stdout(), RAW_MEMORY);
  });
});

test('package vault receipts verify prefix roots and redact source ref plaintext', async () => {
  const { createVault, remember, updateMemory, deleteMemory, exportBundle, importBundle } = await importPackage('vault');
  const { createPassport, compileContextPack, verifyContextPack } = await importPackage('passport');
  const { MerkleSet, receiptHash, verifyReceiptChain } = await importPackage('core');
  const { verifyBundle, main: verifyCliMain } = await import('../apps/verifier/bin/enigma-verify.mjs');

  const vault = createVault({ now: '2026-01-01T00:00:00.000Z' });
  const remembered = remember({
    vault,
    text: 'package receipt prefix safe memory',
    now: '2026-01-01T00:00:01.000Z',
    source_refs: [{
      source_type: 'chatgpt',
      path: 'memories/0',
      source_id: RAW_MEMORY,
      rawMemory: RAW_MEMORY,
      plainText: RAW_MEMORY,
      contextText: RAW_MEMORY,
    }],
    metadata: {
      rawMemory: RAW_MEMORY,
      plainText: RAW_MEMORY,
      contextText: RAW_MEMORY,
      summary: RAW_MEMORY,
      description: RAW_MEMORY,
      note: RAW_MEMORY,
      camelCaseSecret: RAW_MEMORY,
      unknown_primitive: RAW_MEMORY,
      nested: { summary: RAW_MEMORY },
    },
  });
  assertNoTextLeak(remembered.memory.metadata, RAW_MEMORY);
  for (const key of ['summary_commitment', 'description_commitment', 'note_commitment', 'camel_case_secret_commitment', 'unknown_primitive_commitment', 'nested_commitment']) {
    assert.match(remembered.memory.metadata[key], /^sha256:[a-f0-9]{64}$/);
  }
  const updated = updateMemory({ vault, memory_addr: remembered.memory_addr, text: 'package receipt prefix updated memory', now: '2026-01-01T00:00:02.000Z' });
  deleteMemory({ vault, memory_addr: updated.memory_addr, reason: 'production-proof-delete', now: '2026-01-01T00:00:03.000Z' });
  const activeRemembered = remember({ vault, text: 'package context active memory', now: '2026-01-01T00:00:03.500Z' });
  exportBundle({ vault, now: '2026-01-01T00:00:04.000Z' });

  const prefixHashes = [];
  for (const receipt of vault.receipts) {
    assert.equal(receipt.receipt_log_root, new MerkleSet(prefixHashes).root());
    prefixHashes.push(receiptHash(receipt));
  }
  const finalRoot = new MerkleSet(prefixHashes).root();
  assert.equal(vault.receipt_log_root, finalRoot);
  const chain = verifyReceiptChain({
    receipts: vault.receipts,
    publicKey: vault.signingKeyPair.publicKey,
    verifyEmbeddedReceiptLogRoot: true,
    expectedReceiptLogRoot: finalRoot,
  });
  assert.equal(chain.ok, true, JSON.stringify(chain));

  const exported = exportBundle({ vault, now: '2026-01-01T00:00:05.000Z' });
  assertNoTextLeak(exported, RAW_MEMORY);
  const validReport = verifyBundle(exported);
  assert.equal(validReport.ok, true, JSON.stringify(validReport.errors));
  const resurrected = structuredClone(exported);
  resurrected.active_memory_addresses = [...new Set([...resurrected.active_memory_addresses, updated.memory_addr])].sort();
  resurrected.tombstones = resurrected.tombstones.filter((tombstone) => tombstone.memory_addr !== updated.memory_addr);
  resurrected.memory_objects = resurrected.memory_objects.map((memory) => (
    memory.memory_addr === updated.memory_addr ? { ...memory, state: 'active' } : memory
  ));
  assert.throws(
    () => importBundle({ bundle: resurrected, now: '2026-01-01T00:00:05.500Z' }),
    /receipt-derived state/,
  );
  const activeRootTampered = structuredClone(exported);
  activeRootTampered.vault.active_set_root = `sha256:${'f'.repeat(64)}`;
  const activeRootReport = verifyBundle(activeRootTampered);
  assert.equal(activeRootReport.ok, false);
  assert.match(JSON.stringify(activeRootReport.errors), /BUNDLE_ACTIVE_SET_ROOT_MISMATCH/);

  await withTempDir('enigma-production-verify-', async (dir) => {
    const validPath = join(dir, 'bundle.json');
    const truncatedPath = join(dir, 'truncated-bundle.json');
    await writeFile(validPath, JSON.stringify(exported), 'utf8');
    const validIo = makeIo();
    assert.equal(await verifyCliMain([validPath], validIo.io), 0);
    assert.equal(validIo.json().ok, true);

    const truncated = structuredClone(exported);
    truncated.receipts = truncated.receipts.slice(0, -1);
    await writeFile(truncatedPath, JSON.stringify(truncated), 'utf8');
    const truncatedIo = makeIo();
    assert.equal(await verifyCliMain([truncatedPath], truncatedIo.io), 1);
    const truncatedReport = truncatedIo.json();
    assert.equal(truncatedReport.ok, false);
    assert.match(JSON.stringify(truncatedReport.errors), /BUNDLE_RECEIPT_LOG_ROOT_MISMATCH|BUNDLE_SEQUENCE_MISMATCH/);
    assert.equal(verifyBundle(truncated).ok, false);
  });
  const poisoned = structuredClone(exported);
  poisoned.memory_objects[0].rawMemory = RAW_MEMORY;
  poisoned.memory_objects[0].plainText = RAW_MEMORY;
  poisoned.memory_objects[0].contextText = RAW_MEMORY;
  poisoned.memory_objects[0].plain_text = RAW_MEMORY;
  poisoned.memory_objects[0].context_text = RAW_MEMORY;
  poisoned.memory_objects[0].raw_memory = RAW_MEMORY;
  poisoned.memory_objects[0].source_refs = [{ source_id: RAW_MEMORY, rawMemory: RAW_MEMORY, nested: { contextText: RAW_MEMORY } }];
  poisoned.memory_objects[0].sourceRefs = [{ value: RAW_MEMORY, raw_memory: RAW_MEMORY }];
  for (const memory of poisoned.memory_objects) {
    memory.metadata = {
      summary: RAW_MEMORY,
      description: RAW_MEMORY,
      note: RAW_MEMORY,
      camelCaseSecret: RAW_MEMORY,
      unknown_primitive: RAW_MEMORY,
      nested: { summary: RAW_MEMORY },
    };
  }

  const imported = importBundle({ bundle: poisoned, now: '2026-01-01T00:00:06.000Z' });
  const reexported = exportBundle({ vault: imported.vault, now: '2026-01-01T00:00:07.000Z' });
  assertNoTextLeak(reexported, RAW_MEMORY);
  assert.match(reexported.memory_objects[0].metadata.camel_case_secret_commitment, /^sha256:[a-f0-9]{64}$/);

  const passport = createPassport({ vault: imported.vault, now: '2026-01-01T00:00:08.000Z' });
  const pack = compileContextPack({
    vault: imported.vault,
    passport,
    memory_addresses: [activeRemembered.memory_addr],
    query: 'production redaction check',
    now: '2026-01-01T00:00:09.000Z',
  });
  assertNoTextLeak(pack, RAW_MEMORY);
  const adversarialPack = {
    ...pack,
    memories: pack.memories.map((memory) => ({
      ...memory,
      source_refs: [{ source_id: RAW_MEMORY, rawMemory: RAW_MEMORY, nested: { plainText: RAW_MEMORY } }],
    })),
  };
  const verified = verifyContextPack({ contextPack: adversarialPack, vault: imported.vault, passport, publicKey: imported.vault.signingKeyPair.publicKey });
  assert.equal(verified.valid, true);
  assertNoTextLeak(verified, RAW_MEMORY);
  const fakeReceiptPack = {
    ...pack,
    receipts: pack.receipts.map((receipt) => ({ ...receipt, signature: { ...receipt.signature, value: 'syntactically-valid-fake-signature' } })),
  };
  const fakeWithoutKey = verifyContextPack({ contextPack: fakeReceiptPack, vault: imported.vault, passport });
  assert.equal(fakeWithoutKey.valid, false);
  assert.equal(fakeWithoutKey.reason, 'PUBLIC_KEY_REQUIRED_FOR_CONTEXT_PACK_VERIFICATION');
  assertNoTextLeak(fakeWithoutKey, RAW_MEMORY);
});

test('relay demo succeeds and rejects plaintext relay custody', async () => {
  const { runRelayDemo } = await importPackage('relay');
  const { main } = await import('../apps/cli/bin/enigma.mjs');

  const demo = runRelayDemo({ now: '2026-01-01T00:00:00.000Z' });
  assert.equal(demo.ok, true);
  assert.equal(demo.pushed_opaque_record, true);
  assert.equal(demo.rejected_plaintext_record, true);
  assert.equal(demo.witness_checkpoint_verification_ok, true);
  assert.equal(demo.pairing_challenge_ok, true);
  assert.equal(demo.pairing_complete_ok, true);
  assertNoTextLeak(demo, 'demo memory must never enter relay custody');
  assert.equal(/"plaintext"\s*:/.test(JSON.stringify(demo)), false);

  const cli = makeIo();
  assert.equal(await main(['relay', 'demo'], cli.io), 0, cli.stderr());
  const cliDemo = cli.json();
  assert.equal(cliDemo.ok, true);
  assert.equal(cliDemo.rejected_plaintext_record, true);
  assertNoTextLeak(cliDemo, 'demo memory must never enter relay custody');
});

test('gateway demo succeeds and denies legal-hold deletes and disallowed regions', async () => {
  const { runGatewayDemo } = await importPackage('gateway');
  const { main } = await import('../apps/cli/bin/enigma.mjs');

  const demo = runGatewayDemo();
  assertNoTextLeak(demo.siem_export, 'addr_demo_committed_memory');
  assert.equal(/"(body|text|content|plaintext|raw_memory)"\s*:/.test(JSON.stringify(demo.siem_export)), false);
  assert.equal(demo.ok, true);
  assert.equal(demo.allowed_retrieval, true);
  assert.equal(demo.denied_disallowed_region, true);
  assert.equal(demo.denied_legal_hold_delete, true);
  assert.equal(demo.signed_decision_verification_ok, true);
  assert.equal(demo.siem_event_plaintext_minimized, true);
  assert.ok(demo.deny_disallowed_region.reason_codes.includes('REGION_DENIED'));
  assert.ok(demo.deny_legal_hold_delete.reason_codes.includes('LEGAL_HOLD_DELETE_DENIED'));

  const cli = makeIo();
  assert.equal(await main(['gateway', 'demo'], cli.io), 0, cli.stderr());
  const cliDemo = cli.json();
  assert.equal(cliDemo.ok, true);
  assert.equal(cliDemo.denied_disallowed_region, true);
  assert.equal(cliDemo.denied_legal_hold_delete, true);
});

test('desktop reducer creates deletion evidence without exporting raw memory', async () => {
  const {
    createDesktopState,
    desktopReducer,
    createVault,
    rememberMemory,
    deleteMemory,
    exportBundle,
  } = await importPackage('desktop');

  let state = createDesktopState();
  state = desktopReducer(state, createVault({ name: 'production-test-vault', now: '2026-01-01T00:00:00.000Z' }));
  state = desktopReducer(state, rememberMemory({
    descriptor: 'release preference descriptor',
    body: RAW_MEMORY,
    tags: ['release'],
    source: 'production-test',
  }, { now: '2026-01-01T00:01:00.000Z' }));
  const address = state.memories[0].address;
  state = desktopReducer(state, deleteMemory(address, { now: '2026-01-01T00:02:00.000Z' }));
  assert.equal(state.deletionEvidence.length, 1);
  assert.equal(state.deletionEvidence[0].memory_addr, address);
  assert.equal(state.deletionEvidence[0].body_fingerprint, state.memories[0].body_fingerprint);

  state = desktopReducer(state, exportBundle({ now: '2026-01-01T00:03:00.000Z', scope: 'all' }));
  const exported = state.importExport.exportBundle;
  assert.equal(exported.schema, 'enigma.desktop.export.v1');
  assert.equal(exported.deletionEvidence.length, 1);
  assertNoRawMemory(exported);
});

test('desktop import rejects raw bundle fields and redacts raw-looking metadata', async () => {
  const {
    createDesktopState,
    desktopReducer,
    importBundle,
    exportBundle,
  } = await importPackage('desktop');

  const maliciousBundle = {
    schema: 'enigma.desktop.export.v1',
    memories: [{
      address: 'mem_malicious',
      body_fingerprint: 'local:abcdef',
      body: RAW_MEMORY,
    }],
    deletionEvidence: [{
      schema: 'enigma.desktop.delete_evidence.v1',
      memory_addr: 'mem_malicious',
      plaintext: RAW_MEMORY,
    }],
    verifierEvidence: [{
      schema: 'enigma.desktop.verifier_evidence.v1',
      content: RAW_MEMORY,
    }],
  };
  let state = desktopReducer(createDesktopState(), importBundle(maliciousBundle, { now: '2026-01-01T00:04:00.000Z' }));
  assert.equal(state.importExport.import_status, 'rejected');
  assert.match(state.importExport.import_errors.join('\n'), /forbidden raw import field: memories\[0\]\.body/);
  assert.match(state.importExport.import_errors.join('\n'), /forbidden raw import field: deletionEvidence\[0\]\.plaintext/);
  assert.match(state.importExport.import_errors.join('\n'), /forbidden raw import field: verifierEvidence\[0\]\.content/);
  assert.equal(state.memories.length, 0);
  assertNoTextLeak(state.importExport, RAW_MEMORY);

  const rawLookingBundle = {
    schema: 'enigma.desktop.export.v1',
    memories: [{
      address: 'mem_imported_safe',
      descriptor: RAW_MEMORY,
      source: `plaintext:${RAW_MEMORY}`,
      tags: ['release', `raw_memory:${RAW_MEMORY}`],
      body_fingerprint: 'local:abcdef',
      body_bytes: 12,
    }],
    deletionEvidence: [{
      schema: 'enigma.desktop.delete_evidence.v1',
      evidence_id: 'del_imported_safe',
      memory_addr: 'mem_imported_safe',
      body_fingerprint: `plaintext:${RAW_MEMORY}`,
      status: 'pending_receipt',
    }],
    verifierEvidence: [{
      schema: 'enigma.desktop.verifier_evidence.v1',
      descriptor: RAW_MEMORY,
      source: `plaintext:${RAW_MEMORY}`,
      tags: [RAW_MEMORY],
    }],
  };
  state = desktopReducer(state, importBundle(rawLookingBundle, { now: '2026-01-01T00:05:00.000Z' }));
  assert.equal(state.importExport.import_status, 'imported');
  assert.equal(state.memories[0].descriptor, 'imported memory');
  assert.equal(state.memories[0].source, 'imported-bundle');
  assert.deepEqual(state.memories[0].tags, ['release']);
  assert.equal(state.deletionEvidence[0].body_fingerprint, '');
  assert.equal(state.verifier.evidence.length, 1);
  assert.equal(Object.hasOwn(state.verifier.evidence[0], 'descriptor'), false);
  assert.equal(Object.hasOwn(state.verifier.evidence[0], 'source'), false);
  assert.equal(Object.hasOwn(state.verifier.evidence[0], 'tags'), false);

  state = desktopReducer(state, exportBundle({ now: '2026-01-01T00:06:00.000Z', scope: 'all' }));
  const exported = state.importExport.exportBundle;
  assertNoRawMemory(exported);
  assertNoTextLeak(exported, RAW_MEMORY);
});

test('desktop UI copy states browser bridge and receipt inspection boundaries', async () => {
  const {
    createDesktopState,
    desktopReducer,
    renderDesktopModel,
    verifyReceipts,
    exportBundle,
  } = await importPackage('desktop');
  const html = await readFile(DESKTOP_INDEX_URL, 'utf8');
  assert.match(html, /Inspect receipt shape/);
  assert.doesNotMatch(html, />Verifier</);
  assert.match(html, /Receipt inspector/);
  assert.match(html, /body_fingerprint is a local descriptor fingerprint, not cryptographic proof/);

  const model = renderDesktopModel(createDesktopState());
  const browserBridgeCopy = model.screens.clients.browser_bridge_status.join('\n');
  assert.match(browserBridgeCopy, /User-click required/i);
  assert.match(browserBridgeCopy, /No auto-inject/i);
  assert.match(browserBridgeCopy, /No sync storage/i);
  assert.match(browserBridgeCopy, /local-only/i);
  assert.match(browserBridgeCopy, /receipt commitment only/i);

  const receipt = {
    schema: 'enigma.receipt.v1',
    receipt_id: 'receipt_shape_only',
    operation: 'delete',
    sequence: 1,
    event_hash: `sha256:${'a'.repeat(64)}`,
    active_set_root: `sha256:${'b'.repeat(64)}`,
    receipt_log_root: `sha256:${'c'.repeat(64)}`,
    previous_receipt_hash: 'GENESIS',
    signer: { alg: 'Ed25519', key_id: 'local-key' },
    signature: { alg: 'Ed25519', value: 'abc123' },
    memory_addr: 'mem_shape_only',
    source_addr: RAW_MEMORY,
  };
  const inspected = desktopReducer(createDesktopState(), verifyReceipts({ receipts: [receipt] }, { now: '2026-01-01T00:07:00.000Z' }));
  const inspectedModel = renderDesktopModel(inspected);
  assert.equal(inspectedModel.summary.verifier, 'shape-clean');
  assert.notEqual(inspectedModel.summary.verifier, 'evidence-clean');
  assert.match(inspected.notice, /Offline verifier output is required before treating it as cryptographic proof/);
  assert.doesNotMatch(inspected.notice, /cryptographic proof (passed|verified|valid|clean|complete)/i);
  assert.match(inspectedModel.screens.verifier.evidence[0].note, /Structural receipt shape only/);
  const exportedInspection = desktopReducer(inspected, exportBundle({ now: '2026-01-01T00:08:00.000Z', scope: 'all' })).importExport.exportBundle;
  assertNoTextLeak(exportedInspection, RAW_MEMORY);
  assert.equal(exportedInspection.verifierEvidence[0].source_addr, '[redacted imported metadata]');
});

test('public proof and export surfaces redact local memory plaintext', async () => {
  const { createVault, remember, recall, updateMemory, deleteMemory, exportBundle } = await importPackage('vault');
  const { createPassport, compileContextPack, verifyContextPack } = await importPackage('passport');
  const vault = createVault({ subjectId: 'production-proof-redaction' });
  const passport = createPassport({ vault });

  const remembered = await remember({ vault, text: RAW_MEMORY, purpose: 'production-redaction' });
  const firstRecord = vault.__getRecord(remembered.memory_addr);
  assert.equal(Object.keys(firstRecord).includes('plaintext'), false);
  assertNoTextLeak(firstRecord, RAW_MEMORY);

  const recalled = await recall({ vault, memory_addr: remembered.memory_addr, purpose: 'production-redaction' });
  assert.equal(recalled.content, RAW_MEMORY);
  assert.equal(Object.keys(firstRecord).includes('plaintext'), false);
  assertNoTextLeak(firstRecord, RAW_MEMORY);

  const updatedText = `${RAW_MEMORY} updated`;
  const updated = await updateMemory({ vault, memory_addr: remembered.memory_addr, text: updatedText, purpose: 'production-redaction' });
  const activeRecord = vault.__getRecord(updated.memory_addr);
  assert.equal(Object.keys(activeRecord).includes('plaintext'), false);
  assertNoTextLeak(activeRecord, RAW_MEMORY);

  const pack = await compileContextPack({ vault, passport, memory_addresses: [updated.memory_addr], query: RAW_MEMORY, limit: 1 });
  assert.match(JSON.stringify(pack), /private launch-code phrase must not leave local memory/);
  const missingTrust = verifyContextPack({ contextPack: pack, vault, passport });
  assert.equal(missingTrust.valid, false);
  assert.equal(missingTrust.reason, 'PUBLIC_KEY_REQUIRED_FOR_CONTEXT_PACK_VERIFICATION');
  assertNoRawMemory(missingTrust);
  const verified = verifyContextPack({ contextPack: pack, vault, passport, publicKey: vault.signingKeyPair.publicKey });
  assert.equal(verified.valid, true);
  assertNoRawMemory(verified);

  const exportedBeforeDelete = await exportBundle({ vault });
  assertNoRawMemory(exportedBeforeDelete.memory_objects);
  assertNoTextLeak(exportedBeforeDelete, RAW_MEMORY);

  await deleteMemory({ vault, memory_addr: updated.memory_addr, reason: 'production-redaction-delete' });
  assert.equal(Object.keys(activeRecord).includes('plaintext'), false);
  const exportedAfterDelete = await exportBundle({ vault });
  assertNoRawMemory(exportedAfterDelete.memory_objects);
  assertNoTextLeak(exportedAfterDelete, RAW_MEMORY);
});

test('browser extension manifest targets supported hosts without sync storage or broad permissions', async () => {
  const manifest = await readJson(MANIFEST_URL);
  assert.match(manifest.description, /explicit user-approved/i);
  assert.match(manifest.description, /no browser sync storage/i);

  const permissions = new Set(manifest.permissions ?? []);
  assert.deepEqual([...permissions].sort(), ['activeTab', 'nativeMessaging']);
  assert.equal(permissions.has('storage'), false);
  assert.equal(permissions.has('sync'), false);

  const hostPermissions = new Set(manifest.host_permissions ?? []);
  for (const broadPermission of ['<all_urls>', 'http://*/*', 'https://*/*', '*://*/*']) {
    assert.equal(hostPermissions.has(broadPermission), false, `${broadPermission} must not be requested`);
  }
  for (const host of [
    'https://chatgpt.com/*',
    'https://chat.openai.com/*',
    'https://claude.ai/*',
    'https://kimi.com/*',
    'https://www.kimi.com/*',
    'https://kimi.moonshot.cn/*',
    'https://perplexity.ai/*',
    'https://www.perplexity.ai/*',
  ]) {
    assert.equal(hostPermissions.has(host), true, `${host} missing from host_permissions`);
  }

  const contentMatches = new Set(manifest.content_scripts?.flatMap((script) => script.matches ?? []) ?? []);
  for (const host of hostPermissions) assert.equal(contentMatches.has(host), true, `${host} missing from content script matches`);
});

test('browser native bridge sends redacted page metadata instead of full URL query or title', async () => {
  if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
  const messages = [];
  globalThis.chrome = {
    runtime: {
      lastError: undefined,
      sendNativeMessage(_host, message, callback) {
        messages.push(message);
        if (message.type === 'enigma.browser.context.request') {
          callback({
            id: message.id,
            protocol: 'enigma.native.browser.v1',
            type: 'enigma.browser.context.response',
            ok: true,
            context: { text: 'local context', mime: 'text/plain' },
            receipt: {
              id: 'receipt-1',
              commitment: 'commitment-1',
              digestAlgorithm: 'sha-256',
              createdAt: '2026-06-23T00:00:00.000Z',
            },
          });
          return;
        }
        callback({
          id: message.id,
          protocol: 'enigma.native.browser.v1',
          type: 'enigma.browser.insertion.recorded',
          ok: true,
        });
      },
    },
  };
  const { recordInsertionReceipt, requestContextPack } = await import(`${BROWSER_NATIVE_BRIDGE_URL.href}?redaction=${Date.now()}`);

  const browserUrl = `https://chatgpt.com/c/private-thread?token=${encodeURIComponent(RAW_MEMORY)}#frag`;

  await requestContextPack({
    providerId: 'chatgpt',
    url: browserUrl,
    title: RAW_MEMORY,
    topLevel: true,
  });

  assert.equal(messages.length, 1);
  const message = messages[0];
  assert.equal(message.provider, 'chatgpt');
  assert.deepEqual(message.page, {
    providerId: 'chatgpt',
    origin: 'https://chatgpt.com',
    hostname: 'chatgpt.com',
    display: {
      providerLabel: 'ChatGPT',
      hostLabel: 'chatgpt.com',
      titlePresent: true,
      titleCharCount: RAW_MEMORY.length,
    },
    topLevel: true,
  });
  let encoded = JSON.stringify(message);
  assert.equal(encoded.includes('/c/private-thread'), false, encoded);
  assert.equal(encoded.includes('token='), false, encoded);
  assertNoTextLeak(message, RAW_MEMORY);

  await recordInsertionReceipt({
    providerId: 'chatgpt',
    url: browserUrl,
    title: RAW_MEMORY,
    topLevel: true,
    insertedAt: '2026-06-23T00:00:00.000Z',
    insertedCharCount: 13,
    mode: 'insert-at-cursor',
    target: 'textarea',
    receipt: {
      id: 'receipt-1',
      commitment: 'commitment-1',
      digestAlgorithm: 'sha-256',
      createdAt: '2026-06-23T00:00:00.000Z',
    },
  });
  assert.equal(messages.length, 2);
  assert.deepEqual(messages[1].page, message.page);
  encoded = JSON.stringify(messages[1]);
  assert.equal(encoded.includes('/c/private-thread'), false, encoded);
  assert.equal(encoded.includes('token='), false, encoded);
  assertNoTextLeak(messages[1], RAW_MEMORY);
});

test('browser native bridge sanitizes native-host error text before throwing', async () => {
  if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
  const rawNativeError = `native host leaked url https://chatgpt.com/c/private?token=${encodeURIComponent(RAW_MEMORY)} prompt="${RAW_MEMORY}" selectedText="${RAW_MEMORY}" receipt={"text":"${RAW_MEMORY}"}`;
  const nativeResults = [
    {
      id: undefined,
      protocol: 'enigma.native.browser.v1',
      type: 'enigma.browser.context.response',
      ok: false,
      error: rawNativeError,
    },
    {
      id: undefined,
      protocol: 'enigma.native.browser.v1',
      type: 'enigma.browser.insertion.recorded',
      ok: false,
      error: rawNativeError,
    },
    { lastError: { message: rawNativeError } },
  ];
  globalThis.chrome = {
    runtime: {
      lastError: undefined,
      sendNativeMessage(_host, message, callback) {
        const next = nativeResults.shift();
        if (next?.lastError) {
          globalThis.chrome.runtime.lastError = next.lastError;
          callback(undefined);
          globalThis.chrome.runtime.lastError = undefined;
          return;
        }
        callback({ ...next, id: message.id });
      },
    },
  };
  const { recordInsertionReceipt, requestContextPack } = await import(`${BROWSER_NATIVE_BRIDGE_URL.href}?nativeErrorSanitization=${Date.now()}`);

  await assertRejectsWithSafeMessage(
    requestContextPack({
      providerId: 'chatgpt',
      url: 'https://chatgpt.com/',
      title: 'ChatGPT',
      topLevel: true,
    }),
    'Native host rejected context request.',
    rawNativeError,
  );
  await assertRejectsWithSafeMessage(
    recordInsertionReceipt({
      providerId: 'chatgpt',
      url: 'https://chatgpt.com/',
      title: 'ChatGPT',
      topLevel: true,
      insertedAt: '2026-06-23T00:00:00.000Z',
      insertedCharCount: 13,
      mode: 'insert-at-cursor',
      target: 'textarea',
      receipt: {
        id: 'receipt-1',
        commitment: 'commitment-1',
        digestAlgorithm: 'sha-256',
        createdAt: '2026-06-23T00:00:00.000Z',
      },
    }),
    'Native host rejected insertion receipt.',
    rawNativeError,
  );
  await assertRejectsWithSafeMessage(
    requestContextPack({
      providerId: 'chatgpt',
      url: 'https://chatgpt.com/',
      title: 'ChatGPT',
      topLevel: true,
    }),
    'Unable to reach Enigma native host.',
    rawNativeError,
  );
});

test('browser background sanitizes native-host errors before content responses', async () => {
  if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
  const rawNativeError = `native host leaked url https://chatgpt.com/c/private?token=${encodeURIComponent(RAW_MEMORY)} prompt="${RAW_MEMORY}" selectedText="${RAW_MEMORY}" receipt={"text":"${RAW_MEMORY}"}`;
  let onMessage;
  globalThis.chrome = {
    action: {
      setBadgeText() {},
      setTitle() {},
    },
    tabs: {
      onUpdated: { addListener() {} },
    },
    runtime: {
      lastError: undefined,
      onInstalled: { addListener() {} },
      onMessage: {
        addListener(listener) {
          onMessage = listener;
        },
      },
      sendNativeMessage(_host, message, callback) {
        callback({
          id: message.id,
          protocol: 'enigma.native.browser.v1',
          type: 'enigma.browser.context.response',
          ok: false,
          error: rawNativeError,
        });
      },
    },
  };
  await import(`${BROWSER_BACKGROUND_URL.href}?nativeErrorContentPath=${Date.now()}`);
  assert.equal(typeof onMessage, 'function');

  const response = await new Promise((resolve) => {
    const keptOpen = onMessage(
      {
        protocol: 'enigma-browser-extension',
        source: 'enigma-content-script',
        provider: 'chatgpt',
        kind: 'enigma.context.request',
        page: { origin: 'https://chatgpt.com', hostname: 'chatgpt.com' },
      },
      { tab: { url: 'https://chatgpt.com/', title: 'ChatGPT' }, frameId: 0 },
      resolve,
    );
    assert.equal(keptOpen, true);
  });

  assert.deepEqual(response, { ok: false, error: 'Native host rejected context request.' });
  assertNoTextLeak(response, rawNativeError);
  assertNoTextLeak(response, RAW_MEMORY);
});

test('browser native bridge rejects overlong proof-bound receipt strings', async () => {
  if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
  globalThis.chrome = {
    runtime: {
      lastError: undefined,
      sendNativeMessage(_host, message, callback) {
        callback({
          id: message.id,
          protocol: 'enigma.native.browser.v1',
          type: 'enigma.browser.context.response',
          ok: true,
          context: { text: 'local context', mime: 'text/plain' },
          receipt: {
            id: 'r'.repeat(161),
            commitment: 'commitment-1',
            digestAlgorithm: 'sha-256',
            createdAt: '2026-06-23T00:00:00.000Z',
          },
        });
      },
    },
  };
  const { requestContextPack } = await import(`${BROWSER_NATIVE_BRIDGE_URL.href}?overlong=${Date.now()}`);

  await assert.rejects(
    requestContextPack({
      providerId: 'chatgpt',
      url: 'https://chatgpt.com/',
      title: 'ChatGPT',
      topLevel: true,
    }),
    /receipt\.id exceeds 160 characters/,
  );
});

test('browser native bridge rejects overlong selected text instead of truncating it', async () => {
  if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
  let sendCount = 0;
  globalThis.chrome = {
    runtime: {
      lastError: undefined,
      sendNativeMessage(_host, _message, callback) {
        sendCount += 1;
        callback(undefined);
      },
    },
  };
  const { requestContextPack } = await import(`${BROWSER_NATIVE_BRIDGE_URL.href}?selection=${Date.now()}`);

  await assert.rejects(
    requestContextPack({
      providerId: 'chatgpt',
      url: 'https://chatgpt.com/',
      title: 'ChatGPT',
      topLevel: true,
      selection: { text: 'x'.repeat(4001), source: 'window-selection' },
    }),
    /Selected page text exceeds 4000 characters/,
  );
  assert.equal(sendCount, 0);
});

test('native host frames browser messages and rejects missing bundles safely', async () => {
  const {
    NATIVE_BROWSER_PROTOCOL,
    decodeNativeMessage,
    decodeNativeMessageFrames,
    encodeNativeMessage,
    handleNativeBrowserMessage,
    createNativeHostRuntime,
  } = await import(`${NATIVE_HOST_BIN_URL.href}?framing=${Date.now()}`);

  const message = { protocol: NATIVE_BROWSER_PROTOCOL, id: 'frame-1', type: 'enigma.browser.context.request' };
  const frame = encodeNativeMessage(message);
  assert.equal(frame.readUInt32LE(0), Buffer.byteLength(JSON.stringify(message)));
  assert.deepEqual(decodeNativeMessage(frame), message);

  const partial = encodeNativeMessage({ ok: true });
  const decoded = decodeNativeMessageFrames(Buffer.concat([frame, partial.subarray(0, 5)]));
  assert.deepEqual(decoded.messages, [message]);
  assert.deepEqual(decoded.remaining, partial.subarray(0, 5));
  const writes = [];
  const runtime = createNativeHostRuntime({
    stdout: { write(chunk) { writes.push(Buffer.from(chunk)); } },
    stderr: { write() {} },
    env: {},
    argv: [],
  });
  await runtime.handleChunk(frame);
  assert.equal(writes.length, 1);
  const runtimeResponse = decodeNativeMessage(writes[0]);
  assert.equal(runtimeResponse.type, 'enigma.browser.context.response');
  assert.equal(runtimeResponse.code, 'ENIGMA_BUNDLE_REQUIRED');


  const response = await handleNativeBrowserMessage({
    protocol: NATIVE_BROWSER_PROTOCOL,
    id: 'missing-bundle',
    type: 'enigma.browser.context.request',
    provider: 'chatgpt',
  }, { env: {}, argv: [] });
  assert.equal(response.ok, false);
  assert.equal(response.type, 'enigma.browser.context.response');
  assert.equal(response.code, 'ENIGMA_BUNDLE_REQUIRED');
  assert.equal(JSON.stringify(response).includes('placeholder'), false);
  assertNoTextLeak(response, RAW_MEMORY);
  const rawIdResponse = await handleNativeBrowserMessage({
    protocol: NATIVE_BROWSER_PROTOCOL,
    id: RAW_MEMORY,
    type: 'enigma.browser.context.request',
    provider: 'chatgpt',
  }, { env: {}, argv: [] });
  assert.equal(rawIdResponse.id, undefined);
  assert.equal(rawIdResponse.code, 'ENIGMA_BUNDLE_REQUIRED');
  assertNoTextLeak(rawIdResponse, RAW_MEMORY);
});

test('native host returns local context with receipt summaries only', async () => {
  const { exportBundle, createVault, remember } = await importPackage('vault');
  const { NATIVE_BROWSER_PROTOCOL, handleNativeBrowserMessage } = await import(`${NATIVE_HOST_BIN_URL.href}?context=${Date.now()}`);

  await withTempDir('enigma-native-host-context-', async (dir) => {
    const emptyVault = createVault({ now: '2026-06-23T00:00:00.000Z' });
    const emptyBundlePath = join(dir, 'empty-bundle.json');
    await writeFile(emptyBundlePath, `${JSON.stringify(exportBundle({ vault: emptyVault, now: '2026-06-23T00:00:01.000Z' }))}\n`);
    const emptyResponse = await handleNativeBrowserMessage({
      protocol: NATIVE_BROWSER_PROTOCOL,
      id: 'context-empty',
      type: 'enigma.browser.context.request',
      provider: 'chatgpt',
    }, { bundlePath: emptyBundlePath, persist: false, now: '2026-06-23T00:00:02.000Z' });
    assert.equal(emptyResponse.ok, false);
    assert.equal(emptyResponse.code, 'ENIGMA_NO_ACTIVE_MEMORIES');
    assert.equal(JSON.stringify(emptyResponse).includes('placeholder'), false);
    assertNoTextLeak(emptyResponse, RAW_MEMORY);

    const vault = createVault({ now: '2026-06-23T00:00:00.000Z' });
    remember({ vault, content: RAW_MEMORY, now: '2026-06-23T00:00:01.000Z' });
    const bundlePath = join(dir, 'bundle.json');
    await writeFile(bundlePath, `${JSON.stringify(exportBundle({ vault, now: '2026-06-23T00:00:02.000Z' }))}\n`);

    const response = await handleNativeBrowserMessage({
      protocol: NATIVE_BROWSER_PROTOCOL,
      id: 'context-1',
      type: 'enigma.browser.context.request',
      provider: 'chatgpt',
    }, { bundlePath, persist: false, now: '2026-06-23T00:00:03.000Z' });

    assert.equal(response.ok, true);
    assert.equal(response.type, 'enigma.browser.context.response');
    assert.match(response.context.text, /Enigma memory 1:/);
    assert.match(response.context.text, new RegExp(RAW_MEMORY));
    assert.deepEqual(Object.keys(response.receipt).sort(), ['commitment', 'createdAt', 'digestAlgorithm', 'id'].sort());
    assert.equal(response.receipt.digestAlgorithm, 'sha256');
    assert.match(response.receipt.commitment, /^sha256:[a-f0-9]{64}$/);
    assertNoTextLeak(response.receipt, RAW_MEMORY);
  });
});

test('native host insertion acknowledgement never echoes inserted text or input receipt values', async () => {
  const { exportBundle, createVault, remember } = await importPackage('vault');
  const { NATIVE_BROWSER_PROTOCOL, handleNativeBrowserMessage } = await import(`${NATIVE_HOST_BIN_URL.href}?insert=${Date.now()}`);

  await withTempDir('enigma-native-host-insert-', async (dir) => {
    const vault = createVault({ now: '2026-06-23T00:00:00.000Z' });
    remember({ vault, content: 'safe local memory', now: '2026-06-23T00:00:01.000Z' });
    const bundlePath = join(dir, 'bundle.json');
    await writeFile(bundlePath, `${JSON.stringify(exportBundle({ vault, now: '2026-06-23T00:00:02.000Z' }))}\n`);

    const response = await handleNativeBrowserMessage({
      protocol: NATIVE_BROWSER_PROTOCOL,
      id: 'insert-1',
      type: 'enigma.browser.insertion.record',
      provider: 'chatgpt',
      insertion: {
        mode: 'insert-at-cursor',
        target: RAW_MEMORY,
        insertedCharCount: RAW_MEMORY.length,
        insertedAt: RAW_MEMORY,
        receipt: {
          id: RAW_MEMORY,
          commitment: RAW_MEMORY,
          digestAlgorithm: 'sha256',
          createdAt: RAW_MEMORY,
        },
      },
    }, { bundlePath, persist: false, now: '2026-06-23T00:00:03.000Z' });

    assert.equal(response.ok, true);
    assert.equal(response.type, 'enigma.browser.insertion.recorded');
    assert.deepEqual(Object.keys(response.receipt).sort(), ['commitment', 'createdAt', 'digestAlgorithm', 'id'].sort());
    assert.match(response.receipt.commitment, /^sha256:[a-f0-9]{64}$/);
    assertNoTextLeak(response, RAW_MEMORY);
  });
});

test('native host manifest generator covers browser formats and CLI output modes', async () => {
  const { createNativeHostInstallPlan, createNativeHostManifest, main: nativeHostMain } = await import(`${NATIVE_HOST_BIN_URL.href}?manifest=${Date.now()}`);
  const { main: cliMain } = await import(`${CLI_BIN_URL.href}?nativeManifest=${Date.now()}`);
  const chromeId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const edgeId = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const firefoxId = 'enigma@example.test';

  const chromeManifest = createNativeHostManifest({ browser: 'chrome', hostPath: NATIVE_HOST_BIN_PATH, extensionId: chromeId });
  assert.deepEqual(chromeManifest, {
    name: 'com.enigma.native_host',
    description: 'Enigma local native messaging host for explicit browser context requests.',
    path: NATIVE_HOST_BIN_PATH,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${chromeId}/`],
  });
  assert.deepEqual(createNativeHostManifest({ browser: 'edge', hostPath: NATIVE_HOST_BIN_PATH, extensionId: edgeId }), {
    name: 'com.enigma.native_host',
    description: 'Enigma local native messaging host for explicit browser context requests.',
    path: NATIVE_HOST_BIN_PATH,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${edgeId}/`],
  });
  assert.deepEqual(createNativeHostManifest({ browser: 'firefox', hostPath: NATIVE_HOST_BIN_PATH, extensionId: firefoxId }), {
    name: 'com.enigma.native_host',
    description: 'Enigma local native messaging host for explicit browser context requests.',
    path: NATIVE_HOST_BIN_PATH,
    type: 'stdio',
    allowed_extensions: [firefoxId],
  });
  assert.equal(
    createNativeHostManifest({ browser: 'chrome', hostPath: 'C:\\Program Files\\Enigma\\enigma-native-host.cmd', extensionId: chromeId }).path,
    'C:\\Program Files\\Enigma\\enigma-native-host.cmd',
  );

  assert.throws(
    () => createNativeHostManifest({ browser: 'safari', hostPath: NATIVE_HOST_BIN_PATH, extensionId: chromeId }),
    /browser must be one of: chrome, edge, firefox/,
  );
  assert.throws(
    () => createNativeHostManifest({ browser: 'chrome', hostPath: 'relative/enigma-native-host.mjs', extensionId: chromeId }),
    /hostPath must be an absolute path/,
  );
  assert.throws(
    () => createNativeHostManifest({ browser: 'chrome', hostPath: NATIVE_HOST_BIN_PATH, extensionId: '' }),
    /extensionId is required/,
  );
  assert.throws(
    () => createNativeHostManifest({ browser: 'chrome', hostPath: NATIVE_HOST_BIN_PATH, extensionId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/' }),
    /only letters, numbers, dots, or hyphens/,
  );
  assert.throws(
    () => createNativeHostManifest({ browser: 'firefox', hostPath: NATIVE_HOST_BIN_PATH, extensionId: 'enigma/example' }),
    /unsupported characters/,
  );

  const windowsChromePlan = createNativeHostInstallPlan({
    browser: 'chrome',
    manifestPath: 'C:\\Users\\Enigma\\Downloads\\com.enigma.native_host.chrome.json',
    os: 'windows',
    homeDir: 'C:\\Users\\Enigma',
  });
  assert.equal(windowsChromePlan.host_name, 'com.enigma.native_host');
  assert.equal(windowsChromePlan.browser, 'chrome');
  assert.equal(windowsChromePlan.os, 'windows');
  assert.equal(windowsChromePlan.writes_performed, false);
  assert.deepEqual(windowsChromePlan.target_manifest_paths, [
    'C:\\Users\\Enigma\\AppData\\Local\\Google\\Chrome\\User Data\\NativeMessagingHosts\\com.enigma.native_host.json',
  ]);
  assert.deepEqual(windowsChromePlan.registry_command_preview, [
    'reg add "HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.enigma.native_host" /ve /t REG_SZ /d "C:\\Users\\Enigma\\AppData\\Local\\Google\\Chrome\\User Data\\NativeMessagingHosts\\com.enigma.native_host.json" /f',
  ]);
  assert.equal(windowsChromePlan.firefox_manifest_directory, null);
  assertNoTextLeak(windowsChromePlan, RAW_MEMORY);

  const windowsEdgePlan = createNativeHostInstallPlan({
    browser: 'edge',
    manifestPath: 'C:\\Users\\Enigma\\Downloads\\com.enigma.native_host.edge.json',
    os: 'windows',
    homeDir: 'C:\\Users\\Enigma',
  });
  assert.deepEqual(windowsEdgePlan.target_manifest_paths, [
    'C:\\Users\\Enigma\\AppData\\Local\\Microsoft\\Edge\\User Data\\NativeMessagingHosts\\com.enigma.native_host.json',
  ]);
  assert.deepEqual(windowsEdgePlan.registry_command_preview, [
    'reg add "HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.enigma.native_host" /ve /t REG_SZ /d "C:\\Users\\Enigma\\AppData\\Local\\Microsoft\\Edge\\User Data\\NativeMessagingHosts\\com.enigma.native_host.json" /f',
  ]);
  assert.equal(windowsEdgePlan.writes_performed, false);

  const firefoxPlan = createNativeHostInstallPlan({
    browser: 'firefox',
    manifestPath: '/home/enigma/com.enigma.native_host.firefox.json',
    os: 'linux',
    homeDir: '/home/enigma',
  });
  assert.deepEqual(firefoxPlan.target_manifest_paths, [
    '/home/enigma/.mozilla/native-messaging-hosts/com.enigma.native_host.json',
  ]);
  assert.deepEqual(firefoxPlan.registry_command_preview, []);
  assert.equal(firefoxPlan.firefox_manifest_directory, '/home/enigma/.mozilla/native-messaging-hosts');
  assert.equal(firefoxPlan.writes_performed, false);
  assertNoTextLeak(firefoxPlan, RAW_MEMORY);

  assert.throws(
    () => createNativeHostInstallPlan({ browser: 'chrome', manifestPath: 'relative/com.enigma.native_host.json', os: 'windows', homeDir: 'C:\\Users\\Enigma' }),
    /manifestPath must be an absolute path/,
  );

  const stdoutIo = makeIo();
  assert.equal(await cliMain([
    'native-host',
    'manifest',
    '--browser',
    'chrome',
    '--host-path',
    NATIVE_HOST_BIN_PATH,
    '--extension-id',
    chromeId,
  ], stdoutIo.io), 0);
  assert.deepEqual(stdoutIo.json(), chromeManifest);
  assert.equal(stdoutIo.stderr(), '');
  assertNoTextLeak(stdoutIo.stdout(), RAW_MEMORY);

  const installPlanIo = makeIo();
  assert.equal(await cliMain([
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
  ], installPlanIo.io), 0);
  assert.deepEqual(installPlanIo.json(), firefoxPlan);
  assertNoTextLeak(installPlanIo.stdout(), RAW_MEMORY);

  const invalidInstallPlanIo = makeIo();
  assert.equal(await cliMain([
    'native-host',
    'install-plan',
    '--browser',
    'chrome',
    '--manifest',
    'relative/com.enigma.native_host.json',
    '--os',
    'windows',
    '--home',
    'C:\\Users\\Enigma',
  ], invalidInstallPlanIo.io), 2);
  assert.match(invalidInstallPlanIo.json().error.message, /manifestPath must be an absolute path/);

  const invalidIo = makeIo();
  assert.equal(await cliMain([
    'native-host',
    'manifest',
    '--browser',
    'chrome',
    '--host-path',
    'relative/enigma-native-host.mjs',
    '--extension-id',
    chromeId,
  ], invalidIo.io), 2);
  assert.match(invalidIo.json().error.message, /hostPath must be an absolute path/);

  const invalidBrowserIo = makeIo();
  assert.equal(await cliMain([
    'native-host',
    'manifest',
    '--browser',
    'safari',
    '--host-path',
    NATIVE_HOST_BIN_PATH,
    '--extension-id',
    chromeId,
  ], invalidBrowserIo.io), 2);
  assert.match(invalidBrowserIo.json().error.message, /browser must be one of: chrome, edge, firefox/);

  const invalidIdIo = makeIo();
  assert.equal(await cliMain([
    'native-host',
    'manifest',
    '--browser',
    'firefox',
    '--host-path',
    NATIVE_HOST_BIN_PATH,
    '--extension-id',
    'enigma/example',
  ], invalidIdIo.io), 2);
  assert.match(invalidIdIo.json().error.message, /unsupported characters/);

  const missingOutIo = makeIo();
  assert.equal(await cliMain([
    'native-host',
    'manifest',
    '--browser',
    'firefox',
    '--host-path',
    NATIVE_HOST_BIN_PATH,
    '--extension-id',
    firefoxId,
    '--out',
  ], missingOutIo.io), 2);
  assert.match(missingOutIo.json().error.message, /Missing required --out/);
  const nativeHostIo = makeIo();
  assert.equal(await nativeHostMain(['--help'], nativeHostIo.io), 0);
  assert.match(nativeHostIo.json().manifest_generator, /enigma native-host manifest --browser <chrome\|edge\|firefox>/);
  assert.match(nativeHostIo.json().install_planner, /enigma native-host install-plan --browser <chrome\|edge\|firefox>/);
  assertNoTextLeak(nativeHostIo.stdout(), RAW_MEMORY);


  await withTempDir('enigma-native-host-manifest-', async (dir) => {
    const out = join(dir, 'com.enigma.native_host.firefox.json');
    const fileIo = makeIo();
    assert.equal(await cliMain([
      'native-host',
      'manifest',
      '--browser',
      'firefox',
      '--host-path',
      NATIVE_HOST_BIN_PATH,
      '--extension-id',
      firefoxId,
      '--out',
      out,
    ], fileIo.io), 0);
    assert.deepEqual(fileIo.json(), { ok: true, path: out });
    assert.deepEqual(await readJson(out), createNativeHostManifest({ browser: 'firefox', hostPath: NATIVE_HOST_BIN_PATH, extensionId: firefoxId }));
    assert.equal(fileIo.stderr(), '');
    assertNoTextLeak(await readFile(out, 'utf8'), RAW_MEMORY);
    assertNoTextLeak(fileIo.stdout(), RAW_MEMORY);
  });
});

test('native host bin is packaged for browser native messaging', async () => {
  const pkg = await readJson(PACKAGE_JSON_URL);
  assert.equal(pkg.bin?.['enigma-native-host'], 'apps/native-host/bin/enigma-native-host.mjs');
  assert.equal(packageFilesCover(pkg, pkg.bin['enigma-native-host']), true);
  assert.equal(packageFilesCover(pkg, 'apps/native-host/README.md'), true);
  for (const browser of ['chrome', 'edge', 'firefox']) {
    const rel = `apps/native-host/manifests/com.enigma.native_host.${browser}.json`;
    assert.equal(packageFilesCover(pkg, rel), true, `${rel} must be included by package files`);
    const manifest = await readJson(new URL(`../${rel}`, import.meta.url));
    assert.equal(manifest.name, 'com.enigma.native_host');
    assert.equal(manifest.type, 'stdio');
  }
  assert.equal(await firstLine(NATIVE_HOST_BIN_URL), NODE_SHEBANG);
  const source = await readFile(NATIVE_HOST_BIN_URL, 'utf8');
  assert.match(source, /com\.enigma\.native_host/);
  assert.match(source, /createNativeHostRuntime/);
  assert.match(source, /handleNativeBrowserMessage/);
  assert.match(source, /createNativeHostManifest/);
  const { main: cliMain } = await import(`${CLI_BIN_URL.href}?nativeHostUsage=${Date.now()}`);
  const cliIo = makeIo();
  assert.equal(await cliMain(['--help'], cliIo.io), 0);
  const help = cliIo.json();
  assert.equal(help.native_host.host_name, 'com.enigma.native_host');
  assert.equal(help.native_host.bin, 'enigma-native-host');
  assert.deepEqual(help.native_host.manifests, [
    'apps/native-host/manifests/com.enigma.native_host.chrome.json',
    'apps/native-host/manifests/com.enigma.native_host.edge.json',
    'apps/native-host/manifests/com.enigma.native_host.firefox.json',
  ]);
  const nativeHostHelpIo = makeIo();
  assert.equal(await cliMain(['native-host', 'manifest', '--help'], nativeHostHelpIo.io), 0);
  assert.equal(nativeHostHelpIo.json().commands.includes('native-host manifest'), true);
  assert.equal(help.commands.includes('native-host manifest'), true);
  assert.match(help.native_host.generator, /enigma native-host manifest --browser <chrome\|edge\|firefox>/);
  assert.equal(help.native_host.generator_options['--out <file>'], 'Write manifest JSON to a file instead of stdout.');
  assertNoTextLeak(help, RAW_MEMORY);
});

test('browser content script warns before selected-text transfer and disables auto injection', async () => {
  const source = await readFile(BROWSER_CONTENT_SCRIPT_URL, 'utf8');

  assert.match(source, /selected page characters from/);
  assert.match(source, /will be sent only to the local Enigma host/);
  assert.match(source, /No browser sync storage is used/);
  assert.match(source, /Send selected text to local host/);
  assert.match(source, /Receipt ID:/);
  assert.match(source, /Commitment:/);
  assert.match(source, /Proof boundary: local receipt record only/);
  assert.match(source, /receipt commitment and local record were saved/);
  assert.doesNotMatch(source, /cryptographic proof/i);
  assert.match(source, /insert\.disabled = state\.busy \|\| !state\.context/);
  assert.match(source, /Focus the \$\{provider\.label\} prompt box before requesting Enigma context/);
  assert.match(source, /focused prompt target changed before approval/i);
  assert.equal(source.includes('querySelectorAll(selector)'), false);
  assert.equal(source.includes('lastError.message'), false);
  assert.match(source, /safeBackgroundErrorMessage\(response\?\.error\)/);
  assert.match(source, /isKnownSafeBackgroundError/);
  const selectedTextFlow = [
    'if (selectionCheckbox.checked)',
    'state.pendingSelection = { selection, target: approvedTarget };',
    'renderSelectionApproval(state.pendingSelection);',
    "const approve = el('button', 'enigma-insert', 'Send selected text to local host');",
    'ensureCurrentTarget(snapshot.target);',
    'state.context = await requestContext(snapshot.selection);',
  ];
  let flowCursor = -1;
  for (const marker of selectedTextFlow) {
    const next = source.indexOf(marker, flowCursor + 1);
    assert.notEqual(next, -1, marker);
    flowCursor = next;
  }
  const insertDisabled = source.indexOf('insert.disabled = state.busy || !state.context;');
  const insertHandler = source.indexOf("insert.addEventListener('click'");
  const approvedTargetRequired = source.indexOf('const target = requireApprovedTarget();', insertHandler);
  const insertCall = source.indexOf('const result = insertPlainText(target.element, contextPack.context.text);', approvedTargetRequired);
  assert.ok(insertDisabled !== -1 && insertHandler !== -1 && insertDisabled < insertHandler);
  assert.ok(approvedTargetRequired !== -1 && insertCall !== -1 && approvedTargetRequired < insertCall);
});

test('public collateral keeps proof, token, hosted, and raw-memory claim boundaries', async () => {
  const collateralDocs = Object.freeze([
    'README.md',
    'apps/browser-extension/README.md',
    'docs/install-anywhere.md',
    'docs/overnight-build-master-plan.md',
    'docs/competitive-memory-analysis.md',
    'docs/deployment-runbook.md',
    'docs/enterprise-byoc-runbook.md',
    'docs/production-release-checklist.md',
    ...PRODUCTION_REVIEW_DOCS,
    'launch/02_WHITEPAPER.md',
    'launch/08_PRESS_KIT.md',
    'launch/15_USER_INSTALL_GUIDE.md',
  ]);
  const legalGatedCollateralDocs = Object.freeze([
    'launch/04_TOKEN_UTILITY_AND_TOKENOMICS.md',
    'launch/12_COMMUNITY_AND_SOCIAL_PLAYBOOK.md',
  ]);
  const docs = {};
  for (const rel of [...collateralDocs, ...legalGatedCollateralDocs]) {
    try {
      docs[rel] = await readFile(new URL(`../${rel}`, import.meta.url), 'utf8');
    } catch (error) {
      if (!legalGatedCollateralDocs.includes(rel) || error?.code !== 'ENOENT') throw error;
    }
  }
  const proofBoundaryRequirements = Object.freeze({
    'README.md': [
      /Enigma does not claim that a closed provider deleted internal data/i,
      /proves facts about Enigma-controlled vault state, receipts, checkpoints, and declared boundary operations/i,
      /Register host name `com\.enigma\.native_host` by generating a browser-specific manifest/i,
      /Provider-native memory remains cache only; Enigma receipts do not prove provider deletion or model forgetting/i,
    ],
    'apps/browser-extension/README.md': [
      /The extension talks only to the browser's configured native messaging host, `com\.enigma\.native_host`/i,
      /Provider-native memory is treated as a cache only/i,
      /The receipt object must not contain plaintext-like fields/i,
    ],
    'docs/install-anywhere.md': [
      /valid manifest templates for `com\.enigma\.native_host`/i,
      /explicit user approval before inserting context/i,
      /Enigma cannot delete provider-side memories or force a provider model to forget/i,
    ],
    'docs/overnight-build-master-plan.md': [
      /Exact non-claims/i,
      /verification proves Enigma-controlled state only/i,
    ],
    'docs/competitive-memory-analysis.md': [
      /does not claim provider deletion proof, model forgetting, semantic forgetting/i,
      /evidence is limited to named, instrumented Enigma boundaries/i,
    ],
    'docs/deployment-runbook.md': [
      /receipts and proofs cover Enigma-controlled vault state/i,
      /Do not put raw memory plaintext in relay records, witness checkpoints, SIEM exports, public proof artifacts, or incident reports/i,
    ],
    'docs/enterprise-byoc-runbook.md': [
      /Claim boundary: Enigma evidence covers Enigma-mediated vault state/i,
      /does not prove provider deletion, model forgetting, factual truth, complete side-channel absence/i,
    ],
    'docs/production-release-checklist.md': [
      /Release evidence status map/i,
      /local\/package passed/i,
      /Provider-native memory is treated as cache only/i,
    ],
    'docs/public-api-reference.md': [
      /native messaging host name `com\.enigma\.native_host`/i,
      /requires explicit user action before requesting or inserting context/i,
      /must not store raw memory in browser sync storage/i,
      /POSIX-style `test\/\*\.test\.mjs` paths/i,
      /--test-concurrency=1/i,
      /without nested npm lifecycle scripts/i,
    ],
    'launch/02_WHITEPAPER.md': [
      /Enigma does not claim to make providers forget/i,
      /receipts verify declared Enigma-mediated operations, committed state, gateway decisions, relay records, witness checkpoints, and verifier outcomes/i,
    ],
    'launch/04_TOKEN_UTILITY_AND_TOKENOMICS.md': [
      /(?:\*\*)?Standard proof boundary:(?:\*\*)?\s+Enigma proves Enigma-mediated state transitions/i,
      /does not prove external provider internals, provider-native deletion, hidden logs\/caches\/backups, model or semantic forgetting/i,
    ],
    'launch/08_PRESS_KIT.md': [
      /(?:\*\*)?Standard proof boundary:(?:\*\*)?\s+Enigma proves Enigma-mediated vault state/i,
      /does not prove external provider internals, provider-native deletion, hidden logs\/caches\/backups/i,
    ],
    'launch/12_COMMUNITY_AND_SOCIAL_PLAYBOOK.md': [
      /(?:\*\*)?Standard proof boundary:(?:\*\*)?\s+Enigma proves Enigma-mediated state, receipts, gateway\/relay\/witness artifacts, and verifier results/i,
      /does not prove external provider internals, provider-native deletion, hidden logs\/caches\/backups/i,
    ],
    'launch/15_USER_INSTALL_GUIDE.md': [
      /Proof boundary: Enigma receipts verify declared Enigma-mediated operations/i,
      /do not publish raw memory plaintext/i,
    ],
  });
  const hostedByocDocs = Object.freeze([
    'README.md',
    'docs/overnight-build-master-plan.md',
    'docs/deployment-runbook.md',
    'docs/enterprise-byoc-runbook.md',
    'docs/production-release-checklist.md',
    'launch/02_WHITEPAPER.md',
  ]);
  const hostedByocBlockers = Object.freeze({
    credentials: /\b(?:credentials?|cloud account|VPC|cluster|private network|admin access)\b/i,
    domain: /\b(?:domain|DNS|ingress|private endpoints|approved customer networks)\b/i,
    TLS: /\bTLS\b|HTTPS|certificates?/i,
    KMS: /\bKMS\b|BYOK|secrets manager|KMS\/secrets/i,
    storage: /durable storage|\bstorage\b|persistence/i,
    monitoring: /\bmonitoring\b|observable services?|logging\/SIEM/i,
    backup: /\bbackups?\b|backup\/restore|restore rehearsal/i,
  });
  const tokenDocs = Object.freeze([
    'launch/02_WHITEPAPER.md',
    'launch/04_TOKEN_UTILITY_AND_TOKENOMICS.md',
    'launch/08_PRESS_KIT.md',
    'launch/12_COMMUNITY_AND_SOCIAL_PLAYBOOK.md',
  ].filter((rel) => typeof docs[rel] === 'string'));
  const tokenSectionPatterns = Object.freeze({
    'launch/02_WHITEPAPER.md': /## 9\. Solana utility token role[\s\S]*?## 10\. Roadmap/i,
    'launch/04_TOKEN_UTILITY_AND_TOKENOMICS.md': /[\s\S]+/i,
    'launch/08_PRESS_KIT.md': /### Does Enigma store memories on Solana\?[\s\S]*?### Who is Enigma for first\?/i,
    'launch/12_COMMUNITY_AND_SOCIAL_PLAYBOOK.md': /## Token communication rules[\s\S]*?## Demo event formats/i,
  });
  const tokenBoundaryConcepts = Object.freeze({
    legalReview: /legal review|legal-reviewed|legal signoff|legal\/security|board\/legal/i,
    nonEquity: /not equity|does not create company ownership|not company ownership|No claims that token ownership grants company ownership|company[- ]ownership rights?/i,
    nonRevenueShare: /not a revenue share|no revenue share|must not distribute company surplus|holder proceeds|dividends|company income|revenue[- ]share/i,
    nonProfitExpectation: /not marketed with any expectation of profit|no financial-return claims|financial-upside|secondary-market speculation|benefit-promise|return guidance|not investment marketing/i,
  });
  const dangerousClaimPatterns = Object.freeze({
    'provider deletion proof': /provider[- ](?:native|side)? deletion|provider deletion|provider[- ]native deletion proof|provider deletion proof|complete provider deletion|provider deletion certification|closed provider[^.\n]{0,80}deleted|external provider[^.\n]{0,80}deleted/i,
    'model forgetting': /model[- ]forgetting|model forgetting|model-weight forgetting|model weights?[^.\n]{0,80}(?:forgot|forget|deleted|erased)/i,
    'semantic forgetting': /semantic[- ]forgetting|semantic forgetting|semantic-paraphrase absence/i,
    'compliance status': /\b(?:SOC 2|ISO 27001|HIPAA|GDPR|PCI DSS)\b|compliance[- ]status|(?:certified|approved|validated)\s+(?:compliant|compliance)|compliance[- ](?:certified|approved|validated|ready)/i,
    'tamper-proof hardware': /tamper[- ]proof|tamperproof|hardware[^.\n]{0,80}(?:cannot be tampered|prevents tampering|prevents extraction)/i,
    'token ROI': /token ROI|investment return|financial returns?|trading upside|price expectation|financial-upside/i,
    'token equity or proceeds': /not equity|equity|revenue[- ]share|holder[- ]proceeds|profit right|expectation of profit|company[- ]ownership|guaranteed[- ]compensation|mere-holding compensation/i,
    'raw memory public proof': /raw[- ]memory[- ]on[- ]chain|raw memory in (?:public proof|receipts|relay|witness|SIEM)/i,
  });
  const forbiddenPublicMemoryLiterals = Object.freeze([
    'Uses concise security release notes.',
    'Uses security caveats in release notes.',
  ]);
  const whitepaperReceiptOverclaimPatterns = Object.freeze({
    'signed deletion root field': /b_i\s*=\s*C\([\s\S]*D_i[\s\S]*\)/,
    'deletion root equation': /D_i\s*=\s*MerkleRoot/i,
    'deleted root as receipt field': /tombstone\s*\/\s*deleted root/i,
  });
  const checklistStatusLabels = Object.freeze([
    'local/package passed',
    'source-only',
    'public-site artifact passed',
    'Docker daemon blocked',
    'cloud/BYOC blocked',
    'legal/token blocked',
  ]);
  const productionReviewBoundaryRequirements = Object.freeze({
    claimBoundary: /claim boundary|proof boundary|non-claims?|does not claim|does not prove/i,
    enigmaScope: /Enigma-(?:controlled|mediated)|Enigma controlled|Enigma mediated|declared boundary operations|vault state|receipts?/i,
    publicProofPrivacy: /raw memory plaintext|public proof artifacts?|public receipts?|proof examples/i,
    hostedByocPosture: /hosted|BYOC|cloud|deployment/i,
    hostedByocBlocked: /blocked|requires?|do not mark|do not market|before|only after|without/i,
  });
  const explicitNegativeContext = /\b(?:do not|does not|cannot|can not|must not|should not|not|no|never|without|unless|before|subject to|avoid|decline|prohibited|non-claims?|Not approved|requires?|only after|should remain available without|must stay|trigger incident response|leakage|mitigation)\b/i;

  for (const [rel, text] of Object.entries(docs)) {
    assert.equal(text.includes(RAW_MEMORY), false, `${rel} must not include the raw memory sentinel in public examples`);
    for (const literal of forbiddenPublicMemoryLiterals) {
      assert.equal(text.includes(literal), false, `${rel} must use local variables or fixtures instead of literal memory text: ${literal}`);
    }
    for (const required of proofBoundaryRequirements[rel] ?? []) {
      assert.match(text, required, `${rel} is missing a required proof-boundary phrase`);
    }
    if (PRODUCTION_REVIEW_DOCS.includes(rel)) {
      for (const [requirement, pattern] of Object.entries(productionReviewBoundaryRequirements)) {
        assert.match(text, pattern, `${rel} production review doc is missing ${requirement} boundary language`);
      }
    }

    const lines = text.split(/\r?\n/);
    for (const [claim, pattern] of Object.entries(dangerousClaimPatterns)) {
      lines.forEach((line, index) => {
        if (!pattern.test(line)) {
          return;
        }
        const context = lines.slice(Math.max(0, index - 12), Math.min(lines.length, index + 2)).join('\n');
        assert.match(context, explicitNegativeContext, `${rel}:${index + 1} mentions ${claim} outside an explicit negative context`);
      });
    }
  }

  const productionReviewText = PRODUCTION_REVIEW_DOCS.map((rel) => docs[rel]).join('\n');
  for (const [requirement, pattern] of Object.entries(productionReviewBoundaryRequirements)) {
    assert.match(productionReviewText, pattern, `production review docs are missing ${requirement} boundary language`);
  }
  for (const [blocker, pattern] of Object.entries(hostedByocBlockers)) {
    assert.match(productionReviewText, pattern, `production review docs hosted/BYOC posture is missing ${blocker} blocker language`);
  }

  const whitepaper = docs['launch/02_WHITEPAPER.md'];
  for (const [claim, pattern] of Object.entries(whitepaperReceiptOverclaimPatterns)) {
    assert.doesNotMatch(whitepaper, pattern, `whitepaper must not model unimplemented receipt field: ${claim}`);
  }
  assert.match(whitepaper, /prefix receipt-log root/i);
  assert.match(whitepaper, /signer_i` is the implemented signer object, including the signing algorithm and `key_id` key reference/i);
  assert.match(whitepaper, /provider, and model/i);
  assert.match(whitepaper, /Tombstone\/deletion evidence is represented by Enigma events, tombstone state, active-set absence, export bundles, and optional checkpoints/i);

  const checklist = docs['docs/production-release-checklist.md'];
  for (const statusLabel of checklistStatusLabels) {
    assert.match(checklist, new RegExp(statusLabel.replace(/[\/]/g, '\\$&'), 'i'), `checklist missing ${statusLabel} status`);
  }

  assert.doesNotMatch(checklist, /quickstart --bundle \.\/\.enigma\/bundle\.json --overwrite/);
  assert.match(checklist, /enigma claude-mcpb package --plain/);
  for (const rel of hostedByocDocs) {
    assert.match(docs[rel], /hosted|BYOC|cloud|deployment/i, `${rel} should state hosted/BYOC deployment posture`);
    assert.match(docs[rel], /requires?|do not mark|do not market|before|only after|without/i, `${rel} should frame hosted/BYOC as blocked until prerequisites exist`);
    for (const [blocker, pattern] of Object.entries(hostedByocBlockers)) {
      assert.match(docs[rel], pattern, `${rel} hosted/BYOC posture is missing ${blocker} blocker language`);
    }
  }

  for (const rel of tokenDocs) {
    const tokenSection = docs[rel].match(tokenSectionPatterns[rel]);
    assert.ok(tokenSection, `${rel} should keep a token-specific section for claim-boundary review`);
    for (const [concept, pattern] of Object.entries(tokenBoundaryConcepts)) {
      assert.match(tokenSection[0], pattern, `${rel} token section is missing ${concept} boundary language`);
    }
  }
});

test('docker and deploy artifacts keep package license and production safety boundaries', async () => {
  const dockerfile = await readFile(new URL('../Dockerfile', import.meta.url), 'utf8');
  const localCompose = await readFile(new URL('../docker-compose.yml', import.meta.url), 'utf8');
  const productionCompose = await readFile(new URL('../deploy/docker-compose.production.example.yml', import.meta.url), 'utf8');
  const kubernetes = await readFile(new URL('../deploy/kubernetes/enigma-backend.example.yaml', import.meta.url), 'utf8');
  const architecture = await readFile(new URL('../docs/production-backend-architecture.md', import.meta.url), 'utf8');
  const operatorPacket = await readFile(new URL('../docs/operator-acceptance-packet.md', import.meta.url), 'utf8');
  const forbiddenSecretMaterial = /(?:ENIGMA_(?:TOKEN|SECRET|KEY|PASSWORD)|PRIVATE_KEY|VAULT_KEY|API[_-]?KEY|ACCESS[_-]?TOKEN|CLIENT[_-]?SECRET|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY)/i;
  const serviceBlock = (manifest, name) => {
    const match = manifest.match(new RegExp(`^  ${name}:\\n(?:    [^\\n]*\\n|\\n)+`, 'm'));
    assert.ok(match, `docker compose missing ${name} service`);
    return match[0];
  };

  assert.match(dockerfile, /COPY package\.json README\.md LICENSE \.\/?/);
  assert.match(dockerfile, /USER node/);
  assert.match(dockerfile, /npm install --global --omit=dev \./);
  assert.doesNotMatch(dockerfile, forbiddenSecretMaterial);
  assert.match(localCompose, /127\.0\.0\.1:8787:8787/);
  assert.match(localCompose, /127\.0\.0\.1:8797:8797/);
  assert.match(localCompose, /read_only:\s*true/);
  assert.doesNotMatch(localCompose, forbiddenSecretMaterial);

  for (const [name, port] of [['relay', '8787'], ['gateway', '8797']]) {
    const block = serviceBlock(productionCompose, name);
    assert.match(block, new RegExp(`127\\.0\\.0\\.1:${port}:${port}`));
    assert.match(block, /read_only:\s*true/);
    assert.match(block, /(?:^|\n)\s+user:\s*(?:"?node"?|"?[1-9][0-9]{2,}:?[0-9]*"?)/);
    assert.match(block, /cap_drop:\s*(?:\[\s*"?ALL"?\s*\]|\n\s*-\s*ALL)/);
    assert.match(block, /no-new-privileges:true/);
    assert.match(block, /\/livez/);
    assert.match(block, /\/readyz/);
    assert.match(block, /ENIGMA_BACKEND_MODE:\s*"?production"?/);
    assert.match(block, /ENIGMA_DISABLE_LOCAL_DEMO_FALLBACK:\s*"?true"?/);
    assert.match(block, /ENIGMA_READINESS_FAIL_CLOSED:\s*"?true"?/);
    assert.doesNotMatch(block, forbiddenSecretMaterial);
  }

  assert.match(productionCompose, /healthcheck:/);
  assert.doesNotMatch(productionCompose, forbiddenSecretMaterial);
  assert.match(kubernetes, /kind:\s*NetworkPolicy/);
  assert.match(kubernetes, /name:\s*enigma-default-deny/);
  assert.match(kubernetes, /runAsNonRoot:\s*true/);
  assert.match(kubernetes, /readOnlyRootFilesystem:\s*true/);
  assert.match(kubernetes, /readinessProbe:[\s\S]*path:\s*\/readyz/);
  assert.match(kubernetes, /livenessProbe:[\s\S]*path:\s*\/livez/);
  assert.match(kubernetes, /ENIGMA_BACKEND_MODE:\s*"?production"?/);
  assert.match(kubernetes, /ENIGMA_DISABLE_LOCAL_DEMO_FALLBACK:\s*"?true"?/);
  assert.match(kubernetes, /ENIGMA_READINESS_FAIL_CLOSED:\s*"?true"?/);
  assert.doesNotMatch(kubernetes, forbiddenSecretMaterial);
  const publicIngress = kubernetes.match(/name:\s*enigma-public[\s\S]*?(?=\n---)/);
  assert.ok(publicIngress, 'Kubernetes manifest must define the public ingress explicitly');
  assert.doesNotMatch(publicIngress[0], /path:\s*\/\s*\n\s*pathType:\s*(?:Prefix|ImplementationSpecific)/i);
  assert.doesNotMatch(publicIngress[0], /path:\s*\/(?:admin|relay|gateway|api|records|decision|delete)\b/i);
  assert.match(publicIngress[0], /path:\s*\/readyz\s*\n\s*pathType:\s*Exact/i);
  assert.match(publicIngress[0], /path:\s*\/livez\s*\n\s*pathType:\s*Exact/i);
  const publicIngressPaths = [...publicIngress[0].matchAll(/path:\s*([^\s]+)/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(publicIngressPaths)].sort(), ['/livez', '/readyz']);
  const adminIngress = kubernetes.match(/name:\s*enigma-admin[\s\S]*?(?=\n---)/);
  assert.ok(adminIngress, 'Kubernetes manifest must keep admin/data routes on a separate private ingress');
  assert.match(adminIngress[0], /operator-selected-private-ingress-class/);
  assert.match(adminIngress[0], /path:\s*\/relay\s*\n\s*pathType:\s*Prefix/i);
  assert.match(adminIngress[0], /path:\s*\/gateway\s*\n\s*pathType:\s*Prefix/i);
  assert.match(adminIngress[0], /path:\s*\/policy\s*\n\s*pathType:\s*Exact/i);
  assert.match(adminIngress[0], /path:\s*\/siem\/export\s*\n\s*pathType:\s*Exact/i);
  assert.match(architecture, /static Cloudflare Pages\/GitHub collateral can be live/i);
  assert.match(architecture, /relay\/gateway production backend remains blocked/i);
  assert.match(architecture, /default-deny network-policy/i);
  assert.match(architecture, /\/livez/);
  assert.match(architecture, /\/readyz/);
  assert.match(operatorPacket, /durable storage/i);
  assert.match(operatorPacket, /\bKMS\b|secrets/i);
  assert.match(operatorPacket, /SIEM|monitoring/i);
  assert.match(operatorPacket, /backup/i);
  assert.match(operatorPacket, /no-go|blocked/i);
  assert.match(operatorPacket, /hosted\/BYOC|hosted|BYOC/i);
});
