import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, MousePointerClick, BarChart3 } from "lucide-react";

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

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  sub: string;
  loading: boolean;
}

function StatCard({ icon: Icon, label, value, sub, loading }: StatCardProps) {
  return (
    <Card className="border-border/50">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-md bg-primary/10 p-2">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
            {loading ? (
              <>
                <Skeleton className="mt-1 h-7 w-24" />
                <Skeleton className="mt-1 h-3 w-32" />
              </>
            ) : (
              <>
                <p className="mt-0.5 text-2xl font-bold text-foreground">{value}</p>
                <p className="text-xs text-muted-foreground">{sub}</p>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function PlatformMetrics() {
  const [data, setData] = useState<PlatformMetricsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { data: result, error } = await supabase
          .rpc("get_platform_advertising_metrics" as any);

        if (!cancelled) {
          if (!error && result) {
            setData(result as PlatformMetricsData);
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
  const hasSample = hasReportableSample(data);

  if (!loading && !hasSample) return null;

  const impressions = data?.monthly_impressions ?? 0;
  const clicks = data?.monthly_clicks ?? 0;
  const ctr = data?.avg_ctr ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Search Performance</h3>
          <p className="text-sm text-muted-foreground">
            How often our pages appear in Google results, last 30 days
          </p>
        </div>
        {!loading && hasSample && (
          <span className="text-xs text-muted-foreground">
            Based on {data!.data_days} days of data
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={TrendingUp}
          label="Search Impressions"
          value={formatMetricNumber(impressions)}
          sub="Times our pages appeared in Google results"
          loading={loading}
        />
        <StatCard
          icon={MousePointerClick}
          label="Search Clicks"
          value={formatMetricNumber(clicks)}
          sub="Visits that started from a Google result"
          loading={loading}
        />
        <StatCard
          icon={BarChart3}
          label="Avg. Search CTR"
          value={loading ? "-" : `${ctr}%`}
          sub="Click-through rate from impressions"
          loading={loading}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Google Search Console, last 30 days. These are search impressions, not ad
        impressions: they show how often our pages surface in results, which is
        how most readers arrive. Your campaign is served to people already
        browsing Des Moines events, restaurants and attractions.
      </p>
    </div>
  );
}
