# Enigma native messaging host

This directory contains install assets for registering the Enigma browser-extension native messaging host.

The host name is always:

```text
com.enigma.native_host
```

The browser extension uses this host for local, explicit, user-approved context requests. The host runs on the user's machine, reads the local Enigma bundle selected by `ENIGMA_BUNDLE`, and returns transient context plus receipt metadata to the extension. It must not put raw memory plaintext in receipt objects, relay records, witness checkpoints, SIEM events, or public proof artifacts.

## Trust boundary and non-claims

- The native host is inside the local device trust boundary. Any process that can replace the host executable, wrapper, manifest, or `ENIGMA_BUNDLE` path can change what the extension receives.
- The extension does not use browser sync storage (`chrome.storage.sync`) at all. Keep raw memory in the local Enigma bundle; browser records are limited to target metadata, insertion counts, timestamps, and receipt metadata.
- The extension requires explicit user approval before inserting returned context into a provider page.
- Provider-native memory is cache only. The local Enigma bundle remains canonical.
- Enigma can verify Enigma-controlled vault state and receipts. It cannot prove that a closed provider deleted hidden copies, disabled personalization, or made a model forget.

## Files

- `manifests/com.enigma.native_host.chrome.json` — Chrome native-host manifest template.
- `manifests/com.enigma.native_host.edge.json` — Microsoft Edge native-host manifest template.
- `manifests/com.enigma.native_host.firefox.json` — Firefox native-host manifest template.

The CLI manifest generator and install-plan preview are the recommended path because they render browser-specific JSON and manual install targets from explicit arguments. The checked-in templates remain valid manual fallbacks when you need to inspect or construct a manifest by hand.

## Prerequisites

1. Install Enigma so `enigma-native-host` is available, or build/use the repository host executable.
2. Create a local bundle and use an absolute path for it:

   ```sh
   mkdir -p "$HOME/.enigma"
   enigma init --bundle "$HOME/.enigma/bundle.json" --subject local-user --display-name "Local user"
   export ENIGMA_BUNDLE="$HOME/.enigma/bundle.json"
   ```

   Windows PowerShell:

   ```powershell
   New-Item -ItemType Directory -Force "$HOME\.enigma"
   enigma init --bundle "$HOME\.enigma\bundle.json" --subject local-user --display-name "Local user"
   [Environment]::SetEnvironmentVariable('ENIGMA_BUNDLE', "$HOME\.enigma\bundle.json", 'User')
   $env:ENIGMA_BUNDLE="$HOME\.enigma\bundle.json"
   ```

3. Resolve the absolute path to the host executable. Native messaging manifests do not expand `~`, `$HOME`, `%USERPROFILE%`, shell aliases, or `PATH` lookups. Use the full executable path, for example:

   - macOS/Linux: `/Users/REPLACE_WITH_USER/.npm-global/bin/enigma-native-host` or `/usr/local/bin/enigma-native-host`
   - Windows: `C:\\Users\\REPLACE_WITH_USER\\AppData\\Roaming\\npm\\enigma-native-host.cmd`

   Useful checks: `command -v enigma-native-host` on macOS/Linux, or `(Get-Command enigma-native-host.cmd).Source` in Windows PowerShell. If you use a wrapper to set `ENIGMA_BUNDLE`, resolve the wrapper's absolute path instead.

4. If your browser does not inherit the `ENIGMA_BUNDLE` user environment, create a small local wrapper that sets `ENIGMA_BUNDLE` and then execs the absolute `enigma-native-host` path. Point the manifest `path` to that wrapper. Keep the wrapper owner-writable only.

## Generate a manifest

Use the CLI generator instead of hand-editing JSON:

```sh
enigma native-host manifest \
  --browser chrome \
  --host-path "/absolute/path/to/enigma-native-host" \
  --extension-id "REPLACE_WITH_CHROME_EXTENSION_ID" \
  --out ./com.enigma.native_host.json
```

Windows PowerShell example:

```powershell
enigma native-host manifest `
  --browser edge `
  --host-path "C:\Users\REPLACE_WITH_USER\AppData\Roaming\npm\enigma-native-host.cmd" `
  --extension-id "REPLACE_WITH_EDGE_EXTENSION_ID" `
  --out .\com.enigma.native_host.json
```

Use `--browser chrome`, `--browser edge`, or `--browser firefox`. `--host-path` must be an absolute path to the host executable or to a local wrapper that sets `ENIGMA_BUNDLE` and then launches `enigma-native-host`; native messaging manifests do not expand `~`, `$HOME`, `%USERPROFILE%`, shell aliases, `PATH`, or command arguments. Without `--out`, the generator prints manifest JSON to stdout. With `--out`, it writes the manifest file and reports `{ ok, path }`. It does not copy the manifest into browser directories and does not write Windows registry keys.

Find the extension ID before running the command. Chrome and Edge native-host manifests require the 32-character lowercase ID shown by the browser:

- Chrome: open `chrome://extensions`, enable Developer mode, load `enigma/apps/browser-extension` unpacked, open the Enigma card details, and copy the ID.
- Edge: open `edge://extensions`, enable Developer mode, load `enigma/apps/browser-extension` unpacked, open the Enigma card details, and copy the ID.
- Firefox: open `about:debugging#/runtime/this-firefox`, load the extension temporarily, and use the listed extension ID. For repeatable development, set a stable `browser_specific_settings.gecko.id` in the extension manifest or use the ID assigned by the signed build, then pass the same value to `--extension-id`.

Keep `ENIGMA_BUNDLE` configured for the browser-launched process. GUI-launched browsers may not inherit shell environment variables; when in doubt, point `--host-path` at a wrapper that sets `ENIGMA_BUNDLE` to an absolute bundle path before launching the host.

## Preview the install plan

Before copying manifests or changing registry/profile state, run the safe planner with the generated manifest's absolute path:

```sh
enigma native-host install-plan \
  --browser chrome \
  --manifest "/absolute/path/to/com.enigma.native_host.json"
```

Windows PowerShell example:

```powershell
enigma native-host install-plan `
  --browser edge `
  --manifest "C:\Users\REPLACE_WITH_USER\AppData\Local\Enigma\NativeMessagingHosts\com.enigma.native_host.json"
```

Use `--browser chrome`, `--browser edge`, or `--browser firefox`. The optional `--os windows|macos|linux` and `--home <absolute path>` flags let an operator preview another user's or platform's per-user target paths without touching that machine. `--manifest` and `--home` must be absolute paths.

The planner prints JSON fields including `manifest_source`, `target_manifest_paths`, `manual_steps`, `registry_command_preview`, `firefox_manifest_directory`, and `writes_performed: false`. It does not create directories, copy manifest files, write browser profile files, or write Windows registry keys. Treat every path and command as an operator checklist: copy `manifest_source` to a listed `target_manifest_paths` entry yourself, and on Windows Chrome/Edge review and run the displayed `reg add ...` command only when you are ready to register the host.

The planner is a preflight only. Native registration is still not complete until the user or enterprise operator performs the copy/registry/profile steps and then verifies the browser can launch `com.enigma.native_host`.

## Manual template fallback

If you cannot use the generator, copy the template for your browser to a working file named `com.enigma.native_host.json`, then replace:

- `path` with the absolute executable or wrapper path.
- Chrome `REPLACE_WITH_CHROME_EXTENSION_ID` with the unpacked Chrome extension ID from `chrome://extensions` > Enigma > Details.
- Edge `REPLACE_WITH_EDGE_EXTENSION_ID` with the unpacked Edge extension ID from `edge://extensions` > Enigma > Details.
- Firefox `REPLACE_WITH_FIREFOX_EXTENSION_ID` with the Firefox add-on ID from `about:debugging#/runtime/this-firefox`, a stable development `browser_specific_settings.gecko.id`, or the installed/signed add-on ID.

Do not add arguments to `path`; browsers launch native messaging hosts through stdio using the executable path only.

## Install locations

### Chrome

macOS per-user:

```sh
mkdir -p "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
cp com.enigma.native_host.json "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.enigma.native_host.json"
```

macOS all users:

```sh
sudo mkdir -p "/Library/Google/Chrome/NativeMessagingHosts"
sudo cp com.enigma.native_host.json "/Library/Google/Chrome/NativeMessagingHosts/com.enigma.native_host.json"
```

Linux per-user:

```sh
mkdir -p "$HOME/.config/google-chrome/NativeMessagingHosts"
cp com.enigma.native_host.json "$HOME/.config/google-chrome/NativeMessagingHosts/com.enigma.native_host.json"
```

Linux all users:

```sh
sudo mkdir -p /etc/opt/chrome/native-messaging-hosts
sudo cp com.enigma.native_host.json /etc/opt/chrome/native-messaging-hosts/com.enigma.native_host.json
```

Windows per-user registry entry:

```powershell
$manifestDir='C:\Users\REPLACE_WITH_USER\AppData\Local\Enigma\NativeMessagingHosts'
$manifest=Join-Path $manifestDir 'com.enigma.native_host.json'
New-Item -ItemType Directory -Force $manifestDir | Out-Null
Copy-Item .\com.enigma.native_host.json $manifest -Force
New-Item -Path 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.enigma.native_host' -Force | Out-Null
Set-Item -Path 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.enigma.native_host' -Value $manifest
```

Use `HKLM:\Software\Google\Chrome\NativeMessagingHosts\com.enigma.native_host` for an all-users install.

### Microsoft Edge

macOS per-user:

```sh
mkdir -p "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
cp com.enigma.native_host.json "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts/com.enigma.native_host.json"
```

macOS all users:

```sh
sudo mkdir -p "/Library/Microsoft/Edge/NativeMessagingHosts"
sudo cp com.enigma.native_host.json "/Library/Microsoft/Edge/NativeMessagingHosts/com.enigma.native_host.json"
```

Linux per-user:

```sh
mkdir -p "$HOME/.config/microsoft-edge/NativeMessagingHosts"
cp com.enigma.native_host.json "$HOME/.config/microsoft-edge/NativeMessagingHosts/com.enigma.native_host.json"
```

Linux all users:

```sh
sudo mkdir -p /etc/opt/edge/native-messaging-hosts
sudo cp com.enigma.native_host.json /etc/opt/edge/native-messaging-hosts/com.enigma.native_host.json
```

Windows per-user registry entry:

```powershell
$manifestDir='C:\Users\REPLACE_WITH_USER\AppData\Local\Enigma\NativeMessagingHosts'
$manifest=Join-Path $manifestDir 'com.enigma.native_host.json'
New-Item -ItemType Directory -Force $manifestDir | Out-Null
Copy-Item .\com.enigma.native_host.json $manifest -Force
New-Item -Path 'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.enigma.native_host' -Force | Out-Null
Set-Item -Path 'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.enigma.native_host' -Value $manifest
```

Use `HKLM:\Software\Microsoft\Edge\NativeMessagingHosts\com.enigma.native_host` for an all-users install.

### Firefox

macOS per-user:

```sh
mkdir -p "$HOME/Library/Application Support/Mozilla/NativeMessagingHosts"
cp com.enigma.native_host.json "$HOME/Library/Application Support/Mozilla/NativeMessagingHosts/com.enigma.native_host.json"
```

macOS all users:

```sh
sudo mkdir -p "/Library/Application Support/Mozilla/NativeMessagingHosts"
sudo cp com.enigma.native_host.json "/Library/Application Support/Mozilla/NativeMessagingHosts/com.enigma.native_host.json"
```

Linux per-user:

```sh
mkdir -p "$HOME/.mozilla/native-messaging-hosts"
cp com.enigma.native_host.json "$HOME/.mozilla/native-messaging-hosts/com.enigma.native_host.json"
```

Linux all users:

```sh
sudo mkdir -p /usr/lib/mozilla/native-messaging-hosts
sudo cp com.enigma.native_host.json /usr/lib/mozilla/native-messaging-hosts/com.enigma.native_host.json
```

Windows per-user registry entry:

```powershell
$manifestDir='C:\Users\REPLACE_WITH_USER\AppData\Local\Enigma\NativeMessagingHosts'
$manifest=Join-Path $manifestDir 'com.enigma.native_host.json'
New-Item -ItemType Directory -Force $manifestDir | Out-Null
Copy-Item .\com.enigma.native_host.json $manifest -Force
New-Item -Path 'HKCU:\Software\Mozilla\NativeMessagingHosts\com.enigma.native_host' -Force | Out-Null
Set-Item -Path 'HKCU:\Software\Mozilla\NativeMessagingHosts\com.enigma.native_host' -Value $manifest
```

Use `HKLM:\Software\Mozilla\NativeMessagingHosts\com.enigma.native_host` for an all-users install.

## Load the extension

1. Install the native host manifest for the browser you are testing.
2. Open the browser extension management page.
3. Enable developer mode.
4. Load `enigma/apps/browser-extension` as an unpacked extension.
5. Confirm the extension ID matches the manifest allowlist.
6. Visit a supported provider page and use the Enigma control. The extension asks the native host for local context only after the user clicks the request control, and it inserts only after the user approves insertion.

If the browser reports that the host is not found, re-check the manifest install location, registry key, manifest filename, host `name`, absolute executable path, executable permissions, and extension ID allowlist.
