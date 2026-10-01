/**
 * Which /events/<month>-<year> pages exist, which are indexable, and what the
 * page says about its month. One pure module so the page, the sitemap
 * generator and the tests cannot disagree.
 *
 * Two stories set these rules and they were merged here:
 *
 * docs/page-plans/events-pass2.md WP3 item 6 (range). The month route used to
 * answer any month in any year with a full page and rel=prev/next links, so a
 * crawler could walk from march-1998 to 2140 one empty page at a time:
 *
 *   - a month from last month to twelve months ahead is in range;
 *   - a month whose year is outside the range's years renders the not-found
 *     state; an out-of-range month in a range year renders noindex.
 *
 * SEO-033 (lead window). /events/october-2026 converts at 30.4% CTR from
 * position 3.1 and /events/november-2026 at 7.8%, the best-converting pages on
 * the site, and a page earns nothing until Google has crawled it. A floor of
 * MIN_EVENTS_PER_MONTH kept a month out until venues had announced enough
 * dates, which for December and January is late November. So:
 *
 *   - a month is indexable when it is in range AND either lists at least
 *     MIN_EVENTS_PER_MONTH events or starts within LEAD_WINDOW_DAYS;
 *   - the sitemap lists exactly the indexable months (selectSitemapMonths), so
 *     no sitemap entry points at a page that renders noindex.
 *
 * "Now" is read in Central. No imports on purpose: the sitemap script loads
 * this file under tsx, where the `@/` alias is not guaranteed.
 */

/** Fewer events than this and the month page is noindex and out of the sitemap, unless it is in the lead window. */
export const MIN_EVENTS_PER_MONTH = 3;

/** How far back and ahead a month page is in range, in months from the current one. */
export const MONTHS_BACK = 1;
export const MONTHS_AHEAD = 12;

export interface MonthRef {
  year: number;
  /** 1-12 */
  month: number;
}

export const MONTH_SLUGS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
] as const;

/** "august-2026" or "August-2026" -> { year: 2026, month: 8 }; null when unparseable. */
export function parseMonthSlug(slug: string | null | undefined): MonthRef | null {
  if (!slug) return null;
  const match = /^([a-z]+)-(\d{4})$/i.exec(slug);
  if (!match) return null;
  const index = (MONTH_SLUGS as readonly string[]).indexOf(match[1].toLowerCase());
  if (index < 0) return null;
  return { year: Number(match[2]), month: index + 1 };
}

export function monthSlug({ year, month }: MonthRef): string {
  return `${MONTH_SLUGS[month - 1]}-${year}`;
}

/** "September 2026" */
export function monthName({ year, month }: MonthRef): string {
  const name = MONTH_SLUGS[month - 1];
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

export function shiftMonth({ year, month }: MonthRef, delta: number): MonthRef {
  const zeroBased = year * 12 + (month - 1) + delta;
  return { year: Math.floor(zeroBased / 12), month: (((zeroBased % 12) + 12) % 12) + 1 };
}

function monthIndex({ year, month }: MonthRef): number {
  return year * 12 + (month - 1);
}

const CENTRAL_MONTH = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  year: "numeric",
  month: "numeric",
});

/** The Central calendar month `now` falls in. */
export function centralMonthOf(now: Date = new Date()): MonthRef {
  const parts = CENTRAL_MONTH.formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  return { year, month };
}

/** Last month through twelve months ahead, Central. */
export function isMonthInRange(target: MonthRef, now: Date = new Date()): boolean {
  const current = monthIndex(centralMonthOf(now));
  const index = monthIndex(target);
  return index >= current - MONTHS_BACK && index <= current + MONTHS_AHEAD;
}

/** Calendar months from `target` back to the current Central month; positive = past. */
export function monthsAgo(target: MonthRef, now: Date = new Date()): number {
  return monthIndex(centralMonthOf(now)) - monthIndex(target);
}

/**
 * How far ahead a month is published regardless of how many events it has
 * (SEO-033).
 *
 * The story asked for months "within 10 weeks", and also for December 2026 AND
 * January 2027 to be in the sitemap on 2026-09-30. Those two cannot both hold if
 * "within" is measured to the first of the month: 1 January is 93 days out. 98
 * days (14 weeks) is the smallest whole-week window that satisfies the explicit
 * criterion, and it gives each month roughly 13 weeks to be crawled before it
 * starts, which is the point of the story.
 */
export const LEAD_WINDOW_DAYS = 98;

/** Roughly Central midnight on the 1st: 06:00Z is 00:00 CST and 01:00 CDT. */
function firstDayInstant({ year, month }: MonthRef): number {
  return Date.UTC(year, month - 1, 1, 6);
}

/**
 * Every month from the current Central one through the last month whose first
 * day is within `leadDays` of `now`, as slugs.
 */
export function leadWindowMonths(now: Date = new Date(), leadDays = LEAD_WINDOW_DAYS): string[] {
  const horizon = now.getTime() + leadDays * 24 * 60 * 60 * 1000;
  const out: string[] = [];
  let ref = centralMonthOf(now);
  while (firstDayInstant(ref) <= horizon) {
    out.push(monthSlug(ref));
    ref = shiftMonth(ref, 1);
  }
  return out;
}

export function isInLeadWindow(target: MonthRef, now: Date = new Date(), leadDays = LEAD_WINDOW_DAYS): boolean {
  return leadWindowMonths(now, leadDays).includes(monthSlug(target));
}

/**
 * In range, and either at least MIN_EVENTS_PER_MONTH events or inside the lead
 * window. A month published ahead of its events carries the seasonal block and
 * month links, so it is not a bare heading over an empty grid.
 */
export function isIndexableMonth(target: MonthRef, count: number, now: Date = new Date()): boolean {
  if (!isMonthInRange(target, now)) return false;
  return count >= MIN_EVENTS_PER_MONTH || isInLeadWindow(target, now);
}

/**
 * Is the month's year one the range touches? A month in such a year renders
 * (noindex when outside the range); any other year is the not-found state.
 */
export function isYearInRange(year: number, now: Date = new Date()): boolean {
  const current = centralMonthOf(now);
  const first = shiftMonth(current, -MONTHS_BACK).year;
  const last = shiftMonth(current, MONTHS_AHEAD).year;
  return year >= first && year <= last;
}

export function isCurrentMonth(target: MonthRef, now: Date = new Date()): boolean {
  return monthIndex(target) === monthIndex(centralMonthOf(now));
}

export interface MonthTally {
  count: number;
  lastmod: string;
}

/**
 * Which month pages go in sitemap-events.xml: exactly the indexable ones.
 *
 * Lead-window months are added even with no events at all (they are absent
 * from `perMonth` then), stamped with `today` as lastmod and `forced: true`.
 * Returned sorted by slug so two runs over the same data write the same file.
 */
export function selectSitemapMonths(
  perMonth: Map<string, MonthTally>,
  now: Date,
  options: { today: string; leadDays?: number },
): Array<{ slug: string; lastmod: string; forced: boolean }> {
  const lead = new Set(leadWindowMonths(now, options.leadDays ?? LEAD_WINDOW_DAYS));
  const slugs = new Set([...perMonth.keys(), ...lead]);
  const out: Array<{ slug: string; lastmod: string; forced: boolean }> = [];
  for (const slug of slugs) {
    const ref = parseMonthSlug(slug);
    if (!ref || !isMonthInRange(ref, now)) continue;
    const tally = perMonth.get(slug);
    const meetsFloor = (tally?.count ?? 0) >= MIN_EVENTS_PER_MONTH;
    if (!meetsFloor && !lead.has(slug)) continue;
    out.push({ slug, lastmod: tally?.lastmod ?? options.today, forced: !meetsFloor });
  }
  return out.sort((a, b) => (a.slug < b.slug ? -1 : 1));
}

export interface SeasonalTheme {
  /** One or two sentences. Generic on purpose: no venue, date, hour or price. */
  intro: string;
  /** Matched against event titles in the month to pick "seasonal picks". */
  titlePattern: RegExp;
}

/**
 * Seasonal intros by month (1-12). Only months with a theme SEO-033 names get
 * one; every other month gets the data-driven line alone. Nothing here may name
 * a venue, a date or a price: those come from the events table or not at all.
 */
export const SEASONAL_THEMES: Partial<Record<number, SeasonalTheme>> = {
  10: {
    intro:
      "October in Des Moines is Halloween season: haunted houses, pumpkin patches, corn mazes and neighborhood trick-or-treating.",
    // Checked against October 2026 titles: "monster" caught Big Head Todd and
    // the Monsters and "witch" caught the band All Them Witches, so neither is here.
    titlePattern: /halloween|haunt|pumpkin|trick.or.|costume|spooky|zombie|fright/i,
  },
  11: {
    intro:
      "November brings Thanksgiving and the start of the holiday season, when the first holiday markets open and the light displays switch on.",
    titlePattern: /thanksgiving|turkey trot|holiday|christmas|santa|nutcracker|tree lighting/i,
  },
  12: {
    intro:
      "December in Des Moines means holiday lights, holiday markets and concerts, and New Year's Eve to close out the year.",
    // \bcarol(s|ing)?\b rather than "carol": game titles say "North Carolina".
    titlePattern: /holiday|christmas|santa|jingle|nutcracker|\bcarol(s|ing)?\b|new year|\bnye\b|hanukkah|kwanzaa|tree lighting/i,
  },
};

export interface SeasonalGuideLink {
  href: string;
  label: string;
}

/**
 * SEO-032, moved here by SEO-033. Articles a month page links to, keyed by the
 * month slug. Each href must be a row in public.articles with
 * status = 'published': a dead link here is a dead link on a landing page.
 *
 * Checked against production 2026-09-30. Published articles matching
 * Thanksgiving, holiday, Christmas, lights, market, New Year or winter: one,
 * des-moines-indoor-farmers-markets-2023-24-complete-winter-shopping-guide,
 * whose title is about the 2023-24 season and is not linked from a 2026 page.
 * November, December and January therefore carry no guide links until those
 * articles are written; the calendar picks in the block are their seasonal links.
 */
export const SEASONAL_GUIDES: Record<string, SeasonalGuideLink[]> = {
  "october-2026": [
    { href: "/articles/haunted-houses-near-des-moines", label: "Haunted houses near Des Moines" },
    {
      href: "/articles/best-pumpkin-patches-in-the-des-moines-area-your-complete-fall-guide",
      label: "Pumpkin patches and apple orchards",
    },
    { href: "/articles/corn-mazes-near-des-moines", label: "Corn mazes near Des Moines" },
  ],
};

export interface TitledEvent {
  title: string;
  category?: string | null;
}

/** Events in the month whose title matches the month's theme, in input order. `month` is 1-12. */
export function seasonalPicks<T extends TitledEvent>(events: T[], month: number, limit = 6): T[] {
  const theme = SEASONAL_THEMES[month];
  if (!theme) return [];
  return events.filter((e) => theme.titlePattern.test(e.title || "")).slice(0, limit);
}

/**
 * The data-driven sentence every month page carries: how many events are listed
 * and which categories hold the most of them. Built only from the rows passed.
 */
export function monthSummary(events: TitledEvent[], label: string, isPast = false): string {
  if (events.length === 0) {
    return isPast
      ? `No ${label} events are listed.`
      : `No ${label} events are listed yet. The calendar fills in as venues announce dates, so check back closer to the month.`;
  }
  const byCategory = new Map<string, number>();
  for (const e of events) {
    const c = (e.category || "").trim();
    // "Other" and "General" say nothing about the month, so they never lead.
    if (c && !/^(other|general)$/i.test(c)) byCategory.set(c, (byCategory.get(c) ?? 0) + 1);
  }
  const top = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, 3)
    .map(([c]) => c.toLowerCase());
  const noun = events.length === 1 ? "event" : "events";
  const lead = isPast
    ? `We listed ${events.length} ${noun} in Des Moines and the suburbs for ${label}`
    : `We list ${events.length} ${noun} in Des Moines and the suburbs for ${label} so far`;
  // A "busiest category" of one or two events is not a pattern worth stating.
  if (top.length === 0 || events.length < 3) return `${lead}.`;
  if (top.length === 1) return `${lead}. The busiest category is ${top[0]}.`;
  const list = `${top.slice(0, -1).join(", ")} and ${top[top.length - 1]}`;
  return `${lead}. The busiest categories are ${list}.`;
}
