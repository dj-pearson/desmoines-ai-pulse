/**
 * Advertiser funnel logging: /advertise -> saved campaign -> Stripe checkout ->
 * paid. The subscription funnel has had step events since WEB-QA-026; the
 * advertiser one had none, so nobody could say whether businesses leave at the
 * form, at checkout or at the card, and AOS-PROSPECT-007's "self-serve
 * onboarding" had no baseline to improve on.
 *
 * Same table, consent gate and session id as useConversionFunnel and
 * paywallAnalytics: nothing is written, and no session id is stored, unless the
 * visitor granted the analytics category.
 *
 * No amount is logged. These rows count steps; what anyone is charged lives on
 * the campaign and is decided by the server (CLAUDE.md, "Money is decided on
 * the server"), and a second copy of a price in an analytics table is a second
 * number to disagree with.
 */
import { supabase } from "@/integrations/supabase/client";
import { sessionStore, storage } from "@/lib/safeStorage";
import { createLogger } from "@/lib/logger";
import { hasConsent } from "@/lib/cookieConsent";

const log = createLogger("advertiserFunnel");
const SESSION_KEY = "dmi-session-id";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AdvertiserFunnelEvent =
  | "ad_funnel_advertise_viewed"
  | "ad_funnel_campaign_saved"
  | "ad_funnel_checkout_started"
  | "ad_funnel_checkout_cancelled"
  | "ad_funnel_payment_confirmed";

/** Where a checkout was opened from: the /advertise form or a campaign page. */
export type CheckoutSource = "advertise" | "campaign_page";

export interface AdvertiserFunnelDetails {
  campaignId?: string | null;
  source?: CheckoutSource;
  placementCount?: number;
}

/** The ordered steps the admin funnel chart counts. Cancelled is a side exit. */
export const ADVERTISER_FUNNEL_STEPS: ReadonlyArray<{ event: AdvertiserFunnelEvent; name: string }> = [
  { event: "ad_funnel_advertise_viewed", name: "Advertise page viewed" },
  { event: "ad_funnel_campaign_saved", name: "Campaign saved" },
  { event: "ad_funnel_checkout_started", name: "Checkout started" },
  { event: "ad_funnel_payment_confirmed", name: "Payment confirmed" },
];

function getSessionId(): string {
  let sessionId = storage.get<string>(SESSION_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    storage.set(SESSION_KEY, sessionId);
  }
  return sessionId;
}

async function currentUserId(): Promise<string | null> {
  try {
    // getSession reads the stored session; it does not call the network.
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Fire-and-forget; never throws into the UI. */
export function logAdvertiserFunnelEvent(event: AdvertiserFunnelEvent, details: AdvertiserFunnelDetails = {}): void {
  if (!hasConsent("analytics")) return;

  const campaignId = details.campaignId && UUID_RE.test(details.campaignId) ? details.campaignId : null;
  const extra: Record<string, unknown> = {};
  if (details.source) extra.source = details.source;
  if (typeof details.placementCount === "number") extra.placement_count = details.placementCount;

  void (async () => {
    try {
      const userId = await currentUserId();
      const { error } = await supabase.from("user_analytics").insert({
        event_type: event,
        content_type: "campaign",
        // content_id is a nullable uuid (20260718000002); a campaign id is one.
        content_id: campaignId,
        session_id: getSessionId(),
        user_id: userId,
        page_url: typeof window !== "undefined" ? window.location.pathname : null,
        filters_used: Object.keys(extra).length > 0 ? JSON.parse(JSON.stringify(extra)) : null,
      });
      // A lost analytics row is not the advertiser's problem, so it is
      // reported in development only.
      if (error && import.meta.env.DEV) {
        log.warn("logAdvertiserFunnelEvent", "insert failed", { error: error.message, event });
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        log.warn("logAdvertiserFunnelEvent", "failed", { error: String(err) });
      }
    }
  })();
}

/**
 * Log an event at most once per campaign per browser tab. The success and
 * cancel pages are landing pages: a reload, or the back button from the
 * campaign page, must not count a second payment or a second walk-away.
 */
export function logAdvertiserFunnelEventOnce(event: AdvertiserFunnelEvent, campaignId: string): void {
  if (!hasConsent("analytics")) return;
  const onceKey = `${event}:${campaignId}`;
  if (sessionStore.get<boolean>(onceKey)) return;
  sessionStore.set(onceKey, true);
  logAdvertiserFunnelEvent(event, { campaignId });
}
