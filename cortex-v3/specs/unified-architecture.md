# Enigma Cortex v3 — Unified Architecture

## Layers

1. **Consumer clients** — Next.js PWA, ChatGPT/Claude/Gemini via MCP.
2. **Off-chain memory node** — Ingestion, encryption, retrieval, immunology, replay, royalties.
3. **Solana programs** — Memory registry, budget escrow, capability registry, royalty router, treasury.
4. **Data stores** — Encrypted memory blobs (IPFS/Arweave/private), on-chain hashes + receipts.

## Data flow

```
User input
  → Client signs with embedded wallet
  → Off-chain node encrypts + indexes
  → Anchor program anchors hash + receipt
  → Retrieval query checks capability + budget
  → Royalties routed via Receipt PDA
```

## Trust model

- User owns wallet; embedded wallet provider is a convenience layer.
- Off-chain node is semi-trusted; plaintext never leaves client/node boundary unencrypted.
- On-chain programs enforce ownership, budget, capability, royalty rules.
- Audits and TEE/STARK research mitigate node trust.

## Program responsibilities

| Program | PDA | Function |
|---|---|---|
| memory_registry | Memory | Hash, owner, shareable flag, royalty bps. |
| budget_escrow | Budget | USDC/SOL balance for memory ops. |
| capability_registry | Capability | Scoped, expiring grants to retrieve memory. |
| royalty_router | Receipt | Anchored royalty payment record. |
| cortex_treasury | Treasury | Protocol fee vault. |

## Node modules

- HTTP API for clients
- MCP stdio server for AI models
- In-memory encrypted vault (production: TEE + encrypted DB)
- Immunology sentinel (contradiction / prompt-injection detection)
- Replay scheduler for consolidation

## Scaling assumptions

- 10k–100k active users
- Vector index + relational metadata
- Solana settlement for paid ops only; reads are off-chain with capability checks.

## Security notes

- Encrypt at rest and in transit.
- Capability NFTs per app/model.
- Prompt injection filtering before ingestion.
- All programs use `init-if-needed`, seeds, bumps.

---

*Architecture spec — v3 — 2026-06-25*
