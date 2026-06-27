# Enigma Cortex v3 — Known Blockers

## Environment

- ✅ **Anchor CLI environment resolved** via GitHub Actions Ubuntu runner (`.github/workflows/cortex-v3-anchor.yml`).
  - Solana CLI installed from GitHub release tarball.
  - Anchor CLI installed via npm.
  - Rust pinned to 1.75.0 for Solana 1.18.26 SBF toolchain compatibility.
  - `cargo check --workspace`, `anchor build --no-idl`, and `anchor test --skip-build` pass in CI.
- ✅ **Solana credentials configured** — devnet wallet stored as GitHub secret `SOLANA_DEVNET_WALLET`.
  - Public key: `FasTsgodYjJwiiZ1eAxHmocVCvKcKNiXZYVJUZiZ3rh7`
- ⚠️ **Local Windows Anchor CLI still unavailable** — use GitHub Actions or WSL for full `anchor build/test`.
- ⚠️ **Mainnet deployment credentials not configured** — devnet only.

## Technical

- `anchor build` uses `--no-idl` to avoid proc-macro2 idl-build incompatibility with Rust 1.75. IDLs are committed under `idl/` and copied to `target/idl/` for tests.
- Programs have USDC/SPL token settlement (`budget_escrow`) and cross-program CPI composition implemented.
- Webapp has Privy embedded wallet scaffold alongside Solana wallet adapters; set `NEXT_PUBLIC_PRIVY_APP_ID` to enable.
- Off-chain node has encrypted SQLite persistence, OpenAI embedding search, and Docker packaging.
- Production-grade TEE/STARK proofs, live vector DB, and audited program deployment are future work.

## Legal / Launch

- Token issuance requires legal review.
- Consumer app launch requires security audit and compliance review.
- External security audit has not started; checklist is in `specs/security-audit-checklist.md`.
- Mainnet deployment requires user-configured `SOLANA_MAINNET_WALLET` secret; see `deploy/MAINNET_SETUP.md`.

## Notes

Use this file to track progress against blockers.
