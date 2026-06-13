-- WEB-AUTO-009: content_moderation record/queue + admin decision RPC.
--
-- One row per moderated item: the AI scores, the verdict, and the admin
-- override (if any). This is the single uniform surface the admin queue reads
-- and that future content types (WEB-FEAT-010 photo reviews) plug into without
-- another per-table column. The visibility filter itself lives on each content
-- table's moderation_status column (migration ...000019).

CREATE TABLE IF NOT EXISTS public.content_moderation (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type  text NOT NULL CHECK (content_type IN ('review', 'contact')),
  content_id    uuid NOT NULL,
  -- pending: created, not yet scored. approved/flagged/rejected: AI or admin
  -- verdict. error: the moderation call failed (fail-open with flag — content
  -- stays hidden-pending, surfaced here for an admin to clear).
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'flagged', 'rejected', 'error')),
  toxicity      numeric,
  spam          numeric,
  off_topic     numeric,
  reasons       jsonb NOT NULL DEFAULT '[]'::jsonb,
  excerpt       text,                       -- short snippet for the admin queue
  decided_by    uuid,                       -- admin user_id on a manual override
  decided_kind  text NOT NULL DEFAULT 'system' CHECK (decided_kind IN ('system', 'admin')),
  decided_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT content_moderation_item_key UNIQUE (content_type, content_id)
);

CREATE INDEX IF NOT EXISTS idx_content_moderation_status
  ON public.content_moderation (status, created_at DESC);

COMMENT ON TABLE public.content_moderation IS
  'WEB-AUTO-009: AI moderation record + admin review queue + decision audit for UGC (reviews, contact). One row per item.';

ALTER TABLE public.content_moderation ENABLE ROW LEVEL SECURITY;

-- Admin-only read. All writes flow through the service role (moderate-content
-- edge function, BYPASSRLS) or the SECURITY DEFINER decide_moderation RPC below.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'content_moderation'
      AND policyname = 'Admins read moderation queue'
  ) THEN
    CREATE POLICY "Admins read moderation queue" ON public.content_moderation
      FOR SELECT TO authenticated USING (public.is_admin());
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Admin decision: approve (publish) or reject (keep hidden) a queued item.
-- Updates the queue row AND the content table's visibility column atomically,
-- recording the deciding admin. Callable by admin users and the service role.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decide_moderation(p_id uuid, p_decision text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  row_rec       public.content_moderation%ROWTYPE;
  new_status    text;
  content_vis   text;
BEGIN
  -- Admin or service-role only (service role -> auth.uid() NULL -> allowed).
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'decide_moderation: admin privileges required';
  END IF;

  IF p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'decide_moderation: p_decision must be approve or reject';
  END IF;

  SELECT * INTO row_rec FROM public.content_moderation WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found', 'id', p_id);
  END IF;

  new_status  := CASE WHEN p_decision = 'approve' THEN 'approved' ELSE 'rejected' END;
  content_vis := new_status;

  UPDATE public.content_moderation
  SET status = new_status,
      decided_by = auth.uid(),
      decided_kind = 'admin',
      decided_at = now(),
      updated_at = now()
  WHERE id = p_id;

  IF row_rec.content_type = 'review' THEN
    UPDATE public.user_ratings
    SET moderation_status = content_vis
    WHERE id = row_rec.content_id;
  ELSIF row_rec.content_type = 'contact' THEN
    UPDATE public.contact_submissions
    SET moderation_status = content_vis,
        -- Mirror the verdict into the existing inbox status so the FeedbackInbox
        -- spam filter stays in sync. Approve does not force a status (admin owns
        -- the new/read/responded workflow); reject marks it spam.
        status = CASE WHEN p_decision = 'reject' THEN 'spam' ELSE status END
    WHERE id = row_rec.content_id;
  END IF;

  RETURN jsonb_build_object('status', 'success', 'id', p_id, 'decision', new_status);
END;
$$;

REVOKE ALL ON FUNCTION public.decide_moderation(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_moderation(uuid, text) TO authenticated, service_role;

-- Pause toggle (mirrors ai_article_pipeline_enabled / weekly_digest_enabled).
-- Seeded enabled so moderation runs out of the box; an admin flips it off to
-- pause scoring with no code change.
INSERT INTO public.feature_flags (flag_key, enabled, description, target_tiers)
VALUES (
  'content_moderation_enabled',
  true,
  'AI auto-moderation of user-generated content — reviews and contact submissions (WEB-AUTO-009). Turn off to pause scoring.',
  ARRAY['admin']
)
ON CONFLICT (flag_key) DO NOTHING;
