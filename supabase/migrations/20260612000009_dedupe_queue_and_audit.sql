-- WEB-AUTO-005: review queue (0.7-0.9 confidence pairs) + immutable merge audit.

-- Ambiguous pairs the dedupe job couldn't auto-merge, surfaced to admins.
CREATE TABLE IF NOT EXISTS public.content_merge_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type text NOT NULL CHECK (content_type IN ('event', 'restaurant')),
  survivor_id uuid NOT NULL,
  loser_id uuid NOT NULL,
  confidence numeric NOT NULL,
  name_similarity numeric,
  distance_meters numeric,
  same_date boolean,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'merged', 'dismissed')),
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT content_merge_candidates_pair_key UNIQUE (content_type, survivor_id, loser_id)
);
CREATE INDEX IF NOT EXISTS idx_cmc_status
  ON public.content_merge_candidates (status, content_type, confidence DESC);

-- Immutable record of every merge (auto or manual). Loser rows are retained so a
-- merge stays reversible for 30 days (see unmerge_content()).
CREATE TABLE IF NOT EXISTS public.content_merges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type text NOT NULL CHECK (content_type IN ('event', 'restaurant')),
  survivor_id uuid NOT NULL,
  loser_id uuid NOT NULL,
  confidence numeric,
  decided_by text NOT NULL DEFAULT 'system',
  repointed jsonb NOT NULL DEFAULT '{}'::jsonb,
  reversed boolean NOT NULL DEFAULT false,
  reversed_at timestamptz,
  reversed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_content_merges_loser ON public.content_merges (loser_id);
CREATE INDEX IF NOT EXISTS idx_content_merges_created ON public.content_merges (created_at DESC);

ALTER TABLE public.content_merge_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_merges ENABLE ROW LEVEL SECURITY;

-- Admin-only read. All writes flow through SECURITY DEFINER RPCs (admin-gated) or
-- the service role (BYPASSRLS) used by the dedupe-content edge function — no
-- direct client write path, so no permissive write policy is added.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'content_merge_candidates'
      AND policyname = 'Admins read merge candidates'
  ) THEN
    CREATE POLICY "Admins read merge candidates" ON public.content_merge_candidates
      FOR SELECT TO authenticated USING (public.is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'content_merges'
      AND policyname = 'Admins read merges'
  ) THEN
    CREATE POLICY "Admins read merges" ON public.content_merges
      FOR SELECT TO authenticated USING (public.is_admin());
  END IF;
END $$;
