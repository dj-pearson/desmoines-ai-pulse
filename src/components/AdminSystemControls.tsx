import { useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import { Database, RefreshCw, Timer, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { clearRetiredSettings, useSystemMonitoring } from "@/hooks/useSystemMonitoring";

/**
 * System Controls shows only what the browser can measure and offers only
 * actions that do something. The CPU, memory, disk and connection figures were
 * Math.random(); the settings tabs (caching, CDN, rate limit, backups,
 * notifications, maintenance message) saved to this browser's localStorage and
 * nothing read them; restart-web-server and refresh-cdn-cache do not exist;
 * backup answers 501 and "Optimize Database" cannot run. See
 * useSystemMonitoring for the detail. Job health and web vitals have their own
 * tabs on this page.
 */
export default function AdminSystemControls() {
  const { toast } = useToast();
  const { systemStatus, isLoading, loadSystemStatus, clearCache } = useSystemMonitoring();

  useEffect(() => {
    clearRetiredSettings();
    void loadSystemStatus();
    const interval = setInterval(() => void loadSystemStatus(), 30000);
    return () => clearInterval(interval);
  }, [loadSystemStatus]);

  const handleClearCache = async () => {
    const result = await clearCache();
    toast(
      result.success
        ? {
            title: "Cache cleared",
            description: "This browser will refetch everything it shows from the server.",
          }
        : { title: "Could not clear the cache", variant: "destructive" },
    );
  };

  const { databaseReachable, databaseLatencyMs, lastJob, checkedAt } = systemStatus;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">System Controls</h2>
          <p className="text-muted-foreground">
            {checkedAt
              ? `Checked ${formatDistanceToNow(new Date(checkedAt), { addSuffix: true })} from this browser.`
              : "Checking..."}
          </p>
        </div>
        <Button variant="outline" onClick={() => void loadSystemStatus()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Check again
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Database className="h-4 w-4" />
              Database
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-2">
            {databaseReachable === null ? (
              <Badge variant="outline">Checking</Badge>
            ) : databaseReachable ? (
              <Badge variant="secondary">Reachable</Badge>
            ) : (
              <Badge variant="destructive">Unreachable</Badge>
            )}
            {databaseLatencyMs !== null && (
              <span className="text-sm text-muted-foreground">{databaseLatencyMs} ms round trip</span>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Timer className="h-4 w-4" />
              Last scheduled job log
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {lastJob ? (
              <>
                <div className="flex items-center gap-2">
                  <Badge variant={lastJob.failed ? "destructive" : "secondary"}>
                    {lastJob.failed ? "Error" : "OK"}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(lastJob.at), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-sm break-words">{lastJob.message}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No cron_logs rows readable.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Browser cache</CardTitle>
          <CardDescription>
            Drops the data this browser has cached, so every admin screen reloads from the server.
            There is no server-side cache to clear.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleClearCache} disabled={isLoading} variant="outline">
            <Trash2 className="h-4 w-4 mr-2" />
            Clear this browser's cache
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
