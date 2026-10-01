/**
 * SEO-035: the weekly "This Weekend in Des Moines: {dates}" article.
 *
 * Pure functions only, so the same code runs in three places:
 *   - scripts/publish-weekend-article.ts (the Thursday GitHub Action and the
 *     manual run that published the first one),
 *   - src/pages/EventsThisWeekend.tsx (only WEEKEND_ARTICLE_SLUG_PREFIX, to
 *     link the hub to the latest article),
 *   - src/lib/__tests__/weekendArticle.test.ts.
 * No supabase client, no logger, no import.meta - tsx runs this outside Vite.
 *
 * EVERY SENTENCE IN THE ARTICLE IS A TEMPLATE FILLED FROM ROW FIELDS. Titles,
 * venues, prices and categories are copied from the events row; nothing is
 * summarised or described. original_description / enhanced_description /
 * ai_writeup are deliberately never read, because the brief is "no invented
 * descriptions" and those columns are where generated copy lives.
 *
 * WHICH DAY AN EVENT IS ON. The site's answer everywhere is the America/Chicago
 * date of event_start_utc (falling back to `date`): that is what the event's
 * slug encodes (createEventSlugWithCentralTime), what /events/this-weekend
 * filters on and what the generated events.event_local_date column holds. The
 * article uses the same rule so every link it prints resolves, and so the
 * article and the hub agree on what "this weekend" contains.
 *
 * WHETHER IT HAS A TIME, AND WHICH DAYS IT RUNS: src/lib/eventTime.ts, shared
 * with the hubs (SEO-055). time_tbd or the 19:31:58 marker means no time is
 * printed. A row whose end_date is on a later Central day runs over several
 * days; one that overlaps the weekend is listed under "Running this weekend"
 * with its end date, rather than dropped because it started on a Thursday
 * (which is how Ringling Bros. and Pumpkin Fest fell out of the first article).
 */
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import {
  EVENT_TIMEZONE,
  eventCentralDate,
  eventCentralEndDate,
  eventOverlapsDays,
  eventStartInstant,
  hasStatedStartTime,
} from "./eventTime";

export const WEEKEND_TIMEZONE = EVENT_TIMEZONE;

/** Every weekend article's slug starts with this; the hub finds the latest by it. */
export const WEEKEND_ARTICLE_SLUG_PREFIX = "this-weekend-in-des-moines-";

export interface WeekendEventRow {
  id: string;
  title: string;
  date: string | null;
  event_start_utc?: string | null;
  event_start_local?: string | null;
  time_tbd?: boolean | null;
  end_date?: string | null;
  venue?: string | null;
  location?: string | null;
  city?: string | null;
  category?: string | null;
  price?: string | null;
  is_featured?: boolean | null;
  is_hidden?: boolean | null;
  is_merged?: boolean | null;
  archived_at?: string | null;
  popularity_score?: number | null;
}

export interface WeekendWindow {
  /** YYYY-MM-DD, America/Chicago. */
  friday: string;
  saturday: string;
  sunday: string;
  /** Friday 00:00 Central, as a UTC instant. */
  startUtc: string;
  /** Monday 00:00 Central, as a UTC instant. Exclusive. */
  endUtc: string;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The Friday-Sunday this weekend article covers, in Central time.
 *
 * Monday through Thursday it is the coming weekend; Friday through Sunday it is
 * the weekend in progress. That matches EventsThisWeekend's offsetToFriday, so
 * the hub and the article never disagree about which weekend is "this" one.
 * Midnight is computed with fromZonedTime, so a DST change on the Sunday (the
 * first Sunday of November) still gives a correct Monday 00:00 bound.
 */
export function weekendWindow(now: Date): WeekendWindow {
  const today = formatInTimeZone(now, WEEKEND_TIMEZONE, "yyyy-MM-dd");
  // ISO day of week: 1 = Monday ... 7 = Sunday.
  const isoDow = Number(formatInTimeZone(now, WEEKEND_TIMEZONE, "i"));
  const offsetToFriday = 5 - isoDow; // Mon +4 ... Thu +1, Fri 0, Sat -1, Sun -2
  const friday = addDays(today, offsetToFriday);
  const saturday = addDays(friday, 1);
  const sunday = addDays(friday, 2);
  const monday = addDays(friday, 3);
  return {
    friday,
    saturday,
    sunday,
    startUtc: fromZonedTime(`${friday}T00:00:00`, WEEKEND_TIMEZONE).toISOString(),
    endUtc: fromZonedTime(`${monday}T00:00:00`, WEEKEND_TIMEZONE).toISOString(),
  };
}

const startInstant = eventStartInstant;

/** The Central-time calendar date the site files this event under. */
export const eventLocalDate: (e: WeekendEventRow) => string | null = eventCentralDate;

/**
 * Same visibility predicates as useEvents / useEventBySlug / the sitemap
 * generator (.neq is_merged, .neq is_hidden), plus archived_at, which
 * agent-link-monitor sets when it unpublishes an event. An event the detail
 * page would 404 on must never be linked from the article.
 */
export function isPublicEvent(e: WeekendEventRow): boolean {
  return e.is_hidden !== true && e.is_merged !== true && !e.archived_at;
}

/** Same output as createEventSlugWithCentralTime and scripts/lib/sitemapSlugs. */
export function eventSlug(e: WeekendEventRow): string {
  const titleSlug = e.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const local = eventLocalDate(e);
  return local ? `${titleSlug}-${local}` : titleSlug;
}

/** True only when the row carries a start time we would stand behind (eventTime.ts). */
export const hasRealStartTime: (e: WeekendEventRow) => boolean = hasStatedStartTime;

const VIRTUAL_RE = /\b(virtual|zoom|online|livestream)\b/i;

/** Listings that are not a place in Des Moines to go to this weekend. */
export function isVirtual(e: WeekendEventRow): boolean {
  return VIRTUAL_RE.test(`${e.venue ?? ""} ${e.location ?? ""}`);
}

/**
 * Weekly regulars. Kept out of the picks and the day lists so the article is
 * about this weekend rather than every weekend; the article states the count
 * and points to the hub, which lists them.
 */
const ROUTINE_RE =
  /\b(trivia|open mic|happy hour|lunch special|walk-in|paint class(es)?|karaoke|bingo|meet & play|open play|every (mon|tues|wednes|thurs|fri|satur|sun)day)\b/i;

export function isRoutine(e: WeekendEventRow): boolean {
  return ROUTINE_RE.test(e.title);
}

/**
 * Venues whose shows are ticketed and draw from the whole metro. This list is
 * the "ticketed / major venue" half of the selection rule; it is a judgement,
 * and it is written down here so it can be argued with.
 */
export const MAJOR_VENUE_RE =
  /(wells fargo arena|casey'?s center|iowa events center|hy-?vee hall|hoyt sherman|vibrant music hall|civic center|des moines performing arts|temple theater|stoner theater|val air|stephens auditorium|hilton coliseum|jack trice|midamerican energy field|drake stadium|knapp center|principal park|living history farms|blank park zoo|iowa state fairgrounds|des moines art center|science center of iowa|community playhouse|wooly'?s|xbk|prairie meadows|water works park|court avenue district|botanical garden)/i;

export function isMajorVenue(e: WeekendEventRow): boolean {
  return MAJOR_VENUE_RE.test(`${e.venue ?? ""} ${e.location ?? ""}`);
}

const FESTIVAL_FAMILY_RE = /^(festival|family)$/i;

/**
 * The selection rule, in order:
 *   0. is_featured (an editor's flag on the row),
 *   1. at a major ticketed venue (MAJOR_VENUE_RE),
 *   2. category Festival or Family,
 *   3. everything else.
 * Lower is better. Ties break on popularity_score (higher first), then start
 * time, then title, so the output is deterministic for a given set of rows.
 */
export function pickTier(e: WeekendEventRow): 0 | 1 | 2 | 3 {
  if (e.is_featured) return 0;
  if (isMajorVenue(e)) return 1;
  if (FESTIVAL_FAMILY_RE.test((e.category ?? "").trim())) return 2;
  return 3;
}

/** Plain code-unit order. localeCompare is ICU collation, which sorts "~" before digits. */
function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareForPicks(a: WeekendEventRow, b: WeekendEventRow): number {
  return (
    pickTier(a) - pickTier(b) ||
    (b.popularity_score ?? 0) - (a.popularity_score ?? 0) ||
    cmp(startInstant(a) ?? "", startInstant(b) ?? "") ||
    cmp(a.title, b.title)
  );
}

function compareByStart(a: WeekendEventRow, b: WeekendEventRow): number {
  // Rows with a real time sort by it; date-only rows go after them on that day.
  const at = hasRealStartTime(a) ? startInstant(a) ?? "" : "~";
  const bt = hasRealStartTime(b) ? startInstant(b) ?? "" : "~";
  return cmp(at, bt) || cmp(a.title.toLowerCase(), b.title.toLowerCase());
}

/**
 * The part of a title that names the event, for duplicate detection: the
 * crawler stores "Clint Black" and "Clint Black: Back On The Blacktop Tour" as
 * two rows, and "Ringling Bros. and Barnum & Bailey presents ..." three times.
 */
export function titleKey(title: string): string {
  const head = title.split(/\s+[-\u2013\u2014|@]\s+|:\s|\s+(?:with|featuring|feat\.|presents?)\s+/i)[0];
  return head
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Of two listings of one show, keep the better tier, then the one with a start time. */
function compareForDedupe(a: WeekendEventRow, b: WeekendEventRow): number {
  return (
    pickTier(a) - pickTier(b) ||
    Number(hasRealStartTime(b)) - Number(hasRealStartTime(a)) ||
    compareForPicks(a, b)
  );
}

/**
 * One row per (title key, Central date). The kept row is the one the picks
 * rule likes best, so a featured or major-venue duplicate wins over a bare one.
 */
export function dedupeEvents(events: WeekendEventRow[]): WeekendEventRow[] {
  const best = new Map<string, WeekendEventRow>();
  for (const e of events) {
    const key = `${titleKey(e.title)}|${eventLocalDate(e)}`;
    const prev = best.get(key);
    if (!prev || compareForDedupe(e, prev) < 0) best.set(key, e);
  }
  return [...best.values()];
}

const FREE_RE = /^\s*(free|\$?0(\.00)?)\s*$/i;

/** Free only when the row's price says so outright. "Free for kids" is not free. */
export function isFree(e: WeekendEventRow): boolean {
  return FREE_RE.test(e.price ?? "");
}

export interface PickOptions {
  /** How many top picks. */
  count?: number;
  /** At most this many picks from one venue. */
  perVenue?: number;
  /** At most this many picks from one category. */
  perCategory?: number;
}

export function pickTopEvents(events: WeekendEventRow[], opts: PickOptions = {}): WeekendEventRow[] {
  const { count = 8, perVenue = 1, perCategory = 3 } = opts;
  const venueCount = new Map<string, number>();
  const categoryCount = new Map<string, number>();
  const picks: WeekendEventRow[] = [];
  const eligible = events.filter((e) => !isRoutine(e) && !isVirtual(e)).sort(compareForPicks);
  for (const e of eligible) {
    if (picks.length >= count) break;
    const v = (e.venue || e.location || "").toLowerCase().trim();
    const c = (e.category || "").toLowerCase().trim();
    if (v && (venueCount.get(v) ?? 0) >= perVenue) continue;
    if (c && (categoryCount.get(c) ?? 0) >= perCategory) continue;
    picks.push(e);
    if (v) venueCount.set(v, (venueCount.get(v) ?? 0) + 1);
    if (c) categoryCount.set(c, (categoryCount.get(c) ?? 0) + 1);
  }
  return picks;
}

/**
 * Rows the public site would show that are on at any point Friday-Sunday, one
 * per event: single-day events dated in the window, and multi-day runs
 * (end_date on a later Central day) that overlap it.
 */
export function selectWeekendEvents(rows: WeekendEventRow[], w: WeekendWindow): WeekendEventRow[] {
  return dedupeEvents(rows.filter((e) => isPublicEvent(e) && eventOverlapsDays(e, w.friday, w.sunday)));
}

/** A multi-day run that is on this weekend, listed once rather than under one day. */
export function isWeekendRun(e: WeekendEventRow): boolean {
  return eventCentralEndDate(e) !== null;
}

// ---------------------------------------------------------------- formatting

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function parts(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return { y, m, d, month: MONTHS[m - 1] };
}

/** "October 2-4, 2026", "October 30 - November 1, 2026", "December 31, 2027 - January 2, 2028". */
export function formatWeekendRange(w: WeekendWindow): string {
  const f = parts(w.friday);
  const s = parts(w.sunday);
  if (f.y !== s.y) return `${f.month} ${f.d}, ${f.y} - ${s.month} ${s.d}, ${s.y}`;
  if (f.m !== s.m) return `${f.month} ${f.d} - ${s.month} ${s.d}, ${s.y}`;
  return `${f.month} ${f.d}-${s.d}, ${f.y}`;
}

/** this-weekend-in-des-moines-october-2-4-2026 */
export function weekendArticleSlug(w: WeekendWindow): string {
  return (
    WEEKEND_ARTICLE_SLUG_PREFIX +
    formatWeekendRange(w)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
  );
}

function dayHeading(isoDate: string): string {
  return formatInTimeZone(fromZonedTime(`${isoDate}T12:00:00`, WEEKEND_TIMEZONE), WEEKEND_TIMEZONE, "EEEE, MMMM d");
}

/** Strip characters that would change the meaning of the surrounding markdown. */
function md(text: string): string {
  return text.replace(/\s+/g, " ").replace(/([\\`*_[\]<>|#])/g, "\\$1").trim();
}

function placeOf(e: WeekendEventRow): string | null {
  const v = (e.venue || "").trim();
  if (v && !/^see website$/i.test(v)) return v;
  const l = (e.location || "").trim();
  if (l && !/^see website$/i.test(l)) return l;
  return null;
}

function priceOf(e: WeekendEventRow): string | null {
  const p = (e.price || "").trim();
  if (!p || /^see website$/i.test(p)) return null;
  return p;
}

function shortDay(isoDate: string): string {
  return formatInTimeZone(fromZonedTime(`${isoDate}T12:00:00`, WEEKEND_TIMEZONE), WEEKEND_TIMEZONE, "MMMM d");
}

function whenOf(e: WeekendEventRow, withDay: boolean): string {
  const end = eventCentralEndDate(e);
  if (end) {
    // A run: its dates, never a time - one start time does not describe a run.
    return `${shortDay(eventLocalDate(e) ?? "")} - ${shortDay(end)}`;
  }
  const s = startInstant(e);
  const day = withDay ? dayHeading(eventLocalDate(e) ?? "") : "";
  if (!s || !hasRealStartTime(e)) return day;
  const time = formatInTimeZone(new Date(s), WEEKEND_TIMEZONE, "h:mm a")
    .replace(":00 ", " ")
    .replace("AM", "am")
    .replace("PM", "pm");
  return withDay ? `${day}, ${time}` : time;
}

function eventLine(e: WeekendEventRow, withDay: boolean): string {
  const bits = [whenOf(e, withDay), placeOf(e) && md(placeOf(e) as string), priceOf(e) && md(priceOf(e) as string)].filter(
    Boolean,
  );
  const link = `[${md(e.title)}](/events/${eventSlug(e)})`;
  return bits.length ? `${link} - ${bits.join(" - ")}` : link;
}

function monthHubPath(w: WeekendWindow): string {
  const f = parts(w.friday);
  return `/events/${f.month.toLowerCase()}-${f.y}`;
}

export interface WeekendArticle {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  category: string;
  tags: string[];
  seo_title: string;
  seo_description: string;
  seo_keywords: string[];
  word_count: number;
  counts: {
    total: number;
    listed: number;
    regulars: number;
    picks: number;
    free: number;
    runs: number;
    byDay: Record<string, number>;
  };
}

/** Same arithmetic as the sync_article_word_count trigger, which replica mode skips. */
export function wordCount(content: string): number {
  const t = content.trim();
  return t ? t.split(/\s+/).length : 0;
}

/**
 * The article. `rows` can be any superset of the weekend (the script fetches a
 * day either side); everything outside the window or hidden is dropped here.
 * `publishedOn` is the Central date the article goes out, for the dateline.
 */
export function buildWeekendArticle(rows: WeekendEventRow[], w: WeekendWindow, publishedOn: string): WeekendArticle {
  const events = selectWeekendEvents(rows, w);
  const inPerson = events.filter((e) => !isVirtual(e));
  const regulars = inPerson.filter(isRoutine);
  const listed = inPerson.filter((e) => !isRoutine(e));
  const picks = pickTopEvents(events);
  const pickIds = new Set(picks.map((p) => p.id));
  const free = listed.filter(isFree).sort(compareByStart);
  const range = formatWeekendRange(w);
  const [fri, sat, sun] = [w.friday, w.saturday, w.sunday];

  const runs = listed.filter(isWeekendRun).sort(compareByStart);
  const byDay: Record<string, WeekendEventRow[]> = { [fri]: [], [sat]: [], [sun]: [] };
  for (const e of listed) if (!isWeekendRun(e)) byDay[eventLocalDate(e) as string]?.push(e);
  for (const d of Object.keys(byDay)) byDay[d].sort(compareByStart);

  const title = `This Weekend in Des Moines: ${range}`;
  const out: string[] = [];

  out.push(
    `**Published ${dayHeading(publishedOn)}, ${parts(publishedOn).y}.** This list is built from the ${events.length} events on the Des Moines Insider calendar for ${dayHeading(fri)} through ${dayHeading(sun)}. Times, prices and venues are copied from each event's listing; when a listing has no confirmed start time we leave it off. Plans change, so check the event page or the venue before you go.`,
    "",
    `For the live list, updated every day, see [events this weekend in Des Moines](/events/this-weekend).`,
    "",
    "## Top picks",
    "",
  );
  if (picks.length === 0) {
    out.push("No events on the calendar matched the picks rule this weekend. The full list is below.", "");
  } else {
    picks.forEach((e, i) => {
      const cat = e.category && !/^other$/i.test(e.category) ? ` (${md(e.category)})` : "";
      out.push(`${i + 1}. ${eventLine(e, true)}${cat}`);
    });
    out.push("");
  }

  out.push("## Free events", "");
  if (free.length === 0) {
    out.push(
      `No listing on our calendar for ${range} gives its price as free. Most list "See website", so a free event can still be hiding in the list below. Our [free events page](/events/free) has the ones we know about.`,
      "",
    );
  } else {
    for (const e of free) out.push(`- ${eventLine(e, true)}`);
    out.push("");
  }

  if (runs.length > 0) {
    out.push("## Running this weekend", "");
    for (const e of runs) out.push(`- ${eventLine(e, false)}${pickIds.has(e.id) ? " (top pick)" : ""}`);
    out.push("");
  }

  for (const d of [fri, sat, sun]) {
    out.push(`## ${dayHeading(d)}`, "");
    const list = byDay[d];
    if (list.length === 0) {
      out.push("Nothing on the calendar yet.", "");
      continue;
    }
    for (const e of list) out.push(`- ${eventLine(e, false)}${pickIds.has(e.id) ? " (top pick)" : ""}`);
    out.push("");
  }

  if (regulars.length > 0) {
    out.push(
      `Plus ${regulars.length} weekly ${regulars.length === 1 ? "regular" : "regulars"} (trivia nights, open mics, happy hours and the like), listed on the [this weekend page](/events/this-weekend).`,
      "",
    );
  }

  out.push(
    "## How we picked",
    "",
    "Top picks follow a fixed order: events an editor has marked featured, then shows at the metro's big ticketed venues (arenas, theaters, concert halls, stadiums, Living History Farms, the zoo), then festivals and family events, then everything else. Ties go to the more popular listing, then the earlier start. We take at most one pick per venue and three per category. Weekly regulars and online-only events are left out. When the same event is listed twice, it appears once.",
    "",
    "## More weekend plans",
    "",
    "- [Events this weekend in Des Moines](/events/this-weekend) (updated daily)",
    `- [${parts(w.friday).month} ${parts(w.friday).y} events in Des Moines](${monthHubPath(w)})`,
    "- [Free events in Des Moines](/events/free)",
    "- [Kids events in Des Moines](/events/kids)",
  );

  const content = out.join("\n");
  const lead = picks.slice(0, 3).map((p) => p.title.replace(/\s+/g, " ").trim());
  const leadText =
    lead.length === 0 ? "" : lead.length === 1 ? `, including ${lead[0]}` : `, including ${lead.slice(0, -1).join(", ")} and ${lead[lead.length - 1]}`;
  const shortRange = range.replace(/January|February|March|April|May|June|July|August|September|October|November|December/g, (m) =>
    m.length > 4 ? m.slice(0, 3) : m,
  );

  return {
    title,
    slug: weekendArticleSlug(w),
    excerpt: `${events.length} events on the Des Moines calendar for ${range}${leadText}. Top picks, free events and the full list by day.`,
    content,
    category: "Events",
    tags: ["this weekend", "weekend events", "des moines events", `${parts(w.friday).month.toLowerCase()} ${parts(w.friday).y}`],
    seo_title: `Things to Do in Des Moines This Weekend: ${shortRange}`,
    seo_description: `What's on in Des Moines ${range}: ${picks.length} top picks and ${listed.length} events by day, from the Des Moines Insider events calendar.`,
    seo_keywords: [
      "things to do in des moines this weekend",
      "des moines events this weekend",
      "des moines this weekend",
      "weekend events des moines",
      `des moines events ${parts(w.friday).month.toLowerCase()} ${parts(w.friday).y}`,
    ],
    word_count: wordCount(content),
    counts: {
      total: events.length,
      listed: listed.length,
      regulars: regulars.length,
      picks: picks.length,
      free: free.length,
      runs: runs.length,
      byDay: { [fri]: byDay[fri].length, [sat]: byDay[sat].length, [sun]: byDay[sun].length },
    },
  };
}
