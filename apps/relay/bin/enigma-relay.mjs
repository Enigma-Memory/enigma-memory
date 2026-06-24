#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { DEFAULT_RELAY_PORT, main as cliMain } from '../../cli/bin/enigma.mjs';

function relayUsage() {
  return {
    usage: 'enigma-relay [demo|serve] [options]',
    default_command: 'serve',
    commands: ['demo', 'serve'],
    serve_options: {
      '--host <host>': 'Bind host. Defaults to 127.0.0.1.',
      '--port <port>': `Bind port. Defaults to ${DEFAULT_RELAY_PORT}.`,
      '--state-file <path>': 'Load and persist local relay demo state as JSON.',
      '--once': 'Start, report the listening address, persist state when configured, then close.',
    },
    claim_boundaries: 'Relay accepts opaque encrypted records only; do not send raw memory plaintext, prompts, transcripts, or conversation bodies.',
  };
}

function print(value, io) {
  io.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function isHelp(argv) {
  return argv.includes('--help') || argv.includes('-h');
}

function relayArgv(argv) {
  return argv[0] === 'demo' || argv[0] === 'serve' ? ['relay', ...argv] : ['relay', 'serve', ...argv];
}

export async function main(argv = process.argv.slice(2), io = { stdout: process.stdout, stderr: process.stderr }) {
  if (isHelp(argv)) {
    print(relayUsage(), io);
    return 0;
  }
  return cliMain(relayArgv(argv), io);
}
function isMainModule(metaUrl) {
  if (!process.argv[1]) return false;
  try {
    return metaUrl === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return metaUrl === pathToFileURL(process.argv[1]).href;
  }
}


if (isMainModule(import.meta.url)) {
  process.exitCode = await main();
}
