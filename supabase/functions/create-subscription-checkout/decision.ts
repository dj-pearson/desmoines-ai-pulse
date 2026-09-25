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
  /** Stripe's recurring interval as the webhook stores it: 'month' or 'year'. */
  billing_interval?: string | null;
  /**
   * The current plan's rank, from the subscription_plans embed. supabase-js
   * types a to-one embed as an array when it cannot see the FK, so both
   * shapes are accepted.
   */
  subscription_plans?: PlanRank | PlanRank[] | null;
}

type PlanRank = { sort_order?: number | null };

function rankOf(plans: PlanRank | PlanRank[] | null | undefined): number | null {
  const plan = Array.isArray(plans) ? plans[0] : plans;
  return plan?.sort_order ?? null;
}

export interface StoreSubscriptionRow {
  platform?: string | null;
  subscription_plans?: { sort_order?: number | null } | null;
}

/**
 * How a plan change takes effect.
 *   upgrade    higher rank: now, prorated.
 *   interval   same plan, monthly <-> yearly: now, prorated.
 *   downgrade  lower rank: now for a legacy request, at period end once the
 *              caller has seen a quote and sent confirm: true.
 */
export type PlanChangeDirection = "upgrade" | "downgrade" | "interval";

export type CheckoutOutcome =
  | { kind: "refuse"; status: number; code: string; error: string; platform?: string }
  /** Change the price on the existing Stripe subscription. */
  | { kind: "change_plan"; stripeSubscriptionId: string; direction: PlanChangeDirection }
  /** No live web subscription: a normal Checkout session. */
  | { kind: "new_checkout" };

export interface CheckoutDecisionInput {
  /** The plan the user asked for. */
  requestedPlanId: string;
  /** Its sort_order, which is how tiers are ranked. */
  requestedSortOrder: number;
  /** The user's active, trialing or past_due WEB row, if any. */
  webSubscription: WebSubscriptionRow | null | undefined;
  /** Their active or trialing iOS/Android rows. */
  storeSubscriptions: readonly StoreSubscriptionRow[] | null | undefined;
  /** 'monthly' or 'yearly', as the request sent it. */
  requestedInterval?: string | null;
  /**
   * True when the request carried preview or confirm, i.e. it came from a
   * client that shows a quote before anything is charged. A same-plan
   * interval switch is only accepted from one: a cached bundle that sends the
   * same plan still gets already_subscribed, as it always did.
   */
  quoted?: boolean;
}

/** 'monthly' | 'yearly' (request) and 'month' | 'year' (Stripe) to one vocabulary. */
function normaliseInterval(value: string | null | undefined): "month" | "year" | null {
  if (value === "monthly" || value === "month") return "month";
  if (value === "yearly" || value === "year") return "year";
  return null;
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

  // WP5 item 3: A PAST_DUE WEB ROW IS STILL A LIVE STRIPE SUBSCRIPTION. Stripe
  // keeps retrying the card until its schedule ends or the dunning job cancels
  // it, so a new checkout here was a second subscription the moment the old
  // card went through. The guard read used to ask only for active and
  // trialing, which is how a member who resubscribed after the "payment
  // failed" email ended up billed twice. New code, 409 like the rest: old
  // clients show the message.
  if (webSubscription?.status === "past_due") {
    return {
      kind: "refuse",
      status: 409,
      code: "billing_subscription_live",
      error:
        "Your last payment didn't go through, so your current subscription is still open. " +
        "Update your payment method from Manage Subscription instead of starting a new one.",
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
    // Monthly to yearly on the same plan is a change, not a second purchase,
    // but only for a client that quoted it first (see `quoted`).
    const current = normaliseInterval(webSubscription.billing_interval);
    const requested = normaliseInterval(input.requestedInterval);
    if (
      input.quoted &&
      webSubscription.stripe_subscription_id &&
      current && requested && current !== requested
    ) {
      return {
        kind: "change_plan",
        stripeSubscriptionId: webSubscription.stripe_subscription_id,
        direction: "interval",
      };
    }
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
    // Unknown current rank reads as an upgrade: the legacy behaviour, and the
    // direction that never defers a change the member asked for.
    const currentRank = rankOf(webSubscription.subscription_plans);
    const direction: PlanChangeDirection =
      currentRank != null && Number(currentRank) > requestedSortOrder ? "downgrade" : "upgrade";
    return {
      kind: "change_plan",
      stripeSubscriptionId: webSubscription.stripe_subscription_id,
      direction,
    };
  }

  return { kind: "new_checkout" };
}

/* ------------------------------------------------------------------------- *
 * The quote (WP5 item 2).
 * ------------------------------------------------------------------------- */

/** The subset of a Stripe upcoming invoice the quote reads. Amounts in cents. */
export interface UpcomingInvoiceLike {
  currency?: string | null;
  amount_due?: number | null;
  next_payment_attempt?: number | null;
  period_end?: number | null;
  lines?: {
    data?: Array<{
      amount?: number | null;
      proration?: boolean | null;
      period?: { start?: number | null; end?: number | null } | null;
    }>;
  } | null;
}

export interface PlanChangeQuote {
  code: "plan_change_quote";
  /** Charged when the change is confirmed, in cents. Never negative. */
  amountDueNow: number;
  currency: string;
  /** ISO date of the next regular charge, or null if Stripe did not say. */
  nextChargeAt: string | null;
  /** The next regular charge at the new price, in cents. */
  nextChargeAmount: number | null;
  effective: "now" | "period_end";
  direction: PlanChangeDirection;
}

function isoFromSeconds(seconds: number | null | undefined): string | null {
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

/**
 * Stripe's upcoming invoice -> what the member is told before confirming.
 *
 * WHY NOT amount_due. For an in-cycle change the upcoming invoice is the WHOLE
 * next invoice: the proration lines plus the next full period at the new
 * price. Showing amount_due as "you pay today" overstated the charge by a full
 * period. The proration lines are the part a confirmed change invoices now
 * (the confirm path uses always_invoice so that is literally true); the rest
 * is the next regular charge.
 *
 * An interval switch resets the billing cycle, so Stripe invoices the whole
 * thing immediately, and the next charge is the end of the new period.
 *
 * A downgrade is scheduled for period end: nothing is due now, and the next
 * charge is the upcoming invoice at the lower price.
 *
 * Pure, so it is tested without Stripe. All amounts stay in cents; the client
 * formats them and never does arithmetic on them.
 */
export function quoteFromUpcoming(
  upcoming: UpcomingInvoiceLike,
  direction: PlanChangeDirection,
  currentPeriodEnd: number | null | undefined,
): PlanChangeQuote {
  const lines = upcoming.lines?.data ?? [];
  const currency = upcoming.currency || "usd";
  const sum = (rows: typeof lines) => rows.reduce((total, line) => total + (line.amount ?? 0), 0);
  const regular = lines.filter((line) => !line.proration);

  if (direction === "downgrade") {
    return {
      code: "plan_change_quote",
      amountDueNow: 0,
      currency,
      nextChargeAt: isoFromSeconds(upcoming.next_payment_attempt ?? currentPeriodEnd ?? upcoming.period_end),
      nextChargeAmount: typeof upcoming.amount_due === "number" ? upcoming.amount_due : null,
      effective: "period_end",
      direction,
    };
  }

  if (direction === "interval") {
    const newPeriod = regular[0]?.period ?? null;
    return {
      code: "plan_change_quote",
      amountDueNow: Math.max(0, typeof upcoming.amount_due === "number" ? upcoming.amount_due : sum(lines)),
      currency,
      nextChargeAt: isoFromSeconds(newPeriod?.end),
      nextChargeAmount: regular.length ? sum(regular) : null,
      effective: "now",
      direction,
    };
  }

  const proration = lines.filter((line) => line.proration);
  return {
    code: "plan_change_quote",
    // A net credit (possible with a promo on the new price) is left on the
    // customer balance by Stripe; nothing is charged, so it reads as 0.
    amountDueNow: Math.max(0, sum(proration)),
    currency,
    nextChargeAt: isoFromSeconds(regular[0]?.period?.start ?? upcoming.next_payment_attempt ?? currentPeriodEnd),
    nextChargeAmount: regular.length ? sum(regular) : null,
    effective: "now",
    direction,
  };
}
