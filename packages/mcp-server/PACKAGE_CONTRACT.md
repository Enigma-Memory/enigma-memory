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
- Tool calls return MCP-style `content` text plus identical `structuredContent`; tool failures return JSON-RPC error objects.
- MCP resources expose only Passport/Vault metadata and never raw memory plaintext.
- MCP prompts must instruct assistants to request Enigma context before answering user-specific questions and to be honest when Enigma context is unavailable.
- Logs and diagnostics must never be written to stdout; stdout is reserved for JSON-RPC frames.
- `enigma_init` creates a local vault bundle if it is missing and never returns local key material.
- Public exports are `toolDescriptors`, `resourceDescriptors`, `promptDescriptors`, `handlers`, `enigma_init`, `enigma_remember`, `enigma_search`, `enigma_context_pack`, `enigma_delete`, `enigma_verify_receipts`, `enigma_passport_summary_resource`, `enigma_standard_memory_prompt`, `handleJsonRpcRequest`, and `startStdioServer`.
- The executable entrypoint is `bin/enigma-mcp.mjs`.
- Developer onboarding should point Claude Desktop, Cursor, Kimi Code, and VS Code users to `npm install -g enigma-memory && enigma setup --client <id> --write-connectors --overwrite` before any manual MCP JSON fallback.

Package-specific implementation details are governed by `research/handoff-enigma/09_BUILD_BACKLOG.md` and `research/handoff-enigma/12_KIMI_BUILD_BRIEF.md`.
