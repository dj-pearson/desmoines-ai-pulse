import { useMemo } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseDateOnly } from "@/lib/dateOnly";
import { eventHref } from "@/lib/dashboardItems";
import { downloadICS } from "@/lib/tripCalendar";
import { buildShortlistICS } from "@/lib/tripShortlist";
import type { EventDayGroup } from "@/hooks/useEventsInRange";
import type { LandingEvent } from "@/hooks/useEventLanding";

interface TripShortlistProps {
  /** Picked event ids, in the order they were picked. */
  picks: readonly string[];
  /** The window's loaded days, so picks list under the days they run. */
  days: readonly EventDayGroup[];
  /** Every event the window loaded. */
  events: readonly LandingEvent[];
  from: string;
  to: string;
  onRemove: (id: string) => void;
  onClear: () => void;
}

/**
 * The free trip calendar (plan-stay-pass2 WP1 item 6): the starred events by
 * day and one .ics download. Built from rows already on the page, so it adds
 * no request and needs no account.
 */
export function TripShortlist({ picks, days, events, from, to, onRemove, onClear }: TripShortlistProps) {
  const pickSet = useMemo(() => new Set(picks), [picks]);
  const picked = useMemo(() => events.filter((e) => pickSet.has(e.id)), [events, pickSet]);
  const byDay = useMemo(
    () =>
      days
        .map((g) => ({ day: g.day, events: g.events.filter((e) => pickSet.has(e.id)) }))
        .filter((g) => g.events.length > 0),
    [days, pickSet],
  );
  // Picks from another window, or rows past the loaded limit: kept in the
  // URL so changing dates back restores them, but not exported.
  const elsewhere = picks.length - picked.length;

  const handleDownload = () => {
    downloadICS(`des-moines-trip-${from}`, buildShortlistICS(picked, { from, to }));
  };

  return (
    <section aria-labelledby="trip-shortlist-heading" className="space-y-3 rounded-xl border p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="trip-shortlist-heading" className="text-xl font-semibold">
          Your trip calendar
        </h2>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {picked.length === 0
            ? "Nothing picked yet"
            : `${picked.length} event${picked.length === 1 ? "" : "s"} picked`}
        </p>
      </div>

      {picked.length === 0 ? (
        <p className="max-w-prose text-sm text-muted-foreground">
          Star events above to keep them here, then download one calendar file with all of them. The picks stay in
          this page's link, so you can bookmark it or send it to whoever you're travelling with.
        </p>
      ) : (
        <>
          <ol className="space-y-3">
            {byDay.map((group) => (
              <li key={group.day}>
                <h3 className="text-sm font-semibold">{format(parseDateOnly(group.day), "EEEE, MMMM d")}</h3>
                <ul className="mt-1 space-y-1">
                  {group.events.map((event) => (
                    <li key={event.id} className="flex items-center justify-between gap-3 text-sm">
                      <Link to={eventHref(event)} className="min-w-0 truncate hover:underline">
                        {event.title}
                      </Link>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="min-h-11 shrink-0"
                        onClick={() => onRemove(event.id)}
                        aria-label={`Remove ${event.title ?? "this event"} from your trip`}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" className="min-h-11 gap-2" onClick={handleDownload}>
              <CalendarPlus className="h-4 w-4" aria-hidden="true" />
              Add to calendar
            </Button>
            <Button type="button" variant="outline" className="min-h-11" onClick={onClear}>
              Clear picks
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            One .ics file, times in Des Moines (Central) time. Events without a set time are saved as all-day.
          </p>
        </>
      )}

      {elsewhere > 0 && (
        <p className="text-sm text-muted-foreground">
          {elsewhere} {picked.length > 0 ? "more " : ""}pick{elsewhere === 1 ? " isn't" : "s aren't"} in these dates.
          {picked.length === 0 && (
            <>
              {" "}
              <button type="button" onClick={onClear} className="min-h-11 font-medium text-primary hover:underline">
                Clear picks
              </button>
            </>
          )}
        </p>
      )}
    </section>
  );
}
