import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../src/server.mjs";
import { createStore, deriveDataEncryptionKey } from "../src/store.mjs";

const TEST_KEY = "a".repeat(64);
const tmpDir = mkdtempSync(join(tmpdir(), "cortex-http-"));
const storePath = join(tmpDir, "http-store.sqlite");

describe("HTTP node integration", () => {
  let server;
  let port;
  let store;

  function freshStore() {
    return createStore({ path: storePath, key: TEST_KEY });
  }

  it("starts and reports health", async () => {
    store = freshStore();
    server = await startServer(0, store);
    port = server.address().port;
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, "ok");
  });

  it("ingests and retrieves a memory", async () => {
    const memory = { id: "mem-1", text: "hello world", owner: "alice" };
    const post = await fetch(`http://127.0.0.1:${port}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(memory),
    });
    assert.equal(post.status, 201);

    const get = await fetch(`http://127.0.0.1:${port}/retrieve/mem-1`);
    assert.equal(get.status, 200);
    const got = await get.json();
    assert.equal(got.text, "hello world");
    assert.equal(got.owner, "alice");
  });

  it("returns 404 for missing memory", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/retrieve/nope`);
    assert.equal(res.status, 404);
  });

  it("rejects ingest without required fields", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "x" }),
    });
    assert.equal(res.status, 400);
  });

  it("searches memories by prefix", async () => {
    await fetch(`http://127.0.0.1:${port}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "search/a", text: "alpha", owner: "alice" }),
    });
    await fetch(`http://127.0.0.1:${port}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "search/b", text: "beta", owner: "bob" }),
    });
    const res = await fetch(`http://127.0.0.1:${port}/search/search/`);
    assert.equal(res.status, 200);
    const matches = await res.json();
    assert.equal(matches.length, 2);
  });

  it("survives a server restart", async () => {
    server.close();
    store.close();
    store = freshStore();
    const restarted = await startServer(0, store);
    server = restarted;
    port = restarted.address().port;
    const res = await fetch(`http://127.0.0.1:${port}/retrieve/mem-1`);
    assert.equal(res.status, 200);
    const got = await res.json();
    assert.equal(got.text, "hello world");
  });

  after(() => {
    server?.close();
    store?.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });
});

function makeTestEmbedder(dimensions = 128) {
  return async function embed(text) {
    const vec = new Float32Array(dimensions);
    const words =
      String(text)
        .toLowerCase()
        .match(/\b[a-z]+\b/g) || [];
    for (const word of words) {
      let hash = 5381;
      for (const ch of word) {
        hash = (hash << 5) + hash + ch.charCodeAt(0);
      }
      const idx = Math.abs(hash) % dimensions;
      vec[idx] += 1;
    }
    let sum = 0;
    for (const v of vec) sum += v * v;
    const norm = Math.sqrt(sum);
    if (norm > 0) {
      for (let i = 0; i < dimensions; i += 1) {
        vec[i] /= norm;
      }
    }
    return vec;
  };
}

describe("semantic search", () => {
  let server;
  let port;
  let store;
  let semanticStorePath;
  let tmpDir2;

  before(() => {
    tmpDir2 = mkdtempSync(join(tmpdir(), "cortex-semantic-"));
    semanticStorePath = join(tmpDir2, "semantic-store.sqlite");
    store = createStore({ path: semanticStorePath, key: TEST_KEY });
  });

  it("starts with an injected embedder", async () => {
    server = await startServer(0, {
      store,
      embedder: makeTestEmbedder(),
      topK: 3,
    });
    port = server.address().port;
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(health.status, 200);
  });

  async function ingest(id, text, owner) {
    const res = await fetch(`http://127.0.0.1:${port}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, text, owner }),
    });
    assert.equal(res.status, 201);
  }

  it("finds similar memories via POST /search", async () => {
    await ingest("sem-apple", "apple pie recipe", "alice");
    await ingest("sem-car", "how to drive a car", "bob");
    await ingest("sem-fruit", "fresh fruit salad", "carol");

    const res = await fetch(`http://127.0.0.1:${port}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "baking apple tart" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.results));
    assert.equal(body.results[0].memory.id, "sem-apple");
  });

  it("finds similar memories via GET /search?query=...", async () => {
    const res = await fetch(
      `http://127.0.0.1:${port}/search?query=car%20repair`
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.results));
    assert.equal(body.results[0].memory.id, "sem-car");
  });

  it("does not break prefix search", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/search/sem-c`);
    assert.equal(res.status, 200);
    const matches = await res.json();
    const keys = matches.map((m) => m.key).sort();
    assert.deepEqual(keys, ["sem-car"]);
  });

  after(() => {
    server?.close();
    store?.close();
    rmSync(tmpDir2, { recursive: true, force: true });
  });
});

describe("auto-save endpoint", () => {
  let server;
  let port;
  let store;
  let autoSaveTmpDir;
  let autoSaveStorePath;

  before(async () => {
    autoSaveTmpDir = mkdtempSync(join(tmpdir(), "cortex-autosave-http-"));
    autoSaveStorePath = join(autoSaveTmpDir, "autosave-http-store.sqlite");
    store = createStore({ path: autoSaveStorePath, key: TEST_KEY });
    server = await startServer(0, { store, embedder: makeTestEmbedder(8) });
    port = server.address().port;
  });

  it("auto-saves calendar facts", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/auto-save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        owner: "alice",
        text: "I'm flying to Berlin on July 10 for a conference.",
        turnId: "http-turn-1",
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.saved.length, 1);
    assert.equal(body.saved[0].category, "calendar");
  });

  it("blocks medical facts by default", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/auto-save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        owner: "bob",
        text: "My doctor prescribed lisinopril for blood pressure.",
        turnId: "http-turn-2",
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.saved.length, 0);
    assert.ok(body.blocked.length >= 1);
    assert.ok(body.blocked.some((b) => b.category === "medical"));
  });

  it("rejects auto-save without required fields", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/auto-save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "no owner" }),
    });
    assert.equal(res.status, 400);
  });

  after(() => {
    server?.close();
    store?.close();
    rmSync(autoSaveTmpDir, { recursive: true, force: true });
  });
});

describe("encryption isolation", () => {
  let isoTmpDir;

  before(() => {
    isoTmpDir = mkdtempSync(join(tmpdir(), "cortex-iso-"));
  });

  after(() => {
    rmSync(isoTmpDir, { recursive: true, force: true });
  });

  it("derives a 32-byte DEK from wallet entropy", () => {
    const dek = deriveDataEncryptionKey(Buffer.from("alice-wallet-seed"));
    assert.ok(Buffer.isBuffer(dek));
    assert.equal(dek.length, 32);
  });

  it("derives different DEKs for different owners", () => {
    const alice = deriveDataEncryptionKey(Buffer.from("alice-wallet-seed"));
    const bob = deriveDataEncryptionKey(Buffer.from("bob-wallet-seed"));
    assert.notDeepEqual(alice, bob);
  });

  it("derives different DEKs with and without passphrase", () => {
    const without = deriveDataEncryptionKey(Buffer.from("alice-wallet-seed"));
    const withPass = deriveDataEncryptionKey(
      Buffer.from("alice-wallet-seed"),
      "passphrase"
    );
    assert.notDeepEqual(without, withPass);
  });

  it("two users' stores cannot decrypt each other", () => {
    const alicePath = join(isoTmpDir, "alice-isolated.sqlite");
    const bobPath = join(isoTmpDir, "bob-isolated.sqlite");
    const aliceDek = deriveDataEncryptionKey(Buffer.from("alice-wallet-seed"));
    const bobDek = deriveDataEncryptionKey(Buffer.from("bob-wallet-seed"));

    const aliceStore = createStore({ path: alicePath, dek: aliceDek });
    aliceStore.put("secret", { text: "alice secret", owner: "alice" });
    aliceStore.close();

    const bobStore = createStore({ path: alicePath, dek: bobDek });
    assert.throws(() => bobStore.get("secret"), /bad decrypt|wrong final block length|Unsupported state/i);
    bobStore.close();
  });

  it("operator default key cannot decrypt a user-derived key", () => {
    const userPath = join(isoTmpDir, "user-isolated.sqlite");
    const userDek = deriveDataEncryptionKey(Buffer.from("user-wallet-seed"));

    const userStore = createStore({ path: userPath, dek: userDek });
    userStore.put("secret", { text: "user secret", owner: "user" });
    userStore.close();

    const operatorStore = createStore({ path: userPath });
    assert.throws(() => operatorStore.get("secret"), /bad decrypt|wrong final block length|Unsupported state/i);
    operatorStore.close();
  });

  it("HTTP server isolates authenticated users' memories", async () => {
    const serverTmpDir = join(isoTmpDir, "http-auth");
    const entropyMap = {
      alice: Buffer.from("alice-http-wallet-seed"),
      bob: Buffer.from("bob-http-wallet-seed"),
    };
    const server = await startServer(0, {
      storePath: serverTmpDir,
      skipSessionVerification: true,
      getOwnerEntropy: (owner) => entropyMap[owner] ?? null,
      embedder: makeTestEmbedder(),
    });
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;
    try {
      const aliceHeaders = {
        "Content-Type": "application/json",
        "x-cortex-owner": "alice",
        "x-cortex-session-key": "alice-session",
      };
      const bobHeaders = {
        "Content-Type": "application/json",
        "x-cortex-owner": "bob",
        "x-cortex-session-key": "bob-session",
      };

      const alicePost = await fetch(`${baseUrl}/ingest`, {
        method: "POST",
        headers: aliceHeaders,
        body: JSON.stringify({
          id: "iso-mem-1",
          text: "alice hidden note",
          owner: "alice",
        }),
      });
      assert.equal(alicePost.status, 201);

      const aliceGet = await fetch(`${baseUrl}/retrieve/iso-mem-1`, {
        headers: aliceHeaders,
      });
      assert.equal(aliceGet.status, 200);
      const aliceBody = await aliceGet.json();
      assert.equal(aliceBody.text, "alice hidden note");

      const bobGet = await fetch(`${baseUrl}/retrieve/iso-mem-1`, {
        headers: bobHeaders,
      });
      assert.equal(bobGet.status, 404);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
