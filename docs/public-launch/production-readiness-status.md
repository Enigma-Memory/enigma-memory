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
- Six-step wizard: Welcome, Create private vault, Find apps, Connect apps, Health check, Ready.
- Tauri commands wired to bundled Enigma engine sidecar via `ServiceHandle`: spawns engine process, captures stdout/stderr, bounded restart on crash, clean shutdown.
- Diagnostics preview/export with forbidden-field rejection and user approval.
- Update-check card that fetches signed manifest and shows current/available versions without auto-download.
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
- Backup, rollback, repair, and test flows with JSON-preserving config writes.

### Docs and website
- Desktop-first `README.md`.
- Updated `docs/install-anywhere.md`.
- Static `website/` pages: home, download, setup, help hub, install/connect/troubleshooting guides, privacy, proofs, FAQ, and developer CLI appendix.

---

## What is NOT yet built (blockers for GA)

| Item | Why it matters | Owner / path to close |
|---|---|---|
| Signed Windows installer / MSIX | Public launch definition of done requires signed distribution. | Complete Azure Artifact Signing setup. Subscription `Azure subscription 1` is active; Artifact Signing account and Public Trust certificate profile creation are in progress. |
| Signed/macOS notarized app | Gatekeeper will block unsigned apps. | Enroll in Apple Developer Program; see `docs/public-launch/code-signing-setup.md` for fast-track steps and timeline. |

---

## Verification run on this commit

- `npm run check` at repo root: **pass**.
- `npm test` at repo root: **559/559 pass**.
- `cargo +1.75.0 check --workspace` in `cortex-v3/`: **pass**.
- `npm test` in `cortex-v3/node/`: **83/83 pass**.
- `cargo test` in `apps/desktop-tauri/`: **20/20 pass**.
- `anchor test` for treasury: not runnable locally; Docker/CI path available via `cortex-v3/Dockerfile` and GitHub Actions.

---

## Next steps to reach public beta

1. Complete external signing prerequisites (Apple Developer, Microsoft signing identity).
2. Run end-to-end smoke-test matrix on clean Windows/macOS VMs.
3. Start external security audit.
4. Configure mainnet custody and deploy to mainnet.

---

## External blockers requiring user/action outside this repo

- Apple Developer Program membership and certificates.
- Microsoft Store/Partner Center identity or trusted Windows code-signing certificate.
- Selection of Windows distribution path (Store/MSIX, direct signed download, or both).
- External security audit vendor and budget.
- Mainnet wallet custody policy and funding.
