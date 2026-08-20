# Enigma MCP server

`enigma-mcp` is the stdio MCP server installed by the `enigma-memory` package. Claude Desktop, Cursor, Kimi Code, and VS Code Cline users should prefer the CLI connector commands below instead of hand-editing MCP JSON.

## Install and preview before connecting

Create the local bundle, then use the lowest-friction connector path for the client you use:

```sh
npm install -g enigma-memory
enigma quickstart --bundle ./.enigma/bundle.json
enigma claude-mcpb package --mcpb ./.enigma/claude/enigma-memory.mcpb --out ./.enigma/claude/enigma-memory-mcpb.json --plain
enigma connect cursor --bundle ./.enigma/bundle.json --dry-run
enigma connect kimi-code --bundle ./.enigma/bundle.json --dry-run
enigma connect vscode-cline --bundle ./.enigma/bundle.json --dry-run
```

For Claude Desktop, open the generated `.mcpb` package in Claude and test the connection after restart. For other clients, when the dry-run names the intended client and bundle, repeat that single `enigma connect <client> --bundle ./.enigma/bundle.json` command without `--dry-run`.

The generated server entry uses command `enigma-mcp`, no args, and `ENIGMA_BUNDLE` pointing at the local bundle. Existing sibling MCP servers are preserved.

The stdio server defaults to the `core` tool profile: eleven setup/memory tools whose advertised input schemas are flat and primitive. This keeps the normal tool envelope smaller and removes nested controller/settlement artifacts from ordinary model exposure. Use `ENIGMA_MCP_TOOL_PROFILE=full enigma-mcp` or `enigma mcp serve --profile full` only when an advanced client needs the complete catalog. Hidden full-profile tools are rejected when the core profile is active.

## Next action

`enigma_next_action` is safe before setup. If the bundle is missing it returns `enigma.next_action.v1` with `state:"setup_needed"` and the `enigma_init` tool as the next action instead of throwing. After setup it points the client at `enigma_remember`/import or app-connection work, while keeping paths and raw memory out of the response.

## Support summary

`enigma_support_summary` returns a redacted `enigma.support_summary.v1` for connected clients: setup state, next action, safe counts, tool availability, redaction flags, and privacy-scan metadata only. It excludes raw memory, prompts, transcripts, credentials, provider responses, and local paths.

## Import preview

`enigma_import_preview` lets a client preview user-provided text or Markdown memory candidates without writing the vault. The response contains counts, duplicate groups, commitments, receipt/action metadata, and no raw memory text.

`enigma_import_approve` is the explicit write step. It requires `approved:true` and the `approval_token` returned by `enigma_import_preview`, blocks empty imports, and blocks duplicate/low-confidence/incomplete previews until `reviewed:true`. Successful writes are local to the Enigma vault and return `enigma.import_approved_batch.v1` plus `enigma.import_batch_receipt.v1` metadata. It does not return raw memory text.

## Grant-gated context

In the `full` profile, `enigma_context_pack` can require a Memory Controller grant before returning local context. Pass `require_grant:true` with `grant` or `grants`; pass `revoked_grant_refs` to make stale active grants fail closed. Missing, expired, revoked, or mismatched grants return `enigma.context_pack_recall_blocked.v1` with `context_pack_returned:false` and no memory payload.

This is an Enigma-local sharing decision. It does not prove provider deletion, provider non-use, model forgetting, hosted availability, or compliance status.

## Visual context image tool

`enigma_visual_context` compiles selected local context and renders it into deterministic X11 `6x10` PNG pages. The tool deliberately uses only flat primitive input parameters. MCP output contains a plaintext-free structured manifest plus one `image/png` content block per page.

The pages are private, plaintext-equivalent derived artifacts. They are not encrypted merely because they are images, and they must not be copied into public proof packets, chain data, relay logs, or support evidence. The local vault remains canonical. Model recall, client downscaling, image billing, and output/reasoning cost are empirical per-model properties; benchmark them before use.

The CLI equivalent is:

```sh
enigma context --bundle ./.enigma/bundle.json --query "project context" --carrier image --out-dir ./.enigma/visual-context
```

## Tool protocol audit

Run `enigma mcp audit` or call `createMcpToolProtocolAudit(toolDescriptorsForProfile('core'))` from `enigma-memory/mcp-server` to inspect model-facing schema complexity. The default core report must remain entirely flat; `enigma mcp audit --profile full` reports nesting, arrays, unions, heterogeneous root types, and approximate schema tokens across the advanced catalog. New agent-facing tools should prefer a root object of boring primitive parameters and harness-side opaque-ref lookup.

The audit does not claim that flat schemas eliminate semantic errors, no-call replies, sampling failures, or provider-dialect bugs. MCP receives already parsed JSON-RPC; provider-specific raw call repair belongs in the client harness. Enigma still rejects unknown fields and validates semantics at execution.
