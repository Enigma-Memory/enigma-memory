# 06 — Website Copy

Publication status: launch-ready draft. Token-related language requires board and legal review before publication.

## Page map

1. Homepage
2. Users page
3. Developers page
4. Enterprise page
5. Network page
6. CTA block library
7. FAQ
8. Install snippets

## Homepage

### SEO

- Title: Enigma — The memory card for AI
- Meta description: Enigma is provider-neutral AI memory and proof infrastructure. Carry context across AI tools, keep custody local or customer-controlled, and verify Enigma-mediated memory events with signed receipts.
- Social title: The memory card for AI
- Social description: Portable Memory Passports, scoped context, and offline-verifiable receipts for AI users, developers, and enterprises.

### Navigation

- Product
- Users
- Developers
- Enterprise
- Network
- Docs
- Community
- Install

### Hero variant A — recommended

Headline: The memory card for AI.

Subhead: Enigma gives people and teams a provider-neutral Memory Passport: portable context, local-first custody, scoped model injection, and signed receipts for Enigma-mediated memory events.

Primary CTA: Install Enigma locally

Secondary CTA: Verify a sample receipt

Trust line: Works across MCP-capable agents and provider workflows without making provider-native memory the durable system of record.

Proof note: Receipts verify declared Enigma-mediated operations; they do not prove factual truth, model intent, complete provider deletion, model forgetting, or uninstrumented side-channel absence.

### Hero variant B — developer-first

Headline: One memory API. Every model. Receipts included.

Subhead: Add durable AI memory through MCP, keep the vault local or customer-controlled, and give every important memory operation a portable proof bundle.

Primary CTA: Run the MCP server

Secondary CTA: Read the receipt flow

Trust line: Build with `enigma-mcp`, local vault bundles, Memory Passports, and offline verification.

### Hero variant C — enterprise-first

Headline: Durable AI memory under your control.

Subhead: Enigma helps enterprises keep memory outside model providers, retrieve only scoped context for each workflow, and produce signed evidence for Enigma gateway and vault decisions.

Primary CTA: Request an enterprise pilot

Secondary CTA: Review the trust model

Trust line: Designed for hosted, BYOC, VPC, and on-prem evaluation paths.

### Hero variant D — community/network

Headline: Portable memory. Verifiable use. Optional network coordination.

Subhead: Enigma is building the proof network for AI memory: local-first by default, provider-neutral by design, with planned relay, witness, gateway, utility, and governance paths subject to legal review.

Primary CTA: Join the community

Secondary CTA: Learn the network roles

Legal line: The planned Enigma token is intended for utility, governance, and network access. It is not equity, not a revenue share, not a claim on company assets or user data, and not marketed with any expectation of profit.

## Homepage section copy

### Section 1 — Problem

Eyebrow: The AI memory problem

Headline: AI is becoming stateful, but its memory is trapped.

Body: The most useful AI systems remember preferences, projects, decisions, documents, workflows, and relationships. Today that memory is scattered across chat histories, provider-native memory, vector databases, agent logs, browser state, and team-specific tools. Users lose continuity when they switch products. Developers rebuild memory for every agent. Enterprises are asked to trust dashboards when they need evidence.

Bullets:

- Provider lock-in: memory stays inside one subscription, model provider, or agent stack.
- Audit gap: logs and traces are useful, but they are not portable cryptographic receipts.
- Governance gap: teams need to know what was retrieved, injected, denied, exported, or tombstoned inside their declared boundary.
- Deletion ambiguity: removing a memory from Enigma active serving is verifiable; deletion from external providers, hidden logs, model weights, screenshots, backups, or people requires separate evidence from those systems.

### Section 2 — Solution

Eyebrow: The SanDisk move for AI

Headline: Carry your AI memory like a passport.

Body: Enigma turns durable AI context into a portable Memory Passport. A vault stores canonical memory under local-first or customer-controlled custody. Policies decide what context can be retrieved. Context packs carry only scoped memory into a model or tool call. Receipts record Enigma-mediated lifecycle and boundary events so users, builders, and auditors can verify what happened later.

Feature cards:

1. Memory Passport — Portable AI context that can move across clients, agents, and workflows.
2. Local-first vault — Keep canonical memory in a local bundle for the local path, or in customer-controlled infrastructure for enterprise modes.
3. Scoped context — Send model providers the relevant context for a task, not your entire durable memory system.
4. Signed receipts — Verify create, retrieve, context-pack, boundary, export, tombstone, and gateway decision events offline.

Analogy block:

SanDisk did not need to own every camera to make storage portable. Enigma does not need to own every AI assistant to make memory portable. The product promise is the same kind of infrastructure move for AI: create a trusted memory artifact, use it across many tools, and keep a verifiable trail of what the memory layer did.

### Section 3 — How it works

Eyebrow: From memory to proof

Headline: Vault → policy → context → receipt.

Step 1: Create or import memory.

Copy: Start with a local Enigma bundle, then write memories through the CLI, MCP server, importers, browser bridge, or future desktop surface. Imported provider exports become canonical only after Enigma writes them into a vault and emits Enigma receipts.

Step 2: Retrieve scoped context.

Copy: An MCP-capable agent asks Enigma for context. Enigma searches the local or customer-controlled vault and produces a context pack for the stated purpose.

Step 3: Use a model or tool boundary.

Copy: The agent can send scoped context to the chosen provider, local model, or tool. Provider-native memory should be treated as cache; Enigma remains the durable system of record for Enigma-managed memory.

Step 4: Verify the receipt.

Copy: Export a proof bundle and run the verifier offline. A valid receipt proves declared Enigma-mediated operations were signed, ordered, and committed under a stated policy boundary. It does not prove the memory statement is factually true or that external systems erased hidden state.

Technical proof line: `event hash E_i` + `previous receipt hash R_{i-1}` + `active set root A_i` + `tombstone root/deleted root D_i` + `policy/boundary commitment` → signed receipt hash `R_i`.

Context proof/public artifact line: the private proof bundle `Π_i` can verify roots, commitments, signatures, and policy/boundary hashes; the redacted public artifact `Φ_i` should not expose raw memory plaintext.

Site diagram language:

```text
Vault / Passport -> Policy -> Scoped Context Capsule -> Boundary -> Receipt Chain -> Offline Verifier
```

Proof lifecycle language:

```text
Canonical event -> Event hash -> Active set root + deleted root -> Signature -> Receipt chain -> Export bundle -> Offline verification
```

### Section 4 — Product paths

Headline: One memory layer, five paths.

Users: Carry your preferences, projects, style, and long-running AI context between tools. Install locally, connect your AI client, and keep a verifiable memory trail.

Developers: Add provider-neutral memory through MCP and documented contracts. Use Enigma as a memory/proof layer instead of rebuilding vault, passport, policy, and receipt infrastructure.

Enterprise: Keep durable AI memory under customer control. Evaluate hosted, BYOC, VPC, and on-prem patterns with gateway decisions, minimized SIEM evidence, and offline-verifiable proof bundles.

Hardware: Witness Vault makes custody and receipts physical. Memory Vault One adds NVMe-backed local memory locality. Enterprise Memory Gateway turns the same proof layer into an on-prem policy boundary.

Network: Planned relay, witness, and gateway roles coordinate encrypted relay records, opaque checkpoints, gateway access, and bounded protocol governance. Raw memories stay encrypted/off-chain. Token and network materials require legal review before publication.

### Section 5 — Proof demo

Eyebrow: See the trust loop

Headline: Create memory. Export proof. Verify offline.

Body: The simplest Enigma demo takes a local vault from empty state to verifiable memory evidence.

Code:

```sh
cd enigma
npm install -g .
enigma init --bundle ./.enigma/bundle.json --subject local-user --display-name "Local user"
# Set ENIGMA_DEMO_MEMORY and ENIGMA_DEMO_QUERY locally before running.
enigma remember --bundle ./.enigma/bundle.json --text "$ENIGMA_DEMO_MEMORY" --purpose user_memory --tags preference
enigma context --bundle ./.enigma/bundle.json --query "$ENIGMA_DEMO_QUERY" --purpose local_answer --out ./.enigma/context-pack.json
enigma export --bundle ./.enigma/bundle.json --out ./.enigma/export.json
enigma verify --bundle ./.enigma/export.json
```

Caption: The bundle is local. Exported proof artifacts should contain encrypted or committed vault state and receipt metadata, not raw memory plaintext in public artifacts.

### Section 6 — Trust boundaries

Headline: Verifiable does not mean magical.

Body: Enigma is intentionally precise about what it proves. Receipts prove facts about Enigma-controlled vault state, receipt chains, checkpoints, context packs, and declared boundary operations. They do not prove factual truth, model intent, provider internals, semantic forgetting, complete side-channel absence, or deletion from systems Enigma does not control.

Boundary equation for technical pages:

```text
valid Enigma claim = verified proof bundle AND operation inside declared Enigma boundary
```

Provider deletion, model forgetting, semantic forgetting, raw model quality, and uninstrumented side-channel absence require separate evidence. They do not follow from an Enigma receipt.

Boundary bullets:

- Enigma can verify that an Enigma vault no longer serves a tombstoned memory address.
- Enigma cannot verify that a closed provider deleted every internal copy or that a model forgot.
- Enigma can verify that a gateway decision followed a stated Enigma policy hash.
- Enigma cannot prove facts outside the declared instrumented boundary without independent evidence from those systems.

CTA: See what a receipt proves

### Section 7 — Compatibility

Headline: Designed to sit under the AI tools you already use.

Body: Enigma connects through MCP, CLI, client connector profiles, importer packages, relay and gateway servers, and browser and desktop scaffolds. It is not a replacement for every memory engine, observability product, model gateway, or vector database. It can wrap, import, export, verify, and portable-ize memory flows around them.

Supported connector IDs:

- Claude Desktop
- Cursor
- Kimi Code
- VS Code / Cline
- Roo Code
- OpenCode
- Generic MCP

### Section 8 — Final homepage CTA

Headline: Install the memory card for AI.

Body: Start with a local vault, connect an MCP-capable client, create your first memory, and verify a receipt. If you are evaluating Enigma for a team, request the enterprise audit demo.

Primary CTA: Install locally

Secondary CTA: Request enterprise pilot

Tertiary CTA: Join the community

## Product pages

The following page copy covers the four launch product paths: users, developers, enterprise, and network.

## Users page

### SEO

- Title: Enigma for users — Portable AI memory that moves with you
- Meta description: Install Enigma locally, create a Memory Passport, connect AI clients through MCP, and verify your Enigma-mediated memory history with receipts.

### Hero

Headline: Your AI memory should move with you.

Subhead: Keep preferences, projects, working context, and important decisions in a portable Memory Passport instead of leaving every AI relationship trapped in one app.

Primary CTA: Install Enigma locally

Secondary CTA: Watch the proof demo

### Sections

#### 1. Keep the context, not the lock-in

Enigma gives your AI tools a shared memory layer. Use one client today, another tomorrow, and keep Enigma as the canonical place where durable memory lives for Enigma-managed workflows.

#### 2. Local-first by default

For the local path, your vault bundle lives on your filesystem. You can create memory, compile context, export proof, and verify receipts without relying on hosted Enigma cloud services after the package or checkout is available.

#### 3. Proof you can inspect

A receipt is a signed record of an Enigma-mediated event. You can export a proof bundle and run `enigma verify` to check it offline.

#### 4. Everyday workflows

- Coding assistant preferences and project conventions
- Research notes and reading trails
- Personal style, format, and language preferences
- Support, sales, and operations context for professional work
- Migration from provider exports into an Enigma-managed vault

#### 5. Honest limits

Enigma can show what happened inside Enigma’s declared boundary. It cannot force a third-party provider to erase hidden state, change model weights, delete screenshots, remove human knowledge, or prove that uninstrumented side channels did not exist.

### User CTA block

Headline: Create your first verifiable memory.

Body: Install Enigma, initialize a local bundle, write one memory, export a proof bundle, and verify it.

CTA: Copy the local install commands

## Developers page

### SEO

- Title: Enigma for developers — Provider-neutral memory and receipts for agents
- Meta description: Add provider-neutral AI memory through MCP, local vaults, Memory Passports, and offline-verifiable receipts.

### Hero

Headline: Give your agent memory without owning your user’s memory.

Subhead: Enigma provides an MCP-installable memory/proof layer with local vaults, context packs, importers, connectors, and receipts developers can verify without a trusted dashboard.

Primary CTA: Run `enigma-mcp`

Secondary CTA: Read the receipt schema

### Sections

#### 1. MCP is the insertion point

Enigma exposes memory tools over MCP so agents can initialize a vault, remember, search, build context packs, delete from Enigma active serving, and verify receipts.

Tools:

- `enigma_init`
- `enigma_remember`
- `enigma_search`
- `enigma_context_pack`
- `enigma_delete`
- `enigma_verify_receipts`

Resource: `enigma://passport/summary`

Prompt: `enigma_standard_memory_prompt`

#### 2. Build on contracts, not screenshots

Use CLI commands, MCP configs, connector profiles, importer APIs, gateway decisions, relay records, and proof bundles as integration surfaces. Enigma is designed to wrap existing memory systems rather than replace every stack.

#### 3. Provider-neutral by design

A developer can route model calls through different providers while keeping Enigma as the durable memory layer for Enigma-managed context. Provider-native memory can still exist as cache or provider feature; it is not the canonical Enigma vault.

#### 4. Verification in your integration tests

Receipts let your integration show that a memory was created, retrieved, packed, tombstoned, or denied inside Enigma’s boundary. They do not prove a model used the context correctly or that the memory text is factually true.

#### 5. Developer CTA

Headline: Add Enigma to an agent in minutes.

Code:

```sh
ENIGMA_BUNDLE="$HOME/.enigma/bundle.json" enigma-mcp
```

CLI equivalent:

```sh
ENIGMA_BUNDLE="$HOME/.enigma/bundle.json" enigma mcp serve
```

CTA: Copy the MCP client config

## Enterprise page

### SEO

- Title: Enigma for enterprise — Auditable AI memory under customer control
- Meta description: Evaluate Enigma for controlled AI memory deployments with customer-controlled custody, gateway decisions, minimized SIEM exports, and offline-verifiable receipts.

### Hero

Headline: AI memory needs an evidence trail before it becomes infrastructure.

Subhead: Enigma helps enterprise teams keep durable memory under customer control, send providers only scoped context, and produce signed receipts for Enigma-mediated vault, policy, and gateway events.

Primary CTA: Request a private pilot

Secondary CTA: Review deployment modes

### Sections

#### 1. The enterprise tension

Teams want AI systems that remember. Security, legal, and compliance teams need to know what was remembered, who could retrieve it, which provider boundary it crossed, under which policy, and what evidence exists after the fact.

#### 2. Customer-controlled deployment paths

Hosted: Enigma operator runs relay or gateway for a tenant with deployment credentials, TLS, durable storage, KMS or secrets, monitoring, backups, and tenant policy.

BYOC: The customer runs relay or gateway in its own cloud, VPC, cluster, or private network. The customer controls KMS, network policy, logs, SIEM export, backups, and data residency.

On-prem or air-gapped evaluation: Use the local CLI, verifier, and bundle model where appropriate for controlled tests.

#### 3. Gateway decisions and minimized evidence

The Enigma gateway evaluates enterprise policy and signs decisions. It does not call model providers. SIEM exports should minimize plaintext and carry policy, key, provider, model, region, purpose, sensitivity, memory address, and decision metadata where configured.

#### 4. Audit support, not compliance guarantees

Enigma provides evidence and controls that support audits, deletion workflows, residency governance, legal holds, and policy review. It does not guarantee compliance outcomes and does not prove behavior outside Enigma’s declared instrumented boundary.

#### 5. Two-week pilot motion

Week 1:

- Install local CLI and verifier.
- Connect one MCP-capable client.
- Create and retrieve scoped memory.
- Export and verify proof bundles.

Week 2:

- Evaluate gateway decision flow.
- Export minimized SIEM evidence.
- Review deployment mode and key-control requirements.
- Document proof boundaries and non-goals.

### Enterprise CTA block

Headline: Run the enterprise memory audit demo.

Body: Show a security reviewer which memory was retrieved, which policy allowed it, which provider boundary was declared, and what the receipt can verify offline.

CTA: Schedule architecture review

## Network page

Publication status: board and legal-review required before external publication.

### SEO

- Title: Enigma Network — Relay, witness, gateway, and utility coordination
- Meta description: Learn how Enigma’s planned optional network coordinates encrypted relay, opaque checkpoint witnessing, gateway access, and bounded governance for AI memory/proof infrastructure.

### Hero

Headline: The optional proof network for AI memory.

Subhead: Local Enigma works without a token. The planned network layer coordinates shared relay, witness, and gateway services for teams and operators who need encrypted sync, opaque checkpoint witnessing, service access, and bounded protocol governance.

Primary CTA: Read the network roles

Secondary CTA: Join the operator waitlist

Legal line: Token and network materials are subject to legal review. The planned Enigma token is intended for utility, governance, and network access only. It is not equity, not a revenue share, not a claim on company assets or user data, and not marketed with any expectation of profit.

### Sections

#### 1. What the network does

The network is planned to coordinate optional infrastructure around Enigma receipts and Memory Passports:

- Relays route or store opaque encrypted capsule records.
- Witnesses attest compact commitments, receipt roots, checkpoint context, and service events.
- Gateways provide controlled network access and policy-mediated submission paths.
- Verifiers check portable receipts and proof bundles, with offline verification remaining central where applicable.

#### 2. What does not go on-chain

Raw memories, prompts, transcripts, embeddings, private ACLs, and personal metadata should not be written to Solana by default. Public or shared infrastructure may use opaque roots, commitments, receipt IDs, service metadata, and operator records where useful.

#### 3. Solana implementation posture

Enigma’s token plan may use standard SPL Token or Token-2022 after technical and legal review. SPL tokens use Mint Accounts and Token Accounts. Token-2022 adds optional extensions; most extensions must be planned at mint creation. If Token-2022 is used, MetadataPointer and TokenMetadata may store canonical name, symbol, URI, update authority, and custom metadata on the mint. Final program choice, extensions, authorities, and addresses require board, engineering, and legal approval before publication.

Recommended draft value requiring board/legal review: use a simple base token design unless a specific Token-2022 extension is necessary at launch; keep service utility in separate programs for operator registry, escrow, bonding, challenges, witness anchoring, and governance.

#### 4. Token utility boundaries

Allowed framing:

- Network access and service settlement for relay, witness, gateway, anchoring, verifier challenge, and protocol access paths where legally available.
- Operator bonding for active relay, witness, or gateway work under published rules.
- Bounded governance over protocol parameters, schema upgrades, witness admission criteria, fee schedules, grants, and verifier requirements.
- Ecosystem grants and service programs for verified contribution, not passive holding.

Banned framing:

- Equity, dividends, revenue share, company ownership, ownership of user data, or claim on company assets.
- Financial-upside, resale, trading, scarcity, or guaranteed-compensation framing.
- Claims that local Enigma requires token ownership.
- Claims that governance can access private memories or rewrite historical receipts.

#### 5. Network CTA block

Headline: Choose a useful role.

Body: Users create and verify receipts. Developers build integrations. Operators may run relay, witness, or gateway infrastructure when network rules, legal review, and testnet readiness are complete.

CTA: Apply for operator waitlist

## CTA block library

### Install CTA

Headline: Install Enigma locally.

Body: Create a local vault, connect an MCP-capable agent, write one memory, and verify the proof bundle.

Primary CTA: Install locally

Secondary CTA: Read install docs

### Receipt CTA

Headline: Do not trust a dashboard when you can verify a receipt.

Body: Export the proof bundle, disconnect from hosted services if desired, and run the verifier against Enigma receipts.

Primary CTA: Verify a sample receipt

Secondary CTA: Learn what receipts do not prove

### MCP CTA

Headline: Connect Enigma to your AI client.

Body: Use the universal MCP entry or the connector CLI for Claude Desktop, Cursor, Kimi Code, VS Code/Cline, Roo Code, OpenCode, and generic MCP clients.

Primary CTA: Copy MCP config

Secondary CTA: See connector commands

### Enterprise CTA

Headline: Bring memory to the security review.

Body: Evaluate local custody, gateway decisions, minimized SIEM evidence, receipt verification, and deployment boundaries in a private pilot.

Primary CTA: Request pilot

Secondary CTA: Schedule architecture review

### Network CTA

Headline: Learn the network utility model.

Body: Understand relay, witness, gateway, utility, governance, and access mechanics without token trading or ownership framing.

Primary CTA: Read network roles

Secondary CTA: Review legal boundaries

## FAQ

### What is Enigma?

Enigma is provider-neutral AI memory/proof infrastructure. It gives users and organizations portable Memory Passports, local-first or customer-controlled vaults, scoped context injection, and signed receipts for Enigma-mediated memory lifecycle and boundary events.

### Why call it the memory card for AI?

A memory card made storage portable across cameras and computers. Enigma aims to make AI memory portable across agents, model providers, clients, and enterprise workflows while adding receipts that show what happened inside Enigma’s boundary.

### Is Enigma a model or chatbot?

No. Enigma is infrastructure beneath AI tools. It stores and governs memory, connects through MCP and other surfaces, and emits receipts. It can work with different models and clients.

### Is Enigma a vector database?

No. Enigma may use retrieval internally or integrate around retrieval systems, but the product is a memory custody, portability, policy, and proof layer.

### What is a Memory Passport?

A Memory Passport is a portable package of Enigma-managed AI context, metadata, and receipt history that can move across supported clients and workflows.

### What is a receipt?

A receipt is a signed, hash-linked record of an Enigma-mediated operation such as create, retrieve, context-pack, deny, export, tombstone, delete-request, gateway decision, relay record, or witness checkpoint. In technical copy, describe it as a canonical event hash bound to a previous receipt hash, active set root, tombstone root/deleted root, policy commitment, and declared boundary commitment.

### What does a valid receipt prove?

A valid receipt proves that declared Enigma-mediated operations were signed, ordered, and committed under a stated policy boundary. Depending on the receipt, it can show Enigma-controlled vault state, context-pack creation, gateway decisions, or checkpoint commitments.

### What does a receipt not prove?

A receipt does not prove that a memory statement is factually true, that a model intended something, that a provider erased hidden state, that model weights forgot, that screenshots or human notes vanished, or that uninstrumented side channels were absent.

### Does Enigma delete provider-native memories?

No. Enigma can tombstone or remove memory from Enigma active serving state and provide receipts for Enigma-controlled state transitions. Third-party provider deletion requires independent provider controls and evidence.

### Does Enigma put my memories on-chain?

No. Raw memories, prompts, transcripts, embeddings, and private personal metadata should not be written on-chain by default. Optional network paths may use commitments, roots, receipt IDs, service metadata, and operator records.

### Do I need a token to use local Enigma?

No. Local Enigma memory, MCP use, local custody, export, and offline verification should work without token ownership.

### What is the planned token for?

If launched after legal review, the Enigma token is intended for utility, governance, and network access within optional relay, witness, and gateway infrastructure. It is not equity, not a revenue share, not a claim on company assets or user data, and not marketed with any expectation of profit.

### Can enterprises pay without holding tokens?

Recommended draft value requiring board/legal review: enterprise customers should be able to pay through invoices, card, fiat, USDC, SOL, or gateway credits while gateways settle any required network services behind the scenes where legally and operationally appropriate.

### What is the fastest demo?

Install from the repository, initialize a local bundle, write one memory, create a context pack, export a proof bundle, and run `enigma verify`.

## Install snippets

### From this repository

```sh
cd enigma
npm install -g .
enigma --help
enigma-verify --help
enigma-mcp
```

### Direct CLI without global install

```sh
cd enigma
node apps/cli/bin/enigma.mjs --help
node apps/verifier/bin/enigma-verify.mjs --help
```

### After package publication

```sh
npm install -g @enigma-ai/enigma
enigma --help
```

### One-off package execution after publication

```sh
npx --yes --package @enigma-ai/enigma enigma --help
npx --yes --package @enigma-ai/enigma enigma-mcp
```

### Local file-only demo path after install

After Enigma is already available from the checkout or a package install, this demo command flow uses a local bundle and local verifier. This is not a product-wide network-silence claim and does not cover package download or installation.

```sh
mkdir -p .enigma
enigma init --bundle ./.enigma/bundle.json --subject local-user --display-name "Local user"
# Set ENIGMA_DEMO_MEMORY and ENIGMA_DEMO_QUERY locally before running.
enigma remember --bundle ./.enigma/bundle.json --text "$ENIGMA_DEMO_MEMORY" --purpose user_memory --tags preference
enigma context --bundle ./.enigma/bundle.json --query "$ENIGMA_DEMO_QUERY" --purpose local_context --out ./.enigma/context-pack.json
enigma export --bundle ./.enigma/bundle.json --out ./.enigma/export.json
enigma verify --bundle ./.enigma/export.json
```

### Windows PowerShell local path

```powershell
New-Item -ItemType Directory -Force .enigma
enigma init --bundle .\.enigma\bundle.json --subject local-user --display-name "Local user"
# Set ENIGMA_DEMO_MEMORY and ENIGMA_DEMO_QUERY locally before running.
enigma remember --bundle .\.enigma\bundle.json --text "$env:ENIGMA_DEMO_MEMORY" --purpose user_memory --tags preference
enigma context --bundle .\.enigma\bundle.json --query "$env:ENIGMA_DEMO_QUERY" --purpose local_context --out .\.enigma\context-pack.json
enigma export --bundle .\.enigma\bundle.json --out .\.enigma\export.json
enigma verify --bundle .\.enigma\export.json
```

### MCP server

```sh
ENIGMA_BUNDLE="$HOME/.enigma/bundle.json" enigma-mcp
```

### MCP server through CLI

```sh
ENIGMA_BUNDLE="$HOME/.enigma/bundle.json" enigma mcp serve
```

### Windows PowerShell MCP

```powershell
$env:ENIGMA_BUNDLE="$HOME\.enigma\bundle.json"
enigma-mcp
```

### Generic MCP client entry

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

### Connector commands

```sh
enigma doctor
enigma install --bundle "$HOME/.enigma/bundle.json"
enigma connect claude-desktop --bundle "$HOME/.enigma/bundle.json"
enigma connect cursor --bundle "$HOME/.enigma/bundle.json"
enigma connect kimi-code --bundle "$HOME/.enigma/bundle.json"
enigma connect vscode-cline --bundle "$HOME/.enigma/bundle.json"
enigma connect roo --bundle "$HOME/.enigma/bundle.json"
enigma connect opencode --bundle "$HOME/.enigma/bundle.json"
enigma connect generic-mcp --bundle "$HOME/.enigma/bundle.json"
```

### Relay and gateway demos

```sh
enigma relay demo
enigma gateway demo
```

### Relay and gateway servers

```sh
enigma relay serve --host 127.0.0.1 --port 8787
enigma gateway serve --host 127.0.0.1 --port 8797
```
