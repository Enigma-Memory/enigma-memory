import { canonicalize, sha256Hex, MerkleSet, verifyReceipt } from '../../core/src/index.js';
import { remember } from '../../vault/src/index.js';
import { createCapsuleManifest, createMeshNode, verifyCapsuleManifest } from '../../mesh/src/index.js';

const REPORT_SCHEMA = 'enigma.import_report.v1';
const CAPSULE_SCHEMA = 'enigma.import_capsule.v1';
const CAPSULE_PAYLOAD_SCHEMA = 'enigma.import_capsule_payload.v1';
const VERIFIER_METADATA_SCHEMA = 'enigma.import_capsule_verifier_metadata.v1';
const IMMUNE_INGRESS_SCHEMA = 'enigma.immune_scan_report.v1';
const IMMUNE_INGRESS_DEFAULT_SOURCE = 'importer_candidate_ingress';
const DEFAULT_NOW = '1970-01-01T00:00:00.000Z';
const DEFAULT_EXPIRY = '2100-01-01T00:00:00.000Z';
const CONFIDENCE_ORDER = new Map([
  ['low', 0],
  ['medium', 1],
  ['high', 2],
  ['source_asserted', 3],
  ['user_confirmed', 4]
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function stable(value) {
  try {
    return canonicalize(value);
  } catch {
    const seen = new WeakSet();
    return JSON.stringify(value, (_key, item) => {
      if (typeof item === 'bigint') return item.toString();
      if (typeof item === 'undefined' || typeof item === 'function' || typeof item === 'symbol') return null;
      if (item !== null && typeof item === 'object') {
        if (seen.has(item)) return '[Circular]';
        seen.add(item);
      }
      return item;
    }) ?? 'null';
  }
}

function rootOf(value) {
  return `sha256:${sha256Hex(typeof value === 'string' ? value : stable(value))}`;
}

function shortHash(value) {
  return sha256Hex(typeof value === 'string' ? value : stable(value)).slice(0, 32);
}

function nowFrom(options) {
  const now = options?.now ?? DEFAULT_NOW;
  if (now instanceof Date) return now.toISOString();
  if (typeof now === 'string') return new Date(now).toISOString();
  return new Date(now).toISOString();
}

function parseMaybeJson(input) {
  if (typeof input !== 'string') return input;
  const trimmed = input.trim();
  if (trimmed.length === 0) return '';
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return input;
    }
  }
  return input;
}

function stringValue(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map((item) => stringValue(item)).filter(Boolean).join('\n').trim();
  if (isRecord(value)) {
    if (Array.isArray(value.parts)) return stringValue(value.parts);
    if (typeof value.text === 'string') return value.text.trim();
    if (typeof value.content === 'string') return value.content.trim();
    if (typeof value.value === 'string') return value.value.trim();
    if (typeof value.memory === 'string') return value.memory.trim();
    if (typeof value.fact === 'string') return value.fact.trim();
    if (typeof value.summary === 'string') return value.summary.trim();
    if (typeof value.message === 'string') return value.message.trim();
  }
  return '';
}

function textLines(value) {
  if (typeof value !== 'string') return [];
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s+/, '').trim())
    .filter(Boolean);
}

function firstString(record, names) {
  if (!isRecord(record)) return '';
  for (const name of names) {
    const value = stringValue(record[name]);
    if (value) return value;
  }
  return '';
}

function collectLimitations(input, defaults) {
  const limitations = [];
  for (const item of defaults) limitations.push(item);
  if (isRecord(input)) {
    for (const key of ['limitations', 'limits', 'warnings', 'caveats']) {
      for (const value of asArray(input[key])) {
        const text = stringValue(value);
        if (text) limitations.push(text);
      }
    }
    if (isRecord(input.metadata)) {
      for (const value of asArray(input.metadata.limitations)) {
        const text = stringValue(value);
        if (text) limitations.push(text);
      }
    }
  }
  return uniqueStrings(limitations);
}

function uniqueStrings(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text.length === 0 || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function parseCompletenessFlag(value) {
  if (value === true || value === false) return value;
  if (typeof value !== 'string') return null;
  const normalized = value.toLowerCase();
  if (normalized === 'complete' || normalized === 'full' || normalized === 'explicit_complete') return true;
  if (normalized === 'incomplete' || normalized === 'partial' || normalized === 'unknown' || normalized === 'partial_or_unknown') return false;
  return null;
}

function completenessInputs(input) {
  if (!isRecord(input)) return [];
  return [
    input.complete,
    input.is_complete,
    input.export_complete,
    input.exportComplete,
    input.completeness,
    input.metadata?.complete,
    input.metadata?.is_complete,
    input.metadata?.export_complete,
    input.metadata?.completeness
  ].filter((value) => value !== undefined && value !== null);
}

function completenessEvidence(input) {
  let recognized_count = 0;
  let unsupported_count = 0;
  let true_count = 0;
  let false_count = 0;
  for (const value of completenessInputs(input)) {
    const parsed = parseCompletenessFlag(value);
    if (parsed === null) {
      unsupported_count += 1;
      continue;
    }
    recognized_count += 1;
    if (parsed) true_count += 1;
    else false_count += 1;
  }
  const conflicting = true_count > 0 && false_count > 0;
  return {
    recognized_count,
    unsupported_count,
    conflicting,
    explicit_assertion: recognized_count > 0,
    complete: !conflicting && true_count > 0 && false_count === 0
  };
}

function explicitCompleteness(input) {
  const evidence = completenessEvidence(input);
  if (evidence.conflicting) return false;
  if (evidence.recognized_count === 0) return null;
  return evidence.complete;
}

function completenessLimitations(input) {
  const evidence = completenessEvidence(input);
  if (evidence.conflicting) {
    return {
      complete: false,
      evidence,
      limitations: ['source completeness flags conflict; imported memories are treated as partial until the source is reconciled']
    };
  }
  if (evidence.complete) return { complete: true, evidence, limitations: [] };
  if (evidence.recognized_count > 0) {
    return {
      complete: false,
      evidence,
      limitations: ['source explicitly reports an incomplete export; do not treat imported memories as complete']
    };
  }
  return {
    complete: false,
    evidence,
    limitations: ['source did not include an explicit completeness flag; imported memories have unknown coverage']
  };
}

function normalizeConfidence(value, fallback = 'medium') {
  if (typeof value !== 'string') return fallback;
  const normalized = value.toLowerCase().replace(/[^a-z_]/g, '_');
  if (CONFIDENCE_ORDER.has(normalized)) return normalized;
  if (normalized === 'certain') return 'high';
  if (normalized === 'maybe' || normalized === 'inferred') return 'low';
  return fallback;
}

function aggregateConfidence(candidates) {
  if (candidates.length === 0) return 'low';
  let lowest = 'user_confirmed';
  for (const candidate of candidates) {
    if ((CONFIDENCE_ORDER.get(candidate.confidence) ?? 0) < (CONFIDENCE_ORDER.get(lowest) ?? 0)) lowest = candidate.confidence;
  }
  return lowest;
}

function sourceRef(sourceType, path, id, fragment) {
  const ref = {
    source_type: sourceType,
    path,
    source_hash: rootOf(fragment ?? `${sourceType}:${path}:${id ?? ''}`)
  };
  if (id !== undefined && id !== null && String(id).length > 0) ref.source_id = String(id);
  return ref;
}

const PLAINTEXT_METADATA_KEYS = new Set([
  'body',
  'content',
  'memory',
  'plaintext',
  'prompt',
  'rawmemory',
  'response',
  'summary',
  'text',
  'value'
]);

function normalizedMetadataKey(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function metadataCommitmentKey(key) {
  return `${String(key).replace(/[^A-Za-z0-9_:-]/g, '_')}_commitment`;
}

function assignMetadataValue(metadata, key, item) {
  if (item !== null && !['string', 'number', 'boolean'].includes(typeof item)) return;
  if (PLAINTEXT_METADATA_KEYS.has(normalizedMetadataKey(key))) {
    if (item !== null) metadata[metadataCommitmentKey(key)] = rootOf(String(item));
    return;
  }
  metadata[key] = item;
}

function normalizeMetadata(value, extra = {}) {
  const metadata = {};
  for (const [key, item] of Object.entries(extra)) assignMetadataValue(metadata, key, item);
  if (!isRecord(value)) return metadata;
  for (const [key, item] of Object.entries(value)) assignMetadataValue(metadata, key, item);
  return metadata;
}

const IMMUNE_DETECTOR_IDS = Object.freeze({
  rawPublicField: 'enigma.detector.forbidden_field.raw_public_payload.v1',
  secretField: 'enigma.detector.forbidden_field.secret_or_credential.v1',
  providerResponseField: 'enigma.detector.forbidden_field.provider_response.v1',
  embeddingField: 'enigma.detector.forbidden_field.embedding.v1',
  secretValue: 'enigma.detector.secret_value.v1',
  localPathValue: 'enigma.detector.local_path_value.v1',
  forbiddenClaimValue: 'enigma.detector.forbidden_claim_value.v1',
  rawStringCandidate: 'enigma.detector.raw_string_candidate.v1',
  cyclicCandidate: 'enigma.detector.cyclic_candidate.v1'
});

const RAW_PUBLIC_FIELD_KEYS = new Set([
  'body',
  'completion',
  'completions',
  'content',
  'conversation',
  'conversations',
  'memory',
  'memories',
  'message',
  'messages',
  'plaintext',
  'plainmemory',
  'prompt',
  'prompts',
  'rawmemory',
  'response',
  'responses',
  'summary',
  'text',
  'transcript',
  'transcripts',
  'value'
]);

const SECRET_FIELD_KEYS = new Set([
  'accesstoken',
  'apikey',
  'apisecret',
  'bearer',
  'clientsecret',
  'credential',
  'credentials',
  'password',
  'privatekey',
  'refreshtoken',
  'secret',
  'seedphrase',
  'token'
]);

const PROVIDER_RESPONSE_FIELD_KEYS = new Set([
  'providerresponse',
  'providerresponses',
  'providerresponsebody',
  'responsebody'
]);

const EMBEDDING_FIELD_KEYS = new Set([
  'embedding',
  'embeddings',
  'embeddingvector',
  'embeddingvectors',
  'vector',
  'vectors'
]);

const PUBLIC_COMMITMENT_FIELD_RE = /(?:hash|root|ref|refs|id|ids|count|counts|schema|status|decision|policy|capability|signature|signer|nullifier|timestamp|generatedat|issuedat|expiresat)$/u;
const SECRET_VALUE_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{16,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}|(?:seed phrase|mnemonic phrase|api key secret|access token|refresh token|private key))/iu;
const RAW_PUBLIC_VALUE_RE = /(?:raw memory|private prompt|plaintext prompt|plain text prompt|full transcript|decrypted memory|decrypted capsule|provider response|embedding vector|launch-code phrase)/iu;
const LOCAL_PATH_VALUE_RE = /(?:^|[\s"'`(])(?:[A-Za-z]:[\\/][^\s"'`<>]+|\\\\[^\\/]+[\\/][^\s"'`<>]+|\/(?:Users|home)\/[^\s"'`<>]+)/u;
const FORBIDDEN_CLAIM_VALUE_RE = /(?:provider(?:-native|-side|\s+native|\s+side)?\s+(?:deletion|erasure|memory control|forgetting)|model\s+(?:forgetting|forgot|erasure)|makes?\s+models?\s+forget|deleted\s+from\s+every\s+provider|compliance\s+certification|certified\s+compliant|hosted\s+saas\s+ready|byoc\s+ready|benchmark\s+(?:superiority|leader)|raw\s+embeddings?\s+(?:safe|public)|hardware\s+tamper[-\s]?proof|patent(?:able|ability)|legal\s+conclusion)/iu;
const RAW_PUBLIC_FIELD_RE = /(?:(?:raw|plain|plaintext|cleartext|decrypted).*(?:memory|prompt|text|content|message|transcript|conversation|response|body)|(?:memory|prompt|text|content|message|transcript|conversation|response|body).*(?:raw|plain|plaintext|cleartext|decrypted)|(?:prompt|message|transcript|conversation|memory|content|text)(?:body|value))$/u;
const SECRET_FIELD_RE = /(?:apikey|apisecret|accesstoken|refreshtoken|tokenvalue|credential|password|privatekey|clientsecret|secretkey|seedphrase|mnemonic|bearertoken)/u;
const PROVIDER_RESPONSE_FIELD_RE = /(?:provider.*responses?|responses?.*body)$/u;
const EMBEDDING_FIELD_RE = /(?:embedding|embeddings|embeddingvector|embeddingvectors|vector|vectors)$/u;

function normalizePublicToken(value, fallback) {
  const token = String(value ?? '').toLowerCase().replace(/[^a-z0-9_.:-]+/gu, '_').replace(/^_+|_+$/gu, '');
  return token.length > 0 && token.length <= 96 ? token : fallback;
}

function hasMeaningfulForbiddenValue(value) {
  if (value === undefined || value === null || value === false) return false;
  if (typeof value === 'string') return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.keys(value).length > 0;
  return true;
}

function detectorIdsForField(key, value) {
  if (!hasMeaningfulForbiddenValue(value)) return [];
  const normalized = normalizedMetadataKey(key);
  if (PUBLIC_COMMITMENT_FIELD_RE.test(normalized)) return [];
  const detectors = [];
  if (PROVIDER_RESPONSE_FIELD_KEYS.has(normalized) || PROVIDER_RESPONSE_FIELD_RE.test(normalized)) detectors.push(IMMUNE_DETECTOR_IDS.providerResponseField);
  if (EMBEDDING_FIELD_KEYS.has(normalized) || EMBEDDING_FIELD_RE.test(normalized)) detectors.push(IMMUNE_DETECTOR_IDS.embeddingField);
  if (SECRET_FIELD_KEYS.has(normalized) || SECRET_FIELD_RE.test(normalized)) detectors.push(IMMUNE_DETECTOR_IDS.secretField);
  if (RAW_PUBLIC_FIELD_KEYS.has(normalized) || RAW_PUBLIC_FIELD_RE.test(normalized)) detectors.push(IMMUNE_DETECTOR_IDS.rawPublicField);
  return detectors;
}

function detectorIdsForString(value) {
  const detectors = [];
  if (SECRET_VALUE_RE.test(value)) detectors.push(IMMUNE_DETECTOR_IDS.secretValue);
  if (RAW_PUBLIC_VALUE_RE.test(value)) detectors.push(IMMUNE_DETECTOR_IDS.rawPublicField);
  if (LOCAL_PATH_VALUE_RE.test(value)) detectors.push(IMMUNE_DETECTOR_IDS.localPathValue);
  if (FORBIDDEN_CLAIM_VALUE_RE.test(value)) detectors.push(IMMUNE_DETECTOR_IDS.forbiddenClaimValue);
  return detectors;
}

function addAntigen(antigens, detector_id, candidate_ref, path_ref) {
  antigens.push({
    detector_id,
    antigen_ref: `antigen_${shortHash({ detector_id, candidate_ref, path_ref })}`
  });
}

function candidateOpaqueRef(candidate, index) {
  try {
    return `candidate_${shortHash({ index, root: rootOf(candidate) })}`;
  } catch {
    return `candidate_${shortHash({ index, uncanonicalizable: true, type: Object.prototype.toString.call(candidate) })}`;
  }
}

function scanImmuneIngressValue(value, candidate_ref, antigens, path_ref, seen) {
  if (typeof value === 'string') {
    for (const detector of detectorIdsForString(value)) addAntigen(antigens, detector, candidate_ref, path_ref);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  if (seen.has(value)) {
    addAntigen(antigens, IMMUNE_DETECTOR_IDS.cyclicCandidate, candidate_ref, path_ref);
    return;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanImmuneIngressValue(item, candidate_ref, antigens, `${path_ref}.${index}`, seen));
    seen.delete(value);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const childPathRef = `${path_ref}.${shortHash(key)}`;
    for (const detector of detectorIdsForField(key, child)) addAntigen(antigens, detector, candidate_ref, childPathRef);
    scanImmuneIngressValue(child, candidate_ref, antigens, childPathRef, seen);
  }
  seen.delete(value);
}

function immuneIngressCandidates(input, options = {}) {
  const candidatesKey = options.candidates_key ?? options.candidatesKey;
  if (candidatesKey !== undefined && isRecord(input) && Array.isArray(input[candidatesKey])) return input[candidatesKey];
  if (Array.isArray(input)) return input;
  if (!isRecord(input)) return input === undefined || input === null ? [] : [input];
  for (const key of ['memory_candidates', 'memoryCandidates', 'candidates', 'candidate_objects', 'candidateObjects', 'items']) {
    if (Array.isArray(input[key])) return input[key];
  }
  if (Object.prototype.hasOwnProperty.call(input, 'candidate')) return [input.candidate];
  return [input];
}

function immuneIngressReportFromCandidates(candidates, options = {}) {
  const source_type = normalizePublicToken(options.source_type ?? options.sourceType, IMMUNE_INGRESS_DEFAULT_SOURCE);
  const generated_at = nowFrom(options);
  const allAntigenRefs = [];
  const candidateReports = candidates.map((candidate, index) => {
    const candidate_ref = candidateOpaqueRef(candidate, index);
    const antigens = [];
    if (typeof candidate === 'string') addAntigen(antigens, IMMUNE_DETECTOR_IDS.rawStringCandidate, candidate_ref, 'candidate');
    scanImmuneIngressValue(candidate, candidate_ref, antigens, 'candidate', new WeakSet());
    const detector_ids = uniqueStrings(antigens.map((antigen) => antigen.detector_id));
    const antigenRefs = antigens.map((antigen) => antigen.antigen_ref);
    allAntigenRefs.push(...antigenRefs);
    return {
      candidate_ref,
      quarantine_decision: antigens.length > 0 ? 'quarantine' : 'accept',
      antigen_count: antigens.length,
      detector_ids,
      antigen_refs: antigenRefs,
      antigen_root: new MerkleSet(antigenRefs).root()
    };
  });
  const quarantined = candidateReports.filter((candidate) => candidate.quarantine_decision === 'quarantine');
  const accepted = candidateReports.filter((candidate) => candidate.quarantine_decision === 'accept');
  const detector_ids = uniqueStrings(candidateReports.flatMap((candidate) => candidate.detector_ids));
  const antigenRefs = allAntigenRefs;
  const candidateRefs = candidateReports.map((candidate) => candidate.candidate_ref);
  const quarantineRefs = quarantined.map((candidate) => candidate.candidate_ref);
  const roots = {
    candidate_root: new MerkleSet(candidateRefs).root(),
    accepted_root: new MerkleSet(accepted.map((candidate) => candidate.candidate_ref)).root(),
    quarantine_root: new MerkleSet(quarantineRefs).root(),
    antigen_root: new MerkleSet(antigenRefs).root()
  };
  const findings = quarantined.map((candidate) => ({
    finding_ref: `finding_${shortHash({ candidate_ref: candidate.candidate_ref, antigen_root: candidate.antigen_root })}`,
    subject_ref: candidate.candidate_ref,
    detector_ids: candidate.detector_ids,
    antigen_count: candidate.antigen_count,
    status: 'quarantined',
    risk: 'high',
    antigen_refs: candidate.antigen_refs,
    antigen_root: candidate.antigen_root
  }));
  return {
    schema: IMMUNE_INGRESS_SCHEMA,
    report_id: `immune_scan_${shortHash({ source_type, generated_at, findings, roots })}`,
    generated_at,
    scan_root: new MerkleSet([...candidateRefs, ...antigenRefs]).root(),
    antigen_envelope_refs: antigenRefs,
    detector_ids,
    findings,
    counts: {
      candidate_count: candidateReports.length,
      accepted_candidate_count: accepted.length,
      quarantined_candidate_count: quarantined.length,
      antigen_count: candidateReports.reduce((sum, candidate) => sum + candidate.antigen_count, 0)
    },
    status: {
      ok: quarantined.length === 0,
      quarantine_decision: quarantined.length === 0 ? 'accept' : 'quarantine'
    },
    quarantine_refs: quarantineRefs,
    roots,
    public_payload_only: true,
    private_payload_detected: antigenRefs.length > 0
  };
}

export function createImmuneIngressReport(input = [], options = {}) {
  return immuneIngressReportFromCandidates(immuneIngressCandidates(input, options), options);
}

export function quarantineImmuneIngressCandidates(input = [], options = {}) {
  return createImmuneIngressReport(input, options);
}

export function assertImmuneIngressPublicSafe(input = [], options = {}) {
  const report = quarantineImmuneIngressCandidates(input, options);
  if (!report.status.ok) {
    const error = new Error(`Immune ingress quarantine required: ${report.counts.antigen_count} antigen(s) detected.`);
    error.name = 'ImmuneIngressQuarantineError';
    error.report = report;
    throw error;
  }
  return report;
}

function makeCandidate({ importer, sourceType, content, source_refs, limitations, confidence, kind, metadata }) {
  const normalizedContent = stringValue(content);
  if (!normalizedContent) return null;
  const refs = source_refs.length > 0 ? source_refs : [sourceRef(sourceType, 'unknown', undefined, normalizedContent)];
  return {
    schema: 'enigma.memory_candidate.v1',
    candidate_id: `cand_${shortHash({ importer, refs, normalizedContent })}`,
    kind: kind ?? 'fact',
    content: normalizedContent,
    source_refs: refs,
    limitations: uniqueStrings(limitations),
    confidence: normalizeConfidence(confidence),
    metadata: normalizeMetadata(metadata, { importer })
  };
}

function addCandidate(out, args) {
  const candidate = makeCandidate(args);
  if (candidate) out.push(candidate);
}

function reportFrom(importer, sourceType, input, candidates, baseLimitations, options = {}) {
  const { complete, limitations: completenessLimits, evidence } = completenessLimitations(input);
  const limitations = uniqueStrings([...baseLimitations, ...completenessLimits]);
  const memoryCandidates = candidates.map((candidate) => ({
    ...candidate,
    limitations: uniqueStrings([...candidate.limitations, ...limitations])
  }));
  const vault_writes = writeCandidatesToVault(memoryCandidates, options);
  return {
    schema: REPORT_SCHEMA,
    report_id: `imp_${shortHash({ importer, source: input, memoryCandidates })}`,
    importer,
    source_type: sourceType,
    source_fingerprint: rootOf(input),
    generated_at: nowFrom(options),
    complete,
    completeness: complete ? 'explicit_complete' : 'partial_or_unknown',
    completeness_evidence: evidence,
    recognized_candidate_count: memoryCandidates.length,
    unsupported_item_count: evidence.unsupported_count,
    private_plaintext_boundary: {
      contains_private_plaintext: memoryCandidates.length > 0,
      private_fields: ['memory_candidates.content'],
      public_artifact_policy: 'hashes_and_commitments_only'
    },
    source_refs: uniqueSourceRefs(memoryCandidates.flatMap((candidate) => candidate.source_refs)),
    limitations,
    confidence: aggregateConfidence(memoryCandidates),
    memory_candidates: memoryCandidates,
    vault_writes
  };
}

function uniqueSourceRefs(refs) {
  const seen = new Set();
  const out = [];
  for (const ref of refs) {
    const key = stable(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}

function publicKeyForVault(vault) {
  const publicKey = vault?.signingKeyPair?.publicKey ?? vault?.publicKey ?? vault?.signer?.public_key;
  if (typeof publicKey === 'string') return publicKey;
  if (publicKey && typeof publicKey.export === 'function') {
    const exported = publicKey.export({ type: 'spki', format: 'pem' });
    return Buffer.isBuffer(exported) ? exported.toString('utf8') : String(exported);
  }
  return undefined;
}

function writeCandidatesToVault(candidates, options) {
  const vault = options?.vault;
  if (!vault) return [];
  const writes = [];
  for (const candidate of candidates) {
    const rememberArgs = {
      content: candidate.content,
      kind: candidate.kind,
      source_refs: candidate.source_refs,
      confidence: candidate.confidence,
      limitations: candidate.limitations,
      metadata: {
        candidate_id: candidate.candidate_id,
        importer: candidate.metadata.importer,
        limitations_hash: rootOf(candidate.limitations)
      },
      now: options.now
    };
    const result = typeof vault.remember === 'function'
      ? vault.remember(rememberArgs)
      : remember({ vault, ...rememberArgs });
    const receipt = isRecord(result.receipt) ? result.receipt : undefined;
    const receiptPublicKey = publicKeyForVault(vault);
    writes.push({
      candidate_id: candidate.candidate_id,
      memory_addr: result.memory_addr,
      receipt_hash: rootOf(result.receipt),
      ...(typeof result.event?.event_id === 'string' ? { event_id: result.event.event_id } : {}),
      ...(typeof receiptPublicKey === 'string' ? { receipt_public_key: receiptPublicKey } : {}),
      ...(receipt ? { receipt } : {})
    });
  }
  return writes;
}

function pathsFromMapping(mapping) {
  if (!isRecord(mapping)) return [];
  const paths = [];
  for (const [key, node] of Object.entries(mapping)) {
    const message = node?.message;
    const role = message?.author?.role ?? message?.role;
    const content = stringValue(message?.content ?? message);
    if (content) paths.push({ key, role, message, content });
  }
  return paths;
}

export function importChatGptExport(input, options = {}) {
  const parsed = parseMaybeJson(input);
  const sourceType = 'chatgpt_export';
  const limitations = collectLimitations(parsed, [
    'ChatGPT exports may omit deleted chats, disabled memory, workspace policy state, and server-side personalization not present in the file',
    'conversation-derived candidates are inferred from transcript text and are not equivalent to provider-native memory assertions'
  ]);
  const candidates = [];
  const memoryItems = [...asArray(parsed?.memories), ...asArray(parsed?.memory?.items), ...asArray(parsed?.user_memory), ...asArray(parsed?.memory)];
  memoryItems.forEach((item, index) => {
    const content = firstString(item, ['memory', 'content', 'text', 'value', 'summary']) || stringValue(item);
    addCandidate(candidates, {
      importer: 'importChatGptExport',
      sourceType,
      content,
      source_refs: [sourceRef(sourceType, `memories/${index}`, item?.id ?? item?.memory_id, item)],
      limitations,
      confidence: item?.confidence ?? 'medium',
      kind: item?.kind ?? 'preference',
      metadata: item
    });
  });
  for (const [conversationIndex, conversation] of asArray(parsed?.conversations).entries()) {
    const messages = Array.isArray(conversation?.messages)
      ? conversation.messages.map((message, messageIndex) => ({ key: messageIndex, message, role: message.role ?? message.author?.role, content: stringValue(message.content ?? message) }))
      : pathsFromMapping(conversation?.mapping);
    for (const message of messages) {
      if (message.role && message.role !== 'user') continue;
      addCandidate(candidates, {
        importer: 'importChatGptExport',
        sourceType,
        content: message.content,
        source_refs: [sourceRef(sourceType, `conversations/${conversationIndex}/messages/${message.key}`, conversation?.id, message.message)],
        limitations,
        confidence: 'low',
        kind: 'conversation_observation',
        metadata: { conversation_id: conversation?.id, role: message.role ?? 'unknown' }
      });
    }
  }
  if (typeof parsed === 'string') {
    textLines(parsed).forEach((line, index) => addCandidate(candidates, {
      importer: 'importChatGptExport',
      sourceType,
      content: line,
      source_refs: [sourceRef(sourceType, `text/${index}`, undefined, line)],
      limitations,
      confidence: 'low',
      kind: 'text_line',
      metadata: { text_import: true }
    }));
  }
  return reportFrom('importChatGptExport', sourceType, parsed, candidates, limitations, options);
}

export function importClaudeMemory(input, options = {}) {
  const parsed = parseMaybeJson(input);
  const sourceType = 'claude_memory';
  const limitations = collectLimitations(parsed, [
    'Claude memory exports may be workspace-scoped and can omit deleted, expired, or policy-hidden memories',
    'project instructions and conversation context are not proof of durable memory unless exported as explicit memory records'
  ]);
  const candidates = [];
  const items = [
    ...asArray(parsed?.memories),
    ...asArray(parsed?.memory),
    ...asArray(parsed?.preferences),
    ...asArray(parsed?.facts),
    ...asArray(parsed?.entries)
  ];
  items.forEach((item, index) => addCandidate(candidates, {
    importer: 'importClaudeMemory',
    sourceType,
    content: firstString(item, ['memory', 'content', 'text', 'value', 'fact', 'preference']) || stringValue(item),
    source_refs: [sourceRef(sourceType, `entries/${index}`, item?.id ?? item?.uuid, item)],
    limitations,
    confidence: item?.confidence ?? 'medium',
    kind: item?.kind ?? 'preference',
    metadata: item
  }));
  if (typeof parsed === 'string') {
    textLines(parsed).forEach((line, index) => addCandidate(candidates, {
      importer: 'importClaudeMemory',
      sourceType,
      content: line,
      source_refs: [sourceRef(sourceType, `text/${index}`, undefined, line)],
      limitations,
      confidence: 'low',
      kind: 'text_line',
      metadata: { text_import: true }
    }));
  }
  return reportFrom('importClaudeMemory', sourceType, parsed, candidates, limitations, options);
}

export function importMem0Export(input, options = {}) {
  const parsed = parseMaybeJson(input);
  const sourceType = 'mem0_export';
  const limitations = collectLimitations(parsed, [
    'Mem0 exports preserve exported records only; scoring, deduplication, deletion history, and application-specific filters may not be complete',
    'Mem0 provider-native memory remains a cache and is not canonical custody after import'
  ]);
  const candidates = [];
  const items = [...asArray(parsed?.memories), ...asArray(parsed?.results), ...asArray(parsed?.items), ...asArray(parsed)];
  items.forEach((item, index) => addCandidate(candidates, {
    importer: 'importMem0Export',
    sourceType,
    content: firstString(item, ['memory', 'content', 'text', 'value']) || stringValue(item),
    source_refs: [sourceRef(sourceType, `memories/${index}`, item?.id ?? item?.memory_id, item)],
    limitations,
    confidence: item?.confidence ?? (item?.score === undefined ? 'medium' : scoreConfidence(item.score)),
    kind: item?.kind ?? 'fact',
    metadata: { ...normalizeMetadata(item), user_id: item?.user_id, agent_id: item?.agent_id }
  }));
  return reportFrom('importMem0Export', sourceType, parsed, candidates, limitations, options);
}

function scoreConfidence(score) {
  if (typeof score !== 'number') return 'medium';
  if (score >= 0.8) return 'high';
  if (score >= 0.45) return 'medium';
  return 'low';
}

export function importLettaAgentFile(input, options = {}) {
  const parsed = parseMaybeJson(input);
  const sourceType = 'letta_agent_file';
  const limitations = collectLimitations(parsed, [
    'Letta agent files describe one exported agent state and may not include full external tool state, deleted archival rows, or recall history outside the file',
    'agent memory blocks can be prompts or instructions; they are imported as candidates rather than confirmed personal facts'
  ]);
  const candidates = [];
  const blocks = [
    ...asArray(parsed?.memory?.blocks),
    ...asArray(parsed?.memory_blocks),
    ...asArray(parsed?.core_memory),
    ...asArray(parsed?.agent_state?.memory?.blocks)
  ];
  blocks.forEach((block, index) => addCandidate(candidates, {
    importer: 'importLettaAgentFile',
    sourceType,
    content: firstString(block, ['value', 'content', 'text', 'memory']) || stringValue(block),
    source_refs: [sourceRef(sourceType, `memory_blocks/${index}`, block?.id ?? block?.label, block)],
    limitations,
    confidence: 'medium',
    kind: block?.label ?? block?.name ?? 'agent_memory_block',
    metadata: { label: block?.label ?? block?.name, agent_id: parsed?.id ?? parsed?.agent_id }
  }));
  const archival = [...asArray(parsed?.archival_memory), ...asArray(parsed?.archivalMemory), ...asArray(parsed?.agent_state?.archival_memory)];
  archival.forEach((entry, index) => addCandidate(candidates, {
    importer: 'importLettaAgentFile',
    sourceType,
    content: firstString(entry, ['text', 'content', 'memory', 'value']) || stringValue(entry),
    source_refs: [sourceRef(sourceType, `archival_memory/${index}`, entry?.id, entry)],
    limitations,
    confidence: 'medium',
    kind: 'archival_memory',
    metadata: { agent_id: parsed?.id ?? parsed?.agent_id }
  }));
  return reportFrom('importLettaAgentFile', sourceType, parsed, candidates, limitations, options);
}

export function importLangGraphStore(input, options = {}) {
  const parsed = parseMaybeJson(input);
  const sourceType = 'langgraph_store';
  const limitations = collectLimitations(parsed, [
    'LangGraph store exports reflect selected namespaces only; TTL, tombstones, checkpointer state, and application-level filters may be absent',
    'stored values are schema-flexible, so non-memory application state is imported only as low-confidence candidates when it contains text'
  ]);
  const candidates = [];
  const items = [...asArray(parsed?.items), ...asArray(parsed?.store), ...asArray(parsed?.records), ...asArray(parsed)];
  items.forEach((item, index) => {
    const value = item?.value ?? item?.document ?? item;
    addCandidate(candidates, {
      importer: 'importLangGraphStore',
      sourceType,
      content: firstString(value, ['memory', 'content', 'text', 'summary', 'value']) || stringValue(value),
      source_refs: [sourceRef(sourceType, `items/${index}`, item?.key ?? item?.id, item)],
      limitations,
      confidence: item?.confidence ?? 'low',
      kind: item?.kind ?? 'store_value',
      metadata: { namespace: Array.isArray(item?.namespace) ? item.namespace.join('/') : item?.namespace, key: item?.key }
    });
  });
  return reportFrom('importLangGraphStore', sourceType, parsed, candidates, limitations, options);
}

export function importZepGraphitiExport(input, options = {}) {
  const parsed = parseMaybeJson(input);
  const sourceType = 'zep_graphiti_export';
  const limitations = collectLimitations(parsed, [
    'Zep Graphiti exports are graph projections; extracted facts may omit original conversation turns, temporal invalidations, and edge provenance not included in the export',
    'graph entities and edges are imported as candidates, not as proof that the source conversation remains complete'
  ]);
  const candidates = [];
  const nodes = [...asArray(parsed?.nodes), ...asArray(parsed?.entities), ...asArray(parsed?.episodes)];
  nodes.forEach((node, index) => addCandidate(candidates, {
    importer: 'importZepGraphitiExport',
    sourceType,
    content: firstString(node, ['fact', 'summary', 'description', 'content', 'text', 'name']) || stringValue(node),
    source_refs: [sourceRef(sourceType, `nodes/${index}`, node?.uuid ?? node?.id ?? node?.name, node)],
    limitations,
    confidence: node?.confidence ?? scoreConfidence(node?.score),
    kind: node?.type ?? 'graph_node',
    metadata: { uuid: node?.uuid, group_id: node?.group_id, valid_at: node?.valid_at }
  }));
  const edges = [...asArray(parsed?.edges), ...asArray(parsed?.relations), ...asArray(parsed?.facts)];
  edges.forEach((edge, index) => addCandidate(candidates, {
    importer: 'importZepGraphitiExport',
    sourceType,
    content: firstString(edge, ['fact', 'summary', 'description', 'content', 'text', 'name']) || graphEdgeText(edge),
    source_refs: [sourceRef(sourceType, `edges/${index}`, edge?.uuid ?? edge?.id, edge)],
    limitations,
    confidence: edge?.confidence ?? scoreConfidence(edge?.score),
    kind: edge?.type ?? 'graph_edge',
    metadata: { uuid: edge?.uuid, source: edge?.source, target: edge?.target }
  }));
  return reportFrom('importZepGraphitiExport', sourceType, parsed, candidates, limitations, options);
}

function graphEdgeText(edge) {
  if (!isRecord(edge)) return '';
  const source = stringValue(edge.source ?? edge.source_node ?? edge.from);
  const relation = stringValue(edge.relation ?? edge.name ?? edge.predicate);
  const target = stringValue(edge.target ?? edge.target_node ?? edge.to);
  return [source, relation, target].filter(Boolean).join(' ');
}

function uniqueCandidates(candidates) {
  const seen = new Set();
  const out = [];
  for (const candidate of candidates.filter(isRecord)) {
    const key = candidate.candidate_id ?? rootOf(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}

function collectPayloadCandidates(payload, reports) {
  return uniqueCandidates([
    ...asArray(payload?.memory_candidates).filter(isRecord),
    ...reports.flatMap((report) => asArray(report.memory_candidates).filter(isRecord))
  ]);
}

function candidateReportVaultWrites(memoryCandidates, reports) {
  const candidateIds = new Set(memoryCandidates.map((candidate) => candidate.candidate_id).filter(Boolean));
  return reports
    .flatMap((report) => asArray(report.vault_writes).filter(isRecord))
    .filter((write) => (
      candidateIds.has(write.candidate_id)
      && typeof write.memory_addr === 'string'
      && typeof write.receipt_hash === 'string'
    ));
}

function canonicalVaultWriteReceipt(write) {
  const receipt = write.receipt;
  if (!isRecord(receipt)
    || receipt.schema !== 'enigma.receipt.v1'
    || receipt.operation !== 'create'
    || receipt.memory_addr !== write.memory_addr
    || typeof receipt.receipt_id !== 'string'
    || typeof receipt.event_hash !== 'string'
    || typeof receipt.active_set_root !== 'string'
    || typeof receipt.receipt_log_root !== 'string'
    || typeof receipt.previous_receipt_hash !== 'string'
    || typeof receipt.timestamp !== 'string'
    || !Number.isInteger(receipt.sequence)
    || !isRecord(receipt.signer)
    || receipt.signer.alg !== 'Ed25519'
    || typeof receipt.signer.key_id !== 'string'
    || !isRecord(receipt.signature)
    || receipt.signature.alg !== 'Ed25519'
    || typeof receipt.signature.value !== 'string'
    || typeof write.receipt_public_key !== 'string'
    || rootOf(receipt) !== write.receipt_hash) {
    return false;
  }
  return verifyReceipt({
    receipt,
    publicKey: write.receipt_public_key,
    expectedSignerKeyId: receipt.signer.key_id
  }).ok;
}

function collectReportVaultWrites(reports) {
  const seen = new Set();
  const out = [];
  for (const write of reports.flatMap((report) => asArray(report.vault_writes).filter(isRecord))) {
    if (typeof write.candidate_id !== 'string' || typeof write.memory_addr !== 'string' || typeof write.receipt_hash !== 'string') continue;
    if (!canonicalVaultWriteReceipt(write)) continue;
    const key = `${write.candidate_id}\0${write.memory_addr}\0${write.receipt_hash}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      candidate_id: write.candidate_id,
      memory_addr: write.memory_addr,
      receipt_hash: write.receipt_hash,
      ...(typeof write.event_id === 'string' ? { event_id: write.event_id } : {})
    });
  }
  return out;
}

function mappedVaultWrites(memoryCandidates, reports) {
  const candidateIds = new Set(memoryCandidates.map((candidate) => candidate.candidate_id).filter(Boolean));
  return collectReportVaultWrites(reports).filter((write) => candidateIds.has(write.candidate_id));
}

function vaultWriteCounts(memoryCandidates, vaultWrites) {
  const candidateIds = new Set(memoryCandidates.map((candidate) => candidate.candidate_id).filter(Boolean));
  const canonicalIds = new Set();
  for (const write of vaultWrites) {
    if (candidateIds.has(write.candidate_id)) canonicalIds.add(write.candidate_id);
  }
  return {
    canonical_candidate_count: canonicalIds.size,
    candidate_only_count: Math.max(0, candidateIds.size - canonicalIds.size),
    vault_write_count: vaultWrites.length
  };
}

function custodyStatus(counts) {
  if (counts.candidate_only_count > 0) return 'candidate_only_noncanonical';
  if (counts.canonical_candidate_count > 0) return 'vault_write_backed';
  return 'empty';
}

function collectCustodyLimitationCodes(memoryCandidates, reports, vaultWrites) {
  const codes = [];
  const counts = vaultWriteCounts(memoryCandidates, vaultWrites);
  if (counts.candidate_only_count > 0) codes.push('candidate_only_without_vault_write');
  for (const write of candidateReportVaultWrites(memoryCandidates, reports)) {
    if (!isRecord(write.receipt)) {
      codes.push('vault_write_receipt_missing');
    } else if (!canonicalVaultWriteReceipt(write)) {
      codes.push('vault_write_receipt_unverified');
    }
  }
  return uniqueStrings(codes);
}

function custodyLimitationTexts(codes) {
  const texts = [];
  if (codes.includes('candidate_only_without_vault_write')) {
    texts.push('candidate-only memories are noncanonical until written to a vault; active_set_root commits only vault memory_addr values');
  }
  if (codes.includes('vault_write_receipt_missing')) {
    texts.push('vault_writes without embedded receipt objects are unverified; canonical roots ignore receipt_hash-only claims');
  }
  if (codes.includes('vault_write_receipt_unverified')) {
    texts.push('vault_writes with mismatched receipt evidence are unverified; canonical roots ignore unproven custody claims');
  }
  return texts;
}

function sourceRefRoot(memoryCandidates) {
  return new MerkleSet(memoryCandidates.flatMap((candidate) => candidate.source_refs ?? []).map((ref) => rootOf(ref))).root();
}

function sourceLimitationsRoot(reports, memoryCandidates, extraLimitations = []) {
  return rootOf(uniqueStrings([
    ...asArray(extraLimitations),
    ...reports.flatMap((report) => asArray(report.limitations)),
    ...memoryCandidates.flatMap((candidate) => asArray(candidate.limitations))
  ]));
}

function completenessSummary(reports) {
  return reports.length > 0 && reports.every((report) => report.complete === true && report.completeness === 'explicit_complete')
    ? 'explicit_complete'
    : 'partial_or_unknown';
}

function reportCompletenessConflicts(reports) {
  const errors = [];
  reports.forEach((report, index) => {
    if (report.complete === true && report.completeness !== 'explicit_complete') errors.push(`report ${index} completeness flags conflict`);
    if (report.complete === false && report.completeness === 'explicit_complete') errors.push(`report ${index} completeness flags conflict`);
    if (report.completeness_evidence?.conflicting === true) errors.push(`report ${index} completeness evidence conflicts`);
  });
  return errors;
}

function sameStringArray(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => value === b[index]);
}

function trustAnchorFromOptions(manifest, options = {}) {
  const directDescriptor = options.trustDescriptor ?? options.trustedDescriptor ?? options.issuerDescriptor ?? options.descriptor;
  if (directDescriptor !== undefined) return { source: 'descriptor', trustDescriptor: directDescriptor, errors: [] };
  if (options.publicKey !== undefined) return { source: 'publicKey', publicKey: options.publicKey, errors: [] };
  const bundle = options.trustBundle ?? options.trustedBundle;
  if (isRecord(bundle)) {
    if (Array.isArray(bundle.accepted_algorithms) && !bundle.accepted_algorithms.includes('Ed25519')) {
      return { source: 'none', errors: ['trusted bundle does not accept Ed25519 capsule manifests'] };
    }
    const keyId = manifest?.signature?.key_id;
    const issuer = asArray(bundle.trusted_issuers).find((entry) => (
      isRecord(entry)
      && entry.issuer_id === manifest?.issuer
      && entry.key_id === keyId
      && typeof entry.public_key === 'string'
    ));
    if (issuer) {
      return {
        source: 'bundle',
        trustDescriptor: {
          node_id: issuer.issuer_id,
          key: { alg: 'Ed25519', key_id: issuer.key_id, public_key: issuer.public_key },
          public_key: issuer.public_key
        },
        bundleIssuer: issuer,
        errors: []
      };
    }
    return { source: 'none', errors: ['trusted bundle does not contain the capsule issuer key'] };
  }
  return { source: 'none', errors: ['trusted descriptor or trust bundle is required'] };
}

function trustAnchorMetadataErrors(anchor, embedded, manifest) {
  if (!isRecord(embedded)) return [];
  if (anchor.source === 'descriptor') {
    return rootOf(anchor.trustDescriptor) === rootOf(embedded) ? [] : ['verifier metadata trust descriptor does not match trusted descriptor'];
  }
  if (anchor.source === 'bundle') {
    const embeddedKey = embedded.key ?? {};
    return embedded.node_id === manifest?.issuer
      && embeddedKey.key_id === anchor.bundleIssuer?.key_id
      && embeddedKey.public_key === anchor.bundleIssuer?.public_key
      ? []
      : ['verifier metadata trust descriptor does not match trusted bundle'];
  }
  if (anchor.source === 'publicKey') {
    return embedded.key?.public_key === anchor.publicKey ? [] : ['verifier metadata trust descriptor does not match trusted public key'];
  }
  return [];
}

function capsuleVerificationErrors({ capsule, manifest, verifierMetadata, payload, reports, memoryCandidates, vaultWrites, active_set_root, receipt_log_root, payload_hash }) {
  const errors = [];
  if (!isRecord(payload)) errors.push('capsule payload must be an object');
  if (!isRecord(verifierMetadata)) errors.push('verifier metadata must be an object');
  if (payload_hash === undefined) return errors;
  if (capsule.payload_hash !== undefined && capsule.payload_hash !== payload_hash) errors.push('capsule payload hash mismatch');
  if (verifierMetadata.payload_hash !== payload_hash) errors.push('verifier metadata payload hash mismatch');
  if (manifest?.encrypted_payload_hash !== payload_hash) errors.push('manifest payload commitment mismatch');
  if (verifierMetadata.candidate_count !== memoryCandidates.length) errors.push('candidate count mismatch');
  if (!sameStringArray(verifierMetadata.import_report_hashes, reports.map((report) => rootOf(report)))) errors.push('import report hashes mismatch');
  if (verifierMetadata.source_ref_root !== sourceRefRoot(memoryCandidates)) errors.push('source ref root mismatch');
  const counts = vaultWriteCounts(memoryCandidates, vaultWrites);
  const custodyLimitationCodes = collectCustodyLimitationCodes(memoryCandidates, reports, vaultWrites);
  const custodyLimitations = custodyLimitationTexts(custodyLimitationCodes);
  if (verifierMetadata.limitations_root !== sourceLimitationsRoot(reports, memoryCandidates, custodyLimitations)) errors.push('limitations root mismatch');
  if (verifierMetadata.active_set_root !== active_set_root) errors.push('active set root mismatch');
  if (verifierMetadata.receipt_log_root !== receipt_log_root) errors.push('receipt log root mismatch');
  if (verifierMetadata.canonical_candidate_count !== undefined && verifierMetadata.canonical_candidate_count !== counts.canonical_candidate_count) errors.push('canonical candidate count mismatch');
  if (verifierMetadata.candidate_only_count !== undefined && verifierMetadata.candidate_only_count !== counts.candidate_only_count) errors.push('candidate-only count mismatch');
  const status = custodyStatus(counts);
  if (verifierMetadata.custody_status !== status) errors.push('custody status mismatch');
  if (!sameStringArray(verifierMetadata.custody_limitation_codes, custodyLimitationCodes)) errors.push('custody limitation codes mismatch');
  const completeness = completenessSummary(reports);
  if (verifierMetadata.completeness !== completeness) errors.push('completeness summary mismatch');
  errors.push(...reportCompletenessConflicts(reports));
  return errors;
}

export function exportEnigmaCapsule(args = {}) {
  const reports = asArray(args.reports ?? args.report).filter(isRecord);
  const memoryCandidates = uniqueCandidates([
    ...asArray(args.memory_candidates ?? args.memoryCandidates ?? args.candidates).filter(isRecord),
    ...reports.flatMap((report) => asArray(report.memory_candidates).filter(isRecord))
  ]);
  const exportedAt = nowFrom(args);
  const vaultWrites = mappedVaultWrites(memoryCandidates, reports);
  const active_set_root = new MerkleSet(vaultWrites.map((write) => write.memory_addr)).root();
  const receipt_log_root = new MerkleSet(vaultWrites.map((write) => write.receipt_hash)).root();
  const counts = vaultWriteCounts(memoryCandidates, vaultWrites);
  const status = custodyStatus(counts);
  const custodyLimitationCodes = collectCustodyLimitationCodes(memoryCandidates, reports, vaultWrites);
  const custodyLimitations = custodyLimitationTexts(custodyLimitationCodes);
  const payload = {
    schema: CAPSULE_PAYLOAD_SCHEMA,
    exported_at: exportedAt,
    private_plaintext_boundary: {
      contains_private_plaintext: memoryCandidates.length > 0,
      private_fields: ['memory_candidates.content', 'reports.memory_candidates.content'],
      public_artifact_policy: 'manifest_and_verifier_metadata_only'
    },
    reports,
    memory_candidates: memoryCandidates
  };
  const payload_hash = rootOf(payload);
  const node = args.node ?? createMeshNode({ created_at: exportedAt });
  const holder = args.holder ?? args.holder_id ?? args.holderId ?? 'holder:importer';
  const limitations_root = sourceLimitationsRoot(reports, memoryCandidates, custodyLimitations);
  const manifest = createCapsuleManifest({
    node,
    issuer: args.issuer ?? node.node_id,
    holder,
    encrypted_payload_hash: payload_hash,
    receipt_log_root,
    active_set_root,
    owner_scope_hash: rootOf({ holder, importer_reports: reports.map((report) => report.report_id), candidates: memoryCandidates.map((candidate) => candidate.candidate_id) }),
    issued_at: exportedAt,
    expires_at: args.expires_at ?? args.expiresAt ?? DEFAULT_EXPIRY
  });
  const verifier_metadata = {
    schema: VERIFIER_METADATA_SCHEMA,
    capsule_id: manifest.capsule_id,
    payload_schema: CAPSULE_PAYLOAD_SCHEMA,
    payload_hash,
    import_report_hashes: reports.map((report) => rootOf(report)),
    candidate_count: memoryCandidates.length,
    source_ref_root: sourceRefRoot(memoryCandidates),
    limitations_root,
    completeness: completenessSummary(reports),
    custody_status: status,
    custody_limitation_codes: custodyLimitationCodes,
    canonical_candidate_count: counts.canonical_candidate_count,
    candidate_only_count: counts.candidate_only_count,
    vault_write_count: counts.vault_write_count,
    vault_writes: vaultWrites,
    private_plaintext_boundary: {
      payload_contains_private_plaintext: memoryCandidates.length > 0,
      public_artifacts_contain_plaintext: false,
      public_artifact_policy: 'hashes_roots_counts_and_trusted_descriptor_only'
    },
    active_set_root,
    receipt_log_root,
    trust_descriptor: node.trust_descriptor
  };
  return {
    schema: CAPSULE_SCHEMA,
    capsule_id: manifest.capsule_id,
    exported_at: exportedAt,
    manifest,
    verifier_metadata,
    payload_hash,
    payload,
    public_artifacts: { manifest, verifier_metadata }
  };
}

export function importEnigmaCapsule(capsule, options = {}) {
  if (!isRecord(capsule)) throw new TypeError('capsule must be an object');
  const manifest = capsule.manifest;
  const verifierMetadata = capsule.verifier_metadata ?? capsule.verifierMetadata ?? {};
  const payload = capsule.payload;
  const reports = asArray(payload?.reports).filter(isRecord);
  const memoryCandidates = collectPayloadCandidates(payload, reports);
  const vaultWritesFromReports = mappedVaultWrites(memoryCandidates, reports);
  const payload_hash = isRecord(payload) ? rootOf(payload) : undefined;
  const active_set_root = new MerkleSet(vaultWritesFromReports.map((write) => write.memory_addr)).root();
  const receipt_log_root = new MerkleSet(vaultWritesFromReports.map((write) => write.receipt_hash)).root();
  const trustAnchor = trustAnchorFromOptions(manifest, options);
  const verification = verifyCapsuleManifest(manifest, {
    trustDescriptor: trustAnchor.trustDescriptor,
    publicKey: trustAnchor.publicKey,
    expectedReceiptLogRoot: receipt_log_root,
    expectedActiveSetRoot: active_set_root,
    now: options.now ?? DEFAULT_NOW
  });
  const metadataErrors = [
    ...trustAnchor.errors,
    ...trustAnchorMetadataErrors(trustAnchor, verifierMetadata.trust_descriptor, manifest),
    ...capsuleVerificationErrors({
      capsule,
      manifest,
      verifierMetadata,
      payload,
      reports,
      memoryCandidates,
      vaultWrites: vaultWritesFromReports,
      active_set_root,
      receipt_log_root,
      payload_hash
    })
  ];
  const ok = verification.ok && metadataErrors.length === 0;
  const vault_writes = ok ? writeCandidatesToVault(memoryCandidates, options) : [];
  const limitations = uniqueStrings([
    ...metadataErrors,
    ...verification.errors,
    ...reports.flatMap((report) => asArray(report.limitations)),
    ...memoryCandidates.flatMap((candidate) => asArray(candidate.limitations))
  ]);
  const completeness = completenessSummary(reports);
  return {
    schema: 'enigma.import_capsule_result.v1',
    ok,
    capsule_id: manifest?.capsule_id ?? capsule.capsule_id,
    manifest_ok: verification.ok,
    payload_hash_ok: payload_hash !== undefined && verifierMetadata.payload_hash === payload_hash && (capsule.payload_hash === undefined || capsule.payload_hash === payload_hash),
    manifest_payload_hash_ok: payload_hash !== undefined && manifest?.encrypted_payload_hash === payload_hash,
    verifier_metadata_ok: metadataErrors.length === 0,
    verification: { ...verification, metadata_errors: metadataErrors },
    complete: completeness === 'explicit_complete',
    completeness,
    limitations,
    memory_candidates: memoryCandidates,
    vault_writes
  };
}

export function runImporterDemo(options = {}) {
  const shared = { ...options, now: options.now ?? DEFAULT_NOW };
  const chatgpt = importChatGptExport({
    export_complete: false,
    limitations: ['demo ChatGPT source omits deleted chats'],
    memories: [{ id: 'gpt-memory-1', memory: 'Prefers concise answers for release notes.', confidence: 'high' }]
  }, shared);
  const claude = importClaudeMemory({
    is_complete: false,
    limitations: ['demo Claude source is project scoped'],
    memories: [{ id: 'claude-memory-1', text: 'Uses formal tone for board updates.' }]
  }, shared);
  const mem0 = importMem0Export({
    complete: false,
    limitations: ['demo Mem0 source is filtered to one user'],
    memories: [{ id: 'mem0-1', memory: 'Likes architecture diagrams before implementation.', score: 0.84 }]
  }, shared);
  const letta = importLettaAgentFile({
    export_complete: false,
    limitations: ['demo Letta file excludes tool execution history'],
    agent_id: 'agent-demo',
    memory: { blocks: [{ label: 'human', value: 'User wants security caveats called out explicitly.' }] }
  }, shared);
  const langgraph = importLangGraphStore({
    is_complete: false,
    limitations: ['demo LangGraph export includes only the memory namespace'],
    items: [{ namespace: ['memories'], key: 'one', value: { text: 'Escalate uncertain claims with evidence.' } }]
  }, shared);
  const graphiti = importZepGraphitiExport({
    complete: false,
    limitations: ['demo Graphiti graph omits source episodes'],
    edges: [{ uuid: 'edge-1', source: 'user', relation: 'prefers', target: 'offline verification', score: 0.7 }]
  }, shared);
  const reports = { chatgpt, claude, mem0, letta, langgraph, graphiti };
  const capsule = exportEnigmaCapsule({ reports: Object.values(reports), now: shared.now });
  const capsuleImport = importEnigmaCapsule(capsule, { now: shared.now, trustDescriptor: capsule.verifier_metadata.trust_descriptor });
  const importer_ok = Object.values(reports).every((report) => report.memory_candidates.length > 0 && report.limitations.length > 0 && report.complete === false);
  const preserved_limitations = Object.values(reports).every((report) => report.memory_candidates.every((candidate) => candidate.limitations.length >= report.limitations.length));
  return {
    ok: importer_ok && preserved_limitations && capsuleImport.ok,
    importers: Object.fromEntries(Object.entries(reports).map(([name, report]) => [name, {
      ok: report.memory_candidates.length > 0,
      complete: report.complete,
      limitations: report.limitations,
      candidate_count: report.memory_candidates.length
    }])),
    capsule: {
      export_ok: capsule.manifest?.schema === 'enigma.capsule_manifest.v1' && capsule.payload_hash === capsule.verifier_metadata.payload_hash,
      import_ok: capsuleImport.ok,
      capsule_id: capsule.capsule_id
    }
  };
}

export default {
  importChatGptExport,
  importClaudeMemory,
  importMem0Export,
  importLettaAgentFile,
  importLangGraphStore,
  importZepGraphitiExport,
  createImmuneIngressReport,
  quarantineImmuneIngressCandidates,
  assertImmuneIngressPublicSafe,
  exportEnigmaCapsule,
  importEnigmaCapsule,
  runImporterDemo
};
