# Client connectors

Enigma connects to assistant clients through MCP. The client starts `enigma-mcp` over stdio, and Enigma reads/writes the local vault bundle named by `ENIGMA_BUNDLE`. Start with the public test drive, then create a regular local workspace, then explicitly connect installed/config-present clients when you are ready.

Supported connector IDs:

- `claude-desktop`
- `cursor`
- `kimi-code`
- `vscode-cline`
- `roo`
- `opencode`
- `generic-mcp`

## Public test drive first

Prove the live npm package path without credentials, hosted SaaS, provider calls, or client-config writes:

```sh
npm install -g enigma-memory
enigma test-drive --overwrite
```

`enigma test-drive --overwrite` writes an isolated demo under `.enigma/test-drive` by default, emits one public-safe JSON summary, and does not print raw private memory plaintext. Use `--dry-run` to preview without writing, or `--out-dir <path>` to choose another isolated demo directory. The local proof/demo is bounded to Enigma-controlled vault state, receipts, checkpoints, committed roots, exported bundle shape, and declared boundary operations; it is not hosted SaaS evidence and does not prove provider deletion or model forgetting.

## One clear path

After the test drive, create a regular local workspace:

```sh
npm install -g enigma-memory
enigma setup --overwrite
```

`enigma setup --overwrite` writes local Enigma artifacts under the workspace `.enigma` path and emits deterministic, public-safe JSON without printing raw memory plaintext. It does not write Claude, Cursor, Kimi, VS Code, Roo, OpenCode, or generic MCP client configs.

To auto-detect installed or already-configured clients and show the setup connector plan without mutating client configs:

```sh
enigma setup --client auto --overwrite
```

`--client auto` selects clients found by connector detection and falls back to the default setup client list when none are present. The setup output lists selected clients, skipped clients, and the reason for each skip.

To explicitly write connector entries for installed/config-present clients only:

```sh
enigma setup --connect-installed --overwrite
```

`--connect-installed` implies auto client selection and is a client-config write flag. It skips missing client configs instead of creating every default client config. Only explicit write flags mutate client configs. Existing `enigma connect <client>` behavior and existing `enigma setup --write-connectors` behavior for explicit/default clients are unchanged.

After setup, use the same local vault from the CLI or connected clients:

```sh
enigma remember --text-file ./memory.txt
enigma search --query "..."
enigma context --query "..." --optimize
enigma verify --export ./.enigma/export.json
enigma connect claude-desktop --dry-run
```

Provider-native memory is non-canonical cache only in this architecture. The Enigma vault remains canonical, and Enigma receipts prove Enigma-controlled lifecycle events; they do not prove that a hosted provider deleted hidden copies or that a model forgot anything.

One-off public test drive without a global install:

```sh
npx --yes --package enigma-memory enigma test-drive --overwrite
```

From a source checkout, use this only for package development or source-only docs:

```sh
cd enigma
npm install -g .
```

## Preview, then connect

Preview installed/config-present connector targets during setup without changing client configs:

```sh
enigma setup --client auto --overwrite
```

The output reports selected clients, skipped clients, and skip reasons. If no installed/config-present client is discovered, auto selection falls back to the default setup client list for planning.

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

When you are ready to write all installed/config-present client configs discovered by setup, use the explicit setup-time write flag:

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
