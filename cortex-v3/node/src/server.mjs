import { createServer } from "node:http";
import { isOAuthRoute, handleOAuthRequest } from "./oauth-server.mjs";
import { createAutoSaveEngine } from "./auto-save.mjs";
import { createStore } from "./store.mjs";
import { createEmbedder } from "./embed.mjs";
import { verifyOnChainSession } from "./mcp-server.mjs";


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
  const store = options.store || createStore();
  const embedder = options.embedder || createEmbedder();
  const autoSave =
    options.autoSaveEngine || createAutoSaveEngine({ store, embedder });
  const topK = options.topK ?? 10;

  const server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");

    const baseUrl = `http://${req.headers.host || "localhost"}`;
    const url = new URL(req.url, baseUrl);
    const pathname = url.pathname;

    if (isOAuthRoute(pathname)) {
      return handleOAuthRequest(req, res, store, baseUrl);
    }

    if (req.method === "GET" && pathname === "/health") {
      res.writeHead(200);
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (req.method === "POST" && pathname === "/ingest") {
      try {
        await maybeVerifySession(req, req.method, pathname, { solanaConnection: options.solanaConnection });
        const body = await readBody(req);
        const { id, text, owner } = JSON.parse(body);
        if (!id || !text || !owner) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "missing fields" }));
          return;
        }
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
        await maybeVerifySession(req, req.method, pathname, { solanaConnection: options.solanaConnection });
        const id = pathname.slice("/retrieve/".length);
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
        await maybeVerifySession(req, req.method, pathname, { solanaConnection: options.solanaConnection });
        const query = url.searchParams.get("query") || url.searchParams.get("q");
        if (!query) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "missing query" }));
          return;
        }
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
        await maybeVerifySession(req, req.method, pathname, { solanaConnection: options.solanaConnection });
        const body = await readBody(req);
        const { query } = JSON.parse(body);
        if (!query) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "missing query" }));
          return;
        }
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
        await maybeVerifySession(req, req.method, pathname, { solanaConnection: options.solanaConnection });
        const body = await readBody(req);
        const { text, owner, tags, turnId } = JSON.parse(body);
        if (!text || !owner) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "missing fields" }));
          return;
        }
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
      store.close();
    } catch {}
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
