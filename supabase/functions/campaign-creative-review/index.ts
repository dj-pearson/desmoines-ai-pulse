/**
 * campaign-creative-review (WEB-AUTO-010)
 *
 * Auto-reviews ad creatives so advertisers get a verdict in seconds and the
 * owner only sees creatives the checks couldn't clear. Per creative:
 *   1. image loads + meets the placement's minimum dimensions,
 *   2. target URL is https and resolves (SSRF-guarded, no disallowed scheme),
 *   3. text passes a brand-safety check (Claude when configured),
 *   4. advertiser/campaign is in good standing.
 * All pass -> is_approved=true (proceeds via the normal status flow). Any fail
 * -> stays unapproved with machine-readable reasons (auto_review_reasons) shown
 * in AdminCampaigns. Every decision is audit-logged; sweep mode records the
 * auto-approval rate via the jobRunner.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, getCorsHeaders } from '../_shared/cors.ts';
import { requireAdminOrApiKey } from '../_shared/apiKeyAuth.ts';
import { runJob } from '../_shared/jobRunner.ts';
import { fetchWithTimeout } from '../_shared/fetchWithTimeout.ts';
import { getAnthropicApiKey } from '../_shared/aiConfig.ts';

// Minimum pixel dimensions per placement.
const MIN_DIMS: Record<string, { w: number; h: number }> = {
  top_banner: { w: 728, h: 90 },
  below_fold: { w: 728, h: 90 },
  featured_spot: { w: 300, h: 250 },
  sponsored_listing: { w: 300, h: 250 },
  sidebar: { w: 160, h: 600 },
};

// deno-lint-ignore no-explicit-any
type Supa = any;

function isPrivateHost(host: string): boolean {
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.local') ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}

async function urlResolves(rawUrl: string): Promise<boolean> {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'https:') return false;
    if (isPrivateHost(u.hostname)) return false;
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 6000);
    try {
      let res = await fetchWithTimeout(rawUrl, { method: 'HEAD', redirect: 'follow', signal: ac.signal });
      if (!res.ok) res = await fetchWithTimeout(rawUrl, { method: 'GET', redirect: 'follow', signal: ac.signal });
      // A redirect that lands on a non-https URL is disallowed.
      if (res.url && !res.url.startsWith('https:')) return false;
      return res.ok;
    } finally {
      clearTimeout(t);
    }
  } catch {
    return false;
  }
}

async function imageLoads(rawUrl: string): Promise<boolean> {
  try {
    const u = new URL(rawUrl);
    if (isPrivateHost(u.hostname)) return false;
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 6000);
    try {
      const res = await fetchWithTimeout(rawUrl, { method: 'HEAD', signal: ac.signal });
      const type = res.headers.get('content-type') || '';
      return res.ok && type.startsWith('image/');
    } finally {
      clearTimeout(t);
    }
  } catch {
    return false;
  }
}

/** Claude brand-safety check. Returns true (safe) when no API key is configured. */
async function brandSafe(text: string): Promise<{ safe: boolean; note: string }> {
  const key = getAnthropicApiKey();
  if (!key) return { safe: true, note: 'skipped (no ANTHROPIC_API_KEY)' };
  if (!text.trim()) return { safe: true, note: 'empty' };
  try {
    const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [
          {
            role: 'user',
            content:
              `You are a brand-safety filter for a family-friendly local events site. ` +
              `Reply with exactly "SAFE" or "UNSAFE". Ad copy: """${text.slice(0, 1500)}"""`,
          },
        ],
      }),
    }, 60_000);
    if (!res.ok) return { safe: true, note: `claude error ${res.status} (failed open)` };
    const data = await res.json();
    const verdict = String(data?.content?.[0]?.text || '').toUpperCase();
    return { safe: !verdict.includes('UNSAFE'), note: verdict.includes('UNSAFE') ? 'flagged by Claude' : 'ok' };
  } catch {
    return { safe: true, note: 'claude exception (failed open)' };
  }
}

/**
 * A URL the reviewer can actually fetch (WEB-LEGAL-011).
 *
 * Approved creatives carry a public image_url. Unapproved ones -- which is
 * every creative this function looks at -- have image_url null and live at
 * review_path in the private ad-creatives-review bucket, so the URL has to be
 * signed. This client holds the service-role key, so the signature always
 * succeeds where the object exists.
 */
async function reviewableImageUrl(supabase: Supa, creative: Record<string, unknown>): Promise<string | null> {
  const publicUrl = creative.image_url as string | null;
  if (publicUrl) return publicUrl;

  const reviewPath = creative.review_path as string | null;
  if (!reviewPath) return null;

  const { data, error } = await supabase.storage
    .from('ad-creatives-review')
    .createSignedUrl(reviewPath, 300);

  // null propagates to 'Missing creative image', which is the right verdict:
  // a creative whose file cannot be read is not reviewable.
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

async function reviewOne(supabase: Supa, creative: Record<string, unknown>) {  const reasons: string[] = [];
  const checks: Record<string, unknown> = {};

  // 1. Image
  //
  // WEB-LEGAL-011: an unapproved creative lives in the PRIVATE
  // ad-creatives-review bucket and its image_url is null until an admin
  // approves it. A plain fetch of a private object 400s, so the review read
  // signs review_path first. Without this the auto-reviewer would report
  // 'Missing creative image' for every creative it was built to check -- and
  // it fails toward REJECTION, so it would block the whole ad product rather
  // than fail quietly.
  const imageUrl = (await reviewableImageUrl(supabase, creative)) as string | null;
  if (!imageUrl) {
    reasons.push('Missing creative image');
    checks.image = false;
  } else {
    const loads = await imageLoads(imageUrl);
    checks.image = loads;
    if (!loads) reasons.push('Image failed to load or is not an image');
    const min = MIN_DIMS[creative.placement_type as string];
    const w = creative.dimensions_width as number | null;
    const h = creative.dimensions_height as number | null;
    if (min && w != null && h != null && (w < min.w || h < min.h)) {
      reasons.push(`Image ${w}x${h} below ${min.w}x${min.h} minimum for ${creative.placement_type}`);
      checks.dimensions = false;
    } else {
      checks.dimensions = true;
    }
  }

  // 2. Target URL
  const linkUrl = creative.link_url as string | null;
  if (!linkUrl) {
    reasons.push('Missing target URL');
    checks.url = false;
  } else {
    const ok = await urlResolves(linkUrl);
    checks.url = ok;
    if (!ok) reasons.push('Target URL is not https or did not resolve');
  }

  // 3. Brand safety
  const text = [creative.title, creative.description, creative.cta_text].filter(Boolean).join('. ');
  const bs = await brandSafe(text);
  checks.brandSafety = bs.note;
  if (!bs.safe) reasons.push('Ad text failed brand-safety review');

  // 4. Advertiser / campaign standing
  let standingOk = true;
  try {
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('status')
      .eq('id', creative.campaign_id)
      .maybeSingle();
    if (campaign && ['rejected', 'cancelled', 'suspended'].includes(String(campaign.status))) {
      standingOk = false;
      reasons.push(`Campaign status is ${campaign.status}`);
    }
  } catch {
    // feature-tolerant: don't fail the creative on a standing-check error
  }
  checks.standing = standingOk;

  const approved = reasons.length === 0;

  await supabase
    .from('campaign_creatives')
    .update({
      is_approved: approved,
      auto_reviewed: true,
      auto_review_reasons: approved ? null : reasons,
      auto_review_checks: checks,
      rejection_reason: approved ? null : reasons.join('; '),
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', creative.id);

  // Audit (best-effort).
  try {
    await supabase.from('security_audit_logs').insert({
      event_type: 'automation',
      action: approved ? 'creative_auto_approved' : 'creative_auto_rejected',
      resource: 'campaign_creatives',
      identifier: String(creative.id),
      severity: 'info',
      details: { checks, reasons },
      user_id: null,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // ignore audit failures
  }

  return approved;
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const origin = req.headers.get('origin') || undefined;
  const corsHeaders = getCorsHeaders(origin);

  // Authz: this runs cost-bearing AI review work, so only the DB trigger / cron
  // sweep (both send Authorization: Bearer <service_role_key>), the shared
  // EDGE_FUNCTION_API_KEY, or an admin JWT may call it. Blocks arbitrary
  // authenticated users from triggering reviews (cost/DoS, metric manipulation).
  const authFail = await requireAdminOrApiKey(req, corsHeaders);
  if (authFail) return authFail;

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase: Supa = createClient(url, serviceKey);

  let payload: { creativeId?: string; mode?: string } = {};
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }

  // Single-creative review (from the insert trigger).
  if (payload.creativeId) {
    const { data: creative, error } = await supabase
      .from('campaign_creatives')
      .select('*')
      .eq('id', payload.creativeId)
      .maybeSingle();
    if (error || !creative) {
      return new Response(JSON.stringify({ success: false, error: 'creative not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const approved = await reviewOne(supabase, creative);
    return new Response(JSON.stringify({ success: true, approved }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Sweep mode (cron) — review unreviewed creatives, record the auto-approval rate.
  const job = await runJob('campaign-creative-review', async (ctx) => {
    const { data, error } = await supabase
      .from('campaign_creatives')
      .select('*')
      .eq('auto_reviewed', false)
      .limit(50);
    if (error) throw error;
    const creatives = (data || []) as Record<string, unknown>[];
    let approved = 0;
    for (const c of creatives) {
      const ok = await reviewOne(supabase, c);
      if (ok) approved++;
      ctx.processed(1);
    }
    const autoApprovalRate = creatives.length > 0 ? approved / creatives.length : 1;
    ctx.meta({ reviewed: creatives.length, approved, autoApprovalRate });
    return { reviewed: creatives.length, approved, autoApprovalRate };
  });

  return new Response(JSON.stringify({ success: job.ok, ...job.result }), {
    status: job.ok ? 200 : 500,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
