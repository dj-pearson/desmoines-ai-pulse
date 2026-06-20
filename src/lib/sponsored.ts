/**
 * Sponsored/featured listing helpers (WEB-FEAT-005). Web twin of the iOS
 * SponsoredArranger. Sponsored listings are organic content rows flagged with
 * is_sponsored (+ optional sponsored_until expiry) — distinct from paid
 * campaign ads (ad_impressions/ad_clicks). They are clearly labeled, shown to
 * all tiers, and tracked under their own inventory class in user_analytics.
 *
 * NOTE: exports both the `isSponsoredActive`/`arrangeSponsored` names and the
 * `isActivelySponsored`/`arrangeSponsoredFirst` aliases so all call sites
 * (and tests) resolve after the branch merge.
 */
import { supabase } from "@/integrations/supabase/client";
import { storage } from "@/lib/safeStorage";
import { createLogger } from "@/lib/logger";

const log = createLogger("sponsored");
const SESSION_KEY = "dmi-session-id";

/** Max sponsored listings boosted to the top of a browse list. */
export const SPONSORED_CAP = 2;

export interface SponsorableItem {
  is_sponsored?: boolean | null;
  sponsored_until?: string | null;
}

/** True only for currently-active sponsorships (expired ones lose treatment). */
export function isSponsoredActive(item: SponsorableItem | null | undefined): boolean {
  if (!item?.is_sponsored) return false;
  if (!item.sponsored_until) return true;
  const until = new Date(item.sponsored_until).getTime();
  return Number.isFinite(until) ? until > Date.now() : true;
}

/** Legacy alias (pre-merge name). */
export const isActivelySponsored = isSponsoredActive;

/**
 * Move up to {@link SPONSORED_CAP} active-sponsored items to the front,
 * preserving organic order otherwise. Returns the input untouched when nothing
 * is sponsored.
 */
export function arrangeSponsored<T extends SponsorableItem>(
  items: T[] | null | undefined,
  cap = SPONSORED_CAP
): T[] {
  if (!items || items.length === 0) return items ?? [];
  const sponsored: T[] = [];
  const organic: T[] = [];
  for (const item of items) {
    if (sponsored.length < cap && isSponsoredActive(item)) sponsored.push(item);
    else organic.push(item);
  }
  return sponsored.length === 0 ? items : [...sponsored, ...organic];
}

/** Legacy alias (pre-merge name). */
export function arrangeSponsoredFirst<T extends SponsorableItem>(items: T[], cap = SPONSORED_CAP): T[] {
  return arrangeSponsored(items, cap);
}

function getSessionId(): string {
  let sessionId = storage.get<string>(SESSION_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    storage.set(SESSION_KEY, sessionId);
  }
  return sessionId;
}

// Per-session impression dedupe (matches the ad-tracking viewability contract:
// count one impression per item per session).
const seenImpressions = new Set<string>();

export function logSponsoredImpression(
  contentType: string,
  contentId: string
): void {
  const key = `${getSessionId()}:${contentType}:${contentId}`;
  if (seenImpressions.has(key)) return;
  seenImpressions.add(key);
  writeSponsoredEvent("sponsored_listing_impression", contentType, contentId);
}

export function logSponsoredClick(contentType: string, contentId: string): void {
  writeSponsoredEvent("sponsored_listing_click", contentType, contentId);
}

function writeSponsoredEvent(
  event: "sponsored_listing_impression" | "sponsored_listing_click",
  contentType: string,
  contentId: string
): void {
  void (async () => {
    try {
      await supabase.from("user_analytics").insert({
        event_type: event,
        content_type: contentType,
        content_id: contentId,
        session_id: getSessionId(),
        page_url:
          typeof window !== "undefined" ? window.location.pathname : null,
        // Distinguish the inventory class from campaign/affiliate/house ads.
        filters_used: { inventory_class: "sponsored_listing" },
      });
    } catch (err) {
      log.warn("writeSponsoredEvent", "failed", { error: String(err) });
    }
  })();
}
