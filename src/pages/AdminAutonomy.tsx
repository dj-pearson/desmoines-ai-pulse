import { Link } from "react-router-dom";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import AdminNav from "@/components/admin/AdminNav";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAutonomyOverview } from "@/hooks/useAutonomyOverview";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  RefreshCw,
  Inbox,
  ShieldCheck,
  Copy,
  Image as ImageIcon,
  Activity,
  Gauge,
} from "lucide-react";

const QUEUE_ICON: Record<string, typeof Inbox> = {
  event_submissions: Inbox,
  moderation: ShieldCheck,
  merge_review: Copy,
  creative_approvals: ImageIcon,
};

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AdminAutonomy() {
  const { userRole } = useAdminAuth();
  useDocumentTitle("Autonomy Dashboard");
  const { data, isLoading, error, refetch, isFetching } = useAutonomyOverview();

  const canView = ["moderator", "admin", "root_admin"].includes(userRole);
  if (!canView) {
    return (
      <div className="min-h-screen bg-background">
        <AdminNav />
        <div className="p-6 text-center text-muted-foreground">
          You do not have permission to access the autonomy dashboard.
        </div>
      </div>
    );
  }

  const needsHuman = data?.needsHumanTotal ?? 0;

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Gauge className="h-6 w-6" /> Autonomy Dashboard
            </h1>
            <p className="text-sm text-muted-foreground">
              Is anything waiting on a human? Auto-refreshes every 30s.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {isLoading && (
          <p className="text-sm text-muted-foreground py-12 text-center">Loading autonomy overview…</p>
        )}
        {error && (
          <Card className="p-4 border-destructive/50">
            <p className="text-sm text-destructive">
              Failed to load the dashboard. {error instanceof Error ? error.message : ""}
            </p>
          </Card>
        )}

        {data && (
          <>
            {/* Headline: needs-human banner */}
            <Card
              className={`p-5 ${
                needsHuman === 0
                  ? "border-green-600/40 bg-green-600/5"
                  : "border-amber-500/40 bg-amber-500/5"
              }`}
            >
              {needsHuman === 0 ? (
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-8 w-8 text-green-600 shrink-0" />
                  <div>
                    <p className="text-lg font-semibold">Nothing needs you</p>
                    <p className="text-sm text-muted-foreground">
                      Every queue is clear — the site is running itself.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-8 w-8 text-amber-500 shrink-0" />
                  <div>
                    <p className="text-lg font-semibold">
                      {needsHuman} item{needsHuman === 1 ? "" : "s"} waiting on you
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Across {data.queues.filter((q) => q.needsHuman && q.count > 0).length} queue
                      {data.queues.filter((q) => q.needsHuman && q.count > 0).length === 1 ? "" : "s"}{" "}
                      below.
                    </p>
                  </div>
                </div>
              )}
            </Card>

            {/* Queue tiles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {data.queues.map((q) => {
                const Icon = QUEUE_ICON[q.key] ?? Inbox;
                const clear = q.count === 0;
                return (
                  <Link key={q.key} to={q.href} className="group">
                    <Card
                      className={`p-4 h-full transition-colors group-hover:border-primary/50 ${
                        clear ? "" : "border-amber-500/40"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Icon className="h-5 w-5 text-muted-foreground" />
                        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div className={`text-3xl font-bold ${clear ? "text-green-600" : "text-amber-600"}`}>
                        {q.count}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">{q.label}</div>
                      {clear && <div className="text-xs text-green-600 mt-1">Clear</div>}
                      {!clear && q.sample && q.sample.length > 0 && (
                        <div className="mt-2 space-y-1 border-t pt-2">
                          {q.sample.slice(0, 3).map((s) => (
                            <div key={s.id} className="flex items-center justify-between gap-2 text-xs">
                              <span className="truncate text-muted-foreground">{s.title ?? "(untitled)"}</span>
                              {typeof s.quality_score === "number" && (
                                <Badge variant="outline" className="shrink-0">
                                  {s.quality_score}
                                </Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>
                  </Link>
                );
              })}
            </div>

            {/* Job health + auto-approval rates */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold flex items-center gap-2">
                    <Activity className="h-4 w-4" /> Job health
                  </h2>
                  <Link to="/admin/system" className="text-xs text-primary hover:underline">
                    View all
                  </Link>
                </div>
                <div className="flex gap-4 mb-3 text-sm">
                  <span className="text-muted-foreground">
                    {data.jobHealth.total} jobs
                  </span>
                  <span className="text-green-600">{data.jobHealth.healthy} healthy</span>
                  <span className={data.jobHealth.failing > 0 ? "text-destructive" : "text-muted-foreground"}>
                    {data.jobHealth.failing} failing
                  </span>
                </div>
                {data.jobHealth.failing === 0 ? (
                  <p className="text-xs text-muted-foreground">All observed jobs are green.</p>
                ) : (
                  <ul className="space-y-1">
                    {data.jobHealth.jobs
                      .filter((j) => j.last_status === "failed")
                      .map((j) => (
                        <li key={j.job_name} className="flex items-center gap-2 text-xs">
                          <XCircle className="h-3 w-3 text-destructive shrink-0" />
                          <span className="font-medium">{j.job_name}</span>
                          <span className="text-muted-foreground">{timeAgo(j.last_run_at)}</span>
                        </li>
                      ))}
                  </ul>
                )}
              </Card>

              <Card className="p-4">
                <h2 className="font-semibold flex items-center gap-2 mb-3">
                  <Gauge className="h-4 w-4" /> Auto-approval rates (7d)
                </h2>
                <ul className="space-y-2">
                  {data.autoApprovalRates.map((r) => (
                    <li key={r.key} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{r.label}</span>
                      {r.ratePercent === null ? (
                        <span className="text-xs text-muted-foreground">no runs</span>
                      ) : (
                        <span className="font-medium">
                          {r.ratePercent}%{" "}
                          <span className="text-xs text-muted-foreground">
                            ({r.approved}/{r.total})
                          </span>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            </div>

            {/* Data-quality KPIs */}
            {data.dataQuality && Object.keys(data.dataQuality).length > 0 && (
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold">Data quality (rows missing fields)</h2>
                  <Link to="/admin/system" className="text-xs text-primary hover:underline">
                    Details
                  </Link>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {Object.entries(data.dataQuality).map(([table, k]) => (
                    <div key={table} className="rounded-lg border p-3">
                      <div className="text-sm font-medium capitalize mb-1">{table}</div>
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        <div>
                          Coords:{" "}
                          <span className={k.missingCoords > 0 ? "text-amber-600" : "text-green-600"}>
                            {k.missingCoords}
                          </span>
                        </div>
                        <div>
                          SEO:{" "}
                          <span className={k.missingSeo > 0 ? "text-amber-600" : "text-green-600"}>
                            {k.missingSeo}
                          </span>
                        </div>
                        <div>
                          Image:{" "}
                          <span className={k.missingImage > 0 ? "text-amber-600" : "text-green-600"}>
                            {k.missingImage}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Recent automation alerts */}
            <Card className="p-4">
              <h2 className="font-semibold mb-3">Recent automation alerts</h2>
              {data.alerts.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No job failures in the last 7 days.
                </p>
              ) : (
                <ul className="space-y-2">
                  {data.alerts.map((a, i) => (
                    <li key={`${a.job_name}-${i}`} className="flex items-start gap-2 text-xs">
                      <XCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-destructive">{a.job_name}</span>{" "}
                        <span className="text-muted-foreground">{timeAgo(a.finished_at)}</span>
                        {a.error && <div className="text-muted-foreground">{a.error}</div>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <p className="text-xs text-muted-foreground text-center">
              Generated {timeAgo(data.generatedAt)}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
