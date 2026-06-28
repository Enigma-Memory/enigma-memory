#!/usr/bin/env node
// Clean-machine smoke test harness for Enigma Memory public beta.
// Run on a fresh Windows/macOS install after manual QA steps to collect
// public-safe evidence. Does not drive the UI; it inspects the installed
// app, vault, connectors, and local services.

import { createHash } from 'node:crypto';
import { readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');

function scenario(id, name, status, evidence = {}) {
  return { scenario_id: id, name, status, evidence };
}

function publicSafePath(p) {
  if (typeof p !== 'string') return '';
  const home = os.homedir();
  return p.replace(home, '~').replace(/^[A-Za-z]:\\Users\\[^\\]+/g, '~');
}

async function fileExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function readJsonSafe(p) {
  try {
    return JSON.parse(await readFile(p, 'utf8'));
  } catch {
    return null;
  }
}

async function checkInstalledApp() {
  const platform = os.platform();
  let appPath = null;
  if (platform === 'win32') {
    appPath = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Enigma Memory', 'Enigma Memory.exe');
  } else if (platform === 'darwin') {
    appPath = '/Applications/Enigma Memory.app';
  } else {
    appPath = path.join(os.homedir(), '.local', 'share', 'enigma-memory', 'enigma-memory');
  }

  const exists = await fileExists(appPath);
  if (!exists) {
    return scenario('SMOKE-INSTALL-001', 'Desktop app binary installed', 'fail', { expected: publicSafePath(appPath) });
  }

  const stats = await stat(appPath);
  return scenario('SMOKE-INSTALL-001', 'Desktop app binary installed', 'pass', {
    path_label: publicSafePath(appPath),
    size_bytes: stats.size,
    modified_at: stats.mtime.toISOString(),
  });
}

async function checkVaultExists() {
  const platform = os.platform();
  let vaultDir = null;
  if (platform === 'win32') {
    vaultDir = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'enigma-desktop');
  } else if (platform === 'darwin') {
    vaultDir = path.join(os.homedir(), 'Library', 'Application Support', 'enigma-desktop');
  } else {
    vaultDir = path.join(os.homedir(), '.config', 'enigma-desktop');
  }

  const exists = await fileExists(vaultDir);
  if (!exists) {
    return scenario('SMOKE-VAULT-001', 'Local vault directory exists', 'fail', { expected: publicSafePath(vaultDir) });
  }

  const files = [];
  try {
    const entries = await readdir(vaultDir);
    for (const entry of entries.slice(0, 20)) files.push(entry);
  } catch {
    // ignore
  }

  return scenario('SMOKE-VAULT-001', 'Local vault directory exists', 'pass', {
    path_label: publicSafePath(vaultDir),
    entries: files,
  });
}

async function checkConnectorConfig() {
  const platform = os.platform();
  let configDir = null;
  if (platform === 'win32') {
    configDir = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Claude');
  } else if (platform === 'darwin') {
    configDir = path.join(os.homedir(), 'Library', 'Application Support', 'Claude');
  } else {
    configDir = path.join(os.homedir(), '.config', 'Claude');
  }

  const configPath = path.join(configDir, 'claude_desktop_config.json');
  const exists = await fileExists(configPath);
  if (!exists) {
    return scenario('SMOKE-CONNECTOR-001', 'Claude Desktop config exists', 'skip', { reason: 'Claude config not found' });
  }

  const config = await readJsonSafe(configPath);
  if (!config || typeof config !== 'object') {
    return scenario('SMOKE-CONNECTOR-001', 'Claude Desktop config exists', 'fail', { reason: 'unreadable config' });
  }

  const mcpServers = config.mcpServers || {};
  const enigmaKeys = Object.keys(mcpServers).filter((k) => k.toLowerCase().includes('enigma'));

  return scenario('SMOKE-CONNECTOR-001', 'Claude Desktop config exists', 'pass', {
    path_label: publicSafePath(configPath),
    enigma_servers: enigmaKeys,
    total_servers: Object.keys(mcpServers).length,
  });
}

async function checkEngineService() {
  try {
    const response = await fetch('http://127.0.0.1:8787/health');
    const body = await response.text();
    return scenario('SMOKE-ENGINE-001', 'Local engine service responds', 'pass', {
      status: response.status,
      body_hash: createHash('sha256').update(body).digest('hex').slice(0, 16),
    });
  } catch {
    return scenario('SMOKE-ENGINE-001', 'Local engine service responds', 'fail', { reason: 'connection refused' });
  }
}

async function checkUpdateManifest() {
  const manifestUrl = process.env.UPDATER_MANIFEST_URL || 'https://enigmamemory.com/releases/desktop/manifest.json';
  try {
    const response = await fetch(manifestUrl);
    if (!response.ok) {
      return scenario('SMOKE-UPDATE-001', 'Update manifest reachable', 'fail', { status: response.status });
    }
    const manifest = await response.json();
    return scenario('SMOKE-UPDATE-001', 'Update manifest reachable', 'pass', {
      url: manifestUrl,
      version: manifest.version ?? null,
      platforms: Object.keys(manifest.platforms || {}),
    });
  } catch (err) {
    return scenario('SMOKE-UPDATE-001', 'Update manifest reachable', 'fail', { reason: err.message });
  }
}

async function checkDiagnosticsBundle() {
  const platform = os.platform();
  let dataDir = null;
  if (platform === 'win32') {
    dataDir = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'enigma-desktop');
  } else if (platform === 'darwin') {
    dataDir = path.join(os.homedir(), 'Library', 'Application Support', 'enigma-desktop');
  } else {
    dataDir = path.join(os.homedir(), '.config', 'enigma-desktop');
  }

  const crashConfigPath = path.join(dataDir, 'crash-reporting.json');
  const exists = await fileExists(crashConfigPath);
  if (!exists) {
    return scenario('SMOKE-DIAG-001', 'Crash reporting config exists', 'skip', { reason: 'no crash config yet' });
  }

  const config = await readJsonSafe(crashConfigPath);
  return scenario('SMOKE-DIAG-001', 'Crash reporting config exists', 'pass', {
    enabled: config?.enabled ?? false,
    has_endpoint: !!config?.endpoint,
  });
}

async function runSmoke() {
  const scenarios = await Promise.all([
    checkInstalledApp(),
    checkVaultExists(),
    checkConnectorConfig(),
    checkEngineService(),
    checkUpdateManifest(),
    checkDiagnosticsBundle(),
  ]);

  const counts = { pass: 0, fail: 0, skip: 0 };
  for (const s of scenarios) counts[s.status] += 1;

  return {
    schema: 'enigma.clean_machine_smoke.v1',
    generated_at: new Date().toISOString(),
    app_version: '0.1.18',
    platform: os.platform(),
    arch: os.arch(),
    os_release: os.release(),
    summary: {
      total: scenarios.length,
      counts,
      healthy: counts.fail === 0,
    },
    scenarios,
  };
}

function usage() {
  return `Usage: node scripts/run-clean-machine-smoke.mjs [--json] [--out <path>]

Run clean-machine smoke checks and emit a public-safe report.
`;
}

async function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const outIndex = argv.indexOf('--out');
  const outPath = outIndex >= 0 ? argv[outIndex + 1] : null;

  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage());
    process.exitCode = 0;
    return;
  }

  const report = await runSmoke();
  const output = json ? JSON.stringify(report, null, 2) : JSON.stringify(report, null, 2);

  if (outPath) {
    await writeFile(path.resolve(outPath), `${output}\n`, 'utf8');
  }
  console.log(output);

  process.exitCode = 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
