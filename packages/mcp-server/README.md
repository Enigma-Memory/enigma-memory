# Enigma MCP server

`enigma-mcp` is the stdio MCP server installed by the `enigma-memory` package. Claude Desktop, Cursor, Kimi Code, and VS Code Cline users should prefer the CLI connector commands below instead of hand-editing MCP JSON.

## One-command install and connect

Pick the client you use:

```sh
npm install -g enigma-memory && enigma setup --client claude-desktop --write-connectors --overwrite
npm install -g enigma-memory && enigma setup --client cursor --write-connectors --overwrite
npm install -g enigma-memory && enigma setup --client kimi-code --write-connectors --overwrite
npm install -g enigma-memory && enigma setup --client vscode-cline --write-connectors --overwrite
```

To write only MCP configs that already exist on the machine:

```sh
npm install -g enigma-memory && enigma setup --client auto --connect-installed --overwrite
```

The generated server entry uses command `enigma-mcp`, no args, and `ENIGMA_BUNDLE` pointing at the local bundle. Existing sibling MCP servers are preserved.

## Grant-gated context

`enigma_context_pack` can require a Memory Controller grant before returning local context. Pass `require_grant:true` with `grant` or `grants`; pass `revoked_grant_refs` to make stale active grants fail closed. Missing, expired, revoked, or mismatched grants return `enigma.context_pack_recall_blocked.v1` with `context_pack_returned:false` and no memory payload.

This is an Enigma-local sharing decision. It does not prove provider deletion, provider non-use, model forgetting, hosted availability, or compliance status.
