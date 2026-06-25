import { createVault, remember, exportBundle } from 'enigma-memory/vault';
import { createPassport, compileContextPack, verifyContextPack } from 'enigma-memory/passport';
import { verifyReceiptChain } from 'enigma-memory';

const now = '2026-01-01T00:00:00.000Z';

const vault = createVault({
  tenant_id: 'demo-tenant',
  subject_id: 'demo-subject',
  actor_id: 'demo-app',
  policy_id: 'demo-local-policy',
  now,
});

const remembered = remember({
  vault,
  text: 'Demo project prefers short context packs and local receipt verification.',
  kind: 'preference',
  sensitivity: 'normal',
  purpose_tags: ['demo', 'local-proof'],
  metadata: { demo_id: 'node-basic-memory' },
  now: '2026-01-01T00:00:01.000Z',
});

const passport = createPassport({
  vault,
  display_name: 'Demo Developer',
  now: '2026-01-01T00:00:01.500Z',
});

const contextPack = compileContextPack({
  vault,
  passport,
  query: 'How should this demo handle memory context?',
  purpose: 'demo_context',
  provider: 'local',
  model: 'local-demo',
  memory_addresses: [remembered.memory_addr],
  limit: 1,
  now: '2026-01-01T00:00:02.000Z',
});

const proofBundle = exportBundle({
  vault,
  includePlaintext: false,
  now: '2026-01-01T00:00:03.000Z',
});

const publicKey = proofBundle.keyring.publicKey;

const contextVerification = verifyContextPack({
  contextPack,
  passport,
  vault,
  publicKey,
});

const receiptVerification = verifyReceiptChain({
  receipts: proofBundle.receipts,
  publicKey,
  expectedReceiptLogRoot: proofBundle.vault.receipt_log_root,
  expectedActiveSetRoot: proofBundle.vault.active_set_root,
  verifyEmbeddedReceiptLogRoot: true,
});

const summary = {
  ok: contextVerification.valid === true && receiptVerification.valid === true,
  vault_id: proofBundle.vault.vault_id,
  passport_id: passport.passport_id,
  context_pack_id: contextPack.context_pack_id,
  active_memory_count: proofBundle.active_memory_addresses.length,
  receipt_count: proofBundle.receipts.length,
  active_set_root: proofBundle.vault.active_set_root,
  receipt_log_root: proofBundle.vault.receipt_log_root,
  remembered_memory_addr: remembered.memory_addr,
  context_pack_memory_count: contextPack.memory_addresses.length,
  verification: {
    context_pack_valid: contextVerification.valid,
    receipt_chain_valid: receiptVerification.valid,
    receipt_errors: receiptVerification.errors,
  },
};

console.log(JSON.stringify(summary, null, 2));
