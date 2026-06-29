#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';
import { constants as fsConstants, realpathSync } from 'node:fs';
import { access, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createVault, remember, recall, updateMemory, deleteMemory, exportBundle, decryptKeyring, KEYRING_ENCRYPTED_TYPE } from '../../../packages/vault/src/index.js';
import { createPassport, compileContextPack, createContextPassport, createProofOfNonUse, createMemoryDriveHealthReport } from '../../../packages/passport/src/index.js';
import { runBoundarySimulation } from '../../../packages/boundary/src/index.js';
import { assertMemoryControllerPublicSafe, closePrivateMemoryBubble, createConsentGrant, createMemoryWeatherReport, createPrivateMemoryBubble, createRecallVetoDecision } from '../../../packages/controller/src/index.js';
import { startStdioServer } from '../../../packages/mcp-server/src/index.js';
import { runMeshDemo } from '../../../packages/mesh/src/index.js';
import { runEnterpriseDemo } from '../../../packages/enterprise/src/index.js';
import { connectClient, disconnectClient, doctorConnectors, getClientProfile, planConnectWizard, renderMcpConfig, supportedClients } from '../../../packages/connectors/src/index.js';
import { createImportBatchReceipt, createImportPreview, exportEnigmaCapsule, importChatGptExport, importClaudeMemory, importEnigmaCapsule, importLangGraphStore, importLettaAgentFile, importMem0Export, importTextMemoryList, importZepGraphitiExport } from '../../../packages/importers/src/index.js';
import * as relayServer from '../../relay/src/server.mjs';
import * as gatewayServer from '../../gateway/src/server.mjs';
import { verifyBundle } from '../../verifier/bin/enigma-verify.mjs';
import { createNativeHostInstallPlan, createNativeHostManifest } from '../../native-host/bin/enigma-native-host.mjs';
import { buildClaudeMcpbPackage, renderClaudeMcpbPackagePlain } from '../../../scripts/build-claude-mcpb-package.mjs';
import { aggregateUsageEvents, createUsageEvent } from '../../../packages/metering/src/index.js';
import {
  createMemoryAccessReceipt,
  createMemoryOptimizationPlan,
} from '../../../packages/optimizer/src/index.js';
import {
  createConsumerGpuCapacityProfile,
  createOperatorServiceQuote,
  createPermissionlessMemoryJob,
  createServiceSettlementReceipt,
  createSettlementBatch,
  verifyServiceSettlementReceipt,
} from '../../../packages/settlement/src/index.js';
import {
  assertNoPrivateProofPayload,
  createBenchmarkAttestation,
  createCapabilityGrant,
  createCapabilityRevocation,
  createProofNetworkAnchorBatch,
  createRegistryEntry,
  createRegistryBatch,
  sha256Json as proofNetworkSha256Json,
  validateBenchmarkAttestation,
  validateCapabilityGrant,
  validateCapabilityRevocation,
  validateProofNetworkAnchorBatch,
  validateRegistryEntry,
  validateRegistryBatch,
  validateProofNetworkPacket,
} from '../../../packages/proof-network/src/index.js';

const DEFAULT_BUNDLE = '.enigma/bundle.json';
const DEFAULT_TEST_DRIVE_DIR = '.enigma/test-drive';
const DEFAULT_TEST_DRIVE_BUNDLE_NAME = 'bundle.json';
const DEFAULT_TEST_DRIVE_CROSS_MODEL_REPORT_NAME = 'cross-model-report.json';
export const DEFAULT_RELAY_PORT = 8787;
export const DEFAULT_GATEWAY_PORT = 8797;
const DEFAULT_QUICKSTART_MEMORY = 'Enigma quickstart demo memory: local proof bundles can be created and verified without provider or cloud credentials.';
const DEFAULT_CROSS_MODEL_DEMO_BUNDLE = '.enigma/cross-model-demo-bundle.json';
const DEFAULT_CROSS_MODEL_MEMORY = 'Enigma cross-model demo memory: a local encrypted memory can be packaged for ChatGPT, Claude, Kimi, Cursor, and a local LLM without provider credentials.';
const DEFAULT_SETUP_CLIENTS = Object.freeze(['generic-mcp', 'claude-desktop', 'cursor', 'kimi-code', 'vscode-cline']);
const SETUP_CLAIM_BOUNDARIES = Object.freeze({
  local_only: true,
  provider_credentials_required: false,
  provider_native_memory_canonical: false,
  provider_deletion_proof: false,
  model_forgetting_proof: false,
  roi_or_savings_guarantee: false,
  compliance_certification: false,
});
const QUICKSTART_ARTIFACT_NAMES = Object.freeze({
  contextPack: 'context-pack.json',
  export: 'export.json',
  verifyReport: 'verify-report.json',
});
const CROSS_MODEL_PROFILES = Object.freeze([
  { id: 'chatgpt', provider: 'chatgpt', model: 'chatgpt-mcp-profile', label: 'ChatGPT' },
  { id: 'claude', provider: 'claude', model: 'claude-mcp-profile', label: 'Claude' },
  { id: 'kimi', provider: 'kimi', model: 'kimi-mcp-profile', label: 'Kimi' },
  { id: 'cursor', provider: 'cursor', model: 'cursor-mcp-profile', label: 'Cursor' },
  { id: 'local-llm', provider: 'local', model: 'local-llm-profile', label: 'Local LLM' },
]);
const CROSS_MODEL_CLAIM_BOUNDARIES = Object.freeze({
  local_only: true,
  provider_credentials_required: false,
  provider_native_memory_canonical: false,
  provider_deletion_proof: false,
  model_forgetting_proof: false,
  roi_or_savings_guarantee: false,
  compliance_certification: false,
});
const PACKAGE_JSON_URL = new URL('../../../package.json', import.meta.url);
const SPECS_URL = new URL('../../../specs/', import.meta.url);
const IMPORTERS = Object.freeze({
  text: importTextMemoryList,
  txt: importTextMemoryList,
  markdown: importTextMemoryList,
  md: importTextMemoryList,
  'text-list': importTextMemoryList,
  text_list: importTextMemoryList,
  chatgpt: importChatGptExport,
  'chatgpt-export': importChatGptExport,
  chatgpt_export: importChatGptExport,
  claude: importClaudeMemory,
  'claude-memory': importClaudeMemory,
  claude_memory: importClaudeMemory,
  mem0: importMem0Export,
  'mem0-export': importMem0Export,
  mem0_export: importMem0Export,
  letta: importLettaAgentFile,
  'letta-agent': importLettaAgentFile,
  letta_agent: importLettaAgentFile,
  letta_agent_file: importLettaAgentFile,
  langgraph: importLangGraphStore,
  'langgraph-store': importLangGraphStore,
  langgraph_store: importLangGraphStore,
  zep: importZepGraphitiExport,
  graphiti: importZepGraphitiExport,
  'zep-graphiti': importZepGraphitiExport,
  zep_graphiti: importZepGraphitiExport,
  zep_graphiti_export: importZepGraphitiExport,
});

export const REQUIRED_PACKAGE_BINS = Object.freeze(['enigma', 'enigma-verify', 'enigma-mcp', 'enigma-relay', 'enigma-gateway', 'enigma-native-host']);

function setFlagValue(flags, name, value) {
  if (!flags.has(name)) {
    flags.set(name, value);
    return;
  }
  const current = flags.get(name);
  if (Array.isArray(current)) {
    current.push(value);
  } else {
    flags.set(name, [current, value]);
  }
}

function parseArgs(argv) {
  const flags = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      setFlagValue(flags, arg.slice(2, eq), arg.slice(eq + 1));
    } else if (!argv[i + 1] || argv[i + 1].startsWith('--')) {
      setFlagValue(flags, arg.slice(2), true);
    } else {
      setFlagValue(flags, arg.slice(2), argv[i + 1]);
      i += 1;
    }
  }
  return flags;
}

function getFlag(flags, names, fallback = undefined) {
  for (const name of names) if (flags.has(name)) return flags.get(name);
  return fallback;
}

function lastFlagValue(value) {
  return Array.isArray(value) ? value[value.length - 1] : value;
}

function booleanFlag(flags, names, fallback = false) {
  const value = lastFlagValue(getFlag(flags, names, fallback));
  if (value === true || value === false) return value;
  if (value === undefined || value === '') return fallback;
  if (String(value) === 'true') return true;
  if (String(value) === 'false') return false;
  throw new Error(`--${names[0]} must be true or false.`);
}

function requireFlag(flags, names, label = names[0]) {
  const value = getFlag(flags, names);
  if (value === undefined || value === true || value === '') throw new Error(`Missing required --${label}.`);
  return value;
}

function optionalPositional(value) {
  return value && !String(value).startsWith('--') ? String(value) : undefined;
}

function requireFileArg(flags, names, positional, label = names[0]) {
  const value = getFlag(flags, names);
  if (value !== undefined && value !== true && value !== '') return value;
  if (positional) return positional;
  throw new Error(`Missing required --${label}.`);
}

function parseJson(value, fallback = {}) {
  if (value === undefined || value === true || value === '') return fallback;
  return JSON.parse(value);
}

function parseList(value) {
  if (value === undefined || value === true || value === '') return [];
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function parseOptionalNumber(value) {
  if (value === undefined || value === true || value === '') return undefined;
  return Number(value);
}

function print(value, io) {
  io.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function rawFlagValues(flags, names) {
  const value = getFlag(flags, names);
  if (value === undefined || value === true || value === '') return [];
  return Array.isArray(value) ? value : [value];
}

async function parseJsonFlagValue(value, label) {
  if (value === undefined || value === true || value === '') throw new Error(`Missing required --${label}.`);
  return JSON.parse(String(value));
}

async function readJsonFlagValue(value, label) {
  if (value === undefined || value === true || value === '') throw new Error(`Missing required --${label}.`);
  return readJson(resolve(String(value)));
}

function pushGrantArtifacts(target, artifact, label) {
  if (Array.isArray(artifact)) {
    target.push(...artifact);
    return;
  }
  if (artifact && Array.isArray(artifact.grants)) {
    target.push(...artifact.grants);
    return;
  }
  if (artifact && typeof artifact === 'object') {
    target.push(artifact);
    return;
  }
  throw new Error(`--${label} must be a grant object, grant array, or object with grants array.`);
}

async function memoryTextFromFlags(flags) {
  const inlineText = getFlag(flags, ['text', 'memory', 'memory-text', 'memoryText']);
  const textFile = getFlag(flags, ['text-file', 'textFile', 'memory-file', 'memoryFile']);
  if (inlineText !== undefined && textFile !== undefined) throw new Error('Use either --text/--memory-text or --text-file, not both.');
  if (textFile !== undefined) {
    if (textFile === true || textFile === '') throw new Error('Missing required --text-file.');
    return readFile(resolve(String(textFile)), 'utf8');
  }
  return requireFlag(flags, ['text', 'memory', 'memory-text', 'memoryText'], 'text');
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function pathFlag(flags, names, fallback) {
  const value = lastFlagValue(getFlag(flags, names, fallback));
  if (value === true || value === '') throw new Error(`Missing required --${names[0]}.`);
  return String(value);
}

function quickstartPathDisplay(outDirInput, name) {
  const base = String(outDirInput);
  if (base === '' || base === '.') return name;
  return `${base.replace(/[\\/]+$/, '')}/${name}`;
}

function outputPathRole(output, index) {
  if (output && typeof output === 'object' && typeof output.role === 'string' && output.role.length > 0) return output.role;
  return `output_${index + 1}`;
}

function outputPathValue(output) {
  return output && typeof output === 'object' ? output.path : output;
}

function ensureDistinctOutputPaths(outputs) {
  const seen = new Map();
  for (let index = 0; index < outputs.length; index += 1) {
    const output = outputs[index];
    const path = outputPathValue(output);
    const normalized = process.platform === 'win32' ? String(path).toLowerCase() : String(path);
    const previous = seen.get(normalized);
    if (previous) {
      const currentRole = outputPathRole(output, index);
      throw new Error(`Quickstart output paths overlap: ${previous.role} and ${currentRole} resolve to the same file. Choose a bundle filename that is not ${Object.values(QUICKSTART_ARTIFACT_NAMES).join(', ')}; for example --bundle <out-dir>/bundle.json --out-dir <out-dir>.`);
    }
    seen.set(normalized, { role: outputPathRole(output, index) });
  }
}

async function assertCanWriteQuickstartOutputs(outputs, overwrite) {
  if (overwrite) return;
  const existing = [];
  for (const output of outputs) {
    if (await fileExists(output.path)) existing.push(output.display);
  }
  if (existing.length > 0) {
    throw new Error(`Quickstart output already exists: ${existing.join(', ')}. Choose a different empty --out-dir, or pass --overwrite only if you intend to replace it.`);
  }
}

async function quickstartMemoryTextFromFlags(flags) {
  const inlineText = getFlag(flags, ['memory-text', 'memoryText']);
  const textFile = getFlag(flags, ['memory-file', 'memoryFile', 'text-file', 'textFile']);
  if (inlineText !== undefined && textFile !== undefined) throw new Error('Use either --memory-text or --memory-file, not both.');
  if (inlineText !== undefined) {
    if (inlineText === true || inlineText === '') throw new Error('Missing required --memory-text.');
    return String(inlineText);
  }
  if (textFile !== undefined) {
    if (textFile === true || textFile === '') throw new Error('Missing required --memory-file.');
    return readFile(resolve(String(textFile)), 'utf8');
  }
  return DEFAULT_QUICKSTART_MEMORY;
}

function quickstartOutputs(bundleInput, outDirInput) {
  const bundlePath = resolve(bundleInput);
  const outDirPath = resolve(outDirInput);
  const contextPackPath = resolve(outDirPath, QUICKSTART_ARTIFACT_NAMES.contextPack);
  const exportPath = resolve(outDirPath, QUICKSTART_ARTIFACT_NAMES.export);
  const verifyReportPath = resolve(outDirPath, QUICKSTART_ARTIFACT_NAMES.verifyReport);
  return {
    bundlePath,
    outDirPath,
    contextPackPath,
    exportPath,
    verifyReportPath,
    contextPackDisplay: quickstartPathDisplay(outDirInput, QUICKSTART_ARTIFACT_NAMES.contextPack),
    exportDisplay: quickstartPathDisplay(outDirInput, QUICKSTART_ARTIFACT_NAMES.export),
    verifyReportDisplay: quickstartPathDisplay(outDirInput, QUICKSTART_ARTIFACT_NAMES.verifyReport),
    outputs: [
      { role: 'bundle', path: bundlePath, display: bundleInput },
      { role: 'context_pack', path: contextPackPath, display: quickstartPathDisplay(outDirInput, QUICKSTART_ARTIFACT_NAMES.contextPack) },
      { role: 'export', path: exportPath, display: quickstartPathDisplay(outDirInput, QUICKSTART_ARTIFACT_NAMES.export) },
      { role: 'verify_report', path: verifyReportPath, display: quickstartPathDisplay(outDirInput, QUICKSTART_ARTIFACT_NAMES.verifyReport) },
    ],
  };
}

async function buildQuickstartArtifacts(flags, { bundleInput = DEFAULT_BUNDLE, outDirInput = dirname(bundleInput), overwrite = false, write = true, checkExisting = true } = {}) {
  const paths = quickstartOutputs(bundleInput, outDirInput);
  ensureDistinctOutputPaths(paths.outputs);
  if (checkExisting) await assertCanWriteQuickstartOutputs(paths.outputs, overwrite);

  const passphrase = getFlag(flags, ['passphrase']);
  const vault = createVault({
    subjectId: String(getFlag(flags, ['subject', 'subject-id'], 'local-user')),
    displayName: String(getFlag(flags, ['display-name', 'name'], 'Local user')),
    passphrase,
  });
  const passport = createPassport({
    vault,
    subjectId: vault.subject_id,
    displayName: String(getFlag(flags, ['display-name', 'name'], 'Local user')),
  });
  remember({
    vault,
    passport,
    text: await quickstartMemoryTextFromFlags(flags),
    purpose: 'quickstart_local_proof',
    purpose_tags: ['quickstart'],
    metadata: { source: 'enigma quickstart' },
  });
  const contextPack = compileContextPack({
    vault,
    passport,
    query: '',
    purpose: 'quickstart_local_context',
    limit: 8,
  });
  const exported = exportBundle({ vault, includePlaintext: false, passphrase });
  const bundle = exported.bundle ?? exported;
  const verifyReport = verifyBundle(bundle);

  if (write) {
    await writeJson(paths.bundlePath, bundle);
    await writeJson(paths.contextPackPath, contextPack);
    await writeJson(paths.exportPath, bundle);
    await writeJson(paths.verifyReportPath, verifyReport);
  }

  return { ...paths, vault, passport, contextPack, bundle, verifyReport };
}

async function crossModelMemoryTextFromFlags(flags) {
  const textFile = getFlag(flags, ['memory-file', 'memoryFile', 'text-file', 'textFile']);
  if (textFile === undefined) return DEFAULT_CROSS_MODEL_MEMORY;
  if (textFile === true || textFile === '') throw new Error('Missing required --memory-file.');
  return readFile(resolve(String(textFile)), 'utf8');
}

function activeMemoryCount(vault) {
  return vault.activeAddresses instanceof Set ? vault.activeAddresses.size : 0;
}

function sha256Json(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function sha256PublicValue(value) {
  return `sha256:${createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')}`;
}

function contextPackPublicDigest(pack) {
  return sha256Json({
    schema: pack.schema,
    context_pack_id: pack.context_pack_id,
    provider: pack.provider,
    model: pack.model,
    purpose: pack.purpose,
    memory_addresses: pack.memory_addresses,
    receipt_hashes: pack.receipt_hashes,
    active_set_root: pack.active_set_root,
    receipt_log_root: pack.receipt_log_root,
  });
}

function publicReceiptRefs(receipts) {
  return (Array.isArray(receipts) ? receipts : []).map((receipt) => ({
    receipt_id: receipt.receipt_id,
    operation: receipt.operation,
    memory_addr: receipt.memory_addr,
    provider: receipt.provider,
    model: receipt.model,
    event_hash: receipt.event_hash,
    receipt_log_root: receipt.receipt_log_root,
    timestamp: receipt.timestamp,
  }));
}

function publicContextPackSummary(pack) {
  const receipts = publicReceiptRefs(pack.receipts);
  return {
    schema: pack.schema,
    context_pack_ref: `enigma://context-pack/${pack.context_pack_id}`,
    context_pack_id: pack.context_pack_id,
    context_pack_digest: contextPackPublicDigest(pack),
    provider: pack.provider,
    model: pack.model,
    purpose: pack.purpose,
    memory_addresses: Array.isArray(pack.memory_addresses) ? [...pack.memory_addresses] : [],
    memory_count: Array.isArray(pack.memory_addresses) ? pack.memory_addresses.length : 0,
    receipt_count: receipts.length,
    receipt_hashes: Array.isArray(pack.receipt_hashes) ? [...pack.receipt_hashes] : [],
    receipts,
    active_set_root: pack.active_set_root,
    receipt_log_root: pack.receipt_log_root,
    content_redacted: true,
  };
}

const SEARCH_RELEVANCE_STOPWORDS = new Set([
  'about',
  'after',
  'again',
  'against',
  'also',
  'and',
  'any',
  'are',
  'assistant',
  'because',
  'been',
  'before',
  'being',
  'between',
  'can',
  'could',
  'current',
  'does',
  'from',
  'has',
  'have',
  'how',
  'into',
  'its',
  'latest',
  'more',
  'most',
  'number',
  'own',
  'owns',
  'please',
  'should',
  'that',
  'the',
  'their',
  'then',
  'there',
  'these',
  'they',
  'this',
  'use',
  'using',
  'was',
  'what',
  'when',
  'where',
  'which',
  'who',
  'whose',
  'why',
  'with',
  'would',
]);

function addSearchToken(tokens, token) {
  if (token.length < 3) return;
  if (!/[a-z]/u.test(token)) return;
  if (SEARCH_RELEVANCE_STOPWORDS.has(token)) return;
  tokens.add(token);
}

function searchTokensFrom(value) {
  const tokens = new Set();
  if (value === undefined || value === null) return tokens;
  for (const match of String(value).toLowerCase().matchAll(/[a-z0-9]+(?:[-_][a-z0-9]+)*/gu)) {
    const token = match[0];
    addSearchToken(tokens, token);
    if (token.includes('-') || token.includes('_')) {
      for (const part of token.split(/[-_]+/u)) addSearchToken(tokens, part);
    }
  }
  return tokens;
}

function addSearchTokensFromValue(tokens, value) {
  for (const token of searchTokensFrom(value)) tokens.add(token);
}

function recordSearchTokens(record, content) {
  const tokens = new Set();
  addSearchTokensFromValue(tokens, content);
  addSearchTokensFromValue(tokens, record?.kind);
  for (const tag of record?.purpose_tags ?? []) addSearchTokensFromValue(tokens, tag);
  return tokens;
}

function searchScore(queryTokens, memoryTokens) {
  if (queryTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of queryTokens) {
    if (memoryTokens.has(token)) overlap += 1;
  }
  return Math.round((overlap / queryTokens.size) * 1_000_000) / 1_000_000;
}

function searchResultReceiptIds(vault, memoryAddr) {
  return vault.receipts
    .filter((receipt) => receipt?.memory_addr === memoryAddr || receipt?.source_addr === memoryAddr)
    .map((receipt) => receipt.receipt_id)
    .filter((receiptId) => typeof receiptId === 'string' && receiptId.length > 0);
}

function publicAccessReceiptRef(receipt) {
  return {
    access_receipt_ref: `enigma://memory-access/${receipt.receipt_id}`,
    receipt_id: receipt.receipt_id,
    operation: receipt.operation,
    memory_addr: receipt.address,
    plan_hash: receipt.plan_hash,
    estimated_prompt_tokens: receipt.estimated_prompt_tokens,
    access_boundary: receipt.access_boundary,
  };
}

function searchCandidates(vault, queryTokens, includeUnrelated = false) {
  const candidates = [];
  const byAddress = new Map();
  for (const memoryAddr of [...vault.activeAddresses].sort()) {
    const record = vault.__getRecord(memoryAddr);
    if (!record || record.state !== 'active') continue;
    const content = vault.__getPlaintext(memoryAddr);
    const score = searchScore(queryTokens, recordSearchTokens(record, content));
    if (!includeUnrelated && queryTokens.size > 0 && score === 0) continue;
    const candidate = {
      address: memoryAddr,
      content,
      importance: typeof record.importance === 'number' ? record.importance : typeof record.confidence === 'number' ? record.confidence : undefined,
      last_accessed_at: record.updated_at ?? record.created_at,
      metadata: {
        kind: record.kind,
        sensitivity: record.sensitivity,
        purpose_tags: record.purpose_tags ?? [],
      },
    };
    candidates.push(candidate);
    byAddress.set(memoryAddr, { record, content, score });
  }
  return { candidates, byAddress };
}

function connectorReadinessSummary(bundlePath) {
  return {
    ready: true,
    bundle: bundlePath,
    bundle_env: 'ENIGMA_BUNDLE',
    mcp_command: 'enigma-mcp',
    supported_clients: supportedClients,
  };
}

function demoBundleRef(bundleWasSupplied) {
  return bundleWasSupplied ? 'supplied_bundle' : DEFAULT_CROSS_MODEL_DEMO_BUNDLE;
}

async function readPackageJson() {
  return readJson(PACKAGE_JSON_URL);
}

function packageFileUrl(path) {
  return new URL(`../../../${String(path).replace(/^\.\//, '')}`, import.meta.url);
}

function nodeMajor(version) {
  return Number(String(version).split('.')[0]);
}

function minimumNodeMajor(range) {
  const match = String(range ?? '').match(/>=\s*(\d+)/);
  return match ? Number(match[1]) : 0;
}

function npmUserAgentCheck(userAgent = process.env.npm_config_user_agent) {
  const raw = typeof userAgent === 'string' ? userAgent.trim() : '';
  const npmToken = raw.split(/\s+/).find((token) => token.startsWith('npm/'));
  const version = npmToken ? npmToken.slice(4) : null;
  return {
    ok: true,
    detected: version !== null,
    name: version === null ? null : 'npm',
    version,
    source: version === null ? null : 'npm_config_user_agent',
  };
}

async function statIfExists(path) {
  try {
    return await stat(path);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return null;
    throw error;
  }
}

async function nearestExistingAncestor(path) {
  let current = resolve(path);
  for (;;) {
    const stats = await statIfExists(current);
    if (stats !== null) return { path: current, stats };
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function publicParentDisplay(path, label) {
  const value = String(path);
  if (/^<[^>]+>$/.test(value)) return `<${label}>`;
  const parent = dirname(value);
  return parent === '' ? '.' : publicPathDisplay(parent, label);
}

async function writableVaultPathCheck(bundleInput, displayInput = bundleInput) {
  const bundlePath = resolve(String(bundleInput));
  const parentPath = dirname(bundlePath);
  const targetStats = await statIfExists(bundlePath);
  const nearest = await nearestExistingAncestor(parentPath);
  let ok = false;
  let reason = null;
  let parentExists = false;
  let nearestExistingParent = null;
  if (targetStats?.isDirectory()) {
    reason = 'target_is_directory';
  } else if (nearest === null) {
    reason = 'no_existing_parent';
  } else if (!nearest.stats.isDirectory()) {
    reason = 'nearest_parent_not_directory';
    nearestExistingParent = '<existing-parent-path>';
  } else {
    parentExists = nearest.path === parentPath;
    nearestExistingParent = parentExists ? publicParentDisplay(displayInput, 'bundle-dir') : '<existing-parent-dir>';
    try {
      await access(nearest.path, fsConstants.W_OK);
      ok = true;
    } catch {
      reason = 'parent_not_writable';
    }
  }
  return {
    ok,
    path: publicPathDisplay(displayInput, 'bundle-path'),
    parent: publicParentDisplay(displayInput, 'bundle-dir'),
    parent_exists: parentExists,
    nearest_existing_parent: nearestExistingParent,
    target_exists: targetStats !== null,
    target_is_directory: targetStats?.isDirectory() === true,
    writable: ok,
    reason,
    hint: ok ? null : 'Choose a writable --bundle path or create a writable parent directory.',
  };
}

async function bundleInitializedCheck(bundlePath, vaultPath) {
  if (vaultPath.target_exists !== true) {
    return {
      ok: false,
      bundle: vaultPath.path,
      target_exists: false,
      schema: null,
      reason: 'bundle_missing',
      hint: 'Run enigma quickstart --bundle <bundle-path> before using doctor as the final green check.',
    };
  }
  try {
    const bundle = await readJson(bundlePath);
    const schema = typeof bundle?.schema === 'string' ? bundle.schema : null;
    const schemaOk = schema === 'enigma.vault_bundle.v1';
    return {
      ok: schemaOk,
      bundle: vaultPath.path,
      target_exists: true,
      schema: schemaOk ? schema : null,
      reason: schemaOk ? null : 'bundle_schema_mismatch',
      hint: schemaOk ? null : 'Create a fresh bundle with enigma quickstart --bundle <new-bundle-path>, or use --overwrite only if you intentionally replace this local bundle.',
    };
  } catch {
    return {
      ok: false,
      bundle: vaultPath.path,
      target_exists: true,
      schema: null,
      reason: 'bundle_json_invalid',
      hint: 'Create a fresh bundle with enigma quickstart --bundle <new-bundle-path>, or use --overwrite only if you intentionally replace this local bundle.',
    };
  }
}

async function schemaFiles() {
  return (await readdir(SPECS_URL)).filter((name) => name.endsWith('.schema.json')).sort();
}

function connectorOptions(flags, includeBundle = true) {
  const options = {};
  if (includeBundle) options.bundlePath = resolve(String(getFlag(flags, ['bundle', 'file'], DEFAULT_BUNDLE)));
  const configPath = getFlag(flags, ['config', 'config-path']);
  if (configPath && configPath !== true) options.configPath = resolve(String(configPath));
  const serverName = getFlag(flags, ['server-name']);
  if (serverName && serverName !== true) options.serverName = String(serverName);
  const mcpCommand = getFlag(flags, ['mcp-command', 'command']);
  if (mcpCommand && mcpCommand !== true) options.mcpCommand = String(mcpCommand);
  if (getFlag(flags, ['dry-run', 'dryRun'], false) === true) options.dryRun = true;
  return options;
}

function publicCapsuleImportResult(result) {
  return {
    ...result,
    memory_candidates: Array.isArray(result.memory_candidates)
      ? result.memory_candidates.map(({ content: _content, metadata: _metadata, ...candidate }) => candidate)
      : [],
  };
}

async function ensureBundle(bundlePath, flags = {}) {
  const existed = await fileExists(bundlePath);
  if (existed) return { created: false, bundle: await readJson(bundlePath) };
  const passphrase = getFlag(flags, ['passphrase']);
  const vault = createVault({
    subjectId: String(getFlag(flags, ['subject', 'subject-id'], 'local-user')),
    displayName: String(getFlag(flags, ['display-name', 'name'], 'Local user')),
    passphrase,
  });
  const bundle = await persistState(bundlePath, vault, { passphrase });
  return { created: true, bundle };
}

function listenAddress(server) {
  const address = server.address();
  if (typeof address === 'string') return { path: address };
  return { host: address?.address, port: address?.port, family: address?.family };
}
function requireStringFlag(flags, names, label = names[0]) {
  const value = getFlag(flags, names);
  if (value === undefined) return undefined;
  if (value === true || value === '') throw new Error(`Missing required --${label}.`);
  return String(value);
}

async function loadOrCreateState({ flags, createState, loadStateFromFile, saveStateToFile }) {
  const stateFileFlag = requireStringFlag(flags, ['state-file'], 'state-file');
  if (stateFileFlag === undefined) return { state: createState(), stateFile: undefined };
  const stateFile = resolve(stateFileFlag);
  await mkdir(dirname(stateFile), { recursive: true });
  const state = await fileExists(stateFile) ? await loadStateFromFile(stateFile) : createState();
  await saveStateToFile(state, stateFile);
  return { state, stateFile };
}

function stateMutatingRelayRequest(req) {
  if (String(req.method ?? 'GET').toUpperCase() !== 'POST') return false;
  const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
  return pathname === '/relay/push'
    || pathname === '/witness/checkpoint'
    || pathname === '/pairing/challenge'
    || pathname === '/pairing/complete';
}

function stateMutatingGatewayRequest(req) {
  const method = String(req.method ?? 'GET').toUpperCase();
  const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
  return (method === 'PUT' && pathname === '/policy')
    || (method === 'POST' && (pathname === '/gateway/evaluate' || pathname === '/gateway/decision'));
}

function createPersistentHttpServer({ state, stateFile, io, service, handleRequest, saveStateToFile, stateMutatingRequest }) {
  let pendingSave = Promise.resolve();
  let server;
  const saveState = () => {
    if (stateFile === undefined) return pendingSave;
    pendingSave = pendingSave.catch(() => undefined).then(() => saveStateToFile(state, stateFile));
    pendingSave.catch((error) => {
      io.stderr?.write?.(`${service} state persistence failed: ${error instanceof Error ? error.message : String(error)}\n`);
      server.close();
    });
    return pendingSave;
  };
  server = createHttpServer((req, res) => {
    const shouldSave = stateFile !== undefined && stateMutatingRequest(req);
    Promise.resolve(handleRequest(state, req, res)).then(() => {
      if (shouldSave && res.statusCode < 400) return saveState();
      return undefined;
    }).catch((error) => {
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: { code: 'SERVER_ERROR' } }));
      }
      io.stderr?.write?.(`${service} request failed: ${error instanceof Error ? error.message : String(error)}\n`);
    });
  });
  server.persistState = saveState;
  server.waitForStatePersistence = () => pendingSave;
  return server;
}

async function createServiceServer({ flags, io, service, createState, handleRequest, loadStateFromFile, saveStateToFile, stateMutatingRequest }) {
  const { state, stateFile } = await loadOrCreateState({ flags, createState, loadStateFromFile, saveStateToFile });
  return createPersistentHttpServer({ state, stateFile, io, service, handleRequest, saveStateToFile, stateMutatingRequest });
}


async function serveHttpCommand({ flags, io, service, createServer, defaultPort }) {
  const host = String(getFlag(flags, ['host'], '127.0.0.1'));
  const port = Number(getFlag(flags, ['port'], defaultPort));
  const server = await createServer();
  await new Promise((resolveListen, rejectListen) => {
    const onError = (error) => {
      server.off('listening', onListening);
      rejectListen(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolveListen();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen({ host, port });
  });
  print({ ok: true, service, listening: true, address: listenAddress(server) }, io);
  if (getFlag(flags, ['once'], false) === true) {
    await server.persistState?.();
    await server.waitForStatePersistence?.();
    await new Promise((resolveClose, rejectClose) => server.close((error) => (error ? rejectClose(error) : resolveClose())));
    return 0;
  }
  await new Promise((resolveClose) => server.once('close', resolveClose));
  return 0;
}

function reviveVault(stored, options = {}) {
  if (stored.schema !== 'enigma.vault_bundle.v1') {
    if (stored.vault?.schema === 'enigma.vault.local.v1') return stored.vault;
    throw new Error(`Unsupported Enigma bundle schema: ${stored.schema ?? '<missing>'}`);
  }
  const keyring = stored.keyring;
  let vaultKey;
  let addressKey;
  let privateKey;
  if (keyring?.type === KEYRING_ENCRYPTED_TYPE) {
    if (!options.passphrase) throw new Error('Encrypted keyring requires passphrase');
    const decrypted = decryptKeyring(keyring, options.passphrase);
    vaultKey = decrypted.vault_key_b64;
    addressKey = decrypted.address_key_b64;
    privateKey = decrypted.privateKey;
  } else {
    vaultKey = keyring?.vault_key_b64;
    addressKey = keyring?.address_key_b64;
    privateKey = keyring?.privateKey;
  }
  const signingKeyPair = privateKey
    ? { key_id: keyring?.signer?.key_id, publicKey: keyring?.publicKey, privateKey }
    : undefined;
  const vault = createVault({
    vault_id: stored.vault?.vault_id,
    tenant_id: stored.vault?.tenant_id,
    subject_id: stored.vault?.subject_id,
    actor_id: stored.vault?.actor_id,
    policy_id: stored.vault?.policy_id,
    vault_key: vaultKey,
    address_key: addressKey,
    signingKeyPair,
    now: stored.vault?.created_at,
  });
  if (keyring?.signer) vault.signer = keyring.signer;
  vault.created_at = stored.vault?.created_at ?? vault.created_at;
  vault.updated_at = stored.vault?.updated_at ?? vault.updated_at;
  vault.sequence = Number.isInteger(stored.vault?.sequence) ? stored.vault.sequence : 0;
  vault.events = Array.isArray(stored.events) ? stored.events : [];
  vault.receipts = Array.isArray(stored.receipts) ? stored.receipts : [];
  vault.memories = new Map((stored.memory_objects ?? []).map((record) => [record.memory_addr, { ...record }]));
  vault.activeAddresses = new Set(stored.active_memory_addresses ?? []);
  vault.tombstones = new Map((stored.tombstones ?? []).map((tombstone) => [tombstone.memory_addr, tombstone]));
  const roots = vault.__computeRoots();
  vault.active_set_root = roots.active_set_root;
  vault.receipt_log_root = roots.receipt_log_root;
  return vault;
}

async function loadState(bundlePath, options = {}) {
  const stored = await readJson(bundlePath);
  const vault = reviveVault(stored, options);
  return { stored, vault, passport: createPassport({ vault }) };
}

async function persistState(bundlePath, vault, options = {}) {
  const exported = exportBundle({ vault, includePlaintext: false, passphrase: options.passphrase });
  const bundle = exported.bundle ?? exported;
  await writeJson(bundlePath, bundle);
  return bundle;
}


async function initCommand(flags, io) {
  const bundleInput = pathFlag(flags, ['bundle', 'file'], DEFAULT_BUNDLE);
  const outDirInput = pathFlag(flags, ['out-dir', 'outDir'], dirname(bundleInput));
  const requestedSelection = setupClientIds(flags);
  const overwrite = booleanFlag(flags, ['overwrite'], false);
  const dryRun = booleanFlag(flags, ['dry-run', 'dryRun'], false);
  const connectRequested = booleanFlag(flags, ['connect'], false);
  const displays = setupPublicDisplays(bundleInput, outDirInput);
  const rawDisplays = setupRawDisplays(bundleInput, outDirInput);
  let artifacts;
  try {
    artifacts = await buildQuickstartArtifacts(flags, { bundleInput, outDirInput, overwrite, write: !dryRun });
  } catch (error) {
    throw publicSetupError(error, rawDisplays, displays);
  }

  const autoSelect = requestedSelection.auto || (connectRequested && requestedSelection.mode === 'default');
  const selection = await setupClientSelection(
    flags,
    artifacts,
    requestedSelection,
    autoSelect,
    connectRequested && requestedSelection.mode === 'default' ? 'connect_installed' : requestedSelection.mode,
  );
  const clients = selection.clients;
  const connectorWritesRequested = connectRequested && !dryRun;
  const writeClientIds = connectRequested && selection.connectable_client_ids ? selection.connectable_client_ids : null;
  const connectors = await setupConnectorPlans(flags, artifacts, clients, connectorWritesRequested, displays, writeClientIds);
  const doctor = await setupDoctorChecks(flags, artifacts, clients, displays);
  const ok = artifacts.verifyReport.ok === true;
  const anyConnectorWritePerformed = connectors.some((connector) => connector.connect_plan.writes_performed === true);

  const summary = {
    ok,
    schema: artifacts.bundle.schema,
    command: 'enigma init',
    onboarding_schema: 'enigma.init.v1',
    dry_run: dryRun,
    artifacts_written: !dryRun,
    bundle: displays.bundle,
    out_dir: publicPathDisplay(outDirInput, 'out-dir'),
    context_pack: displays.context_pack,
    export: displays.export,
    verify_report: displays.verify_report,
    subject_id: artifacts.bundle.vault?.subject_id,
    client_configs_written: anyConnectorWritePerformed,
    client_config_write_requested: connectorWritesRequested,
    connector_write_mode: connectRequested ? (selection.connectable_client_ids ? 'installed_only' : 'selected_clients') : 'plan_only',
    connect_requested: connectRequested,
    selected_clients: clients,
    skipped_clients: selection.skipped,
    client_selection: publicSetupClientSelection(selection),
    connector_write_skips: connectorWriteSkips(connectors),
    connectors,
    mcp_config_snippets: Object.fromEntries(connectors.map((connector) => [connector.client_id, connector.mcp_config_snippet])),
    connect_plans: Object.fromEntries(connectors.map((connector) => [connector.client_id, connector.connect_plan])),
    memory_source: setupMemorySource(flags),
    memory_plaintext_echoed: false,
    raw_memory_printed: false,
    memory_count: Array.isArray(artifacts.bundle.memory_objects) ? artifacts.bundle.memory_objects.length : 0,
    receipt_count: Array.isArray(artifacts.bundle.receipts) ? artifacts.bundle.receipts.length : 0,
    context_item_count: Array.isArray(artifacts.contextPack.memories) ? artifacts.contextPack.memories.length : 0,
    verify_ok: ok,
    provider_credentials_required: false,
    hosted_saas_live: false,
    solana_required: false,
    browser_extension_required: false,
    provider_native_memory_canonical: false,
    next_commands: initNextCommands({ dryRun, bundleDisplay: displays.bundle, outDirDisplay: publicPathDisplay(outDirInput, 'out-dir'), exportDisplay: displays.export, clients, requestedSelection, connectRequested, overwrite, connectorWritesPerformed: anyConnectorWritePerformed }),
    checks: doctor.checks,
    claim_boundaries: { ...SETUP_CLAIM_BOUNDARIES, hosted_saas_live: false, raw_memory_printed: false, solana_required: false, browser_extension_required: false },
  };
  printSetupSummary(summary, flags, io);
  return ok ? 0 : 1;
}

function setupClientIds(flags) {
  const raw = getFlag(flags, ['client']);
  if (raw === undefined) return { mode: 'default', auto: false, clients: [...DEFAULT_SETUP_CLIENTS], explicit_clients: [] };
  const values = Array.isArray(raw) ? raw : [raw];
  const clients = [];
  let auto = false;
  for (const value of values) {
    if (value === true || value === '') throw new Error('Missing required --client.');
    for (const client of String(value).split(',').map((item) => item.trim()).filter(Boolean)) {
      if (client === 'auto') {
        auto = true;
        continue;
      }
      getClientProfile(client);
      if (!clients.includes(client)) clients.push(client);
    }
  }
  if (auto) return { mode: 'auto', auto: true, clients, explicit_clients: clients };
  return { mode: clients.length > 0 ? 'explicit' : 'default', auto: false, clients: clients.length > 0 ? clients : [...DEFAULT_SETUP_CLIENTS], explicit_clients: clients };
}

function setupDetectedClientReason(client) {
  if (client.installed === true && client.recommended_action === 'already_configured') return 'already_configured';
  if (client.installed === true) return 'installed_needs_repair';
  return 'client_config_present';
}

function setupSkippedClientReason(client) {
  if (client.parse_error === true) return 'config_json_invalid';
  if (client.config_path_exists === false || client.exists === false) return 'client_config_missing';
  if (client.ok === false) return 'config_unreadable';
  return 'not_selected';
}

function publicSetupClientSelectionEntry(client, reason) {
  return {
    client_id: client.client_id,
    display_name: client.display_name,
    reason,
    action: client.recommended_action ?? client.action ?? null,
    installed: client.installed === true,
    config_path_exists: client.config_path_exists === true || client.exists === true,
  };
}

async function setupAutoClientSelection(flags, artifacts, fallbackClients, mode) {
  const doctor = await doctorConnectors({
    ...connectorOptions(flags),
    bundlePath: artifacts.bundlePath,
    redactPaths: true,
  });
  const detected = doctor.clients.filter((client) => (client.config_path_exists === true || client.exists === true) && client.parse_error !== true);
  const fallbackUsed = detected.length === 0;
  const selectedClients = fallbackUsed ? [...fallbackClients] : detected.map((client) => client.client_id);
  const selectedSet = new Set(selectedClients);
  const detectedSet = new Set(detected.map((client) => client.client_id));
  const selected = fallbackUsed
    ? selectedClients.map((clientId) => {
      const client = doctor.clients.find((entry) => entry.client_id === clientId) ?? { client_id: clientId, display_name: getClientProfile(clientId).display_name };
      return publicSetupClientSelectionEntry(client, 'default_fallback_no_client_configs_detected');
    })
    : detected.map((client) => publicSetupClientSelectionEntry(client, setupDetectedClientReason(client)));
  const skipped = doctor.clients
    .filter((client) => !selectedSet.has(client.client_id))
    .map((client) => publicSetupClientSelectionEntry(client, fallbackUsed && !detectedSet.has(client.client_id) ? 'not_in_default_fallback' : setupSkippedClientReason(client)));
  const connectableClientIds = new Set(detected.map((client) => client.client_id));
  return {
    mode,
    auto: true,
    fallback_used: fallbackUsed,
    clients: selectedClients,
    selected,
    skipped,
    connectable_client_ids: connectableClientIds,
    detection: doctor,
  };
}

function setupMemorySource(flags) {
  if (getFlag(flags, ['memory-file', 'memoryFile', 'text-file', 'textFile']) !== undefined) return 'memory_file';
  if (getFlag(flags, ['memory-text', 'memoryText']) !== undefined) return 'demo_text';
  return 'default_demo';
}

function commandPath(path) {
  return `"${String(path).replace(/"/g, '\\"')}"`;
}

function publicPathDisplay(path, label) {
  const value = String(path);
  if (/^[A-Za-z]:[\\/]/.test(value) || value.startsWith('/') || value.startsWith('\\\\')) return `<${label}>`;
  return value;
}

function setupPublicDisplays(bundleInput, outDirInput) {
  const outDir = publicPathDisplay(outDirInput, 'out-dir');
  return {
    bundle: publicPathDisplay(bundleInput, 'bundle-path'),
    context_pack: quickstartPathDisplay(outDir, QUICKSTART_ARTIFACT_NAMES.contextPack),
    export: quickstartPathDisplay(outDir, QUICKSTART_ARTIFACT_NAMES.export),
    verify_report: quickstartPathDisplay(outDir, QUICKSTART_ARTIFACT_NAMES.verifyReport),
  };
}

function setupRawDisplays(bundleInput, outDirInput) {
  const plan = quickstartOutputs(bundleInput, outDirInput);
  return {
    bundle: plan.outputs[0].display,
    context_pack: plan.contextPackDisplay,
    export: plan.exportDisplay,
    verify_report: plan.verifyReportDisplay,
  };
}

function publicSetupError(error, rawDisplays, publicDisplays) {
  let message = error.message;
  for (const [raw, safe] of Object.entries({
    [rawDisplays.bundle]: publicDisplays.bundle,
    [rawDisplays.context_pack]: publicDisplays.context_pack,
    [rawDisplays.export]: publicDisplays.export,
    [rawDisplays.verify_report]: publicDisplays.verify_report,
  })) {
    message = message.split(raw).join(safe);
  }
  return new Error(message);
}

function oneCommandInstallConnect(bundleDisplay = DEFAULT_BUNDLE, outDirDisplay = dirname(bundleDisplay)) {
  const bundleArg = `--bundle ${commandPath(bundleDisplay)}`;
  const quickstartParts = ['npm install -g enigma-memory && enigma quickstart', bundleArg];
  if (outDirDisplay !== dirname(bundleDisplay)) quickstartParts.push(`--out-dir ${commandPath(outDirDisplay)}`);
  const base = quickstartParts.join(' ');
  const preview = (clientId) => `${base} && enigma connect ${clientId} ${bundleArg} --dry-run`;
  return {
    installed_clients: `${base} && enigma doctor ${bundleArg}`,
    claude_desktop: preview('claude-desktop'),
    cursor: preview('cursor'),
    kimi_code: preview('kimi-code'),
    vscode_cline: preview('vscode-cline'),
  };
}

function setupNextCommands(bundleInput, exportDisplay, clients, writeConnectors) {
  const primaryClient = clients[0] ?? DEFAULT_SETUP_CLIENTS[0];
  const bundle = commandPath(bundleInput);
  const commands = [
    `enigma status --bundle ${bundle}`,
    `enigma drive health --bundle ${bundle}`,
    `enigma remember --bundle ${bundle} --text-file ./memory.txt --plain`,
    `enigma search --bundle ${bundle} --query "project context"`,
    `enigma context --bundle ${bundle} --query "project context"`,
    `enigma export --bundle ${bundle} --out ${commandPath(exportDisplay)}`,
    `enigma verify --export ${commandPath(exportDisplay)}`,
  ];
  if (!writeConnectors) commands.push(`enigma connect ${primaryClient} --bundle ${bundle} --dry-run`);
  return commands;
}

function initExecuteCommand(bundleDisplay, outDirDisplay, requestedSelection, connectRequested, overwrite) {
  let command = `enigma init --bundle ${commandPath(bundleDisplay)} --out-dir ${commandPath(outDirDisplay)}`;
  for (const client of requestedSelection.explicit_clients) command += ` --client ${client}`;
  if (requestedSelection.auto) command += ' --client auto';
  if (connectRequested) command += ' --connect';
  if (overwrite) command += ' --overwrite';
  return command;
}

function initNextCommands({ dryRun, bundleDisplay, outDirDisplay, exportDisplay, clients, requestedSelection, connectRequested, overwrite, connectorWritesPerformed }) {
  const commands = dryRun ? [initExecuteCommand(bundleDisplay, outDirDisplay, requestedSelection, connectRequested, overwrite)] : [];
  commands.push(...setupNextCommands(bundleDisplay, exportDisplay, clients, connectRequested && connectorWritesPerformed));
  return commands;
}

function doctorNextCommands(bundleDisplay, client) {
  const clientId = client ?? DEFAULT_SETUP_CLIENTS[0];
  const bundle = commandPath(bundleDisplay);
  return [
    `enigma quickstart --bundle ${bundle}`,
    `enigma doctor --bundle ${bundle} --client ${clientId}`,
    `enigma drive health --bundle ${bundle}`,
    `enigma status --bundle ${bundle}`,
    `enigma connect ${clientId} --bundle ${bundle} --dry-run`,
  ];
}

function doctorFirstRunHint(_bundleDisplay, client) {
  const clientId = client ?? DEFAULT_SETUP_CLIENTS[0];
  const bundle = commandPath('<bundle-path>');
  return {
    bundle: '<bundle-path>',
    command: `enigma quickstart --bundle ${bundle}`,
    commands: [
      `enigma quickstart --bundle ${bundle}`,
      `enigma doctor --bundle ${bundle} --client ${clientId}`,
      `enigma drive health --bundle ${bundle}`,
    ],
  };
}

function doctorSetupStatus(checks, firstRunHint) {
  const setupReasons = [];
  const attentionReasons = [];
  const bundleReason = checks.bundle_initialized?.reason;
  if (checks.bundle_initialized?.ok === false) {
    if (['bundle_missing', 'bundle_schema_mismatch', 'bundle_json_invalid'].includes(bundleReason)) {
      setupReasons.push(bundleReason);
    } else {
      attentionReasons.push(bundleReason || 'bundle_not_ready');
    }
  }
  for (const client of checks.connectors?.clients ?? []) {
    if (client.ok !== false) continue;
    const repairReasons = Array.isArray(client.repair_reasons) ? client.repair_reasons : [];
    const setupOnly = repairReasons.length > 0 && repairReasons.every((reason) => reason === 'bundle_env_missing' || reason === 'bundle_env_mismatch');
    if (setupOnly) {
      for (const reason of repairReasons) setupReasons.push(`connector_${reason}`);
    } else {
      attentionReasons.push(`connector_${client.client_id || 'unknown'}_${repairReasons[0] || 'not_ready'}`);
    }
  }
  for (const [name, check] of Object.entries(checks)) {
    if (name === 'bundle_initialized' || name === 'connectors') continue;
    if (check?.ok === false) attentionReasons.push(name);
  }
  const uniqueSetupReasons = [...new Set(setupReasons)];
  const uniqueAttentionReasons = [...new Set(attentionReasons.filter(Boolean))];
  const state = uniqueAttentionReasons.length > 0
    ? 'attention_needed'
    : uniqueSetupReasons.length > 0
      ? 'setup_needed'
      : 'ready';
  return {
    schema: 'enigma.doctor_setup_status.v1',
    state,
    setup_needed: state === 'setup_needed',
    ready: state === 'ready',
    message: state === 'ready'
      ? 'Enigma local setup checks are green.'
      : state === 'setup_needed'
        ? 'Run quickstart to create the local Memory Drive bundle, then preview any app connection before approving changes.'
        : 'Fix the reported local install or connector issue before treating doctor as green.',
    reasons: state === 'attention_needed' ? uniqueAttentionReasons : uniqueSetupReasons,
    next_command: state === 'ready' ? null : firstRunHint.command,
    claim_boundaries: {
      local_enigma_checks_only: true,
      provider_deletion_proof: false,
      model_forgetting_proof: false,
      hosted_saas_live: false,
    },
  };
}

async function setupDoctorChecks(flags, artifacts, clients, displays) {
  const packageJson = await readPackageJson();
  const requiredNodeMajor = minimumNodeMajor(packageJson.engines?.node);
  const currentNodeMajor = nodeMajor(process.versions.node);
  const binMap = packageJson.bin && typeof packageJson.bin === 'object' && !Array.isArray(packageJson.bin) ? packageJson.bin : {};
  const binEntries = await Promise.all(REQUIRED_PACKAGE_BINS.map(async (name) => {
    const target = binMap[name];
    const declared = typeof target === 'string' && target.length > 0;
    return {
      name,
      target: declared ? target : null,
      declared,
      exists: declared ? await fileExists(packageFileUrl(target)) : false,
    };
  }));
  const schemas = await schemaFiles();
  const connectorBaseOptions = {
    ...connectorOptions(flags),
    bundlePath: artifacts.bundlePath,
    redactPaths: true,
  };
  const connectorClients = [];
  for (const client of clients) {
    const doctor = await doctorConnectors({ ...connectorBaseOptions, clientId: client });
    connectorClients.push(...doctor.clients);
  }
  const vaultPath = await writableVaultPathCheck(artifacts.bundlePath, displays.bundle);
  const checks = {
    node: {
      ok: requiredNodeMajor === 0 || currentNodeMajor >= requiredNodeMajor,
      current: process.versions.node,
      required: packageJson.engines?.node ?? null,
    },
    npm: npmUserAgentCheck(),
    vault_path: vaultPath,
    package_bins: {
      ok: binEntries.every((entry) => entry.declared && entry.exists),
      required: REQUIRED_PACKAGE_BINS,
      entries: binEntries,
      missing: binEntries.filter((entry) => !entry.declared).map((entry) => entry.name),
      missing_targets: binEntries.filter((entry) => entry.declared && !entry.exists).map((entry) => entry.name),
    },
    artifacts: {
      ok: artifacts.verifyReport.ok === true,
      bundle: displays.bundle,
      context_pack: displays.context_pack,
      export: displays.export,
      verify_report: displays.verify_report,
    },
    schemas: {
      ok: schemas.length > 0,
      count: schemas.length,
      files: schemas,
    },
    connectors: {
      ok: connectorClients.every((client) => client.ok !== false),
      clients: connectorClients,
    },
  };
  return { ok: Object.values(checks).every((check) => check.ok !== false), checks };
}

function publicConnectPlan(plan, wizard, profile, snippet) {
  const changed = plan?.changed !== false;
  const dryRun = plan?.dryRun === true || plan?.dry_run === true;
  const plannedWrites = changed ? [{ type: 'write', path: wizard.default_config_path }] : [];
  return {
    ok: plan?.ok !== false,
    action: 'connect',
    client_id: profile.client_id,
    configPath: wizard.default_config_path,
    config_path: wizard.default_config_path,
    serverName: profile.server_name,
    server_name: profile.server_name,
    changed,
    dryRun,
    dry_run: dryRun,
    writes_performed: changed && !dryRun,
    backup_planned: Boolean(plan?.backupPath),
    plannedWrites,
    planned_writes: plannedWrites,
    config: snippet,
  };
}

async function setupConnectorPlans(flags, artifacts, clients, writeConnectors, displays, writeClientIds = null) {
  const publicOptions = {
    ...connectorOptions(flags),
    bundlePath: displays.bundle,
  };
  const writeOptions = {
    ...connectorOptions(flags),
    bundlePath: artifacts.bundlePath,
  };
  const connectors = [];
  for (const client of clients) {
    const profile = getClientProfile(client, publicOptions);
    const snippet = renderMcpConfig(client, publicOptions);
    const wizard = planConnectWizard(client, { platform: profile.platform }).clients[0];
    const writeAllowed = writeClientIds === null || writeClientIds.has(client);
    const rawPlan = writeConnectors && writeAllowed
      ? await connectClient(client, { ...writeOptions, dryRun: false })
      : { ok: true, changed: !(writeConnectors && !writeAllowed), dryRun: true };
    const plan = publicConnectPlan(rawPlan, wizard, profile, snippet);
    connectors.push({
      client_id: client,
      display_name: profile.display_name,
      default_config_path: wizard.default_config_path,
      mcp_config_snippet: snippet,
      connect_command: `enigma connect ${client} --bundle ${commandPath(displays.bundle)}`,
      connect_plan: plan,
      write_selected: writeAllowed,
      write_skipped_reason: writeConnectors && !writeAllowed ? 'client_config_missing' : null,
      wizard,
    });
  }
  return connectors;
}

function publicSetupClientSelection(selection) {
  return {
    mode: selection.mode,
    auto: selection.auto === true,
    fallback_used: selection.fallback_used === true,
    selected: selection.selected,
    skipped: selection.skipped,
  };
}

function setupStaticClientSelection(requestedSelection) {
  return {
    ...requestedSelection,
    fallback_used: false,
    selected: requestedSelection.clients.map((clientId) => {
      const profile = getClientProfile(clientId);
      return publicSetupClientSelectionEntry({ client_id: clientId, display_name: profile.display_name }, requestedSelection.mode === 'default' ? 'default_setup_client' : 'explicit_client');
    }),
    skipped: [],
    connectable_client_ids: null,
  };
}

async function setupClientSelection(flags, artifacts, requestedSelection, autoSelect, mode) {
  return autoSelect ? setupAutoClientSelection(flags, artifacts, DEFAULT_SETUP_CLIENTS, mode) : setupStaticClientSelection(requestedSelection);
}

function connectorWriteSkips(connectors) {
  return connectors
    .filter((connector) => connector.write_skipped_reason)
    .map((connector) => ({
      client_id: connector.client_id,
      display_name: connector.display_name,
      reason: connector.write_skipped_reason,
    }));
}

export async function setupCommand(flags, io) {
  const bundleInput = pathFlag(flags, ['bundle', 'file'], DEFAULT_BUNDLE);
  const outDirInput = pathFlag(flags, ['out-dir', 'outDir'], dirname(bundleInput));
  const requestedSelection = setupClientIds(flags);
  const overwrite = booleanFlag(flags, ['overwrite'], false);
  const dryRun = booleanFlag(flags, ['dry-run', 'dryRun'], false);
  const writeConnectorsFlag = booleanFlag(flags, ['write-connectors', 'writeConnectors'], false);
  const connectInstalled = booleanFlag(flags, ['connect-installed', 'connectInstalled'], false);
  const connectorWritesRequested = (writeConnectorsFlag || connectInstalled) && !dryRun;
  const displays = setupPublicDisplays(bundleInput, outDirInput);
  const rawDisplays = setupRawDisplays(bundleInput, outDirInput);
  let artifacts;
  try {
    artifacts = await buildQuickstartArtifacts(flags, { bundleInput, outDirInput, overwrite, write: !dryRun });
  } catch (error) {
    throw publicSetupError(error, rawDisplays, displays);
  }
  const selection = await setupClientSelection(
    flags,
    artifacts,
    requestedSelection,
    connectInstalled || requestedSelection.auto,
    connectInstalled ? 'connect_installed' : 'auto',
  );
  const clients = selection.clients;
  const writeClientIds = connectInstalled ? selection.connectable_client_ids : null;
  const connectors = await setupConnectorPlans(flags, artifacts, clients, connectorWritesRequested, displays, writeClientIds);
  const doctor = await setupDoctorChecks(flags, artifacts, clients, displays);
  const ok = artifacts.verifyReport.ok === true;
  const anyConnectorWritePerformed = connectors.some((connector) => connector.connect_plan.writes_performed === true);

  const summary = {
    ok,
    schema: 'enigma.setup.v1',
    command: 'enigma setup',
    dry_run: dryRun,
    artifacts_written: !dryRun,
    client_configs_written: writeConnectorsFlag && !dryRun ? true : anyConnectorWritePerformed,
    client_config_write_requested: connectorWritesRequested,
    connector_write_mode: connectInstalled ? 'installed_only' : (writeConnectorsFlag ? 'selected_clients' : 'plan_only'),
    connect_installed: connectInstalled,
    bundle: displays.bundle,
    context_pack: displays.context_pack,
    export: displays.export,
    verify_report: displays.verify_report,
    memory_source: setupMemorySource(flags),
    memory_plaintext_echoed: false,
    raw_memory_printed: false,
    memory_count: Array.isArray(artifacts.bundle.memory_objects) ? artifacts.bundle.memory_objects.length : 0,
    receipt_count: Array.isArray(artifacts.bundle.receipts) ? artifacts.bundle.receipts.length : 0,
    context_item_count: Array.isArray(artifacts.contextPack.memories) ? artifacts.contextPack.memories.length : 0,
    verify_ok: artifacts.verifyReport.ok === true,
    provider_credentials_required: false,
    hosted_saas_live: false,
    solana_required: false,
    browser_extension_required: false,
    provider_native_memory_canonical: false,
    selected_clients: clients,
    skipped_clients: selection.skipped,
    client_selection: publicSetupClientSelection(selection),
    connector_write_skips: connectorWriteSkips(connectors),
    connectors,
    one_command_install_connect: oneCommandInstallConnect(displays.bundle, publicPathDisplay(outDirInput, 'out-dir')),
    mcp_config_snippets: Object.fromEntries(connectors.map((connector) => [connector.client_id, connector.mcp_config_snippet])),
    connect_plans: Object.fromEntries(connectors.map((connector) => [connector.client_id, connector.connect_plan])),
    next_commands: setupNextCommands(displays.bundle, displays.export, clients, connectorWritesRequested && (!connectInstalled || anyConnectorWritePerformed)),
    checks: doctor.checks,
    claim_boundaries: { ...SETUP_CLAIM_BOUNDARIES, hosted_saas_live: false, raw_memory_printed: false, solana_required: false, browser_extension_required: false },
  };
  printSetupSummary(summary, flags, io);
  return ok ? 0 : 1;
}

export async function quickstartCommand(flags, io) {
  const bundleInput = pathFlag(flags, ['bundle', 'file'], DEFAULT_BUNDLE);
  const outDirInput = pathFlag(flags, ['out-dir', 'outDir'], dirname(bundleInput));
  const overwrite = booleanFlag(flags, ['overwrite'], false);
  const displays = setupPublicDisplays(bundleInput, outDirInput);
  const rawOutputs = quickstartOutputs(bundleInput, outDirInput);
  ensureDistinctOutputPaths(rawOutputs.outputs);
  await assertCanWriteQuickstartOutputs([
    { path: rawOutputs.bundlePath, display: displays.bundle },
    { path: rawOutputs.contextPackPath, display: displays.context_pack },
    { path: rawOutputs.exportPath, display: displays.export },
    { path: rawOutputs.verifyReportPath, display: displays.verify_report },
  ], overwrite);
  const artifacts = await buildQuickstartArtifacts(flags, { bundleInput, outDirInput, overwrite, write: true, checkExisting: false });

  const summary = {
    ok: artifacts.verifyReport.ok === true,
    bundle: displays.bundle,
    context_pack: displays.context_pack,
    export: displays.export,
    verify_report: displays.verify_report,
    memory_count: Array.isArray(artifacts.bundle.memory_objects) ? artifacts.bundle.memory_objects.length : 0,
    receipt_count: Array.isArray(artifacts.bundle.receipts) ? artifacts.bundle.receipts.length : 0,
    context_item_count: Array.isArray(artifacts.contextPack.memories) ? artifacts.contextPack.memories.length : 0,
    verify_ok: artifacts.verifyReport.ok === true,
    next_commands: [
      `enigma verify --export ${displays.export}`,
      `enigma connect generic-mcp --bundle ${displays.bundle} --dry-run`,
    ],
    claim_boundaries: {
      local_only: true,
      provider_credentials_required: false,
      provider_native_memory_canonical: false,
      provider_deletion_proof: false,
      model_forgetting_proof: false,
      roi_or_savings_guarantee: false,
      compliance_certification: false,
    },
  };
  printQuickstartSummary(summary, flags, io);
  return artifacts.verifyReport.ok === true ? 0 : 1;
}

function buildCrossModelProfileSummaries({ vault, passport, demoMemoryAddr, limit }) {
  const profiles = [];
  for (const profile of CROSS_MODEL_PROFILES) {
    const pack = compileContextPack({
      vault,
      passport,
      provider: profile.provider,
      model: profile.model,
      query: 'memory follows me across models',
      purpose: `cross_model_demo:${profile.id}`,
      memory_addresses: [demoMemoryAddr],
      limit,
    });
    const contextPack = publicContextPackSummary(pack);
    profiles.push({
      profile: profile.id,
      label: profile.label,
      provider: profile.provider,
      model: profile.model,
      context_pack_ref: contextPack.context_pack_ref,
      context_pack_id: contextPack.context_pack_id,
      context_pack_digest: contextPack.context_pack_digest,
      context_pack: contextPack,
      receipt_count: contextPack.receipt_count,
      memory_count: contextPack.memory_count,
      provider_native_memory_canonical: false,
      receipts: contextPack.receipts,
      claim_boundaries: { ...CROSS_MODEL_CLAIM_BOUNDARIES },
    });
  }
  return profiles;
}

function renderCrossModelDemoPlain(report) {
  const profiles = Array.isArray(report.profiles) ? report.profiles : [];
  const lines = [
    'Enigma cross-model demo',
    `Status: ${report.ok ? 'Ready' : 'Needs attention'}`,
    `Profiles: ${report.profile_count ?? profiles.length}`,
    `Memories: ${report.memory_count ?? 0}`,
    `Receipts: ${report.receipt_count ?? 0}`,
    `Generated receipts: ${report.generated_receipt_count ?? 0}`,
    `Memory source: ${report.memory_source ?? 'generic_demo'}`,
    `Provider credentials: ${report.provider_credentials_required ? 'required' : 'not required'}`,
    `Provider native memory: ${report.provider_native_memory_canonical ? 'claimed' : 'not claimed'}`,
  ];
  if (report.out_written) lines.push('Report: written to <out>');
  for (const profile of profiles.slice(0, 5)) lines.push(`Profile: ${profile.label ?? profile.profile ?? 'AI app'} — ${profile.memory_count ?? 0} memory refs, ${profile.receipt_count ?? 0} receipts`);
  lines.push('Next: enigma context --bundle <bundle-path> --proof --plain');
  lines.push('Boundary: local cross-model proof demo only; no raw memory, local paths, provider calls, provider deletion, model behavior, hosted service, benchmark, or compliance claims.');
  return `${lines.join('\n')}\n`;
}

function printCrossModelDemoReport(report, flags, io) {
  if (nextPlainRequested(flags)) io.stdout.write(renderCrossModelDemoPlain(report));
  else print(report, io);
}


export async function crossModelDemoCommand(flags, io) {
  const bundleFlag = getFlag(flags, ['bundle', 'file']);
  if (bundleFlag === true || bundleFlag === '') throw new Error('Missing required --bundle.');
  const bundleWasSupplied = bundleFlag !== undefined;
  const bundleInput = bundleWasSupplied ? String(bundleFlag) : DEFAULT_CROSS_MODEL_DEMO_BUNDLE;
  const bundlePath = resolve(bundleInput);
  const out = getFlag(flags, ['out']);
  if (out === true || out === '') throw new Error('Missing required --out.');
  const outPath = out === undefined ? undefined : resolve(String(out));
  if (outPath !== undefined) ensureDistinctOutputPaths([bundlePath, outPath]);

  const memoryFileWasSupplied = getFlag(flags, ['memory-file', 'memoryFile', 'text-file', 'textFile']) !== undefined;
  let bundleCreated = false;
  let vault;
  let passport;
  let demoMemoryAddr;

  const passphrase = getFlag(flags, ['passphrase']);
  if (!bundleWasSupplied) {
    vault = createVault({
      subjectId: 'cross-model-demo-user',
      displayName: 'Cross-model demo user',
      passphrase,
    });
    passport = createPassport({ vault, subjectId: vault.subject_id, displayName: 'Cross-model demo user' });
    const remembered = remember({
      vault,
      passport,
      text: await crossModelMemoryTextFromFlags(flags),
      purpose: 'cross_model_demo_memory',
      purpose_tags: ['cross-model-demo'],
      metadata: { source: memoryFileWasSupplied ? 'local file supplied to demo' : 'generic cross-model demo memory' },
    });
    demoMemoryAddr = remembered.memory_addr;
    bundleCreated = true;
  } else {
    const existed = await fileExists(bundlePath);
    if (!existed) {
      await ensureBundle(bundlePath, flags);
      bundleCreated = true;
    }
    ({ vault, passport } = await loadState(bundlePath, { passphrase }));
    const remembered = remember({
      vault,
      passport,
      text: await crossModelMemoryTextFromFlags(flags),
      purpose: 'cross_model_demo_memory',
      purpose_tags: ['cross-model-demo'],
      metadata: { source: memoryFileWasSupplied ? 'local file supplied to demo' : 'generic cross-model demo memory' },
    });
    demoMemoryAddr = remembered.memory_addr;
  }
  const memorySource = memoryFileWasSupplied ? 'memory_file' : 'generic_demo';

  const limit = integerFlag(flags, ['limit'], 'limit', 1);
  if (limit < 1) throw new Error('--limit must be at least 1.');
  const receiptCountBeforeProfiles = Array.isArray(vault.receipts) ? vault.receipts.length : 0;
  const profiles = buildCrossModelProfileSummaries({ vault, passport, demoMemoryAddr, limit });

  const bundle = await persistState(bundlePath, vault, { passphrase: getFlag(flags, ['passphrase']) });
  const report = {
    ok: true,
    schema: 'enigma.cross_model_demo.v1',
    command: 'enigma demo cross-model',
    story: 'One local Enigma memory is packaged as public-safe context pack references and receipts for ChatGPT, Claude, Kimi, Cursor, and a local LLM. No provider is called.',
    bundle_ref: demoBundleRef(bundleWasSupplied),
    bundle_supplied: bundleWasSupplied,
    bundle_created: bundleCreated,
    demo_only_vault: !bundleWasSupplied,
    memory_source: memorySource,
    demo_memory_addr: demoMemoryAddr,
    profile_count: profiles.length,
    profiles,
    memory_count: activeMemoryCount(vault),
    receipt_count: Array.isArray(bundle.receipts) ? bundle.receipts.length : 0,
    generated_receipt_count: (Array.isArray(bundle.receipts) ? bundle.receipts.length : 0) - receiptCountBeforeProfiles,
    provider_credentials_required: false,
    provider_native_memory_canonical: false,
    out_written: outPath !== undefined,
    claim_boundaries: { ...CROSS_MODEL_CLAIM_BOUNDARIES },
  };
  if (outPath !== undefined) await writeJson(outPath, report);
  printCrossModelDemoReport(report, flags, io);
  return 0;
}

async function rememberCommand(flags, io) {
  const bundlePath = resolve(String(getFlag(flags, ['bundle', 'file'], DEFAULT_BUNDLE)));
  const { vault, passport } = await loadState(bundlePath, { passphrase: getFlag(flags, ['passphrase']) });
  const importance = parseImportanceFlag(flags);
  const result = remember({
    vault,
    passport,
    text: await memoryTextFromFlags(flags),
    importance,
    purpose: getFlag(flags, ['purpose'], 'user_memory'),
    purpose_tags: parseList(getFlag(flags, ['tags'])),
    metadata: parseJson(getFlag(flags, ['metadata']), {}),
  });
  await persistState(bundlePath, vault, { passphrase: getFlag(flags, ['passphrase']) });
  const output = { ok: true, memory_addr: result.memory_addr, receipt_id: result.receipt?.receipt_id };
  printMemoryLifecycleResult(output, 'remember', flags, io);
  return 0;
}

async function updateCommand(flags, io) {
  const bundlePath = resolve(String(getFlag(flags, ['bundle', 'file'], DEFAULT_BUNDLE)));
  const { vault, passport } = await loadState(bundlePath, { passphrase: getFlag(flags, ['passphrase']) });
  const result = updateMemory({
    vault,
    passport,
    memory_addr: requireFlag(flags, ['id', 'memory-addr'], 'id'),
    text: requireFlag(flags, ['text', 'memory'], 'text'),
    metadata: parseJson(getFlag(flags, ['metadata']), {}),
  });
  await persistState(bundlePath, vault, { passphrase: getFlag(flags, ['passphrase']) });
  const output = { ok: true, old_memory_addr: result.old_memory_addr, memory_addr: result.memory_addr, receipt_id: result.receipt?.receipt_id };
  printMemoryLifecycleResult(output, 'update', flags, io);
  return 0;
}

async function deleteCommand(flags, io) {
  const bundlePath = resolve(String(getFlag(flags, ['bundle', 'file'], DEFAULT_BUNDLE)));
  const { vault, passport } = await loadState(bundlePath, { passphrase: getFlag(flags, ['passphrase']) });
  const result = deleteMemory({
    vault,
    passport,
    memory_addr: requireFlag(flags, ['id', 'memory-addr'], 'id'),
    reason: getFlag(flags, ['reason'], 'user_delete'),
  });
  await persistState(bundlePath, vault, { passphrase: getFlag(flags, ['passphrase']) });
  const output = { ok: true, memory_addr: result.memory_addr, receipt_id: result.receipt?.receipt_id };
  printMemoryLifecycleResult(output, 'delete', flags, io);
  return 0;
}

async function recallCommand(flags, io) {
  const bundleInput = String(getFlag(flags, ['bundle', 'file'], DEFAULT_BUNDLE));
  const bundlePath = resolve(bundleInput);
  const includeContent = booleanFlag(flags, ['include-content', 'content'], false);
  const { vault, passport } = await loadState(bundlePath, { passphrase: getFlag(flags, ['passphrase']) });
  const result = recall({
    vault,
    passport,
    memory_addr: requireFlag(flags, ['id', 'memory-addr', 'memory_addr', 'memoryAddr'], 'id'),
    purpose: getFlag(flags, ['purpose'], 'cli_recall'),
    actor_id: getFlag(flags, ['actor-id', 'actorId']),
    policy_id: getFlag(flags, ['policy-id', 'policyId']),
  });
  await persistState(bundlePath, vault, { passphrase: getFlag(flags, ['passphrase']) });
  const output = memoryRecallReport({ bundleInput, result, includeContent });
  printRecallReport(output, flags, io);
  return 0;
}


function contextRecallScopeFromFlags(flags) {
  return {
    app_ref: getFlag(flags, ['app-ref', 'appRef'], 'ref:app:cli'),
    purpose_ref: getFlag(flags, ['purpose-ref', 'purposeRef'], 'ref:purpose:cli_context'),
    operation: 'recall_context',
    memory_zone_ref: getFlag(flags, ['memory-zone-ref', 'memoryZoneRef'], 'ref:zone:default'),
    policy_ref: getFlag(flags, ['policy-ref', 'policyRef'], 'ref:policy:cli-context'),
  };
}

async function contextGrantInputsFromFlags(flags) {
  const grants = [];
  for (const value of rawFlagValues(flags, ['grant'])) pushGrantArtifacts(grants, await parseJsonFlagValue(value, 'grant'), 'grant');
  for (const value of rawFlagValues(flags, ['grants'])) pushGrantArtifacts(grants, await parseJsonFlagValue(value, 'grants'), 'grants');
  for (const value of rawFlagValues(flags, ['grant-file', 'grantFile'])) pushGrantArtifacts(grants, await readJsonFlagValue(value, 'grant-file'), 'grant-file');
  for (const value of rawFlagValues(flags, ['grants-file', 'grantsFile'])) pushGrantArtifacts(grants, await readJsonFlagValue(value, 'grants-file'), 'grants-file');
  return {
    grant: grants[0],
    grants: grants.slice(1),
    grantProvided: grants.length > 0,
  };
}

function contextRecallDecisionFromFlags(flags, grantInputs, candidateCount) {
  return createRecallVetoDecision({
    grant: grantInputs.grant,
    grants: grantInputs.grants,
    ...contextRecallScopeFromFlags(flags),
    candidate_count: candidateCount,
    now: getFlag(flags, ['now'], new Date().toISOString()),
  });
}

function blockedCliContextPack(decision) {
  return assertMemoryControllerPublicSafe({
    schema: 'enigma.context_pack_recall_blocked.v1',
    ok: false,
    context_pack_returned: false,
    memory_count: 0,
    recall_veto: decision,
    private_payload_returned: false,
    claim_boundaries: {
      local_only: true,
      provider_deletion_proof: false,
      model_forgetting_proof: false,
      hosted_saas_live: false,
    },
  });
}

function renderContextPlain(output) {
  const schema = output?.schema ?? 'enigma.context_pack.v1';
  const memoryCount = output?.context_pack_summary?.memory_count
    ?? output?.memory_count
    ?? (Array.isArray(output?.memories) ? output.memories.length : 0);
  const receiptCount = output?.context_pack_summary?.receipt_count
    ?? output?.receipt_count
    ?? (Array.isArray(output?.receipts) ? output.receipts.length : 0);
  const returned = output?.context_pack_returned === false ? 'blocked' : 'returned';
  const controller = output?.recall_veto ?? output?.memory_controller?.recall_veto;
  const lines = [
    'Enigma context',
    `Status: ${output?.ok === false ? 'Needs attention' : 'Ready'}`,
    `Context: ${returned}`,
    `Schema: ${schema}`,
    `Memories: ${memoryCount}`,
    `Receipts: ${receiptCount}`,
  ];
  if (schema === 'enigma.context_proof_bundle.v1') lines.push('Proof summary: local context selection and not-shared/tombstoned Enigma memories are accounted for.');
  if (controller?.decision) lines.push(`Controller: ${controller.decision}`);
  if (Array.isArray(controller?.reason_codes) && controller.reason_codes.length > 0) lines.push(`Reason: ${controller.reason_codes.join(', ')}`);
  lines.push('Boundary: local Enigma context only; no raw memory in plain output, local paths, provider deletion, provider non-use, model behavior, or hosted service claims.');
  return `${lines.join('\n')}\n`;
}

function printContextOutput(output, flags, io) {
  if (nextPlainRequested(flags)) io.stdout.write(renderContextPlain(output));
  else print(output, io);
}

async function contextCommand(flags, io) {
  const bundlePath = resolve(String(getFlag(flags, ['bundle', 'file'], DEFAULT_BUNDLE)));
  const { vault, passport } = await loadState(bundlePath, { passphrase: getFlag(flags, ['passphrase']) });
  const query = getFlag(flags, ['query', 'q'], '');
  const optimize = getFlag(flags, ['optimize']) === true
    || getFlag(flags, ['optimize']) === 'true'
    || String(query).trim().length > 0;
  const includeUnrelated = booleanFlag(flags, ['include-unrelated', 'includeUnrelated', 'no-strict-relevance', 'noStrictRelevance'], false);
  const strictRelevance = String(query).trim().length > 0 && !includeUnrelated;
  const grantInputs = await contextGrantInputsFromFlags(flags);
  const grantRequired = booleanFlag(flags, ['require-grant', 'requireGrant'], false);
  if (grantRequired || grantInputs.grantProvided) {
    const preflightDecision = contextRecallDecisionFromFlags(flags, grantInputs, 0);
    if (preflightDecision.safe_to_share !== true) {
      printContextOutput(blockedCliContextPack(preflightDecision), flags, io);
      return 0;
    }
  }
  const pack = compileContextPack({
    vault,
    passport,
    query,
    purpose: getFlag(flags, ['purpose'], 'local_context'),
    limit: Number(getFlag(flags, ['limit'], 8)),
    optimize,
    strict_relevance: strictRelevance,
    max_estimated_tokens: parseOptionalNumber(getFlag(flags, ['max-estimated-tokens', 'maxEstimatedTokens'])),
    price_per_million_tokens: parseOptionalNumber(getFlag(flags, ['price-per-million-tokens', 'pricePerMillionTokens'])),
    currency: getFlag(flags, ['currency']),
  });
  if (grantRequired || grantInputs.grantProvided) {
    const recallVeto = contextRecallDecisionFromFlags(flags, grantInputs, Array.isArray(pack.memories) ? pack.memories.length : 0);
    if (recallVeto.safe_to_share !== true) {
      printContextOutput(blockedCliContextPack(recallVeto), flags, io);
      return 0;
    }
    pack.memory_controller = {
      context_pack_returned: true,
      recall_veto: recallVeto,
    };
  }
  await persistState(bundlePath, vault, { passphrase: getFlag(flags, ['passphrase']) });
  const withProof = booleanFlag(flags, ['proof', 'with-proof', 'withProof'], false);
  const output = withProof
    ? {
      ok: true,
      schema: 'enigma.context_proof_bundle.v1',
      context_pack_ref: contextPackPublicDigest(pack),
      context_pack_summary: publicContextPackSummary(pack),
      memory_controller: pack.memory_controller,
      context_passport: createContextPassport({ contextPack: pack, passport, vault, query, now: getFlag(flags, ['now']) }),
      proof_of_non_use: createProofOfNonUse({ contextPack: pack, passport, vault, query, now: getFlag(flags, ['now']) }),
      claim_boundaries: {
        local_enigma_vault_only: true,
        provider_deletion_claim: false,
        provider_non_use_claim: false,
        model_forgetting_claim: false,
        raw_memory_printed: false,
      },
    }
    : pack;
  const out = getFlag(flags, ['out']);
  if (out && out !== true) await writeJson(resolve(String(out)), output);
  printContextOutput(output, flags, io);
  return 0;
}


function memorySearchReport({ bundlePath, vault, query, limit, includeContent = false, includeUnrelated = false, now = '2026-01-01T00:00:00.000Z' }) {
  const roots = vault.__computeRoots();
  const queryTokens = searchTokensFrom(query);
  const { candidates, byAddress } = searchCandidates(vault, queryTokens, includeUnrelated);
  const plan = createMemoryOptimizationPlan({
    candidates,
    prompt: query,
    now,
  });
  const planIndex = new Map(plan.items.map((item, index) => [item.address, index]));
  const selectedItems = plan.items
    .filter((item) => byAddress.has(item.address))
    .sort((left, right) => {
      const scoreDiff = byAddress.get(right.address).score - byAddress.get(left.address).score;
      if (scoreDiff !== 0) return scoreDiff;
      return planIndex.get(left.address) - planIndex.get(right.address);
    })
    .slice(0, limit);
  const accessReceipts = selectedItems.map((item, index) => createMemoryAccessReceipt({
    item,
    plan,
    sequence: index,
    timestamp: null,
    pricing: plan.pricing,
  }));
  const accessReceiptByAddress = new Map(accessReceipts.map((receipt) => [receipt.address, publicAccessReceiptRef(receipt)]));
  const results = selectedItems.map((item) => {
    const hit = byAddress.get(item.address);
    const record = hit.record;
    const accessReceipt = accessReceiptByAddress.get(item.address);
    return {
      memory_ref: `enigma://memory/${item.address}`,
      memory_addr: item.address,
      address: item.address,
      kind: record.kind,
      sensitivity: record.sensitivity,
      tags: Array.isArray(record.purpose_tags) ? [...record.purpose_tags] : [],
      purpose_tags: Array.isArray(record.purpose_tags) ? [...record.purpose_tags] : [],
      score: hit.score,
      tier: item.tier,
      receipt_ids: searchResultReceiptIds(vault, item.address),
      access_receipt_ref: accessReceipt?.access_receipt_ref,
      access_receipt_id: accessReceipt?.receipt_id,
      access_receipt_refs: accessReceipt?.access_receipt_ref ? [accessReceipt.access_receipt_ref] : [],
      content_redacted: !includeContent,
      ...(includeContent ? { content: hit.content } : {}),
    };
  });
  return {
    ok: true,
    schema: 'enigma.memory_search.v1',
    bundle: bundlePath,
    query_redacted: true,
    strict_relevance: !includeUnrelated,
    limit,
    result_count: results.length,
    results,
    access_receipts: accessReceipts.map(publicAccessReceiptRef),
    active_set_root: roots.active_set_root,
    receipt_log_root: roots.receipt_log_root,
    claim_boundary: includeContent
      ? 'Search ran against the selected local bundle and includes plaintext only because --include-content was explicit; this does not prove provider deletion, provider-native memory state, or model forgetting.'
      : 'Search ran against the selected local bundle and redacts plaintext by default; refs, scores, tags, roots, and receipt refs are not provider deletion proof or model forgetting proof.',
  };
}

function renderSearchPlain(report) {
  const lines = [
    'Enigma search',
    `Results: ${report.result_count ?? 0}`,
    `Limit: ${report.limit ?? 0}`,
    `Strict relevance: ${report.strict_relevance ? 'on' : 'off'}`,
    `Plaintext: ${report.results?.some((item) => item.content_redacted === false) ? 'included by explicit opt-in' : 'redacted'}`,
  ];
  const results = Array.isArray(report.results) ? report.results.slice(0, 3) : [];
  for (let index = 0; index < results.length; index += 1) {
    const item = results[index];
    lines.push(`Result ${index + 1}: score ${item.score ?? 0}, kind ${item.kind ?? 'memory'}, ref ${item.memory_ref ?? '<memory-ref>'}`);
  }
  lines.push('Boundary: local Enigma search only; no raw memory by default, local paths, provider deletion, model behavior, hosted service, or compliance claims.');
  return `${lines.join('\n')}\n`;
}

function printSearchReport(report, flags, io) {
  if (nextPlainRequested(flags)) io.stdout.write(renderSearchPlain(report));
  else print(report, io);
}


async function searchCommand(flags, io) {
  const bundlePath = resolve(String(getFlag(flags, ['bundle', 'file'], DEFAULT_BUNDLE)));
  const query = String(requireFlag(flags, ['query', 'q'], 'query'));
  const limit = integerFlag(flags, ['limit'], 'limit', 8);
  if (limit < 0) throw new Error('--limit must be non-negative.');
  const includeContent = getFlag(flags, ['include-content', 'includeContent']) === true || getFlag(flags, ['include-content', 'includeContent']) === 'true';
  const includeUnrelated = booleanFlag(flags, ['include-unrelated', 'includeUnrelated', 'no-strict-relevance', 'noStrictRelevance'], false);
  const { vault } = await loadState(bundlePath, { passphrase: getFlag(flags, ['passphrase']) });
  const report = memorySearchReport({
    bundlePath,
    vault,
    query,
    limit,
    includeContent,
    includeUnrelated,
    now: getFlag(flags, ['now'], '2026-01-01T00:00:00.000Z'),
  });
  printSearchReport(report, flags, io);
  return 0;
}

function firstRunStatusSummary({ bundlePath, activeCount, tombstoneCount, receiptCount }) {
  const hasMemory = activeCount > 0;
  const bundleDisplay = publicPathDisplay(bundlePath, 'bundle-path');
  const state = hasMemory ? 'ready_for_app_connection' : 'needs_first_memory';
  return {
    schema: 'enigma.first_run_status.v1',
    state,
    ready: hasMemory,
    bundle: bundleDisplay,
    primary_action: hasMemory
      ? {
        id: 'connect_ai_app',
        label: 'Preview AI app connection',
        command: 'enigma connect <client> --bundle "<bundle-path>" --dry-run',
      }
      : {
        id: 'import_or_remember_first_memory',
        label: 'Remember first memory',
        command: 'enigma remember --bundle "<bundle-path>" --text-file <memories.md> --plain',
      },
    lanes: {
      memory_drive: { status: 'ready', label: 'Memory Drive exists' },
      import_sandbox: {
        status: 'ready',
        label: 'Import Sandbox ready',
        next_action: hasMemory ? 'optional_preview_more_imports' : 'preview_text_or_markdown_import',
      },
      memory_inventory: {
        status: hasMemory ? 'has_memory' : 'empty',
        active_count: activeCount,
        tombstone_count: tombstoneCount,
      },
      proof_activity: {
        status: receiptCount > 0 ? 'has_receipts' : 'empty',
        receipt_count: receiptCount,
      },
      diagnostics: {
        status: 'available',
        command: `enigma doctor --bundle "${bundleDisplay}"`,
      },
    },
    claim_boundaries: {
      local_enigma_status_only: true,
      raw_memory_returned: false,
      local_paths_redacted: true,
      provider_deletion_proof: false,
      model_forgetting_proof: false,
      hosted_saas_live: false,
    },
  };
}

function passportStatusReport({ bundlePath, stored = {}, vault, passport }) {
  const roots = vault.__computeRoots();
  const activeCount = activeMemoryCount(vault);
  const tombstoneCount = vault.tombstones instanceof Map ? vault.tombstones.size : 0;
  const receiptCount = Array.isArray(vault.receipts) ? vault.receipts.length : 0;
  return {
    ok: true,
    schema: 'enigma.passport_status.v1',
    bundle: bundlePath,
    passport_ref: `enigma://passport/${passport.passport_id}`,
    owner: {
      subject_id: stored.owner?.subject_id ?? stored.passport?.owner?.subject_id ?? stored.vault?.subject_id ?? passport.owner?.subject_id ?? vault.subject_id,
      display_name: stored.owner?.display_name ?? stored.passport?.owner?.display_name ?? stored.vault?.display_name ?? passport.owner?.display_name ?? 'Local user',
    },
    counts: {
      active_memories: activeCount,
      tombstoned_memories: tombstoneCount,
      receipts: receiptCount,
    },
    active_memory_count: activeCount,
    tombstoned_memory_count: tombstoneCount,
    receipt_count: receiptCount,
    active_set_root: roots.active_set_root,
    receipt_log_root: roots.receipt_log_root,
    connector_readiness: connectorReadinessSummary(bundlePath),
    first_run_status: firstRunStatusSummary({ bundlePath, activeCount, tombstoneCount, receiptCount }),
    next_recommended_commands: [
      `enigma remember --bundle "${bundlePath}" --text-file <path>`,
      `enigma search --bundle "${bundlePath}" --query <text>`,
      `enigma context --bundle "${bundlePath}" --query <text>`,
      `enigma verify --bundle "${bundlePath}"`,
      `enigma connect <client> --bundle "${bundlePath}" --dry-run`,
    ],
    claim_boundary: 'Status reports local bundle counters, owner display fields, connector readiness hints, and commitment roots only; it does not expose raw memory, certify compliance, prove provider deletion, or prove model forgetting.',
  };
}

async function statusCommand(flags, io) {
  const bundlePath = resolve(String(getFlag(flags, ['bundle', 'file'], DEFAULT_BUNDLE)));
  const { stored, vault, passport } = await loadState(bundlePath, { passphrase: getFlag(flags, ['passphrase']) });
  const report = passportStatusReport({ bundlePath, stored, vault, passport });
  printStatusSummary(report, flags, io);
  return 0;
}

function memoryRecallReport({ bundleInput, result, includeContent = false }) {
  const memory = result.memory && typeof result.memory === 'object' ? result.memory : {};
  const receiptRef = result.receipt ? publicAccessReceiptRef(result.receipt) : null;
  return {
    ok: true,
    schema: 'enigma.memory_recall.v1',
    bundle: publicPathDisplay(bundleInput, 'bundle-path'),
    memory_addr: result.memory_addr,
    memory_ref: result.memory_addr ? `enigma://memory/${result.memory_addr}` : '<memory-ref>',
    kind: memory.kind ?? 'memory',
    sensitivity: memory.sensitivity ?? 'unknown',
    content_hash: memory.content_hash,
    content_commitment: memory.content_commitment,
    content_redacted: !includeContent,
    content: includeContent ? result.content : undefined,
    receipt_id: result.receipt?.receipt_id,
    access_receipt_ref: receiptRef,
    claim_boundary: includeContent
      ? 'Recall returned plaintext only because --include-content was explicit; this does not prove provider deletion, provider-native memory state, or model forgetting.'
      : 'Recall redacts plaintext by default; refs, commitments, and receipt refs are not provider deletion proof or model forgetting proof.',
  };
}

function renderRecallPlain(report) {
  const lines = [
    'Enigma recall',
    `Status: ${report.ok ? 'Ready' : 'Needs attention'}`,
    `Memory: ${report.memory_ref ?? '<memory-ref>'}`,
    `Plaintext: ${report.content_redacted === false ? 'included by explicit opt-in' : 'redacted'}`,
    `Kind: ${report.kind ?? 'memory'}`,
    `Sensitivity: ${report.sensitivity ?? 'unknown'}`,
  ];
  if (report.receipt_id) lines.push(`Receipt: ${report.receipt_id}`);
  if (report.access_receipt_ref?.access_receipt_ref) lines.push(`Access: ${report.access_receipt_ref.access_receipt_ref}`);
  lines.push('Next: enigma context --bundle <bundle-path> --query <text>');
  lines.push('Boundary: local Enigma recall only; no raw memory in plain output, local paths, provider deletion, model behavior, hosted service, or compliance claims.');
  return `${lines.join('\n')}\n`;
}

function printRecallReport(report, flags, io) {
  if (nextPlainRequested(flags)) io.stdout.write(renderRecallPlain(report));
  else print(report, io);
}

function renderMemoryLifecyclePlain(result, operation) {
  const lines = [
    `Enigma ${operation}`,
    `Status: ${result.ok ? 'Ready' : 'Needs attention'}`,
    `Memory: ${result.memory_addr ? `enigma://memory/${result.memory_addr}` : '<memory-ref>'}`,
  ];
  if (result.old_memory_addr) lines.push(`Previous: enigma://memory/${result.old_memory_addr}`);
  if (result.receipt_id) lines.push(`Receipt: ${result.receipt_id}`);
  if (operation === 'remember') lines.push('Next: enigma search --bundle <bundle-path> --query <text>');
  else if (operation === 'update') lines.push('Next: enigma context --bundle <bundle-path> --query <text>');
  else if (operation === 'delete') lines.push('Next: enigma drive health --bundle <bundle-path>');
  lines.push('Boundary: local Enigma memory lifecycle only; no raw memory, local paths, provider deletion, model behavior, or hosted service claims.');
  return `${lines.join('\n')}\n`;
}

function printMemoryLifecycleResult(result, operation, flags, io) {
  if (nextPlainRequested(flags)) io.stdout.write(renderMemoryLifecyclePlain(result, operation));
  else print(result, io);
}

function renderExportPlain(result) {
  const lines = [
    'Enigma export',
    `Status: ${result.ok ? 'Ready' : 'Needs attention'}`,
    `Receipts: ${result.receipt_count ?? 0}`,
    'Export: <export-file>',
  ];
  lines.push('Boundary: local Enigma export only; plaintext is excluded, local paths are redacted, and this is not provider deletion, model behavior, hosted service, or compliance proof.');
  return `${lines.join('\n')}\n`;
}

function printExportResult(result, flags, io) {
  if (nextPlainRequested(flags)) io.stdout.write(renderExportPlain(result));
  else print(result, io);
}

function renderVerifyPlain(report) {
  const errors = Array.isArray(report.errors) ? report.errors : [];
  const lines = [
    'Enigma verify',
    `Status: ${report.ok ? 'Ready' : 'Needs attention'}`,
    `Receipts: ${report.receipt_count ?? 0}`,
    `Checkpoints: ${report.checkpoint_count ?? 0}`,
    `Errors: ${errors.length}`,
  ];
  for (const error of errors.slice(0, 3)) lines.push(`Issue: ${error.code ?? 'VERIFY_ERROR'}`);
  lines.push('Boundary: local offline receipt verification only; no raw memory, local paths, provider deletion, model behavior, hosted service, or compliance claims.');
  return `${lines.join('\n')}\n`;
}

function printVerifyReport(report, flags, io) {
  if (nextPlainRequested(flags)) io.stdout.write(renderVerifyPlain(report));
  else print(report, io);
}

function renderControllerGrantPlain(grant, action, outWritten) {
  const operations = Array.isArray(grant.operations) ? grant.operations : [];
  const zones = Array.isArray(grant.memory_zone_refs) ? grant.memory_zone_refs : [];
  const lines = [
    `Enigma controller ${action}`,
    `Status: ${grant.status ?? 'active'}`,
    `Grant: ${grant.grant_ref ?? '<grant-ref>'}`,
    `App: ${grant.app_ref ?? '<app-ref>'}`,
    `Purpose: ${grant.purpose_ref ?? '<purpose-ref>'}`,
    `Policy: ${grant.policy_ref ?? '<policy-ref>'}`,
    `Operations: ${operations.length === 0 ? 'none' : operations.join(', ')}`,
    `Memory zones: ${zones.length === 0 ? 'none' : zones.join(', ')}`,
  ];
  if (grant.expires_at) lines.push(`Expires: ${grant.expires_at}`);
  if (outWritten) lines.push('Grant file: written to <out>');
  lines.push('Boundary: public-safe local consent grant only; no raw memory, local paths, provider calls, provider deletion, model behavior, hosted service, or compliance claims.');
  return `${lines.join('\n')}\n`;
}

function printControllerGrantResult(grant, action, flags, io, outWritten = false) {
  if (nextPlainRequested(flags)) io.stdout.write(renderControllerGrantPlain(grant, action, outWritten));
  else print(grant, io);
}

function renderControllerWeatherPlain(report, outWritten = false) {
  const tiles = Array.isArray(report.tiles) ? report.tiles : [];
  const issues = Array.isArray(report.issue_codes) ? report.issue_codes : [];
  const lines = [
    'Enigma memory weather',
    `Status: ${report.status ?? 'unknown'}`,
    `Generated: ${report.generated_at ?? '<generated-at>'}`,
    `Tiles: ${tiles.length}`,
    `Issues: ${issues.length === 0 ? 'none' : issues.join(', ')}`,
    `Next: ${report.next_action ?? 'none'}`,
  ];
  if (outWritten) lines.push('Weather report: written to <out>');
  lines.push('Boundary: public-safe local memory weather only; no raw memory, local paths, provider calls, provider deletion, model behavior, hosted service, benchmark, or compliance claims.');
  return `${lines.join('\n')}\n`;
}

function printControllerWeatherResult(report, flags, io, outWritten = false) {
  if (nextPlainRequested(flags)) io.stdout.write(renderControllerWeatherPlain(report, outWritten));
  else print(report, io);
}

function renderControllerBubblePlain(bubble, action, outWritten = false) {
  const appRefs = Array.isArray(bubble.app_refs) ? bubble.app_refs : [];
  const lines = [
    `Enigma private memory bubble ${action}`,
    `Status: ${bubble.status ?? 'unknown'}`,
    `Bubble: ${bubble.bubble_ref ?? '<bubble-ref>'}`,
    `Apps: ${appRefs.length}`,
    `Purpose: ${bubble.purpose_ref ?? '<purpose-ref>'}`,
    `Candidates: ${bubble.candidate_count ?? 0}`,
    `Kept: ${bubble.kept_count ?? 0}`,
    `Discarded: ${bubble.discarded_count ?? 0}`,
  ];
  if (bubble.closed_at) lines.push(`Closed: ${bubble.closed_at}`);
  if (outWritten) lines.push('Bubble file: written to <out>');
  lines.push('Boundary: public-safe local private-bubble receipt only; no raw memory, local paths, provider calls, provider deletion, model behavior, hosted service, benchmark, or compliance claims.');
  return `${lines.join('\n')}\n`;
}

function printControllerBubbleResult(bubble, action, flags, io, outWritten = false) {
  if (nextPlainRequested(flags)) io.stdout.write(renderControllerBubblePlain(bubble, action, outWritten));
  else print(bubble, io);
}

function renderNativeHostManifestPlain(summary) {
  const lines = [
    'Enigma native host manifest',
    `Status: ${summary.ok ? 'Ready' : 'Needs attention'}`,
    `Browser: ${summary.browser ?? '<browser>'}`,
    `Host: ${summary.host_name ?? 'com.enigma.native_host'}`,
    `Allowed apps: ${summary.allowed_app_count ?? 0}`,
  ];
  if (summary.out_written) lines.push('Manifest: written to <out>');
  else lines.push('Manifest: generated; write with --out <manifest.json>');
  lines.push(`Next: enigma native-host install-plan --browser ${summary.browser ?? '<browser>'} --manifest <manifest-path> --plain`);
  lines.push('Boundary: local native-host manifest planning only; no browser registration writes, raw memory, local paths, provider calls, provider deletion, model behavior, hosted service, or signing claims.');
  return `${lines.join('\n')}\n`;
}

function printNativeHostManifestResult(summary, flags, io) {
  if (nextPlainRequested(flags)) io.stdout.write(renderNativeHostManifestPlain(summary));
  else print(summary.result, io);
}

function renderNativeHostInstallPlanPlain(plan) {
  const lines = [
    'Enigma native host install plan',
    'Status: Ready',
    `Browser: ${plan.browser ?? '<browser>'}`,
    `OS: ${plan.os ?? '<os>'}`,
    `Writes performed: ${plan.writes_performed === true ? 'yes' : 'no'}`,
    `Registration targets: ${Array.isArray(plan.target_manifest_paths) ? plan.target_manifest_paths.length : 0}`,
    `Registry commands: ${Array.isArray(plan.registry_command_preview) ? plan.registry_command_preview.length : 0}`,
  ];
  lines.push('Next: copy <manifest-path> to the browser native messaging host location shown in JSON mode, or use the desktop app when signed installers are available.');
  lines.push('Boundary: local native-host registration plan only; no registry writes, filesystem writes, raw memory, local paths, provider calls, provider deletion, model behavior, hosted service, or signing claims.');
  return `${lines.join('\n')}\n`;
}

function printNativeHostInstallPlan(plan, flags, io) {
  if (nextPlainRequested(flags)) io.stdout.write(renderNativeHostInstallPlanPlain(plan));
  else print(plan, io);
}


function printClaudeMcpbPackageReport(report, flags, io, outWritten = false) {
  if (nextPlainRequested(flags)) io.stdout.write(renderClaudeMcpbPackagePlain(report, outWritten));
  else print(report, io);
}




function renderInstallPlain(summary) {
  const clients = Array.isArray(summary.clients) ? summary.clients : [];
  const firstClient = clients[0]?.client_id ?? '<client>';
  const lines = [
    'Enigma install',
    `Status: ${summary.ok ? 'Ready' : 'Needs attention'}`,
    'Memory Drive: <bundle-path>',
    `Bundle: ${summary.bundle_created ? 'created' : 'already existed'}`,
    `Clients: ${clients.length}`,
    `MCP command: ${summary.mcp_command ?? 'enigma-mcp'}`,
  ];
  if (summary.out) lines.push('Snippets: written to <out>');
  lines.push(`Next: enigma connect ${firstClient} --bundle <bundle-path> --dry-run`);
  lines.push('Boundary: local install snippet planning only; no raw memory, local paths, provider launch, provider deletion, model behavior, hosted service, or signing claims.');
  return `${lines.join('\n')}\n`;
}

function printInstallSummary(summary, flags, io) {
  if (nextPlainRequested(flags)) io.stdout.write(renderInstallPlain(summary));
  else print(summary, io);
}


function renderCapsuleExportPlain(result) {
  const artifacts = result.public_artifacts ?? {};
  const lines = [
    'Enigma capsule export',
    `Status: ${result.ok ? 'Ready' : 'Needs attention'}`,
    `Capsule: ${result.capsule_id ?? '<capsule-id>'}`,
    `Manifest root: ${artifacts.active_set_root ?? '<active-set-root>'}`,
    `Receipt root: ${artifacts.receipt_log_root ?? '<receipt-log-root>'}`,
    `Candidates: ${result.verifier_metadata?.candidate_count ?? 0}`,
    `Custody: ${result.verifier_metadata?.custody_status ?? '<custody-status>'}`,
    'Capsule file: written to <out>',
  ];
  lines.push('Boundary: public-safe local import capsule export only; no raw memory, local paths, provider calls, provider deletion, model behavior, hosted service, benchmark, or compliance claims.');
  return `${lines.join('\n')}\n`;
}

function printCapsuleExportResult(result, flags, io) {
  if (nextPlainRequested(flags)) io.stdout.write(renderCapsuleExportPlain(result));
  else print(result, io);
}

function renderCapsuleImportPlain(result) {
  const lines = [
    'Enigma capsule import',
    `Status: ${result.ok ? 'Ready' : 'Needs attention'}`,
    `Vault writes: ${Array.isArray(result.vault_writes) ? result.vault_writes.length : result.vault_write_count ?? 0}`,
    `Limitations: ${Array.isArray(result.limitations) && result.limitations.length ? result.limitations.join(', ') : 'none'}`,
  ];
  if (result.bundle_written) lines.push('Memory Drive: updated');
  else lines.push('Memory Drive: not written');
  lines.push('Boundary: public-safe local import capsule verification only; no raw memory, local paths, provider calls, provider deletion, model behavior, hosted service, benchmark, or compliance claims.');
  return `${lines.join('\n')}\n`;
}

function printCapsuleImportResult(result, flags, io) {
  if (nextPlainRequested(flags)) io.stdout.write(renderCapsuleImportPlain(result));
  else print(result, io);
}

function renderMeterEventPlain(event, outWritten = false) {
  const usage = event.usage ?? {};
  const cost = event.estimated_cost ?? {};
  const lines = [
    'Enigma meter event',
    'Status: Ready',
    `Event: ${event.event_id ?? '<event-id>'}`,
    `Provider/model: ${event.provider ?? '<provider>'}/${event.model ?? '<model>'}`,
    `Prompt tokens: ${usage.prompt_tokens ?? 0}`,
    `Completion tokens: ${usage.completion_tokens ?? 0}`,
    `Memory baseline tokens: ${usage.memory_baseline_tokens ?? 0}`,
    `Memory optimized tokens: ${usage.memory_optimized_tokens ?? 0}`,
    `Deterministic memory token delta: ${usage.memory_savings_tokens ?? 0}`,
    `Estimated deterministic credit: ${cost.currency ?? 'USD'} ${Number(cost.estimated_memory_credit ?? 0).toFixed(6)}`,
  ];
  if (outWritten) lines.push('Usage event: written to <out>');
  lines.push('Boundary: local deterministic usage metering only; no prompts, completions, provider responses, credentials, token ROI, provider invoice savings, provider deletion, model behavior, hosted service, or compliance claims.');
  return `${lines.join('\n')}\n`;
}

function printMeterEventResult(event, flags, io, outWritten = false, jsonResult = event) {
  if (nextPlainRequested(flags)) io.stdout.write(renderMeterEventPlain(event, outWritten));
  else print(jsonResult, io);
}

function renderMeterAggregatePlain(aggregate, outWritten = false) {
  const totals = aggregate.totals ?? {};
  const lines = [
    'Enigma meter aggregate',
    'Status: Ready',
    `Aggregate: ${aggregate.aggregate_id ?? '<aggregate-id>'}`,
    `Events: ${aggregate.event_count ?? 0}`,
    `Provider/model groups: ${Array.isArray(aggregate.by_provider_model) ? aggregate.by_provider_model.length : 0}`,
    `Memory baseline tokens: ${totals.memory_baseline_tokens ?? 0}`,
    `Memory optimized tokens: ${totals.memory_optimized_tokens ?? 0}`,
    `Deterministic memory token delta: ${totals.memory_savings_tokens ?? 0}`,
    `Estimated deterministic credit: ${totals.currency ?? 'USD'} ${Number(totals.estimated_memory_credit ?? 0).toFixed(6)}`,
  ];
  if (outWritten) lines.push('Usage aggregate: written to <out>');
  lines.push('Boundary: local deterministic aggregate metering only; no prompts, completions, provider responses, credentials, token ROI, provider invoice savings, provider deletion, model behavior, hosted service, or compliance claims.');
  return `${lines.join('\n')}\n`;
}

function printMeterAggregateResult(aggregate, flags, io, outWritten = false, jsonResult = aggregate) {
  if (nextPlainRequested(flags)) io.stdout.write(renderMeterAggregatePlain(aggregate, outWritten));
  else print(jsonResult, io);
}

function renderSettlementArtifactPlain(kind, artifact, outWritten = false) {
  const lines = [
    `Enigma settlement ${kind}`,
    'Status: Ready',
  ];
  if (kind === 'job') {
    lines.push(`Job: ${artifact.job_id ?? '<job-id>'}`);
    lines.push(`Type: ${artifact.job_type ?? '<job-type>'}`);
    lines.push(`Max price: ${artifact.max_price?.amount ?? 0} ${artifact.max_price?.asset ?? '<asset>'}`);
  } else if (kind === 'capacity') {
    lines.push(`Operator: ${artifact.operator_id ?? '<operator>'}`);
    lines.push(`Accelerator: ${artifact.accelerator_class ?? '<accelerator-class>'}`);
    lines.push(`Models: ${Array.isArray(artifact.model_refs) ? artifact.model_refs.length : 0}`);
    lines.push(`Price: ${artifact.price_per_million_context_tokens?.amount ?? 0} ${artifact.price_per_million_context_tokens?.asset ?? '<asset>'} per million context tokens`);
  } else if (kind === 'quote') {
    lines.push(`Quote: ${artifact.quote_id ?? '<quote-id>'}`);
    lines.push(`Service: ${artifact.service_kind ?? '<service-kind>'}`);
    lines.push(`Price: ${artifact.price?.amount ?? 0} ${artifact.price?.asset ?? '<asset>'}`);
  } else if (kind === 'receipt') {
    lines.push(`Receipt: ${artifact.settlement_receipt_id ?? '<receipt-id>'}`);
    lines.push(`Service: ${artifact.service_kind ?? '<service-kind>'}`);
    lines.push(`Settled: ${artifact.settled_price?.amount ?? 0} ${artifact.settled_price?.asset ?? '<asset>'}`);
  } else if (kind === 'batch') {
    lines.push(`Batch: ${artifact.batch_id ?? '<batch-id>'}`);
    lines.push(`Receipts: ${artifact.receipt_count ?? 0}`);
    lines.push(`Total settled: ${artifact.total_settled_amount ?? 0} ${artifact.asset ?? '<asset>'}`);
  }
  if (outWritten) lines.push(`${kind[0].toUpperCase()}${kind.slice(1)} file: written to <out>`);
  lines.push('Boundary: local settlement artifact only; no raw memory, prompts, provider responses, credentials, token ROI, token profit, provider invoice savings, decentralized raw-memory inference, provider deletion, model behavior, hosted service, or compliance claims.');
  return `${lines.join('\n')}\n`;
}

function printSettlementArtifact(kind, artifact, flags, io, outWritten = false, jsonResult = artifact) {
  if (nextPlainRequested(flags)) io.stdout.write(renderSettlementArtifactPlain(kind, artifact, outWritten));
  else print(jsonResult, io);
}

function renderSettlementVerifyPlain(result) {
  const errors = Array.isArray(result.errors) ? result.errors : [];
  const lines = [
    'Enigma settlement verify',
    `Status: ${result.ok ? 'Ready' : 'Needs attention'}`,
    `Errors: ${errors.length}`,
  ];
  for (const error of errors.slice(0, 3)) lines.push(`Issue: ${error}`);
  lines.push('Boundary: local settlement receipt verification only; no raw memory, prompts, provider responses, credentials, token ROI, token profit, provider invoice savings, provider deletion, model behavior, hosted service, or compliance claims.');
  return `${lines.join('\n')}\n`;
}

function printSettlementVerifyResult(result, flags, io) {
  if (nextPlainRequested(flags)) io.stdout.write(renderSettlementVerifyPlain(result));
  else print(result, io);
}

function nextPlainRequested(flags) {
  const format = getFlag(flags, ['format']);
  return booleanFlag(flags, ['plain', 'text'], false) || format === 'plain' || format === 'text';
}

function renderStatusPlain(report) {
  const counts = report.counts ?? {};
  const lines = [
    'Enigma status',
    `Memory Drive: <bundle-path>`,
    `Active memories: ${counts.active_memories ?? report.active_memory_count ?? 0}`,
    `Tombstones: ${counts.tombstoned_memories ?? report.tombstoned_memory_count ?? 0}`,
    `Receipts: ${counts.receipts ?? report.receipt_count ?? 0}`,
    `Setup: ${report.first_run_status?.state ?? 'unknown'}`,
  ];
  const command = report.first_run_status?.primary_action?.command;
  if (command) lines.push(`Next: ${String(command).replaceAll(String(report.bundle), '<bundle-path>')}`);
  lines.push('Boundary: local Enigma counters and roots only; no raw memory, local paths, provider deletion, model behavior, hosted service, or compliance claims.');
  return `${lines.join('\n')}\n`;
}

function printStatusSummary(report, flags, io) {
  if (nextPlainRequested(flags)) io.stdout.write(renderStatusPlain(report));
  else print(report, io);
}

function renderDriveHealthPlain(report) {
  const metrics = report.metrics ?? {};
  const actions = [];
  for (const metric of Object.values(metrics)) {
    if (!metric || !Array.isArray(metric.recommended_actions)) continue;
    for (const action of metric.recommended_actions) {
      if (typeof action === 'string' && !actions.includes(action)) actions.push(action);
      if (actions.length >= 2) break;
    }
    if (actions.length >= 2) break;
  }
  const proofReady = report.proof_network_ready?.eligible_for_anchor_batch === true ? 'eligible' : 'blocked';
  const lines = [
    'Enigma drive health',
    `Status: ${report.overall_status ?? 'unknown'}`,
    `Score: ${report.overall_score ?? 'unknown'}`,
    `Receipt coverage: ${metrics.receipt_coverage?.status ?? 'unknown'}`,
    `Connector health: ${metrics.connector_health?.status ?? 'unknown'}`,
    `Proof network: ${proofReady}`,
  ];
  for (const action of actions) lines.push(`Next: ${action}`);
  lines.push('Boundary: local Memory Drive health only; no raw memory, local paths, provider deletion, model behavior, hosted service, or live-chain claims.');
  return `${lines.join('\n')}\n`;
}

function printDriveHealthReport(report, flags, io) {
  if (nextPlainRequested(flags)) io.stdout.write(renderDriveHealthPlain(report));
  else print(report, io);
}

function renderSupportPlain(summary) {
  const lines = [
    'Enigma support summary',
    `Status: ${summary.ok ? 'Ready' : 'Needs attention'}`,
    `Setup: ${summary.setup_status?.state ?? 'unknown'}`,
    `Support code: ${summary.support_code ?? 'unknown'}`,
    `Issues: ${Array.isArray(summary.issue_codes) ? summary.issue_codes.length : 0}`,
  ];
  if (summary.next_action?.command) lines.push(`Next: ${summary.next_action.command}`);
  const redaction = summary.redaction ?? {};
  const redacted = [
    redaction.raw_memory_included === false ? 'raw memory' : null,
    redaction.prompts_included === false ? 'prompts' : null,
    redaction.transcripts_included === false ? 'transcripts' : null,
    redaction.credentials_included === false ? 'credentials' : null,
    redaction.provider_responses_included === false ? 'provider responses' : null,
    redaction.local_paths_redacted === true ? 'local paths' : null,
  ].filter(Boolean);
  if (redacted.length > 0) lines.push(`Redacted: ${redacted.join(', ')}`);
  lines.push('Safe to share: support code, setup state, issue count, and next action only.');
  lines.push('Boundary: local Enigma support state only; no raw memory, local paths, credentials, provider responses, provider deletion, model behavior, or hosted service claims.');
  return `${lines.join('\n')}\n`;
}

function printSupportSummary(summary, flags, io) {
  if (nextPlainRequested(flags)) io.stdout.write(renderSupportPlain(summary));
  else print(summary, io);
}

function renderImportPlain(preview) {
  const lines = [
    'Enigma import',
    `Decision: ${preview.import_decision ?? 'unknown'}`,
    `Candidates: ${preview.candidate_count ?? 0}`,
    `Duplicates: ${preview.counts?.dedupe?.duplicate_group_count ?? preview.preview_receipt?.duplicate_group_count ?? 0}`,
    `Vault write: ${preview.vault_write_performed ? 'performed' : 'not performed'}`,
  ];
  if (preview.raw_report_written) lines.push('Report: written to <out>');
  if (preview.import_batch_receipt?.schema) lines.push(`Batch receipt: ${preview.import_batch_receipt.write_count ?? 0} write(s)`);
  if (preview.primary_action?.label) lines.push(`Next: ${preview.primary_action.label}`);
  lines.push('Boundary: local import preview/write only; no raw memory, local paths, provider deletion, model behavior, or hosted service claims.');
  return `${lines.join('\n')}\n`;
}

function printImportPreview(preview, flags, io) {
  if (nextPlainRequested(flags)) io.stdout.write(renderImportPlain(preview));
  else print(preview, io);
}

function renderImportRollbackPlain(receipt) {
  const lines = [
    'Enigma import rollback',
    `Status: ${receipt.ok ? 'Ready' : 'Needs attention'}`,
    `Requested writes: ${receipt.requested_write_count ?? 0}`,
    `Tombstoned: ${receipt.tombstoned_count ?? 0}`,
    `Skipped: ${receipt.skipped_count ?? 0}`,
    'Source report: <import-report-file>',
  ];
  lines.push('Boundary: local Enigma vault tombstones only; no raw memory, local paths, provider deletion, model behavior, or hosted service claims.');
  return `${lines.join('\n')}\n`;
}

function printImportRollbackReceipt(receipt, flags, io) {
  if (nextPlainRequested(flags)) io.stdout.write(renderImportRollbackPlain(receipt));
  else print(receipt, io);
}

function renderNextActionPlain(action) {
  const lines = [
    'Enigma next',
    `Status: ${action.primary_action?.label ?? action.state ?? 'Check Enigma'}`,
    `State: ${action.state}`,
  ];
  if (action.primary_action?.command) lines.push(`Run: ${action.primary_action.command}`);
  if (action.follow_up?.command) lines.push(`Then: ${action.follow_up.command}`);
  const lanes = action.lanes && typeof action.lanes === 'object' ? Object.entries(action.lanes) : [];
  for (const [name, lane] of lanes) {
    const label = lane?.label ?? lane?.status ?? 'unknown';
    lines.push(`${name.replace(/_/g, ' ')}: ${label}`);
  }
  if (Array.isArray(action.issue_codes) && action.issue_codes.length > 0) {
    lines.push(`Issue: ${action.issue_codes.join(', ')}`);
  }
  lines.push('Boundary: local Enigma status only; no raw memory or outside-Enigma control claims.');
  return `${lines.join('\n')}\n`;
}
function renderSetupPlain(summary) {
  const lines = [
    summary.command === 'enigma init' ? 'Enigma init' : 'Enigma setup',
    `Status: ${summary.ok ? 'Ready' : 'Needs attention'}`,
    `Memory Drive: ${summary.bundle}`,
    `Memories: ${summary.memory_count}`,
    `Connectors: ${summary.client_configs_written ? 'configured' : 'planned only'}`,
  ];
  if (summary.dry_run) lines.push('Mode: dry run; no files were written.');
  if (Array.isArray(summary.connector_write_skips) && summary.connector_write_skips.length > 0) {
    lines.push(`Skipped: ${summary.connector_write_skips.length} client config(s) were not present.`);
  }
  const next = Array.isArray(summary.next_commands) ? summary.next_commands.slice(0, 3) : [];
  for (const command of next) lines.push(`Next: ${command}`);
  lines.push('Boundary: local Enigma setup only; no raw memory, local paths, provider deletion, model behavior, hosted service, or signing claims.');
  return `${lines.join('\n')}\n`;
}

function printSetupSummary(summary, flags, io) {
  if (nextPlainRequested(flags)) io.stdout.write(renderSetupPlain(summary));
  else print(summary, io);
}

function renderQuickstartPlain(summary) {
  const lines = [
    'Enigma quickstart',
    `Status: ${summary.ok ? 'Ready' : 'Needs attention'}`,
    `Memory Drive: ${summary.bundle}`,
    `Memories: ${summary.memory_count}`,
    `Receipts: ${summary.receipt_count}`,
  ];
  const next = Array.isArray(summary.next_commands) ? summary.next_commands : [];
  for (const command of next) lines.push(`Next: ${command}`);
  lines.push('Boundary: local Enigma quickstart only; no raw memory, local paths, provider deletion, model behavior, hosted service, or compliance claims.');
  return `${lines.join('\n')}\n`;
}

function printQuickstartSummary(summary, flags, io) {
  if (nextPlainRequested(flags)) io.stdout.write(renderQuickstartPlain(summary));
  else print(summary, io);
}


function doctorSetupExplanation(summary) {
  const reasons = new Set(Array.isArray(summary.setup_status?.reasons) ? summary.setup_status.reasons : []);
  const connectorReasons = (Array.isArray(summary.connectors?.clients) ? summary.connectors.clients : [])
    .flatMap((client) => Array.isArray(client.repair_reasons) ? client.repair_reasons : []);
  for (const reason of connectorReasons) reasons.add(`connector_${reason}`);
  if (reasons.has('connector_bundle_env_missing') || reasons.has('connector_bundle_env_mismatch')) {
    return 'Why: the Memory Drive is not ready and an AI app connection setting points at a missing or different bundle. Create this Memory Drive, then preview or repair the app connection.';
  }
  if (reasons.has('bundle_missing')) {
    return 'Why: the target Enigma bundle does not exist yet. Run quickstart for this bundle, then rerun doctor.';
  }
  if (summary.setup_status?.state === 'setup_needed') {
    return 'Why: doctor is the final green check after local setup, not the first install step.';
  }
  return null;
}

function renderDoctorPlain(summary) {
  const lines = [
    'Enigma doctor',
    `Status: ${summary.ok ? 'Ready' : 'Needs attention'}`,
    `Setup: ${summary.setup_status?.state ?? 'unknown'}`,
  ];
  const reasons = Array.isArray(summary.setup_status?.reasons) ? summary.setup_status.reasons : [];
  if (reasons.length > 0) lines.push(`Issue: ${reasons.join(', ')}`);
  const explanation = doctorSetupExplanation(summary);
  if (explanation) lines.push(explanation);
  if (summary.first_run_hint?.command) lines.push(`Run: ${summary.first_run_hint.command}`);
  const followUps = Array.isArray(summary.next_commands) ? summary.next_commands.slice(1, 3) : [];
  for (const command of followUps) lines.push(`Then: ${command}`);
  const clients = Array.isArray(summary.connectors?.clients) ? summary.connectors.clients : [];
  if (clients.length > 0) {
    const ready = clients.filter((client) => client.status === 'ready' || client.action === 'already_configured').length;
    const repair = clients.filter((client) => Array.isArray(client.repair_reasons) && client.repair_reasons.length > 0).length;
    lines.push(`Connectors: ${ready} ready, ${repair} need repair`);
  }
  lines.push('Boundary: local Enigma checks only; no raw memory, local paths, provider deletion, model behavior, or hosted readiness claims.');
  return `${lines.join('\n')}\n`;
}

function printDoctorSummary(summary, flags, io) {
  if (nextPlainRequested(flags)) io.stdout.write(renderDoctorPlain(summary));
  else print(summary, io);
}

function renderConnectorPlain(result) {
  const action = result.action === 'disconnect' ? 'disconnect' : 'connect';
  const title = action === 'disconnect' ? 'Enigma disconnect' : 'Enigma connect';
  const lines = [
    title,
    `Status: ${result.ok ? 'Ready' : 'Needs attention'}`,
    `Client: ${result.client_id ?? 'unknown'}`,
    `Mode: ${result.dryRun ? 'dry run' : 'write'}`,
    `Change: ${result.changed ? 'planned' : 'not needed'}`,
    'Config: <client-config-path>',
  ];
  if (result.dryRun && action === 'connect') lines.push(`Next: enigma connect ${result.client_id ?? '<client>'} --bundle <bundle-path>`);
  if (result.dryRun && action === 'disconnect') lines.push(`Next: enigma disconnect ${result.client_id ?? '<client>'}`);
  lines.push('Boundary: local client config only; no provider launch, provider deletion, model behavior, hosted service, raw memory, or local paths.');
  return `${lines.join('\n')}\n`;
}

function printConnectorResult(result, flags, io) {
  if (nextPlainRequested(flags)) io.stdout.write(renderConnectorPlain(result));
  else print(result, io);
}

function printNextAction(action, flags, io) {
  if (nextPlainRequested(flags)) io.stdout.write(renderNextActionPlain(action));
  else print(action, io);
}

function redactCliErrorMessage(error) {
  return String(error?.message ?? error ?? 'Command failed.')
    .replace(/[A-Za-z]:[\\/][^\s,)"']+/g, '<local-path>')
    .replace(/\/(?:Users|home|var|tmp|private|Volumes)\/[^\s,)"']+/g, '<local-path>');
}

function recoveryCommandFor(command, error) {
  const existingArtifact = /already exists/i.test(String(error?.message ?? error ?? ''));
  if (command === 'init' || command === 'setup') return existingArtifact ? 'enigma setup --bundle <new-bundle-path> --out-dir <new-empty-out-dir>' : 'enigma setup --bundle <bundle-path> --out-dir <out-dir>';
  if (command === 'start' || command === 'quickstart') return existingArtifact ? 'enigma quickstart --bundle <new-bundle-path> --out-dir <new-empty-out-dir>' : 'enigma quickstart --bundle <bundle-path> --out-dir <out-dir>';
  if (command === 'test-drive') return existingArtifact ? 'enigma test-drive --out-dir <new-empty-out-dir>' : 'enigma test-drive --out-dir <out-dir>';
  return 'enigma next --bundle <bundle-path>';
}

function renderCliErrorPlain(command, error) {
  const safeCommand = command ? String(command).replace(/[^a-z0-9:-]/gi, '') : 'command';
  const lines = [
    `Enigma ${safeCommand}`,
    'Status: Needs attention',
    `Issue: ${redactCliErrorMessage(error)}`,
    `Next: ${recoveryCommandFor(command, error)}`,
    'Boundary: local Enigma error summary only; no raw memory, local paths, provider deletion, model behavior, hosted service, or signing claims.',
  ];
  return `${lines.join('\n')}\n`;
}


async function nextCommand(flags, io) {
  const bundleInput = String(getFlag(flags, ['bundle', 'file'], DEFAULT_BUNDLE));
  const bundlePath = resolve(bundleInput);
  const bundleDisplay = publicPathDisplay(bundleInput, 'bundle-path');
  const vaultPath = await writableVaultPathCheck(bundlePath, bundleDisplay);
  const claimBoundaries = {
    local_enigma_status_only: true,
    raw_memory_returned: false,
    local_paths_redacted: true,
    provider_deletion_proof: false,
    model_forgetting_proof: false,
    hosted_saas_live: false,
  };
  if (vaultPath.ok !== true) {
    const action = {
      ok: false,
      schema: 'enigma.next_action.v1',
      state: 'attention_needed',
      bundle: bundleDisplay,
      primary_action: {
        id: 'choose_writable_bundle',
        label: 'Choose writable Memory Drive path',
        command: 'enigma quickstart --bundle <writable-bundle-path>',
      },
      issue_codes: [vaultPath.reason || 'bundle_path_not_writable'],
      vault_path: vaultPath,
      claim_boundaries: claimBoundaries,
    };
    printNextAction(action, flags, io);
    return 0;
  }
  const bundleStatus = await bundleInitializedCheck(bundlePath, vaultPath);
  if (bundleStatus.ok !== true) {
    const action = {
      ok: true,
      schema: 'enigma.next_action.v1',
      state: 'setup_needed',
      bundle: bundleDisplay,
      primary_action: {
        id: 'run_quickstart',
        label: 'Create Memory Drive',
        command: `enigma quickstart --bundle "${bundleDisplay}" --plain`,
      },
      issue_codes: [bundleStatus.reason || 'bundle_missing'],
      bundle_initialized: bundleStatus,
      follow_up: {
        id: 'run_status_after_setup',
        label: 'Check setup status',
        command: `enigma status --bundle "${bundleDisplay}"`,
      },
      claim_boundaries: claimBoundaries,
    };
    printNextAction(action, flags, io);
    return 0;
  }
  const { stored, vault, passport } = await loadState(bundlePath, { passphrase: getFlag(flags, ['passphrase']) });
  const report = passportStatusReport({ bundlePath, stored, vault, passport });
  const action = {
    ok: true,
    schema: 'enigma.next_action.v1',
    state: report.first_run_status.state,
    bundle: bundleDisplay,
    primary_action: report.first_run_status.primary_action,
    lanes: report.first_run_status.lanes,
    status_ref: `enigma://status/${report.passport_ref.split('/').pop()}`,
    status_command: `enigma status --bundle "${bundleDisplay}"`,
    claim_boundaries: claimBoundaries,
  };
  printNextAction(action, flags, io);
  return 0;
}
async function readOptionalJsonInput(flags, names) {
  const path = getFlag(flags, names);
  if (!path) return null;
  if (!(await fileExists(path))) return null;
  return readJson(path);
}

async function driveHealthCommand(flags, io) {
  const bundlePath = resolve(String(getFlag(flags, ['bundle', 'file'], DEFAULT_BUNDLE)));
  const { vault, passport } = await loadState(bundlePath, { passphrase: getFlag(flags, ['passphrase']) });
  const benchmarkSummary = await readOptionalJsonInput(flags, ['benchmark-summary', 'benchmarkSummary']);
  const connectorSummary = await readOptionalJsonInput(flags, ['connector-summary', 'connectorSummary']);
  const replicas = await readOptionalJsonInput(flags, ['replicas']);
  const latestAnchorBatchRef = getFlag(flags, ['latest-anchor-batch-ref', 'latestAnchorBatchRef']);
  const now = getFlag(flags, ['now'], '2026-06-25T00:00:00.000Z');
  const report = createMemoryDriveHealthReport({ vault, passport, benchmarkSummary, connectorSummary, replicas, latestAnchorBatchRef, now });
  const outPath = getFlag(flags, ['out']);
  if (outPath) await writeJson(outPath, report);
  printDriveHealthReport(report, flags, io);
  return 0;
}

function testDrivePathDisplay(outDirInput, name) {
  return isAbsolute(outDirInput) ? join(outDirInput, name) : quickstartPathDisplay(outDirInput, name);
}

function testDriveBundleDisplay(outDirInput) {
  return testDrivePathDisplay(outDirInput, DEFAULT_TEST_DRIVE_BUNDLE_NAME);
}

function testDriveOutputs(outDirInput, bundleInput = testDriveBundleDisplay(outDirInput)) {
  const quickstart = quickstartOutputs(bundleInput, outDirInput);
  const contextPackDisplay = testDrivePathDisplay(outDirInput, QUICKSTART_ARTIFACT_NAMES.contextPack);
  const exportDisplay = testDrivePathDisplay(outDirInput, QUICKSTART_ARTIFACT_NAMES.export);
  const verifyReportDisplay = testDrivePathDisplay(outDirInput, QUICKSTART_ARTIFACT_NAMES.verifyReport);
  const crossModelReportDisplay = testDrivePathDisplay(outDirInput, DEFAULT_TEST_DRIVE_CROSS_MODEL_REPORT_NAME);
  const crossModelReportPath = resolve(quickstart.outDirPath, DEFAULT_TEST_DRIVE_CROSS_MODEL_REPORT_NAME);
  const artifacts = [
    { role: 'bundle', path: quickstart.bundlePath, display: bundleInput, schema: 'enigma.bundle.v1' },
    { role: 'context_pack', path: quickstart.contextPackPath, display: contextPackDisplay, schema: 'enigma.context_pack.v1' },
    { role: 'export', path: quickstart.exportPath, display: exportDisplay, schema: 'enigma.bundle.v1' },
    { role: 'verify_report', path: quickstart.verifyReportPath, display: verifyReportDisplay, schema: 'enigma.verify_report.v1' },
    { role: 'cross_model_report', path: crossModelReportPath, display: crossModelReportDisplay, schema: 'enigma.cross_model_demo.v1' },
  ];
  return {
    ...quickstart,
    contextPackDisplay,
    exportDisplay,
    verifyReportDisplay,
    crossModelReportPath,
    crossModelReportDisplay,
    artifacts,
    outputs: artifacts.map((artifact) => ({ path: artifact.path, display: artifact.display })),
  };
}

function testDriveFileSummaries(artifacts, written) {
  return artifacts.map((artifact) => ({
    role: artifact.role,
    path: artifact.display,
    schema: artifact.schema,
    written: Boolean(written),
  }));
}

function firstActiveMemoryAddress(vault) {
  if (!(vault.activeAddresses instanceof Set)) throw new Error('Test drive vault did not expose an active memory set.');
  const first = vault.activeAddresses.values().next();
  if (first.done) throw new Error('Test drive vault did not create a demo memory.');
  return first.value;
}

function testDriveNextCommands(bundleDisplay, crossModelReportDisplay) {
  const quotedBundle = commandPath(bundleDisplay);
  const quotedReport = commandPath(crossModelReportDisplay);
  return [
    `enigma status --bundle ${quotedBundle}`,
    `enigma drive health --bundle ${quotedBundle}`,
    `enigma search --bundle ${quotedBundle} --query "local proof bundle"`,
    `enigma demo cross-model --bundle ${quotedBundle} --out ${quotedReport}`,
    `enigma connect claude-desktop --bundle ${quotedBundle} --dry-run`,
  ];
}

function testDriveFlowCommands({ bundleDisplay, outDirInput, crossModelReportDisplay, overwrite }) {
  const overwriteSuffix = overwrite ? ' --overwrite' : '';
  const quotedBundle = commandPath(bundleDisplay);
  const quotedOutDir = commandPath(outDirInput);
  const quotedReport = commandPath(crossModelReportDisplay);
  return [
    `enigma quickstart --bundle ${quotedBundle} --out-dir ${quotedOutDir}${overwriteSuffix}`,
    `enigma status --bundle ${quotedBundle}`,
    `enigma drive health --bundle ${quotedBundle}`,
    `enigma search --bundle ${quotedBundle} --query "local proof bundle"`,
    `enigma demo cross-model --bundle ${quotedBundle} --out ${quotedReport}`,
  ];
}

function testDriveBenchmarkPointers() {
  return [
    {
      command: 'node scripts/run-memory-benchmarks.mjs',
      public_safe: true,
      planned_only: true,
      requires_repo_checkout: true,
      external_provider_calls: false,
      raw_memory_included: false,
      claim_boundary: 'Runs deterministic local fixture operations only; it is not a provider comparison, hosted service proof, benchmark leadership claim, ROI claim, provider deletion proof, or model forgetting proof.',
    },
    {
      command: 'node scripts/download-standard-benchmarks.mjs --dry-run',
      public_safe: true,
      planned_only: true,
      requires_repo_checkout: true,
      external_provider_calls: false,
      raw_memory_included: false,
      claim_boundary: 'Plans official dataset downloads without fetching by default; raw benchmark records are not included in the public plan.',
    },
    {
      command: 'node scripts/run-standard-memory-benchmarks.mjs --locomo <path> --longmemeval <path>',
      public_safe: true,
      planned_only: true,
      requires_repo_checkout: true,
      external_provider_calls: false,
      raw_memory_included: false,
      claim_boundary: 'Runs local deterministic retrieval proxies against operator-supplied dataset files; it emits no provider API calls, competitor scores, benchmark leadership claim, or model-forgetting claim.',
    },
  ];
}

function testDriveClaimBoundaries() {
  return {
    local_only: true,
    credentials_required: false,
    external_provider_calls: false,
    client_config_writes_performed: false,
    plaintext_memory_echoed: false,
    hosted_saas_live_claim: false,
    provider_native_memory_canonical: false,
    provider_deletion_proof: false,
    model_forgetting_proof: false,
    benchmark_leadership_claim: false,
    compliance_certification: false,
  };
}

function publicTestDriveStatusSummary(summary, bundleDisplay) {
  return {
    ...summary,
    bundle: bundleDisplay,
    connector_readiness: {
      ...summary.connector_readiness,
      bundle: bundleDisplay,
    },
    next_recommended_commands: [
      `enigma remember --bundle ${commandPath(bundleDisplay)} --text-file <path>`,
      `enigma search --bundle ${commandPath(bundleDisplay)} --query <text>`,
      `enigma context --bundle ${commandPath(bundleDisplay)} --query <text>`,
      `enigma verify --bundle ${commandPath(bundleDisplay)}`,
      `enigma connect <client> --bundle ${commandPath(bundleDisplay)} --dry-run`,
    ],
  };
}

function publicTestDriveSearchSummary(summary, bundleDisplay) {
  return {
    ...summary,
    bundle: bundleDisplay,
  };
}

function renderTestDrivePlain(report) {
  const setup = report.setup_summary ?? {};
  const crossModel = report.cross_model_summary ?? {};
  const lines = [
    'Enigma test drive',
    `Status: ${report.ok ? 'Ready' : 'Needs attention'}`,
    `Mode: ${report.dry_run ? 'dry run; no files written' : 'local files written'}`,
    `Artifacts: ${report.artifacts_written ? 'written' : 'planned only'}`,
    `Memories: ${setup.memory_count ?? 0}`,
    `Receipts: ${setup.receipt_count ?? 0}`,
    `Verify: ${setup.verify_ok ? 'ready' : 'needs attention'}`,
    `AI app profiles: ${crossModel.profile_count ?? 0}`,
  ];
  lines.push(`Install: ${report.install_command ?? 'npm install -g enigma-memory'}`);
  lines.push('Next: enigma status --bundle <bundle-path>');
  lines.push('Next: enigma search --bundle <bundle-path> --query "local proof bundle"');
  lines.push('Next: enigma connect <client> --bundle <bundle-path> --dry-run');
  lines.push('Boundary: local demo artifacts only; no raw memory, local paths, client config writes, provider calls, provider deletion, model behavior, hosted service, benchmark, or compliance claims.');
  return `${lines.join('\n')}\n`;
}

function printTestDriveReport(report, flags, io) {
  if (nextPlainRequested(flags)) io.stdout.write(renderTestDrivePlain(report));
  else print(report, io);
}

function staticSetupSelection(requestedSelection) {
  return {
    ...requestedSelection,
    fallback_used: false,
    selected: requestedSelection.clients.map((clientId) => {
      const profile = getClientProfile(clientId);
      return publicSetupClientSelectionEntry({ client_id: clientId, display_name: profile.display_name }, requestedSelection.mode === 'default' ? 'default_setup_client' : 'explicit_client');
    }),
    skipped: [],
    connectable_client_ids: null,
  };
}

export async function testDriveCommand(flags, io) {
  const outDirInput = pathFlag(flags, ['out-dir', 'outDir'], DEFAULT_TEST_DRIVE_DIR);
  const bundleInput = pathFlag(flags, ['bundle', 'file'], testDriveBundleDisplay(outDirInput));
  const overwrite = booleanFlag(flags, ['overwrite'], false);
  const dryRun = booleanFlag(flags, ['dry-run', 'dryRun'], false);
  const outputs = testDriveOutputs(outDirInput, bundleInput);
  ensureDistinctOutputPaths(outputs.outputs);
  if (!dryRun) await assertCanWriteQuickstartOutputs(outputs.outputs, overwrite);

  const artifacts = await buildQuickstartArtifacts(flags, {
    bundleInput,
    outDirInput,
    overwrite,
    write: false,
    checkExisting: false,
  });
  const requestedSelection = setupClientIds(flags);
  const selection = requestedSelection.auto
    ? await setupAutoClientSelection(flags, artifacts, DEFAULT_SETUP_CLIENTS, 'auto')
    : staticSetupSelection(requestedSelection);
  const demoMemoryAddr = firstActiveMemoryAddress(artifacts.vault);
  const crossModelLimit = integerFlag(flags, ['limit'], 'limit', 1);
  if (crossModelLimit < 1) throw new Error('--limit must be at least 1.');
  const receiptCountBeforeProfiles = Array.isArray(artifacts.vault.receipts) ? artifacts.vault.receipts.length : 0;
  const profiles = buildCrossModelProfileSummaries({
    vault: artifacts.vault,
    passport: artifacts.passport,
    demoMemoryAddr,
    limit: crossModelLimit,
  });
  const finalExport = exportBundle({ vault: artifacts.vault, includePlaintext: false });
  const finalBundle = finalExport.bundle ?? finalExport;
  const finalVerifyReport = verifyBundle(finalBundle);
  const crossModelReport = {
    ok: true,
    schema: 'enigma.cross_model_demo.v1',
    command: 'enigma demo cross-model',
    story: 'One local Enigma memory is packaged as public-safe context pack references and receipts for ChatGPT, Claude, Kimi, Cursor, and a local LLM. No provider is called.',
    bundle_ref: bundleInput,
    bundle_supplied: true,
    bundle_created: true,
    demo_only_vault: true,
    memory_source: 'test_drive_demo',
    demo_memory_addr: demoMemoryAddr,
    profile_count: profiles.length,
    profiles,
    memory_count: activeMemoryCount(artifacts.vault),
    receipt_count: Array.isArray(finalBundle.receipts) ? finalBundle.receipts.length : 0,
    generated_receipt_count: (Array.isArray(finalBundle.receipts) ? finalBundle.receipts.length : 0) - receiptCountBeforeProfiles,
    provider_credentials_required: false,
    provider_native_memory_canonical: false,
    out_written: !dryRun,
    claim_boundaries: { ...CROSS_MODEL_CLAIM_BOUNDARIES },
  };
  const rawStatusSummary = passportStatusReport({
    bundlePath: outputs.bundlePath,
    vault: artifacts.vault,
    passport: artifacts.passport,
    stored: {
      owner: {
        subject_id: artifacts.vault.subject_id,
        display_name: artifacts.vault.display_name,
      },
    },
  });
  const statusSummary = publicTestDriveStatusSummary(rawStatusSummary, bundleInput);
  const rawSearchSummary = memorySearchReport({
    bundlePath: outputs.bundlePath,
    vault: artifacts.vault,
    query: 'local proof bundle',
    limit: 3,
    includeContent: false,
    now: getFlag(flags, ['now'], '2026-01-01T00:00:00.000Z'),
  });
  const searchSummary = publicTestDriveSearchSummary(rawSearchSummary, bundleInput);

  if (!dryRun) {
    await writeJson(outputs.bundlePath, finalBundle);
    await writeJson(outputs.contextPackPath, publicContextPackSummary(artifacts.contextPack));
    await writeJson(outputs.exportPath, finalBundle);
    await writeJson(outputs.verifyReportPath, finalVerifyReport);
    await writeJson(outputs.crossModelReportPath, crossModelReport);
  }

  const flowCommands = testDriveFlowCommands({
    bundleDisplay: bundleInput,
    outDirInput,
    crossModelReportDisplay: outputs.crossModelReportDisplay,
    overwrite,
  });
  const nextCommands = testDriveNextCommands(bundleInput, outputs.crossModelReportDisplay);
  const files = testDriveFileSummaries(outputs.artifacts, !dryRun);
  const packageJson = await readPackageJson();
  const ok = finalVerifyReport.ok === true && crossModelReport.ok === true && statusSummary.ok === true && searchSummary.ok === true;
  const report = {
    ok,
    schema: 'enigma.test_drive.v1',
    command: 'enigma test-drive',
    dry_run: dryRun,
    out_dir: outDirInput,
    bundle: bundleInput,
    install_command: `npm install -g ${packageJson.name ?? 'enigma-memory'}`,
    release_target: packageJson.version ?? '0.1.19',
    artifacts_written: !dryRun,
    client_configs_written: false,
    client_config_write_required: false,
    memory_plaintext_echoed: false,
    provider_credentials_required: false,
    hosted_saas_live: false,
    files,
    files_written: dryRun ? [] : files.map((file) => file.path),
    files_planned: files.map((file) => file.path),
    commands_run: dryRun ? [] : flowCommands,
    commands_planned: dryRun ? flowCommands : [],
    next_commands: nextCommands,
    benchmark_pointers: testDriveBenchmarkPointers(),
    setup_summary: {
      schema: 'enigma.setup.v1',
      artifacts_written: !dryRun,
      bundle: bundleInput,
      context_pack: outputs.contextPackDisplay,
      export: outputs.exportDisplay,
      verify_report: outputs.verifyReportDisplay,
      selected_clients: selection.clients,
      client_selection: publicSetupClientSelection(selection),
      client_configs_written: false,
      provider_credentials_required: false,
      memory_plaintext_echoed: false,
      memory_count: Array.isArray(finalBundle.memory_objects) ? finalBundle.memory_objects.length : 0,
      receipt_count: Array.isArray(finalBundle.receipts) ? finalBundle.receipts.length : 0,
      context_item_count: Array.isArray(artifacts.contextPack.memories) ? artifacts.contextPack.memories.length : 0,
      verify_ok: finalVerifyReport.ok === true,
    },
    status_summary: statusSummary,
    search_summary: searchSummary,
    cross_model_summary: crossModelReport,
    claim_boundaries: testDriveClaimBoundaries(),
  };
  printTestDriveReport(report, flags, io);
  return ok ? 0 : 1;
}

async function exportCommand(flags, io) {
  const bundlePath = resolve(String(getFlag(flags, ['bundle', 'file'], DEFAULT_BUNDLE)));
  const { vault } = await loadState(bundlePath, { passphrase: getFlag(flags, ['passphrase']) });
  const exported = exportBundle({ vault, includePlaintext: false, passphrase: getFlag(flags, ['passphrase']) });
  const bundle = exported.bundle ?? exported;
  await writeJson(bundlePath, bundle);
  const out = resolve(String(getFlag(flags, ['out'], 'enigma-export.json')));
  await writeJson(out, bundle);
  const output = { ok: true, export: out, receipt_count: Array.isArray(bundle.receipts) ? bundle.receipts.length : 0 };
  printExportResult(output, flags, io);
  return 0;
}

async function verifyCommand(flags, io) {
  const path = resolve(String(getFlag(flags, ['bundle', 'file', 'export'], DEFAULT_BUNDLE)));
  const report = verifyBundle(await readJson(path));
  printVerifyReport(report, flags, io);
  return report.ok ? 0 : 1;
}

async function boundaryRunCommand(flags, io) {
  const manifestPath = getFlag(flags, ['manifest']);
  const tracePath = getFlag(flags, ['trace']);
  const report = runBoundarySimulation({
    scenario: String(getFlag(flags, ['scenario'], 'committed_crossing')),
    manifest: manifestPath && manifestPath !== true ? await readJson(resolve(String(manifestPath))) : undefined,
    trace: tracePath && tracePath !== true ? await readJson(resolve(String(tracePath))) : undefined,
  });
  print(report, io);
  return report?.ok === false || report?.verdict === 'FAIL' || report?.status === 'FAIL' ? 1 : 0;
}

export async function mcpServeCommand(_flags, io) {
  const server = startStdioServer({
    input: io.stdin ?? process.stdin,
    output: io.stdout ?? process.stdout,
    errorOutput: io.stderr ?? process.stderr,
  });
  if (server?.done) await server.done;
  return 0;
}

export async function meshDemoCommand(_flags, io) {
  print(runMeshDemo(), io);
  return 0;
}

export async function enterpriseDemoCommand(_flags, io) {
  print(runEnterpriseDemo(), io);
  return 0;
}

export async function doctorCommand(flags, io) {
  const packageJson = await readPackageJson();
  const requiredNodeMajor = minimumNodeMajor(packageJson.engines?.node);
  const currentNodeMajor = nodeMajor(process.versions.node);
  const binMap = packageJson.bin && typeof packageJson.bin === 'object' && !Array.isArray(packageJson.bin) ? packageJson.bin : {};
  const binEntries = await Promise.all(REQUIRED_PACKAGE_BINS.map(async (name) => {
    const target = binMap[name];
    const declared = typeof target === 'string' && target.length > 0;
    return {
      name,
      target: declared ? target : null,
      declared,
      exists: declared ? await fileExists(packageFileUrl(target)) : false,
    };
  }));
  const schemas = await schemaFiles();
  const bundleInput = pathFlag(flags, ['bundle', 'file'], DEFAULT_BUNDLE);
  const resolvedBundlePath = resolve(bundleInput);
  const publicBundlePath = publicPathDisplay(bundleInput, 'bundle-path');
  const vaultPath = await writableVaultPathCheck(resolvedBundlePath, publicBundlePath);
  const selectedClient = getFlag(flags, ['client']);
  const doctorOptions = selectedClient && selectedClient !== true
    ? { ...connectorOptions(flags), clientId: String(selectedClient), redactPaths: true }
    : { ...connectorOptions(flags), clientId: undefined, redactPaths: true };
  const connectorDoctor = await doctorConnectors(doctorOptions);
  const profile = getClientProfile(String(selectedClient && selectedClient !== true ? selectedClient : 'generic-mcp'), connectorOptions(flags));
  const checks = {
    node: {
      ok: requiredNodeMajor === 0 || currentNodeMajor >= requiredNodeMajor,
      current: process.versions.node,
      required: packageJson.engines?.node ?? null,
    },
    npm: npmUserAgentCheck(),
    package_bins: {
      ok: binEntries.every((entry) => entry.declared && entry.exists),
      required: REQUIRED_PACKAGE_BINS,
      entries: binEntries,
      missing: binEntries.filter((entry) => !entry.declared).map((entry) => entry.name),
      missing_targets: binEntries.filter((entry) => entry.declared && !entry.exists).map((entry) => entry.name),
    },
    bundle_default_path: {
      ok: DEFAULT_BUNDLE === '.enigma/bundle.json',
      path: DEFAULT_BUNDLE,
      resolved: publicPathDisplay(resolvedBundlePath, 'bundle-path'),
    },
    vault_path: vaultPath,
    bundle_initialized: await bundleInitializedCheck(resolvedBundlePath, vaultPath),
    schemas: {
      ok: schemas.length > 0,
      count: schemas.length,
      files: schemas,
    },
    mcp_command_name: {
      ok: profile.command === 'enigma-mcp',
      command: profile.command,
      expected: 'enigma-mcp',
    },
    connectors: connectorDoctor,
  };
  const ok = Object.values(checks).every((check) => check.ok !== false);
  const doctorClient = String(selectedClient && selectedClient !== true ? selectedClient : 'generic-mcp');
  const firstRunHint = doctorFirstRunHint(checks.vault_path.path, doctorClient);
  const setupStatus = doctorSetupStatus(checks, firstRunHint);
  const summary = {
    ok,
    node: checks.node,
    package_bins: checks.package_bins,
    npm: checks.npm,
    vault_path: checks.vault_path,
    bundle_initialized: checks.bundle_initialized,
    bundle_default_path: checks.bundle_default_path,
    schema_count: checks.schemas.count,
    schemas: checks.schemas,
    mcp_command_name: checks.mcp_command_name.command,
    connectors: checks.connectors,
    setup_status: setupStatus,
    first_run_hint: firstRunHint,
    fresh_install_hint: firstRunHint,
    next_commands: doctorNextCommands(checks.vault_path.path, doctorClient),
    checks,
  };
  printDoctorSummary(summary, flags, io);
  return ok ? 0 : 1;
}

export async function supportSummaryCommand(flags, io) {
  const packageJson = await readPackageJson();
  const requiredNodeMajor = minimumNodeMajor(packageJson.engines?.node);
  const currentNodeMajor = nodeMajor(process.versions.node);
  const binMap = packageJson.bin && typeof packageJson.bin === 'object' && !Array.isArray(packageJson.bin) ? packageJson.bin : {};
  const binEntries = await Promise.all(REQUIRED_PACKAGE_BINS.map(async (name) => {
    const target = binMap[name];
    const declared = typeof target === 'string' && target.length > 0;
    return { name, declared, exists: declared ? await fileExists(packageFileUrl(target)) : false };
  }));
  const bundleInput = pathFlag(flags, ['bundle', 'file'], DEFAULT_BUNDLE);
  const resolvedBundlePath = resolve(bundleInput);
  const publicBundlePath = publicPathDisplay(bundleInput, 'bundle-path');
  const vaultPath = await writableVaultPathCheck(resolvedBundlePath, publicBundlePath);
  const selectedClient = getFlag(flags, ['client']);
  const doctorClient = String(selectedClient && selectedClient !== true ? selectedClient : 'generic-mcp');
  const connectorDoctor = await doctorConnectors({
    ...connectorOptions(flags),
    clientId: selectedClient && selectedClient !== true ? String(selectedClient) : undefined,
    redactPaths: true,
  });
  const profile = getClientProfile(doctorClient, connectorOptions(flags));
  const bundleInitialized = await bundleInitializedCheck(resolvedBundlePath, vaultPath);
  const checks = {
    node: {
      ok: requiredNodeMajor === 0 || currentNodeMajor >= requiredNodeMajor,
      current_major: currentNodeMajor,
      required: packageJson.engines?.node ?? null,
    },
    npm: npmUserAgentCheck(),
    package_bins: {
      ok: binEntries.every((entry) => entry.declared && entry.exists),
      required: REQUIRED_PACKAGE_BINS,
      entries: binEntries,
      missing: binEntries.filter((entry) => !entry.declared).map((entry) => entry.name),
      missing_targets: binEntries.filter((entry) => entry.declared && !entry.exists).map((entry) => entry.name),
    },
    vault_path: vaultPath,
    bundle_initialized: bundleInitialized,
    mcp_command_name: {
      ok: profile.command === 'enigma-mcp',
      command: profile.command,
      expected: 'enigma-mcp',
    },
    connectors: connectorDoctor,
  };
  const firstRunHint = doctorFirstRunHint(checks.vault_path.path, doctorClient);
  const setupStatus = doctorSetupStatus(checks, firstRunHint);
  let firstRunStatus = null;
  if (bundleInitialized.ok === true) {
    try {
      const { stored, vault, passport } = await loadState(resolvedBundlePath, { passphrase: getFlag(flags, ['passphrase']) });
      firstRunStatus = passportStatusReport({ bundlePath: resolvedBundlePath, stored, vault, passport }).first_run_status;
    } catch {
      firstRunStatus = null;
    }
  }
  const connectorSummary = connectorReadinessSummary(connectorDoctor);
  const issueCodes = [
    ...setupStatus.reasons,
    ...((connectorDoctor.clients ?? []).flatMap((client) => Array.isArray(client.repair_reasons) ? client.repair_reasons.map((reason) => `connector_${reason}`) : [])),
  ];
  const generatedAt = getFlag(flags, ['now']);
  const summary = {
    ok: setupStatus.state === 'ready',
    schema: 'enigma.support_summary.v1',
    generated_at: generatedAt && generatedAt !== true ? String(generatedAt) : new Date().toISOString(),
    support_code: `ref:support-summary:${sha256Json({ setup_state: setupStatus.state, issueCodes, bundle: '<bundle-path>' }).slice('sha256:'.length, 'sha256:'.length + 32)}`,
    package: {
      name: packageJson.name,
      version: packageJson.version,
    },
    bundle: publicBundlePath,
    setup_status: setupStatus,
    first_run_status: firstRunStatus,
    diagnostics: {
      node_ok: checks.node.ok,
      npm_ok: checks.npm.ok,
      package_bins_ok: checks.package_bins.ok,
      bundle_initialized_ok: bundleInitialized.ok,
      mcp_command_name_ok: checks.mcp_command_name.ok,
      connector_summary: connectorSummary,
    },
    issue_codes: [...new Set(issueCodes.filter(Boolean))],
    next_action: setupStatus.next_command
      ? { id: 'run_quickstart', label: 'Create Memory Drive', command: setupStatus.next_command }
      : firstRunStatus?.primary_action ?? { id: 'open_status', label: 'Open status', command: `enigma status --bundle ${commandPath('<bundle-path>')}` },
    redaction: {
      raw_memory_included: false,
      prompts_included: false,
      transcripts_included: false,
      credentials_included: false,
      local_paths_redacted: true,
      provider_responses_included: false,
    },
    claim_boundaries: {
      local_enigma_status_only: true,
      provider_deletion_proof: false,
      model_forgetting_proof: false,
      hosted_saas_live: false,
    },
  };
  const out = getFlag(flags, ['out']);
  if (out && out !== true) await writeJson(resolve(String(out)), summary);
  printSupportSummary(summary, flags, io);
  return 0;
}

export async function installCommand(flags, io) {
  const bundlePath = resolve(String(getFlag(flags, ['bundle', 'file'], DEFAULT_BUNDLE)));
  const bundleState = await ensureBundle(bundlePath, flags);
  const selectedClient = getFlag(flags, ['client']);
  const clients = selectedClient && selectedClient !== true ? [String(selectedClient)] : supportedClients;
  const snippets = {};
  const profiles = [];
  for (const client of clients) {
    snippets[client] = renderMcpConfig(client, { ...connectorOptions(flags), bundlePath });
    profiles.push(getClientProfile(client, { ...connectorOptions(flags), bundlePath }));
  }
  const out = getFlag(flags, ['out']);
  if (out && out !== true) await writeJson(resolve(String(out)), { schema: 'enigma.install_snippets.v1', snippets });
  const summary = {
    ok: true,
    bundle: bundlePath,
    bundle_created: bundleState.created,
    schema: bundleState.bundle.schema,
    mcp_command: connectorOptions(flags).mcpCommand ?? 'enigma-mcp',
    clients: profiles,
    mcp_config_snippets: snippets,
    one_command_install_connect: oneCommandInstallConnect(bundlePath, dirname(bundlePath)),
    out: out && out !== true ? resolve(String(out)) : undefined,
  };
  printInstallSummary(summary, flags, io);
  return 0;
}

export async function connectCommand(client, flags, io) {
  if (!client) throw new Error('Missing required client.');
  const result = await connectClient(client, connectorOptions(flags));
  printConnectorResult(result, flags, io);
  return result.ok ? 0 : 1;
}

export async function disconnectCommand(client, flags, io) {
  if (!client) throw new Error('Missing required client.');
  const result = await disconnectClient(client, connectorOptions(flags, false));
  printConnectorResult(result, flags, io);
  return result.ok ? 0 : 1;
}

export async function importCommand(source, flags, io, positionalFile = undefined) {
  if (!source) throw new Error('Missing required import source.');
  const importer = IMPORTERS[String(source).toLowerCase()];
  if (!importer) throw new Error(`Unsupported import source: ${source}`);
  const file = resolve(requireFileArg(flags, ['file', 'source-file', 'path'], positionalFile, 'file'));
  const input = await readFile(file, 'utf8');
  const options = {};
  const now = getFlag(flags, ['now']);
  if (now && now !== true) options.now = String(now);
  if (booleanFlag(flags, ['complete', 'curated-complete', 'curatedComplete'], false)) options.complete = true;
  const bundlePath = resolve(String(getFlag(flags, ['bundle'], DEFAULT_BUNDLE)));
  let vault;
  if (getFlag(flags, ['write-vault'], false) === true) {
    await ensureBundle(bundlePath, flags);
    ({ vault } = await loadState(bundlePath, { passphrase: getFlag(flags, ['passphrase']) }));
    options.vault = vault;
  }
  const report = importer(input, options);
  if (vault) await persistState(bundlePath, vault, { passphrase: getFlag(flags, ['passphrase']) });
  const out = getFlag(flags, ['out']);
  const reportOut = out && out !== true ? resolve(String(out)) : undefined;
  if (reportOut) await writeJson(reportOut, report);
  const batchReceipt = vault ? createImportBatchReceipt(report, options) : undefined;
  const preview = createImportPreview(report, options);
  const previewOutput = {
    ...preview,
    source_file: '<source-file>',
    source_file_redacted: true,
    bundle: vault ? publicPathDisplay(bundlePath, 'bundle-path') : undefined,
    vault_write_performed: Boolean(vault),
    import_batch_receipt: batchReceipt,
    raw_report_written: Boolean(reportOut),
    report_out: reportOut ? publicPathDisplay(reportOut, 'out') : undefined,
    claim_boundaries: {
      provider_native_memory_canonical: false,
      provider_deletion_proof: false,
      model_forgetting_proof: false,
      raw_memory_printed: false,
      imported_candidates_canonical_only_after_vault_write: true,
    },
  };
  printImportPreview(previewOutput, flags, io);
  return report.memory_candidates?.length > 0 || report.ok === true ? 0 : 1;
}

function importWriteMemoryAddr(write) {
  if (!write || typeof write !== 'object') return undefined;
  return typeof write.memory_addr === 'string' && write.memory_addr.length > 0 ? write.memory_addr : undefined;
}

function importRollbackCandidateRef(write, index) {
  const candidateId = write?.candidate_id ?? `candidate_${index}`;
  return `ref:import-candidate:${String(candidateId).replace(/[^A-Za-z0-9._~:@#?=&%+-]/gu, '_')}`;
}

function publicDeleteReceiptHash(result) {
  if (typeof result?.receipt?.receipt_hash === 'string') return result.receipt.receipt_hash;
  if (typeof result?.receipt?.receipt_id === 'string') return sha256Json(result.receipt.receipt_id);
  return sha256Json(result ?? {});
}

export async function importRollbackCommand(flags, io, positionalFile = undefined) {
  const reportPath = resolve(String(requireFileArg(flags, ['file', 'report', 'import-report', 'importReport'], positionalFile, 'file')));
  const report = await readJson(reportPath);
  const writes = Array.isArray(report.vault_writes) ? report.vault_writes : [];
  const bundlePath = resolve(String(getFlag(flags, ['bundle'], DEFAULT_BUNDLE)));
  const { vault, passport } = await loadState(bundlePath, { passphrase: getFlag(flags, ['passphrase']) });
  const now = getFlag(flags, ['now']);
  const generatedAt = now && now !== true ? String(now) : new Date().toISOString();
  const tombstones = [];
  const skipped = [];
  for (let index = 0; index < writes.length; index += 1) {
    const write = writes[index];
    const memoryAddr = importWriteMemoryAddr(write);
    const candidateRef = importRollbackCandidateRef(write, index);
    const memoryAddrCommitment = sha256PublicValue(memoryAddr ?? candidateRef);
    if (!memoryAddr) {
      skipped.push({ candidate_ref: candidateRef, memory_addr_commitment: memoryAddrCommitment, reason_code: 'memory_addr_missing' });
      continue;
    }
    if (vault.tombstones.has(memoryAddr)) {
      skipped.push({ candidate_ref: candidateRef, memory_addr_commitment: memoryAddrCommitment, reason_code: 'already_tombstoned' });
      continue;
    }
    if (!vault.activeAddresses.has(memoryAddr)) {
      skipped.push({ candidate_ref: candidateRef, memory_addr_commitment: memoryAddrCommitment, reason_code: 'not_active' });
      continue;
    }
    const result = deleteMemory({
      vault,
      passport,
      memory_addr: memoryAddr,
      reason: getFlag(flags, ['reason'], 'import_rollback'),
      now: generatedAt,
    });
    tombstones.push({
      candidate_ref: candidateRef,
      memory_addr_commitment: memoryAddrCommitment,
      tombstone_ref: `ref:import-rollback-tombstone:${sha256Json(result.tombstone).slice('sha256:'.length, 'sha256:'.length + 32)}`,
      receipt_hash: publicDeleteReceiptHash(result),
      event_commitment: sha256Json(result.event ?? {}),
    });
  }
  if (tombstones.length > 0) await persistState(bundlePath, vault, { passphrase: getFlag(flags, ['passphrase']) });
  const receipt = {
    schema: 'enigma.import_rollback_receipt.v1',
    ok: true,
    generated_at: generatedAt,
    report_ref: `ref:import-report:${report.report_id ?? sha256Json(report)}`,
    source_file: '<import-report-file>',
    source_file_redacted: true,
    bundle: publicPathDisplay(bundlePath, 'bundle-path'),
    requested_write_count: writes.length,
    tombstoned_count: tombstones.length,
    skipped_count: skipped.length,
    tombstones,
    skipped,
    roots: {
      tombstone_root: sha256Json(tombstones.map((item) => item.tombstone_ref)),
      receipt_root: sha256Json(tombstones.map((item) => item.receipt_hash)),
      skipped_root: sha256Json(skipped),
    },
    claim_boundaries: {
      local_enigma_vault_only: true,
      provider_deletion_proof: false,
      model_forgetting_proof: false,
      raw_memory_returned: false,
      local_paths_redacted: true,
    },
  };
  const out = getFlag(flags, ['out']);
  if (out && out !== true) await writeJson(resolve(String(out)), receipt);
  printImportRollbackReceipt(receipt, flags, io);
  return 0;
}

export async function capsuleExportCommand(flags, io, positionalFile = undefined) {
  const file = resolve(requireFileArg(flags, ['file', 'report'], positionalFile, 'file'));
  const input = await readJson(file);
  const now = getFlag(flags, ['now']);
  const capsule = exportEnigmaCapsule({
    reports: Array.isArray(input) ? input : (input.reports ?? input.report ?? input),
    memory_candidates: input.memory_candidates ?? input.memoryCandidates,
    now: now && now !== true ? String(now) : undefined,
  });
  const out = resolve(String(getFlag(flags, ['out'], 'enigma-capsule.json')));
  await writeJson(out, capsule);
  const output = {
    ok: capsule.schema === 'enigma.import_capsule.v1',
    schema: capsule.schema,
    capsule_id: capsule.capsule_id,
    out,
    public_artifacts: capsule.public_artifacts,
    verifier_metadata: capsule.verifier_metadata,
  };
  printCapsuleExportResult(output, flags, io);
  return 0;
}

export async function capsuleImportCommand(flags, io, positionalFile = undefined) {
  const file = resolve(requireFileArg(flags, ['file', 'capsule'], positionalFile, 'file'));
  const capsule = await readJson(file);
  const bundlePath = resolve(String(getFlag(flags, ['bundle'], DEFAULT_BUNDLE)));
  let vault;
  const options = {};
  const now = getFlag(flags, ['now']);
  if (now && now !== true) options.now = String(now);
  if (getFlag(flags, ['write-vault'], false) === true) {
    await ensureBundle(bundlePath, flags);
    ({ vault } = await loadState(bundlePath, { passphrase: getFlag(flags, ['passphrase']) }));
    options.vault = vault;
  }
  const result = importEnigmaCapsule(capsule, options);
  if (vault) await persistState(bundlePath, vault, { passphrase: getFlag(flags, ['passphrase']) });
  printCapsuleImportResult({ ...publicCapsuleImportResult(result), source_file: file, bundle: vault ? bundlePath : undefined, bundle_written: Boolean(vault) }, flags, io);
  return result.ok ? 0 : 1;
}

export async function relayDemoCommand(_flags, io) {
  print(relayServer.runRelayDemo(), io);
  return 0;
}

export async function relayServeCommand(flags, io) {
  return serveHttpCommand({
    flags,
    io,
    service: 'enigma-relay',
    createServer: () => createServiceServer({
      flags,
      io,
      service: 'enigma-relay',
      createState: relayServer.createRelayState,
      handleRequest: relayServer.handleRelayRequest,
      loadStateFromFile: relayServer.loadRelayStateFromFile,
      saveStateToFile: relayServer.saveRelayStateToFile,
      stateMutatingRequest: stateMutatingRelayRequest,
    }),
    defaultPort: DEFAULT_RELAY_PORT,
  });
}

export async function gatewayDemoCommand(_flags, io) {
  print(gatewayServer.runGatewayDemo(), io);
  return 0;
}

export async function gatewayServeCommand(flags, io) {
  return serveHttpCommand({
    flags,
    io,
    service: 'enigma-gateway',
    createServer: () => createServiceServer({
      flags,
      io,
      service: 'enigma-gateway',
      createState: gatewayServer.createGatewayState,
      handleRequest: gatewayServer.handleGatewayRequest,
      loadStateFromFile: gatewayServer.loadGatewayStateFromFile,
      saveStateToFile: gatewayServer.saveGatewayStateToFile,
      stateMutatingRequest: stateMutatingGatewayRequest,
    }),
    defaultPort: DEFAULT_GATEWAY_PORT,
  });
}

export async function claudeMcpbPackageCommand(flags, io) {
  const report = await buildClaudeMcpbPackage({
    mcpb: getFlag(flags, ['mcpb']) ?? undefined,
    out: getFlag(flags, ['out']) ?? undefined,
    version: getFlag(flags, ['version']) ?? undefined,
  });
  printClaudeMcpbPackageReport(report, flags, io, Boolean(getFlag(flags, ['out'])));
  return 0;
}

export async function nativeHostManifestCommand(flags, io) {
  const browser = String(requireFlag(flags, ['browser'])).toLowerCase();
  const manifest = createNativeHostManifest({
    browser,
    hostPath: requireFlag(flags, ['host-path', 'hostPath'], 'host-path'),
    extensionId: requireFlag(flags, ['extension-id', 'extensionId'], 'extension-id'),
  });
  const allowedAppCount = (Array.isArray(manifest.allowed_origins) ? manifest.allowed_origins.length : 0)
    + (Array.isArray(manifest.allowed_extensions) ? manifest.allowed_extensions.length : 0);
  if (flags.has('out')) {
    const outPath = resolve(String(requireFlag(flags, ['out'])));
    await writeJson(outPath, manifest);
    printNativeHostManifestResult({ ok: true, browser, host_name: manifest.name, allowed_app_count: allowedAppCount, out_written: true, result: { ok: true, path: outPath } }, flags, io);
  } else {
    printNativeHostManifestResult({ ok: true, browser, host_name: manifest.name, allowed_app_count: allowedAppCount, out_written: false, result: manifest }, flags, io);
  }
  return 0;
}

function defaultNativeHostInstallPlanOs(platform = process.platform) {
  if (platform === 'win32') return 'windows';
  if (platform === 'darwin') return 'macos';
  return 'linux';
}

function defaultNativeHostInstallPlanHome(os) {
  if (os === 'windows') return process.env.USERPROFILE ?? process.env.HOME;
  return process.env.HOME ?? process.env.USERPROFILE;
}

export async function nativeHostInstallPlanCommand(flags, io) {
  const os = String(getFlag(flags, ['os'], defaultNativeHostInstallPlanOs())).toLowerCase();
  const plan = createNativeHostInstallPlan({
    browser: requireFlag(flags, ['browser']),
    manifestPath: requireFlag(flags, ['manifest']),
    os,
    homeDir: getFlag(flags, ['home', 'home-dir', 'homeDir'], defaultNativeHostInstallPlanHome(os)),
  });
  printNativeHostInstallPlan(plan, flags, io);
  return 0;
}

function numberFlag(flags, names, label = names[0], fallback = undefined) {
  const value = getFlag(flags, names, fallback);
  if (value === undefined) return undefined;
  if (value === true || value === '') throw new Error(`Missing required --${label}.`);
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`--${label} must be a finite number.`);
  return number;
}

function integerFlag(flags, names, label = names[0], fallback = undefined) {
  const number = numberFlag(flags, names, label, fallback);
  if (number === undefined) return undefined;
  if (!Number.isSafeInteger(number)) throw new Error(`--${label} must be an integer.`);
  return number;
}
function parseImportanceFlag(flags) {
  const raw = getFlag(flags, ['importance', 'priority']);
  if (raw === undefined || raw === null || raw === '') return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error('--importance must be a number between 0 and 1.');
  if (value < 0 || value > 1) throw new Error('--importance must be between 0 and 1.');
  return value;
}


function flagValues(flags, names) {
  const values = [];
  for (const name of names) {
    const value = getFlag(flags, [name]);
    const entries = Array.isArray(value) ? value : [value];
    for (const entry of entries) {
      if (entry === undefined || entry === true || entry === '') continue;
      for (const item of String(entry).split(',')) {
        const trimmed = item.trim();
        if (trimmed) values.push(trimmed);
      }
    }
  }
  return values;
}

function renderChainPlain(summary, outWritten = false) {
  const idEntry = Object.entries(summary).find(([key]) => key.endsWith('_id'));
  const hashEntry = Object.entries(summary).find(([key]) => key.endsWith('_hash'));
  const lines = [
    'Enigma proof network artifact',
    'Status: Ready',
    `Artifact type: ${summary.artifact_type ?? '<artifact-type>'}`,
  ];
  if (idEntry) lines.push(`Artifact id: ${idEntry[1]}`);
  if (hashEntry) lines.push(`Artifact hash: ${hashEntry[1]}`);
  lines.push(`Transaction submitted: ${summary.transaction_submitted === true ? 'yes' : 'no'}`);
  lines.push(`Raw memory on-chain: ${summary.raw_memory_on_chain === true ? 'yes' : 'no'}`);
  if (outWritten) lines.push('Proof artifact: written to <out>');
  lines.push('Boundary: local proof-network artifact only; no raw memory, local paths, private keys, network submission, provider deletion, model behavior, hosted service, benchmark superiority, token ROI, or compliance claims.');
  return `${lines.join('\n')}\n`;
}

function printChainArtifact(summary, flags, io, outWritten = false, jsonResult = summary) {
  if (nextPlainRequested(flags)) io.stdout.write(renderChainPlain(summary, outWritten));
  else print(jsonResult, io);
}

function renderChainVerifyPlain(report) {
  const errors = Array.isArray(report.validation?.errors) ? report.validation.errors : [];
  const lines = [
    'Enigma proof network verify',
    `Status: ${report.ok ? 'Ready' : 'Needs attention'}`,
    `Artifact type: ${report.artifact_type ?? '<artifact-type>'}`,
    `Errors: ${errors.length}`,
    `Transaction submitted: ${report.transaction_submitted === true ? 'yes' : 'no'}`,
    `Raw memory on-chain: ${report.raw_memory_on_chain === true ? 'yes' : 'no'}`,
  ];
  for (const error of errors.slice(0, 3)) lines.push(`Issue: ${error}`);
  lines.push('Boundary: local proof-network verification only; no raw memory, local paths, private keys, network submission, provider deletion, model behavior, hosted service, benchmark superiority, token ROI, or compliance claims.');
  return `${lines.join('\n')}\n`;
}

function printChainVerifyReport(report, flags, io) {
  if (nextPlainRequested(flags)) io.stdout.write(renderChainVerifyPlain(report));
  else print(report, io);
}

function renderSolanaSubmitPlain(report) {
  const lines = [
    'Enigma proof network Solana submit',
    `Status: ${report.ok ? 'Ready' : 'Needs attention'}`,
    `Mode: ${report.mode ?? 'dry-run'}`,
    `Cluster: ${report.cluster ?? '<cluster>'}`,
    `Transaction submitted: ${report.transaction_submitted === true ? 'yes' : 'no'}`,
    `Raw memory on-chain: ${report.raw_memory_on_chain === true ? 'yes' : 'no'}`,
    `Artifact type: ${report.artifact_type ?? '<artifact-type>'}`,
    `Proof commitment: ${report.proof_commitment ?? '<proof-commitment>'}`,
    `Memo payload: ${report.would_submit?.payload ?? 'memo_ref'}`,
  ];
  if (report.signature) lines.push(`Signature: ${report.signature}`);
  lines.push('Boundary: Solana Memo carries compact public memo_ref only; no raw memory, artifact body, prompts, transcripts, embeddings, provider responses, private keys, local paths, provider deletion, model behavior, hosted service, benchmark superiority, token ROI, or compliance claims.');
  return `${lines.join('\n')}\n`;
}

function printSolanaSubmitReport(report, flags, io) {
  if (nextPlainRequested(flags)) io.stdout.write(renderSolanaSubmitPlain(report));
  else print(report, io);
}

function chainWriteOrPrint(flags, io, artifact, summary) {
  if (flags.has('out')) {
    const outPath = resolve(String(requireFlag(flags, ['out'])));
    return writeJson(outPath, artifact).then(() => {
      const jsonResult = {
        ok: true,
        path: publicPathDisplay(String(requireFlag(flags, ['out'])), 'proof-network-artifact'),
        transaction_submitted: false,
        raw_memory_on_chain: false,
        ...summary,
      };
      printChainArtifact(jsonResult, flags, io, true, jsonResult);
      return 0;
    });
  }
  printChainArtifact({
    transaction_submitted: false,
    raw_memory_on_chain: false,
    ...summary,
  }, flags, io, false, artifact);
  return 0;
}

async function sha256PublicFile(path) {
  const bytes = await readFile(path);
  try {
    assertNoPrivateProofPayload(JSON.parse(bytes.toString('utf8')));
  } catch (error) {
    if (error instanceof SyntaxError) return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    throw new Error('Report file contains private proof payload markers.');
  }
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function scoreFlags(flags) {
  const scores = {};
  for (const value of flagValues(flags, ['score', 'scores', 'metric', 'metrics'])) {
    const eq = value.indexOf('=');
    if (eq <= 0) throw new Error('--score values must use name=value.');
    const key = value.slice(0, eq).trim();
    const raw = value.slice(eq + 1).trim();
    if (!key || !raw) throw new Error('--score values must use name=value.');
    const numeric = Number(raw);
    scores[key] = Number.isFinite(numeric) && raw !== '' ? numeric : raw;
  }
  return scores;
}


function assertChainArtifact(validate, artifact) {
  const result = chainValidationResult(validate, artifact);
  if (!result.ok) throw new Error(result.errors?.join('; ') || 'Invalid proof-network artifact.');
  return artifact;
}
function chainValidationResult(validate, artifact) {
  assertNoPrivateProofPayload(artifact);
  const result = validate(artifact);
  if (result === false) return { ok: false };
  if (result && typeof result === 'object') return { ok: result.ok !== false, ...result };
  return { ok: true };
}

function chainArtifactValidator(artifact) {
  const schema = String(artifact?.schema ?? artifact?.type ?? artifact?.artifact_type ?? '');
  if (schema === 'enigma.proof_network.anchor_batch.v1') return [schema, validateProofNetworkAnchorBatch];
  if (schema === 'enigma.proof_network.capability_grant.v1') return [schema, validateCapabilityGrant];
  if (schema === 'enigma.proof_network.capability_revocation.v1') return [schema, validateCapabilityRevocation];
  if (schema === 'enigma.proof_network.benchmark_attestation.v1') return [schema, validateBenchmarkAttestation];
  if (schema === 'enigma.proof_network.packet.v1') return [schema, validateProofNetworkPacket];
  if (schema === 'enigma.proof_network.registry_entry.v1') return [schema, validateRegistryEntry];
  if (schema === 'enigma.proof_network.registry_batch.v1') return [schema, validateRegistryBatch];
  throw new Error(schema ? 'Unsupported proof-network artifact schema.' : 'Unsupported proof-network artifact schema: missing.');
}

const SOLANA_SUBMIT_CLUSTERS = new Set(['devnet', 'testnet', 'mainnet-beta', 'localnet']);
const SOLANA_MEMO_PROGRAM_ID = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

function solanaSubmitCluster(flags) {
  const cluster = String(requireFlag(flags, ['cluster'], 'cluster'));
  if (!SOLANA_SUBMIT_CLUSTERS.has(cluster)) {
    throw new Error('--cluster must be one of devnet, testnet, mainnet-beta, or localnet.');
  }
  return cluster;
}

function createSolanaProofMemoRef(schema, artifact, cluster) {
  const artifactHash = proofNetworkSha256Json(artifact);
  const proofCommitment = proofNetworkSha256Json({
    rail: 'solana-memo-v1',
    cluster,
    artifact_type: schema,
    artifact_hash: artifactHash,
  });
  return {
    v: 1,
    protocol: 'enigma-proof-network',
    rail: 'solana-memo',
    cluster,
    artifact_type: schema,
    artifact_hash: artifactHash,
    proof_commitment: proofCommitment,
  };
}

function solanaSubmitRpcLabel(flags, cluster) {
  return getFlag(flags, ['rpc']) ? '<custom-rpc>' : `${cluster}:default`;
}

function solanaSubmitDryRunExplanation() {
  return 'Dry run only. Execute mode would submit one Solana Memo instruction containing only memo_ref JSON: schema, artifact hash, cluster, and compact proof commitment. The raw artifact body, memory, prompts, transcripts, embeddings, provider responses, private keys, and local paths are not included.';
}

async function loadSolanaWeb3() {
  try {
    return await import('@solana/web3.js');
  } catch {
    throw new Error('Solana execute mode requires optional dependency @solana/web3.js. Install package dependencies before using --execute.');
  }
}

async function readSolanaKeypair(path) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw new Error('Unable to read a valid Solana --keypair JSON array.');
  }
  if (!Array.isArray(parsed) || parsed.length !== 64) throw new Error('Solana --keypair must be a JSON array of 64 secret-key bytes.');
  const bytes = new Uint8Array(parsed.length);
  for (let i = 0; i < parsed.length; i += 1) {
    const value = parsed[i];
    if (!Number.isInteger(value) || value < 0 || value > 255) throw new Error('Solana --keypair must be a JSON array of 64 secret-key bytes.');
    bytes[i] = value;
  }
  return bytes;
}

function solanaSubmitRpcUrl(flags, cluster, clusterApiUrl) {
  const rpc = getFlag(flags, ['rpc']);
  if (rpc !== undefined && rpc !== true && rpc !== '') return String(lastFlagValue(rpc));
  if (cluster === 'localnet') return 'http://127.0.0.1:8899';
  return clusterApiUrl(cluster);
}

async function submitSolanaMemoTransaction(flags, cluster, memoRef) {
  const keypairPath = resolve(String(requireFlag(flags, ['keypair'], 'keypair')));
  const secretKey = await readSolanaKeypair(keypairPath);
  const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, clusterApiUrl, sendAndConfirmTransaction } = await loadSolanaWeb3();
  let payer;
  try {
    payer = Keypair.fromSecretKey(secretKey);
  } catch {
    throw new Error('Solana --keypair could not be loaded as a signer.');
  }
  const connection = new Connection(solanaSubmitRpcUrl(flags, cluster, clusterApiUrl), 'confirmed');
  const memoBytes = Buffer.from(JSON.stringify(memoRef), 'utf8');
  const transaction = new Transaction().add(new TransactionInstruction({
    keys: [],
    programId: new PublicKey(SOLANA_MEMO_PROGRAM_ID),
    data: memoBytes,
  }));
  try {
    return await sendAndConfirmTransaction(connection, transaction, [payer], { commitment: 'confirmed' });
  } catch {
    throw new Error('Solana submission failed before a public-safe transaction signature was returned.');
  }
}

export async function chainSubmitSolanaCommand(flags, io, positionalFile = undefined) {
  const inPath = resolve(String(requireFileArg(flags, ['file', 'in'], positionalFile, 'file')));
  const cluster = solanaSubmitCluster(flags);
  let artifact;
  try {
    artifact = await readJson(inPath);
  } catch {
    throw new Error('Unable to read a valid proof artifact JSON file.');
  }
  assertNoPrivateProofPayload(artifact);
  const [schema, validate] = chainArtifactValidator(artifact);
  const result = chainValidationResult(validate, artifact);
  if (result.ok !== true) throw new Error(result.errors?.join('; ') || 'Invalid proof-network artifact.');
  const memoRef = createSolanaProofMemoRef(schema, artifact, cluster);
  const execute = booleanFlag(flags, ['execute'], false);
  if (!execute) {
    const report = {
      ok: true,
      command: 'chain submit-solana',
      mode: 'dry-run',
      chain: 'solana',
      cluster,
      rpc_endpoint: solanaSubmitRpcLabel(flags, cluster),
      transaction_submitted: false,
      raw_memory_on_chain: false,
      artifact_type: schema,
      artifact_hash: memoRef.artifact_hash,
      proof_commitment: memoRef.proof_commitment,
      memo_program: SOLANA_MEMO_PROGRAM_ID,
      memo_ref: memoRef,
      would_submit: {
        instruction_count: 1,
        program: 'spl-memo',
        payload: 'memo_ref',
      },
      validation: result,
      explanation: solanaSubmitDryRunExplanation(),
    };
    printSolanaSubmitReport(report, flags, io);
    return 0;
  }
  const signature = await submitSolanaMemoTransaction(flags, cluster, memoRef);
  const report = {
    ok: true,
    command: 'chain submit-solana',
    mode: 'execute',
    chain: 'solana',
    cluster,
    rpc_endpoint: solanaSubmitRpcLabel(flags, cluster),
    transaction_submitted: true,
    raw_memory_on_chain: false,
    signature,
    artifact_type: schema,
    artifact_hash: memoRef.artifact_hash,
    proof_commitment: memoRef.proof_commitment,
    memo_program: SOLANA_MEMO_PROGRAM_ID,
    memo_ref: memoRef,
    validation: result,
  };
  printSolanaSubmitReport(report, flags, io);
  return 0;
}

export async function chainAnchorCommand(flags, io) {
  const roots = flagValues(flags, ['root', 'roots', 'memory-root', 'memoryRoot', 'receipt-root', 'receiptRoot', 'context-root', 'contextRoot', 'memory-commitment-root', 'memoryCommitmentRoot']);
  if (roots.length === 0) throw new Error('Missing required --root.');
  const refs = flagValues(flags, ['ref', 'refs', 'public-ref', 'publicRef']);
  const publicChainRef = getFlag(flags, ['public-chain-ref', 'publicChainRef', 'chain-ref', 'chainRef'], 'solana:local-plan');
  const batch = createProofNetworkAnchorBatch({
    roots,
    root_count: roots.length,
    commitment_count: roots.length,
    refs,
    public_chain_ref: publicChainRef,
    authority_ref: getFlag(flags, ['authority', 'authority-ref', 'authorityRef']),
    batch_ref: getFlag(flags, ['batch-ref', 'batchRef']),
    created_at: getFlag(flags, ['created-at', 'createdAt']),
    transaction_submitted: false,
    raw_memory_on_chain: false,
  });
  assertChainArtifact(validateProofNetworkAnchorBatch, batch);
  return chainWriteOrPrint(flags, io, batch, {
    artifact_type: batch.schema,
    anchor_batch_id: batch.anchor_batch_id,
    anchor_batch_hash: batch.anchor_batch_hash ?? proofNetworkSha256Json(batch),
  });
}

export async function chainGrantCommand(flags, io) {
  const resourceRefs = flagValues(flags, ['resource-root', 'resource-roots', 'resourceRoot', 'resourceRoots', 'resource-ref', 'resource-refs', 'resourceRef', 'resourceRefs', 'ref', 'refs']);
  const capability = requireFlag(flags, ['capability', 'capability-id', 'capabilityId'], 'capability');
  const scope = requireFlag(flags, ['scope', 'scope-ref', 'scopeRef', 'capability-scope', 'capabilityScope'], 'scope');
  const policyHash = getFlag(flags, ['policy-hash', 'policyHash'], proofNetworkSha256Json({ capability, scope, resource_refs: resourceRefs }));
  const grant = createCapabilityGrant({
    issuer_ref: getFlag(flags, ['issuer', 'issuer-ref', 'issuerRef'], 'issuer:local-cli'),
    subject_ref: requireFlag(flags, ['subject', 'subject-ref', 'subjectRef'], 'subject'),
    capability,
    scope,
    scopes: scope,
    capability_scope: scope,
    resource_roots: resourceRefs.length ? resourceRefs : [policyHash],
    policy_hash: policyHash,
    expires_at: requireFlag(flags, ['expires-at', 'expiresAt'], 'expires-at'),
    grant_ref: getFlag(flags, ['grant-ref', 'grantRef']),
    issued_at: getFlag(flags, ['issued-at', 'issuedAt', 'created-at', 'createdAt']),
    transaction_submitted: false,
    raw_memory_on_chain: false,
  });
  assertChainArtifact(validateCapabilityGrant, grant);
  return chainWriteOrPrint(flags, io, grant, {
    artifact_type: grant.schema,
    capability_grant_id: grant.capability_grant_id,
    capability_grant_hash: grant.capability_grant_hash ?? proofNetworkSha256Json(grant),
  });
}

export async function chainRevokeCommand(flags, io) {
  const grantValue = getFlag(flags, ['grant']);
  let grantHash = getFlag(flags, ['grant-hash', 'grantHash']);
  let grantId = getFlag(flags, ['grant-id', 'grantId']);
  if (grantValue !== undefined && grantValue !== true && grantValue !== '') {
    const grantString = String(grantValue);
    if (grantString.startsWith('sha256:')) {
      grantHash = grantHash ?? grantString;
    } else {
      const grantArtifact = await readJson(resolve(grantString));
      const grantValidation = validateCapabilityGrant(grantArtifact);
      if (!grantValidation.ok) throw new Error(`Grant artifact is invalid: ${grantValidation.errors.join('; ')}`);
      grantHash = grantHash ?? grantArtifact.capability_grant_hash;
      grantId = grantId ?? grantArtifact.capability_grant_id;
    }
  }
  const nullifierValue = getFlag(flags, ['nullifier-root', 'nullifierRoot', 'nullifier-ref', 'nullifierRef', 'nullifier']);
  const revocation = createCapabilityRevocation({
    grant_id: grantId,
    grant_hash: grantHash ?? requireFlag(flags, ['grant-hash', 'grantHash'], 'grant-hash'),
    reason_ref: requireFlag(flags, ['reason', 'revocation-reason', 'revocationReason'], 'reason'),
    revocation_reason: getFlag(flags, ['reason', 'revocation-reason', 'revocationReason']),
    revocation_ref: getFlag(flags, ['revocation-ref', 'revocationRef']),
    nullifier_root: nullifierValue && String(nullifierValue).startsWith('sha256:') ? nullifierValue : undefined,
    nullifier_ref: nullifierValue && !String(nullifierValue).startsWith('sha256:') ? nullifierValue : undefined,
    revoked_at: getFlag(flags, ['revoked-at', 'revokedAt']),
    transaction_submitted: false,
    raw_memory_on_chain: false,
  });
  assertChainArtifact(validateCapabilityRevocation, revocation);
  return chainWriteOrPrint(flags, io, revocation, {
    artifact_type: revocation.schema,
    capability_revocation_id: revocation.capability_revocation_id,
    capability_revocation_hash: revocation.capability_revocation_hash ?? proofNetworkSha256Json(revocation),
  });
}

export async function chainAttestCommand(flags, io) {
  const reportHash = getFlag(flags, ['report-hash', 'reportHash']);
  const reportFile = getFlag(flags, ['report-file', 'reportFile']);
  const resolvedReportHash = reportHash || (reportFile ? await sha256PublicFile(resolve(String(reportFile))) : undefined);
  if (!resolvedReportHash) throw new Error('Missing required --report-hash or --report-file.');
  const scores = scoreFlags(flags);
  const metricsHash = getFlag(flags, ['metrics-hash', 'metricsHash'], proofNetworkSha256Json({ scores }));
  const attestation = createBenchmarkAttestation({
    report_hash: resolvedReportHash,
    report_file_hash: resolvedReportHash,
    dataset_ref: requireFlag(flags, ['dataset-ref', 'datasetRef', 'dataset-manifest', 'datasetManifest'], 'dataset-ref'),
    runner_ref: requireFlag(flags, ['runner-ref', 'runnerRef'], 'runner-ref'),
    package_ref: requireFlag(flags, ['package-ref', 'packageRef'], 'package-ref'),
    metrics: scores,
    metrics_hash: metricsHash,
    attestation_ref: getFlag(flags, ['attestation-ref', 'attestationRef']),
    created_at: getFlag(flags, ['created-at', 'createdAt']),
    transaction_submitted: false,
    raw_memory_on_chain: false,
  });
  assertChainArtifact(validateBenchmarkAttestation, attestation);
  return chainWriteOrPrint(flags, io, attestation, {
    artifact_type: attestation.schema,
    benchmark_attestation_id: attestation.benchmark_attestation_id,
    benchmark_attestation_hash: attestation.benchmark_attestation_hash ?? proofNetworkSha256Json(attestation),
  });
}

export async function chainVerifyCommand(flags, io, positionalFile = undefined) {
  const inPath = resolve(String(requireFileArg(flags, ['file', 'in'], positionalFile, 'file')));
  const artifact = await readJson(inPath);
  const [schema, validate] = chainArtifactValidator(artifact);
  let result;
  try {
    result = chainValidationResult(validate, artifact);
  } catch (error) {
    result = { ok: false, error: { code: 'PROOF_NETWORK_INVALID', message: error.message } };
  }
  printChainVerifyReport({
    ok: result.ok === true,
    artifact_type: schema,
    artifact_hash: proofNetworkSha256Json(artifact),
    transaction_submitted: false,
    raw_memory_on_chain: false,
    validation: result,
  }, flags, io);
  return result.ok === true ? 0 : 1;
}

export async function chainRegisterCommand(flags, io) {
  const entryType = requireFlag(flags, ['entry-type', 'entryType', 'type'], 'entry-type');
  const artifactHashFlag = getFlag(flags, ['artifact-hash', 'artifactHash', 'digest-ref', 'digestRef', 'artifact-ref', 'artifactRef']);
  const artifactFile = getFlag(flags, ['artifact-file', 'artifactFile']);
  const resolvedArtifactHash = artifactHashFlag || (artifactFile ? await sha256PublicFile(resolve(String(artifactFile))) : undefined);
  if (!resolvedArtifactHash) throw new Error('Missing required --artifact-hash or --artifact-file.');
  const digestRefs = flagValues(flags, ['digest-ref', 'digest-refs', 'digestRef', 'digestRefs', 'root', 'roots']);
  const entry = createRegistryEntry({
    entry_type: entryType,
    artifact_hash: resolvedArtifactHash,
    artifact_schema_ref: requireFlag(flags, ['artifact-schema-ref', 'artifactSchemaRef', 'schema-ref', 'schemaRef'], 'artifact-schema-ref'),
    digest_refs: digestRefs.length ? digestRefs : resolvedArtifactHash,
    signer_refs: flagValues(flags, ['signer', 'signers', 'signer-ref', 'signerRef', 'signer-refs', 'signerRefs', 'attestor', 'attestor-ref', 'attestorRef']),
    registry_ref: getFlag(flags, ['registry-ref', 'registryRef', 'marketplace-ref', 'marketplaceRef']),
    entry_ref: getFlag(flags, ['entry-ref', 'entryRef']),
    entry_count: getFlag(flags, ['entry-count', 'entryCount', 'count']),
    created_at: getFlag(flags, ['created-at', 'createdAt', 'registered-at', 'registeredAt']),
    transaction_submitted: false,
    raw_memory_on_chain: false,
  });
  assertChainArtifact(validateRegistryEntry, entry);
  return chainWriteOrPrint(flags, io, entry, {
    artifact_type: entry.schema,
    registry_entry_id: entry.registry_entry_id,
    registry_entry_hash: entry.registry_entry_hash ?? proofNetworkSha256Json(entry),
  });
}

export async function chainRegistryCommand(flags, io, positionalFile = undefined) {
  const entryPaths = flagValues(flags, ['entry', 'entries', 'entry-file', 'entryFile']);
  const positionalEntry = positionalFile && !String(positionalFile).startsWith('--') ? positionalFile : undefined;
  const paths = entryPaths.length ? entryPaths : (positionalEntry ? [positionalEntry] : []);
  if (paths.length === 0) throw new Error('Missing required --entry <registry-entry.json>.');
  const entries = [];
  for (const entryPath of paths) {
    const entry = await readJson(resolve(entryPath));
    assertNoPrivateProofPayload(entry);
    entries.push(entry);
  }
  const batch = createRegistryBatch({
    entries,
    registry_ref: getFlag(flags, ['registry-ref', 'registryRef', 'marketplace-ref', 'marketplaceRef']),
    created_at: getFlag(flags, ['created-at', 'createdAt']),
    transaction_submitted: false,
    raw_memory_on_chain: false,
  });
  assertChainArtifact(validateRegistryBatch, batch);
  return chainWriteOrPrint(flags, io, batch, {
    artifact_type: batch.schema,
    registry_batch_id: batch.registry_batch_id,
    registry_batch_hash: batch.registry_batch_hash ?? proofNetworkSha256Json(batch),
  });
}


export async function meterEventCommand(flags, io) {
  const event = createUsageEvent({
    tenant_id: requireFlag(flags, ['tenant', 'tenant-id', 'tenantId'], 'tenant'),
    meter_id: getFlag(flags, ['meter', 'meter-id', 'meterId'], 'default'),
    provider: requireFlag(flags, ['provider']),
    model: requireFlag(flags, ['model']),
    operation: getFlag(flags, ['operation'], 'memory.inference'),
    timestamp: getFlag(flags, ['timestamp', 'created-at', 'createdAt']),
    prompt_tokens: integerFlag(flags, ['prompt-tokens', 'promptTokens', 'input-tokens', 'inputTokens'], 'prompt-tokens', 0),
    completion_tokens: integerFlag(flags, ['completion-tokens', 'completionTokens', 'output-tokens', 'outputTokens'], 'completion-tokens', 0),
    memory_baseline_tokens: integerFlag(flags, ['memory-baseline-tokens', 'memoryBaselineTokens', 'baseline-prompt-tokens', 'baselinePromptTokens'], 'memory-baseline-tokens', 0),
    memory_optimized_tokens: integerFlag(flags, ['memory-optimized-tokens', 'memoryOptimizedTokens', 'optimized-prompt-tokens', 'optimizedPromptTokens'], 'memory-optimized-tokens', 0),
    pricing: {
      currency: getFlag(flags, ['currency'], 'USD'),
      input_price_per_million_tokens: numberFlag(flags, ['input-price-per-million-tokens', 'inputPricePerMillionTokens', 'price-per-million-tokens', 'pricePerMillionTokens'], 'price-per-million-tokens', 0),
      output_price_per_million_tokens: numberFlag(flags, ['output-price-per-million-tokens', 'outputPricePerMillionTokens', 'price-per-million-tokens', 'pricePerMillionTokens'], 'price-per-million-tokens', 0),
    },
  });
  if (flags.has('out')) {
    const outPath = resolve(String(requireFlag(flags, ['out'])));
    await writeJson(outPath, event);
    printMeterEventResult(event, flags, io, true, { ok: true, path: outPath, event_id: event.event_id, event_hash: event.event_hash });
  } else {
    printMeterEventResult(event, flags, io);
  }
  return 0;
}

export async function meterAggregateCommand(flags, io, positionalFile) {
  const inPath = resolve(String(requireFileArg(flags, ['events', 'in'], positionalFile, 'events')));
  const source = await readJson(inPath);
  const aggregate = aggregateUsageEvents({
    events: Array.isArray(source) ? source : source.events,
    tenant_id: getFlag(flags, ['tenant', 'tenant-id', 'tenantId']),
    meter_id: getFlag(flags, ['meter', 'meter-id', 'meterId'], 'aggregate'),
    generated_at: getFlag(flags, ['generated-at', 'generatedAt']),
  });
  if (flags.has('out')) {
    const outPath = resolve(String(requireFlag(flags, ['out'])));
    await writeJson(outPath, aggregate);
    printMeterAggregateResult(aggregate, flags, io, true, { ok: true, path: outPath, aggregate_id: aggregate.aggregate_id, aggregate_hash: aggregate.aggregate_hash });
  } else {
    printMeterAggregateResult(aggregate, flags, io);
  }
  return 0;
}

export async function settlementJobCommand(flags, io) {
  const job = createPermissionlessMemoryJob({
    tenant_id: requireFlag(flags, ['tenant', 'tenant-id', 'tenantId'], 'tenant'),
    job_type: requireFlag(flags, ['job-type', 'jobType'], 'job-type'),
    memory_commitment_root: requireFlag(flags, ['memory-root', 'memory-commitment-root', 'memoryCommitmentRoot'], 'memory-root'),
    policy_hash: requireFlag(flags, ['policy-hash', 'policyHash'], 'policy-hash'),
    usage_event_hash: requireFlag(flags, ['usage-event-hash', 'usageEventHash'], 'usage-event-hash'),
    requested_at: getFlag(flags, ['requested-at', 'requestedAt']),
    expires_at: requireFlag(flags, ['expires-at', 'expiresAt'], 'expires-at'),
    max_price_amount: numberFlag(flags, ['max-price-amount', 'maxPriceAmount'], 'max-price-amount'),
    payment_asset: getFlag(flags, ['payment-asset', 'paymentAsset', 'asset'], 'USDC'),
  });
  if (flags.has('out')) {
    const outPath = resolve(String(requireFlag(flags, ['out'])));
    await writeJson(outPath, job);
    printSettlementArtifact('job', job, flags, io, true, { ok: true, path: outPath, job_id: job.job_id, job_hash: job.job_hash });
  } else {
    printSettlementArtifact('job', job, flags, io);
  }
  return 0;
}

export async function settlementCapacityCommand(flags, io) {
  const profile = createConsumerGpuCapacityProfile({
    operator_id: requireFlag(flags, ['operator', 'operator-id', 'operatorId'], 'operator'),
    accelerator_class: requireFlag(flags, ['accelerator-class', 'acceleratorClass'], 'accelerator-class'),
    hardware_ref: requireFlag(flags, ['hardware-ref', 'hardwareRef'], 'hardware-ref'),
    region: requireFlag(flags, ['region'], 'region'),
    model_family: requireFlag(flags, ['model-family', 'modelFamily'], 'model-family'),
    model_refs: parseList(requireFlag(flags, ['model-ref', 'model-refs', 'modelRefs'], 'model-ref')),
    observed_at: getFlag(flags, ['observed-at', 'observedAt']),
    expires_at: requireFlag(flags, ['expires-at', 'expiresAt'], 'expires-at'),
    vram_gb: numberFlag(flags, ['vram-gb', 'vramGb'], 'vram-gb'),
    max_context_window_tokens: numberFlag(flags, ['max-context-window-tokens', 'maxContextWindowTokens'], 'max-context-window-tokens'),
    available_context_tokens_per_minute: numberFlag(flags, ['available-context-tokens-per-minute', 'availableContextTokensPerMinute'], 'available-context-tokens-per-minute'),
    p95_latency_ms: numberFlag(flags, ['p95-latency-ms', 'p95LatencyMs'], 'p95-latency-ms'),
    price_per_million_context_tokens: numberFlag(flags, ['price-per-million-context-tokens', 'pricePerMillionContextTokens'], 'price-per-million-context-tokens'),
    asset: getFlag(flags, ['asset', 'settlement-asset', 'settlementAsset'], 'USDC'),
    capacity_ref: requireFlag(flags, ['capacity-ref', 'capacityRef'], 'capacity-ref'),
    terms_ref: requireFlag(flags, ['terms-ref', 'termsRef'], 'terms-ref'),
  });
  if (flags.has('out')) {
    const outPath = resolve(String(requireFlag(flags, ['out'])));
    await writeJson(outPath, profile);
    printSettlementArtifact('capacity', profile, flags, io, true, { ok: true, path: outPath, capacity_profile_hash: profile.capacity_profile_hash });
  } else {
    printSettlementArtifact('capacity', profile, flags, io);
  }
  return 0;
}

export async function settlementQuoteCommand(flags, io) {
  const jobPath = resolve(String(requireFileArg(flags, ['job'], undefined, 'job')));
  const capacityProfilePath = getFlag(flags, ['capacity-profile', 'capacityProfile']);
  const capacityProfile = capacityProfilePath ? await readJson(resolve(String(capacityProfilePath))) : null;
  const job = await readJson(jobPath);
  const quote = createOperatorServiceQuote({
    job,
    operator_id: requireFlag(flags, ['operator', 'operator-id', 'operatorId'], 'operator'),
    service_kind: requireFlag(flags, ['service-kind', 'serviceKind'], 'service-kind'),
    quoted_at: getFlag(flags, ['quoted-at', 'quotedAt']),
    expires_at: requireFlag(flags, ['expires-at', 'expiresAt'], 'expires-at'),
    price_amount: numberFlag(flags, ['price-amount', 'priceAmount'], 'price-amount'),
    asset: getFlag(flags, ['asset', 'payment-asset', 'paymentAsset']),
    capacity_ref: capacityProfile ? capacityProfile.capacity_ref : requireFlag(flags, ['capacity-ref', 'capacityRef'], 'capacity-ref'),
    terms_ref: requireFlag(flags, ['terms-ref', 'termsRef'], 'terms-ref'),
    capacity_profile: capacityProfile,
  });
  if (flags.has('out')) {
    const outPath = resolve(String(requireFlag(flags, ['out'])));
    await writeJson(outPath, quote);
    printSettlementArtifact('quote', quote, flags, io, true, { ok: true, path: outPath, quote_id: quote.quote_id, quote_hash: quote.quote_hash });
  } else {
    printSettlementArtifact('quote', quote, flags, io);
  }
  return 0;
}

export async function settlementReceiptCommand(flags, io) {
  const job = await readJson(resolve(String(requireFileArg(flags, ['job'], undefined, 'job'))));
  const quote = await readJson(resolve(String(requireFileArg(flags, ['quote'], undefined, 'quote'))));
  const receipt = createServiceSettlementReceipt({
    job,
    quote,
    completed_at: getFlag(flags, ['completed-at', 'completedAt']),
    settled_amount: numberFlag(flags, ['settled-amount', 'settledAmount'], 'settled-amount'),
    settlement_ref: requireFlag(flags, ['settlement-ref', 'settlementRef'], 'settlement-ref'),
    service_receipt_ref: requireFlag(flags, ['service-receipt-ref', 'serviceReceiptRef'], 'service-receipt-ref'),
  });
  if (flags.has('out')) {
    const outPath = resolve(String(requireFlag(flags, ['out'])));
    await writeJson(outPath, receipt);
    printSettlementArtifact('receipt', receipt, flags, io, true, { ok: true, path: outPath, receipt_ref: receipt.receipt_ref ?? receipt.receipt_id ?? receipt.settlement_ref ?? null });
  } else {
    printSettlementArtifact('receipt', receipt, flags, io);
  }
  return 0;
}

export async function settlementVerifyCommand(flags, io) {
  const job = await readJson(resolve(String(requireFileArg(flags, ['job'], undefined, 'job'))));
  const quote = await readJson(resolve(String(requireFileArg(flags, ['quote'], undefined, 'quote'))));
  const receipt = await readJson(resolve(String(requireFileArg(flags, ['receipt'], undefined, 'receipt'))));
  const result = verifyServiceSettlementReceipt({ job, quote, receipt });
  printSettlementVerifyResult(result, flags, io);
  return result.ok ? 0 : 1;
}

export async function settlementBatchCommand(flags, io, positionalFile) {
  const receiptsPath = resolve(String(requireFileArg(flags, ['receipts', 'in'], positionalFile, 'receipts')));
  const source = await readJson(receiptsPath);
  const batch = createSettlementBatch({
    receipts: Array.isArray(source) ? source : source.receipts,
    asset: getFlag(flags, ['asset']),
    batch_ref: requireFlag(flags, ['batch-ref', 'batchRef'], 'batch-ref'),
    generated_at: getFlag(flags, ['generated-at', 'generatedAt']),
  });
  if (flags.has('out')) {
    const outPath = resolve(String(requireFlag(flags, ['out'])));
    await writeJson(outPath, batch);
    printSettlementArtifact('batch', batch, flags, io, true, { ok: true, path: outPath, batch_id: batch.batch_id, batch_hash: batch.batch_hash });
  } else {
    printSettlementArtifact('batch', batch, flags, io);
  }
  return 0;
}

export async function controllerGrantCommand(flags, io) {
  const operations = parseList(getFlag(flags, ['operations']));
  const memoryZoneRefs = parseList(getFlag(flags, ['memory-zone-refs', 'memoryZoneRefs']));
  const proofRefs = parseList(getFlag(flags, ['proof-refs', 'proofRefs']));
  const receiptRefs = parseList(getFlag(flags, ['receipt-refs', 'receiptRefs']));
  const grant = createConsentGrant({
    app_ref: getFlag(flags, ['app-ref', 'appRef'], 'ref:app:cli'),
    purpose_ref: getFlag(flags, ['purpose-ref', 'purposeRef'], 'ref:purpose:cli_context'),
    operation: operations.length === 0 ? getFlag(flags, ['operation'], 'recall_context') : undefined,
    operations: operations.length === 0 ? undefined : operations,
    memory_zone_ref: memoryZoneRefs.length === 0 ? getFlag(flags, ['memory-zone-ref', 'memoryZoneRef'], 'ref:zone:default') : undefined,
    memory_zone_refs: memoryZoneRefs.length === 0 ? undefined : memoryZoneRefs,
    issued_at: getFlag(flags, ['issued-at', 'issuedAt', 'now'], new Date().toISOString()),
    expires_at: getFlag(flags, ['expires-at', 'expiresAt']),
    ttl_seconds: parseOptionalNumber(getFlag(flags, ['ttl-seconds', 'ttlSeconds'])),
    status: getFlag(flags, ['status']),
    grant_ref: getFlag(flags, ['grant-ref', 'grantRef']),
    policy_ref: getFlag(flags, ['policy-ref', 'policyRef'], 'ref:policy:cli-context'),
    proof_refs: proofRefs.length === 0 ? undefined : proofRefs,
    receipt_refs: receiptRefs.length === 0 ? undefined : receiptRefs,
  });
  const out = getFlag(flags, ['out']);
  if (out && out !== true) await writeJson(resolve(String(out)), grant);
  printControllerGrantResult(grant, 'grant', flags, io, out && out !== true);
  return 0;
}

export async function controllerRevokeCommand(flags, io, positionalFile) {
  const grantPath = resolve(String(requireFileArg(flags, ['grant-file', 'grantFile', 'in'], positionalFile, 'grant-file')));
  const source = await readJson(grantPath);
  const proofRefs = parseList(getFlag(flags, ['proof-refs', 'proofRefs']));
  const receiptRefs = parseList(getFlag(flags, ['receipt-refs', 'receiptRefs']));
  const revoked = createConsentGrant({
    app_ref: source.app_ref,
    purpose_ref: source.purpose_ref,
    operations: source.operations,
    memory_zone_refs: source.memory_zone_refs,
    issued_at: source.issued_at,
    expires_at: source.expires_at,
    status: 'revoked',
    grant_ref: source.grant_ref,
    policy_ref: getFlag(flags, ['policy-ref', 'policyRef'], source.policy_ref),
    proof_refs: proofRefs.length === 0 ? source.proof_refs : proofRefs,
    receipt_refs: receiptRefs.length === 0 ? source.receipt_refs : receiptRefs,
  });
  const out = getFlag(flags, ['out']);
  if (out && out !== true) await writeJson(resolve(String(out)), revoked);
  printControllerGrantResult(revoked, 'revoke', flags, io, out && out !== true);
  return 0;
}

export async function controllerWeatherCommand(flags, io) {
  const evidenceRefs = parseList(getFlag(flags, ['evidence-ref', 'evidence-refs', 'evidenceRefs']));
  const issueCodes = parseList(getFlag(flags, ['issue-code', 'issue-codes', 'issueCodes']));
  const metric = getFlag(flags, ['metric'], 'active_grants');
  const count = parseOptionalNumber(getFlag(flags, ['count']));
  const tileStatus = getFlag(flags, ['tile-status', 'tileStatus']);
  const tileRequested = getFlag(flags, ['tile-ref', 'tileRef']) !== undefined || tileStatus !== undefined || count !== undefined || getFlag(flags, ['metric']) !== undefined;
  const tiles = tileRequested ? [{
    tile_ref: getFlag(flags, ['tile-ref', 'tileRef'], `ref:tile:${String(metric).replace(/[^a-z0-9_:-]/giu, '_')}`),
    status: tileStatus ?? 'sunny',
    metric,
    count: count ?? 0,
    evidence_refs: evidenceRefs.length === 0 ? ['ref:evidence:weather'] : evidenceRefs,
  }] : undefined;
  const report = createMemoryWeatherReport({
    status: getFlag(flags, ['status']),
    generated_at: getFlag(flags, ['generated-at', 'generatedAt', 'now']),
    issue_codes: issueCodes.length === 0 ? undefined : issueCodes,
    evidence_refs: evidenceRefs.length === 0 ? undefined : evidenceRefs,
    tiles,
  });
  const out = getFlag(flags, ['out']);
  if (out && out !== true) await writeJson(resolve(String(out)), report);
  printControllerWeatherResult(report, flags, io, out && out !== true);
  return 0;
}

export async function controllerBubbleCommand(flags, io, positionalFile) {
  const action = String(getFlag(flags, ['action'], getFlag(flags, ['bubble-file', 'bubbleFile', 'in'], positionalFile) ? 'discard' : 'open'));
  const out = getFlag(flags, ['out']);
  if (action === 'open') {
    const appRefs = parseList(getFlag(flags, ['app-refs', 'appRefs']));
    const receiptRefs = parseList(getFlag(flags, ['receipt-refs', 'receiptRefs']));
    const bubble = createPrivateMemoryBubble({
      app_ref: appRefs.length === 0 ? getFlag(flags, ['app-ref', 'appRef'], 'ref:app:cli') : undefined,
      app_refs: appRefs.length === 0 ? undefined : appRefs,
      purpose_ref: getFlag(flags, ['purpose-ref', 'purposeRef'], 'ref:purpose:private_bubble'),
      candidate_count: parseOptionalNumber(getFlag(flags, ['candidate-count', 'candidateCount'])) ?? 0,
      started_at: getFlag(flags, ['started-at', 'startedAt', 'now'], new Date().toISOString()),
      bubble_ref: getFlag(flags, ['bubble-ref', 'bubbleRef']),
      receipt_refs: receiptRefs.length === 0 ? undefined : receiptRefs,
    });
    if (out && out !== true) await writeJson(resolve(String(out)), bubble);
    printControllerBubbleResult(bubble, 'open', flags, io, out && out !== true);
    return 0;
  }
  if (action !== 'keep' && action !== 'discard') throw new Error('controller bubble --action must be open, keep, or discard');
  const bubblePath = resolve(String(requireFileArg(flags, ['bubble-file', 'bubbleFile', 'in'], positionalFile, 'bubble-file')));
  const bubble = await readJson(bubblePath);
  const receiptRefs = parseList(getFlag(flags, ['receipt-refs', 'receiptRefs']));
  const closed = closePrivateMemoryBubble(bubble, {
    outcome: action,
    closed_at: getFlag(flags, ['closed-at', 'closedAt', 'now'], new Date().toISOString()),
    kept_count: parseOptionalNumber(getFlag(flags, ['kept-count', 'keptCount'])),
    discarded_count: parseOptionalNumber(getFlag(flags, ['discarded-count', 'discardedCount'])),
    receipt_refs: receiptRefs.length === 0 ? undefined : receiptRefs,
  });
  if (out && out !== true) await writeJson(resolve(String(out)), closed);
  printControllerBubbleResult(closed, action, flags, io, out && out !== true);
  return 0;
}

function humanUsage() {
  return `Enigma Memory CLI — local-first AI Memory Passport

Usage: enigma <command> [options]

Quick start:
  npm install -g enigma-memory
  enigma quickstart --bundle "$HOME/.enigma/bundle.json"
  enigma doctor --bundle "$HOME/.enigma/bundle.json"
  enigma connect claude-desktop --bundle "$HOME/.enigma/bundle.json" --dry-run
  echo "Your memory text" > memory.txt
  enigma remember --bundle "$HOME/.enigma/bundle.json" --text-file memory.txt
  enigma search  --bundle "$HOME/.enigma/bundle.json" --query "your topic"
  enigma context --bundle "$HOME/.enigma/bundle.json" --query "your topic" --out "$HOME/.enigma/context-pack.json"

Windows CMD uses %USERPROFILE% instead of $HOME:
  enigma remember --bundle "%USERPROFILE%\\.enigma\\bundle.json" --text-file memory.txt

Common commands:
  init, setup, start, quickstart, test-drive First-run / demo paths
  remember, recall, update, delete         Memory operations
  search, context                          Retrieval / context packs
  status, drive health, doctor, support summary
  connect <client>, disconnect <client>    MCP client connectors
  export, import <source>, capsule ...     Migration and packaging
  verify                                   Verify an exported bundle
  mcp serve, relay demo|serve,             Local service demos
    gateway demo|serve

If no AI clients are installed, setup still creates the local bundle and
skips connector writes. Connect later with enigma connect <client> or the
copy-paste MCP snippets in docs/client-connectors.md.

Run 'enigma --help' for JSON usage with all commands and options.`;
}

function usage() {
  return {
    usage: 'enigma <command> [options]',
    commands: [
      'init',
      'next',
      'setup',
      'quickstart',
      'start',
      'test-drive',
      'claude-mcpb package',
      'demo cross-model',
      'doctor',
      'install',
      'connect <client>',
      'disconnect <client>',
      'remember',
      'recall',
      'update',
      'delete',
      'context',
      'search',
      'controller grant',
      'controller revoke',
      'status',
      'passport status',
      'export',
      'import <source>',
      'capsule export',
      'capsule import',
      'verify',
      'boundary run',
      'mcp serve',
      'relay demo',
      'relay serve',
      'gateway demo',
      'gateway serve',
      'native-host manifest',
      'native-host install-plan',
      'mesh demo',
      'enterprise demo',
      'meter event',
      'meter aggregate',
      'settlement job',
      'settlement capacity',
      'settlement quote',
      'settlement receipt',
      'settlement verify',
      'settlement batch',
      'chain anchor',
      'chain grant',
      'chain revoke',
      'chain attest',
      'chain verify',
      'chain submit-solana',
      'chain register',
      'chain registry',
      'drive health',
    ],
    connector_options: {
      '--bundle <path>': 'Absolute local Enigma vault bundle path rendered as ENIGMA_BUNDLE.',
      '--config <path>': 'Client MCP JSON config path to read/write.',
      '--server-name <name>': 'MCP server key; defaults to enigma.',
      '--mcp-command <command>': 'Command rendered in MCP config; defaults to enigma-mcp. Alias: --command.',
      '--dry-run': 'Print planned config without writing.',
    },
    remember_options: {
      '--text <text>': 'Inline local memory text. Avoid for private content because argv can be logged by process tooling. Alias: --memory-text.',
      '--text-file <path>': 'Read local memory text from a file so private smoke input is not exposed in shell argv. Aliases: --memory-file, --textFile, --memoryFile.',
      '--importance <0-1>': 'Optional numeric importance/priority in [0,1]; higher values rank the memory higher in optimized context. Alias: --priority.',
      '--plain': 'Print a human-readable memory lifecycle receipt instead of JSON for remember, update, or delete. Alias: --text or --format text.',
    },
    recall_options: {
      '--id <memory_addr>': 'Memory address to read and receipt locally. Alias: --memory-addr.',
      '--include-content': 'Explicit opt-in to include plaintext in JSON output. Plain output still summarizes without printing raw memory.',
      '--plain': 'Print a human-readable recall receipt instead of JSON. Alias: --text or --format text.',
    },
    context_options: {
      '--query <text>': 'Local query. When non-empty, only query-relevant active memories are returned by default. Alias: --q.',
      '--bundle <path>': 'Bundle JSON to compile context from. Defaults to .enigma/bundle.json.',
      '--limit <n>': 'Maximum active memories to return. Defaults to 8.',
      '--include-unrelated': 'Escape hatch: include memories with no query token overlap. Alias: --no-strict-relevance.',
      '--optimize': 'Force the query-aware optimizer; enabled automatically when a non-empty query is present.',
      '--max-estimated-tokens <n>': 'Token budget for the optimized context pack.',
      '--price-per-million-tokens <n>': 'Pricing input for cost estimates.',
      '--currency <code>': 'Currency for cost estimates. Defaults to USD.',
      '--proof': 'Return public-safe context proof bundle instead of selected memory plaintext. Aliases: --with-proof, --withProof.',
      '--out <path>': 'Write the context or proof JSON to a local file.',
      '--plain': 'Print a human-readable context/proof summary instead of JSON or memory plaintext. Alias: --text or --format text.',
      '--require-grant': 'Fail closed with enigma.context_pack_recall_blocked.v1 unless a matching Memory Controller grant is supplied.',
      '--grant-file <path>': 'Read a public-safe consent grant JSON file. Repeatable. Alias: --grantFile.',
      '--grant <json>': 'Inline public-safe consent grant JSON for non-private automation.',
      '--grants-file <path>': 'Read a public-safe grant array or { grants } JSON object. Repeatable. Alias: --grantsFile.',
      '--app-ref/--purpose-ref/--memory-zone-ref <ref>': 'Opaque scope refs checked against supplied grants.',
      '--policy-ref <ref>': 'Opaque policy ref checked against supplied grants. Defaults to ref:policy:cli-context.',
      '--now <iso>': 'Trusted timestamp for deterministic tests; defaults to current local time.',
    },
    proof_options: {
      'enigma export --bundle <path> --out <path> --plain': 'Write a public-safe local proof bundle and print a path-redacted receipt summary.',
      'enigma verify --export <path> --plain': 'Verify a local proof bundle and print a path-redacted offline verification summary.',
    },
    controller_options: {
      'controller grant': 'Create a public-safe Memory Controller consent grant for local context recall.',
      'controller revoke': 'Mark an existing public-safe Memory Controller grant revoked without exposing memory.',
      'controller weather': 'Create a public-safe Memory Weather report for dashboard/review status.',
      'controller bubble': 'Open or close a public-safe Private Memory Bubble receipt without exposing memory.',
      '--grant-file <path>': 'Grant JSON to revoke for controller revoke. Positional file is also accepted.',
      '--app-ref <ref>': 'Opaque connected-app ref. Defaults to ref:app:cli.',
      '--purpose-ref <ref>': 'Opaque purpose ref. Defaults to ref:purpose:cli_context.',
      '--operation <id>': 'Grant operation. Defaults to recall_context.',
      '--memory-zone-ref <ref>': 'Opaque memory zone ref. Defaults to ref:zone:default.',
      '--ttl-seconds <n>': 'Grant lifetime in seconds when --expires-at is omitted.',
      '--issued-at/--now <iso>': 'Grant issue timestamp. Defaults to current local time.',
      '--expires-at <iso>': 'Explicit grant expiration timestamp. If omitted, ttl-seconds is applied.',
      '--out <path>': 'Write grant, weather, or bubble JSON for later review without printing local paths.',
      '--status <sunny|needs_attention|storm_warning>': 'Optional Memory Weather status override for controller weather.',
      '--issue-code <code>': 'Optional public-safe weather issue code; repeat or comma-separate.',
      '--tile-status/--metric/--count': 'Optional single weather tile fields for controller weather.',
      '--action <open|keep|discard>': 'Private Bubble action. Open is default unless a bubble file is supplied; discard is default for close.',
      '--bubble-file <path>': 'Open Private Bubble JSON to close. Positional file is also accepted.',
      '--candidate-count <n>': 'Candidate count for an opened Private Bubble.',
      '--kept-count/--discarded-count <n>': 'Optional close counts for keep/discard actions.',
      '--plain': 'Print a path-redacted consent/weather/bubble summary instead of JSON. Alias: --text or --format text.',
    },
    search_options: {
      '--query <text>': 'Required local query. Output redacts the query and memory plaintext by default. Alias: --q.',
      '--bundle <path>': 'Bundle JSON to search. Defaults to .enigma/bundle.json.',
      '--limit <n>': 'Maximum ranked active memories to return. Defaults to 8.',
      '--json': 'Reserved for explicit JSON output; CLI output is JSON by default.',
      '--include-content': 'Opt in to returning plaintext local memory content in the JSON result.',
      '--include-unrelated': 'Escape hatch: include memories with no query token overlap. Alias: --no-strict-relevance.',
      '--plain': 'Print a human-readable search summary instead of JSON. Alias: --text or --format text.',
    },
    status_options: {
      'enigma status --bundle <path>': 'Show local Memory Passport counts, roots, owner display fields, connector readiness, and next commands.',
      'enigma passport status --bundle <path>': 'Alias for enigma status.',
      '--plain': 'Print path-redacted local counters and the next setup action instead of JSON. Alias: --text or --format text.',
    },
    doctor_options: {
      'enigma doctor --bundle <path>': 'Run local install, package, bundle, schema, MCP command, and connector checks.',
      '--plain': 'Print one human-readable next action instead of JSON. Alias: --text or --format text.',
    },
    support_options: {
      'enigma support summary --bundle <path>': 'Collect public-safe local support state for a support ticket or self-diagnosis.',
      '--plain': 'Print a human-readable support summary instead of JSON. Alias: --text or --format text.',
      '--out <path>': 'Write the public-safe JSON summary to a file.',
    },
    init_options: {
      '--dry-run': 'Print the first-run plan without writing local artifacts or client configs.',
      '--bundle <path>': 'Bundle JSON to create. Defaults to .enigma/bundle.json.',
      '--out-dir <path>': 'Directory for context-pack.json, export.json, and verify-report.json. Defaults to the bundle directory.',
      '--client <id|auto>': `Client to plan; repeat or comma-separate. Use auto to plan installed/config-present clients, falling back to ${DEFAULT_SETUP_CLIENTS.join(', ')}.`,
      '--connect': 'Explicitly write selected client MCP configs; with default client selection, writes only installed/config-present client configs and skips missing configs.',
      '--memory-file <path>': 'Read local memory text from a file without echoing plaintext. Alias: --text-file.',
      '--memory-text <text>': 'Inline demo-only memory text. Avoid for private content because argv can be logged.',
      '--overwrite': 'Replace existing local first-run artifacts.',
      '--plain': 'Print a human-readable first-run summary with next commands instead of JSON. Alias: --text or --format text.',
    },
    setup_options: {
      '--bundle <path>': 'Bundle JSON to create. Defaults to .enigma/bundle.json.',
      '--out-dir <path>': 'Directory for context-pack.json, export.json, and verify-report.json. Defaults to the bundle directory.',
      '--client <id|auto>': `Client to plan; repeat or comma-separate. Use auto to plan installed/config-present clients, falling back to ${DEFAULT_SETUP_CLIENTS.join(', ')}.`,
      '--connect-installed': 'Auto-select installed/config-present clients and write only those existing client configs; missing client configs are reported and skipped.',
      '--memory-file <path>': 'Read local memory text from a file without echoing plaintext. Alias: --text-file.',
      '--memory-text <text>': 'Inline demo-only memory text. Avoid for private content because argv can be logged.',
      '--overwrite': 'Replace existing local setup artifacts.',
      '--dry-run': 'Plan setup without writing local artifacts or client configs.',
      '--write-connectors': 'Also write selected client MCP config files. Defaults to false.',
      '--plain': 'Print a human-readable setup summary with next commands instead of JSON. Alias: --text or --format text.',
    },
    install_options: {
      'one-command installed clients': 'npm install -g enigma-memory && enigma quickstart --bundle ./.enigma/bundle.json && enigma doctor --bundle ./.enigma/bundle.json',
      'one-command Claude Desktop preview': 'npm install -g enigma-memory && enigma quickstart --bundle ./.enigma/bundle.json && enigma connect claude-desktop --bundle ./.enigma/bundle.json --dry-run',
      'one-command Cursor preview': 'npm install -g enigma-memory && enigma quickstart --bundle ./.enigma/bundle.json && enigma connect cursor --bundle ./.enigma/bundle.json --dry-run',
      'one-command Kimi Code preview': 'npm install -g enigma-memory && enigma quickstart --bundle ./.enigma/bundle.json && enigma connect kimi-code --bundle ./.enigma/bundle.json --dry-run',
      'one-command VS Code Cline preview': 'npm install -g enigma-memory && enigma quickstart --bundle ./.enigma/bundle.json && enigma connect vscode-cline --bundle ./.enigma/bundle.json --dry-run',
      '--client <id>': 'Limit generated MCP snippets to one supported client.',
      '--out <path>': 'Write generated MCP snippets to a JSON file for review without hand-editing client config JSON.',
      '--plain': 'Print a path-redacted install/connect summary instead of JSON snippets. Alias: --text or --format text.',
    },
    quickstart_options: {
      '--bundle <path>': 'Bundle JSON to create. Defaults to .enigma/bundle.json.',
      '--out-dir <path>': 'Directory for context-pack.json, export.json, and verify-report.json. Defaults to the bundle directory.',
      '--subject <id>': 'Local subject id. Defaults to local-user.',
      '--display-name <name>': 'Local display name. Defaults to Local user.',
      '--memory-file <path>': 'Read local memory text from a file. Alias: --text-file.',
      '--memory-text <text>': 'Inline demo memory text for non-private demos only.',
      '--overwrite': 'Replace existing quickstart output files.',
      '--plain': 'Print a human-readable quickstart summary with next commands instead of JSON. Alias: --text or --format text.',
    },
    test_drive_options: {
      '--out-dir <path>': `Isolated demo directory. Defaults to ${DEFAULT_TEST_DRIVE_DIR}.`,
      '--bundle <path>': `Bundle JSON to create. Defaults to ${DEFAULT_TEST_DRIVE_DIR}/${DEFAULT_TEST_DRIVE_BUNDLE_NAME}.`,
      '--client <id|auto>': 'Client setup planning passthrough. No client config files are written by test-drive.',
      '--overwrite': 'Replace existing test-drive artifact files.',
      '--dry-run': 'Plan the local test drive without writing artifacts.',
      '--plain': 'Print a path-redacted consumer test-drive summary instead of JSON. Alias: --text or --format text.',
    },
    cross_model_demo_options: {
      '--memory-file <path>': 'Seed the demo from a local file without echoing plaintext. Alias: --text-file.',
      '--out <path>': 'Write the same public-safe JSON report to a local file.',
      '--limit <n>': 'Maximum active memories per generated profile context pack. Defaults to 1 for the same-memory demo story.',
      '--plain': 'Print a path-redacted cross-model proof summary instead of JSON. Alias: --text or --format text.',
    },
    native_host: {
      bin: 'enigma-native-host',
      host_name: 'com.enigma.native_host',
      bundle_env: 'ENIGMA_BUNDLE',
      manifests: [
        'apps/native-host/manifests/com.enigma.native_host.chrome.json',
        'apps/native-host/manifests/com.enigma.native_host.edge.json',
        'apps/native-host/manifests/com.enigma.native_host.firefox.json',
      ],
      generator: 'enigma native-host manifest --browser <chrome|edge|firefox> --host-path <absolute path> --extension-id <id> [--out <file>]',
      install_plan: 'enigma native-host install-plan --browser <chrome|edge|firefox> --manifest <absolute path> [--os <windows|macos|linux>] [--home <absolute path>]',
      generator_options: {
        '--browser <chrome|edge|firefox>': 'Browser manifest format to generate or plan.',
        '--host-path <absolute path>': 'Absolute path to the installed enigma-native-host executable.',
        '--extension-id <id>': 'Browser extension id allowed to connect to the native host.',
        '--out <file>': 'Write manifest JSON to a file instead of stdout.',
        '--plain': 'Print a path-redacted native-host manifest summary instead of manifest JSON. Alias: --text or --format text.',
      },
      install_plan_options: {
        '--browser <chrome|edge|firefox>': 'Browser whose native messaging registration targets should be planned.',
        '--manifest <absolute path>': 'Absolute path to the generated native messaging manifest to register manually.',
        '--os <windows|macos|linux>': 'Target operating system. Defaults to the current operating system.',
        '--home <absolute path>': 'Target user home directory used to compute per-user manifest locations.',
        '--plain': 'Print a path-redacted native-host install-plan summary instead of JSON. Alias: --text or --format text.',
      },
      boundary: 'Browser native messaging returns local context plus receipt summaries only; provider-native memory remains cache only.',
    },
    metering: {
      event: 'enigma meter event --tenant <id> --provider <id> --model <id> --prompt-tokens <n> --completion-tokens <n> --memory-baseline-tokens <n> --memory-optimized-tokens <n> --price-per-million-tokens <n> [--out <file>] [--plain]',
      aggregate: 'enigma meter aggregate --events <events.json> [--tenant <id>] [--out <file>] [--plain]',
      '--plain': 'Print a path-redacted deterministic metering summary instead of JSON. Alias: --text or --format text.',
      boundary: 'Metering artifacts contain counts, hashes, identifiers, pricing inputs, and claim boundaries only; no prompts, completions, provider responses, credentials, token ROI, or provider-invoice savings claim.',
    },
    settlement: {
      job: 'enigma settlement job --tenant <id> --job-type <type> --memory-root <sha256:...> --policy-hash <sha256:...> --usage-event-hash <sha256:...> --max-price-amount <n> --payment-asset <asset> --expires-at <iso> [--out <file>] [--plain]',
      capacity: 'enigma settlement capacity --operator <id> --accelerator-class <consumer_gpu|workstation_gpu|edge_gpu> --hardware-ref <ref> --region <region> --model-family <family> --model-ref <id[,id]> --vram-gb <n> --max-context-window-tokens <n> --available-context-tokens-per-minute <n> --p95-latency-ms <n> --price-per-million-context-tokens <n> --capacity-ref <ref> --terms-ref <ref> --expires-at <iso> [--asset <asset>] [--out <file>] [--plain]',
      quote: 'enigma settlement quote --job <job.json> --operator <id> --service-kind <kind> --price-amount <n> --asset <asset> --capacity-ref <ref> --terms-ref <ref> --expires-at <iso> [--capacity-profile <profile.json>] [--out <file>] [--plain]',
      receipt: 'enigma settlement receipt --job <job.json> --quote <quote.json> --settled-amount <n> --settlement-ref <ref> --service-receipt-ref <ref> [--out <file>] [--plain]',
      verify: 'enigma settlement verify --job <job.json> --quote <quote.json> --receipt <receipt.json> [--plain]',
      batch: 'enigma settlement batch --receipts <receipts.json> --batch-ref <ref> [--asset <asset>] [--out <file>] [--plain]',
      '--plain': 'Print a path-redacted settlement summary instead of JSON. Alias: --text or --format text.',
      boundary: 'Settlement artifacts contain commitment roots, capacity profiles, hashes, refs, prices, and claim boundaries only; no raw memory, prompts, provider responses, credentials, token ROI/profit, decentralization, or provider-invoice savings claim.',
    },
    chain: {
      anchor: 'enigma chain anchor --root <sha256:...> [--root <sha256:...>] [--ref <public-ref>] [--authority <public-authority-ref>] [--batch-ref <ref>] [--out <file>] [--plain]',
      grant: 'enigma chain grant --subject <public-subject-ref> --capability <capability-id> --scope <scope-id> [--resource-ref <sha256:...>] [--policy-hash <sha256:...>] --expires-at <iso> [--grant-ref <public-ref>] [--out <file>] [--plain]',
      revoke: 'enigma chain revoke --grant-hash <sha256:...> --reason <public-reason-code> [--revocation-ref <public-ref>] [--out <file>] [--plain]',
      attest: 'enigma chain attest (--report-hash <sha256:...> | --report-file <report.json>) --dataset-ref <sha256:...> --runner-ref <public-runner-ref> --package-ref <public-package-ref> [--score name=value] [--out <file>] [--plain]',
      verify: 'enigma chain verify --file <proof-artifact.json> [--plain]',
      register: 'enigma chain register --entry-type <anchor_batch|benchmark_attestation|connector_conformance|health_report|operator_receipt|settlement_job> (--artifact-hash <sha256:...> | --artifact-file <artifact.json>) --artifact-schema-ref <schema-id> [--digest-ref <sha256:...>] [--signer <public-ref>] [--registry-ref <public-ref>] [--entry-ref <public-ref>] [--entry-count <n>] [--out <file>] [--plain]',
      registry: 'enigma chain registry --entry <registry-entry.json> [--entry <registry-entry.json>] [--registry-ref <public-ref>] [--out <file>] [--plain]',
      submit_solana: 'enigma chain submit-solana --file <proof-artifact.json> --cluster <devnet|testnet|mainnet-beta|localnet> [--rpc <url>] [--execute --keypair <solana-cli-64-byte-keypair.json>] [--plain]',
      '--plain': 'Print a path-redacted proof-network summary instead of JSON. Alias: --text or --format text.',
      boundary: 'Proof Network chain commands default to local planning and dry-run validation. submit-solana only submits a Solana Memo transaction when --execute is passed; it carries compact public-safe commitment/ref JSON, never raw memory or artifact bodies.',
    },
    memory_drive_health: {
      command: 'enigma drive health --bundle <path> [--now <iso>] [--benchmark-summary <path>] [--connector-summary <path>] [--replicas <path>] [--latest-anchor-batch-ref <ref>] [--out <file>]',
      schema: 'enigma.memory_drive_health_report.v1',
      output_shape: 'SMART-style report: overall_status/overall_score, ten metrics (freshness, duplicate_rate, tombstone_risk, stale_derived_artifacts, retrieval_hit_rate, token_reduction, leakage_scan, receipt_coverage, connector_health, sync_fork_risk), each with status/score/observed/thresholds/evidence_refs/recommended_actions, plus roots, privacy_boundaries, claim_boundaries, and a conservative proof_network_ready block.',
      options: {
        '--bundle <path>': 'Local Enigma vault bundle to inspect. Defaults to .enigma/bundle.json.',
        '--now <iso>': 'ISO-8601 timestamp used for age calculations. Defaults to a deterministic timestamp.',
        '--benchmark-summary <path>': 'Optional JSON file with public-safe retrieval probes (probe_count, top_k, hit_at_k, exact_coverage, abstention_correctness). Omit to default gracefully.',
        '--connector-summary <path>': 'Optional JSON file with public-safe connector health (connector_count, healthy_connector_count, lagging_connector_count, error_rate_24h, cursor_gap_count). Omit to default gracefully.',
        '--replicas <path>': 'Optional JSON file of replica root reports for sync fork risk.',
        '--latest-anchor-batch-ref <ref>': 'Optional public-safe proof-network anchor batch ref for receipt coverage.',
        '--out <path>': 'Write the JSON report to a file in addition to stdout.',
        '--plain': 'Print a human-readable health summary instead of JSON. Alias: --text or --format text.',
      },
      boundary: 'Computed locally from public-safe counters, roots, receipt metadata, tombstones, and derived/context-pack refs only. No network or chain calls; transaction_submitted and raw_memory_on_chain are always false. It is local operational evidence, not provider-deletion, model-forgetting, compliance, or live-chain-settlement proof.',
    },
    import_options: {
      'enigma import <source> --file <export.json>': 'Preview import candidates locally without printing memory plaintext.',
      'enigma import rollback --file <raw-import-report.json> --bundle <bundle.json>': 'Tombstone memories written by a prior import report and emit a public-safe rollback receipt.',
      '--out <path>': 'Write the raw local import report for capsule export or review. CLI stdout remains a public-safe preview.',
      'enigma capsule export --file <raw-import-report.json> --out <capsule.json> --plain': 'Export a path-redacted, claim-bounded capsule summary while writing the local capsule file.',
      'enigma capsule import --file <capsule.json> --plain': 'Verify an import capsule and print a path-redacted summary without writing to the Memory Drive unless --write-vault is present.',
      '--write-vault': 'Explicitly write accepted importer candidates into the selected local bundle.',
      '--bundle <path>': 'Bundle JSON to write when --write-vault is present. Defaults to .enigma/bundle.json.',
      '--plain': 'Print a human-readable import or rollback summary instead of JSON. Alias: --text or --format text.',
    },
    relay_gateway_options: {
      '--host <host>': 'Bind host. Defaults to 127.0.0.1.',
      '--port <port>': `Bind port. Defaults to ${DEFAULT_RELAY_PORT} for relay and ${DEFAULT_GATEWAY_PORT} for gateway.`,
      '--state-file <path>': 'Load and persist local relay/gateway demo state as JSON.',
      '--once': 'Start, report the listening address, persist state when configured, then close.',
    },
    connector_options: {
      'enigma connect <client> --bundle <path>': 'Plan or write local MCP client config for the selected app.',
      'enigma disconnect <client>': 'Plan or write local removal of the Enigma MCP entry from the selected app config.',
      '--dry-run': 'Preview config changes without writing files.',
      '--mcp-command <command>': 'MCP server command to write. Defaults to enigma-mcp; GUI apps may need an absolute path.',
      '--plain': 'Print a human-readable config summary instead of JSON. Alias: --text or --format text.',
    },
    kimi_code: {
      gui_path_note: 'GUI-launched Kimi Code may not inherit your shell PATH; pass --mcp-command with an absolute enigma-mcp path when needed.',
      example: 'enigma connect kimi-code --bundle "$HOME/.enigma/bundle.json" --mcp-command "/absolute/path/to/enigma-mcp"',
      tools: ['enigma_init', 'enigma_remember', 'enigma_search', 'enigma_context_pack', 'enigma_delete', 'enigma_verify_receipts'],
    },
    connector_write_behavior: 'Config writes preserve unrelated settings and sibling MCP servers. Existing configs are backed up only when the semantic JSON config changes; reconnecting an identical config is idempotent.',
    claim_boundaries: 'Connectors configure local MCP access to an Enigma bundle. They do not make provider-native memory canonical and do not prove provider deletion or model forgetting.',
    claude_mcpb_package: {
      command: 'enigma claude-mcpb package [--mcpb <path>] [--out <report.json>] [--version <semver>] [--plain]',
      '--plain': 'Print a path-redacted Claude MCPB package summary instead of JSON. Alias: --text or --format text.',
      boundary: 'Builds a deterministic Claude Desktop MCPB review package locally. It does not install, launch Claude, write client config, or perform network calls.',
    },
    import_sources: Object.keys(IMPORTERS),
    clients: supportedClients,
    bundle: DEFAULT_BUNDLE,
    human: humanUsage(),
  };
}

export async function main(argv = process.argv.slice(2), io = { stdout: process.stdout, stderr: process.stderr }) {
  const command = argv[0];
  const subcommand = argv[1];
  if (!command || command === '--help' || command === '-h' || command === '--help-human') {
    if (command === '--help-human') {
      io.stdout.write(`${humanUsage()}\n`);
    } else {
      print(usage(), io);
    }
    return 0;
  }
  const twoPartCommands = ['boundary', 'mcp', 'mesh', 'enterprise', 'capsule', 'relay', 'gateway', 'connect', 'disconnect', 'import', 'native-host', 'meter', 'settlement', 'chain', 'demo', 'passport', 'drive', 'controller', 'support', 'claude-mcpb'];
  const flags = parseArgs(twoPartCommands.includes(command) ? argv.slice(2) : argv.slice(1));
  const positionalFile = optionalPositional(argv[2]);
  if (command === 'help') {
    io.stdout.write(`${humanUsage()}\n`);
    return 0;
  }
  if ((command === 'chain' && (!subcommand || subcommand === '--help' || subcommand === '-h' || flags.has('help'))) || ((flags.has('help') || argv.includes('-h')) && (command === 'init' || command === 'setup' || command === 'start' || command === 'next' || command === 'quickstart' || command === 'test-drive' || command === 'search' || command === 'context' || command === 'status' || (command === 'passport' && subcommand === 'status') || ((command === 'relay' || command === 'gateway') && (subcommand === 'serve' || subcommand === 'demo')) || (command === 'native-host' && (subcommand === 'manifest' || subcommand === 'install-plan')) || (command === 'claude-mcpb' && subcommand === 'package') || (command === 'demo' && subcommand === 'cross-model') || (command === 'drive' && subcommand === 'health') || (command === 'controller' && (subcommand === 'grant' || subcommand === 'revoke' || subcommand === 'weather' || subcommand === 'bubble'))))) {
    print(usage(), io);
    return 0;
  }
  try {
    if (command === 'init') return await initCommand(flags, io);
    if (command === 'setup') return await setupCommand(flags, io);
    if (command === 'quickstart') return await quickstartCommand(flags, io);
    if (command === 'start') return await quickstartCommand(flags, io);
    if (command === 'test-drive') return await testDriveCommand(flags, io);
    if (command === 'demo' && subcommand === 'cross-model') return await crossModelDemoCommand(flags, io);
    if (command === 'doctor') return await doctorCommand(flags, io);
    if (command === 'support' && subcommand === 'summary') return await supportSummaryCommand(flags, io);
    if (command === 'install') return await installCommand(flags, io);
    if (command === 'connect') return await connectCommand(subcommand, flags, io);
    if (command === 'disconnect') return await disconnectCommand(subcommand, flags, io);
    if (command === 'remember') return await rememberCommand(flags, io);
    if (command === 'recall') return await recallCommand(flags, io);
    if (command === 'update') return await updateCommand(flags, io);
    if (command === 'delete') return await deleteCommand(flags, io);
    if (command === 'context') return await contextCommand(flags, io);
    if (command === 'search') return await searchCommand(flags, io);
    if (command === 'controller' && subcommand === 'grant') return await controllerGrantCommand(flags, io);
    if (command === 'controller' && subcommand === 'revoke') return await controllerRevokeCommand(flags, io, positionalFile);
    if (command === 'controller' && subcommand === 'weather') return await controllerWeatherCommand(flags, io);
    if (command === 'controller' && subcommand === 'bubble') return await controllerBubbleCommand(flags, io, positionalFile);
    if (command === 'next') return await nextCommand(flags, io);
    if (command === 'status') return await statusCommand(flags, io);
    if (command === 'passport' && subcommand === 'status') return await statusCommand(flags, io);
    if (command === 'drive' && subcommand === 'health') return await driveHealthCommand(flags, io);
    if (command === 'export') return await exportCommand(flags, io);
    if (command === 'import' && subcommand === 'rollback') return await importRollbackCommand(flags, io, positionalFile);
    if (command === 'import') return await importCommand(subcommand, flags, io, positionalFile);
    if (command === 'capsule' && subcommand === 'export') return await capsuleExportCommand(flags, io, positionalFile);
    if (command === 'capsule' && subcommand === 'import') return await capsuleImportCommand(flags, io, positionalFile);
    if (command === 'verify') return await verifyCommand(flags, io);
    if (command === 'boundary' && subcommand === 'run') return await boundaryRunCommand(flags, io);
    if (command === 'mcp' && subcommand === 'serve') return await mcpServeCommand(flags, io);
    if (command === 'relay' && subcommand === 'demo') return await relayDemoCommand(flags, io);
    if (command === 'relay' && subcommand === 'serve') return await relayServeCommand(flags, io);
    if (command === 'gateway' && subcommand === 'demo') return await gatewayDemoCommand(flags, io);
    if (command === 'gateway' && subcommand === 'serve') return await gatewayServeCommand(flags, io);
    if (command === 'claude-mcpb' && subcommand === 'package') return await claudeMcpbPackageCommand(flags, io);
    if (command === 'native-host' && subcommand === 'manifest') return await nativeHostManifestCommand(flags, io);
    if (command === 'meter' && subcommand === 'event') return await meterEventCommand(flags, io);
    if (command === 'meter' && subcommand === 'aggregate') return await meterAggregateCommand(flags, io, positionalFile);
    if (command === 'settlement' && subcommand === 'job') return await settlementJobCommand(flags, io);
    if (command === 'settlement' && subcommand === 'capacity') return await settlementCapacityCommand(flags, io);
    if (command === 'settlement' && subcommand === 'quote') return await settlementQuoteCommand(flags, io);
    if (command === 'settlement' && subcommand === 'receipt') return await settlementReceiptCommand(flags, io);
    if (command === 'settlement' && subcommand === 'verify') return await settlementVerifyCommand(flags, io);
    if (command === 'settlement' && subcommand === 'batch') return await settlementBatchCommand(flags, io, positionalFile);
    if (command === 'chain' && subcommand === 'anchor') return await chainAnchorCommand(flags, io);
    if (command === 'chain' && subcommand === 'grant') return await chainGrantCommand(flags, io);
    if (command === 'chain' && subcommand === 'revoke') return await chainRevokeCommand(flags, io);
    if (command === 'chain' && subcommand === 'attest') return await chainAttestCommand(flags, io);
    if (command === 'chain' && subcommand === 'verify') return await chainVerifyCommand(flags, io, positionalFile);
    if (command === 'chain' && subcommand === 'submit-solana') return await chainSubmitSolanaCommand(flags, io, positionalFile);
    if (command === 'chain' && subcommand === 'register') return await chainRegisterCommand(flags, io);
    if (command === 'chain' && subcommand === 'registry') return await chainRegistryCommand(flags, io, positionalFile);
    if (command === 'native-host' && subcommand === 'install-plan') return await nativeHostInstallPlanCommand(flags, io);
    if (command === 'mesh' && subcommand === 'demo') return await meshDemoCommand(flags, io);
    if (command === 'enterprise' && subcommand === 'demo') return await enterpriseDemoCommand(flags, io);
    throw new Error(`Unknown command: ${[command, subcommand].filter(Boolean).join(' ')}`);
  } catch (error) {
    if (nextPlainRequested(flags)) io.stdout.write(renderCliErrorPlain(command, error));
    else print({ ok: false, error: { code: 'CLI_ERROR', message: error.message } }, io);
    return 2;
  }
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
  process.exitCode = await main();
}
