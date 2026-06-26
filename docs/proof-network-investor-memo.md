# Proof Network investor memo

**Audience:** internal strategy, product, and investor diligence.
**Status:** planning memo, not an offering document.
**Boundary:** no valuation target, fundraising forecast, token economics promise, or guarantee of market outcome.

## Purpose

This memo frames Enigma's Proof Network as the next defensible layer above portable AI memory. It is written for internal strategy, investor diligence, and product sequencing. It is not a financing forecast, valuation argument, token plan, or promise of on-chain revenue.

The core claim is narrow: if AI memory becomes a durable asset, buyers will need a way to prove custody, permissioning, revocation, benchmark performance, and lifecycle state without exposing raw memory. Enigma can own that proof layer while keeping memory private, provider-neutral, and portable.

## Category thesis

AI memory is moving from a convenience feature to an infrastructure category.

Current AI products increasingly remember user preferences, work history, company context, codebase facts, customer interactions, and operating procedures. That memory improves model usefulness, but it also creates a new control problem:

- users cannot easily take memory across providers,
- enterprises cannot audit what was remembered or served,
- developers cannot prove memory behavior to customers,
- benchmarks are hard to trust across tools,
- vendors have incentives to trap memory inside their own stack.

The long-term category is not simply "memory search" or "vector storage." It is **verifiable AI memory infrastructure**: a custody, permission, audit, and settlement plane for durable AI context.

Enigma's local vault, receipts, capsules, MCP connectors, hosted relay, and enterprise gateway address the memory plane. The Proof Network adds the public-safe proof plane:

- anchor batches for memory-state roots and evidence references,
- scoped capability grants for controlled access,
- revocations/nullifiers for invalidating grants without revealing private ACLs,
- benchmark attestations for reproducible public claims,
- packets that bundle public-safe proofs for offline or third-party verification.

The key design principle is privacy before publicity. The network should publish hashes, roots, references, counts, timestamps, signatures, and opaque identifiers. It should not publish prompts, transcripts, completions, embeddings, raw memory, tenant names, ACL bodies, private keys, API keys, provider responses, or other private data.

## SanDisk analogy

SanDisk did not win by owning every camera, laptop, phone, or media workflow. It won by making storage portable, standard, trusted, and easy to buy.

The Enigma analogy is direct but not superficial:

- SanDisk made user data physically portable; Enigma makes AI memory logically portable.
- SanDisk relied on standards and form factors; Enigma needs open receipt, capsule, proof, and verifier formats.
- SanDisk sold trust in storage integrity; Enigma sells trust in memory custody and proof integrity.
- SanDisk benefited from every device category that created more data; Enigma benefits from every AI surface that creates more useful memory.

The Proof Network is the equivalent of adding a public integrity layer to the memory card. It does not put the files on a public ledger. It proves that a specific private vault state, capability grant, revocation, or benchmark evidence existed in a specific public-safe form at a specific time.

The category line should remain sober:

> Enigma is the portable memory and proof layer for AI.

Avoid overclaiming that Enigma can force third-party model providers to forget data, inspect closed model internals, or prove private provider behavior. Enigma can prove Enigma-controlled memory state, Enigma-issued capabilities, Enigma-managed revocations, and published benchmark evidence.

## Market wedge

The initial wedge is developers and technical teams that already feel the pain of fragmented AI memory.

They want agents and copilots to remember context across tools, but they cannot ship enterprise workflows on opaque memory systems. They need memory that is local-first, inspectable, exportable, permissioned, and verifiable. They also need proof artifacts that can be shared with customers, auditors, security teams, and ecosystem partners without disclosing the underlying memory.

The wedge has four entry points:

1. **Developer adoption** — CLI, SDK, MCP, and local verifier make Enigma easy to add to an agent or coding workflow.
2. **Benchmark credibility** — memory benchmarks produce attestations tied to report hashes, dataset references, runner references, and package references.
3. **Enterprise trust** — capability grants and revocations provide an auditable permission model for memory access.
4. **Ecosystem compatibility** — proof packets let external vendors verify public-safe evidence without becoming Enigma customers first.

This is a narrower and more credible path than trying to sell a complete enterprise platform on day one. The network starts as a verification standard and local artifact format. Solana-ready anchoring is a settlement rail, not a dependency for product usefulness.

## Product layers

### 1. Local memory vault

The vault remains the source of truth for user-owned memory. It should store signed memory events, derived indexes, deletion tombstones, receipt chains, and exportable capsules. The Proof Network does not replace the vault; it commits to public-safe summaries of vault state.

Strategic requirement: raw memory and private context stay off public proof artifacts.

### 2. Receipt and verifier layer

Receipts make memory operations inspectable. The verifier makes them useful without server trust. This layer should remain open and boring: deterministic JSON, stable schemas, canonical hashing, signature fields, clear error messages, and no network dependency for validation.

Strategic requirement: verification must work offline and be easy to embed in tests, CI, procurement reviews, and support packets.

### 3. Proof Network artifacts

The 0.1.16 proof-network surface should focus on pure, local artifacts:

- `enigma.proof_network.anchor_batch.v1`
- `enigma.proof_network.capability_grant.v1`
- `enigma.proof_network.capability_revocation.v1`
- `enigma.proof_network.benchmark_attestation.v1`
- `enigma.proof_network.packet.v1`

These artifacts should be strict about public-safe payloads. They should reject private field names and secret-looking values before any artifact is emitted.

Strategic requirement: the first version should be useful even if no transaction is ever submitted.

### 4. CLI planning commands

The `enigma chain` commands should be framed as local planning and verification tools:

- `enigma chain anchor` creates Solana-ready opaque anchor batches from roots and references.
- `enigma chain grant` creates scoped capability grants.
- `enigma chain revoke` creates revocation/nullifier artifacts.
- `enigma chain attest` creates benchmark attestations.
- `enigma chain verify --file <json>` validates supported proof artifacts.

Every output should clearly state `transaction_submitted:false` and `raw_memory_on_chain:false`.

Strategic requirement: the CLI should teach the market that Enigma's network model is privacy-preserving by default.

### 5. Solana-ready anchoring

Solana is best positioned as an anchoring and timestamping rail for compact public commitments, not as a storage layer for AI memory.

Useful on-chain payloads are opaque commitments:

- Merkle roots,
- proof packet hashes,
- schema identifiers,
- verifier versions,
- aggregate counts,
- public refs,
- signatures or signature references.

Not useful on-chain payloads: raw memories, prompts, transcripts, embeddings, tenant names, customer names, ACL bodies, or provider responses.

Strategic requirement: the product should remain chain-optional at first, but chain-ready in artifact design.

### 6. Benchmark attestation layer

Benchmarks are a credible early network use case because they are public by nature but still need discipline. Enigma can attest to a report hash, dataset reference, runner reference, package reference, metric summary, and environment reference without embedding proprietary responses or private datasets.

Strategic requirement: benchmark attestations should make Enigma's claims easier to reproduce and harder to exaggerate.

### 7. Enterprise policy and capability layer

Capability grants and revocations are the bridge from developer utility to enterprise governance. They let Enigma express who or what may access a scoped memory set, for what purpose, under what expiry, and under which policy reference.

The artifact should not contain the private ACL body. It should contain public-safe scope references, hashes, expirations, audience references, signer identity references, and revocation/nullifier references.

Strategic requirement: enterprises should be able to audit permission state without leaking the contents of the permission set.

## Moats

### Protocol moat

If Enigma's proof artifact formats become the default way to represent AI memory custody and permission evidence, the format itself becomes a control point. This is stronger than a feature moat because vendors can adopt it without replacing their products.

### Trust moat

A privacy-preserving proof network only works if the market believes the implementation will not accidentally disclose private data. Strict redaction, private-key hygiene, public-safe examples, and conservative claims are product features, not legal cleanup.

### Distribution moat

MCP, CLI, SDKs, browser extension, desktop app, and enterprise gateway give Enigma multiple insertion points. The Proof Network compounds distribution because every integration can emit verifiable artifacts.

### Data-model moat

The receipt graph, capsule format, capability model, revocation model, and benchmark attestation model can become difficult to replicate once external tools and procurement workflows depend on them.

### Ecosystem moat

Third-party developers can build importers, verifiers, benchmark reports, dashboards, enterprise policy packs, and certification tooling around proof packets. The more external proof consumers exist, the more valuable Enigma-compatible artifacts become.

### Chain-positioning moat

Solana-ready anchoring gives Enigma a public settlement story without forcing the product into token speculation or public data leakage. The moat is not "AI memory on-chain." The moat is private AI memory with public commitments that can be independently checked.

## Business model

The business model should monetize convenience, governance, verification at scale, and enterprise control while keeping core verification open enough to become a standard.

### Free / open

- local vault,
- basic CLI,
- local verifier,
- public schemas,
- basic proof packet creation,
- sample benchmark attestations,
- MCP starter integration.

### Developer

- SDK support,
- hosted verification API quotas,
- team proof packet management,
- CI benchmark attestation workflows,
- integration keys,
- support for app vendors adopting Enigma proof formats.

### Pro / power user

- desktop receipt explorer,
- encrypted sync,
- multi-device proof history,
- browser extension premium flows,
- capsule export management,
- advanced import and migration tooling.

### Enterprise

- gateway deployment,
- SSO/SCIM,
- KMS/BYOK,
- policy administration,
- legal hold and eDiscovery workflows,
- SIEM exports,
- private hosted verifier,
- procurement and compliance evidence packs,
- support and SLA.

### Ecosystem

- certification for Enigma-compatible memory tools,
- vendor conformance tests,
- partner marketplace for connectors/importers,
- managed proof anchoring,
- benchmark registry participation.

The business model should not depend on speculative transaction volume. Anchoring can become a paid convenience and compliance feature, but the initial product should create value before chain submission exists.

## Proof points to build

The investor story becomes credible when Enigma can show proof artifacts moving through real workflows.

Near-term proof points:

1. **Local proof artifacts** — pure functions create and validate anchor batches, grants, revocations, attestations, and packets with secret rejection.
2. **CLI proof flow** — a user can create a local anchor plan, grant, revocation, benchmark attestation, and verification result with no network calls.
3. **Benchmark attestation demo** — a public benchmark report hash is bound to dataset, runner, and package references.
4. **Offline verifier** — an artifact can be validated on another machine without Enigma servers.
5. **Privacy failure tests** — examples containing raw prompts, transcripts, private keys, API keys, tenant names, or provider responses are rejected.
6. **Public-safe docs** — every docs example uses hashes, roots, refs, counts, and signatures only.
7. **Solana-ready payload shape** — anchor batches are compact enough and opaque enough to be submitted later without redesign.
8. **Enterprise story** — capability grants and revocations map cleanly to policy, expiry, audience, and audit requirements.

Later proof points:

- external developer validates a proof packet without Enigma support,
- benchmark partner publishes an Enigma attestation,
- enterprise pilot uses grants and revocations in a policy review,
- hosted verifier validates public packets at scale,
- Solana anchor transaction is submitted for a public demo after privacy review.

## Risks and mitigations

### Privacy leakage

Risk: proof artifacts accidentally include sensitive memory, prompts, transcripts, embeddings, tenant names, or secrets.

Mitigation: strict schema design, denylisted private keys and values, public-safe examples only, regression tests for secret rejection, and conservative docs. Treat privacy failure as a product blocker.

### Overclaiming chain value

Risk: the market interprets Proof Network as "put AI memory on-chain" or as a token narrative.

Mitigation: repeat that Solana is an optional anchoring rail for opaque commitments. Avoid token language. State that `transaction_submitted:false` is expected for local planning artifacts.

### Weak developer adoption

Risk: the artifact model is correct but too abstract for developers.

Mitigation: provide CLI commands, copyable JSON examples, SDK helpers, and benchmark workflows that solve immediate problems before requiring ecosystem buy-in.

### Enterprise skepticism

Risk: enterprises view proofs as another compliance artifact without operational value.

Mitigation: tie grants, revocations, and packets to concrete workflows: policy approvals, support disputes, audit evidence, procurement reviews, and incident response.

### Benchmark credibility

Risk: benchmark attestations are seen as self-serving marketing.

Mitigation: bind attestations to public report hashes, dataset references, runner references, package references, and reproducibility instructions. Do not embed private provider responses or unverifiable claims.

### Protocol fragmentation

Risk: many AI memory vendors create incompatible receipt and proof formats.

Mitigation: keep schemas public, verifier simple, examples clear, and integrations easy. Focus on becoming the neutral format rather than a closed feature.

### Product sequencing

Risk: building network abstractions too early distracts from memory product usefulness.

Mitigation: keep 0.1.16 proof work pure, local, and directly tied to CLI/docs/tests. Do not build live infrastructure until artifact quality, privacy boundaries, and developer workflows are proven.

## Claim boundaries

Enigma should be explicit about what the Proof Network can and cannot prove.

It can prove:

- an Enigma proof artifact validates against a known schema,
- a public-safe hash/root/ref was produced,
- a capability grant or revocation was signed by a declared signer reference,
- a benchmark attestation commits to a report hash and public references,
- a packet contains supported proof-network artifacts,
- a Solana-ready anchor payload could be submitted later.

It cannot prove by itself:

- a closed provider deleted private data,
- model weights forgot a memory,
- a third-party system never saw or retained data,
- a private dataset's contents from only its public hash,
- business value or benchmark superiority beyond the measured evidence,
- that a local planning artifact was actually submitted on-chain.

This boundary makes the investor story stronger, not weaker. The market is crowded with exaggerated AI infrastructure claims. A precise proof boundary is a trust asset.

## Next milestones

### 0.1.16 release milestone

- Publish proof-network pure functions and schemas.
- Add local `enigma chain` planning and verification commands.
- Add privacy rejection tests for secret/private payloads.
- Add public-safe documentation and examples.
- Add benchmark attestation workflow documentation.
- Add claim-boundary language across investor, technical, and marketing docs.

### Developer adoption milestone

- Show a complete local flow: create memory-state root reference, anchor batch, grant, revocation, benchmark attestation, packet, and offline verification result.
- Make examples copyable without private material.
- Provide a small verifier path that external projects can run in CI.

### Benchmark credibility milestone

- Publish a reproducible benchmark report with an Enigma benchmark attestation.
- Tie the attestation to package, runner, dataset, and environment references.
- Document which claims are measured and which are not.

### Enterprise readiness milestone

- Map capability grants and revocations to gateway policy concepts.
- Produce a sample enterprise proof packet for a policy review using only public-safe refs.
- Define SIEM/export shape without raw memory.

### Ecosystem milestone

- Define conformance checks for Enigma-compatible proof packets.
- Create a partner-facing verifier story.
- Identify two or three external tools where proof packets would reduce trust friction.

### Chain demonstration milestone

- After local artifacts and privacy tests are stable, submit a public demo anchor containing only opaque roots/refs/counts.
- Publish the transaction reference alongside the packet hash and verifier instructions.
- Keep the demo scoped to anchoring, not memory storage or token mechanics.

## Strategic conclusion

The Proof Network should be positioned as a sober infrastructure layer: public verification for private AI memory. Its value is not that it puts memory on-chain. Its value is that it lets users, developers, enterprises, benchmarks, and vendors prove memory-related facts without exposing the memory itself.

That is the SanDisk move extended for AI: make memory portable, make custody trustworthy, and make integrity independently verifiable.