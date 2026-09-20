#!/usr/bin/env node
/**
 * Claiming a listing, and the two ways it could hand somebody else's business
 * to a stranger (WEB-ADS-009).
 *
 * THE TWO DIRECTIONS THAT MATTER:
 *
 *   1. A CLAIM MUST NOT VERIFY ITSELF. business_claims has no INSERT policy for
 *      ordinary users, so the only way in is claim_listing, which decides the
 *      status. A direct insert would let anyone write status = 'verified' on a
 *      row naming any listing.
 *
 *   2. RLS RESTRICTS ROWS, NOT COLUMNS. An UPDATE policy scoped to "the listing
 *      you verified" would also let an owner set is_featured, is_sponsored,
 *      sponsored_until, rating and popularity_score - two of which are paid
 *      placement, which would make a claim button a free advertising button.
 *      So there is no UPDATE policy on the listing tables and every owner edit
 *      goes through a fixed column list.
 *
 * NO POSTGRES HERE, so nothing is executed. check-migrations-parse puts all 403
 * migrations through the real Postgres grammar; behaviour needs the owner.
 */
import { readFileSync } from 'node:fs';

const MIGRATION = 'supabase/migrations/20260920000005_business_claims.sql';
// SQL line comments stripped: this migration explains each rule in prose above
// the statement that implements it.
const code = readFileSync(MIGRATION, 'utf8').replace(/^\s*--[^\n]*$/gm, '');

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok    ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};

function body(fn) {
  const i = code.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
  return i === -1 ? '' : code.slice(i, code.indexOf('\n$$;', i));
}

console.log('\na claim cannot verify itself');
{
  check('the table exists', /CREATE TABLE IF NOT EXISTS public\.business_claims/.test(code));
  check('RLS is on', /ALTER TABLE public\.business_claims ENABLE ROW LEVEL SECURITY/.test(code));
  // The only SELECT policy is own-rows-or-admin. A public one would publish who
  // has claimed what, which is commercial information about businesses that
  // never agreed to it.
  check('you can read your own claims', /USING \(auth\.uid\(\) = user_id OR public\.is_admin\(\)\)/.test(code));
  // THE ASSERTION. No INSERT policy for authenticated users anywhere.
  check(
    'there is no INSERT policy an ordinary user could use',
    !/FOR INSERT/.test(code),
    'an insert policy would let a caller write status = verified',
  );
  check('only an admin has a write policy', /CREATE POLICY "business_claims admin write"[\s\S]*?USING \(public\.is_admin\(\)\)/.test(code));
  check('anon cannot call claim_listing', /REVOKE ALL ON FUNCTION public\.claim_listing\(text, uuid\) FROM PUBLIC, anon/.test(code));
}

console.log('\nverification is a real match or it is pending');
{
  const fn = body('claim_listing');
  check('claim_listing exists', fn.length > 0);
  // Both sides have to resolve AND agree. A listing with no website cannot
  // auto-verify anybody, because there is nothing to check against.
  check(
    'verified needs both domains AND equality',
    /v_site_domain IS NOT NULL[\s\S]{0,120}v_email_domain IS NOT NULL[\s\S]{0,120}v_site_domain = v_email_domain/.test(fn),
    'a null-tolerant comparison would verify every listing with no website',
  );
  check('everything else is pending', /ELSE 'pending'/.test(fn));
  // Only a human rejects a claim. The naive form of this - no 'rejected'
  // anywhere in the body - is wrong: the open-claim lookup filters on
  // `status <> 'rejected'`, which is the function READING the value rather
  // than writing it. Assert what it can SET instead.
  check(
    'the only statuses it can set are verified and pending',
    /v_status := CASE[\s\S]{0,200}THEN 'verified'\s*\n?\s*ELSE 'pending'\s*\n?\s*END;/.test(fn),
    fn.slice(fn.indexOf('v_status := CASE'), fn.indexOf('v_status := CASE') + 240),
  );
  check('and it never assigns rejected', !/v_status := 'rejected'|status = 'rejected'/.test(fn));
  check('an already-claimed listing is refused', /this listing is already claimed/.test(fn));
  check('and a second press returns the existing claim', /RETURN v_existing\.status;/.test(fn));
  check('signing in is required', /sign in to claim a listing/.test(fn));
  check('only a real listing type', /NOT IN \('restaurant', 'attraction', 'venue'\)/.test(fn));
  check('one verified owner per listing', /business_claims_one_verified_owner[\s\S]{0,140}WHERE status = 'verified'/.test(code));
}

console.log('\nthe domain reader');
{
  const fn = body('claim_domain_of');
  check('claim_domain_of exists', fn.length > 0);
  check('it reads an email', /position\('@' in v\) > 0/.test(fn));
  check('and a URL, scheme and path stripped', /\^\[a-z\]\[a-z0-9\+\.-\]\*:\/\//.test(fn) && /split_part/.test(fn));
  check('www is not part of the identity', /\^www\\\./.test(fn));
  // A single label cannot identify anybody, and guessing would verify a claim.
  check('a one-label host returns NULL rather than a guess', /array_length\(v_labels, 1\) < 2[\s\S]{0,60}RETURN NULL/.test(fn));
}

console.log('\nan owner edit cannot reach paid placement');
{
  const fn = body('update_claimed_listing');
  check('update_claimed_listing exists', fn.length > 0);
  check('it needs a VERIFIED claim by this user', /status = 'verified'[\s\S]{0,80}user_id = v_user|user_id = v_user[\s\S]{0,80}status = 'verified'/.test(fn));

  // THE WHITELIST. Each of these would be a different kind of problem: two are
  // paid placement, one is other people's opinions.
  for (const forbidden of ['is_featured', 'is_sponsored', 'sponsored_until', 'rating', 'popularity_score']) {
    check(`  ${forbidden} is not editable`, !fn.includes(`'${forbidden}'`), 'it is in the allowed list');
  }
  check('the allowed list is explicit', /v_allowed := ARRAY\['description', 'website', 'phone', 'image_url', 'menu_url'\]/.test(fn));
  // Silently dropping a field is how somebody corrects their hours and never
  // finds out the form threw it away.
  check('an unknown field is REFUSED, not ignored', /is not an owner-editable field/.test(fn));
  check('the column name is quoted as an identifier', /format\('%I = \(\$1 ->> %L\)'/.test(fn));
  check('and the value goes through a parameter', /USING p_patch, p_listing_id/.test(fn));
  // If a policy ever grants UPDATE on these tables, the whitelist stops being
  // the only door.
  check(
    'no UPDATE policy is granted on the listing tables',
    !/ON public\.(restaurants|attractions|known_venues) FOR UPDATE/.test(code),
  );
}

console.log('\nthe admin path');
{
  const fn = body('review_business_claim');
  check('review_business_claim exists', fn.length > 0);
  check('admins only', /IF NOT public\.is_admin\(\) THEN[\s\S]{0,80}not authorized/.test(fn));
  check('it records who decided', /reviewed_by = auth\.uid\(\)/.test(fn));
  check('and refuses a claim id that does not exist', /claim % not found/.test(fn));
}

console.log('\nthe page offers it');
{
  const cta = readFileSync('src/components/business/ClaimListingCta.tsx', 'utf8');
  check('the CTA asks the question', /Own this business\?/.test(cta));
  // PENDING must not read as verified. Most small businesses use a gmail
  // address, so pending is the common case, not the edge one.
  check('a pending claim says a person is checking it', /a person is checking it/.test(cta));
  check('and does not claim the listing is managed', !/You manage this listing[\s\S]{0,200}pending/.test(cta));
  check('a verified owner gets the promote link', /\/advertise\?listing_type=/.test(cta));
  check('a signed-out visitor is sent to sign in', /Sign in to claim/.test(cta));

  for (const [page, kind] of [['src/pages/RestaurantDetails.tsx', 'restaurant'], ['src/pages/AttractionDetails.tsx', 'attraction']]) {
    const src = readFileSync(page, 'utf8');
    check(`${kind} details renders it`, /<ClaimListingCta/.test(src) && src.includes(`listingType="${kind}"`));
  }

  const hook = readFileSync('src/hooks/useBusinessClaim.ts', 'utf8');
  check('the client never inserts a claim itself', !/from\("business_claims" as never\)\s*\n?\s*\.insert/.test(hook));
  check('it calls the function instead', /rpc\("claim_listing" as never/.test(hook));
  // Before the migration is applied the read is 42P01. A throw there would take
  // the whole detail page down.
  check('a failed read renders the page anyway', /return null;/.test(hook));
}

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
