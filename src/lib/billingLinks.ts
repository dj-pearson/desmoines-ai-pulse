/**
 * Where the site sends a member to manage a subscription (WEB-LEGAL-016).
 *
 * The edge functions' copy is supabase/functions/_shared/billingLinks.ts, which
 * every billing email builds its links from. Keep the paths equal:
 * supabase/functions/_tests/billing-links.test.ts reads both files and fails
 * when they differ.
 */

/** Cancel, Resume and Manage payment method live here (SubscriptionPortal). */
export const SUBSCRIPTION_PATH = "/subscription";

/** Plans and prices. */
export const PRICING_PATH = "/pricing";
