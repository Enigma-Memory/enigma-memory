import { createHash } from "node:crypto";

/**
 * Verifiable memory prototype for Enigma Cortex v3.
 *
 * Builds a SHA-256 Merkle tree over encrypted memory records stored by the
 * off-chain node.  Each leaf commits to a record key plus its encrypted
 * payload (ciphertext, iv, tag) so the host never has to decrypt plaintext to
 * prove inclusion.  This is the Phase-1 cryptographic baseline described in
 * `specs/bottleneck-solutions-architecture.md` section 4.
 */

const LEAF_PREFIX = Buffer.from([0x00]);
const NODE_PREFIX = Buffer.from([0x01]);

export function sha256(...bufs) {
  const hash = createHash("sha256");
  for (const b of bufs) hash.update(b);
  return hash.digest();
}

function hashLeaf(key, { ciphertext, iv, tag }) {
  return sha256(
    LEAF_PREFIX,
    Buffer.from(key, "utf8"),
    Buffer.from(ciphertext, "base64"),
    Buffer.from(iv, "base64"),
    Buffer.from(tag, "base64")
  );
}

function hashNode(left, right) {
  return sha256(NODE_PREFIX, left, right);
}

function buildTree(leaves) {
  if (leaves.length === 0) {
    return {
      root: sha256(Buffer.alloc(0)),
      levels: [[]],
    };
  }

  const levels = [leaves.map((leaf) => leaf.hash)];

  while (levels[0].length > 1) {
    const current = levels[0];
    const next = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i];
      const right = current[i + 1] ?? left;
      next.push(hashNode(left, right));
    }
    levels.unshift(next);
  }

  return {
    root: levels[0][0],
    levels,
  };
}

/**
 * Build a deterministic Merkle tree over encrypted records.
 *
 * @param {Array<{key: string, ciphertext: string, iv: string, tag: string}>} records
 * @returns {{root: Buffer, prove: (key: string) => object}}
 */
export function buildMemoryMerkleTree(records) {
  if (!Array.isArray(records)) {
    throw new TypeError("records must be an array");
  }

  const sorted = [...records].sort((a, b) => a.key.localeCompare(b.key));

  const leaves = sorted.map((record) => ({
    key: record.key,
    hash: hashLeaf(record.key, record),
  }));

  const { root, levels } = buildTree(leaves);

  const keyToIndex = new Map(leaves.map((leaf, i) => [leaf.key, i]));

  function prove(key) {
    const leafIndex = keyToIndex.get(key);
    if (leafIndex === undefined) {
      return undefined;
    }

    const record = sorted[leafIndex];
    const leafHash = leaves[leafIndex].hash;
    const siblings = [];
    let index = leafIndex;

    // levels is ordered [rootLevel, ..., leafLevel]
    for (let level = levels.length - 1; level > 0; level -= 1) {
      const isRight = index % 2 === 1;
      const siblingIndex = isRight ? index - 1 : index + 1;
      const siblingHash = levels[level][siblingIndex] ?? levels[level][index];
      siblings.push({
        hash: siblingHash.toString("hex"),
        isRight: !isRight, // whether the sibling is on the right side
      });
      index = Math.floor(index / 2);
    }

    return {
      root: root.toString("hex"),
      record: {
        ciphertext: record.ciphertext,
        iv: record.iv,
        tag: record.tag,
      },
      leafHash: leafHash.toString("hex"),
      siblings,
      index: leafIndex,
    };
  }

  return {
    root: root.toString("hex"),
    prove,
    _levels: levels,
    _leaves: leaves,
  };
}

/**
 * Standalone verification of a Merkle inclusion proof.
 *
 * @param {string} key
 * @param {{root: string, record: {ciphertext: string, iv: string, tag: string}, siblings: Array<{hash: string, isRight: boolean}>}} proof
 * @returns {boolean}
 */
export function verify(key, proof) {
  if (!proof || typeof proof !== "object") {
    throw new TypeError("proof must be an object");
  }
  if (!proof.record || !proof.siblings || !proof.root) {
    throw new TypeError("proof must contain root, record and siblings");
  }

  let current = hashLeaf(key, proof.record);
  let index = proof.index ?? 0;

  for (const sibling of proof.siblings) {
    const siblingBuf = Buffer.from(sibling.hash, "hex");
    if (siblingBuf.length !== 32) {
      throw new TypeError("sibling hash must be 32 bytes");
    }
    const isRight = index % 2 === 1;
    const [left, right] = isRight
      ? [siblingBuf, current]
      : [current, siblingBuf];
    current = hashNode(left, right);
    index = Math.floor(index / 2);
  }

  return current.toString("hex") === proof.root;
}

/**
 * Convenience verifier class.
 */
export class MemoryMerkleVerifier {
  constructor(records) {
    this.tree = buildMemoryMerkleTree(records);
  }

  get root() {
    return this.tree.root;
  }

  prove(key) {
    return this.tree.prove(key);
  }
}

/**
 * Read encrypted records directly from an EncryptedStore instance.
 * The store object must expose a `db` DatabaseSync handle.
 */
export function recordsFromStore(store) {
  if (!store || !store.db) {
    throw new TypeError("store must expose a db property");
  }
  const rows = store.db
    .prepare("SELECT key, ciphertext, iv, tag FROM records ORDER BY key")
    .all();
  return rows.map((row) => ({
    key: row.key,
    ciphertext: row.ciphertext,
    iv: row.iv,
    tag: row.tag,
  }));
}

/**
 * Build a MemoryMerkleVerifier from an EncryptedStore.
 */
export function createMemoryVerifier(store) {
  return new MemoryMerkleVerifier(recordsFromStore(store));
}
