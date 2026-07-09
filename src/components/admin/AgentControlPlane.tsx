import { useMemo, useState } from "react";
import { AlertTriangle, Bot, Play, RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  useGlobalPause,
  useSetGlobalPause,
  useMonthlySpend,
  useAgentQuality,
  useAgentModes,
  useAgentConfigRow,
  useUpdateAgentConfig,
  successRate,
  SENSITIVE_CATEGORIES,
  THRESHOLD_FLOOR,
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

function ConfigDialog({ agent, onClose }: { agent: AgentSummary; onClose: () => void }) {
  const { user } = useAuth();
  const { data: cfg, isLoading } = useAgentConfigRow(agent.agent_key);
  const update = useUpdateAgentConfig();
  const [threshold, setThreshold] = useState<string>("");
  const [budget, setBudget] = useState<string>("");
  const [override, setOverride] = useState(false);
  const [live, setLive] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Seed the form once the config row arrives.
  if (cfg && !loaded) {
    setThreshold(String(cfg.tier1_confidence_threshold));
    setBudget(cfg.monthly_cost_budget_usd == null ? "" : String(cfg.monthly_cost_budget_usd));
    setOverride(cfg.auto_override);
    setLive(cfg.mode === "live");
    setLoaded(true);
  }

  const sensitive = SENSITIVE_CATEGORIES.has(agent.category);
  const thresholdNum = parseFloat(threshold);
  const belowFloor = sensitive && Number.isFinite(thresholdNum) && thresholdNum < THRESHOLD_FLOOR;

  async function save() {
    if (!user?.id) return;
    const t = parseFloat(threshold);
    if (!Number.isFinite(t) || t < 0 || t > 1) {
      toast.error("Threshold must be between 0 and 1.");
      return;
    }
    const b = budget.trim() === "" ? null : parseFloat(budget);
    if (b != null && (!Number.isFinite(b) || b < 0)) {
      toast.error("Budget must be a non-negative number or blank.");
      return;
    }
    try {
      const res = await update.mutateAsync({
        agentKey: agent.agent_key,
        actorId: user.id,
        tier1ConfidenceThreshold: t,
        monthlyCostBudgetUsd: b,
        autoOverride: override,
        agentMode: live ? "live" : "shadow",
      });
      if (res?.safetyFloor) {
        toast.error(res.error ?? "Blocked by the safety floor for this category.");
        return;
      }
      toast.success("Config updated");
      onClose();
    } catch (error) {
      handleError(error, { component: "AgentControlPlane", action: "update_config" });
      toast.error(error instanceof Error ? error.message : "Could not update config.");
    }
  }

  return (
    <DialogContent aria-label={`Configure ${agent.name}`}>
      <DialogHeader>
        <DialogTitle>Configure {agent.name}</DialogTitle>
        <DialogDescription>
          {agent.category} · auto-vs-human threshold and monthly budget. Read live — no deploy needed.
        </DialogDescription>
      </DialogHeader>

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <div className="space-y-4">
          <div>
            <Label htmlFor="cfg-threshold">Tier-1 confidence threshold (0–1)</Label>
            <Input
              id="cfg-threshold"
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="min-h-[44px]"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              At/above this confidence, tasks auto-resolve (tier 1); below, they escalate to a human.
            </p>
          </div>

          <div>
            <Label htmlFor="cfg-budget">Monthly cost budget (USD, blank = none)</Label>
            <Input
              id="cfg-budget"
              type="number"
              step="1"
              min="0"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className="min-h-[44px]"
            />
          </div>

          <div className="flex items-center justify-between rounded-md border p-2">
            <div>
              <Label htmlFor="cfg-mode" className="font-medium">Live mode</Label>
              <p className="text-xs text-muted-foreground">
                {live ? "Executes actions." : "Shadow: proposes + logs actions without executing."}
              </p>
            </div>
            <Switch id="cfg-mode" checked={live} onCheckedChange={setLive} aria-label="Toggle live mode" />
          </div>

          {sensitive && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2">
              <Checkbox
                id="cfg-override"
                checked={override}
                onCheckedChange={(v) => setOverride(v === true)}
                className="mt-1"
              />
              <Label htmlFor="cfg-override" className="text-sm font-normal">
                Override the {THRESHOLD_FLOOR} safety floor for this {agent.category} agent.
                {belowFloor && !override && (
                  <span className="mt-1 block font-medium text-destructive">
                    Required: {threshold} is below the floor for a financial/destructive category.
                  </span>
                )}
              </Label>
            </div>
          )}
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" className="min-h-[44px]" onClick={onClose}>Cancel</Button>
        <Button className="min-h-[44px]" onClick={save} disabled={update.isPending || isLoading}>Save</Button>
      </DialogFooter>
    </DialogContent>
  );
}

export default function AgentControlPlane() {
  const { user } = useAuth();
  const { data: agents, isLoading, isError, refetch, isFetching } = useAgentSummaries();
  const { data: monthSpend } = useMonthlySpend();
  const { data: quality } = useAgentQuality();
  const { data: modes } = useAgentModes();
  const { data: globalPaused } = useGlobalPause();

  const osSpend = useMemo(() => {
    const rows = monthSpend ?? [];
    const total = rows.reduce((sum, r) => sum + Number(r.spend_mtd || 0), 0);
    const overBudget = rows.filter((r) => r.monthly_cost_budget_usd != null && Number(r.spend_mtd) > r.monthly_cost_budget_usd);
    const totalBudget = rows.reduce((sum, r) => sum + (r.monthly_cost_budget_usd ?? 0), 0);
    return { total, overBudget, totalBudget };
  }, [monthSpend]);
  const setPause = useSetGlobalPause();
  const toggle = useToggleAgent();
  const run = useRunAgent();
  const [drill, setDrill] = useState<AgentSummary | null>(null);
  const [editing, setEditing] = useState<AgentSummary | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function onGlobalPause(paused: boolean) {
    if (!user?.id) return;
    try {
      await setPause.mutateAsync({ paused, actorId: user.id });
      toast.success(paused ? "All agents paused" : "Agents resumed");
    } catch (error) {
      handleError(error, { component: "AgentControlPlane", action: "global_pause" });
      toast.error("Could not change the global pause.");
    }
  }

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

          {/* Global kill switch — one-click incident pause for every agent. */}
          <div
            className={cn(
              "mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3",
              globalPaused && "border-destructive bg-destructive/10",
            )}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className={cn("h-5 w-5", globalPaused ? "text-destructive" : "text-muted-foreground")} aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">
                  {globalPaused ? "All agents are PAUSED" : "Global pause"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {globalPaused
                    ? "No agent will take action until resumed. Scheduled runs record as skipped."
                    : "Instantly stop every agent (no deploy). Takes effect on the next invocation."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={!!globalPaused}
                disabled={setPause.isPending}
                onCheckedChange={onGlobalPause}
                aria-label={globalPaused ? "Resume all agents" : "Pause all agents"}
              />
              <span className="text-xs font-medium">{globalPaused ? "Paused" : "Active"}</span>
            </div>
          </div>

          {/* OS spend this month (AOS-GOV-001). */}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">OS spend this month</p>
              <p className="text-xl font-semibold">${osSpend.total.toFixed(2)}</p>
              {osSpend.totalBudget > 0 && (
                <p className="text-xs text-muted-foreground">of ${osSpend.totalBudget.toFixed(0)} budgeted</p>
              )}
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Agents over budget</p>
              <p className={cn("text-xl font-semibold", osSpend.overBudget.length > 0 && "text-destructive")}>
                {osSpend.overBudget.length}
              </p>
              {osSpend.overBudget.length > 0 && (
                <p className="truncate text-xs text-destructive" title={osSpend.overBudget.map((a) => a.agent_key).join(", ")}>
                  {osSpend.overBudget.map((a) => a.agent_key).join(", ")}
                </p>
              )}
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Agents</p>
              <p className="text-xl font-semibold">{(agents ?? []).length}</p>
              <p className="text-xs text-muted-foreground">{(agents ?? []).filter((a) => a.enabled).length} enabled</p>
            </div>
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
                          {modes?.[a.agent_key] === "shadow" && (
                            <Badge variant="secondary" title="Shadow mode: proposes without executing">shadow</Badge>
                          )}
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
                          {quality?.[a.agent_key] && (
                            <span title="Avg LLM-judge quality score, 30d">
                              quality {quality[a.agent_key].avg_score_30d} ({quality[a.agent_key].failed_30d} gated)
                            </span>
                          )}
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
                          onClick={() => setEditing(a)}
                          aria-label={`Configure ${a.name}`}
                        >
                          Config
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

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        {editing && <ConfigDialog agent={editing} onClose={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}
