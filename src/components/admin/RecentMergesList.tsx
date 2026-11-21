import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Undo2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  RECENT_MERGES_KEY,
  UNDO_SCOPE,
  errorText,
  unmergeContent,
  useRecentMerges,
  type RecentMerge,
} from "@/hooks/useContentMerges";
import { handleError } from "@/lib/errorHandler";

function summary(m: RecentMerge): string {
  const parts: string[] = [];
  const filled = Object.keys(m.filled_columns ?? {});
  if (filled.length > 0) parts.push(`copied ${filled.join(", ")}`);
  const claims = m.moved_claims?.length ?? 0;
  if (claims > 0) parts.push(`moved ${claims} owner claim${claims === 1 ? "" : "s"}`);
  const left = m.repointed?.["business_claims.left_on_loser"] ?? 0;
  if (left > 0) parts.push(`${left} claim${left === 1 ? "" : "s"} left on the hidden listing for review`);
  return parts.join("; ");
}

export function RecentMergesList() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useRecentMerges();
  const [busy, setBusy] = useState<string | null>(null);

  const undo = async (m: RecentMerge) => {
    setBusy(m.id);
    try {
      await unmergeContent(m.id);
      toast({ title: "Merge undone", description: `${m.loserName} is visible again.` });
      await queryClient.invalidateQueries({ queryKey: RECENT_MERGES_KEY });
      await queryClient.invalidateQueries({ queryKey: ["merge-review-queue"] });
    } catch (e) {
      handleError(e, { component: "RecentMergesList", action: "unmerge" });
      toast({ title: "Undo failed", description: errorText(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const merges = data ?? [];

  return (
    <section aria-labelledby="recent-merges-heading" className="mt-8">
      <h3 id="recent-merges-heading" className="text-base font-semibold">Recent merges</h3>
      <p className="text-sm text-muted-foreground mb-3 max-w-prose">{UNDO_SCOPE}</p>

      {isLoading && <p className="text-sm text-muted-foreground">Loading recent merges...</p>}
      {error && (
        <p className="text-sm text-destructive">Could not load recent merges. {errorText(error)}</p>
      )}
      {!isLoading && !error && merges.length === 0 && (
        <p className="text-sm text-muted-foreground">No merges in the last 30 days.</p>
      )}

      {merges.length > 0 && (
      <ul className="divide-y rounded-lg border">
        {merges.map((m) => {
          const detail = summary(m);
          return (
            <li key={m.id} className="p-3 flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="capitalize">{m.content_type}</Badge>
                  <span className="font-medium">{m.loserName}</span>
                  <span className="text-sm text-muted-foreground">merged into</span>
                  <span className="font-medium">{m.survivorName}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {new Date(m.created_at).toLocaleString()} by {m.decided_by}
                  {detail ? ` - ${detail}` : ""}
                </div>
              </div>
              {m.reversed ? (
                <Badge variant="secondary">Undone</Badge>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy === m.id}
                  onClick={() => undo(m)}
                  aria-label={`Undo merge of ${m.loserName} into ${m.survivorName}`}
                >
                  <Undo2 className="h-4 w-4 mr-1" />
                  {busy === m.id ? "Undoing..." : "Undo"}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      )}
    </section>
  );
}
