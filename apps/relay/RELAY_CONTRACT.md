# Relay contract

The relay app is a local hosted development server for Enigma's relay, witness, and device-pairing flows. It is MCP-first infrastructure: the server stores encrypted relay records and signs public roots, but it never receives, stores, emits, or proves over raw memory plaintext.

## Exports

- `createRelayState(options)` creates in-memory relay state: mesh node identity, relay store, witness log, pending pairing challenges, and completed pairings.
- `createRelayServer(options)` returns a `node:http` server bound to a relay state. It does not listen automatically.
- `handleRelayRequest(state, req, res)` routes one HTTP request and fails closed for unknown paths.
- `runRelayDemo(options)` performs the local opaque relay, plaintext rejection, witness verification, and pairing challenge/complete flow and returns `ok: true` only when all checks pass.

## Endpoints

- `GET /health` returns relay service health, mesh trust descriptor, relay record count, witness count, and pairing counts.
- `POST /relay/push` accepts only relay metadata and one opaque encrypted payload field (`opaque_encrypted_record`, `encrypted_payload`, or `ciphertext`). Plaintext-looking keys are rejected before storage.
- `GET /relay/pull?id=<record_id>` returns the stored opaque relay record or `404` when absent.
- `POST /witness/checkpoint` accepts checkpoint roots and checkpoint metadata only. The relay signs roots, subject identity, witness identity, and epoch; plaintext-looking fields are rejected.
- `GET /witness/log` returns witnessed root checkpoints.
- `POST /pairing/challenge` accepts a client/device/account public key and returns a relay-signed nonce challenge.
- `POST /pairing/complete` accepts the challenge id, the same public key, and the client signature over the unsigned challenge payload. The relay verifies the signature and returns a relay-signed pairing completion.

## Invariants

- Relay records are opaque encrypted payload carriers; the service cannot decrypt them.
- Witness artifacts contain roots, identifiers, epochs, timestamps, and signatures only.
- Pairing uses nonces and public keys only; no memory content or provider-native memory state participates.
- Unknown routes and missing identifiers fail closed.
- All signatures use existing Enigma Ed25519 core helpers and all relay storage uses existing mesh relay APIs.
