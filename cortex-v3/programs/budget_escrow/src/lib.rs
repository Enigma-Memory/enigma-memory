use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

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
        ctx.accounts.budget.balance = ctx.accounts.budget.balance.checked_add(amount).unwrap();
        Ok(())
    }

    pub fn spend(ctx: Context<MutBudget>, amount: u64) -> Result<()> {
        require_eq!(ctx.accounts.budget.owner, ctx.accounts.owner.key());
        require!(
            ctx.accounts.budget.balance >= amount,
            BudgetError::InsufficientFunds
        );
        ctx.accounts.budget.balance -= amount;
        ctx.accounts.budget.spent += amount;
        Ok(())
    }

    pub fn deposit_token(ctx: Context<DepositToken>, amount: u64) -> Result<()> {
        let token_budget = &mut ctx.accounts.token_budget;
        token_budget.owner = ctx.accounts.owner.key();
        token_budget.mint = ctx.accounts.mint.key();
        token_budget.bump = ctx.bumps.token_budget;

        let cpi_accounts = Transfer {
            from: ctx.accounts.owner_ata.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        token_budget.balance = token_budget.balance.checked_add(amount).unwrap();
        Ok(())
    }

    pub fn spend_token(ctx: Context<SpendToken>, amount: u64) -> Result<()> {
        require_eq!(ctx.accounts.token_budget.owner, ctx.accounts.owner.key());
        require!(
            ctx.accounts.token_budget.balance >= amount,
            BudgetError::InsufficientFunds
        );
        ctx.accounts.token_budget.balance -= amount;
        ctx.accounts.token_budget.spent += amount;
        Ok(())
    }
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
#[instruction(amount: u64)]
pub struct DepositToken<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub mint: Account<'info, Mint>,
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
        associated_token::authority = owner
    )]
    pub owner_ata: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = mint,
        associated_token::authority = token_budget
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SpendToken<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds = [b"token_budget", owner.key().as_ref(), mint.key().as_ref()],
        bump = token_budget.bump
    )]
    pub token_budget: Account<'info, TokenBudget>,
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
}

