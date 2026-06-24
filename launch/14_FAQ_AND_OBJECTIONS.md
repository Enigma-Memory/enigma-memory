# FAQ and objections

## Short answers to pin

### What is Enigma?

Enigma is provider-neutral AI memory/proof infrastructure. It gives users and organizations portable Memory Passports, local-first or customer-controlled vaults, scoped context injection into AI workflows, and signed receipts for Enigma-mediated memory lifecycle and boundary events.

### What is the simplest demo?

Create a local vault, save one memory, export a proof bundle, and verify it:

```sh
cd enigma
npm install -g .
enigma init --bundle ./.enigma/bundle.json --subject local-user --display-name "Local user"
# Set ENIGMA_MEMORY_TEXT and ENIGMA_CONTEXT_QUERY locally; keep values out of public support posts.
enigma remember --bundle ./.enigma/bundle.json --text "$ENIGMA_MEMORY_TEXT" --purpose user_memory --tags preference
enigma context --bundle ./.enigma/bundle.json --query "$ENIGMA_CONTEXT_QUERY" --purpose local_answer --out ./.enigma/context-pack.json
enigma export --bundle ./.enigma/bundle.json --out ./.enigma/export.json
enigma verify --bundle ./.enigma/export.json
```

### What does a receipt prove?

A receipt proves that a declared Enigma-mediated operation was signed, ordered, and committed under a stated policy boundary.

A receipt does not prove factual truth, model intent, uninstrumented side-channel absence, or deletion from external providers unless those systems provide independent evidence.

### Is Enigma token-first?

No. Enigma should be explained first as local-first AI memory/proof infrastructure. The planned token, if launched, is for optional relay/witness/gateway utility, governance participation, and network access. Token materials require legal review before publication. Token ownership is not company ownership, not ownership of user data, does not grant holder proceeds, and does not promise compensation.

### Will the team DM me about token sales?

No. Official Enigma team members and moderators will never DM first to sell tokens, allocate tokens, request wallet connection, ask for seed phrases/private keys, provide secret links, or offer paid support. There are no official DM token sales.

## Product fundamentals

### What problem does Enigma solve?

AI is becoming stateful, but useful memory is fragmented across providers, apps, vector stores, exports, and agent stacks. Enigma gives memory a neutral home: a local-first or customer-controlled vault, portable passport format, scoped context retrieval, and signed receipts that can be verified later.

### Is Enigma a chatbot?

No. Enigma is infrastructure beneath AI clients and agents. It can connect to MCP-capable assistants, browser workflows, desktop surfaces, enterprise gateways, and future relay/witness/gateway infrastructure.

### Is Enigma a model provider?

No. Enigma does not train or serve a foundation model. It manages memory, context boundaries, receipts, and optional network coordination around AI workflows.

### Is Enigma just a vector database?

No. Enigma may use retrieval concepts, but the product is a memory custody and proof layer: vaults, passports, scoped context, lifecycle receipts, verifier output, connectors, and enterprise/network surfaces.

### Is Enigma trying to replace provider-native memory?

No. Provider-native memory can be treated as cache or convenience. Enigma is the canonical memory/proof layer when a user or organization wants portability and evidence independent of one provider dashboard.

### Where is the detailed competitive analysis?

The launch comparison lives at [`docs/competitive-memory-analysis.md`](../docs/competitive-memory-analysis.md). It compares Enigma with provider-native memory, vector databases/RAG, agent-framework state, observability logs, decentralized storage, cloud KMS/gateways, and hardware wallets across custody, portability, scoped context, offline receipts, boundary evidence, deletion-from-active-state proof, relay/witness/gateway fit, and enterprise policy.

### What is Enigma better at?

Enigma is better at portable, provider-neutral memory custody and evidence for Enigma-mediated lifecycle and boundary events. In practical terms: a local-first or customer-controlled vault can remain canonical; context can be scoped before provider/tool use; receipts can be exported and verified offline; and enterprise policy decisions can be tied to hashes, purposes, sensitivities, and deployment boundaries.

Enigma is not better at every adjacent subproblem. Do not claim it is the fastest vector database, the only observability tool, a KMS replacement, a model gateway replacement, a decentralized storage network, a hardware wallet, a foundation model, or proof that providers deleted hidden state.

### What is the SanDisk-level positioning?

SanDisk did not need to own every camera, laptop, or phone to make storage portable and trusted. Enigma does not need to own every AI provider, agent framework, vector store, gateway, or device. The positioning is: make AI memory portable, standardized, encrypted, scoped, and verifiable across those surfaces.

### What is a Memory Passport?

A Memory Passport is a portable package of AI context controlled by the user, tenant, or delegated controller depending on deployment mode. It is designed to move useful memory across AI tools while preserving receipt evidence about Enigma-mediated operations.

### What is a Memory Capsule?

A Memory Capsule is a scoped package of context or memory material prepared for a specific workflow, provider, model, agent, or tool boundary. Capsules should contain only what is authorized for the intended use.

### What is a vault?

A vault is the local-first or customer-controlled place where Enigma stores canonical memory state for a deployment path. The local quickstart uses a bundle file such as `./.enigma/bundle.json` or `$HOME/.enigma/bundle.json`.

### What is a receipt?

A receipt is a signed, offline-verifiable record of an Enigma-mediated memory lifecycle or boundary event, such as create, import, retrieve, inject, deny, export, tombstone, or delete-request behavior.

### What is the verifier?

The verifier checks exported Enigma proof bundles and receipts. The core launch promise is that users can verify evidence without trusting an Enigma dashboard or AI provider dashboard.

## Install and local use

### What are the requirements?

- Node.js `>=24`.
- A local filesystem path for the Enigma vault bundle.
- No database, package registry account, or cloud credentials for the local CLI/MCP/verifier path after the package or checkout is present.
- Optional Docker for containerized relay/gateway operation.

### How do I install from this repository?

```sh
cd enigma
npm install -g .
enigma --help
enigma-verify --help
enigma-mcp
```

If you do not want a global install:

```sh
cd enigma
node apps/cli/bin/enigma.mjs --help
node apps/verifier/bin/enigma-verify.mjs --help
```

### How will install work after package publication?

After publication:

```sh
npm install -g @enigma-ai/enigma
enigma --help
```

One-off execution after publication:

```sh
npx --yes --package @enigma-ai/enigma enigma --help
npx --yes --package @enigma-ai/enigma enigma-mcp
```

### Can I run Enigma locally without hosted cloud?

Yes, the local CLI/MCP/verifier path can use a local bundle without hosted Enigma cloud services after the package or checkout is present:

```sh
mkdir -p .enigma
enigma init --bundle ./.enigma/bundle.json --subject local-user --display-name "Local user"
# Set ENIGMA_MEMORY_TEXT and ENIGMA_CONTEXT_QUERY locally; keep values out of public support posts.
enigma remember --bundle ./.enigma/bundle.json --text "$ENIGMA_MEMORY_TEXT" --purpose user_memory --tags preference
enigma context --bundle ./.enigma/bundle.json --query "$ENIGMA_CONTEXT_QUERY" --purpose local_context --out ./.enigma/context-pack.json
enigma export --bundle ./.enigma/bundle.json --out ./.enigma/export.json
enigma verify --bundle ./.enigma/export.json
```

Windows PowerShell:

```powershell
New-Item -ItemType Directory -Force .enigma
enigma init --bundle .\.enigma\bundle.json --subject local-user --display-name "Local user"
# Set $env:ENIGMA_MEMORY_TEXT and $env:ENIGMA_CONTEXT_QUERY locally; keep values out of public support posts.
enigma remember --bundle .\.enigma\bundle.json --text "$env:ENIGMA_MEMORY_TEXT" --purpose user_memory --tags preference
enigma context --bundle .\.enigma\bundle.json --query "$env:ENIGMA_CONTEXT_QUERY" --purpose local_context --out .\.enigma\context-pack.json
enigma export --bundle .\.enigma\bundle.json --out .\.enigma\export.json
enigma verify --bundle .\.enigma\export.json
```

### What should I avoid sharing publicly?

Do not paste raw memory plaintext, prompts, transcripts, credentials, private vault contents, seed phrases, private keys, or customer data into public channels. Exported proof and network artifacts should contain commitments, roots, addresses, receipt IDs, and encrypted payloads where appropriate, not raw memory plaintext.

### What if `enigma verify` fails?

First check whether the receipt or export was edited, copied through a formatter, truncated, or mixed with another bundle. A verifier failure may be the correct result if evidence was changed. If a fresh Enigma export fails, ask in support with commands and redacted output only.

## MCP

### How does Enigma connect to AI clients?

Enigma connects through MCP. The client starts `enigma-mcp` over stdio, and Enigma reads/writes the local vault bundle named by `ENIGMA_BUNDLE`.

### How do I run the MCP server?

```sh
ENIGMA_BUNDLE="$HOME/.enigma/bundle.json" enigma-mcp
```

CLI equivalent:

```sh
ENIGMA_BUNDLE="$HOME/.enigma/bundle.json" enigma mcp serve
```

Windows PowerShell:

```powershell
$env:ENIGMA_BUNDLE="$HOME\.enigma\bundle.json"
enigma-mcp
```

### What does generic MCP client configuration look like?

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

### Which MCP tools are exposed?

- `enigma_init`
- `enigma_remember`
- `enigma_search`
- `enigma_context_pack`
- `enigma_delete`
- `enigma_verify_receipts`

MCP resource and prompt:

- Resource: `enigma://passport/summary`
- Prompt: `enigma_standard_memory_prompt`

### Which connector profiles are supported?

- `claude-desktop`
- `cursor`
- `kimi-code`
- `vscode-cline`
- `roo`
- `opencode`
- `generic-mcp`

Connector commands:

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

Disconnect one client without touching unrelated settings:

```sh
enigma disconnect claude-desktop
```

### Does MCP mean Enigma can control what a model remembers internally?

No. MCP lets Enigma provide scoped context and receive tool calls in supported workflows. It does not prove or control provider-internal memory, hidden logs, model weights, screenshots, exports, or human memory.

## Browser extension

### What is the browser extension?

The browser extension is an unpacked Manifest V3 scaffold in:

```text
apps/browser-extension
```

It uses a native messaging host named `com.enigma.native_host`, never writes raw memory to extension sync storage, and requires an explicit user click before inserting Enigma context into supported provider pages.

### What are the development load steps?

1. Register a native messaging host named `com.enigma.native_host` in the browser profile.
2. Point that native host at a local process that can call the Enigma bundle/MCP APIs.
3. Open the browser extension management page.
4. Enable developer mode.
5. Load `enigma/apps/browser-extension` as an unpacked extension.
6. Visit a supported provider page and use the Enigma control.

### Does the browser extension automatically inject context?

No. It requires explicit user approval before inserting context.

### Does the browser extension delete provider-side memories?

No. It cannot delete provider-side memories or force a provider model to forget. It can participate in Enigma-mediated insertion records and receipt metadata where supported.

## Desktop

### Is there a desktop app?

There is a static local desktop scaffold in:

```text
apps/desktop/src/index.html
```

Check that the scaffold is present:

```sh
cd enigma
node --input-type=module -e "import { readFile } from 'node:fs/promises'; const html = await readFile('apps/desktop/src/index.html', 'utf8'); console.log(html.includes('Enigma Desktop Shell') ? 'desktop scaffold present' : 'desktop scaffold missing');"
```

Open it locally:

```sh
cd enigma
python -m http.server 4173
```

Then open:

```text
http://127.0.0.1:4173/apps/desktop/src/index.html
```

If Python is unavailable, open `enigma/apps/desktop/src/index.html` directly from the filesystem.

### Is desktop UI state cryptographic proof?

No. Desktop UI state is operational evidence only. Cryptographic proof comes from Enigma receipts and verifier output.

## Enterprise

### What is the enterprise value proposition?

Enigma lets enterprises keep durable AI memory under customer-controlled or local-first custody, retrieve only scoped context for each provider/model/tool/agent call, and emit receipts that support audit review, deletion workflows, residency governance, eDiscovery, and policy checks.

### Does Enigma guarantee compliance?

No. Enigma provides controls and evidence that can support legal, security, and compliance review. It is not a blanket compliance guarantee or certification by itself.

### What deployment modes exist?

Hosted mode:

- Enigma operator deploys relay/gateway for the tenant.
- Requires deployment credentials, domain, TLS, KMS/secrets, durable storage, monitoring, backups, and incident response.
- Tenant policy controls allowed providers, models, regions, purposes, sensitivities, retention, and legal holds.

BYOC mode:

- Customer deploys relay/gateway in its own cloud, VPC, cluster, or private network.
- Customer controls deployment credentials, KMS, logs, SIEM export, network policy, backups, and data residency.
- Enigma package supplies local services and APIs; the customer supplies infrastructure.

### What does the gateway do?

The gateway evaluates Enigma enterprise policy and signs decisions. It does not call model providers and does not prove provider deletion or model forgetting.

Run the local gateway demo:

```sh
enigma gateway demo
```

Start the local in-memory gateway HTTP server:

```sh
enigma gateway serve --host 127.0.0.1 --port 8797
```

Health and policy:

```sh
curl http://127.0.0.1:8797/health
curl http://127.0.0.1:8797/policy
```

Evaluate a request by address/metadata, not plaintext:

```sh
curl -X POST http://127.0.0.1:8797/gateway/decision \
  -H 'content-type: application/json' \
  --data '{"schema":"enigma.gateway_request.v1","operation":"retrieve","provider":"kimi","model":"kimi-k2","region":"us-east-1","purpose":"support_retrieval","sensitivity":"internal","memory_addr":"addr_committed_memory","memory_id":"mem_allowed","subject_id":"employee_123"}'
```

Export minimized SIEM evidence:

```sh
curl http://127.0.0.1:8797/siem/export
```

### Can Enigma support legal hold and deletion workflows?

Enigma can support policy-controlled workflows and receipt evidence for Enigma-controlled state. It cannot prove closed-provider deletion, hidden backup deletion, model forgetting, or deletion from systems outside Enigma unless those systems provide independent evidence.

### What should enterprise buyers ask in a pilot?

- Where does canonical memory live?
- Who controls keys, policy, logs, and deployment credentials?
- Which providers, models, regions, purposes, and sensitivities are allowed?
- What exactly do receipts prove?
- What does the audit bundle exclude?
- How are support logs redacted?
- Which hosted, BYOC, or on-prem assumptions apply?
- What legal and security reviews are still required?

## Relay, witness, and gateway network

### What is a relay?

A relay is optional infrastructure for storing or routing opaque encrypted records and coordination material. Relays should not receive memory plaintext, prompts, transcripts, or conversation bodies.

Run the local relay demo:

```sh
enigma relay demo
```

Start the local in-memory relay HTTP server:

```sh
enigma relay serve --host 127.0.0.1 --port 8787
```

Health check:

```sh
curl http://127.0.0.1:8787/health
```

Push only an opaque encrypted relay record:

```sh
curl -X POST http://127.0.0.1:8787/relay/push \
  -H 'content-type: application/json' \
  --data '{"capsule_id":"cap_local_1","opaque_encrypted_record":"age1-example-ciphertext-only"}'
```

### What should never go to relay endpoints?

Do not send fields such as `memory`, `plaintext`, `content`, `text`, `prompt`, transcripts, or conversation bodies to relay endpoints.

### What is a witness?

A witness is optional network infrastructure that can attest receipt/proof events, quorum membership, timestamp/slot context, and commitment roots. Witnesses should not access plaintext memory.

### What is a checkpoint?

A checkpoint is an opaque commitment, such as a root or batch reference, that can help establish ordering or anchoring for proof/network operations without publishing raw memory.

### Does Enigma put raw memories on-chain?

No. Raw memories, prompts, transcripts, embeddings, ACLs, and personal metadata should not be stored on Solana. Network/on-chain records, if used, should be limited to opaque roots, commitments, service metadata, or settlement/accountability state after legal and technical review.

### Can I run relay/gateway in Docker?

From the repository root, build a local image without adding a Dockerfile to the repo:

```sh
docker build -t enigma-local -f - . <<'EOF'
FROM node:24-alpine
WORKDIR /app
COPY enigma/package.json ./package.json
COPY enigma/apps ./apps
COPY enigma/packages ./packages
COPY enigma/specs ./specs
ENV NODE_ENV=production
RUN npm install -g .
ENTRYPOINT ["enigma"]
EOF
```

Run relay:

```sh
docker run --rm enigma-local relay demo
docker run --rm -p 8787:8787 enigma-local relay serve --host 0.0.0.0 --port 8787
```

Run gateway:

```sh
docker run --rm enigma-local gateway demo
docker run --rm -p 8797:8797 enigma-local gateway serve --host 0.0.0.0 --port 8797
```

For production containers, replace in-memory state with durable storage, bind TLS at an ingress layer, mount secrets through the platform, and configure logging/metrics. Do not bake vault bundles or private keys into images.

## Solana token and network utility

### Is there a token?

The launch materials describe a planned Solana utility/governance/network-access token path for optional relay/witness/gateway infrastructure. Token materials require legal review and technical signoff before publication.

### What is the token for?

If launched, the token is intended for utility, governance participation, network access, active-service operator bonding, anti-spam/job submission, service settlement, and protocol-level coordination for relay, witness, and gateway services.

### What is the token not for?

It is not company ownership, not a claim on Enigma assets, not ownership of user data, does not include access or compensation promises, and does not grant holder proceeds.

### Does local Enigma require a token?

Local-only memory custody, local vault operations, and offline receipt verification should be explained without requiring token ownership. Token participation concerns optional network coordination paths, not the core local proof loop.

### Can users access Enigma without holding a token?

Recommended draft policy, board/legal-review required: yes for local product paths, developer trials, and enterprise billing. Enterprise customers may pay through fiat/card/invoice or gateway credits while gateways handle any required network settlement in the background, subject to final legal and product design.

### Is operator compensation promised?

No. If operator compensation exists, it should be compensation for verifiable active services under published network rules and actual service demand. It should not be described as a holder benefit or automatic compensation.

### What Solana implementation facts matter?

- SPL tokens use Mint Accounts and Token Accounts.
- Token-2022 adds optional extensions.
- Most extensions must be planned at mint creation.
- MetadataPointer points to metadata.
- TokenMetadata can store name, symbol, URI, update authority, and custom metadata on the mint.

### SPL Token or Token-2022?

Recommended draft posture, board/legal-review required: use standard SPL Token if broad compatibility is the overriding priority. Use Token-2022 only if a specific extension is needed at launch and compatibility tradeoffs are documented. If Token-2022 is used, keep the base utility token minimally extended and plan extensions before mint creation.

### Which Token-2022 extensions are safest to discuss?

MetadataPointer and TokenMetadata may be useful for canonical name, symbol, URI, update authority, and custom metadata if Token-2022 is selected. Extensions that create confusing financial, permissioning, or composability optics should be avoided by default unless legal and technical review approves them.

### What token details still require approval?

Recommended draft values, all board/legal-review required before publication:

| Topic | Recommended draft value |
| --- | --- |
| Token name | Enigma Network Token |
| Symbol | ENIGMA |
| Decimals | 6 or 9; final choice should match wallet/accounting and service-unit needs |
| Program | Standard SPL Token unless Token-2022 extensions are required at launch |
| Supply policy | Fixed maximum supply after initial distribution, with mint authority disabled or transferred to transparent governance/multisig only if future issuance is explicitly approved |
| Metadata | Canonical name, symbol, URI, update authority, and custom metadata published in an authority map |
| Local product access | Local memory and offline verification usable without token ownership |
| Enterprise access | Fiat/card/invoice or gateway-credit path where legally available |
| Token publication | No publication before legal review, authority map, risk disclosures, and technical signoff |

### Can moderators or community members discuss token speculation?

No. Official spaces should not host secondary-market speculation or benefit-promise discussion. Keep discussion on utility, governance, network access, operator requirements, and legal-review status.

### Are there official DM token sales?

No. Official team members and moderators will never DM first to sell tokens, allocate tokens, ask for wallet connection, or request seed phrases/private keys. There are no official DM token sales.

## Governance

### What can governance cover?

Token governance, if launched and legally approved, may cover bounded protocol/network parameters such as:

- Network fee bands.
- Operator registry thresholds.
- Witness quorum parameters.
- Grant and service-subsidy budgets.
- Receipt schema upgrade processes.
- Verifier requirements.
- Deprecation schedules.
- Treasury policy for protocol operations.

### What can governance not cover?

Governance must not control:

- Private user memories.
- Customer vault custody.
- Company ownership or holder proceeds.
- Employee decisions.
- Private customer contracts.
- Retroactive modification of receipts.
- Token transfer or valuation behavior.
- Provider-internal deletion or model behavior.

### Can governance take or read my data?

No governance process should have authority to read private vault contents or take user data. Governance can only affect bounded protocol parameters after the governance design is legally and technically finalized.

### Is governance live at launch?

Recommended draft posture, board/legal-review required: begin with transparent security/admin controls and community signaling while product, operator roles, legal documents, and technical specs mature. Move executable governance only after documentation, audits, emergency procedures, and authority maps are ready.

### What should governance docs include before launch?

- Governance powers and non-powers.
- Proposal process.
- Voting thresholds.
- Timelocks.
- Emergency authority.
- Conflict-of-interest rules.
- Authority map.
- Risk disclosures.
- Legal eligibility restrictions.

## Privacy and data boundaries

### Does Enigma mean nothing ever leaves my device?

No product-wide claim should say that. Enigma has local-only paths, MCP paths, browser/desktop paths, and hosted/BYOC/relay/gateway paths with different boundaries. Always describe the specific deployment mode.

### Does Enigma eliminate all side channels?

No. Enigma can provide evidence for instrumented Enigma-mediated operations and reduce unnecessary disclosure through scoped context and encrypted/committed artifacts. It does not prove complete side-channel absence across providers, browsers, operating systems, networks, humans, or uninstrumented tools.

### Does Enigma store raw memory on public networks?

No. Raw memory plaintext should not be stored in relay records, witness checkpoints, SIEM events, or public proof artifacts. Public/network artifacts should use commitments, roots, receipt IDs, addresses, and encrypted payloads where appropriate.

### Can hashes or commitments leak metadata?

They can. Hashes, commitments, timing, sizes, addresses, and access patterns may reveal metadata. Token/network materials should include metadata-risk disclosures before publication.

### Who owns or controls memory?

It depends on deployment mode. A personal local vault may be user-controlled. An enterprise vault may be tenant/admin/key controlled. A delegated controller may operate under policy. Do not use a single ownership phrase for every deployment mode.

### Can support staff see my memory?

Support should not request raw memory plaintext, private vault contents, credentials, private keys, or customer data. Debugging should use commands, redacted logs, safe receipt metadata, and minimal reproduction steps.

## Deletion and tombstones

### Can Enigma delete my memory?

Enigma can remove or tombstone Enigma-controlled memory from active serving paths according to the relevant vault and policy behavior. Receipts can show Enigma-mediated delete-request, tombstone, or serving-boundary events.

### Does Enigma prove a provider deleted my data?

No. Enigma cannot prove that a closed provider deleted hidden copies, logs, backups, provider-native memory, screenshots, exports, or model weights unless that provider supplies independent evidence that can be verified.

### Does Enigma make a model forget?

No. Do not claim model forgetting, semantic forgetting, or weight-level removal. Enigma can control its own vault state and scoped context injection; it cannot prove internal model state changed.

### What should we say instead of “delete everywhere”?

Use:

> Enigma can emit receipts for Enigma-controlled tombstone/delete-request events and show whether Enigma serving paths continue to include a memory.

Do not use:

> Deleted from every provider, erased from the model, forgotten everywhere, or no trace remains.

## Legal-risk boundaries

### What legal review is required?

Before publication, token, governance, operator, eligibility, sanctions, tax, treasury, marketing-claims, privacy, and terms materials require legal review. Enterprise security/compliance claims require review by qualified internal owners and, where needed, outside counsel.

### Can community moderators give legal, tax, or financial advice?

No. Moderators should provide official boundary copy only and escalate legal/tax/eligibility questions to the designated owner.

### Can Enigma claim regulatory compliance?

Only if a specific certification, audit, or legal determination exists and has been approved for publication. Otherwise say Enigma supports governance and audit workflows with evidence.

### Can Enigma promise network service availability?

No. Network services may change, pause, fail, or be discontinued. Operator participation, service fees, and governance parameters require published rules and legal/technical review.

### What risk disclosures should token/network materials include?

- Digital-token legal treatment varies by jurisdiction.
- Network services can fail, change, pause, or be discontinued.
- Operator bonds can be slashed under published rules.
- Governance can be captured or fail to reach quorum.
- Solana congestion, outages, program bugs, wallet incompatibility, or Token-2022 support gaps can affect usage.
- Private keys, multisigs, gateways, relays, bridges, and off-chain systems create operational risk.
- Hashes and commitments can leak metadata even when plaintext is not on-chain.
- Token transfers or access may be restricted by law, terms, sanctions compliance, or security controls.

## Objections

### “This sounds like just another AI wrapper.”

Enigma is not a chatbot wrapper. The product surface is memory custody, scoped retrieval, MCP connectivity, receipts, verifier output, browser/desktop integration, enterprise gateway policy, and optional relay/witness/gateway infrastructure.

### “Why not just use ChatGPT or Claude memory?”

Provider-native memory can be useful, but it is provider-specific and typically not a portable proof layer. Enigma is designed to keep canonical memory outside any single provider and provide Enigma-mediated receipt evidence.

### “Why not just use a vector DB?”

A vector DB can store and retrieve embeddings, but it does not by itself provide a Memory Passport, scoped context boundary, signed lifecycle receipts, offline verifier, MCP installation path, browser/desktop integration, and enterprise/network proof surfaces.

### “Why not just use agent-framework state?”

Agent-framework state is useful for scratchpads, checkpoints, tool outputs, and orchestration. It is usually specific to one runtime or app. Enigma's role is durable memory custody and proof: portable passports, scoped context packs, signed lifecycle receipts, and verifier output that can outlive one framework.

### “Why not just use observability logs?”

Logs and traces are necessary for operations, but they are not usually the canonical memory vault. They can also contain too much plaintext and often require trust in a live dashboard. Enigma should export minimized receipt and policy evidence into SIEM/eDiscovery systems without turning raw traces into the durable memory system of record.

### “Why not just use decentralized storage?”

Decentralized storage can help with encrypted object availability and public commitments, but it does not decide purpose, consent, enterprise policy, or scoped context. Replicating memory also increases privacy and metadata risk. Enigma's network posture is opaque records, roots, commitments, and accountability state—not raw memory plaintext on public networks.

### “Why not just use KMS, BYOK, or a model gateway?”

KMS and gateways are enterprise primitives. KMS protects keys; gateways can route requests and enforce allowlists. They do not by themselves define Memory Passports, Enigma-controlled deletion/tombstone receipts, scoped memory context, or offline verifier bundles. Enigma should integrate with them and add memory-specific custody and proof semantics.

### “Why not just use a hardware wallet?”

Hardware wallets and secure elements can protect signing keys or support explicit approval ceremonies. They do not decide which memory is scoped for a provider call, prove active-state deletion, enforce enterprise model/region/purpose policy, or prove a provider forgot anything. Enigma can use hardware for identity, signing, and local verification support without claiming tamper-proof hardware.

### “Why do I need receipts?”

Receipts create portable evidence. They help users and organizations answer what Enigma did: what was created, retrieved, denied, injected, exported, tombstoned, or verified under a stated boundary. They also make failure and tampering visible.

### “Can receipts be faked?”

A copied text claim can be faked; a valid receipt must pass verification under the expected schema, signatures, ordering, and bundle context. If a receipt is edited or mismatched, the verifier should reject it.

### “Does offline verification mean I never need to trust anyone?”

No. Offline verification reduces reliance on dashboards and services for checking Enigma receipts. It does not eliminate all trust in hardware, operating systems, dependencies, original data entry, policy design, or external providers.

### “Why use Solana at all?”

Solana is a potential coordination layer for optional network utility: service settlement, operator bonding, gateway/witness/relay accountability, governance, and opaque checkpoint anchoring. Local Enigma memory and offline receipt verification should remain useful without requiring chain access.

### “Will raw memories go on Solana?”

No. Raw memories should not go on-chain. Network records should use opaque commitments, roots, service metadata, settlement/accountability state, and encrypted payload references where appropriate.

### “Is the token company ownership?”

No. Token ownership is not ownership of Enigma, not ownership of user data, not a claim on company assets, and does not grant holder proceeds.

### “Is operator compensation promised?”

No. Avoid benefit-promise language. Any operator compensation, if legally and technically approved, should be for verifiable active services under published rules and actual demand.

### “Can governance change my private memory?”

No governance design should allow token voters to read, seize, or rewrite private memories. Governance should be bounded to protocol/network parameters, not private data or company operations.

### “Can Enigma freeze tokens?”

That depends on final mint/program authority design. Recommended draft posture, board/legal-review required: avoid surprising transfer controls on the base token unless legal/security requirements demand them, disclose all authorities, use multisig/timelock controls where applicable, and publish a sunset/renunciation path when operationally safe.

### “Can Enigma freeze or delete my vault?”

Local vault behavior depends on user-controlled files and keys. Hosted or enterprise deployments depend on tenant policy, admin controls, and legal obligations. Do not generalize across deployment modes.

### “What if a provider changes its export format or blocks an integration?”

Enigma should preserve source caveats and treat imports as candidates until written through an Enigma vault. Provider changes may affect import completeness, browser workflows, or connector behavior. Enigma cannot guarantee third-party provider support.

### “What if MCP clients change?”

Connector profiles may require updates as clients change config paths, schemas, or behavior. Use `enigma doctor`, connector docs, and public support channels to identify drift.

### “Is the browser extension safe?”

The extension requires explicit user approval before insertion and avoids raw memory in extension sync storage. Users should still review what context they insert into provider pages and understand that external provider pages have their own policies and risks.

### “Can enterprises use this with zero retention providers?”

Enigma can help keep durable memory outside providers and send only scoped context into provider calls. Whether a provider offers zero/low retention and whether that satisfies enterprise requirements depends on the provider contract, deployment mode, and legal/security review.

### “Will Enigma certify us compliant?”

No. Enigma can provide evidence, controls, and architecture patterns that support audits and governance review. Certification or compliance status requires separate review and approval.

### “What if I lose my local bundle?”

A local bundle is local state. Users should follow backup and key-management guidance when published. Enigma should not imply it can recover local vault material that the user or tenant has lost without a recovery mechanism.

### “What if someone DMs me about special token access?”

Treat it as unauthorized. Official team members and moderators will never DM first about token sales, special token access, wallet connection, seed phrases/private keys, or paid support. Use pinned links only and report the account to moderators.

### “Can I share my receipt publicly?”

Only if it contains no private memory plaintext, credentials, customer data, or sensitive metadata. When in doubt, share a redacted verifier screenshot or a sample receipt bundle designed for public use.

### “What is the best first action?”

Run the local proof loop, then connect one MCP-capable client:

```sh
enigma init --bundle ./.enigma/bundle.json --subject local-user --display-name "Local user"
# Set ENIGMA_MEMORY_TEXT locally; keep the value out of public support posts.
enigma remember --bundle ./.enigma/bundle.json --text "$ENIGMA_MEMORY_TEXT" --purpose user_memory --tags preference
enigma export --bundle ./.enigma/bundle.json --out ./.enigma/export.json
enigma verify --bundle ./.enigma/export.json
```

Then:

```sh
enigma doctor
enigma install --bundle "$HOME/.enigma/bundle.json"
enigma connect generic-mcp --bundle "$HOME/.enigma/bundle.json"
```

Note: use the first full quickstart command set above for context-pack generation; keep private memory content out of public support posts.
