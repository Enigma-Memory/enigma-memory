# Proof Network claim boundaries

This is the mandatory claims guide for Enigma Proof Network launch copy, docs, sales material, demos, investor material, benchmark pages, and support language.

Use the exact boundary: Enigma Proof Network creates and verifies public-safe proof artifacts for AI memory operations. Public artifacts may contain hashes, Merkle roots, opaque refs, counts, timestamps, schemas, signatures, signer refs, nullifiers, capability scopes, package refs, dataset refs, runner refs, and explicit non-submission flags. They must not contain raw memory, prompts, transcripts, completions, embeddings, ACL bodies, tenant names, private keys, API keys, seed phrases, provider responses, or other private payloads.

The implementation goal and ledger contract that operationalize this boundary are `docs/MEMORY_BOUNDARY_TRANSACTION_GOAL.md` and `specs/claim-ledger-v1.schema.json`.

## Mandatory proof boundary

Every public Proof Network claim must satisfy all of these rules:

1. State what Enigma controls: local artifact creation, schema validation, secret/private-payload rejection, public-safe hash/root/receipt generation, and optional Solana-ready anchor payload preparation.
2. State what Enigma does not control: closed provider deletion, model weights, provider logs/backups/caches, third-party accounts, external benchmark runtimes, hosted SaaS operations, legal compliance certification, customer ROI, or chain finality unless separately evidenced.
3. Use evidence-backed nouns: `anchor batch`, `capability grant`, `capability revocation`, `benchmark attestation`, `proof packet`, `root`, `hash`, `opaque ref`, `signature`, `nullifier`, `scope`, `dataset ref`, `runner ref`, `package ref`.
4. Keep public examples plaintext-minimized. Do not include realistic customer names, tenant names, private policies, memory text, prompt text, model completions, provider response bodies, API keys, seed phrases, private keys, or raw benchmark records.
5. If a CLI artifact says `transaction_submitted:false`, copy must say the command prepared a Solana-ready artifact only. It must not say Enigma submitted, settled, finalized, minted, staked, paid, or wrote anything on-chain.
6. If an artifact says `raw_memory_on_chain:false`, copy must say memory is not placed on-chain. It must not imply hidden memory can be recovered from the public proof.
7. If a claim depends on a report, cite the artifact, report hash, command, dataset/file refs, runner version/ref, package version/ref, and review approval. Do not generalize one run into universal performance, ROI, or market leadership.

## Public claim status levels

| Status | Meaning | Marketing rule |
| --- | --- | --- |
| Allowed | Directly supported by local package behavior, schema validation, or reviewed artifact fields. | May be used as written, with the evidence ref when numeric or operational. |
| Conditional | True only when a named external approval, audit, deployment record, benchmark run, or chain transaction receipt exists. | Must include the condition and the evidence ref. Do not shorten into an absolute claim. |
| Prohibited | Not supported by Enigma-controlled proof artifacts or unsafe because it implies private data exposure, provider control, legal certification, or financial outcome. | Do not use, paraphrase, imply, or place in headlines. |

## Proof Network artifacts

### Allowed

- Enigma Proof Network emits public-safe artifacts for memory proof coordination.
- Anchor batches commit to roots, hashes, opaque refs, and counts without publishing raw memory.
- Capability grants and revocations can describe scoped access by opaque subject, resource, purpose, expiry, signer, and nullifier references.
- Benchmark attestations can bind a benchmark report hash to dataset refs, runner refs, package refs, metrics refs, and review metadata.
- Proof packets can aggregate supported Proof Network artifacts for review and verification.
- Validators reject private payload keys and credential-looking values before an artifact is considered public-safe.

### Conditional

- "Verified" may be used only for artifacts that have passed the relevant Proof Network validator.
- "Signed" may be used only when the artifact includes a real signature or approved signature ref created by the documented signing process.
- "Release evidence" may be used only for artifacts produced by the reviewed release package or CLI command and retained with the release record.

### Prohibited

- Enigma proves every memory event happened exactly as described.
- Enigma proves a memory statement is factually true in the real world.
- Enigma publishes user memory so anyone can audit it.
- Enigma makes private memory public but safe.
- Enigma guarantees every proof packet is complete without an approved completeness protocol.
- Enigma proof artifacts are legal records, compliance records, or regulator-approved audit records by default.

## Blockchain and Solana anchoring

### Allowed

- Enigma can prepare Solana-ready opaque anchor batches from public-safe roots and refs.
- The local `enigma chain anchor` command is a planning command that produces JSON for review; it does not submit a transaction.
- Public anchor payloads are designed to contain commitments and metadata, not raw memory.
- A chain payload can be described as "ready for operator submission" only when it contains the required public-safe roots/refs and `transaction_submitted:false`.

### Conditional

- "Anchored on Solana" requires a real transaction signature, cluster, slot/block metadata, timestamp, and explorer or RPC evidence approved for publication.
- "Finalized" requires chain-specific finality evidence for the named transaction and cluster.
- "Immutable public timestamp" requires the actual published transaction evidence. A prepared local batch is not enough.
- Token, fee, staking, or settlement language requires separately approved token/legal/economic documentation.

### Prohibited

- Enigma writes memory to Solana.
- Enigma stores prompts, transcripts, completions, embeddings, ACLs, or tenant data on-chain.
- Enigma has already submitted a transaction when only the local CLI artifact exists.
- Enigma guarantees chain availability, finality, censorship resistance, price stability, token appreciation, yield, or settlement economics.
- Enigma's root proves the underlying memory was truthful, complete, lawful, or provider-deleted.

## Capability grants and revocations

### Allowed

- Enigma capability grants are scoped proof artifacts for intended access boundaries.
- Grants can include purpose, resource refs, subject refs, expiry, scope, signer refs, and public-safe policy refs.
- Revocations can include nullifier refs and revocation metadata without exposing the underlying private ACL or tenant data.
- A valid revocation artifact can prove that Enigma produced a revocation commitment for a specific public-safe grant/ref boundary.

### Conditional

- "Access revoked" requires evidence that every enforcing system consumed and enforced the revocation, not just that a revocation artifact exists.
- "Policy enforced" requires gateway/runtime enforcement evidence for the named environment.
- "Tenant-wide" or "organization-wide" requires a reviewed tenant/org scope ref and approved operator evidence.

### Prohibited

- A capability revocation proves a third-party provider deleted data.
- A grant proves the requester has legal authority to access the underlying memory.
- A public grant may include tenant names, employee names, raw ACLs, private policy bodies, secrets, provider account IDs, or customer identifiers.
- A revocation artifact alone guarantees every downstream copy, cache, log, backup, or model behavior is gone.

## Benchmarks and attestations

### Allowed

- Enigma benchmark attestations can bind a report hash to public-safe dataset refs, runner refs, package refs, metric refs, and review metadata.
- Local benchmark reports support claims about the exact command, fixture or dataset ref, runner version/ref, package version/ref, hardware/runtime context when recorded, and metrics contained in that report.
- Standard memory benchmark reports are retrieval/evidence proxy evidence unless a separately documented LLM answer-accuracy loop is run.
- Public benchmark artifacts should include hashes and refs, not raw questions, answers, conversations, prompts, provider responses, or private memory.

### Conditional

- Any numeric benchmark claim requires the exact report hash and scope. Example: "In report `<hash/ref>`, runner `<ref>` measured `<metric>` on dataset ref `<ref>` with package `<ref>`."
- Competitor comparisons require fixed competitor runtimes, credentials or self-hosted deployments, pinned versions, dataset mapping, prompts/tool loops, and reviewed publication approval.
- "Best," "leading," "faster," "more accurate," or "lower cost" requires a reviewed comparative methodology and evidence packet.

### Prohibited

- Enigma is the best AI memory benchmark performer based on local fixture evidence.
- Retrieval/evidence proxy scores are LLM answer accuracy.
- A benchmark report proves hosted SaaS readiness, provider deletion, model forgetting, compliance, or customer ROI.
- Public benchmark docs may publish raw dataset records, private memory, questions, answers, prompt text, transcripts, completions, embeddings, or provider response bodies unless a separate dataset license and publication review explicitly permit it.
- A report from one machine, fixture, top-k value, package version, or dataset slice is universal performance evidence.

## Hosted SaaS

### Allowed

- Enigma has hosted-cloud contract builders, validators, and lifecycle evidence packet schemas where those modules exist in the release.
- Proof Network artifacts can be used as public-safe evidence inputs for future hosted operations.
- Hosted SaaS remains separate from local proof artifact generation unless a deployment evidence packet, auth provider, billing provider, legal/data-processing terms, support ownership, external security review, and operator go-live approval exist.

### Conditional

- "Hosted cloud is live" requires approved production deployment evidence, tenant lifecycle evidence, auth, billing, support, incident, backup/restore, monitoring, legal terms, DPA/privacy terms, and operator go-live approval.
- "Customer API keys are live" requires issue/rotate/revoke/audit evidence and operator approval for the named environment.
- "Enterprise-ready hosted SaaS" requires the same evidence plus security review and support/incident readiness appropriate to the named customer segment.

### Prohibited

- Enigma hosted cloud is ready to sell because local contracts or docs exist.
- Proof Network artifacts are proof of live hosted SaaS operation.
- Local CLI commands create hosted tenants, accounts, API keys, invoices, backups, support tickets, or provider resources.
- Enigma has production tenants, uptime, SLA performance, support coverage, or billing operations without approved production evidence.

## Provider deletion

### Allowed

- Enigma can produce local revocation, deletion-request, forgetting-closure, or proof artifacts inside the Enigma-controlled boundary when those artifacts are generated by approved code.
- Enigma can record that an operator requested deletion from a provider if the public artifact uses only approved opaque refs and reviewed request metadata.
- Enigma can state that a provider deletion claim is outside the Proof Network boundary unless the provider supplies approved deletion evidence.

### Conditional

- "Provider deletion confirmed" requires the provider's own approved deletion confirmation, scope, timestamp, account/ref boundary, and legal/security review.
- "Deletion request submitted" requires evidence that the request was sent to the provider through the approved channel. A local artifact alone is not enough.
- "Deleted from Enigma-controlled storage" requires evidence from the specific Enigma storage environment and retention/backup policy scope.

### Prohibited

- Enigma proves OpenAI, Anthropic, Google, Meta, xAI, or any other provider deleted memory, logs, backups, caches, embeddings, summaries, personalization, or training records unless that provider supplied approved evidence.
- Enigma can force a closed provider to delete internal copies.
- A revocation nullifier equals provider deletion.
- A blockchain root proves provider deletion.
- A screenshot, local request packet, or customer assertion is enough to claim provider deletion.

## Model forgetting

### Allowed

- Enigma can help remove or withhold selected memory from Enigma-controlled context packs, local retrieval, and future prompts within the documented boundary.
- Enigma can produce evidence that a local memory item was excluded, revoked, expired, or no longer selected by Enigma-controlled retrieval logic when the artifact proves that specific behavior.
- Enigma can describe "context forgetting" only as Enigma-controlled context exclusion, not as model-weight modification.

### Conditional

- "The model no longer received this memory" requires prompt/context evidence for the specific run, with private content redacted or represented by hashes/refs.
- "The model no longer answered using this memory" requires a scoped evaluation protocol, prompts, outputs, model/version, and review approval.
- "Provider memory disabled/deleted" requires provider-side evidence and must use the provider's own terminology.

### Prohibited

- Enigma makes model weights forget.
- Enigma proves a model will never reproduce similar information.
- Enigma deletes knowledge from ChatGPT, Claude, Gemini, Grok, Llama, Kimi, Cursor, or any other model/provider.
- Enigma guarantees semantic forgetting, global forgetting, unlearning, or behavior erasure.
- A context-pack exclusion, revocation, or blockchain anchor is model forgetting proof.

## ROI, cost, and business outcomes

### Allowed

- Enigma may describe operational benefits qualitatively: clearer memory custody, public-safe proof artifacts, scoped capability grants, revocation evidence, benchmark attestations, and reduced disclosure risk from plaintext-minimized proofs.
- Enigma may cite measured local token estimates or latency metrics from a specific benchmark report with the report hash/ref and scope.
- Enigma may say Proof Network is designed to reduce audit friction by producing structured evidence packets.

### Conditional

- "Reduced token usage" requires a specific report and must say "estimated" when the metric is an estimate.
- "Lower provider invoice" requires actual customer invoice analysis, baseline, period, workload, provider, pricing, and written approval.
- "ROI" or "payback" requires finance-approved customer evidence and must not be generalized.

### Prohibited

- Guaranteed ROI, profit, payback period, revenue lift, margin improvement, investment return, token price increase, yield, or savings.
- Enigma cuts AI bills by a fixed percentage unless a reviewed customer-specific invoice analysis supports that exact statement.
- Proof Network makes compliance cheaper by default.
- Benchmark token estimates equal realized provider invoice savings.
- Blockchain anchoring creates financial upside for customers or token holders.

## Compliance, legal, and regulatory posture

### Allowed

- Enigma artifacts are designed for plaintext-minimized evidence workflows.
- Proof Network can support customer audit preparation by preserving hashes, roots, refs, signatures, scopes, timestamps, and validation status.
- Security and compliance teams can review Proof Network artifacts as part of their own control evidence process.
- Enigma can say it is not a compliance certification unless a separate audit says otherwise.

### Conditional

- SOC 2, ISO 27001, HIPAA, GDPR, CCPA, FINRA, SEC, PCI, FedRAMP, or similar claims require scoped legal/security approval and evidence from the actual audit, assessment, agreement, or deployment.
- "GDPR deletion support" requires approved legal wording, data map, controller/processor role, retention policy, deletion workflow, and provider subprocessors.
- "Audit-ready" may be used only as "artifact-ready for review" unless an auditor or customer control owner has approved the evidence set.

### Prohibited

- Enigma is SOC 2 compliant, HIPAA compliant, GDPR compliant, FedRAMP ready, regulator approved, legally certified, or audit certified without the specific approval and scope.
- Proof Network guarantees right-to-be-forgotten compliance.
- A blockchain root is sufficient legal deletion evidence.
- Hashes of private data are automatically anonymous, non-personal, non-sensitive, or regulator-safe.
- Public proof artifacts replace legal review, DPA terms, retention policy, breach notification, or customer-specific control evidence.

## Enterprise security

### Allowed

- Enigma emphasizes plaintext minimization: public proofs should carry commitments, roots, refs, counts, timestamps, scopes, signatures, and validation status instead of raw memory.
- Enigma can state that validators reject private payload keys and credential-looking values in supported proof artifacts.
- Enigma can describe separation between local package proof generation, hosted deployment evidence, and external provider behavior.
- Enigma can describe enterprise control goals: scoped grants, revocations, audit refs, benchmark attestations, and public-safe verification packets.

### Conditional

- "Enterprise-ready" requires defined deployment mode, security review, support process, incident process, key-management evidence, access-control evidence, monitoring/logging evidence, backup/restore evidence, and customer/operator approval.
- "Zero trust," "end-to-end encrypted," "BYOK," "KMS-backed," "SIEM-integrated," "SSO/SAML/SCIM," or "DLP-integrated" requires actual implementation evidence for the named environment.
- "No raw memory leaves the customer boundary" requires deployment architecture evidence and integration review.

### Prohibited

- Enigma is unhackable, tamper-proof, breach-proof, zero-risk, fully private by default, or impossible to misuse.
- Public hashes make all private memory safe to publish.
- Enterprise security is proven by a local CLI artifact alone.
- Proof Network eliminates the need for access control, key management, logging, monitoring, backups, incident response, support ownership, legal review, or human approval.
- Enigma can disclose customer proof artifacts publicly without customer approval.

## Required wording for CLI-generated artifacts

Use these boundaries whenever referencing `enigma chain anchor|grant|revoke|attest|verify`:

- `enigma chain anchor`: "Creates a local Solana-ready anchor batch from public-safe roots and refs. It does not submit a transaction. Raw memory is not placed on-chain."
- `enigma chain grant`: "Creates a local scoped capability grant artifact using public-safe refs and scopes. It does not expose raw ACL bodies or tenant data."
- `enigma chain revoke`: "Creates a local revocation/nullifier artifact. It does not prove third-party provider deletion or model forgetting."
- `enigma chain attest`: "Creates a local benchmark attestation from a report hash or approved report file plus dataset, runner, and package refs. It does not publish raw benchmark records or prove universal performance."
- `enigma chain verify --file <json>`: "Validates supported Proof Network artifact structure and private-payload boundaries. It does not prove real-world truth, provider deletion, model forgetting, hosted SaaS readiness, or legal compliance."

## Copy review checklist

Before publication, every Proof Network claim must answer yes to all applicable questions:

1. Does the copy identify the exact artifact, command, report, or evidence ref behind the claim?
2. Does it avoid raw memory, prompts, transcripts, completions, embeddings, ACL bodies, tenant names, secrets, provider responses, and private customer identifiers?
3. Does it distinguish local artifact generation from chain submission, provider action, hosted SaaS operation, and legal certification?
4. Does it avoid absolute words like "guarantees," "proves," "deletes," "forgets," "compliant," "certified," "best," "leading," and "ROI" unless the required evidence and approval exist?
5. Does it keep benchmark claims scoped to the exact report, runner, dataset/ref, package/ref, metric, and review boundary?
6. Does it avoid implying hashes are automatically anonymous or safe for every jurisdiction?
7. Does it include `transaction_submitted:false` and `raw_memory_on_chain:false` boundaries where chain artifacts are discussed?
8. Would the claim still be accurate if a provider kept logs/backups/caches or a model remembered similar information? If not, rewrite it.

## Approved short boilerplate

```text
Enigma Proof Network creates public-safe proof artifacts for AI memory operations: anchor batches, capability grants, revocations, benchmark attestations, and verification packets. The artifacts are designed to carry hashes, roots, refs, counts, scopes, timestamps, signatures, and validation status—not raw memory, prompts, transcripts, completions, embeddings, tenant names, secrets, or provider responses. Local chain commands prepare and verify JSON artifacts; they do not submit Solana transactions, prove provider deletion, prove model forgetting, certify compliance, or guarantee ROI.
```

## Replacement copy table

| Risky draft claim | Approved replacement |
| --- | --- |
| Enigma puts AI memory on Solana. | Enigma prepares Solana-ready public anchor batches that contain roots, hashes, refs, counts, and explicit non-submission flags; raw memory is not placed on-chain. |
| Enigma proves providers deleted data. | Enigma can produce Enigma-controlled revocation or deletion-request evidence; provider deletion requires provider-supplied confirmation and approval. |
| Enigma makes models forget. | Enigma can exclude or revoke memory from Enigma-controlled context packs; model-weight or provider-native forgetting is outside the Proof Network boundary. |
| Enigma is compliant. | Enigma artifacts are plaintext-minimized evidence inputs for compliance review; certifications require separate scoped legal/security approval. |
| Enigma reduces AI spend. | Enigma may cite report-scoped estimated token metrics; invoice savings require customer-specific provider invoice analysis and approval. |
| Enigma is enterprise-ready. | Enigma supports enterprise review workflows with scoped grants, revocations, attestations, and proof packets; production readiness requires deployment, security, support, incident, key-management, monitoring, and operator evidence. |

## Publication escalation triggers

Escalate to legal/security/product review before publication if copy:

- uses `delete`, `deleted`, `forget`, `forgotten`, `compliant`, `certified`, `guaranteed`, `ROI`, `savings`, `best`, `leading`, `on-chain`, `finalized`, `enterprise-ready`, or `zero trust` as an absolute claim;
- names a customer, tenant, provider account, regulated industry, auditor, regulator, chain transaction, benchmark leaderboard, or production environment;
- includes any number, percentage, ranking, price, savings amount, latency, recall, accuracy, or uptime claim;
- relies on a screenshot, demo, local fixture, prepared anchor batch, revocation artifact, or benchmark hash to imply external provider behavior;
- could be read as legal advice, compliance certification, investment language, securities language, deletion confirmation, model unlearning, or hosted SaaS availability.

## Hard red lines

Never publish these claims or close paraphrases:

- "We put AI memory on-chain."
- "We prove providers deleted your data."
- "We make models forget."
- "We guarantee GDPR/SOC 2/HIPAA compliance."
- "We guarantee ROI or lower AI bills."
- "Our benchmark proves Enigma is the best memory layer."
- "Hosted SaaS is live because the contracts exist."
- "Public hashes are anonymous, so they are always safe to publish."
- "A proof packet proves the underlying memory is true."
- "A local anchor artifact means the transaction was submitted."
