import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  CLOUDFLARE_TOKEN_POLICY_SCHEMA,
  buildCloudflareTokenPolicy,
} from '../scripts/build-cloudflare-token-policy.mjs';

const execFileAsync = promisify(execFile);

test('Cloudflare token policy lists least-privilege Pages and registrar permissions without secrets', () => {
  const policy = buildCloudflareTokenPolicy({
    mode: 'all',
    accountId: 'acct_1234567890abcdef',
    projectName: 'enigma-memory',
    domain: 'enigmamemory.com',
    generated_at: '2026-06-24T00:00:00.000Z',
  });
  assert.equal(policy.schema, CLOUDFLARE_TOKEN_POLICY_SCHEMA);
  assert.equal(policy.mode, 'all');
  assert.equal(policy.mutation_boundaries.token_value_printed, false);
  assert.equal(policy.mutation_boundaries.registrar_register_requires_charge_acknowledgement, true);
  assert.equal(policy.mutation_boundaries.workers_deploy_probe_requires_execute, true);
  assert.match(policy.claim_boundary.join('\n'), /Worker probe deployment remains dry-run unless --execute/);
  assert.match(policy.permission_groups.map((item) => item.permission_name).join('\n'), /Cloudflare Pages Edit/);
  assert.match(policy.permission_groups.map((item) => item.permission_name).join('\n'), /Registrar Edit/);
  assert.match(policy.permission_groups.map((item) => item.permission_name).join('\n'), /Workers Scripts Edit/);
  assert.match(policy.permission_groups.map((item) => item.permission_name).join('\n'), /Workers Routes Edit/);
  assert.match(policy.planned_api_calls.map((item) => item.path).join('\n'), /\/pages\/projects\/enigma-memory/);
  assert.match(policy.planned_api_calls.map((item) => item.path).join('\n'), /\/registrar\/registrations/);
  assert.match(policy.planned_api_calls.map((item) => item.path).join('\n'), /\/workers\/services\/enigma-hosted-probe/);
  assert.match(policy.planned_api_calls.map((item) => item.path).join('\n'), /\/workers\/services\/enigma-relay/);
  assert.match(policy.planned_api_calls.map((item) => item.path).join('\n'), /\/workers\/domains/);
  assert.ok(policy.planned_api_calls.every((item) => item.token_printed === false));
  assert.match(policy.verification_commands.join('\n'), /workers inspect-probe --name enigma-hosted-probe/);
  assert.match(policy.verification_commands.join('\n'), /cloudflare:pages:stage/);
  assert.match(policy.verification_commands.join('\n'), /cloudflare:pages:dry-run/);
  assert.match(policy.verification_commands.join('\n'), /\.enigma\/cloudflare-pages\/enigmamemory\.com/);
  assert.match(policy.verification_commands.join('\n'), /pages verify --url https:\/\/enigmamemory\.com\//);
  assert.doesNotMatch(policy.verification_commands.join('\n'), /cloudflare:ops -- [^\n]* -- --/);
  assert.doesNotMatch(JSON.stringify(policy), /Bearer|PRIVATE KEY|sk-/i);
});

test('Cloudflare token policy scopes pages-deploy without registrar mutation calls', () => {
  const policy = buildCloudflareTokenPolicy({ mode: 'pages-deploy', accountId: 'acct', projectName: 'enigma-memory' });
  assert.equal(policy.permission_groups.some((item) => item.permission_name === 'Cloudflare Pages Edit'), true);
  assert.equal(policy.permission_groups.some((item) => /Registrar/.test(item.permission_name)), false);
  assert.equal(policy.planned_api_calls.some((item) => item.operation === 'registrar.register'), false);
  const hostedProbe = buildCloudflareTokenPolicy({ mode: 'hosted-probe', accountId: 'acct', projectName: 'enigma-memory' });
  assert.equal(hostedProbe.permission_groups.some((item) => item.permission_name === 'Workers Scripts Edit'), true);
  assert.equal(hostedProbe.permission_groups.some((item) => item.permission_name === 'Workers Routes Edit'), true);
  assert.equal(hostedProbe.permission_groups.some((item) => /Registrar/.test(item.permission_name)), false);
  assert.equal(hostedProbe.planned_api_calls.some((item) => item.operation === 'workers.service.upsert'), true);
  assert.equal(hostedProbe.planned_api_calls.some((item) => item.operation === 'workers.custom-domains.attach'), true);
  assert.match(hostedProbe.verification_commands.join('\n'), /workers inspect-probe --name enigma-hosted-probe/);
});

test('Cloudflare token policy CLI writes public-safe JSON', async () => {
  const outPath = join(await mkdtemp(join(tmpdir(), 'enigma-token-policy-')), 'policy.json');
  const result = await execFileAsync(process.execPath, [
    'scripts/build-cloudflare-token-policy.mjs',
    '--mode', 'all',
    '--account-id', 'acct_1234567890abcdef',
    '--project-name', 'enigma-memory',
    '--domain', 'enigmamemory.com',
    '--out', outPath,
  ], {
    cwd: process.cwd(),
    env: { ...process.env, CLOUDFLARE_API_TOKEN: 'cf-token-present-but-never-printed' },
    timeout: 10000,
    windowsHide: true,
  });
  assert.equal(result.stderr, '');
  const stdoutPolicy = JSON.parse(result.stdout);
  const filePolicy = JSON.parse(await readFile(outPath, 'utf8'));
  assert.equal(stdoutPolicy.schema, CLOUDFLARE_TOKEN_POLICY_SCHEMA);
  assert.equal(filePolicy.mode, 'all');
  assert.equal(stdoutPolicy.mutation_boundaries.token_value_printed, false);
  assert.doesNotMatch(result.stdout, /cf-token-present-but-never-printed|Bearer|PRIVATE KEY|sk-/i);
});
