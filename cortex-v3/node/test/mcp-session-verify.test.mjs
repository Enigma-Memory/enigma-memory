process.env.CORTEX_INITIAL_BUDGET = "1000";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { PublicKey, Keypair } from "@solana/web3.js";
import { handle } from "../src/mcp-server.mjs";
import { createStore } from "../src/store.mjs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TEST_KEY = "a".repeat(64);
const CAPABILITY_DISCRIMINATOR = Buffer.from([
  192, 140, 41, 92, 236, 64, 181, 99,
]);
const SESSION_DISCRIMINATOR = Buffer.from([
  243, 81, 72, 115, 214, 188, 72, 144,
]);

const CAPABILITY_REGISTRY_PROGRAM_ID = new PublicKey(
  "CiDwVBFgWV9E5MvXWoLgnEgn2hK7rJikbvfWavzAQz3"
);

// Scope bits matching capability_registry/src/lib.rs
const MEMORY_CREATE = 1 << 0;
const MEMORY_UPDATE = 1 << 1;
const MEMORY_DELETE = 1 << 2;
const BUDGET_SPEND = 1 << 3;

function writeLE32(buf, offset, value) {
  buf.writeUInt32LE(value, offset);
}

function writeLEI64(buf, offset, value) {
  buf.writeBigInt64LE(BigInt(value), offset);
}

function writeLE64(buf, offset, value) {
  buf.writeBigUInt64LE(BigInt.asUintN(64, BigInt(value)), offset);
}

function encodeCapability({
  owner,
  grantedTo,
  scope,
  expiresAt,
  createdAt,
  bump,
}) {
  const buf = Buffer.alloc(8 + 32 + 32 + 68 + 8 + 8 + 1);
  CAPABILITY_DISCRIMINATOR.copy(buf, 0);
  owner.toBuffer().copy(buf, 8);
  grantedTo.toBuffer().copy(buf, 40);
  const scopeBuf = Buffer.from(scope, "utf8");
  writeLE32(buf, 72, scopeBuf.length);
  scopeBuf.copy(buf, 76);
  writeLEI64(buf, 140, expiresAt);
  writeLEI64(buf, 148, createdAt);
  buf[156] = bump;
  return buf;
}

function encodeSession({
  owner,
  sessionKey,
  nonce,
  ownerNonce,
  scope,
  categoriesHash,
  maxSpendPerTx,
  maxSpendPerDay,
  spentToday,
  maxOpsPerDay,
  opsToday,
  windowStart,
  expiresAt,
  revoked,
  bump,
}) {
  const buf = Buffer.alloc(8 + 166);
  SESSION_DISCRIMINATOR.copy(buf, 0);
  owner.toBuffer().copy(buf, 8);
  sessionKey.toBuffer().copy(buf, 40);
  writeLE64(buf, 72, nonce);
  writeLE64(buf, 80, ownerNonce);
  writeLE32(buf, 88, scope);
  (categoriesHash || Buffer.alloc(32)).copy(buf, 92);
  writeLE64(buf, 124, maxSpendPerTx);
  writeLE64(buf, 132, maxSpendPerDay);
  writeLE64(buf, 140, spentToday);
  writeLE32(buf, 148, maxOpsPerDay);
  writeLE32(buf, 152, opsToday);
  writeLEI64(buf, 156, windowStart);
  writeLEI64(buf, 164, expiresAt);
  buf[172] = revoked ? 1 : 0;
  buf[173] = bump;
  return buf;
}

function deriveCapabilityPda(owner, grantedTo, scope) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("capability"),
      owner.toBuffer(),
      grantedTo.toBuffer(),
      Buffer.from(scope, "utf8"),
    ],
    CAPABILITY_REGISTRY_PROGRAM_ID
  )[0];
}

function deriveSessionPda(owner, sessionKey, nonce) {
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64LE(BigInt.asUintN(64, BigInt(nonce)));
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("session"),
      owner.toBuffer(),
      sessionKey.toBuffer(),
      nonceBuf,
    ],
    CAPABILITY_REGISTRY_PROGRAM_ID
  )[0];
}

describe("MCP on-chain session verification", () => {
  const owner = Keypair.generate();
  const sessionKey = Keypair.generate();
  const grantedTo = Keypair.generate();
  const nonce = 1;
  const capabilityScope = "memory:write,budget:spend";
  const capabilityPda = deriveCapabilityPda(
    owner.publicKey,
    grantedTo.publicKey,
    capabilityScope
  );
  const sessionPda = deriveSessionPda(
    owner.publicKey,
    sessionKey.publicKey,
    nonce
  );

  let baseAuth;
  let tmpDir;
  let store;

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "cortex-mcp-verify-"));
    store = createStore({ path: join(tmpDir, "store.sqlite"), key: TEST_KEY });
    baseAuth = {
      userId: owner.publicKey.toBase58(),
      scopes: ["memory:write", "budget:spend"],
      solana: {
        owner: owner.publicKey.toBase58(),
        sessionKey: sessionKey.publicKey.toBase58(),
        grantedTo: grantedTo.publicKey.toBase58(),
        nonce,
        capabilityScope,
        capabilityPda: capabilityPda.toBase58(),
        sessionPda: sessionPda.toBase58(),
      },
    };
  });

  after(() => {
    try {
      store?.close();
    } catch {}
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeConnection(overrides = {}) {
    const capability = overrides.capability ?? {
      owner: owner.publicKey,
      grantedTo: grantedTo.publicKey,
      scope: capabilityScope,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      createdAt: Math.floor(Date.now() / 1000) - 10,
      bump: 255,
    };
    const session = overrides.session ?? {
      owner: owner.publicKey,
      sessionKey: sessionKey.publicKey,
      nonce,
      ownerNonce: 0,
      scope: MEMORY_CREATE | MEMORY_UPDATE | MEMORY_DELETE | BUDGET_SPEND,
      categoriesHash: Buffer.alloc(32),
      maxSpendPerTx: 1_000_000,
      maxSpendPerDay: 10_000_000,
      spentToday: 0,
      maxOpsPerDay: 100,
      opsToday: 0,
      windowStart: Math.floor(Date.now() / 1000),
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      revoked: false,
      bump: 255,
    };

    return {
      async getAccountInfo(pubkey) {
        if (pubkey.toBase58() === capabilityPda.toBase58()) {
          return { data: encodeCapability(capability) };
        }
        if (pubkey.toBase58() === sessionPda.toBase58()) {
          return { data: encodeSession(session) };
        }
        return null;
      },
    };
  }

  async function callTool(name, args, auth, connection) {
    return handle(
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } },
      { auth, solanaConnection: connection, store }
    );
  }

  it("allows a valid capability/session for memory:write", async () => {
    const connection = makeConnection();
    const result = await callTool(
      "store_memory",
      { id: "m1", text: "hello", owner: "alice" },
      baseAuth,
      connection
    );
    assert.equal(result.content[0].text, JSON.stringify({ ok: true, id: "m1" }));
  });

  it("allows a valid capability/session for budget:spend", async () => {
    const connection = makeConnection();
    const result = await callTool(
      "spend_budget",
      { user_id: "alice", amount: 1 },
      baseAuth,
      connection
    );
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.ok, true);
  });

  it("rejects an expired capability", async () => {
    const connection = makeConnection({
      capability: {
        owner: owner.publicKey,
        grantedTo: grantedTo.publicKey,
        scope: capabilityScope,
        expiresAt: Math.floor(Date.now() / 1000) - 10,
        createdAt: Math.floor(Date.now() / 1000) - 3600,
        bump: 255,
      },
    });
    await assert.rejects(
      () =>
        callTool(
          "store_memory",
          { id: "m1", text: "hello", owner: "alice" },
          baseAuth,
          connection
        ),
      /Capability expired/
    );
  });

  it("rejects a revoked session", async () => {
    const connection = makeConnection({
      session: {
        owner: owner.publicKey,
        sessionKey: sessionKey.publicKey,
        nonce,
        ownerNonce: 0,
        scope: MEMORY_CREATE | MEMORY_UPDATE | MEMORY_DELETE | BUDGET_SPEND,
        categoriesHash: Buffer.alloc(32),
        maxSpendPerTx: 1_000_000,
        maxSpendPerDay: 10_000_000,
        spentToday: 0,
        maxOpsPerDay: 100,
        opsToday: 0,
        windowStart: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        revoked: true,
        bump: 255,
      },
    });
    await assert.rejects(
      () =>
        callTool(
          "store_memory",
          { id: "m1", text: "hello", owner: "alice" },
          baseAuth,
          connection
        ),
      /Session revoked/
    );
  });

  it("rejects an expired session", async () => {
    const connection = makeConnection({
      session: {
        owner: owner.publicKey,
        sessionKey: sessionKey.publicKey,
        nonce,
        ownerNonce: 0,
        scope: MEMORY_CREATE | MEMORY_UPDATE | MEMORY_DELETE | BUDGET_SPEND,
        categoriesHash: Buffer.alloc(32),
        maxSpendPerTx: 1_000_000,
        maxSpendPerDay: 10_000_000,
        spentToday: 0,
        maxOpsPerDay: 100,
        opsToday: 0,
        windowStart: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) - 10,
        revoked: false,
        bump: 255,
      },
    });
    await assert.rejects(
      () =>
        callTool(
          "store_memory",
          { id: "m1", text: "hello", owner: "alice" },
          baseAuth,
          connection
        ),
      /Session expired/
    );
  });

  it("rejects a scope-mismatched session", async () => {
    const connection = makeConnection({
      session: {
        owner: owner.publicKey,
        sessionKey: sessionKey.publicKey,
        nonce,
        ownerNonce: 0,
        scope: BUDGET_SPEND,
        categoriesHash: Buffer.alloc(32),
        maxSpendPerTx: 1_000_000,
        maxSpendPerDay: 10_000_000,
        spentToday: 0,
        maxOpsPerDay: 100,
        opsToday: 0,
        windowStart: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        revoked: false,
        bump: 255,
      },
    });
    await assert.rejects(
      () =>
        callTool(
          "store_memory",
          { id: "m1", text: "hello", owner: "alice" },
          baseAuth,
          connection
        ),
      /Session scope not granted/
    );
  });

  it("rejects missing on-chain accounts", async () => {
    const connection = { async getAccountInfo() { return null; } };
    await assert.rejects(
      () =>
        callTool(
          "store_memory",
          { id: "m1", text: "hello", owner: "alice" },
          baseAuth,
          connection
        ),
      /Capability not found on-chain/
    );
  });

  it("rejects a PDA address mismatch", async () => {
    const badAuth = {
      ...baseAuth,
      solana: {
        ...baseAuth.solana,
        capabilityPda: Keypair.generate().publicKey.toBase58(),
      },
    };
    const connection = makeConnection();
    await assert.rejects(
      () =>
        callTool(
          "store_memory",
          { id: "m1", text: "hello", owner: "alice" },
          badAuth,
          connection
        ),
      /Capability PDA mismatch/
    );
  });

  it("skips verification when no Solana context is provided", async () => {
    const result = await callTool(
      "store_memory",
      { id: "m1", text: "hello", owner: "alice" },
      { userId: "anon", scopes: ["*"] },
      null
    );
    assert.equal(result.content[0].text, JSON.stringify({ ok: true, id: "m1" }));
  });
});
