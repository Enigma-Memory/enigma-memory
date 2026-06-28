use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{
    self as token_interface, Mint as InterfaceMint, TokenAccount as InterfaceTokenAccount,
    TokenInterface, TransferChecked,
};

declare_id!("LX3EUdRUBUa3TbsYXLEUdj9J3prXkWXvLYSWyYyc2Jj");

#[program]
pub mod cortex_treasury {
    use super::*;

    pub fn initialize(ctx: Context<InitializeTreasury>) -> Result<()> {
        let treasury = &mut ctx.accounts.treasury;

        if treasury.authority == Pubkey::default() {
            treasury.authority = ctx.accounts.authority.key();
            treasury.mint = ctx.accounts.mint.key();
            treasury.vault = ctx.accounts.vault.key();
            treasury.bump = ctx.bumps.treasury;
        } else {
            require_eq!(
                treasury.authority,
                ctx.accounts.authority.key(),
                TreasuryError::Unauthorized
            );
            require_eq!(
                treasury.mint,
                ctx.accounts.mint.key(),
                TreasuryError::InvalidMint
            );
            require_eq!(
                treasury.vault,
                ctx.accounts.vault.key(),
                TreasuryError::InvalidMint
            );
        }

        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, TreasuryError::InvalidAmount);

        let cpi_accounts = TransferChecked {
            from: ctx.accounts.authority_ata.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
        );
        token_interface::transfer_checked(cpi_ctx, amount, ctx.accounts.mint.decimals)?;

        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        require!(amount > 0, TreasuryError::InvalidAmount);
        require!(
            ctx.accounts.vault.amount >= amount,
            TreasuryError::InsufficientFunds
        );

        let authority_key = ctx.accounts.authority.key();
        let seeds = &[
            b"treasury",
            authority_key.as_ref(),
            &[ctx.accounts.treasury.bump],
        ];
        let signer = &[&seeds[..]];

        let cpi_accounts = TransferChecked {
            from: ctx.accounts.vault.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.recipient_ata.to_account_info(),
            authority: ctx.accounts.treasury.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer,
        );
        token_interface::transfer_checked(cpi_ctx, amount, ctx.accounts.mint.decimals)?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeTreasury<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    pub mint: InterfaceAccount<'info, InterfaceMint>,
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + Treasury::SIZE,
        seeds = [b"treasury", authority.key().as_ref()],
        bump
    )]
    pub treasury: Account<'info, Treasury>,
    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = treasury,
        associated_token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, InterfaceTokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    pub mint: InterfaceAccount<'info, InterfaceMint>,
    #[account(
        mut,
        seeds = [b"treasury", authority.key().as_ref()],
        bump = treasury.bump,
        has_one = authority,
        has_one = mint,
        has_one = vault
    )]
    pub treasury: Account<'info, Treasury>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = authority,
        associated_token::token_program = token_program
    )]
    pub authority_ata: InterfaceAccount<'info, InterfaceTokenAccount>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = treasury,
        associated_token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, InterfaceTokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    pub mint: InterfaceAccount<'info, InterfaceMint>,
    #[account(
        mut,
        seeds = [b"treasury", authority.key().as_ref()],
        bump = treasury.bump,
        has_one = authority,
        has_one = mint,
        has_one = vault
    )]
    pub treasury: Account<'info, Treasury>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = treasury,
        associated_token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, InterfaceTokenAccount>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = recipient,
        associated_token::token_program = token_program
    )]
    pub recipient_ata: InterfaceAccount<'info, InterfaceTokenAccount>,
    /// CHECK: recipient is only used to validate the associated token account
    pub recipient: AccountInfo<'info>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[account]
pub struct Treasury {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub bump: u8,
}

impl Treasury {
    pub const SIZE: usize = 32 + 32 + 32 + 1;
}

#[error_code]
pub enum TreasuryError {
    #[msg("Insufficient funds")]
    InsufficientFunds,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Invalid mint")]
    InvalidMint,
    #[msg("Unauthorized")]
    Unauthorized,
}
