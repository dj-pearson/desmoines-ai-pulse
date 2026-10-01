/**
 * Which ad is served, and on which day (NON_CORE_REVIEW_2026-09 WP3).
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_tests/campaign-ad-serving.test.ts
 *
 * get_active_ads sorted by campaign id before LIMIT 1, so the lowest UUID in a
 * placement took every impression, and it compared dates in UTC, so a Des
 * Moines campaign started and stopped at 7pm the evening before. No Postgres
 * here: the SQL is pinned textually and check-migrations-parse checks it
 * parses.
 */
import { assert, assertEquals, assertFalse } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const REPO = new URL('../../../', import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, REPO));

const ADS = 'supabase/migrations/20261003000002_get_active_ads_rotation_central_dates.sql';

/** Newest migration that defines public.<name>, by filename order. */
async function newestDefiner(name: string): Promise<string> {
  const re = new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${name}\\s*\\(`, 'i');
  const files: string[] = [];
  for await (const e of Deno.readDir(new URL('supabase/migrations/', REPO))) {
    if (e.name.endsWith('.sql')) files.push(e.name);
  }
  files.sort();
  let newest = '';
  for (const f of files) {
    const sql = (await read(`supabase/migrations/${f}`)).replace(/^\s*--[^\n]*$/gm, '');
    if (re.test(sql)) newest = f;
  }
  return newest;
}

function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '');
}

Deno.test('this file reads the newest get_active_ads', async () => {
  assertEquals(`supabase/migrations/${await newestDefiner('get_active_ads')}`, ADS);
});

Deno.test('get_active_ads picks a random campaign, not the lowest id', async () => {
  const sql = stripComments(await read(ADS));
  // One creative per campaign, then a random campaign.
  assert(/SELECT DISTINCT ON \(c\.id\)[\s\S]*ORDER BY c\.id, RANDOM\(\)\s*\)/.test(sql), 'per-campaign pick inside a CTE');
  assert(/FROM per_campaign pc\s*ORDER BY RANDOM\(\)\s*LIMIT 1;/.test(sql), 'the outer pick is random');
  assertFalse(/ORDER BY c\.id, RANDOM\(\)\s*LIMIT 1/.test(sql), 'the id-ordered LIMIT 1 must be gone');
});

Deno.test('get_active_ads compares campaign dates on the Central calendar', async () => {
  const sql = stripComments(await read(ADS));
  assert(/v_today date := \(now\(\) AT TIME ZONE 'America\/Chicago'\)::date;/.test(sql));
  assert(/c\.start_date::date <= v_today/.test(sql));
  assert(/c\.end_date::date >= v_today/.test(sql));
  assertFalse(/c\.(start|end)_date\s*[<>]=\s*CURRENT_DATE/.test(sql), 'no campaign date may be compared to UTC');
});

Deno.test('get_active_ads keeps its signature and its seven columns', async () => {
  const sql = await read(ADS);
  assert(/public\.get_active_ads\(\s*p_placement_type placement_type,\s*p_session_id TEXT DEFAULT NULL,\s*p_user_id UUID DEFAULT NULL\s*\)/.test(sql));
  assert(
    /RETURNS TABLE\(\s*campaign_id UUID,\s*creative_id UUID,\s*title TEXT,\s*description TEXT,\s*image_url TEXT,\s*link_url TEXT,\s*cta_text TEXT\s*\)/.test(sql),
    'mobile binaries read these columns in this order',
  );
  assert(/SECURITY DEFINER/.test(sql));
  // Both frequency caps survive.
  assert(/ai\.session_id = p_session_id/.test(sql));
  assert(/ai\.user_id = p_user_id/.test(sql));
});
