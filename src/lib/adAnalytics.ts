/**
 * First-party ad fill tracking (WEB-FEAT-004). Campaign (paid) impressions/
 * clicks go to ad_impressions/ad_clicks via src/lib/tracking.ts (iOS-parity).
 * Affiliate + house fills don't fit those campaign-keyed tables, so they're
 * logged to user_analytics tagged with an inventory_class — making fill rate
 * (paid vs affiliate vs house) measurable from one place. Impressions deduped
 * per session+class+placement.
 */
import { supabase } from "@/integrations/supabase/client";
import { storage } from "@/lib/safeStorage";
import { createLogger } from "@/lib/logger";

const log = createLogger("adAnalytics");
const SESSION_KEY = "dmi-session-id";

export type AdInventoryClass = "paid" | "affiliate" | "house";

export function getSessionId(): string {
  let sessionId = storage.get<string>(SESSION_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    storage.set(SESSION_KEY, sessionId);
  }
  return sessionId;
}

const seenImpressions = new Set<string>();

export function logAdImpression(
  inventoryClass: AdInventoryClass,
  placement: string,
  meta?: Record<string, unknown>
): void {
  const key = `${getSessionId()}:${inventoryClass}:${placement}`;
  if (seenImpressions.has(key)) return;
  seenImpressions.add(key);
  write("ad_impression", inventoryClass, placement, meta);
}

export function logAdClick(
  inventoryClass: AdInventoryClass,
  placement: string,
  meta?: Record<string, unknown>
): void {
  write("ad_click", inventoryClass, placement, meta);
}

function write(
  event: "ad_impression" | "ad_click",
  inventoryClass: AdInventoryClass,
  placement: string,
  meta?: Record<string, unknown>
): void {
  void (async () => {
    // user_analytics.content_id is uuid NOT NULL. This used to pass `placement`
    // ("top_banner"), so every insert was rejected with 22P02 "invalid input
    // syntax for type uuid" — measured live on /events 2026-08-11. The
    // placement is already carried in filters_used below, so nothing is lost by
    // giving the column a real uuid; that also matches useAnalytics.ts:229,
    // which mints one for page views for the same reason.
    //
    // AND THE REJECTION WAS INVISIBLE TWICE OVER. supabase-js RESOLVES with an
    // { error } object rather than throwing, so the try/catch below never fired
    // and the warn never ran. Affiliate and house ad fill rate — the whole
    // point of this module — has recorded zero rows since it shipped.
    const { error } = await supabase.from("user_analytics").insert({
      event_type: event,
      content_type: "ad",
      content_id: crypto.randomUUID(),
      session_id: getSessionId(),
      page_url: typeof window !== "undefined" ? window.location.pathname : null,
      filters_used: { inventory_class: inventoryClass, placement, ...meta },
    });
    if (error) {
      log.warn("write", "insert rejected", {
        event,
        placement,
        code: error.code,
        message: error.message,
      });
    }
  })();
}
