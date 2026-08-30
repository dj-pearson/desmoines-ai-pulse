import { useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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
  usePendingApprovals,
  useDecideApproval,
  isExpiringSoon,
  type AgentActionApproval,
} from "@/hooks/useAgentApprovals";
import { cn } from "@/lib/utils";
import { handleError } from "@/lib/errorHandler";
import { toast } from "sonner";

function expiresLabel(a: AgentActionApproval): string {
  if (!a.expires_at) return "No expiry";
  const ms = new Date(a.expires_at).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `Expires in ${h}h ${m}m` : `Expires in ${m}m`;
}

function ApprovalDetail({ approval, onDone }: { approval: AgentActionApproval; onDone: () => void }) {
  const { user } = useAuth();
  const decide = useDecideApproval();
  const [reason, setReason] = useState("");

  async function act(decision: "approve" | "reject") {
    if (!user?.id) return;
    if (decision === "reject" && !reason.trim()) {
      toast.error("A reason is required to reject.");
      return;
    }
    try {
      await decide.mutateAsync({ approvalId: approval.id, decision, reason, decidedBy: user.id });
      toast.success(decision === "approve" ? "Approved — action executed" : "Rejected");
      onDone();
    } catch (error) {
      handleError(error, { component: "AgentApprovals", action: decision });
      toast.error("Could not record the decision. Try again.");
    }
  }

  return (
    <SheetContent className="w-full overflow-y-auto sm:max-w-lg" aria-label={`Approval: ${approval.action_type}`}>
      <SheetHeader>
        <SheetTitle className="pr-6">{approval.action_type}</SheetTitle>
        <SheetDescription>
          {approval.agent_key} · {expiresLabel(approval)}
        </SheetDescription>
      </SheetHeader>

      <div className="mt-4 space-y-6 text-sm">
        <section aria-label="Proposed action payload">
          <h3 className="mb-1 font-medium">Proposed action</h3>
          <pre className="max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs">
            {JSON.stringify(approval.proposed_payload ?? {}, null, 2)}
          </pre>
        </section>

        <section aria-label="Reject reason">
          <Label htmlFor="approval-reason" className="mb-1 block font-medium">
            Reason <span className="text-muted-foreground">(required to reject)</span>
          </Label>
          <Textarea
            id="approval-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why approve or reject this action?"
            rows={3}
          />
        </section>
      </div>

      <SheetFooter className="mt-6 flex-col gap-2 sm:flex-row">
        <Button className="min-h-[44px] w-full sm:w-auto" onClick={() => act("approve")} disabled={decide.isPending}>
          <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" /> Approve &amp; execute
        </Button>
        <Button
          variant="destructive"
          className="min-h-[44px] w-full sm:w-auto"
          onClick={() => act("reject")}
          disabled={decide.isPending}
        >
          <XCircle className="mr-2 h-4 w-4" aria-hidden="true" /> Reject
        </Button>
      </SheetFooter>
    </SheetContent>
  );
}

export default function AgentApprovals() {
  const { data: approvals, isLoading, isError, refetch, isFetching } = usePendingApprovals();
  const [selected, setSelected] = useState<AgentActionApproval | null>(null);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" /> Action approvals
            </CardTitle>
            <CardDescription>Risky agent actions waiting for a human to approve before they run.</CardDescription>
          </div>
          <Button variant="outline" size="sm" className="min-h-[44px]" onClick={() => refetch()} aria-label="Refresh approvals">
            <RefreshCw className={cn("mr-2 h-4 w-4", isFetching && "animate-spin")} aria-hidden="true" /> Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading approvals">
            {[0, 1].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden="true" />
            <p className="text-muted-foreground">Couldn't load approvals.</p>
            <Button variant="outline" className="min-h-[44px]" onClick={() => refetch()}>Try again</Button>
          </div>
        ) : (approvals ?? []).length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <ShieldCheck className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
            <p className="font-medium">Nothing awaiting approval</p>
            <p className="text-sm text-muted-foreground">Agents haven't queued any guarded actions.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {(approvals ?? []).map((a) => {
              const soon = isExpiringSoon(a);
              return (
                <li key={a.id} className={cn("rounded-lg border p-3", soon && "border-amber-500/50 bg-amber-500/5")}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{a.action_type}</span>
                        <Badge variant="outline">{a.agent_key}</Badge>
                      </div>
                      <div className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className={cn("h-3 w-3", soon && "text-amber-600")} aria-hidden="true" />
                        <span className={cn(soon && "font-medium text-amber-600")}>{expiresLabel(a)}</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-[44px]"
                      onClick={() => setSelected(a)}
                      aria-label={`Review ${a.action_type} from ${a.agent_key}`}
                    >
                      Review
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        {selected && <ApprovalDetail approval={selected} onDone={() => setSelected(null)} />}
      </Sheet>
    </Card>
  );
}
