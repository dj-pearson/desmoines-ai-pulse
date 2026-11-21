import { useId, useState } from "react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  isRpcMissing,
  ownerRefusalMessage,
  useReportListingStatus,
  type OwnerListingStatus,
} from "@/hooks/useMyBusinessClaims";
import { handleError } from "@/lib/errorHandler";
import { BUSINESS_CONTACT_EMAIL, BUSINESS_CONTACT_HREF } from "@/lib/businessCopy";

export interface OwnerStatusReportProps {
  listingId: string;
  listingName: string;
  /** restaurants.business_status as loaded. */
  businessStatus: string | null;
  /** restaurants.status as loaded. */
  status: string | null;
}

const DONE: Record<OwnerListingStatus, (name: string) => string> = {
  temporarily_closed: (name) => `${name} now shows as temporarily closed.`,
  closed_permanently: (name) =>
    `Thanks. ${name} is out of our recommendations now, and our team will mark it closed once they've confirmed.`,
  reopened: (name) => `${name} shows as open again.`,
};

/**
 * Temporarily closed, closed for good, or open again, from the owner
 * (WEB-ADS-048, report_owner_listing_status). Closed for good asks once more
 * before it is sent, since it is the one report that takes the listing out of
 * recommendations on the owner's word alone.
 */
export function OwnerStatusReport({ listingId, listingName, businessStatus, status }: OwnerStatusReportProps) {
  const report = useReportListingStatus();
  const [confirmClosed, setConfirmClosed] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const noteId = useId();

  const closedForGood = (status ?? "").toLowerCase() === "closed";
  const temporarilyClosed = (businessStatus ?? "").toUpperCase() === "CLOSED_TEMPORARILY";

  const send = async (next: OwnerListingStatus) => {
    setError(null);
    try {
      await report.mutateAsync({ listingId, status: next, note: next === "closed_permanently" ? note : undefined });
      toast.success(DONE[next](listingName));
      if (next === "closed_permanently") setQueued(true);
      setConfirmClosed(false);
      setNote("");
    } catch (e) {
      if (isRpcMissing(e)) {
        setError("This can't be sent yet. Email us instead.");
        return;
      }
      handleError(e, { component: "OwnerStatusReport", action: `report ${next}` });
      const message = ownerRefusalMessage(e);
      setError(message ? `That didn't go through: ${message}.` : "That didn't go through. Try again.");
    }
  };

  return (
    <section aria-label={`Open or closed: ${listingName}`} className="space-y-3">
      <div>
        <h4 className="text-base font-semibold">Open or closed</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          {closedForGood
            ? "This listing is marked closed for good."
            : temporarilyClosed
              ? "This listing shows as temporarily closed."
              : "This listing shows as open."}
        </p>
      </div>

      {closedForGood ? (
        <p className="text-sm text-muted-foreground">
          If you've reopened, email{" "}
          <a href={BUSINESS_CONTACT_HREF} className="font-medium text-primary underline-offset-4 hover:underline">
            {BUSINESS_CONTACT_EMAIL}
          </a>{" "}
          and we'll put it back.
        </p>
      ) : queued ? (
        <p className="text-sm" role="status">
          Your closure report is with our team.
        </p>
      ) : confirmClosed ? (
        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-sm">
            {listingName} leaves our recommendations now, and our team marks it closed once they've confirmed. Opened
            again since? Use "We've reopened" and it comes straight back.
          </p>
          <Label htmlFor={noteId}>Anything we should know (optional)</Label>
          <Textarea id={noteId} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="destructive"
              className="min-h-11"
              disabled={report.isPending}
              onClick={() => void send("closed_permanently")}
            >
              Yes, we've closed for good
            </Button>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setConfirmClosed(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {temporarilyClosed ? (
            <Button
              type="button"
              className="min-h-11"
              disabled={report.isPending}
              onClick={() => void send("reopened")}
            >
              We've reopened
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={report.isPending}
              onClick={() => void send("temporarily_closed")}
            >
              We're temporarily closed
            </Button>
          )}
          <Button type="button" variant="outline" className="min-h-11" onClick={() => setConfirmClosed(true)}>
            We've closed for good
          </Button>
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
