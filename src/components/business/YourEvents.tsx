import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { useUserSubmittedEvents, type UserSubmittedEvent } from "@/hooks/useUserSubmittedEvents";
import { formatCampaignDate } from "@/lib/campaignDisplay";
import { SUBMISSION_REVIEW_COPY } from "@/lib/businessCopy";

/** Where a submission stands, in the Account timeline's words. */
function submissionStatus(row: UserSubmittedEvent): { label: string; problem: boolean } {
  if (row.live_event_id) return { label: "Live on the site", problem: false };
  switch (row.status) {
    case "approved":
      return { label: "Approved, not listed yet", problem: false };
    case "rejected":
      return { label: "Declined", problem: true };
    case "needs_revision":
      return { label: "Sent back for changes", problem: true };
    default:
      return { label: "Waiting for review", problem: false };
  }
}

/**
 * Your events: what you've submitted and where each one stands, with a link to
 * the live listing and "Promote this event" once it's published (business plan
 * WP3 item 3). Reads useUserSubmittedEvents as the Account plan ships it.
 */
export function YourEvents() {
  const submissions = useUserSubmittedEvents();
  const rows = submissions.data ?? [];

  return (
    <section aria-labelledby="your-events-heading" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="your-events-heading" className="text-xl font-semibold">
            Your events
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">{SUBMISSION_REVIEW_COPY}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild className="min-h-11">
            <Link to="/submit-event">Submit an event</Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/dashboard?tab=events">View my events</Link>
          </Button>
        </div>
      </div>

      {submissions.isLoading ? (
        <div className="space-y-3" role="status" aria-label="Loading your events">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      ) : submissions.isError ? (
        <ErrorState
          compact
          error={submissions.error}
          title="Your events didn't load"
          description="This is on our side. Try again in a moment."
          onRetry={() => submissions.refetch()}
        />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">You haven't submitted an event yet.</p>
      ) : (
        <ul className="divide-y">
          {rows.slice(0, 10).map((row) => {
            const status = submissionStatus(row);
            return (
              <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
                <div className="min-w-0 space-y-1">
                  <h3 className="text-base font-semibold">{row.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {row.date ? formatCampaignDate(row.date) : "No date"}
                    <span aria-hidden="true"> - </span>
                    <span className={status.problem ? "font-medium text-destructive" : "font-medium text-foreground"}>
                      {status.label}
                    </span>
                  </p>
                </div>
                {row.live_event_id && (
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" className="min-h-11">
                      <Link to={`/events/${row.live_event_id}`}>View listing</Link>
                    </Button>
                    <Button asChild className="min-h-11">
                      <Link to={`/advertise?listingType=event&listingId=${encodeURIComponent(row.live_event_id)}`}>
                        Promote this event
                      </Link>
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {rows.length > 10 && (
        <p className="text-sm text-muted-foreground">
          Showing your 10 most recent.{" "}
          <Link to="/dashboard?tab=events" className="font-medium text-primary underline-offset-4 hover:underline">
            See all {rows.length}
          </Link>
        </p>
      )}
    </section>
  );
}
