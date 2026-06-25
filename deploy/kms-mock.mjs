#!/usr/bin/env node
// Enigma Memory — local-simulation KMS mock.
// CLAIM BOUNDARY: local-simulation only. This is not HSM-grade key custody.

import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { generateKeyPairSync } from 'node:crypto'

const PORT = Number(process.env.PORT || '3000')
const KEY_REF_PATH = process.env.KMS_KEY_REF_PATH || '/data/kms-key-ref.json'
const KEY_ID = process.env.KMS_KEY_ID || 'local-simulation-kms-key'

function ensureKeyRef() {
  if (existsSync(KEY_REF_PATH)) {
    return JSON.parse(readFileSync(KEY_REF_PATH, 'utf8'))
  }
  mkdirSync(dirname(KEY_REF_PATH), { recursive: true })
  const pair = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  })
  const ref = {
    schema: 'enigma.local_simulation_kms_key_ref.v1',
    key_id: KEY_ID,
    alg: 'Ed25519',
    public_key: pair.publicKey,
    private_key: pair.privateKey,
    claim_boundary: 'local-simulation only. This is not HSM-grade key custody.',
  }
  writeFileSync(KEY_REF_PATH, JSON.stringify(ref, null, 2))
  return ref
}

const keyRef = ensureKeyRef()

const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ ok: true, service: 'kms-mock', key_id: keyRef.key_id }))
    return
  }
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end(
      JSON.stringify({
        schema: keyRef.schema,
        key_id: keyRef.key_id,
        alg: keyRef.alg,
        public_key: keyRef.public_key,
        claim_boundary: keyRef.claim_boundary,
      })
    )
    return
  }
  res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify({ ok: false, error: 'not found' }))
})

server.listen(PORT, '0.0.0.0', () => {
  process.stdout.write(
    `${JSON.stringify({ ok: true, service: 'kms-mock', listening: true, port: PORT, key_id: keyRef.key_id })}\n`
  )
})
