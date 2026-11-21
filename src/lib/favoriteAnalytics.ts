/**
 * Guest-favorites funnel logging (WEB-FEAT-006). Writes to the same
 * user_analytics table the subscription funnel uses, so guest-save ->
 * wall-hit -> signup conversion is queryable.
 *
 * Analytics consent gates it like the paywall and advertiser funnels
 * (WEB-LEGAL-014): without it nothing is written and no session id is stored.
 * The favorite itself is saved either way; only the funnel row is skipped.
 */
import { supabase } from "@/integrations/supabase/client";
import { storage } from "@/lib/safeStorage";
import { createLogger } from "@/lib/logger";
import { analyticsGranted } from "@/lib/analyticsConsent";

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
  if (!analyticsGranted()) return;

  void (async () => {
    try {
      // CAPTURE THE ERROR. PostgREST returns RLS and schema failures IN THE
      // RESULT rather than throwing, so the catch below never saw them and this
      // whole funnel could be writing nothing at all without a single log line
      // (WEB-FEAT-006 AC5, WEB-BE-032).
      //
      // The specific thing this makes visible: the two GUEST events pass
      // userId null by design, and the live INSERT policy on user_analytics is
      // named "Users can insert their own analytics". If its WITH CHECK is
      // auth.uid() = user_id, an anonymous insert fails it - null = null is not
      // true - and the guest half of the funnel, which is the half this story
      // exists to measure, is silently discarded. Settling that needs a
      // privileged read of the policy; logging it means runtime answers instead.
      const { error } = await supabase.from("user_analytics").insert({
        event_type: event,
        content_type: contentType,
        content_id: contentId,
        session_id: getSessionId(),
        user_id: userId ?? null,
        page_url: typeof window !== "undefined" ? window.location.pathname : null,
        filters_used: details ? JSON.parse(JSON.stringify(details)) : null,
      });

      if (error) {
        log.warn("logFavoriteFunnelEvent", "insert rejected", {
          event,
          anonymous: !userId,
          code: error.code,
          message: error.message,
          hint: error.hint,
        });
      }
    } catch (err) {
      log.warn("logFavoriteFunnelEvent", "failed", { error: String(err) });
    }
  })();
}
