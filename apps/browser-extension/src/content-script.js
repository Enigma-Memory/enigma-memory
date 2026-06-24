(() => {
  'use strict';

  const PROTOCOL = 'enigma-browser-extension';
  const SOURCE = 'enigma-content-script';
  const ROOT_ID = 'enigma-local-memory-root';
  const MAX_INSERT_CHARS = 32000;

  const PROVIDERS = Object.freeze({
    chatgpt: Object.freeze({
      id: 'chatgpt',
      label: 'ChatGPT',
      hosts: Object.freeze(['chatgpt.com', 'chat.openai.com']),
      promptSelectors: Object.freeze([
        'textarea[data-id="root"]',
        'textarea',
        'div[contenteditable="true"][data-id="root"]',
        'div[contenteditable="true"].ProseMirror',
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable]:not([contenteditable="false"])'
      ])
    }),
    claude: Object.freeze({
      id: 'claude',
      label: 'Claude',
      hosts: Object.freeze(['claude.ai']),
      promptSelectors: Object.freeze([
        'div[contenteditable="true"][aria-label]',
        'div[contenteditable="true"].ProseMirror',
        'div[contenteditable="true"][role="textbox"]',
        'textarea',
        'div[contenteditable]:not([contenteditable="false"])'
      ])
    }),
    kimi: Object.freeze({
      id: 'kimi',
      label: 'Kimi',
      hosts: Object.freeze(['kimi.com', 'www.kimi.com', 'kimi.moonshot.cn']),
      promptSelectors: Object.freeze([
        'textarea',
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"].ProseMirror',
        'div[contenteditable]:not([contenteditable="false"])'
      ])
    }),
    perplexity: Object.freeze({
      id: 'perplexity',
      label: 'Perplexity',
      hosts: Object.freeze(['perplexity.ai', 'www.perplexity.ai']),
      promptSelectors: Object.freeze([
        'textarea',
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"][aria-label]',
        'div[contenteditable="true"].ProseMirror',
        'div[contenteditable]:not([contenteditable="false"])'
      ])
    })
  });

  const provider = detectProvider(location.href);
  if (!provider) return;

  const state = {
    root: undefined,
    shadow: undefined,
    context: undefined,
    approvedTarget: undefined,
    pendingSelection: undefined,
    currentTarget: undefined,
    busy: false,
    observer: undefined,
    targetStatus: 'Looking for focused prompt box…'
  };

  mount();
  sendMessage({ kind: 'enigma.provider.detected' }).catch(() => undefined);

  function mount() {
    if (document.getElementById(ROOT_ID)) return;

    state.root = document.createElement('div');
    state.root.id = ROOT_ID;
    state.root.setAttribute('data-provider', provider.id);
    state.shadow = state.root.attachShadow({ mode: 'closed' });
    document.documentElement.appendChild(state.root);

    renderCollapsed();
    state.observer = new MutationObserver(updateTargetStatus);
    state.observer.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('focusin', handleFocusIn, true);
    updateTargetStatus();
  }

  function renderCollapsed() {
    resetShadow();
    const button = el('button', 'enigma-launch', `Enigma context for ${provider.label}`);
    button.type = 'button';
    button.addEventListener('click', renderPanel);
    state.shadow.append(styleNode(), button);
  }

  function renderPanel() {
    resetShadow();

    const panel = el('section', 'enigma-panel');
    const header = el('div', 'enigma-header');
    const title = el('strong', '', 'Enigma local memory');
    const close = el('button', 'enigma-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close Enigma panel');
    close.addEventListener('click', () => {
      state.context = undefined;
      state.approvedTarget = undefined;
      state.pendingSelection = undefined;
      renderCollapsed();
    });
    header.append(title, close);

    const body = el('div', 'enigma-body');
    body.append(
      el('p', 'enigma-copy', `Detected ${provider.label}. Enigma never injects automatically. Focus the prompt, request context, review the receipt boundary, then approve insertion.`),
      el('p', 'enigma-status', state.targetStatus)
    );

    const selectionLabel = el('label', 'enigma-check');
    const selectionCheckbox = document.createElement('input');
    selectionCheckbox.type = 'checkbox';
    selectionCheckbox.checked = false;
    selectionLabel.append(selectionCheckbox, document.createTextNode(` Include selected page text after a local-only warning showing character count and ${location.origin}`));
    body.append(selectionLabel);

    if (state.context) body.append(receiptBoundarySummary(state.context.receipt));

    const preview = el('pre', 'enigma-preview', state.context ? previewText(state.context.context.text) : 'No context requested yet.');
    body.append(preview);

    const actions = el('div', 'enigma-actions');
    const request = el('button', 'enigma-primary', state.context ? 'Refresh context' : 'Request context');
    request.type = 'button';
    request.disabled = state.busy;
    request.addEventListener('click', async () => {
      await withBusy(async () => {
        const target = findPromptTarget();
        if (!target) throw new Error(`Focus the ${provider.label} prompt box before requesting Enigma context.`);
        const approvedTarget = capturePromptTarget(target);
        if (selectionCheckbox.checked) {
          const selection = selectedPageText();
          if (!selection) throw new Error('Select page text first, then approve sending that selection to the local Enigma host.');
          state.pendingSelection = { selection, target: approvedTarget };
          renderSelectionApproval(state.pendingSelection);
          return;
        }
        state.pendingSelection = undefined;
        state.approvedTarget = approvedTarget;
        state.context = await requestContext(undefined);
        renderPanel();
      });
    });

    const insert = el('button', 'enigma-insert', 'Approve and insert');
    insert.type = 'button';
    insert.disabled = state.busy || !state.context;
    insert.addEventListener('click', async () => {
      await withBusy(async () => {
        if (!state.context) throw new Error('Request context before insertion.');
        const target = requireApprovedTarget();
        const contextPack = state.context;
        const result = insertPlainText(target.element, contextPack.context.text);
        state.context = undefined;
        state.approvedTarget = undefined;
        state.pendingSelection = undefined;
        await recordInsertion(contextPack.receipt, result);
        renderNotice('Inserted Enigma context. The receipt commitment and local record were saved by the local host.');
      });
    });

    actions.append(request, insert);
    body.append(actions);
    panel.append(header, body);
    state.shadow.append(styleNode(), panel);
  }

  function renderSelectionApproval(snapshot) {
    resetShadow();
    const panel = el('section', 'enigma-panel');
    const header = el('div', 'enigma-header');
    header.append(el('strong', '', 'Selected text warning'), closeButton());
    const summary = el(
      'p',
      'enigma-copy',
      `${snapshot.selection.charCount} selected page characters from ${snapshot.selection.origin} are selected; ${snapshot.selection.includedCharCount} characters will be sent only to the local Enigma host. No browser sync storage is used.`
    );
    const target = el('p', 'enigma-status', `Prompt target locked: ${snapshot.target.label}. If focus changes before insertion, Enigma will stop.`);
    const actions = el('div', 'enigma-actions');
    const cancel = el('button', 'enigma-primary', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => {
      state.pendingSelection = undefined;
      renderPanel();
    });
    const approve = el('button', 'enigma-insert', 'Send selected text to local host');
    approve.type = 'button';
    approve.disabled = state.busy;
    approve.addEventListener('click', async () => {
      await withBusy(async () => {
        ensureCurrentTarget(snapshot.target);
        state.approvedTarget = snapshot.target;
        state.context = await requestContext(snapshot.selection);
        state.pendingSelection = undefined;
        renderPanel();
      });
    });
    actions.append(cancel, approve);
    panel.append(header, summary, target, actions);
    state.shadow.append(styleNode(), panel);
  }

  function renderNotice(message) {
    resetShadow();
    const panel = el('section', 'enigma-panel');
    panel.append(el('div', 'enigma-header', 'Enigma local memory'), el('p', 'enigma-copy', message));
    const close = el('button', 'enigma-primary', 'Done');
    close.type = 'button';
    close.addEventListener('click', renderCollapsed);
    panel.append(close);
    state.shadow.append(styleNode(), panel);
  }

  function renderError(message) {
    resetShadow();
    const panel = el('section', 'enigma-panel');
    const header = el('div', 'enigma-header');
    header.append(el('strong', '', 'Enigma local memory'), closeButton());
    panel.append(header, el('p', 'enigma-error', message));
    const retry = el('button', 'enigma-primary', 'Back');
    retry.type = 'button';
    retry.addEventListener('click', renderPanel);
    panel.append(retry);
    state.shadow.append(styleNode(), panel);
  }

  function closeButton() {
    const close = el('button', 'enigma-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close Enigma panel');
    close.addEventListener('click', () => {
      state.context = undefined;
      state.approvedTarget = undefined;
      state.pendingSelection = undefined;
      renderCollapsed();
    });
    return close;
  }

  async function withBusy(operation) {
    if (state.busy) return;
    state.busy = true;
    try {
      await operation();
    } catch (error) {
      renderError(error instanceof Error ? error.message : 'Enigma action failed.');
    } finally {
      state.busy = false;
    }
  }

  function receiptBoundarySummary(receipt) {
    const summary = el('pre', 'enigma-preview');
    summary.textContent = [
      `Receipt ID: ${receipt.id}`,
      `Commitment: ${receipt.commitment}`,
      'Proof boundary: local receipt record only; raw memory and selected page text are forbidden in receipt, relay, witness, SIEM, and public proof artifacts.'
    ].join('\n');
    return summary;
  }

  function capturePromptTarget(target) {
    return Object.freeze({ element: target.element, label: target.label });
  }

  function requireApprovedTarget() {
    if (!state.approvedTarget) throw new Error('Request context again from the focused prompt before approving insertion.');
    return ensureCurrentTarget(state.approvedTarget);
  }

  function ensureCurrentTarget(expected) {
    const current = findPromptTarget();
    if (!current || current.element !== expected.element) {
      throw new Error('The focused prompt target changed before approval. Refocus the original prompt and request context again.');
    }
    return current;
  }

  async function requestContext(selection) {
    const response = await sendMessage({
      kind: 'enigma.context.request',
      selection,
      page: {
        origin: location.origin,
        hostname: location.hostname,
        titlePresent: document.title.length > 0,
        titleCharCount: document.title.length
      }
    });
    if (!response.payload?.context?.text || !response.payload?.receipt) throw new Error('Local host returned an incomplete context pack.');
    return response.payload;
  }

  async function recordInsertion(receipt, result) {
    await sendMessage({
      kind: 'enigma.insertion.record',
      receipt,
      insertedCharCount: result.insertedCharCount,
      mode: result.mode,
      target: result.target
    });
  }

  function sendMessage(payload) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          protocol: PROTOCOL,
          source: SOURCE,
          provider: provider.id,
          ...payload
        },
        (response) => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            reject(new Error('Unable to contact Enigma extension background.'));
            return;
          }
          if (!response?.ok) {
            reject(new Error(safeBackgroundErrorMessage(response?.error)));
            return;
          }
          resolve(response);
        }
      );
    });
  }

  function safeBackgroundErrorMessage(message) {
    if (typeof message !== 'string') return 'Enigma background rejected the request without exposing local memory.';
    const trimmed = message.trim();
    if (!trimmed || trimmed.length > 160 || looksUnsafeDisplayError(trimmed) || !isKnownSafeBackgroundError(trimmed)) {
      return 'Enigma background rejected the request without exposing local memory.';
    }
    return trimmed;
  }

  function isKnownSafeBackgroundError(message) {
    switch (message) {
      case 'Unsupported or unknown AI provider page.':
      case 'Message provider does not match the active page.':
      case 'Unsupported Enigma extension message.':
      case 'Native host rejected context request.':
      case 'Native host rejected insertion receipt.':
      case 'Unable to reach Enigma native host.':
      case 'Timed out waiting for Enigma native host.':
      case 'Native host returned an invalid Enigma context response.':
      case 'Native host returned an invalid insertion receipt acknowledgement.':
      case 'Native host response id did not match the request id.':
      case 'Native host did not return insertable context.':
      case 'Enigma native host must return a receipt object.':
      case 'Receipt contains a forbidden plaintext-like field.':
      case 'Selected page text exceeds 4000 characters.':
      case 'selection.source exceeds 80 characters.':
        return true;
      default:
        return /^(?:Native host context exceeds|Missing [A-Za-z0-9_.]+|[A-Za-z0-9_.]+ exceeds) \d+ characters\.$/.test(message) ||
          /^Missing [A-Za-z0-9_.]+\.$/.test(message);
    }
  }
  function looksUnsafeDisplayError(message) {
    return /https?:\/\/|[?&#](?:token|key|prompt|q)=|\b(selectedText|selected_text|plaintext|rawMemory|raw_memory|contextText|context_text)\b|["'](?:text|content|memory|raw|prompt|receipt)["']\s*:/i.test(message);
  }

  function updateTargetStatus() {
    const target = findPromptTarget();
    state.targetStatus = target ? `Focused prompt target ready: ${target.label}.` : `No focused ${provider.label} prompt box found. Focus the composer before requesting or inserting Enigma context.`;
  }

  function findPromptTarget() {
    const active = document.activeElement;
    if (active && active !== state.root) {
      const activeTarget = targetFromElement(active);
      if (activeTarget) {
        state.currentTarget = capturePromptTarget(activeTarget);
        return state.currentTarget;
      }
      const nestedEditable = active.closest?.('[contenteditable="true"], textarea, input');
      const nestedTarget = targetFromElement(nestedEditable);
      if (nestedTarget) {
        state.currentTarget = capturePromptTarget(nestedTarget);
        return state.currentTarget;
      }
    }
    if (state.currentTarget?.element?.isConnected && isVisible(state.currentTarget.element)) return state.currentTarget;
    return undefined;
  }

  function handleFocusIn(event) {
    const node = event.target;
    if (!(node instanceof HTMLElement) || node === state.root || node.closest(`#${ROOT_ID}`)) return;
    const directTarget = targetFromElement(node);
    const nestedTarget = directTarget || targetFromElement(node.closest?.('[contenteditable="true"], textarea, input'));
    if (nestedTarget) state.currentTarget = capturePromptTarget(nestedTarget);
    updateTargetStatus();
  }

  function targetFromElement(node) {
    if (!(node instanceof HTMLElement)) return undefined;
    if (!isVisible(node) || node.closest(`#${ROOT_ID}`)) return undefined;

    const tag = node.localName;
    if (tag === 'textarea') return { element: node, label: 'textarea' };
    if (tag === 'input') {
      const type = node.getAttribute('type') || 'text';
      if (['text', 'search'].includes(type)) return { element: node, label: 'text input' };
    }
    if (node.isContentEditable) return { element: node, label: 'contenteditable composer' };
    return undefined;
  }

  function insertPlainText(target, rawText) {
    const text = normalizeInsertionText(rawText);
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
      return insertIntoTextControl(target, text);
    }
    if (target instanceof HTMLElement && target.isContentEditable) {
      return insertIntoContentEditable(target, text);
    }
    throw new Error('Unsupported prompt target.');
  }

  function insertIntoTextControl(target, text) {
    target.focus();
    const start = Number.isInteger(target.selectionStart) ? target.selectionStart : target.value.length;
    const end = Number.isInteger(target.selectionEnd) ? target.selectionEnd : start;
    const nextValue = `${target.value.slice(0, start)}${text}${target.value.slice(end)}`;
    const prototype = target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
    if (!descriptor?.set) throw new Error('Prompt target does not support safe value insertion.');
    descriptor.set.call(target, nextValue);
    const caret = start + text.length;
    target.setSelectionRange(caret, caret);
    target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    return { insertedCharCount: text.length, mode: start === end ? 'insert-at-cursor' : 'replace-selection', target: target.localName };
  }

  function insertIntoContentEditable(target, text) {
    target.focus();
    const selection = window.getSelection();
    const selectedInTarget = selection && selection.rangeCount > 0 && target.contains(selection.anchorNode) && target.contains(selection.focusNode);
    const replacedSelection = Boolean(selectedInTarget && !selection.isCollapsed);
    let inserted = false;
    if (selectedInTarget && document.queryCommandSupported?.('insertText')) {
      inserted = document.execCommand('insertText', false, text);
    }
    if (!inserted) {
      const range = selectedInTarget ? selection.getRangeAt(0).cloneRange() : document.createRange();
      if (!selectedInTarget) {
        range.selectNodeContents(target);
        range.collapse(false);
      }
      range.deleteContents();
      const textNode = document.createTextNode(text);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    return { insertedCharCount: text.length, mode: replacedSelection ? 'replace-selection' : 'insert-at-cursor', target: 'contenteditable' };
  }

  function normalizeInsertionText(text) {
    if (typeof text !== 'string' || text.length === 0) throw new Error('No Enigma context is available to insert.');
    const normalized = text.replace(/\r\n?/g, '\n');
    if (normalized.length > MAX_INSERT_CHARS) throw new Error(`Enigma context exceeds ${MAX_INSERT_CHARS} characters.`);
    return normalized.endsWith('\n') ? normalized : `${normalized}\n`;
  }

  function selectedPageText() {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (!text) return undefined;
    if (text.length > 4000) throw new Error('Selected page text exceeds 4000 characters. Select a smaller passage before local transfer.');
    return {
      text,
      source: 'window-selection',
      origin: location.origin,
      charCount: text.length,
      includedCharCount: text.length
    };
  }

  function detectProvider(url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return undefined;
    }
    if (parsed.protocol !== 'https:') return undefined;
    const hostname = parsed.hostname.toLowerCase();
    return Object.values(PROVIDERS).find((candidate) => candidate.hosts.includes(hostname));
  }

  function isVisible(node) {
    const rect = node.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) return false;
    const style = window.getComputedStyle(node);
    return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) !== 0;
  }

  function previewText(text) {
    const normalized = normalizeInsertionText(text);
    if (normalized.length <= 1200) return normalized;
    return `${normalized.slice(0, 1200)}\n… ${normalized.length - 1200} more characters available for insertion.`;
  }

  function resetShadow() {
    while (state.shadow.firstChild) state.shadow.firstChild.remove();
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function styleNode() {
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; color-scheme: light dark; }
      .enigma-launch {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 2147483647;
        border: 1px solid rgba(120, 120, 120, 0.35);
        border-radius: 999px;
        padding: 10px 14px;
        background: #111827;
        color: #ffffff;
        font: 600 13px/1.2 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
        cursor: pointer;
      }
      .enigma-panel {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 2147483647;
        width: min(420px, calc(100vw - 36px));
        border: 1px solid rgba(120, 120, 120, 0.35);
        border-radius: 18px;
        padding: 16px;
        background: Canvas;
        color: CanvasText;
        font: 14px/1.45 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        box-shadow: 0 24px 70px rgba(0, 0, 0, 0.32);
      }
      .enigma-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
      .enigma-close { border: 0; border-radius: 999px; width: 28px; height: 28px; background: color-mix(in srgb, CanvasText 10%, transparent); color: CanvasText; cursor: pointer; font-size: 18px; line-height: 1; }
      .enigma-body { display: grid; gap: 12px; }
      .enigma-copy, .enigma-status, .enigma-error { margin: 0; }
      .enigma-status { color: color-mix(in srgb, CanvasText 72%, transparent); }
      .enigma-error { color: #b42318; }
      .enigma-check { display: flex; align-items: flex-start; gap: 8px; user-select: none; }
      .enigma-preview {
        max-height: 220px;
        overflow: auto;
        margin: 0;
        padding: 12px;
        border-radius: 12px;
        background: color-mix(in srgb, CanvasText 7%, transparent);
        white-space: pre-wrap;
        word-break: break-word;
        font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      }
      .enigma-actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
      .enigma-primary, .enigma-insert {
        border: 1px solid rgba(120, 120, 120, 0.35);
        border-radius: 10px;
        padding: 9px 12px;
        font: 600 13px/1 ui-sans-serif, system-ui, sans-serif;
        cursor: pointer;
      }
      .enigma-primary { background: Canvas; color: CanvasText; }
      .enigma-insert { background: #111827; color: #ffffff; }
      button:disabled { cursor: not-allowed; opacity: 0.55; }
    `;
    return style;
  }
})();
