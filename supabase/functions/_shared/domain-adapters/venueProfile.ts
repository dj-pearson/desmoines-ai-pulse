/**
 * Profile-driven venue adapter — the generic "listing page, then a layer in"
 * crawler.
 *
 * This is the adapter that covers the seeded sources with no bespoke adapter:
 * Iowa Wild, Iowa Wolves, Des Moines Community Playhouse, Theater Des Moines,
 * Des Moines Symphony, Hoyt Sherman (when its Tribe REST endpoint is absent),
 * Horizon Events Center, and Wooly's / First Fleet.
 *
 * WHAT IT DOES, IN ORDER
 *   1. Walk the profile's canonical listing URLs (not just the seeded URL — the
 *      seeded URL is often a venue-profile page or a month-pinned view).
 *   2. On each listing page, try schema.org/Event ld+json first. Many calendar
 *      themes emit one Event block per card, which gives complete rows from a
 *      single request.
 *   3. If the listing yields nothing (or only a handful, meaning the cards were
 *      links rather than data), discover the event DETAIL links and fetch them,
 *      reading each page's ld+json / microdata / OpenGraph.
 *   4. Apply the profile's venue, location, category and ticket defaults to
 *      whatever the page left blank — never over what it published.
 *   5. For sports schedules, drop away games and out-of-season rows.
 *
 * WHY IT IS AN ADAPTER RATHER THAN A CHANGE INSIDE ai-crawler
 * `tryDomainAdapter` already runs before the Browserless + Claude path and
 * already falls through cleanly on zero items. Slotting in here means both
 * ai-crawler and firecrawl-scraper pick the behaviour up with no change to
 * either function, and a failure degrades to exactly today's behaviour.
 *
 * NOTE ON PLAIN FETCH: this adapter uses plain HTTP, no headless browser. Sites
 * that render their calendar entirely client-side will return few or no items,
 * and the dispatcher will fall through to the Browserless + Claude path as
 * before. That is the intended split: cheap and exact first, expensive and
 * fuzzy only when needed.
 */

import type { AdapterEvent, AdapterResult, DomainAdapter } from "./types.ts";
import {
  findEventSourceProfile,
  type EventSourceProfile,
} from "../eventSourceProfiles.ts";
import {
  applyHomeOnlyFilter,
  discoverDetailLinks,
  type DetailDefaults,
  fetchEventsFromDetailPages,
  fetchListingHtml,
  isUsableLocation,
} from "../eventPageDiscovery.ts";
import { extractEventsFromJsonLd } from "../jsonLdEvents.ts";

/**
 * Below this, a listing page's ld+json is assumed to describe the page/venue
 * rather than its full calendar, so the detail layer is walked as well. Venues
 * in this set publish well over three upcoming events, so a 1-3 item result is
 * a signal of incomplete extraction, not a quiet season.
 */
const LISTING_SUFFICIENT_THRESHOLD = 4;

/** Strategies this adapter is able to execute. */
const SUPPORTED_STRATEGIES = new Set(["listing-jsonld", "detail-crawl"]);

function profileFor(url: string): EventSourceProfile | null {
  const profile = findEventSourceProfile(url);
  if (!profile) return null;
  // Sources owned by a bespoke adapter, or known bot-walled, are not ours.
  if (profile.strategy[0] === "adapter" || profile.strategy[0] === "blocked") {
    return null;
  }
  return profile.strategy.some((s) => SUPPORTED_STRATEGIES.has(s))
    ? profile
    : null;
}

export const venueProfileAdapter: DomainAdapter = {
  name: "venue-profile",

  matches(url: string): boolean {
    return profileFor(url) !== null;
  },

  supports(category: string): boolean {
    return category === "events";
  },

  async fetch(url: string, _category: string): Promise<AdapterResult> {
    const profile = profileFor(url);
    if (!profile) {
      return {
        success: false,
        items: [],
        adapter: "venue-profile",
        error: "No profile for host",
      };
    }

    const defaults: DetailDefaults = {
      venue: profile.venue?.name,
      location: profile.venue?.location,
      category: profile.defaultCategory,
      ticketsUrl: profile.ticketsUrl,
    };

    const listingUrls = candidateListingUrls(url, profile);
    const collected: AdapterEvent[] = [];
    const attempts: string[] = [];

    for (const listingUrl of listingUrls) {
      console.log(`🏛️ [venue-profile] ${profile.label}: listing ${listingUrl}`);
      const html = await fetchListingHtml(listingUrl);
      if (!html) {
        attempts.push(`${listingUrl}: fetch failed`);
        continue;
      }

      // Layer 1 — structured data on the listing page itself.
      let fromListing: AdapterEvent[] = [];
      if (profile.strategy.includes("listing-jsonld")) {
        try {
          fromListing = extractEventsFromJsonLd(
            html,
            listingUrl,
            profile.defaultCategory ?? "General",
          ).map((ev) => withDefaults(ev, defaults));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(`  ⚠️ [venue-profile] listing ld+json failed: ${msg}`);
        }
        console.log(
          `  → listing ld+json yielded ${fromListing.length} event(s)`,
        );
        collected.push(...fromListing);
      }

      // Layer 2 — walk into the per-event pages. Runs when the listing was thin,
      // because a listing that only links out is the common case and is exactly
      // what produced "all events share one source_url and have no image".
      const needDetail = profile.strategy.includes("detail-crawl") &&
        fromListing.length < LISTING_SUFFICIENT_THRESHOLD;
      if (needDetail) {
        const links = discoverDetailLinks(html, listingUrl, profile);
        console.log(
          `  → discovered ${links.length} detail link(s) on ${listingUrl}`,
        );
        if (links.length > 0) {
          const fromDetail = await fetchEventsFromDetailPages(links, defaults);
          console.log(
            `  → detail pages yielded ${fromDetail.length} event(s)`,
          );
          collected.push(...fromDetail);
        } else {
          attempts.push(`${listingUrl}: no detail links matched`);
        }
      }

      // Stop at the first listing URL that produced a real calendar; the rest
      // are fallbacks, and crawling them too would just create duplicates.
      if (collected.length >= LISTING_SUFFICIENT_THRESHOLD) break;
    }

    let items = dedupe(collected);

    if (profile.homeOnly) {
      items = applyHomeOnlyFilter(items, profile.homeOnly);
    }

    if (items.length === 0) {
      return {
        success: false,
        items: [],
        adapter: "venue-profile",
        error:
          `No events from ${profile.label} via ld+json or detail crawl` +
          (attempts.length ? ` (${attempts.join("; ")})` : "") +
          " — falling through to the rendered-HTML path",
      };
    }

    console.log(
      `✅ [venue-profile] ${items.length} event(s) from ${profile.label}`,
    );
    return { success: true, items, adapter: `venue-profile:${profile.id}` };
  },
};

/**
 * Listing URLs to try. The profile's canonical URLs come first, then the seeded
 * URL — a seeded venue-profile or month-pinned page is a worse starting point
 * than the site's real calendar, but it is still worth trying last.
 */
function candidateListingUrls(
  seededUrl: string,
  profile: EventSourceProfile,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of [...profile.listingUrls, seededUrl]) {
    const key = candidate.replace(/\/+$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}

/** Fill blanks from the profile without ever overwriting published values. */
function withDefaults(
  ev: AdapterEvent,
  defaults: DetailDefaults,
): AdapterEvent {
  const venue = !ev.venue || ev.venue === "TBD"
    ? defaults.venue ?? "TBD"
    : ev.venue;
  return {
    ...ev,
    venue,
    location: isUsableLocation(ev.location, venue)
      ? ev.location
      : defaults.location ?? ev.location ?? "Des Moines, IA",
    category: !ev.category || ev.category === "General"
      ? defaults.category ?? "General"
      : ev.category,
    source_url: ev.source_url ?? defaults.ticketsUrl,
  };
}

/**
 * Dedupe on title + calendar day. Two performances of the same show on the same
 * day (a matinee and an evening show) legitimately differ by time, so the key
 * includes the hour to keep both — but a listing card and its detail page
 * describing the same 19:30 show collapse to one.
 */
function dedupe(events: AdapterEvent[]): AdapterEvent[] {
  const seen = new Map<string, AdapterEvent>();
  for (const ev of events) {
    const key = `${ev.title.trim().toLowerCase()}|${ev.date.slice(0, 13)}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, ev);
      continue;
    }
    // Keep the richer record: a detail-page row (image + deep link) beats a
    // listing-card row for the same event.
    seen.set(key, richer(existing, ev));
  }
  return [...seen.values()];
}

function richer(a: AdapterEvent, b: AdapterEvent): AdapterEvent {
  const score = (ev: AdapterEvent) =>
    (ev.image_url ? 2 : 0) +
    (ev.source_url ? 2 : 0) +
    (ev.description ? 1 : 0) +
    (ev.venue && ev.venue !== "TBD" ? 1 : 0);
  return score(b) > score(a) ? b : a;
}
