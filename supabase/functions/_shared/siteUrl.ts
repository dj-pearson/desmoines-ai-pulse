/**
 * The public site URL, in one place (WEB-FEAT-015 AC3).
 *
 * This was hardcoded per call site, and WEB-SEO-023 found out why that matters:
 * the Stripe customer-portal return_url carried the RETIRED brand domain as its
 * fallback, so a paying user who managed their subscription was returned to a
 * host this site does not serve. A literal in one function is a literal nobody
 * updates when the brand moves.
 *
 * SITE_URL is the deployed variable; VITE_SITE_URL is what the web build uses
 * and is accepted so a single secret can serve both. The literal below is the
 * last resort when neither is set -- it is the only place it should appear.
 */

const DEFAULT_SITE_URL = "https://desmoinesinsider.com";

/** Public site origin, no trailing slash. */
export function getSiteUrl(): string {
  const configured =
    Deno.env.get("SITE_URL") ||
    Deno.env.get("VITE_SITE_URL") ||
    DEFAULT_SITE_URL;
  return configured.replace(/\/+$/, "");
}

/** Where each store sends a subscriber to manage the billing it owns. */
export const STORE_MANAGE_URLS = {
  appstore: "https://apps.apple.com/account/subscriptions",
  play: "https://play.google.com/store/account/subscriptions",
} as const;

export type ManageAt = keyof typeof STORE_MANAGE_URLS;

/** Maps a user_subscriptions.platform value to the store that bills it. */
export function manageAtForPlatform(platform: string | null | undefined): ManageAt | null {
  if (platform === "ios") return "appstore";
  if (platform === "android") return "play";
  return null;
}
