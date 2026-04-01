-- SEC-025: Account deletion confirmation tokens
-- Stores temporary tokens for two-step account deletion flow.
-- Tokens expire after 15 minutes and are deleted after use.

CREATE TABLE IF NOT EXISTS account_deletion_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Index for fast lookups by user_id + token
CREATE INDEX IF NOT EXISTS idx_account_deletion_tokens_user_token
  ON account_deletion_tokens (user_id, token);

-- Auto-cleanup: index on expires_at for periodic purging
CREATE INDEX IF NOT EXISTS idx_account_deletion_tokens_expires
  ON account_deletion_tokens (expires_at);

-- RLS: Only the service role should access this table (edge function uses service role key)
ALTER TABLE account_deletion_tokens ENABLE ROW LEVEL SECURITY;

-- No public policies — only service_role can read/write
-- This ensures tokens can only be managed by the delete-user-account edge function
