import { useMemo, useState } from "react";
import { AlertTriangle, Bot, CheckCircle2, Clock, Inbox, RefreshCw, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import {
  useAgentTasks,
  useInboxAgentKeys,
  useAgentRunSummary,
  useClaimTask,
  useResolveTask,
  isOverdue,
  type AgentTask,
  type AgentTaskFilters,
} from "@/hooks/useAgentTasks";
import { cn } from "@/lib/utils";
import { handleError } from "@/lib/errorHandler";
import { toast } from "sonner";

const CATEGORIES = [
  "dev",
  "maintain",
  "nurture",
  "prospect",
  "support",
  "manage",
  "security",
  "governance",
] as const;

const TIER_LABEL: Record<number, string> = { 1: "Tier 1 · auto", 2: "Tier 2 · human", 3: "Tier 3 · senior" };

function relativeSla(task: AgentTask): string {
  if (!task.sla_due_at) return "No SLA";
  const ms = new Date(task.sla_due_at).getTime() - Date.now();
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  const rel = h > 0 ? `${h}h ${m}m` : `${m}m`;
  return ms < 0 ? `Overdue by ${rel}` : `Due in ${rel}`;
}

function TaskDetail({
  task,
  onClose,
}: {
  task: AgentTask;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { data: run } = useAgentRunSummary(task.agent_key);
  const resolve = useResolveTask();
  const [notes, setNotes] = useState("");

  const suggested =
    (task.payload?.suggested_resolution as string | undefined) ??
    (task.payload?.suggestedResolution as string | undefined) ??
    null;

  async function act(outcome: "resolved" | "closed") {
    if (!user?.id) return;
    try {
      await resolve.mutateAsync({ taskId: task.id, adminId: user.id, outcome, notes });
      toast.success(outcome === "resolved" ? "Task resolved" : "Task closed");
      onClose();
    } catch (error) {
      handleError(error, { component: "AgentInbox", action: `resolve:${outcome}` });
      toast.error("Could not update the task. Try again.");
    }
  }

  return (
    <SheetContent className="w-full overflow-y-auto sm:max-w-lg" aria-label={`Task detail: ${task.title}`}>
      <SheetHeader>
        <SheetTitle className="pr-6">{task.title}</SheetTitle>
        <SheetDescription>
          {task.agent_key} · {task.category} · {TIER_LABEL[task.tier] ?? `Tier ${task.tier}`}
        </SheetDescription>
      </SheetHeader>

      <div className="mt-4 space-y-6 text-sm">
        <section aria-label="Status">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{task.status}</Badge>
            {task.queue && <Badge variant="outline">queue: {task.queue}</Badge>}
            {typeof task.confidence === "number" && (
              <Badge variant="outline">confidence {(task.confidence * 100).toFixed(0)}%</Badge>
            )}
            <Badge variant={isOverdue(task) ? "destructive" : "outline"}>
              <Clock className="mr-1 h-3 w-3" aria-hidden="true" />
              {relativeSla(task)}
            </Badge>
          </div>
        </section>

        {suggested && (
          <section aria-label="AI-suggested resolution">
            <h3 className="mb-1 font-medium">AI-suggested resolution</h3>
            <p className="rounded-md bg-muted p-3 text-muted-foreground">{suggested}</p>
          </section>
        )}

        <section aria-label="Payload">
          <h3 className="mb-1 font-medium">Task payload</h3>
          <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">
            {JSON.stringify(task.payload ?? {}, null, 2)}
          </pre>
        </section>

        <section aria-label="Producing agent">
          <h3 className="mb-1 font-medium">Producing agent</h3>
          {run ? (
            <div className="rounded-md border p-3 text-muted-foreground">
              <div className="font-medium text-foreground">{run.name}</div>
              <div>Last run: {run.last_run_at ? new Date(run.last_run_at).toLocaleString() : "—"} ({run.last_status ?? "n/a"})</div>
              {run.last_summary && <div className="mt-1">{run.last_summary}</div>}
              <div className="mt-1">7-day: {run.successes_7d}/{run.runs_7d} ok · {run.failures_7d} failed</div>
            </div>
          ) : (
            <p className="text-muted-foreground">No recent run recorded for this agent.</p>
          )}
        </section>

        <section aria-label="Resolution">
          <Label htmlFor="resolution-notes" className="mb-1 block font-medium">
            Resolution notes
          </Label>
          <Textarea
            id="resolution-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What did you do? (stored on the task as the human-action record)"
            rows={3}
          />
        </section>
      </div>

      <SheetFooter className="mt-6 flex-col gap-2 sm:flex-row">
        <Button
          className="min-h-[44px] w-full sm:w-auto"
          onClick={() => act("resolved")}
          disabled={resolve.isPending}
        >
          <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" /> Mark resolved
        </Button>
        <Button
          variant="outline"
          className="min-h-[44px] w-full sm:w-auto"
          onClick={() => act("closed")}
          disabled={resolve.isPending}
        >
          <XCircle className="mr-2 h-4 w-4" aria-hidden="true" /> Close (no action)
        </Button>
      </SheetFooter>
    </SheetContent>
  );
}

export default function AgentInbox() {
  const { user } = useAuth();
  const [filters, setFilters] = useState<AgentTaskFilters>({ tier: "all", category: "all", agentKey: "all", sla: "all" });
  const [selected, setSelected] = useState<AgentTask | null>(null);

  const { data: tasks, isLoading, isError, refetch, isFetching } = useAgentTasks(filters);
  const { data: agentKeys } = useInboxAgentKeys();
  const claim = useClaimTask();

  const overdueCount = useMemo(() => (tasks ?? []).filter(isOverdue).length, [tasks]);

  function setFilter<K extends keyof AgentTaskFilters>(key: K, value: AgentTaskFilters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  async function onClaim(task: AgentTask) {
    if (!user?.id) return;
    try {
      await claim.mutateAsync({ taskId: task.id, adminId: user.id });
      toast.success("Task claimed");
    } catch (error) {
      handleError(error, { component: "AgentInbox", action: "claim" });
      toast.error("Could not claim the task. Try again.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Inbox className="h-5 w-5" aria-hidden="true" /> Escalation inbox
            </CardTitle>
            <CardDescription>
              Tier-2/3 tasks agents escalated for a human.
              {overdueCount > 0 && (
                <span className="ml-1 font-medium text-destructive">{overdueCount} overdue</span>
              )}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="min-h-[44px]"
            onClick={() => refetch()}
            aria-label="Refresh inbox"
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", isFetching && "animate-spin")} aria-hidden="true" /> Refresh
          </Button>
        </div>

        {/* Filters */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div>
            <Label htmlFor="filter-tier" className="text-xs">Tier</Label>
            <Select value={String(filters.tier)} onValueChange={(v) => setFilter("tier", v === "all" ? "all" : Number(v))}>
              <SelectTrigger id="filter-tier" className="min-h-[44px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tiers</SelectItem>
                <SelectItem value="1">Tier 1</SelectItem>
                <SelectItem value="2">Tier 2</SelectItem>
                <SelectItem value="3">Tier 3</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="filter-category" className="text-xs">Category</Label>
            <Select value={String(filters.category)} onValueChange={(v) => setFilter("category", v)}>
              <SelectTrigger id="filter-category" className="min-h-[44px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="filter-agent" className="text-xs">Agent</Label>
            <Select value={String(filters.agentKey)} onValueChange={(v) => setFilter("agentKey", v)}>
              <SelectTrigger id="filter-agent" className="min-h-[44px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All agents</SelectItem>
                {(agentKeys ?? []).map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="filter-sla" className="text-xs">SLA</Label>
            <Select value={String(filters.sla)} onValueChange={(v) => setFilter("sla", v as AgentTaskFilters["sla"])}>
              <SelectTrigger id="filter-sla" className="min-h-[44px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any SLA</SelectItem>
                <SelectItem value="overdue">Overdue only</SelectItem>
                <SelectItem value="ok">Within SLA</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading tasks">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden="true" />
            <p className="text-muted-foreground">Couldn't load the inbox.</p>
            <Button variant="outline" className="min-h-[44px]" onClick={() => refetch()}>Try again</Button>
          </div>
        ) : (tasks ?? []).length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Inbox className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
            <p className="font-medium">Inbox zero</p>
            <p className="text-sm text-muted-foreground">No escalated tasks match these filters.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {(tasks ?? []).map((task) => {
              const overdue = isOverdue(task);
              const mine = task.assigned_to === user?.id;
              return (
                <li
                  key={task.id}
                  className={cn(
                    "rounded-lg border p-3",
                    overdue && "border-destructive/50 bg-destructive/5",
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{task.title}</span>
                        <Badge variant="secondary">{TIER_LABEL[task.tier] ?? `Tier ${task.tier}`}</Badge>
                        {task.status === "assigned" && (
                          <Badge variant="outline">{mine ? "assigned to you" : "claimed"}</Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Bot className="h-3 w-3" aria-hidden="true" />{task.agent_key}
                        </span>
                        <span>{task.category}</span>
                        <span className={cn("inline-flex items-center gap-1", overdue && "font-medium text-destructive")}>
                          <Clock className="h-3 w-3" aria-hidden="true" />{relativeSla(task)}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {!mine && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="min-h-[44px]"
                          onClick={() => onClaim(task)}
                          disabled={claim.isPending}
                        >
                          Claim
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-[44px]"
                        onClick={() => setSelected(task)}
                        aria-label={`Open details for ${task.title}`}
                      >
                        Details
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        {selected && <TaskDetail task={selected} onClose={() => setSelected(null)} />}
      </Sheet>
    </Card>
  );
}
