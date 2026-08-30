import { useState } from "react";
import { Clock, LifeBuoy, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useSupportTickets, useReclassifyTicket, type SupportTicket } from "@/hooks/useSupportTickets";
import { useAuth } from "@/contexts/AuthContext";
import { handleError } from "@/lib/errorHandler";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const PRIORITY_TONE: Record<string, string> = {
  urgent: "bg-destructive text-destructive-foreground",
  high: "bg-amber-500 text-white",
  normal: "bg-secondary text-secondary-foreground",
  low: "bg-muted text-muted-foreground",
};
const SENTIMENT_TONE: Record<string, string> = {
  negative: "text-destructive",
  neutral: "text-muted-foreground",
  positive: "text-green-600",
};
const PRIORITIES = ["urgent", "high", "normal", "low"];
const SENTIMENTS = ["negative", "neutral", "positive"];
const URGENCIES = ["critical", "high", "medium", "low"];

function slaTone(due: string | null): string {
  if (!due) return "text-muted-foreground";
  const ms = new Date(due).getTime() - Date.now();
  if (ms < 0) return "text-destructive font-medium";
  if (ms < 60 * 60 * 1000) return "text-amber-600";
  return "text-muted-foreground";
}

export default function SupportTicketsConsole() {
  const { data: tickets, isLoading, isError } = useSupportTickets();
  const reclassify = useReclassifyTicket();
  const { user } = useAuth();
  const [editing, setEditing] = useState<SupportTicket | null>(null);

  async function onSave() {
    if (!editing) return;
    try {
      await reclassify.mutateAsync({
        id: editing.id,
        sentiment: editing.sentiment ?? undefined,
        urgency: editing.urgency ?? undefined,
        priority: editing.priority ?? undefined,
        category: editing.category ?? undefined,
        actorId: user?.id,
      });
      toast.success("Classification updated. SLA recomputed; feedback captured.");
      setEditing(null);
    } catch (e) {
      handleError(e, { component: "SupportTicketsConsole", action: "reclassify" });
      toast.error("Failed to update classification.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LifeBuoy className="h-5 w-5" aria-hidden="true" /> Support tickets
        </CardTitle>
        <CardDescription>Auto-classified sentiment, urgency, priority + SLA. Correct any misclassification inline.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : isError ? (
          <p className="text-sm text-muted-foreground">Couldn't load tickets.</p>
        ) : !tickets || tickets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No support tickets yet.</p>
        ) : (
          <div className="space-y-2">
            {tickets.map((t) => (
              <div key={t.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {t.priority && <Badge className={cn(PRIORITY_TONE[t.priority] ?? "")}>{t.priority}</Badge>}
                    <span className="truncate font-medium">{t.subject ?? "(no subject)"}</span>
                    <Badge variant="outline">{t.status}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{t.body}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    {t.sentiment && <span className={SENTIMENT_TONE[t.sentiment] ?? ""}>sentiment: {t.sentiment}</span>}
                    {t.urgency && <span className="text-muted-foreground">urgency: {t.urgency}</span>}
                    {t.category && <span className="text-muted-foreground">{t.category}</span>}
                    {t.sla_due_at && (
                      <span className={cn("inline-flex items-center gap-1", slaTone(t.sla_due_at))}>
                        <Clock className="h-3 w-3" aria-hidden="true" /> SLA {new Date(t.sla_due_at).toLocaleString()}
                      </span>
                    )}
                    {t.classification_source && <span className="text-muted-foreground">by {t.classification_source}</span>}
                  </div>
                </div>
                <Button variant="outline" size="sm" className="min-h-[44px] shrink-0" onClick={() => setEditing(t)}>
                  Reclassify
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Correct classification</DialogTitle>
            <DialogDescription>Your correction recomputes the SLA and is captured as feedback.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Priority</Label>
                <Select value={editing.priority ?? "normal"} onValueChange={(v) => setEditing({ ...editing, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Sentiment</Label>
                <Select value={editing.sentiment ?? "neutral"} onValueChange={(v) => setEditing({ ...editing, sentiment: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SENTIMENTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Urgency</Label>
                <Select value={editing.urgency ?? "low"} onValueChange={(v) => setEditing({ ...editing, urgency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{URGENCIES.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Category</Label>
                <Select value={editing.category ?? "general"} onValueChange={(v) => setEditing({ ...editing, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["billing", "account", "content", "technical", "feedback", "general"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={onSave} disabled={reclassify.isPending}>
              {reclassify.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
