import { canonicalize, createMemoryAddress, sha256Hex } from '../../core/src/index.js';

const MANIFEST_SCHEMA = 'enigma.boundary_manifest.v1';
const DEFAULT_ACTION = 'fail_unknown';
const DEFAULT_CREATED_AT = '1970-01-01T00:00:00.000Z';
const DEFAULT_HMAC_KEY = 'enigma-boundary-local-proof-key';
const FACT_DOMAIN = 'enigma.boundary.fact.v1';

const SURFACES = Object.freeze([
  'model_input',
  'model_output',
  'tool_args',
  'tool_result',
  'scratchpad',
  'clipboard',
  'memory_write',
  'memory_read',
  'rag_ingest',
  'rag_retrieve',
  'file_write',
  'log',
  'telemetry',
  'browser_dom',
  'mcp_resource',
  'network',
  'inter_agent',
  'cache',
  'human_approval'
]);

const CLASSIFICATIONS = Object.freeze([
  'committed',
  'blocked',
  'declared_out_of_scope',
  'broken',
  'fail_closed'
]);

const SURFACE_SET = new Set(SURFACES);
const CLASSIFICATION_SET = new Set(CLASSIFICATIONS);

function assertPlainRecord(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
}


function factCommitment(fact, { hmacKey = DEFAULT_HMAC_KEY, runId = 'boundary-sim', scenario = 'unspecified' } = {}) {
  return createMemoryAddress({
    secret: hmacKey,
    namespace: FACT_DOMAIN,
    subject_id: scenario,
    value: { fact, runId },
    prefix: 'boundary'
  });
}

function defaultBoundaryPaths() {
  return [
    { path_id: 'model_input:committed', surface: 'model_input', classification: 'committed', coverage_receipt_required: true },
    { path_id: 'model_output:committed', surface: 'model_output', classification: 'committed', coverage_receipt_required: true },
    { path_id: 'tool_args:committed', surface: 'tool_args', classification: 'committed', coverage_receipt_required: true },
    { path_id: 'tool_result:raw', surface: 'tool_result', classification: 'broken', reason: 'Uninstrumented tool result can move exact facts without an Enigma receipt.' },
    { path_id: 'tool_result:committed', surface: 'tool_result', classification: 'committed', coverage_receipt_required: true },
    { path_id: 'scratchpad:raw', surface: 'scratchpad', classification: 'broken', reason: 'Uninstrumented scratchpad can carry exact facts outside the committed channel.' },
    { path_id: 'scratchpad:committed', surface: 'scratchpad', classification: 'committed', coverage_receipt_required: true },
    { path_id: 'clipboard:raw', surface: 'clipboard', classification: 'broken', reason: 'Uninstrumented clipboard can carry exact facts outside the committed channel.' },
    { path_id: 'clipboard:committed', surface: 'clipboard', classification: 'committed', coverage_receipt_required: true },
    { path_id: 'memory_write:committed', surface: 'memory_write', classification: 'committed', coverage_receipt_required: true },
    { path_id: 'memory_read:committed', surface: 'memory_read', classification: 'committed', coverage_receipt_required: true },
    { path_id: 'rag_ingest:blocked', surface: 'rag_ingest', classification: 'blocked', reason: 'Semantic/vector ingestion is not admitted by the exact boundary harness.' },
    { path_id: 'rag_retrieve:semantic', surface: 'rag_retrieve', classification: 'declared_out_of_scope', reason: 'Semantic/RAG paraphrase equivalence is outside exact CANP claims.' },
    { path_id: 'file_write:raw', surface: 'file_write', classification: 'broken', reason: 'File artifacts can leak exact facts unless routed through committed receipts.' },
    { path_id: 'log:raw', surface: 'log', classification: 'broken', reason: 'Logs can leak exact facts unless blocked or committed.' },
    { path_id: 'telemetry:blocked', surface: 'telemetry', classification: 'blocked', reason: 'Telemetry egress is denied for boundary canaries.' },
    { path_id: 'browser_dom:blocked', surface: 'browser_dom', classification: 'blocked', reason: 'Browser DOM injection is denied in the local harness.' },
    { path_id: 'mcp_resource:committed', surface: 'mcp_resource', classification: 'committed', coverage_receipt_required: true },
    { path_id: 'network:callback', surface: 'network', classification: 'broken', reason: 'Network callbacks can leak exact facts unless blocked or committed.' },
    { path_id: 'inter_agent:committed', surface: 'inter_agent', classification: 'committed', coverage_receipt_required: true },
    { path_id: 'cache:blocked', surface: 'cache', classification: 'blocked', reason: 'Cache side paths are denied in the local harness.' },
    { path_id: 'human_approval:committed', surface: 'human_approval', classification: 'committed', coverage_receipt_required: true }
  ];
}

function normalizePath(path) {
  assertPlainRecord(path, 'boundary path');
  const out = {
    path_id: String(path.path_id ?? ''),
    surface: String(path.surface ?? ''),
    classification: String(path.classification ?? '')
  };

  if (path.adapter !== undefined) out.adapter = String(path.adapter);
  if (path.reason !== undefined) out.reason = String(path.reason);
  if (path.coverage_receipt_required !== undefined) out.coverage_receipt_required = Boolean(path.coverage_receipt_required);
  return out;
}

export function createBoundaryManifest(options = {}) {
  assertPlainRecord(options, 'options');
  const systemId = String(options.systemId ?? options.system_id ?? 'local-boundary-sim');
  const createdAt = String(options.createdAt ?? options.created_at ?? DEFAULT_CREATED_AT);
  const paths = (options.paths ?? defaultBoundaryPaths()).map(normalizePath);
  const manifestWithoutId = {
    schema: MANIFEST_SCHEMA,
    manifest_id: 'pending',
    system_id: systemId,
    created_at: createdAt,
    paths,
    default_action: DEFAULT_ACTION
  };
  const manifestId = String(options.manifestId ?? options.manifest_id ?? sha256Hex(canonicalize({ ...manifestWithoutId, manifest_id: '' })).slice(0, 24));
  return { ...manifestWithoutId, manifest_id: manifestId };
}

export function verifyBoundaryManifest(manifest) {
  const errors = [];
  const warnings = [];

  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { ok: false, status: 'FAIL', errors: ['MANIFEST_NOT_OBJECT'], warnings, manifestHash: null };
  }

  const allowedRoot = new Set(['schema', 'manifest_id', 'system_id', 'created_at', 'paths', 'default_action']);
  for (const key of Object.keys(manifest)) {
    if (!allowedRoot.has(key)) errors.push(`UNKNOWN_ROOT_PROPERTY:${key}`);
  }

  if (manifest.schema !== MANIFEST_SCHEMA) errors.push('BAD_SCHEMA');
  if (typeof manifest.manifest_id !== 'string' || manifest.manifest_id.length < 8) errors.push('BAD_MANIFEST_ID');
  if (typeof manifest.system_id !== 'string' || manifest.system_id.length < 1) errors.push('BAD_SYSTEM_ID');
  if (typeof manifest.created_at !== 'string' || Number.isNaN(Date.parse(manifest.created_at))) errors.push('BAD_CREATED_AT');
  if (manifest.default_action !== DEFAULT_ACTION) errors.push('DEFAULT_ACTION_MUST_FAIL_UNKNOWN');
  if (!Array.isArray(manifest.paths) || manifest.paths.length === 0) errors.push('PATHS_REQUIRED');

  const seenIds = new Set();
  const coveredSurfaces = new Set();
  let hasBroken = false;
  let hasOutOfScope = false;

  if (Array.isArray(manifest.paths)) {
    for (const [index, path] of manifest.paths.entries()) {
      if (path === null || typeof path !== 'object' || Array.isArray(path)) {
        errors.push(`PATH_NOT_OBJECT:${index}`);
        continue;
      }

      const allowedPath = new Set(['path_id', 'surface', 'classification', 'adapter', 'reason', 'coverage_receipt_required']);
      for (const key of Object.keys(path)) {
        if (!allowedPath.has(key)) errors.push(`UNKNOWN_PATH_PROPERTY:${index}:${key}`);
      }

      if (typeof path.path_id !== 'string' || path.path_id.length < 1) errors.push(`BAD_PATH_ID:${index}`);
      else if (seenIds.has(path.path_id)) errors.push(`DUPLICATE_PATH_ID:${path.path_id}`);
      else seenIds.add(path.path_id);

      if (!SURFACE_SET.has(path.surface)) errors.push(`UNKNOWN_SURFACE:${path.path_id ?? index}`);
      else coveredSurfaces.add(path.surface);

      if (!CLASSIFICATION_SET.has(path.classification)) errors.push(`UNKNOWN_CLASSIFICATION:${path.path_id ?? index}`);
      if (path.classification === 'broken' || path.classification === 'fail_closed') hasBroken = true;
      if (path.classification === 'declared_out_of_scope') hasOutOfScope = true;
      if (path.coverage_receipt_required !== undefined && typeof path.coverage_receipt_required !== 'boolean') {
        errors.push(`BAD_COVERAGE_RECEIPT_REQUIRED:${path.path_id ?? index}`);
      }
    }
  }

  for (const surface of SURFACES) {
    if (!coveredSurfaces.has(surface)) errors.push(`MISSING_SURFACE:${surface}`);
  }

  if (hasBroken) warnings.push('BROKEN_PATH_DECLARED');
  if (hasOutOfScope) warnings.push('OUT_OF_SCOPE_PATH_DECLARED');

  const manifestHash = errors.length === 0 ? sha256Hex(canonicalize(manifest)) : null;
  const status = errors.length > 0 || hasBroken ? 'FAIL' : hasOutOfScope ? 'NARROW_GO' : 'PASS';
  return { ok: errors.length === 0, status, errors, warnings, manifestHash };
}

export function classifyBoundaryPath(manifest, pathRef) {
  const verification = verifyBoundaryManifest(manifest);
  if (!verification.ok) {
    return {
      known: false,
      classification: 'fail_closed',
      fail_closed: true,
      canp: 'UNKNOWN_BOUNDARY',
      verdict: 'FAIL',
      reason: verification.errors.includes('MANIFEST_NOT_OBJECT') ? 'MISSING_OR_INVALID_MANIFEST' : 'INVALID_MANIFEST',
      manifestErrors: verification.errors
    };
  }

  const ref = typeof pathRef === 'string' ? { path_id: pathRef } : pathRef;
  if (ref === null || typeof ref !== 'object' || Array.isArray(ref)) {
    return {
      known: false,
      classification: 'fail_closed',
      fail_closed: true,
      canp: 'UNKNOWN_BOUNDARY',
      verdict: 'FAIL',
      reason: 'BAD_PATH_REF'
    };
  }

  const hasPathId = typeof ref.path_id === 'string' && ref.path_id.length > 0;
  const hasSurface = typeof ref.surface === 'string' && ref.surface.length > 0;
  let matches = [];

  if (hasPathId) {
    matches = manifest.paths.filter((path) => path.path_id === ref.path_id);
    if (matches.length !== 1) {
      return {
        known: false,
        classification: 'fail_closed',
        fail_closed: true,
        canp: 'UNKNOWN_BOUNDARY',
        verdict: 'FAIL',
        reason: matches.length === 0 ? 'UNCLASSIFIED_PATH' : 'AMBIGUOUS_PATH'
      };
    }
    if (hasSurface && matches[0].surface !== ref.surface) {
      return {
        known: false,
        classification: 'fail_closed',
        fail_closed: true,
        canp: 'UNKNOWN_BOUNDARY',
        verdict: 'FAIL',
        reason: 'AMBIGUOUS_PATH'
      };
    }
  } else if (hasSurface) {
    matches = manifest.paths.filter((path) => path.surface === ref.surface);
    if (matches.length !== 1) {
      return {
        known: false,
        classification: 'fail_closed',
        fail_closed: true,
        canp: 'UNKNOWN_BOUNDARY',
        verdict: 'FAIL',
        reason: matches.length === 0 ? 'UNCLASSIFIED_PATH' : 'AMBIGUOUS_PATH'
      };
    }
  } else {
    return {
      known: false,
      classification: 'fail_closed',
      fail_closed: true,
      canp: 'UNKNOWN_BOUNDARY',
      verdict: 'FAIL',
      reason: 'BAD_PATH_REF'
    };
  }

  const [path] = matches;
  const canpByClassification = {
    committed: 'COMMITTED_PATH',
    blocked: 'BLOCKED_PATH',
    declared_out_of_scope: 'OUT_OF_SCOPE',
    broken: 'BROKEN_PATH',
    fail_closed: 'UNKNOWN_BOUNDARY'
  };
  const verdictByClassification = {
    committed: 'PASS',
    blocked: 'PASS',
    declared_out_of_scope: 'NARROW_GO',
    broken: 'FAIL',
    fail_closed: 'FAIL'
  };

  return {
    known: true,
    fail_closed: path.classification === 'broken' || path.classification === 'fail_closed',
    path,
    classification: path.classification,
    canp: canpByClassification[path.classification],
    verdict: verdictByClassification[path.classification],
    reason: path.reason ?? null
  };
}

function scenarioDefinitions() {
  return [
    {
      scenario: 'control never sent',
      pathId: 'model_input:committed',
      fact: 'control-boundary-canary',
      bGotVia: 'none',
      committed: false
    },
    {
      scenario: 'honest committed crossing',
      pathId: 'model_input:committed',
      fact: 'honest-committed-canary',
      bGotVia: 'committed_channel',
      committed: true
    },
    {
      scenario: 'scratchpad leak',
      pathId: 'scratchpad:raw',
      fact: 'scratchpad-leak-canary',
      bGotVia: 'scratchpad',
      committed: false
    },
    {
      scenario: 'tool-output leak',
      pathId: 'tool_result:raw',
      fact: 'tool-output-leak-canary',
      bGotVia: 'tool_result',
      committed: false
    },
    {
      scenario: 'clipboard leak',
      pathId: 'clipboard:raw',
      fact: 'clipboard-leak-canary',
      bGotVia: 'clipboard',
      committed: false
    },
    {
      scenario: 'log leak',
      pathId: 'log:raw',
      fact: 'log-leak-canary',
      bGotVia: 'log',
      committed: false
    },
    {
      scenario: 'file artifact leak',
      pathId: 'file_write:raw',
      fact: 'file-artifact-leak-canary',
      bGotVia: 'file_artifact',
      committed: false
    },
    {
      scenario: 'network callback leak',
      pathId: 'network:callback',
      fact: 'network-callback-leak-canary',
      bGotVia: 'network_callback',
      committed: false
    },
    {
      scenario: 'mitigated scratchpad route-through-channel',
      pathId: 'scratchpad:committed',
      fact: 'mitigated-scratchpad-canary',
      bGotVia: 'scratchpad_via_committed_channel',
      committed: true
    },
    {
      scenario: 'mitigated clipboard route-through-channel',
      pathId: 'clipboard:committed',
      fact: 'mitigated-clipboard-canary',
      bGotVia: 'clipboard_via_committed_channel',
      committed: true
    },
    {
      scenario: 'mitigated tool route-through-channel',
      pathId: 'tool_result:committed',
      fact: 'mitigated-tool-canary',
      bGotVia: 'tool_result_via_committed_channel',
      committed: true
    },
    {
      scenario: 'unknown provider route',
      pathId: 'provider_native:tool_result',
      fact: 'unknown-provider-route-canary',
      bGotVia: 'provider_native_tool',
      committed: false
    },
    {
      scenario: 'ambiguous tool surface route',
      pathId: 'tool_result:*',
      pathRef: { surface: 'tool_result' },
      fact: 'ambiguous-tool-surface-canary',
      bGotVia: 'tool_surface',
      committed: false
    },
    {
      scenario: 'semantic/RAG paraphrase declared out-of-scope',
      pathId: 'rag_retrieve:semantic',
      fact: 'semantic-rag-paraphrase-canary',
      bGotVia: 'rag_paraphrase',
      committed: false,
      semantic: true
    }
  ];
}

function evaluateScenario(manifest, scenario, options) {
  const pathRef = scenario.pathRef ?? scenario.pathId;
  const classification = classifyBoundaryPath(manifest, pathRef);
  const address = factCommitment(scenario.fact, { hmacKey: options.hmacKey, runId: options.runId, scenario: scenario.scenario });
  const bHasFact = scenario.bGotVia !== 'none';
  const committedSet = new Set(scenario.committed ? [address] : []);
  const crossedCommittedChannel = committedSet.has(address);

  let canp;
  let verdict;

  if (!classification.known) {
    canp = 'UNKNOWN_BOUNDARY';
    verdict = 'FAIL';
  } else if (classification.classification === 'declared_out_of_scope') {
    canp = 'OUT_OF_SCOPE';
    verdict = 'NARROW_GO';
  } else if (classification.classification === 'blocked') {
    canp = bHasFact ? 'FALSE_ASSURANCE' : 'BLOCKED';
    verdict = bHasFact ? 'FAIL' : 'PASS';
  } else if (crossedCommittedChannel) {
    canp = 'CROSSED';
    verdict = 'PASS';
  } else if (bHasFact) {
    canp = 'FALSE_ASSURANCE';
    verdict = 'FAIL';
  } else {
    canp = 'NEVER_CROSSED_COMMITTED_CHANNEL';
    verdict = 'PASS';
  }

  return {
    row: {
      scenario: scenario.scenario,
      pathId: scenario.pathId,
      bGotVia: scenario.bGotVia,
      classification: classification.classification,
      failClosed: verdict === 'FAIL' || classification.fail_closed === true,
      canp,
      verdict,
      reason: classification.reason
    },
    commitment: {
      scenario: scenario.scenario,
      fact_address: address,
      path_id: scenario.pathId
    }
  };
}

export function runBoundarySimulation(options = {}) {
  assertPlainRecord(options, 'options');
  const runId = String(options.runId ?? options.run_id ?? 'boundary-sim-local');
  const hmacKey = String(options.hmacKey ?? options.hmac_key ?? DEFAULT_HMAC_KEY);
  const manifest = Object.prototype.hasOwnProperty.call(options, 'manifest') ? options.manifest : createBoundaryManifest({ systemId: options.systemId, createdAt: options.createdAt });
  const manifestVerification = verifyBoundaryManifest(manifest);
  const scenarios = options.scenarios ?? scenarioDefinitions();
  const evaluated = scenarios.map((scenario) => evaluateScenario(manifest, scenario, { hmacKey, runId }));
  const rows = evaluated.map((item) => item.row);
  const commitments = evaluated.map((item) => item.commitment);

  let status = 'PASS';
  if (!manifestVerification.ok || rows.some((row) => row.verdict === 'FAIL')) status = 'FAIL';
  else if (rows.some((row) => row.verdict === 'NARROW_GO') || manifestVerification.status === 'NARROW_GO') status = 'NARROW_GO';

  return {
    schema: 'enigma.boundary_simulation.v1',
    run_id: runId,
    manifest_hash: manifestVerification.manifestHash,
    manifest_status: manifestVerification.status,
    rows,
    status,
    finalStatus: status,
    commitments,
    honesty_text: 'This report proves exact facts about declared Enigma-instrumented paths. It does not prove provider deletion, model forgetting, semantic forgetting, model-weight deletion, or absence of uninstrumented provider-internal side channels.'
  };
}

export const boundarySurfaces = SURFACES;
export const boundaryClassifications = CLASSIFICATIONS;
