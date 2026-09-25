/**
 * subscription-lifecycle decisions, as pure functions (WP5 items 3 and 7).
 *
 * WHY THIS IS A SEPARATE MODULE. index.ts imports supabase-js and Stripe from
 * esm.sh, so nothing that imports it loads in an offline test. The decisions
 * below are the ones that move money or mail people: when dunning ends, who
 * is cancelled and where, and whether a marketing email may go out at all.
 *
 * ONE DUNNING CLOCK. The job used to flip a past_due row to canceled at period
 * end plus 7 days, locally, while entitlements used 14 and Stripe kept
 * retrying the card. The member lost access a week before the product said
 * they would, the old subscription stayed live in Stripe, and resubscribing
 * after the "paused" email created a second one. Now the grace window is
 * GRACE_PERIOD_DAYS from _shared/entitlements.ts, the same constant the
 * paywall reads, and ending it means cancelling the subscription IN STRIPE.
 * customer.subscription.deleted then writes the row, so there is one writer.
 *
 * STORE ROWS ARE NEVER CANCELLED HERE. Apple and Google own that billing and
 * run their own dunning; a local cancel would hide a subscription the member
 * is still being charged for.
 */

import { GRACE_PERIOD_DAYS, isSubscriptionRowEntitled } from "../_shared/entitlements.ts";
import { escapeHtml } from "../_shared/escapeHtml.ts";
import { manageAtForPlatform, STORE_MANAGE_URLS } from "../_shared/siteUrl.ts";

export { GRACE_PERIOD_DAYS };

export const DAY_MS = 24 * 60 * 60 * 1000;
/** Days before period end that the renewal reminder goes out. */
export const RENEWAL_REMINDER_DAYS = 7;
/** Days after cancellation during which one win-back may be sent. */
export const WINBACK_WINDOW_DAYS = 3;

export interface LifecycleRow {
  id: string;
  user_id: string;
  status: string | null;
  platform: string | null;
  current_period_end: string | null;
  canceled_at: string | null;
  cancel_at_period_end: boolean | null;
  stripe_subscription_id: string | null;
}

export type LifecycleAction =
  | { kind: "renewal_reminder"; periodEnd: number }
  | { kind: "payment_failed"; accessUntil: number | null }
  /** Past grace, Stripe-billed: cancel the Stripe subscription. */
  | { kind: "cancel_in_stripe"; stripeSubscriptionId: string }
  /**
   * Past grace, web row with no Stripe subscription behind it. Nothing else
   * will ever end it, so the job does, locally. A store row never gets here.
   */
  | { kind: "expire_locally" }
  | { kind: "winback"; canceledAt: number };

/** 'web' or a legacy row with no platform. Everything else is a store's. */
export function isWebBilled(platform: string | null | undefined): boolean {
  return platform === "web" || platform == null || platform === "";
}

function ms(value: string | null | undefined): number {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Everything the job should do for one row at `now`, in order. The caller
 * dedupes against subscription_events and performs the side effects.
 *
 * marketingAllowed gates the win-back and nothing else: the other three are
 * about the member's own billing and go out regardless (WEB-LEGAL-006).
 */
export function lifecycleActions(
  row: LifecycleRow,
  now: number,
  opts: { marketingAllowed: boolean },
): LifecycleAction[] {
  if (!isWebBilled(row.platform)) return [];

  const actions: LifecycleAction[] = [];
  const periodEnd = ms(row.current_period_end);
  const canceledAt = ms(row.canceled_at);

  if (row.status === "active" && !row.cancel_at_period_end && periodEnd) {
    const daysOut = (periodEnd - now) / DAY_MS;
    if (daysOut > 0 && daysOut <= RENEWAL_REMINDER_DAYS) {
      actions.push({ kind: "renewal_reminder", periodEnd });
    }
  }

  if (row.status === "past_due") {
    // The same test the paywall runs, so "still has access" here and there
    // can never disagree.
    const entitled = isSubscriptionRowEntitled("past_due", row.current_period_end, new Date(now));
    // No period end means no clock to run out: keep nudging, never cancel.
    if (entitled || !periodEnd) {
      actions.push({ kind: "payment_failed", accessUntil: graceEndsAt(row.current_period_end) });
    } else {
      actions.push(
        row.stripe_subscription_id
          ? { kind: "cancel_in_stripe", stripeSubscriptionId: row.stripe_subscription_id }
          : { kind: "expire_locally" },
      );
    }
  }

  if (row.status === "canceled" && canceledAt && opts.marketingAllowed) {
    const daysSince = (now - canceledAt) / DAY_MS;
    if (daysSince >= 1 && daysSince <= WINBACK_WINDOW_DAYS) {
      actions.push({ kind: "winback", canceledAt });
    }
  }

  return actions;
}

/** The last moment a past_due row keeps access, or null without a period end. */
export function graceEndsAt(currentPeriodEnd: string | null | undefined): number | null {
  if (!currentPeriodEnd) return null;
  const end = new Date(currentPeriodEnd);
  if (!Number.isFinite(end.getTime())) return null;
  end.setDate(end.getDate() + GRACE_PERIOD_DAYS);
  return end.getTime();
}

/**
 * profiles.lifecycle_signals.messagingAllowed, read the way every other
 * marketing sender reads it (WEB-LEGAL-012). An unreadable profile is NOT
 * consent: the win-back is the one optional email here, so it fails closed.
 */
export function marketingAllowedFrom(
  lifecycleSignals: unknown,
  profileReadOk: boolean,
): boolean {
  if (!profileReadOk) return false;
  const signals = lifecycleSignals as { messagingAllowed?: boolean } | null | undefined;
  return signals?.messagingAllowed !== false;
}

/**
 * Where a member manages this subscription: /subscription for anything
 * Stripe bills, the store's own page for Apple and Google.
 */
export function manageUrlFor(platform: string | null | undefined, siteUrl: string): string {
  const store = manageAtForPlatform(platform);
  return store ? STORE_MANAGE_URLS[store] : `${siteUrl}/subscription`;
}

/** The member's own plan, as the plan row names it. */
export function planLabel(
  plan: { display_name?: string | null; name?: string | null } | null | undefined,
): string {
  const display = plan?.display_name?.trim();
  if (display) return display;
  const name = plan?.name?.trim();
  if (name) return name.charAt(0).toUpperCase() + name.slice(1);
  return "Des Moines Insider";
}

export interface LifecycleEmail {
  subject: string;
  html: string;
  text: string;
  category: "transactional" | "marketing";
}

function day(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/Chicago" });
}

/**
 * The four emails. Each names the member's actual plan (a VIP was told about
 * "Insider perks") and links where that plan is managed (the old links went
 * to /profile?tab=settings, which has no billing on it).
 */
export function lifecycleEmail(
  action: LifecycleAction,
  ctx: { planName: string; manageUrl: string; siteUrl: string },
): LifecycleEmail | null {
  const plan = escapeHtml(ctx.planName);
  const manage = escapeHtml(ctx.manageUrl);
  const pricing = escapeHtml(`${ctx.siteUrl}/pricing`);

  switch (action.kind) {
    case "renewal_reminder": {
      const when = day(action.periodEnd);
      return {
        subject: `Your ${ctx.planName} membership renews on ${when}`,
        html:
          `<h2>Your ${plan} membership renews on ${when}</h2>` +
          `<p>Nothing to do if you want to keep it. To change or cancel before then, ` +
          `<a href="${manage}">manage your subscription</a>.</p>`,
        text: `Your ${ctx.planName} membership renews on ${when}. To change or cancel it: ${ctx.manageUrl}`,
        category: "transactional",
      };
    }
    case "payment_failed": {
      const until = action.accessUntil ? day(action.accessUntil) : null;
      const access = until ? ` You keep ${plan} until ${until} while it retries.` : "";
      const accessText = until ? ` You keep ${ctx.planName} until ${until} while it retries.` : "";
      return {
        subject: "Your payment didn't go through",
        html:
          `<h2>We couldn't charge your card for ${plan}</h2>` +
          `<p>Stripe will try again automatically.${access} ` +
          `<a href="${manage}">Update your payment method</a> to stop it lapsing.</p>`,
        text:
          `We couldn't charge your card for ${ctx.planName}. Stripe will try again automatically.` +
          `${accessText} Update your payment method: ${ctx.manageUrl}`,
        category: "transactional",
      };
    }
    case "cancel_in_stripe":
    case "expire_locally":
      return {
        subject: `Your ${ctx.planName} membership has ended`,
        html:
          `<h2>Your ${plan} membership has ended</h2>` +
          `<p>We couldn't collect payment after several tries, so the subscription is cancelled ` +
          `and you won't be charged again. Your account is on the free plan. ` +
          `<a href="${pricing}">Subscribe again</a> whenever you like.</p>`,
        text:
          `Your ${ctx.planName} membership has ended. We couldn't collect payment after several tries, ` +
          `so the subscription is cancelled and you won't be charged again. Subscribe again: ${ctx.siteUrl}/pricing`,
        category: "transactional",
      };
    case "winback":
      return {
        subject: `Your favorites are still saved`,
        html:
          `<h2>Your account is still here</h2>` +
          `<p>Your favorites are saved. If you want ${plan} back, ` +
          `<a href="${pricing}">you can resubscribe here</a>.</p>`,
        text: `Your favorites are saved. If you want ${ctx.planName} back: ${ctx.siteUrl}/pricing`,
        category: "marketing",
      };
    default:
      return null;
  }
}
