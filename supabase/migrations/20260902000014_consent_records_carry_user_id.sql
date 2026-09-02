-- WEB-AUTH-003: consent rows written at signup carried user_id = NULL.
--
-- src/pages/Auth.tsx calls logConsent immediately after signUp. When email
-- confirmation is required -- which it is -- signUp returns a user and NO
-- session, so consentLog.ts's auth.getUser() resolves to null and the row is
-- inserted with user_id NULL, keyed only by email_hash. The anon INSERT policy
-- accepts it because that policy exists for genuinely pre-auth consent
-- (newsletter, cookie banner).
--
-- The consequence is not cosmetic. export-user-data and delete-user-account
-- both key on user_id, so the one record whose entire purpose is to prove
-- affirmative consent under GDPR Art. 7 was invisible to the subject-access
-- request that asks for it. consent_records is in RETAINED_TABLES with a proper
-- basis and the export already reads that list -- it just could not find the
-- rows.
--
-- Two halves: write the rows from the trigger so they carry the id from the
-- start, and adopt the orphans that already exist.

-- ------------------------------------------------------------------ adoption
--
-- The email hash is the client's: sha256 of the trimmed, lowercased address,
-- lowercase hex. Recomputed here rather than trusted, so a row can only be
-- adopted by the account that actually owns the address.
CREATE OR REPLACE FUNCTION public.link_orphan_consent_records(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_hash text;
  v_linked integer := 0;
BEGIN
  SELECT encode(extensions.digest(lower(btrim(u.email)), 'sha256'), 'hex')
    INTO v_hash
  FROM auth.users u
  WHERE u.id = p_user_id
    -- Only a CONFIRMED address may claim rows. An unconfirmed one proves
    -- nothing about who holds the mailbox, and adopting on that basis would let
    -- anyone who can type an address inherit consent recorded against it.
    AND u.email_confirmed_at IS NOT NULL;

  IF v_hash IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.consent_records
     SET user_id = p_user_id
   WHERE user_id IS NULL
     AND email_hash = v_hash;

  GET DIAGNOSTICS v_linked = ROW_COUNT;
  RETURN v_linked;
END;
$$;

REVOKE ALL ON FUNCTION public.link_orphan_consent_records(uuid) FROM public, anon, authenticated;

COMMENT ON FUNCTION public.link_orphan_consent_records(uuid) IS
  'Attaches consent rows written before a session existed to the confirmed account '
  'that owns the hashed address. Not callable by API clients. WEB-AUTH-003.';

-- ------------------------------------------------------- write from the start
--
-- handle_new_user (20260902000011) already reads raw_user_meta_data for the
-- profile. Auth.tsx ALREADY puts the whole consent record in that metadata as
-- `consent`, so nothing on the client has to change for the rows to carry an id
-- -- the data was there the whole time and only the writer was in the wrong
-- place.
CREATE OR REPLACE FUNCTION public.record_signup_consent(p_user_id uuid, p_meta jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  c jsonb := p_meta->'consent';
  v_hash text;
BEGIN
  IF jsonb_typeof(c) <> 'object' THEN
    RETURN;
  END IF;

  SELECT encode(extensions.digest(lower(btrim(u.email)), 'sha256'), 'hex')
    INTO v_hash
  FROM auth.users u WHERE u.id = p_user_id;

  -- Terms and privacy: the row that GDPR Art. 7 actually asks for.
  IF COALESCE((c->>'terms_accepted')::boolean, false) THEN
    INSERT INTO public.consent_records
      (user_id, email_hash, consent_type, granted, policy_version, source, metadata)
    VALUES (
      p_user_id, v_hash, 'terms', true, c->>'terms_version', 'signup',
      jsonb_build_object(
        'privacy_version', c->>'privacy_version',
        'at_least_13', c->'at_least_13',
        -- Which side wrote the row. For one release the client also writes its
        -- own copy (see below), and an auditor looking at two rows for one
        -- consent needs to be able to tell them apart.
        'writer', 'trigger'
      )
    );
  END IF;

  IF COALESCE((c->>'email_marketing_consent')::boolean, false) THEN
    INSERT INTO public.consent_records
      (user_id, email_hash, consent_type, granted, source, metadata)
    VALUES (p_user_id, v_hash, 'marketing_email', true, 'signup',
            jsonb_build_object('writer', 'trigger'));
  END IF;

  IF COALESCE((c->>'sms_marketing_consent')::boolean, false) THEN
    INSERT INTO public.consent_records
      (user_id, email_hash, consent_type, granted, source, metadata)
    VALUES (p_user_id, v_hash, 'marketing_sms', true, 'signup',
            jsonb_build_object('writer', 'trigger',
                               'phone_provided', p_meta ? 'phone'));
  END IF;

  IF COALESCE((c->>'personalization_consent')::boolean, false) THEN
    INSERT INTO public.consent_records
      (user_id, email_hash, consent_type, granted, source, metadata)
    VALUES (p_user_id, v_hash, 'personalization_ai', true, 'signup',
            jsonb_build_object('writer', 'trigger'));
  END IF;

EXCEPTION WHEN OTHERS THEN
  -- Same posture as handle_new_user: registration must not fail because an
  -- audit row did not land. The client fallback still writes one.
  RAISE WARNING 'record_signup_consent: could not record consent for %: %', p_user_id, SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.record_signup_consent(uuid, jsonb) FROM public, anon, authenticated;

-- Extend the existing new-user trigger rather than adding a second one on
-- auth.users. Two triggers on the same event have an ordering nobody controls,
-- and this one has to run after the row it references exists.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_interests text[];
BEGIN
  IF jsonb_typeof(meta->'interests') = 'array' THEN
    SELECT array_agg(value) INTO v_interests
      FROM jsonb_array_elements_text(meta->'interests') AS value;
  END IF;

  INSERT INTO public.profiles (
    user_id, email, first_name, last_name, phone, location,
    interests, communication_preferences, created_at, updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(meta->>'first_name', ''),
    NULLIF(meta->>'last_name', ''),
    NULLIF(meta->>'phone', ''),
    NULLIF(meta->>'location', ''),
    v_interests,
    CASE WHEN jsonb_typeof(meta->'communication_preferences') = 'object'
         THEN meta->'communication_preferences' END,
    now(), now()
  )
  ON CONFLICT (user_id) DO UPDATE
    SET
      email = COALESCE(public.profiles.email, EXCLUDED.email),
      first_name = COALESCE(public.profiles.first_name, EXCLUDED.first_name),
      last_name = COALESCE(public.profiles.last_name, EXCLUDED.last_name),
      phone = COALESCE(public.profiles.phone, EXCLUDED.phone),
      location = COALESCE(public.profiles.location, EXCLUDED.location),
      interests = COALESCE(public.profiles.interests, EXCLUDED.interests),
      communication_preferences =
        COALESCE(public.profiles.communication_preferences, EXCLUDED.communication_preferences),
      updated_at = now();

  -- WEB-AUTH-003. The consent block is already in raw_user_meta_data; writing
  -- it here is what makes the row carry NEW.id instead of NULL.
  PERFORM public.record_signup_consent(NEW.id, meta);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user: could not create profile for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- Adopt orphans when the address is confirmed. This is what keeps the client
-- fallback's rows from staying unreachable for as long as that fallback exists,
-- and it also catches consent recorded before an account (newsletter, cookie
-- banner) by someone who later signs up with the same address.
CREATE OR REPLACE FUNCTION public.handle_user_email_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL
     AND (OLD.email_confirmed_at IS NULL OR OLD.email IS DISTINCT FROM NEW.email) THEN
    PERFORM public.link_orphan_consent_records(NEW.id);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_user_email_confirmed: could not link consent for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_email_confirmed
  AFTER UPDATE OF email_confirmed_at, email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_email_confirmed();

-- ------------------------------------------------------------------ backfill
--
-- AC3. Every existing orphan whose hash matches a CONFIRMED address. Rows whose
-- address was never confirmed stay orphaned on purpose -- see the reasoning in
-- link_orphan_consent_records.
--
-- Counted before and after so the migration log says what it did rather than
-- leaving it to be discovered later.
DO $backfill$
DECLARE
  v_before integer;
  v_after integer;
BEGIN
  SELECT count(*) INTO v_before
  FROM public.consent_records WHERE user_id IS NULL AND email_hash IS NOT NULL;

  RAISE NOTICE 'WEB-AUTH-003 backfill: % orphan consent row(s) with a hash', v_before;

  UPDATE public.consent_records cr
     SET user_id = u.id
    FROM auth.users u
   WHERE cr.user_id IS NULL
     AND cr.email_hash IS NOT NULL
     AND u.email_confirmed_at IS NOT NULL
     AND cr.email_hash = encode(extensions.digest(lower(btrim(u.email)), 'sha256'), 'hex');

  SELECT count(*) INTO v_after
  FROM public.consent_records WHERE user_id IS NULL AND email_hash IS NOT NULL;

  RAISE NOTICE 'WEB-AUTH-003 backfill: linked %, % still orphaned (no confirmed account at that address)',
    v_before - v_after, v_after;
END
$backfill$;
