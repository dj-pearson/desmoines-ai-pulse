-- ADMIN-SOCIAL-001: Social media account credentials table.
--
-- Tokens are encrypted application-side via AES-GCM (Web Crypto, see
-- supabase/functions/manage-social-account/index.ts) using the
-- SOCIAL_ACCOUNT_ENC_KEY secret. RLS pins the table to service_role only
-- so the encrypted blobs are never exposed to a logged-in admin client
-- directly — they go through the manage-social-account edge function.
-- The admin UI reads the safe shape via the social_accounts_admin view.

CREATE TABLE IF NOT EXISTS public.social_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL CHECK (platform IN ('twitter', 'facebook', 'instagram', 'linkedin')),
  handle TEXT NOT NULL,
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_validated_at TIMESTAMPTZ,
  last_validation_error TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_accounts_platform
  ON public.social_accounts(platform);

CREATE INDEX IF NOT EXISTS idx_social_accounts_active
  ON public.social_accounts(is_active) WHERE is_active = true;

-- Auto-update the updated_at column.
CREATE OR REPLACE FUNCTION public.touch_social_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_social_accounts ON public.social_accounts;
CREATE TRIGGER trg_touch_social_accounts
  BEFORE UPDATE ON public.social_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_social_accounts_updated_at();

-- Lock the raw table down to service_role only. Admin clients use the
-- view below for reads and the edge function for writes.
ALTER TABLE public.social_accounts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role full access"
    ON public.social_accounts
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Safe view: omits the encrypted token columns. Admin role can SELECT;
-- writes still go through the edge function.
CREATE OR REPLACE VIEW public.social_accounts_admin AS
SELECT
  id,
  platform,
  handle,
  CASE WHEN access_token_encrypted IS NOT NULL THEN true ELSE false END AS has_access_token,
  CASE WHEN refresh_token_encrypted IS NOT NULL THEN true ELSE false END AS has_refresh_token,
  token_expires_at,
  is_active,
  last_validated_at,
  last_validation_error,
  notes,
  created_by,
  created_at,
  updated_at
FROM public.social_accounts;

-- Grant SELECT on the view to authenticated; the underlying table RLS
-- still enforces; but the view will be readable because views in
-- Postgres run with the invoker's permissions by default. To make sure
-- only admins can SELECT, gate at the application level: the admin
-- pages already require `requireAdmin` via ProtectedRoute and the
-- admin role check.

GRANT SELECT ON public.social_accounts_admin TO authenticated;

COMMENT ON TABLE public.social_accounts IS
  'Encrypted social-platform OAuth credentials. Reads via social_accounts_admin view; writes via manage-social-account edge function.';
