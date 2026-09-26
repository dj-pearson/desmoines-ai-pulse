-- NON_CORE_REVIEW_2026-09 WP3: the lifecycle job writes the advertiser
-- notices it used to only count, and runs on the Des Moines calendar.
--
-- 1. COUNTED, NEVER SENT.
--    process_campaign_lifecycle returned 'expiring_soon' and
--    'deadline_warnings' as numbers in its JSON and did nothing else with them,
--    and an activation or a completion told nobody. The notice types
--    (campaign_activated, campaign_expiring_soon, campaign_completed,
--    creative_deadline_warning) have been in the campaign_notifications CHECK
--    since 20260227000000 with no writer.
--
--    The job now inserts one campaign_notifications row per campaign per
--    notice, for the advertiser (recipient_user_id = campaigns.user_id). Each
--    insert is guarded by NOT EXISTS on (campaign_id, notification_type), so a
--    re-run, a missed day or a manual call never sends the same notice twice.
--
-- 2. THE HOOK FOR EMAIL.
--    These rows are the in-app bell. Email for them is the email work
--    package's job (WP2), and a database function should not call a mail
--    provider. So the rows carry email_pending = true: a sender picks up
--    WHERE email_pending, resolves recipient_email from auth.users, sends,
--    and sets email_pending = false, emailed_at = now(). Rows other writers
--    insert (the webhook, send-campaign-notification) leave it NULL, because
--    those writers already send their own mail.
--
-- 3. UTC DATES.
--    Every comparison used CURRENT_DATE, which is UTC on Supabase. The daily
--    run at 06:10 UTC (20260902000003) is 00:10-01:10 Central, after midnight
--    in Des Moines, so the two calendars agree at that hour. They disagree for
--    any run between 7pm and midnight Central (a manual call, a changed
--    schedule), which would activate tomorrow's campaigns and complete
--    today's a day early. Dates are now compared with the America/Chicago
--    date, the calendar /advertise and create-campaign-checkout count days
--    on, so the answer no longer depends on when the job happens to run.
--
-- Everything else is 20260920000004's body unchanged: activation still goes
-- only through activate_campaign, the renewal window and completion flag are
-- still guarded on the column existing, paused campaigns are still left out
-- of the renewal window. Same signature, same JSON keys (the counts now mean
-- "notices written").
--
-- BACKWARD COMPATIBILITY (CLAUDE.md): a nullable column, a nullable
-- timestamp, a partial index, and CREATE OR REPLACE with an identical
-- signature. Nothing a client reads changes shape.

ALTER TABLE public.campaign_notifications
  ADD COLUMN IF NOT EXISTS email_pending boolean,
  ADD COLUMN IF NOT EXISTS emailed_at timestamptz;

COMMENT ON COLUMN public.campaign_notifications.email_pending IS
  'true = this notice still needs an email (written by process_campaign_lifecycle and admin_set_campaign_status). The sender sets it false and stamps emailed_at. NULL = the writer sends its own email, or none.';
COMMENT ON COLUMN public.campaign_notifications.emailed_at IS
  'When the email for an email_pending notice was accepted by the provider.';

CREATE INDEX IF NOT EXISTS idx_campaign_notifications_email_pending
  ON public.campaign_notifications (created_at)
  WHERE email_pending IS TRUE;

CREATE OR REPLACE FUNCTION public.process_campaign_lifecycle()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_today date := (now() AT TIME ZONE 'America/Chicago')::date;
  activated_count INT := 0;
  activated_notice_count INT := 0;
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
       AND c.start_date::date <= v_today
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

  -- 1b. "Your campaign is live." For every campaign that went live today or
  --     yesterday and has not been told: the loop above, and
  --     approve_campaign_creative, which activates on approval when the start
  --     date has already come. A resumed campaign has an older start_date and
  --     is not re-announced.
  INSERT INTO public.campaign_notifications
    (campaign_id, recipient_user_id, notification_type, title, message, is_read, metadata, email_pending)
  SELECT c.id, c.user_id, 'campaign_activated',
         'Your campaign is live: ' || c.name,
         'Your ads for "' || c.name || '" are running now'
           || coalesce(' and will run through ' || to_char(c.end_date::date, 'FMMonth FMDD, YYYY'), '')
           || '.',
         false,
         jsonb_build_object('start_date', c.start_date, 'end_date', c.end_date),
         true
    FROM public.campaigns c
   WHERE c.status::text = 'active'
     AND c.user_id IS NOT NULL
     AND c.start_date::date >= v_today - 1
     AND c.start_date::date <= v_today
     AND NOT EXISTS (
           SELECT 1 FROM public.campaign_notifications n
            WHERE n.campaign_id = c.id AND n.notification_type = 'campaign_activated'
         );
  GET DIAGNOSTICS activated_notice_count = ROW_COUNT;

  -- 2. COMPLETE campaigns that have passed their end date. The status
  --    trigger (20260902000001) clears the sponsored listing flags.
  WITH updated_complete AS (
    UPDATE public.campaigns
       SET status = 'completed', updated_at = now()
     WHERE status::text = 'active'
       AND end_date::date < v_today
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

  -- 2a. "Your campaign has ended."
  IF completed_count > 0 THEN
    INSERT INTO public.campaign_notifications
      (campaign_id, recipient_user_id, notification_type, title, message, is_read, metadata, email_pending)
    SELECT c.id, c.user_id, 'campaign_completed',
           'Campaign finished: ' || c.name,
           'Your campaign "' || c.name || '" finished on '
             || to_char(c.end_date::date, 'FMMonth FMDD, YYYY')
             || '. Its results stay on the campaign page, and you can run it again from there.',
           false,
           jsonb_build_object('end_date', c.end_date),
           true
      FROM public.campaigns c
     WHERE c.id = ANY(completed_ids)
       AND c.user_id IS NOT NULL
       AND NOT EXISTS (
             SELECT 1 FROM public.campaign_notifications n
              WHERE n.campaign_id = c.id AND n.notification_type = 'campaign_completed'
           );
  END IF;

  -- 2b. FLAG THE RENEWAL WINDOW (WEB-ADS-011 AC3), seven days before the end.
  --     Paused campaigns are excluded: their end_date moves when they resume.
  IF EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'campaigns'
          AND column_name = 'renewal_eligible'
     )
  THEN
    EXECUTE $flag$
      WITH flagged AS (
        UPDATE public.campaigns
           SET renewal_eligible = true, updated_at = now()
         WHERE status::text = 'active'
           AND end_date::date <= (now() AT TIME ZONE 'America/Chicago')::date + 7
           AND renewal_eligible IS NOT TRUE
        RETURNING id
      )
      SELECT COUNT(*) FROM flagged
    $flag$ INTO renewal_window_count;
  END IF;

  -- 3. "Ends in N days." Once per campaign, within three days of the end. A
  --    range rather than "= today + 3" so a missed run still sends it.
  INSERT INTO public.campaign_notifications
    (campaign_id, recipient_user_id, notification_type, title, message, is_read, metadata, email_pending)
  SELECT c.id, c.user_id, 'campaign_expiring_soon',
         'Ending soon: ' || c.name,
         'Your campaign "' || c.name || '" ends on '
           || to_char(c.end_date::date, 'FMMonth FMDD, YYYY')
           || '. Renew it from the campaign page to keep your ads running without a gap.',
         false,
         jsonb_build_object('end_date', c.end_date, 'days_left', c.end_date::date - v_today),
         true
    FROM public.campaigns c
   WHERE c.status::text = 'active'
     AND c.user_id IS NOT NULL
     AND c.end_date::date BETWEEN v_today AND v_today + 3
     AND NOT EXISTS (
           SELECT 1 FROM public.campaign_notifications n
            WHERE n.campaign_id = c.id AND n.notification_type = 'campaign_expiring_soon'
         );
  GET DIAGNOSTICS expiring_count = ROW_COUNT;

  -- 4. "Upload your creative." Paid, starting within three days, nothing to
  --    serve: no creative and no sponsored listing link.
  INSERT INTO public.campaign_notifications
    (campaign_id, recipient_user_id, notification_type, title, message, is_read, metadata, email_pending)
  SELECT c.id, c.user_id, 'creative_deadline_warning',
         'Upload your ad for ' || c.name,
         'Your campaign "' || c.name || '" is set to start on '
           || to_char(c.start_date::date, 'FMMonth FMDD, YYYY')
           || ' and has no ad yet. Upload it now so it can be reviewed in time; the campaign will not start without one.',
         false,
         jsonb_build_object('start_date', c.start_date),
         true
    FROM public.campaigns c
   WHERE c.status::text = 'pending_creative'
     AND c.user_id IS NOT NULL
     AND c.start_date::date <= v_today + 3
     AND NOT EXISTS (
           SELECT 1 FROM public.campaign_creatives cc WHERE cc.campaign_id = c.id
         )
     AND NOT EXISTS (
           SELECT 1 FROM public.sponsored_listing_links l WHERE l.campaign_id = c.id
         )
     AND NOT EXISTS (
           SELECT 1 FROM public.campaign_notifications n
            WHERE n.campaign_id = c.id AND n.notification_type = 'creative_deadline_warning'
         );
  GET DIAGNOSTICS deadline_count = ROW_COUNT;

  result := json_build_object(
    'activated', activated_count,
    'activation_skipped', skipped_count,
    'activated_notices', activated_notice_count,
    'completed', completed_count,
    'expiring_soon', expiring_count,
    'deadline_warnings', deadline_count,
    'renewal_window', renewal_window_count,
    'processed_at', now()
  );

  RETURN result;
END;
$$;
