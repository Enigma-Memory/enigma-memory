# Proof Network threat model

This document is the release threat model for Enigma's Proof Network: privacy-preserving proof artifacts for AI memory with local-only CLI planning, Solana-ready root anchoring, capability grants, capability revocations, benchmark attestations, and proof packets.

The Proof Network is a public evidence layer, not a public data layer. Public artifacts may carry hashes, roots, refs, counts, schema ids, timestamps, signatures, nullifiers, and verifier outcomes. Public artifacts must never carry raw memory, prompts, transcripts, completions, embeddings, ACL bodies, tenant names, private keys, API keys, seed phrases, provider responses, local user paths, or credential-bearing URLs.

The chain CLI boundary is local planning only. `enigma chain anchor`, `grant`, `revoke`, `attest`, and `verify` may generate or verify JSON, but they must not submit Solana transactions, create accounts, contact RPC providers, or represent a local plan as final settlement.

## Scope

In scope:

- `enigma.proof_network.anchor_batch.v1` artifacts.
- `enigma.proof_network.capability_grant.v1` artifacts.
- `enigma.proof_network.capability_revocation.v1` artifacts.
- `enigma.proof_network.benchmark_attestation.v1` artifacts.
- `enigma.proof_network.packet.v1` envelopes.
- Local `enigma chain anchor|grant|revoke|attest|verify` planning and validation commands.
- Public-safe documentation examples, fixtures, and release artifacts.

Out of scope:

- Solana transaction submission, wallet custody, account creation, RPC provider operation, or chain finality claims.
- Provider deletion, model forgetting, compliance certification, token ROI, provider invoice savings, or truth of memory content.
- Raw benchmark datasets, private reports, prompts, answers, completions, provider responses, embeddings, and customer policy bodies.

## Privacy boundaries

### Local memory boundary

Allowed public material:

- `sha256:` commitments, Merkle roots, root refs, sequence refs, artifact ids, counts, schema ids, and signatures.

Forbidden public material:

- Raw memory text, private context packs, prompts, transcripts, completions, embeddings, provider responses, local paths, and user identifiers.

Required control:

- Every create and validate path calls `assertNoPrivateProofPayload(value)` before returning or accepting a public proof artifact.

### Capability boundary

Allowed public material:

- Grant ids, issuer refs, subject refs, audience refs, exact scope ids, issued-at, expires-at, nonce hashes, grant hashes, and revocation nullifiers.

Forbidden public material:

- ACL bodies, tenant names, user emails, private policy text, bearer tokens, private keys, seed phrases, and connector config bodies.

Required control:

- Grants are least-privilege, expiring, nonce-bound, operation-bound, and revocable without disclosing private subjects.

### Benchmark boundary

Allowed public material:

- Report hash, dataset ref, dataset hash, runner ref, package ref, aggregate metric names, metric boundary, and reproducibility refs.

Forbidden public material:

- Dataset rows, questions, answers, conversations, prompts, completions, provider credentials, and raw report text unless separately reviewed as public-safe.

Required control:

- Benchmark attestations bind to hashes and refs only and do not convert private benchmark data into public proof payloads.

### Chain boundary

Allowed public material:

- Opaque anchor batch hash/root, artifact type, network hint, local transaction plan id, `transaction_submitted:false`, and `raw_memory_on_chain:false`.

Forbidden public material:

- Wallet seed phrases, private keys, credentialed RPC URLs, tenant-linked wallet labels, raw account owner names, memory payloads, and provider responses.

Required control:

- Chain commands emit offline planning artifacts only and make non-submission explicit.

### Connector boundary

Allowed public material:

- Connector profile refs, capability refs, proof packet hashes, artifact schema ids, and recomputed verifier status.

Forbidden public material:

- Connector config secrets, local usernames in paths, copied config files, injected memory text, and connector-supplied private metadata.

Required control:

- Connectors are untrusted. Packet validation recomputes artifact hash and verifier status rather than trusting connector assertions.

### Settlement boundary

Allowed public material:

- Quote hashes, receipt hashes, service refs, public operator refs, amount/currency fields, root refs, signer refs, and dispute refs.

Forbidden public material:

- Customer names, private workload descriptions, prompts, transcripts, invoice secrets, provider responses, and profit/savings claims.

Required control:

- Settlement artifacts prove bounded service metadata only. They do not prove provider savings, token profit, provider deletion, model forgetting, or compliance.

## Assets and security goals

| Asset | Security goal | Required property |
| --- | --- | --- |
| Anchor batch | Integrity, public verifiability, privacy minimization | Binds roots/refs into an opaque chain-ready plan without raw memory. |
| Capability grant | Least privilege, replay resistance, auditable authorization | Scope, issuer, subject, audience, nonce, and expiry are explicit. |
| Capability revocation | Public invalidation without subject disclosure | Revokes by grant hash/nullifier rather than private identity. |
| Benchmark attestation | Reproducibility, poisoning resistance, claim discipline | Binds report, dataset, runner, and package refs without raw benchmark data. |
| Proof packet | Safe interchange envelope | Carries one supported artifact, artifact hash, schema, and verifier metadata. |
| CLI chain artifact | Operator-safe planning evidence | Local JSON only; no transaction submission, account creation, network call, or secret. |
| Proof schemas | Fail-closed validation | Unknown/private fields and unsafe values are rejected. |

## Threats, mitigations, and tests

### 1. Privacy leakage

Attack path:

- A caller includes private fields such as raw memory, prompt text, transcript text, embedding vectors, provider response bodies, ACL bodies, tenant names, credentials, or seed material in an anchor, grant, revocation, attestation, or packet.

Impact:

- Public proof artifacts expose private user data, customer metadata, provider content, or credentials.

Mitigations:

- Centralize private key and private value rejection in `assertNoPrivateProofPayload(value)`.
- Run the private-payload assertion in every `create*` and `validate*` function.
- Keep public schemas allowlisted and reject unknown fields that could become covert payload channels.
- Use hashes, roots, refs, counts, nullifiers, and signatures instead of memory or policy bodies.
- Keep documentation examples hash-only and ref-only.

Tests:

- `PN-TM-001`: pass forbidden top-level keys into each artifact creator and expect rejection.
- `PN-TM-002`: pass forbidden nested keys into each validator and expect rejection.
- `PN-TM-003`: pass secret-looking values, private-key-looking blocks, credentialed URLs, and long free-text payloads and expect rejection.
- `PN-TM-004`: verify CLI-generated chain artifacts include `raw_memory_on_chain:false` and do not include private field names.

### 2. Metadata correlation

Attack path:

- Repeated roots, timestamps, counts, tenant-linked refs, account labels, local file names, dataset paths, or connector names allow observers to correlate artifacts across releases, customers, or operators.

Impact:

- An observer infers tenant identity, memory activity, benchmark activity, connector usage, or business events even without raw memory.

Mitigations:

- Prefer opaque refs and salted/structured commitments over names for tenants, users, accounts, datasets, and connectors.
- Do not publish absolute local paths or workstation usernames.
- Publish counts only when needed for verification.
- Avoid exact operational timing unless freshness requires it; use issued/expiry windows rather than detailed activity timelines where possible.
- Rotate grant refs and separate public packet ids from private operator ids.

Tests:

- `PN-TM-010`: benchmark attestations include file/ref name plus input hash only, not absolute paths.
- `PN-TM-011`: grants and anchors reject tenant names, emails, account names, and local path-like values.
- `PN-TM-012`: packet ids and grant ids remain opaque and do not embed connector names or user names.
- `PN-TM-013`: fixtures verify counts and timestamps are the minimum needed by the schema.

### 3. Malicious connector injection

Attack path:

- A compromised connector submits a proof packet with extra private fields, overbroad capability scope, unsupported artifact type, stale root, forged verifier metadata, or a mismatched artifact hash.

Impact:

- Private data enters public evidence, unauthorized capability is accepted, or operators trust a false `valid:true` result.

Mitigations:

- Treat connector packets as untrusted input.
- Validate packet schema, supported artifact schema, capability scope, freshness, and artifact hash.
- Recompute verifier status; never trust connector-supplied `valid:true` alone.
- Reject unknown artifact types and private payload fields.
- Require packet operation to match the bound grant scope.

Tests:

- `PN-TM-020`: mutate a valid packet with an unsupported artifact schema and expect failure.
- `PN-TM-021`: add private payload fields to a packet and expect failure.
- `PN-TM-022`: overbroaden grant scope or bind a grant to the wrong packet operation and expect failure.
- `PN-TM-023`: alter artifact content without updating artifact hash and expect failure.
- `PN-TM-024`: set forged verifier metadata to `valid:true`; validation recomputes and rejects the packet.

### 4. Stale derived artifacts

Attack path:

- An anchor, grant, revocation, benchmark attestation, or packet is generated from a superseded root, old package ref, old report hash, expired grant, or already revoked capability.

Impact:

- Public proof appears fresh while binding obsolete state or revoked authority.

Mitigations:

- Include source root/report/package refs, created-at, issued-at, expires-at, sequence refs, and revocation nullifiers where applicable.
- Validate expiration and revocation status before returning `valid:true`.
- State that roots prove only the referenced snapshot, not current global state.
- Bind packets to artifact hashes and freshness windows.

Tests:

- `PN-TM-030`: expired grants are rejected or marked expired.
- `PN-TM-031`: revoked grants with matching nullifier are rejected or marked revoked.
- `PN-TM-032`: stale packet timestamps fail freshness validation.
- `PN-TM-033`: changed source root, report hash, or package ref causes validation failure.
- `PN-TM-034`: verification output distinguishes stale/revoked from valid rather than silently accepting old state.

### 5. Benchmark poisoning

Attack path:

- An attestation points to a report generated from modified datasets, answer leakage, provider completions, tuned fixture rows, unpinned runner logic, unverifiable package versions, or unsupported benchmark claims.

Impact:

- Public material overclaims memory quality, benchmark leadership, provider comparison, or LLM answer accuracy.

Mitigations:

- Bind attestation to report hash, dataset ref, dataset hash, runner ref, package ref, metric boundary, and claim boundary.
- Keep raw dataset rows, questions, answers, conversations, prompts, and completions out of attestations.
- State whether metrics are retrieval/evidence proxy metrics rather than LLM answer accuracy.
- Reject unsupported claim types such as provider leadership, provider savings, token ROI, provider deletion, and model forgetting.

Tests:

- `PN-TM-040`: attestation without dataset hash, runner ref, package ref, or report hash fails.
- `PN-TM-041`: attestation containing raw rows, questions, answers, prompts, or completions fails.
- `PN-TM-042`: mutated report hash fails verification.
- `PN-TM-043`: unsupported claim booleans or benchmark-leadership language fail documentation/example checks.
- `PN-TM-044`: generated benchmark attestations preserve metric boundary text.

### 6. Grant replay

Attack path:

- A capability grant is reused after expiry, copied across scopes, replayed with another packet, replayed by another subject, or used after revocation.

Impact:

- An unauthorized connector or operator performs anchoring, attestation, revocation, or verification actions outside the approved scope.

Mitigations:

- Grants include unique nonce/grant id, issuer ref, subject ref, optional audience ref, exact operation scopes, issued-at, expires-at, and grant hash.
- Packets bind to the grant hash and requested operation.
- Revocations publish nullifier artifacts that do not disclose private subjects.
- Validators reject expired, wrong-scope, wrong-subject, wrong-audience, duplicate, or revoked grants.

Tests:

- `PN-TM-050`: replay an expired grant and expect rejection.
- `PN-TM-051`: reuse a grant id with changed scope and expect hash/id mismatch.
- `PN-TM-052`: attach a grant to the wrong packet operation and expect rejection.
- `PN-TM-053`: include a matching revocation nullifier and expect revoked status.
- `PN-TM-054`: duplicate nonce replay is rejected where a nonce cache or fixture set is provided.

### 7. Solana account disclosure

Attack path:

- Chain planning output includes wallet labels, tenant-linked account names, seed phrases, private keys, credentialed RPC URLs, or account metadata that can deanonymize operators.

Impact:

- Public chain data or support artifacts link operators to tenants, reveal private wallet material, or compromise signing authority.

Mitigations:

- Anchor batches remain opaque and local-only.
- Never include seed phrases, private keys, or credentialed URLs in artifacts, docs, fixtures, or tests.
- Prefer operator-controlled public refs and network hints instead of account names.
- Always emit `transaction_submitted:false` and `raw_memory_on_chain:false`.
- Do not claim finality, confirmation, or settlement until a separate operator-controlled chain process provides reviewed evidence.

Tests:

- `PN-TM-060`: `enigma chain anchor` output includes `transaction_submitted:false` and `raw_memory_on_chain:false`.
- `PN-TM-061`: anchor batch validation rejects seed/private-key/account-name fields.
- `PN-TM-062`: chain artifacts reject credentialed RPC URLs and secret-looking values.
- `PN-TM-063`: chain examples contain no wallet seed material or tenant-linked account labels.

### 8. Settlement fraud

Attack path:

- A service, connector, or operator submits fake receipts, duplicate settlement refs, wrong roots, inflated amounts, missing signer refs, or public claims that imply token ROI/provider savings from proof artifacts.

Impact:

- Operators pay for unperformed work, disputes cannot be resolved, or public claims become misleading.

Mitigations:

- Bind settlement-facing artifacts to quote hash, receipt hash, service ref, root ref, amount bounds, unique settlement ref, and signer ref.
- Reject duplicate refs, amount-above-quote, wrong-root, missing-signer, and unsupported-claim artifacts.
- Keep settlement claim boundaries explicit: no provider invoice savings, token profit, compliance, provider deletion, or model forgetting claim follows from proof-network validation.
- Preserve dispute refs and fraud indicators without revealing private workloads.

Tests:

- `PN-TM-070`: amount above quote fails validation.
- `PN-TM-071`: duplicate settlement ref fails validation or produces a fraud indicator.
- `PN-TM-072`: wrong root ref or missing signer ref fails validation.
- `PN-TM-073`: ROI/provider-savings/token-profit claim fields fail validation.
- `PN-TM-074`: settlement fixtures do not include private workload text, prompts, transcripts, tenant names, or provider responses.

## Public artifact validation rules

1. Fail closed on private-looking keys at every nested level.
2. Fail closed on private-looking string values and long unstructured text blobs.
3. Prefer refs, roots, hashes, counts, nullifiers, signatures, and schema ids over names or bodies.
4. Bind each proof claim to its exact snapshot and schema.
5. Make local-only chain behavior explicit with `transaction_submitted:false` and `raw_memory_on_chain:false`.
6. Separate structural proof validity from business, legal, model behavior, and provider-operation claims.
7. Reject unsupported schema ids rather than preserving them as opaque extensions.
8. Treat connector-provided verification status as advisory until recomputed locally.

## Minimum regression suite

The release should keep focused tests for the new proof-network surface. These are targeted tests, not project-wide gates:

- Pure module tests for all `create*` and `validate*` functions.
- Forbidden payload tests for keys and values at top-level and nested positions.
- Hash/ref mutation tests for every artifact type.
- CLI artifact tests for `anchor`, `grant`, `revoke`, `attest`, and `verify` with public-safe inputs.
- CLI negative tests for private-looking flags, private-looking JSON files, unsupported schemas, and stale artifacts.
- Replay/freshness tests for expired grants, duplicate nonces, revoked nullifiers, stale packets, and wrong operation scopes.
- Benchmark poisoning tests for missing refs, mutated report hashes, raw dataset rows, and unsupported benchmark claims.
- Solana disclosure tests for private keys, seed phrases, credentialed RPC URLs, account labels, and false transaction-submitted claims.
- Settlement fraud tests for duplicate refs, amount-above-quote, wrong roots, missing signers, and unsupported ROI/provider-savings claims.
- Documentation/example scans for forbidden private field names, secret-looking values, and overclaim language.

## Residual risks

- Public roots, counts, and timestamps can still leak operational patterns through frequency analysis.
- Hashes do not make low-entropy private values safe to publish. Tenant names, emails, short prompts, and small ACL bodies need a reviewed commitment design before public use.
- Local chain planning does not prove Solana finality, account privacy, or settlement completion.
- Benchmark attestations prove a report hash/ref relationship, not dataset licensing, fair external-provider comparison, or LLM answer correctness.
- Capability grants reduce authorization ambiguity but do not protect a compromised local machine, stolen signing key, or malicious connector that already has authorized local access.
- Settlement receipts can bound service evidence, but dispute resolution still needs operator process, key custody, and fraud review outside the artifact schema.

## Release checklist

Before publishing proof-network artifacts or docs:

1. All public examples use hashes, roots, refs, counts, signatures, and nullifiers only.
2. Every artifact creator and validator rejects private keys, private-looking fields, and private-looking values.
3. Chain planning output includes `transaction_submitted:false` and `raw_memory_on_chain:false`.
4. Grants are scoped, expiring, nonce-bound, operation-bound, and revocable.
5. Benchmark attestations include report, dataset, runner, and package refs but no raw benchmark rows.
6. Settlement-related artifacts bind quote/receipt/root/signer refs and reject ROI/provider-savings/token-profit claims.
7. Documentation avoids claims of provider deletion, model forgetting, compliance certification, chain finality, token ROI, provider invoice savings, or benchmark leadership unless separately evidenced and approved.
