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
- ⚠️ **Production TEE hardware attestation** not yet integrated; cryptographic baseline exists.
- ⚠️ **On-chain ZK verifier** not yet deployed; guest stub produces commitments only.

## Legal / Launch

- ⚠️ **Token issuance requires legal review** — technical contracts ready; public launch deferred to counsel opinion.
- ⚠️ **Consumer app launch requires security audit and compliance review** — user deferred to a later date.
- ⚠️ **External security audit has not started** — checklist is in `specs/security-audit-checklist.md`.
- ⚠️ **Mainnet deployment** requires user-configured custody and `SOLANA_MAINNET_WALLET`; see `deploy/MAINNET_SETUP.md` and `specs/bottleneck-solutions-architecture.md`.

## Notes

Use this file to track progress against blockers.
