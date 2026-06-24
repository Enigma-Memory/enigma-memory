# Vault package contract

This package is the local encrypted memory source of truth for Enigma.

Required invariants:

- The canonical memory event stream is the source of truth; active indexes, exports, and context views are rebuildable from events plus encrypted memory objects.
- Memory payloads are encrypted at rest with local AES-256-GCM vault keys.
- Receipts are verifiable offline and contain event hashes, memory addresses, roots, and signatures only; raw memory plaintext is never written into receipts.
- Active memory addresses are the only serveable state.
- Update and delete operations remove the old address from the active set and write a tombstone.
- Tombstoned or deleted memories are never served by recall or passport context compilation.
- Export bundles contain encrypted memory objects, receipts, active state, tombstones, roots, and local key material needed for offline import; they are not receipt files and must be protected as custody artifacts.
- Provider-native memory is a cache or downstream copy, never canonical custody.
