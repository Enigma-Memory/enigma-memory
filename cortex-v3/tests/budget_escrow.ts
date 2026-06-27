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
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { assert } from "chai";

const BUDGET_SEED = Buffer.from("budget");
const TOKEN_BUDGET_SEED = Buffer.from("token_budget");

function deriveBudgetPda(owner: PublicKey, programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [BUDGET_SEED, owner.toBuffer()],
    programId
  )[0];
}

function deriveTokenBudgetPda(
  owner: PublicKey,
  mint: PublicKey,
  programId: PublicKey
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [TOKEN_BUDGET_SEED, owner.toBuffer(), mint.toBuffer()],
    programId
  )[0];
}

function deriveVault(
  mint: PublicKey,
  tokenBudgetPda: PublicKey,
  tokenProgramId: PublicKey = TOKEN_PROGRAM_ID
): PublicKey {
  return getAssociatedTokenAddressSync(
    mint,
    tokenBudgetPda,
    true,
    tokenProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
}

async function createFundedWallet(
  provider: anchor.AnchorProvider,
  solAmount: number = 2
): Promise<Keypair> {
  const wallet = Keypair.generate();
  await provider.connection.confirmTransaction(
    await provider.connection.requestAirdrop(
      wallet.publicKey,
      solAmount * LAMPORTS_PER_SOL
    )
  );
  return wallet;
}

async function createTokenMint(
  provider: anchor.AnchorProvider,
  authority: Keypair,
  decimals: number = 6,
  tokenProgramId: PublicKey = TOKEN_PROGRAM_ID
): Promise<PublicKey> {
  return createMint(
    provider.connection,
    authority,
    authority.publicKey,
    null,
    decimals,
    Keypair.generate(),
    undefined,
    tokenProgramId
  );
}

async function createOwnerAta(
  provider: anchor.AnchorProvider,
  owner: Keypair,
  mint: PublicKey,
  tokenProgramId: PublicKey = TOKEN_PROGRAM_ID
): Promise<PublicKey> {
  return createAssociatedTokenAccount(
    provider.connection,
    owner,
    mint,
    owner.publicKey,
    undefined,
    tokenProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
}

async function fundAta(
  provider: anchor.AnchorProvider,
  authority: Keypair,
  mint: PublicKey,
  ata: PublicKey,
  amount: number,
  tokenProgramId: PublicKey = TOKEN_PROGRAM_ID
): Promise<void> {
  await mintTo(
    provider.connection,
    authority,
    mint,
    ata,
    authority,
    amount,
    [],
    undefined,
    tokenProgramId
  );
}

describe("budget_escrow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.BudgetEscrow;
  const owner = Keypair.generate();

  const budgetPda = deriveBudgetPda(owner.publicKey, program.programId);

  let mint: PublicKey;
  let ownerAta: PublicKey;
  let tokenBudgetPda: PublicKey;
  let vault: PublicKey;

  before(async () => {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        owner.publicKey,
        2 * LAMPORTS_PER_SOL
      )
    );

    mint = await createTokenMint(provider, owner, 6, TOKEN_PROGRAM_ID);
    ownerAta = await createOwnerAta(provider, owner, mint, TOKEN_PROGRAM_ID);
    await fundAta(
      provider,
      owner,
      mint,
      ownerAta,
      1_000_000_000,
      TOKEN_PROGRAM_ID
    );

    tokenBudgetPda = deriveTokenBudgetPda(
      owner.publicKey,
      mint,
      program.programId
    );
    vault = deriveVault(mint, tokenBudgetPda, TOKEN_PROGRAM_ID);
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

  it("Creates a token budget (ATA helper)", async () => {
    await program.methods
      .createTokenBudget()
      .accounts({
        owner: owner.publicKey,
        mint,
        tokenBudget: tokenBudgetPda,
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
    assert.equal(tokenBudget.balance.toNumber(), 0);
    assert.equal(tokenBudget.spent.toNumber(), 0);

    const vaultAccount = await getAccount(provider.connection, vault);
    assert.equal(Number(vaultAccount.amount), 0);
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
    assert.equal(tokenBudget.balance.toNumber(), 250_000_000);
    assert.equal(tokenBudget.spent.toNumber(), 0);

    const vaultAccount = await getAccount(provider.connection, vault);
    assert.equal(Number(vaultAccount.amount), 250_000_000);
  });

  it("Spends SPL tokens and transfers them back", async () => {
    const ownerAtaBefore = await getAccount(provider.connection, ownerAta);

    await program.methods
      .spendToken(new BN(50_000_000))
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
    assert.equal(tokenBudget.balance.toNumber(), 200_000_000);
    assert.equal(tokenBudget.spent.toNumber(), 50_000_000);

    const vaultAccount = await getAccount(provider.connection, vault);
    assert.equal(Number(vaultAccount.amount), 200_000_000);

    const ownerAtaAfter = await getAccount(provider.connection, ownerAta);
    assert.equal(
      Number(ownerAtaAfter.amount) - Number(ownerAtaBefore.amount),
      50_000_000
    );
  });

  it("Rejects token spend exceeding balance", async () => {
    try {
      await program.methods
        .spendToken(new BN(1_000_000_000))
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
      assert.fail("expected insufficient funds error");
    } catch (err) {
      assert.match(String(err), /Insufficient funds/);
    }
  });

  it("Rejects zero-amount token deposit", async () => {
    try {
      await program.methods
        .depositToken(new BN(0))
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
      assert.fail("expected invalid amount error");
    } catch (err) {
      assert.match(String(err), /Invalid amount/);
    }
  });

  it("Works with Token-2022", async () => {
    const t2022Owner = await createFundedWallet(provider, 2);
    const t2022Mint = await createTokenMint(
      provider,
      t2022Owner,
      6,
      TOKEN_2022_PROGRAM_ID
    );
    const t2022OwnerAta = await createOwnerAta(
      provider,
      t2022Owner,
      t2022Mint,
      TOKEN_2022_PROGRAM_ID
    );
    await fundAta(
      provider,
      t2022Owner,
      t2022Mint,
      t2022OwnerAta,
      500_000_000,
      TOKEN_2022_PROGRAM_ID
    );

    const t2022BudgetPda = deriveTokenBudgetPda(
      t2022Owner.publicKey,
      t2022Mint,
      program.programId
    );
    const t2022Vault = deriveVault(
      t2022Mint,
      t2022BudgetPda,
      TOKEN_2022_PROGRAM_ID
    );

    await program.methods
      .depositToken(new BN(300_000_000))
      .accounts({
        owner: t2022Owner.publicKey,
        mint: t2022Mint,
        tokenBudget: t2022BudgetPda,
        ownerAta: t2022OwnerAta,
        vault: t2022Vault,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([t2022Owner])
      .rpc();

    let tokenBudget = await program.account.tokenBudget.fetch(t2022BudgetPda);
    assert.equal(tokenBudget.balance.toNumber(), 300_000_000);

    await program.methods
      .spendToken(new BN(100_000_000))
      .accounts({
        owner: t2022Owner.publicKey,
        mint: t2022Mint,
        tokenBudget: t2022BudgetPda,
        ownerAta: t2022OwnerAta,
        vault: t2022Vault,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([t2022Owner])
      .rpc();

    tokenBudget = await program.account.tokenBudget.fetch(t2022BudgetPda);
    assert.equal(tokenBudget.balance.toNumber(), 200_000_000);
    assert.equal(tokenBudget.spent.toNumber(), 100_000_000);

    const vaultAccount = await getAccount(
      provider.connection,
      t2022Vault,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    assert.equal(Number(vaultAccount.amount), 200_000_000);
  });
});
