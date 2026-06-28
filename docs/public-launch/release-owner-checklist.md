# Release, signing, and support owner checklist

This checklist is the first-sprint P9 prerequisite ledger for signing, updates, support, rollback, and release ownership. It is a planning gate only: no item below means signing, notarization, publishing, update signing, or public beta release is complete.

## Claim and privacy boundary

Public-safe evidence and private runbooks must stay separate.

Public-safe evidence may include only:

- owner refs by role or handle, not real names unless already approved for public release;
- artifact names, version, channel, platform bucket, architecture bucket, file size, and SHA-256 hash;
- signing or notarization status labels, public signer display name, public signing/notarization status, and observed installer trust prompt summary;
- update manifest hash, public update verifier result, channel label, rollback rehearsal result, and support code;
- Advisor decision: ship, hold, or rollback, with public-safe blocker refs.

Private runbooks may contain restricted operational details, but they must not be copied into public evidence. Keep private identity records, access records, signing-material custody, release-machine details, emergency signer access, support escalation contacts, and rollback command procedures out of this public checklist.

## P9 prerequisite fields

| Field | Public-safe evidence entry | Private runbook entry | Manual blocker if missing |
| --- | --- | --- | --- |
| Release owner ref | Role/handle ref for the responsible release approver, such as `release-owner-ref`. | Named responsible person, backup, approval channel, and escalation route. | Public beta cannot be announced without one release owner and one backup recorded privately. |
| Signing owner ref | Role/handle ref for the responsible signing operator, such as `signing-owner-ref`. | Named signing operator, backup signer, approval flow, custody scope, and access review date. | Public beta cannot ship signed artifacts without a signing owner and backup signing path. |
| Support owner ref | Role/handle ref for beta support triage, such as `support-owner-ref`. | Named support lead, escalation rota, support queue, response expectations, and private troubleshooting runbook. | Public beta cannot open if install/update/connector support has no owner. |
| Signing identity prerequisites | Status only: `not-started`, `requested`, `validation-pending`, `issued`, `blocked`, or `not-applicable`, plus public-safe blocker ref. | Identity provider, legal publisher record, validation steps, approvers, issuance dates, renewal reminders, and revocation contacts. | Signing is blocked until identity validation and approved public publisher display names are complete. |
| Apple Developer ID prerequisites | Status for membership, Developer ID app signing, Developer ID installer signing if used, notarization readiness, and stapling verification. | Apple program administrator, private program identifiers, signing-asset custody, notarization setup, CI or release-machine access, renewal owner. | macOS public beta is blocked until Developer ID signing, notarization, and stapling prerequisites are ready for the selected artifact type. |
| Windows signing path decision | Selected path: `store-msix`, `direct-signed-installer`, or `both`, plus public-safe rationale and unresolved blocker ref. | Microsoft Partner Center or signing-provider details, organization validation status, publisher subject, SmartScreen/reputation notes, release-machine or managed-signing setup. | Windows public beta is blocked until the selected distribution path and publisher identity are approved. |
| Update signing key custody | Public key or signer identity ref, custody model label, rotation owner ref, and status. | Restricted signing-material custody procedure, managed-signing service details, hardware-backed access, emergency rotation steps, audit-log owner, backup custody process. | Updates are blocked until unsigned, wrong-channel, and unexpected downgrade payloads are rejected with owned key custody. |
| Rollback rehearsal owner | Role/handle ref for rollback rehearsal owner and rehearsal status. | Signed rollback package or manifest procedure, emergency approval path, private release-pull steps, and recovery validation notes. | Public beta is blocked if rollback has no owner or has not been rehearsed on the beta channel. |
| Public-safe evidence owner | Role/handle ref for evidence packet assembly and privacy review. | Opaque private evidence-store ref, review approvers, scanner configuration, and exception log. | Public beta is blocked if evidence cannot be exported without restricted content. |
| Advisor decision | `ship`, `hold`, or `rollback`; if hold/rollback, list public-safe failed gate refs. | Private context for blockers, owner assignments, and remediation plan. | Public beta is blocked unless Advisor decision is `ship`. |

## First-sprint status register

These rows intentionally start as manual blockers until the private release runbook assigns owners and records evidence.

| Prerequisite | Public status now | Required before beta |
| --- | --- | --- |
| Release owner | `unassigned` | Public owner ref plus private named owner and backup. |
| Signing owner | `unassigned` | Public owner ref plus private signer and backup custody path. |
| Support owner | `unassigned` | Public owner ref plus private support escalation path. |
| Signing identity | `manual-blocker` | Public-safe status showing validation/issuance is complete for the selected channel. |
| Apple Developer ID | `manual-blocker` | Public-safe status showing membership, required Developer ID signing assets, notarization, and stapling prerequisites are ready. |
| Windows signing path | `manual-blocker` | Selected Store/MSIX, direct signed installer, or both. |
| Update signing custody | `manual-blocker` | Public verifier identity, custody model label, rotation owner ref, and private custody owner. |
| Rollback rehearsal | `manual-blocker` | Owner ref and beta-channel rehearsal result. |
| Public-safe evidence | `manual-blocker` | Evidence packet owner and privacy review result. |
| Advisor decision | `manual-blocker` | `ship` recorded; any `hold` or `rollback` keeps P9 blocked. |

## Public-safe P9 evidence row template

Use these field names in public-safe release evidence. Values stay as role refs, status labels, hashes, public signer labels, and public-safe blocker refs.

| Field | Allowed value shape |
| --- | --- |
| `release_owner_ref` | Role or handle ref only. |
| `signing_owner_ref` | Role or handle ref only. |
| `support_owner_ref` | Role or handle ref only. |
| `signing_identity_status` | `not-started`, `requested`, `validation-pending`, `issued`, `blocked`, or `not-applicable`. |
| `apple_developer_id_status` | Membership, Developer ID Application, Developer ID Installer if used, notarization, and stapling readiness labels. |
| `windows_signing_path_decision` | `store-msix`, `direct-signed-installer`, or `both`. |
| `update_signing_custody_status` | Public verifier identity ref, custody model label, rotation owner ref, and status. |
| `rollback_rehearsal_owner_ref` | Role or handle ref only. |
| `rollback_rehearsal_status` | `not-scheduled`, `scheduled`, `passed`, `failed`, or `blocked`. |
| `public_safe_evidence_owner_ref` | Role or handle ref only. |
| `private_runbook_ref` | Opaque internal ref only; no expandable local reference. |
| `advisor_decision` | `ship`, `hold`, or `rollback`. |
| `advisor_blocker_refs` | Public-safe failed gate refs only. |

## First-sprint checklist

Use placeholders until the release team assigns real private owners. Do not insert restricted release details, non-public signing material, machine-local references, private personal names, or private support contacts in this public file.

- [ ] Assign release owner ref and private named owner.
- [ ] Assign signing owner ref and backup signing owner privately.
- [ ] Assign support owner ref and private beta support escalation path.
- [ ] Decide Windows first-beta path: Store/MSIX, direct signed installer, or both.
- [ ] Record Microsoft signing identity prerequisite status without restricted identity records or non-public signing material.
- [ ] Record Apple Developer Program, Developer ID Application, Developer ID Installer if used, notarization, and stapling prerequisite status without private Apple program details.
- [ ] Record update signing custody model, public verifier identity, rotation owner ref, and private custody runbook owner.
- [ ] Assign rollback rehearsal owner and schedule beta-channel rollback rehearsal.
- [ ] Confirm public-safe evidence packet owner and privacy reviewer.
- [ ] Record Advisor decision as ship, hold, or rollback with public-safe failed gate refs.

## Automated public beta QA matrix handoff

Run `npm run public-beta-qa` or `node scripts/run-public-beta-qa-matrix.mjs --json` as a public-safe status reporter before asking Advisor for beta approval. The runner lives at [`scripts/run-public-beta-qa-matrix.mjs`](../../scripts/run-public-beta-qa-matrix.mjs) and uses the [required scenario catalog](qa-support-observability.md#required-scenario-catalog): `BETA-INSTALL-001`, `BETA-FIRST-001`, `BETA-CLIENT-CLAUDE-001`, `BETA-CLIENT-001`, `BETA-CLIENT-002`, `BETA-CLIENT-003`, `BETA-PROOF-001`, `BETA-OFFLINE-001`, `BETA-CONFIG-001`, `BETA-CONFIG-002`, `BETA-DIAG-001`, `BETA-CRASH-001`, `BETA-SIGNING-WINDOWS-001`, `BETA-SIGNING-MACOS-001`, `BETA-UPDATE-001`, `BETA-NPM-001`, and `BETA-MERGE-001`.

Treat `pass` as evidence for the automated local/static slice only. Treat `fail`, `blocked`, `missing`, or `pending` as a hold for public beta until the named blocker has public-safe evidence. The matrix must not be used as a substitute for clean Windows/macOS manual install tests, signed Windows/macOS artifact evidence, Apple notarization/stapling evidence, Microsoft/Windows signing evidence, Apple/Microsoft signing identity and signing-secret custody evidence, `0.1.19` npm publish evidence, PR approval/merge, reviewer approval, or a support dry run; do not mark any of those complete unless the supporting public-safe repo artifact/evidence exists.

Read `next_actions` before the full scenario list. The first entry is the highest-priority blocker queue item, and every entry includes the blocker ID, owner ref, affected scenarios, evidence refs, and any concrete `missing_evidence_items`. It is only a queue; it does not change a blocker status or clear a release gate.

If the matrix reports `BLOCKER-SUPPORT-DRY-RUN`, the concrete public-safe evidence item to collect is `EV-P10-SUPPORT-DRY-RUN-SUMMARY`: a support dry-run summary with scenario ID, issue code, triage result, bundle privacy-check status, support owner ref, and optionally an allowlisted hash snapshot of a redacted `enigma.support_summary.v1` or `enigma.diagnostics.v1` artifact. Generate it with `npm run production:support-dry-run -- --scenario-id BETA-DIAG-001 --issue-code DIAG-BUNDLE-PREVIEWED --triage-result needs_user_action --bundle-privacy-check-status pass --support-owner-ref ref:role:beta-support --support-artifact .enigma/redacted-support-summary.json --out .enigma/support-dry-run-summary.json`. Recording that item makes the missing evidence reviewable; it does not clear clean-machine, signing, release, approval, or support blockers by itself.

## Public beta hold conditions

Hold P9 and the public beta announcement if any of these remain true:

- release owner, signing owner, support owner, or rollback rehearsal owner is missing;
- Windows signing path decision is unresolved;
- Apple Developer ID prerequisites are incomplete for the selected macOS artifact type;
- signing identity validation is incomplete for the selected Windows artifact type;
- update signing key custody is undefined or relies on copying restricted signing material into public docs or repo artifacts;
- rollback is unrehearsed or has no assigned owner;
- public evidence cannot be separated from private runbooks;
- automated public beta QA matrix has any `fail`, `blocked`, `missing`, or `pending` scenario;
- `0.1.19` is not published with public-safe install evidence;
- release PR approval, merge, or reviewer approval evidence is absent;
- clean Windows/macOS manual install evidence or support dry-run evidence is incomplete;
- Advisor decision is absent, `hold`, or `rollback`.
