# Memory Controller primitive layer

Enigma's Memory Controller is the local boundary that decides when AI apps may use memory. It does not try to be another assistant memory store. It wraps a local Memory Drive with consent grants, recall veto decisions, private memory bubbles, Memory Weather, and public-safe receipts so memory is useful only when the user allows it at the moment it matters.

This direction comes from the Workflowz research pass: current assistant memory products mostly focus on what was stored and what can be recalled. Enigma should differentiate at the control point: just-in-time consent, recall-time checks, temporary private scopes, and a dashboard that explains memory readiness without exposing memory.

## What it controls

| Primitive | Product meaning | Technical boundary | Public-safe artifact |
| --- | --- | --- | --- |
| Consent grant | An app asks for a narrow memory use when it needs it, not during first launch. | Scoped grant for an Enigma-mediated connector, with purpose, expiry, revocation, and policy refs. | Grant ref, scope label, expiry bucket, connector label, policy ref, receipt ref. |
| Recall veto | Enigma can withhold memory before context is shared with an app. | Deterministic allow/withhold decision at recall time, using current grant state, bubble state, risk flags, and owner policy. | Decision ref, reason code, policy ref, time bucket, withheld count, receipt ref. |
| Private memory bubble | A temporary memory space for sensitive, experimental, or short-lived context. | Local scope with clear entry, exit, expiry, and no default promotion into durable memory. | Bubble ref, status label, expiry bucket, item count, promotion count, receipt ref. |
| Memory Weather | A plain-language control panel for memory readiness. | Public-safe projection of vault state, connector readiness, held-back recalls, review needs, and proof/export status. | Status label, one next action, counts, support code, proof refs, redaction status. |

## Technical contract

The primitive layer is deterministic and fail-closed. A missing grant, unknown connector, expired bubble, unsafe export scan, or unavailable policy result becomes `withhold`, `needs_review`, or `blocked`; it never silently falls back to sharing memory.

Public schemas use draft 2020-12 and stable `enigma.<snake_case>.v1` identifiers for the public-safe shape of each primitive:

- `enigma.memory_controller_grant.v1`
- `enigma.recall_veto_decision.v1`
- `enigma.private_memory_bubble.v1`
- `enigma.memory_weather_report.v1`

Those schemas describe receipts and summaries only. They do not serialize raw memory, prompts, transcripts, provider payloads, private paths, secrets, or account material.

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
