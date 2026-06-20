import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertTriangle } from "lucide-react";

/**
 * Real-user web-vitals trend (WEB-PERF-007). Reads the latest web-vitals-weekly
 * job run metadata (p75 per metric per page-group, week-over-week + budgets) so
 * the raw RUM rows stay private. Lazy-friendly; no heavy charting dependency.
 */
interface WebVitalsMeta {
  sampleSize?: number;
  current?: Record<string, number>;
  previous?: Record<string, number>;
  regressions?: string[];
  budgets?: Record<string, number>;
  computedAt?: string;
}

function fmt(metric: string, value: number): string {
  return metric === "CLS" ? value.toFixed(3) : `${Math.round(value)}ms`;
}

export default function WebVitalsPanel() {
  const { data: meta, isLoading } = useQuery({
    queryKey: ["web-vitals-weekly-meta"],
    queryFn: async (): Promise<WebVitalsMeta | null> => {
      const { data } = await supabase
        .from("automation_job_runs" as never)
        .select("metadata")
        .eq("job_name", "web-vitals-weekly")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (
        (data as unknown as { metadata?: WebVitalsMeta } | null)?.metadata ?? null
      );
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return null;

  if (!meta || !meta.current || Object.keys(meta.current).length === 0) {
    return (
      <Card className="p-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Activity className="h-4 w-4" /> Web Vitals (RUM)
        </h3>
        <p className="text-sm text-muted-foreground mt-2">
          No web-vitals rollup yet. The weekly job populates this once real-user
          data has been collected.
        </p>
      </Card>
    );
  }

  const budgets = meta.budgets || {};
  const entries = Object.entries(meta.current).sort(([a], [b]) => a.localeCompare(b));

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <Activity className="h-4 w-4" /> Web Vitals (RUM) — p75
        </h3>
        <span className="text-xs text-muted-foreground">
          {meta.sampleSize ?? 0} samples · 7d
        </span>
      </div>

      {meta.regressions && meta.regressions.length > 0 && (
        <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-2 text-sm">
          <div className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" /> {meta.regressions.length} regression(s)
          </div>
          <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
            {meta.regressions.slice(0, 6).map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {entries.map(([key, value]) => {
          const [metric, pageGroup] = key.split("|");
          const budget = budgets[metric];
          const overBudget = budget !== undefined && value > budget;
          const prev = meta.previous?.[key];
          return (
            <div
              key={key}
              className="flex items-center justify-between rounded-md border p-2 text-sm"
            >
              <div className="min-w-0">
                <span className="font-medium">{metric}</span>{" "}
                <span className="text-muted-foreground">{pageGroup}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {prev !== undefined && (
                  <span className="text-xs text-muted-foreground">
                    {fmt(metric, prev)} →
                  </span>
                )}
                <Badge variant={overBudget ? "destructive" : "secondary"}>
                  {fmt(metric, value)}
                </Badge>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
