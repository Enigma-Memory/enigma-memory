# Package contract

This package is part of Enigma, the provider-agnostic AI memory and proof layer. Implementations must preserve these invariants:

- The canonical memory event stream is the source of truth.
- Receipts are verifiable offline.
- Raw memory plaintext is not stored in receipt files by default.
- Deleted memories are not served by context compilation.
- Unknown boundary paths fail closed.
- Provider-native memory is a cache, never canonical custody.
- The MCP server is import-safe: importing `src/index.js` or `bin/enigma-mcp.mjs` must not start stdio processing.
- JSON-RPC stdio support must handle `initialize`, `notifications/initialized`, `tools/list`, `tools/call`, `resources/list`, `resources/read`, `prompts/list`, `prompts/get`, `ping`, batch requests, and notifications without throwing.
- Tool calls return MCP-style `content` plus `structuredContent`. Text tools mirror the same JSON value in both forms; `enigma_visual_context` returns a plaintext-free structured manifest plus MCP image blocks whose PNG bytes remain private and non-enumerable in the manifest.
- MCP resources expose only Passport/Vault metadata and never raw memory plaintext.
- MCP prompts must instruct assistants to request Enigma context before answering user-specific questions and to be honest when Enigma context is unavailable.
- Logs and diagnostics must never be written to stdout; stdout is reserved for JSON-RPC frames.
- `enigma_init` creates a local vault bundle if it is missing and never returns local key material.
- Public exports are `toolDescriptors`, `coreToolDescriptors`, `toolDescriptorProfiles`, `toolDescriptorsForProfile`, `resourceDescriptors`, `promptDescriptors`, `handlers`, `enigma_init`, `enigma_next_action`, `enigma_support_summary`, `enigma_remember`, `enigma_import_preview`, `enigma_import_approve`, `enigma_search`, `enigma_context_pack`, `enigma_visual_context`, `enigma_delete`, `enigma_verify_receipts`, Memory Controller tools (`enigma_memory_weather`, `enigma_recall_veto`, `enigma_consent_grant`, `enigma_private_bubble`), `enigma_passport_summary_resource`, `enigma_standard_memory_prompt`, `createMcpToolProtocolAudit`, `handleJsonRpcRequest`, and `startStdioServer`.
- Stdio defaults to the `core` profile. Every advertised core input schema is flat and primitive; advanced controller/settlement schemas require explicit `full` profile selection. Tools hidden by the active profile are rejected at dispatch.
- The executable entrypoint is `bin/enigma-mcp.mjs`.
- Developer onboarding should point Claude Desktop, Cursor, Kimi Code, and VS Code users to `npm install -g enigma-memory`, `enigma quickstart --bundle ./.enigma/bundle.json`, and `enigma connect <id> --bundle ./.enigma/bundle.json --dry-run` before any manual MCP JSON fallback or connector write.
- `enigma_next_action` must not require an existing bundle; missing bundles return `enigma.next_action.v1` with `state:"setup_needed"` and tool-level next actions instead of an exception.
- `enigma_support_summary` mirrors the CLI support summary in MCP form: public-safe setup state, next action, counts, redaction flags, and privacy-scan metadata only.
- `enigma_import_preview` must be preview-only: no vault write, no raw memory in the result, and public-safe duplicate/receipt/action metadata only.
- `enigma_import_approve` must require `approved:true` and the preview `approval_token`, fail closed for empty imports or when review is still required, and return `enigma.import_approved_batch.v1` with batch receipt metadata only.
- Grant-gated context must fail closed before returning context when a required grant is missing, expired, revoked by status, listed in `revoked_grant_refs`, scoped to the wrong app/purpose/zone, or malformed. The blocked result is public-safe and never includes raw memory.
- `enigma_visual_context` must keep a flat primitive input schema and return deterministic PNG pages only after normal local context selection. The pages are plaintext-equivalent private artifacts, not encryption, public proof, or a recall/billing guarantee.
- `createMcpToolProtocolAudit` reports schema-shape risk without claiming semantic reliability. Provider-specific raw model-output dialect repair remains outside the MCP server boundary.

Package-specific implementation details are governed by `research/handoff-enigma/09_BUILD_BACKLOG.md` and `research/handoff-enigma/12_KIMI_BUILD_BRIEF.md`.
