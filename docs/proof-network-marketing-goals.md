# Proof Network marketing goals

## Purpose

This plan positions the Enigma Proof Network as the next uniqueness layer for AI memory: proof receipts, permissionless capability grants, benchmark attestations, and settlement-ready anchors without putting raw memory on-chain. It is launch messaging and campaign direction, not a claim that Enigma has submitted live blockchain transactions, operates a live SaaS, deletes provider data, or proves model forgetting.

## Launch narrative

AI memory is becoming infrastructure. The hard problem is no longer only storing context; it is proving what memory system did, who was allowed to use which capability, which benchmark result was attested, and which public commitment can be checked later without leaking the underlying memory.

Enigma's answer is a privacy-preserving Proof Network for AI memory. The network turns private memory operations into public-safe proof artifacts:

- **Proof receipts** record Enigma-mediated memory boundaries through hashes, roots, refs, counts, and signatures.
- **Permissionless grants** let agents, tools, teams, and partners receive scoped capabilities without publishing ACL bodies, tenant names, prompts, transcripts, or raw memory.
- **Benchmark attestations** let memory systems publish reproducible claims as attestable report hashes, dataset refs, runner refs, package refs, and verifier output.
- **Solana-ready anchors** prepare opaque proof roots for public timestamping and accountability while keeping raw memory off-chain.
- **USDC settlement readiness** frames future payment and usage rails around capability/ref/accounting artifacts, not around selling or exposing private memory.

The creative hook: Enigma makes AI memory feel like a portable asset with receipts. You can carry it, scope it, benchmark it, grant access to it, revoke access from it, and anchor its proof trail without turning your memory into public data.

## Core positioning

> Enigma is the privacy-preserving proof layer for AI memory: portable memory receipts, permissionless capability grants, benchmark attestations, and Solana-ready anchors without raw memory on-chain.

Short form:

> Proof-carrying AI memory. Not raw memory on-chain.

Developer form:

> Generate local proof artifacts for AI memory roots, grants, revocations, benchmark attestations, and verification. Anchor only opaque commitments when public accountability is useful.

Enterprise form:

> Give security, legal, and platform teams offline-verifiable evidence for Enigma-mediated memory boundaries while minimizing plaintext in public artifacts, SIEM evidence, and partner integrations.

Crypto ecosystem form:

> Bring AI memory to public rails safely: roots, nullifiers, scoped capabilities, attestations, and settlement references; never prompts, transcripts, embeddings, ACL bodies, tenant names, or raw memory.

## Marketing goals

### 1. Own a new category: Proof Network for AI memory

Goal: make Enigma associated with proof-carrying memory rather than another vector database, prompt-compression library, or provider-native memory feature.

Actions:

- Use the phrase **Proof Network for AI memory** consistently in launch materials.
- Pair every blockchain message with a privacy boundary: **only roots/refs/counts/signatures; never raw memory**.
- Explain that vector stores, provider memory, logs, KMS, and agent frameworks are components Enigma can wrap, not the category Enigma is trying to replace.
- Lead with receipts and capability artifacts before chain language so the product feels useful locally before any public anchoring.

Success indicators:

- Developers can describe Enigma as a proof layer in one sentence.
- Enterprise readers understand that public artifacts are minimized and verifier-friendly.
- Crypto readers understand the Solana angle without assuming raw-memory publishing or a live token launch.

### 2. Make blockchain-only value concrete

Goal: show what public rails uniquely add without implying live deployment or unsafe data exposure.

Blockchain-only value to emphasize:

- **Public timestamping of opaque roots:** durable ordering for batches of proof receipts.
- **Permissionless discoverability of capability commitments:** ecosystem participants can verify grant/revocation artifacts without joining a private SaaS dashboard.
- **Nullifier-style revocation evidence:** a revocation artifact can prove a capability reference was invalidated without revealing the private policy body.
- **Benchmark reputation:** public roots can bind claims to reproducible benchmark report hashes and runner/package refs.
- **Settlement references:** USDC-compatible accounting can point to capability or usage refs without exposing the private memory event stream.

Actions:

- Use diagrams and demos that show private local memory on the left, public-safe proof artifacts in the middle, and optional Solana/USDC rails on the right.
- Avoid abstract crypto language like "decentralized memory storage" unless immediately clarified as **opaque commitments, not raw memory**.
- Present chain anchoring as optional accountability infrastructure; the CLI commands are local planning commands and set `transaction_submitted:false`.

Success indicators:

- Audience can answer: "Why blockchain at all?" with timestamping, permissionless verification, revocation/nullifier evidence, benchmark reputation, and settlement refs.
- No launch asset suggests Enigma stores plaintext memory, prompts, transcripts, completions, embeddings, ACL bodies, tenant names, private keys, seed phrases, or provider responses on-chain.

### 3. Convert developer curiosity into CLI trials

Goal: make the proof network understandable through local commands and safe JSON artifacts.

Actions:

- Promote a five-command demo arc:
  1. `enigma chain anchor` creates a Solana-ready anchor batch from roots and refs.
  2. `enigma chain grant` creates a scoped capability grant.
  3. `enigma chain revoke` creates a revocation/nullifier artifact.
  4. `enigma chain attest` creates a benchmark attestation from public-safe report and dataset refs.
  5. `enigma chain verify --file <json>` validates the artifacts offline.
- Show example outputs with `transaction_submitted:false` and `raw_memory_on_chain:false` visible.
- Use fake public-safe refs in examples, not real customer names, tenant IDs, prompts, transcripts, memory text, embeddings, API keys, or provider outputs.
- Put "local planning command" language beside every CLI screenshot until a live chain submission flow exists.

Success indicators:

- A developer can produce and verify proof-network JSON artifacts locally.
- The demo teaches the data boundary as clearly as the feature.

### 4. Give enterprises a safe trust story

Goal: make CISOs, platform leaders, and legal teams see the Proof Network as evidence minimization, not data leakage.

Actions:

- Position receipts as a way to prove Enigma-mediated events without exporting raw memory.
- Position grants as scoped, revocable capability evidence rather than public ACL disclosure.
- Position benchmark attestations as reproducibility metadata rather than performance hype.
- Include a "what this does not prove" section in every enterprise-facing proof asset.
- Tie USDC settlement readiness to accounting and partner workflows, not claims of live billing, live token economics, or production settlement.

Success indicators:

- Security reviewers see a clear boundary between private data plane and public proof plane.
- Buyers understand Enigma can produce evidence for Enigma-controlled memory state and boundary operations only.

### 5. Create benchmark credibility without overclaiming

Goal: make benchmark attestations a trust primitive while avoiding unsupported leadership claims.

Actions:

- Frame benchmark attestations as **claim binding**: a report hash plus dataset, runner, package, environment, and verifier refs.
- Avoid "best," "fastest," "most accurate," or ROI language unless backed by documented reproducible results.
- Use comparative demos to show how a benchmark claim can be verified, not to claim market dominance.
- Encourage third-party runners and community benchmark packets that contain public-safe hashes and refs.

Success indicators:

- Benchmark narrative feels credible to technical readers.
- Public artifacts help others reproduce or challenge claims without seeing private memory.

## Audience segments

| Segment | Primary pain | Proof Network message | Best asset |
| --- | --- | --- | --- |
| AI application developers | Need portable memory and trustable local artifacts without building proof infrastructure. | Add proof receipts, grants, revocations, attestations, and verification to AI memory with local CLI commands. | Five-command CLI walkthrough. |
| Agent framework maintainers | Need durable memory semantics beyond runtime state. | Keep orchestration; let Enigma provide proof-carrying memory boundaries and capability artifacts. | Integration diagram and grant/revoke demo. |
| Enterprise platform teams | Need cross-provider memory control and evidence minimization. | Enigma emits public-safe proof artifacts for Enigma-mediated memory events without exposing raw memory. | Security review brief and proof boundary checklist. |
| CISOs / legal / compliance | Need auditability without plaintext sprawl. | Receipts and attestations show what Enigma did, while claim boundaries state what Enigma cannot prove. | Claim-boundary one-pager. |
| Benchmark researchers | Need reproducible claims and artifact integrity. | Attest reports, dataset refs, runner refs, and package refs instead of ungrounded leaderboard copy. | Benchmark attestation packet. |
| Solana builders | Need credible AI use cases that do not leak private data. | Anchor opaque roots, grants, revocations, and attestations; keep memory private and settlement refs public-safe. | Solana proof rail demo. |
| Wallets / identity / payment partners | Need scoped authority and settlement hooks. | Capability grants and USDC-compatible settlement refs can bind permissions and accounting without exposing memory contents. | Partner capability-flow mock. |
| Investors / ecosystem partners | Need a defensible wedge. | Enigma creates the proof and settlement layer around AI memory, not just another storage or chat UI. | Category narrative memo. |

## Taglines

Primary options:

- **Proof-carrying AI memory.**
- **Receipts for AI memory, not raw memory on-chain.**
- **Anchor trust, not transcripts.**
- **Permissionless proof for private AI memory.**
- **Memory you can grant, revoke, attest, and verify.**

Developer options:

- **Hash the boundary. Keep the memory private.**
- **Local proof artifacts for AI memory operations.**
- **Verify the receipt before you trust the memory.**

Enterprise options:

- **Audit memory boundaries without exporting memory.**
- **Public accountability, private data plane.**
- **Evidence for AI memory control, minimized by design.**

Solana ecosystem options:

- **AI memory roots for public rails. No prompts on-chain.**
- **Solana-ready anchors for private memory proofs.**
- **Settlement refs, capability grants, and benchmark attestations for AI memory.**

Avoid:

- "On-chain AI memory."
- "Delete memory from every AI provider."
- "Make models forget."
- "Compliance guaranteed."
- "Live Solana settlement" unless a live submission path has actually shipped and been verified.
- "Live SaaS" unless the live hosted service exists and has current evidence.

## Demo concepts

### Demo 1: Anchor trust, not transcripts

Audience: developers, Solana builders, privacy reviewers.

Story:

1. A local Enigma memory flow produces several proof receipt roots.
2. `enigma chain anchor` builds an anchor batch from public-safe roots and refs.
3. The output visibly includes `raw_memory_on_chain:false` and `transaction_submitted:false`.
4. `enigma chain verify --file anchor.json` validates the artifact.

Message: Enigma can prepare public accountability for memory proof trails without publishing the memory itself.

Do not show: raw memory text, prompts, completions, embeddings, tenant names, or a fake transaction signature.

### Demo 2: Permissionless grant and revocation

Audience: agent framework maintainers, wallet partners, enterprise platform teams.

Story:

1. Create a scoped capability grant for a tool or agent using public-safe capability refs and policy hashes.
2. Verify the grant locally.
3. Create a revocation/nullifier artifact for that grant.
4. Verify that the revocation artifact is structurally valid and linked by reference.

Message: Access can be represented as a portable, revocable proof artifact without exposing the private ACL body.

Do not show: full ACL rules, user identity details, tenant names, secrets, or internal policy text.

### Demo 3: Benchmark claim with receipts

Audience: benchmark researchers, developers, enterprise evaluators.

Story:

1. Produce or reference a public-safe benchmark report hash.
2. Create an attestation with dataset refs, runner refs, package refs, environment refs, and verification refs.
3. Verify the attestation.
4. Compare this to an unsupported marketing claim and show why the attested version is more trustworthy.

Message: Enigma turns benchmark claims into inspectable artifacts without overstating performance.

Do not show: private test data, proprietary provider responses, or unsupported leaderboard claims.

### Demo 4: USDC settlement-ready capability flow

Audience: Solana ecosystem, payment partners, platform teams.

Story:

1. A capability grant includes a settlement ref and usage/accounting ref.
2. A proof packet binds anchor, grant, revocation, and attestation refs.
3. The demo explains how future USDC settlement can reference these public-safe artifacts.
4. The demo explicitly says no payment was submitted unless a real submission path exists.

Message: Enigma can connect AI memory permissions to settlement rails without selling or publishing memory.

Do not show: live payment claims, fake transaction IDs, wallet seed phrases, private keys, or customer billing data.

## Campaign structure

### Phase 1: Category reveal

Theme: **AI memory needs receipts.**

Assets:

- Launch blog: "Proof-carrying AI memory, not raw memory on-chain."
- Architecture graphic: private data plane vs public proof plane.
- Claim-boundary box: what receipts prove and do not prove.
- Short developer clip showing `chain verify` on a local artifact.

Call to action: install Enigma and generate a local proof-network packet.

### Phase 2: Developer activation

Theme: **Five local commands, one proof story.**

Assets:

- CLI walkthrough.
- Public-safe example artifacts.
- Integration snippet for agents/frameworks.
- Troubleshooting notes around rejected private payload keys/values.

Call to action: create anchor, grant, revoke, attest, and verify artifacts locally.

### Phase 3: Ecosystem credibility

Theme: **Public accountability for private memory systems.**

Assets:

- Solana-ready anchor explainer.
- Benchmark attestation packet.
- Partner capability-grant concept.
- USDC settlement-readiness diagram with no live-settlement claim.

Call to action: partner on grants, benchmark attestations, and proof-root anchoring.

### Phase 4: Enterprise trust

Theme: **Evidence without plaintext sprawl.**

Assets:

- Security review brief.
- Claim boundary matrix.
- Buyer checklist.
- Private data plane / public proof plane FAQ.

Call to action: evaluate Enigma as the proof/evidence layer for controlled AI memory.

## Message pillars

### Pillar 1: Privacy-preserving proof receipts

Say:

- Enigma creates receipts for Enigma-mediated memory boundaries.
- Public artifacts should contain hashes, roots, refs, counts, and signatures.
- Receipts are designed for offline verification without trusting a live dashboard.

Do not say:

- Enigma proves every downstream provider deleted data.
- Enigma proves model weights forgot.
- Enigma proves the semantic truth of a memory statement.

### Pillar 2: Permissionless grants and revocations

Say:

- Capability grants can be scoped, referenced, verified, and revoked.
- Revocations can use nullifier-style artifacts to avoid exposing private grant details.
- Grants are useful for agents, tools, partners, wallets, and enterprise gateways.

Do not say:

- Public grants reveal full ACLs.
- A grant proves real-world identity unless backed by a specific identity system.
- Revocation deletes all historical copies outside Enigma-controlled systems.

### Pillar 3: Benchmark attestations

Say:

- Attestations bind benchmark claims to report hashes and public-safe refs.
- The value is reproducibility, integrity, and accountable comparison.
- Benchmark artifacts should invite verification and challenge.

Do not say:

- Enigma is the fastest or best unless a reproducible benchmark supports it.
- Benchmark attestations prove private dataset contents.
- A single report proves universal performance.

### Pillar 4: Solana-ready anchoring and USDC settlement readiness

Say:

- Anchors are Solana-ready opaque proof batches.
- USDC settlement can reference capability/accounting artifacts in future payment workflows.
- The proof plane can be public while the memory data plane stays private.

Do not say:

- Transactions were submitted if the command only produced a local planning artifact.
- Enigma runs live settlement unless that production path exists.
- Raw memory, prompts, transcripts, completions, embeddings, ACL bodies, tenant names, private keys, seed phrases, or provider responses belong on-chain.

## Claims boundary matrix

| Claim area | Approved wording | Boundary |
| --- | --- | --- |
| Proof receipts | Enigma can produce public-safe proof receipts for Enigma-mediated memory boundaries. | Does not prove provider-internal deletion, hidden logs, backups, screenshots, exports, or model forgetting. |
| Chain anchoring | Enigma can prepare Solana-ready anchor batches containing opaque roots and refs. | Local planning artifacts are not submitted transactions; do not imply live chain deployment. |
| Raw memory privacy | Enigma's proof-network artifacts are designed to exclude raw memory and private payloads. | Do not claim zero metadata risk; roots, timestamps, refs, and sizes can still require privacy review. |
| Capability grants | Enigma can create scoped grant artifacts and revocation/nullifier artifacts. | A grant is not a public ACL dump and does not prove real-world identity by itself. |
| Benchmark attestations | Enigma can bind benchmark reports to hashes, dataset refs, runner refs, package refs, and verifier refs. | Does not prove superiority without documented benchmark results. |
| USDC settlement | Enigma's proof artifacts can be designed to support USDC-compatible settlement references. | Do not claim live payments, token economics, revenue share, or settlement finality unless implemented and verified. |
| Deletion | Enigma receipts can describe Enigma-controlled tombstone/delete-request or active-serving boundary behavior when instrumented. | No claim that external providers, backups, model weights, human copies, or exported files were deleted. |
| SaaS | Enigma can be positioned as local-first and customer-controlled; hosted or BYOC modes require their own evidence. | Do not claim a live SaaS, uptime, production customers, or managed cloud operations without verified artifacts. |

## Creative directions

### Visual system: private core, public proof ring

Use a split-plane visual:

- Inner/private: vault, memory passport, context packs, local verifier.
- Middle/proof: receipt roots, capability refs, revocation nullifiers, attestation hashes.
- Outer/public: Solana-ready anchor batch, partner verifier, USDC settlement ref.

Make the privacy boundary visually obvious. The public layer should look like commitments and receipts, not documents full of text.

### Product metaphor: memory passport with stamps

A Memory Passport is private and portable. Proof Network artifacts are the stamps: scoped, verifiable, and safe to show. The stamp proves a boundary event happened in Enigma's system; it does not reveal the private trip diary.

### Launch contrast

Use a simple contrast:

- Old AI memory: trapped in provider settings, hard to audit, copied into prompts, unclear deletion boundaries.
- Enigma Proof Network: local custody, scoped grants, minimized proof artifacts, optional public anchoring, offline verification.

## Content checklist for every launch asset

Every public proof-network asset should include:

- One sentence explaining the private data plane vs public proof plane.
- A visible statement that raw memory is not put on-chain.
- The local/planning status of CLI-generated artifacts when no transaction is submitted.
- At least one concrete artifact type: anchor batch, capability grant, revocation, benchmark attestation, or proof packet.
- A claim-boundary note covering provider deletion, model forgetting, live SaaS, and live blockchain/settlement status.

Every public proof-network asset should avoid:

- Real private memory, prompts, transcripts, completions, embeddings, ACL bodies, tenant names, private keys, API keys, seed phrases, or provider responses.
- Fake live transaction IDs, fake customer names, fake production dashboards, or fake benchmark leadership.
- Broad compliance guarantees or deletion guarantees.
- Language that implies Enigma stores public plaintext AI memory.

## Launch-ready one-liners

- Enigma turns AI memory operations into receipts that can be checked without exposing the memory.
- The Proof Network anchors commitments, not conversations.
- Permissionless grants let agents and partners verify capability boundaries without reading private ACLs.
- Benchmark attestations make AI memory claims reproducible without publishing private data.
- USDC settlement belongs on public rails; raw memory does not.
- The strongest claim is the narrow one: Enigma supports verifiable evidence for Enigma-mediated memory boundaries, locally and with public-safe artifacts.

## Sales and partner questions to answer

1. What exact artifact is being generated: anchor batch, grant, revocation, attestation, or packet?
2. What fields are public-safe roots, refs, counts, or signatures?
3. What private material is deliberately excluded?
4. Is the artifact local-only, Solana-ready, or actually submitted?
5. What can a verifier check offline?
6. What does the artifact not prove?
7. How would a partner reference the artifact from a wallet, agent framework, benchmark packet, or settlement flow?

## Recommended launch headline

**Enigma Proof Network: proof-carrying AI memory without raw memory on-chain.**

Supporting copy:

Enigma creates privacy-preserving proof artifacts for AI memory: receipt roots, scoped capability grants, revocations, benchmark attestations, and Solana-ready anchor batches. Launch materials should show developers how to generate and verify artifacts locally; public rails can anchor commitments and settlement references without exposing prompts, transcripts, embeddings, ACL bodies, tenant names, or raw memory.
