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
enigma quickstart --bundle ./.enigma/bundle.json
enigma claude-mcpb package --mcpb ./.enigma/claude/enigma-memory.mcpb --out ./.enigma/claude/enigma-memory-mcpb.json --plain
enigma drive health --bundle ./.enigma/bundle.json
enigma status --bundle ./.enigma/bundle.json
enigma import text --file ./memories.md --complete --plain
enigma remember --bundle ./.enigma/bundle.json --text-file ./memory.txt
enigma search --bundle ./.enigma/bundle.json --query "project context"
enigma context --bundle ./.enigma/bundle.json --query "project context" --optimize
enigma verify --export ./.enigma/export.json
```

The import command above is a preview-only first value step; it does not write the Memory Drive unless a later import uses explicit `--write-vault`.

For Claude Desktop, the first supported path is the `.mcpb` extension package. The package command writes a local review artifact only; it does not install Claude, launch a provider, write Claude config, or contact a network. Open the generated `.mcpb` in Claude Desktop, choose the local Memory Drive when Claude asks, restart Claude, then test the connection from Enigma.

Optional grant-gated local context check:

```sh
enigma controller grant --app-ref ref:app:cli --purpose-ref ref:purpose:cli_context --memory-zone-ref ref:zone:default --out ./.enigma/grant.json
enigma context --query "project context" --require-grant --grant-file ./.enigma/grant.json --proof
```

This is an Enigma-local permission check. It does not prove provider deletion, provider non-use, or model forgetting.

Preview one intended client first for Cursor, Kimi Code, VS Code/Cline, Roo, OpenCode, and Generic MCP: `enigma connect <client> --bundle ./.enigma/bundle.json --dry-run` shows the path-redacted local config plan without writing client settings. When the dry-run looks right, repeat the same command without `--dry-run` for that one client. `enigma drive health` reports a SMART-style memory-drive health packet (freshness, tombstone backlog, stale derived artifacts, receipt coverage, connector health) from local metadata only — it is part of the Memory Drive surface in this release, and `enigma status` plus `enigma doctor` cover local passport counts, roots, and connector readiness in every build. No setup command contacts a provider, creates hosted accounts, syncs cloud state, or proves provider deletion or model forgetting.

Run quickstart before using `enigma doctor` as the final green check. Doctor reads existing client configs as well as the local environment, so an already-present `generic-mcp` or other MCP config can make doctor red on a fresh install if its `ENIGMA_BUNDLE` points to a bundle that does not exist yet, or to a different bundle than the one passed to doctor. That is expected first-run connector state, not an npm install failure. In doctor JSON, `setup_status.state:"setup_needed"` means run `setup_status.next_command`; `attention_needed` means a real local install or connector issue remains; `ready` means the next commands move to local health/status checks and a dry-run client preview, not another quickstart run. Use `enigma quickstart --bundle ./.enigma/bundle.json`, then rerun `enigma doctor --bundle ./.enigma/bundle.json`.

For a single non-Claude client, preview before writing with `enigma connect <client> --dry-run` and then drop `--dry-run`.

Provider-native memory is non-canonical cache only in this architecture. The Enigma vault remains canonical, and Enigma receipts prove Enigma-controlled lifecycle events; they do not prove that a hosted provider deleted hidden copies or that a model forgot anything. Hosted cloud and BYOC operation are waitlist/operator-deploy only; the relay and gateway binaries are local bootstrap probes, not a live hosted service.

From a source checkout, use this only for package development or source-only docs:

```sh
cd enigma
npm install -g .
```

## Preview, then connect

Claude Desktop preferred path:

```sh
enigma claude-mcpb package --mcpb ./.enigma/claude/enigma-memory.mcpb --out ./.enigma/claude/enigma-memory-mcpb.json --plain
```

Open the generated `.mcpb` in Claude Desktop. Enigma does not write Claude settings for this extension handoff. Use the config-writing fallback only when the extension path is unavailable.

Preview one non-Claude client without changing it:

```sh
enigma connect cursor --dry-run
enigma connect kimi-code --dry-run
enigma connect vscode-cline --dry-run
enigma connect roo --dry-run
enigma connect opencode --dry-run
enigma connect generic-mcp --dry-run
```

When the single-client dry run looks right, remove `--dry-run` for the client you want:

```sh
enigma connect cursor
enigma connect kimi-code
enigma connect vscode-cline
enigma connect roo
enigma connect opencode
enigma connect generic-mcp
```

To inspect installed/config-present connector targets without writing every client, use:

```sh
enigma status --bundle ./.enigma/bundle.json
enigma doctor --bundle ./.enigma/bundle.json
```

Automatic setup-time connector writes are intentionally not the default path. Prefer the Claude extension handoff for Claude Desktop and one-client dry-run previews for other clients so users can review exactly what Enigma will change.


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

## Advanced copy-paste MCP snippets

Use these snippets only when the app-assisted path is unavailable or support asks for a manual fallback. For Claude Desktop, prefer the `.mcpb` extension package above. Manual entries need an absolute bundle path because the MCP process inherits client environment in some apps and not in others; setting `ENIGMA_BUNDLE` directly in the entry is the portable fallback. The command defaults to `enigma-mcp`; if a GUI app cannot find shell-installed binaries, render an absolute command with `--mcp-command` (alias: `--command`).

Claude Desktop fallback, advanced only:

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

Preferred path:

```sh
enigma claude-mcpb package --mcpb ./.enigma/claude/enigma-memory.mcpb --out ./.enigma/claude/enigma-memory-mcpb.json --plain
```

Steps:

1. Open the generated `.mcpb` package in Claude Desktop.
2. Choose the local Memory Drive when Claude asks.
3. Restart Claude Desktop.
4. Return to Enigma and run the Claude connection test.

This extension handoff is the default Claude path. It writes no Claude config, launches no provider, performs no network call, and is not treated as connected until a restart/test gives positive local evidence.

Advanced fallback:

```sh
enigma connect claude-desktop --bundle ./.enigma/bundle.json --dry-run
enigma connect claude-desktop --bundle ./.enigma/bundle.json
```

Use the fallback only if the `.mcpb` path is unavailable. Review the dry-run first; the write path preserves unrelated Claude settings and asks for a restart.

## Cursor

Connector ID: `cursor`

Default config paths:

- Windows: `%USERPROFILE%\.cursor\mcp.json`
- macOS: `$HOME/.cursor/mcp.json`
- Linux: `$HOME/.cursor/mcp.json`

Preview-first CLI:

```sh
enigma connect cursor --bundle ./.enigma/bundle.json --dry-run
enigma connect cursor --bundle ./.enigma/bundle.json
```

Restart Cursor or reload the window after changing the config.

Advanced manual entry:

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

Expected behavior: the response lists Enigma tools (`enigma_init`, `enigma_next_action`, `enigma_support_summary`, `enigma_remember`, `enigma_import_preview`, `enigma_import_approve`, `enigma_search`, `enigma_context_pack`, `enigma_delete`, `enigma_verify_receipts`, `enigma_memory_weather`, `enigma_consent_grant`, `enigma_recall_veto`, `enigma_private_bubble`), the `enigma://passport/summary` resource, and the `enigma_standard_memory_prompt` prompt. This only verifies the local MCP process and bundle path. It does not prove that a hosted provider deleted memory or forgot anything.

## Import/export commands for migrations

Preview a curated text/Markdown memory list first. This prints a public-safe preview and receipt; it does not write the vault unless you later approve an import path:

```sh
enigma import text --file ./memories.md --complete
```

Import a provider/source export into an Enigma report:
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

Rollback a local import with the private raw report that was written by `--out`:

```sh
enigma import rollback --file ./enigma-import-report.json --bundle "$HOME/.enigma/bundle.json"
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
