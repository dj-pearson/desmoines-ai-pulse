-- Pricing plan WP5 item 11 (applying it is deferred D5): a member can always
-- read the plan row they hold.
--
-- subscription_plans is readable only WHERE is_active = true
-- ("Anyone can view subscription plans", 20251126000000). Web, iOS and Android
-- all read tier through an embed of subscription_plans(name) under the
-- member's own JWT, so the day a plan row is deactivated the embed comes back
-- null for everyone on it, and every client renders a paying member as Free.
--
-- This adds a second SELECT policy. Policies for the same command are OR'd, so
-- it only ever widens: a signed-in user may also read a plan row that one of
-- their own user_subscriptions rows points at, whatever its is_active. It
-- exposes nothing new to anyone else. The existing policy is not touched.
--
-- MOBILE CONTRACT. The plan names 'insider' and 'vip' are read by shipped iOS
-- and Android binaries (StoreKitService.swift, BillingService.kt) and by the
-- subscription_tier enum. To stop selling a tier, hide it from sale with a new
-- column (for example is_purchasable), keep the row is_active, and never
-- rename it. is_active = false is not a way to retire a plan.

-- Guarded by a pg_policies lookup, so the file stays re-runnable without
-- removing and recreating anything.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'subscription_plans'
      AND policyname = 'Members can view the plan they hold'
  ) THEN
    CREATE POLICY "Members can view the plan they hold"
      ON public.subscription_plans
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.user_subscriptions us
          WHERE us.plan_id = subscription_plans.id
            AND us.user_id = auth.uid()
        )
      );
  END IF;
END $$;
