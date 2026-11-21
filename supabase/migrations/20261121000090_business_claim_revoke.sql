-- WEB-ADS-047: a verified owner can be removed, and a pending claim is noticed.
--
-- Before this, review_business_claim was the only write after a claim, the
-- admin screen listed pending rows only, and nothing recorded or undid a
-- verification once a restaurant changed hands.
--
-- Additive only:
--   - three nullable columns saying who revoked an owner, when and why
--   - revoke_business_claim(uuid, text), admin-only
--   - claim_listing replaced with the same signature: a user whose ownership
--     was revoked no longer auto-verifies on a domain match (see below)
--   - a daily cron for business-claims-health, which alerts on claims pending
--     more than 3 days
--
-- A REVOKED CLAIM IS status = 'rejected' WITH revoked_at SET. Not a new status
-- value: every reader of business_claims (update_claimed_listing,
-- business_pro_active, get_listing_owner_stats, link_sponsored_listing, the
-- /business workspace and the shipped status union in useBusinessClaim) already
-- treats anything but 'verified' as "no edit access", and the two partial
-- unique indexes already exclude 'rejected', so the listing is free for its new
-- owner the moment the row flips. A fourth status would have meant widening the
-- CHECK and auditing each of those for an unknown value.

ALTER TABLE public.business_claims ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
ALTER TABLE public.business_claims ADD COLUMN IF NOT EXISTS revoked_by uuid;
ALTER TABLE public.business_claims ADD COLUMN IF NOT EXISTS revoke_reason text;

COMMENT ON COLUMN public.business_claims.revoked_at IS
  'Set when an admin removed a verified owner (revoke_business_claim, WEB-ADS-047). status is then rejected.';
COMMENT ON COLUMN public.business_claims.revoked_by IS 'The admin who revoked the owner.';
COMMENT ON COLUMN public.business_claims.revoke_reason IS 'Why, as the admin wrote it. Internal: not mailed to the claimant.';

-- -- revoke_business_claim --
--
-- Only a verified claim can be revoked, and only with a reason: the record of
-- why somebody lost their listing is the thing an admin will need when the
-- former owner writes in.
CREATE OR REPLACE FUNCTION public.revoke_business_claim(
  p_claim_id uuid,
  p_reason text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'revoke_business_claim: not authorized';
  END IF;
  IF v_reason = '' THEN
    RAISE EXCEPTION 'revoke_business_claim: give a reason for removing this owner';
  END IF;

  UPDATE public.business_claims
     SET status = 'rejected',
         revoked_at = now(),
         revoked_by = auth.uid(),
         revoke_reason = v_reason,
         updated_at = now()
   WHERE id = p_claim_id
     AND status = 'verified';

  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.business_claims WHERE id = p_claim_id) THEN
      RAISE EXCEPTION 'revoke_business_claim: claim % is not a verified owner', p_claim_id;
    END IF;
    RAISE EXCEPTION 'revoke_business_claim: claim % not found', p_claim_id;
  END IF;

  RETURN 'revoked';
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_business_claim(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_business_claim(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.revoke_business_claim(uuid, text) IS
  'Admin removes a verified listing owner, recording who and why (WEB-ADS-047). Edit access goes with status = verified.';

-- -- claim_listing, same signature --
--
-- One change from 20260920000005: a user whose ownership of THIS listing was
-- revoked goes to the pending queue instead of auto-verifying. The domain
-- match is the weak spot: a former owner keeps their @restaurant.com address
-- after a sale, and the website on the listing usually does not change, so
-- without this they could re-claim the listing the moment it was taken away.
CREATE OR REPLACE FUNCTION public.claim_listing(
  p_listing_type text,
  p_listing_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_email text;
  v_site text;
  v_site_domain text;
  v_email_domain text;
  v_status text;
  v_was_revoked boolean;
  v_existing public.business_claims%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'claim_listing: sign in to claim a listing';
  END IF;
  IF p_listing_type NOT IN ('restaurant', 'attraction', 'venue') THEN
    RAISE EXCEPTION 'claim_listing: % is not a listing type', p_listing_type;
  END IF;

  SELECT * INTO v_existing
    FROM public.business_claims
   WHERE listing_type = p_listing_type AND listing_id = p_listing_id AND status = 'verified';
  IF FOUND AND v_existing.user_id <> v_user THEN
    RAISE EXCEPTION 'claim_listing: this listing is already claimed';
  END IF;

  SELECT * INTO v_existing
    FROM public.business_claims
   WHERE listing_type = p_listing_type AND listing_id = p_listing_id
     AND user_id = v_user AND status <> 'rejected';
  IF FOUND THEN
    RETURN v_existing.status;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.business_claims
     WHERE listing_type = p_listing_type AND listing_id = p_listing_id
       AND user_id = v_user AND revoked_at IS NOT NULL
  ) INTO v_was_revoked;

  SELECT email INTO v_email FROM auth.users WHERE id = v_user;
  v_site := public.listing_website(p_listing_type, p_listing_id);
  v_site_domain := public.claim_domain_of(v_site);
  v_email_domain := public.claim_domain_of(v_email);

  v_status := CASE
    WHEN NOT v_was_revoked
      AND v_site_domain IS NOT NULL
      AND v_email_domain IS NOT NULL
      AND v_site_domain = v_email_domain
    THEN 'verified'
    ELSE 'pending'
  END;

  INSERT INTO public.business_claims (
    listing_type, listing_id, user_id, method, status,
    claimed_email, matched_domain, verified_at
  )
  VALUES (
    p_listing_type, p_listing_id, v_user, 'email_domain', v_status,
    v_email,
    CASE WHEN v_status = 'verified' THEN v_site_domain ELSE NULL END,
    CASE WHEN v_status = 'verified' THEN now() ELSE NULL END
  );

  RETURN v_status;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_listing(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_listing(text, uuid) TO authenticated;

-- -- business-claims-health, daily 13:23 UTC (07:23 Central) --
--
-- Counts pending claims and alerts the admin when any has waited more than 3
-- days. One small select; no writes besides its own automation_job_runs row.
-- Credentials from Vault via public.app_secret(), as 20261121000050 does.
-- Idempotent; a no-op without pg_cron.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed; skipping business-claims-health schedule';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'business-claims-health') THEN
    PERFORM cron.unschedule('business-claims-health');
  END IF;

  PERFORM cron.schedule(
    'business-claims-health',
    '23 13 * * *',
    $cron$
    DO $inner$
    DECLARE
      v_url text := public.app_secret('supabase_url');
      v_key text := public.app_secret('service_role_key');
    BEGIN
      IF v_url IS NULL OR v_key IS NULL THEN
        RAISE EXCEPTION 'business-claims-health not run: vault secret supabase_url or service_role_key is missing';
      END IF;
      PERFORM net.http_post(
        url     := v_url || '/functions/v1/business-claims-health',
        body    := '{}'::jsonb,
        headers := jsonb_build_object(
                     'Authorization', 'Bearer ' || v_key,
                     'Content-Type', 'application/json',
                     'x-trigger-source', 'cron'
                   ),
        timeout_milliseconds := 60000
      );
    END
    $inner$;
    $cron$
  );
END
$$;
