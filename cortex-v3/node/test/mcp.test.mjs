import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, '../src/mcp-server.mjs');

function callMcp(requests, expectedResponses) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [serverPath], { stdio: ['pipe', 'pipe', 'pipe'] });
    const responses = [];
    let buffer = '';
    let err = '';

    proc.stdout.on('data', d => {
      buffer += d.toString();
      let idx;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (line) {
          try { responses.push(JSON.parse(line)); } catch {}
          if (responses.length >= expectedResponses) {
            proc.kill();
          }
        }
      }
    });

    proc.stderr.on('data', d => err += d);
    proc.on('error', reject);

    const done = () => {
      proc.kill();
      if (responses.length < expectedResponses) {
        reject(new Error(`Expected ${expectedResponses} responses, got ${responses.length}. stderr: ${err}`));
      } else {
        resolve(responses);
      }
    };

    proc.on('close', () => {
      if (responses.length >= expectedResponses) resolve(responses);
    });

    setTimeout(done, 1000);

    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0.0.1' } } }) + '\n');
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    for (const req of requests) {
      proc.stdin.write(JSON.stringify(req) + '\n');
    }
  });
}

describe('MCP node integration', () => {
  it('lists tools', async () => {
    const id = 'list-tools-1';
    const responses = await callMcp([{ jsonrpc: '2.0', id, method: 'tools/list' }], 2);
    const tools = responses.find(r => r.id === id)?.result?.tools;
    assert.ok(Array.isArray(tools));
    assert.ok(tools.some(t => t.name === 'store_memory'));
    assert.ok(tools.some(t => t.name === 'retrieve_memory'));
  });

  it('stores and retrieves a memory', async () => {
    const storeId = 'store-1';
    const retrieveId = 'retrieve-1';
    const responses = await callMcp([
      { jsonrpc: '2.0', id: storeId, method: 'tools/call', params: { name: 'store_memory', arguments: { id: 'mcp-mem-1', text: 'mcp works', owner: 'bob' } } },
      { jsonrpc: '2.0', id: retrieveId, method: 'tools/call', params: { name: 'retrieve_memory', arguments: { id: 'mcp-mem-1' } } }
    ], 3);
    const stored = responses.find(r => r.id === storeId);
    assert.ok(stored.result.content[0].text.includes('"ok":true'));
    const retrieved = responses.find(r => r.id === retrieveId);
    const memory = JSON.parse(retrieved.result.content[0].text);
    assert.equal(memory.text, 'mcp works');
  });
});
