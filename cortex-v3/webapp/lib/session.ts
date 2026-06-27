import { PublicKey } from "@solana/web3.js";
import { createHash } from "crypto";

import { CAPABILITY_REGISTRY_PROGRAM_ID } from "./programs";

export const MEMORY_CREATE = 1 << 0;
export const MEMORY_UPDATE = 1 << 1;
export const MEMORY_DELETE = 1 << 2;
export const BUDGET_SPEND = 1 << 3;
export const ROYALTY_ROUTE = 1 << 4;
export const CAPABILITY_REVOKE_SELF = 1 << 5;

export const DEFAULT_AUTO_SAVE_SCOPE =
  MEMORY_CREATE | BUDGET_SPEND | ROYALTY_ROUTE;

export const LAMPORTS_PER_SOL = 1_000_000_000;

export const DEFAULT_MAX_SPEND_PER_TX = 0.005 * LAMPORTS_PER_SOL;
export const DEFAULT_MAX_SPEND_PER_DAY = 0.05 * LAMPORTS_PER_SOL;
export const DEFAULT_MAX_OPS_PER_DAY = 200;
export const DEFAULT_SESSION_DAYS = 90;
export const MS_PER_DAY = 86_400_000;

export type SessionScope =
  | "memory:create"
  | "memory:update"
  | "memory:delete"
  | "budget:spend"
  | "royalty:route"
  | "capability:revoke-self";

export const SCOPE_LABELS: { bit: number; label: string; id: SessionScope }[] =
  [
    { bit: 0, label: "Create memories", id: "memory:create" },
    { bit: 1, label: "Update memories", id: "memory:update" },
    { bit: 2, label: "Delete memories", id: "memory:delete" },
    { bit: 3, label: "Spend budget", id: "budget:spend" },
    { bit: 4, label: "Route royalties", id: "royalty:route" },
    { bit: 5, label: "Self-revoke session", id: "capability:revoke-self" },
  ];

export interface SessionProposal {
  owner: string;
  sessionKey: string;
  nonce: number;
  scope: number;
  categoriesHash: string;
  maxSpendPerTx: number;
  maxSpendPerDay: number;
  maxOpsPerDay: number;
  expiresAt: number;
  sessionPda: string;
  ownerNoncePda: string;
}

export interface CreateSessionResult {
  ok: true;
  proposal: SessionProposal;
  serializedTransaction: string;
}

export interface CreateSessionError {
  ok: false;
  error: string;
}

export type CreateSessionResponse = CreateSessionResult | CreateSessionError;

export interface SessionFormData {
  sessionKey: string;
  nonce: number;
  scope: number;
  categoriesHash: string;
  maxSpendPerTx: number;
  maxSpendPerDay: number;
  maxOpsPerDay: number;
  expiresAt: number;
}

export interface SessionPdaResult {
  sessionPda: string;
  ownerNoncePda: string;
  sessionKey: string;
  nonce: number;
}

export function createSessionDiscriminator(): Buffer {
  return createHash("sha256")
    .update("global:create_session")
    .digest()
    .slice(0, 8);
}

export function deriveSessionPda(
  owner: PublicKey,
  sessionKey: PublicKey,
  nonce: bigint
): PublicKey {
  const nonceBuffer = Buffer.alloc(8);
  nonceBuffer.writeBigUInt64LE(nonce);
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("session"),
      owner.toBuffer(),
      sessionKey.toBuffer(),
      nonceBuffer,
    ],
    new PublicKey(CAPABILITY_REGISTRY_PROGRAM_ID)
  );
  return pda;
}

export function deriveOwnerNoncePda(owner: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("owner_nonce"), owner.toBuffer()],
    new PublicKey(CAPABILITY_REGISTRY_PROGRAM_ID)
  );
  return pda;
}

export function encodeCreateSessionArgs(args: SessionFormData): Buffer {
  const sessionKey = new PublicKey(args.sessionKey).toBuffer();
  const categoriesHash = Buffer.from(args.categoriesHash, "hex");
  if (categoriesHash.length !== 32) {
    throw new Error("categoriesHash must be 32 bytes (64 hex chars)");
  }

  const nonceBuffer = Buffer.alloc(8);
  nonceBuffer.writeBigUInt64LE(BigInt(args.nonce));

  const scopeBuffer = Buffer.alloc(4);
  scopeBuffer.writeUInt32LE(args.scope);

  const maxSpendPerTxBuffer = Buffer.alloc(8);
  maxSpendPerTxBuffer.writeBigUInt64LE(BigInt(args.maxSpendPerTx));

  const maxSpendPerDayBuffer = Buffer.alloc(8);
  maxSpendPerDayBuffer.writeBigUInt64LE(BigInt(args.maxSpendPerDay));

  const maxOpsPerDayBuffer = Buffer.alloc(4);
  maxOpsPerDayBuffer.writeUInt32LE(args.maxOpsPerDay);

  const expiresAtBuffer = Buffer.alloc(8);
  expiresAtBuffer.writeBigInt64LE(BigInt(args.expiresAt));

  return Buffer.concat([
    createSessionDiscriminator(),
    sessionKey,
    nonceBuffer,
    scopeBuffer,
    categoriesHash,
    maxSpendPerTxBuffer,
    maxSpendPerDayBuffer,
    maxOpsPerDayBuffer,
    expiresAtBuffer,
  ]);
}

export function formatScope(scope: number): string[] {
  return SCOPE_LABELS.filter(({ bit }) => (scope & (1 << bit)) !== 0).map(
    ({ label }) => label
  );
}

export function formatLamports(lamports: number): string {
  return `${(lamports / LAMPORTS_PER_SOL).toFixed(4)} SOL`;
}
