import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { main } from '../apps/cli/bin/enigma.mjs';
import { createVault, deleteMemory, exportBundle, remember } from '../packages/vault/src/index.js';

function makeIo() {
  let stdout = '';
  let stderr = '';
  return {
    io: {
      stdout: { write: (chunk) => { stdout += chunk; } },
      stderr: { write: (chunk) => { stderr += chunk; } },
    },
    output: () => ({ stdout, stderr, json: JSON.parse(stdout) }),
  };
}

async function runCli(argv) {
  const captured = makeIo();
  const code = await main(argv, captured.io);
  return { code, ...captured.output() };
}

async function runCliText(argv) {
  let stdout = '';
  let stderr = '';
  const code = await main(argv, {
    stdout: { write: (chunk) => { stdout += chunk; } },
    stderr: { write: (chunk) => { stderr += chunk; } },
  });
  return { code, stdout, stderr };
}

async function withBundle(build) {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-search-status-'));
  try {
    const bundlePath = join(dir, 'bundle.json');
    const vault = createVault({ subjectId: 'subject-search-status' });
    const refs = await build(vault);
    const bundle = exportBundle({ vault, now: '2026-06-25T00:00:00.000Z' });
    await writeFile(bundlePath, JSON.stringify(bundle, null, 2));
    return await refs.test(bundlePath, refs);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('search ranks relevant active memories and redacts plaintext by default', async () => withBundle(async (vault) => {
  const relevant = remember({
    vault,
    text: 'deployment phoenix region fixture plaintext canary',
    kind: 'fact',
    sensitivity: 'normal',
    purpose_tags: ['deployment', 'region'],
    now: '2026-06-25T00:00:01.000Z',
  });
  remember({
    vault,
    text: 'breakfast oatmeal fixture plaintext canary',
    kind: 'preference',
    sensitivity: 'normal',
    purpose_tags: ['food'],
    now: '2026-06-25T00:00:02.000Z',
  });

  return {
    test: async (bundlePath) => {
      const { code, json, stdout } = await runCli(['search', '--bundle', bundlePath, '--query', 'deployment phoenix region', '--limit', '2', '--json']);
      assert.equal(code, 0);
      assert.equal(json.ok, true);
      assert.equal(json.schema, 'enigma.memory_search.v1');
      assert.equal(json.results[0].memory_addr, relevant.memory_addr);
      assert.ok(json.results[0].score > 0);
      assert.equal(json.results[0].content_redacted, true);
      assert.equal(Object.hasOwn(json.results[0], 'content'), false);
      assert.match(json.results[0].memory_ref, /^enigma:\/\/memory\//);
      assert.ok(json.results[0].access_receipt_ref || json.results[0].access_receipt_id);
      assert.doesNotMatch(stdout, /deployment phoenix region fixture plaintext canary|breakfast oatmeal fixture plaintext canary/);

      const plain = await runCliText(['search', '--bundle', bundlePath, '--query', 'deployment phoenix region', '--limit', '2', '--plain']);
      assert.equal(plain.code, 0);
      assert.match(plain.stdout, /^Enigma search\n/);
      assert.match(plain.stdout, /Results: 1/);
      assert.match(plain.stdout, /Plaintext: redacted/);
      assert.match(plain.stdout, /Boundary: local Enigma search only/);
      assert.doesNotMatch(plain.stdout, /^\s*\{/);
      assert.doesNotMatch(plain.stdout, /deployment phoenix region fixture plaintext canary|breakfast oatmeal fixture plaintext canary/);
      assert.equal(plain.stdout.includes(bundlePath), false);
    },
  };
}));

test('search includes plaintext only with explicit include-content opt-in', async () => withBundle(async (vault) => {
  remember({
    vault,
    text: 'handoff cerulean fixture plaintext canary',
    purpose_tags: ['handoff'],
    now: '2026-06-25T00:00:01.000Z',
  });

  return {
    test: async (bundlePath) => {
      const { code, json } = await runCli(['search', '--bundle', bundlePath, '--query', 'handoff cerulean', '--include-content']);
      assert.equal(code, 0);
      assert.equal(json.results.length, 1);
      assert.equal(json.results[0].content_redacted, false);
      assert.equal(json.results[0].content, 'handoff cerulean fixture plaintext canary');
      assert.match(json.claim_boundary, /includes plaintext only because --include-content was explicit/);
    },
  };
}));

test('status reports passport counts and roots without raw memory', async () => withBundle(async (vault) => {
  const active = remember({ vault, text: 'active status fixture plaintext canary', now: '2026-06-25T00:00:01.000Z' });
  const removed = remember({ vault, text: 'removed status fixture plaintext canary', now: '2026-06-25T00:00:02.000Z' });
  deleteMemory({ vault, memory_addr: removed.memory_addr, now: '2026-06-25T00:00:03.000Z' });

  return {
    test: async (bundlePath) => {
      const { code, json, stdout } = await runCli(['passport', 'status', '--bundle', bundlePath]);
      assert.equal(code, 0);
      assert.equal(json.ok, true);
      assert.equal(json.schema, 'enigma.passport_status.v1');
      assert.equal(json.owner.subject_id, 'subject-search-status');
      assert.equal(json.counts.active_memories, 1);
      assert.equal(json.counts.tombstoned_memories, 1);
      assert.ok(json.counts.receipts >= 4);
      assert.match(json.active_set_root, /^sha256:[a-f0-9]{64}$/);
      assert.match(json.receipt_log_root, /^sha256:[a-f0-9]{64}$/);
      assert.equal(json.connector_readiness.ready, true);
      assert.equal(json.first_run_status.schema, 'enigma.first_run_status.v1');
      assert.equal(json.first_run_status.state, 'ready_for_app_connection');
      assert.equal(json.first_run_status.primary_action.id, 'connect_ai_app');
      assert.equal(json.first_run_status.lanes.import_sandbox.status, 'ready');
      assert.equal(json.first_run_status.claim_boundaries.raw_memory_returned, false);
      assert.equal(JSON.stringify(json.first_run_status).includes(bundlePath), false);
      assert.ok(json.next_recommended_commands.some((command) => command.includes('enigma search')));
      assert.doesNotMatch(stdout, /active status fixture plaintext canary|removed status fixture plaintext canary/);
      assert.equal(active.memory_addr.length > 0, true);
    },
  };
}));

test('status first-run summary points empty vaults to import sandbox', async () => withBundle(async () => ({
  test: async (bundlePath) => {
    const { code, json, stdout } = await runCli(['status', '--bundle', bundlePath]);
    assert.equal(code, 0);
    assert.equal(json.first_run_status.state, 'needs_first_memory');
    assert.equal(json.first_run_status.primary_action.id, 'import_or_remember_first_memory');
    assert.equal(json.first_run_status.lanes.memory_inventory.status, 'empty');
    assert.equal(json.first_run_status.lanes.import_sandbox.next_action, 'preview_text_or_markdown_import');
    assert.equal(JSON.stringify(json.first_run_status).includes(bundlePath), false);
    assert.doesNotMatch(stdout, /plaintext canary/);
  },
})));

test('next gives setup action without requiring an existing bundle', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-next-missing-'));
  try {
    const missing = join(dir, 'missing-bundle.json');
    const { code, json, stdout } = await runCli(['next', '--bundle', missing]);
    assert.equal(code, 0);
    assert.equal(json.schema, 'enigma.next_action.v1');
    assert.equal(json.state, 'setup_needed');
    assert.equal(json.primary_action.id, 'run_quickstart');
    assert.equal(json.follow_up.id, 'run_status_after_setup');
    assert.equal(stdout.includes(dir), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('next plain output is readable and path-redacted before setup', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-next-plain-missing-'));
  try {
    const missing = join(dir, 'missing-bundle.json');
    const { code, stdout } = await runCliText(['next', '--plain', '--bundle', missing]);
    assert.equal(code, 0);
    assert.match(stdout, /Enigma next/);
    assert.match(stdout, /Status: Create Memory Drive/);
    assert.match(stdout, /Run: enigma quickstart --bundle "<bundle-path>" --overwrite/);
    assert.doesNotMatch(stdout, /^\s*\{/);
    assert.equal(stdout.includes(dir), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('next uses first-run status when the bundle exists', async () => withBundle(async (vault) => {
  remember({ vault, text: 'next command private canary', now: '2026-06-25T00:00:04.000Z' });
  return {
    test: async (bundlePath) => {
      const { code, json, stdout } = await runCli(['next', '--bundle', bundlePath]);
      assert.equal(code, 0);
      assert.equal(json.schema, 'enigma.next_action.v1');
      assert.equal(json.state, 'ready_for_app_connection');
      assert.equal(json.primary_action.id, 'connect_ai_app');
      assert.equal(json.lanes.import_sandbox.status, 'ready');
      assert.equal(stdout.includes('next command private canary'), false);
      assert.equal(stdout.includes(bundlePath), false);
    },
  };
}));

test('next plain output summarizes populated setup without raw memory', async () => withBundle(async (vault) => {
  remember({ vault, text: 'plain next private canary', now: '2026-06-25T00:00:05.000Z' });
  return {
    test: async (bundlePath) => {
      const { code, stdout } = await runCliText(['next', '--format', 'text', '--bundle', bundlePath]);
      assert.equal(code, 0);
      assert.match(stdout, /Status: Connect an AI app/);
      assert.match(stdout, /memory drive: Memory Drive exists/);
      assert.match(stdout, /import sandbox: Import Sandbox ready/);
      assert.equal(stdout.includes('plain next private canary'), false);
      assert.equal(stdout.includes(bundlePath), false);
    },
  };
}));

test('search and status fail closed when the bundle is absent', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-search-status-missing-'));
  try {
    const missing = join(dir, 'missing-bundle.json');
    const search = await runCli(['search', '--bundle', missing, '--query', 'anything']);
    assert.equal(search.code, 2);
    assert.equal(search.json.ok, false);
    assert.equal(search.json.error.code, 'CLI_ERROR');

    const status = await runCli(['status', '--bundle', missing]);
    assert.equal(status.code, 2);
    assert.equal(status.json.ok, false);
    assert.equal(status.json.error.code, 'CLI_ERROR');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
