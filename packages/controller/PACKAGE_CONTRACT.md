# Memory Controller package contract

`enigma-memory/controller` is the first pure-JavaScript Memory Controller primitive layer for Enigma-mediated local memory use.

## Exports

- `createConsentGrant(options)` emits a narrow, expiring consent grant for one app ref, operation, memory zone, and purpose.
- `verifyConsentGrant(grant, options)` fails closed for expired, revoked, mismatched, malformed, or non-public-safe grants.
- `createRecallVetoDecision(options)` returns `allow`, `ask`, or `deny` before Enigma shares recalled context.
- `createPrivateMemoryBubble(options)` opens a temporary public-safe bubble receipt.
- `closePrivateMemoryBubble(bubble, options)` closes a bubble as `kept` or `discarded` without mutating the original object.
- `createMemoryWeatherReport(options)` rolls dashboard tiles into `sunny`, `needs_attention`, or `storm_warning` with one next-action ref.
- `assertMemoryControllerPublicSafe(value)` rejects unsafe public artifacts.
- schema string constants and draft 2020-12 JSON schema constants are exported for the four artifact types.

## Boundary

The package is deterministic, local, and dependency-free. It imports only core helpers for canonical hashes, Merkle roots, and public-safe artifact checks. It does not open sockets, inspect local files, call providers, persist state, or make claims about provider-side systems.

Artifacts contain schema ids, refs, counts, hashes, statuses, and time buckets. Data-bearing or identity-bearing fields are rejected by the public-safe guard; generated examples use only synthetic refs.

## Schemas

Public schemas use JSON Schema draft 2020-12 and schema ids:

- `enigma.memory_controller_grant.v1`
- `enigma.recall_veto_decision.v1`
- `enigma.private_memory_bubble.v1`
- `enigma.memory_weather_report.v1`
