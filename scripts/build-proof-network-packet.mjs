#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertNoPrivateProofPayload,
  createBenchmarkAttestation,
  createProofNetworkAnchorBatch,
  createProofNetworkPacket,
  sha256Json,
  validateBenchmarkAttestation,
  validateProofNetworkAnchorBatch,
  validateProofNetworkPacket,
} from '../packages/proof-network/src/index.js';

export const PROOF_NETWORK_PACKET_RELEASE_TARGET = '0.1.13';

const HASH_RE = /^(?:sha256:)?[a-f0-9]{64}$/iu;
const SECRET_VALUE_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|\b(?:raw[\s_-]*memory|plaintext[\s_-]*prompts?|plain[\s_-]*text[\s_-]*prompts?|private[\s_-]*prompts?|provider[\s_-]*responses?|full[\s_-]*transcript|decrypted[\s_-]*memory|credentials?|secrets?|passwords?|private[\s_-]*keys?|api[\s_-]*key[\s_-]*(?:secret|material|value)|api[\s_-]*secrets?|access[\s_-]*tokens?|refresh[\s_-]*tokens?|token[\s_-]*values?|credential[\s_-]*material|tenant[\s_-]*names?)\b)/iu;
const ABSOLUTE_LOCAL_PATH_RE = /^(?:[A-Za-z]:[\\/]|\\\\|\/(?:Users|home|tmp|var|etc|mnt|Volumes)\b)/u;

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

function readRequiredValue(argv, index, flag) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) throw new UsageError(`${flag} requires a value`);
  return value;
}

function assertPublicSafeString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new UsageError(`${label} must be a non-empty public ref or hash`);
  const normalized = value.trim();
  if (SECRET_VALUE_RE.test(normalized)) throw new UsageError(`${label} contains private or secret material`);
  return normalized;
}

function assertPublicHash(value, label) {
  const normalized = assertPublicSafeString(value, label);
  if (!HASH_RE.test(normalized)) throw new UsageError(`${label} must be a sha256 hash as 64 hex characters or sha256:<64 hex>`);
  return normalized.toLowerCase().startsWith('sha256:') ? normalized.toLowerCase() : `sha256:${normalized.toLowerCase()}`;
}

function assertRelativeOutFile(value) {
  const normalized = assertPublicSafeString(value, 'output file');
  if (isAbsolute(normalized) || ABSOLUTE_LOCAL_PATH_RE.test(normalized)) throw new UsageError('output file must be a relative path');
  return normalized;
}

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    activeRoot: undefined,
    receiptRoot: undefined,
    benchmarkReport: undefined,
    datasetHash: undefined,
    runnerHash: undefined,
    operatorRef: undefined,
    out: undefined,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    const equalsIndex = raw.indexOf('=');
    const flag = equalsIndex > 0 ? raw.slice(0, equalsIndex) : raw;
    const inlineValue = equalsIndex > 0 ? raw.slice(equalsIndex + 1) : undefined;
    const value = () => {
      if (inlineValue !== undefined) return inlineValue;
      const next = readRequiredValue(argv, index, flag);
      index += 1;
      return next;
    };

    if (flag === '--help' || flag === '-h') args.help = true;
    else if (flag === '--active-root') args.activeRoot = assertPublicHash(value(), 'active root');
    else if (flag === '--receipt-root') args.receiptRoot = assertPublicHash(value(), 'receipt root');
    else if (flag === '--benchmark-report') args.benchmarkReport = value();
    else if (flag === '--dataset-hash') args.datasetHash = assertPublicHash(value(), 'dataset hash');
    else if (flag === '--runner-hash') args.runnerHash = assertPublicHash(value(), 'runner hash');
    else if (flag === '--operator-ref') args.operatorRef = assertPublicSafeString(value(), 'operator ref');
    else if (flag === '--out') args.out = assertRelativeOutFile(value());
    else throw new UsageError(`unknown option ${raw}; use --help`);
  }
  return args;
}

export function usage() {
  return `Usage: node scripts/build-proof-network-packet.mjs --active-root <sha256> --receipt-root <sha256> --benchmark-report <file> --dataset-hash <sha256> --runner-hash <sha256> --operator-ref <ref> [--out <file>]

Builds a public-safe proof-network packet from local refs and hashes. The benchmark report file is hashed only; its body and path are never copied into the packet. This script does not call a network, deploy contracts, create accounts, sign transactions, or write raw memory, prompts, transcripts, completions, embeddings, ACL bodies, tenant names, private keys, API keys, seed phrases, or provider responses.
`;
}

function requireArgs(args) {
  const required = [
    ['--active-root', args.activeRoot],
    ['--receipt-root', args.receiptRoot],
    ['--benchmark-report', args.benchmarkReport],
    ['--dataset-hash', args.datasetHash],
    ['--runner-hash', args.runnerHash],
    ['--operator-ref', args.operatorRef],
  ];
  const missing = required.filter(([, value]) => value === undefined).map(([name]) => name);
  if (missing.length > 0) throw new UsageError(`missing required option(s): ${missing.join(', ')}`);
}

function sha256Buffer(buffer) {
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
}

function withBoundaryFlags(packet) {
  return {
    transaction_submitted: false,
    raw_memory_on_chain: false,
    ...packet,
    transaction_submitted: false,
    raw_memory_on_chain: false,
  };
}

function assertValidation(validation, label) {
  if (validation?.ok !== true) throw new Error(`${label} validation failed: ${(validation?.errors ?? ['unknown error']).join('; ')}`);
}

export async function buildProofNetworkPacket(args, options = {}) {
  requireArgs(args);
  const generatedAt = options.generated_at ?? options.generatedAt ?? new Date().toISOString();
  const reportBytes = await readFile(args.benchmarkReport);
  const reportHash = sha256Buffer(reportBytes);
  const packageRef = `npm:enigma-memory@${PROOF_NETWORK_PACKET_RELEASE_TARGET}`;

  const publicInputs = {
    active_root: args.activeRoot,
    receipt_root: args.receiptRoot,
    report_hash: reportHash,
    dataset_ref: args.datasetHash,
    runner_ref: args.runnerHash,
    operator_ref: args.operatorRef,
    package_ref: packageRef,
    transaction_submitted: false,
    raw_memory_on_chain: false,
  };
  assertNoPrivateProofPayload(publicInputs);

  const operatorSignatureRef = `signature:${sha256Json(args.operatorRef).slice('sha256:'.length)}`;
  const benchmarkAttestation = createBenchmarkAttestation({
    report_hash: reportHash,
    dataset_ref: args.datasetHash,
    runner_ref: args.runnerHash,
    package_ref: packageRef,
    benchmark_ref: `benchmark-report:${reportHash}`,
    signature_ref: operatorSignatureRef,
    attested_at: generatedAt,
  });
  assertValidation(validateBenchmarkAttestation(benchmarkAttestation), 'benchmark attestation');

  const anchorBatch = createProofNetworkAnchorBatch({
    chain: 'solana',
    generated_at: generatedAt,
    anchor_ref: `anchor:${sha256Json([args.activeRoot, args.receiptRoot, reportHash]).slice('sha256:'.length, 'sha256:'.length + 32)}`,
    commitments: [
      { kind: 'active_root', root: args.activeRoot, ref: 'active-root' },
      { kind: 'receipt_root', root: args.receiptRoot, ref: 'receipt-root' },
      { kind: 'benchmark_report', root: reportHash, ref: 'benchmark-report' },
      { kind: 'benchmark_attestation', root: benchmarkAttestation.benchmark_attestation_hash, ref: 'benchmark-attestation' },
      { kind: 'operator_ref', root: sha256Json(args.operatorRef), ref: args.operatorRef },
    ],
  });
  assertValidation(validateProofNetworkAnchorBatch(anchorBatch), 'anchor batch');

  const packet = withBoundaryFlags(createProofNetworkPacket({
    anchor_batches: [anchorBatch],
    attestations: [benchmarkAttestation],
    packet_ref: `proof-network-packet:${sha256Json([anchorBatch.anchor_batch_hash, benchmarkAttestation.benchmark_attestation_hash]).slice('sha256:'.length, 'sha256:'.length + 32)}`,
    created_at: generatedAt,
  }));
  assertNoPrivateProofPayload(packet);
  assertValidation(validateProofNetworkPacket(packet), 'proof-network packet');
  return packet;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(usage());
    return 0;
  }
  const packet = await buildProofNetworkPacket(args);
  const json = `${JSON.stringify(packet, null, 2)}\n`;
  if (args.out) {
    try {
      await mkdir(dirname(args.out), { recursive: true });
      await writeFile(args.out, json, 'utf8');
    } catch {
      throw new Error('failed to write proof-network packet output');
    }
  }
  process.stdout.write(json);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${error.name ?? 'Error'}: ${error.message ?? 'failed to build proof-network packet'}\n`);
    process.exitCode = 1;
  });
}
