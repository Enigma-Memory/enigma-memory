# Enterprise BYOC operations runbook

Audience: enterprise security, platform, infrastructure, legal/privacy, records, and Enigma solutions teams preparing a customer-controlled deployment.

Purpose: define the operating contract for Bring Your Own Cloud (BYOC) deployments of Enigma relay, witness, gateway, verifier, and vault-adjacent services without overclaiming compliance or provider behavior.

Claim boundary: Enigma evidence covers Enigma-mediated vault state, signed receipts, receipt chains, checkpoints, relay records, witness checkpoints, gateway decisions, and policy evidence. It does not prove provider deletion, model forgetting, factual truth, complete side-channel absence, imported-source completeness, or legal compliance status.

Compliance boundary: do not claim SOC 2, HIPAA, GDPR, industry certification, regulatory compliance, or compliance status unless the exact claim, scope, evidence, contracts, and audit status have been approved by legal and security. Do not claim provider deletion certification or model forgetting.

Required live-readiness artifact: complete [`operator-acceptance-packet.md`](operator-acceptance-packet.md) for the exact hosted/BYOC tenant and environment before calling the deployment live. The packet records required inputs, named owners, evidence, go/no-go status, rollback, backup/restore, incident drill, KMS/secrets, TLS/domain, durable storage, SIEM/log minimization, support/SLA, legal/compliance approval status, and external blockers.

## 1. Deployment modes

| Mode | Operator | Infrastructure control | Keys/logs/SIEM | Availability claim boundary |
| --- | --- | --- | --- | --- |
| Hosted | Enigma or approved operator | Enigma/operator cloud account | Enigma/operator-controlled unless contract says otherwise | Do not market as live until domain, TLS, durable storage, KMS/secrets, monitoring, backups, support, and incident response are in production. |
| BYOC | Customer | Customer cloud, VPC, cluster, or private network | Customer-controlled KMS/BYOK, logs, SIEM, backups, residency, and access | Customer accepts infrastructure readiness with Enigma deployment guidance and evidence artifacts. |
| On-prem / air-gapped | Customer | Customer data center or isolated environment | Customer-controlled keys, logs, package distribution, backups, and verifier workflow | Requires a separate support/update/offline-operations plan before any production claim. |

Provider-native memory is cache only in all enterprise modes. The Enigma vault or customer-controlled vault path is the canonical system of record for Enigma-managed durable memory. Context sent to providers or tools is scoped operational context, not proof that providers deleted, retained, or forgot anything.

## 2. Reference roles

- **Vault:** customer-controlled canonical memory state and lifecycle receipts.
- **Gateway:** evaluates tenant policy for declared operations and signs allow/deny decisions. It does not call model providers.
- **Relay:** carries opaque encrypted records/checkpoints and must reject plaintext-looking memory fields.
- **Witness:** records checkpoint evidence and ordering metadata; it must not receive raw memory plaintext.
- **Verifier:** checks proof bundles offline and reports pass/fail/error states.
- **SIEM/eDiscovery export:** receives minimized event metadata for review workflows, not raw memory bodies.

Raw memory plaintext, prompt text, transcripts, conversation bodies, completion bodies, embeddings, ACL bodies, and customer secrets must not appear in receipts, relay records, witness checkpoints, SIEM events, public proof artifacts, public roots, or support tickets.

## 3. Pre-deployment intake

Record these decisions before provisioning:

1. Tenant owner, security owner, legal/privacy owner, infrastructure owner, incident commander, and support escalation path.
2. Deployment mode: hosted, BYOC, or on-prem/air-gapped.
3. Regions, data residency requirements, network boundaries, and prohibited regions.
4. Permitted providers, models, tools, purposes, sensitivity labels, and operations.
5. Source systems and data classes approved for memory.
6. Legal hold, retention, deletion/tombstone, export, and records requirements.
7. KMS/BYOK ownership, key rotation expectations, break-glass rules, and audit logging.
8. SIEM/eDiscovery destinations and field-minimization requirements.
9. Backup/restore requirements, restore rehearsal cadence, and retention of proof bundles.
10. Acceptance-test owner and evidence repository.

If the customer requests compliance certification language, stop and route to legal/security review before producing external copy. If the customer requests provider deletion certification or model-forgetting language, decline the claim and restate the proof boundary.

Create the operator acceptance packet during intake. If any required customer-owned infrastructure, credential, owner, approval, or rehearsal evidence is missing, keep the packet decision at blocked/no-go and describe readiness as local/package/demo plus runbook only.

## 4. Network policy

### Ingress

- Allow inbound traffic only from approved customer networks, load balancers, private endpoints, or identity-aware proxies.
- Terminate TLS at the approved boundary with customer-managed certificates or approved managed certificates.
- Expose gateway, relay, verifier, admin, and health endpoints only on the required network planes.
- Protect admin routes with SSO/RBAC or customer-approved privileged access controls.
- Disable public ingress unless the signed deployment design explicitly requires it.

### Egress

- Default-deny egress except for approved KMS, identity, logging/SIEM, monitoring, package/update, storage, and optional provider endpoints.
- Gateway policy decisions should be made before approved context reaches a provider or tool.
- Relay and witness components should not need model-provider egress for normal operation.
- Log every egress exception with purpose, owner, destination, region, and review date.

## 5. Tenant policy lifecycle

1. Draft policy with provider, model, region, operation, purpose, sensitivity, subject, tenant, legal-hold, and memory-address rules.
2. Review policy with security and workflow owner.
3. Version policy and record policy hash/reference in gateway decisions.
4. Apply policy through the approved admin process.
5. Test allow, deny, legal-hold-delete-deny, unknown-provider-deny, unknown-region-deny, and unknown-purpose-deny cases.
6. Export policy evidence and verifier output to the evidence repository.
7. Review changes on a defined cadence and after incidents or material workflow changes.
8. Roll back only through the same approved change path, preserving previous policy evidence.

Default posture: fail closed on unknown providers, models, regions, purposes, sensitivities, operations, tenant IDs, and legal-hold states.

## 6. KMS/BYOK and secrets

- Customer owns KMS/BYOK configuration in BYOC and on-prem modes.
- Store secrets outside the repository and outside proof artifacts.
- Use envelope-encryption metadata where needed; do not export raw keys.
- Rotate keys on the customer-approved schedule and after suspected exposure.
- Record key version or key-management reference in evidence where available, without exposing secret material.
- Break-glass access must require named approval, short duration, logging, and post-access review.

## 7. SIEM and event minimization

SIEM events should include only operational metadata needed for review, such as receipt ID, event type, timestamp, tenant, subject reference, policy version/hash, gateway decision, provider/model/region labels, sensitivity label, memory address/commitment, component, and verification status.

SIEM events must not include raw memory plaintext, prompts, transcripts, completions, embeddings, full documents, source ACL bodies, secrets, or decrypted capsules. If a reviewer needs content, use the customer-approved vault/eDiscovery path under the retention and legal-hold process, not the generic SIEM feed.

## 8. Data residency

- Pin storage, backups, logs, SIEM export, and witness/relay persistence to approved regions.
- Treat cross-region replication as a policy decision requiring security/legal review.
- Record residency constraints in tenant policy and deployment evidence.
- Verify that support access, diagnostic bundles, and backup restores do not move regulated data outside approved regions.

## 9. Legal hold, retention, and deletion

- Legal hold must block destructive Enigma deletion/tombstone workflows for in-scope records.
- Deletion/tombstone receipts prove Enigma-mediated changes to active Enigma serving state; they do not prove provider deletion, backup deletion, external-system deletion, human forgetting, or model-weight forgetting.
- Retention schedules must define vault state, proof bundles, SIEM exports, gateway decisions, relay records, witness checkpoints, backups, and support artifacts.
- Evidence exports under legal hold must preserve receipt chains and verifier output.

## 10. Backup and restore

- Back up customer-approved vault state, receipt/proof bundles, policy versions, gateway decisions, relay/witness persistence, configuration, and deployment manifests as applicable.
- Encrypt backups with customer-approved KMS/BYOK controls.
- Keep backup logs plaintext-minimized.
- Rehearse restore before production acceptance and after material deployment changes.
- Restore acceptance requires successful verifier checks for restored proof bundles and policy evidence.

## 11. Incident response

Trigger incident response for private key leakage, release credential compromise, raw memory in receipts, relay/witness/SIEM/public proof artifacts, gateway policy bypass, verifier false positives/negatives, plaintext relay acceptance, unauthorized operator access, data residency breach, restore failure, or customer-reported data exposure.

Minimum incident steps:

1. Assign incident commander and preserve evidence.
2. Stop affected claim or workflow if the boundary may be unsafe.
3. Revoke or rotate affected credentials/keys through the approved process.
4. Preserve receipts, policy versions, gateway decisions, logs, and proof bundles needed for review.
5. Notify customer security/legal contacts under the contract and incident policy.
6. Patch, validate, and document scope before restoring public or customer-facing claims.
7. Produce a post-incident report with observed facts only.

## 12. Operator access

- Use least privilege and named accounts.
- Require SSO/MFA where available.
- Separate deploy, admin, support, and break-glass roles.
- Log privileged actions to customer-approved audit logs.
- Do not access customer memory plaintext unless the customer-approved support/legal path explicitly authorizes it.
- Time-bound all emergency access and review it after use.

## 13. Acceptance tests

A BYOC or on-prem pilot is not operationally ready until the customer stores evidence for these tests and the operator acceptance packet records a go decision:

| Test | Expected evidence |
| --- | --- |
| Deployment mode review | Signed mode decision: hosted, BYOC, or on-prem/air-gapped, with responsibility matrix. |
| Ingress policy | Only approved endpoints are reachable from approved networks. |
| Egress policy | Unauthorized provider/region/logging egress is blocked or absent; approved egress is documented. |
| Tenant policy allow | Known-good request receives signed allow decision with policy reference. |
| Tenant policy deny | Unknown provider/model/region/purpose/sensitivity/operation fails closed with signed deny/error evidence. |
| Legal hold | Delete/tombstone request for held memory is denied with legal-hold evidence. |
| KMS/BYOK | Key reference/version appears in approved metadata; no raw key material appears in artifacts. |
| Relay plaintext rejection | Relay rejects payloads containing plaintext-looking memory fields and accepts opaque encrypted record metadata. |
| Witness minimization | Witness checkpoint contains checkpoint/order metadata only, not raw memory plaintext. |
| SIEM minimization | SIEM export contains receipt/policy/decision metadata and no raw memory plaintext, prompts, transcripts, completions, embeddings, or secrets. |
| Offline verification | Exported proof bundle verifies offline with expected pass/fail/error behavior. |
| Data residency | Storage, backups, logs, SIEM, and witness/relay persistence are confined to approved regions or documented exceptions. |
| Backup restore | Restore rehearsal succeeds and restored proof bundles verify. |
| Operator access | Privileged access uses named accounts, least privilege, logging, and approved break-glass flow. |
| Incident drill | Incident commander, contacts, evidence preservation, communications, and remediation path are exercised. |
| Claim review | Security/legal approve external compliance statements; no SOC 2, HIPAA, GDPR, certification, or regulatory status claim is made without approved evidence and scope; no provider deletion or model forgetting claim is made. |

## 14. Pilot exit packet

The pilot exit packet should contain:

- deployment mode and responsibility matrix,
- network policy summary,
- tenant policy versions and hashes/references,
- KMS/BYOK and key-version evidence without key material,
- gateway allow/deny/legal-hold examples,
- relay/witness plaintext-minimization evidence,
- SIEM/eDiscovery export sample with raw memory removed,
- verifier output,
- data residency and backup/restore evidence,
- incident drill notes,
- operator access review,
- explicit proof boundaries and non-claims,
- unresolved production blockers and owner/date for each blocker,
- completed operator acceptance packet with go/no-go decision and external blockers.
