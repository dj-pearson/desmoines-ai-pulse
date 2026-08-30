-- WEB-UX-010 / WEB-FEAT-006: generic favorites for non-event content.
--
-- Event favorites already live in public.user_event_interactions
-- (interaction_type = 'favorite') and stay there untouched for backward
-- compatibility. This additive table covers restaurants, attractions, hotels
-- and playgrounds so the Save control works across all browse/detail surfaces.
--
-- Purely additive (CREATE TABLE + RLS) — safe in a single release.

CREATE TABLE IF NOT EXISTS public.content_favorites (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_type text NOT NULL CHECK (content_type IN ('restaurant', 'attraction', 'hotel', 'playground')),
  content_id   uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, content_type, content_id)
);

CREATE INDEX IF NOT EXISTS idx_content_favorites_user
  ON public.content_favorites (user_id);

CREATE INDEX IF NOT EXISTS idx_content_favorites_user_type
  ON public.content_favorites (user_id, content_type);

ALTER TABLE public.content_favorites ENABLE ROW LEVEL SECURITY;

-- Owner-only: a user can only see and mutate their own favorites.
DROP POLICY IF EXISTS "content_favorites_select_own" ON public.content_favorites;
CREATE POLICY "content_favorites_select_own"
  ON public.content_favorites FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "content_favorites_insert_own" ON public.content_favorites;
CREATE POLICY "content_favorites_insert_own"
  ON public.content_favorites FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "content_favorites_delete_own" ON public.content_favorites;
CREATE POLICY "content_favorites_delete_own"
  ON public.content_favorites FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.content_favorites IS
  'Per-user saved restaurants/attractions/hotels/playgrounds. Event favorites remain in user_event_interactions.';
