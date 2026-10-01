import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { CATEGORY_FILTERS, dayAfter } from '../listingFilters';
import {
  allowedPeriod,
  buildTimeRelativePage,
  HUB_DUPLICATES,
  isTimeRelative,
  rowText,
  staleTimeWords,
  timeDimension,
  TIME_COPY_CATEGORIES,
} from '../timeRelative';
import { statementFor } from '../../../scripts/write-pseo-time-relative-pages';

/**
 * SEO-056. /festivals/today was generated on 2026-03-17 and still told
 * October visitors that "March 17th in Des Moines means one thing". These pin
 * the detector that found it and the template that replaced it.
 */

const OCT_1 = new Date(2026, 9, 1, 12);
const MAR_17 = new Date(2026, 2, 17, 12);
const dims = (...pairs: Array<[string, string, string?]>) =>
  pairs.map(([dimension, slug, name]) => ({ dimension, slug, name: name ?? slug }));

const words = (text: string, slug: string | null, now: Date) => staleTimeWords(text, allowedPeriod(slug, now)).map((h) => h.word);

describe('staleTimeWords', () => {
  const march = "March 17th in Des Moines means one thing: the city goes green for St. Patrick's Day and spring's arrival.";

  it('flags the March copy on a today page in October', () => {
    expect(words(march, 'today', OCT_1)).toEqual(expect.arrayContaining(['March', "St. Patrick's Day"]));
  });

  it('matches curly apostrophes and accented spellings', () => {
    expect(words('St. Patrick\u2019s parade, D\u00eda de los Muertos', 'july', OCT_1)).toEqual(["St. Patrick's Day"]);
    expect(words('D\u00eda de los Muertos', 'july', new Date(2026, 5, 1))).toEqual(['Day of the Dead']);
  });

  it('leaves the same copy alone on the day it was written', () => {
    expect(words(march, 'today', MAR_17)).toEqual([]);
  });

  it("lets a page name its own period: August on /festivals/august, fall's months on /x/fall", () => {
    expect(words('The Iowa State Fair fills August.', 'august', OCT_1)).toEqual([]);
    expect(words('Dated in September, October and November, the fall season.', 'fall', MAR_17)).toEqual([]);
  });

  it('treats a year before the next instance as stale', () => {
    // In October 2026, /festivals/august means August 2027.
    expect(words('Your 2026 guide to August', 'august', OCT_1)).toEqual(['2026']);
    expect(words('Your 2026 guide to August', 'august', new Date(2026, 6, 1))).toEqual([]);
  });

  it('does not read verbs as months or seasons', () => {
    expect(words('Prices may fall and hot springs may open. May we suggest a coat?', 'today', OCT_1)).toEqual([]);
  });

  it('reads them when they are the season or month', () => {
    expect(words('Plan ahead for spring festivals; in May the patios open.', 'today', OCT_1)).toEqual(['May', 'spring']);
  });
});

describe('timeDimension / isTimeRelative', () => {
  it('classifies live windows, months and seasons', () => {
    expect(timeDimension(dims(['temporal', 'today']))).toEqual({ slug: 'today', kind: 'live' });
    expect(timeDimension(dims(['temporal', 'december']))).toEqual({ slug: 'december', kind: 'month' });
    expect(timeDimension(dims(['temporal', 'winter']))).toEqual({ slug: 'winter', kind: 'season' });
    expect(timeDimension(dims(['category', 'mexican'], ['location', 'ankeny']))).toBeNull();
  });

  it('falls back to the slug for holidays', () => {
    expect(isTimeRelative({ slug: '/events/halloween', dimensions: [] })).toBe(true);
    expect(isTimeRelative({ slug: '/mexican/ankeny', dimensions: [] })).toBe(false);
  });
});

describe('buildTimeRelativePage', () => {
  const temporal = ['today', 'this-weekend', 'august', 'december', 'spring', 'summer', 'fall', 'winter'];
  const heads: Array<[string, string, string]> = [
    ['category', 'festivals', 'Festivals'],
    ['category', 'live-music', 'Live Music'],
    ['category', 'mexican', 'Mexican'],
    ['category', 'brunch', 'Brunch'],
    ['content_type', 'things-to-do', 'Things to Do'],
    ['audience', 'families', 'For Families'],
  ];

  it('never names a month, season, holiday or year outside the window, on any day of the year', () => {
    for (const h of heads) {
      for (const t of temporal) {
        const page = buildTimeRelativePage(dims(h, ['temporal', t]))!;
        const text = rowText({ seo: page.seo, sections: page.sections, structured_data: { faqItems: page.faqs } });
        for (let m = 0; m < 12; m++) {
          expect(words(text, t, new Date(2026, m, 15, 12)), `${h[1]}/${t} in month ${m + 1}`).toEqual([]);
        }
      }
    }
  });

  it('renders the live listing between an intro and an FAQ', () => {
    const page = buildTimeRelativePage(dims(['category', 'festivals', 'Festivals'], ['temporal', 'today', 'Today']))!;
    expect(page.sections.map((s) => s.type)).toEqual(['hero_intro', 'live_listings', 'faq']);
    expect(page.sections[1].emptyHref).toBe('/events/today');
    expect(page.seo.h1).toBe('Festivals in Des Moines Today');
  });

  it('says plainly that a restaurant list does not change with the date', () => {
    const page = buildTimeRelativePage(dims(['category', 'mexican', 'Mexican'], ['temporal', 'this-weekend']))!;
    expect(page.entity).toBe('restaurants');
    expect(page.sections[0].content).toContain('the list is the same this weekend as the rest of the year');
  });

  it('says an audience page is not filtered by audience', () => {
    const page = buildTimeRelativePage(dims(['audience', 'families', 'For Families'], ['temporal', 'fall']))!;
    expect(page.sections[0].content).toContain('rather than a family selection');
  });

  it('returns null for a page with no time dimension', () => {
    expect(buildTimeRelativePage(dims(['category', 'mexican'], ['location', 'ankeny']))).toBeNull();
  });

  it('describes only categories CATEGORY_FILTERS filters, for the same table', () => {
    for (const [entity, slugs] of Object.entries(TIME_COPY_CATEGORIES)) {
      for (const slug of slugs) expect(CATEGORY_FILTERS[slug]?.entity, slug).toBe(entity);
    }
  });
});

describe('HUB_DUPLICATES', () => {
  it('each has its 301 in public/_redirects', () => {
    const lines = readFileSync('public/_redirects', 'utf8').split(/\r?\n/).map((l) => l.trim().split(/\s+/));
    for (const [from, to] of Object.entries(HUB_DUPLICATES)) {
      expect(lines.some(([s, t, c]) => s === from && t === to && c === '301'), from).toBe(true);
    }
  });
});

describe('write-pseo-time-relative-pages statementFor', () => {
  const row = (slug: string, d: ReturnType<typeof dims>) => ({ slug, dimensions: d, seo: { canonicalUrl: slug, ogType: 'website' }, is_published: true });

  it('unpublishes a hub duplicate', () => {
    const sql = statementFor(row('/things-to-do/today', dims(['content_type', 'things-to-do'], ['temporal', 'today'])), 'now')!;
    expect(sql).toMatch(/^update pseo_pages set is_published = false/);
  });

  it('rewrites a time-relative page and tags the generator', () => {
    const sql = statementFor(row('/festivals/today', dims(['category', 'festivals', 'Festivals'], ['temporal', 'today', 'Today'])), 'now')!;
    expect(sql).toContain('seo-056-time-template');
    expect(sql).toContain("where slug = '/festivals/today';");
  });

  it('leaves other pages alone', () => {
    expect(statementFor(row('/mexican/ankeny', dims(['category', 'mexican'], ['location', 'ankeny'])), 'now')).toBeNull();
  });
});

describe('dayAfter', () => {
  it('rolls month and year ends', () => {
    expect(dayAfter('2026-10-04')).toBe('2026-10-05');
    expect(dayAfter('2026-02-28')).toBe('2026-03-01');
    expect(dayAfter('2026-12-31')).toBe('2027-01-01');
  });
});
