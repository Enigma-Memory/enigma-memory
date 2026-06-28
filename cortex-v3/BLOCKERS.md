# Enigma Cortex v3 — Known Blockers

## Environment

- ✅ **Anchor CLI environment resolved** via GitHub Actions Ubuntu runner (`.github/workflows/cortex-v3-anchor.yml`).
  - Solana CLI installed from GitHub release tarball.
  - Anchor CLI installed via npm.
  - Rust pinned to 1.75.0 for Solana 1.18.26 SBF toolchain compatibility.
  - `cargo check --workspace`, `anchor build --no-idl`, and `anchor test --skip-build` pass in CI (all 28 Anchor tests green on Run #175).
- ✅ **Solana credentials configured** — devnet wallet stored as GitHub secret `SOLANA_DEVNET_WALLET`.
  - Public key: `FasTsgodYjJwiiZ1eAxHmocVCvKcKNiXZYVJUZiZ3rh7`
- ✅ **Local Windows development path documented** — WSL2 setup script and GitHub Codespaces devcontainer available.
- ⚠️ **Mainnet deployment credentials not configured** — devnet only; custody policy documented in `specs/bottleneck-solutions-architecture.md`.

## Technical

- ✅ **Session PDA + invisible session keys** implemented in `capability_registry`; session variants in `memory_registry`, `budget_escrow`, `royalty_router`.
- ✅ **USDC/SPL token settlement** finalized in `budget_escrow` with Token/Token-2022 support.
- ✅ **SAL/ENIGMA token program** created with mint, transfer, staking, veSAL lockup, and voting scaffolding.
- ✅ **OAuth 2.1 + PKCE server** and MCP HTTP/SSE transport with Bearer auth.
- ✅ **Auto-save policy engine** with category-based rules and immunology filtering.
- ✅ **Verifiable memory prototype** with Merkle proofs and search-commitment guest stub.
- ✅ **Privy embedded wallet + model connection UI** in webapp; session authorization and dashboard screens built.
- ✅ **MCP server verifies on-chain `Capability`/`Session` PDAs** before memory/budget tool calls.
- ✅ **`cortex_treasury` custodies real SPL tokens** via CPI `transfer_checked` deposits/withdrawals.
- ✅ **Vector search is pluggable** — SQLite fallback, pgvector/Qdrant HNSW backends.
- ✅ **Signed desktop app scaffold** created in `apps/desktop-tauri/` with Tauri v2, consumer onboarding wizard, and health dashboard UI.
- ✅ **One-click connector engine** implemented for Claude Desktop (`.mcpb` + fallback), Cursor, Kimi Code, VS Code/Cline, Roo, OpenCode, and Generic MCP with backup/rollback/repair.
- ✅ **Consumer docs and website** created: desktop-first README, `docs/install-anywhere.md` rewrite, and `website/` static pages.
- ✅ **Bundled Enigma engine/sidecar bridge** implemented in Tauri commands: ServiceHandle spawns node engine, captures logs, bounded restart on crash, clean shutdown.
- ✅ **In-app help panel + public help articles** created under `website/help/` and `apps/desktop-tauri/ui/help.js`.
- ✅ **QA smoke scenarios + support playbooks** added in `docs/public-launch/`.
- ✅ **Release/build pipeline** added: Tauri bundle config, GitHub Actions `desktop-build.yml`, Ed25519 update-manifest signer, release evidence generator.
- ✅ **Opt-in crash reporting** implemented: redacted panic reports written locally; upload only after explicit opt-in. No memory, wallet, or path data included.
- 🔄 **Signed installers and code signing** — Azure Artifact Signing and Apple Developer setup in progress; scaffolding at `docs/public-launch/code-signing-setup.md` and `.github/workflows/desktop-release.yml`.
## Notes

Use this file to track progress against blockers.
