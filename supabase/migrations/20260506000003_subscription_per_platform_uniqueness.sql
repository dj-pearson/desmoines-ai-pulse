-- =============================================================================
-- Per-platform subscription uniqueness
-- =============================================================================
-- Replaces the single UNIQUE(user_id) constraint on user_subscriptions with
-- UNIQUE(user_id, platform), so a user can hold concurrent subscriptions on
-- web (Stripe), iOS (StoreKit), and Android (Google Play). Read paths resolve
-- the highest active tier across rows.
-- =============================================================================

-- 1. Backfill platform for any rows where it's NULL or empty, using the
--    presence of platform-specific identifiers as a hint. Default to 'web'.
UPDATE public.user_subscriptions
SET platform = 'ios'
WHERE (platform IS NULL OR platform = '')
  AND (apple_transaction_id IS NOT NULL OR apple_product_id IS NOT NULL);

UPDATE public.user_subscriptions
SET platform = 'android'
WHERE (platform IS NULL OR platform = '')
  AND (google_purchase_token IS NOT NULL OR google_product_id IS NOT NULL);

UPDATE public.user_subscriptions
SET platform = 'web'
WHERE platform IS NULL OR platform = '';

-- 2. Enforce platform NOT NULL.
ALTER TABLE public.user_subscriptions
  ALTER COLUMN platform SET NOT NULL;

-- 3. Drop the old single-column UNIQUE(user_id) constraint. Try the standard
--    auto-generated name first, then fall back to a scan of pg_constraint for
--    any single-column UNIQUE on user_id (defensive — covers manually-named
--    constraints from earlier environments).
ALTER TABLE public.user_subscriptions
  DROP CONSTRAINT IF EXISTS user_subscriptions_user_id_key;

DO $$
DECLARE
  cname TEXT;
BEGIN
  FOR cname IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class cls ON cls.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
    WHERE nsp.nspname = 'public'
      AND cls.relname = 'user_subscriptions'
      AND con.contype = 'u'
      AND array_length(con.conkey, 1) = 1
      AND con.conkey[1] = (
        SELECT attnum FROM pg_attribute
        WHERE attrelid = cls.oid AND attname = 'user_id'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.user_subscriptions DROP CONSTRAINT %I', cname);
  END LOOP;
END $$;

-- 4. Add the new (user_id, platform) uniqueness constraint.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_subscriptions_user_platform_key'
  ) THEN
    ALTER TABLE public.user_subscriptions
      ADD CONSTRAINT user_subscriptions_user_platform_key UNIQUE (user_id, platform);
  END IF;
END $$;

COMMENT ON CONSTRAINT user_subscriptions_user_platform_key
  ON public.user_subscriptions
  IS 'A user can hold one subscription per platform (web, ios, android). Read paths resolve highest active tier across rows.';
