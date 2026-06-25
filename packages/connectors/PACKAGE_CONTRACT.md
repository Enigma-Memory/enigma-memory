# Package contract

This package is part of Enigma, the provider-agnostic AI memory and proof layer. Implementations must preserve these invariants:

- Connector installs only configure MCP clients; they never execute shell commands or launch client processes.
- The generated MCP server entry must use command `enigma-mcp` and env key `ENIGMA_BUNDLE`.
- Supported client IDs are `claude-desktop`, `cursor`, `kimi-code`, `vscode-cline`, `roo`, `opencode`, and `generic-mcp`.
- Unknown client IDs, unsupported platforms, and non-object JSON config shapes fail closed.
- Explicit `configPath` overrides default OS-aware paths for `win32`, `darwin`, and `linux`.
- `connectClient` reads JSON, merges only the Enigma MCP server entry, backs up an existing changed file with a timestamp suffix, writes pretty JSON, is idempotent, and supports `dryRun` planned writes.
- `disconnectClient` removes only the Enigma server entry, leaves all other client configuration intact, backs up an existing changed file first, and supports `dryRun` planned writes.
- Connector receipts, plans, and demo artifacts must not contain raw memory plaintext.
- Public exports are `supportedClients`, `getClientProfile`, `renderMcpConfig`, `connectClient`, `disconnectClient`, `detectClientConnector`, `detectConnectors`, `doctorConnectors`, `planConnectWizard`, `platformDefaultConfigPath`, and `runConnectorDemo`.

Package-specific implementation details are governed by `research/handoff-enigma/09_BUILD_BACKLOG.md` and `research/handoff-enigma/12_KIMI_BUILD_BRIEF.md`.
