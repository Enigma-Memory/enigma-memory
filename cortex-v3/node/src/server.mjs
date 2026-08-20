import { createServer } from "node:http";
import { isOAuthRoute, handleOAuthRequest } from "./oauth-server.mjs";
import { createAutoSaveEngine } from "./auto-save.mjs";
import { createStore, deriveDataEncryptionKey } from "./store.mjs";
import { createEmbedder } from "./embed.mjs";
import { verifyOnChainSession } from "./mcp-server.mjs";
import { resolve, dirname, join } from "node:path";
import { mkdirSync } from "node:fs";

// Fixed test entropy used only when no wallet entropy is configured. This
// makes local/test stores deterministic and reproducible, but it is NOT
// secrets-manager grade: any party that knows this constant can derive the
// same per-user keys. Production deployments MUST supply wallet entropy via
// options.getOwnerEntropy.
const TEST_MASTER_ENTROPY = Buffer.from(
  "cortex-deterministic-test-master-entropy-v1",
  "utf8"
);

function getOwnerEntropy(owner, options = {}) {
  if (typeof options.getOwnerEntropy === "function") {
    return options.getOwnerEntropy(owner);
  }
  return null;
}

function deriveDekForOwner(owner, options = {}) {
  const entropy = getOwnerEntropy(owner, options);
  if (entropy) {
    return deriveDataEncryptionKey(entropy, options.passphrase);
  }
  return deriveDataEncryptionKey(TEST_MASTER_ENTROPY, owner);
}

function makeUserStorePath(owner, options = {}) {
  if (options.storePath) {
    return join(options.storePath, `${owner}.sqlite`);
  }
  return resolve(`data/cortex-stores/${owner}.sqlite`);
}

function getStoreForOwner(owner, options = {}) {
  if (options.store) {
    return options.store;
  }
  const stores = options.stores ?? (options.stores = new Map());
  if (stores.has(owner)) {
    return stores.get(owner);
  }
  const dek = deriveDekForOwner(owner, options);
  const path = makeUserStorePath(owner, options);
  mkdirSync(dirname(path), { recursive: true });
  const store = createStore({ path, dek });
  stores.set(owner, store);
  return store;
}

function authFromRequest(req) {
  const owner = req.headers["x-cortex-owner"];
  const sessionKey = req.headers["x-cortex-session-key"];
  if (!owner || !sessionKey) return null;
  return {
    userId: owner,
    scopes: ["*"],
    solana: {
      owner,
      sessionKey,
      nonce: req.headers["x-cortex-nonce"],
      capabilityScope: req.headers["x-cortex-capability-scope"],
      grantedTo: req.headers["x-cortex-granted-to"],
      capabilityPda: req.headers["x-cortex-capability-pda"],
      sessionPda: req.headers["x-cortex-session-pda"],
    },
  };
}

function actionForEndpoint(method, pathname) {
  if (method === "POST" && (pathname === "/ingest" || pathname === "/auto-save")) {
    return "store_memory";
  }
  if (
    (method === "GET" && pathname.startsWith("/retrieve/")) ||
    pathname === "/search" ||
    (method === "POST" && pathname === "/search")
  ) {
    return "retrieve_memory";
  }
  return null;
}

async function maybeVerifySession(req, method, pathname, options) {
  if (options.skipSessionVerification) return;
  const auth = authFromRequest(req);
  if (!auth) return;
  const action = actionForEndpoint(method, pathname);
  if (!action) return;
  await verifyOnChainSession(auth, action, options);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function cosineSimilarity(a, b) {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

async function semanticSearch(store, embedder, query, topK) {
  const queryVector = await embedder(query);
  const embeddings = store.getAllEmbeddings();
  const scored = embeddings.map(({ key, vector }) => ({
    key,
    score: cosineSimilarity(queryVector, vector),
  }));
  scored.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  return scored.slice(0, topK).map(({ key, score }) => ({
    score: Number(score.toFixed(6)),
    memory: store.get(key),
  }));
}

export function startServer(port = 3000, options = {}) {
  if (options && typeof options.put === "function") {
    options = { store: options };
  }
  const systemStore = options.store || createStore();
  const embedder = options.embedder || createEmbedder();
  const autoSaveEngine = options.autoSaveEngine;
  const defaultAutoSave =
    autoSaveEngine || createAutoSaveEngine({ store: systemStore, embedder });
  const topK = options.topK ?? 10;

  function getAutoSaveForOwner(owner) {
    if (autoSaveEngine) return autoSaveEngine;
    const store = getStoreForOwner(owner, options);
    return createAutoSaveEngine({ store, embedder });
  }

  const server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");

    const baseUrl = `http://${req.headers.host || "localhost"}`;
    const url = new URL(req.url, baseUrl);
    const pathname = url.pathname;

    if (isOAuthRoute(pathname)) {
      return handleOAuthRequest(req, res, systemStore, baseUrl);
    }

    if (req.method === "GET" && pathname === "/health") {
      res.writeHead(200);
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (req.method === "POST" && pathname === "/ingest") {
      try {
        await maybeVerifySession(req, req.method, pathname, options);
        const body = await readBody(req);
        const { id, text, owner } = JSON.parse(body);
        if (!id || !text || !owner) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "missing fields" }));
          return;
        }
        const auth = authFromRequest(req);
        const store = auth?.userId
          ? getStoreForOwner(auth.userId, options)
          : systemStore;
        store.put(id, { id, text, owner, createdAt: Date.now() });
        try {
          const vector = await embedder(text);
          store.putEmbedding(id, vector);
        } catch (err) {
          console.error("Embedding generation failed:", err.message);
        }
        res.writeHead(201);
        res.end(JSON.stringify({ ok: true, id }));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (req.method === "GET" && pathname.startsWith("/retrieve/")) {
      try {
        await maybeVerifySession(req, req.method, pathname, options);
        const id = pathname.slice("/retrieve/".length);
        const auth = authFromRequest(req);
        const store = auth?.userId
          ? getStoreForOwner(auth.userId, options)
          : systemStore;
        const memory = store.get(id);
        if (!memory) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: "not found" }));
          return;
        }
        res.writeHead(200);
        res.end(JSON.stringify(memory));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (req.method === "GET" && pathname === "/search") {
      try {
        await maybeVerifySession(req, req.method, pathname, options);
        const query = url.searchParams.get("query") || url.searchParams.get("q");
        if (!query) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "missing query" }));
          return;
        }
        const auth = authFromRequest(req);
        const store = auth?.userId
          ? getStoreForOwner(auth.userId, options)
          : systemStore;
        const results = await semanticSearch(store, embedder, query, topK);
        res.writeHead(200);
        res.end(JSON.stringify({ query, results }));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }
    if (req.method === "POST" && pathname === "/search") {
      try {
        await maybeVerifySession(req, req.method, pathname, options);
        const body = await readBody(req);
        const { query } = JSON.parse(body);
        if (!query) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "missing query" }));
          return;
        }
        const auth = authFromRequest(req);
        const store = auth?.userId
          ? getStoreForOwner(auth.userId, options)
          : systemStore;
        const results = await semanticSearch(store, embedder, query, topK);
        res.writeHead(200);
        res.end(JSON.stringify({ query, results }));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (req.method === "POST" && pathname === "/auto-save") {
      try {
        await maybeVerifySession(req, req.method, pathname, options);
        const body = await readBody(req);
        const { text, owner, tags, turnId } = JSON.parse(body);
        if (!text || !owner) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "missing fields" }));
          return;
        }
        const auth = authFromRequest(req);
        const autoSave = auth?.userId
          ? getAutoSaveForOwner(auth.userId)
          : defaultAutoSave;
        const result = await autoSave.processTurn({
          text,
          owner,
          tags,
          turnId,
        });
        res.writeHead(200);
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (req.method === "GET" && pathname.startsWith("/search/")) {
      const prefix = pathname.slice("/search/".length);
      const auth = authFromRequest(req);
      const store = auth?.userId
        ? getStoreForOwner(auth.userId, options)
        : systemStore;
      const matches = store.search(prefix);
      res.writeHead(200);
      res.end(JSON.stringify(matches));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: "not found" }));
  });

  server.on("close", () => {
    try {
      systemStore.close();
    } catch {}
    if (options.stores) {
      for (const store of options.stores.values()) {
        try {
          store.close();
        } catch {}
      }
    }
  });

  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = await startServer(
    Number(process.env.CORTEX_NODE_PORT) || Number(process.env.PORT) || 3000
  );
  console.log(`Cortex node listening on ${server.address().port}`);
}
