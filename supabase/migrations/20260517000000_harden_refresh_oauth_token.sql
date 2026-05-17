-- Security hardening for refresh_oauth_token (NEW-SEC-003)
--
-- The original definition (20251107000000_create_search_traffic_analytics.sql)
-- is SECURITY DEFINER, takes a caller-supplied p_user_id, has no fixed
-- search_path, and returns the OAuth client_secret. Any authenticated user
-- could pass another user's UUID to retrieve their refresh_token plus the
-- application's OAuth client_secret.
--
-- This migration replaces the function in place (signature unchanged for
-- API compatibility — no caller exists in web/edge code) so that it:
--   * derives the user from auth.uid() and ignores the p_user_id argument,
--   * never returns client_secret to the caller,
--   * pins an empty search_path with schema-qualified references,
--   * is executable only by authenticated/service_role, not anon/public.

CREATE OR REPLACE FUNCTION public.refresh_oauth_token(
  p_user_id UUID,
  p_provider_name TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_token_record public.user_oauth_tokens%ROWTYPE;
  v_provider public.oauth_providers%ROWTYPE;
  v_caller UUID := auth.uid();
BEGIN
  -- p_user_id is intentionally ignored; the token is always scoped to the
  -- authenticated caller to prevent cross-user token retrieval.
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  SELECT * INTO v_token_record
  FROM public.user_oauth_tokens
  WHERE user_id = v_caller AND provider_name = p_provider_name
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Token not found');
  END IF;

  SELECT * INTO v_provider
  FROM public.oauth_providers
  WHERE provider_name = p_provider_name;

  -- client_secret is deliberately omitted: the token exchange must be
  -- performed server-side by a trusted edge function holding the secret,
  -- never returned to a client of this RPC.
  RETURN jsonb_build_object(
    'success', true,
    'refresh_token', v_token_record.refresh_token,
    'token_url', v_provider.token_url,
    'client_id', v_provider.client_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_oauth_token(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_oauth_token(UUID, TEXT) TO authenticated, service_role;

-- Narrow the over-broad GRANT ALL on the plaintext-token table to the
-- privileges RLS actually needs (RLS still scopes rows by auth.uid()).
REVOKE ALL ON public.user_oauth_tokens FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_oauth_tokens TO authenticated;
