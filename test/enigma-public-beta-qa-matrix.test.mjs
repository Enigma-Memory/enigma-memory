import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildPublicBetaQaMatrix, buildRankedNextActions, buildScenarioRows, mergeEvidenceOptions, normalizeEvidenceManifest, parseArgs, renderPublicBetaQaPlain } from '../scripts/run-public-beta-qa-matrix.mjs';

const GENERATED_AT = '2026-06-28T00:00:00.000Z';

const STATUS_VALUES = new Set(['pass', 'fail', 'blocked', 'missing', 'pending']);
const REQUIRED_SCENARIO_IDS = [
  'BETA-INSTALL-001',
  'BETA-FIRST-001',
  'BETA-CLIENT-001',
  'BETA-CLIENT-002',
  'BETA-CLIENT-003',
  'BETA-CLIENT-CLAUDE-001',
  'BETA-PROOF-001',
  'BETA-OFFLINE-001',
  'BETA-CONFIG-001',
  'BETA-CONFIG-002',
  'BETA-DIAG-001',
  'BETA-CRASH-001',
  'BETA-SIGNING-WINDOWS-001',
  'BETA-SIGNING-MACOS-001',
  'BETA-UPDATE-001',
  'BETA-NPM-001',
  'BETA-MERGE-001',
  'EV-P9-WINDOWS-SIGNING-OBSERVED',
  'EV-P9-MACOS-NOTARIZED-STAPLED',
  'EV-P9-UPDATE-ROLLBACK',
  'EV-P9-PUBLIC-SAFE-RELEASE-PACKET',
];

const FORBIDDEN_PUBLIC_FIELD_NAMES = new Set([
  'account_id',
  'api_key',
  'authorization',
  'body',
  'credential',
  'credentials',
  'customer_id',
  'customer_identifier',
  'evidence_body',
  'key_material',
  'local_path',
  'owner_name',
  'password',
  'plaintext',
  'private_key',
  'prompt',
  'provider_response',
  'raw_evidence',
  'raw_memory',
  'real_owner_name',
  'secret',
  'signing_secret',
  'text',
  'token',
  'transcript',
]);

const FORBIDDEN_PUBLIC_VALUE_PATTERNS = [
  /[A-Za-z]:\\(?:Documents and Settings|Program Files|ProgramData|Temp|Users|Windows)\\/i,
  /\/Users\/[A-Za-z0-9._-]+\//,
  /\/home\/[A-Za-z0-9._-]+\//,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\b(?:api|access|refresh|bearer)[_-]?token\s*[:=]/i,
  /\bsk-[A-Za-z0-9]{8,}\b/,
  /\bprovider_response\s*[:=]/i,
  /\bprompt\s*[:=]/i,
  /\btranscript\s*[:=]/i,
  /\bcustomer[_-]?id\s*[:=]/i,
  /\baccount[_-]?id\s*[:=]/i,
];

const EXTERNAL_BLOCKERS = [
  { label: 'PR approval and merge', pattern: /(?:pr|pull[-_ ]?request).*merge|merge.*(?:pr|pull[-_ ]?request)/i },
  { label: '0.1.19 npm publish', pattern: /0[._-]1[._-]19|npm.*publish|publish.*npm/i },
  { label: 'signed Windows artifact', pattern: /windows.*sign|sign.*windows/i },
  { label: 'signed or notarized macOS artifact', pattern: /(?:macos|mac|darwin).*(?:sign|notari[sz])|(?:sign|notari[sz]).*(?:macos|mac|darwin)/i },
  { label: 'Apple signing prerequisite', pattern: /apple.*(?:sign|developer|identity|certificate)/i },
  { label: 'Microsoft signing prerequisite', pattern: /microsoft.*(?:sign|identity|certificate|store)|windows.*(?:identity|certificate)/i },
  { label: 'clean-machine manual QA', pattern: /clean[-_ ]?machine|clean[-_ ]?profile|manual[-_ ]?qa/i },
  { label: 'reviewer approval', pattern: /reviewer.*approval|approval.*reviewer|claim.*review|review.*approval/i },
];

let matrixPromise;

function loadMatrix() {
  matrixPromise ??= buildPublicBetaQaMatrix({ generated_at: GENERATED_AT });
  return matrixPromise;
}

function scenarioList(matrix) {
  assert.ok(matrix.scenarios, 'matrix.scenarios missing');
  const scenarios = Array.isArray(matrix.scenarios) ? matrix.scenarios : Object.values(matrix.scenarios);
  assert.ok(scenarios.length > 0, 'matrix.scenarios must not be empty');
  return scenarios;
}

function scenarioId(scenario) {
  return scenario.scenario_id ?? scenario.id;
}

function scenarioById(scenarios, id) {
  const found = scenarios.find((scenario) => scenarioId(scenario) === id);
  assert.ok(found, `missing scenario ${id}`);
  return found;
}

function collectKeysAndValues(value, keys = [], strings = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectKeysAndValues(item, keys, strings);
    return { keys, strings };
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      keys.push(key);
      collectKeysAndValues(child, keys, strings);
    }
    return { keys, strings };
  }
  if (typeof value === 'string') strings.push(value);
  return { keys, strings };
}

function assertPublicSafe(value) {
  const { keys, strings } = collectKeysAndValues(value);
  for (const key of keys) {
    assert.equal(FORBIDDEN_PUBLIC_FIELD_NAMES.has(key.toLowerCase()), false, `${key} must not be emitted as a public field name`);
  }
  for (const string of strings) {
    for (const pattern of FORBIDDEN_PUBLIC_VALUE_PATTERNS) {
      assert.doesNotMatch(string, pattern, `public matrix value leaked forbidden private material: ${string}`);
    }
  }
}

function expectedStatusCounts(scenarios) {
  const counts = { pass: 0, fail: 0, blocked: 0, missing: 0, pending: 0 };
  for (const scenario of scenarios) {
    assert.ok(STATUS_VALUES.has(scenario.status), `${scenarioId(scenario)} has unsupported status ${scenario.status}`);
    counts[scenario.status] += 1;
  }
  return counts;
}

test('public beta QA npm scripts expose JSON and Advisor runners', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(packageJson.scripts['public-beta-qa'], 'node scripts/run-public-beta-qa-matrix.mjs --json');
  assert.equal(packageJson.scripts['public-beta:advisor'], 'node scripts/run-public-beta-qa-matrix.mjs --plain');
});

test('public beta QA runner accepts explicit plain output mode', () => {
  assert.deepEqual(parseArgs(['--plain']), { json: false, plain: true, out: null, evidenceManifest: null, cleanMachineSmoke: null, supportDryRun: [], registryInstall: null, desktopReleaseEvidence: null, productionHandoffPacket: null });
  assert.deepEqual(parseArgs(['--format', 'text']), { json: false, plain: true, out: null, evidenceManifest: null, cleanMachineSmoke: null, supportDryRun: [], registryInstall: null, desktopReleaseEvidence: null, productionHandoffPacket: null });
  assert.deepEqual(parseArgs(['--evidence-manifest', 'evidence.json']), { json: false, plain: false, out: null, evidenceManifest: 'evidence.json', cleanMachineSmoke: null, supportDryRun: [], registryInstall: null, desktopReleaseEvidence: null, productionHandoffPacket: null });
  assert.deepEqual(parseArgs(['--clean-machine-smoke', 'smoke.json']), { json: false, plain: false, out: null, evidenceManifest: null, cleanMachineSmoke: 'smoke.json', supportDryRun: [], registryInstall: null, desktopReleaseEvidence: null, productionHandoffPacket: null });
  assert.deepEqual(parseArgs(['--support-dry-run', 'diag.json', '--support-dry-run', 'crash.json']), { json: false, plain: false, out: null, evidenceManifest: null, cleanMachineSmoke: null, supportDryRun: ['diag.json', 'crash.json'], registryInstall: null, desktopReleaseEvidence: null, productionHandoffPacket: null });
  assert.deepEqual(parseArgs(['--registry-install', 'registry.json']), { json: false, plain: false, out: null, evidenceManifest: null, cleanMachineSmoke: null, supportDryRun: [], registryInstall: 'registry.json', desktopReleaseEvidence: null, productionHandoffPacket: null });
  assert.deepEqual(parseArgs(['--desktop-release-evidence', 'desktop.json']), { json: false, plain: false, out: null, evidenceManifest: null, cleanMachineSmoke: null, supportDryRun: [], registryInstall: null, desktopReleaseEvidence: 'desktop.json', productionHandoffPacket: null });
  assert.deepEqual(parseArgs(['--production-handoff-packet', 'handoff.json']), { json: false, plain: false, out: null, evidenceManifest: null, cleanMachineSmoke: null, supportDryRun: [], registryInstall: null, desktopReleaseEvidence: null, productionHandoffPacket: 'handoff.json' });
  assert.throws(() => parseArgs(['--json', '--plain']), /Choose only one output format/);
});

test('public beta evidence manifest normalizes one-file release-owner inputs', () => {
  const manifest = {
    schema: 'enigma.public_beta_evidence_manifest.v1',
    clean_machine_smoke: 'smoke.json',
    support_dry_run: ['diag.json'],
    registry_install: 'registry.json',
    desktop_release_evidence: 'desktop.json',
    production_handoff_packet: 'handoff.json',
  };
  assert.deepEqual(normalizeEvidenceManifest(manifest), {
    cleanMachineSmoke: 'smoke.json',
    supportDryRun: ['diag.json'],
    registryInstall: 'registry.json',
    desktopReleaseEvidence: 'desktop.json',
    productionHandoffPacket: 'handoff.json',
  });
  assert.deepEqual(mergeEvidenceOptions({ supportDryRun: ['crash.json'], registryInstall: 'override-registry.json' }, manifest), {
    supportDryRun: ['diag.json', 'crash.json'],
    registryInstall: 'override-registry.json',
    cleanMachineSmoke: 'smoke.json',
    desktopReleaseEvidence: 'desktop.json',
    productionHandoffPacket: 'handoff.json',
  });
  assert.throws(() => normalizeEvidenceManifest({ schema: 'wrong' }), /Evidence manifest schema mismatch/);
});

test('public beta QA manifest treats missing optional evidence paths as blockers', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-public-beta-missing-evidence-'));
  try {
    const manifestPath = join(dir, 'evidence-manifest.json');
    await writeFile(manifestPath, `${JSON.stringify({
      schema: 'enigma.public_beta_evidence_manifest.v1',
      clean_machine_smoke: join(dir, 'missing-clean-machine.json'),
      support_dry_run: [join(dir, 'missing-support.json')],
      registry_install: join(dir, 'missing-registry.json'),
      desktop_release_evidence: join(dir, 'missing-desktop.json'),
      production_handoff_packet: join(dir, 'missing-handoff.json'),
    }, null, 2)}\n`, 'utf8');

    const matrix = await buildPublicBetaQaMatrix({ evidenceManifest: manifestPath });
    assert.equal(matrix.advisor_decision, 'hold');
    assert.equal(matrix.summary.ready_for_public_beta, false);
    assert.equal(matrix.next_actions.some((action) => action.action_id === 'record_support_dry_run'), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('public beta advisor collect-next paths follow relative evidence manifest targets', async () => {
  const dir = `.enigma/public-beta-target-test-${process.pid}-${Date.now()}`;
  try {
    await mkdir(dir, { recursive: true });
    const manifestPath = `${dir}/evidence-manifest.json`;
    await writeFile(manifestPath, `${JSON.stringify({
      schema: 'enigma.public_beta_evidence_manifest.v1',
      clean_machine_smoke: `${dir}/clean-machine-smoke.json`,
      support_dry_run: [`${dir}/support-dry-run-diagnostics.json`, `${dir}/support-dry-run-crash.json`],
      registry_install: `${dir}/registry-install.json`,
      desktop_release_evidence: `${dir}/desktop-release-evidence.json`,
      production_handoff_packet: `${dir}/production-handoff-packet.json`,
    }, null, 2)}\n`, 'utf8');

    const matrix = await buildPublicBetaQaMatrix({ evidenceManifest: manifestPath });
    const plain = renderPublicBetaQaPlain(matrix);
    assertPublicSafe(matrix.next_actions);
    assert.equal(matrix.next_actions.find((action) => action.action_id === 'approve_merge_release_pr').collect_next.target_file, `${dir}/production-handoff-packet.json`);
    assert.equal(matrix.next_actions.find((action) => action.action_id === 'publish_npm_0_1_19').collect_next.target_file, `${dir}/registry-install.json`);
    assert.equal(matrix.next_actions.find((action) => action.action_id === 'complete_signing_identities').collect_next.target_file, `${dir}/desktop-release-evidence.json`);
    assert.equal(matrix.next_actions.find((action) => action.action_id === 'record_support_dry_run').collect_next.target_file, `${dir}/support-dry-run-diagnostics.json`);
    assert.equal(matrix.consumer_next_action.collect_next.target_file, `${dir}/clean-machine-smoke.json`);
    assert.deepEqual(matrix.consumer_next_action.collect_next.collect_commands, [
      `npm run production:clean-machine-smoke -- --plain --out ${dir}/clean-machine-smoke.json`,
    ]);
    assert.deepEqual(matrix.next_actions.find((action) => action.action_id === 'record_support_dry_run').collect_next.target_files, [`${dir}/support-dry-run-diagnostics.json`, `${dir}/support-dry-run-crash.json`]);
    assert.deepEqual(matrix.next_actions.find((action) => action.action_id === 'record_support_dry_run').collect_next.collect_commands, [
      `npm run production:support-dry-run -- --preset diagnostics --triage-result <observed-result> --bundle-privacy-check-status <observed-status> --out ${dir}/support-dry-run-diagnostics.json`,
      `npm run production:support-dry-run -- --preset crash --triage-result <observed-result> --bundle-privacy-check-status <observed-status> --out ${dir}/support-dry-run-crash.json`,
    ]);
    assert.match(plain, new RegExp(`Collect next: approve_merge_release_pr .* into ${dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/production-handoff-packet\\.json`));
    assert.match(plain, new RegExp(`Collect next: publish_npm_0_1_19 .* into ${dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/registry-install\\.json`));
    assert.match(plain, new RegExp(`Collect: npm run public-beta:evidence-manifest -- --out ${dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/evidence-manifest\\.json --plain`));
    assert.match(plain, new RegExp(`Collect internal: run_clean_machine_qa .* into ${dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/clean-machine-smoke\\.json`));
    assert.match(plain, new RegExp(`Collect consumer: run_clean_machine_qa .* into ${dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/clean-machine-smoke\\.json`));
    assert.ok(plain.includes(`Run: npm run production:clean-machine-smoke -- --plain --out ${dir}/clean-machine-smoke.json`));
    assert.match(plain, new RegExp(`Collect internal: record_support_dry_run .* into ${dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/support-dry-run-diagnostics\\.json`));
    assert.match(plain, new RegExp(`Collect internal: record_support_dry_run .* into ${dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/support-dry-run-crash\\.json`));
    assert.ok(plain.includes(`Run: npm run production:support-dry-run -- --preset diagnostics --triage-result <observed-result> --bundle-privacy-check-status <observed-status> --out ${dir}/support-dry-run-diagnostics.json`));
    assert.ok(plain.includes(`Run: npm run production:support-dry-run -- --preset crash --triage-result <observed-result> --bundle-privacy-check-status <observed-status> --out ${dir}/support-dry-run-crash.json`));
    assert.match(plain, /Allowed observed-result: resolved, needs_user_action, escalated, release_blocker, blocked/);
    assert.match(plain, /Allowed observed-status: pass, fail, blocked, not_applicable/);
    assert.match(plain, new RegExp(`Review: npm run public-beta:advisor -- --evidence-manifest ${dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/evidence-manifest\\.json`));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('public beta QA plain output is readable, bounded, and non-JSON', async () => {
  const matrix = await loadMatrix();
  const plain = renderPublicBetaQaPlain(matrix);

  assert.match(plain, /^Enigma public beta QA advisor\n/);
  assert.match(plain, /Decision: HOLD/);
  assert.match(plain, /Ready for public beta: no/);
  assert.match(plain, /Blocked: /);
  assert.match(plain, /Pending: /);
  assert.match(plain, /Top consumer blocker: run_clean_machine_qa — Run clean-machine Windows\/macOS install, first-run, connector, proof, offline, update, diagnostics, and uninstall QA\./);
  assert.match(plain, /Collect consumer: run_clean_machine_qa — EV-P10-CLEAN-MACHINE-SMOKE into \.enigma\/public-beta\/clean-machine-smoke\.json/);
  assert.match(plain, /Collect: npm run public-beta:evidence-manifest -- --out \.enigma\/public-beta\/evidence-manifest\.json --plain/);
  assert.match(plain, /Review: npm run public-beta:advisor -- --evidence-manifest \.enigma\/public-beta\/evidence-manifest\.json/);
  assert.match(plain, /Collect next: approve_merge_release_pr — EV-P10-PRODUCTION-HANDOFF-PACKET into \.enigma\/public-beta\/production-handoff-packet\.json: release PR ref or URL, reviewer approval ref, merge ref, public-safe release packet approval ref, and approval date/);
  assert.match(plain, /Collect next: publish_npm_0_1_19 — EV-P10-REGISTRY-INSTALL into \.enigma\/public-beta\/registry-install\.json: npm package version, registry package ref, install command used, and public-safe install result/);
  assert.match(plain, /Internal QA\/support evidence to collect now:/);
  assert.match(plain, /Internal: run_clean_machine_qa/);
  assert.match(plain, /Collect internal: run_clean_machine_qa — EV-P10-CLEAN-MACHINE-SMOKE into \.enigma\/public-beta\/clean-machine-smoke\.json/);
  assert.match(plain, /Internal: record_support_dry_run/);
  assert.match(plain, /Collect internal: record_support_dry_run — EV-P10-SUPPORT-DRY-RUN-SUMMARY into \.enigma\/public-beta\/support-dry-run/);
  assert.match(plain, /Run: npm run production:support-dry-run -- --preset diagnostics --triage-result <observed-result> --bundle-privacy-check-status <observed-status> --out \.enigma\/public-beta\/support-dry-run-diagnostics\.json/);
  assert.match(plain, /privacy_scan\.status=pass, zero private findings/);
  assert.match(plain, /Patchable evidence:/);
  assert.match(plain, /Evidence: record_support_dry_run — EV-P10-SUPPORT-DRY-RUN-SUMMARY/);
  assert.match(plain, /public-safe support dry-run summary/);
  assert.match(plain, /Fields: scenario_id, issue_code, triage_result, bundle_privacy_check_status, support_owner_ref, privacy_scan/);
  assert.match(plain, /Boundary: local repository and supplied public-safe evidence matrix only/);
  assert.doesNotMatch(plain, /^\s*\{/);
  assertPublicSafe(plain);
});

test('public beta QA matrix emits the expected public schema and scenario coverage', async () => {
  const matrix = await loadMatrix();
  const scenarios = scenarioList(matrix);
  const ids = new Set(scenarios.map(scenarioId));

  assert.equal(matrix.schema, 'enigma.public_beta_qa_matrix.v1');
  assert.match(matrix.version, /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/);
  assert.match(matrix.generated_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/);
  assert.ok(matrix.summary && typeof matrix.summary === 'object', 'matrix.summary missing');
  assert.ok(Array.isArray(matrix.blockers), 'matrix.blockers must be an array');

  assert.ok(Array.isArray(matrix.next_actions), 'matrix.next_actions must be an array');
  assert.equal(matrix.next_actions[0].action_id, 'approve_merge_release_pr');
  assert.equal(matrix.next_actions[0].blocker_id, 'BLOCKER-PR-APPROVAL-MERGE-REVIEWER-APPROVAL');
  assert.equal(matrix.next_actions[0].priority, 1);
  assert.equal(matrix.next_actions.every((action, index) => action.priority === index + 1), true);
  for (const id of REQUIRED_SCENARIO_IDS) assert.ok(ids.has(id), `missing required public beta QA scenario ${id}`);
  for (const scenario of scenarios) {
    assert.equal(typeof scenarioId(scenario), 'string', 'scenario id must be a string');
    assert.ok(STATUS_VALUES.has(scenario.status), `${scenarioId(scenario)} has unsupported status ${scenario.status}`);
  }
});

test('public beta QA matrix summary counts match scenario statuses and hold the Advisor gate', async () => {
  const matrix = await loadMatrix();
  const scenarios = scenarioList(matrix);
  const statusCounts = expectedStatusCounts(scenarios);

  assert.deepEqual(matrix.summary.status_counts, statusCounts);
  assert.equal(matrix.summary.total_scenarios, scenarios.length);
  assert.equal(matrix.summary.ready_for_public_beta, false);
  assert.equal(matrix.advisor_decision, 'hold');
  assert.ok(statusCounts.blocked + statusCounts.missing + statusCounts.pending + statusCounts.fail > 0, 'matrix must not overclaim public beta readiness');
  assert.ok(matrix.blockers.length > 0, 'hold decision must name blockers');
  assert.ok(matrix.next_actions.length > 0, 'hold decision must include ranked next actions');
  assert.equal(matrix.next_actions.every((action) => matrix.blockers.some((blocker) => blocker.blocker_id === action.blocker_id)), true);
});

test('public beta QA matrix reports external production blockers without requiring real installers or network', async () => {
  const matrix = await loadMatrix();
  const blockerText = JSON.stringify({ blockers: matrix.blockers, scenarios: scenarioList(matrix) });

  for (const blocker of EXTERNAL_BLOCKERS) {
    assert.match(blockerText, blocker.pattern, `missing external blocker: ${blocker.label}`);
  }

  const p9Scenarios = scenarioList(matrix).filter((scenario) => String(scenarioId(scenario)).startsWith('EV-P9-'));
  assert.ok(p9Scenarios.length >= 4, 'signing/update/release evidence scenarios must be present');
  for (const scenario of p9Scenarios) {
    assert.ok(['blocked', 'missing', 'pending', 'fail'].includes(scenario.status), `${scenarioId(scenario)} must not pass without signed release evidence`);
  }
});

test('support dry-run blocker names the concrete public-safe evidence summary still missing', async () => {
  const matrix = await loadMatrix();
  const supportDryRun = matrix.blockers.find((blocker) => blocker.blocker_id === 'BLOCKER-SUPPORT-DRY-RUN');

  assert.ok(supportDryRun, 'support dry-run blocker must be reported');
  assert.equal(supportDryRun.status, 'blocked');
  assert.ok(supportDryRun.scenario_ids.includes('BETA-DIAG-001'));
  assert.ok(supportDryRun.scenario_ids.includes('BETA-CRASH-001'));
  assert.ok(supportDryRun.evidence_refs.includes('ref:repo:scripts.build-support-dry-run-summary.mjs'));

  assert.deepEqual(supportDryRun.missing_evidence_items, [
    {
      evidence_item_id: 'EV-P10-SUPPORT-DRY-RUN-SUMMARY',
      evidence_kind: 'public-safe support dry-run summary',
      required_fields: [
        'scenario_id',
        'issue_code',
        'triage_result',
        'bundle_privacy_check_status',
        'support_owner_ref',
        'privacy_scan',
      ],
      notes: 'Record support triage outcomes and privacy_scan.status=pass with zero private findings only; omit raw logs, screenshots, transcripts, credentials, account identifiers, owner names, and local absolute paths.',
    },
  ]);
  assert.equal(matrix.advisor_decision, 'hold');
  assert.equal(matrix.summary.ready_for_public_beta, false);
});

test('public beta QA matrix can consume clean-machine smoke evidence without clearing signing blockers', () => {
  const scenarios = buildScenarioRows({
    tauriConfig: { bundle: { active: true, targets: ['msi', 'nsis', 'dmg', 'app'] } },
    wizardUi: 'Create my Memory Drive Find my apps Connect your AI apps Run health check Your Memory Drive is ready Proof activity Export bundle Crash reporting Repair connection Rollback',
    helpUi: 'Proof artifacts can show hashes',
    desktopIndex: './wizard.js',
    serviceCommands: 'create_vault detect_clients connect_client get_health offline_ready repair_client rollback_client malformed backup',
    diagnosticsCommands: 'FORBIDDEN_KEYS export_diagnostics approve redact_path',
    crashCommands: 'init_panic_hook opt-in required pending-crash-reports',
    updateCommands: '"offline"',
    libCommands: 'commands::service::get_health',
    desktopReleaseWorkflow: 'Sign update manifest',
    npmPublishWorkflow: 'npm publish --access public --provenance',
    packageVersion: '0.1.19',
    mcpbManifest: { schema: 'enigma.claude_desktop_mcpb_manifest.v1' },
    mcpbConnectionPlan: { preferred_path: 'mcpb_extension', automatic_config_write: false },
    mcpbHealth: { ready_requires_test_evidence: true },
    releaseEvidenceScript: 'present',
    updateSignerScript: 'present',
    cleanMachineSmoke: {
      schema: 'enigma.clean_machine_smoke.v1',
      app_version: '0.1.19',
      summary: { healthy: true },
    },
  });

  assert.equal(scenarioById(scenarios, 'BETA-FIRST-001').status, 'pass');
  assert.equal(scenarioById(scenarios, 'BETA-CLIENT-001').status, 'pass');
  assert.equal(scenarioById(scenarios, 'BETA-PROOF-001').status, 'pass');
  assert.equal(scenarioById(scenarios, 'BETA-OFFLINE-001').status, 'pass');
  assert.equal(scenarioById(scenarios, 'BETA-CONFIG-001').status, 'pass');
  assert.equal(scenarioById(scenarios, 'BETA-CONFIG-002').status, 'pass');
  assert.match(JSON.stringify(scenarioById(scenarios, 'BETA-FIRST-001').evidence_refs), /ref:evidence:clean-machine-smoke/);

  const install = scenarioById(scenarios, 'BETA-INSTALL-001');
  assert.equal(install.status, 'blocked');
  assert.equal(install.blocker_refs.includes('BLOCKER-CLEAN-MACHINE-QA'), false);
  assert.equal(install.issue_codes.includes('clean-machine-evidence-missing'), false);
  assert.equal(install.blocker_refs.includes('BLOCKER-WINDOWS-SIGNED-ARTIFACT'), true);
  assert.equal(install.blocker_refs.includes('BLOCKER-MACOS-NOTARIZED-ARTIFACT'), true);
});

test('public beta QA matrix does not treat present installers as signed evidence', () => {
  const scenarios = buildScenarioRows({
    tauriConfig: { bundle: { active: true, targets: ['msi', 'nsis', 'dmg', 'app'] } },
    desktopReleaseWorkflow: 'Sign update manifest',
    updateSignerScript: 'present',
    updateCommands: '"offline"',
    cleanMachineSmoke: {
      schema: 'enigma.clean_machine_smoke.v1',
      app_version: '0.1.19',
      summary: { healthy: true },
    },
    desktopReleaseEvidence: {
      schema: 'enigma.desktop_release_evidence.v1',
      release_version: '0.1.19',
      blockers: [],
      manifest: { signature: { status: 'verified' } },
      installers: [
        { platform: 'windows', present: true, signature: { status: 'file_present_unverified' } },
        { platform: 'macos', present: true, signature: { status: 'file_present_unverified' } },
      ],
    },
  });

  const windows = scenarioById(scenarios, 'BETA-SIGNING-WINDOWS-001');
  const macos = scenarioById(scenarios, 'BETA-SIGNING-MACOS-001');
  const update = scenarioById(scenarios, 'BETA-UPDATE-001');
  assert.equal(windows.status, 'blocked');
  assert.equal(macos.status, 'blocked');
  assert.notEqual(update.status, 'pass');
  assert.doesNotMatch(JSON.stringify(windows.evidence_refs), /ref:evidence:desktop-release/);
});

test('public beta QA matrix requires public evidence refs for verified desktop artifacts', () => {
  const scenarios = buildScenarioRows({
    tauriConfig: { bundle: { active: true, targets: ['msi', 'nsis', 'dmg', 'app'] } },
    desktopReleaseWorkflow: 'Sign update manifest',
    updateSignerScript: 'present',
    updateCommands: '"offline"',
    cleanMachineSmoke: {
      schema: 'enigma.clean_machine_smoke.v1',
      app_version: '0.1.19',
      summary: { healthy: true },
    },
    desktopReleaseEvidence: {
      schema: 'enigma.desktop_release_evidence.v1',
      release_version: '0.1.19',
      blockers: [],
      manifest: { signature: { status: 'verified' } },
      update_rollback: { status: 'pass' },
      installers: [
        { platform: 'windows', present: true, signature: { status: 'verified' } },
        { platform: 'macos', present: true, signature: { status: 'verified' }, notarization: { status: 'accepted' }, stapling: { status: 'stapled' } },
      ],
    },
  });

  for (const id of ['BETA-INSTALL-001', 'BETA-SIGNING-WINDOWS-001', 'BETA-SIGNING-MACOS-001', 'BETA-UPDATE-001']) {
    const row = scenarioById(scenarios, id);
    assert.notEqual(row.status, 'pass', id);
    assert.doesNotMatch(JSON.stringify(row.evidence_refs), /ref:evidence:desktop-release/);
  }
});

test('public beta QA matrix can consume signed desktop release evidence without clearing review gates', () => {
  const scenarios = buildScenarioRows({
    tauriConfig: { bundle: { active: true, targets: ['msi', 'nsis', 'dmg', 'app'] } },
    desktopReleaseWorkflow: 'Sign update manifest',
    updateSignerScript: 'present',
    updateCommands: '"offline"',
    cleanMachineSmoke: {
      schema: 'enigma.clean_machine_smoke.v1',
      app_version: '0.1.19',
      summary: { healthy: true },
    },
    desktopReleaseEvidence: {
      schema: 'enigma.desktop_release_evidence.v1',
      release_version: '0.1.19',
      blockers: [],
      manifest: {
        signature: { status: 'verified' },
      },
      update_rollback: { status: 'pass', evidence_ref: 'ref:evidence:update-rollback' },
      installers: [
        { platform: 'windows', present: true, signature: { status: 'verified', evidence_ref: 'ref:evidence:windows-signature' } },
        { platform: 'macos', present: true, signature: { status: 'verified', evidence_ref: 'ref:evidence:macos-signature' }, notarization: { status: 'accepted', evidence_ref: 'ref:evidence:macos-notarization' }, stapling: { status: 'stapled', evidence_ref: 'ref:evidence:macos-stapling' } },
      ],
    },
  });

  for (const id of ['BETA-INSTALL-001', 'BETA-SIGNING-WINDOWS-001', 'BETA-SIGNING-MACOS-001', 'BETA-UPDATE-001']) {
    const row = scenarioById(scenarios, id);
    assert.equal(row.status, 'pass', id);
    assert.equal(row.blocker_refs.length, 0, id);
    assert.equal(row.issue_codes.length, 0, id);
    assert.match(JSON.stringify(row.evidence_refs), /ref:evidence:desktop-release/);
  }

  const merge = scenarioById(scenarios, 'BETA-MERGE-001');
  assert.equal(merge.status, 'blocked');
  assert.equal(merge.blocker_refs.includes('BLOCKER-PUBLIC-SAFE-RELEASE-PACKET'), true);
});

test('public beta QA matrix can consume support dry-run evidence per scenario', () => {
  const scenarios = buildScenarioRows({
    tauriConfig: { bundle: { active: true, targets: ['msi', 'nsis', 'dmg', 'app'] } },
    wizardUi: 'Create my Memory Drive Find my apps Connect your AI apps Run health check Your Memory Drive is ready Proof activity Export bundle Crash reporting Repair connection Rollback',
    helpUi: 'Proof artifacts can show hashes',
    desktopIndex: './wizard.js',
    serviceCommands: 'create_vault detect_clients connect_client get_health offline_ready repair_client rollback_client malformed backup',
    diagnosticsCommands: 'FORBIDDEN_KEYS export_diagnostics approve redact_path',
    crashCommands: 'init_panic_hook opt-in required pending-crash-reports',
    updateCommands: '"offline"',
    libCommands: 'commands::service::get_health',
    desktopReleaseWorkflow: 'Sign update manifest',
    npmPublishWorkflow: 'npm publish --access public --provenance',
    packageVersion: '0.1.19',
    cleanMachineSmoke: {
      schema: 'enigma.clean_machine_smoke.v1',
      app_version: '0.1.19',
      summary: { healthy: true },
    },
    supportDryRunSummaries: [
      {
        schema: 'enigma.support_dry_run_summary.v1',
        evidence_item_id: 'EV-P10-SUPPORT-DRY-RUN-SUMMARY',
        scenario_id: 'BETA-DIAG-001',
        bundle_privacy_check_status: 'pass',
        privacy_review: { status: 'pass' },
        privacy_scan: { status: 'pass', detected_private_field_count: 0 },
        triage_result: 'resolved',
        support_owner_ref: 'ref:role:beta-support',
      },
      {
        schema: 'enigma.support_dry_run_summary.v1',
        evidence_item_id: 'EV-P10-SUPPORT-DRY-RUN-SUMMARY',
        scenario_id: 'BETA-CRASH-001',
        bundle_privacy_check_status: 'pass',
        privacy_review: { status: 'pass' },
        privacy_scan: { status: 'pass', detected_private_field_count: 0 },
        triage_result: 'needs_user_action',
        support_owner_ref: 'ref:role:beta-support',
      },
    ],
  });

  const diagnostics = scenarioById(scenarios, 'BETA-DIAG-001');
  assert.equal(diagnostics.status, 'pass');
  assert.equal(diagnostics.blocker_refs.length, 0);
  assert.equal(diagnostics.issue_codes.length, 0);
  assert.match(JSON.stringify(diagnostics.evidence_refs), /ref:evidence:support-dry-run:BETA-DIAG-001/);

  const crash = scenarioById(scenarios, 'BETA-CRASH-001');
  assert.equal(crash.status, 'pass');
  assert.equal(crash.blocker_refs.length, 0);
  assert.equal(crash.issue_codes.length, 0);
  assert.match(JSON.stringify(crash.evidence_refs), /ref:evidence:support-dry-run:BETA-CRASH-001/);
});

test('public beta QA matrix keeps template-only support evidence blocked', () => {
  const scenarios = buildScenarioRows({
    tauriConfig: { bundle: { active: true, targets: ['msi', 'nsis', 'dmg', 'app'] } },
    wizardUi: 'Create my Memory Drive Find my apps Connect your AI apps Run health check Your Memory Drive is ready Proof activity Export bundle Crash reporting Repair connection Rollback',
    helpUi: 'Proof artifacts can show hashes',
    desktopIndex: './wizard.js',
    serviceCommands: 'create_vault detect_clients connect_client get_health offline_ready repair_client rollback_client malformed backup',
    diagnosticsCommands: 'FORBIDDEN_KEYS export_diagnostics approve redact_path',
    crashCommands: 'init_panic_hook opt-in required pending-crash-reports',
    updateCommands: '"offline"',
    libCommands: 'commands::service::get_health',
    desktopReleaseWorkflow: 'Sign update manifest',
    npmPublishWorkflow: 'npm publish --access public --provenance',
    packageVersion: '0.1.19',
    cleanMachineSmoke: {
      schema: 'enigma.clean_machine_smoke.v1',
      app_version: '0.1.19',
      summary: { healthy: true },
    },
    supportDryRunSummaries: [
      {
        schema: 'enigma.support_dry_run_summary.v1',
        evidence_status: 'template_only',
        evidence_item_id: 'EV-P10-SUPPORT-DRY-RUN-SUMMARY',
        scenario_id: 'BETA-DIAG-001',
        support_owner_ref: 'ref:role:beta-support',
        bundle_privacy_check_status: 'pass',
        privacy_review: { status: 'pass' },
        triage_result: 'resolved',
      },
    ],
  });

  const diagnostics = scenarioById(scenarios, 'BETA-DIAG-001');
  assert.equal(diagnostics.status, 'blocked');
  assert.ok(diagnostics.blocker_refs.includes('BLOCKER-SUPPORT-DRY-RUN'));
  assert.ok(diagnostics.issue_codes.includes('diagnostics-support-dry-run-missing'));
});

test('public beta QA matrix can consume registry install evidence without clearing release approval', () => {
  const scenarios = buildScenarioRows({
    packageJson: { name: 'enigma-memory' },
    packageVersion: '0.1.19',
    npmPublishWorkflow: 'npm publish --access public --provenance',
    registryInstall: {
      schema: 'enigma.registry_install_verifier.v1',
      ok: true,
      mode: 'execute',
      execute: true,
      skip_network: false,
      package: {
        name: 'enigma-memory',
        version: '0.1.19',
      },
    },
  });

  const npm = scenarioById(scenarios, 'BETA-NPM-001');
  assert.equal(npm.status, 'pass');
  assert.equal(npm.blocker_refs.length, 0);
  assert.equal(npm.issue_codes.length, 0);
  assert.match(JSON.stringify(npm.evidence_refs), /ref:evidence:registry-install/);

  const merge = scenarioById(scenarios, 'BETA-MERGE-001');
  assert.equal(merge.status, 'blocked');
  assert.equal(merge.blocker_refs.includes('BLOCKER-PR-APPROVAL-MERGE-REVIEWER-APPROVAL'), true);
});

test('public beta next actions are ranked and public-safe', async () => {
  const matrix = await loadMatrix();
  assertPublicSafe(matrix.next_actions);
  const direct = buildRankedNextActions(matrix.blockers);
  assert.deepEqual(direct, matrix.next_actions);
  assertPublicSafe(matrix.consumer_next_action);
  assert.equal(matrix.consumer_next_action.signal_id, 'top_consumer_friction');
  assert.equal(matrix.consumer_next_action.consumer_rank, 1);
  assert.equal(matrix.consumer_next_action.action_id, 'run_clean_machine_qa');
  assert.equal(matrix.consumer_next_action.blocker_id, 'BLOCKER-CLEAN-MACHINE-QA');
  assert.equal(matrix.consumer_next_action.collect_next.target_file, '.enigma/public-beta/clean-machine-smoke.json');
  const firstAction = matrix.next_actions[0];
  assert.equal(firstAction.collect_next.evidence_item_id, 'EV-P10-PRODUCTION-HANDOFF-PACKET');
  assert.equal(firstAction.collect_next.target_file, '.enigma/public-beta/production-handoff-packet.json');
  assert.match(firstAction.collect_next.collect, /release PR ref or URL/);
  const packetAction = matrix.next_actions.find((action) => action.action_id === 'approve_public_safe_release_packet');
  assert.match(packetAction.collect_next.collect, /approval ref/);
  assert.equal(matrix.next_actions.some((action) => action.action_id === 'record_support_dry_run'), true);
  const supportAction = matrix.next_actions.find((action) => action.action_id === 'record_support_dry_run');
  assert.equal(supportAction.missing_evidence_items[0].evidence_item_id, 'EV-P10-SUPPORT-DRY-RUN-SUMMARY');
  assert.deepEqual(supportAction.collect_next.target_files, ['.enigma/public-beta/support-dry-run-diagnostics.json', '.enigma/public-beta/support-dry-run-crash.json']);
  assert.deepEqual(supportAction.collect_next.collect_commands, [
    'npm run production:support-dry-run -- --preset diagnostics --triage-result <observed-result> --bundle-privacy-check-status <observed-status> --out .enigma/public-beta/support-dry-run-diagnostics.json',
    'npm run production:support-dry-run -- --preset crash --triage-result <observed-result> --bundle-privacy-check-status <observed-status> --out .enigma/public-beta/support-dry-run-crash.json',
  ]);
  const internalOwners = matrix.next_actions
    .filter((action) => action.owner_ref === 'ref:role:qa-owner' || action.owner_ref === 'ref:role:beta-support')
    .map((action) => action.action_id);
  assert.deepEqual(internalOwners, ['run_clean_machine_qa', 'record_support_dry_run']);
});

test('public beta consumer next action falls through after clean-machine evidence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-public-beta-consumer-action-'));
  try {
    const cleanMachineSmoke = join(dir, 'clean-machine-smoke.json');
    await writeFile(cleanMachineSmoke, `${JSON.stringify({
      schema: 'enigma.clean_machine_smoke.v1',
      app_version: '0.1.19',
      summary: { healthy: true },
    }, null, 2)}\n`, 'utf8');

    const matrix = await buildPublicBetaQaMatrix({ cleanMachineSmoke });

    assert.equal(matrix.consumer_next_action.action_id, 'record_support_dry_run');
    assert.equal(matrix.consumer_next_action.consumer_rank, 1);
    assert.equal(matrix.consumer_next_action.blocker_id, 'BLOCKER-SUPPORT-DRY-RUN');
    assert.deepEqual(matrix.consumer_next_action.collect_next.target_files, [
      '.enigma/public-beta/support-dry-run-diagnostics.json',
      '.enigma/public-beta/support-dry-run-crash.json',
    ]);
    assertPublicSafe(matrix.consumer_next_action);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('public beta QA matrix keeps public-safe packet blocker without explicit approval fields', () => {
  const scenarios = buildScenarioRows({
    productionHandoffPacket: {
      schema: 'enigma.production_handoff_packet.v1',
      go_live_ready: true,
      local_static_artifact_ready: true,
      blockers: [],
      operator_acceptance: { ok: true },
      release_audit: { ok: true },
    },
  });

  const merge = scenarioById(scenarios, 'BETA-MERGE-001');
  assert.equal(merge.status, 'blocked');
  assert.equal(merge.blocker_refs.includes('BLOCKER-PR-APPROVAL-MERGE-REVIEWER-APPROVAL'), true);
  assert.equal(merge.blocker_refs.includes('BLOCKER-PUBLIC-SAFE-RELEASE-PACKET'), true);
  assert.equal(merge.issue_codes.includes('public-safe-release-packet-approval-missing'), true);
});

test('public beta QA matrix can consume approved production handoff packet without clearing PR approval', () => {
  const scenarios = buildScenarioRows({
    productionHandoffPacket: {
      schema: 'enigma.production_handoff_packet.v1',
      go_live_ready: true,
      local_static_artifact_ready: true,
      blockers: [],
      operator_acceptance: { ok: true },
      release_audit: { ok: true },
      public_safe_release_packet_approval: {
        status: 'approved',
        release_packet_ref: 'ref:evidence:public-safe-release-packet',
        claim_boundary_reviewer_ref: 'ref:review:claim-boundary',
        approval_ref: 'ref:approval:public-beta-release',
        approved_at: '2026-06-28',
      },
    },
  });

  const merge = scenarioById(scenarios, 'BETA-MERGE-001');
  assert.equal(merge.status, 'blocked');
  assert.deepEqual(merge.blocker_refs, ['BLOCKER-PR-APPROVAL-MERGE-REVIEWER-APPROVAL']);
  assert.equal(merge.issue_codes.includes('public-safe-release-packet-approval-missing'), false);
  assert.match(JSON.stringify(merge.evidence_refs), /ref:evidence:production-handoff-packet/);
});

test('config recovery scenarios are blocked once command and UI recovery surfaces exist', () => {
  const scenarios = buildScenarioRows({
    tauriConfig: {},
    serviceCommands: 'offline_ready repair_client_config rollback_client_config malformed backup_path',
    wizardUi: 'Repair connection Rollback Safe reset restore malformed recovery',
    updateCommands: '',
    diagnosticsCommands: '',
    crashCommands: '',
    helpUi: '',
    desktopIndex: '',
    libCommands: '',
    desktopReleaseWorkflow: '',
    npmPublishWorkflow: '',
    packageVersion: '0.0.0',
    mcpbManifest: {},
    mcpbConnectionPlan: {},
    mcpbHealth: {},
  });

  const configRecovery = scenarioById(scenarios, 'BETA-CONFIG-001');
  assert.equal(configRecovery.status, 'blocked');
  assert.deepEqual(configRecovery.blocker_refs, ['BLOCKER-CLEAN-MACHINE-QA']);
  assert.deepEqual(configRecovery.issue_codes, ['config-recovery-manual-evidence-missing']);
  assert.equal(configRecovery.issue_codes.includes('config-recovery-surface-missing'), false);

  const corruptedConfigRecovery = scenarioById(scenarios, 'BETA-CONFIG-002');
  assert.equal(corruptedConfigRecovery.status, 'blocked');
  assert.deepEqual(corruptedConfigRecovery.blocker_refs, ['BLOCKER-CLEAN-MACHINE-QA']);
  assert.deepEqual(corruptedConfigRecovery.issue_codes, ['third-party-config-manual-evidence-missing']);
  assert.equal(corruptedConfigRecovery.issue_codes.includes('third-party-config-recovery-surface-missing'), false);
});

test('public beta QA matrix blocks config recovery on clean-machine manual evidence after recovery surfaces exist', async () => {
  const matrix = await loadMatrix();
  const scenarios = scenarioList(matrix);

  for (const [id, issueCode] of [
    ['BETA-CONFIG-001', 'config-recovery-manual-evidence-missing'],
    ['BETA-CONFIG-002', 'third-party-config-manual-evidence-missing'],
  ]) {
    const scenario = scenarioById(scenarios, id);
    assert.equal(scenario.status, 'blocked');
    assert.deepEqual(scenario.blocker_refs, ['BLOCKER-CLEAN-MACHINE-QA']);
    assert.deepEqual(scenario.issue_codes, [issueCode]);
    assert.equal(scenario.issue_codes.some((code) => code.includes('surface-missing')), false);
  }

  assert.equal(
    matrix.blockers.some((blocker) => blocker.blocker_id === 'BLOCKER-CONFIG-RECOVERY-EVIDENCE'),
    false,
  );

  assert.equal(matrix.advisor_decision, 'hold');
  assert.equal(matrix.summary.ready_for_public_beta, false);
});

test('public beta QA matrix output is public-safe and omits forbidden private fields', async () => {
  const matrix = await loadMatrix();
  assertPublicSafe(matrix);
});

test('release owner docs explain evidence templates as blockers only', async () => {
  const [checklist, supportObservability] = await Promise.all([
    readFile(new URL('../docs/public-launch/release-owner-checklist.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/public-launch/qa-support-observability.md', import.meta.url), 'utf8'),
  ]);

  for (const doc of [checklist, supportObservability]) {
    assert.match(doc, /npm run public-beta:evidence-templates -- --out-dir \.enigma\/public-beta --plain/);
    assert.match(doc, /blockers?|hold/i);
    assert.match(doc, /real evidence|actual public-safe artifact/i);
  }
  assert.match(checklist, /Read each `Collect next:` line/);
  assert.match(supportObservability, /`Collect next:` file targets/);
  assert.doesNotMatch(`${checklist}\n${supportObservability}`, /templates?.{0,120}(?:ship|pass|ready)/i);
});
