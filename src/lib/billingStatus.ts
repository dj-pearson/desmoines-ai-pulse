/**
 * Billing switches the premium surfaces read before they touch checkout
 * (docs/page-plans/pricing.md, WP1 item 7).
 *
 * Both are false because the server is not ready for what they would allow.
 * Flip each one only in the PR that ships the deploy named in its comment.
 */

/**
 * Whether a subscriber with an active or trialing WEB row may switch to a
 * different paid tier from the browser.
 *
 * Today create-subscription-checkout answers a plan change with
 * stripe.subscriptions.update (charging the prorated difference), and the
 * webhook's subscriptionUpdatePatch leaves plan_id out on purpose, so the row
 * never moves: an Insider who clicks "Go VIP" pays VIP and stays Insider on
 * web, server, iOS and Android. Until that is fixed, no surface calls checkout
 * for that user; they show PLAN_CHANGE_PAUSED_MESSAGE instead.
 *
 * Flipped by pricing plan D1: the deploy that makes stripe-webhook write
 * plan_id from the Stripe price on customer.subscription.updated.
 */
export const IN_PLACE_PLAN_CHANGE_ENABLED = false;

/**
 * Whether the client may ask create-subscription-checkout for a proration
 * preview (`preview: true`) before a plan change.
 *
 * Today's server ignores that field and performs the change, so a client that
 * sent it would charge the user while showing them a "preview". Keep this false
 * until the server that reads `preview` is deployed.
 *
 * Flipped by pricing plan D2: the deploy of WP5's preview mode in
 * create-subscription-checkout.
 */
export const PLAN_CHANGE_PREVIEW_AVAILABLE = false;

/** What a surface says instead of starting a plan change while it is paused. */
export const PLAN_CHANGE_PAUSED_MESSAGE =
  "Changing plans online is paused while we fix a billing problem. Your current plan is unchanged.";

/** The `code` a paused plan change reports through CheckoutResult. */
export const PLAN_CHANGE_PAUSED_CODE = "plan_change_paused";
