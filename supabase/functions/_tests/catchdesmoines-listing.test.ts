/**
 * Catch Des Moines list walk and the run-ledger horizon report (WEB-BE-051).
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_tests/catchdesmoines-listing.test.ts
 *
 * The pages are hand-built: the live list render is JS-loaded and this
 * container cannot reach the site. What is pinned is the walk's stopping rules
 * and what it reports, not Simpleview's markup.
 *
 * node:assert rather than std/assert deliberately: it needs no network.
 */

import { strict as assert } from 'node:assert';
import {
  centralHorizonDay,
  extractDetailUrls,
  latestEventDay,
  listingReport,
  listPageUrl,
  walkListing,
  type ListPage,
} from '../_shared/domain-adapters/catchdesmoinesListing.ts';

const BASE = 'https://www.catchdesmoines.com/events/';

const card = (id: number) => `<a href="/event/show-${id}/${id}/">Show ${id}</a>`;
const pageOf = (ids: number[]): ListPage => ({ ok: true, html: `<div>${ids.map(card).join('')}</div>` });

/** A fetcher that serves `pages` by skip offset and records what it was asked. */
function fakeSite(pages: Record<number, ListPage>) {
  const asked: string[] = [];
  const fetchPage = (url: string): Promise<ListPage> => {
    asked.push(url);
    const skip = Number(new URL(url).searchParams.get('skip') ?? '0');
    return Promise.resolve(pages[skip] ?? { ok: true, html: '<div></div>' });
  };
  return { asked, fetchPage };
}

const OPTS = { maxPages: 8, pageSize: 12, budgetMs: 75_000, now: () => 0 };

Deno.test('list URLs keep the adapter\'s params; page 1 has no skip', () => {
  const first = new URL(listPageUrl(BASE, 0, 12));
  assert.equal(first.searchParams.get('sort'), 'date');
  assert.equal(first.searchParams.get('view'), 'grid');
  assert.equal(first.searchParams.get('bounds'), 'false');
  assert.equal(first.searchParams.has('skip'), false);
  assert.equal(new URL(listPageUrl(BASE, 3, 12)).searchParams.get('skip'), '36');
});

Deno.test('detail links: relative and absolute, trailing slash added, others ignored', () => {
  const html = '<a href="/event/a-b/1">x</a>'
    + '<a href="https://catchdesmoines.com/event/c/22/">y</a>'
    + '<a href="/events/?page=2">next</a>'
    + '<a href="https://example.com/event/z/9/">off-site</a>';
  assert.deepEqual(extractDetailUrls(html), [
    'https://www.catchdesmoines.com/event/a-b/1/',
    'https://www.catchdesmoines.com/event/c/22/',
  ]);
});

Deno.test('a page that adds nothing new ends the walk as end_of_listing', async () => {
  const site = fakeSite({ 0: pageOf([1, 2]), 12: pageOf([3]), 24: pageOf([3, 2]) });
  const walk = await walkListing(BASE, site.fetchPage, OPTS);
  assert.equal(walk.listingStop, 'end_of_listing');
  assert.equal(walk.pagesRead, 3);
  assert.deepEqual(walk.urls.map((u) => u.split('/')[5]), ['1', '2', '3']);
});

Deno.test('every page new: the walk stops at maxPages and says so', async () => {
  const pages: Record<number, ListPage> = {};
  for (let p = 0; p < 8; p++) pages[p * 12] = pageOf([p * 10 + 1, p * 10 + 2]);
  const site = fakeSite(pages);
  const walk = await walkListing(BASE, site.fetchPage, OPTS);
  assert.equal(walk.listingStop, 'max_pages');
  assert.equal(walk.pagesRead, 8);
  assert.equal(site.asked.length, 8);
  assert.equal(walk.urls.length, 16);
});

Deno.test('budget spent: page 1 is still read, the walk stops as list_budget', async () => {
  let t = 0;
  const site = fakeSite({ 0: pageOf([1]), 12: pageOf([2]), 24: pageOf([3]) });
  const fetchPage = async (url: string) => {
    const r = await site.fetchPage(url);
    t += 40_000; // each render takes 40s
    return r;
  };
  const walk = await walkListing(BASE, fetchPage, { ...OPTS, now: () => t });
  // page 1 at t=0, page 2 at t=40s (inside 75s), page 3 at t=80s refused
  assert.equal(walk.listingStop, 'list_budget');
  assert.equal(walk.pagesRead, 2);
  assert.equal(walk.urls.length, 2);
});

Deno.test('a failed page is counted and skipped, not fatal', async () => {
  const site = fakeSite({
    0: pageOf([1]),
    12: { ok: false, error: 'render timeout' },
    24: pageOf([2]),
    36: pageOf([2]),
  });
  const walk = await walkListing(BASE, site.fetchPage, OPTS);
  assert.equal(walk.pagesFailed, 1);
  assert.equal(walk.pagesRead, 4);
  assert.equal(walk.listingStop, 'end_of_listing');
  assert.equal(walk.urls.length, 2);
});

Deno.test('horizon day is the Central date + 90, across DST and late-evening UTC', () => {
  assert.equal(centralHorizonDay(new Date('2026-11-15T18:00:00Z')), '2027-02-13');
  // 2026-11-16 03:00Z is still Nov 15 in Central (9 PM CST)
  assert.equal(centralHorizonDay(new Date('2026-11-16T03:00:00Z')), '2027-02-13');
  assert.equal(centralHorizonDay(new Date('2026-11-16T07:00:00Z')), '2027-02-14');
  // 2026-03-08 is the spring-forward day; adding days is calendar arithmetic
  assert.equal(centralHorizonDay(new Date('2026-03-01T18:00:00Z'), 10), '2026-03-11');
});

Deno.test('latest day ignores malformed dates and compares as days', () => {
  assert.equal(latestEventDay([]), null);
  assert.equal(
    latestEventDay([
      { date: '2026-12-01 19:31:58' },
      { date: 'TBA' },
      { date: '2027-01-09 20:00:00' },
      { date: '2026-12-31 23:59:59' },
    ]),
    '2027-01-09',
  );
});

Deno.test('report: detail budget left over, horizon not reached', () => {
  const walk = { urls: Array.from({ length: 96 }, (_, i) => `u${i}`), pagesRead: 8, pagesFailed: 0, listingStop: 'max_pages' as const };
  const r = listingReport(
    walk,
    { fetched: 80, skippedKnown: 6, parsed: [{ date: '2026-11-20 19:00:00' }, { date: '2026-12-02 19:31:58' }] },
    new Date('2026-11-16T18:00:00Z'),
  );
  assert.deepEqual(r, {
    pagesRead: 8,
    pagesFailed: 0,
    listingStop: 'max_pages',
    listed: 96,
    skippedKnown: 6,
    detailFetched: 80,
    detailBudgetLeft: 10,
    latestFetchedDay: '2026-12-02',
    horizonDay: '2027-02-14',
    reachedHorizon: false,
  });
});

Deno.test('report: reaching the horizon day counts as reached; no dated event never does', () => {
  const walk = { urls: ['a'], pagesRead: 1, pagesFailed: 0, listingStop: 'end_of_listing' as const };
  const now = new Date('2026-11-16T18:00:00Z');
  assert.equal(listingReport(walk, { fetched: 1, skippedKnown: 0, parsed: [{ date: '2027-02-14 10:00:00' }] }, now).reachedHorizon, true);
  assert.equal(listingReport(walk, { fetched: 1, skippedKnown: 0, parsed: [{ date: '2027-02-13 10:00:00' }] }, now).reachedHorizon, false);
  const none = listingReport(walk, { fetched: 1, skippedKnown: 0, parsed: [] }, now);
  assert.equal(none.latestFetchedDay, null);
  assert.equal(none.reachedHorizon, false);
});
