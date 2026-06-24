# Enigma user install guide

Enigma is provider-neutral AI memory/proof infrastructure. This guide gets a user from a local checkout to a working local Memory Passport, MCP server, client connector, receipt export, verifier run, browser/desktop preview, and relay/gateway demo.

Current launch status: Enigma has a local production foundation and installable package scaffolding. Hosted cloud relay, hosted gateway, and managed Enigma infrastructure are not live merely because the package is installed. Hosted operation requires deployment credentials, domain/TLS, durable storage, KMS/secrets, monitoring, backups, support, and incident response.

Proof boundary: Enigma receipts verify declared Enigma-mediated operations against Enigma-controlled vault, receipt, checkpoint, relay, witness, or gateway state. They do not prove factual truth, model intent, semantic forgetting, provider deletion, provider hidden-cache deletion, or complete side-channel absence.

## 1. Requirements

- Node.js `>=24`
- A local filesystem path for the Enigma vault bundle
- Optional: Docker for local relay/gateway container rehearsal
- Optional: Python for static desktop preview with `python -m http.server`
- No hosted cloud credentials are required for the local CLI, MCP, verifier, browser scaffold, desktop scaffold, relay demo, or gateway demo paths

Recommended local paths:

- macOS/Linux bundle: `$HOME/.enigma/bundle.json`
- Windows PowerShell bundle: `$HOME\.enigma\bundle.json`
- Repository-local bundle for demos: `./.enigma/bundle.json`

## 2. Install from this repository

From the repository root:

```sh
cd enigma
npm install -g .
enigma --help
enigma-verify --help
enigma-mcp
```

If you do not want a global install, run the package bins directly from the checkout:

```sh
cd enigma
node apps/cli/bin/enigma.mjs --help
node apps/verifier/bin/enigma-verify.mjs --help
node packages/mcp-server/bin/enigma-mcp.mjs
```

Expected result:

- `enigma --help` prints JSON with `usage: "enigma <command> [options]"` and commands including `init`, `doctor`, `install`, `connect <client>`, `remember`, `context`, `export`, `verify`, `mcp serve`, `relay demo`, and `gateway demo`.
- `enigma-verify --help` prints JSON with `usage: "enigma-verify <exported-bundle.json>"` and `output: "JSON verification report"`.
- `enigma-mcp` starts a stdio MCP process. Stop it with `Ctrl+C` when running it manually.

## 3. Future npm install after publication

After the public package is published as `@enigma-ai/enigma`:

```sh
npm install -g @enigma-ai/enigma
enigma --help
enigma doctor
```

One-off execution without a global install:

```sh
npx --yes --package @enigma-ai/enigma enigma --help
npx --yes --package @enigma-ai/enigma enigma doctor
npx --yes --package @enigma-ai/enigma enigma-mcp
```

Expected result:

- The package exposes bins `enigma`, `enigma-verify`, `enigma-mcp`, `enigma-relay`, and `enigma-gateway`.
- Local verification remains available without hosted Enigma cloud.

## 4. First local Memory Passport

Create a local vault, remember one preference, compile a scoped context pack, export proof material, and verify it:

```sh
mkdir -p .enigma
enigma init --bundle ./.enigma/bundle.json --subject local-user --display-name "Local user"
enigma remember --bundle ./.enigma/bundle.json --text "Prefers concise technical answers with security caveats." --purpose user_memory --tags preference
enigma context --bundle ./.enigma/bundle.json --query "technical answers" --purpose local_context --out ./.enigma/context-pack.json
enigma export --bundle ./.enigma/bundle.json --out ./.enigma/export.json
enigma verify --bundle ./.enigma/export.json
```

Windows PowerShell:

```powershell
New-Item -ItemType Directory -Force .enigma
enigma init --bundle .\.enigma\bundle.json --subject local-user --display-name "Local user"
enigma remember --bundle .\.enigma\bundle.json --text "Prefers concise technical answers with security caveats." --purpose user_memory --tags preference
enigma context --bundle .\.enigma\bundle.json --query "technical answers" --purpose local_context --out .\.enigma\context-pack.json
enigma export --bundle .\.enigma\bundle.json --out .\.enigma\export.json
enigma verify --bundle .\.enigma\export.json
```

Expected proof outputs:

- `enigma init` prints `ok: true`, the absolute `bundle` path, a bundle `schema`, and `subject_id: "local-user"`.
- `enigma remember` prints `ok: true`, a `memory_addr`, and a `receipt_id`.
- `enigma context` prints a context pack and writes `./.enigma/context-pack.json`.
- `enigma export` prints `ok: true`, an `export` path, and a non-zero `receipt_count`.
- `enigma verify` prints a JSON report with `ok: true`, `schema: "enigma.verification_report.v1"`, `receipt_count` greater than zero, and `errors: []`.

The local bundle is the canonical state for this path. Provider-native memory is cache only. Exported proof artifacts should contain commitments, roots, addresses, receipt ids, signatures, and encrypted payload references; do not publish raw memory plaintext.

## 5. Doctor and install snippets

Run the package and connector doctor:

```sh
enigma doctor
```

Run the connector snippet installer against the user-level bundle:

```sh
enigma install --bundle "$HOME/.enigma/bundle.json"
```

Write all generated connector snippets to a reviewable JSON file before touching client settings:

```sh
enigma install --bundle "$HOME/.enigma/bundle.json" --out ./enigma-mcp-snippets.json
```

Install snippets for one client only:

```sh
enigma install --client claude-desktop --bundle "$HOME/.enigma/bundle.json" --out ./enigma-claude-snippet.json
```

Expected result:

- `enigma doctor` prints `ok`, Node version information, package-bin checks, schema count, `mcp_command_name: "enigma-mcp"`, and connector profile status.
- `enigma install` prints `ok: true`, the resolved bundle path, `mcp_command: "enigma-mcp"`, `clients`, and `mcp_config_snippets`.
- If the bundle does not exist, `enigma install` creates it and reports `bundle_created: true`.

## 6. MCP server

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

Manual MCP handshake:

```sh
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"manual","version":"0"}}}\n{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n{"jsonrpc":"2.0","id":3,"method":"resources/list","params":{}}\n{"jsonrpc":"2.0","id":4,"method":"prompts/list","params":{}}\n' | ENIGMA_BUNDLE="$PWD/.enigma/bundle.json" enigma-mcp
```

Expected MCP proof surface:

- Tools include `enigma_init`, `enigma_remember`, `enigma_search`, `enigma_context_pack`, `enigma_delete`, and `enigma_verify_receipts`.
- Resources include `enigma://passport/summary`.
- Prompts include `enigma_standard_memory_prompt`.
- This verifies local MCP startup and tool discovery. It does not prove any hosted provider deleted memory or forgot context.

## 7. Client connector commands

Every supported connector starts the same MCP command, `enigma-mcp`, and sets `ENIGMA_BUNDLE` to the local vault bundle.

Create the local user bundle first. Connector setup only needs the bundle to exist; receipt verification happens after a memory operation and export.

```sh
enigma init --bundle "$HOME/.enigma/bundle.json" --subject local-user --display-name "Local user"
```

Connect supported clients:

```sh
enigma connect claude-desktop --bundle "$HOME/.enigma/bundle.json"
enigma connect cursor --bundle "$HOME/.enigma/bundle.json"
enigma connect kimi-code --bundle "$HOME/.enigma/bundle.json"
enigma connect vscode-cline --bundle "$HOME/.enigma/bundle.json"
enigma connect roo --bundle "$HOME/.enigma/bundle.json"
enigma connect opencode --bundle "$HOME/.enigma/bundle.json"
enigma connect generic-mcp --bundle "$HOME/.enigma/bundle.json"
```

Disconnect a client without removing unrelated client settings:

```sh
enigma disconnect claude-desktop
enigma disconnect cursor
enigma disconnect kimi-code
enigma disconnect vscode-cline
enigma disconnect roo
enigma disconnect opencode
enigma disconnect generic-mcp
```

Default connector config locations:

| Client | Connector ID | Default config paths |
| --- | --- | --- |
| Claude Desktop | `claude-desktop` | Windows `%APPDATA%\Claude\claude_desktop_config.json`; macOS `$HOME/Library/Application Support/Claude/claude_desktop_config.json`; Linux `$HOME/.config/Claude/claude_desktop_config.json` |
| Cursor | `cursor` | Windows `%USERPROFILE%\.cursor\mcp.json`; macOS/Linux `$HOME/.cursor/mcp.json` |
| Kimi Code | `kimi-code` | Windows `%APPDATA%\Kimi Code\mcp.json`; macOS `$HOME/Library/Application Support/Kimi Code/mcp.json`; Linux `$HOME/.config/kimi-code/mcp.json` |
| VS Code / Cline | `vscode-cline` | Windows `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`; macOS `$HOME/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`; Linux `$HOME/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json` |
| Roo Code | `roo` | Windows `%APPDATA%\Code\User\globalStorage\rooveterinaryinc.roo-cline\settings\mcp_settings.json`; macOS `$HOME/Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json`; Linux `$HOME/.config/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json` |
| OpenCode | `opencode` | Windows `%APPDATA%\opencode\opencode.json`; macOS `$HOME/Library/Application Support/opencode/opencode.json`; Linux `$HOME/.config/opencode/opencode.json` |
| Generic MCP | `generic-mcp` | Windows `%APPDATA%\Enigma\mcp.json`; macOS `$HOME/Library/Application Support/Enigma/mcp.json`; Linux `$HOME/.config/enigma/mcp.json` |

After `enigma connect`, restart or reload the client. Expected result: the client can start `enigma-mcp`, show Enigma MCP tools, and use the configured local bundle.

## 8. Browser extension scaffold

The unpacked browser extension lives at:

```text
apps/browser-extension
```

Development load steps:

1. Register a native messaging host named `com.enigma.native_host` in the browser profile.
2. Point that native host at a local process that can call the Enigma bundle or MCP APIs.
3. Open the browser extension management page.
4. Enable developer mode.
5. Load `enigma/apps/browser-extension` as an unpacked extension.
6. Visit a supported provider page.
7. Use the Enigma control to request context.
8. Approve insertion explicitly before any context is inserted into the page.

Expected behavior:

- The extension stores insertion metadata and receipt metadata, not raw memory plaintext in browser sync storage.
- Context insertion requires explicit user action.
- The extension cannot delete provider-side memories, force a provider model to forget, or prove provider telemetry behavior.

## 9. Desktop scaffold

The desktop scaffold is static and dependency-free:

```sh
cd enigma
node --input-type=module -e "import { readFile } from 'node:fs/promises'; const html = await readFile('apps/desktop/src/index.html', 'utf8'); console.log(html.includes('Enigma Desktop Shell') ? 'desktop scaffold present' : 'desktop scaffold missing');"
```

Open the UI directly:

```sh
cd enigma
python -m http.server 4173
```

Then open:

```text
http://127.0.0.1:4173/apps/desktop/src/index.html
```

If Python is unavailable, open `enigma/apps/desktop/src/index.html` directly from the filesystem.

Expected behavior:

- The desktop scaffold models vault, MCP, clients, import/export, verifier, deletion, mesh, and enterprise flows.
- Desktop UI state is operational evidence only. Cryptographic proof still comes from Enigma receipts and verifier output.

## 10. Relay demo and local relay server

Run the local relay demo:

```sh
enigma relay demo
```

Expected proof output includes:

- `ok: true`
- `pushed_opaque_record: true`
- `rejected_plaintext_record: true`
- `witness_checkpoint_verification_ok: true`
- `pairing_challenge_ok: true`
- `pairing_complete_ok: true`
- `witness.witness_checkpoint_id`
- `witness.witness_hash`
- `node.trust_descriptor`

Start the local in-memory relay HTTP server:

```sh
enigma relay serve --host 127.0.0.1 --port 8787
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

Relay boundary:

- Send opaque encrypted records, receipt roots, checkpoint roots, ids, and signatures.
- Do not send fields named `memory`, `plaintext`, `content`, `text`, `prompt`, transcript, conversation, or raw memory bodies to relay endpoints.
- The relay demo intentionally proves plaintext-looking records are rejected.

## 11. Gateway demo and local gateway server

Run the local gateway demo:

```sh
enigma gateway demo
```

Expected proof output includes:

- `ok: true`
- `allowed_retrieval: true`
- `denied_disallowed_region: true`
- `denied_legal_hold_delete: true`
- `signed_decision_verification_ok: true`
- `siem_event_plaintext_minimized: true`
- `policy`
- `gateway_decision`
- `verification.ok: true`
- `siem_export.event_count` greater than zero

Start the local in-memory gateway HTTP server:

```sh
enigma gateway serve --host 127.0.0.1 --port 8797
```

Health and policy:

```sh
curl http://127.0.0.1:8797/health
curl http://127.0.0.1:8797/policy
```

Evaluate a request by address and metadata, not plaintext:

```sh
curl -X POST http://127.0.0.1:8797/gateway/decision \
  -H 'content-type: application/json' \
  --data '{"schema":"enigma.gateway_request.v1","operation":"retrieve","provider":"kimi","model":"kimi-k2","region":"us-east-1","purpose":"support_retrieval","sensitivity":"internal","memory_addr":"addr_committed_memory","memory_id":"mem_allowed","subject_id":"employee_123"}'
```

Export minimized SIEM evidence:

```sh
curl http://127.0.0.1:8797/siem/export
```

Gateway boundary:

- The gateway evaluates Enigma enterprise policy and signs decisions.
- It does not call model providers.
- It does not prove provider deletion, semantic forgetting, or provider-side storage behavior.

## 12. Docker relay/gateway rehearsal

From the repository root, build a local image without adding a Dockerfile to the repo:

```sh
docker build -t enigma-local -f - . <<'EOF'
FROM node:24-alpine
WORKDIR /app
COPY enigma/package.json ./package.json
COPY enigma/apps ./apps
COPY enigma/packages ./packages
COPY enigma/specs ./specs
ENV NODE_ENV=production
RUN npm install -g .
ENTRYPOINT ["enigma"]
EOF
```

Run relay:

```sh
docker run --rm enigma-local relay demo
docker run --rm -p 8787:8787 enigma-local relay serve --host 0.0.0.0 --port 8787
```

Run gateway:

```sh
docker run --rm enigma-local gateway demo
docker run --rm -p 8797:8797 enigma-local gateway serve --host 0.0.0.0 --port 8797
```

Production containers require external secrets, durable storage, TLS ingress, monitoring, backups, restore procedure, log retention, and incident response. Do not bake vault bundles, private keys, deployment credentials, or tenant secrets into images.

## 13. Import and capsule migration path

Import source exports into Enigma reports:

```sh
enigma import chatgpt --file ./chatgpt-export.json --out ./enigma-chatgpt-report.json
enigma import claude --file ./claude-memory.json --out ./enigma-claude-report.json
enigma import mem0 --file ./mem0-export.json --out ./enigma-mem0-report.json
enigma import letta --file ./letta-agent.json --out ./enigma-letta-report.json
enigma import langgraph --file ./langgraph-store.json --out ./enigma-langgraph-report.json
enigma import graphiti --file ./zep-graphiti-export.json --out ./enigma-graphiti-report.json
```

Export and import an Enigma capsule:

```sh
enigma capsule export --file ./enigma-chatgpt-report.json --out ./enigma-capsule.json
enigma capsule import --file ./enigma-capsule.json --bundle "$HOME/.enigma/bundle.json"
```

Expected proof outputs:

- Import reports preserve source references, limitations, confidence, and completeness flags.
- `enigma capsule export` prints `ok`, `schema: "enigma.import_capsule.v1"`, a `capsule_id`, `public_artifacts`, and `verifier_metadata`.
- `enigma capsule import` prints an import result and source file. Candidates become Enigma-canonical only after being written through the local vault and receiving Enigma receipts.

## 14. Final verification commands

Run these commands before telling a user the local install is complete:

```sh
enigma doctor
ENIGMA_DEMO_MEMORY_FILE=./private-memory.txt
printf '%s\n' 'Write private verification memory here; do not paste raw memory into public proof examples.' > "$ENIGMA_DEMO_MEMORY_FILE"
enigma init --bundle ./.enigma/bundle.json --subject local-user --display-name "Local user"
enigma remember --bundle ./.enigma/bundle.json --text "$(node -e 'process.stdout.write(require("node:fs").readFileSync(process.env.ENIGMA_DEMO_MEMORY_FILE, "utf8"))')" --purpose verification
enigma export --bundle ./.enigma/bundle.json --out ./.enigma/export.json
enigma verify --bundle ./.enigma/export.json
enigma relay demo
enigma gateway demo
```

Expected completion state:

- Doctor prints an `ok` result for package, schema, and connector checks.
- The vault bundle exists at the configured path.
- The export verifies with `schema: "enigma.verification_report.v1"`, `ok: true`, and `errors: []`.
- Relay demo proves opaque relay, plaintext rejection, witness checkpoint verification, and pairing.
- Gateway demo proves allowed retrieval, denied region, denied legal-hold delete, signed decision verification, and plaintext-minimized SIEM export.

## 15. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `enigma` command is not found | Re-run `npm install -g .` from `enigma`, or use `node apps/cli/bin/enigma.mjs`. |
| MCP client cannot find `enigma-mcp` | Use the absolute command path to the installed `enigma-mcp` bin or reinstall globally. Ensure the client can inherit the same PATH. |
| MCP starts but has no bundle | Set `ENIGMA_BUNDLE` in the MCP config entry using an absolute path. |
| `enigma verify` reports missing receipts | Run `enigma remember`, `enigma context`, or another receipt-emitting lifecycle command before export. |
| Connector writes to the wrong config | Use `enigma install --out ./enigma-mcp-snippets.json` to review JSON first, then apply only the target client connector. |
| Browser extension cannot connect | Confirm native messaging host name `com.enigma.native_host`, host path, extension permissions, and explicit user approval flow. |
| Relay rejects a record | Remove plaintext-looking memory fields and send only opaque encrypted relay payloads plus metadata. |
| Gateway denies a decision | Check provider, model, region, purpose, sensitivity, operation, legal-hold status, and active policy hash. |

## 16. What users can safely claim after this guide

Users can say:

- Enigma is installed locally.
- A local vault bundle was created.
- Enigma MCP can expose memory tools to a supported client.
- Enigma emitted receipts for Enigma-mediated memory lifecycle operations.
- An exported Enigma bundle verified offline.
- The relay demo accepted opaque encrypted records and rejected plaintext-looking records.
- The gateway demo signed and verified Enigma policy decisions.

Users must not say:

- Enigma deleted memory from every AI provider.
- Enigma made a model forget.
- Enigma proved imported provider exports are complete unless the source explicitly proves completeness.
- Enigma eliminated every possible side channel.
- Hosted Enigma cloud is live without deployed infrastructure.
