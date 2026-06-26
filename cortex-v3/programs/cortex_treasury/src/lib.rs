use anchor_lang::prelude::*;

declare_id!("LX3EUdRUBUa3TbsYXLEUdj9J3prXkWXvLYSWyYyc2Jj");

#[program]
pub mod cortex_treasury {
    use super::*;

    pub fn initialize(ctx: Context<InitializeTreasury>) -> Result<()> {
        let treasury = &mut ctx.accounts.treasury;
        treasury.authority = ctx.accounts.authority.key();
        treasury.balance = 0;
        treasury.created_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    pub fn deposit(ctx: Context<MutTreasury>, amount: u64) -> Result<()> {
        ctx.accounts.treasury.balance = ctx.accounts.treasury.balance.checked_add(amount).unwrap();
        Ok(())
    }

    pub fn withdraw(ctx: Context<MutTreasury>, amount: u64) -> Result<()> {
        require_eq!(ctx.accounts.treasury.authority, ctx.accounts.authority.key());
        require!(ctx.accounts.treasury.balance >= amount, TreasuryError::InsufficientFunds);
        ctx.accounts.treasury.balance -= amount;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeTreasury<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + Treasury::SIZE,
        seeds = [b"treasury", authority.key().as_ref()],
        bump
    )]
    pub treasury: Account<'info, Treasury>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MutTreasury<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut, seeds = [b"treasury", authority.key().as_ref()], bump = treasury.bump)]
    pub treasury: Account<'info, Treasury>,
}

#[account]
pub struct Treasury {
    pub authority: Pubkey,
    pub balance: u64,
    pub created_at: i64,
    pub bump: u8,
}

impl Treasury {
    pub const SIZE: usize = 32 + 8 + 8 + 1;
}

#[error_code]
pub enum TreasuryError {
    #[msg("Insufficient funds")]
    InsufficientFunds,
}
