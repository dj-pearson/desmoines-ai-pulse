import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Search performance on /advertise (WEB-ADS-012).
 *
 * WHAT THIS USED TO DO, and it was shown to people about to spend money:
 * get_platform_advertising_metrics sums impressions and clicks out of
 * gsc_keyword_performance - GOOGLE SEARCH CONSOLE - and this component
 * presented them under "Platform Reach" and "Real audience data" as monthly
 * impressions and monthly clicks. A search impression is a listing appearing
 * in results. It is not a visit, and it is certainly not an ad impression on
 * this site.
 *
 * Worse: GSC has never synced (WEB-SEO-014), so the RPC returns zeros, and the
 * component fell back to HARDCODED numbers marked with an asterisk that read
 * "sync pending". An asterisk claiming an estimate implies an estimate OF
 * something. Those figures were invented, and they are the only numbers any
 * advertiser has ever seen on this page.
 *
 * Now: no fallback values at all, and the block renders NOTHING until there is
 * a real sample (AC3). What it does render is labelled as what it is - search
 * performance, not audience reach.
 *
 * STILL TO DO (AC2): source site visits from user_analytics instead, which
 * needs a new SECURITY DEFINER RPC and therefore a migration. Until that lands
 * this reports the one thing it can actually measure, honestly labelled.
 */

/**
 * Below this, the block hides rather than publishing a number nobody should
 * plan a spend against. Seven days is the shortest window that survives one
 * quiet weekend.
 */
export const MIN_DATA_DAYS = 7;

/** True only when the window is long enough AND something was measured in it. */
export function hasReportableSample(data: PlatformMetricsData | null): boolean {
  if (!data) return false;
  return data.data_days >= MIN_DATA_DAYS && (data.monthly_impressions > 0 || data.monthly_clicks > 0);
}

interface PlatformMetricsData {
  monthly_impressions: number;
  monthly_clicks: number;
  avg_ctr: number;
  data_days: number;
}

export function formatMetricNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

interface StatProps {
  label: string;
  value: string;
  sub: string;
}

function Stat({ label, value, sub }: StatProps) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">{value}</dd>
      <dd className="text-xs text-muted-foreground">{sub}</dd>
    </div>
  );
}

/**
 * Renders NOTHING until the read resolves, and nothing after it unless there
 * is a reportable sample (business plan WP1 item 10). It used to draw three
 * skeleton cards that then vanished on every visit, because the sample is
 * almost never there: that was layout shift for a block that didn't appear.
 */
export function PlatformMetrics() {
  const [data, setData] = useState<PlatformMetricsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { data: result, error } = await supabase.rpc("get_platform_advertising_metrics" as never);

        if (!cancelled) {
          if (!error && result) {
            setData(result as unknown as PlatformMetricsData);
          }
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  // No fallback values. A number here is one an advertiser plans a budget
  // against, so the only honest options are a measured one or none at all.
  if (loading || !data || !hasReportableSample(data)) return null;

  return (
    <section aria-labelledby="search-performance-heading" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 id="search-performance-heading" className="text-lg font-semibold">
            Search Performance
          </h2>
          <p className="text-sm text-muted-foreground">
            How often our pages appear in Google results, last 30 days
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          Based on {data.data_days} days of data
        </span>
      </div>

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat
          label="Search Impressions"
          value={formatMetricNumber(data.monthly_impressions)}
          sub="Times our pages appeared in Google results"
        />
        <Stat
          label="Search Clicks"
          value={formatMetricNumber(data.monthly_clicks)}
          sub="Visits that started from a Google result"
        />
        <Stat
          label="Avg. Search CTR"
          value={`${data.avg_ctr}%`}
          sub="Click-through rate from impressions"
        />
      </dl>

      <p className="max-w-prose text-xs text-muted-foreground">
        Google Search Console, last 30 days. These are search impressions, not ad
        impressions: they show how often our pages surface in results, which is
        how most readers arrive. Your campaign is served to people already
        browsing Des Moines events, restaurants and attractions.
      </p>
    </section>
  );
}
