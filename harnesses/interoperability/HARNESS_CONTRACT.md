# Package contract

This package is part of Enigma, the provider-agnostic AI memory and proof layer. Implementations must preserve these invariants:

- The canonical memory event stream is the source of truth.
- Receipts are verifiable offline.
- Raw memory plaintext is not stored in receipt files by default.
- Deleted memories are not served by context compilation.
- Unknown boundary paths fail closed.
- Provider-native memory is a cache, never canonical custody.

Package-specific implementation details are governed by `research/handoff-enigma/09_BUILD_BACKLOG.md` and `research/handoff-enigma/12_KIMI_BUILD_BRIEF.md`.
