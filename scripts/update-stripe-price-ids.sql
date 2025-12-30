-- Update Insider plan with Stripe price IDs
UPDATE public.subscription_plans
SET
    stripe_price_id_monthly = 'price_1Sk6oQCowC4ZHKLCePYTb1kP',
    stripe_price_id_yearly = 'price_1Sk6oRCowC4ZHKLCdlAh24AA',
    updated_at = NOW()
WHERE name = 'insider';

-- Update VIP plan with Stripe price IDs
UPDATE public.subscription_plans
SET
    stripe_price_id_monthly = 'price_1Sk6oSCowC4ZHKLCVwSadwu9',
    stripe_price_id_yearly = 'price_1Sk6oTCowC4ZHKLCT52IdwBe',
    updated_at = NOW()
WHERE name = 'vip';

-- Verify the update
SELECT name, display_name, price_monthly, price_yearly,
       stripe_price_id_monthly, stripe_price_id_yearly
FROM public.subscription_plans
ORDER BY sort_order;
