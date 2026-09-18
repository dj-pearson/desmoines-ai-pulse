/**
 * Trial eligibility (WEB-FEAT-014).
 *
 * The trial is a FIRST-PURCHASE benefit. What shipped before decided it from
 * `existingSubscription ? undefined : 7`, where `existingSubscription` was the
 * active-or-trialing web row -- so a user who cancelled, lapsed and came back
 * matched nothing and was handed another 7 free days. Repeatable forever, once
 * per cancellation.
 *
 * Two signals decide it, and either one alone is leaky:
 *
 *   - user_subscriptions rows carrying a trial_start, ANY status and ANY
 *     platform. This is the record of "we already gave this person a trial".
 *     Status must not be filtered: a cancelled row is exactly the case the old
 *     code missed. Platform must not be filtered either -- a trial consumed on
 *     iOS is still a trial consumed.
 *   - prior Stripe subscriptions on the customer. A user who deletes and
 *     recreates an account keeps the same email, so Stripe remembers what our
 *     own table no longer does.
 *
 * Kept as a pure function so the decision can be tested without a database or
 * a Stripe key; the caller does the two reads and passes the counts in.
 */

export const TRIAL_PERIOD_DAYS = 7;

export interface TrialEligibilityInput {
  /** user_subscriptions rows for this user with trial_start set, any status, any platform. */
  priorTrialRowCount: number;
  /** Subscriptions Stripe already holds for this customer, any status. 0 when there is no customer yet. */
  priorStripeSubscriptionCount: number;
}

/** True only for a user who has never held a trial and has never had a Stripe subscription. */
export function isEligibleForTrial(input: TrialEligibilityInput): boolean {
  return input.priorTrialRowCount === 0 && input.priorStripeSubscriptionCount === 0;
}

/**
 * The value to hand Stripe as subscription_data.trial_period_days.
 * `undefined` is what Stripe reads as "no trial"; passing 0 is an error there.
 */
export function trialPeriodDays(input: TrialEligibilityInput): number | undefined {
  return isEligibleForTrial(input) ? TRIAL_PERIOD_DAYS : undefined;
}
