# Enigma Memory — Production Readiness Status

**Generated:** 2026-06-27  
**Branch:** `memory-boundary-transaction-system`  
**Goal:** Signed desktop app for general consumers (Windows/macOS), one-button setup, one-click AI app connectors, health/fix-it UI, privacy-safe diagnostics.

---

## What is now built

### Core protocol and node
- `cortex_treasury` custodies real SPL/Token-2022 tokens via CPI `transfer_checked`.
- MCP server verifies on-chain `Capability` and `Session` PDAs before memory/budget operations; fails closed on revoked/expired/scope-mismatched sessions.
- Semantic search supports pluggable backends: SQLite (local-first fallback), pgvector HNSW, and Qdrant HNSW.

### Desktop app
- `apps/desktop-tauri/` Tauri v2 scaffold with consumer onboarding wizard.
- Six-step wizard: Welcome, Create private vault, Find apps, Connect apps, Health check, Ready.
- Health dashboard UI with `memory_drive_status`, `connected_app_count`, `proof_status`, `update_status`, `diagnostics_status`, `offline_ready`, and `issue_codes`.

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
| Bundled Enigma engine sidecar | Tauri commands are UI-only stubs; the desktop app cannot yet spawn and control the Enigma runtime. | Finish `apps/desktop-tauri/src/commands/service.rs` and bundle the CLI as a sidecar. |
| Signed Windows installer / MSIX | Public launch definition of done requires signed distribution. | Obtain Microsoft Store/Partner Center identity or trusted code-signing certificate. |
| Signed/macOS notarized app | Gatekeeper will block unsigned apps. | Active Apple Developer Program + Developer ID certs + notarization credential. |
| Signed updater with channels | Auto-update must verify signed manifests and preserve vault data. | Implement Tauri updater config + update signing key custody. |
| Real local vault lifecycle from desktop | Wizard UI exists but backend integration to create/migrate vault is stubbed. | Wire `create_vault` Tauri command to existing CLI vault creation. |
| Health diagnostics bundle | Privacy-safe support bundle preview/redaction is not yet implemented. | Build diagnostics module in desktop app using existing redaction utilities. |
| Opt-in crash reporting | Required by public launch QA plan. | Add crash reporter with explicit opt-in and coarse environment buckets. |
| End-to-end smoke tests on clean Windows/macOS | Proves consumer path works without developer tools. | Run manual QA matrix or CI runners with signed installers. |
| External security audit | Blocks public launch per claim boundary. | Hire auditor, complete checklist in `specs/security-audit-checklist.md`. |
| Mainnet custody and funding | On-chain programs are currently devnet-only. | Configure `SOLANA_MAINNET_WALLET` and multisig custody. |

---

## Verification run on this commit

- `npm run check` at repo root: **pass**.
- `npm test` at repo root: **548/548 pass**.
- `cargo +1.75.0 check --workspace` in `cortex-v3/`: **pass**.
- `npm test` in `cortex-v3/node/`: **77/77 pass**.
- `cargo test` in `apps/desktop-tauri/`: **10/10 pass**.
- `anchor test` for treasury: not runnable locally; relies on GitHub Actions runner with Solana CLI/Anchor CLI installed.

---

## Next steps to reach public beta

1. Wire Tauri commands to the bundled Enigma runtime sidecar.
2. Implement real vault create/migrate and health diagnostics bundle.
3. Build signed installer pipeline scaffolding (Tauri build config + signing placeholders).
4. Complete external signing prerequisites (Apple Developer, Microsoft signing identity).
5. Run smoke-test matrix on clean Windows/macOS VMs.
6. Start external security audit.

---

## External blockers requiring user/action outside this repo

- Apple Developer Program membership and certificates.
- Microsoft Store/Partner Center identity or trusted Windows code-signing certificate.
- Selection of Windows distribution path (Store/MSIX, direct signed download, or both).
- External security audit vendor and budget.
- Mainnet wallet custody policy and funding.
