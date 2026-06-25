# Competitive memory analysis

## Purpose

This analysis positions Enigma against adjacent approaches to AI memory, custody, retrieval, audit, and key control. It is launch collateral, not a benchmark report. It does not claim provider deletion proof, model forgetting, semantic forgetting, token ROI, valuation, revenue share, tamper-proof hardware, or raw compute superiority.

## Repository grounding

This analysis is grounded in the current Enigma launch posture:

- `README.md` defines Enigma as a provider-agnostic memory custody and proof layer with local CLI, verifier, vault, passport, boundary, MCP server, connector, importer, relay, gateway, enterprise, mesh, browser-extension, and desktop scaffold surfaces present in the repository.
- `README.md` and `docs/client-connectors.md` state that provider-native memory is cache only and that Enigma proofs cover Enigma-controlled vault state, receipts, checkpoints, and declared boundary operations.
- `docs/enterprise-byoc-runbook.md` defines hosted, BYOC, and on-prem/air-gapped control boundaries, including customer-controlled KMS/BYOK, logs, SIEM, backups, residency, and access for BYOC/on-prem modes.
- `docs/enterprise-byoc-runbook.md` requires plaintext-minimized evidence: no raw memory plaintext, prompts, transcripts, completions, embeddings, secrets, or raw key material in SIEM/proof artifacts.

Those constraints drive the competitive argument below: Enigma competes on custody, portability, scoped context, and offline-verifiable evidence, not on provider-internal control, model behavior, raw retrieval speed, or hardware/security absolutes.

## Executive conclusion

Enigma is strongest where AI memory must be **portable, scoped, customer-controlled, and evidence-carrying** across multiple providers and tools. The closest alternatives solve useful pieces of the problem, but they usually make one of three tradeoffs:

1. **Provider-native convenience without neutral custody.** The memory helps inside one account or product, but the provider remains the durable system of record.
2. **Storage or logs without lifecycle proof.** Vector databases, agent state stores, and observability traces can retain data, but they do not by themselves create a portable Memory Passport or offline-verifiable proof bundle for memory lifecycle and boundary decisions.
3. **Key custody without memory semantics.** KMS, gateways, decentralized storage, and hardware wallets can protect keys, route traffic, or store encrypted objects, but they do not by themselves prove what memory was retrieved, denied, scoped, exported, tombstoned, or removed from active Enigma serving.

The SanDisk-level positioning is precise: **Enigma is not trying to own every model, agent, vector index, gateway, cloud, or hardware device. It is the portable memory and proof layer that those surfaces can adopt.** Like a memory card standard, the strategic goal is compatibility, portability, and trust—not ownership of every endpoint.

## Enigma Proof Network vs Mem0, Zep, Letta, LangGraph, and native memory

The Proof Network comparison should stay source-aware and narrow: public docs for [Mem0](https://docs.mem0.ai/introduction), [Zep](https://help.getzep.com/overview), [Letta](https://docs.letta.com/guides/core-concepts/stateful-agents), [LangGraph memory](https://docs.langchain.com/oss/python/concepts/memory), and provider-native memory such as [ChatGPT Memory](https://help.openai.com/en/articles/8590148-memory-faq) primarily describe memory, personalization, state, graph context, checkpoints, stores, or product controls. Enigma should not claim those systems lack private roadmaps, cannot integrate proofs, or perform worse on retrieval. The defensible distinction is that Enigma's Proof Network artifacts are designed to expose public-safe roots, refs, scoped capability grants, revocations/nullifiers, and benchmark attestations without putting raw memory, prompts, transcripts, completions, embeddings, tenant names, ACL bodies, or provider responses into public artifacts or chain payloads.

| Alternative | Source-aware reading | Enigma Proof Network differentiation |
| --- | --- | --- |
| Mem0 | Public docs frame Mem0 as a universal/self-improving memory layer, with managed and self-hosted options and integrations. | Position against proof and permission surface, not memory quality: Enigma adds public-safe anchor batches, capability grants, revocations, and verifier-ready packets around Enigma-mediated memory boundaries. |
| Zep | Public docs frame Zep around enterprise agent memory, a governed Context Lake, and temporal knowledge graphs. | Position Enigma as complementary proof infrastructure: opaque roots and attestations can evidence what Enigma committed or authorized without claiming better graph retrieval or latency. |
| Letta | Public docs frame Letta around stateful agents, persisted messages, tools, and editable memory blocks. | Position Enigma beneath or beside agent state: scoped grants and revocations can govern portable memory access without claiming to replace the agent runtime. |
| LangGraph | Public docs frame memory as short-term thread checkpoints and long-term stores/namespaces for agent applications. | Position Enigma as a neutral proof and permission layer for durable memory events, not as a graph orchestration or checkpointing replacement. |
| Provider-native memory | Product docs describe personalization, memory settings, summaries/sources, and deletion controls within the provider experience. | Position Enigma as provider-neutral custody plus offline-verifiable evidence for Enigma-mediated boundaries; do not claim provider-internal deletion, model forgetting, or benchmark superiority. |

For benchmarks, the safe claim is attestation integrity, not leaderboard rank: Enigma can package report hashes, dataset refs, runner refs, package refs, and signatures so a third party can inspect what was claimed. It must not say the Proof Network proves Enigma outperforms Mem0, Zep, Letta, LangGraph, or native memory unless a separate benchmark report supplies reproducible commands, inputs, and results.

## Memory optimization thesis

Enigma's memory analogue to inference optimization is a centralized optimized memory fabric for high-performance memory optimization. The product value is to reduce repeated context spend through dedupe, tiering, scoped context selection, and receipt-backed access decisions while preserving portable custody. Blockchain/permissionless access, if present, is for access/settlement/anchoring boundaries only: access control, settlement, and proof/receipt anchoring. It is not ideological decentralization and it must not carry raw memory plaintext.

The buyer message is practical: lower memory/context cost from less repeated context, proof for what crossed Enigma boundaries, portability across providers and agents, and no lock-in to one provider-native memory system. Explicitly avoid measured discount claims, benchmark leadership, token ROI, investment return, provider deletion proof, model forgetting, compliance status, or raw on-chain memory. Discount language must stay qualitative until benchmarks exist with documented commands, inputs, and results.

The implementation surface expected from the optimizer package is `enigma-memory/optimizer` (`./optimizer`): `MEMORY_OPTIMIZATION_PRODUCT_THESIS`, `MEMORY_OPTIMIZATION_PLAN_SCHEMA`, `MEMORY_ACCESS_RECEIPT_SCHEMA`, `estimateTextTokens`, `estimateTokenCost`, `createMemoryOptimizationPlan`, `createMemoryAccessReceipt`, and `assertNoRawMemoryOutput`. The optimizer may evaluate private plaintext candidates locally, but its exported plans, receipts, and output artifacts should expose commitments, hashes, counts, tiers, and token/cost estimates rather than raw memory content.

## Technical axes

| Axis | What Enigma is designed to provide | Boundary |
| --- | --- | --- |
| Custody | Local-first or customer-controlled canonical memory vaults; provider-native memory treated as cache. | Does not prove custody of provider-internal logs, backups, personalization, or model state. |
| Portability | Memory Passports and capsules that can move across MCP-capable clients, connectors, import/export flows, and partner systems. | Imports from third parties preserve source caveats until written through Enigma and receipted. |
| Scoped context | Task-specific context packs and gateway policy decisions before provider/tool use. | Once approved context is sent to an external provider, Enigma cannot prove that provider's internal retention behavior. |
| Offline receipts | Signed proof bundles that can be checked without trusting a live dashboard. | A valid receipt proves the declared Enigma-mediated event, not the real-world truth of a memory statement. |
| Boundary evidence | Receipts for create, retrieve, context-pack, deny, export, tombstone/delete-request, gateway decision, relay/witness checkpoint, and verifier events where implemented. | Evidence is limited to named, instrumented Enigma boundaries. |
| Deletion from active state | Receipts can show Enigma-controlled tombstone/delete-request behavior and whether Enigma serving paths continue to include a committed memory address. | No provider deletion proof, backup erasure proof, model forgetting, semantic forgetting, or deletion from human/screenshot/export copies. |
| Relay/witness/gateway fit | Optional infrastructure for encrypted relay, opaque checkpoint witnessing, policy-gated access, minimized SIEM/eDiscovery evidence, and service accountability. | Raw memory plaintext, prompts, transcripts, embeddings, ACLs, and personal metadata should not be public network artifacts. |
| Enterprise policy | Tenant policy over provider, model, region, purpose, sensitivity, retention, legal hold, KMS/BYOK references, and SIEM export minimization. | Enigma supports review and evidence; it is not a blanket compliance certification. |
| Memory/context cost control | Local/offline optimizer for dedupe, tiering, repeated-context reduction, and token/cost estimation from explicit inputs. | No measured discount, benchmark leadership, token ROI, or provider billing claim until repository benchmarks and pricing inputs support it. |

## Technical axis scorecard

Legend: **native** means the category usually provides this directly; **partial** means it can support the axis with extra design or integrations; **weak** means it is not the category's normal proof surface.

| Category | Custody | Portability | Scoped context | Offline receipts | Boundary evidence | Active-state deletion proof | Relay/witness/gateway fit | Enterprise policy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Enigma | Native: local-first or customer-controlled vault. | Native: Memory Passport/capsule model. | Native: context packs and gateway decisions. | Native: exported proof bundles and verifier. | Native for instrumented Enigma events. | Native for Enigma serving paths only. | Native/partial: optional encrypted relay, witness, gateway. | Native/partial: policy, KMS/BYOK references, SIEM minimization. |
| Provider-native memory | Provider-custodied. | Weak across providers. | Partial inside provider product. | Weak unless provider exposes verifier-grade artifacts. | Partial inside provider logs/settings. | Weak outside user-visible settings. | Weak. | Partial through provider enterprise controls. |
| Vector databases / RAG | Partial: stores/indexes data, not usually user memory custody. | Weak unless paired with export/passport layer. | Partial through retrieval filters. | Weak by default. | Weak by default. | Partial for index deletion, weak for derived copies. | Weak/partial as storage behind a relay. | Partial through access controls and deployment mode. |
| Agent-framework state | App/framework-custodied. | Weak across unrelated runtimes. | Partial through agent policies/prompts. | Weak by default. | Partial operational traces. | Weak outside framework state. | Weak/partial when connected to gateways. | Partial if framework adds tenant controls. |
| Observability logs | Vendor/customer log custody, not memory custody. | Weak as user memory. | Weak; observes rather than scopes. | Partial if logs are exportable/signed. | Native for traces, weak for memory lifecycle proof. | Weak; logs show events, not active serving state. | Partial for gateway/SIEM evidence. | Native/partial for audit operations. |
| Decentralized storage | Partial for encrypted object custody; metadata risk remains. | Partial through content addressing. | Weak. | Partial for inclusion/availability proofs. | Partial for commitments, weak for memory boundaries. | Weak after replication. | Native/partial for relay/witness storage of opaque records. | Weak unless wrapped by policy layer. |
| Cloud KMS / gateways | Native for keys/routing, not memory state. | Weak for memory movement. | Partial/native for traffic policy. | Partial if gateway signs decisions. | Native/partial for access decisions. | Weak for memory serving state. | Native for gateway role, partial for witness/relay. | Native for enterprise controls. |
| Hardware wallets / secure elements | Native for private-key custody, not memory custody. | Weak. | Weak. | Partial for signing ceremonies. | Partial for device/user approval evidence. | Weak. | Partial for operator/device identity. | Partial as a key-control component. |
| Memory optimizers / prompt compression | Partial/native for context reduction, weak for custody/proof unless paired with receipts. | Partial across products. | Native for prompt/context shaping, weak for durable memory custody. | Weak unless evidence is signed/exportable. | Weak unless integrated with boundary receipts. | Weak for lifecycle proof. | Weak/partial as upstream of a gateway. | Weak unless policy-scoped. |

## Category comparison

| Category | Primary strength | Where it usually falls short for Enigma's thesis | Enigma posture |
| --- | --- | --- | --- |
| Provider-native memory | Low-friction personalization inside one AI product. | Provider is the memory system of record; portability, independent custody, cross-provider policy, and offline receipt verification are limited. Cannot prove provider-internal deletion or model forgetting. | Treat as useful cache/convenience. Enigma vault remains canonical for Enigma-managed durable memory. |
| Vector databases and RAG | Efficient similarity retrieval over embeddings/documents. | Storage/retrieval primitive, not a custody standard. Does not inherently provide passports, scoped disclosure policy, signed lifecycle receipts, tombstones, offline verifier, or cross-provider boundary evidence. | Enigma can use or wrap retrieval/indexes as derived infrastructure while preserving signed memory events as source of truth. |
| Agent-framework state | Fast developer path for short-term agent memory, scratchpads, tool state, and workflows. | State is usually framework-specific, app-specific, and operational. Portability, tenant custody, deletion evidence, and external audit bundles are not guaranteed by default. | Enigma can serve as a neutral memory server or passport layer beneath agents rather than replacing the agent runtime. |
| Observability logs and traces | Operational debugging, latency/error analysis, audit trails, and incident review. | Logs are not usually user-portable memory, are often dashboard-bound, may contain too much plaintext, and do not by themselves prove scoped context authorization or active-state deletion. | Enigma emits minimized evidence and receipts that observability stacks can ingest without becoming the canonical memory vault. |
| Decentralized storage | Content addressing, replication, censorship-resistance, and public verifiability for objects. | Publishing or replicating AI memory can create privacy and metadata risk. Storage does not decide purpose, scope, consent, enterprise policy, or deletion from active serving. | Use only for encrypted/opaque objects or commitments where appropriate; keep raw memory off public networks. |
| Cloud KMS and model gateways | Mature enterprise key custody, secrets management, routing, allowlists, and policy enforcement. | KMS protects keys; gateways route/evaluate requests. Neither is by itself a portable memory passport, lifecycle receipt schema, or proof that a memory was removed from active Enigma serving. | Integrate with KMS/BYOK and gateways. Enigma adds memory semantics, scoped context receipts, verifier output, and memory-specific evidence bundles. |
| Hardware wallets and secure elements | Strong private-key isolation and user approval ceremonies. | They protect signing keys or authorize transactions; they do not store/query AI memory, construct scoped context, enforce enterprise provider policy, or prove external deletion. Hardware is not tamper-proof by default. | Hardware can anchor identity, signing, local custody, or visible proof workflows; Enigma should not claim hardware proves closed-provider behavior. |
| Memory optimizers and prompt compression | Reducing repeated prompt/context material before model calls. | Usually optimize prompt shape without becoming canonical memory custody, portability, lifecycle proof, or no-lock-in infrastructure. They may also overstate savings without measured benchmarks. | Enigma should integrate optimization with custody and receipts: dedupe/tier locally, estimate tokens/cost from explicit inputs, and expose commitments rather than raw memory. |

## What each category cannot prove

### Provider-native memory

Provider-native memory can improve product experience quickly. It can often show user-facing settings, visible memories, exports, or deletion controls for that provider's account surface.

It usually cannot independently prove:

- that another provider or local agent received the same memory under the user's custody;
- that a memory remained portable after account, subscription, or product changes;
- that hidden provider logs, caches, backups, personalization state, or model weights were deleted;
- that a context insertion was restricted to a specific purpose, policy hash, or enterprise boundary unless the provider exposes verifiable evidence;
- that an auditor can verify the lifecycle event offline without trusting the provider dashboard.

Enigma's advantage is neutral custody and receipts for Enigma-mediated events. The honest boundary is that Enigma still cannot prove what the provider does internally after approved context crosses into that provider.

### Vector databases and RAG systems

Vector databases are useful storage and retrieval infrastructure. They can store embeddings, documents, chunks, metadata, and indexes; they can support semantic search and RAG.

They usually cannot prove by default:

- who had canonical custody of the memory as opposed to an index copy;
- which memory was authorized for a provider/model/tool call under a stated policy;
- whether a retrieved item was packaged as scoped context rather than broad disclosure;
- whether deletion removed an item from all derived indexes, exports, logs, and serving paths;
- whether a third party can verify lifecycle evidence offline from a portable bundle.

Enigma can use vector/RAG components as implementation details or derived caches. The competitive point is not that Enigma performs raw similarity search better; it is that Enigma adds custody, policy, receipt, and portability semantics around memory use.

### Agent-framework state

Agent frameworks provide practical state for workflows: scratchpads, message history, tool outputs, checkpoints, and planner state.

They usually cannot prove by default:

- durable memory portability across unrelated runtimes and providers;
- enterprise policy decisions for provider/model/region/purpose/sensitivity;
- that memory lifecycle events are signed, ordered, and exportable for offline review;
- that framework state is minimized before entering external provider calls;
- that deletion from agent state removed all downstream copies, provider logs, or derived artifacts.

Enigma should be framed as a memory/proof substrate for agents, not a replacement for orchestration. The agent framework remains where work is planned and executed; Enigma is where durable memory custody and evidence live.

### Observability logs and traces

Observability tools are essential for production AI operations. They show requests, traces, errors, latency, tool calls, and sometimes policy decisions.

They usually cannot prove by default:

- that logs are the canonical memory state rather than operational exhaust;
- that a user can carry memory to another AI product without the observability vendor;
- that all memory-bearing fields are plaintext-minimized;
- that a receipt bundle remains verifiable without the live logging system;
- that a deletion/tombstone changed active memory serving rather than merely adding another log line.

Enigma should interoperate with logs by exporting minimized SIEM/eDiscovery evidence and receipt references. It should not ask enterprises to treat raw traces as the memory vault.

### Decentralized storage

Decentralized storage can be valuable for availability, content addressing, and replicated encrypted objects.

It usually cannot prove by default:

- consent, purpose limitation, enterprise authorization, or scoped context selection;
- deletion from active memory serving after an object has been replicated;
- absence of metadata leakage from timing, size, addresses, hashes, or access patterns;
- that a public content address corresponds to safe-to-share memory material;
- that a model provider forgot anything after consuming context.

Enigma's network posture should stay conservative: relays and witnesses handle opaque encrypted records, roots, commitments, receipt IDs, service metadata, and accountability state—not raw memory plaintext.

### Cloud KMS and model gateways

Cloud KMS/BYOK and gateways are strong enterprise primitives. KMS manages key custody and rotation; gateways can apply routing, allowlists, rate limits, and policy.

They usually cannot prove by themselves:

- that AI memory has a portable passport format;
- that a memory was retrieved, scoped, denied, exported, tombstoned, or removed from Enigma active serving;
- that a receipt bundle can be verified offline outside the live gateway;
- that imported provider memory was complete;
- that provider-internal retention, backups, or model state changed.

Enigma should integrate rather than compete here. In enterprise posture, Enigma references KMS/BYOK key versions and gateway policy hashes without exporting raw keys or raw memory plaintext.

### Hardware wallets and secure elements

Hardware wallets and secure elements can make key custody tangible and reduce key-exfiltration risk for certain workflows.

They usually cannot prove by themselves:

- what AI memory was selected for a task;
- whether a provider/tool boundary allowed or denied scoped context;
- whether memory was deleted from active software serving paths;
- whether a provider deleted hidden copies or model state;
- that the device is tamper-proof or physically uncompromisable.

Enigma's hardware ladder, if used, should be described as visible custody, identity, signing, local verification, or gateway support. It should not claim tamper-proof memory, provider deletion proof, or compute superiority.

## Enterprise buying lens

Enterprise buyers should evaluate Enigma against alternatives with questions that expose proof boundaries:

1. Where does canonical memory live, and who controls keys and policy?
2. Can memory move across providers and agents without turning one vendor dashboard into the system of record?
3. Can the system show which context was approved for which provider, model, region, purpose, sensitivity, and policy hash?
4. Can an auditor verify the evidence offline from an exported bundle?
5. Does deletion evidence distinguish active Enigma serving from provider-internal deletion, backups, logs, and model state?
6. Are public/network artifacts plaintext-minimized, and are metadata risks disclosed?
7. Can existing KMS, BYOK, SIEM, eDiscovery, VPC/BYOC, and gateway controls be integrated without making Enigma a black box?

## Positioning language

Use:

> Enigma is the provider-neutral memory and proof layer for AI: customer-controlled custody, portable Memory Passports, scoped context, and offline-verifiable receipts for Enigma-mediated lifecycle and boundary events.

Use:

> Provider-native memory, vector stores, agent state, logs, decentralized storage, KMS/gateways, and hardware wallets are valuable components. Enigma's role is to make durable AI memory portable, policy-scoped, and evidence-carrying across them.

Do not use:

> Enigma deletes memories from every provider, makes models forget, proves semantic forgetting, guarantees compliance, stores raw memory on-chain, replaces all vector databases, out-computes cloud AI, or makes hardware tamper-proof.

## Partner strategy by category

| Partner category | Partner message | Integration path |
| --- | --- | --- |
| AI providers and native-memory products | Let users bring a proof-carrying Memory Passport while your product keeps its native experience. | Import/export, scoped context insertion, receipt references, provider-specific caveats. |
| Vector database and RAG vendors | Keep your retrieval engine; add Enigma custody, lifecycle receipts, and passport portability. | Derived indexes, receipt-addressed chunks, verifier fixtures, deletion/tombstone reconciliation. |
| Agent frameworks | Keep orchestration in the framework; call Enigma for durable memory and proof. | MCP server, SDK, context packs, delete/tombstone tools, verifier resource. |
| Observability/SIEM vendors | Ingest minimized receipt and policy evidence without becoming the memory store. | SIEM/eDiscovery export, receipt IDs, policy hashes, decision reason codes. |
| Decentralized storage and network operators | Store or witness only opaque encrypted records and commitments. | Relay records, witness checkpoints, service accountability, metadata-risk review. |
| Cloud, gateway, and security platforms | Use Enigma as the memory-specific control and evidence layer beside KMS/BYOK and routing policy. | BYOC/VPC/on-prem deployment, KMS references, gateway decisions, audit bundles. |
| Hardware wallet/secure element vendors | Anchor signing, visible custody, and local verification without overclaiming physical security. | Device identity, key ceremonies, local verifier, gateway appliance workflows. |

## Competitive claim boundary

Enigma is better than adjacent categories at **portable, receipt-backed AI memory custody across providers** when the deployment uses Enigma as canonical state. Enigma is not better at every subproblem. It should not claim to be the fastest vector database, the only observability system, a cloud KMS replacement, a model gateway replacement, a decentralized storage network, a hardware wallet, or an AI model. The launch claim is narrower and stronger: **memory under user or customer control, scoped before use, and accompanied by evidence that can be verified outside a live vendor dashboard.**
