import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Audience figures on /advertise (WEB-ADS-012).
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
 * "sync pending". Those figures were invented, and they are the only numbers
 * any advertiser has ever seen on this page.
 *
 * Now: no fallback values at all, and the block renders NOTHING until there is
 * a real sample (AC3).
 *
 * AC2: site visits and page views come from user_analytics through
 * get_site_audience_metrics (migration 20261107000071), which returns three
 * aggregates and no rows. When that sample is reportable it is what this block
 * shows. The search block is the fallback, kept so the page behaves exactly as
 * before until the migration is applied (the new RPC answers PGRST202 until
 * then, which reads here as "no sample").
 */

/**
 * Below this, the block hides rather than publishing a number nobody should
 * plan a spend against. Seven days is the shortest window that survives one
 * quiet weekend.
 */
export const MIN_DATA_DAYS = 7;

interface PlatformMetricsData {
  monthly_impressions: number;
  monthly_clicks: number;
  avg_ctr: number;
  data_days: number;
}

/** get_site_audience_metrics: analytics-consented page views, last 30 days. */
export interface SiteAudienceData {
  monthly_page_views: number;
  monthly_visits: number;
  data_days: number;
}

/** True only when the window is long enough AND something was measured in it. */
export function hasReportableSample(data: PlatformMetricsData | null): boolean {
  if (!data) return false;
  return data.data_days >= MIN_DATA_DAYS && (data.monthly_impressions > 0 || data.monthly_clicks > 0);
}

/**
 * Same floor as the search block. Visits are required as well as page views
 * because page views with zero sessions is a broken writer, not an audience,
 * and pages-per-visit would divide by zero.
 */
export function hasReportableAudience(data: SiteAudienceData | null): boolean {
  if (!data) return false;
  return data.data_days >= MIN_DATA_DAYS && data.monthly_page_views > 0 && data.monthly_visits > 0;
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

interface BlockProps {
  id: string;
  heading: string;
  intro: string;
  dataDays: number;
  stats: StatProps[];
  footnote: string;
}

function MetricsBlock({ id, heading, intro, dataDays, stats, footnote }: BlockProps) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 id={id} className="text-lg font-semibold">
            {heading}
          </h2>
          <p className="text-sm text-muted-foreground">{intro}</p>
        </div>
        <span className="text-xs text-muted-foreground">Based on {dataDays} days of data</span>
      </div>

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Stat key={s.label} {...s} />
        ))}
      </dl>

      <p className="max-w-prose text-xs text-muted-foreground">{footnote}</p>
    </section>
  );
}

/** Analytics-consented visitors on our own pages. Preferred when reportable. */
function SiteAudience({ data }: { data: SiteAudienceData }) {
  return (
    <MetricsBlock
      id="site-audience-heading"
      heading="Site Audience"
      intro="People using Des Moines Insider, last 30 days"
      dataDays={data.data_days}
      stats={[
        {
          label: "Monthly Site Visits",
          value: formatMetricNumber(data.monthly_visits),
          sub: "Browsing sessions on our pages",
        },
        {
          label: "Monthly Page Views",
          value: formatMetricNumber(data.monthly_page_views),
          sub: "Event, restaurant and attraction pages opened",
        },
        {
          label: "Pages per Visit",
          value: (data.monthly_page_views / data.monthly_visits).toFixed(1),
          sub: "How far a typical visit goes",
        },
      ]}
      footnote="Counted from our own page views. We only count visitors who accept analytics cookies, so the real audience is larger than these figures, never smaller. Your campaign runs on these same pages."
    />
  );
}

/** Google Search Console, labelled as what it is. Shown only without a site sample. */
function SearchPerformance({ data }: { data: PlatformMetricsData }) {
  return (
    <MetricsBlock
      id="search-performance-heading"
      heading="Search Performance"
      intro="How often our pages appear in Google results, last 30 days"
      dataDays={data.data_days}
      stats={[
        {
          label: "Search Impressions",
          value: formatMetricNumber(data.monthly_impressions),
          sub: "Times our pages appeared in Google results",
        },
        {
          label: "Search Clicks",
          value: formatMetricNumber(data.monthly_clicks),
          sub: "Visits that started from a Google result",
        },
        {
          label: "Avg. Search CTR",
          value: `${data.avg_ctr}%`,
          sub: "Click-through rate from impressions",
        },
      ]}
      footnote="Google Search Console, last 30 days. These are search impressions, not ad impressions: they show how often our pages surface in results, which is how most readers arrive. Your campaign is served to people already browsing Des Moines events, restaurants and attractions."
    />
  );
}

/**
 * Any failure is "no sample", never a thrown error. Takes the call rather than
 * the function name so each name stays a literal at its .rpc() site, where
 * check-schema-usage can see it.
 */
async function readRpc<T>(call: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<T | null> {
  try {
    const { data, error } = await call();
    return !error && data ? (data as T) : null;
  } catch {
    return null;
  }
}

/**
 * Renders NOTHING until both reads resolve, and nothing after them unless one
 * has a reportable sample (business plan WP1 item 10). It used to draw three
 * skeleton cards that then vanished on every visit, because the sample is
 * almost never there: that was layout shift for a block that didn't appear.
 *
 * A failed read is not reported: until 20261107000071 is applied the audience
 * RPC 404s on every visit by design, and either failure has the same honest
 * outcome, which is showing nothing.
 */
export function PlatformMetrics() {
  const [search, setSearch] = useState<PlatformMetricsData | null>(null);
  const [audience, setAudience] = useState<SiteAudienceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [audienceResult, searchResult] = await Promise.all([
        readRpc<SiteAudienceData>(() => supabase.rpc("get_site_audience_metrics" as never)),
        readRpc<PlatformMetricsData>(() => supabase.rpc("get_platform_advertising_metrics" as never)),
      ]);
      if (cancelled) return;
      setAudience(audienceResult);
      setSearch(searchResult);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  // No fallback values. A number here is one an advertiser plans a budget
  // against, so the only honest options are a measured one or none at all.
  if (loading) return null;
  if (hasReportableAudience(audience)) return <SiteAudience data={audience} />;
  if (hasReportableSample(search)) return <SearchPerformance data={search} />;
  return null;
}
