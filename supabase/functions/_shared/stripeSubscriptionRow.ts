/**
 * The Stripe -> user_subscriptions mapping, as pure functions (WEB-CI-029).
 *
 * WHY IT IS OUT HERE. This lived inside stripe-webhook/index.ts, which imports
 * Stripe from esm.sh and exports nothing, so no test could reach it: the money
 * path's two most consequential decisions - what a Stripe status becomes in our
 * table, and which columns a subscription row carries - were exercised only by
 * production. A grep for checkout|stripe|pricing across tests/ hits two lines,
 * both field validation.
 *
 * WHAT DEPENDS ON GETTING IT RIGHT. resolveEntitledTier in ./entitlements.ts
 * reads `status` and `current_period_end` back out and decides whether someone
 * is entitled. So mapStripeStatus is not a labelling convenience - it is the
 * input to the paywall. A status mapped to something isSubscriptionRowEntitled
 * does not recognise silently locks out a paying customer; one mapped too
 * generously gives away the product.
 *
 * The types here are STRUCTURAL rather than Stripe's own, so this module has no
 * remote import and can be tested in a container with no network.
 */

/** The subset of a Stripe subscription these functions read. */
export interface StripeSubscriptionLike {
  id: string;
  status: string;
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end?: boolean | null;
  canceled_at?: number | null;
  trial_start?: number | null;
  trial_end?: number | null;
  items?: { data?: Array<{ price?: { recurring?: { interval?: string | null } | null } | null }> };
}

/** Stripe's seconds-since-epoch to an ISO string, or null. */
function iso(seconds: number | null | undefined): string | null {
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

/** monthly vs yearly, which nothing else records and a trial cannot imply. */
export function billingInterval(sub: StripeSubscriptionLike): string | null {
  return sub.items?.data?.[0]?.price?.recurring?.interval ?? null;
}

/**
 * Stripe subscription status -> the status stored in user_subscriptions.
 *
 * THE DEFAULT IS THE DANGEROUS PART. An unknown status falls through to
 * "active", so a status Stripe adds later - or a typo - grants entitlement
 * rather than withholding it. That is deliberate and worth stating rather than
 * quietly inverting: the failure it avoids is locking out a customer who is
 * paying, and Stripe's status set is small, documented and slow to change. The
 * test pins every current value so a change to the MAP is visible; the default
 * is the decision, not an oversight.
 */
export function mapStripeStatus(stripeStatus: string): string {
  const statusMap: Record<string, string> = {
    active: 'active',
    canceled: 'canceled',
    incomplete: 'past_due',
    incomplete_expired: 'canceled',
    past_due: 'past_due',
    trialing: 'trialing',
    unpaid: 'past_due',
    paused: 'paused',
  };

  return statusMap[stripeStatus] || 'active';
}

/**
 * The full row written when a checkout session completes.
 *
 * `platform: 'web'` is load-bearing: the caller scopes its read and its UPDATE
 * on it so an iOS or Android row for the same user is never touched. A row
 * written without it would be invisible to that scoping and become a second,
 * unreachable subscription.
 */
export function webSubscriptionRow(args: {
  userId: string;
  planId: string;
  subscription: StripeSubscriptionLike;
  stripeCustomerId: string;
}): Record<string, unknown> {
  const { userId, planId, subscription, stripeCustomerId } = args;
  return {
    user_id: userId,
    plan_id: planId,
    status: mapStripeStatus(subscription.status),
    stripe_subscription_id: subscription.id,
    stripe_customer_id: stripeCustomerId,
    platform: 'web',
    current_period_start: iso(subscription.current_period_start),
    current_period_end: iso(subscription.current_period_end),
    cancel_at_period_end: subscription.cancel_at_period_end,
    trial_start: iso(subscription.trial_start),
    trial_end: iso(subscription.trial_end),
    billing_interval: billingInterval(subscription),
  };
}

/**
 * The narrower patch written on customer.subscription.updated.
 *
 * Deliberately NOT the full row: this path is keyed on
 * stripe_subscription_id, and re-sending user_id, plan_id or platform would let
 * a malformed event rewrite who the subscription belongs to.
 */
export function subscriptionUpdatePatch(
  subscription: StripeSubscriptionLike,
): Record<string, unknown> {
  return {
    status: mapStripeStatus(subscription.status),
    current_period_start: iso(subscription.current_period_start),
    current_period_end: iso(subscription.current_period_end),
    cancel_at_period_end: subscription.cancel_at_period_end,
    canceled_at: iso(subscription.canceled_at),
    billing_interval: billingInterval(subscription),
    trial_end: iso(subscription.trial_end),
  };
}
