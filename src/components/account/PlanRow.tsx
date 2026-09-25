import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  createEventSlugWithCentralTime,
  formatEventDateShort,
  formatEventTimeOnly,
} from "@/lib/timezone";
import type { PlanEvent, PlanReason } from "@/hooks/useMyPlans";

const REASON_LABEL: Record<PlanReason, string> = {
  going: "Going",
  interested: "Interested",
  saved: "Saved",
  reminder: "Reminder set",
};

const REMINDER_LABEL: Record<string, string> = {
  "1_day": "1 day before",
  "3_hours": "3 hours before",
  "1_hour": "1 hour before",
};

export interface PlanRowProps {
  event: PlanEvent;
  reasons: PlanReason[];
  /** Reminder types (`1_day`, `3_hours`, `1_hour`) to spell out. */
  reminderTypes?: string[];
  /**
   * Show the date as well as the time. The week view groups by day and shows
   * the time only; the /my-events lists are not grouped and need the date.
   */
  showDate?: boolean;
  className?: string;
}

/**
 * One event someone has a plan for, as a single link: time (or date and time),
 * title, venue, and why it is on their list. Used by the week view on
 * /dashboard and by every list on /my-events so the two read the same.
 */
export function PlanRow({ event, reasons, reminderTypes = [], showDate = false, className }: PlanRowProps) {
  const title = event.title || "Untitled event";
  const when = showDate ? formatEventDateShort(event) : formatEventTimeOnly(event) ?? "Time TBA";
  const place = event.venue || event.location;
  const reminderText = reminderTypes
    .map((type) => REMINDER_LABEL[type])
    .filter(Boolean)
    .join(", ");
  const subline = [showDate ? when : null, place].filter(Boolean).join(" \u00b7 ");

  return (
    <Link
      to={`/events/${createEventSlugWithCentralTime(event.title, event)}`}
      className={cn(
        "group flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {!showDate && (
        <span className="w-[4.5rem] shrink-0 text-sm tabular-nums text-muted-foreground">{when}</span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-foreground">{title}</span>
        {subline && <span className="block truncate text-sm text-muted-foreground">{subline}</span>}
        <span className="mt-1 flex flex-wrap items-center gap-1">
          {reasons.map((reason) => (
            <Badge key={reason} variant={reason === "going" ? "default" : "secondary"} className="font-normal">
              {REASON_LABEL[reason]}
            </Badge>
          ))}
          {reminderText && <span className="text-xs text-muted-foreground">{reminderText}</span>}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
    </Link>
  );
}
