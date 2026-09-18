/**
 * Newsletter double opt-in (WEB-FEAT-019).
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_tests/newsletter-double-optin.test.ts
 *
 * The signup inserted straight into newsletter_subscribers from the browser,
 * took the table's default status ('active'), and toasted "Check your email for
 * a confirmation" with no sender behind it. Three separate failures sat under
 * that one sentence, and each has its own tests below:
 *
 *   - no confirmation, so anyone could add anyone else's address to a
 *     marketing list: the INSERT policy is WITH CHECK (true);
 *   - an unsubscribed address hit UNIQUE(email) forever. The table has no
 *     UPDATE policy for any role, so coming back was impossible from any
 *     client, and the copy told them they were already subscribed;
 *   - the weekly digest read this table only for an unsubscribe token and
 *     ignored the status, so the one-click opt-out changed nothing that
 *     stopped the mail.
 */

import { assert, assertEquals, assertFalse } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const REPO = new URL('../../../', import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, REPO));

/**
 * Comments are stripped before any absence assertion, the same control
 * check-edge-auth.mjs applies and for the same reason: the history of a defect
 * belongs in the comments, and a test that matches prose fails on an accurate
 * explanation of the bug it is guarding against.
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const MIGRATION = await read('supabase/migrations/20260918000002_newsletter_double_optin.sql');
const FN = await read('supabase/functions/newsletter-subscribe/index.ts');
const DIGEST = await read('supabase/functions/send-weekly-digest/index.ts');
const HOOK = await read('src/hooks/useNewsletterSubscription.ts');
const CONFIG = await read('supabase/config.toml');

// --------------------------------------------------------------------------
// pending -> active
// --------------------------------------------------------------------------

Deno.test("'pending' is a widening of the status CHECK, not a replacement", () => {
  assert(
    /CHECK \(status IN \('active', 'pending', 'unsubscribed', 'bounced'\)\)/.test(MIGRATION),
    'every previously valid status must survive',
  );
});

Deno.test('the confirm token is never readable over REST', () => {
  // Same posture as unsubscribe_token in 20260413000002: it only ever leaves
  // the database inside an email the server sends.
  assert(/REVOKE SELECT \(confirm_token\) ON public\.newsletter_subscribers FROM anon;/.test(MIGRATION));
  assert(
    /REVOKE SELECT \(confirm_token\) ON public\.newsletter_subscribers FROM authenticated;/.test(MIGRATION),
  );
});

Deno.test('confirming flips to active and spends the token', () => {
  assert(/status\s+= 'active'/.test(MIGRATION));
  assert(
    /confirm_token = NULL/.test(MIGRATION),
    'a token left behind is a working re-subscribe link sitting in an inbox forever',
  );
  assert(/confirmed_at = COALESCE\(confirmed_at, NOW\(\)\)/.test(MIGRATION));
});

Deno.test('a second click on the same link is not an error', () => {
  // The alternative tells someone their subscription failed when it worked.
  assert(/IF v_row\.status = 'active' THEN\s*\n\s*RETURN QUERY SELECT TRUE, TRUE;/.test(MIGRATION));
});

Deno.test('the token shape is validated before the table is touched', () => {
  assert(/length\(p_token\) <> 48 OR p_token !~ '\^\[0-9a-f\]\+\$'/.test(MIGRATION));
});

Deno.test('confirming writes the consent record, hashed the way the rest of the repo hashes', () => {
  // GDPR Art. 7 wants evidence of affirmative consent. The click IS the
  // evidence; the signup form never was.
  assert(/INSERT INTO public\.consent_records/.test(MIGRATION));
  assert(/'newsletter',/.test(MIGRATION));
  // link_orphan_consent_records (20260902000014) recomputes this exact
  // expression to adopt a row into an account later. A different one orphans it.
  assert(
    /encode\(extensions\.digest\(lower\(btrim\(v_row\.email\)\), 'sha256'\), 'hex'\)/.test(MIGRATION),
    'the email hash must match link_orphan_consent_records exactly',
  );
});

Deno.test('the confirm RPC is callable without an account, and not by PUBLIC', () => {
  assert(/GRANT EXECUTE ON FUNCTION public\.newsletter_confirm_by_token\(TEXT\) TO anon;/.test(MIGRATION));
  assert(/REVOKE ALL ON FUNCTION public\.newsletter_confirm_by_token\(TEXT\) FROM PUBLIC;/.test(MIGRATION));
  assert(/SECURITY DEFINER/.test(MIGRATION));
  assert(/SET search_path = public, pg_temp/.test(MIGRATION));
});

Deno.test('rows that predate the confirm flow are not backdated', () => {
  // Inventing a confirmation timestamp for a confirmation that never happened
  // is the one thing an audit trail must not do.
  assertFalse(
    /UPDATE public\.newsletter_subscribers[\s\S]{0,200}SET confirmed_at/.test(MIGRATION),
    'no backfill of confirmed_at',
  );
});

// --------------------------------------------------------------------------
// resubscribe, and the enumeration property
// --------------------------------------------------------------------------

Deno.test('the signup upserts on email, which is the whole resubscribe fix', () => {
  assert(
    /\.upsert\(row, \{ onConflict: "email" \}\)/.test(FN),
    'the old client-side insert could only ever 23505 on a returning address',
  );
  assert(/status: "pending"/.test(FN));
});

Deno.test('an already-active row is never reset', () => {
  // Otherwise anyone unsubscribes a stranger by typing their address into the
  // signup form.
  assert(/if \(existing\?\.status === "active"\) return ok\(\);/.test(FN));
});

Deno.test('every outcome answers the same sentence', () => {
  const generic = FN.match(/const GENERIC_ANSWER =/g) ?? [];
  assertEquals(generic.length, 1, 'one answer, or it is a subscription oracle');
  // Each of these paths must return the SAME ok(), not its own wording.
  const okReturns = FN.match(/return ok\(\);/g) ?? [];
  assert(okReturns.length >= 4, `expected the shared answer on every path, saw ${okReturns.length}`);
  assertFalse(
    /already subscribed/i.test(stripComments(FN)),
    'naming the existing-subscriber case is exactly the leak',
  );
});

Deno.test('the hook shows the function answer rather than inventing one', () => {
  assert(/supabase\.functions\.invoke\(\s*\n?\s*"newsletter-subscribe"/.test(HOOK));
  assert(/result\?\.message/.test(HOOK));
  // The insert this replaces is gone, and with it the 23505 branch.
  const hookCode = stripComments(HOOK);
  assertFalse(/from\('newsletter_subscribers'\)/.test(hookCode));
  assertFalse(/23505/.test(hookCode));
});

Deno.test('the public signup endpoint is rate limited, since no caller can be verified', () => {
  assert(/\[functions\.newsletter-subscribe\]\s*\nverify_jwt = false/.test(CONFIG));
  assert(/checkRateLimit\(req, \{/.test(FN));
  assert(/max: 5,/.test(FN));
});

Deno.test('a failed send clears the cooldown so the address can retry', () => {
  assert(
    /\.update\(\{ confirm_sent_at: null \}\)/.test(FN),
    'a cooldown held after a failed send locks someone out of a mail they never got',
  );
});

Deno.test('the confirmation email is transactional, not marketing', () => {
  // It is the message that establishes consent, so it must not carry a
  // marketing unsubscribe footer for a subscription that does not exist yet.
  assert(/category: "transactional"/.test(FN));
});

// --------------------------------------------------------------------------
// the digest
// --------------------------------------------------------------------------

Deno.test('the weekly digest reads status and refuses anything but active', () => {
  assert(/\.select\("status, unsubscribe_token"\)/.test(DIGEST));
  assert(
    /if \(subscriberRow && subscriberRow\.status !== "active"\)/.test(DIGEST),
    'unsubscribed, bounced and pending are all do-not-send',
  );
  // A recipient with no row keeps working: weekly_digest_enabled is its own
  // opt-in and predates this table.
  assert(/subscriberRow &&/.test(DIGEST), 'a missing row must not block the send');
});

Deno.test('a failed subscriber read stops the send rather than assuming consent', () => {
  assert(/newsletter_subscribers read failed/.test(DIGEST));
});
