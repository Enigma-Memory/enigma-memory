import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Writable } from 'node:stream';
import { isAbsolute } from 'node:path';
import {
  DATASET_IDS,
  DEFAULT_DATASET_DIR,
  DEFAULT_DATASET_OUTPUT_FILES,
  STANDARD_BENCHMARK_DATASET_FILE_NAMES,
  STANDARD_BENCHMARK_DATASET_URLS,
  STANDARD_BENCHMARK_DATASET_MANIFEST_SCHEMA,
  STANDARD_BENCHMARK_DATASET_PLAN_SCHEMA,
  createDatasetDownloadPlan,
  executeDatasetDownloadPlan,
  parseDownloadArgs,
  runDownloadCommand,
  selectedDatasetIds,
} from '../scripts/download-standard-benchmarks.mjs';

test('standard benchmark downloader parses CLI options with dry-run default', () => {
  assert.deepEqual(parseDownloadArgs([]), {
    outDir: DEFAULT_DATASET_DIR,
    dataset: 'all',
    dryRun: true,
    manifestPath: undefined,
    help: false,
  });

  assert.deepEqual(parseDownloadArgs([
    '--out-dir',
    'cache/datasets',
    '--dataset',
    'longmemeval-s',
    '--execute',
    '--manifest',
    'cache/manifest.json',
  ]), {
    outDir: 'cache/datasets',
    dataset: 'longmemeval-s',
    dryRun: false,
    manifestPath: 'cache/manifest.json',
    help: false,
  });

  assert.throws(
    () => parseDownloadArgs(['--dataset', 'unknown']),
    /Unsupported dataset "unknown"/,
  );
});

test('standard benchmark downloader expands dataset selections deterministically', () => {
  assert.deepEqual(selectedDatasetIds('all'), DATASET_IDS);
  assert.deepEqual(selectedDatasetIds('locomo'), ['locomo']);
  assert.deepEqual(selectedDatasetIds('longmemeval-oracle'), ['longmemeval-oracle']);
});

test('standard benchmark downloader exports source URL and file-name constants', () => {
  assert.equal(
    STANDARD_BENCHMARK_DATASET_URLS.locomo,
    'https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json',
  );
  assert.equal(STANDARD_BENCHMARK_DATASET_FILE_NAMES['longmemeval-m'], 'longmemeval_m_cleaned.json');
  assert.equal(DEFAULT_DATASET_OUTPUT_FILES['longmemeval-m'], '.enigma/benchmarks/datasets/longmemeval_m_cleaned.json');
});

test('standard benchmark dry-run plan is public-safe and contains official sources', () => {
  const plan = createDatasetDownloadPlan({ dataset: 'locomo' });
  const publicText = JSON.stringify(plan, null, 2);

  assert.equal(plan.schema, STANDARD_BENCHMARK_DATASET_PLAN_SCHEMA);
  assert.equal(plan.public_safe, true);
  assert.equal(plan.dry_run, true);
  assert.equal(plan.raw_dataset_content_included, false);
  assert.equal(plan.planned_fetches.length, 1);
  assert.equal(plan.planned_fetches[0].dataset, 'locomo');
  assert.equal(
    plan.planned_fetches[0].source_url,
    'https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json',
  );
  assert.equal(plan.planned_fetches[0].license, 'CC BY-NC 4.0');
  assert.equal(plan.planned_fetches[0].output_file, DEFAULT_DATASET_OUTPUT_FILES.locomo);
  assert.equal(isAbsolute(plan.output_directory), false);
  assert.equal(isAbsolute(plan.manifest_path), false);
  assert.equal(isAbsolute(plan.planned_fetches[0].output_file), false);
  assert.ok(!publicText.includes(process.cwd()));
  assert.ok(!publicText.includes('sample_id'));
  assert.ok(!publicText.includes('haystack_sessions'));
});

test('standard benchmark dry-run command does not call fetch or write hooks', async () => {
  const result = await runDownloadCommand(
    { dataset: 'longmemeval-s', dryRun: true },
    {
      fetch: async () => {
        throw new Error('dry-run must not fetch');
      },
      writeFile: async () => {
        throw new Error('dry-run must not write files');
      },
    },
  );

  assert.equal(result.dry_run, true);
  assert.equal(result.planned_fetches.length, 1);
  assert.equal(result.planned_fetches[0].dataset, 'longmemeval-s');
});

test('standard benchmark manifest records hashes and excludes raw dataset content', async () => {
  const payload = Buffer.from('fake benchmark bytes for hash only', 'utf8');
  const writes = new Map();
  const madeDirs = [];
  let arrayBufferCalled = false;
  const plan = createDatasetDownloadPlan({
    dataset: 'longmemeval-oracle',
    dryRun: false,
    outDir: '.enigma/benchmarks/datasets',
    manifestPath: '.enigma/benchmarks/dataset-manifest.json',
  });

  const manifest = await executeDatasetDownloadPlan(plan, {
    now: () => '2026-06-25T00:00:00.000Z',
    fetch: async (url, options) => {
      assert.equal(url, 'https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_oracle.json');
      assert.deepEqual(options, { redirect: 'follow' });
      return {
        ok: true,
        arrayBuffer: async () => {
          arrayBufferCalled = true;
          return payload;
        },
      };
    },
    mkdir: async (dir, options) => {
      madeDirs.push([dir, options]);
    },
    writeFile: async (path, content) => {
      writes.set(path, content);
    },
  });

  const expectedHash = createHash('sha256').update(payload).digest('hex');
  assert.equal(manifest.schema, STANDARD_BENCHMARK_DATASET_MANIFEST_SCHEMA);
  assert.equal(manifest.public_safe, true);
  assert.equal(manifest.raw_dataset_content_included, false);
  assert.equal(manifest.datasets.length, 1);
  assert.equal(manifest.datasets[0].dataset, 'longmemeval-oracle');
  assert.equal(manifest.datasets[0].file_name, 'longmemeval_oracle.json');
  assert.equal(manifest.datasets[0].byte_size, payload.byteLength);
  assert.equal(manifest.datasets[0].sha256, expectedHash);
  assert.equal(manifest.datasets[0].content_included, false);
  assert.ok(manifest.datasets[0].usage_boundaries.some((boundary) => boundary.includes('information extraction')));
  assert.equal(arrayBufferCalled, true);
  assert.deepEqual(writes.get('.enigma/benchmarks/datasets/longmemeval_oracle.json'), payload);
  assert.ok(madeDirs.length >= 2);

  const manifestJson = writes.get('.enigma/benchmarks/dataset-manifest.json');
  assert.equal(typeof manifestJson, 'string');
  assert.ok(!manifestJson.includes(payload.toString('utf8')));
  assert.ok(!manifestJson.includes('haystack_sessions'));
});

test('standard benchmark downloader streams response bodies into hashed files', async () => {
  const chunks = [
    Buffer.from('first fake streamed benchmark fragment', 'utf8'),
    Buffer.from('second fake streamed benchmark fragment', 'utf8'),
  ];
  const payload = Buffer.concat(chunks);
  const rawText = payload.toString('utf8');
  const writes = new Map();
  const streamedFiles = new Map();
  let arrayBufferCalled = false;
  const plan = createDatasetDownloadPlan({
    dataset: 'longmemeval-m',
    dryRun: false,
    outDir: '.enigma/benchmarks/datasets',
    manifestPath: '.enigma/benchmarks/dataset-manifest.json',
  });

  const manifest = await executeDatasetDownloadPlan(plan, {
    now: () => '2026-06-25T00:00:00.000Z',
    fetch: async (url, options) => {
      assert.equal(url, 'https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_m_cleaned.json');
      assert.deepEqual(options, { redirect: 'follow' });
      return {
        ok: true,
        body: new ReadableStream({
          start(controller) {
            for (const chunk of chunks) {
              controller.enqueue(chunk);
            }
            controller.close();
          },
        }),
        arrayBuffer: async () => {
          arrayBufferCalled = true;
          return payload;
        },
      };
    },
    mkdir: async () => {},
    createWriteStream: (path) => {
      const streamedChunks = [];
      streamedFiles.set(path, streamedChunks);
      return new Writable({
        write(chunk, _encoding, callback) {
          streamedChunks.push(Buffer.from(chunk));
          callback();
        },
      });
    },
    writeFile: async (path, content) => {
      writes.set(path, content);
    },
  });

  const expectedHash = createHash('sha256').update(payload).digest('hex');
  const streamedPayload = Buffer.concat(streamedFiles.get('.enigma/benchmarks/datasets/longmemeval_m_cleaned.json'));
  assert.equal(arrayBufferCalled, false);
  assert.deepEqual(streamedPayload, payload);
  assert.equal(writes.has('.enigma/benchmarks/datasets/longmemeval_m_cleaned.json'), false);
  assert.equal(manifest.datasets[0].byte_size, payload.byteLength);
  assert.equal(manifest.datasets[0].sha256, expectedHash);
  assert.equal(manifest.datasets[0].content_included, false);

  const manifestJson = writes.get('.enigma/benchmarks/dataset-manifest.json');
  assert.equal(typeof manifestJson, 'string');
  assert.ok(!manifestJson.includes(rawText));
  assert.ok(!JSON.stringify(manifest).includes(rawText));
});
