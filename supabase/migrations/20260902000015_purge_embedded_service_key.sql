-- WEB-SEC-032: a service_role JWT is embedded in the body of live functions.
--
-- Eleven migrations from 2025 wrote the key as a literal inside
-- CREATE OR REPLACE FUNCTION bodies -- trigger_due_scraping_jobs,
-- run_scraping_jobs_simple, run_social_media_automation,
-- run_social_media_publishing, trigger_article_webhook. No later migration
-- replaced any of them, so the key is not merely in git history: it is in the
-- DATABASE, readable by anyone who can run pg_get_functiondef.
--
-- THIS MIGRATION NEVER NAMES THE KEY. It reads what is actually installed and
-- rewrites the literal out, which is both safer than reproducing five long
-- function bodies by hand and the only way to catch a definition that has
-- drifted from what the migrations say. Nothing here can leak a value, because
-- nothing here contains one.
--
-- Rotation is a separate, owner-only action. Removing the key from the database
-- does not un-expose a key that has been in git since 2025 -- see
-- docs/SECRETS_ROTATION.md.

DO $rewrite$
DECLARE
  r RECORD;
  newdef text;
  rewritten int := 0;
BEGIN
  -- app_secret() is the Vault reader introduced by 20260826000002. Without it
  -- there is nothing to rewrite the key INTO, and replacing a working literal
  -- with a call to a function that does not exist would break every job at once.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'app_secret'
  ) THEN
    RAISE WARNING 'WEB-SEC-032: public.app_secret is missing; skipping. Apply 20260826000002 first.';
    RETURN;
  END IF;

  FOR r IN
    SELECT p.oid, p.proname, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      -- A GENERIC JWT SHAPE, not a specific value. Matching on the shape
      -- catches a different key someone embeds later, and keeps this file
      -- free of anything a secret scanner should ever flag.
      AND p.prosrc ~ 'eyJ[A-Za-z0-9_.\-]{30,}\.[A-Za-z0-9_.\-]{20,}'
  LOOP
    newdef := r.def;

    -- Shape 1: 'Authorization', 'Bearer <jwt>'  ->  'Bearer ' || app_secret(...)
    newdef := regexp_replace(
      newdef,
      '''Bearer eyJ[A-Za-z0-9_\-\.]+''',
      '''Bearer '' || public.app_secret(''service_role_key'')',
      'g'
    );

    -- Shape 2: service_key := '<jwt>';  ->  a Vault read
    newdef := regexp_replace(
      newdef,
      '''eyJ[A-Za-z0-9_\-\.]+''',
      'public.app_secret(''service_role_key'')',
      'g'
    );

    IF newdef = r.def THEN
      RAISE WARNING 'WEB-SEC-032: %(oid %) carries a JWT in a shape this migration does not recognise; left as-is and NOT rewritten.',
        r.proname, r.oid;
      CONTINUE;
    END IF;

    EXECUTE newdef;
    rewritten := rewritten + 1;
    RAISE NOTICE 'WEB-SEC-032: rewrote public.% to read the key from Vault', r.proname;
  END LOOP;

  RAISE NOTICE 'WEB-SEC-032: % function(s) rewritten', rewritten;

  -- Prove it. A function still carrying the prefix after this ran means a shape
  -- the replacements above did not match, and it must not pass silently.
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosrc ~ 'eyJ[A-Za-z0-9_.\-]{30,}\.[A-Za-z0-9_.\-]{20,}'
  ) THEN
    RAISE WARNING 'WEB-SEC-032: a JWT literal REMAINS in at least one public function. Inspect with: select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = ''public'' and p.prosrc ~ ''eyJ[A-Za-z0-9_.-]{30,}'';';
  END IF;
END
$rewrite$;

-- THE JOBS THESE FUNCTIONS SERVE ARE ALREADY BROKEN, which is why replacing a
-- live literal with a Vault read costs nothing here: WEB-OPS-007 measured 57 of
-- 61 pg_cron jobs as never having run successfully. But if the Vault secret is
-- unset, app_secret() returns NULL, 'Bearer ' || NULL is NULL, jsonb_build_object
-- DROPS the key, and the POST goes out unauthenticated -- pg_cron records
-- SUCCESS because enqueueing worked and the 401 lands where nobody is watching.
-- So say so loudly at migration time rather than leaving it to be discovered.
DO $check$
BEGIN
  IF public.app_secret('service_role_key') IS NULL THEN
    RAISE WARNING 'WEB-SEC-032: the Vault secret "service_role_key" is NOT SET. Every rewritten function will now send an unauthenticated request and pg_cron will still record SUCCESS. Set it before relying on any of these jobs (WEB-OPS-007).';
  ELSE
    RAISE NOTICE 'WEB-SEC-032: Vault secret "service_role_key" is present.';
  END IF;
END
$check$;
