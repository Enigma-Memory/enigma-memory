# General public launch workplan

## Operating model

Build Enigma Memory for consumers as a desktop-first product. The CLI/package remains the engine, but every public default path must work through signed installers, a desktop wizard, one-click app connections, health/fix-it UI, and privacy-safe support tools.

Each phase must finish with local verification evidence before the next phase starts. Public launch is blocked by any failed acceptance item, unsigned/untrusted distribution path, privacy leak, unsupported update rollback, or claim outside Enigma-controlled local evidence.

## Phase 0 — Public launch contract

**Goal:** Lock the consumer promise, claim boundary, and release gates.

**Deliverables**

- `docs/GENERAL_PUBLIC_LAUNCH_GOAL.md`
- `docs/GENERAL_PUBLIC_LAUNCH_WORKPLAN.md`
- [`docs/WORKFLOWZ_FRICTIONLESS_GOAL.md`](WORKFLOWZ_FRICTIONLESS_GOAL.md)
- [`docs/public-launch/ADVISOR.md`](public-launch/ADVISOR.md)
- [`docs/public-launch/workflowz-execution-roadmap.md`](public-launch/workflowz-execution-roadmap.md)
- Public launch plan slice docs under `docs/public-launch/`
- Package file inclusion for these docs

**Acceptance**

- Public launch definition of done states no terminal, npm, Node, or JSON editing in the default path.
- Claim boundary explicitly excludes provider deletion, model forgetting, hosted SaaS/BYOC readiness, compliance certification, benchmark superiority, legal conclusions, and chain submission without evidence.
- Desktop, connector, trust/release, QA/support, and docs plans have concrete blockers and acceptance criteria.

**Verification**

- `npm run check`
- `npm run secret-scan`
- `npm pack --dry-run`

## Phase 1 — Desktop shell and bundled engine

**Goal:** Create a desktop app that runs Enigma without user-installed Node/npm.

**Parallel work packages**

1. **Tauri app shell**
   - Create desktop app package.
   - Add welcome, setup, dashboard, connectors, privacy, proof activity, diagnostics, update, and settings screens.
   - Add app copy from `docs/public-launch/consumer-onboarding-ux.md`.

2. **Bundled runtime bridge**
   - Package Enigma engine/runtime as an internal sidecar or equivalent bundled service.
   - Expose typed setup, vault, health, connector, proof, diagnostics, update, and shutdown commands.
   - Never build shell strings from UI input.

3. **Local service model**
   - Run foreground-controlled local helper by default.
   - Restrict control channel to the current user.
   - Add bounded restart, crash marker, and health states.

4. **Vault layout and migration**
   - Create OS app-data vault layout.
   - Preserve vault data across update and default uninstall.
   - Add advanced-only vault location controls.

**Acceptance**

- Clean machine with no Node/npm can install, launch, create vault, show health, and quit cleanly.
- App can run offline for local vault health and proof views.
- Public UI does not show private expanded paths, raw memory, prompts, transcripts, credentials, tokens, account IDs, or customer identifiers.

**Verification**

- Desktop unit tests for command bridge and redaction.
- Desktop smoke test on Windows and macOS clean profiles.
- Existing package gates remain green.

## Phase 2 — Consumer onboarding wizard

**Goal:** Make first run one primary action at a time.

**Parallel work packages**

1. **Wizard screens**
   - Welcome.
   - Create private vault.
   - Find apps.
   - Connect apps.
   - Health check.
   - Ready.

2. **Error/fix states**
   - Permission issue.
   - Existing vault found.
   - Disk space low.
   - No supported apps.
   - Restart needed.
   - Unsupported client version.
   - Corrupted config.

3. **Progressive disclosure**
   - Hide CLI, MCP, schema, Merkle, receipt-chain, proof-of-non-use, and quarantine-root language until advanced details.
   - Keep proof copy as local activity details in the default path.

4. **Accessibility**
   - Keyboard navigation.
   - Screen reader labels.
   - Color contrast.
   - Reduced-motion support.
   - Large text and plain-language copy.

**Acceptance**

- A non-technical user can complete first run with the default location and without seeing terminal/package/protocol instructions.
- Closing/reopening resumes the wizard.
- Every blocking error has one primary fix or clear support handoff.

**Verification**

- Automated UI smoke: happy path, no clients, one client, permission failure, restart-needed state.
- Manual usability run with non-developer tester checklist.

## Phase 3 — One-click connectors

**Goal:** Connect supported AI apps without manual MCP JSON editing.

**Parallel work packages**

1. **Shared connector engine**
   - Detect, preview, connect, disconnect, repair, rollback, and test.
   - Preserve unrelated client settings and sibling MCP servers.
   - Create local backup before writes.

2. **Claude Desktop path**
   - Prefer Claude Desktop Extension / `.mcpb` package when feasible.
   - Keep semantic config-writing fallback.

3. **Client-specific flows**
   - Cursor.
   - Kimi Code.
   - VS Code/Cline.
   - Roo.
   - OpenCode.
   - Generic MCP.

4. **Health and repair UI**
   - Missing client.
   - Malformed config.
   - Missing bundle.
   - Stale connector command.
   - Permission denied.
   - Restart needed.

**Acceptance**

- Detection is read-only.
- Every write requires preview and approval.
- Repeated connect is idempotent.
- Disconnect removes only the Enigma entry.
- Rollback can restore the previous Enigma-managed state.
- Public support logs show client status and redacted labels only.

**Verification**

- Per-client synthetic config tests.
- Real-client manual matrix on Windows/macOS where available.
- Corrupted-config recovery tests.

## Phase 4 — Trust, signing, updates, and release evidence

**Goal:** Make installation trustworthy and supportable for consumers.

**Parallel work packages**

1. **Windows distribution**
   - Choose Microsoft Store/MSIX, trusted signing direct download, or both.
   - Sign installer/package, app binaries, helper binaries, updater, and embedded runtime.
   - Record SmartScreen behavior honestly.

2. **macOS distribution**
   - Developer ID sign app and installer artifacts.
   - Enable hardened runtime with minimal entitlements.
   - Notarize and staple.
   - Verify Gatekeeper on clean account.

3. **Signed updater**
   - Stable/beta/internal channels.
   - Signed update manifest and payload.
   - Downgrade/channel rejection.
   - Rollback-safe install.

4. **Evidence packets**
   - Artifact hashes.
   - Signing/notarization status.
   - Update manifest verification.
   - First-run results.
   - Claim boundary review.
   - Support readiness.

5. **npm CLI release path**
   - Preserve trusted publishing/OIDC path.
   - No long-lived npm publish token.
   - Separate desktop and npm provenance.

**Acceptance**

- Signed Windows/macOS artifacts install without requiring users to bypass normal OS security controls for GA.
- Update failure preserves existing app and vault.
- Evidence packet contains only public-safe metadata.
- Release blockers from `docs/public-launch/trust-signing-release.md` are closed.

**Verification**

- Install/update/uninstall/rollback rehearsals on clean Windows/macOS machines.
- Signing/notarization verification commands recorded in private release evidence.
- `npm run check`, `npm test`, `npm run secret-scan`, `npm pack --dry-run` remain green for package release.

## Phase 5 — QA, diagnostics, support, and observability

**Goal:** Prove public users can recover from expected failures without exposing private data.

**Parallel work packages**

1. **Automated smoke matrix**
   - Fresh install.
   - First run.
   - Client detection/connect.
   - Proof summary.
   - Offline launch.
   - Corrupted config.
   - Diagnostic bundle.

2. **Manual install matrix**
   - Windows current and previous supported release.
   - macOS current and previous supported release.
   - Fresh and upgraded profiles.
   - No clients, one client, multiple clients, existing CLI vault.

3. **Diagnostics bundle**
   - Local-only by default.
   - User preview before sharing.
   - Forbidden-field rejection.
   - Stable support codes.

4. **Crash/error reporting**
   - Explicit opt-in only.
   - One-time report approval.
   - View/export/delete controls.
   - Coarse environment buckets.

5. **Support playbooks**
   - Installer blocked.
   - Vault creation failed.
   - Client not detected.
   - Config corrupted.
   - App cannot reach Enigma helper.
   - Update failed.
   - Proof export rejected as unsafe.

**Acceptance**

- Every `BETA-*` scenario in `docs/public-launch/qa-support-observability.md` passes before public beta.
- Every `BETA-*` and `GA-*` scenario passes before GA.
- Diagnostics and telemetry never include forbidden private fields.

**Verification**

- Automated scenario run.
- Manual QA signoff.
- Redaction tests against diagnostic bundle schema.
- Support dry run with synthetic diagnostic bundles.

## Phase 6 — Consumer docs, website, and in-app help

**Goal:** Make the public path understandable without developer docs.

**Parallel work packages**

1. **Website IA**
   - `/`
   - `/download`
   - `/setup`
   - `/help`
   - `/help/install`
   - `/help/connect-apps`
   - `/help/troubleshooting`
   - `/privacy`
   - `/proofs`
   - `/faq`
   - `/developers/cli`
   - `/developers/source`
   - `/release-notes`

2. **Repository docs**
   - Move npm/Node/terminal instructions below a Developer CLI heading.
   - Keep source checkout as advanced.
   - Add consumer proof/privacy boundaries.

3. **In-app help**
   - Welcome help.
   - Connector help.
   - Health/fix-it help.
   - Proof activity help.
   - Privacy settings help.
   - Support bundle help.

4. **Support FAQ and macros**
   - Do I need Node/npm?
   - Does Enigma delete provider memory?
   - Where is my vault?
   - What can I share with support?
   - Why does an AI app need restart?

**Acceptance**

- Consumer docs lead with signed desktop app.
- README top third has no command block once desktop app exists.
- Developer CLI path remains available but not default.
- Every screenshot/example uses synthetic data and no private paths.

**Verification**

- Readability review.
- Claim-boundary review.
- Link check.
- Screenshot privacy review.

## Phase 7 — Public beta

**Goal:** Ship to a bounded public audience with support and rollback ready.

**Entry criteria**

- Phases 1–6 beta acceptance green.
- Signed desktop beta artifacts produced.
- Support owner and release owner named.
- Public-safe beta evidence packet approved.
- Known limitations documented.

**Exit criteria**

- No open blocker in install, first run, connector writes, update, vault retention, diagnostics, or claim-boundary copy.
- Support has resolved expected issue classes with synthetic/public-safe diagnostic bundles.
- Release rollback has been rehearsed.

## Phase 8 — General availability

**Goal:** Make Enigma Memory generally usable by consumers.

**Entry criteria**

- Public beta exit criteria complete.
- GA install/update/uninstall/rollback matrix green.
- Signing and update channel ownership complete.
- Consumer docs and website are desktop-first.
- Final public-safe evidence packet approved.

**Launch decision**

Ship only if the answer is yes to all of these:

- Can a consumer install and finish setup without terminal/npm/Node/JSON?
- Can they connect at least one supported AI client through one-click UI?
- Can they recover from the expected failures through fix-it actions?
- Can support diagnose issues without private data?
- Can updates roll forward and fail safely?
- Are every public claim and artifact inside the Enigma-controlled boundary?
