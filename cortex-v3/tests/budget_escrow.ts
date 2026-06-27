import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { assert } from "chai";

describe("budget_escrow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.BudgetEscrow;
  const owner = Keypair.generate();

  const tokenBudgetSeed = Buffer.from("token_budget");
  const budgetSeed = Buffer.from("budget");

  const budgetPda = PublicKey.findProgramAddressSync(
    [budgetSeed, owner.publicKey.toBuffer()],
    program.programId
  )[0];

  let mint: PublicKey;
  let ownerAta: PublicKey;
  let tokenBudgetPda: PublicKey;
  let vault: PublicKey;

  before(async () => {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(owner.publicKey, 2 * LAMPORTS_PER_SOL)
    );

    mint = await createMint(
      provider.connection,
      owner,
      owner.publicKey,
      null,
      6
    );

    ownerAta = await createAssociatedTokenAccount(
      provider.connection,
      owner,
      mint,
      owner.publicKey
    );

    await mintTo(
      provider.connection,
      owner,
      mint,
      ownerAta,
      owner,
      1_000_000_000
    );

    tokenBudgetPda = PublicKey.findProgramAddressSync(
      [tokenBudgetSeed, owner.publicKey.toBuffer(), mint.toBuffer()],
      program.programId
    )[0];

    vault = getAssociatedTokenAddressSync(
      mint,
      tokenBudgetPda,
      true,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
  });

  it("Creates a native SOL budget", async () => {
    await program.methods
      .createBudget(new BN(0))
      .accounts({
        owner: owner.publicKey,
        budget: budgetPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc();

    const budget = await program.account.budget.fetch(budgetPda);
    assert.equal(budget.owner.toBase58(), owner.publicKey.toBase58());
    assert.equal(budget.balance.toNumber(), 0);
    assert.equal(budget.spent.toNumber(), 0);
  });

  it("Deposits native SOL", async () => {
    await program.methods
      .deposit(new BN(500_000_000))
      .accounts({
        owner: owner.publicKey,
        budget: budgetPda,
      })
      .signers([owner])
      .rpc();

    const budget = await program.account.budget.fetch(budgetPda);
    assert.equal(budget.balance.toNumber(), 500_000_000);
  });

  it("Spends native SOL", async () => {
    await program.methods
      .spend(new BN(100_000_000))
      .accounts({
        owner: owner.publicKey,
        budget: budgetPda,
      })
      .signers([owner])
      .rpc();

    const budget = await program.account.budget.fetch(budgetPda);
    assert.equal(budget.balance.toNumber(), 400_000_000);
    assert.equal(budget.spent.toNumber(), 100_000_000);
  });

  it("Deposits SPL tokens", async () => {
    await program.methods
      .depositToken(new BN(250_000_000))
      .accounts({
        owner: owner.publicKey,
        mint,
        tokenBudget: tokenBudgetPda,
        ownerAta,
        vault,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc();

    const tokenBudget = await program.account.tokenBudget.fetch(tokenBudgetPda);
    assert.equal(tokenBudget.owner.toBase58(), owner.publicKey.toBase58());
    assert.equal(tokenBudget.mint.toBase58(), mint.toBase58());
    assert.equal(tokenBudget.balance.toNumber(), 250_000_000);
    assert.equal(tokenBudget.spent.toNumber(), 0);

    const vaultAccount = await getAccount(provider.connection, vault);
    assert.equal(Number(vaultAccount.amount), 250_000_000);
  });

  it("Spends SPL tokens", async () => {
    await program.methods
      .spendToken(new BN(50_000_000))
      .accounts({
        owner: owner.publicKey,
        mint,
        tokenBudget: tokenBudgetPda,
      })
      .signers([owner])
      .rpc();

    const tokenBudget = await program.account.tokenBudget.fetch(tokenBudgetPda);
    assert.equal(tokenBudget.balance.toNumber(), 200_000_000);
    assert.equal(tokenBudget.spent.toNumber(), 50_000_000);
  });

  it("Rejects token spend exceeding balance", async () => {
    try {
      await program.methods
        .spendToken(new BN(1_000_000_000))
        .accounts({
          owner: owner.publicKey,
          mint,
          tokenBudget: tokenBudgetPda,
        })
        .signers([owner])
        .rpc();
      assert.fail("expected insufficient funds error");
    } catch (err) {
      assert.match(String(err), /Insufficient funds/);
    }
  });
});
