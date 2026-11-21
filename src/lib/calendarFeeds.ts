/**
 * Subscribable calendar feeds (growth roadmap #9).
 *
 * A one-off .ics download (icsEvent.ts) puts one event in a calendar and is
 * forgotten. A subscribed feed is re-read by the reader's calendar every few
 * hours, so every new Music or Free event we ingest shows up in Google, Apple
 * or Outlook without the reader coming back to the site. That repeat exposure
 * is the point of the feature.
 *
 * One definition list, read by two runtimes: the Pages Function at
 * functions/calendar/[[path]].ts, which serves /calendar/<slug>.ics, and the
 * Subscribe button in the app, which lists the same feeds. The slugs are
 * public URLs that live in people's calendars for years, so treat them as a
 * schema: never rename one, only add.
 *
 * Relative imports only. The Pages Functions bundler does not read the app's
 * "@/" alias (see the header of functions/_middleware.ts).
 */
import { BRAND } from "./brandConfig";
import { eventAreaOrFilter, findEventArea, type EventArea } from "./eventAreas";
import { EVENT_CATEGORIES } from "./eventCategories";
import { FREE_PRICE_FILTER } from "./eventPrice";
import { hubSearchQuery } from "./eventSearchQuery";
import { normalizeSavedSearch, type SavedSearchRowLike } from "./savedSearchFilters";

/**
 * What a feed selects, beyond the window and the unpublish filters. The fixed
 * feeds use category and freeOnly; a personal feed built from a saved search
 * can use all four.
 */
export interface FeedCriteria {
  /** Exact `events.category` value. */
  category?: string;
  /** Only events whose listed price says free or $0 (FREE_PRICE_FILTER). */
  freeOnly?: boolean;
  /** The search box text, matched the way the hub matches it (hubSearchQuery). */
  search?: string;
  /** An /events area (src/lib/eventAreas.ts). */
  area?: EventArea;
}

export interface CalendarFeed extends FeedCriteria {
  /** The URL segment: /calendar/<slug>.ics. Never rename. */
  slug: string;
  /** X-WR-CALNAME, and the label in the Subscribe menu. */
  name: string;
  /** One line for the Subscribe menu. */
  description: string;
}

/** How far ahead a feed reaches. Far enough to plan a month, small enough to stay fast. */
export const FEED_WINDOW_DAYS = 60;

/** Hard cap on events per feed. Some clients choke on very large feeds. */
export const FEED_MAX_EVENTS = 500;

/** What subscribing clients are asked to honour between re-fetches. */
export const FEED_REFRESH_INTERVAL = "PT6H";

/** Seconds the edge and browsers may cache a feed. Ingest runs a few times a day. */
export const FEED_CACHE_SECONDS = 3600;

/**
 * The columns toIcsEvent reads, and nothing else. Every one is also in
 * EVENT_LIST_COLUMNS, which /events selects on every page view, so none of
 * them can be a column production lacks without /events breaking too.
 */
export const FEED_EVENT_COLUMNS =
  "id, title, date, end_date, event_start_utc, event_start_local, time_tbd, source_url, venue, location, enhanced_description, original_description";

function categorySlug(category: string): string {
  return category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * Every feed, in menu order. "Other" is left out: it is the bucket for rows
 * nobody could classify, and nobody wants to subscribe to it.
 */
export const CALENDAR_FEEDS: readonly CalendarFeed[] = [
  {
    slug: "all",
    name: `${BRAND.name}: All Events`,
    description: "Every upcoming event in the Des Moines area",
  },
  {
    slug: "free",
    name: `${BRAND.name}: Free Events`,
    description: "Events listed as free or $0",
    freeOnly: true,
  },
  ...EVENT_CATEGORIES.filter((c) => c !== "Other").map((category) => ({
    slug: categorySlug(category),
    name: `${BRAND.name}: ${category}`,
    description: `Upcoming ${category.toLowerCase()} events`,
    category,
  })),
];

const BY_SLUG: ReadonlyMap<string, CalendarFeed> = new Map(CALENDAR_FEEDS.map((f) => [f.slug, f]));

export function feedForSlug(slug: string): CalendarFeed | undefined {
  return BY_SLUG.get(slug);
}

/** The feed a page should preselect for an exact category value, else "all". */
export function feedForCategory(category: string | null | undefined): CalendarFeed {
  if (!category) return BY_SLUG.get("all")!;
  return CALENDAR_FEEDS.find((f) => f.category === category) ?? BY_SLUG.get("all")!;
}

/**
 * The slug in a /calendar path: "/calendar/music.ics" -> "music". Null for
 * anything that is not exactly one known-shape segment ending in .ics, so a
 * probe never reaches the database.
 */
export function feedSlugFromPath(pathname: string): string | null {
  const m = /^\/calendar\/([a-z0-9-]{1,40})\.ics$/.exec(pathname);
  return m ? m[1] : null;
}

/**
 * The PostgREST query string for a feed's events.
 *
 * Applies the same three unpublish filters as applyEventVisibility
 * (src/lib/eventQuery.ts): is_merged, is_hidden and archived_at. Dropping any
 * one of them would put a retired or duplicate event into hundreds of
 * calendars at once, where we cannot take it back until the next refresh.
 *
 * `fromIso` is the start of today in Central time (centralDayStartUtcISO), the
 * same lower bound /events uses, so a show already under way tonight stays in.
 * A run that started before today stays in too, while its end_date is today or
 * later (feedWindowOrFilter). Without that arm the State Fair left every
 * subscriber's calendar on its second morning, all eleven days at once, because
 * a client that re-reads a feed deletes whatever the new copy no longer lists.
 *
 * Search, area and free follow applyHubFilters in
 * src/components/events/eventsHubQuery.ts predicate for predicate, including
 * putting every OR group into ONE `or=` param: PostgREST would otherwise have
 * to combine two `or` keys, and the hub deliberately never relies on that.
 */
/**
 * The feed's lower bound as one PostgREST OR group: starts today or later, or
 * is a multi-day run whose end_date has not passed by the start of today. The
 * same two arms as upcomingOrFilter in eventsHubQuery.ts, measured from the
 * Central day start rather than from now, so the whole of today stays listed.
 */
export function feedWindowOrFilter(from: Date): string {
  const iso = from.toISOString();
  return `date.gte.${iso},end_date.gte.${iso}`;
}

export function feedRestQuery(criteria: FeedCriteria, fromIso: string): URLSearchParams {
  const from = new Date(fromIso);
  const until = new Date(from.getTime() + FEED_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams();
  params.set("select", FEED_EVENT_COLUMNS.replace(/\s+/g, ""));
  params.append("date", `lt.${until.toISOString()}`);
  params.set("is_merged", "neq.true");
  params.set("is_hidden", "neq.true");
  params.set("archived_at", "is.null");
  if (criteria.category) params.set("category", `eq.${criteria.category}`);

  const search = criteria.search ? hubSearchQuery(criteria.search) : null;
  if (search) {
    params.set("search_vector", `${search.type === "websearch" ? "wfts" : "fts"}(english).${search.query}`);
  }

  const orGroups: string[] = [feedWindowOrFilter(from)];
  if (criteria.freeOnly) orGroups.push(FREE_PRICE_FILTER);
  const area = criteria.area;
  if (area) {
    const group = eventAreaOrFilter(area);
    if (group) orGroups.push(group);
    // postgrest-safe: area.city comes from the fixed EVENT_AREAS list, not from input
    else if (area.kind === "city") params.set("city", `ilike.${area.city}`);
    else {
      const { south, west, north, east } = area.bbox;
      params.append("latitude", `gte.${south}`);
      params.append("latitude", `lte.${north}`);
      params.append("longitude", `gte.${west}`);
      params.append("longitude", `lte.${east}`);
    }
  }
  if (orGroups.length === 1) params.set("or", `(${orGroups[0]})`);
  else if (orGroups.length > 1) params.set("or", `(and(${orGroups.map((g) => `or(${g})`).join(",")}))`);

  params.set("order", "date.asc");
  params.set("limit", String(FEED_MAX_EVENTS));
  return params;
}

// ---------------------------------------------------------------------------
// Personal feeds: one saved search, behind an unguessable token
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * The token in /calendar/my/<token>.ics, or null. A UUID only, lowercased, so
 * nothing else reaches the RPC and two spellings of one token share a cache
 * entry.
 */
export function personalFeedTokenFromPath(pathname: string): string | null {
  const m = /^\/calendar\/my\/([0-9a-fA-F-]{36})\.ics$/.exec(pathname);
  if (!m) return null;
  const token = m[1].toLowerCase();
  return UUID_RE.test(token) ? token : null;
}

export function personalFeedUrl(token: string, origin: string = BRAND.baseUrl): string {
  return `${origin.replace(/\/$/, "")}/calendar/my/${token}.ics`;
}

export interface PersonalFeed {
  name: string;
  criteria: FeedCriteria;
}

/**
 * A saved_searches row as feed criteria, or null when it is not an events
 * search (an iOS restaurants tab, an advanced place search): those have no
 * events to put in a calendar.
 *
 * Read through normalizeSavedSearch, the same reader the dashboard and the
 * alert links use, so the iOS `query` key and the web `q` key both work.
 * `preset` and `sort` are deliberately ignored: a feed is a rolling window, and
 * "this weekend" frozen into a calendar would mean a different weekend from the
 * one the reader saved it on.
 */
export function personalFeedFromSavedSearch(row: SavedSearchRowLike & { name?: string | null }): PersonalFeed | null {
  const n = normalizeSavedSearch(row);
  if (n.kind !== "events") return null;
  return {
    name: `${BRAND.name}: ${row.name?.trim() || n.label}`,
    criteria: {
      search: n.q || undefined,
      category: n.category || undefined,
      area: findEventArea(n.location),
      freeOnly: n.price.toLowerCase() === "free",
    },
  };
}

export interface FeedLinks {
  /** The plain https URL, for copying into any client. */
  https: string;
  /** webcal:// - opens Apple Calendar (and most desktop clients) as a subscription. */
  webcal: string;
  /** Google Calendar's "add by URL" screen, prefilled. */
  google: string;
  /** Outlook.com's "add from web" screen, prefilled. */
  outlook: string;
}

/** Subscribe links for any feed URL: a fixed feed's or a personal one. */
export function linksForFeedUrl(https: string, name: string): FeedLinks {
  const webcal = https.replace(/^https?:\/\//, "webcal://");
  return {
    https,
    webcal,
    google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
    outlook:
      "https://outlook.live.com/calendar/0/addfromweb?" +
      new URLSearchParams({ url: https, name }).toString(),
  };
}

export function feedLinks(feed: CalendarFeed, origin: string = BRAND.baseUrl): FeedLinks {
  return linksForFeedUrl(`${origin.replace(/\/$/, "")}/calendar/${feed.slug}.ics`, feed.name);
}
