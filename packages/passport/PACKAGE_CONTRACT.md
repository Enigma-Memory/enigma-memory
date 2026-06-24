# Passport package contract

This package builds portable memory identity and context packs from the vault source of truth.

Required invariants:

- The vault event stream and active memory set are canonical; provider-native memory is never source-of-truth.
- Context compilation may include only addresses present in active state and absent from tombstones.
- Tombstoned, deleted, superseded, or otherwise inactive memory is refused before retrieval or injection receipts are emitted.
- Each context pack records the memory addresses it includes and carries retrieval and injection receipts for those addresses.
- `verifyContextPack` fails closed when any included memory address is missing from active state or present in tombstones.
- Receipts must remain plaintext-free; context packs may contain decrypted memory only as the explicit runtime payload being injected.
- Deletion proof means Enigma stopped serving the address and can show tombstone plus active-set absence; it does not claim provider-side erasure.
