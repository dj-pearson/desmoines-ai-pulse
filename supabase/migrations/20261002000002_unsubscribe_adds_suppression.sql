-- WP2 (docs/plans/NON_CORE_REVIEW_2026-09.md): an unsubscribe reaches every
-- marketing sender, not only the newsletter.
--
-- newsletter_unsubscribe_by_token flipped newsletter_subscribers.status and
-- nothing else. The /unsubscribe page then told the reader "You won't receive
-- any more marketing emails from Des Moines Insider", while event reminders,
-- saved-search alerts and nurture mail never read that status. They all go
-- through _shared/email.ts now, which checks email_suppressions, so the RPC
-- writes a suppression row as well. An 'unsubscribe' suppression blocks
-- marketing only; receipts and security mail still arrive.
--
-- Same signature, same return shape, same grants: the page and the
-- email-unsubscribe edge function call it unchanged. The suppression insert is
-- ON CONFLICT DO NOTHING so it never downgrades an existing bounce or
-- complaint to an unsubscribe.
--
-- Depends on 20261002000001 (email_suppressions).

CREATE OR REPLACE FUNCTION public.newsletter_unsubscribe_by_token(
    p_token TEXT
) RETURNS TABLE (
    success BOOLEAN,
    already_unsubscribed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row_count INT;
    v_email TEXT;
    v_already_unsubscribed BOOLEAN := FALSE;
BEGIN
    -- Validate token format (48 hex chars) before hitting the table.
    IF p_token IS NULL OR length(p_token) <> 48 OR p_token !~ '^[0-9a-f]+$' THEN
        RETURN QUERY SELECT FALSE, FALSE;
        RETURN;
    END IF;

    SELECT status = 'unsubscribed', lower(email)
    INTO v_already_unsubscribed, v_email
    FROM public.newsletter_subscribers
    WHERE unsubscribe_token = p_token
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, FALSE;
        RETURN;
    END IF;

    -- Written on the already-unsubscribed path too, so a click on an old
    -- link backfills the suppression for someone who left before this existed.
    INSERT INTO public.email_suppressions (email, reason, source)
    VALUES (v_email, 'unsubscribe', 'unsubscribe_token')
    ON CONFLICT (email) DO NOTHING;

    IF v_already_unsubscribed THEN
        RETURN QUERY SELECT TRUE, TRUE;
        RETURN;
    END IF;

    UPDATE public.newsletter_subscribers
    SET
        status = 'unsubscribed',
        unsubscribed_at = NOW(),
        updated_at = NOW()
    WHERE unsubscribe_token = p_token
      AND status <> 'unsubscribed';

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    RETURN QUERY SELECT v_row_count > 0, FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.newsletter_unsubscribe_by_token(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.newsletter_unsubscribe_by_token(TEXT) TO authenticated;

-- Everyone who already left, and every address already marked bounced, is
-- carried over so the new senders respect them from the first run.
INSERT INTO public.email_suppressions (email, reason, source)
SELECT DISTINCT ON (lower(email)) lower(email),
       CASE WHEN status = 'bounced' THEN 'bounce' ELSE 'unsubscribe' END,
       'backfill_newsletter_status'
FROM public.newsletter_subscribers
WHERE status IN ('unsubscribed', 'bounced')
  AND email IS NOT NULL
ORDER BY lower(email), (status = 'bounced') DESC
ON CONFLICT (email) DO NOTHING;
