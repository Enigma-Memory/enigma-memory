# Production release checklist

This checklist is for publishing and operating Enigma as an installable package and production-facing local/hosted system.

Current release posture: local production foundation, published npm package `enigma-memory`, and the static public website on `https://enigmamemory.com/` are present. Hosted cloud relay/gateway requires deployment credentials and operator infrastructure before it can be sold or described as live.

Use the [overnight build master plan](overnight-build-master-plan.md) as the execution plan for overnight phase order, GPT-5.5/Kimi ownership, acceptance gates, and blocker handling before changing any release posture.

## Release evidence status map

| Surface | Status | Evidence / blocker |
| --- | --- | --- |
| Local CLI, MCP, vault, verifier, importer/capsule, and package surfaces | local/package passed | Local/package evidence covers Enigma-controlled state, offline receipt verification, package metadata, bin/import behavior, and local no-network operation only. |
| Local memory benchmark harness | local/package benchmark fixture | `node scripts/run-memory-benchmarks.mjs` emits `enigma.memory_benchmark_suite.v1` evidence for deterministic local vault/context/optimizer/export/verify operations, latency, deduplication, abstention, and same-boundary provider profile labels. It is not LoCoMo/LongMemEval execution, live provider comparison, ROI/savings evidence, provider deletion proof, model forgetting proof, hosted readiness, or compliance certification. |
| Local provenance/SBOM checksum evidence | local checksum evidence | `npm run provenance:local -- --out ./.enigma/release-provenance.json` records package-surface file inventory and SHA-256 values only; it is not signed provenance, registry attestation, source-control evidence, SLSA, compliance, Docker image, or cloud deployment evidence. |
| Reviewer packet | local hand-review bundle | `npm run review:packet -- --out ./.enigma-review-packet --public-site <path-to-_public_site>` gathers local/package/provenance evidence and optionally copies a generated public-site artifact; it is not npm publication, live Cloudflare deployment, Docker runtime proof, hosted/BYOC readiness, legal approval, signed provenance, or compliance evidence. |
| Repository collateral and deployment assets | source-only | `docs/`, `Dockerfile`, `docker-compose.yml`, and launch collateral are source-checkout artifacts unless the publish manifest explicitly includes them. |
| Public-safe demo assets and static docs hub | source-only / not deployed | `npm run demo:assets` regenerates `docs/demo-assets/receipt-flow-demo.svg` plus `docs/demo-assets/demo-assets-manifest.json`; `docs/demo-video-assets.md` and `docs/hosted-docs-hub.md` explain source-only conversion and static hub boundaries. This is not video production, website deployment, hosted backend readiness, legal approval, provider deletion proof, model forgetting, or compliance evidence. |
| Public GitHub repository setup | source release runbook ready | `docs/public-github-repo-setup.md` defines public repo settings, branch protection, required CI statuses, security policy linkage, release tags, secret-free collateral checks, and claim boundaries. It is not remote repository creation, source-control proof, npm publication, or hosted/cloud deployment evidence. |
| Static public launch site artifact | public-site artifact passed / live on Cloudflare Pages | `github-upload/enigma-memory-site/_public_site` passes preflight/security; current `production:goal-audit` evidence records `https://enigmamemory.com/` serving the Enigma launch artifact with title `Enigma — Verifiable AI memory plane`. Treat timestamped/cache-busted reads as point-in-time evidence and refresh them in generated artifacts instead of copying them into this checklist. |
| Cloudflare Pages/token/handoff packets | live static-site evidence plus local handoff evidence | `cloudflare:pages:packet`, `cloudflare:token-policy`, `cloudflare:token-request`, `production:handoff`, and `production:goal-audit` emit public-safe JSON for another operator or AI. Token policy/request now include optional Workers Scripts Read/Edit for the hosted probe Worker. They do not print tokens and do not prove hosted backend readiness. |
| Live endpoint monitoring and privacy ops runbooks | source-only / operator-run | `production:live-monitor:dry-run` validates the monitor configuration without probes; `docs/live-endpoint-monitoring.md`, `docs/privacy-preserving-analytics.md`, and `docs/cloudflare-token-rotation.md` define secret-free operations. These docs do not mutate Cloudflare, enable analytics, prove hosted readiness, or certify compliance. |
| Docker relay/gateway demos and deploy manifests | Docker daemon blocked / runtime evidence plus static manifest validation | Docker runtime smoke has been recorded in release evidence where daemon access existed. `npm run production:manifests` validates the Compose/Kubernetes backend references for fail-closed flags, loopback-only Compose ports, exact public health ingress, private admin ingress, non-root/read-only settings, required secret refs, default-deny NetworkPolicy, fail-closed backup placeholder, and hosted-readiness refs. Hosted production still requires real backend credentials, storage, KMS, SIEM, backup, monitoring, network policy, tenant policy, legal/SLA, and operator acceptance. |
| Hosted cloud and customer BYOC deployments | lifecycle contract surface ready / backend cloud/BYOC blocked | `packages/hosted-cloud/src/index.js`, `test/enigma-hosted-cloud-contracts.test.mjs`, and `docs/hosted-cloud-product.md` define account, tenant, hosted vault, API key, billing, dashboard, backup-drill, incident/SLA, and customer lifecycle packet contracts plus validators. `npm run production:hosted-customer` builds readiness evidence only. Hosted/BYOC release still requires backend deployment credentials, backend DNS/TLS, durable storage, KMS/secrets, monitoring/alerting, backups, incident ownership, SIEM/log routing, network policy, tenant policy approval, usage metering, settlement evidence, threat model, legal/compliance approval, support/SLA approval, external auth provider wiring, external billing provider wiring, complete lifecycle evidence refs, and explicit operator go-live approval. |
| Token, legal, compliance, and investment-sensitive claims | legal/token blocked | Token utility, compliance, and regulated claims require legal/board approval and must not imply ROI, equity, revenue share, guaranteed savings, hosted-live readiness, provider deletion, model forgetting, or compliance certification. |


Before reviewer handoff, confirm [`public-api-reference.md`](public-api-reference.md) covers package exports, bins, MCP tools/resources/prompts, relay/gateway endpoints, importer/capsule APIs, connector profiles, verifier outputs, schemas, and local-vs-hosted boundaries; confirm [`release-provenance-and-sbom.md`](release-provenance-and-sbom.md) explains the local checksum/SBOM evidence boundary; and confirm [`reviewer-packet.md`](reviewer-packet.md) explains how to build and inspect the local hand-review bundle.

Before public source release or npm publication, use [`public-github-repo-setup.md`](public-github-repo-setup.md) for repository setup boundaries and [`npm-publishing.md`](npm-publishing.md) for package publication boundaries.

Before enabling live monitoring, analytics, or token rotation, use [`live-endpoint-monitoring.md`](live-endpoint-monitoring.md), [`privacy-preserving-analytics.md`](privacy-preserving-analytics.md), and [`cloudflare-token-rotation.md`](cloudflare-token-rotation.md) for public-safe operator boundaries. Before publishing a separate static docs hub, use [`hosted-docs-hub.md`](hosted-docs-hub.md) for included source docs, legal-review-gated topics, and deployment boundaries that do not change the existing public website/homepage. Before describing hosted cloud product readiness, use [`hosted-cloud-product.md`](hosted-cloud-product.md) to separate contract-ready validators from externally blocked auth, billing, legal, data-processing, support, and security-review work.

## Package and installability

- [ ] Package name is `enigma-memory`.
- [ ] Public install command is `npm install -g enigma-memory`; one-off quickstart command is `npx --yes --package enigma-memory enigma quickstart --bundle ./.enigma/bundle.json --overwrite`.
- [ ] Published npm package is visible as `enigma-memory` before public npm-install claims are made.
- [ ] Registry verification script is present and run as `npm run registry:verify -- --execute` before public npm-install claims; keep its evidence bounded to registry installability only.
- [ ] Published-package quickstart smoke uses `npm install -g enigma-memory`, `enigma quickstart --bundle ./.enigma/bundle.json --overwrite`, `enigma doctor`, `enigma-relay demo`, and `enigma-gateway demo` in that order.
- [ ] Quickstart output is described as a local vault bundle, context pack, export proof bundle, and verify report; that evidence is local Enigma-controlled proof only, not provider deletion, model forgetting, hosted/BYOC readiness, legal approval, or compliance certification.
- [ ] `docs/npm-publishing.md` is followed before any future npm publication attempt, including package preflight, `npm pack --dry-run`, manual approval, `NPM_TOKEN` secret handling, provenance/SBOM boundaries, and rollback/deprecation notes.
- [ ] `private` is not set for the publish artifact.
- [ ] Node engine is `>=24`.
- [ ] Package import has no side effects: importing modules must not start servers, read user files, mutate configs, or open network connections.
- [ ] Bins are present, executable, and have Node shebangs:
  - `enigma`
  - `enigma-mcp`
  - `enigma-relay`
  - `enigma-gateway`
  - `enigma-verify`
- [ ] `enigma-relay demo` and `enigma-gateway demo` work as direct bins.
- [ ] `enigma-relay --host 127.0.0.1 --port 8787` and `enigma-gateway --host 127.0.0.1 --port 8797` default to `serve` behavior when no `demo` or `serve` subcommand is supplied.
- [ ] Packed contents include `package.json`, README, `LICENSE` or approved license artifact, bin targets, package/app sources, scripts needed by package commands, and specs.
- [ ] Source-only artifacts are documented as source-only: `docs/`, `Dockerfile`, and `docker-compose.yml` are not required to be present in an npm-only install unless `package.json` is changed to include them.
- [ ] Public module exports cover local production surfaces:
  - core
  - vault
  - passport
  - boundary
  - mcp-server
  - adapters
  - mesh
  - enterprise
  - connectors
  - importers
  - metering
  - optimizer
  - relay
  - gateway
  - desktop
  - settlement
  - storage
  - hosted-cloud
- [ ] `docs/public-api-reference.md` documents every public package/bin/service/schema surface and states which surfaces are stable local/package, demo/source-only, handoff/validator, or hosted/BYOC deployment interfaces.
- [ ] Local provenance/SBOM evidence is generated with `npm run provenance:local -- --out ./.enigma/release-provenance.json` when a reviewer needs package-surface file inventory and SHA-256 values.
- [ ] Release notes describe that provenance/SBOM output as local unsigned checksum evidence only, not signed attestation, registry provenance, git/source-control evidence, SLSA, compliance, Docker image digest, or cloud deployment evidence.
- [ ] Reviewer packet evidence is generated with `npm run review:packet -- --out ./.enigma-review-packet --public-site <path-to-_public_site>` when a human reviewer needs a single local bundle of release-audit, provenance, package, and optional generated public-site evidence.
- [ ] Public-safe demo assets are regenerated with `npm run demo:assets`; `docs/demo-assets/demo-assets-manifest.json` records deterministic SHA-256 checksums for source assets only.
- [ ] Cloudflare Pages release packet is generated with `npm run cloudflare:pages:packet -- --site <path-to-_public_site> --project-name enigma-memory --domain enigmamemory.com --live-url https://enigmamemory.com/ --expect-title Enigma` when a reviewer or follow-on AI needs static deploy readiness evidence.
- [ ] Cloudflare token policy is generated with `npm run cloudflare:token-policy -- --mode all --account-id <account-id> --project-name enigma-memory --domain enigmamemory.com` before creating a dashboard token; `all` includes Pages, Registrar, and Workers Scripts Read/Edit for the hosted probe Worker; token values must stay out of chat/docs/repo.
- [ ] Cloudflare token request body is generated with `npm run cloudflare:token-request -- --permission-groups <permission-groups.json> --mode all --account-id <account-id> --project-name enigma-memory --domain enigmamemory.com --token-name <name>` after obtaining permission group JSON from the dashboard/API; unresolved permission IDs, including Workers Scripts IDs, are blockers.
- [ ] Cloudflare setup tokens are rotated/narrowed with `docs/cloudflare-token-rotation.md`; broad setup tokens are retired after exact account, zone, Pages project, and Worker service scopes are available, and token values never enter docs, source, chat, or generated evidence.
- [ ] Production handoff packet is generated with `npm run production:handoff -- --site <path-to-_public_site> --project-name enigma-memory --domain enigmamemory.com --live-url https://enigmamemory.com/ --expect-title Enigma` before handing work to another operator or AI.
- [ ] Goal completion audit is generated with `npm run production:goal-audit -- --site <path-to-_public_site> --project-name enigma-memory --domain enigmamemory.com --live-url https://enigmamemory.com/ --expect-title Enigma --account-id <account-id>`; `complete:false` is correct until live/provider/operator evidence exists.
- [ ] Backend readiness smoke is generated with `npm run production:backend-smoke`; it proves loopback HTTP `/livez`/`/readyz` runtime behavior and production fail-closed defaults only, not hosted cloud/BYOC infrastructure.
- [ ] Local memory benchmark is generated with `node scripts/run-memory-benchmarks.mjs --out ./.enigma/memory-benchmark.json` before making performance, retention, recall, abstention, deduplication, cross-provider, or token-reduction claims; interpret it with `docs/memory-benchmarks.md` and keep claims bounded to the deterministic local fixture unless separate reviewed external benchmark evidence exists.
- [ ] Hosted backend live evidence is validated with `npm run production:hosted-live -- --evidence <hosted-backend-live.json>` after real public HTTPS relay/gateway `/livez` and `/readyz` probes, all hosted production refs, and operator acceptance `go` exist.
- [ ] Customer lifecycle packet evidence is generated with `npm run production:hosted-customer -- --tenant <id> --domain <domain> --environment <env> --out ./.enigma/hosted-customer-lifecycle.json`; missing or blocked `--evidence-ref <key=status:ref>` values and missing `--operator-go-live-ref <ref>` must keep `hosted_cloud_sellable:false`.
- [ ] Hosted-cloud contract builders and validators are present for user account, tenant, hosted vault, API key, usage billing record, dashboard summary, backup drill, incident/SLA refs, and the customer lifecycle packet; validators reject raw memory, prompts, provider responses, credentials, API key secret material, financial outcome claims, provider-side deletion/model-forgetting claims, missing lifecycle surfaces, and missing operator evidence refs.
- [ ] Hosted-cloud contracts remain contract/validator-only and do not call auth providers, billing providers, hosted deployments, KMS, support systems, status pages, SIEMs, backup targets, or model providers.
- [ ] Hosted cloud is not sold or described as sellable until external auth provider wiring, billing provider wiring, approved legal docs, approved data processing terms, assigned support ownership, external security review, and operator go-live acceptance all have evidence refs.
- [ ] Customer lifecycle packets are treated as readiness evidence validation only, not live hosted SaaS; they do not wire auth, billing, storage, support, monitoring, or provider systems.
- [ ] Live endpoint monitor configuration is dry-run checked with `npm run production:live-monitor:dry-run`; real `npm run production:live-monitor` probes are run only by an approved operator from an operations environment and produce secret-free JSON without response bodies by default.
- [ ] Optional Cloudflare Worker edge probe artifact is generated with `npm run production:hosted-probe -- --out-dir <dir>` if an operator wants a `/livez` + fail-closed `/readyz` DNS/TLS smoke before deploying the real relay/gateway. It is edge-probe evidence only.
- [ ] Operator acceptance packet validation requires accepted static production manifests: `npm run production:acceptance:packet -- --validate` embeds `enigma.production_manifest_result.v1`; `npm run production:acceptance -- --packet <completed-packet.json>` must see `production_manifests.ok:true`, `status:"accepted"`, and zero manifest blockers.
- [ ] Release notes describe the reviewer packet as local hand-review evidence only, not npm publication, live Cloudflare deployment, Docker image/runtime proof, hosted/BYOC readiness, legal approval, signed provenance, registry attestation, SLSA, or compliance evidence.

## Demo assets and static docs hub

- [ ] `docs/demo-video-assets.md` explains how to regenerate source demo assets and optionally convert them to GIF/video with external tools outside the repo.
- [ ] `docs/demo-assets/receipt-flow-demo.svg` shows the public-safe `Vault -> Policy -> Context Pack -> Model Boundary -> Receipt -> Verifier` storyboard without provider deletion, model-forgetting, hosted-readiness, compliance, or customer-deployment claims.
- [ ] `docs/hosted-docs-hub.md` identifies public-safe docs to include, legal-review-gated docs/topics to exclude, and static deployment boundaries.
- [ ] Static docs hub work must not mutate `github-upload/enigma-memory-site/**`, `enigma-deploy/**`, Cloudflare, npm, GitHub, or the existing public website/homepage.

## CI package gate expectations

- [ ] `.github/workflows/ci.yml` runs the same package gates expected locally: `npm run check`, `npm test`, and `npm pack --dry-run`.
- [ ] CI runs on Node 24 on Ubuntu and Windows where GitHub-hosted runners support the package gates.
- [ ] Ubuntu CI runs `npm run release:audit` only when that script is present.
- [ ] CI does not require Docker daemon access, cloud credentials, deployment credentials, npm publish credentials, domains, KMS/secrets, SIEM routes, or legal/compliance approvals.
- [ ] CI green status is package evidence only. It does not replace manual website review, deployment readiness review, legal/compliance review, or hosted/BYOC operator acceptance.
- [ ] CI may upload `.enigma/release-provenance.json` as a build artifact when `npm run provenance:local -- --out ./.enigma/release-provenance.json` is present, but that artifact remains local/build-run checksum evidence unless a separate signing or registry attestation system is added.
- [ ] CI may upload `.enigma-review-packet/` as a build artifact when `npm run review:packet -- --out ./.enigma-review-packet` is present, but that artifact remains local/build-run evidence unless a separate signing, registry provenance, deployment attestation, or legal/compliance process is added.
- [ ] `docs/public-github-repo-setup.md` is followed before making a public GitHub repository, including branch protection that requires `Package gates (ubuntu-latest)` and `Package gates (windows-latest)` from `.github/workflows/ci.yml`; seed or refresh those statuses through push, pull request, or CI `workflow_dispatch`.
- [ ] `.github/workflows/npm-publish.yml` remains manual-only through `workflow_dispatch`, runs on Node 24, requires a `package_version` input matching `package.json`, runs `npm run check`, `npm test`, and `npm pack --dry-run`, uses the `npm-publish` environment for manual approval, and references npm credentials only through the `NPM_TOKEN` secret.
- [ ] npm publish evidence is bounded to registry publication/provenance for that package version. It does not prove provider deletion, model forgetting, hosted/BYOC readiness, Cloudflare/website deployment, legal approval, compliance certification, or guaranteed financial outcomes.

Package inspection commands:

```sh
cd enigma
node --input-type=module -e "const { execFileSync } = await import('node:child_process'); const pack = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json'], { encoding: 'utf8' }))[0]; const files = new Set(pack.files.map((file) => file.path)); for (const required of ['package.json', 'README.md']) { if (!files.has(required)) throw new Error(`missing packed file ${required}`); } if (![...files].some((file) => /^LICENSE(\\.|$)/.test(file))) throw new Error('missing packed LICENSE artifact'); console.log('packed README/package/LICENSE coverage checked')"
node --input-type=module -e "const { readFile } = await import('node:fs/promises'); const pkg = JSON.parse(await readFile('package.json', 'utf8')); const bins = Object.entries(pkg.bin); for (const [name, file] of bins) { const text = await readFile(file, 'utf8'); if (!text.startsWith('#!/usr/bin/env node')) throw new Error(`${name} missing node shebang`); } if (pkg.license !== 'Apache-2.0') throw new Error('license metadata mismatch'); console.log('bin shebangs and license metadata checked')"
node --input-type=module -e "await import('./packages/core/src/index.js'); await import('./packages/connectors/src/index.js'); await import('./packages/importers/src/index.js'); await import('./apps/relay/src/server.mjs'); await import('./apps/gateway/src/server.mjs'); const { readFile } = await import('node:fs/promises'); await readFile('./apps/desktop/src/index.html', 'utf8'); console.log('source imports checked')"
npm run registry:verify -- --execute
npm install -g enigma-memory
enigma quickstart --bundle ./.enigma/bundle.json --overwrite
enigma doctor
enigma-relay demo
enigma-gateway demo
printf '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2024-11-05\",\"capabilities\":{},\"clientInfo\":{\"name\":\"manual\",\"version\":\"0\"}}}\\n' | ENIGMA_BUNDLE=\"$PWD/.enigma/bundle.json\" enigma-mcp
```

## Local provenance/SBOM checksum evidence

- [ ] Run `npm run provenance:local -- --out ./.enigma/release-provenance.json` from the checkout or artifact directory being reviewed.
- [ ] Confirm the JSON records package-surface file inventory and SHA-256 values for the files the command inventories.
- [ ] Compare an individual file by recomputing its SHA-256 from disk and matching it against the recorded `sha256` value.
- [ ] Compare two provenance files by comparing their recorded `(path, sha256)` pairs; changed hashes, added paths, and removed paths are local inventory drift.
- [ ] When package contents matter, compare the provenance `files` inventory with `npm pack --dry-run` output. `npm pack --dry-run` previews tarball contents; local provenance records local checksums for package-surface files and does not publish or attest the package.
- [ ] When the public site artifact matters, build the artifact first, then rerun provenance and inspect `public_site_manifest`. That optional checksum covers the local public-site manifest when present; it is not Cloudflare deployment, DNS, TLS, cache state, or live availability evidence.

Portable checksum spot check:

```sh
cd enigma
npm run provenance:local -- --out ./.enigma/release-provenance.json
node --input-type=module -e "import { createHash } from 'node:crypto'; import { readFile } from 'node:fs/promises'; const file = process.argv[1]; const hash = createHash('sha256').update(await readFile(file)).digest('hex'); console.log('sha256:' + hash + '  ' + file);" README.md
```

Use [`release-provenance-and-sbom.md`](release-provenance-and-sbom.md) for reviewer interpretation. The local provenance/SBOM file is not a signed attestation, registry provenance, source-control commit proof, SLSA claim, compliance certification, Docker image digest, or hosted/cloud deployment proof.

## Reviewer packet handoff

- [ ] Build or identify the generated public-site artifact when public pages are in scope, for example with `python scripts/build_public_site.py`; otherwise omit `--public-site`.
- [ ] Run `npm run review:packet -- --out ./.enigma-review-packet --public-site ./_public_site` from the checkout or artifact directory being reviewed, replacing `./_public_site` with the generated artifact path when needed.
- [ ] Open `.enigma-review-packet/REVIEW_PACKET_MANIFEST.json` first and confirm it lists the included files, byte counts, and `sha256:<hex>` checksums.
- [ ] Inspect `evidence/release-audit.json`, `evidence/local-provenance.json`, `package/npm-pack-dry-run.json`, copied `docs/`, and `site/` when present. Treat the manifest as the source of truth for the exact files included in that packet.
- [ ] Spot-check packet checksums by recomputing SHA-256 from disk and matching the manifest entry for the same relative path.
- [ ] Confirm the packet excludes private/internal launch collateral, local `.enigma` vault state, raw memory examples, provider exports, credentials, secrets, tokens, logs, and unpublished legal/token/investment-sensitive collateral.
- [ ] Record missing Docker runtime, npm publication, live Cloudflare, hosted/BYOC, legal/compliance, signed-provenance, registry-attestation, or source-control evidence as explicit blockers rather than treating the packet as proof.

Use [`reviewer-packet.md`](reviewer-packet.md) for the full packet workflow and evidence limits.

## Local no-network acceptance

- [ ] Local CLI path works without relay, gateway, browser, hosted cloud, or provider credentials.
- [ ] Local bundle is created on disk.
- [ ] Local memory lifecycle emits receipts.
- [ ] Exported bundle verifies offline.
- [ ] Boundary harness reports a declared classification instead of claiming unobserved provider behavior.
- [ ] Local memory benchmark reports `enigma.memory_benchmark_suite.v1`, exact-answer recall, abstention correctness, context-token reduction, p50/p95 operation latency, duplicate removal, cross-provider profile rows, citations, and explicit no-ROI/no-provider-deletion/no-model-forgetting boundaries before performance or retention language is released.

Commands:

```sh
ENIGMA_RELEASE_CHECK_MEMORY="$(node --input-type=module -e "const { randomUUID } = await import('node:crypto'); console.log(randomUUID())")"
ENIGMA_RELEASE_CHECK_QUERY="$ENIGMA_RELEASE_CHECK_MEMORY"
enigma init --bundle ./.enigma/bundle.json --subject local-user --display-name "Local user"
enigma remember --bundle ./.enigma/bundle.json --text "$ENIGMA_RELEASE_CHECK_MEMORY" --purpose release_check --tags preference
enigma context --bundle ./.enigma/bundle.json --query "$ENIGMA_RELEASE_CHECK_QUERY" --purpose release_check --out ./.enigma/context-pack.json
enigma export --bundle ./.enigma/bundle.json --out ./.enigma/export.json
enigma verify --bundle ./.enigma/export.json
enigma boundary run --scenario committed_crossing
```

Release-note wording must say local/no-network operation proves Enigma-controlled local state only. It must not say Enigma made any provider forget.

## MCP and connector acceptance

- [ ] `enigma-mcp` starts over stdio.
- [ ] `initialize` succeeds.
- [ ] `tools/list` includes `enigma_init`, `enigma_remember`, `enigma_search`, `enigma_context_pack`, `enigma_delete`, and `enigma_verify_receipts`.
- [ ] `resources/list` includes `enigma://passport/summary`.
- [ ] `prompts/list` includes `enigma_standard_memory_prompt`.
- [ ] `enigma doctor` reports connector state without writing unrelated settings.
- [ ] `enigma connect <client>` creates or merges an Enigma MCP server entry.
- [ ] `enigma connect <client> --mcp-command <path>` renders the requested command for GUI apps that do not inherit shell PATH.
- [ ] `--command <path>` remains an alias for `--mcp-command`.
- [ ] `enigma disconnect <client>` removes only the Enigma entry.
- [ ] Existing client config is backed up before changed writes.

Commands:

```sh
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"manual","version":"0"}}}\n{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n{"jsonrpc":"2.0","id":3,"method":"resources/list","params":{}}\n{"jsonrpc":"2.0","id":4,"method":"prompts/list","params":{}}\n' | ENIGMA_BUNDLE="$PWD/.enigma/bundle.json" enigma-mcp

enigma doctor
enigma install --bundle "$HOME/.enigma/bundle.json"
enigma connect claude-desktop --bundle "$HOME/.enigma/bundle.json"
enigma connect cursor --bundle "$HOME/.enigma/bundle.json"
enigma connect kimi-code --bundle "$HOME/.enigma/bundle.json" --mcp-command "/absolute/path/to/enigma-mcp"
enigma connect vscode-cline --bundle "$HOME/.enigma/bundle.json"
enigma connect roo --bundle "$HOME/.enigma/bundle.json"
enigma connect opencode --bundle "$HOME/.enigma/bundle.json"
enigma connect generic-mcp --bundle "$HOME/.enigma/bundle.json" --command "/absolute/path/to/enigma-mcp"
```

Connector docs must include Claude Desktop, Cursor, Kimi Code, VS Code/Cline, Roo Code, OpenCode, and generic MCP config paths.

## Importer and capsule acceptance

- [ ] Importers accept parsed JSON or text exports without calling provider services.
- [ ] Import reports preserve source references, limitations, confidence, and completeness.
- [ ] `complete: true` is emitted only when the source explicitly reports completeness.
- [ ] Imported candidates become canonical only after vault writes.
- [ ] Public capsule verifier metadata contains hashes, roots, counts, report hashes, limitations root, completeness summary, and trust descriptor, not raw memory plaintext.

Commands:

```sh
enigma import chatgpt --file ./chatgpt-export.json --out ./enigma-chatgpt-report.json
enigma import claude --file ./claude-memory.json --out ./enigma-claude-report.json
enigma import mem0 --file ./mem0-export.json --out ./enigma-mem0-report.json
enigma import letta --file ./letta-agent.json --out ./enigma-letta-report.json
enigma import langgraph --file ./langgraph-store.json --out ./enigma-langgraph-report.json
enigma import graphiti --file ./zep-graphiti-export.json --out ./enigma-graphiti-report.json
enigma capsule export --file ./enigma-chatgpt-report.json --out ./enigma-capsule.json
enigma capsule import --file ./enigma-capsule.json --bundle "$HOME/.enigma/bundle.json"
```

Demo command:

```sh
node --input-type=module -e "import { runImporterDemo } from './enigma/packages/importers/src/index.js'; const result = runImporterDemo(); console.log(JSON.stringify(result, null, 2)); process.exitCode = result.ok ? 0 : 1;"
```

## Browser extension acceptance

- [ ] Extension is loaded from `apps/browser-extension` as an unpacked Manifest V3 extension.
- [ ] Native messaging host is registered as `com.enigma.native_host`.
- [ ] Extension requests context from the local native host only after an explicit user action.
- [ ] Extension inserts plain text only after explicit approval.
- [ ] Extension does not use `chrome.storage.sync` for raw memory.
- [ ] Insertion records contain target metadata, timestamp, receipt metadata, and counts only.
- [ ] Receipt metadata rejects plaintext-like fields before insertion records are sent.

Manual path:

```text
Open browser extension management -> enable developer mode -> load unpacked -> choose enigma/apps/browser-extension
```

The browser extension must not claim that provider-side prompts, memories, telemetry, or hidden caches are deleted after insertion.

## Desktop scaffold acceptance

- [ ] Static scaffold is present at `apps/desktop/src/index.html`.
- [ ] Scaffold can load without external runtime dependencies.
- [ ] Screens exist for vault, MCP server, clients, import/export, verifier, delete/prove, mesh, and enterprise.
- [ ] UI copy says desktop state is operational evidence only, not cryptographic proof.

Commands:

```sh
cd enigma
node --input-type=module -e "import { readFile } from 'node:fs/promises'; const html = await readFile('apps/desktop/src/index.html', 'utf8'); console.log(html.includes('Enigma Desktop Shell') && html.includes('Desktop shell state is operational evidence only') ? 'desktop ok' : 'desktop missing copy');"
```

Optional local preview:

```sh
cd enigma
python -m http.server 4173
```

Open `http://127.0.0.1:4173/apps/desktop/src/index.html`.

## Relay acceptance

- [ ] `enigma-relay demo` returns an `ok` result.
- [ ] `enigma-relay serve` starts an HTTP server.
- [ ] `GET /health` returns relay health.
- [ ] `POST /relay/push` accepts opaque encrypted payloads.
- [ ] Relay rejects plaintext-looking memory fields.
- [ ] `POST /witness/checkpoint` signs roots/checkpoint metadata only.
- [ ] `POST /pairing/challenge` and `POST /pairing/complete` complete the public-key pairing flow.

Commands:

```sh
enigma-relay demo
enigma-relay serve --host 127.0.0.1 --port 8787
curl http://127.0.0.1:8787/health
curl -X POST http://127.0.0.1:8787/relay/push \
  -H 'content-type: application/json' \
  --data '{"capsule_id":"cap_release_1","opaque_encrypted_record":"age1-example-ciphertext-only"}'
```

The relay must not receive raw memory text, prompts, completions, transcripts, or conversations.

## Gateway acceptance

- [ ] `enigma-gateway demo` returns an `ok` result.
- [ ] `enigma-gateway serve` starts an HTTP server.
- [ ] `GET /health` returns gateway identity and policy hash.
- [ ] `GET /policy` returns active policy.
- [ ] `PUT /policy` accepts only valid default-deny policies with provider-native memory set to cache-only.
- [ ] `POST /gateway/evaluate` denies unknown providers/models/regions/purposes/sensitivities.
- [ ] `POST /gateway/decision` emits a signed decision and local verification result.
- [ ] `GET /siem/export` returns plaintext-minimized SIEM events.

Commands:

```sh
enigma-gateway demo
enigma-gateway serve --host 127.0.0.1 --port 8797
curl http://127.0.0.1:8797/health
curl http://127.0.0.1:8797/policy
curl -X POST http://127.0.0.1:8797/gateway/decision \
  -H 'content-type: application/json' \
  --data '{"schema":"enigma.gateway_request.v1","operation":"retrieve","provider":"kimi","model":"kimi-k2","region":"us-east-1","purpose":"support_retrieval","sensitivity":"internal","memory_addr":"addr_committed_memory","memory_id":"mem_allowed","subject_id":"employee_123"}'
curl http://127.0.0.1:8797/siem/export
```

The gateway must not send raw memory plaintext to SIEM or decision artifacts.

## Docker acceptance

- [ ] `Dockerfile` builds from the source checkout without requiring package-manager install at runtime.
- [ ] `docker-compose.yml` starts relay with direct bin `enigma-relay`.
- [ ] `docker-compose.yml` starts gateway with direct bin `enigma-gateway`.
- [ ] Relay and gateway expose only loopback-bound demo ports by default.
- [ ] Images do not bake vault bundles, private keys, deployment credentials, tenant credentials, or cloud secrets.
- [ ] Production deployment uses external secrets, durable storage, TLS ingress, monitoring, backups, restore procedures, incident response, and log retention.

Local source-checkout image commands:

```sh
cd enigma
docker build -t enigma-local:dev .
docker run --rm --entrypoint enigma-relay enigma-local:dev demo
docker run --rm --entrypoint enigma-gateway enigma-local:dev demo
docker run --rm -p 127.0.0.1:8787:8787 --entrypoint enigma-relay enigma-local:dev serve --host 0.0.0.0 --port 8787
docker run --rm -p 127.0.0.1:8797:8797 --entrypoint enigma-gateway enigma-local:dev serve --host 0.0.0.0 --port 8797
```

Compose smoke:

```sh
cd enigma
docker compose up --build relay gateway
curl http://127.0.0.1:8787/health
curl http://127.0.0.1:8797/health
```

The Docker assets are local relay/gateway demos. Hosted/BYOC container releases still require real infrastructure, runtime secrets, durable storage, TLS, monitoring, backup/restore, and incident response.

## Hosted cloud product contracts

- [ ] `packages/hosted-cloud/src/index.js` exports pure builders and validators for user account, tenant, hosted vault, API key, usage billing record, dashboard summary, backup drill, and incident/SLA reference contracts.
- [ ] `test/enigma-hosted-cloud-contracts.test.mjs` covers contract creation, external blocker surfacing, provided evidence refs, and rejection of raw memory, prompts, provider responses, credentials, financial outcome claims, provider-side deletion/model-forgetting claims, and missing operator evidence refs.
- [ ] `docs/hosted-cloud-product.md` states what is production contract-ready and what remains externally blocked: auth provider, billing provider, legal docs, data processing terms, support ownership, and external security review.
- [ ] Release notes and sales collateral state hosted cloud is contract-ready only until external provider wiring and operator go-live evidence are complete.

## Hosted and BYOC enterprise acceptance

Hosted mode cannot be marked released until:

- [ ] Deployment credentials exist in the deployment platform, not in the repo.
- [ ] Domain and TLS are configured.
- [ ] Durable storage is configured for relay/gateway state that must survive restarts.
- [ ] KMS/secrets are configured for signing keys, database credentials, API tokens, and tenant credentials.
- [ ] Tenant policy lifecycle is documented, including approval, rollback, retention, legal hold, and audit routing.
- [ ] Audit/SIEM export destination is configured and plaintext-minimized.
- [ ] Monitoring, alerting, backup, restore, and incident response are configured and owned.
- [ ] Privacy-preserving analytics, if enabled, follow `docs/privacy-preserving-analytics.md`: no cookies, no fingerprinting, DNT/GPC respected, raw IPs discarded, event dimensions allowlisted, retention bounded, and no memory/prompt/provider payloads collected.

BYOC mode cannot be marked released until:

- [ ] Customer-controlled deployment path exists in the customer's cloud, VPC, cluster, or private network.
- [ ] Customer KMS/secrets path is documented.
- [ ] Customer durable storage, backup target, retention, and restore owner are documented.
- [ ] Network ingress/egress policy and private admin access are documented.
- [ ] SIEM/log ownership and plaintext-minimization requirements are documented.
- [ ] Data residency, retention, deletion, legal hold, and incident contacts are documented.
- [ ] Acceptance states that Enigma supplies package/service artifacts and the customer supplies infrastructure and credentials.

Both modes must state that provider-native memory is cache only and that Enigma proofs cover Enigma-controlled state only. Without domain/cloud/customer credentials, auth provider wiring, billing provider wiring, legal docs, data processing terms, support ownership, external security review, and operator acceptance, acceptance remains limited to local package, contract validation, and Docker demos.

## Honesty and claim boundaries

Allowed claims:

- Enigma can prove a receipt or bundle verifies offline.
- Enigma can prove a local active set includes or excludes a committed memory address.
- Enigma can prove a tombstone exists in Enigma state.
- Enigma can prove a relay stored only an opaque encrypted record and signed root metadata.
- Enigma can prove a gateway decision followed a specific Enigma enterprise policy hash.
- Enigma can prove an importer preserved source limitations and completeness flags.

Forbidden claims:

- Provider deletion: do not claim a provider physically deleted every hidden copy.
- Model forgetting: do not claim a model weight, hidden cache, telemetry stream, or provider personalization layer forgot.
- Semantic forgetting: do not claim semantic erasure from model outputs, hidden personalization, embeddings, summaries, caches, or third-party systems outside Enigma state.
- Source completeness: do not claim imported provider memory is complete unless the source explicitly says complete and the importer preserves that fact.
- Truth of memory: do not claim a signed memory is factually true; receipts prove custody/lifecycle, not truth.
- Compliance: do not claim SOC 2, HIPAA, GDPR, or other compliance status unless separately audited and approved.
- Token economics: do not claim token ROI, profit, equity, revenue share, investment return, or price expectations.
- Hardware: do not claim tamper-proof hardware or raw compute superiority.
- Benchmarks: do not claim benchmark leadership, performance superiority, retention quality, cross-provider superiority, or token-reduction/savings outcomes unless the repository contains the measured test command, result, citations, and review approval; run `node scripts/run-memory-benchmarks.mjs` before making any local fixture performance or retention claim.
- Hosted/BYOC availability: do not claim hosted cloud or customer BYOC deployment is live without deployment credentials, domain/TLS, durable storage, KMS/secrets, monitoring, backups, incident ownership, and SIEM/log routing.

## Release notes language

Use:

```text
Enigma provides a local canonical memory vault, MCP connectors, offline-verifiable receipts, importer/capsule flows, and local relay/gateway policy surfaces. Hosted Enigma cloud requires deployment credentials and operator infrastructure. Provider-native memory is treated as cache only.
```

Do not use:

```text
Enigma deletes memories from every AI provider and makes models forget.
```
