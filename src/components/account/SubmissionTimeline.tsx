import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildSubmissionTimeline, type TimelineTone } from "@/lib/submissionActions";
import type { UserSubmittedEvent } from "@/hooks/useUserSubmittedEvents";

export interface SubmissionTimelineProps {
  submission: UserSubmittedEvent;
  className?: string;
}

const DOT: Record<TimelineTone, string> = {
  done: "bg-primary",
  current: "bg-background ring-2 ring-inset ring-muted-foreground",
  problem: "bg-destructive",
};

/**
 * What happened to one submission and when, oldest first, from the row's own
 * stamps. The last step is where it stands now; a live listing links to it.
 */
export function SubmissionTimeline({ submission, className }: SubmissionTimelineProps) {
  const steps = buildSubmissionTimeline({
    status: submission.status,
    submitted_at: submission.submitted_at,
    triaged_at: submission.triaged_at,
    auto_decided: submission.auto_decided,
    admin_reviewed_at: submission.admin_reviewed_at,
    admin_notes: submission.admin_notes,
    live_event_id: submission.live_event_id,
    live_view_count: submission.live_view_count,
  });

  return (
    <ol className={cn("relative space-y-3 border-l border-border pl-5", className)} aria-label="Submission history">
      {steps.map((step, index) => (
        <li key={`${step.kind}-${index}`} className="relative">
          <span
            aria-hidden="true"
            className={cn("absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full", DOT[step.tone])}
          />
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className={cn("text-sm font-medium", step.tone === "problem" && "text-destructive")}>
              {step.label}
            </span>
            {step.when && (
              <span className="text-xs text-muted-foreground">
                {step.when} <abbr title="Central Time" className="no-underline">CT</abbr>
              </span>
            )}
          </div>
          {step.detail && (
            <p className="mt-0.5 max-w-prose whitespace-pre-line text-sm text-muted-foreground">{step.detail}</p>
          )}
          {step.kind === "live" && submission.live_event_id && (
            <Link
              to={`/events/${submission.live_event_id}`}
              className="mt-1 inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              View listing
            </Link>
          )}
        </li>
      ))}
    </ol>
  );
}
