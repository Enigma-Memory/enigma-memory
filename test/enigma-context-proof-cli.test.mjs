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

    const plain = makeIo();
    assert.equal(await main(['context', '--bundle', bundle, '--query', 'local proof bundle', '--proof', '--plain'], plain.io), 0, plain.stderr());
    assert.match(plain.stdout(), /^Enigma context\n/);
    assert.match(plain.stdout(), /Status: Ready/);
    assert.match(plain.stdout(), /Proof: context passport and non-use proof included/);
    assert.match(plain.stdout(), /Boundary: local Enigma context only/);
    assert.doesNotMatch(plain.stdout(), /^\s*\{/);
    assert.equal(plain.stdout().includes('Enigma quickstart demo memory'), false);
    assert.equal(plain.stdout().includes(dir), false);
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

test('context --require-grant fails closed until matching controller grant is supplied', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-context-grant-cli-'));
  const bundle = join(dir, 'bundle.json');
  const grantFile = join(dir, 'grant.json');
  const revokedGrantFile = join(dir, 'grant.revoked.json');
  try {
    const quickstart = makeIo();
    assert.equal(await main(['quickstart', '--bundle', bundle, '--overwrite'], quickstart.io), 0, quickstart.stderr());

    const blocked = makeIo();
    assert.equal(await main(['context', '--bundle', bundle, '--query', 'local proof bundle', '--proof', '--require-grant'], blocked.io), 0, blocked.stderr());
    const blockedOutput = blocked.json();
    assert.equal(blockedOutput.schema, 'enigma.context_pack_recall_blocked.v1');
    assert.equal(blockedOutput.context_pack_returned, false);
    assert.equal(blockedOutput.recall_veto.safe_to_share, false);
    assert.deepEqual(blockedOutput.recall_veto.reason_codes, ['grant_missing']);
    assert.equal(blocked.stdout().includes('Enigma quickstart demo memory'), false);
    assert.equal(blocked.stdout().includes(dir), false);

    const blockedPlain = makeIo();
    assert.equal(await main(['context', '--bundle', bundle, '--query', 'local proof bundle', '--proof', '--require-grant', '--plain'], blockedPlain.io), 0, blockedPlain.stderr());
    assert.match(blockedPlain.stdout(), /^Enigma context\n/);
    assert.match(blockedPlain.stdout(), /Context: blocked/);
    assert.match(blockedPlain.stdout(), /Controller: ask/);
    assert.match(blockedPlain.stdout(), /Reason: grant_missing/);
    assert.doesNotMatch(blockedPlain.stdout(), /^\s*\{/);
    assert.equal(blockedPlain.stdout().includes('Enigma quickstart demo memory'), false);
    assert.equal(blockedPlain.stdout().includes(dir), false);

    const grant = makeIo();
    assert.equal(await main([
      'controller',
      'grant',
      '--app-ref',
      'ref:app:cli-test',
      '--purpose-ref',
      'ref:purpose:cli_context',
      '--memory-zone-ref',
      'ref:zone:default',
      '--out',
      grantFile,
    ], grant.io), 0, grant.stderr());
    const grantOutput = grant.json();
    assert.equal(grantOutput.schema, 'enigma.memory_controller_grant.v1');
    assert.equal(grantOutput.app_ref, 'ref:app:cli-test');
    assert.deepEqual(grantOutput.operations, ['recall_context']);

    const allowed = makeIo();
    assert.equal(await main([
      'context',
      '--bundle',
      bundle,
      '--query',
      'local proof bundle',
      '--proof',
      '--require-grant',
      '--grant-file',
      grantFile,
      '--app-ref',
      'ref:app:cli-test',
      '--purpose-ref',
      'ref:purpose:cli_context',
      '--memory-zone-ref',
      'ref:zone:default',
    ], allowed.io), 0, allowed.stderr());
    const allowedOutput = allowed.json();
    assert.equal(allowedOutput.schema, 'enigma.context_proof_bundle.v1');
    assert.equal(allowedOutput.context_pack_summary.memory_count > 0, true);
    assert.equal(allowedOutput.memory_controller.context_pack_returned, true);
    assert.equal(allowedOutput.memory_controller.recall_veto.safe_to_share, true);
    assert.deepEqual(allowedOutput.memory_controller.recall_veto.grant_refs, [grantOutput.grant_ref]);
    assert.equal(allowed.stdout().includes('Enigma quickstart demo memory'), false);
    assert.equal(allowed.stdout().includes(dir), false);

    const revoked = makeIo();
    assert.equal(await main(['controller', 'revoke', '--grant-file', grantFile, '--out', revokedGrantFile], revoked.io), 0, revoked.stderr());
    const revokedOutput = revoked.json();
    assert.equal(revokedOutput.schema, 'enigma.memory_controller_grant.v1');
    assert.equal(revokedOutput.status, 'revoked');
    assert.equal(revokedOutput.grant_ref, grantOutput.grant_ref);

    const revokedContext = makeIo();
    assert.equal(await main([
      'context',
      '--bundle',
      bundle,
      '--query',
      'local proof bundle',
      '--proof',
      '--require-grant',
      '--grant-file',
      revokedGrantFile,
      '--app-ref',
      'ref:app:cli-test',
      '--purpose-ref',
      'ref:purpose:cli_context',
      '--memory-zone-ref',
      'ref:zone:default',
    ], revokedContext.io), 0, revokedContext.stderr());
    const revokedContextOutput = revokedContext.json();
    assert.equal(revokedContextOutput.schema, 'enigma.context_pack_recall_blocked.v1');
    assert.equal(revokedContextOutput.recall_veto.decision, 'deny');
    assert.deepEqual(revokedContextOutput.recall_veto.grant_refs, [grantOutput.grant_ref]);
    assert.ok(revokedContextOutput.recall_veto.reason_codes.includes('policy_denies_recall'));
    assert.equal(revokedContext.stdout().includes('Enigma quickstart demo memory'), false);
    assert.equal(revokedContext.stdout().includes(dir), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('controller grant and revoke plain output is readable and path-redacted', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-controller-plain-'));
  const grantFile = join(dir, 'grant.json');
  const revokedGrantFile = join(dir, 'grant.revoked.json');
  try {
    const grant = makeIo();
    assert.equal(await main([
      'controller',
      'grant',
      '--app-ref',
      'ref:app:plain-test',
      '--purpose-ref',
      'ref:purpose:plain_context',
      '--memory-zone-ref',
      'ref:zone:default',
      '--out',
      grantFile,
      '--plain',
    ], grant.io), 0, grant.stderr());
    assert.match(grant.stdout(), /^Enigma controller grant\n/);
    assert.match(grant.stdout(), /Status: active/);
    assert.match(grant.stdout(), /Grant: ref:/);
    assert.match(grant.stdout(), /App: ref:app:plain-test/);
    assert.match(grant.stdout(), /Operations: recall_context/);
    assert.match(grant.stdout(), /Grant file: written to <out>/);
    assert.match(grant.stdout(), /Boundary: public-safe local consent grant only/);
    assert.doesNotMatch(grant.stdout(), /^\s*\{/);
    assert.equal(grant.stdout().includes(dir), false);
    assert.equal(grant.stdout().includes(grantFile), false);

    const revoked = makeIo();
    assert.equal(await main(['controller', 'revoke', '--grant-file', grantFile, '--out', revokedGrantFile, '--plain'], revoked.io), 0, revoked.stderr());
    assert.match(revoked.stdout(), /^Enigma controller revoke\n/);
    assert.match(revoked.stdout(), /Status: revoked/);
    assert.match(revoked.stdout(), /Grant: ref:/);
    assert.match(revoked.stdout(), /Grant file: written to <out>/);
    assert.match(revoked.stdout(), /Boundary: public-safe local consent grant only/);
    assert.doesNotMatch(revoked.stdout(), /^\s*\{/);
    assert.equal(revoked.stdout().includes(dir), false);
    assert.equal(revoked.stdout().includes(grantFile), false);
    assert.equal(revoked.stdout().includes(revokedGrantFile), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
