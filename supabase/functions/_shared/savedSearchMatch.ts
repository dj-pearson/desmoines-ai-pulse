/**
 * What a saved search matches, and what its alert email links to
 * (docs/page-plans/search.md WP5).
 *
 * The nightly saved-search-alerts job used to match a saved search with one
 * substring of the title and ignore most of what the visitor saved:
 * - `location` is an area slug ("west-des-moines", "downtown") and was
 *   substring-matched against location text, so no city area ever matched a
 *   row and the coordinate areas could not match at all;
 * - iOS rows store the words under `query`, not `q`, so they matched every
 *   new event;
 * - `preset`, `from` and `to` were ignored, so a "this weekend" search mailed
 *   next month's events;
 * - every item linked to the bare /events list.
 *
 * Each rule below follows the /events hub (src/components/events/
 * eventsHubQuery.ts), so the email shows what the page would. The area table
 * is a port of src/lib/eventAreas.ts; savedSearchMatch.test.ts reads that file
 * and fails if the slugs drift.
 *
 * Pure: no env, no network. The job passes in the site URL and the clock.
 */
import { centralWallClockToUtc, CENTRAL_TZ } from "./centralTime.ts";
import { escapeHtml, escapeHtmlAttr } from "./escapeHtml.ts";

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

/** The events columns the job selects. Every one exists in scripts/db-snapshot.json. */
export interface AlertEvent {
  id: string;
  title: string;
  date: string | null;
  end_date?: string | null;
  event_start_utc?: string | null;
  category: string | null;
  location: string | null;
  venue?: string | null;
  city: string | null;
  price: string | null;
  latitude?: number | null;
  longitude?: number | null;
  original_description?: string | null;
  enhanced_description?: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Areas: a port of src/lib/eventAreas.ts
// ---------------------------------------------------------------------------

export interface GeoBBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export type EventArea =
  | { slug: string; label: string; kind: "city"; city: string; locationFallback?: boolean }
  | { slug: string; label: string; kind: "bbox"; bbox: GeoBBox };

export const EVENT_AREAS: readonly EventArea[] = [
  { slug: "des-moines", label: "Des Moines", kind: "city", city: "Des Moines" },
  { slug: "west-des-moines", label: "West Des Moines", kind: "city", city: "West Des Moines", locationFallback: true },
  { slug: "ankeny", label: "Ankeny", kind: "city", city: "Ankeny", locationFallback: true },
  { slug: "urbandale", label: "Urbandale", kind: "city", city: "Urbandale", locationFallback: true },
  { slug: "clive", label: "Clive", kind: "city", city: "Clive", locationFallback: true },
  { slug: "johnston", label: "Johnston", kind: "city", city: "Johnston", locationFallback: true },
  { slug: "altoona", label: "Altoona", kind: "city", city: "Altoona", locationFallback: true },
  { slug: "windsor-heights", label: "Windsor Heights", kind: "city", city: "Windsor Heights", locationFallback: true },
  { slug: "waukee", label: "Waukee", kind: "city", city: "Waukee", locationFallback: true },
  {
    slug: "downtown",
    label: "Downtown / Court Ave",
    kind: "bbox",
    bbox: { south: 41.579, west: -93.6425, north: 41.596, east: -93.617 },
  },
  {
    slug: "east-village",
    label: "East Village",
    kind: "bbox",
    bbox: { south: 41.583, west: -93.617, north: 41.596, east: -93.6 },
  },
  {
    slug: "valley-junction",
    label: "Valley Junction",
    kind: "bbox",
    bbox: { south: 41.568, west: -93.718, north: 41.576, east: -93.704 },
  },
  {
    slug: "ingersoll",
    label: "Ingersoll",
    kind: "bbox",
    bbox: { south: 41.579, west: -93.673, north: 41.5875, east: -93.645 },
  },
];

export function findEventArea(slug: string | null | undefined): EventArea | undefined {
  if (!slug) return undefined;
  return EVENT_AREAS.find((area) => area.slug === slug);
}

function isInBBox(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  bbox: GeoBBox,
): boolean {
  if (typeof latitude !== "number" || typeof longitude !== "number") return false;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  return latitude >= bbox.south && latitude <= bbox.north &&
    longitude >= bbox.west && longitude <= bbox.east;
}

/** Same three location endings as locationPatterns in src/lib/eventAreas.ts. */
function locationEndsInCity(location: string | null | undefined, city: string): boolean {
  const value = (location ?? "").toLowerCase();
  const c = city.toLowerCase();
  return value.endsWith(`, ${c}`) || value.includes(`, ${c}, ia`) || value.includes(`, ${c}, iowa`);
}

/**
 * A city area is events.city exactly (case aside); a suburb also takes a row
 * whose city is null and whose location ends in the suburb, as the web's
 * eventInArea does. A bbox needs coordinates.
 */
export function eventInArea(
  event: {
    city?: string | null;
    location?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  },
  area: EventArea,
): boolean {
  if (area.kind === "city") {
    if ((event.city ?? "").trim().toLowerCase() === area.city.toLowerCase()) return true;
    if (!area.locationFallback || event.city != null) return false;
    return locationEndsInCity(event.location, area.city);
  }
  return isInBBox(event.latitude, event.longitude, area.bbox);
}

// ---------------------------------------------------------------------------
// Reading a saved row
// ---------------------------------------------------------------------------

/** Placeholder values the /events controls use for "no filter". */
const UNSET_VALUES = new Set(["", "all", "any-location", "any-price", "any"]);

function str(filters: Record<string, unknown>, key: string): string {
  const v = filters[key];
  if (typeof v !== "string") return "";
  const t = v.trim().replace(/\s+/g, " ");
  return UNSET_VALUES.has(t.toLowerCase()) ? "" : t;
}

/** The keys a saved search carries, whichever client wrote it. */
export interface SavedSearchCriteria {
  q: string;
  category: string;
  /** Area slug as saved; kept for the deep link even when it isn't a known area. */
  location: string;
  price: string;
  preset: string;
  from: string;
  to: string;
  sort: string;
}

/**
 * Normalize `saved_searches.filters`. The web writes `q`; iOS writes `query`
 * (ios/.../SavedSearchService.swift); /events also accepts `search` in the
 * URL. `location` is the key the web writes and `area` is its URL alias.
 * `filters` that is null, a string or an array reads as no filters.
 */
export function readSavedSearch(filters: unknown): SavedSearchCriteria {
  const f = filters && typeof filters === "object" && !Array.isArray(filters)
    ? filters as Record<string, unknown>
    : {};
  return {
    q: str(f, "q") || str(f, "query") || str(f, "search"),
    category: str(f, "category"),
    location: str(f, "location") || str(f, "area"),
    price: str(f, "price"),
    preset: str(f, "preset"),
    from: str(f, "from"),
    to: str(f, "to"),
    sort: str(f, "sort"),
  };
}

// ---------------------------------------------------------------------------
// Central-time dates (mirrors centralWindow() in src/lib/timezone.ts)
// ---------------------------------------------------------------------------

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const CENTRAL_DAY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: CENTRAL_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The Central calendar day (yyyy-MM-dd) an instant falls on. */
export function centralDayOf(instant: Date): string {
  return CENTRAL_DAY_FORMAT.format(instant);
}

function addDays(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekdayOf(day: string): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}

function validDay(value: string): string | null {
  if (!DAY_RE.test(value)) return null;
  return Number.isNaN(new Date(`${value}T12:00:00Z`).getTime()) ? null : value;
}

/** UTC ms at which a Central calendar day begins. */
function centralDayStartMs(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  const start = centralWallClockToUtc(y, m, d, 0, 0, 0);
  return start ? start.getTime() : NaN;
}

export interface DateWindow {
  /** First UTC ms of the window, inclusive. */
  start: number;
  /** Last UTC ms of the window, inclusive. */
  end: number;
}

function daysWindow(from: string, to: string): DateWindow {
  const [first, last] = from <= to ? [from, to] : [to, from];
  return { start: centralDayStartMs(first), end: centralDayStartMs(addDays(last, 1)) - 1 };
}

const PRESET_ALIASES: Record<string, string> = { next_7_days: "next-7-days" };

/**
 * The date window a saved search asks for, or null for "upcoming". Same
 * rules as resolveHubDate(): a known `preset` wins, else `from` (and an
 * optional `to`), and anything unparseable is no date filter, never an error.
 */
export function savedSearchWindow(
  criteria: Pick<SavedSearchCriteria, "preset" | "from" | "to">,
  now: Date,
): DateWindow | null {
  const today = centralDayOf(now);
  const weekday = weekdayOf(today);
  const preset = PRESET_ALIASES[criteria.preset] ?? criteria.preset;
  switch (preset) {
    case "today":
      return daysWindow(today, today);
    case "tomorrow":
      return daysWindow(addDays(today, 1), addDays(today, 1));
    case "this-weekend": {
      // Friday through Sunday; on Fri, Sat or Sun it is the weekend in progress.
      const friday = addDays(today, weekday === 0 ? -2 : 5 - weekday);
      return daysWindow(friday, addDays(friday, 2));
    }
    case "this-week":
      return daysWindow(today, addDays(today, weekday === 0 ? 0 : 7 - weekday));
    case "next-week": {
      const monday = addDays(today, weekday === 0 ? 1 : 8 - weekday);
      return daysWindow(monday, addDays(monday, 6));
    }
    case "next-7-days":
      return daysWindow(today, addDays(today, 6));
  }
  const from = validDay(criteria.from);
  if (!from) return null;
  const to = validDay(criteria.to);
  return daysWindow(from, to ?? from);
}

/** Start of today in Central, as a UTC ISO instant: the hub's "upcoming" floor. */
export function upcomingFloorIso(now: Date): string {
  return new Date(centralDayStartMs(centralDayOf(now))).toISOString();
}

function timeOf(value: string | null | undefined): number {
  if (!value) return NaN;
  return new Date(value).getTime();
}

/** "Upcoming" as the hub means it: started today in Central, or still running. */
export function isUpcoming(ev: Pick<AlertEvent, "date" | "end_date">, now: Date): boolean {
  const start = timeOf(ev.date);
  if (!Number.isNaN(start) && start >= centralDayStartMs(centralDayOf(now))) return true;
  const end = timeOf(ev.end_date);
  return !Number.isNaN(end) && end >= now.getTime();
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/** Words websearch_to_tsquery drops with the english config, plus its OR operator. */
const STOPWORDS = new Set(["a", "an", "and", "the", "of", "in", "on", "at", "to", "for", "or", "with"]);

export interface QueryTokens {
  required: string[];
  excluded: string[];
}

/**
 * Split a saved query the way the hub's websearch treats it: every word is
 * required, `-word` excludes, quotes group nothing extra here.
 */
export function queryTokens(q: string): QueryTokens {
  const required: string[] = [];
  const excluded: string[] = [];
  for (const raw of q.toLowerCase().replace(/["]/g, " ").split(/\s+/)) {
    const negated = raw.startsWith("-") && raw.length > 1;
    const word = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (!word || STOPWORDS.has(word)) continue;
    (negated ? excluded : required).push(word);
  }
  return { required, excluded };
}

function haystack(ev: AlertEvent): string {
  return [
    ev.title,
    ev.venue,
    ev.location,
    ev.city,
    ev.enhanced_description,
    ev.original_description,
  ].filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(" \n ")
    .toLowerCase();
}

/**
 * Mirrors isFreePrice() in src/lib/eventPrice.ts: no price is NOT free, and
 * text that names a nonzero amount ("$25; kids under 5 free") is not free
 * either (events-pass2 WP2 item 3).
 */
export function isFreePrice(price: string | null | undefined): boolean {
  const text = (price ?? "").trim();
  if (!text) return false;
  if (/free/i.test(text)) return !/\$ *[1-9]/.test(text);
  return /^\$?0(\.0+)?$/.test(text);
}

/**
 * Does this event belong in the saved search's alert? Each clause is the
 * /events hub's: category is exact (case aside), area is the eventAreas rule,
 * price=free is isFreePrice, the date is the preset or from/to window in
 * Central, and with no window the event must be upcoming. An area slug the
 * hub doesn't know is no area filter, which is what the page does with it.
 */
export function matchesSavedSearch(ev: AlertEvent, filters: unknown, now: Date): boolean {
  const c = readSavedSearch(filters);

  if (c.category && (ev.category ?? "").toLowerCase() !== c.category.toLowerCase()) return false;

  const area = findEventArea(c.location);
  if (area && !eventInArea(ev, area)) return false;

  if (c.price.toLowerCase() === "free" && !isFreePrice(ev.price)) return false;

  const window = savedSearchWindow(c, now);
  if (window) {
    const start = timeOf(ev.date);
    if (Number.isNaN(start) || start < window.start || start > window.end) return false;
  } else if (!isUpcoming(ev, now)) {
    return false;
  }

  if (c.q) {
    const { required, excluded } = queryTokens(c.q);
    const hay = haystack(ev);
    if (!required.every((t) => hay.includes(t))) return false;
    if (excluded.some((t) => hay.includes(t))) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Windows and delivery bookkeeping
// ---------------------------------------------------------------------------

export const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MAX_WINDOW_MS = 7 * DEFAULT_WINDOW_MS;

/**
 * The created_at floor for one search: its last run, but never more than 7
 * days back, so a search that failed for a month doesn't mail a month of
 * events. A search that has never run looks back one day.
 */
export function alertWindowStart(lastAlertedAt: string | null, now: Date): number {
  const nowMs = now.getTime();
  const last = timeOf(lastAlertedAt);
  if (Number.isNaN(last) || last > nowMs) return nowMs - DEFAULT_WINDOW_MS;
  return Math.max(last, nowMs - MAX_WINDOW_MS);
}

/** Distinct events across a user's matched searches: the subject-line count. */
export function uniqueEventCount(groups: readonly { events: readonly { id: string }[] }[]): number {
  const ids = new Set<string>();
  for (const g of groups) for (const ev of g.events) ids.add(ev.id);
  return ids.size;
}

/**
 * What happened to one user's digest. `skipped` means nothing was attempted on
 * purpose (no email on file, alerts turned off); only `failed` holds a search's
 * window open for the next night.
 */
export type DeliveryOutcome = "sent" | "failed" | "skipped";

/** Run one send and classify it. A non-2xx response and a throw both fail. */
export async function deliverDigest(
  send: () => Promise<Response>,
  onFailure?: (detail: string) => void,
): Promise<DeliveryOutcome> {
  try {
    const res = await send();
    if (res.ok) return "sent";
    // Drain the body so the connection is released.
    await res.body?.cancel();
    onFailure?.(`status ${res.status}`);
    return "failed";
  } catch (err) {
    onFailure?.(err instanceof Error ? err.message : String(err));
    return "failed";
  }
}

/**
 * Which searches may advance last_alerted_at. A search with no matches always
 * advances; one with matches advances unless its owner's send failed, so a
 * failed night is retried rather than marked delivered.
 */
export function searchIdsToAdvance(
  searches: readonly { id: string; user_id: string }[],
  matchedSearchIds: ReadonlySet<string>,
  outcomes: ReadonlyMap<string, DeliveryOutcome>,
): string[] {
  return searches
    .filter((s) => !matchedSearchIds.has(s.id) || outcomes.get(s.user_id) !== "failed")
    .map((s) => s.id);
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

const UTM = { utm_source: "saved-search", utm_medium: "email" } as const;

function withUtm(params: URLSearchParams): URLSearchParams {
  for (const [k, v] of Object.entries(UTM)) params.set(k, v);
  return params;
}

/** The /events URL for a saved search, with the keys the hub reads. */
export function deepLink(filters: unknown, siteUrl: string): string {
  const c = readSavedSearch(filters);
  const params = new URLSearchParams();
  const pairs: [string, string][] = [
    ["q", c.q],
    ["category", c.category],
    ["location", c.location],
    ["price", c.price],
    ["preset", c.preset],
    ["from", c.preset ? "" : c.from],
    ["to", c.preset ? "" : c.to],
    ["sort", c.sort],
  ];
  for (const [k, v] of pairs) if (v) params.set(k, v);
  withUtm(params);
  return `${siteUrl}/events?${params.toString()}`;
}

/**
 * The event's own page. A port of createEventSlugWithCentralTime(): the title
 * slug plus the Central date of event_start_utc, else date. With no title or
 * no date there is no resolvable slug, so the link is /events/<id>, which
 * useEventBySlug looks up by id.
 */
export function eventPath(ev: Pick<AlertEvent, "id" | "title" | "date" | "event_start_utc">): string {
  const titleSlug = (ev.title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const source = ev.event_start_utc || ev.date;
  let day: string | null = null;
  if (source) {
    if (DAY_RE.test(source)) {
      day = source;
    } else {
      const t = new Date(source);
      if (!Number.isNaN(t.getTime())) day = centralDayOf(t);
    }
  }
  if (!titleSlug || !day) return `/events/${encodeURIComponent(ev.id)}`;
  return `/events/${titleSlug}-${day}`;
}

export function eventLink(
  ev: Pick<AlertEvent, "id" | "title" | "date" | "event_start_utc">,
  siteUrl: string,
): string {
  return `${siteUrl}${eventPath(ev)}?${withUtm(new URLSearchParams()).toString()}`;
}

// ---------------------------------------------------------------------------
// Email body
// ---------------------------------------------------------------------------

export interface AlertGroup {
  name: string;
  link: string;
  events: AlertEvent[];
}

function fmtDate(date: string | null): string {
  if (!date) return "";
  const t = new Date(date);
  if (Number.isNaN(t.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL_TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(t);
}

/** The digest body. renderEmail() wraps it with the footer and unsubscribe. */
export function buildEmail(groups: readonly AlertGroup[], siteUrl: string): { html: string; text: string } {
  const sections = groups
    .map((g) => {
      const items = g.events
        .map((ev) => {
          const when = fmtDate(ev.date);
          const where = ev.venue || ev.location;
          const meta = [when, where].filter(Boolean).join(" - ");
          return `<tr><td style="padding:8px 0;border-bottom:1px solid #eee;">
            <a href="${escapeHtmlAttr(eventLink(ev, siteUrl))}" style="color:#1a1a1a;font-weight:600;text-decoration:none;">${escapeHtml(ev.title)}</a>
            ${meta ? `<div style="color:#666;font-size:13px;">${escapeHtml(meta)}</div>` : ""}
          </td></tr>`;
        })
        .join("");
      return `<div style="margin:0 0 24px;">
        <h3 style="margin:0 0 8px;font-size:16px;">${escapeHtml(g.name)}</h3>
        <table style="width:100%;border-collapse:collapse;">${items}</table>
        <a href="${escapeHtmlAttr(g.link)}" style="display:inline-block;margin-top:10px;color:#2563eb;text-decoration:none;font-weight:600;">See every match on Des Moines Insider</a>
      </div>`;
    })
    .join("");

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
    <h2 style="margin:0 0 16px;">New events matching your saved searches</h2>
    <p style="color:#444;margin:0 0 24px;">These were added since your last alert.</p>
    ${sections}
    <p style="color:#888;font-size:13px;margin-top:24px;">Change or turn off these alerts in your
      <a href="${escapeHtmlAttr(`${siteUrl}/dashboard?tab=saved-searches`)}" style="color:#2563eb;">dashboard</a>.</p>
  </div>`;

  const textLines: string[] = ["New events matching your saved searches", ""];
  for (const g of groups) {
    textLines.push(`== ${g.name} ==`);
    for (const ev of g.events) {
      const when = fmtDate(ev.date);
      textLines.push(`- ${ev.title}${when ? ` (${when})` : ""}`, `  ${eventLink(ev, siteUrl)}`);
    }
    textLines.push(`See every match: ${g.link}`, "");
  }
  textLines.push(`Change or turn off these alerts: ${siteUrl}/dashboard?tab=saved-searches`);
  return { html, text: textLines.join("\n") };
}
