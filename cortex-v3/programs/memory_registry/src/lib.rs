use anchor_lang::prelude::*;

declare_id!("4uQeVj5tqViQh7yWWGStvkEG1Zmhx6uasJtWCJziofM");

#[program]
pub mod memory_registry {
    use super::*;

    pub fn register_memory(ctx: Context<RegisterMemory>, content_hash: [u8; 32]) -> Result<()> {
        init_memory(
            &mut ctx.accounts.memory,
            &ctx.accounts.owner.to_account_info(),
            content_hash,
        )
    }

    pub fn create_memory(ctx: Context<RegisterMemory>, content_hash: [u8; 32]) -> Result<()> {
        init_memory(
            &mut ctx.accounts.memory,
            &ctx.accounts.owner.to_account_info(),
            content_hash,
        )
    }

    pub fn update_memory(ctx: Context<UpdateMemory>, new_hash: [u8; 32]) -> Result<()> {
        require_eq!(ctx.accounts.memory.owner, ctx.accounts.owner.key());
        ctx.accounts.memory.content_hash = new_hash;
        ctx.accounts.memory.updated_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    pub fn set_shareable(
        ctx: Context<UpdateMemory>,
        shareable: bool,
        royalty_bps: u16,
    ) -> Result<()> {
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

    pub fn create_memory_with_session(
        ctx: Context<CreateMemoryWithSession>,
        content_hash: [u8; 32],
        _nonce: u64,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        capability_registry::session::require_session_active(
            &ctx.accounts.session,
            &ctx.accounts.owner_nonce,
            &ctx.accounts.owner.key(),
            &ctx.accounts.session_key.key(),
            capability_registry::MEMORY_CREATE,
            now,
        )?;
        capability_registry::session::touch_session(
            &mut ctx.accounts.session,
            now,
        )?;
        init_memory(
            &mut ctx.accounts.memory,
            &ctx.accounts.owner,
            content_hash,
        )
    }

    pub fn update_memory_with_session(
        ctx: Context<UpdateMemoryWithSession>,
        new_hash: [u8; 32],
        _nonce: u64,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        capability_registry::session::require_session_active(
            &ctx.accounts.session,
            &ctx.accounts.owner_nonce,
            &ctx.accounts.owner.key(),
            &ctx.accounts.session_key.key(),
            capability_registry::MEMORY_UPDATE,
            now,
        )?;
        capability_registry::session::touch_session(
            &mut ctx.accounts.session,
            now,
        )?;
        require_eq!(ctx.accounts.memory.owner, ctx.accounts.owner.key());
        ctx.accounts.memory.content_hash = new_hash;
        ctx.accounts.memory.updated_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    pub fn delete_memory_with_session(
        ctx: Context<DeleteMemoryWithSession>,
        _nonce: u64,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        capability_registry::session::require_session_active(
            &ctx.accounts.session,
            &ctx.accounts.owner_nonce,
            &ctx.accounts.owner.key(),
            &ctx.accounts.session_key.key(),
            capability_registry::MEMORY_DELETE,
            now,
        )?;
        capability_registry::session::touch_session(
            &mut ctx.accounts.session,
            now,
        )?;
        require_eq!(ctx.accounts.memory.owner, ctx.accounts.owner.key());
        Ok(())
    }
}

fn init_memory(
    memory: &mut Account<'_ , Memory>,
    owner: &AccountInfo,
    content_hash: [u8; 32],
) -> Result<()> {
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

#[derive(Accounts)]
#[instruction(content_hash: [u8; 32], nonce: u64)]
pub struct CreateMemoryWithSession<'info> {
    #[account(mut)]
    pub session_key: Signer<'info>,
    /// CHECK: user wallet owner referenced by the session PDA
    #[account(mut)]
    pub owner: AccountInfo<'info>,
    #[account(
        mut,
        seeds = [b"session", owner.key().as_ref(), session_key.key().as_ref(), nonce.to_le_bytes().as_ref()],
        bump = session.bump,
        seeds::program = capability_registry_program.key(),
        constraint = session.nonce == nonce
    )]
    pub session: Account<'info, capability_registry::Session>,
    #[account(
        seeds = [b"owner_nonce", owner.key().as_ref()],
        bump = owner_nonce.bump,
        seeds::program = capability_registry_program.key()
    )]
    pub owner_nonce: Account<'info, capability_registry::OwnerNonce>,
    pub capability_registry_program: Program<'info, capability_registry::program::CapabilityRegistry>,
    #[account(
        init_if_needed,
        payer = session_key,
        space = 8 + Memory::SIZE,
        seeds = [b"memory", owner.key().as_ref(), &content_hash[..8]],
        bump
    )]
    pub memory: Account<'info, Memory>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(new_hash: [u8; 32], nonce: u64)]
pub struct UpdateMemoryWithSession<'info> {
    #[account(mut)]
    pub session_key: Signer<'info>,
    /// CHECK: user wallet owner referenced by the session PDA
    pub owner: AccountInfo<'info>,
    #[account(
        mut,
        seeds = [b"session", owner.key().as_ref(), session_key.key().as_ref(), nonce.to_le_bytes().as_ref()],
        bump = session.bump,
        seeds::program = capability_registry_program.key(),
        constraint = session.nonce == nonce
    )]
    pub session: Account<'info, capability_registry::Session>,
    #[account(
        seeds = [b"owner_nonce", owner.key().as_ref()],
        bump = owner_nonce.bump,
        seeds::program = capability_registry_program.key()
    )]
    pub owner_nonce: Account<'info, capability_registry::OwnerNonce>,
    pub capability_registry_program: Program<'info, capability_registry::program::CapabilityRegistry>,
    #[account(mut, has_one = owner)]
    pub memory: Account<'info, Memory>,
}

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct DeleteMemoryWithSession<'info> {
    #[account(mut)]
    pub session_key: Signer<'info>,
    /// CHECK: user wallet owner referenced by the session PDA
    #[account(mut)]
    pub owner: AccountInfo<'info>,
    #[account(
        mut,
        seeds = [b"session", owner.key().as_ref(), session_key.key().as_ref(), nonce.to_le_bytes().as_ref()],
        bump = session.bump,
        seeds::program = capability_registry_program.key(),
        constraint = session.nonce == nonce
    )]
    pub session: Account<'info, capability_registry::Session>,
    #[account(
        seeds = [b"owner_nonce", owner.key().as_ref()],
        bump = owner_nonce.bump,
        seeds::program = capability_registry_program.key()
    )]
    pub owner_nonce: Account<'info, capability_registry::OwnerNonce>,
    pub capability_registry_program: Program<'info, capability_registry::program::CapabilityRegistry>,
    #[account(mut, close = owner, has_one = owner)]
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
