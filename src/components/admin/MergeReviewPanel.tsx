import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, GitMerge, X, ArrowLeftRight, Play } from "lucide-react";

// content_merge_candidates / merge RPCs are not in the generated Supabase types
// (WEB-AUTO-005), so reads/writes go through `as never` casts like JobHealthPanel.
interface Candidate {
  id: string;
  content_type: "event" | "restaurant";
  survivor_id: string;
  loser_id: string;
  confidence: number;
  distance_meters: number | null;
  same_date: boolean | null;
  reasons: string[] | null;
  created_at: string;
}

interface RowInfo {
  id: string;
  title: string;
  subtitle: string;
  image_url: string | null;
}

interface QueueData {
  candidates: Candidate[];
  rows: Record<string, RowInfo>;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export default function MergeReviewPanel() {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  // Per-candidate orientation: when true the admin chose to keep the loser instead.
  const [swapped, setSwapped] = useState<Record<string, boolean>>({});

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["merge-review-queue"],
    queryFn: async (): Promise<QueueData> => {
      const { data: rawCandidates, error: cErr } = await supabase
        .from("content_merge_candidates" as never)
        .select("*")
        .eq("status", "pending")
        .order("confidence", { ascending: false })
        .limit(200);
      if (cErr) throw cErr;
      const candidates = (rawCandidates ?? []) as unknown as Candidate[];

      const eventIds = new Set<string>();
      const restaurantIds = new Set<string>();
      for (const c of candidates) {
        const bucket = c.content_type === "event" ? eventIds : restaurantIds;
        bucket.add(c.survivor_id);
        bucket.add(c.loser_id);
      }

      const rows: Record<string, RowInfo> = {};
      if (eventIds.size > 0) {
        const { data: evs } = await supabase
          .from("events")
          .select("id, title, location, venue, image_url")
          .in("id", Array.from(eventIds));
        for (const e of evs ?? []) {
          rows[e.id] = {
            id: e.id,
            title: e.title ?? "(untitled)",
            subtitle: [e.venue, e.location].filter(Boolean).join(" · ") || "—",
            image_url: e.image_url,
          };
        }
      }
      if (restaurantIds.size > 0) {
        const { data: rs } = await supabase
          .from("restaurants")
          .select("id, name, location, cuisine, image_url")
          .in("id", Array.from(restaurantIds));
        for (const r of rs ?? []) {
          rows[r.id] = {
            id: r.id,
            title: r.name ?? "(unnamed)",
            subtitle: [r.cuisine, r.location].filter(Boolean).join(" · ") || "—",
            image_url: r.image_url,
          };
        }
      }

      return { candidates, rows };
    },
    refetchInterval: 60_000,
  });

  const runScan = async () => {
    setScanning(true);
    try {
      const { error: invErr } = await supabase.functions.invoke("dedupe-content", {
        body: { manual: true },
      });
      if (invErr) throw invErr;
      toast({ title: "Duplicate scan started", description: "Re-running detection — results appear shortly." });
      setTimeout(() => refetch(), 3000);
    } catch (e) {
      toast({
        title: "Failed to start scan",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setScanning(false);
    }
  };

  const doMerge = async (c: Candidate) => {
    const keepLoser = swapped[c.id];
    const survivor = keepLoser ? c.loser_id : c.survivor_id;
    const loser = keepLoser ? c.survivor_id : c.loser_id;
    setBusy(c.id);
    try {
      const { error: mErr } = await supabase.rpc("merge_duplicate_content" as never, {
        p_content_type: c.content_type,
        p_survivor: survivor,
        p_loser: loser,
        p_confidence: c.confidence,
        p_decided_by: "admin",
      } as never);
      if (mErr) throw mErr;
      toast({ title: "Merged", description: "The duplicate was merged. It can be reversed for 30 days." });
      refetch();
    } catch (e) {
      toast({
        title: "Merge failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const doDismiss = async (c: Candidate) => {
    setBusy(c.id);
    try {
      const { error: dErr } = await supabase.rpc("dismiss_merge_candidate" as never, {
        p_id: c.id,
      } as never);
      if (dErr) throw dErr;
      toast({ title: "Dismissed", description: "Marked as not a duplicate." });
      refetch();
    } catch (e) {
      toast({
        title: "Dismiss failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const candidates = data?.candidates ?? [];

  return (
    <Card className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Duplicate Review</h2>
          <p className="text-sm text-muted-foreground">
            Ambiguous duplicate pairs awaiting a decision (high-confidence pairs auto-merge nightly).
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={runScan} disabled={scanning}>
            <Play className="h-4 w-4 mr-2" />
            {scanning ? "Scanning…" : "Run scan"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />Refresh
          </Button>
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground py-8 text-center">Loading merge queue…</p>}
      {error && (
        <p className="text-sm text-destructive py-8 text-center">
          Failed to load merge queue. {error instanceof Error ? error.message : ""}
        </p>
      )}

      {!isLoading && !error && candidates.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Nothing to review — no ambiguous duplicates are queued. 🎉
        </p>
      )}

      <div className="space-y-4">
        {candidates.map((c) => {
          const keepLoser = swapped[c.id];
          const keepId = keepLoser ? c.loser_id : c.survivor_id;
          const removeId = keepLoser ? c.survivor_id : c.loser_id;
          const keep = data?.rows[keepId];
          const remove = data?.rows[removeId];
          const reasons = c.reasons ?? [];
          return (
            <div key={c.id} className="rounded-lg border p-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="capitalize">{c.content_type}</Badge>
                  <Badge
                    className={
                      c.confidence >= 0.85
                        ? "bg-amber-500 hover:bg-amber-500"
                        : "bg-slate-500 hover:bg-slate-500"
                    }
                  >
                    {pct(c.confidence)} match
                  </Badge>
                  {reasons.map((r, i) => (
                    <span key={i} className="text-xs text-muted-foreground">{r}</span>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <RowCard label="Keep" tone="keep" row={keep} missingId={keepId} />
                <RowCard label="Remove (merge in)" tone="remove" row={remove} missingId={removeId} />
              </div>

              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <Button
                  size="sm"
                  disabled={busy === c.id}
                  onClick={() => doMerge(c)}
                >
                  <GitMerge className="h-4 w-4 mr-1" />
                  {busy === c.id ? "Working…" : "Merge"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy === c.id}
                  onClick={() => setSwapped((s) => ({ ...s, [c.id]: !s[c.id] }))}
                >
                  <ArrowLeftRight className="h-4 w-4 mr-1" />Swap which to keep
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy === c.id}
                  onClick={() => doDismiss(c)}
                >
                  <X className="h-4 w-4 mr-1" />Not a duplicate
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function RowCard({
  label,
  tone,
  row,
  missingId,
}: {
  label: string;
  tone: "keep" | "remove";
  row: RowInfo | undefined;
  missingId: string;
}) {
  return (
    <div
      className={
        "rounded-md border p-3 flex gap-3 " +
        (tone === "keep" ? "border-green-500/50 bg-green-500/5" : "border-destructive/40 bg-destructive/5")
      }
    >
      {row?.image_url ? (
        <img src={row.image_url} alt="" className="h-14 w-14 rounded object-cover flex-shrink-0" />
      ) : (
        <div className="h-14 w-14 rounded bg-muted flex-shrink-0" />
      )}
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="font-medium truncate">{row?.title ?? "(row unavailable)"}</div>
        <div className="text-sm text-muted-foreground truncate">{row?.subtitle ?? missingId}</div>
      </div>
    </div>
  );
}
