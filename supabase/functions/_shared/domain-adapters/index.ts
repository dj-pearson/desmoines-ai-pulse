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
import { runAdapters } from "./dispatch.ts";
import { milbAdapter } from "./milb.ts";
import { seatgeekAdapter } from "./seatgeek.ts";
import { eventbriteAdapter } from "./eventbrite.ts";
import { barnstormersAdapter } from "./barnstormers.ts";
import { catchdesmoinesAdapter } from "./catchdesmoines.ts";
import { vibrantmusichallAdapter } from "./vibrantmusichall.ts";
import { tribeEventsAdapter } from "./tribeEvents.ts";
import { venueProfileAdapter } from "./venueProfile.ts";
// hyveetix.ts kept in the codebase but disabled — Hy-Vee Tix is behind
// PerimeterX which blocks both Supabase IPs (HTTP 403) and Browserless +
// stealth (returns the challenge page). Re-enable when a residential-proxy
// path (Browserless residential add-on, ScrapingBee, etc.) is in place.
// import { hyveetixAdapter } from "./hyveetix.ts";

export type { AdapterEvent, AdapterResult, DomainAdapter } from "./types.ts";

/**
 * Order matters: every adapter whose `matches` returns true is attempted in this
 * order until one yields items, so site-specific adapters must precede the
 * generic ones.
 *
 *   1. Bespoke, single-site adapters (an API or a known page shape).
 *   2. tribeEvents — WordPress "The Events Calendar" REST, probed per profile.
 *      Cheap (one request) and exact when present.
 *   3. venueProfile — generic listing ld+json → per-event detail-page walk,
 *      driven by eventSourceProfiles.ts.
 *
 * Every generic adapter self-detects and returns zero items when it does not
 * apply, at which point the dispatcher falls through to the next candidate and
 * ultimately to the Browserless + Claude path. Adding a site to a profile can
 * therefore only add coverage, never remove it.
 */
const ADAPTERS: DomainAdapter[] = [
  milbAdapter,
  seatgeekAdapter,
  eventbriteAdapter,
  barnstormersAdapter,
  catchdesmoinesAdapter,
  vibrantmusichallAdapter,
  tribeEventsAdapter,
  venueProfileAdapter,
];

/**
 * Try to fetch items via the domain-specific adapters, in registration order.
 *
 * EVERY matching adapter is attempted until one returns items — see
 * dispatch.ts for the loop and the rationale. Returns `null` when no adapter
 * matches, or when every matching adapter fails or returns zero items, at which
 * point callers fall through to the generic scraper.
 */
export function tryDomainAdapter(
  url: string,
  category: string,
): Promise<AdapterResult | null> {
  return runAdapters(ADAPTERS, url, category);
}
