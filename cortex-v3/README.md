# Enigma Cortex v3 — Memory Wallet

Consumer-first AI memory wallet on Solana.

## Status

This is a production-in-progress scaffold. The research specs are committed in `docs/`. This directory contains the implementation.

## What's here

- `programs/` — Anchor smart contract scaffold (needs Rust fixes and audit).
- `node/` — Off-chain memory node (MCP server, ingestion, retrieval, encryption, immunology).
- `webapp/` — Next.js consumer web app.
- `specs/` — Architecture and design artifacts.

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

# Smart contracts (requires Linux/macOS with Anchor)
cd ..
anchor build
anchor test
```

## Blockers

See `BLOCKERS.md`.

## License

TBD
