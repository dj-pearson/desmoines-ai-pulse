/**
 * review-campaign-creative (WEB-AUTO-010)
 *
 * Automated review of advertiser ad creatives so approval happens in seconds
 * instead of "when the admin next logs in". On each campaign_creatives insert an
 * AFTER INSERT trigger enqueues this function (server-side, service-role bearer)
 * which runs four checks:
 *
 *   1. image          loads, meets the placement's dimensions, under the size cap
 *   2. target_url     https + resolves (SSRF-guarded, no scheme downgrade)
 *   3. brand_safety   Claude rates the title/description/CTA for brand safety
 *   4. advertiser     account in good standing (no pattern of rejected creatives)
 *
 * Verdict -> campaign_creatives.auto_review_status:
 *   passed  all checks cleared -> is_approved=true (the public-serving gate that
 *           get_active_ads reads, UNCHANGED) -> campaign flows to its normal status
 *   failed  a deterministic check failed -> stays pending, machine-readable
 *           reasons surfaced in AdminCampaigns; admin can still override
 *   error   a check couldn't be evaluated (AI down etc.) -> stays pending for a
 *           human (fail-SAFE: uncertainty NEVER auto-approves an unreviewed ad)
 *
 * Modes (POST body):
 *   { creativeId }   single creative. Auth: service/API key (the DB trigger +
 *                    cron), OR an admin, OR the owning advertiser.
 *   { mode:'sweep' } | { manual:true }   re-review creatives stuck pending/error
 *                    (the fail-safe net + the Job Health re-run button).
 *                    Auth: admin/service only.
 *
 * Pause: feature_flags.campaign_creative_autoreview_enabled = false -> leave
 * creatives pending for MANUAL review (a creative gate must never trust-through
 * to auto-approve; pausing falls back to the old fully-manual behavior).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, getCorsHeaders } from '../_shared/cors.ts';
import { requireAdminOrApiKey } from '../_shared/apiKeyAuth.ts';
import { checkRateLimitPersistent } from '../_shared/rateLimit.ts';
import { runJob } from '../_shared/jobRunner.ts';

type SupabaseClient = ReturnType<typeof createClient>;
type Verdict = 'passed' | 'failed' | 'error';

const PAUSE_FLAG = 'campaign_creative_autoreview_enabled';
const SWEEP_BATCH = 25;
const MODEL = 'claude-3-haiku-20240307';
// Advertiser standing: this many rejected creatives within the window = not in
// good standing (queue for manual review rather than auto-approve).
const REJECTION_WINDOW_DAYS = 90;
const REJECTION_LIMIT = 3;

/** Minimal mirror of src/lib/placementSpecs.ts (the validation-relevant subset). */
const PLACEMENT_SPECS: Record<string, { dimensions: Array<[number, number]>; maxSize: number; noCreativeRequired?: boolean }> = {
  top_banner: { dimensions: [[970, 90], [728, 90], [320, 50]], maxSize: 512000 },
  featured_spot: { dimensions: [[300, 250], [336, 280]], maxSize: 307200 },
  below_fold: { dimensions: [[728, 90], [320, 50]], maxSize: 409600 },
  sidebar: { dimensions: [[160, 600]], maxSize: 409600 },
  sponsored_listing: { dimensions: [], maxSize: 0, noCreativeRequired: true },
};

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}

interface CheckResult {
  name: string;
  pass: boolean;
  error: boolean; // true = couldn't evaluate (not a definitive fail)
  reasons: string[];
  detail?: Record<string, unknown>;
}

interface CreativeRow {
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
  file_size: number | null;
  is_approved: boolean | null;
}

// ---------------------------------------------------------------------------
// SSRF-safe URL liveness (target URL check).
// ---------------------------------------------------------------------------
function isSafeHttpsUrl(raw: string): { ok: boolean; reason?: string } {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: 'Destination URL is malformed' };
  }
  if (u.protocol !== 'https:') {
    return { ok: false, reason: `Destination URL must use https (got ${u.protocol.replace(':', '') || 'no scheme'})` };
  }
  const host = u.hostname.toLowerCase();
  // Block localhost / link-local / private + cloud-metadata targets (SSRF).
  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === '169.254.169.254' ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === '::1' ||
    host === '0.0.0.0'
  ) {
    return { ok: false, reason: `Destination host "${host}" is not publicly reachable` };
  }
  return { ok: true };
}

async function checkTargetUrl(linkUrl: string | null, requireUrl: boolean): Promise<CheckResult> {
  if (!linkUrl) {
    return requireUrl
      ? { name: 'target_url', pass: false, error: false, reasons: ['Destination URL is missing'] }
      : { name: 'target_url', pass: true, error: false, reasons: [], detail: { skipped: 'no url required' } };
  }
  const safe = isSafeHttpsUrl(linkUrl);
  if (!safe.ok) {
    return { name: 'target_url', pass: false, error: false, reasons: [safe.reason!] };
  }
  // Liveness: HEAD then GET. Re-validate the FINAL url so a redirect to http
  // or a private host is caught.
  try {
    const probe = async (method: string) =>
      await fetch(linkUrl, { method, redirect: 'follow', signal: AbortSignal.timeout(8000) });
    let res: Response;
    try {
      res = await probe('HEAD');
      if (res.status >= 400) res = await probe('GET');
    } catch {
      res = await probe('GET');
    }
    const finalSafe = isSafeHttpsUrl(res.url || linkUrl);
    if (!finalSafe.ok) {
      return { name: 'target_url', pass: false, error: false, reasons: [`After redirects, ${finalSafe.reason}`] };
    }
    if (res.status >= 200 && res.status < 400) {
      return { name: 'target_url', pass: true, error: false, reasons: [], detail: { status: res.status, finalUrl: res.url } };
    }
    return { name: 'target_url', pass: false, error: false, reasons: [`Destination URL returned HTTP ${res.status}`], detail: { status: res.status } };
  } catch (_e) {
    // Network failure to reach the advertiser's URL is a definitive "can't verify
    // it resolves" — treat as a fail (advertiser fixes/resubmits), not an error.
    return { name: 'target_url', pass: false, error: false, reasons: ['Destination URL could not be reached'] };
  }
}

// ---------------------------------------------------------------------------
// Image check: loads, dimensions match the placement, under the size cap.
// ---------------------------------------------------------------------------
async function checkImage(creative: CreativeRow): Promise<CheckResult> {
  const spec = PLACEMENT_SPECS[creative.placement_type];
  if (spec?.noCreativeRequired) {
    return { name: 'image', pass: true, error: false, reasons: [], detail: { skipped: 'no creative required' } };
  }
  if (!creative.image_url) {
    return { name: 'image', pass: false, error: false, reasons: ['Creative image is missing'] };
  }
  const reasons: string[] = [];

  // Size cap (uploader enforces, but re-verify server-side).
  if (spec && creative.file_size && creative.file_size > spec.maxSize) {
    reasons.push(`Image is ${Math.round(creative.file_size / 1024)}KB, over the ${Math.round(spec.maxSize / 1024)}KB limit for ${creative.placement_type}`);
  }

  // Dimensions must match one of the placement's allowed sizes.
  if (spec && spec.dimensions.length > 0) {
    const w = creative.dimensions_width;
    const h = creative.dimensions_height;
    if (!w || !h) {
      reasons.push('Image dimensions are unknown and could not be verified');
    } else {
      const match = spec.dimensions.some(([dw, dh]) => dw === w && dh === h);
      if (!match) {
        const expected = spec.dimensions.map(([dw, dh]) => `${dw}x${dh}`).join(' or ');
        reasons.push(`Image is ${w}x${h}; expected ${expected} for ${creative.placement_type}`);
      }
    }
  }

  // Image actually loads and is an image.
  try {
    const res = await fetch(creative.image_url, { method: 'GET', signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      reasons.push(`Image URL returned HTTP ${res.status}`);
    } else {
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (!ct.startsWith('image/')) {
        reasons.push(`Image URL is not an image (content-type: ${ct || 'unknown'})`);
      }
    }
    try { await res.body?.cancel(); } catch { /* ignore */ }
  } catch (_e) {
    reasons.push('Image URL could not be loaded');
  }

  return { name: 'image', pass: reasons.length === 0, error: false, reasons };
}

// ---------------------------------------------------------------------------
// Brand-safety check (Claude). error:true when the AI can't be reached.
// ---------------------------------------------------------------------------
async function checkBrandSafety(creative: CreativeRow): Promise<CheckResult> {
  const text = [creative.title, creative.description, creative.cta_text].filter(Boolean).join('\n').trim();
  if (!text) {
    return { name: 'brand_safety', pass: true, error: false, reasons: [], detail: { skipped: 'no text' } };
  }
  const key = Deno.env.get('ANTHROPIC_API_KEY') || Deno.env.get('CLAUDE_API') || Deno.env.get('CLAUDE_API_KEY');
  if (!key) {
    return { name: 'brand_safety', pass: false, error: true, reasons: ['Brand-safety AI is not configured'] };
  }
  const prompt =
    `You are a brand-safety reviewer for advertisements on a family-friendly local ` +
    `events & restaurants website serving Des Moines, Iowa. Review this ad copy and ` +
    `decide if it is safe to display. Flag: hate/harassment, adult/sexual content, ` +
    `illegal goods/services, weapons, gambling, deceptive or scam claims, ` +
    `cryptocurrency/get-rich-quick schemes, or misleading clickbait.\n` +
    `Respond with STRICT JSON only: ` +
    `{"brand_safe":boolean,"risk":number,"reasons":string[]} where risk is 0.0-1.0.\n\n` +
    `AD COPY:\n${text.slice(0, 2000)}`;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 300, messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { name: 'brand_safety', pass: false, error: true, reasons: ['Brand-safety AI request failed'] };
    const data = await res.json();
    const raw = data?.content?.[0]?.text ?? '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { name: 'brand_safety', pass: false, error: true, reasons: ['Brand-safety AI returned no verdict'] };
    const parsed = JSON.parse(match[0]);
    const safe = parsed.brand_safe === true;
    const risk = typeof parsed.risk === 'number' ? parsed.risk : (safe ? 0 : 1);
    const reasons = Array.isArray(parsed.reasons) ? parsed.reasons.map(String).slice(0, 6) : [];
    return {
      name: 'brand_safety',
      pass: safe,
      error: false,
      reasons: safe ? [] : (reasons.length ? reasons : ['Ad copy flagged as not brand-safe']),
      detail: { risk },
    };
  } catch (_e) {
    return { name: 'brand_safety', pass: false, error: true, reasons: ['Brand-safety AI could not be reached'] };
  }
}

// ---------------------------------------------------------------------------
// Advertiser standing: a pattern of recently rejected creatives = manual review.
// ---------------------------------------------------------------------------
async function checkAdvertiserStanding(supabase: SupabaseClient, advertiserId: string | null): Promise<CheckResult> {
  if (!advertiserId) {
    return { name: 'advertiser_standing', pass: false, error: true, reasons: ['Advertiser could not be identified'] };
  }
  try {
    const since = new Date(Date.now() - REJECTION_WINDOW_DAYS * 86400_000).toISOString();
    // Campaigns owned by this advertiser.
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('id')
      .eq('user_id', advertiserId);
    const ids = (campaigns ?? []).map((c: { id: string }) => c.id);
    if (ids.length === 0) {
      return { name: 'advertiser_standing', pass: true, error: false, reasons: [], detail: { rejected: 0 } };
    }
    const { count } = await supabase
      .from('campaign_creatives')
      .select('id', { count: 'exact', head: true })
      .in('campaign_id', ids)
      .not('rejection_reason', 'is', null)
      .gte('reviewed_at', since);
    const rejected = count ?? 0;
    if (rejected >= REJECTION_LIMIT) {
      return {
        name: 'advertiser_standing',
        pass: false,
        error: false,
        reasons: [`Advertiser has ${rejected} rejected creatives in the last ${REJECTION_WINDOW_DAYS} days — manual review required`],
        detail: { rejected },
      };
    }
    return { name: 'advertiser_standing', pass: true, error: false, reasons: [], detail: { rejected } };
  } catch (_e) {
    return { name: 'advertiser_standing', pass: false, error: true, reasons: ['Advertiser standing could not be evaluated'] };
  }
}

async function isPaused(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase
    .from('feature_flags')
    .select('enabled')
    .eq('flag_key', PAUSE_FLAG)
    .maybeSingle<{ enabled: boolean }>();
  return data?.enabled === false;
}

/** After an auto-approval, advance the campaign exactly like approveCreative does. */
async function cascadeCampaignStatus(supabase: SupabaseClient, campaignId: string): Promise<void> {
  const { data: creatives } = await supabase
    .from('campaign_creatives')
    .select('is_approved')
    .eq('campaign_id', campaignId);
  const allApproved = (creatives ?? []).length > 0 && (creatives ?? []).every((c: { is_approved: boolean | null }) => c.is_approved === true);
  if (!allApproved) return;

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('start_date, status')
    .eq('id', campaignId)
    .maybeSingle<{ start_date: string | null; status: string }>();
  if (!campaign) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startsToday = campaign.start_date ? new Date(campaign.start_date) <= today : false;
  const nextStatus = startsToday ? 'active' : 'pending_review';

  await supabase
    .from('campaigns')
    .update({ status: nextStatus })
    .eq('id', campaignId)
    .in('status', ['pending_creative', 'pending_review']);
}

/** Review one creative end-to-end. Returns the verdict. */
async function reviewOne(
  supabase: SupabaseClient,
  creativeId: string,
  paused: boolean,
): Promise<{ verdict: Verdict | 'paused' | 'notfound'; reasons?: string[] }> {
  const { data } = await supabase
    .from('campaign_creatives')
    .select('id, campaign_id, placement_type, title, description, cta_text, image_url, link_url, dimensions_width, dimensions_height, file_size, is_approved')
    .eq('id', creativeId)
    .maybeSingle<CreativeRow>();
  if (!data) return { verdict: 'notfound' };

  // Never touch an already-approved creative (don't churn admin decisions).
  if (data.is_approved === true) return { verdict: 'passed' };

  if (paused) {
    await supabase
      .from('campaign_creatives')
      .update({
        auto_review_status: 'pending',
        auto_review_reasons: ['Auto-review paused — awaiting manual review'],
        auto_reviewed_at: new Date().toISOString(),
      } as never)
      .eq('id', creativeId);
    return { verdict: 'paused' };
  }

  const spec = PLACEMENT_SPECS[data.placement_type];
  const requireUrl = !spec?.noCreativeRequired; // sponsored listings link to their own page

  const checks: CheckResult[] = [];
  checks.push(await checkImage(data));
  checks.push(await checkTargetUrl(data.link_url, requireUrl));
  checks.push(await checkBrandSafety(data));
  checks.push(await checkAdvertiserStanding(supabase, await advertiserOf(supabase, data.campaign_id)));

  const hardFails = checks.filter((c) => !c.pass && !c.error);
  const errors = checks.filter((c) => c.error);

  let verdict: Verdict;
  if (hardFails.length > 0) verdict = 'failed';
  else if (errors.length > 0) verdict = 'error';
  else verdict = 'passed';

  const reasons = [...hardFails, ...errors].flatMap((c) => c.reasons);
  const checkDetail = Object.fromEntries(checks.map((c) => [c.name, { pass: c.pass, error: c.error, reasons: c.reasons, ...(c.detail ?? {}) }]));

  const patch: Record<string, unknown> = {
    auto_review_status: verdict,
    auto_review_reasons: reasons,
    auto_review_checks: checkDetail,
    auto_reviewed_at: new Date().toISOString(),
  };

  if (verdict === 'passed') {
    // is_approved is the public-serving gate get_active_ads reads. reviewed_by
    // stays NULL to mark a system (vs admin) decision.
    patch.is_approved = true;
    patch.reviewed_at = new Date().toISOString();
    patch.rejection_reason = null;
  }

  await supabase.from('campaign_creatives').update(patch as never).eq('id', creativeId);

  if (verdict === 'passed') {
    await cascadeCampaignStatus(supabase, data.campaign_id);
  }

  return { verdict, reasons };
}

async function advertiserOf(supabase: SupabaseClient, campaignId: string): Promise<string | null> {
  const { data } = await supabase
    .from('campaigns')
    .select('user_id')
    .eq('id', campaignId)
    .maybeSingle<{ user_id: string | null }>();
  return data?.user_id ?? null;
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const origin = req.headers.get('origin') || undefined;
  const corsHeaders = getCorsHeaders(origin);

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, corsHeaders);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(url, serviceKey);

  let body: { creativeId?: string; mode?: string; manual?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, corsHeaders);
  }

  // ----- Sweep mode: re-review stuck pending/error creatives. -----------------
  if (body.mode === 'sweep' || body.manual === true) {
    const authFailure = await requireAdminOrApiKey(req, corsHeaders);
    if (authFailure) return authFailure;

    const result = await runJob('review-campaign-creative', async (ctx) => {
      const paused = await isPaused(supabase);
      const { data: rows } = await supabase
        .from('campaign_creatives')
        .select('id')
        .in('auto_review_status', ['pending', 'error'])
        .eq('is_approved', false)
        .order('created_at', { ascending: true })
        .limit(SWEEP_BATCH);
      const ids = (rows ?? []) as { id: string }[];

      const counts = { passed: 0, failed: 0, error: 0, paused: 0, notfound: 0 };
      for (const r of ids) {
        const { verdict } = await reviewOne(supabase, r.id, paused);
        counts[verdict]++;
        if (verdict === 'error') ctx.failed(1);
        else if (verdict !== 'notfound') ctx.processed(1);
      }
      const reviewed = counts.passed + counts.failed;
      ctx.meta({ mode: 'sweep', paused, scanned: ids.length, ...counts, autoApprovalRate: reviewed > 0 ? counts.passed / reviewed : null });
      return { scanned: ids.length, ...counts };
    });

    return json({ success: result.ok, ...result.result }, result.ok ? 200 : 500, corsHeaders);
  }

  // ----- Single mode: one creative. -------------------------------------------
  const creativeId = body.creativeId;
  if (!creativeId) return json({ error: 'creativeId is required' }, 400, corsHeaders);

  // AuthZ: internal (service/API key) OR an admin OR the owning advertiser.
  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const apiKey = req.headers.get('X-API-Key') || req.headers.get('x-api-key');
  const isInternal = (apiKey && apiKey === Deno.env.get('EDGE_FUNCTION_API_KEY')) || (bearer && bearer === serviceKey);

  if (!isInternal) {
    if (!bearer) return json({ error: 'Authentication required' }, 401, corsHeaders);
    const { data: userRes } = await supabase.auth.getUser(bearer);
    const uid = userRes?.user?.id;
    if (!uid) return json({ error: 'Invalid token' }, 401, corsHeaders);

    const { data: creativeRow } = await supabase
      .from('campaign_creatives')
      .select('campaign_id')
      .eq('id', creativeId)
      .maybeSingle<{ campaign_id: string }>();
    if (!creativeRow) return json({ error: 'Creative not found' }, 404, corsHeaders);

    const ownerId = await advertiserOf(supabase, creativeRow.campaign_id);
    if (ownerId !== uid) {
      const { data: roleRow } = await supabase.from('user_roles').select('role').eq('user_id', uid).maybeSingle();
      if (!roleRow || !['admin', 'root_admin'].includes(roleRow.role)) {
        return json({ error: 'Not authorized for this creative' }, 403, corsHeaders);
      }
    }
    // Bound AI/fetch cost per user.
    const rl = await checkRateLimitPersistent(req, { endpoint: 'review-campaign-creative', userId: uid, windowMs: 60_000, max: 30 });
    if (!rl.success && rl.response) return rl.response;
  }

  const result = await runJob('review-campaign-creative', async (ctx) => {
    const paused = await isPaused(supabase);
    const { verdict, reasons } = await reviewOne(supabase, creativeId, paused);
    if (verdict === 'error') ctx.failed(1);
    else if (verdict !== 'notfound') ctx.processed(1);
    ctx.meta({ mode: 'single', creativeId, verdict, paused, autoApprovalRate: verdict === 'passed' ? 1 : verdict === 'failed' ? 0 : null });
    return { verdict, reasons };
  });

  if (!result.ok) return json({ error: result.error, verdict: 'error' }, 500, corsHeaders);
  return json({ success: true, ...result.result }, 200, corsHeaders);
});
