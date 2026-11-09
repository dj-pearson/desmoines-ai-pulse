/**
 * What an event-reminder email says, kept apart from the sender so it can be
 * tested without SES or a database.
 *
 * Three things the inline version got wrong (WEB-FEAT-057):
 *
 *   1. The subject went through escapeHtml. A subject is plain text, so
 *      "Tacos & Tequila" arrived as "Reminder: Tacos &amp; Tequila starts
 *      tomorrow". Only the HTML body is escaped now, at the point it is built.
 *   2. The link was /events/<title-slug> with no date, the one slug shape the
 *      detail page has to guess at (the soonest same-title row). It now uses
 *      eventPath(), the same canonical <title>-<YYYY-MM-DD> the saved-search
 *      alerts send, falling back to /events/<id>.
 *   3. An event whose source gave no time carries the 19:31:58 ingest sentinel,
 *      and the email printed it: "When: Friday ... 7:31 PM CDT" and "starts in
 *      1 hour" for a time nobody announced. Such an event now shows its date
 *      only and is "today" or "tomorrow".
 */
import { centralWallClockFromUtc, CENTRAL_TZ } from "../_shared/centralTime.ts";
import { eventPath } from "../_shared/savedSearchMatch.ts";

/**
 * The Central wall-clock time ingest stamps on a day with no stated time.
 * Mirrors NO_TIME_MARKER in _shared/eventDateTime.ts, which is not imported
 * because it pulls date-fns from esm.sh; content.test.ts asserts the two match.
 */
export const NO_TIME_MARKER = "19:31:58";

export interface ReminderContentInput {
  event_id: string;
  event_title: string | null;
  event_date: string | null;
  event_start_utc: string | null;
  event_venue: string | null;
  event_location: string | null;
  reminder_type: string;
}

function startInstant(r: Pick<ReminderContentInput, "event_start_utc" | "event_date">): Date | null {
  const source = r.event_start_utc || r.event_date;
  if (!source) return null;
  const d = new Date(source);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** False when the start is the no-time sentinel, so the time is not printed. */
export function hasStatedTime(r: Pick<ReminderContentInput, "event_start_utc" | "event_date">): boolean {
  const d = startInstant(r);
  if (!d) return false;
  return centralWallClockFromUtc(d).slice(11) !== NO_TIME_MARKER;
}

/**
 * WEB-FEAT-058: whether this reminder is worth sending at all. A 3-hour or
 * 1-hour reminder is timed against the start, so for an event with no
 * announced time it fires against the 19:31:58 sentinel and says nothing the
 * 1-day one did not. get_pending_reminders skips those rows from migration
 * 20261108000040; this is the same rule on the sender, so it also holds
 * before that migration is applied. time_tbd is not in the RPC's return
 * shape, which is why only the marker is checked here.
 */
export function shouldSendReminder(
  r: Pick<ReminderContentInput, "reminder_type" | "event_start_utc" | "event_date">,
): boolean {
  if (r.reminder_type === "3_hours" || r.reminder_type === "1_hour") return hasStatedTime(r);
  return true;
}

/** "starts tomorrow", "starts in 3 hours"; "is today" when there is no time. */
export function timingPhrase(r: Pick<ReminderContentInput, "reminder_type" | "event_start_utc" | "event_date">): string {
  if (!hasStatedTime(r)) {
    // 1_day fires the evening before; 3_hours and 1_hour fire on the day.
    if (r.reminder_type === "1_day") return "is tomorrow";
    if (r.reminder_type === "3_hours" || r.reminder_type === "1_hour") return "is today";
    return "is coming up";
  }
  switch (r.reminder_type) {
    case "1_day":
      return "starts tomorrow";
    case "3_hours":
      return "starts in 3 hours";
    case "1_hour":
      return "starts in 1 hour";
    default:
      return "is coming up";
  }
}

/** Plain-text subject. Never HTML-escaped: mail clients show it literally. */
export function reminderSubject(r: ReminderContentInput): string {
  const title = (r.event_title ?? "").trim() || "Your event";
  return `Reminder: ${title} ${timingPhrase(r)}`;
}

/** The "When" line: date and time in Central, or the date alone. */
export function reminderWhen(r: ReminderContentInput): string {
  const d = startInstant(r);
  if (!d) return "Date to be announced";
  const options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: CENTRAL_TZ,
  };
  if (hasStatedTime(r)) {
    options.hour = "numeric";
    options.minute = "2-digit";
    options.timeZoneName = "short";
  }
  return d.toLocaleString("en-US", options);
}

/**
 * The "Where" line and the address under it. The address is shown only when
 * it adds something to the venue, and a row with neither gives null rather
 * than an empty "Where:".
 */
export function reminderWhere(r: ReminderContentInput): { place: string; address: string | null } | null {
  const venue = (r.event_venue ?? "").trim();
  const location = (r.event_location ?? "").trim();
  if (!venue && !location) return null;
  if (!venue) return { place: location, address: null };
  return { place: venue, address: location && location !== venue ? location : null };
}

/** Absolute link to the event's canonical detail page. */
export function reminderEventUrl(r: ReminderContentInput, siteBaseUrl: string): string {
  return `${siteBaseUrl.replace(/\/+$/, "")}${
    eventPath({
      id: r.event_id,
      title: r.event_title ?? "",
      date: r.event_date,
      event_start_utc: r.event_start_utc,
    })
  }`;
}
