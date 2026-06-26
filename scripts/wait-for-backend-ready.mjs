#!/usr/bin/env node
// Enigma Memory — poll local simulated backend /readyz endpoints.
// CLAIM BOUNDARY: local-simulation only. Accepts self-signed TLS certificates.

import https from 'node:https'
import { parseArgs } from 'node:util'

const RELAY_PORT = process.env.ENIGMA_SIM_RELAY_PORT || '8443'
const GATEWAY_PORT = process.env.ENIGMA_SIM_GATEWAY_PORT || '9443'
const ENDPOINTS = [
  { name: 'relay', url: `https://localhost:${RELAY_PORT}/readyz` },
  { name: 'gateway', url: `https://localhost:${GATEWAY_PORT}/readyz` },
]

function parseCliArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      timeout: { type: 'string', short: 't', default: '120' },
      interval: { type: 'string', short: 'i', default: '2' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  })
  if (values.help) {
    process.stdout.write(
      'Usage: node scripts/wait-for-backend-ready.mjs [--timeout <seconds>] [--interval <seconds>]\n' +
        '\n' +
        'Polls the local simulated backend /readyz endpoints until they return 200.\n' +
        'Self-signed TLS certificates are accepted because this is local simulation only.\n'
    )
    process.exit(0)
  }
  const timeoutMs = Number(values.timeout) * 1000
  const intervalMs = Number(values.interval) * 1000
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('--timeout must be a positive number')
  }
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new Error('--interval must be a positive number')
  }
  return { timeoutMs, intervalMs }
}

function fetchStatus(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { rejectUnauthorized: false }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => {
        body += chunk
      })
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body })
      })
    })
    req.on('error', (error) => {
      resolve({ statusCode: 0, error: error.message })
    })
    req.setTimeout(5000, () => {
      req.destroy()
      resolve({ statusCode: 0, error: 'request timeout' })
    })
  })
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  const { timeoutMs, intervalMs } = parseCliArgs(process.argv.slice(2))
  const deadline = Date.now() + timeoutMs
  const pending = new Map(ENDPOINTS.map((ep) => [ep.name, ep]))

  while (pending.size > 0 && Date.now() < deadline) {
    for (const [name, ep] of pending) {
      const result = await fetchStatus(ep.url)
      if (result.statusCode === 200) {
        process.stdout.write(`${name} ready at ${ep.url}\n`)
        pending.delete(name)
      } else {
        process.stdout.write(
          `${name} not ready (${result.statusCode || 'no response'}${result.error ? ` - ${result.error}` : ''})\n`
        )
      }
    }
    if (pending.size > 0) {
      const waitMs = Math.min(intervalMs, deadline - Date.now())
      if (waitMs > 0) await sleep(waitMs)
    }
  }

  if (pending.size > 0) {
    process.stderr.write(`Timed out waiting for: ${[...pending.keys()].join(', ')}\n`)
    process.exit(1)
  }
  process.stdout.write('All backend services are ready.\n')
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
