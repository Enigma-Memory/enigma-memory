# Novelty invention candidates

This is a claim-bounded technical ideation memo for Enigma's proof-network roadmap. It is technical product ideation only. Each "novelty" item is a product and systems hypothesis to prototype and review against known engineering approaches before any stronger public claim is made.

Public artifacts referenced here must remain plaintext-minimized: hashes, roots, refs, counts, signatures, schema names, timestamps, and policy identifiers are acceptable; raw memory, prompts, transcripts, completions, embeddings, ACL bodies, tenant names, private keys, seed phrases, API keys, and provider responses are not.

## Evaluation lens

Each candidate is useful only if it can be implemented as local, deterministic proof-network behavior:

- **Proof boundary:** evidence covers declared Enigma-mediated events, not external provider internals.
- **Privacy boundary:** public packets carry commitments and refs, not private memory or customer-identifying data.
- **Experiment boundary:** first experiments should be repository-local fixtures and validators, not Solana submissions or external-service calls.
- **Claim boundary:** language should say what the artifact verifies and what it does not verify.

## 1. Dual-root memory passport

**Candidate disclosure.** A Memory Passport carries two independently computed public roots for the same private memory corpus: a custody/lifecycle root over committed memory addresses and event receipts, and a semantic-use root over scoped capability, relevance, and purpose classifications. The passport verifier accepts the passport only when both roots bind to the same epoch, issuer, memory-count summary, and policy-ref set, without exposing memory bodies or embeddings.

**Technical mechanism.** The passport packet stores `custody_root`, `semantic_root`, `epoch_ref`, `previous_epoch_root`, `memory_count`, `policy_refs`, `issuer_key_ref`, and `signature`. A verifier checks that both roots are signed for the same epoch and that downstream context packs cite the same epoch refs.

**Novelty hypothesis.** Existing portable-memory exports usually focus on either content portability or audit logs. The dual-root model makes custody proof and semantic-use proof separable but cross-bound, so a verifier can check that a context pack was derived from the right controlled corpus and the right purpose boundary without learning the corpus.

**Prior-art risk.** Content-addressed archives, Merkle audit logs, verifiable credentials, capability systems, and RAG index manifests may already cover pieces of this structure. The risk is highest if prior systems already bind a semantic access graph to a portable user-memory corpus using independent commitments.

**Claim boundary.** The passport can claim root consistency for an Enigma-controlled corpus epoch. It cannot claim that third-party providers, exported files, screenshots, backups, or model state match the passport.

**First experiment.** Add a local fixture that creates a passport with custody and semantic roots, then prove that changing either root, epoch, count, policy ref, or signature fails verification while public output still contains no memory plaintext.

## 2. Boundary receipt handshake

**Candidate disclosure.** Before memory crosses an Enigma boundary into a model, agent, connector, or gateway, both sides perform a local handshake: requester nonce, purpose ref, policy hash, memory-root ref, allowed-output class, and receiver capability ref are committed into a pre-receipt; the final boundary receipt then binds the pre-receipt hash to the actual disclosure root and denial/approval result.

**Technical mechanism.** The requester signs a pre-receipt commitment. Enigma evaluates policy and emits a final receipt with `pre_receipt_hash`, `decision`, `disclosure_root` or `denial_reason_ref`, `policy_hash`, `capability_ref`, and `raw_memory_disclosed:false` for public artifacts.

**Novelty hypothesis.** The handshake turns context sharing into an accountable protocol rather than a best-effort log entry. It creates evidence that the receiver asked for a specific class of memory under a specific purpose before any approved context pack was emitted.

**Prior-art risk.** OAuth consent, signed webhooks, transparency logs, API audit trails, and data-processing workflows may overlap. The differentiator to test is the memory-specific pre-receipt/final-receipt pair that binds purpose, capability, and disclosure commitments without storing the disclosed text.

**Claim boundary.** The receipt proves an Enigma boundary decision and its public-safe commitments. It does not prove what the receiver did after receiving approved context.

**First experiment.** Implement a pure handshake fixture with `request_nonce`, `request_ref`, `purpose_ref`, `policy_hash`, `pre_receipt_hash`, `disclosure_root`, and `decision`, then verify replay resistance by rejecting reused nonces and mismatched final receipts.

## 3. Semantic capability grants

**Candidate disclosure.** A capability grant authorizes memory use by semantic purpose, sensitivity class, model/tool boundary, time window, and policy hash rather than by broad file, table, or tenant access. The public grant stores only normalized purpose refs, class refs, root refs, expiry, issuer key id, and signature; private policy text remains off artifact.

**Technical mechanism.** The grant packet contains `grant_id`, `subject_ref`, `issuer_key_ref`, `scope_root`, `purpose_refs`, `sensitivity_refs`, `boundary_refs`, `not_before`, `expires_at`, `policy_hash`, `revocation_ref`, and `signature`. Context-pack creation must fail closed unless every requested purpose and boundary is covered.

**Novelty hypothesis.** Conventional access control answers "who can read this object." Semantic capability grants answer "which committed memory may be transformed into which kind of context for which declared purpose," enabling narrow cross-agent memory delegation.

**Prior-art risk.** Macaroons, object capabilities, OAuth scopes, ABAC, Rego policies, verifiable credentials, and enterprise DLP systems may be close. The key review question is whether prior systems express AI-memory context construction as a first-class, proof-carrying capability.

**Claim boundary.** A grant can claim scoped authorization under the listed refs and time window. It cannot claim that the subject is a real-world person, that policy text is public, or that external systems enforce the same semantics.

**First experiment.** Create a grant validator that permits a context-pack plan only when purpose ref, sensitivity ref, boundary ref, epoch, and root match the grant; then test denial for broader purposes, expired windows, altered policy hashes, and unknown revocation refs.

## 4. Verifiable relevance compression

**Candidate disclosure.** A context compressor emits a compact proof packet containing input corpus root, query/purpose commitment, selected-address root, omitted-address count, deterministic scorer version, score-threshold ref, and compressed-output hash. The packet proves what was selected and omitted by the local relevance process without publishing the query, memory text, scores, or embeddings.

**Technical mechanism.** The compressor uses deterministic local selection over committed addresses. The output packet stores `input_root`, `query_commitment`, `purpose_ref`, `scorer_ref`, `threshold_ref`, `selected_root`, `omitted_count`, `compressed_output_hash`, and `private_scores_omitted:true`.

**Novelty hypothesis.** Prompt compression is usually evaluated by output size or answer quality, not by third-party-verifiable selection boundaries. This design makes relevance compression auditable as a privacy-preserving memory boundary event.

**Prior-art risk.** Search-result audit logs, reproducible IR benchmarks, zk/commitment schemes, prompt-compression research, and vector-store explainability may overlap. Risk rises if existing products already provide verifiable selected/omitted roots for private AI-memory compression.

**Claim boundary.** The packet can claim deterministic selection under a named local scorer and threshold. It cannot claim semantic optimality, universal relevance, provider-side savings, or benchmark leadership.

**First experiment.** Run a deterministic local relevance fixture over synthetic committed addresses, emit selected and omitted roots plus counts, and verify that changing the scorer version, threshold ref, selected set, or compressed-output hash invalidates the packet.

## 5. Forgetting boundary ledger

**Candidate disclosure.** A forgetting boundary ledger records Enigma-controlled tombstone, delete-request, active-serving exclusion, derived-index refresh, and verifier events as ordered commitments. It does not claim provider deletion, backup erasure, model forgetting, or semantic forgetting; it proves only whether Enigma serving paths continue to include committed memory addresses after a boundary event.

**Technical mechanism.** Ledger entries link `event_root`, `previous_event_root`, `memory_address_commitment`, `tombstone_ref`, `active_set_root_before`, `active_set_root_after`, `derived_index_refresh_ref`, `verifier_report_hash`, and explicit negative-claim flags such as `provider_deletion_proof:false`.

**Novelty hypothesis.** The ledger reframes forgetting as a bounded, verifiable serving-state property rather than an absolute deletion claim. That boundary is practical for enterprise trust because it can be checked offline from public-safe roots and receipts.

**Prior-art risk.** Data-deletion logs, append-only audit ledgers, certificate transparency, tombstone systems, and privacy compliance workflows are adjacent. The distinctive angle is AI-memory active-serving exclusion tied to passport roots and derived-index refresh evidence.

**Claim boundary.** The ledger can claim Enigma active-serving exclusion for committed addresses after named events. It cannot claim provider deletion, backup erasure, model forgetting, human forgetting, or deletion from exported copies.

**First experiment.** Build a fixture with a memory address commitment, tombstone receipt, refreshed active-set root, and verifier report that proves the address is absent from active Enigma serving while preserving explicit false flags for external deletion and model forgetting.

## 6. Benchmark attestation

**Candidate disclosure.** A benchmark attestation binds a benchmark report hash to dataset refs, runner refs, package refs, metric names, fixture counts, environment class, and claim boundaries. It intentionally omits raw dataset rows, prompts, provider responses, and private memory, enabling public comparison without publishing private benchmark material.

**Technical mechanism.** The attestation contains `report_hash`, `dataset_ref`, `runner_ref`, `package_ref`, `metric_refs`, `sample_count`, `environment_class`, `generated_at`, `claim_boundaries`, and `signature`. Validators reject raw prompt/result keys and require boundaries for fixture-only, provider-response, and raw-memory claims.

**Novelty hypothesis.** Memory products often publish benchmark claims without portable evidence. A benchmark attestation makes the evidence object itself reusable by docs, CLI verification, and proof-network packets while preventing the attestation from becoming a data leak.

**Prior-art risk.** ML reproducibility cards, model eval reports, signed SBOM/provenance, benchmark registries, and scientific artifact badges overlap. The differentiator is a memory-specific attestation that can be anchored with capability and passport roots.

**Claim boundary.** The attestation can claim that a report hash was produced under named refs and boundaries. It cannot claim live provider performance, customer outcomes, cost savings, or benchmark leadership unless separate public-safe evidence supports those claims.

**First experiment.** Generate an attestation from a local report hash, dataset ref, runner ref, package ref, metric list, and claim-boundary object; verify that raw prompt/result fields are rejected and that a tampered report hash fails.

## 7. Solana nullifier grants

**Candidate disclosure.** A grant can include a Solana-ready nullifier commitment: a public opaque value derived from grant id, scope root, epoch, and revocation salt commitment. Anchor artifacts can later reference the nullifier to show revocation or one-time use without revealing the private grant body, tenant, memory, or policy.

**Technical mechanism.** The local packet stores private grant material off-chain and public fields such as `grant_ref`, `scope_root`, `epoch_ref`, `nullifier_hash`, `revocation_root`, `anchor_payload_hash`, `transaction_submitted:false`, and `raw_memory_on_chain:false`.

**Novelty hypothesis.** The model applies nullifier-style privacy to AI-memory capabilities: a public chain can see that a scoped grant was spent or revoked, while the sensitive grant semantics remain in local proof packets.

**Prior-art risk.** Nullifiers in privacy protocols, revocation registries, token allowances, capability revocation, and decentralized identity systems are close. The open question is whether the same pattern has been specialized for privacy-preserving AI-memory access grants and Solana-ready anchoring.

**Claim boundary.** A nullifier grant can claim local construction of a Solana-ready opaque revocation/spend artifact. It cannot claim that a transaction was submitted, confirmed, indexed, or recognized by any deployed program unless separate evidence says so.

**First experiment.** Locally create grant, nullifier, revocation artifact, and anchor-batch JSON with `transaction_submitted:false`; verify that nullifier reuse and mismatched scope roots fail while no raw grant policy or memory content appears.

## 8. Anti-fork sync

**Candidate disclosure.** Anti-fork sync detects divergent Memory Passport histories by comparing epoch roots, previous-root links, witness refs, and signer sets across devices or agents. When a fork is detected, Enigma emits a fork receipt with both public branches, minimum shared ancestor, local resolution policy hash, and a no-plaintext conflict summary.

**Technical mechanism.** Sync packets include `current_epoch_root`, `previous_epoch_root`, `witness_ref`, `signer_set_root`, `device_ref`, and `observed_at`. A fork receipt records `branch_a_root`, `branch_b_root`, `shared_ancestor_root`, `resolution_policy_hash`, and `raw_conflict_content_omitted:true`.

**Novelty hypothesis.** AI memory sync needs more than last-write-wins because hidden divergence can change what an agent remembers or discloses. Anti-fork sync makes divergence itself a verifiable event without forcing private memory bodies into conflict artifacts.

**Prior-art risk.** CRDTs, transparency logs, key-transparency anti-equivocation, Git history, sync engines, and certificate transparency are relevant. The candidate is strongest if focused on memory-passport proof history rather than generic data synchronization.

**Claim boundary.** Anti-fork sync can claim that two public root histories diverged from a shared ancestor. It cannot claim which private memory body is correct or resolve human/business truth without a separate private workflow.

**First experiment.** Simulate two local passport branches sharing an ancestor and diverging at different event roots; emit a fork receipt and prove that a verifier detects the fork and rejects a branch that omits the previous-root link.

## 9. Memory drive health

**Candidate disclosure.** Memory drive health is a SMART-like public-safe health packet for an AI memory vault: orphaned commitment count, stale derived-index count, tombstone backlog, unresolved fork count, policy-replay failure count, benchmark-attestation age, backup-ref freshness, and verifier status. It reports system health without exposing memories, tenants, prompts, embeddings, or provider logs.

**Technical mechanism.** The packet includes `vault_ref`, `passport_epoch_ref`, `orphaned_commitment_count`, `stale_index_count`, `tombstone_backlog_count`, `unresolved_fork_count`, `policy_replay_failure_count`, `latest_benchmark_attestation_ref`, `backup_ref_freshness`, `severity`, and `generated_at`.

**Novelty hypothesis.** Treating AI memory as durable infrastructure suggests operational health metrics analogous to a storage drive, but specialized for memory custody, proof freshness, and serving safety rather than sectors and temperatures.

**Prior-art risk.** Database health dashboards, vector-index metrics, observability, backup monitors, SMART drive telemetry, and compliance control dashboards overlap. The novelty is the public-safe, proof-network-compatible health packet for memory passports and boundary receipts.

**Claim boundary.** The packet can claim local health signals for an Enigma vault/ref set. It cannot claim customer compliance, hosted uptime, hardware durability, or absence of private operational incidents.

**First experiment.** Produce a deterministic health packet from synthetic counts and refs, then verify severity rules for stale attestations, unresolved forks, and tombstone backlog while rejecting any field whose key or value resembles raw private payload.

## 10. Enterprise policy replay

**Candidate disclosure.** Enterprise policy replay lets an auditor rerun historical memory-boundary decisions from minimized proof packets: policy hash, policy engine version, normalized inputs by ref, capability grant refs, decision timestamp, and signed result. The replay confirms deterministic decision parity without publishing the private policy body, tenant identity, memory content, prompts, or provider response.

**Technical mechanism.** Replay packets contain `policy_hash`, `policy_engine_ref`, `input_ref_root`, `capability_ref_root`, `decision_hash`, `decision_timestamp`, `runner_ref`, `signature`, and `private_policy_body_omitted:true`. The verifier recomputes the decision from public-safe fixture refs or customer-held private inputs.

**Novelty hypothesis.** Enterprise AI governance often depends on screenshots, dashboards, or logs that are hard to verify outside the vendor system. Policy replay makes policy checks portable and reproducible at the memory boundary while preserving confidentiality.

**Prior-art risk.** OPA/Rego decision logs, audit replay, SIEM, eDiscovery, model gateway policy systems, and governance-risk-compliance tools are adjacent. The candidate should be bounded to memory-specific context authorization and proof packets, not generic policy audit.

**Claim boundary.** Replay can claim deterministic parity for the supplied policy engine ref and input refs. It cannot claim that the private policy is complete or sufficient, that external providers honored the decision, or that all enterprise controls are configured.

**First experiment.** Create a local replay fixture with a policy-engine version, public input refs, capability refs, and expected decision hash; verify parity for the original packet and rejection when purpose ref, model boundary ref, or policy hash changes.

## Cross-candidate claim boundaries

- These candidates describe possible Enigma-controlled proof-network features, not live infrastructure, deployed Solana programs, provider behavior, compliance status, market leadership, investment value, roadmap priority, or external product claims.
- Chain-ready artifacts should be opaque anchor packets only. They should explicitly set `transaction_submitted:false` unless a separate approved workflow submits a transaction.
- Proofs cover declared Enigma-mediated events and local fixtures only until implemented and tested against real repository commands.
- Public examples should use synthetic hashes, roots, refs, counts, signatures, and schema names. They must not include private memory, prompts, transcripts, completions, embeddings, ACL bodies, tenant names, keys, seed phrases, secrets, provider exports, or provider responses.
