# Installers and desktop boundary

Enigma Memory currently has one production install tier and several source-asset tiers. This page is intentionally conservative: it documents what can be used now, what can be generated from source, and what is blocked before native installer distribution.

## Tier 1: npm package now

Use the published package path when you want the current supported local install:

```sh
npm install -g enigma-memory
enigma test-drive --dry-run
enigma setup --overwrite
enigma doctor
enigma connect <client> --dry-run
```

The package exposes the CLI bins `enigma`, `enigma-verify`, `enigma-mcp`, `enigma-relay`, `enigma-gateway`, and `enigma-native-host`. Node.js `>=24` is required. The installer smoke path keeps `enigma test-drive --dry-run` and `enigma connect <client> --dry-run` non-mutating; `enigma setup --overwrite` writes Enigma-controlled local artifacts only and does not write third-party app configs. It does not prove provider deletion, model forgetting, hosted availability, compliance certification, savings, or provider-native memory removal.

## Tier 2: generated source installer assets

The source checkout includes `scripts/build-installer-assets.mjs`, a dependency-free generator for reviewable installer source assets. Dry-run is the default:

```sh
node scripts/build-installer-assets.mjs --out-dir dist/installer-assets
```

Write mode is explicit:

```sh
node scripts/build-installer-assets.mjs --out-dir dist/installer-assets --write
```

Generated asset paths are listed in deterministic code-point lexical order:

- `homebrew/enigma-memory.rb` — Homebrew formula draft. It is not submitted to a tap by the generator; release engineering must replace the source archive URL and SHA before any tap workflow. Its test metadata exercises `enigma test-drive --dry-run`, `enigma setup --dry-run`, and `enigma doctor`, then prints the next client-connect preview command.
- `install-linux.sh` — POSIX shell source installer. It previews by default and only mutates global npm/local setup files when called with `--execute`. Its preview includes package install, `enigma test-drive --dry-run`, `enigma setup --bundle <bundle> --overwrite`, `enigma doctor`, and `enigma connect <client> --dry-run` as the next client-connect command.
- `install-windows.ps1` — PowerShell source installer. It previews by default and only runs `npm install -g enigma-memory`, `enigma test-drive --dry-run`, `enigma setup --bundle <bundle> --overwrite`, and `enigma doctor` when called with `-Execute`; it then prints `enigma connect <client> --dry-run` as the next client-connect command.
- `installer-assets-manifest.json` — deterministic public manifest with checksums for the generated source assets.
- `macos-pkgbuild/README.md` — macOS package source plan and blockers, not a signed package.
- `macos-pkgbuild/manifest.json` — macOS package source metadata and blockers, not a signed package.

The generator intentionally redacts the requested output directory in its public manifest as `<requested-output-dir>`. The manifest records only deterministic asset metadata, the public installer smoke commands, explicit execute gates, and blocker codes. The generated content must not embed tokens, local absolute paths, account identifiers, raw memory, provider transcripts, signing identities, or hosted credentials.

## Native `.exe` and `.pkg` blockers

No signed Windows `.exe` or signed/notarized macOS `.pkg` exists from this generator.

Windows `.exe` distribution is blocked on:

- A selected native installer builder and reproducible input tree.
- A Windows code-signing certificate and signing workflow.
- Release review that installer logs and metadata do not expose local paths, credentials, account data, raw memory, or provider transcripts.

macOS `.pkg` distribution is blocked on:

- macOS release runner access with `pkgbuild` and `productbuild`.
- A staged package layout for npm-installed command shims and package resources.
- Developer ID Installer certificate selection, signing, and notarization.
- Release review of package scripts and evidence output.

Until those blockers are cleared, use npm or generated source scripts only.

## Homebrew path

The formula generated under `homebrew/enigma-memory.rb` is a draft for a future tap workflow. It records the intended package name, license, Node dependency, command shims, and installer smoke test shape: `enigma test-drive --dry-run`, `enigma setup --dry-run`, `enigma doctor`, and the printed next command `enigma connect <client> --dry-run`. Before publication, release engineering must replace the placeholder tarball URL and SHA with a real release archive and confirm the formula installs only the intended package files.

## Desktop tray model boundary

`apps/desktop/src/tray.js` is a pure tray model module. It exposes deterministic state/menu/action helpers for:

- status
- quickstart
- connect clients
- open docs
- run diagnostics
- quit

It does not start a native tray process, create OS menu items, run shell commands, launch browsers, configure MCP clients, or quit a process. Host applications such as Electron, Tauri, WebView, or native wrappers must translate its action intents into real side effects and own their own OS integration, evidence capture, and shutdown behavior.
