# Install Enigma anywhere

The default public-launch path is the signed Enigma Memory desktop app. Download, open the installer, and follow the guided first-run flow. No Node, npm, terminal, or JSON editing is required.

The command-line engine remains supported for developers and power users. Use it when you need npm-based automation, source checkout, Docker assets, browser-extension scaffolding, package development, or release scripts.

Hosted cloud and BYOC operation are waitlist/operator-deploy only; they require real deployment credentials, domains, TLS, durable storage, KMS/secrets, monitoring, backups, and operator/customer infrastructure. The relay and gateway binaries included in the package are local bootstrap probes, not a live hosted service. They are not activated by installing the package, running setup, or running the test drive.

## Default path: install the desktop app

1. Download the signed installer for your platform from the Enigma Memory website or release page.
2. Open the installer:
   - **macOS:** Open the signed, notarized disk image or package. If Gatekeeper appears, right-click and choose Open.
   - **Windows:** Run the signed installer. If SmartScreen appears, click More info, then Run anyway.
   - **Linux:** Mark the AppImage executable or install the distribution package.
3. Open Enigma Memory. The first-run setup creates your local vault.
4. Review detected AI clients, preview the connection change, and approve the clients you want to connect.
5. Check the health dashboard and follow any fix-it guidance.

The desktop app bundles its runtime. Consumers should not install Node or npm.

### Platform requirements

- macOS 13 or later for the signed, notarized installer.
- Windows 10 or later for the signed installer or Store/MSIX path.
- A recent Linux distribution for the AppImage or package.

A local filesystem path for the Enigma vault bundle is created during first run. No database, provider credential, cloud credential, npm publishing token, package registry account, or hosted Enigma account is required for the default desktop path.

## Advanced path: install with npm

Use npm only when you want the command-line engine instead of the desktop app.

### Requirements

- Node.js `>=24`
- A local filesystem path for the Enigma vault bundle
- No database, package registry account, provider credential, cloud credential, hosted Enigma account, or external account for the local test-drive or setup paths

### Install once, use everywhere

```sh
npm install -g enigma-memory
enigma quickstart --bundle ./.enigma/bundle.json
enigma doctor --bundle ./.enigma/bundle.json
enigma drive health --bundle ./.enigma/bundle.json
enigma connect claude-desktop --bundle ./.enigma/bundle.json --dry-run
enigma status --bundle ./.enigma/bundle.json
```

`enigma quickstart` is the credential-free first run that creates the local `.enigma` workspace, bundle, and proof artifacts. Connector writes stay behind explicit `enigma connect <client> --dry-run` preview and a separate intentional connect command. These commands emit deterministic, public-safe JSON or plain text without printing raw memory plaintext, and they run on Windows PowerShell via the `enigma.cmd` shim the npm global install adds.

Run quickstart before treating `enigma doctor` as a fully green install check. Doctor checks Node/package state, local paths, schemas, MCP command naming, and connector configs. On a fresh install it can return `ok:false` when an existing MCP client config points at a bundle that has not been initialized yet, or at a different bundle than the one you are checking. That is expected first-run state, not a package install failure. In JSON output, `setup_status.state:"setup_needed"` means run the included `setup_status.next_command`; `setup_status.state:"attention_needed"` means a real install/config issue still needs repair. The shortest safe path is `enigma quickstart --bundle ./.enigma/bundle.json`, then `enigma connect <client> --bundle ./.enigma/bundle.json --dry-run` before approving a connector write.

`enigma status` is the one-screen local setup view after a bundle exists. Read `first_run_status.primary_action` for the next consumer-safe step, and use the lanes to check Memory Drive, Import Sandbox, memory inventory, proof activity, and diagnostics without raw memory text.
`enigma next --plain` is safe to run before or after setup. If no bundle exists, it prints a human-readable `run_quickstart` action instead of a stack trace; after setup, it mirrors `first_run_status`. Omit `--plain` when automation needs JSON.
`enigma support summary --bundle ./.enigma/bundle.json` creates the redacted support artifact to share first when asking for help. It contains setup/diagnostic status and issue codes, not memory text, prompts, transcripts, credentials, provider responses, or local absolute paths.

For the one-off npm path, run `npx --yes --package enigma-memory enigma quickstart --bundle ./.enigma/bundle.json` before `npx --yes --package enigma-memory enigma doctor --bundle ./.enigma/bundle.json`. Running the npx doctor first can report a red generic-MCP connector if an existing client config names a not-yet-created bundle.

`enigma drive health` reports a SMART-style memory-drive health packet — freshness, duplicate rate, tombstone backlog, stale derived artifacts, receipt coverage, and connector health — from local metadata only, with no network calls or private payloads.

The local Enigma vault is the canonical memory passport. Provider-native memory is non-canonical cache only. Enigma proof covers Enigma-controlled vault state, receipts, checkpoints, committed roots, and exported bundle shape; it does not prove provider deletion, model forgetting, provider-native memory removal, hosted/BYOC availability, legal approval, ROI/savings, or compliance certification.

Optional public test drive without a global install:

```sh
npx --yes --package enigma-memory enigma test-drive --overwrite
```

## Source checkout versus package install

The npm package includes the package README, CLI help, bins, app/package source listed in `package.json`, and module exports. The source checkout contains this guide, the deployment runbook, the release checklist, `Dockerfile`, `docker-compose.yml`, browser-extension source/docs, and other source-only collateral. If you install only the package, use `enigma --help`, `enigma-verify --help`, `enigma-relay --help`, `enigma-gateway --help`, direct-bin demos, and the package README for local usage; use a source checkout or hosted docs for full runbooks, Docker demo assets, and browser-extension scaffolding.

For a complete surface map, see [`public-api-reference.md`](public-api-reference.md). It distinguishes stable local/package interfaces from source-only demos and hosted/BYOC deployment interfaces.

## Advanced path: install from this repository

From the repository root, use the local installer in preview mode first:

```sh
npm run install:local
npm run install:local -- --init-vault --bundle ./.enigma/bundle.json
```

`install:local` is dry-run by default. It validates Node.js `>=24`, resolves the local bundle path, previews `npm install -g .`, and emits public-safe JSON without printing local absolute paths, credentials, account IDs, or memory plaintext. It does not mutate global npm state or create a vault unless you explicitly request execute mode.

To perform the local global install from the checkout and initialize a local vault bundle:

```sh
npm run install:local -- --execute --init-vault --bundle ./.enigma/bundle.json
enigma doctor --bundle ./.enigma/bundle.json
enigma --help
```

Equivalent explicit source-checkout steps:

```sh
npm install -g .
enigma init --bundle ./.enigma/bundle.json --subject local-user --display-name "Local user"
enigma doctor --bundle ./.enigma/bundle.json
```

If you do not want a global install from the checkout, run the bins directly:

```sh
node apps/cli/bin/enigma.mjs --help
node apps/verifier/bin/enigma-verify.mjs --help
```

## Manual local no-network path

Use this when you want to inspect each step behind the setup-first path:

```sh
mkdir -p .enigma
ENIGMA_DEMO_MEMORY_FILE=/path/to/tenant-approved-smoke-memory.txt
test -f "$ENIGMA_DEMO_MEMORY_FILE"
enigma init --bundle ./.enigma/bundle.json --subject local-user --display-name "Local user"
enigma remember --bundle ./.enigma/bundle.json --text-file "$ENIGMA_DEMO_MEMORY_FILE" --purpose user_memory --tags local
enigma context --bundle ./.enigma/bundle.json --query "local context" --purpose local_context --out ./.enigma/context-pack.json
enigma export --bundle ./.enigma/bundle.json --out ./.enigma/export.json
enigma verify --export ./.enigma/export.json
```

Windows PowerShell equivalent:

```powershell
New-Item -ItemType Directory -Force .enigma
$env:ENIGMA_DEMO_MEMORY_FILE='C:\path\to\tenant-approved-smoke-memory.txt'
if (-not (Test-Path $env:ENIGMA_DEMO_MEMORY_FILE)) { throw 'Set ENIGMA_DEMO_MEMORY_FILE to a tenant-approved smoke file first.' }
enigma init --bundle .\.enigma\bundle.json --subject local-user --display-name "Local user"
enigma remember --bundle .\.enigma\bundle.json --text-file $env:ENIGMA_DEMO_MEMORY_FILE --purpose user_memory --tags local
enigma context --bundle .\.enigma\bundle.json --query "local context" --purpose local_context --out .\.enigma\context-pack.json
enigma export --bundle .\.enigma\bundle.json --out .\.enigma\export.json
enigma verify --export .\.enigma\export.json
```

The local bundle is the canonical state for this path. Provider-native memory is cache only. Exported proof and network artifacts should contain commitments, roots, addresses, receipt ids, and encrypted payloads, not raw memory plaintext.

Optional grant-gated context smoke:

```sh
enigma controller grant --app-ref ref:app:cli --purpose-ref ref:purpose:cli_context --memory-zone-ref ref:zone:default --out ./.enigma/grant.json
enigma context --bundle ./.enigma/bundle.json --query "local context" --require-grant --grant-file ./.enigma/grant.json --proof --out ./.enigma/context-proof.json
```

PowerShell path equivalent:

```powershell
enigma controller grant --app-ref ref:app:cli --purpose-ref ref:purpose:cli_context --memory-zone-ref ref:zone:default --out .\.enigma\grant.json
enigma context --bundle .\.enigma\bundle.json --query "local context" --require-grant --grant-file .\.enigma\grant.json --proof --out .\.enigma\context-proof.json
```

This checks Enigma-local consent before context is returned. It does not prove provider deletion, provider non-use, or model forgetting.

## MCP server

Run Enigma as an MCP stdio server:

```sh
ENIGMA_BUNDLE="$HOME/.enigma/bundle.json" enigma-mcp
```

CLI equivalent:

```sh
ENIGMA_BUNDLE="$HOME/.enigma/bundle.json" enigma mcp serve
```

Windows PowerShell:

```powershell
$env:ENIGMA_BUNDLE="$HOME\.enigma\bundle.json"
enigma-mcp
```

Generic client configuration:

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

MCP tools available through the server:

- `enigma_init`
- `enigma_next_action`
- `enigma_support_summary`
- `enigma_remember`
- `enigma_import_preview`
- `enigma_import_approve`
- `enigma_search`
- `enigma_context_pack`
- `enigma_delete`
- `enigma_verify_receipts`
- `enigma_memory_weather`
- `enigma_consent_grant`
- `enigma_recall_veto`
- `enigma_private_bubble`

MCP resource and prompt:

- Resource: `enigma://passport/summary`
- Prompt: `enigma_standard_memory_prompt`

## Client connector path

Use `docs/client-connectors.md` from a source checkout for Claude Desktop, Cursor, Kimi Code, VS Code/Cline, Roo Code, OpenCode, and generic MCP JSON. Connector entries default to command `enigma-mcp` and env key `ENIGMA_BUNDLE`.

Npm-first connector flow — preview one intended client before writing:

```sh
npm install -g enigma-memory
enigma quickstart --bundle ./.enigma/bundle.json
enigma connect claude-desktop --bundle ./.enigma/bundle.json --dry-run
```

To connect a client, review the dry-run output first and then repeat the same `enigma connect <client> --bundle ./.enigma/bundle.json` command without `--dry-run`. To inspect every installed/config-present client without writing, use `enigma status --bundle ./.enigma/bundle.json` or the desktop app's connection preview cards instead of an auto-connect overwrite command.

Copy-paste MCP snippets:

Claude Desktop:

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

Cursor:

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

Kimi Code:

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

Generic MCP:

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

If Kimi Code or another GUI-launched client cannot find shell-installed binaries, reconnect with an absolute MCP command because GUI apps may not inherit your terminal `PATH`:

```sh
enigma connect kimi-code --dry-run --mcp-command "/absolute/path/to/enigma-mcp"
enigma connect kimi-code --mcp-command "/absolute/path/to/enigma-mcp"
```

## Browser extension and native host path

The unpacked browser extension lives at:

```text
apps/browser-extension
```

The local native messaging host install assets live at:

```text
apps/native-host
```

Use [`../apps/native-host/README.md`](../apps/native-host/README.md) for the complete Chrome, Edge, and Firefox registration procedure. It documents the manifest generator, `native-host install-plan` preflight, manual templates for fallback, OS-specific native-host install locations, Windows registry keys, extension allowlists, and absolute-path requirements.

Minimum development load steps:

1. Install or build `enigma-native-host`.
2. Create a local Enigma bundle and keep `ENIGMA_BUNDLE` set to its absolute path. GUI-launched browsers may not inherit shell environment variables; if needed, point the native-host manifest at a local wrapper that sets `ENIGMA_BUNDLE` before launching `enigma-native-host`.
3. Find the unpacked extension ID: Chrome uses `chrome://extensions` > Developer mode > Enigma > Details; Edge uses `edge://extensions` > Developer mode > Enigma > Details; Firefox uses `about:debugging#/runtime/this-firefox` for temporary add-ons, or a stable `browser_specific_settings.gecko.id`/signed add-on ID for repeatable installs.
4. Resolve the absolute host executable or wrapper path. Do not use `~`, `$HOME`, `%USERPROFILE%`, shell aliases, `PATH` lookup, or command arguments in the manifest path.
5. Generate the manifest JSON with the native-host install-plan preflight:

   ```sh
   enigma native-host manifest --browser chrome --host-path "/absolute/path/to/enigma-native-host" --extension-id "REPLACE_WITH_EXTENSION_ID" --out ./com.enigma.native_host.json
   ```

   Use `--browser edge` or `--browser firefox` for those browsers. Without `--out`, the command prints manifest JSON to stdout. With `--out`, it writes the manifest file and reports `{ ok, path }`. It does not copy files into browser locations and does not write Windows registry keys.

   Then preview the manual copy/registration targets without mutating browser or OS state:

   ```sh
   enigma native-host install-plan --browser chrome --manifest "/absolute/path/to/com.enigma.native_host.json"
   ```

   Use `--browser edge` or `--browser firefox` for those browsers. Optional `--os windows|macos|linux` and `--home <absolute path>` flags preview another platform/user home. The JSON output includes `target_manifest_paths`, `manual_steps`, `registry_command_preview`, `firefox_manifest_directory`, and `writes_performed: false`. `writes_performed: false` is the safety boundary: the command does not create profile directories, copy manifests, or write registry keys. A user or operator still has to perform the displayed copy and, for Windows Chrome/Edge, review and run the displayed registry command.
6. Register the generated `com.enigma.native_host.json` at the browser/OS location documented in [`../apps/native-host/README.md`](../apps/native-host/README.md). The checked-in templates under `apps/native-host/manifests/` remain valid manifest templates for `com.enigma.native_host` and are the manual fallback if you cannot run the generator.
7. Open the browser extension management page, enable developer mode, and load `enigma/apps/browser-extension` as an unpacked extension.
8. Confirm the displayed extension ID matches the generated manifest allowlist.
9. Visit a supported provider page and use the Enigma control.

Native-host manifest install location quick reference:

| Browser | macOS per-user | Linux per-user | Windows per-user |
| --- | --- | --- | --- |
| Chrome | `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.enigma.native_host.json` | `~/.config/google-chrome/NativeMessagingHosts/com.enigma.native_host.json` | `HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.enigma.native_host` default value points to the manifest |
| Edge | `~/Library/Application Support/Microsoft Edge/NativeMessagingHosts/com.enigma.native_host.json` | `~/.config/microsoft-edge/NativeMessagingHosts/com.enigma.native_host.json` | `HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.enigma.native_host` default value points to the manifest |
| Firefox | `~/Library/Application Support/Mozilla/NativeMessagingHosts/com.enigma.native_host.json` | `~/.mozilla/native-messaging-hosts/com.enigma.native_host.json` | `HKCU:\Software\Mozilla\NativeMessagingHosts\com.enigma.native_host` default value points to the manifest |

All-users locations and exact copy/registry commands are in [`../apps/native-host/README.md`](../apps/native-host/README.md).

The extension requires explicit user approval before inserting context. It does not use browser sync storage (`chrome.storage.sync`) at all. It stores target metadata and receipt metadata for insertion records, not raw memory plaintext. The native host is a local trust boundary component: users must protect the manifest, wrapper, executable, and `ENIGMA_BUNDLE` path from unwanted local modification. Enigma cannot delete provider-side memories or force a provider model to forget.

## Desktop path

The desktop scaffold is static and dependency-free. Open `apps/desktop/src/index.html` directly from the filesystem or serve it locally. The scaffold models state and flows; cryptographic proof still comes from Enigma receipts and verifier output.

## Relay server path

Run the local relay demo through the direct bin:

```sh
enigma-relay demo
```

Equivalent main CLI command:

```sh
enigma relay demo
```

Start the local in-memory relay HTTP server:

```sh
enigma-relay serve --host 127.0.0.1 --port 8787
```

Health check:

```sh
curl http://127.0.0.1:8787/health
```

Push only an opaque encrypted relay record:

```sh
curl -X POST http://127.0.0.1:8787/relay/push \
  -H 'content-type: application/json' \
  --data '{"capsule_id":"cap_local_1","opaque_encrypted_record":"age1-example-ciphertext-only"}'
```

The relay rejects plaintext-looking memory fields. Do not send `memory`, `plaintext`, `content`, `text`, `prompt`, transcript, or conversation bodies to relay endpoints.

## Gateway server path

Run the local gateway demo through the direct bin:

```sh
enigma-gateway demo
```

Equivalent main CLI command:

```sh
enigma gateway demo
```

Start the local in-memory gateway HTTP server:

```sh
enigma-gateway serve --host 127.0.0.1 --port 8797
```

Health and policy:

```sh
curl http://127.0.0.1:8797/health
curl http://127.0.0.1:8797/policy
```

Evaluate a request by address/metadata, not plaintext:

```sh
curl -X POST http://127.0.0.1:8797/gateway/decision \
  -H 'content-type: application/json' \
  --data '{"schema":"enigma.gateway_request.v1","operation":"retrieve","provider":"kimi","model":"kimi-k2","region":"us-east-1","purpose":"support_retrieval","sensitivity":"internal","memory_addr":"addr_committed_memory","memory_id":"mem_allowed","subject_id":"employee_123"}'
```

Export minimized SIEM evidence:

```sh
curl http://127.0.0.1:8797/siem/export
```

The gateway evaluates Enigma enterprise policy and signs decisions. It does not call model providers and does not prove provider deletion or model forgetting.

## Docker relay/gateway path

The source checkout includes a local demo `Dockerfile` and `docker-compose.yml`. They install from the local package source and do not bake vault bundles, private keys, deployment credentials, tenant credentials, or cloud secrets into the image.

Build from the source checkout:

```sh
cd enigma
docker build -t enigma-local:dev .
```

Run direct-bin demos:

```sh
docker run --rm --entrypoint enigma-relay enigma-local:dev demo
docker run --rm --entrypoint enigma-gateway enigma-local:dev demo
```

Run relay and gateway servers:

```sh
docker run --rm -p 127.0.0.1:8787:8787 --entrypoint enigma-relay enigma-local:dev serve --host 0.0.0.0 --port 8787
docker run --rm -p 127.0.0.1:8797:8797 --entrypoint enigma-gateway enigma-local:dev serve --host 0.0.0.0 --port 8797
```

Compose path:

```sh
cd enigma
docker compose up --build relay gateway
```

Then check:

```sh
curl http://127.0.0.1:8787/health
curl http://127.0.0.1:8797/health
```

For production containers, replace in-memory state with durable storage, bind TLS at an ingress layer, mount secrets through your platform, and configure logging/metrics, backup/restore, and incident response. Do not bake vault bundles, private keys, or tenant credentials into images.

## Static public-site preflight

When the generated static launch site is part of an operator handoff, run the credential-free artifact preflight before any Cloudflare upload:

```sh
python scripts/preflight_public_site.py --site _public_site
```

Run it from the public-site package/artifact root after building or obtaining `_public_site`. The command reads local files only and reports `checked_counts`, `warnings`, and `blockers`; it does not use Cloudflare credentials, upload assets, change DNS/TLS, mutate cache state, or prove live availability. Treat a clean result as local artifact readiness only. Cloudflare deployment and domain verification still require the operator's account, credentials, and live checks.

## Enterprise hosted and BYOC modes

Both modes are waitlist/operator-deploy only. The relay and gateway binaries are local bootstrap probes; production hosted or BYOC operation requires real deployment credentials, domain/TLS, durable storage, KMS/secrets, monitoring, backups, incident response, and operator acceptance.

Hosted mode:

- Enigma operator deploys relay/gateway for the tenant.
- Requires deployment credentials, domain, TLS, KMS/secrets, durable storage, monitoring, backups, restore procedures, incident response, and release ownership.
- Tenant policy controls allowed providers, models, regions, purposes, sensitivities, retention, legal holds, and audit/SIEM routing.

BYOC mode:

- Customer deploys relay/gateway in its own cloud, VPC, cluster, or private network.
- Customer controls deployment credentials, KMS, logs, SIEM export, network policy, backups, data residency, and incident response.
- Enigma package supplies the local services and APIs; the customer supplies infrastructure and credentials.

Both modes:

- Provider-native memory is cache only.
- Enigma receipts/proofs are about Enigma-controlled state.
- No Enigma proof can establish that a closed provider deleted hidden copies or that a model forgot.
- Without real domain/cloud credentials, hosted/BYOC work remains limited to local source, package, and Docker demos.

See `docs/deployment-runbook.md` for the production and BYOC operating checklist.

## Verification commands

CLI/verifier:

```sh
ENIGMA_DEMO_MEMORY_FILE=/path/to/tenant-approved-smoke-memory.txt
test -f "$ENIGMA_DEMO_MEMORY_FILE"
enigma init --bundle ./.enigma/bundle.json
enigma remember --bundle ./.enigma/bundle.json --text-file "$ENIGMA_DEMO_MEMORY_FILE" --purpose verification
enigma export --bundle ./.enigma/bundle.json --out ./.enigma/export.json
enigma verify --export ./.enigma/export.json
```

MCP handshake:

```sh
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"manual","version":"0"}}}\n{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n' | ENIGMA_BUNDLE="$PWD/.enigma/bundle.json" enigma-mcp
```

Connector/importer/relay/gateway checks:

```sh
enigma doctor --bundle ./.enigma/bundle.json
enigma import chatgpt --file ./chatgpt-export.json --out ./enigma-import-report.json
enigma capsule export --file ./enigma-import-report.json --out ./enigma-capsule.json
enigma capsule import --file ./enigma-capsule.json --bundle "$PWD/.enigma/bundle.json"
enigma-relay demo
enigma-gateway demo
```

Module-level demos from a checkout:

```sh
node --input-type=module -e "import { runConnectorDemo } from './packages/connectors/src/index.js'; console.log(JSON.stringify(runConnectorDemo({ clientId: 'generic-mcp' }), null, 2));"
node --input-type=module -e "import { runImporterDemo } from './packages/importers/src/index.js'; console.log(JSON.stringify(runImporterDemo(), null, 2));"
```
