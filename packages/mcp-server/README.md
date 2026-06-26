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
