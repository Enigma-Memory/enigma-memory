#!/usr/bin/env node
// Enigma Memory — local-simulation SIEM audit-sink mock.
// CLAIM BOUNDARY: local-simulation only. Stores minimized event metadata,
// never raw memory plaintext.

import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const PORT = Number(process.env.PORT || '3000')
const SINK_PATH = process.env.SIEM_SINK_PATH || '/data/siem-events.jsonl'

mkdirSync(dirname(SINK_PATH), { recursive: true })

const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ ok: true, service: 'siem-mock' }))
    return
  }

  if (req.method === 'POST' && req.url === '/events') {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      const body = Buffer.concat(chunks)
      const minimized = {
        received_at: new Date().toISOString(),
        source_ip: req.socket.remoteAddress,
        path: req.url,
        content_length: body.length,
        content_hash: `sha256:${createHash('sha256').update(body).digest('hex')}`,
      }
      appendFileSync(SINK_PATH, `${JSON.stringify(minimized)}\n`)
      res.writeHead(202, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: true, accepted: true }))
    })
    return
  }

  res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify({ ok: false, error: 'not found' }))
})

server.listen(PORT, '0.0.0.0', () => {
  process.stdout.write(
    `${JSON.stringify({ ok: true, service: 'siem-mock', listening: true, port: PORT, sink: SINK_PATH })}\n`
  )
})
