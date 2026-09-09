/**
 * The single ICS / calendar-link implementation for events (WEB-FEAT-026).
 *
 * WHY THIS EXISTS RATHER THAN A THIRD COPY. The repo had two:
 *
 *   src/lib/calendar.ts          wired into EventDetails and Index, and WRONG
 *   src/hooks/use-calendar-export.ts   correct, and orphaned - zero call sites
 *
 * The wired one formatted dates with `format(date, "yyyyMMdd'T'HHmmss'Z'")`,
 * which renders LOCAL wall-clock time and then appends a literal `Z` asserting
 * UTC. Measured: an event at 7pm Central serialized as `20260908T190000Z`,
 * which is 2pm Central. Every calendar entry the site ever produced was five or
 * six hours early, depending on daylight saving. It also never escaped ICS text,
 * so any title containing a comma or semicolon - "Wine, Cheese & Jazz" - split
 * the SUMMARY field and corrupted the entry.
 *
 * The orphan had neither bug. So the fix was not to delete the unused file, it
 * was to delete the used one. The pure logic lives here so it can be tested
 * without mounting a hook, and `use-calendar-export` is now the toast-and-
 * download wrapper around it.
 *
 * ALL TIMES ARE UTC. ICS `DTSTART` with a trailing `Z` means UTC by
 * specification, and calendar clients convert to the reader's zone. Producing
 * that from a Date means using the UTC getters or `toISOString()`, never a
 * local-time formatter.
 */

export interface IcsEventInput {
  id: string;
  title: string;
  description?: string;
  /** Fallback start when `event_start_utc` is absent. */
  date: string;
  location?: string;
  venue?: string;
  slug?: string;
  event_start_utc?: string;
  event_end_utc?: string;
  /**
   * True when the source published a date but no start time (WEB-BE-038, the
   * `time_tbd` column). The time component of `date` is then a placeholder -
   * SeatGeek's is 03:30 - and exporting it would drop a 3:30am entry into
   * someone's calendar. Such events are emitted as all-day instead.
   */
  allDay?: boolean;
}

/** Events with no published end time get this much duration. */
export const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;

/**
 * Format an instant as an ICS UTC timestamp.
 *
 * `toISOString()` is always UTC, which is the whole point - see the header.
 */
export function formatIcsDate(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

/**
 * Escape text for an iCalendar property value per RFC 5545 section 3.3.11.
 *
 * Backslash first, or it would double-escape the escapes added after it.
 */
export function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Format an instant as an ICS DATE value (no time), in Des Moines local time.
 *
 * All-day events are a calendar DATE, and the date that matters is the local
 * one. Formatting the UTC date instead would move a late-evening event to the
 * following day for every reader.
 */
export function formatIcsDateOnly(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(date)
    .replace(/-/g, '');
}

/** The day after an ICS DATE, which is what an all-day DTEND must carry. */
export function nextIcsDateOnly(yyyymmdd: string): string {
  const year = Number(yyyymmdd.slice(0, 4));
  const month = Number(yyyymmdd.slice(4, 6));
  const day = Number(yyyymmdd.slice(6, 8));
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10).replace(/-/g, '');
}

/** Strip HTML so a description does not carry markup into a calendar entry. */
function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '');
}

export function resolveStart(event: IcsEventInput): Date {
  return new Date(event.event_start_utc || event.date);
}

export function resolveEnd(event: IcsEventInput, start: Date): Date {
  if (event.event_end_utc) {
    const end = new Date(event.event_end_utc);
    // A published end before the start is worse than no end at all: calendar
    // clients render a negative-duration event unpredictably.
    if (!Number.isNaN(end.getTime()) && end.getTime() > start.getTime()) return end;
  }
  return new Date(start.getTime() + DEFAULT_DURATION_MS);
}

export function eventUrl(event: IcsEventInput): string {
  return `https://desmoinesinsider.com/events/${event.slug || event.id}`;
}

/** True when the event has a usable start. Callers should not offer export otherwise. */
export function hasUsableDate(event: IcsEventInput): boolean {
  return !Number.isNaN(resolveStart(event).getTime());
}

/**
 * Build the ICS document for one event.
 *
 * Returns null when the start date cannot be parsed, so a malformed row
 * produces no download rather than a file full of `Invalid Date`.
 */
export function buildEventIcs(event: IcsEventInput): string | null {
  const start = resolveStart(event);
  if (Number.isNaN(start.getTime())) return null;
  const end = resolveEnd(event, start);

  const description = event.description ? escapeIcsText(stripHtml(event.description)) : '';
  const location = event.venue || event.location || '';

  // DTEND on an all-day event is EXCLUSIVE, so a one-day event ends on the
  // following date. Getting this wrong shows a two-day block.
  const startDateOnly = formatIcsDateOnly(start);
  const timing = event.allDay
    ? [
        `DTSTART;VALUE=DATE:${startDateOnly}`,
        `DTEND;VALUE=DATE:${nextIcsDateOnly(startDateOnly)}`,
      ]
    : [`DTSTART:${formatIcsDate(start)}`, `DTEND:${formatIcsDate(end)}`];

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Des Moines Insider//Event Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Des Moines Events',
    'X-WR-TIMEZONE:America/Chicago',
    'BEGIN:VEVENT',
    `UID:${event.id}@desmoinesinsider.com`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    ...timing,
    `SUMMARY:${escapeIcsText(event.title)}`,
    description ? `DESCRIPTION:${description}` : '',
    location ? `LOCATION:${escapeIcsText(location)}` : '',
    `URL:${eventUrl(event)}`,
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    'DESCRIPTION:Event reminder',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
}

/** Google Calendar "add event" link. Returns null when the date is unusable. */
export function googleCalendarUrl(event: IcsEventInput): string | null {
  const start = resolveStart(event);
  if (Number.isNaN(start.getTime())) return null;
  const end = resolveEnd(event, start);

  // URLSearchParams handles the escaping here; ICS escaping would be wrong in
  // a URL and is deliberately not applied.
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    // Google uses bare YYYYMMDD for all-day, with the same exclusive end.
    dates: event.allDay
      ? `${formatIcsDateOnly(start)}/${nextIcsDateOnly(formatIcsDateOnly(start))}`
      : `${formatIcsDate(start)}/${formatIcsDate(end)}`,
    details: event.description ? stripHtml(event.description) : '',
    location: event.venue || event.location || '',
    sf: 'true',
    output: 'xml',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Outlook Web "compose event" link. Returns null when the date is unusable. */
export function outlookCalendarUrl(event: IcsEventInput): string | null {
  const start = resolveStart(event);
  if (Number.isNaN(start.getTime())) return null;
  const end = resolveEnd(event, start);

  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: event.title,
    startdt: start.toISOString(),
    enddt: end.toISOString(),
    body: event.description ? stripHtml(event.description) : '',
    location: event.venue || event.location || '',
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

/**
 * Adapt a database event row to the ICS input shape.
 *
 * Three mappings that every call site would otherwise repeat and one of them
 * would get wrong:
 *  - description comes from enhanced_description, falling back to the original
 *  - `date` may arrive as a Date from some code paths and a string from others
 *  - `time_tbd` becomes `allDay`, so a placeholder time is never exported
 */
export function toIcsEvent(row: {
  id: string;
  title: string;
  date: string | Date;
  location?: string;
  venue?: string;
  slug?: string;
  enhanced_description?: string;
  original_description?: string;
  description?: string;
  event_start_utc?: string;
  event_end_utc?: string;
  time_tbd?: boolean | null;
}): IcsEventInput {
  return {
    id: row.id,
    title: row.title,
    description:
      row.enhanced_description || row.original_description || row.description || undefined,
    date: row.date instanceof Date ? row.date.toISOString() : row.date,
    location: row.location,
    venue: row.venue,
    slug: row.slug,
    event_start_utc: row.event_start_utc,
    event_end_utc: row.event_end_utc,
    allDay: row.time_tbd === true,
  };
}
