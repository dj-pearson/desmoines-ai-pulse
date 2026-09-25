#!/usr/bin/env node
/**
 * One intent, one checkout session, one customer (WEB-ADS-014 AC6).
 *
 * ── WHY A RETRY IS A REAL RISK HERE, NOT A THEORETICAL ONE ──────────────────
 *
 * create-campaign-checkout is reachable more than once for a single intent: a
 * double click, a client retry on a timeout that actually succeeded, an edge
 * retry. Every extra session is another URL that can be paid. And the webhook's
 * campaign update is scoped to ONE stripe_session_id
 * (`.eq("stripe_session_id", session.id)`), so a second payment lands on a
 * campaign the first has already advanced - money taken against a row that no
 * longer matches.
 *
 * The key carries the AUTHORITATIVE total rather than the stored one. When the
 * rate card changes the price genuinely is different, and replaying the old
 * amount would charge yesterday's price for today's campaign - the WEB-ADS-003
 * shape, from the other direction.
 *
 * stripe-webhook and create-campaign-checkout are Deno and import from esm.sh,
 * so they cannot be loaded into Node. The house pattern is to assert against
 * the source with comments stripped, and to say what that cannot establish: it
 * cannot show that Stripe honours the key, that a retry actually arrives, or
 * that the migration has been applied.
 */
import { readFileSync } from 'node:fs';

const raw = readFileSync('supabase/functions/create-campaign-checkout/index.ts', 'utf8');
// COMMENTS STRIPPED. The block added for this change explains the old
// email-lookup behaviour by describing it, and a check that matches the
// explanation would pass with the code reverted.
const code = raw
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((l) => l.replace(/(?<!:)\/\/.*$/, ''))
  .join('\n');

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok    ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};

console.log('\none intent, one session');
{
  check('the session create carries an idempotency key', /idempotencyKey:/.test(code));
  check(
    '  keyed on the campaign',
    /idempotencyKey: `campaign:\$\{campaignId\}/.test(code),
    'a key that is not per-campaign would collapse two different campaigns into one session',
  );
  // THE ASSERTION THAT PROTECTS THE PRICE. storedTotal is what the browser
  // wrote; authoritativeTotal is what the rate card says. Keying on the stored
  // one would let a stale price be replayed.
  check(
    '  and on the AUTHORITATIVE total, not the stored one',
    /idempotencyKey: `campaign:\$\{campaignId\}:\$\{authoritativeTotal\.toFixed\(2\)\}:\$\{attempt\}`/.test(code),
    'keying on storedTotal replays a price the rate card no longer agrees with',
  );
  // Business plan WP4 item 7: the key carries a per-attempt nonce, because
  // expires_at differs per call and a retry inside Stripe's 24h window failed
  // as a parameter mismatch. With a nonce the key no longer collapses a double
  // click, so that job moved to two places this file has to see: an open
  // session at the same amount is handed back, and a new session is recorded
  // only if the row still holds the one this request read.
  check(
    '  the nonce is fresh per attempt',
    /const attempt = crypto\.randomUUID\(\)/.test(code),
    'a key derived from anything stable is the parameter-mismatch bug again',
  );
  check(
    '  an open session at the same amount is handed back',
    /previous\.status === "open"[\s\S]{0,200}previous\.amount_total === authoritativeCents/.test(code),
    'without it every retry opens another payable URL',
  );
  check(
    '  the session is recorded only over the one this request saw',
    /claim\.eq\("stripe_session_id", previousSessionId\)[\s\S]{0,80}claim\.is\("stripe_session_id", null\)/.test(code),
    'an unconditional write lets a double click leave two open sessions',
  );
  check(
    '  and the loser withdraws its own session',
    /claimed\.length === 0\)[\s\S]{0,400}sessions\.expire\(session\.id\)/.test(code),
    'the losing session would stay payable',
  );
  // The key is Stripe's second argument, not a body field - a field named
  // idempotencyKey inside the session object does nothing at all.
  check(
    '  passed as the request option, not as a session field',
    /\}, \{\s*\n[\s\S]{0,400}idempotencyKey:/.test(code),
    'inside sessions.create\'s first argument it is an unknown parameter',
  );
}

console.log('\none customer, remembered');
{
  check('the profile is read first', /\.from\("profiles"\)[\s\S]{0,120}stripe_customer_id[\s\S]{0,120}\.eq\("user_id", user\.id\)/.test(code));
  // WEB-SEC-023, hit four times in this codebase: profiles.id is the row PK,
  // not the auth id. Keyed on id this lookup silently never matches and every
  // checkout falls back to the email search.
  check('  keyed on user_id, never id', !/from\("profiles"\)[\s\S]{0,200}\.eq\("id", user\.id\)/.test(code));
  check('Stripe is searched only when the profile has nothing', /if \(!customerId\) \{[\s\S]{0,200}customers\.list/.test(code));
  check('the id is written back', /\.update\(\{ stripe_customer_id: customerId \}\)/.test(code));
  // Never overwrite: the id already there may be the customer holding their
  // payment history.
  check(
    '  only ever filling a NULL',
    /\.is\("stripe_customer_id", null\)/.test(code),
    'an unconditional write can repoint an advertiser at a different Stripe customer',
  );
  check('  and not re-written when it came from the profile', /if \(customerId && !customerIdOnProfile\)/.test(code));
  // The session already exists and the buyer is mid-checkout; a failed write
  // here must not throw.
  check('a failed write is logged, not thrown', /console\.warn\("\[create-campaign-checkout\] could not store the customer id:/.test(raw));
  check('a failed READ is logged too, not discarded', /profile customer lookup failed/.test(raw));
}

console.log('\nthe column it needs');
{
  const migration = readFileSync('supabase/migrations/20260920000006_profiles_stripe_customer_id.sql', 'utf8')
    .replace(/^\s*--[^\n]*$/gm, '');
  check('the column is added', /ADD COLUMN IF NOT EXISTS stripe_customer_id text/.test(migration));
  // SCOPED TO THE ALTER, not the whole file: the partial index below it reads
  // `WHERE stripe_customer_id IS NOT NULL`, which contains the words "NOT NULL"
  // and is not a constraint on anything. A file-wide match fails on the index
  // that makes the column useful.
  const alter = migration.slice(migration.indexOf('ALTER TABLE public.profiles'), migration.indexOf(';', migration.indexOf('ALTER TABLE public.profiles')));
  check('nullable, with no default', !/NOT NULL/.test(alter) && !/DEFAULT/.test(alter), alter.trim());
  // A unique index would turn a duplicate left by a race into a 23505 on
  // somebody's checkout - failing a payment to protect a tidiness property.
  check(
    'and NOT unique',
    !/CREATE UNIQUE INDEX[\s\S]*stripe_customer_id/.test(migration),
    'a unique index here fails a payment when a race leaves a duplicate',
  );
}

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
