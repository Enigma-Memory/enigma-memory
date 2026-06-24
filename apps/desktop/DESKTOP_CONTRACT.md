# Enigma desktop shell contract

This package is a dependency-free browser shell that can be wrapped later by Electron, Tauri, WebView, or another host.

## Guarantees

- `src/index.html` opens as a standalone static page with only local `src/styles.css`; it embeds the same dependency-free module logic so Chromium file loads are not blocked by external module-file policy.
- `src/app.js` remains the ESM test and wrapper surface. It exports `createDesktopState`, `desktopReducer`, `renderDesktopModel`, `desktopActions`, and named action creators for MCP, vault, memory, verifier, client, import, and export flows.
- Reducer state is local operational evidence only. UI state is never presented as cryptographic proof.
- Receipt verifier output is structural evidence about supplied receipts. Offline receipt verification remains the proof path.
- Raw memory plaintext is not exported, shown in receipts, deletion evidence, verifier evidence, or import/export bundles. Memory text entered in the shell is reduced to a local fingerprint plus non-sensitive descriptor metadata.
- Unknown screens, draft paths, actions, and import bundle schemas fail closed.
- Provider-native memory is treated as cache/client state, never canonical custody.

## Screens

The static shell renders vault status, MCP server status, client connection buttons, import/export, receipt verifier output, delete-and-prove evidence, mesh status, and enterprise status.
