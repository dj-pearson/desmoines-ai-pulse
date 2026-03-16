-- Update free tier limits: favorites 5->3, alerts 1->0, saved_searches 1->0
-- This tightens the free tier to increase paid subscription value.

UPDATE subscription_plans
SET limits = jsonb_build_object(
    'favorites', 3,
    'alerts', 0,
    'saved_searches', 0
),
features = '["Browse events & restaurants", "Basic text search", "Save up to 3 favorites", "View ratings & reviews", "Weekly email digest", "Earn XP & badges"]'::jsonb,
updated_at = now()
WHERE name = 'free';

-- Update insider tier features to include new gated features
UPDATE subscription_plans
SET features = '["Everything in Free", "AI Trip Planner (5 trips/month)", "Unlimited favorites", "Advanced search filters", "Write reviews & ratings", "Saved searches & event alerts", "Early access to events", "Ad-free experience", "Daily personalized digest", "2x XP earning rate"]'::jsonb,
updated_at = now()
WHERE name = 'insider';

-- Update VIP tier features
UPDATE subscription_plans
SET features = '["Everything in Insider", "Unlimited AI Trip Planner", "VIP-exclusive events", "Restaurant reservation help", "SMS alerts for your interests", "Monthly local business perks", "Concierge support", "3x XP earning rate", "Exclusive VIP badge"]'::jsonb,
updated_at = now()
WHERE name = 'vip';

-- Note: usage_quotas table does not exist on remote yet.
-- AI generation quotas will be added in a future migration once the usage tracking system is deployed.
