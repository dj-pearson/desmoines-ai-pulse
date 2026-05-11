/**
 * Domain adapter registry + dispatcher.
 *
 * Edge functions call `tryDomainAdapter(url, category)` before falling back to
 * the generic Browserless + Claude scraping pipeline. If an adapter matches
 * and returns items, the caller can skip scraping entirely and pass the items
 * straight to the filter/dedupe/insert flow.
 *
 * To add a new adapter:
 *   1. Create `_shared/domain-adapters/<site>.ts` exporting a `DomainAdapter`
 *   2. Import it here and add it to the `ADAPTERS` array
 */

import type { AdapterResult, DomainAdapter } from "./types.ts";
import { milbAdapter } from "./milb.ts";
import { seatgeekAdapter } from "./seatgeek.ts";
import { eventbriteAdapter } from "./eventbrite.ts";
import { barnstormersAdapter } from "./barnstormers.ts";
import { catchdesmoinesAdapter } from "./catchdesmoines.ts";
// hyveetix.ts kept in the codebase but disabled — Hy-Vee Tix is behind
// PerimeterX which blocks both Supabase IPs (HTTP 403) and Browserless +
// stealth (returns the challenge page). Re-enable when a residential-proxy
// path (Browserless residential add-on, ScrapingBee, etc.) is in place.
// import { hyveetixAdapter } from "./hyveetix.ts";

export type { AdapterEvent, AdapterResult, DomainAdapter } from "./types.ts";

const ADAPTERS: DomainAdapter[] = [
  milbAdapter,
  seatgeekAdapter,
  eventbriteAdapter,
  barnstormersAdapter,
  catchdesmoinesAdapter,
];

/**
 * Try to fetch items via a domain-specific adapter. Returns `null` if no
 * adapter matches, the adapter fails, or the adapter returns zero items —
 * callers should fall through to the generic scraper in any of those cases.
 */
export async function tryDomainAdapter(
  url: string,
  category: string,
): Promise<AdapterResult | null> {
  const adapter = ADAPTERS.find(
    (a) => a.matches(url) && a.supports(category),
  );
  if (!adapter) return null;

  console.log(`🎯 Domain adapter matched: ${adapter.name}`);
  try {
    const result = await adapter.fetch(url, category);
    if (!result.success) {
      console.log(
        `⚠️ ${adapter.name} adapter failed (${result.error}); falling through to generic scraper`,
      );
      return null;
    }
    if (result.items.length === 0) {
      console.log(
        `⚠️ ${adapter.name} adapter returned 0 items; falling through to generic scraper`,
      );
      return null;
    }
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`❌ ${adapter.name} adapter threw: ${message}`);
    return null;
  }
}
