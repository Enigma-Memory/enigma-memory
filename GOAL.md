# Enigma production goal

## North star

Enigma becomes the portable memory and proof layer for AI: a SanDisk-like substrate that lets people and enterprises carry durable, encrypted, verifiable AI memory across providers, agents, tools, and deployment boundaries.

## Production definition

A production-ready Enigma release must let a user or enterprise:

1. create an encrypted local Memory Passport,
2. store memory outside model providers,
3. retrieve scoped context into an AI client through a controlled adapter,
4. emit signed receipts for every memory lifecycle operation,
5. delete a memory from Enigma active serving state,
6. prove the deleted memory is absent from future Enigma context packs,
7. export a proof bundle that verifies offline with no Enigma server and no AI provider,
8. run a side-channel boundary harness that fails closed on unknown or uninstrumented paths,
9. use the same memory substrate with provider-neutral adapters,
10. state exactly what is proven and what is not proven.

## Novelty claim

Enigma is not a vector database, not an agent runtime, and not provider-native memory. Enigma is a verifiable AI memory plane: portable owner-controlled memory plus cryptographic evidence of how that memory was created, used, denied, exported, deleted, and boundary-crossed.

## First release gate

The first release is acceptable only when all of these are true locally:

- deterministic receipt canonicalization exists,
- Ed25519 receipt signing and verification works,
- receipt chains reject tampering, deletion, insertion, and reorder,
- active-set roots support membership and non-membership proofs,
- deletion creates tombstones and active-set absence proofs,
- context compilation refuses tombstoned memories,
- boundary harness exposes false assurance for uninstrumented side channels,
- CLI can create, recall, delete, export, and verify,
- MCP surface can produce a context pack and verification tool result,
- tests cover both passing and failing proof paths.

## Claim boundary

Enigma proves Enigma-controlled state and declared boundary operations. It does not prove that a closed AI provider physically deleted internal copies, that model weights forgot, that a signed memory is true, or that uninstrumented side channels were absent.
