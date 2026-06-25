# Solana proof rail

Enigma's Solana rail is a proof, permission, and settlement layer for AI memory. It anchors opaque commitments, grants scoped capabilities, records revocations/nullifiers, attests benchmark reports, escrows service jobs, and registers operators. It does **not** store raw memory, prompts, transcripts, completions, embeddings, provider responses, tenant names, secrets, private keys, seed phrases, or ACL bodies on-chain.

The hot memory path stays local, hosted, BYOC, or on-prem under the deployment owner's custody. Solana receives only public-safe hashes, roots, counts, refs, public keys, signatures, timestamps/slots, and settlement amounts.

## Design principles

1. **Public chain payloads are content-minimized.** Every account and instruction must be acceptable for permanent public disclosure.
2. **Plaintext rejection happens before signing.** Client SDKs and CLI commands must reject forbidden keys and secret-like values before producing a transaction or chain-ready artifact.
3. **Solana is not canonical storage.** Durable memory, ACL bodies, benchmark reports, invoices, operator terms, and customer policy documents live off-chain in controlled storage. Chain state references them by hash/ref only.
4. **Receipts remain verifier-friendly.** Every on-chain object maps to an `enigma.proof_network.*.v1` artifact so an offline verifier can validate shape, hashes, signatures, ordering, and claim boundaries without RPC access.
5. **Program state is append-only where possible.** Anchors and attestations are immutable after creation. Mutable accounts are limited to registry status, escrow state, grant status, and explicit revocations.
6. **No token or ROI claims.** Settlement proves job/quote/receipt linkage and payment movement only. It is not investment, yield, provider invoice, savings guarantee, compliance, provider deletion, or model-forgetting evidence.

## Artifact-to-chain mapping

| Enigma artifact | Solana object | Purpose | Public fields only |
| --- | --- | --- | --- |
| `enigma.proof_network.anchor_batch.v1` | `BatchAnchor` account plus `AnchorBatchCreated` event | Batch opaque proof roots for later verification. | batch hash, Merkle root, artifact counts, schema ids, optional public refs, authority, slot. |
| `enigma.proof_network.capability_grant.v1` | `CapabilityGrant` account plus event | Grant a public key permission to perform a scoped proof-network action. | issuer, grantee, scope hash, policy hash, capability kind, expiry, nonce, grant hash. |
| `enigma.proof_network.capability_revocation.v1` | `CapabilityRevocation` / `Nullifier` account plus event | Revoke or nullify a grant/job/attestation capability without disclosing private policy content. | target hash, nullifier hash, revoker, reason code, slot, revocation hash. |
| `enigma.proof_network.benchmark_attestation.v1` | `BenchmarkAttestation` account plus event | Bind a benchmark result packet to dataset, runner, package, environment, and metrics roots. | report hash, dataset hash/ref, runner hash/ref, package hash/ref, metrics root, counts, signer. |
| `enigma.proof_network.packet.v1` | No single required account; verifier envelope over the above | Portable offline proof packet that may include chain refs. | artifact list, hashes, chain ids, signatures, validation results. |
| Settlement artifacts | `JobEscrow` account plus settlement events | Lock, release, refund, or dispute payment against a hash-only job. | job hash, quote hash, usage hash, memory root, policy hash, amount, mint, parties, state. |
| Operator metadata | `OperatorRegistry` account plus events | Discover operators and verify authorized signing keys/services. | operator authority, service classes, signing key hash/pubkey, terms hash/ref, status, reputation root. |

## Program accounts

All account seeds must avoid private identifiers. Use public keys and hashes, never tenant names, human-readable workspace names, or raw policy labels.

### `BatchAnchor`

`BatchAnchor` commits to a set of Enigma proof artifacts generated off-chain.

Recommended PDA seeds:

```text
["batch_anchor", authority_pubkey, batch_hash]
```

Fields:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `version` | `u8` | yes | Starts at `1`. |
| `schema` | fixed string/hash | yes | `enigma.proof_network.anchor_batch.v1`. |
| `authority` | `Pubkey` | yes | Signer authorized to anchor the batch. |
| `batch_hash` | `[u8; 32]` | yes | SHA-256 of canonical public batch artifact. |
| `merkle_root` | `[u8; 32]` | yes | Root over artifact hashes. |
| `artifact_count` | `u32` | yes | Count only, not artifact bodies. |
| `schema_hashes` | `Vec<[u8; 32]>` | yes | Hashes of schema ids included in the batch. |
| `public_refs_hash` | `Option<[u8; 32]>` | optional | Hash of public ref list, not URLs containing credentials. |
| `created_slot` | `u64` | yes | Slot at creation. |
| `created_unix_time` | `i64` | yes | Clock sysvar time. |
| `bump` | `u8` | yes | PDA bump. |

Validation rules:

- `artifact_count > 0`.
- `merkle_root`, `batch_hash`, and every `schema_hash` are non-zero 32-byte values.
- No instruction arg may contain arbitrary JSON text; clients pass fixed bytes and counts.
- Duplicate `batch_hash` for the same authority is rejected by PDA uniqueness.

### `CapabilityGrant`

`CapabilityGrant` gives a grantee a scoped permission such as anchoring batches, opening escrows, signing benchmark attestations, or administering an operator profile.

Recommended PDA seeds:

```text
["capability_grant", issuer_pubkey, grantee_pubkey, grant_hash]
```

Fields:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `version` | `u8` | yes | Starts at `1`. |
| `schema` | fixed string/hash | yes | `enigma.proof_network.capability_grant.v1`. |
| `issuer` | `Pubkey` | yes | Grant authority. |
| `grantee` | `Pubkey` | yes | Capability holder. |
| `capability_kind` | enum | yes | `anchor_batch`, `grant_capability`, `revoke_capability`, `attest_benchmark`, `open_job_escrow`, `settle_job`, `admin_operator`. |
| `scope_hash` | `[u8; 32]` | yes | Hash of private/off-chain scope document or public-safe scope tuple. |
| `policy_hash` | `[u8; 32]` | yes | Hash of policy body; policy body stays off-chain. |
| `not_before_slot` | `u64` | yes | Prevents early use. |
| `expires_slot` | `u64` | yes | Must be greater than `not_before_slot`. |
| `nonce` | `[u8; 32]` | yes | Public random nonce for unlinkability across grants. |
| `grant_hash` | `[u8; 32]` | yes | Canonical artifact hash. |
| `status` | enum | yes | `active`, `revoked`, `expired`. |
| `bump` | `u8` | yes | PDA bump. |

Validation rules:

- A grant is usable only when the current slot is within the grant window and no matching revocation/nullifier exists.
- `scope_hash` must commit to least privilege. It should include capability kind, allowed program ids, public operator id/hash, and approved artifact schemas.
- `policy_hash` never reveals policy text, tenant names, memory ids, or ACL bodies.

### `CapabilityRevocation` / `Nullifier`

A revocation makes a grant unusable. A nullifier prevents replay of a one-time right, escrow settlement, or attestation authorization without publishing the underlying private policy.

Recommended PDA seeds:

```text
["capability_revocation", target_hash, revocation_hash]
["nullifier", domain_hash, nullifier_hash]
```

Fields:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `version` | `u8` | yes | Starts at `1`. |
| `schema` | fixed string/hash | yes | `enigma.proof_network.capability_revocation.v1`. |
| `revoker` | `Pubkey` | yes | Issuer, delegated revoker, or program authority. |
| `target_hash` | `[u8; 32]` | yes | Hash of grant/job/attestation capability being revoked. |
| `domain_hash` | `[u8; 32]` | yes | Separates grant, job, operator, and benchmark domains. |
| `nullifier_hash` | `[u8; 32]` | yes | One-way nullifier. |
| `reason_code` | enum | yes | `rotation`, `expiry`, `compromise`, `policy_change`, `operator_exit`, `error`, `other`. No free-text reason. |
| `revocation_hash` | `[u8; 32]` | yes | Canonical artifact hash. |
| `created_slot` | `u64` | yes | Slot at revocation. |
| `bump` | `u8` | yes | PDA bump. |

Validation rules:

- Free-text revocation reasons are not accepted on-chain.
- Revocation authority must be the issuer, a valid delegated revoker, or a configured program governance authority.
- A nullifier can be created once per domain/hash pair; duplicate creation fails.

### `BenchmarkAttestation`

`BenchmarkAttestation` binds benchmark evidence to immutable public-safe references. It must not include prompts, completions, answers, dataset rows, provider outputs, or private runner logs.

Recommended PDA seeds:

```text
["benchmark_attestation", signer_pubkey, report_hash]
```

Fields:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `version` | `u8` | yes | Starts at `1`. |
| `schema` | fixed string/hash | yes | `enigma.proof_network.benchmark_attestation.v1`. |
| `signer` | `Pubkey` | yes | Attestation authority. |
| `report_hash` | `[u8; 32]` | yes | Hash of public-safe benchmark report. |
| `dataset_ref_hash` | `[u8; 32]` | yes | Hash of dataset manifest/ref, not dataset content. |
| `runner_ref_hash` | `[u8; 32]` | yes | Hash of runner version/source ref. |
| `package_ref_hash` | `[u8; 32]` | yes | Hash of package/version/provenance ref. |
| `metrics_root` | `[u8; 32]` | yes | Merkle root over public metrics and counts. |
| `sample_count` | `u32` | yes | Count only. |
| `claim_boundary_hash` | `[u8; 32]` | yes | Commits to allowed claims/non-claims. |
| `created_slot` | `u64` | yes | Slot at attestation. |
| `bump` | `u8` | yes | PDA bump. |

Validation rules:

- Attestation creation requires an active `attest_benchmark` capability or operator registry authority.
- `sample_count` must match the off-chain report summary committed by `report_hash` and `metrics_root`.
- Any comparison or leadership claim must be represented only by a report hash and claim-boundary hash until a reviewed public report exists.

### `JobEscrow`

`JobEscrow` connects permissionless access and settlement to Enigma's hash-only job artifacts. It does not execute memory work and does not reveal job contents.

Recommended PDA seeds:

```text
["job_escrow", payer_pubkey, operator_pubkey, job_hash]
```

State machine:

```text
initialized -> funded -> completed -> released
initialized -> funded -> refunded
initialized -> funded -> disputed -> released|refunded
initialized -> cancelled
```

Fields:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `version` | `u8` | yes | Starts at `1`. |
| `payer` | `Pubkey` | yes | Funds escrow. |
| `operator` | `Pubkey` | yes | Provides the service. |
| `mint` | `Pubkey` | yes | SPL token mint or native SOL sentinel design. |
| `vault` | `Pubkey` | yes | Token account owned by the escrow PDA. |
| `amount` | `u64` | yes | Smallest units. |
| `job_hash` | `[u8; 32]` | yes | Hash-only job commitment. |
| `quote_hash` | `[u8; 32]` | yes | Operator quote hash. |
| `usage_hash` | `[u8; 32]` | yes | Usage event/aggregate hash. |
| `memory_root` | `[u8; 32]` | yes | Opaque memory commitment root. |
| `policy_hash` | `[u8; 32]` | yes | Policy hash. |
| `service_receipt_hash` | `Option<[u8; 32]>` | set on completion | Hash of service receipt. |
| `settlement_ref_hash` | `Option<[u8; 32]>` | set on release/refund | Hash of settlement reference. |
| `deadline_slot` | `u64` | yes | Refund/dispute boundary. |
| `state` | enum | yes | State machine above. |
| `bump` | `u8` | yes | PDA bump. |

Instruction rules:

- `open_job_escrow` requires payer signature and an active operator profile.
- `fund_job_escrow` transfers tokens into the escrow vault and sets `funded`.
- `complete_job_escrow` requires operator signature plus an active grant or registry authority and writes only `service_receipt_hash`.
- `release_job_escrow` requires payer approval, arbitrator approval, or pre-agreed auto-release conditions committed by `policy_hash`.
- `refund_job_escrow` requires deadline expiry, payer/operator agreement, or dispute resolution.
- `dispute_job_escrow` records dispute state without free-text evidence.

The public invariant mirrors Enigma settlement receipts:

```text
settled_amount <= quote_price <= job_max_price
```

The program can enforce the escrow amount and quote hash linkage. The off-chain verifier enforces full job/quote/usage/receipt consistency from public-safe artifacts.

### `OperatorRegistry`

`OperatorRegistry` declares who may operate proof-network services and which signing keys/capabilities are current.

Recommended PDA seeds:

```text
["operator_registry", operator_authority_pubkey]
```

Fields:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `version` | `u8` | yes | Starts at `1`. |
| `operator_authority` | `Pubkey` | yes | Admin authority. |
| `operator_id_hash` | `[u8; 32]` | yes | Hash of public operator id/ref; no tenant/customer names. |
| `signing_keys` | `Vec<Pubkey>` | yes | Active keys for attestations, grants, and service receipts. |
| `service_classes` | bitset/enum vec | yes | `anchor`, `benchmark_attester`, `memory_optimizer`, `gateway`, `arbiter`. |
| `terms_ref_hash` | `[u8; 32]` | yes | Hash of public terms/ref. |
| `capacity_ref_hash` | `Option<[u8; 32]>` | optional | Hash of public capacity profile/ref. |
| `reputation_root` | `Option<[u8; 32]>` | optional | Root over public-safe operator metrics. |
| `status` | enum | yes | `active`, `paused`, `exiting`, `removed`. |
| `updated_slot` | `u64` | yes | Last registry update. |
| `bump` | `u8` | yes | PDA bump. |

Validation rules:

- Updating signing keys requires `operator_authority` and creates a registry update event.
- Paused/removed operators cannot open new escrows, issue new attestations, or use operator-scoped grants.
- `reputation_root` may commit to uptime, completion counts, dispute counts, or benchmark-attestation acceptance counts, but not customer names or private job metadata.

## Instruction set

| Instruction | Required signers | Writes | Notes |
| --- | --- | --- | --- |
| `create_batch_anchor` | anchor authority | `BatchAnchor` | Emits `AnchorBatchCreated`. |
| `create_capability_grant` | issuer | `CapabilityGrant` | Issuer must be program authority, operator authority, or holder of a valid grant-capability grant. |
| `revoke_capability` | revoker | `CapabilityGrant`, `CapabilityRevocation`/`Nullifier` | Marks grant revoked and emits revocation event. |
| `create_nullifier` | authorized signer | `Nullifier` | One-time replay prevention for grants/jobs/attestations. |
| `create_benchmark_attestation` | attestation signer | `BenchmarkAttestation` | Requires grant or registry authority. |
| `register_operator` | operator authority | `OperatorRegistry` | Creates active or paused profile. |
| `update_operator` | operator authority | `OperatorRegistry` | Rotates keys, refs, status, service classes. |
| `open_job_escrow` | payer | `JobEscrow` | Initializes hash-only escrow. |
| `fund_job_escrow` | payer | `JobEscrow`, token accounts | Moves funds into PDA vault. |
| `complete_job_escrow` | operator | `JobEscrow` | Adds service receipt hash only. |
| `release_job_escrow` | payer/arbiter/authorized signer | `JobEscrow`, token accounts | Releases funds and records settlement ref hash. |
| `refund_job_escrow` | payer/operator/arbiter according to policy | `JobEscrow`, token accounts | Refunds funds and records settlement ref hash. |
| `dispute_job_escrow` | payer or operator | `JobEscrow` | No free-text evidence on-chain. |

## Events

Events should be sufficient for indexers without requiring account fetches for every proof, but must remain public-safe.

Required event fields:

- `schema_hash`
- primary object hash (`batch_hash`, `grant_hash`, `revocation_hash`, `report_hash`, `job_hash`, or `operator_id_hash`)
- authority/signing pubkey
- slot and Unix time
- status/state enum
- chain/program id

Events must not include JSON blobs, URLs with query credentials, local paths, tenant names, email addresses, memory ids, prompts, completions, transcripts, embeddings, ACL bodies, or free-text dispute/revocation details.

## Off-chain packet structure

`enigma.proof_network.packet.v1` is the portable verifier envelope. It may contain:

```json
{
  "schema": "enigma.proof_network.packet.v1",
  "network": "solana-devnet",
  "program_id": "ProofRail1111111111111111111111111111111111",
  "transaction_submitted": false,
  "raw_memory_on_chain": false,
  "artifacts": [
    {
      "schema": "enigma.proof_network.anchor_batch.v1",
      "artifact_hash": "sha256:0000000000000000000000000000000000000000000000000000000000000001",
      "chain_ref": "solana:devnet:signature-placeholder",
      "account_ref_hash": "sha256:0000000000000000000000000000000000000000000000000000000000000002"
    }
  ],
  "claim_boundary": {
    "proves": ["opaque commitment anchored", "public-safe artifact hash linked"],
    "does_not_prove": ["provider deletion", "model forgetting", "raw memory storage", "provider invoice savings", "token ROI"]
  }
}
```

The example uses placeholder hashes only. Real packets must be generated by the SDK/CLI from canonical JSON and must pass `assertNoPrivateProofPayload` before signing or export.

## Privacy and threat model

### Protected assets

- raw memory and deleted/tombstoned memory bodies;
- prompts, transcripts, completions, embeddings, and provider responses;
- ACL bodies, tenant/customer names, workspace names, support tickets, and legal-hold details;
- private keys, seed phrases, API keys, cloud credentials, and signing material;
- benchmark dataset rows, private answers, grader traces, and provider outputs;
- local file paths that reveal usernames, customer names, or private project names.

### Adversaries

| Adversary | Risk | Controls |
| --- | --- | --- |
| Chain observer/indexer | Correlates public keys, refs, timings, and repeated hashes. | Use nonces, domain-separated hashes, batched anchors, delayed submission where acceptable, and avoid tenant/customer names. |
| Malicious operator | Publishes broad grants, false benchmark claims, or settlement receipts without work. | Capability expiry, registry status, benchmark claim-boundary hashes, escrow state machine, dispute/nullifier flow, offline verifier checks. |
| Compromised client | Attempts to put memory/plaintext fields in proof artifacts. | `assertNoPrivateProofPayload`, strict schemas, fixed instruction args, no arbitrary JSON instruction payloads. |
| Replay attacker | Reuses an old grant, job completion, or attestation authorization. | Slot windows, nonce fields, domain-separated nullifiers, PDA uniqueness. |
| Registry key compromise | Signs fraudulent attestations or grants. | Key rotation, registry pause/remove status, revocation/nullifier accounts, short-lived grants, multi-sig governance for high-impact roles. |
| Documentation/marketing overclaim | Claims storage, compliance, ROI, provider deletion, or model forgetting from chain evidence. | Claim-boundary hashes, public docs non-claims, mainnet release review gates. |

### Data minimization checklist

Before a client emits any chain-ready artifact, it must verify:

- `transaction_submitted` is explicit and accurate.
- `raw_memory_on_chain:false` is present for local planning packets and chain receipts.
- No forbidden key names appear: `memory`, `prompt`, `completion`, `transcript`, `embedding`, `acl`, `tenant_name`, `api_key`, `private_key`, `seed_phrase`, `provider_response`, or close variants.
- No secret-like values appear: bearer tokens, base64 private-key material, seed phrase patterns, credentialed URLs, local absolute paths, or human-readable private content.
- Every public reference is either a hash, content-addressed id, package/version ref, public documentation ref, or redacted opaque id.

## Why Solana is proof/permission/settlement, not storage

Solana is valuable here because it provides low-latency finality, inexpensive account writes, programmable permissions, public ordering, and token settlement. Those strengths fit proof rails and settlement rails. They do not make a public chain a suitable memory store.

| Need | Correct location | Why |
| --- | --- | --- |
| Raw memory retrieval | Local vault, hosted vault, BYOC/on-prem storage | Requires privacy, low-latency query, deletion/tombstone controls, and customer custody. |
| Prompt/context assembly | Local SDK, gateway, approved client/session | Requires private user intent and provider-specific insertion controls. |
| ACL body and tenant policy | Customer/operator policy store | Contains private roles, purposes, legal holds, regions, and escalation paths. |
| Benchmark rows and traces | Benchmark report store | May contain dataset license restrictions and provider outputs. |
| Public proof roots | Solana `BatchAnchor` | Hashes/roots are safe to publish and benefit from public ordering. |
| Permission state | Solana `CapabilityGrant` and nullifiers | Public keys, scopes, expiries, and revocations benefit from shared verification. |
| Service payment | Solana `JobEscrow` | Escrow and release/refund states benefit from atomic settlement. |
| Operator discovery | Solana `OperatorRegistry` | Public operator keys, service classes, and status are useful to all clients. |

The boundary is simple: if it helps anyone reconstruct private memory, customer identity, private policy, provider output, or secret material, it stays off-chain.

## Devnet rollout

### Phase 0: local artifact contract

- Implement SDK/CLI artifacts for anchor batches, grants, revocations, benchmark attestations, packets, and settlement links.
- Enforce `assertNoPrivateProofPayload` on all public exports.
- Add local-only CLI commands: `enigma chain anchor`, `enigma chain grant`, `enigma chain revoke`, `enigma chain attest`, and `enigma chain verify`.
- Default local command output to `transaction_submitted:false` and `raw_memory_on_chain:false`.
- Produce deterministic fixture packets with placeholder hashes and no live RPC.

Exit criteria:

- Local verifier accepts supported artifacts and rejects private payload keys/values.
- Docs and examples contain only hashes, roots, refs, counts, signatures, and public keys.

### Phase 1: devnet program prototype

- Build the Solana program with the account layouts above.
- Deploy to devnet under an explicitly non-production program id.
- Support `create_batch_anchor`, `create_capability_grant`, `revoke_capability`, `create_benchmark_attestation`, `register_operator`, and read-only verifier tooling first.
- Keep `JobEscrow` behind a feature flag until token-vault behavior and dispute/refund semantics have focused tests.

Exit criteria:

- Devnet transactions contain no arbitrary JSON payloads.
- Indexer can reconstruct event stream from public-safe fields.
- Offline verifier can compare packet hashes to devnet accounts/events.

### Phase 2: controlled devnet pilots

- Register one or more test operators with rotated signing keys.
- Anchor benchmark-attestation packets generated from public-safe benchmark reports.
- Exercise grant expiry, revocation/nullifier, operator pause, and key rotation.
- Exercise `JobEscrow` with devnet tokens only after vault, release, refund, and dispute tests pass.

Exit criteria:

- At least one end-to-end packet links local artifact hash, devnet account, transaction signature, and offline verifier result.
- Revoked grants fail closed in client and program paths.
- Operator pause blocks new actions while preserving historical verification.
- No private values appear in transaction data, logs, account data, events, docs, or fixtures.

### Phase 3: mainnet candidate

- Freeze account layouts for v1 or provide an explicit migration plan.
- Review program upgrade authority, governance, emergency pause, and registry removal controls.
- Run independent security review of escrow/token flows, PDA seeds, authority checks, replay/nullifier logic, and privacy boundaries.
- Publish a claim-boundary packet explaining exactly what mainnet evidence proves and does not prove.

Exit criteria:

- Mainnet launch checklist is complete.
- Legal/security review approves public wording.
- No hosted/BYOC/live-infrastructure readiness is implied by proof-rail launch.

## Mainnet gates

Mainnet use is blocked until all gates below are satisfied for the exact program id and release version:

1. **Program security review:** independent review for authority checks, PDA derivation, account reinitialization, escrow vault ownership, token mint handling, arithmetic, and replay protection.
2. **Privacy review:** transaction data, emitted logs, account data, examples, fixtures, and docs are scanned for forbidden private keys/values and human-readable customer identifiers.
3. **Upgrade governance:** upgrade authority is multi-sig or intentionally burned; emergency pause and recovery paths are documented.
4. **Verifier parity:** offline verifier and on-chain layouts agree on canonical hashing, schema ids, chain refs, and account/event parsing.
5. **Revocation reliability:** grants, nullifiers, operator pause/remove, and key rotation fail closed in SDK, CLI, and program tests.
6. **Escrow safety:** token-vault operations have focused tests for fund, release, refund, dispute, close-account, and wrong-mint/wrong-owner cases.
7. **Claim governance:** public materials state that Solana is proof/permission/settlement only, not raw memory storage, provider deletion proof, model forgetting proof, compliance status, token ROI, or provider invoice savings.
8. **Operational ownership:** operator registry admin, incident response, key rotation, monitoring, and support ownership are assigned.
9. **Devnet evidence:** controlled devnet packets show successful anchor, grant, revoke, attestation, registry update, and escrow lifecycle without private payload leakage.
10. **Release alignment:** docs, CLI help, schema names, package exports, and examples reference the same v1 artifact contracts.

## Implementation notes

- Use SHA-256 for Enigma artifact hashes and Merkle roots unless a Solana-native verifier path explicitly requires another hash. If another hash is added, domain-separate it and keep the original SHA-256 in the off-chain packet.
- Canonical JSON hashing must sort object keys, preserve numbers as JSON numbers where safe, and reject non-finite values.
- Use domain tags for every hash: `anchor_batch`, `capability_grant`, `capability_revocation`, `benchmark_attestation`, `job_escrow`, `operator_registry`, and `packet`.
- Prefer fixed-size byte arrays and enums in instruction args. Avoid variable user text and arbitrary JSON on-chain.
- Keep account sizes bounded. Store hash lists off-chain behind roots when a vector could grow without a hard cap.
- Every chain-writing CLI command should have a local planning mode first. The default for release `0.1.12` planning artifacts is no transaction submission.
- Chain refs should include cluster, program id, signature/account id, and slot. They should not include RPC URLs with credentials.

## Future implementation checklist

- [ ] Finalize Rust/Anchor account structs and instruction args from this document.
- [ ] Add deterministic PDA derivation helpers to the SDK.
- [ ] Add client-side artifact builders for all `enigma.proof_network.*.v1` schemas.
- [ ] Add private-payload rejection before serialization, signing, and file output.
- [ ] Add local packet verification independent of Solana RPC.
- [ ] Add optional devnet submission only behind explicit flags and clear warnings.
- [ ] Add devnet indexer/parser fixtures with public-safe account/event examples.
- [ ] Add escrow focused tests before any mainnet candidate.
- [ ] Complete mainnet gates before presenting the proof rail as live mainnet infrastructure.
