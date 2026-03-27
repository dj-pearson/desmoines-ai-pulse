-- =============================================================================
-- Add platform-specific subscription columns for iOS and Android
-- =============================================================================
-- The validate-ios-receipt and validate-android-receipt edge functions store
-- platform-specific purchase identifiers alongside the existing Stripe fields.
-- These columns are nullable because each subscription uses only one platform.
-- =============================================================================

-- Platform identifier (ios, android, web/stripe)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'user_subscriptions' AND column_name = 'platform'
    ) THEN
        ALTER TABLE public.user_subscriptions ADD COLUMN platform TEXT DEFAULT 'web';
    END IF;
END $$;

-- iOS-specific columns (used by validate-ios-receipt)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'user_subscriptions' AND column_name = 'apple_transaction_id'
    ) THEN
        ALTER TABLE public.user_subscriptions ADD COLUMN apple_transaction_id TEXT;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'user_subscriptions' AND column_name = 'apple_original_transaction_id'
    ) THEN
        ALTER TABLE public.user_subscriptions ADD COLUMN apple_original_transaction_id TEXT;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'user_subscriptions' AND column_name = 'apple_product_id'
    ) THEN
        ALTER TABLE public.user_subscriptions ADD COLUMN apple_product_id TEXT;
    END IF;
END $$;

-- Android-specific columns (used by validate-android-receipt)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'user_subscriptions' AND column_name = 'google_purchase_token'
    ) THEN
        ALTER TABLE public.user_subscriptions ADD COLUMN google_purchase_token TEXT;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'user_subscriptions' AND column_name = 'google_product_id'
    ) THEN
        ALTER TABLE public.user_subscriptions ADD COLUMN google_product_id TEXT;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'user_subscriptions' AND column_name = 'google_order_id'
    ) THEN
        ALTER TABLE public.user_subscriptions ADD COLUMN google_order_id TEXT;
    END IF;
END $$;

-- Index on platform for filtering subscriptions by platform
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_platform
    ON public.user_subscriptions (platform);

-- Comments
COMMENT ON COLUMN public.user_subscriptions.platform IS 'Subscription platform: web, ios, or android';
COMMENT ON COLUMN public.user_subscriptions.apple_transaction_id IS 'Apple StoreKit 2 transaction ID';
COMMENT ON COLUMN public.user_subscriptions.apple_original_transaction_id IS 'Apple original transaction ID for subscription group';
COMMENT ON COLUMN public.user_subscriptions.apple_product_id IS 'Apple App Store product ID';
COMMENT ON COLUMN public.user_subscriptions.google_purchase_token IS 'Google Play Billing purchase token';
COMMENT ON COLUMN public.user_subscriptions.google_product_id IS 'Google Play product ID';
COMMENT ON COLUMN public.user_subscriptions.google_order_id IS 'Google Play order ID';
