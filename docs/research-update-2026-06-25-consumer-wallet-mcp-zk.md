# Research Update: Consumer Wallet, MCP Security, ZK Retrieval

**Date:** 2026-06-25

## 1. Consumer embedded wallets are mature in 2026

- **Privy**: Embedded Solana wallets via email/social login, MPC key management, delegated permissions.
- **Coinbase AgentKit**: TEE-based non-custodial wallets with programmable spending limits.
- **MetaMask Embedded Wallets**: Email/social/SMS login, smart accounts, gas sponsorship.
- **MoonPay Open Wallet Standard**: Policy-gated signing, cross-chain.
- **Solana embedded smart wallets**: Intuitive key management, no seed phrases.

**Implication for Cortex:** Replace Phantom-only assumption with Privy/Dynamic primary onboarding, Phantom/Solflare fallback.

## 2. MCP security is a recognized supply-chain risk

2026 findings:

- 8,000+ public MCP servers; 492 with zero auth/encryption.
- 36.7% vulnerable to SSRF.
- OAuth 2.1 standard; incremental scope consent.
- NIST/CSA working on AI agent security overlays.

**Implication for Cortex:** Per-request identity, containerized node, redacted logs, prompt-injection detection in immunology.

## 3. ZK vector retrieval is becoming practical

- **V3DB**: Plonky2-based verifiable vector search, 22× faster proving.
- **zkRAG**: First PIOP for HNSW ANNS.
- **VeriANN**: Encrypted ANN retrieval with correctness proofs.
- **PRAG**: End-to-end privacy-preserving RAG.

**Implication for Cortex:** Integrate V3DB/zkRAG-style proofs in Phase 3 rather than custom STARKs.

## 4. Recommended v3 changes

1. Wallet: Privy/Dynamic primary, Phantom fallback.
2. MCP auth: signed Capability NFT or wallet message.
3. Immunology: prompt-injection / SSRF defense.
4. PoUS: plan integration with V3DB or zkRAG.
5. Compliance: track NIST COSAiS and MCP security standards.

## 5. Sources

- Privy: https://www.privy.io/
- Coinbase AgentKit: https://www.coinbase.com/developer-platform/discover/launches/agentic-wallets
- MetaMask Embedded: https://metamask.io/news/embedded-wallets-developer-platform
- MoonPay Open Wallet Standard: https://openwallet.sh/
- MCP Security Best Practices: https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices
- V3DB: https://arxiv.org/abs/2603.03065
- zkRAG: https://eprint.iacr.org/2026/709
- VeriANN: https://eprint.iacr.org/2026/923
