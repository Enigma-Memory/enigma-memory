# `@enigma-ai/enigma/metering`

Deterministic, content-minimized usage metering for the Enigma memory layer.

## Contract

- Produces `enigma.usage_event.v1` events and `enigma.usage_aggregate.v1` aggregates.
- Accepts token counts, memory baseline/optimized counts, provider/model identifiers, and public pricing inputs.
- Computes estimated memory credit from supplied counts only.
- Does not inspect or store prompts, completions, transcripts, provider responses, decrypted memory, credentials, or secrets.
- Does not claim provider invoice savings, token ROI/profit/equity, decentralized inference, provider-side deletion, model forgetting, or compliance certification.

## Public API

- `createUsageEvent(options)`
- `aggregateUsageEvents(options | events[])`

## Evidence boundary

A metering event is billing/settlement evidence for Enigma-side usage math. It is not proof that any cloud/provider invoice changed, any token has value, any inference backend is decentralized, or any provider deleted/forgot content.
