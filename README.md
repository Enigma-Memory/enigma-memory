# Enigma Memory

A local-first Memory Drive for the AI apps you already use.

For most people, start with the signed Enigma Memory desktop app. It creates your local vault, connects supported assistants, and shows health/fix-it guidance without requiring Node, npm, terminal commands, or JSON editing.

- [Download the desktop app](#download-the-desktop-app)
- [Read privacy and proof boundaries](#privacy-and-proof-boundaries)

## Download the desktop app

1. Go to the [download page](website/download.html) or the Enigma Memory website.
2. Choose your platform: macOS, Windows, or Linux.
3. Open the signed installer and follow the first-run setup flow.
4. Enigma creates a local vault, detects installed AI clients, and previews connection changes before applying them.

The desktop app bundles its runtime. Consumers should not install Node or npm for the default path.

## Privacy and proof boundaries

Enigma Memory keeps its canonical vault on your device. You choose which AI clients are connected and what context they can use. Connected clients may still have their own logs, retention, and caches outside Enigma control.

Enigma proves facts about Enigma-controlled vault state, receipts, checkpoints, and declared boundary operations. Enigma does not claim that a closed provider deleted internal data, that model weights forgot, or that provider-native memory disappeared.

For details, see:

- [Privacy](website/privacy.html)
- [Proofs](website/proofs.html)
- [FAQ](website/faq.html)

## Developer CLI

Developers and power users can use the CLI appendix for npm, MCP stdio, source checkout, and manual JSON examples. This is not the default consumer setup.

### Install with npm

Prerequisites:

- Node.js `>=24`
- A local filesystem path for the Enigma vault bundle
- No database, provider credential, cloud credential, hosted Enigma account, or external account for the local setup path

```sh
npm install -g enigma-memory
enigma init
enigma setup --bundle "$HOME/.enigma/bundle.json" --client auto --connect-installed --overwrite
enigma drive health
enigma status
```

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
ENIGMA_BUNDLE="$HOME/.enigma/bundle.json" enigma-mcp
```

Or through the CLI:

```sh
ENIGMA_BUNDLE="$HOME/.enigma/bundle.json" enigma mcp serve
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

Use `--mcp-command` (alias `--command`) when a GUI app cannot find shell-installed binaries or needs a `.cmd` path on Windows.

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
enigma native-host manifest --browser chrome --host-path "/absolute/path/to/enigma-native-host" --extension-id "REPLACE_WITH_EXTENSION_ID" --out ./com.enigma.native_host.json
```

Use `--browser edge` or `--browser firefox` for those browsers. Find unpacked Chrome IDs at `chrome://extensions` > Developer mode > Enigma > Details, Edge IDs at `edge://extensions` > Developer mode > Enigma > Details, and Firefox IDs at `about:debugging#/runtime/this-firefox` or from a stable `browser_specific_settings.gecko.id`/signed add-on ID. The host path must be absolute and point to `enigma-native-host` or a wrapper that sets `ENIGMA_BUNDLE` before launching it.

The native host is inside the local trust boundary: protect the manifest, wrapper, executable, and `ENIGMA_BUNDLE` path from local modification. The extension does not use browser sync storage (`chrome.storage.sync`) at all and requires an explicit user click before inserting Enigma context into a supported provider page. Provider-native memory remains cache only; Enigma receipts do not prove provider deletion or model forgetting.

### Source checkout

Use a source checkout only when you need source-only docs, Docker assets, browser-extension scaffolding, package development, or release scripts:

```sh
git clone https://github.com/Enigma-Memory/enigma-memory.git
cd enigma-memory
npm run install:local -- --execute --init-vault --bundle ./.enigma/bundle.json
enigma doctor --bundle ./.enigma/bundle.json
```

`install:local` is dry-run unless `--execute` is present. The command above installs the checked-out package globally and creates a local vault bundle.

### Export and verify proof artifacts

```sh
enigma export --bundle ./.enigma/bundle.json --out ./.enigma/export.json
enigma verify --export ./.enigma/export.json
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

- A closed provider physically deleted all internal copies.
- A model forgot training, fine-tuning, cache, telemetry, or hidden personalization state.
- Enigma caused semantic forgetting across model outputs, hidden personalization, embeddings, summaries, caches, or third-party systems outside Enigma state.
- Imported provider memories are complete unless the source export explicitly proves completeness.
- A signed memory statement is true in the real world; receipts prove custody and lifecycle, not factual correctness.
- Token ROI, profit, equity, revenue share, investment return, or token price expectation.
- Tamper-proof hardware or raw compute superiority.
- Benchmark leadership without measured repository evidence.
- Hosted cloud or customer BYOC deployment is live without the required credentials, domain/TLS, production durable storage, KMS/secrets, monitoring, backups, incident ownership, and SIEM/log routing.
- That a local review packet or local provenance/SBOM output is signed provenance, registry attestation, git/source-control evidence, SLSA level, compliance certification, Docker image digest/runtime evidence, npm publication, hosted/BYOC readiness, or hosted/cloud deployment proof.

## Documentation

- [`docs/install-anywhere.md`](docs/install-anywhere.md)
- [`docs/client-connectors.md`](docs/client-connectors.md)
- [`docs/public-api-reference.md`](docs/public-api-reference.md)
- [`SECURITY.md`](SECURITY.md)
- [`docs/security-threat-model.md`](docs/security-threat-model.md)
- [`docs/operator-acceptance-packet.md`](docs/operator-acceptance-packet.md)
- [`docs/production-release-checklist.md`](docs/production-release-checklist.md)
- [`apps/browser-extension/README.md`](apps/browser-extension/README.md)
- [`apps/native-host/README.md`](apps/native-host/README.md)
