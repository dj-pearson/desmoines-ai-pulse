import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Play, Check, X, MessageSquare, Star } from "lucide-react";

// WEB-AUTO-009: review the small slice of user-generated content (reviews +
// contact/feedback) that auto-moderation rejected or flagged for a human. The
// clean majority is published instantly and never appears here. Approve/reject
// go through the moderate-content edge function so decisions are audit-logged.

type ContentType = "review" | "contact";

interface ModerationScores {
  toxicity?: number;
  spam?: number;
  off_topic?: number;
}

interface QueueItem {
  id: string;
  contentType: ContentType;
  status: string; // moderation_status: pending | flagged | rejected
  text: string;
  subtitle: string | null;
  scores: ModerationScores | null;
  reasons: string[];
  createdAt: string | null;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  rejected: { label: "Auto-rejected", className: "bg-red-600 hover:bg-red-600" },
  flagged: { label: "Flagged", className: "bg-amber-500 hover:bg-amber-500" },
  pending: { label: "Pending", className: "bg-slate-500 hover:bg-slate-500" },
};

function pct(n: number | undefined): number | null {
  if (typeof n !== "number" || !isFinite(n)) return null;
  return Math.round(n * 100);
}

export default function ModerationQueuePanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const { data: items, isLoading, error, refetch } = useQuery({
    queryKey: ["moderation-queue"],
    queryFn: async (): Promise<QueueItem[]> => {
      // Reviews (user_ratings)
      const { data: reviews, error: rErr } = await supabase
        .from("user_ratings")
        .select("id, review_text, moderation_status, moderation_scores, moderation_reasons, created_at")
        .neq("moderation_status", "approved")
        .not("review_text", "is", null)
        .order("created_at", { ascending: false })
        .limit(100);
      if (rErr) throw rErr;

      // Contact / feedback (contact_submissions) — not in generated types.
      const { data: contacts, error: cErr } = await supabase
        .from("contact_submissions" as never)
        .select("id, subject, message, inquiry_type, moderation_status, moderation_scores, moderation_reasons, created_at")
        .neq("moderation_status", "approved")
        .order("created_at", { ascending: false })
        .limit(100);
      if (cErr) throw cErr;

      const reviewItems: QueueItem[] = (reviews ?? []).map((r) => {
        const row = r as Record<string, unknown>;
        return {
          id: row.id as string,
          contentType: "review",
          status: (row.moderation_status as string) ?? "flagged",
          text: (row.review_text as string) ?? "",
          subtitle: "User review",
          scores: (row.moderation_scores as ModerationScores) ?? null,
          reasons: (row.moderation_reasons as string[]) ?? [],
          createdAt: (row.created_at as string) ?? null,
        };
      });

      const contactItems: QueueItem[] = ((contacts ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
        id: row.id as string,
        contentType: "contact",
        status: (row.moderation_status as string) ?? "flagged",
        text: [row.subject, row.message].filter(Boolean).map(String).join(" — "),
        subtitle: (row.inquiry_type as string) ? `Contact · ${row.inquiry_type}` : "Contact",
        scores: (row.moderation_scores as ModerationScores) ?? null,
        reasons: (row.moderation_reasons as string[]) ?? [],
        createdAt: (row.created_at as string) ?? null,
      }));

      // Flagged first (needs a decision), then rejected/pending; newest within.
      const order: Record<string, number> = { flagged: 0, pending: 1, rejected: 2 };
      return [...reviewItems, ...contactItems].sort((a, b) => {
        const s = (order[a.status] ?? 3) - (order[b.status] ?? 3);
        if (s !== 0) return s;
        return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
      });
    },
    refetchInterval: 60_000,
  });

  const runSweep = async () => {
    setScanning(true);
    try {
      const { error } = await supabase.functions.invoke("moderate-content", {
        body: { action: "sweep", manual: true },
      });
      if (error) throw error;
      toast({ title: "Moderation sweep started", description: "Pending items are being re-scored." });
      setTimeout(() => refetch(), 3000);
    } catch (e) {
      toast({ title: "Sweep failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setScanning(false);
    }
  };

  const decide = async (item: QueueItem, decision: "approve" | "reject") => {
    setBusy(item.id);
    try {
      const { error } = await supabase.functions.invoke("moderate-content", {
        body: { action: "decision", contentType: item.contentType, id: item.id, decision },
      });
      if (error) throw error;
      toast({
        title: decision === "approve" ? "Published" : "Rejected",
        description: decision === "approve" ? "Content is now visible." : "Content stays hidden.",
      });
      queryClient.invalidateQueries({ queryKey: ["moderation-queue"] });
    } catch (e) {
      toast({ title: "Action failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Content moderation</h2>
          <p className="text-sm text-muted-foreground">
            Reviews and contact/feedback that auto-moderation rejected or flagged. The clean majority is published
            instantly and never shows here.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />Refresh
          </Button>
          <Button size="sm" onClick={runSweep} disabled={scanning}>
            <Play className="h-4 w-4 mr-2" />{scanning ? "Sweeping…" : "Run sweep"}
          </Button>
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground py-8 text-center">Loading queue…</p>}
      {error && (
        <p className="text-sm text-destructive py-8 text-center">
          Failed to load queue. {error instanceof Error ? error.message : ""}
        </p>
      )}
      {!isLoading && !error && (items?.length ?? 0) === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Nothing needs you. Auto-moderation is publishing clean content and would queue only genuine judgment calls.
        </p>
      )}

      <div className="space-y-4">
        {(items ?? []).map((item) => {
          const badge = STATUS_BADGE[item.status] ?? STATUS_BADGE.flagged;
          const tox = pct(item.scores?.toxicity);
          const spam = pct(item.scores?.spam);
          const off = pct(item.scores?.off_topic);
          return (
            <div key={`${item.contentType}:${item.id}`} className="rounded-lg border p-3">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Badge variant="secondary" className="capitalize">
                  {item.contentType === "review" ? (
                    <><Star className="h-3 w-3 mr-1" />Review</>
                  ) : (
                    <><MessageSquare className="h-3 w-3 mr-1" />Contact</>
                  )}
                </Badge>
                <Badge className={badge.className}>{badge.label}</Badge>
                {tox != null && <Badge variant="outline">Toxicity {tox}%</Badge>}
                {spam != null && <Badge variant="outline">Spam {spam}%</Badge>}
                {off != null && off >= 40 && <Badge variant="outline">Off-topic {off}%</Badge>}
                {item.subtitle && <span className="text-xs text-muted-foreground">{item.subtitle}</span>}
              </div>

              <p className="text-sm whitespace-pre-wrap break-words bg-muted/50 rounded p-2 mb-2">
                {item.text || <span className="italic text-muted-foreground">(no text)</span>}
              </p>

              {item.reasons.length > 0 && (
                <ul className="text-xs text-muted-foreground list-disc pl-5 mb-2">
                  {item.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}

              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => decide(item, "approve")} disabled={busy === item.id}>
                  <Check className="h-4 w-4 mr-1" />Approve
                </Button>
                <Button size="sm" variant="ghost" onClick={() => decide(item, "reject")} disabled={busy === item.id}>
                  <X className="h-4 w-4 mr-1" />Reject
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
