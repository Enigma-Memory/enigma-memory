use anchor_lang::prelude::*;

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
        Ok(())
    }

    pub fn deposit(ctx: Context<MutBudget>, amount: u64) -> Result<()> {
        require_eq!(ctx.accounts.budget.owner, ctx.accounts.owner.key());
        ctx.accounts.budget.balance = ctx.accounts.budget.balance.checked_add(amount).unwrap();
        Ok(())
    }

    pub fn spend(ctx: Context<MutBudget>, amount: u64) -> Result<()> {
        require_eq!(ctx.accounts.budget.owner, ctx.accounts.owner.key());
        require!(ctx.accounts.budget.balance >= amount, BudgetError::InsufficientFunds);
        ctx.accounts.budget.balance -= amount;
        ctx.accounts.budget.spent += amount;
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

#[error_code]
pub enum BudgetError {
    #[msg("Insufficient funds")]
    InsufficientFunds,
}
