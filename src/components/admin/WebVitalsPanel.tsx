import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

/**
 * Admin trend of real-user web-vitals p75 per metric over the last 14 days
 * (WEB-PERF-007). Reuses recharts; lazy-loaded by AdminSystem so the chart vendor
 * chunk only loads when this tab is opened. web_vitals isn't in the generated
 * types yet → `as never` cast (matching JobHealthPanel).
 */
const METRICS = ["LCP", "CLS", "INP", "TTFB"] as const;
const BUDGETS: Record<string, number | undefined> = { LCP: 2500, CLS: 0.1, INP: 200, TTFB: undefined };

function p75(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(0.75 * sorted.length))];
}

interface DayPoint {
  day: string;
  [metric: string]: number | string | null;
}

export default function WebVitalsPanel() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DayPoint[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      const { data: rows } = await supabase
        .from("web_vitals" as never)
        .select("metric, value, created_at")
        .gte("created_at", since);

      if (cancelled) return;

      // Group values by day → metric.
      const byDay = new Map<string, Map<string, number[]>>();
      for (const r of (rows ?? []) as Array<{ metric: string; value: number; created_at: string }>) {
        const day = r.created_at.slice(0, 10);
        if (!byDay.has(day)) byDay.set(day, new Map());
        const m = byDay.get(day)!;
        const arr = m.get(r.metric) ?? [];
        arr.push(r.value);
        m.set(r.metric, arr);
      }

      const points: DayPoint[] = [...byDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, metrics]) => {
          const point: DayPoint = { day: day.slice(5) };
          for (const metric of METRICS) point[metric] = p75(metrics.get(metric) ?? []);
          return point;
        });

      setData(points);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="ml-2">Loading web-vitals…</span>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6">
        No web-vitals collected yet. Real-user metrics are sampled (10%) and start
        flowing after the next deploy with collection enabled.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {METRICS.map((metric) => (
        <Card key={metric}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              {metric} p75 (last 14 days)
              {BUDGETS[metric] !== undefined && (
                <span className="ml-2 text-xs text-muted-foreground">
                  budget {BUDGETS[metric]}
                  {metric === "CLS" ? "" : "ms"}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={44} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey={metric}
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
