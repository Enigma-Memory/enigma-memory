# Public launch QA smoke scenarios

This document is the runnable scenario catalog for Enigma Memory public beta and GA. It contains only the `BETA-*` and `GA-*` scenarios from the QA/support/observability plan, formatted as a checklist that QA, support, and release managers can run or reference.

## Claim boundary

These scenarios prove Enigma-controlled local setup, Memory Drive behavior, local connector configuration, local proof/receipt output, and public-safe support workflows only. They do not prove provider deletion, model forgetting, hosted SaaS readiness, BYOC readiness, compliance certification, legal conclusions, or benchmark superiority.

## How to use this checklist

- Run each scenario on a clean Windows and macOS runner or disposable VM.
- Record pass/fail, app version, OS family/version bucket, issue code, and redacted state summary.
- A beta build may ship only if every `BETA-*` scenario passes on both Windows and macOS for the selected beta channel.
- A GA build may ship only if every `BETA-*` and `GA-*` scenario passes on every supported Windows and macOS version.

## Scenario catalog

### `BETA-INSTALL-001` Fresh desktop install

- [ ] Windows beta: App installs, opens, and reaches first-run without terminal, Node, or JSON editing.
- [ ] macOS beta: App installs, opens, and reaches first-run without terminal, Node, or JSON editing.
- [ ] GA: Same on every supported OS/version/channel combination.

### `BETA-FIRST-001` Fresh first run

- [ ] Windows beta: Wizard creates/detects the Memory Drive, detects clients, offers connect, then shows health.
- [ ] macOS beta: Wizard creates/detects the Memory Drive, detects clients, offers connect, then shows health.
- [ ] GA: Resume works after app restart, OS restart, and update interruption.


### `BETA-CLIENT-CLAUDE-001` Claude Desktop connect path

- [ ] Windows beta: Claude Desktop extension package path is primary; Enigma does not write Claude settings for the extension handoff.
- [ ] macOS beta: Claude Desktop extension package path is primary; Enigma does not write Claude settings for the extension handoff.
- [ ] GA: Connect, test, repair, disconnect, and reconnect remain idempotent across supported Claude Desktop versions.

### `BETA-CLIENT-001` No client installed

- [ ] Windows beta: App reports no detected supported clients as a non-blocking state.
- [ ] macOS beta: App reports no detected supported clients as a non-blocking state.
- [ ] GA: Same state has clear education and no false failure telemetry.

### `BETA-CLIENT-002` One supported client installed

- [ ] Windows beta: User approves connect; only the Enigma connector entry changes; backup is made if a config changes.
- [ ] macOS beta: User approves connect; only the Enigma connector entry changes; backup is made if a config changes.
- [ ] GA: Connect, repair, disconnect, and reconnect are idempotent.

### `BETA-CLIENT-003` Existing unrelated MCP settings

- [ ] Windows beta: Enigma preserves unrelated settings and sibling MCP servers.
- [ ] macOS beta: Enigma preserves unrelated settings and sibling MCP servers.
- [ ] GA: Recovery can restore pre-change config from Enigma-created backup.

### `BETA-PROOF-001` Proof summary

- [ ] Windows beta: App generates a local proof/receipt summary with explicit scope limits and no forbidden fields.
- [ ] macOS beta: App generates a local proof/receipt summary with explicit scope limits and no forbidden fields.
- [ ] GA: Export/verify UX has stable schema labels and offline verification guidance.

### `BETA-OFFLINE-001` Offline launch

- [ ] Windows beta: App launches, shows Memory Drive health, and defers network-dependent actions.
- [ ] macOS beta: App launches, shows Memory Drive health, and defers network-dependent actions.
- [ ] GA: Returning online retries only user-approved actions.

### `BETA-CONFIG-001` Corrupted Enigma app config

- [ ] Windows beta: App detects corruption, offers safe reset/restore, and emits a support code.
- [ ] macOS beta: App detects corruption, offers safe reset/restore, and emits a support code.
- [ ] GA: Recovery works after failed update, partial uninstall, and app crash.

### `BETA-CONFIG-002` Corrupted third-party client config

- [ ] Windows beta: App asks before repair and does not overwrite unrelated settings.
- [ ] macOS beta: App asks before repair and does not overwrite unrelated settings.
- [ ] GA: Repair/restore path is reversible and documented in support tooling.

### `BETA-DIAG-001` Diagnostic bundle preview

- [ ] Windows beta: User can generate, preview, delete, and choose whether to share a local-only redacted bundle.
- [ ] macOS beta: User can generate, preview, delete, and choose whether to share a local-only redacted bundle.
- [ ] GA: Support tooling rejects bundles with forbidden fields.

### `BETA-CRASH-001` Crash before opt-in

- [ ] Windows beta: App records a local crash marker only; nothing is uploaded.
- [ ] macOS beta: App records a local crash marker only; nothing is uploaded.
- [ ] GA: Restart recovery and one-time report approval work consistently.

### `BETA-SIGNING-WINDOWS-001` Windows signing evidence

- [ ] Windows beta: Selected beta artifact has public-safe signing/distribution evidence and observed Windows trust-prompt notes.
- [ ] Windows beta: Evidence records whether SmartScreen or publisher prompts were observed; a certificate alone is not treated as proof of zero prompts.
- [ ] GA: Windows stable channel evidence covers every supported version/architecture.

### `BETA-SIGNING-MACOS-001` macOS signing and notarization evidence

- [ ] macOS beta: Selected beta artifact has Developer ID signing, notarization, stapling, and observed Gatekeeper evidence.
- [ ] macOS beta: Evidence records the exact Gatekeeper prompt state on first launch.
- [ ] GA: macOS stable channel evidence covers every supported version/architecture.

### `BETA-UPDATE-001` Beta update and rollback evidence

- [ ] Windows beta: Update verification rejects unsigned, wrong-channel, and downgrade payloads while preserving Memory Drive and connector settings.
- [ ] macOS beta: Update verification rejects unsigned, wrong-channel, and downgrade payloads while preserving Memory Drive and connector settings.
- [ ] GA: Signature verification, failed-update rollback, and metadata kill switch are proven.

### `BETA-NPM-001` npm package availability evidence

- [ ] Beta: Public `enigma-memory@0.1.19` is published and installable from npm; local source version alone is not enough.
- [ ] Beta: Fresh install smoke confirms CLI bins, MCP stdio, and public package exports from the published package.
- [ ] GA: Registry evidence covers stable version and documented install path.

### `BETA-MERGE-001` Release approval and merge evidence

- [ ] Beta: PR approval, merge, reviewer approval, and public-safe evidence packet refs are recorded.
- [ ] Beta: Direct pushes to protected `main` remain blocked; release evidence points to the reviewed merge path.
- [ ] GA: Final release approval covers GA artifacts, release notes, and claim-boundary review.

### `GA-UNINSTALL-001` Default uninstall

- [ ] Windows GA: App binaries are removed; user data is kept by default.
- [ ] macOS GA: App binaries are removed; user data is kept by default.
- [ ] GA: Reinstall detects kept Memory Drive and offers reconnect.

### `GA-UNINSTALL-002` Explicit full removal

- [ ] Windows GA: Destructive removal requires explicit confirmation and removes only Enigma-owned app data/connectors.
- [ ] macOS GA: Destructive removal requires explicit confirmation and removes only Enigma-owned app data/connectors.
- [ ] GA: No app helper, updater, launch item, or Enigma connector remains unless the user chose to keep it.

### `GA-PRIVACY-001` Telemetry controls

- [ ] Windows GA: Telemetry/crash reporting can be enabled only by explicit opt-in and can be disabled.
- [ ] macOS GA: Telemetry/crash reporting can be enabled only by explicit opt-in and can be disabled.
- [ ] GA: View, export, delete, retention, and public-safe field allowlists are implemented and reviewed.

## Recording template

| Scenario | Platform | Channel | App version | OS bucket | Result | Issue code | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | pass/fail | | |

## Escalation

- Any failed `BETA-*` scenario blocks public beta for the affected platform/channel.
- Any failed `GA-*` scenario blocks GA for the affected platform/version.
- Report failures with the scenario ID, platform bucket, support code, and redacted state summary. Do not include raw memory, prompts, transcripts, credentials, account IDs, or local paths.
