/**
 * Catch Des Moines list walk and how far ahead a run read (WEB-BE-051).
 *
 * Pure: the page fetcher and the clock are passed in, so the walk runs offline
 * in a test. catchdesmoines.ts supplies the Browserless render.
 *
 * WHAT THIS RECORDS AND WHY. The Python crawler (crawlers/catchdesmoines_crawler
 * .py) writes pagesRead / latestListedDay / horizonDay / listingStop to its run
 * row. The adapter that firecrawl-scraper and ai-crawler use recorded nothing:
 * a run that read eight list pages and one that read one after a budget stop
 * looked the same in automation_job_runs, so nobody could say whether raising
 * MAX_LIST_PAGES would reach further out or only spend more renders.
 *
 * The day is `latestFetchedDay`, NOT the Python crawler's `latestListedDay`.
 * The list render carries no dates this adapter parses (it regexes detail links
 * out of the HTML), so the furthest day this path knows is the latest start
 * among the detail pages it fetched. That is also the furthest day that could
 * reach the events table this run, which is the number the horizon is about.
 * The two names differ so the two job rows are not compared as if they were
 * the same measurement.
 */

import type { AdapterEvent, AdapterListingReport, ListingStop } from "./types.ts";

export const SITE_ORIGIN = "https://www.catchdesmoines.com";
export const HORIZON_DAYS = 90;

const VALID_DETAIL_PATH = /^\/event\/[a-z0-9-]+\/\d+\/?$/i;
const EVENT_LINK_RE =
  /href="(https?:\/\/(?:www\.)?catchdesmoines\.com)?(\/event\/[a-z0-9-]+\/\d+\/?)"/gi;
const CENTRAL_DAY_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[ T]|$)/;

export interface ListPage {
  ok: boolean;
  html?: string;
  error?: string;
}

export interface WalkOptions {
  maxPages: number;
  pageSize: number;
  budgetMs: number;
  /** Milliseconds clock; Date.now in production. */
  now?: () => number;
}

export interface ListingWalk {
  /** Detail URLs in list order (the list sorts by date). */
  urls: string[];
  /** List pages requested, failed ones included. */
  pagesRead: number;
  pagesFailed: number;
  listingStop: ListingStop;
}

/** The list URL for page `page` (0-based), as the adapter has always built it. */
export function listPageUrl(baseUrl: string, page: number, pageSize: number): string {
  const pageUrl = new URL(baseUrl);
  pageUrl.searchParams.set("bounds", "false");
  pageUrl.searchParams.set("view", "grid");
  pageUrl.searchParams.set("sort", "date");
  if (page > 0) pageUrl.searchParams.set("skip", String(page * pageSize));
  return pageUrl.toString();
}

/** `/event/<slug>/<id>/` links in a rendered list page, absolute, in order. */
export function extractDetailUrls(html: string): string[] {
  const out: string[] = [];
  EVENT_LINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EVENT_LINK_RE.exec(html)) !== null) {
    const path = m[2];
    if (!VALID_DETAIL_PATH.test(path)) continue;
    out.push(`${SITE_ORIGIN}${path.replace(/\/?$/, "/")}`);
  }
  return out;
}

/**
 * Walk the list pages. Behaviour is the adapter's existing walk, unchanged:
 * page 1 is always read; from page 2 on the walk stops when the time budget is
 * spent, when a page adds no new URL, or at maxPages; a failed page is skipped,
 * not fatal. What is new is that the walk says which of those ended it.
 */
export async function walkListing(
  baseUrl: string,
  fetchPage: (url: string) => Promise<ListPage>,
  opts: WalkOptions,
): Promise<ListingWalk> {
  const now = opts.now ?? Date.now;
  const seen = new Set<string>();
  const urls: string[] = [];
  const startedAt = now();
  let pagesRead = 0;
  let pagesFailed = 0;

  for (let page = 0; page < opts.maxPages; page++) {
    if (page > 0 && now() - startedAt > opts.budgetMs) {
      console.log(
        `  [catchdesmoines] list budget spent after ${page} page(s); continuing with ${urls.length} URL(s)`,
      );
      return { urls, pagesRead, pagesFailed, listingStop: "list_budget" };
    }
    const pageUrl = listPageUrl(baseUrl, page, opts.pageSize);
    console.log(`  [catchdesmoines] list page ${page + 1}/${opts.maxPages}: ${pageUrl}`);

    pagesRead++;
    const result = await fetchPage(pageUrl);
    if (!result.ok || !result.html) {
      pagesFailed++;
      console.log(`  [catchdesmoines] list page ${page + 1} failed: ${result.error}`);
      continue;
    }

    let added = 0;
    for (const url of extractDetailUrls(result.html)) {
      if (seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
      added++;
    }
    console.log(`  -> page added ${added} new URL(s) (total ${urls.length})`);
    if (page > 0 && added === 0) {
      return { urls, pagesRead, pagesFailed, listingStop: "end_of_listing" };
    }
  }

  return { urls, pagesRead, pagesFailed, listingStop: "max_pages" };
}

/** The Central calendar day ("YYYY-MM-DD") `days` after `now`'s Central day. */
export function centralHorizonDay(now: Date, days = HORIZON_DAYS): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const d = new Date(Date.UTC(get("year"), get("month") - 1, get("day") + days));
  return d.toISOString().slice(0, 10);
}

/**
 * The latest Central start day among parsed events. AdapterEvent.date is
 * already Central wall clock ("YYYY-MM-DD HH:MM:SS"), so the day is its first
 * ten characters; a malformed date is ignored rather than allowed to win.
 */
export function latestEventDay(items: ReadonlyArray<Pick<AdapterEvent, "date">>): string | null {
  let latest: string | null = null;
  for (const item of items) {
    const m = CENTRAL_DAY_RE.exec(item.date ?? "");
    if (!m) continue;
    const day = `${m[1]}-${m[2]}-${m[3]}`;
    if (latest === null || day > latest) latest = day;
  }
  return latest;
}

/** What goes on the run row: the walk, the detail budget, and the day reached. */
export function listingReport(
  walk: ListingWalk,
  detail: { fetched: number; skippedKnown: number; parsed: ReadonlyArray<Pick<AdapterEvent, "date">> },
  now: Date,
): AdapterListingReport {
  const latestFetchedDay = latestEventDay(detail.parsed);
  const horizonDay = centralHorizonDay(now);
  return {
    pagesRead: walk.pagesRead,
    pagesFailed: walk.pagesFailed,
    listingStop: walk.listingStop,
    listed: walk.urls.length,
    skippedKnown: detail.skippedKnown,
    detailFetched: detail.fetched,
    // Listings found on the list pages that the detail budget left unread. Not
    // zero means MAX_DETAIL_PAGES, not the list walk, set the horizon.
    detailBudgetLeft: Math.max(0, walk.urls.length - detail.skippedKnown - detail.fetched),
    latestFetchedDay,
    horizonDay,
    reachedHorizon: latestFetchedDay !== null && latestFetchedDay >= horizonDay,
  };
}
