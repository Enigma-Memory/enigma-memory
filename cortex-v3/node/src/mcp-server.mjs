import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { statSync } from 'node:fs';

const memories = new Map();

const TOOLS = [
  {
    name: 'store_memory',
    description: 'Store a memory in the Cortex vault',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        text: { type: 'string' },
        owner: { type: 'string' }
      },
      required: ['id', 'text', 'owner']
    }
  },
  {
    name: 'retrieve_memory',
    description: 'Retrieve a memory from the Cortex vault',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' }
      },
      required: ['id']
    }
  }
];

function send(message) {
  console.log(JSON.stringify(message));
}

async function handle(request) {
  if (request.method === 'initialize') {
    return {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'cortex-memory-node', version: '0.0.1' }
    };
  }
  if (request.method === 'notifications/initialized') {
    return undefined;
  }
  if (request.method === 'tools/list') {
    return { tools: TOOLS };
  }
  if (request.method === 'tools/call') {
    const { name, arguments: args } = request.params;
    if (name === 'store_memory') {
      const { id, text, owner } = args;
      memories.set(id, { id, text, owner, createdAt: Date.now() });
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, id }) }] };
    }
    if (name === 'retrieve_memory') {
      const memory = memories.get(args.id);
      return { content: [{ type: 'text', text: memory ? JSON.stringify(memory) : 'null' }] };
    }
    throw new Error(`Unknown tool: ${name}`);
  }
  throw new Error(`Unknown method: ${request.method}`);
}

export async function startMcpServer() {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of rl) {
    let request;
    try {
      request = JSON.parse(line);
    } catch {
      continue;
    }
    try {
      const result = await handle(request);
      if ('id' in request) {
        send({ jsonrpc: '2.0', id: request.id, result });
      }
    } catch (err) {
      if ('id' in request) {
        send({ jsonrpc: '2.0', id: request.id, error: { code: -32000, message: err.message } });
      }
    }
  }
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
  await startMcpServer();
}
