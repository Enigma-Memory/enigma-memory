# Memory Drive strategy

## One-line thesis

Enigma should be the **private Memory Drive and controller layer for AI**: a local- or customer-controlled system that keeps canonical AI memory outside model providers, exposes it through connectors, governs access through an enterprise control plane, and emits public-safe proof artifacts for memory operations.

This is the SSD/controller Memory Drive strategy. Applications do not talk directly to fragile flash cells; they trust a controller that handles mapping, integrity, lifecycle, interfaces, diagnostics, and safe erasure inside a bounded device. AI applications need the same separation for memory. Public artifacts stay limited to hashes/roots/refs/counts/signatures only, plus schema and timestamp metadata where required by the verifier. Solana remains an optional proof/permission/settlement rail for opaque commitments, not the private data plane.

Enigma's product line should make that separation concrete:

- **Local Memory Drive** — the private canonical memory store, local-first by default.
- **Connector OS** — the interface layer that lets AI clients, agents, IDEs, browsers, apps, and importers request memory under explicit policy.
- **Enterprise Control Plane** — the admin, governance, evidence, and boundary layer for teams and regulated environments.
- **Benchmark Attestation Network** — the public-safe benchmark layer that binds benchmark claims to report hashes, dataset refs, runner refs, package refs, and review metadata.
- **Optional Solana Proof Rail** — a public proof, permission, timestamp, and settlement rail for opaque roots and refs when an operator needs external anchoring.

The controller is the category. Search, vector storage, summaries, connectors, receipts, and chain anchors are capabilities inside that controller.

## Why the SSD/controller analogy works

AI memory is becoming a durable asset: preferences, project state, institutional context, workflow decisions, permission boundaries, and evidence of what context was used. Without a controller, memory fragments across model features, chat histories, vector stores, IDE agents, browser sessions, enterprise logs, and agent scratchpads.

The SSD analogy gives Enigma a precise operating model:

| SSD/controller responsibility | Memory Drive responsibility |
| --- | --- |
| Logical block address mapping | Stable memory refs, namespaces, capability scopes, and derived artifact refs. |
| Wear leveling | Memory freshness, compaction, duplicate reduction, retention policy, and index health. |
| Bad-block handling | Tombstones, stale artifact quarantine, leakage detection, and connector error isolation. |
| Firmware interface | CLI, SDK, MCP, desktop, browser, gateway, and verifier interfaces. |
| SMART diagnostics | Memory Drive health reports, benchmark summaries, connector health, and proof coverage. |
| Secure erase commands | Enigma-controlled removal or revocation artifacts inside Enigma's boundary. |
| Controller-managed integrity | Hashes, Merkle roots, signatures, schema validation, and offline verification. |

The analogy should stay operational. It explains why the controller matters without implying hardware exclusivity, provider control, third-party lifecycle control, model-state control, chain settlement by default, regulatory status, or business-outcome promises.

## Product architecture

```text
AI clients / agents / IDEs / browsers / enterprise apps
                    |
              Connector OS
                    |
        policy, scopes, grants, receipts
                    |
            Local Memory Drive
                    |
      indexes, summaries, roots, health
                    |
 Enterprise Control Plane / Verifier / Benchmark Attestation
                    |
       optional Solana Proof Rail for opaque public-safe roots
```

The private data plane and public proof plane must remain separate:

- **Private data plane:** private memory content, AI interaction bodies, vector payloads, connector bodies, ACL bodies, customer identifiers, private policies, and provider bodies stay local, customer-controlled, or inside an explicitly governed managed boundary.
- **Public proof plane:** artifacts contain hashes, Merkle roots, opaque refs, counts, timestamps, schema refs, signer refs, signatures, nullifiers, dataset refs, runner refs, package refs, and explicit non-submission flags.

This separation is the strategic moat. It lets Enigma be useful across AI products without becoming another place that leaks or centralizes private memory.

## Pillar 1: Local Memory Drive

The Local Memory Drive is the default product center. It is the place where the user or customer can say: "This is my AI memory boundary."

### Jobs to be done

1. **Canonical custody** — keep the authoritative memory state outside model-provider memory silos.
2. **Retrieval utility** — expose relevant context to authorized clients without making every client maintain its own memory stack.
3. **Lifecycle control** — record creates, imports, updates, compaction, tombstones, exports, and Enigma-controlled removal or revocation operations.
4. **Derived artifact hygiene** — treat summaries, vectors, indexes, packs, and benchmark reports as derived artifacts tied to dependency roots.
5. **Proof readiness** — generate public-safe roots, receipts, hashes, and verifier bundles without exposing payloads.
6. **Health visibility** — surface SMART-style memory-drive health: freshness, duplicate rate, tombstone risk, stale derived artifacts, retrieval hit rate, leakage scan, receipt coverage, connector health, and sync fork risk.

### Core product surfaces

- **Vault view:** namespaces, refs, health status, receipt coverage, connector status, and export readiness.
- **Memory inspector:** payload-visible only to the owner or authorized local/admin context; public examples use opaque refs.
- **Receipt explorer:** proof packet, root, hash, signature, schema, and signer metadata.
- **Repair actions:** rebuild index, compact duplicates, refresh summaries, quarantine stale derived artifacts, reconcile connector cursors, and regenerate proof packets.
- **Import/export:** portable Memory Passport or capsule workflows that preserve lineage without publishing private contents.

### Strategic outcome

The Local Memory Drive makes Enigma useful before any model provider adopts a standard. A user can bring memory across clients. A developer can rely on one memory substrate. An enterprise can keep memory policy outside a model provider's product boundary.

## Pillar 2: Connector OS

Connector OS is the interface and permissions layer. It turns the Memory Drive from a private vault into an interoperable operating surface for AI clients.

### What it connects

- MCP clients and agent harnesses;
- IDE agents and coding tools;
- browser extension workflows for web AI tools;
- desktop app workflows;
- importers for chat exports, documents, tickets, CRM records, and local knowledge bases;
- SDK integrations for product teams;
- enterprise gateway integrations for policy-enforced provider access.

### Design principles

- **Explicit capability scopes:** every connector request should carry an opaque subject ref, resource ref, purpose, scope, expiry, and signer or device ref where applicable.
- **Least context by default:** a connector receives only the memory refs authorized for the request, not a broad dump of the Memory Drive.
- **Receipts at boundaries:** imports, exports, injections, revocations, tombstones, and benchmark runs should be able to emit public-safe evidence.
- **No provider lock-in:** the same Memory Drive should serve multiple AI clients without treating any provider as the source of truth.
- **Connector failure isolation:** a broken connector cannot corrupt canonical memory or publish private data into artifacts.

### Product packaging

Connector OS should ship as a small ladder:

1. **Local CLI and MCP server** for developers and early technical users.
2. **Desktop connector manager** for normal users: connect, approve, pause, revoke, inspect.
3. **Browser connector** for web AI products when official integration is not available.
4. **SDK connectors** for product teams that want Enigma memory inside their own applications.
5. **Enterprise gateway connectors** for provider-boundary policy, SIEM, KMS/BYOK, legal hold, and admin evidence.

### Strategic outcome

Connector OS is the distribution layer. Enigma does not need to own every model or app; it needs to become the memory interface those products can trust.

## Pillar 3: Enterprise Control Plane

The Enterprise Control Plane turns the Memory Drive into an accountable operational system for organizations. Its job is not to make broad regulatory claims; its job is to give administrators policy, evidence, and review surfaces inside clearly stated boundaries.

### Enterprise buyer needs

- customer-owned memory boundary;
- provider/model allowlists and deny rules;
- SSO/SCIM and admin role management where deployed;
- KMS/BYOK evidence for supported environments;
- residency and retention policy configuration;
- legal hold and export workflows;
- SIEM-friendly minimized events;
- offline verifier packages for internal review;
- incident and support workflows for memory-boundary events.

### Control-plane objects

| Object | Purpose | Public-safe evidence |
| --- | --- | --- |
| Capability grant | Authorizes a scoped request. | grant ref, resource ref, subject ref, purpose ref, expiry, signer ref, signature. |
| Capability revocation | Ends or narrows a grant inside Enigma-controlled boundaries. | revocation ref, nullifier ref, prior grant ref, timestamp, signer ref, signature. |
| Policy decision | Records an allow, deny, redact, or require-review decision. | policy ref, decision ref, counts, reason code ref, signer/service ref. |
| Memory operation receipt | Binds an operation to a root or dependency set. | operation ref, prior root, new root, count, schema ref, signature. |
| Health snapshot | Reports drive status without content. | health report hash, metric refs, counts, thresholds refs, signer ref. |
| Export packet | Packages memory or proof artifacts for an authorized handoff. | package ref, root, count, schema refs, signer ref, explicit payload boundary. |

### Admin experience

The control plane should feel less like analytics and more like a security operations console for memory:

- show which connectors can access which namespaces;
- show stale roots, unreviewed exports, failing connectors, and risky derived artifacts;
- allow admins to pause a connector without removing canonical memory;
- show proof packet verification status;
- separate local/package evidence from managed-service or deployed evidence;
- make every public claim traceable to an artifact ref.

### Strategic outcome

The enterprise wedge is control before context leaves the boundary. Enigma becomes the memory governance layer organizations can inspect, not a promise that closed providers, models, caches, logs, or backups behaved in a way Enigma cannot observe.

## Pillar 4: Benchmark Attestation Network

Benchmarks are a category-building tool only if they are reproducible, bounded, and public-safe. The Benchmark Attestation Network should make memory assessment inspectable without leaking private datasets or overstating one report.

### What it attests

A benchmark attestation should bind:

- benchmark report hash;
- dataset ref or fixture ref;
- runner ref and runner version;
- package ref and package version;
- metric refs;
- configuration refs such as top-k, namespace count, or evidence mode;
- hardware/runtime context when recorded;
- reviewer ref or review status;
- signature and schema refs.

### What it does not publish

Public benchmark artifacts must not publish private memory content, AI interaction bodies, vector payloads, provider bodies, customer identifiers, private dataset bodies, customer records, credentials, or unredacted benchmark question/answer bodies unless a separate publication review explicitly approves those materials.

### Strategic uses

- **Developer trust:** prove a benchmark claim maps to an exact report and package boundary.
- **Partner certification:** let connectors and integrations show compatibility with a public-safe attestation packet.
- **Enterprise review:** give procurement and security teams a reproducible evidence package without handing them private memory.
- **Protocol adoption:** make the attestation format usable by other memory tools so Enigma can become the neutral verifier standard.

### Strategic outcome

The Benchmark Attestation Network turns assessment into infrastructure. It should not claim universal superiority from one local fixture. It should make evidence portable, inspectable, and hard to exaggerate.

## Pillar 5: Optional Solana Proof Rail

Solana is an optional public rail for proof, permission, timestamp, and settlement workflows. It is not the Memory Drive, not the private data plane, and not required for local usefulness.

### Appropriate Solana roles

- commit opaque roots or anchor batch refs;
- timestamp public-safe proof packets when an operator submits a real transaction;
- coordinate permission or revocation commitments through refs and nullifiers;
- support tokenless settlement or metering references where separately designed and approved;
- give verifiers an external checkpoint for a root that already passed local validation.

### Required boundary language

- Local commands may prepare Solana-ready artifacts without submitting transactions.
- A document may say "prepared for operator submission" only when the artifact explicitly indicates non-submission.
- "Anchored on Solana" requires transaction signature, cluster, slot or block metadata, timestamp, and approved explorer or RPC evidence.
- Private memory content, AI interaction bodies, vector payloads, ACL bodies, customer identifiers, provider bodies, and private payloads do not go on-chain.
- A chain root does not prove the underlying memory is truthful, complete, lawful, externally removed, or absent from a model.

### Strategic outcome

The Solana rail gives Enigma a credible public verification option without making blockchain participation mandatory. The default product remains useful offline and locally; the rail becomes valuable when public timestamping, permission coordination, ecosystem settlement, or third-party verification is needed.

## Product ladder

### Individual / local

- local Memory Drive;
- CLI and MCP connector;
- import/export tools;
- proof packet generator;
- local verifier;
- memory health report.

### Pro / power user

- desktop connector manager;
- browser connector;
- multi-device encrypted sync where supported;
- receipt explorer;
- advanced importers;
- visual repair workflows for stale indexes, duplicates, tombstones, and connector drift.

### Developer

- SDK;
- connector templates;
- Memory Passport or capsule schemas;
- conformance suite;
- benchmark runner;
- verifier libraries;
- proof packet publishing workflow.

### Enterprise

- admin control plane;
- gateway deployment pattern;
- SSO/SCIM where implemented;
- KMS/BYOK evidence where implemented;
- SIEM and eDiscovery exports with minimized fields;
- policy decision receipts;
- legal hold workflows;
- offline evidence packets;
- support and incident process.

### Ecosystem

- compatibility marks for validated connectors;
- public-safe benchmark attestations;
- optional anchor batches;
- partner verifier tooling;
- protocol docs for grants, revocations, passports, health reports, and proof packets.

## 30 / 60 / 90 roadmap

### First 30 days: make the controller visible

Goal: make the Memory Drive feel like a real product surface, not a collection of scripts.

Ship or tighten:

- a canonical Local Memory Drive vocabulary: namespace, memory ref, derived artifact, root, receipt, connector, capability, health snapshot, proof packet;
- CLI flows for create/import/search/export/verify that consistently emit public-safe refs and roots;
- MCP quickstart that shows authorized retrieval without publishing private payloads;
- memory health report surfaced in docs and CLI output;
- proof packet examples that include only hashes, roots, refs, counts, schemas, and signatures;
- claim-boundary language copied into launch, demo, and sales material;
- a demo script showing one private memory moving through connector approval, receipt generation, benchmark attestation, and optional anchor preparation.

Evidence to retain:

- sample proof packet hash;
- sample health report hash;
- sample benchmark attestation hash;
- public-safe CLI output;
- verifier output showing pass/fail reasons;
- explicit note when no chain transaction was submitted.

### First 60 days: make connectors and enterprise control credible

Goal: prove Enigma can sit between real AI clients and customer-controlled memory.

Ship or tighten:

- connector permission model with scoped grants, expiries, revocations, nullifier refs, and receipt lineage;
- desktop or admin connector manager prototype;
- enterprise gateway design packet with policy decisions, SIEM-minimized event shapes, KMS/BYOK evidence boundaries, and offline verifier package;
- conformance checks for connectors that reject private payload fields in public artifacts;
- benchmark attestation flow tied to package refs and runner refs;
- Memory Passport or capsule interoperability examples;
- docs that separate local/package evidence from managed-service or deployed evidence.

Evidence to retain:

- connector grant and revocation proof packets;
- policy decision receipt examples;
- conformance report refs;
- benchmark report hash and attestation packet;
- gateway evidence packet with placeholder-safe refs only;
- operator checklist for what claims are allowed from each artifact.

### First 90 days: make the network strategy repeatable

Goal: turn the product into an ecosystem surface that developers, enterprises, and verifiers can repeatedly use.

Ship or tighten:

- public conformance suite for Memory Drive compatible connectors;
- verifier-first docs for proof packets, health reports, benchmark attestations, and optional anchor batches;
- partner connector templates with capability scopes and evidence rules;
- enterprise review packet that an external security or procurement team can inspect offline;
- optional Solana anchor workflow that clearly distinguishes prepared payloads from submitted transactions;
- benchmark attestation registry design using report refs, dataset refs, runner refs, package refs, and review metadata;
- launch narrative that positions Enigma as private AI memory controller, not a model provider, not a general database, and not a chain-first product.

Evidence to retain:

- conformance suite results by package/ref;
- external-review-ready proof packet bundle;
- anchor batch JSON with submission status;
- if any transaction is publicly claimed, transaction signature, cluster, slot or block metadata, timestamp, and approved explorer or RPC evidence;
- benchmark registry sample with no unredacted private records;
- partner integration packet with public-safe refs only.

## What to build next

### 1. Memory Drive command center

A single local UI or CLI dashboard should answer:

- Which connectors are enabled?
- Which namespaces are active?
- Which derived artifacts are stale?
- Which receipts are missing?
- Which proof packets verify?
- Which benchmark attestations are publishable?
- Which artifacts are local-only and which are approved for public proof sharing?

### 2. Connector approval loop

The most important daily product loop is:

1. connector requests context;
2. Memory Drive evaluates scope and policy;
3. user or admin approves, denies, or narrows;
4. connector receives minimum necessary context;
5. receipt records public-safe evidence;
6. verifier can inspect the artifact without seeing private memory.

This loop should be easy to demo and difficult to misunderstand.

### 3. Public-safe artifact firewall

Every public artifact path should pass through a strict denylist and schema validator. The validator should reject private memory content, AI interaction bodies, vector payloads, provider bodies, customer identifiers, credentials, key material, and credential-like values. Passing validation does not make a broad external claim; it only means the artifact is suitable for the stated public-safe proof boundary.

### 4. Health and benchmark convergence

Memory health and benchmarks should reinforce each other:

- health reports show whether a drive is operationally trustworthy;
- benchmarks show how a package/runner/dataset configuration performed;
- attestations bind benchmark claims to exact refs;
- proof packets bind operational evidence to roots and signatures.

The product should avoid separate dashboards that tell incompatible stories.

### 5. Enterprise evidence packet

Enterprise buyers need a repeatable packet that includes:

- architecture boundary;
- deployment mode;
- key management boundary where implemented;
- connector scopes;
- policy decision refs;
- proof packet refs;
- benchmark attestation refs;
- incident and support boundaries;
- explicit non-claims for third-party lifecycle control, model-state control, chain settlement, legal status, and business outcomes.

## Messaging framework

### Use these lines

- Enigma is the private Memory Drive for AI.
- Enigma gives AI systems a controller for durable memory, permissions, receipts, and public-safe proofs.
- Enigma keeps canonical memory local or customer-controlled while publishing only hashes, roots, refs, counts, schemas, and signatures.
- Enigma lets connectors request memory through scoped capabilities instead of copying everything into each app.
- Enigma Proof Network artifacts are designed for offline verification without exposing private memory content.
- Solana is an optional proof rail for opaque roots and refs when public anchoring is useful and evidenced.

### Avoid these lines

- Do not say Enigma controls closed provider systems unless approved external evidence exists.
- Do not say Enigma changes model state.
- Do not say a local artifact is an on-chain transaction.
- Do not say a benchmark fixture proves universal market leadership.
- Do not say public proofs contain hidden recoverable memory.
- Do not promise legal status, financial outcomes, token economics, or business results.
- Do not use customer identifiers, private policy bodies, provider bodies, AI interaction bodies, vector payloads, or credentials in public examples.

## Claim boundaries

### Allowed

- Enigma can be described as a private AI Memory Drive and controller layer.
- Enigma can generate public-safe proof artifacts for supported memory operations.
- Public artifacts can contain hashes, Merkle roots, opaque refs, counts, timestamps, schema refs, signer refs, signatures, nullifiers, dataset refs, runner refs, package refs, and explicit non-submission flags.
- Enigma can prepare Solana-ready anchor payloads from public-safe roots and refs.
- Benchmark attestations can bind a report hash to dataset refs, runner refs, package refs, metric refs, and review metadata.
- Enterprise control-plane artifacts can show Enigma-controlled grants, revocations, policy decisions, health snapshots, and proof packet verification status.

### Conditional

- "Anchored on Solana" requires transaction signature, cluster, slot or block metadata, timestamp, and approved explorer or RPC evidence.
- "Signed" requires a real signature or approved signature ref created by the documented signing process.
- "Policy enforced" requires evidence from the enforcing runtime or gateway for the named environment.
- Managed-service or deployed-environment claims require separate deployment, auth, billing, monitoring, support, legal, and operator approval evidence.
- Numeric benchmark claims require exact report hash, dataset or fixture ref, runner ref, package ref, metric ref, and scope.
- Third-party lifecycle confirmation requires approved evidence from that external system; Enigma-local artifacts alone are not enough.

### Prohibited

- Enigma publishes private memory content so anyone can audit it.
- Enigma stores AI interaction bodies, vector payloads, ACL bodies, customer identifiers, provider bodies, or private payloads on-chain.
- Enigma proves a memory statement is true in the real world.
- Enigma proves a closed provider changed or removed logs, backups, caches, personalization, training records, vector stores, or summaries without external evidence.
- Enigma changes model state.
- A local anchor artifact means a transaction was submitted.
- A chain root proves underlying memory is truthful, complete, lawful, externally removed, or absent from a model.
- A single benchmark run proves universal performance, business outcome, or product leadership.
- Enigma proof artifacts are legal, regulator-approved, or financial records by default.

## Strategic end state

Enigma wins the category by making private AI memory feel like a controlled drive instead of scattered app state. The Local Memory Drive owns canonical custody. Connector OS gives distribution. The Enterprise Control Plane gives policy and review. The Benchmark Attestation Network gives evidence discipline. The optional Solana Proof Rail gives public verification when a root needs an external checkpoint.

The message should stay simple:

> AI needs memory. Memory needs a controller. The controller must be private, portable, permissioned, and provable without exposing the memory itself.
