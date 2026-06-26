# Proof Network

Enigma Proof Network is the public-safe receipt layer for AI memory operations. It packages hashes, roots, refs, scopes, and signatures into local JSON artifacts that can be checked without revealing raw memory, prompts, transcripts, completions, embeddings, access-control bodies, tenant names, provider responses, or secrets.

The Proof Network has two jobs:

1. Make memory-system events independently inspectable through stable artifact types.
2. Keep private data out of proof material by committing only to public-safe identifiers and cryptographic digests.

The initial artifact families are:

| Artifact | Schema identifier | Purpose |
| --- | --- | --- |
| Anchor batch | `enigma.proof_network.anchor_batch.v1` | Groups one or more public-safe roots and refs into an opaque batch that can later be anchored by an operator. |
| Capability grant | `enigma.proof_network.capability_grant.v1` | Records that a subject was granted a scoped capability over public-safe memory refs. |
| Capability revocation | `enigma.proof_network.capability_revocation.v1` | Records that a prior grant or scope is no longer accepted by verifiers after the revocation artifact is recognized. |
| Benchmark attestation | `enigma.proof_network.benchmark_attestation.v1` | Binds a benchmark report hash to dataset, runner, package, and environment refs without publishing raw benchmark contents. |
| Proof packet | `enigma.proof_network.packet.v1` | Bundles supported proof-network artifacts and verification metadata for review or handoff. |
| Registry entry | `enigma.proof_network.registry_entry.v1` | Indexes one anchor batch, benchmark attestation, connector conformance attestation, health report, operator receipt, or settlement job ref into a public-safe marketplace registry by digest refs, signer refs, and schema ref only. |
| Registry batch | `enigma.proof_network.registry_batch.v1` | Aggregates registry entries into one registry root so a marketplace index can be reviewed or handed off as a single commitment. |

The pure package API for these artifacts should stay side-effect free: constructors create public-safe JSON, validators check exact schema shape and privacy flags, `sha256Json` hashes canonical JSON, and `assertNoPrivateProofPayload` rejects private key names or values before an artifact can be emitted. The API must not call a network, touch the filesystem, invoke provider SDKs, or infer missing private context.

## What it is

Proof Network is a local, deterministic planning and verification layer. The CLI emits JSON artifacts that are safe to store in a repository, attach to a release packet, or hand to a reviewer. The artifacts are designed so a verifier can answer questions such as:

- Which public-safe root did this release or run commit to?
- Which grant scope was declared, and when does it expire?
- Which grant was revoked by this nullifier?
- Which benchmark report hash was attested, and which public-safe dataset and runner refs were used?
- Does this packet contain only supported proof-network schemas and pass private-payload checks?

A proof-network artifact is evidence about the artifact itself and the local inputs represented by its hashes. It is not evidence about private contents that are not published, and it is not a substitute for inspecting the local system that produced those hashes.

## What it is not

Proof Network does not submit live network transactions. The current CLI commands are local planning commands only and must set:

```json
{
  "transaction_submitted": false,
  "raw_memory_on_chain": false
}
```

Proof Network also does not:

- reveal raw memory or user content;
- publish prompts, transcripts, completions, embeddings, provider responses, tenant names, access-control bodies, private keys, seed phrases, or API keys;
- prove provider behavior or downstream answer quality;
- replace separate audits or operating reviews;
- make commercial or public-market promises;
- control systems that do not consume proof-network artifacts.

## Solana role

Solana is the intended public settlement rail for compact roots, not a data store for memory. In this release concept, Enigma prepares Solana-ready anchor payloads but does not broadcast them.

A future operator-controlled anchoring program can use the anchor batch as an opaque commitment:

- the batch root is already computed locally;
- the batch contains only hashes, refs, counts, timestamps, schema names, and optional signatures;
- the chain payload does not need raw memory or private operational metadata;
- the local artifact remains the source of detailed review context.

This separation keeps the public rail small and privacy-preserving: public observers may see that a commitment exists, while reviewers with the local proof packet can verify the public-safe contents that produced the commitment.

## Accounts and PDA concepts

A Solana implementation can model Proof Network state with program-owned accounts. At a high level:

- an **anchor batch account** can store or reference the compact root for a batch;
- a **grant account** can represent a capability grant keyed by issuer, subject, scope digest, and expiry;
- a **revocation account** can represent a nullifier for a grant or scope digest;
- an **attestation account** can represent a benchmark report commitment and its public-safe refs.

Program Derived Addresses (PDAs) are deterministic account addresses derived from seeds and a program id. For Proof Network, PDA seeds should use public-safe values only, such as schema identifiers, issuer public keys, grant ids, scope hashes, report hashes, package refs, dataset refs, and batch roots. PDA seeds must not contain raw memory, prompts, transcripts, tenant names, ACL bodies, private keys, seed phrases, API keys, or local filesystem paths.

The local artifact should preserve enough public-safe context for a reviewer to recompute the expected PDA seeds once a real program id and instruction format exist. Until then, any PDA fields in local artifacts are planning references, not proof that an account exists on a live network.

## Flow: anchor

Anchor batches collect public-safe roots and refs into a single commitment.

1. The operator exports or computes one or more public-safe roots.
2. The CLI validates that the batch contains no private payload keys or values.
3. The CLI canonicalizes the JSON and computes a batch hash.
4. The CLI writes a local anchor batch with `transaction_submitted:false` and `raw_memory_on_chain:false`.
5. Any later operator process can reuse only the compact commitment; this command does not perform that process.

Example:

```sh
enigma chain anchor \
  --root sha256:8f0f7d2b7b7f4f2a3e4b9a3d1f0f2c3b4a5d6e7f8091a2b3c4d5e6f708192a3b \
  --ref release:enigma:0.1.17 \
  --ref memory-root:public-demo-2026-06-25 \
  --out ./.enigma/proof-network-anchor.json
```

Expected boundary:

```json
{
  "schema": "enigma.proof_network.anchor_batch.v1",
  "transaction_submitted": false,
  "raw_memory_on_chain": false
}
```

## Flow: grant

Capability grants describe scoped permission over public-safe refs. The grant does not contain the underlying memory or private policy body.

1. The issuer chooses a capability name, subject public identifier, scope digest, and optional expiry.
2. The CLI validates the scope fields and rejects private payload keys or values.
3. The CLI emits a grant id and grant hash.
4. Verifiers accept the grant only within its declared scope and time boundary.

Example:

```sh
enigma chain grant \
  --issuer did:example:enigma-issuer \
  --subject did:example:reviewer-01 \
  --capability memory.read.context-pack \
  --scope-ref memory-scope:sha256:0d4c2b8a7e6f5d4c3b2a19081726354433221100ffeeddccbbaa998877665544 \
  --expires-at 2026-07-25T00:00:00.000Z \
  --out ./.enigma/proof-network-grant.json
```

Good grant scopes are narrow and reviewable: one purpose, one subject, explicit expiry, and refs that can be resolved by the operator without exposing private contents publicly.

## Flow: revoke

Revocation artifacts let verifiers stop accepting a prior grant or scope. A revocation should identify the grant or scope through public-safe refs and nullifiers only.

1. The issuer selects a grant id, grant hash, or scope digest to revoke.
2. The CLI derives or accepts a public-safe nullifier.
3. The CLI validates that no private payload is present.
4. Verifiers reject matching grants after recognizing the revocation artifact.

Example:

```sh
enigma chain revoke \
  --issuer did:example:enigma-issuer \
  --grant-hash sha256:2a0f6d8c1e3b5a799887766554433221100ffeeddccbbaa998877665544332211 \
  --reason operator-request-2026-06-25 \
  --out ./.enigma/proof-network-revocation.json
```

A revocation artifact is a verifier rule over proof-network refs. It is not a statement about third-party systems or private stores beyond the verifier boundary that consumes the artifact.

## Flow: attest

Benchmark attestations bind a report hash to public-safe refs for a dataset, runner, package, and run environment. They are useful when a benchmark report must remain private or internal but its digest needs to be cited publicly.

1. The operator runs a local benchmark and stores the private report outside the public artifact.
2. The operator computes or supplies the report hash.
3. The CLI records dataset refs, runner refs, package refs, and environment refs that are safe to publish.
4. The CLI emits an attestation that can be verified against the report hash later.

Example with a report hash:

```sh
enigma chain attest \
  --report-hash sha256:5c3a2e1d0f9b8a7766554433221100ffeeddccbbaa99887766554433221100ff \
  --dataset-ref locomo:file-sha256:6a7b8c9d0e1f2233445566778899aabbccddeeff00112233445566778899aabb \
  --runner-ref enigma-standard-memory-benchmark:0.1.17 \
  --package-ref npm://enigma-memory@0.1.17 \
  --out ./.enigma/proof-network-attestation.json
```

Example with a local report file:

```sh
enigma chain attest \
  --report-file ./.enigma/standard-memory-benchmark.json \
  --dataset-ref longmemeval:file-sha256:7b8c9d0e1f2233445566778899aabbccddeeff00112233445566778899aabbcc \
  --runner-ref enigma-standard-memory-benchmark:0.1.17 \
  --package-ref npm://enigma-memory@0.1.17 \
  --out ./.enigma/proof-network-attestation.json
```

The public attestation should include only the report hash and refs. It should not include raw benchmark rows, questions, answers, conversations, private file paths, credentials, or provider outputs.

## Flow: register

Registry entries index one already-created proof artifact into a public-safe marketplace registry. The entry never copies the artifact body; it binds the artifact hash to a schema ref, digest refs, signer refs, an entry type, and a registry namespace ref.

1. The operator creates or selects a supported artifact (anchor batch, benchmark attestation, connector conformance attestation, health report, operator receipt, or settlement job ref) and keeps its body private.
2. The CLI records only the artifact hash, the artifact schema ref, the public-safe digest refs and signer refs to index, and the entry type.
3. The CLI validates that no private payload is present and emits a registry entry with `transaction_submitted:false` and `raw_memory_on_chain:false`.
4. A reviewer can later resolve the artifact hash through approved private channels; the registry entry reveals only that a digest was indexed under a schema by named signers.

Supported entry types are `anchor_batch`, `benchmark_attestation`, `connector_conformance`, `health_report`, `operator_receipt`, and `settlement_job`. An unsupported entry type is rejected before an entry is created.

Example:

```sh
enigma chain register \
  --entry-type benchmark_attestation \
  --artifact-hash sha256:5c3a2e1d0f9b8a7766554433221100ffeeddccbbaa99887766554433221100ff \
  --artifact-schema-ref enigma.proof_network.benchmark_attestation.v1 \
  --digest-ref sha256:8f0f7d2b7b7f4f2a3e4b9a3d1f0f2c3b4a5d6e7f8091a2b3c4d5e6f708192a3b \
  --signer did:key:zpublicattestor \
  --registry-ref registry:memory-drive-marketplace \
  --entry-ref registry-entry://enigma/public/benchmark-1 \
  --out ./.enigma/proof-network-registry-entry.json
```

A registry entry answers "which digest was indexed under which schema by which signers, in which registry namespace?" It does not publish the artifact body, the report rows, the memory behind a root, customer or tenant identifiers, or any private review content.

## Flow: registry

Registry batches aggregate registry entries into one registry root so a marketplace index can be reviewed or handed off as a single commitment.

1. The operator selects registry entries that have already passed local validation.
2. The CLI sorts the entry hashes and hashes them into a registry root.
3. The CLI emits a registry batch with the entry list, entry count, registry root, and the same safety boundaries.
4. A reviewer verifies the batch locally and resolves individual entries through approved private channels.

The registry root is deterministic and independent of entry input order: the same set of entries always yields the same registry root.

Example:

```sh
enigma chain registry \
  --entry ./.enigma/proof-network-registry-entry.json \
  --entry ./.enigma/proof-network-registry-entry-health.json \
  --registry-ref registry:memory-drive-marketplace \
  --out ./.enigma/proof-network-registry-batch.json
```

A registry batch is a local planning artifact. It does not broadcast to a marketplace, register on a live chain, or prove that any third party adopted the index.

## Flow: packet

Proof packets bundle several supported artifacts into one reviewable handoff.

1. The operator selects anchor, grant, revocation, and attestation artifacts that have already passed local validation.
2. The packet records artifact hashes, schema identifiers, creation times, and verification metadata.
3. The packet validator rejects unsupported schemas and any private payload nested inside bundled artifacts.
4. A reviewer verifies the packet locally and resolves referenced private evidence only through approved internal channels.

Packet artifacts are useful for release review because they preserve the relationship among roots, grants, revocations, and attestations without copying private source material into the public handoff.

## Flow: verify

Verification is local. It checks schemas, required safety flags, hashes, supported artifact families, and the private-payload guard.

Example:

```sh
enigma chain verify --file ./.enigma/proof-network-anchor.json
enigma chain verify --file ./.enigma/proof-network-grant.json
enigma chain verify --file ./.enigma/proof-network-revocation.json
enigma chain verify --file ./.enigma/proof-network-attestation.json
enigma chain verify --file ./.enigma/proof-network-packet.json
enigma chain verify --file ./.enigma/proof-network-registry-entry.json
enigma chain verify --file ./.enigma/proof-network-registry-batch.json
```

A successful local verification means the artifact matches a supported proof-network shape and safety boundary. It does not mean a live account exists, a transaction was accepted, or a public rail was contacted.

## Flow: optional Solana Memo dry-run

`enigma chain submit-solana` is the safe handoff from a verified local artifact to the optional Solana proof rail. It defaults to dry-run, validates the artifact first, and prints only the compact Memo reference that would be submitted.

Dry-run command:

```sh
enigma chain submit-solana \
  --file ./.enigma/proof-network-anchor.json \
  --cluster devnet
```

Execute command, only after devnet gate approval and with an explicit operator keypair:

```sh
enigma chain submit-solana \
  --file ./.enigma/proof-network-anchor.json \
  --cluster devnet \
  --rpc https://api.devnet.solana.com \
  --keypair ./operator-devnet-keypair.json \
  --execute
```

Execute mode submits one Solana Memo instruction containing only `memo_ref` JSON: schema, artifact hash, cluster, and compact proof commitment. It does not submit the artifact body, raw memory, prompts, transcripts, embeddings, provider responses, private keys, local paths, or customer identifiers.

## Privacy boundaries

Proof-network artifacts are public-safe only when they follow these boundaries:

| Boundary | Allowed | Forbidden |
| --- | --- | --- |
| Memory evidence | Hashes, roots, counts, public-safe refs | Raw memory, transcripts, prompts, completions, embeddings |
| Access scope | Capability name, scope hash, subject public identifier, expiry | ACL body, tenant name, private group membership, private policy text |
| Benchmark evidence | Report hash, dataset ref, runner ref, package ref, environment ref | Raw questions, answers, conversations, provider responses, private dataset rows |
| Solana planning | Batch root, schema id, public keys, PDA seed descriptions | Private keys, seed phrases, API keys, local file paths, raw memory |
| Review packet | Supported proof artifacts, hashes, signatures, verification metadata | Secrets, private operational notes, unredacted logs |
| Registry index | Artifact hash, schema ref, digest refs, signer refs, registry namespace ref, entry type, count | Artifact bodies, report rows, memory behind roots, customer or tenant identifiers |

The private-payload guard should reject both key names and values that look like private data. Reviewers should treat that guard as a safety net, not as permission to put sensitive fields near public artifacts.

## Public claims

Allowed public claims are intentionally narrow:

- Enigma can produce local proof-network JSON artifacts for anchors, grants, revocations, benchmark attestations, packets, registry entries, and registry batches.
- The artifacts are designed to contain public-safe hashes, roots, refs, counts, timestamps, signatures, and schema identifiers.
- The local verifier can validate supported proof-network artifact shapes and reject private payload patterns.
- Anchor batches are Solana-ready planning payloads for compact commitments, with `transaction_submitted:false`.
- Raw memory is not intended to be placed on a public rail by these artifacts.
- Registry entries index an already-created artifact by digest refs, signer refs, and schema ref only; registry batches hash entries into one registry root for review or handoff. Neither claims that a marketplace or live chain adopted the index.

Forbidden public claims include:

- saying these commands submitted, confirmed, or finalized a transaction;
- saying Proof Network publishes or reconstructs raw memory;
- saying a grant proves broad identity, organization membership, or private policy content beyond its public-safe refs;
- saying a revocation changes third-party systems or private stores that do not consume the revocation artifact;
- saying a benchmark attestation proves answer quality or provider ranking;
- saying the system replaces separate audits, changes public-market outcomes, or controls systems that do not consume the artifact.
- saying a registry entry or registry batch was published to a live marketplace, registered on a live chain, or adopted by any third party;

## Reviewer checklist

Before publishing or sharing a proof-network artifact, check that:

1. `schema` is one of the supported `enigma.proof_network.*.v1` identifiers.
2. `transaction_submitted` is `false` for local planning artifacts.
3. `raw_memory_on_chain` is `false`.
4. Every root or digest is public-safe and reproducible from the intended private input.
5. Every ref is safe to reveal and does not contain a local username, tenant name, private path, or secret.
6. No raw memory, prompt, transcript, completion, embedding, benchmark row, provider response, private key, seed phrase, or API key appears anywhere in the artifact.
7. Public copy describes the artifact as local proof-network evidence, not as live-chain settlement or proof about systems that do not consume the artifact.
