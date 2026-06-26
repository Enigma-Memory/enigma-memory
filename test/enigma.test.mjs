import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  generateSigningKeyPair,
  receiptHash,
  createReceipt,
  verifyReceipt,
  verifyReceiptChain,
  MerkleSet,
  createCheckpoint,
  verifyCheckpoint,
} from '../packages/core/src/index.js';
import { createVault, remember, recall, updateMemory, deleteMemory, exportBundle, importBundle } from '../packages/vault/src/index.js';
import { createPassport, compileContextPack, verifyContextPack, createMemoryDriveHealthReport } from '../packages/passport/src/index.js';
import { boundaryClassifications, classifyBoundaryPath, createBoundaryManifest, runBoundarySimulation } from '../packages/boundary/src/index.js';
import { verifyBundle } from '../apps/verifier/bin/enigma-verify.mjs';

function callAny(fn, attempts) {
  let lastError;
  for (const args of attempts) {
    try {
      return fn(...args);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function verdictOk(value) {
  if (value === true) return true;
  if (value === false) return false;
  if (value && typeof value === 'object') return Boolean(value.ok ?? value.valid);
  return Boolean(value);
}

function assertVerifies(value) {
  assert.equal(verdictOk(value), true, JSON.stringify(value));
}

function assertFails(value) {
  assert.equal(verdictOk(value), false, JSON.stringify(value));
}

function makeKeyPair(keyId) {
  const pair = callAny(generateSigningKeyPair, [[{ keyId }], [keyId], []]);
  return { ...pair, keyId: pair.keyId ?? pair.key_id ?? keyId };
}

function setRoot(items) {
  const set = new MerkleSet(items);
  if (typeof set.root === 'function') return set.root();
  if (typeof set.getRoot === 'function') return set.getRoot();
  return set.root;
}

function makeEvent(sequence, operation = 'create', memoryAddr = `mem:test:${sequence}`) {
  return {
    schema: 'enigma.memory_event.v1',
    event_id: `evt-${sequence.toString().padStart(4, '0')}`,
    operation,
    tenant_id: 'tenant-test',
    subject_id: 'subject-test',
    actor_id: 'actor-test',
    memory_addr: memoryAddr,
    timestamp: `2026-01-01T00:00:${sequence.toString().padStart(2, '0')}.000Z`,
    sequence,
    policy_id: 'policy-local',
    metadata: { fixture: true },
  };
}

function makeReceipt(event, keyPair, previousReceipt = null, activeItems = [event.memory_addr]) {
  const previousReceiptHash = previousReceipt ? receiptHash(previousReceipt) : 'GENESIS';
  const activeSetRoot = setRoot(activeItems);
  return callAny(createReceipt, [
    [{ event, keyPair, privateKey: keyPair.privateKey, keyId: keyPair.keyId, previousReceiptHash, activeSetRoot }],
    [event, { privateKey: keyPair.privateKey, keyId: keyPair.keyId, previousReceiptHash, activeSetRoot }],
    [event, keyPair.privateKey, { keyId: keyPair.keyId, previousReceiptHash, activeSetRoot }],
  ]);
}

function verifyOne(receipt, publicKey) {
  try {
    return callAny(verifyReceipt, [
      [{ receipt, publicKey }],
      [receipt, publicKey],
    ]);
  } catch (error) {
    return { ok: false, errors: [{ message: error.message }] };
  }
}

function verifyChain(receipts, publicKey) {
  try {
    return callAny(verifyReceiptChain, [
      [{ receipts, publicKey }],
      [receipts, publicKey],
    ]);
  } catch (error) {
    return { ok: false, errors: [{ message: error.message }] };
  }
}

function makeReceiptChain(count = 3) {
  const keyPair = makeKeyPair('test-signer');
  const receipts = [];
  for (let i = 0; i < count; i += 1) {
    receipts.push(makeReceipt(makeEvent(i), keyPair, receipts.at(-1), receipts.map((receipt) => receipt.memory_addr).filter(Boolean).concat(`mem:test:${i}`)));
  }
  return { keyPair, receipts };
}

function makeCheckpoint(receipts, keyPair) {
  const last = receipts.at(-1);
  const chain = verifyChain(receipts, keyPair.publicKey);
  return callAny(createCheckpoint, [
    [{ receipts, keyPair, privateKey: keyPair.privateKey, keyId: keyPair.keyId, activeMemoryRoot: last.active_set_root, receiptLogRoot: chain.receipt_log_root }],
    [receipts, { privateKey: keyPair.privateKey, keyId: keyPair.keyId, activeMemoryRoot: last.active_set_root, receiptLogRoot: chain.receipt_log_root }],
  ]);
}

function verifyCheckpointAgainst(checkpoint, receipts, publicKey) {
  try {
    const chain = verifyChain(receipts, publicKey);
    return callAny(verifyCheckpoint, [
      [{ checkpoint, receipts, publicKey, expectedReceiptLogRoot: chain.receipt_log_root, expectedActiveMemoryRoot: chain.active_set_root }],
      [checkpoint, { publicKey, expectedReceiptLogRoot: chain.receipt_log_root, expectedActiveMemoryRoot: chain.active_set_root }],
    ]);
  } catch (error) {
    return { ok: false, errors: [{ message: error.message }] };
  }
}

function getNonMembershipProof(set, item) {
  for (const name of ['createNonMembershipProof', 'nonMembershipProof', 'getNonMembershipProof', 'proveNonMembership', 'proveAbsence']) {
    if (typeof set[name] === 'function') return set[name](item);
  }
  throw new Error('MerkleSet must expose a non-membership proof method.');
}
function verifyNonMembership(set, item, proof, root = setRoot([])) {
  try {
    for (const name of ['verifyNonMembershipProof', 'verifyNonMembership', 'verifyAbsence']) {
      if (typeof set[name] === 'function') {
        try {
          return set[name](proof, root);
        } catch {
          return set[name](item, proof, root);
        }
      }
      if (typeof MerkleSet[name] === 'function') {
        try {
          return MerkleSet[name](proof, root);
        } catch {
          return MerkleSet[name](item, proof, root);
        }
      }
    }
    throw new Error('MerkleSet must expose non-membership proof verification.');
  } catch (error) {
    return { ok: false, errors: [{ message: error.message }] };
  }
}

test('valid receipt verifies', () => {
  const { keyPair, receipts } = makeReceiptChain(1);
  assertVerifies(verifyOne(receipts[0], keyPair.publicKey));
  assertVerifies(verifyChain(receipts, keyPair.publicKey));
});

test('changed receipt fails', () => {
  const { keyPair, receipts } = makeReceiptChain(1);
  const changed = { ...receipts[0], event_hash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000' };
  assertFails(verifyOne(changed, keyPair.publicKey));
});

test('wrong signer fails', () => {
  const { receipts } = makeReceiptChain(1);
  const wrong = makeKeyPair('wrong-signer');
  assertFails(verifyOne(receipts[0], wrong.publicKey));
});

test('deleted receipt breaks chain', () => {
  const { keyPair, receipts } = makeReceiptChain(3);
  assertFails(verifyChain([receipts[0], receipts[2]], keyPair.publicKey));
});

test('reordered receipt breaks chain', () => {
  const { keyPair, receipts } = makeReceiptChain(3);
  assertFails(verifyChain([receipts[1], receipts[0], receipts[2]], keyPair.publicKey));
});

test('inserted receipt breaks chain', () => {
  const { keyPair, receipts } = makeReceiptChain(3);
  const inserted = makeReceipt(makeEvent(99, 'create', 'mem:test:inserted'), keyPair, receipts[0], ['mem:test:0', 'mem:test:inserted']);
  assertFails(verifyChain([receipts[0], inserted, receipts[1], receipts[2]], keyPair.publicKey));
});

test('receipt verifier rejects unsigned extensions and public plaintext fields', () => {
  const { keyPair, receipts } = makeReceiptChain(2);
  assertFails(verifyOne({ ...receipts[0], unsigned_extension: 'not signed' }, keyPair.publicKey));
  assertFails(verifyOne({ ...receipts[0], content: 'raw memory must not be public proof' }, keyPair.publicKey));
  assertFails(verifyOne({ ...receipts[0], signature: { ...receipts[0].signature, kid: 'extension' } }, keyPair.publicKey));
  assertFails(verifyChain([{ ...receipts[0], unsigned_extension: 'not signed' }, receipts[1]], keyPair.publicKey));
  assertVerifies(verifyChain(receipts, keyPair.publicKey));
});

test('stale checkpoint fails', () => {
  const { keyPair, receipts } = makeReceiptChain(2);
  const stale = makeCheckpoint([receipts[0]], keyPair);
  assertFails(verifyCheckpointAgainst(stale, receipts, keyPair.publicKey));
});

test('non-membership proof rejects present item', () => {
  const set = new MerkleSet(['mem:test:present']);
  const proof = { ...getNonMembershipProof(set, 'mem:test:absent'), value: 'mem:test:present' };
  assertFails(verifyNonMembership(set, 'mem:test:present', proof, setRoot(['mem:test:present'])));
});

test('non-membership proof rejects wrong root', () => {
  const set = new MerkleSet(['mem:test:present']);
  const proof = getNonMembershipProof(set, 'mem:test:absent');
  assertFails(verifyNonMembership(set, 'mem:test:absent', proof, setRoot(['mem:test:other'])));
});

async function withLocalBundle(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-test-'));
  try {
    const vaultResult = await createVault({ subjectId: 'subject-test', displayName: 'Subject Test', passphrase: 'test-passphrase', path: join(dir, 'bundle.json') });
    const vault = vaultResult.vault ?? vaultResult;
    const passportResult = await createPassport({ subjectId: 'subject-test', displayName: 'Subject Test', vault, passphrase: 'test-passphrase' });
    const passport = passportResult.passport ?? passportResult;
    const bundle = {
      schema: 'enigma.local_bundle.v1',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      subject_id: 'subject-test',
      vault,
      passport,
      receipts: vaultResult.receipts ?? passportResult.receipts ?? [],
      checkpoints: vaultResult.checkpoints ?? passportResult.checkpoints ?? [],
      publicKey: vaultResult.publicKey ?? vault.publicKey ?? vault.signingKeyPair?.publicKey ?? passportResult.publicKey ?? passport.publicKey,
      trust_bundle: vaultResult.trust_bundle ?? passportResult.trust_bundle,
    };
    return await fn(bundle, dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function merged(bundle, result) {
  return result?.bundle ?? {
    ...bundle,
    vault: result?.vault ?? bundle.vault,
    passport: result?.passport ?? bundle.passport,
    receipts: result?.receipts ?? (result?.receipt ? [...bundle.receipts, result.receipt] : bundle.receipts),
    checkpoints: result?.checkpoints ?? (result?.checkpoint ? [...bundle.checkpoints, result.checkpoint] : bundle.checkpoints),
    publicKey: result?.publicKey ?? bundle.publicKey,
  };
}

test('deleted memory is not served by context compiler', async () => {
  await withLocalBundle(async (bundle) => {
    const secretText = 'carry a red umbrella at noon';
    const remembered = await remember({ bundle, vault: bundle.vault, passport: bundle.passport, text: secretText, purpose: 'fixture' });
    bundle = merged(bundle, remembered);
    const memoryAddr = remembered.memory_addr ?? remembered.memory?.memory_addr ?? remembered.memory?.address;
    const deleted = await deleteMemory({ bundle, vault: bundle.vault, passport: bundle.passport, memory_addr: memoryAddr, reason: 'test-delete' });
    bundle = merged(bundle, deleted);
    const pack = await compileContextPack({ bundle, vault: bundle.vault, passport: bundle.passport, query: 'umbrella', limit: 10 });
    assert.doesNotMatch(JSON.stringify(pack), /carry a red umbrella at noon/);
  });
});

test('receipt export verifies offline', async () => {
  await withLocalBundle(async (bundle) => {
    const secretText = 'offline export plaintext sentinel';
    const remembered = await remember({ bundle, vault: bundle.vault, passport: bundle.passport, text: secretText, purpose: 'fixture' });
    bundle = merged(bundle, remembered);
    const exportedResult = await exportBundle({ bundle, vault: bundle.vault, passport: bundle.passport, includePlaintext: false });
    const exported = exportedResult.bundle ?? exportedResult;
    assertVerifies(verifyBundle(exported));
    assert.doesNotMatch(JSON.stringify(exported.receipts), /offline export plaintext sentinel/);
  });
});

test('vault receipt streams embed prior receipt-log roots and verify final root', async () => {
  const vault = createVault({ subjectId: 'subject-receipt-prefix' });
  const remembered = await remember({ vault, text: 'receipt prefix root memory', purpose: 'fixture', now: '2026-01-01T00:00:00.000Z' });
  const updated = await updateMemory({ vault, memory_addr: remembered.memory_addr, text: 'receipt prefix root memory updated', purpose: 'fixture', now: '2026-01-01T00:01:00.000Z' });
  await deleteMemory({ vault, memory_addr: updated.memory_addr, reason: 'fixture-delete', now: '2026-01-01T00:02:00.000Z' });
  await exportBundle({ vault, now: '2026-01-01T00:03:00.000Z' });

  const prefixHashes = [];
  for (const receipt of vault.receipts) {
    assert.equal(receipt.receipt_log_root, setRoot(prefixHashes));
    prefixHashes.push(receiptHash(receipt));
  }
  const finalRoot = setRoot(prefixHashes);
  assert.equal(vault.receipt_log_root, finalRoot);

  const verified = verifyReceiptChain({
    receipts: vault.receipts,
    publicKey: vault.signingKeyPair.publicKey,
    verifyEmbeddedReceiptLogRoot: true,
    expectedReceiptLogRoot: finalRoot,
  });
  assertVerifies(verified);
  assert.equal(verified.receipt_log_root, finalRoot);
});

test('export import and public context redact raw-looking source refs', async () => {
  const sourceRefSentinel = 'source_refs rawMemory sentinel must not survive public output';
  const vault = createVault({ subjectId: 'subject-source-ref-redaction' });
  const remembered = await remember({
    vault,
    text: 'safe committed memory body for source ref redaction',
    purpose: 'fixture',
    source_refs: [{
      source_type: 'chatgpt',
      path: 'memories/0',
      source_id: sourceRefSentinel,
      rawMemory: sourceRefSentinel,
      plainText: sourceRefSentinel,
      contextText: sourceRefSentinel,
      nested: { raw_memory: sourceRefSentinel, label: 'safe-label' },
    }],
    metadata: {
      rawMemory: sourceRefSentinel,
      plainText: sourceRefSentinel,
      contextText: sourceRefSentinel,
    },
  });
  assert.doesNotMatch(JSON.stringify(remembered.memory), /source_refs rawMemory sentinel/);

  const exported = await exportBundle({ vault, now: '2026-01-01T00:00:00.000Z' });
  assert.doesNotMatch(JSON.stringify(exported), /source_refs rawMemory sentinel/);

  const poisoned = structuredClone(exported);
  poisoned.memory_objects[0].rawMemory = sourceRefSentinel;
  poisoned.memory_objects[0].plainText = sourceRefSentinel;
  poisoned.memory_objects[0].contextText = sourceRefSentinel;
  poisoned.memory_objects[0].plain_text = sourceRefSentinel;
  poisoned.memory_objects[0].context_text = sourceRefSentinel;
  poisoned.memory_objects[0].raw_memory = sourceRefSentinel;
  poisoned.memory_objects[0].source_refs = [{
    source_type: 'manual',
    path: `private path ${sourceRefSentinel}`,
    source_id: sourceRefSentinel,
    rawMemory: sourceRefSentinel,
    nested: { plainText: sourceRefSentinel },
  }];
  poisoned.memory_objects[0].sourceRefs = [{ value: sourceRefSentinel, raw_memory: sourceRefSentinel }];
  poisoned.events.push({
    event: { schema: 'enigma.memory_event.v1', operation: 'poisoned', rawMemory: sourceRefSentinel, metadata: { plainText: sourceRefSentinel } },
    canonical: sourceRefSentinel,
    hash: sourceRefSentinel,
  });

  const imported = importBundle({ bundle: poisoned, now: '2026-01-01T00:01:00.000Z' });
  const reexported = await exportBundle({ vault: imported.vault, now: '2026-01-01T00:02:00.000Z' });
  assert.doesNotMatch(JSON.stringify(reexported), /source_refs rawMemory sentinel/);
  assertVerifies(verifyReceiptChain({
    receipts: reexported.receipts,
    publicKey: imported.vault.signingKeyPair.publicKey,
    verifyEmbeddedReceiptLogRoot: true,
    expectedReceiptLogRoot: imported.vault.receipt_log_root,
  }));

  const passport = createPassport({ vault: imported.vault, now: '2026-01-01T00:03:00.000Z' });
  const pack = await compileContextPack({
    vault: imported.vault,
    passport,
    memory_addresses: [remembered.memory_addr],
    query: 'redaction check',
    limit: 1,
    now: '2026-01-01T00:04:00.000Z',
  });
  assert.doesNotMatch(JSON.stringify(pack), /source_refs rawMemory sentinel/);

  const adversarialPack = {
    ...pack,
    memories: pack.memories.map((memory) => ({
      ...memory,
      source_refs: [{ source_id: sourceRefSentinel, rawMemory: sourceRefSentinel, nested: { contextText: sourceRefSentinel } }],
    })),
  };
  const verified = verifyContextPack({ contextPack: adversarialPack, vault: imported.vault, passport, publicKey: imported.vault.signingKeyPair.publicKey });
  assert.equal(verified.valid, true);
  assert.doesNotMatch(JSON.stringify(verified), /source_refs rawMemory sentinel/);
  assert.doesNotMatch(verified.canonical, /source_refs rawMemory sentinel/);
  assert.equal(/"(rawMemory|plainText|contextText|raw_memory|plain_text|context_text)"\s*:/.test(JSON.stringify(verified.public_context_pack)), false);
});

test('vault public metadata commits non-allowlisted primitive and nested values', async () => {
  const rawMetadata = 'metadata private sentinel must be committed before public vault output';
  const vault = createVault({ subjectId: 'subject-metadata-redaction' });
  const remembered = await remember({
    vault,
    text: 'metadata redaction payload',
    purpose: 'fixture',
    metadata: {
      summary: rawMetadata,
      description: rawMetadata,
      note: rawMetadata,
      favoriteColor: rawMetadata,
      unknown_primitive: rawMetadata,
      nested: { description: rawMetadata, harmless: rawMetadata },
      nestedList: [{ note: rawMetadata }],
    },
  });

  assert.doesNotMatch(JSON.stringify(remembered.memory.metadata), /metadata private sentinel/);
  for (const key of ['summary_commitment', 'description_commitment', 'note_commitment', 'favorite_color_commitment', 'unknown_primitive_commitment', 'nested_commitment', 'nested_list_commitment']) {
    assert.match(remembered.memory.metadata[key], /^sha256:[a-f0-9]{64}$/);
  }

  const stored = vault.__getRecord(remembered.memory_addr);
  assert.doesNotMatch(JSON.stringify(stored.metadata), /metadata private sentinel/);
  assert.equal(/"(summary|description|note|favoriteColor|unknown_primitive|nested|nestedList)"\s*:/.test(JSON.stringify(stored.metadata)), false);

  const recalled = await recall({ vault, memory_addr: remembered.memory_addr, purpose: 'fixture' });
  assert.equal(recalled.content, 'metadata redaction payload');
  assert.doesNotMatch(JSON.stringify(recalled.memory.metadata), /metadata private sentinel/);

  const updated = await updateMemory({ vault, memory_addr: remembered.memory_addr, text: 'metadata redaction payload updated', purpose: 'fixture' });
  assert.doesNotMatch(JSON.stringify(updated.memory.metadata), /metadata private sentinel/);

  const exported = await exportBundle({ vault, now: '2026-01-01T00:00:00.000Z' });
  assert.doesNotMatch(JSON.stringify(exported), /metadata private sentinel/);

  const poisoned = structuredClone(exported);
  for (const memory of poisoned.memory_objects) {
    memory.metadata = {
      summary: rawMetadata,
      description: rawMetadata,
      note: rawMetadata,
      camelCaseSecret: rawMetadata,
      unknown_primitive: rawMetadata,
      nested: { summary: rawMetadata },
    };
  }
  const imported = importBundle({ bundle: poisoned, now: '2026-01-01T00:01:00.000Z' });
  const reexported = await exportBundle({ vault: imported.vault, now: '2026-01-01T00:02:00.000Z' });
  assert.doesNotMatch(JSON.stringify(reexported), /metadata private sentinel/);
  assert.equal(/"(summary|description|note|camelCaseSecret|unknown_primitive|nested)"\s*:/.test(JSON.stringify(reexported.memory_objects)), false);
  assert.match(reexported.memory_objects[0].metadata.camel_case_secret_commitment, /^sha256:[a-f0-9]{64}$/);
});

test('importBundle rejects active state that contradicts receipt lifecycle', async () => {
  const vault = createVault({ subjectId: 'subject-import-lifecycle' });
  const remembered = await remember({ vault, text: 'import lifecycle deleted memory', purpose: 'fixture', now: '2026-01-01T00:00:00.000Z' });
  await deleteMemory({ vault, memory_addr: remembered.memory_addr, reason: 'fixture-delete', now: '2026-01-01T00:01:00.000Z' });
  const exported = await exportBundle({ vault, now: '2026-01-01T00:02:00.000Z' });

  const resurrected = structuredClone(exported);
  resurrected.active_memory_addresses = [remembered.memory_addr];
  resurrected.tombstones = [];
  resurrected.memory_objects = resurrected.memory_objects.map((memory) => (
    memory.memory_addr === remembered.memory_addr ? { ...memory, state: 'active' } : memory
  ));

  assert.throws(
    () => importBundle({ bundle: resurrected, now: '2026-01-01T00:03:00.000Z' }),
    /receipt-derived state/,
  );
});

test('vault memory records and exports do not expose enumerable plaintext', async () => {
  const raw = 'raw memory sentinel after recall update delete';
  const updatedRaw = 'updated raw memory sentinel after recall update delete';
  const vault = createVault({ subjectId: 'subject-proof-invariants' });
  const remembered = await remember({ vault, text: raw, purpose: 'fixture' });
  const firstAddr = remembered.memory_addr;
  const firstRecord = vault.__getRecord(firstAddr);
  assert.equal(Object.keys(firstRecord).includes('plaintext'), false);
  assert.doesNotMatch(JSON.stringify(firstRecord), /raw memory sentinel/);

  const recalled = await recall({ vault, memory_addr: firstAddr, purpose: 'fixture' });
  assert.equal(recalled.content, raw);
  assert.equal(Object.keys(firstRecord).includes('plaintext'), false);
  assert.doesNotMatch(JSON.stringify(firstRecord), /raw memory sentinel/);

  const updated = await updateMemory({ vault, memory_addr: firstAddr, text: updatedRaw, purpose: 'fixture' });
  const secondAddr = updated.memory_addr;
  const oldRecord = vault.__getRecord(firstAddr);
  const newRecord = vault.__getRecord(secondAddr);
  assert.equal(Object.keys(oldRecord).includes('plaintext'), false);
  assert.equal(Object.keys(newRecord).includes('plaintext'), false);
  assert.doesNotMatch(JSON.stringify([oldRecord, newRecord]), /raw memory sentinel/);

  const recalledUpdated = await recall({ vault, memory_addr: secondAddr, purpose: 'fixture' });
  assert.equal(recalledUpdated.content, updatedRaw);
  assert.equal(Object.keys(newRecord).includes('plaintext'), false);
  assert.doesNotMatch(JSON.stringify(newRecord), /updated raw memory sentinel/);

  await deleteMemory({ vault, memory_addr: secondAddr, reason: 'fixture-delete' });
  assert.equal(Object.keys(newRecord).includes('plaintext'), false);
  const exported = await exportBundle({ vault });
  assert.doesNotMatch(JSON.stringify(exported), /raw memory sentinel/);
  assert.doesNotMatch(JSON.stringify(exported), /updated raw memory sentinel/);
});

test('verifyContextPack returns redacted public output while compile keeps private payload', async () => {
  const raw = 'context pack raw memory sentinel';
  const vault = createVault({ subjectId: 'subject-context-redaction' });
  const passport = createPassport({ vault });
  const remembered = await remember({ vault, text: raw, purpose: 'fixture' });
  const pack = await compileContextPack({ vault, passport, memory_addresses: [remembered.memory_addr], query: raw, limit: 1 });
  assert.match(JSON.stringify(pack), /context pack raw memory sentinel/);

  const verified = verifyContextPack({ contextPack: pack, vault, passport, publicKey: vault.signingKeyPair.publicKey });
  assert.equal(verified.valid, true);
  assert.doesNotMatch(JSON.stringify(verified), /context pack raw memory sentinel/);
  assert.doesNotMatch(verified.canonical, /context pack raw memory sentinel/);

  const adversarialMemoryPack = {
    ...pack,
    memories: pack.memories.map((memory) => ({ ...memory, body: raw, note: raw })),
  };
  const redactedWithoutKey = verifyContextPack({ contextPack: adversarialMemoryPack, vault, passport });
  assert.equal(redactedWithoutKey.valid, false);
  assert.equal(redactedWithoutKey.reason, 'PUBLIC_KEY_REQUIRED_FOR_CONTEXT_PACK_VERIFICATION');
  assert.doesNotMatch(JSON.stringify(redactedWithoutKey), /context pack raw memory sentinel/);
  assert.doesNotMatch(redactedWithoutKey.canonical, /context pack raw memory sentinel/);

  const fakeReceiptPack = {
    ...pack,
    receipts: pack.receipts.map((receipt) => ({ ...receipt, signature: { ...receipt.signature, value: 'syntactically-valid-fake-signature' } })),
  };
  const fakeWithoutKey = verifyContextPack({ contextPack: fakeReceiptPack, vault, passport });
  assert.equal(fakeWithoutKey.valid, false);
  assert.equal(fakeWithoutKey.reason, 'PUBLIC_KEY_REQUIRED_FOR_CONTEXT_PACK_VERIFICATION');
  assert.doesNotMatch(JSON.stringify(fakeWithoutKey), /context pack raw memory sentinel/);
  assert.doesNotMatch(fakeWithoutKey.canonical, /context pack raw memory sentinel/);

  const adversarialReceiptPack = {
    ...pack,
    receipts: [{ ...pack.receipts[0], plaintext: raw }, ...pack.receipts.slice(1)],
  };
  assert.throws(
    () => verifyContextPack({ contextPack: adversarialReceiptPack, vault, passport, publicKey: vault.signingKeyPair.publicKey }),
    /receipt failed verification/,
  );
});

test('compileContextPack can attach plaintext-minimized optimizer evidence', async () => {
  const vault = createVault({ subjectId: 'subject-context-optimizer' });
  const passport = createPassport({ vault, now: '2026-06-23T12:00:00.000Z' });
  const old = await remember({ vault, text: 'old optimizer private raw sentinel should stay local', purpose: 'fixture', now: '2026-06-23T10:00:00.000Z' });
  const recent = await remember({ vault, text: 'recent optimizer private raw sentinel should stay local', purpose: 'fixture', now: '2026-06-23T12:00:00.000Z' });
  await remember({ vault, text: 'recent optimizer private raw sentinel should stay local', purpose: 'fixture', now: '2026-06-23T12:00:01.000Z' });

  const pack = compileContextPack({
    vault,
    passport,
    query: 'optimizer sentinel query',
    optimize: true,
    limit: 2,
    price_per_million_tokens: 3,
    currency: 'USD',
    now: '2026-06-23T12:00:00.000Z',
  });

  assert.equal(pack.optimization_plan.schema, 'enigma.memory_optimization_plan.v1');
  assert.equal(pack.optimization_plan.totals.input_candidates, 2);
  assert.equal(pack.optimization_receipts.length, pack.memory_addresses.length);
  assert.equal(pack.memory_addresses.length, 2);
  assert.ok(pack.memory_addresses.every((memoryAddr) => typeof memoryAddr === 'string' && memoryAddr.length > 0));
  assert.doesNotMatch(JSON.stringify(pack.optimization_plan), /optimizer private raw sentinel/);
  assert.doesNotMatch(JSON.stringify(pack.optimization_receipts), /optimizer private raw sentinel/);
  assert.ok(pack.optimization_plan.baseline_prompt_tokens >= pack.optimization_plan.optimized_prompt_tokens);

  const verified = verifyContextPack({ contextPack: pack, vault, passport, publicKey: vault.signingKeyPair.publicKey });
  assert.equal(verified.valid, true);
  assert.equal(verified.public_context_pack.optimization_plan.schema, 'enigma.memory_optimization_plan.v1');
  assert.equal(verified.public_context_pack.optimization_receipts.length, pack.optimization_receipts.length);
  assert.doesNotMatch(JSON.stringify(verified.public_context_pack.optimization_plan), /optimizer private raw sentinel/);
  assert.equal(verified.public_context_pack.optimization_plan.items[0].content_hash, undefined);
  assert.equal(verified.public_context_pack.optimization_plan.items[0].content_hash_redacted, true);
  assert.equal(verified.public_context_pack.optimization_receipts[0].content_hash, undefined);
  assert.equal(verified.public_context_pack.optimization_receipts[0].content_hash_redacted, true);
});

test('compileContextPack applies query-aware optimizer relevance only for implicit active selection', async () => {
  const vault = createVault({ subjectId: 'subject-query-relevance' });
  const passport = createPassport({ vault, now: '2026-06-24T00:00:00.000Z' });
  const relevant = await remember({
    vault,
    text: 'Project deployment note: staging region uses amethyst harbor.',
    purpose: 'fixture',
    kind: 'fact',
    purpose_tags: ['deployment', 'region'],
    now: '2026-06-24T00:01:00.000Z',
  });
  await remember({
    vault,
    text: 'Deployment housekeeping note: 2026 launch checklist uses generic routing.',
    purpose: 'fixture',
    kind: 'fact',
    purpose_tags: ['deployment'],
    now: '2026-06-24T00:01:30.000Z',
  });
  const irrelevant = await remember({
    vault,
    text: 'Personal cooking note: use 2026 breakfast oatmeal with cinnamon.',
    purpose: 'fixture',
    kind: 'preference',
    purpose_tags: ['food'],
    now: '2026-06-24T00:02:00.000Z',
  });

  const pack = compileContextPack({
    vault,
    passport,
    query: 'Which deployment region should quasaronly use in 2026?',
    optimize: true,
    max_estimated_tokens: 512,
    limit: 1,
    now: '2026-06-24T00:03:00.000Z',
  });
  assert.deepEqual(pack.memory_addresses, [relevant.memory_addr]);
  assert.equal(pack.optimization_plan.totals.input_candidates, 1);
  assert.doesNotMatch(JSON.stringify(pack.optimization_plan), /quasaronly|amethyst harbor|breakfast oatmeal/iu);
  const verified = verifyContextPack({ contextPack: pack, vault, passport, publicKey: vault.signingKeyPair.publicKey });
  assert.equal(verified.valid, true);
  assert.doesNotMatch(JSON.stringify(verified.public_context_pack.optimization_plan), /quasaronly|amethyst harbor|breakfast oatmeal/iu);

  const explicitPack = compileContextPack({
    vault,
    passport,
    memory_addresses: [irrelevant.memory_addr],
    query: 'Which deployment region should quasaronly use in 2026?',
    optimize: true,
    max_estimated_tokens: 512,
    limit: 10,
    now: '2026-06-24T00:04:00.000Z',
  });
  assert.deepEqual(explicitPack.memory_addresses, [irrelevant.memory_addr]);

  const fallbackPack = compileContextPack({
    vault,
    passport,
    query: 'zzzxqonly',
    optimize: true,
    max_estimated_tokens: 512,
    limit: 10,
    now: '2026-06-24T00:05:00.000Z',
  });
  assert.equal(fallbackPack.memory_addresses.length, 3);

  const strictPack = compileContextPack({
    vault,
    passport,
    query: 'zzzxqonly',
    optimize: true,
    strict_relevance: true,
    max_estimated_tokens: 512,
    limit: 10,
    now: '2026-06-24T00:06:00.000Z',
  });
  assert.deepEqual(strictPack.memory_addresses, []);
});

test('boundary harness detects committed crossing', () => {
  const report = runBoundarySimulation({ manifest: createBoundaryManifest() });
  const row = report.rows.find((item) => item.scenario === 'honest committed crossing');
  assert.equal(row?.canp, 'CROSSED');
  assert.equal(row?.verdict, 'PASS');
});

test('boundary harness exposes false assurance for uninstrumented scratchpad', () => {
  const report = runBoundarySimulation({ manifest: createBoundaryManifest() });
  const row = report.rows.find((item) => item.scenario === 'scratchpad leak');
  assert.equal(row?.canp, 'FALSE_ASSURANCE');
  assert.equal(row?.verdict, 'FAIL');
});

test('boundary harness shows mitigation for committed scratchpad', () => {
  const report = runBoundarySimulation({ manifest: createBoundaryManifest() });
  const row = report.rows.find((item) => item.scenario === 'mitigated scratchpad route-through-channel');
  assert.equal(row?.canp, 'CROSSED');
  assert.equal(row?.verdict, 'PASS');
});

test('boundary harness fails closed for unknown route path', () => {
  const report = runBoundarySimulation({
    manifest: createBoundaryManifest(),
    scenarios: [{
      scenario: 'unknown provider route',
      pathId: 'provider_native:tool_result',
      fact: 'unknown-provider-route-test-canary',
      bGotVia: 'provider_native_tool',
      committed: false
    }]
  });
  const row = report.rows[0];
  assert.equal(row?.canp, 'UNKNOWN_BOUNDARY');
  assert.equal(row?.verdict, 'FAIL');
  assert.equal(row?.classification, 'fail_closed');
  assert.equal(row?.failClosed, true);
  assert.equal(row?.reason, 'UNCLASSIFIED_PATH');
  assert.equal(report.status, 'FAIL');
  assert.doesNotMatch(JSON.stringify(report), /unknown-provider-route-test-canary/);
});


test('boundary harness fails closed for ambiguous default tool surface route', () => {
  const report = runBoundarySimulation({ manifest: createBoundaryManifest() });
  const row = report.rows.find((item) => item.scenario === 'ambiguous tool surface route');
  assert.equal(row?.classification, 'fail_closed');
  assert.equal(row?.failClosed, true);
  assert.equal(row?.canp, 'UNKNOWN_BOUNDARY');
  assert.equal(row?.verdict, 'FAIL');
  assert.equal(row?.reason, 'AMBIGUOUS_PATH');
  assert.doesNotMatch(JSON.stringify(report), /ambiguous-tool-surface-canary/);
});
test('boundary harness fails closed for missing manifest', () => {
  const report = runBoundarySimulation({
    manifest: null,
    scenarios: [{
      scenario: 'committed route without manifest',
      pathId: 'model_input:committed',
      fact: 'missing-manifest-test-canary',
      bGotVia: 'committed_channel',
      committed: true
    }]
  });
  const row = report.rows[0];
  assert.equal(row?.canp, 'UNKNOWN_BOUNDARY');
  assert.equal(row?.verdict, 'FAIL');
  assert.equal(row?.classification, 'fail_closed');
  assert.equal(row?.failClosed, true);
  assert.equal(row?.reason, 'MISSING_OR_INVALID_MANIFEST');
  assert.equal(report.manifest_status, 'FAIL');
  assert.equal(report.manifest_hash, null);
  assert.equal(report.status, 'FAIL');
  assert.doesNotMatch(JSON.stringify(report), /missing-manifest-test-canary/);
});

test('boundary harness exposes false assurance for uninstrumented scratchpad clipboard and log', () => {
  const report = runBoundarySimulation({ manifest: createBoundaryManifest() });
  for (const scenario of ['scratchpad leak', 'clipboard leak', 'log leak']) {
    const row = report.rows.find((item) => item.scenario === scenario);
    assert.equal(row?.canp, 'FALSE_ASSURANCE');
    assert.equal(row?.verdict, 'FAIL');
    assert.equal(row?.classification, 'broken');
    assert.equal(row?.failClosed, true);
  }
});

test('boundary harness keeps committed clipboard route passing', () => {
  const report = runBoundarySimulation({ manifest: createBoundaryManifest() });
  const row = report.rows.find((item) => item.scenario === 'mitigated clipboard route-through-channel');
  assert.equal(row?.canp, 'CROSSED');
  assert.equal(row?.verdict, 'PASS');
  assert.equal(row?.classification, 'committed');
  assert.equal(row?.failClosed, false);
});

test('boundary path classifier fails closed for ambiguous provider tool path', () => {
  const manifest = createBoundaryManifest();
  assert.equal(boundaryClassifications.includes('fail_closed'), true);
  const surfaceOnly = classifyBoundaryPath(manifest, { surface: 'tool_result' });
  assert.equal(surfaceOnly.known, false);
  assert.equal(surfaceOnly.fail_closed, true);
  assert.equal(surfaceOnly.classification, 'fail_closed');
  assert.equal(surfaceOnly.canp, 'UNKNOWN_BOUNDARY');
  assert.equal(surfaceOnly.verdict, 'FAIL');
  assert.equal(surfaceOnly.reason, 'AMBIGUOUS_PATH');

  const unknownWithKnownSurface = classifyBoundaryPath(manifest, { path_id: 'provider_native:tool_result', surface: 'model_input' });
  assert.equal(unknownWithKnownSurface.known, false);
  assert.equal(unknownWithKnownSurface.fail_closed, true);
  assert.equal(unknownWithKnownSurface.classification, 'fail_closed');
  assert.equal(unknownWithKnownSurface.canp, 'UNKNOWN_BOUNDARY');
  assert.equal(unknownWithKnownSurface.verdict, 'FAIL');
  assert.equal(unknownWithKnownSurface.reason, 'UNCLASSIFIED_PATH');

  const mismatched = classifyBoundaryPath(manifest, { path_id: 'tool_result:committed', surface: 'scratchpad' });
  assert.equal(mismatched.known, false);
  assert.equal(mismatched.fail_closed, true);
  assert.equal(mismatched.classification, 'fail_closed');
  assert.equal(mismatched.canp, 'UNKNOWN_BOUNDARY');
  assert.equal(mismatched.verdict, 'FAIL');
  assert.equal(mismatched.reason, 'AMBIGUOUS_PATH');
});

test('boundary harness honesty text rejects provider deletion and model forgetting claims', () => {
  const report = runBoundarySimulation({ manifest: createBoundaryManifest() });
  assert.match(report.honesty_text, /does not prove provider deletion/);
  assert.match(report.honesty_text, /model forgetting/);
  assert.match(report.honesty_text, /semantic forgetting/);
});
test('createMemoryDriveHealthReport scores a fresh healthy vault at 90+ with no raw memory', async () => {
  const vault = createVault({ subjectId: 'subject-drive-health' });
  await remember({ vault, text: 'drive health private sentinel alpha', purpose: 'fixture', now: '2026-06-23T10:00:00.000Z' });
  await remember({ vault, text: 'drive health private sentinel beta', purpose: 'fixture', now: '2026-06-23T10:01:00.000Z' });
  const report = createMemoryDriveHealthReport({ vault, now: '2026-06-23T11:00:00.000Z' });

  assert.equal(report.schema, 'enigma.memory_drive_health_report.v1');
  assert.ok(report.overall_score >= 90, `expected overall_score >= 90, got ${report.overall_score}`);
  assert.equal(report.overall_status, 'healthy');
  assert.equal(report.transaction_submitted, false);
  assert.equal(report.raw_memory_on_chain, false);
  assert.equal(report.privacy_boundaries.private_payloads_included, false);
  assert.ok(report.roots.active_set_root.startsWith('sha256:'));
  assert.equal(report.source_root, `memory_root_${report.roots.active_set_root}`);
  assert.ok(report.report_ref.startsWith('health_report_sha256:'));
  assert.doesNotMatch(JSON.stringify(report), /drive health private sentinel/);
  const expectedMetrics = ['freshness', 'duplicate_rate', 'tombstone_risk', 'stale_derived_artifacts', 'retrieval_hit_rate', 'token_reduction', 'leakage_scan', 'receipt_coverage', 'connector_health', 'sync_fork_risk'];
  for (const name of expectedMetrics) {
    const metric = report.metrics[name];
    assert.ok(metric, `metric ${name} present`);
    assert.ok(['healthy', 'watch', 'degraded', 'critical'].includes(metric.status), `${name} has a valid status`);
    assert.ok(Number.isInteger(metric.score) && metric.score >= 0 && metric.score <= 100, `${name} score bounded integer`);
    assert.ok(Array.isArray(metric.evidence_refs) && metric.evidence_refs.length > 0, `${name} has public-safe evidence refs`);
    assert.ok(Array.isArray(metric.recommended_actions), `${name} has recommended actions`);
  }
});

test('createMemoryDriveHealthReport flags tombstones with stale derived refs as degraded or critical', async () => {
  const vault = createVault({ subjectId: 'subject-drive-decay' });
  const deleted = await remember({ vault, text: 'drive decay deleted sentinel gamma', purpose: 'fixture', now: '2026-06-23T10:00:00.000Z' });
  await remember({ vault, text: 'drive decay keeper sentinel delta', purpose: 'fixture', now: '2026-06-23T10:01:00.000Z' });
  const passport = createPassport({ vault, now: '2026-06-23T10:00:00.000Z' });
  const pack = await compileContextPack({ vault, passport, memory_addresses: [deleted.memory_addr], query: 'gamma', limit: 1, now: '2026-06-23T10:02:00.000Z' });
  await deleteMemory({ vault, memory_addr: deleted.memory_addr, reason: 'fixture-delete', now: '2026-06-23T10:05:00.000Z' });
  const report = createMemoryDriveHealthReport({ vault, contextPacks: [pack], now: '2026-06-23T11:00:00.000Z' });

  assert.ok(['degraded', 'critical'].includes(report.metrics.tombstone_risk.status), `tombstone_risk status was ${report.metrics.tombstone_risk.status}`);
  assert.ok(report.metrics.tombstone_risk.observed.derived_artifacts_referencing_tombstones >= 1, 'derived artifact references tombstoned ref');
  assert.ok(['degraded', 'critical'].includes(report.metrics.stale_derived_artifacts.status), `stale_derived_artifacts status was ${report.metrics.stale_derived_artifacts.status}`);
  assert.ok(report.metrics.stale_derived_artifacts.observed.stale_artifact_count >= 1, 'stale artifact counted');
  assert.ok(['degraded', 'critical'].includes(report.overall_status), `overall status was ${report.overall_status}`);
  assert.equal(report.proof_network_ready.eligible_for_anchor_batch, false);
  assert.ok(report.proof_network_ready.blocking_reasons.length > 0, 'anchor batch is blocked');
  assert.doesNotMatch(JSON.stringify(report), /drive decay.*sentinel/);
});

test('createMemoryDriveHealthReport never leaks raw memory text even when a raw context pack is supplied', async () => {
  const vault = createVault({ subjectId: 'subject-drive-leak' });
  const memory = await remember({ vault, text: 'never leak this raw memory body sentinel epsilon', purpose: 'fixture', now: '2026-06-23T10:00:00.000Z' });
  const passport = createPassport({ vault, now: '2026-06-23T10:00:00.000Z' });
  const pack = await compileContextPack({ vault, passport, memory_addresses: [memory.memory_addr], query: 'epsilon', limit: 1, now: '2026-06-23T10:02:00.000Z' });
  const report = createMemoryDriveHealthReport({
    vault,
    contextPacks: [pack],
    benchmarkSummary: { probe_count: 5, top_k: 3, hit_at_k: 0.9, exact_coverage: 0.9, abstention_correctness: 0.95 },
    connectorSummary: { connector_count: 1, healthy_connector_count: 1, lagging_connector_count: 0, error_rate_24h: 0, cursor_gap_count: 0 },
    now: '2026-06-23T11:00:00.000Z',
  });

  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /never leak this raw memory body sentinel epsilon/);
  assert.doesNotMatch(serialized, /content_ciphertext/);
  assert.equal(report.metrics.leakage_scan.status, 'healthy');
  assert.equal(report.metrics.leakage_scan.observed.forbidden_payload_key_hits, 0);
  assert.equal(report.metrics.leakage_scan.observed.secret_value_hits, 0);
});

test('createMemoryDriveHealthReport defaults gracefully when benchmark and connector inputs are missing', async () => {
  const vault = createVault({ subjectId: 'subject-drive-defaults' });
  await remember({ vault, text: 'defaults sentinel zeta', purpose: 'fixture', now: '2026-06-23T10:00:00.000Z' });
  const report = createMemoryDriveHealthReport({ vault, now: '2026-06-23T11:00:00.000Z' });

  assert.equal(report.metrics.retrieval_hit_rate.status, 'healthy');
  assert.equal(report.metrics.retrieval_hit_rate.observed.measured, false);
  assert.equal(report.metrics.connector_health.status, 'healthy');
  assert.equal(report.metrics.connector_health.observed.measured, false);
  assert.equal(report.metrics.sync_fork_risk.status, 'healthy');
  assert.equal(report.metrics.token_reduction.status, 'healthy');
  assert.ok(report.overall_score >= 90, `expected overall_score >= 90, got ${report.overall_score}`);
});
