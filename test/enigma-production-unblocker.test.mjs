import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  buildProductionUnblocker,
  PRODUCTION_UNBLOCKER_SCHEMA,
} from '../scripts/build-production-unblocker.mjs';

const execFileAsync = promisify(execFile);

const PACKAGE_JSON = Object.freeze({
  name: 'enigma-memory',
  version: '0.1.18',
  engines: { node: '>=24' },
  bin: {
    enigma: 'apps/cli/bin/enigma.mjs',
    'enigma-verify': 'apps/verifier/bin/enigma-verify.mjs',
    'enigma-mcp': 'packages/mcp-server/bin/enigma-mcp.mjs',
  },
});

function byId(report, id) {
  return report.sections.find((section) => section.id === id);
}

test('production unblocker emits complete public-safe planning report', () => {
  const report = buildProductionUnblocker({ packageJson: PACKAGE_JSON }, { generated_at: '2026-06-25T00:00:00.000Z' });
  assert.equal(report.schema, PRODUCTION_UNBLOCKER_SCHEMA);
  assert.equal(report.mode, 'dry_run_planning');
  assert.equal(report.credentials_required, false);
  assert.equal(report.credentials_used, false);
  assert.equal(report.mutates_external_systems, false);
  assert.equal(report.overall_status, 'blocked_external_dependency');
  assert.equal(report.package.name, 'enigma-memory');
  assert.equal(report.package.version, '0.1.18');
  assert.equal(report.package.source_version, '0.1.18');
  assert.equal(report.package.current_public_version, '0.1.18');
  assert.deepEqual(report.sections.map((section) => section.id), [
    'npm_install_readiness',
    'hosted_cloud_external_blockers',
    'solana_proof_rail_status',
    'benchmark_claim_status',
    'installer_distribution_status',
    'monitoring_ops_status',
  ]);
  assert.deepEqual(report.status_counts, {
    ready_now: 1,
    contract_ready: 1,
    blocked_external_dependency: 2,
    operator_evidence_required: 2,
  });
  assert.equal(byId(report, 'npm_install_readiness').status, 'ready_now');
  assert.equal(byId(report, 'hosted_cloud_external_blockers').status, 'blocked_external_dependency');
  assert.equal(byId(report, 'solana_proof_rail_status').status, 'contract_ready');
  assert.equal(byId(report, 'benchmark_claim_status').status, 'operator_evidence_required');
  assert.equal(byId(report, 'installer_distribution_status').status, 'blocked_external_dependency');
  assert.equal(byId(report, 'monitoring_ops_status').status, 'operator_evidence_required');
  assert.ok(report.operator_next_commands.some((entry) => entry.command === 'npm run production:unblocker -- --out .enigma/production-unblocker.json'));
  assert.ok(report.operator_next_commands.some((entry) => entry.command === 'npm run registry:verify -- --package enigma-memory --version 0.1.18 --execute'));
  assert.ok(report.operator_next_commands.some((entry) => entry.command.includes('npm run production:evidence-starter')));
  assert.ok(report.operator_next_commands.some((entry) => entry.command.includes('enigma chain verify --file')));
  assert.ok(report.operator_next_commands.some((entry) => entry.command.includes('npm run benchmark:standard')));
  assert.ok(report.operator_next_commands.some((entry) => entry.command.includes('npm run installer:assets')));
  assert.ok(report.operator_next_commands.some((entry) => entry.command.includes('npm run production:live-monitor:dry-run')));
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /Bearer\s+[A-Za-z0-9._~+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|sk-[A-Za-z0-9_-]{16}|AKIA[0-9A-Z]{16}/i);
  assert.doesNotMatch(serialized, /[A-Za-z]:\\Users\\|\/Users\/|\/home\//);
});

test('production unblocker is exposed through package metadata', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['production:unblocker'], 'node scripts/build-production-unblocker.mjs');
  assert.ok(pkg.files.includes('scripts/build-production-unblocker.mjs'));
});

test('production unblocker rejects secret and private evidence payloads', () => {
  assert.throws(
    () => buildProductionUnblocker({ packageJson: PACKAGE_JSON, evidence: { raw_memory: 'private memory text' } }),
    /not allowed|raw_memory/i,
  );
  assert.throws(
    () => buildProductionUnblocker({ packageJson: PACKAGE_JSON, evidence: { public_ref: 'Bearer abcdefghijklmnopqrstuvwxyz' } }),
    /secret-looking/i,
  );
  assert.throws(
    () => buildProductionUnblocker({ packageJson: PACKAGE_JSON, evidence: { output_ref: 'C:\\Users\\alice\\.enigma\\report.json' } }),
    /local absolute path/i,
  );
  assert.throws(
    () => buildProductionUnblocker({ packageJson: PACKAGE_JSON, raw_memory: 'private memory text' }),
    /unsupported production unblocker input field: raw_memory/i,
  );
});

test('production unblocker makes no false hosted Solana or live claims', () => {
  const report = buildProductionUnblocker({ packageJson: PACKAGE_JSON }, { generated_at: '2026-06-25T00:00:00.000Z' });
  assert.equal(report.live_claims.hosted_saas_live, false);
  assert.equal(report.live_claims.hosted_cloud_live_claim, false);
  assert.equal(report.live_claims.solana_mainnet_live_claim, false);
  assert.equal(report.live_claims.solana_transaction_claim, false);
  assert.equal(report.live_claims.transaction_submitted, false);
  assert.equal(report.live_claims.raw_memory_on_chain, false);
  assert.equal(report.live_claims.external_provider_called, false);
  assert.equal(report.live_claims.benchmark_leadership_claim, false);
  assert.equal(report.live_claims.provider_deletion_claim, false);
  assert.equal(report.live_claims.model_forgetting_claim, false);
  assert.match(byId(report, 'hosted_cloud_external_blockers').blockers.join('\n'), /operator go-live approval/i);
  assert.match(byId(report, 'solana_proof_rail_status').non_claims.join('\n'), /No Solana transaction is submitted/i);
  assert.match(byId(report, 'benchmark_claim_status').non_claims.join('\n'), /No provider API/i);
  assert.equal(report.sections.some((section) => section.id !== 'npm_install_readiness' && section.status === 'ready_now'), false);
});

test('production unblocker CLI writes public-safe JSON without echoing output path', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-production-unblocker-'));
  const out = join(dir, 'unblocker.json');
  const { stdout } = await execFileAsync(process.execPath, [
    'scripts/build-production-unblocker.mjs',
    '--generated-at', '2026-06-25T00:00:00.000Z',
    '--out', out,
  ], { cwd: process.cwd(), timeout: 10000, windowsHide: true });
  const report = JSON.parse(stdout);
  assert.equal(report.schema, PRODUCTION_UNBLOCKER_SCHEMA);
  assert.equal(report.credentials_required, false);
  assert.doesNotMatch(stdout, new RegExp(dir.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')));
  const written = JSON.parse(await readFile(out, 'utf8'));
  assert.equal(written.schema, PRODUCTION_UNBLOCKER_SCHEMA);
  assert.equal(written.live_claims.transaction_submitted, false);
});
