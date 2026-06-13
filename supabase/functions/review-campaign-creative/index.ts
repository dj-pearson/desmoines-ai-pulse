/**
 * review-campaign-creative (WEB-AUTO-010)
 *
 * Automated review of advertiser ad creatives. On each creative it runs four
 * checks and only AUTO-APPROVES when every one passes:
 *   1. good_standing  — the owning campaign is in a payable/live state
 *                       (not cancelled / rejected / refunded)
 *   2. image          — the image loads (https, 2xx, image content-type) and its
 *                       stored dimensions match an allowed size for the placement
 *   3. url            — the target link is https, resolves (HEAD->GET, redirects
 *                       followed) and never lands on a disallowed scheme/host
 *   4. brand_safety   — Claude scores the title/description/CTA for brand safety
 *
 * Decision:
 *   - all pass               -> is_approved=true (the same field a human sets);
 *                               the campaign then follows its normal status flow
 *   - any hard check fails    -> stays pending (is_approved untouched) with
 *                               machine-readable reasons for AdminCampaigns
 *   - brand-safety AI errors  -> fail-SAFE: NOT auto-approved; left pending and
 *                               retried by the sweep; flagged after MAX_ATTEMPTS
 *
 * Every terminal auto-decision is audit-logged; counts + auto-approval rate flow
 * through the WEB-AUTO-001 jobRunner.
 *
 * Modes (request body):
 *   { creativeId }                 -> review ONE creative (real-time; fired by the
 *                                     upload flow — owner JWT, admin, or service)
 *   { action: 'sweep', manual? }   -> batch-review not-yet-reviewed creatives
 *                                     (hourly cron + Job Health re-run; admin/service)
 *
 * Runs under the default verify_jwt=true gateway (NOT listed in config.toml) —
 * matches data-quality-heal / dedupe-content / moderate-content precedent.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, getCorsHeaders } from '../_shared/cors.ts';
import { requireAdminOrApiKey } from '../_shared/apiKeyAuth.ts';
import { checkRateLimitPersistent } from '../_shared/rateLimit.ts';
import { runJob } from '../_shared/jobRunner.ts';
import { getAIConfig, buildLightweightClaudeRequest, getClaudeHeaders } from '../_shared/aiConfig.ts';
import { writeAuditLog, auditIp } from '../_shared/auditLog.ts';

const MAX_ATTEMPTS = 3;
const SWEEP_BATCH = 25;
const FETCH_TIMEOUT_MS = 8000;
const BRAND_SAFETY_THRESHOLD = 0.5; // unsafe >= this holds the creative

/** Allowed pixel dimensions per placement (mirror of src/lib/placementSpecs.ts). */
const PLACEMENT_DIMENSIONS: Record<string, Array<[number, number]>> = {
  top_banner: [[970, 90], [728, 90], [320, 50]],
  featured_spot: [[300, 250], [336, 280]],
  below_fold: [[728, 90], [320, 50]],
  sidebar: [[160, 600]],
  // sponsored_listing uses the listing's own image — no creative image check.
  sponsored_listing: [],
};

/** Campaign states in which an advertiser is "in good standing" for approval. */
const GOOD_STANDING_STATUSES = new Set([
  'draft', 'pending_payment', 'pending_creative', 'pending_review', 'active',
]);

interface Creative {
  id: string;
  campaign_id: string;
  placement_type: string;
  title: string | null;
  description: string | null;
  cta_text: string | null;
  image_url: string | null;
  link_url: string | null;
  dimensions_width: number | null;
  dimensions_height: number | null;
  is_approved: boolean | null;
  auto_reviewed_at: string | null;
  auto_review_attempts: number | null;
  // joined campaign fields
  campaign?: { id: string; user_id: string; name: string; status: string; start_date: string | null } | null;
}

interface Deps {
  url: string;
  serviceKey: string;
  claudeApiKey: string | undefined;
  // deno-lint-ignore no-explicit-any
  supabase: any;
}

type CheckResult = { pass: boolean; reason?: string };
type Decision = 'approved' | 'failed' | 'retry';

const CREATIVE_SELECT =
  'id, campaign_id, placement_type, title, description, cta_text, image_url, link_url, ' +
  'dimensions_width, dimensions_height, is_approved, auto_reviewed_at, auto_review_attempts, ' +
  'campaign:campaigns!campaign_creatives_campaign_id_fkey ( id, user_id, name, status, start_date )';

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}

function clamp01(n: unknown): number {
  const v = Number(n);
  if (!isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

/** Reject obvious internal/SSRF targets and non-http(s) schemes. */
function isPublicHttpsUrl(raw: string, requireHttps = true): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (requireHttps) {
    if (u.protocol !== 'https:') return false;
  } else if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    return false;
  }
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (host === '0.0.0.0' || host === '::1' || host === '[::1]') return false;
  // Block obvious private / link-local IPv4 ranges.
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return false;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return false;
  return true;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** The image must load and be served as an image over https. */
async function checkImageLoads(imageUrl: string | null): Promise<CheckResult> {
  if (!imageUrl) return { pass: false, reason: 'Creative has no image' };
  if (!isPublicHttpsUrl(imageUrl)) return { pass: false, reason: 'Image URL is not a public https URL' };
  try {
    const res = await fetchWithTimeout(imageUrl, { method: 'GET', redirect: 'follow' });
    if (!res.ok) {
      // Drain to free the connection.
      await res.body?.cancel();
      return { pass: false, reason: `Image did not load (HTTP ${res.status})` };
    }
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    await res.body?.cancel();
    if (!ct.startsWith('image/')) return { pass: false, reason: `Image URL did not return an image (${ct || 'unknown type'})` };
    return { pass: true };
  } catch (_e) {
    return { pass: false, reason: 'Image URL could not be reached' };
  }
}

/** Stored dimensions must match an allowed size for the placement. */
function checkDimensions(c: Creative): CheckResult {
  const allowed = PLACEMENT_DIMENSIONS[c.placement_type] ?? [];
  if (allowed.length === 0) return { pass: true }; // placement needs no creative image
  const w = c.dimensions_width ?? 0;
  const h = c.dimensions_height ?? 0;
  if (allowed.some(([aw, ah]) => aw === w && ah === h)) return { pass: true };
  const expected = allowed.map(([aw, ah]) => `${aw}x${ah}`).join(' or ');
  return { pass: false, reason: `Dimensions ${w}x${h} do not match ${c.placement_type} (expected ${expected})` };
}

/** Target URL must be https and resolve, never landing on a disallowed scheme/host. */
async function checkTargetUrl(linkUrl: string | null): Promise<CheckResult> {
  if (!linkUrl) return { pass: false, reason: 'Creative has no target URL' };
  if (!isPublicHttpsUrl(linkUrl)) return { pass: false, reason: 'Target URL must be a public https URL' };
  try {
    let res = await fetchWithTimeout(linkUrl, { method: 'HEAD', redirect: 'follow' });
    if (res.status === 405 || res.status === 501) {
      await res.body?.cancel();
      res = await fetchWithTimeout(linkUrl, { method: 'GET', redirect: 'follow' });
    }
    const finalUrl = res.url || linkUrl;
    await res.body?.cancel();
    if (!isPublicHttpsUrl(finalUrl)) return { pass: false, reason: 'Target URL redirects to a disallowed scheme or host' };
    if (res.status >= 400) return { pass: false, reason: `Target URL did not resolve (HTTP ${res.status})` };
    return { pass: true };
  } catch (_e) {
    return { pass: false, reason: 'Target URL could not be reached' };
  }
}

/**
 * Brand-safety check over the ad's text fields. Returns:
 *   { result: CheckResult }            when the AI ran (pass/fail with a reason)
 *   { result: null }                   when the AI could NOT run (fail-safe: hold)
 */
async function checkBrandSafety(c: Creative, deps: Deps): Promise<{ result: CheckResult | null }> {
  const text = [c.title, c.description, c.cta_text].filter(Boolean).map(String).join('\n').trim();
  if (!text) return { result: { pass: true } }; // nothing to screen (e.g. sponsored listing)
  if (!deps.claudeApiKey) return { result: null };
  try {
    const prompt =
      `You are a brand-safety reviewer for Des Moines Insider, a family-friendly local city guide that ` +
      `displays paid advertisements. Score the advertiser's ad copy on two dimensions, each 0.0 (none) to 1.0 (severe):\n` +
      `- unsafe: hate, harassment, adult/sexual content, weapons, illegal goods, gambling, deceptive or scam claims, ` +
      `misleading health/financial promises\n` +
      `- low_quality: gibberish, ALL CAPS shouting, excessive punctuation, or no discernible offer\n` +
      `Respond with STRICT JSON only: {"unsafe":0.0,"low_quality":0.0,"reasons":["short reason"]}. ` +
      `Only list reasons for dimensions scoring above 0.4.\n\n` +
      `Ad title: ${c.title ?? ''}\nAd description: ${c.description ?? ''}\nCall to action: ${c.cta_text ?? ''}`;

    const config = await getAIConfig(deps.url, deps.serviceKey);
    const headers = await getClaudeHeaders(deps.claudeApiKey, deps.url, deps.serviceKey);
    const reqBody = await buildLightweightClaudeRequest(
      [{ role: 'user', content: prompt }],
      { supabaseUrl: deps.url, supabaseKey: deps.serviceKey, customMaxTokens: 300 },
    );

    const res = await fetch(config.api_endpoint, { method: 'POST', headers, body: JSON.stringify(reqBody) });
    if (!res.ok) return { result: null };
    const data = await res.json();
    const out = data?.content?.[0]?.text ?? '';
    const match = out.match(/\{[\s\S]*\}/);
    if (!match) return { result: null };
    const parsed = JSON.parse(match[0]);
    const unsafe = clamp01(parsed.unsafe);
    const lowQuality = clamp01(parsed.low_quality);
    const reasons: string[] = Array.isArray(parsed.reasons) ? parsed.reasons.map((r: unknown) => String(r)) : [];
    if (unsafe >= BRAND_SAFETY_THRESHOLD || lowQuality >= 0.7) {
      return { result: { pass: false, reason: `Brand-safety: ${reasons.join('; ') || 'ad copy flagged'}` } };
    }
    return { result: { pass: true } };
  } catch (_e) {
    return { result: null };
  }
}

/**
 * After auto-approving a creative, advance the campaign through the same status
 * flow a human approval would (mirror of useAdminCampaigns.approveCreative).
 */
async function progressCampaignAfterApproval(deps: Deps, creative: Creative): Promise<void> {
  const campaign = creative.campaign;
  if (!campaign) return;

  const { data: all } = await deps.supabase
    .from('campaign_creatives')
    .select('is_approved')
    .eq('campaign_id', campaign.id);
  const allApproved = (all ?? []).length > 0 && (all ?? []).every((c: { is_approved: boolean | null }) => c.is_approved);
  if (!allApproved) return;
  if (!['pending_creative', 'pending_review'].includes(campaign.status)) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = campaign.start_date ? new Date(campaign.start_date) : null;
  const nextStatus = startDate && startDate <= today ? 'active' : 'pending_review';

  await deps.supabase
    .from('campaigns')
    .update({ status: nextStatus })
    .eq('id', campaign.id)
    .in('status', ['pending_creative', 'pending_review']);

  // Best-effort advertiser notification (parity with the manual approval flow).
  try {
    await deps.supabase.from('campaign_notifications').insert({
      campaign_id: campaign.id,
      recipient_user_id: campaign.user_id,
      notification_type: nextStatus === 'active' ? 'campaign_activated' : 'creative_approved',
      title: nextStatus === 'active' ? `Campaign Live: ${campaign.name}` : `Creative Approved: ${campaign.name}`,
      message: nextStatus === 'active'
        ? `Your campaign "${campaign.name}" passed automated review and is now live.`
        : `Your ad creative for "${campaign.name}" passed automated review. Your ad will go live on the scheduled start date.`,
      is_read: false,
      metadata: { auto_reviewed: true },
    });
  } catch (_e) { /* notifications table optional */ }
}

/** Review one already-fetched creative. Returns the decision. */
async function reviewCreative(deps: Deps, creative: Creative, req: Request): Promise<Decision> {
  const now = new Date().toISOString();
  const attempts = Number(creative.auto_review_attempts ?? 0) + 1;

  // 1. Advertiser good standing (deterministic).
  const standing: CheckResult = creative.campaign && GOOD_STANDING_STATUSES.has(creative.campaign.status)
    ? { pass: true }
    : { pass: false, reason: creative.campaign ? `Campaign is ${creative.campaign.status}` : 'Owning campaign not found' };

  // 2/3. Image + dimensions + target URL (deterministic / network).
  const needsImage = (PLACEMENT_DIMENSIONS[creative.placement_type] ?? []).length > 0;
  const image: CheckResult = needsImage ? await checkImageLoads(creative.image_url) : { pass: true };
  const dimensions: CheckResult = checkDimensions(creative);
  const urlCheck: CheckResult = await checkTargetUrl(creative.link_url);

  // 4. Brand safety (AI; fail-safe).
  const brand = await checkBrandSafety(creative, deps);

  // AI could not run -> fail-safe: do not auto-approve. Retry on the next sweep;
  // after MAX_ATTEMPTS, hold for a human with a clear reason.
  if (brand.result === null) {
    if (attempts >= MAX_ATTEMPTS) {
      const checks = {
        good_standing: standing, image, dimensions, url: urlCheck,
        brand_safety: { pass: false, reason: 'Brand-safety check unavailable after retries' },
      };
      await deps.supabase.from('campaign_creatives').update({
        auto_reviewed_at: now,
        auto_review_status: 'failed',
        auto_review_attempts: attempts,
        auto_review_reasons: ['Automated brand-safety check unavailable — needs manual review'],
        auto_review_checks: checks,
      }).eq('id', creative.id);
      return 'failed';
    }
    await deps.supabase.from('campaign_creatives')
      .update({ auto_review_attempts: attempts })
      .eq('id', creative.id);
    return 'retry';
  }

  const checks: Record<string, CheckResult> = {
    good_standing: standing,
    image,
    dimensions,
    url: urlCheck,
    brand_safety: brand.result,
  };
  const reasons = Object.values(checks).filter((c) => !c.pass).map((c) => c.reason!).filter(Boolean);
  const allPass = reasons.length === 0;

  if (allPass) {
    await deps.supabase.from('campaign_creatives').update({
      is_approved: true,
      reviewed_at: now,
      rejection_reason: null,
      auto_reviewed_at: now,
      auto_review_status: 'approved',
      auto_review_attempts: attempts,
      auto_review_reasons: [],
      auto_review_checks: checks,
    }).eq('id', creative.id);
    await progressCampaignAfterApproval(deps, creative);
  } else {
    await deps.supabase.from('campaign_creatives').update({
      auto_reviewed_at: now,
      auto_review_status: 'failed',
      auto_review_attempts: attempts,
      auto_review_reasons: reasons,
      auto_review_checks: checks,
    }).eq('id', creative.id);
  }

  // Audit-log the terminal auto-decision.
  await writeAuditLog(deps.supabase, {
    eventType: 'creative_auto_review',
    actorId: null, // system
    action: allPass ? 'creative_auto_approved' : 'creative_auto_held',
    resource: `campaign_creatives:${creative.id}`,
    ipAddress: auditIp(req),
    details: { campaignId: creative.campaign_id, placement: creative.placement_type, checks, reasons },
  });

  return allPass ? 'approved' : 'failed';
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const origin = req.headers.get('origin') || undefined;
  const corsHeaders = getCorsHeaders(origin);

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, corsHeaders);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const claudeApiKey =
    Deno.env.get('ANTHROPIC_API_KEY') || Deno.env.get('CLAUDE_API') || Deno.env.get('CLAUDE_API_KEY');
  const supabase = createClient(url, serviceKey);
  const deps: Deps = { url, serviceKey, claudeApiKey, supabase };

  let body: Record<string, unknown> = {};
  try {
    const raw = await req.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, corsHeaders);
  }

  const action = (body.action as string) || (body.creativeId ? 'review' : 'sweep');

  // --- Batch sweep of not-yet-reviewed creatives (cron + admin re-run) ------
  if (action === 'sweep') {
    const fail = await requireAdminOrApiKey(req, corsHeaders);
    if (fail) return fail;

    const result = await runJob('review-campaign-creative', async (ctx) => {
      const counts = { approved: 0, failed: 0, retry: 0 };
      const { data, error } = await supabase
        .from('campaign_creatives')
        .select(CREATIVE_SELECT)
        .is('auto_reviewed_at', null)
        .neq('is_approved', true)
        .order('created_at', { ascending: true })
        .limit(SWEEP_BATCH);
      if (error) throw new Error(`campaign_creatives fetch: ${error.message}`);
      for (const row of (data ?? []) as Creative[]) {
        const d = await reviewCreative(deps, row, req);
        counts[d]++;
        ctx.processed(1);
      }
      const decided = counts.approved + counts.failed;
      ctx.meta({
        mode: 'sweep',
        ...counts,
        autoApprovalRate: decided > 0 ? Math.round((counts.approved / decided) * 100) / 100 : null,
      });
      return counts;
    });

    return json(result.ok ? { success: true, ...result.result } : { error: result.error }, result.ok ? 200 : 500, corsHeaders);
  }

  // --- Single real-time review (fired by the upload flow) -------------------
  const creativeId = body.creativeId as string;
  if (!creativeId) return json({ error: 'creativeId is required' }, 400, corsHeaders);

  const { data: creative, error: cErr } = await supabase
    .from('campaign_creatives')
    .select(CREATIVE_SELECT)
    .eq('id', creativeId)
    .maybeSingle<Creative>();
  if (cErr || !creative) return json({ error: 'Creative not found' }, 404, corsHeaders);

  // AuthZ: service/API key, OR the owning advertiser, OR an admin.
  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const apiKey = req.headers.get('X-API-Key') || req.headers.get('x-api-key');
  const isInternal =
    (apiKey && apiKey === Deno.env.get('EDGE_FUNCTION_API_KEY')) ||
    (bearer && bearer === serviceKey);

  if (!isInternal) {
    if (!bearer) return json({ error: 'Authentication required' }, 401, corsHeaders);
    const { data: userRes } = await supabase.auth.getUser(bearer);
    const uid = userRes?.user?.id;
    if (!uid) return json({ error: 'Invalid token' }, 401, corsHeaders);
    if (uid !== creative.campaign?.user_id) {
      const { data: roleRow } = await supabase.from('user_roles').select('role').eq('user_id', uid).maybeSingle();
      if (!roleRow || !['admin', 'root_admin'].includes(roleRow.role)) {
        return json({ error: 'Not authorized for this creative' }, 403, corsHeaders);
      }
    }
    // Bound Claude/network cost per advertiser.
    const rl = await checkRateLimitPersistent(req, { endpoint: 'review-campaign-creative', userId: uid, windowMs: 60_000, max: 20 });
    if (!rl.success && rl.response) return rl.response;
  }

  // Idempotent: only review creatives not already auto-reviewed or human-approved.
  if (creative.auto_reviewed_at || creative.is_approved) {
    return json({ skipped: true, reason: 'Creative already reviewed' }, 200, corsHeaders);
  }

  const result = await runJob('review-campaign-creative', async (ctx) => {
    const d = await reviewCreative(deps, creative, req);
    ctx.processed(1);
    ctx.meta({ mode: 'single', creativeId, decision: d });
    return { decision: d };
  });

  return json(result.ok ? { success: true, ...result.result } : { error: result.error }, result.ok ? 200 : 500, corsHeaders);
});
