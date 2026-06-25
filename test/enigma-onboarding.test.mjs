import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { main } from '../apps/cli/bin/enigma.mjs';

function makeIo() {
  let stdout = '';
  let stderr = '';
  return {
    io: {
      stdout: { write: (chunk) => { stdout += chunk; } },
      stderr: { write: (chunk) => { stderr += chunk; } },
    },
    stdout: () => stdout,
    stderr: () => stderr,
    json: () => JSON.parse(stdout),
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

test('setup default creates local Memory Passport artifacts without connector writes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-setup-default-'));
  const previousCwd = process.cwd();
  process.chdir(dir);
  try {
    const io = makeIo();
    assert.equal(await main(['setup', '--overwrite'], io.io), 0, io.stderr());
    const summary = io.json();

    assert.equal(summary.ok, true);
    assert.equal(summary.schema, 'enigma.setup.v1');
    assert.equal(summary.bundle, '.enigma/bundle.json');
    assert.equal(summary.context_pack, '.enigma/context-pack.json');
    assert.equal(summary.export, '.enigma/export.json');
    assert.equal(summary.verify_report, '.enigma/verify-report.json');
    assert.equal(summary.artifacts_written, true);
    assert.equal(summary.client_configs_written, false);
    assert.deepEqual(summary.selected_clients, ['generic-mcp', 'claude-desktop', 'cursor', 'kimi-code']);
    assert.equal(summary.provider_native_memory_canonical, false);
    assert.equal(summary.claim_boundaries.provider_native_memory_canonical, false);
    assert.equal(summary.memory_plaintext_echoed, false);
    assert.equal(summary.verify_ok, true);
    assert.equal(summary.memory_count, 1);
    assert.equal(summary.context_item_count, 1);
    assert.ok(summary.next_commands.some((command) => command.startsWith('enigma search ')));
    assert.ok(summary.next_commands.some((command) => command.startsWith('enigma context ')));
    assert.ok(summary.next_commands.some((command) => command.startsWith('enigma verify ')));
    assert.equal(summary.connectors.length, 4);
    assert.equal(summary.connectors.every((connector) => connector.connect_plan.dry_run === true), true);
    assert.equal(JSON.stringify(summary).includes(dir), false);

    assert.equal((await readJson(join(dir, '.enigma', 'bundle.json'))).schema, 'enigma.vault_bundle.v1');
    assert.equal((await readJson(join(dir, '.enigma', 'context-pack.json'))).schema, 'enigma.context_pack.v1');
    assert.equal((await readJson(join(dir, '.enigma', 'export.json'))).schema, 'enigma.vault_bundle.v1');
    assert.equal((await readJson(join(dir, '.enigma', 'verify-report.json'))).ok, true);
  } finally {
    process.chdir(previousCwd);
  }
});

test('setup fails closed when an artifact already exists', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-setup-existing-'));
  const bundlePath = join(dir, 'bundle.json');
  await writeFile(bundlePath, '{}\n', 'utf8');

  const io = makeIo();
  assert.equal(await main(['setup', '--bundle', bundlePath, '--out-dir', dir], io.io), 2);
  const summary = io.json();
  assert.equal(summary.ok, false);
  assert.equal(summary.error.code, 'CLI_ERROR');
  assert.match(summary.error.message, /already exists/);
  assert.equal(JSON.stringify(summary).includes(dir), false);
  assert.equal(await readFile(bundlePath, 'utf8'), '{}\n');
});

test('setup dry-run plans without writing local artifacts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-setup-dry-run-'));
  const bundlePath = join(dir, 'bundle.json');
  const io = makeIo();

  assert.equal(await main(['setup', '--bundle', bundlePath, '--out-dir', dir, '--dry-run'], io.io), 0, io.stderr());
  const summary = io.json();
  assert.equal(summary.ok, true);
  assert.equal(summary.dry_run, true);
  assert.equal(summary.artifacts_written, false);
  assert.equal(summary.client_configs_written, false);
  assert.equal(JSON.stringify(summary).includes(dir), false);
  assert.equal(summary.connectors.every((connector) => connector.connect_plan.dry_run === true), true);
  await assert.rejects(() => readFile(bundlePath, 'utf8'), /ENOENT/);
  await assert.rejects(() => readFile(join(dir, 'context-pack.json'), 'utf8'), /ENOENT/);
  await assert.rejects(() => readFile(join(dir, 'export.json'), 'utf8'), /ENOENT/);
  await assert.rejects(() => readFile(join(dir, 'verify-report.json'), 'utf8'), /ENOENT/);
});

test('setup selected clients accepts comma-separated and repeated client options', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-setup-clients-'));
  const bundlePath = join(dir, 'bundle.json');
  const io = makeIo();

  assert.equal(await main(['setup', '--bundle', bundlePath, '--out-dir', dir, '--client', 'cursor,kimi-code', '--client', 'claude-desktop', '--overwrite'], io.io), 0, io.stderr());
  const summary = io.json();
  assert.deepEqual(summary.selected_clients, ['cursor', 'kimi-code', 'claude-desktop']);
  assert.deepEqual(summary.connectors.map((connector) => connector.client_id), ['cursor', 'kimi-code', 'claude-desktop']);
  assert.equal(summary.connectors.some((connector) => connector.client_id === 'generic-mcp'), false);
  for (const connector of summary.connectors) {
    assert.equal(connector.mcp_config_snippet.mcpServers.enigma.command, 'enigma-mcp');
    assert.equal(connector.mcp_config_snippet.mcpServers.enigma.env.ENIGMA_BUNDLE, '<bundle-path>');
    assert.match(connector.connect_command, new RegExp(`^enigma connect ${connector.client_id} --bundle `));
    assert.equal(JSON.stringify(summary).includes(dir), false);
  }
});

test('setup memory file input does not echo plaintext to stdout', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-setup-memory-file-'));
  const memoryPath = join(dir, 'memory.txt');
  const privateMemory = 'private setup phrase must never be echoed';
  await writeFile(memoryPath, privateMemory, 'utf8');

  const io = makeIo();
  assert.equal(await main(['setup', '--bundle', join(dir, 'bundle.json'), '--out-dir', dir, '--memory-file', memoryPath, '--overwrite'], io.io), 0, io.stderr());
  assert.equal(io.stdout().includes(privateMemory), false);
  const summary = io.json();
  assert.equal(JSON.stringify(summary).includes(dir), false);
  assert.equal(summary.memory_source, 'memory_file');
  assert.equal(JSON.stringify(summary).includes(privateMemory), false);
});
