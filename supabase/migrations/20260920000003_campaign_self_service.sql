-- WEB-ADS-011 AC2: an advertiser can cancel, pause and resume their own
-- campaign, and ask for a refund, without emailing anybody.
--
-- CampaignDashboard and CampaignDetail rendered Upload / View / Analytics and
-- nothing else, refunds were admin-only in process-stripe-refund, and
-- AdvertiseCancel only navigated. An advertiser who changed their mind had no
-- button at all.
--
-- ── WHY THESE ARE FUNCTIONS AND NOT AN UPDATE FROM THE BROWSER ──────────────
--
-- CLAUDE.md: money is decided on the server. Pausing moves end_date, and
-- end_date is how many days someone paid for. A browser that computed the new
-- end_date could extend a campaign for free by changing one number in a
-- request, and RLS cannot tell a legitimate new end_date from an invented one -
-- it can only say whose row it is. The arithmetic has to live where the
-- authority does, which is here.
--
-- Cancelling is restricted to the statuses where NO money has moved. An active
-- campaign's refund is a request, not a self-service action: a ticket for a
-- human, and process-stripe-refund stays admin-only.

-- ── cancel_campaign ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_campaign(p_campaign_id uuid)
RETURNS public.campaign_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c public.campaigns%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.campaigns WHERE id = p_campaign_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cancel_campaign: campaign % not found', p_campaign_id;
  END IF;

  IF NOT (public.is_admin() OR (auth.uid() IS NOT NULL AND auth.uid() = c.user_id)) THEN
    RAISE EXCEPTION 'cancel_campaign: not authorized';
  END IF;

  -- Only where nothing has been charged. A paid campaign is a refund question,
  -- and letting self-service answer it would put the site in the position of
  -- having taken money for something the advertiser cancelled with one click
  -- and no record of what was owed back.
  IF c.status NOT IN ('draft', 'pending_payment') THEN
    RAISE EXCEPTION 'cancel_campaign: a % campaign cannot be cancelled here', c.status;
  END IF;

  UPDATE public.campaigns
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_campaign_id;

  RETURN 'cancelled'::public.campaign_status;
END;
$$;

-- ── set_campaign_paused ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_campaign_paused(
  p_campaign_id uuid,
  p_paused boolean
)
RETURNS public.campaign_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c public.campaigns%ROWTYPE;
  v_remaining integer;
BEGIN
  SELECT * INTO c FROM public.campaigns WHERE id = p_campaign_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'set_campaign_paused: campaign % not found', p_campaign_id;
  END IF;

  IF NOT (public.is_admin() OR (auth.uid() IS NOT NULL AND auth.uid() = c.user_id)) THEN
    RAISE EXCEPTION 'set_campaign_paused: not authorized';
  END IF;

  IF p_paused THEN
    IF c.status <> 'active' THEN
      RAISE EXCEPTION 'set_campaign_paused: only an active campaign can be paused (this one is %)', c.status;
    END IF;

    -- greatest(0, ...) because a campaign whose end_date has passed but which
    -- the lifecycle job has not completed yet must not bank negative days and
    -- come back with an end_date in the past.
    v_remaining := greatest(0, (c.end_date::date - current_date));

    UPDATE public.campaigns
    SET status = 'paused',
        paused_at = now(),
        days_remaining_at_pause = v_remaining,
        updated_at = now()
    WHERE id = p_campaign_id;

    RETURN 'paused'::public.campaign_status;
  END IF;

  IF c.status <> 'paused' THEN
    RAISE EXCEPTION 'set_campaign_paused: only a paused campaign can be resumed (this one is %)', c.status;
  END IF;

  -- THE DAYS THEY PAID FOR, AND NO MORE. coalesce covers a row paused before
  -- this column existed: without it the resume would set end_date to today and
  -- silently end the campaign.
  UPDATE public.campaigns
  SET status = 'active',
      end_date = (current_date + coalesce(c.days_remaining_at_pause, 0))::date,
      paused_at = NULL,
      days_remaining_at_pause = NULL,
      updated_at = now()
  WHERE id = p_campaign_id;

  RETURN 'active'::public.campaign_status;
END;
$$;

-- ── request_campaign_refund ─────────────────────────────────────────────────
--
-- A ticket, not a refund. process-stripe-refund stays admin-only and unchanged:
-- what an advertiser gets here is a record that a human is obliged to answer,
-- which is what they did not have.
CREATE OR REPLACE FUNCTION public.request_campaign_refund(
  p_campaign_id uuid,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c public.campaigns%ROWTYPE;
  v_ticket_id uuid;
BEGIN
  SELECT * INTO c FROM public.campaigns WHERE id = p_campaign_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_campaign_refund: campaign % not found', p_campaign_id;
  END IF;

  IF NOT (public.is_admin() OR (auth.uid() IS NOT NULL AND auth.uid() = c.user_id)) THEN
    RAISE EXCEPTION 'request_campaign_refund: not authorized';
  END IF;

  -- Nothing was charged for these, so there is nothing to refund and a ticket
  -- would only waste the reader's time.
  IF c.status IN ('draft', 'pending_payment', 'cancelled', 'refunded') THEN
    RAISE EXCEPTION 'request_campaign_refund: a % campaign has no payment to refund', c.status;
  END IF;

  -- One open request per campaign. Pressing the button twice must not make two
  -- tickets a human then has to reconcile.
  SELECT id INTO v_ticket_id
  FROM public.support_tickets
  WHERE source_ref = p_campaign_id::text
    AND category = 'campaign_refund'
    AND status NOT IN ('resolved', 'closed')
  LIMIT 1;

  IF v_ticket_id IS NOT NULL THEN
    RETURN v_ticket_id;
  END IF;

  INSERT INTO public.support_tickets (user_id, channel, category, subject, body, source_ref, status, priority)
  VALUES (
    c.user_id,
    'in_app',
    'campaign_refund',
    'Refund requested: ' || c.name,
    coalesce(nullif(btrim(p_reason), ''), 'No reason given.')
      || E'\n\nCampaign: ' || c.id::text
      || E'\nStatus: ' || c.status::text
      || E'\nAmount: ' || coalesce(c.total_cost::text, 'unknown'),
    p_campaign_id::text,
    'new',
    'normal'
  )
  RETURNING id INTO v_ticket_id;

  RETURN v_ticket_id;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_campaign(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_campaign(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_campaign(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.set_campaign_paused(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_campaign_paused(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_campaign_paused(uuid, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.request_campaign_refund(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_campaign_refund(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.request_campaign_refund(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.set_campaign_paused(uuid, boolean) IS
  'Pause or resume a campaign, preserving the days paid for (WEB-ADS-011). Owner or admin.';
