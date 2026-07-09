import { useMemo, useState } from "react";
import { AlertTriangle, Bot, Play, RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAuth } from "@/contexts/AuthContext";
import {
  useAgentSummaries,
  useAgentRunHistory,
  useToggleAgent,
  useRunAgent,
  successRate,
  type AgentSummary,
} from "@/hooks/useAgentControlPlane";
import { cn } from "@/lib/utils";
import { handleError } from "@/lib/errorHandler";
import { toast } from "sonner";

function statusTone(status: string | null): string {
  if (status === "success") return "text-green-600";
  if (status === "failed" || status === "failure") return "text-destructive";
  if (status === "running") return "text-blue-600";
  return "text-muted-foreground";
}

function RunHistory({ agent, onClose }: { agent: AgentSummary; onClose: () => void }) {
  const { data: runs, isLoading } = useAgentRunHistory(agent.agent_key);
  return (
    <SheetContent className="w-full overflow-y-auto sm:max-w-xl" aria-label={`Run history: ${agent.name}`}>
      <SheetHeader>
        <SheetTitle className="pr-6">{agent.name}</SheetTitle>
        <SheetDescription>{agent.agent_key} · {agent.category}</SheetDescription>
      </SheetHeader>
      <div className="mt-4 space-y-2 text-sm">
        {isLoading ? (
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)
        ) : (runs ?? []).length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">No runs recorded yet.</p>
        ) : (
          (runs ?? []).map((run) => (
            <div key={run.id} className="rounded-md border p-2">
              <div className="flex items-center justify-between gap-2">
                <span className={cn("font-medium", statusTone(run.status))}>{run.status}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(run.started_at).toLocaleString()}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                <span>processed {run.items_processed}</span>
                {typeof run.items_escalated === "number" && <span>escalated {run.items_escalated}</span>}
                {typeof run.cost_usd === "number" && run.cost_usd > 0 && <span>${run.cost_usd.toFixed(4)}</span>}
              </div>
              {run.summary && <p className="mt-1 text-xs">{run.summary}</p>}
              {run.error && <p className="mt-1 text-xs text-destructive">{run.error}</p>}
            </div>
          ))
        )}
      </div>
    </SheetContent>
  );
}

export default function AgentControlPlane() {
  const { user } = useAuth();
  const { data: agents, isLoading, isError, refetch, isFetching } = useAgentSummaries();
  const toggle = useToggleAgent();
  const run = useRunAgent();
  const [drill, setDrill] = useState<AgentSummary | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const chartData = useMemo(
    () =>
      (agents ?? [])
        .filter((a) => a.cost_usd_7d > 0)
        .map((a) => ({ name: a.agent_key, spend: Number(a.cost_usd_7d.toFixed(2)) }))
        .sort((x, y) => y.spend - x.spend)
        .slice(0, 10),
    [agents],
  );

  async function onToggle(agent: AgentSummary, enabled: boolean) {
    if (!user?.id) return;
    setBusyKey(agent.agent_key);
    try {
      await toggle.mutateAsync({ agentKey: agent.agent_key, enabled, actorId: user.id });
      toast.success(`${agent.name} ${enabled ? "enabled" : "disabled"}`);
    } catch (error) {
      handleError(error, { component: "AgentControlPlane", action: "toggle" });
      toast.error("Could not update the agent.");
    } finally {
      setBusyKey(null);
    }
  }

  async function onRun(agent: AgentSummary) {
    if (!user?.id) return;
    setBusyKey(agent.agent_key);
    try {
      const res = await run.mutateAsync({ agentKey: agent.agent_key, actorId: user.id });
      if (res?.notRunnable) toast.info(`${agent.name} has no manual-run function.`);
      else toast.success(`${agent.name} triggered`);
    } catch (error) {
      handleError(error, { component: "AgentControlPlane", action: "run" });
      toast.error("Could not trigger the agent.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" aria-hidden="true" /> Agent control plane
              </CardTitle>
              <CardDescription>Status, reliability, and spend for every autonomous agent.</CardDescription>
            </div>
            <Button variant="outline" size="sm" className="min-h-[44px]" onClick={() => refetch()} aria-label="Refresh agents">
              <RefreshCw className={cn("mr-2 h-4 w-4", isFetching && "animate-spin")} aria-hidden="true" /> Refresh
            </Button>
          </div>
        </CardHeader>
        {chartData.length > 0 && (
          <CardContent>
            <h3 className="mb-2 text-sm font-medium">7-day spend by agent (USD)</h3>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 10 }} width={40} />
                  <Tooltip />
                  <Bar dataKey="spend" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-2" aria-busy="true" aria-label="Loading agents">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden="true" />
              <p className="text-muted-foreground">Couldn't load agents.</p>
              <Button variant="outline" className="min-h-[44px]" onClick={() => refetch()}>Try again</Button>
            </div>
          ) : (
            <ul className="space-y-2">
              {(agents ?? []).map((a) => {
                const rate7 = successRate(a.successes_7d, a.runs_7d);
                const rate30 = successRate(a.successes_30d, a.runs_30d);
                const overBudget = a.monthly_cost_budget_usd != null && a.cost_usd_30d > a.monthly_cost_budget_usd;
                const busy = busyKey === a.agent_key;
                return (
                  <li key={a.agent_key} className={cn("rounded-lg border p-3", !a.enabled && "opacity-70")}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{a.name}</span>
                          <Badge variant="outline">{a.category}</Badge>
                          {a.last_status && (
                            <span className={cn("text-xs", statusTone(a.last_status))}>{a.last_status}</span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>last run: {a.last_run_at ? new Date(a.last_run_at).toLocaleString() : "never"}</span>
                          <span>7d: {rate7 == null ? "—" : `${rate7}%`} ({a.runs_7d})</span>
                          <span>30d: {rate30 == null ? "—" : `${rate30}%`} ({a.runs_30d})</span>
                          <span>proc {a.items_processed_7d} · esc {a.items_escalated_7d}</span>
                          <span className={cn(overBudget && "font-medium text-destructive")}>
                            ${a.cost_usd_30d.toFixed(2)}/30d
                            {a.monthly_cost_budget_usd != null && ` of $${a.monthly_cost_budget_usd}`}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1">
                          <Switch
                            checked={a.enabled}
                            disabled={busy}
                            onCheckedChange={(v) => onToggle(a, v)}
                            aria-label={`${a.enabled ? "Disable" : "Enable"} ${a.name}`}
                          />
                          <span className="text-xs text-muted-foreground">{a.enabled ? "on" : "off"}</span>
                        </div>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="min-h-[44px]"
                          disabled={busy}
                          onClick={() => onRun(a)}
                          aria-label={`Run ${a.name} now`}
                        >
                          <Play className="mr-1 h-4 w-4" aria-hidden="true" /> Run
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="min-h-[44px]"
                          onClick={() => setDrill(a)}
                          aria-label={`Run history for ${a.name}`}
                        >
                          History
                        </Button>
                      </div>
                    </div>
                    {a.last_error && (
                      <p className="mt-2 truncate text-xs text-destructive" title={a.last_error}>
                        last error: {a.last_error}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!drill} onOpenChange={(open) => !open && setDrill(null)}>
        {drill && <RunHistory agent={drill} onClose={() => setDrill(null)} />}
      </Sheet>
    </div>
  );
}
