import { Link } from "react-router-dom";
import { addCentralDays, centralWeekday, type CentralDate } from "@/lib/timezone";
import { formatCentralDate } from "@/hooks/useEventLanding";
import { cn } from "@/lib/utils";

/**
 * The month as a Central calendar (events-pass2 WP3 item 14, bet 5).
 *
 * Seven columns, Monday first like the week groups below it, one cell per
 * Central day with how many events are listed that day. A day with events
 * links to the hub for that day (`/events?from=<day>&to=<day>`), where every
 * one of them is reachable; the page itself renders 36 cards at most. Past
 * days are muted, today is outlined. On a phone the grid folds into a
 * two-column list of days, and the empty lead-in cells and weekday header
 * drop out.
 *
 * Counts come from the light window rows, so they cover the whole month, not
 * the capped card list. A multi-day event is counted on the day it's listed.
 */
export interface MonthCalendarGridProps {
  /** First and last Central days of the month. */
  startDay: CentralDate;
  endDay: CentralDate;
  today: CentralDate;
  counts: ReadonlyMap<CentralDate, number>;
  /** Extra hub params each day link carries, e.g. `{ category: "Music" }`. */
  linkParams?: Record<string, string>;
  /** Accessible name for the grid, e.g. "September 2026 by day". */
  label: string;
  className?: string;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dayHref(day: CentralDate, extra: Record<string, string> | undefined): string {
  const params = new URLSearchParams({ from: day, to: day, ...(extra ?? {}) });
  return `/events?${params.toString()}`;
}

export function MonthCalendarGrid({
  startDay,
  endDay,
  today,
  counts,
  linkParams,
  label,
  className,
}: MonthCalendarGridProps) {
  const leadIn = (centralWeekday(startDay) + 6) % 7;
  const days: CentralDate[] = [];
  for (let day = startDay; day <= endDay; day = addCentralDays(day, 1)) days.push(day);

  return (
    <section aria-label={label} className={className}>
      <div aria-hidden="true" className="hidden sm:grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map((name) => (
          <div key={name} className="px-2 text-xs font-medium text-muted-foreground">
            {name}
          </div>
        ))}
      </div>
      <ol className="grid grid-cols-2 sm:grid-cols-7 gap-1">
        {Array.from({ length: leadIn }, (_, i) => (
          <li key={`lead-${i}`} aria-hidden="true" className="hidden sm:block" />
        ))}
        {days.map((day) => {
          const count = counts.get(day) ?? 0;
          const isPast = day < today;
          const isToday = day === today;
          const name = formatCentralDate(day, "EEEE, MMMM d");
          const countText = count === 1 ? "1 event" : `${count} events`;
          const cell = cn(
            "flex min-h-11 flex-row items-baseline justify-between gap-2 rounded-lg border px-2 py-1.5 text-sm sm:min-h-16 sm:flex-col sm:items-start sm:justify-start",
            isToday ? "border-2 border-primary" : "border-border",
            isPast && "text-muted-foreground bg-muted/40",
          );
          const body = (
            <>
              <span className={cn("font-medium", isToday && "text-primary")}>
                <span className="sm:hidden">{formatCentralDate(day, "EEE, MMM d")}</span>
                <span className="hidden sm:inline">{formatCentralDate(day, "d")}</span>
              </span>
              <span className={cn("text-xs", count === 0 ? "text-muted-foreground" : "font-semibold")}>
                {count === 0 ? "None" : countText}
              </span>
            </>
          );
          return (
            <li key={day} data-month-day={day} data-day-phase={isPast ? "past" : isToday ? "today" : "upcoming"}>
              {count > 0 ? (
                <Link
                  to={dayHref(day, linkParams)}
                  aria-label={`${name}: ${countText}${isToday ? ", today" : ""}`}
                  aria-current={isToday ? "date" : undefined}
                  className={cn(
                    cell,
                    "hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                >
                  {body}
                </Link>
              ) : (
                <div
                  className={cell}
                  aria-label={`${name}: no events listed`}
                  aria-current={isToday ? "date" : undefined}
                  role="group"
                >
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default MonthCalendarGrid;
