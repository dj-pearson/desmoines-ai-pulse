/**
 * The facts an attraction page states next to its <h1> (SEO-046): today's
 * hours, admission, parking, and where those came from.
 *
 * Search Console, 3 months to 2026-09-30: /attractions drew 1 click at
 * position 30+. The queries are "<place> hours", "<place> admission",
 * "<place> parking"; every row had those columns and every one was empty.
 * SEO-046 filled them from each attraction's own site and recorded the pages
 * in attractions.fact_sources, with the fetch date in facts_verified_at.
 *
 * Same rules as the restaurant block (restaurantAtAGlance.ts):
 *   - PHRASED BY SCHEDULE. "Open 10 AM to 4 PM on Thursdays" stays true after
 *     the prerender freezes the page; "Open now" would not.
 *   - NEVER GUESSED. A day the season leaves out, or a date no season covers,
 *     gives null and the row is hidden.
 *   - "Checked <date>" is facts_verified_at, not updated_at, which moves on
 *     any write to the row.
 */
import { attractionDayHours, type HoursSeason } from "@/lib/attractionHours";
import { desMoinesNow, formatClockLabel } from "@/lib/restaurantHours";
import { safeHttpUrl } from "@/lib/safeUrl";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const MINUTES_PER_DAY = 24 * 60;

/**
 * Today's line from the structured hours, or null:
 *   "Open 10 AM to 4 PM on Thursdays"
 *   "Open 24 hours on Thursdays"
 *   "Closed on Mondays"
 * `now` picks the day and the season, in Central time.
 */
export function attractionHoursSentence(hours: unknown, now: Date = new Date()): string | null {
  const day = desMoinesNow(now).getDay();
  const plural = `${DAY_NAMES[day]}s`;
  const d = attractionDayHours(hours, day, now);
  if (d.kind === "missing") return null;
  if (d.kind === "closed") return `Closed on ${plural}`;
  if (d.openMinute === 0 && (d.closeMinute === MINUTES_PER_DAY || d.closeMinute === 0)) {
    return `Open 24 hours on ${plural}`;
  }
  return `Open ${formatClockLabel(d.openMinute)} to ${formatClockLabel(d.closeMinute)} on ${plural}`;
}

/** "October 1, 2026" from "2026-10-01", or null. Read as a calendar date, so no time zone can move it. */
export function calendarDateLabel(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const d = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** "September 30 to November 12, 2026" for a dated season, or null for an open-ended one. */
export function seasonLabel(season: HoursSeason | null): string | null {
  const vf = season?.validFrom ?? null;
  const vt = season?.validThrough ?? null;
  const from = calendarDateLabel(vf);
  const through = calendarDateLabel(vt);
  if (from && through && vf && vt) {
    const sameYear = vf.slice(0, 4) === vt.slice(0, 4);
    return `${sameYear ? from.replace(/, \d{4}$/, "") : from} to ${through}`;
  }
  if (from) return `From ${from}`;
  if (through) return `Until ${through}`;
  return null;
}

export type FactField = "hours" | "admission" | "parking" | "is_free";

export interface FactSource {
  url: string;
  fields: FactField[];
}

const FACT_FIELDS = new Set<string>(["hours", "admission", "parking", "is_free"]);

/** attractions.fact_sources as stored, keeping only entries with an http(s) URL. */
export function parseFactSources(value: unknown): FactSource[] {
  if (!Array.isArray(value)) return [];
  const out: FactSource[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const url = safeHttpUrl((item as { url?: unknown }).url);
    if (!url) continue;
    const rawFields = (item as { fields?: unknown }).fields;
    const fields = Array.isArray(rawFields)
      ? rawFields.filter((f): f is FactField => typeof f === "string" && FACT_FIELDS.has(f))
      : [];
    out.push({ url, fields });
  }
  return out;
}

export interface FactSite {
  /** "blankparkzoo.com" */
  host: string;
  /** The first page read on that site. */
  url: string;
}

/** One entry per site, in stored order: two pages on sciowa.org print as one "sciowa.org". */
export function factSourceSites(sources: FactSource[]): FactSite[] {
  const seen = new Map<string, FactSite>();
  for (const s of sources) {
    let host: string;
    try {
      host = new URL(s.url).hostname.replace(/^www\./, "");
    } catch {
      continue;
    }
    if (!seen.has(host)) seen.set(host, { host, url: s.url });
  }
  return [...seen.values()];
}

/** The columns the verified-facts helpers read. */
export interface AttractionFactRow {
  is_free?: boolean | null;
  fact_sources?: unknown;
  facts_verified_at?: string | null;
}

/**
 * True when free admission was read from a source page, not merely set. The
 * /attractions callout lists only these: is_free is editable in the admin
 * with no source, and "free" is the claim a family drives across town on.
 */
export function isVerifiedFree(row: AttractionFactRow): boolean {
  if (row.is_free !== true || !row.facts_verified_at) return false;
  return parseFactSources(row.fact_sources).some((s) => s.fields.includes("is_free"));
}

export interface HubFactRow extends AttractionFactRow {
  name: string;
}

export interface HubFactsSummary {
  /** Rows with at least one fact read from a source page. */
  checkedCount: number;
  /** Verified-free rows, one per place, by name. */
  free: HubFactRow[];
  /** The latest facts_verified_at, as "October 1, 2026". */
  checkedLabel: string | null;
}

/**
 * What the /attractions intro and free-admission list say, from the verified
 * columns only. Two rows that share their exact source pages are one place
 * listed twice (the table holds both "Pappajohn Sculpture Park" and "John and
 * Mary Pappajohn Sculpture Park"), so the list names it once: the first by
 * name.
 */
export function hubFactsSummary(rows: HubFactRow[]): HubFactsSummary {
  const checked = rows.filter((r) => r.facts_verified_at && parseFactSources(r.fact_sources).length > 0);
  const seen = new Set<string>();
  const free: HubFactRow[] = [];
  for (const row of [...checked].sort((a, b) => a.name.localeCompare(b.name))) {
    if (!isVerifiedFree(row)) continue;
    const key = parseFactSources(row.fact_sources)
      .map((s) => s.url)
      .join(" ");
    if (seen.has(key)) continue;
    seen.add(key);
    free.push(row);
  }
  const latest = checked.reduce<string | null>((max, r) => {
    const d = r.facts_verified_at ?? null;
    return d && (!max || d > max) ? d : max;
  }, null);
  return { checkedCount: checked.length, free, checkedLabel: calendarDateLabel(latest) };
}
