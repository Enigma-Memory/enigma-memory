# Hosted cloud product contract

This document separates the hosted-cloud product contract surface from the external systems still required before Enigma can sell or operate a hosted cloud service.

## Production contract-ready now

The source package now has pure contract builders and validators in `packages/hosted-cloud/src/index.js` for:

- user account records;
- tenant records;
- hosted vault records;
- API key metadata records;
- API key lifecycle packets for issue/rotate/revoke/audit readiness;
- usage billing records;
- dashboard summaries;
- backup drill records;
- incident and SLA reference records;
- customer lifecycle packets that aggregate those surfaces for launch-readiness evidence.

These functions are contract and validation code only. They do not call an auth provider, billing provider, cloud deployment, KMS, backup target, support desk, status page, SIEM, or model provider. They are safe to import as package code because they do not start servers, read user files, mutate deployment state, publish packages, or contact external accounts.

The lifecycle packet public APIs are `buildCustomerLifecyclePacket(input)` / `validateCustomerLifecyclePacket(packet)` and `buildApiKeyLifecyclePacket(input)` / `validateApiKeyLifecyclePacket(packet)` under `enigma-memory/hosted-cloud`; the script commands below emit the same schemas for release evidence.

The validators enforce hosted-cloud boundaries:

- contract artifacts must include `operator_evidence_refs` for auth provider, billing provider, legal docs, data processing terms, support ownership, and external security review;
- missing operator evidence references are rejected;
- raw memory, plaintext prompts, provider responses, transcripts, credential-looking values, token values, private keys, and API key secret material are rejected;
- financial outcome claims, token ROI/profit claims, provider-side deletion claims, and model-forgetting claims are rejected;
- API key contracts store identifiers, fingerprints, scopes, rotation refs, and timestamps only, not key material;
- API key lifecycle packets store issue/rotate/revoke/audit evidence refs, event refs, fingerprints, opaque subjects, readiness status, and operator approval refs only; they reject raw key material, provider payloads, customer memory, plaintext prompts, credentials, ROI claims, provider-deletion claims, and model-forgetting claims;
- hosted vault contracts are opaque-record and plaintext-minimized contracts only;
- billing records remain contract records until an external billing provider invoice flow is wired.

Individual surface builders emit `readiness.contract_ready: true`, `readiness.integration_kind: "contract_validator_only"`, and `readiness.hosted_cloud_sellable: false` because contract readiness is not provider wiring, legal approval, security review, or operator go-live approval. A customer lifecycle packet may only mark `hosted_cloud_sellable: true` when every lifecycle surface has a provided evidence ref and an explicit operator go-live approval ref is supplied; the packet remains evidence validation, not live hosted SaaS or provider wiring. An API key lifecycle packet keeps `customer_api_keys_live:false` by default and can become live-ready only when every required issue/rotate/revoke/audit evidence ref is provided and an operator approval ref is supplied. That live-ready state is still evidence validation only: it does not issue a customer API key, create a secret, call an auth provider, rotate/revoke a provider credential, or prove provider-side deletion.

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

Hosted relay/gateway readiness is a separate backend health boundary, not hosted-cloud sellability. Operators may validate the backend path with `npm run production:hosted-collect` followed by `npm run production:hosted-live`, but those commands only prove public HTTPS relay/gateway probes and required hosted refs for the named environment. They do not wire auth, billing, legal terms, support, security review, customer lifecycle, API key lifecycle, or operator SaaS go-live approval.

## Consolidated unblocker report

Before treating hosted cloud as sellable, run the consolidated public-safe unblocker report:

```sh
npm run production:unblocker -- --out .enigma/production-unblocker.json
```

The report emits `enigma.production_unblocker.v1` with hosted cloud, Solana proof rail, benchmark claim, installer distribution, npm install, and monitoring/ops status in one place. It is dry-run/planning by default, requires no credentials, and does not create accounts, deploy infrastructure, submit transactions, call providers, or mutate external systems. Hosted cloud should remain `blocked_external_dependency` until real external provider evidence and operator go-live approval exist.

## Customer lifecycle packet

`npm run production:hosted-customer -- --tenant <id> --domain <domain> --environment <env> --out <file>` builds `enigma.hosted_cloud.customer_lifecycle_packet.v1` readiness evidence for a tenant launch packet. Operators may pass repeatable `--evidence-ref <key=status:ref>` values and `--operator-go-live-ref <ref>` when real external evidence exists. The command writes public-safe validation evidence only: it creates no hosted account, tenant, vault, API key, invoice, support ticket, backup, Cloudflare resource, provider resource, secret, or deployment.

The lifecycle packet records lifecycle phases, required surfaces, external blockers, missing evidence refs, no-secret/no-plaintext guarantees, and the sellability gate. Missing surfaces, blocked evidence refs, or absent operator go-live approval keep `hosted_cloud_sellable:false`.

## API key lifecycle packet

`npm run production:hosted-api-key -- --tenant <id> --subject <opaque-subject-ref> --operation <issue|rotate|revoke|audit> --out <file>` builds `enigma.hosted_cloud.api_key_lifecycle_packet.v1` readiness evidence for one customer API key lifecycle operation. Operators may pass repeatable `--evidence-ref <phase=status:ref>` values for the phases required by that operation, plus `--operator-approval-ref <ref>` when a reviewed operator approval exists.

The command writes public-safe validation evidence only. It must not receive or print raw API keys, bearer tokens, credentials, provider response bodies, plaintext prompts, raw memory, customer content, financial ROI claims, provider deletion claims, or model forgetting claims. It creates no hosted account, customer API key, provider secret, KMS key, rotation job, revocation job, audit export, invoice, support ticket, Cloudflare resource, provider resource, or deployment.

The packet records lifecycle events, required evidence refs, missing evidence refs, malformed operation blockers, the operator approval ref, readiness status, `customer_api_keys_live`, and no-secret/no-plaintext guarantees. Missing evidence refs, blocked evidence refs, malformed operation surfaces, or absent operator approval keep `customer_api_keys_live:false`.

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
