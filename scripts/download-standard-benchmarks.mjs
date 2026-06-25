#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createWriteStream as defaultCreateWriteStream } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir as defaultMkdir, writeFile as defaultWriteFile } from 'node:fs/promises';

export const STANDARD_BENCHMARK_DATASET_MANIFEST_SCHEMA = 'enigma.standard_benchmark_dataset_manifest.v1';
export const STANDARD_BENCHMARK_DATASET_PLAN_SCHEMA = 'enigma.standard_benchmark_dataset_download_plan.v1';
export const DEFAULT_DATASET_DIR = '.enigma/benchmarks/datasets';
export const DEFAULT_MANIFEST_FILE_NAME = 'standard-benchmark-dataset-manifest.json';

export const DATASET_IDS = Object.freeze([
  'locomo',
  'longmemeval-oracle',
  'longmemeval-s',
  'longmemeval-m',
]);

export const DATASET_SELECTIONS = Object.freeze([...DATASET_IDS, 'all']);

export const STANDARD_BENCHMARK_DATASETS = Object.freeze({
  locomo: Object.freeze({
    id: 'locomo',
    display_name: 'LoCoMo',
    file_name: 'locomo10.json',
    source_url: 'https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json',
    license: 'CC BY-NC 4.0',
    usage_boundaries: Object.freeze([
      'Official LoCoMo data is non-commercial; review the upstream license before use or redistribution.',
      'Use as a long-term conversational-memory benchmark source, not as proof of provider deletion, model forgetting, ROI, savings, compliance, or benchmark leadership.',
      'Public reports must keep raw conversation text out of generated manifests and shared summaries.',
    ]),
  }),
  'longmemeval-oracle': Object.freeze({
    id: 'longmemeval-oracle',
    display_name: 'LongMemEval Oracle',
    file_name: 'longmemeval_oracle.json',
    source_url: 'https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_oracle.json',
    license: 'Review the upstream Hugging Face dataset card and LongMemEval repository terms before use or redistribution.',
    usage_boundaries: Object.freeze([
      'Oracle split includes evidence sessions and is useful for retrieval/proxy controls; it is not a live provider comparison by itself.',
      'LongMemEval covers information extraction, multi-session reasoning, temporal reasoning, knowledge updates, and abstention.',
      'Public reports must keep raw question, answer, and conversation text out of generated manifests and shared summaries.',
    ]),
  }),
  'longmemeval-s': Object.freeze({
    id: 'longmemeval-s',
    display_name: 'LongMemEval S cleaned',
    file_name: 'longmemeval_s_cleaned.json',
    source_url: 'https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_s_cleaned.json',
    license: 'Review the upstream Hugging Face dataset card and LongMemEval repository terms before use or redistribution.',
    usage_boundaries: Object.freeze([
      'Cleaned LongMemEval S is for reproducible benchmark preparation; it is not a live provider comparison by itself.',
      'LongMemEval covers information extraction, multi-session reasoning, temporal reasoning, knowledge updates, and abstention.',
      'Public reports must keep raw question, answer, and conversation text out of generated manifests and shared summaries.',
    ]),
  }),
  'longmemeval-m': Object.freeze({
    id: 'longmemeval-m',
    display_name: 'LongMemEval M cleaned',
    file_name: 'longmemeval_m_cleaned.json',
    source_url: 'https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_m_cleaned.json',
    license: 'Review the upstream Hugging Face dataset card and LongMemEval repository terms before use or redistribution.',
    usage_boundaries: Object.freeze([
      'Cleaned LongMemEval M is large long-memory benchmark data; it is not a live provider comparison by itself.',
      'LongMemEval covers information extraction, multi-session reasoning, temporal reasoning, knowledge updates, and abstention.',
      'Public reports must keep raw question, answer, and conversation text out of generated manifests and shared summaries.',
    ]),
  }),
});

function joinOutputPath(base, fileName) {
  const trimmed = String(base).replace(/[\\/]+$/, '');
  if (!trimmed) {
    return fileName;
  }
  return trimmed.includes('\\') ? join(trimmed, fileName) : `${trimmed}/${fileName}`;
}

export const DEFAULT_DATASET_OUTPUT_FILES = Object.freeze(
  Object.fromEntries(DATASET_IDS.map((id) => [id, joinOutputPath(DEFAULT_DATASET_DIR, STANDARD_BENCHMARK_DATASETS[id].file_name)])),
);

export const STANDARD_BENCHMARK_DATASET_URLS = Object.freeze(
  Object.fromEntries(DATASET_IDS.map((id) => [id, STANDARD_BENCHMARK_DATASETS[id].source_url])),
);

export const STANDARD_BENCHMARK_DATASET_FILE_NAMES = Object.freeze(
  Object.fromEntries(DATASET_IDS.map((id) => [id, STANDARD_BENCHMARK_DATASETS[id].file_name])),
);

export const LONGMEMEVAL_TASK_CATEGORIES = Object.freeze([
  'information extraction',
  'multi-session reasoning',
  'temporal reasoning',
  'knowledge updates',
  'abstention',
]);

function fail(message) {
  throw new Error(message);
}

function takeValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    fail(`${flag} requires a value`);
  }
  return value;
}

export function parseDownloadArgs(argv = process.argv.slice(2)) {
  const options = {
    outDir: DEFAULT_DATASET_DIR,
    dataset: 'all',
    dryRun: true,
    manifestPath: undefined,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--out-dir') {
      options.outDir = takeValue(argv, index, arg);
      index += 1;
    } else if (arg === '--dataset') {
      options.dataset = takeValue(argv, index, arg);
      index += 1;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--execute') {
      options.dryRun = false;
    } else if (arg === '--manifest') {
      options.manifestPath = takeValue(argv, index, arg);
      index += 1;
    } else {
      fail(`Unknown option: ${arg}`);
    }
  }

  if (!DATASET_SELECTIONS.includes(options.dataset)) {
    fail(`Unsupported dataset "${options.dataset}". Expected one of: ${DATASET_SELECTIONS.join(', ')}`);
  }

  return options;
}

export function selectedDatasetIds(selection = 'all') {
  if (!DATASET_SELECTIONS.includes(selection)) {
    fail(`Unsupported dataset "${selection}". Expected one of: ${DATASET_SELECTIONS.join(', ')}`);
  }
  return selection === 'all' ? [...DATASET_IDS] : [selection];
}

export function createDatasetDownloadPlan(options = {}) {
  const outDir = options.outDir ?? DEFAULT_DATASET_DIR;
  const dataset = options.dataset ?? 'all';
  const dryRun = options.dryRun ?? true;
  const manifestPath = options.manifestPath ?? joinOutputPath(outDir, DEFAULT_MANIFEST_FILE_NAME);
  const datasetIds = selectedDatasetIds(dataset);

  return {
    schema: STANDARD_BENCHMARK_DATASET_PLAN_SCHEMA,
    public_safe: true,
    dry_run: Boolean(dryRun),
    execute_required_for_download: Boolean(dryRun),
    raw_dataset_content_included: false,
    selected_dataset: dataset,
    output_directory: outDir,
    manifest_path: manifestPath,
    planned_fetches: datasetIds.map((id) => {
      const datasetInfo = STANDARD_BENCHMARK_DATASETS[id];
      return {
        dataset: datasetInfo.id,
        display_name: datasetInfo.display_name,
        source_url: datasetInfo.source_url,
        license: datasetInfo.license,
        usage_boundaries: [...datasetInfo.usage_boundaries],
        file_name: datasetInfo.file_name,
        output_file: joinOutputPath(outDir, datasetInfo.file_name),
        content_included: false,
      };
    }),
  };
}

function assertFetchResponse(response, datasetId) {
  if (!response || response.ok === false) {
    const status = response?.status ? ` HTTP ${response.status}` : '';
    fail(`Failed to fetch ${datasetId}.${status}`);
  }
}

function sha256Hex(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function responseHasStreamBody(response) {
  return response?.body
    && (typeof response.body.getReader === 'function' || typeof response.body[Symbol.asyncIterator] === 'function');
}

function normalizeBodyChunk(chunk, datasetId) {
  if (typeof chunk === 'string') {
    return Buffer.from(chunk, 'utf8');
  }
  if (chunk instanceof ArrayBuffer) {
    return new Uint8Array(chunk);
  }
  if (ArrayBuffer.isView(chunk)) {
    return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  }
  fail(`Fetch response stream for ${datasetId} yielded an unsupported chunk type`);
}

async function waitForWritableEvent(writer, eventName) {
  await new Promise((resolveEvent, rejectEvent) => {
    const cleanup = () => {
      writer.off(eventName, onEvent);
      writer.off('error', onError);
    };
    const onEvent = () => {
      cleanup();
      resolveEvent();
    };
    const onError = (error) => {
      cleanup();
      rejectEvent(error);
    };

    writer.once(eventName, onEvent);
    writer.once('error', onError);
  });
}

async function writeStreamChunk(writer, chunk) {
  if (!writer.write(chunk)) {
    await waitForWritableEvent(writer, 'drain');
  }
}

async function* responseBodyChunks(body) {
  if (typeof body.getReader === 'function') {
    const reader = body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          return;
        }
        yield value;
      }
    } finally {
      reader.releaseLock?.();
    }
    return;
  }

  yield* body;
}

async function streamResponseToFile(response, outputFile, datasetId, hooks) {
  const createWriteStreamImpl = hooks.createWriteStream ?? defaultCreateWriteStream;
  const writer = createWriteStreamImpl(outputFile);
  const finished = new Promise((resolveFinished, rejectFinished) => {
    writer.once('finish', resolveFinished);
    writer.once('error', rejectFinished);
  });
  finished.catch(() => {});
  const hash = createHash('sha256');
  let byteSize = 0;

  try {
    for await (const chunk of responseBodyChunks(response.body)) {
      const normalizedChunk = normalizeBodyChunk(chunk, datasetId);
      byteSize += normalizedChunk.byteLength;
      hash.update(normalizedChunk);
      await writeStreamChunk(writer, normalizedChunk);
    }
    writer.end();
    await finished;
  } catch (error) {
    writer.destroy?.(error);
    throw error;
  }

  return {
    byteSize,
    sha256: hash.digest('hex'),
  };
}

async function responseToBuffer(response, datasetId) {
  assertFetchResponse(response, datasetId);
  if (typeof response.arrayBuffer === 'function') {
    return Buffer.from(await response.arrayBuffer());
  }
  if (typeof response.text === 'function') {
    return Buffer.from(await response.text(), 'utf8');
  }
  fail(`Fetch response for ${datasetId} does not expose body, arrayBuffer() or text()`);
}

export async function executeDatasetDownloadPlan(plan, hooks = {}) {
  const fetchImpl = hooks.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    fail('No fetch implementation is available; use Node 24+ or pass a fetch hook.');
  }

  const mkdirImpl = hooks.mkdir ?? defaultMkdir;
  const writeFileImpl = hooks.writeFile ?? defaultWriteFile;
  const now = hooks.now ?? (() => new Date().toISOString());
  const fetchedAt = now();
  const records = [];

  for (const fetchPlan of plan.planned_fetches) {
    const response = await fetchImpl(fetchPlan.source_url, { redirect: 'follow' });
    assertFetchResponse(response, fetchPlan.dataset);
    await mkdirImpl(dirname(fetchPlan.output_file), { recursive: true });

    let downloaded;
    if (responseHasStreamBody(response)) {
      downloaded = await streamResponseToFile(response, fetchPlan.output_file, fetchPlan.dataset, hooks);
    } else {
      const bytes = await responseToBuffer(response, fetchPlan.dataset);
      await writeFileImpl(fetchPlan.output_file, bytes);
      downloaded = {
        byteSize: bytes.byteLength,
        sha256: sha256Hex(bytes),
      };
    }
    records.push({
      dataset: fetchPlan.dataset,
      display_name: fetchPlan.display_name,
      source_url: fetchPlan.source_url,
      license: fetchPlan.license,
      usage_boundaries: fetchPlan.usage_boundaries,
      file_name: fetchPlan.file_name,
      output_file: fetchPlan.output_file,
      byte_size: downloaded.byteSize,
      sha256: downloaded.sha256,
      fetched_at: fetchedAt,
      content_included: false,
    });
  }

  const manifest = {
    schema: STANDARD_BENCHMARK_DATASET_MANIFEST_SCHEMA,
    public_safe: true,
    raw_dataset_content_included: false,
    generated_at: now(),
    output_directory: plan.output_directory,
    datasets: records,
    claim_boundaries: [
      'Manifest records downloaded file sizes, checksums, licenses, and source URLs only; it contains no raw dataset records.',
      'Downloaded datasets support retrieval/evidence-coverage or other reviewed benchmark scoring; they do not create provider, competitor, model-forgetting, deletion, ROI, savings, compliance, or benchmark-leadership claims.',
      'Provider-key LLM answer scoring is out of scope for this downloader and must be added only with reviewed credentials and scorer boundaries.',
    ],
  };

  await mkdirImpl(dirname(plan.manifest_path), { recursive: true });
  await writeFileImpl(plan.manifest_path, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function runDownloadCommand(options = {}, hooks = {}) {
  const plan = createDatasetDownloadPlan(options);
  if (plan.dry_run) {
    return plan;
  }
  return executeDatasetDownloadPlan(plan, hooks);
}

function usage() {
  return `Usage: node scripts/download-standard-benchmarks.mjs [options]\n\nOptions:\n  --out-dir <path>       Dataset output directory (default: ${DEFAULT_DATASET_DIR})\n  --dataset <name>       One of: ${DATASET_SELECTIONS.join(', ')} (default: all)\n  --dry-run              Print planned public-safe fetches without downloading (default)\n  --execute              Download selected datasets and write a public-safe manifest\n  --manifest <path>      Manifest path (default: <out-dir>/${DEFAULT_MANIFEST_FILE_NAME})\n  -h, --help             Show this help\n`;
}

async function main() {
  const options = parseDownloadArgs();
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  const result = await runDownloadCommand(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const modulePath = fileURLToPath(import.meta.url);

if (isAbsolute(invokedPath) && invokedPath === modulePath) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
