import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildPublicBetaQaMatrix, buildRankedNextActions, buildScenarioRows, parseArgs, renderPublicBetaQaPlain } from '../scripts/run-public-beta-qa-matrix.mjs';

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

test('public beta QA npm script invokes the JSON matrix runner', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(packageJson.scripts['public-beta-qa'], 'node scripts/run-public-beta-qa-matrix.mjs --json');
});

test('public beta QA runner accepts explicit plain output mode', () => {
  assert.deepEqual(parseArgs(['--plain']), { json: false, plain: true, out: null });
  assert.deepEqual(parseArgs(['--format', 'text']), { json: false, plain: true, out: null });
  assert.throws(() => parseArgs(['--json', '--plain']), /Choose only one output format/);
});

test('public beta QA plain output is readable, bounded, and non-JSON', async () => {
  const matrix = await loadMatrix();
  const plain = renderPublicBetaQaPlain(matrix);

  assert.match(plain, /^Enigma public beta QA advisor\n/);
  assert.match(plain, /Decision: HOLD/);
  assert.match(plain, /Ready for public beta: no/);
  assert.match(plain, /Blocked: /);
  assert.match(plain, /Pending: /);
  assert.match(plain, /Next: approve_merge_release_pr/);
  assert.match(plain, /Boundary: local repository evidence matrix only/);
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
      ],
      notes: 'Record support triage outcomes only; omit raw logs, screenshots, transcripts, credentials, account identifiers, owner names, and local absolute paths.',
    },
  ]);
  assert.equal(matrix.advisor_decision, 'hold');
  assert.equal(matrix.summary.ready_for_public_beta, false);
});

test('public beta next actions are ranked and public-safe', async () => {
  const matrix = await loadMatrix();
  assertPublicSafe(matrix.next_actions);
  const direct = buildRankedNextActions(matrix.blockers);
  assert.deepEqual(direct, matrix.next_actions);
  assert.equal(matrix.next_actions.some((action) => action.action_id === 'record_support_dry_run'), true);
  const supportAction = matrix.next_actions.find((action) => action.action_id === 'record_support_dry_run');
  assert.equal(supportAction.missing_evidence_items[0].evidence_item_id, 'EV-P10-SUPPORT-DRY-RUN-SUMMARY');
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
