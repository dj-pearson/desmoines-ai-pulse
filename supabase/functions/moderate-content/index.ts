/**
 * moderate-content (WEB-AUTO-009)
 *
 * AI auto-moderation seam for user-generated content. Scores toxicity / spam /
 * off-topic with Claude, then:
 *   - clean                          -> approved (content becomes visible),
 *   - toxicity 0.5-0.7 / borderline  -> flagged  (hidden, queued for an admin),
 *   - toxicity >= 0.7 OR spam >= 0.6 -> rejected (hidden, polite message),
 *   - AI error                       -> stays hidden-pending, recorded as
 *                                       'error' for an admin (fail-open w/ flag).
 *
 * One content_moderation row per item holds the scores + verdict + admin
 * override; the per-table moderation_status column is the visibility gate.
 *
 * Modes (POST body):
 *   { contentType, contentId }  single item. Auth: service/API key (cron +
 *                               contact DB trigger), OR the content owner (a
 *                               review author invoking inline), OR an admin.
 *                               Returns { decision } so the web client can show
 *                               a polite message.
 *   { mode: 'sweep' }           re-moderate reviews stuck in 'pending' (the
 *                               fail-open safety net). Auth: admin/service only.
 *
 * Pause: feature_flags.content_moderation_enabled = false -> everything is
 * approved (moderation off = trust-through; content never gets stuck hidden).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, getCorsHeaders } from '../_shared/cors.ts';
import { requireAdminOrApiKey } from '../_shared/apiKeyAuth.ts';
import { checkRateLimitPersistent } from '../_shared/rateLimit.ts';
import { runJob } from '../_shared/jobRunner.ts';
import { fetchWithTimeout } from '../_shared/fetchWithTimeout.ts';
import { getAnthropicApiKey } from '../_shared/aiConfig.ts';

type SupabaseClient = ReturnType<typeof createClient>;
type ContentType = 'review' | 'contact';
type Verdict = 'approved' | 'flagged' | 'rejected' | 'error';

const PAUSE_FLAG = 'content_moderation_enabled';
const SWEEP_BATCH = 25;     // reviews re-moderated per sweep run
const MODEL = 'claude-sonnet-5';

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}

interface Scores {
  toxicity: number;
  spam: number;
  off_topic: number;
  reasons: string[];
  ok: boolean; // false when the AI call failed (fail-open with flag)
}

/** Decision bands (acceptance criteria thresholds). */
function decide(s: Scores): Verdict {
  if (!s.ok) return 'error';
  if (s.toxicity >= 0.7 || s.spam >= 0.6) return 'rejected';
  if (s.toxicity >= 0.5 || s.spam >= 0.4 || s.off_topic >= 0.7) return 'flagged';
  return 'approved';
}

function clamp01(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

/** Claude moderation scoring. Returns ok:false (NOT throwing) when AI errors. */
async function scoreText(text: string, kind: ContentType): Promise<Scores> {
  const key = getAnthropicApiKey();
  if (!key) return { toxicity: 0, spam: 0, off_topic: 0, reasons: [], ok: false };
  const context =
    kind === 'review'
      ? 'a user review on a family-friendly local events & restaurants site'
      : 'a contact/feedback message sent to a local events & restaurants site';
  const prompt =
    `You are a content-moderation classifier for ${context}. Rate the text on three ` +
    `dimensions from 0.0 (none) to 1.0 (severe):\n` +
    `- toxicity: hate, harassment, threats, slurs, explicit sexual content.\n` +
    `- spam: advertising, scams, link farming, gibberish, repeated promotion.\n` +
    `- off_topic: unrelated to local events/restaurants/the site.\n` +
    `Respond with STRICT JSON only: ` +
    `{"toxicity":number,"spam":number,"off_topic":number,"reasons":string[]}.\n\n` +
    `TEXT:\n${text.slice(0, 4000)}`;
  try {
    const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 300, messages: [{ role: 'user', content: prompt }] }),
    }, 60_000);
    if (!res.ok) return { toxicity: 0, spam: 0, off_topic: 0, reasons: [], ok: false };
    const data = await res.json();
    const raw = data?.content?.[0]?.text ?? '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { toxicity: 0, spam: 0, off_topic: 0, reasons: [], ok: false };
    const parsed = JSON.parse(match[0]);
    return {
      toxicity: clamp01(parsed.toxicity),
      spam: clamp01(parsed.spam),
      off_topic: clamp01(parsed.off_topic),
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons.map(String).slice(0, 6) : [],
      ok: true,
    };
  } catch (_e) {
    return { toxicity: 0, spam: 0, off_topic: 0, reasons: [], ok: false };
  }
}

/** Pull the text + a short excerpt for a content item. Null = row not found. */
async function loadItem(
  supabase: SupabaseClient,
  contentType: ContentType,
  contentId: string,
): Promise<{ text: string; excerpt: string } | null> {
  if (contentType === 'review') {
    const { data } = await supabase
      .from('user_ratings')
      .select('review_text, moderation_status')
      .eq('id', contentId)
      .maybeSingle<{ review_text: string | null }>();
    if (!data) return null;
    const text = (data.review_text ?? '').trim();
    return { text, excerpt: text.slice(0, 140) };
  }
  const { data } = await supabase
    .from('contact_submissions')
    .select('name, subject, message, inquiry_type')
    .eq('id', contentId)
    .maybeSingle<{ name: string | null; subject: string | null; message: string | null; inquiry_type: string | null }>();
  if (!data) return null;
  const text = [data.subject, data.message].filter(Boolean).join('\n').trim();
  return { text, excerpt: (data.subject || data.message || '').slice(0, 140) };
}

/** Persist the verdict to content_moderation + the content table's gate. */
async function applyVerdict(
  supabase: SupabaseClient,
  contentType: ContentType,
  contentId: string,
  verdict: Verdict,
  scores: Scores,
  excerpt: string,
): Promise<void> {
  await supabase
    .from('content_moderation' as never)
    .upsert(
      {
        content_type: contentType,
        content_id: contentId,
        status: verdict,
        toxicity: scores.ok ? scores.toxicity : null,
        spam: scores.ok ? scores.spam : null,
        off_topic: scores.ok ? scores.off_topic : null,
        reasons: scores.reasons,
        excerpt,
        decided_kind: 'system',
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: 'content_type,content_id' } as never,
    );

  // 'error' leaves the content hidden-pending (don't flip its visibility).
  if (verdict === 'error') return;

  if (contentType === 'review') {
    await supabase.from('user_ratings').update({ moderation_status: verdict }).eq('id', contentId);
  } else {
    const patch: Record<string, unknown> = { moderation_status: verdict };
    if (verdict === 'rejected') patch.status = 'spam'; // sync the FeedbackInbox spam filter
    await supabase.from('contact_submissions').update(patch).eq('id', contentId);
  }
}

/** Force-approve (pause mode): moderation off = trust-through. */
async function approveItem(supabase: SupabaseClient, contentType: ContentType, contentId: string, excerpt: string) {
  await supabase
    .from('content_moderation' as never)
    .upsert(
      {
        content_type: contentType,
        content_id: contentId,
        status: 'approved',
        reasons: ['moderation paused'],
        excerpt,
        decided_kind: 'system',
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: 'content_type,content_id' } as never,
    );
  const table = contentType === 'review' ? 'user_ratings' : 'contact_submissions';
  await supabase.from(table).update({ moderation_status: 'approved' }).eq('id', contentId);
}

async function isPaused(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase
    .from('feature_flags')
    .select('enabled')
    .eq('flag_key', PAUSE_FLAG)
    .maybeSingle<{ enabled: boolean }>();
  return data?.enabled === false;
}

/** Moderate a single item end-to-end. Returns the verdict. */
async function moderateOne(
  supabase: SupabaseClient,
  contentType: ContentType,
  contentId: string,
  paused: boolean,
): Promise<{ decision: Verdict; scores?: Scores }> {
  const item = await loadItem(supabase, contentType, contentId);
  if (!item) return { decision: 'error' };

  if (paused) {
    await approveItem(supabase, contentType, contentId, item.excerpt);
    return { decision: 'approved' };
  }

  // Empty text (rating with no review body) is trivially clean.
  if (!item.text) {
    const clean: Scores = { toxicity: 0, spam: 0, off_topic: 0, reasons: [], ok: true };
    await applyVerdict(supabase, contentType, contentId, 'approved', clean, item.excerpt);
    return { decision: 'approved', scores: clean };
  }

  const scores = await scoreText(item.text, contentType);
  const decision = decide(scores);
  await applyVerdict(supabase, contentType, contentId, decision, scores, item.excerpt);
  return { decision, scores };
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

  let body: { contentType?: string; contentId?: string; mode?: string; manual?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, corsHeaders);
  }

  // ----- Sweep mode: re-moderate stuck-pending reviews (admin/service only). --
  // `manual: true` (the Job Health re-run button) also triggers a sweep.
  if (body.mode === 'sweep' || body.manual === true) {
    const authFailure = await requireAdminOrApiKey(req, corsHeaders);
    if (authFailure) return authFailure;

    const result = await runJob('moderate-content', async (ctx) => {
      const paused = await isPaused(supabase);
      const { data: pendingRows } = await supabase
        .from('user_ratings')
        .select('id')
        .eq('moderation_status', 'pending')
        .order('created_at', { ascending: true })
        .limit(SWEEP_BATCH);
      const rows = (pendingRows ?? []) as { id: string }[];

      const counts: Record<Verdict, number> = { approved: 0, flagged: 0, rejected: 0, error: 0 };
      for (const r of rows) {
        const { decision } = await moderateOne(supabase, 'review', r.id, paused);
        counts[decision]++;
        if (decision === 'error') ctx.failed(1);
        else ctx.processed(1);
      }
      ctx.meta({ mode: 'sweep', paused, scanned: rows.length, ...counts });
      return { scanned: rows.length, ...counts };
    });

    return json({ success: result.ok, ...result.result }, result.ok ? 200 : 500, corsHeaders);
  }

  // ----- Single mode: one item, owner/admin/internal. ------------------------
  const contentType = body.contentType as ContentType | undefined;
  const contentId = body.contentId;
  if (contentType !== 'review' && contentType !== 'contact') {
    return json({ error: 'contentType must be review or contact' }, 400, corsHeaders);
  }
  if (!contentId) return json({ error: 'contentId is required' }, 400, corsHeaders);

  // AuthZ: internal (service/API key) OR the content owner OR an admin.
  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const apiKey = req.headers.get('X-API-Key') || req.headers.get('x-api-key');
  const isInternal =
    (apiKey && apiKey === Deno.env.get('EDGE_FUNCTION_API_KEY')) || (bearer && bearer === serviceKey);

  if (!isInternal) {
    if (!bearer) return json({ error: 'Authentication required' }, 401, corsHeaders);
    const { data: userRes } = await supabase.auth.getUser(bearer);
    const uid = userRes?.user?.id;
    if (!uid) return json({ error: 'Invalid token' }, 401, corsHeaders);

    const ownerTable = contentType === 'review' ? 'user_ratings' : 'contact_submissions';
    const { data: ownerRow } = await supabase.from(ownerTable).select('user_id').eq('id', contentId).maybeSingle<{ user_id: string | null }>();
    if (!ownerRow) return json({ error: 'Content not found' }, 404, corsHeaders);

    if (ownerRow.user_id !== uid) {
      // WEB-BE-032: .limit(1) - user_roles has no UNIQUE(user_id), so a
      // duplicate row makes maybeSingle() error and silently denies an admin.
      const { data: roleRow } = await supabase.from('user_roles').select('role').eq('user_id', uid).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (!roleRow || !['admin', 'root_admin'].includes(roleRow.role)) {
        return json({ error: 'Not authorized for this content' }, 403, corsHeaders);
      }
    }
    // Bound Claude cost per user.
    const rl = await checkRateLimitPersistent(req, { endpoint: 'moderate-content', userId: uid, windowMs: 60_000, max: 20 });
    if (!rl.success && rl.response) return rl.response;
  }

  const result = await runJob('moderate-content', async (ctx) => {
    const paused = await isPaused(supabase);
    const { decision, scores } = await moderateOne(supabase, contentType, contentId, paused);
    if (decision === 'error') ctx.failed(1);
    else ctx.processed(1);
    ctx.meta({ mode: 'single', contentType, contentId, decision, paused, ...(scores ? { toxicity: scores.toxicity, spam: scores.spam } : {}) });
    return { decision };
  });

  if (!result.ok) return json({ error: result.error, decision: 'error' }, 500, corsHeaders);
  return json({ success: true, ...result.result }, 200, corsHeaders);
});
