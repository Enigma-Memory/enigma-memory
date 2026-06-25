# Memory Passport Standard

Status: draft v0.1  
Audience: client authors, connector authors, operators, auditors, and verifier implementers

The Memory Passport is Enigma's portable, private memory container format. It lets a user, team, or customer move AI memory across supported tools while keeping Enigma-controlled custody, lifecycle state, context-pack decisions, and proof receipts verifiable without publishing raw memory.

This standard defines the minimum public-safe metadata and proof semantics for a conforming Memory Passport. It does not define a hosted service, a deployed Solana program, provider-side deletion, model forgetting, legal compliance certification, benchmark superiority, or financial outcome. Solana, if used, is an optional proof, permission, or settlement rail for hashes, roots, references, and nullifiers only.

## 1. Design goals

A conforming passport MUST:

1. Treat Enigma-controlled memory state as the canonical source of truth.
2. Keep provider-native memory, chat history, logs, and personalization as non-canonical caches unless imported and receipted through Enigma.
3. Separate private payloads from public proof material.
4. Preserve lifecycle evidence for active, deleted/tombstoned, and derived memory state.
5. Support scoped context packs for model, tool, and agent boundaries.
6. Support import and export without leaking raw private data into public artifacts.
7. Let offline verifiers check roots, receipts, signatures, versions, and conformance claims.
8. Allow optional chain anchoring or settlement without placing raw memory, prompts, transcripts, completions, embeddings, tenant names, API keys, private keys, seed phrases, or provider responses on a public network.

A conforming passport MUST NOT claim that it proves external provider deletion, backup erasure, model forgetting, provider account identity, customer identity, legal compliance, ROI, or chain finality unless that evidence is supplied by a separately reviewed process outside this standard.

## 2. Terminology

| Term | Meaning |
| --- | --- |
| Passport | The private memory container plus its public-safe proof envelope. |
| Private payload | Memory bodies, user notes, prompts, transcripts, completions, embeddings, provider responses, private policy text, tenant identifiers, and secrets. |
| Public proof profile | The subset of passport metadata safe to publish or anchor: hashes, Merkle roots, refs, counts, timestamps, schema names, version ids, policy refs, signature refs, and nullifiers. |
| Memory address | A stable commitment or internal reference to a memory record. Public artifacts expose only commitments or refs, not the memory body. |
| Active set | Memory addresses currently eligible for Enigma serving and context-pack construction. |
| Deleted set | Tombstoned or delete-requested memory addresses that MUST NOT be served by Enigma active paths after the effective tombstone epoch. |
| Derived set | Indexes, summaries, context packs, exports, benchmark reports, or other artifacts derived from private memory. |
| Receipt | A signed or signable event record that binds an operation to roots, refs, counts, timestamps, versions, and boundary statements. |
| Context pack | A minimized, task-specific bundle prepared for a model, tool, agent, or connector under policy. Private context may exist in the pack payload; public proof material commits only to roots and refs. |
| Epoch | A monotonically ordered passport state boundary. Each accepted mutation produces or references an epoch. |

## 3. Passport object model

A Memory Passport has two layers:

1. **Private layer.** Encrypted or local-only memory records, private policies, private context-pack payloads, embeddings if present, import source material, and user/operator notes.
2. **Proof layer.** Public-safe metadata that commits to the private layer without disclosing it.

The proof layer MUST contain, at minimum:

| Field class | Requirement |
| --- | --- |
| Passport identifier | A stable public-safe passport ref or commitment. It MUST NOT be a user email, tenant name, wallet identity, filesystem path, or provider account id. |
| Standard version | The Memory Passport Standard version and any profile version used by the verifier. |
| Issuer/signature refs | Public key refs, signature refs, or local signer refs sufficient for the verifier profile. Private keys MUST NOT appear. |
| Epoch refs | Current epoch, previous epoch where applicable, and creation/import epoch refs. |
| Required roots | Active root, deleted/tombstone root, receipt log root, and derived artifact root. Custody and semantic roots are REQUIRED when the passport advertises the dual-root profile. |
| Counts | Public-safe counts for active addresses, deleted/tombstoned addresses, receipt entries, derived artifacts, imports, exports, and context packs where applicable. |
| Policy refs | Policy hashes or refs that governed active serving, context construction, import, export, deletion, and derived refresh. Private policy text MUST NOT appear. |
| Boundary statement | A short public-safe statement of what the passport proves and what it does not prove. |

The proof layer MAY be exported, verified, witnessed, or anchored. The private layer MUST remain local, encrypted, or shared only through an explicit private exchange path.

## 4. Required roots

A conforming passport MUST compute and retain the following roots for each committed epoch.

| Root | Covers | Public-safe verifier question |
| --- | --- | --- |
| Active root | Memory address commitments eligible for current Enigma serving. | Is this address set the one Enigma is allowed to retrieve from now? |
| Deleted root | Tombstoned/delete-requested address commitments and effective tombstone epochs. | Is this address excluded from active serving after the declared epoch? |
| Receipt log root | Ordered lifecycle and boundary receipt commitments. | Does a receipt belong to the passport history claimed by this epoch? |
| Derived artifact root | Commitments to indexes, summaries, context packs, exports, benchmark reports, and other derived artifacts. | Were derived artifacts refreshed against the declared source roots? |
| Import root | Source import commitments, source caveats, transformation refs, and import receipts. | Can imported material be distinguished from Enigma-native memory until re-receipted? |
| Export root | Export manifest commitments, included root refs, and export receipts. | Does an exported bundle match the passport epoch and proof profile? |

The following roots are REQUIRED for passports that advertise the dual-root profile and RECOMMENDED for all new implementations:

| Root | Covers | Purpose |
| --- | --- | --- |
| Custody/lifecycle root | Memory address commitments, lifecycle receipts, issuer refs, and epoch links. | Proves custody history over committed addresses without exposing memory. |
| Semantic-use root | Purpose refs, sensitivity class refs, capability refs, retrieval class refs, and policy refs. | Proves the semantic boundary used to construct context without exposing text or embeddings. |

Both dual-root values MUST bind to the same epoch ref, passport ref, policy-ref set, and memory-count summary. A verifier MUST reject a passport proof if either root is missing from a dual-root profile, if the roots bind to different epochs, or if counts/policy refs disagree.

## 5. Receipt requirements

Every passport mutation or boundary event MUST produce a receipt commitment. The private receipt body MAY remain local; the public receipt envelope MUST be sufficient for offline verification.

### 5.1 Required receipt classes

| Receipt class | When emitted | Required public-safe commitments |
| --- | --- | --- |
| Create | Passport creation or first controlled import. | Passport ref, standard version, issuer ref, initial roots, timestamp, signature ref. |
| Remember/import | New memory is accepted into Enigma-controlled state. | Prior epoch, next epoch, source class ref, import root where applicable, active root, receipt log root. |
| Update | Existing committed memory address changes. | Address commitment, prior active root, next active root, policy ref, receipt log root. |
| Tombstone/delete-request | Memory is removed from Enigma active serving eligibility. | Address commitment or deletion batch root, tombstone epoch, deleted root, next active root, boundary statement. |
| Derived refresh | Index, summary, context pack, export, or benchmark artifact is rebuilt. | Source roots, derived artifact root, builder/version ref, count summary. |
| Context pre-receipt | A requester asks for scoped context before payload disclosure. | Request nonce, purpose ref, policy hash, receiver capability ref, allowed output class, source root refs. |
| Context final receipt | A context request is approved or denied. | Pre-receipt hash, decision, disclosure root or denial reason code, context-pack ref, next receipt log root. |
| Export | A passport or proof bundle leaves the local system. | Export root, included epoch, included roots, redaction profile, recipient/ref class if public-safe. |
| Import | A bundle enters a passport. | Source export root, source caveat refs, transformation refs, accepted/rejected counts, next active root. |
| Verify | A verifier checks a passport, receipt, context pack, export, or proof packet. | Verifier version ref, checked roots, pass/fail code, failure boundary if any. |
| Fork | Two histories claim incompatible next epochs. | Shared ancestor ref, branch root refs, signer refs, resolution policy hash, no-plaintext conflict summary. |
| Revocation/nullifier | A capability, context permission, export authorization, or one-time proof is revoked or consumed. | Grant/ref id, nullifier, reason code, timestamp, signature ref. |

Receipt envelopes MUST NOT contain raw memory, raw prompts, transcripts, completions, embeddings, private policy bodies, private ACLs, tenant names, customer names, account ids, API keys, private keys, seed phrases, provider responses, or wallet seed material.

### 5.2 Receipt ordering

Receipts MUST be ordered by epoch or by an append-only sequence whose root is committed in the receipt log root. Implementations MAY use a Merkle tree, hash chain, transparency-log-style structure, or equivalent commitment scheme, but the verifier MUST be able to detect:

- missing receipts;
- reordered receipts;
- receipt replay across passport ids;
- mismatched previous/next roots;
- duplicate nonces or nullifiers;
- derived artifacts built from stale roots;
- tombstoned addresses that remain in the active root after the effective deletion epoch.

## 6. Active, deleted, and derived separation

A conforming passport MUST keep active, deleted, and derived state logically separate even if an implementation stores them in the same local database.

### 6.1 Active memory

The active set contains only memory address commitments eligible for current Enigma retrieval and context-pack construction. Active membership MUST be governed by the current policy refs and MUST be committed in the active root.

### 6.2 Deleted and tombstoned memory

The deleted set records tombstones, delete requests, non-serving commitments, and effective epochs. A tombstoned address MAY remain in private audit history, backups, or receipt logs, but it MUST NOT remain eligible for Enigma active serving after the tombstone epoch.

A passport MAY prove Enigma active-serving exclusion for a committed address. It MUST NOT describe that proof as provider deletion, external backup deletion, model forgetting, semantic forgetting, or legal erasure unless separate evidence exists outside this standard.

### 6.3 Derived artifacts

Derived artifacts include indexes, summaries, retrieval caches, context packs, export manifests, benchmark reports, and proof packets. Each derived artifact MUST declare the source roots and builder/version refs used to produce it.

When active or deleted roots change, implementations MUST either:

1. refresh affected derived artifacts and emit derived-refresh receipts; or
2. mark affected derived artifacts stale and prevent them from being used as current proof.

A context pack or export MUST NOT be considered current if it depends on a root older than the passport epoch it claims to represent, unless it explicitly declares a historical-epoch profile.

## 7. Context pack profile

Context packs are private operational payloads with public proof envelopes. They let Enigma prepare task-specific memory for models, tools, agents, or connectors while keeping the passport as canonical custody.

### 7.1 Construction requirements

Before constructing a context pack, a conforming implementation MUST bind:

- passport ref;
- current epoch ref;
- active root;
- deleted root or tombstone exclusion root;
- policy refs;
- purpose ref;
- requester nonce;
- receiver capability ref or boundary ref;
- selected-address root;
- omitted-address count or omission-root ref;
- context builder/version ref;
- maximum disclosure class or allowed output class.

The implementation MUST emit a context pre-receipt before private context leaves the passport boundary and a context final receipt after approval or denial.

### 7.2 Disclosure rules

A context-pack public envelope MAY include hashes, roots, refs, counts, timestamps, version ids, decision codes, and signature refs. It MUST NOT include the private context text, source memory text, model prompt, model completion, embedding vector, provider response, user identity, tenant identity, or private policy text.

If a context pack is denied, the final receipt SHOULD use a public-safe reason code such as `policy_scope_mismatch`, `expired_capability`, `tombstoned_source`, `stale_derived_root`, or `private_payload_rejected`. It SHOULD NOT include private narrative details.

### 7.3 Receiver obligations

A receiver that advertises Memory Passport compatibility MUST:

- request context for a declared purpose and boundary;
- treat received context as scoped, not as ownership of the passport;
- preserve receipt refs for audit and troubleshooting;
- avoid storing raw context in public logs or proof packets;
- avoid claiming that provider-native memory is canonical unless the memory was re-imported and receipted into Enigma-controlled state.

## 8. Import and export

### 8.1 Import

Imports from providers, vector stores, files, agent frameworks, previous passports, or backups MUST be marked by source class and caveat refs until rewritten into Enigma-native memory through a receipt-producing operation.

An import receipt MUST distinguish at least:

| Source class | Required caveat |
| --- | --- |
| Provider export | Enigma does not prove provider retention, deletion, completeness, or account identity from the export alone. |
| Vector/RAG store | Enigma does not infer lifecycle semantics from an index unless the source includes compatible receipts. |
| Agent framework state | Enigma treats framework state as imported memory until receipted into the passport. |
| Previous passport | Enigma verifies source roots and receipt continuity before accepting as same-history state. |
| Manual file import | Enigma verifies only the local import operation and resulting commitments. |

Imports MUST reject or quarantine payloads that would place raw private content into public proof fields. Accepted imports MUST update the import root, active root where applicable, receipt log root, and count summary.

### 8.2 Export

Exports MUST be explicit and receipted. Export profiles SHOULD be one of:

| Profile | Contents | Use |
| --- | --- | --- |
| Private transfer | Private payload plus proof envelope, encrypted or otherwise controlled by the operator/user. | Moving a passport between trusted environments. |
| Proof-only | Public-safe roots, refs, counts, signatures, and conformance statement. | Sharing verification material without memory content. |
| Context-pack transfer | Scoped private context plus public envelope for a specific receiver and purpose. | One task, tool, agent, or connector boundary. |
| Historical archive | Private or controlled archive plus proof roots for a declared historical epoch. | Backup, audit, or migration. |

A proof-only export MUST be safe to publish. A private transfer or context-pack transfer MUST NOT be treated as public-safe simply because it contains a proof envelope.

## 9. Privacy and public proof profile

The public proof profile is the subset of passport data that may appear in docs, examples, verifier output, proof packets, or optional chain-anchor planning artifacts.

### 9.1 Allowed public fields

Public artifacts MAY include:

- schema ids and standard versions;
- passport refs and artifact refs that are not directly identifying;
- `sha256:` hashes or Merkle roots;
- epoch refs, previous-root refs, and receipt refs;
- counts and aggregate summaries;
- timestamps rounded or minimized as appropriate for the use case;
- policy hashes and public policy refs;
- purpose refs and sensitivity class refs;
- decision codes and boundary codes;
- public key refs and signature refs;
- nullifiers and revocation refs;
- optional chain/network labels when no transaction submission is claimed.

### 9.2 Prohibited public fields

Public artifacts MUST NOT include:

- raw memory bodies;
- prompts, transcripts, completions, or provider responses;
- embeddings or vector values;
- private context-pack payloads;
- tenant names, customer names, user emails, local usernames, or account ids;
- raw ACLs, private policy text, incident details, or support narratives;
- API keys, bearer tokens, private keys, seed phrases, wallet seed material, or signing secrets;
- local absolute paths that reveal personal or customer identity;
- provider deletion claims or model-forgetting claims encoded as facts.

### 9.3 Optional Solana proof rail

A passport MAY produce Solana-ready anchor, permission, revocation, or settlement references. These artifacts MUST carry only public proof profile data: roots, hashes, refs, nullifiers, counts, schema ids, and boundary flags.

Local planning artifacts MUST clearly state when no transaction was submitted. A passport verifier MUST NOT infer Solana finality from a local planning artifact. If an external workflow later submits an anchor transaction, chain verification and transaction identity are outside this standard and MUST be documented separately.

## 10. Versioning

The standard uses semantic-ish profile identifiers:

- breaking verifier semantics: increment the major version;
- additive receipt classes, optional fields, or profiles: increment the minor version;
- wording clarifications and non-semantic registry updates: increment the patch version.

Every passport proof layer MUST declare:

| Version field | Requirement |
| --- | --- |
| Standard version | The Memory Passport Standard version targeted by the passport. |
| Passport schema version | The concrete schema/profile used by the proof envelope. |
| Receipt schema version | The schema/profile used by each receipt class. |
| Context-pack profile version | The context construction and public-envelope profile. |
| Import/export profile version | The profile that governed bundle creation or acceptance. |
| Verifier version | The verifier implementation or ruleset used for a verification receipt. |

Verifiers MUST fail closed when encountering unsupported major versions. Verifiers MAY accept older minor versions if the implementation can preserve the same privacy boundary and root semantics. Implementations MUST NOT silently reinterpret an older passport into a newer profile without emitting migration receipts.

### 10.1 Migration

A migration from one passport version to another MUST emit a migration receipt that binds:

- source standard version;
- target standard version;
- source roots;
- target roots;
- migration tool/version ref;
- accepted/rejected artifact counts;
- policy refs used for transformation;
- boundary statement.

Migration MUST NOT launder imported or caveated material into native Enigma memory without the required lifecycle receipts.

## 11. Conformance

A conforming implementation MUST pass the normative checks below for the profile it advertises.

### 11.1 Passport conformance

- The proof layer MUST declare standard, schema, receipt, context-pack, import/export, and verifier versions.
- The passport ref MUST be public-safe and not directly identifying.
- Active root, deleted root, receipt log root, derived artifact root, import root, and export root MUST be present or explicitly declared empty with valid empty-root semantics.
- Dual-root passports MUST include custody/lifecycle root and semantic-use root bound to the same epoch, policy refs, and count summary.
- Counts MUST be internally consistent with the corresponding roots and receipts.
- The receipt log MUST detect missing, reordered, replayed, or mismatched receipts.
- Tombstoned addresses MUST be excluded from active serving after the effective epoch.
- Derived artifacts MUST declare source roots and be refreshed or marked stale after relevant root changes.

### 11.2 Context-pack conformance

- Context packs MUST be scoped by purpose, policy, receiver capability, epoch, and source roots.
- Context pre-receipt and final receipt MUST be emitted for approved and denied requests.
- Public context-pack envelopes MUST contain only hashes, roots, refs, counts, versions, decisions, timestamps, and signature refs.
- Denials SHOULD use public-safe reason codes.
- Context packs derived from stale roots MUST be rejected or marked historical.
- Deleted/tombstoned addresses MUST NOT appear in current context packs.

### 11.3 Import/export conformance

- Imports MUST record source class, source caveats, transformation refs, accepted/rejected counts, and resulting roots.
- Imported material MUST stay caveated until receipted as Enigma-controlled memory.
- Exports MUST declare private-transfer, proof-only, context-pack-transfer, or historical-archive profile.
- Proof-only exports MUST be safe to publish under the public proof profile.
- Private transfers and context-pack transfers MUST NOT be labeled public-safe unless private payloads are absent.
- Export receipts MUST bind the exact epoch and included root refs.

### 11.4 Privacy conformance

- Public artifacts MUST reject raw memory, prompts, transcripts, completions, embeddings, private context, provider responses, tenant names, customer names, local usernames, private policy text, raw ACLs, secrets, private keys, seed phrases, and API keys.
- Public examples MUST use synthetic refs, hashes, roots, counts, versions, and reason codes.
- Boundary statements MUST avoid provider deletion, model forgetting, compliance certification, ROI, live deployment, or benchmark superiority claims unless separately evidenced.
- Optional chain artifacts MUST carry hashes, roots, refs, nullifiers, counts, and boundary flags only.

### 11.5 Verifier conformance

A verifier MUST reject:

- unsupported major versions;
- missing required roots;
- malformed hashes, refs, timestamps, counts, or signature refs;
- mismatched epoch bindings across roots;
- inconsistent active/deleted membership;
- context packs without matching pre-receipts and final receipts;
- derived artifacts built from stale roots without a historical profile;
- duplicate nonces or nullifiers;
- public payloads containing prohibited private fields;
- chain-planning artifacts that imply transaction submission when no independently verified transaction evidence is supplied.

A verifier MAY warn, rather than fail, on optional profile fields that are absent from an older supported minor version, provided the missing field does not weaken the privacy boundary, root binding, receipt ordering, or active/deleted/derived separation.

## 12. Minimal conformance packet

A public conformance packet for a Memory Passport implementation SHOULD contain:

| Packet section | Public-safe contents |
| --- | --- |
| Implementation summary | Product/tool name as a public ref, version, supported passport profile, supported operating mode. |
| Root summary | Current active, deleted, receipt log, derived, import, and export roots with counts. |
| Receipt summary | Receipt class counts, latest epoch, verifier status, failure codes if any. |
| Context-pack summary | Approved/denied counts, context profile version, selected-address roots, omitted counts. |
| Import/export summary | Source classes, caveat refs, accepted/rejected counts, export profile refs. |
| Privacy statement | Explicit list of private material excluded from public artifacts. |
| Chain statement | Whether the packet is local-only, Solana-ready, or externally anchored; if local-only, it MUST state that no transaction was submitted. |
| Conformance result | Pass/fail/not-applicable decisions for the checks in this standard. |

The packet is evidence that a reviewed implementation followed this Memory Passport proof profile for declared artifacts. It is not a substitute for a security audit, legal compliance review, cloud deployment proof, provider deletion report, or chain finality proof.

## 13. Canonicalization and root construction

Implementations MAY choose different storage engines, but public roots MUST be reproducible from the public proof profile and the private commitments they represent. A conforming implementation MUST document its canonicalization profile before claiming interoperability.

### 13.1 Canonical field profile

Canonical root inputs MUST:

- use stable field names for proof-layer fields;
- sort unordered sets by bytewise ref or commitment value before hashing;
- preserve receipt order when computing receipt log roots;
- distinguish absent fields from explicitly empty sets;
- include the root type label in each root calculation so an active root cannot be replayed as a deleted root or derived artifact root;
- include passport ref, epoch ref, standard version, and profile version in every top-level epoch commitment;
- normalize timestamps to a declared precision before inclusion in public commitments.

Canonical root inputs MUST NOT include raw memory bodies, prompts, transcripts, completions, embeddings, private policy text, provider responses, tenant names, private keys, API keys, seed phrases, or local personal paths.

### 13.2 Empty roots

If a required set is empty, the passport MUST use a deterministic empty-root value for that root type and profile version. The empty-root calculation MUST still bind the root type label, passport ref, epoch ref, and standard version. A missing root and an empty root are different states; verifiers MUST reject missing required roots.

### 13.3 Hash and signature agility

The draft baseline hash identifier is `sha256`. Implementations MAY add stronger or domain-specific commitment schemes, but the proof envelope MUST identify the hash suite or commitment suite used for every root. Verifiers MUST fail closed when a root uses an unsupported suite.

Signature material MUST be represented by public key refs, signature refs, verifier refs, or detached signatures according to the advertised profile. Private signing material MUST never appear in a passport proof layer, conformance packet, example, verifier output, or chain-planning artifact.

## 14. Verification procedure

A verifier for this standard SHOULD process a passport proof layer in this order:

1. Parse the declared standard version, schema/profile versions, and public proof profile.
2. Reject unsupported major versions or unknown required profiles.
3. Run the privacy filter over every public field before displaying, exporting, anchoring, or storing verifier output.
4. Validate root syntax, hash-suite identifiers, count syntax, timestamp syntax, signature refs, and nullifier refs.
5. Recompute or check required roots according to the canonicalization profile.
6. Check epoch continuity from previous epoch refs to current epoch refs.
7. Check receipt log membership, ordering, nonces, nullifiers, previous roots, and next roots.
8. Check active/deleted separation and reject any current active proof that includes a tombstoned address after its effective epoch.
9. Check derived artifacts against their declared source roots and reject stale current artifacts.
10. Check context-pack pre-receipts and final receipts for matching nonce, purpose ref, policy ref, receiver capability ref, decision code, and disclosure root or denial code.
11. Check import caveats and export profiles before labeling any artifact public-safe.
12. Emit a public-safe verification result with pass/fail codes, checked root refs, version refs, and boundary statements only.

Verifier output MUST be safe to share under the public proof profile. If a verifier encounters private-looking fields or values, it MUST fail before producing a reusable public packet.

## 15. Conformance levels

Implementations MAY advertise only the levels they actually support.

| Level | Required capability | Public claim allowed |
| --- | --- | --- |
| Passport Core | Create passport proof layers, maintain required roots, emit lifecycle receipts, and verify active/deleted separation. | The implementation supports Enigma Memory Passport custody and lifecycle proof for Enigma-controlled state. |
| Context Boundary | Passport Core plus context pre-receipts, final receipts, context-pack roots, purpose refs, and receiver capability refs. | The implementation can produce receipt-backed scoped context packs without making provider-side deletion or model-forgetting claims. |
| Import/Export | Passport Core plus import roots, export roots, source caveats, export profiles, and migration receipts. | The implementation can move passport material through declared private-transfer, proof-only, context-pack-transfer, or historical-archive profiles. |
| Dual Root | Passport Core plus custody/lifecycle root and semantic-use root bound to the same epoch, policy refs, and counts. | The implementation supports separable custody and semantic-use verification for the same private corpus commitments. |
| Public Proof Rail | Passport Core plus public-safe conformance packets and optional chain-ready refs/nullifiers. | The implementation can produce public-safe proof packets or Solana-ready planning artifacts containing hashes, roots, refs, counts, and nullifiers only. |

Conformance levels are cumulative only where explicitly stated. A product MUST NOT imply support for a higher level because it supports one required artifact from that level.

## 16. Registry guidance

Implementations SHOULD maintain small registries for public-safe identifiers used by the passport proof layer:

| Registry | Examples | Rule |
| --- | --- | --- |
| Receipt class registry | create, import, update, tombstone, derived refresh, context pre-receipt, context final receipt, export, verify, fork, revocation | New receipt classes MUST define required roots, privacy exclusions, and verifier failure modes. |
| Purpose registry | support-summary, code-assist, retrieval, benchmark-fixture, migration-review | Purpose refs MUST be generic and non-identifying. |
| Sensitivity registry | public-safe, private, restricted, regulated-review-required | Sensitivity refs MUST NOT encode tenant names, user names, or private policy text. |
| Denial reason registry | policy_scope_mismatch, expired_capability, tombstoned_source, stale_derived_root, private_payload_rejected | Denial codes MUST be safe to log and share. |
| Source class registry | provider-export, vector-store, agent-state, previous-passport, manual-file, backup | Source classes MUST carry caveats about what Enigma does and does not prove. |
| Export profile registry | private-transfer, proof-only, context-pack-transfer, historical-archive | Export profiles MUST clearly distinguish private payload movement from public proof publication. |

Registry entries SHOULD be stable, short, and boring. They MUST NOT embed private names, account identifiers, source text, prompts, provider responses, or secrets.

## 17. Standard boundaries

This standard is intentionally narrow. It specifies how Enigma Memory Passports structure roots, receipts, context boundaries, import/export semantics, privacy profiles, versioning, and conformance evidence. It does not require a specific database, vector index, model provider, wallet, cloud provider, hosted deployment, chain program, benchmark runner, or legal review process.

The product thesis is that Enigma is the private memory controller for AI. The passport proof layer makes that controller portable and verifiable while keeping private memory private. Solana remains optional infrastructure for public-safe roots, refs, nullifiers, permission evidence, or settlement references; it is never the place where raw memory lives.
