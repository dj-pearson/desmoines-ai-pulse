// Which events the social posters may feature, and the date line their copy
// prompt gets. No remote imports, so socialEventPick.test.ts runs offline.
// WEB-FEAT-096.
//
// social-daily-poster and social-media-manager both read `date >= now()`, so a
// State Fair or festival weekend fell out of the daily post on its second day,
// and social-media-manager applied no unpublish switch at all, so a hidden,
// archived or merged-away event could be posted to a public account.

import {
  applyEventVisibility,
  upcomingOrRunningFilter,
  type VisibilityFilterBuilder,
} from "./eventWindow.ts";
import { centralWallClockFromUtc } from "./centralTime.ts";

/** The slice of the postgrest-js filter builder the posters use. */
export interface PostableFilterBuilder<Q> extends VisibilityFilterBuilder<Q> {
  or(filters: string): Q;
}

/**
 * Visible events that start at or after `now`, or are still running at `now`.
 * A row with no end_date matches only on its own start, so a one-night show
 * that began an hour ago stays off.
 */
export function applyPostableEventFilters<Q extends PostableFilterBuilder<Q>>(
  q: Q,
  now: Date = new Date(),
): Q {
  return applyEventVisibility(q).or(upcomingOrRunningFilter(now.toISOString()));
}

export interface PostableEvent {
  date?: string | null;
  end_date?: string | null;
}

function instant(v: string | null | undefined): number {
  const t = v ? Date.parse(v) : NaN;
  return Number.isNaN(t) ? NaN : t;
}

/** Started before `now` and its end_date is at or after `now`. */
export function isRunningAt(ev: PostableEvent, now: Date): boolean {
  const start = instant(ev.date);
  const end = instant(ev.end_date);
  return start < now.getTime() && end >= now.getTime();
}

/** Still worth posting at `now`: starts later, or is running. */
export function isPostableAt(ev: PostableEvent, now: Date): boolean {
  return instant(ev.date) > now.getTime() || isRunningAt(ev, now);
}

const START_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const DAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

/**
 * The "Date:" line for the copy prompt. A running event gets its Central end
 * day, not the start it already passed, or the model writes "this Thursday"
 * about a fair that opened Thursday and is posted on Saturday.
 */
export function socialEventDateLine(ev: PostableEvent, now: Date = new Date()): string {
  if (!ev.date || Number.isNaN(instant(ev.date))) return "";
  if (isRunningAt(ev, now)) {
    // Central calendar day of end_date, formatted at noon UTC of that day so
    // the formatter cannot shift it.
    const [y, m, d] = centralWallClockFromUtc(ev.end_date as string).slice(0, 10)
      .split("-").map(Number);
    const endDay = DAY_FORMAT.format(new Date(Date.UTC(y, m - 1, d, 12)));
    return `On now, running through ${endDay} (Central Time)`;
  }
  return `${START_FORMAT.format(new Date(ev.date))} (Central Time)`;
}
