import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildPublicBetaEvidenceManifest,
  parseArgs,
  renderPublicBetaEvidenceManifestPlain,
  runCli,
} from '../scripts/build-public-beta-evidence-manifest.mjs';

const ISO_NOW = '2026-06-29T00:00:00.000Z';

test('public beta evidence manifest defaults to relative public-safe artifact labels', () => {
  const manifest = buildPublicBetaEvidenceManifest({}, ISO_NOW);
  assert.equal(manifest.schema, 'enigma.public_beta_evidence_manifest.v1');
  assert.equal(manifest.public_safe, true);
  assert.equal(manifest.clean_machine_smoke, '.enigma/public-beta/clean-machine-smoke.json');
  assert.equal(manifest.clean_machine_smoke_plan, '.enigma/public-beta/clean-machine-smoke-plan.json');
  assert.deepEqual(manifest.support_dry_run, [
    '.enigma/public-beta/support-dry-run-diagnostics.json',
    '.enigma/public-beta/support-dry-run-crash.json',
  ]);
  assert.equal(manifest.registry_install, '.enigma/public-beta/registry-install.json');
  assert.equal(manifest.desktop_release_evidence, '.enigma/public-beta/desktop-release-evidence.json');
  assert.equal(manifest.production_handoff_packet, '.enigma/public-beta/production-handoff-packet.json');
  assert.equal(manifest.evidence_collection.length, 5);
  assert.deepEqual(
    manifest.evidence_collection.map((item) => item.evidence_item_id),
    [
      'EV-P10-CLEAN-MACHINE-SMOKE',
      'EV-P10-SUPPORT-DRY-RUN-SUMMARY',
      'EV-P10-REGISTRY-INSTALL',
      'EV-P10-DESKTOP-RELEASE-EVIDENCE',
      'EV-P10-PRODUCTION-HANDOFF-PACKET',
    ],
  );
  assert.equal(manifest.evidence_collection[4].target_file, '.enigma/public-beta/production-handoff-packet.json');
  assert.match(manifest.evidence_collection[3].collect, /signature\.status verified/);
  assert.match(manifest.evidence_collection[3].collect, /update_rollback pass/);
  assert.equal(manifest.safety.embeds_artifact_contents, false);
  assert.equal(manifest.safety.performs_release_action, false);
  assert.match(manifest.claim_boundary, /does not prove artifacts exist/);
  assert.doesNotMatch(JSON.stringify(manifest), /[A-Za-z]:\\|\/Users\/|\/home\//);
});

test('public beta evidence manifest accepts repeatable support summaries and rejects unsafe paths', () => {
  const options = parseArgs([
    '--clean-machine-smoke', 'evidence/smoke.json',
    '--clean-machine-smoke-plan', 'evidence/smoke-plan.json',
    '--support-dry-run', 'evidence/diag.json',
    '--support-dry-run', 'evidence/crash.json',
    '--registry-install', 'evidence/registry.json',
    '--desktop-release-evidence', 'evidence/desktop.json',
    '--production-handoff-packet', 'evidence/handoff.json',
    '--plain',
  ]);
  const manifest = buildPublicBetaEvidenceManifest(options, ISO_NOW);
  assert.equal(manifest.clean_machine_smoke_plan, 'evidence/smoke-plan.json');
  assert.deepEqual(manifest.support_dry_run, ['evidence/diag.json', 'evidence/crash.json']);
  assert.equal(manifest.registry_install, 'evidence/registry.json');
  assert.equal(options.plain, true);

  assert.throws(() => buildPublicBetaEvidenceManifest({ registryInstall: '../registry.json' }, ISO_NOW), /must not escape/);
  assert.throws(() => buildPublicBetaEvidenceManifest({ registryInstall: 'C:/tmp/registry.json' }, ISO_NOW), /relative repository-local/);
  assert.throws(() => buildPublicBetaEvidenceManifest({ registryInstall: 'token=secret.json' }, ISO_NOW), /credential-shaped/);
});

test('public beta evidence manifest CLI writes JSON and plain output without local paths', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-evidence-manifest-'));
  try {
    const out = join(dir, 'manifest.json');
    let stdout = '';
    const code = await runCli(['--out', out, '--plain'], { stdout: { write: (chunk) => { stdout += chunk; } } });
    assert.equal(code, 0);
    assert.match(stdout, /^Enigma public beta evidence manifest\n/);
    assert.match(stdout, /Manifest: written to <out>/);
    assert.match(stdout, /Clean-machine smoke plan: \.enigma\/public-beta\/clean-machine-smoke-plan\.json/);
    assert.match(stdout, /Status: Path manifest ready; evidence still must be collected/);
    assert.match(stdout, /Collect next: EV-P10-CLEAN-MACHINE-SMOKE into \.enigma\/public-beta\/clean-machine-smoke\.json: clean-machine smoke JSON after fresh install, first-run, connector, proof, offline, diagnostics, and uninstall checks/);
    assert.match(stdout, /Collect next: EV-P10-PRODUCTION-HANDOFF-PACKET into \.enigma\/public-beta\/production-handoff-packet\.json: release PR ref or URL, reviewer approval ref, merge ref, public-safe release packet approval ref, approval date, and handoff status/);
    assert.match(stdout, /Boundary: path-only manifest/);
    assert.doesNotMatch(stdout, /^\s*\{/);
    assert.equal(stdout.includes(dir), false);

    const manifest = JSON.parse(await readFile(out, 'utf8'));
    assert.equal(manifest.schema, 'enigma.public_beta_evidence_manifest.v1');
    assert.equal(manifest.next_command, 'npm run public-beta-qa -- --evidence-manifest <manifest.json>');
    assert.equal(manifest.clean_machine_smoke_plan, '.enigma/public-beta/clean-machine-smoke-plan.json');
    assert.equal(manifest.evidence_collection[2].target_file, '.enigma/public-beta/registry-install.json');
    assert.equal(renderPublicBetaEvidenceManifestPlain(manifest).includes('public-beta readiness claim'), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
