/**
 * The day an organizer picked on the event submission form, as the value
 * stored in user_submitted_events.date (WEB-FEAT-083).
 *
 * The form used to send `selectedDate.toISOString()`: the picked day at the
 * browser's local midnight. publish_submission reads the Central calendar day
 * of that instant, and a browser east of Central has its midnight on the
 * Central day before (Eastern midnight is 23:00 Central), so an organizer in
 * Chicago's east, on the East Coast or abroad had the event published a day
 * early.
 *
 * Noon UTC of the picked calendar day is the same calendar day in every zone
 * from UTC-11 to UTC+11, so it reads back as the picked day in Central (06:00
 * or 07:00), in the triage function's past-date check, and in any browser that
 * reopens the submission with `new Date(value)` to edit it.
 */
export function pickedDayToSubmissionDate(day: Date): string {
  const y = day.getFullYear();
  const m = String(day.getMonth() + 1).padStart(2, "0");
  const d = String(day.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}T12:00:00.000Z`;
}
