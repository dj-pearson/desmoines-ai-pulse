/**
 * Where every billing email sends a member (WEB-LEGAL-016).
 *
 * The trial notice, the dunning reminder and the upgrade prompt all linked to
 * /profile?tab=settings, a page with no plan, payment or cancel control on it.
 * The trial notice's button said "Cancel before you are charged" and landed on
 * security settings. Each sender had its own template literal, so fixing one
 * left the others wrong, which is how WEB-LEGAL-006 closed with the cancel
 * link still broken.
 *
 * Every billing link is built here. _tests/billing-links.test.ts renders each
 * billing email and fails if a link resolves anywhere other than these paths,
 * and checks that each path is a route in src/App.tsx.
 *
 * The web app's copy is src/lib/billingLinks.ts. Keep the two paths equal;
 * the test above reads both.
 */

/** The page with Cancel, Resume and Manage payment method (SubscriptionPortal). */
export const SUBSCRIPTION_PATH = "/subscription";

/** Plans and prices, for someone choosing or changing a plan. */
export const PRICING_PATH = "/pricing";

/**
 * Billing links already sent that pointed somewhere else. Mail cannot be
 * recalled, so these must keep showing the subscription (the Settings tab
 * carries a Subscription panel for that reason), and no new billing email may
 * use them.
 */
export const LEGACY_BILLING_PATHS = ["/profile?tab=settings"] as const;

export type PaidPlan = "insider" | "vip";

function base(siteUrl: string): string {
  return siteUrl.replace(/\/+$/, "");
}

/** Manage, cancel or update the card for a web (Stripe) subscription. */
export function subscriptionUrl(siteUrl: string): string {
  return `${base(siteUrl)}${SUBSCRIPTION_PATH}`;
}

/** The pricing page, preselecting a plan when one is named. */
export function pricingUrl(siteUrl: string, plan?: PaidPlan): string {
  return plan ? `${base(siteUrl)}${PRICING_PATH}?plan=${plan}` : `${base(siteUrl)}${PRICING_PATH}`;
}

export interface NurtureEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * The past-due reminder. Both copies of subscription-nurture send this, so the
 * wording and the link live in one place.
 */
export function buildDunningEmail(siteUrl: string): NurtureEmail {
  const url = subscriptionUrl(siteUrl);
  return {
    subject: "Action needed: update your payment method",
    html:
      `<h1>We couldn't process your payment</h1>` +
      `<p>No worries, we'll retry automatically. To avoid any interruption to your Insider access, you can update your payment method anytime.</p>` +
      `<p><a href="${url}">Update payment method</a></p>`,
    text:
      "We couldn't process your payment; we'll retry. Update your payment method to keep Insider access: " +
      url,
  };
}

/** The upgrade prompt for engaged free members. */
export function buildUpgradePromptEmail(siteUrl: string): NurtureEmail {
  const url = pricingUrl(siteUrl, "insider");
  return {
    subject: "Unlock more of Des Moines with Insider",
    html:
      `<h1>Get more from Des Moines Insider</h1>` +
      `<p>You're clearly enjoying the city. Insider unlocks premium picks and the AI Trip Planner to make every outing easier.</p>` +
      `<p><a href="${url}">See Insider</a></p>`,
    text: `Insider unlocks premium picks and the AI Trip Planner. See Insider: ${url}`,
  };
}
