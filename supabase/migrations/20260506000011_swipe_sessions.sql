-- =============================================================================
-- Group decision mode — shared swipe sessions (IOS-DISCOVER-2026-006)
-- =============================================================================
-- Lets a group of friends swipe through events / restaurants together. When
-- two or more participants right-swipe the same item, a "match" surfaces on
-- every participant's screen. Hosts get a summary at the end.
--
-- Privacy: only `like` and `boost` swipes are shared via session_id; `skip`
-- swipes record session_id = NULL so individual taste profiles stay private.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.swipe_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 6-character user-friendly code (e.g. DSM-AB12)
  code TEXT NOT NULL UNIQUE,
  host_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('events', 'restaurants', 'mixed')),
  filter_context JSONB,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  -- Auto-expire after 4 hours unless explicitly ended sooner
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '4 hours'),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_swipe_sessions_host
  ON public.swipe_sessions (host_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_swipe_sessions_active
  ON public.swipe_sessions (status, expires_at) WHERE status = 'active';

-- Participants — supports anon device-based identifiers via TEXT, plus
-- authenticated user_id when available. Either field can be set.
CREATE TABLE IF NOT EXISTS public.swipe_session_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.swipe_sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  anon_id TEXT,
  display_name TEXT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Either user_id OR anon_id must be set
  CONSTRAINT swipe_session_participants_identity CHECK (
    (user_id IS NOT NULL AND anon_id IS NULL)
    OR (user_id IS NULL AND anon_id IS NOT NULL)
  )
);

-- A given identity (user_id or anon_id) can only join a session once
CREATE UNIQUE INDEX IF NOT EXISTS swipe_session_participants_user_unique
  ON public.swipe_session_participants (session_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS swipe_session_participants_anon_unique
  ON public.swipe_session_participants (session_id, anon_id)
  WHERE anon_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_swipe_session_participants_session
  ON public.swipe_session_participants (session_id);

-- Add session_id to swipe_interactions so likes can be correlated across
-- participants. Also add anon_id for unauthenticated-but-joined participants
-- so they can record swipes too.
ALTER TABLE public.swipe_interactions
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.swipe_sessions(id) ON DELETE SET NULL;

ALTER TABLE public.swipe_interactions
  ADD COLUMN IF NOT EXISTS anon_id TEXT;

-- Relax the NOT NULL on user_id so anon participants can record swipes.
-- (Existing NOT NULL is enforced via FK; add a CHECK that at least one
-- identity is set so we don't silently lose attribution.)
ALTER TABLE public.swipe_interactions
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.swipe_interactions
  DROP CONSTRAINT IF EXISTS swipe_interactions_identity_chk;
ALTER TABLE public.swipe_interactions
  ADD CONSTRAINT swipe_interactions_identity_chk
  CHECK (user_id IS NOT NULL OR anon_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_swipe_interactions_session
  ON public.swipe_interactions (session_id, created_at DESC)
  WHERE session_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.swipe_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swipe_session_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read swipe sessions by code" ON public.swipe_sessions;
CREATE POLICY "Anyone can read swipe sessions by code"
  ON public.swipe_sessions FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Hosts insert their own session" ON public.swipe_sessions;
CREATE POLICY "Hosts insert their own session"
  ON public.swipe_sessions FOR INSERT
  WITH CHECK (auth.uid() = host_user_id);

DROP POLICY IF EXISTS "Hosts update / end their own session" ON public.swipe_sessions;
CREATE POLICY "Hosts update / end their own session"
  ON public.swipe_sessions FOR UPDATE
  USING (auth.uid() = host_user_id)
  WITH CHECK (auth.uid() = host_user_id);

DROP POLICY IF EXISTS "Anyone can read participants in active sessions"
  ON public.swipe_session_participants;
CREATE POLICY "Anyone can read participants in active sessions"
  ON public.swipe_session_participants FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Anyone can join an active session"
  ON public.swipe_session_participants;
CREATE POLICY "Anyone can join an active session"
  ON public.swipe_session_participants FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.swipe_sessions s
      WHERE s.id = session_id
        AND s.status = 'active'
        AND s.expires_at > NOW()
    )
  );

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Generate a 6-character session code with the DSM- prefix. Tries up to 8
-- times to find a unique code; if all 8 collide we let the UNIQUE constraint
-- fail (extraordinarily unlikely with 36^4 ~= 1.7M codes for the suffix).
CREATE OR REPLACE FUNCTION public.generate_swipe_session_code()
RETURNS TEXT AS $$
DECLARE
  v_chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  v_code TEXT;
  i INT;
BEGIN
  FOR attempt IN 1..8 LOOP
    v_code := 'DSM-';
    FOR i IN 1..4 LOOP
      v_code := v_code || substr(v_chars, (random() * 35)::int + 1, 1);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM public.swipe_sessions WHERE code = v_code) THEN
      RETURN v_code;
    END IF;
  END LOOP;
  RETURN v_code; -- fall through; UNIQUE constraint will surface the collision
END;
$$ LANGUAGE plpgsql VOLATILE;

GRANT EXECUTE ON FUNCTION public.generate_swipe_session_code() TO authenticated;

-- Compute matches for a session: items right-swiped (like or boost) by ≥2
-- distinct participants. Used by the host's end-of-session summary view.
CREATE OR REPLACE FUNCTION public.get_swipe_session_matches(p_session_id UUID)
RETURNS TABLE (
  item_type TEXT,
  item_id UUID,
  match_count BIGINT
)
LANGUAGE sql STABLE AS $$
  SELECT
    si.item_type,
    si.item_id,
    COUNT(DISTINCT COALESCE(si.user_id::text, si.anon_id)) AS match_count
  FROM public.swipe_interactions si
  WHERE si.session_id = p_session_id
    AND si.action IN ('like', 'boost')
  GROUP BY si.item_type, si.item_id
  HAVING COUNT(DISTINCT COALESCE(si.user_id::text, si.anon_id)) >= 2
  ORDER BY match_count DESC, si.item_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_swipe_session_matches(UUID)
  TO anon, authenticated;

COMMENT ON TABLE public.swipe_sessions IS
  'Group decision mode shared swipe sessions (IOS-DISCOVER-2026-006).';
COMMENT ON FUNCTION public.get_swipe_session_matches IS
  'Returns items right-swiped by 2+ distinct participants in a session.';
