# Cloudflare token, domain, and hosting runbook

This runbook is for preparing Enigma Cloudflare Pages, DNS, and Cloudflare Registrar operations after the operator is logged in to Cloudflare. It is deliberately safe-by-default: verification, account listing, domain search/check, local public-site build, and local preflight are allowed; purchases, DNS mutations, Pages deploys, and custom-domain attachment require explicit operator execution.

Do not paste API tokens into chat, tickets, source files, shell history screenshots, or generated review packets. Store tokens only in the local shell environment or an approved local secret manager.

Operator checklist:

- [ ] Create the token in the Cloudflare dashboard with the exact account/zone permissions in this runbook.
- [ ] Confirm Cloudflare Registrar prerequisites: account ID, billing profile/default payment, default registrant contact, and Domain Registration Agreement.
- [ ] Store `CLOUDFLARE_API_TOKEN` only in the local environment; never paste or persist the token in chat, source, logs, review packets, or docs.
- [ ] Run token verify and accounts list before any domain or deploy operation.
- [ ] Search/check domains, then stop for exact domain plus exact current price approval.
- [ ] Keep registration and Pages deploy dry-run/plan-only unless the operator provides the required `--execute` approval.
- [ ] Execute registration only with exact domain, exact price, max-price, and charge-acknowledgement flags.
- [ ] Build and preflight the public site before Pages deploy.
- [ ] Attach the custom domain through Cloudflare Pages Custom domains/API/manual DNS and wait for active DNS/TLS status.
- [ ] Rotate the broad setup token to an exact-account/exact-zone token after the domain zone exists.

## 1. Account prerequisites

Before any Registrar API call, confirm the Cloudflare account has the prerequisites Cloudflare documents for domain registration:

- Cloudflare account ID for the account that will own the Pages project and domain.
- Billing profile with a valid default payment method.
- Default registrant contact configured on the account.
- Domain Registration Agreement accepted on the account registrations page.

Cloudflare dashboard paths, replacing `<ACCOUNT_ID>` with the real account ID:

- API tokens: `https://dash.cloudflare.com/<ACCOUNT_ID>/api-tokens`
- Billing/default payment: `https://dash.cloudflare.com/<ACCOUNT_ID>/billing/payment-info`
- Registrant contact and Domain Registration Agreement: `https://dash.cloudflare.com/<ACCOUNT_ID>/domains/registrations`

Domain registrations are billable to the account default payment method and are non-refundable after successful completion. Enigma operators do not execute registration without final explicit approval for the exact domain and exact price.

## 2. API token recipe

Create a custom Cloudflare API token in the dashboard. Use one short-lived setup token first, then rotate/narrow it after the final domain and zone exist.

Dashboard steps:

1. Open `https://dash.cloudflare.com/<ACCOUNT_ID>/api-tokens`.
2. Select **Create Token** -> **Create Custom Token** -> **Get started**.
3. Name the token, add the permissions below, and set account resources to include only the Enigma Cloudflare account.
4. For zone resources, use **Include - All zones** only for first setup; after the domain exists, create a replacement token narrowed to the exact zone.
5. Review the summary before creating the token and copy the value once into the local environment only.

Dashboard recipe:

| Token section | Permission | Resource scope | Why |
| --- | --- | --- | --- |
| Account | Cloudflare Pages: Edit / Pages Write | Include the Enigma Cloudflare account | Create/read/update Pages project and deployment settings. Cloudflare dashboard labels this `Cloudflare Pages: Edit`; API/tooling may surface the same write capability as `Pages Write`. |
| Account | Registrar: Edit / Registrar Write | Include the Enigma Cloudflare account | Search/check/register supported domains through Cloudflare Registrar. Cloudflare dashboard may label this `Registrar: Edit`; API/tooling may surface it as `Registrar Write`. |
| Account | Account Settings: Read / Account Read as needed | Include the Enigma Cloudflare account | Verify the token, list/read the account, and resolve account metadata without broader account mutation rights. |
| Zone | Zone: Read | Include all zones for first setup, or only the final zone after purchase | Discover the zone ID and validate the zone that receives the Pages custom-domain DNS record. |
| Zone | DNS: Edit | Include all zones for first setup, or only the final zone after purchase | Create/update the DNS record Cloudflare Pages requires for the custom domain. |

Use **All zones** only for first setup when the final zone does not exist yet or the automation must discover the zone created by Cloudflare Registrar. After the domain exists and the zone ID is known, revoke the broad setup token and create a narrower token scoped to the exact account and exact zone. Keeping an all-zone DNS token after setup expands blast radius unnecessarily.

Recommended token constraints:

- Give the token an obvious name such as `enigma-cloudflare-setup-YYYY-MM-DD`.
- Set an expiration date for setup work.
- Add client IP restrictions only if the operator's egress IP is stable.
- Do not grant Billing Edit, Account Settings Edit, User API Tokens Edit, Workers Edit, or unrelated zone/account permissions for this workflow.

## 3. Store credentials locally

Set environment variables in the shell that will run the checks. Do not commit these values.

PowerShell:

```powershell
$env:CLOUDFLARE_ACCOUNT_ID = "<ACCOUNT_ID>"
$env:CLOUDFLARE_API_TOKEN = "<TOKEN_VALUE>"
```

POSIX shell:

```sh
export CLOUDFLARE_ACCOUNT_ID="<ACCOUNT_ID>"
export CLOUDFLARE_API_TOKEN="<TOKEN_VALUE>"
```

If a final zone already exists, also keep the non-secret identifiers local:

```sh
export CLOUDFLARE_ZONE_NAME="example.com"
export CLOUDFLARE_ZONE_ID="<ZONE_ID>"
```

## 4. Verify token and account access

These checks do not purchase domains, deploy Pages, or mutate DNS.

Raw API checks:

```sh
curl "https://api.cloudflare.com/client/v4/user/tokens/verify" \
  --header "Authorization: Bearer $CLOUDFLARE_API_TOKEN"

curl "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/tokens/verify" \
  --header "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
```

The repository Cloudflare helper uses the same safe checks:

```sh
npm run cloudflare:ops -- token verify --account-id "$CLOUDFLARE_ACCOUNT_ID"
npm run cloudflare:ops -- registrar search --query enigma-memory --limit 1
```

A failed account-token verify or non-mutating registrar search means the token recipe, account scope, account ID, or environment variable setup is wrong. Fix that before any deploy, DNS, or billable registration step.

## 5. Search and check candidate domains

Search is only discovery. Cloudflare notes that search can use cached data, so always run a real-time check immediately before registration.

Raw API examples:

```sh
curl --request GET \
  --url "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/registrar/domain-search?q=enigma%20memory&limit=10" \
  --header "Authorization: Bearer $CLOUDFLARE_API_TOKEN"

curl --request POST \
  --url "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/registrar/domain-check" \
  --header "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  --header "Content-Type: application/json" \
  --data '{"domains":["example.dev"]}'
```

Repository helper equivalents:

```sh
npm run cloudflare:ops -- registrar search --query "enigma memory" --limit 10
npm run cloudflare:ops -- registrar check --domain example.dev
```

Stop if the check response says the domain is unavailable, unsupported, premium without explicit fee acknowledgement, or has a price/currency the operator has not approved.

## 6. Registrant contact prerequisite

Cloudflare Registrar requires either an account default registrant contact or an inline contact on the registration request. Keep contact files local-only and out of source, review packets, logs, tickets, and chat transcripts.

Local inline contact shape:

```json
{
  "email": "registrant@example.com",
  "phone": "+1.5555555555",
  "postal_info": {
    "name": "Registrant Name",
    "organization": "Optional Organization",
    "address": {
      "street": "123 Main St",
      "city": "Austin",
      "state": "TX",
      "postal_code": "78701",
      "country_code": "US"
    }
  }
}
```

The helper accepts `--registrant-contact-json <path>` and redacts contact body fields from command output. Do not commit the file.

## 7. Billable registration approval gate


Registration is a hard stop. The operator must approve all of the following in the same final instruction before any registration call:

- Exact domain name, including TLD.
- Exact registration cost and currency from the latest real-time check response.
- Renewal cost if returned by the check response.
- Confirmation that the Cloudflare account default payment method may be charged.
- Confirmation that successful registrations are billable and non-refundable.

Do not treat vague approval such as "buy it", "looks good", or "proceed" as enough. The approval must name the same domain and price the command will confirm.

The repository helper prints a dry-run registration plan unless `--execute` is present:

```sh
npm run cloudflare:ops -- registrar register \
  --domain example.dev \
  --max-price-usd 10.11 \
  --confirm-domain example.dev \
  --confirm-registration-cost 10.11 \
  --registrant-contact-json "$HOME/.enigma/cloudflare-registrant-contact.json" \
  --i-understand-this-charges-my-payment-method
```

After final approval, the execution command must include the same exact confirmation flags plus `--execute`:

```sh
npm run cloudflare:ops -- registrar register \
  --domain example.dev \
  --max-price-usd 10.11 \
  --confirm-domain example.dev \
  --confirm-registration-cost 10.11 \
  --registrant-contact-json "$HOME/.enigma/cloudflare-registrant-contact.json" \
  --i-understand-this-charges-my-payment-method \
  --execute
```

Use the latest checked price for `--confirm-registration-cost` and set `--max-price-usd` to the operator-approved ceiling. If the returned price is higher, missing, in a different currency, or not identical to the confirmation, stop instead of registering.

Do not use raw `curl` as the normal operator-assisted purchase path because it bypasses the Enigma confirmation flags. If a human operator deliberately uses the Cloudflare Registrar API directly, they must still record the exact domain, current checked price, non-refundable/billable acknowledgement, and final approval before calling `POST /accounts/{account_id}/registrar/registrations` with `{"domain_name":"<domain>"}` from their own controlled shell.

Treat both `201 Created` and `202 Accepted` as expected registration responses. If Cloudflare returns `action_required` or `failed`, stop and surface the required user action or error; do not retry in a loop.

## 8. Build and preflight the public site before deploy

Cloudflare deployment should use a generated public artifact, not raw internal/staging source. Build and inspect the public artifact first when the static site package is present:

```sh
python scripts/build_public_site.py
python scripts/preflight_public_site.py --site _public_site
```

The preflight is local and credential-free. It does not prove Cloudflare deployment, DNS/TLS, cache state, or live availability.

## 9. Deploy Cloudflare Pages

Pages deploys must also be dry-run/plan-only by default. Do not upload assets unless the operator explicitly asks for deployment after local build/preflight review.

If using Wrangler manually after explicit deployment approval:

```sh
npx wrangler pages deploy _public_site --project-name enigma-memory
```

The repository helper prints the deployment plan without mutating Cloudflare when `--execute` is omitted:

```sh
npm run cloudflare:ops -- pages deploy --project-name enigma-memory --site _public_site
```

After explicit deployment approval, add `--execute`:

```sh
npm run cloudflare:ops -- pages deploy --project-name enigma-memory --site _public_site --execute
```

Record the generated `*.pages.dev` preview URL for review. A Pages preview URL is not final publication and does not close domain/DNS/TLS acceptance blockers.

## 10. Attach the custom domain

After registration or external domain control is complete:

1. Confirm the domain appears as a Cloudflare zone in the same account, or confirm the external registrar/DNS path.
2. In Cloudflare dashboard, open **Workers & Pages** -> `enigma-memory` -> **Custom domains** -> **Set up a domain**.
3. Add the canonical host, for example `example.com`, `www.example.com`, or `launch.example.com`.
4. Let Cloudflare create/confirm the DNS record, or manually create the requested DNS/CNAME record at the authoritative DNS provider.
5. Wait for custom-domain status and SSL/TLS certificate status to become active.
6. Verify HTTPS loads without certificate warnings and routes only to public/review-safe assets.

For an apex host such as `example.com`, Cloudflare Pages expects the domain to be a Cloudflare zone in the same account before attachment. For a subdomain managed by external DNS, create the CNAME Cloudflare requests, but still complete the Pages **Custom domains** association; adding only a DNS CNAME without associating the hostname to the Pages project can fail.

API-based custom-domain or DNS mutation follows the same rule as registration and deploy: plan by default, execute only with an explicit mutation flag and exact target host. The Pages custom-domain API endpoint is `POST /accounts/{account_id}/pages/projects/{project_name}/domains` with body `{"name":"<host>"}`; do not call it until the operator has approved the exact host.

## 11. Post-setup rotation

After the domain and zone are known:

- Revoke the broad all-zone setup token.
- Create a narrower token scoped to the exact account and exact zone.
- Remove Registrar Write/Edit from routine deploy tokens unless future domain registrations are intentionally planned.
- Keep separate tokens for routine Pages deployment and rare Registrar/DNS setup when possible.
- Record token owner, expiry, and rotation date in the operator acceptance packet without recording the token value.

## 12. What remains blocked until operator approval

- Domain registration purchase.
- DNS record mutation.
- Pages upload/deploy.
- Pages custom-domain attachment.
- Public announcement or hosted/BYOC live claim.

These remain blocked until the operator supplies the exact account/domain/price/deploy target, explicitly approves the billable or mutating operation, and completes the hosted/BYOC evidence in `operator-acceptance-packet.md`.