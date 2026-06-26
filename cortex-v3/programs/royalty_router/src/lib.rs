use anchor_lang::prelude::*;

declare_id!("GcdayuLaLyrdmUu324nahyv33G5poQdLUEZ1nEytDeP");

#[program]
pub mod royalty_router {
    use super::*;

    pub fn register_receipt(ctx: Context<RegisterReceipt>, amount: u64, content_hash: [u8; 32]) -> Result<()> {
        let receipt = &mut ctx.accounts.receipt;
        receipt.payer = ctx.accounts.payer.key();
        receipt.payee = ctx.accounts.payee.key();
        receipt.amount = amount;
        receipt.content_hash = content_hash;
        receipt.created_at = Clock::get()?.unix_timestamp;
        Ok(())
    }
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
