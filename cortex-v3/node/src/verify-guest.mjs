import { sha256 } from "./verify.mjs";

/**
 * RISC Zero / SP1 guest stub in pure JavaScript.
 *
 * In a production zkVM deployment this deterministic retrieval function would
 * be compiled to a RISC-V guest (Rust with `risc0-zkvm` or `sp1-sdk`) and the
 * prover would produce a receipt whose integrity is checked by the verifier.
 * This file provides the *same* deterministic computation in JS so tests and
 * the off-chain node can prototype the proof boundary without the native
 * toolchain.
 *
 * Proof boundary:
 *   public inputs  = { queryEmbedding[], corpusCommitment, capabilityPda, topK }
 *   private inputs = { corpus: [{ id, contentHash, embedding }] }
 *   outputs        = sorted top-K list of { id, contentHash, score }
 *
 * The "receipt" is a SHA-256 commitment to the canonical serialisation of the
 * inputs and outputs.  It is reproducible by any verifier that has the public
 * inputs and the claimed outputs, so it demonstrates top-K correctness in the
 * same way a zkVM journal does.
 */

function cosineSimilarity(a, b) {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

function canonicalBuffer(value) {
  if (Array.isArray(value) || value instanceof Float32Array) {
    return Buffer.from(new Float32Array(value).buffer);
  }
  if (typeof value === "number") {
    return Buffer.from(new Float32Array([value]).buffer);
  }
  if (typeof value === "string") {
    return Buffer.from(value, "utf8");
  }
  if (Buffer.isBuffer(value)) {
    return value;
  }
  throw new TypeError(`unsupported canonical type: ${typeof value}`);
}

function commitSearch({
  queryEmbedding,
  corpusCommitment,
  capabilityPda,
  topK,
  result,
}) {
  const hash = createHashChain();
  hash.update(canonicalBuffer(queryEmbedding));
  hash.update(canonicalBuffer(corpusCommitment));
  hash.update(canonicalBuffer(capabilityPda ?? ""));
  hash.update(canonicalBuffer(topK));
  for (const item of result) {
    hash.update(canonicalBuffer(item.id));
    hash.update(canonicalBuffer(item.contentHash));
    hash.update(canonicalBuffer(item.score));
  }
  return hash.digest().toString("hex");
}

function createHashChain() {
  return {
    _h: sha256(Buffer.from("cortex-search-guest-v1")),
    update(buf) {
      this._h = sha256(this._h, buf);
    },
    digest() {
      return sha256(this._h, Buffer.from([0xff]));
    },
  };
}

/**
 * Deterministic top-K semantic search.
 *
 * @param {Object} args
 * @param {Float32Array|number[]} args.queryEmbedding
 * @param {Array<{id: string, contentHash: string, embedding: Float32Array|number[]}>} args.corpus
 * @param {number} args.topK
 * @param {string} [args.capabilityPda]
 * @param {string} [args.corpusCommitment]
 * @returns {{ result: Array<{id: string, contentHash: string, score: number}>, commitment: string }}
 */
export function proveSearchMemory(args) {
  const {
    queryEmbedding,
    corpus,
    topK,
    capabilityPda = "",
    corpusCommitment = "",
  } = args;

  if (!Array.isArray(corpus)) {
    throw new TypeError("corpus must be an array");
  }
  if (!Number.isInteger(topK) || topK <= 0) {
    throw new TypeError("topK must be a positive integer");
  }

  const query = new Float32Array(queryEmbedding);
  const scored = corpus.map(({ id, contentHash, embedding }) => ({
    id,
    contentHash,
    score: cosineSimilarity(query, new Float32Array(embedding)),
  }));

  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const result = scored.slice(0, topK).map((item) => ({
    id: item.id,
    contentHash: item.contentHash,
    score: Number(item.score.toFixed(6)),
  }));

  const commitment = commitSearch({
    queryEmbedding,
    corpusCommitment,
    capabilityPda,
    topK,
    result,
  });

  return { result, commitment };
}

/**
 * Verify a search-memory receipt.
 *
 * @param {Object} args
 * @param {Float32Array|number[]} args.queryEmbedding
 * @param {string} args.corpusCommitment
 * @param {string} [args.capabilityPda]
 * @param {number} args.topK
 * @param {Array<{id: string, contentHash: string, score: number}>} args.result
 * @param {string} args.commitment
 * @returns {boolean}
 */
export function verifySearchMemory(args) {
  const expected = commitSearch({
    queryEmbedding: args.queryEmbedding,
    corpusCommitment: args.corpusCommitment,
    capabilityPda: args.capabilityPda,
    topK: args.topK,
    result: args.result,
  });
  return expected === args.commitment;
}
