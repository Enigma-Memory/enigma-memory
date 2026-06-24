const NATIVE_HOST = 'com.enigma.native_host';
const PROTOCOL = 'enigma.native.browser.v1';
const REQUEST_TIMEOUT_MS = 30000;
const MAX_CONTEXT_CHARS = 32000;
const SAFE_NATIVE_ERROR_CODE = /^[A-Z][A-Z0-9_]{0,31}$/;

export const SUPPORTED_PROVIDERS = Object.freeze({
  chatgpt: Object.freeze({ id: 'chatgpt', label: 'ChatGPT', hosts: Object.freeze(['chatgpt.com', 'chat.openai.com']) }),
  claude: Object.freeze({ id: 'claude', label: 'Claude', hosts: Object.freeze(['claude.ai']) }),
  kimi: Object.freeze({ id: 'kimi', label: 'Kimi', hosts: Object.freeze(['kimi.com', 'www.kimi.com', 'kimi.moonshot.cn']) }),
  perplexity: Object.freeze({ id: 'perplexity', label: 'Perplexity', hosts: Object.freeze(['perplexity.ai', 'www.perplexity.ai']) })
});

const RECEIPT_RAW_FIELD_NAMES = new Set([
  'memory',
  'memories',
  'plaintext',
  'plainText',
  'raw',
  'rawMemory',
  'rawMemories',
  'context',
  'contextText',
  'text',
  'content',
  'prompt'
]);

export function detectProviderFromUrl(url) {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    return undefined;
  }

  if (parsed.protocol !== 'https:') return undefined;
  const hostname = parsed.hostname.toLowerCase();
  for (const provider of Object.values(SUPPORTED_PROVIDERS)) {
    if (provider.hosts.includes(hostname)) return provider;
  }
  return undefined;
}

export async function requestContextPack(input) {
  const provider = requireSupportedProvider(input?.url, input?.providerId);
  const response = await sendNativeMessage({
    protocol: PROTOCOL,
    id: requestId(),
    type: 'enigma.browser.context.request',
    provider: provider.id,
    page: sanitizePage(input, provider),
    selection: sanitizeSelection(input?.selection),
    requirements: {
      custody: 'local-only',
      approval: 'user-click',
      receipt: 'required',
      receiptPlaintext: 'forbidden',
      providerNativeMemory: 'cache-only',
      storage: 'transient-extension-memory'
    }
  });

  return validateContextResponse(response);
}

export async function recordInsertionReceipt(input) {
  const provider = requireSupportedProvider(input?.url, input?.providerId);
  const receipt = sanitizeReceipt(input?.receipt);
  const response = await sendNativeMessage({
    protocol: PROTOCOL,
    id: requestId(),
    type: 'enigma.browser.insertion.record',
    provider: provider.id,
    page: sanitizePage(input, provider),
    insertion: {
      mode: input?.mode === 'replace-selection' ? 'replace-selection' : 'insert-at-cursor',
      target: typeof input?.target === 'string' ? input.target.slice(0, 80) : 'prompt',
      insertedCharCount: nonNegativeInteger(input?.insertedCharCount),
      insertedAt: requireString(input?.insertedAt, 'insertion.insertedAt', 80),
      receipt
    },
    requirements: {
      plaintextInRecord: 'forbidden',
      receiptPlaintext: 'forbidden'
    }
  });

  if (!response || response.protocol !== PROTOCOL || response.type !== 'enigma.browser.insertion.recorded') {
    throw new Error('Native host returned an invalid insertion receipt acknowledgement.');
  }
  if (response.ok !== true) {
    throw new Error(nativeHostErrorMessage('Native host rejected insertion receipt.', response));
  }
  return Object.freeze({ ok: true, receipt });
}

export function serializeError(error) {
  if (error instanceof Error) return { message: sanitizeSerializableErrorMessage(error.message) };
  return { message: 'Unexpected Enigma bridge error.' };
}

function requireSupportedProvider(url, expectedProviderId) {
  const provider = detectProviderFromUrl(url);
  if (!provider) throw new Error('Unsupported or unknown AI provider page.');
  if (expectedProviderId !== undefined && expectedProviderId !== provider.id) {
    throw new Error('Provider mismatch for active tab URL.');
  }
  return provider;
}

function sanitizePage(input, provider) {
  const parsed = new URL(String(input?.url ?? ''));
  return Object.freeze({
    providerId: provider.id,
    origin: parsed.origin,
    hostname: parsed.hostname.toLowerCase(),
    display: Object.freeze({
      providerLabel: provider.label,
      hostLabel: parsed.hostname.toLowerCase(),
      titlePresent: typeof input?.title === 'string' && input.title.length > 0,
      titleCharCount: typeof input?.title === 'string' ? input.title.length : 0
    }),
    topLevel: input?.topLevel !== false
  });
}

function sanitizeSelection(selection) {
  if (!selection || typeof selection !== 'object') return undefined;
  const text = typeof selection.text === 'string' ? selection.text : '';
  if (text.length === 0) return undefined;
  if (text.length > 4000) throw new Error('Selected page text exceeds 4000 characters.');
  const source = typeof selection.source === 'string' && selection.source.length > 0 ? selection.source : 'user-selection';
  if (source.length > 80) throw new Error('selection.source exceeds 80 characters.');
  return Object.freeze({
    text,
    source
  });
}

function validateContextResponse(response) {
  if (!response || response.protocol !== PROTOCOL || response.type !== 'enigma.browser.context.response') {
    throw new Error('Native host returned an invalid Enigma context response.');
  }
  if (response.ok !== true) {
    throw new Error(nativeHostErrorMessage('Native host rejected context request.', response));
  }

  const text = response.context?.text;
  if (typeof text !== 'string' || text.length === 0) {
    throw new Error('Native host did not return insertable context.');
  }
  if (text.length > MAX_CONTEXT_CHARS) {
    throw new Error(`Native host context exceeds ${MAX_CONTEXT_CHARS} characters.`);
  }

  const receipt = sanitizeReceipt(response.receipt);
  return Object.freeze({
    ok: true,
    context: Object.freeze({
      text,
      mime: response.context?.mime === 'text/markdown' ? 'text/markdown' : 'text/plain',
      charCount: text.length
    }),
    receipt
  });
}

function sanitizeReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    throw new Error('Enigma native host must return a receipt object.');
  }
  if (containsRawReceiptField(receipt)) {
    throw new Error('Receipt contains a forbidden plaintext-like field.');
  }

  const id = requireString(receipt.id, 'receipt.id', 160);
  const commitment = requireString(receipt.commitment ?? receipt.digest, 'receipt.commitment', 256);
  const digestAlgorithm = requireString(receipt.digestAlgorithm, 'receipt.digestAlgorithm', 80);
  const createdAt = requireString(receipt.createdAt, 'receipt.createdAt', 80);

  return Object.freeze({ id, commitment, digestAlgorithm, createdAt });
}

function containsRawReceiptField(value, depth = 0) {
  if (depth > 12 || value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((item) => containsRawReceiptField(item, depth + 1));
  for (const [key, child] of Object.entries(value)) {
    if (RECEIPT_RAW_FIELD_NAMES.has(key)) return true;
    if (containsRawReceiptField(child, depth + 1)) return true;
  }
  return false;
}

function requireString(value, name, maxLength) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing ${name}.`);
  if (value.length > maxLength) throw new Error(`${name} exceeds ${maxLength} characters.`);
  return value;
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function requestId() {
  const random = new Uint8Array(16);
  crypto.getRandomValues(random);
  return Array.from(random, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sendNativeMessage(message) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('Timed out waiting for Enigma native host.'));
    }, REQUEST_TIMEOUT_MS);

    chrome.runtime.sendNativeMessage(NATIVE_HOST, message, (response) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);

      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(nativeHostErrorMessage('Unable to reach Enigma native host.', lastError)));
        return;
      }
      if (response && response.id !== message.id) {
        reject(new Error('Native host response id did not match the request id.'));
        return;
      }
      resolve(response);
    });
  });
}

function nativeHostErrorMessage(fallback, detail) {
  const code = safeNativeErrorCode(detail);
  return code ? `${fallback} (${code})` : fallback;
}

function safeNativeErrorCode(detail) {
  if (!detail || typeof detail !== 'object') return undefined;
  const code = detail.code ?? detail.errorCode;
  if (typeof code !== 'string') return undefined;
  const trimmed = code.trim();
  return SAFE_NATIVE_ERROR_CODE.test(trimmed) ? trimmed : undefined;
}

function sanitizeSerializableErrorMessage(message) {
  if (typeof message !== 'string') return 'Unexpected Enigma bridge error.';
  const trimmed = message.trim();
  if (!trimmed) return 'Unexpected Enigma bridge error.';
  if (trimmed.length > 240 || looksLikeSensitiveErrorText(trimmed) || !isKnownSafeErrorMessage(trimmed)) {
    return 'Enigma action failed without exposing local memory.';
  }
  return trimmed;
}

function isKnownSafeErrorMessage(message) {
  switch (message) {
    case 'Unsupported or unknown AI provider page.':
    case 'Provider mismatch for active tab URL.':
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

function looksLikeSensitiveErrorText(text) {
  return /https?:\/\/|[?&#](?:token|key|prompt|q)=|\b(selectedText|selected_text|plaintext|rawMemory|raw_memory|contextText|context_text)\b|["'](?:text|content|memory|raw|prompt|receipt)["']\s*:/i.test(text);
}
