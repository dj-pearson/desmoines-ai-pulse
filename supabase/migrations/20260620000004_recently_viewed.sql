-- WEB-FEAT-007: server-side recently-viewed for signed-in users.
-- Additive (CREATE TABLE + RLS only) — safe in a single release per the
-- backward-compatibility flow. Guests use safeStorage; signed-in users sync
-- here so their recent items follow them across devices.

CREATE TABLE IF NOT EXISTS public.recently_viewed (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  content_type text NOT NULL CHECK (content_type IN ('event', 'restaurant', 'attraction')),
  content_id text NOT NULL,
  title text NOT NULL,
  href text NOT NULL,
  image_url text,
  subtitle text,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, content_type, content_id)
);

-- Newest-first lookups per user.
CREATE INDEX IF NOT EXISTS recently_viewed_user_viewed_at_idx
  ON public.recently_viewed (user_id, viewed_at DESC);

ALTER TABLE public.recently_viewed ENABLE ROW LEVEL SECURITY;

-- Users may only read/write their own rows.
DROP POLICY IF EXISTS "recently_viewed_select_own" ON public.recently_viewed;
CREATE POLICY "recently_viewed_select_own" ON public.recently_viewed
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "recently_viewed_insert_own" ON public.recently_viewed;
CREATE POLICY "recently_viewed_insert_own" ON public.recently_viewed
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "recently_viewed_update_own" ON public.recently_viewed;
CREATE POLICY "recently_viewed_update_own" ON public.recently_viewed
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "recently_viewed_delete_own" ON public.recently_viewed;
CREATE POLICY "recently_viewed_delete_own" ON public.recently_viewed
  FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE public.recently_viewed IS
  'WEB-FEAT-007: per-user recently-viewed content (events/restaurants/attractions). Capped/pruned client-side; RLS restricts to owner.';
