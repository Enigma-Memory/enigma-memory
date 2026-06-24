# Cloudflare token rotation and narrowing runbook

This runbook describes how an operator retires broad setup credentials and replaces them with narrow Cloudflare tokens for Enigma Pages, Workers, and zone operations. It contains no token values, account IDs, zone IDs, personal contact data, or live Cloudflare state.

Use this with `cloudflare-token-and-domain-runbook.md` and the generated token policy/request packets. The steps below are instructions for an approved operator; repository scripts and docs must not create accounts or mutate Cloudflare by themselves.

## Rotation goals

- Retire any broad setup token after domain, zone, Pages project, and Worker service setup is complete.
- Replace it with exact-account, exact-zone, exact-project, and exact-service scopes.
- Store token values only in an approved local secret manager or environment injection path.
- Keep a secret-free audit trail of who approved rotation, what scopes were intended, when old credentials were revoked, and which verification commands passed.

## Token set

| Token purpose | Minimum scope | Typical use |
| --- | --- | --- |
| Pages deploy | Exact Cloudflare account and exact Pages project; Pages edit plus account read if needed | Static site deployment from approved release job. |
| Pages observe | Exact Cloudflare account and exact Pages project; Pages read plus account read if needed | Deployment/status inspection without mutation. |
| Relay Worker deploy | Exact Cloudflare account and `enigma-relay` Worker service; Workers Scripts edit/read as needed | Relay Worker updates only. |
| Gateway Worker deploy | Exact Cloudflare account and `enigma-gateway` Worker service; Workers Scripts edit/read as needed | Gateway Worker updates only. |
| Hosted probe Worker deploy | Exact Cloudflare account and hosted probe Worker service; Workers Scripts edit/read as needed | Probe Worker updates only. |
| Zone/DNS manage | Exact zone only; DNS edit/read and zone read | DNS records and custom-domain attachment for the approved zone. |
| Read-only audit | Exact account/zone/project/service read permissions only | Evidence collection and incident review. |

Do not keep all-zone DNS permissions, all-account permissions, Registrar edit permissions, billing permissions, user-token edit permissions, or unrelated Workers permissions after setup unless a fresh written approval explains why they are still required.

## Dashboard steps

1. Open the Cloudflare dashboard while logged in as the approved operator.
2. Inventory existing API tokens by name, creation date, expiration, last-used signal when available, and visible permission summary. Do not copy token values.
3. Identify broad setup tokens used for domain, Pages, DNS, Registrar, or Workers setup.
4. Create replacement custom tokens with the minimum scopes in this runbook and the generated token policy packet.
5. Scope account resources to the exact Enigma account only.
6. Scope zone resources to the exact production zone only after the zone exists.
7. Scope Pages and Workers permissions to the exact project/service where Cloudflare supports that granularity; otherwise document the narrowest resource selector the dashboard allows.
8. Set an expiration date and IP restriction when the operator environment has stable egress.
9. Copy each token value once into the approved secret manager or environment injection path. Do not paste values into chat, tickets, docs, source files, screenshots, shell history, or generated evidence.
10. Verify the new token in the operations environment with a non-mutating check.
11. Switch deployment or monitoring jobs to the new secret reference.
12. Revoke the broad setup token.
13. Record a secret-free audit entry.

## API-assisted steps

If using the Cloudflare API instead of the dashboard:

- Use `/user/tokens/verify` or account token verification only to confirm the current token identity and validity.
- Use permission-group discovery to map dashboard permission names to Cloudflare permission group IDs.
- Generate request bodies with repository tooling where possible, then review before execution.
- Never print request headers, token values, or full environment dumps.
- Do not execute token creation, update, or revocation from an unattended repo script unless the operator has separately approved that mutating action.

Safe local helpers:

```sh
npm run cloudflare:token-policy -- --mode all --account-id <account-id> --project-name enigma-memory --domain enigmamemory.com
npm run cloudflare:token-request -- --permission-groups <permission-groups.json> --mode all --account-id <account-id> --project-name enigma-memory --domain enigmamemory.com --token-name <token-name>
```

The placeholders above are operator-supplied at runtime. Do not commit the resulting account-specific request body unless it has been reviewed and stripped of sensitive identifiers.

## Local secret storage

Approved storage patterns:

- OS credential manager or enterprise secret manager with access logging.
- CI/CD secret store scoped to the exact repository/environment/job that needs the token.
- Short-lived local shell environment for manual verification.

Disallowed storage patterns:

- Source files, docs, generated review packets, screenshots, chat, tickets, shell history captures, terminal transcripts, browser notes, or shared spreadsheets.
- `.env` files committed to source control.
- Reusing one deploy token for unrelated Pages, Workers, DNS, Registrar, analytics, and incident workflows.

## Audit trail

Record this metadata without token values:

- Rotation date/time.
- Operator or approver role.
- Token purpose and visible Cloudflare token name.
- Intended account/project/service/zone scope using internal references, not public docs.
- Permission names, access level, and expiration.
- Non-mutating verification command result reference.
- Revocation confirmation reference for the old broad setup token.
- Any exception to least-privilege scope and its expiry/review date.

The audit trail may point to a secret-manager item name or CI secret name, but it must not include the secret value.

## Emergency revoke

Use this path when a token may be exposed or over-scoped:

1. Stop any deployment or automation job that uses the suspect token.
2. Revoke the token in the Cloudflare dashboard or through an approved API workflow.
3. Rotate any downstream secret references that may have received the token.
4. Review recent Cloudflare activity for unexpected Pages, Workers, DNS, Registrar, or account changes.
5. Create a replacement token with narrower scope only after the incident owner approves reuse.
6. Record the revoke time, affected token purpose, verification reference, and follow-up owner without token values.

Do not wait for proof of misuse before revoking a token that was pasted into an unsafe location.
