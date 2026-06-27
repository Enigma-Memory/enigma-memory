import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createMint,
  createAssociatedTokenAccount,
  getAccount,
  mintTo,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";

describe("session-wallet delegation", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const capabilityRegistry = anchor.workspace.CapabilityRegistry;
  const memoryRegistry = anchor.workspace.MemoryRegistry;
  const budgetEscrow = anchor.workspace.BudgetEscrow;
  const royaltyRouter = anchor.workspace.RoyaltyRouter;

  const owner = Keypair.generate();
  const sessionKey = Keypair.generate();

  const ownerNoncePda = PublicKey.findProgramAddressSync(
    [Buffer.from("owner_nonce"), owner.publicKey.toBuffer()],
    capabilityRegistry.programId
  )[0];

  const sessionPda = PublicKey.findProgramAddressSync(
    [
      Buffer.from("session"),
      owner.publicKey.toBuffer(),
      sessionKey.publicKey.toBuffer(),
      Buffer.from(new BN(0).toArray("le", 8)),
    ],
    capabilityRegistry.programId
  )[0];

  const contentHash = Buffer.alloc(32);
  contentHash[0] = 1;

  const memoryPda = PublicKey.findProgramAddressSync(
    [
      Buffer.from("memory"),
      owner.publicKey.toBuffer(),
      contentHash.subarray(0, 8),
    ],
    memoryRegistry.programId
  )[0];

  const budgetPda = PublicKey.findProgramAddressSync(
    [Buffer.from("budget"), owner.publicKey.toBuffer()],
    budgetEscrow.programId
  )[0];

  async function fund(keypair: Keypair, sol = 2) {
    const sig = await provider.connection.requestAirdrop(
      keypair.publicKey,
      sol * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);
  }

  before(async () => {
    await fund(owner, 5);
    await fund(sessionKey, 2);
  });

  it("creates a scoped Session PDA", async () => {
    const now = Math.floor(Date.now() / 1000);
    await capabilityRegistry.methods
      .createSession(
        0b00011111, // MEMORY_CREATE | MEMORY_UPDATE | MEMORY_DELETE | BUDGET_SPEND | ROYALTY_ROUTE
        Buffer.alloc(32),
        new BN(5_000_000),
        new BN(50_000_000),
        200,
        new BN(now + 86_400)
      )
      .accounts({
        owner: owner.publicKey,
        sessionKey: sessionKey.publicKey,
        ownerNonce: ownerNoncePda,
        session: sessionPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc();

    const session = await capabilityRegistry.account.session.fetch(sessionPda);
    assert.equal(session.owner.toBase58(), owner.publicKey.toBase58());
    assert.equal(
      session.sessionKey.toBase58(),
      sessionKey.publicKey.toBase58()
    );
    assert.equal(session.nonce.toNumber(), 0);
    assert.equal(session.scope, 0b00011111);
  });

  it("creates a memory with the session key", async () => {
    await memoryRegistry.methods
      .createMemoryWithSession(contentHash, new BN(0))
      .accounts({
        sessionKey: sessionKey.publicKey,
        owner: owner.publicKey,
        session: sessionPda,
        ownerNonce: ownerNoncePda,
        memory: memoryPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([sessionKey])
      .rpc();

    const memory = await memoryRegistry.account.memory.fetch(memoryPda);
    assert.equal(memory.owner.toBase58(), owner.publicKey.toBase58());
    assert.deepEqual(Array.from(memory.contentHash), Array.from(contentHash));
  });

  it("updates a memory with the session key", async () => {
    const newHash = Buffer.alloc(32);
    newHash[0] = 2;

    await memoryRegistry.methods
      .updateMemoryWithSession(newHash, new BN(0))
      .accounts({
        sessionKey: sessionKey.publicKey,
        owner: owner.publicKey,
        session: sessionPda,
        ownerNonce: ownerNoncePda,
        memory: memoryPda,
      })
      .signers([sessionKey])
      .rpc();

    const memory = await memoryRegistry.account.memory.fetch(memoryPda);
    assert.deepEqual(Array.from(memory.contentHash), Array.from(newHash));
  });

  it("deletes a memory with the session key", async () => {
    await memoryRegistry.methods
      .deleteMemoryWithSession(new BN(0))
      .accounts({
        sessionKey: sessionKey.publicKey,
        owner: owner.publicKey,
        session: sessionPda,
        ownerNonce: ownerNoncePda,
        memory: memoryPda,
      })
      .signers([sessionKey])
      .rpc();

    const memoryInfo = await provider.connection.getAccountInfo(memoryPda);
    assert.isNull(memoryInfo);
  });

  it("rejects a session-scoped operation without the required scope bit", async () => {
    const restrictedKey = Keypair.generate();
    await fund(restrictedKey);

    const ownerNonce = await capabilityRegistry.account.ownerNonce.fetch(
      ownerNoncePda
    );
    const nonce = ownerNonce.nonce.toNumber();
    const restrictedSession = PublicKey.findProgramAddressSync(
      [
        Buffer.from("session"),
        owner.publicKey.toBuffer(),
        restrictedKey.publicKey.toBuffer(),
        Buffer.from(new BN(nonce).toArray("le", 8)),
      ],
      capabilityRegistry.programId
    )[0];

    const now = Math.floor(Date.now() / 1000);
    await capabilityRegistry.methods
      .createSession(
        0, // no scope bits
        Buffer.alloc(32),
        new BN(5_000_000),
        new BN(50_000_000),
        200,
        new BN(now + 86_400)
      )
      .accounts({
        owner: owner.publicKey,
        sessionKey: restrictedKey.publicKey,
        ownerNonce: ownerNoncePda,
        session: restrictedSession,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc();

    const badHash = Buffer.alloc(32);
    badHash[0] = 9;
    const badMemory = PublicKey.findProgramAddressSync(
      [
        Buffer.from("memory"),
        owner.publicKey.toBuffer(),
        badHash.subarray(0, 8),
      ],
      memoryRegistry.programId
    )[0];

    try {
      await memoryRegistry.methods
        .createMemoryWithSession(badHash, new BN(nonce))
        .accounts({
          sessionKey: restrictedKey.publicKey,
          owner: owner.publicKey,
          session: restrictedSession,
          ownerNonce: ownerNoncePda,
          memory: badMemory,
          systemProgram: SystemProgram.programId,
        })
        .signers([restrictedKey])
        .rpc();
      assert.fail("expected scope not granted error");
    } catch (err) {
      assert.match(String(err), /Scope not granted/);
    }
  });

  it("spends SOL budget with the session key", async () => {
    await budgetEscrow.methods
      .createBudget(new BN(1_000_000_000))
      .accounts({
        owner: owner.publicKey,
        budget: budgetPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc();

    await budgetEscrow.methods
      .spendWithSession(new BN(1_000_000), new BN(0))
      .accounts({
        sessionKey: sessionKey.publicKey,
        owner: owner.publicKey,
        session: sessionPda,
        ownerNonce: ownerNoncePda,
        budget: budgetPda,
      })
      .signers([sessionKey])
      .rpc();

    const budget = await budgetEscrow.account.budget.fetch(budgetPda);
    assert.equal(budget.balance.toNumber(), 999_000_000);
    assert.equal(budget.spent.toNumber(), 1_000_000);
  });

  it("rejects a session spend that exceeds the per-tx cap", async () => {
    try {
      await budgetEscrow.methods
        .spendWithSession(new BN(10_000_000), new BN(0))
        .accounts({
          sessionKey: sessionKey.publicKey,
          owner: owner.publicKey,
          session: sessionPda,
          ownerNonce: ownerNoncePda,
          budget: budgetPda,
        })
        .signers([sessionKey])
        .rpc();
      assert.fail("expected per-tx cap error");
    } catch (err) {
      assert.match(String(err), /Session spend per tx exceeded/);
    }
  });

  it("deposits SPL tokens with the session key", async () => {
    const mint = await createMint(
      provider.connection,
      owner,
      owner.publicKey,
      null,
      9
    );
    const sessionKeyAta = await createAssociatedTokenAccount(
      provider.connection,
      owner,
      mint,
      sessionKey.publicKey
    );
    await mintTo(
      provider.connection,
      owner,
      mint,
      sessionKeyAta,
      owner,
      1_000_000_000
    );

    const tokenBudgetPda = PublicKey.findProgramAddressSync(
      [
        Buffer.from("token_budget"),
        owner.publicKey.toBuffer(),
        mint.toBuffer(),
      ],
      budgetEscrow.programId
    )[0];
    const vault = getAssociatedTokenAddressSync(mint, tokenBudgetPda, true);

    await budgetEscrow.methods
      .depositTokenWithSession(new BN(100_000_000), new BN(0))
      .accounts({
        sessionKey: sessionKey.publicKey,
        owner: owner.publicKey,
        session: sessionPda,
        ownerNonce: ownerNoncePda,
        mint,
        tokenBudget: tokenBudgetPda,
        from: sessionKeyAta,
        vault,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([sessionKey])
      .rpc();

    const tokenBudget = await budgetEscrow.account.tokenBudget.fetch(
      tokenBudgetPda
    );
    assert.equal(tokenBudget.balance.toNumber(), 100_000_000);

    const vaultAccount = await getAccount(provider.connection, vault);
    assert.equal(Number(vaultAccount.amount), 100_000_000);
  });

  it("routes a royalty with the session key", async () => {
    const payee = Keypair.generate();
    const receiptPda = PublicKey.findProgramAddressSync(
      [
        Buffer.from("receipt"),
        owner.publicKey.toBuffer(),
        payee.publicKey.toBuffer(),
        contentHash.subarray(0, 8),
      ],
      royaltyRouter.programId
    )[0];

    await royaltyRouter.methods
      .routeRoyaltyWithSession(new BN(500_000), contentHash, new BN(0))
      .accounts({
        sessionKey: sessionKey.publicKey,
        owner: owner.publicKey,
        payee: payee.publicKey,
        session: sessionPda,
        ownerNonce: ownerNoncePda,
        receipt: receiptPda,
        budget: budgetPda,
        budgetEscrowProgram: budgetEscrow.programId,
        systemProgram: SystemProgram.programId,
      })
      .signers([sessionKey])
      .rpc();

    const receipt = await royaltyRouter.account.receipt.fetch(receiptPda);
    assert.equal(receipt.amount.toNumber(), 500_000);
    assert.equal(receipt.payer.toBase58(), owner.publicKey.toBase58());
    assert.equal(receipt.payee.toBase58(), payee.publicKey.toBase58());
  });

  it("revokes all sessions via pauseAllSessions", async () => {
    await capabilityRegistry.methods
      .pauseAllSessions()
      .accounts({
        owner: owner.publicKey,
        ownerNonce: ownerNoncePda,
      })
      .signers([owner])
      .rpc();

    try {
      await budgetEscrow.methods
        .spendWithSession(new BN(1_000), new BN(0))
        .accounts({
          sessionKey: sessionKey.publicKey,
          owner: owner.publicKey,
          session: sessionPda,
          ownerNonce: ownerNoncePda,
          budget: budgetPda,
        })
        .signers([sessionKey])
        .rpc();
      assert.fail("expected owner nonce mismatch error");
    } catch (err) {
      assert.match(String(err), /Owner nonce mismatch/);
    }
  });
});
