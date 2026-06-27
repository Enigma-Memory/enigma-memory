# Enigma Cortex v3 — Current Goal

## Mission

Build a complete, production-grade consumer Memory Wallet on Solana that is frictionless for users signing in with their existing AI subscriptions (ChatGPT, Claude, Gemini) and automatically saving/recalling memories across models without per-item approvals.

## Definition of Done

1. User can install/open the PWA and create a Solana wallet with one tap (Privy passkey/social).
2. User can connect ChatGPT, Claude, and Gemini through OAuth-style one-tap flows.
3. User authorizes auto-save once via a Session PDA; no per-memory or per-transaction prompts afterwards.
4. Memories save automatically and recall automatically across connected models.
5. User only intervenes for exceptions: over budget, blocked content, revoke access.
6. Developers can build and test on Windows 11 Home via WSL2/Codespaces with a documented setup script.
7. Off-chain memory operations are verifiable through TEE/STARK proof architecture (minimum: design + local prototype).
8. Smart contracts support USDC/SPL token settlement and a launch-ready SAL/ENIGMA governance/utility token (technical contracts; legal launch deferred to counsel).
9. `cargo check --workspace`, `anchor test`, `npm test` in `node/`, and `npm run build`/`typecheck` in `webapp/` all pass.

## Deferred to External/User Action

- External security audit
- Mainnet deployment and institutional custody
- Token legal opinion and public sale/launch

## Owner

Enigma-Memory

## Updated

2026-06-27
