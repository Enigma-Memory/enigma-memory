#!/usr/bin/env node
// Clean-machine smoke test harness for Enigma Memory public beta.
// Run on a fresh Windows/macOS install after manual QA steps to collect
// public-safe evidence. Does not drive the UI; it inspects the installed
// app, vault, connectors, and local services.

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPublicSafeArtifact } from '../packages/core/src/index.js';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
export const CLEAN_MACHINE_SMOKE_SCHEMA = 'enigma.clean_machine_smoke.v1';
export const CLEAN_MACHINE_SMOKE_PLAN_SCHEMA = 'enigma.clean_machine_smoke_plan.v1';
const DEFAULT_MANIFEST_URL = 'https://enigmamemory.com/releases/desktop/manifest.json';
const STATUS_VALUES = new Set(['pass', 'fail', 'skip']);
const LOCAL_PATH_RE = /(?:[A-Za-z]:[\\/](?:Users|Windows|ProgramData|Program Files)[\\/][^\s<>|?*]+|\/(?:Users|home|tmp|var|opt|usr|etc|private|Volumes)\/[^\s<>]*)/u;

function scenario(id, name, status, evidence = {}) {
  if (!STATUS_VALUES.has(status)) throw new Error(`unsupported smoke status: ${status}`);
  return { scenario_id: id, name, status, evidence };
}

export function publicSafePath(p, fallback = '<local-path>') {
  if (typeof p !== 'string' || p.length === 0) return fallback;
  const normalizedHome = os.homedir().replace(/\\/g, '/');
  const normalized = p.replace(/\\/g, '/');
  if (path.isAbsolute(p) || /^[A-Za-z]:[\\/]/u.test(p)) return fallback;
  if (normalizedHome && normalized.startsWith(normalizedHome)) return fallback;
  if (LOCAL_PATH_RE.test(p) || LOCAL_PATH_RE.test(normalized)) return fallback;
  return normalized;
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

async function packageVersion() {
  const pkg = await readJsonSafe(path.join(ROOT, 'package.json'));
  return typeof pkg?.version === 'string' && pkg.version.trim() ? pkg.version : 'unknown';
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
    return scenario('SMOKE-INSTALL-001', 'Desktop app binary installed', 'fail', { expected: publicSafePath(appPath, '<app-binary-path>') });
  }

  const stats = await stat(appPath);
  return scenario('SMOKE-INSTALL-001', 'Desktop app binary installed', 'pass', {
    path_label: publicSafePath(appPath, '<app-binary-path>'),
    size_bytes: stats.size,
    modified_at: stats.mtime.toISOString(),
  });
}

async function checkMemoryDriveDataExists() {
  const platform = os.platform();
  let memoryDriveDir = null;
  if (platform === 'win32') {
    memoryDriveDir = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'enigma-desktop');
  } else if (platform === 'darwin') {
    memoryDriveDir = path.join(os.homedir(), 'Library', 'Application Support', 'enigma-desktop');
  } else {
    memoryDriveDir = path.join(os.homedir(), '.config', 'enigma-desktop');
  }

  const exists = await fileExists(memoryDriveDir);
  if (!exists) {
    return scenario('SMOKE-MEMORY-DRIVE-001', 'Memory Drive data directory exists', 'fail', { expected: publicSafePath(memoryDriveDir, '<memory-drive-data-path>') });
  }

  let entryCount = 0;
  try {
    const entries = await readdir(memoryDriveDir);
    entryCount = entries.filter((entry) => typeof entry === 'string' && entry.length > 0).length;
  } catch {
    // ignore
  }

  return scenario('SMOKE-MEMORY-DRIVE-001', 'Memory Drive data directory exists', 'pass', {
    path_label: publicSafePath(memoryDriveDir, '<memory-drive-data-path>'),
    entry_count: entryCount,
    entries_redacted: true,
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
    return scenario('SMOKE-CONNECTOR-001', 'Claude Desktop config exists', 'fail', {
      reason: 'unreadable config',
      path_label: publicSafePath(configPath, '<client-config-path>'),
    });
  }

  const mcpServers = config.mcpServers || {};
  const enigmaKeys = Object.keys(mcpServers).filter((k) => k.toLowerCase().includes('enigma'));

  return scenario('SMOKE-CONNECTOR-001', 'Claude Desktop config exists', 'pass', {
    path_label: publicSafePath(configPath, '<client-config-path>'),
    enigma_servers: enigmaKeys,
    total_servers: Object.keys(mcpServers).length,
  });
}

async function checkEngineService() {
  try {
    const response = await fetch('http://127.0.0.1:8787/health');
    const body = await response.text();
    if (!response.ok) {
      return scenario('SMOKE-ENGINE-001', 'Local engine service responds', 'fail', {
        status: response.status,
        body_hash: createHash('sha256').update(body).digest('hex').slice(0, 16),
      });
    }
    return scenario('SMOKE-ENGINE-001', 'Local engine service responds', 'pass', {
      status: response.status,
      body_hash: createHash('sha256').update(body).digest('hex').slice(0, 16),
    });
  } catch {
    return scenario('SMOKE-ENGINE-001', 'Local engine service responds', 'fail', { reason: 'connection refused' });
  }
}

async function checkUpdateManifest() {
  const manifestUrl = process.env.UPDATER_MANIFEST_URL || DEFAULT_MANIFEST_URL;
  const urlLabel = manifestUrl === DEFAULT_MANIFEST_URL ? DEFAULT_MANIFEST_URL : '<custom-updater-manifest-url>';
  try {
    const response = await fetch(manifestUrl);
    if (!response.ok) {
      return scenario('SMOKE-UPDATE-001', 'Update manifest reachable', 'fail', { url_label: urlLabel, status: response.status });
    }
    const manifest = await response.json();
    return scenario('SMOKE-UPDATE-001', 'Update manifest reachable', 'pass', {
      url_label: urlLabel,
      version: manifest.version ?? null,
      platforms: Object.keys(manifest.platforms || {}),
    });
  } catch (err) {
    return scenario('SMOKE-UPDATE-001', 'Update manifest reachable', 'fail', { url_label: urlLabel, reason_code: 'fetch_failed', error_hash: createHash('sha256').update(String(err?.message ?? err)).digest('hex').slice(0, 16) });
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

export async function runSmoke() {
  const scenarios = await Promise.all([
    checkInstalledApp(),
    checkMemoryDriveDataExists(),
    checkConnectorConfig(),
    checkEngineService(),
    checkUpdateManifest(),
    checkDiagnosticsBundle(),
  ]);

  const counts = { pass: 0, fail: 0, skip: 0 };
  for (const s of scenarios) counts[s.status] += 1;

  const report = {
    schema: CLEAN_MACHINE_SMOKE_SCHEMA,
    generated_at: new Date().toISOString(),
    app_version: await packageVersion(),
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
  const safety = verifyPublicSafeArtifact(report);
  if (!safety.ok) throw new Error(`clean-machine smoke report is not public-safe: ${safety.errors.join('; ')}`);
  return report;
}

export function buildCleanMachineSmokePlan(now = new Date()) {
  const plan = {
    schema: CLEAN_MACHINE_SMOKE_PLAN_SCHEMA,
    generated_at: now.toISOString(),
    command: 'node scripts/run-clean-machine-smoke.mjs --plain --out .enigma/public-beta/clean-machine-smoke.json',
    steps: [
      {
        step_id: 'install_desktop_app',
        title: 'Install the desktop app',
        action: 'Use the desktop installer supplied by the release owner for this platform, then open Enigma Memory.',
        expected_evidence: 'The app opens and the clean-machine smoke command can inspect the app without printing local paths.',
      },
      {
        step_id: 'first_run_default_setup',
        title: 'Confirm first-run local setup path',
        action: 'On first launch, use the default local setup path and continue past optional app-connection prompts without entering external account details.',
        expected_evidence: 'The QA checklist records whether setup reaches Create Memory Drive using pass/fail notes only; do not attach screenshots or private evidence.',
      },
      {
        step_id: 'create_memory_drive',
        title: 'Create the Memory Drive',
        action: 'Click Create Memory Drive and keep the recommended local storage location.',
        expected_evidence: 'The smoke report records a Memory Drive data check without exposing file names or memory contents.',
      },
      {
        step_id: 'connect_or_skip_client',
        title: 'Connect or skip an AI app',
        action: 'Use the in-app preview-first connector path. If no supported app is installed, continue without connecting one.',
        expected_evidence: 'The smoke report records connector presence, absence, or skip state without showing config JSON.',
      },
      {
        step_id: 'run_health_check',
        title: 'Run health check',
        action: 'Click Run health check in the desktop app, then leave the local engine running.',
        expected_evidence: 'The smoke report records local service readiness using status codes and hashes only.',
      },
      {
        step_id: 'export_public_safe_report',
        title: 'Export public-safe smoke evidence',
        action: 'Run the clean-machine smoke command and attach only the JSON report it writes.',
        expected_evidence: 'The report uses schema enigma.clean_machine_smoke.v1 and contains no raw memory, local paths, provider responses, credentials, screenshots, or account identifiers.',
      },
    ],
    safety: {
      dry_run: true,
      system_inspection_performed: false,
      network_performed: false,
      release_action_performed: false,
      local_paths_included: false,
      memory_text_included: false,
    },
    claim_boundary: 'Clean-machine smoke plan only. It performs no release action, upload, external account action, AI-provider action, billing claim, or legal review.',
  };
  const safety = verifyPublicSafeArtifact(plan);
  if (!safety.ok) throw new Error(`clean-machine smoke plan is not public-safe: ${safety.errors.join('; ')}`);
  return plan;
}

export function renderSmokePlanPlain(plan) {
  const lines = [
    'Enigma clean-machine smoke plan',
    `Command: ${plan.command}`,
    `Steps: ${Array.isArray(plan.steps) ? plan.steps.length : 0}`,
  ];
  for (const step of Array.isArray(plan.steps) ? plan.steps : []) {
    lines.push(`Step: ${step.step_id} — ${step.title}`);
  }
  lines.push('Boundary: plan only; no system inspection, network action, release action, raw memory, local paths, provider responses, credentials, screenshots, account identifiers, provider deletion, model behavior, signing, notarization, benchmark superiority, token ROI, or compliance claims.');
  return `${lines.join('\n')}\n`;
}

export function renderSmokePlain(report) {
  const counts = report.summary?.counts ?? {};
  const lines = [
    'Enigma clean-machine smoke',
    `Status: ${report.summary?.healthy ? 'Ready' : 'Needs attention'}`,
    `Version: ${report.app_version ?? 'unknown'}`,
    `Platform: ${report.platform ?? '<platform>'}/${report.arch ?? '<arch>'}`,
    `Scenarios: ${report.summary?.total ?? 0}`,
    `Pass: ${counts.pass ?? 0}`,
    `Fail: ${counts.fail ?? 0}`,
    `Skip: ${counts.skip ?? 0}`,
  ];
  for (const scenario of Array.isArray(report.scenarios) ? report.scenarios : []) {
    lines.push(`Scenario: ${scenario.scenario_id} — ${scenario.status}`);
  }
  lines.push('Boundary: local clean-machine smoke evidence only; no raw memory, local paths, account identifiers, screenshots, transcripts, provider responses, provider deletion, model behavior, hosted service, signing, notarization, benchmark superiority, token ROI, or compliance claims.');
  return `${lines.join('\n')}\n`;
}


function usage() {
  return `Usage: node scripts/run-clean-machine-smoke.mjs [--json|--plain] [--out <path>] [--dry-run]

Run clean-machine smoke checks and emit a public-safe report. --out always writes JSON evidence; --plain controls stdout only. --dry-run emits a public-safe collection plan and performs no system inspection, network request, or release action.
`;
}

async function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const plain = argv.includes('--plain') || argv.includes('--text') || argv.includes('--format=text') || argv.some((arg, index) => arg === '--format' && argv[index + 1] === 'text');
  const dryRun = argv.includes('--dry-run') || argv.includes('--plan');
  if (json && plain) throw new Error('Choose only one output format: --json or --plain.');
  const outIndex = argv.indexOf('--out');
  const outPath = outIndex >= 0 ? argv[outIndex + 1] : null;

  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage());
    process.exitCode = 0;
    return;
  }

  const report = dryRun ? buildCleanMachineSmokePlan() : await runSmoke();
  const evidenceJson = JSON.stringify(report, null, 2);
  const output = plain ? (dryRun ? renderSmokePlanPlain(report) : renderSmokePlain(report)) : `${evidenceJson}\n`;

  if (outPath) {
    const resolved = path.resolve(outPath);
    await mkdir(path.dirname(resolved), { recursive: true });
    await writeFile(resolved, `${evidenceJson}\n`, 'utf8');
  }
  process.stdout.write(output);

  process.exitCode = 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    process.stdout.write(`${JSON.stringify({ schema: CLEAN_MACHINE_SMOKE_SCHEMA, ok: false, error: { code: 'CLEAN_MACHINE_SMOKE_ERROR', message: err.message } }, null, 2)}\n`);
    process.exitCode = 1;
  });
}
