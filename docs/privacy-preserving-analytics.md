# Privacy-preserving analytics runbook

This runbook defines the only analytics posture approved for Enigma public and hosted surfaces. It is intentionally conservative: count aggregate behavior needed to operate the product, avoid identity reconstruction, and keep memory/provider payloads out of analytics entirely.

## Allowed collection

Allowed metrics are aggregate counters and coarse operational dimensions:

- Page view counts by normalized route, documentation section, referrer category, user-agent family, coarse country/region when supplied by the edge provider, and day/hour bucket.
- Static asset error counts by route and status class.
- Allowlisted product events that do not include memory, prompt, provider, account, tenant, or credential payloads.
- Monitor and deploy evidence references by artifact name/checksum only, not raw logs or operator identity.

Do not collect raw request bodies, memory text, prompts, completions, embeddings, provider responses, capsules, vault records, account IDs, API tokens, cookies, session IDs, email addresses, phone numbers, or exact IP addresses.

## Collection rules

- No cookies, localStorage identifiers, advertising IDs, tracking pixels, cross-site identifiers, or fingerprinting.
- No raw IP retention. If the analytics provider exposes IP addresses, configure edge-side anonymization or discard before storage.
- Respect Do Not Track and Global Privacy Control. When either signal is present, skip optional analytics and record only service-critical security/availability events required to operate the site.
- Do not enrich events with external identity graphs, reverse-IP company lookup, precise geolocation, or device fingerprint libraries.
- Use route templates instead of full URLs when query strings could contain user input. Strip query strings and fragments before aggregation.
- Do not add analytics scripts to the public website unless the privacy review approves the exact vendor, configuration, and opt-out behavior.

## Event allowlist

Every event must be reviewed before production use and must fit this shape:

```json
{
  "event": "docs_page_view",
  "route": "/docs/install",
  "surface": "public_docs",
  "bucket": "hour",
  "count": 1
}
```

Approved event names:

| Event | Required dimensions | Forbidden dimensions |
| --- | --- | --- |
| `public_page_view` | route, day/hour bucket | full URL, IP, cookie, user ID |
| `docs_page_view` | route, docs section, day/hour bucket | prompt text, memory text, account ID |
| `download_click` | artifact type, route, day/hour bucket | email, exact filename when private, token |
| `endpoint_status_rollup` | endpoint name, status class, day/hour bucket | response body, headers, account ID |
| `install_doc_step_view` | step id, route, day/hour bucket | local path, shell history, user identity |

Any new event requires a written privacy review that lists the event name, purpose, dimensions, retention, and proof that no personal data, memory payload, prompt, provider payload, or credential value is collected.

## Opt-out and user controls

- Publish an opt-out path in the privacy notice before analytics is enabled.
- Honor browser DNT and GPC automatically without requiring an account.
- If a site-level opt-out is implemented, store only a first-party boolean preference and do not turn it into a tracking identifier.
- Do not degrade core documentation or install flows for opted-out users.

## Retention

- Keep raw aggregate event rows for no longer than 30 days unless legal/privacy approval sets a shorter period.
- Keep daily rollups for operational trend review for no longer than 13 months.
- Delete or re-aggregate dimensions that become too sparse to stay anonymous.
- Do not export analytics data to spreadsheets, tickets, demos, or review packets unless it has been aggregated and checked for small-count re-identification risk.

## Review checklist

- [ ] Collection is no-cookie and no-fingerprinting.
- [ ] DNT and GPC are respected.
- [ ] Raw IP addresses are not retained.
- [ ] Event names and dimensions are on the allowlist.
- [ ] Query strings, fragments, request bodies, memory, prompts, provider responses, and credentials are excluded.
- [ ] Opt-out behavior is documented and tested before launch.
- [ ] Retention matches this runbook.
- [ ] Public claims describe aggregate analytics only and do not imply compliance certification.
