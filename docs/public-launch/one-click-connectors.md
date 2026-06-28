# One-click connector plan

## Purpose

Make Enigma Memory feel like a consumer desktop product: install the signed desktop app, open Connectors, choose an AI client, approve the preview, and start using the local vault through MCP without installing Node, opening a terminal, or editing JSON.

The CLI remains the power-user engine. The public default is a Tauri desktop shell that bundles the Enigma runtime internally and performs connector detection, consent, config updates, backups, rollback, restarts guidance, and health checks through a guided UI.

## Claim and privacy boundaries

- Enigma writes only Enigma-controlled local vault and client connector state.
- Enigma does not claim provider deletion, model forgetting, hosted SaaS readiness, BYOC readiness, compliance certification, benchmark superiority, or legal/patent conclusions.
- Public logs and support bundles must not expose raw memory, prompts, transcripts, credentials, tokens, private keys, account IDs, customer identifiers, or raw local absolute paths.
- UI diagnostics may show client names, status, redacted config locations, redacted bundle labels, timestamps, error classes, and hashes/fingerprints when needed.
- Every client config write requires explicit user consent after a human-readable preview. Detection, preview, and health checks are read-only.

## Consumer experience

### Default connect flow

1. User installs and opens the signed Enigma Memory desktop app.
2. First run creates or locates the automatic local vault.
3. Connectors screen detects supported MCP clients.
4. User selects a detected client or chooses Generic MCP.
5. Enigma shows a plain-language preview:
   - client name;
   - whether Enigma will add, update, repair, or remove the Enigma MCP server entry;
   - whether a backup will be created;
   - whether restart is required;
   - redacted config and vault labels, not raw local paths.
6. User clicks Connect.
7. Enigma writes only the Enigma MCP entry, preserving unrelated client settings and other MCP servers.
8. Enigma records a rollback snapshot before changing an existing config.
9. Enigma shows restart guidance specific to the client.
10. Enigma runs health verification after restart or when the user clicks Test.

### Default disconnect flow

1. User opens Connectors and selects a connected client.
2. Enigma previews that only the `enigma` MCP server entry will be removed.
3. User clicks Disconnect.
4. Enigma creates a backup when the config changes.
5. Enigma removes only the Enigma entry and preserves all unrelated client settings.
6. Enigma shows restart guidance and a Test button that verifies Enigma is no longer advertised to that client.

### Default repair flow

1. Health dashboard flags a connector as Needs repair.
2. User opens the connector detail view.
3. Enigma explains the detected issue in consumer language: missing bundle, malformed config, stale command, permission denied, restart needed, or client not found.
4. Enigma offers one safe fix at a time.
5. User clicks Repair after previewing the exact change class.
6. Enigma writes only after consent, keeps a rollback snapshot, then re-runs health verification.

## Desktop connector architecture

### Local components

- **Enigma Desktop**: Tauri shell, signed and notarized/stapled where applicable, with bundled runtime. It owns the consumer connector UI.
- **Connector engine**: shared library or wrapped CLI code path that performs detection, preview, semantic config write, backup, rollback, disconnect, repair, and health verification.
- **Local vault manager**: creates and tracks the default local vault label and bundle reference without surfacing raw absolute paths in public logs.
- **Health service**: read-only checks for client detection, config parseability, Enigma MCP entry presence, bundle availability, command availability, restart state, and last handshake/test result.
- **Public log redactor**: central path and secret redaction layer used by UI diagnostics, support export, and release telemetry if added later.

### Required connector engine operations

| Operation | Write? | Consent required? | Public log rule |
| --- | --- | --- | --- |
| Detect installed clients | No | No | Client name/status only |
| Preview connect/repair/disconnect | No | No | Redacted config and vault labels only |
| Connect | Yes | Yes | Change class and backup id only |
| Disconnect | Yes | Yes | Change class and backup id only |
| Repair | Usually yes | Yes when writing | Error class and fix class only |
| Roll back | Yes | Yes | Backup id only |
| Test | No, unless user chooses repair | No | Health status only |

### Config write contract

- Parse existing JSON before writing.
- If JSON is malformed, do not overwrite it by default. Offer Open in editor, Restore last Enigma backup, or Replace with minimal valid config only after explicit consent.
- Preserve unrelated settings and sibling MCP servers.
- Write semantic changes only; an equivalent Enigma entry should be a no-op.
- Create a timestamped rollback backup before modifying an existing config.
- Use atomic write behavior where the platform allows it.
- Treat permission denied as a blocked write, not as a reason to request broad privileges immediately.
- Never create configs for missing clients unless the user selected Generic MCP or explicitly selected an installed client whose config file is absent but whose app is present.

### One-click fix catalog

The desktop app should expose one primary fix button per failure so users are not asked to choose between technical actions.

| Detected issue | Primary one-click fix | Preview before write | Rollback |
| --- | --- | --- | --- |
| Enigma entry missing for installed client | Connect Enigma | Add `mcpServers.enigma` or equivalent extension install | Restore prior config or remove extension |
| Enigma entry points at stale vault | Update vault link | Update only Enigma's vault reference, shown as a redacted vault label | Restore prior Enigma entry |
| Enigma command bridge stale | Repair connector bridge | Update only Enigma command/args/env fields | Restore prior Enigma entry |
| Existing Enigma entry should be removed | Disconnect Enigma | Remove only Enigma's MCP server entry | Restore prior Enigma entry |
| Config malformed | Restore last safe config | Restore backup id and affected client label | Restore previous backup when available |
| Bundle missing | Recreate local vault | Create/select vault label and update connector only if needed | Restore prior connector entry |
| Permission denied | Retry after permission fix | No write until user retries and approves | No partial write should exist |

If more than one issue exists, show the safest prerequisite first: malformed config before connector edits, missing bundle before command updates, permission denied before any write, and restart needed after successful writes.

### Client matrix

| Client | Preferred public path | Fallback | Restart guidance | Test target |
| --- | --- | --- | --- | --- |
| Claude Desktop | `.mcpb` extension install | Semantic config write | Fully quit and reopen Claude Desktop | Extension/config present, vault ready, MCP handshake when observable |
| Cursor | Semantic config write | Copy manual snippet | Reload/restart Cursor | Parseable MCP config and Enigma entry |
| Kimi Code | Semantic config write | Copy manual snippet | Restart Kimi Code | Parseable MCP config and Enigma entry |
| VS Code/Cline | Cline MCP config write | Install Cline or Generic MCP | Reload VS Code window | Cline config ready and vault reachable |
| Roo | Roo MCP config write | Copy manual snippet | Reload/restart Roo host | Roo config ready and vault reachable |
| OpenCode | Semantic config write | Copy manual snippet | Restart or reload MCP servers | OpenCode config ready and vault reachable |
| Generic MCP | Copy/export snippet | User-selected config-file write | Restart or reload the chosen MCP client | Selected config ready when Enigma manages it |

### Per-client flow checklist

Each client card must implement the same consumer-grade lifecycle. A client is launch-ready only when every column is true for that client.

| Client | Detect | Preview | One-click connect | One-click disconnect | One-click repair | Backup/rollback | Restart guidance | Health test | Required failure coverage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Claude Desktop | App plus extension/config capability | Extension install or config delta | Install `.mcpb` or write fallback entry | Remove/disable extension or remove fallback entry | Enable extension, restore config, repair vault, or update bridge | Backup config fallback; extension removal guidance for `.mcpb` | Full quit and reopen | Extension/config, vault, bridge, handshake when observable | Missing Claude, malformed fallback config, missing bundle, restart needed, permission denied |
| Cursor | App/config markers | Config delta | Write Enigma entry | Remove Enigma entry | Create config, restore config, repair vault, or update bridge | Backup before changed config; rollback button | Reload/restart Cursor | Config parse, Enigma entry, vault, bridge | Missing Cursor, malformed config, missing bundle, restart needed, permission denied |
| Kimi Code | App/config markers | Config delta | Write Enigma entry | Remove Enigma entry | Create/restore config, repair vault, or update bridge | Backup before changed config; rollback button | Restart Kimi Code | Config parse, Enigma entry, vault, bridge | Missing Kimi Code, malformed config, missing bundle, restart needed, permission denied |
| VS Code/Cline | VS Code plus Cline extension/config | Cline config delta | Write Cline MCP entry | Remove Enigma entry | Install Cline, create/restore config, repair vault, or update bridge | Backup before changed config; rollback button | Reload VS Code window | Cline config parse, Enigma entry, vault, bridge | Missing VS Code/Cline, malformed config, missing bundle, restart needed, permission denied |
| Roo | Roo extension/app config markers | Roo config delta | Write Enigma entry | Remove Enigma entry | Create/restore config, repair vault, or update bridge | Backup before changed config; rollback button | Reload/restart Roo host | Roo config parse, Enigma entry, vault, bridge | Missing Roo, malformed config, missing bundle, restart needed, permission denied |
| OpenCode | App/config markers | Config delta | Write Enigma entry | Remove Enigma entry | Create/restore config, repair vault, or update bridge | Backup before changed config; rollback button | Restart or reload MCP servers | Config parse, Enigma entry, vault, bridge | Missing OpenCode, malformed config, missing bundle, restart needed, permission denied |
| Generic MCP | User-selected config or copy-only mode | Snippet or selected-file delta | Copy snippet or write selected file | Remove from selected file or show manual removal | Restore selected-file backup, repair vault, or copy fresh snippet | Backup only when Enigma writes selected file; rollback button | Restart/reload chosen MCP client | Selected-file parse when managed, vault, bridge | Unknown client, malformed selected config, missing bundle, restart needed, permission denied |

## Supported client plans

### Claude Desktop

Best consumer path: Claude Desktop Extension (`.mcpb`) when feasible.

#### Concrete `.mcpb` contract

The Claude-first public helper is `createClaudeDesktopMcpbManifest()`. It emits only public MCPB `manifest.json` metadata aligned with manifest version `0.3`: `name`, `display_name`, `version`, description, `server.type`, `server.entry_point`, `server.mcp_config`, `user_config.enigma_bundle`, supported platforms, required runtime note, spec reference, and the Enigma claim boundary. It must not include raw config JSON, local absolute paths, credentials, tokens, provider responses, transcripts, memory contents, signing secrets, or customer identifiers.

`createClaudeDesktopMcpbConnectionPlan()` defines the desktop state order as `detect -> preview -> consent -> install_handoff -> restart -> test -> ready`. The default Claude path is an extension install handoff: Enigma does not write Claude config automatically for the `.mcpb` path. The bridge pairing contract is current-OS-user scoped and keeps pairing secrets, raw local service endpoints, and local paths out of the manifest and support exports. Manual JSON remains an advanced fallback only and requires explicit user selection plus the normal consent/backup rules.

`createClaudeDesktopMcpbHealth()` reports only `not_installed`, `mcpb_ready`, `restart_required`, `testing`, `ready`, `repair_required`, or `advanced_fallback`. It must fail closed: installed-but-untested extensions are `mcpb_ready`, not connected, and `ready` requires positive test evidence. Every health state includes a public-safe `primary_action` and `next_action_id` so the desktop can show one clear user action without local paths, raw config, logs, or JSON editing.

#### Connect

1. Detect Claude Desktop installation and supported extension capability.
2. Prefer a signed Enigma `.mcpb` package that contains the Enigma MCP server metadata and uses the bundled Enigma runtime bridge.
3. Show preview: "Install Enigma Memory extension for Claude Desktop" with no raw config path.
4. User clicks Connect.
5. If `.mcpb` flow is available, launch/import the extension package and guide the user through Claude's extension install confirmation.
6. If `.mcpb` flow is unavailable, fall back to config writing:
   - preview add/update of `mcpServers.enigma`;
   - require consent;
   - back up existing config;
   - write Enigma MCP entry;
   - prompt user to fully quit and reopen Claude Desktop.
7. Test by checking configured Enigma entry and, after restart, the MCP handshake status if observable.

#### Disconnect

- `.mcpb`: guide user to remove or disable the Enigma extension in Claude Desktop; Enigma verifies absence/disabled state where observable.
- Config fallback: preview removal of only `mcpServers.enigma`, require consent, back up, remove entry, and ask user to restart Claude Desktop.

#### Repair

- If extension installed but disabled: show Enable in Claude guidance.
- If fallback config malformed: offer backup restore or guarded minimal replacement.
- If bundle missing: offer Recreate local vault or Select existing vault.
- If command bridge stale: offer Update connector entry.
- If restart needed: show Quit and reopen Claude Desktop.

#### Test

- Read-only config/extension detection.
- Verify the local vault bundle exists through the vault manager.
- Verify Enigma MCP command/bridge is resolvable by the desktop runtime.
- Ask user to open Claude and use the Enigma tool only after green local checks.

### Cursor

Best consumer path: semantic MCP config write from Enigma Desktop.

#### Connect

1. Detect Cursor installation and existing MCP config presence.
2. If Cursor is missing, show Install Cursor or Skip.
3. If config exists and parses, preview add/update of the Enigma MCP server entry.
4. Require explicit consent.
5. Create backup, write only the Enigma entry, and preserve other MCP servers.
6. Prompt user to reload/restart Cursor.
7. Test local config, bundle, command bridge, and connector health.

#### Disconnect

- Preview removal of the Enigma entry only.
- Require consent, create backup, remove entry, prompt reload/restart, verify disconnected state.

#### Repair

- Missing config with installed Cursor: offer Create Cursor MCP config with Enigma entry.
- Malformed config: offer Restore backup or Open config; do not overwrite silently.
- Missing bundle: offer Recreate local vault or Select existing vault.
- Permission denied: show OS-specific permission guidance and Retry.
- Restart needed: show Reload window / restart guidance.

#### Test

- Verify parseable config with `mcpServers.enigma`.
- Verify bundle label resolves internally.
- Verify no raw paths appear in exported health logs.

### Kimi Code

Best consumer path: semantic MCP config write from Enigma Desktop.

#### Connect

1. Detect Kimi Code installation and config location through known app/config markers.
2. Show detected status and preview the Enigma MCP entry.
3. Require consent before writing.
4. Back up existing config if changed.
5. Write or update only the Enigma entry.
6. Prompt the user to restart Kimi Code.
7. Run health verification.

#### Disconnect

- Remove only the Enigma MCP entry after preview and consent.
- Keep backup and verify disconnected status.

#### Repair

- Missing client: show installation guidance and Skip.
- Missing bundle: offer Recreate local vault or Select existing vault.
- Malformed config: offer Restore backup or Open config.
- Permission denied: explain blocked write and offer Retry after user fixes permissions.
- Restart needed: show restart prompt until the connector health check refreshes.

#### Test

- Read config parse state.
- Verify Enigma entry points to the current local vault label through internal mapping.
- Verify command bridge availability.

### VS Code / Cline

Best consumer path: detect VS Code-compatible installs and write the Cline MCP configuration only with consent.

#### Connect

1. Detect VS Code, compatible forks if supported, and Cline extension/config presence.
2. If VS Code exists but Cline is missing, show Install Cline extension and defer config writing until Cline is present or the user explicitly chooses Generic MCP.
3. If Cline config is present or user consents to create it for an installed Cline extension, preview Enigma entry.
4. Require consent.
5. Back up existing config and write only the Enigma MCP entry.
6. Prompt user to reload the VS Code window.
7. Verify health after reload.

#### Disconnect

- Preview Enigma entry removal only, require consent, back up, remove, and ask the user to reload VS Code.

#### Repair

- Cline missing: deep-link or guide to install extension; do not write unrelated VS Code settings.
- Config malformed: restore backup or open file; no silent overwrite.
- Permission denied: show workspace/profile permission guidance.
- Restart needed: Reload Window guidance.
- Bundle missing: vault repair flow.

#### Test

- Verify Cline config parseability and Enigma entry.
- Verify local vault and command bridge.
- Surface Cline-specific readiness in health dashboard.

### Roo

Best consumer path: detect Roo extension/app configuration and write the MCP entry only with consent.

#### Connect

1. Detect Roo presence and its MCP config file/state.
2. If Roo is missing, show Install Roo or Skip.
3. Preview add/update of Enigma MCP entry with redacted config label.
4. Require consent.
5. Back up existing config, write semantic update, prompt reload/restart.
6. Run health verification.

#### Disconnect

- Remove only Enigma entry after preview and consent.
- Keep rollback backup and verify disconnected status.

#### Repair

- Missing config with Roo installed: offer Create Roo MCP config.
- Malformed config: offer Restore backup or Open config.
- Bundle missing: offer vault repair.
- Permission denied: show permission remediation.
- Restart needed: show reload/restart action.

#### Test

- Verify parseable Roo MCP config.
- Verify Enigma entry and local vault readiness.
- Verify public health export redacts config and vault paths.

### OpenCode

Best consumer path: semantic MCP config write from Enigma Desktop.

#### Connect

1. Detect OpenCode installation and config markers.
2. Preview Enigma MCP entry add/update.
3. Require consent.
4. Back up existing config and write only Enigma changes.
5. Prompt user to restart OpenCode or reload MCP servers if supported.
6. Run health verification.

#### Disconnect

- Preview removal of only Enigma entry.
- Require consent, create backup, remove entry, prompt restart/reload, verify disconnected status.

#### Repair

- Missing client: show install guidance and Skip.
- Config malformed: offer Restore backup or Open config.
- Bundle missing: vault repair flow.
- Permission denied: explain write failure and Retry.
- Restart needed: show restart/reload guidance.

#### Test

- Verify config parseability.
- Verify Enigma entry and command bridge.
- Verify vault bundle readiness through local vault manager.

### Generic MCP

Best consumer path: copyable or exportable MCP snippet for any client, plus optional config-file write only when the user selects a file.

#### Connect

1. User chooses Generic MCP.
2. Enigma explains that this path is for MCP clients not detected by name.
3. Show a redacted, copyable MCP server snippet with the Enigma command bridge and vault label.
4. Offer two actions:
   - Copy instructions;
   - Choose a config file to update.
5. If user chooses a file, parse it, preview Enigma entry add/update, require consent, back up, and write only Enigma changes.
6. Show generic restart guidance: restart the MCP client or reload MCP servers.
7. Run local health verification.

#### Disconnect

- If Enigma wrote the selected config, offer removal from that config after preview and consent.
- If user copied instructions manually, show manual removal guidance without claiming Enigma can edit unknown client state.

#### Repair

- Unknown config shape: explain unsupported shape and provide copyable snippet.
- Malformed config: offer Restore Enigma backup if available or Open config.
- Permission denied: show permission guidance.
- Bundle missing: vault repair flow.
- Restart needed: generic restart guidance.

#### Test

- Verify selected file parseability if Enigma manages it.
- Verify local vault and command bridge.
- Provide a generic MCP ping/check instruction without including raw local paths in support logs.

## Failure modes and UX requirements

| Failure mode | Detection | User-facing message | Allowed fix | Must not do |
| --- | --- | --- | --- | --- |
| Missing client | App/config markers absent | "Client not found on this device." | Install guidance, Skip, Generic MCP | Create config for an absent named client |
| Config malformed | JSON parse fails | "This client config is not valid JSON." | Restore Enigma backup, Open config, guarded replace after consent | Silently overwrite unrelated config |
| Bundle missing | Vault manager cannot resolve current bundle | "Your local vault is missing or moved." | Recreate vault, Select existing vault, Roll back connector | Claim provider memory was deleted/forgotten |
| Restart needed | Config changed but client has not reloaded | "Restart or reload the client to finish connecting." | Client-specific restart/reload steps, Test again | Report connected as fully healthy before reload evidence |
| Permission denied | Write/backup fails with access error | "Enigma cannot update this client config yet." | Explain permission fix, Retry, Copy manual snippet | Escalate privileges without explanation or consent |
| Command bridge missing | Bundled bridge unavailable or stale | "Enigma's local connector bridge needs repair." | Repair desktop install, Update connector entry | Ask consumer to install Node by default |
| Backup failed | Backup write failed before config change | "Enigma could not create a rollback point." | Retry or continue only after explicit elevated-risk consent | Modify existing config without warning |
| Extension unsupported | Claude `.mcpb` unavailable | "Claude extension install is not available here." | Use config-writing fallback with consent | Pretend extension install succeeded |

## Health dashboard

### Connector states

- **Not installed**: client not detected.
- **Ready to connect**: client detected, no Enigma entry.
- **Connected, restart needed**: config changed, client reload not verified.
- **Connected**: config/extension, vault, command bridge, and recent handshake/test are healthy.
- **Needs repair**: fixable local issue detected.
- **Blocked**: permission denied, malformed config without approved fix, or missing client.
- **Disconnected**: no Enigma entry for that client.

### Health checks

- Client detection status.
- Config parseability.
- Enigma entry presence and semantic correctness.
- Backup availability for last write.
- Local vault bundle existence through internal vault mapping.
- Command bridge availability inside the desktop bundle.
- Restart/reload status where observable.
- Last MCP handshake/test result where observable.
- Public diagnostic export redaction check.

## Public log redaction requirements

- Replace local config paths with labels such as `Claude Desktop config`, `Cursor MCP config`, or `Selected MCP config`.
- Replace vault bundle paths with labels such as `Default local vault` or `Selected local vault`.
- Include stable non-reversible fingerprints only when needed for support correlation.
- Never include raw memory records, prompts, transcripts, client conversations, credential material, account IDs, private keys, or customer identifiers.
- Run redaction before rendering UI diagnostics, saving support bundles, or copying error details to clipboard.
- Treat failed redaction as a blocker for public export.

## Deliverables

1. **Desktop Connectors screen** with client cards for Claude Desktop, Cursor, Kimi Code, VS Code/Cline, Roo, OpenCode, and Generic MCP.
2. **Claude `.mcpb` package path** with config-writing fallback when extension installation is unavailable.
3. **Shared connector engine** for detection, preview, connect, disconnect, repair, rollback, and test.
4. **Consent preview UI** that describes the change before any write.
5. **Backup and rollback manager** for every changed client config.
6. **Client-specific restart guidance** after every connect, disconnect, or repair write.
7. **Health dashboard** with the states and checks above.
8. **Public diagnostic redactor** covering UI logs and support exports.
9. **Manual Generic MCP export** for unsupported clients.
10. **Consumer docs update** that teaches the desktop path first and moves CLI/config details behind advanced disclosure.

## Acceptance criteria

- A non-technical user can connect each supported client without using a terminal, installing Node, or editing JSON.
- Claude Desktop uses `.mcpb` as the preferred path when feasible and clearly falls back to config writing when not feasible.
- Cursor, Kimi Code, VS Code/Cline, Roo, OpenCode, and Generic MCP have connect, disconnect, repair, and test flows.
- Detection and preview are read-only.
- Every config write, rollback, disconnect, and destructive repair requires explicit user consent.
- Existing unrelated client settings and sibling MCP servers survive connect, disconnect, and repair.
- Existing config changes create rollback backups before writes.
- Malformed configs are never silently overwritten.
- Missing clients are skipped with clear install guidance.
- Missing bundles route to local vault repair, not to provider-memory claims.
- Permission failures are explained with retry/manual options.
- Restart-needed state remains visible until the user restarts/reloads or a health check proves the client has refreshed.
- Public logs and support exports contain no raw local absolute paths, raw memory, prompts, transcripts, credentials, tokens, private keys, account IDs, or customer identifiers.

## Test plan

Manual and automated product tests should cover these scenarios without requiring public logs to expose raw paths or private content:

1. Fresh desktop install, default vault creation, and connect for each supported client.
2. Missing client detection for each named client.
3. Existing valid config with unrelated MCP servers preserved after connect and disconnect.
4. Equivalent existing Enigma entry produces no config change and no unnecessary backup.
5. Malformed config blocks write and offers backup restore/open-config options.
6. Existing config write creates rollback backup and rollback restores prior content.
7. Bundle missing produces vault repair options and blocks healthy status.
8. Permission denied produces blocked state, retry guidance, and no partial write.
9. Restart needed appears after write and clears only after reload evidence or successful user-triggered test.
10. Claude `.mcpb` install path succeeds where supported.
11. Claude config-writing fallback works where `.mcpb` is unavailable.
12. Generic MCP copy-only path never claims Enigma edited the unknown client.
13. Generic MCP selected-file path preserves unrelated settings and supports rollback.
14. Public diagnostic export redacts config paths, vault paths, memory content, prompts, transcripts, and secrets.

## Release blockers

- Unsigned or unnotarized desktop distribution on platforms where trust prompts would make the consumer path feel unsafe.
- Desktop app requires user-installed Node for the default connector flow.
- Claude `.mcpb` package path is not validated or the fallback is unclear.
- Config writes can occur without explicit consent.
- Backup/rollback is missing for changed existing configs.
- Malformed configs can be silently overwritten.
- Public support export can leak raw local absolute paths or private content.
- Health dashboard can report fully connected before restart/reload is complete.
- Generic MCP flow implies support for editing unknown clients without user-selected config scope.

## Dependencies

- Signed Tauri desktop shell with bundled Enigma runtime and MCP bridge.
- Connector detection map for each supported client and OS.
- Claude Desktop Extension (`.mcpb`) packaging and validation.
- Shared semantic JSON config writer with atomic write and backup support.
- Local vault manager that exposes redacted labels to UI and diagnostics.
- Health verification service with client-specific restart/reload hints.
- Redaction library applied to UI diagnostics and support exports.
- Consumer docs that present desktop setup first and CLI/config editing only as advanced power-user paths.
