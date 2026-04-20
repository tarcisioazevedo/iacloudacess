-- Password Reset Tokens
-- Used for "Forgot Password" flow. Tokens are stored as SHA-256 hashes.
-- Each profile can have at most 1 active reset token at a time.

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          TEXT PRIMARY KEY,
  profile_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token_hash  VARCHAR(64) NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT uq_password_reset_profile UNIQUE (profile_id)
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires
  ON password_reset_tokens (expires_at);

-- Cleanup: automatically delete expired tokens (optional, can also be cron-based)
-- This index helps the cleanup query be fast.
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_profile
  ON password_reset_tokens (profile_id);
