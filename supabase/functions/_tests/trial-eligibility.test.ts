/**
 * Trial eligibility (WEB-FEAT-014).
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_tests/trial-eligibility.test.ts
 *
 * The defect was a free trial you could have as many times as you were willing
 * to cancel. `trial_period_days: existingSubscription ? undefined : 7` read the
 * ACTIVE-or-trialing WEB row, so a cancelled row matched nothing and bought
 * another 7 days. The decision tests below are the contract; the source-text
 * tests underneath pin the two reads that feed it, because the pure function is
 * only as honest as the queries behind it.
 */

import { assert, assertEquals, assertFalse } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  isEligibleForTrial,
  trialPeriodDays,
  TRIAL_PERIOD_DAYS,
} from '../_shared/trialEligibility.ts';

const REPO = new URL('../../../', import.meta.url);
const FN = 'supabase/functions/create-subscription-checkout/index.ts';
const src = await Deno.readTextFile(new URL(FN, REPO));

Deno.test('a genuinely new subscriber gets the trial', () => {
  const input = { priorTrialRowCount: 0, priorStripeSubscriptionCount: 0 };
  assert(isEligibleForTrial(input));
  assertEquals(trialPeriodDays(input), TRIAL_PERIOD_DAYS);
});

Deno.test('a churned subscriber gets no second trial', () => {
  // The cancelled row still carries trial_start. That is the whole fix.
  const input = { priorTrialRowCount: 1, priorStripeSubscriptionCount: 1 };
  assertFalse(isEligibleForTrial(input));
  assertEquals(trialPeriodDays(input), undefined);
});

Deno.test('a trial consumed on another platform still counts', () => {
  const input = { priorTrialRowCount: 1, priorStripeSubscriptionCount: 0 };
  assertFalse(isEligibleForTrial(input));
});

Deno.test('a deleted-and-recreated account is caught by Stripe history alone', () => {
  // Our rows are gone; the customer, keyed by email, is not.
  const input = { priorTrialRowCount: 0, priorStripeSubscriptionCount: 1 };
  assertFalse(isEligibleForTrial(input));
});

Deno.test('undefined is what Stripe reads as "no trial" -- never 0', () => {
  assertEquals(trialPeriodDays({ priorTrialRowCount: 2, priorStripeSubscriptionCount: 0 }), undefined);
});

Deno.test('the trial-history read filters neither status nor platform', () => {
  assert(
    /\.select\("id", \{ count: "exact", head: true \}\)\s*\n\s*\.eq\("user_id", user\.id\)\s*\n\s*\.not\("trial_start", "is", null\);/
      .test(src),
    'the trial-history query must count rows by trial_start alone',
  );
  // A status or platform filter on THIS query re-introduces the defect.
  assertFalse(
    /\.not\("trial_start", "is", null\)\s*\n\s*\.(eq|in)\(/.test(src),
    'no status/platform narrowing may be appended to the trial-history query',
  );
});

Deno.test('a failed trial-history read refuses the checkout rather than granting a trial', () => {
  assert(/if \(trialHistoryError\) \{/.test(src), 'the error must be branched on, not discarded');
  assert(/code: "subscription_lookup_failed"/.test(src));
});

Deno.test('prior Stripe subscriptions are read with status "all"', () => {
  assert(
    /stripe\.subscriptions\.list\(\{[\s\S]{0,120}status: "all",/.test(src),
    'defaulting to active-only would miss every cancelled subscription',
  );
});

Deno.test('the old always-a-trial-unless-active-now decision is gone', () => {
  assertFalse(
    /trial_period_days: webSubscription \? undefined : 7/.test(src),
    'the original defect must not come back',
  );
  assert(/trial_period_days: trialDays/.test(src));
});
