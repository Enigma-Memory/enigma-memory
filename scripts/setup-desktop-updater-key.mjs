#!/usr/bin/env node
// Generate a Tauri v2 updater Ed25519 key pair and update the public key in
// apps/desktop-tauri/tauri.conf.json. The private key is printed to stdout
// (or saved to a file) so it can be stored as a GitHub secret; it is never
// committed to the repository.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const TAURI_DIR = path.join(ROOT, 'apps', 'desktop-tauri');
const CONFIG_PATH = path.join(TAURI_DIR, 'tauri.conf.json');

function run(cmd, args, options = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...options });
}

function ensureTauriCli() {
  try {
    run('npx', ['@tauri-apps/cli', '--version'], { cwd: TAURI_DIR });
  } catch (err) {
    console.error('Installing @tauri-apps/cli...');
    run('npm', ['install', '-g', '@tauri-apps/cli'], { cwd: ROOT });
  }
}

function generateKeyPair() {
  const privateKeyPath = path.join(TAURI_DIR, 'tauri-signing-private-key');
  const publicKeyPath = `${privateKeyPath}.pub`;

  // tauri signer generate writes private key to file and prints public key to stdout.
  run('npx', ['@tauri-apps/cli', 'signer', 'generate', '-w', privateKeyPath, '-p', publicKeyPath], {
    cwd: TAURI_DIR,
  });

  const privateKey = readFileSync(privateKeyPath, 'utf8').trim();
  const publicKey = readFileSync(publicKeyPath, 'utf8').trim();

  return { privateKey, publicKey, privateKeyPath, publicKeyPath };
}

function updateConfig(publicKey) {
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  if (!config.plugins) config.plugins = {};
  if (!config.plugins.updater) config.plugins.updater = {};
  config.plugins.updater.pubkey = publicKey;
  writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

function main() {
  ensureTauriCli();
  const { privateKey, publicKey } = generateKeyPair();
  updateConfig(publicKey);
  console.log('\nGenerated Tauri updater key pair.');
  console.log('\nAdd this GitHub secret:');
  console.log('  Name:  TAURI_SIGNING_PRIVATE_KEY');
  console.log('  Value: <see private key printed below>');
  console.log('\nPrivate key (keep secret):');
  console.log(privateKey);
  console.log('\nUpdated apps/desktop-tauri/tauri.conf.json with the public key.');
  console.log('Commit tauri.conf.json, but never commit the private key.');
}

main();
