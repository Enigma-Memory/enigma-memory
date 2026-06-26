# Enigma Cortex v3 — Known Blockers

## Environment

- Anchor CLI cannot run on Windows host; smart contract work needs WSL/Linux/macOS.
- No Solana wallet/credentials configured; deployment not possible.

## Technical

- Generated Rust in `programs/` compiles only with hand-fixes (length of declare_id, features, seeds, bumps, CPI imports).
- Smart contracts need security audit before any mainnet or token use.

## Legal / Launch

- Token issuance requires legal review.
- Consumer app launch requires compliance and audit.

## Notes

Use this file to track progress against blockers.
