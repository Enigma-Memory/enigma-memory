# Enigma Cortex v3 — Memory Wallet

Consumer-first AI memory wallet on Solana.

## Status

Production-in-progress scaffold with frictionless-first UX implemented.

**Verified on 2026-06-27:**

- `cargo +1.75.0 check --workspace` passes locally and in GitHub Actions.
- `anchor build --no-idl` and `anchor test --skip-build` pass in GitHub Actions.
- `npm test` in `node/` passes **68/68** tests.
- `npm run build` and `npm run typecheck` in `webapp/` pass.
- `npm run check` in `enigma/` passes.

## What's here

- `programs/` — 6 Anchor programs:
  - `memory_registry`, `budget_escrow`, `capability_registry`, `royalty_router`, `cortex_treasury`
  - `cortex_token` — SAL governance/utility token with staking, veSAL, voting
  - Session PDA support for invisible delegated signing
  - Native SOL and SPL Token/Token-2022 settlement
- `node/` — Off-chain memory node:
  - HTTP API, MCP stdio + HTTP/SSE server
  - OAuth 2.1 + PKCE authorization server
  - AES-256-GCM encrypted SQLite persistence
  - OpenAI embedding semantic search
  - Auto-save policy engine
  - Merkle-based verifiable memory prototype
- `webapp/` — Next.js consumer PWA:
  - Privy embedded wallet (passkey/social)
  - One-tap model connection UI (ChatGPT/Claude/Gemini)
  - Session authorization screen
  - Memory vault dashboard
- `idl/` — Committed Anchor IDL JSONs.
- `specs/` — Architecture, frictionless-first design, bottleneck solutions.
- `deploy/` — Devnet deployment script, mainnet setup guide.
- `.devcontainer/` + `scripts/windows-setup.ps1` — Windows/WSL2/Codespaces dev tools.

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

## Frictionless user flow

1. Open the PWA.
2. Log in with Face ID / passkey / Google / Apple — a Solana wallet is created automatically.
3. Tap "Connect ChatGPT", "Connect Claude", or "Connect Gemini".
4. Authorize auto-save once on the `/session` screen.
5. Talk normally across models. Memories save and recall automatically.

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
