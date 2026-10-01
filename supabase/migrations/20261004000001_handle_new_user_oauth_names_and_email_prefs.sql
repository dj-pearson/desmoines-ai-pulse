-- NON_CORE_REVIEW_2026-09 WP4: handle_new_user fills a name for OAuth sign-ups
-- and seeds user_email_preferences from the sign-up's marketing consent.
--
-- NAMES. The email form sends first_name / last_name in raw_user_meta_data.
-- Google does not: Supabase stores its profile as full_name and name (plus
-- given_name / family_name when the provider returns them). handle_new_user
-- read only first_name / last_name, so every Google account got a profile with
-- no name, and the digest, the dashboard greeting and the admin user list all
-- showed a blank. The form's own fields still win; the OAuth keys are only a
-- fallback when first_name is absent.
--
-- EMAIL PREFERENCES. get_weekly_digest_recipients selects only users WITH a
-- user_email_preferences row whose weekly_digest_enabled is true, and nothing
-- wrote that row at sign-up. Someone who ticked "email me" on the sign-up form
-- got no digest until they found the Settings switch. The row is now written
-- here with weekly_digest_enabled = the consent they gave
-- (consent.email_marketing_consent, which Auth.tsx already puts in the
-- metadata and record_signup_consent already reads). No consent block, as with
-- every OAuth sign-up, means false: no consent, no marketing mail.
-- event_alerts_enabled is left to its column default (true), which is what a
-- missing row means to useSavedSearchAlerts today.
--
-- ADDITIVE. Same function name, same trigger, no signature change. Everything
-- in the 20260902000014 definition is kept, including record_signup_consent and
-- the outer EXCEPTION that lets registration succeed when a profile write
-- fails. The preferences insert runs in its own sub-block: an error in the
-- outer block would roll back the profile insert with it.
-- ON CONFLICT DO NOTHING, so a row written by any other path stands.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_interests text[];
  v_first text := NULLIF(btrim(meta->>'first_name'), '');
  v_last text := NULLIF(btrim(meta->>'last_name'), '');
  v_full text;
BEGIN
  IF jsonb_typeof(meta->'interests') = 'array' THEN
    SELECT array_agg(value) INTO v_interests
      FROM jsonb_array_elements_text(meta->'interests') AS value;
  END IF;

  -- OAuth fallback. Only when the form's first_name is absent, so an email
  -- sign-up is untouched. given_name / family_name first when present, then
  -- the first word of full_name (or name) as first and the rest as last.
  IF v_first IS NULL THEN
    v_full := NULLIF(
      regexp_replace(btrim(COALESCE(NULLIF(btrim(meta->>'full_name'), ''), meta->>'name', '')), '\s+', ' ', 'g'),
      ''
    );
    v_first := COALESCE(NULLIF(btrim(meta->>'given_name'), ''), split_part(v_full, ' ', 1));
    v_first := NULLIF(v_first, '');
    IF v_last IS NULL THEN
      v_last := COALESCE(
        NULLIF(btrim(meta->>'family_name'), ''),
        NULLIF(btrim(substr(v_full, length(split_part(v_full, ' ', 1)) + 1)), '')
      );
    END IF;
  END IF;

  INSERT INTO public.profiles (
    user_id, email, first_name, last_name, phone, location,
    interests, communication_preferences, created_at, updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    v_first,
    v_last,
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

  -- Digest preference from the consent given on the form. Own block: a bad
  -- value in the metadata must not undo the profile above.
  BEGIN
    INSERT INTO public.user_email_preferences (user_id, weekly_digest_enabled)
    VALUES (
      NEW.id,
      COALESCE((meta->'consent'->>'email_marketing_consent')::boolean, false)
    )
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user: could not seed email preferences for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user: could not create profile for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------ backfill
--
-- Names only, and only where the profile has none. A name the person typed or
-- edited is never overwritten: first_name is written only where it is NULL,
-- and last_name only where it is NULL on a row whose first_name was also NULL
-- (so a half-filled name the person chose is left alone). No preferences
-- backfill: consent given before this migration is a decision for the email
-- work, not something to infer here.
DO $backfill$
DECLARE
  v_named integer;
BEGIN
  WITH src AS (
    SELECT
      p.user_id,
      NULLIF(btrim(u.raw_user_meta_data->>'given_name'), '') AS given,
      NULLIF(btrim(u.raw_user_meta_data->>'family_name'), '') AS family,
      NULLIF(
        regexp_replace(
          btrim(COALESCE(NULLIF(btrim(u.raw_user_meta_data->>'full_name'), ''),
                         u.raw_user_meta_data->>'name', '')),
          '\s+', ' ', 'g'),
        '') AS full_name
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.user_id
    WHERE p.first_name IS NULL
      AND NULLIF(btrim(u.raw_user_meta_data->>'first_name'), '') IS NULL
  ),
  names AS (
    SELECT
      user_id,
      NULLIF(COALESCE(given, split_part(full_name, ' ', 1)), '') AS first_name,
      COALESCE(family,
               NULLIF(btrim(substr(full_name, length(split_part(full_name, ' ', 1)) + 1)), '')) AS last_name
    FROM src
  )
  UPDATE public.profiles p
     SET first_name = n.first_name,
         last_name = COALESCE(p.last_name, n.last_name),
         updated_at = now()
    FROM names n
   WHERE p.user_id = n.user_id
     AND p.first_name IS NULL
     AND n.first_name IS NOT NULL;

  GET DIAGNOSTICS v_named = ROW_COUNT;
  RAISE NOTICE 'WP4 backfill: filled a name from OAuth metadata on % profile(s)', v_named;
END
$backfill$;
