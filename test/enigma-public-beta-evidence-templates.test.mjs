import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  PUBLIC_BETA_EVIDENCE_TEMPLATES_SCHEMA,
  buildPublicBetaEvidenceTemplates,
  renderPublicBetaEvidenceTemplatesPlain,
} from '../scripts/build-public-beta-evidence-templates.mjs';
import { buildPublicBetaQaMatrix } from '../scripts/run-public-beta-qa-matrix.mjs';

const execFileAsync = promisify(execFile);
const SCRIPT = 'scripts/build-public-beta-evidence-templates.mjs';

function templateOutDir(name) {
  return `.enigma/${name}-${process.pid}-${Date.now()}`;
}

async function cleanup(outDir) {
  await rm(outDir, { recursive: true, force: true });
}

test('public beta evidence templates are public-safe blockers, not fake evidence', async () => {
  const outDir = templateOutDir('public-beta-evidence-templates');
  try {
    const report = await buildPublicBetaEvidenceTemplates({ outDir }, new Date('2026-06-23T12:00:00.000Z'));
    const plain = renderPublicBetaEvidenceTemplatesPlain(report);

    assert.equal(report.schema, PUBLIC_BETA_EVIDENCE_TEMPLATES_SCHEMA);
    assert.equal(report.safety.template_only, true);
    assert.equal(report.safety.release_action_performed, false);
    assert.equal(report.safety.network_performed, false);
    assert.equal(report.files.length, 5);
    assert.equal(report.files.every((file) => file.path.startsWith(`${outDir}/`)), true);
    assert.match(plain, /templates only; no PR approval, merge, npm publish, signing, upload, network action/);
    assert.doesNotMatch(plain, /C:\\Users|\/home\/|\/tmp\/|AppData\\Local/i);

    const manifest = JSON.parse(await readFile(join(outDir, 'evidence-manifest.json'), 'utf8'));
    assert.equal(manifest.schema, 'enigma.public_beta_evidence_manifest.v1');
    assert.equal(manifest.clean_machine_smoke, `${outDir}/clean-machine-smoke.json`);
    assert.equal(manifest.registry_install, `${outDir}/registry-install.json`);
    assert.equal(manifest.desktop_release_evidence, `${outDir}/desktop-release-evidence.json`);
    assert.equal(manifest.production_handoff_packet, `${outDir}/production-handoff-packet.json`);

    const registry = JSON.parse(await readFile(join(outDir, 'registry-install.json'), 'utf8'));
    assert.equal(registry.schema, 'enigma.registry_install_verifier.v1');
    assert.equal(registry.evidence_status, 'template_only');
    assert.equal(registry.ok, false);
    assert.equal(registry.execute, false);
    assert.equal(registry.install.command, 'npm install --prefix <temp-prefix> enigma-memory@0.1.19');
    assert.doesNotMatch(registry.install.command, /npm install enigma-memory@|npm publish|npm token/i);

    const desktop = JSON.parse(await readFile(join(outDir, 'desktop-release-evidence.json'), 'utf8'));
    assert.equal(desktop.schema, 'enigma.desktop_release_evidence.v1');
    assert.equal(desktop.blockers.includes('windows-signed-desktop-artifact-missing'), true);
    assert.equal(desktop.installers.some((installer) => installer.platform === 'windows' && installer.present === false), true);

    const advisor = await buildPublicBetaQaMatrix({ evidenceManifest: report.evidence_manifest });
    assert.equal(advisor.advisor_decision, 'hold');
    assert.equal(advisor.summary.ready_for_public_beta, false);
    assert.equal(advisor.next_actions[0].action_id, 'approve_merge_release_pr');
  } finally {
    await cleanup(outDir);
  }
});

test('public beta evidence template CLI is non-destructive by default', async () => {
  const outDir = templateOutDir('public-beta-evidence-template-cli');
  try {
    const first = await execFileAsync(process.execPath, [SCRIPT, '--out-dir', outDir, '--plain'], {
      cwd: process.cwd(),
      windowsHide: true,
    });
    assert.equal(first.stderr, '');
    assert.match(first.stdout, /Enigma public beta evidence templates/);
    assert.match(first.stdout, new RegExp(`Evidence manifest: ${outDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\/evidence-manifest\.json`));
    assert.doesNotMatch(first.stdout, /C:\\Users|\/home\/|\/tmp\/|AppData\\Local/i);

    const second = await execFileAsync(process.execPath, [SCRIPT, '--out-dir', outDir, '--plain'], {
      cwd: process.cwd(),
      windowsHide: true,
    }).catch((error) => error);
    assert.equal(second.code, 1);
    assert.match(second.stderr, /already exists/);
    assert.match(second.stderr, /--overwrite only if you intentionally replace/);
  } finally {
    await cleanup(outDir);
  }
});
