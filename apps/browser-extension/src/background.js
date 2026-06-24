import {
  detectProviderFromUrl,
  recordInsertionReceipt,
  requestContextPack,
  serializeError
} from './native-bridge.js';

const MESSAGE_SOURCE = 'enigma-browser-extension';
const CONTENT_SOURCE = 'enigma-content-script';

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeText({ text: '' });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  const provider = detectProviderFromUrl(tab.url);
  chrome.action.setBadgeText({ tabId, text: provider ? 'E' : '' });
  chrome.action.setTitle({ tabId, title: provider ? `Enigma local memory for ${provider.label}` : 'Enigma local memory' });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isContentMessage(message)) return false;

  handleContentMessage(message, sender)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => {
      const safeError = serializeError(error);
      sendResponse({ ok: false, error: safeError.message });
    });

  return true;
});

async function handleContentMessage(message, sender) {
  const tabUrl = sender.tab?.url || message.page?.url;
  const provider = detectProviderFromUrl(tabUrl);
  if (!provider) throw new Error('Unsupported or unknown AI provider page.');
  if (message.provider !== provider.id) throw new Error('Message provider does not match the active page.');

  if (message.kind === 'enigma.context.request') {
    return {
      kind: 'enigma.context.response',
      provider: provider.id,
      payload: await requestContextPack({
        providerId: provider.id,
        url: tabUrl,
        title: sender.tab?.title || message.page?.title || '',
        topLevel: sender.frameId === 0,
        selection: message.selection
      })
    };
  }

  if (message.kind === 'enigma.insertion.record') {
    return {
      kind: 'enigma.insertion.recorded',
      provider: provider.id,
      payload: await recordInsertionReceipt({
        providerId: provider.id,
        url: tabUrl,
        title: sender.tab?.title || message.page?.title || '',
        topLevel: sender.frameId === 0,
        receipt: message.receipt,
        insertedCharCount: message.insertedCharCount,
        mode: message.mode,
        target: message.target,
        insertedAt: new Date().toISOString()
      })
    };
  }

  if (message.kind === 'enigma.provider.detected') {
    return { kind: 'enigma.provider.ack', provider: provider.id };
  }

  throw new Error('Unsupported Enigma extension message.');
}

function isContentMessage(message) {
  return Boolean(
    message &&
      typeof message === 'object' &&
      message.source === CONTENT_SOURCE &&
      message.protocol === MESSAGE_SOURCE &&
      typeof message.kind === 'string'
  );
}
