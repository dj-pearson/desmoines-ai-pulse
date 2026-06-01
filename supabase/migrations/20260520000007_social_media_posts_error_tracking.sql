-- ADMIN-SOCIAL-002: Give social_media_posts a place to record why a
-- failed send failed, so the admin queue dashboard can surface the
-- error inline and offer a retry. Add last_attempt_at as well so
-- repeated failures are visible.

ALTER TABLE public.social_media_posts
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;

COMMENT ON COLUMN public.social_media_posts.error_message IS
  'Most recent send error. NULL when the post has not failed or after a successful retry.';
COMMENT ON COLUMN public.social_media_posts.last_attempt_at IS
  'Most recent send attempt timestamp. Updated by social-media-manager on each retry.';
