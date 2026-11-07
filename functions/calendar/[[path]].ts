/**
 * Subscribable calendar feeds: GET /calendar/<slug>.ics (growth roadmap #9).
 *
 * A reader adds https://desmoinesinsider.com/calendar/music.ics (or the
 * webcal:// form) to Google, Apple or Outlook once, and their calendar re-reads
 * it every few hours from then on. The feed list and the query live in
 * src/lib/calendarFeeds.ts; the serializer is src/lib/icsEvent.ts, the same one
 * behind the per-event "Add to calendar" download, so a feed entry and a
 * single download can never disagree about when an event starts.
 *
 * WHY A PAGES FUNCTION AND NOT A SUPABASE EDGE FUNCTION. Two reasons. The URL
 * goes into people's calendars for years, so it should be on our own domain,
 * not on <project>.supabase.co, where moving off Supabase would break every
 * subscription. And the timing rules (all-day for "time TBD", SeatGeek's 03:30
 * placeholder, end_date for multi-day events) are TypeScript in src/lib that
 * this bundler can import directly; Deno would need a second copy, and two
 * copies of a date rule is how the five-hours-early calendar bug happened
 * (header of icsEvent.ts).
 *
 * CACHING. Calendar clients poll on a timer, and Google polls from many
 * servers. Every response is put in the Cloudflare edge cache for
 * FEED_CACHE_SECONDS, so PostgREST sees roughly one request per feed per hour
 * no matter how many people subscribe.
 *
 * PERSONAL FEEDS. /calendar/my/<token>.ics is one saved search, looked up by
 * the secret token through saved_search_calendar_feed() (migration
 * 20261102000003), which returns that row's filters and nothing else. The
 * token is the only credential, so these responses carry noindex and are
 * never linked from a public page. Turning the feed off or rotating the token
 * takes effect once the edge copy expires, within FEED_CACHE_SECONDS.
 *
 * FAILURE. An upstream error returns 502 and is NOT cached. A subscribing
 * client keeps its previous copy on an error, which is the right outcome; an
 * empty 200 would wipe every event out of every subscriber's calendar.
 */
import {
  FEED_CACHE_SECONDS,
  FEED_REFRESH_INTERVAL,
  feedForSlug,
  feedRestQuery,
  feedSlugFromPath,
  personalFeedFromSavedSearch,
  personalFeedTokenFromPath,
  type FeedCriteria,
} from "../../src/lib/calendarFeeds";
import { buildCalendarIcs, toIcsEvent } from "../../src/lib/icsEvent";
import { centralDayStartUtcISO } from "../../src/lib/timezone";

interface Env {
  VITE_SUPABASE_URL?: string;
  SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  SUPABASE_ANON_KEY?: string;
}

interface Ctx {
  request: Request;
  env: Env;
  waitUntil(p: Promise<unknown>): void;
}

type FeedRow = Parameters<typeof toIcsEvent>[0];

/** The headers every feed response carries. Exported for the offline test. */
export function feedHeaders(filename: string, personal = false): Headers {
  const headers = new Headers({
    "Content-Type": "text/calendar; charset=utf-8",
    // inline, so a browser that opens the https URL shows or hands it to the
    // calendar app instead of saving a file named "[[path]]".
    "Content-Disposition": `inline; filename="${filename}.ics"`,
    "Cache-Control": `public, max-age=${FEED_CACHE_SECONDS}`,
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Origin": "*",
  });
  // A personal feed's URL is its password. Keep it out of every index.
  if (personal) headers.set("X-Robots-Tag", "noindex, nofollow");
  return headers;
}

/** Build a calendar body from rows. Pure, so the offline test can run it. */
export function renderCalendar(name: string, rows: readonly FeedRow[], stamp: Date = new Date()): string {
  return buildCalendarIcs(rows.map(toIcsEvent), {
    name,
    refreshInterval: FEED_REFRESH_INTERVAL,
    alarm: false,
    stamp,
  });
}

/** A fixed feed's body by slug, or null for an unknown slug. */
export function renderFeed(slug: string, rows: readonly FeedRow[], stamp: Date = new Date()): string | null {
  const feed = feedForSlug(slug);
  return feed ? renderCalendar(feed.name, rows, stamp) : null;
}

const unavailable = () =>
  new Response("Calendar temporarily unavailable", {
    status: 502,
    headers: { "Cache-Control": "no-store", "Retry-After": "600" },
  });

const notFound = () =>
  new Response("No such calendar feed", { status: 404, headers: { "Cache-Control": "public, max-age=300" } });

interface Target {
  name: string;
  filename: string;
  criteria: FeedCriteria;
  personal: boolean;
}

type Resolved = Target | "not-found" | "unavailable";

/** Look a personal token up. Exported for the offline test. */
export async function resolvePersonalFeed(base: string, anon: string, token: string): Promise<Resolved> {
  let rows: Array<{ name?: string | null; filters?: unknown; search_type?: string | null }>;
  try {
    const res = await fetch(`${base}/rest/v1/rpc/saved_search_calendar_feed`, {
      method: "POST",
      headers: {
        apikey: anon,
        Authorization: `Bearer ${anon}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ p_token: token }),
    });
    // Includes the RPC not being deployed yet (PGRST202): a server problem,
    // not proof the feed was turned off, so it must not be cached as a 404.
    if (!res.ok) return "unavailable";
    rows = await res.json();
  } catch {
    return "unavailable";
  }
  const row = Array.isArray(rows) ? rows[0] : undefined;
  if (!row) return "not-found";
  const feed = personalFeedFromSavedSearch(row);
  if (!feed) return "not-found";
  return { name: feed.name, filename: "my-events", criteria: feed.criteria, personal: true };
}

export async function onRequest(context: Ctx): Promise<Response> {
  const { request, env } = context;

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }

  const url = new URL(request.url);
  const slug = feedSlugFromPath(url.pathname);
  const token = slug ? null : personalFeedTokenFromPath(url.pathname);
  const fixed = slug ? feedForSlug(slug) : undefined;
  if (!fixed && !token) return notFound();

  const base = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || "").replace(/\/+$/, "");
  const anon = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
  if (!base || !anon) {
    return new Response("Calendar origin not configured", { status: 502, headers: { "Cache-Control": "no-store" } });
  }

  // deno-lint-ignore no-explicit-any
  const cache = (globalThis as any).caches?.default;
  // Query strings are ignored on purpose: Google appends its own, and each
  // distinct one would otherwise be a separate cache entry and a separate
  // database read. A personal token is lowercased by the path parser, so the
  // key uses the parsed value, not the raw path.
  const keyPath = fixed ? `/calendar/${fixed.slug}.ics` : `/calendar/my/${token}.ics`;
  const cacheKey = new Request(`${url.origin}${keyPath}`, { method: "GET" });
  if (cache) {
    const hit: Response | undefined = await cache.match(cacheKey);
    if (hit) return request.method === "HEAD" ? new Response(null, { headers: hit.headers }) : hit;
  }

  let target: Resolved;
  if (fixed) {
    target = { name: fixed.name, filename: fixed.slug, criteria: fixed, personal: false };
  } else {
    target = await resolvePersonalFeed(base, anon, token!);
  }
  if (target === "unavailable") return unavailable();
  if (target === "not-found") return notFound();

  let rows: FeedRow[];
  try {
    const query = feedRestQuery(target.criteria, centralDayStartUtcISO());
    const res = await fetch(`${base}/rest/v1/events?${query.toString()}`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}`, Accept: "application/json" },
    });
    if (!res.ok) return unavailable();
    rows = (await res.json()) as FeedRow[];
  } catch {
    return unavailable();
  }

  const body = renderCalendar(target.name, rows);
  const response = new Response(body, { status: 200, headers: feedHeaders(target.filename, target.personal) });
  if (cache) context.waitUntil(cache.put(cacheKey, response.clone()));
  return request.method === "HEAD" ? new Response(null, { headers: response.headers }) : response;
}
