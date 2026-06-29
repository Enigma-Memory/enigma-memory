# Enigma Memory

A local-first Memory Drive for the AI apps you already use.

For most people, start with the Enigma Memory desktop app. The public launch target is a signed desktop installer with in-app setup; until Windows signing and macOS notarization are complete, use unsigned builds only for testing or wait for the signed release.

- [Download status](#download-the-desktop-app)
- [Check public launch status](website/launch-status.html)
- [Understand Memory Controller decisions](docs/memory-controller.md)

## Download the desktop app

1. Go to the [download page](website/download.html) or the Enigma Memory website.
2. Check the current platform status. Signed Windows and macOS installers are the consumer target; unsigned development builds are testing-only until signing evidence is complete.
3. When a signed installer is available for your platform, open it and follow the first-run setup flow.
4. Enigma creates a local vault, detects installed AI clients, and previews connection changes before applying them.

The desktop app bundles its runtime. Consumers should not install Node or npm for the default path; command-line setup is advanced developer/troubleshooting material.

The desktop app uses the [Memory Controller](docs/memory-controller.md) to show Memory Weather, app permissions, recall approval, and `safe to share` / `not shared` decisions before Enigma offers context to a connected app.
Consent grant scopes are canonicalized before verification, so the same app, purpose, operation set, and memory-zone set behave the same regardless of list order without widening what the app may access.

For the public launch desktop flow, pair this with the [consumer onboarding UX plan](docs/public-launch/consumer-onboarding-ux.md), which keeps app permissions just-in-time and CLI/MCP details secondary.

## Privacy and proof boundaries

Enigma Memory keeps its canonical vault on your device. You choose which AI clients are connected and what context they can use. Connected clients may still have their own logs, retention, and caches outside Enigma control.

Enigma proves facts about Enigma-controlled vault state, receipts, checkpoints, and declared boundary operations. Enigma does not claim facts about a provider's own stored copies, hidden personalization, or model state.
Enigma does not claim that a closed provider deleted internal data; it only proves declared Enigma-controlled lifecycle events.

For details, see:

- [Privacy](website/privacy.html)
- [Proofs](website/proofs.html)
- [FAQ](website/faq.html)

## Developer CLI

Developers and power users can use the CLI appendix for npm, MCP stdio, source checkout, and manual JSON examples. This is not the default consumer setup.

### Install with npm

Prerequisites:

- Node.js `>=24`
- A private local bundle file selected by the user
- No database, provider login, cloud login, hosted Enigma account, or external account for the local setup path

```sh
npm install -g enigma-memory
ENIGMA_BUNDLE_FILE="<private-bundle-file>"
enigma next --plain --bundle "$ENIGMA_BUNDLE_FILE"
enigma quickstart --bundle "$ENIGMA_BUNDLE_FILE"
enigma doctor --bundle "$ENIGMA_BUNDLE_FILE"
enigma drive health --bundle "$ENIGMA_BUNDLE_FILE"
enigma connect claude-desktop --bundle "$ENIGMA_BUNDLE_FILE" --dry-run
enigma status --bundle "$ENIGMA_BUNDLE_FILE"
```
`enigma next --plain` is the simplest first command: it prints one human-readable next step without requiring an existing bundle. `enigma quickstart` creates the local bundle; connector writes stay behind explicit `enigma connect <client> --dry-run` preview and a separate intentional connect command. `enigma status` includes `first_run_status`: one public-safe setup state, one primary action, and lanes for Memory Drive, Import Sandbox, memory inventory, proof activity, and diagnostics.
If `doctor` is red on a fresh install, read `setup_status.state`: `setup_needed` means run the included `setup_status.next_command`; `attention_needed` means a real local install/config issue remains.
For support, use `enigma support summary --bundle "$ENIGMA_BUNDLE_FILE"` and share only that redacted JSON unless support explicitly asks for a private local artifact.

Optional instant-value import preview:

```sh
enigma import text --file ./memories.md --complete
```

This prints a public-safe preview/receipt only, including duplicate groups/counts. Raw notes stay local and nothing is written to the vault unless an explicit import path is approved; approved `--write-vault` imports return a sanitized batch receipt with write refs and receipt hashes. To undo a local import, keep the private raw report written with `--out` and run `enigma import rollback --file <raw-report.json> --bundle <bundle.json>`.

Preview a single client before writing:

```sh
enigma connect claude-desktop --dry-run
enigma connect cursor --dry-run
enigma connect kimi-code --dry-run
```

Remove `--dry-run` once the preview looks correct.

### MCP server

Run the Enigma MCP server over stdio:

```sh
ENIGMA_BUNDLE="$ENIGMA_BUNDLE_FILE" enigma-mcp
```

Or through the CLI:

```sh
ENIGMA_BUNDLE="$ENIGMA_BUNDLE_FILE" enigma mcp serve
```

Generic MCP client entry:

```json
{
  "mcpServers": {
    "enigma": {
      "command": "enigma-mcp",
      "args": [],
      "env": {
        "ENIGMA_BUNDLE": "<private-bundle-file>"
      }
    }
  }
}
```

Use `--mcp-command` (alias `--command`) when a GUI app cannot find shell-installed binaries or needs a `.cmd` path on Windows.

Memory Controller MCP clients use `enigma_memory_weather`, `enigma_consent_grant`, `enigma_recall_veto`, and `enigma_private_bubble` for public-safe Memory Weather, app permissions, recall approval / not-shared decisions, and private memory bubbles. These tools fail closed and return decision artifacts and refs only, not raw memory.

For grant-gated local context, create an opaque consent grant and require it before context is returned:

```sh
enigma controller grant --app-ref ref:app:cli --purpose-ref ref:purpose:cli_context --memory-zone-ref ref:zone:default --out grant.json
enigma context --bundle "$ENIGMA_BUNDLE_FILE" --query "project context" --require-grant --grant-file grant.json --proof
enigma controller revoke --grant-file grant.json --out grant.revoked.json
enigma context --bundle "$ENIGMA_BUNDLE_FILE" --query "project context" --require-grant --grant-file grant.revoked.json --proof
```

The first context call can return proof-gated context. The final context call fails closed because the revoked grant artifact is supplied. If the grant is missing, expired, revoked, or scoped to the wrong app/purpose/zone, Enigma returns `enigma.context_pack_recall_blocked.v1` with `context_pack_returned:false`. MCP clients can pass `revoked_grant_refs` so stale active grants fail closed locally.

### Connect clients

Supported connector profiles are:

- `claude-desktop`
- `cursor`
- `kimi-code`
- `vscode-cline`
- `roo`
- `opencode`
- `generic-mcp`

The one-command path above already connects every installed/config-present client. To connect or preview a single client instead:

```sh
enigma connect claude-desktop --dry-run
enigma connect cursor --dry-run
enigma connect kimi-code --dry-run
enigma connect generic-mcp --dry-run
```

### Browser extension and native host

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
enigma native-host manifest --browser chrome --host-path "<native-host-executable>" --extension-id "<extension-id>" --out ./com.enigma.native_host.json
```

Use `--browser edge` or `--browser firefox` for those browsers. Find unpacked Chrome IDs at `chrome://extensions` > Developer mode > Enigma > Details, Edge IDs at `edge://extensions` > Developer mode > Enigma > Details, and Firefox IDs at `about:debugging#/runtime/this-firefox` or from a stable `browser_specific_settings.gecko.id`/signed add-on ID. The host path must point to `enigma-native-host` or a wrapper that sets `ENIGMA_BUNDLE` before launching it.

The native host is inside the local trust boundary: protect the manifest, wrapper, executable, and `ENIGMA_BUNDLE` path from local modification. The extension does not use browser sync storage (`chrome.storage.sync`) at all and requires an explicit user click before inserting Enigma context into a supported provider page. Provider-native memory remains cache only; Enigma receipts do not prove provider deletion or model forgetting.

### Source checkout

Use a source checkout only when you need source-only docs, Docker assets, browser-extension scaffolding, package development, or release scripts:

```sh
git clone https://github.com/Enigma-Memory/enigma-memory.git
cd enigma-memory
npm run install:local -- --execute --init-vault --bundle "$ENIGMA_BUNDLE_FILE"
enigma doctor --bundle "$ENIGMA_BUNDLE_FILE"
```

`install:local` is dry-run unless `--execute` is present. The command above installs the checked-out package globally and creates a local vault bundle.

### Export and verify proof artifacts

```sh
enigma export --bundle "$ENIGMA_BUNDLE_FILE" --out ./enigma-export.json
enigma verify --export ./enigma-export.json
```

Exported proof artifacts contain encrypted/committed vault state and receipt metadata; do not paste raw memory plaintext into relay records, witness checkpoints, SIEM events, public proof artifacts, or shell command lines.

### Claim boundary

Enigma can honestly claim:

- A local Enigma vault contains or no longer serves a committed memory address.
- A memory create, retrieval, context-pack, update, or tombstone event produced a receipt that verifies offline.
- A boundary harness classified an observed boundary event as committed, blocked, out-of-scope, or failed.
- A relay stored an opaque encrypted record or signed a witness checkpoint without raw memory plaintext.
- A gateway decision followed a specific Enigma enterprise policy at a specific policy hash.

Enigma cannot honestly claim:

- Facts about a closed provider's internal copies.
- Changes to model training, fine-tuning, cache, telemetry, or hidden personalization state.
- Semantic changes across model outputs, hidden personalization, embeddings, summaries, caches, or third-party systems outside Enigma state.
- Completeness of imported provider memories unless the source export explicitly proves completeness.
- A signed memory statement is true in the real world; receipts prove custody and lifecycle, not factual correctness.
- Token ROI, profit, equity, revenue share, investment return, or token price expectation.
- Tamper-proof hardware or raw compute superiority.
- Benchmark leadership without measured repository evidence.
- Hosted cloud or customer BYOC deployment is live without cloud account credentials, domain/TLS, production durable storage, KMS, monitoring, backups, incident ownership, and SIEM/log routing.
- That a local review packet or local provenance/SBOM output is signed provenance, registry attestation, source-control evidence, SLSA level, compliance certification, Docker image digest/runtime evidence, npm publication, hosted/BYOC readiness, or hosted/cloud deployment proof.

## Documentation

- [`docs/install-anywhere.md`](docs/install-anywhere.md)
- [`docs/client-connectors.md`](docs/client-connectors.md)
- [`docs/memory-controller.md`](docs/memory-controller.md)
- [`docs/public-launch/consumer-onboarding-ux.md`](docs/public-launch/consumer-onboarding-ux.md)
- [`docs/public-api-reference.md`](docs/public-api-reference.md)
- [`SECURITY.md`](SECURITY.md)
- [`docs/security-threat-model.md`](docs/security-threat-model.md)
- [`docs/operator-acceptance-packet.md`](docs/operator-acceptance-packet.md)
- [`docs/production-release-checklist.md`](docs/production-release-checklist.md)
- [`apps/browser-extension/README.md`](apps/browser-extension/README.md)
- [`apps/native-host/README.md`](apps/native-host/README.md)
