-- AOS-CS-003: support knowledge base + retrieval. Grounded answers come from a
-- KB of docs/FAQ/policies with embeddings; match_support_kb returns the top
-- passages with sources. Additive only.

-- pgvector (Supabase ships it in the extensions schema).
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.support_kb (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT,                       -- doc name / URL the passage came from
  category TEXT,
  embedding extensions.vector(1536), -- OpenAI text-embedding-3-small
  needs_embedding BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ANN index for cosine similarity retrieval.
DO $$ BEGIN
  CREATE INDEX idx_support_kb_embedding ON public.support_kb
    USING hnsw (embedding extensions.vector_cosine_ops);
EXCEPTION WHEN undefined_object OR undefined_function THEN
  -- Older pgvector without hnsw — fall back to ivfflat.
  BEGIN
    CREATE INDEX idx_support_kb_embedding ON public.support_kb
      USING ivfflat (embedding extensions.vector_cosine_ops) WITH (lists = 100);
  EXCEPTION WHEN OTHERS THEN NULL; END;
WHEN duplicate_table THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_support_kb_needs_embedding ON public.support_kb (needs_embedding) WHERE needs_embedding = true;

ALTER TABLE public.support_kb ENABLE ROW LEVEL SECURITY;

-- Admin read; service role (embed/retrieve agents) bypasses RLS.
DO $$ BEGIN
  CREATE POLICY "support_kb_admin_read" ON public.support_kb
    FOR SELECT TO authenticated USING (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Re-embed whenever title/content changes.
CREATE OR REPLACE FUNCTION public.support_kb_mark_stale()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  IF TG_OP = 'UPDATE' AND (NEW.title IS DISTINCT FROM OLD.title OR NEW.content IS DISTINCT FROM OLD.content) THEN
    NEW.needs_embedding = true;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_support_kb_mark_stale ON public.support_kb;
CREATE TRIGGER trg_support_kb_mark_stale
  BEFORE UPDATE ON public.support_kb
  FOR EACH ROW EXECUTE FUNCTION public.support_kb_mark_stale();

-- Retrieval: top passages by cosine similarity, active only. Admin/service-role.
CREATE OR REPLACE FUNCTION public.match_support_kb(
  query_embedding extensions.vector(1536),
  match_count INTEGER DEFAULT 5,
  similarity_threshold DOUBLE PRECISION DEFAULT 0.5
)
RETURNS TABLE (id UUID, title TEXT, content TEXT, source TEXT, category TEXT, similarity DOUBLE PRECISION)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.is_admin()) THEN
    RAISE EXCEPTION 'match_support_kb: admin only';
  END IF;
  RETURN QUERY
  SELECT k.id, k.title, k.content, k.source, k.category,
         (1 - (k.embedding <=> query_embedding))::double precision AS similarity
  FROM public.support_kb k
  WHERE k.is_active AND k.embedding IS NOT NULL
    AND (1 - (k.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY k.embedding <=> query_embedding
  LIMIT GREATEST(1, LEAST(match_count, 20));
END; $$;

REVOKE ALL ON FUNCTION public.match_support_kb(extensions.vector, INTEGER, DOUBLE PRECISION) FROM public;
GRANT EXECUTE ON FUNCTION public.match_support_kb(extensions.vector, INTEGER, DOUBLE PRECISION) TO authenticated, service_role;

COMMENT ON TABLE public.support_kb IS
  'Support knowledge base (AOS-CS-003): docs/FAQ/policy passages with embeddings. Retrieved via match_support_kb; embedded by support-kb-embed.';

-- Register the KB embed/retrieve agent (OpenAI embeddings; budgeted).
INSERT INTO public.agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role, mode, provider)
VALUES
  ('support-kb', 'Support KB', 'support',
   'Embeds support KB articles (OpenAI text-embedding-3-small) and serves grounded retrieval (match_support_kb) for the first-responder; edits re-embed automatically (AOS-CS-003).',
   '*/30 * * * *', true, 0.95, 10.00, 'admin', 'live', 'openai')
ON CONFLICT (agent_key) DO NOTHING;

-- Seed a starter KB from existing docs/FAQ/policies (embedded on first run).
INSERT INTO public.support_kb (title, content, source, category) VALUES
  ('Subscription tiers', 'Des Moines Insider has three tiers: Free, Insider, and VIP. Free covers browsing events, restaurants, and attractions. Insider unlocks premium content and the AI trip planner. VIP adds every premium feature. Upgrade or change your plan anytime from your profile.', 'DEVELOPER_GUIDE.md', 'billing'),
  ('Cancel a subscription', 'You can cancel your subscription at any time from your profile under billing. Cancellation stops future renewals; access to paid features continues until the end of the current billing period. No partial-month refunds are issued automatically except where required by policy.', 'policy', 'billing'),
  ('Refund policy', 'Refunds are considered within policy for accidental charges and duplicate payments reported promptly. In-policy refunds can be processed automatically; out-of-policy requests are reviewed by a human before any refund is issued.', 'policy', 'billing'),
  ('Reset your password', 'Use the "Forgot password" link on the sign-in screen to receive a reset email. Google sign-in accounts do not use a password — sign in with Google instead. If you do not receive the email, check spam and confirm the address on file.', 'FAQ', 'account'),
  ('Report a wrong event or listing', 'If an event date, venue, or restaurant detail looks wrong, use the contact form to report it. Past-date events are unpublished automatically; genuinely recurring events are kept. Corrections are typically reviewed within a couple of business days.', 'FAQ', 'content'),
  ('Contact support', 'Reach support through the contact form on the Contact page. Every message becomes a support ticket you can be followed up on. For account or billing issues, include the email on your account so we can locate it.', 'Contact', 'general')
ON CONFLICT DO NOTHING;
