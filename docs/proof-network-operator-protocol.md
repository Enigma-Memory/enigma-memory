# Proof Network operator protocol

Enigma Proof Network is the operator protocol for a private memory controller for AI. Operators and attesters coordinate proof duties around public-safe hashes, roots, refs, signatures, nullifiers, service receipts, and dispute records. Solana is an optional proof, permission, and settlement rail for compact commitments only; the protocol does not require a token launch and this document makes no claim that a live network, live program, staking system, hosted SaaS, or on-chain deployment exists.

The protocol goal is simple: give an AI memory system a reviewable public control plane without publishing the private memory plane.

## Non-negotiable privacy boundary

Public operator artifacts may contain:

- schema identifiers;
- opaque operator refs, signer refs, duty refs, and service refs;
- public keys or public-key fingerprints;
- hashes, Merkle roots, packet hashes, nullifier hashes, and receipt hashes;
- timestamps, expiry windows, sequence numbers, and public-safe counts;
- capability names, scope hashes, and artifact type names;
- signatures over canonical public-safe envelopes;
- optional Solana cluster/program/account refs only when separately evidenced and public-safe.

Public operator artifacts must not contain raw memory, prompts, transcripts, completions, embeddings, private ACL bodies, tenant names, customer names, employee names, private policies, local filesystem paths, private keys, seed phrases, API keys, bearer tokens, provider responses, invoices with private counterparty data, or chain credentials.

A valid operator artifact proves only that the public-safe envelope was created, signed, and validated under the stated rules. It does not prove provider deletion, model forgetting, legal compliance, benchmark superiority, customer ROI, token value, hosted SaaS operation, or live chain finality.

## Roles

| Role | Protocol purpose | Public identity material | Must not publish |
| --- | --- | --- | --- |
| Memory controller | Owns the private memory system and decides which public-safe roots/refs can be emitted. | Controller ref, root refs, policy ref hash, capability issuer ref. | Raw memory, private policy body, tenant names, ACL body. |
| Operator | Performs one or more allowed proof duties for a controller or public packet. | Operator ref, duty refs, signing key refs, service refs, optional bond ref. | Operator private keys, customer names, internal runbooks, credentialed RPC URLs. |
| Attester | Signs an evidence statement over a public-safe artifact or run result. | Attester ref, attestation key ref, evidence refs, signature. | Raw benchmark rows, prompts, answers, completions, provider responses. |
| Verifier | Checks schemas, signatures, hashes, scopes, freshness, revocations, and dispute status. | Verifier ref, validation profile ref, verification result hash. | Private review notes, local paths, private packet contents. |
| Dispute reviewer | Reviews dispute packets and signs outcomes within a defined process. | Reviewer ref, dispute duty ref, outcome hash, signature. | Private complainant identity, raw logs, secret evidence. |
| Optional Solana submitter | Submits compact commitments when a separate operator process exists. | Submitter public key, transaction ref if actually submitted, anchor root. | Memory payloads, private keys, seed phrases, raw tenant/account names. |

One entity may hold multiple roles, but each role must use an explicit duty grant. Operators should be least-privilege signers, not implicit administrators.

## Identity references

An identity ref is a public-safe pointer to a participant. It can be a DID-style ref, a Solana public key ref, a DNS-bound org key ref, or an Enigma-specific opaque ref. The ref must be stable enough for verification and rotation records, but not so descriptive that it exposes a private tenant or customer.

Recommended identity ref shapes:

| Ref type | Example shape | Use |
| --- | --- | --- |
| Operator ref | `operator:sha256:<digest>` | Default public operator identifier when human-readable names would leak relationships. |
| Attester ref | `attester:sha256:<digest>` | Signs benchmark, packet, service, or control-plane attestations. |
| Signer key ref | `key:ed25519:<fingerprint>` or `key:solana:<pubkey>` | Public verification key or key fingerprint. |
| Duty ref | `duty:anchor.submit:<digest>` | Binds a signer to one allowed operation class. |
| Service ref | `service:memory-root-attestation:<digest>` | Refers to a service order without naming a customer. |
| Bond ref | `bond:escrow:<digest>` | Optional future collateral reference; not a token claim. |
| Dispute ref | `dispute:receipt:<digest>` | Tracks a dispute without publishing private evidence. |

Identity refs should be generated from high-entropy public-safe material. Do not hash low-entropy customer names, tenant names, emails, short prompts, or private account labels and publish the result as if it were safe. If a private source must be committed, use a reviewed commitment scheme with a secret salt kept out of public artifacts.

## Signing keys

Operators use signing keys to bind duties to public-safe artifacts. The protocol should support Ed25519-compatible signing and Solana public-key verification concepts, but it must not require that every signature be a Solana transaction signature.

### Key classes

| Key class | Scope | Rotation expectation | Notes |
| --- | --- | --- | --- |
| Root operator key | Signs operator registration, duty delegation, and key rotation envelopes. | Rare, planned, multi-party approval preferred. | Keep offline when practical. Do not use for routine receipts. |
| Duty key | Signs one allowed duty such as anchor preparation, packet verification, grant issuance, or receipt issuance. | Rotate on schedule, after compromise suspicion, or when duty scope changes. | Preferred key for daily operations. |
| Attestation key | Signs benchmark, artifact, service, or evidence attestations. | Rotate independently from root and duty keys. | Must bind to an attester ref and evidence profile. |
| Dispute key | Signs dispute acceptance, interim status, and outcome hashes. | Rotate when reviewer pool or procedure changes. | Should not sign service performance receipts. |
| Solana submitter key | Optional key for future chain submission. | Rotate under Solana wallet custody practices. | Never publish private key, seed phrase, or credentialed RPC material. |

### Signature envelope requirements

Every signed operator envelope should bind at least:

| Field | Requirement |
| --- | --- |
| `schema` | Exact protocol schema or profile identifier. |
| `artifact_hash` | Hash of the canonical public-safe artifact body. |
| `operator_ref` or `attester_ref` | Public-safe signer identity. |
| `key_ref` | Public verification key or fingerprint. |
| `duty_ref` | The specific duty authorizing this signature. |
| `issued_at` | Creation time. |
| `expires_at` or `valid_for` | Freshness boundary where applicable. |
| `nonce` or `sequence` | Replay boundary. |
| `signature_alg` | Signing algorithm identifier. |
| `signature` | Signature over canonical bytes. |

The signature must not cover private data by reference unless the public artifact states exactly which hash/root/ref represents that private data boundary. Verifiers must recompute the canonical artifact hash before accepting the signature.

## Allowed duties

Duties are explicit permissions granted to an operator signer. A duty grant is not a business title; it is a narrow action class.

| Duty | Allowed action | Required evidence refs | Forbidden action |
| --- | --- | --- | --- |
| `anchor.prepare` | Build a local anchor batch from public-safe roots and refs. | Batch root, source root refs, schema refs, boundary flags. | Claim transaction submission or finality. |
| `anchor.submit.optional` | Submit a compact root/ref to a chain rail when a separate approved process exists. | Anchor batch hash, submitter key ref, transaction ref if actually submitted. | Put raw memory, prompts, private names, keys, or ACL bodies on-chain. |
| `capability.issue` | Sign a scoped capability grant. | Issuer ref, subject ref, scope hash, purpose ref, expiry, nonce. | Publish private ACL body or unlimited implicit access. |
| `capability.revoke` | Sign a revocation/nullifier artifact. | Grant hash or scope hash, nullifier hash, issuer ref, effective time. | Claim third-party provider deletion from a revocation alone. |
| `packet.verify` | Validate a proof packet and sign a verification result hash. | Packet hash, schema set ref, validation profile ref, result hash. | Trust packet-provided `valid` flags without recomputation. |
| `benchmark.attest` | Sign a benchmark report commitment. | Report hash, dataset ref, runner ref, package ref, metric profile ref. | Publish raw rows, questions, answers, prompts, completions, or provider responses. |
| `service.receipt.issue` | Sign a receipt for a bounded proof-network service. | Service ref, quote ref, performed duty refs, artifact hashes, unit counts if public-safe. | Claim ROI, cost savings, token yield, or legal certification. |
| `dispute.open` | Accept a dispute packet for review. | Dispute ref, receipt ref, claimant ref hash, admissible evidence refs. | Publish private complaint narratives or customer identity. |
| `dispute.resolve` | Sign a dispute outcome hash under the review profile. | Dispute ref, outcome hash, reviewer refs, decision profile ref. | Rewrite history or delete prior artifacts. |
| `bond.record.optional` | Record a future collateral or bond reference. | Bond ref, operator ref, duty scope, terms hash. | Launch a token, promise yield, or represent an unenforced bond as locked collateral. |

Any duty not listed in the operator registration or duty grant is denied by default.

## Attester protocol

An attester is an operator-grade signer for evidence statements. Attesters should not be treated as general validators or truth oracles. They attest that a named public-safe artifact, report, service receipt, or verification result was observed under a declared evidence profile.

### Attestable statements

| Statement type | Attester may sign | Required refs | Must not imply |
| --- | --- | --- | --- |
| Artifact observation | The attester observed an artifact with a matching canonical hash and schema profile. | Artifact hash, schema ref, observation time, attester ref. | That the private contents behind the hash are true or complete. |
| Memory-root custody | The controller provided or retained a root under a private review process. | Root ref, controller ref hash, retention profile ref, observation time. | That raw memory is public or recoverable from the root. |
| Benchmark report commitment | A benchmark report hash matches a declared dataset/runner/package boundary. | Report hash, dataset ref, runner ref, package ref, metric profile ref. | Best-in-class performance, answer accuracy beyond the report, or provider comparison. |
| Service completion | An operator produced the artifacts required by a quote profile. | Quote ref, receipt ref, artifact hash list root, duty refs. | Payment settlement, customer satisfaction, cost savings, or legal certification. |
| Dispute outcome | A dispute profile reached a signed outcome over public-safe evidence refs. | Dispute ref, outcome hash, reviewer refs, evidence hash list root. | Private fact-finding beyond the disclosed evidence boundary. |
| Optional rail observation | A compact root/ref was prepared for or, when separately evidenced, observed on a chain rail. | Anchor root, transaction ref only if real, cluster ref, observer key ref. | Finality, uptime, censorship resistance, or memory publication. |

### Attester independence

Each evidence profile should state whether self-attestation is allowed. Self-attestation is useful for local development and release packets, but public operator markets should distinguish it from independent attestation. A public attestation should therefore include an `attester_relation_ref` or equivalent relationship hash with values such as `self`, `same-operator`, `contracted-reviewer`, or `independent-reviewer`. The relationship ref is a disclosure boundary, not a claim of certification.

### Attester failure modes

Verifiers should downgrade or reject attestations when:

1. the attester key is not registered for the evidence profile;
2. the attestation signs a mutable URL or private location instead of a stable hash/ref;
3. the report, receipt, or artifact hash cannot be recomputed from the public-safe body;
4. the attester signs outside the declared time window;
5. the attester relationship ref is missing for a market-facing claim;
6. the attestation text claims truth, deletion, model behavior, compliance, savings, finality, or token economics beyond the signed refs.

## Operator registration

An operator registration is the public-safe root of trust for an operator identity. It should be signed by the root operator key and contain only enough information for verifiers to evaluate duty signatures.

Minimum registration fields:

| Field | Purpose |
| --- | --- |
| Operator ref | Opaque participant identifier. |
| Registration hash | Canonical hash of the registration body. |
| Root key ref | Public verification key or fingerprint. |
| Duty key refs | Keys delegated to exact duty names. |
| Verification profile refs | Schema and validation rules the operator commits to using. |
| Public contact ref | Optional non-private support or governance ref. |
| Effective time and expiry | Window in which registration is recognized. |
| Rotation refs | Prior or next key refs where applicable. |
| Revocation ref | Nullifier or revocation artifact ref if registration is withdrawn. |

Operator registration is not a license, certification, compliance approval, or statement that the operator is live in production. It is a verification input.

## Protocol objects

The operator protocol is a set of signed public-safe objects. Implementations may encode them as JSON, binary canonical forms, or future on-chain instruction data, but the verifier should see the same fields after canonicalization.

| Object | Producer | Consumer | Required public-safe fields | Invalid if |
| --- | --- | --- | --- | --- |
| Operator registration | Operator root key | Verifier, controller, dispute reviewer | Object schema, operator ref, root key ref, duty key refs, profile refs, effective window, registration hash, root signature. | It names private customers, lacks a root signature, or delegates wildcard duties. |
| Duty grant | Operator root key or authorized controller | Duty signer, verifier | Duty ref, duty name, signer key ref, allowed object types, scope hash, expiry, nonce, issuer signature. | The duty name is unknown, scope is unbounded, or expiry is absent for operational duties. |
| Attestation statement | Attester duty key | Verifier, controller, packet reviewer | Attester ref, evidence profile ref, artifact hash, evidence refs, relation ref, issued-at, expiry, signature. | It attests to private contents rather than hashes/refs or omits the relation ref for public use. |
| Service quote | Operator or controller | Operator, controller, verifier | Quote ref, requested duty refs, public-safe unit definitions, price/ref boundary if any, expiry, quote hash. | It embeds private workload descriptions, customer names, or token/yield promises. |
| Service receipt | Operator duty key | Controller, verifier, dispute reviewer | Receipt ref, quote ref, performed duty refs, artifact hash list root, issued-at, dispute-by, receipt signature. | It lacks matching artifacts, exceeds the quote, or claims settlement/payment without separate evidence. |
| Dispute packet | Controller, verifier, or counter-operator | Dispute reviewer, operator | Dispute ref, challenged refs, reason code, evidence hash list root, requested remedy ref, opened-at. | It contains raw logs, private narratives, or unsupported reason codes. |
| Dispute outcome | Dispute reviewer duty key | Verifier, controller, operator | Outcome ref, dispute ref, status, remedy refs, reviewer refs, decision profile ref, outcome signature. | It changes underlying artifacts instead of appending status or signs outside the reviewer duty. |
| Optional bond record | Operator or future collateral manager | Verifier, dispute reviewer | Bond ref, operator ref, duty scope, terms hash, status ref, evidence ref if collateral is real. | It implies a live token, locked collateral, or enforceable slash without actual collateral evidence. |

### Canonical processing order

Verifiers should process objects in this order:

1. Parse only the public object body and reject forbidden private keys or values before any business logic.
2. Check that the schema/profile ref is supported for the object type.
3. Canonicalize the object body and compute the object hash.
4. Resolve the operator registration and active duty grant by ref.
5. Verify the signature against the key ref and duty scope.
6. Check freshness, nonce, sequence, expiry, revocation, and dispute status.
7. Recompute referenced artifact hashes when the artifacts are present.
8. Return the narrowest status supported by evidence: valid, invalid, expired, disputed, superseded, or requires private review.

This order keeps privacy checks ahead of signature and settlement logic. A correctly signed object with private payload material is still invalid for public Proof Network use.

## Evidence references

Evidence refs are pointers to public-safe facts. They allow the protocol to be useful without copying sensitive evidence into public artifacts.

| Evidence ref | What it binds | Public-safe contents |
| --- | --- | --- |
| Memory root ref | A private memory snapshot or context pack boundary. | Merkle root, root hash, item count if safe, schema ref. |
| Anchor batch ref | A bundle of roots/refs prepared for optional rail submission. | Batch hash, batch root, source refs, boundary flags. |
| Capability ref | A grant or revocation boundary. | Grant hash, scope hash, issuer/subject refs, expiry, nullifier. |
| Benchmark report ref | A private or public benchmark report boundary. | Report hash, dataset ref, runner ref, package ref, metric profile ref. |
| Service quote ref | A quoted proof-network task. | Quote hash, duty names, public-safe units, expiry, price ref if safe. |
| Service receipt ref | A performed proof-network task. | Receipt hash, quote ref, artifact hashes, operator signature. |
| Dispute packet ref | A challenge to a receipt or duty result. | Dispute hash, receipt ref, reason code, evidence hash list. |
| Outcome ref | A dispute result. | Outcome hash, accepted/rejected/adjusted status, remedy refs. |
| Optional chain ref | A future live rail event. | Transaction signature/ref, cluster, slot/time, anchor root only when actually evidenced. |

Evidence refs must be dereferenceable by authorized reviewers in private channels when needed, but public artifacts should remain safe if copied into a repository, release packet, explorer memo, or sales appendix.

## Service receipts

A service receipt is an operator-signed statement that a bounded proof-network duty was performed against public-safe inputs. It is the bridge between technical proofs and operator accountability.

### Receipt lifecycle

1. **Quote**: the operator or controller creates a service quote with duty names, public-safe unit definitions, expiry, and a quote hash.
2. **Acceptance**: the controller accepts the quote by signing or recording an acceptance ref. Public acceptance should use opaque refs only.
3. **Performance**: the operator performs the allowed duties, producing anchor batches, grants, revocations, attestations, verification results, or other public-safe artifacts.
4. **Receipt**: the operator signs a receipt binding the quote ref, duty refs, artifact hashes, counts, timestamps, and signer refs.
5. **Review**: a verifier checks signatures, scopes, freshness, artifact hashes, revocation status, and private-payload boundaries.
6. **Optional anchoring**: a compact receipt root or batch root may be prepared for Solana submission. Until separately submitted and evidenced, it remains a local plan.
7. **Dispute window**: the receipt stays challengeable for the period declared by the service profile.

### Receipt field model

| Field | Requirement |
| --- | --- |
| Receipt ref | Opaque receipt identifier or hash. |
| Quote ref | Binds to the approved service boundary. |
| Operator ref | Identifies the receipt signer without exposing private relationships. |
| Duty refs | Lists exact duties performed. |
| Artifact hashes | Hashes of produced proof-network artifacts. |
| Source root refs | Public-safe roots or refs used as inputs. |
| Unit counts | Optional counts only when they do not leak private workload patterns. |
| Amount or price ref | Optional external settlement reference; no token launch implied. |
| Issued-at and dispute-by | Receipt freshness and challenge window. |
| Boundary flags | Explicit statements such as no raw memory in public artifact and no chain submission unless evidenced. |
| Signature | Duty-key signature over canonical receipt bytes. |

A service receipt is not an invoice unless a separate billing system says so. It is not proof that a customer paid, that an external provider lowered costs, or that a token settlement occurred.

## Disputes

Disputes let controllers, reviewers, or counter-operators challenge a receipt, attestation, grant, revocation, or anchor-preparation claim without exposing private payloads.

### Dispute grounds

Allowed reason codes should be finite and machine-checkable where possible:

| Reason code | Meaning | Public evidence expected |
| --- | --- | --- |
| `signature_invalid` | Signature does not verify against the claimed key ref. | Artifact hash, key ref, verification profile ref. |
| `duty_unauthorized` | Signer lacked the required duty grant. | Duty ref, registration hash, grant/revocation refs. |
| `artifact_hash_mismatch` | Receipt points to a hash that does not match the artifact. | Receipt ref, expected hash, observed artifact hash. |
| `scope_mismatch` | Grant, receipt, or attestation exceeded declared scope. | Scope hash, duty ref, packet hash. |
| `expired_or_replayed` | Artifact expired, nonce repeated, or sequence invalid. | Timestamp, nonce/sequence ref, prior artifact hash. |
| `private_payload_detected` | Public artifact includes forbidden keys or values. | Redacted finding hash, schema path ref, validation profile ref. |
| `anchor_status_overclaimed` | A local anchor plan was described as submitted or finalized. | Anchor batch ref, claim text hash, optional chain evidence absence ref. |
| `receipt_not_performed` | Required artifact for a service receipt is missing or inconsistent. | Quote ref, receipt ref, missing artifact type refs. |
| `bond_terms_mismatch` | Optional future bond terms were represented incorrectly. | Bond ref, terms hash, duty ref. |

### Dispute process

1. **Open**: a claimant creates a dispute packet containing a dispute ref, challenged artifact refs, reason code, evidence hash list, requested remedy ref, and claimant ref hash.
2. **Admissibility check**: a dispute reviewer validates that the packet is public-safe, in-window, and tied to a supported receipt or duty artifact.
3. **Response window**: the operator may submit response refs and corrected artifact refs. Private response evidence stays outside public artifacts.
4. **Resolution**: reviewers sign an outcome hash under a dispute profile.
5. **Remedy**: allowed remedies are narrow: correction ref, receipt withdrawal ref, receipt replacement ref, revocation ref, warning ref, optional bond claim ref, or no-action ref.
6. **Publication**: the public outcome publishes only hashes, refs, reason codes, status, and signatures.

### Dispute outcomes

| Outcome | Meaning |
| --- | --- |
| `accepted` | The dispute reason was validated under the dispute profile. |
| `rejected` | The dispute reason was not validated under the dispute profile. |
| `corrected` | Operator supplied a replacement artifact or amended receipt ref. |
| `withdrawn` | Claimant withdrew the dispute or the challenged receipt was withdrawn. |
| `expired` | Dispute was opened outside the declared review window. |
| `escalated` | Requires private review, legal/commercial process, or future governance profile. |

Dispute records should not erase prior artifacts. They append corrective state so verifiers can evaluate the current status of a receipt or duty claim.

## Bonds and slashing as future optional design

Bonds and slashing are optional future accountability mechanisms. They are not required for the current local proof-network model, they do not imply a token launch, and they must not be described as live collateral unless a separate approved system actually locks and controls the collateral.

### Acceptable bond models without a token launch

| Bond model | Description | Public artifact boundary |
| --- | --- | --- |
| Off-chain escrow ref | A third-party or contractual escrow holds collateral outside the proof artifact. | Bond ref, terms hash, escrow proof ref if approved. |
| Service-credit reserve | Operator commits future service credits under contract. | Reserve ref, terms hash, service profile ref. |
| Security deposit record | A conventional fiat or contractual deposit supports a duty class. | Deposit ref, terms hash, custodian ref if public-safe. |
| Reputation bond | Operator risks a signed public status downgrade rather than funds. | Reputation ref, status hash, dispute outcome ref. |
| On-chain collateral future | A future program may lock collateral on a public rail. | Program/account/transaction refs only after actual deployment evidence. |

### Slashable conditions

Slashable conditions should be objective and tied to signed duties:

- repeated invalid signatures after key registration;
- signing receipts for artifacts whose hashes do not match;
- performing duties outside an active duty grant;
- falsely representing a local anchor plan as submitted or finalized;
- publishing public artifacts with forbidden private payload fields after validation should have rejected them;
- replaying expired receipts, nonces, grants, or verification results;
- refusing a correction path required by an accepted dispute profile.

Do not slash for subjective answer quality, market outcomes, token price, provider behavior, benchmark rank, or claims outside the operator's signed duty scope.

### Due-process requirements

A future slashing profile should require:

1. a signed duty or receipt tying the operator to the challenged action;
2. an admissible dispute packet with public-safe evidence refs;
3. a response window;
4. independent reviewer signature or deterministic verification rule;
5. an outcome ref and remedy ref;
6. a bond terms hash that existed before the disputed action;
7. a public-safe appeal or correction path where the terms allow it.

Until those elements exist as implemented and evidenced infrastructure, docs should say only that slashing and bonds are future optional design patterns.

## Solana rail mapping

Solana can be a compact public rail for commitments, permissions, and settlement refs. It should not be the memory database.

| Protocol object | Optional Solana representation | Public data only |
| --- | --- | --- |
| Operator registration | Registry account or PDA keyed by operator ref/key ref. | Operator ref, key refs, duty hashes, registration hash. |
| Anchor batch | Account or instruction carrying batch root. | Batch root, schema ref, source count, boundary flags. |
| Capability grant | Grant account keyed by issuer, subject ref hash, scope hash, expiry. | Grant hash, scope hash, refs, expiry. |
| Revocation | Nullifier account. | Nullifier hash, issuer ref, effective time. |
| Service receipt | Receipt root account or memo-like commitment. | Receipt hash, service ref, artifact hash list root. |
| Dispute outcome | Outcome root account. | Dispute ref, outcome hash, reviewer signature ref. |
| Bond future | Collateral account or external escrow proof ref. | Bond ref, terms hash, status ref. |

Any Solana field in current local artifacts is a planning reference unless accompanied by real transaction evidence. If a transaction is actually submitted in a future process, public copy must cite the transaction signature/ref, cluster, slot or block metadata, timestamp, and the exact root submitted. Memory remains off-chain.

## Verification rules

A verifier should reject or mark invalid any operator artifact when:

1. the artifact contains forbidden private keys or private-looking values;
2. the schema or profile ref is unsupported;
3. the canonical hash does not match the signed hash;
4. the signer key does not match the key ref;
5. the key ref is not registered or was revoked before the signature time;
6. the duty ref does not authorize the action;
7. the artifact is expired, replayed, or sequence-invalid;
8. a required source root, quote ref, receipt ref, or evidence ref is missing;
9. a revocation or dispute outcome supersedes the artifact;
10. local-only anchor material is claimed as submitted or finalized without separate chain evidence;
11. a receipt claims ROI, compliance certification, provider deletion, model forgetting, token yield, or benchmark superiority;
12. optional bond language claims locked collateral without an approved collateral evidence ref.

Verification may produce `valid`, `invalid`, `superseded`, `disputed`, `expired`, or `requires_private_review` statuses. `requires_private_review` is not a public approval; it means hashes/refs alone are insufficient for the question asked.

## State machines

### Duty lifecycle

`proposed` -> `registered` -> `active` -> `rotating` -> `revoked` -> `expired`

- A duty is usable only in `active` state.
- `rotating` should accept both old and new keys only within an explicit overlap window.
- `revoked` overrides unexpired grants after the revocation effective time.

### Receipt lifecycle

`quoted` -> `accepted` -> `performed` -> `receipted` -> `verified` -> `dispute_window_closed`

Alternate branches:

- `receipted` -> `disputed` -> `corrected` -> `verified`
- `receipted` -> `disputed` -> `accepted_dispute` -> `withdrawn_or_remedied`
- `quoted` -> `expired`

### Dispute lifecycle

`opened` -> `admissible` -> `operator_response_due` -> `under_review` -> `resolved` -> `published`

Alternate branches:

- `opened` -> `rejected_as_unsafe`
- `opened` -> `expired`
- `under_review` -> `escalated_private_review`

## Public operator packet profile

A complete public operator packet should include these sections by ref, not by private payload:

| Section | Required content |
| --- | --- |
| Packet header | Packet schema, packet hash, created-at, profile ref. |
| Operator registration refs | Operator ref, registration hash, key refs, duty refs. |
| Artifact refs | Anchor, grant, revocation, benchmark, receipt, or dispute refs. |
| Signature set | Signer refs, key refs, signature algorithms, signatures. |
| Freshness data | Expiry, nonce, sequence, revocation refs. |
| Verification summary | Validator profile ref, result hash, status, verifier signature if present. |
| Boundary assertions | No raw memory in public artifact; no chain submission unless evidenced; no token launch claim. |
| Optional rail refs | Solana planning refs or actual transaction refs only when separately evidenced. |

## Operator runbook checklist

Before signing or publishing an operator artifact:

1. Confirm the duty key is active and scoped to the exact duty.
2. Validate the artifact against the supported schema/profile.
3. Run the private-payload guard against keys and values.
4. Canonicalize the public-safe body and compute the artifact hash.
5. Bind the signature to the artifact hash, duty ref, key ref, nonce/sequence, and expiry.
6. Check revocation/nullifier state for grants, keys, and prior receipts.
7. Check dispute state for challenged receipts or operators.
8. Ensure any Solana field is either a local planning ref or backed by real transaction evidence.
9. Ensure receipt or bond language makes no token, ROI, compliance, deletion, or model-forgetting claim.
10. Store private evidence separately under the controller's private retention policy.

## Product positioning boundaries

Allowed positioning:

- Enigma defines a private memory controller protocol with operator-signed public-safe receipts.
- Operators can sign duties over hashes, roots, refs, and scopes without exposing memory.
- Solana can serve as an optional compact rail for commitments and permission/settlement refs.
- Service receipts and disputes make proof-network operations reviewable without publishing private workloads.
- Bonds and slashing are future optional accountability patterns that can be designed without launching a token.

Prohibited positioning:

- Do not claim that these docs prove Enigma operates a live proof network or live Solana program.
- Do not claim that Enigma stores memory, prompts, transcripts, embeddings, or tenant data on-chain.
- Do not claim that Enigma has launched a token, staking system, validator set, or collateral market.
- Do not claim that a local proof artifact proves provider deletion, model forgetting, legal compliance, customer ROI, or benchmark superiority.
- Do not claim that an operator receipt is a payment confirmation, invoice, or legal certification unless a separate approved system provides that evidence.
