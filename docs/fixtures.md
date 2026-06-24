# Enigma fixtures

The local proof-carrying memory fixtures are JSON bundles produced by `enigma export` or `exportBundle({ includePlaintext: false })`.

## Bundle shape

A generated bundle uses `schema: "enigma.vault_bundle.v1"` and contains:

- `vault`: vault metadata, roots, sequence, and encryption mode.
- `keyring`: local import material plus the verifier public key.
- `memory_objects`: encrypted memory records and commitments.
- `active_memory_addresses`: canonical active set members.
- `tombstones`: deleted/superseded memory proofs.
- `events`: canonical memory event records.
- `receipts`: signed hash-chained receipts for create/read/update/delete/retrieve/inject/export/import operations.
- `export_receipt`: the receipt emitted for the export operation.

Verifier fixtures are self-contained: `enigma-verify <bundle.json>` can validate receipts offline using only the bundle contents and Node builtins.

## No-plaintext-receipt invariant

Receipt files and exported `receipts` arrays must never contain raw memory plaintext. Receipts carry event hashes, memory addresses, active/log roots, sequence links, signer metadata, and signatures. Plaintext memory content is only served through an authorized live vault/context operation; exported memory payloads remain encrypted.
