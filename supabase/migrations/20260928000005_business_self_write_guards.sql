-- A business owner cannot grant themselves a status (business plan WP4
-- item 6).
--
-- business_profiles has an owner UPDATE policy of `auth.uid() = user_id`
-- (20250817152235:108) with no WITH CHECK and no column limit, so an owner can
-- set their own verification_status to 'verified', is_featured to true or
-- monthly_fee to 0 with one PATCH. partnership_applications and
-- user_submitted_events have the same shape of problem on INSERT: the row is
-- the caller's, so RLS lets them write status, admin_notes and the review
-- columns along with it. On user_submitted_events that includes status
-- 'approved' and a quality_score of 100, which is the admin queue's input.
--
-- PIN, DON'T REFUSE. These triggers reset the admin-owned columns (to their
-- defaults on INSERT, to OLD on UPDATE) instead of raising. Every shipped
-- client already sends status 'pending' and none writes the others, so no
-- client sees a difference; one that sends a whole row back on UPDATE keeps
-- working.
--
-- Trusted callers (service role, SECURITY DEFINER functions such as
-- publish_submission and the business-claim RPCs, admins) are exempt through
-- server_write_is_trusted(), defined identically in 20260928000002 so either
-- migration can be applied alone.
--
-- Length CHECKs on title/description (the form's 200/5000 maxLength) are left
-- out on purpose: a new CHECK is a tightening, which the release flow in
-- CLAUDE.md keeps out of this release. They are listed under D10 in
-- docs/page-plans/business.md for a later one.
--
-- Apply is deferred (plan D10).

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
-- 1. business_profiles
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_business_profile_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.server_write_is_trusted() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.verification_status := 'pending';
    NEW.is_featured := false;
    NEW.partnership_tier := 'basic';
    NEW.monthly_fee := 0;
    NEW.contract_start_date := NULL;
    NEW.contract_end_date := NULL;
  ELSE
    NEW.verification_status := OLD.verification_status;
    NEW.is_featured := OLD.is_featured;
    NEW.partnership_tier := OLD.partnership_tier;
    NEW.monthly_fee := OLD.monthly_fee;
    NEW.contract_start_date := OLD.contract_start_date;
    NEW.contract_end_date := OLD.contract_end_date;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_business_profile_writes ON public.business_profiles;
CREATE TRIGGER trg_guard_business_profile_writes
  BEFORE INSERT OR UPDATE ON public.business_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_business_profile_writes();

-- ---------------------------------------------------------------------------
-- 2. partnership_applications
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_partnership_application_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.server_write_is_trusted() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pending';
    NEW.admin_notes := NULL;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
  ELSE
    NEW.status := OLD.status;
    NEW.admin_notes := OLD.admin_notes;
    NEW.reviewed_by := OLD.reviewed_by;
    NEW.reviewed_at := OLD.reviewed_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_partnership_application_writes ON public.partnership_applications;
CREATE TRIGGER trg_guard_partnership_application_writes
  BEFORE INSERT OR UPDATE ON public.partnership_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_partnership_application_writes();

-- ---------------------------------------------------------------------------
-- 3. user_submitted_events
-- ---------------------------------------------------------------------------
-- INSERT: a submission starts pending and unscored, whatever the body says.
-- UPDATE: the owner policy (20260926000001) already limits the new status to
-- 'pending'; this keeps the admin's notes and reviewer, and triage's score,
-- as they were. triage-event-submission writes with the service role and
-- publish_submission is SECURITY DEFINER, so both are exempt.
CREATE OR REPLACE FUNCTION public.guard_user_submitted_event_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.server_write_is_trusted() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pending';
    NEW.admin_notes := NULL;
    NEW.admin_reviewed_by := NULL;
    NEW.admin_reviewed_at := NULL;
    -- Triage columns arrive with 20260612000004; jsonb_populate_record skips
    -- any that are absent instead of erroring.
    NEW := jsonb_populate_record(NEW, jsonb_build_object(
      'auto_decided', false,
      'quality_score', NULL,
      'triage_reasons', NULL,
      'triaged_at', NULL
    ));
  ELSE
    NEW.admin_notes := OLD.admin_notes;
    NEW.admin_reviewed_by := OLD.admin_reviewed_by;
    NEW.admin_reviewed_at := OLD.admin_reviewed_at;
    NEW := jsonb_populate_record(NEW, jsonb_build_object(
      'auto_decided', to_jsonb(OLD) -> 'auto_decided',
      'quality_score', to_jsonb(OLD) -> 'quality_score',
      'triage_reasons', to_jsonb(OLD) -> 'triage_reasons',
      'triaged_at', to_jsonb(OLD) -> 'triaged_at'
    ));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_user_submitted_event_writes ON public.user_submitted_events;
CREATE TRIGGER trg_guard_user_submitted_event_writes
  BEFORE INSERT OR UPDATE ON public.user_submitted_events
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_user_submitted_event_writes();
