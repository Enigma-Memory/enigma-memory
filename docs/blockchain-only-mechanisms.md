# Blockchain-only mechanisms

Enigma's product thesis is simple: Enigma is the private memory controller for AI; Solana is an optional proof, permission, and settlement rail that carries hashes, roots, references, and public state transitions only.

This document defines what is meaningfully blockchain-native in Enigma Proof Network and what must remain off-chain. The chain is not the memory database, not the policy engine, not the model runtime, and not the place where private user or tenant data becomes public. It is useful only where a neutral, shared, timestamped state machine creates value that a local log cannot provide by itself.

Status note: the mechanisms below are product/spec boundaries for an optional operator-controlled rail. They are not statements that a public Solana program, transaction flow, settlement market, or operator registry is already running.

## Product boundary

| Layer | Job | Public-chain payload | Off-chain payload |
| --- | --- | --- | --- |
| Enigma private memory controller | Store, retrieve, minimize, grant, revoke, and audit AI memory | None by default | Raw memory, private receipts, retrieval traces, policy bodies, operator notes |
| Proof Network artifacts | Convert selected memory-control events into public-safe evidence | Hashes, Merkle roots, refs, schema ids, timestamps, signatures, nullifiers | Source records, prompts, transcripts, completions, embeddings, ACL bodies |
| Optional Solana rail | Provide neutral ordering, public discoverability, permission state, escrow, settlement, and reputation | Compact commitments and public state transitions | Customer data, private commercial terms, provider payloads, private benchmark rows |

The safe public claim is narrow: Enigma can prepare and verify public-safe proof artifacts for memory commitments, grants, revocations, attestations, and packets while keeping raw memory off-chain. Any network submission, operator settlement, or production operation is a separate operator-controlled step outside this document.

## What is meaningfully blockchain-native

A mechanism belongs on-chain only when it needs at least one of these properties:

1. **Neutral timestamping** — a public observer can see that a commitment existed no later than a chain slot or block time without trusting Enigma's private server clock.
2. **Shared revocation state** — multiple verifiers can consult the same public nullifier set instead of accepting stale private grants.
3. **Public permission state** — wallets, agents, auditors, and marketplaces can resolve a grant or capability reference without relying on a single private API.
4. **Third-party attestations** — independent operators can publish signed commitments into a common registry without exposing their private reports.
5. **Escrow and settlement** — payment and release conditions can execute against public receipt references instead of private invoices alone.
6. **Portable reputation** — operator behavior can accumulate around public keys, attestations, challenge outcomes, and settlement history without revealing private customer content.

Everything else should default off-chain.

## Mechanism 1: neutral timestamped anchors

### Blockchain-native value

A chain anchor gives a public, neutral time boundary for a public-safe commitment. It is useful when a team needs to show that a memory root, receipt-log root, benchmark report hash, release root, or proof packet root existed before a later dispute, review, or handoff.

A local log can say "we created this at 10:00." A public anchor can say "this opaque root was committed into a shared ledger at or before this slot." That difference is the blockchain-native part.

### Public payload

A minimal anchor account or event should contain only:

- schema identifier;
- root or hash, such as a Merkle root or `sha256:` digest;
- public-safe reference, such as a release ref, packet ref, or artifact family ref;
- issuer/operator public key;
- timestamp or slot derived from the chain;
- optional signature over the canonical off-chain artifact hash.

### Off-chain payload

The following remain off-chain and are disclosed only through approved private review channels:

- raw memory records;
- prompts, transcripts, completions, embeddings, and retrieval traces;
- tenant names, user identifiers, customer identifiers, and private workspace names;
- receipt bodies that include operational detail;
- local file paths, logs, provider responses, and secrets.

### Product pattern

Use anchor batches for "existence and integrity" claims, not for content claims. A reviewer with the private packet can recompute the root. A public observer without the packet learns only that an opaque commitment existed.

## Mechanism 2: revocation nullifiers

### Blockchain-native value

Revocation becomes stronger when verifiers share one public set of invalidated grants or consumed capabilities. Without a shared nullifier set, a stale grant can keep circulating in screenshots, exported packets, or disconnected integrations.

A blockchain nullifier is useful because it is:

- publicly discoverable;
- append-only for practical verifier purposes;
- keyed by public-safe grant or scope commitments;
- independent of a single private API being online.

### Public payload

A revocation/nullifier record should contain only:

- nullifier value derived from a grant id, scope digest, or one-time-use proof reference;
- issuer public key or revocation authority public key;
- grant reference or scope digest when safe;
- revocation effective time or slot;
- optional reason reference such as `operator-request:2026-06-25`, not a private reason body.

### Off-chain payload

Keep these off-chain:

- full grant body when it includes private policy detail;
- private reason text;
- customer, tenant, or employee names;
- ACL documents and group membership;
- support tickets, legal requests, private emails, or incident notes.

### Product pattern

Use nullifiers to tell verifiers what not to accept. Do not claim that a nullifier proves third-party erasure, model-internal behavior, or removal from every downstream copy. It proves a public-safe Enigma verifier rule: this grant, scope, or one-time proof reference is no longer valid for verifiers that honor the nullifier set.

## Mechanism 3: public grants

### Blockchain-native value

A public grant is useful when permission should be portable across wallets, agents, reviewers, operators, and marketplaces. It turns a private API permission into a shared, inspectable state object.

The chain is valuable here only for the public edge of the permission: who issued a capability, which public subject can exercise it, what public-safe scope commitment it covers, when it expires, and which nullifier can revoke it.

### Public payload

A grant account or event can contain:

- issuer public key;
- subject public identifier or wallet public key;
- capability name, such as `memory.read.context-pack` or `proof.verify.packet`;
- scope digest or public-safe scope ref;
- expiry time or slot;
- revocation/nullifier reference;
- signature over the canonical grant artifact hash.

### Off-chain payload

Keep private:

- the memory records covered by the grant;
- semantic descriptions that reveal the tenant or use case;
- full ACL policy language;
- private subject metadata;
- purpose text that identifies a customer, incident, medical/legal matter, or sensitive workflow.

### Product pattern

Public grants should be narrow and boring: one issuer, one subject, one capability, one scope digest, one expiry, one revocation path. Broad permanent grants are weaker product design and create unnecessary public linkability.

## Mechanism 4: attestation registry

### Blockchain-native value

An attestation registry lets independent parties publish signed commitments into a common namespace. It is useful for benchmark reports, release packets, conformance packets, operator audits, and integration receipts where the report itself may remain private but its digest should be discoverable.

The blockchain-native advantage is shared indexing: a verifier can discover attestations by package ref, dataset ref, runner ref, operator key, report hash, or packet root without trusting Enigma to host the only registry.

### Public payload

An attestation registry entry should contain:

- attestor public key;
- attestation type, such as benchmark, conformance, release, integration, or operator receipt;
- report hash or packet root;
- public-safe refs for dataset, runner, package, version, environment class, or artifact family;
- timestamp or slot;
- signature and optional expiration or supersession reference.

### Off-chain payload

Keep private:

- raw benchmark rows, questions, answers, conversations, prompts, completions, and provider responses;
- private reports and reviewer notes;
- private environment variables and local file paths;
- customer deployment details;
- evidence that is not approved for public distribution.

### Product pattern

The registry should answer, "Which public key attested to which digest under which schema?" It should not answer, "What private data produced that digest?" Disclosure of the underlying report is a separate permissioned review action.

The local Enigma artifacts that prepare this registry are `enigma.proof_network.registry_entry.v1` and `enigma.proof_network.registry_batch.v1`. A registry entry binds one already-created artifact (anchor batch, benchmark attestation, connector conformance attestation, health report, operator receipt, or settlement job ref) to a public-safe `registry_ref`, the artifact schema ref, digest refs, signer refs, an entry type, and a count — never the artifact body. A registry batch sorts entry hashes into a single registry root. Both are local planning artifacts: they carry `transaction_submitted:false` and `raw_memory_on_chain:false`, and they do not prove that any marketplace, registry program, or live chain has adopted the index. What the chain would uniquely add is shared discovery (any verifier can resolve an indexed digest by package, dataset, runner, or operator key without trusting one private API) and signer accountability (the public key that attested to a digest is recorded alongside it); neither requires revealing the private report behind the digest.

## Mechanism 5: USDC escrow and settlement

### Blockchain-native value

In an implemented operator-controlled settlement program, a USDC escrow would hold funds against public-safe proof conditions and release or refund them according to transparent rules.

This is useful for operator marketplaces and data-processing workflows where parties want payment tied to proof references rather than private trust alone.

### Public payload

A settlement account should contain:

- payer public key;
- operator or payee public key;
- USDC mint and amount;
- job ref, grant ref, packet root, report hash, or receipt root;
- release condition, such as accepted attestation, proof packet verification, challenge window expiry, or nullifier absence;
- timeout and refund path;
- settlement status.

### Off-chain payload

Keep private:

- private contract terms;
- customer identity and billing metadata;
- raw job inputs and outputs;
- invoices containing private line items;
- support disputes and operational notes;
- API keys, wallet seed phrases, and signing material.

### Product pattern

Settlement should reference proof artifacts, not expose work contents. For example: a release rule can require an operator key to sign an attestation for packet root X with no valid challenge/refund condition present. The packet may be reviewed privately; the chain only needs the public-safe root and state transition.

## Mechanism 6: operator reputation

### Blockchain-native value

Operator reputation is useful when users need a portable signal about public-key behavior across integrations. It should be derived from public events, not from private customer data.

A chain can provide a neutral record of:

- anchors submitted by an operator key;
- grants issued or honored;
- revocations published promptly;
- attestations signed under known schemas;
- settled jobs and refunded jobs;
- challenge outcomes when the challenge itself is public-safe.

### Public payload

Reputation inputs can include:

- operator public key;
- schema-specific event counts;
- public-safe challenge or dispute refs;
- settlement completions, refunds, and expired escrows;
- supersession and correction records;
- signer rotation records.

### Off-chain payload

Keep private:

- customer names and tenant identifiers;
- private incident reports;
- raw quality reviews;
- confidential commercial terms;
- private support history;
- any memory, prompt, transcript, completion, embedding, or provider response.

### Product pattern

Reputation should be evidence-indexed, not narrative-indexed. Prefer public counters and signed refs over subjective claims. Avoid financial, regulatory, performance-leadership, or customer-status claims unless separate reviewed evidence exists and the claim is explicitly allowed elsewhere.

## What should stay off-chain

The default rule: if data is private, semantic, reversible, identifying, operationally sensitive, or expensive to correct, keep it off-chain.

| Category | Keep off-chain | Public-safe substitute |
| --- | --- | --- |
| Memory contents | Raw records, summaries, context packs, retrieval traces | Merkle root, record count, derived artifact root |
| Model interaction | Prompts, transcripts, completions, tool traces, provider responses | Hash of approved report or packet |
| Embeddings and indexes | Vectors, nearest-neighbor results, index files | Index root, version ref, build manifest hash |
| Access control | ACL body, group membership, tenant name, private policy text | Scope digest, capability name, expiry, public subject id |
| Identity | Customer names, employee names, private workspace ids | Public key, DID, opaque operator-controlled ref |
| Operations | Logs, stack traces, file paths, runbooks with secrets | Receipt root, release ref, environment class ref |
| Benchmarks | Raw examples, answers, conversations, private reports | Report hash, dataset ref, runner ref, package ref |
| Commercial terms | Invoices, negotiated terms, billing notes | Escrow amount, token mint, settlement state, public job ref |
| Secrets | API keys, private keys, seed phrases, tokens | Never publish; no substitute |

Do not treat hashing as automatic anonymization. Hashes of low-entropy values such as customer names, emails, tenant slugs, ticket numbers, or private project names can be guessed. Use random opaque refs or commitments salted and managed off-chain when linkability would be harmful.

## Privacy boundaries by mechanism

| Mechanism | Public observer can learn | Public observer must not learn |
| --- | --- | --- |
| Anchor | A public-safe root existed by a chain time | The memory, users, prompts, or private report behind the root |
| Nullifier | A grant/scope/proof ref is revoked or consumed | The private reason, customer, policy body, or underlying memory |
| Public grant | A subject has a capability over a scope digest until expiry | The private scope contents or tenant context |
| Attestation registry | A public key signed a claim about a digest under a schema | Raw benchmark data, provider outputs, private review notes |
| USDC escrow | Funds are locked, released, refunded, or disputed against public refs | Private contract terms or job contents |
| Operator reputation | Public-key history over anchors, attestations, settlements, and challenges | Customer identities, private incidents, private quality narratives |

## Design rules

1. **Commit, do not reveal.** Put roots, hashes, refs, signatures, and nullifiers on-chain; keep source data off-chain.
2. **Prefer opaque refs.** A public ref should not encode tenant names, private project names, or sensitive workflow labels.
3. **Make revocation first-class.** Every grant needs an expiry and a nullifier path.
4. **Separate proof from execution.** A proof artifact can show a commitment or state transition; it does not prove third-party erasure, model-internal behavior, legal status, business outcomes, or production operation.
5. **Minimize public linkability.** Use separate operator keys, scoped refs, and short-lived grants when a single public graph would reveal too much.
6. **Keep settlement about receipts.** Escrow releases should depend on public-safe proof refs and challenge windows, not raw job contents.
7. **Make corrections explicit.** Use supersession records for mistaken anchors or attestations; do not mutate history or publish private explanations.


## Minimal on-chain state model

The public rail should be modeled as a small state machine over commitments, not as a storage layer for Enigma data.

| State object | Deterministic public key seeds | Stored fields | Verifier question |
| --- | --- | --- | --- |
| Anchor record | program id, `anchor`, root digest, operator key | root, schema id, operator key, slot, optional artifact ref | Did this public-safe root exist by this chain time? |
| Grant record | program id, `grant`, issuer key, subject key, scope digest, capability | grant id, capability, scope digest, expiry, revocation ref | Was this public subject granted this scoped capability at this time? |
| Nullifier record | program id, `nullifier`, nullifier digest | nullifier digest, issuer key, effective slot, optional safe reason ref | Should verifiers reject the matching grant, scope, or one-time proof? |
| Attestation record | program id, `attestation`, attestor key, report or packet digest | digest, attestation type, public-safe refs, slot, signature | Which public key attested to this digest under which schema? |
| Registry index record | program id, `registry`, registry namespace ref, artifact digest, attestor key | artifact digest, artifact schema ref, entry type, public-safe digest/signer refs, count, slot, signature | Which public key indexed which digest under which schema and registry namespace? |
| Escrow record | program id, `escrow`, payer key, operator key, job ref | token mint, amount, proof refs, release rule, timeout, state | Are funds locked, releasable, refundable, or disputed against public-safe refs? |
| Reputation index | program id, `operator`, operator key | counters, correction refs, challenge refs, signer rotation refs | What public-key history can be checked without private customer facts? |

All deterministic seeds must be public-safe. Never derive a public address from raw memory, tenant names, emails, private project slugs, ACL bodies, local file paths, ticket numbers, prompts, transcripts, completions, embeddings, provider responses, API keys, private keys, or seed phrases.

## Instruction-level examples

These are product/spec examples, not statements that a public program or deployment exists.

| Instruction | Required public-safe inputs | State transition | Private data that must not be passed |
| --- | --- | --- | --- |
| `anchor_root` | root digest, schema id, artifact ref, operator signature | creates or updates an anchor record | memory rows, prompt text, transcript text, embeddings, provider payloads |
| `issue_grant` | issuer key, subject key, capability, scope digest, expiry, revocation ref | creates a grant record | ACL body, customer name, private purpose text, private group membership |
| `revoke_grant` | issuer key, grant ref or scope digest, nullifier digest, safe reason ref | creates a nullifier record | revocation narrative, support ticket, legal request, customer identity |
| `register_attestation` | attestor key, report or packet digest, public-safe refs, signature | creates an attestation record | raw benchmark rows, answers, conversations, private report body |
| `open_escrow` | payer key, operator key, USDC mint, amount, job ref, release rule, timeout | locks funds against public-safe proof refs | job input, job output, invoice terms, billing metadata |
| `settle_escrow` | escrow ref, accepted proof ref, operator signature or challenge-window result | releases, refunds, or marks disputed | private dispute evidence, work product, customer communications |
| `rotate_operator_key` | old key, new key, signed rotation ref | records signer rotation for reputation continuity | internal security notes, incident details, private key material |

The product discipline is to make public instructions boring. Each instruction should consume compact refs and signatures, perform one public state transition, and leave interpretation of private content to off-chain reviewers who are authorized to see it.

## Concrete user-facing workflows

### Reviewer packet with neutral anchor

1. Enigma prepares a private reviewer packet containing approved evidence.
2. The packet root is computed locally.
3. The operator anchors only the root and a public-safe packet ref.
4. A reviewer later recomputes the packet root from the private packet and checks that the public anchor existed before the review deadline.

The chain contributes time and neutrality. Enigma contributes private evidence control.

### Scoped agent permission with revocation

1. An operator creates a capability grant for an agent public key and a scope digest.
2. The grant expires automatically at a declared time or slot.
3. If access should end earlier, the operator publishes a nullifier.
4. Verifiers reject packets, context requests, or settlement claims that depend on the revoked grant.

The chain contributes shared permission and revocation state. It does not expose the memory scope.

### Attested benchmark or release

1. A benchmark or release report remains in a private review system.
2. Enigma emits a report hash or packet root.
3. An attestor registers the digest with dataset, runner, package, and environment refs that are safe to publish.
4. Reviewers with access to the report can recompute the digest; public observers can see only that the attestation exists.

The chain contributes shared discovery and signer accountability. It does not publish raw benchmark examples or private results.

### Marketplace registry index

1. Enigma creates one or more proof artifacts (anchor, attestation, health report, operator receipt, or settlement job ref) and keeps their bodies private.
2. Enigma emits a registry entry per artifact that records only the artifact hash, schema ref, digest refs, signer refs, entry type, and a registry namespace ref.
3. Enigma aggregates entries into a registry batch whose root commits to the whole index.
4. A reviewer resolves individual artifact hashes through approved private channels; a public observer can see only that a digest was indexed under a schema by named signers.

The chain would contribute shared discovery and signer accountability. The local registry artifacts do not broadcast to a marketplace, register on a live chain, or prove third-party adoption.

### Escrow for proof-backed operator work

1. A payer would lock USDC against a job ref and release rule.
2. The operator would submit an accepted proof ref, packet root, or attestation digest.
3. The escrow would release, refund, or enter a public-safe dispute state according to the rule and timeout.
4. Private job inputs, outputs, and disputes stay in the off-chain review process.

The chain contributes programmable settlement. Enigma keeps work contents private.

## Anti-patterns

Avoid these designs even if they are technically possible:

- putting encrypted memory on-chain and assuming future secrecy;
- using hashes of tenant names, emails, ticket numbers, or private project names as public identifiers;
- publishing broad grants with no expiry or revocation path;
- storing raw benchmark examples, prompts, answers, or provider outputs in an attestation account;
- encoding private customer or incident details in escrow job refs;
- treating operator reputation as a marketing scoreboard rather than a public-key evidence index;
- describing local proof artifacts as if they prove network transactions, third-party erasure, model-internal behavior, legal status, financial outcomes, performance leadership, or production operation.

## Verifier checklist

Before relying on a public-chain proof reference, a verifier should ask:

1. Is the payload limited to roots, hashes, refs, public keys, timestamps, signatures, counts, nullifiers, token amounts, or settlement state?
2. Can every public ref be shown to be non-identifying or approved for public release?
3. Does every grant have a scope digest, expiry, and revocation/nullifier path?
4. Does every revocation avoid private reason text and private customer identifiers?
5. Does every attestation point to a digest rather than embedding raw report contents?
6. Does every escrow condition depend on public-safe proof refs rather than private work contents?
7. Does every reputation signal derive from public events rather than confidential narratives?
8. Is the underlying private artifact available only through an authorized off-chain review path?

## Product framing

The blockchain component should be marketed as a proof and coordination rail, not as decentralized memory storage. Enigma's differentiated product is the private memory controller: it governs AI memory locally, emits public-safe receipts, and optionally lets operators anchor, revoke, attest, settle, and build reputation through a neutral public rail.

That framing keeps the system credible:

- private memory remains private;
- public proofs remain small and inspectable;
- Solana is useful where neutrality, shared state, and settlement matter;
- non-chain work stays in the private data plane where it belongs.
