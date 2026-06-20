/**
 * Guest-favorites funnel logging (WEB-FEAT-006). Writes to the same
 * user_analytics table the subscription funnel uses, so guest-save ->
 * wall-hit -> signup conversion is queryable.
 */
import { supabase } from "@/integrations/supabase/client";
import { storage } from "@/lib/safeStorage";
import { createLogger } from "@/lib/logger";

const log = createLogger("favoriteAnalytics");
const SESSION_KEY = "dmi-session-id";

export type FavoriteFunnelEvent =
  | "guest_save"
  | "guest_save_wall_hit"
  | "signup_from_wall";

function getSessionId(): string {
  let sessionId = storage.get<string>(SESSION_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    storage.set(SESSION_KEY, sessionId);
  }
  return sessionId;
}

/** Fire-and-forget; never throws into the UI. */
export function logFavoriteFunnelEvent(
  event: FavoriteFunnelEvent,
  contentType: string,
  contentId: string,
  userId?: string | null,
  details?: Record<string, unknown>
): void {
  void (async () => {
    try {
      await supabase.from("user_analytics").insert({
        event_type: event,
        content_type: contentType,
        content_id: contentId,
        session_id: getSessionId(),
        user_id: userId ?? null,
        page_url: typeof window !== "undefined" ? window.location.pathname : null,
        filters_used: details ? JSON.parse(JSON.stringify(details)) : null,
      });
    } catch (err) {
      log.warn("logFavoriteFunnelEvent", "failed", { error: String(err) });
    }
  })();
}
