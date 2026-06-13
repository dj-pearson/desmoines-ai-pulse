-- WEB-AUTO-009: AI auto-moderation for user-generated content (reviews + contact/feedback).
--
-- Additive only: new nullable/defaulted columns + an hourly safety-net sweep cron.
-- No drops/renames/tightening. moderation_status DEFAULTs to 'approved' so every
-- pre-existing row stays visible (web + mobile readers ignore the new columns); the
-- write path inserts new rows as 'pending' and the moderate-content edge function
-- flips them to approved / flagged / rejected. RLS is intentionally NOT tightened:
-- live iOS/Android binaries read user_ratings, so visibility is filtered client-side
-- on the web rather than via a policy that would hide reviews from older clients.

-- 1. Reviews (user_ratings) -------------------------------------------------
ALTER TABLE public.user_ratings
  ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS moderation_scores jsonb,
  ADD COLUMN IF NOT EXISTS moderation_reasons text[],
  ADD COLUMN IF NOT EXISTS moderation_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moderated_at timestamptz;

COMMENT ON COLUMN public.user_ratings.moderation_status IS
  'WEB-AUTO-009: pending | approved | rejected | flagged. Default approved so pre-existing reviews stay visible; the write path inserts pending and moderate-content sets the final state.';

-- Only index the small slice that needs admin attention / a retry.
CREATE INDEX IF NOT EXISTS idx_user_ratings_moderation
  ON public.user_ratings (moderation_status)
  WHERE moderation_status <> 'approved';

-- 2. Contact / feedback submissions ----------------------------------------
ALTER TABLE public.contact_submissions
  ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS moderation_scores jsonb,
  ADD COLUMN IF NOT EXISTS moderation_reasons text[],
  ADD COLUMN IF NOT EXISTS moderation_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moderated_at timestamptz;

COMMENT ON COLUMN public.contact_submissions.moderation_status IS
  'WEB-AUTO-009: pending | approved | rejected | flagged. Separate from the admin workflow `status`; a rejected submission is also marked status=spam.';

CREATE INDEX IF NOT EXISTS idx_contact_submissions_moderation
  ON public.contact_submissions (moderation_status)
  WHERE moderation_status <> 'approved';

-- 3. Hourly safety-net sweep ------------------------------------------------
-- The PRIMARY path is real-time: the write path fires moderate-content for each
-- new row. This cron only catches rows whose real-time call failed (left
-- 'pending'), re-moderates them, and gives Job Health observability. It is cheap
-- when nothing is pending and routes through the WEB-AUTO-001 jobRunner.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('moderate-content-sweep')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'moderate-content-sweep');

    PERFORM cron.schedule(
      'moderate-content-sweep',
      '15 * * * *',  -- hourly at :15
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/moderate-content',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
          'Content-Type', 'application/json',
          'x-trigger-source', 'cron'
        ),
        body := jsonb_build_object('action', 'sweep', 'manual', false)
      ) as request_id;
      $cron$
    );
  END IF;
END $$;
