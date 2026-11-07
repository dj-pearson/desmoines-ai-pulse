-- Growth roadmap #9, part 2: a personal calendar feed per saved search.
--
-- The fixed feeds (/calendar/music.ics and friends) need no database change.
-- A personal feed does: a calendar app fetches /calendar/my/<token>.ics with
-- no login, so the saved search has to be findable by a secret in the URL.
--
--   saved_searches.calendar_token   NULL = feed off. A random UUID = feed on.
--   set_saved_search_calendar()     owner turns the feed on, off, or issues a
--                                   new token (old URL stops working).
--   saved_search_calendar_feed()    anon: the name, filters and type of the
--                                   ONE row holding that token. Nothing else:
--                                   no user_id, no email, no other rows.
--
-- WHY A GUARD TRIGGER. "Users can update their own saved searches" lets an
-- owner write any column, so without it a client could set its own token to
-- something guessable. The token is only ever issued by the RPC, which sets a
-- transaction-local flag the trigger checks. Writes with no user JWT
-- (service role, migrations) are left alone, the same convention as
-- guard_profile_protected_columns (20261010000001).
--
-- BACKWARD COMPATIBILITY (CLAUDE.md). Additive only: one NULL column, a
-- partial unique index, two new functions and a trigger that changes nothing
-- for writes that do not touch the new column. create_event_saved_search
-- returns public.saved_searches, which gains the column; callers ignore
-- unknown keys. No DROP, no RENAME, no tightening.

ALTER TABLE public.saved_searches
  ADD COLUMN IF NOT EXISTS calendar_token uuid;

COMMENT ON COLUMN public.saved_searches.calendar_token IS
  'Secret for the public /calendar/my/<token>.ics feed. NULL = off. Issued only by set_saved_search_calendar().';

-- The table is per-user and small; a plain index build is fine here.
CREATE UNIQUE INDEX IF NOT EXISTS saved_searches_calendar_token_key
  ON public.saved_searches (calendar_token)
  WHERE calendar_token IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_saved_search_calendar_token()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF COALESCE(auth.role(), '') NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF current_setting('app.saved_search_calendar', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.calendar_token := NULL;
  ELSIF NEW.calendar_token IS DISTINCT FROM OLD.calendar_token THEN
    -- Keep the old value rather than raising, so a client that sends the whole
    -- row back (the iOS app updates rows directly) keeps working.
    NEW.calendar_token := OLD.calendar_token;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_saved_search_calendar_token ON public.saved_searches;
CREATE TRIGGER trg_guard_saved_search_calendar_token
  BEFORE INSERT OR UPDATE ON public.saved_searches
  FOR EACH ROW EXECUTE FUNCTION public.guard_saved_search_calendar_token();

CREATE OR REPLACE FUNCTION public.set_saved_search_calendar(
  p_id      uuid,
  p_enabled boolean DEFAULT true,
  p_rotate  boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user  uuid := auth.uid();
  v_token uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  PERFORM set_config('app.saved_search_calendar', 'on', true);

  UPDATE public.saved_searches
  SET calendar_token = CASE
        WHEN NOT p_enabled THEN NULL
        WHEN p_rotate OR calendar_token IS NULL THEN gen_random_uuid()
        ELSE calendar_token
      END
  WHERE id = p_id
    AND user_id = v_user
  RETURNING calendar_token INTO v_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'saved_search_not_found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM set_config('app.saved_search_calendar', 'off', true);
  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.set_saved_search_calendar(uuid, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_saved_search_calendar(uuid, boolean, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.saved_search_calendar_feed(p_token uuid)
RETURNS TABLE (name text, filters jsonb, search_type text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.name, s.filters::jsonb, s.search_type
  FROM public.saved_searches s
  WHERE p_token IS NOT NULL
    AND s.calendar_token = p_token
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.saved_search_calendar_feed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.saved_search_calendar_feed(uuid) TO anon, authenticated;
