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

const TREASURY_SEED = Buffer.from("treasury");

function deriveTreasuryPda(
  authority: PublicKey,
  programId: PublicKey
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [TREASURY_SEED, authority.toBuffer()],
    programId
  )[0];
}

function deriveVault(
  mint: PublicKey,
  treasuryPda: PublicKey,
  tokenProgramId: PublicKey = TOKEN_PROGRAM_ID
): PublicKey {
  return getAssociatedTokenAddressSync(
    mint,
    treasuryPda,
    true,
    tokenProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
}

describe("cortex_treasury", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.CortexTreasury;
  const authority = Keypair.generate();

  let mint: PublicKey;
  let authorityAta: PublicKey;
  let wrongMint: PublicKey;
  let wrongMintAta: PublicKey;
  let treasuryPda: PublicKey;
  let vault: PublicKey;

  before(async () => {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        authority.publicKey,
        2 * LAMPORTS_PER_SOL
      )
    );

    mint = await createMint(provider.connection, authority, authority.publicKey, null, 6);
    wrongMint = await createMint(
      provider.connection,
      authority,
      authority.publicKey,
      null,
      6
    );

    authorityAta = await createAssociatedTokenAccount(
      provider.connection,
      authority,
      mint,
      authority.publicKey
    );
    wrongMintAta = await createAssociatedTokenAccount(
      provider.connection,
      authority,
      wrongMint,
      authority.publicKey
    );

    await mintTo(
      provider.connection,
      authority,
      mint,
      authorityAta,
      authority,
      1_000_000_000
    );
    await mintTo(
      provider.connection,
      authority,
      wrongMint,
      wrongMintAta,
      authority,
      1_000_000_000
    );

    treasuryPda = deriveTreasuryPda(authority.publicKey, program.programId);
    vault = deriveVault(mint, treasuryPda, TOKEN_PROGRAM_ID);
  });

  it("initializes the treasury with a mint", async () => {
    await program.methods
      .initialize()
      .accounts({
        authority: authority.publicKey,
        mint,
        treasury: treasuryPda,
        vault,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    const treasury = await program.account.treasury.fetch(treasuryPda);
    assert.equal(treasury.authority.toBase58(), authority.publicKey.toBase58());
    assert.equal(treasury.mint.toBase58(), mint.toBase58());
  });

  it("deposits SPL tokens into the treasury vault", async () => {
    const authorityBefore = await getAccount(provider.connection, authorityAta);
    const vaultBefore = await getAccount(provider.connection, vault);

    await program.methods
      .deposit(new BN(300_000_000))
      .accounts({
        authority: authority.publicKey,
        mint,
        treasury: treasuryPda,
        authorityAta,
        vault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([authority])
      .rpc();

    const authorityAfter = await getAccount(provider.connection, authorityAta);
    const vaultAfter = await getAccount(provider.connection, vault);

    assert.equal(
      Number(authorityBefore.amount) - Number(authorityAfter.amount),
      300_000_000
    );
    assert.equal(Number(vaultAfter.amount) - Number(vaultBefore.amount), 300_000_000);
  });

  it("withdraws SPL tokens to an authority-approved recipient", async () => {
    const recipient = Keypair.generate();
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(recipient.publicKey, 0.1 * LAMPORTS_PER_SOL)
    );
    const recipientAta = await createAssociatedTokenAccount(
      provider.connection,
      authority,
      mint,
      recipient.publicKey
    );

    const vaultBefore = await getAccount(provider.connection, vault);
    const recipientBefore = await getAccount(provider.connection, recipientAta);

    await program.methods
      .withdraw(new BN(100_000_000))
      .accounts({
        authority: authority.publicKey,
        mint,
        treasury: treasuryPda,
        vault,
        recipientAta,
        recipient: recipient.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([authority])
      .rpc();

    const vaultAfter = await getAccount(provider.connection, vault);
    const recipientAfter = await getAccount(provider.connection, recipientAta);

    assert.equal(Number(vaultBefore.amount) - Number(vaultAfter.amount), 100_000_000);
    assert.equal(
      Number(recipientAfter.amount) - Number(recipientBefore.amount),
      100_000_000
    );
  });

  it("rejects an unauthorized withdraw", async () => {
    const thief = Keypair.generate();
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(thief.publicKey, 0.5 * LAMPORTS_PER_SOL)
    );
    const thiefAta = await createAssociatedTokenAccount(
      provider.connection,
      thief,
      mint,
      thief.publicKey
    );

    try {
      await program.methods
        .withdraw(new BN(1))
        .accounts({
          authority: thief.publicKey,
          mint,
          treasury: treasuryPda,
          vault,
          recipientAta: thiefAta,
          recipient: thief.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([thief])
        .rpc();
      assert.fail("expected unauthorized error");
    } catch (err) {
      assert.match(String(err), /Unauthorized|seeds|Constraint|owner/);
    }
  });

  it("rejects a withdraw exceeding vault balance", async () => {
    const recipient = Keypair.generate();
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(recipient.publicKey, 0.1 * LAMPORTS_PER_SOL)
    );
    const recipientAta = await createAssociatedTokenAccount(
      provider.connection,
      authority,
      mint,
      recipient.publicKey
    );

    try {
      await program.methods
        .withdraw(new BN(10_000_000_000))
        .accounts({
          authority: authority.publicKey,
          mint,
          treasury: treasuryPda,
          vault,
          recipientAta,
          recipient: recipient.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([authority])
        .rpc();
      assert.fail("expected insufficient funds error");
    } catch (err) {
      assert.match(String(err), /Insufficient funds|custom program error/);
    }
  });

  it("rejects a deposit with the wrong mint", async () => {
    const wrongVault = deriveVault(wrongMint, treasuryPda, TOKEN_PROGRAM_ID);
    try {
      await program.methods
        .deposit(new BN(1_000_000))
        .accounts({
          authority: authority.publicKey,
          mint: wrongMint,
          treasury: treasuryPda,
          authorityAta: wrongMintAta,
          vault: wrongVault,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([authority])
        .rpc();
      assert.fail("expected invalid mint error");
    } catch (err) {
      assert.match(String(err), /Invalid mint|Constraint|mint|vault/);
    }
  });

  it("rejects zero-amount deposit", async () => {
    try {
      await program.methods
        .deposit(new BN(0))
        .accounts({
          authority: authority.publicKey,
          mint,
          treasury: treasuryPda,
          authorityAta,
          vault,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([authority])
        .rpc();
      assert.fail("expected invalid amount error");
    } catch (err) {
      assert.match(String(err), /Invalid amount/);
    }
  });

  it("rejects zero-amount withdraw", async () => {
    const recipient = Keypair.generate();
    const recipientAta = await createAssociatedTokenAccount(
      provider.connection,
      authority,
      mint,
      recipient.publicKey
    );

    try {
      await program.methods
        .withdraw(new BN(0))
        .accounts({
          authority: authority.publicKey,
          mint,
          treasury: treasuryPda,
          vault,
          recipientAta,
          recipient: recipient.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([authority])
        .rpc();
      assert.fail("expected invalid amount error");
    } catch (err) {
      assert.match(String(err), /Invalid amount/);
    }
  });
});
