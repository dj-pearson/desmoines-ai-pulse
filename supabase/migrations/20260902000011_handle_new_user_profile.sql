-- WEB-AUTH-002: everything typed at signup was thrown away.
--
-- Auth.tsx collects phone, location, interests, consent and communication
-- preferences and puts them in raw_user_meta_data. Nothing ever moved them
-- anywhere. The profile row is created lazily by useProfile on first read, with
-- user_id, email, first_name and last_name only, so profiles.phone,
-- profiles.location, profiles.interests and profiles.communication_preferences
-- stayed NULL for every account ever created. The signup page says "you can
-- change these any time in your profile settings", and there was nothing to
-- change and nowhere to change it.
--
-- That NULL communication_preferences column is also why WEB-LEGAL-012 reads as
-- "the marketing opt-out the nurture agents read is written by no client": the
-- agents read a column no writer ever populated.
--
-- WHY A TRIGGER, GIVEN 20251125000001 SAYS NOT TO. That note --
-- "We're NOT creating a trigger on auth.users because that causes schema
-- context issues" -- is about sync_oauth_user_role, which resolves the
-- public.user_role ENUM. An enum reference from a trigger firing in the auth
-- schema's context is exactly the kind of thing that breaks; this function
-- touches no enum and pins search_path, which is the standard mitigation. The
-- objection was specific and does not transfer, but it is answered here rather
-- than ignored.
--
-- THE TRIGGER CAN NEVER BLOCK A SIGNUP. Its whole body is wrapped so that any
-- failure logs a warning and returns NEW. A trigger on auth.users that raises
-- takes down registration for the entire site, and no profile field is worth
-- that.
--
-- account_type IS NOT COPIED, because public.profiles has no such column. The
-- story's AC lists it; the table does not have anywhere to put it. Left in
-- raw_user_meta_data, where it already is.

-- ---------------------------------------------------------------------------
-- 1. profiles.user_id needs to be unique before anything can upsert on it.
--    No migration declares that, so check before creating: a duplicate here is
--    a real defect and the operator should see it named rather than as a raw
--    constraint violation.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  n_dupes integer;
BEGIN
  SELECT count(*) INTO n_dupes
    FROM (
      SELECT user_id FROM public.profiles
       WHERE user_id IS NOT NULL
       GROUP BY user_id HAVING count(*) > 1
    ) d;

  IF n_dupes > 0 THEN
    RAISE EXCEPTION
      'WEB-AUTH-002: % user_id(s) have more than one profile row. Merge them before applying this migration; an upsert cannot be made safe until user_id is unique.',
      n_dupes;
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_id_key
    ON public.profiles (user_id);
END $$;

-- ---------------------------------------------------------------------------
-- 2. The trigger.
-- ---------------------------------------------------------------------------
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
  -- interests arrives as a JSON array of strings; anything else is ignored
  -- rather than allowed to raise.
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
      -- Idempotent with the client fallback in useProfile, and non-destructive:
      -- a value already on the row always wins over one from metadata, so a
      -- later re-run can fill blanks but can never overwrite an edit the user
      -- made in their profile settings.
      email = COALESCE(public.profiles.email, EXCLUDED.email),
      first_name = COALESCE(public.profiles.first_name, EXCLUDED.first_name),
      last_name = COALESCE(public.profiles.last_name, EXCLUDED.last_name),
      phone = COALESCE(public.profiles.phone, EXCLUDED.phone),
      location = COALESCE(public.profiles.location, EXCLUDED.location),
      interests = COALESCE(public.profiles.interests, EXCLUDED.interests),
      communication_preferences =
        COALESCE(public.profiles.communication_preferences, EXCLUDED.communication_preferences),
      updated_at = now();

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Registration must not fail because a profile field did not land.
  RAISE WARNING 'handle_new_user: could not create profile for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
'WEB-AUTH-002. Copies signup metadata into public.profiles when an auth user is created. Non-destructive on conflict (an existing value always wins) and swallows every error, because a trigger on auth.users that raises stops registration for the whole site.';

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 3. Backfill everyone who signed up before the trigger existed. Same
--    non-destructive rule: only fills columns that are NULL today.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  n_updated integer;
  n_created integer;
BEGIN
  -- Profiles that exist but are missing what the user typed.
  WITH src AS (
    SELECT
      u.id AS user_id,
      COALESCE(u.raw_user_meta_data, '{}'::jsonb) AS meta
    FROM auth.users u
  ),
  upd AS (
    UPDATE public.profiles p
       SET phone = COALESCE(p.phone, NULLIF(s.meta->>'phone', '')),
           location = COALESCE(p.location, NULLIF(s.meta->>'location', '')),
           first_name = COALESCE(p.first_name, NULLIF(s.meta->>'first_name', '')),
           last_name = COALESCE(p.last_name, NULLIF(s.meta->>'last_name', '')),
           interests = COALESCE(
             p.interests,
             CASE WHEN jsonb_typeof(s.meta->'interests') = 'array'
                  THEN ARRAY(SELECT jsonb_array_elements_text(s.meta->'interests')) END
           ),
           communication_preferences = COALESCE(
             p.communication_preferences,
             CASE WHEN jsonb_typeof(s.meta->'communication_preferences') = 'object'
                  THEN s.meta->'communication_preferences' END
           ),
           updated_at = now()
      FROM src s
     WHERE p.user_id = s.user_id
       AND (
         p.phone IS NULL OR p.location IS NULL OR p.interests IS NULL
         OR p.communication_preferences IS NULL
         OR p.first_name IS NULL OR p.last_name IS NULL
       )
    RETURNING p.user_id
  )
  SELECT count(*) INTO n_updated FROM upd;

  -- Users who never had a profile row at all, because they never triggered the
  -- lazy client insert.
  WITH ins AS (
    INSERT INTO public.profiles (
      user_id, email, first_name, last_name, phone, location,
      interests, communication_preferences, created_at, updated_at
    )
    SELECT
      u.id,
      u.email,
      NULLIF(COALESCE(u.raw_user_meta_data, '{}'::jsonb)->>'first_name', ''),
      NULLIF(COALESCE(u.raw_user_meta_data, '{}'::jsonb)->>'last_name', ''),
      NULLIF(COALESCE(u.raw_user_meta_data, '{}'::jsonb)->>'phone', ''),
      NULLIF(COALESCE(u.raw_user_meta_data, '{}'::jsonb)->>'location', ''),
      CASE WHEN jsonb_typeof(COALESCE(u.raw_user_meta_data, '{}'::jsonb)->'interests') = 'array'
           THEN ARRAY(SELECT jsonb_array_elements_text(COALESCE(u.raw_user_meta_data, '{}'::jsonb)->'interests')) END,
      CASE WHEN jsonb_typeof(COALESCE(u.raw_user_meta_data, '{}'::jsonb)->'communication_preferences') = 'object'
           THEN COALESCE(u.raw_user_meta_data, '{}'::jsonb)->'communication_preferences' END,
      now(), now()
    FROM auth.users u
    WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = u.id)
    ON CONFLICT (user_id) DO NOTHING
    RETURNING user_id
  )
  SELECT count(*) INTO n_created FROM ins;

  RAISE NOTICE 'WEB-AUTH-002 backfill: % profile(s) filled in, % profile(s) created', n_updated, n_created;
END $$;
