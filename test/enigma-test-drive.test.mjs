import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { main } from '../apps/cli/bin/enigma.mjs';

function makeIo() {
  let stdout = '';
  let stderr = '';
  return {
    io: {
      stdout: { write: (chunk) => { stdout += chunk; } },
      stderr: { write: (chunk) => { stderr += chunk; } },
    },
    stdout: () => stdout,
    stderr: () => stderr,
    json: () => JSON.parse(stdout),
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function quoted(path) {
  return `"${String(path).replace(/"/g, '\\"')}"`;
}

function expectedNextCommands(bundle, crossModelReport) {
  return [
    `enigma status --bundle ${quoted(bundle)}`,
    `enigma drive health --bundle ${quoted(bundle)}`,
    `enigma search --bundle ${quoted(bundle)} --query "local proof bundle"`,
    `enigma demo cross-model --bundle ${quoted(bundle)} --out ${quoted(crossModelReport)}`,
    'enigma setup --overwrite',
  ];
}

function assertPublicSafe(value, forbidden) {
  const rendered = typeof value === 'string' ? value : JSON.stringify(value);
  for (const phrase of forbidden) {
    assert.equal(rendered.includes(phrase), false, `public output leaked ${phrase}`);
  }
  assert.equal(/OPENAI_API_KEY|ANTHROPIC_API_KEY|CLOUDFLARE_API_TOKEN/i.test(rendered), false);
}

async function runTestDrive(args) {
  const io = makeIo();
  const code = await main(['test-drive', ...args], io.io);
  return { code, stdout: io.stdout(), stderr: io.stderr(), json: io.json() };
}

async function runTestDriveText(args) {
  const io = makeIo();
  const code = await main(['test-drive', ...args], io.io);
  return { code, stdout: io.stdout(), stderr: io.stderr() };
}


test('test-drive dry-run writes nothing and reports public tester commands', async () => {
  const root = await mkdtemp(join(tmpdir(), 'enigma-test-drive-dry-run-'));
  const outDir = join(root, 'demo');

  const { code, stdout, stderr, json } = await runTestDrive(['--out-dir', outDir, '--dry-run']);

  assert.equal(code, 0, stderr);
  assert.equal(json.ok, true);
  assert.equal(json.schema, 'enigma.test_drive.v1');
  assert.equal(json.command, 'enigma test-drive');
  assert.equal(json.dry_run, true);
  assert.equal(json.artifacts_written, false);
  assert.equal(json.out_dir, outDir);
  assert.equal(json.install_command, 'npm install -g enigma-memory');
  assert.deepEqual(json.next_commands, expectedNextCommands(json.bundle, json.files.find((file) => file.role === 'cross_model_report').path));
  assert.equal(json.next_commands.every((command) => command.startsWith('enigma ')), true);
  assert.equal(await pathExists(outDir), false);
  assertPublicSafe(stdout, ['private test-drive canary']);
});

test('test-drive plain dry-run gives path-redacted consumer summary', async () => {
  const root = await mkdtemp(join(tmpdir(), 'enigma-test-drive-plain-'));
  const outDir = join(root, 'demo');

  const { code, stdout, stderr } = await runTestDriveText(['--out-dir', outDir, '--dry-run', '--plain']);

  assert.equal(code, 0, stderr);
  assert.match(stdout, /^Enigma test drive\n/);
  assert.match(stdout, /Status: Ready/);
  assert.match(stdout, /Mode: dry run; no files written/);
  assert.match(stdout, /Artifacts: planned only/);
  assert.match(stdout, /Next: enigma status --bundle <bundle-path>/);
  assert.match(stdout, /Boundary: local demo artifacts only/);
  assert.doesNotMatch(stdout, /^\s*\{/);
  assert.equal(stdout.includes(root), false);
  assertPublicSafe(stdout, ['private test-drive canary']);
});

test('test-drive overwrite writes the local proof and cross-model demo bundle under a temp dir', async () => {
  const root = await mkdtemp(join(tmpdir(), 'enigma-test-drive-overwrite-'));
  const outDir = join(root, 'demo');
  const memoryFile = join(root, 'memory.txt');
  const privateMemory = 'private test-drive canary must stay encrypted and redacted';
  await writeFile(memoryFile, privateMemory, 'utf8');

  const { code, stdout, stderr, json } = await runTestDrive(['--out-dir', outDir, '--memory-file', memoryFile, '--overwrite']);

  assert.equal(code, 0, stderr);
  assert.equal(json.ok, true);
  assert.equal(json.dry_run, false);
  assert.equal(json.artifacts_written, true);
  assert.equal(json.claim_boundaries.credentials_required, false);
  assert.equal(json.client_configs_written, false);
  assert.equal(json.claim_boundaries.hosted_saas_live_claim, false);
  assert.deepEqual(json.next_commands, expectedNextCommands(json.bundle, json.files.find((file) => file.role === 'cross_model_report').path));
  assertPublicSafe(stdout, [privateMemory]);

  const artifactPaths = {
    bundle: join(outDir, 'bundle.json'),
    contextPack: join(outDir, 'context-pack.json'),
    exportBundle: join(outDir, 'export.json'),
    verifyReport: join(outDir, 'verify-report.json'),
    crossModelReport: join(outDir, 'cross-model-report.json'),
  };
  for (const path of Object.values(artifactPaths)) {
    assert.equal(await pathExists(path), true, `${path} should be written`);
  }
  for (const path of [artifactPaths.bundle, artifactPaths.exportBundle, artifactPaths.verifyReport, artifactPaths.crossModelReport]) {
    assertPublicSafe(await readFile(path, 'utf8'), [privateMemory]);
  }

  const bundle = await readJson(artifactPaths.bundle);
  const contextPack = await readJson(artifactPaths.contextPack);
  const exported = await readJson(artifactPaths.exportBundle);
  const verifyReport = await readJson(artifactPaths.verifyReport);
  const crossModelReport = await readJson(artifactPaths.crossModelReport);

  assert.equal(bundle.schema, 'enigma.vault_bundle.v1');
  assert.equal(contextPack.schema, 'enigma.context_pack.v1');
  assert.equal(exported.schema, 'enigma.vault_bundle.v1');
  assert.equal(verifyReport.ok, true);
  assert.equal(crossModelReport.schema, 'enigma.cross_model_demo.v1');
  assert.equal(crossModelReport.provider_credentials_required, false);
  assert.equal(crossModelReport.provider_native_memory_canonical, false);
  assert.equal(crossModelReport.profiles.length > 0, true);
});

test('test-drive rerun without overwrite fails safely and preserves existing artifacts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'enigma-test-drive-rerun-'));
  const outDir = join(root, 'demo');

  let result = await runTestDrive(['--out-dir', outDir, '--overwrite']);
  assert.equal(result.code, 0, result.stderr);

  const artifactPaths = [
    join(outDir, 'bundle.json'),
    join(outDir, 'context-pack.json'),
    join(outDir, 'export.json'),
    join(outDir, 'verify-report.json'),
    join(outDir, 'cross-model-report.json'),
  ];
  const before = await Promise.all(artifactPaths.map((path) => readFile(path, 'utf8')));

  result = await runTestDrive(['--out-dir', outDir]);

  assert.equal(result.code, 2);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, 'CLI_ERROR');
  assert.match(result.json.error.message, /already exists|overwrite/i);

  const plain = await runTestDriveText(['--out-dir', outDir, '--plain']);
  assert.equal(plain.code, 2);
  assert.match(plain.stdout, /^Enigma test-drive\n/);
  assert.match(plain.stdout, /Status: Needs attention/);
  assert.match(plain.stdout, /Issue: Quickstart output already exists/);
  assert.match(plain.stdout, /Next: enigma test-drive --out-dir <out-dir> --overwrite/);
  assert.match(plain.stdout, /Boundary: local Enigma error summary only/);
  assert.doesNotMatch(plain.stdout, /^\s*\{/);
  assert.equal(plain.stdout.includes(root), false);
  const after = await Promise.all(artifactPaths.map((path) => readFile(path, 'utf8')));
  assert.deepEqual(after, before);
});
