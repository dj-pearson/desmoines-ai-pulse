/**
 * Time chips on the Discover map (/map), as pure functions (explore-pass2 WP2
 * items 1-3). DiscoverMap.tsx calls these from its clock pass and from the
 * events request; nothing here touches React or the network, so the rules can
 * be pinned in a unit test at a fixed instant.
 *
 * Three rules the first pass got wrong:
 *
 * - A show with no end_date that started a few minutes ago is still on. The
 *   window used to drop it the minute it started, so at 7:10 PM the 7 PM show
 *   was gone from Tonight. The grace is the one /events uses
 *   (RECENT_START_GRACE_MS), imported rather than copied.
 * - An untimed row carries the 19:31:58 Central marker (NO_TIME_MARKER). It is
 *   a day, not a showtime: it belongs to its whole Central day and is labelled
 *   with the day only. It used to read "Starts 7:31 PM".
 * - A window that starts later (This weekend, seen on a Monday) has no grace:
 *   a Thursday-night show with no end is not a weekend event.
 */
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { notOverFilter, RECENT_START_GRACE_MS } from '@/components/events/eventsHubQuery';
import { CENTRAL_TIMEZONE, centralDateOf, centralWindow } from '@/lib/timezone';

export type When = 'now' | 'tonight' | 'weekend' | 'any';

/** "Now" reaches this far ahead, the same horizon as the events hub's tonight strip. */
export const NOW_AHEAD_MS = 3 * 60 * 60 * 1000;
/** Tonight's events start from 4 PM Central; the default flips to Tonight at the same hour. */
export const TONIGHT_EVENTS_FROM_HOUR = 16;

export interface EventWindow {
  /** Lower bound. Never earlier than now: a window that has begun starts at now. */
  from: number;
  to: number;
}

/** What the window and label read from a fetched event row. */
export interface MapEventTiming {
  startMs?: number;
  endMs?: number;
  /** False for the untimed marker (hasSpecificTime at fetch time). */
  timed: boolean;
}

/** An instant at a Central wall-clock hour on the Central day of `now`. */
export function centralTodayAt(now: number, hour: number): number {
  const day = centralDateOf(new Date(now));
  return fromZonedTime(`${day}T${String(hour).padStart(2, '0')}:00:00`, CENTRAL_TIMEZONE).getTime();
}

/** First and last instant of the Central day that holds `ms`. */
function centralDayBounds(ms: number): { start: number; end: number } {
  const day = centralDateOf(new Date(ms));
  const start = fromZonedTime(`${day}T00:00:00`, CENTRAL_TIMEZONE).getTime();
  // Next Central midnight, found from noon so a DST day (23 or 25 hours)
  // lands on the right date.
  const nextDay = centralDateOf(new Date(start + 36 * 60 * 60 * 1000));
  const end = fromZonedTime(`${nextDay}T00:00:00`, CENTRAL_TIMEZONE).getTime() - 1;
  return { start, end };
}

export function eventWindow(when: When, now: number): EventWindow | null {
  switch (when) {
    case 'now':
      return { from: now, to: now + NOW_AHEAD_MS };
    case 'tonight':
      return {
        from: Math.max(now, centralTodayAt(now, TONIGHT_EVENTS_FROM_HOUR)),
        to: new Date(centralWindow('today', new Date(now)).end).getTime(),
      };
    case 'weekend': {
      const w = centralWindow('this-weekend', new Date(now));
      // On Saturday the window is the rest of the weekend, not Friday's
      // finished events.
      return { from: Math.max(now, new Date(w.start).getTime()), to: new Date(w.end).getTime() };
    }
    default:
      return null;
  }
}

/**
 * Does the row belong under this chip? It does when it starts inside
 * [from, to]; when it started earlier and its end_date has not passed `from`;
 * or, with no end_date, when the window has begun and it started within the
 * grace. An untimed row spans its whole Central day.
 */
export function inEventWindow(row: MapEventTiming, w: EventWindow, now: number): boolean {
  const start = row.startMs;
  if (start === undefined || !Number.isFinite(start)) return false;
  const end = row.endMs !== undefined && Number.isFinite(row.endMs) ? row.endMs : undefined;

  if (!row.timed) {
    const day = centralDayBounds(start);
    const lastInstant = end !== undefined ? Math.max(end, day.end) : day.end;
    return day.start <= w.to && lastInstant >= w.from;
  }

  if (start >= w.from && start <= w.to) return true;
  if (start > w.to) return false;
  if (end !== undefined) return end >= w.from;
  // No end: only a window that has already begun keeps a recent start.
  return w.from <= now && start >= w.from - RECENT_START_GRACE_MS;
}

/** "7 PM", "7:30 PM". */
function clockLabel(ms: number): string {
  return formatInTimeZone(new Date(ms), CENTRAL_TIMEZONE, 'h:mm a').replace(':00 ', ' ');
}

/** "Today" or "Sat, Sep 27". */
function dayLabel(ms: number, now: number): string {
  if (centralDateOf(new Date(ms)) === centralDateOf(new Date(now))) return 'Today';
  return formatInTimeZone(new Date(ms), CENTRAL_TIMEZONE, 'EEE, MMM d');
}

/** The line on a list row, popup and marker title. */
export function eventStatusLabel(row: MapEventTiming, now: number): string | undefined {
  const start = row.startMs;
  if (start === undefined || !Number.isFinite(start)) return undefined;
  const end = row.endMs;
  const hasEnd = end !== undefined && Number.isFinite(end);

  if (!row.timed) {
    // A multi-day run still going reads as such; otherwise the day, and no
    // clock time nobody published.
    if (hasEnd && centralDayBounds(start).end < now && (end as number) >= now) return 'Happening now';
    return dayLabel(start, now);
  }

  if (start < now && hasEnd && (end as number) >= now) return 'Happening now';
  const sameDay = centralDateOf(new Date(start)) === centralDateOf(new Date(now));
  if (sameDay) return start < now ? `Started ${clockLabel(start)}` : `Starts ${clockLabel(start)}`;
  return `${dayLabel(start, now)}, ${clockLabel(start)}`;
}

/**
 * The `or=` lower bound for the events request. Any time and a window that has
 * begun use /events' "not over" rule at the window's start (a recent start with
 * no end, a run still going, today's untimed marker). A window that starts
 * later (This weekend, from a weekday) asks for exactly its start.
 */
export function eventLowerBoundFilter(when: When, at: number): string {
  const w = eventWindow(when, at);
  if (!w || w.from <= at) return notOverFilter(new Date(w ? w.from : at));
  const from = new Date(w.from).toISOString();
  return `date.gte.${from},end_date.gte.${from}`;
}
