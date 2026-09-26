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

/**
 * Deno.env reached through globalThis, so importing this module does not throw
 * a ReferenceError outside Deno (WEB-ADS-005).
 *
 * emailLayout.ts calls getSiteUrl, and _shared/campaignNotificationEmail.ts
 * imports emailLayout so stripe-webhook and send-campaign-notification render
 * one email rather than two. That put this file in the graph of an offline
 * test, where `Deno` is not a binding at all - and the bare reference is also
 * why tsconfig.scripts.json could not type-check it. Under Deno nothing here
 * changes: Deno.env exists, and env access still needs --allow-env.
 */
export function envVar(name: string): string | undefined {
  return (globalThis as { Deno?: { env?: { get(key: string): string | undefined } } })
    .Deno?.env?.get(name);
}

/** Public site origin, no trailing slash. */
export function getSiteUrl(): string {
  const configured = envVar("SITE_URL") || envVar("VITE_SITE_URL") || DEFAULT_SITE_URL;
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
