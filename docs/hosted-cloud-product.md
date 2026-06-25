# Hosted cloud product contract

This document separates the hosted-cloud product contract surface from the external systems still required before Enigma can sell or operate a hosted cloud service.

## Production contract-ready now

The source package now has pure contract builders and validators in `packages/hosted-cloud/src/index.js` for:

- user account records;
- tenant records;
- hosted vault records;
- API key metadata records;
- usage billing records;
- dashboard summaries;
- backup drill records;
- incident and SLA reference records.

These functions are contract and validation code only. They do not call an auth provider, billing provider, cloud deployment, KMS, backup target, support desk, status page, SIEM, or model provider. They are safe to import as package code because they do not start servers, read user files, mutate deployment state, publish packages, or contact external accounts.

The validators enforce hosted-cloud boundaries:

- contract artifacts must include `operator_evidence_refs` for auth provider, billing provider, legal docs, data processing terms, support ownership, and external security review;
- missing operator evidence references are rejected;
- raw memory, plaintext prompts, provider responses, transcripts, credential-looking values, token values, private keys, and API key secret material are rejected;
- financial outcome claims, token ROI/profit claims, provider-side deletion claims, and model-forgetting claims are rejected;
- API key contracts store identifiers, fingerprints, scopes, rotation refs, and timestamps only, not key material;
- hosted vault contracts are opaque-record and plaintext-minimized contracts only;
- billing records remain contract records until an external billing provider invoice flow is wired.

Every builder emits `readiness.contract_ready: true` and `readiness.integration_kind: "contract_validator_only"`. It also emits `readiness.hosted_cloud_sellable: false` because contract readiness is not provider wiring, legal approval, security review, or operator go-live approval.

## Externally blocked before hosted cloud can be sold

Hosted cloud remains blocked until an operator wires and records evidence for all of the following:

| Blocker | Required before selling hosted cloud |
| --- | --- |
| Auth provider | A real auth provider, tenant/user lifecycle, access-control rules, session/token handling, rotation, revocation, and audit evidence. |
| Billing provider | A real billing provider, customer/subscription mapping, invoice lifecycle, tax/legal handling, dunning/refund policy, and reconciliation evidence. |
| Legal docs | Approved hosted terms, privacy notice, service descriptions, acceptable-use terms, retention/deletion language, and claim review. |
| Data processing terms | Approved DPA or equivalent data-processing terms, subprocessors, data residency, retention, deletion, legal hold, and customer notice process. |
| Support ownership | Named support owner, escalation policy, incident owner, response process, status communication process, and support tooling. |
| External security review | External security review or audit scope, remediation tracking, approval record, and release sign-off. |

A `provided` operator evidence ref means the contract can point to external evidence. It still does not by itself make hosted cloud sellable; an operator must complete the release checklist and issue go-live approval. A `blocked_external_dependency` ref is an explicit blocker, not fake evidence.

## Non-claims

Hosted cloud collateral must not say or imply:

- Enigma has live hosted cloud tenants before provider wiring and operator acceptance exist;
- Enigma has made any model or provider forget data;
- Enigma has provider-side deletion proof;
- Enigma guarantees ROI, profit, investment return, token price movement, or invoice savings;
- Enigma has SOC 2, HIPAA, GDPR, or other compliance certification unless separately audited and approved;
- local/package evidence, contract validation, static docs, or dashboard summaries are live service evidence.

Safe wording:

```text
Enigma has hosted-cloud contract builders and validators for account, tenant, vault, API key, billing, dashboard, backup drill, and incident/SLA records. Hosted cloud remains blocked until auth, billing, legal/data-processing terms, support ownership, external security review, and operator go-live evidence are complete.
```

Avoid wording:

```text
Enigma hosted cloud is ready to sell because the contracts exist.
```
