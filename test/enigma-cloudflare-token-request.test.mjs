import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  CLOUDFLARE_TOKEN_REQUEST_SCHEMA,
  buildCloudflareTokenRequest,
  renderCloudflareTokenRequestPlain,
} from '../scripts/build-cloudflare-token-request.mjs';

const execFileAsync = promisify(execFile);

function permissionGroups() {
  return {
    success: true,
    result: [
      { id: 'acc_read_id', name: 'Account Settings Read', scopes: ['com.cloudflare.api.account'] },
      { id: 'pages_read_id', name: 'Cloudflare Pages Read', scopes: ['com.cloudflare.api.account'] },
      { id: 'pages_edit_id', name: 'Cloudflare Pages Edit', scopes: ['com.cloudflare.api.account'] },
      { id: 'registrar_read_id', name: 'Registrar Read', scopes: ['com.cloudflare.api.account'] },
      { id: 'registrar_edit_id', name: 'Registrar Edit', scopes: ['com.cloudflare.api.account'] },
      { id: 'workers_scripts_read_id', name: 'Workers Scripts Read', scopes: ['com.cloudflare.api.account'] },
      { id: 'workers_scripts_edit_id', name: 'Workers Scripts Edit', scopes: ['com.cloudflare.api.account'] },
      { id: 'workers_routes_edit_id', name: 'Workers Routes Edit', scopes: ['com.cloudflare.api.account.zone'] },
    ],
  };
}

test('Cloudflare token request resolves permission group ids into account token body', async () => {
  const packet = await buildCloudflareTokenRequest({
    mode: 'all',
    accountId: 'acct_123',
    tokenName: 'enigma-memory-prod',
    permissionGroupsJson: permissionGroups(),
    generated_at: '2026-06-24T00:00:00.000Z',
  });
  assert.equal(packet.schema, CLOUDFLARE_TOKEN_REQUEST_SCHEMA);
  assert.equal(packet.ok, true);
  assert.equal(packet.required_permission_count, 8);
  assert.equal(packet.resolved_permission_count, 8);
  assert.equal(packet.unresolved_permission_count, 0);
  assert.equal(packet.token_request.name, 'enigma-memory-prod');
  assert.equal(packet.token_request.policies.length, 2);
  assert.deepEqual(packet.token_request.policies[0].resources, { 'com.cloudflare.api.account.acct_123': '*' });
  assert.deepEqual(packet.token_request.policies[0].permission_groups.map((item) => item.id).sort(), ['acc_read_id', 'pages_edit_id', 'pages_read_id', 'registrar_edit_id', 'registrar_read_id', 'workers_scripts_edit_id', 'workers_scripts_read_id'].sort());
  assert.deepEqual(packet.token_request.policies[1].resources, { 'com.cloudflare.api.account.acct_123': { 'com.cloudflare.api.account.zone.*': '*' } });
  assert.deepEqual(packet.token_request.policies[1].permission_groups.map((item) => item.id), ['workers_routes_edit_id']);
  assert.equal(packet.mutation_boundaries.token_created, false);
  assert.equal(packet.mutation_boundaries.token_value_printed, false);
  assert.doesNotMatch(JSON.stringify(packet), /Bearer|PRIVATE KEY|sk-/i);
});

test('Cloudflare token request resolves hosted probe Worker permissions', async () => {
  const packet = await buildCloudflareTokenRequest({
    mode: 'hosted-probe',
    accountId: 'acct_123',
    tokenName: 'enigma-hosted-probe',
    permissionGroupsJson: permissionGroups(),
    generated_at: '2026-06-24T00:00:00.000Z',
  });
  assert.equal(packet.ok, true);
  assert.equal(packet.required_permission_count, 3);
  assert.deepEqual(packet.resolved_permission_groups.map((item) => item.key).sort(), ['workers_routes_edit', 'workers_scripts_edit', 'workers_scripts_read']);
  assert.equal(packet.token_request.policies.length, 2);
});

test('Cloudflare token request reports unresolved permission groups fail-closed', async () => {
  const packet = await buildCloudflareTokenRequest({
    mode: 'pages-deploy',
    accountId: 'acct_123',
    permissionGroupsJson: { result: [{ id: 'pages_edit_id', name: 'Cloudflare Pages Edit', scopes: ['com.cloudflare.api.account'] }] },
    generated_at: '2026-06-24T00:00:00.000Z',
  });
  assert.equal(packet.ok, false);
  assert.equal(packet.resolved_permission_count, 1);
  assert.equal(packet.unresolved_permission_count, 2);
  assert.match(packet.unresolved_permission_groups.map((item) => item.key).join('\n'), /account_read/);
  assert.match(packet.unresolved_permission_groups.map((item) => item.key).join('\n'), /pages_read/);
});

test('Cloudflare token request plain output is readable and claim-bounded', async () => {
  const packet = await buildCloudflareTokenRequest({
    mode: 'all',
    accountId: 'acct_123',
    tokenName: 'enigma-memory-prod',
    permissionGroupsJson: permissionGroups(),
    generated_at: '2026-06-24T00:00:00.000Z',
  });
  const plain = renderCloudflareTokenRequestPlain(packet);

  assert.match(plain, /^Enigma Cloudflare token request\n/);
  assert.match(plain, /Status: Ready/);
  assert.match(plain, /Mode: all/);
  assert.match(plain, /Token name: enigma-memory-prod/);
  assert.match(plain, /Required permissions: 8/);
  assert.match(plain, /Resolved permissions: 8/);
  assert.match(plain, /Token created: no/);
  assert.match(plain, /Token value printed: no/);
  assert.match(plain, /Boundary: public-safe Cloudflare token request skeleton only/);
  assert.doesNotMatch(plain, /^\s*\{/);
  assert.doesNotMatch(plain, /acct_123|Bearer|PRIVATE KEY|sk-|cf-token|raw_memory|C:\\Users\\|\/home\/|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/i);
});

test('Cloudflare token request CLI writes public-safe JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-token-request-'));
  const groupsPath = join(dir, 'permission-groups.json');
  const outPath = join(dir, 'token-request.json');
  await writeFile(groupsPath, JSON.stringify(permissionGroups(), null, 2), 'utf8');
  const result = await execFileAsync(process.execPath, [
    'scripts/build-cloudflare-token-request.mjs',
    '--permission-groups', groupsPath,
    '--mode', 'all',
    '--account-id', 'acct_123',
    '--token-name', 'enigma-memory-prod',
    '--out', outPath,
  ], {
    cwd: process.cwd(),
    env: { ...process.env, CLOUDFLARE_API_TOKEN: 'cf-token-present-but-never-printed' },
    timeout: 10000,
    windowsHide: true,
  });
  assert.equal(result.stderr, '');
  const stdoutPacket = JSON.parse(result.stdout);
  const filePacket = JSON.parse(await readFile(outPath, 'utf8'));
  assert.equal(stdoutPacket.schema, CLOUDFLARE_TOKEN_REQUEST_SCHEMA);
  assert.equal(stdoutPacket.ok, true);
  assert.equal(filePacket.token_request.name, 'enigma-memory-prod');
  assert.doesNotMatch(result.stdout, /cf-token-present-but-never-printed|Bearer|PRIVATE KEY|sk-/i);
});

test('Cloudflare token request CLI writes JSON while printing plain output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-token-request-plain-'));
  const groupsPath = join(dir, 'permission-groups.json');
  const outPath = join(dir, 'token-request.json');
  await writeFile(groupsPath, JSON.stringify(permissionGroups(), null, 2), 'utf8');
  const result = await execFileAsync(process.execPath, [
    'scripts/build-cloudflare-token-request.mjs',
    '--permission-groups', groupsPath,
    '--mode', 'hosted-probe',
    '--account-id', 'acct_123',
    '--token-name', 'enigma-memory-hosted-probe',
    '--out', outPath,
    '--plain',
  ], {
    cwd: process.cwd(),
    env: { ...process.env, CLOUDFLARE_API_TOKEN: 'cf-token-present-but-never-printed' },
    timeout: 10000,
    windowsHide: true,
  });
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /^Enigma Cloudflare token request\n/);
  assert.match(result.stdout, /Mode: hosted-probe/);
  assert.match(result.stdout, /Status: Ready/);
  assert.match(result.stdout, /Boundary: public-safe Cloudflare token request skeleton only/);
  assert.doesNotMatch(result.stdout, /^\s*\{/);
  assert.equal(result.stdout.includes(dir), false);
  assert.equal(result.stdout.includes(outPath), false);
  assert.equal(result.stdout.includes(groupsPath), false);
  assert.doesNotMatch(result.stdout, /acct_123|cf-token-present-but-never-printed|Bearer|PRIVATE KEY|sk-/i);
  const filePacket = JSON.parse(await readFile(outPath, 'utf8'));
  assert.equal(filePacket.schema, CLOUDFLARE_TOKEN_REQUEST_SCHEMA);
  assert.equal(filePacket.mode, 'hosted-probe');
});
