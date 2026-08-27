/**
 * Trial-conversion notice (WEB-LEGAL-006).
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_tests/trial-notice.test.ts
 *
 * The notice has to say what will be charged, when, and how to stop it. What
 * shipped before was retention copy ("Keep your Insider perks") with none of
 * those three, and it was suppressed twice over: skipped for anyone who had
 * turned off marketing email, and droppable by an LLM quality gate. Both
 * suppressions fail closed and silently, so the absence of a required notice
 * was invisible - the run summary only ever counted sends.
 *
 * The structural tests at the bottom are the ones that matter. Content can be
 * reworded; what must not come back is the gating.
 */

import {
  assertEquals,
  assert,
} from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { buildTrialNotice, planAmount, formatChargeDate } from '../_shared/trialNotice.ts';

const read = (rel: string) => Deno.readTextFile(new URL(rel, import.meta.url));
const CHARGE_AT = '2026-09-01T12:00:00.000Z';

Deno.test('states the amount, the date and how to cancel', () => {
  const n = buildTrialNotice({
    planName: 'Insider',
    amount: 7.99,
    interval: 'month',
    chargeAt: CHARGE_AT,
    siteUrl: 'https://example.com',
  });
  for (const needed of ['$7.99', 'per month', 'September 1, 2026', 'Cancel']) {
    assert(n.text.includes(needed) || n.html.includes(needed), `notice must mention ${needed}`);
  }
  assert(n.html.includes('https://example.com/profile?tab=settings'), 'needs a direct cancel link');
  assert(n.subject.includes('Insider'), 'subject should name the plan');
  assert(n.subject.includes('September 1, 2026'), 'subject should carry the date');
});

Deno.test('yearly plans state the yearly amount and interval', () => {
  const n = buildTrialNotice({
    planName: 'VIP', amount: 79.99, interval: 'year', chargeAt: CHARGE_AT, siteUrl: 'https://x.test',
  });
  assert(n.text.includes('$79.99 per year'));
  assert(!n.text.includes('per month'));
});

Deno.test('an unknown amount points at the page rather than inventing one', () => {
  const n = buildTrialNotice({
    planName: 'Insider', amount: null, interval: null, chargeAt: CHARGE_AT, siteUrl: 'https://x.test',
  });
  assert(
    n.text.includes('shown on your subscription page'),
    'a wrong amount is worse than no amount; it must defer to the page',
  );
  assert(!n.text.includes('$'), 'must not print a placeholder figure');
  assert(n.text.includes('Cancel') || n.text.includes('cancel'));
});

Deno.test('the charge date renders in Central Time', () => {
  // 00:30 UTC on Sep 2 is still Sep 1 in Des Moines; a UTC render would say the 2nd.
  assertEquals(formatChargeDate('2026-09-02T00:30:00.000Z'), 'Tuesday, September 1, 2026');
});

Deno.test('planAmount picks by interval and refuses to guess', () => {
  const plan = { price_monthly: 7.99, price_yearly: 79.99 };
  assertEquals(planAmount(plan, 'month'), 7.99);
  assertEquals(planAmount(plan, 'year'), 79.99);
  assertEquals(planAmount(plan, null), null, 'unknown interval must not default to monthly');
  assertEquals(planAmount(null, 'month'), null);
});

Deno.test('the notice identifies itself as billing, not marketing', () => {
  const n = buildTrialNotice({
    planName: 'Insider', amount: 7.99, interval: 'month', chargeAt: CHARGE_AT, siteUrl: 'https://x.test',
  });
  assert(n.text.toLowerCase().includes('not a marketing email'));
});

// -----------------------------------------------------------------------------
// The gating. These are the regression guards.
// -----------------------------------------------------------------------------

// This agent exists TWICE and both copies are deployable: agent-runner
// dispatches the _shared module (pg_cron was repointed to it by migration
// 20260710000000), and the standalone agent-* edge function remains callable by
// an admin or an API key. The WEB-LEGAL-006 fix originally landed on the shared
// copy only, so the standalone kept sending retention copy with no amount, no
// date and no cancel path, gated on marketing consent AND on the quality score.
// Nothing caught it because this file only ever read one of the two. Both now.
const NURTURE_COPIES = [
  '../_shared/agents/subscription-nurture.ts',
  '../agent-subscription-nurture/index.ts',
];

for (const path of NURTURE_COPIES) {
  Deno.test(`the cron trial path does not consult marketing consent (${path})`, async () => {
    const src = await read(path);
    const start = src.indexOf('// ── 1) Trial ending');
    const end = src.indexOf('// ── 2) Dunning');
    assert(start !== -1 && end > start, 'trial block not found; update this test');
    const block = src.slice(start, end);
    assert(
      !block.includes('consented('),
      'the trial notice must not be gated on messagingAllowed: a billing disclosure ' +
        'withheld from people who opted out of marketing reaches nobody who needs it',
    );
    assert(block.includes('sendNotice('), 'must use the transactional sender');
    assert(!block.includes('sendStep('), 'sendStep runs the LLM quality gate');
  });

  Deno.test(`the transactional sender skips the quality gate (${path})`, async () => {
    const src = await read(path);
    const start = src.indexOf('async function sendNotice(');
    const end = src.indexOf('async function sendStep(');
    assert(start !== -1 && end > start);
    const body = src.slice(start, end);
    assert(!body.includes('scoreOutput('), 'a required notice must not depend on a model score');
    assert(body.includes('category: "transactional"'));
  });
}

Deno.test('the webhook handles trial_will_end and dedupes against the sweep', async () => {
  const src = await read('../stripe-webhook/index.ts');
  assert(src.includes('customer.subscription.trial_will_end'), 'event must be handled');
  assert(src.includes('handleTrialWillEnd'), 'handler must exist');
  const start = src.indexOf('async function handleTrialWillEnd(');
  const body = src.slice(start);
  assert(body.includes('nurture_sends'), 'must check the ledger so both senders cannot double-send');
  assert(body.includes('"trial_ending"'), 'must dedupe on the same kind the sweep uses');
  assert(body.includes('category: "transactional"'));
  assert(!body.includes('scoreOutput('));
  assert(!body.includes('messagingAllowed'));
});

Deno.test('the billing interval is recorded so the amount can be stated', async () => {
  const src = await read('../stripe-webhook/index.ts');
  const writes = src.split('billing_interval:').length - 1;
  assert(writes >= 2, `expected create and update paths to record it, found ${writes}`);
  const migration = await read('../../migrations/20260817000001_subscription_billing_interval.sql');
  // Assert on the DDL only; the prose explains why it is nullable and would
  // otherwise trip the check below.
  const ddl = migration
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');
  assert(ddl.includes('ADD COLUMN IF NOT EXISTS billing_interval'));
  assert(
    !/\bNOT\s+NULL\b|\bDEFAULT\b/i.test(ddl.split('COMMENT')[0]),
    'must stay additive and nullable so no reader breaks and no table is rewritten',
  );
});
