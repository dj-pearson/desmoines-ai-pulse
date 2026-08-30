import { Activity, CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useUptimeStatus, type UptimeTarget } from "@/hooks/useUptimeStatus";
import { cn } from "@/lib/utils";

function TargetRow({ t }: { t: UptimeTarget }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border p-2">
      <div className="flex min-w-0 items-center gap-2">
        {t.up ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
        ) : (
          <XCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
        )}
        <span className="truncate text-sm font-medium" title={t.targetKey}>
          {t.targetKey}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
        <span>{t.p95Ms != null ? `p95 ${t.p95Ms}ms` : "—"}</span>
        <Badge variant={t.up ? "outline" : "destructive"} className="tabular-nums">
          {Math.round(t.uptimeRatio * 100)}%
        </Badge>
      </div>
    </div>
  );
}

/**
 * Uptime / synthetic-monitoring status tile for /admin/agents (AOS-MAINT-001).
 * Current up/down per monitored target + p95 latency over the last hour.
 */
export default function UptimeStatusTile() {
  const { data, isLoading, isError } = useUptimeStatus(60);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" aria-hidden="true" /> Uptime monitor
            </CardTitle>
            <CardDescription>Synthetic probes of critical routes + edge functions (last hour).</CardDescription>
          </div>
          {data && (
            <div className="text-right">
              <p
                className={cn(
                  "text-sm font-semibold",
                  data.downCount > 0 ? "text-destructive" : "text-green-600",
                )}
              >
                {data.downCount > 0 ? `${data.downCount} down` : "All up"}
              </p>
              <p className="text-xs text-muted-foreground">
                {data.worstP95Ms != null ? `worst p95 ${data.worstP95Ms}ms` : "no samples"}
              </p>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : isError ? (
          <p className="text-sm text-muted-foreground">Unable to load uptime status.</p>
        ) : !data || data.targets.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No probes recorded yet. The uptime-monitor agent runs every 5 minutes.
          </p>
        ) : (
          <div className="space-y-2">
            {data.targets.map((t) => (
              <TargetRow key={t.targetKey} t={t} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
