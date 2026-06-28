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

## Next action

`enigma_next_action` is safe before setup. If the bundle is missing it returns `enigma.next_action.v1` with `state:"setup_needed"` and the `enigma_init` tool as the next action instead of throwing. After setup it points the client at `enigma_remember`/import or app-connection work, while keeping paths and raw memory out of the response.

## Import preview

`enigma_import_preview` lets a client preview user-provided text or Markdown memory candidates without writing the vault. The response contains counts, duplicate groups, commitments, receipt/action metadata, and no raw memory text.

`enigma_import_approve` is the explicit write step. It requires `approved:true` and the `approval_token` returned by `enigma_import_preview`, blocks duplicate/low-confidence/incomplete previews until `reviewed:true`, writes only to the local Enigma vault, and returns `enigma.import_approved_batch.v1` plus `enigma.import_batch_receipt.v1` metadata. It does not return raw memory text.

## Grant-gated context

`enigma_context_pack` can require a Memory Controller grant before returning local context. Pass `require_grant:true` with `grant` or `grants`; pass `revoked_grant_refs` to make stale active grants fail closed. Missing, expired, revoked, or mismatched grants return `enigma.context_pack_recall_blocked.v1` with `context_pack_returned:false` and no memory payload.

This is an Enigma-local sharing decision. It does not prove provider deletion, provider non-use, model forgetting, hosted availability, or compliance status.
