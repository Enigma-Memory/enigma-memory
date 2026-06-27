use anchor_lang::prelude::*;

declare_id!("GcdayuLaLyrdmUu324nahyv33G5poQdLUEZ1nEytDeP");

#[program]
pub mod royalty_router {
    use super::*;

    pub fn register_receipt(
        ctx: Context<RegisterReceipt>,
        amount: u64,
        content_hash: [u8; 32],
    ) -> Result<()> {
        let receipt = &mut ctx.accounts.receipt;
        receipt.payer = ctx.accounts.payer.key();
        receipt.payee = ctx.accounts.payee.key();
        receipt.amount = amount;
        receipt.content_hash = content_hash;
        receipt.created_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    pub fn route_royalty(
        ctx: Context<RouteRoyalty>,
        amount: u64,
        content_hash: [u8; 32],
    ) -> Result<()> {
        let cpi_accounts = budget_escrow::cpi::accounts::MutBudget {
            owner: ctx.accounts.payer.to_account_info(),
            budget: ctx.accounts.budget.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(
            ctx.accounts.budget_escrow_program.to_account_info(),
            cpi_accounts,
        );
        budget_escrow::cpi::spend(cpi_ctx, amount)?;

        write_receipt(&mut ctx.accounts.receipt, &ctx.accounts.payer, &ctx.accounts.payee, amount, content_hash, ctx.bumps.receipt)
    }

    pub fn route_royalty_with_session(
        ctx: Context<RouteRoyaltyWithSession>,
        amount: u64,
        content_hash: [u8; 32],
        nonce: u64,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        capability_registry::session::require_session_active(
            &ctx.accounts.session,
            &ctx.accounts.owner_nonce,
            &ctx.accounts.owner.key(),
            &ctx.accounts.session_key.key(),
            capability_registry::ROYALTY_ROUTE,
            now,
        )?;

        let cpi_accounts = budget_escrow::cpi::accounts::SpendWithSession {
            session_key: ctx.accounts.session_key.to_account_info(),
            owner: ctx.accounts.owner.to_account_info(),
            session: ctx.accounts.session.to_account_info(),
            owner_nonce: ctx.accounts.owner_nonce.to_account_info(),
            capability_registry_program: ctx.accounts.capability_registry_program.to_account_info(),
            budget: ctx.accounts.budget.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(
            ctx.accounts.budget_escrow_program.to_account_info(),
            cpi_accounts,
        );
        budget_escrow::cpi::spend_with_session(cpi_ctx, amount, nonce)?;

        write_receipt(
            &mut ctx.accounts.receipt,
            &ctx.accounts.owner,
            &ctx.accounts.payee,
            amount,
            content_hash,
            ctx.bumps.receipt,
        )
    }
}

fn write_receipt(
    receipt: &mut Account<Receipt>,
    payer: &AccountInfo,
    payee: &AccountInfo,
    amount: u64,
    content_hash: [u8; 32],
    bump: u8,
) -> Result<()> {
    receipt.payer = payer.key();
    receipt.payee = payee.key();
    receipt.amount = amount;
    receipt.content_hash = content_hash;
    receipt.created_at = Clock::get()?.unix_timestamp;
    receipt.bump = bump;
    Ok(())
}

#[derive(Accounts)]
#[instruction(amount: u64, content_hash: [u8; 32])]
pub struct RegisterReceipt<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: payee is stored as a pubkey only
    pub payee: AccountInfo<'info>,
    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + Receipt::SIZE,
        seeds = [b"receipt", payer.key().as_ref(), payee.key().as_ref(), &content_hash[..8]],
        bump
    )]
    pub receipt: Account<'info, Receipt>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(amount: u64, content_hash: [u8; 32])]
pub struct RouteRoyalty<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: payee is stored as a pubkey only
    pub payee: AccountInfo<'info>,
    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + Receipt::SIZE,
        seeds = [b"receipt", payer.key().as_ref(), payee.key().as_ref(), &content_hash[..8]],
        bump
    )]
    pub receipt: Account<'info, Receipt>,
    #[account(
        mut,
        seeds = [b"budget", payer.key().as_ref()],
        bump = budget.bump,
        seeds::program = budget_escrow_program.key()
    )]
    pub budget: Account<'info, budget_escrow::Budget>,
    pub budget_escrow_program: Program<'info, budget_escrow::program::BudgetEscrow>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(amount: u64, content_hash: [u8; 32], nonce: u64)]
pub struct RouteRoyaltyWithSession<'info> {
    #[account(mut)]
    pub session_key: Signer<'info>,
    /// CHECK: user wallet owner referenced by the session PDA
    pub owner: AccountInfo<'info>,
    /// CHECK: payee is stored as a pubkey only
    pub payee: AccountInfo<'info>,
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
        space = 8 + Receipt::SIZE,
        seeds = [b"receipt", owner.key().as_ref(), payee.key().as_ref(), &content_hash[..8]],
        bump
    )]
    pub receipt: Account<'info, Receipt>,
    #[account(
        mut,
        seeds = [b"budget", owner.key().as_ref()],
        bump = budget.bump,
        seeds::program = budget_escrow_program.key()
    )]
    pub budget: Account<'info, budget_escrow::Budget>,
    pub budget_escrow_program: Program<'info, budget_escrow::program::BudgetEscrow>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Receipt {
    pub payer: Pubkey,
    pub payee: Pubkey,
    pub amount: u64,
    pub content_hash: [u8; 32],
    pub created_at: i64,
    pub bump: u8,
}

impl Receipt {
    pub const SIZE: usize = 32 + 32 + 8 + 32 + 8 + 1;
}
