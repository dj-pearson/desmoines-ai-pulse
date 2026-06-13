-- WEB-FEAT-007: Recently-viewed rail + personalized home ordering.
--
-- Server-side, owner-scoped history of detail-page views so a signed-in user's
-- "recently viewed" follows them across devices. The web client also keeps a
-- local @/lib/safeStorage copy (authoritative for rendering → no CLS) and
-- merges this server copy in on sign-in. Denormalized title/image/path/subtitle
-- so the rail renders without extra joins.
--
-- All statements are idempotent (IF NOT EXISTS / guarded DO blocks) and
-- additive — no drops, no renames — per the CLAUDE.md backward-compatibility
-- rules. New table, owner-only RLS; nothing existing is touched.

CREATE TABLE IF NOT EXISTS public.recently_viewed (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_id   UUID NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('event', 'restaurant', 'attraction')),
  title        TEXT,
  image_url    TEXT,
  subtitle     TEXT,
  path         TEXT,
  event_date   TEXT,
  viewed_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  -- one row per (user, content item); a re-view bumps viewed_at
  CONSTRAINT recently_viewed_unique UNIQUE (user_id, content_id, content_type)
);

-- Most-recent-first reads per user.
CREATE INDEX IF NOT EXISTS idx_recently_viewed_user_time
  ON public.recently_viewed (user_id, viewed_at DESC);

ALTER TABLE public.recently_viewed ENABLE ROW LEVEL SECURITY;

-- Owner-only CRUD (additive permissive policies; service_role bypasses RLS).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'recently_viewed'
      AND policyname = 'Users manage own recently_viewed'
  ) THEN
    CREATE POLICY "Users manage own recently_viewed"
      ON public.recently_viewed
      FOR ALL
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
