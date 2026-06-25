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

## Collect hosted backend live evidence

The simulation can be probed as if it were a public hosted deployment by
using the public-looking domain `sim.enigmamemory.com`. Because the domain
has no real DNS record, the collector resolves it to `127.0.0.1` locally and
accepts the self-signed certificate.

1. Build a simulation operator acceptance packet:

   ```bash
   node scripts/build-operator-acceptance-packet.mjs \
     --complete-fixture --decision go --packet-id sim-operator-acceptance \
     --tenant enigma-sim --deployment-mode hosted --environment local-simulation \
     --target-regions local --requested-go-live-date 2026-06-25 \
     --evidence-repository https://github.com/enigma-memory/evidence/sim \
     --packet-owner "Simulation Owner" \
     --last-updated 2026-06-25T00:00:00.000Z \
     --owners-json .enigma/sim-owner-overrides.json \
     --evidence-refs .enigma/sim-evidence-overrides.json \
     --out .enigma/sim-operator-acceptance.json --validate
   ```

2. Collect and validate live evidence:

   ```bash
   node .enigma/collect-sim-evidence.mjs \
     --relay-url https://sim.enigmamemory.com:8443 \
     --gateway-url https://sim.enigmamemory.com:9443 \
     --refs-json .enigma/sim-hosted-refs.json \
     --domain sim.enigmamemory.com --environment-id local-simulation \
     --cloud-provider local --region local --owner enigma-sim \
     --operator-decision go \
     --operator-packet-ref .enigma/sim-operator-acceptance.json \
     --operator-approved-at <iso8601> --operator-approved-by enigma-sim \
     --out .enigma/hosted-backend-live-collection.json \
     --evidence-out .enigma/hosted-backend-live-simulated.json

   node scripts/validate-hosted-backend-live.mjs \
     --evidence .enigma/hosted-backend-live-simulated.json
   ```

The expected result is `status: accepted` with all four probes observed and no
blockers. The wrapper does not mutate DNS or deploy infrastructure and never
sends credentials.

Never commit `deploy/secrets-simulation/` or `*.pem` files. Both are
`.gitignore`d.
