import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Check, X, Play, ShieldAlert } from "lucide-react";

// content_moderation / decide_moderation are not in the generated Supabase types
// (WEB-AUTO-009), so reads/writes go through `as never` casts like MergeReviewPanel.
type Status = "pending" | "flagged" | "rejected" | "error";

interface ModerationRow {
  id: string;
  content_type: "review" | "contact";
  content_id: string;
  status: Status;
  toxicity: number | null;
  spam: number | null;
  off_topic: number | null;
  reasons: string[] | null;
  excerpt: string | null;
  created_at: string;
}

function pct(n: number | null): string {
  return n == null ? "—" : `${Math.round(n * 100)}%`;
}

function statusBadge(s: Status) {
  switch (s) {
    case "rejected":
      return <Badge variant="destructive">Rejected</Badge>;
    case "flagged":
      return <Badge className="bg-amber-500 hover:bg-amber-500">Flagged</Badge>;
    case "error":
      return <Badge className="bg-slate-500 hover:bg-slate-500">Needs review</Badge>;
    default:
      return <Badge variant="secondary">Pending</Badge>;
  }
}

export default function ModerationQueuePanel() {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [sweeping, setSweeping] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["content-moderation-queue"],
    queryFn: async (): Promise<ModerationRow[]> => {
      const { data: rows, error: qErr } = await supabase
        .from("content_moderation" as never)
        .select("*")
        .neq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(200);
      if (qErr) throw qErr;
      return (rows ?? []) as unknown as ModerationRow[];
    },
    refetchInterval: 60_000,
  });

  const decide = async (row: ModerationRow, decision: "approve" | "reject") => {
    setBusy(row.id);
    try {
      const { error: dErr } = await supabase.rpc("decide_moderation" as never, {
        p_id: row.id,
        p_decision: decision,
      } as never);
      if (dErr) throw dErr;
      toast({
        title: decision === "approve" ? "Published" : "Kept hidden",
        description: decision === "approve" ? "The content is now visible." : "The content stays hidden.",
      });
      refetch();
    } catch (e) {
      toast({
        title: "Action failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const runSweep = async () => {
    setSweeping(true);
    try {
      const { error: invErr } = await supabase.functions.invoke("moderate-content", {
        body: { mode: "sweep" },
      });
      if (invErr) throw invErr;
      toast({ title: "Re-moderation started", description: "Scoring any pending reviews — results appear shortly." });
      setTimeout(() => refetch(), 3000);
    } catch (e) {
      toast({
        title: "Failed to start sweep",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSweeping(false);
    }
  };

  const rows = data ?? [];

  return (
    <Card className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" />
            Content Moderation
          </h2>
          <p className="text-sm text-muted-foreground">
            User content the AI flagged or rejected. Clean content is published automatically.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={runSweep} disabled={sweeping}>
            <Play className="h-4 w-4 mr-2" />
            {sweeping ? "Scanning…" : "Re-moderate pending"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />Refresh
          </Button>
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground py-8 text-center">Loading moderation queue…</p>}
      {error && (
        <p className="text-sm text-destructive py-8 text-center">
          Failed to load moderation queue. {error instanceof Error ? error.message : ""}
        </p>
      )}

      {!isLoading && !error && rows.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Nothing to review — no content is flagged. 🎉
        </p>
      )}

      <div className="space-y-3">
        {rows.map((row) => {
          const reasons = row.reasons ?? [];
          return (
            <div key={row.id} className="rounded-lg border p-4">
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="capitalize">{row.content_type}</Badge>
                  {statusBadge(row.status)}
                  <span className="text-xs text-muted-foreground">
                    tox {pct(row.toxicity)} · spam {pct(row.spam)} · off-topic {pct(row.off_topic)}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(row.created_at).toLocaleString()}
                </span>
              </div>

              <p className="text-sm bg-muted/50 rounded p-2 mb-2">
                {row.excerpt ? `“${row.excerpt}”` : <span className="text-muted-foreground">(no text)</span>}
              </p>

              {reasons.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {reasons.map((r, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400">
                      {r}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button size="sm" disabled={busy === row.id} onClick={() => decide(row, "approve")}>
                  <Check className="h-4 w-4 mr-1" />
                  {busy === row.id ? "Working…" : "Approve & publish"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy === row.id}
                  onClick={() => decide(row, "reject")}
                >
                  <X className="h-4 w-4 mr-1" />Keep hidden
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
