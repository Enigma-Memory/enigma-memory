# Mesh package contract

This package implements Enigma's decentralized mesh proof surface without provider-native memory as canonical state.

Required named exports:

- `createMeshNode(options)`
- `createCapsuleManifest(options)`
- `verifyCapsuleManifest(manifest, options)`
- `createWitnessCheckpoint(options)`
- `verifyWitnessCheckpoint(checkpoint, options)`
- `createRelayStore(options)`
- `pushRelayRecord(store, record)`
- `pullRelayRecord(store, recordRef)`
- `createFederationGrant(options)`
- `verifyFederationGrant(grant, options)`
- `runMeshDemo(options)`

Invariants:

- Mesh nodes generate local Ed25519 identity keys and publish a signed public trust descriptor; private keys remain local node state.
- Capsule manifests bind only encrypted payload hashes, receipt log roots, active set roots, owner-scope commitments, issuer, holder, expiry, and a signature. Raw memory plaintext is rejected.
- Witness checkpoints sign checkpoint roots, receipt roots, active set roots, witness identity, subject identity, and epoch; verification fails on wrong roots, missing keys, wrong signers, or signature mismatch.
- Relay records are opaque encrypted payload carriers. `pushRelayRecord` rejects plaintext fields and returns a stable `record_id` / `relay_record_id` for accepted records.
- Federation grants scope subjects, operations, purpose, issuer, holder, expiry, and signature; verification fails closed for wrong subject, operation, purpose, issuer, holder, expiry, signer, or signature.
- `runMeshDemo()` returns `ok: true` only when capsule verification, witness verification, relay plaintext rejection, federation grant verification, and plaintext-leak scanning all pass.
