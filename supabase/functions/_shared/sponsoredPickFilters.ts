/**
 * Eligibility and copy rules for get-sponsored-pick (IOS-DD-MONETIZATION-19).
 *
 * The function used to compute "today" in UTC, so from 7pm Central a campaign
 * ending that day was already out of flight and one starting tomorrow was
 * already in. It selected sponsored events by id with no end, hidden, merged
 * or archived filter, and restaurants with no closed filter, so a paid slot
 * could send someone to last week's concert or a permanently closed kitchen.
 * And its caption said "spot locals are loving", a claim nothing measured.
 *
 * Pure so it can be tested without Deno.serve or a database.
 */

import { CENTRAL_TZ } from './centralTime.ts';

const CENTRAL_DAY_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: CENTRAL_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today's date in Des Moines, as YYYY-MM-DD (en-CA formats ISO-style). */
export function centralToday(now: Date = new Date()): string {
  return CENTRAL_DAY_FORMAT.format(now);
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** The Central calendar day a stored event date falls on, or null. */
function centralDay(value: string): string | null {
  if (DATE_ONLY.test(value)) return value;
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return null;
  return CENTRAL_DAY_FORMAT.format(instant);
}

/** How long after a timed start an event with no end still counts as on. */
const STARTED_GRACE_MS = 3 * 60 * 60 * 1000;

/**
 * Whether a sponsored event is still worth sending someone to.
 *   - an end_date in the future: yes;
 *   - a later Central day: yes;
 *   - today with no time (a bare date): yes, all day;
 *   - today with a time: until three hours after it started;
 *   - anything else: no.
 */
export function isEventStillOn(
  row: { date?: string | null; end_date?: string | null },
  now: Date = new Date(),
): boolean {
  if (row.end_date) {
    const end = new Date(row.end_date);
    if (!Number.isNaN(end.getTime()) && end.getTime() >= now.getTime()) return true;
  }
  if (!row.date) return false;
  const day = centralDay(row.date);
  if (!day) return false;
  const today = centralToday(now);
  if (day > today) return true;
  if (day < today) return false;
  if (DATE_ONLY.test(row.date)) return true;
  const start = new Date(row.date).getTime();
  return start >= now.getTime() - STARTED_GRACE_MS;
}

const CLOSED_STATUSES = new Set(['closed', 'permanently_closed', 'closed_permanently']);

/** False for a restaurant Google or our own lifecycle marks closed. */
export function isRestaurantOpenForBusiness(
  row: { business_status?: string | null; status?: string | null },
): boolean {
  if ((row.business_status ?? '').toUpperCase() === 'CLOSED_PERMANENTLY') return false;
  if (CLOSED_STATUSES.has((row.status ?? '').toLowerCase())) return false;
  return true;
}

function titleCase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

/**
 * The caption under a sponsored pick. Says what it is and nothing it cannot
 * back up: no "locals are loving", no "worth a look".
 */
export function buildReason(
  type: 'event' | 'restaurant',
  category: string | null | undefined,
): string {
  const label = typeof category === 'string' && category.trim() ? titleCase(category) : '';
  if (type === 'event') {
    return label ? `Sponsored · ${label} event` : 'Sponsored event';
  }
  return label ? `Sponsored · ${label}` : 'Sponsored restaurant';
}
