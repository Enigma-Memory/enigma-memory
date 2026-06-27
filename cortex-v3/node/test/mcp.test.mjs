import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createStore } from "../src/store.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "../src/mcp-server.mjs");
const TEST_KEY = "a".repeat(64);

describe("MCP node integration", () => {
  let tmpDir;
  let env;

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "cortex-mcp-"));
    env = {
      ...process.env,
      CORTEX_STORE_PATH: join(tmpDir, "mcp-store.sqlite"),
      CORTEX_STORE_KEY: TEST_KEY,
      CORTEX_MCP_QUIET: "1",
    };
  });

  function callMcp(requests, expectedResponses) {
    return new Promise((resolve, reject) => {
      const proc = spawn(process.execPath, [serverPath], {
        stdio: ["pipe", "pipe", "pipe"],
        env,
      });
      const responses = [];
      let buffer = "";
      let err = "";

      proc.stdout.on("data", (d) => {
        buffer += d.toString();
        let idx;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (line) {
            try {
              responses.push(JSON.parse(line));
            } catch {}
            if (responses.length >= expectedResponses) {
              proc.kill();
            }
          }
        }
      });

      proc.stderr.on("data", (d) => (err += d));
      proc.on("error", reject);

      const done = () => {
        proc.kill();
        if (responses.length < expectedResponses) {
          reject(
            new Error(
              `Expected ${expectedResponses} responses, got ${responses.length}. stderr: ${err}`
            )
          );
        } else {
          resolve(responses);
        }
      };

      proc.on("close", () => {
        if (responses.length >= expectedResponses) resolve(responses);
      });

      setTimeout(done, 1000);

      proc.stdin.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 0,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "test", version: "0.0.1" },
          },
        }) + "\n"
      );
      proc.stdin.write(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "notifications/initialized",
        }) + "\n"
      );
      for (const req of requests) {
        proc.stdin.write(JSON.stringify(req) + "\n");
      }
    });
  }

  it("lists tools", async () => {
    const id = "list-tools-1";
    const responses = await callMcp(
      [{ jsonrpc: "2.0", id, method: "tools/list" }],
      2
    );
    const tools = responses.find((r) => r.id === id)?.result?.tools;
    assert.ok(Array.isArray(tools));
    assert.ok(tools.some((t) => t.name === "store_memory"));
    assert.ok(tools.some((t) => t.name === "retrieve_memory"));
    assert.ok(tools.some((t) => t.name === "search_memory"));
  });

  it("stores and retrieves a memory", async () => {
    const storeId = "store-1";
    const retrieveId = "retrieve-1";
    const responses = await callMcp(
      [
        {
          jsonrpc: "2.0",
          id: storeId,
          method: "tools/call",
          params: {
            name: "store_memory",
            arguments: { id: "mcp-mem-1", text: "mcp works", owner: "bob" },
          },
        },
        {
          jsonrpc: "2.0",
          id: retrieveId,
          method: "tools/call",
          params: { name: "retrieve_memory", arguments: { id: "mcp-mem-1" } },
        },
      ],
      3
    );
    const stored = responses.find((r) => r.id === storeId);
    assert.ok(stored.result.content[0].text.includes('"ok":true'));
    const retrieved = responses.find((r) => r.id === retrieveId);
    const memory = JSON.parse(retrieved.result.content[0].text);
    assert.equal(memory.text, "mcp works");
  });

  it("searches memories by prefix", async () => {
    const storeId = "store-2";
    const searchId = "search-2";
    const responses = await callMcp(
      [
        {
          jsonrpc: "2.0",
          id: storeId,
          method: "tools/call",
          params: {
            name: "store_memory",
            arguments: { id: "find/x", text: "findable", owner: "carol" },
          },
        },
        {
          jsonrpc: "2.0",
          id: searchId,
          method: "tools/call",
          params: { name: "search_memory", arguments: { prefix: "find/" } },
        },
      ],
      3
    );
    const searched = responses.find((r) => r.id === searchId);
    const matches = JSON.parse(searched.result.content[0].text);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].key, "find/x");
    assert.equal(matches[0].value.text, "findable");
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe("MCP HTTP/SSE transport", () => {
  let tmpDir;
  let store;
  let oauthServer;
  let oauthUrl;
  let mcpServer;
  let mcpBaseUrl;
  let endpoint;
  let sseResponse;
  let reader;
  let decoder;
  let sseBuffer;

  function startMockOAuth() {
    return new Promise((resolve) => {
      const server = createServer((req, res) => {
        const url = new URL(req.url, "http://localhost");
        if (req.method === "GET" && url.pathname === "/oauth/introspect") {
          const token = url.searchParams.get("token");
          if (token === "valid-token") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                active: true,
                sub: "alice",
                scope: "memory:read memory:write budget:spend capability:grant",
              })
            );
          } else if (token === "limited-token") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({ active: true, sub: "bob", scope: "memory:read" })
            );
          } else {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ active: false }));
          }
          return;
        }
        res.writeHead(404);
        res.end(JSON.stringify({ error: "not found" }));
      });
      server.listen(0, "127.0.0.1", () => {
        resolve({ server, url: `http://127.0.0.1:${server.address().port}` });
      });
    });
  }

  async function drainSse(targetReader, targetCount = 1, timeoutMs = 3000) {
    const events = [];
    const deadline = Date.now() + timeoutMs;
    let buffer = "";
    while (events.length < targetCount && Date.now() < deadline) {
      const { done, value } = await targetReader.read();
      if (done) break;
      buffer += new TextDecoder().decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 2);
        const lines = block.split("\n");
        const ev = {};
        for (const line of lines) {
          if (line.startsWith("event:")) ev.type = line.slice(6).trim();
          else if (line.startsWith("data:")) {
            const raw = line.slice(5).trim();
            try {
              ev.data = JSON.parse(raw);
            } catch {
              ev.data = raw;
            }
          }
        }
        if (ev.type) events.push(ev);
      }
    }
    return events;
  }

  async function postMessage(payload) {
    return fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  async function callMcpHttp(request) {
    const res = await postMessage(request);
    assert.equal(res.status, 202);
    const [ev] = await drainSse(reader, 1);
    assert.ok(ev, "expected SSE response");
    assert.equal(ev.type, "message");
    assert.equal(ev.data.id, request.id);
    return ev.data;
  }

  before(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "cortex-mcp-http-"));
    ({ server: oauthServer, url: oauthUrl } = await startMockOAuth());
    process.env.CORTEX_STORE_PATH = join(tmpDir, "mcp-http-store.sqlite");
    process.env.CORTEX_STORE_KEY = TEST_KEY;
    process.env.CORTEX_MCP_QUIET = "1";
    process.env.CORTEX_OAUTH_INTROSPECT_URL = `${oauthUrl}/oauth/introspect`;
    store = createStore({
      path: process.env.CORTEX_STORE_PATH,
      key: process.env.CORTEX_STORE_KEY,
    });
    store.put("budget:alice", { balance: 100, spent: 0, userId: "alice" });
    const { startMcpHttpServer } = await import("../src/mcp-server.mjs");
    mcpServer = await startMcpHttpServer(0, { store });
    mcpBaseUrl = `http://127.0.0.1:${mcpServer.address().port}`;
    sseResponse = await fetch(`${mcpBaseUrl}/sse`, {
      headers: {
        Authorization: "Bearer valid-token",
        Accept: "text/event-stream",
      },
    });
    assert.equal(sseResponse.status, 200);
    reader = sseResponse.body.getReader();
    decoder = new TextDecoder();
    sseBuffer = "";
    const [endpointEvent] = await drainSse(reader, 1);
    assert.equal(endpointEvent.type, "endpoint");
    endpoint = endpointEvent.data;
  });

  it("rejects SSE without a Bearer token", async () => {
    const res = await fetch(`${mcpBaseUrl}/sse`);
    assert.equal(res.status, 401);
  });

  it("rejects SSE with an inactive token", async () => {
    const res = await fetch(`${mcpBaseUrl}/sse`, {
      headers: { Authorization: "Bearer bad-token" },
    });
    assert.equal(res.status, 401);
  });

  it("returns initialize response via SSE", async () => {
    const data = await callMcpHttp({
      jsonrpc: "2.0",
      id: "init",
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test", version: "0.0.1" },
      },
    });
    assert.equal(data.result.protocolVersion, "2024-11-05");
    assert.ok(data.result.capabilities.tools);
    assert.ok(data.result.capabilities.resources);
  });

  it("lists required tools and resources", async () => {
    const toolsData = await callMcpHttp({
      jsonrpc: "2.0",
      id: "tools",
      method: "tools/list",
    });
    const names = toolsData.result.tools.map((t) => t.name);
    for (const name of [
      "search_memory",
      "add_memory",
      "update_memory",
      "delete_memory",
      "spend_budget",
      "prove_capability",
    ]) {
      assert.ok(names.includes(name), `missing tool ${name}`);
    }
    const resData = await callMcpHttp({
      jsonrpc: "2.0",
      id: "resources",
      method: "resources/list",
    });
    const templates = resData.result.resourceTemplates.map(
      (t) => t.uriTemplate
    );
    assert.ok(templates.includes("cortex://memory/{user_id}"));
    assert.ok(templates.includes("cortex://budget/{user_id}"));
    assert.ok(templates.includes("cortex://capability/{model_id}"));
  });

  it("adds, updates, deletes and searches memory", async () => {
    let data = await callMcpHttp({
      jsonrpc: "2.0",
      id: "add",
      method: "tools/call",
      params: {
        name: "add_memory",
        arguments: { id: "http-mem-1", text: "hello", owner: "alice" },
      },
    });
    assert.ok(data.result.content[0].text.includes('"ok":true'));

    data = await callMcpHttp({
      jsonrpc: "2.0",
      id: "search1",
      method: "tools/call",
      params: { name: "search_memory", arguments: { prefix: "http-mem-" } },
    });
    const matches = JSON.parse(data.result.content[0].text);
    assert.equal(matches.length, 1);

    data = await callMcpHttp({
      jsonrpc: "2.0",
      id: "update",
      method: "tools/call",
      params: {
        name: "update_memory",
        arguments: { id: "http-mem-1", text: "hello world", owner: "alice" },
      },
    });
    assert.ok(data.result.content[0].text.includes('"ok":true'));

    data = await callMcpHttp({
      jsonrpc: "2.0",
      id: "res-mem",
      method: "resources/read",
      params: { uri: "cortex://memory/alice" },
    });
    const memories = JSON.parse(data.result.contents[0].text);
    assert.equal(memories.length, 1);
    assert.equal(memories[0].text, "hello world");

    data = await callMcpHttp({
      jsonrpc: "2.0",
      id: "delete",
      method: "tools/call",
      params: { name: "delete_memory", arguments: { id: "http-mem-1" } },
    });
    assert.ok(data.result.content[0].text.includes('"ok":true'));

    data = await callMcpHttp({
      jsonrpc: "2.0",
      id: "search2",
      method: "tools/call",
      params: { name: "search_memory", arguments: { prefix: "http-mem-" } },
    });
    assert.equal(JSON.parse(data.result.content[0].text).length, 0);
  });

  it("spends budget", async () => {
    const data = await callMcpHttp({
      jsonrpc: "2.0",
      id: "spend",
      method: "tools/call",
      params: {
        name: "spend_budget",
        arguments: { user_id: "alice", amount: 5 },
      },
    });
    const result = JSON.parse(data.result.content[0].text);
    assert.equal(result.remaining, 95);
    assert.equal(result.spent, 5);

    const resData = await callMcpHttp({
      jsonrpc: "2.0",
      id: "res-budget",
      method: "resources/read",
      params: { uri: "cortex://budget/alice" },
    });
    const budget = JSON.parse(resData.result.contents[0].text);
    assert.equal(budget.balance, 95);
  });

  it("issues and reads capability attestations", async () => {
    const data = await callMcpHttp({
      jsonrpc: "2.0",
      id: "prove",
      method: "tools/call",
      params: {
        name: "prove_capability",
        arguments: {
          model_id: "gpt-4",
          scopes: ["memory:read", "memory:write"],
        },
      },
    });
    const result = JSON.parse(data.result.content[0].text);
    assert.ok(result.proof);

    const resData = await callMcpHttp({
      jsonrpc: "2.0",
      id: "res-cap",
      method: "resources/read",
      params: { uri: "cortex://capability/gpt-4" },
    });
    const capability = JSON.parse(resData.result.contents[0].text);
    assert.equal(capability.modelId, "gpt-4");
    assert.deepEqual(capability.scopes, ["memory:read", "memory:write"]);
  });

  it("enforces OAuth scopes", async () => {
    const limitedSse = await fetch(`${mcpBaseUrl}/sse`, {
      headers: {
        Authorization: "Bearer limited-token",
        Accept: "text/event-stream",
      },
    });
    assert.equal(limitedSse.status, 200);
    const limitedReader = limitedSse.body.getReader();
    const [ev] = await drainSse(limitedReader, 1);
    assert.equal(ev.type, "endpoint");
    const limitedEndpoint = ev.data;

    const post = await fetch(limitedEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "overspend",
        method: "tools/call",
        params: {
          name: "spend_budget",
          arguments: { user_id: "bob", amount: 1 },
        },
      }),
    });
    assert.equal(post.status, 202);
    const [msg] = await drainSse(limitedReader, 1);
    assert.equal(msg.type, "message");
    assert.ok(msg.data.error);
    assert.equal(msg.data.error.code, -32002);
    await limitedReader.cancel();
  });

  after(async () => {
    try {
      await reader.cancel();
    } catch {}
    try {
      mcpServer.close();
    } catch {}
    try {
      oauthServer.close();
    } catch {}
    try {
      store.close();
    } catch {}
    rmSync(tmpDir, { recursive: true, force: true });
  });
});
