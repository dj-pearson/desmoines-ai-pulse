/**
 * Deals have an owner, and redemptions have a ledger (WEB-SEC-033).
 *
 * Two defects with one cause: nobody owned the deals module.
 *
 * The INSERT policy was `auth.role() = 'authenticated'` under a policy NAMED
 * "Business owners and admins can insert deals" -- a name describing an intent
 * the predicate did not implement. deals has a public SELECT policy for
 * anything inside its date window, so any signed-in account could publish a
 * live deal.
 *
 * increment_deal_redemption was SECURITY DEFINER, granted to anon, and did
 * `redemption_count = redemption_count + 1` with no record of who claimed. A
 * loop inflated every card, and afterwards nothing could distinguish an
 * inflated count from a real one.
 */

import { assert, assertFalse } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const REPO = new URL('../../../', import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, REPO));
const MIGRATION = 'supabase/migrations/20260902000013_deal_redemptions_and_insert_policy.sql';

Deno.test('inserting a deal requires an admin role', async () => {
  const sql = await read(MIGRATION);

  assert(
    /DROP POLICY IF EXISTS "Business owners and admins can insert deals" ON public\.deals;/.test(sql),
    'the permissive policy must be removed, not merely shadowed -- PERMISSIVE policies OR together',
  );
  const policy = sql.slice(sql.indexOf('CREATE POLICY "Admins can insert deals"'));
  assert(/role IN \('admin', 'root_admin'\)/.test(policy.slice(0, 400)), 'admins only');
  assertFalse(
    /auth\.role\(\) = 'authenticated'/.test(policy.slice(0, 400)),
    'being signed in is not an authorisation',
  );
});

Deno.test('no shipped client inserts deals, which is what makes the tightening legal', async () => {
  // CLAUDE.md forbids tightening in a single release; the exception it names is
  // a write no shipped binary performs. This is that check, kept executable so
  // it stops being an assertion in a comment.
  const ios = await read('ios/DesMoinesInsider/Services/DealsService.swift');
  const android = await read(
    'android/app/src/main/java/com/desmoines/aipulse/data/remote/DealsRemoteDataSource.kt',
  );
  for (const [name, src] of [['iOS', ios], ['Android', android]] as const) {
    assertFalse(/\.insert\(/.test(src), `${name} must not insert deals`);
  }
});

Deno.test('the RPC keeps its exact signature and parameter name', async () => {
  // PostgREST resolves named arguments, so the NAME is part of the contract:
  // iOS sends `deal_id`, Android sends @SerialName("deal_id").
  const sql = await read(MIGRATION);
  assert(
    /CREATE OR REPLACE FUNCTION public\.increment_deal_redemption\(deal_id uuid\)\s*\n\s*RETURNS integer/.test(sql),
    'same parameter name, same return type',
  );
  assert(
    /GRANT EXECUTE ON FUNCTION public\.increment_deal_redemption\(uuid\) TO anon, authenticated;/.test(sql),
    'the grant must survive CREATE OR REPLACE -- a logged-out visitor claims deals',
  );

  const ios = await read('ios/DesMoinesInsider/Services/DealsService.swift');
  assert(/let deal_id: String/.test(ios), 'iOS still sends deal_id');
  const android = await read(
    'android/app/src/main/java/com/desmoines/aipulse/data/remote/DealsRemoteDataSource.kt',
  );
  assert(/@SerialName\("deal_id"\)/.test(android), 'Android still sends deal_id');
});

Deno.test('the same subject redeeming twice counts once', async () => {
  // The property AC5 asks for. Two unique indexes plus ON CONFLICT DO NOTHING
  // are what enforce it, and the count is read back from the ledger rather than
  // incremented -- so a retry, a double-submit and a replayed request all
  // converge on the same number.
  const sql = await read(MIGRATION);

  assert(
    /CREATE UNIQUE INDEX IF NOT EXISTS deal_redemptions_user_unique\s*\n\s*ON public\.deal_redemptions \(deal_id, user_id\)\s*\n\s*WHERE user_id IS NOT NULL;/.test(sql),
    'one row per account per deal',
  );
  assert(
    /CREATE UNIQUE INDEX IF NOT EXISTS deal_redemptions_session_unique\s*\n\s*ON public\.deal_redemptions \(deal_id, session_hash\)\s*\n\s*WHERE user_id IS NULL AND session_hash IS NOT NULL;/.test(sql),
    'one row per anonymous bucket per deal',
  );
  assert(/ON CONFLICT DO NOTHING/.test(sql), 'a repeat claim must be a no-op');

  assert(
    /SELECT count\(\*\) INTO v_count\s*\n\s*FROM public\.deal_redemptions r/.test(sql),
    'the count must be derived from the ledger',
  );
  assertFalse(
    /redemption_count = COALESCE\(redemption_count, 0\) \+ 1/.test(sql),
    'the bare increment is what a loop exploited; it must not survive',
  );
});

Deno.test('an anonymous claim is bucketed without storing a recoverable IP', async () => {
  const sql = await read(MIGRATION);

  // IPv4 is a 32-bit space, so an UNSALTED hash of an address is reversible by
  // brute force in seconds -- the table would be a log of visitor IPs in all
  // but name.
  assert(/deal_redemption_salt/.test(sql), 'a per-install salt must exist');
  assert(
    /gen_random_bytes\(32\)/.test(sql),
    'the salt must be generated, not a constant in the migration',
  );
  assert(
    /COALESCE\(v_salt, ''\) \|\| '\|' \|\|/.test(sql),
    'the salt must be mixed into the hash',
  );
  assert(/'sha256'/.test(sql), 'sha256, not md5');

  // And the salt itself must not be readable by a client.
  const saltBlock = sql.slice(
    sql.indexOf('CREATE TABLE IF NOT EXISTS public.deal_redemption_salt'),
    sql.indexOf('CREATE TABLE IF NOT EXISTS public.deal_redemptions'),
  );
  assert(/ENABLE ROW LEVEL SECURITY/.test(saltBlock));
  assert(/REVOKE ALL ON public\.deal_redemption_salt FROM anon, authenticated;/.test(saltBlock));
  assertFalse(/CREATE POLICY/.test(saltBlock), 'RLS on with no policy means nobody reads it');
});

Deno.test('missing request headers degrade instead of erroring', async () => {
  // A direct psql call has no request.headers GUC. Raising there would make the
  // function unusable from a migration, a backfill or a support session.
  const sql = await read(MIGRATION);
  assert(/current_setting\('request\.headers', true\)/.test(sql), 'the GUC read must be optional');
  assert(/EXCEPTION WHEN OTHERS THEN\s*\n\s*v_headers := NULL;/.test(sql));
});

Deno.test('the ledger is writable only through the definer function', async () => {
  const sql = await read(MIGRATION);
  const ledger = sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS public.deal_redemptions'));

  assert(/ALTER TABLE public\.deal_redemptions ENABLE ROW LEVEL SECURITY;/.test(ledger));
  // A client able to INSERT directly could forge a user_id, which is the whole
  // thing the ledger exists to make trustworthy.
  assertFalse(
    /CREATE POLICY[^;]*ON public\.deal_redemptions\s*\n?\s*FOR INSERT/.test(ledger),
    'there must be no INSERT policy',
  );
  assert(/FOR SELECT USING \(user_id IS NOT NULL AND user_id = auth\.uid\(\)\)/.test(ledger));
  assert(/"Admins read all redemptions"/.test(ledger), 'admins need to answer "who claimed this"');
});

Deno.test('an account deletion does not silently reduce a count', async () => {
  const sql = await read(MIGRATION);
  assert(
    /user_id uuid REFERENCES auth\.users\(id\) ON DELETE SET NULL/.test(sql),
    'SET NULL, not CASCADE',
  );
  assert(
    /CONSTRAINT deal_redemptions_subject_present/.test(sql),
    'a row must always name either an account or a bucket',
  );
});
