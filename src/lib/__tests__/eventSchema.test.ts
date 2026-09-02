import { describe, it, expect } from 'vitest';
import { buildEventJsonLd, buildEventItemList, eventEndIso, eventStartIso } from '@/lib/eventSchema';
import type { Event } from '@/lib/types';

/**
 * SEO-002 / SEO-007.
 *
 * Two live defects are pinned here, both measured on 2026-08-28:
 *
 *   1. /events shipped 30 Event nodes with NO endDate while /events/this-weekend
 *      and /events/today shipped theirs with it, because EventsPage.tsx carried
 *      a second copy of the builder that had never gained the field.
 *   2. A trivia night at Mickey's Irish Pub in WAUKEE shipped with
 *      `addressLocality: "Des Moines"` and Waukee's real geo coordinates,
 *      because the locality defaulted to the brand city.
 *
 * Each is asserted in both directions. A test that only proves the locality is
 * omitted when absent would still pass if it were omitted always, which would
 * lose a recommended field on every event that has one.
 */

const base: Event = {
  id: 'e1',
  title: "Trivia at Mickey's Irish Pub",
  date: '2026-09-04T00:00:00.000Z',
  location: "Mickey's Irish Pub",
  venue: "Mickey's Irish Pub",
  category: 'Trivia',
};

const ev = (over: Partial<Event> = {}): Event => ({ ...base, ...over });

describe('buildEventJsonLd — the fields Google\'s Events report asks for', () => {
  it('always emits endDate, the field /events was missing', () => {
    expect(buildEventJsonLd(ev())).toHaveProperty('endDate');
  });

  it('emits the required trio Google will not produce a rich result without', () => {
    const node = buildEventJsonLd(ev());
    expect(node.name).toBe("Trivia at Mickey's Irish Pub");
    expect(node.startDate).toBeTruthy();
    expect(node.location['@type']).toBe('Place');
  });

  it('emits eventStatus and eventAttendanceMode as absolute schema.org URLs', () => {
    const node = buildEventJsonLd(ev());
    expect(node.eventStatus).toBe('https://schema.org/EventScheduled');
    expect(node.eventAttendanceMode).toBe('https://schema.org/OfflineEventAttendanceMode');
  });

  it('prefers a real end_date over the estimate', () => {
    const real = '2026-09-04T23:30:00.000Z';
    expect(buildEventJsonLd(ev({ end_date: real })).endDate).toBe(real);
  });

  it('estimates endDate as start + 3h only when there is no real one', () => {
    const start = '2026-09-04T00:00:00.000Z';
    expect(eventEndIso(ev({ date: start }))).toBe('2026-09-04T03:00:00.000Z');
  });

  it('does not throw or emit Invalid Date on an unparseable date', () => {
    const node = buildEventJsonLd(ev({ date: 'not-a-date', event_start_utc: undefined }));
    expect(String(node.endDate)).not.toContain('Invalid');
  });
});

describe('buildEventJsonLd — addressLocality (SEO-007)', () => {
  it('uses the event city when it has one', () => {
    const node = buildEventJsonLd(ev({ city: 'Waukee' }));
    expect(node.location.address).toHaveProperty('addressLocality', 'Waukee');
  });

  it('OMITS addressLocality rather than defaulting to Des Moines', () => {
    // The regression. A wrong city is worse than a missing one, and the suburbs
    // are where this site should beat a downtown-focused competitor.
    const node = buildEventJsonLd(ev({ city: null }));
    expect(node.location.address).not.toHaveProperty('addressLocality');
  });

  it('treats a whitespace-only city as absent', () => {
    expect(buildEventJsonLd(ev({ city: '   ' })).location.address).not.toHaveProperty(
      'addressLocality',
    );
  });

  it('still emits addressRegion and addressCountry when the city is unknown', () => {
    // Counter-assertion: omitting the locality must not blank the whole address.
    const addr = buildEventJsonLd(ev({ city: null })).location.address;
    expect(addr).toHaveProperty('addressRegion');
    expect(addr).toHaveProperty('addressCountry');
  });
});

describe('buildEventJsonLd — fields deliberately NOT fabricated', () => {
  it('never names an organizer or performer (WEB-SEO-010)', () => {
    // These used to fall back to the brand name, claiming we organize touring
    // Broadway shows. The events table has no such column; there is nothing
    // true to put here.
    const node = buildEventJsonLd(ev({ city: 'Waukee' }));
    expect(node).not.toHaveProperty('organizer');
    expect(node).not.toHaveProperty('performer');
  });

  it('omits offers when the price is unreadable rather than claiming free', () => {
    expect(buildEventJsonLd(ev({ price: 'Varies' }))).not.toHaveProperty('offers');
  });

  it('emits offers when the price IS readable', () => {
    // Counter-assertion for the rule above: omitting always would be its own bug.
    expect(buildEventJsonLd(ev({ price: '$25' }))).toHaveProperty('offers');
  });
});

describe('buildEventItemList', () => {
  it('reports numberOfItems as the truncated count, not the input count', () => {
    const many = Array.from({ length: 40 }, (_, i) => ev({ id: `e${i}`, title: `Event ${i}` }));
    const list = buildEventItemList(many, { name: 'n', description: 'd', url: 'u' }, 10);
    expect(list.numberOfItems).toBe(10);
    expect(list.itemListElement).toHaveLength(10);
  });

  it('positions are 1-based and contiguous', () => {
    const list = buildEventItemList([ev(), ev({ id: 'e2' })], { name: 'n', description: 'd', url: 'u' });
    expect(list.itemListElement.map((e) => e.position)).toEqual([1, 2]);
  });

  it('every item in the list carries endDate — the /events regression, at list level', () => {
    const list = buildEventItemList([ev(), ev({ id: 'e2' })], { name: 'n', description: 'd', url: 'u' });
    expect(list.itemListElement.every((e) => 'endDate' in e.item)).toBe(true);
    // Not vacuous: the list is genuinely non-empty.
    expect(list.itemListElement.length).toBeGreaterThan(0);
  });
});

describe('an event with no announced start time (WEB-BE-038)', () => {
  // SeatGeek marks an unannounced showtime with time_tbd and fills
  // datetime_local with 03:30:00. Ingested as a fact, that renders in a rich
  // result as "3:30 AM" -- and a visitor reading that does not think "the time
  // is not announced yet", they think the listing is broken.

  it('publishes a date-only startDate', () => {
    // schema.org/Event accepts a bare date, which is exactly what "the date is
    // known, the time is not" means.
    const start = '2026-09-04T03:30:00.000Z';
    expect(eventStartIso(ev({ date: start, time_tbd: true }))).toBe('2026-09-04');
  });

  it('leaves a normal event timestamp alone', () => {
    const start = '2026-09-04T00:00:00.000Z';
    expect(eventStartIso(ev({ date: start }))).toBe(start);
    expect(eventStartIso(ev({ date: start, time_tbd: false }))).toBe(start);
  });

  it('omits endDate rather than estimating one', () => {
    // The three-hour fallback is anchored to a real start. With a date-only
    // start there is nothing to anchor it to, and adding three hours to
    // midnight would publish a 3 AM end -- the same implausible hour, moved to
    // the other field.
    expect(eventEndIso(ev({ date: '2026-09-04T03:30:00.000Z', time_tbd: true }))).toBeNull();
  });

  it('still uses a real end_date when the source gave one', () => {
    const e = ev({ date: '2026-09-04T03:30:00.000Z', time_tbd: true });
    e.end_date = '2026-09-04T23:00:00.000Z';
    expect(eventEndIso(e)).toBe('2026-09-04T23:00:00.000Z');
  });

  it('the built node carries the date-only start and no endDate', () => {
    const node = buildEventJsonLd(ev({ date: '2026-09-04T03:30:00.000Z', time_tbd: true }));
    expect(node.startDate).toBe('2026-09-04');
    expect('endDate' in node).toBe(false);
  });
});
