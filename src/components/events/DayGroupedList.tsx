import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { centralDateOf } from "@/lib/timezone";
import { groupByCentralDay, type HubEvent } from "./eventsHubQuery";

/**
 * The hub list, read like a local calendar (docs/page-plans/events.md WP1
 * item 10, bet 3; events-pass2 WP1 items 6, 7, 14 and 17).
 *
 * With `grouped`, rows sit under sticky Central-day headers - "Tonight",
 * "Tomorrow", "Saturday, Sep 27" - so a reader scanning for Friday doesn't
 * have to read every card's date. Without it (any sort other than soonest
 * first, or near me, which is in distance order) the same rows render as one
 * grid, because day headers over a list sorted by title or distance would
 * repeat and say nothing.
 *
 * `pinned` rows (active sponsored placements) render first, above every day
 * header, so a paid placement stays first without being filed under a day it
 * isn't on.
 *
 * `hiddenIds` are the Tonight strip's rows. They are already on screen above,
 * so they are left out here and today's group ends with a line saying how
 * many went up there.
 */

export interface DayGroupedListProps {
  events: HubEvent[];
  /** Rendered first, outside any day group. */
  pinned?: HubEvent[];
  grouped: boolean;
  now: Date;
  /**
   * Relative day words ("Tonight", "Tomorrow"). False in the prerender, whose
   * HTML is frozen hours before anyone reads it.
   */
  relative?: boolean;
  /**
   * `headingLevel` is the card title's level: 4 under a day header (an h3),
   * 3 otherwise.
   */
  renderEvent: (event: HubEvent, index: number, options: { headingLevel: 3 | 4 }) => ReactNode;
  /** Full-width node after the Nth card overall (0-based), e.g. an ad slot. */
  insertAfter?: { index: number; node: ReactNode };
  /**
   * Tailwind `top-*` for the sticky headers. The default sits below the
   * 4rem site header and the events bar, whose height EventsStickyBar
   * publishes as --events-bar-h.
   */
  stickyTopClass?: string;
  /** Ids shown in the strip above; left out of the list. */
  hiddenIds?: ReadonlySet<string>;
  className?: string;
}

const GRID = "grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3";
const NO_IDS: ReadonlySet<string> = new Set();

function StripNote({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <p className="mt-3 text-sm text-muted-foreground">
      And {count} more today in the strip above.
    </p>
  );
}

export function DayGroupedList({
  events,
  pinned = [],
  grouped,
  now,
  relative = true,
  renderEvent,
  insertAfter,
  stickyTopClass = "top-[calc(4rem_+_var(--events-bar-h,0px))]",
  hiddenIds = NO_IDS,
  className,
}: DayGroupedListProps) {
  const shownPinned = pinned.filter((e) => !hiddenIds.has(e.id));
  const shownEvents = events.filter((e) => !hiddenIds.has(e.id));
  const hiddenCount = pinned.length + events.length - shownPinned.length - shownEvents.length;

  let running = 0;
  const renderRun = (rows: readonly HubEvent[], headingLevel: 3 | 4) =>
    rows.map((event) => {
      const index = running++;
      return (
        <Fragment key={event.id}>
          {renderEvent(event, index, { headingLevel })}
          {insertAfter && insertAfter.index === index && (
            <div className="col-span-full">{insertAfter.node}</div>
          )}
        </Fragment>
      );
    });

  const pinnedGrid =
    shownPinned.length > 0 ? <div className={GRID}>{renderRun(shownPinned, 3)}</div> : null;

  if (!grouped) {
    return (
      <div className={cn("space-y-5", className)}>
        <StripNote count={hiddenCount} />
        {pinnedGrid}
        {shownEvents.length > 0 && <div className={GRID}>{renderRun(shownEvents, 3)}</div>}
      </div>
    );
  }

  const today = centralDateOf(now);
  const groups = groupByCentralDay(shownEvents, now, relative);
  const todayIndex = groups.findIndex((g) => g.day === today);
  return (
    <div className={cn("space-y-8", className)}>
      {pinnedGrid}
      {todayIndex < 0 && <StripNote count={hiddenCount} />}
      {groups.map((group, index) => {
        // A day can appear twice when the rows aren't in date order; the
        // index keeps keys and ids unique either way.
        const key = `${group.day}-${index}`;
        const headingId = `events-day-${key}`;
        return (
          <section key={key} aria-labelledby={headingId}>
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
            <div className={GRID}>{renderRun(group.events, 4)}</div>
            {index === todayIndex && <StripNote count={hiddenCount} />}
          </section>
        );
      })}
    </div>
  );
}
