-- WEB-FEAT-019 -- newsletter confirmation, and a way back for people who left.
--
-- The signup wrote newsletter_subscribers directly from the browser with the
-- table's default status ('active') and toasted "Check your email for a
-- confirmation." Nothing sent one; there was no token, no sender, no confirm
-- step anywhere in the repo. Separately, a previously unsubscribed address hit
-- the UNIQUE(email) constraint on every attempt to come back, and the table has
-- no UPDATE policy for any role, so resubscribing was impossible from any
-- client -- the person was told "you're already subscribed" and left on a list
-- they had asked to leave.
--
-- Additive: one new status value (a WIDENING of the CHECK), three nullable
-- columns, one new RPC. No existing row changes status, and the column default
-- stays 'active' so any writer this migration does not know about keeps working
-- exactly as before.

-- 1) 'pending' joins the status vocabulary.
--    Widening a CHECK is safe in one release; narrowing one is not. Nothing
--    reads status as an exhaustive set today, and the digest treats anything
--    that is not 'active' as "do not send", which is the correct default for a
--    value it has never seen.
ALTER TABLE public.newsletter_subscribers
  DROP CONSTRAINT IF EXISTS newsletter_subscribers_status_check;

ALTER TABLE public.newsletter_subscribers
  ADD CONSTRAINT newsletter_subscribers_status_check
  CHECK (status IN ('active', 'pending', 'unsubscribed', 'bounced'));

-- 2) The confirmation token, mirroring the unsubscribe token from
--    20260413000002: 48 hex characters, unique, never readable over REST.
ALTER TABLE public.newsletter_subscribers
  ADD COLUMN IF NOT EXISTS confirm_token TEXT,
  ADD COLUMN IF NOT EXISTS confirm_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_subscribers_confirm_token
  ON public.newsletter_subscribers (confirm_token)
  WHERE confirm_token IS NOT NULL;

-- Every row that predates this migration opted in under the old single-step
-- flow and stays exactly as it is: confirmed_at is left NULL rather than
-- backdated, because inventing a confirmation timestamp for a confirmation
-- that never happened is the one thing an audit trail must not do.
COMMENT ON COLUMN public.newsletter_subscribers.confirmed_at IS
  'WEB-FEAT-019: when the address completed double opt-in. NULL on rows created before the confirm flow existed - those were single opt-in and are not backdated.';

-- The token must never flow out over REST; it is only ever placed in an email
-- the server sends. Same posture as unsubscribe_token.
REVOKE SELECT (confirm_token) ON public.newsletter_subscribers FROM anon;
REVOKE SELECT (confirm_token) ON public.newsletter_subscribers FROM authenticated;

-- 3) Confirm by token. SECURITY DEFINER and anon-executable so the link in the
--    email works without an account, exactly like the unsubscribe RPC.
--
--    Returns a THREE-state answer rather than a boolean, because the page has
--    three different things to say: it worked, you already did this, that link
--    is not valid. Collapsing the middle case into failure is how a
--    double-clicked confirmation link tells someone their subscription failed.
CREATE OR REPLACE FUNCTION public.newsletter_confirm_by_token(p_token TEXT)
RETURNS TABLE (
  success BOOLEAN,
  already_confirmed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row     public.newsletter_subscribers;
  v_updated INT;
BEGIN
  -- Shape check before touching the table, so a malformed link costs nothing.
  IF p_token IS NULL OR length(p_token) <> 48 OR p_token !~ '^[0-9a-f]+$' THEN
    RETURN QUERY SELECT FALSE, FALSE;
    RETURN;
  END IF;

  SELECT * INTO v_row
  FROM public.newsletter_subscribers
  WHERE confirm_token = p_token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, FALSE;
    RETURN;
  END IF;

  -- Already active on this token: idempotent, and says so.
  IF v_row.status = 'active' THEN
    RETURN QUERY SELECT TRUE, TRUE;
    RETURN;
  END IF;

  UPDATE public.newsletter_subscribers
  SET status       = 'active',
      confirmed_at = COALESCE(confirmed_at, NOW()),
      -- The token is spent. Keeping it would leave a working confirm link in
      -- an inbox forever, which is a live re-subscribe for anyone who later
      -- reads that mailbox.
      confirm_token = NULL,
      unsubscribed_at = NULL,
      updated_at   = NOW()
  WHERE confirm_token = p_token;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RETURN QUERY SELECT FALSE, FALSE;
    RETURN;
  END IF;

  -- 4) The consent record. GDPR Art. 7 wants proof of affirmative consent, and
  --    the click on this link IS that proof -- the row written at signup was
  --    not, which is the gap WEB-LEGAL-012 should carry forward.
  --
  --    email_hash, not the address: consent_records is append-only and kept for
  --    seven years, and an erasure request must not have to rewrite it.
  INSERT INTO public.consent_records (
    email_hash, consent_type, granted, source, metadata
  )
  VALUES (
    encode(extensions.digest(lower(btrim(v_row.email)), 'sha256'), 'hex'),
    'newsletter',
    TRUE,
    'newsletter_confirm',
    jsonb_build_object(
      'subscriber_id', v_row.id,
      'signup_source', v_row.source,
      'confirm_sent_at', v_row.confirm_sent_at
    )
  );

  RETURN QUERY SELECT TRUE, FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.newsletter_confirm_by_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.newsletter_confirm_by_token(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.newsletter_confirm_by_token(TEXT) TO authenticated;

COMMENT ON FUNCTION public.newsletter_confirm_by_token IS
  'WEB-FEAT-019: double opt-in confirmation. Flips pending -> active, spends the token, and appends the consent record that the signup itself could not evidence.';
