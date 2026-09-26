-- Non-core review WP6: referral codes on profiles, and attribution through an RPC.
--
-- public.referrals (20251126000000) has existed since November with nothing
-- writing to it. This gives every profile a code, and lets a newly signed-up
-- user who arrived on a ?ref=<code> link be credited to the code's owner.
--
-- ADDITIVE ONLY. New nullable column, new partial unique indexes, new
-- functions, a new trigger. No existing policy changes. In particular the
-- existing INSERT policy on referrals ("Users can create referrals",
-- auth.uid() = referrer_id) still lets a signed-in user insert rows naming
-- themselves as referrer, which would inflate their own counts. Nothing in
-- web or mobile inserts into referrals directly, so dropping that policy is
-- safe, but it is a tightening and waits for the next release
-- (docs/plans/NON_CORE_REVIEW_2026-09.md, WP6).
--
-- handle_new_user is NOT touched: another work package redefines it. The code
-- is set by a separate BEFORE INSERT trigger on profiles, backfilled below,
-- and generated lazily by get_my_referral_stats() for any row that slips past
-- both.
--
-- No reward is attached. Whether referrals earn anything is an owner decision;
-- the web copy promises nothing.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1) The column and its uniqueness. The index is partial and the column is
--    empty when it is built, so it is instant on any table size.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code text NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_referral_code
  ON public.profiles (referral_code)
  WHERE referral_code IS NOT NULL;

-- 2) A random code: 8 characters from the same 30-symbol alphabet as
--    src/lib/referralCode.ts (no 0/O, 1/I/L or U). Bytes >= 240 are redrawn so
--    no symbol is favoured (240 = 8 * 30).
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_code text;
  v_bytes bytea;
  v_byte integer;
  v_attempt integer := 0;
  i integer;
BEGIN
  LOOP
    v_attempt := v_attempt + 1;
    v_code := '';
    WHILE length(v_code) < 8 LOOP
      v_bytes := extensions.gen_random_bytes(16);
      FOR i IN 0..15 LOOP
        v_byte := get_byte(v_bytes, i);
        IF v_byte < 240 AND length(v_code) < 8 THEN
          v_code := v_code || substr(v_alphabet, (v_byte % 30) + 1, 1);
        END IF;
      END LOOP;
    END LOOP;

    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = v_code);
    IF v_attempt >= 10 THEN
      RAISE EXCEPTION 'generate_referral_code: no free code after 10 attempts';
    END IF;
  END LOOP;
  RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_referral_code() FROM PUBLIC, anon, authenticated;

-- 3) Set on insert; fixed once set. A user can update their own profile row,
--    and without the UPDATE half they could rename their code (or blank it,
--    orphaning the link they already shared).
-- SECURITY DEFINER because generate_referral_code is not executable by
-- authenticated, and a user's own profile update may reach this branch.
CREATE OR REPLACE FUNCTION public.profiles_referral_code_default()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.referral_code IS NOT NULL THEN
    NEW.referral_code := OLD.referral_code;
  ELSIF NEW.referral_code IS NULL THEN
    NEW.referral_code := public.generate_referral_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_referral_code_default ON public.profiles;
CREATE TRIGGER profiles_referral_code_default
  BEFORE INSERT OR UPDATE OF referral_code ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_referral_code_default();

-- 4) Backfill, one row per statement so each uniqueness check sees the codes
--    already written.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.profiles WHERE referral_code IS NULL LOOP
    UPDATE public.profiles
    SET referral_code = public.generate_referral_code()
    WHERE id = r.id AND referral_code IS NULL;
  END LOOP;
END $$;

-- 5) One attribution per referred user. Built only when the table holds no
--    duplicates already (nothing has written to it, but a failed index would
--    fail the whole migration). attribute_referral also serialises per user
--    with an advisory lock, so it is correct without the index.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT referred_user_id FROM public.referrals
    WHERE referred_user_id IS NOT NULL
    GROUP BY referred_user_id HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_referrals_referred_user_once
      ON public.referrals (referred_user_id)
      WHERE referred_user_id IS NOT NULL;
  ELSE
    RAISE NOTICE 'referrals has duplicate referred_user_id rows; idx_referrals_referred_user_once not built';
  END IF;
END $$;

-- 6) attribute_referral: credit the caller's sign-up to the owner of p_code.
--
-- Returns a status, never raises for an ordinary refusal, so the client can
-- clear its stored code on any answer:
--   attributed          a referrals row was written (status 'signed_up')
--   not_signed_in       no auth.uid()
--   invalid_code        not the code format, or no profile has it
--   self_referral       the code is the caller's own
--   already_attributed  the caller is already someone's referral
--   account_too_old     the caller signed up more than 24 hours ago, so an
--                       existing member cannot be claimed by a link they
--                       happen to open later
--
-- referrals.referral_code is UNIQUE per row (the table was designed for one
-- row per invite), so the row stores 'signup:<referred user id>' there and the
-- referrer in referrer_id. The code used is recoverable from referrer_id.
CREATE OR REPLACE FUNCTION public.attribute_referral(p_code text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_referrer uuid;
  v_created timestamptz;
  v_email text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 'not_signed_in';
  END IF;

  IF v_code !~ '^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$' THEN
    RETURN 'invalid_code';
  END IF;

  SELECT user_id INTO v_referrer FROM public.profiles WHERE referral_code = v_code;
  IF v_referrer IS NULL THEN
    RETURN 'invalid_code';
  END IF;

  IF v_referrer = v_uid THEN
    RETURN 'self_referral';
  END IF;

  SELECT created_at, email INTO v_created, v_email FROM auth.users WHERE id = v_uid;
  IF v_created IS NULL OR v_created < now() - interval '24 hours' THEN
    RETURN 'account_too_old';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('attribute_referral:' || v_uid::text));

  IF EXISTS (SELECT 1 FROM public.referrals WHERE referred_user_id = v_uid) THEN
    RETURN 'already_attributed';
  END IF;

  INSERT INTO public.referrals (
    referrer_id, referred_email, referred_user_id, referral_code, status, converted_at
  ) VALUES (
    v_referrer, coalesce(v_email, ''), v_uid, 'signup:' || v_uid::text, 'signed_up', now()
  );

  RETURN 'attributed';
END;
$$;

REVOKE ALL ON FUNCTION public.attribute_referral(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attribute_referral(text) TO authenticated;

-- 7) get_my_referral_stats: the caller's code and how many people it brought
--    in. Generates the code if the caller's profile has none. Counts only;
--    no referred email or id leaves the function.
CREATE OR REPLACE FUNCTION public.get_my_referral_stats()
RETURNS TABLE (referral_code text, signed_up bigint, subscribed bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_code text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  SELECT p.referral_code INTO v_code FROM public.profiles p WHERE p.user_id = v_uid;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_code IS NULL THEN
    UPDATE public.profiles p
    SET referral_code = public.generate_referral_code()
    WHERE p.user_id = v_uid AND p.referral_code IS NULL
    RETURNING p.referral_code INTO v_code;
  END IF;

  RETURN QUERY
  SELECT
    v_code,
    count(*) FILTER (WHERE r.status IN ('signed_up', 'subscribed', 'rewarded')),
    count(*) FILTER (WHERE r.status IN ('subscribed', 'rewarded'))
  FROM public.referrals r
  WHERE r.referrer_id = v_uid
    AND r.referred_user_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_referral_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_referral_stats() TO authenticated;
