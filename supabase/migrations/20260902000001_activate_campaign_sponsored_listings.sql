-- WEB-ADS-001: a paid sponsored listing never went live.
--
-- /advertise sells a sponsored_listing placement, inserts a
-- sponsored_listing_links row and sends the buyer to Stripe. Everything that
-- renders the sponsorship (src/lib/sponsored.ts, SponsoredBadge, the card
-- rings, get-sponsored-pick) reads events.is_sponsored /
-- restaurants.is_sponsored plus sponsored_until. Before this migration the only
-- writer of that flag in the repository was the admin "End Sponsorship Early"
-- button, which sets it to false. The product was sold, charged and never
-- delivered.
--
-- Design
--   * activate_campaign(p_campaign_id) is the one way a campaign becomes
--     active. The admin approve click (useAdminCampaigns.approveCreative) and
--     the lifecycle job (process_campaign_lifecycle) both call it, so the two
--     cannot drift.
--   * The listing flags follow campaigns.status through a trigger. Any writer
--     that moves a campaign to active flags the linked listings; any writer
--     that moves it to completed, cancelled or refunded clears them. That
--     covers End Early, the lifecycle job's completion step and a refund from
--     the Stripe webhook without each of them having to remember two more
--     tables.
--   * process_campaign_lifecycle activates through activate_campaign. Its old
--     WHERE compared status against 'pending_review', which is not a label of
--     campaign_status (WEB-ADS-004), so the function raised 22P02 on every
--     call. Comparisons here go through status::text so this file applies and
--     runs whether or not WEB-ADS-004's enum change has landed.
--   * Backfill: every campaign that has a sponsored_listing_links row is
--     re-synced at the end of this file, so campaigns already active get their
--     listings flagged now. The row count is RAISEd as a NOTICE.
--
-- Additive per CLAUDE.md: new functions, one trigger, no column or enum change.
-- get_active_ads and every mobile-read shape are untouched.

-- ============================================================================
-- 1. Expiry helper: sponsorship runs through the end of the campaign's last
--    day in Des Moines time. isSponsoredActive() on the client treats a NULL
--    sponsored_until as "active until cleared", which the trigger below does.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sponsored_until_for(p_end_date date)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ((p_end_date + 1)::timestamp AT TIME ZONE 'America/Chicago');
$$;

-- ============================================================================
-- 2. sync_campaign_sponsorship: make the linked listings agree with the
--    campaign's current status. Returns the number of listing rows written.
--    Not callable from clients; the trigger, activate_campaign and the
--    backfill use it.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_campaign_sponsorship(p_campaign_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_end_date date;
  v_until timestamptz;
  v_rows integer := 0;
  v_n integer;
BEGIN
  SELECT c.status::text, c.end_date::date
    INTO v_status, v_end_date
    FROM public.campaigns c
   WHERE c.id = p_campaign_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  IF v_status = 'active' THEN
    v_until := public.sponsored_until_for(v_end_date);

    UPDATE public.events e
       SET is_sponsored = true,
           sponsored_until = v_until
     WHERE e.id IN (
             SELECT l.listing_id
               FROM public.sponsored_listing_links l
              WHERE l.campaign_id = p_campaign_id
                AND l.listing_type = 'event'
           )
       AND (e.is_sponsored IS DISTINCT FROM true
            OR e.sponsored_until IS DISTINCT FROM v_until);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_rows := v_rows + v_n;

    UPDATE public.restaurants r
       SET is_sponsored = true,
           sponsored_until = v_until
     WHERE r.id IN (
             SELECT l.listing_id
               FROM public.sponsored_listing_links l
              WHERE l.campaign_id = p_campaign_id
                AND l.listing_type = 'restaurant'
           )
       AND (r.is_sponsored IS DISTINCT FROM true
            OR r.sponsored_until IS DISTINCT FROM v_until);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_rows := v_rows + v_n;

  ELSIF v_status IN ('completed', 'cancelled', 'refunded') THEN
    -- Clear the flag unless another ACTIVE campaign sponsors the same listing.
    UPDATE public.events e
       SET is_sponsored = false,
           sponsored_until = NULL
     WHERE e.id IN (
             SELECT l.listing_id
               FROM public.sponsored_listing_links l
              WHERE l.campaign_id = p_campaign_id
                AND l.listing_type = 'event'
           )
       AND e.is_sponsored = true
       AND NOT EXISTS (
             SELECT 1
               FROM public.sponsored_listing_links l2
               JOIN public.campaigns c2 ON c2.id = l2.campaign_id
              WHERE l2.listing_type = 'event'
                AND l2.listing_id = e.id
                AND c2.id <> p_campaign_id
                AND c2.status::text = 'active'
           );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_rows := v_rows + v_n;

    UPDATE public.restaurants r
       SET is_sponsored = false,
           sponsored_until = NULL
     WHERE r.id IN (
             SELECT l.listing_id
               FROM public.sponsored_listing_links l
              WHERE l.campaign_id = p_campaign_id
                AND l.listing_type = 'restaurant'
           )
       AND r.is_sponsored = true
       AND NOT EXISTS (
             SELECT 1
               FROM public.sponsored_listing_links l2
               JOIN public.campaigns c2 ON c2.id = l2.campaign_id
              WHERE l2.listing_type = 'restaurant'
                AND l2.listing_id = r.id
                AND c2.id <> p_campaign_id
                AND c2.status::text = 'active'
           );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_rows := v_rows + v_n;
  END IF;

  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_campaign_sponsorship(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_campaign_sponsorship(uuid) TO service_role;

COMMENT ON FUNCTION public.sync_campaign_sponsorship(uuid) IS
'WEB-ADS-001. Sets is_sponsored/sponsored_until on the events and restaurants linked to a campaign when it is active, clears them when it is completed, cancelled or refunded (unless another active campaign sponsors the same listing). Called by the campaigns status trigger, activate_campaign and the backfill; not a client RPC.';

-- ============================================================================
-- 3. Trigger: the listing flags follow campaigns.status whoever writes it.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_sponsored_listings_on_campaign_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status::text IS NOT DISTINCT FROM OLD.status::text THEN
    RETURN NEW;
  END IF;
  PERFORM public.sync_campaign_sponsorship(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_campaign_status_sponsorship ON public.campaigns;
CREATE TRIGGER trg_campaign_status_sponsorship
  AFTER INSERT OR UPDATE OF status ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_sponsored_listings_on_campaign_status();

-- ============================================================================
-- 4. activate_campaign: the single activation path.
--
--    Callers: an admin from the browser (auth.uid() set, is_admin() true) or
--    the lifecycle job / service role (no JWT, auth.uid() NULL). EXECUTE is
--    revoked from anon so an unauthenticated PostgREST call is refused before
--    the body runs; a signed-in non-admin is refused inside.
--
--    Preconditions: status is pending_creative or pending_review; no creative
--    is unapproved; and the campaign has at least one approved creative OR a
--    sponsored_listing_links row. The second half matters because a pure
--    sponsored-listing purchase has no creative to approve; the listing is the
--    creative.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.activate_campaign(p_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign public.campaigns%ROWTYPE;
  v_creatives integer;
  v_unapproved integer;
  v_links integer;
  v_listings integer;
BEGIN
  IF auth.role() = 'anon' THEN
    RAISE EXCEPTION 'activate_campaign: not available to anonymous callers'
      USING ERRCODE = '42501';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'activate_campaign: admin role required'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_campaign
    FROM public.campaigns
   WHERE id = p_campaign_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'activate_campaign: campaign % not found', p_campaign_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_campaign.status::text = 'active' THEN
    -- Idempotent: re-sync so a link added after activation is honoured.
    v_listings := public.sync_campaign_sponsorship(p_campaign_id);
    RETURN jsonb_build_object(
      'campaign_id', p_campaign_id,
      'status', 'active',
      'already_active', true,
      'listings_synced', v_listings
    );
  END IF;

  IF v_campaign.status::text NOT IN ('pending_creative', 'pending_review') THEN
    RAISE EXCEPTION 'activate_campaign: campaign % is % and cannot be activated',
      p_campaign_id, v_campaign.status
      USING ERRCODE = '22023';
  END IF;

  SELECT count(*), count(*) FILTER (WHERE is_approved IS NOT TRUE)
    INTO v_creatives, v_unapproved
    FROM public.campaign_creatives
   WHERE campaign_id = p_campaign_id;

  SELECT count(*) INTO v_links
    FROM public.sponsored_listing_links
   WHERE campaign_id = p_campaign_id;

  IF v_unapproved > 0 THEN
    RAISE EXCEPTION 'activate_campaign: campaign % has % unapproved creative(s)',
      p_campaign_id, v_unapproved
      USING ERRCODE = '22023';
  END IF;

  IF v_creatives = 0 AND v_links = 0 THEN
    RAISE EXCEPTION 'activate_campaign: campaign % has no approved creative and no sponsored listing',
      p_campaign_id
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.campaigns
     SET status = 'active',
         updated_at = now()
   WHERE id = p_campaign_id;
  -- The trigger has flagged the listings; sync again to return the count.
  v_listings := public.sync_campaign_sponsorship(p_campaign_id);

  RETURN jsonb_build_object(
    'campaign_id', p_campaign_id,
    'status', 'active',
    'already_active', false,
    'listings_synced', v_listings
  );
END;
$$;

REVOKE ALL ON FUNCTION public.activate_campaign(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_campaign(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.activate_campaign(uuid) IS
'WEB-ADS-001. The single path that moves a campaign to active. Admin-only from the browser; the lifecycle job calls it with no JWT. Requires every creative approved and at least one approved creative or a sponsored_listing_links row. The campaigns status trigger flags the linked listings.';

-- ============================================================================
-- 5. process_campaign_lifecycle activates through activate_campaign.
--    Same return keys as before plus activation_skipped, so any caller that
--    reads the old shape keeps working.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.process_campaign_lifecycle()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  activated_count INT := 0;
  skipped_count INT := 0;
  completed_count INT := 0;
  expiring_count INT := 0;
  deadline_count INT := 0;
  result JSON;
BEGIN
  -- 1. ACTIVATE approved campaigns that have reached their start date.
  FOR r IN
    SELECT c.id
      FROM public.campaigns c
     WHERE c.status::text IN ('pending_review', 'pending_creative')
       AND c.start_date::date <= CURRENT_DATE
       AND NOT EXISTS (
             SELECT 1 FROM public.campaign_creatives cc
              WHERE cc.campaign_id = c.id AND cc.is_approved IS NOT TRUE
           )
       AND (
             EXISTS (
               SELECT 1 FROM public.campaign_creatives cc
                WHERE cc.campaign_id = c.id AND cc.is_approved = true
             )
             OR EXISTS (
               SELECT 1 FROM public.sponsored_listing_links l
                WHERE l.campaign_id = c.id
             )
           )
     ORDER BY c.start_date, c.created_at
  LOOP
    BEGIN
      PERFORM public.activate_campaign(r.id);
      activated_count := activated_count + 1;
    EXCEPTION WHEN OTHERS THEN
      skipped_count := skipped_count + 1;
      RAISE WARNING 'process_campaign_lifecycle: could not activate %: %', r.id, SQLERRM;
    END;
  END LOOP;

  -- 2. COMPLETE campaigns that have passed their end date. The status
  --    trigger clears the listing flags.
  WITH updated_complete AS (
    UPDATE public.campaigns
       SET status = 'completed', updated_at = now()
     WHERE status::text = 'active'
       AND end_date::date < CURRENT_DATE
    RETURNING id
  )
  SELECT COUNT(*) INTO completed_count FROM updated_complete;

  -- 3. Campaigns expiring in 3 days (for notifications).
  SELECT COUNT(*) INTO expiring_count
    FROM public.campaigns
   WHERE status::text = 'active'
     AND end_date::date = CURRENT_DATE + 3;

  -- 4. Campaigns starting within 3 days with no creative uploaded.
  SELECT COUNT(*) INTO deadline_count
    FROM public.campaigns c
   WHERE c.status::text = 'pending_creative'
     AND c.start_date::date <= CURRENT_DATE + 3
     AND NOT EXISTS (
           SELECT 1 FROM public.campaign_creatives cc WHERE cc.campaign_id = c.id
         )
     AND NOT EXISTS (
           SELECT 1 FROM public.sponsored_listing_links l WHERE l.campaign_id = c.id
         );

  result := json_build_object(
    'activated', activated_count,
    'activation_skipped', skipped_count,
    'completed', completed_count,
    'expiring_soon', expiring_count,
    'deadline_warnings', deadline_count,
    'processed_at', now()
  );

  RETURN result;
END;
$$;

-- ============================================================================
-- 6. Backfill: bring every linked listing into line with its campaign now.
-- ============================================================================
DO $$
DECLARE
  r RECORD;
  v_total integer := 0;
  v_campaigns integer := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT l.campaign_id
      FROM public.sponsored_listing_links l
  LOOP
    v_campaigns := v_campaigns + 1;
    v_total := v_total + public.sync_campaign_sponsorship(r.campaign_id);
  END LOOP;
  RAISE NOTICE 'WEB-ADS-001 backfill: % campaign(s) with sponsored links checked, % listing row(s) written',
    v_campaigns, v_total;
END $$;
