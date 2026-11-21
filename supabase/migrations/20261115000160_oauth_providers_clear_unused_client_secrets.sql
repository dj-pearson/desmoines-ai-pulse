-- WEB-SEC-080: clear the OAuth client secrets that oauth_providers holds for
-- no reader.
--
-- WHAT WAS WRONG. OAuthProviderSetup's "Configure Credentials" dialog wrote
-- client_id and client_secret into oauth_providers for Google Analytics,
-- Search Console, Bing and Yandex. Nothing reads client_secret back:
--   edge     gsc-oauth, gsc-fetch-properties and gsc-sync-data read
--            GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET from the environment.
--            oauth-callback, the one function that read the column, has been
--            inert since WEB-SEC-078 (410, no database access).
--   SQL      refresh_oauth_token selects the row but has not returned
--            client_secret since 20260517000000. No other function, view or
--            trigger names the column.
--   web      the dialog is removed in the same commit; no other src/ code
--            touches oauth_providers.
--   iOS      no reference under ios/.
--   Android  no reference under android/.
-- So every stored value is a live OAuth secret kept in a table for nothing,
-- reachable by any service-role leak or SECURITY DEFINER mistake. The
-- provider consoles (Google Cloud, Azure, Yandex) remain the source of truth
-- for anyone who needs one.
--
-- THE FIX. Set client_secret to NULL on every row. The column stays (dropping
-- it would be a destructive schema change; it is already NULLable and
-- unreadable by anon and authenticated since 20261115000150), and client_id
-- stays, since it is not a secret and refresh_oauth_token returns it.
--
-- BACKWARD COMPATIBILITY. No schema, grant or policy changes. An old web
-- bundle still open in a tab can still PATCH the column; that write succeeds
-- as before and is read by nothing.
--
-- Re-running is a no-op.

UPDATE public.oauth_providers
SET client_secret = NULL
WHERE client_secret IS NOT NULL;

COMMENT ON COLUMN public.oauth_providers.client_secret IS
  'Unused since WEB-SEC-080 (20261115000160): every flow reads its OAuth client from edge-function secrets and no UI writes this. Not granted to anon or authenticated (20261115000150).';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oauth_providers WHERE client_secret IS NOT NULL) THEN
    RAISE EXCEPTION 'oauth_providers.client_secret: values remain after 20261115000160';
  END IF;
END;
$$;
