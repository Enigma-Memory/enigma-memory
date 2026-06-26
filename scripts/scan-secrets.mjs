#!/usr/bin/env node
// Enigma Memory — working-tree secret scanner.
// Scans for PEM private keys, bearer-token patterns, DSNs, AWS-style keys,
// and literal SECURITY.md placeholders. Approved test fixtures must carry an
// explicit approval comment on the same or previous non-empty line:
//   // secret-scan:approved
//   # secret-scan:approved
// This script exits non-zero when any unapproved detection remains.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const APPROVAL_MARKERS = [
  /secret-scan:(?:approved|ignore)/i,
  /\bno[-_]?secret[-_]?scan\b/i,
]

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.enigma',
  '.enigma-review-packet',
  '.enigma-review-packet-debug',
  'coverage',
  'dist',
  'build',
  '.cache',
  'tmp',
  '.vscode',
  '.idea',
])

const SKIP_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.ico',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
  '.tgz',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
  '.mp4',
  '.webm',
  '.mp3',
  '.ogg',
])

// The security-placeholder detector matches its own pattern literal below.
// The preceding comment marks that line as an approved self-reference.
const DETECTORS = [
  {
    id: 'pem-private-key',
    pattern: /-----BEGIN\s+(?:RSA\s+|EC\s+|DSA\s+|OPENSSH\s+|ENCRYPTED\s+)?PRIVATE\s+KEY-----/i,
  },
  {
    id: 'aws-access-key-id',
    pattern: /\b(?:AKIA|ASIA|AROA|AIDA)[0-9A-Z]{16}\b/,
  },
  {
    id: 'aws-secret-access-key',
    pattern: /\b(?:aws[_-]?secret[_-]?access[_-]?key|AWS[_-]?SECRET[_-]?ACCESS[_-]?KEY)\s*[=:]\s*["'][A-Za-z0-9/+=]{40}["']/i,
  },
  {
    id: 'bearer-token',
    // Skip placeholders like <token>, ${var}, and $ENV_VAR.
    pattern: /(?:Authorization\s*:\s*Bearer\s+(?![<$\(])\S{8,}|\bbearer\s+[:=]\s*["']?[a-zA-Z0-9_\-]{16,}|\bapi[_-]?token\s*[:=]\s*["'][a-zA-Z0-9_\-]{16,}["'])/i,
  },
  {
    id: 'dsn-with-password',
    pattern: /\b(?:postgres|postgresql|mysql|mysql2|mongodb|redis|amqp|amqps):\/\/[^:]+:[^@\s]+@[^\/\s]+/i,
  },
  {
    id: 'security-placeholder',
    pattern: /REPLACE-WITH/i, // secret-scan:approved self-reference pattern
  },
]

function hasApprovalComment(line) {
  return APPROVAL_MARKERS.some((m) => m.test(line))
}

function isApproved(lines, index) {
  if (hasApprovalComment(lines[index])) return true
  for (let i = index - 1; i >= 0; i -= 1) {
    const trimmed = lines[i].trim()
    if (trimmed === '') continue
    return hasApprovalComment(trimmed)
  }
  return false
}

function isSkippableFile(rel) {
  const ext = path.extname(rel).toLowerCase()
  if (SKIP_EXTENSIONS.has(ext)) return true
  const base = path.basename(rel)
  if (base === 'package-lock.json') return true
  return false
}

function* walk(root) {
  const entries = fs.readdirSync(root, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      yield* walk(full)
    } else if (entry.isFile()) {
      yield full
    }
  }
}

export function scanForSecrets(root) {
  const findings = []
  const rootResolved = path.resolve(root)
  for (const fullPath of walk(rootResolved)) {
    const rel = path.relative(rootResolved, fullPath)
    if (isSkippableFile(rel)) continue
    let text
    try {
      text = fs.readFileSync(fullPath, 'utf8')
    } catch {
      continue
    }
    const lines = text.split(/\r?\n/)
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]
      if (isApproved(lines, i)) continue
      for (const detector of DETECTORS) {
        if (detector.pattern.test(line)) {
          findings.push({
            file: rel,
            line: i + 1,
            type: detector.id,
          })
          break
        }
      }
    }
  }
  return findings
}

function formatFindings(findings) {
  return findings
    .map((f) => `${f.file}:${f.line}: ${f.type}`)
    .join('\n')
}

function main() {
  const rootArg = process.argv.includes('--root')
    ? process.argv[process.argv.indexOf('--root') + 1]
    : path.resolve(path.dirname(__filename), '..')
  const root = path.resolve(rootArg)
  const findings = scanForSecrets(root)
  if (findings.length > 0) {
    process.stderr.write(`secret-scan: ${findings.length} unapproved detection(s)\n`)
    process.stderr.write(formatFindings(findings) + '\n')
    process.exit(1)
  }
  process.stdout.write('secret-scan ok\n')
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
