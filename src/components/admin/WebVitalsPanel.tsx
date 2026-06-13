import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STALE_TIME } from "@/lib/queryConfig";

// Core Web Vitals budgets (CLAUDE.md). TTFB/FCP shown for trend, no hard budget.
const BUDGETS: Record<string, number> = { LCP: 2500, INP: 200, CLS: 0.1 };
const METRIC_ORDER = ["LCP", "INP", "CLS", "TTFB", "FCP"];
const METRIC_LABEL: Record<string, string> = {
  LCP: "LCP (Largest Contentful Paint)",
  INP: "INP (Interaction to Next Paint)",
  CLS: "CLS (Cumulative Layout Shift)",
  TTFB: "TTFB (Time to First Byte)",
  FCP: "FCP (First Contentful Paint)",
};

interface WeeklyRow {
  week_start: string;
  page_group: string;
  metric: string;
  p75: number;
  prev_p75: number | null;
  pct_change: number | null;
  breaches_budget: boolean;
  sample_count: number;
}

function fmt(metric: string, v: number | null): string {
  if (v == null) return "—";
  return metric === "CLS" ? v.toFixed(3) : `${Math.round(v)}ms`;
}

export default function WebVitalsPanel() {
  const [pageGroup, setPageGroup] = useState<string>("");

  const { data: rows, isLoading, error } = useQuery({
    queryKey: ["web-vitals-weekly"],
    queryFn: async (): Promise<WeeklyRow[]> => {
      // web_vitals_weekly is not in generated types yet.
      const { data, error } = await supabase
        .from("web_vitals_weekly" as never)
        .select("week_start,page_group,metric,p75,prev_p75,pct_change,breaches_budget,sample_count")
        .order("week_start", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as WeeklyRow[];
    },
    staleTime: STALE_TIME.USER,
    refetchInterval: 5 * 60 * 1000,
  });

  const pageGroups = useMemo(() => {
    const set = new Set((rows ?? []).map((r) => r.page_group));
    return Array.from(set).sort();
  }, [rows]);

  const activeGroup = pageGroup || pageGroups[0] || "";

  // Per-metric trend series + latest-week snapshot for the active page-group.
  const byMetric = useMemo(() => {
    const result: Record<string, { trend: { week: string; p75: number }[]; latest: WeeklyRow | null }> = {};
    const scoped = (rows ?? []).filter((r) => r.page_group === activeGroup);
    for (const metric of METRIC_ORDER) {
      const series = scoped
        .filter((r) => r.metric === metric)
        .map((r) => ({ week: r.week_start.slice(5), p75: Number(r.p75), full: r.week_start }))
        .sort((a, b) => a.full.localeCompare(b.full));
      result[metric] = {
        trend: series.map(({ week, p75 }) => ({ week, p75 })),
        latest: scoped
          .filter((r) => r.metric === metric)
          .sort((a, b) => b.week_start.localeCompare(a.week_start))[0] ?? null,
      };
    }
    return result;
  }, [rows, activeGroup]);

  return (
    <Card className="p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold">Web Vitals (Real-User Monitoring)</h2>
          <p className="text-sm text-muted-foreground">
            p75 per metric, weekly — green/amber/red against Core Web Vitals budgets.
            The weekly rollup emails an alert on a &gt;20% regression or budget breach.
          </p>
        </div>
        {pageGroups.length > 0 && (
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={activeGroup}
            onChange={(e) => setPageGroup(e.target.value)}
            aria-label="Page group"
          >
            {pageGroups.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        )}
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading web vitals…</p>
      )}
      {error && (
        <p className="text-sm text-destructive py-8 text-center">
          Failed to load web vitals. {error instanceof Error ? error.message : ""}
        </p>
      )}
      {!isLoading && !error && (rows?.length ?? 0) === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No web-vitals rollups yet. Real-user samples accumulate as visitors browse;
          the first weekly rollup runs Monday (or trigger <strong>web-vitals-rollup</strong> from Job Health).
        </p>
      )}

      {!isLoading && (rows?.length ?? 0) > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {METRIC_ORDER.map((metric) => {
            const { trend, latest } = byMetric[metric];
            if (trend.length === 0) return null;
            const budget = BUDGETS[metric];
            const breaches = latest?.breaches_budget ?? false;
            const pct = latest?.pct_change ?? null;
            return (
              <Card key={metric}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">{METRIC_LABEL[metric]}</CardTitle>
                    <Badge
                      className={
                        breaches
                          ? "bg-destructive hover:bg-destructive"
                          : "bg-green-600 hover:bg-green-600"
                      }
                    >
                      {fmt(metric, latest?.p75 ?? null)}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs">
                    {budget != null && <>Budget {fmt(metric, budget)} · </>}
                    {pct != null ? (
                      <span className={pct > 0 ? "text-destructive" : "text-green-600"}>
                        {pct > 0 ? "+" : ""}{pct.toFixed(0)}% vs prior week
                      </span>
                    ) : (
                      "no prior week"
                    )}
                    {latest && <> · {latest.sample_count} samples</>}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={trend} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} width={44} />
                      <Tooltip formatter={(v: number) => fmt(metric, v)} />
                      {budget != null && (
                        <ReferenceLine
                          y={budget}
                          stroke="#ef4444"
                          strokeDasharray="4 4"
                          label={{ value: "budget", fontSize: 10, fill: "#ef4444", position: "insideTopRight" }}
                        />
                      )}
                      <Line
                        type="monotone"
                        dataKey="p75"
                        stroke="#0ea5e9"
                        strokeWidth={2}
                        dot={{ r: 2 }}
                        name="p75"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </Card>
  );
}
