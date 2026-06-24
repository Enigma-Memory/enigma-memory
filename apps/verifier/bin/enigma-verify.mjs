#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  verifyReceipt,
  verifyReceiptChain,
  verifyCheckpoint,
} from '../../../packages/core/src/index.js';

function json(value) {
  return JSON.stringify(value, null, 2);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function publicKeyFromBundle(bundle) {
  if (bundle?.publicKey) return bundle.publicKey;
  if (bundle?.public_key) return bundle.public_key;
  if (bundle?.signer?.publicKey) return bundle.signer.publicKey;
  if (bundle?.signer?.public_key) return bundle.signer.public_key;
  if (bundle?.keyring?.publicKey) return bundle.keyring.publicKey;
  if (bundle?.keyring?.public_key) return bundle.keyring.public_key;
  if (bundle?.keypair?.publicKey) return bundle.keypair.publicKey;
  if (bundle?.keys?.publicKey) return bundle.keys.publicKey;
  const issuer = bundle?.trust_bundle?.trusted_issuers?.[0] ?? bundle?.trust?.trusted_issuers?.[0];
  return issuer?.public_key ?? issuer?.publicKey ?? null;
}

function callVerifier(fn, attempts) {
  let lastError;
  for (const args of attempts) {
    try {
      const result = fn(...args);
      if (result && typeof result.then === 'function') {
        throw new TypeError('async verifier functions are not supported by the offline CLI');
      }
      return result;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function normalizeVerdict(result) {
  if (result === true) return { ok: true, errors: [] };
  if (result === false) return { ok: false, errors: [{ code: 'VERIFY_FALSE', message: 'Verifier returned false.' }] };
  if (result && typeof result === 'object') {
    if ('ok' in result) return { ok: Boolean(result.ok), errors: asArray(result.errors) };
    if ('valid' in result) return { ok: Boolean(result.valid), errors: asArray(result.errors) };
  }
  return { ok: Boolean(result), errors: [] };
}

function makeError(code, message, details = undefined) {
  return details === undefined ? { code, message } : { code, message, details };
}

function firstPresent(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function committedVaultState(bundle) {
  const vault = bundle?.vault && typeof bundle.vault === 'object' ? bundle.vault : {};
  return {
    receiptLogRoot: firstPresent(vault.receipt_log_root, bundle?.receipt_log_root),
    activeSetRoot: firstPresent(vault.active_set_root, vault.active_root, bundle?.active_set_root, bundle?.active_root),
    sequence: firstPresent(vault.sequence, bundle?.sequence),
  };
}

function verifierError(error, fallbackCode, fallbackMessage) {
  if (typeof error === 'string') return makeError(fallbackCode, error);
  if (error && typeof error === 'object') {
    return makeError(error.code ?? fallbackCode, error.message ?? fallbackMessage, error);
  }
  return makeError(fallbackCode, fallbackMessage, error);
}

function chainOptionsForBundle({ publicKey, checkpoints, bundle }) {
  return {
    publicKey,
    checkpoints,
    bundle,
    verifyEmbeddedReceiptLogRoot: true,
  };
}

function compareCommittedRoots(chainResult, committed, errors) {
  if (!chainResult || typeof chainResult !== 'object') return;
  if (committed.receiptLogRoot !== undefined && chainResult.receipt_log_root !== committed.receiptLogRoot) {
    errors.push(makeError('BUNDLE_RECEIPT_LOG_ROOT_MISMATCH', 'Receipt chain root does not reach committed vault.receipt_log_root.', {
      committed_receipt_log_root: committed.receiptLogRoot,
      computed_receipt_log_root: chainResult.receipt_log_root,
    }));
  }
  if (committed.activeSetRoot !== undefined && chainResult.active_set_root !== committed.activeSetRoot) {
    errors.push(makeError('BUNDLE_ACTIVE_SET_ROOT_MISMATCH', 'Receipt chain final active_set_root does not match committed vault active root.', {
      committed_active_root: committed.activeSetRoot,
      computed_active_set_root: chainResult.active_set_root,
    }));
  }
}

function compareCommittedSequence(receipts, committed, errors) {
  if (committed.sequence === undefined) return;
  if (!Number.isInteger(committed.sequence) || committed.sequence < 0) {
    errors.push(makeError('BUNDLE_SEQUENCE_INVALID', 'Committed vault.sequence must be a non-negative integer.'));
    return;
  }
  if (receipts.length === 0) return;
  const lastSequence = receipts.at(-1)?.sequence;
  if (lastSequence !== committed.sequence - 1) {
    errors.push(makeError('BUNDLE_SEQUENCE_MISMATCH', 'Receipt chain does not reach committed vault.sequence.', {
      committed_sequence: committed.sequence,
      last_receipt_sequence: lastSequence,
    }));
  }
}




export function verifyBundle(bundle) {
  const receipts = asArray(bundle?.receipts);
  const checkpoints = asArray(bundle?.checkpoints ?? bundle?.passport?.checkpoints);
  const publicKey = publicKeyFromBundle(bundle);
  const errors = [];
  const committed = committedVaultState(bundle);


  if (!bundle || typeof bundle !== 'object') {
    return { ok: false, errors: [makeError('BUNDLE_INVALID', 'Bundle must be a JSON object.')] };
  }
  if (receipts.length === 0) {
    errors.push(makeError('RECEIPTS_MISSING', 'Bundle does not contain receipts.'));
  }
  if (!publicKey) {
    errors.push(makeError('PUBLIC_KEY_MISSING', 'Bundle does not contain an offline verifier public key.'));
  }

  if (publicKey && receipts.length > 0) {
    try {
      const chainOptions = chainOptionsForBundle({ publicKey, checkpoints, bundle });
      const chainResult = callVerifier(verifyReceiptChain, [
        [{ receipts, ...chainOptions }],
        [receipts, chainOptions],
      ]);
      const chainVerdict = normalizeVerdict(chainResult);
      if (!chainVerdict.ok) errors.push(...chainVerdict.errors.map((error) => verifierError(error, 'RECEIPT_CHAIN_INVALID', 'Receipt chain did not verify.')));
      compareCommittedRoots(chainResult, committed, errors);
    } catch (error) {
      errors.push(makeError('RECEIPT_CHAIN_INVALID', error.message));
    }

    for (const receipt of receipts) {
      try {
        const receiptVerdict = normalizeVerdict(callVerifier(verifyReceipt, [
          [{ receipt, publicKey }],
          [receipt, publicKey],
        ]));
        if (!receiptVerdict.ok) errors.push(makeError('RECEIPT_INVALID', `Receipt ${receipt?.receipt_id ?? '<unknown>'} did not verify.`, receiptVerdict.errors));
      } catch (error) {
        errors.push(makeError('RECEIPT_INVALID', `Receipt ${receipt?.receipt_id ?? '<unknown>'} failed verification: ${error.message}`));
      }
    }
  }

  compareCommittedSequence(receipts, committed, errors);

  if (receipts.length > 0 && checkpoints.length > 0 && publicKey) {
    const lastReceipt = receipts.at(-1);
    const lastCheckpoint = checkpoints.at(-1);
    try {
      const checkpointVerdict = normalizeVerdict(callVerifier(verifyCheckpoint, [
        [{ checkpoint: lastCheckpoint, receipts, publicKey, bundle }],
        [lastCheckpoint, receipts, publicKey],
      ]));
      if (!checkpointVerdict.ok) errors.push(...checkpointVerdict.errors.map((error) => verifierError(error, 'CHECKPOINT_INVALID', 'Checkpoint did not verify.')));
    } catch (error) {
      errors.push(makeError('CHECKPOINT_INVALID', error.message));
    }

    if (lastCheckpoint?.receipt_log_root && lastReceipt?.receipt_log_root && lastCheckpoint.receipt_log_root !== lastReceipt.receipt_log_root) {
      errors.push(makeError('STALE_CHECKPOINT', 'Latest checkpoint receipt_log_root does not match the latest receipt.'));
    }
    if (lastCheckpoint?.active_memory_root && lastReceipt?.active_set_root && lastCheckpoint.active_memory_root !== lastReceipt.active_set_root) {
      errors.push(makeError('STALE_CHECKPOINT', 'Latest checkpoint active_memory_root does not match the latest receipt.'));
    }
  }


  return {
    ok: errors.length === 0,
    schema: 'enigma.verification_report.v1',
    checked_at: new Date().toISOString(),
    receipt_count: receipts.length,
    checkpoint_count: checkpoints.length,
    errors,
  };
}

export async function readBundle(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function main(argv = process.argv.slice(2), io = { stdout: process.stdout, stderr: process.stderr }) {
  const file = argv.find((arg) => !arg.startsWith('-'));
  if (!file || argv.includes('--help') || argv.includes('-h')) {
    io.stdout.write(`${json({ usage: 'enigma-verify <exported-bundle.json>', output: 'JSON verification report' })}\n`);
    return 0;
  }
  try {
    const report = verifyBundle(await readBundle(file));
    io.stdout.write(`${json(report)}\n`);
    return report.ok ? 0 : 1;
  } catch (error) {
    io.stdout.write(`${json({ ok: false, schema: 'enigma.verification_report.v1', checked_at: new Date().toISOString(), errors: [makeError('VERIFY_CLI_ERROR', error.message)] })}\n`);
    return 2;
  }
}
function isMainModule(metaUrl) {
  if (!process.argv[1]) return false;
  try {
    return metaUrl === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return metaUrl === pathToFileURL(process.argv[1]).href;
  }
}


if (isMainModule(import.meta.url)) {
  process.exitCode = await main();
}
