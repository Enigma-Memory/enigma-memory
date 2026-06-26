# Enigma browser extension

Manifest V3 scaffold for explicit Enigma context insertion into web AI subscriptions: ChatGPT, Claude, Kimi, and Perplexity.

## Custody model

- Enigma remains local-first. The extension talks only to the browser's configured native messaging host, `com.enigma.native_host`.
- Raw memory is never written to extension sync storage. This scaffold does not use `chrome.storage.sync` at all.
- Provider-native memory is treated as a cache only. Canonical custody stays in the local Enigma vault/native host.
- Unknown or non-HTTPS provider paths fail closed in both the content script and background worker.

## User approval model

The content script can detect supported pages and show a small Enigma control, but it never auto-injects context.

The user must perform both actions:

1. Click **Request context** to ask the local Enigma native host for a transient context pack.
2. Click **Approve and insert** to place the returned text into the active provider prompt.

Selected page text is not sent by default. If the user wants it included in the local context request, they must enable the checkbox in the panel for that request.

## Native host contract

The background service worker sends native messages with this protocol envelope:

```json
{
  "protocol": "enigma.native.browser.v1",
  "id": "0123456789abcdeffedcba9876543210",
  "type": "enigma.browser.context.request",
  "provider": "chatgpt",
  "page": {
    "origin": "https://chatgpt.com",
    "url": "https://chatgpt.com/c/enigma-local-context",
    "title": "ChatGPT",
    "topLevel": true
  },
  "selection": {
    "text": "Use the current project constraints when drafting this answer.",
    "source": "window-selection"
  },
  "requirements": {
    "custody": "local-only",
    "approval": "user-click",
    "receipt": "required",
    "receiptPlaintext": "forbidden",
    "providerNativeMemory": "cache-only",
    "storage": "transient-extension-memory"
  }
}
```

The native host must answer with insertable context and a receipt commitment:

```json
{
  "protocol": "enigma.native.browser.v1",
  "id": "0123456789abcdeffedcba9876543210",
  "type": "enigma.browser.context.response",
  "ok": true,
  "context": {
    "text": "Enigma context approved for this page:\\n- Respect the local custody policy.\\n- Do not use provider-native memory as canonical storage.",
    "mime": "text/plain"
  },
  "receipt": {
    "id": "rcpt_browser_20260622T000000Z_chatgpt",
    "commitment": "sha256:4f3c2d1e0a9b887766554433221100ffeeddccbbaa99887766554433221100aa",
    "digestAlgorithm": "sha-256",
    "createdAt": "2026-06-22T00:00:00.000Z"
  }
}
```

After insertion, the extension records only target-site metadata, the insertion timestamp, receipt metadata, and insertion counts:

```json
{
  "protocol": "enigma.native.browser.v1",
  "id": "fedcba98765432100123456789abcdef",
  "type": "enigma.browser.insertion.record",
  "provider": "chatgpt",
  "page": {
    "origin": "https://chatgpt.com",
    "url": "https://chatgpt.com/c/enigma-local-context",
    "title": "ChatGPT",
    "topLevel": true
  },
  "insertion": {
    "mode": "insert-at-cursor",
    "target": "contenteditable",
    "insertedCharCount": 1200,
    "insertedAt": "2026-06-22T00:00:00.000Z",
    "receipt": {
      "id": "rcpt_browser_20260622T000000Z_chatgpt",
      "commitment": "sha256:4f3c2d1e0a9b887766554433221100ffeeddccbbaa99887766554433221100aa",
      "digestAlgorithm": "sha-256",
      "createdAt": "2026-06-22T00:00:00.000Z"
    }
  },
  "requirements": {
    "plaintextInRecord": "forbidden",
    "receiptPlaintext": "forbidden"
  }
}
```

The receipt object must not contain plaintext-like fields such as `memory`, `plaintext`, `raw`, `context`, `content`, `text`, or `prompt`. The extension rejects those receipt shapes before insertion records are sent.

## Prompt insertion adapters

The content script supports both common prompt surfaces:

- `textarea` / text `input`: replaces the active selection or inserts at the caret using the native value setter and dispatches `input` plus `change` events for provider frameworks.
- `contenteditable`: uses the active selection when it is inside the prompt, falls back to appending a plain text node, and dispatches an `input` event.

All insertion is plain text. No HTML from Enigma context is inserted into provider pages.

## Loading during development

Package preflight from the package root:

```sh
node scripts/package-browser-extension.mjs
```

To also write a deterministic local ZIP for review:

```sh
node scripts/package-browser-extension.mjs --zip ./dist/enigma-browser-extension.zip
```

The packager validates the unpacked extension, denies source maps/private files/credential-shaped content/local user paths, and emits public-safe JSON with file checksums. It does not submit to any browser store.

1. Install the npm package, create the local bundle, and connect the MCP client you use most often:

   ```sh
   npm install -g enigma-memory && enigma setup --client claude-desktop --write-connectors --overwrite
   npm install -g enigma-memory && enigma setup --client cursor --write-connectors --overwrite
   npm install -g enigma-memory && enigma setup --client kimi-code --write-connectors --overwrite
   npm install -g enigma-memory && enigma setup --client vscode-cline --write-connectors --overwrite
   ```

   To write only client configs that already exist on the machine, use `npm install -g enigma-memory && enigma setup --client auto --connect-installed --overwrite`.
2. Keep the same local bundle available to the browser-launched native host through `ENIGMA_BUNDLE` or a local wrapper.
3. Load `enigma/apps/browser-extension` as an unpacked extension in Chrome or Edge, or load `manifest.json` as a temporary add-on in Firefox.
4. Copy the local extension ID from the browser developer page.
5. Generate the native host manifest:

   ```sh
   enigma native-host manifest \
     --browser chrome \
     --host-path <absolute-enigma-native-host-path> \
     --extension-id <local-extension-id> \
     --out ./com.enigma.native_host.json
   ```

   Use `--browser edge` or `--browser firefox` for those browsers. Preview install targets with `enigma native-host install-plan --browser <chrome|edge|firefox> --manifest <absolute-manifest-path>`, then manually copy/register the manifest as instructed.
6. Restart the browser, visit a supported HTTPS provider page, click **Request context**, review the returned local context, then click **Approve and insert**.

The extension never auto-injects, never submits the provider prompt for the user, and does not use browser sync storage. See `enigma/docs/browser-extension-install.md` for browser-specific local install steps.
