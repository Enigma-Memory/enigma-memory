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
    assert.equal(report.files.length, 8);
    assert.equal(report.files.every((file) => file.path.startsWith(`${outDir}/`)), true);
    assert.match(plain, /templates only; no PR approval, merge, npm publish, signing, upload, network action/);
    assert.equal(report.next_commands.some((command) => command.includes('production:clean-machine-smoke -- --dry-run --plain')), true);
    assert.equal(report.next_commands.some((command) => command.includes('production:clean-machine-smoke -- --plain')), true);
    assert.equal(report.registry_install_guidance.command, 'npm install --prefix <temp-prefix> enigma-memory@0.1.19');
    assert.equal(report.registry_install_guidance.evidence_template, `${outDir}/registry-install.json`);
    assert.equal(report.desktop_release_guidance.evidence_template, `${outDir}/desktop-release-evidence.json`);
    assert.deepEqual(report.desktop_release_guidance.required_statuses, [
      'windows.signature.status=verified with evidence_ref',
      'macos.signature.status=verified with evidence_ref',
      'macos.notarization.status=accepted with evidence_ref',
      'macos.stapling.status=stapled with evidence_ref',
      'manifest.signature.status=verified',
      'update_rollback.status=pass with evidence_ref',
    ]);
    assert.equal(report.production_handoff_guidance.evidence_template, `${outDir}/production-handoff-packet.json`);
    assert.deepEqual(report.production_handoff_guidance.required_statuses, [
      'release_pr.approval_status=approved with reviewer_approval_ref',
      'release_pr.merge_ref is a public ref',
      'public_safe_release_packet_approval.status=approved',
      'public_safe_release_packet_approval.release_packet_ref is a public ref',
      'public_safe_release_packet_approval.claim_boundary_reviewer_ref is a public ref',
      'public_safe_release_packet_approval.approval_ref is a public ref',
      'public_safe_release_packet_approval.approved_at=YYYY-MM-DD or ISO timestamp',
    ]);
    assert.equal(report.next_commands.some((command) => command.includes('--preset diagnostics')), true);
    assert.equal(report.next_commands.some((command) => command.includes('--preset crash')), true);
    assert.match(plain, /Support dry-run triage values: resolved, needs_user_action, escalated, release_blocker, blocked/);
    assert.match(plain, /Support dry-run privacy statuses: pass, fail, blocked, not_applicable/);
    assert.match(plain, /Support dry-run collection steps: run_selected_preset_with_observed_triage_result, record_bundle_privacy_check_status_from_redaction_review, attach_redacted_allowlisted_support_artifact_only_when_available, keep_private_material_out_of_public_artifact/);
    assert.match(plain, new RegExp(`Next: npm run production:clean-machine-smoke -- --dry-run --plain --out ${outDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/clean-machine-smoke-plan\\.json`));
    assert.match(plain, new RegExp(`Next: npm run production:clean-machine-smoke -- --plain --out ${outDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/clean-machine-smoke\\.json`));
    assert.match(plain, /Registry install after npm publish: npm install --prefix <temp-prefix> enigma-memory@0\.1\.19/);
    assert.match(plain, new RegExp(`Registry install evidence template: ${outDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/registry-install\\.json`));
    assert.match(plain, new RegExp(`Desktop release evidence template: ${outDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/desktop-release-evidence\\.json`));
    assert.match(plain, /Desktop release required statuses: windows\.signature\.status=verified with evidence_ref; macos\.signature\.status=verified with evidence_ref; macos\.notarization\.status=accepted with evidence_ref; macos\.stapling\.status=stapled with evidence_ref; manifest\.signature\.status=verified; update_rollback\.status=pass with evidence_ref/);
    assert.match(plain, new RegExp(`Production handoff evidence template: ${outDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/production-handoff-packet\\.json`));
    assert.match(plain, /Production handoff required statuses: release_pr\.approval_status=approved with reviewer_approval_ref; release_pr\.merge_ref is a public ref; public_safe_release_packet_approval\.status=approved/);
    assert.doesNotMatch(plain, /C:\\Users|\/home\/|\/tmp\/|AppData\\Local/i);

    const manifest = JSON.parse(await readFile(join(outDir, 'evidence-manifest.json'), 'utf8'));
    assert.equal(manifest.schema, 'enigma.public_beta_evidence_manifest.v1');
    assert.equal(manifest.clean_machine_smoke, `${outDir}/clean-machine-smoke.json`);
    assert.equal(manifest.clean_machine_smoke_plan, `${outDir}/clean-machine-smoke-plan.json`);
    assert.deepEqual(manifest.support_dry_run, [
      `${outDir}/support-dry-run-diagnostics.json`,
      `${outDir}/support-dry-run-crash.json`,
    ]);
    assert.equal(manifest.registry_install, `${outDir}/registry-install.json`);
    assert.equal(manifest.desktop_release_evidence, `${outDir}/desktop-release-evidence.json`);
    assert.equal(manifest.production_handoff_packet, `${outDir}/production-handoff-packet.json`);

    const cleanMachineSmoke = JSON.parse(await readFile(join(outDir, 'clean-machine-smoke.json'), 'utf8'));
    assert.equal(cleanMachineSmoke.schema, 'enigma.clean_machine_smoke.v1');
    assert.deepEqual(cleanMachineSmoke.next_actions.map((action) => action.id), [
      'run_clean_machine_smoke_plan',
      'record_clean_machine_smoke_evidence',
    ]);
    assert.equal(cleanMachineSmoke.next_actions.find((action) => action.id === 'run_clean_machine_smoke_plan').command, 'npm run production:clean-machine-smoke -- --dry-run --plain --out <clean-machine-smoke-plan-out>');
    assert.deepEqual(cleanMachineSmoke.next_actions.find((action) => action.id === 'record_clean_machine_smoke_evidence').required_fields, [
      'summary.healthy',
      'summary.status',
      'safety.local_paths_included',
      'safety.memory_text_included',
    ]);

    const cleanMachinePlan = JSON.parse(await readFile(join(outDir, 'clean-machine-smoke-plan.json'), 'utf8'));
    assert.equal(cleanMachinePlan.schema, 'enigma.clean_machine_smoke_plan.v1');
    assert.equal(cleanMachinePlan.safety.system_inspection_performed, false);

    const diagnosticSupport = JSON.parse(await readFile(join(outDir, 'support-dry-run-diagnostics.json'), 'utf8'));
    assert.equal(diagnosticSupport.schema, 'enigma.support_dry_run_summary.v1');
    assert.equal(diagnosticSupport.evidence_status, 'template_only');
    assert.equal(diagnosticSupport.scenario_id, 'BETA-DIAG-001');
    assert.equal(diagnosticSupport.triage_result, 'blocked');
    assert.equal(diagnosticSupport.privacy_review.status, 'blocked');
    assert.equal(diagnosticSupport.privacy_scan.status, 'hold');
    assert.equal(diagnosticSupport.privacy_scan.detected_private_field_count, 0);
    assert.match(diagnosticSupport.replacement_command, /--preset diagnostics/);
    assert.match(diagnosticSupport.replacement_command, /--triage-result <observed-result>/);
    assert.match(diagnosticSupport.replacement_command, /--bundle-privacy-check-status <observed-status>/);
    assert.equal(diagnosticSupport.replacement_command.includes(`${outDir}/support-dry-run-diagnostics.json`), true);
    assert.doesNotMatch(diagnosticSupport.replacement_command, /--bundle-privacy-check-status pass|--triage-result resolved/);
    assert.match(diagnosticSupport.support_artifact_note, /public-safe review/);
    assert.deepEqual(diagnosticSupport.collection_guidance.triage_result_values, ['resolved', 'needs_user_action', 'escalated', 'release_blocker', 'blocked']);
    assert.deepEqual(diagnosticSupport.collection_guidance.bundle_privacy_check_status_values, ['pass', 'fail', 'blocked', 'not_applicable']);
    assert.deepEqual(diagnosticSupport.collection_guidance.collection_steps, [
      'run_selected_preset_with_observed_triage_result',
      'record_bundle_privacy_check_status_from_redaction_review',
      'attach_redacted_allowlisted_support_artifact_only_when_available',
      'keep_private_material_out_of_public_artifact',
    ]);
    assert.equal(diagnosticSupport.collection_guidance.support_artifact_input, 'optional_redacted_allowlisted_json_snapshot_hash_only');
    assert.match(diagnosticSupport.support_artifact_note, /hash and allowlisted status fields only/);
    assert.deepEqual(diagnosticSupport.next_actions.map((action) => action.id), [
      'run_support_dry_run_preset',
      'review_support_privacy_scan',
      'attach_support_artifact_if_safe',
    ]);
    assert.equal(diagnosticSupport.next_actions.find((action) => action.id === 'run_support_dry_run_preset').command, diagnosticSupport.replacement_command);
    assert.deepEqual(diagnosticSupport.next_actions.find((action) => action.id === 'review_support_privacy_scan').required_fields, [
      'privacy_scan.status',
      'privacy_scan.detected_private_field_count',
    ]);

    const crashSupport = JSON.parse(await readFile(join(outDir, 'support-dry-run-crash.json'), 'utf8'));
    assert.match(crashSupport.replacement_command, /--preset crash/);
    assert.equal(crashSupport.replacement_command.includes(`${outDir}/support-dry-run-crash.json`), true);

    const registry = JSON.parse(await readFile(join(outDir, 'registry-install.json'), 'utf8'));
    assert.equal(registry.schema, 'enigma.registry_install_verifier.v1');
    assert.equal(registry.evidence_status, 'template_only');
    assert.equal(registry.ok, false);
    assert.equal(registry.execute, false);
    assert.equal(registry.install.command, 'npm install --prefix <temp-prefix> enigma-memory@0.1.19');
    assert.doesNotMatch(registry.install.command, /npm install enigma-memory@|npm publish|npm token/i);
    assert.deepEqual(registry.next_actions.map((action) => action.id), [
      'record_public_npm_publish',
      'run_temp_prefix_registry_install',
    ]);
    assert.equal(registry.next_actions.find((action) => action.id === 'run_temp_prefix_registry_install').command, 'npm install --prefix <temp-prefix> enigma-memory@0.1.19');
    assert.deepEqual(registry.next_actions.find((action) => action.id === 'run_temp_prefix_registry_install').required_fields, [
      'install.result',
      'install.evidence_ref',
    ]);

    const desktop = JSON.parse(await readFile(join(outDir, 'desktop-release-evidence.json'), 'utf8'));
    assert.equal(desktop.schema, 'enigma.desktop_release_evidence.v1');
    assert.equal(desktop.blockers.includes('windows-signed-desktop-artifact-missing'), true);
    assert.equal(desktop.installers.some((installer) => installer.platform === 'windows' && installer.present === false), true);
    assert.equal(desktop.installers.find((installer) => installer.platform === 'windows').signature.status, 'file_present_unverified');
    assert.equal(desktop.installers.find((installer) => installer.platform === 'windows').signature.evidence_ref_required, true);
    assert.equal(desktop.installers.find((installer) => installer.platform === 'macos').signature.status, 'file_present_unverified');
    assert.equal(desktop.installers.find((installer) => installer.platform === 'macos').notarization.status, 'not_observed');
    assert.equal(desktop.installers.find((installer) => installer.platform === 'macos').stapling.status, 'not_observed');
    assert.equal(desktop.update_rollback.status, 'not_run');
    assert.equal(desktop.update_rollback.evidence_ref_required, true);
    assert.deepEqual(desktop.next_actions.map((action) => action.id), [
      'record_signing_identity_custody',
      'record_windows_signed_artifact',
      'record_macos_signed_notarized_artifact',
      'record_update_manifest_signature',
      'record_update_rollback_rehearsal',
    ]);
    assert.deepEqual(desktop.next_actions.find((action) => action.id === 'record_update_rollback_rehearsal').required_fields, [
      'update_rollback.status',
      'update_rollback.evidence_ref',
    ]);

    const handoff = JSON.parse(await readFile(join(outDir, 'production-handoff-packet.json'), 'utf8'));
    assert.equal(handoff.public_safe_release_packet_approval.status, 'pending');
    assert.equal(handoff.public_safe_release_packet_approval.release_packet_ref, 'TBD-public-release-packet-ref');
    assert.equal(handoff.public_safe_release_packet_approval.claim_boundary_reviewer_ref, 'TBD-claim-boundary-reviewer-ref');
    assert.equal(handoff.public_safe_release_packet_approval.approval_ref, 'TBD-public-approval-ref');
    assert.deepEqual(handoff.next_actions.map((action) => action.id), [
      'record_release_pr_review',
      'record_release_pr_merge',
      'record_public_safe_release_packet_approval',
    ]);
    assert.deepEqual(handoff.next_actions.find((action) => action.id === 'record_public_safe_release_packet_approval').required_fields, [
      'public_safe_release_packet_approval.status',
      'public_safe_release_packet_approval.release_packet_ref',
      'public_safe_release_packet_approval.claim_boundary_reviewer_ref',
      'public_safe_release_packet_approval.approval_ref',
      'public_safe_release_packet_approval.approved_at',
    ]);

    const advisor = await buildPublicBetaQaMatrix({ evidenceManifest: report.evidence_manifest });
    assert.equal(advisor.advisor_decision, 'hold');
    assert.equal(advisor.summary.ready_for_public_beta, false);
    assert.equal(advisor.next_actions[0].action_id, 'approve_merge_release_pr');
    assert.equal(advisor.next_actions.some((action) => action.action_id === 'record_support_dry_run'), true);
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
    assert.match(first.stdout, /--preset diagnostics/);
    assert.match(first.stdout, /--preset crash/);
    assert.match(first.stdout, /production:clean-machine-smoke -- --dry-run --plain/);
    assert.match(first.stdout, /production:clean-machine-smoke -- --plain/);
    assert.match(first.stdout, /Registry install after npm publish: npm install --prefix <temp-prefix> enigma-memory@0\.1\.19/);
    assert.match(first.stdout, /Desktop release required statuses: windows\.signature\.status=verified with evidence_ref/);
    assert.match(first.stdout, /Production handoff required statuses: release_pr\.approval_status=approved with reviewer_approval_ref/);
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
