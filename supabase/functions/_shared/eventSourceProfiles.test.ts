/**
 * Unit tests for the event source profile registry.
 * Run with: `deno test --allow-none supabase/functions/_shared/eventSourceProfiles.test.ts`
 *
 * These are invariant tests, not behaviour tests: the registry is data, and the
 * things that break in production are data mistakes — a host that no profile
 * owns, a host that isn't allowlisted so the crawl 403s before it starts, a
 * listing URL pointing at a different host than the profile claims.
 */
import {
  EVENT_SOURCE_PROFILES,
  findEventSourceProfile,
  hostMatches,
  isDetailPath,
  resolveListingUrls,
  shouldPreserveSourceUrl,
} from "./eventSourceProfiles.ts";
import { DEFAULT_CRAWL_ALLOWLIST } from "./fetchGuard.ts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

/** The exact URLs the crawler is seeded with / was audited against. */
const SEEDED_URLS: readonly string[] = [
  "https://seatgeek.com/search?f=1&search=des+moines&ui_origin=home_search",
  "https://www.milb.com/iowa/schedule/2026/fullseason",
  "https://theiowabarnstormers.com/sports/fball/2026/schedule",
  "https://www.iowawild.com/games",
  "https://iowa.gleague.nba.com/schedule?month=3",
  "https://dmplayhouse.com/",
  "https://www.theaterdesmoines.com/events/",
  "https://www.des-moines-theater.com/shows/concert",
  "https://www.eventbrite.com/d/ia--west-des-moines/events/",
  "https://www.firstfleetconcerts.com/first-fleet-venues/woolys",
  "https://hyveetix.evenue.net/list/CONC",
  "https://www.dmsymphony.org/concerts-events/",
  "https://hoytsherman.org/events/",
  "https://www.horizoneventscenter.com/upcoming-events/",
  "https://www.catchdesmoines.com/events",
];

Deno.test("every seeded source URL resolves to a profile", () => {
  for (const url of SEEDED_URLS) {
    const profile = findEventSourceProfile(url);
    assert(profile !== null, `no profile owns ${url}`);
  }
});

Deno.test("every seeded source host is on the crawler allowlist", () => {
  // This is the regression test for the bug that silently zeroed out Hoyt
  // Sherman: the profile existed in spirit, but fetchGuard rejected the host
  // with 403 before any scrape ran.
  for (const url of SEEDED_URLS) {
    const host = new URL(url).hostname.toLowerCase();
    const allowed = DEFAULT_CRAWL_ALLOWLIST.some((d) => hostMatches(host, d));
    assert(allowed, `host ${host} (${url}) is not on DEFAULT_CRAWL_ALLOWLIST`);
  }
});

Deno.test("hoytsherman.org — the unhyphenated host — is allowlisted", () => {
  const allowed = DEFAULT_CRAWL_ALLOWLIST.some((d) =>
    hostMatches("hoytsherman.org", d)
  );
  assert(allowed, "hoytsherman.org must be allowlisted");
  const wwwAllowed = DEFAULT_CRAWL_ALLOWLIST.some((d) =>
    hostMatches("www.hoytsherman.org", d)
  );
  assert(wwwAllowed, "www.hoytsherman.org must be allowlisted");
});

Deno.test("every profile's own hosts and listing URLs are allowlisted", () => {
  for (const profile of EVENT_SOURCE_PROFILES) {
    for (const host of profile.hosts) {
      const allowed = DEFAULT_CRAWL_ALLOWLIST.some((d) => hostMatches(host, d));
      assert(allowed, `${profile.id}: host ${host} not allowlisted`);
    }
    for (const listing of profile.listingUrls) {
      const host = new URL(listing).hostname.toLowerCase();
      const allowed = DEFAULT_CRAWL_ALLOWLIST.some((d) => hostMatches(host, d));
      assert(
        allowed,
        `${profile.id}: listing host ${host} (${listing}) not allowlisted`,
      );
    }
  }
});

Deno.test("each listing URL belongs to a host the profile claims", () => {
  for (const profile of EVENT_SOURCE_PROFILES) {
    for (const listing of profile.listingUrls) {
      const host = new URL(listing).hostname.toLowerCase();
      const owned = profile.hosts.some((d) => hostMatches(host, d));
      assert(
        owned,
        `${profile.id}: listing ${listing} is on ${host}, which the profile does not claim`,
      );
    }
  }
});

Deno.test("profile ids and host claims are unique", () => {
  const ids = new Set<string>();
  const hosts = new Map<string, string>();
  for (const profile of EVENT_SOURCE_PROFILES) {
    assert(!ids.has(profile.id), `duplicate profile id ${profile.id}`);
    ids.add(profile.id);
    for (const host of profile.hosts) {
      const owner = hosts.get(host);
      assert(
        owner === undefined,
        `host ${host} claimed by both ${owner} and ${profile.id}`,
      );
      hosts.set(host, profile.id);
    }
  }
});

Deno.test("Catch Des Moines is the only source that preserves source_url", () => {
  // The working per-event "Visit Website" extraction must stay untouched, and
  // nothing else should opt into bypassing URL rewriting by accident.
  const preserving = EVENT_SOURCE_PROFILES.filter((p) => p.preserveSourceUrl);
  assert(preserving.length === 1, `expected 1, got ${preserving.length}`);
  assert(preserving[0].id === "catchdesmoines", "must be catchdesmoines");
  assert(
    shouldPreserveSourceUrl("https://www.catchdesmoines.com/events"),
    "catchdesmoines URL must report preserve=true",
  );
  assert(
    !shouldPreserveSourceUrl("https://hoytsherman.org/events/"),
    "other hosts must report preserve=false",
  );
});

Deno.test("resolveListingUrls puts the canonical calendar ahead of a vague seed", () => {
  // Wooly's seeded URL is a venue-PROFILE page one layer above the calendar.
  const woolys = resolveListingUrls(
    "https://www.firstfleetconcerts.com/first-fleet-venues/woolys",
  );
  assert(
    woolys[0] === "https://www.firstfleetconcerts.com/events",
    `expected canonical /events first, got ${woolys[0]}`,
  );
  assert(
    woolys.includes(
      "https://www.firstfleetconcerts.com/first-fleet-venues/woolys",
    ),
    "the seeded URL must still be tried as a fallback",
  );

  // Iowa Wolves seeded URL pins ?month=3, hiding 11 months of the season.
  const wolves = resolveListingUrls("https://iowa.gleague.nba.com/schedule?month=3");
  assert(
    wolves[0] === "https://iowa.gleague.nba.com/schedule",
    `expected unpinned /schedule first, got ${wolves[0]}`,
  );

  // A bare site root should be superseded by the real listing paths.
  const playhouse = resolveListingUrls("https://dmplayhouse.com/");
  assert(
    playhouse[0] !== "https://dmplayhouse.com/",
    "site root must not be the first URL tried",
  );
});

Deno.test("resolveListingUrls de-duplicates and never returns an empty list", () => {
  const hoyt = resolveListingUrls("https://hoytsherman.org/events/");
  assert(hoyt.length >= 1, "at least one URL");
  const normalized = hoyt.map((u) => u.replace(/\/+$/, "").toLowerCase());
  assert(
    new Set(normalized).size === normalized.length,
    `duplicates in ${JSON.stringify(hoyt)}`,
  );

  // Unknown host: pass through unchanged rather than dropping the crawl.
  const unknown = resolveListingUrls("https://example.com/events");
  assert(
    unknown.length === 1 && unknown[0] === "https://example.com/events",
    "unknown host passes through",
  );
});

Deno.test("detail path patterns accept event pages and reject listing pages", () => {
  const hoyt = findEventSourceProfile("https://hoytsherman.org/events/")!;
  assert(isDetailPath(hoyt, "/event/some-concert/"), "tribe /event/ detail");
  assert(!isDetailPath(hoyt, "/events/"), "the listing page is not a detail page");

  const woolys = findEventSourceProfile("https://www.firstfleetconcerts.com/events")!;
  assert(
    isDetailPath(woolys, "/events/detail/some-band"),
    "First Fleet /events/detail/<slug>",
  );

  const eventbrite = findEventSourceProfile(
    "https://www.eventbrite.com/d/ia--west-des-moines/events/",
  )!;
  assert(
    isDetailPath(eventbrite, "/e/some-event-tickets-123456789"),
    "Eventbrite /e/ detail",
  );
});

Deno.test("subdomain and www variants resolve to the same profile", () => {
  const bare = findEventSourceProfile("https://hoytsherman.org/events/");
  const www = findEventSourceProfile("https://www.hoytsherman.org/events/");
  assert(bare?.id === "hoyt-sherman", "bare host");
  assert(www?.id === "hoyt-sherman", "www host");

  const wolves = findEventSourceProfile("https://iowa.gleague.nba.com/schedule");
  assert(wolves?.id === "iowa-wolves", "gleague subdomain");

  const hyvee = findEventSourceProfile("https://hyveetix.evenue.net/list/CONC");
  assert(hyvee?.id === "hyveetix", "evenue subdomain");
});

Deno.test("Hy-Vee Tix is recorded as blocked, not silently retried", () => {
  const hyvee = findEventSourceProfile("https://hyveetix.evenue.net/list/CONC")!;
  assert(hyvee.strategy[0] === "blocked", "must be marked blocked");
  assert(
    (hyvee.notes ?? "").toLowerCase().includes("perimeterx"),
    "notes must record WHY it is blocked",
  );
});

Deno.test("sports profiles declare home-only filtering and a season window", () => {
  for (const id of ["iowa-wild", "iowa-wolves", "iowa-cubs", "iowa-barnstormers"]) {
    const profile = EVENT_SOURCE_PROFILES.find((p) => p.id === id)!;
    assert(profile.homeOnly !== undefined, `${id} must set homeOnly`);
    assert(
      profile.homeOnly!.awayMarkers.length > 0,
      `${id} must list away markers`,
    );
    assert(
      (profile.homeOnly!.seasonMonths ?? []).length > 0,
      `${id} must bound its season`,
    );
    assert(profile.venue !== undefined, `${id} must declare its home venue`);
  }
});

Deno.test("declared venue names match the known_venues canonical set", () => {
  // Guards the "Casey's Center" vs "Wells Fargo Arena" split: a profile venue
  // that isn't a known_venues name (or a seeded alias) silently loses the
  // address/lat/lng enrichment and breaks the title_date_venue dedupe key.
  const CANONICAL = new Set([
    "Wells Fargo Arena",
    "Principal Park",
    "Hoyt Sherman Place",
    "Civic Center of Greater Des Moines",
    "Des Moines Community Playhouse",
    "Horizon Events Center",
    "Wooly's",
    "Vibrant Music Hall",
  ]);
  for (const profile of EVENT_SOURCE_PROFILES) {
    if (!profile.venue) continue;
    assert(
      CANONICAL.has(profile.venue.name),
      `${profile.id}: venue "${profile.venue.name}" is not a canonical known_venues name`,
    );
  }
});

Deno.test("every profile explains itself and lists at least one strategy", () => {
  for (const profile of EVENT_SOURCE_PROFILES) {
    assert(profile.strategy.length > 0, `${profile.id}: no strategy`);
    assert(profile.listingUrls.length > 0, `${profile.id}: no listing URL`);
    assert(
      (profile.notes ?? "").length > 40,
      `${profile.id}: notes must record the site's quirks for the next reader`,
    );
  }
});
