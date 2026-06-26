import { createServer } from 'node:http';

const memories = new Map();

export function startServer(port = 3000) {
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    if (req.method === 'POST' && req.url === '/ingest') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        const { id, text, owner } = JSON.parse(body);
        if (!id || !text || !owner) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'missing fields' }));
          return;
        }
        memories.set(id, { id, text, owner, createdAt: Date.now() });
        res.writeHead(201);
        res.end(JSON.stringify({ ok: true, id }));
      });
      return;
    }

    if (req.method === 'GET' && req.url.startsWith('/retrieve/')) {
      const id = req.url.slice('/retrieve/'.length);
      const memory = memories.get(id);
      if (!memory) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'not found' }));
        return;
      }
      res.writeHead(200);
      res.end(JSON.stringify(memory));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'not found' }));
  });

  return new Promise(resolve => {
    server.listen(port, () => resolve(server));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = await startServer(Number(process.env.PORT) || 3000);
  console.log(`Cortex node listening on ${server.address().port}`);
}
