/**
 * Checkout refuses a start date the page would refuse (NON_CORE_REVIEW WP3).
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_tests/campaign-start-date.test.ts
 *
 * /advertise enforced MIN_LEAD_TIME_DAYS in the browser and
 * create-campaign-checkout took any date, including one in the past.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  addDays,
  campaignStartProblem,
  centralDateOf,
  MIN_LEAD_TIME_DAYS,
} from '../_shared/campaignDates.ts';

const REPO = new URL('../../../', import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, REPO));

Deno.test('the Central date is not the UTC date in the evening', () => {
  // 2026-10-02 23:30 CDT is 2026-10-03 04:30 UTC.
  assertEquals(centralDateOf(new Date('2026-10-03T04:30:00Z')), '2026-10-02');
  // Winter: 2026-12-31 22:00 CST is 2027-01-01 04:00 UTC.
  assertEquals(centralDateOf(new Date('2027-01-01T04:00:00Z')), '2026-12-31');
  assertEquals(addDays('2026-12-30', 3), '2027-01-02');
  assertEquals(addDays('2028-02-28', 1), '2028-02-29');
});

Deno.test('a start inside the lead time or in the past is refused', () => {
  const today = '2026-10-03';
  assertEquals(campaignStartProblem('2026-10-06', today), { ok: true });
  const soon = campaignStartProblem('2026-10-05', today);
  assert(!soon.ok && soon.code === 'START_TOO_SOON' && soon.earliestStart === '2026-10-06');
  const past = campaignStartProblem('2026-10-01', today);
  assert(!past.ok && past.code === 'START_DATE_PASSED');
  // A timestamp column value is compared by its date part.
  assertEquals(campaignStartProblem('2026-10-06T00:00:00+00:00', today), { ok: true });
});

Deno.test('a renewal may start today, never yesterday', () => {
  const today = '2026-10-03';
  assertEquals(campaignStartProblem('2026-10-03', today, { isRenewal: true }), { ok: true });
  const past = campaignStartProblem('2026-10-02', today, { isRenewal: true });
  assert(!past.ok && past.code === 'START_DATE_PASSED');
});

Deno.test('the server lead time equals the one /advertise shows', async () => {
  const copy = await read('src/lib/businessCopy.ts');
  const m = copy.match(/export const MIN_LEAD_TIME_DAYS = (\d+);/);
  assert(m, 'businessCopy.ts must export MIN_LEAD_TIME_DAYS');
  assertEquals(Number(m[1]), MIN_LEAD_TIME_DAYS);
});

Deno.test('checkout checks the start date before it opens a Stripe session', async () => {
  const src = await read('supabase/functions/create-campaign-checkout/index.ts');
  const check = src.indexOf('campaignStartProblem(campaign.start_date, centralDateOf()');
  const stripe = src.indexOf('stripe.checkout.sessions.create(');
  assert(check > 0, 'the start date must be checked');
  assert(check < stripe, 'before a session exists');
  assert(/isRenewal: Boolean\(campaign\.original_campaign_id\)/.test(src), 'renewals keep working');
  assert(/status: 400/.test(src.slice(check, check + 600)), 'a refusal is a 400');
});
