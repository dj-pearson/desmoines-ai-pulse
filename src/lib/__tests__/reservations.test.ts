/**
 * Tests for the reservation resolver (WEB-FEAT-024).
 *
 * The assertions that matter are the ones about what we DON'T say. The page
 * used to label a bare tel: link "Call to Reserve" for every restaurant with a
 * phone number, which asserts a counter-service taco shop takes bookings. So
 * these pin: no reservation claim without evidence, and no booking link to a
 * Google listing that has no reserve button on it.
 */
import { describe, it, expect } from 'vitest';
import {
  providerLabel,
  resolveReservation,
  safeWebUrl,
  takesReservations,
  telHref,
} from '../reservations';
import { safeHttpUrl } from '../safeUrl';

const PHONE = '515-555-0100';
const MAPS = 'https://maps.google.com/?cid=123';
const BOOKING = 'https://www.opentable.com/r/noce-des-moines';

describe('resolveReservation priority', () => {
  it('prefers a curated booking link above everything', () => {
    const action = resolveReservation({
      phone: PHONE,
      website: 'https://nocedsm.com',
      reservable: true,
      google_maps_uri: MAPS,
      reservation_url: BOOKING,
      reservation_provider: 'opentable',
    });
    expect(action.kind).toBe('booking');
    expect(action.href).toBe(BOOKING);
    expect(action.detail).toContain('OpenTable');
  });

  it('falls back to the Google listing when the place is reservable', () => {
    const action = resolveReservation({
      phone: PHONE,
      reservable: true,
      google_maps_uri: MAPS,
    });
    expect(action.kind).toBe('booking');
    expect(action.href).toBe(MAPS);
  });

  it('offers a phone reservation when reservable but no link exists', () => {
    const action = resolveReservation({ phone: PHONE, reservable: true });
    expect(action.kind).toBe('call_to_reserve');
    expect(action.href).toBe(`tel:${PHONE}`);
    expect(action.label.toLowerCase()).toContain('reserve');
  });

  it('uses the website when there is no phone and no booking link', () => {
    const action = resolveReservation({ website: 'https://nocedsm.com' });
    expect(action.kind).toBe('website');
  });

  it('reports none when there is nothing at all', () => {
    expect(resolveReservation({}).kind).toBe('none');
  });
});

describe('what it refuses to claim', () => {
  it('does not say "reserve" when reservable is unknown', () => {
    const action = resolveReservation({ phone: PHONE });
    expect(action.kind).toBe('call');
    expect(action.label.toLowerCase()).not.toContain('reserve');
  });

  it('does not say "reserve" when the place is known not to take them', () => {
    const action = resolveReservation({ phone: PHONE, reservable: false });
    expect(action.kind).toBe('call');
    expect(action.label.toLowerCase()).not.toContain('reserve');
    expect(action.detail).toContain('Walk-ins');
  });

  it('does not link the Google listing when reservable is unknown', () => {
    // A Google listing with no reserve button is a dead end dressed up as a
    // booking link.
    const action = resolveReservation({ phone: PHONE, google_maps_uri: MAPS });
    expect(action.href).not.toBe(MAPS);
  });

  it('does not link the Google listing when reservable is false', () => {
    const action = resolveReservation({
      phone: PHONE,
      reservable: false,
      google_maps_uri: MAPS,
    });
    expect(action.href).not.toBe(MAPS);
  });

  it('treats null reservable as unknown, never as false', () => {
    const unknown = resolveReservation({ phone: PHONE, reservable: null });
    const denied = resolveReservation({ phone: PHONE, reservable: false });
    expect(unknown.kind).toBe('call');
    // The denial carries an explanation; the unknown must not.
    expect(unknown.detail).toBeUndefined();
    expect(denied.detail).toBeDefined();
  });
});

describe('takesReservations', () => {
  it('is true on either kind of evidence', () => {
    expect(takesReservations({ reservable: true })).toBe(true);
    expect(takesReservations({ reservation_url: BOOKING })).toBe(true);
  });

  it('is false without evidence', () => {
    expect(takesReservations({})).toBe(false);
    expect(takesReservations({ reservable: null })).toBe(false);
    expect(takesReservations({ reservable: false })).toBe(false);
    expect(takesReservations({ phone: PHONE })).toBe(false);
  });
});

describe('providerLabel', () => {
  it('names the known platforms', () => {
    expect(providerLabel('opentable')).toBe('OpenTable');
    expect(providerLabel('resy')).toBe('Resy');
    expect(providerLabel('OPENTABLE')).toBe('OpenTable');
  });

  it('is undefined for an unknown or missing provider', () => {
    expect(providerLabel(undefined)).toBeUndefined();
    expect(providerLabel(null)).toBeUndefined();
    expect(providerLabel('mystery')).toBeUndefined();
  });
});

describe('external link flags', () => {
  it('marks booking and website links external, and tel links not', () => {
    expect(resolveReservation({ reservation_url: BOOKING }).external).toBe(true);
    expect(resolveReservation({ website: 'https://x.com' }).external).toBe(true);
    expect(resolveReservation({ phone: PHONE }).external).toBe(false);
    expect(resolveReservation({ phone: PHONE, reservable: true }).external).toBe(false);
  });
});

/**
 * Restaurants plan WP8 item 1. Every URL on the detail page is scraped or
 * curated text; a `javascript:` value must produce no link, not a live one.
 */
describe('safeWebUrl', () => {
  it('refuses javascript:, data: and other non-web schemes', () => {
    expect(safeWebUrl('javascript:alert(1)')).toBeNull();
    expect(safeWebUrl('  JavaScript:alert(1)')).toBeNull();
    expect(safeWebUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeWebUrl('file:///etc/passwd')).toBeNull();
  });

  it('prefixes https:// on a bare hostname', () => {
    expect(safeWebUrl('www.x.com')).toBe('https://www.x.com/');
    expect(safeWebUrl('nocedsm.com/menu')).toBe('https://nocedsm.com/menu');
  });

  it('keeps http(s) URLs', () => {
    expect(safeWebUrl('https://nocedsm.com')).toBe('https://nocedsm.com/');
    expect(safeWebUrl('http://example.com/a?b=1')).toBe('http://example.com/a?b=1');
  });

  it('is null for empty, relative or non-string values', () => {
    expect(safeWebUrl('')).toBeNull();
    expect(safeWebUrl('   ')).toBeNull();
    expect(safeWebUrl('/restaurants')).toBeNull();
    expect(safeWebUrl('not a url')).toBeNull();
    expect(safeWebUrl(null)).toBeNull();
    expect(safeWebUrl(42)).toBeNull();
  });
});

describe('safeWebUrl delegates to safeHttpUrl', () => {
  it('answers the same as the shared helper the crawler shell uses', () => {
    for (const raw of ['javascript:alert(1)', 'www.x.com', 'https://a.com/b', '/x', '', null]) {
      expect(safeWebUrl(raw)).toBe(safeHttpUrl(raw));
    }
  });
});

describe('telHref', () => {
  it('keeps digits and phone punctuation', () => {
    expect(telHref(PHONE)).toBe(`tel:${PHONE}`);
    expect(telHref('(515) 555-0100')).toBe('tel:(515)555-0100');
  });

  it('is null when there is nothing to dial', () => {
    expect(telHref('call us')).toBeNull();
    expect(telHref('')).toBeNull();
    expect(telHref(undefined)).toBeNull();
  });
});

describe('unsafe URLs never become links', () => {
  it('drops a javascript: reservation_url and falls through to the phone', () => {
    const action = resolveReservation({ phone: PHONE, reservation_url: 'javascript:alert(1)' });
    expect(action.kind).toBe('call');
    expect(action.href).toBe(`tel:${PHONE}`);
  });

  it('drops a javascript: Google listing even for a reservable place', () => {
    const action = resolveReservation({ reservable: true, google_maps_uri: 'javascript:alert(1)' });
    expect(action.href).toBeUndefined();
    expect(action.kind).toBe('none');
  });

  it('drops a javascript: website', () => {
    const action = resolveReservation({ website: 'javascript:alert(1)' });
    expect(action.kind).toBe('none');
    expect(action.href).toBeUndefined();
  });

  it('turns a bare website hostname into an https link', () => {
    expect(resolveReservation({ website: 'www.x.com' }).href).toBe('https://www.x.com/');
  });

  it('does not count an unsafe reservation_url as evidence', () => {
    expect(takesReservations({ reservation_url: 'javascript:alert(1)' })).toBe(false);
  });
});
