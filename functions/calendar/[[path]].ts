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
export function feedHeaders(slug: string): Headers {
  return new Headers({
    "Content-Type": "text/calendar; charset=utf-8",
    // inline, so a browser that opens the https URL shows or hands it to the
    // calendar app instead of saving a file named "[[path]]".
    "Content-Disposition": `inline; filename="${slug}.ics"`,
    "Cache-Control": `public, max-age=${FEED_CACHE_SECONDS}`,
    "X-Content-Type-Options": "nosniff",
    // Calendar clients fetch server-side, so this only matters to a browser
    // script; there is no reason to let another origin read the feed.
    "Access-Control-Allow-Origin": "*",
  });
}

/** Build the feed body from rows. Pure, so the offline test can run it. */
export function renderFeed(slug: string, rows: readonly FeedRow[], stamp: Date = new Date()): string | null {
  const feed = feedForSlug(slug);
  if (!feed) return null;
  return buildCalendarIcs(rows.map(toIcsEvent), {
    name: feed.name,
    refreshInterval: FEED_REFRESH_INTERVAL,
    alarm: false,
    stamp,
  });
}

export async function onRequest(context: Ctx): Promise<Response> {
  const { request, env } = context;

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }

  const url = new URL(request.url);
  const slug = feedSlugFromPath(url.pathname);
  const feed = slug ? feedForSlug(slug) : undefined;
  if (!slug || !feed) {
    return new Response("No such calendar feed", { status: 404, headers: { "Cache-Control": "public, max-age=300" } });
  }

  const base = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || "").replace(/\/+$/, "");
  const anon = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
  if (!base || !anon) {
    return new Response("Calendar origin not configured", { status: 502, headers: { "Cache-Control": "no-store" } });
  }

  // deno-lint-ignore no-explicit-any
  const cache = (globalThis as any).caches?.default;
  // Query strings are ignored on purpose: Google appends its own, and each
  // distinct one would otherwise be a separate cache entry and a separate
  // database read.
  const cacheKey = new Request(`${url.origin}${url.pathname}`, { method: "GET" });
  if (cache) {
    const hit: Response | undefined = await cache.match(cacheKey);
    if (hit) return request.method === "HEAD" ? new Response(null, { headers: hit.headers }) : hit;
  }

  let rows: FeedRow[];
  try {
    const query = feedRestQuery(feed, centralDayStartUtcISO());
    const res = await fetch(`${base}/rest/v1/events?${query.toString()}`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}`, Accept: "application/json" },
    });
    if (!res.ok) {
      return new Response("Calendar temporarily unavailable", {
        status: 502,
        headers: { "Cache-Control": "no-store", "Retry-After": "600" },
      });
    }
    rows = (await res.json()) as FeedRow[];
  } catch {
    return new Response("Calendar temporarily unavailable", {
      status: 502,
      headers: { "Cache-Control": "no-store", "Retry-After": "600" },
    });
  }

  const body = renderFeed(slug, rows) ?? "";
  const response = new Response(body, { status: 200, headers: feedHeaders(slug) });
  if (cache) context.waitUntil(cache.put(cacheKey, response.clone()));
  return request.method === "HEAD" ? new Response(null, { headers: response.headers }) : response;
}
