/**
 * WEB-FEAT-092. Can a reminder ticked now still be sent?
 *
 * send-event-reminders runs at minute 0 of every hour and asks
 * get_pending_reminders (migration 20261115000103) for the rows whose event
 * start is inside the window for their type:
 *
 *   1_day    23h    - 25h
 *   3_hours  2h30m  - 3h35m   (only for an event with an announced time)
 *   1_hour   30m    - 1h35m   (only for an event with an announced time)
 *
 * Every window is at least an hour wide, so a reminder fires on some run as
 * long as the start is still at least the window's lower bound away from the
 * NEXT run. Measuring from "now" instead would offer a 3-hour reminder at
 * 4:10 PM for a 6:45 PM show: 2h35m away now, but 1h45m away at the 5:00 run,
 * and the 4:00 run has already gone.
 *
 * Keep these numbers in step with get_pending_reminders.
 */
import type { ReminderType } from "@/hooks/useEventReminders";
import { hasStatedStartTime, type EventTimeFields } from "@/lib/eventTime";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/** Lower bound of each type's window in get_pending_reminders. */
export const REMINDER_MIN_LEAD_MS: Record<ReminderType, number> = {
  "1_day": 23 * HOUR,
  "3_hours": 2 * HOUR + 30 * MINUTE,
  "1_hour": 30 * MINUTE,
};

export type ReminderUnavailableReason = "too_late" | "no_start_time";

export interface ReminderAvailability {
  available: boolean;
  reason: ReminderUnavailableReason | null;
}

/** The next top-of-the-hour cron run at or after `now`. */
export function nextReminderRun(now: Date): number {
  return Math.ceil(now.getTime() / HOUR) * HOUR;
}

export function reminderAvailability(
  type: ReminderType,
  event: EventTimeFields,
  now: Date,
): ReminderAvailability {
  const startIso = event.event_start_utc || event.date || null;
  // Without a start we cannot judge; leave the option as it was.
  if (!startIso) return { available: true, reason: null };
  const start = new Date(startIso).getTime();
  if (Number.isNaN(start)) return { available: true, reason: null };

  if (type !== "1_day" && !hasStatedStartTime(event)) {
    return { available: false, reason: "no_start_time" };
  }
  if (start - nextReminderRun(now) < REMINDER_MIN_LEAD_MS[type]) {
    return { available: false, reason: "too_late" };
  }
  return { available: true, reason: null };
}
