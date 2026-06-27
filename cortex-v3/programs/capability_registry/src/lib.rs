use anchor_lang::prelude::*;

declare_id!("CiDwVBFgWV9E5MvXWoLgnEgn2hK7rJikbvfWavzAQz3");

#[program]
pub mod capability_registry {
    use super::*;

    pub fn grant(ctx: Context<GrantCapability>, scope: String, expires_at: i64) -> Result<()> {
        require!(scope.len() <= 64, CapError::ScopeTooLong);
        let cap = &mut ctx.accounts.capability;
        cap.owner = ctx.accounts.owner.key();
        cap.granted_to = ctx.accounts.granted_to.key();
        cap.scope = scope;
        cap.expires_at = expires_at;
        cap.created_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    pub fn revoke(ctx: Context<RevokeCapability>) -> Result<()> {
        require_eq!(ctx.accounts.capability.owner, ctx.accounts.owner.key());
        Ok(())
    }

    pub fn create_memory(ctx: Context<CreateMemory>, content_hash: [u8; 32]) -> Result<()> {
        let cpi_accounts = memory_registry::cpi::accounts::RegisterMemory {
            owner: ctx.accounts.owner.to_account_info(),
            memory: ctx.accounts.memory.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(
            ctx.accounts.memory_registry_program.to_account_info(),
            cpi_accounts,
        );
        memory_registry::cpi::create_memory(cpi_ctx, content_hash)?;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(scope: String, expires_at: i64)]
pub struct GrantCapability<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: granted_to is stored as a pubkey only
    pub granted_to: AccountInfo<'info>,
    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + Capability::SIZE,
        seeds = [b"capability", owner.key().as_ref(), granted_to.key().as_ref(), scope.as_bytes()],
        bump
    )]
    pub capability: Account<'info, Capability>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevokeCapability<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut, close = owner, seeds = [b"capability", owner.key().as_ref(), capability.granted_to.as_ref(), capability.scope.as_bytes()], bump = capability.bump)]
    pub capability: Account<'info, Capability>,
}

#[account]
pub struct Capability {
    pub owner: Pubkey,
    pub granted_to: Pubkey,
    pub scope: String,
    pub expires_at: i64,
    pub created_at: i64,
    pub bump: u8,
}

impl Capability {
    pub const SIZE: usize = 32 + 32 + (4 + 64) + 8 + 8 + 1;
}

#[error_code]
pub enum CapError {
    #[msg("Scope too long")]
    ScopeTooLong,
}

#[derive(Accounts)]
#[instruction(content_hash: [u8; 32])]
pub struct CreateMemory<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: memory account is initialized by the memory_registry CPI
    #[account(mut)]
    pub memory: AccountInfo<'info>,
    pub memory_registry_program: Program<'info, memory_registry::program::MemoryRegistry>,
    pub system_program: Program<'info, System>,
}

