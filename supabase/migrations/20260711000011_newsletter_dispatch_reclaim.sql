-- WEB-BE-005: make crashed/timed-out newsletter dispatches reclaimable.
--
-- A campaign is claimed by flipping status 'scheduled' -> 'sending'. If the
-- worker crashes or is killed mid-dispatch the row stays 'sending' forever and
-- is never resumed. This migration:
--   1. Adds an explicit `claimed_at` claim timestamp (additive, nullable).
--   2. Teaches the existing claim RPC to stamp `claimed_at` (return shape
--      unchanged — additive only).
--   3. Adds `reclaim_stuck_newsletter_campaigns(minutes)` which flips rows
--      stuck in 'sending' past a threshold back to 'scheduled' so the normal
--      claim path resumes them. Per-recipient idempotency (no double-send on
--      resume) is enforced in the edge function via existing
--      newsletter_deliveries rows.
--
-- All statements are idempotent + backward-compatible.

-- 1) Claim timestamp -------------------------------------------------------
ALTER TABLE public.newsletter_campaigns
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

-- Partial index to cheaply find rows currently in-flight ('sending').
CREATE INDEX IF NOT EXISTS idx_newsletter_campaigns_sending_claimed_at
  ON public.newsletter_campaigns(claimed_at)
  WHERE status = 'sending';

-- 2) Claim RPC now stamps claimed_at (same RETURNING columns as before) -----
CREATE OR REPLACE FUNCTION public.claim_scheduled_newsletter_campaigns(
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  subject TEXT,
  preheader TEXT,
  body_html TEXT,
  segment JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT c.id
    FROM public.newsletter_campaigns c
    WHERE c.status = 'scheduled'
      AND c.scheduled_for IS NOT NULL
      AND c.scheduled_for <= now()
    ORDER BY c.scheduled_for ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.newsletter_campaigns c
  SET status = 'sending',
      claimed_at = now(),
      updated_at = now()
  FROM due
  WHERE c.id = due.id
  RETURNING c.id, c.subject, c.preheader, c.body_html, c.segment;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_scheduled_newsletter_campaigns(INTEGER)
  TO service_role;

-- 3) Reclaim RPC -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reclaim_stuck_newsletter_campaigns(
  p_older_than_minutes INTEGER DEFAULT 15
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH stuck AS (
    SELECT c.id
    FROM public.newsletter_campaigns c
    WHERE c.status = 'sending'
      -- COALESCE so rows claimed before claimed_at existed (legacy) still
      -- qualify via their last-touch updated_at.
      AND COALESCE(c.claimed_at, c.updated_at)
            < now() - make_interval(mins => GREATEST(p_older_than_minutes, 1))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.newsletter_campaigns c
  SET status = 'scheduled',
      claimed_at = NULL,
      updated_at = now()
  FROM stuck
  WHERE c.id = stuck.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reclaim_stuck_newsletter_campaigns(INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.reclaim_stuck_newsletter_campaigns(INTEGER) IS
  'Flips newsletter_campaigns stuck in status=sending past p_older_than_minutes back to scheduled so the dispatcher resumes them. Per-recipient idempotency is enforced by the edge function against newsletter_deliveries.';
