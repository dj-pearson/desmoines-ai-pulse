-- WEB-ADS-022: a reader who unsubscribed and later signed up again never got
-- another newsletter.
--
-- newsletter_unsubscribe_by_token (20261002000002) writes an 'unsubscribe' row
-- to email_suppressions, and _shared/email.ts isBlocked() drops every
-- marketing send to an address with that row. Coming back works on paper:
-- newsletter-subscribe upserts the row to 'pending', the confirmation mail is
-- transactional so it gets through, and newsletter_confirm_by_token flips the
-- row to 'active'. Nothing ever removed the suppression, so the weekly digest
-- went to sendEmail, was dropped as suppressed, and the page had just told the
-- reader "The next Des Moines digest will come straight to your inbox".
--
-- The confirm click is the right place to lift it. The token was mailed to
-- that address, so the click is the mailbox owner choosing to come back, the
-- same evidence the original double opt-in rests on; typing someone else's
-- address into the form cannot get past it. Only reason = 'unsubscribe' is
-- lifted: a bounce, a complaint or a manual block outranks a newsletter
-- signup, and ses-events overwrites an unsubscribe with those anyway.
--
-- Same signature, same return shape, same grants: NewsletterConfirm.tsx calls
-- it unchanged. Body is 20260918000002's with one DELETE added after the
-- status update succeeds. CREATE OR REPLACE and a backfill that only deletes
-- rows matching its own condition, so re-running is a no-op.
--
-- Depends on 20260918000002 (confirm RPC) and 20261002000001
-- (email_suppressions).

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

  -- WEB-ADS-022. The reader's own earlier unsubscribe, and nothing stronger.
  -- email_suppressions stores the address lowercased (its CHECK enforces it).
  DELETE FROM public.email_suppressions
  WHERE email = lower(btrim(v_row.email))
    AND reason = 'unsubscribe';

  -- The consent record. GDPR Art. 7 wants proof of affirmative consent, and
  -- the click on this link IS that proof.
  --
  -- email_hash, not the address: consent_records is append-only and kept for
  -- seven years, and an erasure request must not have to rewrite it.
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
  'WEB-FEAT-019: double opt-in confirmation. Flips pending -> active, spends the token, lifts the address''s own unsubscribe suppression (WEB-ADS-022), and appends the consent record.';

-- Readers who already came back before this fix: active today, and still
-- suppressed by the unsubscribe they later reversed. The only path from
-- 'unsubscribed' to 'active' since 20260918000002 is the confirm RPC (the
-- anon INSERT policy is gone, 20261101000001, and newsletter-subscribe only
-- ever writes 'pending'), and the confirm clears unsubscribed_at, so
-- "active with unsubscribed_at NULL" is a confirmed return. Restricted to the
-- two sources that write newsletter unsubscribes, so nothing written by
-- another path is touched.
DELETE FROM public.email_suppressions s
USING public.newsletter_subscribers n
WHERE s.reason = 'unsubscribe'
  AND s.source IN ('unsubscribe_token', 'backfill_newsletter_status')
  AND s.email = lower(btrim(n.email))
  AND n.status = 'active'
  AND n.unsubscribed_at IS NULL;
