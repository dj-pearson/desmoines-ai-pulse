-- WEB-ADS-011 AC3: renew a campaign before it ends, not after.
--
-- TWO CHANGES, and the first is why the second is worth having.
--
-- 1. renewal_eligible was written in exactly one place - on COMPLETION, in
--    20260902000003. By then the campaign is over, so renewing it buys a gap:
--    the ads stop, and start again whenever the advertiser gets round to it.
--    The story asks for the flag seven days BEFORE the end, which is the window
--    that keeps coverage continuous. process_campaign_lifecycle is replaced
--    below with that step added; everything else in it is the 20260902000003
--    body, unchanged.
--
--    THE TEST THAT READS THIS. supabase/functions/_tests/campaign-lifecycle-contract.test.ts
--    asserted against 20260902000003's copy of the function. A CREATE OR REPLACE
--    in a later file would leave it validating a definition the database no
--    longer has - passing while the deployed function drifts. It now resolves
--    the NEWEST migration defining the function, and
--    scripts/__tests__/campaign-renewal.test.mjs fails if any migration newer
--    than the one it reads redefines it.
--
-- 2. renew_campaign clones a campaign as a DRAFT the advertiser then pays for.
--
--    IT DOES NOT COPY THE PRICE. The clone inserts placement_type only, and
--    trg_campaign_placement_pricing (20260902000008) fills days_count,
--    daily_cost and total_cost from the rate card for the NEW dates. That
--    trigger exempts the service role and admins, and this function is
--    SECURITY DEFINER but auth.role() still reads the caller's JWT - so an
--    advertiser renewing their own campaign is priced by the card, at today's
--    rates rather than at whatever the original cost. CLAUDE.md: money is
--    decided on the server, from one rate card.
--
--    It takes no dates. The new window is the source campaign's own length,
--    starting the day after it ends (or today, whichever is later), and the
--    draft is editable on /advertise afterwards like any other.

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
  renewal_window_count INT := 0;
  completed_ids uuid[] := '{}';
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
  --    trigger (20260902000001) clears the sponsored listing flags.
  WITH updated_complete AS (
    UPDATE public.campaigns
       SET status = 'completed', updated_at = now()
     WHERE status::text = 'active'
       AND end_date::date < CURRENT_DATE
    RETURNING id
  )
  SELECT COALESCE(array_agg(id), '{}'), COUNT(*)
    INTO completed_ids, completed_count
    FROM updated_complete;

  -- A completed campaign may be bought again. The column lives on a table
  -- created outside migrations, so its presence is checked rather than assumed.
  IF completed_count > 0 AND EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'campaigns'
          AND column_name = 'renewal_eligible'
     )
  THEN
    EXECUTE 'UPDATE public.campaigns SET renewal_eligible = true WHERE id = ANY($1)'
      USING completed_ids;
  END IF;

  -- 2b. FLAG THE RENEWAL WINDOW (WEB-ADS-011 AC3).
  --
  -- renewal_eligible was written in one place: on COMPLETION, above. By then
  -- the campaign is over, so renewing it buys a gap - the advertiser's ads stop
  -- and start again whenever they get round to it. Seven days before the end is
  -- the window the story asks for and the one that keeps coverage continuous.
  --
  -- Guarded the same way the completion write is: the column lives on a table
  -- created outside migrations, so its presence is checked rather than assumed.
  IF EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'campaigns'
          AND column_name = 'renewal_eligible'
     )
  THEN
    -- Paused campaigns are excluded on purpose: their end_date moves when they
    -- resume, so a date seven days out means nothing yet.
    EXECUTE $flag$
      WITH flagged AS (
        UPDATE public.campaigns
           SET renewal_eligible = true, updated_at = now()
         WHERE status::text = 'active'
           AND end_date::date <= CURRENT_DATE + 7
           AND renewal_eligible IS NOT TRUE
        RETURNING id
      )
      SELECT COUNT(*) FROM flagged
    $flag$ INTO renewal_window_count;
  END IF;

  -- 3. Campaigns expiring in 3 days (for notifications).
  SELECT COUNT(*) INTO expiring_count
    FROM public.campaigns
   WHERE status::text = 'active'
     AND end_date::date = CURRENT_DATE + 3;

  -- 4. Campaigns starting within 3 days with nothing to serve.
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
    'renewal_window', renewal_window_count,
    'processed_at', now()
  );

  RETURN result;
END;
$$;

-- ── renew_campaign ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.renew_campaign(p_campaign_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c public.campaigns%ROWTYPE;
  v_days integer;
  v_start date;
  v_new_id uuid;
BEGIN
  SELECT * INTO c FROM public.campaigns WHERE id = p_campaign_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'renew_campaign: campaign % not found', p_campaign_id;
  END IF;

  IF NOT (public.is_admin() OR (auth.uid() IS NOT NULL AND auth.uid() = c.user_id)) THEN
    RAISE EXCEPTION 'renew_campaign: not authorized';
  END IF;

  -- Only a campaign that has actually run. Renewing a draft or an unpaid one
  -- would just make a second draft, and renewing a rejected one would carry a
  -- creative nobody approved into a new campaign.
  IF c.status::text NOT IN ('active', 'paused', 'completed') THEN
    RAISE EXCEPTION 'renew_campaign: a % campaign cannot be renewed', c.status;
  END IF;

  IF c.start_date IS NULL OR c.end_date IS NULL THEN
    RAISE EXCEPTION 'renew_campaign: campaign % has no dates to copy', p_campaign_id;
  END IF;

  -- Same length as the original. greatest(1, ...) so a one-day campaign renews
  -- as one day rather than zero.
  v_days := greatest(1, (c.end_date::date - c.start_date::date) + 1);
  -- The day after the original ends, or today if it ended a while ago.
  v_start := greatest(current_date, c.end_date::date + 1);

  INSERT INTO public.campaigns (user_id, name, status, start_date, end_date, original_campaign_id, traffic_tier)
  VALUES (
    c.user_id,
    c.name,
    'draft',
    v_start,
    (v_start + (v_days - 1))::date,
    c.id,
    c.traffic_tier
  )
  RETURNING id INTO v_new_id;

  -- Placement TYPES only. Every price column is left to the pricing trigger.
  INSERT INTO public.campaign_placements (campaign_id, placement_type)
  SELECT v_new_id, p.placement_type
    FROM public.campaign_placements p
   WHERE p.campaign_id = c.id;

  -- The source has been renewed; it should not keep prompting.
  UPDATE public.campaigns
  SET renewal_eligible = false, updated_at = now()
  WHERE id = c.id;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.renew_campaign(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.renew_campaign(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.renew_campaign(uuid) TO authenticated;

COMMENT ON FUNCTION public.renew_campaign(uuid) IS
  'Clone a campaign as an unpaid draft for the same length, priced from the rate card at today''s rates (WEB-ADS-011 AC3). Owner or admin.';
