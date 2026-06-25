#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { StringDecoder } from 'node:string_decoder';
import { estimateTextTokens } from '../packages/optimizer/src/index.js';

export const STANDARD_MEMORY_BENCHMARK_SUITE_SCHEMA = 'enigma.standard_memory_benchmark_suite.v1';

export const STANDARD_MEMORY_BENCHMARK_METHODS = Object.freeze([
  Object.freeze({
    id: 'full_context',
    label: 'Full context',
    boundary: 'Supplies every parsed memory record for each query; no provider API or model answer generation.',
    uses_top_k: false,
  }),
  Object.freeze({
    id: 'recency_last_n',
    label: 'Recency last N',
    boundary: 'Supplies the most recent local memory records up to --top-k.',
    uses_top_k: true,
  }),
  Object.freeze({
    id: 'keyword_filter',
    label: 'Keyword filter',
    boundary: 'Supplies local memory records whose public-safe deterministic tokens overlap the query, capped by --top-k.',
    uses_top_k: true,
  }),
  Object.freeze({
    id: 'enigma_relevance',
    label: 'Enigma relevance',
    boundary: 'Uses deterministic query-aware relevance features over local public-safe memory metadata and content tokens, then ranks locally without provider APIs.',
    uses_top_k: true,
  }),
]);

const LOCOMO_SOURCE_URL = 'https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json';
const LONGMEMEVAL_SOURCE_URLS = Object.freeze([
  'https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_oracle.json',
  'https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_s_cleaned.json',
  'https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_m_cleaned.json',
]);

const QUERY_RELEVANCE_STOPWORDS = new Set([
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

function parseArgs(argv = process.argv.slice(2)) {
  const options = { top_k: 5 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--locomo') {
      options.locomo = requiredFlagValue(argv, index, arg);
      index += 1;
    } else if (arg === '--longmemeval') {
      options.longmemeval = requiredFlagValue(argv, index, arg);
      index += 1;
    } else if (arg === '--max-locomo-qa') {
      options.max_locomo_qa = positiveInteger(requiredFlagValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === '--max-longmemeval-items') {
      options.max_longmemeval_items = positiveInteger(requiredFlagValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === '--top-k') {
      options.top_k = positiveInteger(requiredFlagValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === '--out') {
      options.out = requiredFlagValue(argv, index, arg);
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown option ${arg}`);
    }
  }
  return options;
}

function requiredFlagValue(argv, index, flag) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${name} must be a positive integer`);
  return number;
}

function optionalPositiveInteger(value, name) {
  if (value === undefined || value === null) return undefined;
  return positiveInteger(value, name);
}

function publicFileName(path) {
  return path === undefined || path === null ? undefined : basename(String(path));
}

async function readJsonWithSha256(path) {
  const raw = await readFile(path, 'utf8');
  return {
    data: JSON.parse(raw),
    sha256: createHash('sha256').update(raw).digest('hex'),
  };
}

function isJsonWhitespace(char) {
  const code = char.charCodeAt(0);
  return code === 0x20 || code === 0x0a || code === 0x0d || code === 0x09 || code === 0xfeff;
}

function createTopLevelArraySampler(maxItems, name) {
  const items = [];
  let started = false;
  let closed = false;
  let collecting = false;
  let doneCollecting = false;
  let expectSeparator = false;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let current = '';

  function fail(message) {
    throw new Error(`${name} sample-mode JSON parse failed: ${message}`);
  }

  function finishItem() {
    items.push(current);
    current = '';
    collecting = false;
    expectSeparator = true;
    if (items.length >= maxItems) doneCollecting = true;
  }

  return {
    write(text) {
      for (const char of text) {
        if (!started) {
          if (isJsonWhitespace(char)) continue;
          if (char !== '[') fail('expected a top-level array');
          started = true;
          continue;
        }

        if (doneCollecting) continue;

        if (closed) {
          if (!isJsonWhitespace(char)) fail('found trailing data after the top-level array');
          continue;
        }

        if (!collecting) {
          if (isJsonWhitespace(char)) continue;
          if (expectSeparator) {
            if (char === ',') {
              expectSeparator = false;
              continue;
            }
            if (char === ']') {
              closed = true;
              continue;
            }
            fail('expected a comma or closing bracket between items');
          }
          if (char === ']') {
            closed = true;
            continue;
          }
          if (char !== '{' && char !== '[') fail('expected each sampled item to be an object or array');
          collecting = true;
          current = char;
          depth = 1;
          continue;
        }

        current += char;
        if (inString) {
          if (escaped) {
            escaped = false;
          } else if (char === '\\') {
            escaped = true;
          } else if (char === '"') {
            inString = false;
          }
          continue;
        }
        if (char === '"') {
          inString = true;
        } else if (char === '{' || char === '[') {
          depth += 1;
        } else if (char === '}' || char === ']') {
          depth -= 1;
          if (depth < 0) fail('encountered an unmatched closing bracket');
          if (depth === 0) finishItem();
        }
      }
    },
    get done() {
      return doneCollecting;
    },
    finish() {
      if (!started) fail('empty input');
      if (!doneCollecting && collecting) fail('ended inside a sampled item');
      if (!doneCollecting && inString) fail('ended inside a string');
      if (!doneCollecting && !closed) fail('ended before the top-level array closed');
      return JSON.parse(`[${items.join(',')}]`);
    },
  };
}

async function readJsonArraySampleWithSha256(path, maxItems, name) {
  const hash = createHash('sha256');
  const decoder = new StringDecoder('utf8');
  const sampler = createTopLevelArraySampler(maxItems, name);
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
    if (!sampler.done) sampler.write(decoder.write(chunk));
  }
  if (!sampler.done) {
    const tail = decoder.end();
    if (tail.length > 0) sampler.write(tail);
  }
  return {
    data: sampler.finish(),
    sha256: hash.digest('hex'),
  };
}

async function readLongMemEvalJsonWithSha256(path, maxItems) {
  if (maxItems === undefined) return readJsonWithSha256(path);
  try {
    return await readJsonArraySampleWithSha256(path, maxItems, 'LongMemEval');
  } catch (error) {
    if (error instanceof Error && error.message === 'LongMemEval sample-mode JSON parse failed: expected a top-level array') {
      return readJsonWithSha256(path);
    }
    throw error;
  }
}

function normalizeDatasetArray(data, name) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    for (const key of ['data', 'items', 'examples', 'samples']) {
      if (Array.isArray(data[key])) return data[key];
    }
  }
  throw new TypeError(`${name} dataset must be a JSON array or object containing an array`);
}

function addMeaningfulToken(tokens, token) {
  if (token.length < 3) return;
  if (!/[a-z]/u.test(token)) return;
  if (QUERY_RELEVANCE_STOPWORDS.has(token)) return;
  tokens.add(token);
}

function stemToken(token) {
  if (token.length > 5 && token.endsWith('ing')) {
    let stem = token.slice(0, -3);
    if (stem.length > 3 && stem.at(-1) === stem.at(-2)) stem = stem.slice(0, -1);
    return stem;
  }
  if (token.length > 4 && token.endsWith('ed')) {
    let stem = token.slice(0, -2);
    if (stem.length > 3 && stem.at(-1) === stem.at(-2)) stem = stem.slice(0, -1);
    return stem;
  }
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && token.endsWith('es')) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

function addStemmedMeaningfulToken(tokens, token) {
  addMeaningfulToken(tokens, token);
  const stem = stemToken(token);
  addMeaningfulToken(tokens, stem);
  if (token.endsWith('ed') || token.endsWith('ing')) addMeaningfulToken(tokens, `${stem}e`);
}

function meaningfulTokensFrom(value) {
  const tokens = new Set();
  if (value === undefined || value === null) return tokens;
  for (const match of String(value).toLowerCase().matchAll(/[a-z0-9]+(?:[-_][a-z0-9]+)*/gu)) {
    const token = match[0];
    addMeaningfulToken(tokens, token);
    if (token.includes('-') || token.includes('_')) {
      for (const part of token.split(/[-_]+/u)) addMeaningfulToken(tokens, part);
    }
  }
  return tokens;
}

function stemmedMeaningfulTokensFrom(value) {
  const tokens = new Set();
  if (value === undefined || value === null) return tokens;
  for (const match of String(value).toLowerCase().matchAll(/[a-z0-9]+(?:[-_][a-z0-9]+)*/gu)) {
    const token = match[0];
    addStemmedMeaningfulToken(tokens, token);
    if (token.includes('-') || token.includes('_')) {
      for (const part of token.split(/[-_]+/u)) addStemmedMeaningfulToken(tokens, part);
    }
  }
  return tokens;
}

function stemmedTokenSequenceFrom(value) {
  const sequence = [];
  if (value === undefined || value === null) return sequence;
  for (const match of String(value).toLowerCase().matchAll(/[a-z0-9]+(?:[-_][a-z0-9]+)*/gu)) {
    const token = match[0];
    const parts = token.includes('-') || token.includes('_') ? token.split(/[-_]+/u) : [token];
    for (const part of parts) {
      const stem = stemToken(part);
      if (stem.length >= 3 && /[a-z]/u.test(stem) && !QUERY_RELEVANCE_STOPWORDS.has(stem)) sequence.push(stem);
    }
  }
  return sequence;
}

function tokenOverlapScore(queryTokens, record) {
  if (queryTokens.size === 0) return 0;
  const recordTokens = meaningfulTokensFrom(record.content);
  let score = 0;
  for (const token of queryTokens) if (recordTokens.has(token)) score += 1;
  return score;
}

function normalizedTagSessionToken(value) {
  return String(value ?? '').toLowerCase().replace(/^session[-_:]?/u, '').replace(/[^a-z0-9]+/gu, '');
}

function roleHintsFrom(value) {
  const hints = new Set();
  const text = String(value ?? '').toLowerCase();
  for (const match of text.matchAll(/\b(?:assistant|user|system|human|agent|speaker[-_\s]?[a-z0-9]+)\b/gu)) {
    const compact = match[0].replace(/\s+/gu, '_');
    hints.add(compact);
    for (const token of stemmedMeaningfulTokensFrom(compact)) hints.add(token);
  }
  return hints;
}

function sessionHintsFrom(value) {
  const hints = new Set();
  const text = String(value ?? '').toLowerCase();
  for (const match of text.matchAll(/\b(?:session|sess)\s*[-_:]?\s*([a-z0-9]+)\b/gu)) hints.add(match[1]);
  for (const match of text.matchAll(/\bd\s*[-_:]?\s*(\d+)\b/gu)) hints.add(`d${Number(match[1])}`);
  for (const match of text.matchAll(/\bsession[-_]([a-z0-9]+)\b/gu)) hints.add(match[1]);
  return hints;
}

function dateHintsFrom(value) {
  const hints = new Set();
  const text = String(value ?? '').toLowerCase();
  for (const match of text.matchAll(/\b(?:19|20)\d{2}\b/gu)) hints.add(match[0]);
  for (const match of text.matchAll(/\b\d{4}[-/]\d{1,2}(?:[-/]\d{1,2})?\b/gu)) hints.add(match[0].replace(/\D+/gu, '-'));
  for (const match of text.matchAll(/\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/gu)) hints.add(match[0].slice(0, 3));
  for (const match of text.matchAll(/\b(?:today|yesterday|tomorrow|recent|recently|latest|newest|current|previous|last|earliest|oldest)\b/gu)) hints.add(match[0]);
  return hints;
}

function recordSessionTokens(record) {
  const tokens = new Set();
  const values = [record.session_id, record.dialog_id, record.turn_id, ...(record.tags ?? [])];
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const normalized = normalizedTagSessionToken(value);
    if (normalized) tokens.add(normalized);
    for (const hint of sessionHintsFrom(value)) tokens.add(normalizedTagSessionToken(hint));
  }
  return tokens;
}

function countSetIntersection(left, right) {
  let count = 0;
  for (const value of left) if (right.has(value)) count += 1;
  return count;
}

function phraseAndProximityScore(querySequence, recordSequence) {
  if (querySequence.length < 2 || recordSequence.length < 2) return 0;
  const recordBigrams = new Set();
  const positions = new Map();
  for (let index = 0; index < recordSequence.length; index += 1) {
    const token = recordSequence[index];
    if (!positions.has(token)) positions.set(token, []);
    positions.get(token).push(index);
    if (index > 0) recordBigrams.add(`${recordSequence[index - 1]}\u0000${token}`);
  }
  let score = 0;
  for (let index = 1; index < querySequence.length; index += 1) {
    const previous = querySequence[index - 1];
    const current = querySequence[index];
    if (previous === current) continue;
    if (recordBigrams.has(`${previous}\u0000${current}`)) {
      score += 10;
      continue;
    }
    const leftPositions = positions.get(previous);
    const rightPositions = positions.get(current);
    if (!leftPositions || !rightPositions) continue;
    let near = false;
    for (const left of leftPositions) {
      for (const right of rightPositions) {
        if (Math.abs(left - right) <= 6) {
          near = true;
          break;
        }
      }
      if (near) break;
    }
    if (near) score += 4;
  }
  return score;
}

function hasRecencyIntent(hints) {
  for (const hint of hints) {
    if (hint === 'recent' || hint === 'recently' || hint === 'latest' || hint === 'newest' || hint === 'current' || hint === 'previous' || hint === 'last') return true;
  }
  return false;
}

function enigmaRelevanceScore(query, record) {
  const question = String(query.question ?? '');
  const queryTokens = stemmedMeaningfulTokensFrom(question);
  const categoryTokens = stemmedMeaningfulTokensFrom(`${query.category ?? ''} ${query.question_type ?? ''}`);
  const contentTokens = stemmedMeaningfulTokensFrom(record.content);
  const metadataTokens = stemmedMeaningfulTokensFrom(`${record.kind ?? ''} ${(record.tags ?? []).join(' ')}`);
  for (const token of stemmedMeaningfulTokensFrom(`${record.role ?? ''} ${record.session_id ?? ''} ${record.dialog_id ?? ''} ${record.turn_id ?? ''}`)) {
    metadataTokens.add(token);
  }

  const contentMatches = countSetIntersection(queryTokens, contentTokens);
  const metadataMatches = countSetIntersection(queryTokens, metadataTokens);
  const categoryMatches = countSetIntersection(categoryTokens, metadataTokens) + countSetIntersection(categoryTokens, contentTokens);
  const roleMatches = countSetIntersection(roleHintsFrom(question), roleHintsFrom(record.role));
  const querySessionHints = sessionHintsFrom(question);
  const recordSessions = recordSessionTokens(record);
  const sessionMatches = countSetIntersection(querySessionHints, recordSessions);
  const queryDateHints = dateHintsFrom(question);
  const temporalMatches = countSetIntersection(queryDateHints, dateHintsFrom(`${record.content} ${(record.tags ?? []).join(' ')}`));
  const temporalRecencyScore = hasRecencyIntent(queryDateHints) ? Math.min(6, Math.log2(record.ordinal + 2)) : 0;
  const phraseScore = phraseAndProximityScore(stemmedTokenSequenceFrom(question), stemmedTokenSequenceFrom(record.content));

  return {
    record,
    score: (contentMatches * 12)
      + (metadataMatches * 4)
      + (categoryMatches * 3)
      + (roleMatches * 18)
      + (sessionMatches * 16)
      + (temporalMatches * 8)
      + temporalRecencyScore
      + phraseScore,
    contentMatches,
    metadataMatches,
    categoryMatches,
    roleMatches,
    sessionMatches,
    temporalMatches,
    temporalRecencyScore,
    phraseScore,
  };
}

function compareRecordId(left, right) {
  return String(left.id).localeCompare(String(right.id));
}

function compareRecencyDesc(left, right) {
  if (left.ordinal !== right.ordinal) return right.ordinal - left.ordinal;
  return compareRecordId(left, right);
}

function rankedByOverlap(records, query) {
  const queryTokens = meaningfulTokensFrom(query);
  if (queryTokens.size === 0) return [];
  const scored = [];
  for (const record of records) {
    const score = tokenOverlapScore(queryTokens, record);
    if (score > 0) scored.push({ record, score });
  }
  scored.sort((left, right) => {
    if (left.score !== right.score) return right.score - left.score;
    return compareRecencyDesc(left.record, right.record);
  });
  return scored.map((item) => item.record);
}

function rankedByEnigmaRelevance(records, query) {
  const scored = [];
  for (const record of records) {
    const item = enigmaRelevanceScore(query, record);
    if (item.score > 0) scored.push(item);
  }
  if (scored.length === 0) return [...records].sort(compareRecencyDesc);
  scored.sort((left, right) => {
    if (left.score !== right.score) return right.score - left.score;
    if (left.phraseScore !== right.phraseScore) return right.phraseScore - left.phraseScore;
    if (left.contentMatches !== right.contentMatches) return right.contentMatches - left.contentMatches;
    if (left.roleMatches !== right.roleMatches) return right.roleMatches - left.roleMatches;
    if (left.sessionMatches !== right.sessionMatches) return right.sessionMatches - left.sessionMatches;
    if (left.temporalMatches !== right.temporalMatches) return right.temporalMatches - left.temporalMatches;
    if (left.temporalRecencyScore !== right.temporalRecencyScore) return right.temporalRecencyScore - left.temporalRecencyScore;
    if (left.metadataMatches !== right.metadataMatches) return right.metadataMatches - left.metadataMatches;
    return compareRecencyDesc(left.record, right.record);
  });
  return scored.map((item) => item.record);
}

function selectRecords(methodId, records, query, topK) {
  if (methodId === 'full_context') return records;
  if (methodId === 'recency_last_n') return [...records].sort(compareRecencyDesc).slice(0, topK);
  if (methodId === 'keyword_filter') return rankedByOverlap(records, query.question).slice(0, topK);
  if (methodId === 'enigma_relevance') return rankedByEnigmaRelevance(records, query).slice(0, topK);
  throw new Error(`Unknown method ${methodId}`);
}

function estimatePromptTokens(question, selectedRecords) {
  let tokens = estimateTextTokens(question);
  for (const record of selectedRecords) tokens += record.estimated_tokens;
  return tokens;
}

function percentile(values, ratio) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function latencySummary(values) {
  return {
    samples: values.length,
    p50_ms: round6(percentile(values, 0.5)),
    p95_ms: round6(percentile(values, 0.95)),
    min_ms: round6(values.length === 0 ? 0 : Math.min(...values)),
    max_ms: round6(values.length === 0 ? 0 : Math.max(...values)),
  };
}

function rate(numerator, denominator) {
  if (denominator === 0) return null;
  return round6(numerator / denominator);
}

function round6(value) {
  return Number(value.toFixed(6));
}

function mean(total, count) {
  return count === 0 ? 0 : round6(total / count);
}

function recordFromContent(args) {
  const content = String(args.content ?? '');
  return {
    id: args.id,
    dataset_item_id: args.dataset_item_id,
    session_id: args.session_id,
    turn_id: args.turn_id,
    dialog_id: args.dialog_id,
    role: args.role,
    kind: args.kind,
    tags: args.tags ?? [],
    has_answer: args.has_answer === true,
    ordinal: args.ordinal,
    content,
    estimated_tokens: estimateTextTokens(content),
  };
}

function parseLocomoEvidenceLabels(evidence) {
  const labels = new Set();
  const stack = Array.isArray(evidence) ? [...evidence] : [evidence];
  while (stack.length > 0) {
    const value = stack.shift();
    if (Array.isArray(value)) {
      stack.push(...value);
      continue;
    }
    if (value === undefined || value === null) continue;
    for (const match of String(value).matchAll(/D\s*(\d+)\s*:\s*(\d+)/giu)) {
      labels.add(`D${Number(match[1])}:${Number(match[2])}`);
    }
  }
  return labels;
}

function dialogIdForTurn(sessionNumber, turn, turnIndex) {
  const raw = turn?.dia_id ?? turn?.dialog_id ?? turn?.turn_id ?? turn?.id ?? turnIndex + 1;
  const text = String(raw);
  const match = text.match(/^D\s*(\d+)\s*:\s*(\d+)$/iu);
  if (match) return `D${Number(match[1])}:${Number(match[2])}`;
  const numeric = text.match(/\d+/u)?.[0] ?? String(turnIndex + 1);
  return `D${sessionNumber}:${Number(numeric)}`;
}

export function parseLocomoDataset(data, options = {}) {
  const maxQa = optionalPositiveInteger(options.max_qa ?? options.maxQa, 'max_locomo_qa');
  const rows = normalizeDatasetArray(data, 'LoCoMo');
  const records = [];
  const queries = [];
  let ordinal = 0;
  for (let sampleIndex = 0; sampleIndex < rows.length; sampleIndex += 1) {
    const sample = rows[sampleIndex] ?? {};
    const itemId = String(sample.sample_id ?? sample.id ?? `sample_${sampleIndex + 1}`);
    const conversation = sample.conversation ?? {};
    const sessionNames = Object.keys(conversation)
      .map((key) => {
        const match = key.match(/^session_(\d+)$/u);
        return match ? { key, sessionNumber: Number(match[1]) } : null;
      })
      .filter(Boolean)
      .sort((left, right) => left.sessionNumber - right.sessionNumber);
    for (const { key, sessionNumber } of sessionNames) {
      const session = conversation[key];
      if (!Array.isArray(session)) continue;
      for (let turnIndex = 0; turnIndex < session.length; turnIndex += 1) {
        const turn = session[turnIndex] ?? {};
        const dialogId = dialogIdForTurn(sessionNumber, turn, turnIndex);
        records.push(recordFromContent({
          id: `locomo:${itemId}:${dialogId}`,
          dataset_item_id: itemId,
          session_id: `D${sessionNumber}`,
          turn_id: dialogId,
          dialog_id: dialogId,
          role: turn.speaker ?? turn.role ?? undefined,
          kind: 'locomo_conversation_turn',
          tags: ['locomo', `session_${sessionNumber}`],
          ordinal,
          content: turn.text ?? turn.content ?? turn.message ?? '',
        }));
        ordinal += 1;
      }
    }
    const qaRows = Array.isArray(sample.qa) ? sample.qa : [];
    for (let qaIndex = 0; qaIndex < qaRows.length; qaIndex += 1) {
      if (maxQa !== undefined && queries.length >= maxQa) break;
      const qa = qaRows[qaIndex] ?? {};
      const evidenceDialogIds = parseLocomoEvidenceLabels(qa.evidence);
      queries.push({
        id: `locomo:${itemId}:qa_${qaIndex + 1}`,
        dataset_item_id: itemId,
        question: String(qa.question ?? ''),
        category: qa.category === undefined ? undefined : String(qa.category),
        evidence_dialog_ids: evidenceDialogIds,
        abstention: evidenceDialogIds.size === 0,
      });
    }
    if (maxQa !== undefined && queries.length >= maxQa) break;
  }
  return {
    id: 'locomo',
    label: 'LoCoMo',
    source_url: LOCOMO_SOURCE_URL,
    license: 'CC BY-NC 4.0',
    parser: 'conversation session turns as memory records; qa evidence labels mapped to dialog ids such as D1:3 and semicolon-separated labels',
    task_categories: ['multi-session QA', 'event summarization', 'multimodal generation over long conversations'],
    records,
    queries,
  };
}

function sessionIdAt(ids, index) {
  if (Array.isArray(ids) && ids[index] !== undefined && ids[index] !== null) return String(ids[index]);
  return String(index);
}

function answerSessionIds(item) {
  if (!Array.isArray(item.answer_session_ids)) return new Set();
  return new Set(item.answer_session_ids.map((id) => String(id)));
}

function isLongMemEvalAbstention(item, answerSessions) {
  const id = String(item.question_id ?? item.id ?? '');
  if (id.endsWith('_abs') || id.includes('_abs_')) return true;
  if (String(item.question_type ?? '').toLowerCase().includes('abst')) return true;
  return answerSessions.size === 0;
}

export function parseLongMemEvalDataset(data, options = {}) {
  const maxItems = optionalPositiveInteger(options.max_items ?? options.maxItems, 'max_longmemeval_items');
  const rows = normalizeDatasetArray(data, 'LongMemEval');
  const records = [];
  const queries = [];
  let ordinal = 0;
  const limit = maxItems === undefined ? rows.length : Math.min(rows.length, maxItems);
  for (let itemIndex = 0; itemIndex < limit; itemIndex += 1) {
    const item = rows[itemIndex] ?? {};
    const itemId = String(item.question_id ?? item.id ?? `item_${itemIndex + 1}`);
    const sessions = Array.isArray(item.haystack_sessions) ? item.haystack_sessions : [];
    const sessionIds = item.haystack_session_ids;
    const evidenceTurnIds = new Set();
    for (let sessionIndex = 0; sessionIndex < sessions.length; sessionIndex += 1) {
      const session = sessions[sessionIndex];
      if (!Array.isArray(session)) continue;
      const sessionId = sessionIdAt(sessionIds, sessionIndex);
      for (let turnIndex = 0; turnIndex < session.length; turnIndex += 1) {
        const turn = session[turnIndex] ?? {};
        const turnId = `${sessionId}:${turnIndex}`;
        if (turn.has_answer === true) evidenceTurnIds.add(turnId);
        records.push(recordFromContent({
          id: `longmemeval:${itemId}:${turnId}`,
          dataset_item_id: itemId,
          session_id: sessionId,
          turn_id: turnId,
          role: turn.role ?? undefined,
          kind: 'longmemeval_haystack_turn',
          tags: ['longmemeval', String(item.question_type ?? ''), `session_${sessionId}`],
          has_answer: turn.has_answer === true,
          ordinal,
          content: turn.content ?? turn.text ?? turn.message ?? '',
        }));
        ordinal += 1;
      }
    }
    const answerSessions = answerSessionIds(item);
    queries.push({
      id: `longmemeval:${itemId}`,
      dataset_item_id: itemId,
      question: String(item.question ?? ''),
      question_type: item.question_type === undefined ? undefined : String(item.question_type),
      evidence_turn_ids: evidenceTurnIds,
      evidence_session_ids: answerSessions,
      abstention: isLongMemEvalAbstention(item, answerSessions),
    });
  }
  return {
    id: 'longmemeval',
    label: 'LongMemEval',
    source_url: LONGMEMEVAL_SOURCE_URLS,
    license: 'See Hugging Face dataset card and upstream LongMemEval repository for the selected cleaned file.',
    parser: 'haystack_sessions turns as memory records; has_answer:true turns and answer_session_ids are used as evidence labels; _abs ids are evaluated as abstention cases',
    task_categories: ['information extraction', 'multi-session reasoning', 'temporal reasoning', 'knowledge updates', 'abstention'],
    records,
    queries,
  };
}

function scoreLocomoMethod(method, dataset, topK) {
  const latencies = [];
  let evidenceQuestions = 0;
  let hits = 0;
  let exactCoverage = 0;
  let totalTokens = 0;
  let selectedTotal = 0;
  for (const query of dataset.queries) {
    const start = performance.now();
    const records = dataset.records.filter((record) => record.dataset_item_id === query.dataset_item_id);
    const selected = selectRecords(method.id, records, query, topK);
    latencies.push(performance.now() - start);
    const selectedDialogs = new Set(selected.map((record) => record.dialog_id));
    selectedTotal += selected.length;
    totalTokens += estimatePromptTokens(query.question, selected);
    if (query.evidence_dialog_ids.size > 0) {
      evidenceQuestions += 1;
      let covered = 0;
      for (const evidenceId of query.evidence_dialog_ids) if (selectedDialogs.has(evidenceId)) covered += 1;
      if (covered > 0) hits += 1;
      if (covered === query.evidence_dialog_ids.size) exactCoverage += 1;
    }
  }
  return {
    id: method.id,
    method: method.id,
    local_method_only: true,
    external_provider_called: false,
    retrieval_proxy_only: true,
    uses_top_k: method.uses_top_k,
    top_k: method.uses_top_k ? topK : null,
    question_count: dataset.queries.length,
    evidence_question_count: evidenceQuestions,
    evidence_hit_at_k: rate(hits, evidenceQuestions),
    exact_evidence_coverage: rate(exactCoverage, evidenceQuestions),
    estimated_prompt_tokens: {
      total: totalTokens,
      mean_per_question: mean(totalTokens, dataset.queries.length),
      estimator: 'estimateTextTokens deterministic local estimator',
    },
    selected_memory_count: {
      total: selectedTotal,
      mean_per_question: mean(selectedTotal, dataset.queries.length),
    },
    latency: latencySummary(latencies),
    public_question_text_included: false,
    public_answer_text_included: false,
    raw_conversation_text_included: false,
  };
}

function scoreLongMemEvalMethod(method, dataset, topK) {
  const latencies = [];
  let turnEvidenceQuestions = 0;
  let turnHits = 0;
  let exactTurnCoverage = 0;
  let sessionEvidenceQuestions = 0;
  let sessionHits = 0;
  let exactSessionCoverage = 0;
  let abstentionQuestions = 0;
  let abstentionCorrect = 0;
  let totalTokens = 0;
  let selectedTotal = 0;
  for (const query of dataset.queries) {
    const start = performance.now();
    const records = dataset.records.filter((record) => record.dataset_item_id === query.dataset_item_id);
    const selected = selectRecords(method.id, records, query, topK);
    latencies.push(performance.now() - start);
    const selectedTurns = new Set(selected.map((record) => record.turn_id));
    const selectedSessions = new Set(selected.map((record) => record.session_id));
    selectedTotal += selected.length;
    totalTokens += estimatePromptTokens(query.question, selected);

    if (query.abstention) {
      abstentionQuestions += 1;
      let selectedGold = false;
      for (const turnId of query.evidence_turn_ids) if (selectedTurns.has(turnId)) selectedGold = true;
      for (const sessionId of query.evidence_session_ids) if (selectedSessions.has(sessionId)) selectedGold = true;
      if (!selectedGold) abstentionCorrect += 1;
      continue;
    }

    if (query.evidence_turn_ids.size > 0) {
      turnEvidenceQuestions += 1;
      let covered = 0;
      for (const turnId of query.evidence_turn_ids) if (selectedTurns.has(turnId)) covered += 1;
      if (covered > 0) turnHits += 1;
      if (covered === query.evidence_turn_ids.size) exactTurnCoverage += 1;
    }
    if (query.evidence_session_ids.size > 0) {
      sessionEvidenceQuestions += 1;
      let covered = 0;
      for (const sessionId of query.evidence_session_ids) if (selectedSessions.has(sessionId)) covered += 1;
      if (covered > 0) sessionHits += 1;
      if (covered === query.evidence_session_ids.size) exactSessionCoverage += 1;
    }
  }
  return {
    id: method.id,
    method: method.id,
    local_method_only: true,
    external_provider_called: false,
    retrieval_proxy_only: true,
    uses_top_k: method.uses_top_k,
    top_k: method.uses_top_k ? topK : null,
    item_count: dataset.queries.length,
    turn_evidence_question_count: turnEvidenceQuestions,
    turn_evidence_hit_at_k: rate(turnHits, turnEvidenceQuestions),
    exact_turn_evidence_coverage: rate(exactTurnCoverage, turnEvidenceQuestions),
    session_evidence_question_count: sessionEvidenceQuestions,
    session_evidence_hit_at_k: rate(sessionHits, sessionEvidenceQuestions),
    exact_session_evidence_coverage: rate(exactSessionCoverage, sessionEvidenceQuestions),
    abstention_questions: abstentionQuestions,
    abstention_correct: abstentionCorrect,
    abstention_correctness: rate(abstentionCorrect, abstentionQuestions),
    estimated_prompt_tokens: {
      total: totalTokens,
      mean_per_item: mean(totalTokens, dataset.queries.length),
      estimator: 'estimateTextTokens deterministic local estimator',
    },
    selected_memory_count: {
      total: selectedTotal,
      mean_per_item: mean(selectedTotal, dataset.queries.length),
    },
    latency: latencySummary(latencies),
    public_question_text_included: false,
    public_answer_text_included: false,
    raw_conversation_text_included: false,
  };
}

function scoreDataset(dataset, topK) {
  const methodRows = STANDARD_MEMORY_BENCHMARK_METHODS.map((method) => (
    dataset.id === 'locomo' ? scoreLocomoMethod(method, dataset, topK) : scoreLongMemEvalMethod(method, dataset, topK)
  ));
  return {
    id: dataset.id,
    dataset: dataset.id,
    label: dataset.label,
    source_url: dataset.source_url,
    license: dataset.license,
    parser: dataset.parser,
    task_categories: dataset.task_categories,
    record_count: dataset.records.length,
    question_count: dataset.queries.length,
    item_count: dataset.queries.length,
    raw_question_text_included: false,
    raw_answer_text_included: false,
    raw_conversation_text_included: false,
    methods: methodRows,
  };
}

export function runStandardMemoryBenchmarkSuite(options = {}) {
  const topK = optionalPositiveInteger(options.top_k ?? options.topK, 'top_k') ?? 5;
  const datasetRows = [];
  if (options.locomoData !== undefined) {
    datasetRows.push(scoreDataset(parseLocomoDataset(options.locomoData, { max_qa: options.max_locomo_qa ?? options.maxLocomoQa }), topK));
  }
  if (options.longMemEvalData !== undefined || options.longmemevalData !== undefined) {
    datasetRows.push(scoreDataset(parseLongMemEvalDataset(options.longMemEvalData ?? options.longmemevalData, { max_items: options.max_longmemeval_items ?? options.maxLongMemEvalItems }), topK));
  }
  if (datasetRows.length === 0) throw new Error('At least one standard dataset is required: provide locomoData and/or longMemEvalData');
  return buildSuiteReport(datasetRows, topK, options);
}

export async function runStandardMemoryBenchmarkSuiteFromFiles(options = {}) {
  const datasetRows = [];
  const topK = optionalPositiveInteger(options.top_k ?? options.topK, 'top_k') ?? 5;
  if (options.locomo !== undefined || options.locomoPath !== undefined) {
    const path = options.locomo ?? options.locomoPath;
    const loaded = await readJsonWithSha256(path);
    datasetRows.push({
      ...scoreDataset(parseLocomoDataset(loaded.data, { max_qa: options.max_locomo_qa ?? options.maxLocomoQa }), topK),
      local_file_name: publicFileName(path),
      input_sha256: loaded.sha256,
    });
  }
  if (options.longmemeval !== undefined || options.longmemevalPath !== undefined || options.longMemEvalPath !== undefined) {
    const path = options.longmemeval ?? options.longmemevalPath ?? options.longMemEvalPath;
    const maxItems = optionalPositiveInteger(options.max_longmemeval_items ?? options.maxLongMemEvalItems, 'max_longmemeval_items');
    const loaded = await readLongMemEvalJsonWithSha256(path, maxItems);
    datasetRows.push({
      ...scoreDataset(parseLongMemEvalDataset(loaded.data, { max_items: maxItems }), topK),
      local_file_name: publicFileName(path),
      input_sha256: loaded.sha256,
    });
  }
  if (datasetRows.length === 0) throw new Error('Provide --locomo <path> and/or --longmemeval <path>');
  return buildSuiteReport(datasetRows, topK, options);
}

function buildSuiteReport(datasetRows, topK, options) {
  return {
    schema: STANDARD_MEMORY_BENCHMARK_SUITE_SCHEMA,
    generated_at: options.generated_at ?? new Date().toISOString(),
    package: {
      name: 'enigma-memory',
      version: '0.1.9',
    },
    public_safe: true,
    top_k: topK,
    source_urls: {
      locomo: LOCOMO_SOURCE_URL,
      longmemeval: LONGMEMEVAL_SOURCE_URLS,
    },
    license_and_boundary_notes: [
      'LoCoMo source data is CC BY-NC 4.0; keep local dataset files and raw conversations out of public reports unless separately reviewed.',
      'LongMemEval cleaned files are operator-supplied local JSON files from the upstream Hugging Face dataset repository.',
      'Scores are retrieval/evidence proxy metrics over official dataset labels, not LLM-generated answer accuracy.',
      'No provider APIs, hosted runtimes, competitor SDKs, or external accounts are called by this runner.',
      'Rows are local deterministic methods only; no third-party competitor scores or benchmark-leadership claims are emitted.',
    ],
    benchmark_boundaries: {
      official_dataset_files_required: true,
      credentials_required: false,
      external_provider_calls: false,
      llm_answer_accuracy_scored: false,
      retrieval_evidence_proxy_scored: true,
      raw_question_text_included: false,
      raw_answer_text_included: false,
      raw_conversation_text_included: false,
      provider_deletion_claim: false,
      model_forgetting_claim: false,
      roi_or_provider_invoice_savings_claim: false,
      compliance_certification_claim: false,
      benchmark_leadership_claim: false,
    },
    relevance_logic: {
      token_extraction: 'keyword_filter uses basic lowercase /[a-z0-9]+(?:[-_][a-z0-9]+)*/ overlap after stopword removal; enigma_relevance additionally applies deterministic suffix stemming for ing, ed, and plural s forms',
      production_alignment: 'public-safe local approximation of production query-aware retrieval using query/content stems, role/session/kind/tag hints, category/task hints, temporal/date hints, and phrase/proximity boosts; no private memory is emitted',
      keyword_filter_fallback: 'empty result when no query/content token overlap exists',
      enigma_relevance_fallback: 'falls back to all local candidates only when no enhanced relevance signal exists, then applies deterministic local ranking and --top-k',
      provider_api_used: false,
      llm_used: false,
    },
    local_methods: STANDARD_MEMORY_BENCHMARK_METHODS.map((method) => ({ ...method })),
    datasets: datasetRows,
    dataset_rows: datasetRows,
  };
}

function usage() {
  return `Usage: node scripts/run-standard-memory-benchmarks.mjs [--locomo <path>] [--longmemeval <path>] [--max-locomo-qa <n>] [--max-longmemeval-items <n>] [--top-k <n>] [--out <path>]\n\nProduces schema ${STANDARD_MEMORY_BENCHMARK_SUITE_SCHEMA}. Raw question, answer, and conversation text are never written to the report. With --longmemeval and --max-longmemeval-items, the local top-level JSON array is streamed for hashing and only the requested sample items are parsed.`;
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    console.log(usage());
    return;
  }
  const report = await runStandardMemoryBenchmarkSuiteFromFiles(options);
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (options.out) {
    const outPath = resolve(options.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, serialized);
  } else {
    process.stdout.write(serialized);
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const modulePath = fileURLToPath(import.meta.url);
if (invokedPath === modulePath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
