# World-class Enigma network and enterprise goal

## Goal

Enigma must graduate from a local proof-core into two production deployment shapes that share the same protocol:

1. **Decentralized memory network** — local-first vaults, encrypted capsules, witness checkpoints, opaque relays, federation, and offline verification.
2. **Hosted/BYOC enterprise control plane** — tenant policy, BYOK/KMS envelope metadata, residency rules, legal hold, SIEM-ready receipts, and gateway decisions before memory reaches models or tools.

Both shapes must preserve the same invariant: AI providers receive scoped context, not canonical durable memory custody.

## Finished MCP bar

The MCP surface is not finished until it has a real stdio JSON-RPC server, not just handler functions. It must support:

- `initialize`
- `tools/list`
- `tools/call`
- `enigma_init`
- `enigma_remember`
- `enigma_search`
- `enigma_context_pack`
- `enigma_delete`
- `enigma_verify_receipts`

The server must be import-safe, runnable by Node, and compatible with MCP clients that speak JSON-RPC over stdin/stdout.

## Decentralized network bar

The network is not finished until it can produce and verify:

- node identity,
- encrypted Capsule manifest,
- witness checkpoint over vault roots,
- relay push/pull records that reveal no plaintext memory,
- federation export/import decision,
- offline verification report.

No public chain stores plaintext, embeddings, ACLs, or unsalted record hashes. Public or federated witnesses carry only opaque roots, signatures, and policy hashes.

## Hosted enterprise bar

The enterprise layer is not finished until it can produce and verify:

- tenant policy,
- memory operation allow/deny decisions,
- provider/model/region/residency checks,
- legal-hold deletion denial,
- BYOK/KMS key-version evidence metadata,
- SIEM/eDiscovery event export,
- gateway decision receipts.

## Release claim

A world-class Enigma release may claim:

> Enigma provides a provider-neutral memory plane with local-first custody, MCP integration, decentralized proof exchange, enterprise policy gates, and offline-verifiable receipts.

It must not claim universal provider deletion, semantic forgetting, model-weight erasure, or complete side-channel absence outside declared instrumented boundaries.
