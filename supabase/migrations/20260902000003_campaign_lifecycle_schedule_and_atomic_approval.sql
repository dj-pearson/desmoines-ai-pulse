-- WEB-ADS-004 (part 2 of 2): campaigns approved before their start date never
-- activated, finished campaigns never completed, and approval was two writes.
--
-- Three things here, all additive:
--
--   1. approve_campaign_creative(creative_id, image_url): approving a creative
--      and moving its campaign (to active through activate_campaign, or to
--      pending_review when the start date is ahead) is ONE transaction. The
--      client used to write is_approved = true, then read the campaign, then
--      write the status; when the third step failed the first had already
--      committed and the campaign sat approved-but-stuck. Now a failure in any
--      step rolls back the whole approval and the admin retries.
--
--   2. process_campaign_lifecycle is scheduled. It has existed since
--      20260227000000 and no cron.schedule ever called it. The job is pure
--      SQL (SELECT public.process_campaign_lifecycle()), so it needs no
--      service-role key and cannot join the pile of jobs in WEB-OPS-007 that
--      die on missing credentials. Runs at 06:10 UTC = 01:10 CDT / 00:10 CST,
--      after local midnight so CURRENT_DATE (UTC) is the same calendar day as
--      Des Moines when start_date/end_date are compared.
--
--   3. renewal_eligible: the lifecycle job sets it true when it completes a
--      campaign, so the column the client types finally has a writer.
--      auto_renew is NOT acted on here; honouring it means charging a card,
--      which WEB-ADS-011 owns together with the self-serve cancel/renew UI.
--      The campaigns table was created outside migrations, so the column
--      write is guarded by information_schema and skipped if it is absent.
--
-- Requires 20260902000001 (activate_campaign, the sponsorship trigger) and
-- 20260902000002 (the pending_review / suspended labels).

-- ============================================================================
-- 1. Atomic creative approval
-- ============================================================================
CREATE OR REPLACE FUNCTION public.approve_campaign_creative(
  p_creative_id uuid,
  p_image_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign_id uuid;
  v_campaign public.campaigns%ROWTYPE;
  v_total integer;
  v_unapproved integer;
  v_all_approved boolean;
  v_activated boolean := false;
  v_status text;
BEGIN
  -- An admin action on someone's paid campaign. reviewed_by below is the audit
  -- trail, so an anonymous or non-admin caller is refused before any write.
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'approve_campaign_creative: admin role required'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.campaign_creatives
     SET is_approved = true,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         rejection_reason = NULL,
         -- The client publishes the private review copy to the public bucket
         -- first and passes the resulting URL. NULL keeps whatever is stored.
         image_url = COALESCE(p_image_url, image_url)
   WHERE id = p_creative_id
   RETURNING campaign_id INTO v_campaign_id;

  IF v_campaign_id IS NULL THEN
    RAISE EXCEPTION 'approve_campaign_creative: creative % not found', p_creative_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_campaign
    FROM public.campaigns
   WHERE id = v_campaign_id
   FOR UPDATE;

  SELECT count(*), count(*) FILTER (WHERE is_approved IS NOT TRUE)
    INTO v_total, v_unapproved
    FROM public.campaign_creatives
   WHERE campaign_id = v_campaign_id;

  -- [].every() is true; count > 0 is the guard against activating a campaign
  -- whose creatives an RLS change or a bad id made invisible.
  v_all_approved := v_total > 0 AND v_unapproved = 0;
  v_status := v_campaign.status::text;

  IF v_all_approved AND v_status IN ('pending_creative', 'pending_review') THEN
    IF v_campaign.start_date::date <= CURRENT_DATE THEN
      PERFORM public.activate_campaign(v_campaign_id);
      v_activated := true;
      v_status := 'active';
    ELSIF v_status = 'pending_creative' THEN
      -- Approved, waiting for the start date; the lifecycle job activates it.
      UPDATE public.campaigns
         SET status = 'pending_review', updated_at = now()
       WHERE id = v_campaign_id;
      v_status := 'pending_review';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'creative_id', p_creative_id,
    'campaign_id', v_campaign_id,
    'user_id', v_campaign.user_id,
    'name', v_campaign.name,
    'all_approved', v_all_approved,
    'activated', v_activated,
    'status', v_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_campaign_creative(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_campaign_creative(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.approve_campaign_creative(uuid, text) IS
'WEB-ADS-004. Admin-only. Marks a creative approved and, when every creative on the campaign is approved, activates the campaign (start date reached, via activate_campaign) or parks it in pending_review for the lifecycle job. One transaction, so a failure cannot leave is_approved true with a stale status.';

-- ============================================================================
-- 2. process_campaign_lifecycle: same body as 20260902000001 plus
--    renewal_eligible on completion.
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
    'processed_at', now()
  );

  RETURN result;
END;
$$;

-- ============================================================================
-- 3. Schedule it. Idempotent; a no-op where pg_cron is absent.
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed; skipping campaign-lifecycle-daily schedule';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'campaign-lifecycle-daily') THEN
    PERFORM cron.unschedule('campaign-lifecycle-daily');
  END IF;

  -- Pure SQL: no net.http_post, no service-role key, nothing for WEB-OPS-007's
  -- missing credentials to break. cron_health_snapshot picks the job up from
  -- cron.job automatically.
  PERFORM cron.schedule(
    'campaign-lifecycle-daily',
    '10 6 * * *',
    $cron$ SELECT public.process_campaign_lifecycle(); $cron$
  );
END $$;
