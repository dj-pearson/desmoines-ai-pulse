-- WP2 (docs/plans/NON_CORE_REVIEW_2026-09.md): email on Amazon SES.
--
-- Two tables for supabase/functions/_shared/email.ts, which every outbound
-- email now goes through.
--
-- email_suppressions: addresses we must not mail. Before this, a hard bounce
-- or a spam complaint suppressed nobody, and every newsletter retried the same
-- dead addresses, which is the fastest way to lose an SES sending account.
-- Written by ses-events (bounce, complaint) and email-unsubscribe
-- (unsubscribe). A bounce or complaint blocks all mail; an unsubscribe blocks
-- marketing only, so a password reset still arrives. That rule lives in
-- email.ts isBlocked().
--
-- email_log: one row per recipient per send, updated by ses-events when SES
-- reports delivery, bounce or complaint for the message id.
--
-- Additive only: two new tables, no change to anything that exists.

CREATE TABLE IF NOT EXISTS public.email_suppressions (
  -- Stored lowercased; the CHECK makes a mixed-case insert fail loudly instead
  -- of creating a second row the lookup never matches.
  email       TEXT PRIMARY KEY CHECK (email = lower(email)),
  reason      TEXT NOT NULL CHECK (reason IN ('bounce', 'complaint', 'unsubscribe', 'manual')),
  source      TEXT,
  detail      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.email_suppressions IS
  'WP2: addresses sendEmail drops before the provider sees them. bounce/complaint/manual block all mail, unsubscribe blocks marketing only.';

CREATE TABLE IF NOT EXISTS public.email_log (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template             TEXT NOT NULL,
  category             TEXT NOT NULL CHECK (category IN ('transactional', 'marketing')),
  to_email             TEXT NOT NULL,
  user_id              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ref_type             TEXT,
  ref_id               TEXT,
  provider             TEXT NOT NULL CHECK (provider IN ('ses', 'resend', 'none')),
  provider_message_id  TEXT,
  status               TEXT NOT NULL CHECK (status IN (
                         'sent', 'failed', 'skipped', 'suppressed',
                         'delivered', 'bounced', 'complained'
                       )),
  error                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.email_log IS
  'WP2: one row per recipient per send by _shared/email.ts; status advanced by ses-events.';

CREATE INDEX IF NOT EXISTS idx_email_log_provider_message_id
  ON public.email_log (provider_message_id)
  WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_log_created_at ON public.email_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_to_email ON public.email_log (to_email);
CREATE INDEX IF NOT EXISTS idx_email_log_user_id ON public.email_log (user_id) WHERE user_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_email_log_updated_at ON public.email_log;
CREATE TRIGGER trg_email_log_updated_at
  BEFORE UPDATE ON public.email_log
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_email_suppressions_updated_at ON public.email_suppressions;
CREATE TRIGGER trg_email_suppressions_updated_at
  BEFORE UPDATE ON public.email_suppressions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: the service role (edge functions) writes; admins read. Nobody else sees
-- either table - both are lists of other people's addresses.
ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_log admin read" ON public.email_log;
CREATE POLICY "email_log admin read" ON public.email_log
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "email_suppressions admin read" ON public.email_suppressions;
CREATE POLICY "email_suppressions admin read" ON public.email_suppressions
  FOR SELECT TO authenticated USING (public.is_admin());

-- service_role bypasses RLS; the grants are what let it write at all.
REVOKE ALL ON public.email_log FROM anon, authenticated;
REVOKE ALL ON public.email_suppressions FROM anon, authenticated;
GRANT SELECT ON public.email_log TO authenticated;
GRANT SELECT ON public.email_suppressions TO authenticated;
GRANT ALL ON public.email_log TO service_role;
GRANT ALL ON public.email_suppressions TO service_role;
