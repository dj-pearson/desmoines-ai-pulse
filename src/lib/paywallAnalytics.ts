/**
 * Contextual paywall funnel logging (WEB-FEAT-001). Records present / dismiss /
 * checkout-start per context id so per-surface conversion is measurable. Uses
 * the same user_analytics table as the subscription + favorites funnels.
 */
import { supabase } from "@/integrations/supabase/client";
import { storage } from "@/lib/safeStorage";
import { createLogger } from "@/lib/logger";

const log = createLogger("paywallAnalytics");
const SESSION_KEY = "dmi-session-id";

export type PaywallEvent =
  | "paywall_present"
  | "paywall_dismiss"
  | "paywall_checkout_start";

function getSessionId(): string {
  let sessionId = storage.get<string>(SESSION_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    storage.set(SESSION_KEY, sessionId);
  }
  return sessionId;
}

/** Fire-and-forget; never throws into the UI. */
export function logPaywallEvent(
  event: PaywallEvent,
  contextId: string,
  details?: Record<string, unknown>
): void {
  void (async () => {
    try {
      await supabase.from("user_analytics").insert({
        event_type: event,
        content_type: "paywall",
        content_id: contextId,
        session_id: getSessionId(),
        user_id: null,
        page_url: typeof window !== "undefined" ? window.location.pathname : null,
        filters_used: details ? JSON.parse(JSON.stringify(details)) : null,
      });
    } catch (err) {
      log.warn("logPaywallEvent", "failed", { error: String(err) });
    }
  })();
}
