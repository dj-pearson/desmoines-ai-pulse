#!/usr/bin/env node
/**
 * The abandoned-checkout revert (WEB-ADS-011 AC4).
 *
 *   npx tsx scripts/__tests__/checkout-expiry.test.mjs
 *
 * stripe-webhook is a Deno function importing from esm.sh, so it cannot be
 * imported into Node and run. The house pattern for edge functions is to assert
 * against the source (edge-claude-requests, submission-email-claims,
 * list-edge-deploys do the same) and to be explicit about what that can and
 * cannot establish.
 *
 * WHAT IT ESTABLISHES: that the event is handled at all, and that the update
 * carries the three conditions that stop it doing damage. Every one of those is
 * a line somebody could delete while the handler still looks correct.
 *
 * WHAT IT CANNOT: that Stripe delivers the event, that the revert runs against
 * a real row, or that the CHECK constraint has been applied. Deploying the
 * function and applying 20260920000000 are the owner's.
 */
import { readFileSync } from 'node:fs';

const WEBHOOK = readFileSync('supabase/functions/stripe-webhook/index.ts', 'utf8');
const MIGRATION = readFileSync(
  'supabase/migrations/20260920000000_campaign_checkout_expired_notification.sql',
  'utf8',
);

/** Comments here EXPLAIN the conditions; matching them would prove nothing. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const WEBHOOK_CODE = code(WEBHOOK);

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failures += 1;
    console.error(`  FAIL ${name}${detail ? ' :: ' + detail : ''}`);
  }
};

console.log('[checkout-expiry] the event is handled');
check('the switch has a checkout.session.expired case', /case "checkout\.session\.expired"/.test(WEBHOOK_CODE));
check('it calls the handler', /handleCheckoutSessionExpired\(supabase, session\)/.test(WEBHOOK_CODE));
check('the handler exists', /async function handleCheckoutSessionExpired\(/.test(WEBHOOK_CODE));

// The handler body, so a condition satisfied elsewhere in the file does not
// count as satisfied here.
const start = WEBHOOK_CODE.indexOf('async function handleCheckoutSessionExpired(');
const body = WEBHOOK_CODE.slice(start, WEBHOOK_CODE.indexOf('\nasync function', start + 10));

console.log('\nthe three conditions on the update');
check('it reverts to draft', /status:\s*"draft"/.test(body));
check('scoped to the campaign', /\.eq\("id", campaignId\)/.test(body));
check(
  'scoped to THIS session - a retry must not be dragged back',
  /\.eq\("stripe_session_id", session\.id\)/.test(body),
);
check(
  'scoped to pending_payment - a paid or cancelled campaign is not reverted',
  /\.eq\("status", "pending_payment"\)/.test(body),
);

console.log('\nwhat throws and what does not');
check('a failed revert throws, so Stripe redelivers', /throw error;/.test(body));
check(
  'a failed notification does NOT throw',
  /notifyError/.test(body) && !/throw notifyError/.test(body),
);
check('a session with no campaignId returns early', /if \(!campaignId\)/.test(body));
check('a subscription checkout is therefore untouched', !/planId|subscription/.test(body));

console.log('\nthe notification type must be allowed');
check('the handler uses checkout_expired', /notification_type:\s*"checkout_expired"/.test(body));
check('the migration widens the CHECK to include it', /'checkout_expired'/.test(MIGRATION));
// Widening keeps every existing value; dropping one would break live writers.
for (const kept of [
  'campaign_created',
  'payment_received',
  'creative_uploaded',
  'creative_approved',
  'creative_rejected',
  'campaign_activated',
  'campaign_expiring_soon',
  'campaign_completed',
  'campaign_rejected',
  'campaign_refunded',
  'creative_deadline_warning',
]) {
  check(`the widened CHECK still allows ${kept}`, MIGRATION.includes(`'${kept}'`));
}

if (failures > 0) {
  console.error(`\n[checkout-expiry] ${failures} failure(s)`);
  process.exit(1);
}
console.log('\n[checkout-expiry] all checks passed');
