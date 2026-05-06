-- =============================================================================
-- Ask Pulse — per-user daily quota table (IOS-DISCOVER-2026-001)
-- =============================================================================
-- Tracks how many discover-chat queries each user has made per day so the
-- edge function can enforce free/insider/vip tier limits (5/50/unlimited).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.discover_chat_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT discover_chat_usage_user_date_key UNIQUE (user_id, usage_date),
  CONSTRAINT discover_chat_usage_count_nonneg CHECK (count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_discover_chat_usage_date
  ON public.discover_chat_usage (usage_date DESC);

-- RLS: users can read their own row (so the iOS UI can show "X/5 left today"),
-- but only the edge function (service role) writes.
ALTER TABLE public.discover_chat_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own discover_chat usage"
  ON public.discover_chat_usage;

CREATE POLICY "Users can read their own discover_chat usage"
  ON public.discover_chat_usage
  FOR SELECT
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.discover_chat_usage IS
  'Per-user daily query counter for the discover-chat (Ask Pulse) edge function. Resets at midnight UTC.';
