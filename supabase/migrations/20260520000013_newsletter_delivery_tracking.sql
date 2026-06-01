-- EMAIL-WEBHOOK-001: per-recipient delivery rows + campaign-level engagement
-- counters so the admin Campaigns list shows real numbers from Resend
-- (delivered / opens / clicks / bounces / complaints) instead of just the
-- accept-time response from the send call.

-- 1) Engagement counters on the parent campaign row.
ALTER TABLE public.newsletter_campaigns
  ADD COLUMN IF NOT EXISTS opens INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clicks INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bounces INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS complaints INTEGER NOT NULL DEFAULT 0;

-- 2) Per-recipient delivery rows. Resend gives us a message id at send
--    time; the webhook references it on subsequent events.
CREATE TABLE IF NOT EXISTS public.newsletter_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.newsletter_campaigns(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  resend_message_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN (
      'queued', 'delivered', 'opened', 'clicked', 'bounced', 'complained'
    )),
  event_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_newsletter_deliveries_campaign
  ON public.newsletter_deliveries(campaign_id);
CREATE INDEX IF NOT EXISTS idx_newsletter_deliveries_status
  ON public.newsletter_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_newsletter_deliveries_email
  ON public.newsletter_deliveries(email);
-- Already unique via column constraint; redundant index removed.

CREATE OR REPLACE FUNCTION public.touch_newsletter_deliveries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_newsletter_deliveries ON public.newsletter_deliveries;
CREATE TRIGGER trg_touch_newsletter_deliveries
  BEFORE UPDATE ON public.newsletter_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.touch_newsletter_deliveries_updated_at();

ALTER TABLE public.newsletter_deliveries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role full access"
    ON public.newsletter_deliveries
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admin can read deliveries"
    ON public.newsletter_deliveries
    FOR SELECT
    TO authenticated
    USING (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3) Atomic engagement-counter bump used by the webhook. Pure SQL keeps
--    the edge function tiny.
CREATE OR REPLACE FUNCTION public.bump_newsletter_campaign_counter(
  p_campaign_id UUID,
  p_field TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_field NOT IN ('delivered', 'opens', 'clicks', 'bounces', 'complaints') THEN
    RAISE EXCEPTION 'Invalid counter field: %', p_field;
  END IF;

  EXECUTE format(
    'UPDATE public.newsletter_campaigns SET %I = COALESCE(%I, 0) + 1 WHERE id = $1',
    p_field, p_field
  ) USING p_campaign_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bump_newsletter_campaign_counter(UUID, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.bump_newsletter_campaign_counter(UUID, TEXT) IS
  'Atomically increments one of delivered/opens/clicks/bounces/complaints on the campaign row. Called by the resend-webhook edge function.';
