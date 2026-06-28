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
- Import Sandbox supports local text/Markdown paste, preview counts and duplicate groups, explicit approve, local vault write, and batch receipt; raw text is not printed in the UI result.
- Proof Activity summary shows local receipt counts, Memory Drive roots, verifier status, and claim boundaries without raw memory, prompts, transcripts, provider responses, or paths.
- Diagnostics preview/export with forbidden-field rejection and user approval.
- Support summary surfaces exist through CLI, MCP, and the desktop dashboard; the support dry-run script can ingest only redacted `enigma.support_summary.v1` / `enigma.diagnostics.v1` artifacts as allowlisted hash snapshots.
- Update-check card fetches signed manifest metadata and shows current/available versions without auto-download.
- Opt-in crash reporting: panic hook writes redacted report to disk; user controls whether pending reports are uploaded. No memory, wallet, or path data is included.
- Release evidence generator (`scripts/release-evidence-desktop.mjs`) dry-run tested.
- Signed release workflow: `.github/workflows/desktop-release.yml` with conditional Azure (Windows) and Apple (macOS) signing placeholders.
- Unsigned dry-run workflow: `.github/workflows/desktop-build.yml` mirrors release matrix and passes without signing secrets.
- Tauri updater signing key: generated and stored as `TAURI_SIGNING_PRIVATE_KEY` GitHub secret; public key committed in `tauri.conf.json`.
- Docker build environments: `cortex-v3/Dockerfile` (Anchor/Solana/Rust/Node), `apps/desktop-tauri/Dockerfile` (Tauri Linux), and `docker-compose.build.yml`.
- Clean-machine smoke harness: `scripts/run-clean-machine-smoke.mjs` plus test.

### Connectors
- Cross-platform connector engine with OS-agnostic path resolution.
- Per-client modules: Claude Desktop (`.mcpb` manifest + config fallback), Cursor, Kimi Code, VS Code/Cline, Roo, OpenCode, Generic MCP.
- Claude `.mcpb` manifest helper aligns with MCPB manifest `0.3` fields (`server.type: "node"`, `server.entry_point`, `server.mcp_config`, `user_config`) and remains public-safe.
- Deterministic Claude `.mcpb` package builder (`npm run claude:mcpb:package`) creates a reviewable package with `manifest.json` and local Enigma MCP node runtime source; it performs no install, provider launch, network call, or config write.
- Backup, rollback, repair, disconnect, and local test flows with JSON-preserving config writes.
- Desktop connector cards expose a local "Test connection" action that checks config parse, Enigma entry correctness, bundle reachability, and restart guidance without launching provider apps.

### Docs and website
- Desktop-first `README.md`.
- Updated `docs/install-anywhere.md`.
- Static `website/` pages: home, download, setup, help hub, install/connect/troubleshooting guides, privacy, proofs, FAQ, and developer CLI appendix. Home/download pages now present a consumer setup path, local trust boundary, Import Sandbox, Proof Activity, and unsigned-build caveat without claiming signed public release.

---

## What is NOT yet built (blockers for GA)

| Item | Why it matters | Owner / path to close |
|---|---|---|
| PR #60 review/merge | `main` cannot receive the public-ready branch until review-required branch protection is satisfied. | PR #60 is open with `reviewDecision: REVIEW_REQUIRED`; a reviewer with merge rights must approve and merge. |
| Publish `enigma-memory@0.1.19` | Public beta matrix requires `0.1.19`; package is still `0.1.18`. | Publish only after PR #60 is merged and the release owner approves the package contents. |
| Signed Windows installer / MSIX | Public launch definition of done requires signed distribution. | Upgrade or switch Azure to an Artifact Signing-eligible paid subscription. Portal creation for `Azure subscription 1` was rejected as free/trial/sponsored before account creation, identity validation, or Public Trust profile setup could proceed. |
| Signed/macOS notarized app | Gatekeeper will block unsigned apps. | Enroll in Apple Developer Program; see `docs/public-launch/code-signing-setup.md` for fast-track steps and timeline. |
| Clean-machine Windows/macOS beta evidence | Public beta requires observed install, first run, connector, proof, diagnostics, offline, update-check, and uninstall paths without developer tools. | Run the public beta QA matrix on clean Windows/macOS profiles with signed artifacts once signing is available. |
| Public-safe release packet approval | Public beta requires an approved packet with release/support/signing owners and evidence refs. | Generate/review the release packet after signing and clean-machine evidence exist. |

---

## Verification run on this commit

- `npm run check` at repo root: **pass**.
- `npm run secret-scan` at repo root: **pass**.
- `npm test` at repo root: **609/609 pass**.
- `npm pack --dry-run` at repo root: **pass** (`enigma-memory-0.1.18.tgz` dry-run output).
- `npm run public-beta-qa` at repo root: **hold**, `21 blocked / 0 missing`, required public beta version `0.1.19`.
- `cargo test` in `apps/desktop-tauri/`: **22/22 pass**.
- PR #60 latest checks after commit `dbb78e8`: Anchor Build and Test **pass**, Package gates Ubuntu **pass**, Package gates Windows **pass**.

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
