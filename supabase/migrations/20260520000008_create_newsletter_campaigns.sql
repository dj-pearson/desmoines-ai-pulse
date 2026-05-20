-- ADMIN-EMAIL-002: Newsletter campaign rows for one-off admin sends.
-- One row per send (or scheduled send); recipient counts and basic
-- delivery stats live here. Per-recipient delivery rows are deferred
-- to a follow-up story (Resend webhook integration).

CREATE TABLE IF NOT EXISTS public.newsletter_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject TEXT NOT NULL,
  preheader TEXT,
  body_html TEXT NOT NULL,
  segment JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed', 'canceled')),
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  delivered INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  sent_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_newsletter_campaigns_status
  ON public.newsletter_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_newsletter_campaigns_sent_at
  ON public.newsletter_campaigns(sent_at DESC) WHERE sent_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.touch_newsletter_campaigns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_newsletter_campaigns ON public.newsletter_campaigns;
CREATE TRIGGER trg_touch_newsletter_campaigns
  BEFORE UPDATE ON public.newsletter_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.touch_newsletter_campaigns_updated_at();

ALTER TABLE public.newsletter_campaigns ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role full access"
    ON public.newsletter_campaigns
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admin can read campaigns"
    ON public.newsletter_campaigns
    FOR SELECT
    TO authenticated
    USING (
      is_admin()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
