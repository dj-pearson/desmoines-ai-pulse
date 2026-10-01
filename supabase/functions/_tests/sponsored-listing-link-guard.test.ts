/**
 * A sponsored listing is linked through a checked RPC
 * (NON_CORE_REVIEW_2026-09 WP3, business plan D12 first half).
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_tests/sponsored-listing-link-guard.test.ts
 *
 * The browser inserted into sponsored_listing_links under a policy that
 * checked only campaign ownership: any number of links, on a paid or running
 * campaign, for a listing that might not exist.
 */
import { assert, assertFalse } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const REPO = new URL('../../../', import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, REPO));
const MIGRATION = 'supabase/migrations/20261003000006_link_sponsored_listing.sql';

Deno.test('link_sponsored_listing refuses what the policy let through', async () => {
  const sql = (await read(MIGRATION)).replace(/--[^\n]*/g, '');
  assert(/SECURITY DEFINER/.test(sql));
  assert(/public\.is_admin\(\) OR \(auth\.uid\(\) IS NOT NULL AND auth\.uid\(\) = c\.user_id\)/.test(sql), 'owner or admin');
  assert(/IF c\.status::text <> 'draft' THEN/.test(sql), 'draft only');
  assert(/placement_type::text = 'sponsored_listing'/.test(sql) && /IF v_placements = 0 THEN/.test(sql), 'needs a sponsored placement');
  assert(/IF v_links >= v_placements THEN/.test(sql), 'one link per sponsored placement');
  assert(/PERFORM 1 FROM public\.events WHERE id = p_listing_id;/.test(sql), 'the event must exist');
  assert(/PERFORM 1 FROM public\.restaurants WHERE id = p_listing_id;/.test(sql), 'the restaurant must exist');
  assert(/REVOKE ALL ON FUNCTION public\.link_sponsored_listing\(uuid, text, uuid\) FROM anon;/.test(sql));
});

Deno.test('the old INSERT policy is left for a later release', async () => {
  // Tightening RLS for a shipped writer in the same release as its
  // replacement is not allowed (CLAUDE.md, Backward Compatibility).
  const sql = (await read(MIGRATION)).replace(/--[^\n]*/g, '');
  assertFalse(/DROP POLICY/i.test(sql));
  assertFalse(/ALTER POLICY/i.test(sql));
});

Deno.test('/advertise links through the RPC, falling back only when it is missing', async () => {
  const page = await read('src/pages/Advertise.tsx');
  assertFalse(/from\("sponsored_listing_links"\)\.insert/.test(page), 'the page no longer inserts directly');
  assert(/linkSponsoredListing\(campaignId,/.test(page));

  const hook = await read('src/hooks/useCampaigns.ts');
  const fn = hook.slice(hook.indexOf('export async function linkSponsoredListing('));
  assert(/supabase\.rpc\("link_sponsored_listing"/.test(fn));
  const rpc = fn.indexOf('link_sponsored_listing');
  const guard = fn.indexOf('if (error.code !== "PGRST202") return');
  const insert = fn.indexOf('.from("sponsored_listing_links").insert(');
  assert(rpc < guard && guard < insert, 'the insert runs only after a PGRST202 from the RPC');
});
