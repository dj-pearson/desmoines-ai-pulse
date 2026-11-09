/**
 * Renders public/llms.txt (SEO-047). Pure, so the test can pin the output
 * without a database; scripts/generate-llms-txt.ts supplies the numbers.
 *
 * The file used to be hand-kept, and the counts in it drifted: "500+ monthly
 * events" survived for months after the table held about 340. Every number
 * here now comes from the same queries the sitemaps use, on every build. A
 * count that could not be read is left out of the sentence rather than
 * replaced with a guess.
 *
 * Google has said it ignores llms.txt, so this stays short and cheap: what the
 * site covers, how much of it there is today, and where the hubs are.
 *
 * "Where the hubs are" means every public hub in public/sitemap-static.xml
 * (WEB-SEO-052). The list was written once and fourteen hubs shipped after it,
 * /music, /sports, /outdoors and /stay among them, so an AI reader was told
 * the site had none of them. scripts/__tests__/llms-txt.test.mjs now fails
 * when a single-segment path in sitemap-static.xml is neither linked here nor
 * on its named exclusion list, and when a link here is in no sitemap.
 */

export interface LlmsCounts {
  /** Events starting today or later, or still running, that the site shows. */
  upcomingEvents: number | null;
  /** Restaurants not marked closed (status or Google business_status). */
  openRestaurants: number | null;
  /** Active attractions. */
  attractions: number | null;
  /** Playgrounds inside the Des Moines metro box. */
  playgrounds: number | null;
  /** Published articles. */
  articles: number | null;
}

export interface LlmsTxtInput {
  baseUrl: string;
  /** YYYY-MM-DD, Central. */
  asOf: string;
  counts: LlmsCounts;
  /** Month pages in the events sitemap, current month onward, e.g. "october-2026". */
  monthSlugs: string[];
}

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/** "october-2026" -> { year: 2026, month: 10 }, or null for anything else. */
export function parseMonthSlug(slug: string): { year: number; month: number } | null {
  const m = /^([a-z]+)-(\d{4})$/.exec(slug);
  if (!m) return null;
  const idx = MONTH_NAMES.indexOf(m[1]);
  if (idx < 0) return null;
  return { year: Number(m[2]), month: idx + 1 };
}

/**
 * Month pages from the current Central month onward, oldest first, capped.
 * The events sitemap also carries last month's page (MONTHS_BACK = 1); an AI
 * reader asking what's on does not need it.
 */
export function upcomingMonthSlugs(
  slugs: string[],
  current: { year: number; month: number },
  max = 4,
): string[] {
  const floor = current.year * 12 + current.month;
  return [...new Set(slugs)]
    .map((s) => ({ s, p: parseMonthSlug(s) }))
    .filter((x): x is { s: string; p: { year: number; month: number } } => x.p !== null)
    .filter(({ p }) => p.year * 12 + p.month >= floor)
    .sort((a, b) => a.p.year * 12 + a.p.month - (b.p.year * 12 + b.p.month))
    .slice(0, max)
    .map(({ s }) => s);
}

function monthLabel(slug: string): string {
  const p = parseMonthSlug(slug);
  if (!p) return slug;
  const name = MONTH_NAMES[p.month - 1];
  return `${name[0].toUpperCase()}${name.slice(1)} ${p.year}`;
}

/** "341 upcoming events", or just "upcoming events" when the count is unknown. */
function counted(n: number | null, noun: string): string {
  return typeof n === 'number' && Number.isFinite(n) ? `${n.toLocaleString('en-US')} ${noun}` : noun;
}

export function renderLlmsTxt({ baseUrl, asOf, counts, monthSlugs }: LlmsTxtInput): string {
  const base = baseUrl.replace(/\/+$/, '');
  const link = (label: string, path: string, note: string) => `- [${label}](${base}${path}): ${note}`;

  const coverage = [
    counted(counts.upcomingEvents, 'upcoming events'),
    counted(counts.openRestaurants, 'restaurants'),
    counted(counts.attractions, 'attractions'),
    counted(counts.playgrounds, 'playgrounds'),
    counted(counts.articles, 'local articles'),
  ];

  const months = monthSlugs.map((s) => link(`${monthLabel(s)} events`, `/events/${s}`, `events in Des Moines in ${monthLabel(s)}`));

  return `# Des Moines Insider

> A local guide to events, restaurants, attractions and family outings in Des Moines, Iowa and its suburbs.

As of ${asOf} the site lists ${coverage.slice(0, -1).join(', ')} and ${coverage[coverage.length - 1]}. These counts are generated from the database on every build.

Coverage: Des Moines, West Des Moines, Ankeny, Urbandale, Johnston, Clive, Waukee, Altoona and Windsor Heights. Times are Central (America/Chicago). Events are collected daily and reach the published pages on the next site build; restaurant listings are reviewed weekly and attractions monthly.

## Events
- [All events](${base}/events): every upcoming event, filterable by date and category
- [Today](${base}/events/today): events happening today
- [This weekend](${base}/events/this-weekend): Friday through Sunday
- [Free events](${base}/events/free): no-cost events
- [Kids events](${base}/events/kids): family and children's events
- [Date night](${base}/events/date-night): evening events suited to a night out
- [Live music](${base}/music): tonight's shows, this weekend's concerts and the venues that host them
- [Sports](${base}/sports): Iowa Cubs, Iowa Wild, Iowa Wolves and Iowa Barnstormers games, with schedules and venues
- [Iowa State Fair](${base}/iowa-state-fair): dates, parking, hotels and restaurants near the fairgrounds
- Events by suburb: ${base}/events/<suburb>, e.g. west-des-moines, ankeny, urbandale, johnston, clive, waukee, altoona, windsor-heights
${months.join('\n')}${months.length ? '\n' : ''}
## Places
- [Restaurants](${base}/restaurants): restaurant directory with cuisine, price and hours
- [Open now](${base}/restaurants/open-now): restaurants open at this moment
- [New restaurants](${base}/restaurants/new): restaurants opened in the last 12 months, plus announced and opening-soon ones
- [Dietary](${base}/restaurants/dietary): restaurants whose listing mentions vegan, vegetarian, gluten-free, keto, halal or kosher (a keyword match, not a menu check)
- [What's new](${base}/whats-new): restaurant openings, closings and other changes, newest first
- [Deals](${base}/deals): happy hours, specials and coupons, with the days and times they run
- [Breweries](${base}/breweries): craft breweries and taprooms with their listed hours
- [Best of](${base}/best-of): community-voted best pizza, coffee, brunch and more
- [Attractions](${base}/attractions): museums, parks and things to do
- [Outdoors](${base}/outdoors): state parks, county parks and rail trails within about 40 minutes of downtown
- [Playgrounds](${base}/playgrounds): playgrounds and parks for kids
- [Neighborhoods](${base}/neighborhoods): neighborhood and suburb guides

## Visiting
- [Things to do](${base}/things-to-do): things to do by neighborhood, activity or occasion
- [Visitors guide](${base}/visitors-guide): what's on this weekend, where to eat, stay and how to get around
- [Where to stay](${base}/stay): hotels by area and by distance to a venue
- [Getting around](${base}/getting-around): downtown parking, the skywalk, DART, BCycle, the airport and rideshare
- [Itineraries](${base}/itineraries): curated day and weekend trip plans
- [Group travel](${base}/group-travel): meeting, conference and wedding venues by capacity and type

## Reading
- [Articles](${base}/articles): local articles, including the weekly "This Weekend in Des Moines"
- [Guides](${base}/guides): longer guides to living in and visiting Des Moines
- [About](${base}/about): who runs the site and how listings are collected

## Feeds
- [Sitemap index](${base}/sitemap.xml)
- [RSS](${base}/rss.xml): new articles and upcoming events
- [Calendar feed, all events](${base}/calendar/all.ics): iCalendar, next 60 days, refreshed hourly
- [Calendar feed, free events](${base}/calendar/free.ics): iCalendar, events listed as free
- Per-category calendar feeds: ${base}/calendar/<category>.ics, e.g. music, sports, arts, family, food
`;
}
