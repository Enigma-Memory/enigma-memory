import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  scryptSync,
  hkdfSync,
} from "node:crypto";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

let DatabaseSync;
try {
  ({ DatabaseSync } = await import("node:sqlite"));
} catch (err) {
  throw new Error(
    "node:sqlite is unavailable. Use Node.js >= 22 or install better-sqlite3. " +
      err.message
  );
}

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const SALT = Buffer.alloc(32, 0x00);
const DEK_SALT = Buffer.from("cortex-v3-dek");
const DEK_INFO = Buffer.from("cortex-v3-user-dek");
const DEK_INFO_WITH_PASSPHRASE = (passphrase) =>
  Buffer.from(`cortex-v3-user-dek:${passphrase}`);

function decodeEntropy(input) {
  if (Buffer.isBuffer(input)) return input;
  if (typeof input === "string" && input.length > 0) {
    return Buffer.from(input, "hex");
  }
  return null;
}

/**
 * Derive a per-user data encryption key (DEK) from wallet entropy and an
 * optional passphrase using HKDF-SHA256.
 *
 * @param {string|Buffer} ownerEntropy - Hex string or raw buffer of the user's
 *   wallet entropy (e.g. a private seed or signature-derived secret).
 * @param {string} [passphrase] - Optional user-supplied passphrase.
 * @returns {Buffer|null} A 32-byte key, or null if no entropy is provided.
 */
export function deriveDataEncryptionKey(ownerEntropy, passphrase) {
  const ikm = decodeEntropy(ownerEntropy);
  if (!ikm || ikm.length === 0) {
    return null;
  }
  const info = passphrase
    ? DEK_INFO_WITH_PASSPHRASE(passphrase)
    : DEK_INFO;
  return Buffer.from(hkdfSync("sha256", ikm, DEK_SALT, info, KEY_LENGTH));
}

function deriveKey(raw) {
  if (!raw) {
    return null;
  }
  const input = Buffer.from(raw, "hex");
  if (input.length === KEY_LENGTH) {
    return input;
  }
  return scryptSync(raw, SALT, KEY_LENGTH);
}

function loadKey() {
  const envKey = process.env.CORTEX_STORE_KEY;
  if (envKey) {
    process.emitWarning(
      "CORTEX_STORE_KEY is set; using operator-controlled encryption key. " +
        "User memory is decryptable by the operator.",
      "CortexStoreWarning"
    );
    return deriveKey(envKey);
  }
  const generated = randomBytes(KEY_LENGTH);
  process.emitWarning(
    "CORTEX_STORE_KEY is not set and no per-user DEK was supplied; " +
      "using an ephemeral encryption key. Data will not be decryptable " +
      "after restart unless a key is persisted.",
    "CortexStoreWarning"
  );
  return generated;
}

export class EncryptedStore {
  constructor(options = {}) {
    this.path = resolve(
      options.path ||
        process.env.CORTEX_STORE_PATH ||
        "data/cortex-store.sqlite"
    );
    if (options.dek) {
      if (!Buffer.isBuffer(options.dek) || options.dek.length !== KEY_LENGTH) {
        throw new TypeError("dek must be a 32-byte Buffer");
      }
      this.key = options.dek;
    } else if (options.key) {
      this.key = deriveKey(options.key);
    } else {
      this.key = loadKey();
    }
    mkdirSync(dirname(this.path), { recursive: true });
    this.db = new DatabaseSync(this.path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS records (
        key TEXT PRIMARY KEY,
        ciphertext TEXT NOT NULL,
        iv TEXT NOT NULL,
        tag TEXT NOT NULL,
        createdAt INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS embeddings (
        key TEXT PRIMARY KEY,
        ciphertext TEXT NOT NULL,
        iv TEXT NOT NULL,
        tag TEXT NOT NULL,
        createdAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_records_key_prefix ON records(key);
      CREATE INDEX IF NOT EXISTS idx_embeddings_key ON embeddings(key);
    `);
    this.deleteStmt = this.db.prepare(`
      DELETE FROM records WHERE key = ?
    `);
    this.insertStmt = this.db.prepare(`
      INSERT INTO records (key, ciphertext, iv, tag, createdAt)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        ciphertext = excluded.ciphertext,
        iv = excluded.iv,
        tag = excluded.tag,
        createdAt = excluded.createdAt
    `);
    this.selectStmt = this.db.prepare(`
      SELECT key, ciphertext, iv, tag, createdAt FROM records WHERE key = ?
    `);
    this.searchStmt = this.db.prepare(`
      SELECT key, ciphertext, iv, tag, createdAt FROM records WHERE key LIKE ?
    `);
    this.insertEmbeddingStmt = this.db.prepare(`
      INSERT INTO embeddings (key, ciphertext, iv, tag, createdAt)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        ciphertext = excluded.ciphertext,
        iv = excluded.iv,
        tag = excluded.tag,
        createdAt = excluded.createdAt
    `);
    this.selectAllEmbeddingsStmt = this.db.prepare(`
      SELECT key, ciphertext, iv, tag, createdAt FROM embeddings
    `);
  }

  #encrypt(plaintext) {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return {
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
    };
  }

  #decrypt(row) {
    const decipher = createDecipheriv(
      ALGORITHM,
      this.key,
      Buffer.from(row.iv, "base64")
    );
    decipher.setAuthTag(Buffer.from(row.tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(row.ciphertext, "base64")),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  }

  put(key, value) {
    if (typeof key !== "string" || key.length === 0) {
      throw new TypeError("key must be a non-empty string");
    }
    const payload = JSON.stringify({ value, storedAt: Date.now() });
    const { ciphertext, iv, tag } = this.#encrypt(payload);
    this.insertStmt.run(key, ciphertext, iv, tag, Date.now());
    return { ok: true, key };
  }

  get(key) {
    const row = this.selectStmt.get(key);
    if (!row) {
      return undefined;
    }
    const payload = JSON.parse(this.#decrypt(row));
    return payload.value;
  }

  search(prefix) {
    const rows = this.searchStmt.all(`${prefix}%`);
    return rows.map((row) => {
      const payload = JSON.parse(this.#decrypt(row));
      return { key: row.key, value: payload.value };
    });
  }

  delete(key) {
    if (typeof key !== "string" || key.length === 0) {
      throw new TypeError("key must be a non-empty string");
    }
    this.deleteStmt.run(key);
    return { ok: true };
  }

  putOAuthCode(code, data) {
    return this.put(`oauth:code:${code}`, data);
  }

  getOAuthCode(code) {
    return this.get(`oauth:code:${code}`);
  }

  deleteOAuthCode(code) {
    return this.delete(`oauth:code:${code}`);
  }

  putOAuthToken(token, data) {
    return this.put(`oauth:token:${token}`, data);
  }

  getOAuthToken(token) {
    return this.get(`oauth:token:${token}`);
  }

  deleteOAuthToken(token) {
    return this.delete(`oauth:token:${token}`);
  }

  putEmbedding(key, vector) {
    if (typeof key !== "string" || key.length === 0) {
      throw new TypeError("key must be a non-empty string");
    }
    const payload = JSON.stringify({
      vector: Array.from(vector),
      storedAt: Date.now(),
    });
    const { ciphertext, iv, tag } = this.#encrypt(payload);
    this.insertEmbeddingStmt.run(key, ciphertext, iv, tag, Date.now());
    return { ok: true, key };
  }

  getAllEmbeddings() {
    const rows = this.selectAllEmbeddingsStmt.all();
    return rows.map((row) => {
      const payload = JSON.parse(this.#decrypt(row));
      return { key: row.key, vector: new Float32Array(payload.vector) };
    });
  }

  close() {
    this.db.close();
  }
}

export function createStore(options) {
  return new EncryptedStore(options);
}
