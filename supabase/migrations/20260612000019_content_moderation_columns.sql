-- WEB-AUTO-009: AI auto-moderation for user-generated content.
--
-- Additive only (CLAUDE.md backward-compat): a single nullable-with-default
-- visibility column on each UGC table. The DEFAULT 'approved' means every
-- EXISTING row (and any write path that doesn't set it) stays visible — so old
-- web/mobile readers are unaffected. New PUBLIC reviews are inserted with
-- moderation_status='pending' explicitly by the client and stay hidden until the
-- moderate-content job scores them.
--
-- Reviews live in user_ratings(review_text); contact_submissions is the
-- contact/feedback intake. event_photos already has its own is_approved gate
-- (WEB-FEAT-010 photo reviews route through this same seam later via the
-- content_moderation table, not a new column).

-- Public reviews: pending -> approved | flagged | rejected.
ALTER TABLE public.user_ratings
  ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'approved';

COMMENT ON COLUMN public.user_ratings.moderation_status IS
  'WEB-AUTO-009 visibility gate: approved (public), pending (awaiting AI score, hidden), '
  'flagged (queued for admin, hidden), rejected (toxic/spam, hidden). '
  'Existing rows default approved; new public reviews insert as pending.';

-- Contact intake is admin-only (never public), so it is NOT held pending —
-- moderation only DEMOTES spam/toxic submissions. Default approved keeps the
-- inbox behaving exactly as before; rejected rows also get status='spam' so the
-- existing FeedbackInbox spam filter catches them.
ALTER TABLE public.contact_submissions
  ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'approved';

COMMENT ON COLUMN public.contact_submissions.moderation_status IS
  'WEB-AUTO-009 moderation verdict: approved | flagged | rejected (spam/toxic). '
  'Default approved (admin-only content is never hidden-until-scored).';

-- Partial indexes: the moderation queue and the pending-sweep only ever scan the
-- small set of non-approved rows.
CREATE INDEX IF NOT EXISTS idx_user_ratings_moderation
  ON public.user_ratings (moderation_status)
  WHERE moderation_status <> 'approved';

CREATE INDEX IF NOT EXISTS idx_contact_submissions_moderation
  ON public.contact_submissions (moderation_status)
  WHERE moderation_status <> 'approved';
