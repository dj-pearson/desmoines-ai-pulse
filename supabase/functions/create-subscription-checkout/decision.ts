/**
 * What to do when a signed-in user asks to buy a plan (WEB-CI-029 AC3).
 *
 * WHY THIS IS A SEPARATE MODULE. index.ts imports Stripe and supabase-js from
 * esm.sh, so nothing that imports it can be loaded in a test without the
 * network. The decision below is the part that can sell someone a second
 * subscription, and it was reachable only through a live Stripe key. It is
 * pure: the caller does the two reads and passes the rows in.
 *
 * THE ORDER OF THE CHECKS IS THE BEHAVIOUR, not an implementation detail. A
 * store subscription is checked FIRST because Apple and Google own that
 * billing relationship and nothing here can change it - an upgrade path that
 * ran before that check would change a Stripe subscription the user is also
 * paying for through an app store. Cancel-at-period-end is checked before
 * same-plan, because "resume this" and "you already have this" are both true
 * of that row and only the first is actionable.
 *
 * REFUSING IS THE SAFE ANSWER EVERYWHERE HERE. Declining a checkout is
 * recoverable; charging someone twice is not.
 */

export interface WebSubscriptionRow {
  stripe_subscription_id?: string | null;
  status?: string | null;
  cancel_at_period_end?: boolean | null;
  plan_id?: string | null;
}

export interface StoreSubscriptionRow {
  platform?: string | null;
  subscription_plans?: { sort_order?: number | null } | null;
}

export type CheckoutOutcome =
  | { kind: "refuse"; status: number; code: string; error: string; platform?: string }
  /** Change the price on the existing Stripe subscription, with prorations. */
  | { kind: "change_plan"; stripeSubscriptionId: string }
  /** No live web subscription: a normal Checkout session. */
  | { kind: "new_checkout" };

export interface CheckoutDecisionInput {
  /** The plan the user asked for. */
  requestedPlanId: string;
  /** Its sort_order, which is how tiers are ranked. */
  requestedSortOrder: number;
  /** The user's active or trialing WEB row, if any. */
  webSubscription: WebSubscriptionRow | null | undefined;
  /** Their active or trialing iOS/Android rows. */
  storeSubscriptions: readonly StoreSubscriptionRow[] | null | undefined;
}

function storeName(platform: string | null | undefined): string {
  return platform === "ios" ? "the App Store" : "Google Play";
}

export function decideCheckout(input: CheckoutDecisionInput): CheckoutOutcome {
  const { requestedPlanId, requestedSortOrder, webSubscription } = input;

  // A store plan at the SAME rank or higher already grants what is being sold.
  // `>=` rather than `>` on purpose: selling the same tier again is the second
  // charge this check exists to stop, and a strictly-greater test would allow
  // exactly that.
  const blockingStoreSub = (input.storeSubscriptions ?? []).find((row) => {
    const rank = Number(row?.subscription_plans?.sort_order ?? 0);
    return rank >= requestedSortOrder;
  });

  if (blockingStoreSub) {
    return {
      kind: "refuse",
      status: 409,
      code: "store_subscription_active",
      platform: blockingStoreSub.platform ?? undefined,
      error:
        `You already subscribe through ${storeName(blockingStoreSub.platform)}. ` +
        "Manage or change that subscription there -- buying here would charge you twice.",
    };
  }

  // PROD-SUB-005: a subscription set to cancel at period end should be RESUMED
  // from the billing portal, not replaced by a second one.
  if (webSubscription?.cancel_at_period_end) {
    return {
      kind: "refuse",
      status: 409,
      code: "resume_required",
      error:
        "Your subscription is set to cancel at the end of the period. " +
        "Please resume it from Manage Subscription instead of buying a new one.",
    };
  }

  if (webSubscription && webSubscription.plan_id === requestedPlanId) {
    return {
      kind: "refuse",
      status: 409,
      code: "already_subscribed",
      error: "You already have an active subscription to this plan.",
    };
  }

  // A DIFFERENT ACTIVE WEB PLAN IS AN UPGRADE, NOT A SECOND PURCHASE. Selling a
  // second Checkout session here produces two live Stripe subscriptions and two
  // invoices every month, which is what shipped before WEB-FEAT-013.
  if (webSubscription?.stripe_subscription_id) {
    return { kind: "change_plan", stripeSubscriptionId: webSubscription.stripe_subscription_id };
  }

  return { kind: "new_checkout" };
}
