# Enigma demo scripts

These scripts are for live launch walkthroughs. They use current Enigma CLI and docs commands. They do not describe hosted cloud as live; every hosted or token/network item is framed as local demo, devnet rehearsal, or board/legal-review-required launch planning.

Proof boundary to say aloud in every demo: Enigma verifies Enigma-mediated memory, receipt, checkpoint, relay, witness, and gateway operations. It does not prove factual truth, model intent, provider deletion, semantic forgetting, or complete side-channel absence.

## Demo environment

Start from a local checkout or a published package install.

Repository install:

```sh
cd enigma
npm install -g .
```

Future published package install:

```sh
npm install -g @enigma-ai/enigma
```

Use a clean demo bundle:

```sh
mkdir -p .enigma
```

When a command prints generated ids, receipt ids, roots, signatures, or timestamps, do not promise exact values. The expected output sections below name stable fields and predicates the presenter should confirm live.

## 1. Five-minute demo: local Memory Passport and offline proof

Audience: first-time users, press, launch livestream, community members.

Goal: show Enigma is immediately usable as local-first AI memory with offline-verifiable receipts.

### Talk track

1. "AI memory should not be trapped in one model provider. Enigma gives the user a local canonical Memory Passport."
2. "We will create one local memory, compile a scoped context pack, export the proof bundle, and verify it offline."
3. "The verifier proves Enigma-controlled lifecycle receipts, not external provider deletion or model forgetting."

### Commands

```sh
mkdir -p .enigma
enigma init --bundle ./.enigma/bundle.json --subject demo-user --display-name "Demo User"
enigma remember --bundle ./.enigma/bundle.json --text "Prefers short implementation plans with security caveats." --purpose user_memory --tags preference,demo
enigma context --bundle ./.enigma/bundle.json --query "implementation plans" --purpose demo_context --out ./.enigma/context-pack.json
enigma export --bundle ./.enigma/bundle.json --out ./.enigma/export.json
enigma verify --bundle ./.enigma/export.json
```

### Expected proof outputs

`enigma init` should print JSON containing:

```json
{
  "ok": true,
  "schema": "enigma.vault_bundle.v1",
  "subject_id": "demo-user"
}
```

`enigma remember` should print JSON with `ok: true`, a `memory_addr` field containing the committed memory address, and a `receipt_id` field containing the receipt id for the write.

`enigma context` should print a context pack and write `./.enigma/context-pack.json`. Confirm that the pack is scoped to the query and purpose; do not paste raw private memory into public proof artifacts.

`enigma export` should print JSON with `ok: true`, an `export` path that resolves to `./.enigma/export.json`, and a `receipt_count` value greater than zero.

`enigma verify` should print JSON with `ok: true`, `schema: "enigma.verification_report.v1"`, `receipt_count` greater than zero, and `errors: []`.

### Close

"That is the core Enigma loop: local vault, scoped retrieval, receipt export, offline verification. The proof is about the Enigma-controlled Memory Passport and receipts. Provider-native memory remains cache only."

## 2. Fifteen-minute demo: MCP, connectors, local proof, relay, gateway

Audience: developers, AI power users, MCP client users, technical media.

Goal: show that Enigma installs once, connects to common MCP clients, exposes tools, verifies receipts, and has local relay/gateway infrastructure demos.

### Segment A: install and doctor

Talk track:

"Enigma ships as an installable package with CLI, verifier, MCP server, connector profiles, relay, and gateway bins. The local path does not require hosted Enigma cloud."

Commands:

```sh
enigma --help
enigma doctor
enigma install --bundle "$HOME/.enigma/bundle.json" --out ./enigma-mcp-snippets.json
```

Expected output:

- `enigma --help` prints `usage: "enigma <command> [options]"` and command names.
- `enigma doctor` prints `ok`, Node engine status, package-bin status, schema count, `mcp_command_name: "enigma-mcp"`, and connector status.
- `enigma install` prints `ok: true`, `mcp_command: "enigma-mcp"`, connector profiles, and `mcp_config_snippets`.

### Segment B: MCP handshake

Talk track:

"Every supported client starts the same local MCP server and points it at the user's bundle through `ENIGMA_BUNDLE`."

Command:

```sh
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"manual","version":"0"}}}\n{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n{"jsonrpc":"2.0","id":3,"method":"resources/list","params":{}}\n{"jsonrpc":"2.0","id":4,"method":"prompts/list","params":{}}\n' | ENIGMA_BUNDLE="$HOME/.enigma/bundle.json" enigma-mcp
```

Expected output:

- `initialize` returns an MCP server response.
- `tools/list` includes `enigma_init`, `enigma_remember`, `enigma_search`, `enigma_context_pack`, `enigma_delete`, and `enigma_verify_receipts`.
- `resources/list` includes `enigma://passport/summary`.
- `prompts/list` includes `enigma_standard_memory_prompt`.

### Segment C: supported connector commands

Talk track:

"These connector profiles cover Claude Desktop, Cursor, Kimi Code, Cline, Roo, OpenCode, and generic MCP clients. The command is always local: `enigma-mcp`."

Commands:

```sh
enigma connect claude-desktop --bundle "$HOME/.enigma/bundle.json"
enigma connect cursor --bundle "$HOME/.enigma/bundle.json"
enigma connect kimi-code --bundle "$HOME/.enigma/bundle.json"
enigma connect vscode-cline --bundle "$HOME/.enigma/bundle.json"
enigma connect roo --bundle "$HOME/.enigma/bundle.json"
enigma connect opencode --bundle "$HOME/.enigma/bundle.json"
enigma connect generic-mcp --bundle "$HOME/.enigma/bundle.json"
```

Expected output:

- Each command returns an `ok` result for the named connector or a precise config-path error if the client path cannot be written on the present machine.
- When a client config is written, the resulting MCP entry uses `command: "enigma-mcp"` and `env.ENIGMA_BUNDLE` set to the absolute bundle path.
- Restart or reload the client after changing its config.

### Segment D: local receipt proof

Commands:

```sh
enigma remember --bundle "$HOME/.enigma/bundle.json" --text "Uses Enigma through MCP-capable clients." --purpose mcp_demo --tags connector
enigma export --bundle "$HOME/.enigma/bundle.json" --out ./enigma-mcp-demo-export.json
enigma verify --bundle ./enigma-mcp-demo-export.json
```

Expected proof output:

- `enigma remember` returns `ok: true`, `memory_addr`, and `receipt_id`.
- `enigma export` returns `ok: true` and non-zero `receipt_count`.
- `enigma verify` returns `ok: true`, `schema: "enigma.verification_report.v1"`, and `errors: []`.

### Segment E: relay proof path

Commands:

```sh
enigma relay demo
```

Expected proof output:

```json
{
  "ok": true,
  "pushed_opaque_record": true,
  "rejected_plaintext_record": true,
  "witness_checkpoint_verification_ok": true,
  "pairing_challenge_ok": true,
  "pairing_complete_ok": true
}
```

Explain:

"The relay demo shows encrypted relay and witness mechanics. It stores opaque encrypted records and rejects plaintext-looking memory fields. Raw memories do not belong in relay payloads."

### Segment F: gateway proof path

Commands:

```sh
enigma gateway demo
```

Expected proof output:

```json
{
  "ok": true,
  "allowed_retrieval": true,
  "denied_disallowed_region": true,
  "denied_legal_hold_delete": true,
  "signed_decision_verification_ok": true,
  "siem_event_plaintext_minimized": true
}
```

Explain:

"The gateway demo evaluates policy and signs decisions. It does not call providers. It proves the decision followed a specific Enigma policy boundary."

### Close

"The 15-minute demo shows the full local adoption path: install, MCP, connectors, receipts, verifier, relay, and gateway. Hosted operation is a deployment mode, not something implied by local install."

## 3. Enterprise demo: auditable memory control plane

Audience: CISO, security engineering, legal, compliance, AI platform, procurement.

Goal: show how Enigma supports enterprise AI memory governance: customer-controlled vault state, explicit policy decisions, signed decisions, plaintext-minimized SIEM export, and clear proof boundaries.

### Talk track

1. "Enterprises want durable AI memory, but durable memory should not mean every model provider becomes the system of record."
2. "Enigma keeps the canonical memory and evidence inside Enigma-controlled or customer-controlled infrastructure."
3. "The gateway evaluates provider, model, region, purpose, sensitivity, legal-hold, and policy constraints before context can be retrieved."
4. "Receipts and gateway decisions support audits. They do not replace provider logs or prove provider internals."

### Commands: local vault and receipt evidence

```sh
mkdir -p .enigma
enigma init --bundle ./.enigma/enterprise-bundle.json --subject employee_123 --display-name "Enterprise Demo User"
enigma remember --bundle ./.enigma/enterprise-bundle.json --text "Customer support replies must use approved region and cite policy caveats." --purpose enterprise_memory --tags support,policy
enigma context --bundle ./.enigma/enterprise-bundle.json --query "support replies" --purpose support_retrieval --out ./.enigma/enterprise-context-pack.json
enigma export --bundle ./.enigma/enterprise-bundle.json --out ./.enigma/enterprise-export.json
enigma verify --bundle ./.enigma/enterprise-export.json
```

Expected proof output:

- The export verifies with `ok: true`, `schema: "enigma.verification_report.v1"`, non-zero `receipt_count`, and `errors: []`.
- The verifier report supports the statement: "This Enigma-controlled bundle contains an ordered, signed receipt chain that verifies offline."

### Commands: enterprise policy gateway demo

```sh
enigma gateway demo
```

Expected proof output fields:

- `ok: true`
- `allowed_retrieval: true`
- `denied_disallowed_region: true`
- `denied_legal_hold_delete: true`
- `signed_decision_verification_ok: true`
- `siem_event_plaintext_minimized: true`
- `policy.policy_hash` or equivalent policy hash inside the policy object
- `gateway_decision.signature`
- `verification.ok: true`

### Commands: local gateway server decision path

Start the server:

```sh
enigma gateway serve --host 127.0.0.1 --port 8797
```

In another terminal, check health and policy:

```sh
curl http://127.0.0.1:8797/health
curl http://127.0.0.1:8797/policy
```

Submit an allowed decision request:

```sh
curl -X POST http://127.0.0.1:8797/gateway/decision \
  -H 'content-type: application/json' \
  --data '{"schema":"enigma.gateway_request.v1","operation":"retrieve","provider":"kimi","model":"kimi-k2","region":"us-east-1","purpose":"support_retrieval","sensitivity":"internal","memory_addr":"addr_committed_memory","memory_id":"mem_allowed","subject_id":"employee_123"}'
```

Export SIEM evidence:

```sh
curl http://127.0.0.1:8797/siem/export
```

Expected gateway proof output:

- Health returns gateway identity and policy metadata.
- Policy returns the active default-deny policy.
- The decision response includes a signed decision and local verification result.
- SIEM export returns plaintext-minimized events. It should not include raw memory plaintext, prompt bodies, transcripts, or completion text.

### Presenter notes for hard questions

Question: "Does this prove Claude, ChatGPT, Kimi, or another provider deleted its memory?"

Answer: "No. Enigma proves Enigma-mediated events and Enigma-controlled state. Provider deletion or hidden cache behavior requires independent provider evidence. Enigma's architecture treats provider-native memory as cache only."

Question: "Does this make us compliant?"

Answer: "No single tool makes an organization compliant. Enigma provides evidence and controls that can support audits, retention workflows, residency policy, and governance review. Certification claims require separate audit and legal approval."

Question: "Can we run this without Enigma-hosted cloud?"

Answer: "The local CLI, MCP, verifier, relay demo, and gateway demo work locally. Production hosted or BYOC operation requires deployment credentials, durable storage, KMS/secrets, TLS, monitoring, backups, and incident response."

### Close

"The enterprise value is not a broad promise that every provider forgets. It is a controlled memory plane with scoped retrieval, policy decisions, signed evidence, and explicit boundaries."

## 4. Community token/network demo: utility, governance, network access

Audience: community, operators, developers, crypto-native ecosystem.

Goal: explain optional relay/witness/gateway network mechanics and a legally cautious Solana utility-token plan without financial-upside language.

Required legal statement before presenting: The ENIGMA token plan is board/legal-review required before publication. Token ownership is not equity, not a revenue share, not a claim on company assets or user data, and not marketed as a financial-upside product. Local Enigma memory and offline receipt verification must remain usable without token ownership wherever possible.

### Talk track

1. "Enigma is product-first: local Memory Passport, MCP installability, and offline-verifiable receipts."
2. "The optional network layer coordinates relay, witness, and gateway services for encrypted relay, opaque checkpoint witnessing, service settlement, operator bonding, and bounded governance."
3. "Solana is considered for utility coordination. Raw memory does not go on-chain; only compact commitments, roots, receipt ids, operator ids, service metadata, and governance instructions may be used."
4. "Legal review is required before any public token launch, distribution, eligibility policy, mint configuration, governance authority, or token page publication."

### Commands: product proof first

```sh
enigma init --bundle ./.enigma/community-bundle.json --subject community-demo --display-name "Community Demo"
enigma remember --bundle ./.enigma/community-bundle.json --text "Community members can verify Enigma receipts offline." --purpose community_demo --tags proof,network
enigma export --bundle ./.enigma/community-bundle.json --out ./.enigma/community-export.json
enigma verify --bundle ./.enigma/community-export.json
```

Expected proof output:

- `enigma remember` prints `ok: true`, `memory_addr`, and `receipt_id`.
- `enigma verify` prints `ok: true`, `schema: "enigma.verification_report.v1"`, non-zero `receipt_count`, and `errors: []`.

Say:

"This works before any token discussion. Offline verification is a credibility layer, not a paid feature gate in this demo."

### Commands: relay/witness role proof

```sh
enigma relay demo
```

Expected proof output:

- `ok: true`
- `pushed_opaque_record: true`
- `rejected_plaintext_record: true`
- `witness_checkpoint_verification_ok: true`
- `pairing_challenge_ok: true`
- `pairing_complete_ok: true`
- `witness.witness_checkpoint_id`
- `witness.witness_hash`
- `node.node_id`
- `node.trust_descriptor`

Say:

"A relay handles opaque encrypted records. A witness attests compact roots and checkpoint metadata. Neither role needs plaintext memory."

### Commands: gateway role proof

```sh
enigma gateway demo
```

Expected proof output:

- `ok: true`
- `allowed_retrieval: true`
- `denied_disallowed_region: true`
- `denied_legal_hold_delete: true`
- `signed_decision_verification_ok: true`
- `siem_event_plaintext_minimized: true`
- `gateway_decision.signature`
- `verification.ok: true`

Say:

"A gateway evaluates access and policy. A future network utility path can meter gateway requests, witness jobs, relay writes, and operator bonds. The demo does not claim a live hosted token network."

### Solana utility explanation

Use these facts without overclaiming:

- SPL tokens use Mint Accounts and Token Accounts.
- Token-2022 adds optional extensions.
- Most Token-2022 extensions must be planned at mint creation.
- MetadataPointer can point to metadata.
- TokenMetadata can store name, symbol, URI, update authority, and custom metadata on the mint.

Recommended draft token configuration for board/legal review:

| Item | Recommended draft value | Review status |
| --- | --- | --- |
| Token role | Utility, governance participation, operator bonding, network access, and service settlement for optional relay/witness/gateway infrastructure | Board/legal review required |
| Token name | Enigma | Board/legal review required |
| Symbol | ENIGMA | Board/legal review required |
| Chain | Solana | Board/legal review required |
| Token program | Standard SPL Token for maximum compatibility unless counsel and engineering require Token-2022 metadata/extensions at launch | Board/legal/engineering review required |
| Token-2022 extensions if chosen | MetadataPointer and TokenMetadata only for canonical name, symbol, URI, update authority, and custom metadata | Board/legal/engineering review required |
| Fixed supply posture | Fixed maximum supply after initial distribution setup, with mint authority disabled or moved to transparent multisig/governance only under published conditions | Board/legal review required |
| Local product access | Local vault, MCP, and offline verifier usable without holding the token | Board/legal review required |
| On-chain memory policy | No raw memories, prompts, transcripts, embeddings, ACL bodies, or personal data on-chain; commitments and opaque roots only | Board/legal/security review required |
| Operator bonding | Active-service bond for relays, witnesses, and gateways; not holder-based staking | Board/legal review required |
| Operator compensation | Fees or service subsidies for verifiable work under published rules; not guaranteed compensation | Board/legal review required |
| Governance powers | Fee bands, operator thresholds, witness quorum parameters, grants/service budgets, schema upgrade process, deprecation schedules | Board/legal review required |
| Governance non-powers | No company equity, dividends, employee control, private user data access, retroactive receipt modification, or promised token-market outcome | Board/legal review required |

### Safe token/network wording

Say:

"The planned ENIGMA token is for utility, governance participation, network access, and active-service accountability in optional relay/witness/gateway infrastructure. Local Enigma remains useful without requiring token speculation. Legal review is required before publication."

Do not say financial-upside, ownership, or provider-deletion claims. Use only the approved utility/governance/network-access wording above.

### Close

"The community network is about useful work: relay encrypted capsules, witness opaque roots, operate gateways, verify receipts, build connectors, and govern bounded protocol parameters. The product demo comes first; token materials remain utility-only and legally reviewed."

## 5. Backup demo: verifier-only trust loop

Audience: security skeptics or users with only a sample export.

Goal: show that verification is a standalone action.

Commands:

```sh
enigma init --bundle ./.enigma/verifier-demo-bundle.json --subject verifier-demo --display-name "Verifier Demo"
enigma remember --bundle ./.enigma/verifier-demo-bundle.json --text "Verifier demo memory." --purpose verifier_demo
enigma export --bundle ./.enigma/verifier-demo-bundle.json --out ./.enigma/verifier-demo-export.json
enigma-verify ./.enigma/verifier-demo-export.json
enigma verify --bundle ./.enigma/verifier-demo-export.json
```

Expected proof output:

- Both verifier entry points print `schema: "enigma.verification_report.v1"`.
- Both verifier entry points return `ok: true` and `errors: []` for an untampered export.

Talk track:

"You can verify an exported bundle using the standalone verifier bin or the Enigma CLI. Verification does not require a model provider or hosted Enigma cloud."

## 6. Demo readiness checklist

Before presenting publicly:

- [ ] Use a fresh demo bundle with non-sensitive demo text.
- [ ] Confirm Node.js `>=24` on the demo machine.
- [ ] Confirm `enigma --help` prints the command list.
- [ ] Confirm `enigma doctor` prints package, schema, and connector status.
- [ ] Confirm MCP handshake lists tools, resource, and prompt.
- [ ] Confirm `enigma verify` returns `ok: true` for the demo export.
- [ ] Confirm `enigma relay demo` returns `ok: true` and plaintext rejection.
- [ ] Confirm `enigma gateway demo` returns `ok: true`, signed decision verification, and plaintext-minimized SIEM output.
- [ ] Keep a plain-language proof-boundary sentence on the speaker notes.
- [ ] Keep the token non-equity and no-financial-upside statement on the speaker notes for community/network demos.
- [ ] Do not show private local bundle content, private keys, real customer memory, deployment credentials, or unreleased token addresses.

## 7. One-sentence proof boundaries for presenters

Use these exactly when the audience asks what Enigma proves:

- User demo: "This proves the local Enigma bundle has signed, ordered receipts for Enigma-mediated memory operations; it does not prove provider deletion or model forgetting."
- Developer demo: "This proves the MCP server can expose local Enigma tools and the exported receipt bundle verifies offline; it does not prove anything about uninstrumented provider internals."
- Enterprise demo: "This proves an Enigma gateway decision followed a stated Enigma policy and verifies with Enigma keys; it does not replace provider logs or legal/compliance review."
- Community token/network demo: "This proves local relay, witness, and gateway mechanics for opaque records and policy decisions; it does not represent a live token network or any financial-upside promise."
