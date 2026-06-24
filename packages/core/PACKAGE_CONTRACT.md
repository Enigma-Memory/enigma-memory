# Package contract

This package is part of Enigma, the provider-agnostic AI memory and proof layer. Implementations must preserve these invariants:

- The canonical memory event stream is the source of truth.
- Receipts are verifiable offline.
- Raw memory plaintext is never stored in receipt files.
- Deleted memories are not served by context compilation.
- Unknown boundary paths fail closed.
- Provider-native memory is a cache, never canonical custody.

Core proof invariants:

Required public exports are `canonicalize`, `sha256Hex`, `hmacSha256Hex`, `generateSigningKeyPair`, `signPayload`, `verifySignature`, `receiptHash`, `createReceipt`, `verifyReceipt`, `verifyReceiptChain`, `MerkleSet`, `createCheckpoint`, `verifyCheckpoint`, and `createMemoryAddress`.

- `canonicalize` emits deterministic canonical JSON for plain JSON data: object keys are sorted, arrays keep order, and non-JSON values, sparse arrays, non-finite numbers, and cycles are rejected instead of silently normalized.
- `sha256Hex` and `hmacSha256Hex` return lowercase SHA-256 hex. Roots exposed in receipts, checkpoints, and Merkle proofs use the `sha256:` prefix.
- Signing uses Ed25519 from `node:crypto`; signed receipt and checkpoint envelopes are canonicalized before signing, and verification rejects changed fields, wrong keys, and malformed signatures.
- `createReceipt` signs an unsigned canonical envelope containing operation, sequence, previous receipt hash, active set root, receipt log root, event hash, timestamp, and signer. Receipts carry event hashes and addresses, never raw memory plaintext.
- `verifyReceiptChain` enforces genesis/previous-hash continuity, contiguous sequence numbers, per-receipt signatures, signer expectations, and supplied active-set or receipt-log roots so missing, reordered, inserted, or changed receipts fail closed.
- `MerkleSet` is a sorted set with deterministic roots and membership/non-membership proofs tied to adjacent sorted leaves.
- `createMemoryAddress` derives value-blind addresses with HMAC-SHA-256; memory contents are inputs to the HMAC only and are never exposed by the address.

Package-specific implementation details are governed by `research/handoff-enigma/09_BUILD_BACKLOG.md` and `research/handoff-enigma/12_KIMI_BUILD_BRIEF.md`.
