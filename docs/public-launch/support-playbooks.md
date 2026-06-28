# Public launch support playbooks

Support playbooks for Enigma Memory public beta and GA. Each playbook contains issue codes, a triage tree, and response templates that stay inside Enigma's evidence boundary.

## Privacy rule for every playbook

Never ask users to send raw memory, prompts, transcripts, credentials, tokens, private keys, account IDs, customer identifiers, complete client config files, or local absolute paths. Safe diagnostic fields are listed in each playbook.

## Support code taxonomy

| Prefix | Area | Examples |
| --- | --- | --- |
| `INST` | Installer and launch trust | Trust prompt blocked, insufficient permission, corrupted installer, first launch failed. |
| `WIZ` | First-run wizard | Vault creation failed, resume failed, client scan failed, health step failed. |
| `CONN` | Client connectors | Client not detected, config malformed, write denied, backup restore failed. |
| `PROOF` | Proof/receipt output | Summary failed, verifier failed, forbidden field detected, offline verify unavailable. |
| `UPD` | Update | Metadata unavailable, signature failed, apply failed, rollback used. |
| `UNINST` | Uninstall/reinstall | Keep-vault failed, explicit removal failed, reconnect after reinstall failed. |
| `OFF` | Offline mode | Offline launch failed, deferred action retried without approval, local view unavailable. |
| `DIAG` | Diagnostics | Bundle created, scrubber rejected, preview failed, user deleted bundle. |
| `PRIV` | Privacy controls | Opt-in missing, disable/delete/export failed, forbidden field detected. |
| `CRASH` | Crash/error reporting | Crash marker created, restart recovery failed, report approval failed. |

## Intake triage

1. Ask for app version, OS family, installer channel, and visible support code.
2. Ask whether the user is willing to generate a local diagnostic bundle.
3. Tell the user to preview the bundle and remove it if they are uncomfortable sharing.
4. Never ask for raw memory, prompts, transcripts, credentials, tokens, account IDs, private keys, or complete client configs.
5. If the issue involves a third-party client, ask for the connector ID and the visible Enigma status, not the full config file.

---

## Install blocked

### Issue codes

- `INST-TRUST-BLOCKED` — OS trust prompt blocked the installer.
- `INST-PERMISSION-BLOCKED` — Insufficient permission to run the installer.
- `INST-CORRUPTED-DOWNLOAD` — Installer failed integrity checks.
- `INST-FIRST-LAUNCH-FAILED` — Installer completed but app did not launch.

### Triage tree

```
User cannot install or open Enigma Memory
├── Is the installer from an Enigma distribution channel?
│   └── No → Ask user to download from official download page; stop.
├── What OS warning appears?
│   ├── Windows SmartScreen → INST-TRUST-BLOCKED
│   ├── macOS Gatekeeper → INST-TRUST-BLOCKED
│   ├── Permission / admin required → INST-PERMISSION-BLOCKED
│   └── Installer damaged or checksum mismatch → INST-CORRUPTED-DOWNLOAD
└── Did installer complete but app fail to launch?
    └── Yes → INST-FIRST-LAUNCH-FAILED
```

### Response templates

**INST-TRUST-BLOCKED (Windows)**

> Thanks for reaching out. The Windows SmartScreen warning is expected for some downloaded apps. If your installer came from our official download page, click **More info** on the SmartScreen prompt, then **Run anyway**. If the installer came from anywhere else, please download it again from [download page] and do not bypass the warning.
>
> Do not send me the installer file or any screenshots that show your downloads folder path.

**INST-TRUST-BLOCKED (macOS)**

> Thanks for reaching out. macOS Gatekeeper may warn about apps downloaded from the web. If your installer came from our official download page, right-click it and choose **Open**, then confirm. If the installer came from anywhere else, please download it again from [download page] and do not bypass the warning.
>
> Do not send me the installer file or any screenshots that show your Applications folder path.

**INST-PERMISSION-BLOCKED**

> Thanks for reaching out. The installer needs permission to write to your Applications folder (macOS) or Program Files folder (Windows). Try running the installer again while logged in as an administrator, or approve the prompt when it appears. If you are on a managed work machine, your IT policy may need to allow the install.

**INST-CORRUPTED-DOWNLOAD**

> Thanks for reaching out. Please delete the installer you have, download a fresh copy from [download page], and compare the file size to the one listed on the page. If the error persists, tell me the app version and OS version and I will escalate.

### Escalation

Escalate as a release blocker if a signed beta/GA build is blocked on a supported OS with default security settings.

---

## Vault creation failed

### Issue codes

- `WIZ-VAULT-CREATE-FAILED` — Wizard could not create the local vault.
- `WIZ-VAULT-PATH-DENIED` — Selected vault location is not writable.
- `WIZ-VAULT-ALREADY-EXISTS` — Vault exists but wizard cannot resume.
- `WIZ-VAULT-REPAIR-FAILED` — In-app repair could not recover the vault.

### Triage tree

```
User cannot create or open the local vault
├── Did first run complete?
│   ├── No → WIZ-VAULT-CREATE-FAILED or WIZ-VAULT-PATH-DENIED
│   └── Yes → vault exists but unreadable
│       ├── In-app repair succeeds → resolved
│       └── In-app repair fails → WIZ-VAULT-REPAIR-FAILED
├── Did user choose a custom vault location?
│   └── Yes → WIZ-VAULT-PATH-DENIED
└── Does a vault already exist from a previous install?
    └── Yes → WIZ-VAULT-ALREADY-EXISTS
```

### Response templates

**WIZ-VAULT-CREATE-FAILED**

> Thanks for reaching out. Let's get your local vault created. Please open Enigma Memory and click **Create local vault** in the setup wizard. If it fails, note the exact support code that appears and I will guide you through recovery.

**WIZ-VAULT-PATH-DENIED**

> Thanks for reaching out. Enigma could not write to the selected vault location. Please go back and use the default location, or pick a folder inside your user home directory that you have permission to write to. Avoid network drives or folders managed by another app.

**WIZ-VAULT-ALREADY-EXISTS**

> Thanks for reaching out. Enigma found an existing vault on this device. In the setup wizard, choose **Use existing vault** if it appears. If the app instead asks to repair, click **Repair vault** and let me know the support code.

**WIZ-VAULT-REPAIR-FAILED**

> Thanks for reaching out. The in-app repair did not recover the vault. If you have a backup, choose **Restore from backup**. If not, choose **Safe reset** — this recreates the vault and preserves your connected app settings. Note the support code before you confirm.

### Escalation

Escalate if the user cannot recover without manually editing files, or if a safe reset corrupts connected app configs.

---

## Client not detected

### Issue codes

- `CONN-NOT-DETECTED` — Supported client is installed but not detected.
- `CONN-NOT-INSTALLED` — Client is not installed.
- `CONN-PERMISSION-DENIED` — Enigma cannot read the client config directory.
- `CONN-UNSUPPORTED-VERSION` — Installed client version is not supported.

### Triage tree

```
User's AI app does not appear in Enigma
├── Is the app installed?
│   └── No → CONN-NOT-INSTALLED
├── Has the app been opened at least once?
│   └── No → Ask user to open it once and retry
├── Does Enigma show a permission error?
│   └── Yes → CONN-PERMISSION-DENIED
├── Is the app version supported?
│   └── No → CONN-UNSUPPORTED-VERSION
└── App installed, opened, supported version
    └── CONN-NOT-DETECTED → retry detection, then manual config
```

### Response templates

**CONN-NOT-INSTALLED**

> Thanks for reaching out. Enigma does not see [client name] installed on this device. Please install it from the official source, open it once, then return to Enigma and click **Refresh detection**.

**CONN-NOT-DETECTED**

> Thanks for reaching out. Please make sure [client name] is installed, open it at least once, then close it. In Enigma, click **Refresh detection**. If it still does not appear, restart both apps and try again. If it remains missing, I can walk you through the advanced manual MCP configuration.

**CONN-PERMISSION-DENIED**

> Thanks for reaching out. Enigma cannot read [client name]'s settings folder because your system blocked access. Please grant Enigma full disk access or file-access permission when prompted, then click **Refresh detection**.

**CONN-UNSUPPORTED-VERSION**

> Thanks for reaching out. The installed version of [client name] is not supported by this Enigma build. Please update [client name] to a current version, or check our supported versions list.

### Escalation

Escalate if detection repeatedly fails on a supported, installed, opened client across restarts.

---

## Config corrupted

### Issue codes

- `WIZ-CONFIG-CORRUPTED` — Enigma app config is malformed.
- `CONN-CONFIG-CORRUPTED` — Third-party client config is malformed.
- `WIZ-CONFIG-RESTORE-FAILED` — Restore from backup failed.
- `WIZ-CONFIG-RESET-FAILED` — Safe reset failed.

### Triage tree

```
App reports corrupted config
├── Is the config Enigma's own app config?
│   ├── Yes → WIZ-CONFIG-CORRUPTED
│   │   ├── Restore from backup succeeds → resolved
│   │   └── Restore fails → WIZ-CONFIG-RESTORE-FAILED or WIZ-CONFIG-RESET-FAILED
│   └── No → CONN-CONFIG-CORRUPTED
│       ├── User approves repair and it succeeds → resolved
│       └── Repair fails → escalate
```

### Response templates

**WIZ-CONFIG-CORRUPTED**

> Thanks for reaching out. Enigma detected that its own settings file is damaged. Please choose **Restore from backup** if a backup is listed. If no backup is available or restore fails, choose **Safe reset** — this removes only Enigma app config and recreates the vault; it does not change your connected apps.

**CONN-CONFIG-CORRUPTED**

> Thanks for reaching out. Enigma detected that [client name]'s settings file may be damaged. Before Enigma makes any change, it will show you a preview. Please approve only the Enigma connector repair; do not approve changes to unrelated settings. A backup will be created automatically.

**WIZ-CONFIG-RESTORE-FAILED / WIZ-CONFIG-RESET-FAILED**

> Thanks for reaching out. The automatic recovery did not complete. Please generate a diagnostic bundle from Settings > Support, preview it, and share it if you are comfortable. Do not share raw memory, prompts, transcripts, or local paths. I will escalate with the support code.

### Escalation

Escalate if recovery requires manual file editing or if unrelated client settings were changed.

---

## App cannot reach helper

### Issue codes

- `WIZ-HELPER-NOT-FOUND` — Enigma helper process is missing.
- `WIZ-HELPER-LAUNCH-FAILED` — Helper process failed to start.
- `WIZ-HELPER-CRASHED` — Helper process crashed.
- `OFF-LOCAL-VIEW-UNAVAILABLE` — Local view failed while offline.

### Triage tree

```
Enigma cannot reach its local helper
├── Did the app install complete?
│   └── No → route to Install blocked playbook
├── Is the helper process running?
│   ├── No → WIZ-HELPER-NOT-FOUND or WIZ-HELPER-LAUNCH-FAILED
│   └── Yes but errors → WIZ-HELPER-CRASHED
└── Does the issue only happen offline?
    └── Yes → OFF-LOCAL-VIEW-UNAVAILABLE
```

### Response templates

**WIZ-HELPER-NOT-FOUND**

> Thanks for reaching out. Enigma cannot find its local helper. Please restart Enigma Memory. If the error persists, reinstall the app using the default keep-user-data option so your vault is preserved.

**WIZ-HELPER-LAUNCH-FAILED**

> Thanks for reaching out. The Enigma helper could not start. This is usually a permission or antivirus block. Please allow Enigma in your antivirus or firewall, then restart the app.

**WIZ-HELPER-CRASHED**

> Thanks for reaching out. The Enigma helper crashed. Please restart the app. If it crashes again, a crash report may be available. You can choose whether to send it from Settings > Support.

**OFF-LOCAL-VIEW-UNAVAILABLE**

> Thanks for reaching out. Some Enigma views need the local helper. Please check that the app has permission to run background processes, then restart Enigma while offline and try again.

### Escalation

Escalate if reinstalling does not restore the helper or if the helper crashes repeatedly.

---

## Update failed

### Issue codes

- `UPD-METADATA-UNAVAILABLE` — Update metadata could not be fetched.
- `UPD-SIGNATURE-FAILED` — Update signature verification failed.
- `UPD-APPLY-FAILED` — Update downloaded but could not be applied.
- `UPD-ROLLBACK-USED` — App rolled back to the previous version.

### Triage tree

```
User reports a failed update
├── Can the app reach the update server?
│   └── No → UPD-METADATA-UNAVAILABLE
├── Did signature verification fail?
│   └── Yes → UPD-SIGNATURE-FAILED
├── Did the update download but fail to install?
│   └── Yes → UPD-APPLY-FAILED
└── Did the app roll back to the prior version?
    └── Yes → UPD-ROLLBACK-USED
```

### Response templates

**UPD-METADATA-UNAVAILABLE**

> Thanks for reaching out. Enigma could not check for updates. Please check your network connection and try again. The app will continue to work with your current version; no data is lost.

**UPD-SIGNATURE-FAILED**

> Thanks for reaching out. The update failed a security check and was blocked. Please do not try to install it manually. We will investigate the signature issue. Your current version remains safe to use.

**UPD-APPLY-FAILED**

> Thanks for reaching out. The update could not be applied. Please restart Enigma; if a rollback does not happen automatically, reinstall the previous version from [download page] using the keep-user-data option.

**UPD-ROLLBACK-USED**

> Thanks for reaching out. Enigma rolled back to the previous version to keep your vault and connections safe. You can continue using the app. Please let us know the support code so we can investigate the failed update.

### Escalation

Escalate if the app cannot relaunch, the vault becomes unreadable, or connector configs are corrupted.

---

## Proof export rejected

### Issue codes

- `PROOF-FORBIDDEN-FIELD` — Export contains a forbidden private field.
- `PROOF-SUMMARY-FAILED` — Proof summary could not be generated.
- `PROOF-VERIFY-FAILED` — Offline verification failed.
- `PROOF-OFFLINE-UNAVAILABLE` — Proof view is unavailable offline.

### Triage tree

```
User cannot export or share a proof
├── Did Enigma reject the export as unsafe?
│   └── Yes → PROOF-FORBIDDEN-FIELD
├── Did proof summary generation fail?
│   └── Yes → PROOF-SUMMARY-FAILED
├── Did verification fail?
│   └── Yes → PROOF-VERIFY-FAILED
└── Did the issue happen while offline?
    └── Yes → PROOF-OFFLINE-UNAVAILABLE
```

### Response templates

**PROOF-FORBIDDEN-FIELD**

> Thanks for reaching out. Enigma rejected the export because it may contain private data. Please use the in-app proof activity screen, which exports only public-safe fields such as hashes, roots, opaque refs, counts, timestamps, signatures, and validation results. Do not paste memory text, prompts, transcripts, or provider responses into export fields.

**PROOF-SUMMARY-FAILED**

> Thanks for reaching out. The proof summary could not be generated. Please check that your local vault is healthy on the dashboard, then try again. If it still fails, note the support code and I will investigate.

**PROOF-VERIFY-FAILED**

> Thanks for reaching out. The proof could not be verified offline. Please make sure you are using a verifier that matches the proof schema version shown in the app. If the schema matches and verification still fails, share the public-safe proof ref and support code.

**PROOF-OFFLINE-UNAVAILABLE**

> Thanks for reaching out. Proof generation works offline, but some verifier links need network access. Please try generating the local summary again from the proof activity screen.

### Escalation

Escalate if proof export includes forbidden data or fails offline verification.

---

## Closure rules

- Close the ticket only after the user confirms the issue is resolved or a reproducible fix is documented.
- For privacy-related tickets, confirm the user knows how to view, export, or delete any shared diagnostics.
- For release blockers, keep the ticket open until engineering confirms the fix is in a build and the scenario is re-run.
