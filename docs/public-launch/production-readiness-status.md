# Enigma Memory — Production Readiness Status

**Generated:** 2026-06-28
**Branch:** `memory-boundary-transaction-system`  
**Goal:** Signed desktop app for general consumers (Windows/macOS), one-button setup, one-click AI app connectors, health/fix-it UI, privacy-safe diagnostics.

---

## What is now built

### Core protocol and node
- `cortex_treasury` custodies real SPL/Token-2022 tokens via CPI `transfer_checked`.
- MCP server verifies on-chain `Capability` and `Session` PDAs before memory/budget operations; fails closed on revoked/expired/scope-mismatched sessions.
- Semantic search supports pluggable backends: SQLite (local-first fallback), pgvector HNSW, and Qdrant HNSW.
- User-controlled encryption layer: per-user DEK derived via HKDF-SHA256; operator cannot decrypt by default.

### Desktop app
- `apps/desktop-tauri/` Tauri v2 scaffold with consumer onboarding wizard.
- Six-step wizard: Welcome, Create private vault, Find apps, Connect apps, Health check, Ready; the wizard now resumes from public-safe local UI state after close/reopen without storing import text, raw memory, local paths, logs, or config bodies.
- Tauri commands wired to bundled Enigma engine sidecar via `ServiceHandle`: spawns engine process, captures stdout/stderr, bounded restart on crash, clean shutdown.
- Health dashboard normalizes CLI health into consumer states, avoids duplicate vault creation, and requires service-running plus healthy Memory Drive before showing offline-ready.
- Memory Controller dashboard cards show consent/review/private-bubble states without approving recall on review alone.
- Import Sandbox supports local text/Markdown paste, preview counts and duplicate groups, explicit approve, local vault write, batch receipt, and latest-import rollback; raw text and raw report paths are not printed in the UI result.
- Proof Activity summary shows local receipt counts, Memory Drive roots, verifier status, claim boundaries, and explicit public-safe export without raw memory, prompts, transcripts, provider responses, or paths.
- Diagnostics preview/export with forbidden-field rejection and user approval.
- Support summary surfaces exist through CLI, MCP, and the desktop dashboard with explicit public-safe export; the support dry-run script can ingest only redacted `enigma.support_summary.v1` / `enigma.diagnostics.v1` artifacts as allowlisted hash snapshots.
- Update-check card fetches signed manifest metadata and shows current/available versions without auto-download.
- Opt-in crash reporting: panic hook writes redacted report to disk; user controls whether pending reports are uploaded. No memory, wallet, or path data is included.
- Release evidence generator (`scripts/release-evidence-desktop.mjs`) dry-run tested.
- Desktop Tauri metadata and mock update UI are aligned to public beta package version `0.1.19`.
- Signed release workflow: `.github/workflows/desktop-release.yml` with conditional Azure (Windows) and Apple (macOS) signing placeholders.
- Unsigned dry-run workflow: `.github/workflows/desktop-build.yml` mirrors release matrix and passes without signing secrets.
- Tauri updater signing key: generated and stored as `TAURI_SIGNING_PRIVATE_KEY` GitHub secret; public key committed in `tauri.conf.json`.
- Docker build environments: `cortex-v3/Dockerfile` (Anchor/Solana/Rust/Node), `apps/desktop-tauri/Dockerfile` (Tauri Linux), and `docker-compose.build.yml`.
- Clean-machine smoke harness: `scripts/run-clean-machine-smoke.mjs` plus test.

### Connectors
- Cross-platform connector engine with OS-agnostic path resolution.
- Per-client modules: Claude Desktop (`.mcpb` manifest + config fallback), Cursor, Kimi Code, VS Code/Cline, Roo, OpenCode, Generic MCP.
- Claude `.mcpb` manifest helper aligns with MCPB manifest `0.3` fields (`server.type: "node"`, `server.entry_point`, `server.mcp_config`, `user_config`) and remains public-safe.
- Desktop Claude cards now expose a Claude `.mcpb` extension handoff as the preferred non-writing path before falling back to manual config writes.
- Deterministic Claude `.mcpb` package builder is available as both `enigma claude-mcpb package` and `npm run claude:mcpb:package`; it creates a reviewable package with `manifest.json` and local Enigma MCP node runtime source, performs no install, provider launch, network call, or config write, and redacts the output path in reports.
- Claude `.mcpb` packages include a minimal root `package.json` with `type: "module"` for Node ESM scope; they do not copy repo scripts, dependency lists, local paths, secrets, provider responses, or memory content.
- Backup, rollback, repair, disconnect, and local test flows with JSON-preserving config writes; `enigma connect --plain` and `enigma disconnect --plain` give path-redacted human-readable config summaries.
- Desktop connector cards expose a local "Test connection" action that checks config parse, Enigma entry correctness, bundle reachability, and restart guidance without launching provider apps.
- Desktop connector cards now require a path-redacted preview and explicit "Approve connection" click before writing MCP client config changes.
- Desktop disconnect now uses the same preview-then-approve pattern as connect: users review a path-redacted plan before Enigma removes its own connector entry.

- Desktop dashboard entry now hydrates current health, service, logs, diagnostics, update, proof, client, and crash state before presenting the Memory Drive dashboard.
- Desktop support-summary and proof-activity exports now fail closed behind a shared public-export privacy scan; the UI shows scan status and disables export until the scan passes.
- Desktop support summary now offers one-click support-code copy after collection, with a visible fallback if clipboard access is unavailable.
- Desktop proof activity now offers one-click copy for local proof counts and roots, bounded to no raw memory, local paths, outside-provider control, or model-behavior claims.

### Docs and website
- Desktop-first `README.md`.
- Updated `docs/install-anywhere.md`.
- Static `website/` pages: home, download, setup, help hub, install/connect/troubleshooting/safe-removal guides, privacy, proofs, FAQ, launch status, and developer CLI appendix. Home/download/install/setup pages now gate the consumer path on signed-build readiness, present the local trust boundary, show a four-screen no-terminal first-run visual map, Import Sandbox, Proof Activity, safe removal/uninstall boundaries, and unsigned-build caveat without linking consumers to internal release-ops docs or claiming signed public release.
- CLI-first fallback is still supported for power users: `enigma init --plain`, `enigma test-drive --plain`, `enigma demo cross-model --plain`, `enigma install --plain`, `enigma quickstart --plain`, `enigma setup --plain`, `enigma claude-mcpb package --plain`, `enigma native-host manifest --plain`, `enigma native-host install-plan --plain`, `enigma capsule export --plain`, `enigma capsule import --plain`, `enigma meter event --plain`, `enigma meter aggregate --plain`, `enigma settlement job --plain`, `enigma settlement capacity --plain`, `enigma settlement quote --plain`, `enigma settlement receipt --plain`, `enigma settlement verify --plain`, `enigma settlement batch --plain`, `enigma chain anchor --plain`, `enigma chain grant --plain`, `enigma chain revoke --plain`, `enigma chain attest --plain`, `enigma chain verify --plain`, `enigma chain register --plain`, `enigma chain registry --plain`, `enigma chain submit-solana --plain`, `enigma controller grant --plain`, `enigma controller revoke --plain`, `enigma controller weather --plain`, `enigma controller bubble --plain`, `enigma remember --plain`, `enigma update --plain`, `enigma delete --plain`, `enigma search --plain`, `enigma context --plain`, `enigma export --plain`, `enigma verify --plain`, `enigma connect --plain`, `enigma disconnect --plain`, `enigma import --plain`, `enigma import rollback --plain`, `enigma status --plain`, `enigma drive health --plain`, `enigma support summary --plain`, `enigma doctor --plain`, and `enigma next --plain` give one-screen, path-redacted summaries instead of JSON or raw-memory output.
- `enigma recall --plain` now records a local read receipt and prints a path-redacted recall summary; plaintext stays redacted unless JSON callers explicitly pass `--include-content`.
- First-run collisions now keep `--plain` output human-readable and path-redacted; setup, quickstart, and test-drive print a safe overwrite/different-output recovery action instead of falling back to JSON.
- First-run `status`, `next`, and `doctor` guidance now defaults to non-destructive quickstart/remember/connect dry-run commands; export is recommended before verify so consumers do not see stale verification guidance.
- `enigma doctor --plain` now explains first-run bundle-missing and connector-bundle mismatch causes directly before the next safe quickstart/connect dry-run action.
- Release owners can run `npm run public-beta:review` for a single local command that writes `.enigma/public-beta/evidence-manifest.json`, writes `.enigma/public-beta/qa-matrix.json`, and prints the bounded Advisor summary while treating missing evidence files as blockers instead of script errors.
- Release owners can generate the one-file QA evidence input manifest with `npm run public-beta:evidence-manifest -- --out .enigma/public-beta/evidence-manifest.json --plain`, then run `npm run public-beta:advisor -- --evidence-manifest .enigma/public-beta/evidence-manifest.json` for the one-screen Advisor hold/ship summary.
- Release owners can also run `node scripts/run-public-beta-qa-matrix.mjs --plain` directly, `node scripts/run-clean-machine-smoke.mjs --plain --out <smoke.json>` for readable clean-machine QA stdout, `node scripts/build-support-dry-run-summary.mjs ... --plain --out <summary.json>` for readable support dry-run evidence, `node scripts/release-evidence-desktop.mjs --plain` for readable desktop release evidence, `npm run cloudflare:pages:packet -- --plain ...` for readable Cloudflare Pages release-packet output, `npm run cloudflare:token-policy -- --plain ...` for readable least-privilege Cloudflare token policy output, `npm run cloudflare:token-request -- --plain ...` for readable Cloudflare token request-body output, `npm run production:manifest -- --plain ...` for readable infrastructure readiness manifest output, `npm run production:storage -- --plain ...` for readable storage migration output, `npm run production:backend-env -- --plain ...` for readable backend env-template output, `npm run production:evidence-starter -- --plain ...` for readable operator evidence starter output, `npm run production:handoff -- --plain ...` for readable operator handoff output, `npm run production:goal-audit -- --plain ...` for readable objective/blocker audit output, `npm run production:dependencies -- --plain ...` for readable dependency blocker output, `npm run production:workplan -- --plain ...` for readable ordered launch planning, `npm run production:unblocker -- --plain` for readable go-live blocker guidance, `npm run production:status -- --plain ...` for readable launch-status board output, `npm run production:orchestration -- --plain ...` for readable Workflowz-style lane orchestration, `npm run registry:verify -- --plain --skip-network` for readable registry install planning, and `node scripts/build-installer-assets.mjs --plain` for readable source-installer asset planning while preserving JSON artifacts.
- Website developer CLI appendix now mirrors the non-destructive first-run flow: quickstart, doctor, drive health, dry-run connector preview, then one intentional connect.
- Browser extension packaging now supports `node scripts/package-browser-extension.mjs --plain` so release owners can review deterministic ZIP readiness, checksums, and safety boundaries without exposing local paths or claiming browser-store submission.

- Public beta QA can now ingest all review evidence from a single `--evidence-manifest <manifest.json>` file, or individual public-safe artifacts with `--clean-machine-smoke <smoke.json>`, repeated `--support-dry-run <summary.json>` flags, `--registry-install <registry.json>`, `--desktop-release-evidence <desktop.json>`, and `--production-handoff-packet <handoff.json>`; PR approval/reviewer gates still remain until their own evidence exists.

---

## What is NOT yet built (blockers for GA)

| Item | Why it matters | Owner / path to close |
|---|---|---|
| PR #60 review/merge | `main` cannot receive the public-ready branch until review-required branch protection is satisfied. | PR #60 is open with `reviewDecision: REVIEW_REQUIRED`; a reviewer with merge rights must approve and merge. |
| Publish `enigma-memory@0.1.19` | Public beta matrix requires `0.1.19`; source package is prepared at `0.1.19`, but registry publication evidence is still absent. | Publish only after PR #60 is merged and the release owner approves the package contents. |
| Signed Windows installer / MSIX | Public launch definition of done requires signed distribution. | Upgrade or switch Azure to an Artifact Signing-eligible paid subscription. Portal creation for `Azure subscription 1` was rejected as free/trial/sponsored before account creation, identity validation, or Public Trust profile setup could proceed. |
| Signed/macOS notarized app | Gatekeeper will block unsigned apps. | Enroll in Apple Developer Program; see `docs/public-launch/code-signing-setup.md` for fast-track steps and timeline. |
| Clean-machine Windows/macOS beta evidence | Public beta requires observed install, first run, connector, proof, diagnostics, offline, update-check, and uninstall paths without developer tools. | Run the public beta QA matrix on clean Windows/macOS profiles with signed artifacts once signing is available. |
| Public-safe release packet approval | Public beta requires an approved packet with release/support/signing owners and evidence refs. | Generate/review the release packet after signing and clean-machine evidence exist. |

---

## Verification run for latest local public-readiness slice

- `node --check apps/cli/bin/enigma.mjs` at repo root: **pass**.
- `node --test test/enigma-context-proof-cli.test.mjs` at repo root: **6/6 pass**.
- `node --test test/enigma-claude-mcpb-contract.test.mjs` at repo root: **6/6 pass**.
- `node --test test/enigma-production.test.mjs` at repo root: **38/38 pass**.
- `node --test test/enigma-metering.test.mjs` at repo root: **6/6 pass**.
- `node --test test/enigma-settlement.test.mjs` at repo root: **7/7 pass**.
- `node --test test/enigma-chain-cli.test.mjs` at repo root: **8/8 pass**.
- `node --test test/enigma-public-beta-qa-matrix.test.mjs` at repo root: **17/17 pass**.
- `node --test test/enigma-public-beta-evidence-manifest.test.mjs` at repo root: **3/3 pass**.
- `node --test test/enigma-public-beta-review.test.mjs` at repo root: **4/4 pass**.
- `node --test test/enigma-clean-machine-smoke.test.mjs` at repo root: **5/5 pass**.
- `node --test test/enigma-support-dry-run.test.mjs` at repo root: **9/9 pass**.
- `node --test test/enigma-release-evidence-desktop.test.mjs` at repo root: **13/13 pass**.
- `node --test test/enigma-production-unblocker.test.mjs` at repo root: **7/7 pass**.
- `node --test test/enigma-registry-install.test.mjs` at repo root: **6/6 pass**.
- `node --test test/enigma-production-status-board.test.mjs` at repo root: **10/10 pass**.
- `node --test test/enigma-ai-orchestration-plan.test.mjs` at repo root: **5/5 pass**.
- `node --test test/enigma-production-dependencies.test.mjs` at repo root: **15/15 pass**.
- `node --test test/enigma-production-workplan.test.mjs` at repo root: **6/6 pass**.
- `node --test test/enigma-goal-completion-audit.test.mjs` at repo root: **14/14 pass**.
- `node --test test/enigma-production-handoff.test.mjs` at repo root: **13/13 pass**.
- `node --test test/enigma-installer-assets.test.mjs` at repo root: **6/6 pass**.
- `node --test test/enigma-operator-acceptance.test.mjs` at repo root: **13/13 pass**.
- `node --test test/enigma-production-backend-env-kit.test.mjs` at repo root: **5/5 pass**.
- `node --test test/enigma-cloudflare-token-policy.test.mjs` at repo root: **5/5 pass**.
- `node --test test/enigma-cloudflare-token-request.test.mjs` at repo root: **6/6 pass**.
- `node --test test/enigma-cloudflare-pages-packet.test.mjs` at repo root: **6/6 pass**.
- `node --test test/enigma-production-manifest-builder.test.mjs` at repo root: **7/7 pass**.
- `node --test test/enigma-storage.test.mjs` at repo root: **8/8 pass**.
- `node --test test/enigma-release-smoke.test.mjs` at repo root: **11/11 pass**.
- `node --test test/enigma-cross-model-demo.test.mjs` at repo root: **5/5 pass**.
- `node --test test/enigma-onboarding.test.mjs` at repo root: **23/23 pass**.
- `node --test test/enigma-test-drive.test.mjs` at repo root: **4/4 pass**.
- `node --test test/enigma-search-status.test.mjs` at repo root: **10/10 pass**.
- `node --test test/enigma-desktop-public-launch.test.mjs` at repo root: **8/8 pass**.
- `npm run public-beta:advisor` at repo root: **pass**; Advisor decision remains **HOLD** with evidence-manifest collection guidance.
- `npm run public-beta:review` at repo root: **pass**; writes public-safe evidence manifest and QA matrix artifacts while Advisor decision remains **HOLD**.
- `npm run production:site -- --site website` at repo root: **pass**.
- `npm run check` at repo root: **pass**.
- `npm run secret-scan` at repo root: **pass**.
- `npm test` at repo root: **673/673 pass**.
- `npm pack --dry-run` at repo root: **pass** (`enigma-memory-0.1.19.tgz` dry-run output).
- `npm run public-beta-qa` at repo root: **hold**, `20 blocked / 1 pending / 0 missing`, required public beta version `0.1.19`.
- Hosted PR checks must still pass after each pushed branch commit; local gates do not replace PR approval/merge or signing evidence.

---

## Next steps to reach public beta

1. Get PR #60 reviewed and merged into `main`.
2. Publish `enigma-memory@0.1.19` from the merged release commit.
3. Complete external signing prerequisites (Apple Developer, Microsoft signing identity).
4. Run end-to-end smoke-test matrix on clean Windows/macOS VMs with the signed artifacts.
5. Generate and approve the public-safe release packet.
6. Start external security audit.
7. Configure any mainnet custody/deployment only after release-owner approval; local desktop beta does not require hosted SaaS claims.

---

## External blockers requiring user/action outside this repo

- Apple Developer Program membership and certificates.
- Microsoft Store/Partner Center identity or trusted Windows code-signing certificate.
- Selection of Windows distribution path (Store/MSIX, direct signed download, or both).
- External security audit vendor and budget.
- Mainnet wallet custody policy and funding.
