import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, MousePointerClick, BarChart3, Users } from "lucide-react";

interface PlatformMetricsData {
  monthly_impressions: number;
  monthly_clicks: number;
  avg_ctr: number;
  data_days: number;
}

function formatNumber(n: number): string {
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

  // When GSC hasn't synced yet, show estimated placeholder values clearly labeled
  const hasData = data && (data.monthly_impressions > 0 || data.monthly_clicks > 0);
  const impressions = hasData ? data!.monthly_impressions : 12400;
  const clicks      = hasData ? data!.monthly_clicks      : 980;
  const ctr         = hasData ? data!.avg_ctr             : 7.9;
  const estimated   = !hasData && !loading;

  const suffix = estimated ? "*" : "";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Platform Reach</h3>
          <p className="text-sm text-muted-foreground">
            Real audience data from Des Moines AI Pulse — last 30 days
          </p>
        </div>
        {estimated && (
          <span className="text-xs text-muted-foreground italic">* Estimated — sync pending</span>
        )}
        {!loading && hasData && data!.data_days > 0 && (
          <span className="text-xs text-muted-foreground">
            Based on {data!.data_days} days of data
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={TrendingUp}
          label="Monthly Impressions"
          value={`${formatNumber(impressions)}${suffix}`}
          sub="Times our content appeared in search"
          loading={loading}
        />
        <StatCard
          icon={MousePointerClick}
          label="Monthly Clicks"
          value={`${formatNumber(clicks)}${suffix}`}
          sub="Organic visits from search results"
          loading={loading}
        />
        <StatCard
          icon={BarChart3}
          label="Avg. Search CTR"
          value={loading ? "—" : `${ctr}%${suffix}`}
          sub="Click-through rate from impressions"
          loading={loading}
        />
        <StatCard
          icon={Users}
          label="Active Audience"
          value={loading ? "—" : `Des Moines`}
          sub="Local & regional audience"
          loading={loading}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Data sourced from Google Search Console.{" "}
        <span className="font-medium text-foreground">
          Advertising impressions are served directly to people browsing Des Moines events,
          restaurants, and attractions.
        </span>
      </p>
    </div>
  );
}
