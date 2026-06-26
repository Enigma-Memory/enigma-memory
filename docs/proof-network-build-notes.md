# Proof Network build notes

These notes are for future engineers extending Enigma's privacy-preserving Proof Network into a Solana program or hosted verifier. The 0.1.15 scope is local-only: create and verify public-safe proof artifacts, prepare opaque root batches for future chain anchoring, and never submit transactions or write private memory material into proof payloads.

Paths below are relative to `enigma/`.

## Current implementation inventory

| Surface | Current file | Notes for builders |
| --- | --- | --- |
| Pure package API | `packages/proof-network/src/index.js` | Exports constructors, validators, schema constants, `assertNoPrivateProofPayload`, and `sha256Json`. Keep it pure: no filesystem, network, provider SDK, Solana RPC, subprocess, or mutable runtime state. |
| Package export | `package.json` | Includes `packages/proof-network/src/` in `files` and exports `./proof-network`. |
| CLI commands | `apps/cli/bin/enigma.mjs` | Implements `enigma chain anchor`, `grant`, `revoke`, `attest`, and `verify` as local planning/verification commands. The help text states these commands do not submit Solana transactions or put raw memory on-chain. |
| Packet builder | `scripts/build-proof-network-packet.mjs` | Builds a public-safe packet from hashes/refs and hashes benchmark report files without copying their body or path into the packet. |
| Schemas | `specs/proof-network-anchor-batch-v1.schema.json`, `specs/proof-network-capability-grant-v1.schema.json`, `specs/proof-network-benchmark-attestation-v1.schema.json`, `specs/proof-network-packet-v1.schema.json` | Add `specs/proof-network-capability-revocation-v1.schema.json` before release so every artifact schema has a JSON Schema. |
| Tests | `test/enigma-proof-network.test.mjs`, `test/enigma-chain-cli.test.mjs` | Keep fixtures public-safe. Add cases when any field, schema, or CLI flag changes. |
| Root product docs | `../docs/proof-network.md`, `../docs/proof-network-faq.md`, `../docs/proof-network-threat-model.md`, `../docs/proof-network-build-notes.md` | Keep positioning bounded to local proof generation, local verification, Solana-ready payload shape, and public-safe commitments. |

Do not touch website, Cloudflare, live infrastructure, publishing, account creation, or external provider integrations while building this layer.

## Scope boundary

Allowed public evidence:

- exact schema ids
- artifact ids
- `sha256:` digests
- Merkle roots
- opaque refs
- counts
- timestamps
- reviewed public keys or signature refs
- boolean claim-boundary flags
- transaction planning metadata with `transaction_submitted:false`

Forbidden public evidence: raw memory, prompts, transcripts, completions, embeddings, ACL bodies, tenant names, private keys, API keys, seed phrases, provider responses, customer identifiers, private local paths, and raw benchmark rows. The Proof Network proves commitments to private memory workflows; it does not publish those workflows.

## Public artifact contracts

Future Solana and hosted-verifier code should switch on exact schema id, not filename. Preserve the package's current field names unless there is a coordinated clean cutover across schemas, CLI, tests, and docs.

### `enigma.proof_network.anchor_batch.v1`

Purpose: group public commitments into one Solana-ready opaque anchoring payload.

Current package fields include:

- `schema:"enigma.proof_network.anchor_batch.v1"`
- `generated_at`
- `anchor_ref`
- `chain`
- `cluster_ref`
- `commitment_count`
- `commitment_root`
- `commitments`: objects containing public `kind`, `root`, and optional `ref`
- `solana_ready_anchor.payload_hash`
- `solana_ready_anchor.account_seed`
- `solana_ready_anchor.instruction_ref`
- `solana_ready_anchor.opaque_payload_only:true`
- `anchor_batch_id`
- `anchor_batch_hash`
- `transaction_submitted:false`
- `raw_memory_on_chain:false`
- `provider_deletion_claim:false`
- `model_forgetting_claim:false`
- `hosted_saas_claim:false`

The Solana program should only need the compact payload hash and public metadata for schema/version/count auditing. It should not need ACL bodies, memory plaintext, benchmark reports, or provider outputs.

### `enigma.proof_network.capability_grant.v1`

Purpose: represent a scoped, public-safe grant without revealing the underlying tenant, memory, ACL, or account body.

Current package fields include `issued_at`, `expires_at`, `grant_ref`, `issuer_ref`, `subject_ref`, `audience_ref`, `scopes`, `resource_root`, `resource_roots`, `max_uses`, `nonce_hash`, `signature_ref`, `capability_grant_id`, `capability_grant_hash`, and all safety flags listed above.

Use refs and hashes for scopes. Never embed policy documents that contain names, tenant identifiers, access-control bodies, or business-sensitive terms.

### `enigma.proof_network.capability_revocation.v1`

Purpose: revoke a grant with a public nullifier/commitment.

Current package fields include `revoked_at`, `revocation_ref`, `grant_id`, `grant_hash`, `issuer_ref`, `reason_ref`, `nullifier_root`, `signature_ref`, `capability_revocation_id`, `capability_revocation_hash`, and all safety flags listed above.

The nullifier must not be reversible to a tenant name, account id, private ACL, or raw grant body. Add the missing JSON Schema file for this artifact before release.

### `enigma.proof_network.benchmark_attestation.v1`

Purpose: attest benchmark evidence without publishing raw datasets, prompts, completions, judge responses, provider outputs, or report bodies.

Current package fields include `attested_at`, `benchmark_ref`, `dataset_ref`, `runner_ref`, `package_ref`, `report_hash`, `metric_root`, `metric_roots`, `sample_count`, `run_count`, `signature_ref`, `benchmark_attestation_id`, `benchmark_attestation_hash`, and all safety flags listed above.

If a CLI or script accepts a report file, hash the file locally and emit only the digest plus public refs unless the report has already been reviewed as public-safe.

### `enigma.proof_network.packet.v1`

Purpose: bundle supported proof-network artifacts into one verifier-ready packet.

Current package fields include `created_at`, `packet_ref`, `artifact_count`, `artifact_root`, `artifact_hashes`, `artifacts`, `proof_network_packet_id`, `proof_network_packet_hash`, and all safety flags listed above.

Packets must recursively validate nested artifacts. A packet hash must not hide unsupported schemas, invalid counts, or private nested fields. Nested packets are rejected by current validation.

## Pure package API contract

`packages/proof-network/src/index.js` exports:

```js
assertNoPrivateProofPayload(value)
sha256Json(value)
createProofNetworkAnchorBatch(input = {})
validateProofNetworkAnchorBatch(batch)
createCapabilityGrant(input = {})
validateCapabilityGrant(grant)
createCapabilityRevocation(input = {})
validateCapabilityRevocation(revocation)
createBenchmarkAttestation(input = {})
validateBenchmarkAttestation(attestation)
createProofNetworkPacket(input = {})
validateProofNetworkPacket(packet)
```

Implementation rules:

1. Keep every function pure: no filesystem, network, environment reads, provider SDKs, Solana RPC, subprocesses, or mutable module state.
2. Constructors may accept caller-provided ids and timestamps. If defaults exist, keep them deterministic or label them local artifact metadata only.
3. `sha256Json` must canonicalize object keys before hashing so equivalent JSON yields the same digest.
4. Validators should return a validation result or normalized artifact according to the existing package pattern; do not silently coerce private or malformed fields.
5. Every constructor and validator must call `assertNoPrivateProofPayload` before returning success.
6. Freeze schema constants and enums to prevent mutation.
7. Error messages must be public-safe: name the rejected key/path, never echo the rejected private value.

## Forbidden fields and values

Reject these exact keys anywhere in proof artifacts, nested packet artifacts, docs examples, and test fixtures:

- `memory`
- `memory_text`
- `raw_memory`
- `prompt`
- `prompts`
- `transcript`
- `transcripts`
- `completion`
- `completions`
- `embedding`
- `embeddings`
- `acl`
- `acl_body`
- `access_control_list`
- `tenant`
- `tenant_name`
- `customer_name`
- `organization_name`
- `org_name`
- `private_key`
- `secret_key`
- `api_key`
- `seed_phrase`
- `mnemonic`
- `provider_response`
- `provider_responses`
- `response_body`
- `access_token`
- `refresh_token`
- `password`
- `credential`
- `credentials`

Also reject values that look private even under disguised keys: seed phrases, PEM private keys, bearer/basic/API-token prefixes, provider transcript blocks, raw embedding arrays, absolute private local paths, tenant/customer/account/company names, and raw benchmark prompt/completion/dataset rows.

Safe replacements: use `memory_root`, `memory_hash`, `receipt_root`, `prompt_hash`, `transcript_hash`, `completion_hash`, `embedding_set_hash`, `scope_ref`, `policy_hash`, `subject_ref`, `issuer_ref`, `opaque_account_ref`, `provider_ref`, `report_hash`, aggregate counts, public key refs, and signature refs.

## CLI contract

`enigma chain` is a local command group. It must not submit transactions, read Solana keypairs, call Solana RPC, contact hosted Enigma services, or call external providers.

- `enigma chain anchor`: accepts one or more `--root <sha256:...>` values plus optional public refs and writes an anchor batch.
- `enigma chain grant`: accepts public `--subject`, `--capability`, `--scope`, optional resource refs, policy hash, expiry, and writes a grant.
- `enigma chain revoke`: accepts `--grant-hash`, `--reason`, optional public refs, and writes a revocation with `nullifier_root`.
- `enigma chain attest`: accepts `--report-hash` or `--report-file`, dataset/runner/package refs, optional public scores, and writes a benchmark attestation.
- `enigma chain verify --file <json>`: loads one supported artifact, runs the matching validator, and prints a public-safe validation result.

Every command output must include or summarize `transaction_submitted:false` and `raw_memory_on_chain:false`.

## Packet builder script

`scripts/build-proof-network-packet.mjs` exists for a local release/demo packet. Preserve these rules: hash the benchmark report file; never copy its body into the packet; reject absolute output paths; keep `transaction_submitted:false` and `raw_memory_on_chain:false`; do not call a network, deploy contracts, create accounts, sign transactions, or write private payload classes.

## Solana program handoff

The future Solana program should treat Enigma artifacts as commitments, not data stores.

Recommended instruction shape:

1. `anchor_batch(payload_hash, schema_hash, commitment_count, created_at_bucket)`
2. `grant_capability(grant_hash, subject_ref_hash, issuer_ref_hash, scope_hash, expires_at)`
3. `revoke_capability(nullifier_root, grant_hash, revoked_at, reason_code)`
4. `attest_benchmark(attestation_hash, report_hash, dataset_ref_hash, runner_ref_hash, package_ref_hash, sample_count)`

On-chain accounts should store compact hashes, counters, timestamps, and public status. They should not store JSON blobs unless the blob has passed the same forbidden-payload scanner and strict size caps. Even then, prefer storing only a digest plus schema discriminator.

## Hosted verifier handoff

A hosted verifier can add convenience, not authority over private content. It may validate schema ids, JSON Schemas, package validators, canonical hashes, packet nesting, artifact counts, and public registry/chain observations. It must return bounded public-safe error codes and never echo private submitted values.

Verifier non-goals: no raw memory ingestion, provider transcript ingestion, embedding upload endpoint, tenant-name lookup endpoint, Solana transaction submission, or hosted secret custody in the 0.1.15 proof-network layer.

## Targeted test plan

Run only targeted tests while building this layer. The orchestrator owns project-wide gates.

Core package tests in `test/enigma-proof-network.test.mjs` should cover constructor schemas, safety flags, deterministic `sha256Json`, valid/invalid validators, recursive packet validation, forbidden key/value rejection without value echoing, Solana-ready anchor content, and benchmark attestation privacy boundaries.

CLI tests in `test/enigma-chain-cli.test.mjs` should cover `chain anchor`, `chain grant`, `chain revoke`, `chain attest --report-hash`, `chain attest --report-file`, `chain verify --file` success/failure paths, required false safety flags, and the absence of transaction submission, keypair reads, Solana RPC, provider calls, or hosted credentials.

Use fixtures that contain only placeholder refs and hashes. Do not create realistic memory text, tenant names, prompts, completions, embeddings, provider responses, private keys, seed phrases, or API tokens in tests.

## Release gates

Do not mark the release ready unless all of these are true:

1. `packages/proof-network/src/index.js` exposes the full API contract listed above.
2. `package.json` includes the package export and publish file path for `./proof-network`.
3. JSON Schemas exist for all five schema ids, including `proof-network-capability-revocation-v1.schema.json`.
4. CLI commands exist for `chain anchor`, `chain grant`, `chain revoke`, `chain attest`, and `chain verify`.
5. Every generated CLI artifact includes `transaction_submitted:false` and `raw_memory_on_chain:false`.
6. Validators reject forbidden keys at arbitrary nesting depth.
7. Validators reject private-looking values without printing them.
8. Packets recursively validate nested artifacts and counts.
9. Tests cover pure package APIs, packet builder behavior, and CLI behavior with public-safe fixtures.
10. Documentation examples contain only hashes, roots, refs, counts, and signatures.
11. No Solana deploy, RPC submission, account creation, npm publish, Cloudflare change, external provider call, or live infrastructure action is part of the release path.
12. Benchmark attestations are claim-bounded to reviewed report hashes/refs and aggregate metrics, not raw datasets or model outputs.
13. Hosted verifier docs state that it verifies public commitments and never ingests raw memory.
14. Public positioning avoids claims of provider deletion proof, model forgetting proof, hosted SaaS proof, compliance certification, or official benchmark superiority unless separate audited evidence exists.

## Copy review checklist

Before merging proof-network docs or examples, search changed files for private payload language. Any occurrence of the forbidden keys above should be absent or inside a warning list like this document. Examples should use `subject_ref`, `issuer_ref`, `scope_ref`, `sha256:...`, `root_...`, `packet_...`, and `signature:...`; they should not use customer names, real local paths, account ids, provider transcripts, memory snippets, or keys.

The safest engineering rule is simple: if a future Solana explorer, README, CI log, npm tarball, hosted verifier response, or benchmark artifact could show it publicly, the value must already be public-safe before it enters the Proof Network.
