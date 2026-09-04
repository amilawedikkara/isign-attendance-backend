CREATE TABLE IF NOT EXISTS refresh_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id INT NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    token_hash TEXT NOT NULL UNIQUE,

    token_family_id UUID NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    expires_at TIMESTAMPTZ NOT NULL,

    revoked_at TIMESTAMPTZ,

    revoked_reason VARCHAR(100),

    replaced_by_session_id UUID
        REFERENCES refresh_sessions(id)
        ON DELETE SET NULL,

    device_info TEXT,

    ip_address INET
);


CREATE INDEX IF NOT EXISTS idx_refresh_sessions_user_id
ON refresh_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_refresh_sessions_token_family_id
ON refresh_sessions(token_family_id);

CREATE INDEX IF NOT EXISTS idx_refresh_sessions_active_user
ON refresh_sessions(user_id)
WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_refresh_sessions_expires_at
ON refresh_sessions(expires_at);