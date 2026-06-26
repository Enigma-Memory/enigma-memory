# Enigma Memory — Local Production Simulation

**CLAIM BOUNDARY:** This is a `local-simulation` environment. It uses
self-signed TLS, bind-mounted file "secrets", a mocked KMS, and a mocked SIEM.
It is **not** a production deployment and must not be used as go-live evidence.

## Public-looking domain (local testing only)

The simulation is configured to answer on `sim.enigmamemory.com` so that the
hosted-backend live validator accepts the non-localhost HTTPS probe URLs. For
real go-live evidence the operator must point the chosen public domain at the
deployment's public IP address; the local simulation uses a hosts-file or local
DNS trick instead.

On the host running Docker, map the domain to the loopback interface:

```text
127.0.0.1 sim.enigmamemory.com relay.sim.enigmamemory.com gateway.sim.enigmamemory.com
```

On Linux/macOS add that line to `/etc/hosts`; on Windows add it to
`C:\Windows\System32\drivers\etc\hosts`. Then the following commands work from
the host:

```bash
curl -k https://sim.enigmamemory.com:8443/readyz
curl -k https://sim.enigmamemory.com:9443/readyz
```

The tls-proxy service also declares `extra_hosts` entries for the same domain
names so that containers can resolve them locally when needed.

## Quick start

1. Generate secrets and a self-signed TLS certificate:

   ```bash
   node scripts/simulate-production-env.mjs
   ```

   Files are written to `deploy/secrets-simulation/` (gitignored).

2. Start the simulation:

   ```bash
   docker compose -f deploy/docker-compose.local-production-simulation.yml up --build -d
   ```

3. Wait for the backend to become ready:

   ```bash
   node scripts/wait-for-backend-ready.mjs
   ```

4. Inspect readiness over HTTPS:

   ```bash
   curl -k https://localhost:8443/readyz
   curl -k https://localhost:9443/readyz
   curl -k https://sim.enigmamemory.com:8443/readyz
   curl -k https://sim.enigmamemory.com:9443/readyz
   ```

## Stop

```bash
docker compose -f deploy/docker-compose.local-production-simulation.yml down
```

To also remove the Postgres volume and mock event data:

```bash
docker compose -f deploy/docker-compose.local-production-simulation.yml down -v
```

## Ports and routes

| Service | Public port | Internal port | Health route | Notes |
|--------|-------------|---------------|--------------|-------|
| relay  | `8443` (HTTPS, loopback) | `8787` | `/readyz`, `/livez` | TLS terminated by `tls-proxy`; also answers on `sim.enigmamemory.com` and `relay.sim.enigmamemory.com` |
| gateway | `9443` (HTTPS, loopback) | `8797` | `/readyz`, `/livez` | TLS terminated by `tls-proxy`; also answers on `sim.enigmamemory.com` and `gateway.sim.enigmamemory.com` |
| postgres | not exposed | `5432` | — | Used as the simulated durable store |
| kms-mock | not exposed | `3000` | `/healthz` | Serves a generated Ed25519 key ref |
| siem-mock | not exposed | `3000` | `/healthz` | Accepts `POST /events`, writes minimized metadata to `/data/siem-events.jsonl` |

## Verify secret files

```bash
node scripts/simulate-production-env.mjs --check
```

This reports whether all required files in `deploy/secrets-simulation/` exist
and are non-empty.

## Simulation-only behavior

- `ENIGMA_OPERATOR_ACCEPTANCE_DECISION` is set to `go` so the readiness
  endpoints can turn green locally. This is **not** real operator acceptance.
- `ENIGMA_DISABLE_LOCAL_DEMO_FALLBACK` is `true`, but the "external" storage,
  KMS, and SIEM are local mocks.
- The TLS certificate is self-signed; curl requires `-k`/`--insecure`.
- The certificate SAN list includes `localhost`, `127.0.0.1`,
  `sim.enigmamemory.com`, `relay.sim.enigmamemory.com`,
  `gateway.sim.enigmamemory.com`, and `*.sim.enigmamemory.com`.

## Shortest path from local simulation to hosted readiness

The local simulation proves that the relay, gateway, fail-closed readiness
checks, hosted-live collector, and hosted-live validator can interoperate. It
does **not** produce production go-live evidence because it uses loopback DNS,
self-signed TLS, mocked KMS/SIEM services, and fixture operator approval.

Run the local proof without external credentials:

```bash
node --test test/enigma-hosted-go-live-simulation.test.mjs
```

That test starts `deploy/docker-compose.local-production-simulation.yml`,
builds a simulation-only operator acceptance packet, collects relay/gateway
`/livez` and `/readyz` evidence, validates it with
`scripts/validate-hosted-backend-live.mjs`, and tears the stack down. For manual
simulation probing, `production:hosted-collect -- --local-simulation-loopback`
is restricted to `https://*.sim.enigmamemory.com` loopback probes with
self-signed TLS and must not be used as production evidence.

Move from that local proof to real hosted relay/gateway readiness with the same
script chain, replacing every template with operator-owned production evidence:

```bash
npm run production:evidence-starter -- --out-dir <evidence-dir> --domain enigmamemory.com --tenant <tenant-id> --environment production
npm run production:backend-env -- --out-dir <backend-env-kit-dir> --domain enigmamemory.com --tenant <tenant-id> --environment production
# Operator deploys relay/gateway from deploy/docker-compose.production.example.yml or deploy/kubernetes/enigma-backend.example.yaml using private filled env/secrets.
npm run production:manifests -- --out <evidence-dir>/production-manifests.json
npm run production:storage -- --out <evidence-dir>/production-storage-migration.json
npm run infrastructure:readiness -- --manifest <evidence-dir>/infrastructure-readiness-manifest.json --live --cloudflare-live required > <evidence-dir>/infrastructure-readiness-live.json
npm run production:hosted-collect -- --relay-url https://relay.enigmamemory.com --gateway-url https://gateway.enigmamemory.com --refs-json <evidence-dir>/hosted-refs.json --domain enigmamemory.com --environment-id production --cloud-provider <provider> --region <region> --owner <owner> --operator-decision go --operator-packet-ref <operator-packet-ref> --operator-approved-at <iso8601> --operator-approved-by <operator> --out <evidence-dir>/hosted-backend-live-collection.json --evidence-out <evidence-dir>/hosted-backend-live.json
npm run production:hosted-live -- --evidence <evidence-dir>/hosted-backend-live.json
npm run production:acceptance:packet -- --out <evidence-dir>/operator-acceptance-packet.json --owners-json <evidence-dir>/owner-approval-refs.json --evidence-refs <evidence-dir>/evidence-refs.json --readiness <evidence-dir>/infrastructure-readiness-live.json --manifest <evidence-dir>/infrastructure-readiness-manifest.json --storage <evidence-dir>/production-storage-migration.json --release-audit .enigma/release-audit-current.json --production-manifests <evidence-dir>/production-manifests.json --decision go --tenant <tenant-id> --target-regions <regions> --requested-go-live-date <date> --evidence-repository <evidence-repository> --packet-owner <operator> --validate
npm run production:acceptance -- --packet <evidence-dir>/operator-acceptance-packet.json
```

Hosted readiness remains blocked until the production commands above observe
public HTTPS relay/gateway probes, all required hosted refs, and operator
acceptance `go` for the exact target environment.

Never commit `deploy/secrets-simulation/` or `*.pem` files. Both are
`.gitignore`d.
