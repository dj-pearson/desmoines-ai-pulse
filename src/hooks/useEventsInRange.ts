import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { EVENT_LIST_COLUMNS } from "@/lib/listColumns";
import { queryKeys, CACHE_TIERS } from "@/lib/queryKeys";
import { applyEventVisibility } from "@/lib/eventQuery";
import { addCentralDays, centralDateOf, centralWindow, type CentralDate, type CentralWindow } from "@/lib/timezone";
import { isDateOnly, parseDateOnly } from "@/lib/dateOnly";
import { landingEndDay, type LandingEvent } from "@/hooks/useEventLanding";

/** Rows that START inside the window. A long window shows the first 100 and says where it stops. */
export const EVENTS_IN_RANGE_LIMIT = 100;

/**
 * Rows that started before the window and are still running when it opens.
 * Fetched separately so a dozen season-long exhibits can't use up the
 * in-window limit (plan-stay-pass2 WP1 item 2).
 */
export const ONGOING_IN_RANGE_LIMIT = 20;

export interface EventDayGroup {
  /** Central calendar date, yyyy-MM-dd. */
  day: CentralDate;
  events: LandingEvent[];
}

export interface EventsInRangeData {
  /** Starts in the window first (by start), then the ongoing rows. */
  events: LandingEvent[];
  /**
   * The last Central day the in-window query reached when it hit its limit,
   * or null when every in-window row was loaded. Days after it are unknown,
   * not empty.
   */
  truncatedAfter: CentralDate | null;
}

/** The truncation point for a limit-sized, date-ordered page of in-window rows. */
export function truncationDay(inWindow: readonly LandingEvent[], limit: number): CentralDate | null {
  if (inWindow.length < limit) return null;
  const last = inWindow[inWindow.length - 1];
  return last?.date ? centralDateOf(last.date) : null;
}

/**
 * Events on the Central days `from` through `to`, both inclusive, grouped by
 * Central day. Same visibility predicate and column set as the event
 * landings, so a card here never dead-ends on a hidden or merged row.
 * Disabled until both dates are real yyyy-MM-dd strings.
 *
 * Two requests in one query: rows starting in the window (ordered by start,
 * capped at EVENTS_IN_RANGE_LIMIT) and rows that started earlier and are
 * still running (ordered by end, capped at ONGOING_IN_RANGE_LIMIT).
 */
export function useEventsInRange(from: string | null, to: string | null) {
  const valid = isDateOnly(from) && isDateOnly(to);
  const window: CentralWindow | null = useMemo(
    () => (valid ? centralWindow({ kind: "range", from: from!, to: to! }) : null),
    [valid, from, to],
  );

  const query = useQuery({
    queryKey: queryKeys.events.list({
      landing: "trip-window",
      from: window?.start ?? null,
      to: window?.end ?? null,
      limit: EVENTS_IN_RANGE_LIMIT,
      ongoing: ONGOING_IN_RANGE_LIMIT,
    }),
    queryFn: async (): Promise<EventsInRangeData> => {
      if (!window) return { events: [], truncatedAfter: null };
      const [inWindow, ongoing] = await Promise.all([
        applyEventVisibility(supabase.from("events").select(EVENT_LIST_COLUMNS))
          .gte("date", window.start)
          .lte("date", window.end)
          .order("date", { ascending: true })
          .limit(EVENTS_IN_RANGE_LIMIT),
        applyEventVisibility(supabase.from("events").select(EVENT_LIST_COLUMNS))
          .lt("date", window.start)
          .gte("end_date", window.start)
          .order("end_date", { ascending: true })
          .limit(ONGOING_IN_RANGE_LIMIT),
      ]);
      if (inWindow.error) throw inWindow.error;
      if (ongoing.error) throw ongoing.error;
      const starts = (inWindow.data ?? []) as unknown as LandingEvent[];
      const startIds = new Set(starts.map((e) => e.id));
      const running = ((ongoing.data ?? []) as unknown as LandingEvent[]).filter((e) => !startIds.has(e.id));
      return {
        events: [...starts, ...running],
        truncatedAfter: truncationDay(starts, EVENTS_IN_RANGE_LIMIT),
      };
    },
    enabled: !!window,
    ...CACHE_TIERS.standard,
  });

  const events = query.data?.events;
  const days = useMemo(
    () => (window ? groupByCentralDay(events ?? [], window) : []),
    [events, window],
  );

  return {
    ...query,
    data: events,
    truncatedAfter: query.data?.truncatedAfter ?? null,
    window,
    days,
  };
}

/**
 * One group per Central day in the window, in order, including days with no
 * events. A row with an end_date is filed under every day it runs, from
 * max(start, window start) to min(end, window end): a Fri-Sun festival is on
 * Friday, Saturday and Sunday. Within a day, the day's own starts come first
 * in start order, then the runs carried in from an earlier day. Rows outside
 * the window are dropped rather than filed under the wrong day.
 */
export function groupByCentralDay(events: LandingEvent[], window: CentralWindow): EventDayGroup[] {
  const starts = new Map<CentralDate, LandingEvent[]>();
  const carried = new Map<CentralDate, LandingEvent[]>();
  let day = window.startDay;
  // Bounded: a window is at most a few weeks, but never loop forever on bad input.
  for (let i = 0; i < 400 && day <= window.endDay; i++) {
    starts.set(day, []);
    carried.set(day, []);
    day = addCentralDays(day, 1);
  }
  const seen = new Set<string>();
  for (const event of events) {
    if (!event.date || seen.has(event.id)) continue;
    seen.add(event.id);
    const startDay = centralDateOf(event.date);
    const endDay = landingEndDay(event);
    const first = startDay < window.startDay ? window.startDay : startDay;
    const last = endDay && endDay > startDay ? (endDay > window.endDay ? window.endDay : endDay) : startDay;
    if (first > window.endDay || last < window.startDay) continue;
    let d = first;
    for (let i = 0; i < 400 && d <= last; i++) {
      (d === startDay ? starts : carried).get(d)?.push(event);
      d = addCentralDays(d, 1);
    }
  }
  return [...starts.entries()].map(([d, list]) => ({ day: d, events: [...list, ...(carried.get(d) ?? [])] }));
}

/**
 * "Ongoing, through Oct 11" for a row listed on a day after the one it
 * started on, where its own start time would be a stale clock reading
 * ("10:00 AM" from an exhibit that opened in March). Null on its start day.
 */
export function ongoingLabel(event: Pick<LandingEvent, "date" | "end_date">, day: CentralDate): string | null {
  if (!event.date) return null;
  if (centralDateOf(event.date) >= day) return null;
  const endDay = landingEndDay(event as LandingEvent);
  return endDay ? `Ongoing, through ${format(parseDateOnly(endDay), "MMM d")}` : "Ongoing";
}
