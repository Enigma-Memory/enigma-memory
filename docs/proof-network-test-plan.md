# Proof Network acceptance test plan

This plan defines the release acceptance tests for Enigma Proof Network artifacts. The boundary is narrow: Enigma is a private AI memory controller, and Solana is an optional proof, permission, and settlement rail. Public artifacts may contain only hashes, Merkle roots, opaque refs, counts, timestamps, schemas, signatures, signer refs, nullifiers, capability scopes, package refs, dataset refs, runner refs, metric refs, and explicit non-submission flags.

The tests must prove that local package and CLI behavior creates and validates public-safe artifacts without copying disallowed private material or benchmark record bodies into public outputs.

## Release boundary

The acceptance suite covers these Enigma-controlled behaviors:

- local artifact construction;
- deterministic JSON hashing;
- private payload and restricted-value rejection;
- CLI artifact creation and verification;
- JSON Schema conformance for public artifact shapes;
- benchmark attestation and proof-packet assembly;
- example artifact safety;
- documentation claim-boundary enforcement;
- release gates for package publication readiness.

The suite does not claim to prove external service behavior, model-state changes, production deployment, network submission, chain status, benchmark leadership, business outcome, economic design, or service availability.

## Artifact families under test

| Artifact | Schema id | Minimum public-safe evidence |
| --- | --- | --- |
| Anchor batch | `enigma.proof_network.anchor_batch.v1` | schema id, generated timestamp, anchor ref, chain and cluster refs, commitment roots, counts, payload hash, account derivation ref, instruction ref, batch id, batch hash, and required boundary flags |
| Capability grant | `enigma.proof_network.capability_grant.v1` | schema id, issue and expiry timestamps, grant ref, issuer ref, subject ref, audience ref, scope strings, resource roots, nonce hash, signature ref, grant id, grant hash, public-safe boundary flags |
| Capability revocation | `enigma.proof_network.capability_revocation.v1` | schema id, revocation timestamp, revocation ref, grant id or grant hash, issuer ref, reason ref, nullifier root, signature ref, revocation id, revocation hash, public-safe boundary flags |
| Benchmark attestation | `enigma.proof_network.benchmark_attestation.v1` | schema id, benchmark ref, dataset ref, runner ref, package ref, report hash, metric root or metric refs, sample and run counts, signature ref, attestation id, attestation hash, public-safe boundary flags |
| Proof packet | `enigma.proof_network.packet.v1` | schema id, packet ref, included artifact ids and hashes, packet hash, artifact count, schema counts, public-safe boundary flags |

## Fixture policy

Acceptance fixtures must be plaintext-minimized:

- Use synthetic `sha256:` digests, Merkle roots, opaque refs, counters, schema ids, and signature refs.
- Use a known forbidden sentinel only to assert rejection and non-leakage; the sentinel must never appear in success artifacts or error output intended for publication.
- Use public fixture refs such as `dataset:public-fixture:v1`, `runner:enigma-local:v1`, and `package:npm/enigma-memory@<version>` instead of local paths or private names.
- Do not store restricted private material, private identifiers, private policy bodies, local-only paths, or benchmark record bodies in fixtures.
- Prefer hash refs for any simulated report, policy, dataset, or metric input.

## Acceptance matrix

### 1. Private payload rejection

Objective: every public artifact constructor, validator, CLI command, packet builder, and verifier fails closed when private fields or restricted values are present.

Required cases:

1. Reject forbidden key names at any nesting depth, including names equivalent to private payload content, access-control bodies, external bodies, private identifiers, or freeform document content.
2. Reject restricted values even when the key name is otherwise allowed, including auth-shaped strings, key-shaped blocks, authority-bearing URLs, and private-content markers.
3. Reject private payloads before computing ids, hashes, packets, or CLI output files.
4. Ensure failure output is sanitized: no private sentinel, restricted input, forbidden value, or full input object may be echoed to stdout, stderr, JSON error output, or generated files.
5. Ensure all success artifacts recursively include the required non-submission and private-payload boundary flags.

Pass criteria:

- The command or API call returns a validation failure for every forbidden input.
- The serialized failure report contains only public-safe error codes, field paths, and generic messages.
- No private sentinel or restricted value appears in any artifact or error report.

### 2. Deterministic hashes

Objective: artifact hashes are stable, canonical, and independent of caller object insertion order.

Required cases:

1. Build the same anchor batch twice from equivalent commitments supplied in different orders; assert equal `anchor_batch_id`, `anchor_batch_hash`, and `solana_ready_anchor.payload_hash`.
2. Build the same capability grant twice from equivalent scope and resource-root inputs; assert equal `capability_grant_id` and `capability_grant_hash`.
3. Build the same capability revocation twice; assert equal `capability_revocation_id` and `capability_revocation_hash`.
4. Build the same benchmark attestation twice with equivalent metric roots; assert equal `benchmark_attestation_id` and `benchmark_attestation_hash`.
5. Build proof packets with the same included artifacts in different caller orders; assert the packet canonicalization rule produces a deterministic `proof_packet_hash`.
6. Mutate one public-safe field at a time, such as a root, ref, count, expiry, metric root, or signature ref; assert the relevant artifact hash changes.

Pass criteria:

- Equivalent inputs produce byte-for-byte equal public artifacts after canonicalization.
- Meaningful public-safe field changes produce different artifact hashes.
- Hash inputs exclude identity fields so self-referential hashes cannot occur.

### 3. CLI artifact creation

Objective: the `enigma chain` commands create reviewable local artifacts and verify them without network submission or external integration calls.

Required cases:

1. `enigma chain anchor` writes an anchor-batch JSON file with schema id, commitments, count fields, Solana-ready opaque payload metadata, batch id/hash, required boundary flags, and no private input leakage.
2. `enigma chain grant` writes a capability-grant JSON file with issuer, subject, audience, scope, resource-root, expiry, nonce-hash, signature-ref, grant id/hash, and public-safe boundary flags.
3. `enigma chain revoke` writes a capability-revocation JSON file with grant id/hash reference, reason ref, nullifier root, signature ref, revocation id/hash, and public-safe boundary flags.
4. `enigma chain attest` writes a benchmark-attestation JSON file from either a supplied report hash or a locally hashed reviewed report file, without copying the report body or private path into the output.
5. `enigma chain verify --file <artifact>` accepts each valid artifact family and returns an `ok:true` report with schema id, artifact ids/hashes, and validation status only.
6. Each command rejects missing required args, malformed refs, invalid hash strings, negative counts, invalid timestamps, invalid scopes, and unsupported schemas with sanitized errors.

Pass criteria:

- All CLI-created files validate with the matching package validator and the verifier command.
- CLI help and output language states local planning or verification only when the artifact has the non-submission boundary flag.
- No CLI path claims network submission, external integration behavior, production deployment, chain status, third-party approval status, or benchmark rank.

### 4. JSON Schema validation

Objective: every artifact schema accepted by code has a JSON Schema file that accepts valid public-safe artifacts and rejects malformed or unsafe shapes.

Required cases:

1. Validate the current schema files under `specs/` for anchor batch, capability grant, benchmark attestation, and proof packet.
2. Add or require a release blocker for any artifact family exported by the package without a matching schema file, including capability revocation.
3. For each schema, assert required fields, exact schema id, public-safe flag values, positive or non-negative counts, digest formats, ref formats, timestamp formats, and bounded arrays.
4. Assert schemas reject unknown private payload keys and unsafe nested structures where the schema can express those constraints.
5. Assert schema validation and package validation agree for representative valid and invalid fixtures.

Pass criteria:

- A valid artifact from each family passes both JSON Schema validation and package validation.
- Invalid artifacts fail with explainable validation errors.
- Release is blocked if any public artifact can be produced without a corresponding reviewed schema or schema exception.

### 5. Benchmark attestation

Objective: benchmark claims are bound to reviewed public-safe attestation fields, never benchmark record contents.

Required cases:

1. Create an attestation with benchmark ref, dataset ref, runner ref, package ref, report hash, metric root or metric refs, sample count, run count, signature ref, and public-safe boundary flags.
2. Verify the attestation hash changes when report hash, dataset ref, runner ref, package ref, sample count, run count, metric root, or signature ref changes.
3. Build a proof packet containing the benchmark attestation and assert the packet includes the attestation id/hash and schema count without copying report contents.
4. Assert no-score-without-run language in docs and examples: numeric benchmark claims must cite the exact report hash/ref, dataset ref, runner ref, package ref, scorer or metric ref, and review approval.
5. Assert root-only anchors are described as inclusion commitments, not proof that benchmark record contents are true, complete, private, or superior to another system.

Pass criteria:

- Benchmark artifacts contain only hashes, refs, counts, approved aggregate metric refs/roots, timestamps, and signatures.
- Any example score is labeled as tied to a specific reviewed report and cannot be generalized into comparative leadership.
- Private enterprise runs may publish run-status and private-evidence refs without forcing public score disclosure.

### 6. Example artifacts

Objective: examples demonstrate safe usage without becoming accidental restricted-data templates.

Required cases:

1. Validate every example anchor batch, grant, revocation, benchmark attestation, proof packet, and quickstart output included in docs or examples.
2. Scan examples for forbidden private payload terms, private-looking identifiers, local absolute paths, external bodies, benchmark record bodies, and other restricted private material.
3. Confirm every example uses placeholder digests, opaque refs, signature refs, counts, schema ids, and explicit required boundary flags where applicable.
4. Confirm examples that mention Solana say the artifact is Solana-ready or operator-review-ready only, unless an approved network evidence packet is present.
5. Confirm examples that mention benchmark metrics bind them to exact report refs and do not imply broad performance or business outcomes.

Pass criteria:

- Examples are executable or clearly marked as illustrative with valid public-safe shapes.
- Examples can be copied into tests without introducing restricted data or prohibited claims.
- Example comments and prose preserve the same boundaries as the JSON fields.

### 7. Documentation claim-boundary checks

Objective: public docs remain aligned with the Proof Network boundary and do not overclaim.

Required cases:

1. Scan Proof Network docs, README sections, API references, quickstarts, benchmark docs, launch plans, and sales-facing proof docs for prohibited claims.
2. Block language that says or implies Enigma publishes private material, writes private payloads to a public rail, performs network submission when only local artifacts exist, proves chain status, proves external service behavior, provides third-party approval status, promises business outcomes, or proves benchmark superiority without a reviewed comparison packet.
3. Require conditional language for anchoring, signatures, production operations, deployments, comparative benchmarks, audits, and organization-specific security claims.
4. Require evidence-backed nouns: anchor batch, capability grant, capability revocation, benchmark attestation, proof packet, root, hash, opaque ref, signature, nullifier, scope, dataset ref, runner ref, package ref.
5. Require every numeric or operational claim to cite the exact artifact, report hash, command, dataset/file refs, runner version/ref, package version/ref, and review approval.

Pass criteria:

- Docs use local proof generation, local verification, public-safe commitment, and optional Solana-ready phrasing.
- Docs do not expose or request restricted private material in examples.
- Any conditional claim names the condition and evidence required before publication.

### 8. Release gates

Objective: package release is blocked unless proof artifacts, schemas, CLI, examples, and docs satisfy public-safe acceptance.

Gate checklist:

1. Package validators reject private payload keys and restricted values for every artifact family.
2. Deterministic hash tests pass for equivalent inputs and mutation tests prove hash sensitivity.
3. CLI artifact creation and verification tests pass for anchor, grant, revoke, attest, and verify flows.
4. JSON Schema validation covers every public artifact family or a documented blocker exists for missing schema coverage.
5. Benchmark attestation tests prove report bodies and restricted benchmark records are not copied into public artifacts.
6. Proof packet tests prove packet contents are normalized, public-safe, and schema-counted.
7. Example artifacts validate and pass leakage scans.
8. Docs claim-boundary scans pass for prohibited and conditional language.
9. Release notes state the actual scope: local public-safe proof artifact generation and verification, with optional Solana-ready payload preparation only.
10. Publication is blocked if any generated artifact lacks the explicit boundary flags required by its schema.

## Minimum test inventory

| Area | Suggested file or check | Required assertions |
| --- | --- | --- |
| Package API | `test/enigma-proof-network.test.mjs` | constructors, validators, private payload rejection, deterministic hashes, hash mutation sensitivity, packet validation |
| CLI | `test/enigma-chain-cli.test.mjs` | local artifact creation, `chain verify`, sanitized errors, no network submission claims |
| Schemas | schema validation test near existing schema tests | valid artifacts pass, malformed/private artifacts fail, exported schemas and schema files stay in sync |
| Packet script | test for `scripts/build-proof-network-packet.mjs` | report files are hashed by digest/ref only, no body or private path copied, packet validates |
| Examples | docs/example scan | example JSON validates, forbidden payload terms absent, Solana and benchmark language bounded |
| Docs | claim-boundary scan | prohibited claims absent, conditional claims evidence-scoped, numeric claims cite exact refs |

## Failure handling

A failing acceptance test should produce only public-safe diagnostics:

- schema id or command name;
- field path;
- validation code;
- expected public-safe type or format;
- artifact id/hash when available;
- sanitized fixture label.

Diagnostics must not echo the rejected private value, report body, external body, local private path, private identifier, or full input object.

## Done definition

Proof Network release acceptance is complete only when the matrix above passes and the release record contains the exact commands or checks that were run, the package version/ref, schema refs, artifact refs, and reviewer approval. If any gate is skipped, the release record must say it is skipped and mark the release as not accepted for public proof-network publication.