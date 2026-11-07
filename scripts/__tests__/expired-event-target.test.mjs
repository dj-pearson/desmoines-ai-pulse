#!/usr/bin/env node
/**
 * The check-sitemap-redirects exemption for past dated events.
 *
 *   npx tsx scripts/__tests__/expired-event-target.test.mjs
 *
 * Weighted toward what must NOT be exempted: a future event, a page that is
 * not a dated event, and anything with more after the date.
 */
import { strict as assert } from 'node:assert';
import { chicagoToday, expiredEventDate } from '../lib/expiredEventTarget.mjs';

const TODAY = '2026-11-07';

// The rule that turned CI red.
assert.equal(expiredEventDate('/events/the-slaughterhouse-haunted-house-2026-10-02', TODAY), '2026-10-02');

// Not past: still checked.
assert.equal(expiredEventDate('/events/holiday-lights-2026-11-07', TODAY), null, 'today is not past');
assert.equal(expiredEventDate('/events/holiday-lights-2026-12-01', TODAY), null, 'a future event is not exempt');

// Not a dated event page: still checked.
assert.equal(expiredEventDate('/visitors-guide', TODAY), null);
assert.equal(expiredEventDate('/restaurants/taco-spot-2026-01-01', TODAY), null, 'only /events/ is exempt');
assert.equal(expiredEventDate('/events/today', TODAY), null);
assert.equal(expiredEventDate('/events/old-show-2026-01-01/tickets', TODAY), null, 'nothing after the date');

// Chicago, not UTC: 03:00 UTC on Nov 8 is still Nov 7 in Des Moines.
assert.equal(chicagoToday(new Date('2026-11-08T03:00:00Z')), '2026-11-07');

console.log('expired-event-target: 9 assertions passed');
