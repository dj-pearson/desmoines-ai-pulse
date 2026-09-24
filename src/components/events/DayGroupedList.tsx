import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { groupByCentralDay, type HubEvent } from "./eventsHubQuery";

/**
 * The hub list, read like a local calendar (docs/page-plans/events.md WP1
 * item 10, bet 3).
 *
 * With `grouped`, rows sit under sticky Central-day headers - "Tonight",
 * "Tomorrow", "Saturday, Sep 27" - so a reader scanning for Friday doesn't
 * have to read every card's date. Without it (any sort other than soonest
 * first) the same rows render as one grid, because day headers over a list
 * sorted by title would be noise.
 *
 * `pinned` rows (active sponsored placements from page 1) render first, above
 * every day header, so a paid placement stays first without being filed under
 * a day it isn't on.
 */

export interface DayGroupedListProps {
  events: HubEvent[];
  /** Rendered first, outside any day group. */
  pinned?: HubEvent[];
  grouped: boolean;
  now: Date;
  renderEvent: (event: HubEvent, index: number) => ReactNode;
  /** Full-width node after the Nth card overall (0-based), e.g. an ad slot. */
  insertAfter?: { index: number; node: ReactNode };
  /** Tailwind `top-*` for the sticky headers, below whatever else is sticky. */
  stickyTopClass?: string;
  className?: string;
}

const GRID = "grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3";

export function DayGroupedList({
  events,
  pinned = [],
  grouped,
  now,
  renderEvent,
  insertAfter,
  stickyTopClass = "top-16",
  className,
}: DayGroupedListProps) {
  let running = 0;
  const renderRun = (rows: readonly HubEvent[]) =>
    rows.map((event) => {
      const index = running++;
      return (
        <Fragment key={event.id}>
          {renderEvent(event, index)}
          {insertAfter && insertAfter.index === index && (
            <div className="col-span-full">{insertAfter.node}</div>
          )}
        </Fragment>
      );
    });

  const pinnedGrid =
    pinned.length > 0 ? <div className={GRID}>{renderRun(pinned)}</div> : null;

  if (!grouped) {
    return (
      <div className={cn("space-y-5", className)}>
        {pinnedGrid}
        <div className={GRID}>{renderRun(events)}</div>
      </div>
    );
  }

  const groups = groupByCentralDay(events, now);
  return (
    <div className={cn("space-y-8", className)}>
      {pinnedGrid}
      {groups.map((group) => {
        const headingId = `events-day-${group.day}`;
        return (
          <section key={group.day} aria-labelledby={headingId}>
            <h3
              id={headingId}
              className={cn(
                "sticky z-20 -mx-4 mb-3 bg-background/95 px-4 py-2 text-base font-semibold md:text-lg text-foreground backdrop-blur supports-[backdrop-filter]:bg-background/85",
                stickyTopClass
              )}
            >
              {group.label}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                <span className="sr-only">, </span>
                {group.events.length}
                <span className="sr-only">{group.events.length === 1 ? " event" : " events"}</span>
              </span>
            </h3>
            <div className={GRID}>{renderRun(group.events)}</div>
          </section>
        );
      })}
    </div>
  );
}
