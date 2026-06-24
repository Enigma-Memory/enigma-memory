# Enigma executive brief

## Category

Enigma is **provider-neutral AI memory/proof infrastructure**.

The plain-language frame is simple: Enigma is the memory card for AI. It lets people and organizations carry context across AI clients without making one model provider, subscription app, or agent framework the durable system of record.

The technical category is **Verifiable AI Memory Infrastructure**: local-first or customer-controlled memory custody, portable Memory Passports, scoped context delivery, and signed receipts for Enigma-mediated memory lifecycle and boundary events.

The enterprise category is an **auditable AI memory control plane**: durable memory stays under user or tenant control; providers receive scoped context; admins and auditors receive verifiable evidence about the Enigma-side operations that occurred.

## Problem

AI is moving from stateless prompts to long-running relationships with users, teams, tools, and agents. Those relationships require memory. Today that memory is fragmented and difficult to govern:

- **Provider lock-in:** AI memory often lives inside one model provider, subscription app, IDE, vector store, or agent runtime.
- **Portability gap:** Users and teams cannot reliably carry preferences, project context, working history, and durable instructions between AI tools.
- **Audit gap:** Dashboards and logs describe events, but they are not usually portable, offline-verifiable evidence.
- **Deletion ambiguity:** Removing a memory from one system does not prove provider-side deletion, model forgetting, derived-copy deletion, or absence from external logs.
- **Policy drift:** Permissions, residency requirements, legal holds, and project scopes can change after memory was created.
- **Developer tax:** Every agent stack must rebuild memory, retrieval, import/export, policy, receipts, and audit primitives.
- **Enterprise tension:** Teams want durable AI memory and low-retention provider calls. That is hard when memory itself is stored inside provider accounts.

The market needs a neutral memory layer that sits beneath models and agents: portable for users, boring for developers, controllable for enterprises, and honest about what can and cannot be proven.

## Product

Enigma gives users, developers, and enterprises a canonical memory vault plus proof layer.

Core product objects:

- **Vault:** The local-first or customer-controlled canonical store for Enigma memory state.
- **Memory Passport:** A portable, encrypted package of AI context and associated proof material that can move across clients and deployment modes.
- **Memory Capsule:** A scoped, encrypted context package prepared for a defined workflow, subject, purpose, policy, or recipient.
- **Receipt:** A signed, hash-linked, offline-verifiable record of an Enigma-mediated event such as create, import, retrieve, context-pack, inject, deny, update, export, tombstone, or delete request.
- **Verifier:** Local tooling that checks proof bundles without requiring trust in an Enigma hosted service or AI provider dashboard.
- **Gateway:** A policy enforcement layer for provider/model/tool/region/purpose decisions.
- **Relay:** Optional infrastructure for storing or routing opaque encrypted records.
- **Witness:** Optional infrastructure for checkpointing opaque roots and receipt/proof events without receiving raw memory.

The Enigma flow:

```text
vault -> passport -> policy -> scoped retrieval -> context capsule -> model/tool boundary -> receipt -> verifier -> optional witness checkpoint
```

Enigma is not a foundation model, chatbot, vector database replacement, blockchain data store, or compliance guarantee. It can wrap, import from, export to, or sit beside existing memory engines and AI clients.

## Market wedge

The wedge is **MCP-installable local Memory Passport plus offline receipt verification**.

A user or developer should be able to:

1. install Enigma locally,
2. create a vault,
3. connect an MCP-capable client,
4. write and retrieve memory,
5. export a proof bundle, and
6. verify receipts offline.

That sequence demonstrates the category in one loop: memory is portable, provider-neutral, locally controlled, and evidence-carrying.

Primary early audiences:

- **AI power users and creators:** want continuity across ChatGPT, Claude, Kimi, Cursor, local models, and future AI workspaces.
- **Agent developers:** want durable memory, scoped retrieval, and receipts without building a governance layer from scratch.
- **Enterprise AI teams:** want controlled memory custody, provider-boundary evidence, policy replay, SIEM/eDiscovery support, and deployment options.
- **Memory engines and model gateways:** can add proof-carrying portability instead of rebuilding receipt infrastructure.
- **Network operators and community:** can support optional relay/witness/gateway infrastructure once public network rules are ready.

## Go-to-market

Launch should lead with product proof, not token speculation.

Recommended sequence:

1. **Category reveal:** explain why AI memory needs portability and proof.
2. **Developer proof:** show local install, MCP connection, receipt generation, and offline verification.
3. **Enterprise credibility:** translate receipts into policy, audit, delete-request/tombstone workflow, residency, and boundary evidence.
4. **Network education:** introduce optional relay/witness/gateway roles and utility/governance/access mechanics after the product proof loop is clear.

Primary CTAs:

- Install Enigma locally.
- Connect an MCP-capable AI client.
- Create a first verifiable memory.
- Export and verify a receipt offline.
- Request an enterprise architecture review or pilot.
- Learn network roles only after understanding product boundaries.

## Current installability

Current status is local-first and repository-installable. Hosted cloud operation is not activated by installing the package; hosted relay/gateway operation requires deployment credentials, domain, TLS, durable storage, KMS/secrets, monitoring, backups, and operator policy.

From the repository:

```sh
cd enigma
npm install -g .
enigma --help
```

Local no-network vault path after the package or checkout is present:

```sh
enigma init --bundle ./.enigma/bundle.json --subject local-user --display-name "Local user"
: "${ENIGMA_DEMO_MEMORY:?Set a non-sensitive demo memory locally; do not publish raw memory plaintext.}"
: "${ENIGMA_DEMO_QUERY:?Set a non-sensitive demo query locally.}"
enigma remember --bundle ./.enigma/bundle.json --text "$ENIGMA_DEMO_MEMORY" --purpose user_memory --tags preference
enigma context --bundle ./.enigma/bundle.json --query "$ENIGMA_DEMO_QUERY" --purpose local_answer --out ./.enigma/context-pack.json
enigma export --bundle ./.enigma/bundle.json --out ./.enigma/export.json
enigma verify --bundle ./.enigma/export.json
```

MCP server:

```sh
ENIGMA_BUNDLE="$HOME/.enigma/bundle.json" enigma-mcp
```

CLI equivalent:

```sh
ENIGMA_BUNDLE="$HOME/.enigma/bundle.json" enigma mcp serve
```

Generic MCP configuration:

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

Supported connector profiles include Claude Desktop, Cursor, Kimi Code, VS Code/Cline, Roo Code, OpenCode, and generic MCP.

## Token role

The token plan is subordinate to the product. Local Enigma memory, MCP use, and offline receipt verification should remain usable without token ownership.

Recommended token sentence, board/legal-review required:

> The Enigma token, if launched, is intended for utility, governance, and network access within optional relay/witness/gateway infrastructure; it is not equity, not a revenue share, not a claim on company assets or user data, and not marketed with any expectation of profit.

Potential utility roles, subject to legal and technical review:

- meter optional network services such as encrypted relay, witness attestations, checkpoint anchoring, gateway requests, verifier challenges, and service-class routing;
- bond active relay, witness, or gateway operators under objective network rules;
- coordinate bounded governance over protocol parameters, schema upgrades, witness admission criteria, grants, service budgets, and verifier requirements;
- support enterprise payment wrappers, where legally approved and actually offered, while gateways handle any required network settlement behind the scenes.

Required boundaries:

- Token ownership is not equity, dividend, revenue share, company ownership, or ownership of user data.
- No document should include financial-return, trading-upside, listing, liquidity, scarcity-value, or reward-promise language.
- Operator compensation, if described, must be for verifiable active service under network rules, not for passive holding.
- Raw memories, prompts, embeddings, ACLs, and personal metadata must not be stored on Solana.
- Token materials require legal review before publication.

## Proof boundary

Enigma's proof model is intentionally bounded.

Receipts can prove that declared Enigma-mediated operations were signed, ordered, and committed under stated policy and software boundaries. They can support evidence about Enigma vault state, memory lifecycle events, context-pack generation, gateway decisions, relay records, witness checkpoints, and verifier outcomes.

**Standard proof boundary:** Enigma proves Enigma-mediated state, receipts, gateway/relay/witness artifacts, and verifier results under declared policy and software boundaries. It does not prove external provider internals, provider-native deletion, hidden logs/caches/backups, model or semantic forgetting, factual truth, model intent, complete side-channel absence, or legal/compliance status by itself.

That boundary is not a weakness; it is the source of trust. Enigma should be judged on precise, verifiable claims rather than broad promises that no AI memory system can honestly make.

## Source links

Enigma local docs:

- `../README.md`
- `../docs/install-anywhere.md`
- `../docs/client-connectors.md`
- `../docs/sandisk-scale-strategy.md`

Solana docs:

- SPL token concepts: https://solana.com/docs/tokens
- Token-2022 overview: https://www.solana-program.com/docs/token-2022
- Token extensions: https://solana.com/docs/tokens/extensions
- Metadata Pointer and TokenMetadata extensions: https://solana.com/docs/tokens/extensions/metadata
