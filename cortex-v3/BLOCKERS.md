# Enigma Cortex v3 — Known Blockers

## Environment

- ✅ **Anchor CLI environment resolved** via GitHub Actions Ubuntu runner (`.github/workflows/cortex-v3-anchor.yml`).
  - Solana CLI installed from GitHub release tarball.
  - Anchor CLI installed via npm.
  - `cargo check --workspace` passes in CI.
  - `anchor build` is attempted but may fail due to SBF toolchain dependency resolution; tracked in workflow logs.
- ✅ **Solana credentials configured** — devnet wallet stored as GitHub secret `SOLANA_DEVNET_WALLET`.
  - Public key: `FasTsgodYjJwiiZ1eAxHmocVCvKcKNiXZYVJUZiZ3rh7`
- ⚠️ **Local Windows Anchor CLI still unavailable** — use GitHub Actions or WSL for full `anchor build/test`.
- ⚠️ **Mainnet deployment credentials not configured** — devnet only.

## Technical

- Smart contracts are scaffold-plus: `budget_escrow` has SOL transfers, but full USDC/SPL token settlement and cross-program composition need more work.
- Webapp wallet integration uses Solana wallet adapters; real embedded wallets (Privy/Dynamic) require provider setup.
- Off-chain node is in-memory. Production needs persistent encrypted store, TEE or STARK proofs, and vector retrieval.
- Full `anchor build` with Solana 1.18.26 SBF toolchain requires pinning transitive dependencies to pre-`edition2024` versions (Rust 1.75 compatibility).

## Legal / Launch

- Token issuance requires legal review.
- Consumer app launch requires security audit and compliance review.
- External security audit has not started; checklist is in `specs/security-audit-checklist.md`.

## Notes

Use this file to track progress against blockers.
