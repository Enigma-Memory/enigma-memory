# Desktop app implementation plan

## Purpose

Make Enigma Memory usable by a general consumer without a terminal, npm, Node.js installation, or manual MCP JSON editing. The desktop app is the default public setup path; the existing CLI remains the power-user and support handoff path.

This plan is intentionally local-first. It does not claim hosted SaaS readiness, BYOC readiness, provider-side deletion, model forgetting, compliance certification, benchmark superiority, or legal conclusions.

## Target consumer promise

A default user should experience Enigma like installing a sync utility:

1. Download a signed installer from the public website or platform store.
2. Open the installed Enigma Memory desktop app.
3. Click **Set up Enigma Memory**.
4. Confirm the Memory Drive and client connections in a guided wizard.
5. See a health dashboard that says what is connected, what is local, and what still needs attention.
6. Use fix-it buttons for supported clients instead of editing config files.
7. Keep using the app offline for Memory Drive access, diagnostics, and queued local actions.

The user must not be asked to install Node.js, run `npm install -g`, paste shell commands, or edit MCP JSON during the default path.

## User-facing first-run flow

### 1. Installer

- User downloads a signed Windows installer/MSIX or signed and notarized macOS DMG/pkg/app.
- Installer verifies publisher identity through the OS trust surface.
- Installer places the app in the normal platform application location.
- Installer does not require Node.js, npm, Git, developer tools, or a terminal.
- Installer does not create or delete the Memory Drive.

### 2. First launch welcome

Screen copy should be short and consumer-safe:

- **Welcome to Enigma Memory**
- **Your Memory Drive is stored on this computer.**
- **Connect supported AI apps when you are ready.**
- Primary button: **Set up Enigma Memory**
- Secondary link: **Advanced CLI options**

The welcome screen must not show raw memory contents, prompts, transcripts, local expanded paths, account IDs, tokens, or credentials.

### 3. Memory Drive setup

Default behavior:

- Create an Enigma-controlled Memory Drive under the platform application data directory.
- Show a friendly location label such as **Enigma Memory Drive**.
- Put advanced path details behind **Show technical location**.
- Never print an expanded personal filesystem path in public logs, screenshots, telemetry, or release evidence.

Planned Memory Drive roots:

- Windows: app data directory resolved by the OS/Tauri path API, with Memory Drive data under `Enigma Memory/memory-drive`.
- macOS: Application Support directory resolved by the OS/Tauri path API, with Memory Drive data under `Enigma Memory/memory-drive`.
- Linux later: XDG data directory resolved by the OS/Tauri path API, with Memory Drive data under `enigma-memory/memory-drive`.

Memory Drive rules:

- The app owns schema initialization, migrations, lock files, and health metadata.
- Uninstall must not delete the Memory Drive by default.
- A destructive Memory Drive removal action must be separate, explicit, and require typed confirmation.
- Memory Drive location changes are advanced settings, not first-run requirements.

### 4. Client detection

The app detects supported local clients and classifies each as:

- **Ready to connect** — installed and supported automatic configuration path exists.
- **Needs permission** — installed, but OS permission or app confirmation is required.
- **Manual support only** — app detected, but safe automatic configuration is not available.
- **Not installed** — no supported local install found.

The first-run wizard shows only essential actions first. Advanced proof, CLI, and diagnostic details are hidden behind expandable sections.

### 5. One-button connection

For each supported automatic path:

- User clicks **Connect**.
- App previews the change in human language.
- App backs up the existing client config before writing.
- App writes only the minimum Enigma-owned MCP entry.
- App validates the resulting config.
- App shows **Connected** or a fix-it path.

Claude Desktop-specific goal:

- Prefer Claude Desktop Extensions / `.mcpb` where available to reduce raw MCP JSON editing.
- If `.mcpb` is not available, use the existing safe setup/connect engine behind a desktop permission prompt.
- Manual JSON instructions are an advanced fallback only, never the default route.

### 6. Health dashboard

After setup, the app lands on a dashboard with:

- Memory Drive status: initialized, locked/unlocked, schema version, last successful health check.
- Local service status: running, stopped, needs update, blocked by permission, port/socket conflict.
- Client connection status: connected, needs restart, needs permission, unsupported, not installed.
- Update status: current, update available, update downloaded, update failed with retry.
- Privacy boundary panel: Memory Drive and connector status only; no provider deletion or model forgetting claims.
- Buttons: **Fix**, **Restart local service**, **Open supported client**, **Export diagnostics**, **Advanced CLI handoff**.

The dashboard must not render raw memories, prompts, transcripts, credentials, tokens, private keys, account IDs, or customer identifiers.

## Architecture

### Tauri shell

Use Tauri as the public desktop shell because it keeps the UI native-feeling and small while avoiding a heavy browser runtime bundle.

Deliverables:

- `apps/desktop-tauri` or equivalent desktop app package.
- Tauri command bridge for setup, health, update, Memory Drive, and client connection operations.
- Minimal UI with welcome, setup wizard, dashboard, settings, update, diagnostics, and CLI handoff screens.
- Deep links or safe app intents for support actions where useful.
- OS permission prompts routed through the app, not through terminal scripts.

Engineering rules:

- Tauri commands must call typed internal APIs, not assemble shell strings from UI input.
- UI must treat all paths and diagnostic output as sensitive; redact expanded user-specific paths in public-safe exports.
- Advanced CLI details are progressive disclosure, not the primary journey.

### Bundled Enigma engine and runtime

The desktop app bundles the Enigma engine internally. Consumers do not install Node.js or npm.

Preferred implementation:

- Package the existing Enigma engine as an internal sidecar/runtime artifact.
- Bundle the required runtime with the app.
- Expose a stable local control API to the Tauri shell for setup, health, Memory Drive lifecycle, MCP connection, diagnostics, and shutdown.
- Keep the public CLI available as a power-user binary inside the app bundle or install image, but do not require it for setup.

Runtime acceptance:

- Fresh consumer machine with no Node.js installed can install, launch, initialize Memory Drive, connect a supported client, run health checks, and update.
- The UI never instructs the default user to run `npm install -g enigma-memory`.
- The UI never requires JSON editing for supported automatic client paths.

### Local service/process model

Use a supervised local process model:

- Tauri app is the user-facing controller.
- Enigma local service is a child sidecar process or OS-managed helper started by the app.
- Service exposes a localhost or OS IPC control channel restricted to the current user.
- Service owns Memory Drive access, client connector operations, and health checks.
- Tauri shell owns user prompts, permissions, update UX, and support-safe diagnostics.

Required service behavior:

- Start on app launch when needed.
- Stop cleanly on app quit unless background operation is explicitly enabled.
- Recover from crash with bounded restart and visible health state.
- Refuse cross-user access to the control channel.
- Avoid globally predictable unauthenticated control endpoints.
- Record local operational logs with sensitive values redacted.

Background behavior:

- Public launch default: foreground app controls the local service.
- Optional later setting: launch at login / tray mode after explicit opt-in.
- No hidden always-on daemon by default.

### Filesystem and Memory Drive layout

Planned local layout under the OS-resolved app data directory:

- `memory-drive/` — durable local Memory Drive, retained on uninstall.
- `state/` — app state, onboarding completion, health summaries.
- `logs/` — local logs with redaction and rotation.
- `backups/client-config/` — local backups of client config files before app-managed edits.
- `updates/` — temporary update staging, safe to delete after successful update.
- `diagnostics/` — user-triggered support bundles with public-safe redaction.

Rules:

- Memory Drive data is non-destructive across app updates and normal uninstall.
- App state can be reset without deleting the Memory Drive.
- Diagnostic bundles must omit raw memory, prompts, transcripts, credentials, tokens, private keys, expanded personal paths, account IDs, and customer identifiers.
- Client config backups are local-only and are not published in support artifacts unless explicitly redacted.

### Auto-update

Use Tauri-compatible signed updates after the first public desktop release.

Deliverables:

- Update manifest hosted on the public release channel.
- Signed update artifacts for Windows and macOS.
- UI states for checking, available, downloading, ready to restart, failed, and current.
- Rollback-safe install flow that preserves Memory Drive data.
- Update notes that describe product changes without exposing private local data.

Update rules:

- Updates must verify artifact signature before install.
- Failed update must leave the existing working app and Memory Drive intact.
- Update checks can fail offline without blocking local launch.
- Mandatory security update policy can be designed later, but public launch should not brick offline local use.

### Offline behavior

Offline launch must work for local-first features:

- App opens.
- Memory Drive status loads.
- Local service starts.
- Health dashboard shows offline update/check state.
- Supported local diagnostics run.
- Existing client connections remain visible.
- Update check is skipped or marked unavailable.

Offline limits must be plain:

- App cannot download updates while offline.
- App cannot fetch remote docs while offline.
- App cannot configure clients that require downloading extension packages while offline.
- No hosted service availability is implied.

### Fallback CLI handoff

CLI remains for power users, support, CI, and advanced diagnostics.

Desktop UI must include **Advanced CLI handoff** with:

- Copyable command suggestions only after the user opens the advanced panel.
- A clear note that CLI use is optional for default setup.
- Redacted diagnostic export path labels.
- `enigma doctor` and related support commands as advanced references, not first-run blockers.
- A path to install/use the CLI separately for users who intentionally want it.

Fallback rules:

- Default first-run success cannot depend on terminal commands.
- Support docs may ask advanced users for CLI output only after public-safe redaction.
- The app should prefer one-click fix actions over copying commands.

## Platform outputs

### Windows public output

Required for launch:

- Signed Windows installer and/or signed MSIX.
- Publisher identity selected and documented for release engineering.
- SmartScreen friction reduced through trusted signing and reputation-building release process.
- App installs without Node.js, npm, Git, or developer tools.
- App launches from Start Menu and desktop search.
- Uninstall leaves the Memory Drive by default and explains retention.

Acceptance:

- Fresh Windows consumer profile can install, launch, initialize vault, connect a supported client, relaunch offline, update, and uninstall without terminal use.
- If MSIX is used, storage permissions and app data paths are validated against the vault retention requirement.
- If a traditional installer is used, install scope and updater permissions are explicit and do not require administrator rights unless the selected installer model requires them.

### macOS public output

Required for launch:

- Signed app bundle.
- Developer ID signing.
- Notarization.
- Stapled notarization ticket for offline Gatekeeper validation where supported.
- DMG or pkg distribution, with final choice based on update model and install UX.
- App opens without users bypassing Gatekeeper warnings.
- App installs without Node.js, npm, Homebrew, Xcode, or terminal use.

Acceptance:

- Fresh macOS consumer profile can install, launch, initialize vault, connect a supported client, relaunch offline, update, and uninstall without terminal use.
- App translocation, quarantine, helper process signing, and sidecar runtime signing are validated.
- Notarization evidence is retained internally without publishing signing identities, secrets, or local paths.

### Linux later output

Optional after Windows/macOS public path:

- AppImage for broad testing.
- deb package for Debian/Ubuntu users.
- rpm only if demand justifies it.
- XDG-compliant data, config, cache, and autostart behavior.

Linux is not a public-launch blocker unless the release goal explicitly includes Linux consumers.

## Phase plan and dependencies

### Phase 0 — Product boundary and release inputs

Dependencies:

- Final claim boundary text for local-first desktop setup.
- Supported-client list for automatic connection at launch.
- Signing/release ownership for Windows and macOS.

Deliverables:

- Desktop claim boundary copy for welcome, dashboard, diagnostics, and release notes.
- Supported client matrix with automatic, extension-based, manual-only, and unsupported states.
- Redaction policy for diagnostics and public evidence.

Acceptance:

- Public copy does not claim provider deletion, model forgetting, hosted SaaS/BYOC readiness, compliance certification, benchmark superiority, or legal conclusions.
- No screen requires terminal, npm, Node.js, or JSON editing to describe the default path.

### Phase 1 — Tauri shell skeleton

Dependencies:

- UI route map.
- Command bridge contract.
- App identity, icon, bundle IDs, and display name.

Deliverables:

- Tauri desktop app with welcome, setup wizard, dashboard, settings, update, diagnostics, and CLI handoff screens.
- Typed command bridge adapters for real local engine operations, with explicit demo mode only for local UI development.
- Public-safe error model and redaction helpers.

Acceptance:

- App launches on Windows and macOS from a packaged build.
- First-run route can be completed with simulated local engine responses without terminal instructions in the UI.
- Every advanced CLI or proof detail is behind progressive disclosure.

### Phase 2 — Bundled engine/runtime

Dependencies:

- Engine packaging contract.
- Runtime bundling choice.
- Sidecar signing requirements for Windows and macOS.

Deliverables:

- Internal Enigma engine artifact bundled with the app.
- Bundled runtime so Node.js is not a user prerequisite.
- Local control API for setup, health, vault init, service lifecycle, client detection, connect, diagnostics, and shutdown.
- Crash and restart policy.

Acceptance:

- On a machine without Node.js, app initializes a vault and returns health status.
- The app does not shell out to user-installed global `enigma` for default setup.
- Sidecar/runtime artifacts are signed or covered by the platform signing model.

### Phase 3 — Vault lifecycle and local service

Dependencies:

- Vault schema and migration contract.
- Locking and multi-process behavior.
- Redacted logging contract.

Deliverables:

- OS app-data vault creation.
- Migration and schema health checks.
- Service start/stop/restart controls.
- Non-destructive uninstall policy.
- Reset app-state action that does not delete the vault.

Acceptance:

- First launch creates the vault with no terminal input.
- Relaunch reuses the existing vault.
- Update preserves the vault.
- Uninstall leaves the vault unless the user explicitly chooses a separate destructive removal flow.

### Phase 4 — Client detection and one-button setup

Dependencies:

- Supported-client matrix.
- Safe config write/backup primitives.
- Claude Desktop Extension / `.mcpb` feasibility decision.

Deliverables:

- Client detection adapters.
- Connection preview screen.
- Backup-before-write behavior.
- One-button connect/fix actions.
- Manual fallback screen for unsupported paths.

Acceptance:

- Supported automatic client connection completes without user JSON editing.
- Existing client config is backed up before mutation.
- Failed connect preserves the original client config and gives a fix-it path.
- Manual JSON instructions are not shown unless the user explicitly opens an advanced fallback.

### Phase 5 — Health dashboard and diagnostics

Dependencies:

- Health status schema.
- Redaction policy.
- Support bundle format.

Deliverables:

- Dashboard cards for vault, service, clients, updates, and privacy boundary.
- Fix-it actions for common failures.
- Public-safe diagnostic export.
- Advanced CLI handoff panel.

Acceptance:

- Dashboard shows actionable states, not raw logs.
- Support bundle excludes raw memory, prompts, transcripts, credentials, tokens, private keys, expanded personal paths, account IDs, and customer identifiers.
- Default troubleshooting can be performed through UI fix buttons.

### Phase 6 — Signed installers and updates

Dependencies:

- Windows signing identity and installer format decision.
- macOS Developer ID signing, notarization, and stapling pipeline.
- Update hosting and signing keys.

Deliverables:

- Windows signed installer/MSIX.
- macOS signed/notarized/stapled DMG/pkg/app.
- Signed update artifacts and update manifest.
- Release evidence checklist with private fields redacted.

Acceptance:

- Fresh Windows and macOS installs do not require terminal, npm, Node.js, or JSON editing.
- Gatekeeper and SmartScreen paths are acceptable for public distribution.
- Update applies without vault loss.
- Offline launch works after installation and after update.

## Test plan

These are release tests for the desktop plan. They are not executed as part of writing this document.

### Install test

Matrix:

- Windows fresh consumer profile with no Node.js/npm installed.
- macOS fresh consumer profile with no Node.js/npm/Homebrew/Xcode installed.

Steps:

1. Download public installer artifact.
2. Install through normal OS UI.
3. Launch Enigma Memory from the normal app launcher.
4. Confirm no terminal opens and no developer prerequisite is requested.
5. Confirm app reaches welcome screen.

Pass criteria:

- Installer is signed/trusted according to the selected platform distribution path.
- App launches with bundled engine/runtime.
- Default UI contains no terminal, npm, Node.js, or JSON editing requirement.

### First-launch setup test

Steps:

1. Click **Set up Enigma Memory**.
2. Accept default Memory Drive.
3. Let app detect supported clients.
4. Connect one supported automatic client.
5. Open dashboard.

Pass criteria:

- Vault initializes under the OS app data directory.
- User never edits JSON.
- User never runs a command.
- Existing client config is backed up before app-managed edits.
- Dashboard shows vault, service, client, and update status.

### Update test

Steps:

1. Install an older signed desktop build.
2. Initialize vault and connect a supported client.
3. Publish or stage a signed update artifact.
4. Trigger update from the app.
5. Restart into the updated app.

Pass criteria:

- Update signature is verified.
- App updates without terminal use.
- Vault remains available after update.
- Client connection state remains visible after update.
- Failed update leaves the old app and vault usable.

### Offline launch test

Steps:

1. Install app and complete first-run setup while online.
2. Quit app.
3. Disconnect network.
4. Launch app.
5. Open dashboard and diagnostics.

Pass criteria:

- App launches offline.
- Local service starts offline.
- Memory Drive status loads offline.
- Update check fails gracefully or is marked unavailable.
- No hosted service readiness is implied.

### Uninstall and non-destructive vault retention test

Steps:

1. Install app.
2. Initialize vault.
3. Uninstall app through normal OS UI.
4. Reinstall same or newer signed app.
5. Launch app.

Pass criteria:

- Normal uninstall does not delete the vault.
- Reinstalled app detects existing vault.
- User is told how to remove vault data only through a separate explicit destructive flow.
- No raw vault data appears in installer, uninstaller, or public diagnostic output.

### Client config rollback test

Steps:

1. Prepare a supported client with an existing config.
2. Run one-button connect.
3. Force a validation failure after backup.
4. Use app-provided rollback/fix action.

Pass criteria:

- Original config backup exists locally.
- App restores or preserves working client config.
- Error message is actionable and does not expose secrets or expanded personal paths.
- User is not instructed to manually edit JSON unless they open advanced fallback.

### CLI fallback test

Steps:

1. Complete default setup through UI.
2. Open **Advanced CLI handoff**.
3. Copy a diagnostic command suggestion.
4. Export a diagnostic bundle.

Pass criteria:

- CLI commands are optional and clearly advanced.
- Default setup remains complete without CLI use.
- Diagnostic export is redacted.
- No support artifact contains raw memory, prompts, transcripts, credentials, tokens, private keys, account IDs, customer identifiers, or expanded personal paths.

## No-terminal proof checklist

Release evidence for the default consumer path must include a screen-by-screen proof packet for Windows and macOS showing:

- Installer launched from the OS shell with no terminal window.
- First launch on a profile without Node.js/npm installed.
- Vault initialized from the setup wizard.
- Supported client detected from the wizard.
- Supported client connected with a button or platform extension flow.
- Existing client config backed up and validated by the app.
- Health dashboard opened after setup.
- App relaunched offline with vault and service status visible.
- Update applied from in-app UI.
- Normal uninstall completed while preserving the vault.

The packet must fail if any default-path screenshot, copy block, support prompt, or wizard step tells the user to install Node.js, install npm packages, run shell commands, or edit MCP JSON. CLI command examples are allowed only inside **Advanced CLI handoff** and must be labeled optional.

## Component ownership

- Desktop shell: owns welcome, wizard, health dashboard, update UI, diagnostics UI, settings, and advanced CLI handoff.
- Engine bundle: owns local Enigma operations, vault initialization, migrations, health checks, client setup adapters, and safe rollback.
- Local service: owns supervised runtime lifecycle, current-user IPC, crash recovery, and vault access.
- Installer/updater: owns platform packaging, signatures, notarization where applicable, update verification, rollback safety, and uninstall behavior.
- Support diagnostics: owns public-safe export with redaction of raw memory, prompts, transcripts, credentials, tokens, private keys, expanded personal paths, account IDs, and customer identifiers.

## Cutover from CLI-first product

The desktop app replaces CLI-first onboarding for public consumers, but it should reuse the proven engine behavior behind UI actions:

- `enigma setup` capability becomes **Set up Enigma Memory**.
- `enigma connect <client> --dry-run` capability becomes guided client detection plus one-button preview, explicit approval, backup, validation, and rollback.
- `enigma doctor` capability becomes dashboard health cards plus **Export diagnostics**.
- CLI install docs remain available for power users, support, and automation, but public quickstart material should lead with the signed desktop app.

Acceptance for cutover:

- Public install copy starts with desktop download, not npm.
- The first-run wizard completes without surfacing CLI syntax.
- Power-user CLI docs remain accurate but are not required for consumer success.

## Public launch blockers

- No signed Windows installer/MSIX.
- No macOS Developer ID signed, notarized, stapled distribution artifact.
- No bundled runtime proof on machines without Node.js.
- No final supported-client matrix for one-button setup.
- No production-safe client config backup/rollback path.
- No redacted diagnostic bundle review.
- No update signature and rollback validation.
- No uninstall test proving vault retention.
- Any first-run screen that tells default users to install Node.js, run npm, open a terminal, or edit JSON.

## Release readiness definition

The desktop app is ready for general-public setup only when both Windows and macOS release candidates pass the install, first-launch, update, offline launch, uninstall/vault-retention, client rollback, and CLI fallback tests without relying on terminal commands, npm, Node.js installation, or MCP JSON editing for the default supported path.
