# Memory Controller primitive layer

Enigma's Memory Controller is the local boundary that decides when AI apps may use memory. It does not try to be another assistant memory store. It wraps a local Memory Drive with consent grants, recall veto decisions, private memory bubbles, Memory Weather, and public-safe receipts so memory is useful only when the user allows it at the moment it matters.

This direction comes from the Workflowz research pass: current assistant memory products mostly focus on what was stored and what can be recalled. Enigma should differentiate at the control point: just-in-time consent, recall-time checks, temporary private scopes, and a dashboard that explains memory readiness without exposing memory.

## What users see

Consumers see the Memory Controller as a small set of plain states, not as a protocol. Memory Weather says whether the local Memory Drive, connected apps, privacy guardrails, and review queue are ready, then gives one primary action such as `Review held-back memory` or `Fix app connection`.

App permissions appear only when a connected app asks Enigma to recall memory for a specific purpose. The prompt explains the app, the purpose, and whether Enigma believes the result is safe to share. The user can approve the recall, keep the memory not shared, or open a private memory bubble for temporary context that should not become durable memory by default.

Recall approval happens before Enigma shares context with the app. A `not shared` result means Enigma withheld local memory from that Enigma-mediated recall; it does not mean the provider deleted logs, removed provider-native memory, or forgot anything.

## What it controls

| Primitive | Product meaning | Technical boundary | Public-safe artifact |
| --- | --- | --- | --- |
| Consent grant | An app asks for a narrow memory use when it needs it, not during first launch. | Scoped grant for an Enigma-mediated connector, with purpose, expiry, revocation, and policy refs. | Grant ref, scope label, expiry bucket, connector label, policy ref, receipt ref. |
| Recall veto | Enigma can withhold memory before context is shared with an app. | Deterministic allow/withhold decision at recall time, using current grant state, bubble state, risk flags, and owner policy. | Decision ref, reason code, policy ref, time bucket, withheld count, receipt ref. |
| Private memory bubble | A temporary memory space for sensitive, experimental, or short-lived context. | Local scope with clear entry, exit, expiry, and no default promotion into durable memory. | Bubble ref, status label, expiry bucket, item count, promotion count, receipt ref. |
| Memory Weather | A plain-language control panel for memory readiness. | Public-safe projection of vault state, connector readiness, held-back recalls, review needs, and proof/export status. | Status label, one next action, counts, support code, proof refs, redaction status. |
| Public-safe guard | A final check that Memory Controller details are safe to show, export, or return to an app. | Rejects artifacts that include raw memory, prompts, transcripts, provider output, local paths, secrets, identifiers, or unsupported claims. | Pass/fail label, support code, forbidden-field count, public hash, receipt ref. |

## Technical contract

The primitive layer is deterministic and fail-closed. A missing grant, unknown connector, expired bubble, unsafe export scan, or unavailable policy result becomes `withhold`, `needs_review`, or `blocked`; it never silently falls back to sharing memory.
Consent grant operation lists and memory-zone lists are canonicalized as scoped sets. Reordering the same approved operations or zones does not create a broader permission, and verification still checks the exact app, operation, memory zone, expiry, revocation state, and public-safe shape before a recall can proceed.

Public schemas use draft 2020-12 and stable `enigma.<snake_case>.v1` identifiers for the public-safe shape of each primitive:

- `enigma.memory_controller_grant.v1`
- `enigma.recall_veto_decision.v1`
- `enigma.private_memory_bubble.v1`
- `enigma.memory_weather_report.v1`

Those schemas describe receipts and summaries only. They do not serialize raw memory, prompts, transcripts, provider payloads, private paths, secrets, or account material.

The implementation exports `createConsentGrant`, `verifyConsentGrant`, `createRecallVetoDecision`, `createPrivateMemoryBubble`, `closePrivateMemoryBubble`, `createMemoryWeatherReport`, and `assertMemoryControllerPublicSafe`. Consumer and MCP surfaces should treat `assertMemoryControllerPublicSafe` as the last guard before any artifact is displayed, exported, or returned to a client.

## MCP tools

MCP clients use the same primitives through public-safe tools. Each tool returns refs, labels, counts, booleans, and reason codes only; it must fail closed rather than return raw memory, prompts, transcripts, provider payloads, local paths, or secrets.

MCP-compatible clients can inspect tool annotations and schema descriptions during Claude/Cursor setup. Enigma marks Weather and Recall checks as read-only/idempotent, marks Consent Grant and Private Bubble as state-affecting, marks Private Bubble close/discard as potentially destructive, marks all four as local-only (`openWorldHint: false`), and repeats opaque-ref-only input guidance so clients that surface these hints can show safer labels before a user wires the connector.

| Tool | Consumer meaning | Public-safe result |
| --- | --- | --- |
| `enigma_memory_weather` | Show Memory Weather for the local setup. | Readiness label, one next action, review counts, connector labels, support code, and receipt/proof refs. |
| `enigma_consent_grant` | Record a narrow app permission when an app asks to use memory. | Grant ref, app ref, scope label, purpose ref, expiry bucket, revocation state, policy ref, and receipt refs. |
| `enigma_recall_veto` | Decide whether a recall is approved, needs approval, or is not shared before context leaves Enigma. | Decision `allow`, `ask`, or `deny`; reason codes; candidate counts; `safe_to_share`; policy/proof/receipt refs. |
| `enigma_private_bubble` | Open or close a temporary private memory bubble. | Bubble ref, status label, expiry bucket, item/promotion counts, close outcome, and receipt refs. |

`enigma_context_pack` and the CLI `enigma context` command can require a matching consent grant before returning context. When `require_grant` / `--require-grant` is set and no active grant matches the app ref, purpose ref, operation, memory-zone ref, expiry, and policy boundary, Enigma returns `enigma.context_pack_recall_blocked.v1` with a recall veto and `context_pack_returned:false` instead of compiling or printing context.

For CLI-only smoke tests, create a public-safe grant with `enigma controller grant --app-ref ref:app:<id> --purpose-ref ref:purpose:cli_context --memory-zone-ref ref:zone:default --out grant.json`, then pass it to `enigma context --require-grant --grant-file grant.json`. The grant file contains opaque refs and receipt/proof refs only; it is not proof that a provider deleted, forgot, or withheld anything outside Enigma.

## Frictionless launch behavior

Memory Controller should reduce launch friction, not add a permission wall.

- No upfront permission wall: first run creates or detects the Memory Drive and connects an app; broad consent prompts wait until a real memory use needs them.
- Just-in-time prompts: a consent grant is requested at the point of use with one clear purpose, one primary action, and one safe escape hatch.
- One action per state: Memory Weather shows the single next action for ready, blocked, needs-review, offline, revoked, expired, or unsafe-export states.
- Advanced proof drawer: schema ids, receipt refs, roots, verifier status, and redaction details stay behind an advanced drawer and never block the default path.
- Consent travels with data: every recall check reads current grant and bubble state; stale or revoked permission fails closed.

## Claim boundary

Enigma controls local vault state, Enigma-mediated connector permissions, recall/withhold decisions before Enigma shares context, local proof summaries, and public-safe receipts.

Enigma does not claim provider deletion, provider-native memory removal, model forgetting, hidden cache removal, provider log deletion, provider non-use, compliance certification, benchmark superiority, hosted SaaS or BYOC readiness, chain submission, legal conclusions, or patent conclusions from these primitives.

## Public-safe artifacts

Generated public artifacts may include only safe projections:

- schema ids and receipt refs;
- connector labels and readiness states;
- grant refs, policy refs, decision refs, and revocation refs;
- time buckets, expiry buckets, counts, roots, hashes, and verifier status;
- Memory Weather labels, support codes, and redaction scan status.

They must not include raw memory, prompts, transcripts, completions, embeddings, local absolute paths, credentials, tokens, private keys, account IDs, customer identifiers, provider responses, signing secrets, or realistic private examples.

## Why this is different from normal assistant memory

Normal assistant memory asks, "What should this assistant remember?" The Memory Controller asks, "Should this memory be available right now, for this app, under this grant, and should anything be withheld?"

That difference matters because memory risk appears at recall time as much as at storage time. A stored memory can become inappropriate when a grant expires, an app changes, a private bubble is still active, or a recall would cross a boundary the user did not approve. Enigma's primitive layer makes those moments explicit, local, reversible, and reviewable without exposing the memory itself.
