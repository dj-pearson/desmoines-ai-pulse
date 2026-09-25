/**
 * Deal start/end times in the admin form, in Des Moines time both ways
 * (explore pass 2 WP6 item 1).
 *
 * DealManager used to fill its datetime-local inputs with
 * `new Date(iso).toISOString().slice(0, 16)`, which is UTC wall time, and
 * parse them back with `new Date(value)`, which reads the value as the
 * browser's local time. In Des Moines that moved start_date and end_date 5 or
 * 6 hours later on every save of an existing deal, even one nobody changed.
 *
 * Both directions now go through America/Chicago, whatever zone the admin's
 * browser is in, because the deal schedule itself (days_of_week, start_time,
 * end_time) is Des Moines wall time.
 */
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

export const DEAL_FORM_TIME_ZONE = 'America/Chicago';

const INPUT_FORMAT = "yyyy-MM-dd'T'HH:mm";
const INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** A stored timestamptz as a datetime-local value in Des Moines time. "" for null or garbage. */
export function toCentralInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return formatInTimeZone(d, DEAL_FORM_TIME_ZONE, INPUT_FORMAT);
}

/**
 * A datetime-local value, read as Des Moines wall time, as an ISO instant.
 * Null for an empty or malformed value.
 *
 * When `original` is the stored value the input was filled from and the
 * input still shows it, the original string comes back unchanged. The input
 * has minute precision, so re-deriving would drop seconds and rewrite the
 * offset format; returning the original means saving an untouched deal
 * writes the same bytes it read.
 */
export function fromCentralInput(value: string, original?: string | null): string | null {
  const v = value.trim();
  if (!INPUT_PATTERN.test(v)) return null;
  if (original && toCentralInput(original) === v) return original;
  const d = fromZonedTime(v, DEAL_FORM_TIME_ZONE);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** The current minute in Des Moines, for a new deal's default start. */
export function nowCentralInput(now: Date = new Date()): string {
  return formatInTimeZone(now, DEAL_FORM_TIME_ZONE, INPUT_FORMAT);
}
