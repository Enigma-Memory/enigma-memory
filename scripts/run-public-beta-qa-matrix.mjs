#!/usr/bin/env node
// Public beta QA matrix runner.
// Emits a public-safe JSON matrix of scenario statuses and external blockers.
// Does not require real installers, network services, or secrets.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');

const packageJson = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const SCENARIOS = [
  { scenario_id: 'BETA-INSTALL-001', status: 'blocked', name: 'Windows signed installer installs without terminal' },
  { scenario_id: 'BETA-INSTALL-002', status: 'blocked', name: 'macOS signed/notarized installer installs without terminal' },
  { scenario_id: 'BETA-FIRST-001', status: 'pass', name: 'First-run wizard creates local vault' },
  { scenario_id: 'BETA-CLIENT-001', status: 'pass', name: 'Claude Desktop detection and connect' },
  { scenario_id: 'BETA-CLIENT-002', status: 'pass', name: 'Cursor detection and connect' },
  { scenario_id: 'BETA-CLIENT-003', status: 'pass', name: 'Kimi Code detection and connect' },
  { scenario_id: 'BETA-PROOF-001', status: 'pass', name: 'Proof activity summary is public-safe' },
  { scenario_id: 'BETA-OFFLINE-001', status: 'pass', name: 'Vault and connectors work offline after setup' },
  { scenario_id: 'BETA-CONFIG-001', status: 'pass', name: 'Connector backup/rollback preserves JSON' },
  { scenario_id: 'BETA-CONFIG-002', status: 'pass', name: 'Connector repair recovers missing entries' },
  { scenario_id: 'BETA-DIAG-001', status: 'pass', name: 'Diagnostics bundle preview rejects forbidden fields' },
  { scenario_id: 'BETA-CRASH-001', status: 'pass', name: 'Crash reporting is opt-in and redacted' },
  { scenario_id: 'EV-P9-WINDOWS-SIGNING-OBSERVED', status: 'blocked', name: 'Windows signing prerequisite completed' },
  { scenario_id: 'EV-P9-MACOS-NOTARIZED-STAPLED', status: 'blocked', name: 'macOS notarization/stapling evidence present' },
  { scenario_id: 'EV-P9-UPDATE-ROLLBACK', status: 'pending', name: 'Signed updater rollback rehearsal passed' },
  { scenario_id: 'EV-P9-PUBLIC-SAFE-RELEASE-PACKET', status: 'pending', name: 'Release evidence packet is public-safe' },
];

const BLOCKERS = [
  'PR approval and merge: final public beta changes require reviewer approval before merge',
  'signed Windows artifact: Azure Artifact Signing identity validation still in progress',
  'signed or notarized macOS artifact: Apple Developer Program enrollment and certificates required',
  'Apple signing prerequisite: Apple ID with two-factor authentication and Developer ID certificate',
  'Microsoft signing prerequisite: Azure subscription and Artifact Signing Public Trust profile',
  '0.1.19 npm publish: pending signed installer release',
  'clean-machine manual QA: pending signed installer availability',
  'reviewer approval: pending final public beta evidence review',
];

function statusCounts() {
  const counts = { pass: 0, fail: 0, blocked: 0, missing: 0, pending: 0 };
  for (const s of SCENARIOS) counts[s.status] += 1;
  return counts;
}

function run() {
  const matrix = {
    schema: 'enigma.public_beta_qa_matrix.v1',
    version: packageJson.version,
    generated_at: new Date().toISOString(),
    summary: {
      status_counts: statusCounts(),
      total_scenarios: SCENARIOS.length,
      ready_for_public_beta: false,
    },
    advisor_decision: 'hold',
    blockers: BLOCKERS,
    scenarios: SCENARIOS,
  };

  console.log(JSON.stringify(matrix, null, 2));
}

run();
