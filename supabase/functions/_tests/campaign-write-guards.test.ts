/**
 * Server-side write guards for advertiser and business rows (business plan
 * WP4 items 3-6). No Postgres here, so these read the migrations and pin the
 * rules in their text; check-migrations-parse puts the same files through the
 * real grammar. Behaviour was exercised once against a scratch Postgres 16
 * with stubbed auth.role()/auth.uid(); the owner has to repeat that on apply.
 *
 * What each rule is for:
 *   - campaigns: the browser may create a DRAFT and rename or re-date it while
 *     it is one. Status, money, Stripe ids, pause and renewal state belong to
 *     the checkout function, the webhook and the self-service RPCs.
 *   - campaign_creatives: approval is of specific content. An owner cannot
 *     approve their own creative, set its public image_url, or keep an
 *     approval after changing what the ad says.
 *   - ad-creatives bucket: approved artwork cannot be overwritten by its owner.
 *   - analytics RPCs: counted in the database, and only for the owner.
 *   - business rows: an owner cannot verify, feature or price themselves, and
 *     a submission cannot arrive approved or pre-scored.
 */

import { strict as assert } from 'node:assert';

const MIGRATIONS = new URL('../../migrations/', import.meta.url);
const read = (name: string) => Deno.readTextFile(new URL(name, MIGRATIONS));

/** SQL with line comments removed, so a rule mentioned only in prose does not pass. */
const code = async (name: string) => (await read(name)).replace(/--[^\n]*/g, '');

const GUARDS = '20260928000002_campaign_write_guards.sql';
const BUCKET = '20260928000003_ad_creatives_public_bucket_owner_writes.sql';
const ANALYTICS = '20260928000004_campaign_analytics_owner_rpcs.sql';
const BUSINESS = '20260928000005_business_self_write_guards.sql';

function fnBody(sql: string, name: string): string {
  const m = sql.match(
    new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`),
  );
  assert.ok(m, `${name} must be defined`);
  return m[0];
}

/** The quoted column names in the first ARRAY[...] after `marker`. */
function arrayAfter(body: string, marker: RegExp): string[] {
  const at = body.search(marker);
  assert.ok(at >= 0, `marker ${marker} not found`);
  const m = body.slice(at).match(/ARRAY\[([\s\S]*?)\]/);
  assert.ok(m, 'an ARRAY[...] follows the marker');
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
}

// ---------------------------------------------------------------------------
// Who is trusted
// ---------------------------------------------------------------------------

Deno.test('trust is the service role, a SECURITY DEFINER context, or an admin', async () => {
  for (const file of [GUARDS, BUSINESS]) {
    const body = fnBody(await code(file), 'server_write_is_trusted');
    assert.match(body, /coalesce\(auth\.role\(\), ''\) = 'service_role'/);
    assert.match(body, /current_user NOT IN \('anon', 'authenticated'\)/);
    assert.match(body, /public\.is_admin\(\)/);
    // As a definer, current_user would be the owner for EVERY caller.
    assert.match(body, /SECURITY INVOKER/);
    assert.doesNotMatch(body, /SECURITY DEFINER/);
  }
  // Defined identically in both files so either can be applied alone.
  assert.equal(
    fnBody(await code(GUARDS), 'server_write_is_trusted'),
    fnBody(await code(BUSINESS), 'server_write_is_trusted'),
  );
});

Deno.test('every guard trigger function is SECURITY INVOKER and checks trust first', async () => {
  const pairs: Array<[string, string]> = [
    [GUARDS, 'guard_campaign_writes'],
    [GUARDS, 'guard_campaign_creative_writes'],
    [BUSINESS, 'guard_business_profile_writes'],
    [BUSINESS, 'guard_partnership_application_writes'],
    [BUSINESS, 'guard_user_submitted_event_writes'],
  ];
  for (const [file, name] of pairs) {
    const body = fnBody(await code(file), name);
    assert.match(body, /SECURITY INVOKER/, `${name} must not be a definer`);
    assert.doesNotMatch(body, /SECURITY DEFINER/, name);
    const trust = body.indexOf('public.server_write_is_trusted()');
    assert.ok(trust > 0, `${name} consults the trust check`);
    assert.ok(trust < body.indexOf("TG_OP = 'INSERT'"), `${name} checks trust before anything else`);
  }
});

// ---------------------------------------------------------------------------
// campaigns
// ---------------------------------------------------------------------------

Deno.test('campaigns: an insert is a draft with no Stripe state', async () => {
  const sql = await code(GUARDS);
  const body = fnBody(sql, 'guard_campaign_writes');
  assert.match(body, /NEW\.status := 'draft';/);
  for (const col of ['stripe_session_id', 'stripe_payment_intent_id', 'paused_at', 'days_remaining_at_pause', 'original_campaign_id']) {
    assert.match(body, new RegExp(`'${col}', NULL`), `${col} is nulled on insert`);
  }
  assert.match(sql, /BEFORE INSERT OR UPDATE ON public\.campaigns/);
});

Deno.test('campaigns: an update to a server-owned column is refused with 42501', async () => {
  const body = fnBody(await code(GUARDS), 'guard_campaign_writes');
  const refused = arrayAfter(body, /-- UPDATE|v_old := to_jsonb\(OLD\);/);
  for (const col of [
    'status',
    'total_cost',
    'stripe_session_id',
    'stripe_payment_intent_id',
    'paused_at',
    'days_remaining_at_pause',
    'renewal_eligible',
    'original_campaign_id',
  ]) {
    assert.ok(refused.includes(col), `${col} is refused`);
  }
  assert.match(body, /IS DISTINCT FROM \(v_old -> v_col\)/, 'compared as jsonb so absent columns do not error');
  assert.match(body, /can only be changed by the server'[\s\S]*?ERRCODE = '42501'/);
});

Deno.test('campaigns: dates are the owner\'s only while the campaign is a draft', async () => {
  const body = fnBody(await code(GUARDS), 'guard_campaign_writes');
  assert.match(
    body,
    /IF OLD\.status::text <> 'draft' AND \(\s*NEW\.start_date IS DISTINCT FROM OLD\.start_date\s*OR NEW\.end_date IS DISTINCT FROM OLD\.end_date/,
  );
  assert.match(body, /only be changed while the campaign is a draft'\s*USING ERRCODE = '42501'/);
});

Deno.test('campaigns: the self-service RPCs and sync_campaign_total_cost stay allowed', async () => {
  // They are SECURITY DEFINER, which is what the trust check keys on. If any of
  // them stopped being one, the guard would start refusing its writes.
  const defs: Array<[string, string]> = [
    ['20260920000003_campaign_self_service.sql', 'cancel_campaign'],
    ['20260920000003_campaign_self_service.sql', 'set_campaign_paused'],
    ['20260920000004_campaign_renewal.sql', 'renew_campaign'],
    ['20260902000008_campaign_pricing_authority.sql', 'sync_campaign_total_cost'],
  ];
  for (const [file, name] of defs) {
    const body = fnBody(await code(file), name);
    assert.match(body, /SECURITY DEFINER/, `${name} must stay SECURITY DEFINER`);
  }
});

// ---------------------------------------------------------------------------
// campaign_creatives
// ---------------------------------------------------------------------------

Deno.test('creatives: an insert is unapproved, unreviewed and has no public url', async () => {
  const body = fnBody(await code(GUARDS), 'guard_campaign_creative_writes');
  assert.match(body, /NEW\.is_approved := false;/);
  assert.match(body, /NEW\.image_url := NULL;/);
  for (const col of ['reviewed_by', 'reviewed_at', 'rejection_reason', 'auto_review_reasons', 'auto_review_checks']) {
    assert.match(body, new RegExp(`'${col}', NULL`), `${col} is nulled on insert`);
  }
  assert.match(body, /'auto_reviewed', false/);
});

Deno.test('creatives: review columns and image_url cannot be written by the owner', async () => {
  const body = fnBody(await code(GUARDS), 'guard_campaign_creative_writes');
  const refused = arrayAfter(body, /v_old := to_jsonb\(OLD\);/);
  for (const col of ['is_approved', 'image_url', 'reviewed_by', 'reviewed_at', 'rejection_reason', 'campaign_id']) {
    assert.ok(refused.includes(col), `${col} is refused`);
  }
  assert.match(body, /can only be changed by review'[\s\S]*?ERRCODE = '42501'/);
});

Deno.test('creatives: changing the content sends it back to review', async () => {
  const body = fnBody(await code(GUARDS), 'guard_campaign_creative_writes');
  const resets = arrayAfter(body, /can only be changed by review'[\s\S]*?END LOOP;/);
  for (const col of ['title', 'description', 'link_url', 'cta_text', 'review_path']) {
    assert.ok(resets.includes(col), `a change to ${col} resets approval`);
  }
  const resetAt = body.lastIndexOf('NEW.is_approved := false;');
  assert.ok(resetAt > body.indexOf("'review_path'"), 'the reset follows the content comparison');
});

// ---------------------------------------------------------------------------
// ad-creatives bucket
// ---------------------------------------------------------------------------

Deno.test('the public bucket has no owner write policy left', async () => {
  const sql = await code(BUCKET);
  for (const name of [
    'Users can upload to own campaigns',
    'Users can update own ad creatives',
    'Users can delete own ad creatives',
  ]) {
    assert.match(sql, new RegExp(`DROP POLICY IF EXISTS "${name}" ON storage\\.objects;`));
  }
  // Reads and the admin publish path are not touched.
  assert.doesNotMatch(sql, /Users can view own ad creatives|Admins can manage all ad creatives|Public can view approved ads/);
  assert.doesNotMatch(sql, /CREATE POLICY/);
});

// ---------------------------------------------------------------------------
// analytics RPCs
// ---------------------------------------------------------------------------

Deno.test('campaign analytics RPCs check the owner and are not granted to anon', async () => {
  const sql = await code(ANALYTICS);
  for (const [name, args] of [
    ['get_campaign_analytics_summary', 'uuid, date, date'],
    ['get_campaign_delivery', 'uuid, date, date'],
  ]) {
    const body = fnBody(sql, name);
    assert.match(body, /SET search_path = public, pg_temp/, `${name} pins search_path`);
    assert.match(body, /c\.user_id = auth\.uid\(\)/, `${name} checks ownership`);
    assert.match(body, /public\.is_admin\(\)/, `${name} lets admins through`);
    assert.match(body, /ERRCODE = '42501'/, `${name} refuses with 42501`);
    const esc = args.replace(/[(),]/g, (c) => `\\${c}`);
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\(${esc}\\) FROM PUBLIC;`));
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\(${esc}\\) FROM anon;`));
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\(${esc}\\) TO authenticated`));
  }
});

Deno.test('the summary keeps its signature and return columns', async () => {
  const body = fnBody(await code(ANALYTICS), 'get_campaign_analytics_summary');
  assert.match(body, /p_campaign_id UUID,\s*p_start_date DATE DEFAULT NULL,\s*p_end_date DATE DEFAULT NULL/);
  assert.match(
    body,
    /RETURNS TABLE \(\s*total_impressions BIGINT,\s*total_clicks BIGINT,\s*avg_ctr DECIMAL,\s*total_cost DECIMAL,\s*unique_viewers BIGINT,\s*days_active INTEGER\s*\)/,
  );
});

Deno.test('delivery is grouped in the database, per day and creative', async () => {
  const body = fnBody(await code(ANALYTICS), 'get_campaign_delivery');
  assert.match(body, /RETURNS TABLE \(\s*date date,\s*creative_id uuid,\s*impressions bigint,\s*clicks bigint\s*\)/);
  assert.match(body, /FROM public\.ad_impressions i[\s\S]*?GROUP BY i\.date, i\.creative_id/);
  assert.match(body, /FROM public\.ad_clicks k[\s\S]*?GROUP BY k\.date, k\.creative_id/);
  assert.doesNotMatch(body, /session_id|ip_address|user_agent/, 'no visitor data leaves the function');
});

Deno.test('placement delivery is aggregate-only, 30 days, and public', async () => {
  const sql = await code(ANALYTICS);
  const body = fnBody(sql, 'get_placement_delivery');
  assert.match(body, /current_date - 29/, 'the last 30 days, today included');
  assert.match(body, /count\(DISTINCT i\.date\)/, 'days with data, for the MIN_DATA_DAYS floor');
  assert.doesNotMatch(body, /campaign_id|session_id|user_id|ip_address/, 'nothing per campaign or per visitor');
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.get_placement_delivery\(\) TO anon, authenticated/);
});

// ---------------------------------------------------------------------------
// business rows
// ---------------------------------------------------------------------------

Deno.test('business_profiles: status, feature, tier, fee and contract are pinned', async () => {
  const sql = await code(BUSINESS);
  const body = fnBody(sql, 'guard_business_profile_writes');
  for (const [col, insertValue] of [
    ['verification_status', "'pending'"],
    ['is_featured', 'false'],
    ['partnership_tier', "'basic'"],
    ['monthly_fee', '0'],
    ['contract_start_date', 'NULL'],
    ['contract_end_date', 'NULL'],
  ]) {
    assert.ok(body.includes(`NEW.${col} := ${insertValue};`), `${col} is set on insert`);
    assert.ok(body.includes(`NEW.${col} := OLD.${col};`), `${col} is kept on update`);
  }
  assert.match(sql, /BEFORE INSERT OR UPDATE ON public\.business_profiles/);
});

Deno.test('partnership_applications: status and review columns are pinned', async () => {
  const sql = await code(BUSINESS);
  const body = fnBody(sql, 'guard_partnership_application_writes');
  assert.ok(body.includes("NEW.status := 'pending';"));
  for (const col of ['status', 'admin_notes', 'reviewed_by', 'reviewed_at']) {
    assert.ok(body.includes(`NEW.${col} := OLD.${col};`), `${col} is kept on update`);
  }
  for (const col of ['admin_notes', 'reviewed_by', 'reviewed_at']) {
    assert.ok(body.includes(`NEW.${col} := NULL;`), `${col} is nulled on insert`);
  }
  assert.match(sql, /BEFORE INSERT OR UPDATE ON public\.partnership_applications/);
});

Deno.test('user_submitted_events: a submission arrives pending and unscored', async () => {
  const sql = await code(BUSINESS);
  const body = fnBody(sql, 'guard_user_submitted_event_writes');
  assert.ok(body.includes("NEW.status := 'pending';"));
  for (const col of ['admin_notes', 'admin_reviewed_by']) {
    assert.ok(body.includes(`NEW.${col} := NULL;`), `${col} is nulled on insert`);
    assert.ok(body.includes(`NEW.${col} := OLD.${col};`), `${col} is kept on update`);
  }
  assert.match(body, /'auto_decided', false/, 'auto_decided is NOT NULL, so false rather than null');
  assert.match(body, /'quality_score', NULL/);
  assert.match(body, /'quality_score', to_jsonb\(OLD\) -> 'quality_score'/);
  assert.match(sql, /BEFORE INSERT OR UPDATE ON public\.user_submitted_events/);
});

Deno.test('user_submitted_events: length checks match the form and skip existing rows', async () => {
  const sql = await code(BUSINESS);
  assert.match(sql, /CHECK \(char_length\(title\) <= 200\) NOT VALID/);
  assert.match(sql, /CHECK \(description IS NULL OR char_length\(description\) <= 5000\) NOT VALID/);

  const form = await Deno.readTextFile(new URL('../../../src/components/EventSubmissionForm.tsx', import.meta.url));
  assert.match(form, /register\("title", \{[^}]*maxLength: \{ value: 200/);
  assert.match(form, /register\("description", \{[^}]*maxLength: \{ value: 5000/);
});
