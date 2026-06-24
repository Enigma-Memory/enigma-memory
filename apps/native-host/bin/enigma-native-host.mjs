#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, posix, win32 } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalize, receiptHash, sha256Hex } from '../../../packages/core/src/index.js';
import { compileContextPack } from '../../../packages/passport/src/index.js';
import { exportBundle, importBundle } from '../../../packages/vault/src/index.js';

export const NATIVE_HOST_NAME = 'com.enigma.native_host';
export const NATIVE_BROWSER_PROTOCOL = 'enigma.native.browser.v1';
export const MAX_NATIVE_MESSAGE_BYTES = 1024 * 1024;

const CONTEXT_REQUEST = 'enigma.browser.context.request';
const CONTEXT_RESPONSE = 'enigma.browser.context.response';
const INSERTION_RECORD = 'enigma.browser.insertion.record';
const INSERTION_RECORDED = 'enigma.browser.insertion.recorded';
const GENERIC_ERROR = 'enigma.native.error';
const SHA256_ROOT_RE = /^sha256:[a-f0-9]{64}$/;
const SUPPORTED_PROVIDER_IDS = new Set(['chatgpt', 'claude', 'kimi', 'perplexity']);
const SAFE_MESSAGE_ID_RE = /^[A-Za-z0-9._:-]{1,80}$/;
const SUPPORTED_MANIFEST_BROWSERS = new Set(['chrome', 'edge', 'firefox']);
const CHROMIUM_EXTENSION_ID_RE = /^[A-Za-z0-9.-]{1,128}$/;
const FIREFOX_EXTENSION_ID_RE = /^[A-Za-z0-9._@{}-]{1,128}$/;

export function encodeNativeMessage(message) {
  const payload = Buffer.from(JSON.stringify(message), 'utf8');
  if (payload.length > 0xffffffff) throw new RangeError('Native message is too large.');
  const frame = Buffer.allocUnsafe(4 + payload.length);
  frame.writeUInt32LE(payload.length, 0);
  payload.copy(frame, 4);
  return frame;
}

export function createNativeHostManifest({ browser, hostPath, extensionId } = {}) {
  const normalizedBrowser = String(browser ?? '').toLowerCase();
  if (!SUPPORTED_MANIFEST_BROWSERS.has(normalizedBrowser)) {
    throw new Error('Native host manifest browser must be one of: chrome, edge, firefox.');
  }
  if (typeof hostPath !== 'string' || hostPath.length === 0 || !isNativeHostAbsolutePath(hostPath)) {
    throw new Error('Native host manifest hostPath must be an absolute path.');
  }
  if (typeof extensionId !== 'string' || extensionId.length === 0) {
    throw new Error('Native host manifest extensionId is required.');
  }
  if ((normalizedBrowser === 'chrome' || normalizedBrowser === 'edge') && !CHROMIUM_EXTENSION_ID_RE.test(extensionId)) {
    throw new Error('Chrome and Edge native host manifests require an extension id with only letters, numbers, dots, or hyphens.');
  }
  if (normalizedBrowser === 'firefox' && !FIREFOX_EXTENSION_ID_RE.test(extensionId)) {
    throw new Error('Firefox native host manifest extension id contains unsupported characters.');
  }

  const manifest = {
    name: NATIVE_HOST_NAME,
    description: 'Enigma local native messaging host for explicit browser context requests.',
    path: hostPath,
    type: 'stdio',
  };
  if (normalizedBrowser === 'firefox') {
    manifest.allowed_extensions = [extensionId];
  } else {
    manifest.allowed_origins = [`chrome-extension://${extensionId}/`];
  }
  return manifest;
}

const SUPPORTED_INSTALL_OSES = new Set(['windows', 'macos', 'linux']);

export function createNativeHostInstallPlan({ browser, manifestPath, os, homeDir } = {}) {
  const normalizedBrowser = String(browser ?? '').toLowerCase();
  if (!SUPPORTED_MANIFEST_BROWSERS.has(normalizedBrowser)) {
    throw new Error('Native host install plan browser must be one of: chrome, edge, firefox.');
  }
  const normalizedOs = String(os ?? '').toLowerCase();
  if (!SUPPORTED_INSTALL_OSES.has(normalizedOs)) {
    throw new Error('Native host install plan os must be one of: windows, macos, linux.');
  }
  if (typeof manifestPath !== 'string' || manifestPath.length === 0 || !isNativeHostAbsolutePath(manifestPath)) {
    throw new Error('Native host install plan manifestPath must be an absolute path.');
  }
  if (typeof homeDir !== 'string' || homeDir.length === 0 || !isNativeHostAbsolutePath(homeDir)) {
    throw new Error('Native host install plan homeDir must be an absolute path.');
  }

  const manifestDirectory = nativeHostManifestDirectory({ browser: normalizedBrowser, os: normalizedOs, homeDir });
  const targetManifestPath = joinNativeHostPath(normalizedOs, manifestDirectory, `${NATIVE_HOST_NAME}.json`);
  const registryCommandPreview = windowsRegistryCommandPreview(normalizedBrowser, normalizedOs, targetManifestPath);
  return {
    host_name: NATIVE_HOST_NAME,
    browser: normalizedBrowser,
    os: normalizedOs,
    manifest_source: manifestPath,
    target_manifest_paths: [targetManifestPath],
    manual_steps: nativeHostInstallManualSteps({
      browser: normalizedBrowser,
      os: normalizedOs,
      manifestPath,
      targetManifestPath,
      registryCommandPreview,
    }),
    registry_command_preview: registryCommandPreview,
    firefox_manifest_directory: normalizedBrowser === 'firefox' ? manifestDirectory : null,
    writes_performed: false,
  };
}

function nativeHostManifestDirectory({ browser, os, homeDir }) {
  if (os === 'windows') {
    if (browser === 'firefox') return win32.join(homeDir, 'AppData', 'Roaming', 'Mozilla', 'NativeMessagingHosts');
    if (browser === 'edge') return win32.join(homeDir, 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data', 'NativeMessagingHosts');
    return win32.join(homeDir, 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'NativeMessagingHosts');
  }
  if (os === 'macos') {
    if (browser === 'firefox') return posix.join(homeDir, 'Library', 'Application Support', 'Mozilla', 'NativeMessagingHosts');
    if (browser === 'edge') return posix.join(homeDir, 'Library', 'Application Support', 'Microsoft Edge', 'NativeMessagingHosts');
    return posix.join(homeDir, 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts');
  }
  if (browser === 'firefox') return posix.join(homeDir, '.mozilla', 'native-messaging-hosts');
  if (browser === 'edge') return posix.join(homeDir, '.config', 'microsoft-edge', 'NativeMessagingHosts');
  return posix.join(homeDir, '.config', 'google-chrome', 'NativeMessagingHosts');
}

function joinNativeHostPath(os, directory, fileName) {
  return os === 'windows' ? win32.join(directory, fileName) : posix.join(directory, fileName);
}

function windowsRegistryCommandPreview(browser, os, targetManifestPath) {
  if (os !== 'windows' || browser === 'firefox') return [];
  const vendor = browser === 'edge' ? 'Microsoft\\Edge' : 'Google\\Chrome';
  return [
    `reg add "HKCU\\Software\\${vendor}\\NativeMessagingHosts\\${NATIVE_HOST_NAME}" /ve /t REG_SZ /d "${targetManifestPath}" /f`,
  ];
}

function nativeHostInstallManualSteps({ browser, os, manifestPath, targetManifestPath, registryCommandPreview }) {
  const steps = [
    `Review the generated native messaging manifest at ${manifestPath}.`,
    `Copy the manifest to ${targetManifestPath}.`,
  ];
  if (registryCommandPreview.length > 0) {
    steps.push(`Review and run this registry command manually for ${browser}: ${registryCommandPreview[0]}`);
  }
  steps.push(`Restart ${browser} after the manifest is in place.`);
  steps.push(`This planner is non-mutating on ${os}; it does not write files, registry keys, or browser profiles.`);
  return steps;
}

function isNativeHostAbsolutePath(hostPath) {
  return isAbsolute(hostPath) || win32.isAbsolute(hostPath);
}

export function decodeNativeMessage(frame, options = {}) {
  const buffer = Buffer.isBuffer(frame) ? frame : Buffer.from(frame);
  if (buffer.length < 4) throw new Error('Native message frame is missing a length prefix.');
  const length = buffer.readUInt32LE(0);
  const maxBytes = options.maxBytes ?? MAX_NATIVE_MESSAGE_BYTES;
  if (length > maxBytes) throw new Error('Native message frame exceeds the configured maximum size.');
  if (buffer.length !== 4 + length) throw new Error('Native message frame length does not match its payload.');
  return JSON.parse(buffer.subarray(4).toString('utf8'));
}

export function decodeNativeMessageFrames(input, options = {}) {
  let buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const messages = [];
  const maxBytes = options.maxBytes ?? MAX_NATIVE_MESSAGE_BYTES;
  while (buffer.length >= 4) {
    const length = buffer.readUInt32LE(0);
    if (length > maxBytes) throw new Error('Native message frame exceeds the configured maximum size.');
    if (buffer.length < 4 + length) break;
    messages.push(JSON.parse(buffer.subarray(4, 4 + length).toString('utf8')));
    buffer = buffer.subarray(4 + length);
  }
  return { messages, remaining: buffer };
}

export async function handleNativeBrowserMessage(message, options = {}) {
  const id = safeMessageId(message?.id);
  const responseType = responseTypeFor(message?.type);
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return safeError({ id, type: responseType, code: 'ENIGMA_BAD_REQUEST', message: 'Native host received an invalid browser request.' });
  }
  if (message.protocol !== NATIVE_BROWSER_PROTOCOL) {
    return safeError({ id, type: responseType, code: 'ENIGMA_BAD_PROTOCOL', message: 'Native host received an unsupported protocol.' });
  }

  try {
    if (message.type === CONTEXT_REQUEST) return await handleContextRequest(message, options);
    if (message.type === INSERTION_RECORD) return await handleInsertionRecord(message, options);
    return safeError({ id, type: responseType, code: 'ENIGMA_UNSUPPORTED_REQUEST', message: 'Native host received an unsupported request type.' });
  } catch {
    return safeError({ id, type: responseType, code: 'ENIGMA_NATIVE_HOST_ERROR', message: 'Enigma native host failed without exposing local memory.' });
  }
}

export function createNativeHostRuntime(options = {}) {
  const stdin = options.stdin ?? process.stdin;
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  let pending = Buffer.alloc(0);
  let queue = Promise.resolve();
  let started = false;

  const runtimeOptions = {
    ...options,
    argv: options.argv ?? process.argv.slice(2),
    env: options.env ?? process.env,
  };

  async function handleChunk(chunk) {
    pending = pending.length === 0 ? Buffer.from(chunk) : Buffer.concat([pending, Buffer.from(chunk)]);
    let decoded;
    try {
      decoded = decodeNativeMessageFrames(pending, { maxBytes: options.maxBytes ?? MAX_NATIVE_MESSAGE_BYTES });
    } catch {
      pending = Buffer.alloc(0);
      stdout.write(encodeNativeMessage(safeError({ type: GENERIC_ERROR, code: 'ENIGMA_BAD_FRAME', message: 'Native host received an invalid message frame.' })));
      return;
    }
    pending = decoded.remaining;
    for (const message of decoded.messages) {
      const response = await handleNativeBrowserMessage(message, runtimeOptions);
      stdout.write(encodeNativeMessage(response));
    }
  }

  function onData(chunk) {
    queue = queue.then(() => handleChunk(chunk)).catch(() => {
      stdout.write(encodeNativeMessage(safeError({ type: GENERIC_ERROR, code: 'ENIGMA_NATIVE_HOST_ERROR', message: 'Enigma native host failed without exposing local memory.' })));
    });
  }

  function onError() {
    stderr.write('enigma-native-host stdin error\n');
  }

  return {
    handleChunk,
    start() {
      if (started) return this;
      started = true;
      stdin.on('data', onData);
      stdin.on('error', onError);
      return this;
    },
    async stop() {
      if (!started) return;
      started = false;
      stdin.off('data', onData);
      stdin.off('error', onError);
      await queue;
    },
  };
}

function nativeHostUsage() {
  return {
    manifest_generator: 'enigma native-host manifest --browser <chrome|edge|firefox> --host-path <absolute path> --extension-id <id> [--out <file>]',
    install_planner: 'enigma native-host install-plan --browser <chrome|edge|firefox> --manifest <absolute path> [--os <windows|macos|linux>] [--home <absolute path>]',
    usage: 'enigma-native-host [--bundle <path>]',
    native_host: NATIVE_HOST_NAME,
    protocol: NATIVE_BROWSER_PROTOCOL,
    transport: 'Chrome/Edge/Firefox native messaging: 4-byte little-endian length-prefixed JSON over stdio.',
    options: {
      '--bundle <path>': 'Local Enigma bundle path. Defaults to ENIGMA_BUNDLE.',
      '--help': 'Print this JSON help and exit without starting the native messaging loop.',
    },
    claim_boundaries: 'The native host reads local Enigma bundles and returns user-approved context plus receipt summaries. It does not prove provider deletion, model forgetting, or provider-side memory behavior.',
  };
}

function isHelpArgv(argv) {
  return Array.isArray(argv) && (argv.includes('--help') || argv.includes('-h'));
}

function printJson(value, stdout) {
  stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export async function main(argv = process.argv.slice(2), io = { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr, env: process.env }) {
  if (isHelpArgv(argv)) {
    printJson(nativeHostUsage(), io.stdout);
    return 0;
  }
  createNativeHostRuntime({ stdin: io.stdin, stdout: io.stdout, stderr: io.stderr, env: io.env, argv }).start();
  return 0;
}

async function handleContextRequest(message, options) {
  const id = safeMessageId(message.id);
  const loaded = await loadVault(options);
  if (!loaded.ok) return safeError({ id, type: CONTEXT_RESPONSE, ...loaded.error });

  const activeAddresses = [...(loaded.vault.activeAddresses ?? [])];
  if (activeAddresses.length === 0) {
    return safeError({
      id,
      type: CONTEXT_RESPONSE,
      code: 'ENIGMA_NO_ACTIVE_MEMORIES',
      message: 'Add local Enigma memories before requesting browser context.',
      action: 'Run enigma remember, then retry from the browser extension.',
    });
  }

  const contextPack = compileContextPack({
    vault: loaded.vault,
    provider: safeProvider(message.provider),
    purpose: 'browser_context_injection',
    limit: options.limit ?? options.maxMemories ?? 12,
    now: options.now,
  });
  const text = renderContextText(contextPack);
  if (text.length === 0) {
    return safeError({
      id,
      type: CONTEXT_RESPONSE,
      code: 'ENIGMA_NO_CONTEXT_TEXT',
      message: 'No insertable Enigma context is available.',
    });
  }

  await persistVault(loaded, options);
  return {
    id,
    protocol: NATIVE_BROWSER_PROTOCOL,
    type: CONTEXT_RESPONSE,
    ok: true,
    context: {
      text,
      mime: 'text/plain',
      charCount: text.length,
    },
    receipt: summarizeReceipt(contextPack.injection_receipts.at(-1) ?? contextPack.receipts.at(-1), contextPack.receipt_log_root),
  };
}

async function handleInsertionRecord(message, options) {
  const id = safeMessageId(message.id);
  const loaded = await loadVault(options);
  if (!loaded.ok) return safeError({ id, type: INSERTION_RECORDED, ...loaded.error });

  const insertion = message.insertion && typeof message.insertion === 'object' && !Array.isArray(message.insertion) ? message.insertion : {};
  const sourceReceipt = summarizeBrowserReceiptForMetadata(insertion.receipt);
  const event = loaded.vault.__recordEvent({
    operation: 'browser_insert_ack',
    provider: safeProvider(message.provider),
    purpose: 'browser_context_insertion_record',
    now: options.now,
    metadata: {
      browser_receipt_commitment: sourceReceipt.commitmentDigest,
      browser_receipt_id_commitment: sourceReceipt.idDigest,
      inserted_char_count: safeCount(insertion.insertedCharCount),
      insertion_mode: insertion.mode === 'replace-selection' ? 'replace-selection' : 'insert-at-cursor',
      insertion_target_commitment: `sha256:${sha256Hex(String(insertion.target ?? 'prompt'))}`,
      inserted_at_commitment: `sha256:${sha256Hex(String(insertion.insertedAt ?? ''))}`,
    },
  });
  const roots = loaded.vault.__computeRoots();
  await persistVault(loaded, options);
  return {
    id,
    protocol: NATIVE_BROWSER_PROTOCOL,
    type: INSERTION_RECORDED,
    ok: true,
    receipt: summarizeReceipt(event.receipt, roots.receipt_log_root),
  };
}

async function loadVault(options) {
  if (options.vault) return { ok: true, vault: options.vault, bundlePath: options.bundlePath, source: 'options.vault' };
  if (options.bundle) {
    try {
      return { ok: true, ...importBundle({ bundle: options.bundle }), bundlePath: options.bundlePath, source: 'options.bundle' };
    } catch {
      return { ok: false, error: invalidBundleError() };
    }
  }

  const bundlePath = bundlePathFromOptions(options);
  if (!bundlePath) {
    return {
      ok: false,
      error: {
        code: 'ENIGMA_BUNDLE_REQUIRED',
        message: 'Set ENIGMA_BUNDLE or pass --bundle to enigma-native-host.',
        action: 'Create a local bundle with enigma init or enigma export, then set ENIGMA_BUNDLE.',
      },
    };
  }

  try {
    const bundle = JSON.parse(await readFile(bundlePath, 'utf8'));
    return { ok: true, ...importBundle({ bundle }), bundlePath, source: 'bundlePath' };
  } catch {
    return { ok: false, error: invalidBundleError() };
  }
}

async function persistVault(loaded, options) {
  if (options.persist === false || !loaded.bundlePath || !loaded.vault) return;
  const bundle = exportBundle({ vault: loaded.vault, now: options.now });
  await writeFile(loaded.bundlePath, `${JSON.stringify(bundle, null, 2)}\n`);
}

function invalidBundleError() {
  return {
    code: 'ENIGMA_BUNDLE_INVALID',
    message: 'Enigma native host could not load the local bundle.',
    action: 'Check that ENIGMA_BUNDLE points to an enigma.vault_bundle.v1 JSON file.',
  };
}

function bundlePathFromOptions(options) {
  if (typeof options.bundlePath === 'string' && options.bundlePath.length > 0) return options.bundlePath;
  const argv = Array.isArray(options.argv) ? options.argv : [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--bundle' && typeof argv[index + 1] === 'string' && argv[index + 1].length > 0) return argv[index + 1];
    if (argv[index]?.startsWith('--bundle=')) return argv[index].slice('--bundle='.length);
  }
  const env = options.env && typeof options.env === 'object' ? options.env : {};
  return typeof env.ENIGMA_BUNDLE === 'string' && env.ENIGMA_BUNDLE.length > 0 ? env.ENIGMA_BUNDLE : undefined;
}

function renderContextText(contextPack) {
  return contextPack.memories
    .map((memory, index) => {
      const content = typeof memory.content === 'string' ? memory.content.trim() : '';
      return content.length > 0 ? `Enigma memory ${index + 1}: ${content}` : '';
    })
    .filter(Boolean)
    .join('\n');
}

function summarizeReceipt(receipt, rootCommitment) {
  const commitment = SHA256_ROOT_RE.test(rootCommitment ?? '') ? rootCommitment : receiptHash(receipt);
  return {
    id: String(receipt?.receipt_id ?? receipt?.id ?? receiptHash(receipt)),
    commitment,
    digestAlgorithm: 'sha256',
    createdAt: String(receipt?.timestamp ?? receipt?.createdAt ?? new Date(0).toISOString()),
  };
}

function summarizeBrowserReceiptForMetadata(receipt) {
  const safeReceipt = receipt && typeof receipt === 'object' && !Array.isArray(receipt)
    ? {
        id: typeof receipt.id === 'string' ? receipt.id : '',
        commitment: typeof (receipt.commitment ?? receipt.digest) === 'string' ? (receipt.commitment ?? receipt.digest) : '',
        digestAlgorithm: typeof receipt.digestAlgorithm === 'string' ? receipt.digestAlgorithm : '',
        createdAt: typeof receipt.createdAt === 'string' ? receipt.createdAt : '',
      }
    : {};
  return {
    idDigest: `sha256:${sha256Hex(String(safeReceipt.id ?? ''))}`,
    commitmentDigest: `sha256:${sha256Hex(canonicalize(safeReceipt))}`,
  };
}

function responseTypeFor(type) {
  if (type === CONTEXT_REQUEST) return CONTEXT_RESPONSE;
  if (type === INSERTION_RECORD) return INSERTION_RECORDED;
  return GENERIC_ERROR;
}

function safeError({ id, type, code, message, action }) {
  return {
    id,
    protocol: NATIVE_BROWSER_PROTOCOL,
    type,
    ok: false,
    code,
    message,
    ...(action ? { action } : {}),
  };
}

function safeMessageId(id) {
  return typeof id === 'string' && SAFE_MESSAGE_ID_RE.test(id) ? id : undefined;
}

function safeProvider(provider) {
  return typeof provider === 'string' && SUPPORTED_PROVIDER_IDS.has(provider) ? provider : 'browser';
}

function safeCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
function isMainModule(metaUrl) {
  if (!process.argv[1]) return false;
  try {
    return metaUrl === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return metaUrl === pathToFileURL(process.argv[1]).href;
  }
}


if (isMainModule(import.meta.url)) {
  await main();
}
