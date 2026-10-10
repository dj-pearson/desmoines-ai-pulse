#!/usr/bin/env tsx
/**
 * SEO-041 - bring the cuisine x suburb pSEO pages in line with the coverage
 * rule (src/pseo/coverageRule.ts), as SQL for review. It never writes to the
 * database itself.
 *
 *   npx tsx scripts/write-pseo-coverage-pages.ts [--only mexican,pizza] > coverage.sql
 *   (back up the rows it names, then apply with psql)
 *
 * What it emits, per combination the rule governs:
 *
 *   indexable, no row          INSERT a page written from the restaurant rows
 *   noindex, published         set seo.robots = "noindex, follow"
 *   indexable, noindexed       remove seo.robots
 *   under the floor, published UPDATE is_published = false (add the 301 to
 *                              public/_redirects by hand; the script cannot
 *                              choose the target)
 *   data-built copy now stale  rewrite its sections from the current listing
 *
 * WHY NOT THE GENERATION PIPELINE. generate-pseo-page sends the dimensions to
 * Claude with no restaurant data in the prompt and asks for "6-8 restaurant
 * recommendations with specific dish suggestions, price context"; the
 * published /mexican/ankeny it produced recommends a taqueria that is not in
 * the restaurants table and quotes prices nobody checked. Copy here is built
 * only from columns on the listed rows (name, price_range) and from what the
 * page itself does, so every sentence is checkable against the database.
 * The noindex band (3-4 places) is not generated here: the rule allows those
 * pages, it does not ask for them.
 *
 * --rewrite-llm (SEO-060) also rewrites every published, governed page whose
 * copy came from the LLM pipeline, so no page the rule keeps carries prose
 * naming a restaurant the table does not hold (/mexican/ankeny recommended
 * "Tacos La Familia").
 *
 * SEO-065: the all-restaurants area pages (/restaurants/ankeny) are governed
 * too and written by buildAreaPage: a count, the five highest rated, the most
 * common first-recorded cuisines, and links to the area's indexable cuisine
 * pages. --rewrite-llm replaced the LLM copy on the five that existed.
 *
 * --only limits INSERTS to the named categories (SEO-041 published only the
 * cuisines with measured demand). Updates to existing rows are never limited:
 * the rule applies to every published page in scope.
 *
 * Reads production with the anon key from .env (VITE_SUPABASE_URL,
 * VITE_SUPABASE_ANON_KEY).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { categoryDimension, contentTypeDimension, locationDimension } from '../src/pseo/taxonomy';
import { AREA_PAGE_CATEGORY, CITYWIDE, matchingPlaces, type CoverageRestaurantRow } from '../src/pseo/coverageRule';
import { evaluateCoverage, DATA_TEMPLATE_GENERATOR, type PublishedPseoRow, type CoverageRow } from './lib/pseoCoverage';
import { NEIGHBORHOOD_BOUNDARIES } from '../src/lib/neighborhoodBoundaries';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

interface Restaurant extends CoverageRestaurantRow {
  price_range: string | null;
  rating: number | null;
}

/** How each category reads in a heading, and what its cuisine filter actually matches. */
const NOUN: Record<string, { plural: string; inline: string; singular: string; matches: string }> = {
  mexican: { plural: 'Mexican Restaurants', inline: 'Mexican restaurants', singular: 'Mexican restaurant', matches: 'Mexican, Tex-Mex or Latin' },
  pizza: { plural: 'Pizza Places', inline: 'pizza places', singular: 'pizza place', matches: 'pizza' },
  asian: {
    plural: 'Asian Restaurants',
    inline: 'Asian restaurants',
    singular: 'Asian restaurant',
    matches: 'Asian, Chinese, Thai, Japanese, sushi, Vietnamese, Korean or ramen',
  },
  italian: { plural: 'Italian and Pizza Restaurants', inline: 'Italian and pizza restaurants', singular: 'Italian or pizza restaurant', matches: 'Italian or pizza' },
  bbq: { plural: 'BBQ Restaurants', inline: 'BBQ restaurants', singular: 'BBQ restaurant', matches: 'BBQ, barbecue or smokehouse' },
  brunch: {
    plural: 'Brunch, Breakfast and Cafe Spots',
    inline: 'brunch, breakfast and cafe spots',
    singular: 'brunch or breakfast spot',
    matches: 'brunch, breakfast, cafe, coffee, bakery or diner',
  },
  coffee: { plural: 'Coffee Shops and Cafes', inline: 'coffee shops and cafes', singular: 'coffee shop', matches: 'coffee, cafe or espresso' },
  steakhouse: { plural: 'Steakhouses', inline: 'steakhouses', singular: 'steakhouse', matches: 'steak' },
};

function env(): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = { ...process.env };
  try {
    for (const line of readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && out[m[1]] === undefined) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  } catch {
    // environment only
  }
  return out;
}

async function fetchAll<T>(base: string, key: string, table: string, select: string): Promise<T[]> {
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const rows: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${base.replace(/\/+$/, '')}/rest/v1/${table}?select=${select}&order=id&limit=1000&offset=${offset}`, { headers });
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status}`);
    const page = (await res.json()) as T[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Same order the live listing uses: rating descending, nulls first as Postgres sorts them. */
function byRating(a: Restaurant, b: Restaurant): number {
  if (a.rating === null && b.rating === null) return a.name.localeCompare(b.name);
  if (a.rating === null) return -1;
  if (b.rating === null) return 1;
  return b.rating - a.rating || a.name.localeCompare(b.name);
}

export function buildPage(row: CoverageRow, places: Restaurant[], today: string) {
  const cat = categoryDimension.values.find((v) => v.slug === row.category);
  const loc = locationDimension.values.find((v) => v.slug === row.location);
  if (!cat || !loc) throw new Error(`${row.slug}: not in taxonomy`);
  const noun = NOUN[row.category] ?? {
    plural: `${cat.name} Restaurants`,
    inline: `${cat.name} restaurants`,
    singular: `${cat.name} restaurant`,
    matches: cat.name,
  };
  const ordered = [...places].sort(byRating);
  const names = ordered.map((p) => p.name);
  const withPrice = ordered.map((p) => (p.price_range ? `${p.name} (${p.price_range})` : p.name));
  const lower = noun.inline;

  // SEO-060: a neighbourhood is named with its city ("East Village, Des
  // Moines"), a suburb with the state, and the "which places count" answer
  // says which test placed them: the mapped boundary or the city/address.
  const nb = NEIGHBORHOOD_BOUNDARIES.find((n) => n.slug === loc.slug);
  const areaFull = nb ? (loc.name.includes(nb.cityLabel) ? loc.name : `${loc.name}, ${nb.cityLabel}`) : `${loc.name}, Iowa`;
  const inAreaTest = nb
    ? `whose map location falls inside the ${loc.name} boundary this site uses (${nb.boundaryText})`
    : `whose city or address is ${loc.name}`;

  const title = `${noun.plural} in ${areaFull}`;
  const h1 = `${noun.plural} in ${loc.name}`;
  const lead = joinNames(names.slice(0, 2));
  // Names the top two when they fit, because a description that names real
  // places is the one thing a template can say that is specific to the page.
  let description = `${places.length} ${lower} in ${areaFull}, including ${lead}, listed from the Des Moines Insider restaurant directory.`;
  if (description.length > 160) {
    description = `${places.length} ${lower} in ${areaFull}, listed from the Des Moines Insider restaurant directory with a link to each one.`;
  }

  const faqs = [
    {
      question: `Which ${lower} in ${loc.name} does Des Moines Insider list?`,
      answer: `As of ${today}, ${places.length}: ${joinNames(withPrice)}. Price ranges are shown where the directory has one.`,
    },
    {
      question: `Why is a ${noun.singular} in ${loc.name} missing from this list?`,
      answer:
        `This page lists restaurants in the Des Moines Insider directory ${inAreaTest} and whose cuisine ` +
        `is recorded as ${noun.matches}. Restaurants marked closed, or announced but not yet open, are left out. ` +
        'A place that is not listed is not in the directory yet.',
    },
  ];

  const sections = [
    {
      id: 'hero_intro',
      type: 'hero_intro',
      content:
        `The Des Moines Insider restaurant directory lists ${places.length} ${lower} in ${loc.name} right now. ` +
        'The list below is read from it live, ordered by rating, and each name opens that restaurant\'s own page ' +
        'with the address, hours, price range and links the directory holds for it. Closed restaurants and ones ' +
        'that are announced but not yet open are left out.',
    },
    { id: 'live_listings', type: 'live_listings', heading: `${noun.plural} in ${loc.name}` },
    { id: 'faq', type: 'faq', heading: `About this list`, faqs },
  ];

  return {
    id: `category-location__${[row.category, row.location].sort().join('_')}`,
    slug: row.slug,
    page_type_id: 'category-location',
    dimensions: [
      { name: cat.name, slug: cat.slug, tier: cat.tier, dimension: 'category' },
      { name: loc.name, slug: loc.slug, tier: loc.tier, dimension: 'location' },
    ],
    seo: {
      title,
      h1,
      description,
      keywords: [
        `${cat.name.toLowerCase()} ${loc.name.toLowerCase()}`,
        `${cat.name.toLowerCase()} restaurants ${loc.name.toLowerCase()}`,
        `${loc.name.toLowerCase()} ${cat.name.toLowerCase()}`,
        `${cat.name.toLowerCase()} ${loc.name.toLowerCase()} iowa`,
      ],
      canonicalUrl: row.slug,
      ogType: 'website',
      ...(row.verdict === 'noindex' ? { robots: 'noindex, follow' } : {}),
    },
    sections,
    related_pages: [],
    structured_data: {
      '@type': 'WebPage',
      breadcrumb: [
        { name: 'Home', url: '/' },
        { name: 'Restaurants', url: '/restaurants' },
        { name: h1, url: row.slug },
      ],
      faqItems: faqs,
    },
    generation_meta: {
      generatedAt: new Date().toISOString(),
      generatedBy: DATA_TEMPLATE_GENERATOR,
      promptVersion: 'none',
      modelUsed: 'none',
      wordCount: JSON.stringify(sections).split(/\s+/).length,
      refreshSchedule: 'monthly',
      placeFingerprint: row.fingerprint,
      placeCount: places.length,
      sourceTable: 'restaurants',
    },
    is_published: true,
    quality_score: 0.8,
  };
}

/** A published, indexable cuisine page for the same area, linked from the area page. */
export interface AreaCuisineLink {
  slug: string;
  title: string;
}

/** "American, Brunch" -> "American". The first cuisine a row records, as stored. */
function primaryCuisine(cuisine: string | null): string | null {
  const first = (cuisine ?? '').split(',')[0]?.trim();
  return first ? first : null;
}

/**
 * SEO-065: the all-restaurants area page, /restaurants/<area>, written from
 * the rows the same way buildPage writes a cuisine page. Every sentence is a
 * count or a name from the listed rows, or a description of what the page
 * does; nothing is said about a place the directory does not record.
 */
export function buildAreaPage(row: CoverageRow, places: Restaurant[], today: string, cuisinePages: AreaCuisineLink[]) {
  const content = contentTypeDimension.values.find((v) => v.slug === AREA_PAGE_CATEGORY);
  const loc = locationDimension.values.find((v) => v.slug === row.location);
  if (!content || !loc) throw new Error(`${row.slug}: not in taxonomy`);

  const nb = NEIGHBORHOOD_BOUNDARIES.find((n) => n.slug === loc.slug);
  const areaFull = nb ? (loc.name.includes(nb.cityLabel) ? loc.name : `${loc.name}, ${nb.cityLabel}`) : `${loc.name}, Iowa`;
  const inAreaTest = nb
    ? `whose map location falls inside the ${loc.name} boundary this site uses (${nb.boundaryText})`
    : `whose city or address is ${loc.name}`;

  const n = places.length;
  const ordered = [...places].sort(byRating);
  // The FAQ names the top rated among rows that HAVE a rating; the live list
  // puts unrated rows first (Postgres sorts nulls first on a descending order),
  // so "highest rated" is only ever said of rated rows.
  const rated = places
    .filter((p) => p.rating !== null)
    .sort((a, b) => (b.rating as number) - (a.rating as number) || a.name.localeCompare(b.name));
  const topRated = rated.slice(0, 5);

  const cuisineCounts = new Map<string, number>();
  for (const p of places) {
    const c = primaryCuisine(p.cuisine);
    if (c) cuisineCounts.set(c, (cuisineCounts.get(c) ?? 0) + 1);
  }
  const commonCuisines = [...cuisineCounts]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6);

  const title = `Restaurants in ${areaFull}`;
  const h1 = `Restaurants in ${loc.name}`;
  // The description names the two highest rated, not the first two in list
  // order, which are unrated rows whenever any exist.
  const lead = joinNames((topRated.length >= 2 ? topRated : ordered).slice(0, 2).map((p) => p.name));
  let description = `${n} restaurants in ${areaFull}, including ${lead}, listed from the Des Moines Insider restaurant directory.`;
  if (description.length > 160) {
    description = `${n} restaurants in ${areaFull}, listed from the Des Moines Insider restaurant directory with a link to each one.`;
  }

  const shown = Math.min(n, 12);
  const listSentence =
    n > shown
      ? `The list below shows ${shown} of them, read from the directory live and ordered by rating`
      : 'The list below is read from it live and ordered by rating';

  const faqs = [
    {
      question: `How many restaurants in ${loc.name} does Des Moines Insider list?`,
      answer:
        `As of ${today}, ${n}.` +
        (topRated.length
          ? ` By Google star rating, the highest rated are ${joinNames(
              topRated.map((p) => `${p.name} (${(p.rating as number).toFixed(1)})`),
            )}.`
          : ''),
    },
    ...(commonCuisines.length
      ? [
          {
            question: `What kinds of food do ${loc.name} restaurants serve?`,
            answer:
              `By the first cuisine each listing records, the most common are ` +
              `${joinNames(commonCuisines.map(([c, count]) => `${c} (${count})`))}. ` +
              'A place can record more than one cuisine; only the first is counted here.',
          },
        ]
      : []),
    {
      question: `Why is a restaurant in ${loc.name} missing from this list?`,
      answer:
        `This page lists restaurants in the Des Moines Insider directory ${inAreaTest}. ` +
        'Restaurants marked closed, or announced but not yet open, are left out. ' +
        'A place that is not listed is not in the directory yet.',
    },
  ];

  const sections = [
    {
      id: 'hero_intro',
      type: 'hero_intro',
      content:
        `The Des Moines Insider restaurant directory lists ${n} restaurants in ${loc.name} right now. ` +
        `${listSentence}, and each name opens that restaurant's own page with the address, hours, price range ` +
        'and links the directory holds for it. Closed restaurants and ones that are announced but not yet open ' +
        'are left out.',
    },
    { id: 'live_listings', type: 'live_listings', heading: `Restaurants in ${loc.name}` },
    { id: 'faq', type: 'faq', heading: 'About this list', faqs },
  ];

  const related_pages = cuisinePages.map((p) => ({ slug: p.slug, title: p.title, relationship: 'child' as const }));

  return {
    id: `content-location__${[AREA_PAGE_CATEGORY, row.location].sort().join('_')}`,
    slug: row.slug,
    page_type_id: 'content-location',
    dimensions: [
      { name: content.name, slug: content.slug, tier: content.tier, dimension: 'content_type' },
      { name: loc.name, slug: loc.slug, tier: loc.tier, dimension: 'location' },
    ],
    seo: {
      title,
      h1,
      description,
      keywords: [
        `restaurants in ${loc.name.toLowerCase()}`,
        `${loc.name.toLowerCase()} restaurants`,
        `where to eat in ${loc.name.toLowerCase()}`,
        `restaurants in ${loc.name.toLowerCase()} iowa`,
      ],
      canonicalUrl: row.slug,
      ogType: 'website',
      ...(row.verdict === 'noindex' ? { robots: 'noindex, follow' } : {}),
    },
    sections,
    related_pages,
    structured_data: {
      '@type': 'WebPage',
      breadcrumb: [
        { name: 'Home', url: '/' },
        { name: 'Restaurants', url: '/restaurants' },
        { name: h1, url: row.slug },
      ],
      faqItems: faqs,
    },
    generation_meta: {
      generatedAt: new Date().toISOString(),
      generatedBy: DATA_TEMPLATE_GENERATOR,
      promptVersion: 'none',
      modelUsed: 'none',
      wordCount: JSON.stringify(sections).split(/\s+/).length,
      refreshSchedule: 'monthly',
      placeFingerprint: row.fingerprint,
      placeCount: n,
      sourceTable: 'restaurants',
    },
    is_published: true,
    quality_score: 0.8,
  };
}

/**
 * The city-wide cuisine page, /restaurants/<cuisine> (content-category), from
 * the rows. These were LLM-written and unreachable until RESTAURANT_CUISINE_SLUGS
 * gave them the SEO-065 fallback, so making them reachable would have put
 * unchecked copy in front of crawlers; this replaces it the way --rewrite-llm
 * replaced the area pages'. Its listing has no location filter, so "Des Moines"
 * here means the whole directory, suburbs included, and the copy says so.
 */
export function buildCitywidePage(row: CoverageRow, places: Restaurant[], today: string) {
  const content = contentTypeDimension.values.find((v) => v.slug === AREA_PAGE_CATEGORY);
  const cat = categoryDimension.values.find((v) => v.slug === row.category);
  if (!content || !cat) throw new Error(`${row.slug}: not in taxonomy`);
  const noun = NOUN[row.category] ?? {
    plural: `${cat.name} Restaurants`,
    inline: `${cat.name} restaurants`,
    singular: `${cat.name} restaurant`,
    matches: cat.name,
  };
  const n = places.length;
  const rated = places
    .filter((p) => p.rating !== null)
    .sort((a, b) => (b.rating as number) - (a.rating as number) || a.name.localeCompare(b.name));
  const topRated = rated.slice(0, 5);
  const ordered = [...places].sort(byRating);

  const towns = new Map<string, number>();
  for (const p of places) {
    const town = (p.city ?? '').trim();
    if (town) towns.set(town, (towns.get(town) ?? 0) + 1);
  }
  const commonTowns = [...towns]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5);

  const title = `${noun.plural} in Des Moines, Iowa`;
  const h1 = `${noun.plural} in Des Moines`;
  const lead = joinNames((topRated.length >= 2 ? topRated : ordered).slice(0, 2).map((p) => p.name));
  let description = `${n} ${noun.inline} in Des Moines and its suburbs, including ${lead}, listed from the Des Moines Insider restaurant directory.`;
  if (description.length > 160) {
    description = `${n} ${noun.inline} in Des Moines and its suburbs, listed from the Des Moines Insider restaurant directory.`;
  }

  const shown = Math.min(n, 12);
  const listSentence =
    n > shown
      ? `The list below shows ${shown} of them, read from the directory live and ordered by rating`
      : 'The list below is read from it live and ordered by rating';

  const faqs = [
    {
      question: `How many ${noun.inline} in Des Moines does Des Moines Insider list?`,
      answer:
        `As of ${today}, ${n}, counting Des Moines and its suburbs.` +
        (topRated.length
          ? ` By Google star rating, the highest rated are ${joinNames(
              topRated.map((p) => `${p.name} (${(p.rating as number).toFixed(1)})`),
            )}.`
          : ''),
    },
    ...(commonTowns.length
      ? [
          {
            question: `Where in the Des Moines area are the ${noun.inline}?`,
            answer:
              `By the city each listing records, the most are in ` +
              `${joinNames(commonTowns.map(([town, count]) => `${town} (${count})`))}.`,
          },
        ]
      : []),
    {
      question: `Why is a ${noun.singular} missing from this list?`,
      answer:
        `This page lists restaurants in the Des Moines Insider directory whose cuisine is recorded as ${noun.matches}. ` +
        'Restaurants marked closed, or announced but not yet open, are left out. ' +
        'A place that is not listed is not in the directory yet.',
    },
  ];

  const sections = [
    {
      id: 'hero_intro',
      type: 'hero_intro',
      content:
        `The Des Moines Insider restaurant directory lists ${n} ${noun.inline} in Des Moines and its suburbs right now. ` +
        `${listSentence}, and each name opens that restaurant's own page with the address, hours, price range ` +
        'and links the directory holds for it. Closed restaurants and ones that are announced but not yet open ' +
        'are left out.',
    },
    { id: 'live_listings', type: 'live_listings', heading: h1 },
    { id: 'faq', type: 'faq', heading: 'About this list', faqs },
  ];

  return {
    id: `content-category__${[AREA_PAGE_CATEGORY, row.category].sort().join('_')}`,
    slug: row.slug,
    page_type_id: 'content-category',
    dimensions: [
      { name: content.name, slug: content.slug, tier: content.tier, dimension: 'content_type' },
      { name: cat.name, slug: cat.slug, tier: cat.tier, dimension: 'category' },
    ],
    seo: {
      title,
      h1,
      description,
      keywords: [
        `${cat.name.toLowerCase()} restaurants des moines`,
        `${cat.name.toLowerCase()} des moines`,
        `best ${cat.name.toLowerCase()} des moines`,
        `${cat.name.toLowerCase()} restaurants in des moines iowa`,
      ],
      canonicalUrl: row.slug,
      ogType: 'website',
      ...(row.verdict === 'noindex' ? { robots: 'noindex, follow' } : {}),
    },
    sections,
    related_pages: [],
    structured_data: {
      '@type': 'WebPage',
      breadcrumb: [
        { name: 'Home', url: '/' },
        { name: 'Restaurants', url: '/restaurants' },
        { name: h1, url: row.slug },
      ],
      faqItems: faqs,
    },
    generation_meta: {
      generatedAt: new Date().toISOString(),
      generatedBy: DATA_TEMPLATE_GENERATOR,
      promptVersion: 'none',
      modelUsed: 'none',
      wordCount: JSON.stringify(sections).split(/\s+/).length,
      refreshSchedule: 'monthly',
      placeFingerprint: row.fingerprint,
      placeCount: n,
      sourceTable: 'restaurants',
    },
    is_published: true,
    quality_score: 0.8,
  };
}

const lit = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
const str = (v: string) => `'${v.replace(/'/g, "''")}'`;

async function main() {
  const E = env();
  const base = E.VITE_SUPABASE_URL;
  const key = E.VITE_SUPABASE_ANON_KEY;
  if (!base || !key) throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required.');

  const [pages, restaurants] = await Promise.all([
    fetchAll<PublishedPseoRow>(base, key, 'pseo_pages', 'id,slug,page_type_id,dimensions,seo,is_published,generation_meta,sections'),
    fetchAll<Restaurant>(base, key, 'restaurants', 'id,name,city,location,cuisine,status,is_merged,neighborhood,price_range,rating'),
  ]);
  const report = evaluateCoverage(pages, restaurants);
  const today = new Date().toISOString().slice(0, 10);
  const out: string[] = ['-- SEO-041 coverage rule. Generated by scripts/write-pseo-coverage-pages.ts', 'begin;'];

  const onlyIdx = process.argv.indexOf('--only');
  const only = onlyIdx > 0 ? new Set((process.argv[onlyIdx + 1] ?? '').split(',').filter(Boolean)) : null;
  const rewriteLlm = process.argv.includes('--rewrite-llm');

  // SEO-065: an area page links to the published, indexable cuisine pages for
  // its own area, by the heading those pages carry.
  const pageBySlug = new Map(pages.map((p) => [p.slug, p]));
  const cuisinePagesFor = (location: string): AreaCuisineLink[] =>
    report.rows
      .filter((r) => r.location === location && r.category !== AREA_PAGE_CATEGORY)
      .filter((r) => r.published && r.verdict === 'indexable' && !r.noindexed)
      .map((r) => {
        const seo = pageBySlug.get(r.slug)?.seo as { h1?: string; title?: string } | null | undefined;
        return { slug: r.slug, title: seo?.h1 ?? seo?.title ?? r.slug };
      });
  const build = (row: CoverageRow, places: Restaurant[]) =>
    row.location === CITYWIDE
      ? buildCitywidePage(row, places, today)
      : row.category === AREA_PAGE_CATEGORY
        ? buildAreaPage(row, places, today, cuisinePagesFor(row.location))
        : buildPage(row, places, today);

  for (const row of report.rows) {
    const places = matchingPlaces(restaurants, { slug: row.location, name: row.locationName }, row.category);
    const stale = row.published && row.templateFingerprint !== null && row.templateFingerprint !== row.fingerprint;

    if (row.verdict === 'indexable' && row.published === null) {
      if (only && !only.has(row.category)) {
        out.push(`-- skipped ${row.slug} (${row.places} places, indexable): not in --only`);
        continue;
      }
      const p = build(row, places);
      out.push(
        `insert into pseo_pages (id, slug, page_type_id, dimensions, seo, sections, related_pages, structured_data, generation_meta, is_published, quality_score, published_at) values (` +
          `${str(p.id)}, ${str(p.slug)}, ${str(p.page_type_id)}, ${lit(p.dimensions)}, ${lit(p.seo)}, ${lit(p.sections)}, ` +
          `${lit(p.related_pages)}, ${lit(p.structured_data)}, ${lit(p.generation_meta)}, true, ${p.quality_score}, now()) on conflict (id) do nothing;`,
      );
    } else if ((stale || (rewriteLlm && row.published && row.templateFingerprint === null)) && row.verdict !== 'not-generated') {
      // A stale data-built page, or (--rewrite-llm, SEO-060) a page whose copy
      // came from the LLM pipeline and may name places the table does not
      // hold. Both are rewritten from the current rows; seo.robots follows the
      // verdict, so a 3-4 place page comes out noindex.
      const p = build(row, places);
      // Only the area page (SEO-065) writes related_pages; a cuisine page's
      // stored links are left as they are.
      const related = row.category === AREA_PAGE_CATEGORY ? `related_pages = ${lit(p.related_pages)}, ` : '';
      out.push(
        `update pseo_pages set seo = ${lit(p.seo)}, sections = ${lit(p.sections)}, structured_data = ${lit(p.structured_data)}, ` +
          `${related}generation_meta = ${lit(p.generation_meta)}, updated_at = now() where slug = ${str(row.slug)};`,
      );
    } else if (row.published && row.verdict === 'noindex' && !row.noindexed) {
      out.push(`update pseo_pages set seo = seo || '{"robots":"noindex, follow"}'::jsonb, updated_at = now() where slug = ${str(row.slug)}; -- ${row.places} place(s)`);
    } else if (row.published && row.verdict === 'indexable' && row.noindexed) {
      out.push(`update pseo_pages set seo = seo - 'robots', updated_at = now() where slug = ${str(row.slug)}; -- ${row.places} places`);
    } else if (row.published && row.verdict === 'not-generated') {
      out.push(`update pseo_pages set is_published = false, updated_at = now() where slug = ${str(row.slug)}; -- ${row.places} place(s); add a 301`);
    }
  }
  out.push('commit;');
  process.stdout.write(`${out.join('\n')}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(`[write-pseo-coverage-pages] ${(err as Error).message}`);
    process.exit(1);
  });
}
