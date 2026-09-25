import { describe, it, expect } from 'vitest';
import {
  buildEventJsonLd,
  buildEventItemList,
  eventEndIso,
  eventOutboundLink,
  eventStartIso,
  LIST_DESCRIPTION_MAX,
} from '@/lib/eventSchema';
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
  // datetime_local with 03:30:00, which is 08:30Z in September. Ingested as a
  // fact, that renders in a rich result as "3:30 AM".
  const TBD_START = '2026-09-04T08:30:00.000Z';

  it('publishes a date-only startDate', () => {
    expect(eventStartIso(ev({ date: TBD_START, time_tbd: true }))).toBe('2026-09-04');
  });

  it('leaves a normal event timestamp alone', () => {
    const start = '2026-09-04T00:00:00.000Z';
    expect(eventStartIso(ev({ date: start }))).toBe(start);
    expect(eventStartIso(ev({ date: start, time_tbd: false }))).toBe(start);
  });

  it('omits endDate rather than estimating one', () => {
    expect(eventEndIso(ev({ date: TBD_START, time_tbd: true }))).toBeNull();
  });

  it('keeps a real end_date, as a Central date to match the date-only start', () => {
    const e = ev({ date: TBD_START, time_tbd: true });
    e.end_date = '2026-09-06T23:00:00.000Z';
    expect(eventEndIso(e)).toBe('2026-09-06');
  });

  it('the built node carries the date-only start and no endDate', () => {
    const node = buildEventJsonLd(ev({ date: TBD_START, time_tbd: true }));
    expect(node.startDate).toBe('2026-09-04');
    expect('endDate' in node).toBe(false);
  });
});

describe('JSON-LD time matches the page (events-pass2 WP4 item 2)', () => {
  it('a 19:31:58 sentinel row publishes its Central date and no endDate', () => {
    // 19:31:58 CDT on Fri Sep 4 is 00:31:58Z on Sep 5. Slicing the UTC string
    // used to publish the 5th.
    const node = buildEventJsonLd(
      ev({ date: '2026-09-05T00:31:58+00:00', event_start_local: '2026-09-04T19:31:58' }),
    );
    expect(node.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(node.startDate).toBe('2026-09-04');
    expect('endDate' in node).toBe(false);
  });

  it('a SeatGeek 03:30 row publishes a date-only startDate and no endDate, with no time_tbd column', () => {
    const node = buildEventJsonLd(
      ev({
        date: '2026-09-04T08:30:00+00:00',
        event_start_utc: '2026-09-04T08:30:00+00:00',
        event_start_local: '2026-09-04T03:30:00',
        source_url: 'https://seatgeek.com/some-show-tickets/concert/123',
      }),
    );
    expect(node.startDate).toBe('2026-09-04');
    expect('endDate' in node).toBe(false);
  });

  it('a timed evening event keeps its instant and a three-hour estimate', () => {
    const node = buildEventJsonLd(ev({ date: '2026-09-05T00:00:00.000Z' }));
    expect(node.startDate).toBe('2026-09-05T00:00:00.000Z');
    expect(node.endDate).toBe('2026-09-05T03:00:00.000Z');
  });

  it('ignores an end_date before the start', () => {
    expect(eventEndIso(ev({ date: '2026-09-05T00:00:00.000Z', end_date: '2026-09-01T00:00:00.000Z' }))).toBe(
      '2026-09-05T03:00:00.000Z',
    );
  });
});

describe('descriptions in lists (events-pass2 WP4 item 18)', () => {
  const long = `${'Live music on the lawn with food trucks and a cash bar. '.repeat(20)}`.trim();

  it('trims list items to LIST_DESCRIPTION_MAX at a word boundary', () => {
    const list = buildEventItemList([ev({ enhanced_description: long })], { name: 'n', description: 'd', url: 'u' });
    const text = list.itemListElement[0].item.description;
    expect(text.length).toBeLessThanOrEqual(LIST_DESCRIPTION_MAX);
    expect(text.endsWith('...')).toBe(true);
    expect(long.startsWith(text.slice(0, -3))).toBe(true);
    expect(text.slice(0, -3).endsWith(' ')).toBe(false);
  });

  it('the detail node keeps the full text', () => {
    expect(buildEventJsonLd(ev({ enhanced_description: long })).description).toBe(long);
  });
});

describe('eventOutboundLink (events-pass2 WP4 item 5)', () => {
  it('names the host for a Varies price on a listing site', () => {
    expect(
      eventOutboundLink({ price: 'Varies', source_url: 'https://www.catchdesmoines.com/event/x/123/' }),
    ).toEqual({
      href: 'https://www.catchdesmoines.com/event/x/123/',
      label: 'Event listing on catchdesmoines.com',
      sellsTickets: false,
    });
  });

  it('says Get tickets for a paid price on a ticketing host', () => {
    expect(eventOutboundLink({ price: '$25', source_url: 'https://www.ticketmaster.com/e/1' })?.label).toBe(
      'Get tickets',
    );
    expect(
      eventOutboundLink({ price: '$20-$45', source_url: 'https://concerts.livenation.axs.com/x' })?.sellsTickets,
    ).toBe(true);
  });

  it('does not say Get tickets for a free or unreadable price, even on a ticketer', () => {
    expect(eventOutboundLink({ price: 'Free', source_url: 'https://www.eventbrite.com/e/1' })?.label).toBe(
      'Event listing on eventbrite.com',
    );
    expect(eventOutboundLink({ price: 'TBD', source_url: 'https://seatgeek.com/x' })?.sellsTickets).toBe(false);
  });

  it('does not treat a look-alike host as a ticketer', () => {
    expect(eventOutboundLink({ price: '$25', source_url: 'https://notticketmaster.com/x' })?.sellsTickets).toBe(false);
  });

  it('returns nothing for a javascript: link or a broken one', () => {
    expect(eventOutboundLink({ price: '$25', source_url: 'javascript:alert(1)' })).toBeNull();
    expect(
      eventOutboundLink({ price: '$25', source_url: 'https://www.ticketmaster.com/e/1', source_url_broken: true }),
    ).toBeNull();
  });
});
