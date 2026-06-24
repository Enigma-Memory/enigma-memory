# Enigma Litepaper

**Publication status:** recommended draft for board and legal review before publication.

Enigma is provider-neutral AI memory and proof infrastructure. It gives people, developers, and organizations a portable memory layer for AI: local-first or customer-controlled vaults, Memory Passports, scoped context injection, and signed receipts for Enigma-mediated memory lifecycle and boundary events.

The simple idea: AI should remember useful context without trapping that context inside one model provider, one app, or one cloud account. Enigma is the memory card for AI.

## Why Enigma exists

AI is moving from one-off chats to long-running work with people, teams, tools, and agents. That creates a new infrastructure problem:

- personal and team context is fragmented across subscriptions, apps, exports, vector stores, and agent stacks;
- developers rebuild memory, retrieval, import/export, and audit logic for every agent;
- enterprises need evidence of what was remembered, retrieved, injected, denied, exported, or tombstoned;
- provider-native memory is useful, but it should not be the only system of record for durable user or enterprise context.

Enigma makes memory portable and accountable without putting raw memory on-chain and without asking users to trust a dashboard as the only record.

## What Enigma provides

### Memory Passport

A Memory Passport is a portable package for AI context. It is designed to move across clients, models, and agent workflows while preserving custody and evidence.

### Local-first vault

A user or enterprise can keep the canonical memory vault locally or inside customer-controlled infrastructure. Enigma can connect that vault to assistants through CLI, MCP, browser, desktop, relay, gateway, and enterprise policy surfaces.

Concrete local path from the Enigma docs:

```sh
cd enigma
npm install -g .
enigma init --bundle ./.enigma/bundle.json --subject local-user --display-name "Local user"
enigma remember --bundle ./.enigma/bundle.json --text "Prefers concise release notes." --purpose user_memory --tags preference
enigma context --bundle ./.enigma/bundle.json --query "release notes" --purpose local_answer --out ./.enigma/context-pack.json
enigma export --bundle ./.enigma/bundle.json --out ./.enigma/export.json
enigma verify --bundle ./.enigma/export.json
```

### MCP installability

Enigma can run as an MCP stdio server so MCP-capable assistants can use a local vault:

```sh
ENIGMA_BUNDLE="$HOME/.enigma/bundle.json" enigma-mcp
```

Generic MCP entry:

```json
{
  "mcpServers": {
    "enigma": {
      "command": "enigma-mcp",
      "args": [],
      "env": {
        "ENIGMA_BUNDLE": "/absolute/path/to/.enigma/bundle.json"
      }
    }
  }
}
```

### Receipts and verifier

Enigma emits signed receipts for declared Enigma-mediated operations such as create, retrieve, context-pack, deny, export, tombstone, and boundary decisions. Receipts are designed to verify offline.

Receipts prove that declared Enigma-mediated operations were signed, ordered, and committed under a stated policy boundary. They do not prove factual truth, model intent, uninstrumented side-channel absence, or deletion from external systems unless those systems provide independent evidence.

## What Enigma does not claim

Enigma does not claim that a closed provider deleted internal data, that model weights forgot, that provider-native memory disappeared, or that every side channel is absent. Enigma proves facts about Enigma-controlled vault state, receipts, checkpoints, and declared boundary operations.

Raw memories, prompts, embeddings, ACLs, and personal metadata should not be written to public chains. Relay and witness infrastructure should handle encrypted records, commitments, receipt identifiers, opaque roots, and service metadata only.

## The optional Enigma network

The core local product must remain useful without a token. The optional Enigma network is for shared infrastructure roles that may need coordination:

- **Relays** route or store encrypted memory capsules and opaque relay records.
- **Witnesses** attest receipt roots, checkpoint batches, and protocol events without seeing plaintext memory.
- **Gateways** provide policy and settlement entry points for applications, enterprises, and developers.
- **Verifiers** inspect receipt bundles and confirm the stated evidence.

Relay and gateway commands from the current docs:

```sh
enigma relay demo
enigma relay serve --host 127.0.0.1 --port 8787
enigma gateway demo
enigma gateway serve --host 127.0.0.1 --port 8797
```

## Planned token role

The Enigma token, if launched, is intended for utility, governance participation, and network access inside optional relay/witness/gateway infrastructure. It does not create company ownership, company-asset, user-data, company-income, or special-access rights.

Planned token uses are narrow:

- meter shared-network services such as relay usage, witness attestations, gateway requests, proof anchoring, and challenge submissions;
- bond active relay, witness, and gateway operators for service accountability under published rules;
- support bounded governance over protocol parameters, service budgets, grants, schema upgrades, and network rules;
- let enterprise customers pay through fiat or managed gateway billing while gateways settle required network services behind the scenes where legally available.

Legal review is required before any token publication, distribution, jurisdictional access decision, governance launch, operator compensation program, or public claim about token functionality.

## Roadmap posture

1. **Local memory and receipts:** install, create a vault, use MCP, export and verify proof bundles.
2. **Developer and enterprise adoption:** connectors, SDKs, policy gateway, import/export, receipt schemas, and audit bundles.
3. **Network testnet:** relays, witnesses, gateways, operator rules, service units, challenge flows, and opaque checkpoint anchoring.
4. **Token launch readiness:** Solana mint decision, authority map, audits, legal review, governance charter, treasury controls, and public risk disclosures.

Enigma should launch with proof first, token second. The product story is portable AI memory with verifiable Enigma-mediated events; the token story is optional network coordination for infrastructure participants.
