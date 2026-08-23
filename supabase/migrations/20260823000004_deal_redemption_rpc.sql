-- WEB-QA-019 AC6 (partial): make deal redemption counting real.
--
-- src/hooks/useDeals.ts:69 calls increment_deal_redemption({ deal_id }) from
-- useClaimDeal. Probed anonymously against production 2026-08-23 the function
-- returns PGRST202 -- and unlike the view-tracking hook this one THROWS the
-- error, so every "claim deal" click has surfaced as a failed mutation. The
-- redemption count on every deal card is 0 because nothing has ever
-- incremented it.
--
-- WHY THIS ONE IS BUILDABLE WHILE THE REST OF AC6 IS NOT. The other billing
-- RPCs in that criterion -- get_user_payment_summary, get_current_usage,
-- record_usage_event, create_api_key, revoke_api_key -- all read tables
-- WEB-QA-018 confirmed absent (payments, usage_events, api_keys), so each is a
-- build-or-delete decision about a whole subsystem. This one is not: probed
-- against production, public.deals EXISTS and deals.redemption_count EXISTS.
-- The column, the caller and the UI are all already there; only the function
-- was missing.
--
-- Additive per CLAUDE.md: a new function, no shape any shipped client reads is
-- changed.

/**
 * Record one redemption of a deal.
 *
 * SECURITY DEFINER for the same reason as increment_event_view: the caller is
 * anonymous or an ordinary authenticated user and must NOT hold UPDATE on
 * deals. The function is the entire grant -- it can only add one to one counter
 * on one row, and it cannot touch the discount, the code or the dates.
 *
 * DELIBERATELY NOT ENFORCING A REDEMPTION LIMIT. deals has no max_redemptions,
 * redemption_limit, status or is_active column -- all four return 42703 against
 * production -- so there is nothing to enforce against, and inventing a cap
 * here would be a schema decision made inside a counter. The count is a tally,
 * not an entitlement.
 *
 * Returns the new count so the caller can render it without a second read.
 * Returns NULL for an unknown id rather than raising: a stale deal link should
 * not produce an error dialog, and the caller already treats a null as
 * "nothing to show".
 */
CREATE OR REPLACE FUNCTION public.increment_deal_redemption(deal_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.deals
     SET redemption_count = COALESCE(redemption_count, 0) + 1
   WHERE id = deal_id
  RETURNING redemption_count;
$$;

-- Claiming a deal is something a logged-out visitor does; the definer's rights
-- are what keep that from being a general write grant on deals.
GRANT EXECUTE ON FUNCTION public.increment_deal_redemption(uuid) TO anon, authenticated;
