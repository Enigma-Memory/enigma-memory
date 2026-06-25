# Client connectors

Enigma connects to assistant clients through MCP. The client starts `enigma-mcp` over stdio, and Enigma reads/writes the local vault bundle named by `ENIGMA_BUNDLE`.

Supported connector IDs:

- `claude-desktop`
- `cursor`
- `kimi-code`
- `vscode-cline`
- `roo`
- `opencode`
- `generic-mcp`

## Install the package

Install the published package first:

```sh
npm install -g enigma-memory
enigma quickstart --bundle "$HOME/.enigma/bundle.json" --overwrite
enigma doctor
```

One-off execution without a global install:

```sh
npx --yes --package enigma-memory enigma quickstart --bundle "$HOME/.enigma/bundle.json" --overwrite
npx --yes --package enigma-memory enigma doctor
```

From a source checkout, use this only for package development or source-only docs:

```sh
cd enigma
npm install -g .
```

## Create the local vault first

```sh
enigma init --bundle "$HOME/.enigma/bundle.json" --subject local-user --display-name "Local user"
enigma verify --bundle "$HOME/.enigma/bundle.json"
```

Windows PowerShell:

```powershell
enigma init --bundle "$HOME\.enigma\bundle.json" --subject local-user --display-name "Local user"
enigma verify --bundle "$HOME\.enigma\bundle.json"
```

## Detect and connect client configs with the CLI

Doctor all supported connector profiles:

```sh
enigma doctor
```

Doctor one client before changing it:

```sh
enigma doctor --client claude-desktop
enigma doctor --client cursor
enigma doctor --client kimi-code
enigma doctor --client vscode-cline
enigma doctor --client roo
enigma doctor --client opencode
enigma doctor --client generic-mcp
```

Connector detection is read-only. It resolves the client config path for the current OS, checks whether that config exists, checks whether the `mcpServers.enigma` entry exists, and checks whether `command`, `args`, and `env.ENIGMA_BUNDLE` match the requested Enigma server entry. The safe `recommended_action` is one of:

- `already_configured`: the Enigma MCP entry is present and matches the requested command/env.
- `missing_client_config`: the client config file was not found; open/install the client first or pass an explicit `--config` path.
- `connect`: the config exists but has no Enigma server entry; `enigma connect ...` can merge one without touching sibling settings.
- `repair`: the existing Enigma entry or JSON needs correction; review the reported reason before reconnecting.

Install the local Enigma package-level integration files:

```sh
enigma install --bundle "$HOME/.enigma/bundle.json"
```

Connect one client:

```sh
enigma connect claude-desktop --bundle "$HOME/.enigma/bundle.json"
enigma connect cursor --bundle "$HOME/.enigma/bundle.json"
enigma connect kimi-code --bundle "$HOME/.enigma/bundle.json"
enigma connect vscode-cline --bundle "$HOME/.enigma/bundle.json"
enigma connect roo --bundle "$HOME/.enigma/bundle.json"
enigma connect opencode --bundle "$HOME/.enigma/bundle.json"
enigma connect generic-mcp --bundle "$HOME/.enigma/bundle.json"
```

Disconnect one client without touching unrelated client settings:

```sh
enigma disconnect claude-desktop
enigma disconnect cursor
enigma disconnect kimi-code
enigma disconnect vscode-cline
enigma disconnect roo
enigma disconnect opencode
enigma disconnect generic-mcp
```

Connector writes are semantic and idempotent. Enigma preserves unrelated client settings and sibling MCP servers under `mcpServers`, writes changed JSON through a temporary file followed by `rename`, and creates a `.bak.<timestamp>` backup only when an existing config actually changes. Running the same `enigma connect ...` command against an equivalent config, even with JSON keys in a different order, reports `changed: false` and does not create or report a backup. The planner/detection APIs are read-only; JSON files are only written when the connect/disconnect API or CLI command is explicitly run.

If you need to review the JSON before writing a client config, use the connector API from a checkout:

```sh
node --input-type=module -e "import { renderMcpConfig } from './packages/connectors/src/index.js'; console.log(JSON.stringify(renderMcpConfig('generic-mcp', { bundlePath: process.env.HOME + '/.enigma/bundle.json' }), null, 2));"
```

To show a public-safe ordered setup plan without reading or writing client files:

```sh
node --input-type=module -e "import { planConnectWizard } from './packages/connectors/src/index.js'; console.log(JSON.stringify(planConnectWizard({ platform: process.platform }), null, 2));"
```

## Universal MCP server entry

Every supported client ultimately needs this shape:

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

Use an absolute bundle path. The MCP process inherits client environment in some apps and not in others; setting `ENIGMA_BUNDLE` directly in the entry is the portable path. The command defaults to `enigma-mcp`; if a GUI app cannot find shell-installed binaries, render an absolute command with `--mcp-command` (alias: `--command`).

```sh
enigma connect kimi-code --bundle "$HOME/.enigma/bundle.json" --mcp-command "/absolute/path/to/enigma-mcp"
```

## Claude Desktop

Connector ID: `claude-desktop`

Default config paths:

- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `$HOME/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `$HOME/.config/Claude/claude_desktop_config.json`

Manual entry:

```json
{
  "mcpServers": {
    "enigma": {
      "command": "enigma-mcp",
      "args": [],
      "env": {
        "ENIGMA_BUNDLE": "/Users/alice/.enigma/bundle.json"
      }
    }
  }
}
```

CLI:

```sh
enigma connect claude-desktop --bundle "$HOME/.enigma/bundle.json"
```

Restart Claude Desktop after changing the config.

## Cursor

Connector ID: `cursor`

Default config paths:

- Windows: `%USERPROFILE%\.cursor\mcp.json`
- macOS: `$HOME/.cursor/mcp.json`
- Linux: `$HOME/.cursor/mcp.json`

Manual entry:

```json
{
  "mcpServers": {
    "enigma": {
      "command": "enigma-mcp",
      "args": [],
      "env": {
        "ENIGMA_BUNDLE": "/Users/alice/.enigma/bundle.json"
      }
    }
  }
}
```

CLI:

```sh
enigma connect cursor --bundle "$HOME/.enigma/bundle.json"
```

Restart Cursor or reload the window after changing the config.

## Kimi Code

Connector ID: `kimi-code`

Default config paths:

- Windows: `%APPDATA%\Kimi Code\mcp.json`
- macOS: `$HOME/Library/Application Support/Kimi Code/mcp.json`
- Linux: `$HOME/.config/kimi-code/mcp.json`

Manual entry:

```json
{
  "mcpServers": {
    "enigma": {
      "command": "enigma-mcp",
      "args": [],
      "env": {
        "ENIGMA_BUNDLE": "/Users/alice/.enigma/bundle.json"
      }
    }
  }
}
```

CLI:

```sh
enigma connect kimi-code --bundle "$HOME/.enigma/bundle.json"
```

Kimi Code is usually launched from the operating-system GUI, so it may not inherit the same `PATH` as your terminal. If Kimi Code does not find `enigma-mcp`, pass an absolute executable path:

```sh
enigma connect kimi-code --bundle "$HOME/.enigma/bundle.json" --mcp-command "/opt/homebrew/bin/enigma-mcp"
enigma connect kimi-code --bundle "$HOME/.enigma/bundle.json" --command "C:\\Users\\alice\\AppData\\Roaming\\npm\\enigma-mcp.cmd"
```

The rendered Kimi Code config still uses the same local bundle contract:

```json
{
  "mcpServers": {
    "enigma": {
      "command": "/absolute/path/to/enigma-mcp",
      "args": [],
      "env": {
        "ENIGMA_BUNDLE": "/Users/alice/.enigma/bundle.json"
      }
    }
  }
}
```

Restart Kimi Code after changing the config.

## VS Code / Cline

Connector ID: `vscode-cline`

Default config paths:

- Windows: `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`
- macOS: `$HOME/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- Linux: `$HOME/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`

Manual entry:

```json
{
  "mcpServers": {
    "enigma": {
      "command": "enigma-mcp",
      "args": [],
      "env": {
        "ENIGMA_BUNDLE": "/Users/alice/.enigma/bundle.json"
      }
    }
  }
}
```

CLI:

```sh
enigma connect vscode-cline --bundle "$HOME/.enigma/bundle.json"
```

Reload VS Code after changing the config.

## Roo Code

Connector ID: `roo`

Default config paths:

- Windows: `%APPDATA%\Code\User\globalStorage\rooveterinaryinc.roo-cline\settings\mcp_settings.json`
- macOS: `$HOME/Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json`
- Linux: `$HOME/.config/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json`

Manual entry:

```json
{
  "mcpServers": {
    "enigma": {
      "command": "enigma-mcp",
      "args": [],
      "env": {
        "ENIGMA_BUNDLE": "/Users/alice/.enigma/bundle.json"
      }
    }
  }
}
```

CLI:

```sh
enigma connect roo --bundle "$HOME/.enigma/bundle.json"
```

Reload VS Code after changing the config.

## OpenCode

Connector ID: `opencode`

Default config paths:

- Windows: `%APPDATA%\opencode\opencode.json`
- macOS: `$HOME/Library/Application Support/opencode/opencode.json`
- Linux: `$HOME/.config/opencode/opencode.json`

Manual entry:

```json
{
  "mcpServers": {
    "enigma": {
      "command": "enigma-mcp",
      "args": [],
      "env": {
        "ENIGMA_BUNDLE": "/Users/alice/.enigma/bundle.json"
      }
    }
  }
}
```

CLI:

```sh
enigma connect opencode --bundle "$HOME/.enigma/bundle.json"
```

Restart OpenCode after changing the config.

## Generic MCP client

Connector ID: `generic-mcp`

Default config paths:

- Windows: `%APPDATA%\Enigma\mcp.json`
- macOS: `$HOME/Library/Application Support/Enigma/mcp.json`
- Linux: `$HOME/.config/enigma/mcp.json`

Manual entry:

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

CLI:

```sh
enigma connect generic-mcp --bundle "$HOME/.enigma/bundle.json"
```

## Verify MCP by hand

```sh
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"manual","version":"0"}}}\n{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n' | ENIGMA_BUNDLE="$HOME/.enigma/bundle.json" enigma-mcp
```

Expected behavior: the response lists Enigma tools (`enigma_init`, `enigma_remember`, `enigma_search`, `enigma_context_pack`, `enigma_delete`, `enigma_verify_receipts`), the `enigma://passport/summary` resource, and the `enigma_standard_memory_prompt` prompt. This only verifies the local MCP process and bundle path. It does not prove that a hosted provider deleted memory or forgot anything.

## Import/export commands for migrations

Import a source export into an Enigma report:

```sh
enigma import chatgpt --file ./chatgpt-export.json --out ./enigma-import-report.json
enigma import claude --file ./claude-memory.json --out ./enigma-import-report.json
enigma import mem0 --file ./mem0-export.json --out ./enigma-import-report.json
enigma import letta --file ./letta-agent.json --out ./enigma-import-report.json
enigma import langgraph --file ./langgraph-store.json --out ./enigma-import-report.json
enigma import graphiti --file ./zep-graphiti-export.json --out ./enigma-import-report.json
```

Export/import an Enigma capsule:

```sh
enigma capsule export --file ./enigma-import-report.json --out ./enigma-capsule.json
enigma capsule import --file ./enigma-capsule.json --bundle "$HOME/.enigma/bundle.json"
```

Imported source memories carry limitations and completeness status. They become Enigma-canonical only after writing through the local vault and receiving Enigma receipts.

## Honesty boundaries for client setup

Enigma client connectors can say:

- The client is configured to start `enigma-mcp`.
- The Enigma MCP server can read/write the configured local bundle.
- Enigma receipts can verify Enigma-controlled lifecycle events.
- Provider-native memory is cache only in this architecture.

Enigma client connectors cannot say:

- Claude, Cursor, Kimi, VS Code extensions, Roo, OpenCode, ChatGPT, or any hosted provider deleted hidden copies.
- A model forgot a memory.
- A provider will never store prompt/context text after a user approves insertion.
- Imported provider exports are complete unless the source explicitly proves completeness.
