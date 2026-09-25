import { EventContext } from "@cloudflare/workers-types";
// Relative, alias-free imports only: this file is bundled by Pages Functions,
// which does not read the app's "@/" alias. restaurantMeta has no imports;
// restaurantHours imports date-fns-tz, which the Pages bundler resolves.
import {
  parseIowaAddress,
  restaurantLocality,
  restaurantMetaDescription,
  restaurantPageTitle,
  isStaleOpeningCopy,
  type RestaurantMetaInput,
} from "../src/lib/restaurantMeta";
import { resolveOpeningHoursSpecification } from "../src/lib/restaurantHours";
import { safeHttpUrl } from "../src/lib/safeUrl";

/**
 * Cloudflare Pages Functions middleware.
 *
 * Two jobs:
 *  1. SPA routing — serve index.html for client-rendered routes.
 *  2. Social-crawler OG injection (WEB-FEAT-008) — detail pages are data-driven
 *     and rendered client-side, so a bot that doesn't run JS only ever sees the
 *     static shell's generic og:image. For known social crawlers hitting a
 *     detail route we resolve the entity and rewrite og/twitter title, image
 *     (pointing at the dynamic `og-image` edge function), description and url in
 *     the served HTML. Real users are untouched (no extra latency).
 *
 * SAFETY: the entire injection path is wrapped so ANY failure (missing env,
 * unresolved slug, fetch/parse error) falls through to the normal SPA response.
 * Worst case is "same as before" — the generic preview card.
 */

// WEB-SEO-020 AC5: playgrounds and /stay were handled by nothing at all, so
// their detail pages fell through with homepage meta and no entity JSON-LD.
const OG_TYPE_BY_SEGMENT: Record<
  string,
  "event" | "restaurant" | "attraction" | "article" | "playground" | "hotel"
> = {
  events: "event",
  restaurants: "restaurant",
  attractions: "attraction",
  articles: "article",
  playgrounds: "playground",
  stay: "hotel",
};

// Month-year segments under /events resolve to a listing page, not a detail page.
const MONTH_YEAR = /^(january|february|march|april|may|june|july|august|september|october|november|december)-\d{4}$/i;

// WEB-SEO-020: THERE IS NO CRAWLER USER-AGENT LIST ANY MORE, and its absence is
// the fix rather than a simplification.
//
// A user-agent regex used to select who got the rewritten shell. Alongside the
// link-preview bots it listed Google's own inspection tool and its secondary
// crawler, so URL Inspection was shown something no user ever saw -- which is
// what "cloaking" means, whatever the intent. It also could not win: the branch it guarded
// fetched "/" and stripped every ld+json block, so the better a page had been
// prerendered, the more that branch destroyed.
//
// Everyone now receives the same response, and it is the right one: a
// prerendered page passes through untouched, and a page that missed the
// prerender budget gets its own title, description, og:type and Event or
// Restaurant JSON-LD injected into the shell. Serving one answer to every
// requester removes the risk entirely and is less code.

function slugify(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Central-time date suffix used by createEventSlugWithCentralTime (src/lib/timezone.ts). */
function eventSlug(title: string, when: string | null | undefined): string {
  const titleSlug = slugify(title);
  if (!when) return titleSlug;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(when));
    const get = (t: string) => parts.find((p) => p.type === t)?.value;
    const y = get("year");
    const m = get("month");
    const d = get("day");
    if (!y || !m || !d) return titleSlug;
    return `${titleSlug}-${y}-${m}-${d}`;
  } catch {
    return titleSlug;
  }
}

function truncate(s: string | null | undefined, n = 200): string {
  const t = (s || "").trim().replace(/\s+/g, " ");
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

interface Resolved {
  id: string;
  title: string;
  description: string;
  startDate?: string | null;
  /**
   * The row the shell body and JSON-LD are built from. Absent when only the
   * minimal select succeeded, or on a cache entry written before this existed;
   * entityShellRewrites then falls back to the identity-only rewrite.
   */
  row?: Record<string, any>;
  /**
   * Site path this URL should 301 to: the survivor of a merged duplicate, or
   * the slug of a row that was asked for by its id.
   */
  redirectTo?: string;
}

/**
 * What a lookup found. "error" is its own answer: a PostgREST outage used to
 * come back as an empty list, so a Supabase blip answered every restaurant URL
 * with a cached 404 and noindex, which is how a crawler delists a page.
 */
export type ResolveOutcome =
  | { kind: "row"; entity: Resolved }
  | { kind: "not-found" }
  | { kind: "error" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// What the shell body needs. Named in types.ts, but CLAUDE.md is explicit that
// types.ts is not proof a column exists - so a failed select falls back to the
// minimal one below instead of turning a real page into a 404.
const RESTAURANT_SHELL_COLUMNS =
  "id,name,slug,city,location,cuisine,price_range,phone,website,menu_url,latitude,longitude,opening,seo_description,description,status,is_merged,merged_into";
const RESTAURANT_MINIMAL_COLUMNS = "id,name,seo_description,description";
const EVENT_SHELL_COLUMNS =
  "id,title,date,event_start_utc,end_date,seo_description,geo_summary,location,venue,city,price,enhanced_description,original_description";

/** Rows, or null when PostgREST refused the query (bad column, outage). */
async function sbGet(base: string, anon: string, pathAndQuery: string): Promise<any[] | null> {
  const res = await fetch(`${base}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: anon, Authorization: `Bearer ${anon}` },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return Array.isArray(json) ? json : [];
}

/**
 * A restaurant row by `filter`, trying the rich select and then the minimal
 * one (a rich select can 42703 on a column the snapshot doesn't have). Null
 * only when both reads failed, which is an outage, not an empty result.
 */
async function fetchRestaurantRow(
  base: string,
  anon: string,
  filter: string,
): Promise<{ row: Record<string, any> | undefined; rich: boolean } | null> {
  const rich = await sbGet(base, anon, `${filter}&select=${RESTAURANT_SHELL_COLUMNS}&limit=1`);
  if (rich) return { row: rich[0], rich: true };
  const minimal = await sbGet(base, anon, `${filter}&select=${RESTAURANT_MINIMAL_COLUMNS}&limit=1`);
  if (minimal) return { row: minimal[0], rich: false };
  return null;
}

/**
 * Where a merged row's survivor lives, following at most three hops the way
 * RestaurantDetails.tsx follows one per navigation. `merged_into` holds an id
 * or a slug. Null when there is no survivor to send anyone to; "error" when
 * the read failed.
 */
async function resolveMergeSurvivor(
  base: string,
  anon: string,
  start: Record<string, any>,
): Promise<string | null | "error"> {
  const seen = new Set<string>([String(start.id)]);
  let target = String(start.merged_into);
  for (let hop = 0; hop < 3; hop++) {
    const column = UUID_RE.test(target) ? "id" : "slug";
    const rows = await sbGet(
      base,
      anon,
      `restaurants?${column}=eq.${encodeURIComponent(target)}&select=id,slug,is_merged,merged_into&limit=1`,
    );
    if (!rows) return "error";
    const next = rows[0];
    if (!next || seen.has(String(next.id))) return null;
    seen.add(String(next.id));
    if (next.is_merged && next.merged_into) {
      target = String(next.merged_into);
      continue;
    }
    return `/restaurants/${next.slug || next.id}`;
  }
  return null;
}

async function resolveRestaurant(base: string, anon: string, slug: string): Promise<ResolveOutcome> {
  let found = await fetchRestaurantRow(base, anon, `restaurants?slug=eq.${encodeURIComponent(slug)}`);
  if (!found) return { kind: "error" };
  // The React page falls back to the id when the param is a uuid; the shell
  // does the same and then 301s to the slug, so the id URL isn't a duplicate.
  if (!found.row && UUID_RE.test(slug)) {
    found = await fetchRestaurantRow(base, anon, `restaurants?id=eq.${slug}`);
    if (!found) return { kind: "error" };
  }
  const r = found.row;
  if (!r) return { kind: "not-found" };

  const entity: Resolved = {
    id: r.id,
    title: r.name,
    description: truncate(r.seo_description || r.description),
    ...(found.rich ? { row: r } : {}),
  };

  if (found.rich && r.is_merged && r.merged_into) {
    const survivor = await resolveMergeSurvivor(base, anon, r);
    if (survivor === "error") return { kind: "error" };
    if (survivor) return { kind: "row", entity: { ...entity, redirectTo: survivor } };
  }
  if (found.rich && r.slug && r.slug !== slug) {
    return { kind: "row", entity: { ...entity, redirectTo: `/restaurants/${r.slug}` } };
  }
  return { kind: "row", entity };
}

/** A lookup that found one row, none, or could not tell. */
function outcomeOf(rows: any[] | null, pick: (rows: any[]) => Resolved | null): ResolveOutcome {
  if (!rows) return { kind: "error" };
  const entity = pick(rows);
  return entity ? { kind: "row", entity } : { kind: "not-found" };
}

export async function resolveEntity(
  base: string,
  anon: string,
  type: string,
  slug: string,
): Promise<ResolveOutcome> {
  if (type === "restaurant") return resolveRestaurant(base, anon, slug);
  if (type === "article") {
    const rows = await sbGet(base, anon, `articles?slug=eq.${encodeURIComponent(slug)}&select=id,title,seo_description,excerpt&limit=1`);
    return outcomeOf(rows, ([r]) =>
      r ? { id: r.id, title: r.title, description: truncate(r.seo_description || r.excerpt) } : null,
    );
  }
  if (type === "attraction") {
    // No slug column — the app routes by slugify(name). Match over the (small) active set.
    const rows = await sbGet(base, anon, `attractions?is_active=eq.true&select=id,name,seo_description,description&limit=1000`);
    return outcomeOf(rows, (all) => {
      const r = all.find((a: any) => slugify(a.name) === slug);
      return r ? { id: r.id, title: r.name, description: truncate(r.seo_description || r.description) } : null;
    });
  }
  if (type === "event") {
    // Slug embeds a central-time YYYY-MM-DD suffix; match within a small date window.
    const m = slug.match(/-(\d{4})-(\d{2})-(\d{2})$/);
    let rows: any[] = [];
    let rich = false;
    if (m) {
      const day = `${m[1]}-${m[2]}-${m[3]}`;
      const start = new Date(`${day}T00:00:00Z`);
      const from = new Date(start.getTime() - 36 * 60 * 60 * 1000).toISOString();
      const to = new Date(start.getTime() + 60 * 60 * 60 * 1000).toISOString();
      const inWindow = async (sel: string) => {
        const [a, b] = await Promise.all([
          sbGet(base, anon, `events?event_start_utc=gte.${from}&event_start_utc=lt.${to}&select=${sel}&limit=200`),
          sbGet(base, anon, `events?date=gte.${from}&date=lt.${to}&select=${sel}&limit=200`),
        ]);
        return a && b ? [...a, ...b] : null;
      };
      const richRows = await inWindow(EVENT_SHELL_COLUMNS);
      rich = !!richRows;
      const all = richRows ?? (await inWindow("id,title,date,event_start_utc,seo_description,geo_summary"));
      if (!all) return { kind: "error" };
      const seen = new Set<string>();
      rows = all.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
    }
    const r = rows.find((e: any) => eventSlug(e.title, e.event_start_utc || e.date) === slug);
    return r
      ? {
          kind: "row",
          entity: {
            id: r.id,
            title: r.title,
            description: truncate(r.seo_description || r.geo_summary),
            startDate: r.event_start_utc || r.date || null,
            ...(rich ? { row: r } : {}),
          },
        }
      : { kind: "not-found" };
  }
  if (type === "playground") {
    // Like attractions: no slug column, the app routes by createSlug(name).
    const rows = await sbGet(base, anon, `playgrounds?select=id,name,description&limit=1000`);
    return outcomeOf(rows, (all) => {
      const r = all.find((a: any) => slugify(a.name) === slug);
      return r ? { id: r.id, title: r.name, description: truncate(r.description) } : null;
    });
  }
  if (type === "hotel") {
    const rows = await sbGet(base, anon, `hotels?slug=eq.${encodeURIComponent(slug)}&select=id,name,description&limit=1`);
    return outcomeOf(rows, ([r]) => (r ? { id: r.id, title: r.name, description: truncate(r.description) } : null));
  }
  return { kind: "not-found" };
}

/**
 * How to answer a detail URL whose asset turned out to be the SPA shell
 * (WEB-SEO-030).
 *
 * Every un-prerendered entity URL used to answer 200 with a self-canonical, so
 * a dead slug and a real page that missed the build budget were byte-identical
 * to a crawler: roughly 860 indexable duplicates of the homepage under
 * public/_routes.json's include ["/*"].
 *
 * Pure and exported so functions/__tests__ can assert the three cases without a
 * network or a Pages runtime.
 */
export function detailShellStatus(
  type: string,
  slug: string,
  resolved: boolean,
  now: Date = new Date(),
): { status: number; noindex: boolean; reason: string } {
  if (resolved) return { status: 200, noindex: false, reason: "resolved" };

  // An event slug carries its own date, which is the only date available when
  // the row itself cannot be found. A show that happened last year is GONE, not
  // merely missing, and 410 tells a crawler to stop asking.
  if (type === "event") {
    const m = slug.match(/-(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const when = Date.parse(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
      if (Number.isFinite(when) && now.getTime() - when > 30 * 24 * 60 * 60 * 1000) {
        return { status: 410, noindex: true, reason: "event-long-past" };
      }
    }
  }

  return { status: 404, noindex: true, reason: "unresolved" };
}

class AttrSetter {
  constructor(private attr: string, private value: string) {}
  element(el: any) {
    el.setAttribute(this.attr, this.value);
  }
}

class Remover {
  element(el: any) {
    el.remove();
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Stop the SPA fallback from claiming to BE the homepage (WEB-SEO-006).
 *
 * The fallback below serves `/` for every unmatched route, and `/` is
 * prerendered - so an event, restaurant or attraction URL returns the
 * homepage's HTML verbatim, including:
 *
 *   <link rel="canonical" href="https://desmoinesinsider.com/">
 *   <meta property="og:url" content="https://desmoinesinsider.com/">
 *   7 ld+json blocks describing the homepage (LocalBusiness, FAQPage, ...)
 *
 * Measured in production 2026-08-22: 884 sitemapped URLs each returning a
 * byte-identical copy of the homepage. That is not "invisible to crawlers",
 * which is how the story was originally framed - it is an explicit
 * consolidation directive telling every crawler to treat 884 distinct URLs as
 * one page, plus structured data asserting the wrong facts about each.
 *
 * Three rewrites, all of them removing a wrong assertion rather than inventing
 * a right one:
 *   - canonical and og:url point at the requested URL, so the page claims
 *     itself. Helmet replaces both after hydration for anyone running JS.
 *   - the homepage's JSON-LD is REMOVED rather than corrected. There is no
 *     per-entity data at this layer to build the right blocks from, and no
 *     structured data is strictly better than structured data that says an
 *     event page is a FAQ about Des Moines Insider.
 *
 * This does NOT make entity pages readable without JS - that needs
 * PRERENDER_ENTITIES on the Pages build, which is the rest of WEB-SEO-006. It
 * removes the part that is actively harmful while that is pending, and it also
 * covers the soft-404 surface, where an unknown slug will keep falling through
 * here even after the flag is on.
 */
/**
 * True when this HTML is the prerendered homepage being served as the SPA
 * fallback for some other URL.
 *
 * The homepage declares itself canonical, so a root canonical on a non-root
 * path is exactly the fallback case and nothing else. Matching on the tag
 * rather than on the status keeps this correct under Pages' SPA mode, which
 * answers 200, and makes it inert for genuinely prerendered pages.
 */
/**
 * resolveEntity, behind the edge cache (WEB-SEO-030 AC4).
 *
 * Every one of these is a PostgREST round trip, and the attraction and
 * playground branches pull up to 1,000 rows to match a slugified name. A
 * crawler working through a sitemap of ~860 un-prerendered URLs would otherwise
 * turn one crawl into ~860 of those. Five minutes is short enough that a newly
 * published page appears promptly and long enough to flatten a burst.
 *
 * Cache failures are swallowed: this is an optimisation, and a cache that is
 * unavailable must not turn into a 500 on a page request.
 */
export async function resolveEntityCached(
  context: Pick<EventContext, "waitUntil">,
  base: string,
  anon: string,
  type: string,
  slug: string,
): Promise<ResolveOutcome> {
  // v3: entries now carry status, is_merged and redirectTo; a v2 entry
  // would serve a closed row's hours for another five minutes.
  const key = new Request(
    `https://slug-resolve.internal/v3/${encodeURIComponent(type)}/${encodeURIComponent(slug)}`,
  );
  // deno-lint-ignore no-explicit-any
  const cache: any = (globalThis as any).caches?.default;

  try {
    const hit = await cache?.match(key);
    if (hit) {
      const body = await hit.json();
      return body && body.id ? { kind: "row", entity: body as Resolved } : { kind: "not-found" };
    }
  } catch {
    /* fall through to a live lookup */
  }

  const outcome = await resolveEntity(base, anon, type, slug);

  // A failed read is never cached: the next request should try again, not be
  // told for five minutes that the page doesn't exist.
  if (outcome.kind === "error") return outcome;

  try {
    // A miss is cached too, and for the same reason: a crawler hammering dead
    // slugs is exactly the traffic worth absorbing.
    const entity = outcome.kind === "row" ? outcome.entity : null;
    const payload = new Response(JSON.stringify(entity ?? {}), {
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
    });
    context.waitUntil?.(cache?.put(key, payload));
  } catch {
    /* the lookup already succeeded; caching it is best effort */
  }

  return outcome;
}

/**
 * What to send for a detail URL once the lookup is done, as data so the
 * outage, redirect and missing cases can be asserted without a Pages runtime.
 */
export type DetailResponsePlan =
  | { action: "redirect"; status: 301; location: string; cacheControl: string }
  | { action: "shell"; status: 200; entity: Resolved }
  | { action: "unavailable"; status: 200; cacheControl: "no-store" }
  | { action: "missing"; status: number; cacheControl: string };

export function detailResponsePlan(
  outcome: ResolveOutcome,
  type: string,
  slug: string,
  origin: string,
  now: Date = new Date(),
): DetailResponsePlan {
  if (outcome.kind === "error") {
    // Supabase is down or refused both selects. Say nothing about the page:
    // 200, self-canonical, and not stored anywhere, so the next crawl gets a
    // real answer.
    return { action: "unavailable", status: 200, cacheControl: "no-store" };
  }
  if (outcome.kind === "not-found") {
    const verdict = detailShellStatus(type, slug, false, now);
    return { action: "missing", status: verdict.status, cacheControl: "public, max-age=300" };
  }
  if (outcome.entity.redirectTo) {
    return {
      action: "redirect",
      status: 301,
      location: `${origin}${outcome.entity.redirectTo}`,
      cacheControl: "public, max-age=300",
    };
  }
  return { action: "shell", status: 200, entity: outcome.entity };
}

/**
 * The robots directive a restaurant row's shell carries, or null for the
 * default. A closed place and a merged duplicate with nowhere to send the
 * visitor both stay followable, so the related links still count.
 */
export function restaurantShellRobots(row: Record<string, any> | undefined): string | null {
  if (!row) return null;
  if (row.status === "closed") return "noindex, follow";
  if (row.is_merged) return "noindex, follow";
  return null;
}

/**
 * The shell, wearing the entity's identity (WEB-SEO-020 AC4, WEB-SEO-030 AC3).
 *
 * This is what a URL gets when it resolves but missed the prerender budget. The
 * branch this replaces set og:type to "website" for everything except articles
 * and removed every ld+json block, so an event page announced itself as a
 * generic website with no structured data. Here the og:type follows the segment
 * and a real Event or Restaurant node is injected.
 */
/**
 * What the entity shell rewrite does, as data (WEB-SEO-006, WEB-SEO-030 AC3).
 *
 * SPLIT OUT FOR THE SAME REASON selfCanonicalRewrites IS, and it found a live
 * defect the moment it could be run: `title` was pre-escaped with escapeHtml
 * AND THEN handed to a TEXT replacement, which escapes again. A restaurant
 * called "Fong's Pizza & Tiki Lounge" shipped a `<title>` reading
 * "Fong's Pizza &amp; Tiki Lounge" to every crawler that reached this path.
 *
 * The two sinks need opposite things and that is the whole trap:
 *   ATTRIBUTES  lol-html does NOT escape what setAttribute is given, so the
 *               value must arrive escaped or a title containing a quote breaks
 *               out of the attribute.
 *   TEXT        chunk.replace() DOES escape, so the value must arrive raw.
 * Both directions are asserted in middleware-entity-shell.test.mjs.
 */
export type EntityShellRewrite =
  | { selector: string; setAttribute: string; to: string }
  | { selector: string; setText: string }
  | { selector: string; appendHtml: string }
  | { selector: string; setInnerHtml: string }
  | { selector: string; remove: true };

// The client adds noindex to an event 30 days after it starts
// (EnhancedEventSEO.tsx); the shell now says the same thing to a crawler that
// never runs the client. touch-a-truck-2026-05-22 was index,follow in September.
const LONG_PAST_MS = 30 * 24 * 60 * 60 * 1000;

export function isLongPastEvent(startDate: string | null | undefined, now: Date = new Date()): boolean {
  const t = startDate ? Date.parse(startDate) : NaN;
  return Number.isFinite(t) && now.getTime() - t > LONG_PAST_MS;
}

// Suburbs with an events hub in App.tsx. An event in one links to it.
const EVENT_SUBURB_HUBS = new Set([
  "altoona", "ankeny", "clive", "johnston", "urbandale", "west-des-moines", "windsor-heights",
]);

/**
 * Format an event's start in Central time. A bare `date` ("2026-09-24") is a
 * calendar day, not an instant; formatting it in Chicago would land on the day
 * before, so it is formatted as UTC.
 */
function formatEventDay(when: string, opts: Intl.DateTimeFormatOptions): string {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(when);
  try {
    return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: dateOnly ? "UTC" : "America/Chicago" }).format(
      new Date(dateOnly ? `${when}T12:00:00Z` : when),
    );
  } catch {
    return "";
  }
}

/** "{title} - {Wed, Sep 24} | {venue}", dropping the venue past 60 characters. */
export function eventShellTitle(row: Record<string, any>): string {
  const title = String(row.title || "").trim();
  const when = row.event_start_utc || row.date;
  const day = when ? formatEventDay(when, { weekday: "short", month: "short", day: "numeric" }) : "";
  const base = day ? `${title} - ${day}` : title;
  const venue = String(row.venue || "").trim();
  const withVenue = venue ? `${base} | ${venue}` : base;
  return withVenue.length <= 60 ? withVenue : base;
}

function clipText(s: string | null | undefined, n: number): string {
  const t = (s || "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), n / 2))}...`;
}

function linkList(links: Array<[string, string]>): string {
  return `<ul>${links.map(([href, label]) => `<li><a href="${href}">${escapeHtml(label)}</a></li>`).join("")}</ul>`;
}

function breadcrumb(hubHref: string, hubLabel: string, name: string): string {
  return `<nav aria-label="Breadcrumb"><a href="/">Home</a> / <a href="${hubHref}">${hubLabel}</a> / <span>${escapeHtml(name)}</span></nav>`;
}

/**
 * Hours are published only for a place you can walk into today. A closed row
 * keeps its last-known hours in `opening`, and an announced one often carries
 * the hours it plans to keep; neither is a schedule a visitor can use.
 */
function showsHours(row: Record<string, any>): boolean {
  return row.status !== "closed" && row.status !== "opening_soon" && row.status !== "announced";
}

export function restaurantShellNode(row: Record<string, any>, pageUrl: string): Record<string, unknown> {
  const addr = parseIowaAddress(row.location);
  const hours = showsHours(row) ? resolveOpeningHoursSpecification(null, row.opening) : null;
  // Scraped text, not links we built: only http(s) reaches the node.
  const website = safeHttpUrl(row.website);
  const menu = safeHttpUrl(row.menu_url);
  return {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    "@id": pageUrl,
    url: pageUrl,
    name: row.name,
    description: restaurantMetaDescription(row as RestaurantMetaInput),
    ...(row.cuisine ? { servesCuisine: row.cuisine } : {}),
    address: {
      "@type": "PostalAddress",
      streetAddress: addr?.streetAddress || row.location || undefined,
      addressLocality: restaurantLocality(row) || "Des Moines",
      addressRegion: "IA",
      ...(addr?.postalCode ? { postalCode: addr.postalCode } : {}),
      addressCountry: "US",
    },
    ...(row.phone ? { telephone: row.phone } : {}),
    ...(row.price_range ? { priceRange: row.price_range } : {}),
    ...(row.latitude != null && row.longitude != null
      ? { geo: { "@type": "GeoCoordinates", latitude: row.latitude, longitude: row.longitude } }
      : {}),
    ...(hours ? { openingHoursSpecification: hours } : {}),
    ...(website ? { sameAs: [website] } : {}),
    ...(menu ? { hasMenu: menu } : {}),
  };
}

export function restaurantShellBody(row: Record<string, any>): string {
  const loc = restaurantLocality(row) || "Des Moines";
  const kind = row.cuisine ? `${row.cuisine} restaurant` : "Restaurant";
  const facts: string[] = [];
  const closed = row.status === "closed";
  // A javascript: or relative value renders no link at all, the same answer
  // the React page gives (reservations.safeWebUrl delegates to safeHttpUrl).
  const menu = safeHttpUrl(row.menu_url);
  const website = safeHttpUrl(row.website);
  if (row.location) facts.push(`<li>Address: ${escapeHtml(row.location)}</li>`);
  if (row.phone) facts.push(`<li>Phone: <a href="tel:${escapeHtml(String(row.phone).replace(/[^\d+]/g, ""))}">${escapeHtml(row.phone)}</a></li>`);
  if (row.price_range) facts.push(`<li>Price: ${escapeHtml(row.price_range)}</li>`);
  if (row.opening && showsHours(row)) facts.push(`<li>Hours: ${escapeHtml(row.opening)}</li>`);
  if (menu) facts.push(`<li><a href="${escapeHtml(menu)}" rel="nofollow noopener">Menu</a></li>`);
  if (website) facts.push(`<li><a href="${escapeHtml(website)}" rel="nofollow noopener">Website</a></li>`);
  // Pre-opening copy is left out rather than repeated to a crawler as current.
  const about = [row.description, row.seo_description].find((d) => d && !isStaleOpeningCopy(d));
  return [
    "<article>",
    breadcrumb("/restaurants", "Restaurants", row.name),
    `<h1>${escapeHtml(row.name)}</h1>`,
    // The React page's badge says "Permanently closed"; so does the shell.
    closed ? "<p><strong>Permanently closed.</strong></p>" : "",
    `<p>${escapeHtml(kind)} in ${escapeHtml(loc)}, Iowa.</p>`,
    facts.length ? `<ul>${facts.join("")}</ul>` : "",
    about ? `<p>${escapeHtml(clipText(about, 1200))}</p>` : "",
    "<h2>More places to eat</h2>",
    linkList([
      ["/restaurants", "All Des Moines restaurants"],
      ["/restaurants/open-now", "Restaurants open now"],
      ["/restaurants/new", "New restaurants in Des Moines"],
    ]),
    "</article>",
  ].join("");
}

export function eventShellNode(row: Record<string, any>, pageUrl: string): Record<string, unknown> {
  const addr = parseIowaAddress(row.location);
  const place = String(row.venue || row.location || "").trim();
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    "@id": pageUrl,
    url: pageUrl,
    name: row.title,
    ...(row.seo_description || row.geo_summary ? { description: truncate(row.seo_description || row.geo_summary) } : {}),
    ...(row.event_start_utc || row.date ? { startDate: row.event_start_utc || row.date } : {}),
    ...(row.end_date ? { endDate: row.end_date } : {}),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    ...(place
      ? {
          location: {
            "@type": "Place",
            name: place,
            address: {
              "@type": "PostalAddress",
              streetAddress: addr?.streetAddress || row.location || place,
              addressLocality: addr?.addressLocality || row.city || "Des Moines",
              addressRegion: "IA",
              ...(addr?.postalCode ? { postalCode: addr.postalCode } : {}),
              addressCountry: "US",
            },
          },
        }
      : {}),
  };
}

export function eventShellBody(row: Record<string, any>, now: Date = new Date()): string {
  const when = row.event_start_utc || row.date;
  const whenText = when
    ? formatEventDay(when, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        ...(row.event_start_utc ? { hour: "numeric", minute: "2-digit" } : {}),
      })
    : "";
  const where = [row.venue, row.location].filter(Boolean).join(", ");
  const about = row.enhanced_description || row.original_description || row.geo_summary || row.seo_description;
  const locality = parseIowaAddress(row.location)?.addressLocality || row.city || "";
  const suburbSlug = slugify(locality);
  const past = when ? Date.parse(when) < now.getTime() - 24 * 60 * 60 * 1000 : false;

  const links: Array<[string, string]> = [
    ["/events/today", "Things to do in Des Moines today"],
    ["/events/this-weekend", "Des Moines events this weekend"],
    ["/events", "All Des Moines events"],
  ];
  if (EVENT_SUBURB_HUBS.has(suburbSlug)) links.unshift([`/events/${suburbSlug}`, `Events in ${locality}`]);

  return [
    "<article>",
    breadcrumb("/events", "Events", row.title),
    `<h1>${escapeHtml(row.title)}</h1>`,
    past ? "<p><strong>This event has ended.</strong> Upcoming events are listed below.</p>" : "",
    "<ul>",
    whenText ? `<li>When: ${escapeHtml(whenText)}</li>` : "",
    where ? `<li>Where: ${escapeHtml(where)}</li>` : "",
    row.price ? `<li>Price: ${escapeHtml(String(row.price))}</li>` : "",
    "</ul>",
    about ? `<p>${escapeHtml(clipText(about, 1200))}</p>` : "",
    "<h2>More to do in Des Moines</h2>",
    linkList(links),
    "</article>",
  ].join("");
}

function genericShellBody(type: string, entity: { title: string; description?: string }): string {
  const HUB: Record<string, [string, string]> = {
    attraction: ["/attractions", "Attractions"],
    article: ["/articles", "Articles"],
    playground: ["/playgrounds", "Playgrounds"],
    hotel: ["/stay", "Hotels"],
  };
  const [href, label] = HUB[type] || ["/", "Des Moines Insider"];
  return [
    "<article>",
    breadcrumb(href, label, entity.title),
    `<h1>${escapeHtml(entity.title)}</h1>`,
    entity.description ? `<p>${escapeHtml(entity.description)}</p>` : "",
    linkList([[href, `More ${label.toLowerCase()} in Des Moines`]]),
    "</article>",
  ].join("");
}

export function entityShellRewrites(opts: {
  pageUrl: string;
  sbBase: string;
  type: string;
  entity: { id: string; title: string; description?: string; startDate?: string; row?: Record<string, any> };
  now?: Date;
}): EntityShellRewrite[] {
  const { pageUrl, sbBase, type, now = new Date() } = opts;
  const row = opts.entity.row;

  // With the full row, restaurants and events get the same title and
  // description the React page renders (restaurantMeta.ts), not the bare name.
  let entity = opts.entity;
  if (row && type === "restaurant" && row.name) {
    entity = { ...entity, title: `${restaurantPageTitle(row as RestaurantMetaInput)} | Des Moines Insider`, description: restaurantMetaDescription(row as RestaurantMetaInput) };
  } else if (row && type === "event" && row.title) {
    // With neither seo_description nor geo_summary the homepage's description
    // would stay in place; say when and where instead.
    const when = row.event_start_utc || row.date;
    const day = when ? formatEventDay(when, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "";
    const place = [row.venue, row.city || "Des Moines"].filter(Boolean).join(", ");
    const fallback = `${row.title}${day ? ` on ${day}` : ""} at ${place}, Iowa. Times, tickets, directions and more things to do in Des Moines.`;
    entity = { ...entity, title: eventShellTitle(row), description: entity.description || truncate(fallback, 155) };
  }

  const ogImage = `${sbBase}/functions/v1/og-image/${type}/${entity.id}`;
  // Escaped for the attribute sinks; the text sink below takes the raw value.
  const title = escapeHtml(entity.title);
  const desc = escapeHtml(entity.description ?? "");

  const SCHEMA_TYPE: Record<string, string> = {
    event: "Event",
    restaurant: "Restaurant",
    attraction: "TouristAttraction",
    article: "Article",
    playground: "Place",
    hotel: "Hotel",
  };
  const OG_TYPE: Record<string, string> = { event: "article", article: "article" };

  let node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": SCHEMA_TYPE[type] || "Thing",
    "@id": pageUrl,
    name: entity.title,
    url: pageUrl,
  };
  if (entity.description) node.description = entity.description;
  // Only what the row actually carries. An Event with a fabricated startDate is
  // worse than an Event without one.
  if (type === "event" && entity.startDate) node.startDate = entity.startDate;

  let body = genericShellBody(type, opts.entity);
  if (row && type === "restaurant" && row.name) {
    node = restaurantShellNode(row, pageUrl);
    body = restaurantShellBody(row);
  } else if (row && type === "event" && row.title) {
    node = eventShellNode(row, pageUrl);
    body = eventShellBody(row, now);
  }

  const rules: EntityShellRewrite[] = [
    // The shell's ld+json is the HOMEPAGE's: FAQPage about Des Moines Insider,
    // LocalBusiness, the home ItemLists. At an entity URL every one of those is
    // a claim about the wrong page, and Google read it as that page's markup.
    // Removed before the entity's own node is appended; lol-html does not run
    // handlers over content a handler inserted, so the new node survives.
    { selector: 'script[type="application/ld+json"]', remove: true },
    // The body was the homepage's too: its H1 ("What's Happening in Des
    // Moines") and ~15k characters of homepage copy at an event URL. The header
    // and footer navigation sit outside <main> and are kept.
    { selector: "main#main-content", setInnerHtml: body },
    { selector: 'link[rel="canonical"]', setAttribute: "href", to: pageUrl },
    { selector: 'meta[property="og:url"]', setAttribute: "content", to: pageUrl },
    { selector: 'meta[property="og:type"]', setAttribute: "content", to: OG_TYPE[type] || "website" },
    { selector: 'meta[property="og:image"]', setAttribute: "content", to: ogImage },
    // There WAS a rule here for og:image:secure_url and it had never fired:
    // nothing in this codebase emits that tag - not SEOHead, which owns the
    // head on the shell this rewrites, not index.html, not any other component.
    // A rewrite targeting a tag that is never rendered is a statement of
    // intent, not a behaviour. og:image already carries the https URL, which is
    // what secure_url was for back when og:image could be http.
    // middleware-shell-selectors.test.mjs stops the next one being added.
    { selector: 'meta[name="twitter:image"]', setAttribute: "content", to: ogImage },
    { selector: "head", appendHtml: jsonLdScript(node) },
  ];

  if (type === "event" && isLongPastEvent(entity.startDate, now)) {
    rules.push({ selector: 'meta[name="robots"]', setAttribute: "content", to: "noindex, follow" });
  }
  const restaurantRobots = type === "restaurant" ? restaurantShellRobots(row) : null;
  if (restaurantRobots) {
    rules.push({ selector: 'meta[name="robots"]', setAttribute: "content", to: restaurantRobots });
  }

  if (entity.title) {
    rules.push(
      // RAW, not escaped: this is a text sink. See the header.
      { selector: "title", setText: entity.title },
      { selector: 'meta[property="og:title"]', setAttribute: "content", to: title },
      { selector: 'meta[name="twitter:title"]', setAttribute: "content", to: title },
    );
  }
  if (entity.description) {
    rules.push(
      { selector: 'meta[name="description"]', setAttribute: "content", to: desc },
      { selector: 'meta[property="og:description"]', setAttribute: "content", to: desc },
      { selector: 'meta[name="twitter:description"]', setAttribute: "content", to: desc },
    );
  }
  return rules;
}

/**
 * The shell, wearing the entity's identity (WEB-SEO-020 AC4, WEB-SEO-030 AC3).
 *
 * This is what a URL gets when it resolves but missed the prerender budget. The
 * branch this replaces set og:type to "website" for everything except articles
 * and removed every ld+json block, so an event page announced itself as a
 * generic website with no structured data. Here the og:type follows the segment
 * and a real Event or Restaurant node is injected.
 */
function entityShell(
  shell: Response,
  opts: { pageUrl: string; sbBase: string; type: string; entity: Resolved },
): Response {
  let rewriter = new HTMLRewriter();
  for (const rule of entityShellRewrites(opts)) {
    if ("appendHtml" in rule) {
      rewriter = rewriter.on(rule.selector, new HtmlAppender(rule.appendHtml));
    } else if ("setInnerHtml" in rule) {
      rewriter = rewriter.on(rule.selector, new InnerHtmlSetter(rule.setInnerHtml));
    } else if ("remove" in rule) {
      rewriter = rewriter.on(rule.selector, new Remover());
    } else if ("setText" in rule) {
      rewriter = rewriter.on(rule.selector, new TextReplacer(rule.setText));
    } else {
      rewriter = rewriter.on(rule.selector, new AttrSetter(rule.setAttribute, rule.to));
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "public, max-age=600",
  };
  // The header, not only the meta tag: the prerendered homepage carries a
  // robots meta, but a shell built without one would otherwise say nothing.
  if (opts.type === "event" && isLongPastEvent(opts.entity.startDate)) headers["X-Robots-Tag"] = "noindex";
  const restaurantRobots = opts.type === "restaurant" ? restaurantShellRobots(opts.entity.row) : null;
  if (restaurantRobots) headers["X-Robots-Tag"] = restaurantRobots;

  return new Response(rewriter.transform(shell).body, { status: 200, headers });
}

/**
 * The JSON-LD block, with `<` escaped so a title containing `</script>` cannot
 * end the block early and inject markup.
 */
export function jsonLdScript(node: Record<string, unknown>): string {
  return `<script type="application/ld+json">${JSON.stringify(node).replace(/</g, "\\u003c")}</script>`;
}

class HtmlAppender {
  constructor(private html: string) {}
  element(el: any) {
    el.append(this.html, { html: true });
  }
}

class InnerHtmlSetter {
  constructor(private html: string) {}
  element(el: any) {
    el.setInnerContent(this.html, { html: true });
  }
}

class TextReplacer {
  private done = false;
  constructor(private value: string) {}
  text(chunk: any) {
    chunk.replace(this.done ? "" : this.value);
    this.done = true;
  }
}

export function isHomepageShell(html: string, origin: string): boolean {
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i)?.[0];
  if (!canonical) return false;
  const href = canonical.match(/href=["']([^"']+)["']/i)?.[1];
  return href === `${origin}/` || href === origin;
}

/**
 * What the self-canonical rewrite does, as data (WEB-SEO-006).
 *
 * SPLIT OUT SO IT CAN BE TESTED, and now tested BOTH WAYS.
 * middleware-canonical.test.mjs covers the GATE that decides whether to
 * rewrite, and these rules as data;
 * middleware-self-canonical-rewrite.test.mjs runs them through
 * html-rewriter-wasm - a WebAssembly build of cloudflare/lol-html, the parser
 * Cloudflare's HTMLRewriter is built on - so the half that produces the output
 * is exercised too. It had never been, and this fix has already been dead once:
 * it was gated on a 404 that single-page-app mode never returns, and nothing
 * noticed for months.
 *
 * What can regress here is not lol-html's parsing, which is Cloudflare's to get
 * right. It is the three decisions below: which elements, which attribute on
 * each, and that the value is the REQUESTED url rather than the origin. All
 * three have a negative control in that suite; broadening the ld+json selector
 * to `script` fails it on the application's own module script, which is the
 * mistake that would blank every page.
 *
 * THE LD+JSON REMOVAL IS NOT TIDINESS. The shell being served here is the
 * homepage, so its JSON-LD describes the homepage - an Organization, a
 * WebSite, the home ItemLists. Left in place at an entity URL it is
 * structured data that contradicts the page, which is worse than none.
 */
export type SelfCanonicalRewrite =
  | { selector: string; set: string; to: string }
  | { selector: string; remove: true };

export function selfCanonicalRewrites(pageUrl: string): SelfCanonicalRewrite[] {
  return [
    { selector: 'link[rel="canonical"]', set: "href", to: pageUrl },
    { selector: 'meta[property="og:url"]', set: "content", to: pageUrl },
    { selector: 'script[type="application/ld+json"]', remove: true },
  ];
}

function withSelfCanonical(shell: Response, pageUrl: string): Response {
  let rewriter = new HTMLRewriter();
  for (const rule of selfCanonicalRewrites(pageUrl)) {
    rewriter =
      "remove" in rule
        ? rewriter.on(rule.selector, new Remover())
        : rewriter.on(rule.selector, new AttrSetter(rule.set, rule.to));
  }
  const rewritten = rewriter.transform(shell);

  return new Response(rewritten.body, {
    status: shell.status,
    headers: shell.headers,
  });
}

/**
 * SEO-004: the absolute URL a trailing-slash request should 301 to, or null if
 * the request is already canonical.
 *
 * Exported so it can be tested; the redirect itself is one line in onRequest.
 *
 * Returns null for "/" - the one trailing slash on the site that is not a
 * duplicate - and preserves the query string and fragment, because a 301 that
 * drops them loses the filter or the UTM tag that brought the visitor, which
 * would cost more traffic than the duplication it fixes.
 */
export function trailingSlashRedirect(url: URL): string | null {
  const pathname = url.pathname;
  if (pathname.length <= 1 || !pathname.endsWith("/")) return null;
  const target = new URL(url.toString());
  const stripped = pathname.replace(/\/+$/, "");
  // A path of only slashes strips to "", which serialises to a URL with no path
  // that a browser resolves straight back to "/" - a redirect loop. Treat it as
  // already canonical instead.
  if (stripped === "") return null;
  target.pathname = stripped;
  return target.toString();
}

export async function onRequest(context: EventContext) {
  const url = new URL(context.request.url);
  const pathname = url.pathname;

  // Serve static assets directly.
  if (
    pathname.startsWith("/assets/") ||
    pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|json|xml|txt)$/)
  ) {
    return context.next();
  }

  // SEO-004: one URL per page. A trailing slash 301s to the unslashed form.
  //
  // Measured 2026-08-28: /restaurants and /restaurants/ were BOTH indexed and
  // both returned 200 - 20,789 impressions at position 24.4 against 5,401 at
  // 25.1, which is the same page competing with itself. /events, /playgrounds,
  // /stay and /events/date-night had the same split.
  //
  // The canonical tag was already right (the slashed form points at the
  // unslashed one), and it was already working in the sense that Google will
  // consolidate eventually. Eventually is the problem: this is splitting
  // impressions across our WORST-performing pages, the hubs, right now.
  //
  // Unslashed is the convention because that is what every canonical on the
  // site already declares. Picking the other direction would have meant
  // rewriting every canonical instead of adding one redirect.
  //
  // THIS RUNS AFTER THE ASSET BYPASS ON PURPOSE. A blanket /*/ rule in
  // public/_redirects would also catch asset paths and directory-style requests
  // that Pages resolves itself, and _redirects cannot express "except assets".
  // Here the exclusion is already computed one block up.
  //
  // The root is excluded because "/" IS the canonical homepage - the one
  // trailing slash on the site that is not a duplicate. Query strings and
  // fragments are preserved, or a 301 would silently drop a filter or a UTM tag
  // and the redirect would lose the very traffic it is meant to consolidate.
  // DISABLED - this 301 took the whole site down. Do not re-enable it on its
  // own; it cannot work while prerender writes directory-style output.
  //
  // scripts/prerender.mjs:744 writes dist/<route>/index.html, so Cloudflare
  // Pages treats /events as a directory and issues its OWN 308 to /events/
  // before any of our code runs. This line then 301s the slash back off. The
  // two redirects point at each other:
  //
  //   GET /events   -> 308 Location: /events/                        (Pages)
  //   GET /events/  -> 301 Location: https://.../events              (here)
  //
  // Measured in production 2026-08-29: 50 redirects and ERR_TOO_MANY_REDIRECTS
  // on /events, /restaurants, /attractions, /events/today, /playgrounds,
  // /articles, /guides and entity pages, for Googlebot and for mobile Safari.
  // Only "/" survived, because trailingSlashRedirect returns null for it - the
  // same guard that made this look safe.
  //
  // The unit test could not catch it. It tests a pure function against URLs we
  // hand it, and Pages' normalization is not in the code at all; it is implied
  // by the SHAPE OF THE BUILD OUTPUT. Any future attempt needs an assertion
  // against a deployed URL, not another case in that file.
  //
  // SEO-021 did that: scripts/prerender.mjs now writes dist/<route>.html, so
  // Pages serves /events directly and 308s /events/ -> /events by itself. This
  // redirect is now REDUNDANT rather than merely disabled, and re-enabling it
  // would put our 301 in front of a Pages 308 that already points the same way.
  // Leave it off.
  //
  // trailingSlashRedirect stays exported because it still documents the mapping
  // the site follows, and functions/__tests__/middleware-trailing-slash.test.mjs
  // still asserts it. What that test CANNOT assert is the thing that decides:
  // Pages normalizes from the shape of the build output, which is not in this
  // file. scripts/check-canonical-url-shape.mjs is the check that can.
  void trailingSlashRedirect;

  // For all other routes, return index.html (SPA routing).
  const response = await context.next();

  // WEB-SEO-006, second half. withSelfCanonical was gated on a 404 and so has
  // never run: this project ships public/_routes.json with include ["/*"] and
  // Pages is in single-page-app mode, which serves the fallback at 200. Every
  // unmatched route therefore returned the homepage with status 200, the 404
  // branch was dead code, and the 884 URLs the comment above describes kept
  // claiming to be the homepage. Verified against production 2026-08-27:
  // /events/rodney-carrington-2026-11-05 returns 200, canonical
  // "https://desmoinesinsider.com/", and six homepage ld+json blocks.
  //
  // Status is the wrong thing to key on. The defect is "homepage HTML served at
  // a URL that is not the homepage", so test for that instead. It is exact, and
  // it stops applying by itself once PRERENDER_ENTITIES puts a real page at the
  // path: a prerendered entity page carries its own canonical, fails the check
  // and passes through untouched with its JSON-LD intact.
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/html") && pathname !== "/" && !pathname.includes(".")) {
    try {
      const html = await response.text();
      const pageUrl = `${url.origin}${pathname}`;
      const passthrough = () =>
        new Response(html, { status: response.status, headers: response.headers });

      // WEB-SEO-020 AC2. A page that is not the homepage shell is a real
      // prerendered page: it already carries its own canonical, og:* and
      // JSON-LD. Return it untouched. The branch this replaces fetched "/" and
      // removed every ld+json block, so it destroyed exactly the markup the
      // prerender pass had just produced.
      if (!isHomepageShell(html, url.origin)) return passthrough();

      // From here the asset IS the homepage shell served at another path.
      const segments = pathname.split("/").filter(Boolean);
      const type = segments.length === 2 ? OG_TYPE_BY_SEGMENT[segments[0]] : undefined;
      const slug = segments[1];
      const isDetail = !!type && !!slug && !(type === "event" && MONTH_YEAR.test(slug));

      if (isDetail) {
        const env = context.env as Record<string, string | undefined>;
        const sbBase = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
        const sbAnon = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;

        if (sbBase && sbAnon) {
          const outcome = await resolveEntityCached(context, sbBase, sbAnon, type!, slug);
          const plan = detailResponsePlan(outcome, type!, slug, url.origin);

          // A merged duplicate goes to its survivor, and a restaurant asked
          // for by id goes to its slug, as the React page does client-side.
          if (plan.action === "redirect") {
            return new Response(null, {
              status: plan.status,
              headers: { Location: plan.location, "Cache-Control": plan.cacheControl },
            });
          }

          // The lookup failed, so nothing is known about this page. Serve the
          // shell as itself, 200 and uncached, rather than a 404 with noindex
          // that a crawler would act on.
          if (plan.action === "unavailable") {
            const rewritten = withSelfCanonical(passthrough(), pageUrl);
            const headers = new Headers(rewritten.headers);
            headers.set("Cache-Control", plan.cacheControl);
            return new Response(rewritten.body, { status: plan.status, headers });
          }

          // WEB-SEO-030: a dead slug is a 404 and a long-finished event is a
          // 410. Both used to answer 200 with a self-canonical, which under
          // include ["/*"] made every one of them an indexable duplicate of the
          // homepage.
          if (plan.action === "missing") {
            const rewritten = new HTMLRewriter()
              .on('link[rel="canonical"]', new AttrSetter("href", pageUrl))
              .on('meta[name="robots"]', new AttrSetter("content", "noindex, follow"))
              .transform(passthrough());
            return new Response(rewritten.body, {
              status: plan.status,
              headers: {
                "Content-Type": "text/html; charset=utf-8",
                "X-Robots-Tag": "noindex",
                "Cache-Control": plan.cacheControl,
              },
            });
          }

          // Resolved, but it missed the prerender budget. Keep the 200 and give
          // it its own identity instead of the homepage's (WEB-SEO-030 AC3).
          return entityShell(passthrough(), { pageUrl, sbBase, type: type!, entity: plan.entity });
        }
      }

      // Any other shell-at-a-non-root-path: unchanged behaviour.
      return withSelfCanonical(passthrough(), pageUrl);
    } catch {
      // Never fail the page for a meta rewrite. Worst case is the previous
      // behaviour, which is what shipped for months.
      return response;
    }
  }

  return response;
}
