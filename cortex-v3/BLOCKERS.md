# Enigma Cortex v3 — Known Blockers

## Environment

- ✅ **Anchor CLI environment resolved** via GitHub Actions Ubuntu runner (`.github/workflows/cortex-v3-anchor.yml`).
  - Solana CLI installed from GitHub release tarball.
  - Anchor CLI installed via npm.
  - Rust pinned to 1.75.0 for Solana 1.18.26 SBF toolchain compatibility.
  - `cargo check --workspace`, `anchor build --no-idl`, and `anchor test --skip-build` pass in CI.
- ✅ **Solana credentials configured** — devnet wallet stored as GitHub secret `SOLANA_DEVNET_WALLET`.
  - Public key: `FasTsgodYjJwiiZ1eAxHmocVCvKcKNiXZYVJUZiZ3rh7`
- ⚠️ **Local Windows Anchor CLI** — documented WSL2 solution in `specs/bottleneck-solutions-architecture.md` § Local Windows Anchor CLI (Ubuntu 24.04, Solana CLI 1.18.26, Rust 1.75.0, Anchor CLI 0.30.1, Node.js 24 via nvm; WSL vs Docker Desktop vs GitHub Codespaces comparison). Still needs a setup script and validation on a Windows 11 Home machine.
- ⚠️ **Mainnet deployment and custody not configured** — devnet only. Concrete architecture is now in `specs/bottleneck-solutions-architecture.md` § Mainnet Deployment and Custody: Squads v4 multisig as program upgrade authority and treasury, Ledger-backed cold keys, a narrowly scoped CI proposer key, Helius mainnet RPC with QuickNode failover, priority-fee policy, and a production-environment `cortex-v3-mainnet.yml` workflow.

## Technical

- `anchor build` uses `--no-idl` to avoid proc-macro2 idl-build incompatibility with Rust 1.75. IDLs are committed under `idl/` and copied to `target/idl/` for tests.
- Programs have USDC/SPL token settlement (`budget_escrow`) and cross-program CPI composition implemented.
- Webapp has Privy embedded wallet scaffold alongside Solana wallet adapters; set `NEXT_PUBLIC_PRIVY_APP_ID` to enable.
- Off-chain node has encrypted SQLite persistence, OpenAI embedding search, and Docker packaging.

## Production vector database + embedding pipeline

- **Status:** Research complete in `specs/bottleneck-solutions-architecture.md` § 5. Production vector database + embedding pipeline.
- **Current:** Off-chain node uses encrypted SQLite + full in-memory cosine scan over all embeddings via OpenAI `text-embedding-3-small`. This is a prototype-only architecture.
- **Selected default:** Qdrant Cloud or self-hosted Qdrant, replacing the brute-force scan with HNSW approximate nearest-neighbor search.
- **Embedding default:** OpenAI `text-embedding-3-small` for the hosted/MVP path; local ONNX fallback using BGE-M3 or Qwen3-Embedding-0.6B for BYOC/sovereignty deployments.
- **Hybrid search:** Combine dense vector retrieval with sparse keyword/BM25 signals fused via Reciprocal Rank Fusion (RRF), plus optional cross-encoder reranker (Cohere/Voyage/bge-reranker-v2-m3) behind a feature flag.
- **Clustering/condensation:** Background worker merges memories by embedding cosine similarity (merge ≥ 0.90, related ≥ 0.75), with decay-aware ranking and LLM-based fact extraction/summarization for long-term compaction.
- **Open decision:** Exact similarity thresholds and reranker model will be validated against a labeled memory benchmark (e.g., LoCoMo subset) before mainnet.

## Verifiable memory

- **Status:** Research complete in `specs/bottleneck-solutions-architecture.md` § 4. Verifiable memory (TEE/STARK).
- **Immediate path:** Deploy the off-chain node inside a TEE (Azure TDX Confidential VM or AWS Nitro Enclaves) and expose a client-verifiable `/attest` endpoint.
- **Proof roadmap:** Prototype RISC Zero or SP1 proof-of-retrieval for a small corpus; wrap to SNARK only if Solana verification cost demands it.
- **Open decision:** Whether to use a managed vector DB with encrypted embeddings or a self-hosted vector index inside the TEE.

## Next owners

| Bottleneck                        | Owner                                     |
| --------------------------------- | ----------------------------------------- |
| Local Windows Anchor CLI          | DevEx / contract engineer                 |
| Mainnet deployment and custody    | Security / release engineer               |
| Verifiable memory                 | DevOps / security + cryptography engineer |
| Production vector DB + embeddings | VectorSearchSolver                        |
| Token legal structure             | Legal / compliance owner                  |
| Security audit                    | Security architect                        |
| Frictionless UX                   | Product / webapp lead                     |

## Legal / Launch

- **Token issuance requires legal review.** Detailed architecture and jurisdiction analysis is now in `specs/bottleneck-solutions-architecture.md` § Token Legal Structure.
  - **SAL / veSAL** (optional governance + revenue share) is highly likely to be treated as a security in the US under Howey and will require a Reg D 506(c) or 506(b) private placement, plus Reg S for non-US purchasers, unless the revenue-share features are removed.
  - **ENIGMA** (network utility / operator bonding / bounded governance) has a plausible non-security path if it is functional at launch, carries no revenue share, and avoids profit/expectation language.
  - **Data-dignity royalties** (`memory_registry.royalty_bps` → `royalty_router.route_royalty`) are user-to-user licensing payments and should not be pooled, securitized, or marketed as investments.
  - **Jurisdiction workstream:** US (SEC/Howey/Reg D/S/A), EU MiCA (white paper), Switzerland FINMA, Singapore MAS, BVI/Cayman foundation structure.
  - **Recommended structure:** BVI token-issuance company + Cayman Islands foundation company (memberless DAO wrapper holding IP/treasury/governance execution).
  - **Immediate actions:** (1) engage US securities counsel for Howey analysis, (2) engage BVI/Cayman counsel for foundation structure, (3) freeze public token language until review is complete, (4) decide within 6 weeks whether to restructure SAL or accept securities treatment.
- Consumer app launch requires security audit and compliance review.
- External security audit has not started, but a concrete plan is now in `specs/bottleneck-solutions-architecture.md` § Security Audit: short-list OtterSec/Neodyme/Sec3, budget $25k–$45k + re-audit contingency, 7–9 week timeline, and CI integration with Sec3 X-Ray/Solanaizer, cargo-audit/clippy/geiger, and Trident fuzzing.
- Mainnet deployment requires Squads multisig setup, funded deployer wallet, and configured `MAINNET_SOLANA_DEPLOY_URL`, `MAINNET_DEPLOYER_KEYPAIR`, `MAINNET_MULTISIG`, and `MAINNET_MULTISIG_VAULT` secrets; see `specs/bottleneck-solutions-architecture.md` and `deploy/MAINNET_SETUP.md`.

## Notes

Use this file to track progress against blockers.
