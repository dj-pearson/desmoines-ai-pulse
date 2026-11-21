/**
 * The payment-failed notice is transactional, and two jobs can send it
 * (owner decision 2026-11-22, WEB-LEGAL-016 follow-up).
 *
 * A customer whose card was declined is told so whether or not they opted out
 * of marketing. That is the same treatment the trial notice gets
 * (_shared/trialNotice.ts, WEB-LEGAL-006): the notice is about money they owe
 * on an account they hold, and withholding it from the people who opted out
 * means they find out when the subscription ends. It still goes through
 * sendEmail with category "transactional", so a bounce or complaint in
 * email_suppressions blocks it; an "unsubscribe" suppression does not.
 *
 * Two senders exist for the same past_due row:
 *
 *   subscription-lifecycle   daily, 08:00 UTC, web-billed rows only. Logs
 *                            subscription_events event_type "payment_failed"
 *                            after a successful send.
 *   subscription-nurture     daily, 13:00 UTC, both the agent-runner module and
 *                            the standalone agent-subscription-nurture function.
 *                            Logs nurture_sends kind "dunning".
 *
 * Before this module neither looked at the other's ledger, so a member who had
 * consented got "Your payment didn't go through" in the morning and "Action
 * needed: update your payment method" the same afternoon. Making the nurture
 * copy consent-free would have extended that to everyone. Both senders now ask
 * paymentFailedNoticeSentSince before sending, which reads BOTH ledgers.
 */

/** subscription_events.event_type written by subscription-lifecycle. */
export const PAYMENT_FAILED_EVENT = "payment_failed";

/** nurture_sends.kind written by subscription-nurture. */
export const DUNNING_KIND = "dunning";

/**
 * nurture_sends statuses that mean nothing reached the recipient: "skipped" is
 * a suppressed address or no mailer configured, "failed" is a provider error.
 * A row in either state must not stop the other sender from trying.
 */
const NOT_SENT_STATUSES = "(skipped,failed)";

// A service-role supabase-js client, untyped like email.ts's DbClient so this
// module imports nothing from esm.sh and loads offline under Deno tests.
// deno-lint-ignore no-explicit-any
type Db = any;

/**
 * Has either sender already told this user their payment failed since
 * `sinceIso`?
 *
 * FAILS CLOSED: an unreadable ledger returns true and the caller skips. Two
 * senders exist precisely so that one bad run does not lose the notice; the
 * other job runs the same day and tomorrow. Failing open would send a
 * duplicate on every read error, every day.
 */
export async function paymentFailedNoticeSentSince(
  supabase: Db,
  userId: string,
  sinceIso: string,
): Promise<boolean> {
  try {
    const { data: events, error: eventsError } = await supabase
      .from("subscription_events")
      .select("id")
      .eq("user_id", userId)
      .eq("event_type", PAYMENT_FAILED_EVENT)
      .gte("created_at", sinceIso)
      .limit(1);
    if (eventsError) {
      console.error(`[paymentFailedNotice] subscription_events read failed for ${userId}; not sending: ${eventsError.message}`);
      return true;
    }
    if (events && events.length > 0) return true;

    const { data: sends, error: sendsError } = await supabase
      .from("nurture_sends")
      .select("id")
      .eq("user_id", userId)
      .eq("kind", DUNNING_KIND)
      .not("status", "in", NOT_SENT_STATUSES)
      .gte("created_at", sinceIso)
      .limit(1);
    if (sendsError) {
      console.error(`[paymentFailedNotice] nurture_sends read failed for ${userId}; not sending: ${sendsError.message}`);
      return true;
    }
    return !!(sends && sends.length > 0);
  } catch (err) {
    console.error(`[paymentFailedNotice] ledger read threw for ${userId}; not sending: ${err instanceof Error ? err.message : String(err)}`);
    return true;
  }
}
