import { useMemo } from "react";
import { Briefcase, ChevronRight, FileText, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCrmBoard, useCrmAction, useProposal, CRM_STAGES, type CrmOpportunity } from "@/hooks/useCrm";
import { useAuth } from "@/contexts/AuthContext";
import { handleError } from "@/lib/errorHandler";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// One hue per stage, carried by a dot beside the column label rather than a
// thick top border: the border fought the card's rounded corners, and the dot
// has no contrast floor to meet the way tinted label text would.
const STAGE_TONE: Record<string, string> = {
  new: "bg-slate-400",
  qualified: "bg-blue-500",
  contacted: "bg-cyan-500",
  proposal: "bg-amber-500",
  won: "bg-green-500",
  lost: "bg-red-500",
};

function nextStage(stage: string): string | null {
  const i = CRM_STAGES.indexOf(stage as (typeof CRM_STAGES)[number]);
  if (i < 0 || stage === "won" || stage === "lost") return null;
  return CRM_STAGES[i + 1];
}

export default function CrmBoard() {
  const { data, isLoading, isError } = useCrmBoard();
  const action = useCrmAction();
  const { generate, openProposal } = useProposal();
  const { user } = useAuth();

  const proposalByOpp = useMemo(() => {
    const m = new Map<string, string>();
    (data?.proposals ?? []).forEach((p) => { if (!m.has(p.opportunity_id)) m.set(p.opportunity_id, p.id); });
    return m;
  }, [data]);

  async function onLog(oppId: string) {
    const note = window.prompt("Log activity (note, call, email…):");
    if (note && note.trim()) await run({ action: "log_activity", id: oppId, note: note.trim() }, "Activity logged.");
  }

  async function onProposal(oppId: string) {
    const existing = proposalByOpp.get(oppId);
    if (existing) return openProposal(existing);
    try {
      const res = await generate.mutateAsync(oppId);
      toast.success("Proposal draft generated.");
      if (res?.proposalId) openProposal(res.proposalId);
    } catch (e) {
      handleError(e, { component: "CrmBoard", action: "generate_proposal" });
      toast.error("Couldn't generate the proposal.");
    }
  }

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
                <div key={stage} className="min-w-[180px] rounded-lg border bg-muted/20 p-2">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", STAGE_TONE[stage])} aria-hidden="true" />
                    {stage} <span className="ml-1">{byStage[stage]?.length ?? 0}</span>
                  </p>
                  <div className="space-y-2">
                    {(byStage[stage] ?? []).map((o) => {
                      const ns = nextStage(o.stage);
                      return (
                        <div key={o.id} className="rounded-md border bg-background p-2 text-sm">
                          <p className="font-medium">{accountName.get(o.account_id ?? "") ?? o.name}</p>
                          {o.value > 0 && <p className="text-xs text-muted-foreground">${o.value.toLocaleString()}</p>}
                          {/* Next action: human-set wins; else the agent suggestion. */}
                          {(o.next_action || o.suggested_next_action) && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {o.next_action ? (
                                <span>▸ {o.next_action}</span>
                              ) : (
                                <span className="italic">💡 {o.suggested_next_action}</span>
                              )}
                            </p>
                          )}
                          <div className="mt-1 flex flex-wrap gap-1">
                            {ns && (
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => run({ action: "advance_stage", id: o.id, stage: ns }, `Moved to ${ns}.`)} disabled={action.isPending}>
                                {ns} <ChevronRight className="ml-1 h-3 w-3" />
                              </Button>
                            )}
                            {!o.next_action && o.suggested_next_action && (
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => run({ action: "accept_suggestion", id: o.id }, "Suggestion accepted.")} disabled={action.isPending}>
                                Accept
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onProposal(o.id)} disabled={generate.isPending}>
                              <FileText className="mr-1 h-3 w-3" /> {proposalByOpp.has(o.id) ? "View" : "Proposal"}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onLog(o.id)} disabled={action.isPending}>
                              Log
                            </Button>
                            {!o.assigned_closer && (
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => run({ action: "assign_closer", id: o.id, closer: user?.id }, "Assigned to you.")} disabled={action.isPending}>
                                Take
                              </Button>
                            )}
                          </div>
                          {o.onboarding_started && <p className="mt-1 text-xs font-medium text-green-600">onboarding started</p>}
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
