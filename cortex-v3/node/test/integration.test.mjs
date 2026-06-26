import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../src/server.mjs';

describe('HTTP node integration', () => {
  let server;
  let port;

  it('starts and reports health', async () => {
    server = await startServer(0);
    port = server.address().port;
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
  });

  it('ingests and retrieves a memory', async () => {
    const memory = { id: 'mem-1', text: 'hello world', owner: 'alice' };
    const post = await fetch(`http://127.0.0.1:${port}/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(memory)
    });
    assert.equal(post.status, 201);

    const get = await fetch(`http://127.0.0.1:${port}/retrieve/mem-1`);
    assert.equal(get.status, 200);
    const got = await get.json();
    assert.equal(got.text, 'hello world');
    assert.equal(got.owner, 'alice');
  });

  it('returns 404 for missing memory', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/retrieve/nope`);
    assert.equal(res.status, 404);
  });

  it('rejects ingest without required fields', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'x' })
    });
    assert.equal(res.status, 400);
  });

  after(() => {
    server?.close();
  });
});
