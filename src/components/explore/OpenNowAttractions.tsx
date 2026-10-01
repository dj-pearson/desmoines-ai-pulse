/**
 * "Open now" on /things-to-do (explore pass 2 WP1 item 4): attractions open
 * at this Central minute, with the count of what we can't know stated next to
 * the count we can.
 *
 * Rows come from useAttractions with the filters /attractions sends by default,
 * so both pages share one cache entry. Open status is attractionOpenStatus, the
 * same answer the attraction cards and detail page give. A row with no
 * readable hours for today is "unknown", not closed, and is left out of both
 * numbers; the line says "of N with listed hours" for that reason.
 *
 * Nothing renders under the build-time prerender (the HTML would freeze one
 * minute's answer), while loading, or when nothing is open. When it does
 * render, the card strip has a fixed height, so the minute ticking over
 * changes text, not layout.
 */
import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAttractions } from '@/hooks/useAttractions';
import { useDeals, filterDealsByWhen } from '@/hooks/useDeals';
import { useNow } from '@/hooks/useNow';
import { useWeather, reorderForWeather } from '@/hooks/useWeather';
import { attractionOpenStatus } from '@/lib/attractionHours';
import { formatOpenStatusLine } from '@/lib/restaurantHours';
import { attractionHref } from '@/lib/dashboardItems';
import { formatCount } from '@/lib/pluralize';
import { isPrerender } from '@/lib/isPrerender';
import { handleError, ErrorSeverity } from '@/lib/errorHandler';
import { HUB_DEALS_NOW_HREF, HUB_OPEN_NOW_HREF } from '@/lib/hubLinks';
import type { Database } from '@/integrations/supabase/types';

type Attraction = Database['public']['Tables']['attractions']['Row'];

/** How many cards the strip shows. */
const OPEN_NOW_LIMIT = 6;

/**
 * The filters /attractions passes with no URL params (Attractions.tsx: no
 * total, name sort since explore-pass2 WP3 item 2). Undefined fields drop out
 * of the key, so this is the same TanStack entry.
 */
const ATTRACTIONS_DEFAULT_FILTERS = { countMode: 'none', sortBy: 'alphabetical' } as const;

interface OpenRow {
  attraction: Attraction;
  statusLine: string | null;
}

interface OpenNowSummary {
  open: OpenRow[];
  /** Active rows with coordinates whose hours say anything about today. */
  listed: number;
}

function summariseOpenNow(rows: readonly Attraction[], now: Date): OpenNowSummary {
  const open: OpenRow[] = [];
  let listed = 0;
  for (const a of rows) {
    if (a.is_active === false || a.latitude == null || a.longitude == null) continue;
    const status = attractionOpenStatus(a.hours, a.hours_summary, now);
    if (status.status === 'unknown') continue;
    listed += 1;
    if (status.isOpen) open.push({ attraction: a, statusLine: formatOpenStatusLine(status) });
  }
  return { open, listed };
}

function tags(a: Attraction): string {
  const out: string[] = [];
  if (a.is_free === true) out.push('Free');
  if (a.is_indoor === true) out.push('Indoor');
  if (a.is_kid_friendly === true) out.push('Kids');
  return out.join(', ');
}

export function OpenNowAttractions() {
  const prerender = isPrerender();
  const now = useNow(60_000);
  const { attractions, isLoading, error } = useAttractions(ATTRACTIONS_DEFAULT_FILTERS);
  const { weather, hasVerdict } = useWeather();
  const deals = useDeals('all');

  useEffect(() => {
    // WARNING: reported, no toast. The hub is whole without this block.
    if (error) handleError(new Error(error), { component: 'OpenNowAttractions', action: 'attractions' }, ErrorSeverity.WARNING);
  }, [error]);
  useEffect(() => {
    if (deals.isError) handleError(deals.error, { component: 'OpenNowAttractions', action: 'deals' }, ErrorSeverity.WARNING);
  }, [deals.isError, deals.error]);

  const summary = useMemo(() => summariseOpenNow(attractions, now), [attractions, now]);
  const cards = useMemo(() => {
    const ordered = hasVerdict
      ? reorderForWeather(summary.open, (r) => r.attraction.is_indoor, weather)
      : summary.open;
    return ordered.slice(0, OPEN_NOW_LIMIT);
  }, [summary.open, hasVerdict, weather]);
  const liveDeals = useMemo(
    () => (deals.data ? filterDealsByWhen(deals.data, 'now', now).length : 0),
    [deals.data, now],
  );

  if (prerender || isLoading) return null;
  if (cards.length === 0 && liveDeals === 0) return null;

  const dealsLine =
    liveDeals > 0 ? (
      <p className="mt-1 text-sm">
        <Link
          to={HUB_DEALS_NOW_HREF}
          className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4"
        >
          {formatCount(liveDeals, 'deal')} running now
        </Link>
      </p>
    ) : null;

  if (cards.length === 0) {
    return (
      <div className="container mx-auto px-4" data-open-now="">
        {dealsLine}
      </div>
    );
  }

  return (
    <section className="container mx-auto px-4 pt-4" aria-labelledby="open-now-heading" data-open-now="">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="open-now-heading" className="text-xl font-semibold">
          Open now
        </h2>
        <Link
          to={HUB_OPEN_NOW_HREF}
          className="inline-flex min-h-11 items-center text-sm font-medium text-foreground underline underline-offset-4"
        >
          See all open now
        </Link>
      </div>
      <p className="mb-3 h-6 truncate text-sm text-muted-foreground">
        {summary.open.length} of {formatCount(summary.listed, 'attraction')} with listed hours
      </p>
      <ul className="-mx-4 flex h-[7.5rem] gap-3 overflow-x-auto px-4 pb-1 lg:mx-0 lg:grid lg:grid-cols-6 lg:overflow-visible lg:px-0">
        {cards.map(({ attraction, statusLine }) => {
          const extra = tags(attraction);
          return (
            <li key={attraction.id} className="h-full w-52 shrink-0 lg:w-auto">
              <Link
                to={attractionHref(attraction)}
                className="flex h-full flex-col rounded-xl border border-border bg-card p-3 transition-colors hover:bg-accent"
              >
                <span className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
                  {attraction.name}
                </span>
                <span className="mt-auto truncate text-sm text-foreground">{statusLine}</span>
                <span className="h-5 truncate text-xs text-muted-foreground">{extra}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {dealsLine}
    </section>
  );
}
