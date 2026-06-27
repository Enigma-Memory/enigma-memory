use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self as token_program, Mint, Token, TokenAccount, Transfer as TokenTransfer};
use anchor_spl::token_interface::{
    self as token_interface, Mint as InterfaceMint, TokenAccount as InterfaceTokenAccount,
    TokenInterface, TransferChecked,
};

declare_id!("8opHzTAnfzRpPEx21XtnrVTX28YQuCpAjcn1PczScKh");

#[program]
pub mod budget_escrow {
    use super::*;

    pub fn create_budget(ctx: Context<CreateBudget>, amount: u64) -> Result<()> {
        let budget = &mut ctx.accounts.budget;
        budget.owner = ctx.accounts.owner.key();
        budget.balance = amount;
        budget.spent = 0;
        budget.created_at = Clock::get()?.unix_timestamp;
        budget.bump = ctx.bumps.budget;
        Ok(())
    }

    pub fn deposit(ctx: Context<MutBudget>, amount: u64) -> Result<()> {
        require_eq!(ctx.accounts.budget.owner, ctx.accounts.owner.key());
        ctx.accounts.budget.balance = ctx
            .accounts
            .budget
            .balance
            .checked_add(amount)
            .ok_or(BudgetError::MathOverflow)?;
        Ok(())
    }

    pub fn spend(ctx: Context<MutBudget>, amount: u64) -> Result<()> {
        spend_budget(
            &mut ctx.accounts.budget,
            &ctx.accounts.owner.to_account_info(),
            amount,
        )
    }

    pub fn create_token_budget(ctx: Context<CreateTokenBudget>) -> Result<()> {
        let token_budget = &mut ctx.accounts.token_budget;
        require!(
            token_budget.owner == Pubkey::default(),
            BudgetError::AlreadyInitialized
        );
        token_budget.owner = ctx.accounts.owner.key();
        token_budget.mint = ctx.accounts.mint.key();
        token_budget.balance = 0;
        token_budget.spent = 0;
        token_budget.bump = ctx.bumps.token_budget;
        Ok(())
    }

    pub fn deposit_token(ctx: Context<DepositToken>, amount: u64) -> Result<()> {
        require!(amount > 0, BudgetError::InvalidAmount);

        let token_budget = &mut ctx.accounts.token_budget;
        if token_budget.owner == Pubkey::default() {
            token_budget.owner = ctx.accounts.owner.key();
            token_budget.mint = ctx.accounts.mint.key();
            token_budget.bump = ctx.bumps.token_budget;
        } else {
            require_eq!(
                token_budget.owner,
                ctx.accounts.owner.key(),
                BudgetError::InvalidOwner
            );
            require_eq!(
                token_budget.mint,
                ctx.accounts.mint.key(),
                BudgetError::InvalidMint
            );
        }

        let cpi_accounts = TransferChecked {
            from: ctx.accounts.owner_ata.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
        );
        token_interface::transfer_checked(cpi_ctx, amount, ctx.accounts.mint.decimals)?;

        token_budget.balance = token_budget
            .balance
            .checked_add(amount)
            .ok_or(BudgetError::MathOverflow)?;
        Ok(())
    }

    pub fn spend_token(ctx: Context<SpendToken>, amount: u64) -> Result<()> {
        require!(amount > 0, BudgetError::InvalidAmount);
        require_eq!(
            ctx.accounts.token_budget.owner,
            ctx.accounts.owner.key(),
            BudgetError::InvalidOwner
        );
        require_eq!(
            ctx.accounts.token_budget.mint,
            ctx.accounts.mint.key(),
            BudgetError::InvalidMint
        );
        require!(
            ctx.accounts.token_budget.balance >= amount,
            BudgetError::InsufficientFunds
        );

        let owner_key = ctx.accounts.owner.key();
        let mint_key = ctx.accounts.mint.key();
        let seeds = &[
            b"token_budget",
            owner_key.as_ref(),
            mint_key.as_ref(),
            &[ctx.accounts.token_budget.bump],
        ];
        let signer = &[&seeds[..]];

        let cpi_accounts = TransferChecked {
            from: ctx.accounts.vault.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.owner_ata.to_account_info(),
            authority: ctx.accounts.token_budget.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer,
        );
        token_interface::transfer_checked(cpi_ctx, amount, ctx.accounts.mint.decimals)?;

        ctx.accounts.token_budget.balance = ctx
            .accounts
            .token_budget
            .balance
            .checked_sub(amount)
            .ok_or(BudgetError::MathOverflow)?;
        ctx.accounts.token_budget.spent = ctx
            .accounts
            .token_budget
            .spent
            .checked_add(amount)
            .ok_or(BudgetError::MathOverflow)?;
        Ok(())
    }

    pub fn spend_with_session(
        ctx: Context<SpendWithSession>,
        amount: u64,
        _nonce: u64,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        capability_registry::session::require_session_active(
            &ctx.accounts.session,
            &ctx.accounts.owner_nonce,
            &ctx.accounts.owner.key(),
            &ctx.accounts.session_key.key(),
            capability_registry::BUDGET_SPEND,
            now,
        )?;
        capability_registry::session::touch_session(&mut ctx.accounts.session, now)?;
        capability_registry::session::check_spend(&ctx.accounts.session, amount)?;
        capability_registry::session::record_spend(&mut ctx.accounts.session, amount);
        spend_budget(&mut ctx.accounts.budget, &ctx.accounts.owner, amount)
    }

    pub fn deposit_token_with_session(
        ctx: Context<DepositTokenWithSession>,
        amount: u64,
        _nonce: u64,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        capability_registry::session::require_session_active(
            &ctx.accounts.session,
            &ctx.accounts.owner_nonce,
            &ctx.accounts.owner.key(),
            &ctx.accounts.session_key.key(),
            0,
            now,
        )?;
        capability_registry::session::touch_session(&mut ctx.accounts.session, now)?;

        let token_budget = &mut ctx.accounts.token_budget;
        token_budget.owner = ctx.accounts.owner.key();
        token_budget.mint = ctx.accounts.mint.key();
        token_budget.bump = ctx.bumps.token_budget;

        let cpi_accounts = TokenTransfer {
            from: ctx.accounts.from.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.session_key.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
        );
        token_program::transfer(cpi_ctx, amount)?;

        token_budget.balance = token_budget
            .balance
            .checked_add(amount)
            .ok_or(BudgetError::MathOverflow)?;
        Ok(())
    }
}

fn spend_budget(
    budget: &mut Account<Budget>,
    owner: &AccountInfo,
    amount: u64,
) -> Result<()> {
    require_eq!(budget.owner, owner.key());
    require!(
        budget.balance >= amount,
        BudgetError::InsufficientFunds
    );
    budget.balance = budget
        .balance
        .checked_sub(amount)
        .ok_or(BudgetError::MathOverflow)?;
    budget.spent = budget
        .spent
        .checked_add(amount)
        .ok_or(BudgetError::MathOverflow)?;
    Ok(())
}

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct CreateBudget<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + Budget::SIZE,
        seeds = [b"budget", owner.key().as_ref()],
        bump
    )]
    pub budget: Account<'info, Budget>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MutBudget<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut, seeds = [b"budget", owner.key().as_ref()], bump = budget.bump)]
    pub budget: Account<'info, Budget>,
}

#[derive(Accounts)]
pub struct CreateTokenBudget<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub mint: InterfaceAccount<'info, InterfaceMint>,
    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + TokenBudget::SIZE,
        seeds = [b"token_budget", owner.key().as_ref(), mint.key().as_ref()],
        bump
    )]
    pub token_budget: Account<'info, TokenBudget>,
    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = mint,
        associated_token::authority = token_budget,
        associated_token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, InterfaceTokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct DepositToken<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub mint: InterfaceAccount<'info, InterfaceMint>,
    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + TokenBudget::SIZE,
        seeds = [b"token_budget", owner.key().as_ref(), mint.key().as_ref()],
        bump
    )]
    pub token_budget: Account<'info, TokenBudget>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = owner,
        associated_token::token_program = token_program
    )]
    pub owner_ata: InterfaceAccount<'info, InterfaceTokenAccount>,
    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = mint,
        associated_token::authority = token_budget,
        associated_token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, InterfaceTokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SpendToken<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub mint: InterfaceAccount<'info, InterfaceMint>,
    #[account(
        mut,
        seeds = [b"token_budget", owner.key().as_ref(), mint.key().as_ref()],
        bump = token_budget.bump
    )]
    pub token_budget: Account<'info, TokenBudget>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = owner,
        associated_token::token_program = token_program
    )]
    pub owner_ata: InterfaceAccount<'info, InterfaceTokenAccount>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = token_budget,
        associated_token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, InterfaceTokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(amount: u64, nonce: u64)]
pub struct SpendWithSession<'info> {
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
    #[account(mut, seeds = [b"budget", owner.key().as_ref()], bump = budget.bump)]
    pub budget: Account<'info, Budget>,
}

#[derive(Accounts)]
#[instruction(amount: u64, nonce: u64)]
pub struct DepositTokenWithSession<'info> {
    #[account(mut)]
    pub session_key: Signer<'info>,
    /// CHECK: user wallet owner referenced by the session PDA
    pub owner: AccountInfo<'info>,
    #[account(
        mut,
        seeds = [b"session", owner.key().as_ref(), session_key.key().as_ref(), nonce.to_le_bytes().as_ref()],
        bump = session.bump,
        constraint = session.nonce == nonce
    )]
    pub session: Account<'info, capability_registry::Session>,
    #[account(
        seeds = [b"owner_nonce", owner.key().as_ref()],
        bump = owner_nonce.bump
    )]
    pub owner_nonce: Account<'info, capability_registry::OwnerNonce>,
    pub mint: Account<'info, Mint>,
    #[account(
        init_if_needed,
        payer = session_key,
        space = 8 + TokenBudget::SIZE,
        seeds = [b"token_budget", owner.key().as_ref(), mint.key().as_ref()],
        bump
    )]
    pub token_budget: Account<'info, TokenBudget>,
    #[account(
        mut,
        constraint = from.owner == session_key.key() && from.mint == mint.key()
    )]
    pub from: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = session_key,
        associated_token::mint = mint,
        associated_token::authority = token_budget
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Budget {
    pub owner: Pubkey,
    pub balance: u64,
    pub spent: u64,
    pub created_at: i64,
    pub bump: u8,
}

impl Budget {
    pub const SIZE: usize = 32 + 8 + 8 + 8 + 1;
}

#[account]
pub struct TokenBudget {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub balance: u64,
    pub spent: u64,
    pub bump: u8,
}

impl TokenBudget {
    pub const SIZE: usize = 32 + 32 + 8 + 8 + 1;
}

#[error_code]
pub enum BudgetError {
    #[msg("Insufficient funds")]
    InsufficientFunds,
    #[msg("Invalid owner")]
    InvalidOwner,
    #[msg("Invalid mint")]
    InvalidMint,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Token budget already initialized")]
    AlreadyInitialized,
}
