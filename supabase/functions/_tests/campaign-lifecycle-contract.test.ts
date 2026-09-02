/**
 * Campaign lifecycle contract (WEB-ADS-004).
 *
 * Three defects shipped together: the web client wrote a campaign_status label
 * that did not exist (so approval threw 22P02 after is_approved had already
 * committed), the function that activates future-dated campaigns was on no
 * schedule, and approval was two client writes with no transaction between
 * them.
 *
 * This test reads the two migrations that fix it, plus the client hook, and
 * fails when any of the three regresses:
 *   - the enum labels the client writes and reads are not added,
 *   - process_campaign_lifecycle is not scheduled, or is scheduled through
 *     net.http_post (which would put it back behind the missing service-role
 *     key that WEB-OPS-007 documents),
 *   - the approval RPC loses its admin gate or stops routing through
 *     activate_campaign, or the client goes back to writing campaign status
 *     directly.
 */

import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const REPO = new URL('../../../', import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, REPO));

const enumSql = await read('supabase/migrations/20260902000002_campaign_status_pending_review_enum.sql');
const lifecycleSql = await read(
  'supabase/migrations/20260902000003_campaign_lifecycle_schedule_and_atomic_approval.sql',
);
const hook = await read('src/hooks/useAdminCampaigns.ts');
const types = await read('src/integrations/supabase/types.ts');

function functionBody(sql: string, name: string): string {
  const re = new RegExp(
    `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${name}\\s*\\([\\s\\S]*?\\n\\$\\$;`,
    'i',
  );
  const m = sql.match(re);
  assert(m, `migration must define public.${name}`);
  return m[0];
}

Deno.test('campaign_status gains the labels the client already writes and reads', () => {
  for (const label of ['pending_review', 'suspended']) {
    assert(
      new RegExp(`ALTER TYPE public\\.campaign_status ADD VALUE IF NOT EXISTS '${label}';`).test(enumSql),
      `enum migration must add '${label}'`,
    );
  }
  // The enum lives alone in its file: a new label cannot be used in the
  // transaction that adds it, and each migration file is one transaction.
  const statements = enumSql
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('--'));
  assertEquals(statements.length, 2, 'the enum file must contain only the two ALTER TYPE statements');
});

Deno.test('the generated types carry the new labels', () => {
  const enumBlock = types.match(/campaign_status:\s*\n([\s\S]*?)\n\s+\w+:/);
  assert(enumBlock, 'types.ts must declare campaign_status');
  assert(/"pending_review"/.test(enumBlock[1]), 'types.ts campaign_status must include pending_review');
  assert(/"suspended"/.test(enumBlock[1]), 'types.ts campaign_status must include suspended');
});

Deno.test('process_campaign_lifecycle is scheduled daily as pure SQL', () => {
  const schedule = lifecycleSql.match(/cron\.schedule\(\s*'campaign-lifecycle-daily',\s*'([^']+)',\s*\$cron\$([\s\S]*?)\$cron\$/);
  assert(schedule, 'a cron.schedule for campaign-lifecycle-daily must exist');
  const [, cron, body] = schedule;
  assert(/^\d+ \d+ \* \* \*$/.test(cron), `must run once a day, got '${cron}'`);
  assert(/SELECT public\.process_campaign_lifecycle\(\);/.test(body), 'the job body must call the function');
  assert(!/net\.http_post/.test(body), 'must not go through net.http_post: that path needs the service-role key WEB-OPS-007 shows is unset');
  assert(/cron\.unschedule\('campaign-lifecycle-daily'\)/.test(lifecycleSql), 'must be idempotent on re-apply');
  assert(/extname = 'pg_cron'/.test(lifecycleSql), 'must no-op where pg_cron is absent');
});

Deno.test('process_campaign_lifecycle still activates only through activate_campaign', () => {
  const body = functionBody(lifecycleSql, 'process_campaign_lifecycle');
  assert(/PERFORM public\.activate_campaign\(r\.id\)/.test(body));
  assert(!/SET status = 'active'/.test(body), 'the job must not flip status to active on its own');
  assert(/renewal_eligible/.test(body), 'completion must populate renewal_eligible');
  assert(/information_schema\.columns/.test(body), 'the renewal_eligible write must be guarded: the column is not in any migration');
});

Deno.test('approve_campaign_creative is one admin-only transaction that routes through activate_campaign', () => {
  const body = functionBody(lifecycleSql, 'approve_campaign_creative');
  assert(/SECURITY DEFINER/.test(body));
  assert(/auth\.uid\(\) IS NULL OR NOT public\.is_admin\(\)/.test(body), 'must refuse anonymous and non-admin callers');
  assert(/SET is_approved = true/.test(body), 'must mark the creative approved');
  assert(/reviewed_by = auth\.uid\(\)/.test(body), 'the audit trail must name the admin');
  assert(/PERFORM public\.activate_campaign\(v_campaign_id\)/.test(body), 'a reached start date activates through the shared function');
  assert(/SET status = 'pending_review'/.test(body), 'a future start date parks the campaign for the lifecycle job');
  assert(/v_total > 0 AND v_unapproved = 0/.test(body), 'zero creatives must not read as all approved');
  assert(
    /REVOKE ALL ON FUNCTION public\.approve_campaign_creative\(uuid, text\) FROM PUBLIC, anon/.test(lifecycleSql),
  );
});

Deno.test('the admin hook approves through the RPC and never writes campaign status itself', () => {
  const fn = hook.slice(hook.indexOf('const approveCreative = async ('), hook.indexOf('const rejectCreative = async ('));
  assert(fn.length > 0, 'approveCreative must exist ahead of rejectCreative');
  assert(/supabase\.rpc\(\s*"approve_campaign_creative"/.test(fn), 'approval must go through the RPC');
  assert(!/from\("campaign_creatives"\)\s*\.update\(/.test(fn), 'the client must not write is_approved directly');
  assert(!/from\("campaigns"\)\s*\.update\(/.test(fn), 'the client must not write campaign status directly');
  assert(!/"pending_review"/.test(fn), 'the client no longer decides pending_review; the RPC does');
});
