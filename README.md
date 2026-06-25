# Enigma

Enigma is a provider-agnostic AI memory custody and proof layer. It gives a user or enterprise a local canonical memory vault, emits offline-verifiable receipts for Enigma-controlled lifecycle events, and connects that vault to assistants through CLI, MCP, browser, desktop, relay, gateway, and enterprise policy surfaces.

Current status:

- Local production foundation: CLI, verifier, vault, passport, boundary, MCP server, connector, importer, relay, gateway, enterprise, mesh, browser-extension, and desktop scaffold code exist in this repository.
- Published npm package: package bins and module entry points are available as `enigma-memory`; use the npm install path below for the simplest onboarding flow.
- Source-only artifacts: `docs/`, `Dockerfile`, and `docker-compose.yml` live in the source checkout. The package README and CLI help are the package-included install guides; the full runbooks require the repository or hosted docs.
- Hosted cloud is not included by default. Hosted relay/gateway/cloud operation requires deployment credentials, a domain, TLS, production durable storage, KMS/secrets, monitoring, backups, operator policy, and a completed operator acceptance packet. Local relay/gateway `--state-file` demo state does not satisfy those hosted/BYOC requirements.
- Cloudflare API/domain/hosting automation is documented but safe-by-default: [`docs/cloudflare-token-and-domain-runbook.md`](docs/cloudflare-token-and-domain-runbook.md) gives the token recipe, Registrar prerequisites, local token storage rule, search/check flow, explicit domain+price purchase gate, Pages deploy gate, custom-domain steps, and post-setup token rotation.
- Overnight execution plan: [`docs/overnight-build-master-plan.md`](docs/overnight-build-master-plan.md) defines the GPT-5.5/Kimi overnight build cadence, acceptance gates, exact non-claims, and hosted/BYOC blockers.
- Security and production review artifacts: [`SECURITY.md`](SECURITY.md) defines reporting, safe harbor, disclosure, incident, secret-handling, plaintext-minimization, and proof-boundary policy; [`docs/security-threat-model.md`](docs/security-threat-model.md) maps assets, trust boundaries, controls, residual risks, and verification evidence; [`docs/operator-acceptance-packet.md`](docs/operator-acceptance-packet.md) is required before hosted/BYOC can be called live.
- Public API reference: [`docs/public-api-reference.md`](docs/public-api-reference.md) lists package exports, CLI bins, MCP tools/resources/prompts, relay/gateway endpoints, importer/capsule APIs, connector profiles, verifier outputs, schemas, and local-vs-hosted boundaries.
- Local release provenance/SBOM: [`docs/release-provenance-and-sbom.md`](docs/release-provenance-and-sbom.md) documents `npm run provenance:local -- --out ./.enigma/release-provenance.json` as unsigned local package-surface inventory and SHA-256 evidence only, not signed attestation, registry provenance, source-control proof, SLSA/compliance, Docker image, or hosted/cloud deployment evidence.
- Reviewer packet: [`docs/reviewer-packet.md`](docs/reviewer-packet.md) documents `npm run review:packet -- --out ./.enigma-review-packet --public-site <path-to-_public_site>` as a local hand-review bundle for package, release-audit, provenance, and optional generated public-site evidence; it is not npm publication, live Cloudflare deployment, Docker runtime proof, hosted/BYOC readiness, legal approval, signed provenance, or compliance evidence.

Enigma does not claim that a closed provider deleted internal data, that model weights forgot, or that provider-native memory disappeared. It proves facts about Enigma-controlled vault state, receipts, checkpoints, and declared boundary operations.

## Install and run locally

Prerequisites:

- Node.js `>=24`
- No database, package registry account, provider credential, or cloud credential for the local package quickstart
- Git only when you choose the advanced source-checkout path

## Quickstart from npm

Use the published package first:

```sh
npm install -g enigma-memory
enigma quickstart --bundle ./.enigma/bundle.json --overwrite
enigma doctor
enigma-relay demo
enigma-gateway demo
```

`enigma quickstart` creates a local Enigma workspace for proof review: a local vault bundle, a context pack, an export proof bundle, and a verify report. These artifacts prove Enigma-controlled local vault state, receipts, checkpoints, and verification results only; they do not prove provider deletion, provider model forgetting, provider-native memory removal, hosted availability, or compliance certification.

One-off execution without a global install:

```sh
npx --yes --package enigma-memory enigma quickstart --bundle ./.enigma/bundle.json --overwrite
```

## Advanced/source-only path

Use a source checkout only when you need source-only docs, Docker assets, browser-extension scaffolding, package development, or release scripts:

```sh
git clone https://github.com/Enigma-Memory/enigma-memory.git
cd enigma-memory
npm run install:local -- --execute --init-vault --bundle ./.enigma/bundle.json
enigma doctor
enigma-relay demo
enigma-gateway demo
```

`install:local` is dry-run unless `--execute` is present. The command above installs the checked-out package globally and creates a local vault bundle. It does not require Cloudflare, OpenAI, Anthropic, npm publish credentials, a database, or hosted infrastructure.

Manual alternative: create a no-network local vault, write one local memory from a file, compile a context pack, export a proof bundle, and verify it. Use a tenant-approved smoke file; do not expand private memory into shell argv.

POSIX shell:

```sh
mkdir -p .enigma
ENIGMA_DEMO_MEMORY_FILE=/absolute/path/to/tenant-approved-smoke-memory.txt
test -f "$ENIGMA_DEMO_MEMORY_FILE"
enigma init --bundle ./.enigma/bundle.json --subject local-user --display-name "Local user"
enigma remember --bundle ./.enigma/bundle.json --text-file "$ENIGMA_DEMO_MEMORY_FILE" --purpose user_memory --tags local
enigma context --bundle ./.enigma/bundle.json --query "local context" --purpose local_answer --out ./.enigma/context-pack.json
enigma export --bundle ./.enigma/bundle.json --out ./.enigma/export.json
enigma verify --bundle ./.enigma/export.json
```

Windows PowerShell:

```powershell
New-Item -ItemType Directory -Force .enigma | Out-Null
$env:ENIGMA_DEMO_MEMORY_FILE = "C:\path\to\tenant-approved-smoke-memory.txt"
if (-not (Test-Path -LiteralPath $env:ENIGMA_DEMO_MEMORY_FILE)) { throw "Missing ENIGMA_DEMO_MEMORY_FILE" }
enigma init --bundle .\.enigma\bundle.json --subject local-user --display-name "Local user"
enigma remember --bundle .\.enigma\bundle.json --text-file $env:ENIGMA_DEMO_MEMORY_FILE --purpose user_memory --tags local
enigma context --bundle .\.enigma\bundle.json --query "local context" --purpose local_answer --out .\.enigma\context-pack.json
enigma export --bundle .\.enigma\bundle.json --out .\.enigma\export.json
enigma verify --bundle .\.enigma\export.json
```

The bundle is local. Exported proof artifacts contain encrypted/committed vault state and receipt metadata; do not paste raw memory plaintext into relay records, witness checkpoints, SIEM events, public proof artifacts, or shell command lines.

## MCP setup

Run the Enigma MCP server over stdio:

POSIX shell:

```sh
ENIGMA_BUNDLE="$HOME/.enigma/bundle.json" enigma-mcp
```

Windows PowerShell:

```powershell
$env:ENIGMA_BUNDLE = "$HOME\.enigma\bundle.json"
enigma-mcp.cmd
```

Or through the CLI:

```sh
ENIGMA_BUNDLE="$HOME/.enigma/bundle.json" enigma mcp serve
```

Windows PowerShell CLI form:

```powershell
$env:ENIGMA_BUNDLE = "$HOME\.enigma\bundle.json"
enigma.cmd mcp serve
```

Generic MCP client entry:

```json
{
  "mcpServers": {
    "enigma": {
      "command": "enigma-mcp",
      "args": [],
      "env": {
        "ENIGMA_BUNDLE": "/absolute/path/to/.enigma/bundle.json"
      }
    }
  }
}
```

The MCP server exposes `enigma_init`, `enigma_remember`, `enigma_search`, `enigma_context_pack`, `enigma_delete`, and `enigma_verify_receipts`, plus an Enigma passport summary resource and a memory-use prompt. Provider-native memory should be treated as cache only; Enigma vault state remains canonical.

## Connect clients

Supported connector profiles are:

- `claude-desktop`
- `cursor`
- `kimi-code`
- `vscode-cline`
- `roo`
- `opencode`
- `generic-mcp`

Use the config in `docs/client-connectors.md` from a source checkout for Claude Desktop, Cursor, Kimi Code, VS Code/Cline, Roo Code, OpenCode, or any MCP-compatible client. The generated entry defaults to command `enigma-mcp` and sets `ENIGMA_BUNDLE` to the local vault bundle.

CLI connector commands:

```sh
enigma doctor
enigma install --bundle "$HOME/.enigma/bundle.json"
enigma connect claude-desktop --bundle "$HOME/.enigma/bundle.json"
enigma connect kimi-code --bundle "$HOME/.enigma/bundle.json" --mcp-command "/absolute/path/to/enigma-mcp"
enigma disconnect claude-desktop
```

Use `--mcp-command` (alias `--command`) when a GUI app cannot find shell-installed binaries or needs a `.cmd` path on Windows.

## Browser extension and native host

The browser extension is an unpacked Manifest V3 scaffold in:

```text
apps/browser-extension
```

The local native messaging host install assets are in:

```text
apps/native-host
```

Register host name `com.enigma.native_host` by generating a browser-specific manifest:

```sh
enigma native-host manifest --browser chrome --host-path "/absolute/path/to/enigma-native-host" --extension-id "REPLACE_WITH_EXTENSION_ID" --out ./com.enigma.native_host.json
```

Use `--browser edge` or `--browser firefox` for those browsers. Find unpacked Chrome IDs at `chrome://extensions` > Developer mode > Enigma > Details, Edge IDs at `edge://extensions` > Developer mode > Enigma > Details, and Firefox IDs at `about:debugging#/runtime/this-firefox` or from a stable `browser_specific_settings.gecko.id`/signed add-on ID. The host path must be absolute and point to `enigma-native-host` or a wrapper that sets `ENIGMA_BUNDLE` before launching it. Without `--out`, the generator prints manifest JSON to stdout; with `--out`, it writes the file and reports `{ ok, path }`. Copy the resulting `com.enigma.native_host.json` into the browser/OS native-host location, or create the documented Windows registry key yourself. Manual templates remain in `apps/native-host/manifests/`. Exact copy and registry commands are in [`apps/native-host/README.md`](apps/native-host/README.md).

The native host is inside the local trust boundary: protect the manifest, wrapper, executable, and `ENIGMA_BUNDLE` path from local modification. The extension does not use browser sync storage (`chrome.storage.sync`) at all and requires an explicit user click before inserting Enigma context into ChatGPT, Claude, Kimi, Perplexity, or another supported provider page. Provider-native memory remains cache only; Enigma receipts do not prove provider deletion or model forgetting. See [`apps/browser-extension/README.md`](apps/browser-extension/README.md), [`apps/native-host/README.md`](apps/native-host/README.md), and [`docs/install-anywhere.md`](docs/install-anywhere.md) in the source checkout.

## Desktop scaffold

The desktop surface is a static local scaffold in:

```text
apps/desktop/src/index.html
```

Open it directly in a browser or package it inside a desktop shell. It models vault, MCP, clients, import/export, verifier, deletion, mesh, and enterprise screens. Desktop UI state is operational evidence only; cryptographic proof still comes from Enigma receipts and verifier output.

## Relay, gateway, Docker, and enterprise modes

Local relay and gateway servers are Node HTTP modules:

- `apps/relay/src/server.mjs` stores opaque encrypted relay records, signs witness checkpoints, and handles pairing. It rejects plaintext-looking memory fields.
- `apps/gateway/src/server.mjs` evaluates enterprise policy, emits signed decisions, and exports plaintext-minimized SIEM events. It does not call model providers.

Direct bins are available after a source or package install. Add `--state-file <path>` when a local demo should survive a restart:

```sh
mkdir -p .enigma/state
enigma-relay demo
enigma-relay serve --host 127.0.0.1 --port 8787 --state-file ./.enigma/state/relay-state.json
enigma-gateway demo
enigma-gateway serve --host 127.0.0.1 --port 8797 --state-file ./.enigma/state/gateway-state.json
```

The same behavior is also available through the main CLI:

```sh
enigma relay demo
enigma relay serve --host 127.0.0.1 --port 8787 --state-file ./.enigma/state/relay-state.json
enigma gateway demo
enigma gateway serve --host 127.0.0.1 --port 8797 --state-file ./.enigma/state/gateway-state.json
```

`--state-file` is local demo durability, not a production database. Relay state files may contain relay node/trust metadata, local demo signing material, hash-only or opaque relay records, witness checkpoints, completed pairings, and authorization mode; they must not contain raw memory plaintext, prompts, transcripts, decrypted capsule contents, raw request bodies, or pending challenges. Gateway state business data is limited to active policy/minimized policy metadata, policy hash, and plaintext-minimized SIEM/decision evidence, but the snapshot may also include local demo identity and Ed25519 signing key material needed to verify decisions; it must not contain raw memory, prompts, completions, transcripts, provider responses, embeddings, tenant secrets, KMS material, or provider hidden-state claims. Unknown, malformed, or plaintext-looking state fails closed instead of silently resetting.

Keep state files outside source control with owner-only file permissions. Backups are useful for local demo restore only; hosted and BYOC deployments still need real durable storage, KMS/secrets, monitored backups, restore rehearsal, and an accepted operator packet.

For source-checkout Docker demos:

```sh
cd enigma
docker compose up --build relay gateway
```

See `docs/install-anywhere.md` and `docs/deployment-runbook.md` in the source checkout for concrete local server, Docker, hosted, and BYOC steps.

Enterprise modes:

- Hosted: Enigma operator runs relay/gateway for a tenant. Requires deployment credentials, TLS, production durable storage, KMS/secrets, monitoring, backups, incident response, and tenant policy.
- BYOC: customer runs relay/gateway in its own cloud or network. Customer controls KMS, network policy, logs, data residency, backups, and deployment credentials.

Both modes keep provider-native memory as cache only. Enigma can prove its own committed state and policy decisions; it cannot prove that a third-party provider erased hidden state or changed model weights.

## Import and migration

Importer APIs normalize exported memory/context from ChatGPT, Claude, Mem0, Letta, LangGraph, Zep/Graphiti, and Enigma capsules into candidates with source references, limitations, confidence, and completeness flags. Imports preserve source caveats. A source export becomes canonical only after the candidate is written through an Enigma vault and receives Enigma receipts.

Migration CLI examples:

```sh
enigma import chatgpt --file ./chatgpt-export.json --out ./enigma-import-report.json
enigma capsule export --file ./enigma-import-report.json --out ./enigma-capsule.json
enigma capsule import --file ./enigma-capsule.json --bundle "$HOME/.enigma/bundle.json"
```

## Verification commands

Repeatable package/demo audit:

```sh
npm run release:audit
```

This is the one-command local release evidence path; add `-- --out <file>` when another Enigma production command needs to consume the audit JSON. Docker runtime, hosted cloud, npm publication, and live website review remain external/operator-gated checks rather than prerequisites for `release:audit`.

Local provenance/SBOM checksum evidence:

```sh
npm run provenance:local -- --out ./.enigma/release-provenance.json
```

Use [`docs/release-provenance-and-sbom.md`](docs/release-provenance-and-sbom.md) to interpret the generated JSON. Reviewers can compare recorded `(path, sha256)` entries with freshly computed SHA-256 values or with another provenance file. Run `npm pack --dry-run` separately when reviewing package tarball contents, and build the public site artifact before rerunning provenance when the optional `public_site_manifest` checksum is in scope. The provenance file is local unsigned checksum evidence only.

Hand-review packet:

```sh
python scripts/build_public_site.py
npm run review:packet -- --out ./.enigma-review-packet --public-site ./_public_site
```

Use [`docs/reviewer-packet.md`](docs/reviewer-packet.md) to inspect `REVIEW_PACKET_MANIFEST.json`, `evidence/release-audit.json`, `evidence/local-provenance.json`, `package/npm-pack-dry-run.json`, copied `docs/`, optional `site/`, and the recorded SHA-256 values. Pass `--public-site` only for an already-built generated public-site artifact such as `./_public_site`; the packet copies local evidence for review and does not prove npm publication, live Cloudflare deployment, Docker image/runtime behavior, hosted/BYOC readiness, legal approval, signed provenance, or compliance status.

Local smoke path:

```sh
ENIGMA_DEMO_MEMORY_FILE=/absolute/path/to/tenant-approved-smoke-memory.txt
test -f "$ENIGMA_DEMO_MEMORY_FILE"
enigma init --bundle ./.enigma/bundle.json
enigma remember --bundle ./.enigma/bundle.json --text-file "$ENIGMA_DEMO_MEMORY_FILE" --purpose local_test
enigma export --bundle ./.enigma/bundle.json --out ./.enigma/export.json
enigma verify --bundle ./.enigma/export.json
enigma boundary run --scenario committed_crossing
```

MCP JSON-RPC handshake:

```sh
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"manual","version":"0"}}}\n{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n' | ENIGMA_BUNDLE="$PWD/.enigma/bundle.json" enigma-mcp
```

Connector demo:

```sh
node --input-type=module -e "import { runConnectorDemo } from './packages/connectors/src/index.js'; console.log(JSON.stringify(runConnectorDemo({ clientId: 'generic-mcp' }), null, 2));"
```

Importer demo:

```sh
node --input-type=module -e "import { runImporterDemo } from './packages/importers/src/index.js'; console.log(JSON.stringify(runImporterDemo(), null, 2));"
```

Relay and gateway demos:

```sh
enigma-relay demo
enigma-gateway demo
```

Relay and gateway servers:

```sh
enigma-relay serve --host 127.0.0.1 --port 8787
enigma-gateway serve --host 127.0.0.1 --port 8797
```

## Claim boundary

Enigma can honestly claim:

- A local Enigma vault contains or no longer serves a committed memory address.
- A memory create, retrieval, context-pack, update, or tombstone event produced a receipt that verifies offline.
- A boundary harness classified an observed boundary event as committed, blocked, out-of-scope, or failed.
- A relay stored an opaque encrypted record or signed a witness checkpoint without raw memory plaintext.
- A gateway decision followed a specific Enigma enterprise policy at a specific policy hash.

Enigma cannot honestly claim:

- A closed provider physically deleted all internal copies.
- A model forgot training, fine-tuning, cache, telemetry, or hidden personalization state.
- Enigma caused semantic forgetting across model outputs, hidden personalization, embeddings, summaries, caches, or third-party systems outside Enigma state.
- Imported provider memories are complete unless the source export explicitly proves completeness.
- A signed memory statement is true in the real world; receipts prove custody and lifecycle, not factual correctness.
- Token ROI, profit, equity, revenue share, investment return, or token price expectation.
- Tamper-proof hardware or raw compute superiority.
- Benchmark leadership without measured repository evidence.
- Hosted cloud or customer BYOC deployment is live without the required credentials, domain/TLS, production durable storage, KMS/secrets, monitoring, backups, incident ownership, and SIEM/log routing; local `--state-file` demo state is not hosted/BYOC readiness.
- That a local review packet or local provenance/SBOM output is signed provenance, registry attestation, git/source-control evidence, SLSA level, compliance certification, Docker image digest/runtime evidence, npm publication, hosted/BYOC readiness, or hosted/cloud deployment proof.

Read next:

- [`docs/overnight-build-master-plan.md`](docs/overnight-build-master-plan.md)
- [`docs/release-evidence-2026-06-23.md`](docs/release-evidence-2026-06-23.md)
- [`docs/release-provenance-and-sbom.md`](docs/release-provenance-and-sbom.md)
- [`docs/reviewer-packet.md`](docs/reviewer-packet.md)
- [`SECURITY.md`](SECURITY.md)
- [`docs/security-threat-model.md`](docs/security-threat-model.md)
- [`docs/operator-acceptance-packet.md`](docs/operator-acceptance-packet.md)
- [`docs/cloudflare-token-and-domain-runbook.md`](docs/cloudflare-token-and-domain-runbook.md)
- [`docs/public-api-reference.md`](docs/public-api-reference.md)
- `docs/install-anywhere.md`
- `docs/client-connectors.md`
- `docs/deployment-runbook.md`
- `docs/production-release-checklist.md`
