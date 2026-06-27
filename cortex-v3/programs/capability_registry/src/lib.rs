use anchor_lang::prelude::*;

declare_id!("CiDwVBFgWV9E5MvXWoLgnEgn2hK7rJikbvfWavzAQz3");

pub const MEMORY_CREATE: u32 = 1 << 0;
pub const MEMORY_UPDATE: u32 = 1 << 1;
pub const MEMORY_DELETE: u32 = 1 << 2;
pub const BUDGET_SPEND: u32 = 1 << 3;
pub const ROYALTY_ROUTE: u32 = 1 << 4;
pub const CAPABILITY_REVOKE_SELF: u32 = 1 << 5;

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

    pub fn create_session(
        ctx: Context<CreateSession>,
        scope: u32,
        categories_hash: [u8; 32],
        max_spend_per_tx: u64,
        max_spend_per_day: u64,
        max_ops_per_day: u32,
        expires_at: i64,
    ) -> Result<()> {
        let owner_nonce = &mut ctx.accounts.owner_nonce;
        let session = &mut ctx.accounts.session;
        let now = Clock::get()?.unix_timestamp;

        session.owner = ctx.accounts.owner.key();
        session.session_key = ctx.accounts.session_key.key();
        session.nonce = 0;
        session.owner_nonce = owner_nonce.nonce;
        session.scope = scope;
        session.categories_hash = categories_hash;
        session.max_spend_per_tx = max_spend_per_tx;
        session.max_spend_per_day = max_spend_per_day;
        session.spent_today = 0;
        session.max_ops_per_day = max_ops_per_day;
        session.ops_today = 0;
        session.window_start = now;
        session.expires_at = expires_at;
        session.revoked = false;
        session.bump = ctx.bumps.session;

        owner_nonce.owner = ctx.accounts.owner.key();
        owner_nonce.bump = ctx.bumps.owner_nonce;
        Ok(())
    }

    pub fn extend_session(
        ctx: Context<ExtendSession>,
        scope: Option<u32>,
        categories_hash: Option<[u8; 32]>,
        max_spend_per_tx: Option<u64>,
        max_spend_per_day: Option<u64>,
        max_ops_per_day: Option<u32>,
        expires_at: i64,
    ) -> Result<()> {
        let session = &mut ctx.accounts.session;
        require_eq!(
            session.owner,
            ctx.accounts.owner.key(),
            CapError::SessionOwnerMismatch
        );
        if let Some(s) = scope {
            session.scope = s;
        }
        if let Some(c) = categories_hash {
            session.categories_hash = c;
        }
        if let Some(m) = max_spend_per_tx {
            session.max_spend_per_tx = m;
        }
        if let Some(m) = max_spend_per_day {
            session.max_spend_per_day = m;
        }
        if let Some(m) = max_ops_per_day {
            session.max_ops_per_day = m;
        }
        session.expires_at = expires_at;
        Ok(())
    }

    pub fn revoke_session(ctx: Context<RevokeSession>) -> Result<()> {
        require_eq!(
            ctx.accounts.session.owner,
            ctx.accounts.owner.key(),
            CapError::SessionOwnerMismatch
        );
        Ok(())
    }

    pub fn pause_all_sessions(ctx: Context<PauseAllSessions>) -> Result<()> {
        ctx.accounts.owner_nonce.nonce = ctx
            .accounts
            .owner_nonce
            .nonce
            .checked_add(1)
            .unwrap();
        Ok(())
    }
}

pub mod session {
    use super::*;

    pub fn require_session_active(
        session: &Session,
        owner_nonce: &OwnerNonce,
        owner: &Pubkey,
        session_key: &Pubkey,
        scope: u32,
        now: i64,
    ) -> Result<()> {
        require_eq!(session.owner, *owner, CapError::SessionOwnerMismatch);
        require_eq!(
            session.session_key,
            *session_key,
            CapError::SessionKeyMismatch
        );
        require!(!session.revoked, CapError::SessionRevoked);
        require!(session.expires_at > now, CapError::SessionExpired);
        if scope != 0 {
            require!(session.scope & scope != 0, CapError::ScopeNotGranted);
        }
        require_eq!(
            session.owner_nonce,
            owner_nonce.nonce,
            CapError::OwnerNonceMismatch
        );
        Ok(())
    }

    pub fn touch_session(session: &mut Session, now: i64) -> Result<()> {
        const DAY: i64 = 86_400;
        if now >= session.window_start + DAY {
            session.window_start = now;
            session.spent_today = 0;
            session.ops_today = 0;
        }
        require!(
            session.ops_today < session.max_ops_per_day,
            CapError::SessionOpsExceeded
        );
        session.ops_today = session.ops_today.checked_add(1).unwrap();
        Ok(())
    }

    pub fn check_spend(session: &Session, amount: u64) -> Result<()> {
        require!(
            amount <= session.max_spend_per_tx,
            CapError::SessionSpendPerTxExceeded
        );
        require!(
            session
                .spent_today
                .checked_add(amount)
                .unwrap()
                <= session.max_spend_per_day,
            CapError::SessionSpendPerDayExceeded
        );
        Ok(())
    }

    pub fn record_spend(session: &mut Session, amount: u64) {
        session.spent_today = session.spent_today.checked_add(amount).unwrap();
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

#[derive(Accounts)]
#[instruction(scope: u32, categories_hash: [u8; 32], max_spend_per_tx: u64, max_spend_per_day: u64, max_ops_per_day: u32, expires_at: i64)]
pub struct CreateSession<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: session public key stored in the PDA
    pub session_key: AccountInfo<'info>,
    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + OwnerNonce::SIZE,
        seeds = [b"owner_nonce", owner.key().as_ref()],
        bump
    )]
    pub owner_nonce: Account<'info, OwnerNonce>,
    #[account(
        init,
        payer = owner,
        space = 8 + Session::SIZE,
        seeds = [b"session", owner.key().as_ref(), session_key.key().as_ref(), owner_nonce.nonce.to_le_bytes().as_ref()],
        bump
    )]
    pub session: Account<'info, Session>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExtendSession<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [b"session", owner.key().as_ref(), session.session_key.as_ref(), session.nonce.to_le_bytes().as_ref()],
        bump = session.bump
    )]
    pub session: Account<'info, Session>,
}

#[derive(Accounts)]
pub struct RevokeSession<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        close = owner,
        seeds = [b"session", owner.key().as_ref(), session.session_key.as_ref(), session.nonce.to_le_bytes().as_ref()],
        bump = session.bump
    )]
    pub session: Account<'info, Session>,
}

#[derive(Accounts)]
pub struct PauseAllSessions<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [b"owner_nonce", owner.key().as_ref()],
        bump = owner_nonce.bump
    )]
    pub owner_nonce: Account<'info, OwnerNonce>,
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

#[account]
pub struct Session {
    pub owner: Pubkey,
    pub session_key: Pubkey,
    pub nonce: u64,
    pub owner_nonce: u64,
    pub scope: u32,
    pub categories_hash: [u8; 32],
    pub max_spend_per_tx: u64,
    pub max_spend_per_day: u64,
    pub spent_today: u64,
    pub max_ops_per_day: u32,
    pub ops_today: u32,
    pub window_start: i64,
    pub expires_at: i64,
    pub revoked: bool,
    pub bump: u8,
}

impl Session {
    pub const SIZE: usize =
        32 + 32 + 8 + 8 + 4 + 32 + 8 + 8 + 8 + 4 + 4 + 8 + 8 + 1 + 1;
}

#[account]
pub struct OwnerNonce {
    pub owner: Pubkey,
    pub nonce: u64,
    pub bump: u8,
}

impl OwnerNonce {
    pub const SIZE: usize = 32 + 8 + 1;
}

#[error_code]
pub enum CapError {
    #[msg("Scope too long")]
    ScopeTooLong,
    #[msg("Session owner mismatch")]
    SessionOwnerMismatch,
    #[msg("Session key mismatch")]
    SessionKeyMismatch,
    #[msg("Session revoked")]
    SessionRevoked,
    #[msg("Session expired")]
    SessionExpired,
    #[msg("Scope not granted")]
    ScopeNotGranted,
    #[msg("Owner nonce mismatch")]
    OwnerNonceMismatch,
    #[msg("Session daily ops exceeded")]
    SessionOpsExceeded,
    #[msg("Session spend per tx exceeded")]
    SessionSpendPerTxExceeded,
    #[msg("Session spend per day exceeded")]
    SessionSpendPerDayExceeded,
}
