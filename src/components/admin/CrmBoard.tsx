import { useMemo } from "react";
import { Briefcase, ChevronRight, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCrmBoard, useCrmAction, CRM_STAGES, type CrmOpportunity } from "@/hooks/useCrm";
import { useAuth } from "@/contexts/AuthContext";
import { handleError } from "@/lib/errorHandler";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STAGE_TONE: Record<string, string> = {
  new: "border-slate-300",
  qualified: "border-blue-400",
  contacted: "border-cyan-400",
  proposal: "border-amber-400",
  won: "border-green-500",
  lost: "border-red-400",
};

function nextStage(stage: string): string | null {
  const i = CRM_STAGES.indexOf(stage as (typeof CRM_STAGES)[number]);
  if (i < 0 || stage === "won" || stage === "lost") return null;
  return CRM_STAGES[i + 1];
}

export default function CrmBoard() {
  const { data, isLoading, isError } = useCrmBoard();
  const action = useCrmAction();
  const { user } = useAuth();

  const accountName = useMemo(() => {
    const m = new Map<string, string>();
    (data?.accounts ?? []).forEach((a) => m.set(a.id, a.name));
    return m;
  }, [data]);

  const byStage = useMemo(() => {
    const g: Record<string, CrmOpportunity[]> = {};
    for (const s of CRM_STAGES) g[s] = [];
    (data?.opportunities ?? []).forEach((o) => (g[o.stage] ?? (g[o.stage] = [])).push(o));
    return g;
  }, [data]);

  async function run(body: Record<string, unknown>, ok: string) {
    try {
      await action.mutateAsync({ ...body, actorId: user?.id });
      toast.success(ok);
    } catch (e) {
      handleError(e, { component: "CrmBoard", action: String(body.action) });
      toast.error("Action failed.");
    }
  }

  return (
    <div className="space-y-4">
      {/* New leads to work */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" aria-hidden="true" /> New leads
          </CardTitle>
          <CardDescription>Discovered prospects. Promote a lead to start an opportunity.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : isError ? (
            <p className="text-sm text-muted-foreground">Couldn't load the CRM.</p>
          ) : !data || data.leads.filter((l) => l.status !== "disqualified").length === 0 ? (
            <p className="text-sm text-muted-foreground">No open leads.</p>
          ) : (
            <div className="space-y-2">
              {data.leads.filter((l) => l.status !== "disqualified").slice(0, 20).map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{l.business_name}</span>
                      {l.category && <Badge variant="secondary">{l.category}</Badge>}
                      {l.fit_score != null && <Badge variant="outline">fit {Math.round(l.fit_score * 100)}%</Badge>}
                    </div>
                  </div>
                  {l.account_id ? (
                    <Button size="sm" variant="outline" onClick={() => run({ action: "create_opportunity", accountId: l.account_id, leadId: l.id, name: `${l.business_name} — advertising` }, "Opportunity created.")} disabled={action.isPending}>
                      <Briefcase className="mr-2 h-4 w-4" /> New opp
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">promote from prospects</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pipeline board */}
      <Card>
        <CardHeader>
          <CardTitle>Pipeline</CardTitle>
          <CardDescription>Opportunities by stage. Advance to the next stage inline.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="grid gap-3 overflow-x-auto md:grid-cols-3 lg:grid-cols-6">
              {CRM_STAGES.map((stage) => (
                <div key={stage} className={cn("min-w-[180px] rounded-lg border-t-4 bg-muted/20 p-2", STAGE_TONE[stage])}>
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                    {stage} <span className="ml-1">{byStage[stage]?.length ?? 0}</span>
                  </p>
                  <div className="space-y-2">
                    {(byStage[stage] ?? []).map((o) => {
                      const ns = nextStage(o.stage);
                      return (
                        <div key={o.id} className="rounded-md border bg-background p-2 text-sm">
                          <p className="font-medium">{accountName.get(o.account_id ?? "") ?? o.name}</p>
                          {o.value > 0 && <p className="text-xs text-muted-foreground">${o.value.toLocaleString()}</p>}
                          {ns && (
                            <Button size="sm" variant="ghost" className="mt-1 h-7 px-2 text-xs" onClick={() => run({ action: "advance_stage", id: o.id, stage: ns }, `Moved to ${ns}.`)} disabled={action.isPending}>
                              {ns} <ChevronRight className="ml-1 h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
