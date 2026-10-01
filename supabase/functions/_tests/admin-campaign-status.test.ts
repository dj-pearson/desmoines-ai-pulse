/**
 * An admin changes a campaign's status through one audited RPC
 * (NON_CORE_REVIEW_2026-09 WP3).
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_tests/admin-campaign-status.test.ts
 *
 * "End Early" wrote is_sponsored and campaigns.status from the browser, with
 * no audit and no notice; the detail page had no status control at all.
 * No Postgres here: the SQL is pinned textually.
 */
import { assert, assertFalse } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const REPO = new URL('../../../', import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, REPO));
const MIGRATION = 'supabase/migrations/20261003000005_admin_set_campaign_status.sql';

function fnBody(sql: string): string {
  const m = sql.match(/CREATE OR REPLACE FUNCTION public\.admin_set_campaign_status\([\s\S]*?\n\$\$;/);
  assert(m, 'the migration must define admin_set_campaign_status');
  return m[0].replace(/--[^\n]*/g, '');
}

Deno.test('admin only, three statuses, a reason required', async () => {
  const body = fnBody(await read(MIGRATION));
  assert(/SECURITY DEFINER/.test(body));
  assert(/IF v_admin IS NULL OR NOT public\.is_admin\(\) THEN/.test(body), 'anonymous and non-admin callers are refused');
  assert(/p_status NOT IN \('paused', 'active', 'cancelled'\)/.test(body), 'only pause, resume and cancel');
  assert(/IF v_reason IS NULL THEN/.test(body), 'a blank reason is refused');
  assert(/FOR UPDATE/.test(body), 'the row is locked while the transition is decided');
});

Deno.test('the transitions are the allowed ones', async () => {
  const body = fnBody(await read(MIGRATION));
  assert(/IF v_from <> 'active' THEN\s*RAISE EXCEPTION 'admin_set_campaign_status: only an active campaign can be paused/.test(body));
  assert(/IF v_from <> 'paused' THEN\s*RAISE EXCEPTION 'admin_set_campaign_status: only a paused campaign can be resumed/.test(body),
    "'active' is reachable only from paused; starting a campaign is activate_campaign's job");
  assert(/v_from NOT IN \('draft', 'pending_payment', 'pending_creative', 'pending_review', 'active', 'paused'\)/.test(body),
    'completed, refunded, rejected and cancelled campaigns cannot be cancelled');
  assert(/end_date = \(v_today \+ coalesce\(c\.days_remaining_at_pause, 0\)\)::date/.test(body), 'resume restores the banked days');
  assertFalse(/is_sponsored/.test(body), 'the status trigger owns the sponsorship flag');
});

Deno.test('every change is audited and the advertiser is told', async () => {
  const sql = await read(MIGRATION);
  const body = fnBody(sql);
  assert(/INSERT INTO public\.admin_action_logs/.test(body));
  assert(/INSERT INTO public\.campaign_notifications[\s\S]*email_pending\)[\s\S]*true\s*\);/.test(body));
  for (const t of ['campaign_paused', 'campaign_resumed', 'campaign_cancelled']) {
    assert(new RegExp(`'${t}'`).test(body), `${t} notice`);
    assert(new RegExp(`CHECK \\(notification_type IN \\([\\s\\S]*'${t}'[\\s\\S]*\\)\\) NOT VALID;`).test(sql), `${t} is allowed by the CHECK`);
  }
  // Widening only: every earlier type is still allowed.
  for (const t of ['campaign_created', 'payment_received', 'creative_deadline_warning', 'checkout_expired', 'campaign_refunded']) {
    assert(new RegExp(`'${t}'`).test(sql), `${t} must stay allowed`);
  }
  assert(/REVOKE ALL ON FUNCTION public\.admin_set_campaign_status\(uuid, text, text\) FROM anon;/.test(sql));
});

Deno.test('the admin pages use the RPC, not direct writes', async () => {
  const hook = await read('src/hooks/useAdminCampaigns.ts');
  assert(/supabase\.rpc\(\s*"admin_set_campaign_status"/.test(hook));

  const list = await read('src/pages/AdminCampaigns.tsx');
  const endEarly = list.slice(list.indexOf('const handleEndSponsorshipEarly'), list.indexOf('const formatCurrency'));
  assert(/setCampaignStatus\(\s*row\.campaign_id,\s*'cancelled'/.test(endEarly), 'End Early cancels through the RPC');
  assertFalse(/\.update\(/.test(endEarly), 'and writes nothing itself');

  const detail = await read('src/pages/AdminCampaignDetail.tsx');
  assert(/setCampaignStatus\(campaignId, statusAction, statusReason\.trim\(\)\)/.test(detail));
});
