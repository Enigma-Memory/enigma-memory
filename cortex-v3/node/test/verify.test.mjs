import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildMemoryMerkleTree,
  verify,
  MemoryMerkleVerifier,
  recordsFromStore,
  createMemoryVerifier,
} from "../src/verify.mjs";
import { proveSearchMemory, verifySearchMemory } from "../src/verify-guest.mjs";
import { createStore } from "../src/store.mjs";

const TEST_KEY = "b".repeat(64);

describe("MemoryMerkleVerifier", () => {
  it("builds an empty tree with a default root", () => {
    const tree = buildMemoryMerkleTree([]);
    assert.equal(typeof tree.root, "string");
    assert.equal(tree.root.length, 64);
    assert.equal(tree.prove("missing"), undefined);
    assert.equal(
      verify("missing", {
        root: tree.root,
        record: { ciphertext: "", iv: "", tag: "" },
        siblings: [],
        index: 0,
      }),
      false
    );
  });

  it("proves and verifies inclusion for a single record", () => {
    const records = [
      {
        key: "k1",
        ciphertext: "ct1",
        iv: "iv1",
        tag: "tag1",
      },
    ];
    const tree = buildMemoryMerkleTree(records);
    const proof = tree.prove("k1");
    assert.ok(proof);
    assert.equal(proof.root, tree.root);
    assert.equal(proof.siblings.length, 0);
    assert.ok(verify("k1", proof));
  });

  it("proves and verifies inclusion for many records", () => {
    const records = Array.from({ length: 7 }, (_, i) => ({
      key: `memory-${i}`,
      ciphertext: Buffer.from(`ct-${i}`).toString("base64"),
      iv: Buffer.from(`iv-${i}`).toString("base64"),
      tag: Buffer.from(`tag-${i}`).toString("base64"),
    }));
    const tree = buildMemoryMerkleTree(records);
    for (const record of records) {
      const proof = tree.prove(record.key);
      assert.ok(proof, `proof exists for ${record.key}`);
      assert.equal(proof.root, tree.root);
      assert.ok(verify(record.key, proof), `verifies for ${record.key}`);
    }
  });

  it("rejects a tampered record", () => {
    const records = [
      {
        key: "k1",
        ciphertext: "ct1",
        iv: "iv1",
        tag: "tag1",
      },
      {
        key: "k2",
        ciphertext: "ct2",
        iv: "iv2",
        tag: "tag2",
      },
    ];
    const tree = buildMemoryMerkleTree(records);
    const proof = tree.prove("k1");
    proof.record.ciphertext = "tampered";
    assert.equal(verify("k1", proof), false);
  });

  it("rejects a proof with a wrong root", () => {
    const records = [
      {
        key: "k1",
        ciphertext: "ct1",
        iv: "iv1",
        tag: "tag1",
      },
    ];
    const tree = buildMemoryMerkleTree(records);
    const proof = tree.prove("k1");
    proof.root = "0".repeat(64);
    assert.equal(verify("k1", proof), false);
  });

  it("is deterministic: same records produce same root", () => {
    const records = [
      {
        key: "b",
        ciphertext: "ctb",
        iv: "ivb",
        tag: "tagb",
      },
      {
        key: "a",
        ciphertext: "cta",
        iv: "iva",
        tag: "taga",
      },
    ];
    const tree1 = buildMemoryMerkleTree(records);
    const tree2 = buildMemoryMerkleTree([records[1], records[0]]);
    assert.equal(tree1.root, tree2.root);
  });

  it("exposes the same API via the class wrapper", () => {
    const records = [
      {
        key: "k1",
        ciphertext: "ct1",
        iv: "iv1",
        tag: "tag1",
      },
    ];
    const verifier = new MemoryMerkleVerifier(records);
    const proof = verifier.prove("k1");
    assert.equal(proof.root, verifier.root);
    assert.ok(verify("k1", proof));
  });
});

describe("recordsFromStore / createMemoryVerifier", () => {
  let tmpDir;
  let store;

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "cortex-verify-"));
  });

  after(() => {
    store?.close();
  });

  it("reads encrypted records and proves inclusion", () => {
    const path = join(tmpDir, "verify.sqlite");
    store = createStore({ path, key: TEST_KEY });
    store.put("alice/fact-1", { text: "hello world", owner: "alice" });
    store.put("bob/fact-2", { text: "goodbye moon", owner: "bob" });

    const records = recordsFromStore(store);
    assert.equal(records.length, 2);
    assert.ok(
      records.every(
        (r) =>
          typeof r.key === "string" &&
          typeof r.ciphertext === "string" &&
          typeof r.iv === "string" &&
          typeof r.tag === "string"
      )
    );

    const verifier = createMemoryVerifier(store);
    const proof = verifier.prove("alice/fact-1");
    assert.ok(proof);
    assert.equal(proof.root, verifier.root);
    assert.ok(verify("alice/fact-1", proof));
  });
});

describe("search_memory guest stub", () => {
  function vec(x) {
    return new Float32Array([x, 1 - x]);
  }

  it("returns deterministic top-K results", () => {
    const corpus = [
      { id: "m1", contentHash: "h1", embedding: vec(0.9) },
      { id: "m2", contentHash: "h2", embedding: vec(0.5) },
      { id: "m3", contentHash: "h3", embedding: vec(0.1) },
    ];
    const query = vec(1.0);
    const { result, commitment } = proveSearchMemory({
      queryEmbedding: query,
      corpus,
      topK: 2,
      corpusCommitment: "deadbeef",
      capabilityPda: "cap1",
    });

    assert.equal(result.length, 2);
    assert.equal(result[0].id, "m1");
    assert.equal(result[1].id, "m2");
    assert.equal(typeof commitment, "string");
    assert.equal(commitment.length, 64);

    assert.ok(
      verifySearchMemory({
        queryEmbedding: query,
        corpusCommitment: "deadbeef",
        capabilityPda: "cap1",
        topK: 2,
        result,
        commitment,
      })
    );
  });

  it("rejects a tampered search result", () => {
    const corpus = [
      { id: "m1", contentHash: "h1", embedding: vec(0.9) },
      { id: "m2", contentHash: "h2", embedding: vec(0.5) },
    ];
    const query = vec(1.0);
    const { result, commitment } = proveSearchMemory({
      queryEmbedding: query,
      corpus,
      topK: 1,
    });

    const tampered = [{ id: "m2", contentHash: "h2", score: result[0].score }];
    assert.equal(
      verifySearchMemory({
        queryEmbedding: query,
        corpusCommitment: "",
        topK: 1,
        result: tampered,
        commitment,
      }),
      false
    );
  });

  it("uses id tie-breaker for equal scores", () => {
    const corpus = [
      { id: "m2", contentHash: "h2", embedding: vec(0.5) },
      { id: "m1", contentHash: "h1", embedding: vec(0.5) },
    ];
    const query = vec(1.0);
    const { result } = proveSearchMemory({
      queryEmbedding: query,
      corpus,
      topK: 1,
    });
    assert.equal(result[0].id, "m1");
  });

  it("throws on invalid inputs", () => {
    assert.throws(() =>
      proveSearchMemory({ corpus: "bad", topK: 1, queryEmbedding: [] })
    );
    assert.throws(() =>
      proveSearchMemory({ corpus: [], topK: 0, queryEmbedding: [] })
    );
  });
});
