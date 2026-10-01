/**
 * SEO-033. Rules for the /events/<month>-<year> index pages, in one pure module
 * so the page, the sitemap generator and the tests cannot disagree about them.
 *
 * No React, no date-fns and no "@/" imports: scripts/generate-dynamic-sitemaps.ts
 * imports this file by relative path under tsx.
 *
 * WHY THE PAGES HAVE TO EXIST EARLY. /events/october-2026 converts at 30.4% CTR
 * from position 3.1 and /events/november-2026 at 7.8%, the best-converting pages
 * on the site, and a page earns nothing until Google has crawled and indexed it.
 * The old sitemap rule (>= 3 events in the month) kept a month out until venues
 * had announced enough dates, which for December and January is late November.
 * On 2026-09-30 production had 12 December events and 1 January event inside
 * the sitemap window, so January was absent and would have stayed absent well
 * into the period people are already searching it.
 */

export const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
] as const;

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTH_SLUG = /^(january|february|march|april|may|june|july|august|september|october|november|december)-(\d{4})$/i;

export interface MonthRef {
  year: number;
  /** 0-11, as Date uses it. */
  monthIndex: number;
}

export function parseMonthSlug(slug: string | undefined | null): MonthRef | null {
  const m = MONTH_SLUG.exec(slug ?? "");
  if (!m) return null;
  return { year: Number(m[2]), monthIndex: MONTH_NAMES.indexOf(m[1].toLowerCase() as (typeof MONTH_NAMES)[number]) };
}

export function monthSlugOf(ref: MonthRef): string {
  return `${MONTH_NAMES[ref.monthIndex]}-${ref.year}`;
}

export function monthLabelOf(ref: MonthRef): string {
  return `${MONTH_LABELS[ref.monthIndex]} ${ref.year}`;
}

/** The month `delta` months away from `ref`, rolling over years. */
export function shiftMonth(ref: MonthRef, delta: number): MonthRef {
  const total = ref.year * 12 + ref.monthIndex + delta;
  return { year: Math.floor(total / 12), monthIndex: ((total % 12) + 12) % 12 };
}

/** Whole calendar months from `ref` to the month containing `now`; positive = past. */
export function monthsAgo(ref: MonthRef, now: Date): number {
  return now.getFullYear() * 12 + now.getMonth() - (ref.year * 12 + ref.monthIndex);
}

/**
 * Months more than this many calendar months behind the current one are
 * noindexed. As of September, July (2 back) stays indexed and June (3 back)
 * does not.
 */
export const ARCHIVE_AFTER_MONTHS = 2;

/**
 * NOINDEX, NOT 301, for old months. Decided for SEO-033:
 *
 *  - The URL keeps working. A 301 from /events/june-2026 to the current month
 *    sends someone who followed an old link to a page about a different month,
 *    and Google treats a redirect to unrelated content as a soft 404 anyway, so
 *    the redirect would not even carry the equity it is meant to keep.
 *  - CLAUDE.md treats public routes as a persistent schema: a removed route
 *    needs a 301 kept for a release cycle. A rolling redirect whose target
 *    changes every month is not that, and it would have to live in the
 *    middleware, which runs on every production request.
 *  - noindex,follow is reversible and local to the page. It is the same rule
 *    EnhancedEventSEO already applies to long-past event detail pages.
 *
 * The sitemap never lists an archived month (selectSitemapMonths filters them),
 * so the prerender pass never renders one either.
 */
export function isArchivedMonth(ref: MonthRef, now: Date = new Date()): boolean {
  return monthsAgo(ref, now) > ARCHIVE_AFTER_MONTHS;
}

/**
 * How far ahead a month is published regardless of how many events it has.
 *
 * The story asked for months "within 10 weeks", and also for December 2026 AND
 * January 2027 to be in the sitemap on 2026-09-30. Those two cannot both hold if
 * "within" is measured to the first of the month: 1 January is 93 days out. 98
 * days (14 weeks) is the smallest whole-week window that satisfies the explicit
 * criterion, and it gives each month roughly 13 weeks to be crawled before it
 * starts, which is the point of the story.
 */
export const LEAD_WINDOW_DAYS = 98;

/**
 * Every month from the current one through the last month whose first day is
 * within LEAD_WINDOW_DAYS of `now`. These go in the sitemap with no event floor.
 */
export function leadWindowMonths(now: Date = new Date(), leadDays = LEAD_WINDOW_DAYS): string[] {
  const horizon = new Date(now.getTime() + leadDays * 24 * 60 * 60 * 1000);
  const out: string[] = [];
  let ref: MonthRef = { year: now.getFullYear(), monthIndex: now.getMonth() };
  while (new Date(ref.year, ref.monthIndex, 1).getTime() <= horizon.getTime()) {
    out.push(monthSlugOf(ref));
    ref = shiftMonth(ref, 1);
  }
  return out;
}

export interface MonthTally {
  count: number;
  lastmod: string;
}

/**
 * Which month pages go in sitemap-events.xml.
 *
 * A month qualifies if it is inside the lead window (any count, including zero),
 * or if it has at least `minEvents` events. Archived months never qualify, even
 * with events, because the page itself says noindex and a sitemap entry for a
 * noindexed URL is a contradiction Search Console reports.
 *
 * Returned sorted by slug so two runs over the same data write the same file.
 */
export function selectSitemapMonths(
  perMonth: Map<string, MonthTally>,
  now: Date,
  options: { minEvents: number; leadDays?: number; today: string },
): Array<{ slug: string; lastmod: string; forced: boolean }> {
  const lead = new Set(leadWindowMonths(now, options.leadDays ?? LEAD_WINDOW_DAYS));
  const slugs = new Set([...perMonth.keys(), ...lead]);
  const out: Array<{ slug: string; lastmod: string; forced: boolean }> = [];
  for (const slug of slugs) {
    const ref = parseMonthSlug(slug);
    if (!ref || isArchivedMonth(ref, now)) continue;
    const tally = perMonth.get(slug);
    const count = tally?.count ?? 0;
    const meetsFloor = count >= options.minEvents;
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
 * Seasonal intros by month index. Only months with a theme the story names get
 * one; every other month gets the data-driven line alone. Nothing here may name
 * a venue, a date or a price: those come from the events table or not at all.
 */
export const SEASONAL_THEMES: Partial<Record<number, SeasonalTheme>> = {
  9: {
    intro:
      "October in Des Moines is Halloween season: haunted houses, pumpkin patches, corn mazes and neighborhood trick-or-treating.",
    // Checked against October 2026 titles: "monster" caught Big Head Todd and
    // the Monsters and "witch" caught the band All Them Witches, so neither is here.
    titlePattern: /halloween|haunt|pumpkin|trick.or.|costume|spooky|zombie|fright/i,
  },
  10: {
    intro:
      "November brings Thanksgiving and the start of the holiday season, when the first holiday markets open and the light displays switch on.",
    titlePattern: /thanksgiving|turkey trot|holiday|christmas|santa|nutcracker|tree lighting/i,
  },
  11: {
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

/** Events in the month whose title matches the month's theme, in input order. */
export function seasonalPicks<T extends TitledEvent>(events: T[], monthIndex: number, limit = 6): T[] {
  const theme = SEASONAL_THEMES[monthIndex];
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
