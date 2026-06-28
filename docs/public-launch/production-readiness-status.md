# Enigma Memory — Production Readiness Status

**Generated:** 2026-06-26
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
- Health dashboard UI with `memory_drive_status`, `connected_app_count`, `proof_status`, `update_status`, `diagnostics_status`, `offline_ready`, and `issue_codes`.
- Tauri commands wired to bundled Enigma engine sidecar via `ServiceHandle`: spawns engine process, captures stdout/stderr, bounded restart on crash, clean shutdown.
- Diagnostics preview/export with forbidden-field rejection and user approval.
- Update-check card that fetches signed manifest and shows current/available versions without auto-download.

### Release pipeline
- Tauri v2 bundle config for Windows (NSIS) and macOS (app/dmg).
- GitHub Actions `.github/workflows/desktop-build.yml` for cross-platform debug/self-signed builds.
- Ed25519 signed update manifest script (`scripts/sign-update-manifest.mjs`) with verify round-trip.
- Release evidence generator (`scripts/release-evidence-desktop.mjs`) dry-run tested.

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
| Signed Windows installer / MSIX | Public launch definition of done requires signed distribution. | Obtain Microsoft Store/Partner Center identity or trusted code-signing certificate. |
| Signed/macOS notarized app | Gatekeeper will block unsigned apps. | Active Apple Developer Program + Developer ID certs + notarization credential. |
| End-to-end smoke tests on clean Windows/macOS | Proves consumer path works without developer tools. | Run manual QA matrix or CI runners with signed installers. |
| External security audit | Blocks public launch per claim boundary. | Hire auditor, complete checklist in `specs/security-audit-checklist.md`. |
| Mainnet custody and funding | On-chain programs are currently devnet-only. | Configure `SOLANA_MAINNET_WALLET` and multisig custody. |

---

## Verification run on this commit

- `npm run check` at repo root: **pass**.
- `npm test` at repo root: **548/548 pass**.
- `cargo +1.75.0 check --workspace` in `cortex-v3/`: **pass**.
- `npm test` in `cortex-v3/node/`: **83/83 pass**.
- `cargo test` in `apps/desktop-tauri/`: **17/17 pass**.
- `anchor test` for treasury: not runnable locally; relies on GitHub Actions runner with Solana CLI/Anchor CLI installed.

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
