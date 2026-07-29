/**
 * Event source profiles — one declarative record per seeded event source.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every crawl improvement so far has been a hardcoded `if (url.includes(...))`
 * branch scattered across ai-crawler, firecrawl-scraper and scrape-events. That
 * made three copies of the same knowledge drift apart (see the "Wells Fargo
 * Arena" vs "Casey's Center" split, and the sports ticket-URL tables duplicated
 * in two functions). A profile is the single place where per-site knowledge
 * lives, and every consumer reads it instead of re-deriving it.
 *
 * WHAT A PROFILE CAPTURES
 *   - which host(s) it owns
 *   - the canonical LISTING url(s) to crawl (the seeded URL is often a marketing
 *     page; the real calendar is elsewhere on the same host)
 *   - the ordered list of extraction strategies to attempt
 *   - what an event DETAIL url looks like on this site, so a listing page whose
 *     events live one (or several) layers in can be walked
 *   - venue / location / ticket defaults, so a page that omits them still lands
 *     canonical rows that dedupe against the rest of the pipeline
 *
 * Layouts on these sites change rarely, which is exactly why declaring them is
 * worth it — and why every field is a *default* or a *hint*, never a hard
 * requirement: a profile miss must degrade to the generic path, never to zero
 * events.
 */

/** Extraction strategies, attempted in the order a profile lists them. */
export type SourceStrategy =
  /** A dedicated DomainAdapter in domain-adapters/ owns this host. */
  | "adapter"
  /** WordPress "The Events Calendar" REST API (/wp-json/tribe/events/v1). */
  | "tribe-rest"
  /** The listing page itself carries schema.org/Event ld+json for every event. */
  | "listing-jsonld"
  /** Listing page only links out; each event's data lives on its detail page. */
  | "detail-crawl"
  /** Rendered-HTML + Claude fallback (the historical generic path). */
  | "ai-fallback"
  /** Known bot-walled. Recorded so nobody burns crawl budget rediscovering it. */
  | "blocked";

export interface ProfileVenue {
  /** Canonical venue name. MUST match a `known_venues.name` or alias. */
  name: string;
  /** "City, ST" or a full street address. */
  location: string;
}

export interface HomeOnlyConfig {
  /** Team name used to build "<team> vs <opponent>" titles. */
  teamName: string;
  /** Lowercased substrings that mark a row as an AWAY game (skip it). */
  awayMarkers: string[];
  /** Months (1-12) the league plays in. Rows outside are treated as noise. */
  seasonMonths?: number[];
}

export interface EventSourceProfile {
  /** Stable slug — used in logs and in the verification harness output. */
  id: string;
  /** Human label for logs/reports. */
  label: string;
  /**
   * Host suffixes this profile owns. Matched as an exact host or a subdomain
   * (`www.hoytsherman.org` matches `hoytsherman.org`).
   */
  hosts: string[];
  /**
   * Canonical listing URL(s) in priority order. The FIRST entry is what the
   * crawler should fetch when handed a bare/vague URL for this host.
   */
  listingUrls: string[];
  /** Ordered strategies to attempt. */
  strategy: SourceStrategy[];
  /**
   * Path patterns that identify an event DETAIL page on this host. Used to walk
   * from a listing page down to the per-event layer.
   */
  detailPathPatterns?: RegExp[];
  /** Venue/location defaults for events this source produces. */
  venue?: ProfileVenue;
  /** Category to stamp when the page gives no better signal. */
  defaultCategory?: string;
  /** Fallback ticket/purchase URL when no per-event link is found. */
  ticketsUrl?: string;
  /** Sports schedules: keep home games only and normalize titles. */
  homeOnly?: HomeOnlyConfig;
  /**
   * When true, whatever `source_url` the owning adapter produced is final —
   * downstream must not rewrite it. Set for Catch Des Moines, whose per-event
   * "Visit Website" extraction is working and deliberately left untouched.
   */
  preserveSourceUrl?: boolean;
  /** Operator-facing notes: quirks, blockers, and what still needs verifying. */
  notes?: string;
}

const DSM = "Des Moines, IA";

/**
 * The seeded sources. Ordering is irrelevant (lookup is host-keyed) but they are
 * grouped by kind to keep the file readable.
 */
export const EVENT_SOURCE_PROFILES: readonly EventSourceProfile[] = [
  // ── Aggregators / ticketing platforms ────────────────────────────────────
  {
    id: "catchdesmoines",
    label: "Catch Des Moines",
    hosts: ["catchdesmoines.com"],
    listingUrls: ["https://www.catchdesmoines.com/events/"],
    strategy: ["adapter"],
    detailPathPatterns: [/^\/event\/[a-z0-9-]+\/\d+\/?$/i],
    defaultCategory: "Community",
    preserveSourceUrl: true,
    notes:
      "Owned by catchdesmoines.ts. Its per-event 'Visit Website' extraction is " +
      "correct and INTENTIONALLY untouched — never rewrite source_url for this host.",
  },
  {
    id: "seatgeek",
    label: "SeatGeek (Des Moines radius)",
    hosts: ["seatgeek.com"],
    listingUrls: [
      "https://seatgeek.com/search?f=1&search=des+moines&ui_origin=home_search",
    ],
    strategy: ["adapter"],
    defaultCategory: "Entertainment",
    notes:
      "Owned by seatgeek.ts, which ignores the search URL entirely and queries " +
      "the Platform API by lat/lon + 50mi. The seeded search URL is therefore " +
      "documentation only; changing its query string changes nothing.",
  },
  {
    id: "eventbrite-wdm",
    label: "Eventbrite — West Des Moines",
    hosts: ["eventbrite.com"],
    listingUrls: ["https://www.eventbrite.com/d/ia--west-des-moines/events/"],
    strategy: ["adapter", "listing-jsonld"],
    detailPathPatterns: [/^\/e\/[^/]+$/i],
    defaultCategory: "Community",
    notes:
      "Owned by eventbrite.ts (window.__SERVER_DATA__). Only /d/ browse URLs " +
      "match; /e/ detail pages fall through to the ld+json path on purpose.",
  },
  {
    id: "hyveetix",
    label: "Hy-Vee Tix (AudienceView / evenue)",
    hosts: ["evenue.net", "hyveetix.com"],
    listingUrls: ["https://hyveetix.evenue.net/list/CONC"],
    strategy: ["blocked"],
    venue: { name: "Wells Fargo Arena", location: "730 3rd St, Des Moines, IA 50309" },
    defaultCategory: "Music",
    notes:
      "PerimeterX bot wall: plain fetch from Supabase IPs returns 403 and " +
      "Browserless+stealth returns the challenge page. hyveetix.ts is written " +
      "and tested but deliberately NOT registered. Re-enable only once a " +
      "residential-proxy egress path exists. Coverage overlap: most Iowa Events " +
      "Center concerts also surface via SeatGeek and Catch Des Moines, so this " +
      "being dark is not a total gap.",
  },

  // ── Sports schedules ────────────────────────────────────────────────────
  {
    id: "iowa-cubs",
    label: "Iowa Cubs (MiLB Triple-A)",
    hosts: ["milb.com", "iowacubs.com"],
    listingUrls: ["https://www.milb.com/iowa/schedule/2026/fullseason"],
    strategy: ["adapter"],
    venue: { name: "Principal Park", location: "1 Line Dr, Des Moines, IA 50309" },
    defaultCategory: "Sports",
    ticketsUrl: "https://www.milb.com/iowa/tickets/single-game-tickets",
    homeOnly: { teamName: "Iowa Cubs", awayMarkers: ["@", " at "], seasonMonths: [3, 4, 5, 6, 7, 8, 9] },
    notes:
      "Owned by milb.ts via statsapi.mlb.com (sportId 11, teamId 451) — a real " +
      "API, so the /schedule/<year>/fullseason page is never parsed. The season " +
      "year is read out of the seeded URL path.",
  },
  {
    id: "iowa-barnstormers",
    label: "Iowa Barnstormers (IFL)",
    hosts: ["theiowabarnstormers.com"],
    listingUrls: ["https://theiowabarnstormers.com/sports/fball/2026/schedule"],
    strategy: ["adapter"],
    venue: { name: "Wells Fargo Arena", location: "730 3rd St, Des Moines, IA 50309" },
    defaultCategory: "Sports",
    ticketsUrl: "https://theiowabarnstormers.com/tickets",
    homeOnly: { teamName: "Iowa Barnstormers", awayMarkers: ["@", " at "], seasonMonths: [3, 4, 5, 6, 7] },
    notes:
      "Owned by barnstormers.ts (PrestoSports .event-row.home.upcoming cards; " +
      "the reliable date is the YYYYMMDD slug in the boxscore href, because the " +
      "human-visible date omits the month).",
  },
  {
    id: "iowa-wild",
    label: "Iowa Wild (AHL)",
    hosts: ["iowawild.com"],
    listingUrls: [
      "https://www.iowawild.com/games",
      "https://www.iowawild.com/schedule",
    ],
    strategy: ["listing-jsonld", "detail-crawl", "ai-fallback"],
    detailPathPatterns: [/^\/games?\/detail\//i, /^\/gamecenter\//i],
    venue: { name: "Wells Fargo Arena", location: "730 3rd St, Des Moines, IA 50309" },
    defaultCategory: "Sports",
    ticketsUrl: "https://www.iowawild.com/tickets",
    homeOnly: {
      teamName: "Iowa Wild",
      awayMarkers: ["@", " at ", "away"],
      seasonMonths: [10, 11, 12, 1, 2, 3, 4],
    },
    notes:
      "NO dedicated adapter yet. Previously fell to Claude on the first 15k " +
      "chars of /games, which is nav + hero — hence 'no events'. Now goes " +
      "through the profile adapter (listing ld+json, then a detail-page walk) " +
      "with home-only filtering. The AHL runs on HockeyTech; if a verification " +
      "run shows the ld+json/detail layers are empty, the durable fix is a " +
      "HockeyTech Modulekit adapter — do NOT guess the client key, read it out " +
      "of the page's JS during that run.",
  },
  {
    id: "iowa-wolves",
    label: "Iowa Wolves (NBA G League)",
    hosts: ["gleague.nba.com"],
    listingUrls: [
      "https://iowa.gleague.nba.com/schedule",
      "https://iowa.gleague.nba.com/schedule?month=3",
    ],
    strategy: ["listing-jsonld", "detail-crawl", "ai-fallback"],
    detailPathPatterns: [/^\/game\//i, /^\/games\//i],
    venue: { name: "Wells Fargo Arena", location: "730 3rd St, Des Moines, IA 50309" },
    defaultCategory: "Sports",
    ticketsUrl: "https://iowa.gleague.nba.com/tickets",
    homeOnly: {
      teamName: "Iowa Wolves",
      awayMarkers: ["@", " at ", "away"],
      seasonMonths: [11, 12, 1, 2, 3, 4],
    },
    notes:
      "NO dedicated adapter yet, same failure mode as Iowa Wild. NOTE the " +
      "seeded URL pins ?month=3 — that returns ONE month, so 11 of 12 months " +
      "were invisible even when parsing worked. The profile crawls the " +
      "unpinned /schedule first.",
  },

  // ── Theaters / performing arts ──────────────────────────────────────────
  {
    id: "dm-playhouse",
    label: "Des Moines Community Playhouse",
    hosts: ["dmplayhouse.com"],
    listingUrls: [
      "https://dmplayhouse.com/shows/",
      "https://dmplayhouse.com/events/",
      "https://dmplayhouse.com/",
    ],
    strategy: ["tribe-rest", "listing-jsonld", "detail-crawl", "ai-fallback"],
    detailPathPatterns: [
      /^\/event\//i,
      /^\/events\/[^/]+\/?$/i,
      /^\/shows?\/[^/]+\/?$/i,
      /^\/production\//i,
    ],
    venue: {
      name: "Des Moines Community Playhouse",
      location: "831 42nd St, Des Moines, IA 50312",
    },
    defaultCategory: "Arts",
    notes:
      "The seeded URL is the site ROOT, so the shallow-path expansion in " +
      "ai-crawler was already appending /events/ and /calendar/ — but the root " +
      "usually out-scored them, and a root page's first 15k chars carry no " +
      "show data. Profile now prefers the real listing paths. A production " +
      "('Anastasia', 'Elf The Musical') runs many performances: each becomes " +
      "its own dated row, which is correct for a calendar but makes the " +
      "title+venue dedupe key collide — see EVENT_SOURCE_PLAYBOOK.md.",
  },
  {
    id: "theater-desmoines",
    label: "Theater Des Moines",
    hosts: ["theaterdesmoines.com"],
    listingUrls: ["https://www.theaterdesmoines.com/events/"],
    strategy: ["tribe-rest", "listing-jsonld", "detail-crawl", "ai-fallback"],
    detailPathPatterns: [/^\/events?\/[^/]+\/?$/i, /^\/event\//i],
    defaultCategory: "Arts",
    notes:
      "Venue intentionally left undeclared — this host's identity has not been " +
      "verified from a live fetch, so stamping a venue name here would inject " +
      "wrong data into every row. Extraction supplies the venue; the " +
      "known_venues matcher canonicalizes it.",
  },
  {
    id: "des-moines-theater-resale",
    label: "des-moines-theater.com (third-party resale listing)",
    hosts: ["des-moines-theater.com"],
    listingUrls: ["https://www.des-moines-theater.com/shows/concert"],
    strategy: ["listing-jsonld", "ai-fallback"],
    detailPathPatterns: [/^\/shows?\//i, /^\/tickets?\//i],
    defaultCategory: "Music",
    notes:
      "REVIEW BEFORE ENABLING. The host pattern (generic city-venue domain, " +
      "/shows/<category> paths) is characteristic of a ticket-RESALE " +
      "aggregator, not a venue. Ingesting a reseller gives marked-up prices, " +
      "affiliate source_urls that bypass the venue, and duplicates of events " +
      "already arriving via SeatGeek/Catch Des Moines. Kept in the registry so " +
      "the decision is recorded, but it should stay out of the seeded crawl " +
      "list until someone confirms it is a primary source.",
  },

  // ── Music venues ────────────────────────────────────────────────────────
  {
    id: "first-fleet-woolys",
    label: "Wooly's (First Fleet Concerts)",
    hosts: ["firstfleetconcerts.com", "woolysdm.com"],
    listingUrls: [
      "https://www.firstfleetconcerts.com/events",
      "https://www.woolysdm.com/events",
      "https://www.firstfleetconcerts.com/first-fleet-venues/woolys",
    ],
    strategy: ["listing-jsonld", "detail-crawl", "ai-fallback"],
    detailPathPatterns: [/^\/events?\/detail\//i, /^\/events?\/[^/]+\/?$/i],
    venue: { name: "Wooly's", location: "504 E Locust St, Des Moines, IA 50309" },
    defaultCategory: "Music",
    notes:
      "The seeded URL is a VENUE PROFILE page (/first-fleet-venues/woolys), " +
      "one layer above the calendar — a textbook case of 'the events are a " +
      "layer in'. First Fleet detail URLs are /events/detail/<slug> (confirmed " +
      "by scripts/analyze-event-urls.ts, which already matched that shape in " +
      "live rows). First Fleet books multiple venues, so events extracted from " +
      "the ALL-events listing must not be blanket-stamped as Wooly's: the " +
      "venue default only applies when the page itself names no venue.",
  },
  {
    id: "vibrant-music-hall",
    label: "Vibrant Music Hall",
    hosts: ["vibrantmusichall.com"],
    listingUrls: ["https://www.vibrantmusichall.com/shows"],
    strategy: ["adapter"],
    venue: { name: "Vibrant Music Hall", location: "Waukee, IA" },
    defaultCategory: "Music",
    notes:
      "Owned by vibrantmusichall.ts (single fetch of /shows, all events in " +
      "ld+json). Host was MISSING from the crawler allowlist, so ai-crawler " +
      "403'd before the adapter could run — fixed in fetchGuard.ts.",
  },
  {
    id: "dm-symphony",
    label: "Des Moines Symphony",
    hosts: ["dmsymphony.org"],
    listingUrls: [
      "https://www.dmsymphony.org/concerts-events/",
      "https://www.dmsymphony.org/events/",
    ],
    strategy: ["tribe-rest", "listing-jsonld", "detail-crawl", "ai-fallback"],
    detailPathPatterns: [
      /^\/event\//i,
      /^\/events\/[^/]+\/?$/i,
      /^\/concerts?-events\/[^/]+\/?$/i,
      /^\/concert\//i,
    ],
    venue: {
      name: "Civic Center of Greater Des Moines",
      location: "221 Walnut St, Des Moines, IA 50309",
    },
    defaultCategory: "Music",
    notes:
      "/concerts-events/ is a SEASON landing page: each concert is its own " +
      "detail page, and a single concert usually has two performances " +
      "(Sat evening + Sun matinee) that must both be ingested. The Symphony " +
      "plays the Civic Center primarily but also the Temple Theater — the " +
      "venue default is a fallback only, never an override.",
  },

  // ── Multi-purpose / community venues ────────────────────────────────────
  {
    id: "hoyt-sherman",
    label: "Hoyt Sherman Place",
    hosts: ["hoytsherman.org", "hoyt-sherman.org"],
    listingUrls: ["https://hoytsherman.org/events/"],
    strategy: ["tribe-rest", "listing-jsonld", "detail-crawl", "ai-fallback"],
    detailPathPatterns: [/^\/event\//i, /^\/events\/[^/]+\/?$/i],
    venue: {
      name: "Hoyt Sherman Place",
      location: "1501 Woodland Ave, Des Moines, IA 50309",
    },
    defaultCategory: "Music",
    ticketsUrl: "https://hoytsherman.org/events/",
    notes:
      "The allowlist only ever contained the HYPHENATED 'hoyt-sherman.org', so " +
      "the real host 'hoytsherman.org' was rejected with 403 before any " +
      "scrape — this source produced zero events for that reason alone. Both " +
      "spellings are now allowlisted and both are owned by this profile. " +
      "/events/ and /event-archive/ is the classic WordPress 'The Events " +
      "Calendar' pair, which is why tribe-rest is tried first.",
  },
  {
    id: "horizon-events-center",
    label: "Horizon Events Center",
    hosts: ["horizoneventscenter.com"],
    listingUrls: [
      "https://www.horizoneventscenter.com/upcoming-events/",
      "https://www.horizoneventscenter.com/events",
    ],
    strategy: ["tribe-rest", "listing-jsonld", "detail-crawl", "ai-fallback"],
    detailPathPatterns: [
      /^\/event\//i,
      /^\/events\/[^/]+\/?$/i,
      /^\/upcoming-events\/[^/]+\/?$/i,
    ],
    venue: {
      name: "Horizon Events Center",
      location: "2100 NW 100th St, Clive, IA 50325",
    },
    defaultCategory: "Community",
    notes:
      "Clive, NOT Des Moines — the generic path defaulted location to " +
      "'Des Moines, IA', which put every Horizon event in the wrong city and " +
      "on the wrong map pin. The venue default fixes that.",
  },
];

/** Host of a URL, lowercased. Returns null for malformed input. */
function hostOf(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** True when `host` equals `domain` or is a subdomain of it. */
export function hostMatches(host: string, domain: string): boolean {
  const d = domain.toLowerCase();
  return host === d || host.endsWith(`.${d}`);
}

/**
 * Find the profile that owns a URL. Longest host suffix wins so a more specific
 * profile can shadow a broader one if we ever add overlapping hosts.
 */
export function findEventSourceProfile(
  rawUrl: string,
): EventSourceProfile | null {
  const host = hostOf(rawUrl);
  if (!host) return null;

  let best: EventSourceProfile | null = null;
  let bestLen = -1;
  for (const profile of EVENT_SOURCE_PROFILES) {
    for (const domain of profile.hosts) {
      if (hostMatches(host, domain) && domain.length > bestLen) {
        best = profile;
        bestLen = domain.length;
      }
    }
  }
  return best;
}

/**
 * The URL list to crawl for a seeded URL: the profile's canonical listing URLs,
 * with the seeded URL appended when it isn't already one of them.
 *
 * Order matters — callers try these in sequence — because a seeded URL is
 * frequently a marketing/venue-profile page (Wooly's) or a month-pinned view
 * (Iowa Wolves ?month=3) that yields far less than the canonical listing.
 */
export function resolveListingUrls(rawUrl: string): string[] {
  const profile = findEventSourceProfile(rawUrl);
  if (!profile) return [rawUrl];

  const normalize = (u: string) => u.replace(/\/+$/, "").toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of [...profile.listingUrls, rawUrl]) {
    const key = normalize(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}

/** True when a path looks like an event detail page for this profile. */
export function isDetailPath(
  profile: EventSourceProfile,
  path: string,
): boolean {
  if (!profile.detailPathPatterns?.length) return false;
  return profile.detailPathPatterns.some((re) => re.test(path));
}

/**
 * Whether a source's `source_url` is final and must not be rewritten
 * downstream. Only Catch Des Moines sets this today.
 */
export function shouldPreserveSourceUrl(rawUrl: string): boolean {
  return findEventSourceProfile(rawUrl)?.preserveSourceUrl === true;
}
