import { createServer } from 'node:http';
import { createStore } from './store.mjs';
import { createEmbedder } from './embed.mjs';

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
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
    score: cosineSimilarity(queryVector, vector)
  }));
  scored.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  return scored.slice(0, topK).map(({ key, score }) => ({
    score: Number(score.toFixed(6)),
    memory: store.get(key)
  }));
}

export function startServer(port = 3000, options = {}) {
  if (options && typeof options.put === 'function') {
    options = { store: options };
  }
  const store = options.store || createStore();
  const embedder = options.embedder || createEmbedder();
  const topK = options.topK ?? 10;

  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');

    const baseUrl = `http://${req.headers.host || 'localhost'}`;
    const url = new URL(req.url, baseUrl);
    const pathname = url.pathname;

    if (req.method === 'GET' && pathname === '/health') {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    if (req.method === 'POST' && pathname === '/ingest') {
      try {
        const body = await readBody(req);
        const { id, text, owner } = JSON.parse(body);
        if (!id || !text || !owner) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'missing fields' }));
          return;
        }
        store.put(id, { id, text, owner, createdAt: Date.now() });
        try {
          const vector = await embedder(text);
          store.putEmbedding(id, vector);
        } catch (err) {
          console.error('Embedding generation failed:', err.message);
        }
        res.writeHead(201);
        res.end(JSON.stringify({ ok: true, id }));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (req.method === 'GET' && pathname.startsWith('/retrieve/')) {
      const id = pathname.slice('/retrieve/'.length);
      const memory = store.get(id);
      if (!memory) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'not found' }));
        return;
      }
      res.writeHead(200);
      res.end(JSON.stringify(memory));
      return;
    }

    if (req.method === 'GET' && pathname === '/search') {
      const query = url.searchParams.get('query') || url.searchParams.get('q');
      if (!query) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'missing query' }));
        return;
      }
      const results = await semanticSearch(store, embedder, query, topK);
      res.writeHead(200);
      res.end(JSON.stringify({ query, results }));
      return;
    }

    if (req.method === 'POST' && pathname === '/search') {
      try {
        const body = await readBody(req);
        const { query } = JSON.parse(body);
        if (!query) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'missing query' }));
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

    if (req.method === 'GET' && pathname.startsWith('/search/')) {
      const prefix = pathname.slice('/search/'.length);
      const matches = store.search(prefix);
      res.writeHead(200);
      res.end(JSON.stringify(matches));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'not found' }));
  });

  server.on('close', () => {
    try { store.close(); } catch {}
  });

  return new Promise(resolve => {
    server.listen(port, () => resolve(server));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = await startServer(Number(process.env.CORTEX_NODE_PORT) || Number(process.env.PORT) || 3000);
  console.log(`Cortex node listening on ${server.address().port}`);
}
