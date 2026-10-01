/**
 * Stop billing before erasing the account (WEB-AUTH-006).
 *
 * delete-user-account purges user_subscriptions -- the row that maps a Stripe
 * customer and subscription to this user -- and never once called Stripe.
 * `grep -ci stripe` on that function returned 0. So the charge kept recurring,
 * and the webhook that would normally react to a cancellation could no longer
 * find a user to react for. The account was gone; the money was not.
 *
 * ORDER IS THE WHOLE POINT. Cancellation runs BEFORE the purge loop, because
 * after the purge there is nothing left to read the subscription id from. Once
 * those rows are deleted the only way to find the customer is to search Stripe
 * by email, which the erasure has also just removed.
 *
 * The Stripe client is a parameter, not an import, so the ordering and the
 * refusal can be tested against a fake without a network or a secret key.
 */

/** The slice of the Stripe SDK this needs. Narrow on purpose. */
export interface BillingClient {
  subscriptions: {
    cancel(id: string): Promise<unknown>;
  };
  customers: {
    del(id: string): Promise<unknown>;
  };
}

export interface SubscriptionRow {
  platform?: string | null;
  status?: string | null;
  stripe_subscription_id?: string | null;
  stripe_customer_id?: string | null;
}

export interface BillingTeardownResult {
  /** Stripe subscription ids cancelled. */
  cancelled: string[];
  /** Stripe customer ids deleted. */
  customersDeleted: string[];
  /**
   * Store subscriptions that CANNOT be cancelled from here. Apple and Google
   * own these; a server has no API to end them on the user's behalf. The caller
   * must tell the user, with a link, rather than let them believe deleting the
   * account stopped the charge.
   */
  storeSubscriptions: { platform: string; manageUrl: string }[];
  /** Set when Stripe failed. The deletion must be refused, not continued. */
  error?: string;
}

/** Where a user goes to cancel a subscription this server cannot touch. */
export const STORE_MANAGE_URLS: Record<string, string> = {
  ios: "https://apps.apple.com/account/subscriptions",
  android: "https://play.google.com/store/account/subscriptions",
};

/** Statuses that are already over. Cancelling these would only produce noise. */
const INACTIVE = new Set(["canceled", "cancelled", "incomplete_expired", "expired", "refunded"]);

export function isLive(row: SubscriptionRow): boolean {
  return !INACTIVE.has((row.status ?? "").toLowerCase());
}

/**
 * Cancel every web subscription and delete the Stripe customer.
 *
 * Cancels IMMEDIATELY rather than at period end. The account is about to stop
 * existing, so "keep access until the period ends" has nobody to keep access
 * for, and leaving a subscription running past an erasure request is the thing
 * this exists to prevent.
 *
 * Returns `error` rather than throwing: the caller has to refuse the deletion
 * and say why, and an exception halfway through would leave that decision to a
 * catch block that cannot tell a billing failure from anything else.
 */
export async function cancelBillingBeforeErasure(
  stripe: BillingClient | null,
  rows: SubscriptionRow[],
): Promise<BillingTeardownResult> {
  const result: BillingTeardownResult = {
    cancelled: [],
    customersDeleted: [],
    storeSubscriptions: [],
  };

  const live = rows.filter(isLive);

  // Store subscriptions first, so the caller can report them even if Stripe
  // then fails. They are reported whether or not there is anything for Stripe
  // to do.
  for (const row of live) {
    const platform = (row.platform ?? "").toLowerCase();
    const manageUrl = STORE_MANAGE_URLS[platform];
    if (manageUrl && !result.storeSubscriptions.some((s) => s.platform === platform)) {
      result.storeSubscriptions.push({ platform, manageUrl });
    }
  }

  const webRows = live.filter(
    (r) => (r.platform ?? "web").toLowerCase() === "web" && (r.stripe_subscription_id || r.stripe_customer_id),
  );

  if (webRows.length === 0) return result;

  if (!stripe) {
    // A configured Stripe client is not optional when there is something to
    // cancel. Proceeding would erase the mapping and leave the charge running.
    result.error =
      "Billing is not configured on the server, so the subscription could not be cancelled. " +
      "Account deletion was refused rather than leaving an active charge with no account behind it.";
    return result;
  }

  const subscriptionIds = [...new Set(webRows.map((r) => r.stripe_subscription_id).filter(Boolean))] as string[];
  const customerIds = [...new Set(webRows.map((r) => r.stripe_customer_id).filter(Boolean))] as string[];

  for (const id of subscriptionIds) {
    try {
      await stripe.subscriptions.cancel(id);
      result.cancelled.push(id);
    } catch (e) {
      result.error = `Could not cancel subscription ${id}: ${e instanceof Error ? e.message : String(e)}`;
      return result;
    }
  }

  // Customer deletion is second and its failure is also fatal, because a
  // customer left behind keeps the payment method and the billing address --
  // personal data the erasure was supposed to remove.
  for (const id of customerIds) {
    try {
      await stripe.customers.del(id);
      result.customersDeleted.push(id);
    } catch (e) {
      result.error = `Could not delete Stripe customer ${id}: ${e instanceof Error ? e.message : String(e)}`;
      return result;
    }
  }

  return result;
}
