# Enigma Cortex v3 — Security Audit Checklist

This checklist tracks security-readiness work for the Cortex v3 Solana program suite and supporting infrastructure.

## Completed

| #   | Item                              | Evidence                                                                                                                                                                                      |
| --- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Architecture documentation        | `specs/unified-architecture.md` plus `specs/design-*.json` covering off-chain node, webapp, data model, security, and smart contracts                                                         |
| 2   | `cargo check --workspace` passing | CI step `Cargo Check (Rust compilation)` succeeds; local `cargo check --workspace` verified                                                                                                   |
| 3   | CI pipeline set up                | `.github/workflows/cortex-v3-anchor.yml` runs on `cortex-v3/**` changes, installs Solana CLI 1.18.26, Anchor 0.30.1, and executes `cargo check` / `anchor build` / `anchor test`              |
| 4   | Devnet wallet configured          | GitHub secret `SOLANA_DEVNET_WALLET` is in place; CI writes it to `~/.config/solana/id.json` and sets `solana config set --url devnet`; pubkey `FasTsgodYjJwiiZ1eAxHmocVCvKcKNiXZYVJUZiZ3rh7` |

## Requires an External Auditor / User Action

The items below cannot be closed by code changes alone. They need specialist review, legal counsel, or user-controlled mainnet credentials.

| #   | Item                         | Why it is external                                                                                                         | Typical deliverable                   |
| --- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 5   | **Formal security audit**    | Needs an independent Solana/Anchor auditor to review PDA seeds, privilege escalation, arithmetic, and instruction handlers | Audit report + tracked remediation    |
| 6   | **Mainnet readiness review** | Needs real deployment keys, mainnet RPC/TLS, fee-budget, and ledger/multisig custody decisions that the user must make     | Mainnet runbook + deployment evidence |
| 7   | **Token legal review**       | Needs qualified legal counsel to assess royalty/token mechanics, securities, and jurisdiction                              | Legal opinion / compliance memo       |

## Notes

- `anchor build` is currently `continue-on-error` in CI because of SBF transitive dependency `edition2024` issues.
- `anchor test` is also `continue-on-error` until builds are fully green.
- Do **not** generate or commit mainnet keys; see `deploy/MAINNET_SETUP.md` for wallet creation and GitHub secret configuration.

---

_Security audit checklist — v3 — 2026-06-27_
