# Enigma launch package

Enigma is provider-neutral AI memory/proof infrastructure: local-first Memory Passports, scoped context delivery across AI clients, and signed receipts for Enigma-mediated memory lifecycle and boundary events.

This launch package is written for public review. It leads with product, installability, trust boundaries, and protocol utility. Token language is limited to utility, governance, and network-access mechanics for optional relay/witness/gateway infrastructure. Token materials require legal review before publication.

## Start here

| File | Audience | Purpose |
| --- | --- | --- |
| `00_LAUNCH_README.md` | Everyone | Map the launch package and state shared claim boundaries. |
| `01_EXECUTIVE_BRIEF.md` | Executives, partners, press, enterprise evaluators | Summarize category, problem, product, market wedge, go-to-market, token role, installability, and proof boundary. |
| `02_WHITEPAPER.md` | Technical, security, enterprise, protocol, and ecosystem readers | Define the architecture, Memory Passport, receipts/proof protocol, install paths, relay/witness/gateway network, enterprise controls, token role, roadmap, threat model, risks, and honesty contract. |
| `03_LITEPAPER.md` | Broad public, community, and partner readers | Provide a shorter product-and-network explanation that sits between the executive brief and full whitepaper. |
| `04_TOKEN_UTILITY_AND_TOKENOMICS.md` | Network participants, counsel, governance reviewers | Define utility, access, service-unit, bonding, governance, supply, authority, risk, and legal-review posture. |
| `05_SOLANA_TOKEN_LAUNCH_RUNBOOK.md` | Token launch operators, engineering, counsel | Sequence Solana mint/program/metadata/authority work with required review gates and publication controls. |
| `06_WEBSITE_COPY.md` | Website and launch-page team | Provide public-facing web copy grounded in product proof, installability, and token boundaries. |
| `07_BRAND_MESSAGING.md` | Brand, comms, community, sales | Standardize positioning, slogans, language hierarchy, and prohibited claims. |
| `08_PRESS_KIT.md` | Press, analysts, partners | Package approved messaging, facts, quotes, and safe background for external coverage. |
| `09_PITCH_DECK_OUTLINE.md` | Partners and presentation team | Outline a launch deck focused on category, product proof, architecture, GTM, and network utility. |
| `10_INVESTOR_AND_PARTNER_MEMO.md` | Company partners and strategic reviewers | Summarize business context and partnership logic without token financial-promotion or return claims. |
| `11_ENTERPRISE_SALES_PLAYBOOK.md` | Enterprise sales and solutions teams | Translate Enigma into enterprise discovery, pilot, security-review, deployment, and objection-handling motions. |
| `12_COMMUNITY_AND_SOCIAL_PLAYBOOK.md` | Community team | Set public-community voice, channel rules, and token-discussion boundaries. |
| `13_CONTENT_CALENDAR.md` | Marketing and community team | Sequence launch-week and post-launch education around product proof, not speculation. |
| `14_FAQ_AND_OBJECTIONS.md` | Users, developers, enterprises, community | Answer common questions about memory, proof, privacy, installability, token utility, and limits. |
| `15_USER_INSTALL_GUIDE.md` | Users and developers | Give hands-on install, MCP, local vault, context, export, and verification instructions. |
| `16_DEMO_SCRIPTS.md` | Presenters, support, developer advocates | Script the install, MCP, receipt, relay, gateway, and verifier demos with safe claim boundaries. |
| `token-metadata.template.json` | Engineering, token operations, counsel | Draft token metadata fields that must be reviewed before any publication. |

## Launch narrative

**One-liner:** Enigma is the verifiable memory plane for AI: portable context, local-first custody, and signed receipts across models and agents.

**Category:** Verifiable AI Memory Infrastructure.

**Plain-English frame:** The memory card for AI.

**Technical frame:** Provider-neutral memory and proof infrastructure that gives people and organizations a canonical vault, portable Memory Passports, scoped context capsules, and offline-verifiable receipts for Enigma-mediated events.

**Enterprise frame:** An auditable AI memory control plane that keeps durable memory under local or customer-controlled custody while emitting evidence for policy, retrieval, delete-request workflow, residency, and boundary decisions.

## What Enigma does

- Maintains a local-first or customer-controlled canonical memory vault.
- Packages portable context as Memory Passports and Memory Capsules.
- Connects assistants through CLI, MCP, browser, desktop, relay, gateway, and enterprise policy surfaces.
- Emits signed receipts for Enigma-mediated memory lifecycle and boundary events.
- Verifies proof bundles offline without requiring trust in an Enigma hosted service or model-provider dashboard.
- Supports optional relay/witness/gateway infrastructure for encrypted relay, checkpoint witnessing, and policy-controlled network access.

**Standard proof boundary:** Enigma proves Enigma-mediated state transitions, receipts, gateway decisions, relay records, witness checkpoints, and verifier outcomes under declared policy and software boundaries. It does not prove external provider internals, provider-native deletion, hidden logs/caches/backups, model or semantic forgetting, human behavior, factual truth, or legal/compliance outcomes.

## What Enigma does not claim

Enigma must stay precise to remain trustworthy.

- Enigma does not prove that a closed provider deleted internal data.
- Enigma does not prove that model weights, caches, telemetry, backups, screenshots, provider-native memory, semantic paraphrases, or human observers forgot anything.
- Enigma does not prove that a signed memory is factually true in the real world.
- Enigma does not prove model intent, internal reasoning, or behavior outside the declared instrumented boundary.
- Enigma does not claim complete side-channel absence. It can only describe and receipt the boundaries it instruments.
- Enigma does not store raw memories, prompts, embeddings, ACLs, or personal metadata on Solana.

## Current installability

The public local path works from the repository checkout. The npm package path is for publication after deployment credentials and release approval are available.

From this repository:

```sh
cd enigma
npm install -g .
enigma --help
```

Create a local vault, write memory, compile context, export proof, and verify:

```sh
enigma init --bundle ./.enigma/bundle.json --subject local-user --display-name "Local user"
: "${ENIGMA_DEMO_MEMORY:?Set a non-sensitive demo memory locally; do not publish raw memory plaintext.}"
: "${ENIGMA_DEMO_QUERY:?Set a non-sensitive demo query locally.}"
enigma remember --bundle ./.enigma/bundle.json --text "$ENIGMA_DEMO_MEMORY" --purpose user_memory --tags preference
enigma context --bundle ./.enigma/bundle.json --query "$ENIGMA_DEMO_QUERY" --purpose local_answer --out ./.enigma/context-pack.json
enigma export --bundle ./.enigma/bundle.json --out ./.enigma/export.json
enigma verify --bundle ./.enigma/export.json
```

Run the MCP server:

```sh
ENIGMA_BUNDLE="$HOME/.enigma/bundle.json" enigma-mcp
```

Generic MCP client entry:

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

## Token posture for launch materials

The Enigma token plan is optional network infrastructure content, not the center of the product story.

Recommended public sentence, board/legal-review required:

> The Enigma token, if launched, is intended for utility, governance, and network access within optional relay/witness/gateway infrastructure; it is not equity, not a revenue share, not a claim on company assets or user data, and not marketed with any expectation of profit.

Allowed token framing:

- Network access for optional relay, witness, gateway, proof anchoring, verification challenges, and protocol service units where legally available.
- Active-service operator bonding under published network rules.
- Bounded protocol governance over parameters such as witness admission, fee schedules, grants, schema upgrades, and verifier requirements.
- Enterprise-friendly access through fiat or subscription wrappers where legally approved and actually offered, with any network settlement handled behind the scenes.

Prohibited token framing:

- Financial-return, trading-upside, liquidity, listing, scarcity-value, or reward-promise claims.
- Equity, dividends, revenue share, company ownership, protocol profit rights, or rights to user data.
- Claims that local Enigma requires token purchase.
- Claims that proofs remove all legal, privacy, technical, or operational risk.

## Review standard before publication

Every launch document should pass this checklist:

- Product claims are specific to Enigma-controlled or Enigma-mediated state.
- Proof claims state what is verified and what is not verified.
- Token language is utility/governance/network-access oriented and legally cautious.
- No raw-memory-on-chain claim appears.
- No impossible deletion, model-forgetting, or complete side-channel claim appears.
- Install commands match current Enigma docs.
- Local-only workflows remain usable without a token.
- Any token, supply, authority, governance, allocation, or operator parameter that still needs approval is marked board/legal-review required and drafted as a recommendation, not a finalized fact.

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
