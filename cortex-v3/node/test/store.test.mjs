import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../src/store.mjs';

const TEST_KEY = 'a'.repeat(64);

describe('EncryptedStore', () => {
  let tmpDir;
  let store;

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-store-'));
  });

  after(() => {
    store?.close();
  });

  it('stores and retrieves a value', () => {
    const path = join(tmpDir, 'store1.sqlite');
    store = createStore({ path, key: TEST_KEY });
    store.put('k1', { text: 'hello', owner: 'alice' });
    const got = store.get('k1');
    assert.equal(got.text, 'hello');
    assert.equal(got.owner, 'alice');
  });

  it('returns undefined for missing keys', () => {
    const path = join(tmpDir, 'store2.sqlite');
    store = createStore({ path, key: TEST_KEY });
    assert.equal(store.get('missing'), undefined);
  });

  it('searches by key prefix', () => {
    const path = join(tmpDir, 'store3.sqlite');
    store = createStore({ path, key: TEST_KEY });
    store.put('alice/1', { text: 'a1' });
    store.put('alice/2', { text: 'a2' });
    store.put('bob/1', { text: 'b1' });
    const matches = store.search('alice/');
    assert.equal(matches.length, 2);
    assert.ok(matches.some(m => m.key === 'alice/1' && m.value.text === 'a1'));
    assert.ok(matches.some(m => m.key === 'alice/2' && m.value.text === 'a2'));
  });

  it('persists data across store instances', () => {
    const path = join(tmpDir, 'store4.sqlite');
    store = createStore({ path, key: TEST_KEY });
    store.put('persist', { text: 'survive' });
    store.close();

    const second = createStore({ path, key: TEST_KEY });
    try {
      const got = second.get('persist');
      assert.equal(got.text, 'survive');
    } finally {
      second.close();
    }
  });

  it('encrypts values on disk', () => {
    const path = join(tmpDir, 'store5.sqlite');
    store = createStore({ path, key: TEST_KEY });
    store.put('secret', { text: ' plaintext value ' });
    const raw = readFileSync(path, 'utf8');
    assert.ok(!raw.includes('plaintext value'), 'plaintext must not appear in sqlite file');
  });

  it('rejects invalid keys', () => {
    const path = join(tmpDir, 'store6.sqlite');
    store = createStore({ path, key: TEST_KEY });
    assert.throws(() => store.put('', 'value'), /non-empty string/);
  });

  it('stores and retrieves embeddings', () => {
    const path = join(tmpDir, 'store7.sqlite');
    store = createStore({ path, key: TEST_KEY });
    store.putEmbedding('emb-1', new Float32Array([0.1, 0.2, 0.3]));
    const all = store.getAllEmbeddings();
    assert.equal(all.length, 1);
    assert.equal(all[0].key, 'emb-1');
    assert.deepEqual(Array.from(all[0].vector).map(v => Number(v.toFixed(6))), [0.1, 0.2, 0.3]);
  });

  it('persists embeddings across store instances', () => {
    const path = join(tmpDir, 'store8.sqlite');
    store = createStore({ path, key: TEST_KEY });
    store.putEmbedding('emb-2', new Float32Array([0.9, 0.8, 0.7]));
    store.close();
    const second = createStore({ path, key: TEST_KEY });
    try {
      const all = second.getAllEmbeddings();
      assert.equal(all.length, 1);
      assert.deepEqual(Array.from(all[0].vector).map(v => Number(v.toFixed(6))), [0.9, 0.8, 0.7]);
    } finally {
      second.close();
    }
  });

  it('encrypts embeddings on disk', () => {
    const path = join(tmpDir, 'store9.sqlite');
    store = createStore({ path, key: TEST_KEY });
    store.putEmbedding('emb-secret', new Float32Array([1.1, 2.2, 3.3]));
    const raw = readFileSync(path, 'utf8');
    assert.ok(!raw.includes('1.1'), 'embedding values must not appear in sqlite file');
  });
});
