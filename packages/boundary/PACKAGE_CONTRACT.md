# Boundary package contract

This package implements Enigma's exact, path-scoped Boundary/CANP proof surface.

Required named exports:

- `classifyBoundaryPath(manifest, pathRef)`
- `createBoundaryManifest(options)`
- `verifyBoundaryManifest(manifest)`
- `runBoundarySimulation(options)`

Invariants:

- Raw memory plaintext is never written into receipts or report rows; exact canary facts are represented by core `createMemoryAddress` HMAC-SHA-256 commitments in the `enigma.boundary.fact.v1` domain.
- Unknown, ambiguous, or missing boundary paths fail closed as `UNKNOWN_BOUNDARY` / `FAIL`.
- Provider-native or semantic/RAG memory is never canonical proof; semantic paraphrase coverage is `declared_out_of_scope` and can only yield `NARROW_GO`.
- Exact uninstrumented side channels that deliver a canary while the committed channel is absent produce `FALSE_ASSURANCE` / `FAIL`.
- Mitigated routes pass only when the exact fact commitment is present in the committed channel.
