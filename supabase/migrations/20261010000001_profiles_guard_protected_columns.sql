-- IOS-DD-ACCOUNT-12: a signed-in user can no longer rewrite the server-managed
-- columns on their own profiles row.
--
-- THE HOLE. The owner UPDATE policy on public.profiles lets a user write any
-- column of their own row, and validate_profile_user_id (20260902000011)
-- checks only user_id and user_role. So a PATCH from the browser or a
-- modified app could set:
--   email               - the address the lifecycle / re-engagement agents
--                         mail, i.e. redirect or spoof our own mail;
--   stripe_customer_id  - create-campaign-checkout trusts this over its own
--                         email lookup (index.ts ~211-226), so pointing it at
--                         someone else's Stripe customer puts the checkout on
--                         their customer record;
--   lifecycle_stage, lifecycle_updated_at, lifecycle_signals,
--   churn_risk_score, churn_scored_at, reengage_suppressed_at
--                       - agent-owned state; editing it opts a user in or out
--                         of agent mail behind the agents' backs.
--
-- WHO LEGITIMATELY WRITES THESE (checked 2026-09-27 with
--   rg -n "stripe_customer_id|lifecycle_|churn_|reengage_" supabase/functions src android
-- and a grep of UPDATE public.profiles in supabase/migrations):
--   - sync_profile_email_from_auth (20260926000004): an AFTER UPDATE trigger on
--     auth.users, so its write arrives at pg_trigger_depth() > 1.
--   - handle_new_user: same, a nested trigger write.
--   - create-campaign-checkout (stripe_customer_id), agent-lifecycle,
--     agent-reengagement, agent-churn-winback and the _shared/agents runners
--     (lifecycle_*, churn_*, reengage_suppressed_at): every one builds its
--     client with SUPABASE_SERVICE_ROLE_KEY, so auth.role() = 'service_role'.
--   - migrations, cron and psql: no JWT, auth.role() is NULL.
--   - admins, through the admin UI.
-- All of these pass the checks below.
--
-- NOT GUARDED: referral_code. The referral RPC in 20261006000002 (~line 226)
-- sets it as the calling user, so guarding it would break referrals. It is a
-- random code with a UNIQUE index, not a privilege.
--
-- INSERT. A client inserting its own row (web useProfile's upsert, Android
-- createProfile, iOS ensureProfileRow) may set email only to its own auth
-- email, and may not set stripe_customer_id at all. handle_new_user inserts
-- from a trigger and is exempt by depth.
--
-- ADDITIVE. A new function and a new trigger; no column, policy, grant or RPC
-- signature changes. No shipped client writes these columns in an UPDATE:
-- web useProfile.ts WRITABLE_COLUMNS, Android AuthRemoteDataSource
-- ProfileUpdate and iOS ProfileUpdate all list first_name, last_name, phone,
-- location, interests (web adds communication_preferences). The comparison is
-- through to_jsonb, so a column missing from an environment compares NULL to
-- NULL and never raises.
--
-- MANUAL CHECK (psql against a branch database; no XCTest covers SQL):
--   BEGIN;
--   SET LOCAL role authenticated;
--   SELECT set_config('request.jwt.claims',
--     json_build_object('sub', '<a user id>', 'role', 'authenticated')::text, true);
--   UPDATE public.profiles SET stripe_customer_id = 'cus_x' WHERE user_id = '<a user id>';
--   -- ERROR: profiles.stripe_customer_id is managed by the server
--   UPDATE public.profiles SET first_name = 'Ada' WHERE user_id = '<a user id>';
--   -- UPDATE 1
--   ROLLBACK;
--   BEGIN;
--   SET LOCAL role service_role;
--   SELECT set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
--   UPDATE public.profiles SET lifecycle_stage = 'active' WHERE user_id = '<a user id>';
--   -- UPDATE 1
--   ROLLBACK;

CREATE OR REPLACE FUNCTION public.guard_profile_protected_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  k text;
  v_old jsonb;
  v_new jsonb;
BEGIN
  -- Writes made from inside another trigger (handle_new_user,
  -- sync_profile_email_from_auth) are the server's own.
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- service_role (edge functions), and no JWT at all (migrations, cron, psql).
  IF COALESCE(auth.role(), '') NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NOT NULL
     AND public.user_has_role_or_higher(auth.uid(), 'admin'::public.user_role) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    FOREACH k IN ARRAY ARRAY[
      'email',
      'stripe_customer_id',
      'lifecycle_stage',
      'lifecycle_updated_at',
      'lifecycle_signals',
      'churn_risk_score',
      'churn_scored_at',
      'reengage_suppressed_at'
    ] LOOP
      IF v_new -> k IS DISTINCT FROM v_old -> k THEN
        RAISE EXCEPTION 'profiles.% is managed by the server', k
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END LOOP;
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.email IS NOT NULL
       AND lower(NEW.email) <> lower(COALESCE(auth.email(), '')) THEN
      RAISE EXCEPTION 'profiles.email is managed by the server'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF to_jsonb(NEW) ->> 'stripe_customer_id' IS NOT NULL THEN
      RAISE EXCEPTION 'profiles.stripe_customer_id is managed by the server'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_profile_protected_columns() IS
'IOS-DD-ACCOUNT-12. Refuses client writes to server-managed profiles columns (email, stripe_customer_id, lifecycle/churn/reengage agent state). Nested trigger writes, service_role, no-JWT sessions and admins pass.';

REVOKE ALL ON FUNCTION public.guard_profile_protected_columns() FROM PUBLIC;

DROP TRIGGER IF EXISTS guard_profile_protected_columns ON public.profiles;
CREATE TRIGGER guard_profile_protected_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profile_protected_columns();
