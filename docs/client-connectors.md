# Client connectors

Enigma connects to assistant clients through MCP. The client starts `enigma-mcp` over stdio, and Enigma reads/writes the local vault bundle named by `ENIGMA_BUNDLE`. Install once, run setup once, then connect the same AI Memory Passport everywhere when you explicitly choose to write a client config.

Supported connector IDs:

- `claude-desktop`
- `cursor`
- `kimi-code`
- `vscode-cline`
- `roo`
- `opencode`
- `generic-mcp`

## One clear path

```sh
npm install -g enigma-memory
enigma init
enigma setup --client auto --connect-installed --overwrite
enigma drive health
enigma status
enigma remember --text-file ./memory.txt
enigma search --query "project context"
enigma context --query "project context" --optimize
enigma verify --export ./.enigma/export.json
```

Optional grant-gated local context check:

```sh
enigma controller grant --app-ref ref:app:cli --purpose-ref ref:purpose:cli_context --memory-zone-ref ref:zone:default --out ./.enigma/grant.json
enigma context --query "project context" --require-grant --grant-file ./.enigma/grant.json --proof
```

This is an Enigma-local permission check. It does not prove provider deletion, provider non-use, or model forgetting.

One command connects every installed client: `enigma setup --client auto --connect-installed --overwrite` writes the `mcpServers.enigma` entry into every installed/config-present client it detects (Claude Desktop, Cursor, Kimi Code, VS Code/Cline, Roo, OpenCode, generic MCP). It skips clients that are not installed and never creates configs from scratch; preview with `--dry-run` first. `enigma drive health` reports a SMART-style memory-drive health packet (freshness, tombstone backlog, stale derived artifacts, receipt coverage, connector health) from local metadata only — it is part of the Memory Drive surface in this release, and `enigma status` plus `enigma doctor` cover local passport counts, roots, and connector readiness in every build. No setup command prints raw memory plaintext.

Run setup or quickstart before using `enigma doctor` as the final green check. Doctor reads existing client configs as well as the local environment, so an already-present `generic-mcp` or other MCP config can make doctor red on a fresh install if its `ENIGMA_BUNDLE` points to a bundle that does not exist yet, or to a different bundle than the one passed to doctor. That is expected first-run connector state, not an npm install failure. In doctor JSON, `setup_status.state:"setup_needed"` means run `setup_status.next_command`; `attention_needed` means a real local install or connector issue remains. Use `enigma quickstart --bundle ./.enigma/bundle.json --overwrite` or `enigma setup --bundle ./.enigma/bundle.json --overwrite`, then rerun `enigma doctor --bundle ./.enigma/bundle.json`.

For a single client, or to preview before writing, use `enigma connect <client> --dry-run` and then drop `--dry-run`.

Provider-native memory is non-canonical cache only in this architecture. The Enigma vault remains canonical, and Enigma receipts prove Enigma-controlled lifecycle events; they do not prove that a hosted provider deleted hidden copies or that a model forgot anything. Hosted cloud and BYOC operation are waitlist/operator-deploy only; the relay and gateway binaries are local bootstrap probes, not a live hosted service.

From a source checkout, use this only for package development or source-only docs:

```sh
cd enigma
npm install -g .
```

## Preview, then connect

Preview one client without changing it:

```sh
enigma connect claude-desktop --dry-run
enigma connect cursor --dry-run
enigma connect kimi-code --dry-run
enigma connect vscode-cline --dry-run
enigma connect roo --dry-run
enigma connect opencode --dry-run
enigma connect generic-mcp --dry-run
```

When the single-client dry run looks right, remove `--dry-run` for the client you want:

```sh
enigma connect claude-desktop
enigma connect cursor
enigma connect kimi-code
enigma connect vscode-cline
enigma connect roo
enigma connect opencode
enigma connect generic-mcp
```

Optional setup-time planning for installed/config-present connector targets remains available:

```sh
enigma setup --client auto --overwrite
```

Use the explicit setup-time write flag only when you want setup to write all installed/config-present client configs it discovers:

```sh
enigma setup --connect-installed --overwrite
```

`--connect-installed` skips missing client configs instead of creating every default client config. It is for installed/config-present clients only. Existing `enigma setup --write-connectors` behavior for explicit/default clients is unchanged.

When the single-client dry run looks right, remove `--dry-run` for the client you want:

```sh
enigma connect claude-desktop
enigma connect cursor
enigma connect kimi-code
enigma connect vscode-cline
enigma connect roo
enigma connect opencode
enigma connect generic-mcp
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

Connector writes are semantic and idempotent. Enigma preserves unrelated client settings and sibling MCP servers under `mcpServers`, writes changed JSON through a temporary file followed by `rename`, and creates a `.bak.<timestamp>` backup only when an existing config actually changes. Running the same `enigma connect ...` command against an equivalent config, even with JSON keys in a different order, reports `changed: false` and does not create or report a backup. Detection, `--client auto`, and dry runs are read-only.

## Copy-paste MCP snippets

Use an absolute bundle path. The MCP process inherits client environment in some apps and not in others; setting `ENIGMA_BUNDLE` directly in the entry is the portable path. The command defaults to `enigma-mcp`; if a GUI app cannot find shell-installed binaries, render an absolute command with `--mcp-command` (alias: `--command`).

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
        "ENIGMA_BUNDLE": "/absolute/path/to/.enigma/bundle.json"
      }
    }
  }
}
```

CLI:

```sh
enigma connect claude-desktop --dry-run
enigma connect claude-desktop
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
        "ENIGMA_BUNDLE": "/absolute/path/to/.enigma/bundle.json"
      }
    }
  }
}
```

CLI:

```sh
enigma connect cursor --dry-run
enigma connect cursor
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
        "ENIGMA_BUNDLE": "/absolute/path/to/.enigma/bundle.json"
      }
    }
  }
}
```

CLI:

```sh
enigma connect kimi-code --dry-run
enigma connect kimi-code
```

Kimi Code is usually launched from the operating-system GUI, so it may not inherit the same `PATH` as your terminal. If Kimi Code does not find `enigma-mcp`, pass an absolute executable path:

```sh
enigma connect kimi-code --dry-run --mcp-command "/absolute/path/to/enigma-mcp"
enigma connect kimi-code --mcp-command "/absolute/path/to/enigma-mcp"
```

The rendered Kimi Code config still uses the same local bundle contract:

```json
{
  "mcpServers": {
    "enigma": {
      "command": "/absolute/path/to/enigma-mcp",
      "args": [],
      "env": {
        "ENIGMA_BUNDLE": "/absolute/path/to/.enigma/bundle.json"
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
        "ENIGMA_BUNDLE": "/absolute/path/to/.enigma/bundle.json"
      }
    }
  }
}
```

CLI:

```sh
enigma connect vscode-cline --dry-run
enigma connect vscode-cline
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
        "ENIGMA_BUNDLE": "/absolute/path/to/.enigma/bundle.json"
      }
    }
  }
}
```

CLI:

```sh
enigma connect roo --dry-run
enigma connect roo
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
        "ENIGMA_BUNDLE": "/absolute/path/to/.enigma/bundle.json"
      }
    }
  }
}
```

CLI:

```sh
enigma connect opencode --dry-run
enigma connect opencode
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
enigma connect generic-mcp --dry-run
enigma connect generic-mcp
```

## Verify MCP by hand

```sh
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"manual","version":"0"}}}\n{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n' | ENIGMA_BUNDLE="$HOME/.enigma/bundle.json" enigma-mcp
```

Expected behavior: the response lists Enigma tools (`enigma_init`, `enigma_remember`, `enigma_search`, `enigma_context_pack`, `enigma_delete`, `enigma_verify_receipts`, `enigma_memory_weather`, `enigma_consent_grant`, `enigma_recall_veto`, `enigma_private_bubble`), the `enigma://passport/summary` resource, and the `enigma_standard_memory_prompt` prompt. This only verifies the local MCP process and bundle path. It does not prove that a hosted provider deleted memory or forgot anything.

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
