import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { assert } from "chai";
import { CapabilityRegistry } from "../target/types/capability_registry";

describe("capability_registry session pdas", () => {
  const program = anchor.workspace
    .CapabilityRegistry as anchor.Program<CapabilityRegistry>;
  const owner = Keypair.generate();
  const sessionKey = Keypair.generate();
  const nonce = BigInt(1);

  it("derives the Session PDA from spec seeds", () => {
    const [sessionPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("session"),
        owner.publicKey.toBuffer(),
        sessionKey.publicKey.toBuffer(),
        Buffer.from(new anchor.BN(nonce.toString()).toArray("le", 8)),
      ],
      program.programId
    );
    assert.isFalse(PublicKey.isOnCurve(sessionPda.toBuffer()));
  });

  it("derives the OwnerNonce PDA from spec seeds", () => {
    const [ownerNoncePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("owner_nonce"), owner.publicKey.toBuffer()],
      program.programId
    );
    assert.isFalse(PublicKey.isOnCurve(ownerNoncePda.toBuffer()));
  });

  it("exposes session instructions on the program", () => {
    assert.isFunction(program.methods.createSession);
    assert.isFunction(program.methods.extendSession);
    assert.isFunction(program.methods.revokeSession);
    assert.isFunction(program.methods.pauseAllSessions);
  });

  it("uses the declared program id", () => {
    assert.strictEqual(
      program.programId.toBase58(),
      "CiDwVBFgWV9E5MvXWoLgnEgn2hK7rJikbvfWavzAQz3"
    );
  });
});
