/**
 * Business Pro: the pure decisions shared by create-business-pro-checkout and
 * stripe-webhook (growth roadmap #3, part 2). No network, no env, so the Deno
 * suite in _tests/business-pro.test.ts can cover every branch.
 *
 * HOW A BUSINESS PRO SUBSCRIPTION IS TOLD APART FROM A READER ONE. Checkout
 * writes `kind: "business_pro"` into both the session's and the subscription's
 * metadata, and deliberately no `planId`. stripe-webhook's reader branch
 * matches `metadata.userId && metadata.planId`, so a Business Pro session can
 * never be mistaken for a reader plan, and the webhook checks `kind` before it
 * looks at user_subscriptions at all.
 */

export const BUSINESS_PRO_KIND = "business_pro";
export const BUSINESS_PRO_SLUG = "business_pro";

export type BusinessListingType = "restaurant" | "attraction";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Stripe metadata is a flat string map, possibly null on old objects. */
export type StripeMetadata = Record<string, string> | null | undefined;

export function isBusinessProMetadata(metadata: StripeMetadata): boolean {
  return metadata?.kind === BUSINESS_PRO_KIND;
}

export interface BusinessProTarget {
  userId: string;
  listingType: BusinessListingType;
  listingId: string;
  businessPlanId: string;
}

/**
 * The metadata checkout attaches to the session and to the subscription. The
 * plan key is `businessPlanId`, never `planId`: see the header.
 */
export function businessProMetadata(t: BusinessProTarget): Record<string, string> {
  return {
    kind: BUSINESS_PRO_KIND,
    userId: t.userId,
    listingType: t.listingType,
    listingId: t.listingId,
    businessPlanId: t.businessPlanId,
  };
}

/** Read a target back out of metadata, or null when anything is missing or malformed. */
export function businessProTargetFromMetadata(metadata: StripeMetadata): BusinessProTarget | null {
  if (!isBusinessProMetadata(metadata)) return null;
  const m = metadata!;
  if (!UUID_RE.test(m.userId ?? "") || !UUID_RE.test(m.listingId ?? "") || !UUID_RE.test(m.businessPlanId ?? "")) {
    return null;
  }
  if (m.listingType !== "restaurant" && m.listingType !== "attraction") return null;
  return {
    userId: m.userId,
    listingType: m.listingType,
    listingId: m.listingId.toLowerCase(),
    businessPlanId: m.businessPlanId,
  };
}

export type CheckoutAction = "checkout" | "portal";

export interface CheckoutRequest {
  action: CheckoutAction;
  listingType: BusinessListingType;
  listingId: string;
}

/**
 * Validate the browser's request. It names a listing and an action and nothing
 * else: no amount, no price, no plan. The server looks all of those up.
 */
export function parseCheckoutRequest(body: unknown): CheckoutRequest | { error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "The request body must be a JSON object." };
  const b = body as Record<string, unknown>;
  const action = b.action ?? "checkout";
  if (action !== "checkout" && action !== "portal") return { error: "action must be checkout or portal." };
  if (b.listingType !== "restaurant" && b.listingType !== "attraction") {
    return { error: "listingType must be restaurant or attraction." };
  }
  if (typeof b.listingId !== "string" || !UUID_RE.test(b.listingId)) return { error: "listingId must be a uuid." };
  return { action, listingType: b.listingType, listingId: b.listingId.toLowerCase() };
}

/** The Stripe subscription fields the row is built from. */
export interface StripeSubscriptionLike {
  id: string;
  status: string;
  cancel_at_period_end?: boolean | null;
  current_period_end?: number | null;
  customer?: string | { id: string } | null;
  metadata?: StripeMetadata;
}

/**
 * The business_subscriptions columns a Stripe subscription determines. Used
 * on checkout completion and on every customer.subscription.* event, so the
 * row always reflects what Stripe last said rather than what checkout hoped.
 */
export function businessSubscriptionPatch(sub: StripeSubscriptionLike, now: Date = new Date()) {
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
  return {
    status: sub.status,
    cancel_at_period_end: sub.cancel_at_period_end === true,
    current_period_end:
      typeof sub.current_period_end === "number" ? new Date(sub.current_period_end * 1000).toISOString() : null,
    stripe_customer_id: customer,
    updated_at: now.toISOString(),
  };
}

/**
 * Is this invoice for a Business Pro subscription? Stripe copies the
 * subscription's metadata onto the invoice as subscription_details.metadata.
 * `knownBusinessSubscription` is the fallback: the first invoice can arrive
 * before the checkout event has written the row, and an older invoice may
 * lack subscription_details.
 */
export function isBusinessProInvoice(
  invoice: { subscription_details?: { metadata?: StripeMetadata } | null },
  knownBusinessSubscription: boolean,
): boolean {
  return isBusinessProMetadata(invoice.subscription_details?.metadata) || knownBusinessSubscription;
}

/** Statuses for which a second checkout on the same listing is refused. */
export const LIVE_STATUSES: ReadonlySet<string> = new Set(["active", "trialing", "past_due"]);
