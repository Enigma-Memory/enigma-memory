import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  clusterApiUrl,
} from "@solana/web3.js";
import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  CreateSessionResponse,
  DEFAULT_AUTO_SAVE_SCOPE,
  DEFAULT_MAX_OPS_PER_DAY,
  DEFAULT_MAX_SPEND_PER_DAY,
  DEFAULT_MAX_SPEND_PER_TX,
  DEFAULT_SESSION_DAYS,
  MS_PER_DAY,
  SessionProposal,
  deriveOwnerNoncePda,
  deriveSessionPda,
  encodeCreateSessionArgs,
} from "@/lib/session";

const SOLANA_RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC ?? clusterApiUrl("devnet");

export type { SessionProposal };

export async function POST(
  request: NextRequest
): Promise<NextResponse<CreateSessionResponse>> {
  try {
    const body = (await request.json()) as {
      owner: string;
      scope?: number;
      maxSpendPerTx?: number;
      maxSpendPerDay?: number;
      maxOpsPerDay?: number;
      expiresAt?: number;
    };

    const owner = body.owner;
    if (!owner || typeof owner !== "string") {
      return NextResponse.json(
        { ok: false, error: "owner is required" },
        { status: 400 }
      );
    }

    const ownerKey = new PublicKey(owner);

    // Generate a fresh session key on the server. In production this keypair is
    // encrypted and stored in the Cortex node's key vault (future TEE-sealed).
    const sessionKeypair = Keypair.fromSeed(randomBytes(32));
    const sessionKey = sessionKeypair.publicKey;

    const nonce = Math.floor(Math.random() * 0xffffffff);
    const now = Date.now();
    const expiresAt =
      body.expiresAt ??
      Math.floor((now + DEFAULT_SESSION_DAYS * MS_PER_DAY) / 1000);

    const proposal: SessionProposal = {
      owner,
      sessionKey: sessionKey.toBase58(),
      nonce,
      scope: body.scope ?? DEFAULT_AUTO_SAVE_SCOPE,
      categoriesHash: "00".repeat(32),
      maxSpendPerTx: body.maxSpendPerTx ?? DEFAULT_MAX_SPEND_PER_TX,
      maxSpendPerDay: body.maxSpendPerDay ?? DEFAULT_MAX_SPEND_PER_DAY,
      maxOpsPerDay: body.maxOpsPerDay ?? DEFAULT_MAX_OPS_PER_DAY,
      expiresAt,
      sessionPda: deriveSessionPda(
        ownerKey,
        sessionKey,
        BigInt(nonce)
      ).toBase58(),
      ownerNoncePda: deriveOwnerNoncePda(ownerKey).toBase58(),
    };

    const connection = new Connection(SOLANA_RPC, "confirmed");
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash();

    const tx = new Transaction({
      feePayer: ownerKey,
      blockhash,
      lastValidBlockHeight,
    });

    const data = encodeCreateSessionArgs({
      sessionKey: proposal.sessionKey,
      nonce: proposal.nonce,
      scope: proposal.scope,
      categoriesHash: proposal.categoriesHash,
      maxSpendPerTx: proposal.maxSpendPerTx,
      maxSpendPerDay: proposal.maxSpendPerDay,
      maxOpsPerDay: proposal.maxOpsPerDay,
      expiresAt: proposal.expiresAt,
    });

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: ownerKey, isSigner: true, isWritable: true },
        {
          pubkey: new PublicKey(proposal.sessionPda),
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: new PublicKey(proposal.ownerNoncePda),
          isSigner: false,
          isWritable: true,
        },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: new PublicKey(
        process.env.NEXT_PUBLIC_CAPABILITY_REGISTRY_PROGRAM_ID ??
          "CiDwVBFgWV9E5MvXWoLgnEgn2hK7rJikbvfWavzAQz3"
      ),
      data,
    });

    tx.add(instruction);

    const serializedTransaction = tx
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString("base64");

    return NextResponse.json({ ok: true, proposal, serializedTransaction });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
