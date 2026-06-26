import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { dirname, resolve } from 'node:path';
import { createVault, remember, recall, deleteMemory, exportBundle } from '../../vault/src/index.js';
import { createPassport, compileContextPack } from '../../passport/src/index.js';
import { verifyBundle } from '../../../apps/verifier/bin/enigma-verify.mjs';
import { aggregateUsageEvents, createUsageEvent } from '../../metering/src/index.js';
import {
  createConsumerGpuCapacityProfile,
  createOperatorServiceQuote,
  createPermissionlessMemoryJob,
  createServiceSettlementReceipt,
  createSettlementBatch,
  verifyServiceSettlementReceipt,
} from '../../settlement/src/index.js';

const DEFAULT_BUNDLE = '.enigma/bundle.json';
const JSONRPC_VERSION = '2.0';
const MCP_PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = Object.freeze({ name: 'enigma-mcp-server', version: '0.1.15' });
const JSON_RPC_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const JSON_RPC_ERROR = Object.freeze({
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
});

class JsonRpcProtocolError extends Error {
  constructor(code, message, data = undefined) {
    super(message);
    this.name = 'JsonRpcProtocolError';
    this.code = code;
    this.data = data;
  }
}

function invalidParams(message = 'Invalid params', data = undefined) {
  return new JsonRpcProtocolError(JSON_RPC_ERROR.INVALID_PARAMS, message, data);
}

function isJsonRpcProtocolError(error) {
  return error instanceof JsonRpcProtocolError;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isValidJsonRpcId(id) {
  return id === null
    || (typeof id === 'string' && JSON_RPC_ID_PATTERN.test(id))
    || (typeof id === 'number' && Number.isSafeInteger(id));
}

function ensureParamsObject(params, method) {
  if (params === undefined) return {};
  if (!isPlainObject(params)) throw invalidParams(`${method} params must be an object.`);
  return params;
}

function rejectAdditionalProperties(object, allowed, context) {
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) throw invalidParams(`${context} contains unsupported properties.`);
  }
}

function requireString(object, key, context) {
  if (typeof object[key] !== 'string') throw invalidParams(`${context} requires ${key} as a string.`);
}

function optionalString(object, key, context) {
  if (object[key] !== undefined && typeof object[key] !== 'string') {
    throw invalidParams(`${context} ${key} must be a string.`);
  }
}

function optionalPlainObject(object, key, context) {
  if (object[key] !== undefined && !isPlainObject(object[key])) {
    throw invalidParams(`${context} ${key} must be an object.`);
  }
}

function optionalStringArray(object, key, context) {
  if (object[key] === undefined) return;
  if (!Array.isArray(object[key]) || object[key].some((item) => typeof item !== 'string')) {
    throw invalidParams(`${context} ${key} must be an array of strings.`);
  }
}

function optionalLimit(object, key, context) {
  if (object[key] === undefined) return;
  if (!Number.isInteger(object[key]) || object[key] < 1 || object[key] > 50) {
    throw invalidParams(`${context} ${key} must be an integer from 1 through 50.`);
  }
}

function optionalBoolean(object, key, context) {
  if (object[key] !== undefined && typeof object[key] !== 'boolean') {
    throw invalidParams(`${context} ${key} must be a boolean.`);
  }
}

function optionalNonNegativeNumber(object, key, context) {
  if (object[key] === undefined) return;
  if (typeof object[key] !== 'number' || !Number.isFinite(object[key]) || object[key] < 0) {
    throw invalidParams(`${context} ${key} must be a non-negative number.`);
  }
}

function requireNumber(object, key, context) {
  if (typeof object[key] !== 'number' || !Number.isFinite(object[key])) {
    throw invalidParams(`${context} requires ${key} as a finite number.`);
  }
}

function optionalObjectArray(object, key, context) {
  if (object[key] === undefined) return;
  if (!Array.isArray(object[key]) || object[key].some((item) => !isPlainObject(item))) {
    throw invalidParams(`${context} ${key} must be an array of objects.`);
  }
}

function validateToolArguments(name, args) {
  if (!isPlainObject(args)) throw invalidParams('tools/call arguments must be an object.');
  switch (name) {
    case 'enigma_init':
      rejectAdditionalProperties(args, new Set(['bundlePath', 'tenant_id', 'subject_id', 'actor_id', 'policy_id']), name);
      optionalString(args, 'bundlePath', name);
      optionalString(args, 'tenant_id', name);
      optionalString(args, 'subject_id', name);
      optionalString(args, 'actor_id', name);
      optionalString(args, 'policy_id', name);
      return args;
    case 'enigma_remember':
      rejectAdditionalProperties(args, new Set(['bundlePath', 'text', 'purpose', 'tags', 'metadata']), name);
      optionalString(args, 'bundlePath', name);
      requireString(args, 'text', name);
      optionalString(args, 'purpose', name);
      optionalStringArray(args, 'tags', name);
      optionalPlainObject(args, 'metadata', name);
      return args;
    case 'enigma_search':
      rejectAdditionalProperties(args, new Set(['bundlePath', 'query', 'memory_addr', 'purpose', 'limit']), name);
      optionalString(args, 'bundlePath', name);
      optionalString(args, 'query', name);
      optionalString(args, 'memory_addr', name);
      optionalString(args, 'purpose', name);
      optionalLimit(args, 'limit', name);
      return args;
    case 'enigma_context_pack':
      rejectAdditionalProperties(args, new Set([
        'bundlePath',
        'query',
        'purpose',
        'limit',
        'memory_addresses',
        'optimize',
        'max_estimated_tokens',
        'price_per_million_tokens',
        'currency',
      ]), name);
      optionalString(args, 'bundlePath', name);
      optionalString(args, 'query', name);
      optionalString(args, 'purpose', name);
      optionalLimit(args, 'limit', name);
      optionalStringArray(args, 'memory_addresses', name);
      optionalBoolean(args, 'optimize', name);
      optionalNonNegativeNumber(args, 'max_estimated_tokens', name);
      optionalNonNegativeNumber(args, 'price_per_million_tokens', name);
      optionalString(args, 'currency', name);
      return args;
    case 'enigma_delete':
      rejectAdditionalProperties(args, new Set(['bundlePath', 'memory_addr', 'reason']), name);
      optionalString(args, 'bundlePath', name);
      requireString(args, 'memory_addr', name);
      optionalString(args, 'reason', name);
      return args;
    case 'enigma_verify_receipts':
      rejectAdditionalProperties(args, new Set(['bundlePath', 'bundle']), name);
      optionalString(args, 'bundlePath', name);
      optionalPlainObject(args, 'bundle', name);
      return args;
    case 'enigma_meter_usage':
      rejectAdditionalProperties(args, new Set([
        'events',
        'tenant_id',
        'meter_id',
        'provider',
        'model',
        'operation',
        'timestamp',
        'generated_at',
        'prompt_tokens',
        'completion_tokens',
        'memory_baseline_tokens',
        'memory_optimized_tokens',
        'currency',
        'input_price_per_million_tokens',
        'output_price_per_million_tokens',
        'price_per_million_tokens',
      ]), name);
      optionalObjectArray(args, 'events', name);
      optionalString(args, 'tenant_id', name);
      optionalString(args, 'meter_id', name);
      optionalString(args, 'provider', name);
      optionalString(args, 'model', name);
      optionalString(args, 'operation', name);
      optionalString(args, 'timestamp', name);
      optionalString(args, 'generated_at', name);
      optionalString(args, 'currency', name);
      optionalNonNegativeNumber(args, 'prompt_tokens', name);
      optionalNonNegativeNumber(args, 'completion_tokens', name);
      optionalNonNegativeNumber(args, 'memory_baseline_tokens', name);
      optionalNonNegativeNumber(args, 'memory_optimized_tokens', name);
      optionalNonNegativeNumber(args, 'input_price_per_million_tokens', name);
      optionalNonNegativeNumber(args, 'output_price_per_million_tokens', name);
      optionalNonNegativeNumber(args, 'price_per_million_tokens', name);
      return args;
    case 'enigma_settlement_job':
      rejectAdditionalProperties(args, new Set(['tenant_id', 'job_type', 'memory_commitment_root', 'policy_hash', 'usage_event_hash', 'requested_at', 'expires_at', 'max_price_amount', 'payment_asset']), name);
      requireString(args, 'tenant_id', name);
      requireString(args, 'job_type', name);
      requireString(args, 'memory_commitment_root', name);
      requireString(args, 'policy_hash', name);
      requireString(args, 'usage_event_hash', name);
      optionalString(args, 'requested_at', name);
      requireString(args, 'expires_at', name);
      requireNumber(args, 'max_price_amount', name);
      optionalString(args, 'payment_asset', name);
      return args;
    case 'enigma_settlement_capacity':
      rejectAdditionalProperties(args, new Set(['operator_id', 'accelerator_class', 'hardware_ref', 'region', 'model_family', 'model_refs', 'observed_at', 'expires_at', 'vram_gb', 'max_context_window_tokens', 'available_context_tokens_per_minute', 'p95_latency_ms', 'price_per_million_context_tokens', 'asset', 'capacity_ref', 'terms_ref']), name);
      requireString(args, 'operator_id', name);
      requireString(args, 'accelerator_class', name);
      requireString(args, 'hardware_ref', name);
      requireString(args, 'region', name);
      requireString(args, 'model_family', name);
      optionalStringArray(args, 'model_refs', name);
      if (!Array.isArray(args.model_refs)) throw invalidParams(`${name} requires model_refs as an array.`);
      optionalString(args, 'observed_at', name);
      requireString(args, 'expires_at', name);
      requireNumber(args, 'vram_gb', name);
      requireNumber(args, 'max_context_window_tokens', name);
      requireNumber(args, 'available_context_tokens_per_minute', name);
      requireNumber(args, 'p95_latency_ms', name);
      requireNumber(args, 'price_per_million_context_tokens', name);
      optionalString(args, 'asset', name);
      requireString(args, 'capacity_ref', name);
      requireString(args, 'terms_ref', name);
      return args;
    case 'enigma_settlement_quote':
      rejectAdditionalProperties(args, new Set(['job', 'operator_id', 'service_kind', 'quoted_at', 'expires_at', 'price_amount', 'asset', 'capacity_ref', 'capacity_profile', 'terms_ref']), name);
      optionalPlainObject(args, 'job', name);
      optionalPlainObject(args, 'capacity_profile', name);
      if (args.job === undefined) throw invalidParams(`${name} requires job as an object.`);
      requireString(args, 'operator_id', name);
      requireString(args, 'service_kind', name);
      optionalString(args, 'quoted_at', name);
      requireString(args, 'expires_at', name);
      requireNumber(args, 'price_amount', name);
      optionalString(args, 'asset', name);
      if (args.capacity_profile === undefined) requireString(args, 'capacity_ref', name);
      requireString(args, 'terms_ref', name);
      return args;
    case 'enigma_settlement_receipt':
      rejectAdditionalProperties(args, new Set(['job', 'quote', 'completed_at', 'settled_amount', 'settlement_ref', 'service_receipt_ref']), name);
      optionalPlainObject(args, 'job', name);
      optionalPlainObject(args, 'quote', name);
      if (args.job === undefined) throw invalidParams(`${name} requires job as an object.`);
      if (args.quote === undefined) throw invalidParams(`${name} requires quote as an object.`);
      optionalString(args, 'completed_at', name);
      requireNumber(args, 'settled_amount', name);
      requireString(args, 'settlement_ref', name);
      requireString(args, 'service_receipt_ref', name);
      return args;
    case 'enigma_settlement_verify':
      rejectAdditionalProperties(args, new Set(['job', 'quote', 'receipt']), name);
      optionalPlainObject(args, 'job', name);
      optionalPlainObject(args, 'quote', name);
      optionalPlainObject(args, 'receipt', name);
      if (args.job === undefined) throw invalidParams(`${name} requires job as an object.`);
      if (args.quote === undefined) throw invalidParams(`${name} requires quote as an object.`);
      if (args.receipt === undefined) throw invalidParams(`${name} requires receipt as an object.`);
      return args;
    case 'enigma_settlement_batch':
      rejectAdditionalProperties(args, new Set(['receipts', 'asset', 'batch_ref', 'generated_at']), name);
      optionalObjectArray(args, 'receipts', name);
      if (args.receipts === undefined) throw invalidParams(`${name} requires receipts as an array.`);
      optionalString(args, 'asset', name);
      requireString(args, 'batch_ref', name);
      optionalString(args, 'generated_at', name);
      return args;
    default:
      throw invalidParams('Unknown tool.');
  }
}

function validatePromptArguments(args) {
  if (args === undefined) return undefined;
  if (!isPlainObject(args)) throw invalidParams('prompts/get arguments must be an object.');
  rejectAdditionalProperties(args, new Set(['question', 'purpose']), 'prompts/get arguments');
  optionalString(args, 'question', 'prompts/get arguments');
  optionalString(args, 'purpose', 'prompts/get arguments');
  return args;
}

function sanitizeOperationalError(error) {
  return {
    ok: false,
    error: 'Tool execution failed.',
    error_name: typeof error?.name === 'string' ? error.name : 'Error',
  };
}


export const toolDescriptors = [
  {
    name: 'enigma_init',
    description: 'Create a local Enigma vault bundle when one does not already exist.',
    inputSchema: {
      type: 'object',
      properties: {
        bundlePath: { type: 'string' },
        tenant_id: { type: 'string' },
        subject_id: { type: 'string' },
        actor_id: { type: 'string' },
        policy_id: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'enigma_remember',
    description: 'Store a memory in the local Enigma vault and emit a receipt without using provider-native memory as canonical state.',
    inputSchema: {
      type: 'object',
      properties: {
        bundlePath: { type: 'string' },
        text: { type: 'string' },
        purpose: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        metadata: { type: 'object' },
      },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'enigma_search',
    description: 'Search active local Enigma memories by query, or recall one memory by address when memory_addr is supplied.',
    inputSchema: {
      type: 'object',
      properties: {
        bundlePath: { type: 'string' },
        query: { type: 'string' },
        memory_addr: { type: 'string' },
        purpose: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'enigma_context_pack',
    description: 'Compile an MCP-safe context pack from active local memories and emit retrieval/injection receipts.',
    inputSchema: {
      type: 'object',
      properties: {
        bundlePath: { type: 'string' },
        query: { type: 'string' },
        purpose: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
        memory_addresses: { type: 'array', items: { type: 'string' } },
        optimize: { type: 'boolean' },
        max_estimated_tokens: { type: 'number', minimum: 0 },
        price_per_million_tokens: { type: 'number', minimum: 0 },
        currency: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'enigma_delete',
    description: 'Tombstone an Enigma memory so it is not served in future context packs.',
    inputSchema: {
      type: 'object',
      properties: {
        bundlePath: { type: 'string' },
        memory_addr: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['memory_addr'],
      additionalProperties: false,
    },
  },
  {
    name: 'enigma_verify_receipts',
    description: 'Verify receipts/checkpoints in a local or exported Enigma bundle and return a machine-readable verdict.',
    inputSchema: {
      type: 'object',
      properties: {
        bundlePath: { type: 'string' },
        bundle: { type: 'object' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'enigma_meter_usage',
    description: 'Create content-minimized memory usage events or aggregate supplied usage events without raw prompts or provider responses.',
    inputSchema: {
      type: 'object',
      properties: {
        events: { type: 'array', items: { type: 'object' } },
        tenant_id: { type: 'string' },
        meter_id: { type: 'string' },
        provider: { type: 'string' },
        model: { type: 'string' },
        operation: { type: 'string' },
        timestamp: { type: 'string' },
        generated_at: { type: 'string' },
        prompt_tokens: { type: 'number', minimum: 0 },
        completion_tokens: { type: 'number', minimum: 0 },
        memory_baseline_tokens: { type: 'number', minimum: 0 },
        memory_optimized_tokens: { type: 'number', minimum: 0 },
        currency: { type: 'string' },
        input_price_per_million_tokens: { type: 'number', minimum: 0 },
        output_price_per_million_tokens: { type: 'number', minimum: 0 },
        price_per_million_tokens: { type: 'number', minimum: 0 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'enigma_settlement_job',
    description: 'Create a permissionless hash-only memory service job for settlement rails.',
    inputSchema: {
      type: 'object',
      properties: {
        tenant_id: { type: 'string' },
        job_type: { type: 'string' },
        memory_commitment_root: { type: 'string' },
        policy_hash: { type: 'string' },
        usage_event_hash: { type: 'string' },
        requested_at: { type: 'string' },
        expires_at: { type: 'string' },
        max_price_amount: { type: 'number' },
        payment_asset: { type: 'string' },
      },
      required: ['tenant_id', 'job_type', 'memory_commitment_root', 'policy_hash', 'usage_event_hash', 'expires_at', 'max_price_amount'],
      additionalProperties: false,
    },
  },
  {
    name: 'enigma_settlement_capacity',
    description: 'Create a consumer/workstation GPU memory-optimizer capacity profile for permissionless discovery and settlement without raw-memory decentralization claims.',
    inputSchema: {
      type: 'object',
      properties: {
        operator_id: { type: 'string' },
        accelerator_class: { type: 'string' },
        hardware_ref: { type: 'string' },
        region: { type: 'string' },
        model_family: { type: 'string' },
        model_refs: { type: 'array', items: { type: 'string' } },
        observed_at: { type: 'string' },
        expires_at: { type: 'string' },
        vram_gb: { type: 'number' },
        max_context_window_tokens: { type: 'number' },
        available_context_tokens_per_minute: { type: 'number' },
        p95_latency_ms: { type: 'number' },
        price_per_million_context_tokens: { type: 'number' },
        asset: { type: 'string' },
        capacity_ref: { type: 'string' },
        terms_ref: { type: 'string' },
      },
      required: ['operator_id', 'accelerator_class', 'hardware_ref', 'region', 'model_family', 'model_refs', 'expires_at', 'vram_gb', 'max_context_window_tokens', 'available_context_tokens_per_minute', 'p95_latency_ms', 'price_per_million_context_tokens', 'capacity_ref', 'terms_ref'],
      additionalProperties: false,
    },
  },
  {
    name: 'enigma_settlement_quote',
    description: 'Create an operator quote for a permissionless memory service job.',
    inputSchema: {
      type: 'object',
      properties: {
        job: { type: 'object' },
        operator_id: { type: 'string' },
        service_kind: { type: 'string' },
        quoted_at: { type: 'string' },
        expires_at: { type: 'string' },
        price_amount: { type: 'number' },
        asset: { type: 'string' },
        capacity_ref: { type: 'string' },
        capacity_profile: { type: 'object' },
        terms_ref: { type: 'string' },
      },
      required: ['job', 'operator_id', 'service_kind', 'expires_at', 'price_amount', 'terms_ref'],
      additionalProperties: false,
    },
  },
  {
    name: 'enigma_settlement_receipt',
    description: 'Create a service settlement receipt linking job, quote, usage hash, memory root, policy hash, service receipt, and settlement ref.',
    inputSchema: {
      type: 'object',
      properties: {
        job: { type: 'object' },
        quote: { type: 'object' },
        completed_at: { type: 'string' },
        settled_amount: { type: 'number' },
        settlement_ref: { type: 'string' },
        service_receipt_ref: { type: 'string' },
      },
      required: ['job', 'quote', 'settled_amount', 'settlement_ref', 'service_receipt_ref'],
      additionalProperties: false,
    },
  },
  {
    name: 'enigma_settlement_verify',
    description: 'Verify a service settlement receipt against its job and quote.',
    inputSchema: {
      type: 'object',
      properties: {
        job: { type: 'object' },
        quote: { type: 'object' },
        receipt: { type: 'object' },
      },
      required: ['job', 'quote', 'receipt'],
      additionalProperties: false,
    },
  },
  {
    name: 'enigma_settlement_batch',
    description: 'Aggregate service settlement receipts into a hash-only settlement batch without investment or provider-invoice claims.',
    inputSchema: {
      type: 'object',
      properties: {
        receipts: { type: 'array', items: { type: 'object' } },
        asset: { type: 'string' },
        batch_ref: { type: 'string' },
        generated_at: { type: 'string' },
      },
      required: ['receipts', 'batch_ref'],
      additionalProperties: false,
    },
  },
];

const PASSPORT_SUMMARY_RESOURCE_URI = 'enigma://passport/summary';
const STANDARD_MEMORY_PROMPT_NAME = 'enigma_standard_memory_prompt';

export const resourceDescriptors = [
  {
    uri: PASSPORT_SUMMARY_RESOURCE_URI,
    name: 'Enigma Passport Summary',
    description: 'MCP-safe Passport and Vault metadata for the local Enigma bundle. Raw memory plaintext is never exposed.',
    mimeType: 'application/json',
  },
];

export const promptDescriptors = [
  {
    name: STANDARD_MEMORY_PROMPT_NAME,
    description: 'Standard Enigma memory prompt for provider-neutral, receipt-aware user-specific answers.',
    arguments: [
      {
        name: 'question',
        description: 'Optional user question the assistant is preparing to answer.',
        required: false,
      },
      {
        name: 'purpose',
        description: 'Optional retrieval purpose to pass when requesting Enigma context.',
        required: false,
      },
    ],
  },
];

function bundlePath(input = {}) {
  return resolve(String(input.bundlePath ?? input.bundle_path ?? DEFAULT_BUNDLE));
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function reviveVault(stored) {
  if (stored.schema !== 'enigma.vault_bundle.v1') throw new Error(`Unsupported Enigma bundle schema: ${stored.schema ?? '<missing>'}`);
  const signingKeyPair = stored.keyring?.privateKey
    ? { key_id: stored.keyring.signer?.key_id, publicKey: stored.keyring.publicKey, privateKey: stored.keyring.privateKey }
    : undefined;
  const vault = createVault({
    vault_id: stored.vault?.vault_id,
    tenant_id: stored.vault?.tenant_id,
    subject_id: stored.vault?.subject_id,
    actor_id: stored.vault?.actor_id,
    policy_id: stored.vault?.policy_id,
    vault_key: stored.keyring?.vault_key_b64,
    address_key: stored.keyring?.address_key_b64,
    signingKeyPair,
    now: stored.vault?.created_at,
  });
  if (stored.keyring?.signer) vault.signer = stored.keyring.signer;
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

async function loadState(path) {
  const stored = await readJson(path);
  const vault = reviveVault(stored);
  return { stored, vault, passport: createPassport({ vault }) };
}

async function persistState(path, vault) {
  const exported = exportBundle({ vault, includePlaintext: false });
  const bundle = exported.bundle ?? exported;
  await writeJson(path, bundle);
  return bundle;
}

function bundleSummary(path, bundle, created) {
  return {
    ok: true,
    created,
    bundlePath: path,
    schema: bundle.schema,
    vault_id: bundle.vault?.vault_id,
    tenant_id: bundle.vault?.tenant_id,
    subject_id: bundle.vault?.subject_id,
    active_count: Array.isArray(bundle.active_memory_addresses) ? bundle.active_memory_addresses.length : 0,
    receipt_count: Array.isArray(bundle.receipts) ? bundle.receipts.length : 0,
  };
}

function normalizeResourceUri(uri) {
  try {
    const parsed = new URL(String(uri));
    return parsed.protocol === 'enigma:' ? `enigma://${parsed.hostname}${parsed.pathname}` : String(uri);
  } catch {
    return String(uri);
  }
}

function inputWithBundlePath(params = {}) {
  const uri = String(params?.uri ?? PASSPORT_SUMMARY_RESOURCE_URI);
  const args = params?.arguments && typeof params.arguments === 'object' && !Array.isArray(params.arguments)
    ? params.arguments
    : {};
  let requestedPath = params?.bundlePath ?? params?.bundle_path ?? args.bundlePath ?? args.bundle_path;
  try {
    const parsed = new URL(uri);
    requestedPath ??= parsed.searchParams.get('bundlePath') ?? parsed.searchParams.get('bundle_path') ?? undefined;
  } catch {
    // Invalid or relative resource identifiers are rejected by the resource handler.
  }
  return requestedPath === undefined ? { uri } : { uri, bundlePath: requestedPath };
}

function passportFromBundle(bundle) {
  const vault = {
    ...bundle.vault,
    active_memory_addresses: Array.isArray(bundle.active_memory_addresses) ? bundle.active_memory_addresses : [],
    tombstones: Array.isArray(bundle.tombstones) ? bundle.tombstones : [],
  };
  return createPassport({
    vault,
    passport_id: `passport:${vault.vault_id ?? 'local-vault'}`,
    now: vault.updated_at ?? vault.created_at ?? bundle.exported_at,
  });
}

function passportSummary(path, bundle) {
  if (bundle.schema !== 'enigma.vault_bundle.v1') throw new Error(`Unsupported Enigma bundle schema: ${bundle.schema ?? '<missing>'}`);
  const passport = passportFromBundle(bundle);
  return {
    ok: true,
    schema: 'enigma.mcp.passport_summary.v1',
    bundlePath: path,
    bundle_schema: bundle.schema,
    exported_at: bundle.exported_at,
    passport: {
      schema: passport.schema,
      passport_id: passport.passport_id,
      owner: passport.owner,
      created_at: passport.created_at,
      updated_at: passport.updated_at,
      vault: passport.vault,
      policies: passport.policies,
      checkpoints: passport.checkpoints,
      active_memory_addresses: passport.active_memory_addresses,
      tombstone_addresses: passport.tombstone_addresses,
    },
    vault: {
      schema: bundle.vault?.schema,
      vault_id: bundle.vault?.vault_id,
      tenant_id: bundle.vault?.tenant_id,
      subject_id: bundle.vault?.subject_id,
      actor_id: bundle.vault?.actor_id,
      policy_id: bundle.vault?.policy_id,
      created_at: bundle.vault?.created_at,
      updated_at: bundle.vault?.updated_at,
      encryption: bundle.vault?.encryption,
      key_id: bundle.vault?.key_id,
      active_set_root: bundle.vault?.active_set_root,
      receipt_log_root: bundle.vault?.receipt_log_root,
      sequence: bundle.vault?.sequence,
    },
    counts: {
      active_memory_addresses: Array.isArray(bundle.active_memory_addresses) ? bundle.active_memory_addresses.length : 0,
      tombstones: Array.isArray(bundle.tombstones) ? bundle.tombstones.length : 0,
      memory_objects: Array.isArray(bundle.memory_objects) ? bundle.memory_objects.length : 0,
      events: Array.isArray(bundle.events) ? bundle.events.length : 0,
      receipts: Array.isArray(bundle.receipts) ? bundle.receipts.length : 0,
    },
  };
}

export async function enigma_passport_summary_resource(input = {}) {
  const options = input && typeof input === 'object' ? input : {};
  const uri = options.uri ?? PASSPORT_SUMMARY_RESOURCE_URI;
  if (normalizeResourceUri(uri) !== PASSPORT_SUMMARY_RESOURCE_URI) {
    throw new Error(`Unknown Enigma resource: ${uri ?? '<missing>'}`);
  }
  const path = bundlePath(options);
  const bundle = await readJson(path);
  return {
    contents: [
      {
        uri: String(uri),
        mimeType: 'application/json',
        text: JSON.stringify(passportSummary(path, bundle)),
      },
    ],
  };
}

export function enigma_standard_memory_prompt(input = {}) {
  const args = input?.arguments && typeof input.arguments === 'object' && !Array.isArray(input.arguments)
    ? input.arguments
    : (input && typeof input === 'object' ? input : {});
  const question = typeof args.question === 'string' && args.question.trim() ? args.question.trim() : 'the user-specific question';
  const purpose = typeof args.purpose === 'string' && args.purpose.trim() ? args.purpose.trim() : 'answer_user_specific_question';
  return {
    description: 'Use Enigma as the canonical memory and proof layer before making user-specific claims.',
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: [
            'Before answering user-specific questions, request relevant context through Enigma instead of relying on provider-native memory.',
            `Use the Enigma MCP tools with purpose "${purpose}" to retrieve a context pack or search result for: ${question}`,
            'Treat provider-native memory as a cache only; Enigma receipts and active Vault state are the source of truth.',
            'Be honest: if Enigma has no relevant context, receipts, or permission for a claim, say you do not know or need more context rather than guessing.',
            'Do not put raw memory plaintext into receipts, relay records, witness artifacts, SIEM events, or public proof artifacts.',
          ].join('\n'),
        },
      },
    ],
  };
}

export async function enigma_init(input = {}) {
  input = validateToolArguments('enigma_init', input);
  const path = bundlePath(input);
  if (await fileExists(path)) {
    const bundle = await readJson(path);
    if (bundle.schema !== 'enigma.vault_bundle.v1') throw new Error(`Unsupported Enigma bundle schema: ${bundle.schema ?? '<missing>'}`);
    return bundleSummary(path, bundle, false);
  }

  const vault = createVault({
    tenant_id: input.tenant_id,
    subject_id: input.subject_id,
    actor_id: input.actor_id,
    policy_id: input.policy_id,
  });
  const bundle = await persistState(path, vault);
  return bundleSummary(path, bundle, true);
}

export async function enigma_remember(input = {}) {
  input = validateToolArguments('enigma_remember', input);
  const path = bundlePath(input);
  const { vault, passport } = await loadState(path);
  const result = remember({
    vault,
    passport,
    text: input.text,
    purpose: input.purpose ?? 'mcp_memory',
    purpose_tags: Array.isArray(input.tags) ? input.tags : [],
    metadata: input.metadata ?? {},
  });
  await persistState(path, vault);
  return { ok: true, memory_addr: result.memory_addr, receipt_id: result.receipt?.receipt_id };
}

export async function enigma_search(input = {}) {
  input = validateToolArguments('enigma_search', input);
  const path = bundlePath(input);
  const { vault, passport } = await loadState(path);
  if (input.memory_addr) {
    const result = recall({ vault, passport, memory_addr: input.memory_addr, purpose: input.purpose ?? 'mcp_search' });
    await persistState(path, vault);
    return result;
  }
  const pack = compileContextPack({
    vault,
    passport,
    query: input.query ?? '',
    purpose: input.purpose ?? 'mcp_search',
    limit: Number(input.limit ?? 8),
  });
  await persistState(path, vault);
  return { memories: pack.memories ?? [], receipts: pack.retrieval_receipts ?? pack.receipts ?? [] };
}

export async function enigma_context_pack(input = {}) {
  input = validateToolArguments('enigma_context_pack', input);
  const path = bundlePath(input);
  const { vault, passport } = await loadState(path);
  const pack = compileContextPack({
    vault,
    passport,
    query: input.query ?? '',
    purpose: input.purpose ?? 'mcp_context_pack',
    optimize: input.optimize,
    max_estimated_tokens: input.max_estimated_tokens,
    price_per_million_tokens: input.price_per_million_tokens,
    currency: input.currency,
    limit: Number(input.limit ?? 8),
    memory_addresses: input.memory_addresses,
  });
  await persistState(path, vault);
  return pack;
}

export async function enigma_delete(input = {}) {
  input = validateToolArguments('enigma_delete', input);
  const path = bundlePath(input);
  const { vault, passport } = await loadState(path);
  const result = deleteMemory({
    vault,
    passport,
    memory_addr: input.memory_addr,
    reason: input.reason ?? 'mcp_delete',
  });
  await persistState(path, vault);
  return { ok: true, memory_addr: result.memory_addr, receipt_id: result.receipt?.receipt_id };
}

export async function enigma_verify_receipts(input = {}) {
  input = validateToolArguments('enigma_verify_receipts', input);
  const bundle = input.bundle ?? await readJson(bundlePath(input));
  return verifyBundle(bundle);
}

export async function enigma_meter_usage(input = {}) {
  input = validateToolArguments('enigma_meter_usage', input);
  if (Array.isArray(input.events)) {
    return aggregateUsageEvents({
      events: input.events,
      tenant_id: input.tenant_id,
      meter_id: input.meter_id,
      generated_at: input.generated_at,
    });
  }
  return createUsageEvent({
    tenant_id: input.tenant_id,
    meter_id: input.meter_id,
    provider: input.provider,
    model: input.model,
    operation: input.operation,
    timestamp: input.timestamp,
    prompt_tokens: input.prompt_tokens,
    completion_tokens: input.completion_tokens,
    memory_baseline_tokens: input.memory_baseline_tokens,
    memory_optimized_tokens: input.memory_optimized_tokens,
    pricing: {
      currency: input.currency,
      input_price_per_million_tokens: input.input_price_per_million_tokens ?? input.price_per_million_tokens,
      output_price_per_million_tokens: input.output_price_per_million_tokens ?? input.price_per_million_tokens,
    },
  });
}

export async function enigma_settlement_job(input = {}) {
  input = validateToolArguments('enigma_settlement_job', input);
  return createPermissionlessMemoryJob(input);
}

export async function enigma_settlement_capacity(input = {}) {
  input = validateToolArguments('enigma_settlement_capacity', input);
  return createConsumerGpuCapacityProfile(input);
}

export async function enigma_settlement_quote(input = {}) {
  input = validateToolArguments('enigma_settlement_quote', input);
  return createOperatorServiceQuote(input);
}

export async function enigma_settlement_receipt(input = {}) {
  input = validateToolArguments('enigma_settlement_receipt', input);
  return createServiceSettlementReceipt(input);
}

export async function enigma_settlement_verify(input = {}) {
  input = validateToolArguments('enigma_settlement_verify', input);
  return verifyServiceSettlementReceipt(input);
}

export async function enigma_settlement_batch(input = {}) {
  input = validateToolArguments('enigma_settlement_batch', input);
  return createSettlementBatch(input);
}


export const handlers = Object.freeze({
  enigma_init,
  enigma_remember,
  enigma_search,
  enigma_context_pack,
  enigma_delete,
  enigma_verify_receipts,
  enigma_meter_usage,
  enigma_settlement_job,
  enigma_settlement_capacity,
  enigma_settlement_quote,
  enigma_settlement_receipt,
  enigma_settlement_verify,
  enigma_settlement_batch,
});

function jsonRpcResult(id, result) {
  return { jsonrpc: JSONRPC_VERSION, id, result };
}

function jsonRpcError(id, code, message, data = undefined) {
  const error = data === undefined ? { code, message } : { code, message, data };
  return { jsonrpc: JSONRPC_VERSION, id, error };
}

function isRequestObject(request) {
  return request !== null && typeof request === 'object' && !Array.isArray(request);
}

function hasJsonRpcId(request) {
  return Object.prototype.hasOwnProperty.call(request, 'id');
}

function toolArguments(name, params) {
  const args = params.arguments ?? {};
  return validateToolArguments(name, args);
}

function toolHandler(name) {
  return Object.prototype.hasOwnProperty.call(handlers, name) ? handlers[name] : undefined;
}

function toolCallContent(result, toolName) {
  const verificationFailed = (toolName === 'enigma_verify_receipts' || toolName === 'enigma_settlement_verify') && result && typeof result === 'object' && result.ok === false;
  return {
    content: [{ type: 'text', text: JSON.stringify(result ?? null) }],
    structuredContent: result ?? null,
    isError: verificationFailed,
  };
}

function toolCallError(error) {
  const result = sanitizeOperationalError(error);
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
    isError: true,
  };
}

function validateInitializeParams(params) {
  const input = ensureParamsObject(params, 'initialize');
  rejectAdditionalProperties(input, new Set(['protocolVersion', 'capabilities', 'clientInfo']), 'initialize params');
  optionalString(input, 'protocolVersion', 'initialize params');
  optionalPlainObject(input, 'capabilities', 'initialize params');
  optionalPlainObject(input, 'clientInfo', 'initialize params');
  if (input.protocolVersion !== undefined && input.protocolVersion !== MCP_PROTOCOL_VERSION) {
    throw invalidParams('Unsupported MCP protocol version.', { supportedProtocolVersions: [MCP_PROTOCOL_VERSION] });
  }
  return input;
}

function validateNoParams(params, method) {
  const input = ensureParamsObject(params, method);
  rejectAdditionalProperties(input, new Set(), `${method} params`);
}

async function handleSingleJsonRpcRequest(request) {
  if (!isRequestObject(request)) return jsonRpcError(null, JSON_RPC_ERROR.INVALID_REQUEST, 'Invalid Request');

  const notification = !hasJsonRpcId(request);
  const id = notification ? null : request.id;
  if (!notification && !isValidJsonRpcId(id)) {
    return jsonRpcError(null, JSON_RPC_ERROR.INVALID_REQUEST, 'Invalid Request');
  }
  if (request.jsonrpc !== JSONRPC_VERSION || typeof request.method !== 'string') {
    return jsonRpcError(id, JSON_RPC_ERROR.INVALID_REQUEST, 'Invalid Request');
  }

  try {
    switch (request.method) {
      case 'initialize': {
        validateInitializeParams(request.params);
        return notification ? undefined : jsonRpcResult(id, {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {
            tools: { listChanged: false },
            resources: { listChanged: false },
            prompts: { listChanged: false },
          },
          serverInfo: SERVER_INFO,
        });
      }
      case 'notifications/initialized':
        validateNoParams(request.params, 'notifications/initialized');
        return undefined;
      case 'ping':
        validateNoParams(request.params, 'ping');
        return notification ? undefined : jsonRpcResult(id, {});
      case 'tools/list':
        validateNoParams(request.params, 'tools/list');
        return notification ? undefined : jsonRpcResult(id, { tools: toolDescriptors });
      case 'resources/list':
        validateNoParams(request.params, 'resources/list');
        return notification ? undefined : jsonRpcResult(id, { resources: resourceDescriptors });
      case 'resources/templates/list':
        validateNoParams(request.params, 'resources/templates/list');
        return notification ? undefined : jsonRpcResult(id, { resourceTemplates: [] });
      case 'resources/read': {
        const params = ensureParamsObject(request.params, 'resources/read');
        rejectAdditionalProperties(params, new Set(['uri', 'bundlePath']), 'resources/read params');
        requireString(params, 'uri', 'resources/read params');
        optionalString(params, 'bundlePath', 'resources/read params');
        if (normalizeResourceUri(params.uri) !== PASSPORT_SUMMARY_RESOURCE_URI) throw invalidParams('Unknown resource.');
        const result = await enigma_passport_summary_resource(inputWithBundlePath(params));
        return notification ? undefined : jsonRpcResult(id, result);
      }
      case 'prompts/list':
        validateNoParams(request.params, 'prompts/list');
        return notification ? undefined : jsonRpcResult(id, { prompts: promptDescriptors });
      case 'prompts/get': {
        const params = ensureParamsObject(request.params, 'prompts/get');
        rejectAdditionalProperties(params, new Set(['name', 'arguments']), 'prompts/get params');
        requireString(params, 'name', 'prompts/get params');
        if (params.name !== STANDARD_MEMORY_PROMPT_NAME) throw invalidParams('Unknown prompt.');
        validatePromptArguments(params.arguments);
        return notification ? undefined : jsonRpcResult(id, enigma_standard_memory_prompt(params));
      }
      case 'tools/call': {
        const params = ensureParamsObject(request.params, 'tools/call');
        rejectAdditionalProperties(params, new Set(['name', 'arguments']), 'tools/call params');
        requireString(params, 'name', 'tools/call params');
        const handler = toolHandler(params.name);
        if (!handler) throw invalidParams('Unknown tool.');
        const args = toolArguments(params.name, params);
        try {
          const result = await handler(args);
          return notification ? undefined : jsonRpcResult(id, toolCallContent(result, params.name));
        } catch (error) {
          return notification ? undefined : jsonRpcResult(id, toolCallError(error));
        }
      }
      default:
        return notification ? undefined : jsonRpcError(id, JSON_RPC_ERROR.METHOD_NOT_FOUND, 'Method not found');
    }
  } catch (error) {
    if (notification) return undefined;
    if (isJsonRpcProtocolError(error)) return jsonRpcError(id, error.code, error.message, error.data);
    return jsonRpcError(id, JSON_RPC_ERROR.INTERNAL_ERROR, 'Internal error', { name: error.name });
  }
}

export async function handleJsonRpcRequest(request) {
  if (!Array.isArray(request)) return handleSingleJsonRpcRequest(request);
  if (request.length === 0) return jsonRpcError(null, JSON_RPC_ERROR.INVALID_REQUEST, 'Invalid Request');

  const responses = [];
  for (const item of request) {
    const response = await handleSingleJsonRpcRequest(item);
    if (response !== undefined) responses.push(response);
  }
  return responses.length === 0 ? undefined : responses;
}

function writeJsonLine(output, value) {
  if (value !== undefined) output.write(`${JSON.stringify(value)}\n`);
}

export function startStdioServer(io = {}) {
  const input = io.input ?? io.stdin ?? process.stdin;
  const output = io.output ?? io.stdout ?? process.stdout;
  const errorOutput = io.errorOutput ?? io.stderr ?? process.stderr;
  const lines = createInterface({ input, crlfDelay: Infinity });
  let queue = Promise.resolve();

  async function processLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      writeJsonLine(output, await handleJsonRpcRequest(JSON.parse(trimmed)));
    } catch (error) {
      const parseError = error instanceof SyntaxError
        ? jsonRpcError(null, -32700, 'Parse error')
        : jsonRpcError(null, JSON_RPC_ERROR.INTERNAL_ERROR, 'Internal error', { name: error.name });
      writeJsonLine(output, parseError);
    }
  }

  lines.on('line', (line) => {
    queue = queue.then(() => processLine(line), () => processLine(line));
  });
  lines.on('error', (error) => {
    errorOutput?.write?.(`${error.message}\n`);
  });

  return {
    close() {
      lines.close();
    },
    done: new Promise((resolveDone) => {
      lines.on('close', () => {
        queue.then(resolveDone, resolveDone);
      });
    }),
  };
}

export default {
  toolDescriptors,
  resourceDescriptors,
  promptDescriptors,
  handlers,
  enigma_init,
  enigma_remember,
  enigma_search,
  enigma_context_pack,
  enigma_delete,
  enigma_verify_receipts,
  enigma_meter_usage,
  enigma_settlement_job,
  enigma_settlement_capacity,
  enigma_settlement_quote,
  enigma_settlement_receipt,
  enigma_settlement_verify,
  enigma_settlement_batch,
  enigma_passport_summary_resource,
  enigma_standard_memory_prompt,
  handleJsonRpcRequest,
  startStdioServer,
};
