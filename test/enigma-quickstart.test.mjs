import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
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

test('quickstart is listed in CLI usage', async () => {
  const io = makeIo();
  assert.equal(await main(['--help'], io.io), 0, io.stderr());
  const usage = io.json();
  assert.equal(usage.commands.includes('quickstart'), true);
  assert.equal(usage.quickstart_options['--bundle <path>'].includes('.enigma/bundle.json'), true);
  assert.equal(usage.quickstart_options['--overwrite'].includes('Replace'), true);
});

test('quickstart default creates local proof files in the default bundle directory', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-quickstart-default-'));
  const previousCwd = process.cwd();
  process.chdir(dir);
  try {
    const io = makeIo();
    assert.equal(await main(['quickstart'], io.io), 0, io.stderr());
    const summary = io.json();

    assert.equal(summary.ok, true);
    assert.equal(summary.bundle, '.enigma/bundle.json');
    assert.equal(summary.context_pack, '.enigma/context-pack.json');
    assert.equal(summary.export, '.enigma/export.json');
    assert.equal(summary.verify_report, '.enigma/verify-report.json');
    assert.equal(summary.memory_count, 1);
    assert.equal(summary.context_item_count, 1);
    assert.equal(summary.verify_ok, true);
    assert.equal(summary.claim_boundaries.provider_credentials_required, false);
    assert.equal(summary.claim_boundaries.provider_deletion_proof, false);
    assert.equal(summary.claim_boundaries.model_forgetting_proof, false);
    assert.equal(summary.claim_boundaries.roi_or_savings_guarantee, false);

    const bundle = await readJson(join(dir, '.enigma', 'bundle.json'));
    const contextPack = await readJson(join(dir, '.enigma', 'context-pack.json'));
    const exported = await readJson(join(dir, '.enigma', 'export.json'));
    assert.equal(bundle.schema, 'enigma.vault_bundle.v1');
    assert.equal(contextPack.schema, 'enigma.context_pack.v1');
    assert.equal(exported.schema, 'enigma.vault_bundle.v1');
  } finally {
    process.chdir(previousCwd);
  }
});

test('quickstart fails closed when an output file already exists', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-quickstart-existing-'));
  const bundlePath = join(dir, 'bundle.json');
  await writeFile(bundlePath, '{}\n', 'utf8');

  const io = makeIo();
  assert.equal(await main(['quickstart', '--bundle', bundlePath, '--out-dir', dir], io.io), 2);
  const summary = io.json();
  assert.equal(summary.ok, false);
  assert.equal(summary.error.code, 'CLI_ERROR');
  assert.match(summary.error.message, /already exists/);
  assert.equal(summary.error.message.includes(dir), false);

  const plainIo = makeIo();
  assert.equal(await main(['quickstart', '--bundle', bundlePath, '--out-dir', dir, '--plain'], plainIo.io), 2);
  assert.match(plainIo.stdout(), /^Enigma quickstart\n/);
  assert.match(plainIo.stdout(), /Status: Needs attention/);
  assert.match(plainIo.stdout(), /Issue: Quickstart output already exists/);
  assert.match(plainIo.stdout(), /Next: enigma quickstart --bundle <new-bundle-path> --out-dir <new-empty-out-dir>/);
  assert.doesNotMatch(plainIo.stdout().split('\n').find((line) => line.startsWith('Next:')) ?? '', /--overwrite/);
  assert.match(plainIo.stdout(), /Boundary: local Enigma error summary only/);
  assert.doesNotMatch(plainIo.stdout(), /^\s*\{/);
  assert.equal(plainIo.stdout().includes(dir), false);
  assert.equal(await readFile(bundlePath, 'utf8'), '{}\n');
});

test('quickstart overwrite replaces existing output files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-quickstart-overwrite-'));
  const bundlePath = join(dir, 'bundle.json');
  await Promise.all([
    writeFile(bundlePath, 'old bundle\n', 'utf8'),
    writeFile(join(dir, 'context-pack.json'), 'old context\n', 'utf8'),
    writeFile(join(dir, 'export.json'), 'old export\n', 'utf8'),
    writeFile(join(dir, 'verify-report.json'), 'old verify\n', 'utf8'),
  ]);

  const io = makeIo();
  assert.equal(await main(['quickstart', '--bundle', bundlePath, '--out-dir', dir, '--overwrite'], io.io), 0, io.stderr());
  const summary = io.json();
  assert.equal(summary.ok, true);
  assert.equal((await readJson(bundlePath)).schema, 'enigma.vault_bundle.v1');
  assert.equal((await readJson(join(dir, 'context-pack.json'))).schema, 'enigma.context_pack.v1');
  assert.equal((await readJson(join(dir, 'export.json'))).schema, 'enigma.vault_bundle.v1');
});

test('quickstart memory file input does not echo plaintext to stdout', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-quickstart-memory-file-'));
  const memoryPath = join(dir, 'memory.txt');
  const privateMemory = 'private quickstart phrase must not be echoed';
  await writeFile(memoryPath, privateMemory, 'utf8');

  const io = makeIo();
  assert.equal(await main(['quickstart', '--bundle', join(dir, 'bundle.json'), '--out-dir', dir, '--memory-file', memoryPath], io.io), 0, io.stderr());
  assert.equal(io.stdout().includes(privateMemory), false);
  assert.equal(JSON.stringify(io.json()).includes(privateMemory), false);
  assert.equal(io.stdout().includes(dir), false);
});

test('quickstart writes an ok verify report', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-quickstart-verify-'));
  const nested = join(dir, 'proof');
  await mkdir(nested, { recursive: true });

  const io = makeIo();
  assert.equal(await main(['quickstart', '--bundle', join(nested, 'bundle.json'), '--out-dir', nested], io.io), 0, io.stderr());
  const report = await readJson(join(nested, 'verify-report.json'));
  assert.equal(report.ok, true);
  assert.equal(io.json().verify_ok, true);
});
