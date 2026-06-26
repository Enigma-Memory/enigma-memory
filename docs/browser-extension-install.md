# Browser extension local install

This guide is for local developer installation only. It does not submit Enigma to Chrome Web Store, Microsoft Edge Add-ons, Mozilla Add-ons, or any external account.

## Boundaries

- The extension is loaded by the user as an unpacked or temporary local extension.
- The native host is installed by the user and runs on the local machine as `com.enigma.native_host`.
- Context insertion requires two user clicks: request context, then approve insertion.
- The extension must not auto-inject context into a provider page.
- The extension does not use browser sync storage and must not store raw memory in browser storage.
- Provider-native memory is cache only. The local Enigma bundle/native host remains canonical.

## Package preflight

From the package root, validate the extension before loading or zipping it:

```sh
node scripts/package-browser-extension.mjs
```

The command emits public-safe JSON with a deterministic file list, SHA-256 checksums, and safety fields. To also write a deterministic local ZIP for manual inspection or enterprise review:

```sh
node scripts/package-browser-extension.mjs --zip ./dist/enigma-browser-extension.zip
```

The ZIP command does not publish, sign, upload, or submit the extension.

## Install the native host and MCP connector first

Install the npm package, create the local bundle, and let Enigma merge the MCP server entry into the selected client config. Pick the command for the client you use:

```sh
npm install -g enigma-memory && enigma setup --client claude-desktop --write-connectors --overwrite
npm install -g enigma-memory && enigma setup --client cursor --write-connectors --overwrite
npm install -g enigma-memory && enigma setup --client kimi-code --write-connectors --overwrite
npm install -g enigma-memory && enigma setup --client vscode-cline --write-connectors --overwrite
```

If you want Enigma to touch only client config files that already exist, use:

```sh
npm install -g enigma-memory && enigma setup --client auto --connect-installed --overwrite
```

Set `ENIGMA_BUNDLE` for the browser-launched host process to the same bundle path reported by setup, or point the native-host manifest at a small local wrapper that sets `ENIGMA_BUNDLE=<absolute-bundle-path>` before launching `enigma-native-host`. Native messaging manifests require an absolute executable path; they do not expand shell aliases, `~`, `$HOME`, `%USERPROFILE%`, or command arguments.

Resolve the absolute host executable path:

```sh
command -v enigma-native-host
```

Windows PowerShell:

```powershell
(Get-Command enigma-native-host.cmd).Source
```

## Load the extension locally

### Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose `enigma/apps/browser-extension`.
5. Open the Enigma extension details and copy the 32-character extension ID.

### Microsoft Edge

1. Open `edge://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose `enigma/apps/browser-extension`.
5. Open the Enigma extension details and copy the 32-character extension ID.

### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Select **Load Temporary Add-on**.
3. Choose `enigma/apps/browser-extension/manifest.json`.
4. Copy the temporary extension ID shown by Firefox. For repeatable development, use a stable development add-on ID and pass the same value to the native-host manifest generator.

## Generate the browser native-host manifest

Generate a manifest after you know the extension ID and absolute host path.

Chrome:

```sh
enigma native-host manifest \
  --browser chrome \
  --host-path <absolute-enigma-native-host-path> \
  --extension-id <chrome-extension-id> \
  --out ./com.enigma.native_host.json
```

Edge:

```sh
enigma native-host manifest \
  --browser edge \
  --host-path <absolute-enigma-native-host-path> \
  --extension-id <edge-extension-id> \
  --out ./com.enigma.native_host.json
```

Firefox:

```sh
enigma native-host manifest \
  --browser firefox \
  --host-path <absolute-enigma-native-host-path> \
  --extension-id <firefox-extension-id> \
  --out ./com.enigma.native_host.json
```

Preview browser-specific install locations without mutating registry or profile state:

```sh
enigma native-host install-plan \
  --browser chrome \
  --manifest <absolute-path-to-com.enigma.native_host.json>
```

Use `--browser edge` or `--browser firefox` for the other browsers. The install plan is a checklist: it does not copy manifests, write registry keys, or change browser profiles. Copy the generated manifest to the listed native messaging host location yourself, and on Windows review and run the listed registry command only when you are ready to register `com.enigma.native_host`.

## Register the native-host manifest locally

Use the paths from `enigma native-host install-plan` as the source of truth. These are the common manual targets:

### Chrome native host

- macOS per-user: `<home>/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.enigma.native_host.json`
- Linux per-user: `<home>/.config/google-chrome/NativeMessagingHosts/com.enigma.native_host.json`
- Windows per-user: copy the manifest to an operator-chosen local file, then set `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.enigma.native_host` to that manifest path.

### Microsoft Edge native host

- macOS per-user: `<home>/Library/Application Support/Microsoft Edge/NativeMessagingHosts/com.enigma.native_host.json`
- Linux per-user: `<home>/.config/microsoft-edge/NativeMessagingHosts/com.enigma.native_host.json`
- Windows per-user: copy the manifest to an operator-chosen local file, then set `HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.enigma.native_host` to that manifest path.

### Firefox native host

- macOS per-user: `<home>/Library/Application Support/Mozilla/NativeMessagingHosts/com.enigma.native_host.json`
- Linux per-user: `<home>/.mozilla/native-messaging-hosts/com.enigma.native_host.json`
- Windows per-user: copy the manifest to an operator-chosen local file, then set `HKCU\Software\Mozilla\NativeMessagingHosts\com.enigma.native_host` to that manifest path.

All-users locations and registry hives are operator-managed deployment choices. Local developer install should prefer per-user targets unless an enterprise policy requires otherwise.

## Local insertion demo flow

1. Confirm the native-host manifest allowlist uses the extension ID from the local browser profile.
2. Restart the browser after native-host registration so it can discover `com.enigma.native_host`.
3. Visit a supported HTTPS provider page: ChatGPT, Claude, Kimi, or Perplexity.
4. Open the Enigma control shown by the content script.
5. Click **Request context**. The extension asks the local native host for a transient context pack; selected page text is included only if the user explicitly enables it for that request.
6. Review the returned context in the panel.
7. Click **Approve and insert** to insert plain text into the active prompt surface.
8. Submit to the provider only if you choose to. Enigma does not submit prompts for you.

After insertion, the extension records only target metadata, insertion timestamp, receipt metadata, and insertion counts. It must not write raw memory, context plaintext, or receipt plaintext into browser sync storage or public artifacts.

## Troubleshooting

- **Host not found**: confirm the manifest filename is `com.enigma.native_host.json`, the manifest `name` is `com.enigma.native_host`, and the browser-specific install location or registry key points to the manifest.
- **Host exits immediately**: confirm `ENIGMA_BUNDLE` is visible to the browser-launched process or use a local wrapper that sets it before launching `enigma-native-host`.
- **Extension cannot connect**: confirm the extension ID in the native-host manifest matches the locally loaded extension.
- **No insertion happens**: confirm you clicked both **Request context** and **Approve and insert**. The extension intentionally does not auto-inject.
