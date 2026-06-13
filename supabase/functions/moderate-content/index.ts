/**
 * moderate-content (WEB-AUTO-009)
 *
 * AI auto-moderation for user-generated content — reviews (user_ratings) and
 * contact/feedback submissions (contact_submissions). A Claude moderation prompt
 * scores toxicity / spam / off-topic 0.0-1.0, then:
 *   - toxicity >= 0.7 OR spam >= 0.6  -> REJECTED  (stored, hidden, kept for audit)
 *   - toxicity >= 0.5 OR spam >= 0.45 -> FLAGGED   (stored hidden + queued for a human)
 *   - otherwise                       -> APPROVED  (published immediately)
 * Fail-open with flag: if the AI call errors the row stays 'pending' (hidden,
 * never auto-published) and is retried by the hourly sweep; after MAX_ATTEMPTS it
 * is flagged for a human. A review with no text is approved without an AI call.
 *
 * Modes (request body):
 *   { contentType, id }                          -> moderate ONE row (real-time,
 *                                                    fired by the write path; may be
 *                                                    anonymous — rate-limited, no admin gate)
 *   { action: 'sweep', manual? }                 -> batch-moderate pending rows
 *                                                    (hourly cron + Job Health re-run; admin/service)
 *   { action: 'decision', contentType, id,       -> admin override (approve/reject),
 *     decision }                                     audit-logged (admin/service)
 *
 * Runs under the default verify_jwt=true gateway: anonymous web callers carry the
 * anon-key JWT (passes the gateway); cron carries the service-role bearer. NOT
 * listed in config.toml — matches data-quality-heal / dedupe-content precedent.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, getCorsHeaders } from '../_shared/cors.ts';
import { requireAdminOrApiKey } from '../_shared/apiKeyAuth.ts';
import { checkRateLimitPersistent } from '../_shared/rateLimit.ts';
import { runJob } from '../_shared/jobRunner.ts';
import { getAIConfig, buildLightweightClaudeRequest, getClaudeHeaders } from '../_shared/aiConfig.ts';
import { writeAuditLog, auditIp } from '../_shared/auditLog.ts';

const REJECT_TOXICITY = 0.7;
const REJECT_SPAM = 0.6;
const FLAG_TOXICITY = 0.5;
const FLAG_SPAM = 0.45;
const MAX_ATTEMPTS = 3;
const SWEEP_BATCH = 25;

type ContentType = 'review' | 'contact';
type Decision = 'approved' | 'rejected' | 'flagged' | 'pending';

interface Scores {
  toxicity: number;
  spam: number;
  off_topic: number;
  reasons: string[];
}

interface Deps {
  url: string;
  serviceKey: string;
  claudeApiKey: string | undefined;
  // deno-lint-ignore no-explicit-any
  supabase: any;
}

const TABLES: Record<ContentType, { table: string; select: string; kind: string; textOf: (r: Record<string, unknown>) => string }> = {
  review: {
    table: 'user_ratings',
    select: 'id, review_text, moderation_status, moderation_attempts',
    kind: 'review',
    textOf: (r) => String(r.review_text ?? '').trim(),
  },
  contact: {
    table: 'contact_submissions',
    select: 'id, subject, message, status, moderation_status, moderation_attempts',
    kind: 'contact / feedback message',
    textOf: (r) => [r.subject, r.message].filter(Boolean).map(String).join('\n').trim(),
  },
};

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}

function clamp01(n: unknown): number {
  const v = Number(n);
  if (!isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function decide(s: Scores): Exclude<Decision, 'pending'> {
  if (s.toxicity >= REJECT_TOXICITY || s.spam >= REJECT_SPAM) return 'rejected';
  if (s.toxicity >= FLAG_TOXICITY || s.spam >= FLAG_SPAM) return 'flagged';
  return 'approved';
}

/**
 * Score content with Claude. Returns null when the AI could not screen the text
 * (no key, API error, unparseable response) so the caller can fail OPEN (keep the
 * row pending/hidden, never auto-publish).
 */
async function scoreContent(text: string, kind: string, deps: Deps): Promise<Scores | null> {
  if (!deps.claudeApiKey) return null;
  try {
    const prompt =
      `You are a strict but fair content-moderation system for Des Moines Insider, a family-friendly local city guide. ` +
      `Score the following user-submitted ${kind} on three dimensions, each from 0.0 (none) to 1.0 (severe):\n` +
      `- toxicity: hate speech, harassment, threats, slurs, sexually explicit content\n` +
      `- spam: ads, scams, promotional links, phishing, repetitive or gibberish text\n` +
      `- off_topic: unrelated to a local venue/event/business or to contacting the site\n` +
      `Respond with STRICT JSON only: {"toxicity":0.0,"spam":0.0,"off_topic":0.0,"reasons":["short reason"]}. ` +
      `Keep reasons brief and only list dimensions that scored above 0.4.\n\n` +
      `Content:\n${text.slice(0, 4000)}`;

    const config = await getAIConfig(deps.url, deps.serviceKey);
    const headers = await getClaudeHeaders(deps.claudeApiKey, deps.url, deps.serviceKey);
    const reqBody = await buildLightweightClaudeRequest(
      [{ role: 'user', content: prompt }],
      { supabaseUrl: deps.url, supabaseKey: deps.serviceKey, customMaxTokens: 300 },
    );

    const res = await fetch(config.api_endpoint, { method: 'POST', headers, body: JSON.stringify(reqBody) });
    if (!res.ok) return null;
    const data = await res.json();
    const out = data?.content?.[0]?.text ?? '';
    const match = out.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    return {
      toxicity: clamp01(parsed.toxicity),
      spam: clamp01(parsed.spam),
      off_topic: clamp01(parsed.off_topic),
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons.map((r: unknown) => String(r)).slice(0, 6) : [],
    };
  } catch (_e) {
    return null;
  }
}

/** Moderate a single already-fetched row. Returns the final decision. */
async function moderateRow(deps: Deps, contentType: ContentType, row: Record<string, unknown>): Promise<Decision> {
  const conf = TABLES[contentType];
  const now = new Date().toISOString();
  const attempts = Number(row.moderation_attempts ?? 0) + 1;
  const text = conf.textOf(row);

  // A bare star rating (no text) has nothing to moderate — approve directly.
  if (contentType === 'review' && !text) {
    await deps.supabase.from(conf.table).update({
      moderation_status: 'approved',
      moderation_attempts: attempts,
      moderated_at: now,
    }).eq('id', row.id);
    return 'approved';
  }

  const scores = await scoreContent(text, conf.kind, deps);

  // Fail-open: keep hidden-pending; retry on the next sweep; flag after MAX_ATTEMPTS.
  if (!scores) {
    if (attempts >= MAX_ATTEMPTS) {
      await deps.supabase.from(conf.table).update({
        moderation_status: 'flagged',
        moderation_attempts: attempts,
        moderated_at: now,
        moderation_reasons: ['Automated moderation unavailable after retries — needs manual review'],
      }).eq('id', row.id);
      return 'flagged';
    }
    await deps.supabase.from(conf.table).update({ moderation_attempts: attempts }).eq('id', row.id);
    return 'pending';
  }

  const decision = decide(scores);
  const patch: Record<string, unknown> = {
    moderation_status: decision,
    moderation_scores: { toxicity: scores.toxicity, spam: scores.spam, off_topic: scores.off_topic },
    moderation_reasons: scores.reasons,
    moderation_attempts: attempts,
    moderated_at: now,
  };
  // Mirror an auto-rejected contact submission into the existing spam workflow.
  if (contentType === 'contact' && decision === 'rejected') patch.status = 'spam';

  await deps.supabase.from(conf.table).update(patch).eq('id', row.id);
  return decision;
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

  const action =
    (body.action as string) || (body.id && body.contentType ? 'moderate' : 'sweep');

  // --- Admin override (approve/reject a queued item), audit-logged ---------
  if (action === 'decision') {
    const fail = await requireAdminOrApiKey(req, corsHeaders);
    if (fail) return fail;

    const contentType = body.contentType as ContentType;
    const id = body.id as string;
    const decision = body.decision as 'approve' | 'reject';
    if (!TABLES[contentType] || !id || !['approve', 'reject'].includes(decision)) {
      return json({ error: 'contentType, id and decision (approve|reject) are required' }, 400, corsHeaders);
    }

    // Resolve the acting admin for the audit trail (null when called with a key).
    let actorId: string | null = null;
    const authHeader = req.headers.get('Authorization') || '';
    const bearer = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
    if (bearer && bearer !== serviceKey) {
      const { data: userRes } = await supabase.auth.getUser(bearer);
      actorId = userRes?.user?.id ?? null;
    }

    const conf = TABLES[contentType];
    const newStatus = decision === 'approve' ? 'approved' : 'rejected';
    const patch: Record<string, unknown> = { moderation_status: newStatus, moderated_at: new Date().toISOString() };
    if (contentType === 'contact') patch.status = decision === 'approve' ? 'new' : 'spam';

    const { error: updErr } = await supabase.from(conf.table).update(patch).eq('id', id);
    if (updErr) return json({ error: 'Update failed' }, 500, corsHeaders);

    await writeAuditLog(supabase, {
      eventType: 'content_moderation',
      actorId,
      action: `moderation_${decision}`,
      resource: `${conf.table}:${id}`,
      ipAddress: auditIp(req),
      details: { contentType, decision, newStatus },
    });

    return json({ success: true, id, moderation_status: newStatus }, 200, corsHeaders);
  }

  // --- Batch sweep of pending rows (cron + admin re-run) -------------------
  if (action === 'sweep') {
    const fail = await requireAdminOrApiKey(req, corsHeaders);
    if (fail) return fail;

    const result = await runJob('moderate-content', async (ctx) => {
      const counts: Record<Decision, number> = { approved: 0, rejected: 0, flagged: 0, pending: 0 };
      for (const ct of Object.keys(TABLES) as ContentType[]) {
        const conf = TABLES[ct];
        const { data, error } = await supabase
          .from(conf.table)
          .select(conf.select)
          .eq('moderation_status', 'pending')
          .order('created_at', { ascending: true })
          .limit(SWEEP_BATCH);
        if (error) throw new Error(`${conf.table} fetch: ${error.message}`);
        for (const row of (data ?? []) as Record<string, unknown>[]) {
          const d = await moderateRow(deps, ct, row);
          counts[d]++;
          ctx.processed(1);
        }
      }
      ctx.meta({ mode: 'sweep', ...counts });
      return counts;
    });

    return json(result.ok ? { success: true, ...result.result } : { error: result.error }, result.ok ? 200 : 500, corsHeaders);
  }

  // --- Single real-time moderation (write path; may be anonymous) ----------
  const contentType = body.contentType as ContentType;
  const id = body.id as string;
  if (!TABLES[contentType] || !id) {
    return json({ error: 'contentType (review|contact) and id are required' }, 400, corsHeaders);
  }

  // Bound Claude cost. No admin gate: triggering moderation can only hide/flag a
  // row (never publish), so it is safe for the row's author or an anonymous
  // contact submitter to fire it. Fails open if the limiter DB is unavailable.
  const rl = await checkRateLimitPersistent(req, { endpoint: 'moderate-content', windowMs: 60_000, max: 30 });
  if (!rl.success && rl.response) return rl.response;

  const conf = TABLES[contentType];
  const { data: row, error: rowErr } = await supabase
    .from(conf.table)
    .select(conf.select)
    .eq('id', id)
    .maybeSingle();
  if (rowErr || !row) return json({ error: 'Content not found' }, 404, corsHeaders);

  // Idempotent: only moderate pending rows (re-calls on a decided row are no-ops).
  if (row.moderation_status !== 'pending') {
    return json({ skipped: true, reason: `moderation_status is ${row.moderation_status}` }, 200, corsHeaders);
  }

  const result = await runJob('moderate-content', async (ctx) => {
    const d = await moderateRow(deps, contentType, row as Record<string, unknown>);
    ctx.processed(1);
    ctx.meta({ mode: 'single', contentType, decision: d, id });
    return { decision: d };
  });

  return json(result.ok ? { success: true, ...result.result } : { error: result.error }, result.ok ? 200 : 500, corsHeaders);
});
