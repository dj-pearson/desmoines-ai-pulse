import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SEOHead } from "@/components/SEOHead";
import {
  CheckCircle2,
  AlertTriangle,
  Inbox,
  ShieldCheck,
  GitMerge,
  Megaphone,
  Activity,
  RefreshCw,
  ArrowRight,
} from "lucide-react";

/**
 * Admin Autonomy Dashboard (WEB-AUTO-014). One pane answering "is anything
 * waiting on a human?" — every queue + automation-health signal in one place,
 * each row deep-linking to the surface that acts on it. Auto-refreshes; backed
 * by the single autonomy-overview aggregate edge function (feature-tolerant, so
 * sections appear as pipelines ship). Explicit zero-state.
 */
interface Overview {
  queues: {
    eventSubmissions: number | null;
    moderation: number | null;
    mergeReview: number | null;
    creativeApprovals: number | null;
  };
  jobFailures7d: number | null;
  autoApprovalRates: Record<string, number>;
  dataQuality: Record<string, { missingCoords: number; missingSeo: number; missingImage: number }> | null;
  alerts: { job: string; error: string | null; at: string | null }[];
  generatedAt: string;
}

const QUEUE_META: {
  key: keyof Overview["queues"];
  label: string;
  Icon: typeof Inbox;
  href: string;
}[] = [
  { key: "eventSubmissions", label: "Event submissions", Icon: Inbox, href: "/admin/event-submissions" },
  { key: "moderation", label: "Moderation queue", Icon: ShieldCheck, href: "/admin/feedback" },
  { key: "mergeReview", label: "Merge review", Icon: GitMerge, href: "/admin/system" },
  { key: "creativeApprovals", label: "Creative approvals", Icon: Megaphone, href: "/admin/campaigns" },
];

export default function AdminAutonomy() {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["autonomy-overview"],
    queryFn: async (): Promise<Overview> => {
      const { data, error } = await supabase.functions.invoke("autonomy-overview");
      if (error) throw error;
      return data as Overview;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const queues = data?.queues;
  const totalWaiting = queues
    ? (Object.values(queues).filter((v): v is number => typeof v === "number") as number[]).reduce(
        (a, b) => a + b,
        0
      )
    : 0;
  const failures = data?.jobFailures7d ?? 0;
  const nothingWaiting = !isLoading && totalWaiting === 0 && failures === 0 && (data?.alerts?.length ?? 0) === 0;

  return (
    <>
      <SEOHead title="Autonomy Dashboard | Admin" description="Queues, automation health, and exceptions in one pane." url="/admin/autonomy" noindex />
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Activity className="h-6 w-6" /> Autonomy Dashboard
            </h1>
            <p className="text-sm text-muted-foreground">
              Is anything waiting on a human?{" "}
              {data?.generatedAt && (
                <span>· updated {new Date(data.generatedAt).toLocaleTimeString()}</span>
              )}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {nothingWaiting && (
          <Card className="p-8 text-center mb-6 border-green-500/30 bg-green-500/5">
            <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-2" />
            <h2 className="text-lg font-semibold">Nothing needs you</h2>
            <p className="text-sm text-muted-foreground">
              All queues are clear and automations are healthy.
            </p>
          </Card>
        )}

        {/* Queues */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          {QUEUE_META.map(({ key, label, Icon, href }) => {
            const count = queues?.[key];
            const unavailable = count === null || count === undefined;
            const waiting = typeof count === "number" && count > 0;
            return (
              <Link key={key} to={href} className="block">
                <Card className={`p-4 hover:shadow-md transition-shadow ${waiting ? "border-amber-500/40" : ""}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                      <span className="font-medium truncate">{label}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {unavailable ? (
                        <Badge variant="outline">—</Badge>
                      ) : (
                        <Badge variant={waiting ? "default" : "secondary"}>{count}</Badge>
                      )}
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>

        {/* Job health + alerts */}
        <Card className="p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4" /> Automation health (7d)
            </h3>
            <Link to="/admin/system" className="text-sm text-primary hover:underline">
              Job health →
            </Link>
          </div>
          <p className="text-sm">
            {failures === 0 ? (
              <span className="text-green-600 dark:text-green-400">No failed job runs in the last 7 days.</span>
            ) : (
              <span className="text-amber-700 dark:text-amber-400 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" /> {failures} failed job run(s) in the last 7 days.
              </span>
            )}
          </p>
          {data?.alerts && data.alerts.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {data.alerts.map((a, i) => (
                <li key={i} className="truncate">
                  <span className="font-medium text-foreground">{a.job}</span>
                  {a.error ? `: ${a.error}` : ""}
                </li>
              ))}
            </ul>
          )}
          {Object.keys(data?.autoApprovalRates ?? {}).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(data!.autoApprovalRates).map(([pipeline, rate]) => (
                <Badge key={pipeline} variant="outline">
                  {pipeline}: {Math.round(rate * 100)}% auto-approved
                </Badge>
              ))}
            </div>
          )}
        </Card>

        {/* Data-quality KPIs */}
        {data?.dataQuality && Object.keys(data.dataQuality).length > 0 && (
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">Data quality (latest heal)</h3>
              <Link to="/admin/system" className="text-sm text-primary hover:underline">
                Details →
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {Object.entries(data.dataQuality).map(([table, kpi]) => (
                <div key={table} className="rounded-md border p-2 text-sm">
                  <div className="font-medium capitalize">{table}</div>
                  <div className="text-xs text-muted-foreground">
                    {kpi.missingCoords} coords · {kpi.missingSeo} SEO · {kpi.missingImage} images missing
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
