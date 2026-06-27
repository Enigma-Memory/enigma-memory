# Enigma Cortex v3 — Memory Wallet

Consumer-first AI memory wallet on Solana.

## Status

Production-in-progress scaffold. Research specs are committed in `docs/`.

**Verified on 2026-06-26:**

- `cargo +1.75.0 check --workspace` passes locally and in GitHub Actions (warnings only).
- `anchor build --no-idl` and `anchor test --skip-build` pass in GitHub Actions.
- GitHub Actions workflow installs Solana CLI, Anchor CLI, and configures a devnet wallet.
- `npm test` in `node/` passes **22/22** tests.
- `npm run build` and `npm run typecheck` in `webapp/` pass.
- `npm run check` in `enigma/` passes.

## What's here

- `programs/` — 5 Anchor programs with `cargo check` and `anchor build` passing; `budget_escrow` supports native SOL and SPL-token settlement; cross-program CPI composition across programs.
- `node/` — Off-chain memory node (HTTP API, MCP server, AES-256-GCM encrypted SQLite persistence, OpenAI embedding semantic search, Docker packaging).
- `webapp/` — Next.js consumer web app with Solana wallet adapters + Privy embedded wallet scaffold, memory vault, PWA.
- `idl/` — Committed Anchor IDL JSONs used for tests and webapp program clients.
- `specs/` — Architecture, design JSONs, security audit checklist.
- `deploy/` — Devnet deployment script, mainnet setup guide, and devnet wallet utilities.
- `.github/workflows/cortex-v3-anchor.yml` — CI for Anchor/Solana on Ubuntu.

## Quick start

```sh
# Off-chain node
cd node
npm install
npm test
npm start

# Web app
cd webapp
npm install
npm run build

# Smart contracts (use GitHub Actions or WSL/Linux for anchor build/test)
cd ..
cargo +1.75.0 check --workspace
```

## CI / Deployment

The Anchor CLI environment is provided by GitHub Actions:

- Workflow: `.github/workflows/cortex-v3-anchor.yml`
- Solana devnet wallet secret: `SOLANA_DEVNET_WALLET`
- Devnet wallet public key: `FasTsgodYjJwiiZ1eAxHmocVCvKcKNiXZYVJUZiZ3rh7`
- `anchor build` uses `--no-idl` due to proc-macro2 idl-build incompatibility with Rust 1.75; IDLs are committed under `idl/`.

## Blockers

See `BLOCKERS.md`.

## License

TBD
