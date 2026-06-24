# Live endpoint monitoring runbook

This runbook covers synthetic checks for the public site, relay `/readyz`, and gateway `/readyz`. It does not deploy infrastructure, mutate Cloudflare state, create accounts, or prove future availability.

The repository monitor is dependency-free and public-safe:

```sh
npm run production:live-monitor:help
npm run production:live-monitor:dry-run
```

The dry run validates the configured endpoint set and emits skipped results without network probes. Operators may run `npm run production:live-monitor` only from an approved operations environment when live probes are intended.

## Default checks

| Endpoint | Default URL | Success signal | Notes |
| --- | --- | --- | --- |
| Public site | `https://enigmamemory.com/` | HTTP 200 | Static site availability only; not hosted backend proof. |
| Relay readiness | `https://relay.enigmamemory.com/readyz` | HTTP 200 | Readiness should fail closed when required production evidence or dependencies are absent. |
| Gateway readiness | `https://gateway.enigmamemory.com/readyz` | HTTP 200 | Readiness should fail closed when required production evidence or dependencies are absent. |

Configured endpoints must use HTTPS and must not include credentials, query strings, fragments, localhost, link-local, or private-network hosts.

## Cadence

- Public site: every 1 minute from at least two regions after launch.
- Relay `/readyz`: every 1 minute for production, every 5 minutes for staging or pre-production.
- Gateway `/readyz`: every 1 minute for production, every 5 minutes for staging or pre-production.
- Deep synthetic transaction checks, if added later, must be opt-in and must not send memory, prompt, provider, tenant, or credential payloads.

Use jitter where supported to avoid synchronized thundering-herd probes. Do not run probes from developer laptops as the primary monitor.

## SLO-style thresholds

Initial thresholds are operational targets, not customer-facing guarantees:

| Signal | Warning | Page/incident |
| --- | --- | --- |
| Availability | One failed check from one region | Two consecutive failed checks from two regions, or five minutes of failures from any critical endpoint |
| Latency | p95 above 750 ms for 10 minutes | p95 above 1500 ms for 10 minutes, or timeout rate above 2% for 10 minutes |
| Readiness | Any `/readyz` non-200 after deployment | `/readyz` non-200 for five minutes after rollback window or on both relay and gateway |
| Evidence freshness | Last secret-free monitor artifact older than 24 hours | Last artifact older than 48 hours during active production operations |

Do not describe these thresholds as contractual SLA terms unless legal and support approval separately approve customer-facing language.

## Alert routing

- Public site failures route to the web/on-call operator first, then release owner if the failure follows a deploy.
- Relay/gateway readiness failures route to backend/on-call first, then storage/KMS/network owners based on the readiness subcheck shown in internal logs.
- Privacy or payload-leak findings route to security/privacy owner immediately and pause analytics or monitoring exports until reviewed.
- Keep alert messages secret-free: endpoint name, status class, latency bucket, monitor region, timestamp, and evidence artifact path/checksum are enough.

Alerts must not include response bodies, cookies, authorization headers, account IDs, API tokens, prompts, memory records, provider responses, or raw logs.

## Evidence artifacts

The monitor emits JSON with:

- schema and generation time;
- dry-run flag and timeout;
- endpoint name, URL, method, expected status, observed status, latency, and safe error code;
- summary counts;
- claim boundaries.

By default the JSON does not include response bodies. `--safe-summary` may include a small allowlisted JSON summary such as `ok`, `service`, and check counts; it still must not include raw payloads.

Recommended operator command for a timestamped artifact:

```sh
npm run production:live-monitor -- --out ./.enigma/live-endpoint-monitor.json
```

Before sharing an artifact, confirm it contains no response bodies, credentials, account IDs, cookies, raw IP addresses, prompts, memory payloads, provider payloads, or local absolute paths.

## Incident handling

1. Confirm whether the failure is single-region, multi-region, or local to the monitoring provider.
2. Compare public site status separately from relay/gateway readiness; do not treat static-site success as backend readiness.
3. Inspect internal service logs in the approved operations environment without copying secrets into tickets or public artifacts.
4. Roll back or disable traffic only through approved deploy controls; the monitor script itself performs no mutations.
5. Save a secret-free monitor artifact after mitigation and link it from the incident record by path/checksum.
