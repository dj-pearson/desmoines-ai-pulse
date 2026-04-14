-- Newsletter unsubscribe tokens
--
-- CAN-SPAM Act §5(a)(5) requires a functioning unsubscribe mechanism in every
-- commercial email. Best practice (and most ESP policies) is a one-click link
-- that does not require the recipient to log in. This migration adds a random
-- per-subscriber token and a RPC that looks up and marks the row as
-- unsubscribed in a single transaction, without requiring auth.

-- 1) Add a secret token + a public "short id" used in the unsubscribe URL.
--    The token is generated on first use and rotated only on re-subscription.
ALTER TABLE public.newsletter_subscribers
    ADD COLUMN IF NOT EXISTS unsubscribe_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_subscribers_unsubscribe_token
    ON public.newsletter_subscribers (unsubscribe_token)
    WHERE unsubscribe_token IS NOT NULL;

-- Backfill a token for existing rows.
UPDATE public.newsletter_subscribers
SET unsubscribe_token = encode(gen_random_bytes(24), 'hex')
WHERE unsubscribe_token IS NULL;

-- Trigger so new rows always get a token even if the insert omits it.
CREATE OR REPLACE FUNCTION set_newsletter_unsubscribe_token()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.unsubscribe_token IS NULL THEN
        NEW.unsubscribe_token := encode(gen_random_bytes(24), 'hex');
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_newsletter_unsubscribe_token
    ON public.newsletter_subscribers;

CREATE TRIGGER trg_newsletter_unsubscribe_token
    BEFORE INSERT ON public.newsletter_subscribers
    FOR EACH ROW
    EXECUTE FUNCTION set_newsletter_unsubscribe_token();

-- 2) SECURITY DEFINER RPC to honor an unsubscribe click from a public link.
--    Takes only the token, never reveals the email address.
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
    v_already_unsubscribed BOOLEAN := FALSE;
BEGIN
    -- Validate token format (48 hex chars) before hitting the table.
    IF p_token IS NULL OR length(p_token) <> 48 OR p_token !~ '^[0-9a-f]+$' THEN
        RETURN QUERY SELECT FALSE, FALSE;
        RETURN;
    END IF;

    -- Check current state
    SELECT status = 'unsubscribed'
    INTO v_already_unsubscribed
    FROM public.newsletter_subscribers
    WHERE unsubscribe_token = p_token
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, FALSE;
        RETURN;
    END IF;

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

-- Let anonymous callers invoke the RPC so the one-click link works without auth.
GRANT EXECUTE ON FUNCTION public.newsletter_unsubscribe_by_token(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.newsletter_unsubscribe_by_token(TEXT) TO authenticated;

COMMENT ON FUNCTION public.newsletter_unsubscribe_by_token IS
    'One-click CAN-SPAM unsubscribe. Validates token and flips subscriber status to unsubscribed in a single transaction.';

-- 3) Do NOT expose unsubscribe_token via REST. Revoke SELECT on that column
--    from anon/authenticated roles so it only flows outward via server-signed
--    emails. (This is belt-and-suspenders: RLS on the table already blocks
--    anon reads.)
REVOKE SELECT (unsubscribe_token) ON public.newsletter_subscribers FROM anon;
REVOKE SELECT (unsubscribe_token) ON public.newsletter_subscribers FROM authenticated;
