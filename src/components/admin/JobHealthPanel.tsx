import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Play, CheckCircle2, XCircle, AlertTriangle, Clock } from "lucide-react";

interface JobHealthRow {
  job_name: string;
  last_run_at: string | null;
  last_finished_at: string | null;
  last_status: "running" | "success" | "failed" | "partial" | null;
  last_items_processed: number | null;
  last_items_failed: number | null;
  last_error: string | null;
  runs_7d: number;
  successes_7d: number;
  items_processed_7d: number;
  items_failed_7d: number;
}

// Jobs that can be re-run by invoking their edge function from the admin UI.
const RERUNNABLE: Record<string, string> = {
  "cleanup-old-events": "cleanup-old-events",
  "validate-source-urls": "validate-source-urls",
  "generate-sitemaps": "generate-sitemaps",
  "dispatch-scheduled-newsletters": "dispatch-scheduled-newsletters",
  "job-health-watchdog": "job-health-watchdog",
  "data-quality-heal": "data-quality-heal",
  "dedupe-content": "dedupe-content",
  "ai-article-pipeline": "ai-article-pipeline",
  "assemble-weekly-digest": "assemble-weekly-digest",
  "moderate-content": "moderate-content",
  "subscription-reconcile": "subscription-reconcile",
};

function statusBadge(status: JobHealthRow["last_status"]) {
  switch (status) {
    case "success":
      return <Badge className="bg-green-600 hover:bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />Success</Badge>;
    case "failed":
      return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
    case "partial":
      return <Badge className="bg-amber-500 hover:bg-amber-500"><AlertTriangle className="h-3 w-3 mr-1" />Partial</Badge>;
    case "running":
      return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Running</Badge>;
    default:
      return <Badge variant="outline">Never run</Badge>;
  }
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface DataQualityKpi {
  [table: string]: { missingCoords: number; missingSeo: number; missingImage: number };
}

interface LifecycleKpi {
  hidden: number;
  archived: number;
  deleted: number;
}

/** Latest subscription-reconcile run (WEB-BE-062), as runJob recorded it. */
interface ReconcileRun {
  status: string | null;
  startedAt: string | null;
  error: string | null;
  itemsFailed: number;
  corrected: number | null;
  checked: number | null;
  notEntitledBacklog: number | null;
}

export default function JobHealthPanel() {
  const { toast } = useToast();
  const [running, setRunning] = useState<string | null>(null);

  // Latest data-quality-heal KPI snapshot (WEB-AUTO-003).
  const { data: dqKpi } = useQuery({
    queryKey: ["data-quality-kpi"],
    queryFn: async (): Promise<DataQualityKpi | null> => {
      const { data } = await supabase
        .from("automation_job_runs" as never)
        .select("metadata")
        .eq("job_name", "data-quality-heal")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const meta = (data as unknown as { metadata?: { kpi?: DataQualityKpi } } | null)?.metadata;
      return meta?.kpi ?? null;
    },
    refetchInterval: 60_000,
  });

  // Latest stale-event lifecycle counts (WEB-AUTO-006).
  const { data: lifecycleKpi } = useQuery({
    queryKey: ["event-lifecycle-kpi"],
    queryFn: async (): Promise<LifecycleKpi | null> => {
      const { data } = await supabase
        .from("automation_job_runs" as never)
        .select("metadata")
        .eq("job_name", "cleanup-old-events")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const meta = (data as unknown as { metadata?: Partial<LifecycleKpi> } | null)?.metadata;
      if (!meta) return null;
      return {
        hidden: meta.hidden ?? 0,
        archived: meta.archived ?? 0,
        deleted: meta.deleted ?? 0,
      };
    },
    refetchInterval: 60_000,
  });

  // Latest subscription reconciliation (WEB-BE-062): how many rows Stripe's
  // answer corrected. A failed read is shown as unavailable, not as zero.
  const { data: reconcileRun, error: reconcileError } = useQuery({
    queryKey: ["subscription-reconcile-kpi"],
    queryFn: async (): Promise<ReconcileRun | null> => {
      const { data, error } = await supabase
        .from("automation_job_runs" as never)
        .select("status, started_at, error, items_failed, metadata")
        .eq("job_name", "subscription-reconcile")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const row = data as unknown as {
        status: string | null;
        started_at: string | null;
        error: string | null;
        items_failed: number | null;
        metadata: {
          corrected?: number;
          checked?: number;
          backlog?: Array<{ not_entitled?: number }>;
        } | null;
      } | null;
      if (!row) return null;
      const meta = row.metadata ?? {};
      return {
        status: row.status,
        startedAt: row.started_at,
        error: row.error,
        itemsFailed: row.items_failed ?? 0,
        corrected: typeof meta.corrected === "number" ? meta.corrected : null,
        checked: typeof meta.checked === "number" ? meta.checked : null,
        notEntitledBacklog: Array.isArray(meta.backlog)
          ? meta.backlog.reduce((n, b) => n + (Number(b.not_entitled) || 0), 0)
          : null,
      };
    },
    refetchInterval: 60_000,
  });

  const { data: jobs, isLoading, error, refetch } = useQuery({
    queryKey: ["automation-job-health"],
    queryFn: async (): Promise<JobHealthRow[]> => {
      // automation_job_health is a DB view not yet in generated types.
      const { data, error } = await supabase
        .from("automation_job_health" as never)
        .select("*")
        .order("last_run_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as JobHealthRow[];
    },
    refetchInterval: 30_000,
  });

  const rerun = async (jobName: string) => {
    const fn = RERUNNABLE[jobName];
    if (!fn) return;
    setRunning(jobName);
    try {
      const { error } = await supabase.functions.invoke(fn, { body: { manual: true } });
      if (error) throw error;
      toast({ title: "Job triggered", description: `Re-ran "${jobName}".` });
      setTimeout(() => refetch(), 2000);
    } catch (e) {
      toast({
        title: "Failed to trigger job",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRunning(null);
    }
  };

  return (
    <Card className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Job Health</h2>
          <p className="text-sm text-muted-foreground">
            Scheduled automation runs (auto-refreshes every 30s)
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />Refresh
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground py-8 text-center">Loading job health…</p>}
      {error && (
        <p className="text-sm text-destructive py-8 text-center">
          Failed to load job health. {error instanceof Error ? error.message : ""}
        </p>
      )}

      {!isLoading && !error && (jobs?.length ?? 0) === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No job runs recorded yet. Jobs appear here once they run through the jobRunner wrapper.
        </p>
      )}

      {!isLoading && (jobs?.length ?? 0) > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="py-2 pr-4">Job</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Last run</th>
                <th className="py-2 pr-4">7-day success</th>
                <th className="py-2 pr-4">Items (last)</th>
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {jobs!.map((j) => {
                const rate = j.runs_7d > 0 ? Math.round((j.successes_7d / j.runs_7d) * 100) : null;
                return (
                  <tr key={j.job_name} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">{j.job_name}</td>
                    <td className="py-2 pr-4">{statusBadge(j.last_status)}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{timeAgo(j.last_run_at)}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {rate === null ? "—" : (
                        <span className={rate >= 90 ? "text-green-600" : rate >= 60 ? "text-amber-600" : "text-destructive"}>
                          {rate}% ({j.successes_7d}/{j.runs_7d})
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {j.last_items_processed ?? 0}
                      {(j.last_items_failed ?? 0) > 0 && (
                        <span className="text-destructive"> / {j.last_items_failed} failed</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      {RERUNNABLE[j.job_name] && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={running === j.job_name}
                          onClick={() => rerun(j.job_name)}
                        >
                          <Play className="h-3 w-3 mr-1" />
                          {running === j.job_name ? "Running…" : "Re-run"}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {dqKpi && Object.keys(dqKpi).length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-medium mb-2">Data Quality (rows missing fields)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {Object.entries(dqKpi).map(([table, k]) => (
              <div key={table} className="rounded-lg border p-3">
                <div className="text-sm font-medium capitalize mb-1">{table}</div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <div>Coords: <span className={k.missingCoords > 0 ? "text-amber-600" : "text-green-600"}>{k.missingCoords}</span></div>
                  <div>SEO: <span className={k.missingSeo > 0 ? "text-amber-600" : "text-green-600"}>{k.missingSeo}</span></div>
                  <div>Image: <span className={k.missingImage > 0 ? "text-amber-600" : "text-green-600"}>{k.missingImage}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {lifecycleKpi && (
        <div className="mt-6">
          <h3 className="text-sm font-medium mb-2">Event Lifecycle (last cleanup run)</h3>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Soft-hidden</div>
              <div className="text-lg font-semibold text-amber-600">{lifecycleKpi.hidden}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Archived</div>
              <div className="text-lg font-semibold">{lifecycleKpi.archived}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Deleted</div>
              <div className="text-lg font-semibold text-destructive">{lifecycleKpi.deleted}</div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6">
        <h3 className="text-sm font-medium mb-2">Subscription reconciliation (last run)</h3>
        {reconcileError ? (
          <p className="text-xs text-destructive">
            Unavailable - {reconcileError instanceof Error ? reconcileError.message : "the run could not be read"}
          </p>
        ) : reconcileRun === undefined ? (
          <p className="text-xs text-muted-foreground">Loading...</p>
        ) : reconcileRun === null ? (
          <p className="text-xs text-muted-foreground">Never run.</p>
        ) : reconcileRun.status === "failed" ? (
          <p className="text-xs text-destructive">
            Failed {timeAgo(reconcileRun.startedAt)}: {reconcileRun.error ?? "no error recorded"}
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Corrected from Stripe</div>
              <div className="text-lg font-semibold">{reconcileRun.corrected ?? "Unavailable"}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Rows checked</div>
              <div className="text-lg font-semibold">{reconcileRun.checked ?? "Unavailable"}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Could not decide</div>
              <div className={reconcileRun.itemsFailed > 0 ? "text-lg font-semibold text-amber-600" : "text-lg font-semibold"}>
                {reconcileRun.itemsFailed}
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Lapsed, paid status, not entitled</div>
              <div className="text-lg font-semibold">{reconcileRun.notEntitledBacklog ?? "Unavailable"}</div>
            </div>
            <p className="col-span-full text-xs text-muted-foreground">Run {timeAgo(reconcileRun.startedAt)}.</p>
          </div>
        )}
      </div>

      {jobs?.some((j) => j.last_status === "failed" && j.last_error) && (
        <div className="mt-4 space-y-1">
          <h3 className="text-sm font-medium">Recent errors</h3>
          {jobs!.filter((j) => j.last_status === "failed" && j.last_error).map((j) => (
            <p key={j.job_name} className="text-xs text-muted-foreground">
              <span className="font-medium text-destructive">{j.job_name}:</span> {j.last_error}
            </p>
          ))}
        </div>
      )}
    </Card>
  );
}
