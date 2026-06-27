# Enigma Cortex v3 — Memory Wallet

Consumer-first AI memory wallet on Solana.

## Status

Production-in-progress scaffold. Research specs are committed in `docs/`.

**Verified on 2026-06-26:**

- `cargo check --workspace` passes locally and in GitHub Actions (warnings only).
- GitHub Actions workflow installs Solana CLI, Anchor CLI, and configures a devnet wallet.
- `npm test` in `node/` passes **13/13** tests.
- `npm run build` and `npm run typecheck` in `webapp/` pass.
- `npm run check` in `enigma/` passes.

## What's here

- `programs/` — 5 Anchor programs with `cargo check` passing; `budget_escrow` now transfers SOL.
- `node/` — Off-chain memory node (HTTP API, MCP server, AES-256-GCM, immunology, search).
- `webapp/` — Next.js consumer web app with Solana wallet adapters, memory vault, PWA.
- `specs/` — Architecture, design JSONs, security audit checklist.
- `deploy/` — Deployment script scaffold and devnet wallet utilities.
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

# Smart contracts (cargo check works; full anchor build/test runs in GitHub Actions)
cd ..
cargo check --workspace
```

## CI / Deployment

The Anchor CLI environment is provided by GitHub Actions:

- Workflow: `.github/workflows/cortex-v3-anchor.yml`
- Solana devnet wallet secret: `SOLANA_DEVNET_WALLET`
- Devnet wallet public key: `FasTsgodYjJwiiZ1eAxHmocVCvKcKNiXZYVJUZiZ3rh7`

## Blockers

See `BLOCKERS.md`.

## License

TBD
