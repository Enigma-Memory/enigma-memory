import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { main } from '../apps/cli/bin/enigma.mjs';

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

test('context --proof emits passport and non-use proof without context plaintext', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-context-proof-cli-'));
  const bundle = join(dir, 'bundle.json');
  try {
    const quickstart = makeIo();
    assert.equal(await main(['quickstart', '--bundle', bundle, '--overwrite'], quickstart.io), 0, quickstart.stderr());

    const proof = makeIo();
    assert.equal(await main(['context', '--bundle', bundle, '--query', 'local proof bundle', '--proof'], proof.io), 0, proof.stderr());
    const output = proof.json();

    assert.equal(output.schema, 'enigma.context_proof_bundle.v1');
    assert.equal(output.context_passport.schema, 'enigma.context_passport.v1');
    assert.equal(output.proof_of_non_use.schema, 'enigma.proof_of_non_use.v1');
    assert.equal(output.claim_boundaries.provider_deletion_claim, false);
    assert.equal(output.claim_boundaries.model_forgetting_claim, false);
    assert.equal(output.claim_boundaries.raw_memory_printed, false);
    assert.equal(output.context_pack_summary.memory_count > 0, true);
    assert.equal(proof.stdout().includes('Enigma quickstart demo memory'), false);
    assert.equal(proof.stdout().includes(dir), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('start is a no-friction quickstart alias', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-start-alias-'));
  const bundle = join(dir, 'bundle.json');
  try {
    const started = makeIo();
    assert.equal(await main(['start', '--bundle', bundle, '--overwrite'], started.io), 0, started.stderr());
    const output = started.json();
    assert.equal(output.ok, true);
    assert.equal(output.verify_ok, true);
    assert.equal(output.claim_boundaries.local_only, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
