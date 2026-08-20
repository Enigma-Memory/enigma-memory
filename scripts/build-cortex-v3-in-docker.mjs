#!/usr/bin/env node
// Build Enigma Cortex v3 Anchor programs inside a Docker container.
// This is the fallback path for hosts (e.g., Windows 11 Home) where the
// Anchor CLI is not available natively.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const CORTEX_DIR = path.join(ROOT, 'cortex-v3');

function run(cmd, args, options = {}) {
  const isWindows = process.platform === 'win32';
  return execFileSync(isWindows ? 'cmd' : cmd, isWindows ? ['/c', cmd, ...args] : args, {
    encoding: 'utf8',
    stdio: 'inherit',
    ...options,
  });
}

function main() {
  if (!existsSync(path.join(CORTEX_DIR, 'Cargo.toml'))) {
    console.error(`Cargo.toml not found in ${CORTEX_DIR}`);
    process.exit(1);
  }

  console.log('Building Docker image for Cortex v3 Anchor build environment...');
  run('docker', ['build', '-t', 'enigma-cortex-v3-build', '-f', path.join('cortex-v3', 'Dockerfile'), 'cortex-v3'], { cwd: ROOT });

  console.log('\nRunning anchor build inside container...');
  run('docker', [
    'run', '--rm',
    '-v', `${CORTEX_DIR}:/workspace`,
    '-w', '/workspace',
    'enigma-cortex-v3-build',
    'anchor', 'build', '--no-idl',
  ], { cwd: ROOT });

  console.log('\nBuild complete. Check cortex-v3/target/deploy/ for compiled programs.');
}

main();
