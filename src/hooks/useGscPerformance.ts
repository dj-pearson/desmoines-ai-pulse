import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Reads the Google Search Console tables that gsc-sync-data writes into and
 * shapes them for the SEO admin surface.
 *
 * Two things about this data are easy to get wrong and are handled here rather
 * than at the call site:
 *
 * 1. FRESHNESS IS PART OF THE ANSWER. Until SEO-023 the sync had run exactly
 *    once, on 2026-03-31, and was on no schedule - so every number here was five
 *    months old while looking current. A panel that renders 1,630 keywords
 *    without saying when they were measured is how that went unnoticed.
 *    20260831000001_gsc_sync_cron.sql now runs it daily, but the reason to keep
 *    reporting freshness is that a schedule can stop too: pg_cron records a job
 *    as SUCCEEDED when net.http_post enqueues, not when the sync lands. windowEnd
 *    and daysStale are the only signals here that come from the data itself, so
 *    they are returned alongside the metrics rather than as a footnote.
 * 2. POSTGREST RETURNS BIGINT AS A JSON STRING. impressions is BIGINT, so
 *    a.impressions + b.impressions concatenates instead of adding and the result
 *    still looks like a plausible number. Everything numeric goes through toNum().
 */

/** Google invalidates a refresh token that goes unused for six months. */
const REFRESH_TOKEN_IDLE_LIMIT_DAYS = 180;

/** Supabase caps a single response at 1000 rows; both perf tables are larger. */
const PAGE_SIZE = 1000;

/**
 * Raised from 20,000 by SEO-023, which is the story that made it matter.
 * Backfilling 16 months took gsc_page_performance from 2,060 rows to 15,239 in
 * one afternoon, and the daily sync adds roughly 90 more - so the old ceiling
 * was about seven weeks away. Hitting it is the bad kind of failure: the loop
 * stops, reports no error, and the panel shows a smaller total that still looks
 * like a number. The read is ordered by date descending, so what would vanish
 * is the oldest history, which is exactly the before-and-after this data was
 * backfilled to provide.
 */
const MAX_ROWS = 60000;

const DAY_MS = 24 * 60 * 60 * 1000;

function toNum(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function daysBetween(from: string | null, to: Date): number | null {
  if (!from) return null;
  const parsed = Date.parse(from);
  if (Number.isNaN(parsed)) return null;
  return Math.floor((to.getTime() - parsed) / DAY_MS);
}

export interface KeywordRecord {
  query: string;
  date: string;
  impressions: unknown;
  clicks: unknown;
  position: unknown;
}

export interface PageRecord {
  page_url: string;
  date: string;
  impressions: unknown;
  clicks: unknown;
  position: unknown;
}

export interface GscPropertyRecord {
  property_url: string;
  last_sync_at: string | null;
  next_sync_at: string | null;
  sync_enabled: boolean | null;
}

/**
 * Reads every row of a table in PAGE_SIZE chunks. A plain select() stops at the
 * server's max-rows and reports no error, which would silently truncate the
 * aggregate rather than fail it.
 */
async function fetchAllRows<T extends KeywordRecord | PageRecord>(
  table: "gsc_keyword_performance" | "gsc_page_performance",
  columns: string,
  propertyId: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq("property_id", propertyId)
      .order("date", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    const page = (data ?? []) as unknown as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

export interface GscQueryRow {
  query: string;
  impressions: number;
  clicks: number;
  /** Impression-weighted mean position across the window. */
  position: number;
  ctr: number;
}

export interface GscPageRow {
  pageUrl: string;
  impressions: number;
  clicks: number;
  position: number;
  ctr: number;
}

export interface GscFreshness {
  propertyUrl: string;
  /** gsc_properties.last_sync_at - when the sync job last ran. */
  lastSyncAt: string | null;
  /** Newest date in the performance tables - how current the data itself is. */
  windowStart: string | null;
  windowEnd: string | null;
  daysStale: number | null;
  /** Days until the OAuth refresh token lapses from disuse, negative once past. */
  refreshTokenDaysRemaining: number | null;
  syncEnabled: boolean;
  nextSyncAt: string | null;
}

export interface GscPerformance {
  freshness: GscFreshness;
  totals: { queries: number; impressions: number; clicks: number; ctr: number };
  /** AC5 Q1: ranking on page 2-3, where a small move earns traffic. */
  pageTwoOpportunities: GscQueryRow[];
  /** AC5 Q2: page-one placement earning no clicks - a title/description problem. */
  impressionsWithoutClicks: GscPageRow[];
  topQueries: GscQueryRow[];
  topPages: GscPageRow[];
}

interface Accumulated {
  impressions: number;
  clicks: number;
  weightedPosition: number;
}

function accumulate<T extends KeywordRecord | PageRecord>(
  rows: T[],
  keyOf: (row: T) => string,
): Map<string, Accumulated> {
  const byKey = new Map<string, Accumulated>();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    const impressions = toNum(row.impressions);
    const entry = byKey.get(key) ?? { impressions: 0, clicks: 0, weightedPosition: 0 };
    entry.impressions += impressions;
    entry.clicks += toNum(row.clicks);
    entry.weightedPosition += toNum(row.position) * impressions;
    byKey.set(key, entry);
  }
  return byKey;
}

function finalize(entry: Accumulated) {
  return {
    impressions: entry.impressions,
    clicks: entry.clicks,
    // Weighted by impressions so a query seen once at position 3 does not
    // outrank one seen 900 times at position 11.
    position: entry.impressions > 0 ? entry.weightedPosition / entry.impressions : 0,
    ctr: entry.impressions > 0 ? (entry.clicks / entry.impressions) * 100 : 0,
  };
}

function maxDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function minDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

/**
 * Pure aggregation, separated from the fetch so it can be tested without a
 * database. `now` is a parameter for the same reason - the freshness figures are
 * the point of this panel and a test that cannot pin the clock cannot assert them.
 */
export function aggregateGscPerformance(
  property: GscPropertyRecord,
  keywordRows: KeywordRecord[],
  pageRows: PageRecord[],
  now: Date = new Date(),
): GscPerformance {
  let windowStart: string | null = null;
  let windowEnd: string | null = null;
  for (const row of [...keywordRows, ...pageRows]) {
    windowStart = minDate(windowStart, row.date ?? null);
    windowEnd = maxDate(windowEnd, row.date ?? null);
  }

  const byQuery = accumulate(keywordRows, (r) => r.query);
  const byPage = accumulate(pageRows, (r) => r.page_url);

  const queries: GscQueryRow[] = [...byQuery.entries()]
    .map(([query, entry]) => ({ query, ...finalize(entry) }))
    .sort((a, b) => b.impressions - a.impressions);

  const pages: GscPageRow[] = [...byPage.entries()]
    .map(([pageUrl, entry]) => ({ pageUrl, ...finalize(entry) }))
    .sort((a, b) => b.impressions - a.impressions);

  const totalImpressions = queries.reduce((sum, q) => sum + q.impressions, 0);
  const totalClicks = queries.reduce((sum, q) => sum + q.clicks, 0);

  // The refresh token's clock runs from when it was last USED, which is the
  // property's last sync, not from when the credential row was created.
  const idleDays = daysBetween(property.last_sync_at, now);

  return {
    freshness: {
      propertyUrl: property.property_url,
      lastSyncAt: property.last_sync_at,
      windowStart,
      windowEnd,
      daysStale: daysBetween(windowEnd, now),
      refreshTokenDaysRemaining:
        idleDays === null ? null : REFRESH_TOKEN_IDLE_LIMIT_DAYS - idleDays,
      syncEnabled: property.sync_enabled ?? false,
      nextSyncAt: property.next_sync_at,
    },
    totals: {
      queries: queries.length,
      impressions: totalImpressions,
      clicks: totalClicks,
      ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
    },
    // Page 2-3 is positions 11-30. Below 30 is not one edit away from traffic.
    pageTwoOpportunities: queries
      .filter((q) => q.position >= 11 && q.position <= 30 && q.impressions > 0)
      .slice(0, 25),
    // Page-one placement (<=10) with no clicks is the snippet failing, not the
    // ranking. A page that never ranks has a different problem and is excluded.
    impressionsWithoutClicks: pages
      .filter((p) => p.position > 0 && p.position <= 10 && p.clicks === 0 && p.impressions > 0)
      .slice(0, 25),
    topQueries: queries.slice(0, 25),
    topPages: pages.slice(0, 25),
  };
}

async function fetchGscPerformance(): Promise<GscPerformance | null> {
  const { data: property, error: propertyError } = await supabase
    .from("gsc_properties")
    .select("id, property_url, last_sync_at, next_sync_at, sync_enabled")
    .order("last_sync_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (propertyError) throw new Error(propertyError.message);
  if (!property) return null;

  const [keywordRows, pageRows] = await Promise.all([
    fetchAllRows<KeywordRecord>(
      "gsc_keyword_performance",
      "query, date, impressions, clicks, position",
      property.id,
    ),
    fetchAllRows<PageRecord>(
      "gsc_page_performance",
      "page_url, date, impressions, clicks, position",
      property.id,
    ),
  ]);

  return aggregateGscPerformance(property, keywordRows, pageRows);
}

/**
 * Google Search Console performance for the connected property, or null when no
 * property has been connected yet. Admin-only: the gsc_* tables carry
 * admin-scoped RLS, so this returns nothing useful outside the admin surface.
 */
export function useGscPerformance() {
  return useQuery({
    queryKey: ["gsc-performance"],
    queryFn: fetchGscPerformance,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
