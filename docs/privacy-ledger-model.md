# Privacy ledger model

Enigma is the private memory controller for AI. The privacy ledger model separates private memory operations from public proof coordination with two ledgers: a local private ledger and a public proof ledger. Solana is optional proof, permission, and settlement infrastructure for opaque commitments; it is not a memory database.

A public proof artifact can show that a commitment, root, grant, revocation, attestation, settlement ref, or packet hash existed in a declared envelope. It must not reveal raw memory, prompts, transcripts, completions, embeddings, policy bodies, access-control bodies, provider responses, private identities, tenant names, API keys, private keys, seed phrases, or credential-bearing URLs. It also must not claim provider deletion, model forgetting, live SaaS operation, live Solana deployment, compliance certification, ROI, or benchmark superiority.

## 1. Ledger split

| Layer | Location | Primary reader | Purpose | Publication rule |
| --- | --- | --- | --- | --- |
| Local private ledger | User/operator-controlled Enigma vault, BYOC store, on-prem store, or offline audit bundle | Memory owner, authorized operator, confidential auditor | Complete event history for Enigma-mediated memory creation, retrieval, context-pack export, policy decision, grant, revocation, tombstone, compaction, and verifier activity | Never public by default. Contains private payload refs and may contain sensitive operational metadata. |
| Local proof ledger | Local proof artifacts and proof packets | Operator, reviewer, CI/verifier, confidential auditor | Public-safe receipts derived from the private ledger: roots, refs, counts, policy hashes, capability commitments, leakage-scan results, verifier output | Shareable only after private-payload checks pass. |
| Public proof ledger | Optional Solana anchor, registry, release packet, public repo artifact, or third-party verifier record | External observer, partner verifier, ecosystem auditor | Durable commitment to a batch root, grant/ref, revocation/nullifier, benchmark attestation, settlement ref, or packet hash | Hashes/roots/refs/counts/signatures only. No raw memory, prompts, transcripts, completions, embeddings, ACL bodies, tenant names, provider responses, secrets, wallet seed material, or private local paths. |

The private ledger is the source of operational truth. The public proof ledger is a derived commitment layer. If they disagree, the public layer cannot invent context; the operator must regenerate the proof from an approved local snapshot or mark the proof unavailable.

## 2. Field placement

### 2.1 Local private ledger fields

The private ledger may hold fields needed for local control, replay, and confidential audit:

| Field family | Examples | Notes |
| --- | --- | --- |
| Event identity | Private event id, monotonic sequence, local clock reading, prior event hash | Public packets should expose only commitments, rounded timestamps, or sequence ranges when needed. |
| Memory material | Memory body, source excerpt, user note, imported record, derived summary, context-pack body | Never copied into public proof artifacts. |
| Retrieval material | Query text, selected memory ids, omitted memory ids, scores, scorer internals, embedding/vector refs | Public packets may expose selected/omitted roots and counts, not queries, scores, embeddings, or selected text. |
| Policy material | Policy body, rule text, private subject attributes, purpose details, data labels, legal-hold rationale | Public packets use policy hashes, rule refs, decision refs, and allow/deny status only. |
| Access control | Private ACL body, internal group membership, operator identity, account mapping | Public grants use issuer refs, subject refs, capability names, scope commitments, expiry, nonces, and signatures. |
| Provider/tool material | Provider request, response, tool payload, transcript, completion, error body | Public packets use provider/tool refs only if non-identifying and approved. |
| Commitment openings | Per-record random nonce, epoch salt id, private salt/HMAC key reference, Merkle proof path, canonicalization version | Open only to authorized auditors under a confidential review workflow. |
| Operations | Tombstone reason, compaction trace, import/export logs, SIEM mapping, support notes | Public packets use reason refs and counts; no free-text incident detail. |

Local does not mean unconstrained. Local ledger stores and exports still need least privilege, encryption where available, secret redaction, retention limits, and a release review before anything leaves the boundary.

### 2.2 Local proof ledger fields

The local proof ledger is the public-safe derivative that can be shared after validation:

| Artifact family | Public-safe fields | Excluded fields |
| --- | --- | --- |
| Anchor batch | `schema`, `batch_id`, `created_at`, `anchor_root`, `root_count`, root kinds, root hashes, root counts, `public_refs`, `privacy_boundary`, `solana_anchor.payload_hash`, `opaque_payload`, signer refs, signatures, `transaction_submitted:false`, `raw_memory_on_chain:false` | Raw memory, prompts, transcripts, completions, embeddings, private paths, tenant names, provider responses, wallet private keys, seed phrases, RPC credentials. |
| Capability grant | Grant id/hash, issuer ref, subject ref, capability name, scope commitment/ref, issued-at, expires-at, nonce commitment, audience ref, policy hash, signer ref, signature | Private ACL body, human tenant or account name, private subject attributes, raw policy text, bearer tokens. |
| Capability revocation | Revocation id/hash, grant ref/hash, scope ref/hash, nullifier commitment, reason ref, effective time, issuer/signer ref | Private incident text, subject identity details, ACL body, customer name. |
| Benchmark attestation | Report hash, dataset ref/hash, runner ref/hash, package ref/hash, metric digest/count, environment ref, leakage-scan result, claim boundaries | Dataset rows, questions, answers, prompts, completions, provider responses, hidden challenge records. |
| Proof packet | Packet id, packet root, artifact hashes, artifact refs, artifact counts, leakage scan, claim boundaries, verifier refs | Any nested private artifact body or raw operational log. |
| Settlement reference | Quote/receipt hash, service ref, amount/currency bounds if approved, settlement ref, signer refs | Raw workload, invoice secret, customer name, provider billing detail, ROI/cost-savings claims. |

### 2.3 Public proof ledger fields

A public chain or registry should store the smallest useful commitment:

- domain separator, such as `enigma.proof_network.anchor_batch.v1`;
- schema version and canonicalization ref;
- batch root, artifact hash, packet hash, or settlement ref hash;
- root kind and count when necessary for verifier routing;
- opaque public refs approved for publication;
- signer or program refs that do not identify private tenants;
- optional memo ref that points to a public-safe packet, not private evidence;
- explicit boundary flags when represented in the artifact: `transaction_submitted:false` for local plans and `raw_memory_on_chain:false` for chain-bound artifacts.

The public proof ledger must not include direct hashes of low-entropy private values such as names, emails, short prompts, small ACL bodies, local usernames, account labels, or private dataset names. Those values are guessable even when hashed.

## 3. Commitments and addresses

Commitments bind private state without publishing it. Every commitment should be domain-separated, canonicalized, and selected for the entropy of the underlying value.

### 3.1 Canonical input

Every committed object should first be converted to a deterministic representation:

1. Select only the fields intended for that commitment domain.
2. Normalize field order, encodings, timestamps, and absent/null values.
3. Prefix a domain string such as `enigma.memory_event.v1`, `enigma.capability_scope.v1`, `enigma.grant_nullifier.v1`, or `enigma.anchor_batch.v1`.
4. Include schema version and canonicalization version.
5. Hash or HMAC the canonical bytes.

Domain separation prevents a digest from one context from being replayed as a valid digest in another context.

### 3.2 High-entropy public refs

A plain `sha256:` digest is acceptable for material that is already high entropy or already public-safe, such as a random packet id, generated nonce, package tarball hash, public release artifact, or canonical public-safe proof packet.

```text
sha256(domain || canonical_public_safe_bytes)
```

Do not use a plain hash for short private strings, tenant labels, email addresses, human-readable prompts, ACL snippets, account labels, or private dataset names.

### 3.3 Salted private commitments

Salted commitments are useful when a verifier may later receive the salt through a private audit process:

```text
commitment = sha256(domain || record_nonce_128bit_or_more || canonical_private_tuple)
```

Rules:

- Generate `record_nonce` with at least 128 bits of randomness.
- Store the nonce only in the local private ledger or a private audit package.
- Publish the digest and, if necessary, an opaque salt ref; do not publish the salt in the public ledger.
- Open salts only for selected records and authorized auditors.
- Do not reveal neighboring record nonces when opening one record.

Salted commitments are weaker than HMAC commitments for low-entropy public values because an exposed salt enables dictionary checks.

### 3.4 HMAC commitments

For stable public refs where dictionary resistance matters, prefer keyed commitments:

```text
commitment = hmac_sha256(epoch_commitment_key, domain || canonical_tuple || optional_record_nonce)
```

Rules:

- Keep `epoch_commitment_key` local or inside customer-controlled KMS/BYOK custody.
- Public artifacts may include a non-sensitive `key_ref` or `epoch_ref`, never the key.
- Rotate keys by epoch, ledger, deployment, or customer boundary to reduce cross-batch linkability.
- Derive separate keys for memory addresses, content commitments, capability nullifiers, benchmark private refs, and settlement refs.
- Never reuse HMAC commitment keys for signatures, encryption, API authentication, provider credentials, or wallet operations.

A public HMAC commitment proves possession of a keyed digest, not the truth, completeness, legality, deletion, or business value of the underlying memory.

### 3.5 Merkle roots and proof paths

The local proof ledger should aggregate commitments into Merkle roots before publication:

- leaf = domain-separated commitment for one event, grant, revocation, attestation, settlement ref, or packet;
- internal node = hash of domain, left child, right child, tree version;
- root = public-safe commitment to the batch;
- proof path = private or auditor-scoped unless every leaf in the path is already public-safe.

Merkle roots support auditor sampling: the public ledger can hold one root, while a confidential auditor can inspect selected private records, nonces, and proof paths without exposing the full ledger.

## 4. Batch cadence

Batching is both a cost control and a privacy control. Enigma should not publish one public event per sensitive memory operation unless the operator has explicitly accepted the metadata leakage.

| Cadence | Use when | Privacy effect | Caution |
| --- | --- | --- | --- |
| Per operation, local only | Append to the private ledger immediately after Enigma-mediated action | Preserves replayability without public timing leakage | Local clock and sequence still need tamper-evident chaining. |
| Per event, public | A counterparty needs immediate evidence for one bounded operation | Minimal; timing and count are easy to correlate | Highest freshness, highest leakage; require explicit approval. |
| Short rolling batch | Interactive workflows need near-real-time proof refs | Hides individual event timing inside a small group | Exact cadence can reveal workload rhythm; use jitter and minimum batch size. |
| Fixed window | Routine memory operations can wait for scheduled anchoring | Makes timing less tied to individual actions | Delays public evidence. |
| Threshold batch | Publish only after enough events accumulate | Avoids revealing sparse activity as a single event | Public timing may reveal threshold crossings. |
| Manual release batch | High-risk environments require human review | Strongest review control before publication | Lowest automation and freshness. |
| Revocation-sensitive batch | Grant revocation/nullifier evidence needs faster propagation | Reduces acceptance window for revoked capabilities | Immediate publication can reveal incident timing; use reason refs, not incident text. |
| Audit/export batch | Produce packet for a reviewer or customer checkpoint | Keeps publication scoped to an approved review moment | Export bundle must pass leakage scan and claim-boundary review. |

Recommended default: append private events immediately, derive local proof roots continuously, and publish public anchor batches only at approved checkpoints with fixed windows or manual release batches, minimum batch sizes, rounded timestamps, and opaque refs.

## 5. Leakage risks and mitigations

Even hash-only artifacts can leak information through structure and timing.

| Risk | How it leaks | Mitigation |
| --- | --- | --- |
| Dictionary attack on hashes | Observer hashes likely tenant names, emails, prompts, ACL strings, or dataset names and compares outputs | Use HMAC or high-entropy random nonces; never publish plain hashes of low-entropy private values. |
| Cross-batch linkability | Same subject, scope, policy, memory ref, signer, or settlement ref appears in many public artifacts | Rotate epoch keys, use scoped refs, avoid stable human-readable ids, and aggregate into batches. |
| Timing correlation | Anchor time matches a customer incident, model run, support ticket, benchmark window, or revocation | Round timestamps, use batch windows, add operational jitter, and avoid incident-specific public reason text. |
| Count leakage | Root counts reveal customer size, workload spikes, benchmark set size, deletion volume, or support load | Publish coarse counts where possible, bucket counts for public artifacts, or keep exact counts in confidential packets. |
| Ref leakage | `public_refs` reveal package, dataset, customer, connector, branch, path, or internal project names | Use approved opaque refs; forbid tenant names, local paths, emails, account ids, and private dataset labels. |
| Signature/key linkage | Same signer ref links multiple customers or deployments | Use deployment-scoped signer refs, key rotation, and customer-controlled key custody where appropriate. |
| Solana account linkage | Wallet address, memo, program account, or explorer trail ties proofs to a tenant/operator | Use operator-approved public refs only; do not include seed phrases, private keys, credentialed RPC URLs, tenant labels, or account names. |
| Auditor overexposure | Audit bundle includes full private ledger when sampling would suffice | Provide sampled openings, Merkle paths, verifier output, and scoped extracts; keep raw payload access need-to-know. |
| Unknown-field smuggling | A public artifact adds harmless-looking free-text or metadata fields that contain private content | Schemas must be allowlist-only and reject unknown fields. |
| Public verifier overclaim | A verifier treats a valid root as proof of content truth, deletion, compliance, live settlement, or benchmark superiority | Carry claim boundaries with every packet and repeat that roots prove commitments to snapshots, not external facts. |

## 6. Auditor views

Auditors should receive the narrowest view that answers the review question.

| View | Audience | Contents | Not included |
| --- | --- | --- | --- |
| Public verifier view | Anyone validating a packet, release artifact, or optional anchor payload | Schema id, artifact type, hashes, roots, refs, counts, coarse timestamps, signatures, verifier status | Private preimages, salts, memory, prompts, transcripts, completions, embeddings, provider responses, policy bodies, private identities. |
| Counterparty proof view | Party verifying a bounded grant, revocation, attestation, or settlement ref | Public verifier view plus the specific private disclosure approved for that counterparty, if any | Unrelated local ledger rows, unrelated subjects, broad history, secrets. |
| Confidential audit view | Approved auditor under private review terms | Selected local ledger rows, selected salts or preimages when required, mapping from private rows to public commitments, release-gate evidence, verifier transcript hashes | Secrets not needed for audit, unrelated records, provider response bodies unless explicitly in scope and permitted. |
| Operator incident view | Internal operator investigating a failed gate or suspected leak | Local diagnostic context, failed artifact, rejection reasons, and remediation notes | Material beyond the incident scope or any unredacted export outside the local boundary. |

An auditor view is not automatically publishable. Anything derived from a private audit view must pass the same public proof release gates before it can become a public artifact.

A confidential auditor should be able to recompute selected commitments and confirm they roll up to the public root while seeing no records outside the approved audit scope.

## 7. End-to-end flow

1. Enigma mediates a memory operation locally.
2. The private ledger appends an event containing private operational detail and a chained event hash.
3. The commitment engine derives domain-separated salted or HMAC commitments for the event fields that need public accountability.
4. The local proof ledger builds roots over commitments and emits public-safe artifacts.
5. A leakage scanner rejects forbidden field names, secret-looking values, raw payloads, private paths, tenant names, prompts, transcripts, completions, embeddings, provider responses, and keys.
6. A proof packet records artifact hashes, roots, refs, counts, verifier refs, and claim boundaries.
7. At an approved cadence, an anchor batch commits the packet/root set and remains local with `transaction_submitted:false` unless a separate operator-controlled submission workflow is approved.
8. Optional public anchoring publishes only the compact commitment, never the private ledger or its openings.
9. Auditors verify either the public-safe artifact alone or a confidential sample opening against the same root.

## 8. Privacy release gates

Before any public proof ledger artifact, documentation example, release packet, or optional Solana-ready payload leaves the local boundary, all gates must pass:

1. **Field allowlist gate**: every public field is in the approved schema and every unknown field is rejected.
2. **Private-payload gate**: no raw memory, prompt, transcript, completion, embedding, provider response, private policy body, ACL body, tenant name, user name, customer name, local path, credential, private key, seed phrase, or credential-bearing URL appears at any depth.
3. **Commitment gate**: public refs are hashes, HMAC commitments, salted commitments without public salts, roots, nullifiers, or opaque ids; raw preimages are absent.
4. **Domain-separation gate**: commitments identify their purpose or version so values from one domain cannot be replayed as another domain.
5. **Metadata gate**: timestamps, counts, refs, sequence ids, signer refs, and batch windows are reviewed for correlation risk.
6. **Batching gate**: per-event publication is rejected unless freshness is required and the metadata risk is explicitly accepted.
7. **Auditor-view gate**: private audit material is separated from public verifier material, and only the public verifier material is exported.
8. **Solana boundary gate**: optional chain payloads contain public-safe roots/refs only and clearly distinguish local planning from submitted transactions.
9. **Claim boundary gate**: copy does not imply provider deletion, model forgetting, legal compliance, chain finality, live hosted operation, ROI, token value, or universal benchmark superiority without separate approved evidence.
10. **Human review gate**: a reviewer confirms the artifact is public-safe before publication or anchor submission.

Failure is closed: if a gate cannot be evaluated, the artifact remains local and unpublished.

## 9. Publication checklist

Before any privacy-ledger artifact leaves the operator boundary, confirm:

- [ ] The artifact contains no raw memory, prompts, transcripts, completions, embeddings, ACL bodies, tenant names, provider responses, secrets, private keys, seed phrases, API keys, credentialed URLs, or local identifying paths.
- [ ] Low-entropy private values are protected with HMAC or high-entropy nonces, not plain hashes.
- [ ] Public refs are opaque and approved for publication.
- [ ] Counts and timestamps are no more precise than the review use case requires.
- [ ] Batch cadence does not reveal sensitive operational timing.
- [ ] Commitment domains, schema versions, and canonicalization versions are recorded.
- [ ] HMAC keys, salts, and nonces remain local except for scoped confidential audit openings.
- [ ] Solana or other public rails carry only hashes, roots, refs, counts, and signatures.
- [ ] Claim boundaries state that the proof does not establish provider deletion, model forgetting, compliance certification, benchmark superiority, ROI, token value, live hosted operation, or live chain settlement.

Keep private memory useful locally and public proof artifacts boring publicly. Public ledgers should be easy to verify, hard to correlate, and impossible to use as a source of private memory reconstruction.
