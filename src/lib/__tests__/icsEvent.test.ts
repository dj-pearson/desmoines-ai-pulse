/**
 * Tests for ICS generation (WEB-FEAT-026).
 *
 * The first two describe blocks pin the two bugs that shipped in the
 * implementation this replaces: local wall-clock time labelled as UTC, and
 * unescaped ICS text. Both were live, and both are invisible in review because
 * the output looks like a plausible timestamp and a plausible title.
 */
import { describe, it, expect } from 'vitest';
import {
  buildEventIcs,
  formatIcsDateOnly,
  nextIcsDateOnly,
  escapeIcsText,
  formatIcsDate,
  googleCalendarUrl,
  hasUsableDate,
  outlookCalendarUrl,
  resolveEnd,
  resolveStart,
  DEFAULT_DURATION_MS,
} from '../icsEvent';

const EVENING_EVENT = {
  id: 'abc-123',
  title: 'Jazz in the Park',
  // 7pm Central on 2026-09-08, expressed as an offset so the test does not
  // depend on the runner's timezone.
  date: '2026-09-08T19:00:00-05:00',
};

describe('formatIcsDate (the timezone regression)', () => {
  it('emits the UTC instant, not local wall-clock time', () => {
    // The old implementation produced 20260908T190000Z for this instant, which
    // is 2pm Central: five hours early, every single time.
    expect(formatIcsDate(new Date('2026-09-08T19:00:00-05:00'))).toBe('20260909T000000Z');
  });

  it('round-trips a UTC input unchanged', () => {
    expect(formatIcsDate(new Date('2026-01-15T08:30:00Z'))).toBe('20260115T083000Z');
  });

  it('handles the standard-time offset too', () => {
    // January is CST (-06:00), so the offset differs from the September case.
    expect(formatIcsDate(new Date('2026-01-15T19:00:00-06:00'))).toBe('20260116T010000Z');
  });

  it('always ends in Z and carries no punctuation', () => {
    const formatted = formatIcsDate(new Date('2026-07-04T12:00:00Z'));
    expect(formatted).toMatch(/^\d{8}T\d{6}Z$/);
  });
});

describe('escapeIcsText (the field-corruption regression)', () => {
  it('escapes commas, which would otherwise split the field', () => {
    expect(escapeIcsText('Wine, Cheese & Jazz')).toBe('Wine\\, Cheese & Jazz');
  });

  it('escapes semicolons', () => {
    expect(escapeIcsText('Doors 6pm; music 8pm')).toBe('Doors 6pm\\; music 8pm');
  });

  it('escapes newlines', () => {
    expect(escapeIcsText('Line one\nLine two')).toBe('Line one\\nLine two');
    expect(escapeIcsText('Line one\r\nLine two')).toBe('Line one\\nLine two');
  });

  it('escapes backslashes first so escapes are not double-escaped', () => {
    expect(escapeIcsText('a\\b')).toBe('a\\\\b');
    // A backslash next to a comma must produce exactly one escape for each.
    expect(escapeIcsText('a\\,b')).toBe('a\\\\\\,b');
  });
});

describe('resolveStart / resolveEnd', () => {
  it('prefers event_start_utc over the loose date column', () => {
    const start = resolveStart({
      ...EVENING_EVENT,
      event_start_utc: '2026-09-09T01:00:00Z',
    });
    expect(start.toISOString()).toBe('2026-09-09T01:00:00.000Z');
  });

  it('defaults to a two-hour duration with no published end', () => {
    const start = resolveStart(EVENING_EVENT);
    const end = resolveEnd(EVENING_EVENT, start);
    expect(end.getTime() - start.getTime()).toBe(DEFAULT_DURATION_MS);
  });

  it('uses a published end when there is one', () => {
    const event = { ...EVENING_EVENT, event_end_utc: '2026-09-09T03:30:00Z' };
    const start = resolveStart(event);
    expect(resolveEnd(event, start).toISOString()).toBe('2026-09-09T03:30:00.000Z');
  });

  it('ignores an end that precedes the start', () => {
    // A negative-duration event renders unpredictably across clients, so the
    // default is safer than the published value.
    const event = { ...EVENING_EVENT, event_end_utc: '2026-09-01T00:00:00Z' };
    const start = resolveStart(event);
    expect(resolveEnd(event, start).getTime() - start.getTime()).toBe(DEFAULT_DURATION_MS);
  });

  it('ignores an unparseable end', () => {
    const event = { ...EVENING_EVENT, event_end_utc: 'not a date' };
    const start = resolveStart(event);
    expect(resolveEnd(event, start).getTime() - start.getTime()).toBe(DEFAULT_DURATION_MS);
  });
});

describe('buildEventIcs', () => {
  it('writes the correct UTC start and end', () => {
    const ics = buildEventIcs(EVENING_EVENT)!;
    expect(ics).toContain('DTSTART:20260909T000000Z');
    expect(ics).toContain('DTEND:20260909T020000Z');
  });

  it('escapes the summary', () => {
    const ics = buildEventIcs({ ...EVENING_EVENT, title: 'Wine, Cheese & Jazz' })!;
    expect(ics).toContain('SUMMARY:Wine\\, Cheese & Jazz');
  });

  it('strips HTML from the description', () => {
    const ics = buildEventIcs({
      ...EVENING_EVENT,
      description: '<p>Live <strong>music</strong></p>',
    })!;
    expect(ics).toContain('DESCRIPTION:Live music');
    expect(ics).not.toContain('<strong>');
  });

  it('uses CRLF line endings, as the spec requires', () => {
    const ics = buildEventIcs(EVENING_EVENT)!;
    expect(ics).toContain('\r\n');
    expect(ics.split('\r\n')[0]).toBe('BEGIN:VCALENDAR');
  });

  it('omits optional properties rather than emitting empty ones', () => {
    const ics = buildEventIcs(EVENING_EVENT)!;
    expect(ics).not.toContain('DESCRIPTION:\r\n');
    expect(ics).not.toContain('LOCATION:');
  });

  it('prefers venue over location', () => {
    const ics = buildEventIcs({
      ...EVENING_EVENT,
      venue: 'Water Works Park',
      location: 'Des Moines, IA',
    })!;
    expect(ics).toContain('LOCATION:Water Works Park');
  });

  it('opens and closes every block it opens', () => {
    const ics = buildEventIcs(EVENING_EVENT)!;
    for (const block of ['VCALENDAR', 'VEVENT', 'VALARM']) {
      expect(ics).toContain(`BEGIN:${block}`);
      expect(ics).toContain(`END:${block}`);
    }
  });

  it('returns null for an unparseable date rather than an Invalid Date file', () => {
    expect(buildEventIcs({ id: 'x', title: 'Broken', date: 'not a date' })).toBeNull();
    expect(hasUsableDate({ id: 'x', title: 'Broken', date: 'not a date' })).toBe(false);
    expect(hasUsableDate(EVENING_EVENT)).toBe(true);
  });
});

describe('calendar links', () => {
  it('sends Google the UTC range', () => {
    const url = googleCalendarUrl(EVENING_EVENT)!;
    expect(url).toContain('dates=20260909T000000Z%2F20260909T020000Z');
  });

  it('sends Outlook ISO instants', () => {
    const url = outlookCalendarUrl(EVENING_EVENT)!;
    expect(url).toContain(encodeURIComponent('2026-09-09T00:00:00.000Z'));
  });

  it('returns null for an unusable date', () => {
    const broken = { id: 'x', title: 'Broken', date: 'nope' };
    expect(googleCalendarUrl(broken)).toBeNull();
    expect(outlookCalendarUrl(broken)).toBeNull();
  });

  it('does not ICS-escape URL parameters', () => {
    // ICS escaping inside a query string would put literal backslashes into
    // the calendar entry's title.
    const url = googleCalendarUrl({ ...EVENING_EVENT, title: 'Wine, Cheese' })!;
    expect(url).not.toContain('%5C');
  });
});

describe('all-day events (time_tbd)', () => {
  // SeatGeek publishes 03:30 as its no-time placeholder. Exporting that would
  // put a 3:30am entry in the reader's calendar.
  const PLACEHOLDER = {
    id: 'tbd-1',
    title: 'Date announced, time to follow',
    date: '2026-09-08T03:30:00Z',
    allDay: true,
  };

  it('formats the DATE in Des Moines local time, not UTC', () => {
    // 2026-09-09T02:00Z is 21:00 on the 8th in Central. The local calendar
    // date is the 8th; using the UTC date would advertise the 9th.
    expect(formatIcsDateOnly(new Date('2026-09-09T02:00:00Z'))).toBe('20260908');
  });

  it('rolls the exclusive end to the next day', () => {
    expect(nextIcsDateOnly('20260908')).toBe('20260909');
  });

  it('rolls across a month boundary', () => {
    expect(nextIcsDateOnly('20260831')).toBe('20260901');
  });

  it('rolls across a year boundary', () => {
    expect(nextIcsDateOnly('20261231')).toBe('20270101');
  });

  it('emits DATE values rather than a placeholder time', () => {
    const ics = buildEventIcs(PLACEHOLDER)!;
    expect(ics).toContain('DTSTART;VALUE=DATE:20260907');
    expect(ics).toContain('DTEND;VALUE=DATE:20260908');
    expect(ics).not.toContain('T033000Z');
  });

  it('sends Google a bare date range for an all-day event', () => {
    const url = googleCalendarUrl(PLACEHOLDER)!;
    expect(url).toContain('dates=20260907%2F20260908');
  });

  it('still emits a timed event when allDay is not set', () => {
    const ics = buildEventIcs({ ...PLACEHOLDER, allDay: false })!;
    expect(ics).toContain('DTSTART:20260908T033000Z');
    expect(ics).not.toContain('VALUE=DATE');
  });
});
