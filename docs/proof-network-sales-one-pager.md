# Proof Network sales one-pager

## Problem

Enterprise AI teams are moving from chat pilots to agents that need durable memory, scoped access, benchmark evidence, and deletion/revocation workflows. The blocker is trust evidence. Too much of the proof sits in application logs, screenshots, provider dashboards, or private reports that procurement teams cannot independently review and security teams cannot safely share. Buyers need evidence of what memory state was committed, who was granted access, what was revoked, and which benchmark report was attested without exposing prompts, transcripts, completions, embeddings, tenant names, provider responses, secrets, or private keys.

## Solution

Enigma Proof Network is the privacy-preserving proof layer for AI memory. It produces public-safe proof artifacts for memory root anchoring, scoped capability grants, capability revocations, benchmark attestations, and proof packets. The artifacts are designed to carry hashes, roots, refs, counts, scopes, expirations, nullifiers, signatures, and explicit safety flags instead of raw memory or private payloads.

The first workflow is local-first and Solana-ready. Teams can plan an opaque anchor batch, validate it offline, and keep `transaction_submitted:false` plus `raw_memory_on_chain:false` until a future anchoring decision is approved. That gives enterprise reviewers something concrete to inspect without forcing chain deployment, account setup, or provider integration into the first meeting.

## Why now

AI memory is becoming a production control plane: it shapes what agents remember, which tools they can use, what context moves across models, and how benchmark claims are trusted. Procurement, security, and platform leaders are asking for portable evidence that is verifiable without exposing private data. Proof Network turns that review from a promise into a packet: public-safe artifacts that can travel with a pilot, security review, benchmark claim, or partner integration.

## Demo path

1. Run `enigma chain anchor` with public-safe memory roots, refs, and counts to produce a local anchor batch artifact.
2. Run `enigma chain grant` to create a scoped capability grant with purpose, allowed operations, recipient ref, and expiry.
3. Run `enigma chain revoke` to create a revocation/nullifier artifact for the grant without revealing the underlying memory.
4. Run `enigma chain attest` with a report hash/file plus dataset, runner, and package refs to create a benchmark attestation.
5. Bundle the artifacts into a proof packet and run `enigma chain verify --file <json>` for local validation.
6. Inspect the packet to confirm it contains only public-safe hashes, roots, refs, counts, scopes, signatures, and safety flags.

## Proof differentiators

- **Privacy-preserving evidence:** the proof layer is designed around public-safe commitments, not raw AI memory.
- **Capability lifecycle:** grants and revocations are first-class artifacts with scoped operations, expiry, and nullifier evidence.
- **Benchmark provenance:** attestations bind a report hash to dataset, runner, and package refs so teams can discuss evaluation evidence without publishing private reports.
- **Solana-ready, not Solana-forced:** anchor batches can be shaped for future settlement while remaining local planning artifacts until submission is explicitly approved.
- **Packet-level verification:** buyers can review a complete proof packet offline instead of relying on a vendor console screenshot.
- **Clear claim boundaries:** artifacts state whether a transaction was submitted and whether raw memory is on-chain.

## Procurement-safe claims

Use this claim boundary in buyer conversations: Enigma Proof Network is intended to generate public-safe proof artifacts, validate supported artifact schemas, reject private proof payloads, create local CLI artifacts, verify those artifacts locally, and prepare Solana-ready anchor batch payloads without submitting transactions by default. Do not claim that raw memory is written on-chain, that a transaction has been submitted, that a third-party provider deleted data, that model weights forgot information, or that any legal, regulatory, security, or certification requirement is automatically satisfied. Treat the artifacts as evidence inputs for buyer review, not as a substitute for legal, regulatory, or security approval.

## Next meeting checklist

- Pick one memory root scenario that can be represented only by public-safe refs, hashes, and counts.
- Pick one capability grant and one revocation scenario for a live walkthrough.
- Pick one benchmark report hash plus dataset, runner, and package refs for attestation.
- Name the security reviewer who will inspect artifacts for private-data leakage.
- Decide whether the next session remains local-only or includes a proposed Solana anchoring review path.
- Agree on success criteria: artifact readability, verifier output, privacy boundary, integration fit, and owner for the next technical review.
