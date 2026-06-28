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
import {
  assertImmuneIngressPublicSafe,
  createImmuneIngressReport,
  createImportBatchReceipt,
  createImportPreview,
  importTextMemoryList,
} from '../../importers/src/index.js';
import {
  CONSENT_GRANT_JSON_SCHEMA,
  PRIVATE_MEMORY_BUBBLE_JSON_SCHEMA,
  MEMORY_WEATHER_REPORT_JSON_SCHEMA,
  RECALL_VETO_DECISION_JSON_SCHEMA,
  assertMemoryControllerPublicSafe,
  closePrivateMemoryBubble,
  createConsentGrant,
  createMemoryWeatherReport,
  createPrivateMemoryBubble,
  createRecallVetoDecision,
} from '../../controller/src/index.js';

const DEFAULT_BUNDLE = '.enigma/bundle.json';
const JSONRPC_VERSION = '2.0';
const MCP_PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = Object.freeze({ name: 'enigma-mcp-server', version: '0.1.18' });
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

function optionalPublicRefArray(object, key, context) {
  optionalStringArray(object, key, context);
  if (object[key] === undefined) return;
  if (new Set(object[key]).size !== object[key].length || object[key].some((item) => !MEMORY_CONTROLLER_PUBLIC_REF_RE.test(item))) {
    throw invalidParams(`${context} ${key} must be an array of unique public refs.`);
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

function optionalNonNegativeInteger(object, key, context) {
  if (object[key] === undefined) return;
  if (!Number.isInteger(object[key]) || object[key] < 0) {
    throw invalidParams(`${context} ${key} must be a non-negative integer.`);
  }
}

function optionalPositiveInteger(object, key, context) {
  if (object[key] === undefined) return;
  if (!Number.isInteger(object[key]) || object[key] <= 0) {
    throw invalidParams(`${context} ${key} must be a positive integer.`);
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

const CONSENT_GRANT_ARTIFACT_KEYS = new Set(Object.keys(CONSENT_GRANT_JSON_SCHEMA.properties));
const MEMORY_CONTROLLER_PUBLIC_REF_SCHEMA = CONSENT_GRANT_JSON_SCHEMA.$defs.publicRef;
const MEMORY_CONTROLLER_PUBLIC_REF_RE = new RegExp(MEMORY_CONTROLLER_PUBLIC_REF_SCHEMA.pattern, 'u');
const PRIVATE_MEMORY_BUBBLE_ARTIFACT_KEYS = new Set(Object.keys(PRIVATE_MEMORY_BUBBLE_JSON_SCHEMA.properties));
const WEATHER_TILE_KEYS = new Set(['tile_ref', 'status', 'metric', 'count', 'evidence_refs']);
const MEMORY_CONTROLLER_PUBLIC_SAFE_INPUT_DESCRIPTION = 'Use opaque refs, counts, timestamps, and reason codes only; never send raw memory, prompts, transcripts, provider output, local paths, secrets, or account/customer identifiers.';
const MEMORY_CONTROLLER_TOOL_ANNOTATIONS = Object.freeze({
  weather: Object.freeze({
    title: 'Show Memory Weather',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  }),
  recall: Object.freeze({
    title: 'Check Recall Boundary',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  }),
  grant: Object.freeze({
    title: 'Create Consent Grant',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  }),
  bubble: Object.freeze({
    title: 'Open or Close Private Bubble',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  }),
});
const MEMORY_CONTROLLER_FORBIDDEN_INPUT_KEY_RE = /(?:^|_)(?:raw|text|content|plaintext|memory|raw_text|raw_memory|memory_payload|prompt|raw_prompt|transcript|transcript_payload|provider_payload|provider_response|provider_output|private_data|secret|secret_material|signing_secret|api_key|token|credential|embedding|embeddings|local_absolute_path|account|account_id|customer|customer_id|customer_identifier)$/u;

function assertMcpMemoryControllerPublicSafeInput(value, context, seen = new Set()) {
  if (value === null || typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      for (const item of value) assertMcpMemoryControllerPublicSafeInput(item, context, seen);
      return;
    }
    for (const key of Object.keys(value)) {
      const normalized = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
      if (MEMORY_CONTROLLER_FORBIDDEN_INPUT_KEY_RE.test(normalized)) {
        throw invalidParams(`${context} contains unsafe public fields.`);
      }
      assertMcpMemoryControllerPublicSafeInput(value[key], context, seen);
    }
  } finally {
    seen.delete(value);
  }
  try {
    assertMemoryControllerPublicSafe(value);
  } catch {
    throw invalidParams(`${context} contains unsafe public fields.`);
  }
}

function optionalStrictObject(object, key, allowed, context) {
  optionalPlainObject(object, key, context);
  if (object[key] !== undefined) rejectAdditionalProperties(object[key], allowed, `${context} ${key}`);
}

function optionalStrictObjectArray(object, key, allowed, context) {
  optionalObjectArray(object, key, context);
  if (object[key] === undefined) return;
  for (let index = 0; index < object[key].length; index += 1) {
    rejectAdditionalProperties(object[key][index], allowed, `${context} ${key}[${index}]`);
  }
}

function optionalWeatherTiles(object, key, context) {
  if (object[key] === undefined) return;
  if (!Array.isArray(object[key]) || object[key].some((item) => !isPlainObject(item))) {
    throw invalidParams(`${context} ${key} must be an array of objects.`);
  }
  for (let index = 0; index < object[key].length; index += 1) {
    const tile = object[key][index];
    rejectAdditionalProperties(tile, WEATHER_TILE_KEYS, `${context} ${key}[${index}]`);
    optionalString(tile, 'tile_ref', `${context} ${key}[${index}]`);
    optionalString(tile, 'status', `${context} ${key}[${index}]`);
    optionalString(tile, 'metric', `${context} ${key}[${index}]`);
    optionalNonNegativeInteger(tile, 'count', `${context} ${key}[${index}]`);
    optionalStringArray(tile, 'evidence_refs', `${context} ${key}[${index}]`);
  }
}

function requireMemoryBubbleAction(object, context) {
  requireString(object, 'action', context);
  if (!new Set(['open', 'keep', 'discard']).has(object.action)) {
    throw invalidParams(`${context} action must be open, keep, or discard.`);
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
    case 'enigma_next_action':
      rejectAdditionalProperties(args, new Set(['bundlePath']), name);
      optionalString(args, 'bundlePath', name);
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
    case 'enigma_import_preview':
      rejectAdditionalProperties(args, new Set(['text', 'complete', 'now', 'confidence']), name);
      optionalString(args, 'text', name);
      optionalBoolean(args, 'complete', name);
      optionalString(args, 'now', name);
      optionalString(args, 'confidence', name);
      return args;
    case 'enigma_import_approve':
      rejectAdditionalProperties(args, new Set(['bundlePath', 'text', 'complete', 'now', 'confidence', 'approved', 'reviewed']), name);
      optionalString(args, 'bundlePath', name);
      optionalString(args, 'text', name);
      optionalBoolean(args, 'complete', name);
      optionalString(args, 'now', name);
      optionalString(args, 'confidence', name);
      optionalBoolean(args, 'approved', name);
      optionalBoolean(args, 'reviewed', name);
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
        'require_grant',
        'grant',
        'grants',
        'app_ref',
        'memory_zone_ref',
        'policy_ref',
        'purpose_ref',
        'revoked_grant_refs',
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
      optionalBoolean(args, 'require_grant', name);
      optionalStrictObject(args, 'grant', CONSENT_GRANT_ARTIFACT_KEYS, name);
      optionalStrictObjectArray(args, 'grants', CONSENT_GRANT_ARTIFACT_KEYS, name);
      optionalPublicRefArray(args, 'revoked_grant_refs', name);
      optionalString(args, 'app_ref', name);
      optionalString(args, 'memory_zone_ref', name);
      optionalString(args, 'purpose_ref', name);
      optionalString(args, 'policy_ref', name);
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
    case 'enigma_immune_ingress':
      rejectAdditionalProperties(args, new Set(['candidate', 'candidates', 'generated_at', 'now']), name);
      optionalPlainObject(args, 'candidate', name);
      optionalObjectArray(args, 'candidates', name);
      optionalString(args, 'generated_at', name);
      optionalString(args, 'now', name);
      if (args.candidate === undefined && args.candidates === undefined) throw invalidParams(`${name} requires candidate or candidates.`);
      return args;
    case 'enigma_memory_weather':
      assertMcpMemoryControllerPublicSafeInput(args, name);
      rejectAdditionalProperties(args, new Set(['tiles', 'issue_codes', 'evidence_refs', 'generated_at']), name);
      optionalWeatherTiles(args, 'tiles', name);
      optionalStringArray(args, 'issue_codes', name);
      optionalStringArray(args, 'evidence_refs', name);
      optionalString(args, 'generated_at', name);
      return args;
    case 'enigma_recall_veto':
      assertMcpMemoryControllerPublicSafeInput(args, name);
      rejectAdditionalProperties(args, new Set(['grant', 'grants', 'revoked_grant_refs', 'app_ref', 'purpose_ref', 'operation', 'memory_zone_ref', 'candidate_count', 'sensitive_count', 'tombstone_count', 'policy_ref', 'proof_refs', 'receipt_refs']), name);
      optionalStrictObject(args, 'grant', CONSENT_GRANT_ARTIFACT_KEYS, name);
      optionalStrictObjectArray(args, 'grants', CONSENT_GRANT_ARTIFACT_KEYS, name);
      optionalPublicRefArray(args, 'revoked_grant_refs', name);
      optionalString(args, 'app_ref', name);
      optionalString(args, 'purpose_ref', name);
      optionalString(args, 'operation', name);
      optionalString(args, 'memory_zone_ref', name);
      optionalNonNegativeInteger(args, 'candidate_count', name);
      optionalNonNegativeInteger(args, 'sensitive_count', name);
      optionalNonNegativeInteger(args, 'tombstone_count', name);
      optionalString(args, 'policy_ref', name);
      optionalStringArray(args, 'proof_refs', name);
      optionalStringArray(args, 'receipt_refs', name);
      return args;
    case 'enigma_consent_grant':
      assertMcpMemoryControllerPublicSafeInput(args, name);
      rejectAdditionalProperties(args, new Set(['app_ref', 'purpose_ref', 'operation', 'operations', 'memory_zone_ref', 'memory_zone_refs', 'issued_at', 'expires_at', 'ttl_seconds', 'status', 'grant_ref', 'policy_ref', 'proof_refs', 'receipt_refs']), name);
      optionalString(args, 'app_ref', name);
      optionalString(args, 'purpose_ref', name);
      optionalString(args, 'operation', name);
      optionalStringArray(args, 'operations', name);
      optionalString(args, 'memory_zone_ref', name);
      optionalStringArray(args, 'memory_zone_refs', name);
      optionalString(args, 'issued_at', name);
      optionalString(args, 'expires_at', name);
      optionalPositiveInteger(args, 'ttl_seconds', name);
      optionalString(args, 'status', name);
      optionalString(args, 'grant_ref', name);
      optionalString(args, 'policy_ref', name);
      optionalStringArray(args, 'proof_refs', name);
      optionalStringArray(args, 'receipt_refs', name);
      return args;
    case 'enigma_private_bubble':
      assertMcpMemoryControllerPublicSafeInput(args, name);
      rejectAdditionalProperties(args, new Set(['action', 'bubble', 'app_ref', 'app_refs', 'purpose_ref', 'candidate_count', 'receipt_refs', 'bubble_ref', 'started_at', 'closed_at', 'kept_count', 'discarded_count']), name);
      requireMemoryBubbleAction(args, name);
      optionalStrictObject(args, 'bubble', PRIVATE_MEMORY_BUBBLE_ARTIFACT_KEYS, name);
      optionalString(args, 'app_ref', name);
      optionalStringArray(args, 'app_refs', name);
      optionalString(args, 'purpose_ref', name);
      optionalNonNegativeInteger(args, 'candidate_count', name);
      optionalStringArray(args, 'receipt_refs', name);
      optionalString(args, 'bubble_ref', name);
      optionalString(args, 'started_at', name);
      optionalString(args, 'closed_at', name);
      optionalNonNegativeInteger(args, 'kept_count', name);
      optionalNonNegativeInteger(args, 'discarded_count', name);
      if (args.action === 'open' && args.bubble !== undefined) throw invalidParams(`${name} does not accept bubble when action is open.`);
      if (args.action !== 'open' && args.bubble === undefined) throw invalidParams(`${name} requires bubble when action is keep or discard.`);
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

function mcpImmuneIngressCandidates(input) {
  if (!isPlainObject(input)) return input;
  if (Object.prototype.hasOwnProperty.call(input, 'candidates')) return input.candidates;
  if (Object.prototype.hasOwnProperty.call(input, 'candidate')) return input.candidate;
  if (Object.prototype.hasOwnProperty.call(input, 'memory_candidates')) return input.memory_candidates;
  if (Object.prototype.hasOwnProperty.call(input, 'memoryCandidates')) return input.memoryCandidates;
  return input;
}

function mcpImmuneIngressOptions(input, options = {}) {
  return {
    ...options,
    now: options.now ?? input?.now ?? input?.generated_at ?? input?.generatedAt,
    source_type: options.source_type ?? options.sourceType ?? 'mcp_candidate_ingress',
  };
}

export function createMcpImmuneIngressReport(input = {}, options = {}) {
  return createImmuneIngressReport(mcpImmuneIngressCandidates(input), mcpImmuneIngressOptions(input, options));
}

export function assertMcpImmuneIngressPublicSafe(input = {}, options = {}) {
  return assertImmuneIngressPublicSafe(mcpImmuneIngressCandidates(input), mcpImmuneIngressOptions(input, options));
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
    name: 'enigma_next_action',
    description: 'Return the next local Enigma setup action without requiring a bundle to already exist.',
    inputSchema: {
      type: 'object',
      properties: {
        bundlePath: { type: 'string' },
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
    name: 'enigma_import_preview',
    description: 'Preview user-provided text or Markdown memories without writing the vault or returning raw memory text.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        complete: { type: 'boolean' },
        now: { type: 'string' },
        confidence: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'enigma_import_approve',
    description: 'Write user-approved text or Markdown memory candidates to the local vault and return only public-safe receipt metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        bundlePath: { type: 'string' },
        text: { type: 'string' },
        complete: { type: 'boolean' },
        now: { type: 'string' },
        confidence: { type: 'string' },
        approved: { type: 'boolean' },
        reviewed: { type: 'boolean' },
      },
      required: ['approved'],
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
        require_grant: { type: 'boolean' },
        grant: CONSENT_GRANT_JSON_SCHEMA,
        grants: { type: 'array', items: CONSENT_GRANT_JSON_SCHEMA },
        revoked_grant_refs: { type: 'array', items: MEMORY_CONTROLLER_PUBLIC_REF_SCHEMA, uniqueItems: true },
        app_ref: { type: 'string' },
        memory_zone_ref: { type: 'string' },
        purpose_ref: { type: 'string' },
        policy_ref: { type: 'string' },
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
    name: 'enigma_immune_ingress',
    description: 'Scan MCP-supplied memory candidate objects and return a public-safe immune quarantine report with opaque refs only.',
    inputSchema: {
      type: 'object',
      properties: {
        candidate: { type: 'object' },
        candidates: { type: 'array', items: { type: 'object' } },
        generated_at: { type: 'string' },
        now: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'enigma_memory_weather',
    description: 'Return a public-safe Memory Weather report with opaque evidence refs and one next action before context is shared.',
    inputSchema: {
      type: 'object',
      description: MEMORY_CONTROLLER_PUBLIC_SAFE_INPUT_DESCRIPTION,
      properties: {
        tiles: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              tile_ref: { type: 'string' },
              status: { type: 'string' },
              metric: { type: 'string' },
              count: { type: 'integer', minimum: 0 },
              evidence_refs: { type: 'array', items: { type: 'string' } },
            },
            additionalProperties: false,
          },
        },
        issue_codes: { type: 'array', items: { type: 'string' } },
        evidence_refs: { type: 'array', items: { type: 'string' } },
        generated_at: { type: 'string' },
      },
      additionalProperties: false,
    },
    annotations: MEMORY_CONTROLLER_TOOL_ANNOTATIONS.weather,
    outputSchema: MEMORY_WEATHER_REPORT_JSON_SCHEMA,
  },
  {
    name: 'enigma_recall_veto',
    description: 'Decide whether a local recall candidate set is safe to share for an app and purpose without returning raw memory.',
    inputSchema: {
      type: 'object',
      description: MEMORY_CONTROLLER_PUBLIC_SAFE_INPUT_DESCRIPTION,
      properties: {
        grant: CONSENT_GRANT_JSON_SCHEMA,
        grants: { type: 'array', items: CONSENT_GRANT_JSON_SCHEMA },
        revoked_grant_refs: { type: 'array', items: MEMORY_CONTROLLER_PUBLIC_REF_SCHEMA, uniqueItems: true },
        app_ref: { type: 'string' },
        purpose_ref: { type: 'string' },
        operation: { type: 'string' },
        memory_zone_ref: { type: 'string' },
        candidate_count: { type: 'integer', minimum: 0 },
        sensitive_count: { type: 'integer', minimum: 0 },
        tombstone_count: { type: 'integer', minimum: 0 },
        policy_ref: { type: 'string' },
        proof_refs: { type: 'array', items: { type: 'string' } },
        receipt_refs: { type: 'array', items: { type: 'string' } },
      },
      additionalProperties: false,
    },
    annotations: MEMORY_CONTROLLER_TOOL_ANNOTATIONS.recall,
    outputSchema: RECALL_VETO_DECISION_JSON_SCHEMA,
  },
  {
    name: 'enigma_consent_grant',
    description: 'Create a public-safe app permission grant for local Memory Controller decisions.',
    inputSchema: {
      type: 'object',
      description: MEMORY_CONTROLLER_PUBLIC_SAFE_INPUT_DESCRIPTION,
      properties: {
        app_ref: { type: 'string' },
        purpose_ref: { type: 'string' },
        operation: { type: 'string' },
        operations: { type: 'array', items: { type: 'string' } },
        memory_zone_ref: { type: 'string' },
        memory_zone_refs: { type: 'array', items: { type: 'string' } },
        issued_at: { type: 'string' },
        expires_at: { type: 'string' },
        ttl_seconds: { type: 'integer', minimum: 1 },
        status: { type: 'string' },
        grant_ref: { type: 'string' },
        policy_ref: { type: 'string' },
        proof_refs: { type: 'array', items: { type: 'string' } },
        receipt_refs: { type: 'array', items: { type: 'string' } },
      },
      additionalProperties: false,
    },
    annotations: MEMORY_CONTROLLER_TOOL_ANNOTATIONS.grant,
    outputSchema: CONSENT_GRANT_JSON_SCHEMA,
  },
  {
    name: 'enigma_private_bubble',
    description: 'Open, keep, or discard a private memory bubble while returning only public-safe refs, counts, and boundary flags.',
    inputSchema: {
      type: 'object',
      description: MEMORY_CONTROLLER_PUBLIC_SAFE_INPUT_DESCRIPTION,
      properties: {
        action: { type: 'string', enum: ['open', 'keep', 'discard'] },
        bubble: PRIVATE_MEMORY_BUBBLE_JSON_SCHEMA,
        app_ref: { type: 'string' },
        app_refs: { type: 'array', items: { type: 'string' } },
        purpose_ref: { type: 'string' },
        candidate_count: { type: 'integer', minimum: 0 },
        receipt_refs: { type: 'array', items: { type: 'string' } },
        bubble_ref: { type: 'string' },
        started_at: { type: 'string' },
        closed_at: { type: 'string' },
        kept_count: { type: 'integer', minimum: 0 },
        discarded_count: { type: 'integer', minimum: 0 },
      },
      required: ['action'],
      additionalProperties: false,
    },
    annotations: MEMORY_CONTROLLER_TOOL_ANNOTATIONS.bubble,
    outputSchema: PRIVATE_MEMORY_BUBBLE_JSON_SCHEMA,
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

export async function enigma_next_action(input = {}) {
  input = validateToolArguments('enigma_next_action', input);
  const path = bundlePath(input);
  const claimBoundaries = {
    local_enigma_status_only: true,
    raw_memory_returned: false,
    local_paths_redacted: true,
    provider_deletion_proof: false,
    model_forgetting_proof: false,
    hosted_saas_live: false,
  };
  if (!(await fileExists(path))) {
    return {
      ok: true,
      schema: 'enigma.next_action.v1',
      state: 'setup_needed',
      bundle: '<bundle-path>',
      primary_action: {
        id: 'run_enigma_init',
        label: 'Create Memory Drive',
        tool: 'enigma_init',
      },
      follow_up: {
        id: 'check_next_action',
        label: 'Check next action again',
        tool: 'enigma_next_action',
      },
      issue_codes: ['bundle_missing'],
      claim_boundaries: claimBoundaries,
    };
  }
  const { vault, passport } = await loadState(path);
  const activeCount = vault.activeAddresses instanceof Set ? vault.activeAddresses.size : 0;
  const tombstoneCount = vault.tombstones instanceof Map ? vault.tombstones.size : 0;
  const receiptCount = Array.isArray(vault.receipts) ? vault.receipts.length : 0;
  const hasMemory = activeCount > 0;
  return {
    ok: true,
    schema: 'enigma.next_action.v1',
    state: hasMemory ? 'ready_for_app_connection' : 'needs_first_memory',
    bundle: '<bundle-path>',
    passport_ref: `enigma://passport/${passport.passport_id}`,
    primary_action: hasMemory
      ? { id: 'connect_ai_app', label: 'Connect an AI app', tool: 'tools/list' }
      : { id: 'remember_or_import_first_memory', label: 'Remember or import first memory', tool: 'enigma_remember' },
    lanes: {
      memory_drive: { status: 'ready', label: 'Memory Drive exists' },
      import_sandbox: { status: 'ready', label: 'Import Sandbox ready' },
      memory_inventory: { status: hasMemory ? 'has_memory' : 'empty', active_count: activeCount, tombstone_count: tombstoneCount },
      proof_activity: { status: receiptCount > 0 ? 'has_receipts' : 'empty', receipt_count: receiptCount },
    },
    claim_boundaries: claimBoundaries,
  };
}

export async function enigma_import_preview(input = {}) {
  input = validateToolArguments('enigma_import_preview', input);
  const report = importTextMemoryList(input.text ?? '', {
    now: input.now,
    complete: input.complete === true,
    confidence: input.confidence,
  });
  const preview = createImportPreview(report, { now: input.now });
  return {
    ...preview,
    mcp_tool: 'enigma_import_preview',
    vault_write_performed: false,
    claim_boundaries: {
      ...preview.claim_boundaries,
      local_preview_only: true,
      mcp_request_may_contain_private_text: true,
      raw_memory_returned: false,
      provider_deletion_proof: false,
      model_forgetting_proof: false,
    },
  };
}

function blockedImportApproval(reasonCode, preview = undefined) {
  return {
    ok: false,
    schema: 'enigma.import_approval_blocked.v1',
    reason_code: reasonCode,
    vault_write_performed: false,
    ...(preview ? {
      preview_summary: {
        schema: preview.schema,
        preview_id: preview.preview_id,
        import_decision: preview.import_decision,
        candidate_count: preview.candidate_count,
        duplicate_group_count: preview.counts?.dedupe?.duplicate_group_count ?? 0,
        primary_action: preview.primary_action,
      },
    } : {}),
    claim_boundaries: {
      local_preview_only: true,
      raw_memory_returned: false,
      provider_deletion_proof: false,
      model_forgetting_proof: false,
      hosted_saas_live: false,
    },
  };
}

export async function enigma_import_approve(input = {}) {
  input = validateToolArguments('enigma_import_approve', input);
  const previewReport = importTextMemoryList(input.text ?? '', {
    now: input.now,
    complete: input.complete === true,
    confidence: input.confidence,
  });
  const preview = createImportPreview(previewReport, { now: input.now });
  if (input.approved !== true) return blockedImportApproval('explicit_approval_required', preview);
  if (preview.import_decision !== 'ready_for_import' && input.reviewed !== true) {
    return blockedImportApproval('review_required_before_write', preview);
  }
  const path = bundlePath(input);
  if (!(await fileExists(path))) return blockedImportApproval('bundle_missing', preview);
  const { vault } = await loadState(path);
  const report = importTextMemoryList(input.text ?? '', {
    now: input.now,
    complete: input.complete === true,
    confidence: input.confidence,
    vault,
  });
  await persistState(path, vault);
  const postWritePreview = createImportPreview(report, { now: input.now });
  const batchReceipt = createImportBatchReceipt(report, { now: input.now });
  return {
    ok: true,
    schema: 'enigma.import_approved_batch.v1',
    vault_write_performed: true,
    preview_summary: {
      schema: postWritePreview.schema,
      preview_id: postWritePreview.preview_id,
      import_decision: postWritePreview.import_decision,
      candidate_count: postWritePreview.candidate_count,
      duplicate_group_count: postWritePreview.counts?.dedupe?.duplicate_group_count ?? 0,
    },
    import_batch_receipt: batchReceipt,
    claim_boundaries: {
      local_enigma_vault_only: true,
      raw_memory_returned: false,
      provider_deletion_proof: false,
      model_forgetting_proof: false,
      hosted_saas_live: false,
    },
  };
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

function contextRecallScope(input) {
  return {
    app_ref: input.app_ref ?? 'ref:app:mcp-client',
    purpose_ref: input.purpose_ref ?? 'ref:purpose:mcp_context_pack',
    operation: 'recall_context',
    memory_zone_ref: input.memory_zone_ref ?? 'ref:zone:default',
    policy_ref: input.policy_ref ?? 'ref:policy:mcp-context',
  };
}

function contextRecallDecision(input, candidateCount) {
  return createRecallVetoDecision({
    grant: input.grant,
    grants: input.grants,
    revoked_grant_refs: input.revoked_grant_refs,
    now: new Date().toISOString(),
    ...contextRecallScope(input),
    candidate_count: candidateCount,
  });
}

function blockedContextPack(decision) {
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

export async function enigma_context_pack(input = {}) {
  input = validateToolArguments('enigma_context_pack', input);
  const path = bundlePath(input);
  const { vault, passport } = await loadState(path);
  const grantRequired = input.require_grant === true;
  const grantProvided = input.grant !== undefined || input.grants !== undefined || input.revoked_grant_refs !== undefined;
  if (grantRequired || grantProvided) {
    const preflightDecision = contextRecallDecision(input, 0);
    if (preflightDecision.safe_to_share !== true) return blockedContextPack(preflightDecision);
  }
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
  if (grantRequired || grantProvided) {
    pack.memory_controller = {
      context_pack_returned: true,
      recall_veto: contextRecallDecision(input, Array.isArray(pack.memories) ? pack.memories.length : 0),
    };
  }
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

export async function enigma_immune_ingress(input = {}) {
  input = validateToolArguments('enigma_immune_ingress', input);
  return createMcpImmuneIngressReport(input);
}

export async function enigma_memory_weather(input = {}) {
  input = validateToolArguments('enigma_memory_weather', input);
  return assertMemoryControllerPublicSafe(createMemoryWeatherReport(input));
}

export async function enigma_recall_veto(input = {}) {
  input = validateToolArguments('enigma_recall_veto', input);
  return assertMemoryControllerPublicSafe(createRecallVetoDecision({ now: new Date().toISOString(), ...input }));
}

export async function enigma_consent_grant(input = {}) {
  input = validateToolArguments('enigma_consent_grant', input);
  return assertMemoryControllerPublicSafe(createConsentGrant({ now: new Date().toISOString(), ...input }));
}

export async function enigma_private_bubble(input = {}) {
  input = validateToolArguments('enigma_private_bubble', input);
  if (input.action === 'open') return assertMemoryControllerPublicSafe(createPrivateMemoryBubble(input));
  return assertMemoryControllerPublicSafe(closePrivateMemoryBubble(input.bubble, {
    outcome: input.action,
    closed_at: input.closed_at,
    kept_count: input.kept_count,
    discarded_count: input.discarded_count,
    receipt_refs: input.receipt_refs,
  }));
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
  enigma_next_action,
  enigma_init,
  enigma_remember,
  enigma_import_preview,
  enigma_import_approve,
  enigma_search,
  enigma_context_pack,
  enigma_delete,
  enigma_verify_receipts,
  enigma_immune_ingress,
  enigma_memory_weather,
  enigma_recall_veto,
  enigma_consent_grant,
  enigma_private_bubble,
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
  enigma_next_action,
  enigma_remember,
  enigma_import_preview,
  enigma_import_approve,
  enigma_search,
  enigma_context_pack,
  enigma_delete,
  enigma_verify_receipts,
  enigma_immune_ingress,
  enigma_memory_weather,
  enigma_recall_veto,
  enigma_consent_grant,
  enigma_private_bubble,
  enigma_meter_usage,
  enigma_settlement_job,
  enigma_settlement_capacity,
  enigma_settlement_quote,
  enigma_settlement_receipt,
  enigma_settlement_verify,
  enigma_settlement_batch,
  enigma_passport_summary_resource,
  enigma_standard_memory_prompt,
  createMcpImmuneIngressReport,
  assertMcpImmuneIngressPublicSafe,
  handleJsonRpcRequest,
  startStdioServer,
};
