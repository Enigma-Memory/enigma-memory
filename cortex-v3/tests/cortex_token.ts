import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  createMint,
} from "@solana/spl-token";
import { assert } from "chai";

describe("cortex_token", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.CortexToken;
  const payer = provider.wallet as anchor.Wallet;

  const mintAuthority = PublicKey.findProgramAddressSync(
    [Buffer.from("mint_authority")],
    program.programId
  )[0];

  const treasuryAuthority = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury_authority")],
    program.programId
  )[0];

  let mint: PublicKey;
  let treasury: PublicKey;
  const user = Keypair.generate();
  let payerAta: PublicKey;
  let userAta: PublicKey;

  before(async () => {
    mint = await createMint(
      provider.connection,
      payer.payer,
      mintAuthority,
      null,
      9
    );
    let mintInfo = await provider.connection.getAccountInfo(mint);
    console.log("after createMint mint owner", mintInfo?.owner.toBase58(), "lamports", mintInfo?.lamports);

    treasury = getAssociatedTokenAddressSync(mint, treasuryAuthority, true);
    payerAta = getAssociatedTokenAddressSync(mint, payer.publicKey);
    userAta = getAssociatedTokenAddressSync(mint, user.publicKey);

    await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer.payer,
      mint,
      treasuryAuthority,
      true
    );
    await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer.payer,
      mint,
      payer.publicKey
    );
    await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer.payer,
      mint,
      user.publicKey
    );

    mintInfo = await provider.connection.getAccountInfo(mint);
    console.log("after ATAs mint owner", mintInfo?.owner.toBase58(), "lamports", mintInfo?.lamports);
    const treasuryInfo = await provider.connection.getAccountInfo(treasury);
    console.log("after ATAs treasury owner", treasuryInfo?.owner.toBase58(), "lamports", treasuryInfo?.lamports);

    await program.methods
      .initializeMint()
      .accounts({
        payer: payer.publicKey,
        mint,
        mintAuthority,
        treasury,
        treasuryAuthority,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    await program.methods
      .mintToTreasury(new BN(10_000))
      .accounts({
        mint,
        treasury,
        mintAuthority,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
  });

  it("Initializes the SAL mint", async () => {
    const mintAccount = await program.account.mint.fetch(mint);
    assert.equal(mintAccount.decimals, 9);
  });

  it("Mints SAL to the treasury", async () => {
    await program.methods
      .mintToTreasury(new BN(1_000_000_000))
      .accounts({
        mint: mint,
        treasury,
        mintAuthority,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
  });

  it("Transfers SAL between users", async () => {
    await program.methods
      .transfer(new BN(100))
      .accounts({
        from: payer.publicKey,
        fromAta: payerAta,
        toAta: userAta,
        to: user.publicKey,
        mint: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
  });

  it("Stakes SAL for veSAL", async () => {
    const nonce = new BN(0);
    const stakePda = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stake"),
        user.publicKey.toBuffer(),
        nonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    )[0];

    const stakeVaultAuthority = PublicKey.findProgramAddressSync(
      [Buffer.from("stake_vault_authority")],
      program.programId
    )[0];
    const stakeVault = getAssociatedTokenAddressSync(
      mint,
      stakeVaultAuthority,
      true
    );

    await program.methods
      .stakeForVesal(nonce, new BN(500))
      .accounts({
        owner: user.publicKey,
        mint: mint,
        stake: stakePda,
        ownerAta: userAta,
        stakeVault,
        stakeVaultAuthority,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();

    const stake = await program.account.stakeEntry.fetch(stakePda);
    assert.equal(stake.amount.toNumber(), 500);
  });

  it("Locks a stake as veSAL", async () => {
    const nonce = new BN(0);
    const stakePda = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stake"),
        user.publicKey.toBuffer(),
        nonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    )[0];
    const vesalPda = PublicKey.findProgramAddressSync(
      [
        Buffer.from("vesal"),
        user.publicKey.toBuffer(),
        stakePda.toBuffer(),
      ],
      program.programId
    )[0];

    await program.methods
      .lockVesal(new BN(86_400))
      .accounts({
        owner: user.publicKey,
        stake: stakePda,
        vesal: vesalPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();
  });

  it("Votes on a proposal", async () => {
    const nonce = new BN(0);
    const stakePda = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stake"),
        user.publicKey.toBuffer(),
        nonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    )[0];
    const vesalPda = PublicKey.findProgramAddressSync(
      [
        Buffer.from("vesal"),
        user.publicKey.toBuffer(),
        stakePda.toBuffer(),
      ],
      program.programId
    )[0];
    const proposalId = new BN(1);
    const proposalPda = PublicKey.findProgramAddressSync(
      [
        Buffer.from("proposal"),
        user.publicKey.toBuffer(),
        proposalId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    )[0];
    const voteReceiptPda = PublicKey.findProgramAddressSync(
      [
        Buffer.from("vote"),
        proposalPda.toBuffer(),
        user.publicKey.toBuffer(),
      ],
      program.programId
    )[0];

    await program.methods
      .createProposal(proposalId)
      .accounts({
        proposer: user.publicKey,
        proposal: proposalPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();

    await program.methods
      .vote(1)
      .accounts({
        voter: user.publicKey,
        stake: stakePda,
        vesal: vesalPda,
        proposal: proposalPda,
        voteReceipt: voteReceiptPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();

    const proposal = await program.account.proposal.fetch(proposalPda);
    assert.equal(proposal.yesVotes.toNumber(), 500);
  });
});
