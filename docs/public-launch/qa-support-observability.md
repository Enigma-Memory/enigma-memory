# Public launch QA, support, and observability plan

This plan defines the evidence Enigma Memory needs before a general-public desktop beta and before GA. It assumes the consumer default path becomes a signed desktop app with one-button setup, automatic local vault creation, client detection, fix-it actions, health dashboard, update/uninstall flows, and no required terminal, Node install, or JSON editing. The CLI remains the power-user engine behind the desktop surface.

Claim boundary: all checks prove Enigma-controlled local setup, local vault behavior, local connector configuration, local proof/receipt output, and public-safe support workflows only. They do not prove provider deletion, model forgetting, hosted SaaS readiness, BYOC readiness, compliance certification, legal conclusions, or benchmark superiority.

## Deliverables

| Deliverable | Public beta acceptance | GA acceptance |
| --- | --- | --- |
| Signed desktop installers | Windows and macOS installers are signed enough for the target beta channel, install without terminal steps, and show a clear trust/error message if OS trust blocks launch. | Windows and macOS distribution use the chosen production trust channel: Windows Store/MSIX or trusted signing path for SmartScreen reduction, and macOS Developer ID signing, notarization, and stapling for Gatekeeper. |
| First-run wizard | Required setup is sequential and short: create local vault, detect supported clients, connect selected clients, then show health. Optional proof/CLI details stay hidden behind advanced controls. | Wizard handles every supported fresh-install and upgrade state, can resume after interruption, and never requires JSON editing. |
| Local vault and health dashboard | App creates or detects a local vault automatically and shows health states with actionable fix-it buttons. | Health dashboard covers vault, connector, receipt/proof, update, offline, and recovery states with stable support codes. |
| Client connect UX | Installed/config-present clients are detected; user can connect supported clients through the UI; missing clients are skipped with explanation. | Connect, repair, disconnect, and extension/package-assisted install paths are covered for supported clients, including Claude Desktop Extension / `.mcpb` packaging if adopted. |
| Proof output UX | User can generate and inspect a proof/receipt summary that is public-safe and explains Enigma-controlled scope. | Proof export and verification UX is stable, supportable, and consistently labels scope limits. |
| Crash/error reporting | Crash/error reporting is off by default and requires explicit opt-in before anything leaves the device. | Opt-in reporting has retention policy, visible controls, export/delete controls, and documented public-safe fields. |
| Local diagnostic bundle | User can create a local-only bundle, inspect it before sharing, and remove sensitive fields automatically. | Support can triage most install/connect/update issues from the bundle without raw memory, prompts, transcripts, credentials, account IDs, customer identifiers, or local absolute paths. |
| Rollback | Beta has a documented safe rollback path for app version and connector config changes. | GA rollback is tested across installer, update, config backup/restore, and vault schema compatibility boundaries. |
| Support playbooks | Support has issue codes, triage decision trees, escalation rules, and privacy-safe response templates. | Support playbooks include SLAs for beta/GA channels, release-blocker criteria, and closure rules tied to reproducible fixes. |

## Automated smoke matrix

Automated smoke should run on clean Windows and macOS runners or disposable VMs. It should drive the desktop app through public UI or stable app automation hooks, not private developer-only shortcuts. Every scenario must record only the allowed scenario status, app version, OS family/version bucket, issue code, and redacted state summaries.

### Automated public beta QA matrix runner

Run `node scripts/run-public-beta-qa-matrix.mjs --json` from the repository root to print the public-safe matrix report, or add `--out <relative-report-path>` to write the same JSON report. The runner lives at [`scripts/run-public-beta-qa-matrix.mjs`](../../scripts/run-public-beta-qa-matrix.mjs). The report schema is `enigma.public_beta_qa_matrix.v1`; evidence references must stay relative or opaque and must not include raw memory, prompts, transcripts, credentials, account IDs, customer identifiers, provider responses, signing secrets, private owner names, or local absolute paths.

Scenario status values are limited to `pass`, `fail`, `blocked`, `missing`, and `pending`:

- `pass` means the automated local/static slice has public-safe evidence for that scenario.
- `fail` means the runner found a concrete local violation that must be fixed before the scenario can pass.
- `blocked` means an external/manual prerequisite is not satisfied, such as PR approval/merge, published package availability, signing identity readiness, signed Windows/macOS artifacts, notarization/stapling, reviewer approval, clean-machine manual QA, or support dry run.
- `missing` means the required repo evidence or artifact is absent.
- `pending` means the scenario is defined but the relevant evidence has not been collected yet.

The automated matrix is a hold/block reporter, not a public readiness substitute. It can prove local readiness slices and privacy-safe evidence shape; it cannot prove clean Windows/macOS installs, real code-signing/notarization, npm publication, merged release approval, reviewer approval, support readiness, or production installer trust. Public beta remains held unless the automated report, the manual install matrix, release-owner checklist, support dry run, and Advisor decision all agree that the selected channel is ready.

| Scenario | Windows beta | macOS beta | GA pass bar |
| --- | --- | --- | --- |
| Fresh install launches | Installer completes, app opens, trust prompts are understandable, no terminal required. | Installer completes, app opens, Gatekeeper/notarization path is acceptable for channel. | Passes on current and one previous supported OS release per platform. |
| First run creates local vault | Wizard creates a local vault using default location abstraction, then lands on dashboard. | Same. | Idempotent rerun shows existing vault and does not duplicate setup. |
| Client detection | With no supported clients installed, app shows “no clients detected” and a non-blocking next step. With one supported client present, app detects it. | Same. | Detection never creates third-party config files just by scanning. |
| Client connect | User approves one detected client; app writes or updates only the Enigma connector entry and reports restart instructions when needed. | Same. | Existing unrelated client settings are preserved; repeated connect is idempotent. |
| Proof output | App generates a proof/receipt summary from local Enigma state and shows scope limits. | Same. | Output is verifiable offline and contains no raw memory, prompts, transcripts, credentials, account IDs, customer identifiers, or local absolute paths. |
| Update | App detects an available test update, downloads only after user approval or configured auto-update consent, applies update, and preserves vault/connectors. | Same. | Failed update rolls back to prior app version without corrupting vault or client configs. |
| Uninstall | Uninstaller removes app binaries and offers separate explicit choices for keeping or removing local vault and backups. | Same. | Default uninstall keeps user data; destructive removal requires clear confirmation. |
| Offline mode | App launches with network unavailable, shows local health, local search/context/proof surfaces that do not require network, and queues update checks. | Same. | No feature falsely reports hosted availability or provider-side guarantees while offline. |
| Corrupted config recovery | App detects malformed Enigma app config or connector config, explains the issue, offers restore from backup or safe reset, and does not overwrite unrelated settings. | Same. | Recovery path preserves last known good backup and emits a support code. |
| Crash restart | Forced app crash on startup or during wizard produces a local crash marker and next-launch recovery prompt. | Same. | No report is sent unless the user had explicitly opted in before the crash or approves sending after restart. |
| Diagnostics generation | User creates diagnostic bundle from settings/support screen. | Same. | Bundle schema rejects forbidden fields and replaces paths with stable labels before preview/share. |

## Manual install matrix

Manual QA should cover real consumer machines in addition to automated runners. Use fresh user profiles and upgraded profiles; avoid developer shells and repository checkouts.

| Platform | Install channel | Fresh install | Upgrade | Uninstall | Notes |
| --- | --- | --- | --- | --- | --- |
| Windows current supported release | Signed installer or Store/MSIX candidate | First run, local vault, client detection, connect, proof, offline. | Update from previous beta and previous GA candidate. | Keep-vault default and remove-vault explicit path. | Include SmartScreen/trust prompt observation without claiming it is eliminated unless distribution evidence proves it. |
| Windows previous supported release | Same channel | Same as above. | Same as above. | Same as above. | Include standard user account and admin-assisted install if channel requires elevation. |
| macOS current supported release | Developer ID signed/notarized/stapled candidate or approved beta channel | First run, local vault, client detection, connect, proof, offline. | Update from previous beta and previous GA candidate. | Keep-vault default and remove-vault explicit path. | Confirm Gatekeeper messaging and app translocation behavior are acceptable. |
| macOS previous supported release | Same channel | Same as above. | Same as above. | Same as above. | Include Intel or Apple Silicon coverage if both are supported. |

Manual QA must include at least these real-world states before public beta:

- No supported MCP clients installed.
- One supported client installed with no existing MCP config.
- One supported client installed with an existing unrelated MCP server entry.
- Multiple supported clients installed.
- Existing Enigma CLI/vault from power-user path.
- Network unavailable during first run.
- Network unavailable during update check.
- App killed during wizard, update, proof generation, and diagnostic bundle generation.
- Malformed Enigma app config.
- Malformed third-party client config that Enigma is allowed to read but not silently repair without approval.
- Insufficient permission to write the selected vault or client config location.

## Required scenario catalog

These are the minimum scenario IDs QA and support should use consistently in automation, manual testing, diagnostics, release notes, and support playbooks. The automated runner covers the `BETA-*` IDs below and reports `blocked`, `missing`, or `pending` where evidence is not yet available; those statuses hold public beta instead of implying readiness. A beta build may ship only if every applicable `BETA-*` scenario is `pass` for the selected channel and the manual install/support/release-owner gates also pass. GA also requires the `GA-*` scenarios across every supported Windows and macOS version.

| ID | Scenario | Beta pass condition | GA pass condition |
| --- | --- | --- | --- |
| `BETA-INSTALL-001` | Fresh desktop install | App installs, opens, and reaches first-run without terminal, Node, or JSON editing on clean Windows and macOS beta targets. | Same on every supported OS/version/channel combination. |
| `BETA-FIRST-001` | Fresh first run | Wizard creates/detects the local vault, detects clients, offers connect, then shows health. | Resume works after app restart, OS restart, and update interruption. |
| `BETA-CLIENT-CLAUDE-001` | Claude Desktop connect | User approves Claude connect; only the Enigma connector entry changes; unrelated settings are preserved and backup/rollback evidence exists when a config changes. | Connect, repair, disconnect, and reconnect are idempotent across supported Claude versions. |
| `BETA-PROOF-001` | Proof summary | App generates a local proof/receipt summary with explicit scope limits and no forbidden fields. | Export/verify UX has stable schema labels and offline verification guidance. |
| `BETA-OFFLINE-001` | Offline launch | App launches, shows local health, and defers network-dependent actions without hosted/provider readiness claims. | Returning online retries only user-approved actions. |
| `BETA-CONFIG-001` | Config recovery | App detects malformed Enigma or supported-client config, offers safe reset/restore, preserves unrelated settings, and emits a support code. | Repair/restore path is reversible and documented in support tooling. |
| `BETA-DIAG-001` | Diagnostic bundle preview | User can generate, preview, delete, and choose whether to share a local-only redacted bundle. | Support tooling rejects bundles with forbidden fields. |
| `BETA-CRASH-001` | Crash before opt-in | App records a local crash marker only; nothing is uploaded. | Restart recovery and one-time report approval work consistently. |
| `BETA-SIGNING-WINDOWS-001` | Windows signing evidence | Selected Windows beta artifact has public-safe signing/distribution evidence and observed trust-prompt notes. | Windows stable channel evidence covers every supported version/architecture. |
| `BETA-SIGNING-MACOS-001` | macOS signing/notarization evidence | Selected macOS beta artifact has Developer ID signing, notarization, stapling, and observed Gatekeeper evidence. | macOS stable channel evidence covers every supported version/architecture. |
| `BETA-UPDATE-001` | Beta update/rollback evidence | Update verification rejects unsigned/wrong-channel/downgrade payloads and failed update leaves the app/vault recoverable. | Signature verification, failed-update rollback, and metadata kill switch are proven across supported channels. |
| `BETA-NPM-001` | npm package availability evidence | Public package version required by the beta path is published and installable; local source version alone is not enough. | Registry evidence covers stable version and documented install path. |
| `BETA-MERGE-001` | Release approval/merge evidence | Release PR approval, merge, reviewer approval, and public-safe evidence packet refs are recorded. | Final release approval covers GA artifacts, release notes, and claim-boundary review. |
| `GA-UNINSTALL-001` | Default uninstall | App binaries are removed; user data is kept by default. | Reinstall detects kept vault and offers reconnect. |
| `GA-UNINSTALL-002` | Explicit full removal | Destructive removal requires explicit confirmation and removes only Enigma-owned app data/connectors. | No app helper, updater, launch item, or Enigma connector remains unless the user chose to keep it. |
| `GA-PRIVACY-001` | Telemetry controls | Telemetry/crash reporting can be enabled only by explicit opt-in and can be disabled. | View, export, delete, retention, and public-safe field allowlists are implemented and reviewed. |

## Step-by-step QA scripts

These scripts are written as user actions, not terminal procedures. They are suitable for a non-technical beta rehearsal.

### `BETA-INSTALL-001` fresh desktop install

1. Start from a clean user profile with no Enigma desktop app installed.
2. Open the signed installer from the selected beta channel.
3. Complete the installer with default choices.
4. Launch Enigma Memory from the normal OS app launcher.
5. Expected: the app opens to first-run, explains local-first setup, and does not ask the user to install Node, open a terminal, or edit JSON.

### `BETA-FIRST-001` fresh first run

1. On the first-run screen, choose the default local vault setup.
2. Continue through client detection.
3. Connect one detected client if one exists; otherwise continue past the no-client state.
4. Open the health dashboard.
5. Close and reopen the app.
6. Expected: the dashboard shows local vault health, connector state, and next recommended action; reopening does not restart or duplicate setup.

### `BETA-CLIENT-CLAUDE-001` Claude Desktop connect

1. Prepare Claude Desktop with an existing config that includes at least one non-Enigma setting.
2. From Enigma Memory, choose Claude Desktop and approve connect.
3. Restart Claude Desktop if the UI asks for it.
4. Return to Enigma Memory and refresh connector health.
5. Expected: Enigma connector state is healthy, unrelated Claude settings remain intact, a backup exists when the config changed, and rerunning connect reports no destructive change.

### `BETA-PROOF-001` proof output

1. From the dashboard, open the proof/receipt view.
2. Generate or refresh the local proof summary.
3. Open the consumer summary and the advanced details disclosure.
4. Expected: the summary describes Enigma-controlled local lifecycle evidence, labels scope limits, works without network access, and contains no forbidden private fields.

### `BETA-UPDATE-001` update and rollback evidence

1. Install the previous supported beta build.
2. Confirm the local vault and connector health are green or have known support codes.
3. Apply the candidate update through the app UI.
4. Relaunch the app and re-check vault, connector, proof, and diagnostics surfaces.
5. Repeat with a deliberately failed update package in the update test channel.
6. Expected: successful update preserves state; failed update leaves the prior version launchable or enters a clear rollback path; signature failure blocks the update.

### `GA-UNINSTALL-001` uninstall and reinstall

1. Install and complete first-run.
2. Uninstall with the default keep-user-data choice.
3. Reinstall the same or newer signed build.
4. Launch Enigma Memory.
5. Expected: app detects the kept local vault, offers reconnect if needed, and does not silently remove user data.

### `BETA-OFFLINE-001` offline mode

1. Disconnect network access before launching the app.
2. Open the health dashboard, connector state, and proof summary.
3. Try an update check.
4. Expected: local views work, network-dependent actions explain they are deferred, and no hosted/provider readiness claim appears.

### `BETA-CONFIG-001` corrupted config recovery

1. Put the Enigma app config into a known malformed state using the QA fixture harness for that platform.
2. Launch Enigma Memory.
3. Choose restore from backup, then repeat with safe reset.
4. Expected: app detects corruption, shows a support code, offers reversible recovery, and does not require the user to manually edit files.

### `BETA-DIAG-001` local diagnostic bundle

1. Open Settings, then Support.
2. Generate a diagnostic bundle.
3. Review the preview.
4. Delete the bundle without sharing, then generate it again and choose export.
5. Expected: the bundle is local until explicitly exported, preview lists every included category, and the scrubber blocks forbidden fields.

## Public beta test scenarios

Each scenario should have a stable support code, user-facing copy, expected remediation, and escalation rule.

### First run

Acceptance before beta:

- User can complete setup from a fresh install without terminal, Node, or JSON editing.
- Wizard shows only required steps first: local vault, client detection/connect, health.
- Optional advanced proof, CLI, and receipt details are discoverable but not blocking.
- Closing and reopening the app resumes at the correct step.
- Setup does not contact hosted Enigma services or providers unless the user chooses a feature that requires network and sees the reason.

GA must also pass:

- Interrupted setup is recoverable across app restart, OS restart, and update.
- Setup copy is localized-ready and does not expose internal package or filesystem details.
- All first-run error states have fix-it actions or clear support handoff.

### Client connect

Acceptance before beta:

- Detect installed/config-present supported clients.
- Explain skipped clients without making setup feel failed.
- Let user approve each connector write.
- Preserve unrelated client settings and sibling MCP servers.
- Back up changed client configs before writes.
- Provide restart instructions when a client requires restart.
- Offer a Claude Desktop Extension / `.mcpb` path if that package is part of the beta; otherwise mark it as not yet available.

GA must also pass:

- Connect, repair, disconnect, and retry are idempotent.
- GUI app path issues are handled by bundled runtime paths, not by asking users to find shell-installed binaries.
- Recovery from malformed client config is safe, reversible, and supportable.

### Proof output

Acceptance before beta:

- User can produce a proof/receipt summary from local Enigma-controlled lifecycle events.
- Output states what it proves and what it does not prove.
- Export/preview contains no raw memory, prompts, transcripts, credentials, account IDs, customer identifiers, or local absolute paths.
- Offline verification works without hosted service claims.

GA must also pass:

- Proof output has stable schema/version labels and compatibility policy.
- Support can request proof metadata without requesting private content.
- UI separates consumer-readable summary from advanced verifier details.

### Update

Acceptance before beta:

- Update check is visible and controllable.
- No update telemetry is sent before opt-in beyond the minimum network request required to fetch public update metadata.
- Update preserves local vault and connector settings.
- Failed update leaves a launchable prior version or clear rollback instructions.

GA must also pass:

- Delta/full update failure modes are tested.
- Update signing verification failure blocks install with a clear error.
- Rollback compatibility is documented for vault schema and connector config changes.

### Uninstall

Acceptance before beta:

- Default uninstall removes app binaries only and keeps user data.
- Removing local vault/backups is a separate explicit destructive choice.
- User sees what categories will be removed without exposing raw paths in public-facing copy.
- Connector cleanup is optional and scoped only to Enigma-owned entries.

GA must also pass:

- Reinstall after uninstall detects kept vault and offers reconnect.
- Full removal leaves no Enigma launch agents, update helpers, or connector entries unless the user chose to keep them.

### Offline mode

Acceptance before beta:

- App launches offline.
- Local vault health and local proof/receipt views work offline.
- Client connect actions that require only local writes remain available.
- Update and external docs links show deferred/offline state.

GA must also pass:

- Offline mode persists cleanly across restart.
- Returning online retries only user-approved network actions.

### Recovery from corrupted config

Acceptance before beta:

- App detects corrupted Enigma app config and offers safe reset or restore.
- App detects corrupted client config and asks before writing any repair.
- Existing backups are listed by relative label and timestamp bucket, not absolute path.
- Recovery bundle includes support codes and redacted metadata only.

GA must also pass:

- Recovery works after failed update, failed connector write, partial uninstall, and app crash.
- Support can identify the failing phase from diagnostics without private content.

## Crash and error reporting

Crash/error reporting must be explicit opt-in. Default state is local-only.

Required controls:

- First-run consent is separate from setup completion; declining does not reduce local functionality.
- Settings page includes enable, disable, view queued reports, delete queued reports, and export local report controls.
- Post-crash prompt explains what would be sent and lets the user inspect before sending when practical.
- User can send one report without enabling ongoing reporting.
- Reports use stable issue codes and coarse environment buckets.

Allowed report fields after opt-in:

- App version, installer channel, OS family, OS major/minor bucket, CPU architecture bucket.
- Scenario code, support code, error class, stack frame package/module names if scrubbed of local paths.
- Feature area: install, first-run, vault, connector, proof, update, uninstall, offline, diagnostics.
- Redacted config shape: booleans, counts, version numbers, schema names, connector IDs, and validation error codes.
- Crash timestamp rounded to a coarse bucket.

Forbidden report fields:

- Raw memory content.
- User prompts or model/provider transcripts.
- Credentials, tokens, private keys, cookies, session IDs, API keys, OAuth material, signing identities.
- Account IDs, customer identifiers, email addresses, names, payment data, or support ticket content pasted by the user.
- Local absolute paths, usernames, machine names, Wi-Fi names, nearby device names, or full process lists.
- Provider request/response bodies.
- Complete client config files.

## Local-only diagnostic bundles

Diagnostic bundles are generated on demand and remain local unless the user explicitly shares them. The bundle preview must show every included file/category before export.

Bundle contents allowed:

- Manifest with app version, bundle schema version, creation timestamp bucket, and selected scenario/support codes.
- Redacted health summary for vault, connector, proof, update, offline, and recovery states.
- Config validation results with field names and error codes, not values when values may contain private data.
- Connector inventory with supported connector IDs, installed/config-present booleans, Enigma-entry-present booleans, and backup counts.
- Proof/receipt metadata: schema version, event type labels, counts, verifier status, and hashes when they cannot reveal private content.
- Update state: current version, target version, channel, signature verification status, and rollback status.
- Crash markers with scrubbed stack module names and issue codes.

Bundle scrubber requirements:

- Replace local absolute paths with stable labels such as `app_config`, `vault_root`, `client_config`, and `backup_ref`.
- Drop raw file contents by default; include parsed validation summaries instead.
- Refuse export if forbidden fields are detected.
- Record scrubber version and forbidden-field scan result.
- Let user delete generated bundles from the app.

## Privacy-safe telemetry boundaries

Telemetry is not required for local functionality and must never be bundled into consent for terms, setup, updates, or support.

Allowed aggregate telemetry after opt-in:

- Install completion/failure counts by platform/channel/version bucket.
- Wizard step completion/drop-off by step code.
- Connector detection/connect success by connector ID and platform bucket.
- Health dashboard issue-code counts.
- Update success/failure by version/channel/platform bucket.
- Crash/error counts by support code and coarse environment bucket.

Disallowed telemetry:

- Memory content, prompts, transcripts, provider payloads, search queries, context pack content, proof private inputs, raw client configs, local absolute paths, account IDs, customer identifiers, credentials, tokens, and private keys.
- Fine-grained behavioral tracking unrelated to product reliability.
- Silent background upload before explicit opt-in.

Public reporting boundary:

- Public dashboards or release notes may discuss aggregate reliability and fix rates only after review.
- Do not publish customer counts, customer identities, raw support examples, provider-specific private failures, or claims that imply hosted readiness, provider deletion, model forgetting, compliance certification, or benchmark superiority.

## Observability operating model

The public beta observability model is reliability-first and privacy-minimal. The product should be useful with observability disabled; observability helps the team count failures, detect bad releases, and prioritize support fixes only after explicit opt-in.

### Event taxonomy

| Event family | Example event codes | Allowed dimensions | Forbidden dimensions |
| --- | --- | --- | --- |
| Install | `install_started`, `install_completed`, `install_failed` | Platform bucket, installer channel, app version, support code. | User path, machine name, account identity, installer log body. |
| First run | `wizard_step_viewed`, `wizard_step_completed`, `wizard_failed` | Step code, app version, platform bucket, support code. | Vault path, memory content, pasted text, prompt text. |
| Connector | `connector_detected`, `connector_connected`, `connector_failed` | Connector ID, detected/config-present booleans, validation code. | Client config body, local path, unrelated server names if user-defined. |
| Proof | `proof_summary_created`, `proof_verify_failed` | Proof schema version, receipt count bucket, verifier status code. | Raw memory, context pack content, provider payload, proof private inputs. |
| Update | `update_available`, `update_applied`, `update_rollback_used` | Current/target version, channel, signature status, support code. | Download URL with user-specific tokens, local cache path. |
| Diagnostics | `diagnostic_created`, `diagnostic_shared`, `diagnostic_rejected` | Bundle schema version, scrubber version, forbidden-field scan result. | Bundle body, raw logs, complete configs. |
| Crash/error | `crash_marker_created`, `report_approved`, `report_sent` | Error class, support code, scrubbed module names, coarse timestamp bucket. | Full stack with local paths, memory dumps, process lists. |

### Dashboards for beta operations

Internal dashboards may show only aggregate public-safe data:

- Install success rate by platform/channel/version bucket.
- First-run completion by wizard step code.
- Connector success rate by connector ID and platform bucket.
- Top health/support codes by app version.
- Update success, rollback use, and signature-failure counts by channel.
- Crash-free launch rate by app version and platform bucket.
- Diagnostic scrubber rejection count by forbidden-field category.

Dashboard drill-down must stop at issue-code cohorts. It must not expose individual user content, diagnostic bundle bodies, local paths, account identifiers, or customer identifiers.

### Alerting thresholds

Public beta should page or block rollout when any of these are observed from public-safe aggregate data:

- Fresh install success drops below the release manager's approved threshold for any supported platform/channel cohort.
- First-run completion drops materially after a release compared with the previous beta cohort.
- Any support code indicates possible private-data leakage in telemetry, diagnostics, proof output, or support tooling.
- Update signature verification failures spike after a release.
- Rollback use increases after a release.
- Crash-on-launch appears in the current release cohort.

GA must additionally require documented on-call ownership, release-manager authority for pause/rollback, and a reviewed incident template that does not request or paste private user data.

## Support code taxonomy

Support codes should be stable, short, and safe to show in screenshots. Codes identify product state, not user identity.

| Prefix | Area | Examples |
| --- | --- | --- |
| `INST` | Installer and launch trust | Trust prompt blocked, insufficient permission, corrupted installer, first launch failed. |
| `WIZ` | First-run wizard | Vault creation failed, resume failed, client scan failed, health step failed. |
| `CONN` | Client connectors | Client not detected, config malformed, write denied, backup restore failed. |
| `PROOF` | Proof/receipt output | Summary failed, verifier failed, forbidden field detected, offline verify unavailable. |
| `UPD` | Update | Metadata unavailable, signature failed, apply failed, rollback used. |
| `UNINST` | Uninstall/reinstall | Keep-vault failed, explicit removal failed, reconnect after reinstall failed. |
| `OFF` | Offline mode | Offline launch failed, deferred action retried without approval, local view unavailable. |
| `DIAG` | Diagnostics | Bundle created, scrubber rejected, preview failed, user deleted bundle. |
| `PRIV` | Privacy controls | Opt-in missing, disable/delete/export failed, forbidden field detected. |
| `CRASH` | Crash/error reporting | Crash marker created, restart recovery failed, report approval failed. |

Every support code needs a public-safe description, user-facing fix-it action, diagnostic fields allowed, escalation owner, and beta/GA release-blocker severity.

## Support playbooks

### Intake triage

1. Ask for app version, OS family, installer channel, and visible support code.
2. Ask whether the user is willing to generate a local diagnostic bundle.
3. Tell the user to preview the bundle and remove it if they are uncomfortable sharing.
4. Never ask for raw memory, prompts, transcripts, credentials, tokens, account IDs, private keys, or complete client configs.
5. If the issue involves a third-party client, ask for the connector ID and the visible Enigma status, not the full config file.

### Playbook: install blocked

- Confirm platform and installer channel.
- Identify trust-block, permission-block, update-helper-block, or corrupted-download support code.
- Provide channel-specific fix-it steps.
- Escalate as release blocker if a signed beta/GA build is blocked on a supported OS with default security settings.

### Playbook: first-run stuck

- Identify wizard step code.
- Ask whether the app was closed, machine restarted, or offline during setup.
- Use diagnostic bundle state summary to determine vault-created, clients-detected, connectors-written, and health-complete booleans.
- Escalate if restart/resume cannot recover without manual file editing.

### Playbook: client connect failed

- Identify connector ID, detected/config-present state, permission state, and validation error code.
- Use fix-it action first: retry, restore backup, disconnect Enigma entry, or safe reset Enigma connector entry.
- Escalate if unrelated client settings were changed, backup was not created before a changed write, or repeated connect is not idempotent.

### Playbook: proof output confusing or missing

- Confirm local vault health and proof/receipt status code.
- Explain Enigma-controlled proof scope and explicitly avoid provider deletion/model forgetting claims.
- Escalate if proof export includes forbidden data or fails offline verification.

### Playbook: update failed

- Identify current version, target version, update channel, signature status, and rollback status.
- Prefer built-in rollback or reinstall over manual file edits.
- Escalate if the app cannot relaunch, vault becomes unreadable, or connector configs are corrupted.

### Playbook: uninstall/reinstall issue

- Confirm whether user chose keep-vault or remove-vault.
- Confirm whether connector cleanup was selected.
- Reinstall should detect kept vault and offer reconnect.
- Escalate if default uninstall removes user data or leaves app background components running after full removal.

### Playbook: privacy concern

- Confirm whether telemetry/crash reporting is enabled.
- Guide user to view, export, delete, or disable reports.
- Treat any forbidden field in diagnostics or telemetry as a security/privacy release blocker.

## Rollback plan

Rollback must be designed before public beta, not improvised after a bad release.

Required rollback coverage:

- App binary rollback to prior signed version.
- Update metadata kill switch for a bad release.
- Connector config restore from Enigma-created backup.
- Enigma app config restore from last known good snapshot.
- Vault schema compatibility check before migration and a no-migration path when incompatible.
- Diagnostic bundle capture before and after rollback, with the same redaction rules.

Rollback release blockers:

- App cannot launch after failed update and no supported rollback exists.
- Vault migration is one-way without explicit compatibility plan.
- Connector writes cannot be restored to pre-change state.
- Rollback instructions require terminal use for ordinary consumers.
- Rollback evidence includes private user data or local absolute paths.

## Release blockers

Block public beta if any of these are true:

- Fresh install requires terminal, Node install, or JSON editing.
- First-run cannot create or detect the local vault.
- Client connect can overwrite unrelated settings or lacks changed-write backup.
- Diagnostic bundle can include raw memory, prompts, transcripts, credentials, tokens, account IDs, customer identifiers, or local absolute paths.
- Crash/error reporting sends anything before explicit opt-in.
- Proof output claims provider deletion, model forgetting, hosted readiness, BYOC readiness, compliance certification, legal conclusions, or benchmark superiority.
- Offline launch fails for the default local app.
- Corrupted config recovery requires unsupported manual editing for common cases.
- Signed installer trust path is unresolved for the selected beta channel.
- Automated public beta QA matrix has any `fail`, `blocked`, `missing`, or `pending` scenario.
- Clean Windows/macOS manual install tests, support dry run, PR approval/merge, reviewer approval, npm publish evidence, signed Windows/macOS artifact evidence, or code-signing/notarization evidence is missing.

Block GA if any beta blocker remains, or if any of these are true:

- Update/rollback is not proven across supported Windows and macOS versions.
- Uninstall/reinstall cannot preserve or intentionally remove user data according to user choice.
- Support cannot triage top install/connect/update failures from public-safe diagnostics.
- Telemetry controls lack disable/delete/export flows.
- Privacy review has not approved diagnostic and telemetry field allowlists.
- Release notes or public docs exceed the claim boundary.

## Dependencies

- Desktop shell implementation, preferably Tauri, bundling the required runtime internally so consumers do not install Node.
- Windows signing/distribution decision and automation.
- macOS Developer ID signing, notarization, and stapling automation.
- Installer/update framework with rollback and signature verification.
- Desktop health model over existing CLI/local engine surfaces.
- Client detector/connector engine exposed safely to the desktop UI.
- Optional Claude Desktop Extension / `.mcpb` package plan if used for Claude Desktop onboarding.
- Diagnostic bundle schema, scrubber, preview UI, and forbidden-field scanner.
- Crash reporter and telemetry transport that can remain fully disabled until explicit opt-in.
- Support tooling that can ingest only public-safe bundles and reject forbidden fields.
- Privacy review for field allowlists, retention, deletion, and public copy.

## Definition of ready

Public beta is ready when a non-technical user can install the signed app, complete first run, connect at least one supported local client when present, view local health, produce a scoped proof summary, update or uninstall safely, use the app offline, recover from common corrupted-config states, and generate a local-only diagnostic bundle without terminal, Node, JSON editing, or private-data leakage.

GA is ready when the same path is reliable across supported Windows and macOS versions, update/rollback/uninstall are proven, diagnostics and telemetry have opt-in privacy controls, support playbooks can resolve the expected top issues, and every public claim stays inside Enigma-controlled local proof and setup boundaries.
