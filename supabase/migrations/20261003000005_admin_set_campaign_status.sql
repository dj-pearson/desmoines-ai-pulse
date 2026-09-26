-- NON_CORE_REVIEW_2026-09 WP3: an admin pauses, resumes or cancels a campaign
-- through one server path, with an audit row and a notice to the advertiser.
--
-- WHAT THIS REPLACES.
--   - AdminCampaigns "End Early" wrote is_sponsored = false on the listing and
--     status = 'cancelled' on the campaign from the browser: two writes, no
--     transaction, no record of who or why, and the advertiser was not told.
--     Clearing the listing by hand also un-sponsored it when another ACTIVE
--     campaign still paid for it; the status trigger (20260902000001) already
--     does this correctly on 'cancelled'.
--   - useAdminCampaigns.updateCampaignStatus writes any status the enum
--     allows, including 'active' on a campaign nobody paid for.
--
-- WHAT IT DOES.
--   admin_set_campaign_status(campaign, status, reason) accepts three
--   transitions and refuses everything else:
--     active   -> paused     banks the days left, like set_campaign_paused
--     paused   -> active     end_date = today + the banked days
--     draft | pending_payment | pending_creative | pending_review | active
--              | paused -> cancelled
--   'active' is only reachable from 'paused': starting a campaign is
--   activate_campaign's job, behind payment and creative approval.
--   Cancelling a paid campaign does NOT refund it; process-stripe-refund does
--   that, and says so in the notice.
--
--   A reason is required. It goes into admin_action_logs (who, what, before
--   and after) and into the advertiser's campaign_notifications row, which is
--   flagged email_pending (20261003000003) for the email sender.
--
-- DEPENDS ON 20260920000002/3 for the 'paused' enum label and the paused_at /
-- days_remaining_at_pause columns. Without them, pause and resume raise (the
-- function body is only resolved when it runs) and cancel still works.
--
-- NOTICE TYPES. campaign_paused, campaign_resumed and campaign_cancelled are
-- added to the campaign_notifications CHECK. Widening only: every value
-- allowed before is still allowed. NOT VALID skips the scan of existing rows,
-- which the wider list accepts anyway. scripts/check-migration-safety.mjs
-- flags any ADD ... CHECK, so the PR carries the migration-override label.
--
-- BACKWARD COMPATIBILITY (CLAUDE.md): a new function, a widened CHECK. No
-- existing policy, column or RPC changes.

ALTER TABLE public.campaign_notifications
  DROP CONSTRAINT IF EXISTS campaign_notifications_notification_type_check;

ALTER TABLE public.campaign_notifications
  ADD CONSTRAINT campaign_notifications_notification_type_check
  CHECK (notification_type IN (
    'campaign_created',
    'payment_received',
    'creative_uploaded',
    'creative_approved',
    'creative_rejected',
    'campaign_activated',
    'campaign_expiring_soon',
    'campaign_completed',
    'campaign_rejected',
    'campaign_refunded',
    'creative_deadline_warning',
    'checkout_expired',
    'campaign_paused',
    'campaign_resumed',
    'campaign_cancelled'
  )) NOT VALID;

COMMENT ON CONSTRAINT campaign_notifications_notification_type_check
  ON public.campaign_notifications IS
  'Allowed notification types. checkout_expired added 2026-09-20 (WEB-ADS-011 AC4); campaign_paused/resumed/cancelled added 2026-10-03 (admin_set_campaign_status).';

CREATE OR REPLACE FUNCTION public.admin_set_campaign_status(
  p_campaign_id uuid,
  p_status text,
  p_reason text
)
RETURNS public.campaign_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c public.campaigns%ROWTYPE;
  v_admin uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'America/Chicago')::date;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_from text;
  v_remaining integer;
  v_type text;
  v_title text;
  v_message text;
BEGIN
  IF v_admin IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_set_campaign_status: admin only' USING ERRCODE = '42501';
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('paused', 'active', 'cancelled') THEN
    RAISE EXCEPTION 'admin_set_campaign_status: % is not a status an admin sets here (paused, active, cancelled)', p_status
      USING ERRCODE = '22023';
  END IF;

  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'admin_set_campaign_status: a reason is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO c FROM public.campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_set_campaign_status: campaign % not found', p_campaign_id USING ERRCODE = 'P0002';
  END IF;
  v_from := c.status::text;

  IF p_status = 'paused' THEN
    IF v_from <> 'active' THEN
      RAISE EXCEPTION 'admin_set_campaign_status: only an active campaign can be paused (this one is %)', v_from;
    END IF;
    -- The days left, on the Des Moines calendar, as set_campaign_paused does.
    v_remaining := greatest(0, c.end_date::date - v_today);
    UPDATE public.campaigns
       SET status = 'paused',
           paused_at = now(),
           days_remaining_at_pause = v_remaining,
           updated_at = now()
     WHERE id = p_campaign_id;
    v_type := 'campaign_paused';
    v_title := 'Campaign paused: ' || c.name;
    v_message := 'We paused your campaign "' || c.name || '". Reason: ' || v_reason
      || '. The days you have left are kept and start again when it resumes.';

  ELSIF p_status = 'active' THEN
    IF v_from <> 'paused' THEN
      RAISE EXCEPTION 'admin_set_campaign_status: only a paused campaign can be resumed (this one is %)', v_from;
    END IF;
    UPDATE public.campaigns
       SET status = 'active',
           end_date = (v_today + coalesce(c.days_remaining_at_pause, 0))::date,
           paused_at = NULL,
           days_remaining_at_pause = NULL,
           updated_at = now()
     WHERE id = p_campaign_id;
    v_type := 'campaign_resumed';
    v_title := 'Campaign resumed: ' || c.name;
    v_message := 'Your campaign "' || c.name || '" is running again through '
      || to_char((v_today + coalesce(c.days_remaining_at_pause, 0))::date, 'FMMonth FMDD, YYYY')
      || '. Note from our team: ' || v_reason || '.';

  ELSE
    IF v_from NOT IN ('draft', 'pending_payment', 'pending_creative', 'pending_review', 'active', 'paused') THEN
      RAISE EXCEPTION 'admin_set_campaign_status: a % campaign cannot be cancelled', v_from;
    END IF;
    -- The status trigger (20260902000001) clears the sponsored-listing flag
    -- unless another active campaign still pays for that listing.
    UPDATE public.campaigns
       SET status = 'cancelled', updated_at = now()
     WHERE id = p_campaign_id;
    v_type := 'campaign_cancelled';
    v_title := 'Campaign cancelled: ' || c.name;
    v_message := 'We cancelled your campaign "' || c.name || '" and its ads have stopped. Reason: ' || v_reason
      || CASE WHEN c.stripe_payment_intent_id IS NOT NULL
              THEN '. Any refund is handled separately and you will get its own email.'
              ELSE '.'
         END;
  END IF;

  INSERT INTO public.admin_action_logs
    (admin_user_id, action_type, action_description, target_resource, target_id, old_values, new_values)
  VALUES (
    v_admin,
    'campaign_status',
    'Campaign ' || v_from || ' -> ' || p_status || ': ' || v_reason,
    'campaigns',
    p_campaign_id::text,
    jsonb_build_object('status', v_from, 'end_date', c.end_date),
    jsonb_build_object('status', p_status, 'reason', v_reason)
  );

  IF c.user_id IS NOT NULL THEN
    INSERT INTO public.campaign_notifications
      (campaign_id, recipient_user_id, notification_type, title, message, is_read, metadata, email_pending)
    VALUES (
      p_campaign_id,
      c.user_id,
      v_type,
      v_title,
      v_message,
      false,
      jsonb_build_object('from_status', v_from, 'to_status', p_status, 'reason', v_reason),
      true
    );
  END IF;

  RETURN p_status::public.campaign_status;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_campaign_status(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_campaign_status(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_campaign_status(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.admin_set_campaign_status(uuid, text, text) IS
  'Admin pause / resume / cancel with a required reason, an admin_action_logs row and an advertiser notice (NON_CORE_REVIEW WP3).';
