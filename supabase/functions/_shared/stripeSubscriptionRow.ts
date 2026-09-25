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
  /** When Stripe actually ended it. Set on customer.subscription.deleted. */
  ended_at?: number | null;
  items?: {
    data?: Array<{
      price?: { id?: string | null; recurring?: { interval?: string | null } | null } | null;
    }>;
  };
}

/**
 * One subscription_plans row, as much of it as the price lookup reads. Both
 * price columns are in scripts/db-snapshot.json.
 */
export interface PlanPriceRow {
  id: string;
  stripe_price_id_monthly?: string | null;
  stripe_price_id_yearly?: string | null;
}

/** Stripe's seconds-since-epoch to an ISO string, or null. */
function iso(seconds: number | null | undefined): string | null {
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

/** monthly vs yearly, which nothing else records and a trial cannot imply. */
export function billingInterval(sub: StripeSubscriptionLike): string | null {
  return sub.items?.data?.[0]?.price?.recurring?.interval ?? null;
}

/** The Stripe price the subscription is billed at, or null. */
export function priceIdOf(sub: StripeSubscriptionLike): string | null {
  return sub.items?.data?.[0]?.price?.id ?? null;
}

/**
 * The plan a Stripe price belongs to, or null (WP5 item 1).
 *
 * WHY THIS EXISTS. A plan change updates the price on the existing Stripe
 * subscription, and customer.subscription.updated is the only event that says
 * so. The update patch used to leave plan_id out entirely, so an Insider who
 * paid for VIP stayed Insider on web, server and both apps.
 *
 * EXACTLY ONE MATCH OR NOTHING. A price that matches no plan is a catalogue
 * gap (a price created in the Stripe dashboard and never written back), and a
 * price that matches two plans is a catalogue error. Guessing in either case
 * would move somebody to a tier nobody sold them, so both return null and the
 * row keeps the plan it has. The caller logs it.
 */
export function planIdForPrice(
  priceId: string | null | undefined,
  catalog: readonly PlanPriceRow[] | null | undefined,
): string | null {
  if (!priceId) return null;
  const matches = new Set(
    (catalog ?? [])
      .filter((plan) =>
        plan?.id &&
        (plan.stripe_price_id_monthly === priceId || plan.stripe_price_id_yearly === priceId)
      )
      .map((plan) => plan.id),
  );
  return matches.size === 1 ? [...matches][0] : null;
}

/**
 * Why a subscription did or did not resolve to a plan, so the webhook can say
 * which of the three it was instead of one generic warning.
 */
export function resolvePlanForSubscription(
  sub: StripeSubscriptionLike,
  catalog: readonly PlanPriceRow[] | null | undefined,
): { priceId: string | null; planId: string | null; reason: 'matched' | 'no_price' | 'no_plan' } {
  const priceId = priceIdOf(sub);
  if (!priceId) return { priceId, planId: null, reason: 'no_price' };
  const planId = planIdForPrice(priceId, catalog);
  return { priceId, planId, reason: planId ? 'matched' : 'no_plan' };
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
 * stripe_subscription_id, and re-sending user_id, platform or
 * stripe_customer_id would let a malformed event rewrite who the subscription
 * belongs to.
 *
 * plan_id is the one identity-adjacent column it may carry, and only one way:
 * derived from the Stripe price through planIdForPrice against our own
 * subscription_plans catalogue. Nothing in the event's metadata can set it,
 * and a price that matches no plan (or two) leaves it out, so the row keeps
 * its plan. Without a catalogue the patch is what it always was.
 */
export function subscriptionUpdatePatch(
  subscription: StripeSubscriptionLike,
  catalog?: readonly PlanPriceRow[] | null,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    status: mapStripeStatus(subscription.status),
    current_period_start: iso(subscription.current_period_start),
    current_period_end: iso(subscription.current_period_end),
    cancel_at_period_end: subscription.cancel_at_period_end,
    canceled_at: iso(subscription.canceled_at),
    billing_interval: billingInterval(subscription),
    trial_end: iso(subscription.trial_end),
  };
  if (catalog) {
    const planId = planIdForPrice(priceIdOf(subscription), catalog);
    if (planId) patch.plan_id = planId;
  }
  return patch;
}

/**
 * The patch for customer.subscription.deleted (WP5 item 5).
 *
 * canceled_at is when Stripe ended it, not when the webhook happened to run:
 * a retried delivery hours later used to stamp the retry time, which is the
 * date the win-back and churn reports then counted from.
 */
export function subscriptionDeletedPatch(
  subscription: Pick<StripeSubscriptionLike, 'ended_at' | 'canceled_at'>,
  now: Date = new Date(),
): Record<string, unknown> {
  return {
    status: 'canceled',
    canceled_at: iso(subscription.ended_at ?? subscription.canceled_at) ?? now.toISOString(),
  };
}

/**
 * What invoice.payment_succeeded writes to status, or null for "write nothing"
 * (WP5 item 5).
 *
 * It used to write 'active' unconditionally. The first invoice of a trial is a
 * $0 invoice with billing_reason 'subscription_create', and it "succeeds" the
 * moment the trial starts, so every web trial was stored as a paid
 * subscription: the portal said Active, and the trial-ending notice and the
 * renewal reminder were keyed to the wrong state.
 *
 * Otherwise the subscription's own Stripe status, mapped the same way every
 * other handler maps it. A caller that could not read that status passes null
 * and gets 'active', which is what a paid, non-trial invoice means.
 */
export function statusAfterInvoicePaid(args: {
  billingReason: string | null | undefined;
  amountPaid: number | null | undefined;
  subscriptionStatus: string | null | undefined;
}): string | null {
  if (args.billingReason === 'subscription_create' && (args.amountPaid ?? 0) === 0) {
    return null;
  }
  return mapStripeStatus(args.subscriptionStatus || 'active');
}

/**
 * A completed checkout that would replace a DIFFERENT live subscription on
 * the user's web row (WP5 item 6).
 *
 * The row is one per platform, so writing the new subscription over it hides
 * the old one from every screen while Stripe keeps billing it: the member pays
 * twice and can see, cancel and be refunded for only one. The old row wins; the
 * second subscription is recorded for an admin to refund.
 */
export function isSecondLiveSubscription(
  existing: { status?: string | null; stripe_subscription_id?: string | null } | null | undefined,
  incomingSubscriptionId: string,
): boolean {
  if (!existing?.stripe_subscription_id) return false;
  if (existing.stripe_subscription_id === incomingSubscriptionId) return false;
  return existing.status === 'active' || existing.status === 'trialing' || existing.status === 'past_due';
}
