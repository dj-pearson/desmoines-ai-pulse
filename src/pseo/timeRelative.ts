/**
 * SEO-056 - time-relative pSEO pages (today, this weekend, a month, a season).
 *
 * The LLM pipeline wrote these pages in March 2026 and the copy said so:
 * /festivals/today opened "March 17th in Des Moines means one thing" and
 * mentioned St. Patrick's Day 18 times, and the prerender baked that into the
 * HTML Google reads in October. A page whose name is a moving window cannot
 * carry prose written for one instance of the window.
 *
 * Two halves, kept in one file so they cannot drift:
 *
 *   buildTimeRelativePage   the evergreen copy: what the list below is and how
 *                           it is selected, written from the page's dimensions
 *                           and the listing query (listingFilters.ts). No
 *                           event, venue, date or price appears in it; those
 *                           come from the live listing at render time.
 *   staleTimeWords          months, seasons, holidays and years in a page's
 *                           text that fall outside both today's window and the
 *                           page's own period. scripts/check-pseo-time-copy.ts
 *                           runs it over the published rows.
 *
 * Plain TypeScript with no React or Supabase imports, so a tsx script can
 * import it.
 */
import { resolveEntityType, temporalRange } from './listingFilters';

export const LIVE_SLUGS = ['today', 'tonight', 'this-weekend', 'this-week'] as const;
export const MONTH_SLUGS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
] as const;
const MONTH_NAMES = MONTH_SLUGS.map((m) => m[0].toUpperCase() + m.slice(1));

/** Same months listingFilters.ts uses for the season windows (0-based). */
export const SEASON_MONTH_SET: Record<string, number[]> = {
  spring: [2, 3, 4],
  summer: [5, 6, 7],
  fall: [8, 9, 10],
  autumn: [8, 9, 10],
  winter: [11, 0, 1],
};
export const SEASON_SLUGS = ['spring', 'summer', 'fall', 'winter'] as const;

/**
 * Holidays and the months they can fall in. Spelled as regexes because the
 * copy spells them several ways ("St. Patrick's", "Saint Patrick", "St.
 * Paddy's"). Apostrophes match straight or curly.
 */
const Q = "['\\u2019]";
export const HOLIDAYS: Array<{ name: string; re: RegExp; months: number[] }> = [
  { name: "New Year's", re: new RegExp(`(?<!(?:Lunar|Chinese) )\\bNew Year(?:${Q}s)?\\b`, 'g'), months: [11, 0] },
  { name: 'Martin Luther King Jr. Day', re: /\b(?:MLK|Martin Luther King(?:,? Jr\.?)?) Day\b/g, months: [0] },
  { name: 'Lunar New Year', re: /\b(?:Lunar|Chinese) New Year\b/g, months: [0, 1] },
  { name: "Valentine's Day", re: new RegExp(`\\bValentine(?:${Q}s)?\\b`, 'g'), months: [1] },
  { name: "Presidents' Day", re: new RegExp(`\\bPresidents?${Q}? Day\\b`, 'g'), months: [1] },
  { name: 'Mardi Gras', re: /\bMardi Gras\b/g, months: [1, 2] },
  { name: "St. Patrick's Day", re: new RegExp(`\\b(?:St\\.?|Saint) (?:Patrick|Paddy)(?:${Q}s)?\\b|\\bShamrock\\b`, 'g'), months: [2] },
  { name: 'Easter', re: /\bEaster\b/g, months: [2, 3] },
  { name: 'Cinco de Mayo', re: /\bCinco de Mayo\b/gi, months: [4] },
  { name: "Mother's Day", re: new RegExp(`\\bMother${Q}?s Day\\b`, 'g'), months: [4] },
  { name: 'Memorial Day', re: /\bMemorial Day\b/g, months: [4] },
  { name: "Father's Day", re: new RegExp(`\\bFather${Q}?s Day\\b`, 'g'), months: [5] },
  { name: 'Juneteenth', re: /\bJuneteenth\b/g, months: [5] },
  { name: 'Fourth of July', re: /\b(?:Fourth of July|4th of July|July 4th|Independence Day)\b/g, months: [6] },
  { name: 'Labor Day', re: /\bLabou?r Day\b/g, months: [8] },
  { name: 'Oktoberfest', re: /\bOktoberfest\b/g, months: [8, 9] },
  { name: 'Halloween', re: /\bHalloween\b|\btrick-or-treat/gi, months: [9] },
  { name: 'Day of the Dead', re: /\bD[i\u00ed]a de (?:los )?Muertos\b|\bDay of the Dead\b/g, months: [9, 10] },
  { name: 'Veterans Day', re: new RegExp(`\\bVeterans${Q}? Day\\b`, 'g'), months: [10] },
  { name: 'Thanksgiving', re: /\bThanksgiving\b|\bBlack Friday\b|\bSmall Business Saturday\b/g, months: [10] },
  { name: 'Christmas', re: /\bChristmas\b|\bXmas\b|\bHanukkah\b|\bKwanzaa\b|\bSanta\b/g, months: [11] },
];

export type TimeKind = 'live' | 'month' | 'season';

export interface TimeDimension {
  slug: string;
  kind: TimeKind;
}

interface DimensionLike {
  dimension: string;
  slug: string;
  name?: string;
}

/** The page's time dimension, or null when it has none. */
export function timeDimension(dimensions: readonly DimensionLike[] | null | undefined): TimeDimension | null {
  const t = dimensions?.find((d) => d.dimension === 'temporal' || d.dimension === 'occasion');
  if (!t) return null;
  if ((LIVE_SLUGS as readonly string[]).includes(t.slug)) return { slug: t.slug, kind: 'live' };
  if ((MONTH_SLUGS as readonly string[]).includes(t.slug)) return { slug: t.slug, kind: 'month' };
  if (t.slug in SEASON_MONTH_SET) return { slug: t.slug, kind: 'season' };
  return null;
}

/**
 * Slug test for rows whose dimensions are missing or odd: a segment naming a
 * live window, a month, a season or a holiday.
 */
const SLUG_RE = new RegExp(
  `(?:^|/)(?:${[...LIVE_SLUGS, ...MONTH_SLUGS, ...Object.keys(SEASON_MONTH_SET)].join('|')}|` +
    'christmas|halloween|thanksgiving|easter|valentines?|st-patricks?(?:-day)?|new-years?(?:-eve)?|fourth-of-july|holidays?)(?:/|$)',
);

export function isTimeRelative(row: { slug: string; dimensions?: readonly DimensionLike[] | null }): boolean {
  return timeDimension(row.dimensions) !== null || SLUG_RE.test(row.slug);
}

// ---------------------------------------------------------------------------
// The period a page is allowed to talk about
// ---------------------------------------------------------------------------

export interface AllowedPeriod {
  months: Set<number>;
  /** Years earlier than this are stale on the page. */
  minYear: number;
}

/**
 * Months the page may name: the next seven days (so a weekend page written on
 * the 30th may say next month) plus the page's own period. Years before the
 * start of the page's next instance are stale: in October 2026 /festivals/august
 * means August 2027, so "2026" on it is out of date.
 */
export function allowedPeriod(slug: string | null, now: Date = new Date()): AllowedPeriod {
  const months = new Set<number>();
  for (let i = 0; i <= 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    months.add(d.getMonth());
  }
  let minYear = now.getFullYear();
  if (slug) {
    const mi = (MONTH_SLUGS as readonly string[]).indexOf(slug);
    if (mi >= 0) months.add(mi);
    for (const m of SEASON_MONTH_SET[slug] ?? []) months.add(m);
    const range = mi >= 0 || slug in SEASON_MONTH_SET ? temporalRange(slug === 'autumn' ? 'fall' : slug, now) : null;
    if (range) minYear = Number(range.from.slice(0, 4));
  }
  return { months, minYear };
}

export interface StaleWord {
  word: string;
  kind: 'month' | 'season' | 'holiday' | 'year';
}

const SEASON_NOUNS =
  'season|festival|festivals|foliage|colors|colours|leaves|weather|events?|activities|harvest|break|menus?|fun|nights?|days?|evenings?|weekends?|months?|guide|tradition|traditions';
const SEASON_LEAD = 'this|next|last|in|early|late|mid|during|the|through|every|each|of|and|or|before|after';

function seasonMatches(text: string, word: 'spring' | 'fall'): number {
  // "spring" and "fall" are also verbs and nouns ("prices fall", "hot
  // springs"), so only count them where they read as the season: capitalised
  // mid-sentence, followed by a season noun, or after a time preposition.
  const re = new RegExp(
    `(?<=[^.!?]\\s)${word[0].toUpperCase()}${word.slice(1)}\\b(?!s)|` +
      `\\b${word}(?:time)?\\s+(?:${SEASON_NOUNS})\\b|` +
      `\\b(?:${SEASON_LEAD})\\s+${word}\\b(?!s)`,
    'gi',
  );
  return (text.match(re) ?? []).length;
}

/**
 * Month, season, holiday and year words in `text` that are outside the page's
 * allowed period. Each hit is returned once per occurrence, so the count says
 * how much of the page is stale.
 */
export function staleTimeWords(text: string, period: AllowedPeriod): StaleWord[] {
  const hits: StaleWord[] = [];
  MONTH_NAMES.forEach((name, i) => {
    if (period.months.has(i)) return;
    // "May" is also the modal verb; mid-sentence the verb is lower case, so a
    // capitalised May after a non-terminal character is the month.
    const re = name === 'May' ? /(?<=[^.!?"]\s)May\b(?!\s+(?:I|we|you)\b)/g : new RegExp(`\\b${name}\\b`, 'g');
    for (const _ of text.matchAll(re)) hits.push({ word: name, kind: 'month' });
  });
  for (const [season, months] of Object.entries(SEASON_MONTH_SET)) {
    if (months.some((m) => period.months.has(m))) continue;
    const n =
      season === 'spring' || season === 'fall'
        ? seasonMatches(text, season)
        : (text.match(new RegExp(`\\b${season}(?:time)?\\b`, 'gi')) ?? []).length;
    for (let i = 0; i < n; i++) hits.push({ word: season, kind: 'season' });
  }
  for (const h of HOLIDAYS) {
    if (h.months.some((m) => period.months.has(m))) continue;
    for (const _ of text.matchAll(h.re)) hits.push({ word: h.name, kind: 'holiday' });
  }
  for (const m of text.matchAll(/\b(20[1-3]\d)\b/g)) {
    if (Number(m[1]) < period.minYear) hits.push({ word: m[1], kind: 'year' });
  }
  return hits;
}

/** Every string a visitor or crawler reads from a stored row. */
export function rowText(row: {
  seo?: { title?: string; h1?: string; description?: string; keywords?: string[] } | null;
  sections?: unknown;
  structured_data?: unknown;
}): string {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk([row.seo?.title, row.seo?.h1, row.seo?.description, row.seo?.keywords, row.sections, row.structured_data]);
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// The evergreen page
// ---------------------------------------------------------------------------

/** Generator tag on rows this module wrote (generation_meta.generatedBy). */
export const TIME_TEMPLATE_GENERATOR = 'seo-056-time-template';

const MONTH_RANGE: Record<string, string> = {
  spring: 'March, April and May',
  summer: 'June, July and August',
  fall: 'September, October and November',
  winter: 'December, January and February',
};

interface PeriodWords {
  /** Title case, after the subject: "Today", "This Weekend", "in August". */
  title: string;
  /** Inline, after the subject: "today", "this weekend", "in August". */
  inline: string;
  /** Which events the date filter keeps. */
  window: string;
  /** How a month or season window rolls forward, as a sentence; '' for live windows. */
  roll: string;
}

function periodWords(t: TimeDimension): PeriodWords {
  if (t.slug === 'today' || t.slug === 'tonight') {
    return { title: 'Today', inline: 'today', window: 'dated today and not yet past', roll: '' };
  }
  if (t.slug === 'this-weekend') {
    return { title: 'This Weekend', inline: 'this weekend', window: 'dated this coming Saturday or Sunday', roll: '' };
  }
  if (t.slug === 'this-week') {
    return { title: 'This Week', inline: 'this week', window: 'coming up next', roll: '' };
  }
  if (t.kind === 'month') {
    const name = t.slug[0].toUpperCase() + t.slug.slice(1);
    return {
      title: `in ${name}`,
      inline: `in ${name}`,
      window: `dated in ${name}`,
      roll: `While ${name} is under way the list starts from today; once it ends, it shows next ${name}. `,
    };
  }
  const name = t.slug[0].toUpperCase() + t.slug.slice(1);
  return {
    title: `in ${name}`,
    inline: `in the ${t.slug}`,
    window: `dated in ${MONTH_RANGE[t.slug]}`,
    roll: `While the ${t.slug} is under way the list starts from today; once it ends, it shows the next one. `,
  };
}

interface Subject {
  /** Title case: "Festivals", "Mexican Restaurants". */
  title: string;
  /** Inline plural: "festivals", "Mexican restaurants". */
  inline: string;
  /** What the category filter matches, for the "what counts" answer. */
  matches: string | null;
  /** The hub a visitor should fall back to. */
  hub: { href: string; label: string };
}

const EVENT_CATEGORY: Record<string, { title: string; inline: string; matches: string }> = {
  festivals: { title: 'Festivals', inline: 'festivals', matches: 'festival' },
  'live-music': { title: 'Live Music', inline: 'live music, concerts and performances', matches: 'music, concert or performing arts' },
  'arts-culture': { title: 'Arts and Culture Events', inline: 'arts and culture events', matches: 'art, culture, theater or museum' },
  sports: { title: 'Sports Events', inline: 'sports events', matches: 'sport, athletic or game' },
  'farmers-markets': { title: 'Farmers Markets', inline: 'farmers markets', matches: 'market or farmer' },
};

const RESTAURANT_CATEGORY: Record<string, { title: string; inline: string; matches: string }> = {
  mexican: { title: 'Mexican Restaurants', inline: 'Mexican restaurants', matches: 'Mexican, Tex-Mex or Latin' },
  asian: { title: 'Asian Restaurants', inline: 'Asian restaurants', matches: 'Asian, Chinese, Thai, Japanese, sushi, Vietnamese, Korean or ramen' },
  italian: { title: 'Italian and Pizza Restaurants', inline: 'Italian and pizza restaurants', matches: 'Italian or pizza' },
  bbq: { title: 'BBQ Restaurants', inline: 'BBQ restaurants', matches: 'BBQ, barbecue or smokehouse' },
  brunch: { title: 'Brunch and Breakfast Spots', inline: 'brunch, breakfast and cafe spots', matches: 'brunch, breakfast, cafe, coffee, bakery or diner' },
  coffee: { title: 'Coffee Shops', inline: 'coffee shops and cafes', matches: 'coffee, cafe or espresso' },
  steakhouse: { title: 'Steakhouses', inline: 'steakhouses', matches: 'steak' },
  pizza: { title: 'Pizza Places', inline: 'pizza places', matches: 'pizza' },
};

/** Audience pages: how the title reads, and what the calendar cannot select for. */
const AUDIENCE: Record<string, { title: string; selection: string; check: string }> = {
  budget: { title: 'Budget-Friendly Things to Do', selection: 'a budget selection', check: 'prices' },
  'date-night': { title: 'Date Night Ideas', selection: 'a date-night selection', check: 'times and prices' },
  families: { title: 'Family Things to Do', selection: 'a family selection', check: 'age limits and prices' },
  foodies: { title: 'Things to Do for Foodies', selection: 'a food selection', check: 'what is on offer' },
  tourists: { title: 'Things to Do for Visitors', selection: 'a visitor selection', check: 'times and prices' },
};

function eventHub(t: TimeDimension): { href: string; label: string } {
  if (t.slug === 'today' || t.slug === 'tonight') return { href: '/events/today', label: 'Everything on today' };
  if (t.slug === 'this-weekend') return { href: '/events/this-weekend', label: 'Everything on this weekend' };
  return { href: '/events', label: 'The full events calendar' };
}

export interface TimeRelativePage {
  entity: 'events' | 'restaurants' | 'attractions';
  seo: { title: string; h1: string; description: string; keywords: string[] };
  breadcrumb: Array<{ name: string; url: string }>;
  sections: Array<{
    id: string;
    type: 'hero_intro' | 'live_listings' | 'faq';
    heading?: string;
    content?: string;
    faqs?: Array<{ question: string; answer: string }>;
    emptyHref?: string;
    emptyLabel?: string;
  }>;
  faqs: Array<{ question: string; answer: string }>;
}

/**
 * The evergreen page for a time-relative row, or null when the row is not
 * time-relative. Every sentence describes the listing query in
 * listingFilters.ts / PseoLiveListings.tsx; change one and the other must
 * follow (pSEO time-copy tests pin the pairing).
 */
export function buildTimeRelativePage(dimensions: readonly DimensionLike[]): TimeRelativePage | null {
  const t = timeDimension(dimensions);
  if (!t) return null;
  const content = dimensions.find((d) => d.dimension === 'content_type');
  const category = dimensions.find((d) => d.dimension === 'category');
  const audience = dimensions.find((d) => d.dimension === 'audience');
  const entity = resolveEntityType(content?.slug, category?.slug);
  const p = periodWords(t);

  if (entity === 'restaurants') {
    const cat = category ? RESTAURANT_CATEGORY[category.slug] : undefined;
    const subj: Subject = cat
      ? { ...cat, hub: { href: '/restaurants', label: 'All Des Moines restaurants' } }
      : { title: 'Restaurants', inline: 'restaurants', matches: null, hub: { href: '/restaurants', label: 'All Des Moines restaurants' } };
    const title = `${subj.title} in Des Moines ${p.title}`;
    const faqs = [
      {
        question: `Which ${subj.inline} does this page list?`,
        answer:
          `Up to 12 ${subj.inline} from the Des Moines Insider restaurant directory, ordered by rating` +
          (subj.matches ? `, whose cuisine is recorded as ${subj.matches}` : '') +
          '. Restaurants marked closed, or announced but not yet open, are left out.',
      },
      {
        question: `Are these ${subj.inline} open ${p.inline}?`,
        answer:
          'The directory does not tie a restaurant to a date, so the list is the same all year. ' +
          "Each name opens the restaurant's own page with the hours the directory holds; check them before you go.",
      },
    ];
    return {
      entity,
      breadcrumb: [
        { name: 'Home', url: '/' },
        { name: 'Restaurants', url: '/restaurants' },
      ],
      seo: {
        title,
        h1: title,
        description: `${subj.title} in Des Moines ${p.inline}, read live from the Des Moines Insider directory and ordered by rating, with a link to each restaurant's page.`,
        keywords: [
          `${subj.inline} des moines`,
          `${subj.inline} des moines ${p.inline.replace(/^in (the )?/, '')}`,
          `des moines ${subj.inline}`,
        ].map((k) => k.toLowerCase()),
      },
      sections: [
        {
          id: 'hero_intro',
          type: 'hero_intro',
          content:
            `The ${subj.inline} below are read live from the Des Moines Insider restaurant directory and ordered by rating. ` +
            `The directory does not tie a restaurant to a date, so the list is the same ${p.inline} as the rest of the year; ` +
            "check each one's hours on its own page before you go. Closed restaurants and ones that are announced but not yet open are left out.",
        },
        { id: 'live_listings', type: 'live_listings', heading: subj.title, emptyHref: subj.hub.href, emptyLabel: subj.hub.label },
        { id: 'faq', type: 'faq', heading: 'About this list', faqs },
      ],
      faqs,
    };
  }

  // Events (attraction rows are shadowed by /attractions/:slug and never
  // render here; they get the events wording only if that ever changes).
  const cat = category ? EVENT_CATEGORY[category.slug] : undefined;
  const isThingsToDo = content?.slug === 'things-to-do' || (!content && !category && !audience);
  const subjTitle = cat?.title ?? (isThingsToDo ? 'Things to Do' : 'Events');
  const subjInline = cat?.inline ?? 'events';
  const hub = eventHub(t);
  const aud = audience ? AUDIENCE[audience.slug] ?? { title: `Things to Do ${audience.name}`, selection: 'a hand-picked selection', check: 'times and prices' } : null;
  const audienceNote = aud
    ? ` The calendar does not record who an event is aimed at, so this is every event in that window rather than ${aud.selection}; check each event's page for ${aud.check}.`
    : '';
  const headTitle = aud ? aud.title : subjTitle;
  const title = `${headTitle} in Des Moines ${p.title}`;
  const catPart = cat ? ` in a category recorded as ${cat.matches},` : '';
  const faqs = [
    {
      question: `What does this list of ${subjInline} include?`,
      answer:
        `Up to 12 events from the Des Moines Insider calendar${catPart} ${p.window}, soonest first. ${p.roll}` +
        'Hidden, merged and archived events are left out.',
    },
    {
      question: `Why is an event happening ${p.inline} missing?`,
      answer:
        'The list shows only what is on the Des Moines Insider calendar. An event that is not listed has not been added yet, ' +
        `or its category or date on the calendar does not match this page. ${hub.label} is at ${hub.href}.`,
    },
  ];
  return {
    entity,
    breadcrumb: [
      { name: 'Home', url: '/' },
      isThingsToDo || aud ? { name: 'Things to Do', url: '/things-to-do' } : { name: 'Events', url: '/events' },
    ],
    seo: {
      title,
      h1: title,
      description:
        `${cat ? cat.inline[0].toUpperCase() + cat.inline.slice(1) : 'Events'} in Des Moines ${p.inline}, read live from the Des Moines Insider events calendar` +
        ', soonest first, with a link to each event.',
      keywords: [
        `${subjInline.split(',')[0].toLowerCase()} des moines ${p.inline.replace(/^in (the )?/, '')}`,
        `des moines ${subjInline.split(',')[0].toLowerCase()} ${p.inline.replace(/^in (the )?/, '')}`,
        `things to do in des moines ${p.inline.replace(/^in (the )?/, '')}`,
      ].map((k) => k.toLowerCase()),
    },
    sections: [
      {
        id: 'hero_intro',
        type: 'hero_intro',
        content:
          `The ${subjInline} below are read live from the Des Moines Insider events calendar: events${catPart} ${p.window}, soonest first. ${p.roll}` +
          "Each one opens the event's own page with the date, time, venue and details the calendar holds." +
          audienceNote,
      },
      {
        id: 'live_listings',
        type: 'live_listings',
        heading: `${headTitle} ${p.title}`,
        emptyHref: hub.href,
        emptyLabel: hub.label,
      },
      { id: 'faq', type: 'faq', heading: 'About this list', faqs },
    ],
    faqs,
  };
}

/** Categories the evergreen copy describes; the test pins them to CATEGORY_FILTERS. */
export const TIME_COPY_CATEGORIES = { events: Object.keys(EVENT_CATEGORY), restaurants: Object.keys(RESTAURANT_CATEGORY) };

/**
 * Time-relative pSEO pages that duplicate an events hub, and the hub each one
 * 301s to (SEO-040 flagged the pair, SEO-056 consolidated it). The pSEO row is
 * unpublished and public/_redirects carries the 301; scripts/check-pseo-time-copy.ts
 * fails if either half goes missing. Search Console, 2026-09-30 export:
 * /things-to-do/this-weekend 7 impressions, /things-to-do/today 1.
 */
export const HUB_DUPLICATES: Readonly<Record<string, string>> = {
  '/things-to-do/this-weekend': '/events/this-weekend',
  '/things-to-do/today': '/events/today',
};
