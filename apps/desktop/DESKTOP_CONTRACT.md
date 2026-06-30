# Enigma desktop shell contract

This package is a dependency-free browser shell that can be wrapped later by Electron, Tauri, WebView, or another host.

## Guarantees

- `src/index.html` opens as a standalone static page with only local `src/styles.css`; it embeds dependency-free module logic so Chromium file loads are not blocked by external module-file policy.
- `src/app.js` remains the ESM test and wrapper surface. It exports `createDesktopState`, `desktopReducer`, `renderDesktopModel`, `renderMemoryDriveDashboard`, `desktopActions`, and named action creators for MCP, vault, Memory Drive, service, health, proof activity, update, diagnostics, memory, verifier, client, import, and export flows.
- First-run state defaults to the consumer `home` screen. Public copy says Memory Drive, connected apps, health/fix-it, proof activity, updates, diagnostics, and safe support report before advanced vault/MCP wording.
- `renderMemoryDriveDashboard` is the public-safe dashboard contract. It exposes one `next_action`, `memory_drive_status`, `connected_app_count`, `proof_status`, `update_status`, `diagnostics_status`, `offline_ready`, `issue_codes`, `memory_controller`, and `import_sandbox`.
- Dashboard, diagnostics, proof, import receipt, release evidence, and screenshot surfaces must not contain raw memory bodies, prompts, transcripts, provider responses, local absolute paths, credentials, tokens, private keys, account identifiers, customer identifiers, or signing secrets.
- Reducer state is local operational evidence only. UI state is never presented as cryptographic proof.
- Receipt verifier output is structural evidence about supplied receipts. Offline receipt verification remains the proof path.
- Raw memory plaintext is not exported, shown in receipts, deletion evidence, verifier evidence, or import/export bundles. Memory text entered in the shell is reduced to a local fingerprint plus non-sensitive descriptor metadata.
- Unknown screens, draft paths, actions, public-launch update payload fields, and import bundle schemas fail closed.
- Provider-native memory is treated as cache/client state, never canonical custody. The desktop shell does not claim provider deletion, model forgetting, provider-native memory control, hosted SaaS/BYOC readiness, compliance certification, benchmark superiority, legal/patent conclusions, chain submission, or tamper-proof guarantees.

## Screens

The static shell renders consumer home, Memory Controller, Import Sandbox, setup/fix-it, advanced vault status, MCP server status, connected app buttons, import/export, receipt verifier output, delete-and-prove evidence, mesh status, and enterprise status.

## Public-launch command contract

- `desktop/create-memory-drive` creates or detects the local Memory Drive wrapper around the advanced vault state. It ignores raw path-like input and stores only generated local identifiers and issue codes.
- `desktop/service/update` records the bundled runtime/service boundary status without local logs, ports, process paths, credentials, or provider responses.
- `desktop/health/update` records public-safe health state and issue codes for one-action fix-it.
- `desktop/proof/update` records proof activity status and counts without receipt bodies, prompts, transcripts, or provider responses.
- `desktop/update/status` records update state and a safe version label only.
- `desktop/diagnostics/update` records safe support-report readiness, issue codes, and redacted summary strings only.
- `desktop/shutdown` stops the local bundled service/MCP control state and disconnects local connected-app records. It does not claim provider deletion, model forgetting, or provider-native memory control.
- Existing advanced commands remain available: `vault/create`, `mcp/start`, `mcp/stop`, `client/connect`, `client/disconnect`, receipt inspection, import/export, and delete-and-prove. Consumer shutdown uses the explicit stopped service/MCP state and does not imply provider-side deletion or model forgetting.
