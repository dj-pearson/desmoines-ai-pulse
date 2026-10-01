-- WEB-FEAT-016: subscription_plans.features listed benefits nobody receives.
--
-- 20260316000001 wrote these lists, and they have been the copy of record for
-- anything reading the plan row ever since. Checked one key at a time against
-- the code on 2026-09-02:
--
--   REMOVED FROM insider
--     "Early access to events"      early_access has no consumer. It appears in
--                                   entitlements.ts, useSubscription and
--                                   UpgradeModal copy, and nowhere that gates.
--     "Daily personalized digest"   There is no daily digest. send-weekly-digest
--                                   is weekly and applies no tier check, so free
--                                   accounts receive the same mail.
--     "2x XP earning rate"          No XP multiplier exists in useGamification or
--                                   in any migration. The number is invented.
--     "(5 trips/month)"             No trip quota is enforced anywhere, so the
--                                   figure was untrue in both directions.
--
--   REMOVED FROM vip -- all of them
--     "Unlimited AI Trip Planner"   Not a VIP benefit: trip_planner is a boolean
--                                   gate at insider with no quota, so an Insider
--                                   already had it unlimited.
--     "VIP-exclusive events"        vip_events: key and copy only.
--     "Restaurant reservation help" reservation_assistance: key and copy only.
--     "SMS alerts for your interests" sms_alerts: key and copy only.
--     "Monthly local business perks"  local_perks: key and copy only.
--     "Concierge support"           concierge: key and copy only.
--     "3x XP earning rate"          No multiplier exists.
--     "Exclusive VIP badge"         No consumer.
--
-- WHICH LEAVES VIP WITH NOTHING INSIDER DOES NOT HAVE, at $12.99 against $4.99.
-- That is recorded here rather than disguised. Restoring any line above needs a
-- gate that reads it and a component that honours it, shipped together.
--
-- WHAT IS KEPT is what a gate actually reads:
--   unlimited_favorites  FavoriteButton
--   advanced_filters     AdvancedSearchFilters
--   ad_free              AdBanner, HouseAd
--   trip_planner         TripPlanner
--   write_reviews        RatingSystem
--   save_searches        SaveSearchButton
-- "event alerts" stays alongside saved searches because the mail is genuinely
-- sent; that it is sent regardless of tier is WEB-FEAT-017's problem, not a
-- false promise.
--
-- ADDITIVE. This rewrites a jsonb display column and nothing else. The feature
-- KEYS in _shared/entitlements.ts and useSubscription are deliberately left
-- alone, so no shipped iOS or Android build loses a feature it can ask about --
-- what is removed is the promise, not the plumbing.

UPDATE public.subscription_plans
SET features = '["Everything in Free", "AI Trip Planner", "Unlimited favorites", "Advanced search filters", "Write reviews & ratings", "Saved searches & event alerts", "Ad-free experience"]'::jsonb,
    updated_at = now()
WHERE name = 'insider';

UPDATE public.subscription_plans
SET features = '["Everything in Insider"]'::jsonb,
    updated_at = now()
WHERE name = 'vip';

DO $$
DECLARE
  n_vip integer;
BEGIN
  SELECT count(*) INTO n_vip
    FROM public.user_subscriptions us
    JOIN public.subscription_plans sp ON sp.id = us.plan_id
   WHERE sp.name = 'vip'
     AND us.status IN ('active', 'trialing');
  RAISE NOTICE 'WEB-FEAT-016: % active or trialing VIP subscriber(s) were sold benefits that do not exist; owner must decide what they are owed', n_vip;
END $$;
