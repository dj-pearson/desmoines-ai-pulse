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
import { EVENT_CATEGORIES } from "./eventCategories";
import { FREE_PRICE_FILTER } from "./eventPrice";

export interface CalendarFeed {
  /** The URL segment: /calendar/<slug>.ics. Never rename. */
  slug: string;
  /** X-WR-CALNAME, and the label in the Subscribe menu. */
  name: string;
  /** One line for the Subscribe menu. */
  description: string;
  /** Exact `events.category` value, when the feed is one category. */
  category?: string;
  /** Only events whose listed price says free or $0 (FREE_PRICE_FILTER). */
  freeOnly?: boolean;
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
 */
export function feedRestQuery(feed: CalendarFeed, fromIso: string): URLSearchParams {
  const from = new Date(fromIso);
  const until = new Date(from.getTime() + FEED_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams();
  params.set("select", FEED_EVENT_COLUMNS.replace(/\s+/g, ""));
  params.append("date", `gte.${from.toISOString()}`);
  params.append("date", `lt.${until.toISOString()}`);
  params.set("is_merged", "neq.true");
  params.set("is_hidden", "neq.true");
  params.set("archived_at", "is.null");
  if (feed.category) params.set("category", `eq.${feed.category}`);
  if (feed.freeOnly) params.set("or", `(${FREE_PRICE_FILTER})`);
  params.set("order", "date.asc");
  params.set("limit", String(FEED_MAX_EVENTS));
  return params;
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

export function feedLinks(feed: CalendarFeed, origin: string = BRAND.baseUrl): FeedLinks {
  const https = `${origin.replace(/\/$/, "")}/calendar/${feed.slug}.ics`;
  const webcal = https.replace(/^https?:\/\//, "webcal://");
  return {
    https,
    webcal,
    google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
    outlook:
      "https://outlook.live.com/calendar/0/addfromweb?" +
      new URLSearchParams({ url: https, name: feed.name }).toString(),
  };
}
