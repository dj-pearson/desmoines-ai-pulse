-- swipe_interactions: signals from the iOS Discover (swipe-to-discover) screen.
--
-- Captures higher-volume, lower-stakes signals than `user_event_interactions`
-- (favorites). A right swipe also creates a favorite via app logic, but the
-- swipe row stands on its own so we can record skips ("not interested"),
-- boosts ("more like this"), and the *filter context* the user was in at the
-- time. That context lets future personalization weight the signal — a
-- right-swipe on a steakhouse while filtering by "Italian" is noisier than
-- one with no filters applied.

CREATE TABLE IF NOT EXISTS public.swipe_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL CHECK (item_type IN ('event', 'restaurant', 'attraction')),
    item_id UUID NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('like', 'skip', 'boost', 'detail')),
    source_context JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_swipe_interactions_user_created
    ON public.swipe_interactions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_swipe_interactions_user_item
    ON public.swipe_interactions (user_id, item_type, item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_swipe_interactions_item
    ON public.swipe_interactions (item_type, item_id);

ALTER TABLE public.swipe_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own swipes"
    ON public.swipe_interactions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can record own swipes"
    ON public.swipe_interactions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own swipes"
    ON public.swipe_interactions FOR DELETE
    USING (auth.uid() = user_id);

COMMENT ON TABLE public.swipe_interactions IS
'Records swipe-to-discover gestures from the iOS Discover screen.
action values:
  like   = right swipe (also creates a favorite via app logic)
  skip   = left swipe (negative signal, suppress similar items next session)
  boost  = up swipe ("show me more like this", strong positive signal)
  detail = card tapped to open detail view (weak positive signal).
source_context captures the filter state at swipe time so personalization
can weight signals by context.';
