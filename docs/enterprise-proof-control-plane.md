# Enterprise proof control plane

Audience: enterprise security, identity, platform, records, privacy, legal, and procurement teams evaluating Enigma's proof-network control layer for AI memory.

Purpose: describe the buyer-facing architecture for governing Enigma-managed AI memory with identity, authorization, data-loss controls, retention, legal hold, evidence export, and offline-verifiable proof artifacts across hosted and customer-controlled deployments.

Claim boundary: Enigma proof artifacts can evidence Enigma-mediated policy decisions, capability grants, revocations, benchmark attestations, anchor batches, packet verification results, lifecycle receipts, and audit exports. They do not prove provider deletion, model forgetting, complete imported-source accuracy, absence of all side channels, or independent assurance status.

Privacy invariant: raw memory plaintext, prompts, transcripts, completions, embeddings, ACL bodies, tenant names, private keys, API keys, seed phrases, and provider responses must not be written into public proof artifacts, chain payloads, SIEM examples, documentation examples, or tests. Public artifacts use only public-safe hashes, roots, references, counts, timestamps, scopes, key references, and signatures.

## Executive architecture

Enigma separates the enterprise memory plane into four layers:

| Layer | Responsibility | Public-safe evidence |
| --- | --- | --- |
| Identity and administration | SSO/SAML, SCIM, admin roles, API-key lifecycle, break-glass, tenant policy change control. | Identity provider reference, role/capability IDs, policy hash, approval reference, audit event hash. |
| Policy decision plane | RBAC/ABAC, provider/model/region/purpose/sensitivity rules, DLP checks, retention, legal hold, egress gates. | Signed allow/deny/error decision, policy version/hash, rule reference, minimized subject/resource refs. |
| Proof network plane | Anchor batches, capability grants, revocations/nullifiers, benchmark attestations, proof packets, offline verification. | Schema ID, artifact hash, Merkle/root commitment, Solana-ready opaque anchor payload, signature refs, `transaction_submitted:false`. |
| Records and evidence plane | SIEM export, eDiscovery handoff, audit packets, policy replay, retention evidence, legal-hold evidence. | Minimized event stream, verifier output, replay transcript hashes, export manifest refs, custody/key refs. |

The control plane is not a model provider, not a vector database replacement by itself, and not an external assurance artifact. It is the governance and evidence layer around Enigma-controlled memory operations.

## Component catalog

| Component | Function | Deployment note | Evidence emitted |
| --- | --- | --- | --- |
| Admin boundary | Receives human admin actions through SSO/SAML, identity-aware proxy, and break-glass workflows. | Hosted uses operator-approved identity controls; BYOC/on-prem should integrate with customer identity controls. | Admin action hash, subject ref, role/capability ref, approval ref. |
| Service-identity boundary | Issues and rotates scoped API keys and workload identities. | Secrets stay in the approved secret manager or KMS-backed vault. | Key hash/ref, scope ref, owner ref, expiry, revocation/nullifier ref. |
| Policy engine | Evaluates RBAC/ABAC rules for memory operations, provider/tool routing, legal hold, retention, DLP state, and region. | Must fail closed on unknown attributes. | Signed allow/deny/error decision, policy hash, evaluator hash. |
| DLP/minimization gate | Rejects private fields before proof generation, chain planning, SIEM export, and support artifacts. | Runs before broad distribution of any artifact. | DLP decision ref, classifier hash, rejection reason ref. |
| Proof artifact service | Creates anchor batches, grants, revocations, attestations, and proof packets from public-safe refs. | Pure local artifact construction; no provider or chain submission implied. | Artifact schema ID, canonical hash, signature refs, verifier status. |
| Verifier | Checks proof artifacts offline and reports pass/fail/error. | Does not need external network access for supported local artifacts. | Verifier output hash, supported schema list, error refs. |
| Evidence exporter | Sends minimized security and records events to SIEM/audit destinations. | Content review uses eDiscovery, not the generic event stream. | Event hash, destination ref, delivery status ref, field-minimization proof. |
| KMS/BYOK integration | Provides key references for encryption, signing, backup, and rotation evidence. | Raw key material never enters proof artifacts or docs examples. | Key ref/version, public-key ref, rotation ref, custody ref. |

## Reference control flow

1. Admin or service identity authenticates through the approved identity boundary.
2. The request is normalized into public-safe references: subject, tenant, environment, operation, memory commitment, provider/tool, region, purpose, sensitivity, legal-hold state, and key ref.
3. The DLP/minimization gate rejects private payload keys or plaintext-looking values before proof artifacts, SIEM events, support exports, or chain-planning payloads are built.
4. The policy engine evaluates RBAC/ABAC rules under a specific policy hash and returns signed allow/deny/error evidence.
5. If allowed, the operation proceeds only within the approved hosted, BYOC, or on-prem boundary; provider/tool egress remains separate and policy-gated.
6. The proof artifact service emits the requested grant, revocation, benchmark attestation, anchor batch, or packet using hashes, refs, counts, roots, and signatures.
7. The verifier checks supported artifacts offline and records pass/fail/error output.
8. The evidence exporter sends minimized audit events to SIEM and records repositories.
9. Policy replay can later re-evaluate the same public-safe input refs against the same policy hash to prove the control-plane decision path.

## Deployment modes and responsibility split

| Mode | Control owner | Data-plane owner | Key/log/SIEM owner | Buyer expectation |
| --- | --- | --- | --- | --- |
| Hosted | Enigma/operator under contract | Enigma/operator environment | Enigma/operator by default unless contract delegates specific controls | Fastest adoption; customer requires contractual review, data-processing terms, incident process, export process, and evidence-retention commitments. |
| BYOC | Customer security/platform with Enigma deployment guidance | Customer cloud, VPC, cluster, or private network | Customer-controlled KMS/BYOK, logs, SIEM, backups, residency, operator access | Strongest enterprise control without running fully air-gapped; customer accepts infrastructure readiness and owns cloud guardrails. |
| On-prem / air-gapped | Customer | Customer network/data center | Customer-controlled keys, logs, package distribution, update path, verifier workflow | Requires separate offline operations, update, support, restore, and evidence-transfer procedure before production claims. |

Hosted and BYOC share the same proof artifact boundaries. The difference is operational custody: who controls infrastructure, key material, logs, residency, support access, backups, and incident response.

## Identity: SSO, SAML, SCIM, and break-glass

Enterprise administration should be fronted by the customer's identity provider or the hosted operator's approved identity boundary.

Required controls:

1. SSO/SAML for human administrators where available.
2. SCIM provisioning/deprovisioning for admin and service identities where available.
3. MFA enforced at the identity provider or identity-aware proxy.
4. Named accounts for privileged users; no shared admin identities.
5. Break-glass identities with separate approval, short duration, strong logging, and post-use review.
6. Tenant and environment separation for production, staging, demo, and support workflows.
7. Admin audit events for login, role change, policy change, API-key action, legal-hold action, export action, replay action, and verifier action.

Identity evidence should include identity-provider reference, subject reference, group or role reference, timestamp, action, environment, policy version, and request ID. It must not include passwords, session cookies, SAML assertions, OAuth tokens, raw group membership bodies, or private directory attributes.

## API keys and service identities

API keys are scoped service credentials, not tenant policy substitutes.

| Control | Requirement |
| --- | --- |
| Scope | Bind each key to environment, tenant reference, allowed API surfaces, proof artifact types, rate limits, and expiry. |
| Issuance | Require named owner, approval reference, purpose, rotation date, and custody location. |
| Storage | Store only key hashes or secret-manager references in Enigma metadata; never place raw key values in proof artifacts, SIEM, docs, or examples. |
| Rotation | Support planned rotation and emergency revocation. Evidence records key reference/version and revocation/nullifier hash, not key material. |
| Verification | Verifiers can confirm artifact signatures, scopes, and revocation status from public-safe refs without seeing the raw credential. |

Service identities should be least-privilege and purpose-bound. A runner that creates benchmark attestations should not be able to change legal holds. A SIEM exporter should not be able to issue capability grants. A gateway signer should not be able to read raw vault bodies unless explicitly approved through a separate support/legal path.

## Authorization: RBAC plus ABAC

The control plane should combine RBAC for administrative duties with ABAC for memory operations.

### RBAC roles

| Role | Typical permissions | Explicit exclusions |
| --- | --- | --- |
| Security administrator | Manage policy versions, review deny/error evidence, rotate service credentials, configure SIEM export. | Raw memory review unless separately authorized through eDiscovery/support process. |
| Records/legal administrator | Apply legal hold, approve eDiscovery export, review retention evidence. | Provider routing, benchmark attestation signing, infrastructure secrets. |
| Platform operator | Deploy and monitor components, manage backups, observe health. | Policy approval, legal-hold override, raw memory export. |
| Developer/operator | Create local proof packets, run verification, inspect public-safe artifacts. | Tenant-wide admin changes and production secret access. |
| Auditor/viewer | Read verifier outputs, audit evidence, policy replay results. | Mutation, key issuance, raw memory access. |

### ABAC attributes

Policy decisions should evaluate attributes such as:

- tenant reference and environment,
- subject/user/service reference,
- role and group reference,
- operation type,
- memory address/commitment or capsule reference,
- sensitivity label,
- purpose label,
- provider/model/tool label,
- region and data-residency label,
- legal-hold state,
- retention class,
- DLP classification result,
- key reference/version,
- time window and approval reference.

Default posture: fail closed on unknown provider, model, tool, region, purpose, sensitivity, tenant, environment, operation, legal-hold state, or key reference.

## Capability grants and revocations

A capability grant is a public-safe, signed statement that a scoped actor may perform a scoped operation under a policy version. It is not a bearer secret and must not contain raw tenant data.

Minimum grant fields:

- schema ID: `enigma.proof_network.capability_grant.v1`,
- issuer reference and signing-key reference,
- subject reference,
- capability type,
- scope references,
- policy hash/reference,
- expiry,
- optional delegation constraints,
- artifact hash/signature.

A revocation is a public-safe statement that invalidates a grant or class of grants through a revocation reference/nullifier.

Minimum revocation fields:

- schema ID: `enigma.proof_network.capability_revocation.v1`,
- revoked grant hash/reference or nullifier,
- reason code reference,
- issuer reference,
- timestamp,
- signature.

Revocation evidence should be replayable without exposing the original secret, raw API key, tenant name, memory body, or directory payload.

## DLP and plaintext minimization

DLP belongs before public proof generation and before broad event export.

Required DLP gates:

1. Reject proof artifacts containing private payload keys or values.
2. Reject chain anchor payloads containing raw memory, prompts, transcripts, completions, embeddings, ACL bodies, tenant names, provider responses, private keys, API keys, or seed phrases.
3. Minimize SIEM fields to identifiers, references, policy hashes, decisions, counts, timestamps, and verification status.
4. Route any content review to the customer-approved vault/eDiscovery path, not to proof artifacts or generic logs.
5. Record DLP decision references and classifier version/hash in audit evidence.

DLP evidence proves that a configured check ran and what decision it produced. It does not prove that every external system, human note, provider cache, or downstream copy is free of sensitive content.

## Retention, deletion, and legal hold

Retention policy must cover vault state, lifecycle receipts, proof packets, anchor batches, capability grants, revocations, benchmark attestations, gateway decisions, SIEM exports, eDiscovery exports, backups, and support artifacts.

Legal hold has priority over destructive deletion workflows for in-scope Enigma-managed memory records. If a delete/tombstone request targets held records, the expected outcome is a signed deny/error decision with legal-hold evidence and policy reference.

Deletion/tombstone receipts can evidence Enigma-mediated changes to active Enigma serving state. They do not prove deletion from model-provider systems, imported source systems, customer backups outside Enigma control, human notes, model weights, or unmanaged exports.

## KMS, BYOK, and signing custody

The control plane should integrate with customer-approved KMS/BYOK systems in BYOC/on-prem modes and operator-approved KMS/secrets management in hosted mode.

Key principles:

- Use envelope-encryption metadata and key references; do not export raw keys.
- Separate signing keys, encryption keys, API keys, backup keys, and break-glass credentials.
- Record key reference/version in evidence where needed.
- Rotate keys on approved schedules and after suspected exposure.
- Preserve historical public-key references needed for artifact verification.
- Require dual control or named approval for high-impact key operations.
- Keep seed phrases, private keys, API keys, and decrypted key material out of repositories, examples, SIEM events, and proof artifacts.

Solana-ready anchor payloads should be opaque commitments. The local planning command can produce `transaction_submitted:false` and `raw_memory_on_chain:false`; actual transaction submission requires a separate approved production path and must not be implied by the artifact.

## SIEM and audit event model

SIEM export should be useful for security review while remaining plaintext-minimized.

Recommended event fields:

| Field | Example shape |
| --- | --- |
| `event_type` | `gateway.decision`, `capability.grant`, `capability.revocation`, `anchor.batch`, `benchmark.attestation`, `policy.replay`, `legal_hold.deny` |
| `schema_id` | Public schema ID for the artifact or event. |
| `artifact_hash` | SHA-256 hash of canonical public-safe artifact JSON. |
| `tenant_ref` | Opaque tenant reference or tenant hash, never tenant display name. |
| `subject_ref` | Opaque user/service reference. |
| `policy_ref` | Policy version/hash/reference. |
| `decision` | `allow`, `deny`, `error`, `verified`, `failed`. |
| `scope_refs` | Opaque resource, region, provider, model, purpose, and sensitivity references. |
| `key_ref` | KMS/public-key reference/version, never raw key material. |
| `verification_status` | `pass`, `fail`, `error`, `not_run`. |
| `transaction_submitted` | `false` for local planning artifacts. |
| `raw_memory_on_chain` | `false`. |

SIEM export should not contain raw memory bodies, prompts, transcripts, completions, embeddings, document bodies, ACL bodies, full directory records, provider responses, secrets, or decrypted capsules.

## eDiscovery and records handoff

eDiscovery is the controlled path for authorized content review. It is separate from proof artifacts and SIEM.

A buyer-ready eDiscovery design should define:

1. who may request export,
2. legal basis or approval reference,
3. legal-hold interaction,
4. vault/source scope,
5. export format and destination,
6. KMS/BYOK encryption and recipient custody,
7. audit event fields,
8. retention and destruction schedule,
9. verifier output for related proof bundles,
10. explicit prohibition on placing export bodies in public proof artifacts or chain payloads.

Audit evidence may reference an eDiscovery export manifest hash and approval ID. It should not duplicate the exported content into proof-network artifacts.

## Policy replay

Policy replay lets a buyer answer: "Would this operation be allowed under a given policy version, and what evidence proves the answer?"

Replay inputs should be public-safe references:

- policy hash/reference,
- operation type,
- subject reference,
- resource/memory commitment,
- provider/model/tool references,
- region reference,
- purpose and sensitivity labels,
- legal-hold state reference,
- DLP classifier decision reference,
- timestamp or policy evaluation time.

Replay outputs should include:

- allow/deny/error decision,
- policy rule reference,
- policy version/hash,
- evaluator version/hash,
- input reference hash,
- timestamp,
- signer reference/signature,
- verifier status.

Policy replay is evidence about the configured Enigma policy evaluator. It is not a statement that the underlying model provider behaved in a particular way after receiving approved context.

## Proof-network artifacts in the control plane

| Artifact | Schema | Buyer use | Non-secret contents |
| --- | --- | --- | --- |
| Anchor batch | `enigma.proof_network.anchor_batch.v1` | Prepare local, Solana-ready root anchoring without submitting a transaction. | Roots, refs, counts, policy refs, opaque payload, `transaction_submitted:false`, `raw_memory_on_chain:false`. |
| Capability grant | `enigma.proof_network.capability_grant.v1` | Delegate scoped rights to a subject/service under a policy version. | Subject refs, scopes, expiry, policy hash, issuer/signature refs. |
| Capability revocation | `enigma.proof_network.capability_revocation.v1` | Invalidate a grant or class of grants. | Grant hash/ref, nullifier, reason code ref, issuer/signature refs. |
| Benchmark attestation | `enigma.proof_network.benchmark_attestation.v1` | Bind benchmark results to dataset, runner, package, and report hashes. | Dataset ref, runner ref, package ref, report hash, measurement refs, signatures. |
| Proof packet | `enigma.proof_network.packet.v1` | Bundle public-safe artifacts for offline verification and buyer review. | Artifact hashes, schema IDs, verifier refs, timestamps, signatures, no raw memory. |

The packet verifier should validate schema ID, required fields, canonical hashes, signature references where available, privacy guardrails, and supported artifact type. Verification should report pass/fail/error without reaching external networks.

## Benchmark attestations

Benchmark attestations help buyers distinguish reproducible Enigma-controlled measurements from marketing claims.

A buyer-ready attestation should bind:

- report hash or public-safe report file hash,
- dataset reference/hash,
- runner reference/hash,
- package reference/hash,
- environment reference,
- metric names and public-safe numeric summaries,
- verifier version/hash,
- timestamp,
- signer reference/signature.

Do not attest to benchmark leadership, production ROI, external assurance status, or third-party provider behavior unless the exact claim, method, evidence, and review status are separately approved.

## Audit evidence package

A buyer pilot should produce an evidence package containing:

1. deployment mode and responsibility matrix,
2. identity configuration references for SSO/SAML/SCIM and break-glass,
3. API-key inventory with key hashes/refs, owners, scopes, and rotation dates,
4. RBAC/ABAC policy versions and hashes,
5. DLP minimization decisions and rejected private-payload examples using synthetic safe data,
6. retention and legal-hold policy evidence,
7. KMS/BYOK key references and rotation evidence without key material,
8. SIEM event sample with minimized fields,
9. eDiscovery export manifest hash and approval reference, if exercised,
10. policy replay output for allow, deny, error, legal-hold-deny, DLP-deny, and unknown-region-deny cases,
11. proof-network artifacts and verifier output,
12. incident/break-glass drill evidence,
13. unresolved blockers with owners and dates,
14. explicit non-claims and legal/security review status for external statements.

## Buyer evaluation checklist

| Question | Expected architecture answer |
| --- | --- |
| Can we use our IdP? | Yes, via SSO/SAML where available, with SCIM provisioning where available and named break-glass controls. |
| Can service credentials be scoped and revoked? | Yes, API keys and service identities are scoped by environment/API/scope/expiry and represented in evidence by hashes/refs only. |
| Can authorization express business policy? | Yes, RBAC handles duties; ABAC evaluates operation, purpose, sensitivity, provider/model/tool, region, legal hold, retention, and key refs. |
| Can we prevent memory from entering public artifacts? | The proof generator and DLP gate must reject private keys/values and only emit hashes, roots, refs, counts, and signatures. |
| Can we prove what policy would have done? | Policy replay produces signed allow/deny/error evidence for a policy hash and public-safe input refs. |
| Can legal hold override deletion? | Yes, held records should produce signed deny/error evidence for destructive workflows. |
| Can our KMS/BYOK be referenced? | Yes, evidence records key refs/versions and signer refs without raw key material. |
| Can SIEM receive useful events? | Yes, minimized events carry schema IDs, artifact hashes, decisions, policy refs, key refs, and verifier status. |
| Can eDiscovery access content when authorized? | Yes, through a separate approved vault/eDiscovery workflow; proof artifacts reference manifest hashes instead of carrying content. |
| Does this submit to Solana? | Local planning artifacts do not submit transactions and explicitly set `transaction_submitted:false`. |
| Is raw memory on-chain? | No; anchor artifacts must set `raw_memory_on_chain:false` and carry only opaque commitments. |
| Is this an external assurance artifact? | No. External assurance statements require separate legal/security review, contracts, audit scope, and evidence. |

## Non-claims and required wording discipline

Approved posture:

- "Enigma can produce public-safe proof artifacts for Enigma-mediated memory policy decisions."
- "Enigma can prepare opaque anchor batches suitable for a Solana anchoring workflow without placing raw memory on-chain."
- "Enigma can export minimized SIEM and audit evidence for customer review."
- "In BYOC/on-prem deployments, customers can retain control of infrastructure, logs, KMS/BYOK, backups, residency, and operator access."

Do not claim without separate approved evidence:

- security, privacy, or industry assurance status,
- provider deletion or provider memory erasure,
- model forgetting or model-weight modification,
- complete absence of side channels,
- benchmark leadership or ROI guarantees,
- production hosted availability before acceptance evidence exists,
- transaction submission or on-chain finality from a local planning artifact.

## Reference pilot flow

1. Choose deployment mode and responsibility split.
2. Connect SSO/SAML and SCIM or document approved identity substitute.
3. Define RBAC roles and ABAC policy attributes.
4. Configure API-key scopes, owners, expiry, and rotation.
5. Configure DLP/private-payload rejection before proof generation and SIEM export.
6. Define retention, legal hold, eDiscovery, and evidence-retention rules.
7. Bind KMS/BYOK references for encryption/signing/backup where applicable.
8. Generate capability grant and revocation artifacts using public-safe refs.
9. Generate anchor batch artifacts with `transaction_submitted:false` and `raw_memory_on_chain:false`.
10. Generate benchmark attestation from report/dataset/runner/package refs, not raw report secrets.
11. Bundle artifacts into a proof packet and verify offline.
12. Export minimized SIEM events and audit evidence.
13. Replay policies for allow, deny, legal-hold-deny, DLP-deny, and unknown-attribute-deny cases.
14. Review non-claims and blockers before buyer-facing statements.

The result is a control-plane story an enterprise buyer can evaluate: identity-governed administration, scoped capabilities, privacy-preserving proof artifacts, local/offline verification, chain-ready commitments without transaction submission, and audit evidence that remains useful without leaking memory content.
