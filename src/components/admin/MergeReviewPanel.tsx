import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Play, ArrowLeftRight, Check, X, MapPin, Calendar } from "lucide-react";

// content_merge_candidates / content_merges and the merge RPCs are added in
// migrations 20260612000009/010 and are not in the generated Supabase types,
// so reads/writes go through `as never` casts (WEB-AUTO-005).

interface MergeCandidate {
  id: string;
  content_type: "event" | "restaurant";
  a_id: string;
  b_id: string;
  suggested_survivor: string;
  name_sim: number;
  distance_m: number | null;
  reason: string | null;
}

interface SideRow {
  id: string;
  title: string;
  subtitle: string | null;
  detail: string | null;
  image_url: string | null;
}

interface CandidateView extends MergeCandidate {
  a: SideRow | null;
  b: SideRow | null;
}

function eventToSide(r: Record<string, unknown>): SideRow {
  return {
    id: r.id as string,
    title: (r.title as string) ?? "(untitled event)",
    subtitle: (r.date as string) ? new Date(r.date as string).toLocaleDateString() : null,
    detail: ((r.venue as string) || (r.location as string)) ?? null,
    image_url: (r.image_url as string) ?? null,
  };
}

function restaurantToSide(r: Record<string, unknown>): SideRow {
  return {
    id: r.id as string,
    title: (r.name as string) ?? "(unnamed restaurant)",
    subtitle: (r.cuisine as string) ?? null,
    detail: (r.location as string) ?? null,
    image_url: (r.image_url as string) ?? null,
  };
}

export default function MergeReviewPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // Per-candidate override of which side survives (defaults to suggested_survivor).
  const [survivorOverride, setSurvivorOverride] = useState<Record<string, string>>({});

  const { data: candidates, isLoading, error, refetch } = useQuery({
    queryKey: ["merge-candidates"],
    queryFn: async (): Promise<CandidateView[]> => {
      const { data, error } = await supabase
        .from("content_merge_candidates" as never)
        .select("id, content_type, a_id, b_id, suggested_survivor, name_sim, distance_m, reason")
        .eq("status", "pending")
        .order("name_sim", { ascending: false })
        .limit(100);
      if (error) throw error;
      const rows = (data ?? []) as unknown as MergeCandidate[];
      if (rows.length === 0) return [];

      // Batch-fetch the referenced rows per type.
      const eventIds = new Set<string>();
      const restaurantIds = new Set<string>();
      for (const c of rows) {
        const set = c.content_type === "event" ? eventIds : restaurantIds;
        set.add(c.a_id);
        set.add(c.b_id);
      }

      const sideMap = new Map<string, SideRow>();
      if (eventIds.size > 0) {
        const { data: evs } = await supabase
          .from("events")
          .select("id, title, date, venue, location, image_url")
          .in("id", [...eventIds]);
        (evs ?? []).forEach((e) => sideMap.set(`event:${(e as { id: string }).id}`, eventToSide(e as Record<string, unknown>)));
      }
      if (restaurantIds.size > 0) {
        const { data: rs } = await supabase
          .from("restaurants")
          .select("id, name, cuisine, location, image_url")
          .in("id", [...restaurantIds]);
        (rs ?? []).forEach((r) => sideMap.set(`restaurant:${(r as { id: string }).id}`, restaurantToSide(r as Record<string, unknown>)));
      }

      return rows.map((c) => ({
        ...c,
        a: sideMap.get(`${c.content_type}:${c.a_id}`) ?? null,
        b: sideMap.get(`${c.content_type}:${c.b_id}`) ?? null,
      }));
    },
    refetchInterval: 60_000,
  });

  const runScan = async () => {
    setScanning(true);
    try {
      const { error } = await supabase.functions.invoke("dedupe-content", { body: { manual: true } });
      if (error) throw error;
      toast({ title: "Duplicate scan started", description: "Auto-merges apply immediately; new candidates appear shortly." });
      setTimeout(() => refetch(), 3000);
    } catch (e) {
      toast({ title: "Scan failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setScanning(false);
    }
  };

  const merge = async (c: CandidateView) => {
    const survivor = survivorOverride[c.id] ?? c.suggested_survivor;
    const loser = survivor === c.a_id ? c.b_id : c.a_id;
    setBusy(c.id);
    try {
      const { error } = await supabase.rpc("merge_duplicate_content" as never, {
        p_type: c.content_type,
        p_survivor: survivor,
        p_loser: loser,
        p_confidence: c.name_sim,
        p_reason: c.reason ?? "admin merge",
        p_auto: false,
      } as never);
      if (error) throw error;
      toast({ title: "Merged", description: "Duplicate folded in. Reversible for 30 days." });
      queryClient.invalidateQueries({ queryKey: ["merge-candidates"] });
    } catch (e) {
      toast({ title: "Merge failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const dismiss = async (c: CandidateView) => {
    setBusy(c.id);
    try {
      const { error } = await supabase.rpc("dismiss_merge_candidate" as never, { p_id: c.id } as never);
      if (error) throw error;
      toast({ title: "Dismissed", description: "Marked as not a duplicate." });
      queryClient.invalidateQueries({ queryKey: ["merge-candidates"] });
    } catch (e) {
      toast({ title: "Dismiss failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const toggleSurvivor = (c: CandidateView) => {
    const current = survivorOverride[c.id] ?? c.suggested_survivor;
    setSurvivorOverride((prev) => ({ ...prev, [c.id]: current === c.a_id ? c.b_id : c.a_id }));
  };

  return (
    <Card className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Duplicate review</h2>
          <p className="text-sm text-muted-foreground">
            Ambiguous pairs (70–90% match) the weekly scan couldn't auto-merge. Keep the richer row; the other is hidden, reversible for 30 days.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />Refresh
          </Button>
          <Button size="sm" onClick={runScan} disabled={scanning}>
            <Play className="h-4 w-4 mr-2" />{scanning ? "Scanning…" : "Run scan"}
          </Button>
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground py-8 text-center">Loading candidates…</p>}
      {error && (
        <p className="text-sm text-destructive py-8 text-center">
          Failed to load candidates. {error instanceof Error ? error.message : ""}
        </p>
      )}
      {!isLoading && !error && (candidates?.length ?? 0) === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No pending duplicates. The weekly scan auto-merges high-confidence matches and queues the rest here.
        </p>
      )}

      <div className="space-y-4">
        {(candidates ?? []).map((c) => {
          const survivor = survivorOverride[c.id] ?? c.suggested_survivor;
          return (
            <div key={c.id} className="rounded-lg border p-3">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <Badge variant="secondary" className="capitalize">{c.content_type}</Badge>
                <Badge className="bg-amber-500 hover:bg-amber-500">{Math.round(c.name_sim * 100)}% name match</Badge>
                {c.distance_m != null && (
                  <Badge variant="outline"><MapPin className="h-3 w-3 mr-1" />{Math.round(c.distance_m)}m apart</Badge>
                )}
                {c.reason && <span className="text-xs text-muted-foreground">{c.reason}</span>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {([c.a, c.b] as (SideRow | null)[]).map((side, i) => {
                  const id = i === 0 ? c.a_id : c.b_id;
                  const isSurvivor = id === survivor;
                  return (
                    <div
                      key={id}
                      className={`rounded-md border p-3 ${isSurvivor ? "border-green-500 ring-1 ring-green-500/40 bg-green-500/5" : "border-muted opacity-80"}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant={isSurvivor ? "default" : "outline"} className={isSurvivor ? "bg-green-600 hover:bg-green-600" : ""}>
                          {isSurvivor ? "Keep" : "Remove"}
                        </Badge>
                      </div>
                      {side ? (
                        <div className="flex gap-3">
                          {side.image_url ? (
                            <img src={side.image_url} alt="" className="h-16 w-16 rounded object-cover flex-shrink-0" loading="lazy" />
                          ) : (
                            <div className="h-16 w-16 rounded bg-muted flex-shrink-0" />
                          )}
                          <div className="min-w-0">
                            <div className="font-medium truncate">{side.title}</div>
                            {side.subtitle && (
                              <div className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                                <Calendar className="h-3 w-3" />{side.subtitle}
                              </div>
                            )}
                            {side.detail && (
                              <div className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                                <MapPin className="h-3 w-3" />{side.detail}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">Row not found (already merged or deleted).</p>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 mt-3">
                <Button size="sm" onClick={() => merge(c)} disabled={busy === c.id}>
                  <Check className="h-4 w-4 mr-1" />Merge
                </Button>
                <Button size="sm" variant="outline" onClick={() => toggleSurvivor(c)} disabled={busy === c.id}>
                  <ArrowLeftRight className="h-4 w-4 mr-1" />Swap which to keep
                </Button>
                <Button size="sm" variant="ghost" onClick={() => dismiss(c)} disabled={busy === c.id}>
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
