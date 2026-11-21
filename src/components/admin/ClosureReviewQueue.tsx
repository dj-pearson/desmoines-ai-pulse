import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  CLOSURE_REASON_LABEL,
  type ClosureReview,
  fetchOpenClosureReviews,
  googleMapsLink,
  resolveClosureReview,
} from "@/lib/closureReviews";
import { handleError } from "@/lib/errorHandler";
import { toast } from "@/lib/toast";
import { ExternalLink } from "lucide-react";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "never";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "unknown"
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" });
}

/**
 * WEB-FEAT-102. Every open closure finding, newest first: visitor reports,
 * Google 404s and failed place matches, with the evidence a decision needs
 * beside each. Approve closes the listing; Dismiss records why.
 */
export function ClosureReviewQueue() {
  const [rows, setRows] = useState<ClosureReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setRows(await fetchOpenClosureReviews());
    } catch (e) {
      // A failed read must not look like an empty queue.
      handleError(e, { component: "ClosureReviewQueue", action: "load" });
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(row: ClosureReview, decision: "approve" | "dismiss") {
    const note = notes[row.id] ?? "";
    if (decision === "dismiss" && !note.trim()) {
      toast.error("Say why you're dismissing it");
      return;
    }
    setBusyId(row.id);
    try {
      await resolveClosureReview(row.id, decision, note);
      toast.success(decision === "approve" ? "Listing closed" : "Finding dismissed");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That did not work");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Closure reviews</CardTitle>
        <CardDescription>
          Restaurants that may have closed. A report never changes a listing by itself; your decision does.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}
        {!loading && loadError && (
          <div role="alert" className="space-y-2">
            <p className="text-sm text-destructive">Could not load the queue: {loadError}</p>
            <Button size="sm" variant="outline" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        )}
        {!loading && !loadError && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">No open closure findings.</p>
        )}
        {!loading &&
          !loadError &&
          rows.map((row) => {
            const r = row.restaurant;
            const note = typeof row.details?.note === "string" ? row.details.note : null;
            return (
              <div key={row.id} className="space-y-2 rounded-xl border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{r?.name ?? "Unknown listing"}</span>
                  <Badge variant="secondary">{CLOSURE_REASON_LABEL[row.reason] ?? row.reason}</Badge>
                  <span className="text-xs text-muted-foreground">reported {formatDate(row.created_at)}</span>
                </div>
                {r && (
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="inline text-muted-foreground">Address: </dt>
                      <dd className="inline">{r.location || "none on file"}</dd>
                    </div>
                    <div>
                      <dt className="inline text-muted-foreground">Our status: </dt>
                      <dd className="inline">{r.status || "none"}</dd>
                    </div>
                    <div>
                      <dt className="inline text-muted-foreground">Google says: </dt>
                      <dd className="inline">{r.business_status || "no answer"}</dd>
                    </div>
                    <div>
                      <dt className="inline text-muted-foreground">Last Google check: </dt>
                      <dd className="inline">{formatDate(r.hours_checked_at)}</dd>
                    </div>
                  </dl>
                )}
                {note && <p className="text-sm">Visitor note: {note}</p>}
                {r && (
                  <div className="flex flex-wrap gap-3 text-sm">
                    <a className="inline-flex items-center gap-1 underline" href={googleMapsLink(r)} target="_blank" rel="noreferrer">
                      Google Maps <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                    <a className="underline" href={`/restaurants/${r.slug || r.id}`} target="_blank" rel="noreferrer">
                      Listing
                    </a>
                  </div>
                )}
                <Textarea
                  aria-label={`Note for ${r?.name ?? "this finding"}`}
                  placeholder="Note (required to dismiss)"
                  rows={2}
                  value={notes[row.id] ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [row.id]: e.target.value }))}
                />
                <div className="flex gap-2">
                  <Button size="sm" disabled={busyId === row.id} onClick={() => void decide(row, "approve")}>
                    Approve: close listing
                  </Button>
                  <Button size="sm" variant="outline" disabled={busyId === row.id} onClick={() => void decide(row, "dismiss")}>
                    Dismiss
                  </Button>
                </div>
              </div>
            );
          })}
      </CardContent>
    </Card>
  );
}
