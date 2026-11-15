-- WEB-SEC-079: oauth_providers.client_secret is no longer readable by anon or
-- authenticated. An admin can still write it; nobody can read it back through
-- PostgREST.
--
-- WHAT WAS WRONG. 20251107000000 ran GRANT SELECT ON oauth_providers TO
-- authenticated, and Supabase's default privileges give anon the same, so the
-- only thing between a caller and every provider's client_secret is the
-- "Admin full access to oauth_providers" policy (FOR ALL USING (is_admin())).
-- The admin page used it: OAuthProviderSetup's generic connect branch ran
-- select('*') on the row and so put client_secret in the admin's browser,
-- in DevTools, in any extension with page access, and in any XSS on /admin.
-- That branch is gone in the same commit (it also could never finish: its
-- redirect landed on the GSC-only callback). This makes the column itself
-- unreadable so a future select('*') fails loudly instead of leaking.
--
-- THE FIX, as WEB-SEC-075 and WEB-SEC-076 did: revoke the table-level SELECT
-- from anon and authenticated, grant SELECT back to authenticated on every
-- column except client_secret. anon gets no column back: it has no reader and
-- the policy already returns it zero rows. Policies, UPDATE and INSERT are
-- untouched, so the admin "Save Credentials" PATCH still works; it filters on
-- provider_name (granted) and asks for no row back.
--
-- READERS enumerated on 2026-11-15:
--   web      OAuthProviderSetup: handleSaveCredentials UPDATEs client_id,
--            client_secret and updated_at WHERE provider_name, with no
--            .select(), so it needs SELECT on provider_name only. No other
--            reference in src/ outside the generated types.
--   iOS      no reference under ios/.
--   Android  no reference under android/.
--   edge     oauth-callback was the only function that read it, and it is
--            inert since WEB-SEC-078 (410, no database access). gsc-oauth
--            reads GOOGLE_CLIENT_SECRET from the environment.
--   SQL      refresh_oauth_token is SECURITY DEFINER (owner privileges, so the
--            column grant does not reach it) and has not returned
--            client_secret since 20260517000000.
--
-- TRAP FOR THE NEXT COLUMN: a column added to oauth_providers after this is
-- NOT readable by authenticated until it is added to the GRANT below.
--
-- Re-running is a no-op: REVOKE and GRANT are idempotent.

REVOKE SELECT ON public.oauth_providers FROM anon, authenticated;

GRANT SELECT (
  id,
  provider_name,
  client_id,
  authorization_url,
  token_url,
  scopes,
  is_active,
  created_at,
  updated_at
) ON public.oauth_providers TO authenticated;

COMMENT ON COLUMN public.oauth_providers.client_secret IS
  'Secret: write-only for admins. Not granted to anon or authenticated (column privileges, 20261115000150); read it with the service role or a SECURITY DEFINER function.';

-- Guard: fail the migration rather than ship a grant that still exposes the
-- secret (for example, a PUBLIC grant some other path added).
DO $$
DECLARE
  role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name)
       AND has_column_privilege(role_name, 'public.oauth_providers', 'client_secret', 'SELECT')
    THEN
      RAISE EXCEPTION 'oauth_providers.client_secret: % can still SELECT it after 20261115000150', role_name;
    END IF;
  END LOOP;
END;
$$;
