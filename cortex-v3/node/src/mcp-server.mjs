import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { randomUUID, createHmac } from "node:crypto";
import { createStore } from "./store.mjs";
import { createEmbedder } from "./embed.mjs";

let defaultStore;
let defaultEmbedder;

function getStore(options = {}) {
  return options.store ?? (defaultStore ??= createStore());
}

function getEmbedder(options = {}) {
  return options.embedder ?? (defaultEmbedder ??= createEmbedder());
}

const PROTOCOL_VERSION = "2024-11-05";

const TOOLS = [
  {
    name: "store_memory",
    description: "Store a memory in the Cortex vault",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        text: { type: "string" },
        owner: { type: "string" },
      },
      required: ["id", "text", "owner"],
    },
  },
  {
    name: "retrieve_memory",
    description: "Retrieve a memory from the Cortex vault",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "search_memory",
    description: "Search memories by key prefix or across all memories",
    inputSchema: {
      type: "object",
      properties: {
        prefix: { type: "string" },
        owner: { type: "string" },
      },
    },
  },
  {
    name: "add_memory",
    description: "Add a memory to the Cortex vault and index it for search",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        text: { type: "string" },
        owner: { type: "string" },
      },
      required: ["id", "text", "owner"],
    },
  },
  {
    name: "update_memory",
    description: "Update an existing memory in the Cortex vault",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        text: { type: "string" },
        owner: { type: "string" },
      },
      required: ["id", "text", "owner"],
    },
  },
  {
    name: "delete_memory",
    description: "Delete a memory from the Cortex vault",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "spend_budget",
    description: "Spend budget on behalf of a user",
    inputSchema: {
      type: "object",
      properties: {
        user_id: { type: "string" },
        amount: { type: "number" },
      },
      required: ["user_id", "amount"],
    },
  },
  {
    name: "prove_capability",
    description: "Issue a capability attestation for a model",
    inputSchema: {
      type: "object",
      properties: {
        model_id: { type: "string" },
        scopes: {
          oneOf: [
            { type: "string" },
            { type: "array", items: { type: "string" } },
          ],
        },
      },
      required: ["model_id", "scopes"],
    },
  },
];

const RESOURCE_TEMPLATES = [
  {
    uriTemplate: "cortex://memory/{user_id}",
    name: "User memories",
    mimeType: "application/json",
  },
  {
    uriTemplate: "cortex://budget/{user_id}",
    name: "User budget",
    mimeType: "application/json",
  },
  {
    uriTemplate: "cortex://capability/{model_id}",
    name: "Model capability attestation",
    mimeType: "application/json",
  },
];

const TOOL_SCOPES = {
  store_memory: "memory:write",
  retrieve_memory: "memory:read",
  search_memory: "memory:read",
  add_memory: "memory:write",
  update_memory: "memory:write",
  delete_memory: "memory:write",
  spend_budget: "budget:spend",
  prove_capability: "capability:grant",
};

const RESOURCE_SCOPES = {
  "cortex://memory/{user_id}": "memory:read",
  "cortex://budget/{user_id}": "budget:spend",
  "cortex://capability/{model_id}": "capability:grant",
};

function log(level, message) {
  if (process.env.CORTEX_MCP_QUIET === "1") return;
  console.error(`[cortex-mcp:${level}] ${message}`);
}

function sendStdio(message) {
  console.log(JSON.stringify(message));
}

function hasScope(scopes, required) {
  if (!required) return true;
  if (!Array.isArray(scopes)) return false;
  if (scopes.includes("*")) return true;
  return scopes.includes(required);
}

function capabilityKey() {
  const raw =
    process.env.CORTEX_CAPABILITY_KEY ||
    process.env.CORTEX_STORE_KEY ||
    "cortex-dev";
  return Buffer.isBuffer(raw) ? raw : Buffer.from(raw, "utf8");
}

async function verifyToken(token) {
  const introspectUrl = process.env.CORTEX_OAUTH_INTROSPECT_URL;
  if (!introspectUrl) {
    log(
      "warn",
      "CORTEX_OAUTH_INTROSPECT_URL not set; accepting token without introspection"
    );
    return { active: true, userId: token, scopes: ["*"] };
  }

  const url = new URL(introspectUrl);
  url.searchParams.set("token", token);

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`OAuth introspection failed: ${res.status}`);
  }
  const data = await res.json();
  if (!data.active) {
    return { active: false };
  }
  return {
    active: true,
    userId: data.sub ?? data.user_id ?? data.username ?? "unknown",
    scopes:
      typeof data.scope === "string"
        ? data.scope.split(/\s+/)
        : Array.isArray(data.scope)
        ? data.scope
        : [],
  };
}

function authorizeTool(auth, toolName) {
  const required = TOOL_SCOPES[toolName];
  if (!required) return;
  if (!hasScope(auth.scopes, required)) {
    const err = new Error(`Insufficient scope: ${required}`);
    err.code = -32002;
    throw err;
  }
}

function authorizeResource(auth, template) {
  const required = RESOURCE_SCOPES[template];
  if (!required) return;
  if (!hasScope(auth.scopes, required)) {
    const err = new Error(`Insufficient scope: ${required}`);
    err.code = -32002;
    throw err;
  }
}

function upsertMemory(store, embedder, id, text, owner) {
  store.put(id, { id, text, owner, createdAt: Date.now() });
  embedder(text)
    .then((vector) => store.putEmbedding(id, vector))
    .catch((err) => log("warn", `Embedding failed for ${id}: ${err.message}`));
  return { ok: true, id };
}

function deleteMemory(store, id) {
  const db = store.db;
  db.prepare("DELETE FROM records WHERE key = ?").run(id);
  db.prepare("DELETE FROM embeddings WHERE key = ?").run(id);
  return { ok: true, id };
}

function getBudget(store, userId) {
  return (
    store.get(`budget:${userId}`) ?? {
      balance: Number(process.env.CORTEX_INITIAL_BUDGET || 0),
      spent: 0,
      userId,
    }
  );
}

function spendBudget(store, userId, amount) {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    throw new TypeError("amount must be a positive number");
  }
  const record = getBudget(store, userId);
  if (amount > record.balance) {
    const err = new Error("insufficient budget");
    err.code = -32003;
    throw err;
  }
  record.balance -= amount;
  record.spent += amount;
  store.put(`budget:${userId}`, record);
  return { ok: true, remaining: record.balance, spent: record.spent };
}

function proveCapability(store, modelId, scopes) {
  const scopeList = Array.isArray(scopes)
    ? scopes
    : String(scopes).split(/\s+/).filter(Boolean);
  const issuedAt = Date.now();
  const payload = JSON.stringify({ modelId, scopes: scopeList, issuedAt });
  const proof = createHmac("sha256", capabilityKey())
    .update(payload)
    .digest("base64");
  const record = { modelId, scopes: scopeList, issuedAt, proof };
  store.put(`capability:${modelId}`, record);
  return { ok: true, modelId, proof };
}

function readResource(store, uri) {
  if (uri.startsWith("cortex://memory/")) {
    const userId = uri.slice("cortex://memory/".length);
    const all = store.search("");
    const memories = all
      .filter(({ value }) => value && value.owner === userId)
      .map(({ key, value }) => ({ id: key, ...value }));
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(memories),
    };
  }
  if (uri.startsWith("cortex://budget/")) {
    const userId = uri.slice("cortex://budget/".length);
    const budget = getBudget(store, userId);
    return { uri, mimeType: "application/json", text: JSON.stringify(budget) };
  }
  if (uri.startsWith("cortex://capability/")) {
    const modelId = uri.slice("cortex://capability/".length);
    const capability = store.get(`capability:${modelId}`);
    if (!capability) {
      const err = new Error("capability not found");
      err.code = -32001;
      throw err;
    }
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(capability),
    };
  }
  throw new Error(`Unknown resource URI: ${uri}`);
}

async function handle(request, options = {}) {
  const store = getStore(options);
  const embedder = getEmbedder(options);
  const auth = options.auth ?? { userId: undefined, scopes: ["*"] };

  if (request.method === "initialize") {
    return {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {}, resources: {} },
      serverInfo: { name: "cortex-memory-node", version: "0.0.1" },
    };
  }
  if (request.method === "notifications/initialized") {
    return undefined;
  }
  if (request.method === "tools/list") {
    return { tools: TOOLS };
  }
  if (request.method === "tools/call") {
    const { name, arguments: args = {} } = request.params;
    authorizeTool(auth, name);

    if (name === "store_memory") {
      const { id, text, owner } = args;
      store.put(id, { id, text, owner, createdAt: Date.now() });
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: true, id }) }],
      };
    }
    if (name === "retrieve_memory") {
      const memory = store.get(args.id);
      return {
        content: [
          { type: "text", text: memory ? JSON.stringify(memory) : "null" },
        ],
      };
    }
    if (name === "search_memory") {
      const prefix = args.prefix ?? "";
      let matches = store.search(prefix);
      if (args.owner) {
        matches = matches.filter(
          ({ value }) => value && value.owner === args.owner
        );
      }
      return { content: [{ type: "text", text: JSON.stringify(matches) }] };
    }
    if (name === "add_memory" || name === "update_memory") {
      const { id, text, owner } = args;
      const result = upsertMemory(store, embedder, id, text, owner);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    if (name === "delete_memory") {
      const result = deleteMemory(store, args.id);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    if (name === "spend_budget") {
      const result = spendBudget(store, args.user_id, args.amount);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    if (name === "prove_capability") {
      const result = proveCapability(store, args.model_id, args.scopes);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    throw new Error(`Unknown tool: ${name}`);
  }
  if (request.method === "resources/list") {
    return { resources: [], resourceTemplates: RESOURCE_TEMPLATES };
  }
  if (request.method === "resources/read") {
    const { uri } = request.params;
    const template = RESOURCE_TEMPLATES.find((t) => {
      const prefix = t.uriTemplate.replace(/\{[^}]+\}/g, "");
      return uri.startsWith(prefix.split("//")[0]) || uri.startsWith(prefix);
    })?.uriTemplate;
    authorizeResource(auth, template);
    const content = readResource(store, uri);
    return { contents: [content] };
  }
  throw new Error(`Unknown method: ${request.method}`);
}

export async function startMcpServer(options = {}) {
  const store = getStore(options);
  const embedder = getEmbedder(options);
  const auth = { userId: undefined, scopes: ["*"] };

  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of rl) {
    let request;
    try {
      request = JSON.parse(line);
    } catch {
      continue;
    }
    try {
      const result = await handle(request, { store, embedder, auth });
      if ("id" in request) {
        sendStdio({ jsonrpc: "2.0", id: request.id, result });
      }
    } catch (err) {
      if ("id" in request) {
        sendStdio({
          jsonrpc: "2.0",
          id: request.id,
          error: { code: err.code ?? -32000, message: err.message },
        });
      }
    }
  }
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

function writeSse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function startMcpHttpServer(port = 3001, options = {}) {
  const store = options.store ?? getStore(options);
  const embedder = options.embedder ?? getEmbedder(options);
  const sessions = new Map();

  async function authenticate(req, res) {
    const authHeader = req.headers.authorization ?? "";
    const parts = authHeader.split(" ");
    if (parts[0] !== "Bearer" || !parts[1]) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing Authorization: Bearer token" }));
      return null;
    }
    try {
      const auth = await verifyToken(parts[1]);
      if (!auth.active) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Token inactive" }));
        return null;
      }
      return auth;
    } catch (err) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
      return null;
    }
  }

  const server = createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type"
    );

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (req.method === "GET" && req.url === "/sse") {
      const auth = await authenticate(req, res);
      if (!auth) return;

      const sessionId = randomUUID();
      const baseUrl = `http://${req.headers.host || "localhost"}`;
      const endpoint = `${baseUrl}/message?sessionId=${sessionId}`;

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      sessions.set(sessionId, { res, auth });
      writeSse(res, "endpoint", endpoint);

      req.on("close", () => sessions.delete(sessionId));
      req.on("error", () => sessions.delete(sessionId));
      return;
    }

    if (req.method === "POST" && req.url.startsWith("/message")) {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const sessionId = url.searchParams.get("sessionId");
      if (!sessionId || !sessions.has(sessionId)) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Session not found" }));
        return;
      }

      const session = sessions.get(sessionId);
      const body = await readBody(req);
      let requests;
      try {
        const parsed = JSON.parse(body);
        requests = Array.isArray(parsed) ? parsed : [parsed];
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }

      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ accepted: requests.length }));

      for (const request of requests) {
        try {
          const result = await handle(request, {
            store,
            embedder,
            auth: session.auth,
          });
          if ("id" in request && result !== undefined) {
            writeSse(session.res, "message", {
              jsonrpc: "2.0",
              id: request.id,
              result,
            });
          }
        } catch (err) {
          if ("id" in request) {
            writeSse(session.res, "message", {
              jsonrpc: "2.0",
              id: request.id,
              error: { code: err.code ?? -32000, message: err.message },
            });
          }
        }
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
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

function isMainModule() {
  try {
    const argvUrl = pathToFileURL(process.argv[1]).href;
    return import.meta.url === argvUrl;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  const wantsHttp =
    process.argv.includes("--http") ||
    process.env.CORTEX_MCP_TRANSPORT === "http" ||
    process.env.CORTEX_MCP_PORT;
  if (wantsHttp) {
    const port = Number(process.env.CORTEX_MCP_PORT) || 3001;
    const server = await startMcpHttpServer(port);
    console.error(
      `Cortex MCP HTTP/SSE server listening on ${server.address().port}`
    );
  } else {
    await startMcpServer();
  }
}
