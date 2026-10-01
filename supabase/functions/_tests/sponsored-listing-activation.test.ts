/**
 * Sponsored listing activation contract (WEB-ADS-001).
 *
 * The sponsored_listing placement is sold on /advertise and delivered by a
 * flag on the listing row (events.is_sponsored, restaurants.is_sponsored,
 * sponsored_until). For six months the only writer of that flag was the admin
 * "End Sponsorship Early" button, which sets it to false; nothing ever set it
 * to true, so a paid sponsorship never rendered anywhere.
 *
 * Migration 20260902000001 fixes that with one activation path and a status
 * trigger. This test reads the migration and the client code and fails when:
 *   - the activation function or the trigger goes missing or loses its
 *     SECURITY DEFINER / anon revocation,
 *   - the lifecycle job stops going through activate_campaign (the two paths
 *     drifting apart is the exact failure mode the story names),
 *   - any client or edge function starts writing is_sponsored = true directly
 *     instead of through campaign activation.
 */

import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const REPO = new URL('../../../', import.meta.url);
const MIGRATION = new URL(
  'supabase/migrations/20260902000001_activate_campaign_sponsored_listings.sql',
  REPO,
);

const sql = await Deno.readTextFile(MIGRATION);

/** Body of `CREATE OR REPLACE FUNCTION public.<name>(...)` up to its closing `$$;`. */
function functionBody(name: string): string {
  const re = new RegExp(
    `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${name}\\s*\\([\\s\\S]*?\\n\\$\\$;`,
    'i',
  );
  const m = sql.match(re);
  assert(m, `migration must define public.${name}`);
  return m[0];
}

Deno.test('activate_campaign is SECURITY DEFINER, admin-gated and closed to anon', () => {
  const body = functionBody('activate_campaign');
  assert(/SECURITY DEFINER/.test(body), 'must run as definer to write listing rows');
  assert(/SET search_path = public/.test(body), 'search_path must be pinned');
  assert(/auth\.role\(\)\s*=\s*'anon'/.test(body), 'must refuse anonymous callers inside the body');
  assert(/NOT public\.is_admin\(\)/.test(body), 'a signed-in caller must be an admin');
  assert(
    /REVOKE ALL ON FUNCTION public\.activate_campaign\(uuid\) FROM PUBLIC, anon/.test(sql),
    'EXECUTE must be revoked from PUBLIC and anon',
  );
  assert(
    /GRANT EXECUTE ON FUNCTION public\.activate_campaign\(uuid\) TO authenticated, service_role/.test(sql),
    'admins (authenticated) and the service role must be able to call it',
  );
});

Deno.test('activation sets is_sponsored and sponsored_until on both listing tables', () => {
  const body = functionBody('sync_campaign_sponsorship');
  const setTrue = body.match(/SET is_sponsored = true,\s*sponsored_until = v_until/g) ?? [];
  assertEquals(setTrue.length, 2, 'one flagging UPDATE for events and one for restaurants');
  assert(/UPDATE public\.events e\s+SET is_sponsored = true/.test(body), 'events are flagged');
  assert(/UPDATE public\.restaurants r\s+SET is_sponsored = true/.test(body), 'restaurants are flagged');
  assert(
    /sponsored_until_for\(v_end_date\)/.test(body),
    'sponsored_until must derive from the campaign end_date',
  );
});

Deno.test('completed, cancelled and refunded campaigns clear the flag', () => {
  const body = functionBody('sync_campaign_sponsorship');
  assert(
    /v_status IN \('completed', 'cancelled', 'refunded'\)/.test(body),
    'the three terminal states from the story must clear the sponsorship',
  );
  const setFalse = body.match(/SET is_sponsored = false,\s*sponsored_until = NULL/g) ?? [];
  assertEquals(setFalse.length, 2, 'one clearing UPDATE for events and one for restaurants');
  assert(
    /c2\.status::text = 'active'/.test(body),
    'clearing must respect another active campaign on the same listing',
  );
});

Deno.test('the campaigns status trigger routes every status writer through the sync', () => {
  assert(
    /CREATE TRIGGER trg_campaign_status_sponsorship\s+AFTER INSERT OR UPDATE OF status ON public\.campaigns/.test(sql),
    'trigger must fire on status changes',
  );
  assert(
    /EXECUTE FUNCTION public\.sync_sponsored_listings_on_campaign_status\(\)/.test(sql),
    'trigger must call the sync wrapper',
  );
  const wrapper = functionBody('sync_sponsored_listings_on_campaign_status');
  assert(/PERFORM public\.sync_campaign_sponsorship\(NEW\.id\)/.test(wrapper));
});

Deno.test('process_campaign_lifecycle activates only through activate_campaign', () => {
  const body = functionBody('process_campaign_lifecycle');
  assert(/PERFORM public\.activate_campaign\(r\.id\)/.test(body), 'the job must call activate_campaign');
  assert(
    !/SET status = 'active'/.test(body),
    'the job must not flip status to active on its own; that is how the two paths drift',
  );
  // WEB-ADS-004: pending_review is not an enum label yet. A bare comparison
  // against it raises 22P02 and kills the whole run, which is why the job has
  // never activated anything. Every status comparison goes through ::text.
  // `SET status = ...` is an assignment, not a comparison; only reads are checked.
  const bare = body.match(/(?<!SET )\bstatus\s+(?:IN|=)\s*\(?'/g) ?? [];
  assertEquals(bare, [], `status comparisons must be cast to text: ${bare.join(', ')}`);
  assert(/status::text IN \('pending_review', 'pending_creative'\)/.test(body));
});

Deno.test('activate_campaign accepts a pure sponsored-listing purchase with no creative', () => {
  const body = functionBody('activate_campaign');
  assert(
    /FROM public\.sponsored_listing_links\s+WHERE campaign_id = p_campaign_id/.test(body),
    'must count sponsored_listing_links',
  );
  assert(
    /v_creatives = 0 AND v_links = 0/.test(body),
    'only a campaign with neither a creative nor a listing link is refused',
  );
});

Deno.test('the migration backfills campaigns that already have sponsored links', () => {
  assert(/DO \$\$[\s\S]*sponsored_listing_links l[\s\S]*sync_campaign_sponsorship\(r\.campaign_id\)[\s\S]*END \$\$;/.test(sql));
  assert(/RAISE NOTICE 'WEB-ADS-001 backfill/.test(sql), 'the count must be reported when the owner applies it');
});

/**
 * Nothing outside the database may decide a listing is sponsored. The client
 * un-sponsors (End Early) and reads; activation is the migration's job. A
 * direct `is_sponsored: true` write from a browser or an edge function would
 * bypass the payment and status checks above.
 */
async function* walk(dir: URL, skip: RegExp): AsyncGenerator<URL> {
  for await (const entry of Deno.readDir(dir)) {
    const url = new URL(entry.isDirectory ? `${entry.name}/` : entry.name, dir);
    if (skip.test(url.pathname)) continue;
    if (entry.isDirectory) yield* walk(url, skip);
    else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) yield url;
  }
}

Deno.test('no client or edge-function code writes is_sponsored: true directly', async () => {
  const offenders: string[] = [];
  const skip = /node_modules|__tests__|_tests|\.test\.|\.spec\.|\/dist\//;
  for (const root of ['src/', 'supabase/functions/']) {
    for await (const file of walk(new URL(root, REPO), skip)) {
      const text = await Deno.readTextFile(file);
      if (/is_sponsored\s*:\s*true/.test(text)) {
        offenders.push(file.pathname.replace(REPO.pathname, ''));
      }
    }
  }
  assertEquals(offenders, [], `direct sponsorship writes: ${offenders.join(', ')}`);
});
