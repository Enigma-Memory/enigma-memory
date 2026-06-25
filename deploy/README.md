# Enigma Deployment Reference Manifests

This directory contains reference production manifests for the Enigma hosted/BYOC backend. They are intentionally example-shaped scaffolding: they show the intended safety posture, but they are **not** go-live evidence and will not make a backend ready for production without operator work.

## Files

- `docker-compose.production.example.yml` — Docker Compose reference for a single-host or small-footprint deployment.
- `kubernetes/enigma-backend.example.yaml` — Kubernetes reference for a replicated, namespace-scoped deployment.

## What operators must provide

Both manifests expect the operator to supply real out-of-band secrets and configuration before any go-live decision:

- Pinned container image digests (the manifests use `operator-pinned-digest-required` as a placeholder tag).
- External durable storage DSN.
- KMS/signing material and custody references.
- SIEM export endpoint.
- Backup target URI and a working backup/restore process.
- Monitoring, alerting, ingress hosts, TLS certificates, and NetworkPolicy/egress rules.
- Operator acceptance evidence and a recorded go/no-go decision.

## Safety properties enforced by the references

- Docker Secrets (Compose) and `Secret`/`secretKeyRef` (Kubernetes) for all sensitive values; no plaintext credentials in manifests.
- `_FILE` env vars (Compose) and required secret refs (Kubernetes) so the application reads secrets from mounted files.
- `ENIGMA_DISABLE_LOCAL_DEMO_FALLBACK: "true"` so the services fail closed rather than fall back to local demo mode.
- Non-root containers, read-only root filesystems, dropped capabilities, and `no-new-privileges`.
- Loopback-only public port bindings in Compose; Kubernetes `ClusterIP` services with a public Ingress exposing only exact `/livez` and `/readyz` paths.
- Private/admin ingress placeholder in Kubernetes; Compose relies on an operator-managed reverse proxy for admin/data-plane routes.
- Default-deny egress policy placeholder in Kubernetes (`enigma-default-deny` NetworkPolicy) plus explicit allowed-egress placeholders; Compose requires the operator to enforce equivalent host-level firewall or egress-proxy rules.
- Fail-closed backup placeholder (CronJob exits non-zero until the operator wires a real backup target).

## Do not copy secrets into these files

Keep real keys, tokens, DSNs, bearer hashes, and acceptance evidence URIs in the operator secret store or the `./operator-secrets/` files referenced by the Compose manifest. Never commit secrets to version control.
