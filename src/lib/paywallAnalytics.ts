/**
 * Contextual paywall funnel logging (WEB-FEAT-001). Records present / dismiss /
 * CTA click per context id so per-surface conversion is measurable. Uses the
 * same user_analytics table as the subscription and favorites funnels.
 *
 * Three things changed in pricing plan WP4 item 5:
 *   - Nothing is written, and no session id is stored, without analytics
 *     consent, the same gate as usePageTracking and useConversionFunnel.
 *   - The insert's `{ error }` is read. supabase-js resolves a rejected insert
 *     rather than throwing, so the old try/catch never saw one.
 *   - `user_id` comes from the session when there is one; it was always null.
 *
 * `content_id` is a uuid column (nullable since 20260718000002, which the
 * snapshot ledger lists as applied). The context id used to go there, and a
 * feature key such as "save_searches" is not a uuid, so every row was refused
 * with 22P02. The context now travels in `filters_used.context`.
 */
import { supabase } from "@/integrations/supabase/client";
import { storage } from "@/lib/safeStorage";
import { createLogger } from "@/lib/logger";
import { hasConsent } from "@/components/CookieConsentBanner";

const log = createLogger("paywallAnalytics");
const SESSION_KEY = "dmi-session-id";

export type PaywallEvent =
  | "paywall_present"
  | "paywall_dismiss"
  // A click on the modal's call to action. It navigates to /pricing or
  // /subscription; it does not start a Stripe checkout, which is why it is no
  // longer called paywall_checkout_start.
  | "paywall_cta_click";

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
    // No session to read means an anonymous row, which is what the insert
    // wrote before user_id was filled in at all.
    if (error) return null;
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Fire-and-forget; never throws into the UI. */
export function logPaywallEvent(
  event: PaywallEvent,
  contextId: string,
  details?: Record<string, unknown>
): void {
  if (!hasConsent("analytics")) return;

  void (async () => {
    try {
      const userId = await currentUserId();
      const { error } = await supabase.from("user_analytics").insert({
        event_type: event,
        content_type: "paywall",
        content_id: null,
        session_id: getSessionId(),
        user_id: userId,
        page_url: typeof window !== "undefined" ? window.location.pathname : null,
        filters_used: JSON.parse(JSON.stringify({ context: contextId, ...(details ?? {}) })),
      });
      // A lost analytics row is not the visitor's problem, so it is reported
      // in development only.
      if (error && import.meta.env.DEV) {
        log.warn("logPaywallEvent", "insert failed", { error: error.message, event });
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        log.warn("logPaywallEvent", "failed", { error: String(err) });
      }
    }
  })();
}
