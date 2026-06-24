#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { DEFAULT_GATEWAY_PORT, main as cliMain } from '../../cli/bin/enigma.mjs';

function gatewayUsage() {
  return {
    usage: 'enigma-gateway [demo|serve] [options]',
    default_command: 'serve',
    commands: ['demo', 'serve'],
    serve_options: {
      '--host <host>': 'Bind host. Defaults to 127.0.0.1.',
      '--port <port>': `Bind port. Defaults to ${DEFAULT_GATEWAY_PORT}.`,
      '--state-file <path>': 'Load and persist local gateway demo state as JSON.',
      '--once': 'Start, report the listening address, persist state when configured, then close.',
    },
    claim_boundaries: 'Gateway evaluates Enigma enterprise policy and emits plaintext-minimized decisions/SIEM events; it does not call model providers or prove provider deletion/model forgetting.',
  };
}

function print(value, io) {
  io.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function isHelp(argv) {
  return argv.includes('--help') || argv.includes('-h');
}

function gatewayArgv(argv) {
  return argv[0] === 'demo' || argv[0] === 'serve' ? ['gateway', ...argv] : ['gateway', 'serve', ...argv];
}

export async function main(argv = process.argv.slice(2), io = { stdout: process.stdout, stderr: process.stderr }) {
  if (isHelp(argv)) {
    print(gatewayUsage(), io);
    return 0;
  }
  return cliMain(gatewayArgv(argv), io);
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
