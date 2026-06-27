use anchor_lang::prelude::*;

declare_id!("4uQeVj5tqViQh7yWWGStvkEG1Zmhx6uasJtWCJziofM");

#[program]
pub mod memory_registry {
    use super::*;

    pub fn register_memory(ctx: Context<RegisterMemory>, content_hash: [u8; 32]) -> Result<()> {
        init_memory(&mut ctx.accounts.memory, &ctx.accounts.owner, content_hash)
    }

    pub fn create_memory(ctx: Context<RegisterMemory>, content_hash: [u8; 32]) -> Result<()> {
        init_memory(&mut ctx.accounts.memory, &ctx.accounts.owner, content_hash)
    }

    pub fn update_memory(ctx: Context<UpdateMemory>, new_hash: [u8; 32]) -> Result<()> {
        require_eq!(ctx.accounts.memory.owner, ctx.accounts.owner.key());
        ctx.accounts.memory.content_hash = new_hash;
        ctx.accounts.memory.updated_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    pub fn set_shareable(ctx: Context<UpdateMemory>, shareable: bool, royalty_bps: u16) -> Result<()> {
        require_eq!(ctx.accounts.memory.owner, ctx.accounts.owner.key());
        require!(royalty_bps <= 10_000, MemoryError::RoyaltyTooHigh);
        ctx.accounts.memory.shareable = shareable;
        ctx.accounts.memory.royalty_bps = royalty_bps;
        Ok(())
    }

    pub fn delete_memory(ctx: Context<DeleteMemory>) -> Result<()> {
        require_eq!(ctx.accounts.memory.owner, ctx.accounts.owner.key());
        Ok(())
    }
}

fn init_memory(memory: &mut Account<'_, Memory>, owner: &Signer, content_hash: [u8; 32]) -> Result<()> {
    memory.owner = owner.key();
    memory.content_hash = content_hash;
    memory.created_at = Clock::get()?.unix_timestamp;
    memory.updated_at = memory.created_at;
    memory.shareable = false;
    memory.royalty_bps = 0;
    Ok(())
}

#[derive(Accounts)]
#[instruction(content_hash: [u8; 32])]
pub struct RegisterMemory<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + Memory::SIZE,
        seeds = [b"memory", owner.key().as_ref(), &content_hash[..8]],
        bump
    )]
    pub memory: Account<'info, Memory>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateMemory<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut, seeds = [b"memory", owner.key().as_ref(), &memory.content_hash[..8]], bump = memory.bump)]
    pub memory: Account<'info, Memory>,
}

#[derive(Accounts)]
pub struct DeleteMemory<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut, close = owner, seeds = [b"memory", owner.key().as_ref(), &memory.content_hash[..8]], bump = memory.bump)]
    pub memory: Account<'info, Memory>,
}

#[account]
pub struct Memory {
    pub owner: Pubkey,
    pub content_hash: [u8; 32],
    pub created_at: i64,
    pub updated_at: i64,
    pub shareable: bool,
    pub royalty_bps: u16,
    pub bump: u8,
}

impl Memory {
    pub const SIZE: usize = 32 + 32 + 8 + 8 + 1 + 2 + 1;
}

#[error_code]
pub enum MemoryError {
    #[msg("Royalty too high")]
    RoyaltyTooHigh,
}

