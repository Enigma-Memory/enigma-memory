# Killer demos

## Demo 1 — AI memory card

Show one user using the same Enigma Passport across ChatGPT export, Claude import, Kimi Code, Cursor, and a local model.

Evidence:

- one Passport ID
- context pack receipts for each AI client
- offline verifier report

## Demo 2 — Delete and prove non-serving

Create a sensitive memory, retrieve it, delete it, then ask for context again.

Evidence:

- deletion receipt
- tombstone
- active-set non-membership proof
- context pack excluding deleted memory
- verifier report rejecting any post-delete context pack containing the memory address

## Demo 3 — Boundary false assurance

Run the canary harness where the canary leaks through scratchpad and tool output before instrumentation.

Evidence:

- false-assurance report
- break ledger entry
- mitigated rerun where side-channel writes route through the committed channel
- `NARROW_GO` for semantic/RAG paraphrase unless solved

## Demo 4 — Enterprise residency denial

Attempt to inject EU-restricted memory into a disallowed provider region.

Evidence:

- denial receipt
- policy ID
- region rule
- no context injection receipt
- SIEM export event

## Demo 5 — Capsule handoff

Share a project Capsule with another AI assistant for one hour.

Evidence:

- capability grant
- expiry
- scoped memories only
- retrieval receipts
- post-expiry denial receipt
