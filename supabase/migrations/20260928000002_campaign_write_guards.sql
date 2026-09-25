-- Column guards on campaigns and campaign_creatives (business plan WP4 item 3).
--
-- Neither table has a policy in the ledger (docs/RLS_AUDIT.md has no rows for
-- either), and CreativeUploadForm.tsx:28-31 records that an owner could once
-- write campaigns.status from the browser. RLS can say whose row it is; it
-- cannot say which columns the owner may touch. Whatever the live policies
-- turn out to be, a BEFORE trigger runs under all of them, which is why this is
-- a trigger and not a policy (the same reasoning as 20260902000008).
--
-- WHO IS TRUSTED. server_write_is_trusted() below, in this order:
--   * the service role (edge functions: checkout, verify, stripe-webhook);
--   * any SECURITY DEFINER function. Inside one, current_user is the function's
--     owner, not `authenticated`. That covers the self-service RPCs
--     (cancel_campaign, set_campaign_paused, renew_campaign from
--     20260920000003/4), and also approve_campaign_creative,
--     activate_campaign, process_campaign_lifecycle (cron) and
--     sync_campaign_total_cost, the AFTER trigger on campaign_placements that
--     rewrites campaigns.total_cost on every placement insert. The plan
--     proposed a transaction-local flag set by each self-service RPC instead;
--     that would have missed sync_campaign_total_cost and failed every
--     advertiser's placement insert, and it would have meant re-creating four
--     RPCs whose bodies scripts/__tests__/campaign-self-service.test.mjs and
--     campaign-renewal.test.mjs read from their original files. So the RPCs are
--     not re-created: their SECURITY DEFINER context already identifies them.
--   * an admin (is_admin()).
-- Everyone else is a browser writing as `anon` or `authenticated`.
--
-- For this reason the guard functions are SECURITY INVOKER on purpose. A
-- SECURITY DEFINER trigger function would see its own owner as current_user
-- and trust everybody.
--
-- COLUMNS THAT MAY NOT EXIST. campaigns.paused_at and days_remaining_at_pause
-- arrive with 20260920000003, which may not be applied. The guards compare
-- to_jsonb(NEW) and to_jsonb(OLD) and reset through jsonb_populate_record, both
-- of which treat an absent column as absent instead of erroring.
--
-- TIGHTENING (CLAUDE.md, Backward Compatibility): the browser loses writes it
-- has today. Every shipped web client already inserts status 'draft' and
-- writes none of the refused columns; no iOS or Android build writes these
-- tables (confirm before applying, plan D2). Apply is deferred to D2.

-- ---------------------------------------------------------------------------
-- 0. Who may write the columns that decide money and review.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.server_write_is_trusted()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(auth.role(), '') = 'service_role'
      OR current_user NOT IN ('anon', 'authenticated')
      OR public.is_admin();
$$;

COMMENT ON FUNCTION public.server_write_is_trusted() IS
'True for the service role, inside any SECURITY DEFINER function (current_user is the owner, not authenticated), and for admins. Must stay SECURITY INVOKER: as a definer it would trust every caller.';

-- ---------------------------------------------------------------------------
-- 1. campaigns
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_campaign_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new jsonb;
  v_old jsonb;
  v_col text;
BEGIN
  IF public.server_write_is_trusted() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- A campaign starts as an unpaid draft. Payment state is the checkout
    -- function's to set, from Stripe, never the browser's.
    NEW.status := 'draft';
    NEW := jsonb_populate_record(NEW, jsonb_build_object(
      'stripe_session_id', NULL,
      'stripe_payment_intent_id', NULL,
      'paused_at', NULL,
      'days_remaining_at_pause', NULL,
      'original_campaign_id', NULL
    ));
    RETURN NEW;
  END IF;

  -- UPDATE. Refuse, rather than silently revert, so a client that tries gets
  -- an error it can see instead of a success that did nothing.
  v_new := to_jsonb(NEW);
  v_old := to_jsonb(OLD);

  FOREACH v_col IN ARRAY ARRAY[
    'status',
    'total_cost',
    'stripe_session_id',
    'stripe_payment_intent_id',
    'paused_at',
    'days_remaining_at_pause',
    'renewal_eligible',
    'original_campaign_id',
    'user_id',
    'approval_notes',
    'rejected_reason'
  ]
  LOOP
    IF (v_new -> v_col) IS DISTINCT FROM (v_old -> v_col) THEN
      RAISE EXCEPTION 'campaigns.% can only be changed by the server', v_col
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  -- Dates decide how many days are paid for. They are the owner's to choose
  -- while the campaign is an unpaid draft, and the server's after that
  -- (set_campaign_paused moves end_date on resume; nothing else may).
  IF OLD.status::text <> 'draft' AND (
       NEW.start_date IS DISTINCT FROM OLD.start_date
    OR NEW.end_date IS DISTINCT FROM OLD.end_date
  ) THEN
    RAISE EXCEPTION 'campaign dates can only be changed while the campaign is a draft'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_campaign_writes ON public.campaigns;
CREATE TRIGGER trg_guard_campaign_writes
  BEFORE INSERT OR UPDATE ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_campaign_writes();

COMMENT ON FUNCTION public.guard_campaign_writes() IS
'Business plan WP4 item 3. For callers that are not the service role, a SECURITY DEFINER function or an admin: INSERT forces status draft and nulls stripe_* and the pause/renewal columns; UPDATE raises 42501 on status, money, Stripe, pause, renewal, ownership and review columns, and on dates once the campaign is past draft.';

-- ---------------------------------------------------------------------------
-- 2. campaign_creatives
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_campaign_creative_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new jsonb;
  v_old jsonb;
  v_col text;
BEGIN
  IF public.server_write_is_trusted() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Uploads go to the private ad-creatives-review bucket (review_path).
    -- image_url is the PUBLIC url, set only when an admin approves and the
    -- file is copied across; an owner-supplied one would serve unreviewed
    -- artwork the moment the campaign activates.
    NEW.is_approved := false;
    NEW.image_url := NULL;
    NEW := jsonb_populate_record(NEW, jsonb_build_object(
      'reviewed_by', NULL,
      'reviewed_at', NULL,
      'rejection_reason', NULL,
      'auto_reviewed', false,
      'auto_review_reasons', NULL,
      'auto_review_checks', NULL
    ));
    RETURN NEW;
  END IF;

  v_new := to_jsonb(NEW);
  v_old := to_jsonb(OLD);

  FOREACH v_col IN ARRAY ARRAY[
    'is_approved',
    'image_url',
    'reviewed_by',
    'reviewed_at',
    'rejection_reason',
    'auto_reviewed',
    'auto_review_reasons',
    'auto_review_checks',
    'campaign_id'
  ]
  LOOP
    IF (v_new -> v_col) IS DISTINCT FROM (v_old -> v_col) THEN
      RAISE EXCEPTION 'campaign_creatives.% can only be changed by review', v_col
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  -- An approval is of THIS content. Change what the ad says, where it links,
  -- which file it shows or which slot it runs in, and it goes back to review.
  FOREACH v_col IN ARRAY ARRAY[
    'title',
    'description',
    'link_url',
    'cta_text',
    'review_path',
    'placement_type'
  ]
  LOOP
    IF (v_new -> v_col) IS DISTINCT FROM (v_old -> v_col) THEN
      NEW.is_approved := false;
      NEW := jsonb_populate_record(NEW, jsonb_build_object(
        'reviewed_by', NULL,
        'reviewed_at', NULL,
        'auto_reviewed', false
      ));
      EXIT;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_campaign_creative_writes ON public.campaign_creatives;
CREATE TRIGGER trg_guard_campaign_creative_writes
  BEFORE INSERT OR UPDATE ON public.campaign_creatives
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_campaign_creative_writes();

COMMENT ON FUNCTION public.guard_campaign_creative_writes() IS
'Business plan WP4 item 3. For untrusted callers: INSERT forces is_approved false and nulls image_url and the review columns; UPDATE raises 42501 on those columns and on campaign_id, and sends the creative back to review when its title, description, link_url, cta_text, review_path or placement_type change.';
