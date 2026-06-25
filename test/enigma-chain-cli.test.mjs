import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { main } from '../apps/cli/bin/enigma.mjs';

const ROOT_A = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ROOT_B = 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const ROOT_C = 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
const ROOT_D = 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';
const PRIVATE_SENTINEL = 'redacted-sensitive-payload-marker';
const SECRET_REF_SENTINEL = 'https://redacted:redacted@example.invalid/not-for-proof';

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

async function runCli(args) {
  const io = makeIo();
  const code = await main(args, io.io);
  return { code, io, json: () => io.json(), text: () => `${io.stdout()}\n${io.stderr()}` };
}

function walk(value, visit) {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      visit(key, item);
      walk(item, visit);
    }
  }
}

function valuesForKey(value, wantedKey) {
  const values = [];
  walk(value, (key, item) => {
    if (key === wantedKey) values.push(item);
  });
  return values;
}

function assertPublicSafeArtifact(artifact, schema) {
  assert.equal(artifact.schema, schema);
  assert.equal(valuesForKey(artifact, 'transaction_submitted').includes(false), true, `${schema} must say no transaction was submitted`);
  assert.equal(valuesForKey(artifact, 'raw_memory_on_chain').includes(false), true, `${schema} must say raw memory is not on-chain`);

  const serialized = JSON.stringify(artifact);
  assert.equal(serialized.includes(PRIVATE_SENTINEL), false, `${schema} leaked private plaintext`);
  assert.equal(serialized.includes(SECRET_REF_SENTINEL), false, `${schema} leaked secret-looking ref`);
  for (const forbiddenKey of ['private_key', 'seed_phrase', 'api_key', 'raw_memory', 'prompt_text', 'completion_text']) {
    assert.equal(serialized.includes(`\"${forbiddenKey}\"`), false, `${schema} leaked forbidden payload key ${forbiddenKey}`);
  }
}

async function assertVerifies(path) {
  const result = await runCli(['chain', 'verify', '--file', path]);
  assert.equal(result.code, 0, result.io.stderr());
  const report = result.json();
  assert.equal(report.ok, true);
  assert.equal(JSON.stringify(report).includes(PRIVATE_SENTINEL), false);
  assert.equal(JSON.stringify(report).includes(SECRET_REF_SENTINEL), false);
  return report;
}

async function assertFailsClosed(args) {
  const result = await runCli(args);
  assert.notEqual(result.code, 0, 'private payload command unexpectedly succeeded');
  assert.equal(result.text().includes(PRIVATE_SENTINEL), false);
  assert.equal(result.text().includes(SECRET_REF_SENTINEL), false);
  const report = result.json();
  assert.equal(report.ok, false);
  if (report.error) assert.equal(report.error.code, 'CLI_ERROR');
}

test('chain anchor creates and verifies a public-safe Solana-ready anchor batch', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-chain-anchor-'));
  const out = join(dir, 'anchor-batch.json');

  const result = await runCli([
    'chain',
    'anchor',
    '--root',
    ROOT_A,
    '--root',
    ROOT_B,
    '--ref',
    'memory-root://public/demo/a',
    '--ref',
    'benchmark://public/demo/b',
    '--authority',
    'did:key:z6mkpublicauthorityonly',
    '--batch-ref',
    'solana-anchor://planning/mainnet/demo-batch-001',
    '--out',
    out,
  ]);

  assert.equal(result.code, 0, result.io.stderr());
  const summary = result.json();
  if ('ok' in summary) assert.equal(summary.ok, true);
  const artifact = await readJson(out);
  assertPublicSafeArtifact(artifact, 'enigma.proof_network.anchor_batch.v1');
  assert.equal(valuesForKey(artifact, 'commitment_count').includes(2), true);
  await assertVerifies(out);
});

test('chain grant and revoke create verifiable scoped capability artifacts without secrets', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-chain-grant-'));
  const grantPath = join(dir, 'capability-grant.json');
  const revocationPath = join(dir, 'capability-revocation.json');

  const grantResult = await runCli([
    'chain',
    'grant',
    '--subject',
    'did:key:z6mkpublicagentonly',
    '--capability',
    'memory.proof.read',
    '--scope',
    'proof-network:anchor.read',
    '--resource-ref',
    ROOT_A,
    '--policy-hash',
    ROOT_C,
    '--expires-at',
    '2026-06-25T12:00:00.000Z',
    '--grant-ref',
    'grant://public/demo/001',
    '--out',
    grantPath,
  ]);

  assert.equal(grantResult.code, 0, grantResult.io.stderr());
  const grant = await readJson(grantPath);
  assertPublicSafeArtifact(grant, 'enigma.proof_network.capability_grant.v1');
  assert.equal(JSON.stringify(grant).includes('proof-network:anchor.read'), true);
  await assertVerifies(grantPath);
  const grantHash = valuesForKey(grant, 'capability_grant_hash').find((value) => typeof value === 'string') ?? valuesForKey(grant, 'grant_hash').find((value) => typeof value === 'string') ?? ROOT_D;

  const revokeResult = await runCli([
    'chain',
    'revoke',
    '--grant-hash',
    grantHash,
    '--reason',
    'scheduled_rotation',
    '--revocation-ref',
    'revocation://public/demo/001',
    '--out',
    revocationPath,
  ]);

  assert.equal(revokeResult.code, 0, revokeResult.io.stderr());
  const revocation = await readJson(revocationPath);
  assertPublicSafeArtifact(revocation, 'enigma.proof_network.capability_revocation.v1');
  assert.equal(JSON.stringify(revocation).includes(grantHash), true);
  await assertVerifies(revocationPath);
});

test('chain attest creates and verifies a benchmark attestation from public refs only', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-chain-attest-'));
  const reportPath = join(dir, 'benchmark-report-public.json');
  const out = join(dir, 'benchmark-attestation.json');
  await writeFile(reportPath, `${JSON.stringify({ ok: true, report_hash: ROOT_D, sample_count: 12 })}\n`, 'utf8');

  const result = await runCli([
    'chain',
    'attest',
    '--report-file',
    reportPath,
    '--dataset-ref',
    'dataset://enigma/public/memory-bench-v1',
    '--runner-ref',
    'runner://enigma/local-standard-runner-v1',
    '--package-ref',
    'npm://enigma-memory@0.1.13',
    '--score',
    'relevance=0.91',
    '--score',
    'p95_latency_ms=42',
    '--out',
    out,
  ]);

  assert.equal(result.code, 0, result.io.stderr());
  const attestation = await readJson(out);
  assertPublicSafeArtifact(attestation, 'enigma.proof_network.benchmark_attestation.v1');
  assert.equal(JSON.stringify(attestation).includes('dataset://enigma/public/memory-bench-v1'), true);
  assert.equal(JSON.stringify(attestation).includes('runner://enigma/local-standard-runner-v1'), true);
  await assertVerifies(out);
});

test('chain commands fail closed for private payload examples without echoing secrets', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-chain-private-'));
  const privateReportPath = join(dir, 'private-report.json');
  const privateArtifactPath = join(dir, 'private-artifact.json');
  await writeFile(privateReportPath, `${JSON.stringify({ prompt_text: PRIVATE_SENTINEL, report_hash: ROOT_A })}\n`, 'utf8');
  await writeFile(privateArtifactPath, `${JSON.stringify({
    schema: 'enigma.proof_network.anchor_batch.v1',
    raw_memory: PRIVATE_SENTINEL,
    transaction_submitted: false,
    raw_memory_on_chain: false,
  })}\n`, 'utf8');

  await assertFailsClosed([
    'chain',
    'anchor',
    '--root',
    ROOT_A,
    '--ref',
    SECRET_REF_SENTINEL,
    '--authority',
    'did:key:z6mkpublicauthorityonly',
    '--out',
    join(dir, 'bad-anchor.json'),
  ]);

  await assertFailsClosed([
    'chain',
    'grant',
    '--subject',
    SECRET_REF_SENTINEL,
    '--capability',
    'memory.proof.read',
    '--scope',
    'proof-network:anchor.read',
    '--resource-ref',
    ROOT_A,
    '--policy-hash',
    ROOT_C,
    '--out',
    join(dir, 'bad-grant.json'),
  ]);

  await assertFailsClosed([
    'chain',
    'attest',
    '--report-file',
    privateReportPath,
    '--dataset-ref',
    'dataset://enigma/public/memory-bench-v1',
    '--runner-ref',
    'runner://enigma/local-standard-runner-v1',
    '--package-ref',
    'npm://enigma-memory@0.1.13',
    '--out',
    join(dir, 'bad-attestation.json'),
  ]);

  await assertFailsClosed(['chain', 'verify', '--file', privateArtifactPath]);
});
