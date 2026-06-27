use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount, Transfer};

declare_id!("EqV3aLfvqNycQzofXVLxsry8WMMfZX8WmomYNUBskZSb");

#[program]
pub mod cortex_token {
    use super::*;


    /// Mint SAL into the program treasury.
    pub fn mint_to_treasury(ctx: Context<MintToTreasury>, amount: u64) -> Result<()> {
        let bump = ctx.bumps.mint_authority;
        let binding = [bump];
        let seeds: &[&[u8]] = &[b"mint_authority".as_ref(), binding.as_slice()];
        let signer: &[&[&[u8]]] = &[seeds];

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.treasury.to_account_info(),
                authority: ctx.accounts.mint_authority.to_account_info(),
            },
            signer,
        );

        token::mint_to(cpi_ctx, amount)?;
        Ok(())
    }

    /// Standard SPL-token transfer between user ATAs.
    pub fn transfer(ctx: Context<TransferTokens>, amount: u64) -> Result<()> {
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.from_ata.to_account_info(),
                to: ctx.accounts.to_ata.to_account_info(),
                authority: ctx.accounts.from.to_account_info(),
            },
        );

        token::transfer(cpi_ctx, amount)?;
        Ok(())
    }

    /// Stake SAL into a program-controlled vault and record a StakeEntry.
    pub fn stake_for_vesal(
        ctx: Context<StakeForVesal>,
        nonce: u64,
        amount: u64,
    ) -> Result<()> {
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.owner_ata.to_account_info(),
                to: ctx.accounts.stake_vault.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        );

        token::transfer(cpi_ctx, amount)?;

        let stake = &mut ctx.accounts.stake;
        stake.owner = ctx.accounts.owner.key();
        stake.mint = ctx.accounts.mint.key();
        stake.amount = amount;
        stake.nonce = nonce;
        stake.bump = ctx.bumps.stake;
        Ok(())
    }

    /// Lock a StakeEntry as veSAL for a fixed duration.
    pub fn lock_vesal(ctx: Context<LockVesal>, duration_secs: i64) -> Result<()> {
        let clock = Clock::get()?;
        let vesal = &mut ctx.accounts.vesal;
        vesal.owner = ctx.accounts.owner.key();
        vesal.stake = ctx.accounts.stake.key();
        vesal.amount = ctx.accounts.stake.amount;
        vesal.lock_start = clock.unix_timestamp;
        vesal.lock_end = clock
            .unix_timestamp
            .checked_add(duration_secs)
            .ok_or(TokenError::Overflow)?;
        vesal.bump = ctx.bumps.vesal;
        Ok(())
    }

    /// Create a governance proposal (simplified).
    pub fn create_proposal(ctx: Context<CreateProposal>, id: u64) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        proposal.proposer = ctx.accounts.proposer.key();
        proposal.id = id;
        proposal.yes_votes = 0;
        proposal.no_votes = 0;
        proposal.bump = ctx.bumps.proposal;
        Ok(())
    }

    /// Vote on a proposal using the caller's active veSAL balance.
    pub fn vote(ctx: Context<Vote>, side: u8) -> Result<()> {
        require!(side == 0 || side == 1, TokenError::InvalidVoteSide);
        require!(ctx.accounts.vote_receipt.weight == 0, TokenError::AlreadyVoted);

        let clock = Clock::get()?;
        require!(
            ctx.accounts.vesal.lock_end > clock.unix_timestamp,
            TokenError::LockupNotActive
        );

        let weight = ctx.accounts.vesal.amount;
        let proposal = &mut ctx.accounts.proposal;
        if side == 1 {
            proposal.yes_votes = proposal.yes_votes.checked_add(weight).ok_or(TokenError::Overflow)?;
        } else {
            proposal.no_votes = proposal.no_votes.checked_add(weight).ok_or(TokenError::Overflow)?;
        }

        let receipt = &mut ctx.accounts.vote_receipt;
        receipt.voter = ctx.accounts.voter.key();
        receipt.proposal = ctx.accounts.proposal.key();
        receipt.weight = weight;
        receipt.side = side;
        receipt.bump = ctx.bumps.vote_receipt;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct MintToTreasury<'info> {
    #[account(mut)]
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub treasury: Account<'info, TokenAccount>,
    #[account(
        seeds = [b"mint_authority"],
        bump
    )]
    pub mint_authority: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct TransferTokens<'info> {
    #[account(mut)]
    pub from: Signer<'info>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = from
    )]
    pub from_ata: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = to
    )]
    pub to_ata: Account<'info, TokenAccount>,
    /// CHECK: recipient is only used as an ATA authority check.
    pub to: UncheckedAccount<'info>,
    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(nonce: u64, amount: u64)]
pub struct StakeForVesal<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        payer = owner,
        space = 8 + StakeEntry::SIZE,
        seeds = [b"stake", owner.key().as_ref(), nonce.to_le_bytes().as_ref()],
        bump
    )]
    pub stake: Account<'info, StakeEntry>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = owner
    )]
    pub owner_ata: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = mint,
        associated_token::authority = stake_vault_authority
    )]
    pub stake_vault: Account<'info, TokenAccount>,
    #[account(
        seeds = [b"stake_vault_authority"],
        bump
    )]
    pub stake_vault_authority: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct LockVesal<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [b"stake", owner.key().as_ref(), stake.nonce.to_le_bytes().as_ref()],
        bump = stake.bump,
        has_one = owner
    )]
    pub stake: Account<'info, StakeEntry>,
    #[account(
        init,
        payer = owner,
        space = 8 + VeSal::SIZE,
        seeds = [b"vesal", owner.key().as_ref(), stake.key().as_ref()],
        bump
    )]
    pub vesal: Account<'info, VeSal>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(id: u64)]
pub struct CreateProposal<'info> {
    #[account(mut)]
    pub proposer: Signer<'info>,
    #[account(
        init,
        payer = proposer,
        space = 8 + Proposal::SIZE,
        seeds = [b"proposal", proposer.key().as_ref(), id.to_le_bytes().as_ref()],
        bump
    )]
    pub proposal: Account<'info, Proposal>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(side: u8)]
pub struct Vote<'info> {
    #[account(mut)]
    pub voter: Signer<'info>,
    #[account(
        mut,
        seeds = [b"stake", voter.key().as_ref(), stake.nonce.to_le_bytes().as_ref()],
        constraint = stake.owner == voter.key(),
        bump = stake.bump
    )]
    pub stake: Account<'info, StakeEntry>,
    #[account(
        seeds = [b"vesal", voter.key().as_ref(), stake.key().as_ref()],
        bump = vesal.bump,
        has_one = stake
    )]
    pub vesal: Account<'info, VeSal>,
    #[account(mut)]
    pub proposal: Account<'info, Proposal>,
    #[account(
        init_if_needed,
        payer = voter,
        space = 8 + VoteReceipt::SIZE,
        seeds = [b"vote", proposal.key().as_ref(), voter.key().as_ref()],
        bump
    )]
    pub vote_receipt: Account<'info, VoteReceipt>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct StakeEntry {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub nonce: u64,
    pub bump: u8,
}

impl StakeEntry {
    pub const SIZE: usize = 32 + 32 + 8 + 8 + 1;
}

#[account]
pub struct VeSal {
    pub owner: Pubkey,
    pub stake: Pubkey,
    pub amount: u64,
    pub lock_start: i64,
    pub lock_end: i64,
    pub bump: u8,
}

impl VeSal {
    pub const SIZE: usize = 32 + 32 + 8 + 8 + 8 + 1;
}

#[account]
pub struct Proposal {
    pub proposer: Pubkey,
    pub id: u64,
    pub yes_votes: u64,
    pub no_votes: u64,
    pub bump: u8,
}

impl Proposal {
    pub const SIZE: usize = 32 + 8 + 8 + 8 + 1;
}

#[account]
pub struct VoteReceipt {
    pub voter: Pubkey,
    pub proposal: Pubkey,
    pub weight: u64,
    pub side: u8,
    pub bump: u8,
}

impl VoteReceipt {
    pub const SIZE: usize = 32 + 32 + 8 + 1 + 1;
}

#[error_code]
pub enum TokenError {
    #[msg("Invalid vote side")]
    InvalidVoteSide,
    #[msg("Already voted")]
    AlreadyVoted,
    #[msg("Lockup not active")]
    LockupNotActive,
    #[msg("Arithmetic overflow")]
    Overflow,
}
