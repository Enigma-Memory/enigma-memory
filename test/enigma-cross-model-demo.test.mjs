import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
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

const EXPECTED_PROFILES = ['chatgpt', 'claude', 'kimi', 'cursor', 'local-llm'];

test('cross-model demo outputs public-safe profile context references', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-cross-model-demo-shape-'));
  const io = makeIo();
  assert.equal(await main(['demo', 'cross-model', '--bundle', join(dir, 'bundle.json')], io.io), 0, io.stderr());
  const report = io.json();

  assert.equal(report.ok, true);
  assert.equal(report.schema, 'enigma.cross_model_demo.v1');
  assert.equal(report.command, 'enigma demo cross-model');
  assert.equal(report.provider_credentials_required, false);
  assert.equal(report.provider_native_memory_canonical, false);
  assert.match(report.demo_memory_addr, /^mem:/);
  assert.equal(report.claim_boundaries.provider_native_memory_canonical, false);
  assert.equal(report.claim_boundaries.provider_deletion_proof, false);
  assert.equal(report.claim_boundaries.model_forgetting_proof, false);
  assert.deepEqual(report.profiles.map((profile) => profile.profile), EXPECTED_PROFILES);

  for (const profile of report.profiles) {
    assert.match(profile.context_pack_ref, /^enigma:\/\/context-pack\/ctx_/);
    assert.match(profile.context_pack_digest, /^sha256:[a-f0-9]{64}$/);
    assert.equal(profile.context_pack.content_redacted, true);
    assert.deepEqual(profile.context_pack.memory_addresses, [report.demo_memory_addr]);
    assert.equal(profile.context_pack.provider, profile.provider);
    assert.equal(profile.memory_count, 1);
    assert.equal(profile.receipt_count, 2);
    assert.equal(profile.provider_native_memory_canonical, false);
    assert.equal(profile.claim_boundaries.provider_credentials_required, false);
    assert.equal(profile.claim_boundaries.provider_native_memory_canonical, false);
    assert.equal(profile.claim_boundaries.provider_deletion_proof, false);
    assert.equal(profile.claim_boundaries.model_forgetting_proof, false);
    assert.equal(profile.receipts.length, 2);
    assert.deepEqual(profile.receipts.map((receipt) => receipt.operation), ['retrieve', 'inject']);
  }
});

test('cross-model demo does not echo plaintext from memory files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-cross-model-demo-private-'));
  const memoryPath = join(dir, 'memory.txt');
  const privateMemory = 'private cross model phrase must never be echoed';
  await writeFile(memoryPath, privateMemory, 'utf8');

  const io = makeIo();
  assert.equal(await main(['demo', 'cross-model', '--bundle', join(dir, 'bundle.json'), '--memory-file', memoryPath], io.io), 0, io.stderr());
  const report = io.json();

  assert.equal(report.memory_source, 'memory_file');
  assert.equal(io.stdout().includes(privateMemory), false);
  assert.equal(JSON.stringify(report).includes(privateMemory), false);
});

test('cross-model demo uses generic memory instead of existing bundle plaintext unless a file is supplied', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-cross-model-demo-existing-'));
  const bundlePath = join(dir, 'bundle.json');
  const memoryPath = join(dir, 'existing-memory.txt');
  const privateMemory = 'existing private bundle phrase must not drive the demo';
  await writeFile(memoryPath, privateMemory, 'utf8');

  let io = makeIo();
  assert.equal(await main(['init', '--bundle', bundlePath], io.io), 0, io.stderr());
  io = makeIo();
  assert.equal(await main(['remember', '--bundle', bundlePath, '--text-file', memoryPath], io.io), 0, io.stderr());

  io = makeIo();
  assert.equal(await main(['demo', 'cross-model', '--bundle', bundlePath], io.io), 0, io.stderr());
  const report = io.json();

  assert.equal(report.memory_source, 'generic_demo');
  assert.equal(io.stdout().includes(privateMemory), false);
  assert.equal(JSON.stringify(report).includes(privateMemory), false);
  assert.equal(report.profiles.every((profile) => profile.memory_count === 1), true);
});

test('cross-model demo writes optional public-safe report', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-cross-model-demo-out-'));
  const outPath = join(dir, 'report.json');
  const io = makeIo();
  assert.equal(await main(['demo', 'cross-model', '--bundle', join(dir, 'bundle.json'), '--out', outPath], io.io), 0, io.stderr());

  const stdoutReport = io.json();
  const fileReport = await readJson(outPath);
  assert.equal(stdoutReport.out_written, true);
  assert.equal(fileReport.out_written, true);
  assert.deepEqual(fileReport.profiles.map((profile) => profile.profile), EXPECTED_PROFILES);
  assert.equal(fileReport.claim_boundaries.compliance_certification, false);
});

test('cross-model demo plain output is readable, path-redacted, and claim-bounded', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-cross-model-demo-plain-'));
  const bundlePath = join(dir, 'bundle.json');
  const outPath = join(dir, 'report.json');
  const memoryPath = join(dir, 'private-memory.txt');
  const privateMemory = 'private cross model plain phrase must never be echoed';
  await writeFile(memoryPath, privateMemory, 'utf8');

  const io = makeIo();
  assert.equal(await main(['demo', 'cross-model', '--bundle', bundlePath, '--out', outPath, '--memory-file', memoryPath, '--plain'], io.io), 0, io.stderr());
  const stdout = io.stdout();

  assert.match(stdout, /^Enigma cross-model demo\n/);
  assert.match(stdout, /Status: Ready/);
  assert.match(stdout, /Profiles: 5/);
  assert.match(stdout, /Provider credentials: not required/);
  assert.match(stdout, /Provider native memory: not claimed/);
  assert.match(stdout, /Report: written to <out>/);
  assert.match(stdout, /Profile: /);
  assert.match(stdout, /Next: enigma context --bundle <bundle-path> --proof --plain/);
  assert.match(stdout, /Boundary: local cross-model proof demo only/);
  assert.doesNotMatch(stdout, /^\s*\{/);
  assert.equal(stdout.includes(privateMemory), false);
  assert.equal(stdout.includes(dir), false);
  assert.equal(stdout.includes(bundlePath), false);
  assert.equal(stdout.includes(outPath), false);
});
